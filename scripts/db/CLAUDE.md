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

## O classificador de migrations (`classificar-migration.mjs`, F63)

O LEITOR ÚNICO de migration: imita o léxico do Postgres (comentário, inclusive de bloco aninhado, só fora de texto e de
dollar-quote; `$$` e `$rótulo$`), tira o corpo de `create function|procedure` (texto guardado) e MANTÉM o de `do`
(código executado). Falha fechada: delimitador sem fecho LANÇA. A guarda de topo de
`src/lib/itens/migrations-f38.test.ts` lê por ele — não reescreva um leitor privado de migration num teste.

Ele também CLASSIFICA (ADITIVA < BACKFILL < DESTRUTIVA; ILEGÍVEL para SQL dinâmico, chamada de função fora da lista
fechada `FUNCOES_SEM_ESCRITA` e default volátil) e CONFERE a regra a partir da `0159`: cabeçalho `-- classe:`, classe
declarada ≥ calculada, o bloco de `backups_migration` antes de cada comando que sobrescreve dado, nenhuma válvula, sem
`begin`/`commit`, ROLLBACK no rodapé. `node scripts/db/classificar-migration.mjs` confere; `--censo` imprime a cadeia.
Crescer `FUNCOES_SEM_ESCRITA` é decisão escrita na ata, como toda exceção nominal. Receita: `docs/RUNBOOK-BANCO.md`,
"A disciplina de backup de migração".

## O gate de deriva de tipos (`diff-tipos.mjs` + `tipos-conjuntos.mjs`)

`npm run db:types:diff` compara CONJUNTOS entre o catálogo do Postgres e
`src/lib/types/database.ts`. Reprova SÓ quando o BANCO tem o que o arquivo não tem — a direção
contrária é legítima (três motivos registrados; não "conserte" fazendo o teste bidirecional).

⚠ Ele compara com o banco **DO CI** — a deriva de PRODUÇÃO continua invisível até alguém rodar
`npm run db:types` apontado para produção.

## Ambos rodam incondicionalmente no `banco-sem-docker`

`npm run db:test:mutations` e `npm run db:types:diff` — não são opcionais nem "só quando dá
tempo".
