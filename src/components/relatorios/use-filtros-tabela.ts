'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  CATEGORIA_ORDEM,
  rotuloCategoria,
  rotuloTipo,
  type CategoriaAtivo,
  type TipoMovimentacao,
} from '@/lib/dominio'

// Núcleo compartilhado dos filtros das tabelas de relatório (OS tech-debt 3.2).
// Antes cada tabela (entradas/saídas/movimentações) reescrevia `const TODOS`, os
// `useMemo` de opções/filtragem/resumo e a barra de `Select`. Aqui mora a lógica
// PURA (derivação de opções, filtragem, agregação do resumo) + o hook que a
// costura com o estado de React. A barra visual é `<FiltrosTabela>`.

// Sentinela do "todos" no Radix Select (valor vazio não é permitido pelo componente).
export const TODOS = '__todos'

// Top-N dos chips de resumo (idêntico ao antigo `.slice(0, 12)`).
const RESUMO_LIMITE = 12

export type CampoFiltro = 'filial' | 'categoria' | 'motivo' | 'tipo'

// Todas as linhas filtráveis compartilham estes nomes de campo; cada tabela
// declara só os que usa. `motivo`/`tipo` são opcionais porque as movimentações
// não têm `motivo` e as entradas/saídas filtram por `motivo` (não por `tipo`).
export type LinhaFiltravel = {
  filial?: string
  categoria?: CategoriaAtivo
  motivo?: string | null
  tipo?: TipoMovimentacao
}

export type Opcao = { valor: string; rotulo: string }

export type ConfigFiltros<T extends LinhaFiltravel> = {
  // Campos filtráveis, na ordem de exibição. `filial` só aparece no consolidado.
  campos: readonly CampoFiltro[]
  // Consolidado (várias filiais) → mostra o filtro de filial e prefixa o resumo.
  ehGeral?: boolean
  // Quando presente, o hook devolve `resumo` (chips por chave). A chave já
  // decide como o `ehGeral` participa (ex.: `filial · motivo` vs só `motivo`).
  resumoChave?: (row: T, ehGeral: boolean) => string
}

// Metadados de apresentação por campo (rótulos pt-BR, larguras e aria-label da
// barra). Fonte única — antes espalhados em cada `<Select>`.
export const CAMPO_FILTRO_META: Record<
  CampoFiltro,
  { placeholder: string; todos: string; largura: string; ariaLabel: string }
> = {
  filial: {
    placeholder: 'Filial',
    todos: 'Todas as filiais',
    largura: 'sm:w-[150px]',
    ariaLabel: 'Filtrar por filial',
  },
  categoria: {
    placeholder: 'Categoria',
    todos: 'Todas categorias',
    largura: 'sm:w-[150px]',
    ariaLabel: 'Filtrar por categoria',
  },
  motivo: {
    placeholder: 'Motivo',
    todos: 'Todos os motivos',
    largura: 'sm:w-[170px]',
    ariaLabel: 'Filtrar por motivo',
  },
  tipo: {
    placeholder: 'Tipo',
    todos: 'Todos os tipos',
    largura: 'sm:w-[150px]',
    ariaLabel: 'Filtrar por tipo',
  },
}

const FILTROS_VAZIOS: Record<CampoFiltro, string> = {
  filial: '',
  categoria: '',
  motivo: '',
  tipo: '',
}

// ---------- núcleo puro (testável — CLAUDE.md: Vitest só cobre função pura) ----------

// `filial` só é visível no consolidado (ehGeral). Espelha o antigo `{ehGeral && …}`
// que envolvia o `<Select>` de filial nas três tabelas com filtro.
export function camposVisiveis(
  campos: readonly CampoFiltro[],
  ehGeral: boolean | undefined,
): CampoFiltro[] {
  return campos.filter((c) => c !== 'filial' || !!ehGeral)
}

function valorCampo(row: LinhaFiltravel, campo: CampoFiltro): string {
  switch (campo) {
    case 'filial':
      return row.filial ?? ''
    case 'categoria':
      return row.categoria ?? ''
    case 'motivo':
      return row.motivo ?? ''
    case 'tipo':
      return row.tipo ?? ''
  }
}

