## estado_bkp

`_bkp_relatorios_gerados_f6a` SÓ EXISTE EM PRODUÇÃO — nenhuma migration a cria (grep confirmado: as únicas menções em supabase/migrations/ são nos COMENTÁRIOS da 0039 e da 0058, nenhum `create table`). Nasceu em 16/07/2026 (F6A) como `create table ... as select` ad-hoc no SQL Editor, guardando 2 snapshots congelados do go-live (DECISOES.md L534: "Backup in-DB em public._bkp_relatorios_gerados_f6a (RLS on)") — ou seja, RLS já nasceu LIGADA nela, não foi o stopgap da 0038 que a ligou (esse stopgap, 21/07, cobriu só "duas tabelas de backup expostas" = `_f8_backup_matriz_compras` e `_f7k_backup_modelo`, migration 0038 comentário L6-L11).

0039 (linha 16-19): "NÃO removida aqui (de propósito): `_bkp_relatorios_gerados_f6a` (2 snapshots de go-live) — está atrelada a uma DECISÃO EM ABERTO do Johnny sobre os 2 snapshots congelados da carga (chip pendente, docs/DECISOES.md · F6A). Só remover quando essa decisão fechar — vira uma migration própria."
0058 (linha 28-30): "A OUTRA backup, `_bkp_relatorios_gerados_f6a` (2 linhas), NÃO é tocada aqui de propósito: está atrelada a uma decisão em aberto do Johnny sobre os 2 snapshots de go-live. Quando ele decidir, ela ganha a própria migration de DROP."

DECISOES.md confirma repetidamente, com o MESMO fato em cada ata (F19 L373-375, F22 L456-458, "Decisão 5" L7262-7268, RUNBOOK-BANCO.md L227): **RLS ligada, ZERO policies → deny-all** (só service_role lê). Nenhuma ata (nem F19 nem F22, nem nenhuma outra) afirma que existe policy nela — todas dizem explicitamente "zero policies". RUNBOOK L2531-532 confirma de novo em 25/07: "`_bkp_relatorios_gerados_f6a` tem 1 tabela + 8 colunas e responde sozinha pelas duas diferenças [do fingerprint ensaio×produção]. Ela existe só em produção de propósito." Ou seja: não colide com policy nenhuma — pode-se criar a primeira e única policy sem risco de nome duplicado, mas TAMBÉM sem risco: `alter table ... enable row level security` é idempotente (não erra se já ligada).

O bloco de database.ts (linha 17-49) é a forma exata a reproduzir: 8 colunas, TODAS anuláveis, SEM chave primária, SEM default, `Relationships: []` (nenhuma FK) — exatamente o que um `create table ... as select` produz (não herda PK/FK/NOT NULL/default da tabela-origem `relatorios_gerados`, cuja definição real está em supabase/migrations/0010_relatorios_gerados.sql: id uuid PK, periodo_de/periodo_ate date not null, filial_id smallint FK→filiais, versao smallint not null default 1, dados jsonb not null, gerado_por uuid not null FK→profiles, gerado_em timestamptz not null default now()). Os tipos-base (sem NOT NULL) para a 0128: id uuid, periodo_de date, periodo_ate date, filial_id smallint, versao smallint, dados jsonb, gerado_por uuid, gerado_em timestamptz — batem 1:1 com os 8 campos do database.ts.

## forma_da_0128

SQL proposto (não escrito no disco — só leitura nesta exploração):

