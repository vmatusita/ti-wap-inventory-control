# Runbook — operações de banco (Supabase)

Procedimento único para aplicar migrations e mudanças de banco neste projeto. Nasceu do item **A** do plano de dívida técnica (`docs/DIVIDA-TECNICA.md`) para tirar da cabeça o que hoje é conhecimento tribal (o "gate", o apply manual, as armadilhas).

## Topologia

| Papel | Projeto Supabase (ref) | Uso |
|---|---|---|
| **Produção** | `pbtjcalbmepmrqzprusb` | dados reais da WAP (go-live 15/07/2026) |
| **Ensaio** | `sgmvldiizsrjbxzzpmhh` | rehearsal — a Supabase CLI local está linkada a ESTE |

Operações de banco são feitas **via MCP Supabase** (o ambiente não tem CLI local apontando para produção). O `supabase/schema.sql` é histórico (banner no topo) — a verdade são as migrations em `supabase/migrations/`.

> **Esta tabela tem consumidor no código.** `scripts/env-guard.ts` mantém a lista `REFS_DE_PRODUCAO`, que faz `npm run db:seed` / `npm run db:reset` **recusarem** qualquer ref de produção, independentemente do que estiver no `.env.local` (descoberto na F11, 22/07/2026: as guardas anteriores só conferiam se `SEED_PROJECT_REF` **batia com a URL** — consistência, não identidade —, e ambos apontavam para produção). **Projeto de produção novo entra nesta tabela E naquela lista, no mesmo commit.** Um ref de produção que não esteja lá volta a ser um alvo válido para o seed de dados fictícios.

## O "gate" do modo automático

O classificador do modo autônomo **bloqueia** qualquer DDL cujo corpo contenha `delete from public.ativos` ou `delete from public.movimentacoes` (via `apply_migration`/`execute_sql` do MCP) — em **qualquer** projeto, prod ou ensaio. Na prática isso atinge só a RPC destrutiva do import (`importar_ativos_substituir`, migrations 0031–0037, 0040). O objetivo é impedir que o agente rode uma exclusão de acervo sem um humano no circuito.

**Consequência (dívida conhecida):** essas migrations são aplicadas **à mão pelo Johnny no SQL Editor** e, por isso, **não são registradas** em `supabase_migrations.schema_migrations`. O estado de produção não é reconstruível só pelo ledger — ver "Divergência" abaixo.

## Aplicar uma migration

### A) Migration NÃO-destrutiva (não toca `delete from ativos/movimentacoes`)
O orquestrador aplica direto via MCP (`apply_migration`) em **ensaio primeiro**, depois produção; confere com `get_advisors` + um smoke só-leitura. Registrada no ledger normalmente.

### B) Migration DESTRUTIVA / que recria a RPC de import (bate no gate)
Fluxo humano-no-circuito (o que já se faz desde a F7):
1. **Migration no repo** (`supabase/migrations/NNNN_*.sql`) — fonte da verdade versionada. Recriações de função por `create or replace` PURO (assinatura idêntica → sem overload).
2. **SQL de handoff** em `scratchpad/` (cópia rodável + bloco de conferência).
3. **Diff-review**: o diff da nova migration vs a anterior deve ser **só a mudança pretendida** (ex.: "diff 0040 vs 0037 = só a guarda p_contagens"). Qualquer outra diferença é bug. Revisão adversarial byte-a-byte antes do merge.
4. **Johnny roda no SQL Editor de produção** após conferir.
5. **Verificação pós-apply OBRIGATÓRIA** (fecha a armadilha do "arquivo errado" — na F7E o editor rodou a 0033 no lugar da 0034 por engano):
   ```sql
   -- a função ficou com a assinatura certa e SEM overload?
   select p.oid::regprocedure::text
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'importar_ativos_substituir';
   -- esperado: EXATAMENTE 1 linha, 4 args (jsonb, text, jsonb, jsonb)

   -- o grant está certo? (anon/service_role NÃO devem ter execute)
   select r.rolname, has_function_privilege(r.rolname,
     'public.importar_ativos_substituir(jsonb,text,jsonb,jsonb)', 'execute')
   from (values ('anon'),('authenticated'),('service_role')) r(rolname);
   -- esperado: authenticated=true, anon=false, service_role=false
   ```
6. **Recarregar o cache do PostgREST**: `notify pgrst, 'reload schema';` (senão a API não enxerga a nova assinatura).
7. **Smoke só-leitura de produção** (ver o padrão nas atas de F7* em `docs/DECISOES.md`).

