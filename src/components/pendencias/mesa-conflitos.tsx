'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, ExternalLink, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { rotuloCategoria, rotuloStatus } from '@/lib/dominio'
import {
  CAMPOS_CONFLITO,
  camposDivergentes,
  resumoDaExclusao,
  type CampoConflito,
  type GrupoConflito,
  type LadoConflito,
} from '@/lib/pendencias/conflitos'
import {
  MIN_JUSTIFICATIVA_CONFLITO,
  confirmacaoConflitoConfere,
  textoConfirmacaoConflito,
} from '@/lib/validators/conflitos'
import { apagarConflito, resumoExclusaoConflito } from '@/lib/actions/conflitos'

// A MESA DE CONFLITOS (F24) — a seção própria de /pendencias.
//
// Client Component porque tem seleção (checkbox) e diálogo. Recebe os grupos JÁ montados e
// as datas JÁ formatadas pelo servidor: nada de `new Date()` aqui, pela mesma razão da fila
// da F18 (mismatch de hidratação na virada do dia).
//
// ⚠ `podeApagar` (nível administrador) desliga TUDO o que age: checkboxes, "selecionar
// todos", a barra de lote e os botões por grupo. Todo logado ATIVO continua LENDO a mesa —
// operador e consulta veem o conflito e o diff, só não têm como apagar. E isto é a UI: a
// segurança é a RPC (migration 0093), que confere `e_admin()` por dentro.

/** Um grupo com as datas já formatadas no servidor. */
export type GrupoConflitoFmt = Omit<GrupoConflito, 'lados'> & {
  lados: (LadoConflito & { entradaFmt: string; ultimaMovFmt: string })[]
}

type LadoFmt = GrupoConflitoFmt['lados'][number]

function valorDoCampo(lado: LadoFmt, campo: CampoConflito): string {
  switch (campo) {
    case 'status':
      return rotuloStatus(lado.status)
    case 'categoria':
      return rotuloCategoria(lado.categoria)
    case 'entradaEm':
      return lado.entradaFmt
    default: {
      const v = lado[campo]
      return v === null || v === undefined || String(v).trim() === '' ? '—' : String(v)
    }
  }
}