```sql
-- Migration 0128 — adoção de `_bkp_relatorios_gerados_f6a` no versionamento (F47, Frente F).
--
-- A tabela existe SÓ EM PRODUÇÃO desde 16/07/2026 (F6A), nascida por `create table ... as
-- select` ad-hoc no SQL Editor (RLS já ligada na criação — DECISOES.md, ata F6A). Nenhuma
-- migration a cria; database.ts a carrega há meses porque é gerado DE PRODUÇÃO. O CI
-- (`banco-sem-docker`) constrói o banco só a partir das migrations, então sem este `create
-- table if not exists` ele nunca teria a tabela e qualquer `alter table ... enable row level
-- security`/`create policy` sobre ela morreria com 42P01.
--
-- FORMA: as 8 colunas ANULÁVEIS, sem PK/FK/default/NOT NULL — espelho exato do que
-- `create table as select` produz (confirmado em src/lib/types/database.ts:17-49, gerado de
-- produção) e das colunas correspondentes de `relatorios_gerados` (migration 0010), SEM as
-- constraints daquela tabela.
--
-- NÃO-IDEMPOTÊNCIA DE `create policy` — CONFERIDO ANTES DE ESCREVER:
--   · a tabela JÁ EXISTE em produção  → `if not exists` faz desta migration um no-op de
--     estrutura lá (Postgres não valida colunas quando a tabela já existe).
--   · a RLS JÁ ESTÁ LIGADA em produção desde a criação (não é o stopgap da 0038 — aquele
--     cobriu só _f8_backup_matriz_compras/_f7k_backup_modelo) → `enable row level security`
--     é seguro de repetir (Postgres não erra ao religar RLS já ligada).
--   · ZERO policies existem hoje em produção nesta tabela (DECISOES.md: F19 L373-375, F22
--     L456-458, Decisão 5 L7262-7268, RUNBOOK L227/2531 — todas concordam) → `create policy`
--     com o nome abaixo NÃO colide com nada e portanto NÃO derruba o apply em produção; ela
--     roda pela primeira vez ali, exatamente como no CI/ensaio (onde a tabela nasce agora).
--
-- Caminho A do runbook (aditiva, sem `delete from ativos/movimentacoes` — não bate no gate):
-- MCP `apply_migration` em ensaio primeiro, depois produção.
--
-- REVERSÃO: `drop policy "dev le backup f6a" on public._bkp_relatorios_gerados_f6a;`
-- `alter table public._bkp_relatorios_gerados_f6a disable row level security;` — NUNCA
-- `drop table` (apagaria os 2 snapshots que a decisão em aberto do Johnny protege).

create table if not exists public._bkp_relatorios_gerados_f6a (
  id          uuid,
  periodo_de  date,
  periodo_ate date,
  filial_id   smallint,
  versao      smallint,
  dados       jsonb,
  gerado_por  uuid,
  gerado_em   timestamptz
);

comment on table public._bkp_relatorios_gerados_f6a is
  'F6A (16/07/2026): backup em banco dos 2 snapshots de relatorios_gerados do dia do go-live, antes de um scrub que a camada de permissão recusou fazer em produção sem o operador (mutação de dado congelado, fora do escopo daquela ordem). Retida por decisão em aberto do Johnny (ver docs/DECISOES.md · F6A) — NUNCA apagar sem essa decisão fechar. Adotada no versionamento pela F47 (0128) só para o CI construir o mesmo universo de objetos que produção; a tabela em si já existia em produção desde a criação, com RLS ligada.';

alter table public._bkp_relatorios_gerados_f6a enable row level security;

-- Leitura: só dev (área /dev · diagnóstico). Nenhuma policy de escrita — a tabela é histórico
-- imutável; só o service role grava (e nunca mais gravará, porque a F6A já fechou).
create policy "dev le backup f6a" on public._bkp_relatorios_gerados_f6a
  for select to authenticated
  using ((select public.e_dev()));

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   select relrowsecurity from pg_class where oid = 'public._bkp_relatorios_gerados_f6a'::regclass;
--   -- esperado: true (era true antes também, em produção)
--   select policyname, cmd, roles::text from pg_policies
--    where schemaname='public' and tablename='_bkp_relatorios_gerados_f6a';
--   -- esperado: EXATAMENTE 1 linha — "dev le backup f6a" · SELECT · {authenticated}
--   select count(*) from public._bkp_relatorios_gerados_f6a;
--   -- esperado: 2 em produção (os 2 snapshots) · 0 no CI/ensaio (tabela nasce vazia ali)
```

