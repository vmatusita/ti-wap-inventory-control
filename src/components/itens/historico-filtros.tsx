'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
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
import { GRUPO_ITEM_META, GRUPO_ITEM_ORDEM, rotuloTipoLancamento } from '@/lib/dominio'
import { GRUPOS_ESCOLHA } from '@/lib/itens/escolha-tipo'
import type { ItemCatalogo } from '@/lib/queries/itens'
import { baseFiltrosItens, registrarFiltrosEnviados } from './url-filtros'

const TODOS_ITENS = '__todos_itens'
const TODOS_TIPOS = '__todos_tipos'

// Filtros do histórico de lançamentos (OS-F9 · I3; busca do ITN-03b): item,
// tipo, período e busca, 100% na URL (params `item`/`tipo`/`de`/`ate`/`busca`),
// no mesmo padrão das outras listas do app. Mudar qualquer filtro reseta o
// `page`. O filtro de FILIAL continua no ItensFiltros (vale para saldos e
// histórico) — não se duplica aqui.
//
// ⚠ ITN-03b — o param é `busca`, NÃO `q`: `q` já é o filtro de SALDOS na mesma
// página (itens-filtros.tsx / itens/page.tsx); reusar o nome quebraria aquele
// filtro, já que os dois blocos escrevem na mesma URL (decisão em DECISOES.md).
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
  const buscaAtual = params.get('busca') ?? ''

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

  // Mesma disciplina da busca de saldos (itens-filtros.tsx): só aplica no
  // ENVIO (Enter/botão), nunca a cada tecla — e resincroniza com a URL para
  // back/forward voltar o campo junto.
  const [busca, setBusca] = useState(buscaAtual)
  const [buscaSync, setBuscaSync] = useState(buscaAtual)
  if (buscaSync !== buscaAtual) {
    setBuscaSync(buscaAtual)
    setBusca(buscaAtual)
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

  function submeterBusca() {
    aplicar({ busca: busca.trim() || null })
  }

  const temFiltro = !!itemAtual || !!tipoAtual || !!deAtual || !!ateAtual || !!buscaAtual
  const hoje = hojeISO()

  return (
    <div className="flex flex-wrap items-end gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submeterBusca()
        }}
        className="flex min-w-0 items-end gap-2"
      >
        <div className="space-y-1.5">
          <Label htmlFor="hist-busca" className="text-xs text-muted-foreground">
            Busca
          </Label>
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="hist-busca"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Chamado ou colaborador"
              className="h-10 w-[220px] pl-8 sm:h-8"
              aria-label="Buscar no histórico por chamado ou colaborador"
            />
          </div>
        </div>
        <Button type="submit" variant="secondary" className="h-10 shrink-0 sm:h-8">
          Pesquisar
        </Button>
      </form>

      <div className="space-y-1.5">
        <Label htmlFor="hist-item" className="text-xs text-muted-foreground">
          Item
        </Label>
        <Select
          value={itemAtual || TODOS_ITENS}
          onValueChange={(v) => aplicar({ item: v === TODOS_ITENS ? null : v })}
        >
          <SelectTrigger id="hist-item" className="h-10 w-[200px] sm:h-8" aria-label="Filtrar histórico por item">
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
          <SelectTrigger id="hist-tipo" className="h-10 w-[170px] sm:h-8" aria-label="Filtrar histórico por tipo">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS_TIPOS}>Todos os tipos</SelectItem>
            {/* 19/08/2026 (avulsa) — as opções agrupadas pela MESMA pergunta do
                diálogo de lançamento ("Chegou / Saiu / Voltou / Acerto",
                `lib/itens/escolha-tipo.ts`): quem aprendeu a lançar pela
                resposta encontra o filtro pelo mesmo caminho. Os rótulos
                oficiais continuam sendo o texto de cada opção. */}
            {GRUPOS_ESCOLHA.map((g) => (
              <SelectGroup key={g.chave}>
                <SelectLabel>{g.rotulo}</SelectLabel>
                {g.tipos.map((t) => (
                  <SelectItem key={t} value={t}>
                    {rotuloTipoLancamento(t)}
                  </SelectItem>
                ))}
              </SelectGroup>
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
          className="h-10 w-[160px] tabular-nums sm:h-8"
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
          className="h-10 w-[160px] tabular-nums sm:h-8"
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
          className="h-10 gap-1 text-muted-foreground sm:h-8"
          onClick={() => {
            setDe('')
            setAte('')
            setBusca('')
            aplicar({ item: null, tipo: null, de: null, ate: null, busca: null })
          }}
        >
          <X className="size-4" aria-hidden />
          Limpar
        </Button>
      )}
    </div>
  )
}
