# PLAN-F56 — O import sem WAP-ismo e sem bomba

*Escrito em 11/09/2026, antes de qualquer código da fase, a partir da ordem
`docs/prompts/F56-import-sem-wapismo-e-sem-bomba-ultracode.md` (43 fatos + prompt), das quatro decisões do Johnny
da mesma data e de **onze medições independentes + um crítico de completude** rodados em paralelo nesta sessão
(relatórios integrais fora do repositório, no scratchpad da sessão; os números que importam estão aqui). Versão-alvo
**1.61.0**; migrations **0139** (vocabulário) e **0140** (FK do import).*

---

## 1. Estado de partida — medido hoje

| O quê | Medido | Onde |
|---|---|---|
| `main` / versão / migrations | `ef8a1e4`, `1.60.0`, 137 arquivos, última `0138` | repo |
| Ledger dos dois bancos | ambos terminam em `resumo_integridade_e_rotulo` (0138) | MCP `list_migrations` |
| Linha de base | lint 0 · tsc 0 · **4.611 testes / 180 arquivos** · build 0 | `docs/f56-evidencias/A0-linha-de-base.txt` |
| Filiais — produção | 6: `matriz` 1.142 ativos · `cd-afonso-pena` 199 · `linhares` 161 · `serra` 56 · `eusebio` 58 · **`filialteste` 5** | SQL agregado |
| Filiais — ensaio | as 5 primeiras, todas ativas; `sede` não existe (nem em produção) | SQL agregado |
| Imports em produção | 12, o último em 31/07/2026; **maior planilha já importada: 1.228 linhas** | `import_logs` |
| Maiores valores reais (produção) | patrimônio 11 · service tag 24 · marca 8 · modelo 18 · fornecedor 10 · memória 25 · armazenamento 21 · processador 28 · hostname 14 · observação 127 (p99 90) · colaborador 64 · setor 45 caracteres; maior nº de correções num import: **152**; maior texto dentro de uma correção: **17** | SQL agregado (só `max(length)`) |
| Encoding/collation | produção e ensaio: UTF8, `en_US.UTF-8`, **provedor ICU**; CI: `postgres:17` (libc) | `pg_database` / `ci.yml:183` |
| Vocabulário no código | `UNIDADES` 18 chaves → 5 filiais (5 são o próprio nome) · `CATEGORIAS` 5 · `ESTADOS` 17 · formas de exibição 5 + 7 = **12** · `PREFIXOS_PATRIMONIO` 7 | `deparas.ts:152-328` |
| FK do import — produção (critério da RPC: filial ATUAL do ativo) | Matriz 16 pendências + 18 lançamentos presos a movimentação · Linhares 16 lançamentos · Eusébio 1 pendência · Filial de Teste 12 lançamentos · CD e Serra 0 · lançamento preso a pendência do acervo: 0 · substituto de outra filial apontando para o acervo: 0 (os 2 pares existentes são Matriz→Matriz) | SQL agregado |
| FK do import — ensaio | Matriz 20 pendências + 5 lançamentos · CD 1 pendência · Eusébio 2 pendências | SQL agregado |
| Corpos vigentes (md5 do `prosrc` normalizado, arquivo = produção = ensaio) | `import_apagar_acervo_filial(smallint)` `e313d1fe…` (0131) · `import_revalidar_contagens(jsonb,smallint)` `3ad2f66b…` (0131) · `importar_ativos_substituir(jsonb,text,jsonb,jsonb)` `8ab118c3…` (0132) | `corpo-vigente.mjs` × SQL |
| Roteiros SQL | **33** (a doc diz 25, desatualizada); ~707 `v_ok := v_ok + 1` como proxy estático | `supabase/tests/` |
| Injetor | **67** mutações ativas, teto 68 | `mutacoes.test.mts:192` |
| Ensaio — perfis | admin ativo 1 (não é persona) · admin inativo 1 · operador 1 · consulta 1; `seed.admin@wap.ind.br` **não existe**; bucket `backups-import` vazio; `import_logs` vazio; 12 checagens = 0 exceto `operador_sem_filial` = 1 | SQL agregado |
| `.env.local` (por nome/ref) | `NEXT_PUBLIC_SUPABASE_URL` → ensaio (`sgmv…`); `SUPABASE_SERVICE_ROLE_KEY` preenchida e aceita por `rotulo_de_ambiente()` = `desenvolvimento`; `SMOKE_SUPABASE_URL` → **produção** | medição 5 |
| Issue #41 (alarme do ensaio) | **aberta** (último update 10/09 19:51 UTC); os disparos agendados seguintes foram verdes | `gh issue view 41` |

## 2. Divergências contra a ficha e contra a ordem