Escolhas explicadas: (1) nome da tabela mantido — a fase adota no versionamento, não migra/renomeia (fora de escopo, §5 do plano só pede "trazer para o versionamento sem apagar snapshot"); (2) `for select to authenticated using ((select public.e_dev()))` segue o padrão wrapped-InitPlan de `eventos_admin` (0065) e `dev_checagens_integridade` (0127) — `e_dev()` (não `e_admin()`) porque o histórico de backup ad-hoc é matéria de diagnóstico/dev, não de administração de cadastro; (3) nenhum índice — 2 linhas, sem consulta por período prevista; (4) `comment on table` segue a convenção de `eventos_admin`/`dev_checagens_integridade` de documentar proveniência e regra de não-apagar direto no catálogo.

## convencoes_migration

Cabeçalho: comentário livre no topo explicando CONTEXTO → O QUE MUDA → POR QUÊ → (quando toca produção) VERIFICAÇÃO PÓS-APPLY e REVERSÃO/ROLLACK, sempre em pt-BR, tom denso e argumentativo (nunca só "adiciona coluna X"). Ex. 0127 abre com "-- Migration 0127 — as reservas abertas ganham saída, e uma checagem para que não voltem (F41, frente A · decisões J1 e J5 de docs/PLANO-ITENS.md)." e fecha com bloco "===== SMOKE (rodar depois de aplicar — só leitura) =====" comentado.

Nomenclatura de policy: string literal entre aspas duplas, em português, minúsculas, descrevendo QUEM+O QUÊ — `"admin le auditoria"` (0065), `"operador gera"` (0010), `"dev le backup f6a"` seguiria o mesmo molde. `for select|insert|update|delete to authenticated using (...)`/`with check (...)`; predicado sempre envolvido em `(select public.<funcao>())` quando é chamada de função (InitPlan — avaliação por statement, não por linha; lição documentada no RUNBOOK-BANCO.md e na 0070).

`comment on table`/`comment on column` é convenção corrente (0065 eventos_admin, 0010 relatorios_gerados) — texto corrido explicando propósito, quem escreve/lê, e o vocabulário fechado de colunas texto-livre.

Migrations recentes (0125-0127) mostram o padrão para blocos DML/DDL grandes: `do $$ ... end $$;` com `raise notice` de contagem no fim; `security definer`/`stable`/`set search_path = public` em toda função nova; `create or replace function` só com assinatura IDÊNTICA à anterior (nunca overload); comentário citando o md5/tamanho do corpo vigente ANTES da recriação, como prova de diff mínimo (0127 linha 174-175: "Corpo de partida lido do banco em 31/08/2026: md5 = c12806bd... A ÚNICA diferença é o bloco reserva_aberta acrescentado no fim.").

Toda migration termina com marcação explícita de reversibilidade ("ADITIVA:", "IRREVERSÍVEL POR CONSTRUÇÃO:", "ROLLBACK LÓGICO:") e, quando toca produção, um bloco `-- ---------- VERIFICAÇÃO PÓS-APPLY ----------` ou `-- ===== SMOKE =====` com SELECTs prontos para colar, cada um com o resultado ESPERADO comentado ao lado (nunca só a query).

Migração de tabela nova segue sempre a mesma sequência: `create table` → `comment on table/column` (opcional) → `create index` (se houver) → `alter table ... enable row level security` → `create policy` uma por verbo, nunca `for all` (lição da F21/0063: FOR ALL cega a leitura se alguém alterar só ela depois).

## trava_lock

`supabase/migrations.lock.json` (versionado): objeto `{_leia, algoritmo: "sha256", normalizacao: "CRLF (0D 0A) → LF (0A), em bytes, antes do hash", gerado_por: "npm run db:lock", migrations: {"<arquivo>.sql": "<hash sha256 hex 64 chars>", ...}}`. Hoje 126 entradas, `0001_profiles.sql` → `0127_conversao_reservas.sql` (confirmado por leitura do arquivo — não os hashes em si, só a forma e a contagem).

