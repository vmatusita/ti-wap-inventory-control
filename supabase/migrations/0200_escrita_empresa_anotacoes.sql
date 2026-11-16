-- =====================================================================================================================
-- 0200_escrita_empresa_anotacoes.sql — F67C (16/11/2026): o fim do default — EXPANSÃO, lote 1: as cinco que anotam na ficha do ativo
-- =====================================================================================================================
-- classe: ADITIVA (create or replace de função com a MESMA assinatura — nenhum dado, nenhuma policy)
--
-- A F67C faz toda escrita dizer a empresa (a expansão) e só depois tira o default public.empresa_legada() das 20 colunas
-- empresa_id (a contração, 0205–0207, aplicada em produção só depois do deploy e da janela — docs/PLAN-F67C.md §6).
-- Aqui, as cinco que anotam na ficha do ativo: cada INSERT ganha empresa_id na lista de colunas, com a empresa da FILIAL que a própria linha
-- grava, lida pela ponte única public.empresa_da_filial(smallint) (0185) — a anotação, a da filial do ativo; o substituto
-- da devolução, a da filial do ativo antigo. Nenhuma função passa a LER empresa_id: a coluna só aparece
-- na lista de colunas do INSERT (decisão 2 do PLAN-F67C). As FKs compostas (0166/0167) conferem a coerência com cada outro
-- pai (ativo, movimentação, item, colaborador, pendência). Com uma empresa só, a linha nasce exatamente como hoje (a WAP).
--
-- Assinatura e ACL: create or replace com a MESMA assinatura preserva dono, grants e dependências (doc PG 17); nenhuma
-- precisa de janela (pg_stat_statements.track = top: o INSERT de dentro da função não é forma de topo — fato 14).
--
-- DIFF CONTRA O CORPO VIGENTE (gerado; só a coluna, o valor e a leitura do pai):
--
--   corrigir_patrimonio_com_anotacao(uuid, text, text, boolean, text) — vigente em 0149_escrita_atomica_ativos_anotacao.sql:
--     @@
--      
--     -  insert into public.anotacoes (ativo_id, texto, criado_por)
--     -  values (p_ativo_id, p_texto_anotacao, auth.uid());
--     +  insert into public.anotacoes (empresa_id, ativo_id, texto, criado_por)
--     +  values (public.empresa_da_filial((select a.filial_id from public.ativos a where a.id = p_ativo_id)), p_ativo_id, p_texto_anotacao, auth.uid());
--      end;
--
--   definir_service_tag_com_anotacao(uuid, text, text, boolean, text) — vigente em 0151_escrita_atomica_reconfere_no_banco.sql:
--     @@
--      
--     -  insert into public.anotacoes (ativo_id, texto, criado_por)
--     -  values (p_ativo_id, p_texto_anotacao, auth.uid());
--     +  insert into public.anotacoes (empresa_id, ativo_id, texto, criado_por)
--     +  values (public.empresa_da_filial((select a.filial_id from public.ativos a where a.id = p_ativo_id)), p_ativo_id, p_texto_anotacao, auth.uid());
--      end;
--
--   confirmar_assinatura_termo_com_anotacao(uuid, date, text) — vigente em 0151_escrita_atomica_reconfere_no_banco.sql:
--     @@
--      
--     -  insert into public.anotacoes (ativo_id, texto, criado_por)
--     -  values (p_ativo_id, p_texto_anotacao, auth.uid());
--     +  insert into public.anotacoes (empresa_id, ativo_id, texto, criado_por)
--     +  values (public.empresa_da_filial((select a.filial_id from public.ativos a where a.id = p_ativo_id)), p_ativo_id, p_texto_anotacao, auth.uid());
--      end;
--
--   desfazer_confirmacao_termo_com_anotacao(uuid, public.termo_status, text) — vigente em 0151_escrita_atomica_reconfere_no_banco.sql:
--     @@
--      
--     -  insert into public.anotacoes (ativo_id, texto, criado_por)
--     -  values (p_ativo_id, p_texto_anotacao, auth.uid());
--     +  insert into public.anotacoes (empresa_id, ativo_id, texto, criado_por)
--     +  values (public.empresa_da_filial((select a.filial_id from public.ativos a where a.id = p_ativo_id)), p_ativo_id, p_texto_anotacao, auth.uid());
--      end;
--
--   confirmar_assinatura_lote_com_anotacoes(uuid[], date, text) — vigente em 0151_escrita_atomica_reconfere_no_banco.sql:
--     @@
--             and a.termo_assinado is distinct from 'sim'
--     -    returning a.id
--     +    returning a.id, a.filial_id
--        ),
--     @@
--          -- (42702). O alias `anot` desambigua para a COLUNA.
--     -    insert into public.anotacoes as anot (ativo_id, texto, criado_por)
--     -    select id, p_texto_anotacao, auth.uid() from atualizado
--     +    insert into public.anotacoes as anot (empresa_id, ativo_id, texto, criado_por)
--     +    select public.empresa_da_filial(atualizado.filial_id), id, p_texto_anotacao, auth.uid() from atualizado
--          returning anot.ativo_id
-- =====================================================================================================================

