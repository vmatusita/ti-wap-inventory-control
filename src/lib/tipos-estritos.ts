// Utilitário de tipo puro — zero runtime, zero dependência (F56 · Frente B,
// Decisão 4).
//
// `Exclude<T, U>` do TypeScript não reclama quando um membro de `U` está FORA
// de `T`: ele simplesmente devolve `T` inteiro, calado. Foi assim que o no-op
// do fato 16 nasceu em `src/lib/import/deparas.ts` — `Exclude<StatusAtivo,
// 'descartado' | 'devolvido_fornecedor'>` não excluía nada além de
// `'descartado'`, porque a união local `StatusAtivo` nunca teve
// `'devolvido_fornecedor'` (o enum do banco ganhou esse valor na F14 e a
// união local do import não foi atualizada) — o segundo membro do `Exclude<>`
// não fazia diferença nenhuma, e nada acusava isso: nem o `tsc`, nem o
// Vitest, nem o olho.
//
// `ExcluirDaUniao<T, U extends T>` acrescenta a restrição `U extends T`: um
// valor de `U` que não pertence a `T` vira erro de COMPILAÇÃO no próprio
// parâmetro de tipo, não mais um `Exclude<>` que aceita e ignora calado.
export type ExcluirDaUniao<T, U extends T> = Exclude<T, U>
