'use client'

import { RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
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
  ACESSORIOS_DEVOLUCAO,
  STATUS_ORDEM,
  TERMO_STATUS_ORDEM,
  rotuloAcessorio,
  rotuloStatus,
  rotuloTermo,
  rotuloTipo,
  type TermoStatus,
  type TipoMovimentacao,
} from '@/lib/dominio'
import { hojeISO } from '@/lib/format'
import type { Config } from '@/components/movimentacoes/nova/config'
import type { AtivoResumo } from '@/lib/queries/ativos'
import type { Filial } from '@/lib/queries/filiais'
import type { Motivo } from '@/lib/queries/motivos'
import type { UltimaMovimentacaoUsuario } from '@/lib/queries/movimentacoes'

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
  filiais,
  ultimaMov,
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
  filiais: Filial[]
  ultimaMov?: UltimaMovimentacaoUsuario | null
  onTrocarTipo: (tipo: TipoMovimentacao) => void
  onSet: <K extends keyof Config>(chave: K, valor: Config[K]) => void
  onSetStatusResultante: (valor: string) => void
  onRepetirUltima: () => void
  onVoltar: () => void
  onRevisar: () => void
}) {
  return (
    <div className="space-y-5">
      {Object.keys(errosPorAtivo).length > 0 && (
        <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
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
        <div className="grid gap-2">
          <Label>Tipo de movimentação</Label>
          <Select
            value={config.tipo || undefined}
            onValueChange={(v) => onTrocarTipo(v as TipoMovimentacao)}
          >
            <SelectTrigger className="w-full sm:w-[240px]">
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

      {config.tipo && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Motivo */}
          {motivosAplicaveis.length > 0 && (
            <div className="grid gap-2">
              <Label>
                Motivo
                {campoObrigatorio(config.tipo, 'motivo') && (
                  <span className="text-destructive"> *</span>
                )}
              </Label>
              <Select
                value={config.motivo || undefined}
                onValueChange={(v) => onSet('motivo', v)}
              >
                <SelectTrigger>
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
              <div className="grid gap-2">
                <Label htmlFor="colaborador">Colaborador</Label>
                <Input
                  id="colaborador"
                  value={config.colaborador}
                  onChange={(e) => onSet('colaborador', e.target.value)}
                  placeholder="Nome do colaborador"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="setor">Setor</Label>
                <Input
                  id="setor"
                  value={config.setor}
                  onChange={(e) => onSet('setor', e.target.value)}
                  placeholder="Setor de destino"
                />
              </div>
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

          {/* Termo */}
          {campoAplica(config.tipo, 'termo') && (
            <>
              <div className="grid gap-2">
                <Label>Termo de responsabilidade</Label>
                <Select
                  value={config.termo || undefined}
                  onValueChange={(v) => onSet('termo', v as TermoStatus)}
                >
                  <SelectTrigger>
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
                <Input
                  id="termo-data"
                  type="date"
                  max={hojeISO()}
                  value={config.termoData}
                  onChange={(e) => onSet('termoData', e.target.value)}
                />
              </div>
            </>
          )}

          {/* Filial destino (transferencia) */}
          {campoAplica(config.tipo, 'filial_destino') && (
            <div className="grid gap-2">
              <Label>
                Filial de destino<span className="text-destructive"> *</span>
              </Label>
              <Select
                value={config.filialDestinoId || undefined}
                onValueChange={(v) => onSet('filialDestinoId', v)}
              >
                <SelectTrigger>
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
              <Label>
                Novo status<span className="text-destructive"> *</span>
              </Label>
              <Select
                value={statusResultante || undefined}
                onValueChange={onSetStatusResultante}
              >
                <SelectTrigger>
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
            <Input
              id="data"
              type="date"
              max={hojeISO()}
              value={config.data}
              onChange={(e) => onSet('data', e.target.value)}
            />
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