As treze que a ordem já declarou valem (0139/0140 e 1.61.0; a sexta filial existe; identidade por `filial_id`;
`limites.ts` existe; 4,5 MB e não 8; seis números e cinco corpos; o 413 não deixa backup; `PARTES_RE` não existe; a
regex do SQL está morta; o `Exclude` de categoria saiu em 30/08; o `.xlsx` perde valor à direita; 13 apelidos e não
18; o smoke nunca existiu). **As medições desta sessão acrescentam estas:**

1. **"CD Afonso Pena" sem hífen.** O nome no banco não tem hífen; `normalizarTexto` não remove hífen. O nome próprio
   normalizado é `cd afonso pena` — e `cd-afonso pena` (com hífen) é APELIDO. Semear ao contrário quebra a CD em
   silêncio. (Confirmado por dois medidores independentes.)
2. **Há um sexto FK** que aponta para o que a auxiliar apaga — `movimentacoes.estorno_de` (autorreferência, imediata) —,
   mas ele não pede tratamento: o `delete from public.movimentacoes` é UM statement e o FK imediato é conferido no fim
   do comando. **Restrição de desenho:** esse delete continua sendo um statement só.
3. **O PapaParse nunca emite `FieldMismatch` nas opções de hoje** (só com `header: true`): o filtro de `parse.ts:56` é
   código morto e `linha_desalinhada` precisa de checagem própria.
4. **O `bodySizeLimit` só existe para o PEDIDO.** As respostas (corpos 2 e 5) só têm o limite bruto da Vercel.
5. **Pior caso do corpo 2 não medido pela ordem:** um arquivo em que TODA linha tem erro repete o valor cru em
   `bloqueantes`, `grupos[].erros`, na mensagem e no `contexto`. Com 2.000 linhas e 4 bloqueantes por linha, a estrutura
   sozinha já passa de 4,5 MB, com conteúdo mínimo. A conta dos tetos precisa de um orçamento para a resposta do preview
   (Decisão 6).
6. **O `.xlsx` não é limitado pelo tamanho do arquivo**: 1 MiB de `.xlsx` carrega muito mais texto de célula que 1 MiB de
   CSV. O teto que fecha a conta é sobre o CONTEÚDO decodificado (Decisão 6), não só sobre o arquivo.
7. **`\s` do JavaScript tem 25 code points**, inclusive U+FEFF e U+1680; o `\s` do Postgres diverge em 7 (U+001C–001F,
   U+0085, U+FEFF, U+1680). A chave SQL usa classe explícita (Decisão 1).
8. **Sétimo catálogo por nome**: `src/lib/itens/migrations-f38.test.ts` (`DA_F38`) exige todo número de migration a
   partir da `0116` — a `0139` e a `0140` entram lá no mesmo commit, ou `npm run test` reprova.
9. **`restaurar.mjs` nunca leu `ponteiros_perdidos`** — nem do backup do reset, que o grava desde a F23/F54. Lacuna
   anterior à fase; aqui ela é fechada só para o backup do import versão 2 (a do reset vai para o backlog).
10. **O ramo `safeParse` do retorno (RPC já commitou) não grava evento nenhum** — o backup dele vira órfão para a 12ª
    checagem. Entra no conserto do "ramo de erro honesto" (Decisão 10).
11. **O Portal do Radix nunca monta sob `renderToStaticMarkup`**: nenhum teste grau 1 alcança o conteúdo de um `Dialog`.
    A parte testável da tela de apelidos é extraída para fora do diálogo (Decisão 13).
12. **`ESPECIFICACAO.md:211` já está desatualizada** (faltam 9 dos 13 apelidos) e `R-IMP-29` está duplicada na matriz —
    anteriores à fase; a spec é emendada, a duplicata vai para o backlog.
13. **O `lower()` do Postgres depende do provedor de collation** (ICU nos bancos, libc no CI): a chave SQL fixa a
    collation para ser a mesma nos três lugares.
14. **As outras quatro RPCs destrutivas** (`apagar_ativo`, `apagar_movimentacao` — vigentes na 0090 —, `resetar_acervo` —
    0089 — e `apagar_ativos_conflito_filiais` — 0132) **não tratam nenhum dos dois elos de `lancamentos_item`**.
    Backlog nomeado; contagens no relatório.

## 3. As treze decisões

### Decisão 1 — as tabelas do vocabulário

**Escolha: quatro tabelas, tipadas, no molde da `0114`.**

- `public.unidades_apelidos (id bigint identity pk, filial_id smallint not null → filiais, apelido text not null,
  apelido_chave text generated always as (public.vocabulario_chave(apelido)) stored, created_at)` — índice único em
  `apelido_chave`, check de chave não vazia e de tamanho (2 a 80), índice do FK. RLS: leitura pelo piso
  (`papel_atual() is not null`), `insert` e `delete` só `e_admin()`, **sem `update`** (trocar = remover + incluir, e
  cada um vira uma linha de trilha).
