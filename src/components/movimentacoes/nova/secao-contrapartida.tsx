'use client'

import { ArrowLeftRight, Info, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/ativos/status-badge'
import { AtivoCombobox } from '@/components/movimentacoes/ativo-combobox'
import { ChecklistFaltantes } from '@/components/movimentacoes/nova/checklist-faltantes'
import { ChipsData } from '@/components/movimentacoes/nova/chips-data'
import { CampoComSugestoes } from '@/components/movimentacoes/nova/campo-sugerido'
import {
  tipoContrapartida,
  type ContrapartidaTroca,
} from '@/components/movimentacoes/nova/troca-upgrade'
import { campoAplica, MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import {
  TERMO_STATUS_ORDEM,
  rotuloCategoria,
  rotuloTermo,
  rotuloTipo,
  type TermoStatus,
} from '@/lib/dominio'
import { hojeISO } from '@/lib/format'
import type { Config } from '@/components/movimentacoes/nova/config'
import type { AtivoResumo } from '@/lib/queries/ativos'

// F26 — a seção do PAR troca/upgrade dentro do passo 2. Ela existe nos DOIS
// sentidos e é a MESMA seção: o que muda é o tipo alvo (e, com ele, quais campos
// aparecem — derivados de `CAMPOS_POR_TIPO`, como todo o resto do wizard).
//
//   devolução (principal) → "Saída da troca"     : colaborador/setor + termo
//   saída (principal)     → "Devolução da troca" : checklist de itens faltantes
//
// A seção NÃO tem select de motivo: o motivo é `troca_upgrade` fixo nas duas
// metades (mostrado como informação). `Data`, `Chamado` e `Observação` também não
// aparecem aqui — são compartilhados do lote inteiro, um preenchimento só.
export function SecaoContrapartida({
  config,
  contrapartida,
  itensPrincipal,
  rotuloMotivo,
  comandoRef,
  onAdicionar,
  onRemover,
  onSet,
}: {
  config: Config
  contrapartida: ContrapartidaTroca
  itensPrincipal: AtivoResumo[]
  // Rótulo do motivo vindo do catálogo (`admin/motivos` pode renomeá-lo) — a
  // DETECÇÃO é sempre pelo código; só o texto da tela vem daqui.
  rotuloMotivo: string
  comandoRef: React.RefObject<HTMLDivElement | null>
  onAdicionar: (ativo: AtivoResumo) => void
  onRemover: (id: string) => void
  onSet: <K extends keyof ContrapartidaTroca>(
    chave: K,
    valor: ContrapartidaTroca[K],
  ) => void
}) {
  const alvo = tipoContrapartida(config.tipo)
  if (!alvo) return null

  const titulo = alvo === 'saida' ? 'Saída da troca' : 'Devolução da troca'
  const explicacao =
    alvo === 'saida'
      ? 'Registre junto a entrega do equipamento que entra no lugar — sai no mesmo "Registrar", sem repetir o fluxo.'
      : 'Registre junto a devolução do equipamento antigo — sai no mesmo "Registrar", sem repetir o fluxo.'

  const jaAdicionados = new Set([
    ...itensPrincipal.map((a) => a.id),
    ...contrapartida.itens.map((a) => a.id),
  ])
  const restante =
    MAX_LOTE_MOVIMENTACAO - itensPrincipal.length - contrapartida.itens.length
  const cheio = restante <= 0

  return (
    <section
      aria-labelledby="contrapartida-titulo"
      className="rounded-lg border border-primary/40 bg-muted/30 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id="contrapartida-titulo"
            className="flex items-center gap-2 font-medium"
          >
            <ArrowLeftRight className="size-4 shrink-0" aria-hidden />
            {titulo}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{explicacao}</p>
        </div>
        {/* "Deixar para depois": o padrão é a contrapartida ABERTA. Ligado, a
            seção recolhe e o registrar grava só a metade principal — e o painel
            de sucesso oferece o atalho para registrar a outra em seguida. */}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={contrapartida.deixarParaDepois}
            onCheckedChange={(c) => onSet('deixarParaDepois', c === true)}
            aria-describedby="contrapartida-titulo"
          />
          Deixar a contrapartida para depois
        </label>
      </div>

      {contrapartida.deixarParaDepois ? (
        <p className="mt-3 flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Só a {rotuloTipo(config.tipo || 'devolucao').toLowerCase()} vai ser
          registrada agora.{' '}
          {contrapartida.jaRegistrada
            ? // Esta tela JÁ É a metade que faltava: prometer o atalho aqui
              // seria apontar para a metade que o operador acabou de registrar.
              `A ${rotuloTipo(alvo).toLowerCase()} desta troca já foi registrada — foi ela que abriu esta tela.`
            : `Depois de registrar, a tela de sucesso oferece o atalho para lançar a ${rotuloTipo(alvo).toLowerCase()} da troca já com os campos preenchidos.`}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" aria-hidden />
            Motivo desta metade:{' '}
            <span className="font-medium text-foreground">{rotuloMotivo}</span> —
            o mesmo da principal. Data, chamado e observação também são os
            mesmos.
            {alvo === 'devolucao' && (
              <span>
                {' '}
                A busca abaixo acha o equipamento pelo <b>nome do colaborador</b>
                .
              </span>
            )}
          </p>

          <div ref={comandoRef}>
            <AtivoCombobox
              onSelecionar={onAdicionar}
              jaAdicionados={jaAdicionados}
              autoFocus={false}
              mostrarRecentes={!cheio}
            />
          </div>

          {cheio && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              As duas metades já somam {MAX_LOTE_MOVIMENTACAO} ativos, o teto do
              lote. Remova algum para trocar, ou registre este e comece outro.
            </p>
          )}

          {contrapartida.itens.length === 0 ? (
            <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
              Nenhum equipamento escolhido para a{' '}
              {rotuloTipo(alvo).toLowerCase()} da troca.
            </p>
          ) : (
            <ul className="space-y-2">
              {contrapartida.itens.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2.5"
                >
                  <span className="font-medium tabular-nums">
                    {a.patrimonio ?? 'sem patrimônio'}
                  </span>
                  {a.patrimonio_duplicado && (
                    <span className="rounded bg-amber-100 px-1.5 text-xs tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      ST {a.service_tag ?? '—'}
                    </span>
                  )}
                  <span className="truncate text-sm text-muted-foreground">
                    {[rotuloCategoria(a.categoria), a.modelo]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {a.filial_nome}
                    </span>
                    <StatusBadge status={a.status} className="text-[11px]" />
                    <button
                      type="button"
                      onClick={() => onRemover(a.id)}
                      aria-label={`Remover ${a.patrimonio ?? 'ativo sem patrimônio'} da ${titulo.toLowerCase()}`}
                      className="-my-1 -mr-1 rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Campos da metade oposta — quais aparecem sai de CAMPOS_POR_TIPO,
              igual ao passo 2 principal. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {campoAplica(alvo, 'colaborador') && (
              <>
                <CampoComSugestoes
                  id="contrapartida-colaborador"
                  rotulo="Colaborador"
                  campo="colaborador"
                  valor={contrapartida.colaborador}
                  onChange={(v) => onSet('colaborador', v)}
                  placeholder="Quem recebe o equipamento"
                />
                <CampoComSugestoes
                  id="contrapartida-setor"
                  rotulo="Setor"
                  campo="setor"
                  valor={contrapartida.setor}
                  onChange={(v) => onSet('setor', v)}
                  placeholder="Setor de destino"
                />
              </>
            )}

            {campoAplica(alvo, 'termo') && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="contrapartida-termo">
                    Termo de responsabilidade
                  </Label>
                  <Select
                    value={contrapartida.termo || undefined}
                    onValueChange={(v) => onSet('termo', v as TermoStatus)}
                  >
                    <SelectTrigger id="contrapartida-termo">
                      <SelectValue placeholder="Não informado" />
                    </SelectTrigger>
                    <SelectContent>
                      {TERMO_STATUS_ORDEM.map((t) => (
                        <SelectItem key={t} value={t}>
                          {rotuloTermo(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="contrapartida-termo-data">
                    Data do termo
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="contrapartida-termo-data"
                      type="date"
                      max={hojeISO()}
                      value={contrapartida.termoData}
                      onChange={(e) => onSet('termoData', e.target.value)}
                    />
                    <ChipsData
                      campo="a data do termo da troca"
                      onEscolher={(iso) => onSet('termoData', iso)}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {campoAplica(alvo, 'itens_faltantes') && (
            <ChecklistFaltantes
              valor={contrapartida.itensFaltantes}
              onChange={(itens) => onSet('itensFaltantes', itens)}
              rotulo="Itens faltantes na devolução da troca"
            />
          )}
        </div>
      )}
    </section>
  )
}
