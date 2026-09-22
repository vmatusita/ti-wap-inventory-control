import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NovaMovimentacaoForm } from './nova-movimentacao-form'
import { hojeISO } from '@/lib/format'
import type { AtivoResumo } from '@/lib/queries/ativos'
import * as movimentacoesActions from '@/lib/actions/movimentacoes'

// GRAU 2 (interação real) do piso de teste de componente, aprovado 22/09/2026
// (reauditoria de dívida técnica, passo 5, frente E/K/Y). Este é o maior
// orquestrador do sistema (o wizard de nova movimentação, ~1.400 linhas) e o
// que este arquivo trava é justamente o que uma decomposição futura (quebrar
// o componente em pedaços menores) mais provavelmente quebraria SEM nenhum
// teste acusar:
//
//   1. o PAYLOAD EXATO que chega em `registrarMovimentacoes` — a tradução
//      Config → item do lote (`construirItem`/`montarItensDoPar`) tem de
//      continuar casando byte a byte com o que o passo 3 mostrou;
//   2. a VALIDAÇÃO continua bloqueando o avanço para o passo 3 quando um
//      campo obrigatório falta — perder essa trava silenciosamente deixaria
//      um lote inválido chegar ao botão "Registrar";
//   3. o Enter-avança (OS-F2 3.7.1) continua IGNORADO dentro da Textarea de
//      observação — o guard de `onKeyDown` é um `el.tagName === 'TEXTAREA'`
//      solto, fácil de perder numa reorganização do handler;
//   4. a FALHA TOTAL do envio (regra da F38: "ou tudo, ou nada") continua
//      devolvendo o operador ao passo 2 com o erro apontado NO ITEM certo —
//      é a computação de `patrimonioCulpado` a partir de `linhaQueFalhou`.
//
// Mocks: as Server Actions de `@/lib/actions/movimentacoes` (registro,
// duplicatas, busca — inclusive as que `AtivoCombobox`, sempre renderizado no
// passo 1, chama sozinho ao montar), `next/navigation` (só `useRouter`) e
// `sonner` (só para inspecionar as chamadas de toast — nenhum `<Toaster/>`
// está montado, então o toast real não apareceria na tela de qualquer jeito).
// O validator Zod (`loteMovimentacaoSchema`) e os componentes-filho do wizard
// (`PassoAtivos`/`PassoMovimentacao`/`PassoRevisao`) rodam de VERDADE.

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

// `importOriginal` porque o wizard puxa este módulo de VÁRIOS lugares na árvore
// (o combobox de ativos do passo 1, as sugestões de setor do passo 2…) — listar
// cada export à mão viraria uma segunda cópia da lista de Server Actions, que
// envelhece toda vez que um `lib/actions/movimentacoes.ts` novo nasce. Só as
// cinco que os testes deste arquivo de fato controlam viram `vi.fn()`.
vi.mock('@/lib/actions/movimentacoes', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/actions/movimentacoes')>()
  return {
    ...real,
    registrarMovimentacoes: vi.fn(),
    buscarPossiveisDuplicatasDoDia: vi.fn(),
    buscarResumoDeAtivosPorIds: vi.fn(),
    buscarAtivosParaMovimentacao: vi.fn(),
    buscarAtivosRecentesDoOperador: vi.fn(),
  }
})

const { toast } = await import('sonner')

// `ativo_id` passa por `z.string().uuid()` no schema real — precisa parecer um
// UUID de verdade, mesmo sendo 100% fictício (regra 2 do CLAUDE.md).
const ATIVO_ID_FAKE = '11111111-1111-4111-8111-111111111111'

const ATIVO_FAKE: AtivoResumo = {
  id: ATIVO_ID_FAKE,
  patrimonio: 'WAP0001234',
  service_tag: null,
  categoria: 'notebook',
  marca: 'Marca Fictícia',
  modelo: 'Modelo Fictício X',
  status: 'em_estoque',
  colaborador_atual: null,
  filial_id: 1,
  filial_nome: 'Filial Fictícia 1',
  termo_assinado: null,
  patrimonio_duplicado: false,
}

function renderForm() {
  return render(
    <NovaMovimentacaoForm filiais={[]} motivos={[]} ativosIniciais={[ATIVO_FAKE]} />,
  )
}

/** Passo 1 → passo 2, e escolhe o `rotulo` no Select "Tipo de movimentação". */
async function avancarESelecionarTipo(user: ReturnType<typeof userEvent.setup>, rotulo: string) {
  await user.click(screen.getByRole('button', { name: /Avançar/ }))
  await user.click(screen.getByLabelText('Tipo de movimentação'))
  await user.click(await screen.findByRole('option', { name: rotulo }))
}