- `public.import_termos_categoria (termo text pk, categoria categoria_ativo not null, rotulo text)` — 5 linhas.
- `public.import_termos_estado (termo text pk, estado status_ativo not null, rotulo text)` — 17 linhas, 7 com rótulo.
- `public.import_prefixos_patrimonio (prefixo text pk)` — 7 linhas.
- Nas três de vocabulário: **só leitura** pelo piso; nenhuma policy de escrita (o vocabulário de Tipo, Situação e
  prefixo só muda por migration até o onboarding — decisão ii). Checks que fazem o banco guardar os invariantes que hoje
  só o teste guarda: termo já normalizado (`termo = vocabulario_chave(termo)`); `categoria <> 'outro'`;
  `estado <> 'devolvido_fornecedor'`; **rótulo que volta ao próprio termo** (`vocabulario_chave(rotulo) = termo` — o
  teste de ciclo vira constraint); estado `descartado` sem rótulo; índice único parcial `(categoria)` / `(estado)` onde
  há rótulo — **no máximo uma forma de exibição por valor**; prefixo no formato `^[A-Z]{2,4}$`. "Exatamente uma por
  valor importável" é conferido pela guarda do seed e pelo construtor do vocabulário.
- **A forma de exibição mora na linha do termo que ela normaliza** ("Saída" → termo `saida`), e por isso o check de
  ciclo é possível. As 12: Notebook, Desktop, Monitor, Celular, Tablet, Estoque, Saída, Reservado, Empréstimo, Validar,
  Manutenção, Defasado.
- **A chave normalizada: `public.vocabulario_chave(text)`** (nome no molde de `colaborador_chave`/`item_chave`),
  `language sql immutable strict parallel safe`, sem extensão, espelho exato de `normalizarTexto`:
  `normalize(NFD)` → remove U+0300–U+036F → `lower(… collate "und-x-icu")` → tira `:` final → colapsa a classe
  explícita dos 25 code points do `\s` do JavaScript → `btrim`. **As faixas são montadas com `chr(<n>)`, sem barra
  invertida nem caractere invisível no arquivo** — imune a transcrição e legível pela guarda. Medição 4: a candidata
  com classe explícita bateu 1.091/1.091 code points no ensaio; `normalize()` é IMMUTABLE e parallel safe no PG 17.
- Guarda TS↔SQL (`src/lib/import/vocabulario-chave-sql.test.ts`, molde `chave-sql.test.ts`): extrai os `chr()` da
  função e compara com o conjunto derivado AO VIVO do `\s` do JavaScript (varrendo o BMP) e com a faixa de
  `DIACRITICOS`; mais um roteiro comportamental no CI com casos cujos resultados esperados são provados iguais a
  `normalizarTexto` por um teste Vitest.

**Custo que decidiu:** uma tabela genérica `dominio/termo/valor` custaria casts de enum dentro de check e perderia o tipo
no `database.ts`; quatro tabelas custam quatro entradas nos catálogos da F48 e (na F64) quatro `empresa_id` — barato,
e o banco ganha os invariantes. Divergência declarada: a ordem sugeria "uma ou duas".

### Decisão 2 — o nome próprio e a ambiguidade

- **"Nome da filial" é `filiais.nome`** (o slug é identidade de URL e nunca aparece na coluna Site). **Não vira linha**:
  o construtor do vocabulário lê as filiais e trata o nome como termo implícito — renomear muda o termo, sem sobra.
- **Toda filial, ativa ou inativa, é UNIDADE CONHECIDA** (uma linha com o nome de uma filial inativa é "outra filial",
  nunca aceita calada); **só filial ATIVA é ALVO** de import. `filial_fora_do_vocabulario` dispara quando o `filial_id`
  escolhido não está entre as filiais do vocabulário ou está inativo (defesa em profundidade: a action já recusa filial
  inativa antes do motor).
- **Unicidade sobre o conjunto (nomes de todas as filiais ∪ todos os apelidos), pela chave normalizada**:
  - nome × nome: índice único de expressão `filiais_nome_chave_uidx on filiais (vocabulario_chave(nome))`;
  - apelido × apelido: índice único em `unidades_apelidos.apelido_chave`;
  - nome × apelido (cruzado): gatilho `before insert or update` nas duas tabelas (uma função
    `vocabulario_unidades_guarda()`, dois gatilhos), que toma `pg_advisory_xact_lock` de uma chave fixa antes de
    conferir (serializa renomear × cadastrar apelido concorrentes) e recusa com `P0001` e mensagem que nomeia o termo e a
    filial dona. Apelido igual ao nome da PRÓPRIA filial também é recusado ("o nome próprio já vale"); renomear uma
    filial para um apelido dela mesma é recusado ("remova o apelido antes") — o invariante é simples: cada chave aparece
    uma vez no conjunto.
