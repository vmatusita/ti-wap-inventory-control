'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { ObsTooltip } from '@/components/relatorios/obs-tooltip'
import { Dica } from '@/components/ui/dica'
import { estornarLancamento } from '@/lib/actions/itens'
import { formatDate } from '@/lib/format'
import { pillTipoLancamento, rotuloTipoLancamento } from '@/lib/dominio'
import { cn } from '@/lib/utils'
import type { LancamentoHistorico } from '@/lib/queries/itens'
import { ROTULO_SALDO_APOS, TEXTO_DICA_SALDO_APOS } from '@/lib/itens/saldo-apos'
import {
  AVISO_ESTORNO_PERNA_TRANSFERENCIA,
  ROTULO_PERNA_TRANSFERENCIA,
  ehPernaDeTransferencia,
} from '@/lib/itens/transferencia'
import { TETO_MOTIVO_ESTORNO } from '@/lib/validators/item'

// Histórico de lançamentos (OS 3.3.3): mais recente primeiro, com "Estornar"
// (cria o inverso vinculado — nada se apaga). Linha estornada/estorno sinalizadas.
//
// F21 — `podeEstornar` é o cargo (≥ operador; §0 da ordem: `ESTORNO_OPERADOR =
// sim`), não o vínculo de filial: a linha do histórico traz o NOME da filial, não
// o id, e casar por nome seria frágil. Um operador que estorne lançamento de
// filial não vinculada é recusado pela action `estornarLancamento`, com mensagem
// em pt-BR — o caminho que o critério 2 da ordem prevê.
export function HistoricoLancamentos({
  rows,
  podeEstornar = false,
  saldoAposPorId,
  motivoSaldoAposDegradado = null,
}: {
  rows: LancamentoHistorico[]
  podeEstornar?: boolean
  // ITN-03a — presente só quando o filtro tem EXATAMENTE 1 item + 1 filial
  // (calculado no servidor, em `ItensPage` — ver `lib/itens/saldo-apos.ts`).
  // `undefined` = coluna não aparece; valor `null` numa linha = degradado
  // (histórico não fechou com o saldo atual), célula vira "—" com o motivo.
  saldoAposPorId?: Map<string, number | null>
  motivoSaldoAposDegradado?: string | null
}) {
  const router = useRouter()
  const [alvo, setAlvo] = useState<LancamentoHistorico | null>(null)
  // ITN-05c — "Motivo (opcional)" do estorno, digitado no diálogo. Some
  // concatenado como "Estorno: {motivo}" na observação do inverso.
  const [motivo, setMotivo] = useState('')
  const [enviando, start] = useTransition()

  function abrirEstorno(r: LancamentoHistorico) {
    setAlvo(r)
    setMotivo('')
  }

  function fecharEstorno() {
    setAlvo(null)
    setMotivo('')
  }

  function confirmar() {
    if (!alvo) return
    start(async () => {
      // F19 — sem o catch, o throw de rede some dentro do startTransition: o
      // dialog fica aberto sem toast e o operador clica de novo, achando que o
      // estorno não saiu (ou saiu duas vezes). O erro de negócio (`!res.ok`)
      // segue tratado abaixo.
      try {
        const res = await estornarLancamento({
          lancamento_id: alvo.id,
          motivo: motivo.trim() || undefined,
        })
        if (!res.ok) {
          toast.error(res.erro)
          return
        }
        toast.success('Lançamento estornado (inverso criado).')
        fecharEstorno()
        router.refresh()
      } catch {
        toast.error(
          'Não foi possível estornar — o lançamento continua como estava. Verifique sua conexão e tente de novo.',
        )
      }
    })
  }

  if (rows.length === 0) {
    return (
      <EstadoVazio
        variante="inline"
        icone={ClipboardList}
        titulo="Nenhum lançamento no filtro atual"
        descricao="ajuste o item, o tipo ou o período acima"
        className="justify-center py-8"
      />
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qtd.</TableHead>
              <TableHead className="hidden md:table-cell">Filial</TableHead>
              <TableHead className="hidden md:table-cell">Chamado</TableHead>
              <TableHead className="hidden lg:table-cell">Colaborador</TableHead>
              <TableHead className="hidden lg:table-cell">Obs.</TableHead>
              {saldoAposPorId && (
                <TableHead className="text-right">
                  <Dica texto={TEXTO_DICA_SALDO_APOS}>{ROTULO_SALDO_APOS}</Dica>
                </TableHead>
              )}
              {podeEstornar && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className={cn(r.estornado && 'opacity-60')}>
                <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {/* ITN-02 — o AUTOR (quem registrou, `criado_por`) não tem coluna
                      própria: fica na Dica da data, ao lado do Colaborador (quem
                      digitou destinatário) que é a coluna cheia. */}
                  <Dica texto={`Lançado por ${r.autor_nome ?? 'desconhecido'}`}>
                    {formatDate(r.data)}
                  </Dica>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      pillTipoLancamento(r.tipo),
                    )}
                  >
                    {rotuloTipoLancamento(r.tipo)}
                  </span>
                  {/* F31 · ITN-01 — o selo de transferência é DERIVADO da
                      observação (`ehPernaDeTransferencia`) e é só apresentação:
                      no banco as duas pernas são ajustes comuns, e nenhuma
                      contagem de relatório muda por causa dele. Serve para o
                      operador distinguir, na lista, um ajuste de inventário de
                      um remanejamento entre filiais — que antes eram
                      indistinguíveis sem abrir a observação. */}
                  {(() => {
                    const perna = ehPernaDeTransferencia(r.tipo, r.observacao)
                    if (!perna) return null
                    return (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({ROTULO_PERNA_TRANSFERENCIA[perna]})
                      </span>
                    )
                  })()}
                  {r.ehEstorno && (
                    <span className="ml-1 text-[10px] text-muted-foreground">(estorno)</span>
                  )}
                  {r.estornado && !r.ehEstorno && (
                    <span className="ml-1 text-[10px] text-muted-foreground">(estornado)</span>
                  )}
                </TableCell>
                <TableCell className="font-medium">{r.item}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {r.quantidade > 0 ? `+${r.quantidade}` : r.quantidade}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap md:table-cell">{r.filial}</TableCell>
                <TableCell className="hidden whitespace-nowrap tabular-nums text-muted-foreground md:table-cell">
                  {r.chamado ? `#${r.chamado}` : '—'}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap lg:table-cell">
                  {r.colaborador ?? '—'}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <div className="max-w-[220px]">
                    <ObsTooltip texto={r.observacao} comIcone className="w-full text-xs" />
                  </div>
                </TableCell>
                {saldoAposPorId && (
                  <TableCell className="text-right tabular-nums">
                    {(() => {
                      const valor = saldoAposPorId.get(r.id)
                      if (valor == null) {
                        return (
                          <Dica texto={motivoSaldoAposDegradado ?? 'Não foi possível calcular.'}>
                            <span className="text-muted-foreground">—</span>
                          </Dica>
                        )
                      }
                      return <span className="font-medium">{valor.toLocaleString('pt-BR')}</span>
                    })()}
                  </TableCell>
                )}
                {podeEstornar && (
                  <TableCell className="text-right">
                    {!r.ehEstorno && !r.estornado && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground"
                        onClick={() => abrirEstorno(r)}
                      >
                        <Undo2 className="size-3.5" />
                        <span className="hidden sm:inline">Estornar</span>
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!alvo} onOpenChange={(o) => !o && fecharEstorno()}>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Estornar lançamento</DialogTitle>
            <DialogDescription>
              Cria o lançamento <strong>inverso</strong> vinculado (nada é apagado). O estoque
              e os atrelados voltam ao estado anterior.
            </DialogDescription>
          </DialogHeader>
          {alvo && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{alvo.item}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    pillTipoLancamento(alvo.tipo),
                  )}
                >
                  {rotuloTipoLancamento(alvo.tipo)}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground tabular-nums">
                {alvo.quantidade > 0 ? `+${alvo.quantidade}` : alvo.quantidade} · {alvo.filial} ·{' '}
                {formatDate(alvo.data)}
                {alvo.chamado ? ` · #${alvo.chamado}` : ''}
              </p>
              <p className="mt-1 text-muted-foreground">
                Lançado por {alvo.autor_nome ?? 'desconhecido'}
                {alvo.colaborador ? ` · para ${alvo.colaborador}` : ''}
              </p>
            </div>
          )}
          {/* F31 · ITN-01 — estorno de PERNA de transferência. Decidido AVISAR e
              não bloquear (PLAN-F31 §1.6): bloquear só aqui seria uma garantia
              de mentira (a regra viveria fora do Postgres), e travar no banco
              exigiria mexer em constraint de tabela existente, fora do escopo
              desta fase. Então a tela diz a verdade inteira — inclusive que o
              total consolidado muda — e aponta o caminho certo. */}
          {alvo && ehPernaDeTransferencia(alvo.tipo, alvo.observacao) && (
            <p
              role="alert"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              {AVISO_ESTORNO_PERNA_TRANSFERENCIA}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="estorno-motivo">Motivo (opcional)</Label>
            <Input
              id="estorno-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={TETO_MOTIVO_ESTORNO}
              placeholder="por que este lançamento está sendo estornado"
              disabled={enviando}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={fecharEstorno} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={enviando}>
              {enviando ? 'Estornando…' : 'Estornar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
