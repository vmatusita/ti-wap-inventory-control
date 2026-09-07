-- =============================================================
-- Roteiro de teste: A SUPERFÍCIE DECLARATIVA DE LEITURA (F48, 07/09/2026)
-- =============================================================
-- POR QUE AS TRÊS SUPERFÍCIES MORAM JUNTAS
--
-- Um dado sai deste sistema por quatro portas. Três delas são DECLARATIVAS — não se
-- lê o comportamento, lê-se o catálogo do Postgres e pronto:
--
--   · as policies de `public`          (`pg_policies`)
--   · as policies de `storage.objects` (`pg_policies`, outro schema)
--   · a publication do Realtime        (`pg_publication_tables`)
--
-- A quarta — as funções `security definer` — é DECLARATIVA também, mas o vocabulário
-- dela é outro (`pg_proc`, ACLs, `proconfig`) e o cabeçalho que ela precisa é longo;
-- por isso mora em `catalogo_secdef.sql`. Separar as TRÊS acima em três arquivos
-- multiplicaria este cabeçalho por três sem multiplicar cobertura nenhuma: elas leem
-- a MESMA visão de catálogo, com o mesmo método e o mesmo risco.
--
-- Até esta fase, NENHUMA das três era enumerada. Uma policy nova podia nascer
-- `using (true)`, uma policy de Storage podia decidir só por `bucket_id`, uma tabela
-- podia entrar na publication do Realtime — e nada no repositório se mexia. Na virada
-- multiempresa cada uma dessas três vira caminho de vazamento entre inquilinos, e o
-- momento de enumerá-las é ANTES de existir o segundo.
--
-- ESTA FASE SÓ ENUMERA. Nenhuma policy foi corrigida aqui; desvio encontrado vira
-- ACHADO no relatório, com severidade, e a decisão de corrigir é de fase própria.
--
-- SÓ LEITURA de catálogo — não grava nada, por isso dispensa `begin/rollback`, igual
-- a `seguranca_catalogo.sql`. Mesmo padrão de saída:
--   NOTICE  '✓ ...'  quando a invariante bate
--   WARNING '✗ ...'  quando NÃO bate (o runner falha em qualquer `WARNING: ✗`)
--
-- RELAÇÃO COM `seguranca_catalogo.sql` — NÃO DUPLICAR (F48, Decisão 2)
-- As varreduras schema-wide de RLS ligada (asserção 2 de lá) e de `security_invoker`
-- nas views (asserção 3) continuam MORANDO LÁ, e este arquivo não as repete. Três
-- mutações ativas do injetor miram aqueles dois rótulos, o motivo escrito da remoção
-- da isenção por prefixo (F47) vive no cabeçalho daquela asserção, e o
-- `RELATORIO-F47.md` §6.6 a cita nominalmente. Duas fontes para o mesmo fato é como
-- um gate morre: a que envelhecer primeiro vira a mentira.
-- =============================================================

