import type {
  CategoriaAtivo,
  GrupoItem,
  StatusAtivo,
  TipoLancamento,
  TipoMovimentacao,
} from '@/lib/dominio'

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
  // v2: emprestado ganha KPI no grupo "equipamentos principais" (opcional para
  // compat com snapshots v1, que não gravavam este campo).
  emprestado?: number
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
  // v1 (ausente) × v2 (formato do e-mail: 3 grupos + tabelas). CorpoRelatorio
  // normaliza — snapshots antigos continuam abrindo.
  schema?: 1 | 2
  // B4 (F6B): observação da semana definida no ATO de gerar o snapshot (texto
  // livre opcional). Congela junto com o resto; snapshots sem obs não têm o campo
  // e o corpo não renderiza a seção. Campo OPCIONAL — mantém `schema: 2`.
  observacao?: string
}

// ---- Estruturas do relatório v2 (formato do e-mail — F3B) ----

// Estoque no último dia por categoria × status (barras horizontais empilhadas).
export type EstoqueCatStatus = {
  categoria: CategoriaAtivo
  segmentos: { status: StatusAtivo; total: number }[]
  total: number
}

// Disponíveis por modelo, agrupados por categoria (bar list do e-mail).
export type ModelosPorCategoria = {
  categoria: CategoriaAtivo
  modelos: ItemModelo[]
  total: number
}

// Manutenção caso a caso, enriquecida (mini-linha do tempo do card).
export type AnotacaoManutencao = { texto: string; autor: string | null; em: string }
export type ManutencaoCaso = {
  patrimonio: string
  modelo: string
  filial: string
  chamado: string | null
  // F14/MN1 — chamado do FORNECEDOR do envio (opcional: snapshots pré-F14 não o têm).
  chamadoFornecedor?: string | null
  dataEnvio: string | null
  diasEmManutencao: number | null
  obsEnvio: string | null
  anotacoes: AnotacaoManutencao[]
  retornoData: string | null
  retornoObs: string | null
  fechado: boolean // true = caso encerrado no período (retorno OU devolvido)
  // F14/§0 — como o caso foi encerrado. Ausente/`'retorno'` = voltou (verde);
  // `'devolvido_fornecedor'` = badge própria neutra. Opcional p/ snapshots antigos.
  desfecho?: 'retorno' | 'devolvido_fornecedor'
  // F16/T3 — id do ativo, para o patrimônio do card virar link p/ a ficha (só
  // operador). OPCIONAL: snapshots pré-F16 não têm → texto puro, sem erro.
  ativoId?: string
}

// Linha de item nos grupos 2–3 (acessórios / componentes).
export type SaldoItemPeriodo = {
  item: string
  // v3 (F6A): total possuído + estoque na prateleira. Snapshots v2 pré-F6A só têm
  // `saldo` (= estoque de então) → `saldo` é opcional/legado e o render tolera.
  total?: number
  estoque?: number
  saldo?: number // legado (snapshots pré-F6A) — não gravar em snapshots novos
  atrelados: number
  falta: number
  entradas: number
  saidas: number
  delta: number // entradas − saidas no período
  obs: string | null
}
export type GrupoRelatorio = {
  grupo: GrupoItem
  itens: SaldoItemPeriodo[]
  ultimoLancamento: string | null // carimbo de frescor (data)
  temAtrelados: boolean
}

// Tabelas detalhadas do período (o fecho do e-mail).
//
// F16: três campos OPCIONAIS novos (mantêm `schema:2`; snapshots pré-F16 não os têm):
//   · `estornada?`/`estornoData?` (T1) — a movimentação foi desfeita por um estorno
//     (inferido, sem coluna flag — ver lib/relatorios/estorno.ts); data as-of `ate`.
//   · `ativoId?` (T3) — id do ativo, para o patrimônio virar link p/ a ficha (só
//     operador no ao vivo; snapshots antigos sem o campo → texto puro, sem erro).
export type LinhaSaida = {
  id: string
  data: string
  filial: string
  categoria: CategoriaAtivo
  modelo: string
  patrimonio: string
  tipo: TipoMovimentacao
  motivo: string | null
  chamado: string | null
  colaboradorSetor: string | null
  termo: string | null
  obs: string | null
  ativoId?: string
  estornada?: true
  estornoData?: string
}
export type LinhaEntrada = {
  id: string
  data: string
  filial: string
  categoria: CategoriaAtivo
  modelo: string
  patrimonio: string
  tipo: TipoMovimentacao
  motivo: string | null
  colaborador: string | null
  setor: string | null
  itensFaltantes: string[] | null
  obs: string | null
  ativoId?: string
  estornada?: true
  estornoData?: string
}
export type LinhaTransferencia = {
  id: string
  data: string
  de: string
  para: string
  categoria: CategoriaAtivo
  modelo: string
  patrimonio: string
  chamado: string | null
  obs: string | null
  ativoId?: string
  estornada?: true
  estornoData?: string
}

// B5 (F6B): uma linha da tabela de movimentações de ITENS por quantidade no
// período (seção própria — só para acessórios/componentes; os ativos não mudam).
// Lançamento a lançamento (ao contrário de rel_mov_itens, que agrega por item).
export type LinhaLancamentoItem = {
  id: string
  data: string
  filial: string
  item: string
  grupo: GrupoItem
  tipo: TipoLancamento
  quantidade: number
  chamado: string | null
  colaborador: string | null
  obs: string | null
  ehEstorno: boolean // estorna_id não nulo (o lançamento é o inverso de outro)
  // F16/T1 — o lançamento FOI estornado por outro (o inverso de `ehEstorno`).
  // OPCIONAL: snapshots pré-F16 não têm; a data é as-of o fim do período.
  estornada?: true
  estornoData?: string
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

// Snapshot v2 — o formato do e-mail (3 grupos + tabelas detalhadas). O estado é
// reconstruído as-of no fim do período; congela junto com o resto (F3B 3.6/3.10).
export type SnapshotRelatorioV2 = {
  meta: MetaSnapshot & { schema: 2 }
  kpis: KpisRelatorio
  kpisAnterior: KpisRelatorio // mesmo shape, estado as-of do fim do período anterior
  estoquePorCategoria: ContagemCategoria[]
  estoqueCatStatus: EstoqueCatStatus[]
  disponiveisPorModelo: ModelosPorCategoria[]
  reservados: ItemReservado[]
  manutencao: ManutencaoCaso[]
  serieMovimentacoes: SerieMovimentacoes
  porMotivo: PorMotivo
  grupos: GrupoRelatorio[]
  pendencias: ChipPendencia[]
  saidas: LinhaSaida[]
  entradas: LinhaEntrada[]
  transferencias: LinhaTransferencia[]
  // B5 (F6B): tabela de movimentações de itens do período. Campo OPCIONAL —
  // snapshots gerados antes da F6B não têm o campo e a seção não renderiza.
  // Mantém `schema: 2` (precedentes: `emprestado?`, `total?/estoque?`).
  movimentacoesItens?: LinhaLancamentoItem[]
  resumo: ResumoPeriodo
}

export type AnySnapshot = SnapshotRelatorio | SnapshotRelatorioV2

// Discrimina v2 pelo carimbo de schema no meta (snapshots v1 não têm).
export function ehSnapshotV2(s: AnySnapshot): s is SnapshotRelatorioV2 {
  return (s.meta as { schema?: number }).schema === 2
}
