// As duas travas de FORMA da observabilidade (F55 · Frente A).
//
// POR QUE ELAS EXISTEM
// --------------------
// Até 10/09/2026 uma falha do lado do servidor virava um `console.error` solto,
// em 76 lugares, cada um no formato que quem escreveu escolheu — e SEIS blocos
// `} catch {` em Server Actions engoliam a exceção sem deixar rastro nenhum
// (`actions/conflitos.ts`, quatro em `actions/importar.ts`, `actions/termos.ts`).
// A F55 criou o funil (`src/lib/observabilidade.ts`) e migrou os 76. Estas duas
// travas são o que impede os dois defeitos de voltarem na semana seguinte.
//
// ⚠ ELAS NASCERAM VERMELHAS, DE PROPÓSITO (regra 4 do §4 do PLANO-MULTIEMPRESA:
// "trava antes da correção, sempre que a trava puder nascer vermelha"). A saída
// das duas contra o repositório de ANTES da migração está em
// `docs/f55-evidencias/`.
//
// MOLDE: `src/lib/use-server-exports.ts` (F13) — leitura textual do fonte, sem
// parser de TypeScript (não há um na stack fechada do CLAUDE.md, e nem é
// preciso). Daqui se importa `limpar` e `ehModuloUseServer`/`ehModuloUseClient`,
// nunca uma segunda cópia deles: duas neutralizações de comentário é como uma
// das duas envelhece sem ninguém notar (o argumento que já fez `limpar` virar
// export na F49).
//
// LIMITAÇÕES ACEITAS (custo de um falso positivo = teste vermelho, não produção
// quebrada):
//  · `console` acessado por índice (`globalThis['con'+'sole']`) escapa — e é
//    exatamente o tipo de coisa que ninguém escreve por engano;
//  · a extensão de uma função exportada é medida por balanceamento de chaves
//    sobre o fonte NEUTRALIZADO (comentário e conteúdo de string apagados), o
//    que é exato para todo código que o repositório escreve.

import {
  ehModuloUseClient,
  ehModuloUseServer,
  limpar,
} from '@/lib/use-server-exports'

export { ehModuloUseClient, ehModuloUseServer }

/** Uma chamada de `console.*` achada no CÓDIGO (nunca em comentário nem em string). */
export type ChamadaConsole = {
  /** Linha 1-indexed, a mesma que o editor mostra. */
  linha: number
  /** `error`, `warn`, `log`, … — o método chamado. */
  metodo: string
  /** A linha normalizada, para a mensagem do teste. */
  trecho: string
}

// `console.<ident>` seguido de `(` — a CHAMADA, não a menção ao objeto.
const RE_CONSOLE = /\bconsole\s*\.\s*([A-Za-z0-9_$]+)\s*\(/g

/**
 * As chamadas de `console.*` que sobrevivem à neutralização — ou seja, as que
 * são código de verdade. Comentário e conteúdo de string não contam: o
 * repositório tem quatro `console.error` citados em comentário (`actions/
 * relatorios.ts`, `queries/relatorios/estoque.ts`, `.../itens.ts`,
 * `.../snapshot.ts`) e eles nunca foram chamadas.
 */
export function chamadasDeConsole(fonte: string): ChamadaConsole[] {
  const limpo = limpar(fonte, true)
  const linhasOriginais = fonte.split('\n')
  const achados: ChamadaConsole[] = []
  RE_CONSOLE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RE_CONSOLE.exec(limpo)) !== null) {
    const linha = limpo.slice(0, m.index).split('\n').length
    achados.push({
      linha,
      metodo: m[1],
      trecho: (linhasOriginais[linha - 1] ?? '').trim().replace(/\s+/g, ' ').slice(0, 120),
    })
  }
  return achados
}

/** Um `} catch {` SEM binding dentro de uma função exportada. */
export type CatchEngolidor = {
  /** Linha 1-indexed do `catch`. */
  linha: number
  /** Nome da função exportada que o contém. */
  funcao: string
  /** A linha normalizada, para a mensagem do teste. */
  trecho: string
}

