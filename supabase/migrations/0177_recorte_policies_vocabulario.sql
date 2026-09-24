-- =============================================================================
-- 0177_recorte_policies_vocabulario.sql — F66 (24/09/2026): o recorte de empresa nas policies, lote 2 (o vocabulário)
-- =============================================================================
-- classe: ADITIVA (vinte e uma policies ganham o termo de empresa por alter policy; nenhuma tupla reescrita, nada derrubado)
--
-- O vocabulário de UMA empresa: as quatro tabelas do De→Para do import (a ordem da 0162: `import_prefixos_patrimonio`,
-- `import_termos_categoria`, `import_termos_estado`, `unidades_apelidos`), os catálogos administrados (`tipos_item`,
-- `motivos`, `kits_modelos` — a ordem da 0162/0163) e as unidades (`filiais`, da F62 — por último: o gatilho da
-- diagonal nome × apelido lê `filiais` depois de escrever em `unidades_apelidos`, e esta é a mesma ordem). O recorte, a
-- forma, o piso intacto e o lock: os da 0175. Todas as de escrita daqui são de ADMIN (`e_admin()` → empresas_de_admin());
-- as de leitura, do piso (`papel_atual()` → empresas_do_membro()).
--
-- ⚠ `filiais` é lida pelas funções de conjunto e por `pode_escrever_filial` — todas `security definer`, que atravessam a
-- RLS por construção: o recorte daqui não muda o que elas enxergam (é a F67 que dá escopo às definer). E o gatilho
-- `kits_modelos_motivo_da_empresa` (0164, INVOKER) lê `motivos` com o filtro explícito da empresa do kit: o recorte da
-- leitura de `motivos` não muda o que ele encontra para quem é membro da empresa do kit.
-- =============================================================================

set lock_timeout = '2s';

-- o vocabulário do import (0139): só a leitura, pelo piso
alter policy "leitura operador" on public.import_prefixos_patrimonio
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

alter policy "leitura operador" on public.import_termos_categoria
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

alter policy "leitura operador" on public.import_termos_estado
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

-- unidades_apelidos (0139): a leitura pelo piso; inserir e apagar apelido, admin
alter policy "leitura operador" on public.unidades_apelidos
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

alter policy "admin insere apelido" on public.unidades_apelidos
  with check ((select public.e_admin())
              and empresa_id = any (array (select public.empresas_de_admin())));

alter policy "admin apaga apelido" on public.unidades_apelidos
  using ((select public.e_admin())
         and empresa_id = any (array (select public.empresas_de_admin())));

-- tipos_item (0114)
alter policy "leitura operador" on public.tipos_item
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

alter policy "admin insere tipo" on public.tipos_item
  with check ((select public.e_admin())
              and empresa_id = any (array (select public.empresas_de_admin())));

alter policy "admin atualiza tipo" on public.tipos_item
  using ((select public.e_admin())
         and empresa_id = any (array (select public.empresas_de_admin())))
  with check ((select public.e_admin())
              and empresa_id = any (array (select public.empresas_de_admin())));

-- motivos (0070 a leitura; 0063 a escrita)
alter policy "leitura operador" on public.motivos
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

alter policy "admin insere" on public.motivos
  with check ((select public.e_admin())
              and empresa_id = any (array (select public.empresas_de_admin())));

alter policy "admin atualiza" on public.motivos
  using ((select public.e_admin())
         and empresa_id = any (array (select public.empresas_de_admin())))
  with check ((select public.e_admin())
              and empresa_id = any (array (select public.empresas_de_admin())));

alter policy "admin apaga" on public.motivos
  using ((select public.e_admin())
         and empresa_id = any (array (select public.empresas_de_admin())));

-- kits_modelos (0070 a leitura; 0063 a escrita)
alter policy "leitura operador" on public.kits_modelos
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

alter policy "admin insere" on public.kits_modelos
  with check ((select public.e_admin())
              and empresa_id = any (array (select public.empresas_de_admin())));

alter policy "admin atualiza" on public.kits_modelos
  using ((select public.e_admin())
         and empresa_id = any (array (select public.empresas_de_admin())))
  with check ((select public.e_admin())
              and empresa_id = any (array (select public.empresas_de_admin())));

alter policy "admin apaga" on public.kits_modelos
  using ((select public.e_admin())
         and empresa_id = any (array (select public.empresas_de_admin())));

-- filiais (0070 a leitura; 0063 a escrita)
alter policy "leitura operador" on public.filiais
  using ((select public.papel_atual()) is not null
         and empresa_id = any (array (select public.empresas_do_membro())));

alter policy "admin insere" on public.filiais
  with check ((select public.e_admin())
              and empresa_id = any (array (select public.empresas_de_admin())));

alter policy "admin atualiza" on public.filiais
  using ((select public.e_admin())
         and empresa_id = any (array (select public.empresas_de_admin())))
  with check ((select public.e_admin())
              and empresa_id = any (array (select public.empresas_de_admin())));

alter policy "admin apaga" on public.filiais
  using ((select public.e_admin())
         and empresa_id = any (array (select public.empresas_de_admin())));

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   docs/f66-evidencias/impressao-policies.sql: as vinte e uma desta migration com o termo; o relfilenode das 20 IGUAL;
--   a prova conta a conta REAL do lote com 0 divergência.
--
-- ROLLBACK (supabase/rollback/F66-desfaz.sql, passo 4): cada policy de volta ao texto de antes (o piso sozinho), por
-- `alter policy` literal, na mesma ordem de tabelas deste arquivo.