Hash: sha256 do CONTEÚDO EM BYTES do arquivo após normalizar `\r\n`→`\n` (um `\r` solto sem `\n` NÃO é removido — faz parte do conteúdo). A normalização é feita em `src/lib/validators/migrations-lock.ts::normalizarConteudo` (varre byte a byte, pula o par `0x0D 0x0A`), consumida por `hashDoConteudo`. Motivo medido (06/09/2026, F46): a árvore de trabalho no Windows tem CRLF (0001: 51 linhas com CR; 0127: 322), o blob do git (o que o CI Linux recebe) é LF — sem normalizar, mesmo arquivo teria 2 hashes e a trava acusaria deriva a cada clone.

`scripts/db/gravar-lock.ts` é a ÚNICA coisa que ESCREVE o lock (`npm run db:lock`). Lê `hashesDoDisco(raiz)` (varre `supabase/migrations/*.sql`, ordenado por nome), compara contra o lock atual via `conferirLock`, e separa em 3 classes: `nova` (arquivo no disco sem entrada no lock — grava normalmente), `alterada` (hash do disco ≠ hash travado — **RECUSA, sai 1, NADA é gravado**, a menos que rode com `--regravar-alterada`), `sumiu` (entrada travada sem arquivo correspondente no disco — só aparece no relatório de leitura, não bloqueia a gravação de per si mas junto de `alterada` derruba). Guarda de segurança: se `process.env.VITEST` estiver setado, o próprio script lança erro (nunca deve ser importado dentro do Vitest, senão o teste passaria a REGRAVAR em vez de conferir).

`src/lib/validators/migrations-lock.test.ts` (roda em `npm run test`) SÓ LÊ e compara — nunca escreve: (1) `lerLock(RAIZ)` + `hashesDoDisco(RAIZ)` + `conferirLock(...)` tem de devolver `[]` (nenhuma migration travada mudou, nenhuma nova sem lock, nenhuma sumida); (2) `Object.keys(lock.migrations).sort()` tem de ser EXATAMENTE igual à listagem `.sql` do disco (sem sobra nem falta); (3) `serializarLock(lock.migrations)` tem de ser byte-a-byte igual ao que `serializarLock(hashesDoDisco(RAIZ))` produziria (recusa lock editado à mão — ordem de chaves, formatação, cabeçalho). Mensagens de falha são DIFERENTES por classe de propósito: a de `alterada` NÃO cita `npm run db:lock` (regravar apagaria a prova do erro); a de `nova` cita a linha exata a rodar; a de `sumiu` manda restaurar o arquivo com o nome original.

**Quando nasce a migration `0128`:** ela entra como `nova` (arquivo novo, hash inexistente no lock) → o teste reprova nomeando `supabase/migrations/0128_<nome>.sql ainda não está em supabase/migrations.lock.json` → a correção EXIGIDA é `npm run db:lock` no MESMO commit da migration (regra explícita do runbook, RUNBOOK-BANCO.md § "Quem acrescenta migration atualiza DUAS listas" — a outra lista é `src/lib/itens/migrations-f38.test.ts`, que também tem de listar a 0128 desde a 0116 em diante).

## apply_producao

RUNBOOK-BANCO.md define DOIS caminhos conforme o corpo da migration contenha `delete from public.ativos`/`delete from public.movimentacoes` (o "gate" do modo autônomo — classificador do MCP bloqueia essas DDLs em qualquer projeto):

A migration 0128 é puramente aditiva (`create table if not exists`, `comment on table`, `alter table ... enable row level security`, `create policy` para SELECT) — SEM `delete from ativos/movimentacoes` → **caminho A** (RUNBOOK-BANCO.md linha 51-52): "O orquestrador aplica direto via MCP (`apply_migration`) em ensaio primeiro, depois produção; confere com `get_advisors` + um smoke só-leitura. Registrada no ledger normalmente." Não precisa do fluxo humano-no-circuito do caminho B (SQL Editor do Johnny) — é o próprio F47-injetor-de-mutacoes-e-gate-de-deriva-ultracode.md que confirma isso (§5 do escopo, linha 235-236: "Apply em produção pelo caminho normal do runbook (não é destrutiva)"; Suposição 4: "Apply da 0128 em produção entra nesta fase, pelo caminho normal do runbook").

