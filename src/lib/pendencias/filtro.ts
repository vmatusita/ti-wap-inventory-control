import {
  PENDENCIA_PATRIMONIO_NAO_CANONICO,
  PENDENCIA_SEM_PATRIMONIO,
} from '@/lib/dominio'

// FONTE ÚNICA dos predicados de balde de pendência sobre `v_fila_pendencias`.
//
// A MESMA regra tem três leitores, e é obrigatório que os três concordem:
//   · `queryPendencias`   (queries/pendencias-detalhe.ts) — as abas de /pendencias e o CSV;
//   · `contarPendencia`   (queries/relatorios/pendencias.ts) — os chips do relatório;
//   · `classificarPendencia` (queries/pendencias-detalhe.ts) — o badge da linha já lida.
// Foi de dois deles discordarem que nasceu o chip anunciando "56 outras" para uma aba
// "Outra" que devolvia ZERO (25/07/2026). Enquanto os literais viviam escritos à mão em
// cada lugar, restaurar a concordância era lembrar de três arquivos; daqui em diante o
// predicado tem um dono.
//
// CLIENT-SAFE de propósito (sem `server-only`), como `rotulos.ts` ao lado: a fila de
// /pendencias é Client Component desde a F18.
//
// Os literais NÃO têm vírgula nem parênteses, e isso não é estética: o `.or()` do
// PostgREST parte a vírgula como separador de condições e trata parênteses como
// agrupamento. É por isso que `PENDENCIA_PATRIMONIO_NAO_CANONICO` (dominio.ts) é só o
// PREFIXO do texto que o go-live F4 gravou — `%prefixo%` casa o literal completo.

/** Texto canônico do balde de termo na view (igualdade exata). */
export const TEXTO_TERMO_PENDENTE = 'termo pendente'

/** Texto canônico do balde de triagem na view (igualdade exata). */
export const TEXTO_TRIAGEM_PARADA = 'triagem parada'

/**
 * PREFIXO do balde de itens. A view sintetiza 'itens faltantes: <item>' (migration
 * 0052), então o casamento é por prefixo — nunca igualdade.
 */
export const PREFIXO_ITENS_FALTANTES = 'itens faltantes'

/** Padrão `ilike` do balde de itens (prefixo + `%`). */
export const ILIKE_ITENS_FALTANTES = `${PREFIXO_ITENS_FALTANTES}%`

/**
 * Os dois textos do balde de patrimônio: sem plaqueta (F7E) OU patrimônio fora do
 * formato canônico (go-live F4). A pendência é `;`-joinable (dominio.ts), então o
 * casamento é por CONTINÊNCIA (`%texto%`), nunca igualdade.
 */
export const TEXTOS_PATRIMONIO = [
  PENDENCIA_SEM_PATRIMONIO,
  PENDENCIA_PATRIMONIO_NAO_CANONICO,
] as const

/** Expressão pronta para o `.or()` do balde de patrimônio. */
export const OR_PATRIMONIO = TEXTOS_PATRIMONIO.map(
  (t) => `pendencia.ilike.%${t}%`,
).join(',')
