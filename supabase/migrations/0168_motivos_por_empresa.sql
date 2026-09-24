-- =============================================================================
-- 0168_motivos_por_empresa.sql — F65 (23/09/2026): a PK de `motivos` por empresa, junto com a FK de `movimentacoes`
-- =============================================================================
-- classe: ADITIVA (PK e FK trocadas pela forma por empresa, com os MESMOS nomes; nenhuma tupla reescrita)
--
-- `motivos` tem PK NATURAL: `motivos_pkey (codigo)`. Com ela, duas empresas não podem ter um motivo de mesmo código — e
-- o código é vocabulário DE UMA EMPRESA (o De→Para dela). A decisão 2 do Johnny na F64 trouxe para cá a troca da chave
-- para `(empresa_id, codigo)` JUNTO da FK de `movimentacoes`, que hoje é `movimentacoes_motivo_fkey (motivo) references
-- motivos (codigo)` e passa a ser COMPOSTA: `(empresa_id, motivo) → motivos (empresa_id, codigo)` — uma movimentação da
-- empresa A não aceita motivo que só existe na B (23503).
--
-- ██████████████████████████████████████████████████████████████████████████████████████████████████████████████████
-- ██  O TRIO VAI NUMA MIGRATION SÓ, NESTA ORDEM (fato 11). A PK só cai DEPOIS da FK: `drop constraint motivos_pkey`  ██
-- ██  com a FK de `movimentacoes` dependendo do índice dela falha sem `cascade` — e `cascade` tornaria a migration    ██
-- ██  DESTRUTIVA (e derrubaria a FK calado). Então: (1) derrubar a FK; (2) trocar a PK, com o MESMO nome, no mesmo    ██
-- ██  `alter table`; (3) recriar a FK COMPOSTA com o MESMO nome. No `apply_migration` do MCP é UMA transação: ninguém ██
-- ██  vê o intervalo sem a FK. Errar aqui não dá mensagem de UNIQUE — dá recusa de INSERT na tabela mais quente.      ██
-- ██████████████████████████████████████████████████████████████████████████████████████████████████████████████████
--
-- O MESMO NOME: `movimentacoes_motivo_fkey` é citada pelo NOME como dica de embed em dois lugares
-- (`motivo_rel:motivos!movimentacoes_motivo_fkey(rotulo)` em formas/termos.ts e `motivoRotulo:motivos!movimentacoes_motivo_fkey(rotulo)`
-- em formas/relatorios.ts) — com outro nome, os dois quebrariam (PGRST200). `motivos_pkey` mantém o nome da PK.
-- AS MESMAS AÇÕES: `ON UPDATE/ON DELETE NO ACTION`, `MATCH SIMPLE`, não diferida (o catálogo "antes"). `movimentacoes.motivo`
-- é anulável: com ele nulo a composta não confere, igual a hoje. A PK nova: `empresa_id` e `codigo` são `not null`; com
-- uma empresa só, `codigo` já era único — a contagem do "antes" deu 0 duplicata e 0 órfã, nos dois bancos.
--
-- OS LEITORES POR CÓDIGO SOZINHO continuam certos com UMA empresa (fato 11): o UPDATE `.eq('codigo', …)` de
-- `actions/admin.ts:760-763`, e o join por código de `rel_por_motivo_filiais`/`rel_resumo_filiais` (0143). Com DUAS
-- empresas eles ficam errados — o UPDATE gravaria nas duas —, e isso é da F66 (a leitura) e da F67 (a escrita). O gatilho
-- do kit (0164) já lê `(codigo, empresa_id)`.
--
-- O LOCK: a ordem do app — a escrita de `movimentacoes` confere a FK em `motivos` (a movimentação primeiro, o motivo
-- depois). `DROP CONSTRAINT` da FK toma ACCESS EXCLUSIVE em `movimentacoes` e `motivos`; a troca da PK, ACCESS EXCLUSIVE
-- em `motivos` (14 linhas); a FK nova valida varrendo `movimentacoes` (3.631 linhas em produção). Milissegundos, até o
-- commit. `lock_timeout` de 2 s por `set`/`reset`, sem `begin`/`commit`; se o lock não vier: registrar e repetir, no
-- máximo três vezes em 30 min, sem subir o timeout nem matar sessão do app.
-- =============================================================================

set lock_timeout = '2s';

-- (1) a FK sai primeiro — senão a PK não cai sem `cascade`
alter table public.movimentacoes
  drop constraint movimentacoes_motivo_fkey;

-- (2) a PK por empresa, com o MESMO nome, no mesmo comando
alter table public.motivos
  drop constraint motivos_pkey,
  add constraint motivos_pkey primary key (empresa_id, codigo);

-- (3) a FK composta, com o MESMO nome e as mesmas ações
alter table public.movimentacoes
  add constraint movimentacoes_motivo_fkey
    foreign key (empresa_id, motivo) references public.motivos (empresa_id, codigo);

reset lock_timeout;

-- ---------- VERIFICAÇÃO PÓS-APPLY (só catálogo) ----------
--   notify pgrst, 'reload schema';
--   docs/f65-evidencias/impressao-catalogo.sql: `motivos_pkey` = PRIMARY KEY (empresa_id, codigo);
--   `movimentacoes_motivo_fkey` = FOREIGN KEY (empresa_id, motivo) REFERENCES motivos(empresa_id, codigo), validada;
--   docs/f65-evidencias/impressao-tenant.sql: `motivos` com pk `empresa_id,codigo` e chave `codigo` — relfilenode e md5
--   de (chave, xmin) IGUAIS aos do "antes".
--
-- ROLLBACK (supabase/rollback/F65-desfaz.sql, passo 7 — o trio na ordem INVERSA, e só se a PK estiver na forma nova):
--   alter table public.movimentacoes drop constraint movimentacoes_motivo_fkey;
--   alter table public.motivos drop constraint motivos_pkey, add constraint motivos_pkey primary key (codigo);
--   alter table public.movimentacoes add constraint movimentacoes_motivo_fkey
--     foreign key (motivo) references public.motivos (codigo);
--   (com DUAS empresas repetindo um código, a PK global não volta — depois da F73, o rollback exige que o dado da
--   segunda empresa já tenha saído)
