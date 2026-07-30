-- Migration 0072 — F22: o cargo `dev` entra na autorização (funções + as policies de lista
-- fechada que uma redefinição de função NÃO alcança).
--
-- Depende da 0071 (label `dev` no enum — precisa ser outra transação).
-- Contexto: docs/prompts/F22-cargo-dev-ultracode.md §1.2 · docs/ADR-002 (emenda 30/07/2026).
--
-- A IDEIA CENTRAL, e por que ela não basta sozinha. `e_admin()` deixa de significar
-- "o cargo é exatamente admin" e passa a significar "o cargo é de NÍVEL administrador"
-- (`in ('admin','dev')`). Com isso as ~20 policies de /admin (filiais, motivos, itens,
-- kits_modelos, import_logs, eventos_admin, bucket backups-import) e a guarda interna da RPC
-- de import herdam o `dev` SEM SEREM REESCRITAS — que é exatamente o ganho do desenho.
--
-- ⚠ MAS a herança tem DOIS BURACOS, medidos em produção em 30/07/2026, e é para tapá-los
-- que esta migration existe além do `create or replace` de uma linha:
--
--   (1) `pode_escrever_filial()` NÃO chama `e_admin()` — tem o seu próprio
--       `if v_papel = 'admin' then return true`. Um dev cairia no `return false` final e
--       perderia TODA a escrita de acervo: ativos, movimentacoes, lancamentos_item,
--       pendencias_item e, por dentro, pode_escrever_termo/pode_escrever_arquivo_termo.
--       E o sintoma seria SILENCIOSO no UPDATE — o USING de uma policy de UPDATE é filtro de
--       linha, não erro: a escrita afetaria 0 linhas sem SQLSTATE (a mesma armadilha que o
--       comentário longo de src/lib/auth/acesso.ts:320-331 já documenta).
--
--   (2) CINCO policies gateiam por LISTA LITERAL de cargos,
--       `papel_atual() in ('admin','operador')`, que nenhuma redefinição de função alcança:
--         · public.anotacoes            "operador anota"      (insert)
--         · public.relatorios_gerados   "operador gera"       (insert)
--         · storage.objects             "termos insere operador"   (insert)
--         · storage.objects             "termos atualiza operador" (update)
--         · storage.objects             "termos apaga operador"    (delete)
--       Sem tocá-las, o dev não anotaria, não congelaria relatório e não gravaria o .docx do
--       termo — enquanto a linha em `termos_gerados` passaria (ela deriva de e_admin() via
--       pode_escrever_termo). O termo ficaria pela METADE: registro sim, arquivo não.
--
-- COMO AS CINCO SÃO CONSERTADAS: em vez de repetir `in ('dev','admin','operador')` inline —
-- que recria o mesmo problema no dia do quinto cargo —, nasce `public.pode_escrever()`,
-- espelho exato de `podeEscrever(papel)` de src/lib/auth/papeis.ts ("escreve ALGO no acervo,
-- nas filiais que lhe couberem"). As cinco passam a chamá-la; um cargo futuro é UMA linha.
--
-- ADITIVA / NÃO DESTRUTIVA: `create or replace` em funções e `alter policy` em policies
-- existentes (a 0063 registra que `create or replace policy` não existe em PG 17 e que
-- ALTER POLICY troca o predicado sem derrubar a policy). Nenhuma linha de dado é tocada.
-- Nenhuma policy é AFROUXADA: `in ('admin','operador')` → `pode_escrever()` só acrescenta
-- `dev` ao conjunto; `consulta` e o perfil desativado continuam de fora.
-- Caminho **A** do docs/RUNBOOK-BANCO.md.
--
-- REVERSÃO: restaurar os corpos da 0062 (`= 'admin'` nas duas funções), `drop function
-- public.e_dev(), public.pode_escrever();` e devolver `in ('admin','operador')` às cinco
-- policies (predicados literais no corpo desta migration, abaixo de cada alter).

-- ---------------------------------------------------------------------------
-- 1) e_admin() — de "é o admin" para "é de NÍVEL administrador"
-- ---------------------------------------------------------------------------
-- `create or replace` com assinatura IDÊNTICA (regra do runbook: assinatura diferente cria
-- overload e o PostgREST deixa de resolver a chamada). Os grants sobrevivem ao replace.
create or replace function public.e_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.papel_atual() in ('admin', 'dev'), false)
$$;

