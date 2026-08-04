'use client'

import { useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
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
import { FiltroFilial, opcoesDeFiliais } from '@/components/layout/filtro-filial'
import { hojeISO } from '@/lib/format'
import { rotuloTipo, type TipoMovimentacao } from '@/lib/dominio'
import { cn } from '@/lib/utils'
import type { Filial } from '@/lib/queries/filiais'

const TODOS_TIPOS = '__todos_tipos'

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
}: {
  filiais: Filial[]
  filiaisSelecionadas: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  // Acende a barra global enquanto a navegação por filtro está pendente (roda em
  // startTransition, então NÃO dispara o loading.tsx da rota).
  useReportarNavegacao(isPending)

  const qAtual = params.get('q') ?? ''
  const tipoAtual = params.get('tipo') ?? ''
  const deAtual = params.get('de') ?? ''
  const ateAtual = params.get('ate') ?? ''

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
  // empurrado; enquanto a URL commitada não muda, a base é esse valor.
  const pendente = useRef<{ antes: string; enviada: string } | null>(null)

  function base(commitada: string): URLSearchParams {
    const p = pendente.current
    if (p && p.antes === commitada) return new URLSearchParams(p.enviada)
    pendente.current = null
    return new URLSearchParams(commitada)
  }

  function aplicar(mudancas: Record<string, string | null>) {
    const commitada = params.toString()
    const novo = base(commitada)
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor == null || valor === '') novo.delete(chave)
      else novo.set(chave, valor)
    }
    novo.delete('page') // qualquer mudança de filtro volta p/ a página 1
    const query = novo.toString()
    pendente.current = { antes: commitada, enviada: query }
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
  const temFiltro =
    !!qAtual || !!tipoAtual || !!params.get('filial') || !!deAtual || !!ateAtual
  const hoje = hojeISO()

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
              className="pl-8"
              aria-label="Buscar movimentações por patrimônio ou colaborador"
            />
          </div>
        </div>
        <Button type="submit" variant="secondary" className="shrink-0">
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
            className="w-[190px]"
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
        <Label htmlFor="mov-de" className="text-xs text-muted-foreground">
          De
        </Label>
        <Input
          id="mov-de"
          type="date"
          max={ate || hoje}
          value={de}
          className="w-[160px] tabular-nums"
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
          className="w-[160px] tabular-nums"
          aria-label="Movimentações até"
          onChange={(e) => {
            setAte(e.target.value)
            aplicar({ ate: e.target.value })
          }}
        />
      </div>

      {temFiltro && (
        <Button
          variant="ghost"
          className="gap-1 text-muted-foreground"
          onClick={() => {
            setBusca('')
            setDe('')
            setAte('')
            aplicar({ q: null, tipo: null, filial: null, de: null, ate: null })
          }}
        >
          <X className="size-4" aria-hidden />
          Limpar
        </Button>
      )}
    </div>
  )
}
