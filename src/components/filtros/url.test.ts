import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  baseDosFiltros,
  esquecerFiltrosPendentes,
  registrarFiltrosEnviados,
  resetarFiltrosPendentes,
} from './url'

// Regressão do achado da revisão adversarial da F9 — duas trocas de filtro dentro da
// mesma janela de navegação pendente perdiam a primeira — e do VAZAMENTO ENTRE
// ROTAS que a F61 fechou (o pendente passou a ser por caminho). Os cinco primeiros
// casos vieram de `itens/url-filtros.test.ts`, com o caminho acrescentado.
describe('baseDosFiltros', () => {
  beforeEach(() => {
    resetarFiltrosPendentes()
  })

  it('sem push pendente, parte da URL commitada', () => {
    expect(baseDosFiltros('/itens', 'filial=2').toString()).toBe('filial=2')
  })

  it('preserva o filtro anterior quando a navegação ainda não commitou', () => {
    const commitada = 'filial=2'

    // 1ª troca: "De" — a URL commitada ainda é a antiga.
    const primeira = baseDosFiltros('/itens/historico', commitada)
    primeira.set('de', '2026-07-01')
    registrarFiltrosEnviados('/itens/historico', commitada, primeira.toString())

    // 2ª troca: "Até", ANTES de a primeira commitar (params continua 'filial=2').
    const segunda = baseDosFiltros('/itens/historico', commitada)
    segunda.set('ate', '2026-07-31')

    expect(segunda.get('de')).toBe('2026-07-01')
    expect(segunda.get('ate')).toBe('2026-07-31')
    expect(segunda.get('filial')).toBe('2')
  })

  it('encadeia três trocas seguidas sem perder nenhuma', () => {
    const commitada = ''
    for (const [chave, valor] of [
      ['item', '12'],
      ['tipo', 'saida'],
      ['de', '2026-07-01'],
    ]) {
      const base = baseDosFiltros('/itens/historico', commitada)
      base.set(chave, valor)
      registrarFiltrosEnviados('/itens/historico', commitada, base.toString())
    }
    const ultima = baseDosFiltros('/itens/historico', commitada)
    expect(ultima.get('item')).toBe('12')
    expect(ultima.get('tipo')).toBe('saida')
    expect(ultima.get('de')).toBe('2026-07-01')
  })

  it('descarta a base quando a navegação commita', () => {
    registrarFiltrosEnviados('/ativos', 'filial=2', 'filial=2&de=2026-07-01')
    // A URL commitada alcançou o push: a base volta a ser a URL de verdade.
    expect(baseDosFiltros('/ativos', 'filial=2&de=2026-07-01').toString()).toBe(
      'filial=2&de=2026-07-01',
    )
  })

  it('descarta a base quando vem navegação de fora (voltar/avançar)', () => {
    registrarFiltrosEnviados('/ativos', 'filial=2', 'filial=2&de=2026-07-01')
    expect(baseDosFiltros('/ativos', 'grupo=perifericos').toString()).toBe('grupo=perifericos')
  })

  // ---- F61 · O VAZAMENTO ENTRE ROTAS ----------------------------------------
  //
  // Passo a passo (docs/PLAN-F61.md §10): em `/itens`, URL limpa, o operador aplica
  // `filial=2`; antes de a navegação commitar, clica em "Histórico" (o link não
  // leva query); o PRIMEIRO filtro de `/itens/historico` parte de URL limpa. Com o
  // pendente único de antes, `commitadaAntes === ''` casava e a base devolvia
  // `filial=2`. Este caso nasceu VERMELHO contra `itens/url-filtros.ts` (evidência
  // em docs/f61-evidencias/).
  it('o filtro empurrado em /itens não vaza para /itens/historico', () => {
    registrarFiltrosEnviados('/itens', '', 'filial=2')
    const base = baseDosFiltros('/itens/historico', '')
    base.set('item', '5')
    expect(base.toString()).toBe('item=5')
  })

  it('o pendente de uma rota não apaga o de outra', () => {
    registrarFiltrosEnviados('/itens', '', 'filial=2')
    expect(baseDosFiltros('/itens/historico', '').toString()).toBe('')
    expect(baseDosFiltros('/itens', '').toString()).toBe('filial=2')
  })

  it('o filtro que sai da tela esquece o pendente (a garantia do useRef de antes)', () => {
    registrarFiltrosEnviados('/movimentacoes', '', 'tipo=saida')
    esquecerFiltrosPendentes('/movimentacoes')
    // Voltar a /movimentacoes por um link sem query não reencontra o pendente velho.
    expect(baseDosFiltros('/movimentacoes', '').toString()).toBe('')
  })
})

describe('os filtros de lista compartilham o modulo (F61)', () => {
  const RAIZ = process.cwd()
  const CONSUMIDORES = [
    'src/components/itens/itens-filtros.tsx',
    'src/components/itens/historico-filtros.tsx',
    'src/components/ativos/ativos-filtros.tsx',
    'src/components/pendencias/pendencias-filtros.tsx',
    'src/components/movimentacoes/lista-filtros.tsx',
  ]

  it.each(CONSUMIDORES)('%s usa src/components/filtros/url.ts, com o caminho', (arquivo) => {
    const texto = readFileSync(join(RAIZ, arquivo), 'utf8')
    expect(texto).toMatch(/from '@\/components\/filtros\/url'/)
    expect(texto).toMatch(/baseDosFiltros\(pathname,/)
    expect(texto).toMatch(/registrarFiltrosEnviados\(pathname,/)
    expect(texto).toMatch(/useEsquecerFiltrosAoSair\(pathname\)/)
    // A base nunca volta a sair do snapshot atrasado.
    expect(texto).not.toMatch(/new URLSearchParams\((params\.toString\(\)|window\.location\.search)\)/)
  })

  it('nenhum modulo de src/lib/ e "use client"', () => {
    const achados: string[] = []
    const visitar = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const caminho = join(dir, nome)
        if (statSync(caminho).isDirectory()) visitar(caminho)
        else if (/\.(ts|tsx)$/.test(nome) && /^['"]use client['"]/m.test(readFileSync(caminho, 'utf8'))) {
          achados.push(caminho)
        }
      }
    }
    visitar(join(RAIZ, 'src', 'lib'))
    expect(achados).toEqual([])
  })
})
