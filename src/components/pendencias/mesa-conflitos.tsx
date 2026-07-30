'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, ExternalLink, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { rotuloCategoria, rotuloStatus } from '@/lib/dominio'
import {
  CAMPOS_CONFLITO,
  camposDivergentes,
  resumoDaExclusao,
  type CampoConflito,
  type GrupoConflito,
  type LadoConflito,
} from '@/lib/pendencias/conflitos'
import {
  MIN_JUSTIFICATIVA_CONFLITO,
  confirmacaoConflitoConfere,
  textoConfirmacaoConflito,
} from '@/lib/validators/conflitos'
import { apagarConflito } from '@/lib/actions/conflitos'

// A MESA DE CONFLITOS (F24) — a seção própria de /pendencias.
//
// Client Component porque tem seleção (checkbox) e diálogo. Recebe os grupos JÁ montados e
// as datas JÁ formatadas pelo servidor: nada de `new Date()` aqui, pela mesma razão da fila
// da F18 (mismatch de hidratação na virada do dia).
//
// ⚠ `podeApagar` (nível administrador) desliga TUDO o que age: checkboxes, "selecionar
// todos", a barra de lote e os botões por grupo. Todo logado ATIVO continua LENDO a mesa —
// operador e consulta veem o conflito e o diff, só não têm como apagar. E isto é a UI: a
// segurança é a RPC (migration 0093), que confere `e_admin()` por dentro.

/** Um grupo com as datas já formatadas no servidor. */
export type GrupoConflitoFmt = Omit<GrupoConflito, 'lados'> & {
  lados: (LadoConflito & { entradaFmt: string; ultimaMovFmt: string })[]
}

type LadoFmt = GrupoConflitoFmt['lados'][number]

function valorDoCampo(lado: LadoFmt, campo: CampoConflito): string {
  switch (campo) {
    case 'status':
      return rotuloStatus(lado.status)
    case 'categoria':
      return rotuloCategoria(lado.categoria)
    case 'entradaEm':
      return lado.entradaFmt
    default: {
      const v = lado[campo]
      return v === null || v === undefined || String(v).trim() === '' ? '—' : String(v)
    }
  }
}

