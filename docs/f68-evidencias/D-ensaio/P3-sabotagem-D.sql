-- F68 · sabotagem D (a metade de TEMPO) — "um abrir que pula o trabalho do hash quando não há candidato: a medição de
-- tempo acusa". Dentro do bloco (desfeito pelo raise final): o corpo vivo de relatorio_publico_abrir é trocado por um que
-- PULA o crypt das posições sem candidata (`continue`), e a MESMA régua do P2 (mediana de cada recusa a ±10% da geral)
-- é aplicada, com n = 15 por caminho. Esperado: caminhos FORA da régua — a sabotagem é acusada pelo tempo.
do $sabotagem_d$
declare
  k_n constant int := 15;
  k_caminhos constant text[] := array['sem senha', 'senha errada', 'senha revogada', 'slug inexistente', 'senha de A no slug de B'];
  v_def text;
  v_de constant text := E'    v_h := coalesce(v_hashes[i], k_sal_ficticio);\n';
  v_autor uuid;
  v_a uuid;
  v_b uuid;
  v_ini timestamptz;
  v_ms numeric;
  v_r jsonb;
  v_amostras numeric[][] := array_fill(0::numeric, array[5, k_n]);
  v_med numeric[] := '{}';
  v_geral numeric;
  v_fora text[] := '{}';
  v_txt text := '';
  i int;
  j int;
  p int;
begin
  -- a sabotagem: o corpo VIVO, com o laço pulando as posições vazias
  v_def := pg_get_functiondef('public.relatorio_publico_abrir(text, text, text)'::regprocedure);
  if (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'F68 SABOTAGEM D: a âncora do laço não está no corpo vivo exatamente uma vez — nada medido';
  end if;
  execute replace(v_def, v_de, E'    continue when v_hashes[i] is null;  -- SABOTAGEM D (ensaio)\n    v_h := v_hashes[i];\n');

  select u.id into v_autor from auth.users u order by u.created_at limit 1;
  insert into public.empresas (slug, nome) values ('f68-sabd-a', 'Fictícia A (F68 sabotagem D)') returning id into v_a;
  insert into public.empresas (slug, nome) values ('f68-sabd-b', 'Fictícia B (F68 sabotagem D)') returning id into v_b;
  insert into public.senhas_acesso (empresa_id, rotulo, hash, ativa, criado_por) values
    (v_a, 'Tempo A', extensions.crypt('senha-certa-a', extensions.gen_salt('bf', 10)), true, v_autor),
    (v_a, 'Revogada A', extensions.crypt('senha-revogada-a', extensions.gen_salt('bf', 10)), false, v_autor),
    (v_b, 'Tempo B', extensions.crypt('senha-certa-b', extensions.gen_salt('bf', 10)), true, v_autor);

  for i in 1 .. k_n loop
    for j in 0 .. 4 loop
      p := ((i + j) % 5) + 1;
      delete from public.porta_tentativas;
      execute 'set local role anon';
      v_ini := clock_timestamp();
      v_r := case p
        when 1 then public.relatorio_publico_abrir('f68-sabd-a', '', '10.68.2.1')
        when 2 then public.relatorio_publico_abrir('f68-sabd-a', 'senha-errada-ficticia', '10.68.2.1')
        when 3 then public.relatorio_publico_abrir('f68-sabd-a', 'senha-revogada-a', '10.68.2.1')
        when 4 then public.relatorio_publico_abrir('f68-sabd-inexistente', 'qualquer', '10.68.2.1')
        else public.relatorio_publico_abrir('f68-sabd-b', 'senha-certa-a', '10.68.2.1')
      end;
      v_ms := extract(epoch from clock_timestamp() - v_ini) * 1000;
      execute 'reset role';
      v_amostras[p][i] := v_ms;
    end loop;
  end loop;

  for p in 1 .. 5 loop
    v_med := v_med || (select percentile_cont(0.5) within group (order by x)::numeric from unnest(v_amostras[p:p][1:k_n]) x);
  end loop;
  select percentile_cont(0.5) within group (order by x)::numeric into v_geral from unnest(v_amostras[1:5][1:k_n]) x;
  for p in 1 .. 5 loop
    v_txt := v_txt || k_caminhos[p] || ' ' || round(v_med[p], 1) || ' ms (' || round((v_med[p] / nullif(v_geral, 0) - 1) * 100, 1) || '%); ';
    if v_geral = 0 or abs(v_med[p] / v_geral - 1) > 0.10 then v_fora := v_fora || k_caminhos[p]; end if;
  end loop;

  raise exception 'F68 SABOTAGEM D (ensaio, n=% por caminho, o crypt pulado nas posições vazias): mediana geral % ms; %fora dos ±10%%: % → %. (rollback: este raise desfaz a sabotagem e as fixtures)',
    k_n, round(v_geral, 1), v_txt, coalesce(nullif(array_to_string(v_fora, ', '), ''), 'nenhum'),
    case when cardinality(v_fora) > 0 then 'ACUSADA pela régua do tempo' else 'NÃO ACUSADA' end;
end
$sabotagem_d$;
