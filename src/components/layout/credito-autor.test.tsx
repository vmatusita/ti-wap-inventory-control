import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { IdentidadeDoSistema } from '@/lib/identidade/sistema'

// O CRÉDITO DE AUTORIA, LIGADO E DESLIGADO (F61) — rig de componente grau 1 (F45).
//
// O crédito saiu de uma constante privada para a fonte única e ficou DESLIGÁVEL
// (`credito: null`). O que quebraria em silêncio sem este teste:
//   · desligado, o componente ainda desenhar um `<a>` vazio ou o texto sem link;
//   · ligado, perder o `rel="noopener noreferrer"`, o `target` ou o `aria-label`;
//   · a variante curta (pé da sidebar) voltar a dizer a frase inteira.
// Timeout explícito (molde de sem-wapismo.test.ts): o import dinâmico do módulo com a
// fonte trocada transforma a árvore a frio e, sob a carga da suíte inteira, passa dos 5 s
// padrão do Vitest — é o relógio do runner que muda, não a afirmação.
// A fonte é trocada por `vi.doMock` — o módulo real continua com o crédito LIGADO.

async function renderComFonte(credito: IdentidadeDoSistema['credito'], variante?: 'longa' | 'curta') {
  vi.resetModules()
  vi.doMock('@/lib/identidade/sistema', () => ({
    identidadeDoSistema: (): IdentidadeDoSistema => ({
      sigla: 'WAP',
      nome: 'Estoque TI',
      nomeCompleto: 'Estoque TI WAP',
      descricao: 'Controle de ativos de TI da WAP',
      credito,
    }),
  }))
  const { CreditoAutor } = await import('./credito-autor')
  return renderToStaticMarkup(<CreditoAutor variante={variante} />)
}

afterEach(() => {
  vi.doUnmock('@/lib/identidade/sistema')
  vi.resetModules()
})

describe('CreditoAutor — lê a fonte única e é desligável', () => {
  it('ligado (o padrão de hoje), a variante longa tem o link seguro e o nome acessível', async () => {
    const { CreditoAutor } = await import('./credito-autor')
    const html = renderToStaticMarkup(<CreditoAutor />)
    expect(html).toContain('href="https://www.vmatusita.com.br"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('aria-label="Desenvolvido por vmatusita — abre o site em nova aba"')
    expect(html).toContain('>Desenvolvido por vmatusita</a>')
  }, 60_000)

  it('ligado, a variante curta mostra só o nome — com o mesmo nome acessível', async () => {
    const html = await renderComFonte({ autor: 'Fulano de Tal', site: 'https://exemplo.test' }, 'curta')
    expect(html).toContain('>Fulano de Tal</a>')
    expect(html).toContain('aria-label="Desenvolvido por Fulano de Tal — abre o site em nova aba"')
    expect(html).toContain('href="https://exemplo.test"')
  }, 60_000)

  it.each(['longa', 'curta'] as const)('desligado, a variante %s não renderiza NADA', async (variante) => {
    expect(await renderComFonte(null, variante)).toBe('')
  }, 60_000)
})
