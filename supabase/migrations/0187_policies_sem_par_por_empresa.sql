-- =============================================================================
-- 0187_policies_sem_par_por_empresa.sql — F67 (13/11/2026): as policies cujo piso não tinha par passam à forma por empresa
-- =============================================================================
-- classe: ADITIVA (alter policy de nove policies, só o termo do cargo; nenhuma tabela, função ou linha muda)
--
-- O piso sem empresa vai mudar de sentido na 0188: `papel_atual()` passa a "o cargo MAIS FORTE entre as memberships
-- ativas", e `e_admin()`/`pode_escrever()`/`e_dev()` a "em ALGUMA empresa". Em conjunção com o recorte do MESMO cargo
-- (as 43 policies de negócio da F66) isso é EXATAMENTE "este cargo nesta empresa". SEM par, viraria "em qualquer
-- empresa" — e entre a F67 e a F67B o admin só da B leria os backups do import da WAP. Por isso estas nove saem do piso
-- ANTES dele mudar, para a forma POR EMPRESA com a legada EXPLÍCITA, apontando a fase que dará o recorte de verdade
-- (docs/PLAN-F67.md §2.1, decisão 3; fato 8 remedido):
--
--   storage.objects · backups-import (apaga, atualiza, insere, leitura)   e_admin()      → e_admin_na(empresa_legada())      F67B
--   storage.objects · termos (apaga, atualiza, insere)                     pode_escrever() → pode_escrever_na(empresa_legada()) F67B
--   public.profiles · leitura operador                                     papel_atual()   → papel_na_empresa(empresa_legada()) F69
--   public._bkp_relatorios_gerados_f6a · dev le backup f6a                 e_dev()         → e_dev_na(empresa_legada())        permanente
--
-- (A leitura de `termos` passa por `pode_ler_arquivo_termo`, cujo corpo a 0186 já trocou.) `membros` não está aqui: a
-- 0178 já a pareou com `empresas_do_membro()`. `empresas` e `plataforma_admins` não têm policy (RLS ligada, ninguém lê).
--
-- `alter policy` troca a expressão INTEIRA de cada cláusula (RUNBOOK, Anexo F66): o texto-alvo repete o resto por extenso,
-- copiado do catálogo vivo (igual nos dois bancos); só a função do cargo muda. O nome, os papéis (`to authenticated`) e a
-- permissividade ficam. Com uma empresa, cada forma nova responde igual à de hoje (o conta a conta prova as funções).
-- `alter policy` toma ACCESS EXCLUSIVE na tabela até o fim da transação: lock_timeout de 2 s, sem begin/commit.
-- =============================================================================

set lock_timeout = '2s';

alter policy "backups-import apaga operador" on storage.objects
  using ((bucket_id = 'backups-import'::text) and (select public.e_admin_na(public.empresa_legada())));

alter policy "backups-import atualiza operador" on storage.objects
  using ((bucket_id = 'backups-import'::text) and (select public.e_admin_na(public.empresa_legada())))
  with check ((bucket_id = 'backups-import'::text) and (select public.e_admin_na(public.empresa_legada())));

alter policy "backups-import insere operador" on storage.objects
  with check ((bucket_id = 'backups-import'::text) and (select public.e_admin_na(public.empresa_legada())));

alter policy "backups-import leitura operador" on storage.objects
  using ((bucket_id = 'backups-import'::text) and (select public.e_admin_na(public.empresa_legada())));

alter policy "termos apaga operador" on storage.objects
  using ((bucket_id = 'termos'::text) and (select public.pode_escrever_na(public.empresa_legada()))
         and public.pode_escrever_arquivo_termo(name));

alter policy "termos atualiza operador" on storage.objects
  using ((bucket_id = 'termos'::text) and (select public.pode_escrever_na(public.empresa_legada()))
         and public.pode_escrever_arquivo_termo(name))
  with check ((bucket_id = 'termos'::text) and (select public.pode_escrever_na(public.empresa_legada()))
              and public.pode_escrever_arquivo_termo(name));

alter policy "termos insere operador" on storage.objects
  with check ((bucket_id = 'termos'::text) and (select public.pode_escrever_na(public.empresa_legada()))
              and public.pode_escrever_arquivo_termo(name));

alter policy "leitura operador" on public.profiles
  using ((select public.papel_na_empresa(public.empresa_legada())) is not null);

alter policy "dev le backup f6a" on public._bkp_relatorios_gerados_f6a
  using ((select public.e_dev_na(public.empresa_legada())));

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   As nove com o md5 de qual/with_check = o do CI; as outras 53 policies de public e storage byte a byte (o md5 do
--   "antes", docs/f67-evidencias/antes/); nenhuma policy de qualquer esquema citando papel_atual()/e_admin()/e_dev()/
--   pode_escrever() fora da conjunção com o recorte do mesmo cargo (a trava Q de supabase/tests/cargo_por_empresa.sql).
--
-- ROLLBACK (supabase/rollback/F67-desfaz.sql, depois de devolver papel_atual() — a 0188 — e antes de devolver os corpos
-- da 0186): `alter policy` das nove de volta ao texto de antes, só nas cláusulas que esta migration trocou — a função do
-- cargo volta a ser e_admin(), pode_escrever(), papel_atual() e e_dev(). Nenhum dado se perde.
