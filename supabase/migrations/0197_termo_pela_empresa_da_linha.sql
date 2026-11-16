-- =====================================================================================================================
-- 0197_termo_pela_empresa_da_linha.sql — F67B (16/11/2026): o termo pela empresa DA LINHA — EXPANSÃO (lote 4): o degenerado deixa a legada
-- =====================================================================================================================
-- classe: ADITIVA (uma função NOVA de mesmo nome e aridade nova; create or replace de uma; alter policy de três)
--
-- O termo DEGENERADO (ativo_ids = '{}') decidia pela legada EXPLÍCITA (0186): o admin da B não apagaria nem a LINHA nem o
-- .docx do degenerado da B — o "lixo imortal" da 0069, agora por empresa. A forma por empresa nasce ao lado da antiga
-- (o molde da F67: p_empresa 1º, mesmo nome, aridade nova), com a empresa DA LINHA:
--
--   pode_escrever_termo(p_empresa uuid, p_ativo_ids uuid[])
--     com ativos: igual à de hoje (cada ativo pela filial dele, pode_escrever_filial);
--     degenerado: public.e_admin_na(p_empresa) — o admin da empresa DA LINHA, e só ele.
--
-- pode_escrever_arquivo_termo (0069) passa a delegar a ela com a empresa da linha; o coalesce continua TRUE aqui (a
-- inversão do persistirTermo ainda não está no ar — o false é a contração, 0198). Diff contra o corpo vigente:
--     antes:  (select bool_and(public.pode_escrever_termo(t.ativo_ids))
--     depois: (select bool_and(public.pode_escrever_termo(t.empresa_id, t.ativo_ids))
--
-- As três policies de termos_gerados (0175) passam a pode_escrever_termo(empresa_id, ativo_ids) — o resto do predicado
-- byte a byte. Para a WAP a resposta é a MESMA (toda linha é da legada; o degenerado decide por e_admin_na da legada nas
-- duas). A antiga, pode_escrever_termo(uuid[]), sai na contração (0198), quando nada mais a cita.
-- =====================================================================================================================

set lock_timeout = '2s';

create function public.pode_escrever_termo(p_empresa uuid, p_ativo_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- F67B: o termo DEGENERADO (sem ativo) decide pela empresa DA LINHA (p_empresa) — o admin dela o apaga, e só ele
  -- (a não-imortalidade da 0069, por empresa). Com ativo, cada um pela filial dele, como antes.
  select case
           when coalesce(array_length(p_ativo_ids, 1), 0) = 0 then public.e_admin_na(p_empresa)
           else not exists (
             select 1
               from unnest(p_ativo_ids) aid
               left join public.ativos a on a.id = aid
              where a.id is null                                   -- ativo inexistente → fecha
                 or not public.pode_escrever_filial(a.filial_id)    -- filial onde não se escreve → fecha
           )
         end
$$;

comment on function public.pode_escrever_termo(uuid, uuid[]) is
  'F67B (0197): true se quem chama pode escrever o termo destes ativos, NA EMPRESA DA LINHA (p_empresa). Com ativos: cada um pela filial dele (pode_escrever_filial, já por empresa da filial desde a F67). Degenerado (ativo_ids vazio): e_admin_na(p_empresa) — o admin da empresa da linha o apaga, e só ele. Substitui pode_escrever_termo(uuid[]), que decidia o degenerado pela legada (sai na 0198).';

revoke all on function public.pode_escrever_termo(uuid, uuid[]) from public, anon, service_role;
grant execute on function public.pode_escrever_termo(uuid, uuid[]) to authenticated;

create or replace function public.pode_escrever_arquivo_termo(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select bool_and(public.pode_escrever_termo(t.empresa_id, t.ativo_ids))
       from public.termos_gerados t
      where t.arquivo_path = p_nome),
    true
  )
$$;

alter policy "operador insere" on public.termos_gerados
  with check (
    coalesce(array_length(ativo_ids, 1), 0) > 0
    and public.pode_escrever_termo(empresa_id, ativo_ids)
    and public.termo_ancora_coerente(movimentacao_ids, ativo_ids)
    and arquivo_path = id::text || '.docx'
    and empresa_id = any (array (select public.empresas_de_escrita()))
  );

alter policy "operador atualiza" on public.termos_gerados
  using (
    public.pode_escrever_termo(empresa_id, ativo_ids)
    and empresa_id = any (array (select public.empresas_de_escrita()))
  )
  with check (
    coalesce(array_length(ativo_ids, 1), 0) > 0
    and public.pode_escrever_termo(empresa_id, ativo_ids)
    and public.termo_ancora_coerente(movimentacao_ids, ativo_ids)
    and arquivo_path = id::text || '.docx'
    and empresa_id = any (array (select public.empresas_de_escrita()))
  );

alter policy "operador apaga" on public.termos_gerados
  using (
    public.pode_escrever_termo(empresa_id, ativo_ids)
    and empresa_id = any (array (select public.empresas_de_escrita()))
  );

notify pgrst, 'reload schema';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   pode_escrever_termo(uuid, uuid[]) existe ao lado da antiga; o md5 do prosrc de pode_escrever_arquivo_termo = o do
--   CI; as três policies de termos_gerados com o predicado novo; o conta a conta (f67b-depois) com 0 divergência (a classe
--   escrita_linha_termo inclusive).
--
-- ROLLBACK (supabase/rollback/F67B-desfaz.sql, na ordem inversa 0199 → 0194): as três policies de volta a public.pode_escrever_termo(ativo_ids); pode_escrever_arquivo_termo com o corpo da 0069;
-- derrubar pode_escrever_termo(uuid, uuid[]).
