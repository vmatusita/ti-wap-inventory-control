do $cal$
declare
  v_ok     int := 0;
  v_falhas int := 0;
  v_cnt    bigint;
  v_univ   bigint;
  v_lista  text;

  k_negocio text[] := array[
    'anotacoes', 'ativos', 'colaboradores', 'eventos_admin', 'filiais',
    'import_logs', 'import_prefixos_patrimonio', 'import_termos_categoria',
    'import_termos_estado', 'itens', 'kits_modelos', 'lancamentos_item',
    'motivos', 'movimentacoes', 'pendencias_item', 'relatorios_gerados',
    'senhas_acesso', 'termos_gerados', 'tipos_item', 'unidades_apelidos'
  ];

  k_infra text[] := array[
    'profiles', 'operador_filiais', 'senha_tentativas', 'ambiente',
    '_bkp_relatorios_gerados_f6a'
  ];

  k_sem_select text[] := array['senhas_acesso', 'senha_tentativas', 'ambiente'];

  k_piso_papel text[] := array[
    'anotacoes', 'ativos', 'colaboradores', 'filiais', 'import_prefixos_patrimonio',
    'import_termos_categoria', 'import_termos_estado', 'itens', 'kits_modelos',
    'lancamentos_item', 'motivos', 'movimentacoes', 'operador_filiais',
    'pendencias_item', 'profiles', 'relatorios_gerados', 'termos_gerados', 'tipos_item',
    'unidades_apelidos'
  ];

  k_piso_cargo text[] := array['eventos_admin', 'import_logs', '_bkp_relatorios_gerados_f6a'];

  k_storage text[] := array[
    'termos leitura operador', 'termos insere operador',
    'termos atualiza operador', 'termos apaga operador',
    'backups-import leitura operador', 'backups-import insere operador',
    'backups-import atualiza operador', 'backups-import apaga operador'
  ];

  k_funcoes_acesso text[] := array[
    'papel_atual', 'e_admin', 'e_dev', 'pode_escrever', 'pode_escrever_filial',
    'pode_escrever_termo', 'pode_escrever_arquivo_termo', 'pode_ler_arquivo_termo'
  ];

  k_realtime text[] := array['movimentacoes', 'lancamentos_item', 'anotacoes'];

  k_policies_public text[] := array[
    '_bkp_relatorios_gerados_f6a / dev le backup f6a',
    'anotacoes / leitura operador', 'anotacoes / operador anota',
    'ativos / leitura operador', 'ativos / operador atualiza', 'ativos / operador insere',
    'colaboradores / admin atualiza colaborador', 'colaboradores / escrita cria colaborador',
    'colaboradores / leitura operador',
    'eventos_admin / admin le auditoria',
    'filiais / admin apaga', 'filiais / admin atualiza', 'filiais / admin insere', 'filiais / leitura operador',
    'import_logs / leitura operador', 'import_logs / operador insere',
    'import_prefixos_patrimonio / leitura operador', 'import_termos_categoria / leitura operador',
    'import_termos_estado / leitura operador',
    'itens / admin apaga', 'itens / admin atualiza', 'itens / escrita cria item', 'itens / leitura operador',
    'kits_modelos / admin apaga', 'kits_modelos / admin atualiza', 'kits_modelos / admin insere',
    'kits_modelos / leitura operador',
    'lancamentos_item / leitura operador', 'lancamentos_item / operador lanca',
    'motivos / admin apaga', 'motivos / admin atualiza', 'motivos / admin insere', 'motivos / leitura operador',
    'movimentacoes / leitura operador', 'movimentacoes / operador insere',
    'operador_filiais / leitura operador',
    'pendencias_item / pendencias_item admin reabre', 'pendencias_item / pendencias_item leitura operador',
    'pendencias_item / pendencias_item operador resolve',
    'profiles / atualiza proprio perfil', 'profiles / leitura operador',
    'relatorios_gerados / leitura operador', 'relatorios_gerados / operador gera',
    'termos_gerados / leitura operador', 'termos_gerados / operador apaga', 'termos_gerados / operador atualiza',
    'termos_gerados / operador insere',
    'tipos_item / admin atualiza tipo', 'tipos_item / admin insere tipo', 'tipos_item / leitura operador',
    'unidades_apelidos / admin apaga apelido', 'unidades_apelidos / admin insere apelido',
    'unidades_apelidos / leitura operador'
  ];

  k_excecoes_predicado text[] := array[
    'public.ativos / operador atualiza / pode_escrever_filial',
    'public.ativos / operador insere / pode_escrever_filial',
    'public.lancamentos_item / operador lanca / estorno_item_coerente',
    'public.lancamentos_item / operador lanca / pode_escrever_filial',
    'public.movimentacoes / operador insere / pode_escrever_filial',
    'public.pendencias_item / pendencias_item admin reabre / pode_escrever_filial',
    'public.pendencias_item / pendencias_item operador resolve / pode_escrever_filial',
    'public.termos_gerados / operador apaga / pode_escrever_termo',
    'public.termos_gerados / operador atualiza / array_length',
    'public.termos_gerados / operador atualiza / pode_escrever_termo',
    'public.termos_gerados / operador atualiza / termo_ancora_coerente',
    'public.termos_gerados / operador insere / array_length',
    'public.termos_gerados / operador insere / pode_escrever_termo',
    'public.termos_gerados / operador insere / termo_ancora_coerente',
    'storage.objects / termos apaga operador / pode_escrever_arquivo_termo',
    'storage.objects / termos atualiza operador / pode_escrever_arquivo_termo',
    'storage.objects / termos insere operador / pode_escrever_arquivo_termo',
    'storage.objects / termos leitura operador / pode_ler_arquivo_termo'
  ];

  k_guarda_esperada text[] := array[
    'r1-coluna:r1', 'r1-falso-icamento:r1', 'r1-expressao:r1', 'r2-solta:r2',
    'r3-le-tabela:r3a', 'r3-correlacionado:r3b', 'setof-array:setof', 'no-desconhecido:desconhecido'
  ];

  k_nos_conhecidos text[] := array[
    'QUERY', 'FROMEXPR', 'JOINEXPR', 'RANGETBLREF', 'RANGETBLENTRY', 'RANGETBLFUNCTION',
    'RTEPERMISSIONINFO', 'ALIAS', 'TARGETENTRY', 'SORTGROUPCLAUSE',
    'BOOLEXPR', 'OPEXPR', 'DISTINCTEXPR', 'NULLIFEXPR', 'SCALARARRAYOPEXPR', 'ROWCOMPAREEXPR',
    'NULLTEST', 'BOOLEANTEST', 'VAR', 'CONST', 'PARAM', 'SUBLINK', 'FUNCEXPR',
    'RELABELTYPE', 'COERCEVIAIO', 'ARRAYCOERCEEXPR', 'CONVERTROWTYPEEXPR', 'COLLATEEXPR',
    'CASEEXPR', 'CASEWHEN', 'CASETESTEXPR', 'ARRAYEXPR', 'ROWEXPR', 'COALESCEEXPR',
    'MINMAXEXPR', 'SQLVALUEFUNCTION', 'FIELDSELECT', 'SUBSCRIPTINGREF'
  ];

  v_arv       record;
  v_tok       text;
  v_campo     text;
  v_tipos     text[];
  v_func      bigint[];
  v_real      boolean[];
  v_retset    boolean[];
  v_alvoarr   boolean[];
  v_linha     boolean[];
  v_num1      bigint[];
  v_num2      bigint[];
  v_prof      int;
  v_topo      int;
  v_k         int;
  v_dentro    boolean;
  v_achou     boolean;
  v_m         text[];
  v_arvores   int := 0;
  v_chamadas  int := 0;
  v_nos       int := 0;
  v_casos     int := 0;
  v_r1        text[] := '{}';
  v_r2        text[] := '{}';
  v_r3a       text[] := '{}';
  v_r3b       text[] := '{}';
  v_setof     text[] := '{}';
  v_desc      text[] := '{}';
  v_vivas     text[];
  v_obtida    text[] := '{}';
  v_f_linha   oid;
  v_f_sem     oid;
  v_f_uid     oid;
  v_cal jsonb := '[]';
