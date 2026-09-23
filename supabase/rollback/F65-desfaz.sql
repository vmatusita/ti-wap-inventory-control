-- =============================================================================
-- F65-desfaz.sql — o ROLLBACK da F65 (docs/PLAN-F65.md §4)
-- =============================================================================
-- Desfaz as dez migrations da F65 NA ORDEM INVERSA DO APPLY: 0174 → 0173 → 0172 → 0171 → 0170 → 0169 → 0168 → 0167 →
-- 0166 → 0165.
--   1. (0174) se `colaboradores_nome_chave_uidx` é o POR EMPRESA (o passo pós-deploy foi aplicado): ele volta a ser o
--      provisório `colaboradores_nome_chave_uidx_f65`, e o global `(nome_chave)` é recriado com o nome contratual;
--   2. (0173) saem o gatilho `termos_gerados_ids_da_empresa` e `termo_da_empresa()`, os 20 gatilhos `*_guarda_empresa` e
--      `guarda_empresa()`; `vocabulario_unidades_guarda()` VOLTA ao corpo da 0139 — copiado do arquivo da 0139 byte a
--      byte (a prova é o md5 do `prosrc`, 91e80d533d72191325e614d24e15a881 nos dois bancos em 23/09/2026), com o
--      `comment on function` dela. `create or replace` preserva dono e ACL;
--   3. (0172) sai o provisório `colaboradores_nome_chave_uidx_f65` (se sobrou);
--   4. (0171) o índice do snapshot volta à forma da 0013 `(periodo_de, periodo_ate, coalesce(filial_id, -1), versao)`;
--   5. (0170) os seis uniques voltam à forma global, com os MESMOS nomes (constraint continua constraint, índice continua
--      índice), e os dois `comment on index` voltam ao texto da 0139 e da 0125;
--   6. (0169) as três PKs e os dois parciais do import voltam à forma global;
--   7. (0168) o trio de `motivos` na ordem INVERSA: a FK composta sai, a PK volta a `(codigo)`, a FK simples volta;
--   8. (0167, 0166) as 22 FKs voltam a SIMPLES, com os MESMOS nomes e ações — `pendencias_item_movimentacao_id_fkey`
--      volta `deferrable initially deferred`;
--   9. (0165) saem os sete `unique (empresa_id, id)` dos pais.
-- Dentro de cada migration, as tabelas saem na MESMA ordem do apply, que é a ordem em que o app toma os locks; entre as
-- migrations, o inverso (o molde de F64-desfaz.sql).
--
-- IDEMPOTENTE EM QUALQUER ESTADO: cada passo confere a FORMA no catálogo antes de agir (onde o nome é o mesmo antes e
-- depois, um `do` com `pg_get_indexdef`/`conkey`; o resto, `if exists`). Serve ao apply PARCIAL (produção parada entre
-- duas migrations, ou antes do passo pós-deploy), ao arquivo rodado duas vezes — e ao ensaio EM VAZIO (antes da 0165
-- existir), que é como o roteiro `f65_rollback.sql` mede a impressão de antes. Nenhum passo reescreve tupla: `drop`/`add
-- constraint` e índices só varrem.
--
-- ENTRE FASES: o rollback da F64, o da F63 e o da F62 EXIGEM este ANTES — o `drop column empresa_id` deles falha com os
-- gatilhos `UPDATE OF empresa_id` e as FKs compostas dependendo da coluna (e o da F62 derruba `empresas`). Os roteiros
-- `f64_rollback.sql`, `f63_rollback.sql` e `f62_rollback.sql` rodam este arquivo antes dos deles. DEPOIS DA F73 (duas
-- empresas com dado), este rollback exige que o dado da segunda empresa já tenha saído: os uniques e as PKs globais não
-- voltam com duas empresas repetindo uma chave.
--
-- Sem `begin`/`commit` próprios: quem roda decide a transação (o roteiro `supabase/tests/f65_rollback.sql` roda dentro
-- da dele, e é o ensaio deste arquivo no Postgres do CI; num banco vivo, o `execute_sql` do MCP com o conteúdo EXATO
-- deste arquivo). O ledger (`supabase_migrations.schema_migrations`) NÃO é reescrito: a linha das dez fica, e a sonda de
-- deriva continua vendo os nomes aplicados.
-- =============================================================================

