-- =============================================================================
-- impressao-policies.sql — F66 · Frente A — as policies ANTES e DEPOIS, o MESMO texto nos dois bancos
-- =============================================================================
-- Derivado do instrumento da F64 (`docs/f64-evidencias/impressao-policies.sql`, reusado pela F65), com três
-- acréscimos que a F66 precisa (decisão 14 do PLAN-F66):
--
--   · `vivas`          — o md5 da F64, INALTERADO (a lista ordenada tabela|policy|comando|papéis|permissiva|qual|
--                        with_check, por schema, sem normalizar espaço): o "antes" da F66 tem de dar o md5 do "depois"
--                        da F65 — a prova de que ninguém mexeu em policy entre as fases;
--   · `por_policy`     — o md5 de `qual` e de `with_check` de CADA uma das 62, com comando, papéis e permissiva:
--                        é o que separa "mudou como planejado" (as 51) de "mudou" (as 11 que não podem mudar);
--   · `texto_das_51`   — o TEXTO normalizado (`pg_policies.qual`/`with_check`) das policies de `public` cuja tabela
--                        TEM `empresa_id` (lida do catálogo, nunca de lista): é o que o rollback devolve, e é texto de
--                        ESQUEMA, não de dado;
--   · as contagens     — tabelas com a coluna; policies nelas; quantas citam `empresa_id`; quantas são `to
--                        authenticated`; o md5 das 11 que a fase NÃO toca (as 8 de Storage e as 3 sem a coluna).
--
-- Rodada pelo MCP (execute_sql), SÓ LEITURA, nos DOIS bancos, antes do primeiro apply e depois do último — com ESTE
-- MESMO TEXTO. SÓ CATÁLOGO: nenhum dado de linha, nenhum id, nenhum nome de pessoa.
-- =============================================================================
select set_config('transaction_read_only', 'on', true);

with pol as (
  select p.schemaname, p.tablename, p.policyname, p.cmd, p.roles::text as roles,
         p.permissive, coalesce(p.qual, '-') as qual, coalesce(p.with_check, '-') as wc,
         exists (select 1 from pg_attribute a
                  where a.attrelid = (quote_ident(p.schemaname) || '.' || quote_ident(p.tablename))::regclass
                    and a.attname = 'empresa_id' and not a.attisdropped) as tem_coluna
    from pg_policies p
   where p.schemaname in ('public', 'storage')
)
select jsonb_pretty(jsonb_build_object(
  -- o ENCHIMENTO do canal: o MCP devolve inline a resposta pequena e grava em arquivo (tool-results) a grande; com ele
  -- a resposta sempre cai em arquivo, e a evidência é EXTRAÍDA dele por script, nunca transcrita. A extração o descarta.
  '_canal', repeat('.', 120000),
  'vivas', (
    select jsonb_object_agg(schemaname, jsonb_build_object('n', n, 'md5', h))
      from (select schemaname, count(*) as n,
                   md5(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || roles || '|' ||
                                  permissive || '|' || qual || '|' || wc, E'\n'
                                  order by tablename, policyname)) as h
              from pol
             group by schemaname) s),
  'por_policy', (
    select jsonb_object_agg(schemaname || '.' || tablename || ' / ' || policyname, jsonb_build_object(
             'cmd', cmd, 'roles', roles, 'permissive', permissive,
             'md5_qual', md5(qual), 'md5_with_check', md5(wc)))
      from pol),
  'texto_das_publicas_com_a_coluna', (
    select jsonb_object_agg(tablename || ' / ' || policyname, jsonb_build_object('qual', qual, 'with_check', wc))
      from pol where schemaname = 'public' and tem_coluna),
  'contagens', (
    select jsonb_build_object(
      'public', count(*) filter (where schemaname = 'public'),
      'storage', count(*) filter (where schemaname = 'storage'),
      'tabelas_de_public_com_a_coluna_e_policy', count(distinct tablename) filter (where schemaname = 'public' and tem_coluna),
      'policies_de_public_com_a_coluna', count(*) filter (where schemaname = 'public' and tem_coluna),
      'policies_de_public_sem_a_coluna', count(*) filter (where schemaname = 'public' and not tem_coluna),
      'citam_empresa_id', count(*) filter (where schemaname = 'public' and (qual ~ '\mempresa_id\M' or wc ~ '\mempresa_id\M')),
      'citam_pode_escrever_filial', count(*) filter (where qual ~ '\mpode_escrever_filial\M' or wc ~ '\mpode_escrever_filial\M'),
      'citam_unidades_de_escrita', count(*) filter (where qual ~ '\munidades_de_escrita\M' or wc ~ '\munidades_de_escrita\M'),
      'to_authenticated', count(*) filter (where roles = '{authenticated}'),
      'permissivas', count(*) filter (where permissive = 'PERMISSIVE'))
      from pol),
  'as_11_que_nao_mudam', (
    select jsonb_build_object('n', count(*),
             'md5', md5(string_agg(schemaname || '|' || tablename || '|' || policyname || '|' || cmd || '|' || roles || '|' ||
                                   permissive || '|' || qual || '|' || wc, E'\n' order by schemaname, tablename, policyname)))
      from pol where schemaname = 'storage' or not tem_coluna)
)) as impressao;
