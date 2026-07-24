// Rótulos e cores dos tipos de pendência — CLIENT-SAFE (sem 'server-only'), porque
// a fila /pendencias virou Client Component na F18 (seleção + resolução em lote). A
// camada de dados (pendencias-detalhe.ts, server-only) re-exporta daqui para os
// consumidores server (a própria camada e o export CSV) não mudarem de import.

export type TipoPendencia = 'termo' | 'itens' | 'triagem' | 'patrimonio' | 'outras'

// Fonte única do rótulo: a tabela da tela e o CSV usam o MESMO texto (a tela
// acrescenta só a cor do badge, abaixo).
export const ROTULO_TIPO_PENDENCIA: Record<TipoPendencia, string> = {
  termo: 'Termo',
  itens: 'Itens faltantes',
  triagem: 'Triagem',
  patrimonio: 'Patrimônio',
  outras: 'Outra',
}

// Só a COR do badge mora aqui (o rótulo é o mesmo do CSV).
export const CLASSE_TIPO_PENDENCIA: Record<TipoPendencia, string> = {
  termo: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  itens: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  triagem: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  patrimonio: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  outras: 'bg-muted text-muted-foreground',
}
