# PLAN-F66B — O comprimento vira regra do banco

Ordem: [`prompts/F66B-comprimento-vira-regra-do-banco-ultracode.md`](prompts/F66B-comprimento-vira-regra-do-banco-ultracode.md)
(os 24 fatos no cabeçalho, as três decisões do Johnny de 12/11/2026). Ficha: `PLANO-MULTIEMPRESA.md` §7 → F66B. Branch
`f66b-comprimento-vira-regra-do-banco`, versão **1.72.0**. Escrito em 12/11/2026, **antes** do primeiro commit que toca
`supabase/`, `src/` ou `scripts/`.

> **Em uma frase.** As 65 colunas `text` das 20 tabelas de `k_negocio` ganham, em quatro migrations por família
> (`0181`–`0184`, na ordem de lock das `0175`–`0178`), um `CHECK (char_length(<col>) <= <N>)` validado e chamado
> `<tabela>_<coluna>_tamanho`; o teto de cada uma é ≥ todo caminho que grava nela e ≥ o maior valor vivo nos dois bancos;
> a fonte única dos tetos (`src/lib/validators/tetos-coluna.ts`) alimenta a trava de mesa, a frase pt-BR do `23514` e o
> bloco de contagem; e nenhuma linha muda — o `relfilenode` das 20 é o portão.

---

## 0. O "antes" — o que foi medido, e por qual canal

