-- =============================================================
-- Roteiro de teste: A GRADE DA MÁQUINA DE ESTADOS (reauditoria de 18/09, passo 4, item AG).
--
-- POR QUE ELE EXISTE
--
-- O item AG decompõe `public.aplicar_movimentacao()` (o gatilho que toda movimentação
-- atravessa) numa orquestradora fina sobre auxiliares nomeadas, SEM mudar comportamento.
-- A prova disso é a mesma que a F51 usou no import: este roteiro rodou no rig do CI
-- ANTES da migration que decompõe (corpo vigente = a `0146`) e DEPOIS dela, e o texto
-- inteiro da saída — cada linha `·` abaixo, com o estado observado passo a passo — tem
-- de sair idêntico. Ele nasceu num commit SEM a migration, de propósito: um teste novo
-- só prova equivalência se antes passou contra o código velho.
--
-- Ele fica no repositório depois disso, e por um motivo que vale sozinho: a leitura da
-- cobertura (docs/DECISOES.md, ata do passo 4) achou blocos do gatilho que NENHUM
-- roteiro exercitava — o estorno sem `estorno_de`, o `estorno_de` de outro ativo, a
-- guarda de identidade no ESTORNO e a guarda de identidade em `compra`/`troca`. Os
-- cenários nomeados da seção 2 fecham esses buracos, e são eles que o injetor de
-- mutações (scripts/db/mutacoes.mjs) usa para provar que cada auxiliar tem quem acuse.
--
-- AS TRÊS SEÇÕES
--
--   1. A GRADE: todo estado × todo tipo (menos `ajuste` e `estorno`, que têm cenário
--      próprio), em duas variantes de fixture; cada movimentação ACEITA é estornada em
--      seguida. As asserções `1a`–`1f` são PROPRIEDADES sobre a grade inteira (aceita
--      ⇔ a matriz de transições aceita; o estorno é o inverso completo; o detentor segue
--      o estado), não um gabarito célula a célula — uma mudança deliberada na matriz de
--      transições não derruba este roteiro, uma quebra no gatilho derruba.
--   2. OS CENÁRIOS NOMEADOS, um bloco do gatilho por rótulo.
--   3. A IMPRESSÃO: cada passo vira uma linha `· <rótulo> | <observação>`, e a última
--      linha informativa traz o md5 da grade. É esse texto que o ANTES × DEPOIS compara.
--
-- Convenção dos demais roteiros: `NOTICE '✓ …'` quando bate, `WARNING '✗ …'` quando não
-- bate, e a linha `FIM` no fim. As linhas `·` e `ℹ` são informativas e o runner as
-- ignora. Tudo numa transação que termina em ROLLBACK: nada é gravado.
--
-- ⚠ A FORMA DAS ASSERÇÕES NÃO É LIVRE. Os cenários nomeados escrevem o `✗ <rótulo>` LITERAL
-- e as propriedades da grade usam `pg_temp.assert_zero_de('<rótulo> …')` (a ferramenta da
-- F45, que recusa universo vazio). São as duas formas que a trava de mesa do injetor
-- (`scripts/db/mutacoes.test.mts`, `rotuloExisteNoFonte`) sabe ler: um helper local que
-- montasse o ✗ em tempo de execução faria todo rótulo desta casa parecer inexistente para
-- ela — e as mutações que dependem deles seriam recusadas antes de rodar.
--
-- Pré-requisitos: ≥ 1 profile ativo (o CI cria `ci@wap.ind.br`) e ≥ 3 filiais ativas
-- (as da 0007). Dados 100% fictícios (CLAUDE.md regra 2): patrimônios `TESTEAG…`,
-- pessoas "Detentor AG"/"Novo AG"/"Outro AG".
--
-- ⚠ Duas técnicas deste arquivo, com o porquê:
--   · os cenários `2f` e `2n` inserem uma movimentação com o gatilho DESLIGADO (o
--     precedente é `restauracao.sql`), porque é o único jeito de montar um snapshot
--     nulo ou um snapshot anterior à `0023` sem as chaves de pendência e termo — os dois
--     ramos do estorno que nenhum caminho de hoje produz. O gatilho é religado na linha
--     seguinte, dentro da mesma transação.
--   · `created_at` explícito onde a ordem importa (`2g`): dentro de UMA transação
--     `now()` é constante. Onde o empate é o próprio cenário (`2h`), ele é deliberado.
-- =============================================================

begin;

-- O registro de cada passo. `erro` é nulo quando o INSERT foi aceito; as colunas `a_*`
-- são o ativo logo DEPOIS do passo; `g_*` só existem nas linhas da grade (§1).
create temp table _ag_obs (
  n        int generated always as identity,
  rotulo   text not null,
  ativo    uuid,
  erro     text,
  a_status public.status_ativo,
  a_col    text,
  a_setor  text,
  a_filial smallint,
  a_pend   text,
  a_termo  public.termo_status,
  a_tdata  date,
  itens    text,
  obs      text not null,
  g_var    text,
  g_s      public.status_ativo,
  g_t      public.tipo_movimentacao,
  g_estorno boolean
) on commit drop;

-- O estado observável depois de um passo: o que a movimentação gravou nela mesma, o
-- ativo inteiro e as pendências de item do ativo. Nada de id, `created_at` ou `ordem`:
-- mudam de um banco para outro e não dizem nada sobre o gatilho.
create function pg_temp.ag_observar(p_ativo uuid, p_mov uuid, p_erro text)
returns text
language sql
as $f$
  select concat_ws(' | ',
    coalesce('ERRO ' || p_erro, 'ok'),
    (select format('mov ant=%L res=%L snap=%L',
                   m.status_anterior, m.status_resultante, m.snapshot_anterior)
       from public.movimentacoes m where m.id = p_mov),
    (select format('ativo st=%L col=%L set=%L fil=%L pend=%L termo=%L tdata=%L',
                   a.status, a.colaborador_atual, a.setor_atual, a.filial_id,
                   a.pendencia, a.termo_assinado, a.termo_data)
       from public.ativos a where a.id = p_ativo),
    (select 'itens=' || coalesce(string_agg(
              format('%s/%L/%s/%s', p.item, p.colaborador, p.filial_id, p.status), ','
              order by p.item, p.colaborador, p.filial_id, p.status), '-')
       from public.pendencias_item p where p.ativo_id = p_ativo));
$f$;

