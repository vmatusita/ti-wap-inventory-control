import { describe, it, expect } from 'vitest'
import {
  tiposComunsPara,
  movimentacaoSchema,
  loteMovimentacaoSchema,
  CAMPOS_POR_TIPO,
  campoAplica,
  campoObrigatorio,
  observacaoObrigatoria,
} from '@/lib/validators/movimentacao'
import { Constants } from '@/lib/types/database'

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

describe('CAMPOS_POR_TIPO (matriz tipo × campos)', () => {
  it('cobre EXATAMENTE os 13 tipos do enum, sem faltar nem sobrar', () => {
    expect(Object.keys(CAMPOS_POR_TIPO).sort()).toEqual(
      [...Constants.public.Enums.tipo_movimentacao].sort(),
    )
  })

  it('só saida/emprestimo pedem colaborador OU setor', () => {
    const comRegra = Object.entries(CAMPOS_POR_TIPO)
      .filter(([, meta]) => meta.exigeColaboradorOuSetor)
      .map(([t]) => t)
      .sort()
    expect(comRegra).toEqual(['emprestimo', 'saida'])
  })

  it('só ajuste tem observação obrigatória (justificativa)', () => {
    const comObs = Object.entries(CAMPOS_POR_TIPO)
      .filter(([, meta]) => meta.observacaoObrigatoria)
      .map(([t]) => t)
    expect(comObs).toEqual(['ajuste'])
  })
})

describe('predicados de campo', () => {
  it('campoAplica reflete a tabela', () => {
    expect(campoAplica('saida', 'termo')).toBe(true)
    expect(campoAplica('emprestimo', 'termo')).toBe(true)
    expect(campoAplica('reserva', 'termo')).toBe(false)
    expect(campoAplica('reserva', 'colaborador')).toBe(true)
    expect(campoAplica('transferencia', 'filial_destino')).toBe(true)
    expect(campoAplica('ajuste', 'status_resultante')).toBe(true)
    expect(campoAplica('devolucao', 'itens_faltantes')).toBe(true)
    expect(campoAplica('devolucao', 'colaborador')).toBe(false)
    expect(campoAplica('envio_manutencao', 'motivo')).toBe(true)
  })

  it('campoAplica devolve false para tipo vazio/ausente', () => {
    expect(campoAplica('', 'motivo')).toBe(false)
    expect(campoAplica(undefined, 'termo')).toBe(false)
  })

  it('campoObrigatorio separa obrigatório de opcional', () => {
    expect(campoObrigatorio('saida', 'motivo')).toBe(true)
    expect(campoObrigatorio('emprestimo', 'motivo')).toBe(true)
    expect(campoObrigatorio('devolucao', 'motivo')).toBe(true)
    expect(campoObrigatorio('reserva', 'motivo')).toBe(false)
    expect(campoObrigatorio('envio_manutencao', 'motivo')).toBe(false)
    expect(campoObrigatorio('transferencia', 'filial_destino')).toBe(true)
    expect(campoObrigatorio('ajuste', 'status_resultante')).toBe(true)
    // opcional mesmo quando aplica:
    expect(campoObrigatorio('saida', 'colaborador')).toBe(false)
    // não aplica → não é obrigatório:
    expect(campoObrigatorio('transferencia', 'motivo')).toBe(false)
    expect(campoObrigatorio('', 'motivo')).toBe(false)
  })

  it('observacaoObrigatoria só no ajuste', () => {
    expect(observacaoObrigatoria('ajuste')).toBe(true)
    expect(observacaoObrigatoria('saida')).toBe(false)
    expect(observacaoObrigatoria('transferencia')).toBe(false)
    expect(observacaoObrigatoria('')).toBe(false)
  })
})
