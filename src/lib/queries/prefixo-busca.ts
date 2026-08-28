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

/** Prefixo mínimo antes de tocar o banco: 1 letra varreria a base inteira à toa. */
export const MIN_PREFIXO_SUGESTAO = 2

/**
 * Neutraliza os curingas do LIKE/ILIKE do PostgREST (`%`, `_` e o `*` que ele
 * traduz para `%`) e o que quebra o parser da querystring.
 */
export function prefixoSeguro(prefixo: string): string {
  return prefixo.trim().replace(/[%_*(),\\]/g, '')
}
