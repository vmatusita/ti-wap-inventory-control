import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NovaCompraForm } from './nova-compra-form'
import { hojeISO } from '@/lib/format'
import type { Filial } from '@/lib/queries/filiais'
import * as comprasActions from '@/lib/actions/compras'

// GRAU 2 (interação real) do piso de teste de componente, aprovado 22/09/2026
// (reauditoria de dívida técnica, passo 5, frente E/K/Y). Este é o formulário
// de cadastro de compra (~1.400 linhas — lista/faixa de patrimônios + os
// campos compartilhados do modelo) e o que este arquivo trava é o que uma
// decomposição futura mais provavelmente quebraria em silêncio:
//
//   1. o PAYLOAD EXATO que chega em `registrarCompra` — a lista colada
//      (`parsearLista`) tem de continuar virando exatamente os `itens` que a
//      Server Action recebe, com os campos do modelo ao lado;
//   2. a validação ATV-09a dos obrigatórios do bloco "Dados do modelo"
//      continua bloqueando o envio (e apontando QUAL campo falta) sem
//      depender do `disabled` do botão — a checagem mora DENTRO de `enviar()`;
//   3. a DUPLICATA dentro da própria lista colada continua sendo apontada
//      pelo preview (`duplicatasDaLista`) E desabilitando o botão de
//      cadastrar — perder essa ligação deixaria um lote com patrimônio
//      repetido passar para o servidor.
//
// Mocks: as Server Actions de `@/lib/actions/compras` (registro e as três
// buscas de sugestão do acervo, que `CampoComSugestoes` chama sozinho ao
// focar um campo), `next/navigation` (`useRouter` — sem Provider de rota
// montado, `next/navigation` lança "invariant expected app router to be
// mounted" já no PRIMEIRO render, mesmo os três testes abaixo nunca chegando
// a chamar `.refresh()`) e `sonner` (só para inspecionar as chamadas de toast
// — sem `<Toaster/>` montado, o toast real não apareceria na tela). O
// validator de patrimônio (`parsearLista`/`duplicatasDaLista`, funções puras)
// roda de VERDADE.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: {
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('@/lib/actions/compras', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/actions/compras')>()
  return {
    ...real,
    registrarCompra: vi.fn(),
    buscarSugestoesMarca: vi.fn(),
    buscarSugestoesModelo: vi.fn(),
    buscarSugestoesFornecedor: vi.fn(),
  }
})

const { toast } = await import('sonner')

const FILIAL_FAKE: Filial = {
  id: 1,
  slug: 'filial-ficticia-1',
  nome: 'Filial Fictícia 1',
  cidade: 'Cidade Fictícia',
}

function renderForm() {
  return render(<NovaCompraForm filiais={[FILIAL_FAKE]} />)
}

async function selecionarCategoria(user: ReturnType<typeof userEvent.setup>, rotulo: string) {
  await user.click(screen.getByLabelText(/^Categoria/))
  await user.click(await screen.findByRole('option', { name: rotulo }))
}

async function selecionarFilial(user: ReturnType<typeof userEvent.setup>, rotulo: string) {
  await user.click(screen.getByLabelText(/Filial que recebeu/))
  await user.click(await screen.findByRole('option', { name: rotulo }))
}

beforeEach(() => {
  vi.mocked(comprasActions.buscarSugestoesMarca).mockResolvedValue([])
  vi.mocked(comprasActions.buscarSugestoesModelo).mockResolvedValue([])
  vi.mocked(comprasActions.buscarSugestoesFornecedor).mockResolvedValue([])
  vi.mocked(comprasActions.registrarCompra).mockReset()
  vi.mocked(toast.warning).mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.info).mockClear()
})

afterEach(() => {
  cleanup()
})

describe('NovaCompraForm — cadastro de compra em lote', () => {
  it('envia para registrarCompra o payload exato (lista colada → itens + campos do modelo)', async () => {
    vi.mocked(comprasActions.registrarCompra).mockResolvedValue({
      ok: true,
      criados: [{ id: 'ativo-1', patrimonio: 'WAP0001234' }],
    })
    const user = userEvent.setup()
    renderForm()

    await user.type(
      screen.getByPlaceholderText(/WAP0006026/),
      'WAP0001234,ST00001',
    )
    await selecionarCategoria(user, 'Notebook')
    await selecionarFilial(user, 'Filial Fictícia 1')
    await user.type(screen.getByLabelText(/^Marca/), 'Marca Fictícia')
    await user.type(screen.getByLabelText(/^Modelo/), 'Modelo Fictício')

    await user.click(screen.getByRole('button', { name: 'Cadastrar 1 equipamento' }))

    await waitFor(() => {
      expect(comprasActions.registrarCompra).toHaveBeenCalledTimes(1)
    })
    expect(comprasActions.registrarCompra).toHaveBeenCalledWith({
      itens: [{ patrimonio: 'WAP0001234', service_tag: 'ST00001' }],
      categoria: 'notebook',
      marca: 'Marca Fictícia',
      modelo: 'Modelo Fictício',
      memoria: '',
      armazenamento: '',
      processador: '',
      fornecedor: '',
      filial_id: FILIAL_FAKE.id,
      observacao: '',
      data: hojeISO(),
    })
  })

  it('bloqueia o envio quando falta a categoria (ATV-09a) e aponta o campo — sem chamar o servidor', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(
      screen.getByPlaceholderText(/WAP0006026/),
      'WAP0001234,ST00001',
    )
    // Categoria NÃO é escolhida de propósito — é o que este teste trava.
    await selecionarFilial(user, 'Filial Fictícia 1')
    await user.type(screen.getByLabelText(/^Marca/), 'Marca Fictícia')
    await user.type(screen.getByLabelText(/^Modelo/), 'Modelo Fictício')

    await user.click(screen.getByRole('button', { name: 'Cadastrar 1 equipamento' }))

    await screen.findByText('Selecione a categoria.')
    expect(toast.error).toHaveBeenCalledWith('Preencha: categoria.')
    expect(comprasActions.registrarCompra).not.toHaveBeenCalled()
  })

  it('patrimônio repetido na lista colada barra o botão de cadastrar (preview.erros)', async () => {
    const user = userEvent.setup()
    renderForm()

    // A CHAVE da lista é patrimônio + service tag (spec §5) — a mesma dupla nas
    // duas linhas é o que faz `duplicatasDaLista` acusar a repetição.
    const lista = screen.getByPlaceholderText(/WAP0006026/)
    await user.type(lista, 'WAP0001234,ST00001')
    await user.keyboard('{Enter}')
    await user.type(lista, 'WAP0001234,ST00001')
    await selecionarCategoria(user, 'Notebook')
    await selecionarFilial(user, 'Filial Fictícia 1')
    await user.type(screen.getByLabelText(/^Marca/), 'Marca Fictícia')
    await user.type(screen.getByLabelText(/^Modelo/), 'Modelo Fictício')

    await screen.findByText(/repetido na lista/)
    const botao = screen.getByRole('button', {
      name: /Cadastrar/,
    }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    expect(comprasActions.registrarCompra).not.toHaveBeenCalled()
  })
})
