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
  deveOferecerAtalho,
  montarItensDoPar,
  nascerContrapartida,
  ofereceContrapartida,
  prefillContrapartida,
  sincronizarPrefill,
  tipoContrapartida,
  validarPar,
  MOTIVO_TROCA_UPGRADE,
  type ContrapartidaTroca,
} from '@/components/movimentacoes/nova/troca-upgrade'
import {
  montarItensJuntoDoLote,
  reindexarItensJunto,
} from '@/components/movimentacoes/nova/itens-do-lote'
import {
  lerRascunho,
  limparRascunho,
  salvarRascunho,
  type Rascunho,
} from '@/components/movimentacoes/nova/rascunho'
import { decidirAplicacaoKit } from '@/components/movimentacoes/nova/aplicar-kit'
import {
  CAMPOS_DO_TIPO_VAZIOS,
  camposDaRepeticao,
} from '@/components/movimentacoes/nova/repetir-ultima'
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
  ehTipoMovimentacao,
  rotuloPatrimonio,
  rotuloStatus,
  rotuloTipo,
  type CategoriaAtivo,
  type StatusAtivo,
  type TipoMovimentacao,
} from '@/lib/dominio'
import { formatTempoRelativo } from '@/lib/format'
import type { PapelUsuario } from '@/lib/auth/papeis'
import type { AtivoResumo } from '@/lib/queries/ativos'
import type { TipoItem } from '@/lib/queries/tipos-item'
import { mapaRotulosTipo } from '@/lib/itens/rotulo-tipo'
import type { ItemDoCatalogo } from '@/lib/itens/ponte-tipo-item'
import type { Filial } from '@/lib/queries/filiais'
import type { Kit } from '@/lib/queries/kits'
import type { Motivo } from '@/lib/queries/motivos'
import type { UltimaMovimentacaoUsuario } from '@/lib/queries/movimentacoes'

export type { ConfigInicial }

const PASSOS = ['Ativos', 'Movimentação', 'Revisão'] as const

// F26 — as chaves do item que as DUAS metades do par compartilham: um único
// preenchimento no formulário, copiado nos dois itens por `configDaContrapartida`
// (`ativo_id`/`tipo` estão aqui por serem internos, nunca um campo da tela). Erro
// nelas não pertence a metade nenhuma — ver `validarLote`.
const CAMPOS_COMPARTILHADOS = [
  'ativo_id',
  'tipo',
  'data',
  'chamado',
  'observacao',
]

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

