-- =============================================================================
-- bloco7-somente-leitura.sql — F60 · Frente C, evidência para o orquestrador
-- REGRAVADO após a revisão adversarial (três revisores independentes, 16/09/2026)
-- =============================================================================
-- Isola as SETE contagens do bloco 7 (`supabase/tests/catalogo_secdef.sql`,
-- asserções 7a–7g) para rodar no ENSAIO pelo MCP, sem carregar `_asserts.sql`
-- nem o restante do roteiro — só as consultas de contagem, embrulhadas num
-- bloco que:
--   1) marca a transação SÓ LEITURA como a PRIMEIRA instrução (nada aqui
--      escreve, e a marca é a prova disso, não uma formalidade);
--   2) levanta EXCEPTION com o payload (nunca INSERT/NOTICE — a exceção é o
--      jeito de devolver o resultado sem qualquer chance de gravação, e o
--      ROLLBACK implícito da exceção não deixa rastro).
--
-- O QUE MUDOU NESTA REGRAVAÇÃO (achados da revisão adversarial, corrigidos em
-- `scripts/db/recorte-rel.mjs` e neste arquivo — ver `docs/DECISOES.md`):
--   · 7a e 7f ganharam o fallback `proargtypes[arg.ord - 1]` para quando
--     `proallargtypes` é NULO (função sem `returns table`/OUT nenhum) —
--     confirmado ao vivo no Postgres 17 do ensaio que o Postgres deixa
--     `proallargtypes` nulo nesse caso, e sem o fallback uma rel_* correta
--     (mas sem `returns table`) seria acusada como "sem o parâmetro certo".
--   · 7g é NOVA: prova que nenhum nome de `k_excecoes_recorte` tem mais de uma
--     assinatura viva — sem ela, um SEGUNDO overload do nome isento
--     (`rel_saldo_colaborador(uuid, boolean)`, por exemplo) herdaria a isenção
--     inteira sem ter sido avaliado por 7a/7b/7c (achado CRÍTICO da revisão).
--
-- O array `k_excecoes_recorte` abaixo é uma CÓPIA DE LEITURA, só para este
-- diagnóstico isolado — a fonte única continua sendo o array dentro de
-- `supabase/tests/catalogo_secdef.sql` (Decisão 2 da F48); se um dia divergirem,
-- o `catalogo_secdef.sql` é quem vale.
--
-- ESPERADO contra a cadeia de HOJE (16/09/2026, antes do lote 2 da Frente D):
-- 7a e 7b devem acusar as SETE `rel_*` que ainda usam `p_filial smallint`
-- (nenhuma delas declara "p_filiais smallint[]", logo nenhuma tem a ligação no
-- texto); 7c, 7d, 7e, 7f e 7g devem sair limpas (nenhum disfarce textual existe
-- ainda porque a forma nem chegou a ser escrita; as sete de hoje já são
-- invoker/stable/não-strict/com search_path e já têm os grants certos; a
-- exceção nomeada é válida e única — sem overload). Isto é o VERMELHO esperado
-- do par de catálogo, pareado com o vermelho da mesa (`sabotagem-a-mesa-vermelha.txt`).
-- =============================================================================

select set_config('transaction_read_only', 'on', true);

do $f60$
declare
  k_excecoes_recorte text[] := array[
    'rel_saldo_colaborador' -- 0118 · motivo: recorta por PESSOA (p_colaborador), não por filial — devolve o saldo de UM colaborador em todas as filiais onde ele tem item, e o recorte de inquilino dela é a RLS de lancamentos_item/colaboradores (a que a virada multiempresa escreve nas policies) · destino: permanente
  ];
  v_univ    bigint;
  v_7a      bigint;
  v_lista7a text;
  v_7b      bigint;
  v_lista7b text;
  v_7c      bigint;
  v_lista7c text;
  v_7d      bigint;
  v_lista7d text;
  v_7e      bigint;
  v_lista7e text;
  v_7f      bigint;
  v_lista7f text;
  v_7g      bigint;
  v_lista7g text;
