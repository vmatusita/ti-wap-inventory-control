-- Migration 0128 — a tabela de backup órfã entra no versionamento (F47).
--
-- ESTRUTURA + RLS. Não apaga, não atualiza e não lê uma única linha: os 2 snapshots
-- do go-live que ela guarda continuam exatamente onde estão.
--
-- ---------------------------------------------------------------------------
-- O PROBLEMA — a tabela que existe só de um lado
-- ---------------------------------------------------------------------------
-- `public._bkp_relatorios_gerados_f6a` nasceu em 16/07/2026, na F6A, de um
-- `create table … as select` feito à mão no SQL Editor: dois snapshots congelados de
-- `relatorios_gerados` do dia do go-live, guardados antes de um scrub. Ela NUNCA
-- teve migration. As duas que passaram perto a deixaram de pé de propósito, e
-- escreveram por quê:
--
--   0039: "NÃO removida aqui (de propósito): `_bkp_relatorios_gerados_f6a`
--          (2 snapshots de go-live) — está atrelada a uma DECISÃO EM ABERTO do
--          Johnny sobre os 2 snapshots congelados da carga."
--   0058: "Quando ele decidir, ela ganha a própria migration de DROP."
--
-- Consequência de estar fora do versionamento, e é ela que esta fase tropeça:
-- o banco do CI é construído A PARTIR das migrations, então lá a tabela não existe.
-- Produção tem 21 tabelas em `public`; o CI tem 20. O `src/lib/types/database.ts`
-- (gerado de PRODUÇÃO, linha 17) a conhece; o banco do CI, não.
--
-- Isso derrubaria as duas entregas desta fase se ela ficasse como está:
--   · `supabase/tests/seguranca_catalogo.sql` perde a isenção `left(relname,1) <> '_'`
--     nesta mesma fase. Sem a tabela existir no CI a asserção 2 passa; em produção
--     ela acusaria a `_bkp_` — verde num banco, vermelho no outro.
--   · o gate de deriva compara o banco do CI com o `database.ts`. A assimetria
--     "o arquivo tem MAIS que o banco" é legítima e o gate a tolera, mas tolerar uma
--     divergência CONHECIDA e evitável é acostumar o olho a ela.
--
-- ---------------------------------------------------------------------------
-- A FORMA — espelho do `create table as select`, não de `relatorios_gerados`
-- ---------------------------------------------------------------------------
-- `create table … as select` copia TIPO e nome de coluna, e não copia constraint
-- nenhuma: sem chave primária, sem chave estrangeira, sem `not null`, sem default.
-- É por isso que as 8 colunas abaixo são todas anuláveis, ao contrário das de
-- `relatorios_gerados` (0010), de onde os TIPOS vêm:
--
--   id uuid · periodo_de date · periodo_ate date · filial_id smallint ·
--   versao smallint · dados jsonb · gerado_por uuid · gerado_em timestamptz
--
-- Conferido contra `src/lib/types/database.ts` linhas 17-49, que é gerado de
-- produção: 8 colunas, todas `| null` em Row, todas opcionais em Insert/Update,
-- `Relationships: []`. São 8 e não 9 porque a `observacao` só chegou a
-- `relatorios_gerados` na 0030, DEPOIS de o backup ser tirado.
--
-- ⚠ NÃO se recria a PK nem a FK. Elas não existem em produção, e criá-las aqui faria
-- o CI divergir de produção na direção contrária — que é o defeito que esta migration
-- veio corrigir, de cabeça para baixo.
--
-- ---------------------------------------------------------------------------
-- POR QUE ESTA MIGRATION É IDEMPOTENTE, e as outras 127 não são
-- ---------------------------------------------------------------------------
-- O `RUNBOOK-BANCO.md` registra, com razão, que as migrations deste repositório NÃO
-- são idempotentes por desenho — elas foram escritas para rodar UMA vez, e a
-- impressão digital do schema (`supabase/ci/impressao-schema.sql`) prova
-- determinismo em vez de idempotência justamente por isso.
--
-- Esta é a exceção, e a exceção tem motivo: ela aplica sobre DOIS estados iniciais
-- diferentes, e isso é o serviço dela, não um descuido.
--   · no CI e no ensaio a tabela NÃO existe → `if not exists` a cria;
--   · em produção ela existe desde 16/07 → `if not exists` é no-op de estrutura.
-- `enable row level security` é seguro de repetir (o Postgres não erra ao religar).
-- O `drop policy if exists` antes do `create policy` fecha o único ponto que
-- derrubaria o apply: as atas (F19, F22, e a Decisão 5) dizem que a tabela está com
-- RLS ligada e ZERO policy em produção, mas `create policy` não é idempotente e
-- ninguém confere o catálogo de produção antes de um apply. A forma existe no
-- repositório desde a 0012 e a 0059 — não é invenção desta fase.
--
-- ---------------------------------------------------------------------------
-- REVERSÃO (a ordem inversa do apply)
-- ---------------------------------------------------------------------------
--   drop policy if exists "dev le backup f6a" on public._bkp_relatorios_gerados_f6a;
--   alter table public._bkp_relatorios_gerados_f6a disable row level security;
-- ⚠ NUNCA `drop table`. Apagar a tabela apagaria os 2 snapshots que a decisão em
-- aberto do Johnny protege — e a decisão continua em aberto: esta migration ADOTA,
-- não resolve. Quando ele decidir, o DROP é migration própria, como a 0058 escreveu.

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
  'F6A (16/07/2026): backup em banco dos 2 snapshots de relatorios_gerados do dia do go-live. Retida por decisão EM ABERTO do Johnny (docs/DECISOES.md · F6A) — não apagar sem essa decisão fechar. Adotada no versionamento pela F47 (0128) para que o banco do CI tenha o mesmo universo de objetos que produção; em produção ela já existia, com RLS ligada desde a criação.';

