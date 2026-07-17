'use client'

import Link from 'next/link'
import { Check, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GerarTermoDialog } from '@/components/movimentacoes/gerar-termo-dialog'
import { categoriaTemTermo } from '@/lib/termos/tipos'
import { campoAplica } from '@/lib/validators/movimentacao'
import { rotuloCategoria } from '@/lib/dominio'
import type { SucessoLote } from '@/components/movimentacoes/nova/config'

// Painel pos-envio: fichas atualizadas + geracao de termo (responsabilidade por
// ativo elegivel; devolucao consolidada por lote). `onGerado` revalida a tela.
export function PainelSucesso({
  sucesso,
  onGerado,
  onReiniciar,
}: {
  sucesso: SucessoLote
  onGerado: () => void
  onReiniciar: () => void
}) {
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
              {a.patrimonio ?? 'sem patrimônio'}
            </Link>
          </Button>
        ))}
      </div>

      {/* Termo de responsabilidade — um por ativo elegível (saida/emprestimo) */}
      {campoAplica(sucesso.tipo, 'termo') && (
        <div className="mt-6 border-t pt-5">
          <p className="text-sm font-medium">Termo de responsabilidade</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Documento pronto para assinatura — o sistema já preenche o que sabe.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {sucesso.ativos.filter((a) => categoriaTemTermo(a.categoria)).map((a) => (
              <GerarTermoDialog
                key={a.id}
                familia="responsabilidade"
                categoria={a.categoria}
                movimentacaoIds={[a.movimentacaoId]}
                rotulo={`${a.patrimonio ?? 'sem patrimônio'} · ${rotuloCategoria(a.categoria)}`}
                onGerado={onGerado}
                trigger={
                  <Button variant="outline" size="sm" className="gap-2 tabular-nums">
                    <FileText className="size-4" />
                    {a.patrimonio ?? 'sem patrimônio'}
                  </Button>
                }
              />
            ))}
          </div>
          {sucesso.ativos.every((a) => !categoriaTemTermo(a.categoria)) && (
            <p className="mt-1 text-xs text-muted-foreground">
              As categorias deste lote não têm modelo de termo.
            </p>
          )}
        </div>
      )}

      {/* Termo de devolução — um por lote (consolida os equipamentos) */}
      {sucesso.tipo === 'devolucao' && sucesso.ativos.length > 0 && (
        <div className="mt-6 border-t pt-5">
          <p className="text-sm font-medium">Termo de devolução</p>
          <div className="mt-3 flex justify-center">
            <GerarTermoDialog
              familia="devolucao"
              tipoDevolucao={
                sucesso.motivo === 'desligamento'
                  ? 'devolucao_desligamento'
                  : 'devolucao_equipamento'
              }
              movimentacaoIds={sucesso.ativos.map((a) => a.movimentacaoId)}
              rotulo={`${sucesso.ativos.length} equipamento${sucesso.ativos.length > 1 ? 's' : ''}`}
              onGerado={onGerado}
              trigger={
                <Button variant="outline" size="sm" className="gap-2">
                  <FileText className="size-4" />
                  Gerar termo de devolução ({sucesso.ativos.length})
                </Button>
              }
            />
          </div>
        </div>
      )}

      <div className="mt-6">
        <Button onClick={onReiniciar}>Registrar outra movimentação</Button>
      </div>
    </div>
  )
}