-- Um passo: tenta o INSERT numa subtransação, registra o que aconteceu e devolve o id
-- (nulo se o banco recusou). A recusa desfaz SÓ o passo — como a action faria.
create function pg_temp.ag_passo(
  p_rotulo      text,
  p_ativo       uuid,
  p_tipo        public.tipo_movimentacao,
  p_filial      smallint,
  p_colaborador text                 default null,
  p_setor       text                 default null,
  p_destino     smallint             default null,
  p_termo       public.termo_status  default null,
  p_termo_data  date                 default null,
  p_itens       text[]               default null,
  p_status      public.status_ativo  default null,
  p_observacao  text                 default null,
  p_estorno_de  uuid                 default null,
  p_created_at  timestamptz          default null,
  p_chamado     text                 default null
) returns uuid
language plpgsql
as $f$
declare
  v_id   uuid;
  v_erro text;
begin
  begin
    insert into public.movimentacoes (
      ativo_id, tipo, filial_id, colaborador, setor, filial_destino_id,
      termo_assinado, termo_data, itens_faltantes, status_resultante,
      observacao, estorno_de, created_at, chamado_fornecedor, criado_por)
    values (
      p_ativo, p_tipo, p_filial, p_colaborador, p_setor, p_destino,
      p_termo, p_termo_data, p_itens, p_status,
      p_observacao, p_estorno_de, coalesce(p_created_at, now()), p_chamado,
      current_setting('ag.prof')::uuid)
    returning id into v_id;
  exception when others then
    v_erro := sqlstate || ' ' || sqlerrm;
  end;
  insert into _ag_obs (rotulo, ativo, erro, a_status, a_col, a_setor, a_filial, a_pend,
                       a_termo, a_tdata, itens, obs)
  select p_rotulo, p_ativo, v_erro, a.status, a.colaborador_atual, a.setor_atual, a.filial_id,
         a.pendencia, a.termo_assinado, a.termo_data,
         (select coalesce(string_agg(format('%s/%s/%s', p.item, coalesce(p.colaborador, 'NULL'), p.status), ','
                                     order by p.item, p.colaborador, p.status), '-')
            from public.pendencias_item p where p.ativo_id = p_ativo),
         pg_temp.ag_observar(p_ativo, v_id, v_erro)
    from (select 1) um
    left join public.ativos a on a.id = p_ativo;
  return v_id;
end $f$;

-- Marca a última linha registrada como célula da grade.
create function pg_temp.ag_celula(p_var text, p_s public.status_ativo,
                                  p_t public.tipo_movimentacao, p_estorno boolean)
returns void
language sql
as $f$
  update _ag_obs set g_var = p_var, g_s = p_s, g_t = p_t, g_estorno = p_estorno
   where n = (select max(n) from _ag_obs);
$f$;

-- A fixture: um ativo já no estado pedido, escrito direto em `ativos` (sem passar pela
-- máquina de estados, que é justamente o que se quer observar).
create function pg_temp.ag_ativo(
  p_patrimonio text,
  p_filial     smallint,
  p_status     public.status_ativo,
  p_col        text                default null,
  p_setor      text                default null,
  p_pendencia  text                default null,
  p_termo      public.termo_status default null,
  p_termo_data date                default null,
  p_tag        text                default null
) returns uuid
language sql
as $f$
  insert into public.ativos (patrimonio, service_tag, categoria, filial_id, status,
                             colaborador_atual, setor_atual, pendencia, termo_assinado, termo_data)
  values (p_patrimonio, p_tag, 'notebook', p_filial, p_status,
          p_col, p_setor, p_pendencia, p_termo, p_termo_data)
  returning id;
$f$;

-- O último erro registrado (nulo se o último passo foi aceito).
create function pg_temp.ag_ultimo_erro()
returns text
language sql
as $f$
  select erro from _ag_obs order by n desc limit 1;
$f$;

do $$
declare
  v_prof uuid;
  v_f1 smallint; v_f2 smallint; v_f3 smallint;
  v_s public.status_ativo;
  v_t public.tipo_movimentacao;
  v_i int := 0;
  v_com_dono boolean;
  a uuid; b uuid; x uuid; y uuid;
  m1 uuid; m2 uuid; m3 uuid; v_dev uuid;
  v_item smallint; v_pend uuid;
  v_erro text; v_txt text; v_n int; v_u int;
  v_ok int := 0; v_falhas int := 0;
  r record;
