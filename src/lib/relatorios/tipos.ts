import type { CategoriaAtivo, TipoMovimentacao } from '@/lib/dominio'

// Tipos compartilhados do relatório (spec §7). Módulo SÓ de tipos (sem código de
// servidor) — pode ser importado por Client Components sem arrastar o client do
// Supabase para o bundle. É a forma do JSON congelado em `relatorios_gerados`:
// a página ao vivo constrói `SnapshotRelatorio` fresco e a página do snapshot lê
// o mesmo formato do banco; ambas renderizam os MESMOS componentes (OS-F3 3.8.5).

export type KpisRelatorio = {
  total: number
  em_uso: number
  em_estoque: number
  reservado: number
  em_manutencao: number
  em_triagem: number
  defasado: number
}

export type ContagemCategoria = { categoria: CategoriaAtivo; total: number }
export type ItemModelo = { modelo: string; total: number }
export type ItemReservado = {
  patrimonio: string
  modelo: string
  chamado: string | null
}
export type ItemManutencao = {
  patrimonio: string
  modelo: string
  observacao: string | null
}
export type PontoMes = { mes: string; saidas: number; devolucoes: number } // mes = 'yyyy-MM' (legado — ver SerieMovimentacoes)

// Série de movimentações adaptativa ao período (OS-F3 melhoria): o balde segue a
// duração — semana/curto → por DIA, médio → por SEMANA, longo (ano/tudo) → por
// MÊS. O relatório da WAP é semanal, então um gráfico "por mês" mostrava uma
// barra só e ficava obsoleto no snapshot. `rotulo` já vem pronto (ptBR) para o
// snapshot ser estável no tempo; `chave` é o balde canônico ('yyyy-MM-dd' p/ dia
// e semana-segunda, 'yyyy-MM' p/ mês).
export type GranularidadeSerie = 'dia' | 'semana' | 'mes'
export type PontoSerie = {
  chave: string
  rotulo: string
  saidas: number
  devolucoes: number
}
export type SerieMovimentacoes = {
  granularidade: GranularidadeSerie
  pontos: PontoSerie[]
}
export type ContagemMotivo = { motivo: string; total: number } // motivo = rótulo
export type PorMotivo = { saidas: ContagemMotivo[]; devolucoes: ContagemMotivo[] }
export type ChipPendencia = { chave: string; rotulo: string; total: number }

export type MovimentacaoRelatorio = {
  id: string
  data: string
  tipo: TipoMovimentacao
  patrimonio: string
  ativo: string // marca + modelo (ou categoria)
  categoria: CategoriaAtivo
  colaborador_setor: string | null
  filial: string
  chamado: string | null
  observacao: string | null
}

// Resumo do período (insumo do texto no formato do e-mail — OS-F3 3.3.6).
export type ResumoCategoria = { categoria: CategoriaAtivo; total: number }
export type ResumoMotivo = {
  motivo: string
  total: number
  categorias: ResumoCategoria[]
}
export type ResumoFilial = { filial: string; total: number; motivos: ResumoMotivo[] }
export type ResumoTipo = { total: number; filiais: ResumoFilial[] }
export type ResumoPeriodo = {
  de: string
  ate: string
  saidas: ResumoTipo
  devolucoes: ResumoTipo
}

export type MetaSnapshot = {
  filialSlug: string
  filialNome: string
  ehGeral: boolean
  de: string
  ate: string
  periodoRotulo: string
}

export type SnapshotRelatorio = {
  meta: MetaSnapshot
  kpis: KpisRelatorio
  estoquePorCategoria: ContagemCategoria[]
  disponiveisPorModelo: ItemModelo[]
  reservados: ItemReservado[]
  emManutencao: ItemManutencao[]
  // Snapshots novos gravam `serieMovimentacoes`; os antigos só têm
  // `movimentacoesPorMes` — CorpoRelatorio normaliza os dois (compat).
  serieMovimentacoes?: SerieMovimentacoes
  movimentacoesPorMes?: PontoMes[]
  porMotivo: PorMotivo
  pendencias: ChipPendencia[]
  ultimasMovimentacoes: MovimentacaoRelatorio[]
  resumo: ResumoPeriodo
}
