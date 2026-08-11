import { describe, it, expect } from 'vitest'
import {
  tiposComunsPara,
  tiposManuaisPara,
  TIPOS_FORA_DO_LOTE_MANUAL,
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

// F15 — trava do PAR obrigatório: `troca` (e `compra`, `devolucao_fornecedor`) constam
// em TRANSICOES (cópia fiel da spec §4) mas NUNCA podem ser selecionáveis no formulário
// manual de nova movimentação (têm fluxo próprio/RPC). Regressão real corrigida na F15:
// `troca` entrou em TRANSICOES.em_estoque mas o filtro do form não a excluía.
describe('tiposManuaisPara (fluxo próprio nunca vaza para o select manual)', () => {
  it('nenhum status oferece compra, troca ou devolucao_fornecedor', () => {
    for (const status of Constants.public.Enums.status_ativo) {
      const tipos = tiposManuaisPara([status])
      for (const fora of TIPOS_FORA_DO_LOTE_MANUAL) {
        expect(tipos).not.toContain(fora)
      }
    }
  })

  it('em_estoque: a interseção CRUA tem troca/compra, mas o manual as exclui', () => {
    // Prova que a exclusão está fazendo trabalho (senão o teste acima passaria à toa).
    expect(tiposComunsPara(['em_estoque'])).toContain('troca')
    expect(tiposComunsPara(['em_estoque'])).toContain('compra')
    expect(tiposManuaisPara(['em_estoque'])).not.toContain('troca')
    expect(tiposManuaisPara(['em_estoque'])).not.toContain('compra')
    // ...e continua oferecendo os tipos legítimos do dia a dia.
    expect(tiposManuaisPara(['em_estoque'])).toContain('saida')
  })
})

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

  it('devolvido_fornecedor só admite ajuste (terminal, F14)', () => {
    expect(tiposComunsPara(['devolvido_fornecedor'])).toEqual(['ajuste'])
  })

  it('em_manutencao permite devolucao_fornecedor (F14)', () => {
    expect(tiposComunsPara(['em_manutencao'])).toContain('devolucao_fornecedor')
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

  // F34 (revisão do intervalo F32→F34, 11/08/2026) — a re-reserva (reserva
  // sobre 'reservado') passou a ser possível; sem a regra cruzada abaixo, uma
  // reserva em branco por cima de outra apagava o detentor em silêncio.
  it('rejeita reserva sem colaborador NEM setor (regra do superRefine, F34)', () => {
    const r = movimentacaoSchema.safeParse({
      tipo: 'reserva',
      ativo_id: UUID,
      data: DATA_OK,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.includes('colaborador'))
      expect(issue?.message).toBe('Informe o colaborador ou o setor de destino')
    }
  })

  it('aceita reserva só com colaborador', () => {
    const r = movimentacaoSchema.safeParse({
      tipo: 'reserva',
      ativo_id: UUID,
      data: DATA_OK,
      colaborador: 'Beltrano Ficticio',
    })
    expect(r.success).toBe(true)
  })

  it('aceita reserva só com setor', () => {
    const r = movimentacaoSchema.safeParse({
      tipo: 'reserva',
      ativo_id: UUID,
      data: DATA_OK,
      setor: 'Financeiro',
    })
    expect(r.success).toBe(true)
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

  // Patrimônio NÃO-CANÔNICO é legítimo (spec §5 + decisão F7J: a operação
  // FORÇAR criou patrimônios de verdade fora do padrão, e a carga do go-live
  // trouxe outros — ~5,6% do acervo do ensaio). O combobox acha esses ativos;
  // o Colar lista tem de achar também, em vez de acusar a linha do operador.
  it('mantém como candidato o token que não canonicaliza mas parece patrimônio', () => {
    const r = parsearLoteColado('WAP0001234\nTEC1ABC234\nABCDEF\n1234\nABC-1234-XY')
    expect(r.invalidos).toEqual([])
    expect(r.itens.map((i) => i.patrimonio)).toEqual([
      'WAP0001234',
      'TEC1ABC234',
      'ABCDEF',
      '1234',
      'ABC-1234-XY',
    ])
  })

  it('normaliza o token cru (trim + maiúsculas) e guarda a forma como foi colada', () => {
    const r = parsearLoteColado('  tec1abc234  ')
    expect(r.itens[0].patrimonio).toBe('TEC1ABC234')
    // A busca leva as DUAS formas: o `in` do PostgREST é case-sensitive e o
    // acervo tem patrimônio gravado em minúsculas.
    expect(r.itens[0].patrimonioComoColado).toBe('tec1abc234')
  })

  it('não marca patrimonioComoColado quando a linha canonicaliza', () => {
    const r = parsearLoteColado('wap1234')
    expect(r.itens[0].patrimonio).toBe('WAP0001234')
    expect(r.itens[0].patrimonioComoColado).toBeUndefined()
  })

  it('só o que nem parece patrimônio vai para invalidos', () => {
    const r = parsearLoteColado('WAP0001234\nabc\nFulano da Silva\n???\nlinha com espaço')
    expect(r.itens).toHaveLength(1)
    expect(r.invalidos).toEqual(['abc', 'Fulano da Silva', '???', 'linha com espaço'])
  })

  it('service tag continua sendo lida na linha do token cru', () => {
    const r = parsearLoteColado('TEC1ABC234\tST-ABC123')
    expect(r.itens[0]).toMatchObject({
      patrimonio: 'TEC1ABC234',
      service_tag: 'ST-ABC123',
    })
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
  it('cobre EXATAMENTE os tipos do enum, sem faltar nem sobrar', () => {
    expect(Object.keys(CAMPOS_POR_TIPO).sort()).toEqual(
      [...Constants.public.Enums.tipo_movimentacao].sort(),
    )
  })

  it('saida/emprestimo/reserva pedem colaborador OU setor', () => {
    const comRegra = Object.entries(CAMPOS_POR_TIPO)
      .filter(([, meta]) => meta.exigeColaboradorOuSetor)
      .map(([t]) => t)
      .sort()
    expect(comRegra).toEqual(['emprestimo', 'reserva', 'saida'])
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
