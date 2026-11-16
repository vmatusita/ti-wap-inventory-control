-- =====================================================================================================================
-- 0204_escrita_empresa_registros.sql — F67C (16/11/2026): o fim do default — EXPANSÃO, lote 2: a trilha do import e a assinatura nova da ferramenta de órfão
-- =====================================================================================================================
-- classe: ADITIVA (create or replace de função com a MESMA assinatura; uma função NOVA de mesmo nome e aridade nova — nenhum dado, nenhuma policy)
--
-- A F67C faz toda escrita dizer a empresa (a expansão) e só depois tira o default public.empresa_legada() das 20 colunas
-- empresa_id (a contração, 0205–0207, aplicada em produção só depois do deploy e da janela — docs/PLAN-F67C.md §6).
-- Aqui, a trilha do import e a assinatura nova da ferramenta de órfão: cada INSERT ganha empresa_id na lista de colunas, com a empresa da FILIAL que a própria linha
-- grava, lida pela ponte única public.empresa_da_filial(smallint) (0185) — a anotação, a da filial do ativo; o substituto
-- da devolução, a da filial do ativo antigo; a trilha da ferramenta de órfão, a da operação (p_empresa). Nenhuma função passa a LER empresa_id: a coluna só aparece
-- na lista de colunas do INSERT (decisão 2 do PLAN-F67C). As FKs compostas (0166/0167) conferem a coerência com cada outro
-- pai (ativo, movimentação, item, colaborador, pendência). Com uma empresa só, a linha nasce exatamente como hoje (a WAP).
--
-- Assinatura e ACL: create or replace com a MESMA assinatura preserva dono, grants e dependências (doc PG 17); nenhuma
-- precisa de janela (pg_stat_statements.track = top: o INSERT de dentro da função não é forma de topo — fato 14).
--
-- DIFF CONTRA O CORPO VIGENTE (gerado; só a coluna, o valor e a leitura do pai):
--
--   import_gravar_trilha(jsonb, smallint, text, jsonb, uuid, integer, integer, integer, integer, integer) — vigente em 0131_import_decomposto.sql:
--     @@
--        insert into public.import_logs (
--     -    filial_id, modo, arquivo_hash, total_linhas,
--     +    empresa_id, filial_id, modo, arquivo_hash, total_linhas,
--          ativos_criados, movs_apagadas, anotacoes_apagadas, termos_apagados,
--     @@
--        ) values (
--     -    p_filial, 'substituir',
--     +    public.empresa_da_filial(p_filial), p_filial, 'substituir',
--          coalesce(p_plano->>'arquivoHash', ''),
--
--   registrar_limpeza_termos_sem_linha — a assinatura NOVA (uuid, text, text, text) ao lado da antiga (text, text, text) da
--   0196_backup_orfao_duas_formas.sql; o corpo é o dela com a empresa da operação (o cabeçalho da função muda só no 1º argumento):
--     @@
--     -[a assinatura](p_raiz text, p_confirmacao text, p_justificativa text)
--     +[a assinatura](p_empresa uuid, p_raiz text, p_confirmacao text, p_justificativa text)
--      returns text[]
--     @@
--        end if;
--     +  if p_empresa is null then
--     +    raise exception 'Informe a empresa da operação.' using errcode = '42501';
--     +  end if;
--        -- um .docx sem linha não é de empresa nenhuma: quem o limpa é a PLATAFORMA (decisão 13/11-1)
--     @@
--        -- a TRILHA, antes de qualquer cópia: a 12ª reconhece a cópia sob a raiz por ela
--     -  insert into public.eventos_admin (autor, acao, alvo, detalhe)
--     -  values ((select auth.uid()), 'termos_sem_linha_limpos', p_raiz,
--     +  insert into public.eventos_admin (empresa_id, autor, acao, alvo, detalhe)
--     +  values (p_empresa, (select auth.uid()), 'termos_sem_linha_limpos', p_raiz,
--                jsonb_build_object('raiz', p_raiz, 'arquivos', to_jsonb(v_lista), 'total', array_length(v_lista, 1),
-- =====================================================================================================================

set lock_timeout = '2s';

create or replace function public.import_gravar_trilha(
  p_plano       jsonb,
  p_filial      smallint,
  p_backup_path text,
  p_correcoes   jsonb,
  p_uid         uuid,
  p_criados     integer,
  p_movs        integer,
  p_anotacoes   integer,
  p_termos      integer,
  p_conflitos   integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
begin
  -- ---------- 6. log ----------
  insert into public.import_logs (
    empresa_id, filial_id, modo, arquivo_hash, total_linhas,
    ativos_criados, movs_apagadas, anotacoes_apagadas, termos_apagados,
    backup_path, correcoes, criado_por, conflitos_abertos
  ) values (
    public.empresa_da_filial(p_filial), p_filial, 'substituir',
    coalesce(p_plano->>'arquivoHash', ''),
    coalesce((p_plano->>'totalLinhasDados')::int, 0),
    p_criados, p_movs, p_anotacoes, p_termos,
    p_backup_path, coalesce(p_correcoes, '[]'::jsonb), p_uid, p_conflitos
  )
  returning id into v_log_id;

  return v_log_id;
end $$;

create function public.registrar_limpeza_termos_sem_linha(p_empresa uuid, p_raiz text, p_confirmacao text, p_justificativa text)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lista    text[];
  v_esperada text;
begin
  if (select auth.uid()) is null then
    raise exception 'Operador não autenticado.' using errcode = '42501';
  end if;
  if p_empresa is null then
    raise exception 'Informe a empresa da operação.' using errcode = '42501';
  end if;
  -- um .docx sem linha não é de empresa nenhuma: quem o limpa é a PLATAFORMA (decisão 13/11-1)
  if not public.e_plataforma() then
    raise exception 'Limpar arquivos de termo sem registro é restrito à plataforma.' using errcode = '42501';
  end if;
  if coalesce(length(btrim(p_justificativa)), 0) < 10 then
    raise exception 'A justificativa é obrigatória e precisa ter pelo menos 10 caracteres.' using errcode = '22023';
  end if;
  if p_raiz is null or p_raiz !~ '^orfao/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z$' then
    raise exception 'A pasta da cópia dos arquivos de termo está fora da forma. Nada foi registrado.' using errcode = '22023';
  end if;

  -- duas limpezas ao mesmo tempo contariam a mesma lista
  perform pg_advisory_xact_lock(hashtext('termos_sem_linha_limpar'));

  v_lista := array(
    select o.name
      from storage.objects o
     where o.bucket_id = 'termos'
       and o.created_at < now() - interval '1 hour'
       and not exists (select 1 from public.termos_gerados t where t.arquivo_path = o.name)
     order by o.name);
  v_esperada := 'LIMPAR ' || coalesce(array_length(v_lista, 1), 0)::text || ' ARQUIVOS DE TERMO';
  if p_confirmacao is distinct from v_esperada then
    raise exception 'Confirmação incorreta: digite exatamente "%". Nada foi registrado.', v_esperada using errcode = '22023';
  end if;
  if coalesce(array_length(v_lista, 1), 0) = 0 then
    raise exception 'Não há arquivo de termo sem registro para limpar.' using errcode = '22023';
  end if;
  if exists (select 1 from public.eventos_admin e
              where e.acao = 'termos_sem_linha_limpos' and e.detalhe->>'raiz' = p_raiz) then
    raise exception 'Esta pasta de cópia já foi usada. Nada foi registrado.' using errcode = '22023';
  end if;

  -- a TRILHA, antes de qualquer cópia: a 12ª reconhece a cópia sob a raiz por ela
  insert into public.eventos_admin (empresa_id, autor, acao, alvo, detalhe)
  values (p_empresa, (select auth.uid()), 'termos_sem_linha_limpos', p_raiz,
          jsonb_build_object('raiz', p_raiz, 'arquivos', to_jsonb(v_lista), 'total', array_length(v_lista, 1),
                             'justificativa', btrim(p_justificativa)));
  return v_lista;
end;
$$;

comment on function public.registrar_limpeza_termos_sem_linha(uuid, text, text, text) is
  'F67C (0204): a ferramenta NOMEADA de órfão da Zona destrutiva — a parte do banco, agora com a empresa da OPERAÇÃO (p_empresa, recusada se nula) carimbada na trilha (o .docx sem linha continua sendo da plataforma; a empresa é só a da linha de eventos_admin). Só a plataforma; justificativa; raiz orfao/<carimbo>; a lista dos .docx de termos sem linha há mais de uma hora; a confirmação digitada LIMPAR <N> ARQUIVOS DE TERMO; a trilha termos_sem_linha_limpos gravada ANTES da cópia. A forma antiga (text, text, text) sai na contração (0206).';

revoke all on function public.registrar_limpeza_termos_sem_linha(uuid, text, text, text) from public, anon, service_role;
grant execute on function public.registrar_limpeza_termos_sem_linha(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   o md5 do prosrc de cada função tocada = o do CI; as outras funções e todas as policies byte a byte (o "antes");
--   15m de catalogo_policies.sql sem estas funções na lista; 0 linhas fora da legada nas 20.
--
-- ROLLBACK (supabase/rollback/F67C-desfaz.sql, na ordem inversa 0207 → 0200): reemitir cada função com o corpo vigente
-- antes desta migration (o arquivo indicado no diff acima); derrubar a assinatura nova da ferramenta de órfão (uuid, text, text, text).