- **Reativar não precisa de conferência**: a filial inativa nunca saiu do conjunto.
- A action faz a pré-conferência para compor a mensagem amigável com o nome da filial dona; o banco é a garantia.

### Decisão 3 — o transporte do vocabulário

- Tipo serializável `VocabularioImport` (só objetos e arrays — nada de `Map`, `Set`, `RegExp`, função, classe ou
  `Object.create(null)`):
  `{ filiais: {id, nome, ativa}[]; apelidos: {filialId, apelido}[]; categorias: {termo, categoria, rotulo}[];
  estados: {termo, estado, rotulo}[]; prefixosPatrimonio: string[] }`.
- Módulo puro `src/lib/import/vocabulario.ts`: `conferirVocabulario` (recusa alto: termo apontando para duas filiais,
  valor importável sem forma de exibição, rótulo que não volta ao termo, prefixo fora do formato) e as funções que o motor
  usa, todas recebendo o vocabulário por parâmetro no padrão `rotuloTipoItem(slug, mapa)`; o índice de busca é memoizado
  por identidade do objeto (`WeakMap`) e nunca sai do servidor.
- Query só-servidor `src/lib/queries/vocabulario-import.ts` (`lerVocabularioImport(client)`) lê as cinco fontes em
  paralelo e passa pelo `conferirVocabulario`.
- **`validarImport` e `baixarCsvCorrigido` leem do banco a cada chamada**; nenhum campo de vocabulário do `FormData` é
  lido (provado com um `FormData` que carrega um vocabulário forjado). **`aplicarImport` não roda o motor**: lê o
  vocabulário e recusa plano com `categoria` ou `estadoAlvo` fora dos valores importáveis (os que têm forma de exibição).
- A página (Server Component) lê o vocabulário e desce por prop **só** a fatia de cliente
  `{ categorias: {categoria, rotulo}[]; estados: {estado, rotulo}[]; prefixosPatrimonio: string[] }` para os três
  consumidores (`grupos-erros.tsx`, `ops-grupo.ts`, `importar-wizard.tsx`). O servidor nunca julga com ela.

### Decisão 4 — o utilitário estrito de exclusão

`ExcluirDaUniao<T, U extends T> = Exclude<T, U>` em `src/lib/tipos-estritos.ts`. Uniões do import:
`CategoriaImport = ExcluirDaUniao<Enums<'categoria_ativo'>, 'outro'>`,
`EstadoPlanilha = ExcluirDaUniao<Enums<'status_ativo'>, 'devolvido_fornecedor'>`,
`EstadoAlvoImport = ExcluirDaUniao<EstadoPlanilha, 'descartado'>`. A proibição do `Exclude` cru vale **só no import e
nos componentes dele** (os 8 usos de fora excluem literais de uniões locais, não de enums do banco; tocá-los é escopo
alheio). O `@ts-expect-error` do valor fora da união mora num `.ts` coberto pelo `tsconfig` — checado por `npm run build`
(job `verificar`) e por `npx tsc --noEmit`; o Vitest não checa tipo. Prova por sabotagem com a saída guardada.

### Decisão 5 — a regex numa fonte só

Em `src/lib/patrimonio.ts`: `PREFIXO_PATRIMONIO_FONTE = '[A-Z]{2,4}'` e `DIGITOS_PATRIMONIO = 7`, exportados. A canônica
(`^(PREFIXO)(\d{7})$`), a da canonicalização (que continua `\d+` livre, com o teto de 7 conferido em código — unificar
para `\d{7}` quebraria zeros à esquerda) e a da faixa derivam delas por `new RegExp`. A do hostname
(`deparas.ts:166` → `vocabulario`/`deparas`) usa o mesmo prefixo com `\d{1,${DIGITOS_PATRIMONIO}}` explícito ao lado e
o comentário da divergência deliberada. `patrimonio-sql.test.ts`: (a) nenhum corpo VIGENTE de função
(`corpo-vigente.mjs`, código vivo sem comentário) contém regex de patrimônio executável — se um dia contiver, o teste
exige que ela use a mesma fonte; (b) o check de `import_prefixos_patrimonio` na `0139` é `'^' + PREFIXO + '$'`.
Comportamento idêntico: os testes de patrimônio de hoje passam sem mudança.

### Decisão 6 — a conta dos tetos

