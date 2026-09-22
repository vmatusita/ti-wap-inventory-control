import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportarWizard } from './importar-wizard'
import type { Filial } from '@/lib/queries/filiais'
import type { ValidacaoImport } from '@/lib/import'
import type { CustoSubstituir, TermoMultiFilial } from '@/lib/queries/import-logs'
import * as importarActions from '@/lib/actions/importar'

// GRAU 2 (interação real) do piso de teste de componente, aprovado 22/09/2026
// (reauditoria de dívida técnica, passo 5, frente E/K/Y). Este é o wizard de
// import de startup por filial (~1.200 linhas — cinco passos, upload de
// arquivo, análise, correção em massa e o "Substituir tudo" destrutivo) e o
// que este arquivo trava é o que uma decomposição futura mais provavelmente
// quebraria em silêncio:
//
//   1. o PAYLOAD EXATO que chega em `aplicarImport` — o `plano`/`custoPreview`
//      vêm do que `validarImport` devolveu no preview, sem mutação no meio,
//      e `confirmacaoTexto` é o que o operador digitou, byte a byte;
//   2. a validação do ARQUIVO (extensão) continua bloqueando "Analisar
//      arquivo" SEM chamar o servidor — é checagem cliente, antes de qualquer
//      FormData sair da tela;
//   3. um erro devolvido por `validarImport` (`{ok:false}`) continua a
//      operador NO PASSO 2, com a mensagem certa — sem isso um erro de
//      negócio faria a tela parecer travada, sem dizer por quê.
//
// Mocks: as Server Actions de `@/lib/actions/importar` (`validarImport` e
// `aplicarImport` — as duas que este wizard chama; `baixarCsvCorrigido` e
// `urlBackup` não entram em nenhum destes três testes), `next/navigation`
// (`useRouter`) e `sonner`. O validator de confirmação
// (`confirmacaoImportConfere`, função pura) roda de VERDADE.

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

vi.mock('@/lib/actions/importar', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/actions/importar')>()
  return {
    ...real,
    validarImport: vi.fn(),
    aplicarImport: vi.fn(),
    baixarCsvCorrigido: vi.fn(),
    urlBackup: vi.fn(),
  }
})

const { toast } = await import('sonner')

const FILIAL_FAKE: Filial = {
  id: 7,
  slug: 'filial-ficticia-7',
  nome: 'Filial Fictícia 7',
  cidade: 'Cidade Fictícia',
}

const CUSTO_FAKE: CustoSubstituir = {
  ativos: 10,
  movimentacoes: 40,
  anotacoes: 2,
  termos: 3,
  pendencias_item: 0,
  lancamentos_movimentacao: 0,
  lancamentos_pendencia: 0,
  ponteiros_substituto: 0,
}

const VALIDACAO_PRONTA: ValidacaoImport = {
  bloqueantes: [],
  avisos: [],
  grupos: [],
  contexto: {},
  correcoes: { aplicadas: 0, porOp: [] },
  candidatos: [],
  plano: {
    filialId: FILIAL_FAKE.id,
    arquivoHash: 'hash-ficticio-abc123',
    totalLinhasDados: 1,
    ativos: [],
  },
  resumo: {
    criar: 1,
    semData: 0,
    semPatrimonio: 0,
    semServiceTag: 0,
    patrimonioDoHostname: 0,
    conflitos: 0,
    layout: 'colunas18',
    linhasRemovidas: 0,
    detalhe: { reduzido: false, totalBloqueantes: 0, totalAvisos: 0, mantidosPorTipo: null },
  },
}

const TERMOS_MULTI_FILIAL: TermoMultiFilial[] = []

function renderWizard() {
  return render(
    <ImportarWizard
      filiais={[FILIAL_FAKE]}
      vocabulario={{ categorias: [], estados: [], prefixosPatrimonio: [] }}
    />,
  )
}

async function configurarESubirArquivo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText('Filial'))
  await user.click(await screen.findByRole('option', { name: FILIAL_FAKE.nome }))
  await user.click(screen.getByRole('button', { name: 'Avançar' }))

  const arquivo = new File(['site;tipo\n'], 'inventario.csv', { type: 'text/csv' })
  const input = screen.getByLabelText('Arquivo (CSV ou Excel .xlsx)')
  await user.upload(input, arquivo)
}

beforeEach(() => {
  vi.mocked(importarActions.validarImport).mockReset()
  vi.mocked(importarActions.aplicarImport).mockReset()
  vi.mocked(toast.warning).mockClear()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.info).mockClear()
})

afterEach(() => {
  cleanup()
})

