'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, RotateCcw, TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/ativos/status-badge'
import { AtivoCombobox } from '@/components/movimentacoes/ativo-combobox'
import { registrarMovimentacoes } from '@/lib/actions/movimentacoes'
import {
  loteMovimentacaoSchema,
  tiposComunsPara,
} from '@/lib/validators/movimentacao'
import {
  ACESSORIOS_DEVOLUCAO,
  STATUS_ORDEM,
  rotuloAcessorio,
  rotuloCategoria,
  rotuloStatus,
  rotuloTipo,
  type TipoMovimentacao,
  type TermoStatus,
} from '@/lib/dominio'
import { hojeISO } from '@/lib/format'
import type { AtivoResumo } from '@/lib/queries/ativos'
import type { Filial } from '@/lib/queries/filiais'
import type { Motivo } from '@/lib/queries/motivos'
import type { UltimaMovimentacaoUsuario } from '@/lib/queries/movimentacoes'

type Config = {
  data: string
  tipo: TipoMovimentacao | ''
  motivo: string
  colaborador: string
  setor: string
  chamado: string
  termo: '' | TermoStatus
  termoData: string
  observacao: string
  filialDestinoId: string
  itensFaltantes: string[]
}

export type ConfigInicial = Partial<Omit<Config, 'itensFaltantes'>> & {
  itensFaltantes?: string[]
}

function configPadrao(inicial?: ConfigInicial | null): Config {
  return {
    data: inicial?.data || hojeISO(),
    tipo: (inicial?.tipo as TipoMovimentacao) || '',
    motivo: inicial?.motivo || '',
    colaborador: inicial?.colaborador || '',
    setor: inicial?.setor || '',
    chamado: inicial?.chamado || '',
    termo: (inicial?.termo as TermoStatus) || '',
    termoData: inicial?.termoData || '',
    observacao: inicial?.observacao || '',
    filialDestinoId: inicial?.filialDestinoId || '',
    itensFaltantes: inicial?.itensFaltantes || [],
  }
}

// Constroi o objeto de input (validado pelo Zod) de um item do lote.
function construirItem(ativo: AtivoResumo, c: Config): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ativo_id: ativo.id,
    tipo: c.tipo,
    data: c.data,
    chamado: c.chamado || undefined,
    observacao: c.observacao || undefined,
  }
  switch (c.tipo) {
    case 'saida':
    case 'emprestimo':
      return {
        ...base,
        motivo: c.motivo || '',
        colaborador: c.colaborador || undefined,
        setor: c.setor || undefined,
        termo_assinado: c.termo || undefined,
        termo_data: c.termoData || undefined,
      }
    case 'reserva':
      return {
        ...base,
        motivo: c.motivo || undefined,
        colaborador: c.colaborador || undefined,
        setor: c.setor || undefined,
      }
    case 'devolucao':
      return { ...base, motivo: c.motivo || '', itens_faltantes: c.itensFaltantes }
    case 'transferencia':
      return {
        ...base,
        filial_destino_id: c.filialDestinoId ? Number(c.filialDestinoId) : 0,
      }
    case 'ajuste':
      // status_resultante e injetado por quem chama (estado `statusResultante`).
      return { ...base }
    default:
      return { ...base, motivo: c.motivo || undefined }
  }
}

