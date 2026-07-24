'use client'

import Link from 'next/link'
import { Check, ChevronDown, Layers, RotateCcw, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CampoComSugestoes } from '@/components/movimentacoes/nova/campo-sugerido'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  campoAplica,
  campoObrigatorio,
  observacaoObrigatoria,
} from '@/lib/validators/movimentacao'
import {
  faltaCategoriaDoKit,
  type ItemChecklistKit,
} from '@/lib/validators/kit'
import {
  ACESSORIOS_DEVOLUCAO,
  STATUS_ORDEM,
  TERMO_STATUS_ORDEM,
  rotuloAcessorio,
  rotuloCategoria,
  rotuloStatus,
  rotuloTermo,
  rotuloTipo,
  type CategoriaAtivo,
  type TermoStatus,
  type TipoMovimentacao,
} from '@/lib/dominio'
import { hojeISO, ontemISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import type {
  Config,
  SucessoLote,
} from '@/components/movimentacoes/nova/config'
import type { AtivoResumo } from '@/lib/queries/ativos'
import type { Filial } from '@/lib/queries/filiais'
import type { Kit } from '@/lib/queries/kits'
import type { Motivo } from '@/lib/queries/motivos'
import type { UltimaMovimentacaoUsuario } from '@/lib/queries/movimentacoes'

// Atalhos "Hoje/Ontem" ao lado dos campos de data (F9/M10) — a data quase sempre
// e uma dessas duas e digitar dd/mm/aaaa no celular e o gargalo. As datas saem de
// `hojeISO`/`ontemISO` (fuso America/Sao_Paulo), entao nunca estouram o
// `max={hojeISO()}` do input. `type="button"`: nao submete nem interfere no Enter
// que avanca o passo (o handler do form ignora BUTTON). O `after:` estica a area
// de toque para ~44px no mobile sem crescer o botao (alinhado a altura do input).
function ChipsData({
  campo,
  onEscolher,
}: {
  campo: string
  onEscolher: (iso: string) => void
}) {
  const opcoes = [
    { rotulo: 'Hoje', valor: hojeISO },
    { rotulo: 'Ontem', valor: ontemISO },
  ]
  return (
    <div className="flex shrink-0 gap-1">
      {opcoes.map((o) => (
        <Button
          key={o.rotulo}
          type="button"
          variant="outline"
          onClick={() => onEscolher(o.valor())}
          aria-label={`Preencher ${campo} com ${o.rotulo.toLowerCase()}`}
          className="relative px-3 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"
        >
          {o.rotulo}
        </Button>
      ))}
    </div>
  )
}

// F12/M12 — uma categoria do checklist do kit. O ✓/✗ é decorativo (`aria-hidden`):
// quem usa leitor de tela ouve "Notebook (no lote)" / "Monitor (faltando)", não
// um ícone mudo. Falta vem em negrito — é o que o operador precisa ver primeiro.
function CategoriaDoKit({ item }: { item: ItemChecklistKit }) {
  const Icone = item.presente ? Check : X
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap',
        !item.presente && 'font-semibold',
      )}
    >
      <Icone className="size-3.5" aria-hidden />
      {rotuloCategoria(item.categoria)}
      <span className="sr-only">
        {item.presente ? ' (no lote)' : ' (faltando)'}
      </span>
    </span>
  )
}

