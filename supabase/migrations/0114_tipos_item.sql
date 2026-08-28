-- Migration 0114 — o que é o item: a lista fechada de tipos (F37, frente B · decisão D7).
--
-- ADITIVA. Uma tabela nova, sete linhas de seed e uma coluna anulável em `itens`.
-- Nenhuma função, nenhum trigger e nenhuma policy existente é recriada.
--
-- ---------------------------------------------------------------------------
-- POR QUE OS SLUGS SÃO EXATAMENTE ESTES SETE
-- ---------------------------------------------------------------------------
-- Não é conveniência: `movimentacoes.itens_faltantes` (text[], 0003) e
-- `pendencias_item.item` (text, 0050) guardam ESSES MESMOS LITERAIS no histórico,
-- sem FK e sem CHECK — a sincronia com `ACESSORIOS_DEVOLUCAO` (src/lib/dominio.ts)
-- é hoje só convenção de aplicação. Mantendo os slugs, todo registro antigo continua
-- resolvendo o rótulo, e a F39 pode tirar a constante do código sem quebrar uma
-- linha de histórico.
--
-- Medição em produção no dia desta migration: o histórico real usa três deles
-- (`cabo`, `carregador`, `mochila`) nas duas colunas; os outros quatro existem só no
-- código, à espera do primeiro uso. Os sete entram porque os sete são o vocabulário
-- do checklist — semear só os três criaria um catálogo que a tela de devolução
-- imediatamente contradiz.
--
-- SLUG GRAVADO NUNCA MUDA. Rótulo muda; slug, não. É essa promessa que deixa o
-- histórico legível para sempre.
--
-- ---------------------------------------------------------------------------
-- A ÚNICA MUDANÇA DE RÓTULO: `fone` → "Fone de ouvido"
-- ---------------------------------------------------------------------------
-- Muda o que as pendências antigas EXIBEM, não o que guardam. `ACESSORIO_ROTULO.fone`
-- em src/lib/dominio.ts muda junto, no mesmo commit, porque enquanto o vocabulário
-- morar nos dois lugares tela e banco não podem discordar — e há uma guarda TS↔SQL
-- (`src/lib/validators/tipos-item-sql.test.ts`) que derruba o `npm run test` se um
-- lado andar sem o outro.
--
-- ---------------------------------------------------------------------------
-- itens.tipo_id NASCE NULO, E ASSIM PODE FICAR
-- ---------------------------------------------------------------------------
-- O catálogo atual (18 itens em produção) não tem tipo e ninguém vai parar a
-- operação para preencher. `admin/itens` ganha a coluna com um selo discreto nos sem
-- tipo. Nenhuma coluna existente é convertida: `itens_faltantes` e
-- `pendencias_item.item` continuam texto livre, sem FK — converter qualquer uma
-- delas seria alteração de coluna existente, e esta fase é aditiva.
--
-- ACESSO: catálogo de administração, exatamente como `itens`/`motivos`/`filiais` —
-- leitura pelo piso (`papel_atual() is not null`, doutrina 0070), escrita por
-- `e_admin()` (= admin OU dev desde a 0072). Sem policy de DELETE: tipo usado por
-- item ou citado no histórico não se apaga — desativa-se (`ativo = false`).
-- GRANTS explícitos pelo mesmo motivo da 0112 (precedente 0103 / job `banco` do CI).
--
-- ROLLBACK LÓGICO: `alter table public.itens drop column tipo_id; drop table public.tipos_item;`
-- — aditiva, nenhum dado do acervo se perde.
-- ===========================================================================

create table public.tipos_item (
  id         smallint generated always as identity primary key,
  slug       text        not null unique,
  rotulo     text        not null,
  ativo      boolean     not null default true,
  ordem      int         not null default 0,
  created_at timestamptz not null default now(),
  constraint tipos_item_slug_formato check (slug ~ '^[a-z][a-z0-9_]{1,29}$'),
  constraint tipos_item_rotulo_nao_vazio check (btrim(rotulo) <> '')
);

comment on table public.tipos_item is
  'Lista fechada de tipos de item (F37 · D7), gerida em /admin/tipos-item. O SLUG é o que o histórico já guarda em movimentacoes.itens_faltantes e pendencias_item.item — slug gravado NUNCA muda; rótulo pode. Tipo não se apaga: desativa-se.';
comment on column public.tipos_item.slug is
  'Código estável, minúsculo, sem acento. Espelhado em ACESSORIOS_DEVOLUCAO (src/lib/dominio.ts) com guarda TS↔SQL — os dois lados são o mesmo conjunto ou o npm run test cai.';
comment on column public.tipos_item.ordem is
  'Ordem de exibição. O seed usa múltiplos de 10 para caber tipo novo entre dois existentes sem renumerar tudo.';

-- O seed: os SETE slugs de ACESSORIOS_DEVOLUCAO, na mesma ordem da constante.
insert into public.tipos_item (slug, rotulo, ordem) values
  ('carregador', 'Carregador',     10),
  ('mochila',    'Mochila',        20),
  ('mouse',      'Mouse',          30),
  ('teclado',    'Teclado',        40),
  ('mousepad',   'Mousepad',       50),
  ('fone',       'Fone de ouvido', 60),
  ('cabo',       'Cabo',           70);

alter table public.itens
  add column tipo_id smallint references public.tipos_item (id);

comment on column public.itens.tipo_id is
  'Tipo do item (F37 · D7), ANULÁVEL de propósito: o catálogo existente nasce sem tipo e ninguém é obrigado a preencher. A F39 usa o tipo para dizer no termo "um carregador" em vez de "Fone WAAW 10 Energy" (D8); item sem tipo simplesmente não entra por nome.';

-- SEM ÍNDICE em `itens.tipo_id`, pela mesma régua da 0113: `itens` é tabela
-- PRÉ-EXISTENTE, nenhuma consulta desta fase filtra por `tipo_id` (a tela cruza os
-- tipos em memória, com 18 itens no catálogo real) e a fase é proibida de otimizar.
-- Quando houver consulta que o justifique, ele entra — medido.

alter table public.tipos_item enable row level security;

create policy "leitura operador" on public.tipos_item
  for select to authenticated
  using ((select public.papel_atual()) is not null);

create policy "admin insere tipo" on public.tipos_item
  for insert to authenticated
  with check ((select public.e_admin()));

create policy "admin atualiza tipo" on public.tipos_item
  for update to authenticated
  using ((select public.e_admin()))
  with check ((select public.e_admin()));

-- Sem policy de DELETE: tipo citado no histórico não se apaga.
grant select, insert, update on table public.tipos_item to authenticated;

-- ===== SMOKE (rodar depois de aplicar — só leitura) =====
--   select slug, rotulo, ordem from public.tipos_item order by ordem;
--   -- esperado 7: carregador/Carregador · mochila/Mochila · mouse/Mouse · teclado/Teclado
--   --             · mousepad/Mousepad · fone/"Fone de ouvido" · cabo/Cabo
--   select count(*) as itens_sem_tipo from public.itens where tipo_id is null;  -- esperado: todos
--   select relrowsecurity from pg_class where oid='public.tipos_item'::regclass; -- true
--   select policyname, cmd from pg_policies
--    where schemaname='public' and tablename='tipos_item' order by 1;            -- 3 linhas
--   -- todo slug do histórico tem tipo correspondente (a razão de ser do seed):
--   select distinct f.slug from (
--     select unnest(itens_faltantes) as slug from public.movimentacoes
--     union select item from public.pendencias_item) f
--   where not exists (select 1 from public.tipos_item t where t.slug = f.slug);
--   -- esperado: 0 linhas
