'use client'

import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { StatusBadge } from '@/components/ativos/status-badge'
import {
  buscarAtivosParaMovimentacao,
  buscarAtivosRecentesDoOperador,
} from '@/lib/actions/movimentacoes'
import { rotuloCategoria } from '@/lib/dominio'
import type { AtivoResumo } from '@/lib/queries/ativos'

// Uma linha do dropdown — a mesma para resultado de busca e para "movimentados
// recentemente" (F10/M3): duas marcacoes diferentes para o mesmo ativo seria
// bug na certa.
function ItemAtivo({
  r,
  jaTem,
  onEscolher,
}: {
  r: AtivoResumo
  jaTem: boolean
  onEscolher: () => void
}) {
  return (
    <CommandItem
      value={r.id}
      disabled={jaTem}
      onSelect={() => {
        if (jaTem) return
        onEscolher()
      }}
      className="flex items-center gap-2"
    >
      <span className="font-medium tabular-nums">
        {r.patrimonio ?? 'sem patrimônio'}
      </span>
      <span className="min-w-0 truncate text-muted-foreground">
        {[rotuloCategoria(r.categoria), r.modelo].filter(Boolean).join(' · ')}
      </span>
      {/* Quem está com o ativo (F9/M2) — buscar "Fulano" só ajuda
          se der para ver qual notebook é de qual Fulano. */}
      {r.colaborador_atual && (
        <span className="min-w-0 max-w-[12rem] truncate text-xs text-muted-foreground">
          com {r.colaborador_atual}
        </span>
      )}
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
        {jaTem && (
          <span className="text-xs text-muted-foreground">já no lote</span>
        )}
      </span>
    </CommandItem>
  )
}

// Busca de ativo por patrimonio/service tag/hostname/marca/modelo/colaborador
// (OS-F2 3.5.1 + F9/M2): server, debounce 300ms, min. 2 caracteres. Patrimonio
// duplicado exibe a service tag + aviso. Com menos de 2 caracteres a lista nao
// fica vazia: mostra os ativos que ESTE operador movimentou por ultimo (F10/M3),
// que sao quase sempre o proximo ativo do dia.
export function AtivoCombobox({
  onSelecionar,
  jaAdicionados,
  autoFocus = true,
  mostrarRecentes = true,
}: {
  onSelecionar: (ativo: AtivoResumo) => void
  jaAdicionados: Set<string>
  autoFocus?: boolean
  mostrarRecentes?: boolean
}) {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<AtivoResumo[]>([])
  const [carregando, setCarregando] = useState(false)
  const [recentes, setRecentes] = useState<AtivoResumo[]>([])

  useEffect(() => {
    const q = query.trim()
    let ativo = true
    // Toda alteracao de estado acontece DENTRO do callback assincrono (nao no
    // corpo do efeito) — evita renders em cascata (react-hooks/set-state-in-effect).
    const t = setTimeout(async () => {
      if (q.length < 2) {
        if (ativo) {
          setResultados([])
          setCarregando(false)
        }
        return
      }
      if (ativo) setCarregando(true)
      try {
        const res = await buscarAtivosParaMovimentacao(q)
        if (ativo) setResultados(res)
      } catch {
        // F19 — sem o catch, uma queda de rede vira unhandled rejection a cada
        // tecla digitada. Aqui a falha degrada CALADA para a lista vazia (nada
        // de toast: um por tecla seria pior que o silêncio), que é o mesmo
        // "Nenhum ativo encontrado" que o operador já sabe ler.
        if (ativo) setResultados([])
      } finally {
        if (ativo) setCarregando(false)
      }
    }, q.length < 2 ? 0 : 300)
    return () => {
      ativo = false
      clearTimeout(t)
    }
  }, [query])

  // Recentes: uma vez por montagem. O proxy resolve o operador da sessao sozinho
  // e degrada para lista vazia — sem recentes, o rodape de sempre continua la.
  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const res = await buscarAtivosRecentesDoOperador()
        if (vivo) setRecentes(res)
      } catch {
        // F19 — o proxy so degrada o erro de NEGOCIO; um throw de transporte
        // (rede caida, sessao morta) escapava como unhandled rejection. Sem
        // toast: e sugestao de conveniencia que ninguem pediu — fica sem
        // recentes, exatamente como quando nao ha nenhum.
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  const temDuplicado = resultados.some((r) => r.patrimonio_duplicado)
  const buscou = query.trim().length >= 2
  // Ja no lote nao vira sugestao: o operador acabou de adicionar.
  const recentesVisiveis = mostrarRecentes
    ? recentes.filter((r) => !jaAdicionados.has(r.id))
    : []

  function escolher(r: AtivoResumo) {
    onSelecionar(r)
    setQuery('')
    setResultados([])
  }

  return (
    <div className="space-y-2">
      <Command shouldFilter={false} className="rounded-lg border">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          autoFocus={autoFocus}
          placeholder="Buscar patrimônio, service tag, hostname, marca, modelo ou colaborador… (mín. 2 caracteres)"
        />
        <CommandList>
          {carregando && (
            <div className="py-4 text-center text-sm text-muted-foreground">
              Buscando…
            </div>
          )}
          {!carregando && buscou && resultados.length === 0 && (
            <CommandEmpty>Nenhum ativo encontrado.</CommandEmpty>
          )}
          {!carregando && !buscou && recentesVisiveis.length > 0 && (
            <CommandGroup heading="Movimentados recentemente">
              {recentesVisiveis.map((r) => (
                <ItemAtivo
                  key={r.id}
                  r={r}
                  jaTem={false}
                  onEscolher={() => escolher(r)}
                />
              ))}
            </CommandGroup>
          )}
          {!carregando && !buscou && (
            <div className="py-4 text-center text-sm text-muted-foreground">
              Digite ao menos 2 caracteres para buscar.
            </div>
          )}
          {resultados.length > 0 && (
            <CommandGroup>
              {resultados.map((r) => (
                <ItemAtivo
                  key={r.id}
                  r={r}
                  jaTem={jaAdicionados.has(r.id)}
                  onEscolher={() => escolher(r)}
                />
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>

      {temDuplicado && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert className="size-3.5" />
          Patrimônio duplicado — confira a service tag antes de escolher.
        </p>
      )}
    </div>
  )
}
