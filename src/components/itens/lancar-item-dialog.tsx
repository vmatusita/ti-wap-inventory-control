'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { lancarItens } from '@/lib/actions/itens'
import {
  MAX_LINHAS_LOTE_ITEM,
  errosPorLinhaDoLote,
  loteLancamentoItemSchema,
} from '@/lib/validators/item'
import { hojeISO } from '@/lib/format'
import {
  TIPO_LANCAMENTO_META,
  descricaoTipoLancamento,
  type TipoLancamento,
} from '@/lib/dominio'
import { EVENTO_LANCAR_ITEM } from './lancar-item-evento'
import { ItemCombobox } from './item-combobox'
import type { ItemCatalogo, UltimoLancamento } from '@/lib/queries/itens'
import type { Filial } from '@/lib/queries/filiais'

const TIPOS: TipoLancamento[] = ['entrada', 'saida', 'reserva', 'liberacao', 'retorno', 'ajuste']

// Uma linha do carrinho (F10 · I1). `uid` é só a chave estável do React — o
// índice não serve, porque remover uma linha do meio remontaria as seguintes.
type LinhaCarrinho = { uid: number; itemId: number | null; quantidade: string; erro?: string }

// Lançamento de quantidade (OS 3.3.2 · F10 I1/I2): dialog enxuto, meta ≤15s.
// A NF com 5 itens vira UM lançamento com 5 linhas sobre os campos comuns
// (filial, tipo, data, chamado, colaborador, observação) — antes eram 5 idas ao
// dialog. "Repetir último" pré-preenche tudo menos a quantidade. Atalho `L` abre
// de qualquer lugar de /itens (o `N` já é da movimentação de ativos — decisão
// registrada em DECISOES).
export function LancarItemDialog({
  itens,
  filiais,
  ultimo,
  abrirAoMontar = false,
}: {
  itens: ItemCatalogo[]
  filiais: Filial[]
  ultimo: UltimoLancamento | null
  // `?lancar=1` na URL (F12-W4-08): a paleta de comandos anuncia "Lançar item"
  // no grupo AÇÕES, mas só navegava para /itens — o operador caía na tela igual
  // à navegação normal e ia procurar o botão, que é justamente o gesto que a
  // paleta existe para poupar. O param é lido no Server Component (que já
  // valida searchParams) e chega aqui como flag: nada de `useSearchParams`.
  abrirAoMontar?: boolean
}) {
  const router = useRouter()
  // `abrirAoMontar` entra no ESTADO INICIAL, não num efeito: a paleta navega
  // para /itens?lancar=1 vinda de outra tela, então o dialog sempre monta do
  // zero neste caminho. (Já estando em /itens, a paleta dispara o CustomEvent —
  // ver `paleta-comandos.tsx` —, que é o canal de "sistema externo" que o
  // dialog já escutava desde a F9.)
  const [aberto, setAberto] = useState(abrirAoMontar)
  const [linhas, setLinhas] = useState<LinhaCarrinho[]>([
    { uid: 1, itemId: null, quantidade: '' },
  ])
  const [filialId, setFilialId] = useState<number | null>(filiais[0]?.id ?? null)
  const [tipo, setTipo] = useState<TipoLancamento>('entrada')
  const [chamado, setChamado] = useState('')
  const [colaborador, setColaborador] = useState('')
  const [data, setData] = useState(hojeISO())
  const [observacao, setObservacao] = useState('')
  // Itens criados inline nesta sessão do dialog: o `router.refresh()` só repassa
  // a prop no próximo render do servidor, e o operador precisa ver o item AGORA.
  const [criadosLocal, setCriadosLocal] = useState<ItemCatalogo[]>([])
  const [enviando, start] = useTransition()
  const proximoUid = useRef(1)
  const qtdRef = useRef<HTMLInputElement>(null)
  // Preset vindo da linha do saldo (I6): quando o dialog abre por causa dele, o
  // foco inicial vai para a quantidade em vez do primeiro campo.
  const focarQtdAoAbrir = useRef(false)

  const catalogo = useMemo(() => {
    if (!criadosLocal.length) return itens
    const ids = new Set(itens.map((i) => i.id))
    return [...itens, ...criadosLocal.filter((c) => !ids.has(c.id))]
  }, [itens, criadosLocal])

  function novaLinha(itemId: number | null = null): LinhaCarrinho {
    proximoUid.current += 1
    return { uid: proximoUid.current, itemId, quantidade: '' }
  }

  // Atalho `L` — abre o dialog quando o foco não está num campo de texto.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat || aberto) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key !== 'l' && e.key !== 'L') return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (el?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (el?.getAttribute('role') === 'combobox') return
      e.preventDefault()
      setAberto(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aberto])

  // "Lançar da linha" (I6) — o botão de cada linha da tabela de saldos dispara o
  // CustomEvent; aqui o dialog abre já com item + filial preenchidos (na PRIMEIRA
  // linha do carrinho). O preset vence o estado anterior do form (os demais
  // campos voltam ao padrão); o atalho `L` e o "Repetir último" seguem intactos
  // (só reagem a ação do usuário).
  useEffect(() => {
    function onLancarItem(e: WindowEventMap[typeof EVENTO_LANCAR_ITEM]) {
      const { itemId: presetItem, filialId: presetFilial } = e.detail
      // `null` = abrir VAZIO (paleta de comandos, F12-W4-08). Qualquer outro
      // valor não-finito continua sendo lixo e é ignorado.
      const semPreset = presetItem === null
      if (!semPreset && !Number.isFinite(presetItem)) return
      proximoUid.current += 1
      setLinhas([{ uid: proximoUid.current, itemId: semPreset ? null : presetItem, quantidade: '' }])
      // Preset SEM filial (visão por filial, ou consolidado sem recorte): o
      // campo fica VAZIO, nunca herdando a primeira filial da lista nem a do
      // lançamento anterior. O "+" é da LINHA, não da célula — escolher uma
      // filial por conta própria grava no lugar errado em silêncio, e o foco
      // pula direto para a quantidade (abaixo), então ninguém confere o campo.
      // Sem filial o Zod barra o envio ("Escolha a filial") em vez de gravar.
      setFilialId(
        typeof presetFilial === 'number' && Number.isFinite(presetFilial)
          ? presetFilial
          : null,
      )
      setTipo('entrada')
      setChamado('')
      setColaborador('')
      setData(hojeISO())
      setObservacao('')
      // Sem preset não há quantidade a digitar ainda: o foco fica no começo do
      // formulário (o item é o primeiro campo), como no botão "Lançar" e no `L`.
      if (semPreset) {
        setAberto(true)
        return
      }
      if (aberto) {
        setTimeout(() => qtdRef.current?.focus(), 0)
      } else {
        focarQtdAoAbrir.current = true
        setAberto(true)
      }
    }
    window.addEventListener(EVENTO_LANCAR_ITEM, onLancarItem)
    return () => window.removeEventListener(EVENTO_LANCAR_ITEM, onLancarItem)
  }, [aberto])

  // `?lancar=1` (F12-W4-08) já abriu o dialog no estado inicial; aqui só some
  // com o gatilho da URL, para um F5 (ou o botão voltar) não reabrir o dialog
  // sem ninguém pedir. `history.replaceState` e não `router.replace`: aquele
  // refaria a leitura do servidor inteira só para limpar um param, e este
  // preserva os demais filtros do endereço. Nenhum `setState` aqui — o efeito
  // só fala com o histórico do navegador, que é o sistema externo.
  useEffect(() => {
    if (!abrirAoMontar) return
    const url = new URL(window.location.href)
    if (!url.searchParams.has('lancar')) return
    url.searchParams.delete('lancar')
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
  }, [abrirAoMontar])

  function limpar() {
    setLinhas([novaLinha()])
    setTipo('entrada')
    setChamado('')
    setColaborador('')
    setData(hojeISO())
    setObservacao('')
  }

  function repetirUltimo() {
    if (!ultimo) return
    setLinhas([novaLinha(ultimo.item_id)])
    setFilialId(ultimo.filial_id)
    setTipo(ultimo.tipo)
    setChamado(ultimo.chamado ?? '')
    setColaborador(ultimo.colaborador ?? '')
    setData(hojeISO())
    setObservacao('')
    setTimeout(() => qtdRef.current?.focus(), 0)
  }

  function atualizarLinha(uid: number, campos: Partial<LinhaCarrinho>) {
    setLinhas((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...campos, erro: undefined } : l)))
  }

  function adicionarLinha() {
    setLinhas((ls) => (ls.length >= MAX_LINHAS_LOTE_ITEM ? ls : [...ls, novaLinha()]))
  }

  function removerLinha(uid: number) {
    setLinhas((ls) => (ls.length <= 1 ? ls : ls.filter((l) => l.uid !== uid)))
  }

  function itemCriado(item: ItemCatalogo) {
    setCriadosLocal((c) => (c.some((i) => i.id === item.id) ? c : [...c, item]))
    router.refresh()
  }

  const exigeChamado = tipo === 'reserva' || tipo === 'liberacao'
  const exigeObs = tipo === 'ajuste'

  function salvar() {
    const input = {
      filial_id: filialId ?? 0,
      tipo,
      linhas: linhas.map((l) => ({
        item_id: l.itemId ?? 0,
        quantidade: l.quantidade === '' ? NaN : Number(l.quantidade),
      })),
      chamado: chamado || undefined,
      colaborador: colaborador || undefined,
      data,
      observacao: observacao || undefined,
    }
    const parsed = loteLancamentoItemSchema.safeParse(input)
    if (!parsed.success) {
      const porLinha = errosPorLinhaDoLote(parsed.error.issues)
      setLinhas((ls) => ls.map((l, i) => ({ ...l, erro: porLinha.get(i) })))
      toast.error(parsed.error.issues[0]?.message ?? 'Revise os campos.')
      return
    }
    const enviadas = linhas
    start(async () => {
      // F19 — sem o catch, o throw de rede some dentro do startTransition e o
      // operador fica sem feedback (ou a tela toda é apagada pelo boundary). Os
      // erros de negócio (`erroGeral` e o resultado por linha) seguem intactos
      // abaixo; o catch cobre só o throw cru.
      try {
        const res = await lancarItens(parsed.data)
        if (res.erroGeral) {
          toast.error(res.erroGeral)
          return
        }
        if (res.ok) {
          toast.success(
            res.resultados.length > 1
              ? `${res.resultados.length} lançamentos registrados.`
              : 'Lançamento registrado.',
          )
          limpar()
          setAberto(false)
          router.refresh()
          return
        }
        // Sucesso parcial: cada linha é independente (o trigger de saldo julga uma
        // a uma). Mantém no carrinho SÓ as que falharam, com o erro na própria
        // linha — espelho do lote de ativos.
        const falhas = enviadas
          .map((l, i) => ({ linha: l, resultado: res.resultados[i] }))
          .filter((p) => !p.resultado || !p.resultado.ok)
        const registradas = res.resultados.filter((r) => r.ok).length
        if (falhas.length) {
          setLinhas(falhas.map((p) => ({ ...p.linha, erro: p.resultado?.erro })))
        }
        if (registradas > 0) {
          toast.warning(
            `${registradas} de ${res.resultados.length} linhas lançadas. Corrija o que falhou.`,
          )
          router.refresh()
        } else {
          toast.error(falhas[0]?.resultado?.erro ?? 'Nenhuma linha foi lançada.')
        }
      } catch {
        // O carrinho inteiro se perdeu no caminho: nenhuma linha chegou ao banco.
        toast.error(
          'Não foi possível lançar — nenhum lançamento foi registrado. Verifique sua conexão e tente de novo.',
        )
      }
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="size-4" />
          Lançar
          <kbd className="ml-1 hidden rounded border bg-background/20 px-1 text-[10px] sm:inline">
            L
          </kbd>
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl"
        onOpenAutoFocus={(e) => {
          if (!focarQtdAoAbrir.current) return
          focarQtdAoAbrir.current = false
          e.preventDefault()
          requestAnimationFrame(() => qtdRef.current?.focus())
        }}
      >
        <DialogHeader>
          <DialogTitle>Lançar quantidade</DialogTitle>
          <DialogDescription>
            Entrada, liberação, atrelar, devolução, retorno ou ajuste — vários itens no mesmo
            lançamento.
          </DialogDescription>
        </DialogHeader>

        {ultimo && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit gap-1.5"
            onClick={repetirUltimo}
            disabled={enviando}
          >
            <RotateCcw className="size-3.5" />
            Repetir último
          </Button>
        )}

        <div className="space-y-3">
          {/* Carrinho: uma linha por item (mesma filial/tipo/data/chamado) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Itens</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {linhas.length}/{MAX_LINHAS_LOTE_ITEM}
              </span>
            </div>
            {linhas.map((l, i) => (
              <div key={l.uid} className="space-y-1">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <ItemCombobox
                      itens={catalogo}
                      valor={l.itemId}
                      onSelecionar={(id) => atualizarLinha(l.uid, { itemId: id })}
                      onItemCriado={itemCriado}
                      desabilitado={enviando}
                      descricaoAcessivel={`Item ${i + 1} do lançamento`}
                    />
                  </div>
                  <Input
                    ref={i === 0 ? qtdRef : undefined}
                    type="number"
                    inputMode="numeric"
                    aria-label={`Quantidade do item ${i + 1}`}
                    className="min-h-10 w-24 shrink-0"
                    value={l.quantidade}
                    onChange={(e) => atualizarLinha(l.uid, { quantidade: e.target.value })}
                    placeholder={exigeObs ? '-3' : '10'}
                    disabled={enviando}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover o item ${i + 1} do lançamento`}
                    className="size-10 shrink-0"
                    onClick={() => removerLinha(l.uid)}
                    disabled={enviando || linhas.length <= 1}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                {l.erro && (
                  <p className="pl-1 text-xs text-red-600 dark:text-red-400">{l.erro}</p>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10 gap-1.5 sm:min-h-0"
                onClick={adicionarLinha}
                disabled={enviando || linhas.length >= MAX_LINHAS_LOTE_ITEM}
              >
                <Plus className="size-3.5" />
                Adicionar item
              </Button>
              {exigeObs && (
                <span className="text-xs text-muted-foreground">quantidade negativa = baixa</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Filial</Label>
              <Select
                value={filialId ? String(filialId) : ''}
                onValueChange={(v) => setFilialId(Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Filial" />
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
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoLancamento)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LANCAMENTO_META[t].rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {descricaoTipoLancamento(tipo)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lanc-chamado">
                Chamado{exigeChamado ? '' : ' (opcional)'}
              </Label>
              <Input
                id="lanc-chamado"
                inputMode="numeric"
                value={chamado}
                onChange={(e) => setChamado(e.target.value)}
                placeholder="nº do chamado"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lanc-data">Data</Label>
              <Input
                id="lanc-data"
                type="date"
                max={hojeISO()}
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lanc-colab">Colaborador (opcional)</Label>
            <Input
              id="lanc-colab"
              value={colaborador}
              onChange={(e) => setColaborador(e.target.value)}
              placeholder="a quem se destina"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lanc-obs">
              Observação{exigeObs ? ' (justificativa do ajuste)' : ' (opcional)'}
            </Label>
            <Textarea
              id="lanc-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder={exigeObs ? 'Por que o ajuste?' : ''}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={enviando}>
            {enviando
              ? 'Salvando…'
              : linhas.length > 1
                ? `Lançar ${linhas.length} itens`
                : 'Lançar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
