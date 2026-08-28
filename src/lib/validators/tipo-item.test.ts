import { describe, it, expect } from 'vitest'
import {
  atualizarTipoItemSchema,
  proximaOrdemDeTipo,
  sugerirSlug,
  tipoItemSchema,
} from '@/lib/validators/tipo-item'

// ORDEM DO TIPO DE ITEM — a regressão do zero falsy (revisão de 28/08/2026).
//
// `criarTipoItem` decide a ordem automática ("10 acima da maior") quando o admin não
// informa nada. A primeira versão perguntava isso com `if (!ordem)` sobre um schema
// que tinha `.default(0)` — e aí "não informou" e "informou zero" chegavam
// INDISTINGUÍVEIS. Consequência: o admin que digitava `0` querendo o TOPO da lista
// via o tipo aparecer no FIM, sem aviso nenhum de que o valor foi descartado.
//
// A correção mora no schema (`optional()` em vez de `default(0)`), então é aqui que
// ela se prova. O que estes testes travam é a DISTINÇÃO, não o número.

describe('tipoItemSchema · a ordem distingue "não informou" de "informou zero"', () => {
  it('sem ordem, o campo chega undefined — a action é que decide', () => {
    const r = tipoItemSchema.parse({ slug: 'fone_bt', rotulo: 'Fone bluetooth' })
    expect(r.ordem).toBeUndefined()
  })

  it('com ordem 0, o ZERO sobrevive (é o topo da lista, não a ausência)', () => {
    const r = tipoItemSchema.parse({ slug: 'fone_bt', rotulo: 'Fone bluetooth', ordem: 0 })
    expect(r.ordem).toBe(0)
  })

  it('ordem em string (vem de formulário) coage para número', () => {
    const r = tipoItemSchema.parse({ slug: 'fone_bt', rotulo: 'Fone bluetooth', ordem: '30' })
    expect(r.ordem).toBe(30)
  })

  it('ordem negativa e acima de 999 são recusadas', () => {
    expect(tipoItemSchema.safeParse({ slug: 'x1', rotulo: 'Xis', ordem: -1 }).success).toBe(false)
    expect(tipoItemSchema.safeParse({ slug: 'x1', rotulo: 'Xis', ordem: 1000 }).success).toBe(false)
  })
})

describe('atualizarTipoItemSchema · na edição a ordem é obrigatória', () => {
  // Na edição não existe "decida por mim": a tela manda a ordem atual quando o campo
  // fica em branco. Um `.default(0)` aqui faria o campo apagado jogar o tipo para o
  // topo — exatamente o oposto do que o texto de ajuda do campo promete.
  it('recusa a edição sem ordem', () => {
    const r = atualizarTipoItemSchema.safeParse({
      id: 3,
      rotulo: 'Fone de ouvido',
      ativo: true,
    })
    expect(r.success).toBe(false)
  })

  it('aceita a edição com ordem 0', () => {
    const r = atualizarTipoItemSchema.parse({
      id: 3,
      rotulo: 'Fone de ouvido',
      ativo: true,
      ordem: 0,
    })
    expect(r.ordem).toBe(0)
  })

  it('o slug NÃO entra na edição (slug gravado nunca muda)', () => {
    const r = atualizarTipoItemSchema.parse({
      id: 3,
      rotulo: 'Fone de ouvido',
      ativo: true,
      ordem: 60,
      slug: 'outro_slug',
    })
    expect(r).not.toHaveProperty('slug')
  })
})

describe('proximaOrdemDeTipo', () => {
  it('sem tipo nenhum, começa em 0', () => {
    expect(proximaOrdemDeTipo(null)).toBe(0)
    expect(proximaOrdemDeTipo(undefined)).toBe(0)
  })

  it('sobe de 10 em 10 para caber tipo novo entre dois existentes', () => {
    expect(proximaOrdemDeTipo(0)).toBe(10)
    expect(proximaOrdemDeTipo(70)).toBe(80)
  })

  it('não passa do teto de 999 do schema', () => {
    expect(proximaOrdemDeTipo(995)).toBe(999)
    expect(proximaOrdemDeTipo(999)).toBe(999)
  })
})

describe('sugerirSlug', () => {
  it('tira acento, minúsculas e separa por underscore', () => {
    expect(sugerirSlug('Fone de ouvido')).toBe('fone_de_ouvido')
    expect(sugerirSlug('Mochila Executiva')).toBe('mochila_executiva')
  })

  it('o que sai já passa no formato que o banco cobra', () => {
    expect(tipoItemSchema.safeParse({ slug: sugerirSlug('Cabo HDMI'), rotulo: 'Cabo HDMI' }).success).toBe(true)
  })
})
