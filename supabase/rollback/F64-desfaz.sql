-- =============================================================================
-- F64-desfaz.sql — o ROLLBACK da F64 (docs/PLAN-F64.md §4)
-- =============================================================================
-- Desfaz as três migrations da F64 NA ORDEM INVERSA DO APPLY: 0164 → 0163 → 0162.
--   1. (0164) sai o gatilho `kits_modelos_motivo_da_empresa` e a função `kit_motivo_da_empresa()`;
--      `checagens_integridade_nucleo()` VOLTA ao corpo da 0158 — copiado do arquivo da 0158 byte a
--      byte (as doze peças; a prova é o md5 do `prosrc`, 06359abd286206bde8432609128ebccd nos dois
--      bancos em 23/09/2026), com o `comment on function` dela. `create or replace` preserva dono e
--      ACL (a 0164 não os tocou);
--   2. (0163) `empresa_id` sai de kits_modelos, senhas_acesso, relatorios_gerados, import_logs,
--      eventos_admin;
--   3. (0162) `empresa_id` sai de import_prefixos_patrimonio, import_termos_categoria,
--      import_termos_estado, unidades_apelidos, tipos_item, motivos.
-- Dentro de cada migration, as tabelas saem na MESMA ordem do apply, que é a ordem em que o app
-- toma os locks (PLAN-F64, decisão 1: o vocabulário lido antes de a escrita validar motivo; `eventos_admin`,
-- gravada no fim de cada operação, por último) — tomar na mesma ordem evita o ciclo de espera com
-- uma escrita em curso. Entre as migrations, o inverso (o molde de F63-desfaz.sql).
--
-- `drop column` NÃO reescreve a tabela: a coluna fica no `pg_attribute` com `attisdropped`, e a FK
-- e o comentário caem junto. `if exists` em tudo: serve ao apply parcial (no CI cada comando confirma
-- sozinho) e ao arquivo rodado duas vezes — e ao ensaio EM VAZIO (antes da 0162 existir), que é como o
-- roteiro `f64_rollback.sql` mede a impressão de antes.
--
-- ENTRE FASES: o rollback da F63 (`F63-desfaz.sql`) e o da F62 (`F62-*.sql`) EXIGEM este ANTES — a
-- F62 derruba `empresas` e `empresa_legada()`, e a F64 pendura nelas onze FKs e onze defaults; para
-- a F63 é o inverso do apply entre fases (regra 10 da §4 do PLANO-MULTIEMPRESA). Os roteiros
-- `f63_rollback.sql` e `f62_rollback.sql` rodam este arquivo antes dos deles.
--
-- Sem `begin`/`commit` próprios: quem roda decide a transação (o roteiro
-- `supabase/tests/f64_rollback.sql` roda dentro da dele, e é o ensaio deste arquivo no Postgres do
-- CI; num banco vivo, o `execute_sql` do MCP com o conteúdo EXATO deste arquivo, ou o SQL Editor com
-- `begin; … commit;` em volta). O ledger (`supabase_migrations.schema_migrations`) NÃO é reescrito:
-- a linha das três fica, e a sonda de deriva continua vendo o nome aplicado.
-- =============================================================================

set lock_timeout = '2s';

-- 1. (0164) o gatilho do kit, a função dele, e o núcleo de volta ao da 0158
drop trigger if exists kits_modelos_motivo_da_empresa on public.kits_modelos;
drop function if exists public.kit_motivo_da_empresa();

