-- =============================================================================
-- bootstrap-ledger.sql — o schema do ledger de migrations, VAZIO (F46, 06/09/2026)
-- =============================================================================
-- `supabase_migrations.schema_migrations` é a tabela que a CLI e o MCP do Supabase alimentam a
-- cada apply. Este job NÃO a alimenta — ele aplica as migrations por `psql`, e registrar nela
-- criaria um QUARTO esquema de identificação ao lado dos três que já existem (é exatamente o que
-- a ficha da F46 proíbe, e a dívida A continua aberta por causa disso).
--
-- Ela existe aqui, vazia, por um motivo só, e ele é sutil:
--
-- ⚠ `0077_dev_diagnostico.sql:47` faz `select max(version) into v from
--   supabase_migrations.schema_migrations` e trata a falta com:
--
--       exception when undefined_table then return null;
--
--   `undefined_table` é o SQLSTATE **42P01** — "o schema existe, a tabela não". Se o SCHEMA
--   também não existir, o Postgres levanta **3F000 `invalid_schema_name`**, que esse `exception
--   when` NÃO captura: a RPC estoura em vez de devolver NULL.
--
--   O comentário da própria `0077` promete "Devolve NULL se a tabela de controle não existir" —
--   e entrega isso só metade das vezes. É uma divergência real entre o comentário e o corpo,
--   registrada no relatório da F46 e no backlog. **Não é corrigida aqui**: consertá-la seria
--   editar migration aplicada, que é justamente o que esta fase passa a proibir.
--
-- Criar o schema torna o caso inalcançável no CI e reproduz o que o `supabase start` entrega
-- (a CLI cria as duas coisas). Nenhum dos 25 roteiros chama essa RPC — `grep -rn
-- 'ultima_migracao_aplicada\|supabase_migrations' supabase/tests/` devolve zero —, então isto
-- NÃO muda o veredito do critério 5. Entra por fidelidade ao ambiente, não por necessidade.
-- =============================================================================

create schema if not exists supabase_migrations;

-- O formato é o da CLI do Supabase: `version` é o carimbo de tempo de 14 dígitos, e é essa
-- incompatibilidade com o prefixo sequencial dos arquivos (`0127_…`) que é a dívida A.
create table if not exists supabase_migrations.schema_migrations (
  version    text not null primary key,
  statements text[],
  name       text
);
