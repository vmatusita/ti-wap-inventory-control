'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  MSG_ESCOLHA_O_ITEM,
  resolverItemDoTipo,
  type ItemDoCatalogo,
} from '@/lib/itens/ponte-tipo-item'
import type { TipoItem } from '@/lib/queries/tipos-item'

// Checklist da devolução (spec §6) — DOIS DESFECHOS desde a F38 (D12).
//
// O QUE MUDOU, E O QUE NÃO MUDOU.
//
// Até a F37 esta lista eram sete códigos fixos em `dominio.ts` e marcar
// significava UMA coisa só: faltou. Nada tocava o estoque. Agora a lista vem do
// CATÁLOGO DE TIPOS (`tipos_item`, F37) e cada linha tem dois desfechos:
//
//   Devolvido → lançamento `retorno`: repõe o estoque da filial e baixa da conta
//               da pessoa (com a regra §C.3 sobre o vínculo, decidida no servidor)
//   Faltante  → `pendencias_item` aberta EXATAMENTE como hoje
//
// ⚠ O CAMINHO "FALTANTE" NÃO MUDA UMA VÍRGULA. Quem cria a pendência continua
// sendo o trigger `aplicar_movimentacao` (0051), lendo
// `movimentacoes.itens_faltantes` — e esse array continua sendo gravado com OS
// MESMOS SLUGS literais. Só a origem da LISTA EXIBIDA mudou. É por isso que este
// componente devolve `faltantes: string[]` no mesmo formato de sempre.
//
// A PONTE TIPO→ITEM. A linha do checklist é um TIPO; o lançamento precisa de um
// ITEM do catálogo. Tipo com exatamente um item ativo resolve sozinho; com dois ou
// mais, a linha pergunta qual; com zero, "Devolvido" **não bloqueia** — a devolução
// é registrada, o lançamento não nasce, e a linha diz por quê.
//
// QUANTIDADE 1 POR LINHA. O checklist é booleano e continua sendo: quantidade
// livre é outra fase.

/** O que a devolução conferiu, por tipo. */
export type DesfechoLinha = 'devolvido' | 'faltante'

export type ItemDevolvido = {
  /** O slug do tipo marcado como devolvido. */
  tipoSlug: string
  /** O item do catálogo resolvido (ou escolhido). `null` = sem lançamento. */
  itemId: number | null
}

export function ChecklistFaltantes({
  tipos,
  itensCatalogo,
  faltantes,
  devolvidos,
  onChange,
  rotulo = 'O que voltou com o equipamento',
}: {
  /** Os tipos ATIVOS do catálogo, na ordem de exibição. */
  tipos: TipoItem[]
  /** O catálogo de itens, para a ponte tipo→item. */
  itensCatalogo: ItemDoCatalogo[]
  faltantes: string[]
  devolvidos: ItemDevolvido[]
  onChange: (v: { faltantes: string[]; devolvidos: ItemDevolvido[] }) => void
  rotulo?: string
}) {
  function desfechoDe(slug: string): DesfechoLinha | null {
    if (faltantes.includes(slug)) return 'faltante'
    if (devolvidos.some((d) => d.tipoSlug === slug)) return 'devolvido'
    return null
  }

  function marcar(tipo: TipoItem, alvo: DesfechoLinha | null) {
    const semEste = {
      faltantes: faltantes.filter((s) => s !== tipo.slug),
      devolvidos: devolvidos.filter((d) => d.tipoSlug !== tipo.slug),
    }
    if (alvo === 'faltante') {
      onChange({ ...semEste, faltantes: [...semEste.faltantes, tipo.slug] })
      return
    }
    if (alvo === 'devolvido') {
      const r = resolverItemDoTipo(itensCatalogo, tipo.id)
      onChange({
        ...semEste,
        devolvidos: [
          ...semEste.devolvidos,
          { tipoSlug: tipo.slug, itemId: r.situacao === 'resolvido' ? r.item.id : null },
        ],
      })
      return
    }
    onChange(semEste)
  }

  function escolherItem(slug: string, itemId: number) {
    onChange({
      faltantes,
      devolvidos: devolvidos.map((d) => (d.tipoSlug === slug ? { ...d, itemId } : d)),
    })
  }

  if (tipos.length === 0) return null

  return (
    <div className="grid gap-2">
      <Label>{rotulo}</Label>
      <p className="text-muted-foreground text-xs">
        Marque <strong>Voltou</strong> para repor o acessório no estoque, ou{' '}
        <strong>Faltou</strong> para abrir a pendência. Deixe em branco o que não fazia parte
        da entrega.
      </p>
      <ul className="divide-y rounded-lg border">
        {tipos.map((tipo) => {
          const desfecho = desfechoDe(tipo.slug)
          const resolucao = resolverItemDoTipo(itensCatalogo, tipo.id)
          const escolhido = devolvidos.find((d) => d.tipoSlug === tipo.slug)
          return (
            <li key={tipo.slug} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="min-w-32 flex-1">{tipo.rotulo}</span>

              <div className="flex gap-1" role="group" aria-label={`O que aconteceu com ${tipo.rotulo}`}>
                <BotaoDesfecho
                  ativo={desfecho === 'devolvido'}
                  onClick={() => marcar(tipo, desfecho === 'devolvido' ? null : 'devolvido')}
                  tom="ok"
                >
                  Voltou
                </BotaoDesfecho>
                <BotaoDesfecho
                  ativo={desfecho === 'faltante'}
                  onClick={() => marcar(tipo, desfecho === 'faltante' ? null : 'faltante')}
                  tom="alerta"
                >
                  Faltou
                </BotaoDesfecho>
              </div>

              {desfecho === 'devolvido' && resolucao.situacao === 'ambiguo' && (
                <Select
                  value={escolhido?.itemId ? String(escolhido.itemId) : ''}
                  onValueChange={(v) => escolherItem(tipo.slug, Number(v))}
                >
                  <SelectTrigger className="h-8 w-56" aria-label={MSG_ESCOLHA_O_ITEM}>
                    <SelectValue placeholder={MSG_ESCOLHA_O_ITEM} />
                  </SelectTrigger>
                  <SelectContent>
                    {resolucao.candidatos.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {desfecho === 'devolvido' && resolucao.situacao === 'sem_item' && (
                <span className="text-muted-foreground basis-full text-xs">
                  {resolucao.motivo}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function BotaoDesfecho({
  ativo,
  onClick,
  tom,
  children,
}: {
  ativo: boolean
  onClick: () => void
  tom: 'ok' | 'alerta'
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        'focus-visible:ring-ring rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
        !ativo && 'bg-background text-muted-foreground hover:bg-muted',
        ativo && tom === 'ok' && 'border-emerald-600 bg-emerald-600 text-white',
        ativo && tom === 'alerta' && 'border-amber-600 bg-amber-600 text-white',
      )}
    >
      {children}
    </button>
  )
}
