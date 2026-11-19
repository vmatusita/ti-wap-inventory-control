-- F68 · decisão 15 — A PROVA VIVA DA PORTA no ENSAIO (sgmvldiizsrjbxzzpmhh), depois do apply da 0208–0212.
-- Um bloco só, que TERMINA EM `raise` (nada fica no ensaio): duas empresas FICTÍCIAS, senhas bcrypt de fixture (custo 10,
-- o da gestão), gerados com as chaves de pessoa (valores fictícios — regra 2). As duas portas chamadas COMO anon
-- (`set local role anon`, a identidade da chave pública). A saída é o texto do `raise`: só rótulos, contagens e tempos.
--
-- ⚠ O teto de 3 s do anon (`statement_timeout` do rolconfig) não chega aqui: um bloco DO é UM comando, e o timeout não se
-- rearma a cada chamada de dentro dele. Cada chamada é cronometrada e conferida < 3000 ms; o teto REAL é o das chamadas
-- HTTP pelo PostgREST (D-ensaio/P5-http.txt).
do $prova$
declare
  k_recusa    constant jsonb := '{"ok": false}'::jsonb;
  k_proibidas constant text[] := array['colaboradorSetor', 'colaborador', 'setor', 'autor', 'colaborador_setor',
    'autorNome', 'gerado_por', 'criado_por', 'ativoId', 'empresa_id', 'filial_id', 'senha_id', 'hash', 'token_hash'];
  v_autor uuid;
  v_a uuid;
  v_b uuid;
  v_sa uuid;
  v_ga uuid;
  v_gb uuid;
  v_r jsonb;
  v_ta text;
  v_tb text;
  v_rec jsonb[] := '{}';
  v_resp jsonb[] := '{}';
  v_ini timestamptz;
  v_ms numeric;
  v_max numeric := 0;
  v_n bigint;
  v_m bigint;
  v_ok int := 0;
  v_falhas text[] := '{}';
  v_estado text;
  v_chamadas int := 0;
