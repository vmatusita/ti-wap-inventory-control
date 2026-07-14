import { describe, it, expect } from 'vitest'
import {
  tiposComunsPara,
  movimentacaoSchema,
  loteMovimentacaoSchema,
} from '@/lib/validators/movimentacao'

const UUID = '123e4567-e89b-12d3-a456-426614174000'
const DATA_OK = '2020-01-01' // passada — nunca futura

describe('tiposComunsPara (interseção de transições do lote)', () => {
  it('vazio para lista vazia', () => {
    expect(tiposComunsPara([])).toEqual([])
  })

  it('descartado só admite ajuste', () => {
    expect(tiposComunsPara(['descartado'])).toEqual(['ajuste'])
  })

  it('interseção de em_uso + emprestado exclui envio_manutencao', () => {
    expect(tiposComunsPara(['em_uso', 'emprestado'])).toEqual([
      'devolucao',
      'transferencia',
      'ajuste',
    ])
  })
})

describe('movimentacaoSchema', () => {
  it('aceita saída com colaborador', () => {
    const r = movimentacaoSchema.safeParse({
      tipo: 'saida',
      ativo_id: UUID,
      data: DATA_OK,
      motivo: 'Desligamento',
      colaborador: 'Fulano',
    })
    expect(r.success).toBe(true)
  })

  it('aceita saída só com setor', () => {
    const r = movimentacaoSchema.safeParse({
      tipo: 'saida',
      ativo_id: UUID,
      data: DATA_OK,
      motivo: 'Desligamento',
      setor: 'TI',
    })
    expect(r.success).toBe(true)
  })

  it('rejeita saída sem colaborador NEM setor (regra do superRefine)', () => {
    const r = movimentacaoSchema.safeParse({
      tipo: 'saida',
      ativo_id: UUID,
      data: DATA_OK,
      motivo: 'Desligamento',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('colaborador'))).toBe(true)
    }
  })

  it('rejeita data futura', () => {
    const r = movimentacaoSchema.safeParse({
      tipo: 'saida',
      ativo_id: UUID,
      data: '2999-12-31',
      motivo: 'Desligamento',
      colaborador: 'Fulano',
    })
    expect(r.success).toBe(false)
  })

  it('rejeita ativo_id que não é UUID', () => {
    const r = movimentacaoSchema.safeParse({
      tipo: 'compra',
      ativo_id: 'nao-uuid',
      data: DATA_OK,
    })
    expect(r.success).toBe(false)
  })

  it('exige filial de destino na transferência', () => {
    expect(
      movimentacaoSchema.safeParse({ tipo: 'transferencia', ativo_id: UUID, data: DATA_OK })
        .success,
    ).toBe(false)
    expect(
      movimentacaoSchema.safeParse({
        tipo: 'transferencia',
        ativo_id: UUID,
        data: DATA_OK,
        filial_destino_id: 2,
      }).success,
    ).toBe(true)
  })

  it('ajuste exige status_resultante e justificativa >= 10 chars', () => {
    expect(
      movimentacaoSchema.safeParse({ tipo: 'ajuste', ativo_id: UUID, data: DATA_OK }).success,
    ).toBe(false)
    expect(
      movimentacaoSchema.safeParse({
        tipo: 'ajuste',
        ativo_id: UUID,
        data: DATA_OK,
        status_resultante: 'em_estoque',
        observacao: 'Justificativa suficiente do ajuste',
      }).success,
    ).toBe(true)
  })

  it('rejeita tipo fora da união discriminada', () => {
    const r = movimentacaoSchema.safeParse({ tipo: 'foobar', ativo_id: UUID, data: DATA_OK })
    expect(r.success).toBe(false)
  })
})

describe('loteMovimentacaoSchema', () => {
  it('exige ao menos um item', () => {
    expect(loteMovimentacaoSchema.safeParse({ itens: [] }).success).toBe(false)
  })

  it('aceita um lote com um item válido', () => {
    const r = loteMovimentacaoSchema.safeParse({
      itens: [{ tipo: 'compra', ativo_id: UUID, data: DATA_OK }],
    })
    expect(r.success).toBe(true)
  })
})