**O limite:** `LIMITE_CORPO_PLATAFORMA = 4_500_000` bytes (a doc da Vercel diz "4.5 MB" sem dizer decimal ou MiB; o
decimal é o conservador). `next.config.ts` passa a `bodySizeLimit: 4_500_000` (número em bytes) — o `next dev` recusa
onde a Vercel recusaria. O limite efetivo é `min(bodySizeLimit, plataforma)`; **o teste lê o `next.config.ts`** (a
config só resolve CommonJS — importar `limites.ts` lá seria acoplamento frágil no carregamento). **Folga mínima 1,5×:**
todo corpo ≤ 3.000.000 B no pior caso que o motor aceita.

**Medição 1 (serializador real: `encodeReply` e Flight do `react-server-dom-webpack` do Next, com
`--conditions=react-server`; dados 100% fictícios):** perfil realista ≈ 558–561 B por ativo no corpo 2; o peso morto
estrutural por linha do plano é 269–327 B **independente do conteúdo** — mais linhas pioram sempre. Com os tetos de hoje
(5 MiB, 20.000 linhas, 20.000 correções de 500/500/200), o corpo 3 do pior caso **já passa de 4,5 MB com 1.142 linhas**.
Com N = 2.000, arquivo de 0,975 MiB e 1.000 correções de 120/120/120: corpo 1 = 1.701.681 B · corpo 2 = 1.774.105 B ·
corpo 3 = 2.301.009 B · corpo 4 = corpo 1 · corpo 5 = 1.022.310 B.

**Os números-alvo** (a Frente C remede com o serializador real e ajusta com evidência; a regra de quem cede é fixa):

| Constante | Hoje | Alvo | Contra o real |
|---|---|---|---|
| `TAMANHO_MAX_ARQUIVO` | 5 MiB | **1 MiB** | inventários reais de dezenas a centenas de KB |
| `MAX_LINHAS_PLANILHA` | 20.000 | **2.000** | 1,63× a maior planilha já importada (1.228); 1,75× a Matriz (1.142) |
| `MAX_COLUNAS_PLANILHA` | 40 | 40 | não move bytes |
| `MAX_BYTES_CONTEUDO` (novo) | — | **768 KiB** de célula decodificada, contada já escapada para JSON | ~2,6× o conteúdo da maior planilha real; vale para CSV **e** `.xlsx` |
| `MAX_CORRECOES` | 20.000 | **500** | 3,3× o maior import real (152) |
| `MAX_CRU` / `MAX_PARA` | 500 / 200 | **120 / 120** | 7× o maior texto real de correção (17) |
| `.max()` do plano | nenhum | patrimônio e original **60** (= RPC) · service tag 60 · marca 60 · modelo 120 · fornecedor 80 · memória 40 · armazenamento 40 · processador 80 · hostname 60 · observação 500 · colaborador 120 · setor 80 · chamado 40 · datas 10 · array = `MAX_LINHAS_PLANILHA` | ≥ 1,6× o maior valor real de cada coluna |

**Três travas estruturais que a conta exige, e que a ordem não listava:**

1. **Teto de conteúdo decodificado** (`MAX_BYTES_CONTEUDO`) em `conferirTetos` — é o que fecha a conta do corpo 3 e do
   corpo 5 para o `.xlsx`, cujo texto não é limitado pelo tamanho do arquivo.
2. **Célula de controle recusada**: um caractere C0 que o JSON escapa em 6 bytes multiplica o corpo por 6; o motor
   recusa a célula (bloqueante `caractere_invalido`, sem ecoar o valor), no molde "recusar, nunca cortar".
3. **Orçamento da resposta do preview** (`ORCAMENTO_RESPOSTA_PREVIEW`): um arquivo em que toda linha tem erro gera
   resposta proporcional a linhas × erros × cópias, e nenhum teto de entrada a limita. O motor monta a
   `ValidacaoImport` completa; se o JSON dela passar do orçamento, reduz o DETALHE (erros individuais por tipo, e o
   `contexto` dessas linhas) em degraus até caber, marcando `resumo.detalheReduzido` com as contagens totais — os
   `grupos` continuam com todas as linhas, e a tela diz que o arquivo tem erros demais para listar. Nada que entra no
   plano é cortado: com bloqueante não há plano. A razão Flight/JSON medida entra na conta.

`limites.test.ts` prova, com os coeficientes da medição 1 em bytes, as cinco desigualdades contra
`min(bodySizeLimit, 4.500.000) / 1,5`; carrega um carimbo dos números para os quais a conta foi feita e reprova quando
qualquer constante muda sem o carimbo e os coeficientes serem refeitos; e roda o pior caso patológico de verdade
(arquivo no teto com erro em toda linha) contra o orçamento. O script de medição fica versionado em `scripts/perf/`
para a conta poder ser refeita.