set lock_timeout = '2s';

create or replace function public.corrigir_patrimonio_com_anotacao(
  p_ativo_id uuid,
  p_patrimonio text,
  p_pendencia text,
  p_alterar_pendencia boolean,
  p_texto_anotacao text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n int;
begin
  update public.ativos
     set patrimonio = p_patrimonio,
         pendencia  = case when p_alterar_pendencia then nullif(p_pendencia, '') else pendencia end
   where id = p_ativo_id;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Ativo não encontrado, ou fora do seu vínculo de escrita — nada foi corrigido.'
      using errcode = 'P0002';
  end if;

  insert into public.anotacoes (empresa_id, ativo_id, texto, criado_por)
  values (public.empresa_da_filial((select a.filial_id from public.ativos a where a.id = p_ativo_id)), p_ativo_id, p_texto_anotacao, auth.uid());
end;
$$;

create or replace function public.definir_service_tag_com_anotacao(
  p_ativo_id uuid,
  p_service_tag text,
  p_pendencia text,
  p_alterar_pendencia boolean,
  p_texto_anotacao text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n int;
  v_filial smallint;
begin
  update public.ativos
     set service_tag = p_service_tag,
         pendencia   = case when p_alterar_pendencia then nullif(p_pendencia, '') else pendencia end
   where id = p_ativo_id
     and coalesce(btrim(service_tag), '') = '';

  get diagnostics v_n = row_count;
  if v_n = 0 then
    select a.filial_id into v_filial from public.ativos a where a.id = p_ativo_id;
    if not found or not public.pode_escrever_filial(v_filial) then
      raise exception 'Ativo não encontrado, ou fora do seu vínculo de escrita — nada foi definido.'
        using errcode = 'P0002';
    end if;
    raise exception 'A service tag deste ativo acabou de ser definida — nada foi gravado.'
      using errcode = 'P0001';
  end if;

  insert into public.anotacoes (empresa_id, ativo_id, texto, criado_por)
  values (public.empresa_da_filial((select a.filial_id from public.ativos a where a.id = p_ativo_id)), p_ativo_id, p_texto_anotacao, auth.uid());
end;
$$;

create or replace function public.confirmar_assinatura_termo_com_anotacao(
  p_ativo_id uuid,
  p_data date,
  p_texto_anotacao text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n int;
  v_filial smallint;
begin
  update public.ativos
     set termo_assinado = 'sim',
         termo_data = p_data
   where id = p_ativo_id
     and termo_assinado is distinct from 'sim';

  get diagnostics v_n = row_count;
  if v_n = 0 then
    select a.filial_id into v_filial from public.ativos a where a.id = p_ativo_id;
    if not found or not public.pode_escrever_filial(v_filial) then
      raise exception 'Ativo não encontrado, ou fora do seu vínculo de escrita — nada foi confirmado.'
        using errcode = 'P0002';
    end if;
    raise exception 'Este termo acabou de ser confirmado como assinado — nada foi gravado de novo.'
      using errcode = 'P0001';
  end if;

  insert into public.anotacoes (empresa_id, ativo_id, texto, criado_por)
  values (public.empresa_da_filial((select a.filial_id from public.ativos a where a.id = p_ativo_id)), p_ativo_id, p_texto_anotacao, auth.uid());
end;
$$;

create or replace function public.desfazer_confirmacao_termo_com_anotacao(
  p_ativo_id uuid,
  p_destino public.termo_status,
  p_texto_anotacao text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n int;
  v_filial smallint;
begin
  update public.ativos
     set termo_assinado = p_destino,
         termo_data = null
   where id = p_ativo_id
     and termo_assinado = 'sim';

  get diagnostics v_n = row_count;
  if v_n = 0 then
    select a.filial_id into v_filial from public.ativos a where a.id = p_ativo_id;
    if not found or not public.pode_escrever_filial(v_filial) then
      raise exception 'Ativo não encontrado, ou fora do seu vínculo de escrita — nada foi desfeito.'
        using errcode = 'P0002';
    end if;
    raise exception 'A confirmação deste termo acabou de ser desfeita — nada foi gravado de novo.'
      using errcode = 'P0001';
  end if;

  insert into public.anotacoes (empresa_id, ativo_id, texto, criado_por)
  values (public.empresa_da_filial((select a.filial_id from public.ativos a where a.id = p_ativo_id)), p_ativo_id, p_texto_anotacao, auth.uid());
end;
$$;

create or replace function public.confirmar_assinatura_lote_com_anotacoes(
  p_ativo_ids uuid[],
  p_data date,
  p_texto_anotacao text
)
returns table (ativo_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with atualizado as (
    update public.ativos a
       set termo_assinado = 'sim',
           termo_data = p_data
     where a.id = any (p_ativo_ids)
       and a.termo_assinado is distinct from 'sim'
    returning a.id, a.filial_id
  ),
  anotado as (
    -- `returning ativo_id` sozinho é AMBÍGUO aqui: `returns table (ativo_id uuid)` declara
    -- `ativo_id` como variável de saída da função, e o RETURNING bruto colidiria com ela
    -- (42702). O alias `anot` desambigua para a COLUNA.
    insert into public.anotacoes as anot (empresa_id, ativo_id, texto, criado_por)
    select public.empresa_da_filial(atualizado.filial_id), id, p_texto_anotacao, auth.uid() from atualizado
    returning anot.ativo_id
  )
  select anotado.ativo_id from anotado;

  -- Comando SEGUINTE, snapshot novo: ele enxerga o que o UPDATE acima gravou E o que outra
  -- sessão confirmou no meio-tempo. Quem ainda não é 'sim' foi barrado pela RLS de UPDATE.
  if exists (
    select 1
      from public.ativos a
     where a.id = any (p_ativo_ids)
       and a.termo_assinado is distinct from 'sim'
  ) then
    raise exception 'Não foi possível confirmar o lote inteiro — um ou mais termos estão fora do seu vínculo de filial. Nada foi confirmado.'
      using errcode = '42501';
  end if;
end;
$$;

notify pgrst, 'reload schema';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   o md5 do prosrc de cada função tocada = o do CI; as outras funções e todas as policies byte a byte (o "antes");
--   15m de catalogo_policies.sql sem estas funções na lista; 0 linhas fora da legada nas 20.
--
-- ROLLBACK (supabase/rollback/F67C-desfaz.sql, na ordem inversa 0207 → 0200): reemitir cada função com o corpo vigente
-- antes desta migration (o arquivo indicado no diff acima).