-- O corpo da 0158, COPIADO do arquivo (supabase/migrations/0158_cargo_em_membros.sql) — não editar à
-- mão: é o que o md5 do `prosrc` confere.
create or replace function public.checagens_integridade_nucleo()
returns table(chave text, total bigint, amostra text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with d as (
    select a.patrimonio || ' / ' || coalesce(a.service_tag, '—') || ' (' || f.nome || ')' as item
      from public.ativos a
      join public.filiais f on f.id = a.filial_id
     where a.patrimonio is not null
     group by a.filial_id, f.nome, a.patrimonio, a.service_tag
    having count(*) > 1
  )
  select 'patrimonio_duplicado'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select a.patrimonio as item from public.ativos a join public.filiais f on f.id = a.filial_id where not f.ativo
  )
  select 'ativo_filial_inativa'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select t.arquivo_path as item from public.termos_gerados t
      left join storage.objects o on o.bucket_id = 'termos' and o.name = t.arquivo_path
     where o.id is null
  )
  select 'termo_sem_arquivo'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select p.id::text as item from public.profiles p left join auth.users u on u.id = p.id
     where u.id is null and p.excluido_em is null
  )
  select 'perfil_sem_conta'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select u.id::text as item from auth.users u left join public.profiles p on p.id = u.id where p.id is null
  )
  select 'conta_sem_perfil'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select pi.id::text as item from public.pendencias_item pi
      join public.movimentacoes m on m.id = pi.movimentacao_id
     where pi.resolvida_em is null
       and exists (select 1 from public.movimentacoes e where e.estorno_de = m.id)
  )
  select 'pendencia_de_estornada'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- F62: o operador ATIVO sem filial é a MEMBERSHIP operadora da empresa legada sem vínculo.
  return query
  with d as (
    select p.id::text as item
      from public.membros m
      join public.profiles p on p.id = m.profile_id
     where m.empresa_id = public.empresa_legada()
       and m.papel = 'operador' and m.ativo and p.excluido_em is null
       and not exists (select 1 from public.operador_filiais v where v.membro_id = m.id)
  )
  select 'operador_sem_filial'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select o.name as item from storage.objects o
     where o.bucket_id = 'termos'
       and not exists (select 1 from public.termos_gerados t where t.arquivo_path = o.name)
  )
  select 'arquivo_termo_orfao'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (select g.rotulo as item from public.v_conflitos_filiais_grupos g)
  select 'conflito_entre_filiais'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  return query
  with d as (
    select coalesce(nullif(btrim(a.patrimonio), ''), nullif(btrim(a.service_tag), ''), a.id::text)
           || ' (' || a.status::text || ')' as item
      from public.ativos a
     where not public.status_tem_detentor(a.status)
       and (a.colaborador_atual is not null or a.setor_atual is not null)
  )
  select 'detentor_em_estado_sem_dono'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- F41 (0127) — a 11ª. A reserva por chamado saiu da tela: só um `liberacao` com
  -- o MESMO chamado a fecha, e nenhuma tela emite isso. Uma reserva aberta aqui
  -- é uma unidade presa sem caminho de volta — a 0127 converteu as 5 que havia, e
  -- esta checagem existe para que não voltem em silêncio.
  return query
  with d as (
    select i.nome || ' · ' || f.nome || ' · chamado ' || l.chamado
           || ' (' || sum(case l.tipo::text when 'reserva'   then l.quantidade
                                            when 'liberacao' then -l.quantidade
                                            else 0 end)::text || ')' as item
      from public.lancamentos_item l
      join public.itens   i on i.id = l.item_id
      join public.filiais f on f.id = l.filial_id
     where l.chamado is not null
     group by i.nome, f.nome, l.chamado
    having sum(case l.tipo::text when 'reserva'   then l.quantidade
                                 when 'liberacao' then -l.quantidade
                                 else 0 end) > 0
  )
  select 'reserva_aberta'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;

  -- ---------------------------------------------------------------------------
  -- 12ª (F54) — BACKUP ÓRFÃO em `backups-import`
  -- ---------------------------------------------------------------------------
  -- Objeto no bucket dos backups que não corresponde a operação nenhuma. Duas
  -- populações caem aqui, e as duas merecem: o backup que subiu para uma operação
  -- que a RPC RECUSOU (a partir da F54 o import descarta o dele sozinho; o reset e
  -- o conflito abaixo do teto não descartam) e o resíduo histórico de antes de a
  -- trilha existir — medidos 10 em produção em 09/09/2026, todos de julho.
  --
  -- ⚠ O PREDICADO NÃO FILTRA POR PREFIXO, e isso é decisão, não descuido. Os 22
  -- objetos que existem hoje estão TODOS na forma histórica `<slug>/<carimbo>.json`;
  -- a forma atual (`import/filial-<id>/…`, F52) ainda não produziu nenhum. Um
  -- predicado que reconhecesse só a forma nova acusaria os 22 de uma vez, e um que
  -- listasse as duas nasceria desatualizado na terceira. A pergunta certa é "alguém
  -- registrou este caminho?", e ela é agnóstica de forma.
  --
  -- ⚠ AS CÓPIAS DE `.docx` (F54) NÃO SÃO ÓRFÃS, e reconhecê-las é a metade difícil.
  -- Elas moram em `<raiz>/termos/<arquivo>`, e a RAIZ é sempre um valor que a própria
  -- operação JÁ gravou, DENTRO da transação dela:
  --   · import, reset e conflito acima do teto → o `backup_path` sem o `.json`;
  --   · apagar ativo                           → `detalhe->>'ativo_id'` (RPC 0082);
  --   · conflito abaixo do teto                → o digest da seleção, recalculado a
  --     partir de `detalhe->'selecionados'` com as funções que a 0100 já criou.
  -- É por isso que a F54 não precisou de evento nem de manifesto novo: não há escrita
  -- posterior que possa falhar em silêncio e transformar cópia legítima em órfã.
  --
  -- ⚠ SÓ `bucket_id` e `name` de `storage.objects`. O `bootstrap-storage.sql` do CI é
  -- o recorte MÍNIMO e NÃO tem a coluna `metadata` — um predicado que a usasse passaria
  -- aqui e morreria no `banco-sem-docker`.
  --
  -- ⚠ `not exists`, nunca `not in`: um NULL no subselect faria o `not in` devolver NULL
  -- para toda linha, a contagem sairia ZERO, e a checagem estaria "verde" por não
  -- enxergar nada. É o modo de falha mais silencioso que uma checagem pode ter.
  return query
  with registrados as (
    select l.backup_path as caminho
      from public.import_logs l
     where l.backup_path is not null
    union
    select e.detalhe->>'backup_path'
      from public.eventos_admin e
     where nullif(e.detalhe->>'backup_path', '') is not null
  ),
  copias as (
    select o.name
      from storage.objects o
     where o.bucket_id = 'backups-import'
       and o.name ~ '/termos/[^/]+$'
       and (
         exists (
           select 1 from registrados r
            where r.caminho = regexp_replace(o.name, '/termos/[^/]+$', '.json')
         )
         or exists (
           select 1 from public.eventos_admin ea
            where ea.acao = 'ativo_apagado'
              and 'ativo/' || (ea.detalhe->>'ativo_id') || '/'
                  = substring(o.name from '^(ativo/[0-9a-fA-F-]{36}/)termos/')
         )
         or exists (
           select 1 from public.eventos_admin ea
            where ea.acao = 'conflito_filiais_resolvido'
              and jsonb_typeof(ea.detalhe->'selecionados') = 'array'
              and public.prefixo_backup_conflito()
                  || public.digest_selecao_conflito(
                       array(select (x->>'ativo_id')::uuid
                               from jsonb_array_elements(ea.detalhe->'selecionados') x)) || '/'
                  = substring(o.name from '^(conflito/[0-9a-f]{32}/)termos/')
         )
       )
  ),
  d as (
    select o.name as item
      from storage.objects o
     where o.bucket_id = 'backups-import'
       and not exists (select 1 from registrados r where r.caminho = o.name)
       and not exists (select 1 from copias c where c.name = o.name)
  )
  select 'backup_orfao'::text, count(*)::bigint,
         coalesce((array_agg(d.item order by d.item))[1:5], array[]::text[]) from d;
