import { describe, it, expect } from 'vitest'
import {
  construirIndice,
  filtrarIndice,
  indicePaleta,
  textoDaPagina,
  textoDoBloco,
} from '@/lib/ajuda/indice'
import { PAGINAS, paginaPorSlug } from '@/lib/ajuda/registry'
import { normalizarBusca } from '@/lib/ajuda/busca'

describe('índice de busca da documentação', () => {
  const indice = construirIndice()

  it('cobre TODAS as páginas — uma página fora do índice é invisível', () => {
    expect(indice).toHaveLength(PAGINAS.length)
    expect(indice.map((e) => e.slug).sort()).toEqual(PAGINAS.map((p) => p.slug).sort())
  })

  it('nenhuma entrada tem texto pesquisável vazio', () => {
    for (const e of indice) expect(e.texto.length).toBeGreaterThan(0)
  })

  it('o texto indexado já vem normalizado (o cliente só compara)', () => {
    for (const e of indice) expect(e.texto).toBe(normalizarBusca(e.texto))
  })

  it('consulta vazia devolve tudo', () => {
    expect(filtrarIndice(indice, '')).toHaveLength(PAGINAS.length)
    expect(filtrarIndice(indice, '   ')).toHaveLength(PAGINAS.length)
  })

  it('termo ausente não devolve nada', () => {
    expect(filtrarIndice(indice, 'xpto-inexistente-123')).toHaveLength(0)
  })

  it('acha sem acento e sem caixa', () => {
    expect(filtrarIndice(indice, 'MANUTENCAO').length).toBeGreaterThan(0)
    expect(filtrarIndice(indice, 'manutenção').length).toBeGreaterThan(0)
  })

  it('acha pelas palavras que o operador usa no dia a dia (os sinônimos)', () => {
    // Os `termos` de cada página existem justamente para isto: quem procura
    // "consumível" tem de achar a página de itens por quantidade.
    for (const [consulta, slug] of [
      ['consumivel', 'itens-por-quantidade'],
      ['plaqueta', 'identidade-do-equipamento'],
      ['teclado', 'limites-e-atalhos'],
      ['escuro', 'mapa-das-telas'],
      ['errei', 'corrigir-estorno-ajuste'],
    ] as const) {
      const achados = filtrarIndice(indice, consulta).map((e) => e.slug)
      expect(achados, `busca "${consulta}"`).toContain(slug)
    }
  })

  it('acha uma página pelo conteúdo do corpo, não só pelo título', () => {
    expect(filtrarIndice(indice, 'atrelar').map((e) => e.slug)).toContain(
      'itens-por-quantidade',
    )
  })
})

describe('índice leve da paleta (Ctrl+K)', () => {
  const leve = indicePaleta()

  it('cobre todas as páginas', () => {
    expect(leve).toHaveLength(PAGINAS.length)
  })

  it('não carrega o corpo do texto — é isso que mantém o bundle pequeno', () => {
    const cheio = construirIndice()
    for (const e of leve) {
      const gordo = cheio.find((c) => c.slug === e.slug)!
      expect(e.chave.length).toBeLessThan(gordo.texto.length)
      // sem `texto`: a projeção leve é um contrato, não um detalhe
      expect(e).not.toHaveProperty('texto')
    }
  })

  it('a chave já vem normalizada e acha por título, resumo e sinônimo', () => {
    for (const e of leve) expect(e.chave).toBe(normalizarBusca(e.chave))
    const acha = (q: string) =>
      leve.filter((e) => e.chave.includes(normalizarBusca(q))).map((e) => e.slug)
    expect(acha('pendencia')).toContain('resolver-pendencias')
    expect(acha('kit')).toContain('kits-de-movimentacao')
    expect(acha('csv')).toContain('lista-de-ativos')
  })
})

describe('textoDoBloco cobre todo tipo de bloco', () => {
  it('não devolve vazio para nenhum bloco real da documentação', () => {
    for (const p of PAGINAS) {
      for (const b of p.blocos) {
        // `links` pode ser vazio quando todos os rótulos são derivados do
        // destino — é o único caso legítimo.
        if (b.tipo === 'links') continue
        expect(textoDoBloco(b).trim().length, `${p.slug} · ${b.tipo}`).toBeGreaterThan(0)
      }
    }
  })

  it('o texto da página inclui título, resumo e sinônimos', () => {
    const p = paginaPorSlug('limites-e-atalhos')!
    const t = textoDaPagina(p)
    expect(t).toContain(normalizarBusca(p.titulo))
    expect(t).toContain(normalizarBusca(p.resumo))
    for (const s of p.termos ?? []) expect(t).toContain(normalizarBusca(s))
  })
})
