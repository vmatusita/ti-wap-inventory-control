-- =============================================================================
-- 0156_vinculo_por_membership.sql — F62 (22/09/2026): o vínculo de escrita passa a ser da MEMBERSHIP
-- =============================================================================
-- classe: ADITIVA (duas colunas novas preenchidas a partir das existentes; `operador_filiais`
--         não é acervo — o valor anterior das colunas novas é NULL, não há o que guardar)
--
-- A ficha F62: "o vínculo de escrita deixa de ser por pessoa e passa a ser por
-- membership". Uma pessoa operadora na empresa A e admin na B tem vínculos de filial só
-- como operadora de A — o vínculo pertence à membership, não à conta.
--
-- 1. AS COLUNAS: `empresa_id` e `membro_id`, preenchidas a partir de `usuario_id` e da
--    empresa da filial — TODOS os vínculos, inclusive os 18 INERTES de produção (de pessoas
--    que hoje não são operadoras: ficaram de uma troca de cargo; o banco os ignora, a tela os
--    mostra, e apagá-los é decisão de quem gere, não desta migration). A conferência logo
--    depois ABORTA a migration se sobrar vínculo sem membership.
--
-- 2. A CHAVE: a PK passa a `(empresa_id, membro_id, filial_id)` (a da ficha). A PK antiga
--    `(usuario_id, filial_id)` vira UNIQUE com o nome `operador_filiais_usuario_filial_uidx`
--    — o `on conflict (usuario_id, filial_id)` de quem ainda o use continua válido (fato 7:
--    `0074:270`; a RPC nova da 0158 usa a PK nova). O par continua único por construção: a
--    filial é de UMA empresa, e a pessoa tem UMA membership por empresa.
--
-- 3. AS FKs COMPOSTAS — o banco recusa o vínculo cruzado mesmo sem RLS:
--    · `(empresa_id, membro_id) → membros (empresa_id, id) on delete cascade` — a membership
--      de OUTRA empresa não serve;
--    · `(empresa_id, filial_id) → filiais (empresa_id, id)` — a filial de OUTRA empresa não
--      serve (o unique alvo nasceu na 0155).
--    A FK simples `usuario_id → profiles` e a `filial_id → filiais` ficam.
--
-- 4. O BANCO DERIVA A MEMBERSHIP (decisão 6 da fase) — gatilho
--    `operador_filiais_deriva_membership`, BEFORE INSERT/UPDATE: quem informa só
--    `(usuario_id, filial_id)` — a RPC antiga no intervalo entre dois applies, os roteiros, o
--    seed — ganha `empresa_id` da filial e `membro_id` da membership daquela pessoa naquela
--    empresa; quem informa `membro_id` ganha o `usuario_id`. Os dois informados e
--    divergentes → 23503; pessoa sem membership na empresa da filial → 23503 com mensagem
--    própria. O que a FK composta decide, o gatilho não decide: `empresa_id` informado à mão
--    passa direto para as FKs, que são a autoridade.
--
-- 5. O QUE NÃO MUDA: `usuario_id` fica (o TypeScript lê por ele; tirá-lo é da F69), a policy
--    "leitura operador" fica byte a byte, os grants ficam, e a tabela continua INFRA.
--
-- ROLLBACK, em prosa (docs/PLAN-F62.md §5.1, passo 4; rodável em
-- supabase/rollback/F62-2-desfaz.sql, bloco 0156): derrubar o gatilho e a função, as duas
-- FKs compostas e a PK nova; recriar a PK `(usuario_id, filial_id)` no lugar do unique; e
-- derrubar as duas colunas. Os vínculos criados depois da F62 sobrevivem (têm `usuario_id`).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) As colunas, preenchidas
-- ---------------------------------------------------------------------------
alter table public.operador_filiais
  add column empresa_id uuid,
  add column membro_id  uuid;

update public.operador_filiais o
   set empresa_id = f.empresa_id,
       membro_id  = m.id
  from public.filiais f
  join public.membros m on m.empresa_id = f.empresa_id
 where f.id = o.filial_id
   and m.profile_id = o.usuario_id;

do $confere$
declare
  v_sem bigint;
