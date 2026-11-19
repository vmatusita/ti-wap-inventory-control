-- F68 · decisão 4 — A RÉGUA DO TEMPO no ENSAIO, escrita ANTES de medir: n = 30 por caminho, as cinco recusas
-- intercaladas (a ordem gira a cada rodada, para que a deriva do servidor não caia num caminho só), o contador zerado
-- antes de cada chamada (o teto por empresa, 20/60 s, não pode entrar na medição), e o critério: a mediana de CADA
-- caminho a ±10% da mediana geral das recusas. A abertura (a senha certa) é medida junto, só como referência — ela já se
-- distingue pela resposta. Termina em `raise` (nada fica no ensaio); a saída são só números.
do $tempo$
declare
  k_n constant int := 30;
  k_caminhos constant text[] := array['sem senha', 'senha errada', 'senha revogada', 'slug inexistente', 'senha de A no slug de B'];
  v_autor uuid;
  v_a uuid;
  v_b uuid;
  v_ini timestamptz;
  v_ms numeric;
  v_r jsonb;
  v_amostras numeric[][] := array_fill(0::numeric, array[6, k_n]);
  v_med numeric[] := '{}';
  v_geral numeric;
  v_fora text[] := '{}';
  v_txt text := '';
  v_abertas int := 0;
  v_recusas_diferentes int := 0;
  i int;
  j int;
  p int;
begin
  select u.id into v_autor from auth.users u order by u.created_at limit 1;
  insert into public.empresas (slug, nome) values ('f68-tempo-a', 'Fictícia A (F68 tempo)') returning id into v_a;
  insert into public.empresas (slug, nome) values ('f68-tempo-b', 'Fictícia B (F68 tempo)') returning id into v_b;
  insert into public.senhas_acesso (empresa_id, rotulo, hash, ativa, criado_por) values
    (v_a, 'Tempo A', extensions.crypt('senha-certa-a', extensions.gen_salt('bf', 10)), true, v_autor),
    (v_a, 'Revogada A', extensions.crypt('senha-revogada-a', extensions.gen_salt('bf', 10)), false, v_autor),
    (v_b, 'Tempo B', extensions.crypt('senha-certa-b', extensions.gen_salt('bf', 10)), true, v_autor);

  for i in 1 .. k_n loop
    for j in 0 .. 5 loop
      p := ((i + j) % 6) + 1;   -- a ordem gira a cada rodada
      delete from public.porta_tentativas;   -- (dentro da transação do bloco; desfeito pelo raise)
      execute 'set local role anon';
      v_ini := clock_timestamp();
      v_r := case p
        when 1 then public.relatorio_publico_abrir('f68-tempo-a', '', '10.68.1.1')
        when 2 then public.relatorio_publico_abrir('f68-tempo-a', 'senha-errada-ficticia', '10.68.1.1')
        when 3 then public.relatorio_publico_abrir('f68-tempo-a', 'senha-revogada-a', '10.68.1.1')
        when 4 then public.relatorio_publico_abrir('f68-tempo-inexistente', 'qualquer', '10.68.1.1')
        when 5 then public.relatorio_publico_abrir('f68-tempo-b', 'senha-certa-a', '10.68.1.1')
        else public.relatorio_publico_abrir('f68-tempo-a', 'senha-certa-a', '10.68.1.1')
      end;
      v_ms := extract(epoch from clock_timestamp() - v_ini) * 1000;
      execute 'reset role';
      v_amostras[p][i] := v_ms;
      if p = 6 then
        if (v_r ->> 'ok') = 'true' then v_abertas := v_abertas + 1; end if;
      elsif v_r is distinct from '{"ok": false}'::jsonb then
        v_recusas_diferentes := v_recusas_diferentes + 1;
      end if;
    end loop;
  end loop;

  for p in 1 .. 6 loop
    v_med := v_med || (select percentile_cont(0.5) within group (order by x)::numeric
                         from unnest(v_amostras[p:p][1:k_n]) x);
  end loop;
  select percentile_cont(0.5) within group (order by x)::numeric into v_geral
    from unnest(v_amostras[1:5][1:k_n]) x;
  for p in 1 .. 5 loop
    v_txt := v_txt || k_caminhos[p] || ' ' || round(v_med[p], 1) || ' ms (' || round((v_med[p] / v_geral - 1) * 100, 1) || '%); ';
    if abs(v_med[p] / v_geral - 1) > 0.10 then v_fora := v_fora || k_caminhos[p]; end if;
  end loop;

  raise exception 'F68 TEMPO DAS RECUSAS (ensaio, n=% por caminho): mediana geral das recusas % ms; %abertura (referência) % ms; fora dos ±10%%: %; recusas com resposta diferente de {"ok": false}: %; aberturas OK: % de %. (rollback: este raise desfaz tudo)',
    k_n, round(v_geral, 1), v_txt, round(v_med[6], 1),
    coalesce(nullif(array_to_string(v_fora, ', '), ''), 'nenhum'), v_recusas_diferentes, v_abertas, k_n;
end
$tempo$;
