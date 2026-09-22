-- =============================================================================
-- 0155_filiais_empresa.sql — F62 (22/09/2026): a hierarquia empresa → filial
-- =============================================================================
-- classe: ADITIVA (coluna nova com default CONSTANTE; nenhum `update`, nenhuma tupla reescrita)
--
-- Decisão i do Johnny (22/09/2026): `filiais.empresa_id` nasce NA F62 — é a "hierarquia
-- empresa → filial" do objetivo da ficha, e a coluna que a forma-alvo da MATRIZ já usa
-- (`unidades_de_escrita()` junta `f.empresa_id = m.empresa_id`). Desvio declarado do "Não
-- entra: `empresa_id` em tabela de negócio" da ficha; a F64 (que listava `filiais`) encontra
-- a coluna pronta e só tira o default.
--
-- ⚠ SEM `update` DE BACKFILL. `add column … not null default <expressão não-volátil>` é
-- preenchido pelo Postgres 11+ SEM reescrever tupla e sem disparar gatilho: o valor fica no
-- catálogo (`attmissingval`) e vale para as linhas que já existem. O default é
-- `public.empresa_legada()` (0152): `stable`, sem parâmetro, devolve constante — a fonte
-- única da empresa legada. O "Nova filial" continua funcionando sem código novo, porque o
-- default preenche.
--
-- O DEFAULT FICA ATÉ A F64 (escrito no comentário da coluna e na ata da F62): é a rede da
-- migração, não do produto. A F64 o tira quando o app passar a informar a empresa.
--
-- `unique (empresa_id, id)` ENTRA AQUI, e não na F65: é o alvo da FK composta
-- `(empresa_id, filial_id)` de `operador_filiais` (0156), que faz o BANCO recusar o vínculo
-- com filial de outra empresa. Com 6 filiais, custa nada; e `operador_filiais` é
-- reestruturada nesta fase. A F65 encontra este unique pronto (ela o pede em toda tabela que
-- pode ser pai).
--
-- ROLLBACK, em prosa (docs/PLAN-F62.md §5.1, passo 5; rodável em
-- supabase/rollback/F62-2-desfaz.sql, bloco 0155): derrubar o unique e a coluna, DEPOIS de a
-- 0156 ter sido desfeita (a FK composta de `operador_filiais` aponta para o unique).
-- =============================================================================

alter table public.filiais
  add column empresa_id uuid not null default public.empresa_legada()
    references public.empresas (id);

alter table public.filiais
  add constraint filiais_empresa_id_uidx unique (empresa_id, id);

comment on column public.filiais.empresa_id is
  'F62 (0155): a EMPRESA dona desta filial (a hierarquia empresa → filial). Default public.empresa_legada() (a WAP) ATÉ A F64 — é a rede da migração, não do produto: a F64 tira o default quando o app passar a informar a empresa. Preenchida sem update (default não-volátil do PG 11+).';

-- ---------- VERIFICAÇÃO PÓS-APPLY (só contagens) ----------
--   select count(*) as filiais, count(*) filter (where empresa_id = public.empresa_legada()) as da_wap
--     from public.filiais;
--   esperado: filiais = da_wap = 6.
--   select column_default, is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'filiais' and column_name = 'empresa_id';
--   esperado: empresa_legada() · NO.
