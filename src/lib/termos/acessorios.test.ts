import { describe, expect, it } from 'vitest'
import {
  montarLinhaDeAcessorios,
  type LancamentoDeAcessorio,
  type TipoDeAcessorio,
} from '@/lib/termos/acessorios'

// Os tipos do teste espelham a forma do catálogo (`tipos_item`, F37) sem depender
// do banco: `ordem` é o que manda, e o rótulo é o desempate.
const TIPOS: TipoDeAcessorio[] = [
  { id: 1, rotulo: 'Carregador', ordem: 10 },
  { id: 2, rotulo: 'Mochila', ordem: 20 },
  { id: 3, rotulo: 'Mouse', ordem: 30 },
  { id: 4, rotulo: 'Teclado', ordem: 40 },
  { id: 5, rotulo: 'Mousepad', ordem: 50 },
  { id: 6, rotulo: 'Fone de ouvido', ordem: 60 },
  { id: 7, rotulo: 'Cabo', ordem: 70 },
]

const l = (tipo_id: number | null, quantidade = 1): LancamentoDeAcessorio => ({
  tipo_id,
  quantidade,
})

// Os tetos REAIS do `camposTermoSchema` — a função existe para não estourá-los.
const LIMITE_ACESSORIOS = 600
const LIMITE_OUTROS_COMPONENTES = 400