export function MesaConflitos({
  grupos,
  podeApagar = false,
}: {
  grupos: GrupoConflitoFmt[]
  podeApagar?: boolean
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  // O que o diálogo mostra vem do SERVIDOR, lido no clique — ver `abrirDialogo`.
  const [dialogo, setDialogo] = useState<{
    ids: string[]
    resumo: ReturnType<typeof resumoDaExclusao>
    faltando: number
  } | null>(null)
  const [abrindo, iniciarAbertura] = useTransition()

  // Ids VISÍVEIS nesta página. A seleção some ao paginar/filtrar — mesma decisão da fila da
  // F18: cada página resolve a sua, sem a surpresa de "apaguei o que não estava vendo".
  const idsVisiveis = useMemo(
    () => grupos.flatMap((g) => g.lados.map((l) => l.ativoId)),
    [grupos],
  )
  // (não há mais índice id→lado aqui: o diálogo lê os lados do SERVIDOR no clique, e não
  // do que veio com a página — ver `abrirDialogo`.)
  const selecionadosVisiveis = useMemo(
    () => idsVisiveis.filter((id) => selecionados.has(id)),
    [idsVisiveis, selecionados],
  )
  const todosMarcados =
    idsVisiveis.length > 0 && selecionadosVisiveis.length === idsVisiveis.length

  function toggle(id: string, on: boolean) {
    setSelecionados((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  /**
   * Abre o diálogo com o resumo REAL, lido do servidor NO CLIQUE (ordem §4.3).
   *
   * ⚠ Não usa os números que vieram com a página: entre o carregamento e o clique, outra
   * pessoa pode ter registrado uma movimentação, gerado um termo, ou resolvido o conflito
   * inteiro. Um diálogo que diz "3 movimentações somem junto" com base em dado velho é
   * exatamente o tipo de número que ninguém confere depois.
   *
   * `faltando` > 0 significa que algum selecionado já NÃO está mais em conflito — a RPC
   * recusaria a operação inteira por causa dele, e é melhor dizer isso antes.
   */
  function abrirDialogo(ids: string[]) {
    if (ids.length === 0) return
    iniciarAbertura(async () => {
      try {
        const res = await resumoExclusaoConflito({ ativoIds: ids })
        if (!res.ok) {
          toast.error(res.erro, { duration: 10000 })
          return
        }
        const d = res.dados
        if (!d || d.lados.length === 0) {
          toast.warning(
            'Estes cadastros já não estão em conflito — alguém resolveu enquanto esta página estava aberta. Recarregue a mesa.',
            { duration: 12000 },
          )
          return
        }
        setDialogo({ ids, resumo: d.resumo, faltando: d.faltando })
      } catch {
        toast.error(
          'Não foi possível ler o estado atual destes cadastros. Nada foi apagado — confira a conexão e tente de novo.',
          { duration: 10000 },
        )
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Aviso fixo da semântica invertida da mesa: para quem não conhece a tela, marcar
          "o certo" é a leitura natural — e é exatamente o oposto do que a caixa faz. Por
          isso a linha fica sempre visível (não só quando há seleção) e com contraste de
          destructive, não um parágrafo cinza que passa despercebido. */}
      {/* ⚠ Cor medida, não escolhida: `text-destructive` sobre `bg-destructive/10`
          dá 3,99:1 no tema claro (`node scripts/contraste.mjs --par "destructive
          sobre destructive/10" --tema claro`) e REPROVA o AA de 4,5:1 — e
          `font-medium` (500) não é "bold" para o limiar relaxado. Justo o aviso
          que existe para impedir que alguém apague o cadastro certo seria o
          texto mais difícil de ler da tela. A família red-50/900 + red-950/200 é
          a mesma do callout âmbar aprovado da ficha: 9,21:1 no claro e 12,21:1
          no escuro. Achado da revisão adversarial da F28. */}
      {podeApagar && grupos.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="size-4 shrink-0" />
          <p>
            Marque o cadastro <strong>errado</strong> — a exclusão é do que estiver
            marcado.
          </p>
        </div>
      )}

      {podeApagar && idsVisiveis.length > 0 && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={todosMarcados}
            onCheckedChange={(v) =>
              setSelecionados(v === true ? new Set(idsVisiveis) : new Set())
            }
            aria-label="Marcar todos os cadastros desta página para exclusão"
          />
          Marcar todos desta página para exclusão
        </label>
      )}

      {grupos.map((g) => {
        const divergentes = camposDivergentes(g.lados)
        return (
          <section key={g.chave} className="rounded-xl border bg-card">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                  Conflito entre filiais
                </Badge>
                <span className="font-mono font-semibold tabular-nums">{g.rotulo}</span>
                {/* Um grupo tem no máximo UM lado por filial — é o que o índice único
                    por filial (0091) garante —, então "N cadastros" e "N filiais" são
                    sempre o mesmo número. Dizer uma vez basta. */}
                <span className="text-sm text-muted-foreground">
                  {g.lados.length} cadastros, um em cada filial
                </span>
              </div>
              {/* ⚠ NÃO existe botão "Apagar ambos" aqui, e a ausência é a decisão: o
                  sentido da mesa é olhar os dois lados e apagar o ERRADO, então a ação
                  mais proeminente do bloco não pode ser a que destrói os dois — inclusive
                  o lado marcado com "Tem histórico próprio". Apagar um lado é a caixa de
                  seleção ao lado dele; apagar vários é a barra de lote fixa no rodapé.
                  Quem realmente quiser levar o grupo inteiro marca todas as caixas e lê
                  o número na confirmação. */}
            </header>

            {/* Os lados LADO A LADO. Em telas estreitas empilham; o realce continua. */}
            <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]">
              {g.lados.map((l) => (
                <div key={l.ativoId} className="space-y-3 bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {podeApagar && (
                        <Checkbox
                          checked={selecionados.has(l.ativoId)}
                          onCheckedChange={(v) => toggle(l.ativoId, v === true)}
                          aria-label={`Marcar o cadastro de ${l.filialNome} para exclusão`}
                        />
                      )}
                      <span className="font-semibold">{l.filialNome}</span>
                    </div>
                    {/* Nova aba: a mesa tem seleção e rolagem que a navegação normal
                        derrubaria. O ícone de link externo já sugeria isso — agora ele
                        não mente mais. */}
                    <Button asChild variant="ghost" size="sm" className="gap-1 px-2">
                      <Link href={`/ativos/${l.ativoId}`} target="_blank" rel="noopener">
                        Ficha
                        <span className="sr-only"> (abre em nova aba)</span>
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>

                  <dl className="space-y-1 text-sm">
                    {CAMPOS_CONFLITO.map(({ chave, rotulo }) => {
                      const difere = divergentes.has(chave)
                      return (
                        <div
                          key={chave}
                          className={cn(
                            'flex items-baseline justify-between gap-3 rounded px-1.5 py-0.5',
                            // O realce é o coração da mesa: os campos que DIFEREM entre os
                            // lados são o que faz alguém decidir qual cadastro é o certo.
                            difere && 'bg-amber-100/70 dark:bg-amber-950/40',
                          )}
                        >
                          <dt className="shrink-0 text-muted-foreground">{rotulo}</dt>
                          <dd
                            className={cn(
                              'text-right break-all',
                              difere && 'font-medium text-amber-900 dark:text-amber-200',
                            )}
                          >
                            {valorDoCampo(l, chave)}
                          </dd>
                        </div>
                      )
                    })}
                  </dl>

                  {/* Resumo de histórico do lado (§3.2) — o sinal mais forte de qual
                      cadastro tem vida real de sistema. */}
                  <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs tabular-nums">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Movimentações</span>
                      <span>
                        {l.movimentacoes}
                        {l.movimentacoesReais > 0 && (
                          <span className="text-muted-foreground">
                            {' '}
                            ({l.movimentacoesReais} fora da carga)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Termos</span>
                      <span>{l.termos}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Última movimentação</span>
                      <span>{l.ultimaMovFmt}</span>
                    </div>
                  </div>

                  {l.temHistoricoReal && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      Tem histórico próprio além da carga do import — provavelmente é este o
                      cadastro certo.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )
      })}

      {/* Espaçador: sem ele, a barra sticky do rodapé (abaixo) cobriria a última seção
          quando a mesa termina no fim da rolagem — mesmo problema que a barra resolve
          para quem marca no 15º grupo, só que na outra ponta. */}
      {podeApagar && selecionadosVisiveis.length > 0 && <div aria-hidden="true" className="h-16" />}

      {/* Barra de lote — só para quem pode apagar, e só com algo marcado. Sticky no
          RODAPÉ (não no topo): com até 20 grupos na mesa, uma barra fixa lá em cima some
          da tela assim que a pessoa rola para marcar o grupo 15. Fundo OPACO (não
          `/30` como antes) porque, grudada na borda inferior, a tabela rolaria por
          baixo dela se o fundo deixasse ver através. Padrão de sticky do repo:
          `chips-ancora.tsx:31` (lá é topo; aqui é rodapé, por isso `border-t` em vez de
          borda inteira, e o respiro extra embaixo para não colar no rodapé do celular). */}
      {podeApagar && selecionadosVisiveis.length > 0 && (
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-orange-300 bg-orange-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.12)] dark:border-orange-900 dark:bg-orange-950">
          <span className="text-sm tabular-nums">
            <strong>{selecionadosVisiveis.length}</strong>{' '}
            {selecionadosVisiveis.length === 1
              ? 'cadastro selecionado'
              : 'cadastros selecionados'}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelecionados(new Set())}>
              Limpar seleção
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              disabled={abrindo}
              onClick={() => abrirDialogo(selecionadosVisiveis)}
            >
              <Trash2 className="size-4" />
              Apagar selecionados ({selecionadosVisiveis.length})
            </Button>
          </div>
        </div>
      )}

      {dialogo && (
        <DialogoApagarConflito
          ids={dialogo.ids}
          resumo={dialogo.resumo}
          faltando={dialogo.faltando}
          onFechar={() => setDialogo(null)}
          onApagado={() => {
            setSelecionados(new Set())
            setDialogo(null)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// O diálogo (§4.3)
// ---------------------------------------------------------------------------
// Molde do `DialogoDestrutivo` da F23 — MESMO padrão, componente próprio: a mesa não mora na
// Zona destrutiva e não deve depender do módulo dela (a ordem F24 fecha aquele escopo). O que
// é copiado de propósito: Dialog comum (o projeto não tem `alert-dialog` e não ganha
// dependência nova), foco inicial no CANCELAR — a ação destrutiva nunca fica sob o Enter — e
// nenhum submit por Enter, porque há um textarea logo abaixo do campo de confirmação.

function DialogoApagarConflito({
  ids,
  resumo,
  faltando,
  onFechar,
  onApagado,
}: {
  /** Os ids PEDIDOS — é o que vai para a RPC, e é sobre eles que a confirmação conta. */
  ids: string[]
  resumo: ReturnType<typeof resumoDaExclusao>
  /** Quantos dos pedidos já NÃO estão em conflito. > 0 = a RPC vai recusar tudo. */
  faltando: number
  onFechar: () => void
  onApagado: () => void
}) {
  const router = useRouter()
  const [confirmacao, setConfirmacao] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [executando, start] = useTransition()
  const cancelarRef = useRef<HTMLButtonElement>(null)

  // A confirmação conta os ids PEDIDOS (o que a RPC vai receber e deduplicar), não os lados
  // devolvidos — senão o texto pediria um número e a RPC esperaria outro.
  const esperado = textoConfirmacaoConflito(ids.length)
  const confere = confirmacaoConflitoConfere(confirmacao, ids.length)
  const justificativaOk = justificativa.trim().length >= MIN_JUSTIFICATIVA_CONFLITO
  const pronto = confere && justificativaOk && !executando
  const faltam = MIN_JUSTIFICATIVA_CONFLITO - justificativa.trim().length

  function executar() {
    if (!pronto) return
    start(async () => {
      try {
        const res = await apagarConflito({
          // ⚠ Os ids PEDIDOS, e não os lados que o servidor devolveu: é sobre `ids` que a
          // confirmação acima foi contada, e mandar um conjunto MENOR faria a RPC esperar
          // outro número ("APAGAR 2" para quem digitou "APAGAR 3") e recusar apontando o
          // problema errado — quando o certo é a recusa all-or-nothing da própria RPC,
          // que `traduzErroBanco` traduz para "recarregue a mesa e refaça a seleção".
          // Enviar os lados também apagaria menos do que foi confirmado.
          ativoIds: ids,
          confirmacao: confirmacao.trim(),
          justificativa: justificativa.trim(),
        })
        if (!res.ok) {
          toast.error(res.erro, { duration: 12000 })
          return
        }
        // Aviso aqui é sempre GRAVE (arquivo de termo órfão no armazenamento): entra como
        // alerta longo, nunca como sucesso, para ninguém sair achando que acabou limpo.
        if (res.aviso) toast.warning(res.aviso, { duration: 15000 })
        else {
          toast.success(
            ids.length === 1
              ? 'Cadastro apagado. O conflito foi resolvido.'
              : `${ids.length} cadastros apagados.`,
          )
        }
        onApagado()
        router.refresh()
      } catch {
        // A mensagem diz em que estado o dado CONTINUA, para ninguém repetir "por garantia"
        // — e repetir operação destrutiva por garantia é como se apaga duas coisas.
        toast.error(
          'Não foi possível concluir — pelo que sabemos, nada foi apagado. Confira a conexão, recarregue a página e veja o estado atual antes de tentar de novo.',
          { duration: 12000 },
        )
      }
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          cancelarRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {ids.length === 1
              ? 'Apagar este cadastro?'
              : `Apagar ${ids.length} cadastros?`}
          </DialogTitle>
          <DialogDescription>
            Esta ação <strong>não tem volta</strong>. O histórico do cadastro apagado vai
            junto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border p-3 text-sm">
          <ul className="space-y-1">
            {resumo.porFilial.map((f) => (
              <li key={f.filial} className="flex justify-between gap-3 tabular-nums">
                <span className="text-muted-foreground">{f.filial}</span>
                <span>
                  {f.ativos} {f.ativos === 1 ? 'cadastro' : 'cadastros'}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between gap-3 border-t pt-2 tabular-nums">
            <span className="text-muted-foreground">Movimentações que somem junto</span>
            <span>{resumo.movimentacoes}</span>
          </div>
          <div className="flex justify-between gap-3 tabular-nums">
            <span className="text-muted-foreground">Termos que somem junto</span>
            <span>{resumo.termos}</span>
          </div>
        </div>

        {/* Algum selecionado já saiu do conflito enquanto esta página estava aberta. A RPC
            recusaria a operação INTEIRA por causa dele (all-or-nothing) — dizer antes evita
            o clique que vai falhar. */}
        {faltando > 0 && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-destructive">
              <AlertTriangle className="size-4" />
              {faltando === 1
                ? 'Um dos selecionados já não está em conflito'
                : `${faltando} dos selecionados já não estão em conflito`}
            </div>
            <p className="mt-1 text-muted-foreground">
              Alguém resolveu enquanto esta página estava aberta. Esta ferramenta só apaga
              cadastro em conflito, e recusa a operação inteira por causa dele — recarregue a
              mesa e refaça a seleção.
            </p>
          </div>
        )}

        {/* O AVISO DESTACADO (§4.3): apagar cadastro com vida própria é PERMITIDO — o
            Johnny decidiu assim —, mas nunca em silêncio. */}
        {resumo.comHistoricoReal.length > 0 && (
          <div className="rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm dark:border-amber-700/60 dark:bg-amber-950/30">
            <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
              <AlertTriangle className="size-4" />
              {resumo.comHistoricoReal.length === 1
                ? 'Um dos cadastros tem histórico próprio'
                : `${resumo.comHistoricoReal.length} cadastros têm histórico próprio`}
            </div>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {resumo.comHistoricoReal.map((l) => (
                <li key={l.ativoId}>
                  <strong>{l.filialNome}</strong>: {l.movimentacoesReais} movimentação(ões)
                  fora da carga do import
                  {l.termos > 0 && `, ${l.termos} termo(s)`}.
                </li>
              ))}
            </ul>
            <p className="mt-2 text-muted-foreground">
              Movimentação registrada por alguém no sistema é sinal de que este é o cadastro
              em uso. Confira antes de seguir.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="conflito-confirmacao">Para confirmar, digite exatamente:</Label>
          <p className="font-mono text-xs break-all text-muted-foreground">{esperado}</p>
          <Input
            id="conflito-confirmacao"
            value={confirmacao}
            autoComplete="off"
            spellCheck={false}
            placeholder={esperado}
            onChange={(e) => setConfirmacao(e.target.value)}
            disabled={executando}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="conflito-justificativa">
            Justificativa <span className="text-muted-foreground">(obrigatória)</span>
          </Label>
          <Textarea
            id="conflito-justificativa"
            value={justificativa}
            rows={3}
            placeholder="Por que este cadastro é o errado?"
            onChange={(e) => setJustificativa(e.target.value)}
            disabled={executando}
          />
          <p className="text-xs text-muted-foreground">
            {justificativaOk
              ? 'Fica registrada na trilha de auditoria, junto com a cópia do que foi apagado.'
              : `Faltam ${faltam} caractere(s) — é o que vai explicar esta exclusão depois que o cadastro não existir mais.`}
          </p>
        </div>

        <DialogFooter>
          <Button
            ref={cancelarRef}
            type="button"
            variant="ghost"
            onClick={onFechar}
            disabled={executando}
          >
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={!pronto} onClick={executar}>
            {executando
              ? 'Apagando…'
              : ids.length === 1
                ? 'Apagar cadastro'
                : `Apagar ${ids.length} cadastros`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
