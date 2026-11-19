// A LISTA BRANCA DA PORTA PÚBLICA (F68 · decisão 7; decisão 19/11-2 do Johnny: "sem nomes, como a ficha").
//
// O que o visualizador por senha pode receber pela porta (`relatorio_publico_dados`, migration 0212) — campo a campo. É
// a FONTE ÚNICA: o MESMO JSON vai literal no corpo da função SQL (`k_lista`), e `lista-branca-porta.test.ts` confere os
// dois por igualdade profunda contra o corpo VIGENTE no disco. Dentro do banco, TUDO o que `dados` devolve de tabela
// passa por `relatorio_publico_projetar(valor, lista)`: um objeto só leva as chaves daqui, um array projeta cada
// elemento, uma folha (`true`) só deixa passar escalar. O que não está aqui NÃO SAI — nem se alguém o puser no
// `jsonb_build_object` da função.
//
// A forma: objeto = as chaves permitidas; `[x]` = array cujos elementos seguem `x`; `true` = folha escalar.
//
// O que NÃO sai, com o motivo, está em `CAMPOS_QUE_NAO_SAEM` — e o teste exige que TODO campo da forma Zod do snapshot
// (`FORMA_SNAPSHOT`, schemas 1 e 2, que espelha `tipos.ts` campo a campo) esteja numa das duas listas, e só numa.
//
// ⚠ O TEXTO LIVRE SAI (obs, observacao, obsEnvio, retornoObs, o texto da anotação, chamado): é o conteúdo operacional do
// relatório. Um operador pode ter digitado um nome ali — está declarado em "o que este relatório NÃO prova"
// (docs/RELATORIO-F68.md). Nenhum CAMPO de pessoa sai.
//
// ⚠ Nada de aspa simples nos nomes: o JSON vai dentro de um literal SQL entre aspas simples.

export type Lista = true | readonly [Lista] | { readonly [chave: string]: Lista }

const KPIS = {
  total: true, em_uso: true, em_estoque: true, reservado: true, em_manutencao: true,
  em_triagem: true, defasado: true, emprestado: true,
} as const

const RESUMO_TIPO = {
  total: true,
  filiais: [{ filial: true, total: true, motivos: [{ motivo: true, total: true, categorias: [{ categoria: true, total: true }] }] }],
} as const

/** O snapshot congelado (`relatorios_gerados.dados`), schemas 1 e 2 na MESMA lista (as chaves que só um dos dois tem
 *  simplesmente não aparecem no outro). */