### Decisão 7 — o `.xlsx` descomprimido

**Medição 2:** 20 execuções de `lerXlsx` em processo filho (heap 1 e 2 GB, timeout): nenhum OOM; pior caso **1.354 MB de
RSS e 9,1 s para um `.xlsx` de 4,99 MB** (271× o arquivo); o teto teórico do DEFLATE é ~1.029:1. A função da Vercel tem 2
GB por padrão. **Escolha: conferir antes do `load`**, sem dependência nova: ler o diretório central do zip e inflar cada
`xl/worksheets/*.xml` e `xl/sharedStrings.xml` com `zlib.inflateRawSync(…, { maxOutputLength })` — o tamanho
DESCOMPRIMIDO REAL, não o declarado, com teto `MAX_XML_DESCOMPRIMIDO` —, e ler o `<dimension ref>` da planilha para
recusar linhas/colunas acima do teto em milissegundos. O teto pós-`load` fica (a dimensão pode mentir ou faltar). A
Frente C remede em processo filho depois do conserto.

### Decisão 8 — a régua do desalinhamento

Largura útil = índice da última coluna com nome no cabeçalho + 1 (colunas vazias à direita não contam). Depois do
descarte de linha vazia: **CSV** com mais células que a largura útil **e** valor não vazio além dela → `linha_desalinhada`
("a linha N tem X células preenchidas; o cabeçalho tem Y colunas"); com menos células que a largura útil →
`linha_desalinhada`. **`.xlsx`**: `lerLinha` passa a entregar as células além do cabeçalho (em vez de descartá-las) e a
mesma régua acusa valor à direita; célula a menos não existe no `.xlsx` (a linha é completada). Colunas vazias à direita,
linha em branco, `\n` final, CRLF, BOM e `;` entre aspas continuam passando (fixtures). Card `kind: 'nenhuma'` — estrutura
se conserta no arquivo, como `header_invalido`. O filtro morto de `FieldMismatch` sai com comentário.

### Decisão 9 — o conserto da FK

Dentro de `import_apagar_acervo_filial`, na janela que a orquestradora já abre, com o acervo = ativos cuja filial ATUAL é
a do import:

1. `update lancamentos_item set pendencia_item_id = null` onde a pendência é de ativo do acervo (FK imediata);
2. `update lancamentos_item set movimentacao_id = null` onde a movimentação é de ativo do acervo (FK imediata);
3. `delete from pendencias_item` onde o ativo é do acervo (a FK adiada para `movimentacoes` deixa de existir antes do
   delete delas);
4. `update ativos set substitui_ativo_id = null` onde o ponteiro aponta para o acervo e o ativo é de OUTRA filial;
5. o que já apagava — movimentações (um statement só, pelo `estorno_de`), anotações, termos, ativos.

Nenhum gatilho força outra ordem (`valida_lancamento_item` é só `before insert`; `guarda_acervo` libera na janela e não
cobre `pendencias_item`). Continua a única função da cadeia do import com `delete from public.ativos`.

**Contagens (pré-operação), mesmas chaves em `CustoSubstituir`, no `contagens` do backup e em `p_contagens`:**
`pendencias_item`, `lancamentos_movimentacao`, `lancamentos_pendencia`, `ponteiros_substituto`. Em
`import_revalidar_contagens`: **chave nova ausente vale 0 e é conferida contra o vivo** (`coalesce(…, 0)`, divergência
declarada contra o `-1` do reset). **Retorno (pós-operação), montado na orquestradora, com `.default(0)` no Zod:**
`pendencias_apagadas`, `lancamentos_desvinculados`, `ponteiros_anulados`. A `0140` recria as três funções por
`create or replace` na mesma assinatura; as auxiliares seguem fechadas nos quatro papéis e a orquestradora com EXECUTE
só para `authenticated`. **Deploy fora de ordem:** código velho + RPC nova → sem as chaves, vale 0 → CD e Serra passam, as
quatro filiais presas recusam com mensagem em vez de `23503`; código novo + RPC velha → a RPC ignora chave a mais e segue
estourando nas quatro — o handoff diz isso.

**Backup `versao: 2`** (em `aplicarImport`, lido antes da RPC): `pendencias_item` (linhas inteiras, sob o nome da tabela
— o restaurador já as insere na ordem certa), `lancamentos_desvinculados` (`[{id, movimentacao_id, pendencia_item_id}]`,
a pré-imagem dos dois elos) e `ponteiros_perdidos` (as linhas inteiras dos ativos de outra filial que perdem o ponteiro,
no molde do reset); `nao_incluido` reescrito. **`restaurar.mjs`** conhece a versão 2: insere as pendências, religa os
elos e os ponteiros dentro da janela, e **recusa versão acima de 2**. `backup-formato.test.ts` muda por desenho (a
versão 2 declarada ao lado da 1).

