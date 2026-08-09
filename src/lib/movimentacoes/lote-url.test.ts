import { describe, expect, it } from 'vitest'
import { avisoDoLoteInicial, parseIdsDeAtivos, SEPARADOR_IDS } from './lote-url'
import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'

// ATV-03 (F30) — o `?ativos=` é o único caminho do sistema em que uma LISTA de
// ids entra pela URL. Tudo aqui existe porque a querystring é território hostil:
// link colado, histórico velho, alguém editando a barra de endereço.

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

function uuidFalso(n: number): string {
  const h = n.toString(16).padStart(12, '0')
  return `44444444-4444-4444-8444-${h}`
}

describe('parseIdsDeAtivos', () => {
  it('devolve lote vazio para ausente, vazio e só separadores', () => {
    for (const bruto of [undefined, null, '', '   ', ',', ',,,', ' , , ']) {
      expect(parseIdsDeAtivos(bruto)).toEqual({
        ids: [],
        invalidos: 0,
        repetidos: 0,
        excedentes: 0,
      })
    }
  })

  it('preserva a ordem de chegada — é a ordem em que o operador viu as linhas', () => {
    expect(parseIdsDeAtivos([C, A, B].join(SEPARADOR_IDS)).ids).toEqual([C, A, B])
  })

  it('tolera espaço em volta dos ids (link quebrado por e-mail)', () => {
    expect(parseIdsDeAtivos(` ${A} , ${B} `).ids).toEqual([A, B])
  })

  it('colapsa repetido e conta quantos colapsou', () => {
    const r = parseIdsDeAtivos([A, B, A, A].join(SEPARADOR_IDS))
    expect(r.ids).toEqual([A, B])
    expect(r.repetidos).toBe(2)
  })

  it('trata caixa alta como o MESMO ativo (o Postgres também trata)', () => {
    const r = parseIdsDeAtivos([A.toUpperCase(), A].join(SEPARADOR_IDS))
    expect(r.ids).toEqual([A])
    expect(r.repetidos).toBe(1)
  })

  // Esta é a peneira que impede a página de cair: `.in('id', …)` com um pedaço
  // que não é UUID devolve `invalid input syntax for type uuid`, e não "vazio".
  it('descarta o que não é UUID em vez de mandar para o banco', () => {
    const r = parseIdsDeAtivos(`${A},lixo,'; drop table ativos;--,${B},123`)
    expect(r.ids).toEqual([A, B])
    expect(r.invalidos).toBe(3)
  })

  it('descarta um UUID quase certo (um dígito a mais ou a menos)', () => {
    const r = parseIdsDeAtivos(`${A}0,${A.slice(0, -1)}`)
    expect(r.ids).toEqual([])
    expect(r.invalidos).toBe(2)
  })

  it('corta no teto do lote e conta os excedentes', () => {
    const muitos = Array.from({ length: MAX_LOTE_MOVIMENTACAO + 5 }, (_, i) => uuidFalso(i))
    const r = parseIdsDeAtivos(muitos.join(SEPARADOR_IDS))
    expect(r.ids).toHaveLength(MAX_LOTE_MOVIMENTACAO)
    expect(r.ids).toEqual(muitos.slice(0, MAX_LOTE_MOVIMENTACAO))
    expect(r.excedentes).toBe(5)
  })

  it('o repetido não consome vaga do teto', () => {
    // 30 distintos + 30 repetições dos mesmos = cabe tudo, nada excede.
    const distintos = Array.from({ length: MAX_LOTE_MOVIMENTACAO }, (_, i) => uuidFalso(i))
    const r = parseIdsDeAtivos([...distintos, ...distintos].join(SEPARADOR_IDS))
    expect(r.ids).toHaveLength(MAX_LOTE_MOVIMENTACAO)
    expect(r.repetidos).toBe(MAX_LOTE_MOVIMENTACAO)
    expect(r.excedentes).toBe(0)
  })

  it('aceita teto explícito (o chamador pode apertar, nunca afrouxar sem querer)', () => {
    const r = parseIdsDeAtivos([A, B, C].join(SEPARADOR_IDS), 2)
    expect(r.ids).toEqual([A, B])
    expect(r.excedentes).toBe(1)
  })

  it('teto zero devolve lote vazio, e todo id vira excedente', () => {
    const r = parseIdsDeAtivos([A, B].join(SEPARADOR_IDS), 0)
    expect(r.ids).toEqual([])
    expect(r.excedentes).toBe(2)
  })
})

describe('avisoDoLoteInicial', () => {
  const nada = { pedidos: 5, encontrados: 5, invalidos: 0, excedentes: 0 }

  it('cala quando todo mundo entrou', () => {
    expect(avisoDoLoteInicial(nada)).toBeNull()
    expect(avisoDoLoteInicial({ pedidos: 0, encontrados: 0, invalidos: 0, excedentes: 0 })).toBeNull()
  })

  it('nomeia quantos sumiram do acervo, no singular e no plural', () => {
    expect(avisoDoLoteInicial({ ...nada, encontrados: 4 })).toBe(
      '1 ativo não foi encontrado e ficou de fora do lote — pode ter sido apagado.',
    )
    expect(avisoDoLoteInicial({ ...nada, encontrados: 2 })).toBe(
      '3 ativos não foram encontrados e ficaram de fora do lote — podem ter sido apagados.',
    )
  })

  it('nomeia o lixo da URL', () => {
    expect(avisoDoLoteInicial({ ...nada, invalidos: 1 })).toBe(
      '1 endereço de ativo veio quebrado no link.',
    )
    expect(avisoDoLoteInicial({ ...nada, invalidos: 2 })).toContain(
      '2 endereços de ativo vieram quebrados no link.',
    )
  })

  it('cita o TETO QUE FOI USADO, e não a constante, quando o corte veio de outro', () => {
    // `parseIdsDeAtivos` recebe o teto por parâmetro; a frase precisa dizer o
    // mesmo número, senão o operador lê um limite que não foi o aplicado.
    const msg = avisoDoLoteInicial({ ...nada, excedentes: 2, teto: 3 })
    expect(msg).toContain('o lote aceita 3 por movimentação')
    expect(msg).not.toContain(`${MAX_LOTE_MOVIMENTACAO} por movimentação`)
  })

  it('cita o teto pela constante real quando o lote foi cortado', () => {
    const msg = avisoDoLoteInicial({ ...nada, excedentes: 7 })
    expect(msg).toContain('7 ativos ficaram de fora')
    expect(msg).toContain(`o lote aceita ${MAX_LOTE_MOVIMENTACAO} por movimentação`)
    expect(msg).toContain('Registre o resto em outro lote.')
  })

  it('soma os três motivos numa frase só', () => {
    const msg = avisoDoLoteInicial({
      pedidos: 30,
      encontrados: 28,
      invalidos: 1,
      excedentes: 4,
    })
    expect(msg).toContain('2 ativos não foram encontrados')
    expect(msg).toContain('1 endereço de ativo veio quebrado')
    expect(msg).toContain('4 ativos ficaram de fora')
  })

  it('nunca inventa sumiço quando o banco devolve mais do que se pediu', () => {
    // Defensivo: `encontrados > pedidos` não deveria acontecer, mas um número
    // negativo na frase seria pior do que o silêncio.
    expect(avisoDoLoteInicial({ pedidos: 2, encontrados: 3, invalidos: 0, excedentes: 0 })).toBeNull()
  })
})
