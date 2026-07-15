import { describe, it, expect } from 'vitest'
import {
  construirItem,
  montarItensInput,
  type Config,
} from '@/components/movimentacoes/nova/config'
import {
  loteMovimentacaoSchema,
  movimentacaoSchema,
} from '@/lib/validators/movimentacao'
import type { AtivoResumo } from '@/lib/queries/ativos'

const UUID = '123e4567-e89b-12d3-a456-426614174000'
const DATA_OK = '2020-01-01'

// construirItem só usa ativo.id; o resto é irrelevante para a serialização.
const ativo = { id: UUID } as unknown as AtivoResumo

// Config totalmente preenchida (todos os campos válidos) — cada teste ajusta o
// tipo e, quando precisa, apaga um campo para provar a rejeição.
function cfg(over: Partial<Config>): Config {
  return {
    data: DATA_OK,
    tipo: '',
    motivo: 'desligamento',
    colaborador: 'Fulano',
    setor: 'TI',
    chamado: '123',
    termo: 'sim',
    termoData: DATA_OK,
    observacao: 'Justificativa mais que suficiente do ajuste',
    filialDestinoId: '2',
    itensFaltantes: ['mouse'],
    ...over,
  }
}

describe('construirItem — serialização derivada de CAMPOS_POR_TIPO', () => {
  it('saída: campos comuns + motivo + colaborador/setor + termo', () => {
    expect(construirItem(ativo, cfg({ tipo: 'saida' }))).toEqual({
      ativo_id: UUID,
      tipo: 'saida',
      data: DATA_OK,
      chamado: '123',
      observacao: 'Justificativa mais que suficiente do ajuste',
      motivo: 'desligamento',
      colaborador: 'Fulano',
      setor: 'TI',
      termo_assinado: 'sim',
      termo_data: DATA_OK,
    })
  })

  it('empréstimo: idêntico à saída (mesma linha da tabela)', () => {
    const s = construirItem(ativo, cfg({ tipo: 'saida' }))
    const e = construirItem(ativo, cfg({ tipo: 'emprestimo' }))
    expect(e).toEqual({ ...s, tipo: 'emprestimo' })
  })

  it('reserva: motivo/colaborador/setor, SEM termo', () => {
    expect(construirItem(ativo, cfg({ tipo: 'reserva' }))).toEqual({
      ativo_id: UUID,
      tipo: 'reserva',
      data: DATA_OK,
      chamado: '123',
      observacao: 'Justificativa mais que suficiente do ajuste',
      motivo: 'desligamento',
      colaborador: 'Fulano',
      setor: 'TI',
    })
  })

  it('devolução: motivo + itens_faltantes, SEM colaborador/termo', () => {
    expect(construirItem(ativo, cfg({ tipo: 'devolucao' }))).toEqual({
      ativo_id: UUID,
      tipo: 'devolucao',
      data: DATA_OK,
      chamado: '123',
      observacao: 'Justificativa mais que suficiente do ajuste',
      motivo: 'desligamento',
      itens_faltantes: ['mouse'],
    })
  })

  it('transferência: filial_destino_id numérico, sem motivo', () => {
    expect(construirItem(ativo, cfg({ tipo: 'transferencia' }))).toEqual({
      ativo_id: UUID,
      tipo: 'transferencia',
      data: DATA_OK,
      chamado: '123',
      observacao: 'Justificativa mais que suficiente do ajuste',
      filial_destino_id: 2,
    })
  })

  it('ajuste: só os comuns (status_resultante é injetado por montarItensInput)', () => {
    expect(construirItem(ativo, cfg({ tipo: 'ajuste' }))).toEqual({
      ativo_id: UUID,
      tipo: 'ajuste',
      data: DATA_OK,
      chamado: '123',
      observacao: 'Justificativa mais que suficiente do ajuste',
    })
  })

  it('tipo simples (envio_manutencao): comuns + motivo opcional', () => {
    expect(construirItem(ativo, cfg({ tipo: 'envio_manutencao' }))).toEqual({
      ativo_id: UUID,
      tipo: 'envio_manutencao',
      data: DATA_OK,
      chamado: '123',
      observacao: 'Justificativa mais que suficiente do ajuste',
      motivo: 'desligamento',
    })
  })

  it('motivo obrigatório vira "" quando vazio (dispara o Zod); opcional vira undefined', () => {
    // devolução: motivo obrigatório → '' (presente, para o min(1) reclamar)
    expect(construirItem(ativo, cfg({ tipo: 'devolucao', motivo: '' })).motivo).toBe('')
    // reserva: motivo opcional → undefined (tratado como ausente pelo Zod)
    expect(construirItem(ativo, cfg({ tipo: 'reserva', motivo: '' })).motivo).toBeUndefined()
  })
})