do $$
declare
  v_ok     int := 0;   -- F45: quantas asserções passaram
  v_falhas int := 0;   -- F45: quantas falharam (a linha FIM soma as duas)
  v_cnt    bigint;
  v_univ   bigint;
  v_lista  text;

  -- =======================================================================
  -- A TABELA-VERDADE: NEGÓCIO × INFRA (F48, Decisão 1)
  --
  -- O CRITÉRIO, escrito antes da lista:
  --   NEGÓCIO — o conteúdo pertence ao ACERVO ou à OPERAÇÃO de UMA empresa e, na
  --             virada multiempresa, vai precisar da chave de recorte.
  --   INFRA   — o conteúdo é do MECANISMO do sistema (identidade da conta, marcador
  --             de ambiente, backup congelado de uma fase) e não se recorta por
  --             empresa, ou se recortará por outro caminho (`membros`), em fase própria.
  --
  -- ⚠ A classificação é uma TABELA-VERDADE, não um filtro esperto. Tabela nova não
  -- classificada REPROVA (asserção 1a) — é isso que faz este arquivo ser um CATÁLOGO
  -- derivado, e não uma lista que envelhece. E a asserção 3 garante que "infra" NÃO
  -- vira isenção: infra sem policy de SELECT também tem de estar declarada nominalmente.
  -- =======================================================================
  --
  -- ⚠ POR QUE ESTE CRITÉRIO, E NÃO "APARECE NUMA TELA DE OPERAÇÃO". O critério da tela
  -- é tentador e classifica `eventos_admin` e `import_logs` como infra — e o próprio
  -- plano diz, por escrito, que isso é o erro: ao descrever a varredura de recorte que
  -- a F63/F65 vai pôr em `isolamento_tenant.sql`, ele exige iterar "sobre o CATÁLOGO,
  -- nunca sobre lista de 20 nomes — `eventos_admin` é exatamente a tabela que uma lista
  -- à mão esqueceria" (PLANO-MULTIEMPRESA.md, §6 → F62). Uma trilha de auditoria das
  -- ações sobre o acervo da empresa A é dado da empresa A. NEGÓCIO.
  k_negocio text[] := array[
    'anotacoes', 'ativos', 'colaboradores', 'eventos_admin', 'filiais',
    'import_logs', 'itens', 'kits_modelos', 'lancamentos_item', 'motivos',
    'movimentacoes', 'pendencias_item', 'relatorios_gerados', 'senhas_acesso',
    'termos_gerados', 'tipos_item'
  ];

  -- INFRA — cinco, cada uma com o motivo escrito. Nenhuma entra por categoria:
  --   · profiles          (0001) — identidade da CONTA, não do acervo. Na virada o
  --                                cargo migra para `membros.papel` (plano §5 → F62,
  --                                decisão 6): quem se recorta é o vínculo, não a pessoa.
  --   · operador_filiais  (0061) — vínculo de ESCRITA de uma conta; mesmo destino.
  --   · senha_tentativas  (0025) — rate-limit por IP. A própria migration o chama de
  --                                "Infra de segurança" (0025:19), e a tabela guarda um
  --                                IP e um contador: nada de empresa nenhuma, nem
  --                                sequer a senha a que a tentativa se referia.
  --   · ambiente          (0090) — marcador de DEPLOY. O `comment on table` da 0090 diz
  --                                com todas as letras: "Não é configuração da aplicação:
  --                                nada no app lê esta tabela". Único consumidor:
  --                                `resetar_dados_ficticios()`.
  --   · _bkp_relatorios_gerados_f6a (0128) — backup CONGELADO de uma fase, adotado no
  --                                versionamento pela 0128, que a chama de "arquivo
  --                                morto de diagnóstico, não cadastro" (0128:97).
  k_infra text[] := array[
    'profiles', 'operador_filiais', 'senha_tentativas', 'ambiente',
    '_bkp_relatorios_gerados_f6a'
  ];

  -- =======================================================================
  -- AS EXCEÇÕES NOMINAIS DE "SEM POLICY DE SELECT" — deny-all POR AUSÊNCIA.
  --
  -- RLS ligada e ZERO policy não é esquecimento: é o idioma que este banco usa para
  -- "só o dono, e as `security definer` dele, enxergam". Cada uma tem o motivo escrito
  -- e a migration que a criou. NUNCA por categoria, por prefixo ou por "tabela
  -- sensível" — foi exatamente uma isenção por prefixo, sem motivo escrito, que a F47
  -- arrancou de `seguranca_catalogo.sql`.
  --
  --   · senhas_acesso     — a 0005 criou DUAS policies e a 0012 DROPOU as duas. A porta
  --                         pública por senha é servida pelo service role, fora da RLS;
  --                         deixar uma policy de SELECT para `authenticated` exporia o
  --                         hash a todo logado. É tabela de NEGÓCIO (a virada precisa
  --                         dela lá) E deny-all ao mesmo tempo — as duas coisas juntas
  --                         são o motivo de esta exceção existir.
  --   · senha_tentativas  — a 0025 liga a RLS e nunca cria policy. Mesmo idioma:
  --                         rate-limit da mesma porta, escrito por
  --                         `registrar_tentativa_senha()` (definer).
  --   · ambiente          — a 0090 escreve, na própria migration: "Sem NENHUMA policy:
  --                         invisível para anon e authenticated. Só o dono (e as funções
  --                         `security definer` dele) enxerga — mesmo idioma de
  --                         `senhas_acesso`/`senha_tentativas`."
  --
  -- ⚠ A asserção 4 confere esta lista no SENTIDO CONTRÁRIO: nome aqui que passe a TER
  -- policy de SELECT também REPROVA. Exceção não sobrevive ao motivo que a criou.
  -- =======================================================================
  k_sem_select text[] := array['senhas_acesso', 'senha_tentativas', 'ambiente'];

  -- =======================================================================
  -- O PISO DE LEITURA CONGELADO (R-ACC-25, migration 0070).
  --
  -- `profiles.ativo = false` fecha também a LEITURA, no request seguinte. O piso é
  -- `(select public.papel_atual()) is not null`, e ele está EXATAMENTE nestas 15
  -- policies de SELECT de `public` — nem uma a mais, nem uma a menos.
  --
  -- ⚠ A comparação é por `ilike '%papel_atual%'` e NÃO por igualdade de texto:
  -- `pg_policies.qual` devolve a expressão NORMALIZADA pelo Postgres. O que a
  -- migration escreveu como `(select public.papel_atual()) is not null` pode voltar
  -- como `((SELECT papel_atual() AS papel_atual) IS NOT NULL)`. Casar texto exato
  -- reprovaria por reescrita do planejador, que é ruído, não defeito.
  -- =======================================================================
  k_piso_papel text[] := array[
    'anotacoes', 'ativos', 'colaboradores', 'filiais', 'itens', 'kits_modelos',
    'lancamentos_item', 'motivos', 'movimentacoes', 'operador_filiais',
    'pendencias_item', 'profiles', 'relatorios_gerados', 'termos_gerados', 'tipos_item'
  ];

  -- As TRÊS que decidem por CARGO em vez do piso, e por quê — congeladas junto, para
  -- que uma delas afrouxar para `papel_atual()` (que é MAIS permissivo) reprove:
  --   · eventos_admin (0065) e import_logs (0063) — `e_admin()`: auditoria e trilha do
  --     import não são matéria de todo logado.
  --   · _bkp_relatorios_gerados_f6a (0128) — `e_dev()`: histórico congelado.
  k_piso_cargo text[] := array['eventos_admin', 'import_logs', '_bkp_relatorios_gerados_f6a'];

  -- =======================================================================
  -- AS 8 POLICIES DE `storage.objects`, congeladas nominalmente.
  -- Dois buckets: `termos` (0021, endurecido por 0069/0070/0072) e `backups-import`
  -- (0031, endurecido por 0066). Policy nova em Storage REPROVA até ser decidida.
  -- =======================================================================
  k_storage text[] := array[
    'termos leitura operador', 'termos insere operador',
    'termos atualiza operador', 'termos apaga operador',
    'backups-import leitura operador', 'backups-import insere operador',
    'backups-import atualiza operador', 'backups-import apaga operador'
  ];

  -- As funções do MODELO DE ACESSO. Uma policy de Storage que não cite NENHUMA delas
  -- está decidindo só por `bucket_id` — a forma que esta fase proíbe.
  k_funcoes_acesso text[] := array[
    'papel_atual', 'e_admin', 'e_dev', 'pode_escrever', 'pode_escrever_filial',
    'pode_escrever_termo', 'pode_escrever_arquivo_termo'
  ];

  -- =======================================================================
  -- A PUBLICATION DO REALTIME, congelada.
  -- `movimentacoes` entrou pela 0009; `lancamentos_item` e `anotacoes` pela 0018.
  -- Mais nada entrou desde então, e a AUSÊNCIA é decisão: a 0050 escreve, ao criar
  -- `pendencias_item`, que ela "NÃO entra na publication de realtime (/pendencias não
  -- usa realtime)". Por isso a asserção 9 congela o conjunto nos DOIS sentidos.
  -- =======================================================================
  k_realtime text[] := array['movimentacoes', 'lancamentos_item', 'anotacoes'];
