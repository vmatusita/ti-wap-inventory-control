import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColaboradoresTabela } from './colaboradores-tabela'
import { COLABORADORES_FICTICIOS, FILIAIS_FICTICIAS } from './colaboradores-tabela-fixtures'

// v1.71.2 — GRAU 2 (interação real) do filtro "Uso" de Administração › Colaboradores: escolher "Sem uso" deixa só as
// linhas com o selo, "Em uso" só quem tem uso efetivo, e "Uso: todos" volta tudo. Estado local, como os outros dois
// filtros. Dublês: as Server Actions dos filhos da linha e o roteador (o molde de nova-compra-form.dom.test.tsx).

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/lib/actions/colaboradores', () => ({
  criarColaborador: vi.fn(),
  atualizarColaborador: vi.fn(),
  buscarSaldoDoColaborador: vi.fn(),
}))

afterEach(() => cleanup())

function nomesNaTabela(): string[] {
  const corpo = screen.getAllByRole('rowgroup')[1]
  return within(corpo)
    .getAllByRole('row')
    .map((r) => within(r).getAllByRole('cell')[0].textContent ?? '')
}

async function escolher(user: ReturnType<typeof userEvent.setup>, opcao: string) {
  await user.click(screen.getByRole('combobox', { name: 'Filtrar por uso' }))
  await user.click(await screen.findByRole('option', { name: opcao }))
}

describe('ColaboradoresTabela — o filtro "Uso"', () => {
  it('"Sem uso" deixa só as linhas com o selo; "Em uso" só quem tem uso; "Uso: todos" volta tudo', async () => {
    const user = userEvent.setup()
    render(<ColaboradoresTabela colaboradores={COLABORADORES_FICTICIOS} filiais={FILIAIS_FICTICIAS} />)
    expect(nomesNaTabela()).toHaveLength(4)

    await escolher(user, 'Sem uso')
    expect(nomesNaTabela()).toEqual(['Fulano ZZ Estornado', 'Fulano ZZ Nunca Usado'])
    expect(screen.getByRole('status').textContent).toContain('2 de 4')

    await escolher(user, 'Em uso')
    expect(nomesNaTabela()).toEqual(['Fulano ZZ Em Uso'])
    expect(screen.getByRole('status').textContent).toContain('1 de 4')

    await escolher(user, 'Uso: todos')
    expect(nomesNaTabela()).toHaveLength(4)
    expect(screen.getByRole('status').textContent).toContain('4 no total')
  })

  it('o filtro "Uso" soma com a busca: "Sem uso" + "nunca" deixa uma linha só', async () => {
    const user = userEvent.setup()
    render(<ColaboradoresTabela colaboradores={COLABORADORES_FICTICIOS} filiais={FILIAIS_FICTICIAS} />)
    await escolher(user, 'Sem uso')
    await user.type(screen.getByRole('textbox', { name: /Buscar colaborador/ }), 'nunca')
    expect(nomesNaTabela()).toEqual(['Fulano ZZ Nunca Usado'])
  })

  it('sem o uso calculado, o filtro fica desligado', () => {
    render(
      <ColaboradoresTabela
        colaboradores={COLABORADORES_FICTICIOS.map((c) => ({ ...c, uso: null }))}
        filiais={FILIAIS_FICTICIAS}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Filtrar por uso' }).hasAttribute('disabled')).toBe(true)
  })
})