set lock_timeout = '2s';

-- 1. (0174) o unique do colaborador de volta ao global, se o passo pós-deploy foi aplicado
do $$
begin
  if exists (select 1 from pg_index i
              where i.indexrelid = to_regclass('public.colaboradores_nome_chave_uidx')
                and pg_get_indexdef(i.indexrelid) ~ '\(empresa_id, nome_chave\)') then
    alter index public.colaboradores_nome_chave_uidx rename to colaboradores_nome_chave_uidx_f65;
    create unique index colaboradores_nome_chave_uidx on public.colaboradores (nome_chave);
  end if;
end $$;

-- 2. (0173) os gatilhos da fase saem; a diagonal volta ao corpo da 0139
drop trigger if exists termos_gerados_ids_da_empresa on public.termos_gerados;
drop function if exists public.termo_da_empresa();

drop trigger if exists ativos_guarda_empresa on public.ativos;
drop trigger if exists movimentacoes_guarda_empresa on public.movimentacoes;
drop trigger if exists pendencias_item_guarda_empresa on public.pendencias_item;
drop trigger if exists lancamentos_item_guarda_empresa on public.lancamentos_item;
drop trigger if exists anotacoes_guarda_empresa on public.anotacoes;
drop trigger if exists termos_gerados_guarda_empresa on public.termos_gerados;
drop trigger if exists colaboradores_guarda_empresa on public.colaboradores;
drop trigger if exists itens_guarda_empresa on public.itens;
drop trigger if exists filiais_guarda_empresa on public.filiais;
drop trigger if exists tipos_item_guarda_empresa on public.tipos_item;
drop trigger if exists motivos_guarda_empresa on public.motivos;
drop trigger if exists kits_modelos_guarda_empresa on public.kits_modelos;
drop trigger if exists unidades_apelidos_guarda_empresa on public.unidades_apelidos;
drop trigger if exists import_prefixos_patrimonio_guarda_empresa on public.import_prefixos_patrimonio;
drop trigger if exists import_termos_categoria_guarda_empresa on public.import_termos_categoria;
drop trigger if exists import_termos_estado_guarda_empresa on public.import_termos_estado;
drop trigger if exists relatorios_gerados_guarda_empresa on public.relatorios_gerados;
drop trigger if exists import_logs_guarda_empresa on public.import_logs;
drop trigger if exists senhas_acesso_guarda_empresa on public.senhas_acesso;
drop trigger if exists eventos_admin_guarda_empresa on public.eventos_admin;
drop function if exists public.guarda_empresa();

-- O corpo da 0139, BYTE A BYTE (copiado do arquivo; md5 do prosrc 91e80d533d72191325e614d24e15a881).
create or replace function public.vocabulario_unidades_guarda()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_chave text;
  v_outra record;