export function MesaConflitos({
  grupos,
  podeApagar = false,
}: {
  grupos: GrupoConflitoFmt[]
  podeApagar?: boolean
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [dialogo, setDialogo] = useState<LadoFmt[] | null>(null)

  // Ids VISÍVEIS nesta página. A seleção some ao paginar/filtrar — mesma decisão da fila da
  // F18: cada página resolve a sua, sem a surpresa de "apaguei o que não estava vendo".
  const idsVisiveis = useMemo(
    () => grupos.flatMap((g) => g.lados.map((l) => l.ativoId)),
    [grupos],
  )
  const porId = useMemo(() => {
    const m = new Map<string, LadoFmt>()
    for (const g of grupos) for (const l of g.lados) m.set(l.ativoId, l)
    return m
  }, [grupos])

  const selecionadosVisiveis = useMemo(
    () => idsVisiveis.filter((id) => selecionados.has(id)),
    [idsVisiveis, selecionados],
  )
  const todosMarcados =
    idsVisiveis.length > 0 && selecionadosVisiveis.length === idsVisiveis.length

  function toggle(id: string, on: boolean) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function abrirDialogo(ids: string[]) {
    const lados = ids.map((id) => porId.get(id)).filter((l): l is LadoFmt => l !== undefined)
    if (lados.length > 0) setDialogo(lados)
  }

  return (
    <div className="space-y-4">
      {/* Barra de lote — só para quem pode apagar, e só com algo marcado. */}
      {podeApagar && selecionadosVisiveis.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-300/60 bg-orange-50 p-3 dark:border-orange-900/60 dark:bg-orange-950/30">
          <span className="text-sm tabular-nums">
            <strong>{selecionadosVisiveis.length}</strong>{' '}
            {selecionadosVisiveis.length === 1
              ? 'cadastro selecionado'
              : 'cadastros selecionados'}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelecionados(new Set())}>
              Limpar seleção
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={() => abrirDialogo(selecionadosVisiveis)}
            >
              <Trash2 className="size-4" />
              Apagar selecionados ({selecionadosVisiveis.length})
            </Button>
          </div>
        </div>
      )}

      {podeApagar && idsVisiveis.length > 0 && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={todosMarcados}
            onCheckedChange={(v) =>
              setSelecionados(v === true ? new Set(idsVisiveis) : new Set())
            }
            aria-label="Selecionar todos os cadastros desta página"
          />
          Selecionar todos desta página
        </label>
      )}

      {grupos.map((g) => {
        const divergentes = camposDivergentes(g.lados)
        const idsDoGrupo = g.lados.map((l) => l.ativoId)
        return (
          <section key={g.chave} className="rounded-xl border bg-card">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                  Conflito entre filiais
                </Badge>
                <span className="font-mono font-semibold tabular-nums">{g.rotulo}</span>
                <span className="text-sm text-muted-foreground">
                  {g.lados.length} cadastros em {g.lados.length} filiais
                </span>
              </div>
              {podeApagar && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-destructive hover:text-destructive"
                  onClick={() => abrirDialogo(idsDoGrupo)}
                >
                  <Trash2 className="size-4" />
                  {g.lados.length === 2 ? 'Apagar ambos' : `Apagar os ${g.lados.length}`}
                </Button>
              )}
            </header>

            {/* Os lados LADO A LADO. Em telas estreitas empilham; o realce continua. */}
            <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]">
              {g.lados.map((l) => (
                <div key={l.ativoId} className="space-y-3 bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {podeApagar && (
                        <Checkbox
                          checked={selecionados.has(l.ativoId)}
                          onCheckedChange={(v) => toggle(l.ativoId, v === true)}
                          aria-label={`Selecionar o cadastro de ${l.filialNome}`}
                        />
                      )}
                      <span className="font-semibold">{l.filialNome}</span>
                    </div>
                    <Button asChild variant="ghost" size="sm" className="gap-1 px-2">
                      <Link href={`/ativos/${l.ativoId}`}>
                        Ficha
                        <ExternalLink className="size-3.5" />
                      </Link>
                    </Button>
                  </div>

                  <dl className="space-y-1 text-sm">
                    {CAMPOS_CONFLITO.map(({ chave, rotulo }) => {
                      const difere = divergentes.has(chave)
                      return (
                        <div
                          key={chave}
                          className={cn(
                            'flex items-baseline justify-between gap-3 rounded px-1.5 py-0.5',
                            // O realce é o coração da mesa: os campos que DIFEREM entre os
                            // lados são o que faz alguém decidir qual cadastro é o certo.
                            difere && 'bg-amber-100/70 dark:bg-amber-950/40',
                          )}
                        >
                          <dt className="shrink-0 text-muted-foreground">{rotulo}</dt>
                          <dd
                            className={cn(
                              'text-right break-all',
                              difere && 'font-medium text-amber-900 dark:text-amber-200',
                            )}
                          >
                            {valorDoCampo(l, chave)}
                          </dd>
                        </div>
                      )
                    })}
                  </dl>

                  {/* Resumo de histórico do lado (§3.2) — o sinal mais forte de qual
                      cadastro tem vida real de sistema. */}
                  <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs tabular-nums">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Movimentações</span>
                      <span>
                        {l.movimentacoes}
                        {l.movimentacoesReais > 0 && (
                          <span className="text-muted-foreground">
                            {' '}
                            ({l.movimentacoesReais} fora da carga)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Termos</span>
                      <span>{l.termos}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Última movimentação</span>
                      <span>{l.ultimaMovFmt}</span>
                    </div>
                  </div>

                  {l.temHistoricoReal && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      Tem histórico próprio além da carga do import — provavelmente é este o
                      cadastro certo.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )
      })}

      {dialogo && (
        <DialogoApagarConflito
          lados={dialogo}
          onFechar={() => setDialogo(null)}
          onApagado={() => {
            setSelecionados(new Set())
            setDialogo(null)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// O diálogo (§4.3)
// ---------------------------------------------------------------------------
// Molde do `DialogoDestrutivo` da F23 — MESMO padrão, componente próprio: a mesa não mora na
// Zona destrutiva e não deve depender do módulo dela (a ordem F24 fecha aquele escopo). O que
// é copiado de propósito: Dialog comum (o projeto não tem `alert-dialog` e não ganha
// dependência nova), foco inicial no CANCELAR — a ação destrutiva nunca fica sob o Enter — e
// nenhum submit por Enter, porque há um textarea logo abaixo do campo de confirmação.

function DialogoApagarConflito({
  lados,
  onFechar,
  onApagado,
}: {
  lados: LadoFmt[]
  onFechar: () => void
  onApagado: () => void
}) {
  const router = useRouter()
  const [confirmacao, setConfirmacao] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [executando, start] = useTransition()
  const cancelarRef = useRef<HTMLButtonElement>(null)

  const resumo = useMemo(() => resumoDaExclusao(lados), [lados])
  const esperado = textoConfirmacaoConflito(lados.length)
  const confere = confirmacaoConflitoConfere(confirmacao, lados.length)
  const justificativaOk = justificativa.trim().length >= MIN_JUSTIFICATIVA_CONFLITO
  const pronto = confere && justificativaOk && !executando
  const faltam = MIN_JUSTIFICATIVA_CONFLITO - justificativa.trim().length

  function executar() {
    if (!pronto) return
    start(async () => {
      try {
        const res = await apagarConflito({
          ativoIds: lados.map((l) => l.ativoId),
          confirmacao: confirmacao.trim(),
          justificativa: justificativa.trim(),
        })
        if (!res.ok) {
          toast.error(res.erro, { duration: 12000 })
          return
        }
        // Aviso aqui é sempre GRAVE (arquivo de termo órfão no armazenamento): entra como
        // alerta longo, nunca como sucesso, para ninguém sair achando que acabou limpo.
        if (res.aviso) toast.warning(res.aviso, { duration: 15000 })
        else {
          toast.success(
            lados.length === 1
              ? 'Cadastro apagado. O conflito foi resolvido.'
              : `${lados.length} cadastros apagados.`,
          )
        }
        onApagado()
        router.refresh()
      } catch {
        // A mensagem diz em que estado o dado CONTINUA, para ninguém repetir "por garantia"
        // — e repetir operação destrutiva por garantia é como se apaga duas coisas.
        toast.error(
          'Não foi possível concluir — pelo que sabemos, nada foi apagado. Confira a conexão, recarregue a página e veja o estado atual antes de tentar de novo.',
          { duration: 12000 },
        )
      }
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          cancelarRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {lados.length === 1
              ? 'Apagar este cadastro?'
              : `Apagar ${lados.length} cadastros?`}
          </DialogTitle>
          <DialogDescription>
            Esta ação <strong>não tem volta</strong>. O histórico do cadastro apagado vai
            junto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border p-3 text-sm">
          <ul className="space-y-1">
            {resumo.porFilial.map((f) => (
              <li key={f.filial} className="flex justify-between gap-3 tabular-nums">
                <span className="text-muted-foreground">{f.filial}</span>
                <span>
                  {f.ativos} {f.ativos === 1 ? 'cadastro' : 'cadastros'}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between gap-3 border-t pt-2 tabular-nums">
            <span className="text-muted-foreground">Movimentações que somem junto</span>
            <span>{resumo.movimentacoes}</span>
          </div>
          <div className="flex justify-between gap-3 tabular-nums">
            <span className="text-muted-foreground">Termos que somem junto</span>
            <span>{resumo.termos}</span>
          </div>
        </div>

        {/* O AVISO DESTACADO (§4.3): apagar cadastro com vida própria é PERMITIDO — o
            Johnny decidiu assim —, mas nunca em silêncio. */}
        {resumo.comHistoricoReal.length > 0 && (
          <div className="rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm dark:border-amber-700/60 dark:bg-amber-950/30">
            <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
              <AlertTriangle className="size-4" />
              {resumo.comHistoricoReal.length === 1
                ? 'Um dos cadastros tem histórico próprio'
                : `${resumo.comHistoricoReal.length} cadastros têm histórico próprio`}
            </div>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {resumo.comHistoricoReal.map((l) => (
                <li key={l.ativoId}>
                  <strong>{l.filialNome}</strong>: {l.movimentacoesReais} movimentação(ões)
                  fora da carga do import
                  {l.termos > 0 && `, ${l.termos} termo(s)`}.
                </li>
              ))}
            </ul>
            <p className="mt-2 text-muted-foreground">
              Movimentação registrada por alguém no sistema é sinal de que este é o cadastro
              em uso. Confira antes de seguir.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="conflito-confirmacao">Para confirmar, digite exatamente:</Label>
          <p className="font-mono text-xs break-all text-muted-foreground">{esperado}</p>
          <Input
            id="conflito-confirmacao"
            value={confirmacao}
            autoComplete="off"
            spellCheck={false}
            placeholder={esperado}
            onChange={(e) => setConfirmacao(e.target.value)}
            disabled={executando}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="conflito-justificativa">
            Justificativa <span className="text-muted-foreground">(obrigatória)</span>
          </Label>
          <Textarea
            id="conflito-justificativa"
            value={justificativa}
            rows={3}
            placeholder="Por que este cadastro é o errado?"
            onChange={(e) => setJustificativa(e.target.value)}
            disabled={executando}
          />
          <p className="text-xs text-muted-foreground">
            {justificativaOk
              ? 'Fica registrada na trilha de auditoria, junto com a cópia do que foi apagado.'
              : `Faltam ${faltam} caractere(s) — é o que vai explicar esta exclusão depois que o cadastro não existir mais.`}
          </p>
        </div>

        <DialogFooter>
          <Button
            ref={cancelarRef}
            type="button"
            variant="ghost"
            onClick={onFechar}
            disabled={executando}
          >
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={!pronto} onClick={executar}>
            {executando
              ? 'Apagando…'
              : lados.length === 1
                ? 'Apagar cadastro'
                : `Apagar ${lados.length} cadastros`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
