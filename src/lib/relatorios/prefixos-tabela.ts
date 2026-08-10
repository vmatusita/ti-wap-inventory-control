// Prefixo de param por tabela — curto, estável e sem colisão entre as tabelas
// (duas filtradas ao mesmo tempo não se atropelam) nem com os params da página
// (`preset`/`de`/`ate`). Param final: `<prefixo>.<campo>`, valor = `Opcao.valor`;
// param ausente = "todas". Ex.: `?preset=mes&sd.motivo=Troca&en.categoria=celular`.
// A busca livre (F16/T3) usa o mesmo prefixo com o sufixo `.q`: `?sd.q=wap0001234`.
//   sd = Saídas · en = Entradas · mv = Últimas movimentações (grade v1)
//   tr = Transferências · mi = Movimentações de itens (F16/T3 — busca livre)
// NÃO renomeie: link antigo colado por aí deixaria de reproduzir o filtro.
//
// ==========================================================================
// POR QUE ESTE MÓDULO EXISTE (F32/RV-12 — bug medido no navegador)
// ==========================================================================
// A constante morava em `components/relatorios/use-filtros-tabela.ts`, que é um
// módulo `'use client'`. Enquanto só Client Components a importavam, tudo bem.
// O RV-12 fez `corpo-relatorio-v2.tsx` — que é **Server Component** — importá-la
// para dizer a qual tabela o clique de cada gráfico aponta. E aí:
//
//   `PREFIXO_FILTROS.saidas` chegava **`undefined`** em runtime.
//
// Um módulo `'use client'` importado por um Server Component não é executado no
// servidor: o bundler o substitui por uma REFERÊNCIA de cliente, e ler uma
// propriedade dessa referência não devolve o valor — devolve `undefined`. O
// clique montaria `undefined.motivo=Troca` na URL e o filtro nunca aplicaria, em
// silêncio. `tsc`, `eslint` e `next build` passaram os três: o tipo existe, a
// sintaxe existe, e o erro só aparece quando a página roda.
//
// A correção é estrutural, não um remendo: valor compartilhado entre servidor e
// cliente mora em módulo PURO. `use-filtros-tabela.ts` reexporta daqui, então
// todos os consumidores antigos seguem funcionando sem mudar uma linha.
export const PREFIXO_FILTROS = {
  saidas: 'sd',
  entradas: 'en',
  movimentacoes: 'mv',
  transferencias: 'tr',
  movItens: 'mi',
} as const

export type PrefixoFiltros = (typeof PREFIXO_FILTROS)[keyof typeof PREFIXO_FILTROS]
