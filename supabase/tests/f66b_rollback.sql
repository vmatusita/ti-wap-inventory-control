-- =============================================================
-- Roteiro de teste: O ROLLBACK DA F66B, ENSAIADO (12/11/2026) — a sabotagem H
-- =============================================================
-- A F66B (0181–0184) pôs 65 CHECK de comprimento nas 20 tabelas de negócio. O rollback dela
-- (`supabase/rollback/F66B-desfaz.sql`) os tira por `drop constraint if exists` literal, na ordem inversa do apply. Este
-- roteiro RODA o arquivo de verdade (`\ir`), dentro da transação dele, e prova:
--   rb0 — antes do rollback, os 65 CHECK da fase existem (a contagem de CHECK de public é a do CI com a F66B, 101);
--   rb1 — depois, nenhum CHECK de comprimento canônico (char_length(<col>) <= N) sobra nas 20;
--   rb2 — a impressão das CHECK de public (tabela, nome, pg_get_constraintdef, convalidated — o md5) é a do CI ANTES da
--         0181 (medida na mesa com a cadeia 0001–0180 e conferida no CI): o esquema voltou byte a byte;
--   rb3 — as de comprimento ANTERIORES à F66B (anotacao_texto_len, unidades_apelidos_apelido_tamanho) ficaram;
--   rb4 — o arquivo rodado de novo não muda nada (idempotente: serve ao apply parado entre lotes).
-- Os resultados atravessam o `\ir` como variáveis do psql (`\gset`). DADOS: nenhum — é só catálogo.
--
-- O DA F66B É O ÚLTIMO DA FILA: nenhum rollback de fase posterior roda antes dele. Os de antes dele (F65, F64, F63, F62)
-- o rodam ANTES dos deles (fato 18 do PLAN-F66B).
-- =============================================================

begin;

create function pg_temp.f66b_impressao_checks() returns text
language sql stable as $f$
  select count(*) || ':' ||
         md5(coalesce(string_agg(c.relname || '|' || k.conname || '|' || pg_get_constraintdef(k.oid) || '|' || k.convalidated,
                                 E'\n' order by c.relname, k.conname), ''))
    from pg_constraint k join pg_class c on c.oid = k.conrelid
   where k.contype = 'c' and c.relnamespace = 'public'::regnamespace
$f$;

-- quantos CHECK canônicos de comprimento (char_length(<col>) <= <int>, lido pela árvore) há nas tabelas de public
create function pg_temp.f66b_canonicos() returns bigint
language sql stable as $f$
  select count(*)
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid and c.relnamespace = 'public'::regnamespace
   where k.contype = 'c' and cardinality(k.conkey) = 1
     and k.conbin::text ~ (
       '^\{OPEXPR :opno ' || '<=(integer,integer)'::regoperator::oid ||
       ' [^{}]*:args \(\{FUNCEXPR :funcid ' || 'pg_catalog.char_length(text)'::regprocedure::oid ||
       ' [^{}]*:args \(\{VAR :varno 1 :varattno ' || k.conkey[1] ||
       ' [^{}]*\}\) [^{}]*\} \{CONST :consttype 23 [^{}]*:constisnull false [^{}]*\}\) [^{}]*\}$')
$f$;

select pg_temp.f66b_impressao_checks() as checks_antes,
       pg_temp.f66b_canonicos()        as canonicos_antes
\gset

\ir ../rollback/F66B-desfaz.sql

select pg_temp.f66b_impressao_checks() as checks_depois,
       pg_temp.f66b_canonicos()        as canonicos_depois,
       (select count(*) from pg_constraint
         where contype = 'c' and conname in ('anotacao_texto_len', 'unidades_apelidos_apelido_tamanho')) as anteriores_depois
\gset

-- rb4: de novo — o mesmo arquivo, sobre o banco já desfeito
\ir ../rollback/F66B-desfaz.sql

select pg_temp.f66b_impressao_checks() as de_novo
\gset

select set_config('f66brb.checks_antes',      :'checks_antes',      false),
       set_config('f66brb.canonicos_antes',   :'canonicos_antes',   false),
       set_config('f66brb.checks_depois',     :'checks_depois',     false),
       set_config('f66brb.canonicos_depois',  :'canonicos_depois',  false),
       set_config('f66brb.anteriores_depois', :'anteriores_depois', false),
       set_config('f66brb.de_novo',           :'de_novo',           false);

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;
  -- AS CHECK DE public ANTES DA 0181: a cadeia 0001–0180 dá 36 CHECK, e este md5 (medido na mesa, PG 17.5, e
  -- conferido no CI — docs/f66b-evidencias/H-rollback/). É a mesma lista dos dois bancos vivos (a impressão "antes" da
  -- Frente A, quando o conector alcançar os projetos).
  k_checks_antes_0181 constant text := '36:f921131b4bf0a4c7635606c14a29f790';
  v_antes      text := current_setting('f66brb.checks_antes');
  v_can_antes  bigint := current_setting('f66brb.canonicos_antes')::bigint;
  v_depois     text := current_setting('f66brb.checks_depois');
  v_can_depois bigint := current_setting('f66brb.canonicos_depois')::bigint;
  v_anteriores bigint := current_setting('f66brb.anteriores_depois')::bigint;
  v_de_novo    text := current_setting('f66brb.de_novo');
begin
  raise notice '(medição) CHECK de public antes/depois do rollback: % → %; canônicos de comprimento % → %',
    v_antes, v_depois, v_can_antes, v_can_depois;

  if pg_temp.assert_zero_de('rb0 antes do rollback, os 65 CHECK de comprimento da F66B existem (101 CHECK em public)' ||
       case when v_can_antes <> 65 or split_part(v_antes, ':', 1) <> '101'
            then ' — canônicos ' || v_can_antes || ', CHECK ' || split_part(v_antes, ':', 1) else '' end,
       (case when v_can_antes = 65 then 0 else 1 end) + (case when split_part(v_antes, ':', 1) = '101' then 0 else 1 end), 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb1 depois do rollback, nenhum CHECK canônico de comprimento sobra' ||
       case when v_can_depois <> 0 then ' — sobraram ' || v_can_depois else '' end,
       least(v_can_depois, 65), 65) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb2 as CHECK de public depois do rollback são as de ANTES da 0181 (contagem e md5 do pg_get_constraintdef)' ||
       case when v_depois is distinct from k_checks_antes_0181 then ' — ' || coalesce(v_depois, '∅') || ', esperado ' || k_checks_antes_0181 else '' end,
       case when v_depois = k_checks_antes_0181 then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb3 as de comprimento anteriores à F66B (anotacao_texto_len, unidades_apelidos_apelido_tamanho) ficaram' ||
       case when v_anteriores <> 2 then ' — ' || v_anteriores || ' de 2' else '' end,
       2 - least(v_anteriores, 2), 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  if pg_temp.assert_zero_de('rb4 o rollback rodado de novo não muda nada (idempotente)' ||
       case when v_de_novo is distinct from v_depois then ' — mudou: ' || coalesce(v_de_novo, '∅') else '' end,
       case when v_de_novo = v_depois then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM f66b_rollback: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
