-- =============================================================
-- Roteiro de teste: A UNICIDADE POR EMPRESA (F65, 23/09/2026) — a sabotagem B
-- =============================================================
-- A F65 faz toda unicidade de NEGÓCIO valer por empresa: nomes que não podem repetir (filial, tipo, colaborador,
-- item, kit, apelido, motivo, os termos e prefixos do import, a versão do snapshot) passam a não poder repetir
-- DENTRO da mesma empresa; entre empresas, coexistem. Esta é a trava que reprova a volta, DERIVADA DO CATÁLOGO
-- (`pg_index`), nunca de uma lista de nomes à mão:
--   U1 — todo índice único (e toda PK) de uma tabela de `k_negocio` tem `empresa_id` como COLUNA SIMPLES da chave,
--        OU é uma PK EXATAMENTE sobre `(id)` (identidade global por tabela: uuid ou identity — por definição única em
--        todo o sistema), OU está na lista nominal dos "por tenant de forma implícita" (`k_unicidade_implicita`, com o
--        motivo de cada um). Os índices de EXPRESSÃO (`indkey[k] = 0`) têm as colunas lidas pela definição
--        (`pg_get_indexdef(índice, k, true)`), e `empresa_id` dentro de uma expressão NÃO conta — só como coluna. Os
--        PARCIAIS (`indpred`) valem só no recorte, e a chave do recorte tem de conter `empresa_id` do mesmo jeito.
--   U2 — a lista nominal não guarda fantasma: cada nome existe, é único, e NÃO tem `empresa_id` (se ganhou, sai da
--        lista);
--   U3 — o leitor enxerga o que diz enxergar (a guarda da guarda): entre os únicos das 20 há índices de EXPRESSÃO e
--        PARCIAIS, e a coluna de expressão é lida pela definição (nenhuma coluna sai vazia).
-- Antes das migrations da F65 ela reprova pelos catorze nomes do fato 7 (os treze da tabela e o índice do snapshot da
-- 0013) — a trava que nasceu vermelha, docs/f65-evidencias/B-travas/.
--
-- SÓ LEITURA de catálogo — dispensa `begin/rollback`. `k_negocio` é a CÓPIA da fonte única
-- (supabase/tests/catalogo_policies.sql); o describe 14 de src/lib/validators/catalogos-seguranca.test.ts amarra as
-- duas e a lista nominal daqui.
-- =============================================================

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;
  v_cnt    bigint;
  v_univ   bigint;
  v_lista  text;
  v_expr   bigint;
  v_parc   bigint;

  -- A tabela-verdade de negócio — CÓPIA de `k_negocio` de catalogo_policies.sql (o describe 14 amarra as duas).
  k_negocio text[] := array[
    'anotacoes', 'ativos', 'colaboradores', 'eventos_admin', 'filiais',
    'import_logs', 'import_prefixos_patrimonio', 'import_termos_categoria',
    'import_termos_estado', 'itens', 'kits_modelos', 'lancamentos_item',
    'motivos', 'movimentacoes', 'pendencias_item', 'relatorios_gerados',
    'senhas_acesso', 'termos_gerados', 'tipos_item', 'unidades_apelidos'
  ];

  -- OS ÚNICOS "POR TENANT DE FORMA IMPLÍCITA" (fato 7) — a chave carrega um id ou uuid GLOBAL que já determina a
  -- empresa, ou é identidade global; fonte única, cada um com o motivo:
  --   · ativos_patrimonio_service_tag_uidx      (filial_id, patrimonio, coalesce(service_tag,''))  — `filial_id` é id
  --       global e a FK composta `ativos_filial_id_fkey` o prende à empresa do ativo: por filial é por empresa (0091);
  --   · ativos_service_tag_sem_patrimonio_uidx  (filial_id, coalesce(service_tag,'')) parcial      — idem (0091);
  --   · termos_gerados_tipo_movimentacao_ids_key (tipo, movimentacao_ids)                          — `movimentacao_ids`
  --       é `uuid[]` de movimentações, e o gatilho `termos_gerados_ids_da_empresa` (F65) as prende à empresa do termo;
  --   · movimentacoes_ordem_uidx                (ordem)                                           — a identidade GLOBAL
  --       de inserção da movimentação (F53), uma sequência só para o sistema: única em todo ele por construção;
  --   · lanc_item_estorna_uidx                  (estorna_id) parcial                              — `estorna_id` é o uuid
  --       do lançamento estornado, e a FK composta `lancamentos_item_estorna_id_fkey` o prende à mesma empresa;
  --   · relatorios_gerados_periodo_de_periodo_ate_filial_id_versao_key (periodo_de, periodo_ate, filial_id, versao)
  --       — (0010) `filial_id` não nulo determina a empresa (a FK composta `relatorios_gerados_filial_id_fkey`), e o nulo
  --       (o Consolidado) não colide com nulo; quem cobre o Consolidado POR EMPRESA é
  --       `relatorios_gerados_periodo_filial_versao_uidx` (0171), que tem `empresa_id`.
  k_unicidade_implicita text[] := array[
    'ativos_patrimonio_service_tag_uidx', 'ativos_service_tag_sem_patrimonio_uidx',
    'termos_gerados_tipo_movimentacao_ids_key', 'movimentacoes_ordem_uidx', 'lanc_item_estorna_uidx',
    'relatorios_gerados_periodo_de_periodo_ate_filial_id_versao_key'
  ];
