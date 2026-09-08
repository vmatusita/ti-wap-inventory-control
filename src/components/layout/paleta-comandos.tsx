'use client'

// A PALETA DE COMANDOS (Ctrl+K) — e as duas coisas que ela é, além de um atalho.
//
// 1. É UM DOS DOIS CALL-SITES QUENTES DE `buscarAtivosParaMovimentacao` (import na
//    linha 75; a busca com debounce por volta da 376-399): debounce de 300 ms a
//    partir de 2 caracteres, disparado A CADA TECLA.
//
//    O outro é `components/movimentacoes/ativo-combobox.tsx` (linha ~110), com
//    debounce e piso IDÊNTICOS. Os dois se distinguem pelo alcance, não pela
//    mecânica: a paleta está montada em TODA tela do shell do operador e responde a
//    Ctrl+K, mas é um atalho OPCIONAL; o combobox aparece em menos telas e é
//    OBRIGATÓRIO — toda movimentação passa por ele. **Não há medição no repositório
//    que diga qual dos dois é mais chamado**, e por isso este comentário não afirma
//    que a paleta é "o mais quente": seria suposição escrita como fato.
//
//    O que importa para a F49 vale para os dois: a guarda que ela acrescentou àquela
//    action (`exigirPapel(supabase, 'consulta')`) foi MEDIDA antes de entrar — 72,7 ms
//    de mediana e 90,5 ms de p95 por chamada, contra o Supabase de produção, visto da
//    mesa (`docs/perf/f49-guarda.json`). Nem a paleta nem o combobox ganharam uma
//    linha de código por causa disso: a guarda mora na action, e daqui ela é de graça.
//
// 2. É UMA SUPERFÍCIE DE AUTORIZAÇÃO DE UI **PARALELA** AO `sidebar-nav`. As flags
//    `soAdmin`/`soDev` (declaradas em 106 e 109) e o `podeEscrever` (declarado em 312,
//    filtrando o grupo "Ações" na 441) decidem o que cada cargo VÊ aqui — e são uma
//    segunda cópia da mesma pergunta que a sidebar já faz. O comentário da lista de
//    navegação diz "Espelha o sidebar-nav.tsx" — espelho é exatamente o problema,
//    porque um espelho envelhece sozinho. O lugar onde essa pergunta deveria morar é
//    `src/components/layout/permissoes.ts`, que já concentra a decisão para a sidebar.
//
//    ⚠ E ISTO NÃO É SEGURANÇA — o próprio `permissoes.ts` diz, no fim do cabeçalho
//    dele, que esconder um botão é ergonomia. Quem impede a ação é a guarda dentro da
//    Server Action, não a ausência da entrada nesta lista.
//
// 3. O `podeLer` DA F50 CHEGOU — e entrou onde este cabeçalho dizia que entraria: no
//    filtro das entradas de navegação, ao lado de `soAdmin`/`soDev`, e NÃO no
//    resultado da busca de ativos (que é recorte de filial, assunto de F57/F70, não
//    de leitura). Ele desce por prop do `(app)/layout.tsx`, resolvido por
//    `podeLer(operador)` de `@/components/layout/permissoes`, junto de `podeEscrever`,
//    `eAdmin` e `eDev`.
//
//    Hoje ele é `true` para todo mundo que vê esta paleta — o ramo do layout que a
//    monta está inteiro dentro do `if (operador)` —, então NADA mudou de aparência.
//    O ganho é ter UM lugar para mudar quando o piso de leitura deixar de ser
//    universal, em vez de sete perguntas "existe operador?" espalhadas.
//
//    ⚠ Os números de linha que este item citava (106/109/312/441) estavam VELHOS —
//    medido na F50: `soAdmin` está na 115, `soDev` na 118, o tipo de `podeEscrever`
//    na 321 e o grupo "Ações" na 450; só o filtro de navegação continuou na 441.
//    Por isso este item passou a citar os nomes, e não as linhas: nome não envelhece
//    a cada `import` novo. (O item 1 tem o mesmo defeito: o import que ele chama de
//    "linha 75" está na 84.)
//
// ⚠ O `{r.filial_nome}` do resultado FICA. Tirá-lo mudaria o que o operador vê hoje e
// anteciparia recorte que não é desta fase — decisão do Johnny, 08/09/2026.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CircleHelp,
  ClipboardList,
  History,
  LayoutDashboard,
  Package,
  PackagePlus,
  PackageX,
  Plus,
  Settings,
  Tag,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import { StatusBadge } from '@/components/ativos/status-badge'
