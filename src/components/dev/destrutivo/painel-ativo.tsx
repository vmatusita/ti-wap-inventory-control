'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DialogoDestrutivo } from '@/components/dev/destrutivo/dialogo-destrutivo'
import {
  apagarAtivo,
  apagarMovimentacao,
  buscarAtivosParaDestruir,
  carregarFicha,
  forcarEstado,
} from '@/lib/actions/dev-destrutivo'
import { STATUS_META, STATUS_ORDEM, type StatusAtivo } from '@/lib/dominio'
import { formatDate } from '@/lib/format'
import type { CandidatoAtivo, FichaDestrutiva } from '@/lib/queries/dev-destrutivo'

// Painel do ATIVO na Zona destrutiva (F23): achar → ver o tamanho real do rastro → agir.
//
// ⚠ A BUSCA DEVOLVE LISTA E A TELA MOSTRA TODOS OS RESULTADOS, sempre. É regra da casa
// (spec §5, CLAUDE.md): "patrimônio repete em casos raros — o par patrimônio + service tag é
// a chave". Numa ferramenta que apaga, escolher sozinho o primeiro resultado de um patrimônio
// repetido seria apagar o ativo errado, e ninguém saberia.
export function PainelAtivo() {
  const [termo, setTermo] = useState('')
  const [candidatos, setCandidatos] = useState<CandidatoAtivo[] | null>(null)
  const [ficha, setFicha] = useState<FichaDestrutiva | null>(null)
  const [buscando, startBusca] = useTransition()
  const [carregando, startFicha] = useTransition()

  const [dialogo, setDialogo] = useState<
    | { tipo: 'apagar-ativo' }
    | { tipo: 'apagar-mov'; movId: string; rotuloMov: string }
    | { tipo: 'forcar'; status: StatusAtivo }
    | null
  >(null)
  const [statusAlvo, setStatusAlvo] = useState<StatusAtivo | ''>('')

  function buscar() {
    const t = termo.trim()
    if (t.length < 2) {
      toast.error('Digite ao menos 2 caracteres do patrimônio, da service tag ou do hostname.')
      return
    }
    startBusca(async () => {
      const res = await buscarAtivosParaDestruir({ termo: t })
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      setCandidatos(res.dados ?? [])
      setFicha(null)
      if ((res.dados ?? []).length === 0) toast.info('Nenhum ativo encontrado com esse termo.')
    })
  }

  function abrir(ativoId: string) {
    startFicha(async () => {
      const res = await carregarFicha({ ativoId })
      if (!res.ok) {
        toast.error(res.erro)
        return
      }
      if (!res.dados) {
        toast.error('Esse ativo não existe mais. Busque de novo.')
        return
      }
      setFicha(res.dados)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 space-y-2">
          <Label htmlFor="destrutivo-busca">Patrimônio, service tag ou hostname</Label>
          <Input
            id="destrutivo-busca"
            value={termo}
            autoComplete="off"
            placeholder="WAP0004491"
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                buscar()
              }
            }}
          />
        </div>
        <Button type="button" variant="secondary" onClick={buscar} disabled={buscando}>
          {buscando ? 'Buscando…' : 'Buscar'}
        </Button>
      </div>

      {candidatos !== null && candidatos.length > 0 && !ficha && (
        <div className="space-y-2">
          {candidatos.length > 1 && (
            <p className="text-sm text-muted-foreground">
              <strong>{candidatos.length} ativos</strong> batem com esse termo. Confira a
              service tag e a filial antes de escolher — patrimônio repetido existe, e o par
              patrimônio + service tag é o que identifica de verdade.
            </p>
          )}
          <ul className="divide-y rounded-md border">
            {candidatos.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="font-mono">{c.rotulo}</span>
                <span className="text-muted-foreground">
                  {[c.marca, c.modelo].filter(Boolean).join(' ') || c.categoria}
                </span>
                <span className="text-muted-foreground">
                  tag: {c.service_tag ?? '—'} · filial {c.filial_id}
                </span>
                <Badge variant="outline">{STATUS_META[c.status]?.rotulo ?? c.status}</Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => abrir(c.id)}
                  disabled={carregando}
                >
                  Abrir
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ficha && (
        <div className="space-y-4 rounded-md border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base">{ficha.ativo.rotulo}</span>
            <Badge variant="outline">
              {STATUS_META[ficha.ativo.status]?.rotulo ?? ficha.ativo.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {[ficha.ativo.marca, ficha.ativo.modelo].filter(Boolean).join(' ')}
              {ficha.ativo.colaborador_atual ? ` · com ${ficha.ativo.colaborador_atual}` : ''}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => setFicha(null)}
            >
              Trocar de ativo
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Rastro: <strong>{ficha.totais.movimentacoes}</strong> movimentação(ões) ·{' '}
            <strong>{ficha.totais.termos}</strong> termo(s) ·{' '}
            <strong>{ficha.totais.anotacoes}</strong> anotação(ões) ·{' '}
            <strong>{ficha.totais.pendenciasItem}</strong> pendência(s) de item.
          </p>

          {ficha.termoDeLoteBloqueia && (
            <p className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-sm">
              Este ativo aparece num <strong>termo que também cobre outros ativos</strong>.
              Apagá-lo destruiria um documento que não é só dele, então a operação será
              recusada — resolva o termo antes.
            </p>
          )}

          {/* ---- FORÇAR ESTADO ---- */}
          <div className="flex flex-wrap items-end gap-2 border-t pt-4">
            <div className="min-w-52 space-y-2">
              <Label htmlFor="destrutivo-status">Forçar o estado para</Label>
              <Select
                value={statusAlvo}
                onValueChange={(v) => setStatusAlvo(v as StatusAtivo)}
              >
                <SelectTrigger id="destrutivo-status">
                  <SelectValue placeholder="Escolha o estado" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDEM.filter((s) => s !== ficha.ativo.status).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_META[s]?.rotulo ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={statusAlvo === ''}
              onClick={() => statusAlvo !== '' && setDialogo({ tipo: 'forcar', status: statusAlvo })}
            >
              Forçar estado
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              Registra uma movimentação de <strong>ajuste marcada como forçada</strong>, com a
              justificativa: o estado continua derivando da linha do tempo e o histórico explica
              o porquê. Ela não entra em Entradas/Saídas nem nos relatórios de movimentação.
            </p>
          </div>

          {/* ---- LINHA DO TEMPO / APAGAR MOVIMENTAÇÃO ---- */}
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Linha do tempo</p>
            <p className="text-xs text-muted-foreground">
              Só a <strong>última</strong> movimentação pode ser apagada — apagar uma do meio
              faria as seguintes descreverem um passado que deixou de existir. Para desmontar
              várias, vá da mais nova para a mais antiga.
            </p>
            <ul className="divide-y rounded-md border">
              {ficha.movimentacoes.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                  <span className="font-medium">{m.tipo}</span>
                  <span className="text-muted-foreground">{formatDate(m.data)}</span>
                  {m.forcado && <Badge variant="destructive">forçada</Badge>}
                  {m.estornada && <Badge variant="outline">estornada</Badge>}
                  {m.temTermo && <Badge variant="outline">tem termo</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {m.status_anterior ?? '—'} → {m.status_resultante ?? '—'}
                  </span>
                  {m.ultima ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-destructive"
                      disabled={ficha.totais.movimentacoes <= 1 || m.temTermo}
                      title={
                        ficha.totais.movimentacoes <= 1
                          ? 'É a única movimentação do ativo — use "Apagar ativo"'
                          : m.temTermo
                            ? 'Existe um termo gerado a partir dela — apague o termo antes'
                            : undefined
                      }
                      onClick={() =>
                        setDialogo({
                          tipo: 'apagar-mov',
                          movId: m.id,
                          rotuloMov: `${m.tipo} de ${formatDate(m.data)}`,
                        })
                      }
                    >
                      Apagar esta
                    </Button>
                  ) : (
                    <span className="ml-auto text-xs text-muted-foreground">—</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t pt-4">
            <Button
              type="button"
              variant="destructive"
              onClick={() => setDialogo({ tipo: 'apagar-ativo' })}
            >
              Apagar este ativo e todo o rastro
            </Button>
          </div>
        </div>
      )}

      {/* ---------------- diálogos ---------------- */}
      {ficha && dialogo?.tipo === 'apagar-ativo' && (
        <DialogoDestrutivo
          open
          onOpenChange={(o) => !o && setDialogo(null)}
          titulo={`Apagar o ativo ${ficha.ativo.rotulo}?`}
          esperado={ficha.ativo.rotulo}
          rotuloBotao="Apagar ativo"
          mensagemSucesso="Ativo apagado."
          onConfirmar={async (confirmacao, justificativa) =>
            apagarAtivo({ ativoId: ficha.ativo.id, confirmacao, justificativa })
          }
        >
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Somem junto: <strong>{ficha.totais.movimentacoes}</strong> movimentação(ões),{' '}
              <strong>{ficha.totais.termos}</strong> termo(s) — inclusive o arquivo .docx —,{' '}
              <strong>{ficha.totais.anotacoes}</strong> anotação(ões) e{' '}
              <strong>{ficha.totais.pendenciasItem}</strong> pendência(s) de item.
            </li>
            <li>
              O par <strong>patrimônio + service tag</strong> volta a ficar livre para outro
              ativo.
            </li>
            <li>
              Os <strong>relatórios já gerados não mudam</strong>: são fotos congeladas, e este
              patrimônio pode continuar aparecendo neles. História não se reescreve.
            </li>
            <li>
              Uma <strong>cópia de tudo</strong> fica guardada na trilha de auditoria.
            </li>
          </ul>
        </DialogoDestrutivo>
      )}

      {ficha && dialogo?.tipo === 'apagar-mov' && (
        <DialogoDestrutivo
          open
          onOpenChange={(o) => !o && setDialogo(null)}
          titulo="Apagar esta movimentação?"
          descricao={
            <>
              O ativo volta ao estado em que estava <strong>antes</strong> dela — o mesmo que um
              estorno faria, só que sem deixar o par na linha do tempo.
            </>
          }
          esperado={ficha.ativo.rotulo}
          rotuloBotao="Apagar movimentação"
          mensagemSucesso="Movimentação apagada."
          onConfirmar={async (confirmacao, justificativa) =>
            apagarMovimentacao({ movimentacaoId: dialogo.movId, confirmacao, justificativa })
          }
        >
          <p className="text-sm text-muted-foreground">
            {dialogo.rotuloMov} — do ativo{' '}
            <span className="font-mono">{ficha.ativo.rotulo}</span>. Se ela tiver criado
            pendências de item, elas somem junto.
          </p>
        </DialogoDestrutivo>
      )}

      {ficha && dialogo?.tipo === 'forcar' && (
        <DialogoDestrutivo
          open
          onOpenChange={(o) => !o && setDialogo(null)}
          titulo={`Forçar ${ficha.ativo.rotulo} para ${STATUS_META[dialogo.status]?.rotulo ?? dialogo.status}?`}
          descricao={
            <>
              Ignora as transições válidas da máquina de estados. O registro{' '}
              <strong>fica visível na ficha</strong>, marcado como forçado.
            </>
          }
          esperado={ficha.ativo.rotulo}
          rotuloBotao="Forçar estado"
          mensagemSucesso="Estado forçado."
          onConfirmar={async (_confirmacao, justificativa) =>
            forcarEstado({ ativoId: ficha.ativo.id, status: dialogo.status, justificativa })
          }
        >
          <p className="text-sm text-muted-foreground">
            De <strong>{STATUS_META[ficha.ativo.status]?.rotulo ?? ficha.ativo.status}</strong>{' '}
            para <strong>{STATUS_META[dialogo.status]?.rotulo ?? dialogo.status}</strong>. Se o
            estado alvo for um em que ninguém está com o equipamento, o colaborador e o setor
            são limpos junto — como a máquina faz no caminho normal.
          </p>
        </DialogoDestrutivo>
      )}
    </div>
  )
}
