# F66B · o apply, o merge e a conferência pós-deploy (12/11/2026)

Tudo pelo MCP da Supabase (religado na conta da WAP), só leitura fora dos quatro `apply_migration` e dos dois
`notify pgrst`. Hora local (-03) nas versões do ledger; UTC nos carimbos do GitHub e dos advisors.

## O ensaio (`sgmvldiizsrjbxzzpmhh`)

| passo | resultado | arquivo |
|---|---|---|
| impressão "antes" | 36 CHECK · 3 `_tamanho` · 1 `not valid` · md5 `a88a9b4f…` (= mesa = CI); 20 tabelas; 106 funções; 54 + 8 policies | `antes/impressao-ensaio.json` |
| advisors "antes" | segurança 6 · 34 · 1; desempenho 39 · 1 · 47 · 1 | `antes/advisors-ensaio.json` |
| contagem (portão) | **0 acima do teto** em 65 colunas, 5.002 linhas | `G-contagem/ensaio-antes.json` |
| contagem SABOTADA (teto 0 em `ativos.marca`) | **1.602 acima** em `ativos.marca`, 0 no resto — o bloco acha no banco de verdade | `G-contagem/ensaio-sabotada.json` |
| `0181` (17:06:51) | 10 CHECK com o md5 da mesa; `relfilenode` das 20 igual; funções e policies iguais | `depois/ensaio-0181-impressao.json` |
| contagem → `0182` (17:09:01) | 0 → 42 de 65; o resto igual | `G-contagem/ensaio-antes-0182.json`, `depois/ensaio-0182-impressao.json` |
| contagem → `0183` (17:10:37) | 0 → 57 de 65 | `…-0183…` |
| contagem → `0184` (17:12:08) | 0 → **65 de 65** | `…-0184…` |
| ledger | as quatro com `md5(statements[1])` = `md5sum` do arquivo (byte a byte) | `depois/ledger-ensaio.json` |
| `notify pgrst` · impressão "depois" | 101 CHECK · 68 `_tamanho` · 1 `not valid` · md5 **`3d16ad91…` = mesa/CI**; `relfilenode` das 20 = antes; funções e policies = antes | `depois/impressao-ensaio.json` |
| advisors "depois" | = antes, lint a lint; nada cita objeto da fase | `depois/advisors-ensaio.json` |
| contagem "depois" | 0 em 65 | `G-contagem/ensaio-depois.json` |
| conferidor de formas | 248 pontos · 88.182 linhas · **0 recusadas** · 1 "reprovado" que é NÃO PROVADO: `itens.saldo-colaborador` sem célula no ensaio (nenhum colaborador para chamar — o mesmo desde a F65) | `depois/conferidor-ensaio.json` |

## A produção (`pbtjcalbmepmrqzprusb`)

| passo | resultado | arquivo |
|---|---|---|
| impressão "antes" | 36 CHECK · md5 `a88a9b4f…` (= ensaio = CI); 106 funções `b2dd0377…` e policies `cdbd5463…` = ensaio | `antes/impressao-producao.json` |
| advisors "antes" | segurança 6 · 34 · 1 (= ensaio) | `antes/advisors-producao.json` |
| contagem (portão) | **0 acima do teto** em 65 colunas, 6.842 linhas. As três que a API não lia, medidas aqui pela primeira vez: `eventos_admin` (acao 26/80, alvo 36/500), `import_logs` (modo 10/40, arquivo_hash 64/128, backup_path 44/120), `senhas_acesso` (rotulo 15/80, hash 168/200) | `G-contagem/producao-antes.json` |
| `0181` (17:16:02) → `0184` (17:20:39) | contagem 0 IMEDIATAMENTE antes de cada lote; depois de cada um, o md5 das CHECK igual ao do ensaio no mesmo ponto (`17b3c08e…`, `9f69a44b…`, `c9a83642…`, `3d16ad91…`), `relfilenode` das 20 igual, funções e policies iguais | `G-contagem/producao-antes-018*.json`, `depois/producao-018*-impressao.json` |
| ledger | as quatro byte a byte; `lock_timeout` não disparou; uma tentativa cada | `depois/ledger-producao.json` |
| smoke logo depois do apply | 1ª: `108 OK · 2 avisos · 0 falha` — o antigo de `kits_modelos` e um 307 → `/login` em `/admin/tipos-item` no meio da sessão que abriu as outras telas de admin; 2ª, logo em seguida: `109 OK · 1 aviso · 0 falha` (o `/admin/tipos-item` em 200). Transitório de sessão; leitura não passa por CHECK | `depois/smoke-prod-pos-apply-1.txt`, `-2.txt` |
| conferidor de formas | 272 pontos · 112.035 linhas · **0 recusadas · 0 reprovados** | `depois/conferidor-producao.json` |
| impressão "depois" | 101 CHECK · md5 `3d16ad91…` (= ensaio = mesa = CI); `relfilenode` das 20 = antes; funções e policies = antes | `depois/impressao-producao.json` |
| advisors "depois" | segurança 6 · 34 · 1 (= antes); desempenho 39 · 1 · 7 · 1 | `depois/advisors-producao.json` |
| paridade 11 classes | ensaio = produção nas 11; a classe `constraint` (209 · `0b0ead9c…`) = o CI do SHA congelado | `depois/paridade-11-classes.json` |

**Nenhum rollback.** Nenhum portão recusou: contagem 0 antes de cada lote nos dois bancos, smoke sem falha, conferidor
sem recusa, nenhum advisor novo.

## O merge e o pós-deploy

- PR #92: `gh pr ready 92` e `gh pr merge 92 --merge` (sem `--admin`), os quatro checks verdes no head `bcbdefd` →
  merge **`2fbebaa`** às 20:24:39Z (17:24 local), 4 min depois do último lote em produção.
- `/api/saude`: `{"ok":true,"versao":"1.72.0","commit":"2fbebaa","banco":"ok"}`.
- smoke pós-deploy: **`109 OK · 1 aviso · 0 falha`** (o aviso antigo de `kits_modelos`) — `depois/smoke-prod-pos-deploy.txt`.
- Parte B do `saude.yml` disparada à mão (`partes=b`, run `43300224028`, `2fbebaa`): **a sonda de deriva limpa** —
  `0 pendente(s) · a mais nova no ledger é 0184_comprimento_registros.sql`. **O veredito é VERMELHO, e não é da fase:**
  os dois achados de integridade de DADOS — `backup_orfao` 10 → 12 e `detentor_em_estado_sem_dono` 0 → 1 — são os da
  issue de alarme #84, que mudou de estado em 19/10/2026 e reprova a Parte B todo dia desde então; a execução agendada de
  HOJE às 17:43Z (run `43272391981`, no `0a3a586`, ANTES de qualquer apply da F66B) deu os mesmos dois, com os mesmos
  números. A F66B não escreve dado (o `relfilenode` prova que nenhuma tupla foi tocada) e esta ordem proíbe escrita em
  produção fora do apply — os dois achados vão para o backlog (RELATORIO-F66B §12).
