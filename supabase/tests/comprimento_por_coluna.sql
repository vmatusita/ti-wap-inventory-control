-- =============================================================
-- Roteiro de teste: O COMPRIMENTO É REGRA DO BANCO (F66B, 12/11/2026) — a sabotagem A
-- =============================================================
-- A F66B põe um teto de comprimento NO BANCO em toda coluna de texto das 20 tabelas de negócio (migrations 0181–0184,
-- docs/PLAN-F66B.md). Esta é a trava que reprova a volta, DERIVADA DO CATÁLOGO — nunca de uma lista de 65 colunas à mão:
--   C0 — as 20 de `k_negocio` existem (a cópia não guarda fantasma);
--   C1 — toda coluna `text`/`varchar`/`bpchar` (ou domínio sobre elas) das 20, viva (`attisdropped = false`), tem um
--        CHECK com o nome esperado — `<tabela>_<coluna>_tamanho`, ou o alternativo declarado em
--        `k_comprimento_nome_alternativo` —, ou está na lista nominal de exceções;
--   C2 — esse CHECK tem a FORMA canônica, lida pela ÁRVORE (`pg_constraint.conbin`), não pelo texto:
--        `OPEXPR <=(int4,int4)` cujo primeiro argumento é `FUNCEXPR char_length(text)` sobre o `VAR` DESTA coluna e o
--        segundo é uma `CONST` int4 não nula. `length(col)`, `octet_length(col)`, `character_length(col)`,
--        `char_length(btrim(col))` e `N >= char_length(col)` são OUTRA árvore (outro funcid/opno) e reprovam;
--   C3 — esse CHECK está validado (`convalidated`);
--   C4 — o teto do CHECK é o da fonte única (`k_comprimento_teto`, cópia de src/lib/validators/tetos-coluna.ts que a
--        trava de mesa `tetos-coluna.test.ts` amarra); coluna sem teto na cópia reprova;
--   C5 — nenhuma coluna tem MAIS DE UM CHECK canônico (um teto, uma constraint);
--   C6 — a cópia dos tetos não guarda fantasma (toda entrada é coluna viva do universo);
--   C7 — as exceções nominais conferidas nos dois sentidos: exceção sem coluna viva reprova (7a), e exceção que TEM o
--        CHECK canônico reprova (7b);
--   C8 — todo nome alternativo é justificado: a coluna existe, e o nome do padrão PERTENCE a uma constraint de outra
--        forma (a razão de existir do alternativo — renomear é proibido, o nome é contrato de tradução);
--   C9 — nenhum CHECK de comprimento das 20 (qualquer árvore que cite char_length/length/octet_length/character_length)
--        fica `not valid`.
-- E a AUTO-SABOTAGEM (S1–S6), cada uma numa subtransação desfeita: a mesma consulta, sobre o catálogo sabotado, acusa
-- exatamente a coluna sabotada — a prova de que cada asserção sabe ficar vermelha.
--
-- Antes das migrations da F66B ela reprova pelas 65 colunas sem o CHECK (C1, C4) — a trava que nasceu vermelha,
-- docs/f66b-evidencias/B-travas/.
--
-- Roda dentro de `begin; … rollback;` porque a auto-sabotagem escreve DDL (sempre desfeita). `k_negocio` é a CÓPIA da
-- fonte única (supabase/tests/catalogo_policies.sql); `k_comprimento_teto`, `k_comprimento_nome_alternativo` e
-- `k_comprimento_excecao` são amarrados à fonte TS por src/lib/validators/tetos-coluna.test.ts.
-- =============================================================

begin;

-- A forma canônica, pela árvore. Os oids saem do catálogo (nunca número cravado): char_length(text) e <=(int4,int4).
-- `[^{}]*` não atravessa nó: `char_length(btrim(x))` tem um FUNCEXPR no lugar do VAR e não casa.
create function pg_temp.f66b_canonica(p_bin pg_node_tree, p_attnum int2) returns boolean
language sql stable as $f$
  select p_bin::text ~ (
    '^\{OPEXPR :opno ' || '<=(integer,integer)'::regoperator::oid ||
    ' [^{}]*:args \(\{FUNCEXPR :funcid ' || 'pg_catalog.char_length(text)'::regprocedure::oid ||
    ' [^{}]*:args \(\{VAR :varno 1 :varattno ' || p_attnum ||
    ' [^{}]*\}\) [^{}]*\} \{CONST :consttype 23 [^{}]*:constisnull false [^{}]*\}\) [^{}]*\}$')
