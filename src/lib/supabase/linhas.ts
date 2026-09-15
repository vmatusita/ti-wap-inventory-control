import type { z } from 'zod'
import { registrarFalha } from '@/lib/observabilidade'
import {
  type ConfereLinha,
  type ConfereValor,
  type Conferencia,
  type FormaDeLinha,
  type LinhaConferida,
  ErroDeForma,
  conferirValores,
  modoDaForma,
  problemasDistintos,
} from '@/lib/supabase/forma'

// `linhasDe` / `linhaDe` / `valorDe` — A PORTA DA LEITURA (F58 · Frente C · Decisões 4 e 6).
//
// Toda leitura do Supabase que, até a F58, APAGAVA o tipo com um cast (`(data ?? []) as X[]`,
// `data as unknown as Y`, `r.dados as AnySnapshot`) passa por aqui. O schema que ela recebe está
// AMARRADO, em compilação, ao tipo que o `select` infere (ver `forma.ts`), e a linha que não bate
// com o schema LANÇA — decisão i do Johnny (15/09/2026): forma errada é falha de leitura, com
// `registrarFalha`, nunca "registra e segue".
//
// AS DUAS FORMAS DE CHAMAR, e por que existem as duas. A falha de forma segue o caminho de falha
// que cada leitura JÁ TEM:
//  · `linhasDe`/`linhaDe`/`valorDe` LANÇAM `ErroDeForma` — é o caso de toda leitura que hoje, ao
//    receber `error`, propaga (`if (error) throw …`); a forma errada propaga igual;
//  · `linhasOuFalha`/`linhaOuFalha`/`valorOuFalha` DEVOLVEM `{ ok: false, erro }` — é o caso da
//    leitura que hoje, ao receber `error`, segue um caminho de falha próprio (devolve
//    `{ ok: false }` numa action, degrada um card decorativo). O chamador põe a falha de forma no
//    MESMO caminho da falha de banco; não há `catch` novo engolindo nada.
//
// Nas duas, o `registrarFalha` acontece AQUI, uma vez, com o rótulo da leitura e os caminhos
// normalizados — nunca valor de linha. Quem já loga a própria falha pode logar de novo; o que não
// pode é a falha de forma chegar ao chamador sem ter deixado registro.

export type FalhaDeForma = { readonly ok: false; readonly erro: ErroDeForma }

function exigirModo(forma: FormaDeLinha, rotulo: string): void {
  if (modoDaForma(forma) === null) {
    throw new Error(
      `F58: a forma de "${rotulo}" não declara modo — use z.strictObject (colunas explícitas) ` +
        'ou z.looseObject (select de tudo). O z.object padrão REMOVE coluna em silêncio.',
    )
  }
}

function falhar(rotulo: string, recusas: Conferencia<unknown>['recusas'], lidas: number): FalhaDeForma {
  const erro = new ErroDeForma(rotulo, problemasDistintos(recusas), recusas.length, lidas)
  registrarFalha({
    escopo: `leitura.${rotulo}`,
    erro,
    ctx: { lidas, recusadas: recusas.length, problemas: erro.problemas },
  })
  return { ok: false, erro }
}

// ---------------------------------------------------------------------------
// Várias linhas
// ---------------------------------------------------------------------------

export function linhasOuFalha<L extends object, F extends FormaDeLinha>(
  dados: readonly L[] | null | undefined,
  forma: F & ConfereLinha<L, F>,
  rotulo: string,
): { readonly ok: true; readonly linhas: LinhaConferida<L, F>[] } | FalhaDeForma {
  exigirModo(forma, rotulo)
  const valores = dados ?? []
  const c = conferirValores(valores, forma, ['[]'])
  if (c.recusas.length > 0) return falhar(rotulo, c.recusas, valores.length)
  // A amarração de `ConfereLinha` é a prova de que a saída do schema É a linha conferida.
  return { ok: true, linhas: c.aceitas as LinhaConferida<L, F>[] }
}

/** As linhas de uma leitura, conferidas. Forma errada LANÇA `ErroDeForma`. */
export function linhasDe<L extends object, F extends FormaDeLinha>(
  dados: readonly L[] | null | undefined,
  forma: F & ConfereLinha<L, F>,
  rotulo: string,
): LinhaConferida<L, F>[] {
  // Os argumentos de tipo EXPLÍCITOS não são enfeite: sem eles o compilador reinfere `F` como
  // `F & ConfereLinha<L, F>` na chamada interna, e o tipo de retorno deixa de ser o declarado.
  const r = linhasOuFalha<L, F>(dados, forma, rotulo)
  if (!r.ok) throw r.erro
  return r.linhas
}

// ---------------------------------------------------------------------------
// Uma linha (`.single()` / `.maybeSingle()`)
// ---------------------------------------------------------------------------

export function linhaOuFalha<L extends object, F extends FormaDeLinha>(
  dado: L | null | undefined,
  forma: F & ConfereLinha<L, F>,
  rotulo: string,
): { readonly ok: true; readonly linha: LinhaConferida<L, F> | null } | FalhaDeForma {
  exigirModo(forma, rotulo)
  if (dado === null || dado === undefined) return { ok: true, linha: null }
  const c = conferirValores([dado], forma, [])
  if (c.recusas.length > 0) return falhar(rotulo, c.recusas, 1)
  return { ok: true, linha: c.aceitas[0] as LinhaConferida<L, F> }
}

/** Uma linha conferida, ou `null` quando a leitura não achou nenhuma. Forma errada LANÇA. */
export function linhaDe<L extends object, F extends FormaDeLinha>(
  dado: L | null | undefined,
  forma: F & ConfereLinha<L, F>,
  rotulo: string,
): LinhaConferida<L, F> | null {
  const r = linhaOuFalha<L, F>(dado, forma, rotulo)
  if (!r.ok) throw r.erro
  return r.linha
}

// ---------------------------------------------------------------------------
// Um valor que não é linha: retorno `jsonb` de RPC, escalar
// ---------------------------------------------------------------------------

export function valorOuFalha<V, Z extends z.ZodType>(
  dado: V,
  forma: Z & ConfereValor<V, Z>,
  rotulo: string,
): { readonly ok: true; readonly valor: z.output<Z> } | FalhaDeForma {
  const c = conferirValores([dado], forma as z.ZodType<z.output<Z>>, [])
  if (c.recusas.length > 0) return falhar(rotulo, c.recusas, 1)
  return { ok: true, valor: c.aceitas[0] }
}

/** Um valor lido (retorno `jsonb` de RPC, escalar), conferido. Forma errada LANÇA. */
export function valorDe<V, Z extends z.ZodType>(
  dado: V,
  forma: Z & ConfereValor<V, Z>,
  rotulo: string,
): z.output<Z> {
  const r = valorOuFalha(dado, forma, rotulo)
  if (!r.ok) throw r.erro
  return r.valor
}