describe('ImportarWizard — Configurar → Upload → Preview → Confirmar', () => {
  it('envia para aplicarImport o payload exato (plano + custo do preview + confirmação digitada)', async () => {
    vi.mocked(importarActions.validarImport).mockResolvedValue({
      ok: true,
      filial: FILIAL_FAKE,
      validacao: VALIDACAO_PRONTA,
      custo: CUSTO_FAKE,
      termosMultiFilial: TERMOS_MULTI_FILIAL,
    })
    vi.mocked(importarActions.aplicarImport).mockResolvedValue({
      ok: true,
      resultado: {
        logId: 'log-ficticio-1',
        ativosCriados: 1,
        movsApagadas: CUSTO_FAKE.movimentacoes,
        anotacoesApagadas: CUSTO_FAKE.anotacoes,
        termosApagados: CUSTO_FAKE.termos,
        arquivosTermosRemovidos: 0,
        correcoesAplicadas: 0,
        conflitosAbertos: 0,
        pendenciasApagadas: 0,
        lancamentosDesvinculados: 0,
        ponteirosAnulados: 0,
      },
      backupPath: 'backups-import/filial-ficticia-7/backup.json',
    })

    const user = userEvent.setup()
    renderWizard()

    await configurarESubirArquivo(user)
    await user.click(screen.getByRole('button', { name: 'Analisar arquivo' }))
    // O "Avançar" do passo 3 nasce DESABILITADO (`!aplicavel || analisando`) e só
    // habilita quando `analisando` volta a false, um instante depois de o preview
    // aparecer. Clicar nesse intervalo não faz nada (é um botão desabilitado), e o
    // passo 4 nunca chega. Isolado, o intervalo é curto demais para o teste cair
    // nele; com a suíte inteira disputando a CPU, caiu (22/09/2026). Por isso a
    // espera é pelo botão HABILITADO, não só pela presença dele.
    const avancar = await screen.findByRole('button', { name: 'Avançar' })
    await waitFor(() => expect((avancar as HTMLButtonElement).disabled).toBe(false))
    await user.click(avancar)

    // Passo 4 — a caixa de confirmação. Digitar algo que NÃO bate mantém o
    // botão destrutivo desabilitado (a régua é `confirmacaoImportConfere`).
    const campoConfirmacao = await screen.findByLabelText(/^Digite/)
    await user.type(campoConfirmacao, 'nome errado')
    const botaoSubstituir = screen.getByRole('button', { name: /Substituir tudo/ })
    expect((botaoSubstituir as HTMLButtonElement).disabled).toBe(true)

    // Corrige para o nome EXATO da filial (a régua tolera caixa/espaço, mas o
    // que chega no payload é o texto CRU digitado, não uma versão normalizada).
    await user.clear(campoConfirmacao)
    await user.type(campoConfirmacao, FILIAL_FAKE.nome)
    await waitFor(() => {
      expect((botaoSubstituir as HTMLButtonElement).disabled).toBe(false)
    })
    await user.click(botaoSubstituir)

    await waitFor(() => {
      expect(importarActions.aplicarImport).toHaveBeenCalledTimes(1)
    })
    expect(importarActions.aplicarImport).toHaveBeenCalledWith({
      plano: VALIDACAO_PRONTA.plano,
      confirmacaoTexto: FILIAL_FAKE.nome,
      custoPreview: CUSTO_FAKE,
      correcoes: [],
    })
  })

  it('extensão de arquivo inválida barra "Analisar arquivo" SEM chamar o servidor', async () => {
    // `applyAccept: false` — sem isto, o PRÓPRIO `user.upload` filtra o arquivo pelo
    // atributo `accept` do input (é o user-event imitando o navegador) e o `.txt`
    // nunca chega a disparar `onChange`: o teste passaria pelo motivo ERRADO (nenhum
    // arquivo escolhido), não pela validação de `mudarArquivo` que este teste trava.
    const user = userEvent.setup({ applyAccept: false })
    renderWizard()

    await user.click(screen.getByLabelText('Filial'))
    await user.click(await screen.findByRole('option', { name: FILIAL_FAKE.nome }))
    await user.click(screen.getByRole('button', { name: 'Avançar' }))

    const arquivoInvalido = new File(['conteudo'], 'inventario.txt', { type: 'text/plain' })
    const input = screen.getByLabelText('Arquivo (CSV ou Excel .xlsx)')
    await user.upload(input, arquivoInvalido)

    await screen.findByText('O arquivo precisa ter extensão .csv ou .xlsx.')
    const botaoAnalisar = screen.getByRole('button', { name: 'Analisar arquivo' })
    expect((botaoAnalisar as HTMLButtonElement).disabled).toBe(true)
    expect(importarActions.validarImport).not.toHaveBeenCalled()
  })

  it('erro de validarImport mantém o operador no passo 2, com a mensagem do servidor', async () => {
    vi.mocked(importarActions.validarImport).mockResolvedValue({
      ok: false,
      erro: 'O arquivo não tem as colunas esperadas na primeira linha.',
    })
    const user = userEvent.setup()
    renderWizard()

    await configurarESubirArquivo(user)
    await user.click(screen.getByRole('button', { name: 'Analisar arquivo' }))

    await screen.findByText('O arquivo não tem as colunas esperadas na primeira linha.')
    expect(toast.error).toHaveBeenCalledWith(
      'O arquivo não tem as colunas esperadas na primeira linha.',
    )
    // Continua no passo 2: o input de arquivo (só existe lá) segue presente.
    expect(screen.getByLabelText('Arquivo (CSV ou Excel .xlsx)')).toBeTruthy()
    expect(importarActions.aplicarImport).not.toHaveBeenCalled()
  })
})
