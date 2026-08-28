import { describe, expect, it } from 'vitest'
import {
  MSG_SEM_ITEM_DO_TIPO,
  MSG_SEM_ITEM_DO_TIPO_PENDENCIA,
  candidatosDoTipo,
  itemEscolhido,
  resolverItemDoSlug,
  resolverItemDoTipo,
  type ItemDoCatalogo,
} from '@/lib/itens/ponte-tipo-item'

const TIPOS = [
  { id: 1, slug: 'carregador', rotulo: 'Carregador' },
  { id: 2, slug: 'mochila', rotulo: 'Mochila' },
  { id: 6, slug: 'fone', rotulo: 'Fone de ouvido' },
]

function item(p: Partial<ItemDoCatalogo> & { id: number; nome: string }): ItemDoCatalogo {
  return { ativo: true, tipo_id: null, ...p }
}

describe('candidatosDoTipo', () => {
  it('só traz item ATIVO daquele tipo', () => {
    const itens = [
      item({ id: 1, nome: 'Carregador 65W', tipo_id: 1 }),
      item({ id: 2, nome: 'Carregador velho', tipo_id: 1, ativo: false }),
      item({ id: 3, nome: 'Mochila', tipo_id: 2 }),
      item({ id: 4, nome: 'Sem tipo' }),
    ]
    expect(candidatosDoTipo(itens, 1).map((i) => i.id)).toEqual([1])
  })

  it('ordena por nome (pt-BR) e desempata pelo id', () => {
    const itens = [
      item({ id: 9, nome: 'Ótimo fone', tipo_id: 6 }),
      item({ id: 3, nome: 'Fone A', tipo_id: 6 }),
      item({ id: 2, nome: 'Fone A', tipo_id: 6 }),
    ]
    expect(candidatosDoTipo(itens, 6).map((i) => i.id)).toEqual([2, 3, 9])
  })

  it('tipo nulo não tem candidato — item sem tipo nunca é candidato de ninguém', () => {
    const itens = [item({ id: 1, nome: 'Sem tipo' })]
    expect(candidatosDoTipo(itens, null)).toEqual([])
    expect(candidatosDoTipo(itens, undefined)).toEqual([])
  })
})

describe('resolverItemDoTipo — a regra das três situações', () => {
  it('exatamente UM candidato resolve sozinho', () => {
    const itens = [item({ id: 7, nome: 'Carregador 65W', tipo_id: 1 })]
    const r = resolverItemDoTipo(itens, 1)
    expect(r.situacao).toBe('resolvido')
    expect(r.situacao === 'resolvido' && r.item.id).toBe(7)
  })

  it('ZERO candidatos não bloqueia: devolve o motivo em pt-BR', () => {
    const r = resolverItemDoTipo([item({ id: 1, nome: 'Mochila', tipo_id: 2 })], 1)
    expect(r.situacao).toBe('sem_item')
    expect(r.situacao === 'sem_item' && r.motivo).toBe(MSG_SEM_ITEM_DO_TIPO)
  })

  it('DOIS OU MAIS candidatos pedem escolha, e devolve todos', () => {
    const itens = [
      item({ id: 1, nome: 'Carregador 65W', tipo_id: 1 }),
      item({ id: 2, nome: 'Carregador 90W', tipo_id: 1 }),
    ]
    const r = resolverItemDoTipo(itens, 1)
    expect(r.situacao).toBe('ambiguo')
    expect(r.situacao === 'ambiguo' && r.candidatos.map((c) => c.id)).toEqual([1, 2])
  })

  it('o motivo do caminho da pendência é outro texto', () => {
    const r = resolverItemDoTipo([], 1, MSG_SEM_ITEM_DO_TIPO_PENDENCIA)
    expect(r.situacao === 'sem_item' && r.motivo).toBe(MSG_SEM_ITEM_DO_TIPO_PENDENCIA)
  })
})

describe('resolverItemDoSlug — o caminho da pendência (§E)', () => {
  const itens = [
    item({ id: 1, nome: 'Carregador 65W', tipo_id: 1 }),
    item({ id: 3, nome: 'Mochila preta', tipo_id: 2 }),
  ]

  it('slug conhecido resolve pelo tipo correspondente', () => {
    const r = resolverItemDoSlug(itens, TIPOS, 'mochila')
    expect(r.situacao === 'resolvido' && r.item.id).toBe(3)
  })

  it('slug que não é tipo nenhum não bloqueia — é o histórico de antes do catálogo', () => {
    const r = resolverItemDoSlug(itens, TIPOS, 'cabo_hdmi_antigo')
    expect(r.situacao).toBe('sem_item')
  })

  it('slug vazio, nulo ou só espaço cai em sem_item, nunca em erro', () => {
    for (const s of ['', '   ', null, undefined]) {
      expect(resolverItemDoSlug(itens, TIPOS, s).situacao).toBe('sem_item')
    }
  })

  it('tipo existe mas nenhum item aponta para ele: sem_item, e a pendência resolve igual', () => {
    const r = resolverItemDoSlug(itens, TIPOS, 'fone')
    expect(r.situacao).toBe('sem_item')
    expect(r.situacao === 'sem_item' && r.motivo).toBe(MSG_SEM_ITEM_DO_TIPO_PENDENCIA)
  })

  it('normaliza caixa e espaço em volta do slug', () => {
    expect(resolverItemDoSlug(itens, TIPOS, '  MOCHILA ').situacao).toBe('resolvido')
  })
})

describe('itemEscolhido', () => {
  const itens = [
    item({ id: 1, nome: 'Carregador 65W', tipo_id: 1 }),
    item({ id: 2, nome: 'Carregador 90W', tipo_id: 1 }),
  ]

  it('resolvido dispensa escolha', () => {
    const r = resolverItemDoTipo([itens[0]], 1)
    expect(itemEscolhido(r)?.id).toBe(1)
  })

  it('ambíguo sem escolha não lança nada — e isso não é erro', () => {
    expect(itemEscolhido(resolverItemDoTipo(itens, 1))).toBeNull()
  })

  it('ambíguo com escolha válida devolve o item escolhido', () => {
    expect(itemEscolhido(resolverItemDoTipo(itens, 1), 2)?.id).toBe(2)
  })

  it('escolha fora dos candidatos não vira lançamento', () => {
    expect(itemEscolhido(resolverItemDoTipo(itens, 1), 99)).toBeNull()
  })

  it('sem_item nunca produz item, nem com escolha teimosa', () => {
    expect(itemEscolhido(resolverItemDoTipo([], 1), 1)).toBeNull()
  })
})