$f$;

-- O universo, do catálogo: as colunas de texto vivas das tabelas pedidas.
create function pg_temp.f66b_universo(p_tabelas text[])
returns table (tabela text, coluna text, relid oid, attnum int2, gerada boolean)
language sql stable as $f$
  select c.relname::text, a.attname::text, c.oid, a.attnum, a.attgenerated = 's'
    from pg_class c
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     and c.relname = any (p_tabelas)
     and (a.atttypid in ('text'::regtype, 'varchar'::regtype, 'bpchar'::regtype)
          or exists (select 1 from pg_type t
                      where t.oid = a.atttypid and t.typtype = 'd'
                        and t.typbasetype in ('text'::regtype, 'varchar'::regtype, 'bpchar'::regtype)))
$f$;

-- O estado de cada coluna do universo: o nome esperado, se a constraint existe, se é canônica, validada, o teto, e
-- quantos CHECK canônicos a coluna tem.
create function pg_temp.f66b_estado(p_tabelas text[], p_excecao text[], p_alternativo text[], p_teto text[])
returns table (tabela text, coluna text, excecao boolean, nome text, tem boolean, canonica boolean,
               validada boolean, teto int, teto_fonte int, n_canonicas int)
language sql stable as $f$
  with u as (select * from pg_temp.f66b_universo(p_tabelas)),
  e as (
    select u.*,
           (u.tabela || '.' || u.coluna) = any (p_excecao) as excecao,
           coalesce((select split_part(x, ':', 2) from unnest(p_alternativo) x
                      where split_part(x, ':', 1) = u.tabela || '.' || u.coluna),
                    u.tabela || '_' || u.coluna || '_tamanho') as nome,
           (select split_part(x, ':', 2)::int from unnest(p_teto) x
             where split_part(x, ':', 1) = u.tabela || '.' || u.coluna) as teto_fonte
      from u
  )
  select e.tabela, e.coluna, e.excecao, e.nome,
         k.oid is not null,
         coalesce(pg_temp.f66b_canonica(k.conbin, e.attnum) and k.conkey = array[e.attnum], false),
         coalesce(k.convalidated, false),
         case when pg_temp.f66b_canonica(k.conbin, e.attnum)
              then (regexp_match(pg_get_constraintdef(k.oid), '<= (\d+)\)\)( NOT VALID)?$'))[1]::int end,
         e.teto_fonte,
         (select count(*)::int from pg_constraint x
           where x.conrelid = e.relid and x.contype = 'c' and pg_temp.f66b_canonica(x.conbin, e.attnum))
    from e
    left join pg_constraint k on k.conrelid = e.relid and k.contype = 'c' and k.conname = e.nome
