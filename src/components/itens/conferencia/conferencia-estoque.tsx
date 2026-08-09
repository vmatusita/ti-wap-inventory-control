'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { lancarItens } from '@/lib/actions/itens'
import { MAX_LINHAS_LOTE_ITEM } from '@/lib/validators/item'
import { formatDate, hojeISO } from '@/lib/format'
import { GRUPO_ITEM_META, GRUPO_ITEM_ORDEM, type GrupoItem } from '@/lib/dominio'
import { cn } from '@/lib/utils'
import {
  ajustesDaConferencia,
  itensPendentes,
  linhasDaConferencia,
  observacaoDeInventario,
  particionar,
  resumoDaConferencia,
  textoResumoConferencia,
  type AjusteConferencia,
} from '@/lib/itens/conferencia'
import {
  horaDoRascunho,
  lerRascunhoConferencia,
  limparRascunhoConferencia,
  salvarRascunhoConferencia,
} from '@/components/itens/conferencia/rascunho'
import type { SaldoItem } from '@/lib/queries/itens'
import type { Filial } from '@/lib/queries/filiais'

// Modo Conferência (F31 · ITN-04): a tabela de saldos da filial com uma coluna
// editável "Contado" ao lado do Estoque, o diff ao vivo e um botão que gera os
// ajustes das diferenças em blocos.
//
// O QUE ELE **NÃO** É: contagem cega (o saldo do sistema fica à vista de
// propósito — o objetivo aqui é corrigir divergência, não auditar o operador), e
// não há histórico/agenda de inventários nem relatório de acuracidade. Tudo isso
// é backlog declarado da ordem F31.

type EstadoLinha = { erro?: string; gravado?: boolean }