## Divergência do ledger (estado em 23/07/2026 — ver a medição de 24/07 mais abaixo)

`list_migrations` de produção mostra `0001`–`0030` + `rate_limit_senha` (0025) + `0038` + `0041`. **Faltam no ledger** (aplicadas à mão pelo gate, mas os objetos EXISTEM em produção — `import_logs`, a RPC de 4 args etc.):

- **0031, 0032, 0033, 0034, 0035, 0036, 0037** — as migrations do import de startup (F7…F8).
- `0029` **não existe** (gap real na numeração; nunca foi criada).
- **`0039` (drop dos backups) e `0040` (hardening das RPCs) — JÁ APLICADAS, só fora do ledger.** *Correção de 23/07/2026 (F12).* Até esta data o runbook, o `README.md` e o `CHANGELOG.md` diziam que as duas estavam **pendentes de apply**. **Medição direta no banco de produção desmente:** não existe **nenhuma** tabela `backup%` (é exatamente o efeito da `0039`) e o corpo de `importar_ativos_substituir` **contém** a guarda `p_contagens is null` (efeito da `0040`). O que falta é o **registro**, não o efeito — elas entram na reconciliação abaixo, junto com as `0031`–`0037`. **Conferir antes de reconciliar** (ver os dois SELECTs em "Como conferir o efeito", logo abaixo): registrar no ledger uma migration que não esteja aplicada é pior que a divergência.
- **`0041`** (domínios de login: `@stefanini.com` + `@latam.stefanini.com`, 22/07/2026) — **aplicada por MCP em prod E ensaio**, e no ledger dos dois. Não bate no gate (é `create or replace` de trigger, sem `delete from`).
- **`0042`** (`itens.estoque_minimo` — F12, 23/07/2026) e **`0043`** (`kits_modelos` — F12, 23/07/2026) — as duas **aditivas** (coluna com default `0` + tabela nova com RLS), sem `delete from`, então **não batem no gate**: aplicadas por MCP em **ensaio primeiro** e depois em produção, e registradas no ledger dos dois normalmente. Rollback documentado no backup lógico da ordem: são aditivas, o `drop` não perde nenhum dado do acervo.
- **`0044`** (enums `devolvido_fornecedor`/`devolucao_fornecedor` — F14, 23/07/2026) e **`0045`** (colunas `movimentacoes.chamado_fornecedor` + `ativos.substitui_ativo_id`, check `NOT VALID`, recriação de `status_apos_movimentacao`/`aplicar_movimentacao`/`rel_estoque_asof` por `create or replace` puro, RPC nova `devolver_ao_fornecedor`) — **aditivas**, sem `delete from` → **não batem no gate**: aplicadas por MCP em **ensaio primeiro** e depois em produção, registradas no ledger dos dois. `0044`/`0045` são migrations **separadas** de propósito (valor de enum novo não é usável na transação que o adiciona). Verificação pós-apply em produção: enums 9/14, colunas/check/índice presentes, RPC 1 assinatura + grants (authenticated=true, anon/service_role=false), diffs corretos das 3 funções (conferidos ANTES de recriar: corpos vigentes = base 0022/0023/0024, sem drift), acervo inalterado (1593). Rollback lógico: `drop` das colunas/índice/RPC + `create or replace` das 3 funções de volta aos corpos 0022/0023/0024 (nenhum dado do acervo se perde).
- **`0046`** (`add value 'troca'` — F15, 23/07/2026), **`0047`** (usos de `troca`: recriação de `status_apos_movimentacao`/`aplicar_movimentacao`/`rel_estoque_asof` + `devolver_ao_fornecedor` por `create or replace` puro) e **`0048`** (recriação de `importar_ativos_substituir` — só a expressão da pendência muda: service tag vazia → `'sem service tag'`) — **aditivas**, sem `delete from` de dado no ato do apply → **não batem no gate**: aplicadas por MCP em **ensaio primeiro** e depois em produção, registradas no ledger dos dois. `0046`/`0047` **separadas** de propósito (valor de enum novo não é usável na transação que o adiciona — espelho de 0044/0045). A `0048` faz `create or replace` de uma RPC que **tem** `delete from` no corpo, mas o `apply_migration` do MCP não a barrou (o corpo não é executado no apply, só redefinido). Verificação pós-apply em produção: enum 15/`troca` no fim, 1 assinatura por função + grants corretos (as 2 RPCs de escrita authenticated-only; `rel_estoque_asof` idêntica à 0045), casos novos por `pg_get_functiondef`, `get_advisors(security)` 0 achados NOVOS, acervo inalterado (1596). Rollback lógico: `create or replace` das funções de volta aos corpos 0045/0040 (o enum `add value` é inócuo se não usado).
- **`0049`** (`create or replace view v_pendencias` — ativo `origem='importacao'` deixa de ser cobrado por "termo pendente", 24/07/2026) — **não-destrutiva** (só redefine a view; nenhum `delete from`), então **não bate no gate**: caminho **A** — aplicada por MCP em **ensaio primeiro** e depois produção, registrada no ledger dos dois (version timestamp, name `0049_pendencia_termo_dispensa_import`). Diff vs 0028 = só `and a.origem is distinct from 'importacao'` no ramo de termo (CASE `pendencia` + CASE `desde` + WHERE); 14 colunas idênticas. Verificação pós-apply em produção: `v_pendencias` 1.163→60, "termo pendente" 1.142→2, `import_ainda_termo=0`, `get_advisors(security)` 0 achado novo. **Sem passo de PostgREST/deploy** (colunas inalteradas). Rollback: `create or replace` de volta ao corpo 0028.
- **Retroativo C3 (F15 — toca dado, caminho B).** UPDATE de **2 linhas** de `movimentacoes` (`tipo 'compra'→'troca'` no nascimento dos substitutos já registrados, `ativo_id in (select id from ativos where substitui_ativo_id is not null)`). O classificador **não barrou** um UPDATE de 2 linhas via `execute_sql`. Backup das linhas em `scratchpad/f15/retroativo-backup.md` (WAP0005656/WAP0005657); antes=depois conferido (`compra` de substituto 2→0, `troca` 0→2); `status_resultante`/estado dos ativos intactos (a transição de `troca` é a mesma da `compra`). Rollback: `update movimentacoes set tipo='compra' where id in ('5cc393bc-…','95d3d096-…')`.