begin
  select id into v_prof from public.profiles
   where ativo and excluido_em is null
   order by created_at, id limit 1;
  if v_prof is null then
    raise exception 'PRE-REQUISITO: crie ao menos 1 operador (profile) antes de rodar';
  end if;
  perform set_config('ag.prof', v_prof::text, true);

  select id into v_f1 from public.filiais where ativo order by id limit 1;
  select id into v_f2 from public.filiais where ativo and id <> v_f1 order by id limit 1;
  select id into v_f3 from public.filiais where ativo and id not in (v_f1, v_f2) order by id limit 1;
  if v_f3 is null then
    raise exception 'PRE-REQUISITO: ≥ 3 filiais ativas (migration 0007)';
  end if;

  -- ==========================================================================
  -- §1  A GRADE — todo estado × todo tipo, duas variantes, e o estorno de cada aceite
  -- ==========================================================================
  -- Variante A ("legado"): detentor preenchido MESMO nos estados sem dono (o
  --   colaborador fantasma que a 0110 existe para zerar), pendência com um trecho
  --   de "itens faltantes" (o que a restauração filtra), termo 'nao'; a movimentação
  --   informa colaborador e setor, e a devolução leva um item faltante.
  -- Variante B ("limpo"): detentor só nos estados com dono, pendência e termo nulos;
  --   a movimentação NÃO informa colaborador (a devolução manda '' — o `nullif`), traz
  --   termo 'sim', `compra`/`troca` mudam para a terceira filial e a transferência vai
  --   SEM destino (o `coalesce` que mantém a filial).
  for v_s in select e from unnest(enum_range(null::public.status_ativo)) e loop
    for v_t in select e from unnest(enum_range(null::public.tipo_movimentacao)) e
                where e not in ('ajuste', 'estorno') loop
      v_i := v_i + 1;

      a := pg_temp.ag_ativo(format('TESTEAGA%s', lpad(v_i::text, 3, '0')), v_f1, v_s,
             'Detentor AG', 'Setor AG', 'Sem termo; itens faltantes: mouse', 'nao', date '2026-01-15');
      m1 := pg_temp.ag_passo(format('A %s×%s', v_s, v_t), a, v_t, v_f1,
              p_colaborador => 'Novo AG', p_setor => 'Setor Novo',
              p_destino => case when v_t = 'transferencia' then v_f2 end,
              p_itens   => case when v_t = 'devolucao' then array['carregador'] end,
              p_chamado => case when v_t = 'envio_manutencao' then 'CH-AG' end);
      perform pg_temp.ag_celula('A', v_s, v_t, false);
      if m1 is not null then
        perform pg_temp.ag_passo(format('A %s×%s → estorno', v_s, v_t), a, 'estorno', v_f1,
                  p_estorno_de => m1);
        perform pg_temp.ag_celula('A', v_s, v_t, true);
      end if;

      v_com_dono := v_s in ('em_uso', 'emprestado', 'reservado');
      b := pg_temp.ag_ativo(format('TESTEAGB%s', lpad(v_i::text, 3, '0')), v_f1, v_s,
             case when v_com_dono then 'Detentor AG' end,
             case when v_com_dono then 'Setor AG' end);
      m2 := pg_temp.ag_passo(format('B %s×%s', v_s, v_t), b, v_t,
              case when v_t in ('compra', 'troca') then v_f3 else v_f1 end,
              p_colaborador => case when v_t = 'devolucao' then '' end,
              p_termo => 'sim', p_termo_data => date '2026-02-01',
              p_itens   => case when v_t = 'devolucao' then array['', ' ', 'mochila', 'mochila'] end,
              p_chamado => case when v_t = 'envio_manutencao' then 'CH-AG' end);
      perform pg_temp.ag_celula('B', v_s, v_t, false);
      if m2 is not null then
        perform pg_temp.ag_passo(format('B %s×%s → estorno', v_s, v_t), b, 'estorno', v_f1,
                  p_estorno_de => m2);
        perform pg_temp.ag_celula('B', v_s, v_t, true);
      end if;
    end loop;
  end loop;

  -- 1a — o gatilho aceita EXATAMENTE o que a matriz de transições aceita.
  select count(*) filter (where (o.erro is null) <> (public.status_apos_movimentacao(o.g_s, o.g_t) is not null)),
         count(*)
    into v_n, v_u
    from _ag_obs o where o.g_var is not null and not o.g_estorno;
  if pg_temp.assert_zero_de('1a a grade aceita exatamente o que status_apos_movimentacao aceita', v_n, v_u) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 1b — toda recusa da grade é a da transição inválida, com a frase que o app traduz.
  select count(*) filter (where o.erro not like 'P0001 Movimentacao % invalida para ativo TESTEAG% no estado %'),
         count(*)
    into v_n, v_u
    from _ag_obs o where o.g_var is not null and not o.g_estorno and o.erro is not null;
  if pg_temp.assert_zero_de('1b toda recusa da grade é a da transição inválida', v_n, v_u) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 1c — o aceite leva o ativo ao estado da matriz, na filial certa (compra/troca da
  --      variante B vão para a terceira filial; a transferência de A vai para a segunda;
  --      a de B, sem destino, fica).
  select count(*) filter (where not (
           o.a_status = public.status_apos_movimentacao(o.g_s, o.g_t)
       and o.a_filial = case when o.g_var = 'B' and o.g_t in ('compra', 'troca') then v_f3
                             when o.g_var = 'A' and o.g_t = 'transferencia' then v_f2
                             else v_f1 end)),
         count(*)
    into v_n, v_u
    from _ag_obs o where o.g_var is not null and not o.g_estorno and o.erro is null;
  if pg_temp.assert_zero_de('1c todo aceite da grade leva ao estado da matriz e à filial certa', v_n, v_u) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 1d — o detentor segue o ESTADO resultante (0110): sem dono → nulo; saída,
  --      empréstimo e reserva → o informado; os demais → o que já estava.
  select count(*) filter (where not (
           o.a_col is not distinct from (case
             when not public.status_tem_detentor(o.a_status) then null
             when o.g_t in ('saida', 'emprestimo', 'reserva') then (case when o.g_var = 'A' then 'Novo AG' end)
             when o.g_var = 'A' or o.g_s in ('em_uso', 'emprestado', 'reservado') then 'Detentor AG'
           end)
       and o.a_setor is not distinct from (case
             when not public.status_tem_detentor(o.a_status) then null
             when o.g_t in ('saida', 'emprestimo', 'reserva') then (case when o.g_var = 'A' then 'Setor Novo' end)
             when o.g_var = 'A' or o.g_s in ('em_uso', 'emprestado', 'reservado') then 'Setor AG'
           end))),
         count(*)
    into v_n, v_u
    from _ag_obs o where o.g_var is not null and not o.g_estorno and o.erro is null;
  if pg_temp.assert_zero_de('1d o detentor segue o estado resultante em todo aceite da grade', v_n, v_u) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 1e — termo e pendência seguem a movimentação: o termo informado vence (B), o
  --      ausente preserva o da fixture (A); a pendência de texto NÃO é tocada; só a
  --      devolução abre pendência de item — em B o colaborador '' cai no detentor e os
  --      brancos somem.
  select count(*) filter (where not (
           case when o.g_var = 'A'
                then o.a_termo = 'nao' and o.a_tdata = date '2026-01-15'
                     and o.a_pend = 'Sem termo; itens faltantes: mouse'
                     and o.itens = case when o.g_t = 'devolucao' then 'carregador/Novo AG/aberta' else '-' end
                else o.a_termo = 'sim' and o.a_tdata = date '2026-02-01' and o.a_pend is null
                     and o.itens = case when o.g_t = 'devolucao'
                                        then 'mochila/Detentor AG/aberta,mochila/Detentor AG/aberta' else '-' end
           end)),
         count(*)
    into v_n, v_u
    from _ag_obs o where o.g_var is not null and not o.g_estorno and o.erro is null;
  if pg_temp.assert_zero_de('1e termo e pendências seguem a movimentação em todo aceite da grade', v_n, v_u) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- 1f — o estorno de todo aceite passa e é o inverso completo: status, detentor,
  --      filial e termo da fixture; a pendência SEM o trecho de itens faltantes; e
  --      nenhuma pendência de item sobra.
  select count(*) filter (where not (
           o.erro is null
       and o.a_status = o.g_s
       and o.a_filial = v_f1
       and o.itens = '-'
       and case when o.g_var = 'A'
                then o.a_col = 'Detentor AG' and o.a_setor = 'Setor AG' and o.a_pend = 'Sem termo'
                     and o.a_termo = 'nao' and o.a_tdata = date '2026-01-15'
                else o.a_col is not distinct from
                       (case when o.g_s in ('em_uso', 'emprestado', 'reservado') then 'Detentor AG' end)
                     and o.a_setor is not distinct from
                       (case when o.g_s in ('em_uso', 'emprestado', 'reservado') then 'Setor AG' end)
                     and o.a_pend is null and o.a_termo is null and o.a_tdata is null
           end)),
         count(*)
    into v_n, v_u
    from _ag_obs o where o.g_var is not null and o.g_estorno;
  if pg_temp.assert_zero_de('1f o estorno de todo aceite da grade passa e devolve a fixture', v_n, v_u) then v_ok := v_ok + 1; else v_falhas := v_falhas + 1; end if;

  -- ==========================================================================
  -- §2  OS CENÁRIOS NOMEADOS — um bloco do gatilho por rótulo
  -- ==========================================================================

  -- 2a — o snapshot guarda as SETE chaves, com os valores de antes.
  a := pg_temp.ag_ativo('TESTEAG2A01', v_f1, 'em_estoque', null, null, 'Pendência 2a', 'gerado', date '2026-01-10');
  m1 := pg_temp.ag_passo('2a', a, 'saida', v_f1, p_colaborador => 'Novo AG');
  select format('%s %s %s', m.status_anterior, m.status_resultante, m.snapshot_anterior) into v_txt
    from public.movimentacoes m where m.id = m1;
  if coalesce((select m.snapshot_anterior = jsonb_build_object(
       'status', 'em_estoque', 'colaborador', null, 'setor', null, 'filial_id', v_f1,
       'pendencia', 'Pendência 2a', 'termo_assinado', 'gerado', 'termo_data', '2026-01-10')
       and m.status_anterior = 'em_estoque' and m.status_resultante = 'em_uso'
       from public.movimentacoes m where m.id = m1), false) then
    v_ok := v_ok + 1; raise notice '✓ 2a o snapshot guarda as sete chaves com os valores de antes';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2a o snapshot guarda as sete chaves com os valores de antes — obtido: %', coalesce((v_txt)::text, 'NULL');
  end if;

  -- 2b — estorno sem `estorno_de`.
  a := pg_temp.ag_ativo('TESTEAG2B01', v_f1, 'em_estoque');
  perform pg_temp.ag_passo('2b', a, 'estorno', v_f1);
  v_erro := pg_temp.ag_ultimo_erro();
  if coalesce(v_erro = 'P0001 Estorno exige referencia a movimentacao original (estorno_de)', false) then
    v_ok := v_ok + 1; raise notice '✓ 2b estorno sem estorno_de é recusado com a frase própria';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2b estorno sem estorno_de é recusado com a frase própria — obtido: %', coalesce((v_erro)::text, 'NULL');
  end if;

  -- 2c — `estorno_de` aponta para a movimentação de OUTRO ativo.
  a := pg_temp.ag_ativo('TESTEAG2C01', v_f1, 'em_estoque');
  b := pg_temp.ag_ativo('TESTEAG2C02', v_f1, 'em_estoque');
  m1 := pg_temp.ag_passo('2c-prep', b, 'saida', v_f1, p_colaborador => 'Novo AG');
  perform pg_temp.ag_passo('2c', a, 'estorno', v_f1, p_estorno_de => m1);
  v_erro := pg_temp.ag_ultimo_erro();
  if coalesce(v_erro = 'P0001 estorno_de precisa apontar para uma movimentacao do MESMO ativo', false) then
    v_ok := v_ok + 1; raise notice '✓ 2c estorno_de de outro ativo é recusado';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2c estorno_de de outro ativo é recusado — obtido: %', coalesce((v_erro)::text, 'NULL');
  end if;

  -- 2d — `estorno_de` aponta para movimentação que não existe (o gatilho recusa antes da FK).
  perform pg_temp.ag_passo('2d', a, 'estorno', v_f1,
            p_estorno_de => '00000000-0000-4000-8000-00000000a9d0'::uuid);
  v_erro := pg_temp.ag_ultimo_erro();
  if coalesce(v_erro = 'P0001 estorno_de precisa apontar para uma movimentacao do MESMO ativo', false) then
    v_ok := v_ok + 1; raise notice '✓ 2d estorno_de inexistente é recusado pelo gatilho, antes da FK';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2d estorno_de inexistente é recusado pelo gatilho, antes da FK — obtido: %', coalesce((v_erro)::text, 'NULL');
  end if;

  -- 2e — estorno de um estorno.
  a := pg_temp.ag_ativo('TESTEAG2E01', v_f1, 'em_estoque');
  m1 := pg_temp.ag_passo('2e-prep1', a, 'saida', v_f1, p_colaborador => 'Novo AG');
  m2 := pg_temp.ag_passo('2e-prep2', a, 'estorno', v_f1, p_estorno_de => m1);
  perform pg_temp.ag_passo('2e', a, 'estorno', v_f1, p_estorno_de => m2);
  v_erro := pg_temp.ag_ultimo_erro();
  if coalesce(v_erro = 'P0001 Esta movimentacao nao pode ser estornada', false) then
    v_ok := v_ok + 1; raise notice '✓ 2e estorno de estorno é recusado';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2e estorno de estorno é recusado — obtido: %', coalesce((v_erro)::text, 'NULL');
  end if;

  -- 2f — estorno de movimentação SEM snapshot (legado; montada com o gatilho desligado).
  a := pg_temp.ag_ativo('TESTEAG2F01', v_f1, 'em_uso', 'Detentor AG', 'Setor AG');
  alter table public.movimentacoes disable trigger trg_aplicar_movimentacao;
  insert into public.movimentacoes (ativo_id, tipo, filial_id, colaborador, criado_por,
                                    status_anterior, status_resultante, snapshot_anterior)
    values (a, 'saida', v_f1, 'Detentor AG', v_prof, 'em_estoque', 'em_uso', null)
    returning id into m1;
  alter table public.movimentacoes enable trigger trg_aplicar_movimentacao;
  perform pg_temp.ag_passo('2f', a, 'estorno', v_f1, p_estorno_de => m1);
  v_erro := pg_temp.ag_ultimo_erro();
  if coalesce(v_erro = 'P0001 Esta movimentacao nao pode ser estornada', false) then
    v_ok := v_ok + 1; raise notice '✓ 2f estorno de movimentação sem snapshot é recusado';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2f estorno de movimentação sem snapshot é recusado — obtido: %', coalesce((v_erro)::text, 'NULL');
  end if;

  -- 2g — só a última: `created_at` distintos, estornar a primeira.
  a := pg_temp.ag_ativo('TESTEAG2G01', v_f1, 'em_estoque');
  m1 := pg_temp.ag_passo('2g-prep1', a, 'saida', v_f1, p_colaborador => 'Novo AG',
          p_created_at => timestamptz '2026-06-01 09:00:00+00');
  m2 := pg_temp.ag_passo('2g-prep2', a, 'devolucao', v_f1,
          p_created_at => timestamptz '2026-06-01 09:01:00+00');
  perform pg_temp.ag_passo('2g', a, 'estorno', v_f1, p_estorno_de => m1,
            p_created_at => timestamptz '2026-06-01 09:02:00+00');
  v_erro := pg_temp.ag_ultimo_erro();
  if coalesce(v_erro = 'P0001 So a ultima movimentacao efetiva do ativo pode ser estornada (use ajuste, com justificativa)', false) then
    v_ok := v_ok + 1; raise notice '✓ 2g estornar uma movimentação que não é a última é recusado';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2g estornar uma movimentação que não é a última é recusado — obtido: %', coalesce((v_erro)::text, 'NULL');
  end if;

  -- 2h — o empate de `created_at` é desempatado por `ordem` (0134): a primeira recusa,
  --      a segunda aceita.
  a := pg_temp.ag_ativo('TESTEAG2H01', v_f1, 'em_estoque');
  m1 := pg_temp.ag_passo('2h-prep1', a, 'saida', v_f1, p_colaborador => 'Novo AG');
  m2 := pg_temp.ag_passo('2h-prep2', a, 'devolucao', v_f1);
  perform pg_temp.ag_passo('2h-1', a, 'estorno', v_f1, p_estorno_de => m1);
  v_erro := pg_temp.ag_ultimo_erro();
  m3 := pg_temp.ag_passo('2h-2', a, 'estorno', v_f1, p_estorno_de => m2);
  if coalesce(v_erro like 'P0001 So a ultima movimentacao efetiva%' and m3 is not null, false) then
    v_ok := v_ok + 1; raise notice '✓ 2h no empate de created_at, só a de maior ordem é estornável';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2h no empate de created_at, só a de maior ordem é estornável — obtido: %', coalesce((coalesce(v_erro, 'a primeira foi ACEITA') || ' / segunda: ' || coalesce(pg_temp.ag_ultimo_erro(), 'aceita'))::text, 'NULL');
  end if;

  -- 2i — a pendência de item desta devolução já teve desfecho (0146): recusa, e nada é desfeito.
  insert into public.itens (nome, grupo, ordem) values ('Item Teste AG 2i', 'acessorio', 9462)
    returning id into v_item;
  a := pg_temp.ag_ativo('TESTEAG2I01', v_f1, 'em_uso', 'Detentor AG', 'Setor AG');
  v_dev := pg_temp.ag_passo('2i-prep', a, 'devolucao', v_f1, p_itens => array['carregador']);
  select id into v_pend from public.pendencias_item where movimentacao_id = v_dev;
  insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, pendencia_item_id, criado_por)
    values (v_item, v_f1, 'entrada', 1, v_pend, v_prof);
  perform pg_temp.ag_passo('2i', a, 'estorno', v_f1, p_estorno_de => v_dev);
  v_erro := pg_temp.ag_ultimo_erro();
  if coalesce(v_erro = 'P0001 Estorno bloqueado: a pendencia de item desta devolucao ja teve desfecho registrado no estoque de itens (use ajuste, com justificativa)'
       and exists (select 1 from public.pendencias_item where id = v_pend)
       and (select status from public.ativos where id = a) = 'em_estoque', false) then
    v_ok := v_ok + 1; raise notice '✓ 2i estorno de devolução com pendência resolvida é recusado e nada é desfeito';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2i estorno de devolução com pendência resolvida é recusado e nada é desfeito — obtido: %', coalesce((v_erro)::text, 'NULL');
  end if;

  -- 2j — pendência ainda ABERTA: o estorno passa, apaga a linha e devolve o detentor.
  a := pg_temp.ag_ativo('TESTEAG2J01', v_f1, 'em_uso', 'Detentor AG', 'Setor AG');
  v_dev := pg_temp.ag_passo('2j-prep', a, 'devolucao', v_f1, p_itens => array['carregador', 'mouse']);
  m1 := pg_temp.ag_passo('2j', a, 'estorno', v_f1, p_estorno_de => v_dev);
  if coalesce(m1 is not null
       and not exists (select 1 from public.pendencias_item where movimentacao_id = v_dev)
       and (select status = 'em_uso' and colaborador_atual = 'Detentor AG' and setor_atual = 'Setor AG'
       from public.ativos where id = a), false) then
    v_ok := v_ok + 1; raise notice '✓ 2j estorno com pendência aberta apaga as linhas e devolve o detentor';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2j estorno com pendência aberta apaga as linhas e devolve o detentor — obtido: %', coalesce((pg_temp.ag_ultimo_erro())::text, 'NULL');
  end if;

  -- 2k — guarda de identidade NO ESTORNO: a transferência foi para a terceira filial,
  --      um gêmeo nasceu depois na filial de origem, e desfazer a transferência recusa.
  x := pg_temp.ag_ativo('TESTEAG2K01', v_f1, 'em_estoque', p_tag => 'AG-TAG-2K');
  m1 := pg_temp.ag_passo('2k-prep', x, 'transferencia', v_f1, p_destino => v_f3);
  y := pg_temp.ag_ativo('TESTEAG2K01', v_f1, 'em_estoque', p_tag => 'AG-TAG-2K');
  perform pg_temp.ag_passo('2k', x, 'estorno', v_f3, p_estorno_de => m1);
  v_erro := pg_temp.ag_ultimo_erro();
  if coalesce(v_erro like '42501 Já existe um ativo com este patrimônio + service tag na filial %antes de desfazer esta movimentação%'
       and (select filial_id from public.ativos where id = x) = v_f3, false) then
    v_ok := v_ok + 1; raise notice '✓ 2k desfazer a transferência para a filial do gêmeo é recusado com a mensagem própria';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2k desfazer a transferência para a filial do gêmeo é recusado com a mensagem própria — obtido: %', coalesce((v_erro)::text, 'NULL');
  end if;

  -- 2l — a restauração da pendência tira SÓ o trecho de itens faltantes e os brancos.
  a := pg_temp.ag_ativo('TESTEAG2L01', v_f1, 'em_estoque', null, null,
         'Sem termo; itens faltantes: mouse;  ; Outra coisa ');
  m1 := pg_temp.ag_passo('2l-prep', a, 'saida', v_f1, p_colaborador => 'Novo AG');
  perform pg_temp.ag_passo('2l', a, 'estorno', v_f1, p_estorno_de => m1);
  select pendencia into v_txt from public.ativos where id = a;
  if coalesce(v_txt = 'Sem termo; Outra coisa', false) then
    v_ok := v_ok + 1; raise notice '✓ 2l o estorno restaura a pendência sem o trecho de itens faltantes';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2l o estorno restaura a pendência sem o trecho de itens faltantes — obtido: %', coalesce((v_txt)::text, 'NULL');
  end if;

  -- 2m — pendência feita SÓ de itens faltantes volta como nula.
  a := pg_temp.ag_ativo('TESTEAG2M01', v_f1, 'em_estoque', null, null, 'Itens faltantes: mochila');
  m1 := pg_temp.ag_passo('2m-prep', a, 'saida', v_f1, p_colaborador => 'Novo AG');
  perform pg_temp.ag_passo('2m', a, 'estorno', v_f1, p_estorno_de => m1);
  select pendencia into v_txt from public.ativos where id = a;
  if coalesce(v_txt is null and pg_temp.ag_ultimo_erro() is null, false) then
    v_ok := v_ok + 1; raise notice '✓ 2m pendência só de itens faltantes volta nula no estorno';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2m pendência só de itens faltantes volta nula no estorno — obtido: %', coalesce((coalesce(v_txt, pg_temp.ag_ultimo_erro()))::text, 'NULL');
  end if;

  -- 2n — snapshot anterior à 0023 (sem as chaves de pendência e termo): o estorno
  --      restaura status/detentor/filial e PRESERVA a pendência e o termo de agora.
  a := pg_temp.ag_ativo('TESTEAG2N01', v_f1, 'em_uso', 'Detentor AG', 'Setor AG', 'Pendência atual',
         'sim', date '2026-03-03');
  alter table public.movimentacoes disable trigger trg_aplicar_movimentacao;
  insert into public.movimentacoes (ativo_id, tipo, filial_id, colaborador, criado_por,
                                    status_anterior, status_resultante, snapshot_anterior)
    values (a, 'saida', v_f1, 'Detentor AG', v_prof, 'em_estoque', 'em_uso',
            jsonb_build_object('status', 'em_estoque', 'colaborador', null, 'setor', null, 'filial_id', v_f1))
    returning id into m1;
  alter table public.movimentacoes enable trigger trg_aplicar_movimentacao;
  perform pg_temp.ag_passo('2n', a, 'estorno', v_f1, p_estorno_de => m1);
  if coalesce((select status = 'em_estoque' and colaborador_atual is null and setor_atual is null
       and pendencia = 'Pendência atual' and termo_assinado = 'sim' and termo_data = date '2026-03-03'
       from public.ativos where id = a), false) then
    v_ok := v_ok + 1; raise notice '✓ 2n snapshot sem as chaves de pendência/termo preserva as de agora';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2n snapshot sem as chaves de pendência/termo preserva as de agora — obtido: %', coalesce(((select obs from _ag_obs order by n desc limit 1))::text, 'NULL');
  end if;

  -- 2o — o termo informado vence; o estorno devolve o de antes.
  a := pg_temp.ag_ativo('TESTEAG2O01', v_f1, 'em_estoque', null, null, null, 'nao', date '2026-01-01');
  m1 := pg_temp.ag_passo('2o-prep', a, 'saida', v_f1, p_colaborador => 'Novo AG',
          p_termo => 'sim', p_termo_data => date '2026-04-04');
  select format('%s %s', termo_assinado, termo_data) into v_txt from public.ativos where id = a;
  perform pg_temp.ag_passo('2o', a, 'estorno', v_f1, p_estorno_de => m1);
  if coalesce(v_txt = 'sim 2026-04-04'
       and (select termo_assinado = 'nao' and termo_data = date '2026-01-01' from public.ativos where id = a), false) then
    v_ok := v_ok + 1; raise notice '✓ 2o o termo informado vence e o estorno devolve o de antes';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2o o termo informado vence e o estorno devolve o de antes — obtido: %', coalesce((v_txt)::text, 'NULL');
  end if;

  -- 2p — saída SEM colaborador e setor informados grava nulo (o tipo manda gravar o informado).
  a := pg_temp.ag_ativo('TESTEAG2P01', v_f1, 'em_estoque', 'Fantasma AG', 'Setor Fantasma');
  perform pg_temp.ag_passo('2p', a, 'saida', v_f1);
  if coalesce((select status = 'em_uso' and colaborador_atual is null and setor_atual is null
       from public.ativos where id = a), false) then
    v_ok := v_ok + 1; raise notice '✓ 2p saída sem colaborador informado grava detentor nulo';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2p saída sem colaborador informado grava detentor nulo — obtido: %', coalesce(((select obs from _ag_obs order by n desc limit 1))::text, 'NULL');
  end if;

  -- 2q — o fantasma: compra de ativo em estoque com detentor legado zera o detentor.
  a := pg_temp.ag_ativo('TESTEAG2Q01', v_f1, 'em_estoque', 'Fantasma AG', 'Setor Fantasma');
  perform pg_temp.ag_passo('2q', a, 'compra', v_f1);
  if coalesce((select colaborador_atual is null and setor_atual is null from public.ativos where id = a), false) then
    v_ok := v_ok + 1; raise notice '✓ 2q estado sem dono zera o detentor legado';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2q estado sem dono zera o detentor legado — obtido: %', coalesce(((select obs from _ag_obs order by n desc limit 1))::text, 'NULL');
  end if;

  -- 2r — transferência preserva o detentor e muda a filial.
  a := pg_temp.ag_ativo('TESTEAG2R01', v_f1, 'em_uso', 'Detentor AG', 'Setor AG');
  perform pg_temp.ag_passo('2r', a, 'transferencia', v_f1, p_colaborador => 'Outro AG', p_destino => v_f2);
  if coalesce((select status = 'em_uso' and colaborador_atual = 'Detentor AG' and filial_id = v_f2
       from public.ativos where id = a), false) then
    v_ok := v_ok + 1; raise notice '✓ 2r transferência preserva o detentor e muda a filial';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2r transferência preserva o detentor e muda a filial — obtido: %', coalesce(((select obs from _ag_obs order by n desc limit 1))::text, 'NULL');
  end if;

  -- 2s — re-reserva troca o detentor.
  a := pg_temp.ag_ativo('TESTEAG2S01', v_f1, 'reservado', 'Detentor AG', 'Setor AG');
  perform pg_temp.ag_passo('2s', a, 'reserva', v_f1, p_colaborador => 'Outro AG', p_setor => 'Setor Outro');
  if coalesce((select colaborador_atual = 'Outro AG' and setor_atual = 'Setor Outro' from public.ativos where id = a), false) then
    v_ok := v_ok + 1; raise notice '✓ 2s re-reserva troca o detentor';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2s re-reserva troca o detentor — obtido: %', coalesce(((select obs from _ag_obs order by n desc limit 1))::text, 'NULL');
  end if;

  -- 2t — ajuste: para estado com dono preserva o detentor (não é saída/empréstimo/reserva);
  --      para estado sem dono zera.
  a := pg_temp.ag_ativo('TESTEAG2T01', v_f1, 'em_uso', 'Detentor AG', 'Setor AG');
  perform pg_temp.ag_passo('2t-1', a, 'ajuste', v_f1, p_colaborador => 'Outro AG',
            p_status => 'emprestado', p_observacao => 'teste 2t');
  select colaborador_atual into v_txt from public.ativos where id = a;
  perform pg_temp.ag_passo('2t-2', a, 'ajuste', v_f1, p_status => 'em_estoque', p_observacao => 'teste 2t');
  if coalesce(v_txt = 'Detentor AG'
       and (select status = 'em_estoque' and colaborador_atual is null from public.ativos where id = a), false) then
    v_ok := v_ok + 1; raise notice '✓ 2t o ajuste preserva o detentor em estado com dono e zera em estado sem dono';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2t o ajuste preserva o detentor em estado com dono e zera em estado sem dono — obtido: %', coalesce((v_txt)::text, 'NULL');
  end if;

  -- 2u — ajuste sem status resultante.
  a := pg_temp.ag_ativo('TESTEAG2U01', v_f1, 'em_estoque');
  perform pg_temp.ag_passo('2u', a, 'ajuste', v_f1, p_observacao => 'teste 2u');
  v_erro := pg_temp.ag_ultimo_erro();
  if coalesce(v_erro = 'P0001 Ajuste exige status_resultante e observacao (justificativa)', false) then
    v_ok := v_ok + 1; raise notice '✓ 2u ajuste sem status resultante é recusado';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2u ajuste sem status resultante é recusado — obtido: %', coalesce((v_erro)::text, 'NULL');
  end if;

  -- 2v — ajuste sem justificativa.
  perform pg_temp.ag_passo('2v', a, 'ajuste', v_f1, p_status => 'em_uso');
  v_erro := pg_temp.ag_ultimo_erro();
  if coalesce(v_erro = 'P0001 Ajuste exige status_resultante e observacao (justificativa)', false) then
    v_ok := v_ok + 1; raise notice '✓ 2v ajuste sem justificativa é recusado';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2v ajuste sem justificativa é recusado — obtido: %', coalesce((v_erro)::text, 'NULL');
  end if;

  -- 2w — transição inválida, com o patrimônio e o estado na frase.
  a := pg_temp.ag_ativo('TESTEAG2W01', v_f1, 'em_uso', 'Detentor AG', 'Setor AG');
  perform pg_temp.ag_passo('2w', a, 'compra', v_f1);
  v_erro := pg_temp.ag_ultimo_erro();
  if coalesce(v_erro = 'P0001 Movimentacao compra invalida para ativo TESTEAG2W01 no estado em_uso', false) then
    v_ok := v_ok + 1; raise notice '✓ 2w transição inválida é recusada com patrimônio e estado na frase';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2w transição inválida é recusada com patrimônio e estado na frase — obtido: %', coalesce((v_erro)::text, 'NULL');
  end if;

  -- 2x/2y/2z — guarda de identidade no DESTINO, pelos três caminhos que mudam a filial.
  x := pg_temp.ag_ativo('TESTEAG2X01', v_f1, 'em_estoque', p_tag => 'AG-TAG-2X');
  y := pg_temp.ag_ativo('TESTEAG2X01', v_f2, 'em_estoque', p_tag => 'AG-TAG-2X');
  perform pg_temp.ag_passo('2x', x, 'transferencia', v_f1, p_destino => v_f2);
  v_erro := pg_temp.ag_ultimo_erro();
  if coalesce(v_erro like '42501 Já existe um ativo com este patrimônio + service tag na filial %antes de transferir este ativo%', false) then
    v_ok := v_ok + 1; raise notice '✓ 2x transferir para a filial do gêmeo é recusado';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2x transferir para a filial do gêmeo é recusado — obtido: %', coalesce((v_erro)::text, 'NULL');
  end if;
  perform pg_temp.ag_passo('2y', x, 'compra', v_f2);
  v_erro := pg_temp.ag_ultimo_erro();
  if coalesce(v_erro like '42501 Já existe um ativo com este patrimônio + service tag na filial %antes de registrar esta movimentação%', false) then
    v_ok := v_ok + 1; raise notice '✓ 2y compra que leva o ativo para a filial do gêmeo é recusada';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2y compra que leva o ativo para a filial do gêmeo é recusada — obtido: %', coalesce((v_erro)::text, 'NULL');
  end if;
  perform pg_temp.ag_passo('2z', x, 'troca', v_f2);
  v_erro := pg_temp.ag_ultimo_erro();
  if coalesce(v_erro like '42501 Já existe um ativo com este patrimônio + service tag na filial %antes de registrar esta movimentação%', false) then
    v_ok := v_ok + 1; raise notice '✓ 2z troca que leva o ativo para a filial do gêmeo é recusada';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 2z troca que leva o ativo para a filial do gêmeo é recusada — obtido: %', coalesce((v_erro)::text, 'NULL');
  end if;

  -- 3a — compra para filial LIVRE muda a filial (a recusa é estreita).
  m1 := pg_temp.ag_passo('3a', x, 'compra', v_f3);
  if coalesce(m1 is not null and (select filial_id from public.ativos where id = x) = v_f3, false) then
    v_ok := v_ok + 1; raise notice '✓ 3a compra para filial livre muda a filial';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3a compra para filial livre muda a filial — obtido: %', coalesce((pg_temp.ag_ultimo_erro())::text, 'NULL');
  end if;

  -- 3b — transferência sem destino mantém a filial.
  a := pg_temp.ag_ativo('TESTEAG3B01', v_f1, 'em_estoque');
  m1 := pg_temp.ag_passo('3b', a, 'transferencia', v_f1);
  if coalesce(m1 is not null and (select filial_id from public.ativos where id = a) = v_f1, false) then
    v_ok := v_ok + 1; raise notice '✓ 3b transferência sem destino mantém a filial';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3b transferência sem destino mantém a filial — obtido: %', coalesce((pg_temp.ag_ultimo_erro())::text, 'NULL');
  end if;

  -- 3c — ativo sem identidade (sem patrimônio e sem tag) não colide com nada.
  a := pg_temp.ag_ativo(null, v_f1, 'em_estoque');
  b := pg_temp.ag_ativo(null, v_f2, 'em_estoque');
  m1 := pg_temp.ag_passo('3c', a, 'transferencia', v_f1, p_destino => v_f2);
  if coalesce(m1 is not null and (select filial_id from public.ativos where id = a) = v_f2, false) then
    v_ok := v_ok + 1; raise notice '✓ 3c ativo sem identidade transfere para filial com outro sem identidade';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3c ativo sem identidade transfere para filial com outro sem identidade — obtido: %', coalesce((pg_temp.ag_ultimo_erro())::text, 'NULL');
  end if;

  -- 3d/3e/3f — o colaborador da pendência de item: nulo e '' caem no detentor atual;
  --            informado vence.
  a := pg_temp.ag_ativo('TESTEAG3D01', v_f1, 'em_uso', 'Detentor AG', 'Setor AG');
  perform pg_temp.ag_passo('3d', a, 'devolucao', v_f1, p_itens => array['mouse']);
  if coalesce((select count(*) = 1 and min(colaborador) = 'Detentor AG' from public.pendencias_item where ativo_id = a), false) then
    v_ok := v_ok + 1; raise notice '✓ 3d devolução sem colaborador: a pendência leva o detentor do ativo';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3d devolução sem colaborador: a pendência leva o detentor do ativo — obtido: %', coalesce(((select obs from _ag_obs order by n desc limit 1))::text, 'NULL');
  end if;
  a := pg_temp.ag_ativo('TESTEAG3E01', v_f1, 'emprestado', 'Detentor AG', 'Setor AG');
  perform pg_temp.ag_passo('3e', a, 'devolucao', v_f1, p_colaborador => '', p_itens => array['mouse']);
  if coalesce((select count(*) = 1 and min(colaborador) = 'Detentor AG' from public.pendencias_item where ativo_id = a), false) then
    v_ok := v_ok + 1; raise notice '✓ 3e devolução com colaborador vazio: a pendência leva o detentor do ativo';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3e devolução com colaborador vazio: a pendência leva o detentor do ativo — obtido: %', coalesce(((select obs from _ag_obs order by n desc limit 1))::text, 'NULL');
  end if;
  a := pg_temp.ag_ativo('TESTEAG3F01', v_f1, 'em_uso', 'Detentor AG', 'Setor AG');
  perform pg_temp.ag_passo('3f', a, 'devolucao', v_f1, p_colaborador => 'Outro AG', p_itens => array['mouse']);
  if coalesce((select count(*) = 1 and min(colaborador) = 'Outro AG' from public.pendencias_item where ativo_id = a), false) then
    v_ok := v_ok + 1; raise notice '✓ 3f devolução com colaborador informado: a pendência leva o informado';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3f devolução com colaborador informado: a pendência leva o informado — obtido: %', coalesce(((select obs from _ag_obs order by n desc limit 1))::text, 'NULL');
  end if;

  -- 3g — itens em branco não viram linha; repetidos viram duas; a filial é a da
  --      MOVIMENTAÇÃO, não a do ativo.
  a := pg_temp.ag_ativo('TESTEAG3G01', v_f1, 'em_uso', 'Detentor AG', 'Setor AG');
  perform pg_temp.ag_passo('3g', a, 'devolucao', v_f2,
            p_itens => array['', '   ', 'mochila', 'mochila', 'cabo']);
  if coalesce((select count(*) = 3 and count(*) filter (where item = 'mochila') = 2
       and bool_and(filial_id = v_f2) and bool_and(status = 'aberta')
       from public.pendencias_item where ativo_id = a), false) then
    v_ok := v_ok + 1; raise notice '✓ 3g brancos somem, repetidos viram duas linhas, filial da movimentação';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3g brancos somem, repetidos viram duas linhas, filial da movimentação — obtido: %', coalesce(((select obs from _ag_obs order by n desc limit 1))::text, 'NULL');
  end if;

  -- 3h — devolução com a lista VAZIA não abre nada.
  a := pg_temp.ag_ativo('TESTEAG3H01', v_f1, 'em_uso', 'Detentor AG', 'Setor AG');
  perform pg_temp.ag_passo('3h', a, 'devolucao', v_f1, p_itens => '{}'::text[]);
  if coalesce(pg_temp.ag_ultimo_erro() is null
       and not exists (select 1 from public.pendencias_item where ativo_id = a), false) then
    v_ok := v_ok + 1; raise notice '✓ 3h devolução com lista vazia não abre pendência';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3h devolução com lista vazia não abre pendência — obtido: %', coalesce(((select obs from _ag_obs order by n desc limit 1))::text, 'NULL');
  end if;

  -- 3i — ativo inexistente: o gatilho recusa a transição com os campos nulos na frase.
  perform pg_temp.ag_passo('3i', '00000000-0000-4000-8000-00000000a9d1'::uuid, 'saida', v_f1);
  v_erro := pg_temp.ag_ultimo_erro();
  if coalesce(v_erro = 'P0001 Movimentacao saida invalida para ativo <NULL> no estado <NULL>', false) then
    v_ok := v_ok + 1; raise notice '✓ 3i movimentação de ativo inexistente é recusada pelo gatilho';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3i movimentação de ativo inexistente é recusada pelo gatilho — obtido: %', coalesce((v_erro)::text, 'NULL');
  end if;

  -- 3j — ativo inexistente num AJUSTE (que o gatilho aceita): a recusa é a da FK.
  perform pg_temp.ag_passo('3j', '00000000-0000-4000-8000-00000000a9d2'::uuid, 'ajuste', v_f1,
            p_status => 'em_estoque', p_observacao => 'teste 3j');
  v_erro := pg_temp.ag_ultimo_erro();
  if coalesce(v_erro like '23503 %movimentacoes_ativo_id_fkey%', false) then
    v_ok := v_ok + 1; raise notice '✓ 3j ajuste de ativo inexistente passa pelo gatilho e cai na FK';
  else
    v_falhas := v_falhas + 1;
    raise warning '✗ 3j ajuste de ativo inexistente passa pelo gatilho e cai na FK — obtido: %', coalesce((v_erro)::text, 'NULL');
  end if;

  -- ==========================================================================
  -- §3  A IMPRESSÃO — o texto que o ANTES × DEPOIS compara
  -- ==========================================================================
  for r in select rotulo, obs from _ag_obs order by n loop
    raise notice '· % | %', r.rotulo, r.obs;
  end loop;
  select count(*), md5(string_agg(rotulo || ' | ' || obs, E'\n' order by n))
    into v_n, v_txt from _ag_obs;
  raise notice 'ℹ grade: % passos, md5 %', v_n, v_txt;

  raise notice 'FIM movimentacao_grade: % asserções, % falhas', v_ok + v_falhas, v_falhas;
end $$;

rollback;
