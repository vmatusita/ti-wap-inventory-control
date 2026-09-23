-- =============================================================================
-- 0167_fk_composta_cadastros.sql — F65 (23/09/2026): as 5 FKs dos cadastros e registros viram COMPOSTAS, com o MESMO nome
-- =============================================================================
-- classe: ADITIVA (FKs trocadas por compostas de mesmo nome e mesmas ações; nenhuma tupla reescrita)
--
-- A segunda família da F65 (a primeira, o acervo, é a 0166): o colaborador, o item, o apelido de unidade, a trilha do
-- import e o snapshot de relatório passam a apontar SÓ para filial (ou tipo de item) da MESMA empresa — o banco recusa
-- com 23503 o que apontar para outra, sem policy nenhuma:
--   · `colaboradores_filial_id_fkey`       (empresa_id, filial_id) → filiais (empresa_id, id)
--   · `itens_tipo_id_fkey`                 (empresa_id, tipo_id)   → tipos_item (empresa_id, id)
--   · `unidades_apelidos_filial_id_fkey`   (empresa_id, filial_id) → filiais (empresa_id, id)
--   · `import_logs_filial_id_fkey`         (empresa_id, filial_id) → filiais (empresa_id, id)
--   · `relatorios_gerados_filial_id_fkey`  (empresa_id, filial_id) → filiais (empresa_id, id)
-- Os pais têm `unique (empresa_id, id)`: `filiais` desde a F62 (0155), `tipos_item` desde a 0165.
--
-- O MESMO NOME, NO MESMO COMANDO (o porquê está na 0166): `relatorios_gerados_filial_id_fkey` é citada pelo NOME como
-- dica de embed (`filial:filiais!relatorios_gerados_filial_id_fkey(nome, slug)`, formas/relatorios-gerados.ts), e
-- `import_logs`→`filiais` e `itens`→`tipos_item` são embutidas SEM dica — composta com outro nome quebraria a primeira
-- (PGRST200) e composta ao lado da simples tornaria as outras ambíguas (PGRST201), com o app velho no ar. Um `alter
-- table` por tabela, `drop constraint X` + `add constraint X …` como subcomandos: o nome se mantém e não existe o
-- instante sem a FK.
--
-- AS MESMAS AÇÕES: as cinco são `ON UPDATE/ON DELETE NO ACTION`, `MATCH SIMPLE`, não diferidas (o catálogo "antes"). Três
-- colunas filhas são anuláveis — `colaboradores.filial_id` (colaborador sem filial), `itens.tipo_id` e
-- `relatorios_gerados.filial_id` (nulo = o Consolidado): com elas nulas a composta não confere, igual a hoje (MATCH
-- SIMPLE). Validada direto; a contagem do "antes" deu 0 nas cinco, nos dois bancos.
--
-- O LOCK: tabelas frias (a maior, `colaboradores`, 41 linhas em produção). `DROP CONSTRAINT` toma ACCESS EXCLUSIVE no
-- filho e no pai (`filiais`, `tipos_item`) até o commit; milissegundos. A ordem: `colaboradores` e `itens` (lidos no
-- caminho de escrita do acervo), depois os registros. `lock_timeout` de 2 s por `set`/`reset`, sem `begin`/`commit`;
-- se o lock não vier: registrar e repetir, no máximo três vezes em 30 min, sem subir o timeout nem matar sessão do app.
-- =============================================================================

set lock_timeout = '2s';

alter table public.colaboradores
  drop constraint colaboradores_filial_id_fkey,
  add constraint colaboradores_filial_id_fkey
    foreign key (empresa_id, filial_id) references public.filiais (empresa_id, id);

alter table public.itens
  drop constraint itens_tipo_id_fkey,
  add constraint itens_tipo_id_fkey
    foreign key (empresa_id, tipo_id) references public.tipos_item (empresa_id, id);

alter table public.unidades_apelidos
  drop constraint unidades_apelidos_filial_id_fkey,
  add constraint unidades_apelidos_filial_id_fkey
    foreign key (empresa_id, filial_id) references public.filiais (empresa_id, id);

alter table public.import_logs
  drop constraint import_logs_filial_id_fkey,
  add constraint import_logs_filial_id_fkey
    foreign key (empresa_id, filial_id) references public.filiais (empresa_id, id);

alter table public.relatorios_gerados
  drop constraint relatorios_gerados_filial_id_fkey,
  add constraint relatorios_gerados_filial_id_fkey
    foreign key (empresa_id, filial_id) references public.filiais (empresa_id, id);

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   notify pgrst, 'reload schema';
--   docs/f65-evidencias/impressao-catalogo.sql: as cinco compostas, validadas, com os nomes de antes; e o conferidor de
--   formas contra o banco (0 recusadas).
--
-- ROLLBACK (supabase/rollback/F65-desfaz.sql, passo 8 — as FKs de volta a SIMPLES, com os MESMOS nomes, na mesma ordem):
--   alter table public.colaboradores drop constraint colaboradores_filial_id_fkey,
--     add constraint colaboradores_filial_id_fkey foreign key (filial_id) references public.filiais (id);
--   … e as outras quatro, na mesma forma (itens → tipos_item (id); as três → filiais (id)).
