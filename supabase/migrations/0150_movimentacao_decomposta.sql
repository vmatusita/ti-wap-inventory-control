-- =============================================================================
-- 0150 — a decomposição de aplicar_movimentacao (reauditoria de 18/09, passo 4, item AG)
-- =============================================================================
-- POR QUE ELA EXISTE
--
-- `public.aplicar_movimentacao()` é o gatilho que TODA movimentação atravessa, e o
-- corpo dela foi reemitido inteiro ONZE vezes (0004 0023 0045 0047 0051 0097 0099
-- 0109 0110 0134 0146). É o mesmo mecanismo causal que a F51 desmontou no import
-- (dívida técnica, item X): o método de mudar a função sempre foi "copiar o corpo e
-- editar o trecho novo", e cada correção de quatro linhas custava reemitir ~150. O
-- multiempresa (F62+) vem aí; se ele precisar tocar a máquina de estados, a 12ª
-- cópia nasceria ali.
--
-- Esta migration troca o corpo monolítico por uma ORQUESTRADORA FINA sobre SEIS
-- auxiliares nomeadas. A próxima mudança recria UMA delas.
--
-- AS SEIS, e a razão de mudança de cada uma (a história das onze cópias)
--
--   · movimentacao_estornar ................ o ramo de ESTORNO inteiro: as recusas
--       (0004/0134/0146), a guarda de identidade no destino do desfazer (0097) e o
--       UPDATE de restauração do ativo — UM statement, como sempre foi.
--   · movimentacao_pendencia_de_termo_restaurada ... a PENDÊNCIA DE TERMO: o texto
--       livre de `ativos.pendencia` (termo, patrimônio) restaurado pelo estorno SEM o
--       trecho de itens faltantes, que desde a 0051 mora em outra tabela (0023/0051).
--   · movimentacao_desfazer_pendencias_item  ⎫ a PENDÊNCIA DE ITEM, as duas portas de
--   · movimentacao_abrir_pendencias_item     ⎭ `pendencias_item`: o estorno apaga as
--       linhas da devolução desfeita, a devolução com itens faltantes abre uma por item
--       (0051).
--   · movimentacao_transicionar ............ o ramo NORMAL: o status resultante (ajuste
--       ou a matriz de transições), a filial de destino e a guarda de identidade (0047/
--       0097/0099), e o UPDATE do ativo — UM statement, como sempre foi.
--   · movimentacao_detentor_sincronizado ... a SINCRONIZAÇÃO DE DETENTOR: quem fica com
--       o equipamento depois da movimentação (0045/0109/0110) — pura, chamada DENTRO do
--       SET do UPDATE para colaborador e para setor.
--
-- O QUE **NÃO** MUDA — e esta lista é o contrato
--
--   · A assinatura e o gatilho: `aplicar_movimentacao() returns trigger`, `security
--     definer`, `set search_path = public`, e `trg_aplicar_movimentacao` (BEFORE INSERT,
--     0004) continua apontando para ela. `create or replace` puro: preserva o binding do
--     gatilho e o `revoke` da 0038.
--   · Toda mensagem de exceção, todo errcode, e a ORDEM das recusas.
--   · A ORDEM FÍSICA DAS ESCRITAS: no estorno, UPDATE de `ativos` e depois DELETE de
--     `pendencias_item`; no caminho normal, UPDATE de `ativos` e depois INSERT de
--     `pendencias_item`. Cada UPDATE continua sendo UM statement — dividi-lo mudaria o
--     número de versões da linha e a ordem em que as constraints veem o estado.
--   · As expressões: o código foi MOVIDO, não reescrito. A única troca é de nome —
--     `new` vira `p_mov`, `v_ativo` vira `p_ativo` — e os dois `case` de detentor e o
--     `case` da pendência viraram chamadas às funções que carregam exatamente aquele
--     `case`, com a coluna corrente como argumento. Nada de "simplificação equivalente
--     por argumento": a duplicação entre o `case` de `v_dest` e o `case` de `filial_id`
--     do UPDATE FICA, porque removê-la exigiria provar que as duas leituras de filial
--     são iguais em todo caso, e a equivalência desta migration é por construção.
--
-- AS DUAS DECISÕES DE FORMA (ata em docs/DECISOES.md, 21/09/2026)
--
--   1. As auxiliares que precisam das linhas recebem `(p_mov public.movimentacoes,
--      p_ativo public.ativos)` — a linha inteira, e SEMPRE com os dois argumentos. A
--      linha inteira porque a assinatura não muda quando a tabela ganha coluna (o
--      multiempresa vai acrescentar a de empresa, e quem precisar dela lê `p_mov`, sem
--      recriar assinatura nem chamada). Os DOIS argumentos porque o PostgREST trata uma
--      função cujo ÚNICO parâmetro é do tipo de uma tabela como campo computado dela — e
--      `movimentacao_estornar(p_mov)` viraria uma coluna virtual de `movimentacoes`.
--      Por isso `movimentacao_estornar` recebe `p_ativo` sem usá-lo hoje.
--   2. No ramo normal, `new.status_anterior`/`new.status_resultante` passam a ser
--      atribuídos DEPOIS da guarda e do UPDATE (antes, eram atribuídos antes deles),
--      porque o status resultante agora sai de `movimentacao_transicionar`. Não é
--      escrita nem recusa: `new` é um registro em memória até o `return new`, nada entre
--      os dois pontos o lê (as auxiliares recebem uma CÓPIA, tirada antes), e se algo
--      recusar a transação inteira aborta. É uma mudança de forma, declarada aqui para
--      que ninguém a descubra como surpresa.
--
-- POR QUE A TRAVA DE LINHA E O SNAPSHOT FICAM NA ORQUESTRADORA
--
-- O `select … for update` é efeito local à transação e tem de ser visto em quem
-- orquestra — a mesma régua da janela destrutiva e do advisory lock da F51 (Decisão 4).
-- O snapshot é tirado da linha sob essa trava e gravado em `new`, que só a
-- orquestradora pode atribuir.
--
-- POR QUE AS SEIS SÃO `security definer`, FECHADAS NOS QUATRO PAPÉIS
--
-- O mesmo argumento da F51 (Decisão 1): extrair código não pode introduzir dependência
-- de contexto que o código não tinha — a semântica de privilégio de um trecho da
-- máquina de estados não pode passar a depender de QUEM CHAMA. E elas não são API:
-- `revoke all … from public, anon, authenticated, service_role` em cada uma; só a
-- orquestradora, que roda como o dono, as alcança. É o molde de
-- `exigir_identidade_livre_na_filial` (0097), a primeira peça que saiu deste gatilho.
--
-- AS PROVAS (ata em docs/DECISOES.md)
--
--   · `supabase/tests/movimentacao_grade.sql` nasceu num commit SEM esta migration e
--     rodou no rig do CI contra a 0146 (o ANTES) e contra esta (o DEPOIS): o texto de
--     cada passo — 369 passos, todo estado × todo tipo, cada aceite estornado — tem de
--     sair idêntico, e o md5 da grade com ele.
--   · Os demais roteiros, ANTES × DEPOIS, com o texto inteiro das asserções.
--   · O injetor de mutações, com as duas mutações que miravam o corpo antigo
--     reapontadas para as auxiliares e uma nova por auxiliar sem cobertura.
--   · `src/lib/validators/movimentacao-uma-porta.test.ts`: uma porta por efeito
--     (quem escreve em `ativos`, quem abre e quem apaga pendência de item) e a
--     orquestradora alcançando cada auxiliar pelo nome — sem banco.
--
-- ROLLBACK — a ordem é o INVERSO da de apply, e não é livre (em prosa, porque
-- pseudo-SQL de função em comentário vira definição para scripts/db/corpo-vigente.mjs):
--
--   1º) reemitir a função de gatilho de movimentação com o corpo MONOLÍTICO da `0146`
--       (o arquivo inteiro está no git);
--   2º) SÓ ENTÃO derrubar as seis auxiliares desta migration, pelas assinaturas
--       listadas na verificação pós-apply abaixo.
--
-- O inverso derrubaria as auxiliares com a orquestradora nova ainda no ar, e toda
-- movimentação passaria a falhar. Não toca dado nenhum: é recriação de função.
--
-- CAMINHO A do RUNBOOK-BANCO.md: não há `delete from public.ativos` nem de
-- `movimentacoes` aqui — o único DELETE é o de `pendencias_item`, que o gatilho já fazia.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1/6 · movimentacao_detentor_sincronizado — a sincronização de detentor
-- -----------------------------------------------------------------------------
-- Quem fica com o equipamento depois da movimentação. O `case` é o da 0110, que
-- pergunta ao ESTADO resultante (`status_tem_detentor`, a fonte única) e não ao tipo:
-- estado sem dono zera; saída, empréstimo e reserva gravam o informado; o resto
-- mantém. É chamada duas vezes no UPDATE do caminho normal — colaborador e setor —,
-- sempre com o valor CORRENTE da coluna como `p_atual`, o que a mantém dentro do
-- mesmo statement.
create or replace function public.movimentacao_detentor_sincronizado(
  p_status    public.status_ativo,
  p_tipo      public.tipo_movimentacao,
  p_informado text,
  p_atual     text
) returns text
language sql
immutable
security definer
set search_path = public
as $$
  select case
    when not public.status_tem_detentor(p_status) then null
    when p_tipo in ('saida','emprestimo','reserva') then p_informado
    else p_atual end;
