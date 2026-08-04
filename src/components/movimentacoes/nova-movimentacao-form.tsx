'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileClock, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { PainelSucesso } from '@/components/movimentacoes/nova/painel-sucesso'
import { PassoAtivos } from '@/components/movimentacoes/nova/passo-ativos'
import { PassoMovimentacao } from '@/components/movimentacoes/nova/passo-movimentacao'
import { PassoRevisao } from '@/components/movimentacoes/nova/passo-revisao'
import {
  configPadrao,
  mesclarAtivosNoLote,
  type AtivoSucesso,
  type Config,
  type ConfigInicial,
  type ContrapartidaPendente,
  type GrupoSucesso,
  type SucessoLote,
} from '@/components/movimentacoes/nova/config'
import {
  contrapartidaAtiva,
  contrapartidaPadrao,
  montarItensDoPar,
  nascerContrapartida,
  ofereceContrapartida,
  prefillContrapartida,
  tipoContrapartida,
  validarPar,
  MOTIVO_TROCA_UPGRADE,
  type ContrapartidaTroca,
} from '@/components/movimentacoes/nova/troca-upgrade'
import {
  lerRascunho,
  limparRascunho,
  salvarRascunho,
  type Rascunho,
} from '@/components/movimentacoes/nova/rascunho'
import { decidirAplicacaoKit } from '@/components/movimentacoes/nova/aplicar-kit'
import { checklistCategoriasDoKit } from '@/lib/validators/kit'
import {
  buscarResumoDeAtivosPorIds,
  registrarMovimentacoes,
} from '@/lib/actions/movimentacoes'
import {
  MAX_LOTE_MOVIMENTACAO,
  campoAplica,
  loteMovimentacaoSchema,
  tiposManuaisPara,
} from '@/lib/validators/movimentacao'
import {
  rotuloStatus,
  rotuloTipo,
  type CategoriaAtivo,
  type StatusAtivo,
  type TipoMovimentacao,
  type TermoStatus,
} from '@/lib/dominio'
import type { AtivoResumo } from '@/lib/queries/ativos'
import type { Filial } from '@/lib/queries/filiais'
import type { Kit } from '@/lib/queries/kits'
import type { Motivo } from '@/lib/queries/motivos'
import type { UltimaMovimentacaoUsuario } from '@/lib/queries/movimentacoes'

export type { ConfigInicial }

const PASSOS = ['Ativos', 'Movimentação', 'Revisão'] as const

// Tipos oferecidos no SELECT do passo 2 — a interseção das transições válidas MENOS
// os de fluxo próprio (compra /ativos/novo · troca e devolucao_fornecedor pela RPC).
// A régua é FONTE ÚNICA em `tiposManuaisPara`/`TIPOS_FORA_DO_LOTE_MANUAL`
// (validators/movimentacao.ts), com teste — aqui só a UI consome.
function tiposDoLote(status: StatusAtivo[]): TipoMovimentacao[] {
  return tiposManuaisPara(status)
}

// F12/M12 — que kit foi aplicado nesta montagem. Guardamos a IDENTIDADE do kit
// (nome + categorias esperadas), nunca o resultado do checklist: o lote muda
// (o operador volta ao passo 1 e adiciona o monitor que faltava) e o checklist
// tem de acompanhar. Congelá-lo aqui daria um aviso mentiroso.
type KitAplicado = {
  id: string
  nome: string
  categorias: CategoriaAtivo[]
}

function nomeDe(a: AtivoResumo): string {
  return a.patrimonio ?? 'sem patrimônio'
}

