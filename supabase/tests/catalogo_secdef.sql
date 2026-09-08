-- =============================================================
-- Roteiro de teste: A TABELA-VERDADE DAS `security definer` (F48, 07/09/2026)
-- =============================================================
-- POR QUE ELE EXISTE
--
-- O sistema tem 37 funções `security definer` — cada uma roda com o privilégio do
-- DONO e, por construção, IGNORA a RLS das tabelas que lê e escreve. É a superfície
-- mais concentrada de poder do banco, e até hoje **ninguém a enumerava**. Uma função
-- `security definer` nova podia nascer executável por `anon`, ou com `search_path`
-- solto, e NADA no repositório se mexia — nem o CI, nem um teste, nem um roteiro.
--
-- Este arquivo é a enumeração. Ele NÃO corrige nada: a F48 congela a linha de base.
--
-- O QUE FAZ ELE SER UM CATÁLOGO, E NÃO UMA LISTA QUE ENVELHECE
--
-- O conjunto examinado sai de `pg_proc.prosecdef`, sempre. A lista `k_secdef` abaixo
-- é a CLASSIFICAÇÃO, não a fonte — e a asserção 1 a confere nos DOIS SENTIDOS:
--   · função `security definer` no catálogo que não esteja classificada REPROVA;
--   · nome classificado que não exista mais no catálogo REPROVA.
-- É essa simetria que impede o arquivo de virar documentação. Uma migration que
-- acrescente uma `security definer` derruba o CI até alguém decidir, por escrito,
-- que ela deve existir.
--
-- SÓ LEITURA de catálogo (`pg_proc`, `pg_namespace`, ACLs) — não grava nada, por isso
-- dispensa `begin/rollback`, igual a `seguranca_catalogo.sql`. Mesmo padrão de saída:
--   NOTICE  '✓ ...'  quando a invariante bate
--   WARNING '✗ ...'  quando NÃO bate (o runner falha em qualquer `WARNING: ✗`)
--
-- CLASSIFICAÇÃO POR NOME, e não por assinatura. `regprocedure` normaliza o texto de
-- um jeito que não se prevê sem banco (defaults, aliases de tipo, espaços), e uma
-- lista de assinaturas formatadas à mão erraria por pontuação. A asserção 2 é o que
-- torna o nome suficiente: ela recusa overload escondido, e sem overload o nome
-- identifica a função.
--
-- RELAÇÃO COM `seguranca_catalogo.sql` — NÃO DUPLICAR (F48, Decisão 2)
-- As varreduras schema-wide de RLS ligada (asserção 2 de lá) e de `security_invoker`
-- nas views (asserção 3) continuam MORANDO LÁ, e este arquivo não as repete. Duas
-- fontes para o mesmo fato é como um gate morre: a que envelhecer primeiro vira a
-- mentira. Lá também vivem os grants das 3 RPCs de escrita (asserção 1) e a exceção
-- de `valida_lancamento_item` (asserção 4c), cujo motivo este arquivo REPETE por
-- escrito, na asserção 5, porque sem ela a trava nova nasceria ✗ permanente.
-- =============================================================

