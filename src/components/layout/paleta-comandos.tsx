'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CircleHelp,
  ClipboardList,
  LayoutDashboard,
  Package,
  Plus,
  Settings,
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
import { editando } from '@/components/movimentacoes/atalho-global'
import { buscarAtivosParaMovimentacao } from '@/lib/actions/movimentacoes'
import { normalizarBusca } from '@/lib/ajuda/busca'
import { rotuloCategoria } from '@/lib/dominio'
import type { AtivoResumo } from '@/lib/queries/ativos'

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
}

// Espelha o `sidebar-nav.tsx` (que e do W1 nesta OS — nao editar la). Se a
// sidebar ganhar/perder item, esta lista precisa acompanhar.
const ROTAS: ItemNavegacao[] = [
  { rotulo: 'Dashboard', href: '/', icone: LayoutDashboard, apelidos: ['inicio', 'home'] },
  { rotulo: 'Ativos', href: '/ativos', icone: Package, apelidos: ['equipamentos'] },
  {
    rotulo: 'Movimentações',
    href: '/movimentacoes/nova',
    icone: ArrowLeftRight,
    apelidos: ['entrega', 'devolucao', 'saida', 'entrada'],
  },
  { rotulo: 'Itens', href: '/itens', icone: Boxes, apelidos: ['consumiveis', 'quantidade'] },
  { rotulo: 'Pendências', href: '/pendencias', icone: ClipboardList, apelidos: ['termo'] },
  { rotulo: 'Relatórios', href: '/relatorios/geral', icone: BarChart3 },
  {
    rotulo: 'Administração',
    href: '/admin/usuarios',
    icone: Settings,
    apelidos: ['usuarios', 'senhas', 'filiais', 'motivos', 'importar'],
  },
  { rotulo: 'Ajuda', href: '/ajuda', icone: CircleHelp, atalho: '?' },
]

const ACOES: ItemNavegacao[] = [
  {
    rotulo: 'Nova movimentação',
    href: '/movimentacoes/nova',
    icone: Plus,
    apelidos: ['registrar', 'lote'],
    atalho: 'N',
  },
  {
    rotulo: 'Lançar item',
    href: '/itens',
    icone: Boxes,
    apelidos: ['consumivel', 'saldo', 'estoque'],
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

export function PaletaComandosProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<AtivoResumo[]>([])
  const [carregando, setCarregando] = useState(false)

  // Abrir SEMPRE zera a consulta anterior: paleta que reabre com resultado velho
  // faz o operador agir sobre a busca errada. Estavel (deps vazias) para poder
  // entrar como dependencia do efeito de teclado sem re-registrar o listener.
  const abrir = useCallback(() => {
    setQuery('')
    setResultados([])
    setCarregando(false)
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
        e.preventDefault()
        if (aberto) setAberto(false)
        else abrir()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key !== '/') return
      if (editando(e.target)) return
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

  const termo = normalizarBusca(query)
  const buscou = query.trim().length >= 2
  const rotas = useMemo(() => ROTAS.filter((r) => casa(r, termo)), [termo])
  const acoes = useMemo(() => ACOES.filter((a) => casa(a, termo)), [termo])
  const semNada =
    !carregando && resultados.length === 0 && rotas.length === 0 && acoes.length === 0

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
            estaticos usam `casa()`. */}
        <Command shouldFilter={false} label="Busca e comandos">
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
                    onSelect={() => irPara(a.href)}
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

            {semNada && (
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