begin
  -- ===============================================================
  -- BLOCO 1 — AS POLICIES DE `public`
  -- ===============================================================

  -- ---------------------------------------------------------------
  -- 1 — A TABELA-VERDADE cobre TODA tabela de `public`, nos dois sentidos.
  --     relkind r = tabela, p = particionada (o mesmo recorte da asserção 2 de
  --     `seguranca_catalogo.sql`, para os dois arquivos falarem do mesmo universo).
  -- ---------------------------------------------------------------
  select count(*) into v_univ
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p');

  select count(*), coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    into v_cnt, v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and not (c.relname = any (k_negocio)) and not (c.relname = any (k_infra));
  if pg_temp.assert_zero_de(
       '1a toda tabela de public está CLASSIFICADA negócio × infra' ||
       case when v_cnt > 0 then ' — não classificada(s): ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_negocio || k_infra) as nome
   where not exists (
     select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname = nome
   );
  if pg_temp.assert_zero_de(
       '1b todo nome classificado ainda existe no catálogo' ||
       case when v_cnt > 0 then ' — fantasma(s): ' || v_lista else '' end,
       v_cnt, (array_length(k_negocio, 1) + array_length(k_infra, 1))::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 2 — Toda tabela de NEGÓCIO tem policy de SELECT viva, salvo a lista NOMINAL.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_negocio) as nome
   where not (nome = any (k_sem_select))
     and not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = nome and p.cmd in ('SELECT', 'ALL')
     );
  if pg_temp.assert_zero_de(
       '2 toda tabela de NEGÓCIO tem policy de SELECT' ||
       case when v_cnt > 0 then ' — sem SELECT e sem exceção declarada: ' || v_lista else '' end,
       v_cnt, array_length(k_negocio, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 3 — INFRA NÃO É ISENÇÃO. Toda tabela de `public` sem policy de SELECT — negócio
  --     OU infra — tem de estar na lista NOMINAL de deny-all.
  --
  --     ⚠ ESTA É A ASSERÇÃO QUE FECHA O BURACO DA CATEGORIA. Sem ela, classificar uma
  --     tabela como "infra" seria uma isenção por categoria disfarçada — e uma tabela
  --     de infra nova, nascida sem policy nenhuma, entraria sem nada acusar. É o mesmo
  --     defeito da isenção por prefixo `_` que a F47 arrancou de
  --     `seguranca_catalogo.sql`, só que com outro nome.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    into v_cnt, v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and not (c.relname = any (k_sem_select))
     and not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname and p.cmd in ('SELECT', 'ALL')
     );
  if pg_temp.assert_zero_de(
       '3 nenhuma tabela de public fica sem SELECT por CATEGORIA' ||
       case when v_cnt > 0 then ' — sem SELECT e fora da lista nominal: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 4 — A SIMETRIA da lista de exceções: nome declarado deny-all que passe a TER
  --     policy de SELECT reprova. Sem esta metade, uma exceção sobreviveria ao motivo
  --     que a criou e ninguém saberia — que é como uma lista de exceções apodrece.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_sem_select) as nome
   where exists (
     select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = nome and p.cmd in ('SELECT', 'ALL')
   );
  if pg_temp.assert_zero_de(
       '4 toda exceção deny-all ainda descreve o banco' ||
       case when v_cnt > 0 then ' — ganhou policy de SELECT: ' || v_lista else '' end,
       v_cnt, array_length(k_sem_select, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 4-bis — `force row level security` DESLIGADO em TODA tabela de `public`.
  --
  --     A regra é R-ACC-29 (emenda F48 da MATRIZ-REGRAS), e ela existia só em PROSA —
  --     a `0070` explica as duas razões, e nenhuma asserção do repositório conferia que
  --     a proibição está sendo cumprida. Este é o par executável dela.
  --
  --     ⚠ E a proibição vale para as 21 tabelas, não só para as 4 que a `0070` cita.
  --     `force row level security` faz a RLS valer TAMBÉM PARA O DONO, e o sistema
  --     inteiro conta com o contrário:
  --       (1) em `profiles`, `papel_atual()` lê `profiles` e a policy de `profiles`
  --           chama `papel_atual()`. O ciclo só não fecha porque a função roda como o
  --           dono, que ignora RLS na própria tabela "salvo FORCE ROW LEVEL SECURITY"
  --           (0070:50-57). Ligá-lo derruba o sistema com `42P17` em TODA leitura,
  --           para TODO MUNDO, ao mesmo tempo.
  --       (2) em `ativos`, `movimentacoes` e `pendencias_item`, `aplicar_movimentacao`
  --           e o gatilho da `0051` escrevem FORA de policy contando com o mesmo bypass
  --           (0070:58-62). Ligá-lo quebra o registro de movimentação.
  --     Falha ruidosa, não silenciosa — e é justamente por ser ruidosa que ninguém
  --     nunca a escreveu como asserção. Ela custa uma linha e fecha a superfície.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    into v_cnt, v_lista
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relforcerowsecurity;
  if pg_temp.assert_zero_de(
       '4-bis `force row level security` desligado em toda tabela de public (R-ACC-29)' ||
       case when v_cnt > 0 then ' — ligado em: ' || v_lista || ' (espere 42P17)' else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 5 — NENHUMA POLICY, EM NENHUM VERBO, COM PREDICADO EQUIVALENTE A `true`.
  --
  --     `qual` é o `using` e `with_check` é o `with check`, ambos normalizados pelo
  --     Postgres: `using (true)` volta como a string `true`. Cobre `public` E
  --     `storage.objects` de uma vez — a porta é a mesma.
  --
  --     Ela nasce verde, e isso foi trabalho de outras fases: as dezenas de
  --     `using (true)` das migrations 0001/0005/0010/0014/0015/0017/0021 foram todas
  --     substituídas por `alter policy` nas 0059→0107. O último `with check (true)`
  --     vivo era o do INSERT de `import_logs`, deixado de propósito pela 0063:229 e
  --     fechado pela 0067:99. A própria 0067 traz, no rodapé, a consulta que esta
  --     asserção transforma em permanente, com o "esperado: 0 linhas" escrito ao lado.
  -- ---------------------------------------------------------------
  select count(*) into v_univ
    from pg_policies p
   where p.schemaname in ('public', 'storage');

  select count(*), coalesce(string_agg(p.schemaname || '.' || p.tablename || ' / ' || p.policyname, ', '
                                       order by p.schemaname, p.tablename, p.policyname), '')
    into v_cnt, v_lista
    from pg_policies p
   where p.schemaname in ('public', 'storage')
     and (btrim(coalesce(p.qual, ''), '() ') = 'true' or btrim(coalesce(p.with_check, ''), '() ') = 'true');
  if pg_temp.assert_zero_de(
       '5 nenhuma policy com predicado equivalente a `true`' ||
       case when v_cnt > 0 then ' — sempre-verdadeira(s): ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 6 — O PISO `papel_atual()` ESTÁ EXATAMENTE ONDE ESTÁ HOJE, nos dois sentidos.
  --     6a: tabela do piso cuja policy de SELECT deixou de citá-lo → o gate da 0070
  --         caiu naquela tabela, e o desativado volta a ler.
  --     6b: tabela FORA do piso cuja policy de SELECT passou a citá-lo → alguém
  --         afrouxou um SELECT de cargo (`e_admin`/`e_dev`) para "todo logado ativo".
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_piso_papel) as nome
   where not exists (
     select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = nome and p.cmd = 'SELECT'
        and coalesce(p.qual, '') ilike '%papel_atual%'
   );
  if pg_temp.assert_zero_de(
       '6a o piso `papel_atual()` continua nas ' || array_length(k_piso_papel, 1) ||
       ' policies de SELECT congeladas' ||
       case when v_cnt > 0 then ' — perdeu o piso: ' || v_lista else '' end,
       v_cnt, array_length(k_piso_papel, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_piso_cargo) as nome
   where exists (
     select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = nome and p.cmd = 'SELECT'
        and coalesce(p.qual, '') ilike '%papel_atual%'
   );
  if pg_temp.assert_zero_de(
       '6b as ' || array_length(k_piso_cargo, 1) ||
       ' que decidem por CARGO não afrouxaram para o piso' ||
       case when v_cnt > 0 then ' — afrouxada(s): ' || v_lista else '' end,
       v_cnt, array_length(k_piso_cargo, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ===============================================================
  -- BLOCO 2 — AS POLICIES DE `storage.objects`
  -- ===============================================================

  -- ---------------------------------------------------------------
  -- 7 — NENHUMA POLICY DE STORAGE DECIDE SÓ POR `bucket_id`.
  --
  --     A FORMA PROIBIDA EXISTIU, e está escrita: a 0070:137 documenta a reversão da
  --     policy de leitura de termos como `using (bucket_id = 'termos')` — exatamente o
  --     que esta asserção recusa — e as linhas 0070:202-207 explicam o furo: "certo
  --     quanto ao CARGO, incompleto quanto à SESSÃO: quem foi DESATIVADO continuava
  --     conseguindo `createSignedUrl` de qualquer .docx enquanto o token vivia, e o
  --     .docx traz nome do colaborador, setor e patrimônios".
  --
  --     A régua: o predicado efetivo (o `using` E o `with check`, porque policy de
  --     INSERT só tem o segundo) precisa citar ao menos UMA função do modelo de acesso.
  --     Não é lista de policies — é lista de FUNÇÕES, e por isso uma policy nova de
  --     Storage escrita direito passa sem alteração nenhuma neste arquivo.
  -- ---------------------------------------------------------------
  select count(*) into v_univ
    from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects';

  select count(*), coalesce(string_agg(p.policyname, ', ' order by p.policyname), '')
    into v_cnt, v_lista
    from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and not exists (
       select 1 from unnest(k_funcoes_acesso) as f
        where (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ilike '%' || f || '%'
     );
  if pg_temp.assert_zero_de(
       '7 nenhuma policy de storage.objects decide só por `bucket_id`' ||
       case when v_cnt > 0 then ' — sem noção de acesso: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 8 — O CONJUNTO de policies de `storage.objects` é o congelado, nos dois sentidos.
  --     Storage é a única superfície do sistema em que uma policy nova pode nascer
  --     pelo painel do Supabase, sem passar por migration nenhuma. Congelar o conjunto
  --     é o que transforma isso em erro de CI em vez de descoberta tardia.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(p.policyname, ', ' order by p.policyname), '')
    into v_cnt, v_lista
    from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and not (p.policyname = any (k_storage));
  if pg_temp.assert_zero_de(
       '8a nenhuma policy de Storage fora do conjunto congelado' ||
       case when v_cnt > 0 then ' — nova(s): ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_storage) as nome
   where not exists (
     select 1 from pg_policies p
      where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname = nome
   );
  if pg_temp.assert_zero_de(
       '8b nenhuma policy de Storage congelada sumiu' ||
       case when v_cnt > 0 then ' — ausente(s): ' || v_lista else '' end,
       v_cnt, array_length(k_storage, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ===============================================================
  -- BLOCO 3 — A PUBLICATION DO REALTIME
  -- ===============================================================

  -- ---------------------------------------------------------------
  -- 9 — O CONJUNTO da publication `supabase_realtime` é o congelado, nos dois sentidos.
  --
  --     O Realtime é a única superfície de LEITURA que não aparece em inventário
  --     nenhum — nem no tripwire do viewer, nem em `papeis_rls.sql`. Uma tabela na
  --     publication passa a empurrar cada linha alterada para quem estiver inscrito;
  --     na virada multiempresa isso é um canal direto entre inquilinos.
  --
  --     Os dois sentidos, e o de baixo importa tanto quanto o de cima: a 0050 escreve
  --     que `pendencias_item` NÃO entra ("/pendencias não usa realtime"), ou seja a
  --     AUSÊNCIA é decisão. Tirar uma das três de dentro quebraria a tela que depende
  --     dela sem nada acusar, e é isso que a metade 9b pega.
  -- ---------------------------------------------------------------
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    v_falhas := v_falhas + 1;
    raise warning '✗ 9 a publication `supabase_realtime` não existe — a 0009 não está no ar';
  else
    select count(*) into v_univ
      from pg_publication_tables t
     where t.pubname = 'supabase_realtime' and t.schemaname = 'public';

    select count(*), coalesce(string_agg(t.tablename, ', ' order by t.tablename), '')
      into v_cnt, v_lista
      from pg_publication_tables t
     where t.pubname = 'supabase_realtime' and t.schemaname = 'public'
       and not (t.tablename = any (k_realtime));
    if pg_temp.assert_zero_de(
         '9a nenhuma tabela NOVA na publication do Realtime' ||
         case when v_cnt > 0 then ' — entrou(aram): ' || v_lista else '' end,
         v_cnt, v_univ) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;

    select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
      into v_cnt, v_lista
      from unnest(k_realtime) as nome
     where not exists (
       select 1 from pg_publication_tables t
        where t.pubname = 'supabase_realtime' and t.schemaname = 'public' and t.tablename = nome
     );
    if pg_temp.assert_zero_de(
         '9b nenhuma das ' || array_length(k_realtime, 1) || ' congeladas saiu da publication' ||
         case when v_cnt > 0 then ' — saiu(íram): ' || v_lista else '' end,
         v_cnt, array_length(k_realtime, 1)::bigint) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  end if;

  raise notice 'FIM catalogo_policies: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;