begin

  select count(*) into v_univ
    from pg_policies p
   where p.schemaname = 'public';

  select count(*), coalesce(string_agg(c.chave, ', ' order by c.chave), '')
    into v_cnt, v_lista
    from (select p.tablename || ' / ' || p.policyname as chave
            from pg_policies p
           where p.schemaname = 'public') as c
   where not (c.chave = any (k_policies_public));
  v_cal := v_cal || jsonb_build_array(jsonb_build_object('rotulo', '10a toda policy de public está no universo congelado da doutrina' ||
       case when v_cnt > 0 then ' — fora do universo (decida e congele): ' || v_lista else '' end, 'ruins', v_cnt, 'universo', v_univ));

  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_policies_public) as nome
   where not exists (
     select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename || ' / ' || p.policyname = nome
   );
  v_cal := v_cal || jsonb_build_array(jsonb_build_object('rotulo', '10b toda policy do universo congelado ainda existe' ||
       case when v_cnt > 0 then ' — ausente(s): ' || v_lista else '' end, 'ruins', v_cnt, 'universo', array_length(k_policies_public, 1)::bigint));

  v_f_linha := 'public.pode_escrever_filial(smallint)'::regprocedure::oid;
  v_f_sem := 'public.e_admin()'::regprocedure::oid;
  v_f_uid := 'auth.uid()'::regprocedure::oid;

  for v_arv in
    select n.nspname || '.' || c.relname || ' / ' || p.polname as chave, a.arvore, null::text as caso
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral (values (p.polqual::text), (p.polwithcheck::text)) as a (arvore)
     where n.nspname in ('public', 'storage') and a.arvore is not null
    union all
    select '(árvore sintética ' || s.caso || ')', s.arvore, s.caso
      from (values
        ('r1-coluna', format(
           '{FUNCEXPR :funcid %s :funcretset false :funcformat 0 :args ({VAR :varno 1 :varlevelsup 0})}', v_f_linha)),
        ('r1-falso-icamento', format(
           '{SUBLINK :subLinkType 4 :subselect {QUERY :rtable <> :targetList ({TARGETENTRY :expr '
           '{FUNCEXPR :funcid %s :funcretset false :funcformat 0 :args ({VAR :varno 1 :varlevelsup 1})}})}}', v_f_linha)),
        ('r1-expressao', format(
           '{FUNCEXPR :funcid %s :funcretset false :funcformat 0 :args ({COERCEVIAIO :arg {OPEXPR :args '
           '({VAR :varno 1 :varlevelsup 0} {CONST :constvalue 4 [ 1 2 3 4 ]})}})}', v_f_linha)),
        ('cast-nao-e-funcao', format(
           '{FUNCEXPR :funcid %s :funcretset false :funcformat 1 :args ({VAR :varno 1 :varlevelsup 0})}', v_f_linha)),
        ('r2-solta', format(
           '{FUNCEXPR :funcid %s :funcretset false :funcformat 0 :args <>}', v_f_sem)),
        ('r2-embrulhada', format(
           '{SUBLINK :subLinkType 4 :subselect {QUERY :rtable <> :targetList ({TARGETENTRY :expr '
           '{FUNCEXPR :funcid %s :funcretset false :funcformat 0 :args <>}})}}', v_f_sem)),
        ('r3-le-tabela',
           '{SUBLINK :subLinkType 0 :subselect {QUERY :rtable ({RANGETBLENTRY :alias <> :eref {ALIAS '
           ':aliasname m :colnames ("a" "b\\ c")} :rtekind 0 :relid 1259}) :targetList <>}}'),
        ('r3-correlacionado',
           '{SUBLINK :subLinkType 0 :subselect {QUERY :rtable <> :jointree {FROMEXPR :fromlist <> :quals '
           '{OPEXPR :args ({VAR :varno 1 :varlevelsup 1} {CONST :constvalue 4 [ 0 0 0 0 ]})}} :targetList <>}}'),
        ('setof-array', format(
           '{SCALARARRAYOPEXPR :args ({VAR :varno 1 :varlevelsup 0} {SUBLINK :subLinkType 6 :subselect {QUERY '
           ':targetList ({TARGETENTRY :expr {FUNCEXPR :funcid %s :funcretset false :funcformat 0 :args <>}})}})}', v_f_uid)),
        ('forma-alvo', format(
           '{SCALARARRAYOPEXPR :args ({VAR :varno 1 :varlevelsup 0} {SUBLINK :subLinkType 6 :subselect {QUERY '
           ':targetList ({TARGETENTRY :expr {FUNCEXPR :funcid %s :funcretset true :funcformat 0 :args <>}})}})}', v_f_uid)),
        ('pares', format(
           '{SUBLINK :subLinkType 2 :testexpr {BOOLEXPR :args ({OPEXPR :args ({VAR :varno 1 :varlevelsup 0} '
           '{PARAM :paramkind 2})})} :subselect {QUERY :rtable ({RANGETBLENTRY :rtekind 3 :functions '
           '({RANGETBLFUNCTION :funcexpr {FUNCEXPR :funcid %s :funcretset true :funcformat 0 :args <>}})}) '
           ':targetList ({TARGETENTRY :expr {VAR :varno 1 :varlevelsup 0}})}}', v_f_uid)),
        ('no-desconhecido', '{XMLEXPR :op 0 :args <>}')
      ) as s (caso, arvore)
  loop
    if v_arv.caso is not null then
      v_casos := v_casos + 1;
    else
      v_arvores := v_arvores + 1;
    end if;
    v_tipos := '{}'; v_func := '{}'; v_real := '{}'; v_retset := '{}'; v_alvoarr := '{}';
    v_linha := '{}'; v_num1 := '{}'; v_num2 := '{}'; v_prof := 0; v_campo := null;
    for v_m in
      select t.m
        from regexp_matches(v_arv.arvore,
               '(\{[A-Z_]+)|(\})|(:[A-Za-z_]+)|("(?:[^"\\]|\\.)*"|(?:[^\s{}()\[\]"\\]|\\.)+)', 'g')
             with ordinality as t (m, i)
       order by t.i
    loop
      v_topo := coalesce(array_length(v_tipos, 1), 0);
      if v_m[1] is not null then
        v_tok := ltrim(v_m[1], '{');
        if v_arv.caso is null then
          v_nos := v_nos + 1;
        end if;
        if not (v_tok = any (k_nos_conhecidos)) then
          if v_arv.caso is null then
            v_desc := v_desc || (v_arv.chave || ' / ' || v_tok);
          else
            v_obtida := v_obtida || (v_arv.caso || ':desconhecido');
          end if;
        end if;
        v_alvoarr := v_alvoarr || (v_tok = 'FUNCEXPR' and v_topo >= 3
                                   and v_tipos[v_topo] = 'TARGETENTRY'
                                   and v_tipos[v_topo - 1] = 'QUERY'
                                   and v_tipos[v_topo - 2] = 'SUBLINK'
                                   and v_num1[v_topo - 2] = 6);
        v_tipos := v_tipos || v_tok;
        v_func := v_func || 0::bigint;
        v_real := v_real || false;
        v_retset := v_retset || false;
        v_linha := v_linha || false;
        v_num1 := v_num1 || null::bigint;
        v_num2 := v_num2 || null::bigint;
        if v_tok = 'QUERY' then
          v_prof := v_prof + 1;
        end if;
      elsif v_m[2] is not null then
        if v_topo = 0 then
          raise exception 'F59: árvore desbalanceada em %', v_arv.chave;
        end if;
        if v_tipos[v_topo] = 'VAR' and v_num1[v_topo] = 1 and v_num2[v_topo] = v_prof then
          v_dentro := true;
          v_achou := false;
          for v_k in reverse (v_topo - 1) .. 1 loop
            if v_tipos[v_k] = 'QUERY' then
              v_dentro := false;
            elsif v_tipos[v_k] = 'FUNCEXPR' and v_real[v_k] then
              v_linha[v_k] := true;
              v_achou := v_achou or v_dentro;
            end if;
          end loop;
          if v_prof > 0 and not v_achou then
            if v_arv.caso is null then
              v_r3b := v_r3b || (v_arv.chave || ' / sub-select');
            else
              v_obtida := v_obtida || (v_arv.caso || ':r3b');
            end if;
          end if;
        elsif v_tipos[v_topo] = 'FUNCEXPR' and v_real[v_topo] then
          if v_arv.caso is null then
            v_chamadas := v_chamadas + 1;
            if v_linha[v_topo] then
              v_r1 := v_r1 || (v_arv.chave || ' / ' || (select pr.proname from pg_proc pr where pr.oid = v_func[v_topo]));
            elsif v_prof = 0 then
              v_r2 := v_r2 || (v_arv.chave || ' / ' || (select pr.proname from pg_proc pr where pr.oid = v_func[v_topo]));
            end if;
            if v_alvoarr[v_topo] and not v_retset[v_topo] then
              v_setof := v_setof || (v_arv.chave || ' / ' || (select pr.proname from pg_proc pr where pr.oid = v_func[v_topo]));
            end if;
          else
            if v_linha[v_topo] then
              v_obtida := v_obtida || (v_arv.caso || ':r1');
            elsif v_prof = 0 then
              v_obtida := v_obtida || (v_arv.caso || ':r2');
            end if;
            if v_alvoarr[v_topo] and not v_retset[v_topo] then
              v_obtida := v_obtida || (v_arv.caso || ':setof');
            end if;
          end if;
        elsif v_tipos[v_topo] = 'RANGETBLENTRY' and v_num1[v_topo] = 0 then
          if v_arv.caso is null then
            v_r3a := v_r3a || (v_arv.chave || ' / sub-select');
          else
            v_obtida := v_obtida || (v_arv.caso || ':r3a');
          end if;
        elsif v_tipos[v_topo] = 'QUERY' then
          v_prof := v_prof - 1;
        end if;
        v_tipos := v_tipos[1:v_topo - 1];
        v_func := v_func[1:v_topo - 1];
        v_real := v_real[1:v_topo - 1];
        v_retset := v_retset[1:v_topo - 1];
        v_alvoarr := v_alvoarr[1:v_topo - 1];
        v_linha := v_linha[1:v_topo - 1];
        v_num1 := v_num1[1:v_topo - 1];
        v_num2 := v_num2[1:v_topo - 1];
      elsif v_m[3] is not null then
        v_campo := v_m[3];
      else
        v_tok := v_m[4];
        if v_campo is not null and v_topo > 0 then
          case v_tipos[v_topo]
            when 'VAR' then
              if v_campo = ':varno' then v_num1[v_topo] := v_tok::bigint;
              elsif v_campo = ':varlevelsup' then v_num2[v_topo] := v_tok::bigint;
              end if;
            when 'FUNCEXPR' then
              if v_campo = ':funcid' then v_func[v_topo] := v_tok::bigint;
              elsif v_campo = ':funcretset' then v_retset[v_topo] := (v_tok = 'true');
              elsif v_campo = ':funcformat' then v_real[v_topo] := v_tok in ('0', '3');
              end if;
            when 'SUBLINK' then
              if v_campo = ':subLinkType' then v_num1[v_topo] := v_tok::bigint;
              end if;
            when 'RANGETBLENTRY' then
              if v_campo = ':rtekind' then v_num1[v_topo] := v_tok::bigint;
              elsif v_campo = ':relid' then v_num2[v_topo] := v_tok::bigint;
              end if;
            else
              null;
          end case;
        end if;
        v_campo := null;
      end if;
    end loop;
    if coalesce(array_length(v_tipos, 1), 0) <> 0 then
      raise exception 'F59: árvore desbalanceada (sobrou pilha) em %', v_arv.chave;
    end if;
  end loop;

  select count(distinct x), coalesce(string_agg(distinct x, ', '), '')
    into v_cnt, v_lista
    from unnest(v_desc) as x;
  v_cal := v_cal || jsonb_build_array(jsonb_build_object('rotulo', '10c toda árvore de policy tem só nós que o analisador da doutrina lê' ||
       case when v_cnt > 0 then ' — nó desconhecido: ' || v_lista else '' end, 'ruins', v_cnt, 'universo', v_nos::bigint));

  select count(*), coalesce(string_agg(d, ', ' order by d), '')
    into v_cnt, v_lista
    from (
      select 'não reprovou ' || e as d
        from unnest(k_guarda_esperada) as e
       where not (e = any (v_obtida))
      union all
      select distinct 'reprovou a mais ' || o
        from unnest(v_obtida) as o
       where not (o = any (k_guarda_esperada))
    ) as diferencas;
  v_cal := v_cal || jsonb_build_array(jsonb_build_object('rotulo', '10d o analisador de árvore sabe reprovar (' || v_casos || ' árvores sintéticas)' ||
       case when v_cnt > 0 then ' — ' || v_lista else '' end, 'ruins', v_cnt, 'universo', (array_length(k_guarda_esperada, 1) + 6 * v_casos)::bigint));

  select count(*), coalesce(string_agg(o.chave, ', ' order by o.chave), '')
    into v_cnt, v_lista
    from (select distinct x as chave from unnest(v_r1) x) as o
   where not (o.chave = any (k_excecoes_predicado));
  v_cal := v_cal || jsonb_build_array(jsonb_build_object('rotulo', '11a R1 nenhuma função recebe dado da linha fora da lista de exceções' ||
       case when v_cnt > 0 then ' — por linha (use col = any (array (select public.<fn>())) ou declare com motivo e destino): ' || v_lista else '' end, 'ruins', v_cnt, 'universo', v_chamadas::bigint));

  v_vivas := array(
    select distinct x from unnest(v_r1 || v_r3a || v_r3b) x
  );
  if array_length(k_excecoes_predicado, 1) is null then
    v_ok := v_ok + 1;
    raise notice '✓ 11b a catraca da doutrina (lista de exceções vazia — nada a conferir)';
  else
    select count(*), coalesce(string_agg(e.chave, ', ' order by e.chave), '')
      into v_cnt, v_lista
      from unnest(k_excecoes_predicado) as e (chave)
     where not (e.chave = any (v_vivas));
    v_cal := v_cal || jsonb_build_array(jsonb_build_object('rotulo', '11b toda exceção da doutrina ainda descreve uma ocorrência viva' ||
         case when v_cnt > 0 then ' — sem ocorrência (tire a linha de k_excecoes_predicado): ' || v_lista else '' end, 'ruins', v_cnt, 'universo', array_length(k_excecoes_predicado, 1)::bigint));
  end if;

  select count(*), coalesce(string_agg(o.chave, ', ' order by o.chave), '')
    into v_cnt, v_lista
    from (select distinct x as chave from unnest(v_r2) x) as o;
  v_cal := v_cal || jsonb_build_array(jsonb_build_object('rotulo', '12 R2 nenhuma função sem dado da linha fora de (select …)' ||
       case when v_cnt > 0 then ' — solta(s): ' || v_lista else '' end, 'ruins', v_cnt, 'universo', v_chamadas::bigint));

  select count(*), coalesce(string_agg(o.chave, ', ' order by o.chave), '')
    into v_cnt, v_lista
    from (select distinct x as chave from unnest(v_r3a) x) as o
   where not (o.chave = any (k_excecoes_predicado));
  v_cal := v_cal || jsonb_build_array(jsonb_build_object('rotulo', '13a R3 nenhum sub-select de policy lê tabela ou view' ||
       case when v_cnt > 0 then ' — lê relação: ' || v_lista else '' end, 'ruins', v_cnt, 'universo', v_arvores::bigint));

  select count(*), coalesce(string_agg(o.chave, ', ' order by o.chave), '')
    into v_cnt, v_lista
    from (select distinct x as chave from unnest(v_r3b) x) as o
   where not (o.chave = any (k_excecoes_predicado));
  v_cal := v_cal || jsonb_build_array(jsonb_build_object('rotulo', '13b R3 nenhum sub-select de policy olha a linha fora de argumento de função' ||
       case when v_cnt > 0 then ' — correlacionado: ' || v_lista else '' end, 'ruins', v_cnt, 'universo', v_arvores::bigint));

  select count(*), coalesce(string_agg(o.chave, ', ' order by o.chave), '')
    into v_cnt, v_lista
    from (select distinct x as chave from unnest(v_setof) x) as o;
  v_cal := v_cal || jsonb_build_array(jsonb_build_object('rotulo', '14 alvo de array (select …) em policy é função que devolve conjunto' ||
       case when v_cnt > 0 then ' — não é setof: ' || v_lista else '' end, 'ruins', v_cnt, 'universo', v_chamadas::bigint));

  raise exception 'F59_CAL %', jsonb_build_object(
    'assercoes', v_cal, 'arvores', v_arvores, 'nos', v_nos, 'chamadas', v_chamadas, 'casos', v_casos,
    'obtida', to_jsonb(v_obtida));
end $cal$;
