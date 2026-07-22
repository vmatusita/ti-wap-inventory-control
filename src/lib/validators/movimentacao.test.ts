import { describe, it, expect } from 'vitest'
import {
  tiposComunsPara,
  movimentacaoSchema,
  loteMovimentacaoSchema,
  CAMPOS_POR_TIPO,
  campoAplica,
  campoObrigatorio,
  observacaoObrigatoria,
  MAX_LOTE_MOVIMENTACAO,
  parsearLoteColado,
  mesmaServiceTag,
} from '@/lib/validators/movimentacao'
import { Constants } from '@/lib/types/database'

const UUID = '123e4567-e89b-12d3-a456-426614174000'
const DATA_OK = '2020-01-01' // passada — nunca futura

// Itens válidos e DISTINTOS para exercitar o teto do lote (dados fictícios).
function loteDeCompras(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    tipo: 'compra' as const,
    ativo_id: `123e4567-e89b-12d3-a456-${String(i).padStart(12, '0')}`,
    data: DATA_OK,
  }))
}

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

  // F10/M11 — o teto passou de 10 para 30 e vive numa constante só.
  it(`aceita exatamente ${MAX_LOTE_MOVIMENTACAO} itens`, () => {
    const r = loteMovimentacaoSchema.safeParse({
      itens: loteDeCompras(MAX_LOTE_MOVIMENTACAO),
    })
    expect(r.success).toBe(true)
  })

  it(`recusa ${MAX_LOTE_MOVIMENTACAO + 1} itens, citando o teto na mensagem`, () => {
    const r = loteMovimentacaoSchema.safeParse({
      itens: loteDeCompras(MAX_LOTE_MOVIMENTACAO + 1),
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const msgs = r.error.issues.map((i) => i.message)
      expect(msgs).toContain(
        `O lote aceita no máximo ${MAX_LOTE_MOVIMENTACAO} itens`,
      )
    }
  })

  it('o teto do lote é 30 (decisão §2 da OS-F10)', () => {
    expect(MAX_LOTE_MOVIMENTACAO).toBe(30)
  })
})

