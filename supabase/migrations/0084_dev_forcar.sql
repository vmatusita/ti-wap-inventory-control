-- Migration 0084 — F23: a família FORÇAR. Estado de ativo e saldo de item, na marra —
-- sem revogar "a movimentação é a fonte da verdade".
--
-- Depende da 0079 (coluna `forcado`), 0081 (a guarda, que é quem impede outro caminho de
-- gravar a marca) e 0082 (`exigir_dev_para_destruir`). Contexto: F23 §4.
--
-- =============================================================================
-- A DOUTRINA NÃO SE REVOGA: NADA AQUI ESCREVE ESTADO À MÃO
-- =============================================================================
-- A ordem §4.1 pede a forma PREFERIDA — "materializar um registro na linha do tempo […] de
-- modo que status, ficha e as-of continuem DERIVANDO" — e ela é viável sem inventar mecanismo
-- nenhum, porque o mecanismo já existe:
--
--   `status_apos_movimentacao(status, 'ajuste')` devolve NULL, e o ramo `ajuste` de
--   `aplicar_movimentacao` usa `new.status_resultante` DIRETO, sem consultar a máquina —
--   exigindo `status_resultante` E `observacao` (justificativa). Ou seja: desde a 0004 o tipo
--   `ajuste` JÁ ignora as transições válidas.
--
-- Logo `forcar_estado_ativo` NÃO é um UPDATE em `ativos.status`: é um INSERT de movimentação
-- `ajuste`, marcada `forcado`, com a justificativa em `observacao`. O status do ativo continua
-- sendo o que o TRIGGER derivou; a ficha e o as-of continuam lendo a linha do tempo; e o
-- histórico EXPLICA o estado, em vez de contradizê-lo. Update direto — a "alternativa
-- inferior" da ordem — não foi preciso.
--
-- ⚠ E OS RELATÓRIOS? Não precisam de exceção nenhuma, e isso foi MEDIDO, não presumido:
-- `rel_resumo`, `rel_mov_por_mes` e `rel_por_motivo` filtram, os três,
-- `where m.tipo in ('saida','devolucao')`. Um `ajuste` já está fora dos três. A correção-dev
-- portanto NÃO entra em Entradas/Saídas, série mensal nem quebra por motivo — e não por uma
-- lista de exclusão nova que alguém possa esquecer de repetir amanhã, mas porque o tipo
-- escolhido já está fora do recorte. Ela ENTRA, isso sim, no estado as-of e nos KPIs de
-- inventário — que é exatamente o que se quer: o ativo está mesmo naquele estado.
-- (`motivo` fica NULL de propósito: `movimentacoes.motivo` é anulável, e depender de uma linha
-- de `public.motivos` — catálogo que o admin edita em /admin/motivos — seria pendurar a marca
-- da ferramenta num dado que outra pessoa pode renomear ou reativar. Quem marca é a coluna
-- `forcado` da 0079, que nenhuma tela escreve.)
--
-- ⚠ O QUE O `ajuste` SOZINHO **NÃO** FAZ, e esta migration faz: ZERAR O DETENTOR nos estados
-- terminais. O `case` de `aplicar_movimentacao` só limpa `colaborador_atual`/`setor_atual`
-- quando o TIPO é devolucao/triagem_ok/descarte/envio_manutencao/devolucao_fornecedor — e
-- `ajuste` não está nessa lista. Sem o passo abaixo, forçar um ativo para `descartado`
-- deixaria um ativo descartado ainda "com" um colaborador, que é precisamente a incoerência
-- que a 0045/F14 fechou no caminho normal. O §4.1 manda espelhar; é o que se faz.
--
-- ADITIVA: só cria funções; nenhum DELETE no corpo → NÃO bate no gate → caminho **A**.
--
-- REVERSÃO: drop function public.forcar_estado_ativo(uuid, public.status_ativo, text),
--   public.forcar_saldo_item(smallint, smallint, integer, text);