### Decisão 10 — o ramo de erro

Régua mantida — "sei que não commitou": a RPC do import não tem `exception` nem savepoint internos, então todo SQLSTATE
que o Postgres devolve significa transação abortada. Entram em `RECUSAS_DA_RPC` as violações de integridade que a
transação levanta (`23502`, `23503`, `23505`, `23514`) e as abortagens de concorrência (`40001`, `40P01`); erro sem
código ou de gateway continua mantendo o backup. `import_falhou` grava `backup_descartado` **só quando o backup saiu** e
`backup_path` (a chave que a 12ª checagem lê) **quando ele fica**. O ramo `safeParse` do retorno (RPC commitada, resposta
fora do formato) passa a gravar `import_executado` com `backup_path` e `retorno_inesperado: true` — senão o único backup
do que sumiu vira órfão no alarme.

### Decisão 11 — a forma do smoke

**Playwright contra o app local (`next dev`) apontado para o ENSAIO, no molde de `capturar.mjs`**, porque só ele exercita
o caminho real: login, a tela de Filiais (Server Action + trilha), o wizard, `validarImport` lendo o vocabulário do
banco, o backup no bucket, `aplicarImport` e a RPC. As fixtures do passe 2 (lançamento de item preso a movimentação e
pendência de item) nascem pela RPC do sistema (`criar_movimentacao_com_itens`, a mesma que a action chama), com a sessão
da persona. Guarda pura e testável (`scripts/smoke/guarda-ensaio.mjs`): lê **só** `NEXT_PUBLIC_SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY`, exige o ref numa lista de PERMISSÃO e `rotulo_de_ambiente() = 'desenvolvimento'`, e recusa o
ref de produção e um ref inventado (teste unitário). Persona `seed.admin@wap.ind.br`: `auth.admin.createUser` na primeira
execução (depois `updateUserById`), senha `crypto.randomBytes` em memória, nunca impressa; trilha com
`usuario_criado` (verbo novo, no comentário da `0139`), `papel_alterado`, `usuario_reativado` e `usuario_desativado`;
desativada no fim. Arquivo com nonce por execução e por passe (idempotência de 24 h). Passe 3 só PREVIEW nas cinco
filiais WAP com os apelidos históricos. As doze checagens (por `checagens_integridade_resumo()`) comparadas antes ×
depois. `sede` fica como fixture permanente, documentada.

### Decisão 12 — a trava `sem-wapismo`

`src/lib/import/sem-wapismo.test.ts`, com o compilador TypeScript (já dependência): varre **literais** (string, template,
texto e atributo JSX), nunca comentário nem identificador, em `.ts`/`.tsx` não-teste. **Escopo amplo (`src/**`)**: os
cinco nomes de filial (sem caixa, fronteira de palavra), com allowlist NOMINAL: o histórico de `versoes/registry.ts`, a
ajuda (`lib/ajuda/conteudo/**`, decisão consciente do plano) e os placeholders nomeados. **Escopo do import
(`lib/import/**` e `components/admin/importar/**`)**: também `WAP`, os 13 apelidos, `rt wap`/`posse wap` e os 7
prefixos. Os identificadores de layout `'matriz' | 'cd' | 'padrao20'` viram `'colunas18' | 'colunas16' | 'colunas20'`
(o layout são as colunas; o nome era da planilha). O exemplo de formato das mensagens troca `WAP0004491` por um exemplo
neutro montado das constantes. Nasce vermelha no começo da Frente D, acusando `tipos.ts` e `deparas.ts`.

### Decisão 13 — a tela de apelidos

