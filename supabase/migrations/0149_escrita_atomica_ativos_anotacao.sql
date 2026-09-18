-- =============================================================================
-- 0149 — item U da reauditoria (18/09/2026, passo 2, Frente U): cinco escritas que
-- eram UPDATE em `ativos` + INSERT em `anotacoes` em DUAS idas ao banco viram uma
-- RPC cada, `security invoker`, a transação inteira ou nada.
-- =============================================================================
--
-- O PROBLEMA (docs/DIVIDA-TECNICA.md, item U): `corrigirPatrimonio`, `definirServiceTag`,
-- `confirmarAssinaturaTermo`, `desfazerConfirmacaoTermo` e `confirmarAssinaturaLote`
-- (src/lib/actions/ativos.ts e termos.ts) faziam `.update()` seguido de `.insert()` em
-- `anotacoes` como DUAS chamadas PostgREST — duas transações separadas sob autocommit. Se o
-- INSERT falhasse depois do UPDATE já commitado (rede caiu, o processo morreu no meio), o
-- ativo ficava corrigido/confirmado SEM rastro nenhum na linha do tempo.
--
-- ⚠ DECISÃO JÁ TOMADA (e por quê ela NÃO é "inverter a ordem"): a reauditoria cogitou anotar
-- ANTES de escrever (o paliativo de meio dia). Errado, de propósito descartado: `anotacoes` é
-- IMUTÁVEL (0017, sem policy de update/delete) e o UPDATE em `ativos` pode falhar de forma
-- PREVISÍVEL — o par patrimônio+service tag é único por filial (`ativos_patrimonio_service_tag_uidx`,
-- 0091) —, não só por acidente de rede. Anotar antes deixaria, PARA SEMPRE, uma "patrimônio
-- corrigido de X para Y" na ficha de um ativo cujo patrimônio nunca mudou. A correção certa é
-- ATOMICIDADE: as duas escritas na MESMA transação, e é isso que as cinco RPCs abaixo fazem.
--
-- O DESENHO, IGUAL NAS CINCO
--   · `security invoker` — a RLS de `ativos` (`pode_escrever_filial`, 0063) e de `anotacoes`
--     (papel admin/operador, 0063) valem EXATAMENTE como valem hoje pela chamada direta: a RPC
--     não abre nem fecha superfície nenhuma, só junta duas idas em uma. INVOKER também não
--     acrescenta achado ao advisor de `security definer` (o app já usa o client de SESSÃO para
--     as duas escritas hoje).
--   · `set search_path = ''` — toda referência é schema-qualificada (`public.ativos`,
--     `public.anotacoes`, `public.termo_status`, `auth.uid()`).
--   · UMA RPC POR OPERAÇÃO, com as COLUNAS EXATAS que cada action grava hoje — PROIBIDO (regra
--     da ordem) função genérica que receba nome de coluna/tabela.
--   · `criado_por` vem de `auth.uid()` DENTRO da função, NUNCA de parâmetro — a policy de
--     INSERT de `anotacoes` já é por CARGO (`papel_atual() in ('admin','operador')`, 0063), não
--     por autor, e a coluna não tem default (0017): se a função aceitasse `p_criado_por` um
--     chamador poderia gravar autoria alheia. `auth.uid()` sob INVOKER é o mesmo uid que
--     `exigirEscrita`/`exigirEscritaEm` já leram (as duas guardas usam `supabase.auth.getUser()`,
--     a mesma fonte).
--   · `pendencia` (as duas primeiras) só é gravada quando `p_alterar_pendencia` é verdadeiro —
--     EXATAMENTE a regra de antes, em que a action só punha `pendencia` no `.update()` quando o
--     valor calculado diferia do lido (`if (pendenciaLimpa !== ativo.pendencia)`). Gravar sempre
--     (a primeira versão desta migration) regravaria a coluna com o valor LIDO antes, apagando o
--     que outra escrita tivesse posto nela no meio-tempo — a revisão adversarial pegou isso
--     encadeando "definir service tag" e "corrigir patrimônio" no mesmo ativo. `p_pendencia` é
--     SENTINELA: `''` quando o valor final é "sem pendência" (nunca `null` pela porta), e a
--     função grava `nullif(p_pendencia, '')`. Mesma convenção de `p_observacao` em
--     `estornarMovimentacao`/`reabrir_pendencias_item_com_estornos` (0119/0121).
--   · CADA RPC RECUSA (raise, nada grava) se o UPDATE afetar 0 linhas — ativo inexistente, ou
--     filtrado pela USING da policy de UPDATE (filial fora do vínculo de quem chama). O
--     PostgREST não dá erro em UPDATE de 0 linhas; sem esta checagem, a RPC "teria sucesso" sem
--     ter corrigido nada, e a action devolveria `ok: true` mentindo para a tela. Esta é a mesma
--     garantia que a leitura prévia + `exigirEscrita`/`exigirEscritaEm` já dão na action — a RPC
--     é o cinto por trás do suspensório, para a corrida TOCTOU entre a leitura e a RPC (ex.: o
--     vínculo de filial do operador mudou nesse meio-tempo).
--   · NENHUMA trata a violação de unicidade (23505) por dentro: o UPDATE simplesmente propaga o
--     erro do índice (`ativos_patrimonio_service_tag_uidx`), com o MESMO nome de constraint de
--     hoje — `traduzErroBanco`/`casaConstraint` (src/lib/actions/erros.ts) continuam casando pela
--     constraint, não pela origem da chamada, então a frase amigável não muda.
--   · Nenhuma toca `guarda_acervo` (0081): UPDATE em `ativos` continua fora da guarda (só DELETE
--     é guardado ali); INSERT em `anotacoes` nunca teve trigger nenhum. Nenhum outro gatilho de
--     `ativos`/`anotacoes` existe além dos já catalogados (conferido por
--     `select tgname from pg_trigger where tgrelid in ('public.ativos'::regclass,
--     'public.anotacoes'::regclass) and not tgisinternal` no ensaio — 3 linhas: as duas
--     `..._guarda_acervo` de DELETE que já existiam, zero em `anotacoes`).
--
-- A 5ª (lote) é a única com mais de uma linha: `confirmar_assinatura_lote_com_anotacoes` faz o
-- UPDATE e o INSERT como DUAS CTEs de UM SÓ COMANDO SQL (`with atualizado as (update … returning
-- …), anotado as (insert … select … from atualizado returning …) select … from anotado`) — a
-- anotação de cada ativo confirmado nasce do MESMO comando que confirmou, nunca podendo nascer
-- sozinha nem faltar. Continua IDEMPOTENTE por linha (um id já `'sim'` é ignorado, não é erro —
-- outra aba pode ter confirmado no meio-tempo), mas é TUDO OU NADA quanto a VÍNCULO: se a RLS
-- barrar algum dos ids que a leitura prévia (sem filtro de filial, `using (true)`) via como
-- pendente, a função conta os dois lados (v_esperados via SELECT, que enxerga tudo; v_confirmados
-- via o UPDATE, que a RLS filtra) e recusa o LOTE INTEIRO quando divergem — "escrita parcial
-- silenciosa é pior que uma recusa clara" é a MESMA frase já registrada para
-- `exigirEscritaEm`/`resolverPendenciaItem`/`reabrirPendenciaItem` (src/lib/actions/pendencias.ts).
--
-- O QUE FICA DE FORA DESTA MIGRATION, E POR QUÊ (registrado para quem integrar)
--   · `src/lib/actions/pendencias.ts` (`reabrirPendenciaItem`) grava a anotação DEPOIS de uma
--     RPC que já é atômica para `pendencias_item` + `lancamentos_item`
--     (`reabrir_pendencias_item_com_estornos`, 0119/0122). O risco é o espelho: ali a anotação
--     pode FALTAR (o insert solto falha depois da RPC commitada), nunca sobrar. Não entra aqui:
--     mexer na assinatura de uma RPC existente, maior e já coberta linha a linha pelos roteiros
--     e pelo injetor de mutação é escopo e risco diferentes dos cinco casos "ativos + anotação"
--     desta frente, e cabe numa migration própria. Registrado em `docs/DECISOES.md`.
--
-- ROLLBACK, em prosa (pseudo-SQL de função em comentário vira "definição" para
-- `scripts/db/corpo-vigente.mjs`, que quebraria o injetor de mutação): primeiro reverter as
-- cinco Server Actions para o par update + insert de antes (reverter o banco primeiro faria as
-- cinco falharem por função inexistente); depois, por migration NOVA com `npm run db:lock`,
-- dropar as cinco funções desta migration pela assinatura, e recarregar o cache de esquema do
-- PostgREST.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) corrigir_patrimonio_com_anotacao — espelha corrigirPatrimonio (ativos.ts ~l.290)
-- ---------------------------------------------------------------------------
create or replace function public.corrigir_patrimonio_com_anotacao(
  p_ativo_id uuid,
  p_patrimonio text,
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
begin
  update public.ativos
     set patrimonio = p_patrimonio,
         pendencia  = case when p_alterar_pendencia then nullif(p_pendencia, '') else pendencia end
   where id = p_ativo_id;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Ativo não encontrado, ou fora do seu vínculo de escrita — nada foi corrigido.'
      using errcode = 'P0002';
  end if;

  insert into public.anotacoes (ativo_id, texto, criado_por)
  values (p_ativo_id, p_texto_anotacao, auth.uid());
end;
$$;

comment on function public.corrigir_patrimonio_com_anotacao(uuid, text, text, boolean, text) is
  'Reauditoria 18/09/2026 (item U, 0149): grava o novo patrimônio (e a pendência, só quando p_alterar_pendencia) e a anotação "de → para" na MESMA transação. SECURITY INVOKER — a permissão é a RLS de sempre (pode_escrever_filial em ativos, cargo admin/operador em anotacoes); criado_por vem de auth.uid(), nunca de parâmetro. Recusa (nada grava) se o UPDATE afetar 0 linhas (ativo inexistente ou fora do vínculo de filial de quem chama). p_pendencia é sentinela: "" grava NULL (nullif); nunca recebe NULL pela porta.';

revoke all on function public.corrigir_patrimonio_com_anotacao(uuid, text, text, boolean, text) from public, anon;
grant execute on function public.corrigir_patrimonio_com_anotacao(uuid, text, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) definir_service_tag_com_anotacao — espelha definirServiceTag (ativos.ts ~l.376)
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
begin
  update public.ativos
     set service_tag = p_service_tag,
         pendencia   = case when p_alterar_pendencia then nullif(p_pendencia, '') else pendencia end
   where id = p_ativo_id;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Ativo não encontrado, ou fora do seu vínculo de escrita — nada foi definido.'
      using errcode = 'P0002';
  end if;

  insert into public.anotacoes (ativo_id, texto, criado_por)
  values (p_ativo_id, p_texto_anotacao, auth.uid());
end;
$$;

comment on function public.definir_service_tag_com_anotacao(uuid, text, text, boolean, text) is
  'Reauditoria 18/09/2026 (item U, 0149): grava a service tag (e a pendência, só quando p_alterar_pendencia) e a anotação de definição na MESMA transação. Espelho de corrigir_patrimonio_com_anotacao — mesma régua de INVOKER, auth.uid() e recusa em 0 linhas. A imutabilidade "só define quando vazia" continua sendo checagem da action (leitura prévia), como já era antes desta migration.';

revoke all on function public.definir_service_tag_com_anotacao(uuid, text, text, boolean, text) from public, anon;
grant execute on function public.definir_service_tag_com_anotacao(uuid, text, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) confirmar_assinatura_termo_com_anotacao — espelha confirmarAssinaturaTermo (termos.ts ~l.756)
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
begin
  update public.ativos
     set termo_assinado = 'sim',
         termo_data = p_data
   where id = p_ativo_id;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Ativo não encontrado, ou fora do seu vínculo de escrita — nada foi confirmado.'
      using errcode = 'P0002';
  end if;

  insert into public.anotacoes (ativo_id, texto, criado_por)
  values (p_ativo_id, p_texto_anotacao, auth.uid());
end;
$$;

comment on function public.confirmar_assinatura_termo_com_anotacao(uuid, date, text) is
  'Reauditoria 18/09/2026 (item U, 0149): grava termo_assinado = sim + termo_data e o rastro imutável na anotacoes, na MESMA transação. O guard de idempotência ("já consta como assinado") continua na action, antes de chamar — esta função sempre escreve quando chamada.';

revoke all on function public.confirmar_assinatura_termo_com_anotacao(uuid, date, text) from public, anon;
grant execute on function public.confirmar_assinatura_termo_com_anotacao(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) desfazer_confirmacao_termo_com_anotacao — espelha desfazerConfirmacaoTermo (termos.ts ~l.835)
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
begin
  update public.ativos
     set termo_assinado = p_destino,
         termo_data = null
   where id = p_ativo_id;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Ativo não encontrado, ou fora do seu vínculo de escrita — nada foi desfeito.'
      using errcode = 'P0002';
  end if;

  insert into public.anotacoes (ativo_id, texto, criado_por)
  values (p_ativo_id, p_texto_anotacao, auth.uid());
end;
$$;

comment on function public.desfazer_confirmacao_termo_com_anotacao(uuid, public.termo_status, text) is
  'Reauditoria 18/09/2026 (item U, 0149): desfaz a confirmação (volta termo_assinado para gerado ou nao, sempre limpando termo_data) e grava a anotação, na MESMA transação. p_destino é calculado pela action (existe termo_gerados cobrindo o ativo? gerado : nao) — esta função só grava o valor que recebe, nunca decide.';

revoke all on function public.desfazer_confirmacao_termo_com_anotacao(uuid, public.termo_status, text) from public, anon;
grant execute on function public.desfazer_confirmacao_termo_com_anotacao(uuid, public.termo_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) confirmar_assinatura_lote_com_anotacoes — espelha confirmarAssinaturaLote (termos.ts ~l.965)
-- ---------------------------------------------------------------------------
-- Recebe só os ids já filtrados pela action como PENDENTES (termo_assinado distinto de 'sim',
-- lido ANTES, sem filtro de filial — a leitura de ativos é `using (true)`). Reconfirma o mesmo
-- filtro aqui DENTRO do UPDATE (idempotência de corrida: alguém pode ter confirmado no
-- meio-tempo) e compara o total ESPERADO (a mesma pergunta, mas sem RLS de escrita) com o total
-- que o UPDATE de fato afetou (COM RLS de escrita) — a diferença só pode vir de vínculo de
-- filial faltando, e aí o lote inteiro recusa.
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
declare
  v_esperados int;
  v_confirmados int;
begin
  select count(*) into v_esperados
    from public.ativos a
   where a.id = any (p_ativo_ids)
     and a.termo_assinado is distinct from 'sim';

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

  get diagnostics v_confirmados = row_count;

  if v_confirmados < v_esperados then
    raise exception 'Não foi possível confirmar o lote inteiro — um ou mais termos estão fora do seu vínculo de filial. Nada foi confirmado.'
      using errcode = '42501';
  end if;
end;
$$;

comment on function public.confirmar_assinatura_lote_com_anotacoes(uuid[], date, text) is
  'Reauditoria 18/09/2026 (item U, 0149): confirma 1..N termos e grava UMA anotação por ativo confirmado, no MESMO comando SQL (o UPDATE e o INSERT são duas CTEs de uma única instrução — a anotação nunca pode nascer sem a confirmação nem faltar). Idempotente por linha (id já ''sim'' é ignorado em silêncio, como sempre); tudo-ou-nada quanto a VÍNCULO DE FILIAL — se a RLS barrar algum id que a leitura prévia via como pendente, recusa o lote inteiro (mesma doutrina de exigirEscritaEm). p_ativo_ids já vem filtrado pela action (só os pendentes); a função reconfirma o filtro para a corrida de idempotência.';

revoke all on function public.confirmar_assinatura_lote_com_anotacoes(uuid[], date, text) from public, anon;
grant execute on function public.confirmar_assinatura_lote_com_anotacoes(uuid[], date, text) to authenticated;

-- ---------- VERIFICAÇÃO PÓS-APPLY (cada banco — ensaio primeiro; só leitura, só números) ----------
--
--   -- 1) as cinco existem, uma assinatura cada, sem overload:
--   select p.oid::regprocedure::text
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('corrigir_patrimonio_com_anotacao', 'definir_service_tag_com_anotacao',
--                         'confirmar_assinatura_termo_com_anotacao',
--                         'desfazer_confirmacao_termo_com_anotacao',
--                         'confirmar_assinatura_lote_com_anotacoes')
--    order by 1;
--   -- esperado: EXATAMENTE 5 linhas
--
--   -- 2) os atributos que a trava cobra: INVOKER, não strict, search_path vazio:
--   select p.proname, p.prosecdef, p.proisstrict, p.proconfig
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('corrigir_patrimonio_com_anotacao', 'definir_service_tag_com_anotacao',
--                         'confirmar_assinatura_termo_com_anotacao',
--                         'desfazer_confirmacao_termo_com_anotacao',
--                         'confirmar_assinatura_lote_com_anotacoes')
--    order by 1;
--   -- esperado: prosecdef=false, proisstrict=false, proconfig={search_path=} nas cinco
--
--   -- 3) grants por papel — só authenticated (e o dono) executa; anon e PUBLIC não:
--   select p.proname, r.rolname,
--          has_function_privilege(r.rolname, p.oid, 'execute')
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
--          (values ('anon'), ('authenticated'), ('service_role')) r(rolname)
--    where n.nspname = 'public'
--      and p.proname in ('corrigir_patrimonio_com_anotacao', 'definir_service_tag_com_anotacao',
--                         'confirmar_assinatura_termo_com_anotacao',
--                         'desfazer_confirmacao_termo_com_anotacao',
--                         'confirmar_assinatura_lote_com_anotacoes')
--    order by 1, 2;
--   -- esperado: anon=false, authenticated=true, service_role=false nas cinco (INVOKER: quem
--   -- chama já é a sessão do operador; service_role não precisa e não deve, cinto e suspensório)
--
--   -- 4) nenhum outro gatilho novo apareceu em ativos/anotacoes (esta migration não cria trigger):
--   select tgname from pg_trigger
--    where tgrelid in ('public.ativos'::regclass, 'public.anotacoes'::regclass)
--      and not tgisinternal
--    order by 1;
--   -- esperado: EXATAMENTE as duas de sempre — ativos_guarda_acervo (BEFORE DELETE) — e nenhuma
--   -- em anotacoes (ela nunca teve trigger)
--
--   -- 5) recarregar o cache do PostgREST:
--   notify pgrst, 'reload schema';
-- =============================================================================
