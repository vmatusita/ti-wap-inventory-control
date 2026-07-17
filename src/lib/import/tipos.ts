// Tipos do motor de import de startup (OS-F7 / W1). Este arquivo é a fonte da
// verdade do CONTRATO §1.5 da OS: o `PlanoImport` produzido aqui é consumido
// pela RPC do W2 (`p_plano jsonb`) e pela tela do W3. Puros — nada de banco/UI.
//
// AMPLIADO PELA F7B (OS-F7B §3, 17/07/2026): o CONTRATO §1.5 da F7 ganhou o
// modelo de CORREÇÕES (`CampoEditavel`, `CorrecaoImport`, `GrupoErro`) e o
// `ValidacaoImport` ganhou `grupos`, `contexto`, `correcoes` e
// `resumo.linhasRemovidas`. Nada da F7 foi removido — chamadas de 2/3 argumentos
// de `validarCsvImport` seguem válidas e a régua de bloqueio é a mesma.
//
// Os enums de domínio são declarados localmente (como em scripts/import/tipos.ts
// da F4) para manter o motor autocontido e independente dos tipos GERADOS do
// banco (src/lib/types/database.ts). Os valores coincidem 1:1 com os enums do
// Postgres — se um enum mudar no banco, mude aqui também.

import type { RegistroImport } from './parse'

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

// ---------------------------------------------------------------------------
// F7B — modelo de correções (OS-F7B §3). As correções são operações declaradas
// sobre as CÉLULAS do CSV enviado, aplicadas em memória antes da extração dos
// registros. O arquivo original nunca muda (`arquivoHash` continua o sha-256 do
// buffer original) e o motor revalida tudo do zero a cada mudança.

/** Campos corrigíveis — SOMENTE os que aparecem em erro/aviso. Nada de editor genérico. */
export type CampoEditavel =
  | 'site'
  | 'tipo'
  | 'patrimonio'
  | 'serviceTag'
  | 'situacao'
  | 'colaborador'
  | 'dataInclusao'
  | 'dataEntrega'

export type CorrecaoImport =
  /** Em massa: troca o valor cru `de` por `para` em TODAS as linhas onde a célula (aparada) casa exato. */
  | { op: 'substituir'; campo: 'site' | 'tipo' | 'dataInclusao' | 'dataEntrega'; de: string; para: string }
  /** Em massa: linhas cujo par cru (Status, Situação) casa exato recebem `para` na coluna Situação
   *  (a precedência Situação>Status resolve o estado). `para` = termo do vocabulário ESTADOS. */
  | { op: 'substituir_estado'; statusDe: string; situacaoDe: string; para: string }
  /** Pontual: escreve `para` na célula (linha física do arquivo, campo whitelisted). */
  | { op: 'editar'; linha: number; campo: CampoEditavel; para: string }
  /** Remove a linha do import (não entra no plano; não gera erro nem aviso). */
  | { op: 'remover_linha'; linha: number }

/**
 * Erros/avisos idênticos agrupados para correção (tipo + valor cru). O `correcao`
 * discriminado é decidido AQUI, no motor (testável), não na UI — a tela só
 * renderiza o controle correspondente ao `kind`.
 */
export type GrupoErro = {
  tipo: string // tipo do ErroImport (agrupador primário)
  chave: string // valor cru agrupador (p/ estado: `${status}␟${situacao}`)
  linhas: number[] // ordenadas
  erros: ErroImport[] // os erros individuais do grupo (para expandir)
  correcao:
    | { kind: 'categoria'; sugestao: CategoriaAtivo | null }
    | { kind: 'estado'; statusDe: string; situacaoDe: string; sugestao: StatusAtivo | null }
    | { kind: 'site_desconhecido' } // ação única: definir como a filial selecionada
    | { kind: 'site_outra_filial' } // ação única: remover linhas (decisão 4 do Johnny)
    | { kind: 'patrimonio' } // pontual por linha (input com preview da canonicalização)
    | { kind: 'duplicata' } // grupo lado a lado; editar patrimônio/ST ou remover sobras
    | { kind: 'data' } // massa por valor cru + pontual
    | { kind: 'colaborador' } // pontual por linha
    | { kind: 'nenhuma' } // header_invalido, linha_sem_chave, correcao_invalida, plano_vazio
}

/** Resultado da validação para o preview do W3. */
export type ValidacaoImport = {
  bloqueantes: ErroImport[] // 1+ => NADA pode ser aplicado (plano null)
  avisos: ErroImport[] // ex.: sem_data_entrada, estado_em_uso_sem_colaborador
  /** F7B — bloqueantes e avisos agrupados para correção (mais numeroso primeiro). */
  grupos: GrupoErro[]
  /** F7B — linha → registro cru (JÁ com as correções aplicadas); só linhas com erro/aviso. */
  contexto: Record<number, RegistroImport>
  /** F7B — `aplicadas` = ops que tiveram efeito; `porOp` = linhas afetadas por op, na ordem da lista. */
  correcoes: { aplicadas: number; porOp: number[] }
  plano: PlanoImport | null // null quando há bloqueante
  resumo: { criar: number; semData: number; layout: LayoutImport; linhasRemovidas: number }
}
