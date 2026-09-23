-- =============================================================
-- Roteiro de teste: O KIT COM MOTIVO DA EMPRESA DO KIT (F64, 23/09/2026) — a sabotagem C
-- =============================================================
-- O motivo de um kit mora como TEXTO dentro do `payload` jsonb de `kits_modelos` (0043), fora do
-- alcance de qualquer FK — FK composta não alcança jsonb. A F64 fecha o furo em duas peças (0164):
--   · o gatilho `kits_modelos_motivo_da_empresa` (função `kit_motivo_da_empresa`, INVOKER): se o
--     payload tem motivo, tem de existir linha em `motivos` com esse `codigo` E o MESMO
--     `empresa_id` do kit (ativa ou não — o fluxo re-filtra ao aplicar). Senão, 23503 com frase
--     própria. Confere a ENTRADA na orfandade: no INSERT sempre; no UPDATE só quando o motivo ou a
--     empresa MUDAM — desativar um kit que já estava órfão continua possível pela tela (o
--     `atualizarKit` reenvia o payload inteiro);
--   · a 13ª peça de `checagens_integridade_nucleo()`, `kit_motivo_orfao`: conta o kit (ativo ou não)
--     que JÁ está órfão, com o id na amostra.
-- Este roteiro prova, com dado 100% fictício e uma empresa B fictícia com um motivo que só existe
-- nela:
--   C1 — INSERT com motivo inexistente: RECUSADO (e, como postgres, o kit não ficou);
--   C2 — INSERT de kit da WAP com o motivo da empresa B: RECUSADO (e não ficou);
--   C3 — kit SEM motivo (chave ausente, null JSON, texto vazio, só espaços): ACEITO — e o null JSON
--        de `->>` é SQL NULL (a doc do PG 17 não o frasea; aqui fica provado);
--   C4 — kit com motivo da PRÓPRIA empresa (da WAP na WAP, da B na B): ACEITO;
--   C5 — UPDATE que troca o motivo por um inexistente, por um da outra empresa, ou que muda a
--        empresa do kit para uma onde o motivo não existe: RECUSADO (e o dado fica);
--   C6 — um kit órfão FABRICADO com o gatilho desligado (na transação do roteiro): a checagem nova
--        conta cada um, com o id na amostra; DESATIVÁ-LO continua possível (pelo `update` de uma
--        coluna e pelo da tela, que reenvia o payload); e ele continua contado (a checagem conta
--        todo kit — a reativação não passa pelo gatilho);
--   C7 — corrigir o órfão (tirar o motivo) passa pelo gatilho e a checagem desce;
--   C8 — as 12 peças antigas do núcleo estão BYTE A BYTE (o md5 de cada `return query … from d;`
--        contra o da 0158, calculado do arquivo — e que é o mesmo `prosrc` dos dois bancos,
--        06359abd…), e o núcleo tem 13 peças;
--   C9 — pela SESSÃO de um admin (authenticated, RLS ligada): o gatilho INVOKER lê `motivos` pelo
--        piso de leitura — aceita o motivo da empresa do kit e recusa o da outra.
-- Toda recusa provada duas vezes (a falha e, de volta como postgres, o dado intacto). Tudo por
-- `pg_temp.assert_zero_de`, que recusa universo vazio; rótulo literal (o injetor lê por token).
-- ESCREVE — `begin; … rollback;`: nada sobra no banco.
--
-- ⚠ ESTE ROTEIRO NASCEU VERMELHO (push das travas da F64, antes da 0162–0164): sem a coluna em
-- `motivos`, sem o gatilho e sem a 13ª peça, cada caso degrada para um ✗ nomeado (o `execute` e o
-- bloco de exceção de cada caso seguram o erro de coluna/gatilho inexistente) — a evidência está
-- em docs/f64-evidencias/B-travas/.
-- =============================================================

begin;

-- C9 é pela sessão de um admin: os grants que o `supabase start` não dá (o CI não tem grant em
-- `public` — supabase/CLAUDE.md). Só a tabela/verbo que o caso usa.
grant select on public.motivos, public.kits_modelos to authenticated;   -- C9: o gatilho lê motivos; o RETURNING lê o kit
grant insert on public.kits_modelos to authenticated;                   -- C9: o admin grava o kit

