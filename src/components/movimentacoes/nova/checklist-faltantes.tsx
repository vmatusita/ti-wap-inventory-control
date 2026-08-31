'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { criarItemInline } from '@/lib/actions/itens'
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
  avisoSemLancamento = null,
}: {
  /** Os tipos ATIVOS do catálogo, na ordem de exibição. */
  tipos: TipoItem[]
  /** O catálogo de itens, para a ponte tipo→item. */
  itensCatalogo: ItemDoCatalogo[]
  faltantes: string[]
  devolvidos: ItemDevolvido[]
  onChange: (v: { faltantes: string[]; devolvidos: ItemDevolvido[] }) => void
  rotulo?: string
  /**
   * F38 — o texto que explica por que "Voltou" NÃO vai mexer no estoque neste
   * lote (hoje: filiais ou detentores diferentes). `null` = vai mexer normalmente.
   * O checklist continua inteiro e o "Faltou" continua abrindo pendência: o que o
   * lote misto desliga é só o lançamento.
   */
  avisoSemLancamento?: string | null
}) {
  // A ponte tipo→item por tipo, calculada UMA vez por catálogo — não uma vez por
  // tipo a cada tecla digitada no passo 2. `resolverItemDoTipo` filtra e ordena o
  // catálogo inteiro com `localeCompare`; dentro do `map` de renderização isso
  // refazia N ordenações a cada re-render, para um resultado que só muda quando
  // `itensCatalogo` muda.
  const resolucoes = useMemo(
    () => new Map(tipos.map((t) => [t.slug, resolverItemDoTipo(itensCatalogo, t.id)])),
    [tipos, itensCatalogo],
  )

  /** F41 — o slug da linha que está cadastrando o item agora (trava os botões). */
  const [criando, setCriando] = useState<string | null>(null)

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
      const r = resolucoes.get(tipo.slug) ?? resolverItemDoTipo(itensCatalogo, tipo.id)
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

  // F41 — cadastra o item DESTA linha, com o nome e o tipo dela.
  //
  // O nome do item nasce igual ao rótulo do tipo ("Carregador"), que é o que o
  // operador chamaria de qualquer jeito; renomear depois é edição de catálogo, do
  // admin. `grupo: 'acessorio'` porque é o que o checklist da devolução lista —
  // componente não vai junto com o equipamento numa devolução de desligamento.
  //
  // Não recarregamos o catálogo do servidor: o que o payload precisa é do `itemId`,
  // e ele volta da própria action. A linha passa a mostrar a confirmação em vez do
  // motivo, e o `resolucao` continua dizendo "sem_item" até o próximo carregamento
  // — o que não afeta gravação nenhuma, porque quem manda é `escolhido.itemId`.
  async function cadastrarDoTipo(tipo: TipoItem) {
    setCriando(tipo.slug)
    try {
      const res = await criarItemInline({
        nome: tipo.rotulo,
        grupo: 'acessorio',
        tipo_id: tipo.id,
      })
      if (!res.ok || !res.id) {
        toast.error(res.erro ?? 'Não foi possível cadastrar o item.')
        return
      }
      escolherItem(tipo.slug, res.id)
      if (res.precisaAdminParaReativar) {
        toast.info(
          `"${tipo.rotulo}" já existia desativado e foi usado assim mesmo. Peça a um administrador para reativá-lo em Administração › Itens.`,
        )
      } else if (res.reativado) {
        toast.success(`"${tipo.rotulo}" voltou ao catálogo.`)
      } else {
        toast.success(`"${tipo.rotulo}" cadastrado.`)
      }
    } finally {
      setCriando(null)
    }
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

      {avisoSemLancamento && (
        <p
          role="status"
          className="rounded-md border border-amber-600/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {avisoSemLancamento}
        </p>
      )}
      <ul className="divide-y rounded-lg border">
        {tipos.map((tipo) => {
          const desfecho = desfechoDe(tipo.slug)
          const resolucao =
            resolucoes.get(tipo.slug) ?? resolverItemDoTipo(itensCatalogo, tipo.id)
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

              {/* F41 — O ITEM NASCE AQUI, se ainda não existir.
                  Era o beco sem saída do checklist: tipo sem item de catálogo
                  marcava "Voltou", a devolução gravava e o estoque não mexia — e a
                  única saída era abandonar o fluxo, ir a /admin/itens (que o
                  operador nem alcança), cadastrar e voltar. Agora o item é criado
                  daqui, JÁ COM O `tipo_id` desta linha, e a próxima devolução
                  resolve sozinha pela ponte tipo→item.
                  Sobre não haver `podeCadastrar`: quem chega ao passo 2 do wizard
                  está num fluxo de escrita, e a guarda de verdade é do servidor
                  (`exigirPapel(…, 'operador')` + a policy `pode_escrever()`), que
                  responde em pt-BR. Um flag a mais na prop só duplicaria a regra. */}
              {desfecho === 'devolvido' && resolucao.situacao === 'sem_item' && (
                <div className="basis-full">
                  {escolhido?.itemId ? (
                    <span className="text-muted-foreground text-xs">
                      Item <strong>{tipo.rotulo}</strong> cadastrado — vai repor o estoque.
                    </span>
                  ) : (
                    <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                      {resolucao.motivo}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7"
                        disabled={criando !== null}
                        onClick={() => cadastrarDoTipo(tipo)}
                      >
                        {criando === tipo.slug ? 'Cadastrando…' : `Cadastrar "${tipo.rotulo}"`}
                      </Button>
                    </span>
                  )}
                </div>
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
      // O par marcado usa o idioma de BADGE da casa (fundo claro + texto escuro no
      // tema claro, e o inverso no escuro), e não fundo saturado com texto branco:
      // `bg-emerald-600` com branco mede **3,65:1** e `bg-amber-600`, **3,2:1** —
      // os dois abaixo do mínimo de 4,5:1 do WCAG AA para texto pequeno. Medido no
      // navegador durante a verificação da fase, não estimado.
      className={cn(
        'focus-visible:ring-ring rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
        !ativo && 'bg-background text-muted-foreground hover:bg-muted',
        ativo &&
          tom === 'ok' &&
          'border-emerald-600 bg-emerald-100 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-200',
        ativo &&
          tom === 'alerta' &&
          'border-amber-600 bg-amber-100 text-amber-900 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-200',
      )}
    >
      {children}
    </button>
  )
}
