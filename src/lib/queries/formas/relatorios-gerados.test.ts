import { describe, expect, it } from 'vitest'
import { conferirValores } from '@/lib/supabase/forma'
import { FORMA_SNAPSHOT } from '@/lib/queries/formas/relatorios-gerados'

// OS TESTES DE EXECUÇÃO da forma do snapshot (`relatorios_gerados.dados`) — F58 · Frente C ·
// lote 4. Dados 100% FICTÍCIOS (patrimônio `WAP0001234`, pessoa "Fulano" — o par de sempre dos
// CSVs de teste). A prova de ATRIBUIBILIDADE (compilação) está em
// `relatorios-gerados-tipos.test.ts`; aqui é runtime: o que a união aceita e o que ela recusa.

const aceita = (valor: unknown) => conferirValores([valor], FORMA_SNAPSHOT, []).recusas.length === 0

const KPIS_FICTICIOS = {
  total: 10,
  em_uso: 4,
  em_estoque: 3,
  reservado: 1,
  em_manutencao: 1,
  em_triagem: 1,
  defasado: 0,
}

// ---------------------------------------------------------------------------
// v1 — a grade da F3 (schema AUSENTE)
// ---------------------------------------------------------------------------

const V1_COMPLETO = {
  meta: {
    filialSlug: 'matriz',
    filialNome: 'Matriz',
    ehGeral: false,
    de: '2026-01-01',
    ate: '2026-01-07',
    periodoRotulo: '01/01 a 07/01',
  },
  kpis: KPIS_FICTICIOS,
  estoquePorCategoria: [{ categoria: 'notebook', total: 3 }],
  disponiveisPorModelo: [{ modelo: 'ThinkPad', total: 3 }],
  reservados: [{ patrimonio: 'WAP0001234', modelo: 'ThinkPad', chamado: 'CH-1' }],
  emManutencao: [{ patrimonio: 'WAP0001235', modelo: 'ThinkPad', observacao: 'tela quebrada' }],
  serieMovimentacoes: {
    granularidade: 'semana',
    pontos: [{ chave: '2026-01-01', rotulo: '01/01', saidas: 2, devolucoes: 1 }],
  },
  porMotivo: {
    saidas: [{ motivo: 'Admissão', total: 2 }],
    devolucoes: [{ motivo: 'Desligamento', total: 1 }],
  },
  pendencias: [{ chave: 'sem-termo', rotulo: 'Sem termo', total: 1 }],
  ultimasMovimentacoes: [
    {
      id: 'mov-1',
      data: '2026-01-02',
      tipo: 'saida',
      patrimonio: 'WAP0001234',
      ativo: 'ThinkPad',
      categoria: 'notebook',
      colaborador_setor: 'Fulano · TI',
      filial: 'Matriz',
      chamado: null,
      observacao: null,
    },
  ],
  resumo: {
    de: '2026-01-01',
    ate: '2026-01-07',
    saidas: { total: 2, filiais: [] },
    devolucoes: { total: 1, filiais: [] },
  },
}

// ---------------------------------------------------------------------------
// v2 — o formato do e-mail (F3B), schema: 2
// ---------------------------------------------------------------------------

