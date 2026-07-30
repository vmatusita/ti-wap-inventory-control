-- Migration 0076 — F22: promove a cargo `dev` as contas do §0 da ordem de serviço.
--
-- Depende de 0071→0074. Contexto: docs/prompts/F22-cargo-dev-ultracode.md §5
-- (`EMAILS_DEV = victor.matusita@wap.ind.br , vymatusita@stefanini.com`).
--
-- POR QUE OS E-MAILS REAIS PODEM ESTAR AQUI. A regra 2 do CLAUDE.md ("NUNCA dados reais")
-- protege o ACERVO: nome de colaborador, patrimônio, linha de planilha — em seed, fixture,
-- teste, comentário ou screenshot. Ela continua absoluta nesses lugares. Um endereço de
-- login administrativo do próprio sistema é METADADO DE ACESSO, não dado do acervo: é da
-- mesma natureza do ref do projeto Supabase ou do nome do bucket, e a alternativa (promover
-- por uuid) tornaria a migration ilegível e impossível de reexecutar em outro banco.
-- O §5 da ordem autoriza explicitamente. Registrado em docs/DECISOES.md.
--
-- POR QUE POR E-MAIL E NÃO POR UUID. O uuid difere entre ensaio e produção; o e-mail é o
-- mesmo. Assim a MESMA migration roda nos dois bancos e no CI sem edição — que é o que
-- torna o `supabase start` do CI (que aplica 0001→00NN num banco zerado) uma prova de que
-- ela aplica limpo.
--
-- ZERO LINHA AFETADA É RESULTADO VÁLIDO. Num banco novo (CI) não existe nenhuma dessas
-- contas, e a migration não faz nada — de propósito. Ela também não CRIA conta: criar conta
-- é ato do Auth (convite), não de SQL. O §0 da ordem fixa `CONTA_FALTANDO = convidar`, e o
-- convite da conta que não existir é feito pela tela/relatório, não aqui.
--
-- POR QUE O BLOCO ABRE A JANELA DA 0073. Conceder o cargo `dev` é exatamente o que o trigger
-- `profiles_guarda_dev` recusa por padrão. Sem o `set_config`, esta migration recusaria a si
-- própria — e o CI, que reaplica tudo do zero, denunciaria na hora. O bloco abre e fecha a
-- janela pelo mesmo idioma das RPCs da 0074.
--
-- IDEMPOTENTE: reexecutar não muda nada. Um perfil que já é `dev` não passa por nenhum dos
-- dois ramos do trigger (o cargo não MUDA), e o `where` filtra por `excluido_em is null`.
--
-- ⚠ ESCRITA EM DADO EXISTENTE. Antes do apply em PRODUÇÃO, exporte backup de `profiles`
-- (regra de autoproteção do CLAUDE.md). O comando exato e a conferência pós-apply estão em
-- docs/RELATORIO-F22.md.
--
-- REVERSÃO: `update public.profiles set papel = 'admin' where papel = 'dev';` — precisa da
-- mesma janela aberta (é alteração de linha dev), ou rode-a de dentro de um bloco igual ao
-- abaixo trocando o `set papel`.

do $$
declare
  v_alvo   text[] := array['victor.matusita@wap.ind.br', 'vymatusita@stefanini.com'];
  v_existem int;
  v_agora   int;
begin
  select count(*) into v_existem
    from auth.users u
   where lower(u.email) = any (v_alvo);

  perform set_config('estoque.gestao_usuarios', 'on', true);

  update public.profiles p
     set papel = 'dev'
   where p.excluido_em is null
     and p.id in (select u.id from auth.users u where lower(u.email) = any (v_alvo));

  perform set_config('estoque.gestao_usuarios', 'off', true);

  select count(*) into v_agora
    from public.profiles p
   where p.papel = 'dev' and p.excluido_em is null;

  raise notice 'F22/0076: % das % contas de EMAILS_DEV existem em auth.users; total de perfis dev agora = %.',
    v_existem, array_length(v_alvo, 1), v_agora;

  -- Não levanta exceção quando falta conta: `CONTA_FALTANDO = convidar` manda CONVIDAR, e o
  -- convite não é ato de migration. Num banco vazio (CI) v_existem = 0 e está correto.
  if v_existem < array_length(v_alvo, 1) then
    raise notice 'F22/0076: falta(m) conta(s) — convide pela tela /admin/usuarios e o cargo dev é aplicado no convite.';
  end if;
end $$;

-- ---------- VERIFICAÇÃO PÓS-APPLY (colar a saída no relatório) ----------
--   select u.email, p.papel, p.ativo, p.excluido_em
--     from public.profiles p
--     join auth.users u on u.id = p.id
--    where lower(u.email) in ('victor.matusita@wap.ind.br', 'vymatusita@stefanini.com')
--    order by u.email;
--   -- esperado em PRODUÇÃO: uma linha por conta EXISTENTE, com papel = 'dev', ativo = true,
--   --                       excluido_em = null
--
--   -- distribuição de cargos (nenhum outro perfil pode ter mudado):
--   select papel, count(*) from public.profiles where excluido_em is null group by papel order by papel;
