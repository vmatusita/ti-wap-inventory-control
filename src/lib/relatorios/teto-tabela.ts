import type { CorteDeTabela, TabelasTruncadas } from '@/lib/relatorios/tipos'

// F60 (fato 16 · PLAN-F60 §10, decisão 6) — O TETO DAS TRÊS TABELAS DO RELATÓRIO, com aviso.
//
// Saídas, Entradas e Transferências liam o período INTEIRO por `paginarTodos`, sem teto próprio:
// o único limite era o do domínio (`CAP_MOVIMENTACOES`, 100.000), que LANÇA — ou seja, um período
// grande o bastante derrubaria o relatório inteiro, e bem antes disso a página já mandaria para o
// navegador dezenas de milhares de linhas que ninguém lê numa tela. O molde do conserto é a fila de
// consolidação (`queries/colaboradores.ts`, `TETO_FILA`): a LISTA tem teto, a tela AVISA quando
// cortou, e o número que se afirma vem do banco, não da lista cortada.
//
// Este módulo é a metade PURA disso (sem banco, sem React) — a janela da leitura, a decisão do
// corte e a forma do que vai para o snapshot —, para as três ficarem travadas por teste. A leitura
// mora em `queries/relatorios/movimentacoes.ts`; o aviso, em `components/relatorios/aviso-teto-tabela.tsx`.

/**
 * O teto de linhas por tabela. A conta (PLAN-F60 §3.5, B5): a maior tabela medida em produção em
 * 16/09/2026, na janela de 365 dias, tem **155** linhas (Saídas, consolidado) → 2.000 dá ~13× de
 * folga. Não é a régua 20× dos tetos de `paginarTodos` (`queries/relatorios/comum.ts`), e a
 * diferença é de natureza: aqueles LANÇAM, e um teto que dispara em operação legítima vira exceção
 * na cara do gestor; este CORTA e AVISA, então passar dele é degradar com honestidade, não quebrar.
 * O número é o de uma tabela que ainda se lê, filtra e imprime — não o de um limite de segurança.
 */
export const TETO_LINHAS_TABELA = 2_000

function conferirTeto(teto: number): void {
  if (!Number.isSafeInteger(teto) || teto <= 0)
    throw new Error(`Teto de linhas da tabela inválido (${teto}) — use TETO_LINHAS_TABELA.`)
}

/**
 * A janela OFFSET `[from, to]` que não passa de `limite` linhas no total — ou `null` quando a
 * leitura já chegou lá e a página seguinte tem de voltar VAZIA sem ir ao banco.
 *
 * É o que deixa a leitura das tabelas reusar `paginarTodos` inteiro — o teto de linhas OBSERVADO do
 * PostgREST, a página curta como fim, a guarda do `cap` — sem trazer o período todo: o `from` que
 * `paginarTodos` passa é o número de linhas já lidas, então encurtar o `to` para `limite − 1` faz
 * a última página vir curta (e o laço parar nela), e recusar o `from` que já chegou ao limite cobre
 * o caso em que a divisão coube exata e nenhuma página veio curta para avisar.
 */
export function janelaAteOLimite(
  from: number,
  to: number,
  limite: number,
): readonly [number, number] | null {
  conferirTeto(limite)
  if (from >= limite) return null
  return [from, Math.min(to, limite - 1)]
}

type RespostaDePagina<Row> = { data: readonly Row[] | null; error: { message: string } | null }

/**
 * Embrulha uma página OFFSET de `paginarTodos` para ela nunca ler além de `limite` linhas (ver
 * `janelaAteOLimite`). A página devolvida tem a MESMA forma da recebida, então o tipo da linha que
 * o supabase-js infere do `select` atravessa o embrulho sem cast.
 */
export function paginaAteOLimite<Row>(
  fazPagina: (from: number, to: number) => PromiseLike<RespostaDePagina<Row>>,
  limite: number,
): (from: number, to: number) => PromiseLike<RespostaDePagina<Row>> {
  conferirTeto(limite)
  return (from, to) => {
    const janela = janelaAteOLimite(from, to, limite)
    if (!janela) return Promise.resolve({ data: [], error: null })
    return fazPagina(janela[0], janela[1])
  }
}

/**
 * A decisão do corte sobre o que a leitura trouxe — que é, por construção, no máximo `teto + 1`
 * linhas (a linha a mais é a PROVA de que o período passa do teto, sem contar nada).
 *
 * · até `teto` → todas ficam, `cortou: false` (o total é o tamanho da lista, e é exato);
 * · `teto + 1` → ficam as `teto` primeiras (a ordem da consulta é a das mais recentes), `cortou:
 *   true` — e só aí quem chama paga o `count` que dá o total;
 * · mais que `teto + 1` → LANÇA: a janela da leitura falhou, e seguir afirmaria um corte sobre uma
 *   leitura que não se sabe onde parou.
 */
export function decidirCorte<T>(
  lidas: readonly T[],
  teto: number,
): { linhas: T[]; cortou: boolean } {
  conferirTeto(teto)
  if (lidas.length > teto + 1)
    throw new Error(
      `A tabela leu ${lidas.length} linhas com teto ${teto}: a leitura devia parar em ${teto + 1}.`,
    )
  return lidas.length > teto
    ? { linhas: lidas.slice(0, teto), cortou: true }
    : { linhas: [...lidas], cortou: false }
}

/**
 * O corte que vai para a tela e para o snapshot: `mostradas` é o teto, `total` é o `count exact` da
 * mesma consulta. Recusa o total que não prova o corte — `null` (o PostgREST não contou) ou `≤ teto`
 * (a contagem, feita DEPOIS da leitura, achou menos linhas do que a leitura acabou de ver: o acervo
 * mudou entre as duas idas, por uma exclusão da Zona destrutiva). Nos dois casos, escrever "as N
 * mais recentes de T" afirmaria um T que não é o do período; é melhor falhar e o recarregar resolver.
 */
export function corteComTotal(teto: number, total: number | null): CorteDeTabela {
  conferirTeto(teto)
  if (total === null)
    throw new Error('A contagem exata da tabela não voltou — o total do período é desconhecido.')
  if (total <= teto)
    throw new Error(
      `A contagem exata da tabela (${total}) não passa do teto (${teto}) que a leitura acabou de ` +
        'ultrapassar — as movimentações do período mudaram entre as duas leituras. Recarregue.',
    )
  return { mostradas: teto, total }
}

/**
 * Monta a chave opcional do snapshot só com as tabelas cortadas; `undefined` quando nenhuma foi —
 * e aí quem monta o snapshot NÃO escreve a chave (o `undefined` some no `JSON.stringify`, mas o
 * espalhamento condicional deixa isso explícito no código, como `serieEstado`).
 */
export function montarTabelasTruncadas(cortes: TabelasTruncadas): TabelasTruncadas | undefined {
  const saida: TabelasTruncadas = {}
  if (cortes.saidas) saida.saidas = cortes.saidas
  if (cortes.entradas) saida.entradas = cortes.entradas
  if (cortes.transferencias) saida.transferencias = cortes.transferencias
  return Object.keys(saida).length > 0 ? saida : undefined
}

/**
 * O número que se diz da tabela — no título da seção e no chip-âncora do topo. Com corte, o total
 * exato do período; sem corte, o tamanho da lista, que aí É o total. Nunca o tamanho da lista
 * cortada: esse é o número truncado com cara de certo que o teto não pode criar.
 */
export function totalDaTabela(linhas: readonly unknown[], corte: CorteDeTabela | undefined): number {
  return corte ? corte.total : linhas.length
}
