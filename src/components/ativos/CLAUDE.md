# CLAUDE.md — src/components/ativos/

Carrega quando você lê/edita algo aqui.

## `itens-que-foram-junto.tsx` — a chave do join é a MOVIMENTAÇÃO, não o ativo

O card "Itens que foram junto" na ficha do ativo lista os itens por quantidade entregues
JUNTO com aquele ativo numa movimentação. O join é por
`lancamentos_item.movimentacao_id` — **nunca `lancamentos_item.ativo_id`** (F38 frente A). Usar
`ativo_id` traria todo lançamento de item já feito para aquele ativo ao longo do tempo, em
qualquer movimentação — não "o que saiu junto desta vez".

## Padrões gerais da pasta

`ativos-table.tsx`/`ativos-filtros.tsx`/`ativos-paginacao.tsx` seguem o padrão que `/itens`
replica (ver `docs/ARQUITETURA.md` §10, "a lista, os filtros ou a paginação"). Parser de URL:
`src/lib/url-params.ts` (fonte única) — não escreva parsing de querystring local.
