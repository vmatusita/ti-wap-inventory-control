-- =============================================================
-- Roteiro de teste: DEFINER SEM TENANT — a TRAVA da F52 (migration 0132)
-- =============================================================
-- POR QUE ELE EXISTE
--
-- `catalogo_secdef.sql` (F48) já enumera as 48 `security definer` de `public` e prova que
-- nenhuma escapa da classificação, que nenhuma tem overload e que `search_path` está travado
-- em todas. O que ELE NÃO PROVA — e não devia, por Decisão 2 (uma fonte por fato) — é a
-- pergunta da F52: dentre as que RECEBEM alguma identidade do lado de fora (o id de um
-- ativo, de um usuário, de uma filial, o caminho de um arquivo), quais CONFEREM ESCOPO antes
-- de agir, e quais só existem porque, hoje, com uma empresa só, não há escopo nenhum para
-- conferir? Na virada multiempresa (F62→F65) é exatamente esta classe de função que vira a
-- porta entre um administrador e o dado do vizinho — e até a F52 ninguém a enumerava.
--
-- ⚠ LISTA IRMÃ, FATO DIFERENTE (F59). `k_excecoes_predicado`, em `catalogo_policies.sql`,
-- também cita `estorno_item_coerente`, `termo_ancora_coerente` e `pode_ler_arquivo_termo` —
-- mas pergunta outra coisa: se a POLICY passa dado da linha para uma função (a doutrina do
-- predicado, emenda F59 da MATRIZ-REGRAS). Esta pergunta se a `security definer` confere
-- escopo NO CORPO. Por isso são duas listas, e mexer numa não dispensa decidir a outra.
--
-- Este arquivo NÃO corrige nada: ele é a fotografia de HOJE (pós-0132), o que é o suficiente
-- para pegar a regressão real — uma `security definer` nova que recebe id do cliente e nasce
-- sem citar NENHUMA das guardas de escopo, e some no ruído das outras 47.
--
-- A FORMA — HÍBRIDO, Decisão 5 de `docs/PLAN-F52.md`
--
-- Nem lista fixa pura (envelhece: a ficha original desta fase foi escrita contra um
-- inventário de 37 que já virou 48), nem derivação pura (produz FALSO POSITIVO em
-- `estorno_item_coerente`/`termo_ancora_coerente` — que recebem id, são alcançáveis, e
-- SOZINHAS não protegem nada porque a autorização real está ANDada ao lado, na MESMA
-- expressão da policy — e FALSO NEGATIVO em `pode_escrever_arquivo_termo`, que não chama
-- nenhuma primitiva: DELEGA para `pode_escrever_termo()`). A forma final:
--
--   (i)  o UNIVERSO sai do catálogo — `pg_proc where prosecdef` em `public` — filtrado por
--        DOIS fatos medidos, nunca afirmados: (a) recebe algum parâmetro de tipo `uuid`,
--        `uuid[]`, `smallint` (a filial) OU `text` (caminho/nome — `p_backup_path`,
--        `pode_escrever_arquivo_termo(p_nome text)` — o TEXT CONTA, é requisito explícito
--        desta ordem); e (b) é `has_function_privilege('authenticated', …, 'execute')`. Uma
--        função fechada nos quatro papéis (as 8 auxiliares do import, `exigir_gestao_de`,
--        `existe_outro_admin_ativo`, `exigir_dev_para_destruir`, `rotulo_alcance_reset`,
--        `exigir_identidade_livre_na_filial`, e as três novas da 0132) não é alcançável
--        por `/rest/v1/rpc/*` com sessão comum — quem a protege é o CHAMADOR, que por sua
--        vez está neste universo (ou não precisa estar, se ele mesmo for INVOKER — outra
--        história, de `catalogo_secdef.sql` §6).
--   (ii) esse universo é comparado, nos DOIS SENTIDOS (`1a`/`1b`), contra duas listas
--        NOMINAIS: `k_escopo_ok` (as que se defendem sozinhas — chamam `e_admin`/`e_dev`/
--        `pode_escrever_filial`/`pode_escrever_termo`/`exigir_gestao_de`/
--        `exigir_dev_para_destruir` por dentro, OU DELEGAM para uma que chama) e
--        `k_escopo_excecao` (as exceções, UMA POR FUNÇÃO, com o MOTIVO e a MIGRATION que a
--        criou — conferidos por dados, não por comentário: a asserção `2` lê os arrays
--        paralelos `k_escopo_excecao_migracao`/`k_escopo_excecao_motivo`, não o texto do
--        arquivo, porque SQL não lê o próprio `.sql`).
--
-- REPROVA POR FUNÇÃO NOMEADA, NUNCA POR PREFIXO (asserção `3`). As CINCO RPCs de gestão de
-- conta (`apagar_usuario`, `definir_papel_usuario`, `definir_status_usuario`,
-- `definir_vinculos_usuario`, `encerrar_sessoes_usuario`) citam `exigir_gestao_de` no corpo
-- — então um critério que procurasse a SUBSTRING `exigir_` no corpo (em vez de conferir, por
-- NOME, que a função chama uma das seis primitivas de escopo) as marcaria "ok" por
-- coincidência de prefixo, sem checar se a chamada é para uma primitiva REAL. A prova de que
-- essa substituição seria errada mora na própria asserção `3`.
--
-- A SABOTAGEM — a trava nasce VERDE por natureza (é varredura de catálogo limpo). A última
-- asserção CRIA uma `security definer` FICTÍCIA — recebe `uuid`, é alcançável por
-- `authenticated`, e não está em nenhuma das duas listas — e prova que a MESMA consulta da
-- `1a` a ACUSA. É o equivalente, para um roteiro que nasce verde, do "nasceu vermelha" que
-- a F51 exigiu de `import-uma-porta.test.ts`.
--
-- ESCREVE (a sabotagem cria e concede EXECUTE numa função real, via `EXECUTE` — DDL não é
-- statement de PL/pgSQL puro), então este roteiro — ao contrário de `catalogo_secdef.sql`,
-- que é só leitura — roda inteiro dentro de `begin; … rollback;`: nada sobra no banco.
--
-- Mesmo padrão dos demais roteiros da pasta:
--   NOTICE  '✓ ...'  quando a invariante bate
--   WARNING '✗ ...'  quando NÃO bate (o job `banco-sem-docker` falha em qualquer `WARNING: ✗`)
--
-- Ver `docs/PLAN-F52.md` §2 Decisão 5 (a forma) e `supabase/tests/catalogo_secdef.sql` (o
-- molde da tabela-verdade e da varredura de `prosecdef`/`search_path`/alcance de `anon` —
-- este arquivo NÃO repete aquelas três varreduras; Decisão 2, uma fonte por fato).
-- =============================================================

