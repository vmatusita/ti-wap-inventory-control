import { describe, expect, it } from 'vitest'
import {
  DATA_MAX,
  DATA_MIN,
  MAX_PAGE,
  MAX_SMALLINT,
  dataISO,
  ehUuid,
  idNumerico,
  paginaNumerica,
} from '@/lib/url-params'

// Os três parsers de searchParam compartilhados pelas listas e pelas actions de
// export (F12 · W6A). Cada caso aqui é um bug que já aconteceu em produção ou
// que a auditoria da F12 (W4) provou alcançável.

describe('idNumerico', () => {
  it('aceita id dentro da faixa de smallint', () => {
    expect(idNumerico('1')).toBe(1)
    expect(idNumerico('3')).toBe(3)
    expect(idNumerico(String(MAX_SMALLINT))).toBe(MAX_SMALLINT)
  })

  it('ignora ausente, vazio e não numérico', () => {
    expect(idNumerico(undefined)).toBeNull()
    expect(idNumerico(null)).toBeNull()
    expect(idNumerico('')).toBeNull()
    expect(idNumerico('abc')).toBeNull()
    expect(idNumerico('1.5')).toBeNull()
    expect(idNumerico(' 1')).toBeNull()
    expect(idNumerico('-1')).toBeNull()
  })

  it('ignora zero e valor acima do smallint (22003 no Postgres)', () => {
    expect(idNumerico('0')).toBeNull()
    expect(idNumerico(String(MAX_SMALLINT + 1))).toBeNull()
    expect(idNumerico('99999')).toBeNull()
    expect(idNumerico('99999999999999999999')).toBeNull()
  })
})

describe('dataISO', () => {
  it('aceita data real no formato yyyy-MM-dd', () => {
    expect(dataISO('2026-07-23')).toBe('2026-07-23')
    expect(dataISO(DATA_MIN)).toBe(DATA_MIN)
    expect(dataISO(DATA_MAX)).toBe(DATA_MAX)
  })

  it('ignora formato inválido', () => {
    expect(dataISO(undefined)).toBeNull()
    expect(dataISO(null)).toBeNull()
    expect(dataISO('')).toBeNull()
    expect(dataISO('23/07/2026')).toBeNull()
    expect(dataISO('2026-7-3')).toBeNull()
    expect(dataISO('2026-07-23T00:00:00')).toBeNull()
  })

  it('ignora data inexistente que o Date "rolaria" para o mês seguinte', () => {
    expect(dataISO('2026-02-31')).toBeNull()
    expect(dataISO('2026-13-01')).toBeNull()
    expect(dataISO('2026-00-10')).toBeNull()
  })

  // O JS TEM ano zero, o Postgres NÃO: `?de=0000-01-01` passa no round-trip do
  // Date, chega ao banco como literal de `date` e volta 22008. Era o achado
  // F12-W4-04 (o export de /itens era a única cópia sem esta guarda).
  it('ignora data fora da faixa sã do Postgres', () => {
    expect(dataISO('0000-01-01')).toBeNull()
    expect(dataISO('1899-12-31')).toBeNull()
    expect(dataISO('3000-01-01')).toBeNull()
    expect(dataISO('9999-12-31')).toBeNull()
  })
})

describe('paginaNumerica', () => {
  it('aceita página dentro da faixa', () => {
    expect(paginaNumerica('1')).toBe(1)
    expect(paginaNumerica('39')).toBe(39)
    expect(paginaNumerica(String(MAX_PAGE))).toBe(MAX_PAGE)
  })

  it('cai para 1 quando o param é ausente, vazio ou lixo', () => {
    expect(paginaNumerica(undefined)).toBe(1)
    expect(paginaNumerica(null)).toBe(1)
    expect(paginaNumerica('')).toBe(1)
    expect(paginaNumerica('abc')).toBe(1)
    expect(paginaNumerica('2.5')).toBe(1)
    expect(paginaNumerica('-3')).toBe(1)
    expect(paginaNumerica('0')).toBe(1)
  })

  // Sem teto, `1e20` vira `offset=3e+21`: o PostgREST descarta em SILÊNCIO (200,
  // sem PGRST103) e a paginação trava com notação científica no rodapé.
  it('cai para 1 acima do teto, em vez de virar notação científica no range()', () => {
    expect(paginaNumerica('99999999999999999999')).toBe(1)
    expect(paginaNumerica(String(MAX_PAGE + 1))).toBe(1)
    expect(paginaNumerica('9007199254740993')).toBe(1)
  })
})

// Id de tabela com PK uuid (ativos, movimentacoes, termos_gerados,
// relatorios_gerados) que chega pelo PATH. Sem a guarda, um valor fora do formato
// vira 22P02 ("invalid input syntax for type uuid"), a leitura LANÇA e a rota cai
// no error boundary genérico — onde o certo é o 404 que um uuid válido
// inexistente já recebe.
describe('ehUuid', () => {
  it('aceita uuid canônico em qualquer caixa e com espaços nas pontas', () => {
    expect(ehUuid('3e9376ee-6350-4f80-a3b5-6dd989b2ac77')).toBe(true)
    expect(ehUuid('3E9376EE-6350-4F80-A3B5-6DD989B2AC77')).toBe(true)
    expect(ehUuid('  3e9376ee-6350-4f80-a3b5-6dd989b2ac77  ')).toBe(true)
  })

  it('recusa ausente, vazio e texto qualquer', () => {
    expect(ehUuid(undefined)).toBe(false)
    expect(ehUuid(null)).toBe(false)
    expect(ehUuid('')).toBe(false)
    expect(ehUuid('   ')).toBe(false)
    expect(ehUuid('teste')).toBe(false)
    expect(ehUuid('WAP0004491')).toBe(false)
  })

  it('recusa uuid truncado, longo demais ou com caractere fora do hex', () => {
    expect(ehUuid('3e9376ee-6350-4f80-a3b5-6dd989b2ac7')).toBe(false)
    expect(ehUuid('3e9376ee-6350-4f80-a3b5-6dd989b2ac777')).toBe(false)
    expect(ehUuid('3e9376ee63504f80a3b56dd989b2ac77')).toBe(false)
    expect(ehUuid('3e9376ez-6350-4f80-a3b5-6dd989b2ac77')).toBe(false)
  })
})