Dentro do `FilialDialog`, **só na edição** (filial em criação ainda não tem `id`): seção "Na coluna Site do import" com o
nome da filial fixo ("sempre vale", sem ação de remover), os apelidos com botão de remover (`aria-label` nomeando o
apelido), campo e botão para incluir, e o aviso quando só o nome próprio vale ("a coluna Site precisa trazer exatamente
«{nome}» — acento e maiúsculas não importam"). A lista da página ganha a coluna dos apelidos. A apresentação é extraída
para `components/admin/filial-apelidos.tsx` (fora do Portal, testável no grau 1). Actions próprias
(`incluirApelidoUnidade`, `removerApelidoUnidade`): `exigirAdmin` + Zod (2 a 80 caracteres) + client de sessão +
pré-conferência de colisão com a filial dona na mensagem + trilha `apelido_incluido`/`apelido_removido` +
`revalidatePath` de `/admin/filiais` e `/admin/importar`. `criarFilial` e `atualizarFilial` fazem a mesma pré-conferência
do nome.

## 4. Travas — onde cada uma nasce vermelha

| Trava | Frente | Prova vermelha |
|---|---|---|
| `filial_fora_do_vocabulario` (teste de motor) | A | escrita antes do conserto, `FilialSelecionada` de slug inventado |
| `enums-sql.test.ts` (+ `@ts-expect-error` checado pelo build) | B | união local ≠ `Constants` |
| `patrimonio-sql.test.ts` | B | fonte compartilhada inexistente |
| `limites.test.ts` | C | a conta dos cinco corpos com os tetos de hoje contra 4,5 MB |
| desalinhamento (fixtures) | C | CSV com `;` a mais passa verde hoje |
| `sem-wapismo.test.ts` | D | acusa `tipos.ts` e `deparas.ts` |
| guarda do seed (`vocabulario-sql.test.ts`) + regressão dos 18 apelidos + `prefixos.test.ts` | D | a `0139` não existe |
| `backup-formato` versão 2 | F | o backup de hoje é versão 1 |
| cenário FK em `import_substituir.sql` + mutações | F | **só nasce verde** (sem `psql` na mesa): a prova de que acusa é o injetor, uma mutação por metade do conserto |
| guarda do smoke | G | a guarda não existe |

Saídas em `docs/f56-evidencias/`. Nenhum push com trava sabidamente vermelha.

## 5. Ordem de execução, pushes e applies

1. **Frentes A → D** (commits pequenos). **Push 1** + PR em rascunho → `verificar` e `banco-sem-docker`.
2. CI verde → **0139 no ensaio** (verificação pós-apply: tabelas, RLS, policies, grants, 13/5/17/12/7, advisors,
   `notify pgrst`, md5 de `vocabulario_chave`, sonda comportamental).
3. **Frentes E e F**. **Push 2** → CI verde → **0140 no ensaio** (prova do `prosrc`, grants, trava da F51, contagens).
4. **Frente G** — o smoke no ensaio (os três passes), com o código da branch no `next dev` local.
5. **Frente H** (docs, ajuda, versão 1.61.0). **Push 3** → CI. Revisão adversarial em contexto fresco; correções.
6. **Produção:** `0139` (antes do merge), `0140`, sonda de paridade; `npm run db:types` de produção; push final → CI →
   merge → deploy → `smoke-prod.mjs` → tag `v1.61.0`.

Qualquer defeito achado pelo CI numa migration já aplicada num banco real vira migration nova (0141), declarada.

## 6. ORDEM DE ROLLBACK

A ordem é o inverso do apply.

1. **Código:** `git revert` do merge + redeploy — **primeiro**, porque o código novo lê as tabelas da `0139` e as chaves
   de retorno da `0140`.
2. **0140:** reemitir, por `create or replace`, os corpos vigentes anteriores — `import_apagar_acervo_filial` e
   `import_revalidar_contagens` da `0131`, `importar_ativos_substituir` da `0132` —, com os mesmos `revoke`/`grant`.
   Os backups versão 2 gravados enquanto isso ficam no bucket e só se restauram com o `restaurar.mjs` da `v1.61.0`.
3. **0139:** derrubar os dois gatilhos de vocabulário e a função `vocabulario_unidades_guarda`, o índice
   `filiais_nome_chave_uidx`, as tabelas `unidades_apelidos`, `import_termos_categoria`, `import_termos_estado` e
   `import_prefixos_patrimonio`, a função `vocabulario_chave` (depois da coluna gerada e do índice), e reemitir o
   `comment on column public.eventos_admin.acao` da `0137`.

O rollback das duas é ensaiado **só no ensaio**, num `begin … rollback`, conferindo `pg_get_functiondef` e a existência
das tabelas antes e depois.

## 7. Riscos

- **Classificador:** pode barrar o apply da `0140`, a criação da persona ou a execução do smoke. Não se reformula; vira
  handoff e pendência declarada, e o código convive com a RPC antiga (Decisão 9).
- **Cota de Actions:** quatro ou cinco execuções de CI; pushes agrupados.
- **Transcrição no apply pelo MCP:** provada depois, pelo md5 do `prosrc` contra o arquivo.
- **Regressão do De→Para da WAP:** a regressão dos 18 apelidos históricos, o passe 3 do smoke e o seed conferido pela
  guarda.
- **`und-x-icu` ausente no Postgres do CI:** a `0139` falharia no CI antes de qualquer banco real; nesse caso, a
  alternativa registrada é a collation `"C"` com o `lower` restrito ao que sobra depois de tirar os diacríticos, com a
  divergência residual declarada.