// F10/M1 — parser puro do "Colar lista" no lote de movimentação.
describe('parsearLoteColado (M1)', () => {
  it('lê um patrimônio por linha e canonicaliza', () => {
    const r = parsearLoteColado('wap1234\nWAP0004491\n')
    expect(r.erro).toBeUndefined()
    expect(r.itens.map((i) => i.patrimonio)).toEqual(['WAP0001234', 'WAP0004491'])
    expect(r.itens.map((i) => i.linha)).toEqual([1, 2])
    expect(r.invalidos).toEqual([])
  })

  it('aceita service tag após vírgula, ponto e vírgula e TAB', () => {
    const r = parsearLoteColado(
      'WAP0001234,ST-ABC123\nWAP0001235;ST-ABC124\nWAP0001236\tST-ABC125',
    )
    expect(r.itens.map((i) => i.service_tag)).toEqual([
      'ST-ABC123',
      'ST-ABC124',
      'ST-ABC125',
    ])
  })

  it('ignora colunas extras (colar 3+ colunas do Excel)', () => {
    const r = parsearLoteColado('WAP0001234\tST-ABC123\tNotebook fictício')
    expect(r.itens).toHaveLength(1)
    expect(r.itens[0].service_tag).toBe('ST-ABC123')
  })

  // Leitura POSICIONAL: 2ª coluna vazia = sem service tag. A 3ª coluna não
  // "sobe" para o lugar da ST (senão o modelo viraria service tag).
  it('2ª coluna vazia não vira service tag', () => {
    const r = parsearLoteColado('WAP0001234\t\tNotebook fictício')
    expect(r.itens).toHaveLength(1)
    expect(r.itens[0].service_tag).toBeUndefined()
  })

  it('separador solto na ponta não vira coluna vazia', () => {
    const r = parsearLoteColado('  WAP0001234\t  \n;WAP0001235;')
    expect(r.itens.map((i) => i.patrimonio)).toEqual(['WAP0001234', 'WAP0001235'])
    expect(r.itens.every((i) => i.service_tag === undefined)).toBe(true)
  })

  it('linhas em branco não deslocam a numeração', () => {
    const r = parsearLoteColado('WAP0001234\n\n\nWAP0001235')
    expect(r.itens.map((i) => i.linha)).toEqual([1, 4])
    expect(r.linhasNaoVazias).toBe(2)
  })

  it('linha que não canonicaliza vai para invalidos com o texto cru', () => {
    const r = parsearLoteColado('WAP0001234\n12345\nFulano da Silva')
    expect(r.itens).toHaveLength(1)
    expect(r.invalidos).toEqual(['12345', 'Fulano da Silva'])
  })

  it('deduplica pela chave §5 (patrimônio + service tag), 1ª ocorrência vence', () => {
    const r = parsearLoteColado(
      'WAP0001234\nWAP0001234\nWAP0001234,ST-ABC123\nWAP0001234,ST-ABC123',
    )
    expect(r.itens).toHaveLength(2)
    expect(r.itens[0]).toMatchObject({ patrimonio: 'WAP0001234', linha: 1 })
    expect(r.itens[1]).toMatchObject({ service_tag: 'ST-ABC123', linha: 3 })
  })

  it(`acima de ${MAX_LOTE_MOVIMENTACAO} linhas devolve erro e nada mais`, () => {
    const texto = Array.from(
      { length: MAX_LOTE_MOVIMENTACAO + 1 },
      (_, i) => `WAP${String(i + 1).padStart(7, '0')}`,
    ).join('\n')
    const r = parsearLoteColado(texto)
    expect(r.erro).toContain(String(MAX_LOTE_MOVIMENTACAO))
    expect(r.erro).toContain(String(MAX_LOTE_MOVIMENTACAO + 1))
    expect(r.itens).toEqual([])
    expect(r.invalidos).toEqual([])
  })

  it(`exatamente ${MAX_LOTE_MOVIMENTACAO} linhas passa`, () => {
    const texto = Array.from(
      { length: MAX_LOTE_MOVIMENTACAO },
      (_, i) => `WAP${String(i + 1).padStart(7, '0')}`,
    ).join('\n')
    const r = parsearLoteColado(texto)
    expect(r.erro).toBeUndefined()
    expect(r.itens).toHaveLength(MAX_LOTE_MOVIMENTACAO)
  })

  it('linhas inválidas contam para o teto (são linhas do texto)', () => {
    const texto = [
      ...Array.from({ length: MAX_LOTE_MOVIMENTACAO }, () => 'lixo'),
      'WAP0001234',
    ].join('\n')
    expect(parsearLoteColado(texto).erro).toBeDefined()
  })

  it('texto vazio ou só espaços não é erro — é lote vazio', () => {
    const r = parsearLoteColado('\n   \n\t\n')
    expect(r.erro).toBeUndefined()
    expect(r.itens).toEqual([])
    expect(r.linhasNaoVazias).toBe(0)
  })
})

describe('mesmaServiceTag (desempate de patrimônio duplicado §5)', () => {
  it('ignora caixa e espaços nas pontas', () => {
    expect(mesmaServiceTag(' st-abc123 ', 'ST-ABC123')).toBe(true)
  })

  it('service tag ausente ou vazia nunca casa', () => {
    expect(mesmaServiceTag(null, null)).toBe(false)
    expect(mesmaServiceTag('', '')).toBe(false)
    expect(mesmaServiceTag('ST-ABC123', undefined)).toBe(false)
  })

  it('não normaliza hífen/ponto (transcrição da etiqueta é literal)', () => {
    expect(mesmaServiceTag('ST-ABC123', 'STABC123')).toBe(false)
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
