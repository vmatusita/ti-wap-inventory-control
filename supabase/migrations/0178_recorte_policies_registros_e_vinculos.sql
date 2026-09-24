-- =============================================================================
-- 0178_recorte_policies_registros_e_vinculos.sql — F66 (24/09/2026): o recorte de empresa nas policies, lote 3
-- =============================================================================
-- classe: ADITIVA (sete policies ganham o termo de empresa por alter policy; nenhuma tupla reescrita, nada derrubado)
--
-- Os VÍNCULOS de uma conta com a empresa (`membros`, `operador_filiais` — infra que TEM a coluna: ninguém tem motivo para
-- ler as memberships de outra empresa; PLAN-F66.md, decisão 2) e os REGISTROS (`relatorios_gerados`, `import_logs`,
-- `eventos_admin` — a ordem da 0163). A ordem de lock: os vínculos primeiro, os registros depois e `eventos_admin` por
-- último — é a ordem em que as RPCs de conta (`definir_papel_usuario`, `definir_vinculos_usuario`) e o import escrevem
-- (o vínculo ou o acervo, depois a trilha). O recorte, a forma, o piso intacto e o lock: os da 0175.
--
-- `eventos_admin` NÃO muda de forma (decisão 3 do Johnny, 24/09/2026): só a LEITURA da trilha ganha o recorte, pela classe
-- de cargo (`e_admin()` → empresas_de_admin()). O jsonb fica onde está (medido: 102 linhas, nenhuma acima de 8 kB).
-- `import_logs` é lido e escrito por admin (0063/0067): as duas pela classe de cargo, apesar do nome da policy.
-- `membros` e `operador_filiais` são lidas pelo piso: a membership é lida pela sessão (o app lê o cargo por ela) — e as
-- funções de conjunto que a policy chama são `security definer` (0157), então lê-la aqui não recursa (R-ACC-72, item 1:
-- nenhuma destas com `force row level security`, e o 4-bis de catalogo_policies.sql confere).
-- =============================================================================

set lock_timeout = '2s';

-- membros (0153): a leitura pelo piso
alter policy "leitura operador" on public.membros
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

-- operador_filiais (0070): a leitura pelo piso
alter policy "leitura operador" on public.operador_filiais
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

-- relatorios_gerados (0070 a leitura; 0072 a geração)
alter policy "leitura operador" on public.relatorios_gerados
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

alter policy "operador gera" on public.relatorios_gerados
  with check ((select public.pode_escrever())
              and empresa_id = any (array (select public.empresas_de_escrita())));

-- import_logs (0063 a leitura; 0067 a escrita) — as duas por cargo
alter policy "leitura operador" on public.import_logs
  using ((select public.e_admin())
         and empresa_id = any (array (select public.empresas_de_admin())));

alter policy "operador insere" on public.import_logs
  with check ((select public.e_admin())
              and empresa_id = any (array (select public.empresas_de_admin())));

-- eventos_admin (0065): a auditoria, por cargo
alter policy "admin le auditoria" on public.eventos_admin
  using ((select public.e_admin())
         and empresa_id = any (array (select public.empresas_de_admin())));

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   docs/f66-evidencias/impressao-policies.sql: as 51 policies de tabela com empresa_id com o termo (a 16a de
--   catalogo_policies.sql verde); as 11 que a fase não toca (8 de Storage, 3 sem a coluna) byte a byte; o relfilenode
--   das 20 IGUAL; a prova conta a conta REAL do lote com 0 divergência.
--
-- ROLLBACK (supabase/rollback/F66-desfaz.sql, passo 3): cada policy de volta ao texto de antes, por `alter policy`
-- literal, na mesma ordem de tabelas deste arquivo.
