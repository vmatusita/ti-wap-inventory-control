import { describe, expect, it } from 'vitest'
import {
  DATA_RE,
  dataNaoFuturaSchema,
  dataOpcionalSchema,
  dataRealSchema,
} from '@/lib/validators/data'
import { hojeISO, ontemISO } from '@/lib/format'

// Os schemas de data compartilhados (movimentação, item, compra, termo, geração
// de relatório). O regex sozinho confere só a FORMA — e uma data que só case
// `^\d{4}-\d{2}-\d{2}$` pode simplesmente não existir. Nesse caso ela atravessa a
// validação, chega ao insert como literal de `date` e o Postgres devolve 22008:
// a operadora recebe "Não foi possível concluir a operação" para um erro que
// pertencia ao campo. `dataISO` (@/lib/url-params) é a régua reusada aqui.

const INEXISTENTES = [
  '2026-02-30', // fevereiro não tem 30
  '2026-02-29', // 2026 não é bissexto
  '2026-04-31', // abril tem 30
  '2026-13-01', // mês 13
  '2026-00-10', // mês 0
  '2026-07-32', // dia 32
  '2026-07-00', // dia 0
]

const FORA_DA_FAIXA = ['0000-01-01', '1899-12-31', '3000-01-01', '9999-12-31']

describe('DATA_RE (só a FORMA — documenta por que os refines existem)', () => {
  it('casa datas inexistentes, que por isso precisam do refine', () => {
    for (const d of INEXISTENTES) expect(DATA_RE.test(d)).toBe(true)
    for (const d of FORA_DA_FAIXA) expect(DATA_RE.test(d)).toBe(true)
  })
})

describe('dataNaoFuturaSchema', () => {
  it('aceita hoje e ontem (fuso de São Paulo)', () => {
    expect(dataNaoFuturaSchema.safeParse(hojeISO()).success).toBe(true)
    expect(dataNaoFuturaSchema.safeParse(ontemISO()).success).toBe(true)
    expect(dataNaoFuturaSchema.safeParse('2024-02-29').success).toBe(true) // bissexto
  })

  it('recusa data mal-formada', () => {
    expect(dataNaoFuturaSchema.safeParse('30/06/2026').success).toBe(false)
    expect(dataNaoFuturaSchema.safeParse('2026-6-1').success).toBe(false)
    expect(dataNaoFuturaSchema.safeParse('').success).toBe(false)
  })

  it('recusa data INEXISTENTE, mesmo passada e no formato certo', () => {
    for (const d of INEXISTENTES) {
      expect(dataNaoFuturaSchema.safeParse(d).success, d).toBe(false)
    }
  })

  it('recusa data fora da faixa que o Postgres aceita', () => {
    for (const d of FORA_DA_FAIXA) {
      expect(dataNaoFuturaSchema.safeParse(d).success, d).toBe(false)
    }
  })

  it('segue recusando data futura', () => {
    expect(dataNaoFuturaSchema.safeParse('2999-01-01').success).toBe(false)
  })
})

describe('dataOpcionalSchema (ex.: termo_data — sem regra de futuro)', () => {
  it('aceita ausente e data real, inclusive futura', () => {
    expect(dataOpcionalSchema.safeParse(undefined).success).toBe(true)
    expect(dataOpcionalSchema.safeParse('2026-07-24').success).toBe(true)
    expect(dataOpcionalSchema.safeParse('2027-01-31').success).toBe(true)
  })

  it('recusa data inexistente ou fora da faixa', () => {
    expect(dataOpcionalSchema.safeParse('2026-02-30').success).toBe(false)
    expect(dataOpcionalSchema.safeParse('0000-01-01').success).toBe(false)
  })
})

describe('dataRealSchema (intervalos: de/ate da geração de relatório)', () => {
  const schema = dataRealSchema('Data inicial inválida')

  it('aceita data real passada OU futura (o teto é de quem chama)', () => {
    expect(schema.safeParse('2026-01-01').success).toBe(true)
    expect(schema.safeParse('2028-12-31').success).toBe(true)
  })

  it('recusa inexistente/fora da faixa com o rótulo de quem chamou', () => {
    const r = schema.safeParse('2026-02-30')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Data inicial inválida')
    expect(schema.safeParse('0000-01-01').success).toBe(false)
  })
})
