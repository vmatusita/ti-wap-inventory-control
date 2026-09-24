# F65 — o merge, o deploy, a `0174` e a conferência pós-deploy (24/09/2026)

Só leitura, exceto o apply da `0174` (o passo pós-deploy da decisão 5). Nenhum id, código, slug, nome ou texto de linha.

## O merge e o deploy

- **PR #77** saiu do rascunho depois das provas de produção (`producao-provas.md`), com `verificar`, `banco-sem-docker` e
  Vercel verdes no HEAD `2c681a0`, estado `CLEAN`; **merge normal** (commit de merge, como nas fases anteriores):
  **`769b84d`**, 11:47 UTC. A descrição do PR trocou o aviso "NÃO MERGEAR antes do apply" pelo registro do apply feito.
- **`/api/saude`** às 11:48:34 UTC: `{"ok":true,"versao":"1.70.0","commit":"769b84d","banco":"ok"}`.
- A janela com o app VELHO no esquema novo: do fim do apply em produção (~11:40 UTC) ao deploy (11:48 UTC) — o app velho
  gravou um colaborador e uma movimentação (com as FKs compostas e os dois uniques do colaborador de pé), sem erro. Qual
  caminho gravou o colaborador não é medido (só contagem e hash saem do banco).

## A `0174` — depois do deploy, ensaio e produção

`apply_migration` do MCP com o texto EXATO de `0174_colaboradores_nome_chave_pos_deploy.sql`, `name`
`colaboradores_nome_chave_pos_deploy`, no ensaio e depois em produção — os dois com sucesso na primeira tentativa. Depois,
nos dois bancos, a seção `uniques` de `impressao-catalogo.sql` (o MESMO texto das CTEs e da fórmula):

| | ensaio | produção | CI do SHA congelado |
|---|---|---|---|
| `uniques.total` | 44 | 44 | 44 |
| `uniques.md5` | `da7a90567b09320248ce5811a5c28049` | `da7a90567b09320248ce5811a5c28049` | `da7a90567b09320248ce5811a5c28049` |
| `uniques.com_empresa_id` | 22 | 22 | 22 |
| índice `*_f65` sobrando | 0 | 0 | — |
| `colaboradores_nome_chave_uidx` | `(empresa_id, nome_chave)` | `(empresa_id, nome_chave)` | — |
| `relfilenode` de `colaboradores` | `25387` (igual ao antes) | `19899` (igual ao antes) | — |

Com isso as **cinco** seções do catálogo (`fks`, `uniques`, `pais`, `gatilhos` e as funções da fase) batem com o CI do
SHA congelado nos dois bancos. Depois: `notify pgrst, 'reload schema'`.

## A conferência pós-deploy

- **O smoke** (`smoke-prod-pos-deploy.txt`, com `SMOKE_VERSAO_ESPERADA=1.70.0`): **109 OK · 1 aviso · 0 n/a · 0 falha**
  — `/api/saude` na `1.70.0` · `769b84d`; o aviso é o antigo de `kits_modelos` sem kit cadastrado.
- **A Parte B** (`gh workflow run saude.yml -f partes=b`, run `35995406517`, no commit `769b84d`): **success** —
  "resumo de integridade: 13 chaves · todas as checagens dentro da linha de base"; "deriva de migrations: 0 pendente(s) ·
  a mais nova no ledger é 0174_colaboradores_nome_chave_pos_deploy.sql"; alarme (producao, integridade) verde, nenhum
  aberto.

## Os tipos — a geração do MCP contra o hand-fix

`generate_typescript_types` do MCP em produção (depois da `0173`; a `0174` não muda coluna, FK nem função exposta), o
texto extraído do resultado salvo e comparado por `diff` com `src/lib/types/database.ts` (CRLF → LF), sem transcrever:

- **As 23 `Relationships` compostas e as relações de view que somem: IGUAIS** ao hand-fix da F65 — nenhuma linha de
  diferença nelas.
- As únicas diferenças são **comentários** (os `// F62…F65 hand-fix` datados; 2.402 linhas geradas × 2.442 no arquivo) e
  **duas linhas de `operador_filiais.Insert`** (`empresa_id?`/`membro_id?` no arquivo, obrigatórios na geração): o
  hand-fix DELIBERADO da F62 (`4dd7a8c`, 22/09 — o gatilho `operador_filiais_deriva_membership` preenche as duas),
  anterior a esta fase e fora do escopo dela.
- md5: geração `1acd55462cb56d3000e4e9184f2d7d99`; o arquivo sem os comentários de hand-fix
  `2deec95efda4b31f70b02e0e8e9ad1f6` — a diferença é exatamente a descrita acima. O `database.ts` **não** foi trocado pela
  geração: fazê-lo derrubaria o hand-fix da F62, e isso não é desta fase (fica no backlog, §13 do relatório).