export function ConferenciaEstoque({
  filialId,
  filialNome,
  saldos,
  outrasFiliais,
}: {
  filialId: number
  filialNome: string
  saldos: SaldoItem[]
  /** Para o atalho "conferir outra filial" depois de concluir. */
  outrasFiliais: Filial[]
}) {
  const router = useRouter()
  const [contagens, setContagens] = useState<Record<number, string>>({})
  const [gravados, setGravados] = useState<number[]>([])
  const [estados, setEstados] = useState<Record<number, EstadoLinha>>({})
  const [observacao, setObservacao] = useState(observacaoDeInventario(formatDate(hojeISO())))
  const [confirmando, setConfirmando] = useState(false)
  const [progresso, setProgresso] = useState<{ bloco: number; total: number } | null>(null)
  const [enviando, start] = useTransition()

  // Rascunho: só é OFERECIDO, nunca aplicado sozinho — aplicar por conta própria
  // sobrescreveria uma contagem que o operador começou agora nesta aba.
  const [oferta, setOferta] = useState<{ hora: string | null } | null>(null)
  const rascunhoOfertado = useRef<ReturnType<typeof lerRascunhoConferencia>>(null)
  // `iniciadaEm` é fixado no primeiro salvamento e preservado nos seguintes: se
  // fosse recalculado a cada tecla, o banner diria "começada às 15:42" para uma
  // conferência de meia hora atrás.
  const iniciadaEm = useRef<string | null>(null)

  // Leitura SÓ dentro de efeito (ler storage no corpo do componente quebraria a
  // hidratação do Next) e SÓ na montagem. O `setTimeout(…, 0)` é o padrão da casa
  // para não chamar `setState` no corpo do efeito
  // (`react-hooks/set-state-in-effect`) — mesmo recurso de
  // `nova-movimentacao-form.tsx`.
  //
  // Rascunho de OUTRA filial não é oferecido: as contagens são daquela
  // prateleira, e aplicá-las aqui produziria diferenças inventadas.
  useEffect(() => {
    const t = setTimeout(() => {
      const r = lerRascunhoConferencia()
      if (!r || r.filialId !== filialId) return
      rascunhoOfertado.current = r
      setOferta({ hora: horaDoRascunho(r.iniciadaEm) })
    }, 0)
    return () => clearTimeout(t)
  }, [filialId])

  // Salva a cada mudança. `contagens` e `gravados` são o trabalho que não pode se
  // perder num F5 no meio do corredor — e `gravados` em especial, porque é ele
  // que impede o reenvio de regravar um ajuste que já entrou.
  //
  // ⚠ NÃO grava enquanto o banner está aberto: senão a primeira tecla digitada
  // por quem ainda não decidiu já teria apagado o rascunho que o banner está
  // oferecendo. Quem responde ao banner é `continuarRascunho` ou
  // `descartarRascunho` — e a primeira contagem digitada também responde
  // (`contar` fecha a oferta), que é o mesmo desenho de `marcarAlteracao` no
  // formulário de movimentação.
  useEffect(() => {
    if (oferta) return
    const temAlgo = Object.keys(contagens).length > 0 || gravados.length > 0
    if (!temAlgo) return
    if (!iniciadaEm.current) iniciadaEm.current = new Date().toISOString()
    salvarRascunhoConferencia({
      filialId,
      contagens,
      gravados,
      observacao,
      iniciadaEm: iniciadaEm.current,
    })
  }, [contagens, gravados, observacao, filialId, oferta])

  function continuarRascunho() {
    const r = rascunhoOfertado.current
    if (!r) return
    setContagens(r.contagens)
    setGravados(r.gravados)
    if (r.observacao) setObservacao(r.observacao)
    iniciadaEm.current = r.iniciadaEm || new Date().toISOString()
    setOferta(null)
    toast.success('Conferência restaurada.')
  }

  function descartarRascunho() {
    limparRascunhoConferencia()
    rascunhoOfertado.current = null
    iniciadaEm.current = null
    setOferta(null)
  }

  function contar(itemId: number, valor: string) {
    // Começar a contar É responder ao banner: quem digita escolheu recomeçar. Sem
    // isto o rascunho novo nunca seria gravado (o efeito de salvar espera a
    // oferta fechar) e o trabalho desta sessão se perderia num F5.
    if (oferta) descartarRascunho()
    setContagens((c) => ({ ...c, [itemId]: valor }))
    setEstados((e) => (e[itemId]?.erro ? { ...e, [itemId]: { ...e[itemId], erro: undefined } } : e))
  }

  const linhas = useMemo(() => linhasDaConferencia(saldos, contagens), [saldos, contagens])
  const resumo = useMemo(() => resumoDaConferencia(linhas), [linhas])
  const ajustes = useMemo(() => ajustesDaConferencia(linhas), [linhas])
  const pendentes = useMemo(() => itensPendentes(ajustes, gravados), [ajustes, gravados])
  const diffPorItem = useMemo(
    () => new Map(linhas.map((l) => [l.itemId, l.diff])),
    [linhas],
  )

  const porGrupo = useMemo(
    () =>
      GRUPO_ITEM_ORDEM.map((g) => ({
        grupo: g as GrupoItem,
        itens: saldos.filter((s) => s.grupo === g),
      })).filter((b) => b.itens.length > 0),
    [saldos],
  )

  const nomePorItem = useMemo(
    () => new Map(saldos.map((s) => [s.item_id, s.item])),
    [saldos],
  )

  function registrar() {
    const aEnviar = pendentes
    if (aEnviar.length === 0) return
    const blocos = particionar(aEnviar, MAX_LINHAS_LOTE_ITEM)

    start(async () => {
      const gravadosAgora: number[] = []
      const errosAgora: Record<number, EstadoLinha> = {}
      let interrompeu = false

      for (let i = 0; i < blocos.length; i++) {
        setProgresso({ bloco: i + 1, total: blocos.length })
        const bloco = blocos[i]
        try {
          const res = await lancarItens({
            filial_id: filialId,
            tipo: 'ajuste',
            linhas: bloco.map((a) => ({ item_id: a.item_id, quantidade: a.quantidade })),
            data: hojeISO(),
            observacao,
          })
          if (res.erroGeral) {
            // Falha ANTES de tocar o banco (sessão expirada, payload inválido):
            // nada deste bloco entrou, e insistir nos seguintes só empilharia o
            // mesmo erro. Para aqui e o que já gravou continua gravado.
            for (const a of bloco) errosAgora[a.item_id] = { erro: res.erroGeral }
            interrompeu = true
            break
          }
          bloco.forEach((a, j) => {
            const r = res.resultados[j]
            if (r?.ok) gravadosAgora.push(a.item_id)
            else errosAgora[a.item_id] = { erro: r?.erro ?? 'Não foi possível registrar.' }
          })
        } catch {
          for (const a of bloco) {
            errosAgora[a.item_id] = {
              erro: 'Falha de conexão — este ajuste não foi registrado.',
            }
          }
          interrompeu = true
          break
        }
      }

      setProgresso(null)
      // `gravados` cresce ANTES de qualquer outra coisa: é ele que o rascunho
      // guarda e que faz o reenvio mandar só o que falta.
      if (gravadosAgora.length) {
        setGravados((g) => [...new Set([...g, ...gravadosAgora])])
      }
      setEstados((e) => {
        const novo = { ...e }
        for (const id of gravadosAgora) novo[id] = { gravado: true }
        for (const [id, est] of Object.entries(errosAgora)) novo[Number(id)] = est
        return novo
      })

      const falharam = Object.keys(errosAgora).length
      if (falharam === 0) {
        toast.success(
          gravadosAgora.length === 1
            ? '1 diferença registrada.'
            : `${gravadosAgora.length} diferenças registradas.`,
        )
        setConfirmando(false)
      } else if (gravadosAgora.length > 0) {
        toast.warning(
          `${gravadosAgora.length} de ${aEnviar.length} diferenças registradas. As que falharam continuam na tela — mande de novo só elas.`,
        )
        setConfirmando(false)
      } else {
        toast.error(
          interrompeu
            ? 'Nenhuma diferença foi registrada.'
            : 'Nenhuma diferença foi registrada — veja o motivo em cada linha.',
        )
      }
      router.refresh()
    })
  }

  function concluir() {
    limparRascunhoConferencia()
    rascunhoOfertado.current = null
    iniciadaEm.current = null
    setContagens({})
    setGravados([])
    setEstados({})
    router.refresh()
    toast.success('Conferência encerrada.')
  }

  const tudoGravado = ajustes.length > 0 && pendentes.length === 0

  return (
    <div className="space-y-4">
      {oferta && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <RotateCcw className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            Continuar a conferência de {filialNome}
            {oferta.hora ? ` começada às ${oferta.hora}` : ''}?
          </span>
          <span className="flex gap-2">
            <Button size="sm" className="min-h-9" onClick={continuarRascunho}>
              Continuar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="min-h-9"
              onClick={descartarRascunho}
            >
              Descartar
            </Button>
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          Conferindo <strong>{filialNome}</strong>
        </p>
        <Button asChild variant="ghost" size="sm">
          <Link href="/itens">Voltar para Itens</Link>
        </Button>
      </div>

      {porGrupo.map((bloco) => (
        <section key={bloco.grupo} className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-2.5 text-sm font-semibold">
            {GRUPO_ITEM_META[bloco.grupo].titulo}
          </h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Sistema</TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bloco.itens.map((s) => {
                  const diff = diffPorItem.get(s.item_id)
                  const est = estados[s.item_id]
                  return (
                    <TableRow key={s.item_id}>
                      <TableCell className="font-medium">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {s.item}
                          {est?.gravado && (
                            <span className="text-[10px] text-muted-foreground">(registrado)</span>
                          )}
                        </span>
                        {est?.erro && (
                          <p className="text-xs text-red-600 dark:text-red-400">{est.erro}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {s.estoque.toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className="py-1 text-right">
                        {/* `min-h-11` — alvo de toque do padrão F29: esta tela é
                            usada de pé, no corredor, com o celular na mão. */}
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          aria-label={`Contado de ${s.item}`}
                          className="ml-auto min-h-11 w-24 text-right tabular-nums"
                          value={contagens[s.item_id] ?? ''}
                          onChange={(e) => contar(s.item_id, e.target.value)}
                          disabled={enviando}
                          placeholder="—"
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {diff == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : diff === 0 ? (
                          <span className="text-muted-foreground">0</span>
                        ) : (
                          <span
                            className={cn(
                              'font-semibold',
                              diff > 0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400',
                            )}
                          >
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}

      {/* Barra fixa: o resumo e a ação, sempre à vista enquanto se conta. */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <p className="text-sm tabular-nums" aria-live="polite">
          {textoResumoConferencia(resumo)}
          {gravados.length > 0 && (
            <span className="text-muted-foreground">
              {' '}
              · {gravados.length} já registrada{gravados.length === 1 ? '' : 's'}
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {tudoGravado && (
            <Button variant="outline" onClick={concluir} disabled={enviando}>
              Encerrar conferência
            </Button>
          )}
          <Button
            onClick={() => setConfirmando(true)}
            disabled={enviando || pendentes.length === 0}
          >
            {pendentes.length > 0
              ? `Registrar diferenças (${pendentes.length})`
              : resumo.conferidos > 0
                ? 'Nada a registrar'
                : 'Registrar diferenças'}
          </Button>
        </div>
      </div>

      {tudoGravado && outrasFiliais.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Conferir outra filial:{' '}
          {outrasFiliais.map((f, i) => (
            <span key={f.id}>
              {i > 0 && ' · '}
              <Link
                href={`/itens/conferencia?filial=${f.id}`}
                className="rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                {f.nome}
              </Link>
            </span>
          ))}
        </p>
      )}

      <Dialog open={confirmando} onOpenChange={(o) => !enviando && setConfirmando(o)}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar as diferenças</DialogTitle>
            <DialogDescription>
              Cada diferença vira um ajuste em {filialNome}, com a observação abaixo como
              justificativa. As linhas que bateram não geram lançamento nenhum.
            </DialogDescription>
          </DialogHeader>

          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border bg-muted/40 p-3 text-sm">
            {pendentes.map((a: AjusteConferencia) => (
              <li key={a.item_id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{nomePorItem.get(a.item_id) ?? a.item_id}</span>
                <span
                  className={cn(
                    'shrink-0 font-semibold tabular-nums',
                    a.quantidade > 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400',
                  )}
                >
                  {a.quantidade > 0 ? `+${a.quantidade}` : a.quantidade}
                </span>
              </li>
            ))}
          </ul>

          <div className="space-y-1.5">
            <Label htmlFor="conf-obs">Observação (justificativa dos ajustes)</Label>
            <Textarea
              id="conf-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              disabled={enviando}
            />
          </div>

          {pendentes.length > MAX_LINHAS_LOTE_ITEM && (
            <p className="text-xs text-muted-foreground">
              São {pendentes.length} ajustes — eles vão em blocos de {MAX_LINHAS_LOTE_ITEM}, um
              depois do outro.
            </p>
          )}
          {progresso && (
            <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
              Registrando… bloco {progresso.bloco} de {progresso.total}
            </p>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={registrar} disabled={enviando || pendentes.length === 0}>
              {enviando ? 'Registrando…' : `Registrar ${pendentes.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
