import type { SnapshotRelatorioV2 } from '@/lib/relatorios/tipos'

// ANDAIME DE VERIFICAÇÃO DA F32 — ARQUIVO TEMPORÁRIO, apagado ao fim da fase.
// TODOS os dados aqui são 100% FICTÍCIOS (CLAUDE.md: nenhum nome, patrimônio ou
// linha real da WAP em fixture, teste, screenshot ou evidência). Serve para
// dirigir os componentes do relatório sem login e sem tocar em banco nenhum.

const DE = '2026-06-14'
const ATE = '2026-08-10'

export const SNAPSHOT_FICTICIO: SnapshotRelatorioV2 = {
  meta: {
    filialSlug: 'geral',
    filialNome: 'Consolidado',
    ehGeral: true,
    de: DE,
    ate: ATE,
    periodoRotulo: 'Período personalizado',
    schema: 2,
    observacao: 'Semana de inventário nas filiais do interior.',
  },
  kpis: {
    total: 428,
    em_uso: 231,
    em_estoque: 96,
    reservado: 21,
    em_manutencao: 34,
    em_triagem: 27,
    defasado: 12,
    emprestado: 7,
  },
  kpisAnterior: {
    total: 421,
    em_uso: 240,
    em_estoque: 88,
    reservado: 19,
    em_manutencao: 29,
    em_triagem: 31,
    defasado: 12,
    emprestado: 2,
  },
  estoquePorCategoria: [
    { categoria: 'notebook', total: 183 },
    { categoria: 'monitor', total: 121 },
    { categoria: 'celular', total: 64 },
    { categoria: 'desktop', total: 48 },
    { categoria: 'tablet', total: 12 },
  ],
  estoqueCatStatus: [
    {
      categoria: 'notebook',
      total: 183,
      segmentos: [
        { status: 'em_estoque', total: 41 },
        { status: 'reservado', total: 9 },
        { status: 'em_uso', total: 98 },
        { status: 'emprestado', total: 4 },
        { status: 'em_triagem', total: 14 },
        { status: 'em_manutencao', total: 12 },
        { status: 'defasado', total: 5 },
      ],
    },
    {
      categoria: 'monitor',
      total: 121,
      segmentos: [
        { status: 'em_estoque', total: 33 },
        { status: 'reservado', total: 6 },
        { status: 'em_uso', total: 71 },
        { status: 'em_triagem', total: 5 },
        { status: 'em_manutencao', total: 4 },
        { status: 'defasado', total: 2 },
      ],
    },
    {
      categoria: 'celular',
      total: 64,
      segmentos: [
        { status: 'em_estoque', total: 12 },
        { status: 'reservado', total: 4 },
        { status: 'em_uso', total: 34 },
        { status: 'emprestado', total: 2 },
        { status: 'em_triagem', total: 5 },
        { status: 'em_manutencao', total: 6 },
        { status: 'defasado', total: 1 },
      ],
    },
    {
      categoria: 'desktop',
      total: 48,
      segmentos: [
        { status: 'em_estoque', total: 8 },
        { status: 'reservado', total: 2 },
        { status: 'em_uso', total: 24 },
        { status: 'em_triagem', total: 2 },
        { status: 'em_manutencao', total: 9 },
        { status: 'defasado', total: 3 },
      ],
    },
    {
      categoria: 'tablet',
      total: 12,
      segmentos: [
        { status: 'em_estoque', total: 2 },
        { status: 'em_uso', total: 4 },
        { status: 'emprestado', total: 1 },
        { status: 'em_triagem', total: 1 },
        { status: 'em_manutencao', total: 3 },
        { status: 'defasado', total: 1 },
      ],
    },
  ],
  disponiveisPorModelo: [
    {
      categoria: 'notebook',
      total: 41,
      modelos: [
        { modelo: 'Marca A Modelo 14', total: 18 },
        { modelo: 'Marca B Modelo Pro', total: 13 },
        { modelo: 'Marca C Modelo Base', total: 10 },
      ],
    },
    {
      categoria: 'monitor',
      total: 33,
      modelos: [
        { modelo: 'Marca D 24 polegadas', total: 21 },
        { modelo: 'Marca D 27 polegadas', total: 12 },
      ],
    },
  ],
  reservados: [
    { patrimonio: 'WAP0001234', modelo: 'Marca A Modelo 14', chamado: 'CH-1001' },
    { patrimonio: 'WAP0004491', modelo: 'Marca D 24 polegadas', chamado: null },
  ],
  manutencao: [
    {
      patrimonio: 'WAP0001234',
      modelo: 'Marca A Modelo 14',
      filial: 'Filial Fictícia Norte',
      chamado: 'CH-2050',
      chamadoFornecedor: 'F-77',
      dataEnvio: '2026-06-20',
      obsEnvio: null,
      retornoData: null,
      retornoObs: null,
      diasEmManutencao: 51,
      fechado: false,
      anotacoes: [{ texto: 'Fornecedor pediu prazo extra.', autor: 'Fulano', em: '2026-07-02' }],
    },
    {
      patrimonio: 'WAP0004491',
      modelo: 'Marca C Modelo Base',
      filial: 'Filial Fictícia Sul',
      chamado: null,
      dataEnvio: '2026-07-28',
      obsEnvio: null,
      retornoData: null,
      retornoObs: null,
      diasEmManutencao: 13,
      fechado: false,
      anotacoes: [],
    },
    {
      patrimonio: 'WAP0001234',
      modelo: 'Marca B Modelo Pro',
      filial: 'Filial Fictícia Norte',
      chamado: 'CH-2011',
      dataEnvio: '2026-06-30',
      obsEnvio: null,
      retornoData: '2026-07-20',
      retornoObs: null,
      diasEmManutencao: 20,
      fechado: true,
      desfecho: 'retorno',
      anotacoes: [],
    },
  ],
  serieMovimentacoes: {
    granularidade: 'dia',
    pontos: [
      { chave: '2026-08-02', rotulo: '02/08', saidas: 4, devolucoes: 1 },
      { chave: '2026-08-03', rotulo: '03/08', saidas: 11, devolucoes: 3 },
      { chave: '2026-08-04', rotulo: '04/08', saidas: 9, devolucoes: 6 },
      { chave: '2026-08-05', rotulo: '05/08', saidas: 14, devolucoes: 4 },
      { chave: '2026-08-06', rotulo: '06/08', saidas: 7, devolucoes: 8 },
      { chave: '2026-08-07', rotulo: '07/08', saidas: 12, devolucoes: 2 },
      { chave: '2026-08-08', rotulo: '08/08', saidas: 2, devolucoes: 0 },
      { chave: '2026-08-09', rotulo: '09/08', saidas: 1, devolucoes: 0 },
      { chave: '2026-08-10', rotulo: '10/08', saidas: 3, devolucoes: 1 },
    ],
  },
  serieEstado: {
    pontos: [
      { chave: '2026-06-20', rotulo: '20/06', em_estoque: 128 },
      { chave: '2026-06-27', rotulo: '27/06', em_estoque: 121 },
      { chave: '2026-07-04', rotulo: '04/07', em_estoque: 117 },
      { chave: '2026-07-11', rotulo: '11/07', em_estoque: 109 },
      { chave: '2026-07-18', rotulo: '18/07', em_estoque: 112 },
      { chave: '2026-07-25', rotulo: '25/07', em_estoque: 104 },
      { chave: '2026-08-01', rotulo: '01/08', em_estoque: 99 },
      { chave: '2026-08-08', rotulo: '08/08', em_estoque: 97 },
      { chave: '2026-08-10', rotulo: '10/08', em_estoque: 96 },
    ],
  },
  porMotivo: {
    saidas: [
      { motivo: 'Novo colaborador', total: 219 },
      { motivo: 'Troca / upgrade', total: 55 },
      { motivo: 'Reposição por defeito', total: 88 },
      { motivo: 'Projeto temporário', total: 12 },
      { motivo: 'Home office', total: 41 },
    ],
    devolucoes: [
      { motivo: 'Desligamento', total: 74 },
      { motivo: 'Fim de projeto', total: 18 },
      { motivo: 'Compra', total: 33 },
    ],
  },
  grupos: [
    {
      grupo: 'acessorio',
      ultimoLancamento: '2026-08-09',
      temAtrelados: true,
      itens: [
        { item: 'Fone com microfone', total: 60, estoque: 4, minimo: 10, atrelados: 12, falta: 6, entradas: 3, saidas: 9, delta: -6, obs: 'Lote novo a caminho.' },
        { item: 'Mochila para notebook', total: 44, estoque: 11, minimo: 10, atrelados: 6, falta: 0, entradas: 5, saidas: 2, delta: 3, obs: null },
        { item: 'Teclado sem fio', total: 38, estoque: 27, minimo: 8, atrelados: 4, falta: 0, entradas: 6, saidas: 6, delta: 0, obs: null },
        { item: 'Hub USB-C', total: 21, estoque: 5, minimo: 0, atrelados: 2, falta: 0, entradas: 0, saidas: 3, delta: -3, obs: null },
        { item: 'Carregador 65 W', total: 30, estoque: 12, minimo: 100, atrelados: 3, falta: 88, entradas: 1, saidas: 7, delta: -6, obs: null },
      ],
    },
    {
      grupo: 'componente',
      ultimoLancamento: '2026-08-05',
      temAtrelados: false,
      itens: [
        { item: 'SSD 480 GB', total: 25, estoque: 9, minimo: 6, atrelados: 0, falta: 0, entradas: 4, saidas: 2, delta: 2, obs: null },
        { item: 'Memória DDR4 8 GB', total: 40, estoque: 2, minimo: 12, atrelados: 0, falta: 10, entradas: 0, saidas: 5, delta: -5, obs: 'Fornecedor sem estoque.' },
      ],
    },
  ],
  pendencias: [
    { chave: 'sem-patrimonio', rotulo: 'Sem patrimônio', total: 3 },
    { chave: 'manutencao-parada', rotulo: 'Manutenção parada (30+ dias)', total: 1 },
  ],
  saidas: [
    { id: 's1', data: '2026-08-05', filial: 'Filial Fictícia Norte', categoria: 'notebook', modelo: 'Marca A Modelo 14', patrimonio: 'WAP0001234', tipo: 'saida', motivo: 'Novo colaborador', chamado: 'CH-3001', colaboradorSetor: 'Fulano', termo: 'assinado', obs: null },
    { id: 's2', data: '2026-08-06', filial: 'Filial Fictícia Sul', categoria: 'monitor', modelo: 'Marca D 24 polegadas', patrimonio: 'WAP0004491', tipo: 'saida', motivo: 'Troca / upgrade', chamado: null, colaboradorSetor: 'Setor Fictício', termo: 'pendente', obs: 'Entrega no balcão.' },
  ],
  entradas: [
    { id: 'e1', data: '2026-08-07', filial: 'Filial Fictícia Norte', categoria: 'notebook', modelo: 'Marca B Modelo Pro', patrimonio: 'WAP0001234', tipo: 'devolucao', motivo: 'Desligamento', colaborador: 'Fulano', setor: null, itensFaltantes: ['Fone com microfone'], obs: null },
    { id: 'e2', data: '2026-08-08', filial: 'Filial Fictícia Sul', categoria: 'celular', modelo: 'Marca C Modelo Base', patrimonio: 'WAP0004491', tipo: 'compra', motivo: 'Compra', colaborador: null, setor: null, itensFaltantes: null, obs: null },
  ],
  transferencias: [
    { id: 't1', data: '2026-08-04', de: 'Filial Fictícia Norte', para: 'Filial Fictícia Sul', categoria: 'notebook', modelo: 'Marca A Modelo 14', patrimonio: 'WAP0001234', chamado: null, obs: null },
    { id: 't2', data: '2026-08-05', de: 'Filial Fictícia Norte', para: 'Filial Fictícia Sul', categoria: 'monitor', modelo: 'Marca D 27 polegadas', patrimonio: 'WAP0004491', chamado: 'CH-4001', obs: null },
    { id: 't3', data: '2026-08-06', de: 'Filial Fictícia Sul', para: 'Filial Fictícia Leste', categoria: 'celular', modelo: 'Marca C Modelo Base', patrimonio: 'WAP0001234', chamado: null, obs: null },
  ],
  movimentacoesItens: [
    { id: 'i1', data: '2026-08-09', filial: 'Filial Fictícia Norte', item: 'Fone com microfone', grupo: 'acessorio', tipo: 'saida', quantidade: 3, chamado: null, colaborador: 'Fulano', obs: null, ehEstorno: false },
    { id: 'i2', data: '2026-08-08', filial: 'Filial Fictícia Sul', item: 'SSD 480 GB', grupo: 'componente', tipo: 'entrada', quantidade: 4, chamado: null, colaborador: null, obs: null, ehEstorno: false },
  ],
  resumo: {
    de: DE,
    ate: ATE,
    saidas: { total: 415, filiais: [] },
    devolucoes: { total: 125, filiais: [] },
  },
}

// Um snapshot SEM os campos novos da F32 — simula um v2 gerado antes desta fase
// (roteiro 3 da Verificação: "snapshot ANTIGO abrindo sem quebrar").
export const SNAPSHOT_ANTIGO_V2: SnapshotRelatorioV2 = (() => {
  const s = structuredClone(SNAPSHOT_FICTICIO)
  delete s.serieEstado
  delete s.movimentacoesItens
  for (const g of s.grupos) for (const i of g.itens) delete i.minimo
  return s
})()
