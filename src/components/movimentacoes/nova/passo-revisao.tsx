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
import { cn } from '@/lib/utils'
import {
  montarResumoConfig,
  type ItemResumo,
} from '@/components/movimentacoes/nova/resumo-revisao'
import type { Config } from '@/components/movimentacoes/nova/config'
import type { AtivoResumo } from '@/lib/queries/ativos'
import type { Filial } from '@/lib/queries/filiais'
import type { Motivo } from '@/lib/queries/motivos'

// MOV-02 — card com a configuração que a metade vai GRAVAR (antes, essa
// informação só aparecia diluída, repetida em cada linha da tabela — e a
// DATA nem aparecia). `destaque` (sempre a Data) ganha realce visual: é o
// campo que o chip Hoje/Ontem torna fácil de errar num lançamento retroativo.
function CardResumo({ resumo }: { resumo: ItemResumo[] }) {
  if (resumo.length === 0) return null
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
      {resumo.map((item) => (
        <div key={item.rotulo} className={cn(item.destaque && 'sm:col-span-2')}>
          <dt className="text-xs text-muted-foreground">{item.rotulo}</dt>
          <dd
            className={cn(
              'text-sm',
              item.destaque && 'text-base font-semibold text-foreground',
            )}
          >
            {item.valor}
          </dd>
        </div>
      ))}
    </dl>
  )
}

// Marca + modelo (e service tag, quando existe) — a identificação do ativo na
// tabela reduzida. A configuração (tipo/motivo/destino…) saiu daqui: agora
// mora só no CardResumo, uma vez por metade, em vez de repetida em N linhas.
function identificacaoAtivo(a: AtivoResumo): string {
  const partes = [a.marca, a.modelo].filter((v): v is string => Boolean(v))
  const base = partes.length > 0 ? partes.join(' ') : '—'
  return a.service_tag ? `${base} · ${a.service_tag}` : base
}

// Uma metade do envio na revisão: o card da configuração + a tabela (reduzida
// a Patrimônio/Identificação) dos ativos que a recebem. Sem o par (o caso
// comum) só existe UM bloco, e ele não ganha cabeçalho — o passo 3 continua
// idêntico ao que sempre foi.
function BlocoRevisao({
  titulo,
  itens,
  config,
  statusResultante,
  filiais,
  motivos,
}: {
  titulo: string | null
  itens: AtivoResumo[]
  config: Config
  statusResultante: string
  filiais: Filial[]
  motivos: Motivo[]
}) {
  if (itens.length === 0) return null
  const resumo = montarResumoConfig(config, { statusResultante, filiais, motivos })
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
      <CardResumo resumo={resumo} />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="p-2.5 font-medium">Patrimônio</th>
              <th className="p-2.5 font-medium">Identificação</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {itens.map((a) => (
              <tr key={a.id}>
                <td className="p-2.5 font-medium tabular-nums">
                  {rotuloPatrimonio(a.patrimonio)}
                </td>
                <td className="p-2.5 text-muted-foreground">
                  {identificacaoAtivo(a)}
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
  statusResultante,
  contrapartida,
  filiais,
  motivos,
  enviando,
  onVoltar,
  onRegistrar,
  onConsultandoDuplicatasChange,
}: {
  itens: AtivoResumo[]
  config: Config
  // MOV-02 — só o `ajuste` usa (card "Status novo"); vem de estado à parte do
  // form, igual a `PassoMovimentacao` já recebe (mesmo nome de prop).
  statusResultante: string
  contrapartida: ContrapartidaTroca | null
  filiais: Filial[]
  motivos: Motivo[]
  enviando: boolean
  onVoltar: () => void
  onRegistrar: () => void
  // MOV-08 — avisa o form (pai) enquanto a consulta de duplicatas abaixo está
  // em voo. O form usa isto SÓ para ignorar o Enter-de-registrar nessa
  // janela; o clique aqui neste componente (`onRegistrar`) nunca é gateado.
  onConsultandoDuplicatasChange: (consultando: boolean) => void
}) {
  // F10/M5 — regra 7 da spec §8 ("alerta de possível duplicata: mesmo ativo +
  // mesmo tipo + mesmo dia"). AVISO âmbar, não trava (decisão §2 da OS-F10): o
  // registro segue permitido e o servidor não ganhou gate novo. Falha de
  // consulta degrada para "nenhuma duplicata" — o proxy do W1 já trata.
  const [duplicatas, setDuplicatas] = useState<PossivelDuplicataDia[]>([])
  // MOV-08 — true enquanto a consulta abaixo está em voo. Liga o indicador
  // "Conferindo duplicatas…" (JSX) e é espelhado pro form via
  // `onConsultandoDuplicatasChange`.
  const [consultando, setConsultando] = useState(false)

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
    // MOV-08 — liga o indicador (e avisa o form) ANTES do await: é a janela
    // entre o mount do passo 3 e esta resposta que o Enter duplo furava
    // (2º Enter despachava `registrar()` antes do aviso aparecer).
    onConsultandoDuplicatasChange(true)
    // O `setConsultando(true)` mora DENTRO do callback (e não no corpo do
    // efeito) por causa do `react-hooks/set-state-in-effect`. O corpo de uma
    // função async roda de forma síncrona até o primeiro `await`, então o
    // indicador acende no mesmo tick — a janela protegida é a mesma.
    void (async () => {
      setConsultando(true)
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
      } finally {
        if (vivo) {
          setConsultando(false)
          onConsultandoDuplicatasChange(false)
        }
      }
    })()
    return () => {
      vivo = false
      // Efeito limpo (deps mudaram ou desmontou) com a consulta ainda em
      // voo: destrava o form imediatamente — sem isto, sair do passo 3 antes
      // da resposta chegar deixava o Enter-de-registrar ignorado pra sempre.
      setConsultando(false)
      onConsultandoDuplicatasChange(false)
    }
  }, [chaveLote, tipo, data, onConsultandoDuplicatasChange])

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
        statusResultante={statusResultante}
        filiais={filiais}
        motivos={motivos}
      />

      {comPar && contrapartida && tipoOposto && (
        <BlocoRevisao
          titulo={`${rotuloTipo(tipoOposto)} da troca`}
          itens={contrapartida.itens}
          config={configDaContrapartida(config, contrapartida)}
          // A contrapartida é sempre saída/devolução — nunca `ajuste` — então
          // `statusResultante` nunca se aplica a este bloco (montarResumoConfig
          // já filtra pelo campoAplica; '' aqui é só por completude/clareza).
          statusResultante=""
          filiais={filiais}
          motivos={motivos}
        />
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onVoltar}>
          Voltar
        </Button>
        <span className="flex items-center gap-3">
          {/* MOV-08 — indicador junto ao botão enquanto a consulta de
              duplicatas está em voo (o Enter-de-registrar é ignorado nessa
              janela lá no form; o clique aqui continua livre). */}
          {consultando && (
            <span role="status" className="text-xs text-muted-foreground">
              Conferindo duplicatas…
            </span>
          )}
          <Button onClick={onRegistrar} disabled={enviando}>
            {enviando
              ? 'Registrando…'
              : `Registrar ${total} ${total === 1 ? 'movimentação' : 'movimentações'}`}
          </Button>
        </span>
      </div>
    </div>
  )
}
