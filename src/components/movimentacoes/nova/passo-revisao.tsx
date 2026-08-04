'use client'

import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  buscarPossiveisDuplicatasDoDia,
  type PossivelDuplicataDia,
} from '@/lib/actions/movimentacoes'
import {
  configDaContrapartida,
  contrapartidaAtiva,
  tipoContrapartida,
  type ContrapartidaTroca,
} from '@/components/movimentacoes/nova/troca-upgrade'
import { formatDate, hojeISO } from '@/lib/format'
import { rotuloPatrimonio, rotuloTipo, type TipoMovimentacao } from '@/lib/dominio'
import type { Config } from '@/components/movimentacoes/nova/config'
import type { AtivoResumo } from '@/lib/queries/ativos'
import type { Filial } from '@/lib/queries/filiais'
import type { Motivo } from '@/lib/queries/motivos'

// Uma metade do envio na revisão: a mesma movimentação aplicada a cada ativo.
// Sem o par (o caso comum) só existe UM bloco, e ele não ganha cabeçalho — o
// passo 3 continua idêntico ao que sempre foi.
function BlocoRevisao({
  titulo,
  itens,
  config,
  filiais,
  motivos,
}: {
  titulo: string | null
  itens: AtivoResumo[]
  config: Config
  filiais: Filial[]
  motivos: Motivo[]
}) {
  if (itens.length === 0) return null
  return (
    <div className="space-y-2">
      {titulo && (
        <p className="text-sm font-medium">
          {titulo} —{' '}
          <span className="tabular-nums">
            {itens.length} {itens.length === 1 ? 'ativo' : 'ativos'}
          </span>
        </p>
      )}
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
                  {rotuloPatrimonio(a.patrimonio)}
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
    </div>
  )
}

// Passo 3 — revisao do lote (mesma movimentacao aplicada a cada ativo) e envio.
// F26 — quando o par troca/upgrade esta ativo, a revisao mostra DOIS blocos
// claramente separados (a metade principal primeiro, na mesma ordem em que os
// itens vao para a Server Action).
export function PassoRevisao({
  itens,
  config,
  contrapartida,
  filiais,
  motivos,
  enviando,
  onVoltar,
  onRegistrar,
}: {
  itens: AtivoResumo[]
  config: Config
  contrapartida: ContrapartidaTroca | null
  filiais: Filial[]
  motivos: Motivo[]
  enviando: boolean
  onVoltar: () => void
  onRegistrar: () => void
}) {
  // F10/M5 — regra 7 da spec §8 ("alerta de possível duplicata: mesmo ativo +
  // mesmo tipo + mesmo dia"). AVISO âmbar, não trava (decisão §2 da OS-F10): o
  // registro segue permitido e o servidor não ganhou gate novo. Falha de
  // consulta degrada para "nenhuma duplicata" — o proxy do W1 já trata.
  const [duplicatas, setDuplicatas] = useState<PossivelDuplicataDia[]>([])

  const tipo = config.tipo
  const data = config.data
  const comPar = contrapartidaAtiva(config, contrapartida)
  const tipoOposto = tipoContrapartida(tipo)
  const itensOpostos = comPar && contrapartida ? contrapartida.itens : []
  const total = itens.length + itensOpostos.length
  // A consulta sempre usou `config.data` — só o TEXTO dizia "hoje". Desde os
  // chips Hoje/Ontem da F9, lançar com a data de ontem é rotina, e o aviso
  // afirmava um dia que não era o da movimentação. Derivado da própria data
  // (`formatDate` trata data pura sem risco de fuso).
  const quando = data === hojeISO() ? 'hoje' : `em ${formatDate(data)}`
  // Chave estável: o efeito só refaz a consulta quando o lote/tipo/data mudam
  // de verdade (o array `itens` é recriado a cada render do pai). F26 — a chave
  // carrega as DUAS metades, cada ativo com o tipo da SUA metade, senão o aviso
  // de duplicata ignoraria metade do envio.
  const chaveLote = [
    ...itens.map((a) => `${a.id}:${tipo}`),
    ...itensOpostos.map((a) => `${a.id}:${tipoOposto ?? ''}`),
  ].join(',')

  useEffect(() => {
    if (!tipo || !data || chaveLote === '') return
    let vivo = true
    // Estado alterado SO dentro do callback assincrono (react-hooks/set-state-in-effect).
    void (async () => {
      try {
        const pares = chaveLote.split(',').map((par) => {
          const corte = par.lastIndexOf(':')
          return {
            ativoId: par.slice(0, corte),
            tipo: par.slice(corte + 1) as TipoMovimentacao,
            data,
          }
        })
        const res = await buscarPossiveisDuplicatasDoDia(pares)
        if (vivo) setDuplicatas(res)
      } catch {
        // F19 — o proxy só degrada o erro de NEGÓCIO; um throw de transporte
        // (rede caída, sessão morta) escapava como unhandled rejection. Sem
        // toast: o aviso é auxiliar e nunca travou o registro — fica em
        // "nenhuma duplicata", que já é o comportamento previsto na falha.
      }
    })()
    return () => {
      vivo = false
    }
  }, [chaveLote, tipo, data])

  return (
    <div className="space-y-4">
      {duplicatas.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="flex items-center gap-1.5 font-medium">
            <TriangleAlert className="size-4" />
            Possível duplicata
          </p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {duplicatas.map((d) => (
              <li key={`${d.ativoId}-${d.tipo}`}>
                <span className="font-medium tabular-nums">
                  {rotuloPatrimonio(d.patrimonio)}
                </span>{' '}
                já teve &quot;{rotuloTipo(d.tipo)}&quot; {quando} — confira antes
                de registrar.
              </li>
            ))}
          </ul>
        </div>
      )}

      <BlocoRevisao
        titulo={comPar && tipo ? rotuloTipo(tipo) : null}
        itens={itens}
        config={config}
        filiais={filiais}
        motivos={motivos}
      />

      {comPar && contrapartida && tipoOposto && (
        <BlocoRevisao
          titulo={`${rotuloTipo(tipoOposto)} da troca`}
          itens={contrapartida.itens}
          config={configDaContrapartida(config, contrapartida)}
          filiais={filiais}
          motivos={motivos}
        />
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onVoltar}>
          Voltar
        </Button>
        <Button onClick={onRegistrar} disabled={enviando}>
          {enviando
            ? 'Registrando…'
            : `Registrar ${total} ${total === 1 ? 'movimentação' : 'movimentações'}`}
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
