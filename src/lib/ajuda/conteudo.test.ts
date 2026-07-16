import { describe, it, expect } from 'vitest'
import {
  SECOES,
  textoDaSecao,
  filtrarSecoes,
  type Bloco,
  type Secao,
} from '@/lib/ajuda/conteudo'
import { normalizarBusca } from '@/lib/ajuda/busca'
import {
  STATUS_META,
  STATUS_ORDEM,
  TIPO_META,
  TIPO_LANCAMENTO_META,
  TERMO_META,
  GRUPO_ITEM_ORDEM,
} from '@/lib/dominio'

type BlocoGlossario = Extract<Bloco, { tipo: 'glossario' }>
type BlocoMovimentacoes = Extract<Bloco, { tipo: 'movimentacoes' }>

// Helpers de introspeccao: achatam os blocos das secoes para conferir cobertura.
function todosOsBlocos(): Bloco[] {
  return SECOES.flatMap((s) => s.blocos)
}
function secao(id: string): Secao {
  const s = SECOES.find((x) => x.id === id)
  if (!s) throw new Error(`Seção não encontrada: ${id}`)
  return s
}
function glossarioPor(badge: BlocoGlossario['badge']): BlocoGlossario[] {
  return todosOsBlocos().filter(
    (b): b is BlocoGlossario => b.tipo === 'glossario' && b.badge === badge,
  )
}

describe('normalizarBusca', () => {
  it('tira acento e caixa', () => {
    expect(normalizarBusca('Manutenção')).toBe('manutencao')
    expect(normalizarBusca('SAÍDA')).toBe('saida')
    expect(normalizarBusca('  Atrelar ')).toBe('atrelar')
  })
})

describe('cobertura do glossario (derivada de dominio.ts)', () => {
  it('cobre os 8 status de ativo, na ordem canônica', () => {
    const bloco = glossarioPor('status')[0]
    expect(bloco).toBeDefined()
    expect(bloco.itens.map((v) => v.chave)).toEqual(STATUS_ORDEM)
    expect(bloco.itens).toHaveLength(8)
  })

  it('cobre os 13 tipos de movimentação', () => {
    const bloco = todosOsBlocos().find(
      (b): b is BlocoMovimentacoes => b.tipo === 'movimentacoes',
    )
    expect(bloco).toBeDefined()
    const chaves = bloco!.itens.map((v) => v.chave).sort()
    expect(chaves).toEqual(Object.keys(TIPO_META).sort())
    expect(bloco!.itens).toHaveLength(13)
  })

  it('cobre os 6 tipos de lançamento de item, com a descrição de dominio.ts', () => {
    const bloco = glossarioPor('tipoLanc')[0]
    expect(bloco).toBeDefined()
    expect(bloco.itens).toHaveLength(6)
    for (const v of bloco.itens) {
      const meta = TIPO_LANCAMENTO_META[v.chave as keyof typeof TIPO_LANCAMENTO_META]
      expect(v.rotulo).toBe(meta.rotulo)
      expect(v.descricao).toBe(meta.descricao)
    }
  })

  it('cobre os 4 status de termo', () => {
    const bloco = glossarioPor('termo')[0]
    expect(bloco).toBeDefined()
    expect(bloco.itens).toHaveLength(4)
    expect(bloco.itens.map((v) => v.chave).sort()).toEqual(Object.keys(TERMO_META).sort())
  })

  it('cobre os grupos de item', () => {
    const grupos = secao('itens').blocos.find(
      (b): b is BlocoGlossario => b.tipo === 'glossario' && b.badge === 'neutro',
    )
    expect(grupos).toBeDefined()
    expect(grupos!.itens.map((v) => v.chave)).toEqual(GRUPO_ITEM_ORDEM)
  })

  it('descreve os quatro buckets de pendência', () => {
    const texto = textoDaSecao(secao('pendencias'))
    for (const termo of ['termo', 'itens faltantes', 'triagem', 'outras']) {
      expect(texto).toContain(normalizarBusca(termo))
    }
  })

  it('os rótulos de status vêm de dominio.ts (não são texto solto)', () => {
    const bloco = glossarioPor('status')[0]
    for (const v of bloco.itens) {
      // se o rótulo divergir de STATUS_META, o StatusBadge renderizaria outro
      // texto — este assert trava a derivação.
      expect(v.rotulo).toBe(STATUS_META[v.chave as keyof typeof STATUS_META].rotulo)
    }
  })
})

describe('filtrarSecoes', () => {
  it('consulta vazia devolve todas as seções', () => {
    expect(filtrarSecoes(SECOES, '')).toHaveLength(SECOES.length)
    expect(filtrarSecoes(SECOES, '   ')).toHaveLength(SECOES.length)
  })

  it('acha a seção de movimentações buscando sem acento', () => {
    const achadas = filtrarSecoes(SECOES, 'manutencao')
    expect(achadas.map((s) => s.id)).toContain('movimentacoes')
  })

  it('acha itens por um termo específico do glossário derivado', () => {
    const achadas = filtrarSecoes(SECOES, 'atrelar')
    expect(achadas.map((s) => s.id)).toContain('itens')
  })

  it('não acha nada para um termo ausente', () => {
    expect(filtrarSecoes(SECOES, 'xpto-inexistente-123')).toHaveLength(0)
  })

  it('cada seção tem id único e texto pesquisável não vazio', () => {
    const ids = SECOES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of SECOES) expect(textoDaSecao(s).length).toBeGreaterThan(0)
  })
})