import { editando, modalAberto } from '@/components/movimentacoes/atalho-global'
import { dispararLancarItem } from '@/components/itens/lancar-item-evento'
import { buscarAtivosParaMovimentacao } from '@/lib/actions/movimentacoes'
import { casaBusca, normalizarBusca } from '@/lib/ajuda/busca'
import { rotuloCategoria } from '@/lib/dominio'
import { lerAtivosRecentes, type AtivoRecente } from '@/lib/ativos/ativos-recentes'
import type { AtivoResumo } from '@/lib/queries/ativos'
import type { EntradaPaleta } from '@/lib/ajuda/tipos'

// Paleta de comandos global (OS-F11 / T1). Um unico ponto de entrada para
// "achar um ativo" e "ir para uma tela", no lugar da busca isolada de cada lista.
//
// Escopo de montagem: SO o shell do OPERADOR. O visualizador por senha
// (cookie httpOnly, restrito a /relatorios/**) nao ve a paleta nem os atalhos —
// o `(app)/layout.tsx` monta este provider apenas no ramo do operador.
//
// Busca de ativos: reusa o proxy `buscarAtivosParaMovimentacao` (o mesmo do
// combobox de movimentacao — patrimonio, service tag, hostname, marca, modelo e
// colaborador desde a F9). Nao existe indice proprio: um lugar so para mudar a
// regra de busca. Mecanica copiada do `ativo-combobox`: minimo de 2 caracteres,
// debounce de 300ms, estado de carregando e resultado vazio explicito.

type ItemNavegacao = {
  rotulo: string
  href: string
  icone: LucideIcon
  // Termos extras que tambem devem casar (sinonimos do dia a dia).
  apelidos?: string[]
  atalho?: string
  // Rota em que a AÇÃO ja pode ser disparada sem navegar (o dialog dela ja esta
  // montado). Fora dela, o `href` leva ate a tela com o gatilho na URL.
  disparaEm?: string
  // F21 — entrada só do NÍVEL administrador (espelha `soAdmin` do sidebar-nav).
  soAdmin?: boolean
  // F22 — entrada só do cargo dev (espelha `soDev` do sidebar-nav). Flag separada porque
  // `eAdmin` é NÍVEL e o dev o atende: reusar `soAdmin` mostraria /dev a todo administrador.
  soDev?: boolean
}

