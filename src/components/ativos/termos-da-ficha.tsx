'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Download, FileText, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GerarTermoDialog } from '@/components/movimentacoes/gerar-termo-dialog'
import {
  ConfirmarAssinaturaDialog,
  DesfazerAssinaturaDialog,
} from '@/components/ativos/confirmar-assinatura-dialog'
import { urlTermo } from '@/lib/actions/termos'
import {
  TERMO_ROTULO,
  categoriaTemTermo,
  familiaDoTipo,
  type TermoTipo,
} from '@/lib/termos/tipos'
import { formatDate, formatDateTime } from '@/lib/format'
import {
  rotuloCategoria,
  rotuloTermo,
  type CategoriaAtivo,
  type TermoStatus,
} from '@/lib/dominio'
import type { TermoGerado } from '@/lib/queries/termos'

// Seção "Termos" da ficha (F5A §5): histórico dos termos gerados (download +
// editar) e geração retroativa a partir das movimentações elegíveis do ativo.
export function TermosDaFicha({
  ativoId,
  patrimonio,
  categoria,
  termoAssinado,
  termoData,
  termos,
  respMovId,
  devolMovId,
  devolTipo,
}: {
  ativoId: string
  // null = ativo sem patrimônio físico (F7E) — o rótulo do termo mostra "sem patrimônio".
  patrimonio: string | null
  categoria: CategoriaAtivo
  termoAssinado: TermoStatus | null
  termoData: string | null
  termos: TermoGerado[]
  respMovId: string | null
  devolMovId: string | null
  devolTipo: TermoTipo | null
}) {
  const router = useRouter()
  const [baixando, setBaixando] = useState<string | null>(null)
  const refresh = () => router.refresh()
  // Rótulo do termo quando o ativo não tem plaqueta (F7E).
  const rotuloPatrimonio = patrimonio ?? 'sem patrimônio'

  // Já existe termo cobrindo ESTA movimentação? Se sim, esconde o botão de GERAR
  // (a regeração é pelo "Editar" da lista, que reabre o termo real — inclusive o
  // lote consolidado da devolução, evitando um segundo termo parcial). A checagem é
  // por movimentação (não por família) para ainda permitir gerar o termo de uma
  // NOVA saída/devolução do mesmo ativo, que é outra movimentação.
  const temTermoResp = !!respMovId && termos.some((t) => t.movimentacao_ids.includes(respMovId))
  const temTermoDevol = !!devolMovId && termos.some((t) => t.movimentacao_ids.includes(devolMovId))

  async function baixar(id: string) {
    setBaixando(id)
    try {
      const res = await urlTermo({ id })
      if (!res.ok || !res.url) {
        toast.error(res.erro ?? 'Falha ao baixar o termo.')
        return
      }
      const r = await fetch(res.url)
      const b = await r.blob()
      const u = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = u
      a.download = res.nomeArquivo ?? 'termo.docx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(u)
    } catch {
      toast.error('Falha ao baixar o termo.')
    } finally {
      setBaixando(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Termos</CardTitle>
        <div className="flex flex-wrap gap-2">
          {respMovId && categoriaTemTermo(categoria) && !temTermoResp && (
            <GerarTermoDialog
              familia="responsabilidade"
              categoria={categoria}
              movimentacaoIds={[respMovId]}
              rotulo={`${rotuloPatrimonio} · ${rotuloCategoria(categoria)}`}
              onGerado={refresh}
              trigger={
                <Button variant="outline" size="sm" className="gap-2">
                  <FileText className="size-4" />
                  Responsabilidade
                </Button>
              }
            />
          )}
          {devolMovId && devolTipo && !temTermoDevol && (
            <GerarTermoDialog
              familia="devolucao"
              tipoDevolucao={devolTipo}
              movimentacaoIds={[devolMovId]}
              rotulo={rotuloPatrimonio}
              onGerado={refresh}
              trigger={
                <Button variant="outline" size="sm" className="gap-2">
                  <FileText className="size-4" />
                  Devolução
                </Button>
              }
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Assinatura do termo de responsabilidade (B6): confirmar / desfazer.
            Só 'sim' encerra a pendência. */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
          {termoAssinado === 'sim' ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
                <span className="font-medium">Termo assinado</span>
                {termoData && (
                  <span className="text-muted-foreground tabular-nums">
                    em {formatDate(termoData)}
                  </span>
                )}
              </div>
              <DesfazerAssinaturaDialog ativoId={ativoId} />
            </>
          ) : (
            <>
              <div className="text-sm">
                <span className="text-muted-foreground">Assinatura do termo: </span>
                <span className="font-medium">{rotuloTermo(termoAssinado)}</span>
              </div>
              <ConfirmarAssinaturaDialog ativoId={ativoId} />
            </>
          )}
        </div>

        {termos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum termo gerado para este ativo ainda.
          </p>
        ) : (
          <ul className="divide-y">
            {termos.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{TERMO_ROTULO[t.tipo]}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.colaborador ? `${t.colaborador} · ` : ''}
                    {t.gerado_por_nome ?? '—'} · {formatDateTime(t.atualizado_em)}
                  </p>
                </div>
                <div className="flex gap-1">
                  <GerarTermoDialog
                    familia={familiaDoTipo(t.tipo)}
                    categoria={categoria}
                    tipoInicial={t.tipo}
                    movimentacaoIds={t.movimentacao_ids}
                    rotulo={rotuloPatrimonio}
                    onGerado={refresh}
                    trigger={
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5">
                        <Pencil className="size-3.5" />
                        Editar
                      </Button>
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => baixar(t.id)}
                    disabled={baixando === t.id}
                  >
                    <Download className="size-3.5" />
                    {baixando === t.id ? '…' : 'Baixar'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
