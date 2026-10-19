import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ListaReservados } from './lista-reservados'
import type { ItemReservado } from '@/lib/relatorios/tipos'

// v1.71.1 — o card "Reservados" separado por categoria, em render estático (grau 1). Dado 100%
// fictício: patrimônio com o prefixo `FIC` e a sentinela `WAP0001234`.

const NOVO: ItemReservado[] = [
  { patrimonio: 'FIC0000101', modelo: 'Dell Monitor Modelo A', chamado: '4101', categoria: 'monitor' },
  { patrimonio: 'FIC0000102', modelo: 'Lenovo Notebook Modelo B', chamado: '4102', categoria: 'notebook' },
  { patrimonio: 'FIC0000103', modelo: 'Samsung Celular Modelo C', chamado: null, categoria: 'celular' },
  { patrimonio: 'WAP0001234', modelo: 'Dell Notebook Modelo D', chamado: '4106', categoria: 'notebook' },
]
// O snapshot gerado antes da v1.71.1: os mesmos itens, sem a categoria.
const ANTIGO: ItemReservado[] = NOVO.map(({ patrimonio, modelo, chamado }) => ({ patrimonio, modelo, chamado }))

/** O texto visível, sem marcação — para conferir a ORDEM do que o leitor vê. */
const texto = (html: string) => html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|')

describe('ListaReservados — snapshot novo: separado por categoria', () => {
  // A4: o snapshot novo vai ao banco como JSON e volta — a categoria sobrevive à ida e volta.
  const relido: ItemReservado[] = JSON.parse(JSON.stringify(NOVO))
  const html = renderToStaticMarkup(<ListaReservados itens={relido} />)

  it('os grupos seguem a ordem de categoria do card vizinho (Notebook, Celular, Monitor), cada um com "N reservados" à direita', () => {
    const t = texto(html)
    const i = (s: string) => t.indexOf(s)
    expect(i('|Notebook|2 reservados|')).toBeGreaterThan(-1)
    expect(i('|Celular|1 reservado|')).toBeGreaterThan(i('|Notebook|2 reservados|'))
    expect(i('|Monitor|1 reservado|')).toBeGreaterThan(i('|Celular|1 reservado|'))
  })

  it('dentro do grupo, as linhas de sempre (patrimônio · modelo · #chamado), por patrimônio', () => {
    const t = texto(html)
    expect(t.indexOf('|FIC0000102|Lenovo Notebook Modelo B|#4102|')).toBeGreaterThan(-1)
    expect(t.indexOf('|WAP0001234|Dell Notebook Modelo D|#4106|')).toBeGreaterThan(
      t.indexOf('|FIC0000102|'),
    )
    expect(t).toContain('|FIC0000103|Samsung Celular Modelo C|—|')
  })

  it('com duas categorias ou mais, os chips resumem os totais — os MESMOS números dos cabeçalhos', () => {
    expect(html).toContain('aria-label="Reservados por categoria"')
    const t = texto(html)
    const chips = t.slice(0, t.indexOf('|Notebook|2 reservados|') + 1)
    expect(chips).toContain('Notebook |2|')
    expect(chips).toContain('Celular |1|')
    expect(chips).toContain('Monitor |1|')
  })

  it('os chips são resumo: nenhum link, nenhuma âncora, nenhum botão', () => {
    expect(html).not.toContain('<a')
    expect(html).not.toContain('href')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('onclick')
  })

  it('na impressão, o cabeçalho do grupo não fica separado da primeira linha', () => {
    expect(html.match(/break-after-avoid/g)?.length).toBe(3)
    expect(html.match(/<li class="flex break-inside-avoid/g)?.length).toBe(NOVO.length)
  })

  it('com UMA categoria só, não há chips (repetiriam o cabeçalho)', () => {
    const uma = renderToStaticMarkup(
      <ListaReservados itens={NOVO.filter((i) => i.categoria === 'notebook')} />,
    )
    expect(uma).not.toContain('Reservados por categoria')
    expect(texto(uma)).toContain('|Notebook|2 reservados|')
  })
})

describe('ListaReservados — snapshot antigo: a lista corrida de antes', () => {
  const html = renderToStaticMarkup(<ListaReservados itens={ANTIGO} />)

  it('sem chips e sem cabeçalho de grupo', () => {
    expect(html).not.toContain('Reservados por categoria')
    expect(html).not.toContain('<h4')
    expect(html).not.toContain('reservado')
  })

  it('as linhas na ordem em que o snapshot as congelou', () => {
    const t = texto(html)
    expect(t).toBe(
      '|FIC0000101|Dell Monitor Modelo A|#4101|FIC0000102|Lenovo Notebook Modelo B|#4102|FIC0000103|Samsung Celular Modelo C|—|WAP0001234|Dell Notebook Modelo D|#4106|',
    )
  })

  it('basta UM item sem categoria para a lista ficar corrida', () => {
    const misto = renderToStaticMarkup(<ListaReservados itens={[NOVO[0], ANTIGO[1]]} />)
    expect(misto).not.toContain('<h4')
  })
})
