# CLAUDE.md — scripts/db/

Carrega quando você lê/edita algo aqui. Este diretório é o rig de verificação do banco —
quatro ferramentas com responsabilidades separadas DE PROPÓSITO. Não fundir.

## `gravar-lock.ts` (`npm run db:lock`)

O ÚNICO ponto que escreve `supabase/migrations.lock.json`. Nunca edite o lock à mão.

## `rodar-roteiros.sh` — o runner ÚNICO

Chamado pelo job `banco-sem-docker` do CI (required check) e por `npm run db:test` na mesa.
O job `banco` antigo, com Docker do Supabase, saiu na v1.51.1 — não recrie esse caminho.

## O injetor de mutações (`run-mutation-tests.mjs` + `mutacoes.mjs`)

**Motor e catálogo são separados de propósito.** `mutacoes.mjs` é o CATÁLOGO — o lote ATIVO e a
QUARENTENA declarada (entrada não-executável; toda quarentena nomeia a fase que a adota, e há
teste exigindo isso + o teto de um terço do lote). Fases novas mexem só nele.
`run-mutation-tests.mjs` é o MOTOR: controle verde primeiro (senão aborta ANTES de mutar), um
banco descartável por mutação, sonda que prova que a mutação pegou.

⚠ **O runner sai 1 quando o roteiro fica vermelho — e para o injetor isso é SUCESSO.** A
inversão está comentada no motor. Se você vir `run-mutation-tests` saindo 1 e pensar "quebrei
alguma coisa, deixa eu consertar o código para sair 0" — pare: você inverteria o próprio
propósito da ferramenta (provar que a mutação foi DETECTADA).

`corpo-vigente.mjs` resolve o corpo VIVO de uma função varrendo as migrations da maior para a
menor; `trocarNoCorpo` recusa a troca que viraria no-op silencioso (proteção contra mutar uma
função de 400 linhas colando uma cópia que envelhece e some do radar).

`saida-roteiro.mjs` lê a saída do roteiro por **TOKEN**, nunca substring — `2c` é prefixo de
`2c-bis`, e em `dev_destrutivo` o rótulo `1` é prefixo de outros dezenove. Um novo roteiro
precisa emitir `✗ <rótulo>` literal ou `assert_zero_de('<rótulo>'` — um helper que emita o
rótulo por outro caminho deixa a mutação INVISÍVEL para o injetor (v1.66.5).

## O gate de deriva de tipos (`diff-tipos.mjs` + `tipos-conjuntos.mjs`)

`npm run db:types:diff` compara CONJUNTOS entre o catálogo do Postgres e
`src/lib/types/database.ts`. Reprova SÓ quando o BANCO tem o que o arquivo não tem — a direção
contrária é legítima (três motivos registrados; não "conserte" fazendo o teste bidirecional).

⚠ Ele compara com o banco **DO CI** — a deriva de PRODUÇÃO continua invisível até alguém rodar
`npm run db:types` apontado para produção.

## Ambos rodam incondicionalmente no `banco-sem-docker`

`npm run db:test:mutations` e `npm run db:types:diff` — não são opcionais nem "só quando dá
tempo".