end;
$$;

comment on function public.checagens_integridade_nucleo() is
  'F62 (era F55, 0138): o SQL das DOZE checagens de integridade, em UM lugar só. A F62 trocou SÓ a operador_sem_filial, que passou a contar a MEMBERSHIP operadora ativa da empresa legada sem vínculo (profiles.papel/ativo congelaram). Não é alcançável de fora (revoke de public, anon, authenticated e service_role): quem a chama são as duas portas, dev_checagens_integridade() (guarda e_dev) e checagens_integridade_resumo() (guarda papel_atual is not null). SQL FIXO por dentro.';

-- 2. (0163) os registros — na ordem do apply
alter table public.kits_modelos       drop column if exists empresa_id;
alter table public.senhas_acesso      drop column if exists empresa_id;
alter table public.relatorios_gerados drop column if exists empresa_id;
alter table public.import_logs        drop column if exists empresa_id;
alter table public.eventos_admin      drop column if exists empresa_id;

-- 3. (0162) o vocabulário — na ordem do apply
alter table public.import_prefixos_patrimonio drop column if exists empresa_id;
alter table public.import_termos_categoria    drop column if exists empresa_id;
alter table public.import_termos_estado       drop column if exists empresa_id;
alter table public.unidades_apelidos          drop column if exists empresa_id;
alter table public.tipos_item                 drop column if exists empresa_id;
alter table public.motivos                    drop column if exists empresa_id;

reset lock_timeout;