comment on function public.e_admin() is
  'F22 (era F21): true se o usuário logado é de NÍVEL ADMINISTRADOR (admin OU dev) e está ativo. O nome ficou por compatibilidade — são ~20 policies e a guarda da RPC de import chamando-a, e renomear seria churn sem ganho. Para "é exatamente o cargo dev", use e_dev(). Usada nas policies de /admin (filiais, motivos, itens, kits_modelos, import_logs, eventos_admin, bucket backups-import) e na guarda interna de importar_ativos_substituir.';

-- ---------------------------------------------------------------------------
-- 2) e_dev() — o cargo do topo, exatamente
-- ---------------------------------------------------------------------------
-- Mesmo padrão das três da 0062: definer + stable + search_path fixo + revoke de
-- public/anon + grant só para authenticated (a expressão de policy roda com os privilégios
-- de quem consulta, então `authenticated` PRECISA do execute). Responde só sobre o PRÓPRIO
-- chamador — não aceita identidade como parâmetro e não revela nada de terceiros.
create or replace function public.e_dev()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.papel_atual() = 'dev', false)
$$;

comment on function public.e_dev() is
  'F22: true se o usuário logado tem o cargo DEV e está ativo. É a guarda do que só o dev faz: conceder/revogar o próprio cargo dev, agir sobre uma conta dev, trocar e-mail, apagar usuário, encerrar sessões e a área /dev. NÃO confundir com e_admin(), que desde a F22 significa "nível administrador" (admin OU dev).';

revoke all on function public.e_dev() from public, anon;
grant execute on function public.e_dev() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) pode_escrever() — "escreve ALGO no acervo" (o predicado só-cargo)
-- ---------------------------------------------------------------------------
-- Espelho de `podeEscrever(papel)` (src/lib/auth/papeis.ts): dev, admin e operador escrevem
-- algo; consulta e perfil desativado, nada. NÃO substitui `pode_escrever_filial(fid)` — este
-- aqui é o predicado das escritas que NÃO têm filial própria para gatear (anotação,
-- snapshot de relatório) e do cargo mínimo na escrita do bucket `termos`, onde o recorte de
-- filial é feito ao lado, por `pode_escrever_arquivo_termo(name)`.
create or replace function public.pode_escrever()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.papel_atual() in ('dev', 'admin', 'operador'), false)
$$;

comment on function public.pode_escrever() is
  'F22: true se o cargo do usuário logado escreve ALGO no acervo (dev, admin ou operador) e ele está ativo; false para consulta, perfil desativado, sem perfil e sem sessão. Espelha podeEscrever(papel) de src/lib/auth/papeis.ts. Existe para as policies que gateavam por LISTA LITERAL in (''admin'',''operador'') — lista que nenhuma redefinição de função alcança e que esqueceria todo cargo futuro. NÃO confere filial: onde o recorte de filial importa, use pode_escrever_filial(fid) ou pode_escrever_arquivo_termo(name).';

revoke all on function public.pode_escrever() from public, anon;
grant execute on function public.pode_escrever() to authenticated;

-- ---------------------------------------------------------------------------
-- 4) pode_escrever_filial(fid) — dev escreve em todas, como o admin
-- ---------------------------------------------------------------------------
-- O buraco (1) do cabeçalho. Corpo idêntico ao da 0062, com UMA mudança: o desvio do topo
-- passa a aceitar os dois cargos de nível administrador. Continua sem chamar `e_admin()`
-- por dentro de propósito — `papel_atual()` já foi lido para a variável, e uma segunda
-- chamada seria um SELECT a mais por linha avaliada na policy de `ativos`.
create or replace function public.pode_escrever_filial(fid smallint)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_papel public.papel_usuario;
begin
  -- Sem filial não há o que autorizar. Fecha em vez de abrir.
  if fid is null then
    return false;
  end if;

  v_papel := public.papel_atual();

  -- F22: `dev` acompanha `admin` — escreve em toda filial, sem linha em operador_filiais.
  if v_papel in ('dev', 'admin') then
    return true;
  end if;

  if v_papel = 'operador' then
    return exists (
      select 1
        from public.operador_filiais vf     -- `of` é palavra reservada: alias `vf`
       where vf.usuario_id = (select auth.uid())
         and vf.filial_id  = fid
    );
  end if;

  -- 'consulta', perfil desativado, sem perfil, sem sessão.
  return false;
