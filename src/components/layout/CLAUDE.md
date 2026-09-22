# CLAUDE.md — src/components/layout/

Carrega quando você lê/edita algo aqui. Chrome do app: sidebar, header, o badge de versão.

## `credito-autor.tsx` — crédito de autoria em TRÊS pontos, e SÓ três

O crédito de autoria (F35) aparece em exatamente três lugares do sistema — não adicione um
quarto nem remova um dos três sem decisão do Johnny registrada em `docs/DECISOES.md`.
`credito-autor.test.ts` é a lista; se você achar um lugar "óbvio" que falta o crédito, é sinal
de discutir antes de mexer, não de já adicionar.

## `sidebar-lateral.tsx` / `sidebar-colapso.tsx` / `sidebar-preferencia.ts`

A sidebar que recolhe (F30 · UXG-13) — estado de colapso persistido por preferência do
usuário. `rodape-sidebar.tsx` é o badge de versão (desktop + `Sheet` no mobile), que lê
`src/lib/versoes/registry.ts`.

## `sidebar-nav.tsx` — rotas do grupo `(app)`

A página `/versoes` (histórico de versões) é alcançável **só pelo badge do rodapé**, de
propósito: **não tem item na sidebar**. Se alguém pedir para "adicionar Versões ao menu",
confirme antes — é uma omissão deliberada (F35), não um esquecimento. Toda rota nova do grupo
`(app)` precisa entrar aqui NO MESMO commit que a cria (junto com `paleta-comandos.tsx` e
`src/lib/ajuda/conteudo/mapa-das-telas.ts` — `docs/ARQUITETURA.md` §10 tem a lista completa dos
lugares que uma rota nova toca).