begin
  -- Serializa renomear filial × cadastrar apelido concorrentes: os dois índices
  -- únicos acima (nome×nome, apelido×apelido) não cobrem a DIAGONAL nome×apelido —
  -- sem este lock, duas transações concorrentes passariam as duas pela checagem
  -- abaixo antes de qualquer commit, e o conjunto ficaria ambíguo mesmo assim.
  perform pg_advisory_xact_lock(hashtext('vocabulario_unidades_guarda'));

  if tg_table_name = 'unidades_apelidos' then
    -- `apelido_chave` é `generated always as (...) stored`: dentro de um gatilho
    -- BEFORE ela ainda não foi computada (doc. Postgres, ddl-generated-columns —
    -- "it is not allowed to access generated columns in BEFORE triggers"). A chave
    -- tem de vir da coluna BASE, no mesmo molde do branch `filiais` logo abaixo.
    v_chave := public.vocabulario_chave(new.apelido);

    -- o nome PRÓPRIO da filial dona: "o nome próprio já vale", apelido é redundante.
    if exists (
      select 1 from public.filiais f
       where f.id = new.filial_id and public.vocabulario_chave(f.nome) = v_chave
    ) then
      raise exception 'O termo "%" já é o próprio nome da filial — o nome próprio sempre vale na coluna Site, não precisa de apelido.', new.apelido
        using errcode = 'P0001';
    end if;

    -- o nome de QUALQUER OUTRA filial (ativa ou não — toda filial é unidade conhecida).
    select f.nome into v_outra
      from public.filiais f
     where public.vocabulario_chave(f.nome) = v_chave and f.id <> new.filial_id
     limit 1;
    if found then
      raise exception 'O termo "%" já é o nome da filial "%" — apelido não pode repetir o nome de outra filial.', new.apelido, v_outra.nome
        using errcode = 'P0001';
    end if;

    -- apelido × apelido (mesma filial ou outra) É o índice único
    -- (unidades_apelidos_apelido_chave_uidx, 23505) — de propósito FORA desta
    -- guarda (PLAN-F56.md, Decisão 2: "apelido × apelido: índice único..."). A
    -- guarda cobre só a DIAGONAL nome×apelido, que nenhum índice cobre sozinho.

  elsif tg_table_name = 'filiais' then
    if tg_op = 'UPDATE' and public.vocabulario_chave(old.nome) = public.vocabulario_chave(new.nome) then
      return new; -- a chave não mudou (só caixa/acento) — nada a conferir.
    end if;
    v_chave := public.vocabulario_chave(new.nome);

    select ua.apelido, ua.filial_id into v_outra
      from public.unidades_apelidos ua
     where ua.apelido_chave = v_chave
     limit 1;
    if found then
      if v_outra.filial_id = new.id then
        raise exception 'O nome "%" já é apelido desta própria filial — remova o apelido antes de usá-lo como nome.', new.nome
          using errcode = 'P0001';
      else
        raise exception 'O nome "%" já é apelido de outra filial — escolha outro nome.', new.nome
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.vocabulario_unidades_guarda() is
  'F56 · Decisão 2 — a diagonal nome×apelido que os índices únicos não cobrem. Gatilho, não API: revoke all na função abaixo. Serializa com pg_advisory_xact_lock antes de conferir.';

-- 3. (0172) o provisório do colaborador sai
drop index if exists public.colaboradores_nome_chave_uidx_f65;

-- 4. (0171) o índice do snapshot de volta à forma da 0013
do $$
begin
  if exists (select 1 from pg_index i
              where i.indexrelid = to_regclass('public.relatorios_gerados_periodo_filial_versao_uidx')
                and pg_get_indexdef(i.indexrelid) ~ '\(empresa_id, ') then
    create unique index relatorios_gerados_periodo_filial_versao_uidx_f65
      on public.relatorios_gerados (periodo_de, periodo_ate, coalesce(filial_id, -1), versao);
    drop index public.relatorios_gerados_periodo_filial_versao_uidx;
    alter index public.relatorios_gerados_periodo_filial_versao_uidx_f65
      rename to relatorios_gerados_periodo_filial_versao_uidx;
  end if;
end $$;