begin
  select count(*) into v_univ
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname ~ '^rel_';

  -- 7a — declara p_filiais smallint[], ou está na exceção. Fallback para
  -- proargtypes (0-based) quando proallargtypes é nulo (sem returns table).
  select count(*), coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '')
    into v_7a, v_lista7a
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname ~ '^rel_'
     and not (p.proname = any (k_excecoes_recorte))
     and not exists (
       select 1
         from unnest(p.proargnames) with ordinality as arg(nome, ord)
        where arg.nome = 'p_filiais'
          and (
            (p.proallargtypes is not null and p.proallargtypes[arg.ord]::regtype = 'smallint[]'::regtype)
            or (p.proallargtypes is null and p.proargtypes[arg.ord - 1]::regtype = 'smallint[]'::regtype)
          )
     );

  -- 7b — tem "= any (p_filiais)" em prosrc, fora da exceção.
  select count(*), coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '')
    into v_7b, v_lista7b
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname ~ '^rel_'
     and not (p.proname = any (k_excecoes_recorte))
     and p.prosrc !~* '[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?\s*=\s*any\s*\(\s*p_filiais\s*\)';

  -- 7c — nenhum disfarce textual conhecido do fail-open (prova fraca, declarada).
  select count(*), coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '')
    into v_7c, v_lista7c
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname ~ '^rel_'
     and p.prosrc ~* '(p_filiais\s+is\s+(not\s+)?null|coalesce\s*\(\s*p_filiais|nullif\s*\(\s*p_filiais|case\s+when\s+p_filiais|p_filiais\s+is\s+(not\s+)?distinct)';

  -- 7d — security invoker, stable, não strict, search_path fixo.
  select count(*), coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '')
    into v_7d, v_lista7d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname ~ '^rel_'
     and (
       p.prosecdef
       or p.provolatile <> 's'
       or p.proisstrict
       or not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as c
          where c like 'search_path=%'
       )
     );

  -- 7e — authenticated e service_role têm EXECUTE.
  select count(*), coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '')
    into v_7e, v_lista7e
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname ~ '^rel_'
     and not (
       has_function_privilege('authenticated', p.oid, 'execute')
       and has_function_privilege('service_role', p.oid, 'execute')
     );

  -- 7f — a exceção nos dois sentidos. Mesmo fallback de proargtypes da 7a.
  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_7f, v_lista7f
    from unnest(k_excecoes_recorte) as nome
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.proname = nome
   )
   or exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.proname = nome
        and exists (
          select 1
            from unnest(p.proargnames) with ordinality as arg(nome2, ord)
           where arg.nome2 = 'p_filiais'
             and (
               (p.proallargtypes is not null and p.proallargtypes[arg.ord]::regtype = 'smallint[]'::regtype)
               or (p.proallargtypes is null and p.proargtypes[arg.ord - 1]::regtype = 'smallint[]'::regtype)
             )
        )
   );

  -- 7g — NOVA: nenhum nome de k_excecoes_recorte tem mais de uma assinatura
  -- viva (achado CRÍTICO da revisão adversarial — a exceção é por NOME, e um
  -- segundo overload do mesmo nome herdaria a isenção sem ter sido avaliado).
  select count(*), coalesce(string_agg(nome || ' (' || n || ')', ', ' order by nome), '')
    into v_7g, v_lista7g
    from (
      select nome, count(*) as n
        from unnest(k_excecoes_recorte) as nome
        join pg_proc p on p.proname = nome
        join pg_namespace ns on ns.oid = p.pronamespace and ns.nspname = 'public' and p.prokind = 'f'
       group by nome having count(*) > 1
    ) dup;

  raise exception 'F60_CATALOGO %', jsonb_build_object(
    'universo_rel', v_univ,
    '7a_sem_parametro_certo', v_7a, '7a_lista', v_lista7a,
    '7b_sem_ligacao_no_texto', v_7b, '7b_lista', v_lista7b,
    '7c_com_disfarce', v_7c, '7c_lista', v_lista7c,
    '7d_fora_da_forma', v_7d, '7d_lista', v_lista7d,
    '7e_sem_execute', v_7e, '7e_lista', v_lista7e,
    '7f_excecao_orfa_ou_morta', v_7f, '7f_lista', v_lista7f,
    '7g_excecao_com_overload', v_7g, '7g_lista', v_lista7g
  );
end $f60$;
