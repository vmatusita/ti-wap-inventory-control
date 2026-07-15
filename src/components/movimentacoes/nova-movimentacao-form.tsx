'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { PainelSucesso } from '@/components/movimentacoes/nova/painel-sucesso'
import { PassoAtivos } from '@/components/movimentacoes/nova/passo-ativos'
import { PassoMovimentacao } from '@/components/movimentacoes/nova/passo-movimentacao'
import { PassoRevisao } from '@/components/movimentacoes/nova/passo-revisao'
import {
  configPadrao,
  montarItensInput,
  type Config,
  type ConfigInicial,
  type SucessoLote,
} from '@/components/movimentacoes/nova/config'
import { registrarMovimentacoes } from '@/lib/actions/movimentacoes'
import {
  loteMovimentacaoSchema,
  tiposComunsPara,
} from '@/lib/validators/movimentacao'
import {
  rotuloTipo,
  type StatusAtivo,
  type TipoMovimentacao,
  type TermoStatus,
} from '@/lib/dominio'
import type { AtivoResumo } from '@/lib/queries/ativos'
import type { Filial } from '@/lib/queries/filiais'
import type { Motivo } from '@/lib/queries/motivos'
import type { UltimaMovimentacaoUsuario } from '@/lib/queries/movimentacoes'

export type { ConfigInicial }

const PASSOS = ['Ativos', 'Movimentação', 'Revisão'] as const

// `compra` sai do fluxo de movimentação: a entrada de equipamento novo tem tela
// própria (/ativos/novo, que cria o ativo + a movimentação de compra atômica).
// TRANSICOES continua sendo a cópia exata da spec §4; aqui só filtramos a UI.
function tiposDoLote(status: StatusAtivo[]): TipoMovimentacao[] {
  return tiposComunsPara(status).filter((t) => t !== 'compra')
}

