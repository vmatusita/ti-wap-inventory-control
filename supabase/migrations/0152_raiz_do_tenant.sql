-- =============================================================================
-- 0152_raiz_do_tenant.sql — F62 (22/09/2026): a RAIZ do tenant — `empresas` e a empresa legada
-- =============================================================================
-- classe: ADITIVA
--
-- A primeira migration da virada multiempresa (docs/PLANO-MULTIEMPRESA.md §7 → F62;
-- ordem: docs/prompts/F62-raiz-do-tenant-e-cargo-por-empresa-ultracode.md; plano:
-- docs/PLAN-F62.md). Cria a tabela que é a RAIZ de tudo o que a virada recorta, e a
-- linha da WAP — o tenant nº 1, no MESMO banco de produção (decisão 3 do §1 do plano).
-- Nada no app lê isto nesta fase.
--
-- 1. `public.empresa_legada()` — A FONTE ÚNICA (decisão 3 da fase)
--    "Qual é a empresa dos cadastros de hoje?" tem UMA resposta em SQL: esta função.
--    Quem pergunta: o default de `filiais.empresa_id` (0155), o `handle_new_user` (0153)
--    e a PONTE de `papel_atual()` e das leitoras/escritoras do cargo (0158). A F67/F69
--    trocam um lugar só. Devolve um uuid FIXO, o mesmo nos dois bancos — sem isso a
--    sonda de paridade ensaio × produção veria o default de `filiais` divergir. O
--    TypeScript tem o espelho em `src/lib/auth/empresa-legada.ts`, amarrado a este
--    literal por teste de mesa.
--    `stable` e SEM parâmetro: é o que deixa o `add column … default` da 0155 preencher
--    sem reescrever tupla (o PG 11+ só faz isso com default não-volátil). `invoker`: ela
--    não lê nada. O EXECUTE vai explícito para `authenticated` e `service_role` porque o
--    default de `filiais` é avaliado com o privilégio de QUEM insere (o "Nova filial").
--
-- 2. `public.empresas` — as colunas (decisões 1 e 2 da fase)
--    · `slug`: CHECK de formato e CHECK de RESERVADOS com a lista FECHADA = os segmentos
--      de topo de `src/app/**` (admin, ajuda, api, ativos, auth, dev, itens, login,
--      movimentacoes, pendencias, relatorios, versoes) ∪ a lista da ficha F62 (app, geral,
--      plataforma, r, www…) ∪ o valor de URL `todas` (`?filial=todas`). A trava que a
--      mantém igual às rotas: src/lib/validators/empresas-slug.test.ts.
--    · `nome` é o de EXIBIÇÃO; `razao_social`/`cnpj` são outra coisa (o termo diz a razão
--      social, o sistema diz WAP) e nascem NULOS na WAP — os termos continuam com o texto
--      fixo do modelo (decisão 7 do §1); esta fase não grava dado cadastral.
--    · A MÁSCARA vira dado só pela metade que a medição sustenta: `patrimonio_digitos`.
--      O prefixo NÃO é um par único (a WAP tem 7 prefixos oficiais em
--      `import_prefixos_patrimonio`, que ganha `empresa_id` na F64), e a validação segue
--      monopólio do TS (`src/lib/patrimonio.ts`).
--    · `cor_acento` com CHECK hex; `config jsonb` com CHECK de OBJETO — sem ele
--      `'"texto"'::jsonb` e `'[]'::jsonb` entram e quebram todo consumidor.
--    · FICAM FORA: `logo` (arquivo + UI, F70), `cidade` (F70/F71) e `ativo` (sem
--      consumidor, uma empresa "desativada" e ainda acessível seria armadilha — entra na
--      fase que define o que isso quer dizer).
--
-- 3. RLS ligada, SEM `force` (R-ACC-29/R-ACC-72), e ZERO policy: nenhuma tela lê esta
--    tabela nesta fase (catálogo: `k_sem_select`, classe INFRA). Os privilégios padrão do
--    projeto hospedado dariam TUDO a `anon` e `authenticated` — revogados aqui.
--
-- Nenhum dado existente é tocado; uma linha nova (a WAP). Caminho A do RUNBOOK-BANCO.
--
-- ROLLBACK, em prosa (pseudo-SQL de função em comentário vira definição para
-- scripts/db/corpo-vigente.mjs): é o ÚLTIMO passo da ordem de rollback da F62
-- (docs/PLAN-F62.md §5.1; rodável em supabase/rollback/F62-2-desfaz.sql, bloco 0152) —
-- derrubar a tabela `empresas` e depois a função `empresa_legada()`, só DEPOIS de a 0155
-- ter sido desfeita (o default de `filiais` a usa).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) A fonte única
-- ---------------------------------------------------------------------------
create function public.empresa_legada()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select '00000000-0000-4000-a000-000000000001'::uuid
$$;