// Espelha o `sidebar-nav.tsx`. Se a sidebar ganhar/perder item, esta lista
// precisa acompanhar — o grupo "Ir para" e a leitura da navegacao pelo teclado.
const ROTAS: ItemNavegacao[] = [
  { rotulo: 'Dashboard', href: '/', icone: LayoutDashboard, apelidos: ['inicio', 'home'] },
  { rotulo: 'Ativos', href: '/ativos', icone: Package, apelidos: ['equipamentos'] },
  {
    // Integracao F11: a sidebar passou a apontar para a LISTA (M8). O caminho
    // para registrar continua a um gesto — atalho `N` e o grupo Acoes, abaixo.
    rotulo: 'Movimentações',
    href: '/movimentacoes',
    icone: ArrowLeftRight,
    apelidos: ['historico', 'lista', 'entrega', 'devolucao', 'saida', 'entrada'],
  },
  { rotulo: 'Itens', href: '/itens', icone: Boxes, apelidos: ['consumiveis', 'quantidade'] },
  // F42 — as DUAS subrotas de item entram por nome próprio. Elas já aparecem na
  // sidebar quando a seção está aberta, mas quem está em outra tela só chega a
  // elas passando por /itens primeiro — e a paleta existe justamente para poupar
  // esse gesto. Rota que não entra aqui nasce meio invisível.
  {
    rotulo: 'Histórico de itens',
    href: '/itens/historico',
    icone: Boxes,
    apelidos: ['lancamento', 'diario', 'estorno', 'saldo apos'],
  },
  {
    // A conferência é do cargo que ESCREVE (a tela recusa quem não escreve e
    // explica por quê), mas a entrada fica em "Ir para" e não em "Ações": ela
    // NAVEGA para uma rota, não dispara nada — e a paleta já esconde o grupo
    // "Ações" inteiro de quem não escreve.
    rotulo: 'Conferir estoque',
    href: '/itens/conferencia',
    icone: Boxes,
    apelidos: ['conferencia', 'inventario', 'contagem', 'prateleira'],
  },
  { rotulo: 'Pendências', href: '/pendencias', icone: ClipboardList, apelidos: ['termo'] },
  // F25 — o href é substituído por `hrefRelatorios` (resolvido por cargo no layout,
  // igual à sidebar que esta lista espelha). Os apelidos passaram a existir porque o
  // href deixou de conter a palavra 'geral': sem eles, Ctrl+K → "geral" ou
  // "consolidado" pararia de achar a entrada para o operador.
  {
    rotulo: 'Relatórios',
    href: '/relatorios/geral',
    icone: BarChart3,
    apelidos: ['relatorio', 'consolidado', 'geral'],
  },
  {
    rotulo: 'Administração',
    href: '/admin/usuarios',
    icone: Settings,
    // 'kits' entra com a F12/M12 (/admin/kits): sem o apelido, Ctrl+K → "kit"
    // não achava nada e a tela nova ficava sem porta de entrada pelo teclado.
    // 'colaborador'/'pessoa' e 'tipo de item' entram com a F37: as duas abas novas
    // ficam atrás desta única entrada, e sem os apelidos Ctrl+K → "colaborador" não
    // acharia porta de entrada nenhuma pelo teclado.
    apelidos: [
      'usuarios',
      'senhas',
      'filiais',
      'motivos',
      'importar',
      'kits',
      'colaborador',
      'colaboradores',
      'pessoa',
      'tipo de item',
      'tipos',
    ],
    soAdmin: true,
  },
  {
    // F22 — a área técnica. Os apelidos são os nomes dos QUATRO blocos da tela: sem eles,
    // Ctrl+K → "auditoria" ou "cache" não acharia a única tela que os oferece.
    rotulo: 'Desenvolvedor',
    href: '/dev',
    icone: Wrench,
    apelidos: [
      'dev',
      'diagnostico',
      'integridade',
      'checagens',
      'auditoria',
      'trilha',
      'manutencao',
      'cache',
    ],
    soDev: true,
  },
  { rotulo: 'Ajuda', href: '/ajuda', icone: CircleHelp, atalho: '?' },
  {
    // F35 — a tela de versões NÃO tem item na sidebar (decisão da ordem): as
    // portas dela são o badge no pé do menu, a página de ajuda e esta entrada.
    // Sem `soAdmin`/`soDev`: qualquer perfil ativo lê o histórico.
    rotulo: 'Versões do sistema',
    href: '/versoes',
    icone: Tag,
    apelidos: ['versao', 'novidades', 'o que mudou', 'historico do sistema', 'atualizacao'],
  },
]

