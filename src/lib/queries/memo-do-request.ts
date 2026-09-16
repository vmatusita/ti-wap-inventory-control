import 'server-only'
import {
  chaveDasUnidades,
  type FamiliaDeUnidade,
  type UnidadesEfetivas,
} from '@/lib/auth/recorte-leitura'

// A MEMÓRIA DE UM REQUEST para leituras recortadas por unidade (F60 · fato 12 · PLAN §10, decisão 6).
//
// O PROBLEMA MEDIDO. `contarConflitosAbertos` roda DUAS vezes no mesmo request do dashboard: uma no
// layout do grupo `(app)` (o selo da sidebar) e outra na página (a linha de conflitos do card de
// Pendências) — as duas com a MESMA vista, mas cada uma com a sua `UnidadesEfetivas`, porque
// `efetivar` sempre embrulha um objeto novo. `cache(contarConflitosAbertos)` não resolveria: o
// `cache()` do React compara argumento por `Object.is` (doc oficial, `reference/react/cache.md`), e
// dois objetos distintos nunca são o mesmo argumento. Medido na F60: o memo pelo objeto dá DUAS
// leituras; pela chave, UMA (`memo-do-request.test.ts`, com a sabotagem I gravada na evidência).
//
// O DESENHO, e por que ele tem duas metades separadas:
//
//  · o ARMAZÉM é um `Map` por request, entregue por quem chama — na produção,
//    `cache(() => new Map())` no escopo do módulo da query. É o `cache()` do React que dá a
//    validade POR REQUEST ("React will invalidate the cache for all memoized functions for each
//    server request"): nada aqui é global, e um conflito resolvido aparece no request seguinte.
//    Um `cache()` SEM argumento devolve o mesmo `Map` durante o request inteiro — é a forma de ter
//    uma memória por request que aceita chave primitiva sem passar pela comparação de objeto.
//    Fora de um render de Server Component (uma Server Action, um script, o Vitest) o `cache()`
//    não memoiza: cada chamada ganha um `Map` novo, e a leitura acontece sempre — correta, só sem
//    o desconto.
//  · a CHAVE é `chaveDasUnidades` — primitiva, lida no único módulo que enxerga a marca. A leitura
//    de verdade recebe o OBJETO que chegou (o primeiro da chave), nunca um reconstruído: fora de
//    `efetivar` não existe `UnidadesEfetivas`, e esta memória não abre essa porta.
//
// O que se guarda é a PROMESSA, não o número: a segunda chamada pode chegar enquanto a primeira
// ainda está no ar, e tem de pegar a mesma leitura em voo, e não disparar outra porque o valor
// ainda não voltou. (O teste chama as duas no mesmo `Promise.all` justamente para cobrir esse caso.)
//
// ⚠ Uma rejeição também fica guardada até o fim do request — o mesmo contrato do `cache()` do React
// ("errors thrown by fn are also cached"). Leitura que precise de nova tentativa no mesmo request
// não passa por aqui. `contarConflitosAbertos` não rejeita (engole o erro e devolve 0), então o
// contrato não muda nada para ela.
//
// ⚠ NUNCA para vínculo nem cargo (ADR-002 §4, F49): `acesso.ts` memoiza só o que não muda de
// sentido entre o layout e a página. Esta memória é para CONTAGEM de acervo recortada, e só.

/** A memória de um request: chave primitiva → a leitura em voo (ou já resolvida). */
export type ArmazemDoRequest<T> = () => Map<string, Promise<T>>

/**
 * `ler`, memoizada por request pela chave das unidades. `armazem` tem de devolver o MESMO `Map`
 * durante um request — na produção, `cache(() => new Map())` declarado no escopo do módulo (cada
 * `cache()` tem memória própria, e um criado dentro de função seria novo a cada chamada).
 */
export function memoizarPorUnidades<F extends FamiliaDeUnidade, T>(
  armazem: ArmazemDoRequest<T>,
  ler: (unidades: UnidadesEfetivas<F>) => Promise<T>,
): (unidades: UnidadesEfetivas<F>) => Promise<T> {
  return (unidades) => {
    const memoria = armazem()
    const chave = chaveDasUnidades(unidades)
    const emVoo = memoria.get(chave)
    if (emVoo !== undefined) return emVoo
    const leitura = ler(unidades)
    memoria.set(chave, leitura)
    return leitura
  }
}