export function NovaMovimentacaoForm({
  filiais,
  motivos,
  ativoInicial,
  configInicial,
  ultimaMov,
}: {
  filiais: Filial[]
  motivos: Motivo[]
  ativoInicial?: AtivoResumo | null
  configInicial?: ConfigInicial | null
  ultimaMov?: UltimaMovimentacaoUsuario | null
}) {
  const router = useRouter()
  const [passo, setPasso] = useState(1)
  const [itens, setItens] = useState<AtivoResumo[]>(
    ativoInicial ? [ativoInicial] : [],
  )
  const [config, setConfig] = useState<Config>(() => {
    const c = configPadrao(configInicial)
    // Clampa o tipo inicial (vindo de "duplicar") ao que e valido para o ativo.
    if (
      ativoInicial &&
      c.tipo &&
      !tiposDoLote([ativoInicial.status]).includes(c.tipo)
    ) {
      c.tipo = ''
    }
    return c
  })
  const [statusResultante, setStatusResultante] = useState<string>('')
  const [erros, setErros] = useState<string[]>([])
  const [errosPorAtivo, setErrosPorAtivo] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [sucesso, setSucesso] = useState<SucessoLote | null>(null)

  const comandoRef = useRef<HTMLDivElement>(null)
  // Trava de reentrância: bloqueia um 2º envio (ex.: Enter apertado 2x rápido no
  // passo 3) antes do estado `enviando` propagar e desabilitar o botão.
  const enviandoRef = useRef(false)

  const tiposValidos = useMemo(
    () => tiposDoLote(itens.map((i) => i.status)),
    [itens],
  )
  const estadosMistos = useMemo(
    () => new Set(itens.map((i) => i.status)).size > 1,
    [itens],
  )

  const jaAdicionados = useMemo(() => new Set(itens.map((i) => i.id)), [itens])
  const motivosAplicaveis = useMemo(
    () =>
      config.tipo
        ? motivos.filter((m) => m.aplica_a.includes(config.tipo as TipoMovimentacao))
        : [],
    [config.tipo, motivos],
  )

  function set<K extends keyof Config>(chave: K, valor: Config[K]) {
    setConfig((c) => ({ ...c, [chave]: valor }))
  }

  // Trocar o tipo limpa os campos específicos do tipo anterior — senão um motivo
  // (ou filial destino / itens) de um tipo vaza para outro sem o usuário ver.
  function trocarTipo(tipo: TipoMovimentacao) {
    setConfig((c) => ({
      ...c,
      tipo,
      motivo: '',
      filialDestinoId: '',
      itensFaltantes: [],
    }))
    setStatusResultante('')
  }

  // Ao mudar o lote, se o tipo escolhido deixar de ser valido para todos, limpa.
  function ajustarTipoPara(lista: AtivoResumo[]) {
    const validos = tiposDoLote(lista.map((i) => i.status))
    setConfig((c) =>
      c.tipo && !validos.includes(c.tipo) ? { ...c, tipo: '' } : c,
    )
  }
  function adicionar(a: AtivoResumo) {
    const next = itens.some((p) => p.id === a.id) ? itens : [...itens, a]
    setItens(next)
    ajustarTipoPara(next)
  }
  function remover(id: string) {
    const next = itens.filter((p) => p.id !== id)
    setItens(next)
    ajustarTipoPara(next)
  }

  function repetirUltima() {
    if (!ultimaMov) return
    const tipoValido = tiposValidos.includes(ultimaMov.tipo)
    setConfig((c) => ({
      ...c,
      tipo: tipoValido ? ultimaMov.tipo : c.tipo,
      motivo: ultimaMov.motivo ?? '',
      colaborador: ultimaMov.colaborador ?? '',
      setor: ultimaMov.setor ?? '',
      chamado: ultimaMov.chamado ?? '',
      termo: (ultimaMov.termo_assinado as TermoStatus) ?? '',
      termoData: ultimaMov.termo_data ?? '',
    }))
    toast.success('Campos preenchidos com a última movimentação.')
    if (!tipoValido) {
      toast.warning(
        `O tipo "${rotuloTipo(ultimaMov.tipo)}" não é válido para os ativos atuais — escolha outro.`,
      )
    }
  }

  // Monta e valida o lote. Retorna as mensagens de erro (vazio = ok).
  function validarLote(): string[] {
    const itensInput = montarItensInput(itens, config, statusResultante)
    const msgs: string[] = []
    const parsed = loteMovimentacaoSchema.safeParse({ itens: itensInput })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) msgs.push(issue.message)
    }
    // Transferencia: destino ≠ filial atual de CADA item (o Zod nao conhece a
    // filial corrente — checagem aqui, reconferida na Server Action).
    if (config.tipo === 'transferencia' && config.filialDestinoId) {
      const destino = Number(config.filialDestinoId)
      const conflita = itens.filter((i) => i.filial_id === destino)
      if (conflita.length > 0) {
        msgs.push(
          'A filial de destino deve ser diferente da filial atual dos ativos.',
        )
      }
    }
    return [...new Set(msgs)]
  }

  function avancarParaRevisao() {
    const msgs = validarLote()
    setErros(msgs)
    if (msgs.length === 0) setPasso(3)
  }

  async function registrar() {
    if (enviandoRef.current) return
    const msgs = validarLote()
    setErros(msgs)
    if (msgs.length > 0) {
      setPasso(2)
      return
    }

    const itensInput = montarItensInput(itens, config, statusResultante)

    enviandoRef.current = true
    setEnviando(true)
    const submetidos = [...itens]
    let res
    try {
      res = await registrarMovimentacoes({
        // itensInput ja no formato de MovimentacaoInput (validado no servidor)
        itens: itensInput as never,
      })
    } finally {
      setEnviando(false)
      enviandoRef.current = false
    }

    if (res.erroGeral) {
      toast.error(res.erroGeral)
      return
    }

    const falhaIds = res.resultados.filter((r) => !r.ok).map((r) => r.ativo_id)

    if (res.ok) {
      const movPorAtivo = new Map(
        res.resultados
          .filter((r) => r.movimentacao_id)
          .map((r) => [r.ativo_id, r.movimentacao_id as string]),
      )
      setSucesso({
        criadas: res.criadas,
        tipo: config.tipo as TipoMovimentacao,
        motivo: config.motivo,
        ativos: submetidos.map((a) => ({
          id: a.id,
          patrimonio: a.patrimonio,
          categoria: a.categoria,
          movimentacaoId: movPorAtivo.get(a.id) ?? '',
        })),
      })
      router.refresh()
      return
    }

    // Falha (parcial ou total): mantem no form apenas os itens que falharam.
    const novosErros: Record<string, string> = {}
    for (const r of res.resultados) {
      if (!r.ok && r.erro) novosErros[r.ativo_id] = r.erro
    }
    setErrosPorAtivo(novosErros)
    setItens(submetidos.filter((a) => falhaIds.includes(a.id)))
    setPasso(2)
    if (res.criadas > 0) {
      toast.warning(
        `${res.criadas} registrada(s); ${falhaIds.length} falhou(aram). Revise os itens restantes.`,
      )
      router.refresh()
    } else {
      toast.error('Nenhuma movimentação registrada. Veja os erros nos itens.')
    }
  }

  function reiniciar() {
    setItens([])
    setConfig(configPadrao())
    setStatusResultante('')
    setErros([])
    setErrosPorAtivo({})
    setPasso(1)
    setSucesso(null)
  }

  // Enter avança entre os passos (OS-F2 3.7.1) — exceto em textarea, botões e
  // dentro do combobox (onde Enter seleciona o resultado).
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return
    const el = e.target as HTMLElement
    if (el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON') return
    if (el.getAttribute('role') === 'combobox') return
    if (comandoRef.current?.contains(el)) return
    e.preventDefault()
    if (passo === 1 && itens.length > 0) setPasso(2)
    else if (passo === 2) avancarParaRevisao()
    else if (passo === 3) registrar()
  }

  if (sucesso) {
    return (
      <PainelSucesso
        sucesso={sucesso}
        onGerado={() => router.refresh()}
        onReiniciar={reiniciar}
      />
    )
  }

  return (
    <div onKeyDown={onKeyDown} className="space-y-6">
      {/* Stepper */}
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {PASSOS.map((rotulo, i) => {
          const n = i + 1
          const ativo = passo === n
          const concluido = passo > n
          return (
            <li key={rotulo} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => n < passo && setPasso(n)}
                disabled={n > passo}
                className={
                  'flex items-center gap-2 rounded-full px-2.5 py-1 font-medium transition-colors ' +
                  (ativo
                    ? 'bg-primary text-primary-foreground'
                    : concluido
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground')
                }
              >
                <span className="tabular-nums">{n}</span>
                {rotulo}
              </button>
              {i < PASSOS.length - 1 && (
                <span aria-hidden className="text-muted-foreground">
                  →
                </span>
              )}
            </li>
          )
        })}
      </ol>

      {/* Erros de validacao */}
      {erros.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="mb-1 flex items-center gap-1.5 font-medium">
            <TriangleAlert className="size-4" />
            Revise antes de continuar:
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {passo === 1 && (
        <PassoAtivos
          itens={itens}
          jaAdicionados={jaAdicionados}
          comandoRef={comandoRef}
          onAdicionar={adicionar}
          onRemover={remover}
          onAvancar={() => setPasso(2)}
        />
      )}

      {passo === 2 && (
        <PassoMovimentacao
          config={config}
          statusResultante={statusResultante}
          itens={itens}
          tiposValidos={tiposValidos}
          estadosMistos={estadosMistos}
          motivosAplicaveis={motivosAplicaveis}
          errosPorAtivo={errosPorAtivo}
          filiais={filiais}
          ultimaMov={ultimaMov}
          onTrocarTipo={trocarTipo}
          onSet={set}
          onSetStatusResultante={setStatusResultante}
          onRepetirUltima={repetirUltima}
          onVoltar={() => setPasso(1)}
          onRevisar={avancarParaRevisao}
        />
      )}

      {passo === 3 && (
        <PassoRevisao
          itens={itens}
          config={config}
          filiais={filiais}
          motivos={motivos}
          enviando={enviando}
          onVoltar={() => setPasso(2)}
          onRegistrar={registrar}
        />
      )}
    </div>
  )
}
