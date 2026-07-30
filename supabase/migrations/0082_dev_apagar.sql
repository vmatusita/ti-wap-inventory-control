-- Migration 0082 — F23: a família APAGAR, registro a registro.
--
-- Depende da 0079 (marca), 0080 (import abre a janela) e 0081 (a guarda). Contexto:
-- docs/prompts/F23-dev-destrutivo-ultracode.md §2.
--
-- As três RPCs seguem o molde da 0074 (gestão de usuários): `security definer`, guarda de
-- cargo POR DENTRO, `set search_path`, grants `authenticated`-only, confirmação digitada e
-- justificativa validadas AQUI além de na action, janela da guarda aberta e fechada — também
-- no caminho de erro — e trilha gravada na MESMA transação.
--
-- =============================================================================
-- POR QUE A TRILHA É GRAVADA AQUI DENTRO, E NÃO NA ACTION (muda o padrão da F21/F22)
-- =============================================================================
-- Até aqui, quem escrevia `eventos_admin` era a Server Action, pelo service role
-- (`registrarEventoAdmin`). Para estas três operações isso não serve, por dois motivos
-- medidos:
--   1. `registrarEventoAdmin` NÃO propaga erro de propósito (src/lib/auditoria-registro.ts:37)
--      — ele loga e segue. Faz sentido para "convite gerado"; não faz para uma exclusão
--      irreversível, onde a trilha é o ÚNICO registro de que o dado existiu. Falhar a trilha
--      e mostrar sucesso seria perder a linha E a memória dela.
--   2. A action não é o único caminho. Estas RPCs são chamáveis por qualquer sessão de dev
--      via PostgREST; uma trilha que só a UI escreve não cobre a chamada direta.
-- Gravando aqui, a exclusão e o seu registro são ATÔMICOS: se o INSERT da trilha falhar, a
-- transação inteira volta atrás e nada é apagado. É a propriedade que se quer.
-- A action NÃO duplica o evento (seria linha dobrada na auditoria).
--
-- =============================================================================
-- O BACKUP (§1.4 da ordem): as linhas apagadas vão em jsonb no `detalhe` do evento
-- =============================================================================
-- Escolha registrada em docs/DECISOES.md. `eventos_admin.detalhe` é jsonb, a tabela sobrevive
-- a qualquer reset (§Escopo) e já é exportável pela aba Auditoria da /dev — ou seja, o backup
-- nasce onde já se procura por ele, sem inventar tabela nem bucket novo. CAP de 500
-- movimentações por evento, com a contagem real ao lado: um ativo com mais que isso é
-- patológico, e o que importa auditar (quantas eram, de quem, quando) não depende de ter
-- todas as linhas.
--
-- ADITIVA quanto a estrutura (só cria funções). ⚠ O corpo CONTÉM exclusão de acervo → BATE NO
-- GATE → caminho **B** do docs/RUNBOOK-BANCO.md.
--
-- REVERSÃO: drop function public.apagar_ativo(uuid, text, text),
--   public.apagar_movimentacao(uuid, text, text), public.apagar_item(smallint, text, text),
--   public.exigir_dev_para_destruir(text);

