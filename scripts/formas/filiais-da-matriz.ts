// =============================================================================
// filiais-da-matriz.ts — as listas de filiais que montam as células do conferidor (F60)
// =============================================================================
// POR QUE ISTO SAIU DE `conferir.mts`
//
// Revisão do lote 1 (revisor 3, achado 4, 16/09/2026). A matriz `filiais` das `rel_*_filiais` nasceu
// no lote 1 lendo `todasAsFiliais` com `(… ).data ?? []` — o `error` descartado. Se aquela leitura
// falhasse, a célula "consolidado" recebia `p_filiais: []`, a RPC devolvia zero linhas POR CONSTRUÇÃO
// (lista vazia é "nenhuma", não "tudo" — é a regra da fase), e o ponto saía VERDE: `count` 0, lidas 0,
// e a regra de não-provado do conferidor só dispara com `count > 0`. A matriz antiga, com `null`, lia o
// acervo inteiro no mesmo tropeço — o modo de falha era novo, e calado.
//
// O conserto é na ORIGEM, falha fechada: a leitura que monta células não descarta erro, e o
// consolidado não existe vazio. A régua é a de `filiaisDoConsolidado`
// (`src/lib/queries/relatorios/recorte-filiais.ts`) — `count` exato na MESMA consulta, e lança se as
// linhas lidas não forem todas —, mais uma que só o conferidor precisa: a lista do consolidado tem de
// ter ao menos uma filial, senão a célula prova nada. Módulo à parte, e PURO, porque `conferir.mts`
// fala com o banco no topo do arquivo e não se importa num teste. As mensagens trazem só contagens e o
// código do erro — a saída do conferidor nunca carrega valor.
// =============================================================================

export type RespostaDeFiliais = {
  readonly data: readonly { readonly id: number }[] | null
  readonly error: { readonly code?: string } | null
  readonly count?: number | null
}

/** Os ids lidos — ou LANÇA: erro, ou `count` exato ausente/diferente das linhas (truncado pelo `max-rows`). */
export function idsDeFiliais(resposta: RespostaDeFiliais, rotulo: string): number[] {
  if (resposta.error) throw new Error(`${rotulo}: a leitura de filiais falhou (${resposta.error.code ?? '?'}) — sem a lista, nenhuma célula prova nada.`)
  const ids = (resposta.data ?? []).map((f) => f.id)
  if (resposta.count === undefined || resposta.count === null || resposta.count !== ids.length) {
    throw new Error(`${rotulo}: ${ids.length} de ${resposta.count ?? '?'} filiais lidas — a lista truncada daria células que não cobrem o que dizem.`)
  }
  return ids
}

/** A lista do CONSOLIDADO: `idsDeFiliais` e, além, nunca vazia — `p_filiais: []` dá zero linhas por construção. */
export function listaDoConsolidado(resposta: RespostaDeFiliais, rotulo: string): number[] {
  const ids = idsDeFiliais(resposta, rotulo)
  if (ids.length === 0) {
    throw new Error(`${rotulo}: nenhuma filial no alvo — o consolidado é a lista de TODAS, e a lista vazia é "nenhuma" (0 linhas por construção), não "tudo".`)
  }
  return ids
}
