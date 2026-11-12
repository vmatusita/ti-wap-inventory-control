# RELATÓRIO F66B — O comprimento vira regra do banco

Ordem: [`prompts/F66B-comprimento-vira-regra-do-banco-ultracode.md`](prompts/F66B-comprimento-vira-regra-do-banco-ultracode.md).
Plano: [`PLAN-F66B.md`](PLAN-F66B.md). Ata: 2026-11-12 · F66B em [`DECISOES.md`](DECISOES.md). Regras: MATRIZ, emenda
F66B (R-ACC-118 a R-ACC-123); ADR-003, emenda F66B; RUNBOOK, Anexo F66B. Evidências: [`f66b-evidencias/`](f66b-evidencias/).
PR [#92](https://github.com/vmatusita/ti-wap-inventory-control/pull/92) (merge `2fbebaa`). Versão **1.72.0**. Run de
12/11/2026.

## 0. No topo

### A resposta

**A fase está no ar: 65 colunas de texto das 20 tabelas de negócio têm, no próprio banco, um teto de comprimento — nos
dois bancos, com nada mudado para a WAP.** As quatro migrations (`0181`–`0184`) correram lote a lote no ensaio e em
produção no mesmo dia, cada lote só depois da contagem de violação dar 0 naquele banco, e nenhuma tupla foi reescrita (o
`relfilenode` das 20 tabelas é o mesmo antes e depois, nos dois). Um texto acima do teto leva uma frase pt-BR com o campo
e o limite. O PR #92 foi mergeado (`2fbebaa`), a v1.72.0 está no ar, e a tag `v1.72.0` sai com o PR de documentação.

### Desfecho da run

- **Código:** a branch `f66b-comprimento-vira-regra-do-banco`. **O SHA de código congelado é o `1fc3b22`** (§9 do
  PLAN-F66B: o último commit que toca `src/**`, `scripts/**` ou `supabase/**`); depois dele, só `docs/**`. Merge do PR
  #92: **`2fbebaa`**.
- **Mesa (no SHA congelado `1fc3b22`):** lint, tipos, 268 arquivos / 8.442 testes, build, contraste e o gate de actions
  limpos. A cadeia inteira numa mesa PG 17.5 (PGlite, fora do projeto): os três roteiros novos verdes, os 54 de antes com
  o MESMO resultado com e sem os 65 CHECK, os seis ensaios de rollback verdes, as sete mutações novas detectadas.
- **CI:** as travas nasceram vermelhas no PR (run `43283138978`, os dois jobs); verde no `8bc70ba` (57 roteiros, 1.203
  asserções, 0 ✗; injetor 163/163) e no SHA congelado `1fc3b22` (run `43291899564`, os dois jobs; §8).
- **Bancos vivos (§5, §6):** a primeira parte da run correu com o conector da Supabase ligado a OUTRA conta — o máximo
  vivo saiu pela API de leitura do app (17 das 20 tabelas). Religado, o caminho B correu inteiro no mesmo dia: o portão
  (0 acima do teto nas 65 colunas, nos dois bancos, antes de cada lote; a variante sabotada acusou `ativos.marca` no
  ensaio), as quatro migrations com o texto byte a byte do arquivo (o md5 do ledger = o do arquivo), as CHECK com o md5
  do CI (`3d16ad91…`), o `relfilenode`, as funções e as policies iguais ao "antes", os advisors sem nada novo, o
  conferidor de formas sem recusa e o smoke sem falha, a paridade das 11 classes. **Nenhum rollback.**
- **A revisão adversarial** (seis lentes, um cético por achado, lendo pelo SHA): 7 achados, 5 refutados, **2
  sobreviventes, os dois baixos e corrigidos** (§13). A re-revisão das correções: §13.
- **Um ponto vermelho que não é da fase:** a Parte B do `saude.yml` (disparada à mão depois do deploy) tem a sonda de
  deriva limpa (0 pendentes, ledger na `0184`), mas o veredito é VERMELHO pelos dois achados de integridade de DADOS de
  produção que reprovam a Parte B todo dia desde 19/10 (issue de alarme #84) — os mesmos números na execução agendada de
  hoje ANTES do apply. Backlog, §12.

### Como o caminho B correu

A primeira parte da run terminou com o PR #92 em rascunho e este §0 pedindo o apply: o conector da Supabase estava
ligado a outra conta (`list_projects` mostrava só "Invoice Control"; `execute_sql` nos dois refs da WAP respondia `You do
not have permission`) e a ordem não deixava buscar token nem abrir o `.env.local`. O Johnny religou o conector ("Já
reconectei") e o caminho correu na mesma sessão, nesta ordem (o Anexo F66B do `RUNBOOK-BANCO.md`; o detalhe passo a
passo, com cada arquivo de evidência, em [`f66b-evidencias/depois/pos-deploy.md`](f66b-evidencias/depois/pos-deploy.md)):

1. **O CI do PR #92 verde** no head `bcbdefd` (só `docs/**` depois do congelado `1fc3b22`), a `main` sem andar.
2. **No ENSAIO (`sgmvldiizsrjbxzzpmhh`):** os advisors e a impressão "antes" (36 CHECK, md5 `a88a9b4f…` = mesa = CI); o
   bloco de contagem (`G-contagem/contagem-violacao.canal.sql`) → **0 acima do teto** em 65 colunas; o sabotado →
   **1.602** em `ativos.marca` (o bloco acha no banco de verdade); a `0181` (`comprimento_cadastros_do_acervo`), a
   impressão (as 10 com o md5 da mesa, o `relfilenode` igual), a contagem 0, a `0182`, …, a `0184`; o `notify pgrst`;
   a impressão "depois" (101 CHECK, 68 `_tamanho`, md5 `3d16ad91…`); os advisors (= antes); o conferidor (0 recusadas).
3. **Em PRODUÇÃO (`pbtjcalbmepmrqzprusb`)**, quatro minutos depois do último lote do ensaio: os mesmos passos, sem o
   sabotado, a contagem 0 IMEDIATAMENTE antes de cada lote (6.842 linhas; as três tabelas que a API não lia, medidas
   aqui pela primeira vez, abaixo do teto — a mais perto, `senhas_acesso.hash`, 168 de 200); logo depois do último, o
   smoke (sem falha), o conferidor (272 pontos, 0 recusadas, 0 reprovados), a impressão "depois" (= ensaio = CI), os
   advisors (= antes) e a paridade das 11 classes (ensaio = produção; a classe `constraint` = o CI).
4. **O merge** do PR #92: `gh pr ready` e `gh pr merge --merge`, sem `--admin`, os quatro checks verdes → `2fbebaa`.
5. **A conferência pós-deploy:** `/api/saude` = `1.72.0` · `2fbebaa` · banco ok; o smoke `109 OK · 1 aviso · 0 falha`;
   a Parte B do `saude.yml` (run `43300224028`) com a deriva limpa e o vermelho de dados de antes da fase (acima).
6. **O PR de documentação** com a evidência e este fecho; no merge dele, a tag anotada `v1.72.0`, publicada.

### O roteiro do Johnny, depois do deploy: onde clicar

Entre com a sua conta em produção e confira que tudo grava como sempre:

1. **Ativos › (um ativo) › Editar:** salve uma observação longa (perto de 2.000 caracteres). Tem de gravar.
2. **Movimentações › Nova:** registre uma movimentação com observação. Tem de gravar.
3. **Itens:** um lançamento de item com observação. Tem de gravar.
4. **Administração:** cadastre ou edite um motivo, um tipo de item e um apelido de filial. Tem de gravar.
5. **Relatórios:** gere o relatório da semana com observação. Tem de gravar.
6. **Administração › Importar:** abra a conferência de um import com uma planilha FICTÍCIA que tenha uma célula longa
   demais (por exemplo, uma marca com 61 caracteres) e veja a linha recusada ali, com "valor longo demais" — **sem
   aplicar**.
7. **`/api/saude`** com `1.72.0` (já conferido: `2fbebaa`, banco ok). A Parte B do `saude.yml` vai continuar vermelha
   pelos dois achados de dados da issue #84 (de 19/10, não desta fase — §12); a linha de deriva dela tem de dizer
   `0 pendente(s)` com a `0184` no ledger.
8. **`git diff v1.71.2 v1.72.0 --stat`.** Devem aparecer: `supabase/migrations/0181_*` a `0184_*`,
   `supabase/migrations.lock.json`, `supabase/rollback/F66B-desfaz.sql`; `supabase/tests/comprimento_por_coluna.sql`,
   `comprimento_comportamento.sql`, `f66b_rollback.sql` e uma linha nova em `f62`/`f63`/`f64`/`f65_rollback.sql` (§1); em
   `src/lib/validators/`, a fonte e a trava (`tetos-coluna.ts`, `tetos-coluna.test.ts`, `rollback-f66b.test.ts`) e os
   ajustes em `ativo.ts`, `devolucao-fornecedor.ts`, `admin.ts`; `src/lib/supabase/erros-do-banco.ts` (+ teste),
   `src/lib/actions/erros.ts` (+ teste), `src/lib/actions/relatorios.ts` (a constante); `src/lib/import/comprimento-coluna.test.ts`;
   `src/components/movimentacoes/devolucao-fornecedor-form.tsx` (o `maxLength`, declarado); `src/lib/itens/migrations-f38.test.ts`
   (`DA_F38`); `scripts/comprimento/**`, `scripts/db/mutacoes.mjs` e o teste; `registry.ts`, `package.json`,
   `CHANGELOG.md`, `docs/**`. **Não** devem aparecer: `src/lib/queries/**`, `src/app/**`, `src/lib/types/database.ts`,
   migration antiga alterada, função recriada, `scripts/seed.ts`, `scripts/reset.ts`, `scripts/import/**`,
   `scripts/db/restaurar.mjs`, `scripts/smoke/linha-de-base.json`, `.github/workflows/**`, `package-lock.json`.
9. **Lembrete:** o próximo prompt é o da **F67**, que vai ser dividida em F67/F67B/F67C pelas suas decisões de hoje (a nota
   está na ficha F67 do `PLANO-MULTIEMPRESA.md`).

---

## 1. O que mudou, por arquivo e por quê

| arquivo | o quê | por quê |
|---|---|---|
| `supabase/migrations/0181`–`0184` | 10 + 32 + 15 + 8 = 65 `add constraint <t>_<c>_tamanho check (char_length(<c>) <= <N>)`, um `alter table` literal por tabela, `lock_timeout` 2 s, classe ADITIVA, rollback no rodapé | o banco passa a recusar o texto longo (decisões 3, 11) |
| `supabase/migrations.lock.json`, `src/lib/itens/migrations-f38.test.ts` | as quatro travadas; `DA_F38` + `0181`–`0184` | a regra das migrations |
| `src/lib/validators/tetos-coluna.ts` | a FONTE dos 65 tetos e rótulos, os lotes, o nome alternativo | uma coluna, um teto (decisão 7) |
| `src/lib/validators/tetos-coluna.test.ts` | a trava de mesa Zod × banco | decisão 7 |
| `supabase/tests/comprimento_por_coluna.sql` | a trava de catálogo (C0–C9, S1–S6) | decisão 8 |
| `supabase/tests/comprimento_comportamento.sql` | o comportamento das 65, uma coluna por lote na tabela real, a RPC do import por fora, a chave no pior caso, a mensagem real | decisões 4, 9, 10 |
| `supabase/rollback/F66B-desfaz.sql`, `supabase/tests/f66b_rollback.sql`, `src/lib/validators/rollback-f66b.test.ts` | o rollback, o ensaio e a completude | decisão 14 |
| `supabase/tests/f62`–`f65_rollback.sql` | uma linha cada: `\ir ../rollback/F66B-desfaz.sql` antes do da F66 | fato 18 (medido: o `rb3` da F63–F65 reprova sem ela; o da F62 pela ordem) |
| `src/lib/supabase/erros-do-banco.ts`, `src/lib/actions/erros.ts` (+ testes) | `fraseDeComprimento` e `COMPRIMENTO_TRADUZIDO` (69 frases) | decisão 10 |
| `src/lib/validators/ativo.ts`, `devolucao-fornecedor.ts`, `admin.ts`, `src/lib/actions/relatorios.ts` | o teto das observações do ativo pela fonte (2.000) também no substituto da devolução; `.max(40)` na edição do código do motivo; os donos lendo a constante | decisão 6 |
| `src/components/movimentacoes/devolucao-fornecedor-form.tsx` | o `maxLength` do campo de observações do substituto = a constante | decisão 6 (**desvio declarado** do critério 18) |
| `src/lib/import/comprimento-coluna.test.ts` | a cobertura do import campo a campo (a sabotagem E) | decisão 9 |
| `scripts/comprimento/medir-maximos.mts` | o máximo vivo pela API de leitura (só números) | o "antes" sem o MCP |
| `scripts/comprimento/contagem-violacao.mts` (+ teste) | o portão de cada lote | decisão 11 / RUNBOOK |
| `scripts/db/mutacoes.mjs` (+ teste) | sete mutações, teto 163 | decisão 13 |
| `docs/f66b-evidencias/impressao-f66b.sql` | a impressão antes/depois | decisão 12 |
| `package.json`, `registry.ts`, `CHANGELOG.md` | 1.72.0 | regra 8 |

**Os roteiros que existiam e foram adaptados: nenhum.** Medido na mesa: os 54 roteiros dão o mesmo resultado na cadeia
com e sem os 65 CHECK (`f66b-evidencias/roteiros-existentes-mesa.txt`); nenhuma fixture passava de um teto. As únicas
mudanças em roteiros antigos são a linha do encadeamento do rollback (acima) — nenhuma asserção mudou.

---

## 2. Os números medidos × a ficha

Os 24 fatos estão remedidos no §1 do PLAN-F66B, um a um. As divergências:

| | a ordem / a ficha | medido | |
|---|---|---|---|
| (1) numeração e versão | a ficha não fixava | `0181`–`0184`; `1.72.0` | = |
| (2) os fatos de banco têm sete semanas | 24/09 | pela API (17 tabelas): `lancamentos_item.observacao` 184 → **192**; `movimentacoes` 3.631 → **3.960** linhas, `ativos` 1.649 → **1.632**; o **ensaio** tem valores maiores que produção (o seed): `setor_atual`/`movimentacoes.setor` **84**, acima dos 80 do import | ⚠ |
| (3) uma coluna, vários tetos | o caso é geral | pior: várias telas gravam SEM `.max()` (compra, devolução, ficha, movimentação) — 25 caminhos declarados | ⚠ |
| (4) a validação por linha do import existe | F56 | confirmada, **sem buraco** — o import não mudou; a cobertura virou teste | = |
| (5) `registrarEventoAdmin` 16; `createAdminClient` 66/18 | | **15 chamadas** (+ a definição); **32 linhas em 16 arquivos** (`src` + `scripts`, fora testes) | ⚠ |
| (6) a forma sem `btrim` e as duas existentes | as duas como exceção | as duas limitam só o valor APARADO — **não viraram exceção**: `anotacoes_texto_tamanho` e `unidades_apelidos_apelido_bruto_tamanho` | ⚠ |
| (7) o `unaccent` alonga | 2× | **não há `unaccent`**; as chaves crescem até **3×** (NFC, `lower` do U+0130, a sobra do NFD) — 120 × U+FB2C → chave de **360** no PG 17 | ⚠ |
| (8) as decisões do Johnny | só nota | só nota | = |
| fato 12 | 19 traduções | **17** | ⚠ |
| fato 14 | o Zod conta UTF-16 | o Zod 4.6.5 conta **code points** (a conclusão vale) | ⚠ |
| fato 18 | nenhum rollback anterior precisaria do da F66B | **o da F63, F64 e F65 precisam** (o `rb3` deles lê toda constraint) | ⚠ |
| fato 23 | o MCP pode amanhecer desligado | **ligado a outra conta** a run inteira | ⚠ |
| a ordem: "o backup fica" no 23514 do import | | o código (desde a F7F, sem mudança) DESCARTA o backup do import que a RPC recusou — a transação reverteu, não há o que restaurar; o achado 6 da revisão foi refutado por isso | ⚠ (texto da ordem) |

---

## 3. As decisões

**As três do Johnny (12/11/2026):** (1) a F66B antes da F67; (2) a F67 em três (F67, F67B, F67C) — nota na ficha F67;
(3) as contas dev em `membros` até a F69 — notas nas fichas F67 e F69.

**As catorze da fase** estão no §4 do PLAN-F66B e na ata. Em uma linha cada: (1) o universo do catálogo, 65 `text`;
(2) a régua ≥ caminho, ≥ vivo, a escada; (3) a forma sem `btrim`, o nome, as duas antigas fora da exceção, o nome
alternativo; (4) as chaves com 3×; (5) os gerados com o formato e um degrau; (6) os dois ajustes; (7) a fonte única e a
trava de mesa; (8) a trava de catálogo pela árvore; (9) o import sem buraco; (10) um ramo de tradução; (11) quatro lotes;
(12) nada mais muda; (13) sete mutações; (14) o rollback antes dos da F65–F62.

---

## 4. A tabela-verdade e o mapa do import

O §2 do PLAN-F66B tem as 65 colunas (classe, todos os caminhos com teto e arquivo:linha, vivo nos dois bancos, teto,
regra); o §3, o mapa do import (o campo de `AtivoPlano`, o teto, as transformações, a prova). Os tetos acima do maior
caminho, com motivo: `lancamentos_item.observacao` 2.000 (a transferência compõe até 602 sem corte),
`ativos.pendencia` 200 (o estorno pode alongar 1 por separador), `eventos_admin.alvo` 500 (e-mail até 320, e a trilha
engole o erro), `pendencias_item.item` 80 (o irmão `itens.nome`), `termos_gerados.tipo` 40 (o enum vai até 35).

---

## 5. A contagem de violação, lote a lote, e o `relfilenode`

**Nos bancos vivos** (o MESMO texto do bloco, pelo `execute_sql`, a resposta extraída por script e analisada por
`contagem-violacao.mts analisar`; `G-contagem/`):

| | ensaio (5.002 linhas) | produção (6.842 linhas) |
|---|---|---|
| antes da `0181` | **0** acima do teto em 65 colunas | **0** em 65 |
| sabotado (teto 0 em `ativos.marca`) | **1.602** em `ativos.marca`, 0 no resto | — (recusa fora do ensaio, pela ordem não roda) |
| antes da `0182` · `0183` · `0184` | 0 · 0 · 0 | 0 · 0 · 0 |
| depois da `0184` | 0 | — (os CHECK validados são a contagem) |

As três tabelas que a API não lia, medidas em produção pela primeira vez: `eventos_admin` (acao 26/80, alvo 36/500),
`import_logs` (modo 10/40, arquivo_hash 64/128, backup_path 44/120), `senhas_acesso` (rotulo 15/80, hash 168/200).

**Na mesa** (o mesmo texto, `G-contagem/sabotagem-g-mesa.txt`): 0 acima do teto em 65 colunas; a variante sabotada achou
3; fora do ensaio ela recusa.

**O `relfilenode` nos bancos vivos** (`impressao-f66b.sql`, depois de CADA lote, `comparar` contra o "antes" do mesmo
banco): o md5 das 20 igual ao "antes" em todos os oito pontos (quatro lotes × dois bancos); as 36 CHECK de antes byte a
byte; as novas do lote com o md5 de `pg_get_constraintdef` da mesa; as 106 funções e as 62 policies iguais. O md5 das
CHECK depois de cada lote foi o MESMO nos dois bancos — `17b3c08e…`, `9f69a44b…`, `c9a83642…` e, no fim, **`3d16ad91…`,
o da mesa e do CI**. O texto aplicado: `md5(statements[1])` do ledger = `md5sum` do arquivo, nas quatro, nos dois bancos
(`depois/ledger-*.json`).

**O `relfilenode`** (a sabotagem I, mesa): a cadeia `0001`–`0180` e a mesma base com as quatro migrations por cima dão o
MESMO md5 das 20 (`d81abfff…`), as mesmas 106 funções (`7180f4c1…`) e as mesmas 62 policies (`cdbd5463…`); as CHECK vão de
36 a 101. Um `alter column … type` muda o `relfilenode` (o instrumento sabe ver); uma constraint alterada muda o md5 das
CHECK.

---

## 6. O conferidor e o smoke

| | ensaio | produção |
|---|---|---|
| conferidor de formas (depois da `0184`) | 248 pontos · 88.182 linhas · **0 recusadas** · 1 NÃO PROVADO (`itens.saldo-colaborador` sem célula: o ensaio não tem colaborador para chamar — o mesmo desde a F65) | 272 pontos · 112.035 linhas · **0 recusadas · 0 reprovados** |
| smoke logo depois do apply | — (o smoke é de produção) | 1ª `108 OK · 2 avisos · 0 falha` (o aviso antigo de `kits_modelos` e um 307 → `/login` em `/admin/tipos-item` no meio da sessão); 2ª, em seguida, `109 OK · 1 aviso · 0 falha` — transitório de sessão |
| smoke pós-deploy (`2fbebaa`) | — | **`109 OK · 1 aviso · 0 falha`** |
| advisors | = antes, lint a lint | = antes, lint a lint |
| paridade das 11 classes | = produção | = ensaio; `constraint` (209 · `0b0ead9c…`) = o CI |

`func` e `grant_func` da paridade diferem do CI antes e depois da fase (os corpos vivos que divergem do arquivo e o CI
sem os grants da plataforma); a F66B não cria nem recria função.

---

## 7. As sabotagens, com a saída real

| | o quê | onde | resultado |
|---|---|---|---|
| A | o catálogo: CHECK retirado; `not valid`; `length`/`octet_length`/`btrim`; coluna nova; exceção fantasma; exceção com CHECK | `A-B-F-I-sabotagens.md` | cada caso acusado pelo nome da coluna (C1, C3/C9, C2, C1, C7a, C7b) |
| B | a mesa: um `.max()` acima do banco; `LIMITES` acima da coluna; o literal da migration; a fonte com uma coluna a mais | idem | as quatro vermelhas; o controle verde |
| C | o comportamento: teto passa, teto + 1 leva 23514 com o nome, NULL passa, sem o CHECK passa | `comprimento_comportamento.sql` (B1a–B1e, L1–L4) | 65 colunas + uma por lote na tabela real; vermelho sem a fase (17 falhas) |
| D | a RPC do import por fora | idem (I1–I4) | 23514 `ativos_marca_tamanho`, a filial intacta; sem o CHECK a mesma chamada grava a marca de 61 e substitui o acervo |
| E | o import pela tela, campo a campo | `E-import-pela-tela.txt` | 13 campos, 40 casos |
| F | a tradução | `A-B-F-I-sabotagens.md` | uma `_tamanho` sem frase → 3 vermelhos |
| G | o portão sabe achar | `G-contagem/` | mesa: 0 / 3 / recusa fora do ensaio; ensaio: 0 / **1.602** em `ativos.marca` |
| H | o rollback | `H-rollback/encadeamento-mesa.txt`, `f66b_rollback.sql` | as CHECK voltam a 36 · `f921131b…`; F63–F65 vermelhos sem o encadeamento, verdes com ele |
| I | o instrumento | `A-B-F-I-sabotagens.md` | acima (§5) |

E o injetor: as sete mutações, uma a uma na mesa, detectadas (`injetor-mesa.txt`); no CI, §8.

---

## 8. A contagem final

| | antes | depois |
|---|---:|---:|
| arquivos de teste · testes (mesa) | 264 · 8.103 | 268 · 8.442 |
| roteiros SQL · asserções (CI) | 54 · 1.153 | 57 · 1.203 (0 ✗) |
| mutações (teto) · detectadas no CI | 156 | 163 · **163/163** |
| quarentena | 2 | 2 (2/165 < ⅓) |
| CHECK em `public` (cadeia) | 36 | 101 |
| CHECK de comprimento nas 20 | 2 | 67 |
| colunas com teto · exceções · nome alternativo | 0 · — · — | 65 · 0 · 1 |
| caminhos declarados na trava de mesa | — | 44 com teto · 25 sem `.max()` · 18 campos do import |
| CHECK em `public` nos bancos vivos · md5 | 36 · `a88a9b4f…` | 101 · `3d16ad91…` (= CI), nos dois |
| contagem de violação nos bancos vivos | — | 0 antes de cada lote, nos dois |
| `relfilenode` das 20 · funções · policies | — | iguais ao "antes", nos dois |
| advisors (segurança · desempenho), produção | 6·34·1 · — | 6·34·1 · 39·1·7·1 (nada novo) |

| o gate de deriva de tipos (CI) | 38 relações · 358 colunas · 95 funções | **o mesmo** (`database.ts` intocado) |

**O CI:** a run `43291114484` (head `8bc70ba`, que difere do congelado só no arquivo de teste da trava de mesa) fechou os
dois jobs verdes — `verificar` (268 / 8.442) e `banco-sem-docker` (57 roteiros, 1.203 asserções, 0 ✗; os três roteiros
novos 17 + 28 + 5; os seis ensaios de rollback verdes, o `f66b_rollback.sql` com a constante da mesa `36:f921131b…`; o
injetor 163/163; o `db:types:diff` verde) — `f66b-evidencias/C-ci-verde-8bc70ba.txt`. **O CI do SHA congelado
`1fc3b22`** (run `43291899564`): os dois jobs verdes, os mesmos números — 268 / 8.442, 57 roteiros e 1.203 asserções, 0 ✗,
o injetor 163/163, o `db:types:diff` verde (`f66b-evidencias/C-ci-verde-1fc3b22.txt`). As travas nasceram vermelhas na run `43283138978` (`B-travas/ci-vermelho-a977430.txt`).

---

## 9. Os 24 critérios, autoverificados

| # | critério | estado |
|---:|---|---|
| 1 | lint, test, typecheck, build, contraste, actions; CI `banco-sem-docker` | ✅ na mesa; CI no §8 |
| 2 | o PLAN com os 24 fatos, a tabela-verdade, o mapa, as 14 decisões, a ordem e o rollback, antes do primeiro commit de código | ✅ (`0824cac` é o primeiro commit da branch) |
| 3 | a contagem e a impressão "antes" nos dois bancos | ✅ (o máximo vivo pela API na 1ª parte; a contagem SQL e a impressão pelo MCP depois de religado — `antes/`, `G-contagem/`) |
| 4 | migrations desde a 0181, classe, rollback, lock, DA_F38; sem update/cascade/dinâmica/not valid; nada recriado | ✅ (classificador; `rollback-f66b.test.ts`; revisão) |
| 5 | toda coluna com o CHECK, validado, nos dois bancos e no CI; o catálogo nasceu vermelho e está verde | ✅ (101 CHECK, 1 `not valid` — o de antes —, md5 `3d16ad91…` = CI, nos dois) |
| 6 | nenhum teto abaixo de caminho ou do vivo; a trava nasceu sabendo ficar vermelha | ✅ (as 20 tabelas medidas: 17 pela API e as 20 pelo portão SQL, 0 acima nos dois bancos) |
| 7 | derivados e gerados com teto provado | ✅ (K1–K5; os formatos) |
| 8 | a cobertura do import e a RPC por fora | ✅ |
| 9 | toda `_tamanho` com frase; nenhuma morta | ✅ |
| 10 | um teto só nas observações; `.max(40)` na edição do motivo; nenhum outro teto de tela mudou | ✅ (+ o `maxLength` declarado) |
| 11 | nada mudou para a WAP: contagem 0 antes de cada lote, smoke, conferidor | ✅ (§5, §6) |
| 12 | nenhuma tupla reescrita: `relfilenode` igual nos dois bancos | ✅ (mesa e os dois bancos, depois de cada lote) |
| 13 | funções e policies byte a byte; só as `_tamanho` novas | ✅ (mesa e os dois bancos) |
| 14 | o rollback escrito e ensaiado no CI; F62–F66 medidos | ✅ (mesa e CI) |
| 15 | os roteiros adaptados listados; nenhuma asserção mudou | ✅ (nenhum adaptado) |
| 16 | o injetor: as mutações detectadas, o teto exato, a quarentena < ⅓ | ✅ |
| 17 | advisors, paridade, `database.ts` | ✅ (advisors = antes nos dois; paridade 11/11; `database.ts` intocado) |
| 18 | nenhuma dependência; os intocados | ✅ (exceto o `maxLength` declarado) |
| 19 | as emendas | ✅ |
| 20 | versão, CHANGELOG, registry; a tag | ✅ (a tag `v1.72.0` no merge do PR de documentação) |
| 21 | os dois PRs mergeados e a conferência | ✅ PR #92 (`2fbebaa`), `/api/saude`, smoke; ⚠ a Parte B do `saude.yml` VERMELHA por dados de antes da fase (issue #84; a deriva limpa) |
| 22 | as sabotagens A–I com saída real | ✅ (G também no ensaio: 1.602 em `ativos.marca`) |
| 23 | nenhum dado real; ninguém abriu o `.env.local` | ✅ |
| 24 | este relatório no padrão | ✅ |

---

## 10. O estado de repouso

**Um estado terminal, no ar:** 65 colunas com teto nos dois bancos, a frase do erro, o rollback ensaiado no CI e
encadeado com os da F62–F66. Se o projeto parar aqui por dois meses, nada fica pela metade: a fonte (`tetos-coluna.ts`),
a trava de mesa e a de catálogo seguram o próximo que acrescentar uma coluna de texto ou mudar um teto (o Anexo F66B do
RUNBOOK diz como). Desfazer, se um dia precisar: `supabase/rollback/F66B-desfaz.sql` pelo `execute_sql`, nenhum dado se
perde.

---

## 11. O que este relatório NÃO prova

- **Que um texto longo pela tela de produção leva a frase certa**: a frase está provada no CI (M1, a mensagem real do
  23514) e na mesa; em produção ninguém gravou texto acima do teto (o roteiro do Johnny, item 6, mostra a recusa do
  import na conferência, sem aplicar).
- **Que um backup antigo (do import ou de migração) restaura sem `23514`** (fato 20): o conteúdo dos backups não foi lido.
- **Que o seed fictício respeita os tetos** (ele não roda no CI): o ensaio tem `setor` com 84 — dentro de 120.
- **Que os tetos sem Zod servem ao dado de amanhã**: vêm da medição de hoje, com folga.
- **Que `jsonb` e o `text[]` estão limitados** (fora do escopo).
- **Que as telas sem `.max()` avisam antes de gravar**: o banco recusa e a frase chega; o aviso no formulário é backlog.
- **Nada sobre isolamento por empresa** (F67).

---

## 12. Pendências e backlog nomeado

**Pendente desta fase:** nada — o caminho B correu inteiro (§0); a tag `v1.72.0` sai no merge do PR de documentação.

**Backlog:**
- **Os dois achados de integridade de dados de produção que reprovam a Parte B do `saude.yml` todo dia desde
  19/10/2026** (issue de alarme #84): `backup_orfao` 10 → 12 e `detentor_em_estado_sem_dono` 0 → 1. Anteriores à F66B (a
  execução agendada de 12/11 às 17:43Z, antes do apply, deu os mesmos números) e fora desta ordem (ela proíbe escrita em
  produção fora do apply). Pede diagnóstico próprio — de onde vieram os dois backups e o detentor, e se a linha de base
  ou o dado é que deve mudar — antes de qualquer conserto.
- **F67** (dividida em F67/F67B/F67C pelas decisões de hoje): a ponte de `papel_atual()`, as `security definer`, as
  destrutivas, a mesa de conflitos, a trava do termo; Storage e Realtime; o fim do default.
- **F69:** `profiles` e a saída das contas dev de `membros`.
- **Os caminhos sem `.max()`** (25, `CAMINHOS_SEM_TETO` da trava de mesa): pôr o `.max()` = o teto do banco em cada um
  (compra, substituto da devolução, ficha do ativo, movimentação, o item faltante, o slug da filial, o e-mail do convite).
- **Os pares de tetos divergentes** que esta fase não unificou (o banco ficou com o maior): o nome do colaborador (80
  cadastro · 120 lançamento/import · 200 termo), a service tag (100 · 60), o patrimônio (10 · 60), o chamado (20 · 40 ·
  sem teto), o setor (80 · sem teto), a observação do lançamento (500 · 602 na transferência).
- **`movimentacoes.itens_faltantes`** (`text[]`): um teto para o array e o elemento.
- O `savepoint` por linha na RPC do import (outra conversa).
- **Das fases anteriores, sem mudança:** o seed de duas empresas, `scripts/seed.test.ts` e o `onConflict` de
  `seed.ts:886`; a paginação keyset; derrubar `profiles.papel`/`ativo`; o hand-fix da F62 em `operador_filiais.Insert`;
  os `scratch_tmp/scripts/db/*` rastreados; o WARN `multiple_permissive_policies` de `pendencias_item`.

---

## 13. A revisão adversarial

Seis lentes em contexto fresco (os tetos × caminhos; o import; a trava de catálogo e a de mesa; as migrations e o
rollback; a tradução e a UI; o escopo e os dados), lendo pelo SHA `1a18079`, cada achado com um cético instruído a
refutá-lo. **7 achados, 5 refutados, 2 sobreviventes, os dois baixos, corrigidos no `19fab9e`:**

1. **A trava de mesa exigia que o CHECK estivesse na migration do lote** — o procedimento documentado de mudar um teto
   (migration nova com `drop`/`add`) a deixaria vermelha. Agora ela confere a migration que CRIOU o CHECK e o teto
   VIGENTE; o caso sintético chama o casador real.
2. **A auto-sabotagem S1–S6 testava uma cópia da consulta**, não a asserção. Agora C1, C2, C3, C7a e C7b são funções, e a
   sabotagem chama a mesma função.

Os refutados: o universo sem `text[]`/domínio aninhado (declarado; não há domínio); o patrimônio sem caso na cobertura
do import (coberto em `plano.test.ts:743`); a prova de que a RPC não alonga é prosa (o código está correto; uma varredura
executável dos corpos é melhoria, não lacuna); o import com 23514 sem teste integrado e o "backup fica" (o código descarta,
corretamente — §2); a carga global sem teto (`carga.ts` é intocável pela ordem).

**A re-revisão** (duas lentes sobre as correções, cada achado com um cético), até limpar:
- **1ª passada (SHA `7a7f586`):** 2 achados, 1 sobrevivente — nas funções das asserções o filtro do `count` e o da lista
  eram escritos à parte, e a sabotagem só olhava a lista. Corrigido no `d05a52a` (um conjunto `ruim` só; a sabotagem
  exige a contagem E a lista). Refutado: o `like` com `_` como curinga (trocado por `position` mesmo assim).
- **2ª passada (SHA `d05a52a`):** 2 achados, 1 sobrevivente — o casador da trava de mesa não reconhecia `drop constraint
  … cascade|restrict`. Corrigido no `8bc70ba` (com o caso sintético dos três sufixos contra o casador real). Refutado: a
  ligação função → `assert_zero_de` não exercitada pela S1–S6 (o injetor a prova para C1, C2, C3).
- **3ª passada (SHA `8bc70ba`):** 2 achados, 1 sobrevivente — o casador não seguia `rename constraint`, `drop column`,
  `drop table` nem `alter table if exists`. Corrigido no `1fc3b22`. Refutado: a S4 só exercita `octet_length` (as três
  formas erradas estão na evidência A, executada).
- **E a troca de abordagem:** as três passadas acharam bordas cada vez mais hipotéticas da RÉPLICA do casador; a autoridade
  é a trava de catálogo no CI (que acusaria cada uma). O ciclo parou aqui, registrado (PLAN-F66B §9). **O SHA de código
  congelado é o `1fc3b22`.**
