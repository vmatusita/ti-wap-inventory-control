-- =============================================================
-- Roteiro de teste: A FORMA MULTIEMPRESA DAS RELAÇÕES (F65, 23/09/2026) — a sabotagem A
-- =============================================================
-- A F65 faz o banco recusar, SOZINHO, o dado cruzado entre empresas: toda relação entre duas tabelas de negócio
-- passa a carregar a empresa — FK COMPOSTA `(empresa_id, x) → (empresa_id, id)` —, e o pai tem o `unique (empresa_id,
-- id)` que a aceita. Esta é a trava que reprova a volta, DERIVADA DO CATÁLOGO (`pg_constraint`), nunca de uma lista
-- de 23 nomes à mão:
--   F1 — toda FK entre duas tabelas de `k_negocio` é COMPOSTA e começa por `empresa_id` NOS DOIS LADOS (a primeira
--        coluna do filho e a primeira do pai são as `empresa_id` deles);
--   F2 — toda FK entre duas tabelas de negócio é VALIDADA (uma composta deixada `not valid` reprova);
--   F3 — todo pai referenciado por uma FK de negócio tem unique (ou PK) EXATAMENTE sobre `(empresa_id, <a coluna que a
--        FK referencia>)` — sem ele o Postgres nem aceita a composta; hoje o têm `filiais` e ninguém mais;
--   F4 — não sobra FK SIMPLES entre tabelas de negócio;
--   F5 — nenhuma coluna de negócio é coberta por DUAS FKs para o mesmo pai (a composta ACRESCENTADA ao lado da simples,
--        a forma que o PostgREST veria ambígua — PGRST201), e os pares de tabelas de negócio com mais de uma relação
--        são EXATAMENTE os da lista nominal (`k_pares_com_duas_relacoes`);
--   F6 — toda FK de QUALQUER tabela de `public` que referencia uma tabela de negócio é composta com `empresa_id`, fora
--        da lista nominal (`k_fk_fora_da_forma`);
--   F7 — `termos_gerados` (que guarda os ids em `uuid[]`, onde FK não alcança) tem a coerência de empresa pela forma da
--        decisão 8 do PLAN-F65: o gatilho `termos_gerados_ids_da_empresa`, BEFORE INSERT OR UPDATE OF movimentacao_ids,
--        ativo_ids, empresa_id, por linha, executando `public.termo_da_empresa()` (INVOKER), habilitado;
--   F8 — as listas nominais não guardam fantasma.
-- As FKs para `empresas` (a raiz) e para `profiles` (a identidade da conta) ficam SIMPLES por definição: não
-- referenciam tabela de negócio, e F6 não as vê.
--
-- Antes das migrations da F65 ela reprova pelos 23 nomes (F1/F4), pelos sete pais e por `motivos` (F3), e pelo gatilho
-- de `termos_gerados` que não existe (F7) — a trava que nasceu vermelha, docs/f65-evidencias/B-travas/.
--
-- SÓ LEITURA de catálogo — não grava nada, dispensa `begin/rollback` (como `catalogo_policies.sql`). `k_negocio` é a
-- CÓPIA da fonte única (supabase/tests/catalogo_policies.sql); o describe 14 de
-- src/lib/validators/catalogos-seguranca.test.ts reprova se as duas divergirem, e amarra as listas nominais daqui.
-- =============================================================

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;
  v_cnt    bigint;
  v_univ   bigint;
  v_lista  text;

  -- A tabela-verdade de negócio — CÓPIA de `k_negocio` de catalogo_policies.sql (o describe 14 amarra as duas).
  k_negocio text[] := array[
    'anotacoes', 'ativos', 'colaboradores', 'eventos_admin', 'filiais',
    'import_logs', 'import_prefixos_patrimonio', 'import_termos_categoria',
    'import_termos_estado', 'itens', 'kits_modelos', 'lancamentos_item',
    'motivos', 'movimentacoes', 'pendencias_item', 'relatorios_gerados',
    'senhas_acesso', 'termos_gerados', 'tipos_item', 'unidades_apelidos'
  ];

  -- AS FKs QUE REFERENCIAM UMA TABELA DE NEGÓCIO E FICAM SIMPLES DE PROPÓSITO (fonte única; cada uma com o motivo):
  --   · operador_filiais_filial_id_fkey — `operador_filiais` é INFRA (o vínculo de escrita de uma membership; ver
  --     `k_infra`). A F62 (0156) pôs, AO LADO desta simples `ON DELETE RESTRICT`, a composta
  --     `operador_filiais_filial_da_empresa_fk` (membership e filial da mesma empresa). Ninguém embute
  --     `operador_filiais`→`filiais` pelo PostgREST (censo da F65), e derrubá-la mexeria no rollback da F62. Fica.
  k_fk_fora_da_forma text[] := array['operador_filiais_filial_id_fkey'];

  -- OS PARES DE TABELAS DE NEGÓCIO COM MAIS DE UMA RELAÇÃO, DE PROPÓSITO (fonte única; cada um com o motivo):
  --   · movimentacoes→filiais — a ORIGEM (`filial_id`) e o DESTINO (`filial_destino_id`) da transferência: duas
  --     colunas, duas relações; todo embed do par usa a dica pelo nome da FK (censo da F65).
  k_pares_com_duas_relacoes text[] := array['movimentacoes→filiais'];