export const LISTA_DO_SNAPSHOT = {
  meta: {
    filialSlug: true, filialNome: true, ehGeral: true, de: true, ate: true,
    periodoRotulo: true, schema: true, observacao: true,
  },
  kpis: KPIS,
  kpisAnterior: KPIS,
  estoquePorCategoria: [{ categoria: true, total: true }],
  estoqueCatStatus: [{ categoria: true, segmentos: [{ status: true, total: true }], total: true }],
  disponiveisPorModelo: [{ categoria: true, modelo: true, modelos: [{ modelo: true, total: true }], total: true }],
  reservados: [{ patrimonio: true, modelo: true, chamado: true, categoria: true }],
  emManutencao: [{ patrimonio: true, modelo: true, observacao: true }],
  manutencao: [{
    patrimonio: true, modelo: true, filial: true, chamado: true, chamadoFornecedor: true,
    dataEnvio: true, diasEmManutencao: true, obsEnvio: true,
    anotacoes: [{ texto: true, em: true }],
    retornoData: true, retornoObs: true, fechado: true, desfecho: true,
  }],
  serieMovimentacoes: { granularidade: true, pontos: [{ chave: true, rotulo: true, saidas: true, devolucoes: true }] },
  serieEstado: { pontos: [{ chave: true, rotulo: true, em_estoque: true }] },
  movimentacoesPorMes: [{ mes: true, saidas: true, devolucoes: true }],
  porMotivo: { saidas: [{ motivo: true, total: true }], devolucoes: [{ motivo: true, total: true }] },
  grupos: [{
    grupo: true,
    itens: [{
      item: true, total: true, estoque: true, saldo: true, minimo: true,
      atrelados: true, falta: true, entradas: true, saidas: true, delta: true, obs: true,
    }],
    ultimoLancamento: true, temAtrelados: true,
  }],
  pendencias: [{ chave: true, rotulo: true, total: true }],
  saidas: [{
    data: true, filial: true, categoria: true, modelo: true, patrimonio: true, tipo: true,
    motivo: true, chamado: true, termo: true, obs: true, estornada: true, estornoData: true,
  }],
  entradas: [{
    data: true, filial: true, categoria: true, modelo: true, patrimonio: true, tipo: true,
    motivo: true, itensFaltantes: [true], obs: true, estornada: true, estornoData: true,
  }],
  transferencias: [{
    data: true, de: true, para: true, categoria: true, modelo: true,
    patrimonio: true, chamado: true, obs: true, estornada: true, estornoData: true,
  }],
  tabelasTruncadas: {
    saidas: { mostradas: true, total: true },
    entradas: { mostradas: true, total: true },
    transferencias: { mostradas: true, total: true },
  },
  movimentacoesItens: [{
    data: true, filial: true, item: true, grupo: true, tipo: true,
    quantidade: true, chamado: true, obs: true, ehEstorno: true, estornada: true, estornoData: true,
  }],
  ultimasMovimentacoes: [{
    data: true, tipo: true, patrimonio: true, ativo: true, categoria: true,
    filial: true, chamado: true, observacao: true,
  }],
  resumo: { de: true, ate: true, saidas: RESUMO_TIPO, devolucoes: RESUMO_TIPO },
} as const

/** A lista inteira, seção por seção — a MESMA do `k_lista` de `relatorio_publico_dados`. */
export const LISTA_BRANCA_PORTA = {
  empresa: { slug: true, nome: true },
  sessao: { empresa: { slug: true, nome: true }, rotulo: true },
  filial: { slug: true, nome: true },
  tipo: { slug: true, rotulo: true },
  linha: {
    id: true, periodo_de: true, periodo_ate: true, versao: true, gerado_em: true,
    filialNome: true, filialSlug: true, temObservacao: true, superada: true,
  },
  gerado: {
    id: true, periodo_de: true, periodo_ate: true, versao: true, gerado_em: true,
    filialNome: true, filialSlug: true,
    versaoMaisNova: { id: true, versao: true },
    anterior: { id: true, periodo_de: true, periodo_ate: true },
    proximo: { id: true, periodo_de: true, periodo_ate: true },
    dados: LISTA_DO_SNAPSHOT,
  },
} as const

/**
 * O que NÃO sai do snapshot, com o motivo — e como o objeto de RENDER o recompõe (as tabelas de `tipos.ts` exigem os
 * campos): `null` (a coluna some da tela com `semPessoas`), `indice` (uma chave React sintética, sem relação com o
 * banco) ou `ausente` (o campo é opcional nos tipos).
 */
