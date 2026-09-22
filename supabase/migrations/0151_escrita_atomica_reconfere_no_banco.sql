-- =============================================================================
-- 0151 — as escritas atômicas da 0149 passam a reconferir a PRÉ-CONDIÇÃO no banco
-- (revisão de código de 22/09/2026, v1.66.7 — ata em docs/DECISOES.md)
-- =============================================================================
--
-- O PROBLEMA — dois achados da revisão sobre a 0149, os dois de CORRIDA (duas abas, dois
-- cliques, duas pessoas no mesmo instante):
--
--   1. O LOTE contava os pendentes (`v_esperados`) num SELECT e só DEPOIS fazia o UPDATE.
--      Em READ COMMITTED cada comando de uma função plpgsql tira o seu próprio snapshot: se
--      outra sessão confirmasse um dos termos entre os dois comandos, o UPDATE (que espera a
--      trava da linha e reavalia o WHERE) pulava a linha, `v_confirmados` ficava menor que
--      `v_esperados`, e a função recusava o LOTE INTEIRO dizendo que um termo estava fora do
--      vínculo de filial — falso, e sem nada confirmado.
--   2. As três escritas SINGULARES com pré-condição — definir a service tag ("só define quando
--      vazia"), confirmar a assinatura ("ainda não é sim") e desfazer a confirmação ("é sim") —
--      gravavam SEMPRE: a pré-condição morava só na leitura prévia da action. Dois cliques
--      simultâneos passavam os dois pela leitura, o segundo sobrescrevia o primeiro, e a ficha
--      ganhava DUAS anotações imutáveis, uma delas falsa ("Service tag definida: X" de uma tag
--      que nunca ficou). A corrida é anterior à 0149 (o par update + insert já a tinha); a RPC
--      é o lugar de fechá-la, porque o UPDATE trava a linha e reavalia o WHERE.
--
-- O CONSERTO
--
--   · LOTE: a contagem prévia sai. Depois do UPDATE+INSERT (o MESMO comando de duas CTEs de
--     sempre), a função pergunta quem, dos ids pedidos, CONTINUA pendente. Quem outra sessão
--     confirmou nesse meio-tempo já é 'sim' e não conta — idempotente, como sempre foi. Quem
--     continua pendente só pode ter sido barrado pela RLS de UPDATE (vínculo de filial), e aí o
--     lote inteiro recusa, com a MESMA mensagem e o MESMO errcode (42501) de antes.
--   · SINGULARES: a pré-condição entra no WHERE do UPDATE, com a MESMA régua da action
--     (`definirServiceTag` trata service tag só-espaço como vazia, então aqui também:
--     coalesce + btrim). Quando o UPDATE não alcança linha nenhuma, a função distingue as duas
--     causas, nesta ordem: (a) ativo inexistente, ou fora do vínculo de escrita de quem chama
--     (`pode_escrever_filial`, a MESMA função da policy de UPDATE) → a recusa P0002 de sempre,
--     com a mesma frase; (b) senão, a pré-condição já não vale → recusa P0001 com frase NOVA,
--     que o app traduz ("outra pessoa acabou de fazer isso").
--
-- O QUE NÃO MUDA
--
--   · As quatro assinaturas, o `security invoker`, o `set search_path = ''`, os grants (o
--     `create or replace` os preserva; os `revoke`/`grant` abaixo só os reafirmam, iguais aos da
--     0149), `criado_por` vindo de `auth.uid()`, a sentinela de `p_pendencia` e o
--     `p_alterar_pendencia`.
--   · `corrigir_patrimonio_com_anotacao` NÃO é recriada: corrigir o patrimônio não tem
--     pré-condição de estado (a action o permite sempre), e o 23505 do índice por filial já
--     serializa as duas tentativas concorrentes do mesmo par.
--   · Nenhum dado é tocado: é recriação de função. Caminho A do docs/RUNBOOK-BANCO.md.
--
-- ROLLBACK, em prosa (pseudo-SQL de função em comentário vira definição para
-- scripts/db/corpo-vigente.mjs): reemitir, por migration NOVA com `npm run db:lock`, as quatro
-- funções com o corpo da 0149 (o arquivo inteiro está no git). O app continua funcionando com
-- o corpo antigo: as frases novas só deixam de aparecer.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) definir_service_tag_com_anotacao — só define quando a service tag está VAZIA
-- ---------------------------------------------------------------------------
create or replace function public.definir_service_tag_com_anotacao(
  p_ativo_id uuid,
  p_service_tag text,
  p_pendencia text,
  p_alterar_pendencia boolean,
  p_texto_anotacao text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n int;
  v_filial smallint;
begin
  update public.ativos
     set service_tag = p_service_tag,
         pendencia   = case when p_alterar_pendencia then nullif(p_pendencia, '') else pendencia end
   where id = p_ativo_id
     and coalesce(btrim(service_tag), '') = '';

  get diagnostics v_n = row_count;
  if v_n = 0 then
    select a.filial_id into v_filial from public.ativos a where a.id = p_ativo_id;
    if not found or not public.pode_escrever_filial(v_filial) then
      raise exception 'Ativo não encontrado, ou fora do seu vínculo de escrita — nada foi definido.'
        using errcode = 'P0002';
    end if;
    raise exception 'A service tag deste ativo acabou de ser definida — nada foi gravado.'
      using errcode = 'P0001';
  end if;

  insert into public.anotacoes (ativo_id, texto, criado_por)
  values (p_ativo_id, p_texto_anotacao, auth.uid());
end;
$$;

comment on function public.definir_service_tag_com_anotacao(uuid, text, text, boolean, text) is
  'Reauditoria 18/09/2026 (item U, 0149) + revisão de código 22/09/2026 (0151): grava a service tag (e a pendência, só quando p_alterar_pendencia) e a anotação de definição na MESMA transação, e SÓ quando a service tag ainda está vazia (null ou só espaço, a régua da action) — a pré-condição mora no WHERE do UPDATE, que trava a linha e a reavalia. 0 linhas: P0002 se o ativo não existe ou está fora do vínculo de escrita de quem chama; P0001 "acabou de ser definida" se outra escrita a preencheu antes.';

revoke all on function public.definir_service_tag_com_anotacao(uuid, text, text, boolean, text) from public, anon, service_role;
grant execute on function public.definir_service_tag_com_anotacao(uuid, text, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) confirmar_assinatura_termo_com_anotacao — só confirma o que ainda NÃO é 'sim'
-- ---------------------------------------------------------------------------
create or replace function public.confirmar_assinatura_termo_com_anotacao(
  p_ativo_id uuid,
  p_data date,
  p_texto_anotacao text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n int;
  v_filial smallint;
begin
  update public.ativos
     set termo_assinado = 'sim',
         termo_data = p_data
   where id = p_ativo_id
     and termo_assinado is distinct from 'sim';

  get diagnostics v_n = row_count;
  if v_n = 0 then
    select a.filial_id into v_filial from public.ativos a where a.id = p_ativo_id;
    if not found or not public.pode_escrever_filial(v_filial) then
      raise exception 'Ativo não encontrado, ou fora do seu vínculo de escrita — nada foi confirmado.'
        using errcode = 'P0002';
    end if;
    raise exception 'Este termo acabou de ser confirmado como assinado — nada foi gravado de novo.'
      using errcode = 'P0001';
  end if;

  insert into public.anotacoes (ativo_id, texto, criado_por)
  values (p_ativo_id, p_texto_anotacao, auth.uid());
end;
$$;

comment on function public.confirmar_assinatura_termo_com_anotacao(uuid, date, text) is
  'Reauditoria 18/09/2026 (item U, 0149) + revisão de código 22/09/2026 (0151): grava termo_assinado = sim + termo_data e o rastro imutável na anotacoes, na MESMA transação, e SÓ quando o termo ainda não é sim — a pré-condição mora no WHERE do UPDATE. 0 linhas: P0002 se o ativo não existe ou está fora do vínculo de escrita; P0001 "acabou de ser confirmado" se outra escrita confirmou antes (sem 2ª anotação).';

revoke all on function public.confirmar_assinatura_termo_com_anotacao(uuid, date, text) from public, anon, service_role;
grant execute on function public.confirmar_assinatura_termo_com_anotacao(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) desfazer_confirmacao_termo_com_anotacao — só desfaz o que AINDA é 'sim'
-- ---------------------------------------------------------------------------
create or replace function public.desfazer_confirmacao_termo_com_anotacao(
  p_ativo_id uuid,
  p_destino public.termo_status,
  p_texto_anotacao text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n int;
  v_filial smallint;
begin
  update public.ativos
     set termo_assinado = p_destino,
         termo_data = null
   where id = p_ativo_id
     and termo_assinado = 'sim';

  get diagnostics v_n = row_count;
  if v_n = 0 then
    select a.filial_id into v_filial from public.ativos a where a.id = p_ativo_id;
    if not found or not public.pode_escrever_filial(v_filial) then
      raise exception 'Ativo não encontrado, ou fora do seu vínculo de escrita — nada foi desfeito.'
        using errcode = 'P0002';
    end if;
    raise exception 'A confirmação deste termo acabou de ser desfeita — nada foi gravado de novo.'
      using errcode = 'P0001';
  end if;

  insert into public.anotacoes (ativo_id, texto, criado_por)
  values (p_ativo_id, p_texto_anotacao, auth.uid());
end;
$$;

comment on function public.desfazer_confirmacao_termo_com_anotacao(uuid, public.termo_status, text) is
  'Reauditoria 18/09/2026 (item U, 0149) + revisão de código 22/09/2026 (0151): desfaz a confirmação (termo_assinado para o destino que a action calculou, gerado ou nao, sempre limpando termo_data) e grava a anotação, na MESMA transação, e SÓ quando o termo ainda é sim — a pré-condição mora no WHERE do UPDATE. 0 linhas: P0002 se o ativo não existe ou está fora do vínculo de escrita; P0001 "acabou de ser desfeita" se outra escrita desfez antes.';

revoke all on function public.desfazer_confirmacao_termo_com_anotacao(uuid, public.termo_status, text) from public, anon, service_role;
grant execute on function public.desfazer_confirmacao_termo_com_anotacao(uuid, public.termo_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) confirmar_assinatura_lote_com_anotacoes — quem CONTINUA pendente depois do UPDATE
-- ---------------------------------------------------------------------------
create or replace function public.confirmar_assinatura_lote_com_anotacoes(
  p_ativo_ids uuid[],
  p_data date,
  p_texto_anotacao text
)
returns table (ativo_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with atualizado as (
    update public.ativos a
       set termo_assinado = 'sim',
           termo_data = p_data
     where a.id = any (p_ativo_ids)
       and a.termo_assinado is distinct from 'sim'
    returning a.id
  ),
  anotado as (
    -- `returning ativo_id` sozinho é AMBÍGUO aqui: `returns table (ativo_id uuid)` declara
    -- `ativo_id` como variável de saída da função, e o RETURNING bruto colidiria com ela
    -- (42702). O alias `anot` desambigua para a COLUNA.
    insert into public.anotacoes as anot (ativo_id, texto, criado_por)
    select id, p_texto_anotacao, auth.uid() from atualizado
    returning anot.ativo_id
  )
  select anotado.ativo_id from anotado;

  -- Comando SEGUINTE, snapshot novo: ele enxerga o que o UPDATE acima gravou E o que outra
  -- sessão confirmou no meio-tempo. Quem ainda não é 'sim' foi barrado pela RLS de UPDATE.
  if exists (
    select 1
      from public.ativos a
     where a.id = any (p_ativo_ids)
       and a.termo_assinado is distinct from 'sim'
  ) then
    raise exception 'Não foi possível confirmar o lote inteiro — um ou mais termos estão fora do seu vínculo de filial. Nada foi confirmado.'
      using errcode = '42501';
  end if;
end;
$$;

comment on function public.confirmar_assinatura_lote_com_anotacoes(uuid[], date, text) is
  'Reauditoria 18/09/2026 (item U, 0149) + revisão de código 22/09/2026 (0151): confirma 1..N termos e grava UMA anotação por ativo confirmado, no MESMO comando SQL (duas CTEs). Idempotente por linha (id já sim é ignorado, inclusive o que outra sessão confirmou no mesmo instante); tudo-ou-nada quanto a VÍNCULO DE FILIAL — depois do UPDATE, se algum id pedido CONTINUA pendente (a RLS o barrou), recusa o lote inteiro (42501). Desde a 0151 não há contagem prévia: a concorrência já não é confundida com falta de vínculo.';

revoke all on function public.confirmar_assinatura_lote_com_anotacoes(uuid[], date, text) from public, anon, service_role;
grant execute on function public.confirmar_assinatura_lote_com_anotacoes(uuid[], date, text) to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY (cada banco — ensaio primeiro; só leitura) ----------
--
--   -- 1) as quatro seguem com UMA assinatura cada, INVOKER, search_path vazio, e os mesmos
--   --    grants (anon=false, authenticated=true, service_role=false):
--   select p.oid::regprocedure::text, p.prosecdef, p.proconfig,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth,
--          has_function_privilege('service_role', p.oid, 'execute')  as svc
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('definir_service_tag_com_anotacao',
--                         'confirmar_assinatura_termo_com_anotacao',
--                         'desfazer_confirmacao_termo_com_anotacao',
--                         'confirmar_assinatura_lote_com_anotacoes')
--    order by 1;
--   -- esperado: 4 linhas · prosecdef=false · {search_path=""} · false/true/false
--
--   -- 2) o corpo vivo é o do arquivo: md5 do `prosrc` de cada uma contra o md5 do trecho entre
--   --    os dois cifrões deste arquivo (LF).
--
--   -- 3) recarregar o cache do PostgREST:
--   notify pgrst, 'reload schema';
-- =============================================================================
