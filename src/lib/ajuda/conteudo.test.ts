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

describe('honestidade do manual (OS-F9 I5a)', () => {
  it('não promete estoque mínimo — campo que o sistema não tem (é F5)', () => {
    const tudo = SECOES.map(textoDaSecao).join(' ')
    expect(tudo).not.toContain(normalizarBusca('estoque mínimo'))
    expect(tudo).not.toContain(normalizarBusca('nível de estoque configurado'))
  })

  it('explica Falta pela semântica real da 0027 (déficit, não reposição)', () => {
    const texto = textoDaSecao(secao('itens'))
    expect(texto).toContain(normalizarBusca('atrelados + liberados − total'))
    expect(texto).toContain(normalizarBusca('déficit'))
  })

  it('descreve o catálogo de itens com os campos que existem', () => {
    expect(textoDaSecao(secao('admin'))).toContain(
      normalizarBusca('(nome, grupo, ordem)'),
    )
  })
})

describe('facilitadores documentados (OS-F9)', () => {
  function titulosDePassos(idSecao: string): string[] {
    return secao(idSecao)
      .blocos.filter((b): b is Extract<Bloco, { tipo: 'passos' }> => b.tipo === 'passos')
      .map((b) => b.titulo ?? '')
  }

  it('tem o passo a passo da bipagem por leitor de código de barras (A7)', () => {
    expect(titulosDePassos('como-fazer')).toContain(
      'Cadastrando com leitor de código de barras',
    )
    const texto = textoDaSecao(secao('como-fazer'))
    expect(texto).toContain(normalizarBusca('leitor USB'))
    expect(texto).toContain(normalizarBusca('colar lista'))
  })

  it('cita os facilitadores novos nas seções correspondentes', () => {
    const comoFazer = textoDaSecao(secao('como-fazer'))
    // M2 (busca por colaborador) · M10 (chips de data) · A1 (colar do Excel)
    expect(comoFazer).toContain(normalizarBusca('nome do colaborador'))
    expect(comoFazer).toContain(normalizarBusca('"Hoje" e "Ontem"'))
    expect(comoFazer).toContain(normalizarBusca('duas colunas direto do Excel'))
    // I6 (lançar da linha do saldo) · I3 (filtros do histórico)
    expect(comoFazer).toContain(normalizarBusca('lançar da própria linha'))
    expect(comoFazer).toContain(normalizarBusca('por período (De / Até)'))
    // T2 (badge de pendências) · T6 (copiar patrimônio)
    expect(textoDaSecao(secao('pendencias'))).toContain(normalizarBusca('selo âmbar'))
    expect(textoDaSecao(secao('acesso'))).toContain(normalizarBusca('botão de copiar'))
  })

  it('os exemplos continuam fictícios (nenhum dado real)', () => {
    const tudo = SECOES.map(textoDaSecao).join(' ')
    for (const m of tudo.matchAll(/wap\d{7}/g)) {
      expect(['wap0001234', 'wap0004491']).toContain(m[0])
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