end;
$$;

comment on function public.pode_escrever_filial(smallint) is
  'F22 (era F21): true se o usuário logado pode ESCREVER na filial informada. dev/admin → sempre; operador → só com vínculo em operador_filiais; consulta/desativado/sem perfil → nunca; fid NULL → nunca. Só escrita: a LEITURA é ampla para todo logado ATIVO (ADR-001 + piso da 0070).';

-- ---------------------------------------------------------------------------
-- 5) As CINCO policies de lista literal — o buraco (2)
-- ---------------------------------------------------------------------------
-- Predicado ANTERIOR das duas de public (0063:212 e 0063:217), para a reversão:
--   with check ((select public.papel_atual()) in ('admin', 'operador'))

alter policy "operador anota" on public.anotacoes
  with check ((select public.pode_escrever()));

alter policy "operador gera" on public.relatorios_gerados
  with check ((select public.pode_escrever()));

-- As três do bucket `termos` (storage.objects). Predicado ANTERIOR, vindo da 0069:389-412:
--   bucket_id = 'termos'
--   and (select public.papel_atual()) in ('admin', 'operador')
--   and public.pode_escrever_arquivo_termo(name)
-- A conjunção de FILIAL (`pode_escrever_arquivo_termo`) fica INTACTA — é ela que a 0069
-- acrescentou e que impede o operador de gravar o .docx de um termo de filial alheia.
-- Aqui muda SÓ a conjunção de CARGO.
alter policy "termos insere operador" on storage.objects
  with check (
    bucket_id = 'termos'
    and (select public.pode_escrever())
    and public.pode_escrever_arquivo_termo(name)
  );

alter policy "termos atualiza operador" on storage.objects
  using (
    bucket_id = 'termos'
    and (select public.pode_escrever())
    and public.pode_escrever_arquivo_termo(name)
  )
  with check (
    bucket_id = 'termos'
    and (select public.pode_escrever())
    and public.pode_escrever_arquivo_termo(name)
  );

alter policy "termos apaga operador" on storage.objects
  using (
    bucket_id = 'termos'
    and (select public.pode_escrever())
    and public.pode_escrever_arquivo_termo(name)
  );

-- ---------- VERIFICAÇÃO PÓS-APPLY ----------
--   -- 5a) as quatro funções existem, definer, stable, sem execute para anon:
--   select p.proname, p.prosecdef as definer, p.provolatile as vol,
--          has_function_privilege('anon', p.oid, 'execute')          as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('papel_atual','e_admin','e_dev','pode_escrever','pode_escrever_filial')
--    order by p.proname;
--   -- esperado: 5 linhas · definer = true · vol = 's' · anon = false · auth = true
--
--   -- 5b) NÃO sobrou lista literal de cargo em policy nenhuma:
--   select schemaname||'.'||tablename||' :: '||policyname as policy
--     from pg_policies
--    where (coalesce(qual,'')||coalesce(with_check,'')) ~ '''admin''::papel_usuario';
--   -- esperado: ZERO linhas
--
--   -- 5c) as cinco agora chamam pode_escrever():
--   select schemaname||'.'||tablename||' :: '||policyname, cmd
--     from pg_policies
--    where (coalesce(qual,'')||coalesce(with_check,'')) like '%pode_escrever()%'
--    order by 1;
--   -- esperado: anotacoes/operador anota, relatorios_gerados/operador gera,
--   --           storage.objects/termos insere|atualiza|apaga operador  (5 linhas)
--
--   -- 5d) e_admin() continua chegando às ~20 policies de /admin (nenhuma sumiu):
--   select count(*) from pg_policies
--    where (coalesce(qual,'')||coalesce(with_check,'')) like '%e_admin%';
--   -- esperado: 19 — 4 catálogos (filiais, motivos, itens, kits_modelos) × 3 verbos = 12,
--   --           + import_logs × 2 + eventos_admin × 1 + bucket backups-import × 4.
--   --           Medido nos dois bancos ANTES e DEPOIS do apply: 19 → 19. A redefinição de
--   --           e_admin() não altera esta contagem (ela é estrutural); o número não pode CAIR.
