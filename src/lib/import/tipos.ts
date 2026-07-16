// Tipos do motor de import de startup (OS-F7 / W1). Este arquivo é a fonte da
// verdade do CONTRATO §1.5 da OS: o `PlanoImport` produzido aqui é consumido
// pela RPC do W2 (`p_plano jsonb`) e pela tela do W3. Puros — nada de banco/UI.
//
// Os enums de domínio são declarados localmente (como em scripts/import/tipos.ts
// da F4) para manter o motor autocontido e independente dos tipos GERADOS do
// banco (src/lib/types/database.ts). Os valores coincidem 1:1 com os enums do
// Postgres — se um enum mudar no banco, mude aqui também.

export type StatusAtivo =
  | 'em_estoque'
  | 'reservado'
  | 'em_uso'
  | 'emprestado'
  | 'em_triagem'
  | 'em_manutencao'
  | 'defasado'
  | 'descartado'

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

/** Os 3 layouts do CSV de inventário (F4). `padrao20` = layout de 20 colunas das
 *  filiais (matriz + Grade + GLPI); espelha o `filial` dos scripts da F4. */
export type LayoutImport = 'matriz' | 'cd' | 'padrao20'

/** Filial escolhida na tela (o W3 passa isto ao motor). */
export type FilialSelecionada = { id: number; slug: string; nome: string }

/** Erro/aviso do preview — um por linha problemática (a tela exibe um a um). */
export type ErroImport = {
  linha: number
  coluna: string
  valor: string
  tipo: string
  mensagem: string
}

/** Um ativo a criar (modo Substituir tudo — tudo nasce do CSV). Contrato §1.5. */
export type AtivoPlano = {
  patrimonio: string // canônico (WAP0004491)
  patrimonioOriginal: string // como veio no CSV
  serviceTag: string | null
  categoria: CategoriaAtivo
  marca: string | null
  modelo: string | null
  fornecedor: string | null
  memoria: string | null
  armazenamento: string | null
  processador: string | null
  hostname: string | null
  observacoes: string | null // Observação do CSV (sobrescreve sempre; vazio = null)
  dataEntrada: string | null // yyyy-MM-dd = mais antiga válida entre Inclusão/Entrega; null = SEM data válida
  estadoAlvo: StatusAtivo // precedência Situação>Status, De→Para spec §5
  colaborador: string | null
  setor: string | null
  chamado: string | null // GLPI
}

/** Plano aplicável pela RPC do W2. `filialId` SEMPRE preenchido (contrato). */
export type PlanoImport = {
  filialId: number
  arquivoHash: string // sha-256 do conteúdo do CSV (hex)
  totalLinhasDados: number
  ativos: AtivoPlano[]
}

/** Resultado da validação para o preview do W3. */
export type ValidacaoImport = {
  bloqueantes: ErroImport[] // 1+ => NADA pode ser aplicado (plano null)
  avisos: ErroImport[] // ex.: sem_data_entrada, estado_em_uso_sem_colaborador
  plano: PlanoImport | null // null quando há bloqueante
  resumo: { criar: number; semData: number; layout: LayoutImport }
}
