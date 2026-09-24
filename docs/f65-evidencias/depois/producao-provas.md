# F65 — o apply em PRODUÇÃO e as provas (24/09/2026)

Projeto `pbtjcalbmepmrqzprusb`. Só catálogo, contagem e hash; nenhum id, código, slug, nome ou texto de linha. O ensaio
veio antes, com as mesmas provas (`ensaio-provas.md`). Dentro das 24 h do SHA congelado (`a525a9a`, 23/09 20:02 -03):
o apply foi das 08:34 às 08:40 -03 (11:34–11:40 UTC) de 24/09, ~12,6 h depois.

## Logo antes (~08:33 -03)

- Ledger: a última `kit_motivo_da_empresa` (a `0164`) — nada da F65.
- `contagem-violacoes.sql`: **0 em tudo** — 23 FKs, 21 uniques; `termos_gerados` 123, 0 com movimentação ou ativo de outra
  empresa, 0 com id inexistente; `empresas` 1.
- `impressao-tenant.sql` (corte `''`): as 20 IDÊNTICAS ao "antes" de 23/09 (`antes/impressao-tenant-producao.json`) —
  `relfilenode` e os dois md5; `corte_para_o_depois` = **`26092`**.
- Catálogo (`impressao-catalogo.sql`): igual ao "antes" de 23/09 — `fks` `1541f155…` (23 simples), `uniques`
  `bc692b3b…` (37, 1 com `empresa_id`), `gatilhos` `45f69cb8…` (8), `md5_sem_as_da_f65` `689fbd32…`, advisory 12/16.
- Policies: `public` 54 · `886118ad…`; `storage` 8 · `f116b8d0…`; 49 nas 20 de negócio, 0 citam `empresa_id`.
- A ACL da diagonal ANTES (`exatidao-pos-apply.sql`, só ela existe): `vocabulario_unidades_guarda` INVOKER,
  `service_role` executa, `anon`/`authenticated` não — a mesma que o ensaio mostra depois do `create or replace`.
- Advisor de segurança: 6 · 34 · 1.

## O apply — `apply_migration` do MCP, uma por chamada, o texto EXATO do arquivo, na ordem

`pais_do_tenant` (0165) → `fk_composta_acervo` (0166) → `fk_composta_cadastros` (0167) → `motivos_por_empresa` (0168) →
`vocabulario_import_por_empresa` (0169) → `unicidade_por_empresa` (0170) → `snapshot_por_empresa` (0171) →
`colaboradores_nome_chave_por_empresa` (0172) → `guarda_empresa` (0173). **As nove com sucesso na primeira tentativa**,
nenhum `lock_timeout` estourado. Versões no ledger (hora local, -03): `20260924083446`, `…083536`, `…083618`,
`…083655`, `…083740`, `…083800`, `…083839`, `…083843`, `…084001` (e a `0174`, depois do deploy, `…084939`). Depois:
`notify pgrst, 'reload schema'`.

## As provas

- **Nenhuma tupla reescrita** (`impressao-tenant.sql`, corte `26092`): `relfilenode` **IGUAL nas 20, sem exceção**. Os dois
  md5 IGUAIS em **19**; a `pk` mudou só nas quatro esperadas, com a `chave` igual. A exceção é **`colaboradores`,
  explicada só pela janela**: 41 → 42 linhas, janela = **1** (uma linha com `xmin` a partir do corte — o app no ar
  cadastrou um colaborador durante o apply; uma reescrita daria janela = 42). A prova, com o MESMO molde do instrumento
  restrito às linhas FORA da janela: **41 linhas, `md5_chave_xmin` `9f4b287a…` e `md5_conteudo` `eb57e7f6…` — os do
  "antes"**. (Uma primeira tentativa, com a chave como escalar em vez do `jsonb_agg` do instrumento, deu outro
  `md5_chave_xmin` com o mesmo `md5_conteudo` — a fórmula, não o dado; refeita na forma exata.)
- **O catálogo** (`impressao-catalogo.sql`): **idêntico ao do ensaio depois** — `fks` `ed015fdd…` (23 compostas,
  validadas, os nomes e ações de antes, a `pendencias_item_movimentacao_id_fkey` diferida), `uniques` `06c37cc8…` (45; 22
  com `empresa_id`), `pais` 8, `gatilhos` `8f183cdf…` (49), `funcoes.md5_todas` `abf6a4b1…`, `md5_sem_as_da_f65`
  **`689fbd32…` = o "antes"**, advisory 12/16 com as 11 de fora da fase iguais ao antes. `fks`, `gatilhos` e `pais` iguais
  aos do CI do SHA congelado; `uniques` fecha com o CI depois da `0174`.
- **As policies**: `public` 54 · `886118ad…`; `storage` 8 · `f116b8d0…` — **iguais**.
- **A exatidão** (`exatidao-pos-apply.sql` × `exatidao-esperada.json`): **tudo igual** — `guarda_empresa`
  `67f660c8…`/`ffc24456…`, `termo_da_empresa` `e1675592…`/`20ab59a4…`, `vocabulario_unidades_guarda`
  `cbe9b7a3…`/`32ea5ef2…`, os comentários de índice `30478cdf…` e `bcc390fb…`; as duas funções novas INVOKER e
  **não executáveis** por `anon`, `authenticated` nem `service_role`; a diagonal com a ACL de antes.
- **Advisors — segurança:** 6 · 34 · 1 — **nada novo**. **Performance:** `unindexed_foreign_keys` **31 → 39**, o MESMO
  delta por nome do ensaio (saem as 14 `*_empresa_id_fkey` agora cobertas pela frente; entram 22 das 23 compostas;
  `relatorios_gerados_filial_id_fkey` já estava). `no_primary_key` 1, `unused_index` 8, `multiple_permissive_policies` 1.
- **O conferidor de formas** (`conferidor-producao.json`, SHA `2c681a0`, árvore limpa): **271 pontos · 100.549 linhas · 0
  recusadas · 0 com erro · 0 reprovados** — inclusive `itens.saldo-colaborador`, que o ensaio não exercitava.
- **O smoke** (`smoke-prod-pos-apply.txt`, o app no ar ainda na 1.69.0): **109 OK · 1 aviso · 0 n/a · 0 falha** — o
  aviso é o antigo de `kits_modelos` sem kit cadastrado (o mesmo das F62–F64). Entre a impressão "depois" e o smoke, o
  app registrou mais uma movimentação (3.631 → 3.632): o app velho escrevendo no esquema novo, com as FKs compostas.
