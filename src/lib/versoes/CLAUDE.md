# CLAUDE.md — src/lib/versoes/

Carrega quando você lê/edita algo aqui. A receita completa da regra 8 (bump + entrada +
tag) já está na raiz — é citada demais no código para tirar de lá. Aqui só o detalhe de
implementação de QUEM aplica a regra.

## `registry.ts` — a fonte única

`VERSOES[0]` **é** a versão no ar — não existe outro lugar que declare a versão atual. Ao
acrescentar uma entrada: `versao`, `data` (a do cabeçalho no `CHANGELOG.md`, não a de hoje),
`fase` (só quando a entrega for uma fase `F*`), `titulo` e de **2 a 6** `mudancas` em
**linguagem de operador** — rótulo real da tela, efeito antes da causa, zero vocabulário de
desenvolvedor. Não é estilo: é regra que falha build/teste.

## Os dois testes que travam

- `registry.test.ts` — recusa se `VERSOES[0].versao` divergir do `version` do `package.json`,
  ou se alguma `mudanca` tiver cheiro de vocabulário de dev (a lista de termos proibidos está
  no próprio teste — se um termo novo escapar, ele entra lá, não vira exceção pontual).
- `cobertura-changelog.test.ts` — lê o `CHANGELOG.md` de verdade e derruba `npm run test` se
  uma entrada nova do changelog ficar sem versão correspondente na MESMA data. É o que torna a
  regra 8 independente de alguém lembrar dela.

## `tipos.ts`

Módulo PURO — só o tipo que servidor e cliente compartilham (a página `/versoes`, o badge de
versão no rodapé da sidebar). Não importe nada de Supabase/Node aqui: qualquer import assim
faria o bundle do cliente crescer ou o build de Client Component falhar.

## Peça relacionada fora daqui

O badge de versão do rodapé da sidebar e a página `/versoes` (que existe SEM item próprio na
sidebar — é alcançada só pelo badge) são governados por `src/components/layout/CLAUDE.md`, não
por este arquivo.
