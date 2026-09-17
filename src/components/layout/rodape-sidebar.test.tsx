import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { IdentidadeDoSistema } from '@/lib/identidade/sistema'

// O PÉ DA SIDEBAR SEM CRÉDITO NÃO DEIXA LINHA ÓRFÃ (F61) — rig grau 1 (F45).
//
// `RodapeSidebar` é o mesmo componente nos DOIS lugares em que a sidebar existe (o
// `<aside>` do computador e o Sheet do celular). Com o crédito desligado na fonte
// única, o que quebraria em silêncio: sobrar o `<div class="px-3 pb-1">` vazio —
// uma faixa de respiro sem nada dentro, visível no fim do menu. O teste renderiza os
// dois estados e compara: desligado, o rodapé é SÓ o link de versão.

async function renderRodape(credito: IdentidadeDoSistema['credito']) {
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
  const { RodapeSidebar } = await import('./rodape-sidebar')
  return renderToStaticMarkup(<RodapeSidebar versao="1.66.0" />)
}

afterEach(() => {
  vi.doUnmock('@/lib/identidade/sistema')
  vi.resetModules()
})

describe('RodapeSidebar — o crédito desligado some inteiro', () => {
  it('ligado, o rodapé tem a versão e a linha do crédito', async () => {
    const html = await renderRodape({ autor: 'vmatusita', site: 'https://www.vmatusita.com.br' })
    expect(html).toMatch(/v(<!-- -->)?1\.66\.0/)
    expect(html).toContain('class="px-3 pb-1"')
    expect(html).toContain('rel="noopener noreferrer"')
  }, 60_000)

  it('desligado, não sobra a linha, o link nem o nome — só a versão', async () => {
    const html = await renderRodape(null)
    expect(html).toContain('href="/versoes"')
    expect(html).not.toContain('px-3 pb-1')
    expect(html).not.toContain('<a href="http')
    expect(html).not.toContain('vmatusita')
    expect(html).not.toContain('Desenvolvido por')
  }, 60_000)
})