export function NovaMovimentacaoForm({
  filiais,
  motivos,
  kits = [],
  ativoInicial,
  configInicial,
  semContrapartida = false,
  ultimaMov,
}: {
  filiais: Filial[]
  motivos: Motivo[]
  // Kits ATIVOS (F12/M12). Lista vazia = o controle "Aplicar kit" nem aparece,
  // igual ao "Repetir última" sem última movimentação.
  kits?: Kit[]
  ativoInicial?: AtivoResumo | null
  configInicial?: ConfigInicial | null
  // F26 — chegou pelo ATALHO do painel de sucesso (`?contrapartida=nao`), ou
  // seja: esta tela É a metade que faltava. A seção do par começa recolhida;
  // sem isto o facilitador pediria a contrapartida da contrapartida, num laço.
  semContrapartida?: boolean
  ultimaMov?: UltimaMovimentacaoUsuario | null
}) {
  const router = useRouter()
  const [passo, setPasso] = useState(1)
  const [itens, setItens] = useState<AtivoResumo[]>(
    ativoInicial ? [ativoInicial] : [],
  )
  const [config, setConfig] = useState<Config>(() => {
    const c = configPadrao(configInicial)
    // Clampa o tipo inicial (vindo de "duplicar") ao que e valido para o ativo.
    if (
      ativoInicial &&
      c.tipo &&
      !tiposDoLote([ativoInicial.status]).includes(c.tipo)
    ) {
      c.tipo = ''
    }
    return c
  })
  // F26 — a metade oposta do par troca/upgrade.
  const [contrapartida, setContrapartida] = useState<ContrapartidaTroca>(() =>
    contrapartidaPadrao({ deixarParaDepois: semContrapartida }),
  )
  const [statusResultante, setStatusResultante] = useState<string>('')
  const [erros, setErros] = useState<string[]>([])
  const [errosPorAtivo, setErrosPorAtivo] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [sucesso, setSucesso] = useState<SucessoLote | null>(null)
  // F10/M9 — o que ENTROU num envio parcial (o lote guarda só as falhas).
  const [jaRegistrados, setJaRegistrados] = useState<AtivoSucesso[]>([])
  // F10/M6 — rascunho: `null` = nada a oferecer; preenchido = banner aberto.
  const [rascunhoPendente, setRascunhoPendente] = useState<Rascunho | null>(null)
  const [hidratado, setHidratado] = useState(false)
  const [restaurando, setRestaurando] = useState(false)
  // F12/M12 — kit aplicado nesta montagem (só a identidade; ver KitAplicado).
  const [kitAplicado, setKitAplicado] = useState<KitAplicado | null>(null)
  // O rascunho só é SOBRESCRITO depois que o operador mexe NESTA montagem.
  // Sem isso, chegar por `?ativo=`/`?duplicar=` (link da ficha, "Duplicar")
  // gravava o estado do link por cima do lote em andamento e os 12 ativos que o
  // operador tinha montado viravam 1, sem aviso.
  const [podeSalvar, setPodeSalvar] = useState(false)

  const comandoRef = useRef<HTMLDivElement>(null)
  // F26 — o combobox da contrapartida tem ref própria: o Enter-avança precisa
  // ignorar os DOIS (o handler compara por `contains`).
  const comandoContrapartidaRef = useRef<HTMLDivElement>(null)
  // Trava de reentrância: bloqueia um 2º envio (ex.: Enter apertado 2x rápido no
  // passo 3) antes do estado `enviando` propagar e desabilitar o botão.
  const enviandoRef = useRef(false)

  const tiposValidos = useMemo(
    () => tiposDoLote(itens.map((i) => i.status)),
    [itens],
  )
  const estadosMistos = useMemo(
    () => new Set(itens.map((i) => i.status)).size > 1,
    [itens],
  )

  const jaAdicionados = useMemo(() => new Set(itens.map((i) => i.id)), [itens])
  const motivosAplicaveis = useMemo(
    () =>
      config.tipo
        ? motivos.filter((m) => m.aplica_a.includes(config.tipo as TipoMovimentacao))
        : [],
    [config.tipo, motivos],
  )

  // Checklist do kit (F12/M12) DERIVADO do lote atual — nunca congelado no
  // momento de aplicar. Informativo: nada aqui bloqueia o botão "Revisar".
  const checklistKit = useMemo(
    () =>
      kitAplicado
        ? checklistCategoriasDoKit(
            kitAplicado.categorias,
            itens.map((i) => i.categoria),
          )
        : [],
    [kitAplicado, itens],
  )

  // Primeira alteração REAL do operador nesta montagem. Libera a persistência
  // (F10/M6) e, se o banner estiver aberto, vale como decisão implícita de
  // "começar um lote novo": quem ignora o banner e monta outro lote por cima
  // não pode ficar sem rede até se lembrar de clicar em Descartar.
  function marcarAlteracao() {
    setPodeSalvar(true)
    setRascunhoPendente(null)
  }

  // F26 — TODA mudança de Config passa por aqui. A seção da contrapartida é
  // derivada (tipo + código do motivo); quando a config nova deixa de oferecê-la,
  // o ESTADO dela morre junto — senão um lote da contrapartida sobreviveria
  // invisível e voltaria ao aparecer de novo. Quando ela passa a ser oferecida,
  // nasce com o prefill do colaborador (capturado do lote em memória, ANTES de
  // qualquer insert).
  function aplicarConfig(proxima: Config) {
    const oferecia = ofereceContrapartida(config)
    const oferece = ofereceContrapartida(proxima)
    setConfig(proxima)
    if (!oferece) setContrapartida(contrapartidaPadrao())
    else if (!oferecia) setContrapartida(nascerContrapartida(proxima, itens))
  }

  function set<K extends keyof Config>(chave: K, valor: Config[K]) {
    marcarAlteracao()
    aplicarConfig({ ...config, [chave]: valor })
  }

  function setContrapartidaCampo<K extends keyof ContrapartidaTroca>(
    chave: K,
    valor: ContrapartidaTroca[K],
  ) {
    marcarAlteracao()
    setContrapartida((c) => ({ ...c, [chave]: valor }))
  }

  // Trocar o tipo limpa os campos específicos do tipo anterior — senão um motivo
  // (ou filial destino / itens) de um tipo vaza para outro sem o usuário ver. O
  // motivo zerado já derruba a contrapartida (via `aplicarConfig`).
  function trocarTipo(tipo: TipoMovimentacao) {
    marcarAlteracao()
    aplicarConfig({
      ...config,
      tipo,
      motivo: '',
      chamadoFornecedor: '',
      filialDestinoId: '',
      itensFaltantes: [],
    })
    setStatusResultante('')
  }

  // Ao mudar o lote, se o tipo escolhido deixar de ser valido para todos, limpa.
  // `entrantes` sao os ativos que acabaram de entrar no lote (na pratica um so —
  // eles entram um a um pelo combobox): quando a limpeza acontece por causa
  // deles, o toast nomeia o culpado com os rotulos do dominio, em vez do reset
  // mudo de antes (F9/M7). Remocao nunca estreita a intersecao, entao so
  // `adicionar` passa entrantes.
  function ajustarTipoPara(lista: AtivoResumo[], entrantes: AtivoResumo[] = []) {
    const tipoAtual = config.tipo
    const validos = tiposDoLote(lista.map((i) => i.status))
    if (!tipoAtual || validos.includes(tipoAtual)) return
    setConfig((c) =>
      c.tipo && !validos.includes(c.tipo) ? { ...c, tipo: '' } : c,
    )
    // F26 — sem tipo não há par: a seção some, e o estado dela vai junto.
    setContrapartida(contrapartidaPadrao())
    // Toast fora do updater do setState (o updater pode rodar duas vezes em
    // StrictMode) e fora do render — este e um handler de evento.
    const culpado = entrantes.find(
      (a) => !tiposDoLote([a.status]).includes(tipoAtual),
    )
    if (culpado) {
      toast.warning(
        `${nomeDe(culpado)} (${rotuloStatus(culpado.status)}) não permite "${rotuloTipo(tipoAtual)}" — o tipo foi limpo.`,
      )
    }
  }
  function adicionar(a: AtivoResumo) {
    if (itens.some((p) => p.id === a.id)) return
    if (contrapartida.itens.some((p) => p.id === a.id)) {
      toast.warning(
        `${nomeDe(a)} já está na outra metade da troca — um ativo não entra nas duas.`,
      )
      return
    }
    const next = [...itens, a]
    marcarAlteracao()
    setItens(next)
    ajustarTipoPara(next, [a])
  }

  // F10/M1 — entrada em massa (colar lista). O resolver do W1 devolve tudo o que
  // achou: o teto e o dedup contra o lote atual sao AQUI (funcao pura
  // compartilhada com o dialog), e o que ficou de fora e dito em voz alta.
  // A intersecao de tipos e reaplicada com os entrantes — exatamente como no
  // `adicionar` um a um (o resolver nao filtra por estado, de proposito).
  function adicionarVarios(novos: AtivoResumo[]) {
    const r = mesclarAtivosNoLote(itens, novos)
    if (r.adicionados.length > 0) {
      marcarAlteracao()
      setItens(r.lote)
      ajustarTipoPara(r.lote, r.adicionados)
      const extra =
        r.jaNoLote.length > 0 ? ` (${r.jaNoLote.length} já estavam no lote)` : ''
      toast.success(
        `${r.adicionados.length} ${r.adicionados.length === 1 ? 'ativo adicionado' : 'ativos adicionados'} ao lote${extra}.`,
      )
    } else if (r.jaNoLote.length > 0 && r.excedentes.length === 0) {
      toast.info('Todos os ativos da lista já estavam no lote.')
    }
    if (r.excedentes.length > 0) {
      toast.warning(
        `${r.excedentes.length} ${r.excedentes.length === 1 ? 'ativo ficou' : 'ativos ficaram'} de fora: o lote aceita ${MAX_LOTE_MOVIMENTACAO}. Registre o resto em outro lote.`,
      )
    }
  }
  function remover(id: string) {
    const next = itens.filter((p) => p.id !== id)
    if (next.length === itens.length) return
    marcarAlteracao()
    setItens(next)
    ajustarTipoPara(next)
  }

  // --- F26 — os ativos da metade oposta ------------------------------------
  // O tipo da contrapartida é FIXO (derivado), então um ativo em estado que não
  // o aceita não pode "limpar o tipo" como no lote principal: ele é recusado na
  // entrada, com o mesmo toast que nomeia o culpado. `validarPar` repete a
  // checagem no envio — um rascunho pode ter dormido enquanto o estado mudava.
  function adicionarContrapartida(a: AtivoResumo) {
    const alvo = tipoContrapartida(config.tipo)
    if (!alvo) return
    if (contrapartida.itens.some((p) => p.id === a.id)) return
    if (itens.some((p) => p.id === a.id)) {
      toast.warning(
        `${nomeDe(a)} já está na outra metade da troca — um ativo não entra nas duas.`,
      )
      return
    }
    if (itens.length + contrapartida.itens.length >= MAX_LOTE_MOVIMENTACAO) {
      toast.warning(
        `As duas metades já somam ${MAX_LOTE_MOVIMENTACAO} ativos, o teto do lote. Registre este par e comece outro.`,
      )
      return
    }
    if (!tiposManuaisPara([a.status]).includes(alvo)) {
      toast.warning(
        `${nomeDe(a)} (${rotuloStatus(a.status)}) não permite "${rotuloTipo(alvo)}" — escolha outro equipamento para a troca.`,
      )
      return
    }
    marcarAlteracao()
    setContrapartida((c) => ({ ...c, itens: [...c.itens, a] }))
  }

  function removerContrapartida(id: string) {
    if (!contrapartida.itens.some((p) => p.id === id)) return
    marcarAlteracao()
    setContrapartida((c) => ({ ...c, itens: c.itens.filter((p) => p.id !== id) }))
  }

  // --- F10/M6 — rascunho persistente (sessionStorage, por aba) --------------
  // Leitura SO dentro de efeito (ler storage no corpo do componente quebraria a
  // hidratacao do Next) e SO na montagem. `?ativo=`/`?duplicar=` tem precedencia
  // (decisao §2): quem chegou por um link explicito nao ve o banner.
  useEffect(() => {
    const veioDeLink = Boolean(ativoInicial || configInicial)
    // Estado alterado dentro do callback (react-hooks/set-state-in-effect).
    const t = setTimeout(() => {
      if (!veioDeLink) setRascunhoPendente(lerRascunho())
      setHidratado(true)
    }, 0)
    return () => clearTimeout(t)
    // Montagem apenas: as props de link so mudam com nova navegacao (nova pagina).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Salva o esqueleto do lote a cada mudanca (debounce). SO depois da primeira
  // alteracao do operador (`podeSalvar`): montagem semeada por link
  // (`?ativo=`/`?duplicar=`) ou montagem intocada nao pode sobrescrever — nem
  // apagar — o lote que ficou de outra visita. Enquanto o banner esta aberto
  // tambem nao grava; a primeira alteracao real o fecha (`marcarAlteracao`) e
  // libera a gravacao no mesmo gesto.
  useEffect(() => {
    if (!hidratado || !podeSalvar || rascunhoPendente || sucesso) return
    const t = setTimeout(() => {
      if (itens.length === 0) {
        limparRascunho()
        return
      }
      salvarRascunho({
        ids: itens.map((a) => a.id),
        config,
        statusResultante,
        passo,
        // F26 — a contrapartida só vai para o storage quando a config a oferece:
        // um lote simples continua serializando exatamente como antes.
        ...(ofereceContrapartida(config)
          ? {
              contrapartida: {
                ids: contrapartida.itens.map((a) => a.id),
                colaborador: contrapartida.colaborador,
                setor: contrapartida.setor,
                termo: contrapartida.termo,
                termoData: contrapartida.termoData,
                itensFaltantes: contrapartida.itensFaltantes,
                deixarParaDepois: contrapartida.deixarParaDepois,
              },
            }
          : {}),
      })
    }, 400)
    return () => clearTimeout(t)
  }, [
    hidratado,
    podeSalvar,
    rascunhoPendente,
    sucesso,
    itens,
    config,
    contrapartida,
    statusResultante,
    passo,
  ])

  async function restaurarRascunho() {
    const r = rascunhoPendente
    if (!r || restaurando) return
    setRestaurando(true)
    try {
      const idsContra = r.contrapartida?.ids ?? []
      // Uma consulta só para as duas metades (ids únicos; a query preserva a
      // ordem pedida e simplesmente não devolve quem sumiu).
      const ativos = await buscarResumoDeAtivosPorIds([...r.ids, ...idsContra])
      // Lista VAZIA com `r.ids` não-vazio (invariante do rascunho: sem ids ele
      // nem existe) é ambígua: o proxy degrada a falha de rede para `[]`, então
      // "a consulta caiu" é indistinguível de "os ativos sumiram". Apagar o
      // rascunho aqui destruiria o lote por causa de uma falha transitória — o
      // banner fica de pé e o operador tenta de novo (ou Descarta, se quiser).
      if (ativos.length === 0) {
        toast.error(
          'Não foi possível carregar os ativos do rascunho agora. Tente restaurar de novo.',
        )
        return
      }

      const porId = new Map(ativos.map((a) => [a.id, a]))
      const principais = r.ids
        .map((id) => porId.get(id))
        .filter((a): a is AtivoResumo => a !== undefined)

      // Estados podem ter mudado enquanto o rascunho dormia (outro operador
      // movimentou o ativo): a intersecao de tipos e REFEITA e o tipo salvo cai
      // se nao valer mais para o lote inteiro.
      const validos = tiposDoLote(principais.map((a) => a.status))
      let cfg = r.config
      if (cfg.tipo && !validos.includes(cfg.tipo)) {
        toast.warning(
          `O tipo "${rotuloTipo(cfg.tipo)}" não vale mais para estes ativos — escolha outro.`,
        )
        cfg = { ...cfg, tipo: '' }
      }

      // F26 — a metade oposta passa pela MESMA re-checagem, com o tipo DELA.
      let contra = contrapartidaPadrao()
      if (r.contrapartida && ofereceContrapartida(cfg)) {
        const alvo = tipoContrapartida(cfg.tipo)
        const opostosBrutos = idsContra
          .map((id) => porId.get(id))
          .filter((a): a is AtivoResumo => a !== undefined)
        const opostos = alvo
          ? opostosBrutos.filter((a) =>
              tiposManuaisPara([a.status]).includes(alvo),
            )
          : []
        const caidos = opostosBrutos.length - opostos.length
        if (caidos > 0 && alvo) {
          toast.warning(
            `${caidos} ${caidos === 1 ? 'ativo da' : 'ativos da'} ${rotuloTipo(alvo).toLowerCase()} da troca não aceita mais essa movimentação e ficou de fora.`,
          )
        }
        contra = contrapartidaPadrao({
          itens: opostos,
          colaborador: r.contrapartida.colaborador,
          setor: r.contrapartida.setor,
          termo: r.contrapartida.termo,
          termoData: r.contrapartida.termoData,
          itensFaltantes: r.contrapartida.itensFaltantes,
          deixarParaDepois: r.contrapartida.deixarParaDepois,
        })
      }

      const pedidos = r.ids.length + idsContra.length
      const ausentes = pedidos - ativos.length
      if (ausentes > 0) {
        toast.warning(
          `${ausentes} ${ausentes === 1 ? 'ativo do rascunho não foi encontrado' : 'ativos do rascunho não foram encontrados'} e ficaram de fora.`,
        )
      }

      setItens(principais)
      setConfig(cfg)
      setContrapartida(contra)
      setStatusResultante(r.statusResultante)
      // Sem tipo nao ha o que revisar: volta para o passo 2.
      setPasso(cfg.tipo ? r.passo : Math.min(r.passo, 2))
      setRascunhoPendente(null)
      // O lote restaurado volta a ser salvo a cada mudanca (inclusive o que a
      // re-checagem de interseção acabou de ajustar).
      setPodeSalvar(true)
      toast.success(
        `Rascunho restaurado — ${principais.length} ${principais.length === 1 ? 'ativo' : 'ativos'} no lote.`,
      )
    } catch {
      // F19 — a restauracao parte de um CLIQUE: se a chamada rejeitar, sem o
      // catch nada aparece na tela. Mesma regra da lista vazia acima: o rascunho
      // NAO e apagado, o banner continua de pe e o operador tenta de novo.
      toast.error(
        'Não foi possível restaurar o rascunho agora. Verifique sua conexão e tente de novo.',
      )
    } finally {
      setRestaurando(false)
    }
  }

  function descartarRascunho() {
    limparRascunho()
    setRascunhoPendente(null)
  }

  function repetirUltima() {
    if (!ultimaMov) return
    marcarAlteracao()
    const tipoValido = tiposValidos.includes(ultimaMov.tipo)
    aplicarConfig({
      ...config,
      tipo: tipoValido ? ultimaMov.tipo : config.tipo,
      motivo: ultimaMov.motivo ?? '',
      colaborador: ultimaMov.colaborador ?? '',
      setor: ultimaMov.setor ?? '',
      chamado: ultimaMov.chamado ?? '',
      termo: (ultimaMov.termo_assinado as TermoStatus) ?? '',
      termoData: ultimaMov.termo_data ?? '',
    })
    toast.success('Campos preenchidos com a última movimentação.')
    if (!tipoValido) {
      toast.warning(
        `O tipo "${rotuloTipo(ultimaMov.tipo)}" não é válido para os ativos atuais — escolha outro.`,
      )
    }
  }

  // F12/M12 — aplicar um KIT salvo: mesmo mecanismo do `repetirUltima`
  // (sobrescreve a config e avisa), com uma diferença deliberada: tipo do kit
  // fora da interseção do lote NÃO aplica nada (OS-F12 §W3.2), enquanto o
  // "Repetir última" aplica o resto e só não troca o tipo. Motivo: o kit é um
  // conjunto nomeado — meio kit aplicado engana quem confiou no preset.
  // Aplicar É alteração do operador (`marcarAlteracao`): libera o rascunho e
  // fecha o banner de lote pendente.
  function aplicarKit(kit: Kit) {
    const decisao = decidirAplicacaoKit({
      payload: kit.payload,
      config,
      tiposValidos,
      motivosDoTipo: motivos
        .filter((m) => m.aplica_a.includes(kit.payload.tipo))
        .map((m) => m.codigo),
    })

    if (!decisao.aplicar) {
      toast.warning(
        `O kit "${kit.nome}" é de "${rotuloTipo(decisao.tipoKit)}", que não vale para os ativos deste lote — nada foi alterado.`,
      )
      return
    }

    marcarAlteracao()
    // Kit que casa com tipo+motivo do facilitador abre a seção do par como
    // qualquer outra origem: a derivação é a mesma, sem caso especial.
    aplicarConfig(decisao.config)
    // Status resultante vive fora da Config: some junto com o tipo antigo.
    if (decisao.trocouTipo) setStatusResultante('')
    setKitAplicado({
      id: kit.id,
      nome: kit.nome,
      categorias: kit.payload.categorias,
    })
    toast.success(
      `Kit "${kit.nome}" aplicado — os campos da movimentação foram substituídos.`,
    )
    if (decisao.motivoDescartado) {
      toast.warning(
        `O motivo salvo no kit "${kit.nome}" não está mais disponível para "${rotuloTipo(kit.payload.tipo)}" — escolha o motivo.`,
      )
    }
  }

  // Monta e valida o lote. Retorna as mensagens de erro (vazio = ok).
  function validarLote(): string[] {
    const itensInput = montarItensDoPar(
      itens,
      config,
      statusResultante,
      contrapartida,
    )
    const msgs: string[] = []
    const parsed = loteMovimentacaoSchema.safeParse({ itens: itensInput })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) msgs.push(issue.message)
    }
    // Transferencia: destino ≠ filial atual de CADA item (o Zod nao conhece a
    // filial corrente — checagem aqui, reconferida na Server Action).
    if (config.tipo === 'transferencia' && config.filialDestinoId) {
      const destino = Number(config.filialDestinoId)
      const conflita = itens.filter((i) => i.filial_id === destino)
      if (conflita.length > 0) {
        msgs.push(
          'A filial de destino deve ser diferente da filial atual dos ativos.',
        )
      }
    }
    // F26 — as regras que só existem por causa do par (disjunção, teto somado,
    // seção aberta e vazia, estado do ativo na metade oposta).
    msgs.push(...validarPar(config, itens, contrapartida))
    return [...new Set(msgs)]
  }

  function avancarParaRevisao() {
    const msgs = validarLote()
    setErros(msgs)
    if (msgs.length === 0) setPasso(3)
  }

  async function registrar() {
    if (enviandoRef.current) return
    const msgs = validarLote()
    setErros(msgs)
    if (msgs.length > 0) {
      setPasso(2)
      return
    }

    const itensInput = montarItensDoPar(
      itens,
      config,
      statusResultante,
      contrapartida,
    )

    enviandoRef.current = true
    setEnviando(true)
    // F26 — as duas metades são capturadas ANTES do envio: depois do insert o
    // trigger `aplicar_movimentacao` zera o `colaborador_atual` do devolvido, e
    // é dele que sai o pré-preenchimento do atalho do painel.
    const comPar = contrapartidaAtiva(config, contrapartida)
    const submetidosPrincipal = [...itens]
    const submetidosContra = comPar ? [...contrapartida.itens] : []
    const submetidos = [...submetidosPrincipal, ...submetidosContra]
    const alvo = tipoContrapartida(config.tipo)
    let res
    try {
      res = await registrarMovimentacoes({
        // itensInput ja no formato de MovimentacaoInput (validado no servidor)
        itens: itensInput as never,
      })
    } catch {
      // F19 — sem o catch, o throw de transporte (rede caindo, sessao morta,
      // payload) vira unhandled rejection: NADA acontece na tela e o operador
      // clica de novo. O `return` e obrigatorio — sem ele o codigo abaixo leria
      // `res` indefinido. O lote continua montado na tela.
      toast.error(
        'Não foi possível registrar agora. Seu lote continua aqui — verifique sua conexão e tente de novo.',
      )
      return
    } finally {
      setEnviando(false)
      enviandoRef.current = false
    }

    if (res.erroGeral) {
      toast.error(res.erroGeral)
      return
    }

    const falhaIds = res.resultados.filter((r) => !r.ok).map((r) => r.ativo_id)

    if (res.criadas > 0) {
      // Sucesso (total ou parcial) fecha o rascunho: o que entrou nao pode ser
      // reoferecido como "lote não registrado" na proxima visita (M6).
      limparRascunho()
    }

    if (res.ok) {
      const movPorAtivo = new Map(
        res.resultados
          .filter((r) => r.movimentacao_id)
          .map((r) => [r.ativo_id, r.movimentacao_id as string]),
      )
      const paraSucesso = (a: AtivoResumo): AtivoSucesso => ({
        id: a.id,
        patrimonio: a.patrimonio,
        categoria: a.categoria,
        movimentacaoId: movPorAtivo.get(a.id) ?? '',
      })
      const grupos: GrupoSucesso[] = []
      if (submetidosPrincipal.length > 0) {
        grupos.push({
          tipo: config.tipo as TipoMovimentacao,
          motivo: config.motivo,
          ativos: submetidosPrincipal.map(paraSucesso),
        })
      }
      if (comPar && alvo && submetidosContra.length > 0) {
        grupos.push({
          tipo: alvo,
          motivo: MOTIVO_TROCA_UPGRADE,
          ativos: submetidosContra.map(paraSucesso),
        })
      }
      // Contrapartida adiada: o painel oferece o atalho pré-preenchido. Nada
      // fica pendente no servidor — é só navegação (decisão "só a tela").
      const pendente: ContrapartidaPendente | null =
        ofereceContrapartida(config) && contrapartida.deixarParaDepois && alvo
          ? {
              tipo: alvo,
              colaborador: campoAplica(alvo, 'colaborador')
                ? prefillContrapartida(submetidosPrincipal)
                : '',
            }
          : null
      setSucesso({ criadas: res.criadas, grupos, pendente })
      router.refresh()
      return
    }

    // Falha (parcial ou total): mantem no form apenas os itens que falharam —
    // cada um na SUA metade (F26: as metades não se misturam na volta).
    const novosErros: Record<string, string> = {}
    for (const r of res.resultados) {
      if (!r.ok && r.erro) novosErros[r.ativo_id] = r.erro
    }
    setErrosPorAtivo(novosErros)

    // F10/M9 — quem ENTROU some do lote, mas nao da tela: vira chip com link
    // para a ficha no passo 2 (a informacao ja vinha no resultado da action e
    // era jogada fora). Acumula entre tentativas do mesmo lote.
    const porId = new Map(submetidos.map((a) => [a.id, a]))
    const entraram = res.resultados
      .filter((r) => r.ok)
      .map((r) => {
        const a = porId.get(r.ativo_id)
        return {
          id: r.ativo_id,
          patrimonio: a?.patrimonio ?? null,
          categoria: a?.categoria as AtivoSucesso['categoria'],
          movimentacaoId: r.movimentacao_id ?? '',
        }
      })
    if (entraram.length > 0) {
      setJaRegistrados((prev) => [
        ...prev.filter((p) => !entraram.some((e) => e.id === p.id)),
        ...entraram,
      ])
    }
    setItens(submetidosPrincipal.filter((a) => falhaIds.includes(a.id)))
    if (comPar) {
      setContrapartida((c) => ({
        ...c,
        itens: submetidosContra.filter((a) => falhaIds.includes(a.id)),
      }))
    }
    setPasso(2)
    if (res.criadas > 0) {
      toast.warning(
        `${res.criadas} registrada(s); ${falhaIds.length} falhou(aram). Revise os itens restantes.`,
      )
      router.refresh()
    } else {
      toast.error('Nenhuma movimentação registrada. Veja os erros nos itens.')
    }
  }

  function reiniciar() {
    setItens([])
    setConfig(configPadrao())
    setContrapartida(contrapartidaPadrao())
    setStatusResultante('')
    setErros([])
    setErrosPorAtivo({})
    setJaRegistrados([])
    setKitAplicado(null)
    setPasso(1)
    setSucesso(null)
    limparRascunho()
    // Form zerado = montagem intocada de novo (não regrava o que acabou de sair).
    setPodeSalvar(false)
  }

  // Enter avança entre os passos (OS-F2 3.7.1) — exceto em textarea, botões e
  // dentro do combobox (onde Enter seleciona o resultado).
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return
    const el = e.target as HTMLElement
    if (el.tagName === 'TEXTAREA' || el.tagName === 'BUTTON') return
    if (el.getAttribute('role') === 'combobox') return
    // Item de menu (o "Aplicar kit", F12/M12): o Radix trata o Enter no item —
    // `preventDefault` sim, `stopPropagation` NÃO —, então o evento chegaria
    // aqui e o mesmo Enter que aplicou o kit também avançaria de passo. O item é
    // um <div role="menuitem">, não um BUTTON: precisa da guarda própria.
    if (el.getAttribute('role') === 'menuitem') return
    if (comandoRef.current?.contains(el)) return
    // F26 — idem para o combobox da seção da contrapartida.
    if (comandoContrapartidaRef.current?.contains(el)) return
    e.preventDefault()
    if (passo === 1 && itens.length > 0) setPasso(2)
    else if (passo === 2) avancarParaRevisao()
    else if (passo === 3) registrar()
  }

  if (sucesso) {
    return (
      <PainelSucesso
        sucesso={sucesso}
        onGerado={() => router.refresh()}
        onReiniciar={reiniciar}
      />
    )
  }

  // F26 — região viva PERSISTENTE (nasce com o formulário e só muda de texto):
  // é assim que o leitor de tela anuncia a chegada da seção do par sem que o
  // foco saia do lugar. Um `role="status"` que nascesse junto com a seção não
  // seria anunciado de forma confiável.
  const avisoContrapartida = ofereceContrapartida(config)
    ? `Seção "${rotuloTipo(tipoContrapartida(config.tipo) ?? 'saida')} da troca" disponível no passo Movimentação: registre a outra metade da troca junto, ou marque "Deixar a contrapartida para depois".`
    : ''

  return (
    <div onKeyDown={onKeyDown} className="space-y-6">
      <p role="status" className="sr-only">
        {avisoContrapartida}
      </p>

      {/* F10/M6 — lote não registrado desta aba (sessionStorage) */}
      {rascunhoPendente && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <FileClock className="size-4 shrink-0" />
          <p className="min-w-0 flex-1">
            Você tem um lote não registrado —{' '}
            <span className="font-medium tabular-nums">
              {rascunhoPendente.ids.length}
            </span>{' '}
            {rascunhoPendente.ids.length === 1 ? 'ativo' : 'ativos'}.
          </p>
          <span className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={descartarRascunho}
              disabled={restaurando}
            >
              Descartar
            </Button>
            <Button
              type="button"
              onClick={restaurarRascunho}
              disabled={restaurando}
            >
              {restaurando ? 'Restaurando…' : 'Restaurar'}
            </Button>
          </span>
        </div>
      )}

      {/* Stepper — F19: a lista se nomeia ("Etapas") e o passo corrente sai no
          <button>, que é o elemento interativo que o leitor de tela anuncia. */}
      <ol aria-label="Etapas" className="flex flex-wrap items-center gap-2 text-sm">
        {PASSOS.map((rotulo, i) => {
          const n = i + 1
          const ativo = passo === n
          const concluido = passo > n
          return (
            <li key={rotulo} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => n < passo && setPasso(n)}
                disabled={n > passo}
                aria-current={ativo ? 'step' : undefined}
                className={
                  'flex items-center gap-2 rounded-full px-2.5 py-1 font-medium transition-colors ' +
                  (ativo
                    ? 'bg-primary text-primary-foreground'
                    : concluido
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground')
                }
              >
                <span className="tabular-nums">{n}</span>
                {rotulo}
              </button>
              {i < PASSOS.length - 1 && (
                <span aria-hidden className="text-muted-foreground">
                  →
                </span>
              )}
            </li>
          )
        })}
      </ol>

      {/* Erros de validacao — F19: `role="alert"` porque o bloco só nasce depois
          de "Revisar"/"Registrar"; sem ele o clique parece não ter efeito para
          quem não vê a tela. */}
      {erros.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <p className="mb-1 flex items-center gap-1.5 font-medium">
            <TriangleAlert className="size-4" />
            Revise antes de continuar:
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {passo === 1 && (
        <PassoAtivos
          itens={itens}
          jaAdicionados={jaAdicionados}
          comandoRef={comandoRef}
          onAdicionar={adicionar}
          onAdicionarVarios={adicionarVarios}
          onRemover={remover}
          onAvancar={() => setPasso(2)}
        />
      )}

      {passo === 2 && (
        <PassoMovimentacao
          config={config}
          statusResultante={statusResultante}
          itens={itens}
          tiposValidos={tiposValidos}
          estadosMistos={estadosMistos}
          motivosAplicaveis={motivosAplicaveis}
          errosPorAtivo={errosPorAtivo}
          jaRegistrados={jaRegistrados}
          filiais={filiais}
          ultimaMov={ultimaMov}
          kits={kits}
          kitAplicado={kitAplicado}
          checklistKit={checklistKit}
          contrapartida={contrapartida}
          comandoContrapartidaRef={comandoContrapartidaRef}
          onAplicarKit={aplicarKit}
          onLimparKit={() => setKitAplicado(null)}
          onTrocarTipo={trocarTipo}
          onSet={set}
          onSetStatusResultante={(v) => {
            marcarAlteracao()
            setStatusResultante(v)
          }}
          onSetContrapartida={setContrapartidaCampo}
          onAdicionarContrapartida={adicionarContrapartida}
          onRemoverContrapartida={removerContrapartida}
          onRepetirUltima={repetirUltima}
          onVoltar={() => setPasso(1)}
          onRevisar={avancarParaRevisao}
        />
      )}

      {passo === 3 && (
        <PassoRevisao
          itens={itens}
          config={config}
          contrapartida={contrapartida}
          filiais={filiais}
          motivos={motivos}
          enviando={enviando}
          onVoltar={() => setPasso(2)}
          onRegistrar={registrar}
        />
      )}
    </div>
  )
}