begin
  -- F1 — composta, começando por empresa_id nos dois lados
  with fk as (
    select k.conname::text as nome, k.conkey, k.confkey, k.conrelid, k.confrelid
      from pg_constraint k
      join pg_class f on f.oid = k.conrelid
      join pg_class p on p.oid = k.confrelid
     where k.contype = 'f'
       and f.relnamespace = 'public'::regnamespace and p.relnamespace = 'public'::regnamespace
       and f.relname = any (k_negocio) and p.relname = any (k_negocio)
  )
  select count(*),
         count(*) filter (where not (
           cardinality(fk.conkey) > 1
           and fk.conkey[1] = (select a.attnum from pg_attribute a where a.attrelid = fk.conrelid and a.attname = 'empresa_id' and not a.attisdropped)
           and fk.confkey[1] = (select a.attnum from pg_attribute a where a.attrelid = fk.confrelid and a.attname = 'empresa_id' and not a.attisdropped))),
         coalesce(string_agg(fk.nome, ', ' order by fk.nome) filter (where not (
           cardinality(fk.conkey) > 1
           and fk.conkey[1] = (select a.attnum from pg_attribute a where a.attrelid = fk.conrelid and a.attname = 'empresa_id' and not a.attisdropped)
           and fk.confkey[1] = (select a.attnum from pg_attribute a where a.attrelid = fk.confrelid and a.attname = 'empresa_id' and not a.attisdropped))), '')
    into v_univ, v_cnt, v_lista
    from fk;
  if pg_temp.assert_zero_de(
       'F1 toda FK entre duas tabelas de negócio é COMPOSTA e começa por empresa_id nos dois lados' ||
       case when v_cnt > 0 then ' — fora da forma: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- F2 — validada
  select count(*), count(*) filter (where not k.convalidated),
         coalesce(string_agg(k.conname, ', ' order by k.conname) filter (where not k.convalidated), '')
    into v_univ, v_cnt, v_lista
    from pg_constraint k
    join pg_class f on f.oid = k.conrelid
    join pg_class p on p.oid = k.confrelid
   where k.contype = 'f'
     and f.relnamespace = 'public'::regnamespace and p.relnamespace = 'public'::regnamespace
     and f.relname = any (k_negocio) and p.relname = any (k_negocio);
  if pg_temp.assert_zero_de(
       'F2 toda FK entre duas tabelas de negócio é VALIDADA (nenhuma composta ficou not valid)' ||
       case when v_cnt > 0 then ' — not valid: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- F3 — o pai tem unique/PK EXATAMENTE sobre (empresa_id, a coluna que a FK referencia)
  with alvo as (
    select distinct p.oid as pai, p.relname::text as tabela,
           (select a.attname::text from pg_attribute a
             where a.attrelid = k.confrelid
               and a.attnum = (select x from unnest(k.confkey) as x
                                where x <> coalesce((select b.attnum from pg_attribute b
                                                      where b.attrelid = k.confrelid and b.attname = 'empresa_id'), -1)
                                limit 1)) as coluna
      from pg_constraint k
      join pg_class f on f.oid = k.conrelid
      join pg_class p on p.oid = k.confrelid
     where k.contype = 'f'
       and f.relnamespace = 'public'::regnamespace and p.relnamespace = 'public'::regnamespace
       and f.relname = any (k_negocio) and p.relname = any (k_negocio)
  ), coberto as (
    select a.tabela, a.coluna,
           exists (select 1 from pg_index i
                    where i.indrelid = a.pai and i.indisunique and i.indpred is null and i.indexprs is null
                      and i.indnatts = 2
                      and (select array_agg(att.attname::text order by o.n)
                             from unnest(i.indkey::int2[]) with ordinality as o(att_n, n)
                             join pg_attribute att on att.attrelid = i.indrelid and att.attnum = o.att_n)
                          = array['empresa_id', a.coluna]) as ok
      from alvo a
  )
  select count(*), count(*) filter (where not ok),
         coalesce(string_agg(tabela || '(empresa_id, ' || coalesce(coluna, '?') || ')', ', ' order by tabela) filter (where not ok), '')
    into v_univ, v_cnt, v_lista
    from coberto;
  if pg_temp.assert_zero_de(
       'F3 todo pai de FK de negócio tem unique ou PK EXATAMENTE sobre (empresa_id, a coluna referenciada)' ||
       case when v_cnt > 0 then ' — sem ele: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- F4 — nenhuma FK simples entre tabelas de negócio
  select count(*), count(*) filter (where cardinality(k.conkey) = 1),
         coalesce(string_agg(k.conname, ', ' order by k.conname) filter (where cardinality(k.conkey) = 1), '')
    into v_univ, v_cnt, v_lista
    from pg_constraint k
    join pg_class f on f.oid = k.conrelid
    join pg_class p on p.oid = k.confrelid
   where k.contype = 'f'
     and f.relnamespace = 'public'::regnamespace and p.relnamespace = 'public'::regnamespace
     and f.relname = any (k_negocio) and p.relname = any (k_negocio);
  if pg_temp.assert_zero_de(
       'F4 não sobra FK SIMPLES entre tabelas de negócio' ||
       case when v_cnt > 0 then ' — simples: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- F5 — nenhuma coluna de negócio com duas FKs para o mesmo pai; e os pares com mais de uma relação são os nominais
  with fk as (
    select k.conname::text as nome, f.relname::text as filho, p.relname::text as pai,
           (select array_agg(a.attname::text order by a.attname)
              from unnest(k.conkey) as x(n) join pg_attribute a on a.attrelid = k.conrelid and a.attnum = x.n
             where a.attname <> 'empresa_id') as colunas
      from pg_constraint k
      join pg_class f on f.oid = k.conrelid
      join pg_class p on p.oid = k.confrelid
     where k.contype = 'f'
       and f.relnamespace = 'public'::regnamespace and p.relnamespace = 'public'::regnamespace
       and f.relname = any (k_negocio) and p.relname = any (k_negocio)
  ), dup as (
    select filho || '.' || array_to_string(colunas, ',') || '→' || pai || ' (' || string_agg(nome, ' + ' order by nome) || ')' as x
      from fk group by filho, colunas, pai having count(*) > 1
  ), pares as (
    select filho || '→' || pai as par from fk group by filho, pai having count(*) > 1
  ), fora as (
    select 'coluna com duas FKs: ' || x as y from dup
    union all
    select 'par com mais de uma relação fora da lista: ' || par from pares where not (par = any (k_pares_com_duas_relacoes))
    union all
    select 'par nominal que não tem mais de uma relação: ' || n from unnest(k_pares_com_duas_relacoes) as n
     where n not in (select par from pares)
  )
  select (select count(*) from fk), count(*), coalesce(string_agg(y, '; ' order by y), '')
    into v_univ, v_cnt, v_lista
    from fora;
  if pg_temp.assert_zero_de(
       'F5 nenhuma coluna de negócio tem duas FKs para o mesmo pai, e os pares com mais de uma relação são só os nominais' ||
       case when v_cnt > 0 then ' — ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- F6 — toda FK de public que referencia uma tabela de negócio é composta com empresa_id, fora da lista nominal
  select count(*),
         count(*) filter (where not (k.conname = any (k_fk_fora_da_forma)) and not (
           cardinality(k.conkey) > 1
           and k.conkey[1] = (select a.attnum from pg_attribute a where a.attrelid = k.conrelid and a.attname = 'empresa_id' and not a.attisdropped)
           and k.confkey[1] = (select a.attnum from pg_attribute a where a.attrelid = k.confrelid and a.attname = 'empresa_id' and not a.attisdropped))),
         coalesce(string_agg(f.relname || '.' || k.conname, ', ' order by k.conname) filter (where not (k.conname = any (k_fk_fora_da_forma)) and not (
           cardinality(k.conkey) > 1
           and k.conkey[1] = (select a.attnum from pg_attribute a where a.attrelid = k.conrelid and a.attname = 'empresa_id' and not a.attisdropped)
           and k.confkey[1] = (select a.attnum from pg_attribute a where a.attrelid = k.confrelid and a.attname = 'empresa_id' and not a.attisdropped))), '')
    into v_univ, v_cnt, v_lista
    from pg_constraint k
    join pg_class f on f.oid = k.conrelid
    join pg_class p on p.oid = k.confrelid
   where k.contype = 'f'
     and f.relnamespace = 'public'::regnamespace and p.relnamespace = 'public'::regnamespace
     and p.relname = any (k_negocio);
  if pg_temp.assert_zero_de(
       'F6 toda FK de public que referencia uma tabela de negócio é composta com empresa_id (fora da lista nominal)' ||
       case when v_cnt > 0 then ' — fora da forma: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- F7 — termos_gerados: o gatilho de coerência de empresa
  select count(*)
    into v_cnt
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = 'public.termos_gerados'::regclass and not t.tgisinternal
     and t.tgname = 'termos_gerados_ids_da_empresa'
     and p.oid = to_regprocedure('public.termo_da_empresa()')
     and not p.prosecdef
     and t.tgenabled <> 'D'
     and (t.tgtype & 1) = 1                    -- FOR EACH ROW
     and (t.tgtype & 2) = 2                    -- BEFORE
     and (t.tgtype & 4) = 4                    -- INSERT
     and (t.tgtype & 16) = 16                  -- UPDATE
     and (select array_agg(a.attname::text order by a.attname)
            from unnest(t.tgattr::int2[]) as x(n) join pg_attribute a on a.attrelid = t.tgrelid and a.attnum = x.n)
         = array['ativo_ids', 'empresa_id', 'movimentacao_ids'];
  if pg_temp.assert_zero_de(
       'F7 termos_gerados tem o gatilho de coerência de empresa (termos_gerados_ids_da_empresa → termo_da_empresa, INVOKER, BEFORE INSERT OR UPDATE OF movimentacao_ids, ativo_ids, empresa_id, por linha, habilitado)',
       1 - least(v_cnt, 1), 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- F8 — as listas nominais não guardam fantasma
  select count(*), coalesce(string_agg(n, ', ' order by n), '')
    into v_cnt, v_lista
    from unnest(k_fk_fora_da_forma) as n
   where not exists (select 1 from pg_constraint k where k.contype = 'f' and k.conname = n
                        and k.connamespace = 'public'::regnamespace);
  if pg_temp.assert_zero_de(
       'F8 toda FK da lista nominal (k_fk_fora_da_forma) existe' ||
       case when v_cnt > 0 then ' — não existe: ' || v_lista else '' end,
       v_cnt, array_length(k_fk_fora_da_forma, 1)::bigint) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM forma_multiempresa: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;