$f$;

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;
  v_cnt    bigint;
  v_univ   bigint;
  v_lista  text;
  v_s      bigint;
  v_erro   text;

  -- A tabela-verdade de negócio — CÓPIA de `k_negocio` de catalogo_policies.sql (tetos-coluna.test.ts amarra as duas).
  k_negocio text[] := array[
    'anotacoes', 'ativos', 'colaboradores', 'eventos_admin', 'filiais',
    'import_logs', 'import_prefixos_patrimonio', 'import_termos_categoria',
    'import_termos_estado', 'itens', 'kits_modelos', 'lancamentos_item',
    'motivos', 'movimentacoes', 'pendencias_item', 'relatorios_gerados',
    'senhas_acesso', 'termos_gerados', 'tipos_item', 'unidades_apelidos'
  ];

  -- OS TETOS — cópia da fonte única (src/lib/validators/tetos-coluna.ts); a trava de mesa amarra as duas, entrada a
  -- entrada. Mudar um número aqui sem a fonte (ou o contrário) reprova a mesa; mudar o banco sem os dois reprova a C4.
  k_comprimento_teto text[] := array[
    'colaboradores.nome:120', 'colaboradores.matricula:40', 'colaboradores.setor:80', 'colaboradores.nome_chave:360',
    'itens.nome:80', 'itens.nome_chave:240',
    'termos_gerados.tipo:40', 'termos_gerados.colaborador:200', 'termos_gerados.arquivo_path:80',
    'anotacoes.texto:2000',
    'ativos.patrimonio:60', 'ativos.patrimonio_original:60', 'ativos.marca:60', 'ativos.modelo:120',
    'ativos.service_tag:100', 'ativos.hostname:60', 'ativos.memoria:80', 'ativos.armazenamento:80',
    'ativos.processador:80', 'ativos.fornecedor:80', 'ativos.colaborador_atual:120', 'ativos.setor_atual:120',
    'ativos.pendencia:200', 'ativos.origem:40', 'ativos.observacoes:2000', 'ativos.telefone:60', 'ativos.imei:60',
    'ativos.pulsus:60',
    'movimentacoes.motivo:40', 'movimentacoes.colaborador:120', 'movimentacoes.setor:120', 'movimentacoes.chamado:80',
    'movimentacoes.observacao:500', 'movimentacoes.chamado_fornecedor:200',
    'pendencias_item.item:80', 'pendencias_item.colaborador:120', 'pendencias_item.status:40',
    'pendencias_item.desfecho:40', 'pendencias_item.observacao:500',
    'lancamentos_item.chamado:20', 'lancamentos_item.colaborador:120', 'lancamentos_item.observacao:2000',
    'import_prefixos_patrimonio.prefixo:4',
    'import_termos_categoria.termo:40', 'import_termos_categoria.rotulo:40',
    'import_termos_estado.termo:40', 'import_termos_estado.rotulo:40',
    'unidades_apelidos.apelido:80', 'unidades_apelidos.apelido_chave:240',
    'tipos_item.slug:30', 'tipos_item.rotulo:60',
    'motivos.codigo:40', 'motivos.rotulo:80',
    'kits_modelos.nome:80',
    'filiais.slug:40', 'filiais.nome:80', 'filiais.cidade:120',
    'relatorios_gerados.observacao:2000',
    'import_logs.modo:40', 'import_logs.arquivo_hash:128', 'import_logs.backup_path:120',
    'eventos_admin.acao:80', 'eventos_admin.alvo:500',
    'senhas_acesso.rotulo:80', 'senhas_acesso.hash:200'
  ];

  -- O NOME ALTERNATIVO (fonte única desta lista, com o motivo; a fonte TS NOME_ALTERNATIVO_DE_TAMANHO é amarrada a ela):
  --   · unidades_apelidos.apelido — o nome do padrão é da 0139, `char_length(btrim(apelido)) between 2 and 80`: limita
  --     o valor APARADO, e espaço nas pontas fica sem teto. Renomear é proibido (contrato de tradução). PLAN-F66B,
  --     decisão 3.
  k_comprimento_nome_alternativo text[] := array[
    'unidades_apelidos.apelido:unidades_apelidos_apelido_bruto_tamanho'
  ];

  -- AS EXCEÇÕES NOMINAIS (fonte única; arrays paralelos, o molde de definer_sem_tenant.sql): coluna de texto das 20 SEM o
  -- CHECK, com o motivo. VAZIA na F66B — toda coluna tem teto (PLAN-F66B, decisões 3 a 5). Uma entrada nova é decisão
  -- escrita: passa por esta lista, pelo motivo e pela trava de mesa.
  k_comprimento_excecao text[] := array[]::text[];
  k_comprimento_excecao_motivo text[] := array[]::text[];
