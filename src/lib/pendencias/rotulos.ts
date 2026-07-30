// Rótulos e cores dos tipos de pendência — CLIENT-SAFE (sem 'server-only'), porque
// a fila /pendencias virou Client Component na F18 (seleção + resolução em lote). A
// camada de dados (pendencias-detalhe.ts, server-only) re-exporta daqui para os
// consumidores server (a própria camada e o export CSV) não mudarem de import.

// F24 — 'conflito' é o único tipo que NÃO vem de `v_fila_pendencias`. Ele é DERIVADO das
// views de conflito (migrations 0092/0096) e tem casa própria: a mesa de /pendencias, onde
// os cadastros aparecem lado a lado. Por isso as linhas de conflito não duplicam na fila
// genérica — decisão registrada em docs/DECISOES.md — e por isso ele fica FORA de
// `BaldeChip` (queries/relatorios/pendencias.ts), cuja aritmética de "outras" é
// `total(fila) − soma(baldes)` e quebraria com um balde que a fila não produz.
export type TipoPendencia = 'termo' | 'itens' | 'triagem' | 'patrimonio' | 'conflito' | 'outras'

// Fonte única do rótulo: a tabela da tela e o CSV usam o MESMO texto (a tela
// acrescenta só a cor do badge, abaixo).
export const ROTULO_TIPO_PENDENCIA: Record<TipoPendencia, string> = {
  termo: 'Termo',
  itens: 'Itens faltantes',
  triagem: 'Triagem',
  patrimonio: 'Patrimônio',
  conflito: 'Conflito entre filiais',
  outras: 'Outra',
}

// Só a COR do badge mora aqui (o rótulo é o mesmo do CSV).
export const CLASSE_TIPO_PENDENCIA: Record<TipoPendencia, string> = {
  termo: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  itens: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  triagem: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  patrimonio: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  conflito: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  outras: 'bg-muted text-muted-foreground',
}