const PASSOS = ['Ativos', 'Movimentação', 'Revisão'] as const

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
      !tiposComunsPara([ativoInicial.status]).includes(c.tipo)
    ) {
      c.tipo = ''
    }
    return c
  })
  const [statusResultante, setStatusResultante] = useState<string>('')
  const [erros, setErros] = useState<string[]>([])
  const [errosPorAtivo, setErrosPorAtivo] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [sucesso, setSucesso] = useState<{
    criadas: number
    ativos: { id: string; patrimonio: string }[]
  } | null>(null)

  const comandoRef = useRef<HTMLDivElement>(null)
  // Trava de reentrância: bloqueia um 2º envio (ex.: Enter apertado 2x rápido no
  // passo 3) antes do estado `enviando` propagar e desabilitar o botão.
  const enviandoRef = useRef(false)

  const tiposValidos = useMemo(
    () => tiposComunsPara(itens.map((i) => i.status)),
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
    const validos = tiposComunsPara(lista.map((i) => i.status))
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
    const itensInput = itens.map((a) => {
      const obj = construirItem(a, config)
      if (config.tipo === 'ajuste') obj.status_resultante = statusResultante || undefined
      return obj
    })
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

    const itensInput = itens.map((a) => {
      const obj = construirItem(a, config)
      if (config.tipo === 'ajuste') obj.status_resultante = statusResultante || undefined
      return obj
    })

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
      setSucesso({
        criadas: res.criadas,
        ativos: submetidos.map((a) => ({ id: a.id, patrimonio: a.patrimonio })),
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

  // ---------- Painel de sucesso ----------
  if (sucesso) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
          <Check className="size-6" />
        </div>
        <h2 className="text-lg font-semibold">
          {sucesso.criadas}{' '}
          {sucesso.criadas === 1 ? 'movimentação registrada' : 'movimentações registradas'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Fichas atualizadas:
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {sucesso.ativos.map((a) => (
            <Button key={a.id} asChild variant="outline" size="sm">
              <Link href={`/ativos/${a.id}`} className="tabular-nums">
                {a.patrimonio}
              </Link>
            </Button>
          ))}
        </div>
        <div className="mt-6">
          <Button onClick={reiniciar}>Registrar outra movimentação</Button>
        </div>
      </div>
    )
  }

  return (
    <div onKeyDown={onKeyDown} className="space-y-6">
      {/* Stepper */}
      <ol className="flex items-center gap-2 text-sm">
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
                  'flex items-center gap-2 rounded-full px-3 py-1 font-medium transition-colors ' +
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

      {/* ---------------- PASSO 1 — Ativos ---------------- */}
      {passo === 1 && (
        <div className="space-y-4">
          <div ref={comandoRef}>
            <AtivoCombobox
              onSelecionar={adicionar}
              jaAdicionados={jaAdicionados}
            />
          </div>

          {itens.length === 0 ? (
            <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              Nenhum ativo no lote ainda. Busque e adicione um ou mais ativos.
            </p>
          ) : (
            <ul className="space-y-2">
              {itens.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5"
                >
                  <span className="font-medium tabular-nums">{a.patrimonio}</span>
                  {a.patrimonio_duplicado && (
                    <span className="rounded bg-amber-100 px-1.5 text-xs tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      ST {a.service_tag ?? '—'}
                    </span>
                  )}
                  <span className="truncate text-sm text-muted-foreground">
                    {[rotuloCategoria(a.categoria), a.modelo]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {a.filial_nome}
                    </span>
                    <StatusBadge status={a.status} className="text-[11px]" />
                    <button
                      type="button"
                      onClick={() => remover(a.id)}
                      aria-label={`Remover ${a.patrimonio}`}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-end">
            <Button onClick={() => setPasso(2)} disabled={itens.length === 0}>
              Avançar ({itens.length}{' '}
              {itens.length === 1 ? 'ativo' : 'ativos'})
            </Button>
          </div>
        </div>
      )}

      {/* ---------------- PASSO 2 — Movimentação ---------------- */}
      {passo === 2 && (
        <div className="space-y-5">
          {Object.keys(errosPorAtivo).length > 0 && (
            <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">
                Itens que falharam no último envio:
              </p>
              {itens.map(
                (a) =>
                  errosPorAtivo[a.id] && (
                    <p key={a.id} className="text-destructive">
                      <span className="font-medium tabular-nums">
                        {a.patrimonio}
                      </span>{' '}
                      — {errosPorAtivo[a.id]}
                    </p>
                  ),
              )}
            </div>
          )}

          {estadosMistos && (
            <p className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              <TriangleAlert className="size-3.5" />
              Os ativos estão em estados diferentes — só aparecem as movimentações
              válidas para todos eles.
            </p>
          )}

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-2">
              <Label>Tipo de movimentação</Label>
              <Select
                value={config.tipo || undefined}
                onValueChange={(v) => trocarTipo(v as TipoMovimentacao)}
              >
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Escolha o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {tiposValidos.map((t) => (
                    <SelectItem key={t} value={t}>
                      {rotuloTipo(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {ultimaMov && (
              <Button
                type="button"
                variant="outline"
                onClick={repetirUltima}
                className="gap-2"
              >
                <RotateCcw className="size-4" />
                Repetir última
              </Button>
            )}
          </div>

          {config.tipo && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Motivo */}
              {motivosAplicaveis.length > 0 && (
                <div className="grid gap-2">
                  <Label>
                    Motivo
                    {['saida', 'emprestimo', 'devolucao'].includes(
                      config.tipo,
                    ) && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={config.motivo || undefined}
                    onValueChange={(v) => set('motivo', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o motivo" />
                    </SelectTrigger>
                    <SelectContent>
                      {motivosAplicaveis.map((m) => (
                        <SelectItem key={m.codigo} value={m.codigo}>
                          {m.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Colaborador / Setor */}
              {['saida', 'emprestimo', 'reserva'].includes(config.tipo) && (
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="colaborador">Colaborador</Label>
                    <Input
                      id="colaborador"
                      value={config.colaborador}
                      onChange={(e) => set('colaborador', e.target.value)}
                      placeholder="Nome do colaborador"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="setor">Setor</Label>
                    <Input
                      id="setor"
                      value={config.setor}
                      onChange={(e) => set('setor', e.target.value)}
                      placeholder="Setor de destino"
                    />
                  </div>
                </>
              )}

              {/* Chamado */}
              {['saida', 'emprestimo', 'reserva'].includes(config.tipo) && (
                <div className="grid gap-2">
                  <Label htmlFor="chamado">Chamado (opcional)</Label>
                  <Input
                    id="chamado"
                    inputMode="numeric"
                    value={config.chamado}
                    onChange={(e) => set('chamado', e.target.value)}
                    placeholder="Nº do chamado"
                  />
                </div>
              )}

              {/* Termo */}
              {['saida', 'emprestimo'].includes(config.tipo) && (
                <>
                  <div className="grid gap-2">
                    <Label>Termo de responsabilidade</Label>
                    <Select
                      value={config.termo || undefined}
                      onValueChange={(v) => set('termo', v as TermoStatus)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Não informado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sim">Assinado</SelectItem>
                        <SelectItem value="enviado">
                          Enviado (sem assinatura)
                        </SelectItem>
                        <SelectItem value="nao">Não gerado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="termo-data">Data do termo</Label>
                    <Input
                      id="termo-data"
                      type="date"
                      value={config.termoData}
                      onChange={(e) => set('termoData', e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* Filial destino (transferencia) */}
              {config.tipo === 'transferencia' && (
                <div className="grid gap-2">
                  <Label>
                    Filial de destino<span className="text-destructive"> *</span>
                  </Label>
                  <Select
                    value={config.filialDestinoId || undefined}
                    onValueChange={(v) => set('filialDestinoId', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a filial" />
                    </SelectTrigger>
                    <SelectContent>
                      {filiais.map((f) => (
                        <SelectItem key={f.id} value={String(f.id)}>
                          {f.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Status resultante (ajuste) */}
              {config.tipo === 'ajuste' && (
                <div className="grid gap-2">
                  <Label>
                    Novo status<span className="text-destructive"> *</span>
                  </Label>
                  <Select
                    value={statusResultante || undefined}
                    onValueChange={setStatusResultante}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_ORDEM.map((s) => (
                        <SelectItem key={s} value={s}>
                          {rotuloStatus(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Data */}
              <div className="grid gap-2">
                <Label htmlFor="data">Data</Label>
                <Input
                  id="data"
                  type="date"
                  max={hojeISO()}
                  value={config.data}
                  onChange={(e) => set('data', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Itens faltantes (devolucao) */}
          {config.tipo === 'devolucao' && (
            <div className="grid gap-2">
              <Label>Itens faltantes na devolução</Label>
              <div className="flex flex-wrap gap-3 rounded-lg border p-3">
                {ACESSORIOS_DEVOLUCAO.map((it) => {
                  const marcado = config.itensFaltantes.includes(it)
                  return (
                    <label
                      key={it}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={marcado}
                        onCheckedChange={(c) =>
                          set(
                            'itensFaltantes',
                            c === true
                              ? [...config.itensFaltantes, it]
                              : config.itensFaltantes.filter((x) => x !== it),
                          )
                        }
                      />
                      {rotuloAcessorio(it)}
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Observacao (todos os tipos) */}
          {config.tipo && (
            <div className="grid gap-2">
              <Label htmlFor="observacao">
                Observação
                {config.tipo === 'ajuste' ? (
                  <span className="text-destructive"> * (justificativa)</span>
                ) : (
                  ' (opcional)'
                )}
              </Label>
              <Textarea
                id="observacao"
                rows={2}
                maxLength={500}
                value={config.observacao}
                onChange={(e) => set('observacao', e.target.value)}
                placeholder="Observação (opcional) — ex.: aguardando NF-e, tela trincada…"
              />
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setPasso(1)}>
              Voltar
            </Button>
            <Button onClick={avancarParaRevisao} disabled={!config.tipo}>
              Revisar
            </Button>
          </div>
        </div>
      )}

      {/* ---------------- PASSO 3 — Revisão ---------------- */}
      {passo === 3 && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="p-2.5 font-medium">Patrimônio</th>
                  <th className="p-2.5 font-medium">Movimentação</th>
                  <th className="p-2.5 font-medium">Destino / Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {itens.map((a) => (
                  <tr key={a.id}>
                    <td className="p-2.5 font-medium tabular-nums">
                      {a.patrimonio}
                    </td>
                    <td className="p-2.5">
                      {config.tipo && rotuloTipo(config.tipo)}
                    </td>
                    <td className="p-2.5 text-muted-foreground">
                      {resumoDestino(config, filiais, motivos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setPasso(2)}>
              Voltar
            </Button>
            <Button onClick={registrar} disabled={enviando}>
              {enviando
                ? 'Registrando…'
                : `Registrar ${itens.length} ${itens.length === 1 ? 'movimentação' : 'movimentações'}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Texto resumido do destino/motivo para a tabela de revisao.
function resumoDestino(
  c: Config,
  filiais: Filial[],
  motivos: Motivo[],
): string {
  if (c.tipo === 'transferencia') {
    const f = filiais.find((x) => String(x.id) === c.filialDestinoId)
    return f ? `→ ${f.nome}` : '—'
  }
  const partes: string[] = []
  if (c.motivo) {
    const m = motivos.find((x) => x.codigo === c.motivo)
    partes.push(m?.rotulo ?? c.motivo)
  }
  if (c.colaborador) partes.push(c.colaborador)
  if (c.setor) partes.push(c.setor)
  return partes.length > 0 ? partes.join(' · ') : '—'
}