// TODAS as entradas deste grupo ESCREVEM — é o que "Ações" significa aqui. Por
// isso o grupo inteiro desaparece para o cargo Consulta (F21), sem precisar de
// marcação por item; se um dia entrar uma ação de leitura, ela precisa de flag
// própria em vez de herdar a permissão do grupo.
const ACOES: ItemNavegacao[] = [
  {
    rotulo: 'Nova movimentação',
    href: '/movimentacoes/nova',
    icone: Plus,
    apelidos: ['registrar', 'lote'],
    atalho: 'N',
  },
  {
    // AÇÃO, e não navegação: `?lancar=1` faz /itens abrir o dialog de lançamento
    // já na montagem (LancarItemDialog limpa o param em seguida). Antes este
    // item só navegava — o operador caía na tela e ia procurar o botão, que é o
    // gesto que a paleta existe para poupar (achado F12-W4-08). O atalho `L` é o
    // mesmo que o dialog já escutava desde a F9.
    rotulo: 'Lançar item',
    href: '/itens?lancar=1',
    icone: Boxes,
    apelidos: ['consumivel', 'saldo', 'estoque', 'quantidade'],
    atalho: 'L',
    disparaEm: '/itens',
  },
  {
    // FLX-05 — porta única hoje é o botão da ficha, e só quando o ativo já
    // está em_manutencao (ativos/[id]/page.tsx). A paleta não navega direto
    // para DENTRO de uma ficha sem antes achar QUAL ativo, então esta entrada
    // vai para a LISTA já filtrada nesse status — de lá a ficha e o botão
    // continuam a um clique. `filial=todas`: ação de escopo global (mesma
    // sentinela de LINKS_KPI no dashboard), não a lista de trabalho recortada
    // por cargo que a sidebar/paleta usa para "Pendências".
    rotulo: 'Devolver ao fornecedor',
    href: '/ativos?status=em_manutencao&filial=todas',
    icone: PackageX,
    apelidos: ['fornecedor', 'baixa', 'sem conserto'],
  },
  {
    // FLX-05 — a mesma ação de primeira linha do card "Ações" do dashboard
    // (ACOES em page.tsx), que a paleta ainda não oferecia.
    rotulo: 'Novo equipamento',
    href: '/ativos/novo',
    icone: PackagePlus,
    apelidos: ['compra', 'cadastrar'],
  },
]

// Filtro local dos grupos estaticos (o grupo de ativos vem pronto do servidor,
// por isso o cmdk roda com `shouldFilter={false}`). Sem acento e sem caixa:
// "pendencias" acha "Pendências".
function casa(item: ItemNavegacao, termo: string): boolean {
  if (!termo) return true
  const alvo = normalizarBusca(
    [item.rotulo, item.href, ...(item.apelidos ?? [])].join(' '),
  )
  return alvo.includes(termo)
}

// Abridor da paleta exposto ao restante do shell (a lupa do header). `null`
// fora do provider — quem consome decide se some com o gatilho.
const AbrirPaletaContext = createContext<(() => void) | null>(null)

export function useAbrirPaleta(): (() => void) | null {
  return useContext(AbrirPaletaContext)
}

// Quantas páginas da documentação a paleta mostra por busca. A lista inteira
// (dezenas) afogaria os ativos e as ações, que são o uso principal; quem quer
// varrer a documentação usa a busca da própria /ajuda.
const MAX_AJUDA_NA_PALETA = 5

