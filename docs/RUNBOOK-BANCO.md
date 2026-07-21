# Runbook — operações de banco (Supabase)

Procedimento único para aplicar migrations e mudanças de banco neste projeto. Nasceu do item **A** do plano de dívida técnica (`docs/DIVIDA-TECNICA.md`) para tirar da cabeça o que hoje é conhecimento tribal (o "gate", o apply manual, as armadilhas).

## Topologia

| Papel | Projeto Supabase (ref) | Uso |
|---|---|---|
| **Produção** | `pbtjcalbmepmrqzprusb` | dados reais da WAP (go-live 15/07/2026) |
| **Ensaio** | `sgmvldiizsrjbxzzpmhh` | rehearsal — a Supabase CLI local está linkada a ESTE |

Operações de banco são feitas **via MCP Supabase** (o ambiente não tem CLI local apontando para produção). O `supabase/schema.sql` é histórico (banner no topo) — a verdade são as migrations em `supabase/migrations/`.

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

## Divergência do ledger (estado em 21/07/2026)

`list_migrations` de produção mostra `0001`–`0030` + `rate_limit_senha` (0025) + `0038`. **Faltam no ledger** (aplicadas à mão pelo gate, mas os objetos EXISTEM em produção — `import_logs`, a RPC de 4 args etc.):

- **0031, 0032, 0033, 0034, 0035, 0036, 0037** — as migrations do import de startup (F7…F8).
- `0029` **não existe** (gap real na numeração; nunca foi criada).
- `0039` (drop dos backups) e `0040` (hardening das RPCs) — pendentes de apply pelo Johnny.

### Reconciliação (opcional — decisão do Johnny)
Registrar no ledger as migrations já aplicadas, para o histórico bater com produção. **Metadados apenas** (não recria nada — só insere linhas). Rodar no SQL Editor de produção:

```sql
-- Registra 0031–0037 como já aplicadas (idempotente por 'on conflict').
-- version = prefixo do nome do arquivo (mesmo padrão das 0001–0007 no ledger).
insert into supabase_migrations.schema_migrations (version, name)
values
  ('0031','import_logs'),
  ('0032','import_rpcs'),
  ('0033','import_correcoes'),
  ('0034','import_melhorias'),
  ('0035','import_compra_data_real_no_relatorio'),
  ('0036','reverter_compra_abertura_baseline'),
  ('0037','import_patrimonio_forcado')
on conflict (version) do nothing;
```
Conferir antes: `select version, name from supabase_migrations.schema_migrations order by version;`. Reversível (`delete` das mesmas `version`). Como o apply de produção é manual (gate), esta reconciliação é para **fidelidade do histórico**, não muda o funcionamento.

## Armadilhas conhecidas (todas já aconteceram)
- **Arquivo errado no SQL Editor** — rodar a migration anterior por engano (F7E: 0033 no lugar da 0034 → nada aplicado, erro `42701` depois). Mitigação: a verificação pós-apply do passo 5.
- **Cache do PostgREST** — sem `notify pgrst`, a API recusa a nova assinatura da RPC. Mitigação: passo 6.
- **Overload de função** — recriar com assinatura diferente (ou pular a ordem das migrations que fazem `drop`+`create`) deixa duas versões coexistindo → PostgREST não resolve a chamada. Mitigação: sempre `create or replace` puro com assinatura idêntica; verificação do passo 5.
- **Ordem migration → deploy** — se a migration muda a assinatura/colunas que o código novo usa, aplicar o SQL ANTES do deploy da Vercel.
