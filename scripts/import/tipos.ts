// Ferramenta de go-live/emergência — o sistema NÃO tem importação; ver spec §10.
// Tipos compartilhados do importador (F4).

export type StatusAtivo =
  | 'em_estoque'
  | 'reservado'
  | 'em_uso'
  | 'emprestado'
  | 'em_triagem'
  | 'em_manutencao'
  | 'defasado'
  | 'descartado'

export type TipoMovimentacao =
  | 'compra'
  | 'saida'
  | 'emprestimo'
  | 'reserva'
  | 'devolucao'
  | 'triagem_ok'
  | 'envio_manutencao'
  | 'retorno_manutencao'
  | 'marcar_defasado'
  | 'descarte'
  | 'transferencia'
  | 'ajuste'
  | 'estorno'

export type TermoStatus = 'sim' | 'nao' | 'enviado' | 'gerado'

export type CategoriaAtivo =
  | 'notebook'
  | 'desktop'
  | 'monitor'
  | 'celular'
  | 'tablet'
  | 'outro'

export type FilialOficial =
  | 'Matriz'
  | 'CD-Afonso Pena'
  | 'Linhares'
  | 'Eusébio'
  | 'Serra'

export type Severidade = 'bloqueante' | 'aviso'

export type TipoInconsistencia =
  | 'patrimonio_duplicado_sem_service_tag'
  | 'patrimonio_invalido'
  | 'patrimonio_service_tag_trocados'
  | 'motivo_desconhecido'
  | 'motivo_vazio'
  | 'data_invalida'
  | 'data_futura'
  | 'ativo_inferido'
  | 'ativo_em_multiplas_abas'
  | 'duplicata_exata'
  | 'estado_divergente'
  | 'estado_desconhecido'
  | 'termo_invalido'
  | 'unidade_desconhecida'
  | 'sem_patrimonio'
  | 'saida_sem_destino'
  | 'transferencia_sem_destino'
  | 'movimentacao_patrimonio_ambiguo'
  | 'movimentacao_sem_patrimonio'
  | 'itens_faltantes_texto_livre'
  | 'colaborador_divergente'
  | 'linha_incompleta'
  | 'chave_natural_duplicada'
  | 'duplicidade_resolvida'
  | 'prefixo_corrigido'
  | 'item_desconhecido'
  | 'saldo_invalido'

export type Inconsistencia = {
  severidade: Severidade
  tipo: TipoInconsistencia
  arquivo: string
  linha: number | null
  valor: string
  acaoProposta: string
}

// Linha de inventário já normalizada campo a campo (pós-parse, pré-consolidação).
export type LinhaInventario = {
  arquivo: string
  linha: number
  site: string // cru
  filial: FilialOficial | null
  marca: string | null
  categoria: CategoriaAtivo
  categoriaOriginal: string
  modelo: string | null
  fornecedor: string | null
  serviceTag: string | null
  patrimonio: string | null // canônico (ou null se sem patrimônio)
  patrimonioOriginal: string
  semPatrimonio: boolean
  memoria: string | null
  armazenamento: string | null
  processador: string | null
  hostname: string | null
  dataEntrega: string | null // ISO yyyy-mm-dd
  dataInclusao: string | null
  status: string // cru
  situacao: string // cru
  estadoPlanilha: StatusAtivo | null
  colaborador: string | null
  glpi: string | null // nº de chamado extraído
  termo: TermoStatus
  termoData: string | null
  observacao: string | null
}

// Linha de movimentação (Saída/Devolução) normalizada.
export type LinhaMovimentacao = {
  arquivo: string
  linha: number
  origem: 'saida' | 'devolucao'
  tipo: TipoMovimentacao // saida | devolucao | compra | transferencia | emprestimo
  data: string // ISO — 100% válidas nas abas de movimentação
  filial: FilialOficial | null
  filialDestino: FilialOficial | null // só transferencia
  categoria: CategoriaAtivo | null
  categoriaOriginal: string
  marcaModelo: string
  patrimonio: string | null // canônico
  patrimonioOriginal: string
  motivo: string | null // código do vocabulário (null p/ compra/transferencia/emprestimo)
  chamado: string | null
  colaborador: string | null
  setor: string | null
  termo: TermoStatus | null
  itensFaltantes: string[] | null
  observacao: string | null
}

// Ativo consolidado do plano (1 por par patrimônio+service tag).
export type AtivoPlano = {
  chave: string // patrimonio::serviceTag (normalizados)
  patrimonio: string // canônico ou placeholder SEMPAT-*
  patrimonioOriginal: string
  serviceTag: string | null
  categoria: CategoriaAtivo
  marca: string | null
  modelo: string | null
  fornecedor: string | null
  hostname: string | null
  memoria: string | null
  armazenamento: string | null
  processador: string | null
  filial: FilialOficial
  origem: 'importacao' | 'inferido'
  termo: TermoStatus | null
  termoData: string | null
  pendencia: string | null
  observacoes: string | null
  // reconciliação
  estadoPlanilha: StatusAtivo | null // null p/ inferidos (sem alvo)
  colaboradorPlanilha: string | null
  glpi: string | null
  dataCompraInicial: string // ISO
  linhasOrigem: { arquivo: string; linha: number }[]
}

// Movimentação planejada (na ordem de inserção).
export type MovPlano = {
  chaveAtivo: string
  tipo: TipoMovimentacao
  data: string
  motivo: string | null
  filial: FilialOficial
  filialDestino: FilialOficial | null
  colaborador: string | null
  setor: string | null
  chamado: string | null
  termo: TermoStatus | null
  termoData: string | null
  itensFaltantes: string[] | null
  observacao: string | null
  statusResultante: StatusAtivo | null // só ajuste
  papel: 'compra_inicial' | 'replay' | 'ajuste_reconciliacao'
  origem: { arquivo: string; linha: number } | null
}

export type Plano = {
  ativos: AtivoPlano[]
  movimentacoes: MovPlano[] // ordem global de inserção
  inconsistencias: Inconsistencia[]
  // pós-ajuste: sincronizar colaborador/setor com o inventário (mesmo sem ajuste)
  sincronizarColaborador: {
    chaveAtivo: string
    colaborador: string | null
  }[]
  // pós-ajuste: filial final = Site do inventário quando o replay (transferência)
  // deixou o ativo em outra filial — o trigger de ajuste não muda filial
  sincronizarFilial: {
    chaveAtivo: string
    filial: FilialOficial
  }[]
  estatisticas: {
    linhasPorArquivo: Record<string, number>
    ativosNovos: number
    ativosInferidos: number
    consolidacoesEntreAbas: number
    movimentacoesPorTipo: Record<string, number>
    ajustesPorFilial: Record<string, number>
    estadoDivergentePorArquivo: Record<string, number>
  }
}

// Resolução manual de duplicidade problemática (arquivo --resolucoes, fora do repo).
export type Resolucao = {
  patrimonio: string // canônico
  acao: 'consolidar' | 'distintos' | 'pular'
  nota?: string
}