do $$
declare
  v_ok     int := 0;   -- F45: quantas asserções passaram
  v_falhas int := 0;   -- F45: quantas falharam (a linha FIM soma as duas)
  v_cnt    bigint;
  v_univ   bigint;
  v_lista  text;
  v_secdef boolean;

  -- -----------------------------------------------------------------------
  -- A TABELA-VERDADE — as 37 `security definer` de `public`, classificadas.
  -- Medidas em 07/09/2026 sobre as migrations 0001→0128. Ordem alfabética;
  -- o comentário de cada bloco diz POR QUE aquele grupo precisa ser definer.
  -- -----------------------------------------------------------------------
  k_secdef text[] := array[
    -- Modelo de acesso (0072/0073): leem `profiles`, e a policy de `profiles`
    -- chama `papel_atual()`. Precisam rodar como o DONO ou o ciclo fecha (42P17).
    'papel_atual', 'e_admin', 'e_dev', 'pode_escrever', 'pode_escrever_filial',
    -- Gestão de contas (0074): agem sobre `profiles` e `auth.*`, com a guarda
    -- de cargo POR DENTRO. Nenhuma é chamável por quem não tem sessão.
    'apagar_usuario', 'definir_papel_usuario', 'definir_status_usuario',
    'definir_vinculos_usuario', 'encerrar_sessoes_usuario', 'exigir_gestao_de',
    'existe_outro_admin_ativo',
    -- Gatilhos (0057/0081/0073/0110): escrevem FORA de policy, contando com o
    -- bypass do dono. É a segunda razão de `force row level security` ser proibido.
    'aplicar_movimentacao', 'handle_new_user', 'guarda_acervo', 'profiles_guarda_dev',
    -- Autorização de termo e de item (0068/0069/0097): leem a filial REAL em
    -- `ativos`, nunca a declarada pelo cliente — é o que as torna não-forjáveis.
    'estorno_item_coerente', 'pode_escrever_arquivo_termo', 'pode_escrever_termo',
    'termo_ancora_coerente', 'exigir_identidade_livre_na_filial',
    -- Zona destrutiva (0082→0100): cada uma com `exigir_dev_para_destruir()` por
    -- dentro, backup obrigatório e trilha na MESMA transação.
    'apagar_ativo', 'apagar_item', 'apagar_movimentacao', 'apagar_ativos_conflito_filiais',
    'exigir_dev_para_destruir', 'forcar_estado_ativo', 'forcar_saldo_item',
    'previa_reset', 'resetar_acervo', 'resetar_itens', 'resetar_dados_ficticios',
    'rotulo_alcance_reset',
    -- Import de startup (0094): apaga a filial e recarrega, dentro de uma janela.
    'importar_ativos_substituir',
    -- Porta pública por senha (0025): conta tentativa por IP sem sessão nenhuma.
    'registrar_tentativa_senha',
    -- Área /dev (0077/0127): diagnóstico só-leitura, com SQL FIXO por dentro.
    'dev_checagens_integridade', 'ultima_migracao_aplicada'
  ];

  -- -----------------------------------------------------------------------
  -- AS INVOKER ALCANÇÁVEIS POR `anon` — exceção NOMINAL, uma a uma.
  --
  -- ⚠ Isto NÃO é "as INVOKER estão isentas". Isentar por categoria é exatamente o
  -- que a F47 arrancou de `seguranca_catalogo.sql` (a isenção por prefixo `_`), e a
  -- asserção 6 é simétrica: uma INVOKER nova alcançável por `anon` que não esteja
  -- NESTA lista REPROVA. O que cada uma faz, e por que é inofensiva:
  --   · chave_identidade_ativo  (0099) — `immutable`, aritmética de texto sobre os
  --     argumentos. Não toca tabela nenhuma.
  --   · hoje_brt                (0124) — `stable`, devolve `now()` no fuso do negócio.
  --   · mov_da_carga_import     (0092) — `immutable`, um `like` sobre o argumento.
  --   · status_apos_movimentacao(0109) — `immutable`, a máquina de estados em `case`.
  --   · valida_lancamento_item — GATILHO (0118), e a única cujo EXECUTE a 0038 deixou de
  --     propósito ao revogar só as duas SECURITY DEFINER. É também a única que LÊ TABELA
  --     (`public.lancamentos_item`). O que a torna inofensiva NÃO é "não tocar tabela"
  --     — a primeira redação do achado F48 dizia isso e estava errada, como a revisão
  --     adversarial apontou. São duas coisas independentes: é `returns trigger`, então
  --     chamá-la por `/rest/v1/rpc/*` FALHA (não há NEW/OLD fora de um trigger); e,
  --     sendo INVOKER, a leitura passa pela RLS de `lancamentos_item` como qualquer
  --     outra. Ver a asserção 5 e `seguranca_catalogo.sql:16-23`.
  -- As cinco são INVOKER: rodam com o privilégio de QUEM chama, então nem o `anon`
  -- com EXECUTE alcançava dado que a RLS não lhe daria de qualquer jeito.
  --
  -- ⚠ F50/0129 — O EXECUTE DE `anon` FOI REVOGADO NAS CINCO. Não porque houvesse
  -- vazamento (não havia, pelos motivos acima), mas porque superfície que não precisa
  -- existir não deve existir — defesa em profundidade, e o dia que
  -- `seguranca_catalogo.sql:22-23` já previa por escrito. Consequência para este
  -- roteiro: `k_invoker_anon` ficou VAZIA e as cinco migraram para
  -- `k_invoker_revogadas`, que a asserção 6c vigia. Ver o comentário de cada lista.
  -- -----------------------------------------------------------------------
  -- F50/0129 — A LISTA ESTÁ VAZIA, e isso é o desfecho, não um esquecimento.
  -- As cinco tiveram o EXECUTE de `anon` revogado pela 0129. A 6a passa a exigir que
  -- NENHUMA invoker seja alcançável por `anon`, sem exceção — que é a forma forte.
  k_invoker_anon text[] := array[]::text[];

  -- ...e as cinco não somem daqui: mudam de PAPEL. Antes eram exceções toleradas;
  -- agora são revogações PROVADAS. A asserção 6c abaixo afirma que continuam sem
  -- EXECUTE para `anon` — sem ela, um `grant` de volta (por engano, ou por uma
  -- migration futura que recrie a função e herde o default do Supabase) passaria
  -- despercebido, porque a 6a só enxerga o que está FORA da lista e a lista está
  -- vazia. Recriar função com `create or replace` preserva os grants; recriar com
  -- `drop`+`create` NÃO, e é assim que uma revogação silenciosamente se desfaz.
  k_invoker_revogadas text[] := array[
    'chave_identidade_ativo', 'hoje_brt', 'mov_da_carga_import',
    'status_apos_movimentacao', 'valida_lancamento_item'
  ];