describe('montarLinhaDeAcessorios', () => {
  it('sem lançamento nenhum devolve linha vazia e nada descartado', () => {
    expect(montarLinhaDeAcessorios([], TIPOS, LIMITE_ACESSORIOS)).toEqual({
      linha: '',
      descartados: 0,
    })
  })

  it('soma 1 imprime só o rótulo; soma maior imprime "Rótulo (N)"', () => {
    const r = montarLinhaDeAcessorios(
      [l(6), l(3), l(3), l(4), l(2)],
      TIPOS,
      LIMITE_ACESSORIOS,
    )
    // Ordem pela `ordem` do tipo: Mochila(20) → Mouse(30) → Teclado(40) → Fone(60).
    expect(r.linha).toBe('Mochila, Mouse (2), Teclado, Fone de ouvido')
    expect(r.descartados).toBe(0)
  })

  it('soma as quantidades do MESMO tipo vindas de itens diferentes', () => {
    // Dois lançamentos do tipo 3, com quantidades 2 e 3 → "Mouse (5)".
    const r = montarLinhaDeAcessorios([l(3, 2), l(3, 3)], TIPOS, LIMITE_ACESSORIOS)
    expect(r.linha).toBe('Mouse (5)')
  })

  it('descarta item sem tipo e conta quantos foram (D8)', () => {
    const r = montarLinhaDeAcessorios(
      [l(3), l(null), l(null), l(6)],
      TIPOS,
      LIMITE_ACESSORIOS,
    )
    expect(r.linha).toBe('Mouse, Fone de ouvido')
    expect(r.descartados).toBe(2)
  })

  it('descarta — e conta — o tipo que não existe no catálogo recebido', () => {
    const r = montarLinhaDeAcessorios([l(3), l(999)], TIPOS, LIMITE_ACESSORIOS)
    expect(r.linha).toBe('Mouse')
    expect(r.descartados).toBe(1)
  })

  it('tipo DESATIVADO entra na linha — o histórico é fato', () => {
    // A função não conhece `ativo`: quem chama passa o catálogo INTEIRO
    // (`listarTiposItem`), e é isso que faz o tipo desativado continuar legível.
    const comDesativado: TipoDeAcessorio[] = [
      ...TIPOS,
      { id: 90, rotulo: 'Adaptador (fora de linha)', ordem: 5 },
    ]
    const r = montarLinhaDeAcessorios([l(90), l(3)], comDesativado, LIMITE_ACESSORIOS)
    expect(r.linha).toBe('Adaptador (fora de linha), Mouse')
    expect(r.descartados).toBe(0)
  })

  it('quantidade zero ou negativa não entra na linha', () => {
    const r = montarLinhaDeAcessorios([l(3, 0), l(4, -1), l(6, 1)], TIPOS, LIMITE_ACESSORIOS)
    expect(r.linha).toBe('Fone de ouvido')
    // Não é descarte por falta de tipo — o tipo existe; só não há o que somar.
    expect(r.descartados).toBe(0)
  })

  it('ordena pela `ordem` do tipo, não pela ordem de chegada', () => {
    const r = montarLinhaDeAcessorios([l(7), l(1), l(5)], TIPOS, LIMITE_ACESSORIOS)
    expect(r.linha).toBe('Carregador, Mousepad, Cabo')
  })

  it('desempata pelo rótulo quando a `ordem` é a mesma, e depois pelo id', () => {
    const empatados: TipoDeAcessorio[] = [
      { id: 30, rotulo: 'Zebra', ordem: 10 },
      { id: 10, rotulo: 'Ábaco', ordem: 10 },
      { id: 20, rotulo: 'Mesa', ordem: 10 },
    ]
    const r = montarLinhaDeAcessorios([l(30), l(20), l(10)], empatados, LIMITE_ACESSORIOS)
    // localeCompare('pt-BR') põe "Ábaco" antes de "Mesa" (o acento não desloca).
    expect(r.linha).toBe('Ábaco, Mesa, Zebra')
  })

  it('é determinística: a mesma entrada embaralhada gera a MESMA linha', () => {
    const entrada = [l(6), l(3), l(1), l(4), l(2), l(3)]
    const a = montarLinhaDeAcessorios(entrada, TIPOS, LIMITE_ACESSORIOS).linha
    const b = montarLinhaDeAcessorios([...entrada].reverse(), TIPOS, LIMITE_ACESSORIOS).linha
    expect(a).toBe(b)
    expect(a).toBe('Carregador, Mochila, Mouse (2), Teclado, Fone de ouvido')
  })

  // ---- As duas exclusões da §C.2 -------------------------------------------

  it('o INVERSO de estorno não entra na linha (estorna_id preenchido)', () => {
    // O inverso pertence à movimentação DE ESTORNO (0121/0122). Preparando termo
    // sobre a própria movimentação de estorno, ele apareceria como se fosse
    // acessório devolvido — e o papel diria que voltou o que na verdade foi
    // desfeito.
    const r = montarLinhaDeAcessorios(
      [
        { tipo_id: 3, quantidade: 1 },
        { tipo_id: 6, quantidade: 1, estorna_id: 'c0ffee00-0000-4000-8000-000000000001' },
      ],
      TIPOS,
      LIMITE_ACESSORIOS,
    )
    expect(r.linha).toBe('Mouse')
    // Não é descarte por falta de tipo: o tipo existe, a linha é que não é deste
    // documento.
    expect(r.descartados).toBe(0)
  })

  it('o lançamento nascido de PENDÊNCIA não entra na linha (pendencia_item_id preenchido)', () => {
    // Item recuperado semanas depois não pode aparecer como "voltou" num papel
    // cuja {observacao} o declara faltante — as duas linhas se contradiriam no
    // mesmo documento.
    const r = montarLinhaDeAcessorios(
      [
        { tipo_id: 3, quantidade: 1 },
        { tipo_id: 2, quantidade: 1, pendencia_item_id: 'dec0de00-0000-4000-8000-000000000002' },
      ],
      TIPOS,
      LIMITE_OUTROS_COMPONENTES,
    )
    expect(r.linha).toBe('Mouse')
    expect(r.descartados).toBe(0)
  })

  it('linha marcada E sem tipo não conta como descartada — ela nem é deste documento', () => {
    const r = montarLinhaDeAcessorios(
      [
        { tipo_id: 3, quantidade: 1 },
        { tipo_id: null, quantidade: 1, estorna_id: 'c0ffee00-0000-4000-8000-000000000003' },
      ],
      TIPOS,
      LIMITE_ACESSORIOS,
    )
    expect(r.linha).toBe('Mouse')
    expect(r.descartados).toBe(0)
  })

  it('marca NULA (o caso normal) entra na linha como sempre', () => {
    const r = montarLinhaDeAcessorios(
      [{ tipo_id: 3, quantidade: 1, estorna_id: null, pendencia_item_id: null }],
      TIPOS,
      LIMITE_ACESSORIOS,
    )
    expect(r.linha).toBe('Mouse')
  })

  // ---- O teto do campo -----------------------------------------------------

  /** Um catálogo grande de rótulos longos, para estourar qualquer um dos tetos. */
  function catalogoLongo(n: number, comprimento: number): TipoDeAcessorio[] {
    return Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      // Rótulo de comprimento fixo, distinto e ordenável.
      rotulo: `${String(i + 1).padStart(3, '0')}`.padEnd(comprimento, 'x'),
      ordem: (i + 1) * 10,
    }))
  }

  it('cabendo tudo, não corta nada', () => {
    const tipos = catalogoLongo(5, 20)
    const r = montarLinhaDeAcessorios(
      tipos.map((t) => l(t.id)),
      tipos,
      LIMITE_ACESSORIOS,
    )
    expect(r.linha).not.toContain(' e mais ')
    expect(r.linha.length).toBeLessThanOrEqual(LIMITE_ACESSORIOS)
  })

  it('estourando 600 (acessorios), corta no último item inteiro e diz " e mais N"', () => {
    const tipos = catalogoLongo(40, 30)
    const r = montarLinhaDeAcessorios(
      tipos.map((t) => l(t.id)),
      tipos,
      LIMITE_ACESSORIOS,
    )
    expect(r.linha.length).toBeLessThanOrEqual(LIMITE_ACESSORIOS)
    expect(r.linha).toMatch(/ e mais \d+$/)
    // Corta no item INTEIRO: o trecho antes do sufixo é uma lista de rótulos
    // completos, nenhum deles truncado no meio.
    const antes = r.linha.replace(/ e mais \d+$/, '')
    const rotulos = new Set(tipos.map((t) => t.rotulo))
    for (const parte of antes.split(', ')) {
      expect(rotulos.has(parte), `rótulo truncado: ${parte}`).toBe(true)
    }
    // E o N bate com o que ficou de fora.
    const sobraram = Number(r.linha.match(/ e mais (\d+)$/)![1])
    expect(antes.split(', ').length + sobraram).toBe(tipos.length)
  })

  it('estourando 400 (outros_componentes), o corte respeita o outro teto', () => {
    const tipos = catalogoLongo(40, 30)
    const r = montarLinhaDeAcessorios(
      tipos.map((t) => l(t.id)),
      tipos,
      LIMITE_OUTROS_COMPONENTES,
    )
    expect(r.linha.length).toBeLessThanOrEqual(LIMITE_OUTROS_COMPONENTES)
    expect(r.linha).toMatch(/ e mais \d+$/)
    // O teto menor tem de cortar MAIS do que o de 600.
    const r600 = montarLinhaDeAcessorios(
      tipos.map((t) => l(t.id)),
      tipos,
      LIMITE_ACESSORIOS,
    )
    const n400 = Number(r.linha.match(/ e mais (\d+)$/)![1])
    const n600 = Number(r600.linha.match(/ e mais (\d+)$/)![1])
    expect(n400).toBeGreaterThan(n600)
  })

  it('o sufixo com N de dois dígitos continua dentro do limite (o caso do +1 caractere)', () => {
    // Teto justo de propósito: o candidato precisa ser conferido COM o sufixo já
    // formatado, senão um N que passa de 9 devolve uma linha maior que o limite.
    const tipos = catalogoLongo(20, 10)
    for (const limite of [40, 41, 42, 43, 44, 45, 50, 60, 61, 62]) {
      const r = montarLinhaDeAcessorios(
        tipos.map((t) => l(t.id)),
        tipos,
        limite,
      )
      expect(r.linha.length, `estourou com limite ${limite}: ${r.linha}`).toBeLessThanOrEqual(
        limite,
      )
    }
  })

  it('nem um rótulo cabendo, devolve algo honesto e dentro do limite', () => {
    const tipos = catalogoLongo(3, 200)
    const r = montarLinhaDeAcessorios(
      tipos.map((t) => l(t.id)),
      tipos,
      30,
    )
    expect(r.linha.length).toBeLessThanOrEqual(30)
    expect(r.linha).toBe('3 acessórios')
  })
})