// `export [default] [async] function nome(` no TOPO do arquivo (coluna 0). Um
// `export` indentado está dentro de `declare module { … }` — forma que não
// existe no repositório, e a mesma limitação que `use-server-exports.ts` aceita.
const RE_EXPORT_FUNCAO = /^export\s+(?:default\s+)?(?:async\s+)?function\s*(\*?\s*[A-Za-z0-9_$]*)/gm

// `catch` seguido direto de `{` — sem `(erro)`. É a forma que descarta a
// exceção sem deixar como registrá-la.
const RE_CATCH_SEM_BINDING = /\bcatch\s*\{/g

/** Índice do `}` que fecha o `{` em `abre`, sobre fonte já neutralizado. */
function fimDoBloco(limpo: string, abre: number): number {
  let profundidade = 0
  for (let i = abre; i < limpo.length; i++) {
    if (limpo[i] === '{') profundidade++
    else if (limpo[i] === '}') {
      profundidade--
      if (profundidade === 0) return i
    }
  }
  return limpo.length - 1
}

/**
 * Índice do `{` que abre o corpo da função que começa em `inicio`.
 *
 * ⚠ O `<>` do tipo de RETORNO precisa ser contado, e descobri isso do jeito
 * certo — a primeira versão desta função reprovava zero em
 * `src/lib/actions/conflitos.ts`, que tem
 * `): Promise<ConflitoResult<{ ativos: number }>> {`. O `{` de dentro do
 * genérico está em profundidade ZERO de parênteses, então ele era tomado pelo
 * corpo, a faixa da função terminava na PRÓPRIA linha da assinatura, e o
 * `} catch {` da linha 273 ficava "fora de toda função exportada". Uma trava
 * que não acha o defeito que existe é pior que trava nenhuma.
 *
 * `=>` não fecha genérico (é a seta de um tipo de função), e a profundidade
 * nunca desce abaixo de zero — um `>` de comparação solto não desalinha o resto.
 */
function abreDoCorpo(limpo: string, inicio: number): number {
  let parenteses = 0
  let angulo = 0
  let viuParenteses = false
  for (let i = inicio; i < limpo.length; i++) {
    const c = limpo[i]
    if (c === '(') {
      parenteses++
      viuParenteses = true
    } else if (c === ')') parenteses--
    else if (c === '<') angulo++
    else if (c === '>' && limpo[i - 1] !== '=') angulo = Math.max(0, angulo - 1)
    else if (c === '{' && parenteses === 0 && angulo === 0 && viuParenteses) return i
  }
  return -1
}

/**
 * Os `} catch {` sem binding que estão DENTRO de uma função exportada de topo.
 *
 * ⚠ Quem decide se o arquivo é módulo de Server Action é `ehModuloUseServer`, e
 * ela lê a DIRETIVA do prólogo — não a palavra. `src/lib/actions/
 * guardas-de-action.ts` e `src/lib/use-server-exports.ts` falam de `'use
 * server'` em comentário nas primeiras linhas e NÃO são módulos de Server
 * Action: uma detecção por menção acharia 22 módulos onde há 20.
 */
export function catchesEngolidoresEmExportadas(fonte: string): CatchEngolidor[] {
  const limpo = limpar(fonte, true)
  const linhasOriginais = fonte.split('\n')

  // As faixas [inicio, fim] de cada função exportada de topo.
  const faixas: { nome: string; de: number; ate: number }[] = []
  RE_EXPORT_FUNCAO.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RE_EXPORT_FUNCAO.exec(limpo)) !== null) {
    const abre = abreDoCorpo(limpo, m.index)
    if (abre === -1) continue
    faixas.push({
      nome: (m[1] || '').replace(/\*/g, '').trim() || '(default)',
      de: abre,
      ate: fimDoBloco(limpo, abre),
    })
  }

  const achados: CatchEngolidor[] = []
  RE_CATCH_SEM_BINDING.lastIndex = 0
  let c: RegExpExecArray | null
  while ((c = RE_CATCH_SEM_BINDING.exec(limpo)) !== null) {
    const dentro = faixas.find((f) => c!.index > f.de && c!.index < f.ate)
    if (!dentro) continue
    const linha = limpo.slice(0, c.index).split('\n').length
    achados.push({
      linha,
      funcao: dentro.nome,
      trecho: (linhasOriginais[linha - 1] ?? '').trim().replace(/\s+/g, ' ').slice(0, 120),
    })
  }
  return achados
}
