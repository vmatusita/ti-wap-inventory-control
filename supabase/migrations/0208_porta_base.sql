-- =====================================================================================================================
-- 0208_porta_base.sql — F68 (19/11/2026): a porta pública por empresa — a BASE
-- =====================================================================================================================
-- classe: ADITIVA (um conferidor que só lê catálogo + uma constraint unique numa tabela de 5 linhas — nenhum dado muda)
--
-- A porta nova confere a senha DENTRO do banco (bcrypt do pgcrypto — decisão 19/11-3 do Johnny) e guarda a sessão do
-- visualizador no banco, presa à senha por uma FK composta (empresa_id, senha_id). Esta migration prepara as duas coisas:
--
-- 1) CONFERE que o pgcrypto está no schema `extensions` (as quatro funções que a porta usa: crypt, gen_salt, digest,
--    gen_random_bytes). NÃO cria extensão: em produção e no ensaio ela já existe (o ambiente gerenciado a instala em
--    `extensions`); no CI quem a cria é o bootstrap (supabase/ci/bootstrap-roles.sql), espelhando o ambiente. Faltou →
--    recusa aqui, com a mensagem, antes de qualquer função que dependa dela nascer quebrada.
-- 2) `unique (empresa_id, id)` em `senhas_acesso` — o alvo da FK composta da sessão (0209). `id` já é a PK, então a
--    unicidade não muda nada do que existe; ela só deixa a FK composta existir (e cobre a FK simples de empresa_id, que o
--    advisor acusava sem índice).
--
-- ⚠ As 5 senhas de hoje (scrypt) NÃO são tocadas — nem aqui nem em nenhuma migration da fase.
-- =====================================================================================================================

set lock_timeout = '2s';

do $$
begin
  if to_regprocedure('extensions.crypt(text,text)') is null
     or to_regprocedure('extensions.gen_salt(text,integer)') is null
     or to_regprocedure('extensions.digest(text,text)') is null
     or to_regprocedure('extensions.gen_random_bytes(integer)') is null then
    raise exception 'F68 (0208): o pgcrypto não está no schema extensions (crypt, gen_salt, digest, gen_random_bytes). '
      'No ambiente gerenciado ele já vem instalado; no CI, o bootstrap o cria. Nada foi aplicado.';
  end if;
end $$;

alter table public.senhas_acesso
  add constraint senhas_acesso_empresa_id_uidx unique (empresa_id, id);

comment on constraint senhas_acesso_empresa_id_uidx on public.senhas_acesso is
  'F68 (0208): o alvo da FK composta (empresa_id, senha_id) de sessoes_visualizador — a sessão do visualizador é da empresa DA SENHA, por construção.';

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   pg_constraint com senhas_acesso_empresa_id_uidx (contype u, colunas empresa_id, id); o md5 das 5 linhas de
--   senhas_acesso igual ao do "antes" (nenhuma linha tocada).
--
-- ROLLBACK (supabase/rollback/F68-desfaz.sql, o bloco 0208 — o ÚLTIMO na ordem inversa 0212 → 0208; antes dele, o
-- revert do PR de código e o deploy): derrubar a constraint senhas_acesso_empresa_id_uidx (só depois de a 0209 ter saído,
-- porque a FK composta da sessão depende dela). O conferidor não deixa rastro.