-- 5. (0170) os seis uniques de volta à forma global, com os MESMOS nomes
do $$
begin
  if exists (select 1 from pg_constraint k
              where k.conrelid = 'public.filiais'::regclass and k.conname = 'filiais_slug_key' and cardinality(k.conkey) > 1) then
    alter table public.filiais add constraint filiais_slug_key_f65 unique (slug);
    alter table public.filiais drop constraint filiais_slug_key;
    alter table public.filiais rename constraint filiais_slug_key_f65 to filiais_slug_key;
  end if;

  if exists (select 1 from pg_index i
              where i.indexrelid = to_regclass('public.filiais_nome_chave_uidx')
                and pg_get_indexdef(i.indexrelid) ~ '\(empresa_id, ') then
    create unique index filiais_nome_chave_uidx_f65 on public.filiais (public.vocabulario_chave(nome));
    drop index public.filiais_nome_chave_uidx;
    alter index public.filiais_nome_chave_uidx_f65 rename to filiais_nome_chave_uidx;
    comment on index public.filiais_nome_chave_uidx is
      'F56 · Decisão 2 — duas filiais não podem ter o mesmo nome normalizado. A diagonal nome×apelido é o gatilho vocabulario_unidades_guarda, não este índice.';
  end if;

  if exists (select 1 from pg_constraint k
              where k.conrelid = 'public.tipos_item'::regclass and k.conname = 'tipos_item_slug_key' and cardinality(k.conkey) > 1) then
    alter table public.tipos_item add constraint tipos_item_slug_key_f65 unique (slug);
    alter table public.tipos_item drop constraint tipos_item_slug_key;
    alter table public.tipos_item rename constraint tipos_item_slug_key_f65 to tipos_item_slug_key;
  end if;

  if exists (select 1 from pg_index i
              where i.indexrelid = to_regclass('public.itens_nome_chave_uidx')
                and pg_get_indexdef(i.indexrelid) ~ '\(empresa_id, ') then
    create unique index itens_nome_chave_uidx_f65 on public.itens (nome_chave);
    drop index public.itens_nome_chave_uidx;
    alter index public.itens_nome_chave_uidx_f65 rename to itens_nome_chave_uidx;
    comment on index public.itens_nome_chave_uidx is
      'F41 (0125): deduplicação do catálogo de itens pela chave normalizada. Espelho do colaboradores_nome_chave_uidx (0112). Conferido em produção antes de criar: os 22 itens de então não colidiam.';
  end if;

  if exists (select 1 from pg_index i
              where i.indexrelid = to_regclass('public.kits_modelos_nome_uidx')
                and pg_get_indexdef(i.indexrelid) ~ '\(empresa_id, ') then
    create unique index kits_modelos_nome_uidx_f65 on public.kits_modelos ((lower(nome)));
    drop index public.kits_modelos_nome_uidx;
    alter index public.kits_modelos_nome_uidx_f65 rename to kits_modelos_nome_uidx;
  end if;

  if exists (select 1 from pg_index i
              where i.indexrelid = to_regclass('public.unidades_apelidos_apelido_chave_uidx')
                and pg_get_indexdef(i.indexrelid) ~ '\(empresa_id, ') then
    create unique index unidades_apelidos_apelido_chave_uidx_f65 on public.unidades_apelidos (apelido_chave);
    drop index public.unidades_apelidos_apelido_chave_uidx;
    alter index public.unidades_apelidos_apelido_chave_uidx_f65 rename to unidades_apelidos_apelido_chave_uidx;
  end if;
end $$;

-- 6. (0169) as chaves do import de volta à forma global
do $$
begin
  if (select cardinality(k.conkey) from pg_constraint k
       where k.conrelid = 'public.import_prefixos_patrimonio'::regclass and k.conname = 'import_prefixos_patrimonio_pkey') > 1 then
    alter table public.import_prefixos_patrimonio
      drop constraint import_prefixos_patrimonio_pkey,
      add constraint import_prefixos_patrimonio_pkey primary key (prefixo);
  end if;

  if (select cardinality(k.conkey) from pg_constraint k
       where k.conrelid = 'public.import_termos_categoria'::regclass and k.conname = 'import_termos_categoria_pkey') > 1 then
    alter table public.import_termos_categoria
      drop constraint import_termos_categoria_pkey,
      add constraint import_termos_categoria_pkey primary key (termo);
  end if;
  if exists (select 1 from pg_index i
              where i.indexrelid = to_regclass('public.import_termos_categoria_categoria_rotulo_uidx')
                and pg_get_indexdef(i.indexrelid) ~ '\(empresa_id, ') then
    create unique index import_termos_categoria_categoria_rotulo_uidx_f65
      on public.import_termos_categoria (categoria) where rotulo is not null;
    drop index public.import_termos_categoria_categoria_rotulo_uidx;
    alter index public.import_termos_categoria_categoria_rotulo_uidx_f65
      rename to import_termos_categoria_categoria_rotulo_uidx;
  end if;

  if (select cardinality(k.conkey) from pg_constraint k
       where k.conrelid = 'public.import_termos_estado'::regclass and k.conname = 'import_termos_estado_pkey') > 1 then
    alter table public.import_termos_estado
      drop constraint import_termos_estado_pkey,
      add constraint import_termos_estado_pkey primary key (termo);
  end if;
  if exists (select 1 from pg_index i
              where i.indexrelid = to_regclass('public.import_termos_estado_estado_rotulo_uidx')
                and pg_get_indexdef(i.indexrelid) ~ '\(empresa_id, ') then
    create unique index import_termos_estado_estado_rotulo_uidx_f65
      on public.import_termos_estado (estado) where rotulo is not null;
    drop index public.import_termos_estado_estado_rotulo_uidx;
    alter index public.import_termos_estado_estado_rotulo_uidx_f65
      rename to import_termos_estado_estado_rotulo_uidx;
  end if;
