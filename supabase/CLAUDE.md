# CLAUDE.md — supabase/

Carrega quando você lê/edita algo em `supabase/**` (migrations, tests, ci). A regra
transversal — nunca editar migration já aplicada, nova migration exige `npm run db:lock` no
mesmo commit — já está na raiz. Aqui, o detalhe de cada subpasta.

## `migrations/`

- **`migrations.lock.json` é a TRAVA executável (F46).** Mapeia arquivo → sha256 do conteúdo
  normalizado (CRLF→LF). `src/lib/validators/migrations-lock.test.ts` reprova quando uma
  migration travada muda um byte, some, é renomeada, ou quando nasce migration nova ainda não
  travada. Regravado SÓ por `npm run db:lock`, e SÓ ao acrescentar migration — nunca à mão.
- **A janela `estoque.dev_destrutivo`** (GUC local à transação) é o que abre exceção à
  imutabilidade do acervo (trigger `guarda_acervo`, `0081`) — só as RPCs oficiais e a de import
  a abrem, e fecham antes de sair (inclusive no caminho de erro). `movimentacoes`/
  `lancamentos_item` recusam UPDATE/DELETE sempre; `ativos` recusa DELETE fora da janela. A
  marca `.forcado` (`0079`) só é gravável dentro dela.
- **A RPC `apagar_ativos_conflito_filiais`** trava o grupo inteiro em dois tempos e serializa
  por `pg_advisory_xact_lock` (`0100`) — não simplifique para um lock único sem reler por que
  (deadlock entre duas sessões travando as mesmas linhas em ordens opostas; ver
  `docs/ARQUITETURA.md` §4.4).
- Nome/numeração: prefixo sequencial de 4 dígitos; confira o último número existente antes de criar.
- **A classe no cabeçalho (F63).** A partir da `0159`, todo arquivo abre com `-- classe: ADITIVA | BACKFILL |
  DESTRUTIVA` e fecha com o `ROLLBACK` escrito no rodapé; o classificador (`scripts/db/classificar-migration.mjs`) confere
  contra o que o arquivo executa. Sobrescrever dado vivo exige o bloco de `public.backups_migration` antes do comando
  (receita BACKFILL no `docs/RUNBOOK-BANCO.md`); coluna nova em tabela viva é `add column … not null default
  <não-volátil>`, sem `update`, com `lock_timeout` por `set`/`reset`.
- **`supabase/rollback/`** guarda os rollbacks de fase (fora do ledger e da trava de hash), cada um ensaiado no CI por um
  roteiro `f<N>_rollback.sql`. O de uma fase pressupõe o das fases posteriores (o da F62 roda o da F63 antes).
- **Apply:** pelo conector ou pela Management API, ensaio primeiro (`docs/RUNBOOK-BANCO.md`). **Nunca**
  `supabase db push`, `migration repair` ou `db reset --linked` contra produção ou ensaio: o ledger não
  casa com os arquivos por construção, e quem confere o banco é a sonda de efeito, não o ledger
  (`docs/ADR-003-metodo-de-migration.md`).

## `ci/` — o bootstrap do job `banco-sem-docker`

O recorte MÍNIMO do que `supabase start` dava de graça, declarado à vista em vez de escondido
numa imagem de terceiro: `bootstrap-roles/-auth/-storage/-ledger.sql`, aplicados **nesta
ordem**, e `impressao-schema.sql` (a sonda de fingerprint do `RUNBOOK-BANCO.md`).

⚠ **NENHUM grant em `public` aqui.** `supabase start` também não os tem — os roteiros de
`supabase/tests/` plantam os seus próprios grants, e um grant a mais aqui faria
`seguranca_catalogo.sql` passar por um motivo errado (falso positivo mascarando uma policy que
deveria ter falhado).

## `tests/`

Roteiros SQL auto-verificáveis. Rodados por `scripts/db/rodar-roteiros.sh` — ver
`scripts/db/CLAUDE.md` para o motor (injetor de mutações, gate de deriva de tipos).