begin;

do $$
declare
  v_ok     int := 0;   -- quantas asserções passaram
  v_falhas int := 0;   -- quantas falharam (a linha FIM soma as duas)
  v_cnt    bigint;
  v_univ   bigint;
  v_lista  text;
  v_bool   boolean;
  v_bool2  boolean;
  v_i      int;
  v_bad    int;

  -- -----------------------------------------------------------------------
  -- k_escopo_ok — as 18 que RECEBEM id do cliente, são alcançáveis por `authenticated`,
  -- e SE DEFENDEM SOZINHAS: chamam uma das seis primitivas de escopo por dentro, ou
  -- delegam para uma que chama. Medidas em 08/09/2026 lendo o CORPO de cada uma nas
  -- migrations 0001→0132 (não por suposição de nome).
  -- -----------------------------------------------------------------------
  k_escopo_ok text[] := array[
    -- F67 (0185): as CINCO PRIMITIVAS POR EMPRESA — a base de `k_primitivas_por_empresa` (abaixo). Recebem a empresa
    -- (e a filial) do cliente e respondem SÓ sobre quem chama naquela empresa: a empresa é testada ANTES do cargo e o
    -- argumento nulo fecha. Toda outra função desta lista tem de chamar uma delas (asserção 4).
    'papel_na_empresa', 'e_admin_na', 'e_dev_na', 'pode_escrever_na', 'pode_escrever_unidade',
    -- Desde a F67 (0186) ela DELEGA a `pode_escrever_unidade(<empresa da filial>, fid)` — responde pela empresa da
    -- filial; antes decidia por `papel_atual()` (a ponte da F62) e dava `true` a dev/admin em qualquer filial.
    'pode_escrever_filial',
    -- Gestão de conta (0074/0132): as CINCO citam `exigir_gestao_de(p_alvo, …)` no corpo
    -- — UMA condição protege as cinco, porque as cinco passam por ali
    -- (0074:162,206,251,304,371).
    'apagar_usuario', 'definir_papel_usuario', 'definir_status_usuario',
    'definir_vinculos_usuario', 'encerrar_sessoes_usuario',
    -- Termo (0069): `pode_escrever_arquivo_termo` DELEGA para `pode_escrever_termo()`, que
    -- por sua vez chama `e_admin()` ou `pode_escrever_filial(a.filial_id)` — a filial REAL
    -- do ativo lida em `ativos`, nunca a que o cliente declarasse.
    'pode_escrever_arquivo_termo', 'pode_escrever_termo',
    -- Zona destrutiva (0082→0110): cada uma chama `exigir_dev_para_destruir(p_justificativa)`
    -- por dentro, ANTES de qualquer efeito.
    'apagar_ativo', 'apagar_item', 'apagar_movimentacao', 'forcar_estado_ativo',
    'forcar_saldo_item', 'previa_reset', 'resetar_acervo', 'resetar_itens',
    -- Mesa de conflitos (0093→0132): chama `e_admin()` (0093) e, desde a 0132, também
    -- `exigir_ativos_da_empresa(v_ids)` — depois da etapa 3 do lock, fora da janela
    -- `estoque.dev_destrutivo`.
    'apagar_ativos_conflito_filiais',
    -- Import de startup (0032→0132): chama `e_admin()` (0064) e, desde a 0132, também
    -- `pode_escrever_filial(v_filial)` — em CONJUNÇÃO, antes do advisory lock.
    'importar_ativos_substituir'
  ];

  -- -----------------------------------------------------------------------
  -- k_escopo_excecao — as TRÊS exceções, cada uma com motivo E migration num par de
  -- arrays PARALELOS (não em comentário: a asserção `2` confere DADOS, porque SQL não lê
  -- o próprio arquivo `.sql`).
  -- -----------------------------------------------------------------------
  k_escopo_excecao          text[] := array[
    'estorno_item_coerente', 'termo_ancora_coerente', 'pode_ler_arquivo_termo'
  ];
  k_escopo_excecao_migracao text[] := array['0068', '0069', '0186'];
  k_escopo_excecao_motivo   text[] := array[
    --   · estorno_item_coerente (0068) — recebe id do cliente e é alcançável, mas SOZINHA
    --     não protege nada: a autorização real está ANDada ao lado, na MESMA expressão da
    --     policy (desde a F66, a forma de pares sobre `unidades_de_escrita()` em conjunção
    --     com o recorte de empresa). F67: e a EMPRESA dos ids é garantida pela FK composta
    --     da F65 (o lançamento estornado é da empresa do estorno). Reprová-la seria reprovar
    --     código seguro.
    'recebe id do cliente e é alcançável por authenticated, mas SOZINHA não protege nada: a autorização real está ANDada ao lado, na MESMA expressão da policy (os pares de unidades_de_escrita() e o recorte de empresa da F66), e a empresa do lançamento estornado é a do estorno pela FK composta da F65 (F67). Reprová-la seria reprovar código seguro.',
    --   · termo_ancora_coerente (0069) — idem: recebe uuid[] duas vezes e é alcançável,
    --     mas a autorização real está ANDada ao lado, na MESMA expressão da policy, junto
    --     com pode_escrever_termo() e o recorte de empresa. Sozinha, ela só confere
    --     COERÊNCIA de dados (o ativo pertence à movimentação). F67: a empresa dos ids é a
    --     do termo pelo gatilho `termos_gerados_ids_da_empresa` (0173).
    'idem estorno_item_coerente: recebe uuid[] duas vezes e é alcançável, mas a autorização real está ANDada ao lado, na MESMA expressão da policy, junto com pode_escrever_termo() e o recorte de empresa; a empresa dos ids é a do termo pelo gatilho termos_gerados_ids_da_empresa (0173, F67). Sozinha, ela só confere COERÊNCIA de dados, nunca CARGO nem FILIAL.',
    --   · pode_ler_arquivo_termo (0186, F67; nasceu na 0129) — recebe p_nome text e é
    --     alcançável, mas por desenho DOCUMENTADO ignora o parâmetro: desde a F67 o corpo é
    --     "papel_na_empresa(empresa_legada()) is not null" — todo membro ativo da WAP lê
    --     todo termo, a legada EXPLÍCITA até a F67B fechar por join com termos_gerados.
    'recebe p_nome text e é alcançável, mas por desenho DOCUMENTADO ignora o parâmetro: desde a F67 o corpo é "papel_na_empresa(empresa_legada()) is not null" — todo membro ativo da empresa legada lê todo termo, a legada EXPLÍCITA até a F67B fechar pelo join com termos_gerados.'
  ];

  -- -----------------------------------------------------------------------
  -- k_primitivas_por_empresa — F67 (13/11/2026). A BASE do fecho da asserção 4: as funções
  -- que respondem pelo cargo NUMA EMPRESA (0185). Conferidas por NOME INTEIRO na chamada
  -- (`\m<nome>\s*\(`), nunca por prefixo: `e_admin_na_qualquer(` não casa `e_admin_na`. O
  -- cargo SEM empresa (`papel_atual()`, `e_admin()`, `e_dev()`, `pode_escrever()`) NÃO
  -- está aqui — ele é só piso de policy desde a F67.
  -- -----------------------------------------------------------------------
  k_primitivas_por_empresa text[] := array[
    'papel_na_empresa', 'e_admin_na', 'e_dev_na', 'pode_escrever_na', 'pode_escrever_unidade'
  ];
