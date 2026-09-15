import type { Json } from '@/lib/types/database'

// O `Json` QUE O COMPILADOR CONFERE (F58 · Frente B · Decisão 3).
//
// O gerador tipa todo argumento `jsonb` de RPC e toda coluna `jsonb` de tabela como `Json`:
//
//     string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
//
// e até a F58 os quinze pontos que mandavam um objeto do domínio para uma dessas posições
// passavam por `as unknown as Json` — doze argumentos de RPC e três escritas de tabela
// (`kits.ts` ×2 e o `dados` do snapshot em `relatorios.ts`). O cast não conferia nada: um
// `Date`, uma função ou um `undefined` dentro de uma lista entravam do mesmo jeito, e o
// `JSON.stringify` do supabase-js os transformava em silêncio (`Date` vira texto ISO,
// função some, `undefined` numa lista vira `null`).
//
// `JsonSerializavel` é a forma que ACEITA o que o `JSON.stringify` preserva e RECUSA, em
// compilação, o resto:
//  · `Date` e função não entram — a assinatura dos métodos (`getTime(): number`) não cabe no
//    índice `{ [chave]: JsonSerializavel | undefined }`;
//  · `undefined` em posição de LISTA não entra — ele viraria `null` em silêncio;
//  · `undefined` em propriedade de OBJETO entra — o `JSON.stringify` apaga a chave, que é o
//    que um campo opcional quer dizer;
//  · lista `readonly` entra — o `Json[]` do gerador é mutável e recusava `readonly T[]`,
//    que é um dos motivos pelos quais os casts existiam.
//
// ⚠ A ARMADILHA DA `interface` (medida na exploração da F58, `tsc` 5.9.3): um tipo declarado
// com `interface` NÃO satisfaz o índice implícito — "Index signature for type 'string' is
// missing" —, e o mesmo tipo declarado com `type` satisfaz. Isso é regra do TypeScript
// (interfaces podem ser reabertas), não defeito daqui. Se um objeto do domínio for
// `interface`, troque a declaração para `type` ou espalhe num literal (`{ ...valor }`).
export type JsonSerializavel =
  | string
  | number
  | boolean
  | null
  | readonly JsonSerializavel[]
  | { readonly [chave: string]: JsonSerializavel | undefined }

/**
 * Entrega um valor serializável a uma coluna `jsonb` de TABELA (insert/update pelo PostgREST).
 *
 * É a porta das três escritas que não passam por RPC. A conversão é segura por construção:
 * todo `Json` já é `JsonSerializavel`, e a única diferença no sentido contrário é a lista
 * `readonly`, que o `JSON.stringify` serializa igual. Nenhum valor é transformado.
 */
export function paraJson(valor: JsonSerializavel): Json {
  return valor as Json
}