begin
  select u.id into v_autor from auth.users u order by u.created_at limit 1;  -- só para criado_por/gerado_por; nunca sai
  insert into public.empresas (slug, nome) values ('f68-prova-a', 'Fictícia A (F68 ensaio)') returning id into v_a;
  insert into public.empresas (slug, nome) values ('f68-prova-b', 'Fictícia B (F68 ensaio)') returning id into v_b;
  insert into public.senhas_acesso (empresa_id, rotulo, hash, ativa, criado_por)
  values (v_a, 'Prova A', extensions.crypt('senha-igual-nas-duas', extensions.gen_salt('bf', 10)), true, v_autor)
  returning id into v_sa;
  insert into public.senhas_acesso (empresa_id, rotulo, hash, ativa, criado_por) values
    (v_b, 'Prova B', extensions.crypt('senha-igual-nas-duas', extensions.gen_salt('bf', 10)), true, v_autor),
    (v_a, 'Só da A', extensions.crypt('senha-so-da-a', extensions.gen_salt('bf', 10)), true, v_autor),
    (v_a, 'Revogada A', extensions.crypt('senha-revogada-a', extensions.gen_salt('bf', 10)), false, v_autor);
  insert into public.relatorios_gerados (empresa_id, filial_id, periodo_de, periodo_ate, versao, gerado_por, observacao, dados)
  values (v_a, null, '2003-01-01', '2003-01-07', 1, v_autor, 'Observação fictícia', jsonb_build_object(
    'meta', jsonb_build_object('filialSlug', 'geral', 'filialNome', 'Consolidado', 'ehGeral', true, 'de', '2003-01-01',
                               'ate', '2003-01-07', 'periodoRotulo', 'F68 prova', 'schema', 2),
    'saidas', jsonb_build_array(jsonb_build_object('id', 'm1', 'data', '2003-01-02', 'patrimonio', 'WAP0001234',
       'colaboradorSetor', 'Fulano de Tal', 'ativoId', 'a1', 'chamado', 'CH-1')),
    'entradas', jsonb_build_array(jsonb_build_object('id', 'm2', 'data', '2003-01-03', 'patrimonio', 'WAP0001235',
       'colaborador', 'Fulano de Tal', 'setor', 'Setor X', 'ativoId', 'a2', 'itensFaltantes', jsonb_build_array('mouse'))),
    'movimentacoesItens', jsonb_build_array(jsonb_build_object('id', 'l1', 'colaborador', 'Fulano de Tal', 'item', 'Mouse')),
    'manutencao', jsonb_build_array(jsonb_build_object('patrimonio', 'WAP0001236', 'ativoId', 'a4',
       'anotacoes', jsonb_build_array(jsonb_build_object('texto', 'anotação', 'autor', 'Fulano de Tal', 'em', '2003-01-04'))))
  )) returning id into v_ga;
  insert into public.relatorios_gerados (empresa_id, filial_id, periodo_de, periodo_ate, versao, gerado_por, dados)
  values (v_b, null, '2003-01-01', '2003-01-07', 1, v_autor, '{"meta": {"filialSlug": "geral"}}'::jsonb)
  returning id into v_gb;

  -- ===== como ANON =====
  execute 'set local role anon';

  -- (1) a mesma senha em claro nas duas: cada uma abre só a sua
  v_ini := clock_timestamp(); v_r := public.relatorio_publico_abrir('f68-prova-a', 'senha-igual-nas-duas', '10.68.0.1');
  v_ms := extract(epoch from clock_timestamp() - v_ini) * 1000; v_max := greatest(v_max, v_ms); v_chamadas := v_chamadas + 1;
  v_ta := v_r ->> 'sessao';
  v_ini := clock_timestamp(); v_r := public.relatorio_publico_abrir('f68-prova-b', 'senha-igual-nas-duas', '10.68.0.1');
  v_ms := extract(epoch from clock_timestamp() - v_ini) * 1000; v_max := greatest(v_max, v_ms); v_chamadas := v_chamadas + 1;
  v_tb := v_r ->> 'sessao';
  if v_ta ~ '^[0-9a-f]{64}$' and v_tb ~ '^[0-9a-f]{64}$' and v_ta <> v_tb then v_ok := v_ok + 1;
  else v_falhas := v_falhas || 'P1 abertura nas duas'::text; end if;

  -- (2) as cinco recusas: a MESMA resposta, sem sessão nova na B
  execute 'reset role';
  select count(*) into v_n from public.sessoes_visualizador s where s.empresa_id = v_b;
  execute 'set local role anon';
  foreach v_r in array array[
      public.relatorio_publico_abrir('f68-prova-a', '', '10.68.0.2'),                    -- sem senha
      public.relatorio_publico_abrir('f68-prova-a', 'senha-errada-ficticia', '10.68.0.3'), -- senha errada
      public.relatorio_publico_abrir('f68-prova-a', 'senha-revogada-a', '10.68.0.4'),     -- senha revogada
      public.relatorio_publico_abrir('f68-prova-inexistente', 'qualquer', '10.68.0.5'),   -- slug inexistente
      public.relatorio_publico_abrir('f68-prova-b', 'senha-so-da-a', '10.68.0.6')         -- a senha de A no slug de B
    ] loop
    v_rec := v_rec || v_r;
  end loop;
  v_chamadas := v_chamadas + 5;
  execute 'reset role';
  select count(*) into v_m from public.sessoes_visualizador s where s.empresa_id = v_b;
  execute 'set local role anon';
  if (select count(*) from unnest(v_rec) x where x = k_recusa) = 5 and v_m = v_n then v_ok := v_ok + 1;
  else v_falhas := v_falhas || 'P2 as cinco recusas iguais'::text; end if;

  -- (3) a DIAGONAL: a sessão de A com o slug de B
  v_r := public.relatorio_publico_dados(v_ta, 'f68-prova-b', 'sessao', null); v_chamadas := v_chamadas + 1;
  if v_r = '{"ok": false, "recusa": "empresa"}'::jsonb then v_ok := v_ok + 1;
  else v_falhas := v_falhas || 'P3 a diagonal'::text; end if;

  -- (4) os gerados: a A vê o dela e nunca o da B
  v_r := public.relatorio_publico_dados(v_ta, 'f68-prova-a', 'gerados', '{"pagina": 1}'::jsonb); v_chamadas := v_chamadas + 1;
  v_resp := v_resp || v_r;
  if (v_r ->> 'ok') = 'true' and v_r::text like '%' || v_ga::text || '%' and v_r::text not like '%' || v_gb::text || '%'
     and public.relatorio_publico_dados(v_ta, 'f68-prova-a', 'gerado', jsonb_build_object('id', v_gb))
         = '{"ok": false, "recusa": "gerado"}'::jsonb then v_ok := v_ok + 1;
  else v_falhas := v_falhas || 'P4 os gerados da empresa da sessão'::text; end if;
  v_chamadas := v_chamadas + 1;

  -- (5) a minimização: nenhuma chave de pessoa e nenhum valor de pessoa na resposta do gerado que TEM as chaves
  v_ini := clock_timestamp();
  v_r := public.relatorio_publico_dados(v_ta, 'f68-prova-a', 'gerado', jsonb_build_object('id', v_ga));
  v_ms := extract(epoch from clock_timestamp() - v_ini) * 1000; v_max := greatest(v_max, v_ms); v_chamadas := v_chamadas + 1;
  v_resp := v_resp || v_r || public.relatorio_publico_dados(v_ta, 'f68-prova-a', 'sessao', null)
            || public.relatorio_publico_dados(null, 'f68-prova-a', 'porta', null);
  v_chamadas := v_chamadas + 2;
  with recursive n(v) as (
    select r from unnest(v_resp) r
    union all
    select x.v from n, lateral (
      select e.value from jsonb_each(case when jsonb_typeof(n.v) = 'object' then n.v else '{}'::jsonb end) e
      union all
      select a.value from jsonb_array_elements(case when jsonb_typeof(n.v) = 'array' then n.v else '[]'::jsonb end) a
    ) x(v)
  )
  select count(*) filter (where e.key = any (k_proibidas)), count(*) into v_n, v_m
    from n, jsonb_each(case when jsonb_typeof(n.v) = 'object' then n.v else '{}'::jsonb end) e;
  if (v_r ->> 'ok') = 'true' and v_n = 0 and v_m > 20
     and not exists (select 1 from unnest(v_resp) r where r::text like '%Fulano de Tal%' or r::text like '%Setor X%')
  then v_ok := v_ok + 1;
  else v_falhas := v_falhas || ('P5 a minimização (chaves proibidas: ' || v_n || ' de ' || v_m || ')'); end if;

  -- (6) o anon não alcança mais nada: nem as tabelas da porta, nem a gestão
  v_estado := '';
  begin perform 1 from public.sessoes_visualizador; v_estado := v_estado || 'leu-sessoes;';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.porta_tentativas; v_estado := v_estado || 'leu-contador;';
  exception when insufficient_privilege then null; end;
  begin perform public.senha_acesso_criar(v_a, 'Intrusa', 'senha-intrusa-1'); v_estado := v_estado || 'criou-senha;';
  exception when insufficient_privilege then null; end;
  begin perform public.relatorio_publico_projetar('{}'::jsonb, '{}'::jsonb); v_estado := v_estado || 'projetou;';
  exception when insufficient_privilege then null; end;
  if v_estado = '' then v_ok := v_ok + 1; else v_falhas := v_falhas || ('P6 o anon alcançou: ' || v_estado); end if;

  -- (7) a revogação (por fora da função, como o app anterior faria): a sessão morre na chamada seguinte
  execute 'reset role';
  update public.senhas_acesso set ativa = false where id = v_sa;
  execute 'set local role anon';
  v_r := public.relatorio_publico_dados(v_ta, 'f68-prova-a', 'sessao', null); v_chamadas := v_chamadas + 1;
  if v_r = '{"ok": false, "recusa": "sessao"}'::jsonb then v_ok := v_ok + 1;
  else v_falhas := v_falhas || 'P7 a revogação'::text; end if;

  -- (8) o Sair: encerrar mata a sessão no banco
  v_r := public.relatorio_publico_dados(v_tb, 'f68-prova-b', 'encerrar', null); v_chamadas := v_chamadas + 1;
  if v_r = '{"ok": true}'::jsonb
     and public.relatorio_publico_dados(v_tb, 'f68-prova-b', 'sessao', null) = '{"ok": false, "recusa": "sessao"}'::jsonb
  then v_ok := v_ok + 1; else v_falhas := v_falhas || 'P8 o Sair'::text; end if;
  v_chamadas := v_chamadas + 1;

  -- (9) um pedido fora da lista fechada
  if public.relatorio_publico_dados(v_ta, 'f68-prova-a', 'ativos', null) = '{"ok": false, "recusa": "sessao"}'::jsonb
  then v_ok := v_ok + 1; else v_falhas := v_falhas || 'P9 a lista fechada'::text; end if;
  v_chamadas := v_chamadas + 1;
  execute 'reset role';

  -- (10) nenhuma chamada perto dos 3 s
  if v_max < 3000 then v_ok := v_ok + 1; else v_falhas := v_falhas || ('P10 tempo ' || round(v_max) || ' ms'); end if;

  raise exception 'F68 PROVA VIVA (ensaio): % de 10 verificações OK; falhas: %; % chamadas como anon; a mais lenta das cronometradas: % ms. (rollback: este raise desfaz tudo)',
    v_ok, coalesce(nullif(array_to_string(v_falhas, ' | '), ''), 'nenhuma'), v_chamadas, round(v_max);
end
$prova$;
