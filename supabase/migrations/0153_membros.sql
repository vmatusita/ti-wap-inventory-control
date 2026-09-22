-- =============================================================================
-- 0153_membros.sql — F62 (22/09/2026): `membros` — o cargo passa a ser POR EMPRESA
-- =============================================================================
-- classe: ADITIVA (tabela nova + cópia de `profiles` para ela; nenhuma linha existente muda)
--
-- A decisão 6 do §1 do plano: "uma conta, vários vínculos — tabela `membros` com cargo POR
-- EMPRESA". Um consultor admin no cliente A e consulta no cliente B não é representável com
-- o cargo GLOBAL de `profiles.papel`; nesta fase, com uma empresa só e nenhum cliente dentro,
-- a mudança é barata. Esta migration cria a tabela e COPIA o estado de hoje; quem passa a
-- LER dela é a 0158 (a troca), que antes recopia na mesma transação.
--
-- 1. A TABELA (decisão 5 da fase)
--    · `papel public.papel_usuario` — o enum de sempre; NENHUM valor novo (a trava de
--      `migrations-f38.test.ts` recusa `alter type … add value`).
--    · `unique (empresa_id, profile_id)`: uma membership por pessoa por empresa.
--    · `unique (empresa_id, id)`: o alvo da FK COMPOSTA de `operador_filiais` (0156).
--    · índice `(profile_id, empresa_id)`: as funções de conjunto (0157) e a ponte de
--      `papel_atual()` (0158) filtram por `profile_id = auth.uid()` primeiro.
--    · `profile_id … on delete cascade`: `profiles` nunca é apagado (só arquivado — 0073);
--      o cascade espelha `operador_filiais.usuario_id`. Apagar a linha de um dev continua
--      barrado pelas DUAS guardas (a de `profiles` e a daqui).
--    · `empresa_id … references empresas` sem cascade: empresa não some com gente dentro.
--
-- 2. A GUARDA DO DEV EM `membros` (fato 9 da ordem: "a proteção do dev mora só em
--    `profiles`" — e `membros.papel` nasceria sem ela). `membros_guarda_dev` reproduz
--    `profiles_guarda_dev` (0073) com a MESMA janela `estoque.gestao_usuarios`, que só as
--    RPCs de gestão abrem, depois de checar `e_dev()` por dentro: recusa (42501) apagar a
--    membership de um dev, inserir já como dev, mexer em `papel`/`ativo`/`empresa_id`/
--    `profile_id` de uma membership dev e conceder o cargo dev. Trigger, e não policy:
--    o service role ignora policy, trigger ele não ignora.
--
-- 3. A CÓPIA — uma linha por perfil existente (arquivados incluídos), na empresa legada,
--    com `papel` e `ativo` de `profiles`. Dentro de UM bloco `do`, com a janela aberta: no
--    CI cada comando é a sua própria transação, e o `set_config(…, true)` de um comando
--    solto não chegaria ao seguinte.
--
-- 4. A LEITURA: RLS ligada, SEM `force` — e a policy é o espelho EXATO da leitura de
--    `profiles` (`"leitura operador"`, o piso da 0070): o app lê `membros` com a sessão
--    (`getOperador`, a lista de usuários). Sem recursão: `papel_atual()` é `security
--    definer` e o dono não sofre RLS — é o SEGUNDO motivo do "sem `force`" (R-ACC-72).
--    Escrita: nenhuma policy, e os privilégios padrão do projeto hospedado revogados de
--    `anon` (tudo) e `authenticated` (tudo menos SELECT). Quem escreve são as RPCs definer.
--
-- 5. O `handle_new_user` ENTRA AQUI, e não na 0158: toda conta criada DEPOIS desta
--    migration já nasce com a membership `'operador'` ativa na empresa legada (os defaults
--    de sempre). Sem isso, uma conta criada no intervalo entre dois applies ficaria sem
--    membership — e o vínculo dela, na 0156, não teria a que se prender. A trava de
--    domínio de e-mail (0041/0057) continua idêntica.
--
-- ROLLBACK, em prosa (docs/PLAN-F62.md §5.1, passo 7; rodável em
-- supabase/rollback/F62-2-desfaz.sql, bloco 0153): reemitir o `handle_new_user` da 0057,
-- derrubar o gatilho e a função da guarda, e derrubar a tabela `membros` — DEPOIS de a
-- 0156 ter sido desfeita (a FK composta de `operador_filiais` aponta para cá) e SÓ DEPOIS
-- da cópia de volta `membros` → `profiles` (passo 1), que é o que preserva o cargo mudado
-- depois da F62.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) A tabela
-- ---------------------------------------------------------------------------
create table public.membros (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  papel      public.papel_usuario not null default 'operador',
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  constraint membros_empresa_profile_uidx unique (empresa_id, profile_id),
  constraint membros_empresa_id_uidx unique (empresa_id, id)
);

create index membros_profile_idx on public.membros (profile_id, empresa_id);

comment on table public.membros is
  'F62 (0153): a MEMBERSHIP — uma pessoa (profiles) numa empresa (empresas), com o CARGO e o STATUS daquela empresa. Desde a 0158 é daqui que papel_atual(), as funções de conjunto, as RPCs de gestão e o app leem o cargo; profiles.papel/profiles.ativo ficaram CONGELADOS. Protegida por membros_guarda_dev (o dev intocável). INFRA no catálogo.';
