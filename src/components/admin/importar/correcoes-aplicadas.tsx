'use client'

import { Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CorrecaoImport } from '@/lib/import'
import { descreverCorrecao } from '@/components/admin/importar/rotulos'

// Painel "Correções aplicadas" (OS-F7B / W3 · §7) — o UNDO do ciclo de correção.
// Cada op traz quantas linhas ela afetou nesta análise (`porOp[i]`, do motor) e
// um Desfazer que a remove da lista e dispara a reanálise.
//
// "sem efeito" (0 linhas) é normal e não é erro: a op ficou órfã porque outra
// correção mudou a célula antes, a linha já saiu do import ou o valor não casa
// mais (OS-F7B §8.2). Quem corrige desfaz quando quiser.

export function CorrecoesAplicadas({
  correcoes,
  porOp,
  pendente,
  onDesfazer,
  patrimonioDoHostname = 0,
}: {
  correcoes: CorrecaoImport[]
  porOp: number[]
  pendente: boolean
  onDesfazer: (indice: number) => void
  /** F7F — nº de patrimônios que o MOTOR preencheu sozinho pelo hostname
   *  (auto, não é correção do operador). Vira uma linha de auditoria no rodapé. */
  patrimonioDoHostname?: number
}) {
  if (correcoes.length === 0) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">
        Correções aplicadas ({correcoes.length.toLocaleString('pt-BR')})
      </h3>
      <ul className="divide-y rounded-lg border">
        {correcoes.map((op, i) => {
          const linhas = porOp[i] ?? 0
          return (
            <li
              key={`${i}-${op.op}`}
              className="flex flex-wrap items-center justify-between gap-2 p-2.5"
            >
              <span className="text-sm">{descreverCorrecao(op)}</span>
              <div className="ml-auto flex items-center gap-2">
                {linhas === 0 ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    sem efeito
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {linhas} {linhas === 1 ? 'linha' : 'linhas'}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  disabled={pendente}
                  onClick={() => onDesfazer(i)}
                >
                  <Undo2 className="size-3.5" />
                  Desfazer
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      {patrimonioDoHostname > 0 && (
        <p className="text-xs text-warning">
          + {patrimonioDoHostname.toLocaleString('pt-BR')}{' '}
          {patrimonioDoHostname === 1 ? 'patrimônio veio' : 'patrimônios vieram'} do hostname
          (preenchimento automático do motor, não conta como correção).
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        O arquivo enviado não é alterado: as correções são aplicadas em memória e o
        CSV é revalidado do zero a cada mudança. Elas ficam registradas no log deste
        import.
      </p>
    </div>
  )
}
