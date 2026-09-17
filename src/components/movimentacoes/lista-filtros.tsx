'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, User, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useReportarNavegacao } from '@/components/layout/progresso-navegacao'
import {
  baseDosFiltros,
  registrarFiltrosEnviados,
  useEsquecerFiltrosAoSair,
} from '@/components/filtros/url'
import { FiltroFilial, opcoesDeFiliais } from '@/components/layout/filtro-filial'
import { hojeISO } from '@/lib/format'
import { rotuloTipo, type TipoMovimentacao } from '@/lib/dominio'
import {
  chipAtivo,
  periodoDoChip,
  type ChavePeriodo,
} from '@/lib/movimentacoes/chips-periodo'
import { cn } from '@/lib/utils'
import type { Filial } from '@/lib/queries/filiais'

const TODOS_TIPOS = '__todos_tipos'

// Sentinela do filtro "Minhas" (F28/MOV-05): o uid NUNCA entra na URL — a page
// resolve `?autor=eu` para `operador.id` no servidor (ver `page.tsx`).
const AUTOR_EU = 'eu'

const CHIPS_PERIODO: { chave: ChavePeriodo; rotulo: string }[] = [
  { chave: 'hoje', rotulo: 'Hoje' },
  { chave: 'ontem', rotulo: 'Ontem' },
  { chave: '7dias', rotulo: '7 dias' },
]

// Ordem de EXIBIÇÃO do select (não é a ordem do enum): os tipos do dia a dia
// primeiro, os raros e o estorno no fim. Lista explícita de propósito — varrer
// as chaves de TIPO_META deixaria a ordem à mercê do objeto.
const TIPOS_EXIBICAO: TipoMovimentacao[] = [
  'saida',
  'devolucao',
  'emprestimo',
  'reserva',
  'transferencia',
  'compra',
  'troca',
  'envio_manutencao',
  'retorno_manutencao',
  'devolucao_fornecedor',
  // F34 — o par manual da triagem, na ordem em que acontece na prateleira.
  'envio_triagem',
  'triagem_ok',
  'marcar_defasado',
  'descarte',
  'ajuste',
  'estorno',
]