comment on column public.membros.papel is
  'F62: o cargo NESTA empresa (dev ⊃ admin ⊃ operador ⊃ consulta). Escrito só por definir_papel_usuario (RPC); a concessão/revogação de dev exige a janela estoque.gestao_usuarios.';
comment on column public.membros.ativo is
  'F62: a membership está ATIVA? false fecha leitura e escrita nesta empresa no request seguinte (papel_atual() devolve NULL). Escrito por definir_status_usuario e apagar_usuario.';

-- ---------------------------------------------------------------------------
-- 2) A guarda do dev
-- ---------------------------------------------------------------------------
create function public.membros_guarda_dev()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oficial boolean := coalesce(current_setting('estoque.gestao_usuarios', true), '') = 'on';
begin
  if v_oficial then
    -- Caminho oficial (as RPCs de gestão, que já checaram e_dev()/e_admin() por dentro).
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'DELETE' then
    if old.papel = 'dev' then
      raise exception 'Só um desenvolvedor pode apagar a membership de um desenvolvedor.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.papel = 'dev' then
      raise exception 'Só um desenvolvedor pode conceder o cargo Desenvolvedor.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE de uma membership dev: nada que decida acesso muda por fora do caminho oficial.
  if old.papel = 'dev'
     and (new.papel      is distinct from old.papel
       or new.ativo      is distinct from old.ativo
       or new.empresa_id is distinct from old.empresa_id
       or new.profile_id is distinct from old.profile_id) then
    raise exception 'Este usuário é um desenvolvedor: só outro desenvolvedor pode alterar o cargo, desativar ou apagar esta conta.'
      using errcode = '42501';
  end if;

  if new.papel = 'dev' and old.papel is distinct from new.papel then
    raise exception 'Só um desenvolvedor pode conceder o cargo Desenvolvedor.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.membros_guarda_dev() is
  'F62 (0153): a REDE FINAL do cargo dev em membros — o espelho de profiles_guarda_dev (0073). Recusa, para QUALQUER caminho que não seja o oficial (inclusive o service role, que ignora RLS), apagar a membership de um dev, inserir já como dev, mudar papel/ativo/empresa_id/profile_id de uma membership dev e conceder o cargo dev. O caminho oficial são as RPCs de gestão, que abrem estoque.gestao_usuarios LOCAL à transação depois de checar e_dev().';

revoke all on function public.membros_guarda_dev() from public, anon, authenticated, service_role;

create trigger membros_guarda_dev
  before insert or update or delete on public.membros
  for each row execute function public.membros_guarda_dev();

comment on trigger membros_guarda_dev on public.membros is
  'F62: ver public.membros_guarda_dev(). BEFORE para recusar antes de escrever; FOR EACH ROW porque a decisão é por linha.';

-- ---------------------------------------------------------------------------
-- 3) A cópia — um bloco só, com a janela (os devs também entram)
-- ---------------------------------------------------------------------------
do $copia$
begin
  perform set_config('estoque.gestao_usuarios', 'on', true);
  insert into public.membros (empresa_id, profile_id, papel, ativo, created_at)
  select public.empresa_legada(), p.id, p.papel, p.ativo, p.created_at
    from public.profiles p;
  perform set_config('estoque.gestao_usuarios', 'off', true);
end
$copia$;

-- ---------------------------------------------------------------------------
-- 4) RLS: a leitura espelha a de profiles; a escrita é só das RPCs
-- ---------------------------------------------------------------------------
alter table public.membros enable row level security;

create policy "leitura operador" on public.membros
  for select to authenticated
  using ((select public.papel_atual()) is not null);

revoke all on table public.membros from anon;
revoke insert, update, delete, truncate, references, trigger on table public.membros from authenticated;

-- ---------------------------------------------------------------------------
-- 5) handle_new_user: a conta nova nasce com a membership na empresa legada
-- ---------------------------------------------------------------------------
-- O corpo é o da 0057, byte a byte, mais o insert em `membros` (os defaults: operador, ativa).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null
     or not (
          new.email ilike '%@wap.ind.br'
       or new.email ilike '%@stefanini.com'
       or new.email ilike '%@latam.stefanini.com'
     )
  then
    raise exception 'Login restrito a contas @wap.ind.br, @stefanini.com ou @latam.stefanini.com';
  end if;
  insert into public.profiles (id, primeiro_nome, sobrenome)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''), new.email),
    nullif(btrim(new.raw_user_meta_data ->> 'sobrenome'), '')
  );
  -- F62: a membership na empresa legada, com os defaults de sempre (operador, ativa).
  insert into public.membros (empresa_id, profile_id)
  values (public.empresa_legada(), new.id);
  return new;
end;
$$;

-- ---------- VERIFICAÇÃO PÓS-APPLY (consultas de leitura, só contagens) ----------
--   select (select count(*) from public.profiles) as perfis,
--          (select count(*) from public.membros) as membros,
--          (select count(*) from public.profiles p
--             left join public.membros m on m.profile_id = p.id and m.empresa_id = public.empresa_legada()
--            where m.id is null or m.papel <> p.papel or m.ativo <> p.ativo) as divergentes;
--   esperado: perfis = membros (16 em produção, 5 no ensaio) · divergentes = 0.
--   select tgname, tgenabled from pg_trigger where tgrelid = 'public.membros'::regclass and not tgisinternal;
--   esperado: membros_guarda_dev · O.