export function PaletaComandosProvider({
  children,
  paginasAjuda = [],
  podeEscrever = false,
  podeLer = true,
  eAdmin = false,
  eDev = false,
  hrefRelatorios,
}: {
  children: React.ReactNode
  /** F25 — destino de "Relatórios" resolvido por cargo (espelha a sidebar). */
  hrefRelatorios?: string
  /**
   * Índice LEVE da documentação, serializado pelo SERVIDOR (`INDICE_PALETA`).
   * Vem por prop porque o registry é só-servidor: importá-lo aqui arrastaria o
   * conteúdo inteiro (e o PapaParse) para o bundle de toda tela do app — por
   * isso até o TIPO vem de `@/lib/ajuda/tipos`, o módulo puro, e não de
   * `indice.ts`, que é só-servidor.
   */
  paginasAjuda?: readonly EntradaPaleta[]
  /**
   * F21 — cargo de quem está logado, resolvido UMA vez no `(app)/layout.tsx`.
   * `podeEscrever` (≥ operador) governa o grupo "Ações"; `eAdmin`, a entrada
   * "Administração" do grupo "Ir para". A paleta é um atalho para o que a tela
   * já oferece: se o botão não existe, o comando também não pode existir.
   *
   * F22 — `eDev` (cargo EXATO) governa a entrada "Desenvolvedor". Default `false`: enquanto
   * o `(app)/layout.tsx` não passar a prop, o comando não existe; a rota segue protegida
   * pelo `dev/layout.tsx`, então esquecer a prop dá menu incompleto, nunca vazamento.
   */
  podeEscrever?: boolean
  /**
   * F50 — "esta sessão lê alguma coisa?", resolvido por `podeLer` em
   * `@/components/layout/permissoes` e descido pelo `(app)/layout.tsx`, junto dos
   * outros três. Governa o grupo "Ir para": um atalho de navegação para quem não lê
   * é um atalho para uma tela que o servidor recusa.
   *
   * Default `true`, e o default é a parte pensada: os outros três são `false` porque
   * são PERMISSÕES a mais, e esquecer a prop tem de fechar. Este é o PISO de leitura —
   * esquecer a prop tem de deixar o menu como estava, não esvaziá-lo. Falhar fechado
   * aqui daria uma paleta vazia por um bug de fiação, sem nada explicando o sumiço.
   */
  podeLer?: boolean
  eAdmin?: boolean
  eDev?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [aberto, setAberto] = useState(false)
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<AtivoResumo[]>([])
  const [carregando, setCarregando] = useState(false)
  // F29/UXG-10b — a paleta abria SEMPRE vazia: sem digitar nada, ela não oferecia
  // nada. "Recentes" são os últimos ativos que ESTE navegador abriu, lidos do
  // `sessionStorage` no momento em que a paleta abre (nunca no render — leitura de
  // storage no corpo do componente quebraria a hidratação).
  const [recentes, setRecentes] = useState<AtivoRecente[]>([])

  // Abrir SEMPRE zera a consulta anterior: paleta que reabre com resultado velho
  // faz o operador agir sobre a busca errada. Estavel (deps vazias) para poder
  // entrar como dependencia do efeito de teclado sem re-registrar o listener.
  const abrir = useCallback(() => {
    setQuery('')
    setResultados([])
    setCarregando(false)
    setRecentes(lerAtivosRecentes())
    setAberto(true)
  }, [])

  // Ctrl+K / Cmd+K abrem (e fecham) a paleta MESMO com o foco num campo de
  // texto — e o padrao universal de paleta e o modificador ja desambigua do
  // que se esta digitando. "/" nao tem modificador, entao respeita a guarda
  // `editando` (a MESMA do atalho `N`, importada de atalho-global).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.repeat) return
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        // Com OUTRO modal aberto (estorno, lancamento de item…) a paleta nao
        // empilha por cima: so responde quando e ela mesma o modal aberto,
        // para fechar. `aberto` desempata — a paleta tambem e um dialogo.
        if (!aberto && modalAberto()) return
        e.preventDefault()
        if (aberto) setAberto(false)
        else abrir()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key !== '/') return
      if (editando(e.target)) return
      // Mesma guarda do `N`/`?`: nada de abrir a paleta por cima de outro
      // modal — e, se a paleta ja e o modal aberto (foco fora do campo),
      // reabrir zeraria a consulta que o operador acabou de digitar.
      if (modalAberto()) return
      e.preventDefault()
      abrir()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aberto, abrir])

  // Busca no servidor com debounce. Toda troca de estado acontece DENTRO do
  // callback assincrono (nunca no corpo do efeito) — mesma disciplina do
  // `ativo-combobox`, que evita render em cascata.
  useEffect(() => {
    const q = query.trim()
    let vivo = true
    const t = setTimeout(
      async () => {
        if (q.length < 2) {
          if (vivo) {
            setResultados([])
            setCarregando(false)
          }
          return
        }
        if (vivo) setCarregando(true)
        try {
          const res = await buscarAtivosParaMovimentacao(q)
          if (vivo) setResultados(res)
        } catch {
          // F19 — sem o catch, uma queda de rede vira unhandled rejection a cada
          // tecla digitada. Aqui a falha degrada CALADA para a lista vazia (nada
          // de toast: um por tecla seria pior que o silêncio) — a paleta segue
          // usável para "Ir para" e "Ações", que são locais.
          if (vivo) setResultados([])
        } finally {
          if (vivo) setCarregando(false)
        }
      },
      q.length < 2 ? 0 : 300,
    )
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [query])

  function irPara(href: string) {
    setAberto(false)
    router.push(href)
  }

  // AÇÕES do grupo "Ações" precisam DISPARAR, não só navegar — a promessa do
  // rótulo (achado F12-W4-08). Quando o operador já está na tela dona do dialog,
  // navegar de novo não remontaria nada e o `?lancar=1` seria ignorado; ali o
  // caminho é o CustomEvent que o dialog já escuta desde a F9. Fora dela, o
  // `href` leva até a tela com o gatilho na URL, que o Server Component lê e
  // repassa como prop.
  function executarAcao(a: ItemNavegacao) {
    if (a.disparaEm && pathname === a.disparaEm) {
      setAberto(false)
      dispararLancarItem({ itemId: null, filialId: null })
      return
    }
    irPara(a.href)
  }

  const termo = normalizarBusca(query)
  const buscou = query.trim().length >= 2
  const rotas = useMemo(
    () =>
      ROTAS.filter(
        (r) => podeLer && (eAdmin || !r.soAdmin) && (eDev || !r.soDev) && casa(r, termo),
      ).map((r) =>
        r.href === '/relatorios/geral' && hrefRelatorios
          ? { ...r, href: hrefRelatorios }
          : r,
      ),
    [termo, podeLer, eAdmin, eDev, hrefRelatorios],
  )
  const acoes = useMemo(
    () => (podeEscrever ? ACOES.filter((a) => casa(a, termo)) : []),
    [termo, podeEscrever],
  )
  // Documentação só entra quando há termo: sem busca, a paleta abre com "Ir
  // para" e "Ações", que é o que o operador quer em 9 de 10 aberturas.
  const ajuda = useMemo(
    () =>
      termo
        ? // `casaBusca`, e nao `p.chave.includes(termo)`: o predicado da busca da
          // documentação é UM só, e esta era a segunda cópia escrita à mão. A
          // guarda `termo ? … : []` acima já impede que a semântica "consulta
          // vazia casa com tudo" chegue aqui.
          paginasAjuda.filter((p) => casaBusca(p.chave, termo)).slice(0, MAX_AJUDA_NA_PALETA)
        : [],
    [termo, paginasAjuda],
  )
  const semNada =
    !carregando &&
    resultados.length === 0 &&
    rotas.length === 0 &&
    acoes.length === 0 &&
    ajuda.length === 0 &&
    // Com "Recentes" na tela a paleta NÃO está vazia — o `CommandEmpty` diria
    // "nada encontrado" logo abaixo de cinco linhas clicáveis.
    !(query.trim().length === 0 && recentes.length > 0)

  return (
    <AbrirPaletaContext.Provider value={abrir}>
      {children}
      <CommandDialog
        open={aberto}
        onOpenChange={setAberto}
        title="Busca e comandos"
        description="Busque um ativo, vá para uma tela ou dispare uma ação."
        className="sm:max-w-2xl"
      >
        {/* O `CommandDialog` deste projeto NAO embrulha os filhos num `Command`
            (versao do shadcn instalada) — a raiz do cmdk vem daqui. Filtro
            desligado: os ativos ja chegam filtrados do servidor e os grupos
            estaticos usam `casa()`.

            `vimBindings={false}`: o cmdk liga por padrao os atalhos vim
            Ctrl+N/P/J/K e o ramo do Ctrl+K comeca com `preventDefault()`. Como
            o dialogo e portalizado em `document.body` e o React escuta no
            `document`, esse handler roda ANTES do listener de `window` e o
            Ctrl+K chegava la ja com `defaultPrevented` — no Windows (todo o
            parque) a paleta nao fechava e a selecao andava uma linha em
            silencio. Nada se perde: o rodape anuncia so ↑↓/Enter/Esc, que
            continuam funcionando. */}
        <Command shouldFilter={false} vimBindings={false} label="Busca e comandos">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            autoFocus
            aria-label="Buscar ativo, tela ou ação"
            placeholder="Buscar ativo (mín. 2 caracteres), tela ou ação…"
          />
          <CommandList>
            {carregando && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                Buscando ativos…
              </div>
            )}

            {/* "Recentes" só com a paleta EM BRANCO: assim que o operador digita,
                quem manda é a busca no servidor — a lista de recentes viraria ruído
                ao lado de um resultado que ele pediu. */}
            {query.trim().length === 0 && recentes.length > 0 && (
              <CommandGroup heading="Recentes">
                {recentes.map((r) => (
                  <CommandItem
                    key={`recente:${r.id}`}
                    value={`recente:${r.id}`}
                    onSelect={() => irPara(`/ativos/${r.id}`)}
                    className="flex items-center gap-2"
                  >
                    <History className="size-4 text-muted-foreground" aria-hidden />
                    <span className="font-medium tabular-nums">{r.patrimonio}</span>
                    <span className="min-w-0 truncate text-muted-foreground">
                      {r.descricao}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {resultados.length > 0 && (
              <CommandGroup heading="Ativos">
                {resultados.map((r) => (
                  <CommandItem
                    key={r.id}
                    value={`ativo:${r.id}`}
                    onSelect={() => irPara(`/ativos/${r.id}`)}
                    className="flex items-center gap-2"
                  >
                    <span className="font-medium tabular-nums">
                      {r.patrimonio ?? 'sem patrimônio'}
                    </span>
                    <span className="min-w-0 truncate text-muted-foreground">
                      {[rotuloCategoria(r.categoria), r.modelo].filter(Boolean).join(' · ')}
                    </span>
                    {r.colaborador_atual && (
                      <span className="min-w-0 max-w-[12rem] truncate text-xs text-muted-foreground">
                        com {r.colaborador_atual}
                      </span>
                    )}
                    {/* Patrimonio repete em casos raros (spec §5): a service tag
                        desempata na propria linha. */}
                    {r.patrimonio_duplicado && (
                      <span className="rounded bg-amber-100 px-1.5 text-xs tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        ST {r.service_tag ?? '—'}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-2">
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {r.filial_nome}
                      </span>
                      <StatusBadge status={r.status} className="text-[11px]" />
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Vazio SÓ do grupo de ativos: os outros grupos ainda têm o que
                mostrar. Quando nada sobra em lugar nenhum, quem fala é o
                CommandEmpty lá embaixo — nunca as duas mensagens juntas. */}
            {!carregando && buscou && resultados.length === 0 && !semNada && (
              <div className="px-3 py-3 text-sm text-muted-foreground">
                Nenhum ativo encontrado para “{query.trim()}”.
              </div>
            )}

            {rotas.length > 0 && (
              <CommandGroup heading="Ir para">
                {rotas.map((r) => (
                  <CommandItem
                    key={r.href}
                    value={`ir:${r.href}`}
                    onSelect={() => irPara(r.href)}
                  >
                    <r.icone className="size-4 shrink-0" aria-hidden />
                    {r.rotulo}
                    {r.atalho && (
                      <CommandShortcut aria-hidden>{r.atalho}</CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {acoes.length > 0 && (
              <CommandGroup heading="Ações">
                {acoes.map((a) => (
                  <CommandItem
                    key={a.rotulo}
                    value={`acao:${a.href}:${a.rotulo}`}
                    onSelect={() => executarAcao(a)}
                  >
                    <a.icone className="size-4 shrink-0" aria-hidden />
                    {a.rotulo}
                    {a.atalho && (
                      <CommandShortcut aria-hidden>{a.atalho}</CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {ajuda.length > 0 && (
              <CommandGroup heading="Ajuda">
                {ajuda.map((p) => (
                  <CommandItem
                    key={p.slug}
                    value={`ajuda:${p.slug}`}
                    onSelect={() => irPara(`/ajuda/${p.slug}`)}
                  >
                    <CircleHelp className="size-4 shrink-0" aria-hidden />
                    {p.titulo}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* `buscou` na guarda: com 1 caractere nenhuma consulta chegou ao
                servidor, então "Nada encontrado" seria mentira — e apareceria
                junto com a dica "Digite ao menos 2 caracteres" logo abaixo.
                Nesse estado quem orienta é só o rodapé. */}
            {semNada && buscou && (
              <CommandEmpty>
                Nada encontrado. Tente o patrimônio, a service tag ou o nome do
                colaborador.
              </CommandEmpty>
            )}

            {!buscou && !carregando && (
              <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                Digite ao menos 2 caracteres para buscar um ativo · ↑↓ navega ·
                Enter abre · Esc fecha
              </div>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </AbrirPaletaContext.Provider>
  )
}