alter table public._bkp_relatorios_gerados_f6a enable row level security;

-- Leitura só do DESENVOLVEDOR. É arquivo morto de diagnóstico, não cadastro: quem
-- olha um backup de go-live de dois meses atrás está na área /dev, não em /admin.
-- `(select …)` envolvendo a função é o padrão InitPlan que a 0059/0065 já usam — o
-- planejador avalia uma vez por consulta em vez de uma vez por linha.
-- ESCRITA: nenhuma policy, de propósito. A tabela é histórico congelado; ninguém
-- grava nela nunca mais, e a ausência de policy é deny-all para todo mundo que não
-- ignore RLS.
drop policy if exists "dev le backup f6a" on public._bkp_relatorios_gerados_f6a;
create policy "dev le backup f6a" on public._bkp_relatorios_gerados_f6a
  for select to authenticated
  using ((select public.e_dev()));

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) a tabela existe, com as 8 colunas anuláveis e nenhuma constraint:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = '_bkp_relatorios_gerados_f6a'
--    order by ordinal_position;
--   -- esperado: 8 linhas, is_nullable = YES em todas
--
--   -- 2) RLS ligada e EXATAMENTE uma policy:
--   select relrowsecurity from pg_class
--    where oid = 'public._bkp_relatorios_gerados_f6a'::regclass;
--   -- esperado: true
--   select policyname, cmd, roles::text from pg_policies
--    where schemaname = 'public' and tablename = '_bkp_relatorios_gerados_f6a';
--   -- esperado: 1 linha — "dev le backup f6a" · SELECT · {authenticated}
--
--   -- 3) OS SNAPSHOTS CONTINUAM LÁ (é a asserção que importa em produção):
--   select count(*) from public._bkp_relatorios_gerados_f6a;
--   -- esperado: 2 em PRODUÇÃO · 0 no CI e no ensaio (a tabela nasce vazia lá)