comment on function public.empresa_legada() is
  'F62 (0152): o id da EMPRESA LEGADA — a WAP, o tenant nº 1, dona de todo cadastro anterior à virada. Fonte ÚNICA: o default de filiais.empresa_id (até a F64), o handle_new_user e a ponte de papel_atual() perguntam aqui. A F67/F69 trocam um lugar só. Espelho TS: src/lib/auth/empresa-legada.ts (amarrado por teste).';

revoke execute on function public.empresa_legada() from public, anon;
grant execute on function public.empresa_legada() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) A raiz
-- ---------------------------------------------------------------------------
create table public.empresas (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null,
  nome               text not null,
  razao_social       text,
  cnpj               text,
  patrimonio_digitos smallint not null default 7,
  cor_acento         text,
  config             jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  constraint empresas_slug_uidx unique (slug),
  constraint empresas_slug_formato check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 40
  ),
  constraint empresas_slug_reservado check (
    slug <> all (array[
      'admin', 'ajuda', 'api', 'app', 'ativos', 'auth', 'dev', 'geral', 'itens', 'login',
      'movimentacoes', 'pendencias', 'plataforma', 'r', 'relatorios', 'todas', 'versoes', 'www'
    ]::text[])
  ),
  constraint empresas_nome_tamanho check (char_length(btrim(nome)) between 1 and 80),
  constraint empresas_razao_social_tamanho check (
    razao_social is null or char_length(btrim(razao_social)) between 1 and 200
  ),
  constraint empresas_cnpj_formato check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  constraint empresas_patrimonio_digitos_faixa check (patrimonio_digitos between 1 and 12),
  constraint empresas_cor_acento_hex check (cor_acento is null or cor_acento ~ '^#[0-9a-fA-F]{6}$'),
  constraint empresas_config_objeto check (jsonb_typeof(config) = 'object')
);

comment on table public.empresas is
  'F62 (0152): a RAIZ do tenant — uma linha por empresa-cliente. A WAP é a empresa legada (public.empresa_legada()). RLS ligada, SEM force e SEM policy (ninguém lê pela sessão nesta fase; as funções de conjunto e as definer leem como o dono). INFRA no catálogo.';
comment on column public.empresas.slug is
  'F62: identificador de URL da empresa. CHECK de formato (minúsculas, dígitos e hífen, 2 a 40) e de RESERVADOS — a lista fechada é os segmentos de topo de src/app/** + a da ficha F62 + o valor de URL "todas"; src/lib/validators/empresas-slug.test.ts reprova segmento de topo novo não reservado.';
comment on column public.empresas.nome is
  'F62: nome de EXIBIÇÃO ("WAP"). Não é a razão social.';
comment on column public.empresas.razao_social is
  'F62: razão social do documento (o termo). NULA na WAP nesta fase: os termos continuam com o texto fixo do modelo (decisão 7 do §1 do plano).';
comment on column public.empresas.cnpj is
  'F62: CNPJ só com os 14 dígitos. NULO na WAP nesta fase (mesmo motivo de razao_social).';
comment on column public.empresas.patrimonio_digitos is
  'F62: quantos dígitos seguem o prefixo do patrimônio (7 na WAP). O PREFIXO não mora aqui — são vários por empresa (import_prefixos_patrimonio, F64) — e a validação continua no TS (src/lib/patrimonio.ts).';
comment on column public.empresas.cor_acento is
  'F62: cor de destaque da empresa, #RRGGBB (a da WAP é o --brand-amarelo de globals.css).';
comment on column public.empresas.config is
  'F62: configuração leve da empresa. CHECK de OBJETO: escalar e array são recusados, para nenhum consumidor quebrar em ''"texto"''::jsonb.';

-- A WAP — o tenant nº 1.
insert into public.empresas (id, slug, nome, cor_acento)
values (public.empresa_legada(), 'wap', 'WAP', '#eda100');

-- ---------------------------------------------------------------------------
-- 3) RLS e privilégios
-- ---------------------------------------------------------------------------
alter table public.empresas enable row level security;
revoke all on table public.empresas from anon, authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY (consultas de leitura) ----------
--   select count(*) as n, count(*) filter (where id = public.empresa_legada() and slug = 'wap') as wap
--     from public.empresas;
--   esperado: n = 1 · wap = 1.
--   select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.empresas'::regclass;
--   esperado: t · f.
--   select has_table_privilege('authenticated', 'public.empresas', 'select'),
--          has_table_privilege('anon', 'public.empresas', 'select');
--   esperado: f · f.
--   select p.provolatile, p.prosecdef, p.proconfig,
--          has_function_privilege('anon', p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth
--     from pg_proc p where p.oid = 'public.empresa_legada()'::regprocedure;
--   esperado: s · f · {search_path=""} · anon = f · auth = t.