export function NovaMovimentacaoForm({
  filiais,
  motivos,
  kits = [],
  ativoInicial,
  ativosIniciais,
  avisoLote = null,
  configInicial,
  semContrapartida = false,
  ultimaMov,
  origemInvalida = null,
  papel = null,
  filiaisEscrita = [],
  tiposItem = [],
  tiposItemTodos = [],
  itensCatalogo = [],
}: {
  filiais: Filial[]
  motivos: Motivo[]
  // Kits ATIVOS (F12/M12). Lista vazia = o controle "Aplicar kit" nem aparece,
  // igual ao "Repetir última" sem última movimentação.
  kits?: Kit[]
  ativoInicial?: AtivoResumo | null
  // ATV-03 (F30) — o lote que veio PRONTO da seleção múltipla de /ativos
  // (`?ativos=id1,id2,…`). Prop separada, e não um `ativoInicial` que virou
  // array: `?ativo=` continua sendo o caminho de UM ativo (a ficha, o painel de
  // sucesso), com semântica e chamadores próprios.
  ativosIniciais?: AtivoResumo[] | null
  // ATV-03 — a frase do banner âmbar quando alguém do `?ativos=` ficou de fora.
  // Vem PRONTA do servidor (`avisoDoLoteInicial`), porque é lá que se sabe
  // quantos ids foram pedidos e quantos o banco devolveu.
  avisoLote?: string | null
  configInicial?: ConfigInicial | null
  // F26 — chegou pelo ATALHO do painel de sucesso (`?contrapartida=nao`), ou
  // seja: esta tela É a metade que faltava. A seção do par começa recolhida;
  // sem isto o facilitador pediria a contrapartida da contrapartida, num laço.
  semContrapartida?: boolean
  ultimaMov?: UltimaMovimentacaoUsuario | null
  // MOV-14 — `?duplicar=`/`?ativo=` apontava pra um id apagado (Zona
  // destrutiva) ou quebrado e o wizard abria em branco em silêncio. `null` =
  // nada a avisar; senão, qual das duas origens falhou (o texto do banner
  // muda conforme — ver o JSX abaixo).
  origemInvalida?: 'duplicar' | 'ativo' | null
  // F28/MOV-03 — aviso ANTECIPADO de vínculo de filial: descem para
  // `PassoAtivos` e `SecaoContrapartida`, que badge-am por item o ativo fora
  // do vínculo do OPERADOR. `null`/`[]` = nível administrador (dev/admin) ou
  // sessão sem operador — nenhum aviso aparece (ver `escreveNaFilial`).
  papel?: PapelUsuario | null
  filiaisEscrita?: readonly number[]
  // F38 — o vocabulário de tipos (checklist de dois desfechos) e o catálogo de
  // itens (a ponte tipo→item e a seção "Itens que vão junto"). Vêm do servidor,
  // como filiais/motivos/kits: o wizard não consulta banco.
  tiposItem?: TipoItem[]
  // F39 — o catálogo INTEIRO (ativos e desativados), usado SÓ para o rótulo do
  // resumo da revisão. Prop separada de propósito: `tiposItem` continua sendo a
  // lista de ESCOLHA do checklist (só ativos, byte a byte como a F38 a deixou), e
  // quem exibe passado — um rascunho restaurado citando um tipo desativado —
  // precisa de todos, senão o slug cru vazaria para a tela.
  tiposItemTodos?: TipoItem[]
  itensCatalogo?: ItemDoCatalogo[]
}) {
  const router = useRouter()
  // F39 — o mapa slug→rótulo dos tipos, para o resumo da revisão. `useMemo` só
  // para não remontar o objeto a cada render do wizard.
  const rotulosTipo = useMemo(() => mapaRotulosTipo(tiposItemTodos), [tiposItemTodos])
  const [passo, setPasso] = useState(1)
  // ATV-03 — o lote de ABERTURA, venha ele da seleção múltipla da lista
  // (`?ativos=`) ou de um ativo só (`?ativo=`/`?duplicar=`). Unificar aqui é o
  // que faz o resto do wizard (interseção da máquina de estados, avisos de
  // vínculo, kits, rascunho) não precisar saber por qual porta o lote entrou.
  // Constante de render, e não estado: só alimenta inicializadores de `useState`.
  const ativosDeAbertura: AtivoResumo[] =
    ativosIniciais && ativosIniciais.length > 0
      ? ativosIniciais
      : ativoInicial
        ? [ativoInicial]
        : []
  const [itens, setItens] = useState<AtivoResumo[]>(ativosDeAbertura)
  const [config, setConfig] = useState<Config>(() => {
    const c = configPadrao(configInicial)
    // Clampa o tipo inicial (vindo de "duplicar") ao que e valido para o ativo.
    // MOV-07 — os campos DO TIPO caem junto: sem isto, o motivo/termo da
    // movimentação duplicada sobrevivia a um tipo que foi zerado por invalidez.
    // ATV-03 — a interseção passa a ser a do LOTE inteiro: com vários ativos de
    // abertura, um tipo que não serve a TODOS não pode sobreviver.
    if (
      ativosDeAbertura.length > 0 &&
      c.tipo &&
      !tiposDoLote(ativosDeAbertura.map((a) => a.status)).includes(c.tipo)
    ) {
      Object.assign(c, { tipo: '' }, CAMPOS_DO_TIPO_VAZIOS)
    }
    return c
  })
  // F26 — a metade oposta do par troca/upgrade. Chegando pelo atalho do painel
  // (`?contrapartida=nao`), a seção nasce recolhida E marcada como `jaRegistrada`
  // — a outra metade deste par já está no banco, foi ela que abriu esta tela.
  const [contrapartida, setContrapartida] = useState<ContrapartidaTroca>(() =>
    contrapartidaPadrao({
      deixarParaDepois: semContrapartida,
      jaRegistrada: semContrapartida,
    }),
  )
  const [statusResultante, setStatusResultante] = useState<string>('')
  const [erros, setErros] = useState<string[]>([])
  const [errosPorAtivo, setErrosPorAtivo] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  // MOV-08 — reportado pelo passo 3 (`PassoRevisao`) enquanto a consulta de
  // possíveis duplicatas está em voo. Só o Enter-de-registrar (`onKeyDown`
  // abaixo) usa isto para se ignorar nessa janela — o clique no botão
  // continua livre (o aviso é não-bloqueante por decisão registrada).
  const [consultandoDuplicatas, setConsultandoDuplicatas] = useState(false)
  const [sucesso, setSucesso] = useState<SucessoLote | null>(null)
  // F10/M9 — o que ENTROU num envio parcial (o lote guarda só as falhas).
  // F10/M6 — rascunho: `null` = nada a oferecer; preenchido = banner aberto.
  const [rascunhoPendente, setRascunhoPendente] = useState<Rascunho | null>(null)
  // MOV-11 — o "agora" do tempo relativo do banner ("salvo há 2 h"). Lido UMA
  // vez pelo inicializador de função do `useState` (só roda na 1ª renderização
  // desta montagem) — nunca `Date.now()` direto no corpo do componente, que a
  // regra de pureza do React recusa (a mesma montagem não precisa de um
  // relógio vivo: é um valor exibido uma vez, não um cronômetro).
  const [agoraRascunho] = useState(() => Date.now())
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
  // Último rascunho que o debounce ainda não gravou. `null` = nada a gravar
  // (montagem intocada, banner aberto, sucesso, lote vazio) — ver o flush de
  // desmontagem mais abaixo.
  const pendenteDeGravar = useRef<Rascunho | null>(null)
  // MOV-01a — o box de erros (`role="alert"`) nasce ACIMA do stepper: sem
  // foco nem rolagem ele fica fora da viewport no passo 2 (o mais longo), e o
  // clique em "Revisar" parece inerte. `tabIndex={-1}` no box (ver JSX) +
  // foco/scroll no efeito abaixo.
  const errosRef = useRef<HTMLDivElement>(null)

  const tiposValidos = useMemo(
    () => tiposDoLote(itens.map((i) => i.status)),
    [itens],
  )
  const estadosMistos = useMemo(
    () => new Set(itens.map((i) => i.status)).size > 1,
    [itens],
  )

  const jaAdicionados = useMemo(() => new Set(itens.map((i) => i.id)), [itens])
  // F26 — os ativos da metade OPOSTA, quando ela está ativa. FONTE ÚNICA das
  // duas contas que o passo 1 precisa fazer e não fazia: o teto é do ENVIO
  // inteiro (a contagem, o "lote cheio" e a prévia do colar-lista contavam só o
  // lote principal, enquanto o registrar contava a soma) e estes ativos não
  // entram no lote principal — o `adicionar`/`adicionarVarios` os recusa, então
  // prometê-los na prévia era prometer o que não ia acontecer.
  const naOutraMetade = useMemo(
    () =>
      contrapartidaAtiva(config, contrapartida)
        ? new Set(contrapartida.itens.map((a) => a.id))
        : new Set<string>(),
    [config, contrapartida],
  )
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

  // F26 — o estado da contrapartida é DERIVADO da Config (tipo + código do
  // motivo), e toda mudança de Config passa por aqui. Quando a config nova deixa
  // de oferecer a seção, o ESTADO dela morre junto — senão um lote da
  // contrapartida sobreviveria invisível e voltaria ao aparecer de novo. Quando
  // ela passa a ser oferecida, nasce com o prefill do colaborador (capturado do
  // lote em memória, ANTES de qualquer insert).
  function sincronizarContrapartida(anterior: Config, proxima: Config) {
    const oferecia = ofereceContrapartida(anterior)
    const oferece = ofereceContrapartida(proxima)
    // Só a TRANSIÇÃO mexe no estado. Sem esta linha, cada tecla digitada em
    // Observação/Chamado de uma movimentação COMUM gravava um objeto novo por
    // caractere (React não faz bail-out por identidade): um segundo agendamento
    // de estado e um re-render do passo 2 inteiro para reescrever o padrão.
    if (oferece === oferecia) return
    setContrapartida((c) => {
      // O marcador "a outra metade já está no banco" atravessa a ida e volta
      // pelo MOTIVO. Ele é do PAR, e limpar o motivo para reescolhê-lo (ou
      // aplicar um kit e desfazer) não troca de par — mas zerava o marcador, e
      // aí o painel reoferecia o atalho para a metade que o operador ACABARA de
      // gravar. Trocar o TIPO, esse sim, é montar outro par: aí ele cai, junto
      // com o resto do estado (é o que `trocarTipo`/`ajustarTipoPara` fazem).
      const marcador = anterior.tipo === proxima.tipo && c.jaRegistrada
      return oferece
        ? { ...nascerContrapartida(proxima, itens), jaRegistrada: marcador }
        : contrapartidaPadrao({ jaRegistrada: marcador })
    })
  }

  // Para quem já tem a Config inteira pronta (repetir última, aplicar kit).
  function aplicarConfig(proxima: Config) {
    setConfig(proxima)
    sincronizarContrapartida(config, proxima)
  }

  function set<K extends keyof Config>(chave: K, valor: Config[K]) {
    marcarAlteracao()
    // O updater FUNCIONAL fica: dois `set` no mesmo handler (React agrupa) não
    // podem perder o primeiro por causa da Config velha do closure. Só a
    // DECISÃO sobre a contrapartida usa o valor derivado — e ela depende de um
    // campo só (tipo ou motivo), nunca de dois ao mesmo tempo.
    setConfig((c) => ({ ...c, [chave]: valor }))
    sincronizarContrapartida(config, { ...config, [chave]: valor })
  }

  function setContrapartidaCampo<K extends keyof ContrapartidaTroca>(
    chave: K,
    valor: ContrapartidaTroca[K],
  ) {
    marcarAlteracao()
    // Adiar com a seção JÁ PREENCHIDA tira aquele trabalho do envio — e recolher
    // a seção o esconde da tela no mesmo gesto. O atalho da tela de sucesso leva
    // tipo, motivo e destino, nunca equipamento nem termo nem checklist, então
    // sumir em silêncio seria perder trabalho sem dizer.
    //
    // O colaborador só conta quando é do OPERADOR (`prefillColaborador` é o
    // último valor automático): a seção NASCE com esse campo preenchido, e
    // avisar por causa dele faria o toast disparar em toda contrapartida adiada.
    if (chave === 'deixarParaDepois' && valor === true) {
      const n = contrapartida.itens.length
      const perdeCampos =
        contrapartida.colaborador !== contrapartida.prefillColaborador ||
        contrapartida.setor !== '' ||
        contrapartida.termo !== '' ||
        contrapartida.termoData !== '' ||
        contrapartida.itensFaltantes.length > 0
      if (n > 0 || perdeCampos) {
        const oQue =
          n > 0
            ? `${n} ${n === 1 ? 'equipamento escolhido' : 'equipamentos escolhidos'} e o que você preencheu`
            : 'o que você preencheu'
        toast.warning(
          `A outra metade fica de fora deste registro: ${oQue} na seção da troca não vai junto, e o atalho da tela de sucesso não leva isso de volta. Desmarque para registrar a troca inteira agora.`,
        )
      }
    }
    setContrapartida((c) => ({ ...c, [chave]: valor }))
  }

  // Trocar o tipo limpa os campos específicos do tipo anterior — senão um motivo
  // (ou filial destino / itens) de um tipo vaza para outro sem o usuário ver. O
  // motivo zerado já derruba a contrapartida (via `aplicarConfig`).
  function trocarTipo(tipo: TipoMovimentacao) {
    marcarAlteracao()
    const limpeza = {
      tipo,
      motivo: '',
      chamadoFornecedor: '',
      filialDestinoId: '',
      itensFaltantes: [],
    }
    setConfig((c) => ({ ...c, ...limpeza }))
    // `motivo: ''` já basta para a seção não ser oferecida — a sincronização
    // apaga o estado dela junto, sem depender de mais nada da Config velha.
    sincronizarContrapartida(config, { ...config, ...limpeza })
    setStatusResultante('')
  }

  // Ao mudar o lote, se o tipo escolhido deixar de ser valido para todos, limpa.
  // `entrantes` sao os ativos que acabaram de entrar no lote (na pratica um so —
  // eles entram um a um pelo combobox): quando a limpeza acontece por causa
  // deles, o toast nomeia o culpado com os rotulos do dominio, em vez do reset
  // mudo de antes (F9/M7). Remocao nunca estreita a intersecao, entao so
  // `adicionar` passa entrantes.
  // Devolve `true` quando o tipo foi limpo (e, com ele, a contrapartida) — quem
  // chama usa isso para não re-sincronizar o prefill de um par que já morreu.
  function ajustarTipoPara(
    lista: AtivoResumo[],
    entrantes: AtivoResumo[] = [],
  ): boolean {
    const tipoAtual = config.tipo
    const validos = tiposDoLote(lista.map((i) => i.status))
    if (!tipoAtual || validos.includes(tipoAtual)) return false
    // MOV-07 — o tipo cai porque o ativo que entrou estreitou a interseção; os
    // campos DO TIPO caem com ele (senão o motivo do tipo antigo fica no lote).
    setConfig((c) =>
      c.tipo && !validos.includes(c.tipo)
        ? { ...c, tipo: '', ...CAMPOS_DO_TIPO_VAZIOS }
        : c,
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
        `${rotuloPatrimonio(culpado.patrimonio)} (${rotuloStatus(culpado.status)}) não permite "${rotuloTipo(tipoAtual)}" — o tipo foi limpo.`,
      )
    }
    return true
  }
  function adicionar(a: AtivoResumo) {
    if (itens.some((p) => p.id === a.id)) return
    // A recusa só vale enquanto a outra metade está ATIVA na tela. Com a seção
    // recolhida por "deixar para depois" — ou com a config já não oferecendo o
    // par —, ela é invisível, e recusar por causa dela seria uma mensagem sobre
    // algo que o operador não vê. Se ele reabrir a seção com o mesmo ativo nas
    // duas, `validarPar` barra o envio com a mensagem certa.
    if (
      contrapartidaAtiva(config, contrapartida) &&
      contrapartida.itens.some((p) => p.id === a.id)
    ) {
      toast.warning(
        `${rotuloPatrimonio(a.patrimonio)} já está na outra metade da troca — um ativo não entra nas duas.`,
      )
      return
    }
    // MOV-04 — o teto é do ENVIO inteiro (a soma das duas metades, quando a
    // contrapartida está ativa): `adicionarVarios` e `adicionarContrapartida`
    // já cortavam por aqui, mas o caminho um-a-um (este combobox) deixava
    // passar o 31º, 32º… e o erro só estourava no Zod do Revisar, longe do
    // gesto que causou. Mesma estrutura de toast que `adicionarContrapartida`
    // usa ao recusar pelo teto — só o sujeito muda quando não há par ativo
    // (não existe "a outra metade" pra nomear).
    if (itens.length + naOutraMetade.size >= MAX_LOTE_MOVIMENTACAO) {
      toast.warning(
        naOutraMetade.size > 0
          ? `As duas metades já somam ${MAX_LOTE_MOVIMENTACAO} ativos, o teto do lote. Registre este par e comece outro.`
          : `O lote atingiu o teto de ${MAX_LOTE_MOVIMENTACAO} ativos. Registre este e comece outro.`,
      )
      return
    }
    const next = [...itens, a]
    marcarAlteracao()
    setItens(next)
    // F26 — o prefill acompanha o lote enquanto o campo for do sistema: juntar um
    // notebook de OUTRO detentor tem de apagar o nome que já estava lá.
    if (!ajustarTipoPara(next, [a])) {
      setContrapartida((c) => sincronizarPrefill(config, c, next))
    }
  }

  // F10/M1 — entrada em massa (colar lista). O resolver do W1 devolve tudo o que
  // achou: o teto e o dedup contra o lote atual sao AQUI (funcao pura
  // compartilhada com o dialog), e o que ficou de fora e dito em voz alta.
  // A intersecao de tipos e reaplicada com os entrantes — exatamente como no
  // `adicionar` um a um (o resolver nao filtra por estado, de proposito).
  function adicionarVarios(novos: AtivoResumo[]) {
    // F26 — a lista COLADA passa pelas mesmas duas guardas do combobox, que até
    // aqui só existiam no `adicionar` um a um: o ativo que está na metade oposta
    // ATIVA não entra (seria o mesmo ativo nas duas metades) e o teto conta a
    // SOMA das metades. Sem isso o operador só descobria no "Revisar", com o
    // lote já montado por cima.
    const comPar = naOutraMetade.size > 0
    const repetidos = novos.filter((a) => naOutraMetade.has(a.id))
    const r = mesclarAtivosNoLote(
      itens,
      novos.filter((a) => !naOutraMetade.has(a.id)),
      MAX_LOTE_MOVIMENTACAO - naOutraMetade.size,
    )
    if (repetidos.length > 0) {
      toast.warning(
        `${repetidos.length} ${repetidos.length === 1 ? 'ativo já está' : 'ativos já estão'} na outra metade da troca e ${repetidos.length === 1 ? 'ficou' : 'ficaram'} de fora — um ativo não entra nas duas.`,
      )
    }
    if (r.adicionados.length > 0) {
      marcarAlteracao()
      setItens(r.lote)
      if (!ajustarTipoPara(r.lote, r.adicionados)) {
        setContrapartida((c) => sincronizarPrefill(config, c, r.lote))
      }
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
        `${r.excedentes.length} ${r.excedentes.length === 1 ? 'ativo ficou' : 'ativos ficaram'} de fora: o lote aceita ${MAX_LOTE_MOVIMENTACAO}${comPar ? ' ativos ao todo, somando as duas metades da troca' : ''}. Registre o resto em outro lote.`,
      )
    }
  }
  function remover(id: string) {
    const posicao = itens.findIndex((p) => p.id === id)
    const next = itens.filter((p) => p.id !== id)
    if (next.length === itens.length) return
    marcarAlteracao()
    setItens(next)
    // F38 · D13 — os "itens que vão junto" apontam o equipamento por POSIÇÃO no
    // lote. Tirar um ativo do meio desloca todo mundo depois dele: sem este
    // reajuste, o fone que ia com o 3º equipamento passaria a ir com o 4º, em
    // silêncio, e o operador só descobriria olhando a ficha errada depois.
    // Achado da revisão adversarial da fase.
    setConfig((c) => {
      const junto = c.itensJunto ?? []
      if (junto.length === 0) return c
      return {
        ...c,
        itensJunto: junto
          // A linha que apontava o ativo REMOVIDO some junto com ele.
          .filter((l) => l.indice !== posicao)
          .map((l) => (l.indice > posicao ? { ...l, indice: l.indice - 1 } : l)),
      }
    })
    // Remover nunca estreita a interseção, então `ajustarTipoPara` não limpa
    // nada aqui — mas o prefill precisa acompanhar: tirar o notebook do outro
    // detentor devolve o lote a um dono só, e o nome volta a ser honesto.
    if (!ajustarTipoPara(next)) {
      setContrapartida((c) => sincronizarPrefill(config, c, next))
    }
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
        `${rotuloPatrimonio(a.patrimonio)} já está na outra metade da troca — um ativo não entra nas duas.`,
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
        `${rotuloPatrimonio(a.patrimonio)} (${rotuloStatus(a.status)}) não permite "${rotuloTipo(alvo)}" — escolha outro equipamento para a troca.`,
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
    // ATV-03 — chegar com o lote pronto da lista é chegar POR LINK: o banner de
    // rascunho não pode oferecer a restauração de outra visita por cima dos
    // cinco ativos que o operador acabou de escolher.
    const veioDeLink = Boolean(ativosDeAbertura.length > 0 || configInicial)
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
    if (!hidratado || !podeSalvar || rascunhoPendente || sucesso) {
      pendenteDeGravar.current = null
      return
    }
    if (itens.length === 0) {
      pendenteDeGravar.current = null
      const vazio = setTimeout(() => limparRascunho(), 400)
      return () => clearTimeout(vazio)
    }
    const rascunho: Rascunho = {
      ids: itens.map((a) => a.id),
      config,
      statusResultante,
      passo,
      // F28/MOV-11 — snapshot para o banner "lote não registrado" mostrar
      // QUAIS ativos, de que TIPO e QUANDO. `patrimonio` nulo (ativo sem
      // plaqueta) vira string vazia — o mesmo sentinela que o resto do módulo
      // usa para "sem valor" (ver `rotuloPatrimonio`/`sanearConfig`).
      patrimonios: itens.map((a) => a.patrimonio ?? ''),
      tipo: config.tipo,
      salvoEm: new Date().toISOString(),
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
              // F38 — o OUTRO desfecho do mesmo checklist. `rascunho.ts` já
              // saneava o campo na volta, mas ninguém o gravava na ida: o
              // "Voltou" da devolução da troca sumia no restore enquanto o
              // "Faltou" ao lado sobrevivia.
              itensDevolvidos: contrapartida.itensDevolvidos ?? [],
              deixarParaDepois: contrapartida.deixarParaDepois,
              jaRegistrada: contrapartida.jaRegistrada,
              prefillColaborador: contrapartida.prefillColaborador,
            },
          }
        : {}),
    }
    // O mesmo rascunho fica à mão para o flush da desmontagem (abaixo).
    pendenteDeGravar.current = rascunho
    const t = setTimeout(() => salvarRascunho(rascunho), 400)
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

  // Flush na SAÍDA da montagem. A `key` por searchParams (page.tsx) remonta o
  // formulário em qualquer navegação que mude um param — o atalho do painel, mas
  // também voltar para `/movimentacoes/nova` limpo pelo botão do header. O lote
  // não pode depender de os 400ms do debounce terem passado para sobreviver a
  // isso: na desmontagem o rascunho vai para o storage na hora, e o banner o
  // oferece de volta na tela seguinte.
  useEffect(() => {
    return () => {
      const r = pendenteDeGravar.current
      if (r) salvarRascunho(r)
    }
  }, [])

  async function restaurarRascunho() {
    const r = rascunhoPendente
    if (!r || restaurando) return
    setRestaurando(true)
    try {
      const idsContra = r.contrapartida?.ids ?? []
      // Uma consulta só para as duas metades. Os ids são deduplicados AQUI, e
      // não só dentro da query: um ativo pode legitimamente estar nas duas
      // metades do rascunho (com a seção recolhida por "deixar para depois" o
      // `adicionar` não o recusa), e contar o pedido com repetição fazia o aviso
      // de ausentes acusar um ativo que estava lá.
      const idsPedidos = [...new Set([...r.ids, ...idsContra])]
      const ativos = await buscarResumoDeAtivosPorIds(idsPedidos)
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
        // MOV-07 — os campos DO TIPO caem junto com ele: o rascunho dormiu, o
        // estado do ativo mudou, e o motivo salvo pertence ao tipo que caiu.
        cfg = { ...cfg, tipo: '', ...CAMPOS_DO_TIPO_VAZIOS }
      }

      // F26 — a metade oposta passa pela MESMA re-checagem, com o tipo DELA.
      let contra = contrapartidaPadrao()
      // Sem o tipo da metade principal não há par: a contrapartida salva cai
      // inteira — mas EM VOZ ALTA. Cair calada era o defeito: o operador via só
      // "o tipo não vale mais" e perdia os equipamentos da outra metade sem
      // nenhum aviso de que eles existiam.
      if (r.contrapartida && r.contrapartida.ids.length > 0 && !ofereceContrapartida(cfg)) {
        toast.warning(
          `A troca deste rascunho tinha ${r.contrapartida.ids.length} ${r.contrapartida.ids.length === 1 ? 'equipamento na outra metade' : 'equipamentos na outra metade'}, e eles ficaram de fora: sem o tipo e o motivo da troca não há par. Escolha o tipo e monte a troca de novo.`,
        )
      }
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
          // F38 — o par do `itensFaltantes` acima. Ausente no rascunho antigo =>
          // `undefined`, e `contrapartidaPadrao` o troca por lista vazia.
          itensDevolvidos: r.contrapartida.itensDevolvidos,
          deixarParaDepois: r.contrapartida.deixarParaDepois,
          // `jaRegistrada` volta junto: sem ela, um rascunho salvo na tela que
          // veio do atalho ressuscitava o laço ao ser restaurado numa URL limpa.
          jaRegistrada: r.contrapartida.jaRegistrada,
          // Ausente no rascunho antigo => `undefined`, que difere de qualquer
          // `colaborador` string: o campo passa a ser tratado como do operador e
          // o prefill nunca o sobrescreve. É o lado seguro.
          prefillColaborador: r.contrapartida.prefillColaborador,
        })
      }

      const ausentes = idsPedidos.length - ativos.length
      if (ausentes > 0) {
        toast.warning(
          `${ausentes} ${ausentes === 1 ? 'ativo do rascunho não foi encontrado' : 'ativos do rascunho não foram encontrados'} e ficaram de fora.`,
        )
      }

      // F38 · D13 — os "itens que vão junto" apontam o equipamento por POSIÇÃO, e
      // o lote acabou de ser remontado sem os ativos que sumiram. Sem reancorar
      // pelo id, o fone do 3º equipamento passaria a acompanhar outro, em silêncio.
      const juntoAntes = cfg.itensJunto ?? []
      const juntoDepois = reindexarItensJunto(
        juntoAntes,
        r.ids,
        principais.map((a) => a.id),
      )
      if (juntoDepois.length < juntoAntes.length) {
        const perdidos = juntoAntes.length - juntoDepois.length
        toast.warning(
          `${perdidos} ${perdidos === 1 ? 'item que ia junto acompanhava um equipamento que ficou de fora e foi removido' : 'itens que iam junto acompanhavam equipamentos que ficaram de fora e foram removidos'}.`,
        )
      }
      cfg = { ...cfg, itensJunto: juntoDepois }

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
    // MOV-07 — motivo/termo/termoData são do TIPO: com `tipoValido === false`
    // o tipo atual sobrevive (o operador escolhe outro), mas aplicar os três
    // campos do tipo antigo gravava algo incoerente e invisível (Zod só exige
    // `min(1)`, sem checar `aplica_a`). `camposDaRepeticao` decide isso —
    // pura e testada (`repetir-ultima.test.ts`).
    const { motivo, termo, termoData } = camposDaRepeticao(ultimaMov, tipoValido)
    aplicarConfig({
      ...config,
      tipo: tipoValido ? ultimaMov.tipo : config.tipo,
      motivo,
      colaborador: ultimaMov.colaborador ?? '',
      setor: ultimaMov.setor ?? '',
      chamado: ultimaMov.chamado ?? '',
      termo,
      termoData,
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
      // F26 — o ÍNDICE do item diz de qual metade veio a mensagem: os da
      // contrapartida vêm depois dos principais (`montarItensDoPar`). Sem o
      // prefixo, "Informe o colaborador ou o setor de destino" aparecia numa
      // DEVOLUÇÃO — que nem tem esses campos — e o operador procurava o erro na
      // metade errada. As mensagens do `validarPar` já nomeiam a metade.
      //
      // Os campos COMPARTILHADOS ficam sem prefixo: `configDaContrapartida` copia
      // `data`/`chamado`/`observacao` da principal, então um deles inválido falha
      // nos DOIS itens. Prefixar o segundo mandaria procurar um campo Data dentro
      // da seção da troca (que não tem nenhum) e, pior, quebraria o `new Set` do
      // fim — as duas strings passariam a diferir e o mesmo erro sairia duas vezes.
      const alvoOposto = contrapartidaAtiva(config, contrapartida)
        ? tipoContrapartida(config.tipo)
        : null
      for (const issue of parsed.error.issues) {
        const i = typeof issue.path[1] === 'number' ? issue.path[1] : -1
        const campo = typeof issue.path[2] === 'string' ? issue.path[2] : ''
        msgs.push(
          alvoOposto && i >= itens.length && !CAMPOS_COMPARTILHADOS.includes(campo)
            ? `${rotuloTipo(alvoOposto)} da troca: ${issue.message}`
            : issue.message,
        )
      }
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
        // F38 · D13 — os periféricos que vão (ou voltam) junto, já na numeração
        // que a RPC espera: principal primeiro, contrapartida deslocada.
        itensJunto: montarItensJuntoDoLote({
          config,
          totalPrincipal: submetidosPrincipal.length,
          contrapartida,
          totalContrapartida: submetidosContra.length,
          // Os lotes vão junto para a regra do checklist homogêneo poder olhar
          // filial e detentor — sem eles, um lote misto lançaria na prateleira
          // errada e na conta de quem não devolveu.
          lotePrincipal: submetidosPrincipal,
          loteContrapartida: submetidosContra,
        }),
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

    if (res.criadas > 0) {
      // Sucesso fecha o rascunho: o que entrou nao pode ser reoferecido como
      // "lote não registrado" na proxima visita (M6).
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
      // fica pendente no servidor — é só navegação (decisão "só a tela"). E não
      // se oferece o atalho na tela que JÁ É a metade que faltava.
      const campoDoOperador =
        contrapartida.colaborador !== contrapartida.prefillColaborador
      const pendente: ContrapartidaPendente | null =
        deveOferecerAtalho(config, contrapartida) && alvo
          ? {
              tipo: alvo,
              // O que o operador DIGITOU na seção vem primeiro: adiar não pode
              // jogar fora o destino que ele já tinha escrito. Quem responde
              // "digitou?" é `prefillColaborador` — o último valor que o
              // automático escreveu —, e NÃO "o campo está vazio": apagar o nome
              // é a forma de dizer "não é para essa pessoa" (o equipamento novo
              // vai para um setor), e cair no nome derivado ali ressuscitaria
              // justamente quem o operador tirou. Só o campo INTOCADO recalcula,
              // do lote capturado antes do insert (depois dele o trigger zera
              // `colaborador_atual`).
              colaborador: campoAplica(alvo, 'colaborador')
                ? campoDoOperador
                  ? contrapartida.colaborador
                  : prefillContrapartida(submetidosPrincipal)
                : '',
              setor: campoAplica(alvo, 'setor') ? contrapartida.setor : '',
              origemMovimentacaoId:
                grupos[0]?.ativos.find((a) => a.movimentacaoId)?.movimentacaoId ?? '',
            }
          : null
      setSucesso({ criadas: res.criadas, grupos, pendente })
      if (res.avisosVinculo?.length) {
        // §C.3 — a devolução repôs o estoque, mas alguma linha saiu sem baixar
        // conta de ninguém. Não é erro; é o que aconteceu, dito na cara.
        for (const aviso of res.avisosVinculo) toast.info(aviso)
      }
      router.refresh()
      return
    }

    // ---------------------------------------------------------------------
    // FALHA — e desde a F38 ela é sempre TOTAL (decisão do Johnny, 28/08/2026).
    // ---------------------------------------------------------------------
    // O lote inteiro passa por `criar_movimentacao_com_itens` (0117), numa
    // transação: ou tudo, ou nada. Não existe mais "meio lote", e por isso três
    // coisas que existiam aqui deixaram de existir:
    //
    //   · `jaRegistrados` — nada entrou, não há chip de "já registrado" a mostrar;
    //   · o toast "N registrada(s); M falhou(aram)" — nenhuma foi registrada;
    //   · a poda do lote pelos que falharam — o lote volta INTEIRO, porque é ele
    //     inteiro que precisa ser corrigido e reenviado.
    //
    // O que o operador precisa saber, e nesta ordem: **nada foi gravado**, QUAL
    // linha derrubou o lote, POR QUÊ, e o que fazer.
    const novosErros: Record<string, string> = {}
    for (const r of res.resultados) {
      if (!r.ok && r.erro) novosErros[r.ativo_id] = r.erro
    }
    setErrosPorAtivo(novosErros)

    // O lote volta como estava: nada foi gravado, nada some da tela.
    setItens(submetidosPrincipal)
    if (comPar) {
      setContrapartida((c) => ({ ...c, itens: submetidosContra }))
    }
    setPasso(2)

    const culpada = res.linhaQueFalhou
    const patrimonioCulpado =
      culpada !== undefined
        ? (submetidos[culpada]?.patrimonio ?? null)
        : null
    toast.error(
      patrimonioCulpado
        ? `Nada foi gravado. O lote parou em ${rotuloPatrimonio(patrimonioCulpado)} — corrija e envie de novo.`
        : 'Nada foi gravado. Veja o erro apontado no item e envie o lote de novo.',
    )
  }

  // MOV-01a — sempre que `erros` passa a ter itens (validação local em
  // `avancarParaRevisao` OU o retorno que devolve pro passo 2 aqui em
  // `registrar`), leva o foco pro alerta e rola até ele — um efeito só cobre
  // as duas origens, disparado pela MUDANÇA de estado em vez de duplicado em
  // cada `setErros`. Mesmo padrão de foco pós-ação do encadeamento de termos
  // (`painel-sucesso.tsx`, `tituloRef`/`proximoRef`).
  useEffect(() => {
    if (erros.length === 0) return
    errosRef.current?.focus()
    errosRef.current?.scrollIntoView({ block: 'nearest' })
  }, [erros])

  // MOV-10 — `opts?.manterConfig` é o "Registrar outro lote com os mesmos
  // campos" do painel de sucesso: o lote (itens), a contrapartida, os erros e
  // o rascunho SEMPRE são zerados (é lote NOVO — os ativos do lote anterior já
  // foram registrados, repeti-los duplicaria a movimentação); só `config` e
  // `statusResultante` sobrevivem quando pedido. Chamada sem argumento
  // continua o "do zero" de sempre — `onReiniciar={reiniciar}` no JSX abaixo
  // não precisa mudar.
  function reiniciar(opts?: { manterConfig?: boolean }) {
    setItens([])
    if (!opts?.manterConfig) {
      setConfig(configPadrao())
      setStatusResultante('')
    }
    setContrapartida(contrapartidaPadrao())
    // Lote do zero: esta montagem deixa de ser "a metade que faltava", e o
    // atalho volta a valer para uma troca nova que o operador adie.
    setErros([])
    setErrosPorAtivo({})
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
    // MOV-08 — a consulta de possíveis duplicatas (passo 3) está em voo logo
    // ao montar; um 2º Enter em seguida despachava `registrar()` antes da
    // resposta chegar, e o aviso (único propósito do passo) nunca era visto.
    // Ignora SÓ o Enter aqui — o clique no botão (`onRegistrar` direto, sem
    // passar por este handler) continua livre, decisão registrada.
    else if (passo === 3 && !consultandoDuplicatas) registrar()
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

  // MOV-11 — o banner do rascunho ganha QUAIS ativos, de que TIPO e QUANDO.
  // As três pontas são OPCIONAIS por natureza (`Rascunho`): rascunho salvo
  // antes desta fase não tem `patrimonios`/`tipo`/`salvoEm`, e o resultado
  // vazio faz o trecho correspondente simplesmente não renderizar — fallback
  // obrigatório para o texto de hoje (só a contagem), nunca "undefined".
  const patrimoniosRascunho = rascunhoPendente?.patrimonios ?? []
  const resumoPatrimoniosRascunho =
    patrimoniosRascunho.length > 0
      ? patrimoniosRascunho
          .slice(0, 2)
          .map((p) => p || 'sem patrimônio')
          .join(', ') + (patrimoniosRascunho.length > 2 ? '…' : '')
      : ''
  const tipoRascunho = rascunhoPendente?.tipo
  const resumoTipoRascunho =
    tipoRascunho && ehTipoMovimentacao(tipoRascunho) ? rotuloTipo(tipoRascunho) : ''
  const resumoTempoRascunho = rascunhoPendente?.salvoEm
    ? formatTempoRelativo(rascunhoPendente.salvoEm, agoraRascunho)
    : ''

  return (
    <div onKeyDown={onKeyDown} className="space-y-6">
      <p role="status" className="sr-only">
        {avisoContrapartida}
      </p>

      {/* MOV-14 — `?duplicar=`/`?ativo=` apontava pra um id apagado (Zona
          destrutiva) ou quebrado: sem aviso, o wizard abria vazio em
          silêncio.
          ATV-03 (F30) — o MESMO banner atende o `?ativos=` da seleção múltipla,
          com a diferença de que ali o lote pode abrir PARCIAL: a frase vem
          pronta do servidor e diz quantos ficaram de fora e por quê. Os dois
          casos são excludentes (são ramos diferentes da mesma leitura de URL),
          e `origemInvalida` tem precedência por ser o caso em que nada abriu. */}
      {(origemInvalida || avisoLote) && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            {origemInvalida === 'duplicar'
              ? 'A movimentação de origem não foi encontrada — o formulário abriu em branco.'
              : origemInvalida === 'ativo'
                ? 'O ativo de origem não foi encontrado — o formulário abriu em branco.'
                : avisoLote}
          </p>
        </div>
      )}

      {/* F10/M6 — lote não registrado desta aba (sessionStorage) */}
      {rascunhoPendente && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <FileClock className="size-4 shrink-0" />
          <p className="min-w-0 flex-1">
            Você tem um lote não registrado —{' '}
            <span className="font-medium tabular-nums">
              {rascunhoPendente.ids.length}
            </span>{' '}
            {rascunhoPendente.ids.length === 1 ? 'ativo' : 'ativos'}
            {resumoPatrimoniosRascunho && ` (${resumoPatrimoniosRascunho})`}
            {resumoTipoRascunho && ` · ${resumoTipoRascunho}`}
            {resumoTempoRascunho && ` · salvo ${resumoTempoRascunho}`}.
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
                  // F29/UXG-03 — o stepper é o caminho de volta do lote (voltar ao
                  // passo 1 para acrescentar um ativo) e tinha ~28px no celular, que
                  // é onde o lote é montado. `min-h` porque o botão é uma pílula
                  // `inline-flex` dentro de um <li>: altura fixa quebraria o
                  // alinhamento com as setas "→" entre os passos.
                  'flex min-h-10 items-center gap-2 rounded-full px-2.5 py-1 font-medium transition-colors sm:min-h-0 ' +
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
          quem não vê a tela. MOV-01a — o box fica ACIMA do stepper, fora da
          viewport no passo 2 (o mais longo): `tabIndex={-1}` + o efeito lá em
          cima levam foco e rolagem até aqui sempre que `erros` ganha itens. */}
      {erros.length > 0 && (
        <div
          ref={errosRef}
          tabIndex={-1}
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
          naOutraMetade={naOutraMetade}
          jaAdicionados={jaAdicionados}
          comandoRef={comandoRef}
          papel={papel}
          filiaisEscrita={filiaisEscrita}
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
          tiposItem={tiposItem}
          itensCatalogo={itensCatalogo}
          filiais={filiais}
          papel={papel}
          filiaisEscrita={filiaisEscrita}
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
          statusResultante={statusResultante}
          contrapartida={contrapartida}
          filiais={filiais}
          motivos={motivos}
          rotulosTipo={rotulosTipo}
          enviando={enviando}
          onVoltar={() => setPasso(2)}
          onRegistrar={registrar}
          onConsultandoDuplicatasChange={setConsultandoDuplicatas}
        />
      )}
    </div>
  )
}
