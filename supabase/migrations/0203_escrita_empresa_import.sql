-- =====================================================================================================================
-- 0203_escrita_empresa_import.sql — F67C (16/11/2026): o fim do default — EXPANSÃO, lote 1: as duas internas do import que gravam o acervo
-- =====================================================================================================================
-- classe: ADITIVA (create or replace de função com a MESMA assinatura — nenhum dado, nenhuma policy)
--
-- A F67C faz toda escrita dizer a empresa (a expansão) e só depois tira o default public.empresa_legada() das 20 colunas
-- empresa_id (a contração, 0205–0207, aplicada em produção só depois do deploy e da janela — docs/PLAN-F67C.md §6).
-- Aqui, as duas internas do import que gravam o acervo: cada INSERT ganha empresa_id na lista de colunas, com a empresa da FILIAL que a própria linha
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
--   import_criar_ativos(jsonb, smallint) — vigente em 0131_import_decomposto.sql:
--     @@
--        insert into public.ativos (
--     -    patrimonio, patrimonio_original, service_tag, categoria,
--     +    empresa_id, patrimonio, patrimonio_original, service_tag, categoria,
--          marca, modelo, fornecedor, memoria, armazenamento, processador, hostname,
--     @@
--        ) values (
--     +    public.empresa_da_filial(p_filial),
--          p_elemento->>'patrimonio',
--
--   import_lancar_movimentacoes(uuid, jsonb, smallint, uuid, date, text) — vigente em 0131_import_decomposto.sql:
--     @@
--        v_estado public.status_ativo;
--     +  v_empresa uuid;
--      begin
--        v_estado := (p_elemento->>'estadoAlvo')::public.status_ativo;
--     +  v_empresa := public.empresa_da_filial(p_filial);
--      
--     @@
--        --   no sistema pós-go-live (sem marcador → aparece nas Entradas normalmente).
--     -  insert into public.movimentacoes (ativo_id, tipo, data, filial_id, observacao, criado_por)
--     +  insert into public.movimentacoes (empresa_id, ativo_id, tipo, data, filial_id, observacao, criado_por)
--        values (
--     -    p_ativo, 'compra',
--     +    v_empresa, p_ativo, 'compra',
--          coalesce(nullif(p_elemento->>'dataEntrada', '')::date, p_data_import),
--     @@
--          insert into public.movimentacoes (
--     -      ativo_id, tipo, data, filial_id, colaborador, setor, chamado,
--     +      empresa_id, ativo_id, tipo, data, filial_id, colaborador, setor, chamado,
--            observacao, status_resultante, criado_por
--          ) values (
--     -      p_ativo, 'ajuste',
--     +      v_empresa, p_ativo, 'ajuste',
--            coalesce(nullif(p_elemento->>'dataAjuste', '')::date, p_data_import),
-- =====================================================================================================================

set lock_timeout = '2s';

create or replace function public.import_criar_ativos(
  p_elemento jsonb,
  p_filial   smallint
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ativo_id uuid;
begin
  -- 4a. ativo. Pendência de nascimento é `;`-joinável (F7E patrimônio + F15 service tag):
  --   patrimonio null    → 'sem patrimônio físico'  (sincronia: PENDENCIA_SEM_PATRIMONIO);
  --   serviceTag vazia   → 'sem service tag'        (sincronia: PENDENCIA_SEM_SERVICE_TAG);
  --   os dois            → 'sem patrimônio físico; sem service tag';
  --   nenhum             → null. concat_ws('; ', …) pula os NULLs; nullif('', '') → null.
  insert into public.ativos (
    empresa_id, patrimonio, patrimonio_original, service_tag, categoria,
    marca, modelo, fornecedor, memoria, armazenamento, processador, hostname,
    filial_id, origem, observacoes, pendencia
  ) values (
    public.empresa_da_filial(p_filial),
    p_elemento->>'patrimonio',
    nullif(p_elemento->>'patrimonioOriginal', ''),
    nullif(p_elemento->>'serviceTag', ''),
    (p_elemento->>'categoria')::public.categoria_ativo,
    nullif(p_elemento->>'marca', ''),
    nullif(p_elemento->>'modelo', ''),
    nullif(p_elemento->>'fornecedor', ''),
    nullif(p_elemento->>'memoria', ''),
    nullif(p_elemento->>'armazenamento', ''),
    nullif(p_elemento->>'processador', ''),
    nullif(p_elemento->>'hostname', ''),
    p_filial,
    'importacao',
    nullif(p_elemento->>'observacoes', ''),
    nullif(
      concat_ws('; ',
        case when (p_elemento->>'patrimonio') is null then 'sem patrimônio físico' end,
        case when nullif(p_elemento->>'serviceTag', '') is null then 'sem service tag' end
      ),
      ''
    )
  )
  returning id into v_ativo_id;

  return v_ativo_id;
end $$;

create or replace function public.import_lancar_movimentacoes(
  p_ativo        uuid,
  p_elemento     jsonb,
  p_filial       smallint,
  p_uid          uuid,
  p_data_import  date,
  p_obs_marcador text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado public.status_ativo;
  v_empresa uuid;
begin
  v_estado := (p_elemento->>'estadoAlvo')::public.status_ativo;
  v_empresa := public.empresa_da_filial(p_filial);

  -- 4b (REVERTIDO — F8): compra de abertura SEMPRE marcada (escondida do relatório),
  --   COM ou SEM dataEntrada. A data continua a REAL (dataEntrada) quando houver; só a
  --   observação volta a ser SEMPRE `p_obs_marcador` (`import startup dd/MM/yyyy`), no
  --   lugar do `case` condicional da F7H — equivale ao passo 4b da 0034. Motivo: a
  --   planilha de startup não distingue "compra nova" de "saldo de abertura" (toda
  --   linha tem data), então a F7H inundava as Entradas com o acervo pré-existente.
  --   Toda compra de abertura é BASELINE; compra "de verdade" é a lançada manualmente
  --   no sistema pós-go-live (sem marcador → aparece nas Entradas normalmente).
  insert into public.movimentacoes (empresa_id, ativo_id, tipo, data, filial_id, observacao, criado_por)
  values (
    v_empresa, p_ativo, 'compra',
    coalesce(nullif(p_elemento->>'dataEntrada', '')::date, p_data_import),
    p_filial, p_obs_marcador, p_uid
  );

  -- 4c. ajuste de reconciliação (só se o estado-alvo não é em_estoque). SEMPRE com
  --     o marcador: é reconciliação de estado, não entrada/saída real (e nem consta
  --     nas tabelas do relatório). data = dataAjuste (ou data do import se null).
  if v_estado <> 'em_estoque' then
    insert into public.movimentacoes (
      empresa_id, ativo_id, tipo, data, filial_id, colaborador, setor, chamado,
      observacao, status_resultante, criado_por
    ) values (
      v_empresa, p_ativo, 'ajuste',
      coalesce(nullif(p_elemento->>'dataAjuste', '')::date, p_data_import),
      p_filial,
      nullif(p_elemento->>'colaborador', ''), nullif(p_elemento->>'setor', ''), nullif(p_elemento->>'chamado', ''),
      p_obs_marcador, v_estado, p_uid
    );
  end if;

  -- 4d. sincroniza colaborador_atual/setor_atual quando o estado é de POSSE.
  if v_estado in ('em_uso', 'emprestado', 'reservado') then
    update public.ativos set
      colaborador_atual = nullif(p_elemento->>'colaborador', ''),
      setor_atual       = nullif(p_elemento->>'setor', ''),
      updated_at        = now()
    where id = p_ativo;
  end if;
end $$;

notify pgrst, 'reload schema';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   o md5 do prosrc de cada função tocada = o do CI; as outras funções e todas as policies byte a byte (o "antes");
--   15m de catalogo_policies.sql sem estas funções na lista; 0 linhas fora da legada nas 20.
--
-- ROLLBACK (supabase/rollback/F67C-desfaz.sql, na ordem inversa 0207 → 0200): reemitir cada função com o corpo vigente
-- antes desta migration (o arquivo indicado no diff acima).
