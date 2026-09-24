-- =============================================================================
-- 0166_fk_composta_acervo.sql — F65 (23/09/2026): as 17 FKs do ACERVO viram COMPOSTAS, com o MESMO nome
-- =============================================================================
-- classe: ADITIVA (FKs trocadas por compostas de mesmo nome e mesmas ações; nenhuma tupla reescrita)
--
-- A camada que SOBREVIVE À FALHA DA RLS: depois desta migration, um ativo, uma movimentação, uma pendência, um lançamento
-- ou uma anotação da empresa A não aponta para filial, ativo, colaborador, item, movimentação ou pendência da empresa B —
-- o banco recusa com 23503, sem policy nenhuma, para qualquer papel (inclusive `postgres` e o service role) e dentro de
-- qualquer função `security definer`. Isso inclui a transferência: `movimentacao_transicionar` (0150) grava
-- `ativos.filial_id` com o `filial_destino_id` que vem do formulário, e a FK composta `ativos_filial_id_fkey` recusa a
-- filial de destino de outra empresa (fato 14 da ordem).
--
-- AS 17 (fato 4): `ativos` → filiais, ativos (o antecessor); `movimentacoes` → ativos, colaboradores, movimentacoes (o
-- estorno), filiais (origem e destino) — o motivo vai com a PK de `motivos`, 0168; `pendencias_item` → ativos, filiais,
-- movimentacoes; `lancamentos_item` → colaboradores, lancamentos_item (o estorno), filiais, itens, movimentacoes,
-- pendencias_item; `anotacoes` → ativos. Os pais têm `unique (empresa_id, id)` desde a 0165 (filiais, 0155).
--
-- ██████████████████████████████████████████████████████████████████████████████████████████████████████████████████
-- ██  O MESMO NOME, NO MESMO COMANDO. O app embute recursos pelo PostgREST, e SETE destas FKs são citadas pelo NOME ██
-- ██  como dica (`ativos!movimentacoes_ativo_id_fkey(…)`, em src/lib/queries/formas/**). Composta com OUTRO nome     ██
-- ██  → a dica quebra (PGRST200); composta AO LADO da simples → todo embed sem dica daquele par vira ambíguo         ██
-- ██  (PGRST201) — e as duas coisas acontecem no instante em que o cache de esquema recarrega, com o app VELHO no ar  ██
-- ██  (fato 6). Por isso cada tabela filha tem UM `alter table` com o `drop constraint X` e o `add constraint X …`    ██
-- ██  como subcomandos: o Postgres executa os `drop` numa passada anterior aos `add` do mesmo comando, o nome se      ██
-- ██  mantém, e nunca existe o instante sem a FK (nem no CI, onde cada comando confirma sozinho).                     ██
-- ██████████████████████████████████████████████████████████████████████████████████████████████████████████████████
--
-- AS MESMAS AÇÕES (conferidas no catálogo "antes", docs/f65-evidencias/antes/impressao-catalogo.json): todas `ON UPDATE
-- NO ACTION`, `ON DELETE NO ACTION`, `MATCH SIMPLE` (o default: não se escreve). E UMA diferida:
-- `pendencias_item_movimentacao_id_fkey` é `DEFERRABLE INITIALLY DEFERRED` desde a 0050 — o gatilho de `movimentacoes`
-- abre a pendência ANTES de a movimentação existir; a composta também é diferida. MATCH SIMPLE com a coluna filha nula não
-- confere, igual a hoje (12 das 23 colunas filhas são anuláveis; `empresa_id` é `not null` nas 20).
--
-- A VALIDAÇÃO é direta (sem `not valid`): no `apply_migration` do MCP a migration é UMA transação e a separação não
-- encurtaria lock nenhum (fato 22). `add constraint … foreign key` VARRE o filho e não reescreve tupla (doc do PG 17). A
-- contagem de violações do "antes" (docs/f65-evidencias/contagem-violacoes.sql) deu 0 nas 17, nos dois bancos.
--
-- O LOCK: `DROP CONSTRAINT` de FK toma ACCESS EXCLUSIVE no filho e no pai; `ADD FOREIGN KEY`, SHARE ROW EXCLUSIVE nos
-- dois (doc do PG 17). Tudo segurado até o commit. A ORDEM é a em que o caminho de escrita do app toma os locks — a da
-- 0161: `criar_movimentacao_com_itens` trava os ATIVOS primeiro (`for update`), depois insere em `movimentacoes`, cujo
-- gatilho volta a `ativos` e abre `pendencias_item`, e só então grava em `lancamentos_item`. Por isso a família de
-- `movimentacoes` NÃO vai sozinha: começar por ela pegaria `movimentacoes` antes de `ativos`, a ordem inversa da do app
-- (PLAN-F65.md, decisão 2). `lock_timeout` de 2 s por `set`/`reset`, sem `begin`/`commit`; se o lock não vier:
-- registrar e repetir, no máximo três vezes em 30 min, sem subir o timeout nem matar sessão do app.
-- =============================================================================

set lock_timeout = '2s';

alter table public.ativos
  drop constraint ativos_filial_id_fkey,
  add constraint ativos_filial_id_fkey
    foreign key (empresa_id, filial_id) references public.filiais (empresa_id, id),
  drop constraint ativos_substitui_ativo_id_fkey,
  add constraint ativos_substitui_ativo_id_fkey
    foreign key (empresa_id, substitui_ativo_id) references public.ativos (empresa_id, id);

alter table public.movimentacoes
  drop constraint movimentacoes_ativo_id_fkey,
  add constraint movimentacoes_ativo_id_fkey
    foreign key (empresa_id, ativo_id) references public.ativos (empresa_id, id),
  drop constraint movimentacoes_colaborador_id_fkey,
  add constraint movimentacoes_colaborador_id_fkey
    foreign key (empresa_id, colaborador_id) references public.colaboradores (empresa_id, id),
  drop constraint movimentacoes_estorno_de_fkey,
  add constraint movimentacoes_estorno_de_fkey
    foreign key (empresa_id, estorno_de) references public.movimentacoes (empresa_id, id),
  drop constraint movimentacoes_filial_id_fkey,
  add constraint movimentacoes_filial_id_fkey
    foreign key (empresa_id, filial_id) references public.filiais (empresa_id, id),
  drop constraint movimentacoes_filial_destino_id_fkey,
  add constraint movimentacoes_filial_destino_id_fkey
    foreign key (empresa_id, filial_destino_id) references public.filiais (empresa_id, id);

alter table public.pendencias_item
  drop constraint pendencias_item_ativo_id_fkey,
  add constraint pendencias_item_ativo_id_fkey
    foreign key (empresa_id, ativo_id) references public.ativos (empresa_id, id),
  drop constraint pendencias_item_filial_id_fkey,
  add constraint pendencias_item_filial_id_fkey
    foreign key (empresa_id, filial_id) references public.filiais (empresa_id, id),
  drop constraint pendencias_item_movimentacao_id_fkey,
  add constraint pendencias_item_movimentacao_id_fkey
    foreign key (empresa_id, movimentacao_id) references public.movimentacoes (empresa_id, id)
    deferrable initially deferred;

alter table public.lancamentos_item
  drop constraint lancamentos_item_colaborador_id_fkey,
  add constraint lancamentos_item_colaborador_id_fkey
    foreign key (empresa_id, colaborador_id) references public.colaboradores (empresa_id, id),
  drop constraint lancamentos_item_estorna_id_fkey,
  add constraint lancamentos_item_estorna_id_fkey
    foreign key (empresa_id, estorna_id) references public.lancamentos_item (empresa_id, id),
  drop constraint lancamentos_item_filial_id_fkey,
  add constraint lancamentos_item_filial_id_fkey
    foreign key (empresa_id, filial_id) references public.filiais (empresa_id, id),
  drop constraint lancamentos_item_item_id_fkey,
  add constraint lancamentos_item_item_id_fkey
    foreign key (empresa_id, item_id) references public.itens (empresa_id, id),
  drop constraint lancamentos_item_movimentacao_id_fkey,
  add constraint lancamentos_item_movimentacao_id_fkey
    foreign key (empresa_id, movimentacao_id) references public.movimentacoes (empresa_id, id),
  drop constraint lancamentos_item_pendencia_item_id_fkey,
  add constraint lancamentos_item_pendencia_item_id_fkey
    foreign key (empresa_id, pendencia_item_id) references public.pendencias_item (empresa_id, id);

alter table public.anotacoes
  drop constraint anotacoes_ativo_id_fkey,
  add constraint anotacoes_ativo_id_fkey
    foreign key (empresa_id, ativo_id) references public.ativos (empresa_id, id);

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   notify pgrst, 'reload schema';
--   docs/f65-evidencias/impressao-catalogo.sql: as 17 com `FOREIGN KEY (empresa_id, x) REFERENCES <pai>(empresa_id, id)`,
--   validadas, a de pendencias_item→movimentacoes `DEFERRABLE INITIALLY DEFERRED`; impressao-tenant.sql antes × depois
--   com relfilenode e md5 de (chave, xmin) IGUAIS; e o conferidor de formas contra o banco (0 recusadas).
--
-- ROLLBACK (supabase/rollback/F65-desfaz.sql, passo 8 — as FKs de volta a SIMPLES, com os MESMOS nomes e ações, na
-- mesma ordem de tabelas do apply):
--   alter table public.ativos drop constraint ativos_filial_id_fkey,
--     add constraint ativos_filial_id_fkey foreign key (filial_id) references public.filiais (id), … (e as outras 16);
--   pendencias_item_movimentacao_id_fkey volta `deferrable initially deferred`.