-- Tenta gravar um kit (como o papel da hora) e devolve 'aceito' ou 'SQLSTATE: mensagem'. A empresa
-- vai por SQL dinâmico: antes da 0163 a coluna não existe, e o erro vira o ✗ do caso, não o fim do
-- roteiro.
create function pg_temp.f64_kit(p_nome text, p_payload jsonb, p_empresa uuid default null)
returns text
language plpgsql
as $f$
begin
  if p_empresa is null then
    insert into public.kits_modelos (nome, payload, criado_por)
    values (p_nome, p_payload, '64000000-0000-4000-8000-00000000c0de');
  else
    execute 'insert into public.kits_modelos (nome, payload, criado_por, empresa_id) values ($1, $2, $3, $4)'
      using p_nome, p_payload, '64000000-0000-4000-8000-00000000c0de'::uuid, p_empresa;
  end if;
  return 'aceito';
exception when others then
  return sqlstate || ': ' || sqlerrm;
end
$f$;

-- A recusa DO GATILHO: 23503 com a frase própria (não a FK de verdade, que diz "foreign key").
create function pg_temp.f64_recusa_do_kit(p_resultado text)
returns boolean
language sql
as $f$
  select p_resultado like '23503: %' and p_resultado like '%não existe na empresa do kit%'
$f$;

-- A 13ª peça, como postgres (o núcleo é fechado a todo papel da API): o total, ou -1 se a chave não
-- existe (antes da 0164).
create function pg_temp.f64_orfaos()
returns bigint
language sql
as $f$
  select coalesce((select n.total from public.checagens_integridade_nucleo() n where n.chave = 'kit_motivo_orfao'), -1)
$f$;

do $$
declare
  v_ok     int := 0;
  v_falhas int := 0;

  k_admin   constant uuid := '64000000-0000-4000-8000-00000000c0de';
  k_legada  uuid := public.empresa_legada();
  k_emp_b   uuid;

  -- O md5 de cada uma das 12 peças do núcleo na 0158 (calculado do arquivo, o mesmo texto que o
  -- `prosrc` dos dois bancos guarda — md5 do corpo inteiro 06359abd286206bde8432609128ebccd, medido
  -- pelo MCP em produção e no ensaio em 23/09/2026). A 0164 acrescenta a 13ª e não toca nestas.
  k_pecas_0158 constant text[] := array[
    'patrimonio_duplicado:edad45c10d5d7167275eb5e98b77ddf5',
    'ativo_filial_inativa:5ecc19e57e6d7fa086d8722dd62daa5b',
    'termo_sem_arquivo:40d1eca73e3a9f38d7eab7dd428be680',
    'perfil_sem_conta:da4cd7036ec01a689bcdb1135a391418',
    'conta_sem_perfil:823aed733b8328949679b3ec99175093',
    'pendencia_de_estornada:f554a49743a8b4941f5256b4a30ce564',
    'operador_sem_filial:0f9ab464e82fb050b20ecc5ad15a4801',
    'arquivo_termo_orfao:0a7c1a70c92a2bf8cf895af830bc950f',
    'conflito_entre_filiais:37012c5ebb03917838034060aec41eae',
    'detentor_em_estado_sem_dono:a57b0927a6787938cbfd9f102edc4554',
    'reserva_aberta:e25b5ad5bf7b5e34dfeb579b83f14420',
    'backup_orfao:aaed90c40f1e086e748436c4dc52f122'];

  v_col     boolean;
  v_gat     boolean;
  v_res     text;
  v_rot     text;
  v_ruins   bigint;
  v_n       bigint;
  v_antes   bigint;
  v_depois  bigint;
  v_kit     uuid;
  v_kit_b   uuid;
  v_orfao   uuid;
  v_orfao_b uuid;
  v_amostra text[];
  v_txt     text;
