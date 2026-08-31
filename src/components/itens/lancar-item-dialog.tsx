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
import { buscarSaldosItens, lancarItens, type SaldosPorItem } from '@/lib/actions/itens'
import { CampoColaborador } from '@/components/movimentacoes/nova/campo-colaborador'
import {
  MAX_LINHAS_LOTE_ITEM,
  errosPorLinhaDoLote,
  exigeChamado,
  loteLancamentoItemSchema,
} from '@/lib/validators/item'
import { hojeISO } from '@/lib/format'
import {
  TIPO_LANCAMENTO_META,
  descricaoTipoLancamento,
  pillTipoLancamento,
  type TipoLancamento,
} from '@/lib/dominio'
import {
  DICA_ACERTO_CONFERENCIA,
  GRUPOS_ESCOLHA,
  MSG_ESCOLHA_TIPO,
  PERGUNTA_ESCOLHA,
  TAREFA_DO_TIPO,
  grupoDoTipo,
  grupoPorChave,
  type GrupoEscolha,
} from '@/lib/itens/escolha-tipo'
import {
  avisoQuantidadeInvalida,
  previewEstoque,
  textoPreview,
} from '@/lib/itens/efeito-lancamento'
import { AvisoSemFilialDeEscrita } from '@/components/layout/aviso-sem-escrita'
import { EVENTO_LANCAR_ITEM } from './lancar-item-evento'
import { ItemCombobox } from './item-combobox'
import {
  ROTULO_ACRESCENTAR,
  ROTULO_BAIXAR,
  aplicarSinal,
  moduloDeQuantidade,
  sentidoDeQuantidade,
} from '@/lib/itens/sinal-ajuste'
import { cn } from '@/lib/utils'
import type { ItemCatalogo, UltimoLancamento } from '@/lib/queries/itens'
import type { Filial } from '@/lib/queries/filiais'

// Uma linha do carrinho (F10 · I1). `uid` é só a chave estável do React — o
// índice não serve, porque remover uma linha do meio remontaria as seguintes.
type LinhaCarrinho = { uid: number; itemId: number | null; quantidade: string; erro?: string }

