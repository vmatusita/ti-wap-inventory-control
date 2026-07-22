import { beforeEach, describe, expect, it } from 'vitest'
import {
  baseFiltrosItens,
  registrarFiltrosEnviados,
  resetarFiltrosPendentes,
} from './url-filtros'

// Regressão do achado da revisão adversarial da F9: duas trocas de filtro dentro
// da mesma janela de navegação pendente perdiam a primeira, porque a URL
// commitada (e o window.location) só mudam quando a navegação termina.
describe('baseFiltrosItens', () => {
  beforeEach(() => {
    resetarFiltrosPendentes()
  })

  it('sem push pendente, parte da URL commitada', () => {
    expect(baseFiltrosItens('filial=2').toString()).toBe('filial=2')
  })

  it('preserva o filtro anterior quando a navegação ainda não commitou', () => {
    const commitada = 'filial=2'

    // 1ª troca: "De" — a URL commitada ainda é a antiga.
    const primeira = baseFiltrosItens(commitada)
    primeira.set('de', '2026-07-01')
    registrarFiltrosEnviados(commitada, primeira.toString())

    // 2ª troca: "Até", ANTES de a primeira commitar (params continua 'filial=2').
    const segunda = baseFiltrosItens(commitada)
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
      const base = baseFiltrosItens(commitada)
      base.set(chave, valor)
      registrarFiltrosEnviados(commitada, base.toString())
    }
    const ultima = baseFiltrosItens(commitada)
    expect(ultima.get('item')).toBe('12')
    expect(ultima.get('tipo')).toBe('saida')
    expect(ultima.get('de')).toBe('2026-07-01')
  })

  it('descarta a base quando a navegação commita', () => {
    registrarFiltrosEnviados('filial=2', 'filial=2&de=2026-07-01')
    // A URL commitada alcançou o push: a base volta a ser a URL de verdade.
    expect(baseFiltrosItens('filial=2&de=2026-07-01').toString()).toBe(
      'filial=2&de=2026-07-01',
    )
  })

  it('descarta a base quando vem navegação de fora (back/forward)', () => {
    registrarFiltrosEnviados('filial=2', 'filial=2&de=2026-07-01')
    // Back levou a URL para outro lugar: nada do push pendente sobrevive.
    expect(baseFiltrosItens('grupo=perifericos').toString()).toBe('grupo=perifericos')
  })
})