beforeEach(() => {
  vi.mocked(movimentacoesActions.buscarAtivosRecentesDoOperador).mockResolvedValue([])
  vi.mocked(movimentacoesActions.buscarAtivosParaMovimentacao).mockResolvedValue([])
  vi.mocked(movimentacoesActions.buscarPossiveisDuplicatasDoDia).mockResolvedValue([])
  vi.mocked(movimentacoesActions.buscarResumoDeAtivosPorIds).mockResolvedValue([])
  vi.mocked(movimentacoesActions.registrarMovimentacoes).mockReset()
  vi.mocked(toast.warning).mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.info).mockClear()
})

afterEach(() => {
  cleanup()
})

describe('NovaMovimentacaoForm — o wizard de lote', () => {
  it('envia para registrarMovimentacoes o payload exato do lote (Config → item)', async () => {
    vi.mocked(movimentacoesActions.registrarMovimentacoes).mockResolvedValue({
      ok: true,
      criadas: 1,
      resultados: [{ index: 0, ativo_id: ATIVO_FAKE.id, ok: true, movimentacao_id: 'mov-fake-1' }],
    })
    const user = userEvent.setup()
    renderForm()

    await avancarESelecionarTipo(user, 'Marcar defasado')
    await user.click(screen.getByRole('button', { name: /Revisar/ }))
    await user.click(
      await screen.findByRole('button', { name: /Registrar 1 movimentação/ }),
    )

    await waitFor(() => {
      expect(movimentacoesActions.registrarMovimentacoes).toHaveBeenCalledTimes(1)
    })
    expect(movimentacoesActions.registrarMovimentacoes).toHaveBeenCalledWith({
      itens: [
        {
          ativo_id: ATIVO_ID_FAKE,
          tipo: 'marcar_defasado',
          data: hojeISO(),
          chamado: undefined,
          observacao: undefined,
          motivo: undefined,
        },
      ],
      itensJunto: [],
    })
  })

  it('bloqueia o avanço para o passo 3 quando falta um campo obrigatório (transferência sem destino)', async () => {
    const user = userEvent.setup()
    renderForm()

    await avancarESelecionarTipo(user, 'Transferência')
    // Filial de destino NÃO é escolhida de propósito — é o que este teste trava.
    await user.click(screen.getByRole('button', { name: /Revisar/ }))

    await screen.findByText('Escolha a filial de destino')
    // Continua no passo 2: o campo "Tipo de movimentação" (só existe lá) segue
    // presente — `getByLabelText` já lança se não achar, então chegar aqui é a
    // prova. Sem jest-dom neste projeto (não entrou — decisão do Johnny), as
    // asserções usam Chai puro: presença é "não lançou"/`toBeTruthy`, ausência
    // é `queryBy... → toBeNull()`.
    expect(screen.getByLabelText('Tipo de movimentação')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Registrar/ })).toBeNull()
    expect(movimentacoesActions.registrarMovimentacoes).not.toHaveBeenCalled()
  })

  it('Enter dentro da Observação não avança de passo (só o clique em "Revisar" avança)', async () => {
    const user = userEvent.setup()
    renderForm()

    await avancarESelecionarTipo(user, 'Marcar defasado')
    const observacao = screen.getByLabelText('Observação (opcional)')
    await user.click(observacao)
    await user.type(observacao, 'aguardando peça{Enter}')

    // Ainda no passo 2 — o Enter dentro da textarea não podia ter disparado avancarParaRevisao().
    expect(screen.getByLabelText('Tipo de movimentação')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Registrar/ })).toBeNull()
    expect(movimentacoesActions.registrarMovimentacoes).not.toHaveBeenCalled()
  })

  it('falha total do lote devolve ao passo 2 com o erro no ATIVO certo (nada fica "meio gravado")', async () => {
    vi.mocked(movimentacoesActions.registrarMovimentacoes).mockResolvedValue({
      ok: false,
      criadas: 0,
      resultados: [
        {
          index: 0,
          ativo_id: ATIVO_FAKE.id,
          ok: false,
          erro: 'Ativo já está marcado como defasado.',
        },
      ],
      linhaQueFalhou: 0,
    })
    const user = userEvent.setup()
    renderForm()

    await avancarESelecionarTipo(user, 'Marcar defasado')
    await user.click(screen.getByRole('button', { name: /Revisar/ }))
    await user.click(
      await screen.findByRole('button', { name: /Registrar 1 movimentação/ }),
    )

    // Volta ao passo 2 (não fica preso no passo 3, nem pula pro painel de sucesso).
    await waitFor(() => {
      expect(screen.getByLabelText('Tipo de movimentação')).toBeTruthy()
    })
    const alerta = screen.getByRole('alert')
    within(alerta).getByText('WAP0001234')
    within(alerta).getByText(/Ativo já está marcado como defasado\./)
    expect(toast.error).toHaveBeenCalledWith(
      'Nada foi gravado. O lote parou em WAP0001234 — corrija e envie de novo.',
    )
  })
})