**O conector da Supabase desta sessão está ligado a OUTRA conta.** `list_projects` devolve um projeto só ("Invoice
Control", que não é da WAP), e `execute_sql` nos dois refs da WAP responde `MCP error -32600: You do not have permission to
perform this action` — o mesmo quadro da v1.71.2 (memória "conector Supabase em outra conta"). Não é transitório nem
classificador: só o Johnny reconecta. Pela ordem ("Bloqueios reais"), **nada que dependa do banco vivo pelo MCP acontece
sem ele** — nem a impressão "antes" por catálogo, nem a contagem SQL que é o portão de cada lote, nem apply. O conector é
reconferido a cada marco da run.

O que foi medido mesmo assim, só leitura, só números:

| o quê | canal | onde | resultado |
|---|---|---|---|
| o universo (colunas `text` das 20) e os 36 CHECK de `public` | a cadeia inteira `0001`–`0180` aplicada num PostgreSQL 17.5 descartável (PGlite, na mesa, fora do projeto) — o mesmo esquema que o CI monta | `f66b-evidencias/antes/universo-mesa.txt`, `checks-mesa.txt` | **65 colunas `text` + 1 `text[]`**; nenhuma `varchar`/`char`/domínio; **36 CHECK** (a lista da ficha) |
| o máximo vivo de cada coluna | a API de leitura do app, com a sessão de CONSULTA (a RLS de quem lê), pelo `scripts/comprimento/medir-maximos.mts` (molde `scripts/colaboradores/medir-uso.mts`, v1.71.2) — só números | `f66b-evidencias/antes/maximos-{producao,ensaio}-api.json` | **17 das 20 tabelas** nos dois bancos; `eventos_admin`, `import_logs` (leitura só de administrador) e `senhas_acesso` (nenhuma leitura pela API) ficam **"não legível"** — nunca zero |
| a contagem de violação por coluna, a impressão "antes" (constraints, `relfilenode`, `prosrc`, policies, advisors) | **o MCP** (`execute_sql` só leitura) | `f66b-evidencias/contagem-violacao.sql` (o bloco, o MESMO nos dois bancos) e `f66b-evidencias/impressao-f66b.sql` | **PENDENTE** — caminho B (§7) |

A medição pela API é a régua da **escolha** do teto (decisão 2b); o **portão** do apply continua sendo o bloco SQL pelo
MCP, imediatamente antes de cada lote, nos dois bancos. Sem ele, nenhum lote é aplicado.

---

## 1. Os 24 fatos, remedidos

Remedidos em 12/11/2026 contra o disco, o git, a cadeia de migrations na mesa e a API dos dois bancos (sete leitores
paralelos). `=` confirma; `⚠` diverge, com o número medido — **a medição ganha**; `◻` não remedido (sem MCP).

| # | o fato diz | medido | |
|---:|---|---|---|
| 1 | `origin/main` `0a3a586`; tag `v1.71.2` em `8f4d2ce`; 1.71.2; última `0180`; primeira `0181`; versão `1.72.0`; checks `verificar` e `banco-sem-docker` | igual (`git log`, `package.json`, `ls supabase/migrations`) | = |
| 2 | 264 arquivos · 8.103 testes; 54 roteiros · 1.153 asserções; injetor 156/156; smoke 109 OK · 1 aviso · 0 falha | **264 · 8.103** (mesa, 12/11 15:15, `npm run test` verde); 54 roteiros + `_asserts.sql`; teto do injetor **156** (`mutacoes.test.mts:333`); as asserções e o smoke são do CI/da Frente G | = |
| 3 | o mapa do `CLAUDE.md` bate | os 25 diretórios de `src/lib`, os 12 de `src/components` e os **14** `CLAUDE.md` aninhados são os do mapa | = |
| 4 | 36 CHECK em `public`; 7 citam comprimento; nas 20, só 2 com máximo | **36** na cadeia (mesa); as 7 da ficha; nas 20, `anotacao_texto_len` (≤ 2.000) e `unidades_apelidos_apelido_tamanho` (2..80), as duas com `char_length(btrim(x))` (`0017:12`, `0139:199`). ⚠ **As duas limitam o valor APARADO**: `btrim` sem segundo argumento tira só espaço — um valor com 1 MB de espaço nas pontas passa nas duas (decisão 3). Nos bancos vivos: ◻ (MCP) | ⚠ |
| 5 | 65 colunas de texto (e 7 `jsonb`); máximo < 200 em 64, `relatorios_gerados.observacao` 505 | **65 `text` + 1 `text[]`** (`movimentacoes.itens_faltantes`); produção pela API: < 200 em todas as legíveis menos `relatorios_gerados.observacao` **505**; ⚠ `lancamentos_item.observacao` **192** (era 184) | ⚠ (deriva) |
| 6 | o máximo vivo das colunas sem Zod (24/09) | remedido pela API (tabela do §2): produção quase igual à ficha (`colaborador_atual` 62, `pendencia` 15 — eram 64 e 38); ⚠ **o ensaio tem valores maiores que produção** (o seed fictício): `colaborador_atual` 94, `movimentacoes.colaborador` 93, **`setor_atual` e `movimentacoes.setor` 84 — acima do teto do import (80)**, `pendencia` 57, `patrimonio` 19 | ⚠ |
| 7 | 79 `.max(` em 16 arquivos; `relatorios.ts:35`; `LIMITES_CAMPO_PLANO` com 18 campos | 79 linhas em 16 arquivos = **76 chamadas Zod** + 2 `Math.max` (`item.ts:323`, `tipo-item.ts:70`) + 1 comentário (`termo.ts:15`); 18 campos (`limites.ts:121-139`) | = |
| 8 | uma coluna, vários tetos (`service_tag` 100/60/60; `observacoes` 2.000/500/500; colaborador 80/120; modelo 120/60) | ⚠ **o caso é mais geral e pior**: muitas telas gravam SEM `.max()` — `service_tag` na compra (`compra.ts:27-30`) e no substituto da devolução (`devolucao-fornecedor.ts:37-40`); marca, modelo, hostname, memória, armazenamento, processador e fornecedor na compra, na devolução e na ficha; `movimentacoes.motivo/colaborador/setor/chamado` nas telas de movimentação. O `compra.ts:17` (60) é o `opcionalCurto` de telefone/IMEI/Pulsus, não a service tag. O nome do colaborador: 80 (cadastro), 120 (lançamento, import), **200** (termo, `termo.ts:29`), sem teto (movimentação) | ⚠ |
| 9 | a validação por linha do import existe (F56) | igual: `plano.ts:340-352` itera `LIMITES_CAMPO_PLANO` e bloqueia `valor_longo_demais` depois das transformações; o Zod do `aplicarImport` (`importar.ts:155-180`) usa a mesma constante. **Nenhuma chave do plano sem teto** (§3) | = |
| 10 | o import aborta inteiro; `RECUSAS_DA_RPC` trata `23514` | igual (`importar.ts:122-133`, `:726-728`, `:757`); a orquestradora vigente é a da `0140:424`; `import_criar_ativos`/`import_lancar_movimentacoes` são as da `0131` | = |
| 11 | 16 `registrarEventoAdmin(`; 8 funções SQL; `createAdminClient` 66/18 | ⚠ **15 chamadas** (16 só contando a definição, `auditoria-registro.ts:27`); 8 funções SQL (todas com `acao` literal); `createAdminClient(` **32 linhas em 16 arquivos** (`src` + `scripts`, fora testes, definições incluídas) — a base é essa | ⚠ |
| 12 | `CONSTRAINTS_TRADUZIDAS` 19 entradas, 6 `check` | ⚠ **17 entradas** (6 `check`, 8 `indice-unico`, 3 `unique-nomeada`); nenhuma das duas de comprimento tem frase; um `23514` de comprimento cai no fallback "Não foi possível concluir a operação." | ⚠ |
| 13 | edição de `motivos.codigo` sem `.max()`; criação 40 | igual (`admin.ts:347` / `:336-341`); ⚠ a edição **não grava** `codigo` (só o usa no `.eq`, `actions/admin.ts:763`) — o `.max(40)` é coerência, não caminho de escrita | = (nuance) |
| 14 | o Zod conta UTF-16; `char_length ≤ length` | ⚠ **o Zod do projeto (`^4.6.5`) conta CODE POINTS desde a 4.5** (Context7, `/colinhacks/zod/v4.6.5`, blog `zod-4-5`: "`.max()` … counted UTF-16 code units" → agora code points) — mede o MESMO que o `char_length`; a conclusão vale (nada que o `.max(N)` aceita o CHECK recusa). O motor do import mede `valor.length` (UTF-16), mais estrito. PG 17: `char_length` "number of characters" (`functions-string.html`) | ⚠ (premissa; conclusão =) |
| 15 | `movimentacoes` 3.631 linhas, `ativos` 1.649 | ⚠ pela API: produção **3.960** e **1.632**; ensaio 3.245 e 1.606; os bytes ◻ (MCP). PG 17 (`sql-altertable.html`): `ADD CONSTRAINT … CHECK` toma ACCESS EXCLUSIVE e "requires scanning the table … but does not require a table rewrite"; várias subcomandos "combined into a single pass" | ⚠ (deriva) |
| 16 | o `apply_migration` é atômico; o CI (`psql -f`) não | igual (ADR-003, RUNBOOK, memória F63) | = |
| 17 | o instrumento "antes/depois" da F66 | existe (`f66-evidencias/impressao-*.sql`); a F66B acrescenta as constraints `contype = 'c'` com md5 de `pg_get_constraintdef` (`f66b-evidencias/impressao-f66b.sql`) | = |
| 18 | os rollbacks F62–F66; a expectativa é nenhum precisar do da F66B antes | ⚠ **medido na mesa e no código**: `f63`/`f64`/`f65_rollback.sql` comparam uma impressão das tabelas que inclui TODA constraint (`con|…|pg_get_constraintdef`, `f65_rollback.sql:51-52`) com uma constante do "antes" (`k_pre_0159/0162/0165`) — com os CHECK no lugar elas reprovam. A saída é a da F66 com a F63: eles rodam o `F66B-desfaz.sql` antes (decisão 14) | ⚠ |
| 19 | o conferidor de formas (271 pontos, 100.549 linhas, 0 recusadas na F66) | ◻ — roda na Frente G, contra os dois bancos, depois do apply | ◻ |
| 20 | a restauração de backup antigo pode dar `23514` | igual: `restaurar.mjs:277` insere o que o backup tem; o conteúdo dos objetos não é lido | = |
| 21 | o `unaccent` alonga a chave | ⚠ **não há `unaccent`** (é extensão; a `0112:31` o proíbe). As três chaves (`colaborador_chave`, `item_chave`, `vocabulario_chave`) usam `normalize` (NFC ou NFD), `translate`, `regexp_replace`, `btrim` e `lower` — e **alongam até 3×**: o NFC decompõe os caracteres de exclusão de composição (máximo 3, ex. U+FB2C, U+1D160), o `lower` do U+0130 dá 2 code points, e no `vocabulario_chave` a sobra do NFD fora de U+0300–U+036F chega a 3 (Hangul LVT, U+0CCB). Medido no Unicode do Node (17.0, ICU 78.3); a prova de PG é o roteiro (decisão 4) | ⚠ |
| 22 | os gerados no servidor têm formato | `arquivo_path` = `<uuid>.docx` = **41**; `senhas_acesso.hash` = `scrypt$<32 hex>$<128 hex>` = **168** fixo; `backup_path` = `import/filial-<id>/<ISO>.json` ≤ **49**; `arquivo_hash` sha-256 = 64, mas o Zod aceita **128** (`MAX_ARQUIVO_HASH`) | = |
| 23 | os bloqueios recentes (MCP desligado, classificador) | ⚠ **hoje: o conector ligado à conta errada** (§0) | ⚠ |
| 24 | as regras 1, 2, 3, 5, 6, 7, 8 | documentação oficial usada: PG 17 (`sql-altertable`, `functions-string`, `ddl-constraints`, `errcodes-appendix`, `protocol-error-fields`, `catalog-pg-constraint`), PostgREST (`references/errors`), Zod 4.6.5 (Context7) | = |

**Medido na mesa (PGlite, PG 17.5), não só lido:** a mensagem do `23514` é `new row for relation "<t>" violates check
constraint "<nome>"`, igual em INSERT e UPDATE, e o erro traz `constraint` com o nome; NULL passa; um CHECK sobre coluna
GERADA funciona; `char_length('ççç') = 3` passa num `<= 3`. A árvore (`conbin`) de `char_length(a) <= 40` é
`{OPEXPR :opno 523 … {FUNCEXPR :funcid 1381 … {VAR … :varattno n} …} {CONST :consttype 23 …}}` — `length` (1317),
`octet_length` (1374) e `character_length` (1369) têm OUTRO `funcid`, e `40 >= char_length(a)` é OUTRO `opno` (525).

---

## 2. A tabela-verdade das 65 colunas (decisões 1 e 2)

**Classes:** **Z** texto livre com Zod · **L** texto livre sem Zod · **D** derivado (gatilho ou coluna gerada) · **G**
gerado no servidor · **V** código/vocabulário com formato. **Vivo** = o máximo de `char_length` pela API, produção /
ensaio (`—` não legível pela consulta: o portão SQL mede). **Regra:** (a) ≥ o MAIOR teto entre os caminhos com Zod ou
`LIMITES_CAMPO_PLANO`; (b) ≥ o vivo nos dois bancos; (c) sem Zod no caminho: o primeiro degrau da escada
`40 · 80 · 120 · 200 · 320 · 500 · 2000` que seja ≥ 2× o vivo e ≥ o irmão de mesmo significado; (d) derivado: 3× a origem
(decisão 4); (e) gerado: o formato e um degrau de folga (decisão 5); (f) formato fechado. Nenhum teto abaixo de (a) ou (b).

"Sem `.max()`" quer dizer: a tela grava sem teto hoje; depois da F66B o banco é o limite e a frase do `23514` chega a
ela (decisão 6 — nenhum teto de tela muda; backlog).

### Lote 1 — `0181` — os cadastros do acervo

| coluna | cl. | caminhos que gravam (teto) | vivo | **teto** | regra |
|---|---|---|---:|---:|---|
| `colaboradores.nome` | Z | `colaborador.ts:12` (80: criar, editar, inline); `consolidarColaboradores` `actions/colaboradores.ts:307-308` copia a grafia de `movimentacoes.colaborador`/`lancamentos_item.colaborador` (≤ 120 pelo banco); `seed.ts:885`, `smoke-prod.mjs:980` | 48 / 0 | **120** | (a): a consolidação copia o teto das origens |
| `colaboradores.matricula` | Z | `colaborador.ts:26` (40) | 0 / 0 | **40** | (a) |
| `colaboradores.setor` | Z | `colaborador.ts:27` (80) | 10 / 0 | **80** | (a) |
| `colaboradores.nome_chave` | D | gerada, `colaborador_chave(nome)` (`0112:89`) | 48 / 0 | **360** | (d) 3 × 120 |
| `itens.nome` | Z | `item.ts:280` (80), `item.ts:303` inline (80); `carga.ts:469`, `seed.ts:920`, `fixtures-passe2.ts:83` | 22 / 26 | **80** | (a) |
| `itens.nome_chave` | D | gerada, `item_chave(nome)` (`0125:103`) | 22 / 26 | **240** | (d) 3 × 80 |
| `termos_gerados.tipo` | V | `termo.ts:86` (`z.enum` de 7, o maior 35); CHECK `termos_gerados_tipo_check` | 32 / 25 | **40** | (f) 35 → degrau 40 |
| `termos_gerados.colaborador` | Z | `termo.ts:29` (200), `persistirTermo` `termos.ts:514` | 62 / 13 | **200** | (a) |
| `termos_gerados.arquivo_path` | G | `termos.ts:~495` `${randomUUID()}.docx` (41) | 41 / 41 | **80** | (e) 41 → degrau 80 |
| `anotacoes.texto` | Z | `ativo.ts:64` (2.000); as RPCs `*_com_anotacao` gravam texto composto no TS (≤ ~613: reabrir pendência `pendencias.ts:442-446`, 30 + item 80 + 500) | 71 / 0 | **2000** | (a); nova `anotacoes_texto_tamanho` AO LADO da `anotacao_texto_len` (decisão 3) |

### Lote 2 — `0182` — o movimento do acervo

| coluna | cl. | caminhos que gravam (teto) | vivo | **teto** | regra |
|---|---|---|---:|---:|---|
| `ativos.patrimonio` | V | canônico 10 (compra `compra.ts:21-23`, correção `patrimonio.ts:45-53`, devolução `devolucao-fornecedor.ts:30-35`); import `limites.ts:122` (60) + RPC `0132:363` (P0001 > 60); `carga.ts:314` | 11 / 19 | **60** | (a) |
| `ativos.patrimonio_original` | V | compra (10); import `limites.ts:123` (60) | 11 / 19 | **60** | (a) |
| `ativos.marca` | L | import (60); compra `compra.ts:42`, devolução `:44` sem `.max()` | 8 / 14 | **60** | (a) ≥ (c) 40 |
| `ativos.modelo` | L | import (120); compra `:43`, devolução `:45` sem `.max()` | 18 / 19 | **120** | (a) |
| `ativos.service_tag` | V | `definirServiceTag` `ativo.ts:106` (100); import (60); compra `compra.ts:27-30`, devolução `:37-40` sem `.max()` | 24 / 24 | **100** | (a) |
| `ativos.hostname` | L | import (60); ficha `ativo.ts:25`, devolução `:49` sem `.max()` | 14 / 14 | **60** | (a) ≥ (c) 40 |
| `ativos.memoria` | L | import (40); ficha `ativo.ts:22`, compra `:44`, devolução `:46` sem `.max()` | 25 / 25 | **80** | (c) 2×25 → 80 > (a) 40 |
| `ativos.armazenamento` | L | import (40); idem `:23/:45/:47` | 21 / 21 | **80** | (c) 2×21 → 80 |
| `ativos.processador` | L | import (80); idem `:24/:46/:48` | 28 / 28 | **80** | (a) = (c) |
| `ativos.fornecedor` | L | import (80); compra `:47` sem `.max()`; devolução herda (RPC) | 10 / 11 | **80** | (a) |
| `ativos.colaborador_atual` | D | gatilho `aplicar_movimentacao` copia `movimentacoes.colaborador` (`0150:369`); import `colaborador` (120, `0131:472`); estorno restaura; `carga.ts:401` | 62 / 94 | **120** | (a) = a origem |
| `ativos.setor_atual` | D | gatilho copia `movimentacoes.setor`; import `setor` (80); `carga.ts:402` | 45 / **84** | **120** | (b): o ensaio tem 84 > 80 do import → degrau 120 (= `movimentacoes.setor`) |
| `ativos.pendencia` | G | import constante ≤ 38 (`0131:393-399`); correção/definição só encurtam; o estorno restaura com `string_agg(trim(seg), '; ')` (`0150:160`, +1 por `;` sem espaço); `carga.ts:314` | 15 / 57 | **200** | (c) 2×57 → 120, um degrau acima pela restauração do estorno |
| `ativos.origem` | V | literais `'cadastro'` (8), `'importacao'` (10); `carga.ts:314` | 10 / 10 | **40** | (c) |
| `ativos.observacoes` | Z | ficha `ativo.ts:36` (2.000); substituto da devolução `devolucao-fornecedor.ts:20-23/:51` (500 → **2.000**, decisão 6); import (500); compra grava `''` | 127 / 163 | **2000** | (a) |
| `ativos.telefone` | Z | ficha `ativo.ts:31`, compra `compra.ts:53` (`opcionalCurto`, 60) | 14 / 0 | **60** | (a) |
| `ativos.imei` | Z | `ativo.ts:32`, `compra.ts:54` (60) | 15 / 0 | **60** | (a) |
| `ativos.pulsus` | Z | `ativo.ts:33`, `compra.ts:55` (60) | 3 / 0 | **60** | (a) |
| `movimentacoes.motivo` | V | telas sem `.max()` (`movimentacao.ts:322/328/353`); a FK composta `movimentacoes_motivo_fkey` → `motivos(empresa_id, codigo)` obriga a igualdade | 24 / 17 | **40** | = `motivos.codigo` |
| `movimentacoes.colaborador` | L | import (120); telas `movimentacao.ts:323/329/346` sem `.max()`; estorno copia | 64 / 93 | **120** | (a) |
| `movimentacoes.setor` | L | import (80); telas `:324/:330/:347` sem `.max()` | 45 / **84** | **120** | (b) 84 → 120 |
| `movimentacoes.chamado` | V | import (40); telas só regex de dígitos (`movimentacao.ts:277-284`); devolução herda | 28 / 13 | **80** | (c) 2×28 → 80 > (a) 40 |
| `movimentacoes.observacao` | Z | 500 em todas (`movimentacao.ts:292-295/378/459`, `compra.ts:60`, `devolucao-fornecedor.ts:52/61`, `dev-destrutivo.ts:25`); import constante 25 | 162 / 87 | **500** | (a) |
| `movimentacoes.chamado_fornecedor` | Z | `movimentacao.ts:300-304` (200); devolução herda | 13 / 0 | **200** | (a) |
| `pendencias_item.item` | D | gatilho, um por elemento de `itens_faltantes` (`0150:228`; o elemento não tem `.max()`, `movimentacao.ts:354`) | 10 / 14 | **80** | (c) 2×14 → 40, sobe ao irmão `itens.nome` (80) |
| `pendencias_item.colaborador` | D | gatilho, `coalesce(movimentacoes.colaborador, ativos.colaborador_atual)` | 37 / 42 | **120** | = as origens |
| `pendencias_item.status` | V | `'aberta'`/`'resolvida'` (CHECK de lista) | 9 / 6 | **40** | (f) |
| `pendencias_item.desfecho` | V | `'recuperado'`/`'baixa'` (CHECK de lista) | 10 / 0 | **40** | (f) |
| `pendencias_item.observacao` | Z | `pendencia-item.ts:17` (500) | 19 / 0 | **500** | (a) |
| `lancamentos_item.chamado` | V | `item.ts:20` (20); os estornos copiam o original (`estorno.ts:93`); a movimentação não manda chamado ao item (`movimentacoes.ts:587-623`) | 10 / 13 | **20** | (a) |
| `lancamentos_item.colaborador` | L | `item.ts:25` (120); item junto da movimentação herda `movimentacoes.colaborador` (120); pendência/estornos copiam | 45 / 13 | **120** | (a) |
| `lancamentos_item.observacao` | Z | `item.ts:30` (500); os textos derivados cortam em 500 (`regularizacao.ts:136`, `estorno.ts:95`, `texto-baixa.ts`); **a transferência NÃO corta**: `transferencia.ts:43-53` = 19 + nome da filial (80) + 3 + 500 = **602** | 192 / 137 | **2000** | (a) 602 → degrau 2000 |

### Lote 3 — `0183` — o vocabulário

| coluna | cl. | caminhos que gravam (teto) | vivo | **teto** | regra |
|---|---|---|---:|---:|---|
| `import_prefixos_patrimonio.prefixo` | V | só a migration `0139:457`; CHECK `^[A-Z]{2,4}$` | 3 / 3 | **4** | (f) o formato |
| `import_termos_categoria.termo` | V | só a migration `0139:428` | 8 / 8 | **40** | (c) |
| `import_termos_categoria.rotulo` | V | só a migration | 8 / 8 | **40** | (c) |
| `import_termos_estado.termo` | V | só a migration `0139:437` | 10 / 10 | **40** | (c) |
| `import_termos_estado.rotulo` | V | só a migration | 10 / 10 | **40** | (c) |
| `unidades_apelidos.apelido` | Z | `admin.ts:319/323` (`MAX_TAMANHO_APELIDO` 80); a `0139` limita o APARADO (2..80) | 17 / 20 | **80** | (a); nome `unidades_apelidos_apelido_bruto_tamanho` (decisão 3) |
| `unidades_apelidos.apelido_chave` | D | gerada, `vocabulario_chave(apelido)` (`0139:150`) | 17 / 20 | **240** | (d) 3 × 80 |
| `tipos_item.slug` | V | `tipo-item.ts:21-28` (regex, 30); CHECK `tipos_item_slug_formato` | 15 / 10 | **30** | (a) = (f) |
| `tipos_item.rotulo` | Z | `tipo-item.ts:29-33` (60) | 15 / 14 | **60** | (a) |
| `motivos.codigo` | V | `admin.ts:336-341` (40); a edição `:347` não grava (ganha `.max(40)`, decisão 6) | 24 / 17 | **40** | (a) |
| `motivos.rotulo` | Z | `admin.ts:342/348` (80) | 27 / 27 | **80** | (a) |
| `kits_modelos.nome` | Z | `kit.ts:135` (80) | 0 / 0 | **80** | (a) |
| `filiais.slug` | V | `admin.ts:287-295` (regex, sem `.max()`) | 14 / 14 | **40** | (c) 2×14 → 40 = o irmão `empresas.slug` (≤ 40) |
| `filiais.nome` | Z | `admin.ts:286/302` (80) | 15 / 14 | **80** | (a) |
| `filiais.cidade` | Z | `admin.ts:299/310` (120) | 20 / 20 | **120** | (a) |

### Lote 4 — `0184` — os registros

| coluna | cl. | caminhos que gravam (teto) | vivo | **teto** | regra |
|---|---|---|---:|---:|---|
| `relatorios_gerados.observacao` | Z | `actions/relatorios.ts:35` (2.000); errata `gerar-errata-truncamento.ts:47-57` (754) | **505** / 0 | **2000** | (a) |
| `import_logs.modo` | V | `import_gravar_trilha` literal `'substituir'` (`0131:655`); CHECK `= 'substituir'` | — / — | **40** | (f) |
| `import_logs.arquivo_hash` | G | sha-256 hex (64) do motor; o Zod do `aplicarImport` aceita `MAX_ARQUIVO_HASH` 128 (`importar.ts:184`) | — / — | **128** | (a) |
| `import_logs.backup_path` | G | `importar.ts:619` `import/filial-<id>/<ISO>.json` (≤ 49); a RPC só exige o prefixo e o objeto no bucket | — / — | **120** | (e) 49; o formato da F67 (empresa no prefixo, ≈ 94) cabe → 120 |
| `eventos_admin.acao` | V | literais de `AcaoAdmin` (≤ 26, `auditoria.ts:60-88`); as 8 funções SQL (≤ 26) | 26 (ficha) | **80** | (c) 2×26 → 80 |
| `eventos_admin.alvo` | L | `auditoria-registro.ts:33` — e-mail (sem `.max()`, até 320), slug (40), rótulo de senha (80), `filial → apelido` (163); SQL: rótulo do ativo (≤ 100), `item — filial` (163), `'RESETAR TUDO'`, `profiles.nome` (sem teto, fora das 20) | 36 (ficha) | **500** | e-mail ≥ 320 → degrau 500: `registrarEventoAdmin` ENGOLE o erro (`auditoria-registro.ts:37-58`) — um teto justo perderia a trilha em silêncio |
| `senhas_acesso.rotulo` | Z | `senha.ts:6` (80) | — / — | **80** | (a) |
| `senhas_acesso.hash` | G | `hashSenha` `senha-sessao.ts:32-36` = 168 fixo | 168 (ficha) | **200** | (e) |

**Fora do universo, declarado:** `movimentacoes.itens_faltantes` é `text[]` (até 4 elementos de até 14 caracteres hoje).
Um CHECK sobre os elementos exigiria função (`array_to_string`, `cardinality`, `unnest`) — proibido nesta fase ("CHECK por
função"). O elemento vira `pendencias_item.item`, que tem teto (80): um elemento longo recusa a movimentação inteira pelo
gatilho. Backlog. E os 7 `jsonb` (a ficha).

**As exceções nominais:** **nenhuma.** Toda coluna das 65 tem o CHECK (decisões 3–5). A lista existe (fonte única em
`supabase/tests/comprimento_por_coluna.sql`, `k_comprimento_excecao` + `k_comprimento_excecao_motivo`) e é conferida nos
dois sentidos — vazia hoje.

---

## 3. O mapa do import (decisão 9)

O plano vai à RPC sem tradução: `{ ...plano, confirmacao }` como `p_plano` (`importar.ts:676-678`); as chaves do `jsonb`
são os nomes de `AtivoPlano` (`import/tipos.ts:106-125`). As 18 chaves têm teto em `LIMITES_CAMPO_PLANO`; o motor
(`plano.ts:340-352`) mede o valor FINAL (depois de `limparCampo`, `modeloSemMarca`, `normalizarServiceTag`,
`extrairChamado`, `parseColaboradorInventario`, o patrimônio canônico) e bloqueia `valor_longo_demais`; o Zod do
`aplicarImport` (`importar.ts:155-180`) reconfere com a MESMA constante.

| campo de `AtivoPlano` | `LIMITES` | coluna(s) que a RPC grava | transformação na RPC (`0131`) | alonga? | teto do banco |
|---|---:|---|---|---|---:|
| `patrimonio` | 60 | `ativos.patrimonio` | nenhuma (`import_validar_plano` recusa `''` e > 60, `0132:363`) | não | 60 |
| `patrimonioOriginal` | 60 | `ativos.patrimonio_original` | `nullif(…,'')` | não | 60 |
| `serviceTag` | 60 | `ativos.service_tag` | `nullif` | não | 100 |
| `marca` | 60 | `ativos.marca` | `nullif` | não | 60 |
| `modelo` | 120 | `ativos.modelo` | `nullif` | não | 120 |
| `fornecedor` | 80 | `ativos.fornecedor` | `nullif` | não | 80 |
| `memoria` | 40 | `ativos.memoria` | `nullif` | não | 80 |
| `armazenamento` | 40 | `ativos.armazenamento` | `nullif` | não | 80 |
| `processador` | 80 | `ativos.processador` | `nullif` | não | 80 |
| `hostname` | 60 | `ativos.hostname` | `nullif` | não | 60 |
| `observacoes` | 500 | `ativos.observacoes` | `nullif` | não | 2000 |
| `colaborador` | 120 | `movimentacoes.colaborador` (ajuste), `ativos.colaborador_atual` (em uso/emprestado/reservado) | `nullif` | não | 120 · 120 |
| `setor` | 80 | `movimentacoes.setor`, `ativos.setor_atual` | `nullif` | não | 120 · 120 |
| `chamado` | 40 | `movimentacoes.chamado` | `nullif` | não | 80 |
| `categoria` | 30 | `ativos.categoria` (enum) | cast | — | (não é `text`) |
| `estadoAlvo` | 30 | `ativos.status` (enum) | cast | — | (não é `text`) |
| `dataEntrada`, `dataAjuste` | 10 | `movimentacoes.data` (`date`) | cast | — | (não é `text`) |
| — | — | `ativos.origem` | literal `'importacao'` (10) | — | 40 |
| — | — | `ativos.pendencia` | `concat_ws('; ', 'sem patrimônio físico', 'sem service tag')` (≤ 38) | — | 200 |
| — | — | `movimentacoes.observacao` | `'import startup ' || DD/MM/YYYY` (25) | — | 500 |
| `arquivoHash` (do plano) | 128 (`MAX_ARQUIVO_HASH`) | `import_logs.arquivo_hash` | `coalesce(…,'')` | não | 128 |
| — (servidor) | — | `import_logs.backup_path` | cru | não | 120 |
| — | — | `import_logs.modo` | literal `'substituir'` | — | 40 |

**A prova de que nada alonga:** a RPC só faz `nullif(x,'')` (devolve o MESMO texto ou NULL), cast para enum/data, e grava
constantes curtas; não há canonização, `upper`/`lower`, prefixo nem concatenação de campo do plano em SQL (a leitura do
corpo vigente da `0131`/`0140`, frente SQL). Logo `char_length(coluna) = char_length(campo) ≤ LIMITES[campo] ≤ teto`, para
toda coluna da tabela. **Não há buraco: o código do import não muda.** O ponto LATENTE achado: o `satisfies` de
`limites.ts:140-160` usa uma união literal, não `keyof AtivoPlano` — um campo novo em `AtivoPlano` ficaria sem teto sem
erro de compilação. A trava de mesa (decisão 7) passa a conferir que os campos `string` de `AtivoPlano` são EXATAMENTE as
chaves de `LIMITES_CAMPO_PLANO` (lidos do fonte), sem mudar o import.

O vocabulário do import (`import_prefixos_patrimonio`, `import_termos_*`) não tem escritor fora da migration `0139`;
`unidades_apelidos` tem escritor de tela (`actions/unidades-apelidos.ts:62`, Zod 80).

---

## 4. O desenho — as catorze decisões

1. **O universo.** Toda coluna `text`/`varchar`/`bpchar` das 20 (`pg_attribute`, `attisdropped = false`), lida do
   catálogo; hoje 65, todas `text` (nenhuma `varchar`, `char` ou domínio sobre `text`). `movimentacoes.itens_faltantes`
   (`text[]`) e os `jsonb` ficam fora, declarados (§2). A paridade dos dois bancos vivos é do portão SQL (◻ sem MCP); a
   da cadeia é a mesa (§0).
2. **A régua do teto**, coluna a coluna, como no §2: (a), (b), (c) com a escada `40 · 80 · 120 · 200 · 320 · 500 · 2000`,
   (d), (e), (f). Teto acima do maior caminho só com motivo escrito na tabela (`lancamentos_item.observacao` 2000,
   `ativos.pendencia` 200, `eventos_admin.alvo` 500, `pendencias_item.item` 80, `termos_gerados.tipo` 40).
3. **A forma e o nome.** `char_length(<col>) <= <N>`, sem `btrim` (o caminho sem Zod não apara, e o CHECK é o limite do que
   se GUARDA). NULL passa (PG 17, `ddl-constraints`: "satisfied if the check expression evaluates to true or the null
   value"). Nome `<tabela>_<coluna>_tamanho` (o maior, `import_prefixos_patrimonio_prefixo_tamanho`, tem 42 bytes < 63).
   Um `alter table` LITERAL por tabela com todas as `add constraint` dela, validado direto (a contagem é o portão).
   **As duas que já existem ficam como estão** (renomear nunca — nome é contrato de tradução), mas **NÃO viram exceção**:
   medido, as duas limitam o valor APARADO e deixam o valor GUARDADO sem teto (espaço nas pontas). Então:
   `anotacoes.texto` ganha `anotacoes_texto_tamanho` (o nome do padrão está livre — o da 0017 é `anotacao_texto_len`); e
   `unidades_apelidos.apelido`, cujo nome do padrão é da `0139`, ganha `unidades_apelidos_apelido_bruto_tamanho` — **a
   regra de nome alternativo**: quando `<t>_<c>_tamanho` já pertence a uma constraint anterior de OUTRA forma, o nome é
   `<t>_<c>_bruto_tamanho`, numa lista nominal (`k_comprimento_nome_alternativo`) que o catálogo confere (o nome do padrão
   existe, é de outra forma, e a alternativa é a canônica). Um segundo CHECK aqui não é redundante: é o que fecha a bomba
   de espaço.
4. **Os derivados (`*_chave`).** CHECK com **3×** a origem (não 2×: o fator medido é 3 — §1, fato 21):
   `colaboradores.nome_chave` 360, `itens.nome_chave` 240, `unidades_apelidos.apelido_chave` 240. A prova, no roteiro de
   comportamento: a função de chave aplicada a uma origem NO TETO, com os caracteres que mais expandem (U+FB2C, U+0130,
   Hangul LVT), cabe no teto da chave; e a mesma origem dá uma chave MAIOR que a origem (o teto igual ao da origem seria o
   bug latente).
5. **Os gerados no servidor.** O teto do formato com um degrau de folga escrito: `arquivo_path` 80 (41), `senhas_acesso.hash`
   200 (168), `backup_path` 120 (49 hoje, ≈ 94 com a empresa no prefixo da F67), `arquivo_hash` 128 (o Zod), `pendencia`
   200, `import_logs.modo` 40. Nenhum é exceção.
6. **Os dois ajustes da ficha.** `ativos.observacoes`: as DUAS telas que gravam nela (a ficha, `ativo.ts:36`, e o
   substituto da devolução ao fornecedor, `devolucao-fornecedor.ts:20-23/:51` — que grava em `ativos.observacoes` pela
   RPC, medido) passam a usar a constante da fonte (2.000); a devolução sobe de 500 para 2.000 **só no campo do
   substituto**; a observação da MOVIMENTAÇÃO da devolução (`:61`, `movimentacoes.observacao`) fica em 500. O
   `LIMITES_CAMPO_PLANO.observacoes` fica em 500, declarado. `motivos.codigo` na edição: `.max(40)`. **Nenhum outro teto
   de tela muda**; os pares divergentes e as telas sem `.max()` (§2, fato 8) vão para a ata e o backlog, e o banco fica com
   o maior.
7. **A fonte única e a trava de mesa.** `src/lib/validators/tetos-coluna.ts` (folha: sem `'use client'`, sem import de
   `queries/`): `TETOS_COLUNA = { tabela: { coluna: { teto, rotulo } } }`, os lotes, e `nomeDaConstraintDeTamanho()` (com
   o nome alternativo). A trava `tetos-coluna.test.ts`: (i) lê as migrations pelo léxico único (`comandosDoTexto`,
   `listarMigrations`) e extrai todo `add constraint <nome> check (char_length(<col>) <= <N>)` — o conjunto bate com a fonte
   NOS DOIS SENTIDOS (nome, coluna, N); (ii) a lista de CAMINHOS (§2) com uma SONDA por caminho de tela (o schema real
   importado: aceita o teto declarado, recusa o teto + 1, e o teto ≤ o da coluna); os caminhos SEM `.max()` ficam numa
   lista nominal e a sonda confirma que continuam sem teto (`teto da coluna + 1` passa) — quem puser um teto neles tem de
   movê-lo para a lista com teto; (iii) `LIMITES_CAMPO_PLANO[campo] ≤` o teto de toda coluna que o campo alimenta, e os
   campos `string` de `AtivoPlano` = as chaves de `LIMITES` (lidos do fonte); (iv) a cópia dos tetos e das listas no roteiro
   de catálogo bate com a fonte. **O que ela NÃO pega:** um caminho de escrita NOVO que ninguém declare na lista (a rede é
   o próprio CHECK + a frase do `23514`); um caminho sem `.max()` que ganhe um teto MAIOR que o do banco (continua "sem
   teto" para a sonda).
8. **`comprimento_por_coluna.sql`.** `k_negocio` é CÓPIA da fonte única (`catalogo_policies.sql`), amarrada pelo describe
   14 de `catalogos-seguranca.test.ts` (o molde das cópias da F65 — nada de lista nova). O universo sai de `pg_attribute`.
   A árvore (`conbin`, não o texto): `OPEXPR` com o `opno` de `<=(int4,int4)`, primeiro argumento `FUNCEXPR` com o
   `funcid` de `char_length(text)` sobre o `VAR` da coluna (`varattno` = o `attnum`), segundo argumento `CONST` int4 não
   nulo; o N sai do `pg_get_constraintdef` e é conferido contra a cópia dos tetos (`k_comprimento_teto`, amarrada pela
   trava de mesa). As exceções em arrays paralelos com motivo (o molde de `definer_sem_tenant.sql`); `convalidated`
   exigido; e a auto-sabotagem em subtransação (coluna sintética, CHECK retirado, CHECK `not valid`, `octet_length`) que
   prova que cada asserção sabe ficar vermelha.
9. **O mapa do import** (§3): sem buraco; o import não muda.
10. **A tradução do `23514`.** Um ramo só, em `erros-do-banco.ts` (a trava `casamento-por-texto.test.ts` proíbe casar texto
    de erro fora dele): `fraseDeTamanho(mensagem)` lê o nome da constraint na mensagem do Postgres (`violates check
    constraint "<nome>"`, medido na mesa) e devolve *"O campo <rótulo> aceita no máximo <N> caracteres."* com o rótulo e o
    teto da FONTE; `traduzErroBanco` (`erros.ts`) o chama antes dos ramos genéricos. As duas de comprimento anteriores
    (`anotacao_texto_len`, `unidades_apelidos_apelido_tamanho`) ganham frase própria. `erros-do-banco-sql.test.ts` confere:
    todo CHECK `_tamanho` vivo nas migrations tem frase, e toda frase cita constraint viva. O import (`importar.ts:757`)
    herda a frase pelo mesmo `traduzErroBanco`; `RECUSAS_DA_RPC` já tem `23514` (o backup é descartado, a transação já
    reverteu) — não muda.
11. **Os lotes.** `0181` cadastros (`colaboradores`, `itens`, `termos_gerados`, `anotacoes`) · `0182` movimento (`ativos`,
    `movimentacoes`, `pendencias_item`, `lancamentos_item`) · `0183` vocabulário (`import_prefixos_patrimonio`,
    `import_termos_categoria`, `import_termos_estado`, `unidades_apelidos`, `tipos_item`, `motivos`, `kits_modelos`,
    `filiais`) · `0184` registros (`relatorios_gerados`, `import_logs`, `eventos_admin`, `senhas_acesso`) — a ordem de
    tabela das `0175`–`0178`. Entre dois lotes o estado é repouso válido (umas tabelas com teto, outras sem: nada recusa o
    que se aceita hoje). Sem o lock em 2 s: registrar, repetir (três vezes em 30 min); persistindo, dividir por tabela.
12. **O que NÃO muda:** nenhuma função criada ou recriada (a RPC do import byte a byte), nenhuma policy, nenhuma coluna,
    nenhum `update`. A prova: a impressão antes × depois (constraints, `relfilenode` das 20, md5 do `prosrc`, as 62
    policies, advisors).
13. **O injetor.** Mutações de banco (o motor muta o banco descartável, não arquivos): o CHECK de uma coluna some; o CHECK
    vira `not valid`; o CHECK troca `char_length` por `octet_length`; o teto sobe sem a fonte; uma coluna `text` nova numa das
    20; e a RPC do import grava acima do teto quando o CHECK some (o roteiro de comportamento acusa). Teto exato no fim.
    "A exceção ganha uma coluna com CHECK" não é mutação de BANCO (é edição do roteiro): fica provada pela auto-sabotagem e
    pela evidência A6, e a ata diz por quê.
14. **O rollback e o encadeamento.** `supabase/rollback/F66B-desfaz.sql`: `alter table … drop constraint if exists`
    literal por nome, `0184` → `0181` (idempotente: serve ao apply parado entre lotes). Ensaiado por
    `supabase/tests/f66b_rollback.sql` até a impressão das constraints de antes da `0181` (o md5 medido no CI), com o irmão
    de mesa `rollback-f66b.test.ts`. Os rollbacks F62–F65 rodam o da F66B antes (fato 18, medido); o da F66 não precisa
    (policy não depende de CHECK) — medido no CI. Depois do rollback, a defesa volta a ser só o Zod; nenhum dado se perde.

---

## 5. As migrations, e a ORDEM DE ROLLBACK

| ordem | arquivo | `name` no MCP | classe | tabelas (ordem de lock) | CHECKs |
|---:|---|---|---|---|---:|
| 1 | `0181_comprimento_cadastros_do_acervo.sql` | `comprimento_cadastros_do_acervo` | ADITIVA | colaboradores, itens, termos_gerados, anotacoes | 10 |
| 2 | `0182_comprimento_movimento_do_acervo.sql` | `comprimento_movimento_do_acervo` | ADITIVA | ativos, movimentacoes, pendencias_item, lancamentos_item | 32 |
| 3 | `0183_comprimento_vocabulario.sql` | `comprimento_vocabulario` | ADITIVA | import_prefixos_patrimonio, import_termos_categoria, import_termos_estado, unidades_apelidos, tipos_item, motivos, kits_modelos, filiais | 15 |
| 4 | `0184_comprimento_registros.sql` | `comprimento_registros` | ADITIVA | relatorios_gerados, import_logs, eventos_admin, senhas_acesso | 8 |

**65 CHECK** (36 → 101 em `public`; de comprimento nas 20: 2 → 67). Cada arquivo: cabeçalho `-- classe: ADITIVA`,
`set lock_timeout = '2s';` / `reset lock_timeout;`, sem `begin`/`commit`, sem `update`, sem `cascade`, sem `not valid`, sem
DDL dinâmica; rollback no rodapé; `db:lock` e a entrada em `DA_F38` no mesmo commit.

**A ORDEM DE ROLLBACK (o inverso):** `0184` → `0183` → `0182` → `0181`, por `supabase/rollback/F66B-desfaz.sql`. Entre
fases: o da F66B vem ANTES dos da F65, F64, F63 e F62 (fato 18).

---

## 6. As travas, e por que nascem vermelhas

| trava | onde | vermelha antes da `0181` porque |
|---|---|---|
| o catálogo | `supabase/tests/comprimento_por_coluna.sql` | 65 colunas sem o CHECK (C1) |
| o comportamento | `supabase/tests/comprimento_comportamento.sql` | o teto + 1 passa; a RPC do import grava acima do teto |
| a mesa, Zod × banco | `src/lib/validators/tetos-coluna.test.ts` | a fonte tem 65 entradas que nenhuma migration limita |
| a tradução | `src/lib/supabase/erros-do-banco-sql.test.ts`, `erros-do-banco.test.ts` | a frase cita constraint que não existe |
| o import pela tela | `src/lib/import/comprimento-coluna.test.ts` | — (nasce verde: a validação já existe; prova a cobertura campo a campo) |
| o rollback | `supabase/tests/f66b_rollback.sql` + `rollback-f66b.test.ts` | — (nasce com a primeira migration) |

---

## 7. O portão — a contagem de violação e a impressão (caminho B enquanto o MCP faltar)

- **O bloco de contagem** (`scripts/comprimento/contagem-violacao.mts gerar`): um `do $f66b$ … $f66b$` só leitura
  (`transaction_read_only = on` antes de tudo), que pergunta ao banco quem ele é (`rotulo_de_ambiente()`), lê as 20 tabelas
  e devolve, por coluna, `max(char_length)` e o número de linhas acima do teto da FONTE — **só números** — num `raise
  exception` (nunca se confirma), embrulhado pelo invólucro do canal da F66 (`involucroDoCanal`). O texto é o MESMO nos dois
  bancos; a sabotagem (teto 0 numa coluna) é outro texto, que recusa fora do ensaio. Validado byte a byte (o comando tem de
  ser o que o gerador produz). `analisar` lê a resposta e dá o veredito: 0 em toda coluna.
- **A impressão** (`docs/f66b-evidencias/impressao-f66b.sql`): as constraints `contype = 'c'` de `public` (nome, tabela,
  md5 do `pg_get_constraintdef`), o `relfilenode` das 20, o md5 do `prosrc` de cada função de `public`, o md5 de
  `qual`/`with_check` das 62 policies — só nomes de esquema e hashes. Mais os advisors de segurança e de desempenho.
- **A ordem, em cada banco (ensaio primeiro, produção em até 24 h):** impressão "antes" → contagem (0) → `0181` → contagem
  (0) + `relfilenode` igual + constraints do lote = as do CI → `0182` → … → `0184` → `notify pgrst` → advisors → impressão
  "depois" (o `relfilenode` das 20 igual, o `prosrc` intocado, as 62 policies byte a byte, só as 65 `_tamanho` novas) →
  conferidor de formas (0 recusadas) → em produção, o smoke a partir da branch.
- **Hoje (12/11) este portão não roda**: o MCP está na conta errada. Os comandos exatos vão no topo do relatório.

---

## 8. O que esta ordem acrescenta à ficha, e as divergências

**Acrescenta:** a régua "≥ todo caminho e ≥ o vivo"; a tabela-verdade coluna × caminho; o mapa do import; a contagem de
violação como portão por lote; o rollback com o encadeamento medido; a nota da F67 com as decisões 2 e 3 do Johnny.

**As oito divergências que a ordem já declarava, e o que a medição disse:** (1) `0181`/`1.72.0` — confirmado; (2) os fatos
de banco têm sete semanas — remedidos pela API (17 tabelas), o resto é do portão; (3) uma coluna, vários tetos — PIOR:
muitas telas sem `.max()` (§1 fato 8); (4) a validação por linha do import já existe — confirmada, sem buraco (§3); (5)
`registrarEventoAdmin` 15 + definição, `createAdminClient` 32/16 nesta base; (6) a forma sem `btrim` e as duas
existentes — **elas não viram exceção** (decisão 3, medido); (7) o `unaccent` não existe, mas as chaves alongam até 3×
(decisão 4); (8) as três decisões do Johnny — só nota.

**As que esta run achou:** o Zod conta code points (fato 14); `CONSTRAINTS_TRADUZIDAS` 17 (fato 12); `setor` no ensaio
acima do import (fato 6); os rollbacks F63–F65 dependem da F66B (fato 18); o MCP na conta errada (fato 23).

---

## 9. O SHA de código congelado

*(preenchido na Frente G, passo 3.)*
