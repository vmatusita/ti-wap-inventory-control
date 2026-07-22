'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useReportarNavegacao } from '@/components/layout/progresso-navegacao'
import { hojeISO } from '@/lib/format'
import {
  GRUPO_ITEM_META,
  GRUPO_ITEM_ORDEM,
  rotuloTipoLancamento,
  type TipoLancamento,
} from '@/lib/dominio'
import type { ItemCatalogo } from '@/lib/queries/itens'
import { baseFiltrosItens, registrarFiltrosEnviados } from './url-filtros'

const TODOS_ITENS = '__todos_itens'
const TODOS_TIPOS = '__todos_tipos'

const TIPOS: TipoLancamento[] = ['entrada', 'saida', 'reserva', 'liberacao', 'retorno', 'ajuste']

// Filtros do histórico de lançamentos (OS-F9 · I3): item, tipo e período, 100% na
// URL (params `item`/`tipo`/`de`/`ate`), no mesmo padrão das outras listas do app.
// Mudar qualquer filtro reseta o `page`. O filtro de FILIAL continua no
// ItensFiltros (vale para saldos e histórico) — não se duplica aqui.
export function HistoricoFiltros({ itens }: { itens: ItemCatalogo[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()
  useReportarNavegacao(isPending)

  const itemAtual = params.get('item') ?? ''
  const tipoAtual = params.get('tipo') ?? ''
  const deAtual = params.get('de') ?? ''
  const ateAtual = params.get('ate') ?? ''

  // As datas são controladas localmente e resincronizadas com a URL (mesmo padrão
  // da busca em itens-filtros.tsx) — assim back/forward volta o campo junto.
  const [de, setDe] = useState(deAtual)
  const [ate, setAte] = useState(ateAtual)
  const [sync, setSync] = useState(`${deAtual}|${ateAtual}`)
  if (sync !== `${deAtual}|${ateAtual}`) {
    setSync(`${deAtual}|${ateAtual}`)
    setDe(deAtual)
    setAte(ateAtual)
  }

  function aplicar(mudancas: Record<string, string | null>) {
    // Base vem de `baseFiltrosItens`, não de `params`: durante uma navegação
    // pendente o snapshot da URL ainda é o antigo e a segunda troca de filtro
    // apagaria a primeira (ver o comentário longo em `url-filtros.ts`).
    const commitada = params.toString()
    const novo = baseFiltrosItens(commitada)
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor == null || valor === '') novo.delete(chave)
      else novo.set(chave, valor)
    }
    novo.delete('page')
    const query = novo.toString()
    registrarFiltrosEnviados(commitada, query)
    startTransition(() => router.push(`${pathname}?${query}`))
  }

  const temFiltro = !!itemAtual || !!tipoAtual || !!deAtual || !!ateAtual
  const hoje = hojeISO()

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="hist-item" className="text-xs text-muted-foreground">
          Item
        </Label>
        <Select
          value={itemAtual || TODOS_ITENS}
          onValueChange={(v) => aplicar({ item: v === TODOS_ITENS ? null : v })}
        >
          <SelectTrigger id="hist-item" className="w-[200px]" aria-label="Filtrar histórico por item">
            <SelectValue placeholder="Item" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS_ITENS}>Todos os itens</SelectItem>
            {GRUPO_ITEM_ORDEM.map((g) => {
              const doGrupo = itens.filter((i) => i.grupo === g)
              if (!doGrupo.length) return null
              return (
                <SelectGroup key={g}>
                  <SelectLabel>{GRUPO_ITEM_META[g].titulo}</SelectLabel>
                  {doGrupo.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.nome}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hist-tipo" className="text-xs text-muted-foreground">
          Tipo
        </Label>
        <Select
          value={tipoAtual || TODOS_TIPOS}
          onValueChange={(v) => aplicar({ tipo: v === TODOS_TIPOS ? null : v })}
        >
          <SelectTrigger id="hist-tipo" className="w-[170px]" aria-label="Filtrar histórico por tipo">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS_TIPOS}>Todos os tipos</SelectItem>
            {TIPOS.map((t) => (
              <SelectItem key={t} value={t}>
                {rotuloTipoLancamento(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hist-de" className="text-xs text-muted-foreground">
          De
        </Label>
        <Input
          id="hist-de"
          type="date"
          max={hoje}
          value={de}
          className="w-[160px] tabular-nums"
          aria-label="Histórico a partir de"
          onChange={(e) => {
            setDe(e.target.value)
            aplicar({ de: e.target.value })
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hist-ate" className="text-xs text-muted-foreground">
          Até
        </Label>
        <Input
          id="hist-ate"
          type="date"
          max={hoje}
          value={ate}
          className="w-[160px] tabular-nums"
          aria-label="Histórico até"
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
            setDe('')
            setAte('')
            aplicar({ item: null, tipo: null, de: null, ate: null })
          }}
        >
          <X className="size-4" aria-hidden />
          Limpar
        </Button>
      )}
    </div>
  )
}
