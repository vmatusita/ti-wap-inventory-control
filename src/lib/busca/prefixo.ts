// A neutralização de curinga dos campos que sugerem enquanto se digita.
//
// POR QUE ESTE ARQUIVO EXISTE (revisão de 28/08/2026): a mesma função vivia
// DUPLICADA em `queries/movimentacoes.ts` (F10/M4, sugestões de colaborador e setor)
// e em `queries/colaboradores.ts` (F37/A.4, o campo apoiado no cadastro), a segunda
// declarando-se "espelho" da primeira. Só que o conjunto de caracteres neutralizados
// é REGRA DE SEGURANÇA, não estilo: `%`, `_` e o `*` que o PostgREST traduz para `%`
// são curingas do ILIKE, e `(`, `)`, `,` e `\` quebram o parser da querystring. Com
// duas cópias, tapar um buraco em um arquivo deixa o outro campo aberto — e nada no
// `npm run build` acusa a divergência. Uma cópia só, importada pelos dois.
//
// O que ela impede, concretamente: sem a limpeza, digitar `%` no campo devolveria o
// histórico INTEIRO (o padrão vira `%%`), e um `(` derrubaria a requisição no parser
// do PostgREST em vez de simplesmente não achar ninguém.
//
// POR QUE ELE MUDOU DE PASTA (F49 · Decisão 2, 07/09/2026)
// --------------------------------------------------------
// Morava em `src/lib/queries/prefixo-busca.ts`, e era o único módulo daquela pasta que
// NÃO toca o banco: é uma constante e uma regex. Quando a F49 passou a exigir
// `import 'server-only'` em todo módulo de `queries/` — para que nenhum deles possa ser
// arrastado para um bundle de cliente —, este arquivo seria a ÚNICA exceção da catraca,
// e uma exceção logo na estreia é como uma catraca começa a afrouxar.
//
// A alternativa era deixá-lo lá e declarar `server-only` num módulo puro que não precisa:
// custaria zero hoje e proibiria, sem motivo, que um Client Component um dia validasse o
// prefixo antes de chamar o servidor. Mover custou três imports reescritos.
//
// Com a mudança, `src/lib/queries/**` volta a significar exatamente uma coisa — "toca o
// banco" — e `servidor-apenas.test.ts` roda com a lista de exceções VAZIA.

/** Prefixo mínimo antes de tocar o banco: 1 letra varreria a base inteira à toa. */
export const MIN_PREFIXO_SUGESTAO = 2

/**
 * Neutraliza os curingas do LIKE/ILIKE do PostgREST (`%`, `_` e o `*` que ele
 * traduz para `%`) e o que quebra o parser da querystring.
 */
export function prefixoSeguro(prefixo: string): string {
  return prefixo.trim().replace(/[%_*(),\\]/g, '')
}
