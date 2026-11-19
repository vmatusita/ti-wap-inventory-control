-- F68 · sabotagem B — "as duas empresas com a MESMA senha em claro: cada uma abre só a sua; a de A no slug de B é recusada.
-- Trocando, numa subtransação, a busca de candidatas para ignorar a empresa: o roteiro acusa." Dentro do bloco (desfeito
-- pelo raise final): primeiro a porta INTACTA (a senha só de A no slug de B → a recusa uniforme); depois o corpo vivo de
-- relatorio_publico_abrir com a busca de candidatas SEM a empresa, e a mesma chamada. Esperado: a resposta deixa de ser a
-- recusa — o erro 23503 da FK composta (empresa_id, senha_id) da sessão, a segunda defesa, impede a sessão cruzada.
do $sabotagem_b$
declare
  v_def text;
  v_de constant text := 'where s.empresa_id = v_empresa and s.ativa and s.hash like ''$2%''';
  v_autor uuid;
  v_a uuid;
  v_b uuid;
  v_intacta jsonb;
  v_igual_a text;
  v_igual_b text;
  v_sabotada text;
begin
  select u.id into v_autor from auth.users u order by u.created_at limit 1;
  insert into public.empresas (slug, nome) values ('f68-sabb-a', 'Fictícia A (F68 sabotagem B)') returning id into v_a;
  insert into public.empresas (slug, nome) values ('f68-sabb-b', 'Fictícia B (F68 sabotagem B)') returning id into v_b;
  insert into public.senhas_acesso (empresa_id, rotulo, hash, ativa, criado_por) values
    (v_a, 'Igual A', extensions.crypt('senha-igual-nas-duas', extensions.gen_salt('bf', 10)), true, v_autor),
    (v_b, 'Igual B', extensions.crypt('senha-igual-nas-duas', extensions.gen_salt('bf', 10)), true, v_autor),
    (v_a, 'Só da A', extensions.crypt('senha-so-da-a', extensions.gen_salt('bf', 10)), true, v_autor);

  -- a porta INTACTA
  execute 'set local role anon';
  v_igual_a := case when (public.relatorio_publico_abrir('f68-sabb-a', 'senha-igual-nas-duas', '10.68.3.1') ->> 'ok') = 'true' then 'abre' else 'não abre' end;
  v_igual_b := case when (public.relatorio_publico_abrir('f68-sabb-b', 'senha-igual-nas-duas', '10.68.3.2') ->> 'ok') = 'true' then 'abre' else 'não abre' end;
  v_intacta := public.relatorio_publico_abrir('f68-sabb-b', 'senha-so-da-a', '10.68.3.3');
  execute 'reset role';

  -- a SABOTAGEM: a busca de candidatas sem a empresa
  v_def := pg_get_functiondef('public.relatorio_publico_abrir(text, text, text)'::regprocedure);
  if (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'F68 SABOTAGEM B: a âncora da busca de candidatas não está no corpo vivo exatamente uma vez — nada provado';
  end if;
  execute replace(v_def, v_de, 'where s.ativa and s.hash like ''$2%''  /* SABOTAGEM B (ensaio) */');

  execute 'set local role anon';
  begin
    v_sabotada := case
      when public.relatorio_publico_abrir('f68-sabb-b', 'senha-so-da-a', '10.68.3.4') = '{"ok": false}'::jsonb
        then 'a recusa uniforme (NÃO ACUSADA)'
      else 'outra resposta (ACUSADA)' end;
  exception when others then
    v_sabotada := 'erro ' || sqlstate || ' (ACUSADA' || case when sqlstate = '23503' then ': a FK composta da sessão' else '' end || ')';
  end;
  execute 'reset role';

  raise exception 'F68 SABOTAGEM B (ensaio): a mesma senha em claro nas duas — A %, B %; a senha só de A no slug de B, porta intacta: %; com a busca de candidatas SEM a empresa: %. (rollback: este raise desfaz a sabotagem e as fixtures)',
    v_igual_a, v_igual_b, case when v_intacta = '{"ok": false}'::jsonb then 'a recusa uniforme' else 'OUTRA RESPOSTA' end, v_sabotada;
end
$sabotagem_b$;
