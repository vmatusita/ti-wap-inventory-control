import { describe, expect, it } from 'vitest'
import { ehUrlDaListaDeAtivos } from './lista-visitada'

// F19 (P2-12a) — a validação é a única barreira entre um valor de `sessionStorage`
// e um `router.push`. Vale teste próprio: o storage é gravado pelo nosso código,
// mas nada impede que seja adulterado pelo console do navegador.
describe('ehUrlDaListaDeAtivos', () => {
  it('aceita a lista sem filtro', () => {
    expect(ehUrlDaListaDeAtivos('/ativos')).toBe(true)
  })

  it('aceita a lista COM filtros, ordenação e página — que é o motivo de existir', () => {
    expect(ehUrlDaListaDeAtivos('/ativos?status=em_manutencao&filial=2')).toBe(true)
    expect(ehUrlDaListaDeAtivos('/ativos?q=dell&ord=patrimonio_asc&pp=100&page=3')).toBe(true)
  })

  it('recusa vazio, nulo e indefinido', () => {
    expect(ehUrlDaListaDeAtivos('')).toBe(false)
    expect(ehUrlDaListaDeAtivos(null)).toBe(false)
    expect(ehUrlDaListaDeAtivos(undefined)).toBe(false)
  })

  it('recusa a FICHA — o rótulo do link diz "Voltar para ativos", a lista', () => {
    expect(ehUrlDaListaDeAtivos('/ativos/8f3a-uuid')).toBe(false)
    expect(ehUrlDaListaDeAtivos('/ativos/novo')).toBe(false)
  })

  it('recusa outra rota do app, mesmo com prefixo parecido', () => {
    expect(ehUrlDaListaDeAtivos('/ativosfalso')).toBe(false)
    expect(ehUrlDaListaDeAtivos('/movimentacoes')).toBe(false)
  })

  it('recusa destino EXTERNO — a barreira de open redirect', () => {
    // `//host` é URL protocolo-relativa: o navegador sai do site.
    expect(ehUrlDaListaDeAtivos('//evil.example/ativos')).toBe(false)
    expect(ehUrlDaListaDeAtivos('https://evil.example/ativos')).toBe(false)
    expect(ehUrlDaListaDeAtivos('http://localhost:3000/ativos')).toBe(false)
    expect(ehUrlDaListaDeAtivos('javascript:alert(1)//ativos')).toBe(false)
  })
})
