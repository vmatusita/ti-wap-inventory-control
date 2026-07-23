import { describe, it, expect } from 'vitest'
import { resolverAncora } from '@/lib/ajuda/ancora'
import { SECOES } from '@/lib/ajuda/conteudo'

// Lista branca real da pagina /ajuda — a mesma que o componente recebe por prop.
const IDS = SECOES.map((s) => s.id)

describe('resolverAncora', () => {
  it('resolve o hash com "#" para o id da seção', () => {
    expect(resolverAncora('#itens', IDS)).toBe('itens')
  })

  it('aceita o id sem "#" (location.hash já vem com, mas não dependemos disso)', () => {
    expect(resolverAncora('itens', IDS)).toBe('itens')
  })

  it('devolve null para hash vazio', () => {
    expect(resolverAncora('', IDS)).toBeNull()
    expect(resolverAncora('#', IDS)).toBeNull()
  })

  it('devolve null para âncora que não é seção (lista branca)', () => {
    expect(resolverAncora('#nao-existe', IDS)).toBeNull()
    expect(resolverAncora('#top', IDS)).toBeNull()
  })

  it('resolve id com hífen', () => {
    expect(resolverAncora('#como-fazer', IDS)).toBe('como-fazer')
  })

  it('é case-sensitive, igual ao getElementById do navegador', () => {
    expect(resolverAncora('#Itens', IDS)).toBeNull()
    expect(resolverAncora('#COMO-FAZER', IDS)).toBeNull()
  })

  it('decodifica percent-encoding', () => {
    expect(resolverAncora('#como%2Dfazer', IDS)).toBe('como-fazer')
    expect(resolverAncora('#%69tens', IDS)).toBe('itens')
  })

  it('não lança em hash malformado — devolve null', () => {
    expect(() => resolverAncora('#%E2', IDS)).not.toThrow()
    expect(resolverAncora('#%E2', IDS)).toBeNull()
    expect(resolverAncora('#%', IDS)).toBeNull()
  })

  it('usa o texto cru quando o decode falha mas o cru é uma seção válida', () => {
    // '%' solto quebra o decode; o cru continua sendo comparado com a lista.
    expect(resolverAncora('#itens%', IDS)).toBeNull()
  })

  it('devolve null com lista de ids vazia (nada é seletor válido)', () => {
    expect(resolverAncora('#itens', [])).toBeNull()
  })

  it('não deixa o hash virar seletor arbitrário de DOM', () => {
    expect(resolverAncora('#__next', IDS)).toBeNull()
    expect(resolverAncora('#body', IDS)).toBeNull()
    expect(resolverAncora('#itens x', IDS)).toBeNull()
  })

  it('resolve TODAS as seções reais do manual', () => {
    for (const id of IDS) {
      expect(resolverAncora(`#${id}`, IDS)).toBe(id)
    }
    expect(IDS).toHaveLength(10)
  })

  it('cobre as âncoras usadas hoje pelo LinkAjuda das telas', () => {
    // Mapa tela -> âncora fixado pela F11 (comentário de link-ajuda.tsx).
    const usadas = [
      'movimentacoes',
      'pendencias',
      'relatorios',
      'itens',
      'status',
      'como-fazer',
      'admin',
    ]
    for (const a of usadas) {
      expect(resolverAncora(`#${a}`, IDS)).toBe(a)
    }
  })
})
