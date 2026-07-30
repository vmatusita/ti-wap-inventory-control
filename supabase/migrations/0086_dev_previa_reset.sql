-- Migration 0086 — F23: a PRÉVIA do reset, contada pela mesma régua que o reset revalida.
--
-- Depende da 0082 (`exigir_dev_para_destruir`) e da 0083 (as RPCs de reset).
--
-- =============================================================================
-- POR QUE ISTO NÃO PODE SER UMA QUERY DO CLIENT
-- =============================================================================
-- `resetar_acervo`/`resetar_itens` exigem `p_contagens` e RECUSAM (40001) quando o número que
-- chega não bate com o que elas mesmas contam no momento do apply — é a guarda TOCTOU herdada
-- da 0040. Isso significa que a tela precisa contar EXATAMENTE como a RPC conta; um jeito
-- "equivalente" escrito em TypeScript/PostgREST não serve, porque qualquer diferença de
-- recorte transforma a guarda numa recusa PERMANENTE: o reset nunca aplicaria, e a mensagem
-- ("o estado mudou desde a prévia") apontaria para a causa errada.
--
-- E o recorte NÃO é expressável em PostgREST sem gambiarra: `movimentacoes`, `anotacoes` e
-- `pendencias_item` recortam por `ativo_id in (select id from ativos where filial_id = X)`, e
-- `termos_gerados` por um `exists` sobre `unnest(ativo_ids)`. Traduzir isso em N requisições
-- daria uma contagem NÃO-ATÔMICA — cada uma num instante diferente —, que é justamente o que a
-- guarda de contagens existe para detectar.
--
-- Aqui as contagens saem de UMA transação, com as MESMAS expressões da 0083. Copiar as
-- expressões é dívida assumida e está marcada nos dois arquivos: mexeu no recorte de lá, mexa
-- aqui — e o roteiro supabase/tests/dev_destrutivo.sql compara os dois lados.
--
-- SÓ-LEITURA (`stable`, nenhum verbo de escrita) e restrita ao cargo dev pela mesma guarda das
-- ferramentas. Devolve também o RÓTULO da confirmação, para a tela não recalculá-lo.
--
-- ADITIVA, sem exclusão de acervo no corpo → NÃO bate no gate → caminho **A** do RUNBOOK.
--
-- REVERSÃO: drop function public.previa_reset(text, smallint);

create or replace function public.previa_reset(p_bloco text, p_filial smallint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ativos int := 0;
  v_movs   int := 0;
  v_anot   int := 0;
  v_pend   int := 0;
  v_termos int := 0;
  v_lanc   int := 0;
  v_misto  boolean := false;
begin
  -- Mesma guarda das ferramentas: só o dev enxerga a prévia. A justificativa é irrelevante
  -- para uma leitura, mas a guarda é uma função só — passa-se um texto fixo que a satisfaz,
  -- em vez de duplicar a checagem de cargo com outra régua.
  perform public.exigir_dev_para_destruir('previa somente leitura');

  if p_bloco not in ('acervo', 'itens') then
    raise exception 'Bloco inválido: use acervo ou itens.' using errcode = '22023';
  end if;

  if p_filial is not null and not exists (select 1 from public.filiais f where f.id = p_filial) then
    raise exception 'Filial não encontrada.' using errcode = 'P0002';
  end if;

  if p_bloco = 'acervo' then
    -- ⚠ ESPELHO EXATO do bloco de contagens de `resetar_acervo` (0083). Qualquer divergência
    -- aqui vira recusa 40001 no apply.
    select count(*)::int into v_ativos from public.ativos a
     where p_filial is null or a.filial_id = p_filial;
    select count(*)::int into v_movs from public.movimentacoes m
     where p_filial is null
        or m.ativo_id in (select id from public.ativos where filial_id = p_filial);
    select count(*)::int into v_anot from public.anotacoes an
     where p_filial is null
        or an.ativo_id in (select id from public.ativos where filial_id = p_filial);
    select count(*)::int into v_pend from public.pendencias_item pi
     where p_filial is null
        or pi.ativo_id in (select id from public.ativos where filial_id = p_filial);
    select count(*)::int into v_termos from public.termos_gerados t
     where p_filial is null
        or exists (select 1 from unnest(t.ativo_ids) aid
                     join public.ativos a on a.id = aid where a.filial_id = p_filial);

    -- O bloqueio que a tela precisa ANTECIPAR: termo de lote misturando filiais faz o reset
    -- recusar. Melhor dizer isso ANTES de a pessoa gerar backup e digitar a confirmação.
    if p_filial is not null then
      select exists (
        select 1 from public.termos_gerados t
         where exists (select 1 from unnest(t.ativo_ids) aid
                         join public.ativos a on a.id = aid where a.filial_id = p_filial)
           and exists (select 1 from unnest(t.ativo_ids) aid
                         join public.ativos a on a.id = aid where a.filial_id <> p_filial)
      ) into v_misto;
    end if;
  else
    -- ⚠ ESPELHO EXATO do bloco de contagens de `resetar_itens` (0083).
    select count(*)::int into v_lanc from public.lancamentos_item l
     where p_filial is null or l.filial_id = p_filial;
  end if;

  return jsonb_build_object(
    'bloco',    p_bloco,
    'filial_id', p_filial,
    'rotulo',   public.rotulo_alcance_reset(p_filial),
    'termo_misto_bloqueia', v_misto,
    -- `contagens` sai no formato EXATO que as RPCs de reset esperam em `p_contagens`: a tela
    -- devolve este objeto sem mexer, e assim não há como a serialização introduzir divergência.
    'contagens', case
      when p_bloco = 'acervo' then jsonb_build_object(
        'ativos', v_ativos, 'movimentacoes', v_movs, 'anotacoes', v_anot,
        'pendencias_item', v_pend, 'termos', v_termos)
      else jsonb_build_object('lancamentos', v_lanc)
    end);
end;
$$;

comment on function public.previa_reset(text, smallint) is
  'F23 (/dev): conta o recorte de um reset (bloco acervo ou itens; uma filial ou global) usando as MESMAS expressões de resetar_acervo/resetar_itens, e devolve o objeto `contagens` já no formato que elas exigem em p_contagens. Existe porque a guarda TOCTOU dessas RPCs recusa contagens que não batam: uma prévia calculada por outro caminho tornaria o reset inaplicável. Só-leitura, restrita ao cargo dev. Também avisa se um termo de lote entre filiais vai bloquear o reset.';

revoke all on function public.previa_reset(text, smallint) from public, anon, service_role;
grant execute on function public.previa_reset(text, smallint) to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   select p.proname, p.prosecdef as definer, p.provolatile as vol,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth,
--          has_function_privilege('service_role', p.oid, 'execute')  as srv
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname = 'previa_reset';
--   -- esperado: definer=true · vol='s' · anon=false · auth=true · srv=false
--
--   -- e ela NÃO escreve:
--   select pg_get_functiondef('public.previa_reset(text,smallint)'::regprocedure)
--          ~* '(insert into|update |delete from)' as escreve;
--   -- esperado: false