### Como conferir o efeito (sem depender do ledger)

```sql
-- 0039 aplicada? Nenhuma tabela de backup órfã deve sobrar.
select count(*) as tabelas_backup
from pg_tables where schemaname = 'public' and tablename like 'backup%';
-- esperado: 0

-- 0040 aplicada? A guarda de contagens tem de estar no corpo da RPC.
select pg_get_functiondef(p.oid) like '%p_contagens is null%' as tem_guarda
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'importar_ativos_substituir';
-- esperado: true (exatamente 1 linha)
```

### ⚠️ O ledger NÃO é o controle de integridade (medição de 24/07/2026)

**Nunca rode `supabase db push` contra produção a partir deste repo.** A reauditoria de dívida técnica (24/07) mediu o ledger e achou uma incompatibilidade **estrutural**, não uma simples defasagem:

- As `version` do ledger são **timestamps de 14 dígitos gerados pelo MCP no ato do apply** (`20260722145340` → `0041_dominios_login`); os arquivos do repo usam prefixo sequencial (`0041_…sql`). A doc do Supabase confirma que a CLI identifica migration **pelo timestamp do nome do arquivo** ("a new row will be inserted into the migration history table with timestamp as its unique id").
- Portanto os dois esquemas **não casam para praticamente nenhuma migration** — não só para as faltantes. Um `db push` tentaria reaplicar migrations já aplicadas.
- **O dano concreto:** a RPC do import é redefinida em cadeia (`0032`→`0037`→**`0048`**). Reaplicar `0031`–`0037` **regrediria** o corpo vivo para o da `0037`, desfazendo a `0048`.

**O controle que funciona (e que já se usa):**
1. **Sonda de efeito** — conferir o objeto no banco (`pg_get_functiondef`, `information_schema`, `has_function_privilege`), não o ledger. É o método de fingerprint que a F19 usou para provar paridade ensaio×produção.
2. **Job `banco` do CI** — prova que as 55 migrations aplicam limpo e em ordem num Postgres novo.
3. **Verificação pós-apply** do passo 5 acima.

**Estado medido em 24/07/2026:** 55 migrations no repo, **45 no ledger**. As 10 ausentes (`0031`–`0037`, `0039`, `0040`, `0056`) foram **todas sondadas e estão aplicadas** — inclusive a **`0056`** (as sete RPCs `rel_*` já estão com `anon` sem `execute`), que o `CHANGELOG` ainda dava como pendente de handoff.

### Reconciliação (opcional — decisão do Johnny; **cosmética**)
Registrar no ledger as migrations já aplicadas, para o histórico bater com produção. **Metadados apenas** (não recria nada — só insere linhas) e, pelo que está acima, **não torna o repo pushável**: serve para leitura humana do histórico, não como garantia. Rodar no SQL Editor de produção:

