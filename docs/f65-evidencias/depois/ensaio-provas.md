# F65 — o apply no ENSAIO e as provas (24/09/2026)

Projeto `sgmvldiizsrjbxzzpmhh`. Retomada pedida pelo Johnny ("Retome a F65 pela Frente G, passo 5, a partir do
docs/RELATORIO-F65.md §1.2"). Só catálogo, contagem e hash; nenhum id, código, slug, nome ou texto de linha.

## Logo antes (24/09, ~08:15 -03)

(As horas deste arquivo e as versões do ledger estão no fuso de Brasília, -03 — a versão que o `apply_migration` grava
é a hora local; em UTC, somar 3 h.)

- Ledger: 161 linhas, a última `kit_motivo_da_empresa` (a `0164`).
- `contagem-violacoes.sql`: **0 em tudo** — 23 FKs, 21 uniques, 2 termos coerentes, 1 empresa.
- `impressao-tenant.sql` (corte `''`): as 20 IDÊNTICAS ao "antes" das 14h de 23/09 (`relfilenode` e os dois md5);
  `corte_para_o_depois` = **`13300`**.

## O apply — `apply_migration` do MCP, uma migration por chamada, o texto EXATO do arquivo

| ordem | arquivo | `name` no ledger | versão no ledger | resultado |
|---|---|---|---|---|
| 1 | `0165_pais_do_tenant.sql` | `pais_do_tenant` | `20260924081857` | ✅ |
| 2 | `0166_fk_composta_acervo.sql` | `fk_composta_acervo` | `20260924081932` | ✅ |
| 3 | `0167_fk_composta_cadastros.sql` | `fk_composta_cadastros` | `20260924081957` | ✅ |
| 4 | `0168_motivos_por_empresa.sql` | `motivos_por_empresa` | `20260924082022` | ✅ |
| 5 | `0169_vocabulario_import_por_empresa.sql` | `vocabulario_import_por_empresa` | `20260924082043` | ✅ |
| 6 | `0170_unicidade_por_empresa.sql` | `unicidade_por_empresa` | `20260924082257` | ✅ |
| 7 | `0171_snapshot_por_empresa.sql` | `snapshot_por_empresa` | `20260924082325` | ✅ |
| 8 | `0172_colaboradores_nome_chave_por_empresa.sql` | `colaboradores_nome_chave_por_empresa` | `20260924082351` | ✅ |
| 9 | `0173_guarda_empresa.sql` | `guarda_empresa` | `20260924082510` | ✅ |

Nenhuma espera de lock (nenhum `lock_timeout` estourou; nenhuma repetição). Ledger depois: **170 linhas** (171 com a
`0174`, versão `20260924084903`, aplicada depois do deploy — `pos-deploy.md`). Depois: `notify pgrst, 'reload schema'`.

## As provas

- **Nenhuma tupla reescrita** (`impressao-tenant.sql`, corte `13300`; `impressao-tenant-ensaio.json`): nas **20**,
  `relfilenode`, `md5_chave_xmin` e `md5_conteudo` **IGUAIS** aos do antes; janela **0** em todas. A `pk` mudou só nas
  quatro esperadas (`motivos` → `empresa_id,codigo`; `import_prefixos_patrimonio` → `empresa_id,prefixo`;
  `import_termos_categoria`/`import_termos_estado` → `empresa_id,termo`), com a `chave` do md5 igual.
- **O catálogo** (`catalogo-ensaio.json`): 23 FKs de negócio **compostas**, validadas, com os nomes e ações de antes
  (`pendencias_item_movimentacao_id_fkey` segue `DEFERRABLE INITIALLY DEFERRED`); 8 pais `(empresa_id, id)`; 49
  gatilhos; `md5` de `fks` (`ed015fdd…`), `gatilhos` (`8f183cdf…`) e `pais` **iguais aos do CI do SHA congelado**;
  `uniques` 45 × 44 do CI — a diferença é só a `0174` (os dois índices do colaborador convivem até o pós-deploy);
  `funcoes.md5_sem_as_da_f65` **igual ao antes deste banco** (`689fbd32…`); `advisory` com as 12 funções e as 16
  chamadas, as 11 de fora da fase com o md5 de antes e a diagonal com o do arquivo.
- **As policies** (`docs/f64-evidencias/impressao-policies.sql`): `public` 54 · `886118ad…`; `storage` 8 · `f116b8d0…`;
  das 20 de negócio, 49 policies, 0 citam `empresa_id` — **iguais** ao antes.
- **A exatidão** (`exatidao-pos-apply.sql` × `exatidao-esperada.json`): os cinco `prosrc`/comentários de função e os
  dois comentários de índice **iguais** aos calculados dos arquivos; `guarda_empresa` e `termo_da_empresa` INVOKER,
  `search_path=public`, **não executáveis** por `anon`, `authenticated` nem `service_role`; a diagonal INVOKER, com a
  ACL que já tinha (`create or replace` a preserva; `service_role` executa, `anon`/`authenticated` não).
- **Advisors — segurança:** `rls_enabled_no_policy` 6 · `authenticated_security_definer_function_executable` 34 ·
  `auth_leaked_password_protection` 1 — **nada novo**, nenhum objeto da fase citado.
- **Advisors — performance:** `unindexed_foreign_keys` **31 → 39**, declarado por nome:
  - **saem 14** `*_empresa_id_fkey`, agora cobertas pela frente por um unique novo que começa por `empresa_id`:
    `ativos`, `colaboradores`, `itens`, `lancamentos_item`, `movimentacoes`, `pendencias_item`, `tipos_item` (os pais),
    `motivos` (a PK), `import_prefixos_patrimonio`, `import_termos_categoria`, `import_termos_estado` (as PKs),
    `kits_modelos`, `unidades_apelidos`, `relatorios_gerados` (os uniques de negócio);
  - **entram 22** das 23 compostas (sem índice que as cubra pela frente — a F66 mede e decide);
    `relatorios_gerados_filial_id_fkey` já estava na lista como simples e continua, composta;
  - ficam as 5 `*_empresa_id_fkey` sem unique novo (`anotacoes`, `eventos_admin`, `import_logs`, `senhas_acesso`,
    `termos_gerados`) e as 11 de autoria/operador de antes.
  `no_primary_key` 1, `unused_index` 11, `multiple_permissive_policies` 1 — iguais.
- **O conferidor de formas** (`conferidor-ensaio.json`, SHA `2c681a0`, árvore limpa): 247 pontos, 88.154 linhas,
  **0 recusadas, 0 com erro**. **1 "reprovado" por NÃO PROVADO, não por recusa:** `itens.saldo-colaborador` — a grade de
  argumentos é por colaborador, e o ensaio tem **0 colaboradores** (antes e depois — a impressão do tenant). É fato do
  alvo, não da fase; a forma é provada em produção (que tem colaboradores). Registrado na ata (m).