$$;

revoke all on function public.movimentacao_detentor_sincronizado(public.status_ativo, public.tipo_movimentacao, text, text)
  from public, anon, authenticated, service_role;

comment on function public.movimentacao_detentor_sincronizado(public.status_ativo, public.tipo_movimentacao, text, text) is
  '0150 (item AG) — a sincronização de detentor de aplicar_movimentacao: o valor de colaborador_atual/setor_atual depois de uma movimentação que não é estorno. Pura; chamada dentro do SET do UPDATE de movimentacao_transicionar. Fechada nos quatro papéis.';


-- -----------------------------------------------------------------------------
-- 2/6 · movimentacao_pendencia_de_termo_restaurada — a pendência de termo
-- -----------------------------------------------------------------------------
-- `ativos.pendencia` é o texto livre das pendências do CADASTRO (termo, patrimônio),
-- em trechos separados por `;`. O estorno o devolve ao que o snapshot guardou (0023)
-- SEM o trecho de itens faltantes, que desde a 0051 é linha de `pendencias_item`
-- e ressuscitá-lo como texto duplicaria a pendência. Snapshot anterior à 0023 (sem a
-- chave) mantém o valor corrente. Chamada dentro do SET do UPDATE de restauração, com
-- a coluna corrente como `p_atual`.
create or replace function public.movimentacao_pendencia_de_termo_restaurada(
  p_snapshot jsonb,
  p_atual    text
) returns text
language sql
immutable
security definer
set search_path = public
as $$
  select case when p_snapshot ? 'pendencia'
              then nullif(
                (select string_agg(trim(x.val), '; ' order by x.ord)
                 from unnest(string_to_array(p_snapshot ->> 'pendencia', ';'))
                      with ordinality as x(val, ord)
                 where nullif(trim(x.val), '') is not null
                   and lower(trim(x.val)) not like 'itens faltantes%'), '')
              else p_atual end;
