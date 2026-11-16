-- =====================================================================================================================
-- 0194_caminho_backup_por_empresa.sql — F67B (16/11/2026): as primitivas do caminho de backup POR EMPRESA (EXPANSÃO, lote 1)
-- =====================================================================================================================
-- classe: ADITIVA (cinco funções NOVAS, imutáveis, sem tabela, policy nem linha; os montadores antigos ficam até a 0199)
--
-- O bucket `backups-import` passa a decidir pela EMPRESA DO CAMINHO (docs/PLAN-F67B.md §2, decisões 1 a 3). Nascem:
--
--   empresa_do_caminho_backup(text) → uuid   o uuid do 2º segmento quando o nome casa UMA das quatro formas NOVAS
--                                            FECHADAS (import, reset, conflito, cópia do apagar ativo; com as cópias
--                                            de .docx sob <raiz>/termos/); NULL fora delas. É o que as policies leem
--                                            (a 0195 e a 0199) — no lugar de storage.foldername, que o Postgres do CI
--                                            não tem (fato 23 da ordem: um segundo lugar para envelhecer).
--   caminho_backup_legado(text) → boolean    verdadeira SÓ para as formas ANTIGAS da lista FECHADA (decisão 16/11-1
--                                            do Johnny): a histórica <slug>/<carimbo>.json, import/filial-N, reset/
--                                            <bloco>/<global|filial-N>, conflito/<digest> e ativo/<id>, com as cópias.
--                                            NUNCA "qualquer caminho sem empresa" (sabotagem E). As duas listas são
--                                            disjuntas; os 29 objetos de produção casam a antiga, 0 a nova (medido).
--   prefixo_backup_import(uuid, smallint)    os espelhos SQL de src/lib/storage/caminho.ts, com a empresa como 1º
--   prefixo_backup_reset(uuid, text, smallint) parâmetro, AO LADO dos antigos (de mesmo nome e aridade menor), que
--   prefixo_backup_conflito(uuid)            saem na contração (0199). O "tudo" do reset vira "tudo" (era "global"):
--                                            desde a F67 o tudo é a empresa.
--
-- As formas, byte a byte iguais às de caminho.ts (FORMAS_NOVAS/FORMAS_ANTIGAS/FAMILIAS_RESERVADAS) — a trava é
-- src/lib/storage/caminho.test.ts §3, que lê o corpo VIGENTE. As duas primeiras são executáveis por authenticated (as
-- policies as chamam com o papel de quem pede); os montadores, por ninguém (só as security definer os chamam).
-- Nada aqui muda resposta nenhuma: nenhuma policy as cita ainda.
-- =====================================================================================================================

set lock_timeout = '2s';

create function public.empresa_do_caminho_backup(p_nome text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
           when p_nome ~ '^import/empresa-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/filial-[0-9]+/[^/]+(\.json|/termos/[^/]+)$'
             or p_nome ~ '^reset/empresa-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/(acervo|itens)/(tudo|filial-[0-9]+)/[^/]+(\.json|/termos/[^/]+)$'
             or p_nome ~ '^conflito/empresa-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/[0-9a-f]{32}/([^/]+\.json|termos/[^/]+)$'
             or p_nome ~ '^ativo/empresa-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/[0-9a-fA-F-]{36}/termos/[^/]+$'
             then substring(p_nome from '/empresa-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/')::uuid
         end
$$;

create function public.caminho_backup_legado(p_nome text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
           p_nome ~ '^import/filial-[0-9]+/[^/]+(\.json|/termos/[^/]+)$'
           or p_nome ~ '^reset/(acervo|itens)/(global|filial-[0-9]+)/[^/]+(\.json|/termos/[^/]+)$'
           or p_nome ~ '^conflito/[0-9a-f]{32}/([^/]+\.json|termos/[^/]+)$'
           or p_nome ~ '^ativo/[0-9a-fA-F-]{36}/termos/[^/]+$'
           or (p_nome ~ '^[a-z0-9][a-z0-9-]*/[^/]+\.json$' and p_nome !~ '^(import|reset|conflito|ativo|orfao)/'),
           false)
$$;

create function public.prefixo_backup_import(p_empresa uuid, p_filial smallint)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'import/empresa-' || p_empresa::text || '/filial-' || p_filial::text || '/'
$$;

create function public.prefixo_backup_reset(p_empresa uuid, p_bloco text, p_filial smallint)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'reset/empresa-' || p_empresa::text || '/' || p_bloco || '/' || case when p_filial is null then 'tudo' else 'filial-' || p_filial::text end || '/'
$$;

create function public.prefixo_backup_conflito(p_empresa uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'conflito/empresa-' || p_empresa::text || '/'
$$;

comment on function public.empresa_do_caminho_backup(text) is
  'F67B (0194): a empresa DONA de um objeto de backups-import — o uuid do 2º segmento quando o nome casa uma das quatro formas NOVAS fechadas (import, reset, conflito, cópia do apagar ativo, com as cópias de .docx); NULL fora delas. Espelho de empresaDoCaminhoBackup (src/lib/storage/caminho.ts), conferido por caminho.test.ts.';
comment on function public.caminho_backup_legado(text) is
  'F67B (0194): a CLÁUSULA LEGADA fechada (decisão 16/11-1 do Johnny) — verdadeira só para as formas ANTIGAS que existem ou existiram (a histórica, import/filial-N, reset/<bloco>/<global|filial-N>, conflito/<digest>, ativo/<id>, com as cópias). Nunca "qualquer caminho sem empresa". Só a policy de LEITURA de backups-import a cita, para o admin da WAP.';
comment on function public.prefixo_backup_import(uuid, smallint) is
  'F67B (0194): o prefixo do backup do import na forma NOVA (import/empresa-<uuid>/filial-<id>/). Espelho de prefixoBackupImport (caminho.ts).';
comment on function public.prefixo_backup_reset(uuid, text, smallint) is
  'F67B (0194): o prefixo do backup do reset na forma NOVA (reset/empresa-<uuid>/<bloco>/<tudo|filial-N>/). Espelho de prefixoBackupReset (caminho.ts).';
comment on function public.prefixo_backup_conflito(uuid) is
  'F67B (0194): o prefixo do backup da mesa de conflitos na forma NOVA (conflito/empresa-<uuid>/). Espelho de prefixoBackupConflito (caminho.ts).';

revoke all on function public.empresa_do_caminho_backup(text) from public, anon, service_role;
revoke all on function public.caminho_backup_legado(text) from public, anon, service_role;
grant execute on function public.empresa_do_caminho_backup(text) to authenticated;
grant execute on function public.caminho_backup_legado(text) to authenticated;
revoke all on function public.prefixo_backup_import(uuid, smallint) from public, anon, authenticated, service_role;
revoke all on function public.prefixo_backup_reset(uuid, text, smallint) from public, anon, authenticated, service_role;
revoke all on function public.prefixo_backup_conflito(uuid) from public, anon, authenticated, service_role;

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   as cinco com to_regprocedure(...) não nulo; o md5 do prosrc de cada uma = o do CI; as outras funções e as policies
--   byte a byte iguais ao "antes"; empresa_do_caminho_backup/caminho_backup_legado executáveis só por authenticated.
--
-- ROLLBACK (supabase/rollback/F67B-desfaz.sql, na ordem inversa 0199 → 0194): derrubar as cinco (sem cascade — nada as cita até a 0195).
