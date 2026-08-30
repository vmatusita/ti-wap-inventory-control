-- =============================================================
-- Roteiro de teste: O FUSO DO NEGÓCIO (migration 0124, 30/08/2026)
--
-- Roda no job `banco` do CI (psql, ON_ERROR_STOP=1) e é auto-verificável no SQL
-- editor / MCP. Convenção da pasta:
--   NOTICE  '✓ ...'  quando a invariante bate
--   WARNING '✗ ...'  quando NÃO bate (o job `banco` falha em qualquer `WARNING: ✗`)
--
-- O QUE ELE DEFENDE. O item W da dívida técnica ("`current_date` em RPC, com o
-- banco em UTC") não foi fechado trocando `current_date` por uma função em sete
-- RPCs — foi fechado pondo o BANCO no fuso do negócio (0124, Parte 1). Uma
-- correção que mora numa configuração precisa de uma trava que perceba a
-- reversão: sem este roteiro, alguém restaurar um banco novo com o default de
-- fábrica (UTC) traria o defeito de volta em silêncio, e o sintoma só apareceria
-- entre 21h e meia-noite BRT, no relatório de quem lançou.
--
-- SÓ LEITURA — não escreve nada, não precisa de `begin/rollback` nem de
-- pré-requisito de dados.
-- =============================================================

do $$
declare
  v_tz        text;
  v_gravado   text;
  v_hoje_sql  date;
  v_hoje_fn   date;
  v_meia_noite timestamptz;
begin
  -- ---------------------------------------------------------------
  -- 1. A sessão que o app abre está no fuso do negócio
  -- ---------------------------------------------------------------
  v_tz := current_setting('TimeZone');
  if v_tz = 'America/Sao_Paulo' then
    raise notice '✓ 1. a sessão roda em America/Sao_Paulo (fuso do negócio)';
  else
    raise warning '✗ 1. a sessão roda em % — esperado America/Sao_Paulo. A migration 0124 foi revertida ou este banco nasceu depois dela sem reaplicá-la.', v_tz;
  end if;

  -- ---------------------------------------------------------------
  -- 2. E está GRAVADO no banco (vale para toda conexão nova, não só para esta)
  -- ---------------------------------------------------------------
  select array_to_string(s.setconfig, ',')
    into v_gravado
    from pg_db_role_setting s
    join pg_database d on d.oid = s.setdatabase
   where d.datname = current_database()
   limit 1;

  if coalesce(v_gravado, '') like '%TimeZone=America/Sao_Paulo%' then
    raise notice '✓ 2. `alter database set timezone` está gravado no catálogo';
  else
    raise warning '✗ 2. o banco NÃO tem TimeZone=America/Sao_Paulo gravado (setconfig = %). Uma sessão nova voltaria a UTC.', coalesce(v_gravado, '(nenhum)');
  end if;

  -- ---------------------------------------------------------------
  -- 3. `current_date` e `hoje_brt()` concordam — as duas camadas da 0124
  -- ---------------------------------------------------------------
  -- Esta é a asserção que morde de verdade. `hoje_brt()` calcula a data de SP
  -- sem depender da configuração; `current_date` depende. Entre 21:00 e 23:59
  -- BRT, num banco em UTC, os dois divergem em um dia — que é exatamente o
  -- defeito: a movimentação nasce com a data de amanhã e some do relatório do
  -- dia em que foi feita (`rel_estoque_asof` só vê `m.data <= p_data`).
  v_hoje_sql := current_date;
  v_hoje_fn  := public.hoje_brt();
  if v_hoje_sql = v_hoje_fn then
    raise notice '✓ 3. current_date (%) = hoje_brt() (%)', v_hoje_sql, v_hoje_fn;
  else
    raise warning '✗ 3. current_date (%) ≠ hoje_brt() (%) — o banco está fora do fuso do negócio', v_hoje_sql, v_hoje_fn;
  end if;

  -- ---------------------------------------------------------------
  -- 4. A prova independente do relógio: meia-noite do dia é meia-noite EM SP
  -- ---------------------------------------------------------------
  -- As asserções 1-3 passariam por acaso entre 00:00 e 20:59 BRT mesmo com o
  -- banco em UTC. Esta não: ela pergunta que INSTANTE o Postgres entende por
  -- "hoje às 00:00" ao converter date → timestamptz, e num banco em UTC a
  -- resposta erra em 3 horas. É o que faz o roteiro reprovar de manhã também.
  v_meia_noite := current_date::timestamptz;
  if v_meia_noite = (current_date::text || ' 00:00:00-03')::timestamptz then
    raise notice '✓ 4. date → timestamptz ancora em 00:00 de São Paulo (%)', v_meia_noite;
  else
    raise warning '✗ 4. date → timestamptz ancorou em % — deveria ser 00:00 -03', v_meia_noite;
  end if;

  -- ---------------------------------------------------------------
  -- 5. `hoje_brt()` continua existindo com a assinatura que as RPCs novas usam
  -- ---------------------------------------------------------------
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'hoje_brt'
       and pg_get_function_identity_arguments(p.oid) = ''
       and p.provolatile = 's'
  ) then
    raise notice '✓ 5. public.hoje_brt() existe, sem argumentos e STABLE';
  else
    raise warning '✗ 5. public.hoje_brt() sumiu, ganhou argumento ou mudou de volatilidade';
  end if;
end $$;
