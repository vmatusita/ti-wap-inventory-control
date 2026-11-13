-- =============================================================================
-- 0186_consumidores_por_empresa.sql — F67 (13/11/2026): os corpos que usavam o cargo SEM empresa passam à forma por empresa
-- =============================================================================
-- classe: ADITIVA (create or replace de sete funções, mesmas assinaturas, mesmos grants; nenhuma tabela, policy ou linha)
--
-- O cargo sem empresa (`papel_atual()`, `e_admin()`, `e_dev()`, `pode_escrever()`) vai sobreviver SÓ como PISO de policy,
-- em conjunção com o recorte do mesmo cargo (a 0188 muda o sentido dele para "o cargo mais forte entre as memberships").
-- Todo CORPO de função que o usava passa, ANTES dessa troca, à forma por empresa da 0185 — com a empresa de verdade onde
-- ela existe no contexto, ou com a legada EXPLÍCITA onde o recorte é de fase futura (docs/PLAN-F67.md §2.2, decisão 3):
--
--   pode_escrever_filial(fid)       REAL: responde pela EMPRESA DA FILIAL (`pode_escrever_unidade(empresa_da_filial(fid),
--                                   fid)`). O admin da A deixa de "poder" na filial da B. Com uma empresa, igual a hoje
--                                   para toda filial que existe; filial inexistente passa a responder false para todos
--                                   (hoje dev/admin recebiam true — nenhum chamador depende disso: a FK recusa antes).
--   pode_escrever_termo(ids)        REAL: cada ativo pela filial dele (`pode_escrever_filial`, que já cobre o admin da
--                                   empresa); o termo DEGENERADO (`ativo_ids = '{}'`), que não tem ativo de onde tirar a
--                                   empresa, fica com a legada EXPLÍCITA → F67B (o join com termos_gerados).
--   pode_ler_arquivo_termo(nome)    LEGADA → F67B: `papel_na_empresa(empresa_legada()) is not null` (o join é da F67B).
--   checagens_integridade_resumo()  LEGADA → F69/F70 (decisão 14): a guarda passa a "conta ativa DA WAP" — o smoke agendado
--   ledger_de_migracoes()           usa uma conta `consulta` da WAP, e o "qualquer logado ativo" de hoje é exatamente esse.
--   dev_checagens_integridade()     LEGADA → F69: `e_dev_na(empresa_legada())` (que já inclui a plataforma).
--   ultima_migracao_aplicada()      idem.
--
-- Cada corpo é o vigente (0158, 0069, 0129, 0138, 0148, 0138, 0077) com a troca SÓ na guarda — o diff do prosrc é a
-- linha da guarda (e, em pode_escrever_filial, o corpo inteiro, que passa a delegar). As mensagens e os SQLSTATE não
-- mudam. `create or replace` preserva os grants; a linguagem, a volatilidade, o `security definer` e o `search_path` são
-- os de antes, repetidos por extenso.
-- =============================================================================

set lock_timeout = '2s';

create or replace function public.pode_escrever_filial(fid smallint)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Sem filial não há o que autorizar. Fecha em vez de abrir.
  if fid is null then
    return false;
  end if;

  -- F67: responde pela EMPRESA DA FILIAL. A empresa é conferida ANTES do cargo, dentro de pode_escrever_unidade; a filial
  -- que não existe não tem empresa e fecha.
  return public.pode_escrever_unidade(public.empresa_da_filial(fid), fid);
end;
$$;

create or replace function public.pode_escrever_termo(p_ativo_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- F67: o termo DEGENERADO (sem ativo) não tem de onde tirar a empresa — a legada EXPLÍCITA (o admin dela o apaga, como
  -- hoje; a F67B fecha pelo join com termos_gerados). Com ativo, cada um pela filial dele: pode_escrever_filial já
  -- responde true ao admin da empresa da filial, e false para filial de empresa onde quem chama não escreve.
  select case
           when coalesce(array_length(p_ativo_ids, 1), 0) = 0 then public.e_admin_na(public.empresa_legada())
           else not exists (
             select 1
               from unnest(p_ativo_ids) aid
               left join public.ativos a on a.id = aid
              where a.id is null                                   -- ativo inexistente → fecha
                 or not public.pode_escrever_filial(a.filial_id)    -- filial onde não se escreve → fecha
           )
         end
$$;

create or replace function public.pode_ler_arquivo_termo(p_nome text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select public.papel_na_empresa(public.empresa_legada())) is not null
$$;

create or replace function public.checagens_integridade_resumo()
returns table(chave text, total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.papel_na_empresa(public.empresa_legada()) is null then
    raise exception 'Esta consulta exige uma conta ativa.' using errcode = '42501';
  end if;

  return query
  select n.chave, n.total from public.checagens_integridade_nucleo() n;
end;
$$;

create or replace function public.ledger_de_migracoes()
returns table (versao text, nome text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.papel_na_empresa(public.empresa_legada()) is null then
    raise exception 'Esta consulta exige uma conta ativa.' using errcode = '42501';
  end if;

  return query
    select m.version, m.name
      from supabase_migrations.schema_migrations m
     order by m.version desc;
exception
  -- Espelha a 0077: banco sem a tabela de controle devolve ledger VAZIO, não erro.
  when undefined_table then
    return;
end;
$$;

create or replace function public.dev_checagens_integridade()
returns table(chave text, total bigint, amostra text[])
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.e_dev_na(public.empresa_legada()) then
    raise exception 'Esta consulta é restrita ao cargo Desenvolvedor.' using errcode = '42501';
  end if;

  return query
  select n.chave, n.total, n.amostra from public.checagens_integridade_nucleo() n;
end;
$$;

create or replace function public.ultima_migracao_aplicada()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v text;
begin
  if not public.e_dev_na(public.empresa_legada()) then
    raise exception 'Esta consulta é restrita ao cargo Desenvolvedor.' using errcode = '42501';
  end if;
  select max(version) into v from supabase_migrations.schema_migrations;
  return v;
exception
  -- Banco onde a tabela de controle não existe (um Postgres cru do CI, por exemplo): a tela
  -- mostra "indisponível" em vez de quebrar.
  when undefined_table then return null;
end;
$$;

comment on function public.pode_escrever_filial(smallint) is
  'F67 (era F62/F22/F21): true se quem chama pode ESCREVER na filial informada, PELA EMPRESA DA FILIAL (pode_escrever_unidade): dev/admin daquela empresa → sempre (inclusive filial desativada); operador → só com vínculo da membership naquela empresa; consulta/desativado/sem perfil, filial inexistente ou fid NULL → nunca.';
comment on function public.pode_ler_arquivo_termo(text) is
  'F67 (era F50/0129): todo membro ATIVO da empresa legada lê todo arquivo de termo — a legada EXPLÍCITA até a F67B fechar por join com termos_gerados. Ignora o parâmetro de propósito.';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   As sete com uma assinatura cada, o md5 do prosrc = o do CI, e nenhum prosrc de public citando papel_atual(),
--   e_admin(), e_dev() ou pode_escrever() fora da família (a trava Q de supabase/tests/cargo_por_empresa.sql). O conta a
--   conta (scripts/perf/conta-a-conta.mjs --fase f67-depois): 0 divergência em pode_escrever_filial por filial.
--
-- ROLLBACK (supabase/rollback/F67-desfaz.sql, o penúltimo passo — antes de derrubar as primitivas da 0185): reemitir as
-- sete com o corpo vigente de antes da F67 (0158, 0069, 0129, 0138, 0148, 0138, 0077), mesma assinatura. Os grants ficam
-- (create or replace). Nenhum dado se perde.
