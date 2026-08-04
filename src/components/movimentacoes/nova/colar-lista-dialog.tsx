'use client'

import { useRef, useState } from 'react'
import {
  ClipboardList,
  Check,
  Copy,
  Loader2,
  TriangleAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { StatusBadge } from '@/components/ativos/status-badge'
import {
  resolverPatrimoniosParaLote,
  type ResultadoResolucaoLote,
} from '@/lib/actions/movimentacoes'
import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import { mesclarAtivosNoLote } from '@/components/movimentacoes/nova/config'
import { rotuloCategoria, rotuloPatrimonio } from '@/lib/dominio'
import type { AtivoResumo } from '@/lib/queries/ativos'

// F10/M1 — "Colar lista" no passo Ativos: acaba com o lote montado um a um no
// combobox. O resolver (CONTRATO §1.5, dono W1) devolve 4 baldes e NAO aplica
// teto nem dedup contra o lote atual — isso e desta UI (`mesclarAtivosNoLote`).
//
// Patrimonio duplicado (§5) colado sem service tag vira escolha manual: nunca
// entra ativo por adivinhacao. Dos candidatos some quem ja esta no lote (ou
// quem acabou de entrar por outra linha, resolvido pela ST) — senao o operador
// escolheria um ativo que ja esta la.

// Set vazio ESTÁVEL para o default da prop: `new Set()` no default criaria uma
// referência nova a cada render do passo 1.
const VAZIO: ReadonlySet<string> = new Set()

function LinhaAtivo({ a, sufixo }: { a: AtivoResumo; sufixo?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium tabular-nums">
        {rotuloPatrimonio(a.patrimonio)}
      </span>
      {a.service_tag && (
        <span className="rounded bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
          ST {a.service_tag}
        </span>
      )}
      <span className="min-w-0 truncate text-muted-foreground">
        {[rotuloCategoria(a.categoria), a.modelo].filter(Boolean).join(' · ')}
      </span>
      <span className="ml-auto flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {a.filial_nome}
        </span>
        <StatusBadge status={a.status} className="text-[11px]" />
        {sufixo}
      </span>
    </div>
  )
}

// Lista copiavel (nao encontrados / invalidos): o operador leva o que sobrou
// para a planilha sem transcrever na mao.
function BlocoCopiavel({
  titulo,
  descricao,
  valores,
}: {
  titulo: string
  descricao: string
  valores: string[]
}) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    // Fora de contexto seguro o navigator.clipboard nem existe (mesmo cuidado
    // do CopiarPatrimonio da F9): sai em silencio em vez de quebrar.
    if (!navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(valores.join('\n'))
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Permissao negada pelo navegador — silencioso.
    }
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {titulo} ({valores.length})
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copiar}
          className="gap-1.5"
          aria-label={`Copiar ${titulo.toLowerCase()}`}
        >
          {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
          Copiar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{descricao}</p>
      <ul className="mt-2 space-y-0.5 font-mono text-xs tabular-nums">
        {valores.map((v) => (
          <li key={v} className="break-all">
            {v}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ColarListaDialog({
  lote,
  naOutraMetade = VAZIO,
  onAdicionar,
}: {
  lote: AtivoResumo[]
  // F26 — a metade OPOSTA do par troca/upgrade, quando a seção está ativa. Ela
  // conta duas vezes na aritmética desta prévia: ocupa lugar no teto (que é do
  // envio inteiro) e os ativos dela NÃO podem entrar no lote principal — o form
  // os recusa. Sem as duas contas aqui o botão prometia "Adicionar 2 ao lote
  // (30 de 30)" e entrava 1, ou nenhum, com o texto colado já apagado pelo fechar.
  naOutraMetade?: ReadonlySet<string>
  onAdicionar: (ativos: AtivoResumo[]) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [res, setRes] = useState<ResultadoResolucaoLote | null>(null)
  // patrimônio ambíguo -> id do candidato escolhido pelo operador.
  const [escolhas, setEscolhas] = useState<Record<string, string>>({})
  // Token da conferência corrente. O componente NÃO é desmontado ao fechar o
  // diálogo, então uma resposta em voo depois de fechar (ou depois de uma nova
  // conferência) repovoava o resultado: reabrir mostrava "Encontrados (12)" de
  // uma lista CANCELADA, com o botão primário habilitado — um clique injetava
  // ativos errados no lote. Só aplica `setRes` quem ainda for o token corrente.
  const requisicao = useRef(0)

  // Quem não pode entrar: já está no lote OU está na outra metade da troca. A
  // aritmética é a mesma para os dois; só o rótulo da linha muda.
  const idsNoLote = new Set(lote.map((a) => a.id))
  const idsBloqueados = new Set([...idsNoLote, ...naOutraMetade])
  const encontrados = res?.encontrados ?? []
  // Quem ja esta no lote nao entra de novo — mas continua visivel, marcado, para
  // o operador entender por que doze linhas coladas viraram nove ativos novos.
  const novos = encontrados.filter((a) => !idsBloqueados.has(a.id))
  const idsQueEntram = new Set(novos.map((a) => a.id))

  const ambiguos = (res?.ambiguos ?? [])
    .map((g) => ({
      patrimonio: g.patrimonio,
      candidatos: g.candidatos.filter(
        (c) => !idsBloqueados.has(c.id) && !idsQueEntram.has(c.id),
      ),
    }))
    .filter((g) => g.candidatos.length > 0)

  const escolhidos = ambiguos
    .map((g) => g.candidatos.find((c) => c.id === escolhas[g.patrimonio]))
    .filter((a): a is AtivoResumo => Boolean(a))

  // A aritmetica do teto e a MESMA do form (funcao pura compartilhada) — e o
  // teto EFETIVO desconta o que a outra metade da troca já ocupa.
  const teto = MAX_LOTE_MOVIMENTACAO - naOutraMetade.size
  const previa = mesclarAtivosNoLote(lote, [...novos, ...escolhidos], teto)
  const cabem = previa.adicionados.length
  const foraPeloTeto = previa.excedentes.length

  async function conferir() {
    const meu = ++requisicao.current
    setCarregando(true)
    setEscolhas({})
    try {
      const r = await resolverPatrimoniosParaLote(texto)
      if (meu !== requisicao.current) return
      setRes(r)
    } catch {
      // F19 — a action ja converte o que conhece em `erro` (nada de excecao
      // atravessando a fronteira), mas o TRANSPORTE ainda pode rejeitar (rede,
      // sessao morta). Sem o catch nao aparece nada: o botao volta ao normal e a
      // lista colada fica sem resposta. Vai pelo mesmo canal inline do arquivo —
      // e so para a conferencia corrente (uma resposta cancelada nao repovoa).
      if (meu !== requisicao.current) return
      setRes({
        erro: 'Não foi possível conferir a lista. Verifique sua conexão e tente de novo.',
        encontrados: [],
        ambiguos: [],
        naoEncontrados: [],
        invalidos: [],
      })
    } finally {
      if (meu === requisicao.current) setCarregando(false)
    }
  }

  function confirmar() {
    if (cabem === 0) return
    // Manda a SELECAO INTEIRA (nao a previa ja cortada): o corte pelo teto e o
    // aviso de quantos ficaram de fora sao do form, num lugar so — aqui a
    // previa serve para o operador ver o estrago ANTES de confirmar.
    onAdicionar([...novos, ...escolhidos])
    fechar(false)
  }

  function fechar(v: boolean) {
    setAberto(v)
    if (!v) {
      // Invalida a conferência em voo: o resultado que chegar depois é de uma
      // lista que o operador CANCELOU.
      requisicao.current += 1
      setTexto('')
      setRes(null)
      setEscolhas({})
      setCarregando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <ClipboardList className="size-4" />
          Colar lista
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-2xl"
        // O wizard usa Enter para avançar de passo (handler no <div> do form) e
        // o portal do Radix continua na ÁRVORE REACT do passo 1: sem isto, um
        // Enter aqui dentro pularia para o passo 2 com o diálogo aberto.
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.stopPropagation()
        }}
      >
        <DialogHeader className="border-b p-4">
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="size-4" />
            Colar lista de patrimônios
          </DialogTitle>
          <DialogDescription>
            Monte o lote de uma vez — até {MAX_LOTE_MOVIMENTACAO} ativos por
            movimentação.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[64vh] space-y-4 overflow-y-auto p-4">
          <div>
            <Label htmlFor="colar-lote" className="mb-2">
              Um patrimônio por linha — service tag opcional depois de vírgula,
              ponto e vírgula ou TAB
            </Label>
            <Textarea
              id="colar-lote"
              autoFocus
              rows={6}
              value={texto}
              // Mexeu no texto, o resultado anterior morre: ninguem adiciona ao
              // lote com base numa conferencia que nao vale mais.
              onChange={(e) => {
                setTexto(e.target.value)
                if (res) {
                  setRes(null)
                  setEscolhas({})
                }
              }}
              placeholder={
                'WAP0001234\nWAP0001235\tST-ABC123\nWAP0001236; ST-DEF456'
              }
              // `text-sm` puro (14px) dispara o zoom automático do iOS a cada
              // foco — e esta é justamente a caixa de quem cola/bipa do celular.
              // `text-base md:text-sm` é o padrão do próprio ui/textarea.
              className="font-mono text-base md:text-sm"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Dá para colar duas colunas do Excel direto (o TAB entre elas vira o
              separador). Leitor de código de barras também serve: cada bipada
              cai em uma linha nova.
            </p>
          </div>

          <Button
            type="button"
            onClick={conferir}
            disabled={carregando || texto.trim().length === 0}
            className="gap-2"
          >
            {carregando ? (
              <>
                {/* F19 — sem giro para quem pediu menos movimento: o rótulo
                    "Conferindo…" ao lado já diz que a ação está em curso. */}
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />{' '}
                Conferindo…
              </>
            ) : (
              'Conferir lista'
            )}
          </Button>

          {res?.erro && (
            <p className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {res.erro}
            </p>
          )}

          {res && !res.erro && (
            <div className="space-y-3">
              {/* Encontrados */}
              {encontrados.length > 0 && (
                <div className="rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    Encontrados ({encontrados.length})
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {encontrados.map((a) => (
                      <li key={a.id}>
                        <LinhaAtivo
                          a={a}
                          sufixo={
                            idsBloqueados.has(a.id) ? (
                              <span className="text-xs text-muted-foreground">
                                {idsNoLote.has(a.id)
                                  ? 'já no lote'
                                  : 'já na outra metade da troca'}
                              </span>
                            ) : null
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Ambíguos — patrimônio duplicado (§5) sem service tag na linha */}
              {ambiguos.map((g) => (
                <fieldset
                  key={g.patrimonio}
                  className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40"
                >
                  <legend className="flex items-center gap-1.5 px-1 text-sm font-medium text-amber-900 dark:text-amber-200">
                    <TriangleAlert className="size-4" />
                    {g.patrimonio} — patrimônio duplicado: escolha qual
                  </legend>
                  <div className="mt-1 space-y-1.5">
                    {g.candidatos.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 hover:bg-amber-100/60 dark:hover:bg-amber-900/30"
                      >
                        <input
                          type="radio"
                          name={`ambiguo-${g.patrimonio}`}
                          checked={escolhas[g.patrimonio] === c.id}
                          onChange={() =>
                            setEscolhas((e) => ({ ...e, [g.patrimonio]: c.id }))
                          }
                          className="mt-1 size-4 shrink-0 accent-amber-600 dark:accent-amber-500"
                        />
                        <span className="min-w-0 flex-1">
                          <LinhaAtivo a={c} />
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 px-1 text-xs text-amber-900/80 dark:text-amber-200/80">
                    Nada entra sem escolha. Da próxima vez, cole a service tag na
                    mesma linha para resolver sozinho.
                  </p>
                </fieldset>
              ))}

              {res.naoEncontrados.length > 0 && (
                <BlocoCopiavel
                  titulo="Não encontrados"
                  descricao="Não existe ativo com este patrimônio no sistema."
                  valores={res.naoEncontrados}
                />
              )}

              {res.invalidos.length > 0 && (
                <BlocoCopiavel
                  titulo="Linhas inválidas"
                  descricao="Não dá para ler um patrimônio nestas linhas."
                  valores={res.invalidos}
                />
              )}

              {encontrados.length === 0 &&
                ambiguos.length === 0 &&
                res.naoEncontrados.length === 0 &&
                res.invalidos.length === 0 && (
                  <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                    Nenhum patrimônio na lista.
                  </p>
                )}

              {foraPeloTeto > 0 && (
                <p className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                  {foraPeloTeto}{' '}
                  {foraPeloTeto === 1 ? 'ativo fica' : 'ativos ficam'} de fora: o
                  lote aceita {MAX_LOTE_MOVIMENTACAO} e já tem {lote.length}
                  {naOutraMetade.size > 0
                    ? ` — mais ${naOutraMetade.size} na outra metade da troca`
                    : ''}
                  . Registre o resto em outro lote.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t p-4">
          <Button type="button" variant="ghost" onClick={() => fechar(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirmar} disabled={cabem === 0}>
            {cabem === 0
              ? 'Adicionar ao lote'
              : // A contagem inclui o que a outra metade da troca ocupa: a
                // promessa do botão tem de bater com o que o form vai aceitar.
                `Adicionar ${cabem} ao lote (${lote.length + naOutraMetade.size + cabem} de ${MAX_LOTE_MOVIMENTACAO})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