-- ---------------------------------------------------------------------------
-- 0) Guarda comum das ferramentas destrutivas
-- ---------------------------------------------------------------------------
-- Concentra numa função só o que as SETE RPCs desta fase repetiriam (o mesmo motivo de
-- `exigir_gestao_de` na 0074: redigitar é como as camadas divergem). Levanta em vez de
-- devolver boolean — o chamador é sempre "faça ou recuse".
create or replace function public.exigir_dev_para_destruir(p_justificativa text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Operador não autenticado.' using errcode = '42501';
  end if;

  if not public.e_dev() then
    raise exception 'Esta operação é restrita ao cargo Desenvolvedor.' using errcode = '42501';
  end if;

  -- A justificativa é o que sobra depois que o dado morre. Vazia, ela não é justificativa.
  if coalesce(length(btrim(p_justificativa)), 0) < 10 then
    raise exception 'A justificativa é obrigatória e precisa ter pelo menos 10 caracteres.'
      using errcode = '22023';
  end if;
end;
$$;

comment on function public.exigir_dev_para_destruir(text) is
  'F23: guarda comum das ferramentas destrutivas da /dev. Levanta 42501 se não há sessão ou se o autor não é do cargo dev; 22023 se a justificativa tem menos de 10 caracteres. É a TRAVA — a guarda `exigirDev` da Server Action é só a mensagem em pt-BR.';

revoke all on function public.exigir_dev_para_destruir(text) from public, anon, service_role;
grant execute on function public.exigir_dev_para_destruir(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1) apagar_ativo — o ativo e TODO o rastro dele
-- ---------------------------------------------------------------------------
-- O rastro foi levantado do mapa REAL de FKs (medido em 30/07/2026), não da lista da ordem:
--   · pendencias_item.ativo_id      → NO ACTION (bloqueia)  — apagar antes
--   · anotacoes.ativo_id            → NO ACTION (bloqueia)  — apagar antes
--   · movimentacoes.ativo_id        → NO ACTION (bloqueia)  — apagar antes
--   · ativos.substitui_ativo_id     → NO ACTION (bloqueia)  — ANULAR (é ponteiro, não posse:
--     o substituto continua existindo; ele só deixa de apontar para um ativo que não existe
--     mais. Apagá-lo junto seria destruir um ativo que o dev não pediu para destruir.)
--   · termos_gerados                → NÃO TEM FK: referencia por `ativo_ids uuid[]`. Por isso
--     nada no banco impediria deixar um termo apontando para um uuid morto — é este passo que
--     impede.
-- ⚠ `relatorios_gerados` NÃO é reescrito: snapshot é foto congelada, e história não se
-- reescreve. O patrimônio apagado pode seguir citado num relatório antigo — leitura
-- registrada em docs/DECISOES.md.
create or replace function public.apagar_ativo(
  p_ativo         uuid,
  p_confirmacao   text,
  p_justificativa text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a          public.ativos%rowtype;
  v_uid        uuid := (select auth.uid());
  v_esperado   text;
  v_movs       int := 0;
  v_anot       int := 0;
  v_pend       int := 0;
  v_termos     int := 0;
  v_subst      int := 0;
  v_arquivos   text[] := '{}'::text[];
  v_backup     jsonb;
  v_rotulo     text;
begin
  perform public.exigir_dev_para_destruir(p_justificativa);

  select * into v_a from public.ativos where id = p_ativo;
  if v_a.id is null then
    raise exception 'Ativo não encontrado.' using errcode = 'P0002';
  end if;

  -- CONFIRMAÇÃO DIGITADA. Patrimônio quando existe; service tag quando o ativo não tem
  -- patrimônio (regra da casa: o PAR patrimônio+service tag é a chave, spec §5); e o id
  -- quando não tem nenhum dos dois — que é raro, mas representável.
  v_esperado := coalesce(nullif(btrim(v_a.patrimonio), ''),
                         nullif(btrim(v_a.service_tag), ''),
                         v_a.id::text);
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" para apagar este ativo.', v_esperado
      using errcode = '22023';
  end if;

  -- TERMO DE LOTE que também cobre OUTRO ativo → RECUSA.
  -- Precedente literal: o passo 2 de `importar_ativos_substituir` recusa a substituição
  -- quando um termo mistura a filial alvo com outra. Um termo é documento assinado; destruí-lo
  -- como efeito colateral de apagar UM dos ativos que ele cobre seria destruir prova de
  -- terceiros. Recusa com caminho de saída, como manda o §2.2 da ordem.
  if exists (
    select 1 from public.termos_gerados t
     where p_ativo = any (t.ativo_ids)
       and exists (select 1 from unnest(t.ativo_ids) x(id) where x.id <> p_ativo)
  ) then
    raise exception 'Este ativo está num termo que também cobre outros ativos: apagá-lo destruiria um documento que não é só dele. Apague o termo primeiro, ou apague antes os outros ativos do mesmo termo.'
      using errcode = '42501';
  end if;

  v_rotulo := coalesce(nullif(btrim(v_a.patrimonio), ''), nullif(btrim(v_a.service_tag), ''), v_a.id::text);

  -- BACKUP antes da perda (§1.4). Montado ANTES de qualquer DELETE, obviamente.
  select jsonb_build_object(
           'ativo', to_jsonb(v_a),
           'movimentacoes', coalesce((
             select jsonb_agg(to_jsonb(m))
               from (select * from public.movimentacoes
                      where ativo_id = p_ativo
                      order by created_at, id
                      limit 500) m), '[]'::jsonb),
           'termos', coalesce((
             select jsonb_agg(to_jsonb(t)) from public.termos_gerados t
              where p_ativo = any (t.ativo_ids)), '[]'::jsonb),
           'anotacoes', coalesce((
             select jsonb_agg(to_jsonb(an)) from public.anotacoes an
              where an.ativo_id = p_ativo), '[]'::jsonb),
           'pendencias_item', coalesce((
             select jsonb_agg(to_jsonb(pi)) from public.pendencias_item pi
              where pi.ativo_id = p_ativo), '[]'::jsonb)
         )
    into v_backup;

  -- ---------- a janela abre ----------
  perform set_config('estoque.dev_destrutivo', 'on', true);

  delete from public.pendencias_item where ativo_id = p_ativo;
  get diagnostics v_pend = row_count;

  with del as (
    delete from public.termos_gerados t
     where p_ativo = any (t.ativo_ids)
    returning t.arquivo_path
  )
  select coalesce(array_agg(arquivo_path), '{}'::text[]), count(*)::int
    into v_arquivos, v_termos
    from del;

  delete from public.anotacoes where ativo_id = p_ativo;
  get diagnostics v_anot = row_count;

  delete from public.movimentacoes where ativo_id = p_ativo;
  get diagnostics v_movs = row_count;

  -- O ponteiro do substituto (F14/F15) é anulado, não seguido.
  update public.ativos set substitui_ativo_id = null where substitui_ativo_id = p_ativo;
  get diagnostics v_subst = row_count;

  delete from public.ativos where id = p_ativo;

  perform set_config('estoque.dev_destrutivo', 'off', true);
  -- ---------- a janela fecha ----------

  -- TRILHA na mesma transação (ver cabeçalho): sem ela, nada é apagado.
  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values (v_uid, 'ativo_apagado', v_rotulo,
          jsonb_build_object(
            'justificativa',        btrim(p_justificativa),
            'ativo_id',             p_ativo,
            'filial_id',            v_a.filial_id,
            'movimentacoes',        v_movs,
            'anotacoes',            v_anot,
            'pendencias_item',      v_pend,
            'termos',               v_termos,
            'ponteiros_anulados',   v_subst,
            'arquivos_termos',      to_jsonb(v_arquivos),
            'backup_truncado',      (v_movs > 500),
            'backup',               v_backup));

  return jsonb_build_object(
    'ativo_id',           p_ativo,
    'rotulo',             v_rotulo,
    'movimentacoes',      v_movs,
    'anotacoes',          v_anot,
    'pendencias_item',    v_pend,
    'termos',             v_termos,
    'ponteiros_anulados', v_subst,
    'arquivos_termos',    to_jsonb(v_arquivos));

exception when others then
  -- A janela fecha TAMBÉM quando estoura no meio (§V da ordem). O rollback ao savepoint do
  -- bloco já reverteria o GUC; o fecho explícito documenta a intenção e não depende disso.
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

comment on function public.apagar_ativo(uuid, text, text) is
  'F23 (/dev): apaga um ativo e TODO o rastro dele — pendências de item, termos (linhas; os .docx a action remove pela API, porque storage.protect_objects_delete recusa DELETE por SQL), anotações e movimentações —, anula os ponteiros substitui_ativo_id que apontavam para ele e libera o par patrimônio+service tag. Exige cargo dev, confirmação digitada (patrimônio, ou service tag, ou id) e justificativa de 10+ caracteres. RECUSA quando o ativo está num termo de lote que também cobre outros ativos. Grava o backup das linhas e a trilha em eventos_admin na MESMA transação. Snapshots de relatorios_gerados NÃO são reescritos: foto congelada é história.';

revoke all on function public.apagar_ativo(uuid, text, text) from public, anon, service_role;
grant execute on function public.apagar_ativo(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) apagar_movimentacao — a avulsa
-- ---------------------------------------------------------------------------
-- ⚠ DESENHO ESCOLHIDO: **SÓ-A-ÚLTIMA** (a primeira das duas opções do §2.2 da ordem).
-- Decisão registrada em docs/DECISOES.md. O motivo é medível e não é preferência de estilo:
--
--   · `snapshot_anterior` ENCADEIA. Cada movimentação guarda o estado que encontrou. Apagar
--     uma do MEIO faz TODA snapshot posterior descrever um passado que não existe mais — e é
--     de `snapshot_anterior` que o ESTORNO restaura (aplicar_movimentacao, ramo 'estorno').
--     O desenho "qualquer-uma com replay" teria de reescrever as snapshots seguintes, isto é,
--     REESCREVER HISTÓRICO para poder apagar um registro. Numa fase cujo lema é "a
--     movimentação é a fonte da verdade", é a troca errada.
--   · Só-a-última tem uma invariante forte e testável: depois de apagar, o ativo fica
--     EXATAMENTE no estado em que um ESTORNO daquela mesma movimentação o deixaria — porque a
--     restauração usa a mesma fonte (`snapshot_anterior`) e o mesmo caminho. A diferença é só
--     que não sobra o par estorno na linha do tempo. É o que o roteiro assere.
--
-- ⚠ QUAL "ÚLTIMA"? Medido: existem TRÊS ordenações vivas e não equivalentes —
--   (created_at, id)                          no guard de estorno de aplicar_movimentacao
--   (data, created_at, ajuste-vence, id)      em rel_estoque_asof (0054)
--   (created_at, data)                        no topo da ficha
-- Elas só concordam enquanto `created_at` é monotônico E concorda com `data`; o import de
-- startup quebra isso em produção. Esta RPC usa **(created_at, id)** — a MESMA do guard de
-- estorno — de propósito: é essa a ordem em que o trigger aplicou os efeitos, é ela que
-- `ativos` reflete (last-insert-wins), e é ela que decide o que é estornável hoje. Usar a do
-- as-of faria "apagável" e "estornável" divergirem, que é como se produz incoerência.
create or replace function public.apagar_movimentacao(
  p_mov           uuid,
  p_confirmacao   text,
  p_justificativa text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m        public.movimentacoes%rowtype;
  v_a        public.ativos%rowtype;
  v_uid      uuid := (select auth.uid());
  v_esperado text;
  v_total    int;
  v_pend     int := 0;
  v_backup   jsonb;
begin
  perform public.exigir_dev_para_destruir(p_justificativa);

  select * into v_m from public.movimentacoes where id = p_mov;
  if v_m.id is null then
    raise exception 'Movimentação não encontrada.' using errcode = 'P0002';
  end if;

  select * into v_a from public.ativos where id = v_m.ativo_id for update;
  if v_a.id is null then
    raise exception 'O ativo desta movimentação não existe mais.' using errcode = 'P0002';
  end if;

  v_esperado := coalesce(nullif(btrim(v_a.patrimonio), ''),
                         nullif(btrim(v_a.service_tag), ''),
                         v_a.id::text);
  if upper(btrim(coalesce(p_confirmacao, ''))) <> upper(v_esperado) then
    raise exception 'A confirmação não confere: digite exatamente "%" (o ativo desta movimentação) para apagá-la.', v_esperado
      using errcode = '22023';
  end if;

  -- É a ÚLTIMA do ativo? (mesma ordenação do guard de estorno)
  if exists (
    select 1 from public.movimentacoes m
     where m.ativo_id = v_m.ativo_id
       and (m.created_at, m.id) > (v_m.created_at, v_m.id)
  ) then
    raise exception 'Só a última movimentação do ativo pode ser apagada — esta tem outras depois dela. Apague as posteriores primeiro (da mais nova para a mais antiga).'
      using errcode = '42501';
  end if;

  -- É a ÚNICA? Então o que se quer é apagar o ativo.
  select count(*) into v_total from public.movimentacoes where ativo_id = v_m.ativo_id;
  if v_total <= 1 then
    raise exception 'Esta é a única movimentação do ativo — apagá-la deixaria um ativo sem nascimento. Use "Apagar ativo", que leva o ativo e o rastro inteiro.'
      using errcode = '42501';
  end if;

  -- Sem snapshot não há como recompor o estado (linha pré-0004 ou corrompida).
  if v_m.snapshot_anterior is null then
    raise exception 'Esta movimentação não tem o retrato do estado anterior — não é possível recompor o ativo apagando-a. Use "Forçar estado" para acertar o ativo e mantenha o histórico.'
      using errcode = '42501';
  end if;

  -- TERMO que cita esta movimentação → RECUSA (mesma doutrina do apagar_ativo: documento
  -- assinado não morre como efeito colateral; e `termo_ancora_coerente` (0069) exige que
  -- `ativo_ids` derive das movimentações citadas — deixar a citação apontando para um uuid
  -- morto quebraria o invariante na próxima regravação do termo).
  if exists (select 1 from public.termos_gerados t where p_mov = any (t.movimentacao_ids)) then
    raise exception 'Existe um termo gerado a partir desta movimentação. Apague o termo antes, ou apague o ativo inteiro.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
           'movimentacao', to_jsonb(v_m),
           'ativo_antes',  to_jsonb(v_a),
           'pendencias_item', coalesce((
             select jsonb_agg(to_jsonb(pi)) from public.pendencias_item pi
              where pi.movimentacao_id = p_mov), '[]'::jsonb))
    into v_backup;

  -- ---------- a janela abre ----------
  perform set_config('estoque.dev_destrutivo', 'on', true);

  -- Pendências de item nascidas desta movimentação (F18) — o mesmo "estorno-strip" que
  -- aplicar_movimentacao faz no ramo do estorno.
  delete from public.pendencias_item where movimentacao_id = p_mov;
  get diagnostics v_pend = row_count;

  -- RESTAURA o ativo do snapshot — cópia fiel do que o ramo 'estorno' de
  -- aplicar_movimentacao faz, inclusive a limpeza de "itens faltantes" da pendência textual.
  -- Manter idêntico é o que garante "apagar a última ≡ estornar a última, sem o par".
  update public.ativos set
    status            = (v_m.snapshot_anterior ->> 'status')::public.status_ativo,
    colaborador_atual = v_m.snapshot_anterior ->> 'colaborador',
    setor_atual       = v_m.snapshot_anterior ->> 'setor',
    filial_id         = (v_m.snapshot_anterior ->> 'filial_id')::smallint,
    pendencia         = case when v_m.snapshot_anterior ? 'pendencia'
                             then nullif(
                               (select string_agg(trim(x.val), '; ' order by x.ord)
                                from unnest(string_to_array(v_m.snapshot_anterior ->> 'pendencia', ';'))
                                     with ordinality as x(val, ord)
                                where nullif(trim(x.val), '') is not null
                                  and lower(trim(x.val)) not like 'itens faltantes%'), '')
                             else pendencia end,
    termo_assinado    = case when v_m.snapshot_anterior ? 'termo_assinado'
                             then (v_m.snapshot_anterior ->> 'termo_assinado')::public.termo_status
                             else termo_assinado end,
    termo_data        = case when v_m.snapshot_anterior ? 'termo_data'
                             then (v_m.snapshot_anterior ->> 'termo_data')::date
                             else termo_data end,
    updated_at        = now()
  where id = v_m.ativo_id;

  delete from public.movimentacoes where id = p_mov;

  perform set_config('estoque.dev_destrutivo', 'off', true);
  -- ---------- a janela fecha ----------

  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values (v_uid, 'movimentacao_apagada', v_esperado,
          jsonb_build_object(
            'justificativa',   btrim(p_justificativa),
            'movimentacao_id', p_mov,
            'ativo_id',        v_m.ativo_id,
            'tipo',            v_m.tipo,
            'data',            v_m.data,
            'status_antes',    v_m.status_anterior,
            'status_depois',   v_m.status_resultante,
            'pendencias_item', v_pend,
            'backup',          v_backup));

  return jsonb_build_object(
    'movimentacao_id',  p_mov,
    'ativo_id',         v_m.ativo_id,
    'rotulo',           v_esperado,
    'tipo',             v_m.tipo,
    'status_restaurado', (v_m.snapshot_anterior ->> 'status'),
    'pendencias_item',  v_pend);

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

comment on function public.apagar_movimentacao(uuid, text, text) is
  'F23 (/dev): apaga UMA movimentação — só a última do ativo, pela ordenação (created_at, id), que é a mesma do guard de estorno. Recompõe o ativo a partir de snapshot_anterior exatamente como o estorno faz, de modo que apagar a última equivale a estorná-la sem deixar o par na linha do tempo. Apaga junto as pendências de item nascidas dela. RECUSA: movimentação que não é a última; a única do ativo (use apagar_ativo); sem snapshot_anterior; e movimentação citada por um termo gerado. Exige cargo dev, o patrimônio do ativo digitado e justificativa de 10+ caracteres.';

revoke all on function public.apagar_movimentacao(uuid, text, text) from public, anon, service_role;
grant execute on function public.apagar_movimentacao(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) apagar_item — o item do catálogo, com lançamentos e saldos
-- ---------------------------------------------------------------------------
-- O que o admin JÁ tem (`excluirItem`, src/lib/actions/itens.ts) recusa quando existe
-- qualquer lançamento — e oferece desativar. Esta é exatamente a versão que NÃO recusa: é a
-- diferença entre o cargo admin e o cargo dev nesta tabela.
--
-- ⚠ O SALDO É 100% DERIVADO (`rel_saldo_itens` soma `lancamentos_item` na hora; não existe
-- coluna de saldo em lugar nenhum). Apagar os lançamentos APAGA o saldo por construção — não
-- há nada a "zerar" depois, e é por isso que não existe passo de saldo aqui.
-- ⚠ `pendencias_item.item` é TEXTO LIVRE, não FK para `itens` (medido) — uma pendência de
-- item sobrevive ao sumiço do item do catálogo, e deve mesmo: ela registra o que faltou na
-- devolução de um ativo, não uma linha de catálogo.
-- ⚠ KITS NÃO CITAM ITENS. A ordem §2.3 supõe que `kits_modelos.payload` referencie itens do
-- catálogo; medido, o payload traz `categoria_ativo[]` — categorias de ativo, não itens. Não
-- há nada a limpar, avisar ou deixar. Registrado em docs/DECISOES.md.
create or replace function public.apagar_item(
  p_item          smallint,
  p_confirmacao   text,
  p_justificativa text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_i      public.itens%rowtype;
  v_uid    uuid := (select auth.uid());
  v_lanc   int := 0;
  v_backup jsonb;
begin
  perform public.exigir_dev_para_destruir(p_justificativa);

  select * into v_i from public.itens where id = p_item;
  if v_i.id is null then
    raise exception 'Item não encontrado.' using errcode = 'P0002';
  end if;

  -- Confirmação = o NOME do item (§1.3 da ordem). Comparação sem diferenciar maiúsculas,
  -- como o índice único do próprio catálogo (`itens_nome_uidx`, lower(nome)).
  if lower(btrim(coalesce(p_confirmacao, ''))) <> lower(btrim(v_i.nome)) then
    raise exception 'A confirmação não confere: digite exatamente "%" para apagar este item.', v_i.nome
      using errcode = '22023';
  end if;

  select jsonb_build_object(
           'item', to_jsonb(v_i),
           'lancamentos', coalesce((
             select jsonb_agg(to_jsonb(l))
               from (select * from public.lancamentos_item
                      where item_id = p_item
                      order by created_at, id
                      limit 500) l), '[]'::jsonb))
    into v_backup;

  select count(*)::int into v_lanc from public.lancamentos_item where item_id = p_item;

  -- ---------- a janela abre ----------
  perform set_config('estoque.dev_destrutivo', 'on', true);

  -- Todos os lançamentos do item somem de uma vez — inclusive os que estornam uns aos outros
  -- (`lancamentos_item.estorna_id` é auto-referência): como o conjunto inteiro sai no mesmo
  -- statement, a FK não tem para onde apontar quebrado.
  delete from public.lancamentos_item where item_id = p_item;

  delete from public.itens where id = p_item;

  perform set_config('estoque.dev_destrutivo', 'off', true);
  -- ---------- a janela fecha ----------

  insert into public.eventos_admin (autor, acao, alvo, detalhe)
  values (v_uid, 'item_apagado', v_i.nome,
          jsonb_build_object(
            'justificativa',   btrim(p_justificativa),
            'item_id',         p_item,
            'grupo',           v_i.grupo,
            'lancamentos',     v_lanc,
            'backup_truncado', (v_lanc > 500),
            'backup',          v_backup));

  return jsonb_build_object(
    'item_id',     p_item,
    'nome',        v_i.nome,
    'lancamentos', v_lanc);

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

comment on function public.apagar_item(smallint, text, text) is
  'F23 (/dev): apaga um item do catálogo COM todos os lançamentos dele — a versão que o cargo admin não tem (excluirItem recusa quando há lançamento). O saldo some por construção: ele é derivado da soma dos lançamentos, não materializado. Não toca pendencias_item (o campo `item` de lá é texto livre, não FK) nem kits (o payload deles traz categorias de ativo, não itens). Exige cargo dev, o nome do item digitado e justificativa de 10+ caracteres.';

revoke all on function public.apagar_item(smallint, text, text) from public, anon, service_role;
grant execute on function public.apagar_item(smallint, text, text) to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) as quatro funções, definer, com execute só para authenticated:
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as definer,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth,
--          has_function_privilege('service_role', p.oid, 'execute')  as srv
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public'
--      and p.proname in ('exigir_dev_para_destruir','apagar_ativo','apagar_movimentacao','apagar_item')
--    order by p.proname;
--   -- esperado: 4 linhas · definer=true · anon=false · auth=true · srv=false
--
--   -- 2) toda RPC que ABRE a janela também a FECHA (contagem por corpo):
--   select p.proname,
--          (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), '''on''', ''))) / 4  as abre,
--          (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), '''off''', ''))) / 5 as fecha
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and p.proname in ('apagar_ativo','apagar_movimentacao','apagar_item')
--    order by p.proname;
--   -- esperado: fecha = abre + 1 nas TRÊS (o +1 é o fecho do bloco `exception`)
--
--   -- 3) rodando como service role (auth.uid() é NULL → e_dev() false), TODAS recusam:
--   --    select public.apagar_item(1::smallint, 'x', 'justificativa de teste');
--   --    esperado: ERRO 42501 'Esta operação é restrita ao cargo Desenvolvedor.'
--
--   -- 4) a prova de comportamento, com papel simulado e nos cenários de recusa, está em
--   --    supabase/tests/dev_destrutivo.sql — rode-o no ensaio.