describe('montarItensInput', () => {
  it('injeta status_resultante SÓ no ajuste', () => {
    const [aj] = montarItensInput([ativo], cfg({ tipo: 'ajuste' }), 'em_estoque')
    expect(aj.status_resultante).toBe('em_estoque')

    const [sa] = montarItensInput([ativo], cfg({ tipo: 'saida' }), 'em_estoque')
    expect(sa).not.toHaveProperty('status_resultante')
  })

  it('mapeia todos os itens do lote', () => {
    const a2 = { id: '223e4567-e89b-12d3-a456-426614174000' } as unknown as AtivoResumo
    const out = montarItensInput([ativo, a2], cfg({ tipo: 'saida' }), '')
    expect(out).toHaveLength(2)
    expect(out[0].ativo_id).toBe(UUID)
    expect(out[1].ativo_id).toBe(a2.id)
  })
})

// Consistência tabela ↔ schema: o que a tabela declara aplicável/obrigatório
// tem de casar com o que o movimentacaoSchema aceita/rejeita. Se alguém mudar
// só um dos lados, um destes quebra.
describe('CAMPOS_POR_TIPO ↔ movimentacaoSchema (consistência)', () => {
  const FORMAVEIS = [
    'saida',
    'emprestimo',
    'reserva',
    'devolucao',
    'transferencia',
    'triagem_ok',
    'envio_manutencao',
    'retorno_manutencao',
    'marcar_defasado',
    'descarte',
    'compra',
  ] as const

  it.each(FORMAVEIS)('%s totalmente preenchido é aceito pelo schema', (tipo) => {
    const itens = montarItensInput([ativo], cfg({ tipo }), '')
    expect(loteMovimentacaoSchema.safeParse({ itens }).success).toBe(true)
  })

  it('ajuste totalmente preenchido (com status) é aceito', () => {
    const itens = montarItensInput([ativo], cfg({ tipo: 'ajuste' }), 'em_estoque')
    expect(loteMovimentacaoSchema.safeParse({ itens }).success).toBe(true)
  })

  it('rejeita quando um campo OBRIGATÓRIO da tabela fica vazio', () => {
    const rejeita = (c: Config, status = '') =>
      !movimentacaoSchema.safeParse(montarItensInput([ativo], c, status)[0]).success

    expect(rejeita(cfg({ tipo: 'saida', motivo: '' }))).toBe(true)
    expect(rejeita(cfg({ tipo: 'emprestimo', motivo: '' }))).toBe(true)
    expect(rejeita(cfg({ tipo: 'devolucao', motivo: '' }))).toBe(true)
    expect(rejeita(cfg({ tipo: 'transferencia', filialDestinoId: '' }))).toBe(true)
    expect(rejeita(cfg({ tipo: 'ajuste' }), '')).toBe(true) // sem status_resultante
    expect(rejeita(cfg({ tipo: 'ajuste', observacao: '' }), 'em_estoque')).toBe(true)
  })

  it('saída sem colaborador NEM setor é rejeitada (regra cruzada da tabela)', () => {
    const item = montarItensInput(
      [ativo],
      cfg({ tipo: 'saida', colaborador: '', setor: '' }),
      '',
    )[0]
    expect(movimentacaoSchema.safeParse(item).success).toBe(false)
  })
})