begin
  select count(*) into v_sem
    from public.operador_filiais
   where empresa_id is null or membro_id is null;
  if v_sem > 0 then
    raise exception 'F62/0156: % vínculo(s) de operador_filiais sem membership na empresa da filial — a cópia da 0153 não cobriu todo perfil. Nada foi aplicado.', v_sem;
  end if;
end
$confere$;

alter table public.operador_filiais
  alter column empresa_id set not null,
  alter column membro_id  set not null;

-- ---------------------------------------------------------------------------
-- 2) A chave nova, e a velha como unique
-- ---------------------------------------------------------------------------
alter table public.operador_filiais drop constraint operador_filiais_pkey;
alter table public.operador_filiais
  add constraint operador_filiais_pkey primary key (empresa_id, membro_id, filial_id);
alter table public.operador_filiais
  add constraint operador_filiais_usuario_filial_uidx unique (usuario_id, filial_id);

-- ---------------------------------------------------------------------------
-- 3) As FKs compostas
-- ---------------------------------------------------------------------------
alter table public.operador_filiais
  add constraint operador_filiais_membro_fk
    foreign key (empresa_id, membro_id) references public.membros (empresa_id, id) on delete cascade;
alter table public.operador_filiais
  add constraint operador_filiais_filial_da_empresa_fk
    foreign key (empresa_id, filial_id) references public.filiais (empresa_id, id);

-- ---------------------------------------------------------------------------
-- 4) O banco deriva a membership
-- ---------------------------------------------------------------------------
create function public.operador_filiais_deriva_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil uuid;
begin
  if new.empresa_id is null then
    select f.empresa_id into new.empresa_id from public.filiais f where f.id = new.filial_id;
  end if;

  if new.membro_id is null then
    select m.id into new.membro_id
      from public.membros m
     where m.profile_id = new.usuario_id
       and m.empresa_id = new.empresa_id;
    if new.membro_id is null then
      raise exception 'Esta pessoa não é membro da empresa desta filial — o vínculo de escrita é da membership.'
        using errcode = '23503';
    end if;
  end if;

  select m.profile_id into v_perfil from public.membros m where m.id = new.membro_id;
  if new.usuario_id is null then
    new.usuario_id := v_perfil;
  elsif v_perfil is distinct from new.usuario_id then
    raise exception 'O vínculo aponta para uma pessoa diferente da dona da membership.'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

comment on function public.operador_filiais_deriva_membership() is
  'F62 (0156): deriva a membership do vínculo de escrita. Quem informa só (usuario_id, filial_id) ganha empresa_id da filial e membro_id da membership daquela pessoa naquela empresa; quem informa membro_id ganha usuario_id. Divergentes ou sem membership → 23503. As FKs compostas (membro e filial da MESMA empresa) são a autoridade; o gatilho só preenche.';

revoke all on function public.operador_filiais_deriva_membership() from public, anon, authenticated, service_role;

create trigger operador_filiais_deriva_membership
  before insert or update on public.operador_filiais
  for each row execute function public.operador_filiais_deriva_membership();

comment on column public.operador_filiais.empresa_id is
  'F62 (0156): a empresa do vínculo — a mesma da filial e da membership (duas FKs compostas).';
comment on column public.operador_filiais.membro_id is
  'F62 (0156): a MEMBERSHIP que escreve nesta filial. O vínculo é da membership, não da conta; usuario_id fica como espelho (o TS lê por ele) até a F69.';

-- ---------- VERIFICAÇÃO PÓS-APPLY (só contagens) ----------
--   select count(*) as vinculos,
--          count(*) filter (where empresa_id = public.empresa_legada()) as da_wap,
--          count(*) filter (where not exists (select 1 from public.membros m
--                                              where m.id = o.membro_id and m.profile_id = o.usuario_id)) as incoerentes
--     from public.operador_filiais o;
--   esperado: vinculos = da_wap (25 em produção, 5 no ensaio) · incoerentes = 0.
--   select conname from pg_constraint where conrelid = 'public.operador_filiais'::regclass order by 1;
--   esperado: inclui operador_filiais_pkey, operador_filiais_usuario_filial_uidx,
--             operador_filiais_membro_fk, operador_filiais_filial_da_empresa_fk.