// F12/M12 — "Aplicar kit": preenche o passo 2 com um modelo salvo em
// Administração → Kits. Só aparece quando existe kit ativo (mesma regra do
// "Repetir última", que só aparece com última movimentação).
function MenuKits({
  kits,
  onAplicarKit,
}: {
  kits: Kit[]
  onAplicarKit: (kit: Kit) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <Layers className="size-4" />
          Aplicar kit
          <ChevronDown className="size-4 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
        <DropdownMenuLabel>Kits salvos</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {kits.map((k) => (
          <DropdownMenuItem
            key={k.id}
            onSelect={() => onAplicarKit(k)}
            className="flex-col items-start gap-0.5"
          >
            <span className="font-medium">{k.nome}</span>
            <span className="text-xs text-muted-foreground">
              {rotuloTipo(k.payload.tipo)} ·{' '}
              {k.payload.categorias
                .map((c: CategoriaAtivo) => rotuloCategoria(c))
                .join(', ')}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Passo 2 — os campos da movimentacao. Quais inputs aparecem e quais levam "*"
// derivam de CAMPOS_POR_TIPO (predicados campoAplica/campoObrigatorio), nao mais
// de arrays de string inline.
export function PassoMovimentacao({
  config,
  statusResultante,
  itens,
  tiposValidos,
  estadosMistos,
  motivosAplicaveis,
  errosPorAtivo,
  jaRegistrados,
  filiais,
  ultimaMov,
  kits,
  kitAplicado,
  checklistKit,
  onAplicarKit,
  onLimparKit,
  onTrocarTipo,
  onSet,
  onSetStatusResultante,
  onRepetirUltima,
  onVoltar,
  onRevisar,
}: {
  config: Config
  statusResultante: string
  itens: AtivoResumo[]
  tiposValidos: TipoMovimentacao[]
  estadosMistos: boolean
  motivosAplicaveis: Motivo[]
  errosPorAtivo: Record<string, string>
  // F10/M9 — o que ENTROU no envio parcial (some do lote, mas não da tela).
  jaRegistrados: SucessoLote['ativos']
  filiais: Filial[]
  ultimaMov?: UltimaMovimentacaoUsuario | null
  // F12/M12 — kits ativos, o kit aplicado nesta montagem e o checklist DERIVADO
  // do lote atual (o form recalcula a cada mudança; aqui só se desenha).
  kits: Kit[]
  kitAplicado: { id: string; nome: string; categorias: CategoriaAtivo[] } | null
  checklistKit: ItemChecklistKit[]
  onAplicarKit: (kit: Kit) => void
  onLimparKit: () => void
  onTrocarTipo: (tipo: TipoMovimentacao) => void
  onSet: <K extends keyof Config>(chave: K, valor: Config[K]) => void
  onSetStatusResultante: (valor: string) => void
  onRepetirUltima: () => void
  onVoltar: () => void
  onRevisar: () => void
}) {
  return (
    <div className="space-y-5">
      {/* F10/M9 — sucesso PARCIAL: o lote volta com só as falhas, e antes disso
          quem entrou sumia da tela sem deixar rastro. Agora fica o chip com o
          link da ficha (a informação já vinha no resultado da action). */}
      {jaRegistrados.length > 0 && (
        <div className="rounded-lg border border-green-600/40 bg-green-50 p-3 text-sm dark:border-green-400/30 dark:bg-green-950/40">
          <p className="flex items-center gap-1.5 font-medium text-green-800 dark:text-green-300">
            <Check className="size-4" />
            Já registrados ({jaRegistrados.length}):
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {jaRegistrados.map((a) => (
              <Button key={a.id} asChild variant="outline" size="sm">
                <Link href={`/ativos/${a.id}`} className="tabular-nums">
                  {a.patrimonio ?? 'sem patrimônio'}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* F19 — `role="alert"` porque o box só existe DEPOIS do envio: quem usa
          leitor de tela precisa ouvir quais itens falharam sem sair caçando. */}
      {Object.keys(errosPorAtivo).length > 0 && (
        <div
          role="alert"
          className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p className="font-medium text-destructive">
            Itens que falharam no último envio:
          </p>
          {itens.map(
            (a) =>
              errosPorAtivo[a.id] && (
                <p key={a.id} className="text-destructive">
                  <span className="font-medium tabular-nums">
                    {a.patrimonio ?? 'sem patrimônio'}
                  </span>{' '}
                  — {errosPorAtivo[a.id]}
                </p>
              ),
          )}
        </div>
      )}

      {estadosMistos && (
        <p className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          <TriangleAlert className="size-3.5" />
          Os ativos estão em estados diferentes — só aparecem as movimentações
          válidas para todos eles.
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* F19 — os ids levam o prefixo `passo-` porque `mov-tipo`/`mov-filial`
            já são dos filtros da lista de movimentações: mesmo sem as telas
            coexistirem, o prefixo tira a ambiguidade de quem procura o id. */}
        <div className="grid gap-2">
          <Label htmlFor="passo-tipo">Tipo de movimentação</Label>
          <Select
            value={config.tipo || undefined}
            onValueChange={(v) => onTrocarTipo(v as TipoMovimentacao)}
          >
            <SelectTrigger id="passo-tipo" className="w-full sm:w-[240px]">
              <SelectValue placeholder="Escolha o tipo" />
            </SelectTrigger>
            <SelectContent>
              {tiposValidos.map((t) => (
                <SelectItem key={t} value={t}>
                  {rotuloTipo(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          {kits.length > 0 && (
            <MenuKits kits={kits} onAplicarKit={onAplicarKit} />
          )}
          {ultimaMov && (
            <Button
              type="button"
              variant="outline"
              onClick={onRepetirUltima}
              className="gap-2"
            >
              <RotateCcw className="size-4" />
              Repetir última
            </Button>
          )}
        </div>
      </div>

      {/* F12/M12 — checklist das categorias esperadas pelo kit. INFORMATIVO:
          nunca desabilita "Revisar" (decisão §2.5 da OS-F12). Reage ao lote —
          adicionar o monitor que faltava apaga o aviso sozinho. */}
      {kitAplicado &&
        (faltaCategoriaDoKit(checklistKit) ? (
          <div className="flex flex-wrap items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">
              <span className="font-medium">{kitAplicado.nome}</span> espera:{' '}
              {checklistKit.map((c, i) => (
                <span key={c.categoria}>
                  {i > 0 && <span aria-hidden> · </span>}
                  <CategoriaDoKit item={c} />
                </span>
              ))}{' '}
              — adicione os que faltam no passo 1 ou registre assim mesmo.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onLimparKit}
              className="shrink-0 text-amber-900 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
            >
              Dispensar
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="size-3.5 text-green-600 dark:text-green-400" aria-hidden />
            Kit <span className="font-medium">{kitAplicado.nome}</span> completo —
            todas as categorias esperadas estão no lote.
          </p>
        ))}

      {config.tipo && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Motivo */}
          {motivosAplicaveis.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="passo-motivo">
                Motivo
                {campoObrigatorio(config.tipo, 'motivo') && (
                  <span className="text-destructive"> *</span>
                )}
              </Label>
              <Select
                value={config.motivo || undefined}
                onValueChange={(v) => onSet('motivo', v)}
              >
                <SelectTrigger id="passo-motivo">
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {motivosAplicaveis.map((m) => (
                    <SelectItem key={m.codigo} value={m.codigo}>
                      {m.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Colaborador / Setor */}
          {campoAplica(config.tipo, 'colaborador') && (
            <>
              <CampoComSugestoes
                id="colaborador"
                rotulo="Colaborador"
                campo="colaborador"
                valor={config.colaborador}
                onChange={(v) => onSet('colaborador', v)}
                placeholder="Nome do colaborador"
              />
              <CampoComSugestoes
                id="setor"
                rotulo="Setor"
                campo="setor"
                valor={config.setor}
                onChange={(v) => onSet('setor', v)}
                placeholder="Setor de destino"
              />
            </>
          )}

          {/* Chamado */}
          {campoAplica(config.tipo, 'chamado') && (
            <div className="grid gap-2">
              <Label htmlFor="chamado">Chamado (opcional)</Label>
              <Input
                id="chamado"
                inputMode="numeric"
                value={config.chamado}
                onChange={(e) => onSet('chamado', e.target.value)}
                placeholder="Nº do chamado"
              />
            </div>
          )}

          {/* Chamado do fornecedor (envio_manutencao — F14/MN1) */}
          {campoAplica(config.tipo, 'chamado_fornecedor') && (
            <div className="grid gap-2">
              <Label htmlFor="chamado-fornecedor">
                Chamado do fornecedor
                {campoObrigatorio(config.tipo, 'chamado_fornecedor') && (
                  <span className="text-destructive"> *</span>
                )}
              </Label>
              <Input
                id="chamado-fornecedor"
                value={config.chamadoFornecedor}
                onChange={(e) => onSet('chamadoFornecedor', e.target.value)}
                placeholder="Chamado aberto pelo fornecedor"
                maxLength={200}
              />
            </div>
          )}

          {/* Termo */}
          {campoAplica(config.tipo, 'termo') && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="passo-termo">Termo de responsabilidade</Label>
                <Select
                  value={config.termo || undefined}
                  onValueChange={(v) => onSet('termo', v as TermoStatus)}
                >
                  <SelectTrigger id="passo-termo">
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
                <Label htmlFor="termo-data">Data do termo</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="termo-data"
                    type="date"
                    max={hojeISO()}
                    value={config.termoData}
                    onChange={(e) => onSet('termoData', e.target.value)}
                  />
                  <ChipsData
                    campo="a data do termo"
                    onEscolher={(iso) => onSet('termoData', iso)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Filial destino (transferencia) */}
          {campoAplica(config.tipo, 'filial_destino') && (
            <div className="grid gap-2">
              <Label htmlFor="passo-filial-destino">
                Filial de destino<span className="text-destructive"> *</span>
              </Label>
              <Select
                value={config.filialDestinoId || undefined}
                onValueChange={(v) => onSet('filialDestinoId', v)}
              >
                <SelectTrigger id="passo-filial-destino">
                  <SelectValue placeholder="Selecione a filial" />
                </SelectTrigger>
                <SelectContent>
                  {filiais.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Status resultante (ajuste) */}
          {campoAplica(config.tipo, 'status_resultante') && (
            <div className="grid gap-2">
              <Label htmlFor="passo-status">
                Novo status<span className="text-destructive"> *</span>
              </Label>
              <Select
                value={statusResultante || undefined}
                onValueChange={onSetStatusResultante}
              >
                <SelectTrigger id="passo-status">
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDEM.map((s) => (
                    <SelectItem key={s} value={s}>
                      {rotuloStatus(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Data */}
          <div className="grid gap-2">
            <Label htmlFor="data">Data</Label>
            <div className="flex items-center gap-2">
              <Input
                id="data"
                type="date"
                max={hojeISO()}
                value={config.data}
                onChange={(e) => onSet('data', e.target.value)}
              />
              <ChipsData
                campo="a data da movimentação"
                onEscolher={(iso) => onSet('data', iso)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Itens faltantes (devolucao) */}
      {campoAplica(config.tipo, 'itens_faltantes') && (
        <div className="grid gap-2">
          <Label>Itens faltantes na devolução</Label>
          <div className="flex flex-wrap gap-3 rounded-lg border p-3">
            {ACESSORIOS_DEVOLUCAO.map((it) => {
              const marcado = config.itensFaltantes.includes(it)
              return (
                <label
                  key={it}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={marcado}
                    onCheckedChange={(c) =>
                      onSet(
                        'itensFaltantes',
                        c === true
                          ? [...config.itensFaltantes, it]
                          : config.itensFaltantes.filter((x) => x !== it),
                      )
                    }
                  />
                  {rotuloAcessorio(it)}
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* Observacao (todos os tipos) */}
      {config.tipo && (
        <div className="grid gap-2">
          <Label htmlFor="observacao">
            Observação
            {observacaoObrigatoria(config.tipo) ? (
              <span className="text-destructive"> * (justificativa)</span>
            ) : (
              ' (opcional)'
            )}
          </Label>
          <Textarea
            id="observacao"
            rows={2}
            maxLength={500}
            value={config.observacao}
            onChange={(e) => onSet('observacao', e.target.value)}
            placeholder="Observação (opcional) — ex.: aguardando NF-e, tela trincada…"
          />
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onVoltar}>
          Voltar
        </Button>
        <Button onClick={onRevisar} disabled={!config.tipo}>
          Revisar
        </Button>
      </div>
    </div>
  )
}