-- ---------------------------------------------------------------------------
-- 1) forcar_estado_ativo
-- ---------------------------------------------------------------------------
create or replace function public.forcar_estado_ativo(
  p_ativo         uuid,
  p_status        public.status_ativo,
  p_justificativa text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a      public.ativos%rowtype;
  v_uid    uuid := (select auth.uid());
  v_mov_id uuid;
  v_antes  public.status_ativo;
  v_rotulo text;
  -- Estados em que NINGUÉM está com o equipamento. Espelha o `case` de
  -- aplicar_movimentacao: os tipos que limpam detentor (devolucao, triagem_ok, descarte,
  -- envio_manutencao, devolucao_fornecedor) resultam exatamente nestes cinco.
  -- `defasado`, `em_uso`, `emprestado` e `reservado` ficam de fora de propósito: ali o
  -- detentor é informação legítima e apagá-lo perderia dado.
  v_sem_detentor constant public.status_ativo[] :=
    array['em_estoque','em_triagem','em_manutencao','descartado','devolvido_fornecedor']::public.status_ativo[];
begin
  perform public.exigir_dev_para_destruir(p_justificativa);

  select * into v_a from public.ativos where id = p_ativo for update;
  if v_a.id is null then
    raise exception 'Ativo não encontrado.' using errcode = 'P0002';
  end if;

  v_antes  := v_a.status;
  v_rotulo := coalesce(nullif(btrim(v_a.patrimonio), ''), nullif(btrim(v_a.service_tag), ''), v_a.id::text);

  -- Já está lá: não é erro, e registrar uma correção que não corrige nada só sujaria a linha
  -- do tempo. Mesmo idioma de `definir_papel_usuario` (0074), que retorna quando nada muda.
  if v_antes = p_status then
    return jsonb_build_object(
      'alterado', false, 'ativo_id', p_ativo, 'rotulo', v_rotulo, 'status', v_antes);
  end if;

  -- ---------- a janela abre ----------
  -- Necessária por causa da MARCA: a guarda da 0081 recusa INSERT com `forcado = true` fora
  -- do caminho oficial. (Os dois triggers são BEFORE INSERT FOR EACH ROW e disparam em ordem
  -- alfabética: `movimentacoes_guarda_acervo` antes de `trg_aplicar_movimentacao` — a guarda
  -- decide primeiro, que é a ordem desejada.)
  perform set_config('estoque.dev_destrutivo', 'on', true);

  insert into public.movimentacoes (
    ativo_id, tipo, motivo, data, filial_id,
    status_resultante, observacao, criado_por, forcado
  ) values (
    p_ativo, 'ajuste', null, current_date, v_a.filial_id,
    p_status, btrim(p_justificativa), v_uid, true
  )
  returning id into v_mov_id;

  -- Espelha o zeramento de detentor dos estados terminais (ver cabeçalho).
  if p_status = any (v_sem_detentor) then
    update public.ativos
       set colaborador_atual = null,
           setor_atual       = null,
           updated_at        = now()
     where id = p_ativo;
  end if;

  perform set_config('estoque.dev_destrutivo', 'off', true);
  -- ---------- a janela fecha ----------

  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values (v_uid, 'estado_forcado', v_rotulo,
          jsonb_build_object(
            'justificativa',   btrim(p_justificativa),
            'ativo_id',        p_ativo,
            'movimentacao_id', v_mov_id,
            'de',              v_antes,
            'para',            p_status,
            'detentor_zerado', (p_status = any (v_sem_detentor))));

  return jsonb_build_object(
    'alterado',        true,
    'ativo_id',        p_ativo,
    'rotulo',          v_rotulo,
    'movimentacao_id', v_mov_id,
    'de',              v_antes,
    'para',            p_status,
    'detentor_zerado', (p_status = any (v_sem_detentor)));

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

comment on function public.forcar_estado_ativo(uuid, public.status_ativo, text) is
  'F23 (/dev): leva um ativo a QUALQUER status do enum, ignorando as transições válidas — registrando uma movimentação de tipo `ajuste` marcada `forcado`, com a justificativa em `observacao`. O status segue DERIVADO pelo trigger; a ficha e o as-of continuam lendo a linha do tempo, e o histórico explica o estado. Não é contada por rel_resumo/rel_mov_por_mes/rel_por_motivo, que só olham saida e devolucao. Zera colaborador/setor quando o estado alvo é um em que ninguém está com o equipamento (em_estoque, em_triagem, em_manutencao, descartado, devolvido_fornecedor), espelhando o que a máquina faz no caminho normal. Exige cargo dev e justificativa de 10+ caracteres.';

revoke all on function public.forcar_estado_ativo(uuid, public.status_ativo, text) from public, anon, service_role;
grant execute on function public.forcar_estado_ativo(uuid, public.status_ativo, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) forcar_saldo_item
-- ---------------------------------------------------------------------------
-- ⚠ NÃO EXISTE COLUNA DE SALDO em lugar nenhum: `rel_saldo_itens` deriva total/estoque/
-- atrelados/falta somando `lancamentos_item` na hora. "Forçar o saldo" é, portanto,
-- necessariamente, GRAVAR O LANÇAMENTO que leva a soma ao alvo — nunca escrever um número.
--
-- O alvo é o TOTAL do item na filial (o que a filial possui), que é a soma
-- `entrada + ajuste` — a mesma expressão de `rel_saldo_itens` e do trigger
-- `valida_lancamento_item`. Delta = alvo − total atual; o lançamento é um `ajuste` com esse
-- delta, que o CHECK `lanc_item_qtd_valida` aceita negativo (só proíbe zero) e o CHECK
-- `lanc_item_ajuste_obs` obriga a vir com observação.
--
-- ⚠ O TRIGGER PODE RECUSAR, e deve: `valida_lancamento_item` barra quando o resultado
-- deixaria o total negativo ou a prateleira negativa (o que está reservado/liberado não cabe
-- mais no total). Forçar o saldo abaixo do que já está comprometido é incoerência, não
-- correção — a mensagem do trigger sobe para a tela como está.
create or replace function public.forcar_saldo_item(
  p_item          smallint,
  p_filial        smallint,
  p_saldo_alvo    integer,
  p_justificativa text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_nome   text;
  v_filial text;
  v_atual  int;
  v_delta  int;
  v_lanc   uuid;
begin
  perform public.exigir_dev_para_destruir(p_justificativa);

  select i.nome into v_nome from public.itens i where i.id = p_item;
  if v_nome is null then
    raise exception 'Item não encontrado.' using errcode = 'P0002';
  end if;

  select f.nome into v_filial from public.filiais f where f.id = p_filial;
  if v_filial is null then
    raise exception 'Filial não encontrada.' using errcode = 'P0002';
  end if;

  if p_saldo_alvo is null or p_saldo_alvo < 0 then
    raise exception 'O saldo alvo precisa ser zero ou maior.' using errcode = '22023';
  end if;

  -- Total atual = a MESMA expressão de rel_saldo_itens (entrada + ajuste).
  select coalesce(sum(case l.tipo::text when 'entrada' then l.quantidade
                                        when 'ajuste'  then l.quantidade
                                        else 0 end), 0)::int
    into v_atual
    from public.lancamentos_item l
   where l.item_id = p_item and l.filial_id = p_filial;

  v_delta := p_saldo_alvo - v_atual;

  if v_delta = 0 then
    return jsonb_build_object(
      'alterado', false, 'item_id', p_item, 'item', v_nome,
      'filial_id', p_filial, 'filial', v_filial, 'saldo', v_atual);
  end if;

  -- ---------- a janela abre ----------
  perform set_config('estoque.dev_destrutivo', 'on', true);

  insert into public.lancamentos_item (
    item_id, filial_id, tipo, quantidade, data, observacao, criado_por, forcado
  ) values (
    p_item, p_filial, 'ajuste', v_delta, current_date, btrim(p_justificativa), v_uid, true
  )
  returning id into v_lanc;

  perform set_config('estoque.dev_destrutivo', 'off', true);
  -- ---------- a janela fecha ----------

  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values (v_uid, 'saldo_forcado', v_nome || ' — ' || v_filial,
          jsonb_build_object(
            'justificativa', btrim(p_justificativa),
            'item_id',       p_item,
            'filial_id',     p_filial,
            'de',            v_atual,
            'para',          p_saldo_alvo,
            'delta',         v_delta,
            'lancamento_id', v_lanc));

  return jsonb_build_object(
    'alterado',      true,
    'item_id',       p_item,
    'item',          v_nome,
    'filial_id',     p_filial,
    'filial',        v_filial,
    'de',            v_atual,
    'para',          p_saldo_alvo,
    'delta',         v_delta,
    'lancamento_id', v_lanc);

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

comment on function public.forcar_saldo_item(smallint, smallint, integer, text) is
  'F23 (/dev): leva o TOTAL de um item numa filial a um valor alvo GRAVANDO o lançamento de ajuste com o delta — o saldo continua 100% derivado da soma dos lançamentos, e esta fase não escreve saldo à mão em lugar nenhum. O lançamento nasce marcado `forcado`, com a justificativa em `observacao`. Pode ser RECUSADO pelo trigger valida_lancamento_item quando o alvo é menor do que já está reservado/liberado — nesse caso a incoerência é o pedido, não o sistema. Exige cargo dev e justificativa de 10+ caracteres.';

revoke all on function public.forcar_saldo_item(smallint, smallint, integer, text) from public, anon, service_role;
grant execute on function public.forcar_saldo_item(smallint, smallint, integer, text) to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) as duas funções, definer, execute só para authenticated:
--   select p.proname, p.prosecdef as definer,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth,
--          has_function_privilege('service_role', p.oid, 'execute')  as srv
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('forcar_estado_ativo','forcar_saldo_item');
--   -- esperado: 2 linhas · definer=true · anon=false · auth=true · srv=false
--
--   -- 2) NENHUMA das duas escreve status/saldo à mão (a doutrina, verificável por texto):
--   select p.proname,
--          pg_get_functiondef(p.oid) ~* 'update public\.ativos set[^;]*status' as escreve_status
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname = 'forcar_estado_ativo';
--   -- esperado: false — o único UPDATE em ativos aqui zera colaborador/setor, nunca o status
--
--   -- 3) a correção-dev NÃO é contada por nenhum relatório (prova por consulta, não por
--   --    raciocínio — é o critério 6 da ordem):
--   select p.proname, pg_get_functiondef(p.oid) like '%''saida'', ''devolucao''%' as so_saida_devolucao
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('rel_resumo','rel_mov_por_mes','rel_por_motivo')
--    order by p.proname;
--   -- esperado: true nas três (logo `ajuste` está fora das três, sem exceção nova)