Passo a passo do "caminho, em 30 segundos" (RUNBOOK linha 21-30), aplicado a esta migration: (1) escrever `supabase/migrations/0128_*.sql`; (2) não bate no gate → caminho A; (3) aplicar em ENSAIO primeiro via MCP `apply_migration`; (4) verificação pós-apply (as 3 queries do bloco `VERIFICAÇÃO PÓS-APPLY` acima: `relrowsecurity=true`, exatamente 1 policy `"dev le backup f6a"`/SELECT/{authenticated}, contagem de linhas — 0 no ensaio, 2 em produção); (5) mexeu em função/trigger/RPC/enum? Não — pula o "rode TODOS os roteiros"; (6) `notify pgrst, 'reload schema';` — não é estritamente necessário (não mudou assinatura de RPC nem colunas consumidas por PostgREST em cache, mas é barato e o runbook recomenda rodar mesmo assim quando em dúvida); (7) aplicar em PRODUÇÃO via MCP `apply_migration`, repetir 4→6; (8) não há deploy de código Vercel associado (nenhuma tela/rota usa esta tabela — a policy só habilita leitura futura pela área /dev).

Pré-requisito de acesso (RUNBOOK linha 11-19, tabela): "**MCP Supabase** conectado" para `apply_migration`/`execute_sql`/`get_advisors`/`list_migrations` — "o agente, na sessão". Não existe Supabase CLI local apontando para produção (linha 19); toda operação em prod passa por MCP ou pelo SQL Editor (só o Johnny tem acesso ao SQL Editor de produção — não é o caminho aqui, já que não bate no gate).

Credenciais/variáveis — verificadas por NOME em `.env.local` e `.env.example` (nenhum valor lido ou impresso):
- `.env.local` (dev, existe no ambiente) tem: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `VIEW_SESSION_SECRET`, `SEED_CONFIRM`, `SMOKE_EMAIL`, `SMOKE_SENHA` — **8 variáveis, todas apontando para o projeto de DEV** (`sgmvldiizsrjbxzzpmhh` é o ensaio; o CLAUDE.md/runbook não documentam um projeto "dev" à parte do "ensaio" nas credenciais locais — mas o ponto central é: nenhuma delas é usada para aplicar migration em PRODUÇÃO, porque a aplicação em produção passa pelo MCP Supabase, não por essas variáveis. `SEED_PROJECT_REF` (presente em `.env.example`, exigida por `scripts/env-guard.ts`) **NÃO existe** em `.env.local` — grep confirmado, 0 ocorrências.
- Não existe `.env.production` nem `DATABASE_URL` no repositório/ambiente local — coerente com o runbook ("Não existe Supabase CLI local apontando para produção").
- O caminho de fato para aplicar em produção — a ferramenta MCP Supabase (`apply_migration`) — é uma integração do Claude Code em si (conectada fora do repositório, na configuração da sessão/MCP), não uma credencial em `.env*`; esta exploração não teve esse MCP carregado e, por instrução da tarefa, NÃO tentou conectar nem verificar sua disponibilidade. O único indício textual no repo de uma credencial ligada a projeto Supabase por REF é `DB_TYPES_PROJECT_REF` + `SUPABASE_ACCESS_TOKEN` (usadas por `scripts/gen-types.ts` para `npm run db:types`, não para apply de migration) — `SUPABASE_ACCESS_TOKEN` existe em `.env.local`, `DB_TYPES_PROJECT_REF` não existe em `.env.local` nem em `.env.example` como variável com valor-exemplo preenchido (aparece só como conceito no comentário de `gen-types.ts`).