begin
  -- ---------------------------------------------------------------
  -- 1a — TODA candidata do universo derivado está classificada (catálogo → lista).
  --
  -- O universo: `security definer` em `public`, alcançável por `authenticated`, com
  -- algum parâmetro `uuid`/`uuid[]`/`smallint`/`text` — os quatro tipos que carregam
  -- identidade do lado de fora nesta base de código. O cast `::oid[]` é OBRIGATÓRIO:
  -- `proargtypes` é `oidvector`, não `anyarray`, e `unnest()` exige `anyarray`.
  -- ---------------------------------------------------------------
  select count(*) into v_univ
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute')
     and exists (
       select 1 from unnest(p.proargtypes::oid[]) as argoid
        where argoid in ('uuid'::regtype::oid, 'uuid[]'::regtype::oid,
                          'smallint'::regtype::oid, 'text'::regtype::oid)
     );

  select count(*), coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '')
    into v_cnt, v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute')
     and exists (
       select 1 from unnest(p.proargtypes::oid[]) as argoid
        where argoid in ('uuid'::regtype::oid, 'uuid[]'::regtype::oid,
                          'smallint'::regtype::oid, 'text'::regtype::oid)
     )
     and not (p.proname = any (k_escopo_ok || k_escopo_excecao));
  if pg_temp.assert_zero_de(
       '1a toda security definer que recebe id do cliente e é alcançável por authenticated está classificada' ||
       case when v_cnt > 0 then ' — não classificada(s): ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 1b — o outro sentido: todo nome classificado ainda EXISTE, ainda é `security
  -- definer`, ainda é alcançável por `authenticated`, e ainda recebe id do cliente
  -- (lista → catálogo). Sem ele, a lista acumularia fantasmas: um `revoke` futuro que
  -- fechasse uma função hoje aberta a tornaria invisível para a 1a (ela sai do universo),
  -- e ficaria classificada para sempre num universo que ela já não integra.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_escopo_ok || k_escopo_excecao) as nome
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
        and p.proname = nome
        and has_function_privilege('authenticated', p.oid, 'execute')
        and exists (
          select 1 from unnest(p.proargtypes::oid[]) as argoid
           where argoid in ('uuid'::regtype::oid, 'uuid[]'::regtype::oid,
                             'smallint'::regtype::oid, 'text'::regtype::oid)
        )
   );
  if pg_temp.assert_zero_de(
       '1b todo nome classificado ainda é security definer, alcançável por authenticated e recebe id do cliente' ||
       case when v_cnt > 0 then ' — fantasma(s)/obsoleto(s): ' || v_lista else '' end,
       v_cnt, array_length(k_escopo_ok || k_escopo_excecao, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 1c — nenhum nome está nas DUAS listas ao mesmo tempo. Sem esta guarda, um nome
  -- duplicado mascararia a intenção real (é "ok" ou é "exceção"?) sem que a 1a/1b
  -- acusassem nada — as duas passam sobre `k_escopo_ok || k_escopo_excecao` juntos.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_escopo_ok) as nome
   where nome = any (k_escopo_excecao);
  if pg_temp.assert_zero_de(
       '1c nenhum nome está em k_escopo_ok e k_escopo_excecao ao mesmo tempo' ||
       case when v_cnt > 0 then ' — duplicado(s): ' || v_lista else '' end,
       v_cnt, array_length(k_escopo_ok, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 2 — toda exceção de k_escopo_excecao tem MOTIVO escrito (prosa de verdade, >40
  -- caracteres) E a MIGRATION que a criou (4 dígitos), na MESMA posição do array — os
  -- três paralelos (`k_escopo_excecao`/`_migracao`/`_motivo`) têm de ter o MESMO
  -- comprimento, e cada entrada precisa das duas coisas. Confere DADO, não comentário:
  -- SQL não lê o próprio `.sql`, então um `k_escopo_excecao_motivo[i] := ''` esquecido
  -- não escaparia por trás de um comentário bonito no código-fonte.
  -- ---------------------------------------------------------------
  v_bad := 0;
  if array_length(k_escopo_excecao, 1) is distinct from array_length(k_escopo_excecao_migracao, 1)
     or array_length(k_escopo_excecao, 1) is distinct from array_length(k_escopo_excecao_motivo, 1)
  then
    v_bad := array_length(k_escopo_excecao, 1);
  else
    for v_i in 1..array_length(k_escopo_excecao, 1) loop
      if coalesce(length(btrim(k_escopo_excecao_motivo[v_i])), 0) <= 40
         or coalesce(k_escopo_excecao_migracao[v_i], '') !~ '^\d{4}$'
      then
        v_bad := v_bad + 1;
      end if;
    end loop;
  end if;
  if pg_temp.assert_zero_de(
       '2 toda exceção tem motivo escrito (>40 caracteres) e a migration (4 dígitos) na mesma posição',
       v_bad, array_length(k_escopo_excecao, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 3 — REPROVA POR FUNÇÃO NOMEADA, NUNCA POR PREFIXO.
  --
  -- As CINCO RPCs de gestão de conta citam `exigir_gestao_de` no corpo — um critério que
  -- procurasse a SUBSTRING `exigir_` no corpo (em vez de conferir, por NOME, que a
  -- função chama uma das seis primitivas de escopo) as marcaria "ok" por coincidência de
  -- prefixo, sem checar se a chamada é para uma primitiva REAL. A prova de que essa
  -- substituição estaria ERRADA: `pode_escrever_termo` TAMBÉM está em `k_escopo_ok`
  -- (defende-se por `e_admin()`/`pode_escrever_filial()`), mas seu corpo NÃO contém
  -- `exigir_` em lugar nenhum — um critério de prefixo a reprovaria por engano (falso
  -- negativo). É por isso que a classificação aqui é NOMINAL, nunca um `like`/`~` sobre
  -- o corpo ou o nome da função.
  -- ---------------------------------------------------------------
  select bool_and(p.prosrc ~ 'exigir_') into v_bool
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname = any (array[
       'apagar_usuario', 'definir_papel_usuario', 'definir_status_usuario',
       'definir_vinculos_usuario', 'encerrar_sessoes_usuario'
     ]);

  select (p.prosrc !~ 'exigir_') into v_bool2
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname = 'pode_escrever_termo';

  if v_bool is true and v_bool2 is true and 'pode_escrever_termo' = any (k_escopo_ok) then
    v_ok := v_ok + 1;
    raise notice '✓ 3 classificação por FUNÇÃO NOMEADA — as 5 RPCs de conta citam algo com prefixo "exigir_" (passariam "ok" por um critério de prefixo), mas pode_escrever_termo, também em k_escopo_ok, não cita nada com esse prefixo: um critério de prefixo a reprovaria por engano';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3 a prova do prefixo mudou de forma inesperada (RPCs citam exigir_=%, pode_escrever_termo NÃO cita exigir_=%) — releia o corpo das cinco RPCs de conta e de pode_escrever_termo antes de mexer nesta asserção', v_bool, v_bool2;
  end if;

  -- ---------------------------------------------------------------
  -- 4 — F67 (13/11/2026): toda função de `k_escopo_ok` confere a empresa por uma primitiva
  -- POR EMPRESA — chama uma de `k_primitivas_por_empresa` no CORPO (o código, sem
  -- comentário nem texto: `pg_temp.sql_so_codigo`), por NOME INTEIRO, ou DELEGA, também
  -- por nome inteiro, a uma função que, transitivamente, chama (o fecho calculado no
  -- catálogo, por recursão). Até a F67 a classificação era só nominal: `k_escopo_ok` dizia
  -- "se defende sozinha" sem que nada conferisse o corpo — e as seis primitivas de então
  -- (`e_admin`, `e_dev`, `pode_escrever_filial`…) não eram por empresa. O cargo sem empresa
  -- não conta: ele não está na base do fecho.
  --
  -- ⚠ É POR NOME de função (o catálogo do CI termina contraído: uma assinatura por nome).
  -- Nos bancos vivos, entre a expansão e a contração, a antiga e a nova dividem o nome — a
  -- trava se lê no CI.
  -- ---------------------------------------------------------------
  with recursive fn as (
    select p.proname::text collate "default" as nome, pg_temp.sql_so_codigo(p.prosrc) as codigo
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  ),
  ok(nome) as (
    select unnest(k_primitivas_por_empresa)
    union
    select f.nome from fn f join ok o on f.codigo ~ ('\m' || o.nome || '\s*\(')
  )
  select count(*), coalesce(string_agg(e.nome, ', ' order by e.nome), '')
    into v_cnt, v_lista
    from unnest(k_escopo_ok) as e(nome)
   where not exists (select 1 from ok where ok.nome = e.nome);
  if pg_temp.assert_zero_de(
       '4 toda função de k_escopo_ok confere a empresa por uma primitiva POR EMPRESA (no corpo, ou por delegação, por nome inteiro)' ||
       case when v_cnt > 0 then ' — sem primitiva por empresa: ' || v_lista else '' end,
       v_cnt, array_length(k_escopo_ok, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- SABOTAGEM C1 e C2 — a asserção 4 SABE reprovar (F67). Duas `security definer`
  -- fictícias, alcançáveis e com `uuid`, CLASSIFICADAS como "ok" numa cópia local da lista
  -- (o erro que a asserção existe para pegar: classificar sem conferir o corpo):
  --   C1 chama SÓ o cargo sem empresa (`e_admin()`);
  --   C2 chama uma função cujo nome só COMEÇA como uma primitiva (`e_admin_na_falso(`).
  -- A MESMA consulta da 4, aplicada à cópia, tem de acusar as DUAS. Nascem e morrem neste
  -- begin/rollback.
  -- ---------------------------------------------------------------
  execute
    'create function public._f67_sabotagem_so_piso(p_alvo uuid) ' ||
    'returns boolean language sql stable security definer set search_path = public ' ||
    'as $sabo_c1$ select public.e_admin() $sabo_c1$';
  execute
    'create function public.e_admin_na_falso(p_empresa uuid) ' ||
    'returns boolean language sql stable security definer set search_path = public ' ||
    'as $sabo_c2a$ select true $sabo_c2a$';
  execute
    'create function public._f67_sabotagem_prefixo(p_alvo uuid) ' ||
    'returns boolean language sql stable security definer set search_path = public ' ||
    'as $sabo_c2$ select public.e_admin_na_falso(p_alvo) $sabo_c2$';
  execute 'grant execute on function public._f67_sabotagem_so_piso(uuid) to authenticated';
  execute 'grant execute on function public._f67_sabotagem_prefixo(uuid) to authenticated';

  with recursive fn as (
    select p.proname::text collate "default" as nome, pg_temp.sql_so_codigo(p.prosrc) as codigo
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  ),
  ok(nome) as (
    select unnest(k_primitivas_por_empresa)
    union
    select f.nome from fn f join ok o on f.codigo ~ ('\m' || o.nome || '\s*\(')
  )
  select count(*), coalesce(string_agg(e.nome, ', ' order by e.nome), '')
    into v_cnt, v_lista
    from unnest(k_escopo_ok || array['_f67_sabotagem_so_piso', '_f67_sabotagem_prefixo']) as e(nome)
   where not exists (select 1 from ok where ok.nome = e.nome);
  if v_cnt = 2 and v_lista = '_f67_sabotagem_prefixo, _f67_sabotagem_so_piso' then
    v_ok := v_ok + 1;
    raise notice '✓ sabotagem C1 e C2 a asserção 4 ACUSA a função que só chama o cargo sem empresa e a que chama um nome que só COMEÇA como uma primitiva (%)', v_lista;
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ sabotagem C1 e C2 a asserção 4 não acusou as duas fictícias (contagem=%, acusadas: %) — a trava aceita piso ou prefixo', v_cnt, v_lista;
  end if;

  -- ---------------------------------------------------------------
  -- SABOTAGEM — a prova de que a varredura SABE reprovar (o equivalente, aqui, do
  -- "nasceu vermelha").
  --
  -- A asserção 1a nasce VERDE por natureza: é varredura de catálogo, e catálogo limpo não
  -- acusa nada — o mesmo defeito que fez a F47 medir 58 asserções tautológicas neste
  -- acervo. Sem uma prova de que ela SABE acusar, um bug que fizesse o filtro devolver
  -- sempre "universo vazio" ou "tudo classificado" passaria despercebido para sempre.
  --
  -- Aqui nasce uma SECURITY DEFINER FICTÍCIA: recebe `uuid` (o parâmetro clássico de
  -- "id do cliente"), é SECURITY DEFINER, ganha EXECUTE de `authenticated` — e não cita
  -- absolutamente NENHUMA guarda por dentro (o corpo é `select true`, sem checar cargo,
  -- filial nem nada). Ela é criada via `EXECUTE` (dynamic SQL) porque `CREATE FUNCTION`
  -- e `GRANT` não são statements de PL/pgSQL puro, e ela nasce e morre dentro do
  -- `begin; … rollback;` deste arquivo — nada sobra no banco depois do `rollback;` do
  -- fim. A MESMA consulta da asserção 1a, reaplicada só a ela, tem de encontrá-la: no
  -- universo (security definer, alcançável, recebe uuid) e FORA das duas listas.
  -- ---------------------------------------------------------------
  execute
    'create function public._f52_sabotagem_definer_sem_tenant(p_alvo uuid) ' ||
    'returns boolean language sql stable security definer set search_path = public ' ||
    'as $sabo_corpo$ select true $sabo_corpo$';
  execute
    'grant execute on function public._f52_sabotagem_definer_sem_tenant(uuid) to authenticated';

  select count(*) into v_cnt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
     and p.proname = '_f52_sabotagem_definer_sem_tenant'
     and has_function_privilege('authenticated', p.oid, 'execute')
     and exists (
       select 1 from unnest(p.proargtypes::oid[]) as argoid
        where argoid in ('uuid'::regtype::oid, 'uuid[]'::regtype::oid,
                          'smallint'::regtype::oid, 'text'::regtype::oid)
     )
     and not (p.proname = any (k_escopo_ok || k_escopo_excecao));

  if v_cnt = 1 then
    v_ok := v_ok + 1;
    raise notice '✓ sabotagem a varredura ACUSA _f52_sabotagem_definer_sem_tenant — security definer NOVA, recebe uuid, alcançável por authenticated, sem guarda nenhuma por dentro, e fora das duas listas. O gate SABE reprovar; a função nasce e morre neste begin/rollback, nada sobra no banco';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ sabotagem a varredura NÃO acusou a função fictícia (contagem=%, esperado 1) — o gate está cego: uma security definer nova sem guarda passaria em silêncio', v_cnt;
  end if;

  raise notice 'FIM definer_sem_tenant: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end
$$;

rollback;
