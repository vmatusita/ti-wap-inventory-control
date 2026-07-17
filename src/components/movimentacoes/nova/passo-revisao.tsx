'use client'

import { Button } from '@/components/ui/button'
import { rotuloTipo } from '@/lib/dominio'
import type { Config } from '@/components/movimentacoes/nova/config'
import type { AtivoResumo } from '@/lib/queries/ativos'
import type { Filial } from '@/lib/queries/filiais'
import type { Motivo } from '@/lib/queries/motivos'

// Passo 3 — revisao do lote (mesma movimentacao aplicada a cada ativo) e envio.
export function PassoRevisao({
  itens,
  config,
  filiais,
  motivos,
  enviando,
  onVoltar,
  onRegistrar,
}: {
  itens: AtivoResumo[]
  config: Config
  filiais: Filial[]
  motivos: Motivo[]
  enviando: boolean
  onVoltar: () => void
  onRegistrar: () => void
}) {
  return (
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
                  {a.patrimonio ?? 'sem patrimônio'}
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
        <Button variant="ghost" onClick={onVoltar}>
          Voltar
        </Button>
        <Button onClick={onRegistrar} disabled={enviando}>
          {enviando
            ? 'Registrando…'
            : `Registrar ${itens.length} ${itens.length === 1 ? 'movimentação' : 'movimentações'}`}
        </Button>
      </div>
    </div>
  )
}

// Texto resumido do destino/motivo para a tabela de revisao.
function resumoDestino(c: Config, filiais: Filial[], motivos: Motivo[]): string {
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