begin
  -- As colunas de cada índice único das 20, na ordem: a coluna pelo nome, a EXPRESSÃO pela definição (indkey = 0).
  with u as (
    select c.relname::text as tabela, ic.relname::text as nome, i.indisprimary as pk, i.indpred is not null as parcial,
           pg_get_indexdef(i.indexrelid) as def,
           (select array_agg(case when x.n = 0 then 'expr:' || pg_get_indexdef(i.indexrelid, x.o::int, true)
                                  else (select a.attname::text from pg_attribute a where a.attrelid = i.indrelid and a.attnum = x.n) end
                             order by x.o)
              from unnest(i.indkey::int2[]) with ordinality as x(n, o)
             where x.o <= i.indnkeyatts) as cols
      from pg_index i
      join pg_class ic on ic.oid = i.indexrelid
      join pg_class c on c.oid = i.indrelid
     where c.relnamespace = 'public'::regnamespace and c.relname = any (k_negocio)
       and i.indisunique
  )
  select count(*),
         count(*) filter (where not ('empresa_id' = any (u.cols))
                            and not (u.pk and u.cols = array['id'])
                            and not (u.nome = any (k_unicidade_implicita))),
         coalesce(string_agg(u.nome || ' [' || array_to_string(u.cols, ', ') || case when u.parcial then ', parcial' else '' end || ']', '; ' order by u.nome)
                    filter (where not ('empresa_id' = any (u.cols))
                              and not (u.pk and u.cols = array['id'])
                              and not (u.nome = any (k_unicidade_implicita))), ''),
         count(*) filter (where exists (select 1 from unnest(u.cols) as c(x) where c.x like 'expr:%')),
         count(*) filter (where u.parcial)
    into v_univ, v_cnt, v_lista, v_expr, v_parc
    from u;
  raise notice '(medição) U1: % índices únicos nas 20 tabelas de negócio · % com expressão · % parciais', v_univ, v_expr, v_parc;
  if pg_temp.assert_zero_de(
       'U1 todo índice único de tabela de negócio tem empresa_id na chave (ou é a PK (id), ou está na lista nominal dos implícitos)' ||
       case when v_cnt > 0 then ' — global: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- U2 — a lista nominal não guarda fantasma
  select count(*), coalesce(string_agg(x, '; ' order by x), '')
    into v_cnt, v_lista
    from (
      select n || ' (não existe como índice único de negócio)' as x
        from unnest(k_unicidade_implicita) as n
       where not exists (select 1 from pg_index i join pg_class ic on ic.oid = i.indexrelid join pg_class c on c.oid = i.indrelid
                          where ic.relname = n and i.indisunique and c.relname = any (k_negocio)
                            and c.relnamespace = 'public'::regnamespace)
      union all
      select n || ' (tem empresa_id — sai da lista)'
        from unnest(k_unicidade_implicita) as n
       where exists (select 1 from pg_index i join pg_class ic on ic.oid = i.indexrelid
                      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey::int2[])
                     where ic.relname = n and a.attname = 'empresa_id')
      union all
      select n || ' (repetido)' from unnest(k_unicidade_implicita) as n group by n having count(*) > 1
    ) s;
  if pg_temp.assert_zero_de(
       'U2 a lista nominal dos implícitos (k_unicidade_implicita) não guarda fantasma' ||
       case when v_cnt > 0 then ' — ' || v_lista else '' end,
       v_cnt, array_length(k_unicidade_implicita, 1)::bigint) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- U3 — a guarda da guarda: há expressão e parcial no universo, e nenhuma coluna saiu vazia
  select count(*) filter (where cols is null or exists (select 1 from unnest(cols) as c(x) where x is null or x in ('', 'expr:')))
    into v_cnt
    from (
      select (select array_agg(case when x.n = 0 then 'expr:' || pg_get_indexdef(i.indexrelid, x.o::int, true)
                                    else (select a.attname::text from pg_attribute a where a.attrelid = i.indrelid and a.attnum = x.n) end
                               order by x.o)
                from unnest(i.indkey::int2[]) with ordinality as x(n, o)
               where x.o <= i.indnkeyatts) as cols
        from pg_index i join pg_class c on c.oid = i.indrelid
       where c.relnamespace = 'public'::regnamespace and c.relname = any (k_negocio) and i.indisunique
    ) s;
  if pg_temp.assert_zero_de(
       'U3 o leitor enxerga a expressão (indkey = 0) e o parcial: há índices de cada tipo, e nenhuma coluna sai vazia' ||
       case when v_expr < 3 or v_parc < 2 then ' — expressão ' || v_expr || ' (esperado ≥ 3), parciais ' || v_parc || ' (esperado ≥ 2)' else '' end,
       v_cnt + (case when v_expr >= 3 then 0 else 1 end) + (case when v_parc >= 2 then 0 else 1 end), v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM unicidade_por_empresa: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;
