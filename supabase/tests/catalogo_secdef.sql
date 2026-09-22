-- =============================================================
-- Roteiro de teste: A TABELA-VERDADE DAS `security definer` (F48, 07/09/2026)
-- =============================================================
-- POR QUE ELE EXISTE
--
-- O sistema tem 65 funções `security definer` (48 quando este arquivo nasceu na
-- F48; as três da 0138/F55, a da 0148, as seis da 0150 e as sete da F62 fecham a conta
-- — o histórico está no comentário de `k_secdef`) — cada uma roda com o privilégio do
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
  -- A TABELA-VERDADE — as 65 `security definer` de `public`, classificadas (eram 51
  -- na medição abaixo; a 0148 trouxe uma, a 0150 trouxe seis e a F62 trouxe sete, cada
  -- uma com o motivo).
  -- Medidas em 10/09/2026 sobre as migrations 0001→0138 (eram 48 até a 0137; a
  -- F55 acrescentou TRÊS na 0138 — as três no fim desta lista, com o motivo).
  -- Ordem alfabética dentro de cada bloco. O histórico da contagem:
  -- (eram 38 até a 0130; a F51 acrescentou as 8 auxiliares do import — 46. O
  --  número do cabeçalho dizia 37 e já estava desatualizado por 1 desde a
  --  0129, que trouxe `pode_ler_arquivo_termo` — corrigido aqui junto. A F52
  --  (0132) acrescentou DUAS: `mesmo_escopo_de_gestao` e
  --  `exigir_ativos_da_empresa` — 48. `prefixo_backup_import`, também nova na
  --  0132, FICA FORA desta lista de propósito: é `immutable`, sem
  --  `security definer`, molde de `prefixo_backup_reset`/`prefixo_backup_conflito`,
  --  que também não entram aqui pelo mesmo motivo.)
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
    -- `mesmo_escopo_de_gestao` (0132/F52) — a guarda de PERTENCIMENTO chamada
    -- de dentro de `exigir_gestao_de`, entre a checagem P0002 do alvo e o ramo
    -- de cargo. Devolve `true` hoje (uma empresa só) — a F65 lhe dá corpo
    -- real trocando só esta função. `security definer` pelo mesmo motivo das
    -- irmãs acima: chamada de dentro de uma `security definer` que já roda
    -- como o dono, sem precisar de grant nenhum.
    'mesmo_escopo_de_gestao',
    -- Gatilhos (0057/0081/0073/0110): escrevem FORA de policy, contando com o
    -- bypass do dono. É a segunda razão de `force row level security` ser proibido.
    'aplicar_movimentacao', 'handle_new_user', 'guarda_acervo', 'profiles_guarda_dev',
    -- Autorização de termo e de item (0068/0069/0097): leem a filial REAL em
    -- `ativos`, nunca a declarada pelo cliente — é o que as torna não-forjáveis.
    'estorno_item_coerente', 'pode_escrever_arquivo_termo', 'pode_escrever_termo',
    'termo_ancora_coerente', 'exigir_identidade_livre_na_filial',
    -- `pode_ler_arquivo_termo` (0129) — a irmã de LEITURA da `pode_escrever_arquivo_termo`,
    -- e `security definer` pelo mesmo motivo delas: chama `papel_atual()`, que lê
    -- `profiles`, cuja policy chama `papel_atual()` de volta. Rodar como INVOKER
    -- fecharia o ciclo (42P17). É a policy de SELECT do bucket `termos` que a usa.
    'pode_ler_arquivo_termo',
    -- Zona destrutiva (0082→0100): cada uma com `exigir_dev_para_destruir()` por
    -- dentro, backup obrigatório e trilha na MESMA transação.
    'apagar_ativo', 'apagar_item', 'apagar_movimentacao', 'apagar_ativos_conflito_filiais',
    'exigir_dev_para_destruir', 'forcar_estado_ativo', 'forcar_saldo_item',
    'previa_reset', 'resetar_acervo', 'resetar_itens', 'resetar_dados_ficticios',
    'rotulo_alcance_reset',
    -- `exigir_ativos_da_empresa` (0132/F52) — a guarda de PERTENCIMENTO da mesa
    -- de conflitos entre filiais, chamada por `apagar_ativos_conflito_filiais`
    -- depois da etapa (3) do lock (nunca antes: leitura própria de `ativos`
    -- exige linha já travada) e fora da janela `estoque.dev_destrutivo`. Não
    -- levanta hoje (uma empresa só) — a F65 lhe dá corpo real. Ver
    -- `conflito_filiais.sql` §10 para a prova da posição.
    'exigir_ativos_da_empresa',
    -- Import de startup (0094): apaga a filial e recarrega, dentro de uma janela.
    'importar_ativos_substituir',
    -- As OITO auxiliares do import (F51, 0131). A RPC de 393 linhas virou uma
    -- orquestradora fina sobre elas, e cada uma herdou o `security definer` da
    -- função que as gerou: a semântica de privilégio não pode passar a depender de
    -- QUEM CHAMA, ou extrair código teria mudado comportamento em silêncio.
    -- Elas NÃO são API — `revoke all … from public, anon, authenticated,
    -- service_role` nas oito; só a orquestradora as alcança. E
    -- `import_apagar_acervo_filial` é a ÚNICA da cadeia com
    -- `delete from public.ativos`, invariante conferida sem banco por
    -- src/lib/validators/import-uma-porta.test.ts.
    'import_validar_plano', 'import_revalidar_contagens', 'import_apagar_acervo_filial',
    'import_criar_ativos', 'import_lancar_movimentacoes', 'import_conferir_resultado',
    'import_contar_conflitos', 'import_gravar_trilha',
    -- As SEIS auxiliares de `aplicar_movimentacao` (reauditoria de 18/09, passo 4, item
    -- AG — 0150). O gatilho de ~150 linhas virou uma orquestradora fina sobre elas, pela
    -- receita da F51 e pelo mesmo argumento: cada uma herdou o `security definer` do
    -- gatilho que as gerou, porque a semântica de privilégio de um trecho da máquina de
    -- estados não pode passar a depender de QUEM CHAMA. Elas NÃO são API — `revoke all …
    -- from public, anon, authenticated, service_role` nas seis; só a orquestradora, que
    -- roda como o dono, as alcança. Quem escreve em `ativos`, quem abre e quem apaga
    -- pendência de item é invariante conferida sem banco por
    -- src/lib/validators/movimentacao-uma-porta.test.ts. 58 no total (65 com as da F62).
    'movimentacao_estornar', 'movimentacao_pendencia_de_termo_restaurada',
    'movimentacao_desfazer_pendencias_item', 'movimentacao_abrir_pendencias_item',
    'movimentacao_transicionar', 'movimentacao_detentor_sincronizado',
    -- Porta pública por senha (0025): conta tentativa por IP sem sessão nenhuma.
    'registrar_tentativa_senha',
    -- Área /dev (0077/0127): diagnóstico só-leitura, com SQL FIXO por dentro.
    'dev_checagens_integridade', 'ultima_migracao_aplicada',
    -- Integridade e ambiente (0138/F55) — as TRÊS novas, 51 no total.
    --
    -- `checagens_integridade_nucleo` é o SQL das doze checagens, extraído
    -- VERBATIM do corpo da 0136 para que não existisse uma segunda cópia dele.
    -- Herdou o `security definer` da função que a gerou — a semântica de
    -- privilégio não pode passar a depender de QUEM CHAMA, ou extrair código
    -- teria mudado comportamento em silêncio (o mesmo argumento das oito
    -- auxiliares do import, F51). Ela NÃO é API: `revoke all … from public,
    -- anon, authenticated, service_role`, e só as duas portas a alcançam,
    -- rodando como o dono.
    'checagens_integridade_nucleo',
    -- `checagens_integridade_resumo` é a porta do ALARME: guarda
    -- `papel_atual() is not null` (o piso de leitura da 0070/0073, decisão do
    -- Johnny de 10/09/2026) e projeção `(chave, total)` — sem a coluna
    -- `amostra`, que é a que carrega patrimônio e nome. É `authenticated` quem
    -- a executa, e é ela que o smoke agendado lê uma vez por dia com uma conta
    -- de cargo `consulta`.
    'checagens_integridade_resumo',
    -- `rotulo_de_ambiente` lê `public.ambiente` (0090), que tem `revoke all`
    -- até para o `service_role` — por isso a leitura tem de ser por função, e
    -- por isso ela é definer. Alcançável SÓ pela `service_role`, o mesmo
    -- privilégio de `resetar_dados_ficticios`; é o `scripts/env-guard.ts` que a
    -- consome, para confirmar no BANCO a identidade que hoje ele confere só
    -- pelo ref do projeto.
    'rotulo_de_ambiente',
    -- `ledger_de_migracoes` (0148/reauditoria 18/09/2026, item AE): o ledger de
    -- `supabase_migrations.schema_migrations`, fora dos schemas que o PostgREST
    -- expõe — precisa ser definer pelo MESMO motivo de
    -- `checagens_integridade_resumo`, cuja guarda ela copia
    -- (`papel_atual() is not null`). É o que `scripts/smoke/deriva-migrations.mjs`
    -- lê pela conta `consulta` do smoke agendado, para comparar o repositório
    -- com o que já foi aplicado. 52 no total (as seis da 0150, no bloco do import,
    -- levam a 58).
    'ledger_de_migracoes',
    -- F62 (22/09/2026) — SETE, 65 no total.
    --
    -- As QUATRO FUNÇÕES DE CONJUNTO (0157), na forma-alvo da MATRIZ (R-ACC-68): leem
    -- `membros` e a F66 fará as policies chamá-las; se fossem invoker, a RLS de `membros`
    -- valeria dentro delas e a policy de `membros` as chamaria de volta — a recursão 42P17
    -- que a 0070 provou para `profiles`. Sem parâmetro (fora de definer_sem_tenant.sql),
    -- `search_path = ''`, `revoke public, anon` + `grant authenticated`.
    'empresas_do_membro', 'empresas_de_escrita', 'empresas_de_admin', 'unidades_de_escrita',
    -- `e_plataforma` (0154): responde só sobre o chamador lendo `plataforma_admins`, que
    -- não tem policy nenhuma — a leitura tem de ser como o dono. Sem consumidor na F62.
    'e_plataforma',
    -- As DUAS de gatilho (0153/0156), fechadas nos quatro papéis como `profiles_guarda_dev`:
    -- `membros_guarda_dev` é a rede final do dev em `membros` e roda para TODO chamador,
    -- service role incluso; `operador_filiais_deriva_membership` lê `filiais` e
    -- `membros` para preencher a membership do vínculo, e tem de enxergá-las inteiras
    -- qualquer que seja quem insere (a RPC definer, o seed pelo service role).
    'membros_guarda_dev', 'operador_filiais_deriva_membership'
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

  -- -----------------------------------------------------------------------
  -- BLOCO 7 (F60) — a exceção NOMINAL ao recorte obrigatório de `public.rel_*`.
  --
  -- Fonte única (Decisão 2 da F48): `scripts/db/recorte-rel.mjs::lerExcecoesDeRecorte`
  -- lê ESTE array como TEXTO, nunca copiado para TypeScript. Uma entrada por linha,
  -- no formato `'rel_x', -- NNNN · motivo: <frase > 40 caracteres> · destino:
  -- F<n>|permanente` — a mesma régua de `k_excecoes_predicado` (catalogo_policies.sql),
  -- só que por NOME de função (não por ocorrência `schema.tabela / policy / função`):
  -- a chave de recorte da F60 é sempre a função INTEIRA, nunca uma cláusula.
  -- -----------------------------------------------------------------------
  k_excecoes_recorte text[] := array[
    'rel_saldo_colaborador' -- 0118 · motivo: recorta por PESSOA (p_colaborador), não por filial — devolve o saldo de UM colaborador em todas as filiais onde ele tem item, e o recorte de inquilino dela é a RLS de lancamentos_item/colaboradores (a que a virada multiempresa escreve nas policies) · destino: permanente
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

  -- ===============================================================
  -- BLOCO 7 — O RECORTE OBRIGATÓRIO DE `public.rel_*` (F60, 16/09/2026)
  --
  -- A F60 troca `p_filial smallint` com `(p_filial is null or col = p_filial)` por
  -- `p_filiais smallint[]` com `col = any (p_filiais)` nas RPCs de relatório — a
  -- forma anterior é NÃO-SARGÁVEL no caminho real (fato 6 da ordem: o PostgREST nunca
  -- chama com literal, e função com `set search_path` não é embutida — o plano fica
  -- `Seq Scan` com `Filter`) e é FAIL-OPEN (R-ACC-71 da emenda F59: "se nulo pode
  -- significar 'mostre tudo', a forma é proibida" — `rel_*(null)` hoje devolve TUDO).
  --
  -- A DIVISÃO DE TRABALHO — o catálogo julga FATOS DE CATÁLOGO, a mesa é a
  -- autoridade sobre a FORMA:
  --   · CONFIÁVEL, e só aqui: `proargnames`/`proallargtypes` (o parâmetro existe e o
  --     tipo é `smallint[]`, sem parsear texto — 7a), `provolatile`/`proisstrict`/
  --     `prosecdef`/`proconfig` (7d) e `has_function_privilege` por papel (7e) — são
  --     dados do catálogo, não do texto do corpo.
  --   · PROVA POSITIVA fraca, aqui e na mesa: 7b prova que `prosrc` MENCIONA a forma
  --     certa — é POSITIVO e confiável (a ligação existe), mas não prova que ela é a
  --     ÚNICA forma de acesso ao parâmetro.
  --   · SÓ NA MESA (`src/lib/validators/rpcs-recorte-sql.test.ts`, que importa
  --     `scripts/db/recorte-rel.mjs`): **R3** (a ligação é CONJUNÇÃO DIRETA de
  --     `where`/`on`/`having` — nunca dentro de uma disjunção ou de um `case`) e **R4**
  --     (toda leitura de tabela-base, em todo escopo de `select`, está coberta pelo
  --     recorte, direto ou herdado). O motivo é estrutural: função `language sql`
  --     clássica (a forma das oito `rel_*` de hoje — fato 5) não expõe o corpo como
  --     árvore no catálogo (`pg_proc.prosqlbody` fica NULO; só `prosrc`, texto, existe)
  --     — diferente de `polqual`/`polwithcheck` de POLICY, que É `pg_node_tree` (bloco
  --     4 acima). Por isso a 7c abaixo é uma prova NEGATIVA deliberadamente FRACA
  --     (declarada como tal): ela pega os disfarces TEXTUAIS conhecidos
  --     (`coalesce`/`nullif`/`case when`/`is null`/`is distinct` perto de
  --     `p_filiais`), mas não prova a ausência de TODO disfarce possível — só a mesa,
  --     com o léxico e os escopos, prova isso com segurança (R2/R3/R4).
  --
  -- A EXCEÇÃO — `k_excecoes_recorte`, declarada acima, junto das outras listas deste
  -- arquivo (Decisão 2 da F48: uma fonte por fato, nunca uma cópia em TypeScript).
  --
  -- ⚠ A exceção é um array de NOME, não de assinatura (a mesma forma de
  -- `k_secdef`) — por isso 7g, análoga à asserção 2 acima, prova que nenhum
  -- nome da lista tem mais de uma assinatura viva: sem ela, um SEGUNDO
  -- overload do nome isento herdaria a isenção inteira sem ter sido avaliado
  -- (revisão adversarial da F60, achado CRÍTICO — ver `docs/DECISOES.md`).
  -- ===============================================================

  -- ---------------------------------------------------------------
  -- 7a — toda `public.rel_*` declara `p_filiais smallint[]`, ou está na exceção.
  --      `proallargtypes` (não `proargtypes`) porque `returns table (...)` cria
  --      colunas OUT que entram em `proargnames` mas NUNCA em `proargtypes`
  --      (oidvector só de IN/INOUT/VARIADIC) — indexar por posição sem
  --      `proallargtypes` desalinharia nome e tipo a partir da primeira coluna
  --      de retorno.
  --
  --      ⚠ Quando a função NÃO tem nenhuma coluna OUT/INOUT/TABLE (não usa
  --      `returns table (...)`), o Postgres deixa `proallargtypes` NULO — só o
  --      popula quando há pelo menos um modo diferente de IN (confirmado ao
  --      vivo, F60: uma função com só parâmetros IN e `returns smallint` tem
  --      `proallargtypes is null`). Sem o `coalesce` abaixo, TODA `rel_*` que
  --      não usasse `returns table` cairia aqui como "sem o parâmetro certo"
  --      mesmo declarando `p_filiais smallint[]` do jeito certo — falha
  --      fechada (não deixa passar nada indevido), mas errada por motivo
  --      (achado da revisão adversarial "revisor catálogo", F60). Quando
  --      `proallargtypes` é nulo, TODOS os parâmetros são IN, então
  --      `proargtypes` (oidvector, indexado a partir de 0 — confirmado ao
  --      vivo) alinha 1:1 com `proargnames` por posição; `arg.ord` (1-based,
  --      de `with ordinality`) vira `arg.ord - 1` nesse índice.
  -- ---------------------------------------------------------------
  select count(*) into v_univ
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname ~ '^rel_';

  select count(*), coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '')
    into v_cnt, v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname ~ '^rel_'
     and not (p.proname = any (k_excecoes_recorte))
     and not exists (
       select 1
         from unnest(p.proargnames) with ordinality as arg(nome, ord)
        where arg.nome = 'p_filiais'
          and (
            (p.proallargtypes is not null and p.proallargtypes[arg.ord]::regtype = 'smallint[]'::regtype)
            or (p.proallargtypes is null and p.proargtypes[arg.ord - 1]::regtype = 'smallint[]'::regtype)
          )
     );
  if pg_temp.assert_zero_de(
       '7a toda rel_* declara p_filiais smallint[], ou está em k_excecoes_recorte' ||
       case when v_cnt > 0 then ' — sem o parâmetro certo: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 7b — toda rel_* fora da exceção MENCIONA a ligação certa no corpo. Prova
  --      POSITIVA (a forma existe) — confiável; não prova que é a ÚNICA forma
  --      de uso do parâmetro (isso é R2/R3, só na mesa).
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '')
    into v_cnt, v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname ~ '^rel_'
     and not (p.proname = any (k_excecoes_recorte))
     and p.prosrc !~* '[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?\s*=\s*any\s*\(\s*p_filiais\s*\)';
  if pg_temp.assert_zero_de(
       '7b toda rel_* fora da exceção tem "= any (p_filiais)" em prosrc' ||
       case when v_cnt > 0 then ' — sem a ligação no texto: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 7c — nenhuma rel_* tem, em prosrc, os disfarces textuais do fail-open
  --      conhecido (a lista do fato 7/9 da ordem). PROVA FRACA, de propósito
  --      (ver o cabeçalho do bloco): pega o disfarce CONHECIDO, não prova a
  --      ausência de todo disfarce possível — essa prova mora na mesa (R2/R3).
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '')
    into v_cnt, v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname ~ '^rel_'
     and p.prosrc ~* '(p_filiais\s+is\s+(not\s+)?null|coalesce\s*\(\s*p_filiais|nullif\s*\(\s*p_filiais|case\s+when\s+p_filiais|p_filiais\s+is\s+(not\s+)?distinct)';
  if pg_temp.assert_zero_de(
       '7c nenhuma rel_* tem disfarce textual conhecido de fail-open em prosrc (prova fraca — a mesa é a autoridade)' ||
       case when v_cnt > 0 then ' — disfarce achado em: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 7d — toda rel_* é security invoker, stable, não strict, com search_path
  --      fixo em proconfig (o mesmo efeito, lido do catálogo — nunca da
  --      grafia da migration; ver a asserção 3 acima).
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '')
    into v_cnt, v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname ~ '^rel_'
     and (
       p.prosecdef
       or p.provolatile <> 's'
       or p.proisstrict
       or not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as c
          where c like 'search_path=%'
       )
     );
  if pg_temp.assert_zero_de(
       '7d toda rel_* é security invoker, stable, não strict, com search_path fixo' ||
       case when v_cnt > 0 then ' — fora da forma: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 7e — `authenticated` e `service_role` têm EXECUTE em toda rel_* (a
  --      ausência de EXECUTE de `anon` já é a 6a, que vale para QUALQUER
  --      invoker de public — não duplicada aqui).
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(distinct p.proname, ', ' order by p.proname), '')
    into v_cnt, v_lista
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname ~ '^rel_'
     and not (
       has_function_privilege('authenticated', p.oid, 'execute')
       and has_function_privilege('service_role', p.oid, 'execute')
     );
  if pg_temp.assert_zero_de(
       '7e authenticated e service_role têm EXECUTE em toda rel_*' ||
       case when v_cnt > 0 then ' — sem EXECUTE em algum papel: ' || v_lista else '' end,
       v_cnt, v_univ) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 7f — a exceção nos DOIS sentidos: todo nome de `k_excecoes_recorte`
  --      existe como rel_* viva E não declara `p_filiais` — senão é exceção
  --      morta (a função já recorta e a exceção só esconderia uma regressão).
  --      Mesmo `coalesce` de proallargtypes/proargtypes da 7a — ver o motivo lá.
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(nome, ', ' order by nome), '')
    into v_cnt, v_lista
    from unnest(k_excecoes_recorte) as nome
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.proname = nome
   )
   or exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.proname = nome
        and exists (
          select 1
            from unnest(p.proargnames) with ordinality as arg(nome2, ord)
           where arg.nome2 = 'p_filiais'
             and (
               (p.proallargtypes is not null and p.proallargtypes[arg.ord]::regtype = 'smallint[]'::regtype)
               or (p.proallargtypes is null and p.proargtypes[arg.ord - 1]::regtype = 'smallint[]'::regtype)
             )
        )
   );
  if pg_temp.assert_zero_de(
       '7f toda exceção de k_excecoes_recorte existe como rel_* e não declara p_filiais (exceção viva, não morta)' ||
       case when v_cnt > 0 then ' — órfã ou morta: ' || v_lista else '' end,
       v_cnt, array_length(k_excecoes_recorte, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  -- ---------------------------------------------------------------
  -- 7g — NENHUM NOME de `k_excecoes_recorte` tem mais de uma assinatura
  --      viva. `k_excecoes_recorte` (Decisão 2 da F48) é um array de NOME, não
  --      de assinatura — 7a/7b/7f acima excluem TODA linha cujo `proname`
  --      esteja na lista, sem olhar `proargtypes`. Um SEGUNDO overload do
  --      mesmo nome (ex.: `rel_saldo_colaborador(uuid, boolean)`, que não
  --      declara `p_filiais` e lê `lancamentos_item` sem recorte nenhum)
  --      herdaria a isenção inteira sem ter sido avaliado por 7a/7b/7c — o
  --      achado CRÍTICO da revisão adversarial (F60): "a exceção casa por
  --      NOME da função, não pela assinatura inteira". Espelho, para o array
  --      de exceções, da asserção 2 acima ("nenhum nome `security definer`
  --      tem mais de uma assinatura viva") — a mesma doutrina, aplicada aqui
  --      só aos nomes que estão de fato isentos (os demais overloads de
  --      `rel_*` já são julgados um a um, por assinatura, em 7a/7b/7c, então
  --      não precisam desta trava adicional).
  -- ---------------------------------------------------------------
  select count(*), coalesce(string_agg(nome || ' (' || n || ')', ', ' order by nome), '')
    into v_cnt, v_lista
    from (
      select nome, count(*) as n
        from unnest(k_excecoes_recorte) as nome
        join pg_proc p on p.proname = nome
        join pg_namespace ns on ns.oid = p.pronamespace and ns.nspname = 'public' and p.prokind = 'f'
       group by nome having count(*) > 1
    ) dup;
  if pg_temp.assert_zero_de(
       '7g nenhum nome de k_excecoes_recorte tem mais de uma assinatura rel_* viva' ||
       case when v_cnt > 0 then ' — overload(s): ' || v_lista else '' end,
       v_cnt, array_length(k_excecoes_recorte, 1)::bigint) then
    v_ok := v_ok + 1;
  else
    v_falhas := v_falhas + 1;
  end if;

  raise notice 'FIM catalogo_secdef: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;