begin
  -- O trigger `handle_new_user` cria o profile e a membership na empresa legada (domínio corporativo).
  insert into auth.users (id, instance_id, aud, role, email,
                          encrypted_password, email_confirmed_at, created_at, updated_at)
  values (k_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'f64.kit@wap.ind.br', '', now(), now(), now());
  perform pg_temp.plantar_cargo(k_admin, 'admin');

  v_col := exists (select 1 from pg_attribute a
                    where a.attrelid = 'public.motivos'::regclass and a.attname = 'empresa_id' and not a.attisdropped);
  v_gat := exists (select 1 from pg_trigger t
                    where t.tgrelid = 'public.kits_modelos'::regclass and t.tgname = 'kits_modelos_motivo_da_empresa');
  raise notice '(medição) motivos.empresa_id existe: % · o gatilho do kit existe: % · kit_motivo_orfao antes: %',
    v_col, v_gat, pg_temp.f64_orfaos();

  -- A FIXTURE: a empresa B, um motivo que SÓ existe nela, e um motivo da WAP (o default).
  insert into public.empresas (slug, nome) values ('f64-kit-b', 'Empresa B do kit (F64)') returning id into k_emp_b;
  insert into public.motivos (codigo, rotulo, aplica_a)
  values ('f64-da-wap', 'Motivo F64 da WAP', array['saida']::public.tipo_movimentacao[]);
  begin
    execute 'insert into public.motivos (codigo, rotulo, aplica_a, empresa_id) values ($1, $2, $3, $4)'
      using 'f64-so-na-b', 'Motivo F64 só da empresa B', array['saida']::public.tipo_movimentacao[], k_emp_b;
  exception when others then
    raise notice '(medição) o motivo da empresa B não nasceu: % — %', sqlstate, sqlerrm;
  end;

  -- ==========================================================================
  -- C1 — motivo INEXISTENTE: recusado, e o kit não ficou.
  -- ==========================================================================
  v_res := pg_temp.f64_kit('F64 kit motivo inexistente', '{"tipo": "saida", "motivo": "f64-inexistente", "categorias": ["notebook"]}');
  select count(*) into v_n from public.kits_modelos where nome = 'F64 kit motivo inexistente';
  if pg_temp.assert_zero_de('C1 kit com motivo INEXISTENTE é recusado pelo gatilho (23503, a frase do kit) e, como postgres, o kit não ficou' ||
       case when not pg_temp.f64_recusa_do_kit(v_res) or v_n > 0 then ' — ' || v_res || ' · ficou: ' || v_n else '' end,
       (case when pg_temp.f64_recusa_do_kit(v_res) then 0 else 1 end) + least(v_n, 1), 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- C2 — o motivo da EMPRESA B num kit da WAP: recusado, e não ficou.
  -- ==========================================================================
  v_res := pg_temp.f64_kit('F64 kit da WAP com motivo da B', '{"tipo": "saida", "motivo": "f64-so-na-b", "categorias": ["notebook"]}');
  select count(*) into v_n from public.kits_modelos where nome = 'F64 kit da WAP com motivo da B';
  if pg_temp.assert_zero_de('C2 kit da WAP com o motivo que só existe na empresa B é recusado (o motivo tem de ser da EMPRESA DO KIT) e o kit não ficou' ||
       case when not pg_temp.f64_recusa_do_kit(v_res) or v_n > 0 then ' — ' || v_res || ' · ficou: ' || v_n else '' end,
       (case when pg_temp.f64_recusa_do_kit(v_res) then 0 else 1 end) + least(v_n, 1), 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- C3 — SEM motivo: aceito nas quatro formas; e o null JSON de `->>` é SQL NULL.
  -- ==========================================================================
  v_ruins := 0; v_rot := '';
  foreach v_txt in array array[
    '{"tipo": "saida", "categorias": ["notebook"]}',
    '{"tipo": "saida", "motivo": null, "categorias": ["notebook"]}',
    '{"tipo": "saida", "motivo": "", "categorias": ["notebook"]}',
    '{"tipo": "saida", "motivo": "   ", "categorias": ["notebook"]}'] loop
    v_res := pg_temp.f64_kit('F64 kit sem motivo ' || md5(v_txt), v_txt::jsonb);
    if v_res <> 'aceito' then v_ruins := v_ruins + 1; v_rot := v_rot || ' ' || v_txt || ' → ' || v_res; end if;
  end loop;
  if ('{"motivo": null}'::jsonb ->> 'motivo') is not null then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' (o null JSON de ->> não é SQL NULL)';
  end if;
  if pg_temp.assert_zero_de('C3 kit SEM motivo (chave ausente, null JSON, vazio, só espaços) é aceito — e o null JSON de ->> é SQL NULL' ||
       case when v_ruins > 0 then ' — fora da regra:' || v_rot else '' end, v_ruins, 5) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- C4 — motivo da PRÓPRIA empresa: aceito (da WAP na WAP; da B num kit da B).
  -- ==========================================================================
  v_ruins := 0; v_rot := '';
  v_res := pg_temp.f64_kit('F64 kit da WAP com motivo da WAP', '{"tipo": "saida", "motivo": "f64-da-wap", "categorias": ["notebook"]}');
  if v_res <> 'aceito' then v_ruins := v_ruins + 1; v_rot := v_rot || ' WAP → ' || v_res; end if;
  select id into v_kit from public.kits_modelos where nome = 'F64 kit da WAP com motivo da WAP';
  v_res := pg_temp.f64_kit('F64 kit da B com motivo da B', '{"tipo": "saida", "motivo": "f64-so-na-b", "categorias": ["notebook"]}', k_emp_b);
  if v_res <> 'aceito' then v_ruins := v_ruins + 1; v_rot := v_rot || ' B → ' || v_res; end if;
  select id into v_kit_b from public.kits_modelos where nome = 'F64 kit da B com motivo da B';
  if pg_temp.assert_zero_de('C4 kit com o motivo da PRÓPRIA empresa é aceito (o da WAP na WAP, o da B num kit da B)' ||
       case when v_ruins > 0 then ' — fora da regra:' || v_rot else '' end, v_ruins, 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- C5 — UPDATE que leva o kit à orfandade: recusado, e o dado fica.
  -- ==========================================================================
  v_ruins := 0; v_rot := '';
  if v_kit is null then
    v_ruins := 3; v_rot := ' (o kit do C4 não nasceu)';
  else
    begin
      update public.kits_modelos set payload = jsonb_set(payload, '{motivo}', '"f64-inexistente"') where id = v_kit;
      v_ruins := v_ruins + 1; v_rot := v_rot || ' motivo-inexistente(passou)';
    exception when others then
      if not pg_temp.f64_recusa_do_kit(sqlstate || ': ' || sqlerrm) then
        v_ruins := v_ruins + 1; v_rot := v_rot || ' motivo-inexistente(' || sqlstate || ')';
      end if;
    end;
    begin
      update public.kits_modelos set payload = jsonb_set(payload, '{motivo}', '"f64-so-na-b"') where id = v_kit;
      v_ruins := v_ruins + 1; v_rot := v_rot || ' motivo-da-B(passou)';
    exception when others then
      if not pg_temp.f64_recusa_do_kit(sqlstate || ': ' || sqlerrm) then
        v_ruins := v_ruins + 1; v_rot := v_rot || ' motivo-da-B(' || sqlstate || ')';
      end if;
    end;
    begin
      execute 'update public.kits_modelos set empresa_id = $1 where id = $2' using k_emp_b, v_kit;
      v_ruins := v_ruins + 1; v_rot := v_rot || ' empresa-para-B(passou)';
    exception when others then
      if not pg_temp.f64_recusa_do_kit(sqlstate || ': ' || sqlerrm) then
        v_ruins := v_ruins + 1; v_rot := v_rot || ' empresa-para-B(' || sqlstate || ')';
      end if;
    end;
  end if;
  if pg_temp.assert_zero_de('C5 o UPDATE que troca o motivo por um inexistente, pelo da outra empresa, ou muda a empresa do kit para uma sem o motivo é recusado' ||
       case when v_ruins > 0 then ' — fora da regra:' || v_rot else '' end, v_ruins, 3) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- a segunda metade: como postgres, o kit continua com o motivo da WAP (e na WAP). Duas
  -- conferências — o motivo e a empresa —, e por isso universo 2: sem o gatilho (a mutação
  -- f64-kit-sem-gatilho) as duas escritas passam e as duas caem aqui.
  v_ruins := 0;
  if v_kit is null then
    v_ruins := 2;
  else
    select count(*) into v_ruins from public.kits_modelos
     where id = v_kit and payload->>'motivo' is distinct from 'f64-da-wap';
    if v_col then
      execute 'select $1 + count(*) from public.kits_modelos where id = $2 and empresa_id is distinct from $3'
        into v_ruins using v_ruins, v_kit, k_legada;
    end if;
  end if;
  if pg_temp.assert_zero_de('C5-bis de volta como postgres, o kit recusado continua com o motivo e a empresa de antes', v_ruins, 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- C6 — o órfão FABRICADO (gatilho desligado na transação): a checagem o conta; desativar passa.
  -- ==========================================================================
  v_antes := pg_temp.f64_orfaos();
  v_rot := '';
  begin
    alter table public.kits_modelos disable trigger kits_modelos_motivo_da_empresa;
  exception when others then
    v_rot := v_rot || ' (não desligou o gatilho: ' || sqlstate || ')';
  end;
  v_res := pg_temp.f64_kit('F64 kit órfão fabricado', '{"tipo": "saida", "motivo": "f64-inexistente", "categorias": ["notebook"]}');
  select id into v_orfao from public.kits_modelos where nome = 'F64 kit órfão fabricado';
  v_res := pg_temp.f64_kit('F64 kit da WAP órfão com motivo da B', '{"tipo": "saida", "motivo": "f64-so-na-b", "categorias": ["notebook"]}');
  select id into v_orfao_b from public.kits_modelos where nome = 'F64 kit da WAP órfão com motivo da B';
  begin
    alter table public.kits_modelos enable trigger kits_modelos_motivo_da_empresa;
  exception when others then
    null;
  end;
  v_depois := pg_temp.f64_orfaos();
  select n.amostra into v_amostra from public.checagens_integridade_nucleo() n where n.chave = 'kit_motivo_orfao';
  raise notice '(medição) C6 kit_motivo_orfao: % → % · amostra com os dois ids: %',
    v_antes, v_depois, coalesce(v_orfao::text = any (v_amostra) and v_orfao_b::text = any (v_amostra), false);
  if pg_temp.assert_zero_de('C6a a checagem nova conta cada kit órfão fabricado — o do motivo inexistente E o da WAP com o motivo da empresa B' ||
       case when v_antes < 0 or v_depois - v_antes <> 2 or v_orfao is null or v_orfao_b is null
            then ' — ' || v_antes || ' → ' || v_depois || v_rot else '' end,
       case when v_antes >= 0 and v_depois - v_antes = 2 and v_orfao is not null and v_orfao_b is not null then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('C6b a amostra da checagem nova traz o id de cada kit órfão (nenhum código de motivo, nenhum nome)',
       case when coalesce(v_orfao::text = any (v_amostra) and v_orfao_b::text = any (v_amostra), false) then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- desativar o órfão: pela coluna só, e pela forma da tela (o `atualizarKit` reenvia nome e payload)
  v_ruins := 0; v_rot := '';
  begin
    update public.kits_modelos set ativo = false where id = v_orfao;
  exception when others then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' so-ativo(' || sqlstate || ')';
  end;
  begin
    update public.kits_modelos set nome = nome || ' (desativado)', payload = payload, ativo = false where id = v_orfao_b;
  exception when others then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' forma-da-tela(' || sqlstate || ')';
  end;
  select v_ruins + count(*) filter (where ativo) into v_ruins
    from public.kits_modelos where id in (v_orfao, v_orfao_b);
  if pg_temp.assert_zero_de('C6c DESATIVAR um kit órfão continua possível — pelo update só do ativo e pelo da tela, que reenvia o payload' ||
       case when v_ruins > 0 then ' — fora da regra:' || v_rot else '' end,
       v_ruins, 4) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  if pg_temp.assert_zero_de('C6d o órfão desativado continua contado (a checagem conta todo kit: a reativação não passa pelo gatilho)',
       case when v_antes >= 0 and pg_temp.f64_orfaos() - v_antes = 2 then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- C7 — corrigir o órfão (tirar o motivo) passa pelo gatilho, e a checagem desce.
  -- ==========================================================================
  v_res := 'aceito';
  begin
    update public.kits_modelos set payload = payload - 'motivo' where id = v_orfao;
  exception when others then
    v_res := sqlstate || ': ' || sqlerrm;
  end;
  if pg_temp.assert_zero_de('C7 tirar o motivo do kit órfão é aceito, e a checagem nova desce um' ||
       case when v_res <> 'aceito' then ' — ' || v_res else '' end,
       (case when v_res = 'aceito' then 0 else 1 end)
       + (case when v_antes >= 0 and pg_temp.f64_orfaos() - v_antes = 1 then 0 else 1 end), 2) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- C8 — as 12 peças antigas do núcleo, byte a byte; e 13 peças.
  -- ==========================================================================
  with pecas as (
    select m[1] as trecho, substring(m[1] from '''([a-z_]+)''::text') as chave
      from pg_proc p
      cross join lateral regexp_matches(p.prosrc, '(return query.*?from d;)', 'g') as m
     where p.oid = 'public.checagens_integridade_nucleo()'::regprocedure
  ), esperadas as (
    select split_part(e, ':', 1) as chave, split_part(e, ':', 2) as md5 from unnest(k_pecas_0158) as e
  )
  select count(*) filter (where p.chave is null or md5(p.trecho) <> e.md5),
         coalesce(string_agg(e.chave, ', ') filter (where p.chave is null or md5(p.trecho) <> e.md5), '')
    into v_ruins, v_rot
    from esperadas e left join pecas p on p.chave = e.chave;
  if pg_temp.assert_zero_de('C8a as 12 peças antigas de checagens_integridade_nucleo estão byte a byte (o md5 de cada uma contra o da 0158)' ||
       case when v_ruins > 0 then ' — mudou: ' || v_rot else '' end, v_ruins, 12) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;
  select count(*) into v_n
    from pg_proc p cross join lateral regexp_matches(p.prosrc, '(return query.*?from d;)', 'g') as m
   where p.oid = 'public.checagens_integridade_nucleo()'::regprocedure;
  if pg_temp.assert_zero_de('C8b o núcleo tem 13 peças — as 12 e a kit_motivo_orfao' ||
       case when v_n <> 13 then ' — tem ' || v_n else '' end,
       case when v_n = 13 and exists (select 1 from public.checagens_integridade_nucleo() n where n.chave = 'kit_motivo_orfao') then 0 else 1 end, 1) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- C9 — pela SESSÃO de um admin (RLS ligada): o gatilho INVOKER enxerga `motivos` pelo piso.
  -- ==========================================================================
  v_ruins := 0; v_rot := '';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', k_admin, 'role', 'authenticated')::text, true);
  begin
    insert into public.kits_modelos (nome, payload, criado_por)
    values ('F64 kit do admin com motivo da WAP', '{"tipo": "saida", "motivo": "f64-da-wap", "categorias": ["notebook"]}', k_admin);
  exception when others then
    v_ruins := v_ruins + 1; v_rot := v_rot || ' motivo-da-WAP(' || sqlstate || ': ' || sqlerrm || ')';
  end;
  begin
    insert into public.kits_modelos (nome, payload, criado_por)
    values ('F64 kit do admin com motivo da B', '{"tipo": "saida", "motivo": "f64-so-na-b", "categorias": ["notebook"]}', k_admin);
    v_ruins := v_ruins + 1; v_rot := v_rot || ' motivo-da-B(passou)';
  exception when others then
    if not pg_temp.f64_recusa_do_kit(sqlstate || ': ' || sqlerrm) then
      v_ruins := v_ruins + 1; v_rot := v_rot || ' motivo-da-B(' || sqlstate || ')';
    end if;
  end;
  reset role;
  select v_ruins + count(*) into v_ruins from public.kits_modelos where nome = 'F64 kit do admin com motivo da B';
  select v_ruins + (1 - count(*)) into v_ruins from public.kits_modelos where nome = 'F64 kit do admin com motivo da WAP';
  if pg_temp.assert_zero_de('C9 pela sessão de um admin (RLS ligada) o gatilho aceita o motivo da empresa do kit e recusa o da outra — e, como postgres, só o aceito ficou' ||
       case when v_ruins > 0 then ' — fora da regra:' || v_rot else '' end, v_ruins, 4) then
    v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  raise notice 'FIM kit_motivo_da_empresa: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