const V2_COMPLETO = {
  meta: {
    filialSlug: 'matriz',
    filialNome: 'Matriz',
    ehGeral: false,
    de: '2026-01-01',
    ate: '2026-01-07',
    periodoRotulo: '01/01 a 07/01',
    schema: 2,
  },
  kpis: KPIS_FICTICIOS,
  kpisAnterior: KPIS_FICTICIOS,
  estoquePorCategoria: [{ categoria: 'notebook', total: 3 }],
  estoqueCatStatus: [{ categoria: 'notebook', segmentos: [{ status: 'em_estoque', total: 3 }], total: 3 }],
  disponiveisPorModelo: [{ categoria: 'notebook', modelos: [{ modelo: 'ThinkPad', total: 3 }], total: 3 }],
  reservados: [{ patrimonio: 'WAP0001234', modelo: 'ThinkPad', chamado: 'CH-1' }],
  manutencao: [
    {
      patrimonio: 'WAP0001235',
      modelo: 'ThinkPad',
      filial: 'Matriz',
      chamado: 'CH-2',
      dataEnvio: '2026-01-02',
      diasEmManutencao: 3,
      obsEnvio: 'tela quebrada',
      anotacoes: [{ texto: 'peça pedida', autor: 'Fulano', em: '2026-01-03' }],
      retornoData: null,
      retornoObs: null,
      fechado: false,
    },
  ],
  serieMovimentacoes: {
    granularidade: 'semana',
    pontos: [{ chave: '2026-01-01', rotulo: '01/01', saidas: 2, devolucoes: 1 }],
  },
  porMotivo: {
    saidas: [{ motivo: 'Admissão', total: 2 }],
    devolucoes: [{ motivo: 'Desligamento', total: 1 }],
  },
  grupos: [
    {
      grupo: 'acessorio',
      itens: [{ item: 'Mouse', atrelados: 2, falta: 0, entradas: 1, saidas: 1, delta: 0, obs: null }],
      ultimoLancamento: '2026-01-05',
      temAtrelados: true,
    },
  ],
  pendencias: [{ chave: 'sem-termo', rotulo: 'Sem termo', total: 1 }],
  saidas: [
    {
      id: 'mov-1',
      data: '2026-01-02',
      filial: 'Matriz',
      categoria: 'notebook',
      modelo: 'ThinkPad',
      patrimonio: 'WAP0001234',
      tipo: 'saida',
      motivo: 'Admissão',
      chamado: null,
      colaboradorSetor: 'Fulano · TI',
      termo: null,
      obs: null,
    },
  ],
  entradas: [
    {
      id: 'mov-2',
      data: '2026-01-03',
      filial: 'Matriz',
      categoria: 'notebook',
      modelo: 'ThinkPad',
      patrimonio: 'WAP0001236',
      tipo: 'devolucao',
      motivo: 'Desligamento',
      colaborador: 'Fulano',
      setor: 'TI',
      itensFaltantes: null,
      obs: null,
    },
  ],
  transferencias: [
    {
      id: 'mov-3',
      data: '2026-01-04',
      de: 'Matriz',
      para: 'Filial B',
      categoria: 'notebook',
      modelo: 'ThinkPad',
      patrimonio: 'WAP0001237',
      chamado: null,
      obs: null,
    },
  ],
  resumo: {
    de: '2026-01-01',
    ate: '2026-01-07',
    saidas: { total: 2, filiais: [] },
    devolucoes: { total: 1, filiais: [] },
  },
}

describe('a forma do snapshot congelado (relatorios_gerados.dados)', () => {
  it('aceita um v1 completo (schema ausente, serieMovimentacoes presente)', () => {
    expect(aceita(V1_COMPLETO)).toBe(true)
  })

  it('aceita um v2 completo (schema: 2), sem serieEstado nem movimentacoesItens', () => {
    expect(aceita(V2_COMPLETO)).toBe(true)
  })

  it('aceita um v1 só com movimentacoesPorMes (sem serieMovimentacoes — o snapshot pré-F3B)', () => {
    const { serieMovimentacoes: _serieMovimentacoes, ...semSerie } = V1_COMPLETO
    void _serieMovimentacoes
    expect(
      aceita({ ...semSerie, movimentacoesPorMes: [{ mes: '2026-01', saidas: 2, devolucoes: 1 }] }),
    ).toBe(true)
  })

  it('aceita um v2 com chave extra num item de tabela (snapshot de uma versão futura)', () => {
    const comChaveExtra = {
      ...V2_COMPLETO,
      saidas: [{ ...V2_COMPLETO.saidas[0], colunaDeUmaFaseFutura: 'x' }],
    }
    expect(aceita(comChaveExtra)).toBe(true)
  })

  it('recusa um v2 SEM a seção "saidas" — não escorrega para v1 (meta.schema: 2 reprova o lado v1)', () => {
    const { saidas: _saidas, ...semSaidas } = V2_COMPLETO
    void _saidas
    expect(aceita(semSaidas)).toBe(false)
  })

  it('recusa um objeto sem "meta" (as duas variantes exigem a chave)', () => {
    const { meta: _meta, ...semMeta } = V1_COMPLETO
    void _meta
    expect(aceita(semMeta)).toBe(false)
  })
})