// Opções do dropdown por campo. `categoria` = ordem canônica fixa (mostra todas,
// mesmo as ausentes nos dados); `tipo` = ordem de aparição (sem sort, como antes);
// `filial`/`motivo` = únicos dos dados, ordenados pt-BR (motivo ignora nulos).
export function derivarOpcoesCampo<T extends LinhaFiltravel>(
  rows: readonly T[],
  campo: CampoFiltro,
): Opcao[] {
  switch (campo) {
    case 'categoria':
      return CATEGORIA_ORDEM.map((c) => ({ valor: c, rotulo: rotuloCategoria(c) }))
    case 'tipo': {
      const vistos = [...new Set(rows.map((r) => r.tipo).filter(Boolean) as TipoMovimentacao[])]
      return vistos.map((t) => ({ valor: t, rotulo: rotuloTipo(t) }))
    }
    case 'filial': {
      const vals = [
        ...new Set(rows.map((r) => r.filial).filter(Boolean) as string[]),
      ].sort((a, b) => a.localeCompare(b, 'pt-BR'))
      return vals.map((v) => ({ valor: v, rotulo: v }))
    }
    case 'motivo': {
      const vals = [
        ...new Set(rows.map((r) => r.motivo).filter(Boolean) as string[]),
      ].sort((a, b) => a.localeCompare(b, 'pt-BR'))
      return vals.map((v) => ({ valor: v, rotulo: v }))
    }
  }
}

// Mantém a linha se, para cada campo ativo, o filtro está vazio OU casa exato.
export function filtrarLinhas<T extends LinhaFiltravel>(
  rows: readonly T[],
  campos: readonly CampoFiltro[],
  filtros: Record<CampoFiltro, string>,
): T[] {
  return rows.filter((r) => campos.every((c) => !filtros[c] || valorCampo(r, c) === filtros[c]))
}

// Conta por chave e devolve o top-N em ordem decrescente (chips do resumo).
export function agregarResumo<T>(
  filtradas: readonly T[],
  chave: (row: T) => string,
): [string, number][] {
  const map = new Map<string, number>()
  for (const r of filtradas) {
    const k = chave(r)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, RESUMO_LIMITE)
}

// Chave do resumo das tabelas de entradas/saídas: no consolidado agrupa por
// `filial · motivo`, senão só por `motivo` (nulo → "Outro").
export function chaveResumoMotivo(
  row: { filial: string; motivo: string | null },
  ehGeral: boolean,
): string {
  return ehGeral ? `${row.filial} · ${row.motivo ?? 'Outro'}` : row.motivo ?? 'Outro'
}

// ---------- hook ----------

export function useFiltrosTabela<T extends LinhaFiltravel>(rows: T[], config: ConfigFiltros<T>) {
  const { campos, ehGeral, resumoChave } = config
  const [filtros, setFiltros] = useState<Record<CampoFiltro, string>>(FILTROS_VAZIOS)

  const camposAtivos = useMemo(() => camposVisiveis(campos, ehGeral), [campos, ehGeral])

  const opcoes = useMemo(() => {
    const acc = {} as Record<CampoFiltro, Opcao[]>
    for (const c of camposAtivos) acc[c] = derivarOpcoesCampo(rows, c)
    return acc
  }, [rows, camposAtivos])

  const filtradas = useMemo(
    () => filtrarLinhas(rows, camposAtivos, filtros),
    [rows, camposAtivos, filtros],
  )

  const temFiltro = useMemo(
    () => camposAtivos.some((c) => !!filtros[c]),
    [camposAtivos, filtros],
  )

  const resumo = useMemo<[string, number][]>(() => {
    if (!resumoChave) return []
    return agregarResumo(filtradas, (r) => resumoChave(r, !!ehGeral))
  }, [filtradas, resumoChave, ehGeral])

  const setFiltro = useCallback((campo: CampoFiltro, valor: string) => {
    setFiltros((f) => ({ ...f, [campo]: valor }))
  }, [])

  const limpar = useCallback(() => setFiltros(FILTROS_VAZIOS), [])

  return { filtradas, temFiltro, resumo, filtros, opcoes, camposAtivos, setFiltro, limpar }
}
