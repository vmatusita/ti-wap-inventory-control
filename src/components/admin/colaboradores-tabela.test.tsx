import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ColaboradoresTabela } from './colaboradores-tabela'
import { COLABORADORES_FICTICIOS, FILIAIS_FICTICIAS } from './colaboradores-tabela-fixtures'

// v1.71.2 — o selo "Sem uso" de Administração › Colaboradores, em render estático (grau 1). Os dois filhos da linha
// ("Editar" e "Com esta pessoa") importam Server Actions e o roteador: dublês, como em nova-compra-form.dom.test.tsx.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/lib/actions/colaboradores', () => ({
  criarColaborador: vi.fn(),
  atualizarColaborador: vi.fn(),
  buscarSaldoDoColaborador: vi.fn(),
}))

const html = renderToStaticMarkup(
  <ColaboradoresTabela colaboradores={COLABORADORES_FICTICIOS} filiais={FILIAIS_FICTICIAS} />,
)
/** O trecho do HTML da linha de uma pessoa (do nome até a próxima linha da tabela). */
function linha(nome: string, fonte = html): string {
  const i = fonte.indexOf(`>${nome}<`)
  expect(i, `a linha de ${nome} não está na tabela`).toBeGreaterThan(-1)
  const fim = fonte.indexOf('<tr', i)
  return fonte.slice(i, fim === -1 ? undefined : fim)
}

describe('ColaboradoresTabela — o selo "Sem uso"', () => {
  it('a linha ATIVA sem uso efetivo ganha o selo e o porquê "N registros, todos estornados"', () => {
    const l = linha('Fulano ZZ Estornado')
    expect(l).toContain('>Sem uso<')
    expect(l).toContain('3 registros, todos estornados')
  })

  it('o cadastro que nunca teve registro ganha o porquê "nunca usado"', () => {
    const l = linha('Fulano ZZ Nunca Usado')
    expect(l).toContain('>Sem uso<')
    expect(l).toContain('nunca usado')
  })

  it('quem está em uso não ganha selo', () => {
    expect(linha('Fulano ZZ Em Uso')).not.toContain('Sem uso')
  })

  it('o INATIVO nunca ganha selo, mesmo sem uso', () => {
    const l = linha('Fulano ZZ Inativo')
    expect(l).toContain('>Inativo<')
    expect(l).not.toContain('Sem uso')
  })

  it('"Registros" mantém o significado de hoje (movimentações + lançamentos ligados por id), selo à parte', () => {
    // o estornado tem 1 + 2 = 3 registros ligados — o mesmo número de antes da v1.71.2
    expect(linha('Fulano ZZ Estornado')).toMatch(/>3<\/td>/)
    expect(linha('Fulano ZZ Em Uso')).toMatch(/>4<\/td>/)
  })

  it('o filtro "Uso" existe, ao lado dos dois de antes (a escolha e o rótulo são provados no grau 2)', () => {
    expect(html).toContain('aria-label="Filtrar por uso"')
    expect(html).toContain('aria-label="Filtrar por filial"')
    expect(html).toContain('4 no total')
  })

  it('o selo não é botão nem link: nada muda sozinho, desativar continua pelo "Editar"', () => {
    const l = linha('Fulano ZZ Estornado')
    const selo = l.slice(l.indexOf('Sem uso') - 200, l.indexOf('todos estornados'))
    expect(selo).not.toContain('<button')
    expect(selo).not.toContain('<a ')
  })
})

describe('ColaboradoresTabela — sem o uso calculado (a leitura degradou)', () => {
  const semUso = COLABORADORES_FICTICIOS.map((c) => ({ ...c, uso: null }))
  const h = renderToStaticMarkup(<ColaboradoresTabela colaboradores={semUso} filiais={FILIAIS_FICTICIAS} />)

  it('a lista sai inteira, sem selo, e a tela diz que o uso não pôde ser calculado', () => {
    expect(h).toContain('Fulano ZZ Estornado')
    expect(h).not.toContain('>Sem uso<')
    expect(h).toContain('Não foi possível calcular agora quem está sem uso')
  })
})
