import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'

import { TiposItemTabela } from './tipos-item-tabela'
import type { TipoItemAdmin } from '@/lib/queries/tipos-item'

// UMA TABELA DE `admin/` SOB A RÉGUA (F61) — rig de componente grau 1 (F45).
//
// A F61 tirou `src/components/admin/` da isenção por prefixo e converteu as molduras
// à mão. O que quebraria em silêncio sem este teste — o CSS mudaria, a régua de
// classes não veria (ela lê o fonte desta tabela, não o do componente de sistema):
//   · a moldura da tabela voltar a ser `div.rounded-lg.border` em vez do
//     `QuadroDeTabela` (um `Card` com `border ring-0 bg-transparent py-0`);
//   · o selo "Ativo" voltar à paleta crua em vez de `Badge variant="sucesso"`.
// O `TipoItemDialog` de cada linha usa `useRouter`: o contexto do roteador entra
// inerte, como na prévia da F43.

const ROTEADOR = {
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
} as never

const TIPOS: TipoItemAdmin[] = [
  { id: 1, slug: 'carregador', rotulo: 'Carregador', ativo: true, ordem: 1, itens: 3 },
  { id: 2, slug: 'mochila', rotulo: 'Mochila', ativo: false, ordem: 2, itens: 0 },
]

function render(tipos: readonly TipoItemAdmin[]) {
  return renderToStaticMarkup(
    <AppRouterContext.Provider value={ROTEADOR}>
      <TiposItemTabela tipos={tipos} />
    </AppRouterContext.Provider>,
  )
}

describe('TiposItemTabela — a moldura e o selo vêm do sistema', () => {
  it('a tabela mora num QuadroDeTabela (Card sem respiro, traço de borda)', () => {
    const html = render(TIPOS)
    const quadro = html.match(/<div data-slot="card" data-size="default" class="([^"]+)"><div data-slot="table-container"/)
    expect(quadro, 'a <Table> deveria estar direto dentro do Card do QuadroDeTabela').not.toBeNull()
    const classes = quadro![1].split(/\s+/)
    for (const c of ['border', 'bg-transparent', 'py-0', 'ring-0', 'rounded-xl']) expect(classes).toContain(c)
    expect(html).not.toMatch(/class="overflow-hidden rounded-lg border"/)
  })

  it('o selo "Ativo" é a variante sucesso — sem paleta crua', () => {
    const html = render(TIPOS)
    expect(html).toMatch(/<span data-slot="badge" data-variant="sucesso" class="[^"]*bg-sucesso text-sucesso-texto[^"]*">Ativo<\/span>/)
    expect(html).not.toMatch(/green-(100|800|950|300)/)
  })

  it('o vazio mantém a borda tracejada, com o respiro da escala', () => {
    const html = render([])
    expect(html).toContain('class="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground"')
  })
})