export const CAMPOS_QUE_NAO_SAEM = [
  { caminho: 'saidas[].colaboradorSetor', motivo: 'pessoa (colaborador ou setor)', render: 'nulo' },
  { caminho: 'saidas[].id', motivo: 'id interno (a movimentação)', render: 'indice' },
  { caminho: 'saidas[].ativoId', motivo: 'id interno (o ativo — só servia de link para a ficha)', render: 'ausente' },
  { caminho: 'entradas[].colaborador', motivo: 'pessoa (colaborador)', render: 'nulo' },
  { caminho: 'entradas[].setor', motivo: 'pessoa (setor do colaborador)', render: 'nulo' },
  { caminho: 'entradas[].id', motivo: 'id interno (a movimentação)', render: 'indice' },
  { caminho: 'entradas[].ativoId', motivo: 'id interno (o ativo)', render: 'ausente' },
  { caminho: 'transferencias[].id', motivo: 'id interno (a movimentação)', render: 'indice' },
  { caminho: 'transferencias[].ativoId', motivo: 'id interno (o ativo)', render: 'ausente' },
  { caminho: 'movimentacoesItens[].colaborador', motivo: 'pessoa (colaborador)', render: 'nulo' },
  { caminho: 'movimentacoesItens[].id', motivo: 'id interno (o lançamento)', render: 'indice' },
  { caminho: 'manutencao[].anotacoes[].autor', motivo: 'pessoa (autor da anotação, profiles.nome)', render: 'nulo' },
  { caminho: 'manutencao[].ativoId', motivo: 'id interno (o ativo)', render: 'ausente' },
  { caminho: 'ultimasMovimentacoes[].colaborador_setor', motivo: 'pessoa (colaborador ou setor, schema 1)', render: 'nulo' },
  { caminho: 'ultimasMovimentacoes[].id', motivo: 'id interno (a movimentação, schema 1)', render: 'indice' },
] as const

/** Os caminhos que a lista deixa sair (`a.b[].c`), na ordem da lista. */
export function caminhosDaLista(lista: Lista, prefixo = ''): string[] {
  if (lista === true) return [prefixo]
  if (Array.isArray(lista)) return caminhosDaLista(lista[0] as Lista, `${prefixo}[]`)
  return Object.entries(lista as Record<string, Lista>).flatMap(([chave, sub]) =>
    caminhosDaLista(sub, prefixo ? `${prefixo}.${chave}` : chave),
  )
}

/**
 * A segunda linha, no TS: o valor que veio da porta só tem chaves da lista? `false` no primeiro desvio (uma chave fora,
 * ou um objeto/array onde a lista espera escalar). Quem recebe `false` FALHA FECHADO — não renderiza.
 */
export function cabeNaLista(valor: unknown, lista: Lista): boolean {
  if (valor === null || valor === undefined) return true
  if (lista === true) return typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean'
  if (Array.isArray(lista)) return Array.isArray(valor) && valor.every((v) => cabeNaLista(v, lista[0] as Lista))
  if (typeof valor !== 'object' || Array.isArray(valor)) return false
  const permitidas = lista as Record<string, Lista>
  return Object.entries(valor as Record<string, unknown>).every(
    ([chave, v]) => Object.hasOwn(permitidas, chave) && cabeNaLista(v, permitidas[chave]!),
  )
}

/**
 * Recompõe o objeto de RENDER a partir do snapshot que a porta devolveu: os campos de pessoa voltam como `null` (nunca
 * com valor — a porta não os tem) e os ids como um índice sintético, só para caber nos tipos de `tipos.ts`. A tela,
 * com `semPessoas`, não mostra as colunas de pessoa.
 */
export function completarParaRender(dados: unknown): unknown {
  if (dados === null || typeof dados !== 'object' || Array.isArray(dados)) return dados
  const copia = structuredClone(dados) as Record<string, unknown>
  for (const campo of CAMPOS_QUE_NAO_SAEM) {
    if (campo.render === 'ausente') continue
    preencher(copia, campo.caminho.split('.'), campo.render)
  }
  return copia
}

function preencher(alvo: unknown, partes: string[], render: 'nulo' | 'indice', indice = 0): void {
  if (alvo === null || typeof alvo !== 'object') return
  const [parte, ...resto] = partes
  if (parte === undefined) return
  const ehArray = parte.endsWith('[]')
  const chave = ehArray ? parte.slice(0, -2) : parte
  const obj = alvo as Record<string, unknown>
  if (resto.length === 0) {
    obj[chave] = render === 'nulo' ? null : `porta-${indice}`
    return
  }
  const filho = obj[chave]
  if (ehArray) {
    if (Array.isArray(filho)) filho.forEach((el, i) => preencher(el, resto, render, i))
    return
  }
  preencher(filho, resto, render, indice)
}
