import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ATRIBUTO_SIDEBAR, VALOR_RECOLHIDA } from './sidebar-preferencia'

// UXG-13 (F30) — o contrato ESTRUTURAL da sidebar recolhível.
//
// O colapso é o único lugar do sistema onde CSS e React descrevem o mesmo
// estado, e o desenho depende de uma divisão que nenhum teste de comportamento
// alcança: o VISUAL é CSS pendurado no `data-sidebar` do <html> (para não haver
// salto entre a pintura do servidor e a hidratação) e o COMPORTAMENTO é React.
// Quebrar essa divisão — devolver a largura para uma classe condicional, por
// exemplo — reintroduz o flash sem quebrar teste nenhum.
//
// O Vitest deste repositório roda em `node`, sem jsdom: aqui se lê o fonte.

const fonte = (p: string) => readFileSync(p, 'utf8')

const NAV = fonte('src/components/layout/sidebar-nav.tsx')
const LATERAL = fonte('src/components/layout/sidebar-lateral.tsx')
const HEADER = fonte('src/components/layout/app-header.tsx')
const LAYOUT = fonte('src/app/(app)/layout.tsx')
const CSS = fonte('src/app/globals.css')
const ATALHOS = fonte('src/components/movimentacoes/atalho-global.tsx')

describe('o estado recolhido é CSS, e o CSS tem todos os ganchos', () => {
  const bloco = CSS.slice(
    CSS.indexOf(`:root[data-${ATRIBUTO_SIDEBAR}='${VALOR_RECOLHIDA}']`),
    CSS.indexOf('/* Impressão dos relatórios'),
  )

  it('o bloco do colapso existe e está fora do @media print', () => {
    expect(bloco.length).toBeGreaterThan(0)
    expect(bloco).not.toContain('@media print')
  })

  it.each([
    ['[data-sidebar-lateral]', 'width: 4rem'],
    ['[data-sidebar-rotulo]', 'display: none'],
    ['[data-sidebar-item]', 'justify-content: center'],
    ['[data-sidebar-selo]', 'position: absolute'],
  ])('%s recebe %s', (gancho, regra) => {
    const i = bloco.indexOf(gancho)
    expect(i, `gancho sem regra no globals.css: ${gancho}`).toBeGreaterThanOrEqual(0)
    expect(bloco.slice(i, i + 260)).toContain(regra)
  })

  it.each([
    ['data-sidebar-lateral', LATERAL],
    ['data-sidebar-rotulo', LATERAL],
    ['data-sidebar-item', LATERAL],
    ['data-sidebar-rotulo', NAV],
    ['data-sidebar-item', NAV],
    ['data-sidebar-selo', NAV],
  ])('o gancho %s é escrito no componente', (gancho, src) => {
    expect(src).toContain(gancho)
  })

  // O ponto do desenho: se a largura voltar a ser uma classe condicional do
  // React, o salto na carga volta junto — e em silêncio.
  it('a largura recolhida NÃO é uma classe condicional do React', () => {
    expect(LATERAL).not.toMatch(/w-16/)
    expect(NAV).not.toMatch(/w-16/)
  })

  it('o <aside> continua nascendo expandido (é o que o servidor pinta)', () => {
    expect(LATERAL).toContain('w-60')
  })
})

describe('o anti-flash está montado no shell', () => {
  it('o layout injeta o script inline antes do shell', () => {
    expect(LAYOUT).toContain('SCRIPT_SIDEBAR')
    expect(LAYOUT).toContain('dangerouslySetInnerHTML')
  })

  it('o provider embrulha os atalhos globais E a sidebar', () => {
    const abre = LAYOUT.indexOf('<SidebarColapsoProvider>')
    const fecha = LAYOUT.indexOf('</SidebarColapsoProvider>')
    expect(abre).toBeGreaterThanOrEqual(0)
    expect(fecha).toBeGreaterThan(abre)
    for (const dentro of ['<AtalhosGlobais', '<SidebarLateral']) {
      const i = LAYOUT.indexOf(dentro)
      expect(i, `${dentro} fora do provider`).toBeGreaterThan(abre)
      expect(i).toBeLessThan(fecha)
    }
  })
})