begin
  -- ---------------------------------------------------------------
  -- 1 — A TABELA-VERDADE, nos DOIS SENTIDOS. O coração do arquivo.
  -- ---------------------------------------------------------------
  select count(*) into v_univ
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef;

  select count(*), coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '')
    into v_cnt, v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
     and not (p.proname = any (k_secdef));
  if pg_temp.assert_zero_de(
       '1a toda `security definer` de public está CLASSIFICADA' ||
       case when v_cnt > 0 then ' — não classificada(s): ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- O outro sentido: nome classificado que não é mais `security definer` no catálogo.
  -- Sem ele a tabela-verdade acumularia fantasmas e ninguém saberia.
  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_secdef) as nome
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef and p.proname = nome
   );
  if pg_temp.assert_zero_de(
       '1b todo nome classificado existe e continua `security definer`' ||
       case when v_cnt > 0 then ' — fantasma(s): ' || v_lista else '' end,
       v_cnt, array_length(k_secdef, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 2 — NENHUM OVERLOAD ESCONDIDO.
  --     A classificação é por NOME (ver o cabeçalho). Ela só é honesta enquanto um
  --     nome identificar UMA função: com duas assinaturas vivas, classificar o nome
  --     classificaria as duas de uma vez, e a segunda entraria sem decisão nenhuma.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(proname || ' (' || n || ')', ', ' order by proname), '')
    into v_cnt, v_lista
    from (
      select p.proname, count(*) as n
        from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
       where n2.nspname = 'public' and p.prokind = 'f' and p.prosecdef
       group by p.proname having count(*) > 1
    ) dup;
  if pg_temp.assert_zero_de(
       '2 nenhum nome `security definer` tem mais de uma assinatura viva' ||
       case when v_cnt > 0 then ' — overload(s): ' || v_lista else '' end,
       v_cnt, array_length(k_secdef, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 3 — `search_path` TRAVADO em todas (R-ACC-13).
  --     Sem ele, quem controla o `search_path` da sessão planta um schema com uma
  --     função homônima e a `security definer` a executa com o privilégio do dono.
  --
  --     ⚠ Lê o EFEITO no catálogo (`pg_proc.proconfig`), nunca a grafia da migration:
  --     o repositório usa TRÊS formas — `set search_path = public`,
  --     `set search_path to 'public'` e `set search_path = ''` — e todas produzem a
  --     mesma entrada `search_path=…` em `proconfig`. Uma asserção que casasse texto
  --     de migration acusaria duas delas por engano.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(p.proname, ', ' order by p.proname), '')
    into v_cnt, v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as c
        where c like 'search_path=%'
     );
  if pg_temp.assert_zero_de(
       '3 `search_path` travado em toda `security definer`' ||
       case when v_cnt > 0 then ' — solto em: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 4 — NENHUMA `security definer` EXECUTÁVEL POR `anon`.
  --     `anon` é a identidade da chave pública: toda função com EXECUTE para ela é
  --     alcançável por `/rest/v1/rpc/<nome>` sem sessão nenhuma. E o default do
  --     Postgres é EXECUTE para PUBLIC — ou seja, uma função nova nasce aberta e é o
  --     `revoke` que a fecha. Medido nas migrations: 106 statements de
  --     `revoke … on function`, 101 citando `anon`/`public`. O que faltava não era
  --     revogar; era SER OBRIGADO a revogar. Esta asserção é a obrigação.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(p.proname, ', ' order by p.proname), '')
    into v_cnt, v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
     and has_function_privilege('anon', p.oid, 'execute');
  if pg_temp.assert_zero_de(
       '4 nenhuma `security definer` executável por anon' ||
       case when v_cnt > 0 then ' — alcançável(is): ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 5 — A EXCEÇÃO NOMINAL DE `valida_lancamento_item`. É REQUISITO, não opção.
  --
  --     Ela é a única função-GATILHO do repositório que é SECURITY INVOKER, e é de
  --     propósito: roda com o privilégio de QUEM chama, não do dono, então não é
  --     vetor de escalonamento e o advisor do Supabase não a aponta. Por isso a
  --     migration 0038 revoga o EXECUTE só das DUAS funções-gatilho SECURITY DEFINER
  --     (`aplicar_movimentacao`, `handle_new_user`) e deixa esta com o grant default.
  --     O motivo completo está em `seguranca_catalogo.sql:16-23`, e a asserção 4c de
  --     lá prova `prosecdef = false`.
  --
  --     ⚠ SEM ESTA EXCEÇÃO O CATÁLOGO NASCERIA ✗ PERMANENTE — a asserção 4 acima a
  --     acusaria — e gate que nasce vermelho por motivo legítimo é gate que alguém
  --     desliga. Aqui ela é dupla: `prosecdef = false` E ausência da tabela-verdade.
  --     Se um dia ela virar DEFINER, as duas metades acusam, e as asserções 4 e 4c de
  --     `seguranca_catalogo.sql` acusam junto.
  -- ---------------------------------------------------------------
  --     ⚠ Ela é escrita na forma POSITIVA (`bool_and(not prosecdef)`, o mesmo idioma da
  --     asserção 4c de `seguranca_catalogo.sql`) e não como "a contagem de definer é
  --     zero". As duas dariam o mesmo veredito hoje, mas a forma negativa é a que passa
  --     sobre conjunto vazio: com a função ausente do catálogo, "zero definer" é
  --     verdade e o ✓ sairia sobre nada. `bool_and` devolve NULL sobre conjunto vazio, e
  --     o NULL é tratado como ✗ logo abaixo — que é o veredito honesto.
  select bool_and(not p.prosecdef) into v_secdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'valida_lancamento_item';
  if v_secdef is null then
    v_falhas := v_falhas + 1;
    raise warning '✗ 5 valida_lancamento_item sumiu do catálogo — a exceção nominal ficou órfã';
  elsif v_secdef and not ('valida_lancamento_item' = any (k_secdef)) then
    v_ok := v_ok + 1;
    raise notice '✓ 5 valida_lancamento_item é INVOKER de propósito e está FORA da tabela-verdade (0038; motivo em seguranca_catalogo.sql:16-23)';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 5 valida_lancamento_item virou SECURITY DEFINER (ou entrou na tabela-verdade) — revise R-ACC-12/0038 e a asserção 4c de seguranca_catalogo.sql';
  end if;

  -- ---------------------------------------------------------------
  -- 6 — A OUTRA METADE DA SUPERFÍCIE: as INVOKER alcançáveis por `anon`.
  --
  --     Enumerar só as DEFINER deixaria metade da porta aberta: uma função INVOKER
  --     nova que LEIA tabela e nasça com o EXECUTE default de PUBLIC é alcançável por
  --     `/rest/v1/rpc/*` com a chave pública. Ela não escala privilégio (roda como
  --     quem chama), mas é superfície, e superfície não enumerada é como esta fase
  --     começou. As cinco de hoje estão declaradas NOMINALMENTE em `k_invoker_anon`,
  --     com o motivo de cada uma no cabeçalho. Dos dois sentidos:
  --       6a — INVOKER alcançável por anon fora da lista REPROVA;
  --       6b — nome na lista que já NÃO seja alcançável (foi revogado, ou sumiu) também
  --            REPROVA, para a exceção não sobreviver ao motivo que a criou.
  -- ---------------------------------------------------------------
  select count(*) into v_univ
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and not p.prosecdef;

  select count(*), coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '')
    into v_cnt, v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and not p.prosecdef
     and has_function_privilege('anon', p.oid, 'execute')
     and not (p.proname = any (k_invoker_anon));
  if pg_temp.assert_zero_de(
       '6a toda INVOKER alcançável por anon está declarada nominalmente' ||
       case when v_cnt > 0 then ' — não declarada(s): ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- 6b só tem sujeito quando há exceção declarada. Com a lista VAZIA (o estado desde
  -- a 0129) ela não é "verde": ela não existe.
  --
  -- ⚠ E o cuidado NÃO é estético: `array_length(array[]::text[], 1)` devolve NULL, e
  -- `assert_zero_de` LEVANTA EXCEÇÃO com universo NULL ou 0 — de propósito, para
  -- recusar asserção sobre conjunto vazio. Chamá-la aqui com a lista vazia abortaria
  -- o bloco inteiro, a linha `FIM` não sairia, e o runner reprovaria o roteiro por
  -- ausência de FIM. O guarda abaixo é o que separa "não há o que afirmar" de
  -- "quebrou".
  if array_length(k_invoker_anon, 1) is not null then
    select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
      into v_cnt, v_lista
      from unnest(k_invoker_anon) as nome
     where not exists (
       select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f' and not p.prosecdef
          and p.proname = nome and has_function_privilege('anon', p.oid, 'execute')
     );
    if pg_temp.assert_zero_de(
         '6b toda exceção declarada ainda descreve o banco' ||
         case when v_cnt > 0 then ' — obsoleta(s): ' || v_lista else '' end,
         v_cnt, array_length(k_invoker_anon, 1)::bigint) then
      v_ok := v_ok + 1;
    else
      v_falhas := v_falhas + 1;
    end if;
  else
    raise notice '✓ 6b sem exceção declarada — nada a envelhecer (a 6c prova as revogações)';
    v_ok := v_ok + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 6c — AS REVOGAÇÕES CONTINUAM DE PÉ (F50/0129).
  --
  --      A 6a enumera o que está FORA da lista de exceções; com a lista vazia, ela
  --      já cobre "nenhuma invoker é alcançável por anon". O que ela NÃO cobre é o
  --      caso em que a função some ou muda de nome — aí não há nada para achar, e o
  --      silêncio parece aprovação. Esta afirma o outro lado: as cinco existem, são
  --      INVOKER, e `anon` não as executa.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_invoker_revogadas) as nome
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and not p.prosecdef
        and p.proname = nome
        and not has_function_privilege('anon', p.oid, 'execute')
   );
  if pg_temp.assert_zero_de(
       '6c as cinco INVOKER da 0129 seguem sem EXECUTE para anon' ||
       case when v_cnt > 0 then ' — regrediu/sumiu: ' || v_lista else '' end,
       v_cnt, array_length(k_invoker_revogadas, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  raise notice 'FIM catalogo_secdef: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;
