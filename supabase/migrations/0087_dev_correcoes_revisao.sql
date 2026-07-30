-- Migration 0087 — F23: duas correções vindas da prova (roteiro `dev_destrutivo.sql`).
--
-- =============================================================================
-- 1) O EMPATE DE `created_at` TORNAVA "a última movimentação" UM SORTEIO
-- =============================================================================
-- ⚠ Este é um DEFEITO REAL da `0082`, achado ao escrever as fixtures do roteiro, e ele
-- atinge em cheio o acervo de produção.
--
-- `movimentacoes.created_at` tem default `now()`, que dentro de UMA transação é o MESMO
-- instante para todas as linhas. O import de startup insere a `compra` de abertura e o
-- `ajuste` de reconciliação na mesma transação — logo os dois nascem com `created_at`
-- idêntico. (É exatamente a causa que a `0054` já tinha diagnosticado para o as-of: lá o
-- empate caía no tiebreak por `id`, um uuid v4 ALEATÓRIO, e resolvia errado em ~metade dos
-- 1.002 ativos afetados.)
--
-- `apagar_movimentacao` decide "é a última?" por `(created_at, id)`. Num par empatado:
--   · se o uuid do AJUSTE for o maior, ele é "a última" → apagá-lo desfaz a reconciliação e
--     o ativo volta ao estado pós-compra. Correto.
--   · se o uuid da COMPRA for o maior, a COMPRA vira "a última" → apagá-la é ACEITO, o ativo
--     é restaurado a partir do snapshot ANTERIOR À PRÓPRIA COMPRA, e o `ajuste` continua na
--     linha do tempo referenciando um nascimento que não existe mais. Incoerente — e o
--     resultado depende de qual uuid saiu maior no sorteio.
--
-- CORREÇÃO — RECUSAR o empate, em vez de escolher um critério de desempate.
-- Poderia-se copiar o desempate da `0054` (`(tipo = 'ajuste') desc`), mas isso seria eleger
-- uma ordem plausível para uma operação IRREVERSÍVEL a partir de dados que genuinamente não
-- dizem qual veio primeiro. Numa ferramenta que apaga, "não sei qual é a última" tem que
-- virar RECUSA, não palpite. O dev que precisar desmontar um ativo importado tem o
-- `apagar_ativo`, que leva o par inteiro e não depende de ordem nenhuma.
--
-- A recusa é ESTREITA de propósito: só dispara quando existe OUTRA movimentação do mesmo
-- ativo com EXATAMENTE o mesmo `created_at` da que se quer apagar. Ativo importado que
-- recebeu movimentação de verdade depois (transação própria, `created_at` posterior) segue
-- perfeitamente apagável na ponta.
--
-- =============================================================================
-- 2) `dev_checagens_integridade()` continuava executável pelo `service_role`
-- =============================================================================
-- A `0085` recriou a função repetindo o `revoke all … from public, anon` que veio da `0077`
-- (F22) e, com isso, deixou o `service_role` com `execute` — enquanto as outras sete RPCs
-- desta fase revogam de `public, anon, service_role`. Não é buraco (a guarda interna
-- `e_dev()` recusa o service role, porque `auth.uid()` é NULL nele), mas contradiz o comment
-- da própria função ("restrita ao cargo Desenvolvedor") e o padrão do resto da fase.
-- Superfície de API de graça é superfície de API: sai.
--
-- ADITIVA: um `create or replace` e um `revoke`. O corpo CONTÉM exclusão de acervo (é a RPC
-- de apagar movimentação) → caminho **B** do RUNBOOK por precaução, embora o precedente
-- (0048/0064/0080) mostre que `create or replace` passa no gate.
--
-- REVERSÃO: reaplicar o corpo de `apagar_movimentacao` da `0082` e
--   `grant execute on function public.dev_checagens_integridade() to service_role;`

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

  -- ⚠ EMPATE DE `created_at` → RECUSA (ver o cabeçalho desta migration). Duas movimentações
  -- gravadas na MESMA transação (o par compra+ajuste do import de startup é o caso de massa)
  -- nascem com o mesmo instante, e aí "a última" sairia de um sorteio de uuid.
  if exists (
    select 1 from public.movimentacoes m
     where m.ativo_id = v_m.ativo_id
       and m.id <> v_m.id
       and m.created_at = v_m.created_at
  ) then
    raise exception 'Este ativo tem movimentações gravadas no mesmo instante (é o caso dos ativos que vieram do import de startup), então não dá para dizer com segurança qual é a última. Para desmontar este ativo, use "Apagar ativo", que leva o rastro inteiro.'
      using errcode = '42501';
  end if;

  -- É a ÚLTIMA do ativo? Ordenação (created_at, id) — a MESMA do guard de estorno de
  -- aplicar_movimentacao, de propósito: é a ordem em que o trigger aplicou os efeitos, é a
  -- que `ativos` reflete (last-insert-wins) e é a que decide o que é estornável hoje.
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

  -- Sem snapshot não há como recompor o estado.
  -- ⚠ Desde a 0081 isto é praticamente código morto para linha NOVA: `aplicar_movimentacao`
  -- grava `snapshot_anterior` incondicionalmente no topo, e a guarda proíbe UPDATE em
  -- `movimentacoes` inclusive para o dono — não existe mais caminho que produza uma
  -- movimentação sem snapshot. Fica pelas linhas anteriores à 0004.
  if v_m.snapshot_anterior is null then
    raise exception 'Esta movimentação não tem o retrato do estado anterior — não é possível recompor o ativo apagando-a. Use "Forçar estado" para acertar o ativo e mantenha o histórico.'
      using errcode = '42501';
  end if;

  -- TERMO que cita esta movimentação → RECUSA.
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

  delete from public.pendencias_item where movimentacao_id = p_mov;
  get diagnostics v_pend = row_count;

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
    'movimentacao_id',   p_mov,
    'ativo_id',          v_m.ativo_id,
    'rotulo',            v_esperado,
    'tipo',              v_m.tipo,
    'status_restaurado', (v_m.snapshot_anterior ->> 'status'),
    'pendencias_item',   v_pend);

exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);
  raise;
end;
$$;

comment on function public.apagar_movimentacao(uuid, text, text) is
  'F23 (/dev): apaga UMA movimentação — só a última do ativo, pela ordenação (created_at, id), a mesma do guard de estorno. RECUSA quando o ativo tem movimentações com `created_at` IDÊNTICO (o par compra+ajuste do import de startup): ali "a última" sairia de um sorteio de uuid, e operação irreversível não se decide por palpite — nesse caso o caminho é apagar_ativo. Recompõe o ativo a partir de snapshot_anterior exatamente como o estorno faz. Recusa também: não é a última; é a única do ativo; sem snapshot_anterior; e movimentação citada por um termo. Exige cargo dev, o patrimônio do ativo digitado e justificativa de 10+ caracteres.';

revoke all on function public.apagar_movimentacao(uuid, text, text) from public, anon, service_role;
grant execute on function public.apagar_movimentacao(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) a superfície de API que a 0085 deixou aberta
-- ---------------------------------------------------------------------------
revoke execute on function public.dev_checagens_integridade() from service_role;

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 1) a recusa de empate está no corpo:
--   select pg_get_functiondef('public.apagar_movimentacao(uuid,text,text)'::regprocedure)
--          like '%m.created_at = v_m.created_at%' as recusa_empate;
--   -- esperado: true
--
--   -- 2) o service_role perdeu o execute da função de checagens:
--   select has_function_privilege('service_role','public.dev_checagens_integridade()','execute') as srv,
--          has_function_privilege('authenticated','public.dev_checagens_integridade()','execute') as auth;
--   -- esperado: srv = false · auth = true
--
--   -- 3) quantos ativos ficam com movimentação NÃO-apagável por empate (informativo):
--   select count(distinct m.ativo_id) as ativos_com_empate
--     from public.movimentacoes m
--    where exists (select 1 from public.movimentacoes o
--                   where o.ativo_id = m.ativo_id and o.id <> m.id and o.created_at = m.created_at);