```sql
-- Registra 0031–0037, 0039 e 0040 como já aplicadas (idempotente por 'on conflict').
-- version = prefixo do nome do arquivo (mesmo padrão das 0001–0007 no ledger).
-- RODE ANTES os dois SELECTs de "Como conferir o efeito": 0039/0040 entram aqui
-- porque a medição de 23/07/2026 provou que os EFEITOS delas estão em produção.
insert into supabase_migrations.schema_migrations (version, name)
values
  ('0031','import_logs'),
  ('0032','import_rpcs'),
  ('0033','import_correcoes'),
  ('0034','import_melhorias'),
  ('0035','import_compra_data_real_no_relatorio'),
  ('0036','reverter_compra_abertura_baseline'),
  ('0037','import_patrimonio_forcado'),
  ('0039','drop_backups_orfaos'),
  ('0040','hardening_rpcs'),
  ('0056','rel_rpcs_revoke_anon')   -- aplicada (medido 24/07: anon sem execute nas 7 rel_*)
on conflict (version) do nothing;
```

> **Confira o `name` real dos arquivos** em `supabase/migrations/` antes de rodar (o `version` é que importa para o `on conflict`; o `name` é só rótulo).
Conferir antes: `select version, name from supabase_migrations.schema_migrations order by version;`. Reversível (`delete` das mesmas `version`). Como o apply de produção é manual (gate), esta reconciliação é para **fidelidade do histórico**, não muda o funcionamento.

## Roteiros de teste SQL — rode TODOS ao mexer em função/trigger (regra nova, F17)

**Mudou uma função, um trigger, a máquina de estados ou uma RPC (qualquer `create or replace` de função, ou um `add value` de enum que muda comportamento)? Rode TODOS os roteiros de `supabase/tests/*.sql` antes do push — não só o roteiro novo da fase.**

Por quê: `npm run lint` / `test` / `build` **não executam** os roteiros SQL — só o job `banco` do CI (GitHub Actions) os roda (sobe um Postgres, aplica `0001`→última migration e roda cada `*.sql` com `psql`, falhando em qualquer `WARNING: ✗`). Foi exatamente o furo da **F15**: a `0047` mudou a RPC `devolver_ao_fornecedor` (o substituto passou a nascer por `troca`, não `compra`); o roteiro novo `troca.sql` cobriu o comportamento novo, mas o roteiro `manutencao_fornecedor.sql` (F14) **continuou exigindo `compra`** no cenário 4d → o job `banco` ficou vermelho a cada run desde o push da F15, sem que `lint/test/build` locais acusassem nada. Corrigido na **F17** (4d passou a exigir `troca`; ata em `docs/DECISOES.md`).

Como rodar sem Docker/psql local (este ambiente): prove os roteiros no projeto de **ENSAIO** via MCP Supabase `execute_sql` — bloco `begin; … rollback;` que devolve **LINHAS** (o MCP engole `NOTICE`/`WARNING`, então não confie neles: compare o valor real numa `select` final, ex.: `select tipo from movimentacoes where id = <substituto_mov_id>`). Confirme antes que o ensaio está com as migrations em dia (`list_migrations`). A prova final continua sendo o job `banco` **verde** no GitHub após o push.

## Armadilhas conhecidas (todas já aconteceram)
- **Arquivo errado no SQL Editor** — rodar a migration anterior por engano (F7E: 0033 no lugar da 0034 → nada aplicado, erro `42701` depois). Mitigação: a verificação pós-apply do passo 5.
- **Cache do PostgREST** — sem `notify pgrst`, a API recusa a nova assinatura da RPC. Mitigação: passo 6.
- **Overload de função** — recriar com assinatura diferente (ou pular a ordem das migrations que fazem `drop`+`create`) deixa duas versões coexistindo → PostgREST não resolve a chamada. Mitigação: sempre `create or replace` puro com assinatura idêntica; verificação do passo 5.
- **Ordem migration → deploy** — se a migration muda a assinatura/colunas que o código novo usa, aplicar o SQL ANTES do deploy da Vercel.
- **Roteiro de teste defasado após mudar função/trigger** — a F15 mudou a RPC mas só atualizou o roteiro novo; o roteiro antigo (`manutencao_fornecedor.sql` 4d) ficou exigindo o comportamento velho (`compra`) e derrubou o job `banco` silenciosamente (lint/test/build locais não rodam SQL). Mitigação: a regra "rode TODOS os roteiros" da seção acima.