end $$;

-- 7. (0168) o trio de motivos, na ordem inversa
do $$
begin
  if (select cardinality(k.conkey) from pg_constraint k
       where k.conrelid = 'public.motivos'::regclass and k.conname = 'motivos_pkey') > 1 then
    alter table public.movimentacoes
      drop constraint movimentacoes_motivo_fkey;
    alter table public.motivos
      drop constraint motivos_pkey,
      add constraint motivos_pkey primary key (codigo);
    alter table public.movimentacoes
      add constraint movimentacoes_motivo_fkey
        foreign key (motivo) references public.motivos (codigo);
  end if;
end $$;

-- 8. (0167, 0166) as FKs de volta a SIMPLES, com os mesmos nomes e ações — primeiro a 0167, depois a 0166
do $$
begin
  if (select cardinality(k.conkey) from pg_constraint k
       where k.conrelid = 'public.colaboradores'::regclass and k.conname = 'colaboradores_filial_id_fkey') > 1 then
    alter table public.colaboradores
      drop constraint colaboradores_filial_id_fkey,
      add constraint colaboradores_filial_id_fkey foreign key (filial_id) references public.filiais (id);
  end if;
  if (select cardinality(k.conkey) from pg_constraint k
       where k.conrelid = 'public.itens'::regclass and k.conname = 'itens_tipo_id_fkey') > 1 then
    alter table public.itens
      drop constraint itens_tipo_id_fkey,
      add constraint itens_tipo_id_fkey foreign key (tipo_id) references public.tipos_item (id);
  end if;
  if (select cardinality(k.conkey) from pg_constraint k
       where k.conrelid = 'public.unidades_apelidos'::regclass and k.conname = 'unidades_apelidos_filial_id_fkey') > 1 then
    alter table public.unidades_apelidos
      drop constraint unidades_apelidos_filial_id_fkey,
      add constraint unidades_apelidos_filial_id_fkey foreign key (filial_id) references public.filiais (id);
  end if;
  if (select cardinality(k.conkey) from pg_constraint k
       where k.conrelid = 'public.import_logs'::regclass and k.conname = 'import_logs_filial_id_fkey') > 1 then
    alter table public.import_logs
      drop constraint import_logs_filial_id_fkey,
      add constraint import_logs_filial_id_fkey foreign key (filial_id) references public.filiais (id);
  end if;
  if (select cardinality(k.conkey) from pg_constraint k
       where k.conrelid = 'public.relatorios_gerados'::regclass and k.conname = 'relatorios_gerados_filial_id_fkey') > 1 then
    alter table public.relatorios_gerados
      drop constraint relatorios_gerados_filial_id_fkey,
      add constraint relatorios_gerados_filial_id_fkey foreign key (filial_id) references public.filiais (id);
  end if;

  if (select cardinality(k.conkey) from pg_constraint k
       where k.conrelid = 'public.ativos'::regclass and k.conname = 'ativos_filial_id_fkey') > 1 then
    alter table public.ativos
      drop constraint ativos_filial_id_fkey,
      add constraint ativos_filial_id_fkey foreign key (filial_id) references public.filiais (id),
      drop constraint ativos_substitui_ativo_id_fkey,
      add constraint ativos_substitui_ativo_id_fkey foreign key (substitui_ativo_id) references public.ativos (id);
  end if;
  if (select cardinality(k.conkey) from pg_constraint k
       where k.conrelid = 'public.movimentacoes'::regclass and k.conname = 'movimentacoes_ativo_id_fkey') > 1 then
    alter table public.movimentacoes
      drop constraint movimentacoes_ativo_id_fkey,
      add constraint movimentacoes_ativo_id_fkey foreign key (ativo_id) references public.ativos (id),
      drop constraint movimentacoes_colaborador_id_fkey,
      add constraint movimentacoes_colaborador_id_fkey foreign key (colaborador_id) references public.colaboradores (id),
      drop constraint movimentacoes_estorno_de_fkey,
      add constraint movimentacoes_estorno_de_fkey foreign key (estorno_de) references public.movimentacoes (id),
      drop constraint movimentacoes_filial_id_fkey,
      add constraint movimentacoes_filial_id_fkey foreign key (filial_id) references public.filiais (id),
      drop constraint movimentacoes_filial_destino_id_fkey,
      add constraint movimentacoes_filial_destino_id_fkey foreign key (filial_destino_id) references public.filiais (id);
  end if;
  if (select cardinality(k.conkey) from pg_constraint k
       where k.conrelid = 'public.pendencias_item'::regclass and k.conname = 'pendencias_item_ativo_id_fkey') > 1 then
    alter table public.pendencias_item
      drop constraint pendencias_item_ativo_id_fkey,
      add constraint pendencias_item_ativo_id_fkey foreign key (ativo_id) references public.ativos (id),
      drop constraint pendencias_item_filial_id_fkey,
      add constraint pendencias_item_filial_id_fkey foreign key (filial_id) references public.filiais (id),
      drop constraint pendencias_item_movimentacao_id_fkey,
      add constraint pendencias_item_movimentacao_id_fkey foreign key (movimentacao_id) references public.movimentacoes (id)
        deferrable initially deferred;
  end if;
  if (select cardinality(k.conkey) from pg_constraint k
       where k.conrelid = 'public.lancamentos_item'::regclass and k.conname = 'lancamentos_item_colaborador_id_fkey') > 1 then
    alter table public.lancamentos_item
      drop constraint lancamentos_item_colaborador_id_fkey,
      add constraint lancamentos_item_colaborador_id_fkey foreign key (colaborador_id) references public.colaboradores (id),
      drop constraint lancamentos_item_estorna_id_fkey,
      add constraint lancamentos_item_estorna_id_fkey foreign key (estorna_id) references public.lancamentos_item (id),
      drop constraint lancamentos_item_filial_id_fkey,
      add constraint lancamentos_item_filial_id_fkey foreign key (filial_id) references public.filiais (id),
      drop constraint lancamentos_item_item_id_fkey,
      add constraint lancamentos_item_item_id_fkey foreign key (item_id) references public.itens (id),
      drop constraint lancamentos_item_movimentacao_id_fkey,
      add constraint lancamentos_item_movimentacao_id_fkey foreign key (movimentacao_id) references public.movimentacoes (id),
      drop constraint lancamentos_item_pendencia_item_id_fkey,
      add constraint lancamentos_item_pendencia_item_id_fkey foreign key (pendencia_item_id) references public.pendencias_item (id);
  end if;
  if (select cardinality(k.conkey) from pg_constraint k
       where k.conrelid = 'public.anotacoes'::regclass and k.conname = 'anotacoes_ativo_id_fkey') > 1 then
    alter table public.anotacoes
      drop constraint anotacoes_ativo_id_fkey,
      add constraint anotacoes_ativo_id_fkey foreign key (ativo_id) references public.ativos (id);
  end if;
end $$;

-- 9. (0165) os sete unique (empresa_id, id) dos pais
alter table public.ativos           drop constraint if exists ativos_empresa_id_uidx;
alter table public.movimentacoes    drop constraint if exists movimentacoes_empresa_id_uidx;
alter table public.pendencias_item  drop constraint if exists pendencias_item_empresa_id_uidx;
alter table public.lancamentos_item drop constraint if exists lancamentos_item_empresa_id_uidx;
alter table public.colaboradores    drop constraint if exists colaboradores_empresa_id_uidx;
alter table public.itens            drop constraint if exists itens_empresa_id_uidx;
alter table public.tipos_item       drop constraint if exists tipos_item_empresa_id_uidx;

reset lock_timeout;
