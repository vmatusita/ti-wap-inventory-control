import type { z } from 'zod'
import type { Database } from '@/lib/types/database'
import type { MarcaNaoNula } from '@/lib/supabase/forma'
import type { EntradaDeMapa } from '@/lib/supabase/rpc'

// AS COLUNAS DE VIEW QUE O GERADOR TIPA ANULÁVEIS E O SQL GARANTE NÃO-NULAS (F58 · Frente C).
//
// O `supabase gen types` não lê a definição de uma view: ele marca TODA coluna de view como
// `| null`. Muitas não podem ser nulas — sai de coluna `not null` por `join` interno, de
// `count(*)`, de `coalesce(…, 0)` —, e o app, que as lia com `as X[]`, supunha isso sem dizer.
//
// Aqui cada uma é DECLARADA: view × coluna × motivo × trecho do SQL vivo que prova. É o único
// lugar de onde nasce a marca que deixa um schema tirar o `null` de uma coluna de view
// (`naoNulaNaView`); sem ela, a amarração de `forma.ts` recusa o schema em compilação. E
// `colunas-de-view-sql.test.ts` confere cada evidência contra a definição VIVA da view (o último
// `create [or replace] view` nas migrations), além de o conferidor provar contra as linhas reais.
//
// ⚠ O que a marca NÃO prova: que o schema está sendo usado na view certa. `naoNulaNaView(
// 'v_estoque_atual', 'total', …)` num schema de outra view compila. Quem pega esse erro é o
// conferidor de formas, rodando a leitura inteira contra o banco.

type Views = Database['public']['Views']

type MapaDeViews = {
  readonly [V in keyof Views]?: { readonly [C in keyof Views[V]['Row']]?: EntradaDeMapa }
}

export const COLUNAS_DE_VIEW_NAO_NULAS = {
  v_estoque_atual: {
    filial: {
      motivo: 'é o slug da filial, lido por join INTERNO com `filiais` (slug é not null)',
      evidencia: 'join public.filiais f on f.id = a.filial_id',
    },
    total: {
      motivo: 'é um count(*) de um group by — nunca nulo',
      evidencia: 'count(*) as total',
    },
  },
} as const satisfies MapaDeViews

type ViewDoMapa = keyof typeof COLUNAS_DE_VIEW_NAO_NULAS

/**
 * O schema de uma coluna de view que tira o `null` do tipo gerado — permitido SÓ para as colunas
 * do mapa acima. Em runtime devolve o próprio schema: a prova de não-nulo em runtime é o schema
 * recusar o `null` (e o conferidor contar zero recusas contra produção).
 */
export function naoNulaNaView<
  V extends ViewDoMapa,
  C extends keyof (typeof COLUNAS_DE_VIEW_NAO_NULAS)[V],
  Z extends z.ZodType,
>(view: V, coluna: C, schema: Z): Z & MarcaNaoNula {
  void view
  void coluna
  return schema as Z & MarcaNaoNula
}