begin
  if coalesce(array_length(k_comprimento_excecao, 1), 0) <> coalesce(array_length(k_comprimento_excecao_motivo, 1), 0) then
    raise exception 'k_comprimento_excecao e k_comprimento_excecao_motivo têm tamanhos diferentes — toda exceção leva motivo';
  end if;

  -- C0 — as 20 existem
  select count(*), coalesce(string_agg(n, ', ' order by n), '')
    into v_cnt, v_lista
    from unnest(k_negocio) as n
   where not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = n);
  if pg_temp.assert_zero_de(
       'C0 as 20 tabelas de k_negocio existem' || case when v_cnt > 0 then ' — não existe: ' || v_lista else '' end,
       v_cnt, array_length(k_negocio, 1)::bigint) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  select count(*) into v_univ from pg_temp.f66b_universo(k_negocio);
  raise notice 'universo: % colunas de texto nas % tabelas de negócio; % tetos na cópia; % nome(s) alternativo(s); % exceção(ões)',
    v_univ, array_length(k_negocio, 1), array_length(k_comprimento_teto, 1),
    coalesce(array_length(k_comprimento_nome_alternativo, 1), 0), coalesce(array_length(k_comprimento_excecao, 1), 0);

  -- C1 — toda coluna tem o CHECK com o nome esperado (ou é exceção)
  select count(*) filter (where not excecao and not tem), count(*),
         coalesce(string_agg(tabela || '.' || coluna, ', ' order by tabela, coluna) filter (where not excecao and not tem), '')
    into v_cnt, v_univ, v_lista
    from pg_temp.f66b_estado(k_negocio, k_comprimento_excecao, k_comprimento_nome_alternativo, k_comprimento_teto);
  if pg_temp.assert_zero_de(
       'C1 toda coluna de texto das 20 tem o CHECK de comprimento com o nome esperado' ||
       case when v_cnt > 0 then ' — sem: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- C2 — a forma canônica, pela árvore
  select count(*) filter (where tem and not canonica), count(*),
         coalesce(string_agg(nome, ', ' order by nome) filter (where tem and not canonica), '')
    into v_cnt, v_univ, v_lista
    from pg_temp.f66b_estado(k_negocio, k_comprimento_excecao, k_comprimento_nome_alternativo, k_comprimento_teto);
  if pg_temp.assert_zero_de(
       'C2 o CHECK de comprimento tem a forma char_length(<a coluna>) <= <inteiro> (lida pela árvore conbin)' ||
       case when v_cnt > 0 then ' — fora da forma: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- C3 — validada
  select count(*) filter (where tem and not validada), count(*),
         coalesce(string_agg(nome, ', ' order by nome) filter (where tem and not validada), '')
    into v_cnt, v_univ, v_lista
    from pg_temp.f66b_estado(k_negocio, k_comprimento_excecao, k_comprimento_nome_alternativo, k_comprimento_teto);
  if pg_temp.assert_zero_de(
       'C3 o CHECK de comprimento está validado (nenhum not valid)' ||
       case when v_cnt > 0 then ' — not valid: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- C4 — o teto é o da fonte
  select count(*) filter (where not excecao and (teto_fonte is null or teto is distinct from teto_fonte)), count(*),
         coalesce(string_agg(tabela || '.' || coluna || ' (banco ' || coalesce(teto::text, '∅') || ', fonte ' ||
                             coalesce(teto_fonte::text, '∅') || ')', ', ' order by tabela, coluna)
                  filter (where not excecao and (teto_fonte is null or teto is distinct from teto_fonte)), '')
    into v_cnt, v_univ, v_lista
    from pg_temp.f66b_estado(k_negocio, k_comprimento_excecao, k_comprimento_nome_alternativo, k_comprimento_teto);
  if pg_temp.assert_zero_de(
       'C4 o teto do CHECK é o da fonte única (k_comprimento_teto)' ||
       case when v_cnt > 0 then ' — divergente: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- C5 — um teto, uma constraint
  select count(*) filter (where n_canonicas > 1), count(*),
         coalesce(string_agg(tabela || '.' || coluna, ', ' order by tabela, coluna) filter (where n_canonicas > 1), '')
    into v_cnt, v_univ, v_lista
    from pg_temp.f66b_estado(k_negocio, k_comprimento_excecao, k_comprimento_nome_alternativo, k_comprimento_teto);
  if pg_temp.assert_zero_de(
       'C5 nenhuma coluna tem mais de um CHECK canônico de comprimento' ||
       case when v_cnt > 0 then ' — duplicada: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- C6 — a cópia dos tetos não guarda fantasma
  select count(*), coalesce(string_agg(x, ', ' order by x), '')
    into v_cnt, v_lista
    from unnest(k_comprimento_teto) as x
   where not exists (select 1 from pg_temp.f66b_universo(k_negocio) u
                      where u.tabela || '.' || u.coluna = split_part(x, ':', 1));
  if pg_temp.assert_zero_de(
       'C6 toda entrada de k_comprimento_teto é coluna de texto viva das 20' ||
       case when v_cnt > 0 then ' — fantasma: ' || v_lista else '' end,
       v_cnt, array_length(k_comprimento_teto, 1)::bigint) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- C7a — exceção sem coluna viva
  select count(*), coalesce(string_agg(x, ', ' order by x), '')
    into v_cnt, v_lista
    from unnest(k_comprimento_excecao) as x
   where not exists (select 1 from pg_temp.f66b_universo(k_negocio) u where u.tabela || '.' || u.coluna = x);
  select count(*) into v_univ from pg_temp.f66b_universo(k_negocio);
  if pg_temp.assert_zero_de(
       'C7a toda exceção nominal aponta coluna de texto viva das 20' ||
       case when v_cnt > 0 then ' — fantasma: ' || v_lista else '' end,
       v_cnt, v_univ + coalesce(array_length(k_comprimento_excecao, 1), 0)) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- C7b — exceção que TEM o CHECK
  select count(*) filter (where excecao and n_canonicas > 0), count(*),
         coalesce(string_agg(tabela || '.' || coluna, ', ' order by tabela, coluna) filter (where excecao and n_canonicas > 0), '')
    into v_cnt, v_univ, v_lista
    from pg_temp.f66b_estado(k_negocio, k_comprimento_excecao, k_comprimento_nome_alternativo, k_comprimento_teto);
  if pg_temp.assert_zero_de(
       'C7b nenhuma exceção nominal tem o CHECK canônico (exceção com CHECK é lista desatualizada)' ||
       case when v_cnt > 0 then ' — com CHECK: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- C8 — nome alternativo justificado: a coluna existe; o nome do padrão existe NESSA tabela e NÃO é canônico
  select count(*), coalesce(string_agg(x, ', ' order by x), '')
    into v_cnt, v_lista
    from unnest(k_comprimento_nome_alternativo) as x
   where not exists (
     select 1 from pg_temp.f66b_universo(k_negocio) u
       join pg_constraint k on k.conrelid = u.relid and k.contype = 'c'
                           and k.conname = u.tabela || '_' || u.coluna || '_tamanho'
      where u.tabela || '.' || u.coluna = split_part(x, ':', 1)
        and not pg_temp.f66b_canonica(k.conbin, u.attnum));
  if pg_temp.assert_zero_de(
       'C8 todo nome alternativo é justificado (o nome do padrão pertence a uma constraint anterior de outra forma)' ||
       case when v_cnt > 0 then ' — sem justificativa: ' || v_lista else '' end,
       v_cnt, greatest(coalesce(array_length(k_comprimento_nome_alternativo, 1), 0), 1)::bigint) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- C9 — nenhum CHECK de comprimento das 20 (qualquer forma) fica not valid
  select count(*), count(*) filter (where not k.convalidated),
         coalesce(string_agg(k.conname, ', ' order by k.conname) filter (where not k.convalidated), '')
    into v_univ, v_cnt, v_lista
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
   where k.contype = 'c' and c.relnamespace = 'public'::regnamespace and c.relname = any (k_negocio)
     and k.conbin::text ~ (':funcid (' || 'pg_catalog.char_length(text)'::regprocedure::oid || '|' ||
                           'pg_catalog.length(text)'::regprocedure::oid || '|' ||
                           'pg_catalog.octet_length(text)'::regprocedure::oid || '|' ||
                           'pg_catalog.character_length(text)'::regprocedure::oid || ') ');
  if pg_temp.assert_zero_de(
       'C9 nenhum CHECK de comprimento das 20 (char_length, length, octet_length, character_length) está not valid' ||
       case when v_cnt > 0 then ' — not valid: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ===============================================================
  -- A AUTO-SABOTAGEM — cada uma numa subtransação desfeita (o `raise` do fim volta o catálogo). A mesma consulta,
  -- sobre o catálogo sabotado, tem de acusar EXATAMENTE a coluna sabotada.
  -- ===============================================================

  -- S1 — uma coluna text NOVA numa das 20, sem CHECK → a C1 a acusa
  v_s := null; v_erro := null;
  begin
    alter table public.kits_modelos add column _f66b_sintetica text;
    select count(*) into v_s
      from pg_temp.f66b_estado(k_negocio, k_comprimento_excecao, k_comprimento_nome_alternativo, k_comprimento_teto)
     where not excecao and not tem and tabela = 'kits_modelos' and coluna = '_f66b_sintetica';
    raise exception 'f66b-desfaz';
  exception when others then
    if sqlerrm <> 'f66b-desfaz' then v_erro := sqlerrm; end if;
  end;
  if v_s = 1 then
    v_ok := v_ok + 1; raise notice '✓ S1 a C1 acusa a coluna text sintética sem CHECK (kits_modelos._f66b_sintetica)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ S1 a C1 não acusou a coluna sintética (contou %; erro: %)', coalesce(v_s::text, '∅'), coalesce(v_erro, '—');
  end if;

  -- S2 — o CHECK de uma coluna some → a C1 o acusa
  v_s := null; v_erro := null;
  begin
    alter table public.ativos drop constraint ativos_marca_tamanho;
    select count(*) into v_s
      from pg_temp.f66b_estado(k_negocio, k_comprimento_excecao, k_comprimento_nome_alternativo, k_comprimento_teto)
     where not excecao and not tem and tabela = 'ativos' and coluna = 'marca';
    raise exception 'f66b-desfaz';
  exception when others then
    if sqlerrm <> 'f66b-desfaz' then v_erro := sqlerrm; end if;
  end;
  if v_s = 1 then
    v_ok := v_ok + 1; raise notice '✓ S2 a C1 acusa a coluna cujo CHECK foi retirado (ativos.marca)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ S2 a C1 não acusou o CHECK retirado (contou %; erro: %)', coalesce(v_s::text, '∅'), coalesce(v_erro, '—');
  end if;

  -- S3 — o CHECK recriado not valid → a C3 o acusa
  v_s := null; v_erro := null;
  begin
    alter table public.motivos drop constraint motivos_rotulo_tamanho;
    alter table public.motivos add constraint motivos_rotulo_tamanho check (char_length(rotulo) <= 80) not valid;
    select count(*) into v_s
      from pg_temp.f66b_estado(k_negocio, k_comprimento_excecao, k_comprimento_nome_alternativo, k_comprimento_teto)
     where tem and not validada and tabela = 'motivos' and coluna = 'rotulo';
    raise exception 'f66b-desfaz';
  exception when others then
    if sqlerrm <> 'f66b-desfaz' then v_erro := sqlerrm; end if;
  end;
  if v_s = 1 then
    v_ok := v_ok + 1; raise notice '✓ S3 a C3 acusa o CHECK recriado not valid (motivos_rotulo_tamanho)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ S3 a C3 não acusou o CHECK not valid (contou %; erro: %)', coalesce(v_s::text, '∅'), coalesce(v_erro, '—');
  end if;

  -- S4 — o CHECK com OUTRA forma (octet_length), com o mesmo nome → a C2 o acusa
  v_s := null; v_erro := null;
  begin
    alter table public.filiais drop constraint filiais_nome_tamanho;
    alter table public.filiais add constraint filiais_nome_tamanho check (octet_length(nome) <= 80);
    select count(*) into v_s
      from pg_temp.f66b_estado(k_negocio, k_comprimento_excecao, k_comprimento_nome_alternativo, k_comprimento_teto)
     where tem and not canonica and tabela = 'filiais' and coluna = 'nome';
    raise exception 'f66b-desfaz';
  exception when others then
    if sqlerrm <> 'f66b-desfaz' then v_erro := sqlerrm; end if;
  end;
  if v_s = 1 then
    v_ok := v_ok + 1; raise notice '✓ S4 a C2 acusa o CHECK com octet_length no lugar de char_length (filiais_nome_tamanho)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ S4 a C2 não acusou a forma trocada (contou %; erro: %)', coalesce(v_s::text, '∅'), coalesce(v_erro, '—');
  end if;

  -- S5 — uma exceção nominal para coluna que TEM o CHECK → a C7b a acusa
  select count(*) filter (where excecao and n_canonicas > 0) into v_s
    from pg_temp.f66b_estado(k_negocio, k_comprimento_excecao || array['senhas_acesso.rotulo'],
                             k_comprimento_nome_alternativo, k_comprimento_teto)
   where tabela = 'senhas_acesso' and coluna = 'rotulo';
  if v_s = 1 then
    v_ok := v_ok + 1; raise notice '✓ S5 a C7b acusa a exceção que tem o CHECK (senhas_acesso.rotulo)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ S5 a C7b não acusou a exceção com CHECK (contou %)', coalesce(v_s::text, '∅');
  end if;

  -- S6 — uma exceção nominal que aponta coluna inexistente → a consulta da C7a a acusa
  select count(*) into v_s
    from unnest(k_comprimento_excecao || array['ativos._f66b_inexistente']) as x
   where x = 'ativos._f66b_inexistente' and not exists (select 1 from pg_temp.f66b_universo(k_negocio) u where u.tabela || '.' || u.coluna = x);
  if v_s = 1 then
    v_ok := v_ok + 1; raise notice '✓ S6 a C7a acusa a exceção que aponta coluna inexistente (ativos._f66b_inexistente)';
  else
    v_falhas := v_falhas + 1; raise warning '✗ S6 a C7a não acusou a exceção fantasma (contou %)', coalesce(v_s::text, '∅');
  end if;

  raise notice 'FIM comprimento_por_coluna: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
