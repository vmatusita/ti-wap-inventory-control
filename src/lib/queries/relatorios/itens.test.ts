import { describe, it, expect } from 'vitest'
import { OBS_SALDO_INICIAL } from '@/lib/dominio'
import { ehSaldoInicialGoLive, mapLancamentoItemRow } from './itens'

// B5 (F6B) — funções puras da tabela de movimentações de itens do relatório.
// O filtro efetivo no banco é o `.or('observacao.is.null,observacao.neq."…"')`
// (null-safe, testado por integração no A1); aqui garantimos o backstop em JS e o
// mapeamento, com LINHAS SINTÉTICAS (nenhum dado real — CLAUDE.md).

// Linha crua mínima (embeds do PostgREST) para o mapeamento.
function raw(over: Partial<Parameters<typeof mapLancamentoItemRow>[0]> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    data: '2026-07-13',
    tipo: 'entrada' as const,
    quantidade: 3,
    chamado: null,
    colaborador: null,
    observacao: null,
    estorna_id: null,
    item: { nome: 'Mouse sem fio', grupo: 'acessorio' as const },
    filial: { nome: 'Matriz' },
    ...over,
  }
}

describe('ehSaldoInicialGoLive (marcador da carga de saldos — F6C)', () => {
  it('reconhece a observação EXATA da carga', () => {
    expect(ehSaldoInicialGoLive(OBS_SALDO_INICIAL)).toBe(true)
    expect(ehSaldoInicialGoLive('saldo inicial (go-live)')).toBe(true)
  })

  it('observacao NULL NÃO é marcador (aparece na tabela — gotcha .neq + NULL)', () => {
    expect(ehSaldoInicialGoLive(null)).toBe(false)
  })

  it('observação comum NÃO é marcador', () => {
    expect(ehSaldoInicialGoLive('reposição de estoque')).toBe(false)
    expect(ehSaldoInicialGoLive('saldo inicial')).toBe(false) // sem o sufixo exato
  })
})

describe('filtro da carga sobre linhas sintéticas', () => {
  const rows = [
    raw({ id: 'a', observacao: null }), // sem observação → aparece
    raw({ id: 'b', observacao: 'troca de teclado' }), // comum → aparece
    raw({ id: 'c', observacao: OBS_SALDO_INICIAL }), // marcador → sai
  ]

  it('mantém NULL e comum, remove o marcador da carga', () => {
    const visiveis = rows.filter((r) => !ehSaldoInicialGoLive(r.observacao)).map((r) => r.id)
    expect(visiveis).toEqual(['a', 'b'])
  })
})

describe('mapLancamentoItemRow', () => {
  it('mapeia embeds e sinaliza estorno por estorna_id', () => {
    const linha = mapLancamentoItemRow(
      raw({
        id: 'x',
        tipo: 'ajuste',
        quantidade: -2,
        chamado: '123',
        colaborador: 'Fulano de Tal',
        observacao: 'correção de inventário',
        estorna_id: 'y',
      }),
    )
    expect(linha).toEqual({
      id: 'x',
      data: '2026-07-13',
      filial: 'Matriz',
      item: 'Mouse sem fio',
      grupo: 'acessorio',
      tipo: 'ajuste',
      quantidade: -2,
      chamado: '123',
      colaborador: 'Fulano de Tal',
      obs: 'correção de inventário',
      ehEstorno: true,
    })
  })

  it('tolera embeds ausentes (item/filial nulos) e não estorno', () => {
    const linha = mapLancamentoItemRow(raw({ item: null, filial: null }))
    expect(linha.item).toBe('—')
    expect(linha.filial).toBe('—')
    expect(linha.grupo).toBe('acessorio')
    expect(linha.ehEstorno).toBe(false)
  })
})