// Filtros da lista de movimentações (F11 · M8), 100% na URL (`de`/`ate`/`tipo`/
// `filial`/`q`), no mesmo padrão de `ativos-filtros.tsx`. Mudar qualquer filtro
// reseta o `page`. Param inválido é ignorado pela página (nunca derruba a rota).
export function ListaFiltros({
  filiais,
  // F25 — seleção EFETIVA de filial, resolvida no servidor (pode vir do padrão do
  // cargo, e não da URL).
  filiaisSelecionadas,
  // F28/MOV-05 — o botão "Minhas" só faz sentido para quem está logado (é o
  // autor da movimentação); a rota é sempre de sessão (o visualizador por senha
  // não alcança `/movimentacoes` — só `/relatorios/**`), mas a page confirma e
  // manda este booleano em vez de qualquer id.
  mostrarFiltroAutor,
}: {
  filiais: Filial[]
  filiaisSelecionadas: string[]
  mostrarFiltroAutor: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // Acende a barra global enquanto a navegação por filtro está pendente (roda em
  // startTransition, então NÃO dispara o loading.tsx da rota).
  useReportarNavegacao(isPending)
  useEsquecerFiltrosAoSair(pathname)

  const qAtual = params.get('q') ?? ''
  const tipoAtual = params.get('tipo') ?? ''
  const deAtual = params.get('de') ?? ''
  const ateAtual = params.get('ate') ?? ''
  const autorAtual = params.get('autor') ?? ''

  const [busca, setBusca] = useState(qAtual)
  const [de, setDe] = useState(deAtual)
  const [ate, setAte] = useState(ateAtual)

  // Resincroniza os campos controlados quando a URL muda por fora (Limpar,
  // voltar/avançar do navegador). Padrão oficial do React "You Might Not Need an
  // Effect": guarda o valor anterior em ESTADO e ajusta durante o render.
  const chaveUrl = `${qAtual}|${deAtual}|${ateAtual}`
  const [sync, setSync] = useState(chaveUrl)
  if (sync !== chaveUrl) {
    setSync(chaveUrl)
    setBusca(qAtual)
    setDe(deAtual)
    setAte(ateAtual)
  }

  // `useSearchParams()` (e `window.location.search`) só refletem a URL
  // COMMITADA: o Next só chama `history.pushState` quando a navegação termina.
  // Duas trocas na mesma janela pendente — De e Até em sequência, o caso normal
  // aqui — liam o mesmo snapshot antigo e a segunda apagava a primeira (mesmo
  // achado da revisão adversarial da F9 em /itens). Guardamos o que foi
  // empurrado; enquanto a URL commitada não muda, a base é esse valor. F61 — a cópia
  // em `useRef` virou o módulo compartilhado `src/components/filtros/url.ts`, com a
  // mesma garantia: o pendente é POR CAMINHO e sai junto com o componente
  // (`useEsquecerFiltrosAoSair`), como o `ref` saía.

  function aplicar(mudancas: Record<string, string | null>) {
    const commitada = params.toString()
    const novo = baseDosFiltros(pathname, commitada)
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor == null || valor === '') novo.delete(chave)
      else novo.set(chave, valor)
    }
    novo.delete('page') // qualquer mudança de filtro volta p/ a página 1
    const query = novo.toString()
    registrarFiltrosEnviados(pathname, commitada, query)
    // Sem filtro nenhum a URL volta limpa (`/movimentacoes`, não `…?`).
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname))
  }

  // A busca livre só é aplicada ao SUBMETER (Enter no campo ou "Pesquisar") —
  // nunca a cada tecla: navegar durante a digitação resincronizaria o campo com
  // a URL e "voltaria" o texto (lição de `ativos-filtros.tsx`).
  function submeterBusca() {
    aplicar({ q: busca.trim() || null })
  }

  // F25 — o `filial` conta como filtro quando veio da URL, não quando a marcação
  // saiu do padrão do cargo (senão "Limpar" nunca sumiria para o operador).
  // F28/MOV-05 — `autor` entra aqui pela presença bruta do param (mesmo padrão
  // de `tipoAtual`/`deAtual` acima): um valor além de "eu" não filtra nada no
  // servidor, mas ainda assim precisa de "Limpar" para sair da URL.
  const temFiltro =
    !!qAtual ||
    !!tipoAtual ||
    !!params.get('filial') ||
    !!deAtual ||
    !!ateAtual ||
    !!autorAtual
  const hoje = hojeISO()

  // F28/MOV-05 — chips de período: aplicam de/ate na URL de uma vez. Clicar no
  // chip já ativo DESLIGA (limpa de/ate) — não há como um chip "reforçar" a si
  // mesmo.
  const chipPeriodoAtivo = chipAtivo(deAtual, ateAtual, hoje)
  function aplicarChipPeriodo(chave: ChavePeriodo) {
    if (chipPeriodoAtivo === chave) {
      setDe('')
      setAte('')
      aplicar({ de: null, ate: null })
      return
    }
    const p = periodoDoChip(chave, hoje)
    setDe(p.de)
    setAte(p.ate)
    aplicar({ de: p.de, ate: p.ate })
  }

  const autorEuAtivo = autorAtual === AUTOR_EU

  return (
    <div
      aria-busy={isPending}
      className={cn(
        'flex flex-wrap items-end gap-2 transition-opacity',
        isPending && 'opacity-70',
      )}
    >
      {/* Linha própria para a busca até 1279px — ver ativos-filtros.tsx
          (F13/B4-R1: com `flex-1` o campo colapsava para 44px). */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submeterBusca()
        }}
        className="flex min-w-0 grow basis-full items-end gap-2 sm:max-w-sm xl:basis-0"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="mov-q" className="text-xs text-muted-foreground">
            Busca
          </Label>
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="mov-q"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Patrimônio ou colaborador…"
              className="h-10 pl-8 sm:h-8"
              aria-label="Buscar movimentações por patrimônio ou colaborador"
            />
          </div>
        </div>
        <Button type="submit" variant="secondary" className="h-10 shrink-0 sm:h-8">
          Pesquisar
        </Button>
      </form>

      <div className="space-y-1.5">
        <Label htmlFor="mov-tipo" className="text-xs text-muted-foreground">
          Tipo
        </Label>
        <Select
          value={tipoAtual || TODOS_TIPOS}
          onValueChange={(v) => aplicar({ tipo: v === TODOS_TIPOS ? null : v })}
        >
          <SelectTrigger
            id="mov-tipo"
            className="h-10 w-[190px] sm:h-8"
            aria-label="Filtrar por tipo de movimentação"
          >
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS_TIPOS}>Todos os tipos</SelectItem>
            {TIPOS_EXIBICAO.map((t) => (
              <SelectItem key={t} value={t}>
                {rotuloTipo(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        {/* O rótulo do BOTÃO resume a seleção ("Todas" × "Filiais 2") porque esta
            tela põe o nome do campo acima do controle — repetir "Filial" nos dois
            lugares só ocuparia espaço. */}
        <Label className="text-xs text-muted-foreground">Filial</Label>
        <FiltroFilial
          opcoes={opcoesDeFiliais(filiais, false)}
          selecionados={filiaisSelecionadas}
          aplicar={(v) => aplicar({ filial: v })}
          idPrefixo="mov-filial"
          rotulo={filiaisSelecionadas.length > 0 ? 'Filiais' : 'Todas'}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Período</Label>
        <div className="flex gap-1">
          {CHIPS_PERIODO.map((c) => (
            <Button
              key={c.chave}
              type="button"
              variant={chipPeriodoAtivo === c.chave ? 'default' : 'outline'}
              aria-pressed={chipPeriodoAtivo === c.chave}
              onClick={() => aplicarChipPeriodo(c.chave)}
              className="shrink-0"
            >
              {c.rotulo}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mov-de" className="text-xs text-muted-foreground">
          De
        </Label>
        <Input
          id="mov-de"
          type="date"
          max={ate || hoje}
          value={de}
          className="h-10 w-[160px] tabular-nums sm:h-8"
          aria-label="Movimentações a partir de"
          onChange={(e) => {
            setDe(e.target.value)
            aplicar({ de: e.target.value })
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mov-ate" className="text-xs text-muted-foreground">
          Até
        </Label>
        <Input
          id="mov-ate"
          type="date"
          min={de || undefined}
          max={hoje}
          value={ate}
          className="h-10 w-[160px] tabular-nums sm:h-8"
          aria-label="Movimentações até"
          onChange={(e) => {
            setAte(e.target.value)
            aplicar({ ate: e.target.value })
          }}
        />
      </div>

      {/* Sem `<Label>` acima, no mesmo padrão do botão "Sem patrimônio" de
          `ativos-filtros.tsx`: o `items-end` do container alinha o botão pela
          base com os campos rotulados ao lado. */}
      {mostrarFiltroAutor && (
        <Button
          type="button"
          variant={autorEuAtivo ? 'default' : 'outline'}
          aria-pressed={autorEuAtivo}
          onClick={() => aplicar({ autor: autorEuAtivo ? null : AUTOR_EU })}
          className="h-10 gap-2 sm:h-8"
        >
          <User className="size-4" aria-hidden />
          Minhas
        </Button>
      )}

      {temFiltro && (
        <Button
          variant="ghost"
          className="h-10 gap-1 text-muted-foreground sm:h-8"
          onClick={() => {
            setBusca('')
            setDe('')
            setAte('')
            aplicar({
              q: null,
              tipo: null,
              filial: null,
              de: null,
              ate: null,
              autor: null,
            })
          }}
        >
          <X className="size-4" aria-hidden />
          Limpar
        </Button>
      )}
    </div>
  )
}
