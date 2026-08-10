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

  // Sem os comentários: eles CITAM os ganchos entre crases (é a documentação do
  // porquê de cada regra), e um `indexOf` cru acharia a menção antes do seletor
  // — a sonda passaria a medir a prosa, não o CSS.
  const regras = bloco.replace(/\/\*[\s\S]*?\*\//g, '')

  it.each([
    ['[data-sidebar-lateral]', 'width: 4rem'],
    ['[data-sidebar-rotulo]', 'display: none'],
    ['[data-sidebar-item]', 'justify-content: center'],
    // O item COM selo empilha (ícone em cima, contagem embaixo). Era
    // `position: absolute` no selo, e ali ele cobria o próprio ícone em 40px de
    // largura útil — ver o comentário longo no globals.css.
    ['[data-sidebar-com-selo]', 'flex-direction: column'],
    ['[data-sidebar-selo]', 'font-size: 10px'],
  ])('%s recebe %s', (gancho, regra) => {
    const i = regras.indexOf(gancho)
    expect(i, `gancho sem regra no globals.css: ${gancho}`).toBeGreaterThanOrEqual(0)
    expect(regras.slice(i, i + 260)).toContain(regra)
  })

  // A regressão que motivou o empilhamento: enquanto o selo era absoluto no
  // canto do item, ele COLIDIA com o glifo (badge de 18px+ sobre um ícone de
  // 16px num item de 40px). Voltar a `position: absolute` aqui é voltar ao
  // defeito relatado em produção.
  it('o selo não volta a ser posicionado por cima do ícone', () => {
    expect(regras).not.toContain('position: absolute')
  })

  // A revisão adversarial da F30 pegou exatamente isto: as três regras de
  // rótulo/item/selo NÃO estavam ancoradas no <aside>, e como o Sheet do
  // hambúrguer monta a MESMA SidebarNav (com os mesmos `data-sidebar-*`),
  // recolher no desktop e estreitar a janela deixava o menu de TOQUE só com
  // ícones. Passava em tudo — build, lint e o resto desta suíte.
  it('toda regra do modo recolhido é ancorada no <aside> do desktop', () => {
    const semComentario = bloco.replace(/\/\*[\s\S]*?\*\//g, '')
    const seletores = [...semComentario.matchAll(/:root\[data-sidebar[^{]*\{/g)].map((m) =>
      m[0].slice(0, -1).trim(),
    )
    expect(seletores.length, 'o bloco do colapso mudou de formato').toBeGreaterThanOrEqual(4)
    for (const s of seletores) {
      expect(s, `seletor solto — vazaria para o menu mobile: "${s}"`).toContain(
        '[data-sidebar-lateral]',
      )
    }
  })

  it.each([
    ['data-sidebar-lateral', LATERAL],
    ['data-sidebar-rotulo', LATERAL],
    ['data-sidebar-item', LATERAL],
    ['data-sidebar-rotulo', NAV],
    ['data-sidebar-item', NAV],
    ['data-sidebar-selo', NAV],
    ['data-sidebar-com-selo', NAV],
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

describe('duas abas contam a mesma história', () => {
  // O `storage` só dispara nas OUTRAS abas, e o atributo do <html> é local a
  // cada uma. Sem reconciliar antes de avisar o React, a aba que só OUVE ficaria
  // com o React dizendo "recolhida" (ele cai no fallback do storage) e o CSS
  // mostrando o menu inteiro — `aria-expanded` mentindo sobre a tela.
  it('o ouvinte de storage reconcilia o atributo ANTES de avisar o React', () => {
    const src = fonte('src/components/layout/sidebar-colapso.tsx')
    const i = src.indexOf('function aoMudarStorage')
    expect(i, 'o ouvinte de storage sumiu').toBeGreaterThan(0)
    const corpo = src.slice(i, i + 600)
    const iAplica = corpo.indexOf('aplicarAtributo')
    const iAvisa = corpo.indexOf('aviso()')
    expect(iAplica, 'o ouvinte não reconcilia o <html>').toBeGreaterThan(0)
    expect(iAvisa).toBeGreaterThan(0)
    expect(iAplica, 'avisa o React antes de acertar o CSS').toBeLessThan(iAvisa)
  })

  it('só `aplicarAtributo` ESCREVE o atributo do <html>', () => {
    // Duas escritas espalhadas divergem com o tempo — e divergência aqui é
    // exatamente o flash que este desenho existe para evitar. (Ler o atributo,
    // em `lerAgora`, é outra coisa e continua livre.)
    const src = fonte('src/components/layout/sidebar-colapso.tsx')
    const helper = src.slice(
      src.indexOf('function aplicarAtributo'),
      src.indexOf('function lerStorage'),
    )
    const escritas = (t: string) =>
      // `=(?!=)` para não confundir a ATRIBUIÇÃO com a comparação `===` da leitura.
      [...t.matchAll(/dataset\[[^\]]+\]\s*=(?!=)/g)].length +
      [...t.matchAll(/delete\s+document\.documentElement\.dataset/g)].length
    expect(escritas(helper), 'o helper deixou de escrever os dois lados').toBe(2)
    expect(escritas(src), 'escrita do atributo fora de aplicarAtributo').toBe(2)
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