// Lançamento de quantidade (OS 3.3.2 · F10 I1/I2): dialog enxuto, meta ≤15s.
// A NF com 5 itens vira UM lançamento com 5 linhas sobre os campos comuns
// (filial, tipo, data, chamado, colaborador, observação) — antes eram 5 idas ao
// dialog. "Repetir último" pré-preenche tudo menos a quantidade. Atalho `L` abre
// de qualquer lugar de /itens (o `N` já é da movimentação de ativos — decisão
// registrada em DECISOES).
//
// 19/08/2026 (avulsa — "está confuso o controle de itens"): o TIPO deixou de
// ser um select plano de seis nomes com default silencioso 'entrada' e virou a
// escolha guiada de `lib/itens/escolha-tipo.ts` — "O que aconteceu?" e, quando
// saiu/voltou, "com quem estava?". Sem resposta não há tipo (nada de gravar
// Entrada porque ninguém tocou no campo); o par certo (Liberação↔Retorno,
// Atrelar↔Devolução) sai da resposta, não da memória. Junto: o saldo da filial
// subiu do combobox para cá (UMA leitura por troca de filial, não uma por
// linha) e cada linha ganhou a prévia "Estoque na filial: 14 → 12"
// (`efeito-lancamento.ts`) — estouro de estoque aparece ANTES do envio, como a
// transferência já fazia. Quem recusa de verdade continua sendo o trigger.
export function LancarItemDialog({
  itens,
  filiais,
  ultimo,
  abrirAoMontar = false,
  podeCriarItem = false,
}: {
  itens: ItemCatalogo[]
  // F21 — só as filiais em que este cargo ESCREVE (recorte feito na página). Com
  // uma única filial vinculada, ela já entra pré-selecionada pelo `useState`
  // abaixo; com nenhuma, o campo explica em vez de abrir um select vazio.
  filiais: Filial[]
  ultimo: UltimoLancamento | null
  // `?lancar=1` na URL (F12-W4-08): a paleta de comandos anuncia "Lançar item"
  // no grupo AÇÕES, mas só navegava para /itens — o operador caía na tela igual
  // à navegação normal e ia procurar o botão, que é justamente o gesto que a
  // paleta existe para poupar. O param é lido no Server Component (que já
  // valida searchParams) e chega aqui como flag: nada de `useSearchParams`.
  abrirAoMontar?: boolean
  // F21 — criar item no catálogo sem sair do lançamento é ESCRITA DE CATÁLOGO, e
  // catálogo é só de admin (ADR-002 §3; `criarItemInline` exige `exigirAdmin`).
  // Para operador o combobox continua escolhendo o que já existe.
  podeCriarItem?: boolean
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
  // O tipo NASCE VAZIO (era 'entrada'): com default silencioso, quem abria o
  // dialog para registrar uma entrega e não tocava no campo gravava o estoque
  // para CIMA. Agora o salvar cobra a resposta (`MSG_ESCOLHA_TIPO`).
  const [tipo, setTipo] = useState<TipoLancamento | null>(null)
  // O grupo aberto na primeira pergunta ENQUANTO a segunda não foi respondida
  // ("Saiu da prateleira" clicado, "pessoa ou chamado?" pendente). Com tipo
  // escolhido, o grupo é DERIVADO dele — ver `grupoAtual`.
  const [grupoAberto, setGrupoAberto] = useState<GrupoEscolha | null>(null)
  const [erroTipo, setErroTipo] = useState<string | null>(null)
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

  // Saldo da FILIAL, por item — parecido com o mecanismo do diálogo de
  // transferência (F31), com uma diferença: lá o componente inteiro mora
  // dentro do `DialogContent`, que o Radix desmonta ao fechar; aqui não (ver
  // achado 4 abaixo), então o efeito precisa se guardar sozinho. O mapa desce
  // por prop para o combobox de CADA linha (antes cada combobox buscava o
  // seu — dez linhas, dez leituras iguais). `pedido` descarta resposta
  // atrasada de uma filial que já não é a selecionada; `saldosDe` marca de
  // qual filial é o mapa (sem ela, trocar de filial mostraria por um instante
  // o saldo da anterior).
  // ⚠ O LANÇAMENTO INVALIDA O MAPA: sem `recarga`, reabrir depois de lançar
  // mostraria o saldo de antes — com a prévia aprovando um envio que o
  // trigger recusaria.
  const [saldos, setSaldos] = useState<SaldosPorItem>({})
  const [saldosDe, setSaldosDe] = useState<number | null>(null)
  const pedido = useRef(0)
  const [recarga, setRecarga] = useState(0)

  // 19/08/2026 (revisão) — achado 4: este `LancarItemDialog` é montado direto
  // na página, fora do `DialogContent` (veja `src/app/(app)/itens/page.tsx`,
  // dentro de `{escreve && (...)}`) — o Radix só desmonta o CONTEÚDO do
  // diálogo, não o componente que o declara. Sem o `if (!aberto) return`
  // abaixo, toda visita a /itens disparava esta Server Action para uma prévia
  // que nenhum pixel da tela chegava a mostrar. Agora é uma chamada por
  // ABERTURA do diálogo e por troca de filial ENQUANTO ele está aberto —
  // nunca no load da página. Conferindo o resto do fluxo com essa guarda:
  // (a) ao abrir, `aberto` vira `true` e o efeito busca o saldo da filial
  // atual; (b) no sucesso do lançamento, `salvar()` faz `limpar()` →
  // `setAberto(false)` → `setRecarga(r => r + 1)` — com o diálogo já fechado
  // o efeito NÃO refaz a leitura na hora, só na próxima abertura, o que é
  // MELHOR (poupa um POST que ninguém veria) e continua honrando o aviso
  // acima; (c) na falha parcial (`registradas > 0`) o diálogo continua
  // aberto e o mesmo `setRecarga` faz o efeito refazer a leitura NA HORA,
  // porque `aberto` segue `true`.
  useEffect(() => {
    if (!aberto || filialId == null) return
    const meu = ++pedido.current
    buscarSaldosItens(filialId)
      .then((mapa) => {
        if (meu !== pedido.current) return
        setSaldos(mapa)
        setSaldosDe(filialId)
      })
      .catch(() => {
        // Sem número chutado: a prévia e o combobox ficam sem saldo, só isso.
        if (meu !== pedido.current) return
        setSaldos({})
        setSaldosDe(filialId)
      })
  }, [aberto, filialId, recarga])

  const saldosAtuais = filialId != null && saldosDe === filialId ? saldos : {}

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

  // O tipo muda por um caminho só — botão da escolha, "Repetir último", preset
  // ou limpeza. Fora do Ajuste não existe alternador de sinal, então trocar
  // para outro tipo (ou para nenhum) não pode deixar um "-" preso na linha
  // (ITN-05b): o campo voltaria a exigir a tecla de menos para corrigir.
  function definirTipo(novo: TipoLancamento | null) {
    setTipo(novo)
    setErroTipo(null)
    if (novo !== 'ajuste') {
      setLinhas((ls) => ls.map((l) => ({ ...l, quantidade: moduloDeQuantidade(l.quantidade) })))
    }
  }

  function escolherGrupo(chave: GrupoEscolha) {
    const g = grupoPorChave(chave)
    if (g.tipos.length === 1) {
      // "Chegou" e "Acerto" têm um tipo só: a primeira resposta já decide.
      setGrupoAberto(null)
      definirTipo(g.tipos[0])
      return
    }
    // "Saiu"/"Voltou" abrem a segunda pergunta. Trocar de grupo invalida o tipo
    // anterior; reclicar o grupo do tipo atual mantém a escolha.
    setGrupoAberto(chave)
    setErroTipo(null)
    if (tipo && grupoDoTipo(tipo).chave !== chave) definirTipo(null)
  }

  // Com tipo escolhido o grupo aceso é DERIVADO dele (fonte única); o estado
  // `grupoAberto` só existe para o instante entre as duas perguntas.
  const grupoAtual: GrupoEscolha | null = tipo ? grupoDoTipo(tipo).chave : grupoAberto
  // F41 — a segunda pergunta MORREU: com o par reserva/liberacao fora da tela, cada
  // grupo tem um tipo só e não há o que desempatar. A derivação passou a olhar o
  // GRUPO (tem pergunta? tem mais de um tipo oferecido?) em vez de listar 'saiu' e
  // 'voltou' pelo nome — assim o bloco some sozinho agora, e reaparece sozinho se um
  // dia um grupo voltar a oferecer dois tipos.
  const grupoDoAtual = grupoAtual ? grupoPorChave(grupoAtual) : null
  const grupoDuplo =
    grupoDoAtual && grupoDoAtual.pergunta && grupoDoAtual.tipos.length > 1
      ? grupoDoAtual
      : null

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
      // O preset traz ITEM, nunca intenção: o tipo fica sem resposta (era
      // 'entrada' — o default silencioso que esta correção existe para matar).
      setTipo(null)
      setGrupoAberto(null)
      setErroTipo(null)
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
    setTipo(null)
    setGrupoAberto(null)
    setErroTipo(null)
    setChamado('')
    setColaborador('')
    setData(hojeISO())
    setObservacao('')
  }

  function repetirUltimo() {
    if (!ultimo) return
    setLinhas([novaLinha(ultimo.item_id)])
    // F21 — o último lançamento pode ter sido feito numa filial que este cargo
    // JÁ NÃO escreve (vínculo removido depois): repetir com ela deixaria o Select
    // sem valor visível e o Zod barraria no envio sem dizer por quê. Mantém a
    // filial atual e o operador escolhe. Mesma guarda que a memória de defaults
    // da compra já fazia (`nova-compra-form`).
    if (filiais.some((f) => f.id === ultimo.filial_id)) {
      setFilialId(ultimo.filial_id)
    }
    setGrupoAberto(null)
    definirTipo(ultimo.tipo)
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

  // As regras por tipo vêm do validator (fonte única com o servidor): chamado
  // em Atrelar/Devolução, justificativa no Ajuste. Sem tipo, nenhuma vale.
  const precisaChamado = tipo != null && exigeChamado(tipo)
  const exigeObs = tipo === 'ajuste'

  // O rótulo do Colaborador acompanha a resposta: numa Liberação, "quem ficou
  // com o item" é o dado útil para o histórico. 19/08/2026 (revisão) —
  // achado 9: mas o campo CONTINUA opcional no Zod, e neste mesmo arquivo a
  // ausência de "(opcional)" é justamente a convenção que marca campo
  // obrigatório (`Chamado{precisaChamado ? '' : ' (opcional)'}` logo abaixo).
  // Sem o sufixo, o operador lia "Colaborador (quem ficou com o item)" ao
  // lado de "Chamado (opcional)" e concluía, pela convenção da própria tela,
  // que o colaborador era obrigatório — reforçado pelo aviso âmbar logo
  // abaixo. Restaurada a marca de opcional, no mesmo formato que o ramo
  // 'retorno' já usa; o aviso âmbar continua sendo um empurrão, não uma
  // exigência.
  const rotuloColaborador =
    tipo === 'saida'
      ? 'Colaborador (quem ficou com o item — opcional)'
      : tipo === 'retorno'
        ? 'Colaborador (quem devolveu — opcional)'
        : 'Colaborador (opcional)'

  function salvar() {
    if (!tipo) {
      setErroTipo(MSG_ESCOLHA_TIPO)
      toast.error(`${MSG_ESCOLHA_TIPO}.`)
      return
    }
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
          mudarAberto(false)
          setRecarga((r) => r + 1)
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
          setRecarga((r) => r + 1)
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

  // 19/08/2026 (revisão) — achado 8: `erroTipo` só zerava em `limpar()` e em
  // `definirTipo()`. Sem isso, clicar em "Lançar" sem responder "O que
  // aconteceu?", ver o alerta vermelho, desistir e fechar deixava o erro vivo —
  // reabrir o diálogo já nascia acusando uma falha que não existe, um
  // `role="alert"` que leitor de tela anuncia à toa. Só o ERRO some ao fechar,
  // nunca um `limpar()` inteiro: o resto do estado sobreviver ao fechar é
  // proposital ("Repetir último" e o rascunho do carrinho dependem disso).
  //
  // ⚠ FUNÇÃO ÚNICA, e não um handler inline no `onOpenChange`: o Radix só
  // chama `onOpenChange` quando é ELE quem fecha (Esc, clique fora, o X do
  // `DialogPrimitive.Close`). O botão "Cancelar" do rodapé fecha por conta
  // própria, e um `setAberto(false)` cru ali pularia a limpeza — deixando o
  // caminho MAIS comum de desistência com o defeito que este achado corrigiu.
  // Todo caminho de fechamento passa por aqui.
  function mudarAberto(v: boolean) {
    setAberto(v)
    if (!v) setErroTipo(null)
  }

  return (
    <Dialog open={aberto} onOpenChange={mudarAberto}>
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
            Diga o que aconteceu, confira o efeito no estoque e salve — vários itens no mesmo
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
            {linhas.map((l, i) => {
              const quantidadeNum = l.quantidade === '' ? 0 : Number(l.quantidade)
              // Prévia do efeito (19/08/2026): item + quantidade + tipo + saldo
              // carregado → "Estoque na filial: 14 → 12". `null` = calada (nada
              // digitado, saldo ainda carregando, quantidade inválida) — a
              // validação fala por ela nesses casos.
              const previa =
                tipo && l.itemId != null
                  ? previewEstoque(tipo, quantidadeNum, saldosAtuais[l.itemId])
                  : null
              // 19/08/2026 (revisão) — achado 14: fora do Ajuste, uma
              // quantidade negativa fazia `previewEstoque` devolver `null` (a
              // prévia não decide nada — quem recusa de verdade é o trigger)
              // e a prévia que estava visível sumia SEM explicação; o erro só
              // aparecia no envio, pelo Zod. `avisoQuantidadeInvalida` cobre
              // esse buraco. Mutuamente exclusivo com `previa` por
              // construção (quando há aviso, `previewEstoque` já devolveu
              // null) — o JSX abaixo garante isso também na renderização.
              const aviso = tipo ? avisoQuantidadeInvalida(tipo, quantidadeNum) : null
              return (
                <div key={l.uid} className="space-y-1">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <ItemCombobox
                        itens={catalogo}
                        valor={l.itemId}
                        onSelecionar={(id) => atualizarLinha(l.uid, { itemId: id })}
                        onItemCriado={itemCriado}
                        desabilitado={enviando}
                        podeCriarItem={podeCriarItem}
                        descricaoAcessivel={`Item ${i + 1} do lançamento`}
                        saldos={saldosAtuais}
                      />
                    </div>
                    <Input
                      ref={i === 0 ? qtdRef : undefined}
                      type="number"
                      inputMode="numeric"
                      aria-label={`Quantidade do item ${i + 1}`}
                      className="min-h-10 w-24 shrink-0"
                      // ITN-05b — no Ajuste o campo só recebe o MÓDULO: o
                      // teclado numérico do iOS não tem tecla de menos, e o
                      // sinal vira o alternador logo abaixo.
                      value={exigeObs ? moduloDeQuantidade(l.quantidade) : l.quantidade}
                      onChange={(e) => {
                        const novoValor = exigeObs
                          ? aplicarSinal(e.target.value, sentidoDeQuantidade(l.quantidade))
                          : e.target.value
                        atualizarLinha(l.uid, { quantidade: novoValor })
                      }}
                      placeholder={exigeObs ? '3' : '10'}
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
                  {/* ITN-05b — alternador por linha: aplica o sinal sobre o
                      módulo já digitado, sem exigir a tecla de menos. Estado
                      default "+ Acrescentar" (`sentidoDeQuantidade('')`). */}
                  {exigeObs && (
                    <div
                      role="group"
                      aria-label={`Sinal do ajuste do item ${i + 1}`}
                      className="flex gap-1.5 pl-1"
                    >
                      <Button
                        type="button"
                        size="sm"
                        variant={sentidoDeQuantidade(l.quantidade) === 'positivo' ? 'default' : 'outline'}
                        aria-pressed={sentidoDeQuantidade(l.quantidade) === 'positivo'}
                        className="min-h-10 flex-1 sm:min-h-8"
                        onClick={() =>
                          atualizarLinha(l.uid, { quantidade: aplicarSinal(l.quantidade, 'positivo') })
                        }
                        disabled={enviando}
                      >
                        {ROTULO_ACRESCENTAR}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={sentidoDeQuantidade(l.quantidade) === 'negativo' ? 'default' : 'outline'}
                        aria-pressed={sentidoDeQuantidade(l.quantidade) === 'negativo'}
                        className="min-h-10 flex-1 sm:min-h-8"
                        onClick={() =>
                          atualizarLinha(l.uid, { quantidade: aplicarSinal(l.quantidade, 'negativo') })
                        }
                        disabled={enviando}
                      >
                        {ROTULO_BAIXAR}
                      </Button>
                    </div>
                  )}
                  {previa && (
                    <p
                      className={cn(
                        'pl-1 text-xs tabular-nums',
                        previa.recusado
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-muted-foreground',
                      )}
                    >
                      {textoPreview(previa)}
                    </p>
                  )}
                  {/* achado 14 — mesmo tom e layout do `recusado` acima, para
                      o mesmo lugar onde a prévia sumia calada. */}
                  {!previa && aviso && (
                    <p className="pl-1 text-xs text-amber-700 dark:text-amber-400">{aviso}</p>
                  )}
                  {l.erro && (
                    <p className="pl-1 text-xs text-red-600 dark:text-red-400">{l.erro}</p>
                  )}
                </div>
              )
            })}
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
            </div>
          </div>

          {/* A escolha guiada do tipo (19/08/2026 — `lib/itens/escolha-tipo.ts`).
              Duas perguntas de operador no lugar do select de seis nomes: o par
              certo (Liberação↔Retorno, Atrelar↔Devolução) sai da resposta. O
              rótulo OFICIAL continua à vista — na pílula de confirmação e, nos
              grupos duplos, miúdo dentro de cada resposta — para a ponte com o
              histórico e o relatório. */}
          <div className="space-y-2">
            <Label>{PERGUNTA_ESCOLHA}</Label>
            <div
              role="group"
              aria-label={PERGUNTA_ESCOLHA}
              className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
            >
              {GRUPOS_ESCOLHA.map((g) => (
                <Button
                  key={g.chave}
                  type="button"
                  size="sm"
                  variant={grupoAtual === g.chave ? 'default' : 'outline'}
                  aria-pressed={grupoAtual === g.chave}
                  className="min-h-10 px-2 sm:min-h-8"
                  onClick={() => escolherGrupo(g.chave)}
                  disabled={enviando}
                >
                  {g.rotulo}
                </Button>
              ))}
            </div>
            {grupoDuplo && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium">{grupoDuplo.pergunta}</p>
                <div
                  role="group"
                  aria-label={grupoDuplo.pergunta ?? undefined}
                  className="grid grid-cols-2 gap-1.5"
                >
                  {grupoDuplo.tipos.map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant={tipo === t ? 'default' : 'outline'}
                      aria-pressed={tipo === t}
                      className="h-auto min-h-10 flex-col items-start gap-0 px-2.5 py-1.5"
                      onClick={() => definirTipo(t)}
                      disabled={enviando}
                    >
                      <span className="text-sm font-medium">{TAREFA_DO_TIPO[t]}</span>
                      <span className="text-[11px] font-normal opacity-75">
                        {TIPO_LANCAMENTO_META[t].rotulo}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {tipo ? (
              <p className="text-xs text-muted-foreground">
                <span
                  className={cn(
                    'mr-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    pillTipoLancamento(tipo),
                  )}
                >
                  {TIPO_LANCAMENTO_META[tipo].rotulo}
                </span>
                {descricaoTipoLancamento(tipo)}
              </p>
            ) : (
              erroTipo && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                  {erroTipo}.
                </p>
              )
            )}
            {grupoAtual === 'acerto' && (
              <p className="text-xs text-muted-foreground">{DICA_ACERTO_CONFERENCIA}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              {/* F19 — o rótulo se liga ao gatilho por htmlFor/id (P1-2): sem
                  isso o Select só se anunciava pelo valor corrente. */}
              <Label htmlFor="lanc-filial">Filial</Label>
              {filiais.length === 0 ? (
                <AvisoSemFilialDeEscrita />
              ) : (
                <Select
                  value={filialId ? String(filialId) : ''}
                  onValueChange={(v) => setFilialId(Number(v))}
                >
                  <SelectTrigger id="lanc-filial" className="w-full">
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
              )}
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lanc-chamado">
                Chamado{precisaChamado ? '' : ' (opcional)'}
              </Label>
              <Input
                id="lanc-chamado"
                inputMode="numeric"
                value={chamado}
                onChange={(e) => setChamado(e.target.value)}
                placeholder={
                  // Na Devolução o chamado é a AMARRA com o Atrelar de origem —
                  // é ele que fecha o par no banco (reserva aberta do chamado).
                  tipo === 'liberacao'
                    ? `o mesmo chamado do ${TIPO_LANCAMENTO_META.reserva.rotulo}`
                    : 'nº do chamado'
                }
              />
            </div>
            <div className="space-y-1.5">
              {/* F37/A.4 — o campo passa a oferecer o cadastro de pessoas e a
                  criação inline, igual ao wizard de movimentação. Antes era um
                  <Input> cru, sem sugestão nenhuma: dos dois lugares onde se digita
                  colaborador, este era o mais exposto a grafia divergente. O rótulo
                  continua dinâmico por tipo e continua trazendo "(opcional)" —
                  texto livre, e nunca bloqueia. */}
              <CampoColaborador
                id="lanc-colab"
                rotulo={rotuloColaborador}
                valor={colaborador}
                onChange={setColaborador}
                placeholder={tipo === 'saida' ? 'nome de quem levou' : 'a quem se destina'}
                filialId={filialId}
                // `filiais` já vem recortado às filiais em que este cargo ESCREVE
                // (F21): lista vazia = cargo consulta, que não cria nada.
                podeCadastrar={filiais.length > 0}
              />
              {tipo === 'saida' && !colaborador.trim() && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Sem o nome, o histórico não dirá com quem o item está.
                </p>
              )}
            </div>
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
          <Button variant="ghost" onClick={() => mudarAberto(false)} disabled={enviando}>
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