describe('o botão de recolher se anuncia direito', () => {
  it('tem aria-expanded, aria-controls e rótulo que muda com o estado', () => {
    expect(LATERAL).toContain('aria-expanded={!recolhida}')
    expect(LATERAL).toContain('aria-controls={ID_SIDEBAR_NAV}')
    expect(LATERAL).toContain("recolhida ? 'Expandir menu' : 'Recolher menu'")
    // A tecla também é anunciada — quem usa leitor de tela não vê o `title`.
    expect(LATERAL).toContain('aria-keyshortcuts="["')
  })

  it('o alvo do aria-controls é o id que a nav recebe', () => {
    expect(LATERAL).toContain('id={ID_SIDEBAR_NAV}')
    expect(NAV).toContain('<nav id={id}')
  })
})

describe('o mobile não muda', () => {
  it('o Sheet do hambúrguer monta a SidebarNav sem `colapsada`', () => {
    const i = HEADER.indexOf('<SidebarNav')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(HEADER.slice(i, HEADER.indexOf('/>', i))).not.toContain('colapsada')
  })

  it('a sidebar de desktop continua escondida abaixo de md', () => {
    expect(LATERAL).toContain('hidden')
    expect(LATERAL).toContain('md:block')
  })
})

describe('o atalho `[` respeita as guardas que já existiam', () => {
  it('vem depois de editando(), modalAberto(), repeat e modificadores', () => {
    const corpo = ATALHOS.slice(ATALHOS.indexOf('function onKey'))
    const iRepeat = corpo.indexOf('e.repeat')
    const iModificadores = corpo.indexOf('e.ctrlKey')
    const iEditando = corpo.indexOf('editando(e.target)')
    const iModal = corpo.indexOf('modalAberto()')
    const iColchete = corpo.indexOf("e.key === '['")
    expect(iColchete).toBeGreaterThan(0)
    for (const [nome, i] of [
      ['repeat', iRepeat],
      ['modificadores', iModificadores],
      ['editando', iEditando],
      ['modalAberto', iModal],
    ] as const) {
      expect(i, `guarda ${nome} sumiu`).toBeGreaterThanOrEqual(0)
      expect(i, `o \`[\` dispara antes da guarda ${nome}`).toBeLessThan(iColchete)
    }
  })

  it('o quadro do "?" e a documentação citam a tecla', () => {
    expect(fonte('src/components/layout/atalhos-dialog.tsx')).toContain("teclas: '['")
    expect(fonte('src/lib/ajuda/conteudo/limites-e-atalhos.ts')).toContain("teclas: '['")
  })
})

describe('os separadores de grupo (UXG-13a)', () => {
  it('marcam Administração e Ajuda, e só elas', () => {
    // Fatia o array `ITENS` por item: um regex único atravessaria a fronteira e
    // atribuiria o `separadorAntes` de um item ao rótulo do anterior.
    const itens = NAV.slice(NAV.indexOf('const ITENS'), NAV.indexOf('function ativa'))
      .split(/rotulo: '/)
      .slice(1)
      .map((pedaco) => ({
        rotulo: pedaco.slice(0, pedaco.indexOf("'")),
        separa: pedaco.includes('separadorAntes: true'),
      }))
    expect(itens.length, 'a lista de itens do menu mudou de formato').toBeGreaterThan(5)
    expect(new Set(itens.filter((i) => i.separa).map((i) => i.rotulo))).toEqual(
      new Set(['Administração', 'Ajuda']),
    )
  })

  it('o filete nunca nasce no primeiro item da lista já filtrada por cargo', () => {
    // Para o cargo Consulta (sem Administração nem Desenvolvedor), "Ajuda" é o
    // único item marcado — e um divisor no topo separaria o menu de nada.
    expect(NAV).toContain('indice > 0')
  })
})