$$;

revoke all on function public.movimentacao_pendencia_de_termo_restaurada(jsonb, text)
  from public, anon, authenticated, service_role;

comment on function public.movimentacao_pendencia_de_termo_restaurada(jsonb, text) is
  '0150 (item AG) — a pendência de termo de aplicar_movimentacao: o texto de ativos.pendencia que o estorno restaura do snapshot, sem os trechos de itens faltantes (que moram em pendencias_item desde a 0051). Pura; chamada dentro do SET do UPDATE de movimentacao_estornar. Fechada nos quatro papéis.';


-- -----------------------------------------------------------------------------
-- 3/6 · movimentacao_desfazer_pendencias_item — pendência de item, a porta do estorno
-- -----------------------------------------------------------------------------
-- O inverso de `movimentacao_abrir_pendencias_item`: estornar a devolução apaga as
-- linhas que ela abriu. Só chega aqui a pendência ainda sem desfecho — a que já teve
-- desfecho no estoque de itens é recusada antes, em `movimentacao_estornar` (0146).
create or replace function public.movimentacao_desfazer_pendencias_item(
  p_movimentacao_estornada uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.pendencias_item where movimentacao_id = p_movimentacao_estornada;
end $$;

revoke all on function public.movimentacao_desfazer_pendencias_item(uuid)
  from public, anon, authenticated, service_role;

comment on function public.movimentacao_desfazer_pendencias_item(uuid) is
  '0150 (item AG) — pendência de item, a porta do estorno: apaga as pendencias_item que a movimentação estornada abriu. A ÚNICA peça do gatilho que apaga de pendencias_item. Fechada nos quatro papéis.';


-- -----------------------------------------------------------------------------
-- 4/6 · movimentacao_abrir_pendencias_item — pendência de item, a porta da devolução
-- -----------------------------------------------------------------------------
-- A devolução com itens faltantes abre UMA linha por item não vazio, atada à
-- movimentação e ao colaborador da época — o informado, ou, se veio vazio, quem
-- estava com o equipamento ANTES desta movimentação (`p_ativo` é a linha lida sob a
-- trava, antes do UPDATE que zera o detentor). A guarda de tipo mora aqui dentro:
-- a orquestradora chama sempre, e só a devolução com item escreve.
create or replace function public.movimentacao_abrir_pendencias_item(
  p_mov   public.movimentacoes,
  p_ativo public.ativos
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_mov.tipo = 'devolucao' and coalesce(cardinality(p_mov.itens_faltantes), 0) > 0 then
    insert into public.pendencias_item (ativo_id, movimentacao_id, item, colaborador, filial_id)
    select p_mov.ativo_id,
           p_mov.id,
           u.item,
           coalesce(nullif(p_mov.colaborador, ''), p_ativo.colaborador_atual),
           p_mov.filial_id
    from unnest(p_mov.itens_faltantes) as u(item)
    where nullif(trim(u.item), '') is not null;
  end if;
end $$;

revoke all on function public.movimentacao_abrir_pendencias_item(public.movimentacoes, public.ativos)
  from public, anon, authenticated, service_role;

comment on function public.movimentacao_abrir_pendencias_item(public.movimentacoes, public.ativos) is
  '0150 (item AG) — pendência de item, a porta da devolução: abre uma pendencias_item por item faltante não vazio, com o colaborador da época. A ÚNICA peça do gatilho que insere em pendencias_item. Fechada nos quatro papéis.';


-- -----------------------------------------------------------------------------
-- 5/6 · movimentacao_estornar — o ramo de estorno
-- -----------------------------------------------------------------------------
-- Tudo o que se recusa, NA ORDEM de sempre, e só depois as duas escritas: o UPDATE de
-- restauração do ativo (UM statement) e o DELETE das pendências de item. Devolve o
-- status restaurado; quem o grava em `new` é a orquestradora. `p_ativo` não é usado
-- hoje — está na assinatura pela régua dos dois argumentos (ver o cabeçalho).
create or replace function public.movimentacao_estornar(
  p_mov   public.movimentacoes,
  p_ativo public.ativos
) returns public.status_ativo
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orig public.movimentacoes%rowtype;
begin
  if p_mov.estorno_de is null then
    raise exception 'Estorno exige referencia a movimentacao original (estorno_de)';
  end if;
  select * into v_orig from public.movimentacoes where id = p_mov.estorno_de;
  if v_orig.id is null or v_orig.ativo_id <> p_mov.ativo_id then
    raise exception 'estorno_de precisa apontar para uma movimentacao do MESMO ativo';
  end if;
  if v_orig.tipo = 'estorno' or v_orig.snapshot_anterior is null then
    raise exception 'Esta movimentacao nao pode ser estornada';
  end if;
  if exists (
    select 1 from public.movimentacoes m
    where m.ativo_id = p_mov.ativo_id
      and (m.created_at, m.ordem) > (v_orig.created_at, v_orig.ordem)
  ) then
    raise exception 'So a ultima movimentacao efetiva do ativo pode ser estornada (use ajuste, com justificativa)';
  end if;
  -- 0146: a pendência de item que esta devolução abriu já teve desfecho no estoque de
  -- itens (resolver grava lançamento apontando para a pendência, FK NO ACTION).
  -- Apagá-la estouraria 23503, e os lançamentos do desfecho ficariam de pé fora do
  -- estorno: recusa aqui, antes de mexer.
  if exists (
    select 1
      from public.pendencias_item p
      join public.lancamentos_item l on l.pendencia_item_id = p.id
     where p.movimentacao_id = v_orig.id
  ) then
    raise exception 'Estorno bloqueado: a pendencia de item desta devolucao ja teve desfecho registrado no estoque de itens (use ajuste, com justificativa)';
  end if;
  perform public.exigir_identidade_livre_na_filial(
    p_mov.ativo_id, (v_orig.snapshot_anterior ->> 'filial_id')::smallint, 'desfazer esta movimentação');

  update public.ativos set
    status            = (v_orig.snapshot_anterior ->> 'status')::public.status_ativo,
    colaborador_atual = v_orig.snapshot_anterior ->> 'colaborador',
    setor_atual       = v_orig.snapshot_anterior ->> 'setor',
    filial_id         = (v_orig.snapshot_anterior ->> 'filial_id')::smallint,
    pendencia         = public.movimentacao_pendencia_de_termo_restaurada(v_orig.snapshot_anterior, pendencia),
    termo_assinado    = case when v_orig.snapshot_anterior ? 'termo_assinado'
                             then (v_orig.snapshot_anterior ->> 'termo_assinado')::public.termo_status
                             else termo_assinado end,
    termo_data        = case when v_orig.snapshot_anterior ? 'termo_data'
                             then (v_orig.snapshot_anterior ->> 'termo_data')::date
                             else termo_data end,
    updated_at        = now()
  where id = p_mov.ativo_id;
  perform public.movimentacao_desfazer_pendencias_item(v_orig.id);
  return (v_orig.snapshot_anterior ->> 'status')::public.status_ativo;
end $$;

revoke all on function public.movimentacao_estornar(public.movimentacoes, public.ativos)
  from public, anon, authenticated, service_role;

comment on function public.movimentacao_estornar(public.movimentacoes, public.ativos) is
  '0150 (item AG) — o ramo de estorno de aplicar_movimentacao: as recusas (estorno_de, mesmo ativo, não reestornar, só a última efetiva, pendência de item com desfecho), a guarda de identidade no destino do desfazer, o UPDATE de restauração (um statement) e o desfazer das pendências de item. Devolve o status restaurado. Fechada nos quatro papéis.';


-- -----------------------------------------------------------------------------
-- 6/6 · movimentacao_transicionar — o ramo normal
-- -----------------------------------------------------------------------------
-- O status resultante (o ajuste traz o seu, com justificativa; os demais tipos
-- perguntam à matriz de transições), a filial em que o ativo FICA e a guarda de
-- identidade quando ela muda, e o UPDATE do ativo (UM statement). Devolve o status
-- resultante; quem o grava em `new` é a orquestradora.
create or replace function public.movimentacao_transicionar(
  p_mov   public.movimentacoes,
  p_ativo public.ativos
) returns public.status_ativo
language plpgsql
security definer
set search_path = public
as $$
declare
  v_novo   public.status_ativo;
  -- F24 (0099): a filial em que o ativo FICA depois desta movimentação.
  v_dest   smallint;
begin
  if p_mov.tipo = 'ajuste' then
    if p_mov.status_resultante is null or p_mov.observacao is null then
      raise exception 'Ajuste exige status_resultante e observacao (justificativa)';
    end if;
    v_novo := p_mov.status_resultante;
  else
    v_novo := public.status_apos_movimentacao(p_ativo.status, p_mov.tipo);
    if v_novo is null then
      raise exception 'Movimentacao % invalida para ativo % no estado %',
        p_mov.tipo, p_ativo.patrimonio, p_ativo.status;
    end if;
  end if;

  -- F24 (0099) — a guarda de identidade cobre TODO caminho que muda a filial do ativo, e
  -- não só a transferência (era o buraco da 0097): o destino sai do MESMO `case` do UPDATE
  -- logo abaixo, então `compra` e `troca` — que gravam `p_mov.filial_id` — entram junto.
  v_dest := case
    when p_mov.tipo in ('compra','troca') then p_mov.filial_id
    when p_mov.tipo = 'transferencia'     then coalesce(p_mov.filial_destino_id, p_ativo.filial_id)
    else p_ativo.filial_id end;

  if v_dest is not null and v_dest <> p_ativo.filial_id then
    perform public.exigir_identidade_livre_na_filial(
      p_mov.ativo_id, v_dest,
      case when p_mov.tipo = 'transferencia' then 'transferir este ativo'
           else 'registrar esta movimentação' end);
  end if;

  update public.ativos set
    status            = v_novo,
    colaborador_atual = public.movimentacao_detentor_sincronizado(v_novo, p_mov.tipo, p_mov.colaborador, colaborador_atual),
    setor_atual       = public.movimentacao_detentor_sincronizado(v_novo, p_mov.tipo, p_mov.setor, setor_atual),
    filial_id         = case
      when p_mov.tipo in ('compra','troca') then p_mov.filial_id
      when p_mov.tipo = 'transferencia' then coalesce(p_mov.filial_destino_id, filial_id)
      else filial_id end,
    termo_assinado    = coalesce(p_mov.termo_assinado, termo_assinado),
    termo_data        = coalesce(p_mov.termo_data, termo_data),
    updated_at        = now()
  where id = p_mov.ativo_id;

  return v_novo;
end $$;

revoke all on function public.movimentacao_transicionar(public.movimentacoes, public.ativos)
  from public, anon, authenticated, service_role;

comment on function public.movimentacao_transicionar(public.movimentacoes, public.ativos) is
  '0150 (item AG) — o ramo normal de aplicar_movimentacao: o status resultante (ajuste ou status_apos_movimentacao), a filial de destino com a guarda de identidade, e o UPDATE do ativo (um statement) com a sincronização de detentor. Devolve o status resultante. Fechada nos quatro papéis.';


-- -----------------------------------------------------------------------------
-- A ORQUESTRADORA — mesma assinatura, mesmo gatilho, o corpo virou a história
-- -----------------------------------------------------------------------------
create or replace function public.aplicar_movimentacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ativo  public.ativos%rowtype;
  v_novo   public.status_ativo;
begin
  -- A trava de linha: efeito local à transação, à vista de quem orquestra.
  select * into v_ativo from public.ativos where id = new.ativo_id for update;

  -- A foto de antes, tirada sob a trava — é dela que o estorno restaura.
  new.snapshot_anterior := jsonb_build_object(
    'status',         v_ativo.status,
    'colaborador',    v_ativo.colaborador_atual,
    'setor',          v_ativo.setor_atual,
    'filial_id',      v_ativo.filial_id,
    'pendencia',      v_ativo.pendencia,
    'termo_assinado', v_ativo.termo_assinado,
    'termo_data',     v_ativo.termo_data);

  if new.tipo = 'estorno' then
    v_novo := public.movimentacao_estornar(new, v_ativo);
    new.status_anterior   := v_ativo.status;
    new.status_resultante := v_novo;
    return new;
  end if;

  v_novo := public.movimentacao_transicionar(new, v_ativo);
  new.status_anterior   := v_ativo.status;
  new.status_resultante := v_novo;

  perform public.movimentacao_abrir_pendencias_item(new, v_ativo);

  return new;
end $$;


-- ---------- VERIFICAÇÃO PÓS-APPLY (RUNBOOK-BANCO.md §5) ----------
--   -- 1) a orquestradora ficou com a assinatura certa, SEM overload, e o gatilho aponta
--   --    para ela:
--   select p.oid::regprocedure::text, pg_get_function_result(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'aplicar_movimentacao';
--   -- esperado: EXATAMENTE 1 linha, aplicar_movimentacao() / trigger
--   select tgfoid::regprocedure from pg_trigger where tgname = 'trg_aplicar_movimentacao';
--   -- esperado: aplicar_movimentacao()
--
--   -- 2) as seis auxiliares nasceram FECHADAS (a lição da F50: revogar de `anon` sem
--   --    revogar de `public` é no-op silencioso — por isso a ACL crua também):
--   select p.oid::regprocedure::text, p.prosecdef, p.proconfig, p.proacl,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth,
--          has_function_privilege('service_role', p.oid, 'execute')  as serv
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname like 'movimentacao\_%';
--   -- esperado: 6 linhas, prosecdef = true, search_path=public, as três colunas FALSE e
--   -- proacl sem entrada `=X/` (a que representa PUBLIC). As assinaturas são:
--   --   movimentacao_detentor_sincronizado(status_ativo, tipo_movimentacao, text, text)
--   --   movimentacao_pendencia_de_termo_restaurada(jsonb, text)
--   --   movimentacao_desfazer_pendencias_item(uuid)
--   --   movimentacao_abrir_pendencias_item(movimentacoes, ativos)
--   --   movimentacao_estornar(movimentacoes, ativos)
--   --   movimentacao_transicionar(movimentacoes, ativos)
--
--   -- 3) o corpo vivo é o do arquivo: md5 do `prosrc` de cada uma contra o md5 do
--   --    trecho entre os `$$` deste arquivo (LF). `prosrc` é o corpo verbatim;
--   --    `pg_get_functiondef` regenera o cabeçalho e não serve para isso.
--
--   -- 4) recarregar o cache do PostgREST (seis objetos novos no schema):
--   notify pgrst, 'reload schema';
