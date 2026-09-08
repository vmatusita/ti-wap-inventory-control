# F51 — A decomposição da RPC de import

*Ordem de serviço gerada em 08/09/2026, a partir de `docs/PLANO-MULTIEMPRESA.md` §5, Bloco B.*

**Por que ela existe.** `importar_ativos_substituir` é a função mais destrutiva do sistema — ela apaga
o acervo inteiro de uma filial antes de gravar o novo — e o único jeito de mudá-la, hoje, é reescrever
as quase 400 linhas dela. Isso já aconteceu **onze vezes**: `0032`, `0033`, `0034`, `0035`, `0036`,
`0037`, `0040`, `0048`, `0064`, `0080`, `0094`. A dívida técnica **X** (`docs/DIVIDA-TECNICA.md:117`)
não a chama de estética, e tem razão: ela é o **mecanismo causal** de outros dois defeitos. O `if
p_contagens is not null` (item **N**), morto desde que a `0040` tornou o `raise` obrigatório,
sobreviveu a cinco revisões — não por descuido de revisor, mas porque o método é copiar o corpo e
editar o trecho novo. O `current_date` do item **W** percorreu o mesmo caminho.

**Por que ela vem AGORA, e não depois.** A F52 acrescenta quatro guardas de escopo, a F56 muda o
vocabulário para dado, e a virada acrescenta `empresa_id` a cada `insert` e a cada `delete` dela. No
método de hoje, isso é **cinco colagens de ~400 linhas à mão, em dois bancos**. Decompor primeiro
converte cinco riscos de transcrição em cinco diffs revisáveis. Fazer na ordem inversa produz a cópia
nº 12 — e depois a decomposição tem de reescrever essa cópia inteira de novo.

**O que esta fase NÃO é.** Não é guarda nova (F52). Não é vocabulário como dado (F56). Não é
`empresa_id` em lugar nenhum (F62+). Não é recorte de filial (F57). Não é mudança de comportamento
**nenhuma**: é refatoração pura, com a assinatura da orquestradora **byte a byte igual**, provada por
roteiro rodando antes e depois, cenário a cenário. **Nada muda para quem opera o sistema** — e a
entrada do `CHANGELOG.md` tem de dizer isso com honestidade, não com silêncio.

---

**Dezesseis fatos de leitura do repositório, medidos em 08/09/2026, que a ficha do plano não tem.**

1. **A migration desta fase é a `0131`, não a `0130`.** A ficha do plano diz `0130`; ela foi escrita
   quando a última era a `0127`. A F50 acrescentou a `0128`, a `0129` **e** a `0130`
   (`0130_grant_invoker_authenticated.sql`). Confira com `ls supabase/migrations | tail -1` antes de
   escrever a primeira linha, e não repita o número da ficha.

2. **O corpo vivo tem 393 linhas, e a ficha se contradiz sobre isso.** Ela diz "394 linhas" num
   parágrafo e "430" no seguinte. Medido na `0094`: a função vai da linha **49** à **451**; o corpo
   dollar-quoted vai do `as $$` (linha 58) ao `end $$;` (linha 451) = **393 linhas**, 392 sem a linha
   de fecho. Meça você mesmo e registre o número real — a régua da casa é essa.

3. **A lista de SETE auxiliares da ficha não cobre o corpo inteiro: sobram 79 linhas sem dono.** Este
   é o achado que mais muda o desenho. O mapa de blocos, medido na `0094`:

   | Bloco (comentário na `0094`) | Linhas | Nº | Auxiliar da ficha |
   |---|---|---|---|
   | `declare` | 59–85 | 27 | — (orquestradora) |
   | 0. contexto de operador · 0b. **guarda de cargo `e_admin()`** | 86–105 | 20 | — (orquestradora) |
   | 1a. filial (+ `pg_advisory_xact_lock`) · 1b. backup · 1b-bis. correções · 1c. plano não-vazio · 1d. validação por ativo · 1e. unicidade no plano | 106–179 | 74 | `import_validar_plano` |
   | 2. rede de segurança: termo multi-filial | 180–191 | 12 | `import_validar_plano`? |
   | 2b. revalidação do estado vivo (TOCTOU) | 192–223 | 32 | `import_revalidar_contagens` |
   | 3. DELETE ordenado (4 deletes + a janela) | 224–254 | 31 | `import_apagar_acervo_filial` |
   | 4. INSERT por ativo — **um loop só**, com 4a/4b/4c/4d | 255–336 | 82 | `import_criar_ativos` + `import_lancar_movimentacoes` |
   | **5. conferência dentro da transação · 5b estado · 5c posse · 5d agregada** | **337–415** | **79** | **NENHUMA** |
   | 5e. conflitos abertos (F24) | 416–426 | 11 | `import_contar_conflitos` |
   | 6. log + retorno | 427–450 | 24 | `import_gravar_trilha` |

   **20% do corpo — a conferência pós-insert — não tem auxiliar nomeada.** Ou nasce uma oitava
   (`import_conferir_resultado`), ou ela fica na orquestradora com o motivo escrito. É a Decisão 3, e
   escolher em silêncio é o erro.

4. **O bloco 4 é UM loop só, e separá-lo em duas passagens MUDA A ORDEM FÍSICA das movimentações.**
   Dentro do mesmo `for e in …` o corpo cria o ativo (4a), insere a compra de abertura (4b), insere o
   ajuste de reconciliação quando o estado-alvo não é `em_estoque` (4c) e sincroniza
   `colaborador_atual`/`setor_atual` (4d). `movimentacoes` tem o trigger `trg_aplicar_movimentacao`
   (`0004:135`), que **deriva** `ativos.status`; e `rel_estoque_asof` desempata o "último evento" por
   `order by e.ativo_id, e.data desc, e.created_at desc, (e.tipo = 'ajuste') desc, e.id desc`
   (`0110`). Duas passagens — todos os ativos, depois todas as movimentações — **não são equivalentes
   por construção**: mudam `created_at` e mudam o `id desc` do desempate. É o maior risco técnico da
   fase, e é a Decisão 2.

5. **A ficha pede uma trava que NASCE VERMELHA por motivo legítimo, e o próprio repositório já
   escreveu por que isso é ruim.** *"`delete from public.ativos` só pode aparecer no corpo de uma
   função"* é falso hoje, medido: a string está viva em `apagar_ativo` (`0082:198`), em
   `resetar_acervo`/`resetar_itens`/`resetar_dados_ficticios` (`0083:236`, `0083:435`, `0089:206`,
   `0090:87`) e em `apagar_ativos_conflito_filiais` (`0093:331`, recriada até a `0100`). A F48 escreveu
   a régua: *"gate que nasce vermelho por motivo legítimo é gate que alguém desliga"*. A invariante
   correta é **escopada à cadeia do import** — dentro dela, só `import_apagar_acervo_filial` contém a
   string, e a orquestradora **não** a contém. Escreva a trava assim, e escreva o porquê no cabeçalho
   dela.

6. **A `0131` bate no gate do modo automático — e na F24 o gate NÃO disparou.** `RUNBOOK-BANCO.md:45`
   diz que o classificador bloqueia DDL cujo corpo contenha `delete from public.ativos` ou
   `delete from public.movimentacoes` via `apply_migration`/`execute_sql` do MCP, em **qualquer**
   projeto. A `0131` contém as duas. Mas `docs/RELATORIO-F24.md:243` mediu o contrário: *"Não foi
   preciso: o classificador deixou passar as sete pelo `apply_migration`, em ensaio e em produção"*.
   **Tente o caminho A do runbook (ensaio, depois produção, com verificação pós-apply).** Se o gate
   disparar, produza o handoff em `scratchpad/` (que é `.gitignore`d, linha 63) pelo caminho B e
   registre a pendência — **sem parar, sem pedir permissão, sem inventar caminho de apply alternativo**.

7. **As duas mutações do import VÃO QUEBRAR na mesa, de propósito, e isso é a rede funcionando.**
   `scripts/db/mutacoes.mjs` tem `import-sem-revalidacao-de-contagens` e `import-sem-exigencia-de-backup`
   (linhas ~649–687). As duas chamam
   `mutarFuncao('public.importar_ativos_substituir(jsonb, text, jsonb, jsonb)', …)` procurando trechos
   que, depois da decomposição, **mudam de função**: `if p_contagens is null or jsonb_typeof(…)` vai
   para `import_revalidar_contagens` e `if coalesce(btrim(p_backup_path), '') = ''` vai para
   `import_validar_plano`. `trocarNoCorpo` reprova ALTO quando o trecho não existe mais — sem banco,
   na mesa. Reaponte as duas para as auxiliares novas **e reescreva as duas sondas `prova`**, que hoje
   casam `pg_get_functiondef` da orquestradora contra `'%2b. revalidação%if false then  --%'` e
   `'%1b. backup obrigatório%if false then  --%'`. Um `like` que continue mirando a orquestradora vira
   "mutação que não pega" disfarçada de "mutação não detectada" — o diagnóstico errado.

8. **O lote de mutações ESTOURA o teto se a fase fizer o que a ficha pede — e isso é aritmética, não
   risco.** Medido agora: `scripts/db/mutacoes.mjs` exporta **39 mutações ATIVAS** e **2 em
   quarentena**. `scripts/db/mutacoes.test.mts` afirma *"tem entre 20 e 44 mutações ATIVAS"*. Uma
   mutação nova por auxiliar são **7 ou 8** — o lote vai a **46 ou 47** e o teste **reprova**. Não é
   uma coisa a descobrir no terceiro push: é para decidir no plano. As saídas honestas: subir o teto
   com o motivo escrito no próprio teste (ele existe para o lote não virar depósito, não para ser
   sagrado), ou cobrir mais de uma auxiliar por mutação quando a quebra derruba o mesmo cenário.
   **Afrouxar o teste sem escrever por quê não é opção.** O mesmo arquivo cobra ainda: `id` únicos e
   sem colisão com a quarentena; **todo rótulo de `derruba` existente LITERALMENTE no fonte do
   roteiro** (casador por TOKEN, nunca substring — `2` é prefixo de `2b`); sonda de prova na maioria;
   policies citadas existentes; dados 100% sintéticos; quarentena ≤ **um terço** do lote.

9. **`catalogo_secdef.sql` tem 38 nomes hoje, não 37.** A ficha diz 37; a `0129` acrescentou
   `pode_ler_arquivo_termo` depois de a ficha ser escrita. O `k_secdef` está em
   `supabase/tests/catalogo_secdef.sql` e a asserção 1 confere nos **DOIS sentidos** — função
   `security definer` no catálogo sem classificação reprova, e nome classificado que sumiu também. Se
   as auxiliares nascerem `security definer`, são **38 → 45** e o roteiro tem de ser atualizado no
   MESMO commit, ou o `banco-sem-docker` fica vermelho por construção.

10. **`security definer` nas auxiliares não é obrigatório, e a escolha tem consequência medível.**
    Dentro de uma função `security definer`, `current_user` já é o dono; uma auxiliar `security
    invoker` chamada dali roda **com os mesmos privilégios**. Quer dizer: INVOKER funciona e **encolhe**
    a superfície mais concentrada de poder do banco em vez de crescê-la em sete. O que de fato protege
    as auxiliares é o `revoke`, não o `prosecdef`. A ficha assume DEFINER (é o que faz o `catalogo_secdef`
    "acusá-las como classificadas"). **Meça e decida** — é a Decisão 1.

11. **`revoke all … from public, anon, authenticated, service_role` — e a palavra `public` é a que a
    F50 provou que muda o resultado.** O ensaio da F50 mediu que `revoke … from anon` sozinho é
    **no-op silencioso**: a ACL trazia `=X/postgres`, o grant ao pseudo-papel PUBLIC, de onde `anon`
    herdava, e `ainda_com_anon` deu **5** *depois* do revoke. Prove com `has_function_privilege` que os
    quatro papéis dão `false` nas sete (ou oito) auxiliares — em `begin; … rollback;` antes do apply
    real, no ensaio. Afirmar não vale; a saída vale.

12. **A janela `estoque.dev_destrutivo` fica na orquestradora, e o `pg_advisory_xact_lock` deveria
    seguir a mesma regra.** A ficha manda a janela ficar no topo (motivo: hoje existem exatamente
    **duas** portas que a abrem — as RPCs da Zona destrutiva e a de import, o que a `0080`/`0081`
    amarram —, e criar uma terceira aumenta a superfície que `dev_destrutivo.sql` e
    `seguranca_catalogo.sql` vigiam). O `perform pg_advisory_xact_lock(hashtext('import_substituir'),
    v_filial::int)` da linha **116** é da mesma classe: efeito local à TRANSAÇÃO, declarado hoje no
    topo, e é ele que serializa dois applies simultâneos da mesma filial. A ficha não fala dele. Trate
    os dois pela mesma régua e escreva o motivo. `guarda_acervo` lê a janela por
    `coalesce(current_setting('estoque.dev_destrutivo', true), '') = 'on'` (`0081:94`) — como é GUC
    local à transação, a auxiliar enxerga a janela aberta pela orquestradora. Confirme isso no roteiro,
    não no raciocínio.

13. **As auxiliares precisam de assinatura, e a ficha não dá nenhuma.** A orquestradora usa 20
    variáveis declaradas e devolve sete campos no `jsonb_build_object` final: `log_id`, `filial_id`,
    `ativos_criados`, `movs_apagadas`, `anotacoes_apagadas`, `termos_apagados`,
    `arquivos_termos_apagados`, `conflitos_abertos`. Isso quer dizer que
    `import_apagar_acervo_filial` tem de **devolver** as três contagens mais o `text[]` dos caminhos
    de arquivo, e que `import_validar_plano` tem de devolver (ou a orquestradora resolver antes) o
    `v_filial`. Desenhe as assinaturas em `docs/PLAN-F51.md` **antes** de escrever SQL, e prefira
    `returns jsonb` ou `returns record`/`out` a variável global — não existe variável global aqui.

14. **O resíduo do item N está em 5 cópias, mas só UMA se limpa.** `if p_contagens is not null and
    jsonb_typeof(p_contagens) = 'object'` aparece em 11 arquivos; nas seis primeiras (`0032`→`0037`)
    ele **era** a guarda. Virou resíduo a partir da `0040`, quando o `raise` obrigatório entrou logo
    acima — e sobrevive em `0040`, `0048`, `0064`, `0080` e `0094:200`. **Migration aplicada não se
    edita** (regra permanente, e desde a F46 é defesa executável: `migrations.lock.json`). A única
    limpeza é a do corpo novo, na `0131`.

15. **O item da ficha sobre `status_apos_movimentacao` × `rel_estoque_asof` provavelmente JÁ FOI
    ENTREGUE — pela F36.** A ficha manda extrair `tipos_que_zeram_detentor()` porque "a assimetria
    entre as duas listas de tipos já foi bug". Medido: a `0110` (F36, 27/08/2026) criou
    `public.status_tem_detentor(public.status_ativo)` e o `comment` dela diz, textualmente, *"Fonte
    unica do zeramento de colaborador/setor em aplicar_movimentacao, rel_estoque_asof e
    forcar_estado_ativo"*; `rel_estoque_asof` a chama nas duas expressões de detentor (`0110:294` e
    `0110:300`); e `src/lib/validators/detentor-sql.test.ts` a protege. A matriz TS↔SQL de
    `status_apos_movimentacao` já tem guarda própria (`src/lib/validators/transicoes-sql.test.ts`,
    corrigida na F50 para casar `create or replace function` e não o mero nome). **Meça antes de
    fazer.** Se estiver fechado, a resposta certa é **registrar em ata que a F36 já entregou o item** —
    criar uma terceira função para o mesmo fato é exatamente como um gate morre (a que envelhecer
    primeiro vira a mentira, F48 · Decisão 2).

16. **O `db:types:diff` reprova esta fase no último check, se ninguém tratar.** Ele é passo do
    `banco-sem-docker`, que é *required check*, e reprova quando **o banco tem o que o `database.ts`
    não tem**. A `0131` cria sete (ou oito) funções `public` novas. E `npm run db:types` **gera de
    produção**, pela Management API (`scripts/gen-types.ts`) — quer dizer: regenerar só funciona
    **depois** do apply em produção. É a mesma armadilha que a F50 tratou na Decisão 6 dela, e aqui é
    a Decisão 6 desta. Se as auxiliares não aparecerem em `Functions` do arquivo de tipos, a fase
    entrega tudo e morre no fim.

**Estado de partida, medido em 08/09/2026:** `main` limpa (merge `853a69b`, PR #33), `package.json` em
**1.55.0**, tag `v1.55.0` publicada, última migration **`0130_grant_invoker_authenticated.sql`**,
**nenhuma migration pendente de apply** (é a primeira vez em quatro fases — `RELATORIO-F50.md` §11.1),
último id da matriz **R-ACC-44**, contador **248**, backlog nomeado para a F51: **nada**
(`RELATORIO-F50.md` §11.2 — *"a F51 segue como o plano a descreve"*). O roteiro
`supabase/tests/import_substituir.sql` existe com **11 asserções** em 4 cenários (rótulos `1a`, `1b`,
`1c`, `1d`, `1e` ×2, `2`, `3`, `4a`, `4b`, `4c`); os roteiros executáveis de `supabase/tests/` são
**29** (o runner pula `_*.sql`); o lote do injetor tem **39 mutações ativas** e **2 em quarentena**, as
duas marcadas `fase: 'F52'`.

**Os métodos que continuam valendo:** o do §15 da F45 — *"comando não encontrado" é hipótese, não
conclusão* —; e o que a F47, a F48, a F49 e a F50 confirmaram quatro vezes seguidas: **número escrito
na ficha se mede antes de repetir.** Foram 34 asserções que viraram 58, 54 policies que viraram 55,
"nove leituras sem guarda" que viraram nove de dezenove, e 12 módulos que viraram 14.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Transformar `public.importar_ativos_substituir` — 393 linhas de corpo vivo na `0094`, onze cópias
integrais na cadeia de migrations — numa **orquestradora fina sobre auxiliares nomeadas**, com
comportamento IDÊNTICO e assinatura `(jsonb, text, jsonb, jsonb)` byte a byte igual. Ao final: a
migration `0131` traz as auxiliares (`import_validar_plano`, `import_revalidar_contagens`,
`import_apagar_acervo_filial`, `import_criar_ativos`, `import_lancar_movimentacoes`,
`import_contar_conflitos`, `import_gravar_trilha` — mais a oitava que a Decisão 3 resolver), todas com
`revoke all … from public, anon, authenticated, service_role` **provado por
`has_function_privilege`**; a janela `estoque.dev_destrutivo` e o `pg_advisory_xact_lock` continuam
declarados na função de TOPO; `import_apagar_acervo_filial` é a **única função da cadeia do import**
que contém `delete from public.ativos`, e há trava que confere isso a cada `npm run test`; o resíduo
morto do item N sai do corpo novo; `supabase/tests/import_substituir.sql` dá **o mesmo resultado
cenário a cenário antes e depois**, com uma seção 0 nova que exercita cada auxiliar isoladamente; as
duas mutações do import passam a mirar as auxiliares e há uma mutação nova por auxiliar; o
`catalogo_secdef.sql` conhece as novas; e a dívida técnica **X** é marcada como abatida em
`docs/DIVIDA-TECNICA.md`. Versão **1.56.0** com tag publicada; PR mergeado com `verificar` e
`banco-sem-docker` verdes.
**Refatoração PURA: nenhuma guarda nova, nenhuma mudança de comportamento, nenhuma mudança de
assinatura da orquestradora, nenhuma dependência nova, nenhum `empresa_id`, nenhum recorte de filial.**

# Contexto

## Leia antes de escrever qualquer código
- `@CLAUDE.md` manda em tudo: modo autônomo e as regras permanentes. Pesam aqui a **1** (escopo da
  ordem atual — esta fase tem F52, F56 e F62 encostadas nela), a **2** (NUNCA dados reais: os CSVs e o
  smoke do import são 100% fictícios, `WAP0001234`/"Fulano"), a **3** (custo R$ 0, stack FECHADA), a
  **5** (produção com autoproteção: backup/dry-run antes de destrutivo), a **6** (confira a doc oficial
  atual antes de escrever integração) e a **8** (versão, sem exceção e sem reinterpretação). Leia com
  atenção redobrada o parágrafo do **modelo de acesso** — em especial a frase sobre `importar_ativos_substituir`
  ser `SECURITY DEFINER` e por isso ter a autorização POR DENTRO.
- `@docs/PLANO-MULTIEMPRESA.md`, nesta ordem: **§4** (as 10 regras comuns a TODAS as fases — em especial
  a **2**, estado de repouso; a **3**, escopo fora explícito; a **4**, trava antes da correção; e a
  **10**, toda fase que toca banco declara a ORDEM de rollback, que é o inverso da ordem de apply),
  **§5 → F51** (a ficha: Objetivo / Entra / Não entra / Entregas / Pronto quando / Trava / Dependências
  / Risco / Reversão) e depois **§5 → F52** e **§5 → F56**, não para fazer, mas para saber o que **não**
  é seu: as guardas de escopo e o vocabulário como dado.
  ⚠ **A ficha da F51 no §5 é a fonte da verdade do escopo.** Onde este prompt e ela divergirem, vale a
  ficha — exceto onde este prompt traz uma MEDIÇÃO contra o disco de hoje; aí vale a medição, e ela vai
  para o relatório com a divergência explicada.
- `@docs/RUNBOOK-BANCO.md`, nesta ordem: **"O gate do modo automático"** (linha ~43), **"Aplicar uma
  migration" A e B** (~49), **"Rollback — a regra geral"** (~77), **"Roteiros de teste SQL — rode TODOS
  ao mexer em função/trigger"** (~94), **"Conferir o estado do banco"** e a **"Sonda de paridade ensaio
  × produção"** (~133) — é ela, e não o `md5` cru, que compara ambientes; o `md5` cru já enganou uma vez
  em 25/07/2026. E a **trava de hash** (~231) com o *"Quem acrescenta migration atualiza DUAS listas"*.
- `@supabase/migrations/0094_import_conta_conflitos.sql` — o corpo vivo, inteiro, com os comentários. O
  cabeçalho dela explica por que o `create or replace` é PURO e por que a assinatura idêntica dispensa
  `notify pgrst`. **Não copie o corpo para lugar nenhum: leia-o do arquivo.**
- `@supabase/migrations/0080_import_abre_janela.sql` e `@supabase/migrations/0081_guarda_acervo.sql` —
  as DUAS portas da janela `estoque.dev_destrutivo` e o trigger que a lê. É o par que explica por que a
  janela não pode migrar para a auxiliar.
- `@supabase/tests/import_substituir.sql` — o roteiro de hoje (12 asserções, 4 cenários). É o contrato
  que a refatoração preserva.
- `@scripts/db/corpo-vigente.mjs` (o cabeçalho inteiro: ele diz, por escrito, que existe **para esta
  fase**) e `@scripts/db/mutacoes.mjs` (as duas do import, ~649–687, e o cabeçalho que diz que a F51
  mexe **aqui** e não no motor).
- `@docs/DIVIDA-TECNICA.md` itens **X** (`:117`) e **N** (`:172`) — o diagnóstico que esta fase abate, e
  a Faixa 5 que a nomeia.
- `@docs/prompts/F50-fronteira-da-leitura-ultracode.md` e `@docs/RELATORIO-F50.md` — o padrão de ordem e
  de relatório da casa, e a lição do ensaio que pagou por si (o `revoke` que era no-op silencioso).

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Os dezesseis fatos medidos estão no cabeçalho desta ordem, fora do bloco do prompt. Releia-os e
**refaça cada medição** antes de usá-la: o número da última migration, as 393 linhas, o mapa de blocos,
as 79 linhas sem dono, as onze cópias, os 38 nomes de `k_secdef`, as 41 mutações ativas, os cinco
lugares vivos com `delete from public.ativos` fora do import. Onde a sua medição divergir da minha, **a
sua ganha** — desde que ela esteja no relatório com a divergência explicada.

## Comandos que já existem — use, não reinvente
- `npm run lint` · `npm run test` · `npm run build` · `npx tsc --noEmit` · `npm run contraste`
- `npm run db:test` · `npm run db:test:um <roteiro>` · `npm run db:test:mutations` · `npm run db:types:diff`
- `npm run db:lock` — **obrigatório** nesta fase: ela ACRESCENTA a `0131`. Mesmo commit da migration.
- `npm run db:types` — só depois do apply em produção; leia a Decisão 6 antes de rodar.
- `npm run verificar:actions` · `node scripts/smoke/smoke-prod.mjs`
- `gh run watch` / `gh run view --log-failed` — o `gh` EXISTE nesta máquina (F45 §15); pode não estar
  no PATH da sessão. *"Comando não encontrado" é hipótese, não conclusão.*

# Escopo

## Dentro

### 1. A migration `0131` — a orquestradora fina e as auxiliares
- **Extraia a partir do mapa de blocos da `0094` que você mesmo mediu**, não do meu. As sete da ficha
  são `import_validar_plano`, `import_revalidar_contagens`, `import_apagar_acervo_filial`,
  `import_criar_ativos`, `import_lancar_movimentacoes`, `import_contar_conflitos` e
  `import_gravar_trilha`; a oitava, a conferência pós-insert, é a Decisão 3.
- **`import_apagar_acervo_filial` é a única função da cadeia do import que contém
  `delete from public.ativos`.** Ela recebe a filial e devolve as contagens de movimentações,
  anotações e termos apagados, mais o `text[]` dos `arquivo_path` — a orquestradora precisa dos quatro
  para montar o retorno.
- **A janela `estoque.dev_destrutivo` fica na função de TOPO**, aberta antes da chamada e fechada logo
  depois; a auxiliar só faz os DELETEs. Motivo escrito no cabeçalho da migration: existem hoje
  exatamente duas portas que abrem essa janela, e criar uma terceira aumenta a superfície que
  `dev_destrutivo.sql` e `seguranca_catalogo.sql` vigiam. **O `pg_advisory_xact_lock` segue a mesma
  régua** — decida e escreva o motivo (Decisão 4).
- **A guarda de cargo (`if not public.e_admin()` com `errcode = '42501'`) fica na orquestradora**, antes
  de qualquer auxiliar. Ela é a autorização de uma `SECURITY DEFINER`, e movê-la para dentro de uma
  auxiliar mudaria a ordem em que a recusa acontece.
- **`revoke all on function … from public, anon, authenticated, service_role`** em TODAS as auxiliares.
  A palavra `authenticated` é a que faz a superfície de RPC encolher em vez de crescer; a palavra
  `public` é a que impede o no-op silencioso que a F50 mediu. **Prove com `has_function_privilege` nos
  quatro papéis, para cada auxiliar, e cole a saída.**
- **A assinatura da orquestradora fica byte a byte igual** — `(jsonb, text, jsonb, jsonb)`, `returns
  jsonb`, `language plpgsql`, `security definer`, `set search_path = public`. Isso preserva
  `src/lib/actions/importar.ts:423`, os grants e o cache do PostgREST. Reafirme os grants dela como a
  `0094` faz (é idempotente e barato) e emita o `notify pgrst, 'reload schema';` mesmo assim, na
  verificação pós-apply.
- **O retorno da orquestradora fica byte a byte igual**: as oito chaves de `jsonb_build_object`, na
  mesma ordem, com os mesmos nomes. O `rpcRetornoSchema` que as valida está em
  `src/lib/actions/importar.ts:120` (não em `validators/`) e é consumido em `:444` — leia os dois antes
  e confirme. Uma chave a menos vira `safeParse` falho **depois** do DELETE+INSERT já commitado, que é
  exatamente o cenário que o cabeçalho da `0094` descreve como "falso erro pós-destrutivo".
- **Limpe o resíduo vivo do item N** no corpo NOVO: `if p_contagens is not null and
  jsonb_typeof(p_contagens) = 'object' then` (`0094:200`) é sempre verdadeiro desde que o `raise` de
  `0094:196-198` virou obrigatório. **Não toque nas cópias históricas** — migration aplicada não se
  edita, e desde a F46 isso é defesa executável.
- **O cabeçalho da migration** segue o padrão da casa: por que ela existe, o que MUDA e o que NÃO muda,
  o bloco de **verificação pós-apply** e o bloco de **reversão** (que é `create or replace` da
  definição monolítica da `0094` + `drop function` das auxiliares, **nesta ordem**: primeiro a
  orquestradora volta a ser monolítica, só depois as auxiliares somem — o inverso derrubaria a
  orquestradora nova enquanto ela ainda estivesse no ar).

### 2. A prova de equivalência — é o coração da fase
- **`supabase/tests/import_substituir.sql` roda ANTES e DEPOIS**, e o resultado é o mesmo **cenário a
  cenário** (os 12 rótulos atuais: `1a`, `1b`, `1c`, `1d`, `1e` ×2, `2`, `3`, `4a`, `4b`, `4c`, mais a
  linha `FIM`). Guarde as duas saídas em `docs/f51-evidencias/`.
- **Seção 0 nova no roteiro**, exercitando **cada auxiliar isoladamente** — validação recusando plano
  vazio, revalidação recusando contagens divergentes, contagem de conflitos sobre uma filial sem
  conflito, gravação de trilha devolvendo `log_id`. Cada asserção com rótulo próprio (`0a`, `0b`, …),
  porque o injetor casa por **token** e `0a` não pode ser prefixo de outro rótulo do mesmo arquivo.
  A seção 0 chama as auxiliares como `postgres` — o roteiro já roda assim, e o `revoke` não alcança o
  dono. **Diga isso por escrito no cabeçalho da seção**, ou ela parece provar que o `revoke` não pegou.
- **`md5` normalizado do corpo antigo registrado na ata**, pelo método do runbook
  (`md5(regexp_replace(pg_get_functiondef(oid),'\s+',' ','g'))`), com o aviso escrito de que o `md5`
  cru **não compara ambientes** — para isso existe a sonda de paridade do runbook (~133).
- **Uma mutação nova por auxiliar** em `scripts/db/mutacoes.mjs`, e as **duas existentes reapontadas**
  (fato 7 do cabeçalho): `import-sem-revalidacao-de-contagens` e `import-sem-exigencia-de-backup`
  passam a mirar as auxiliares, com as sondas `prova` reescritas para casar o `pg_get_functiondef`
  **da auxiliar certa**. Conte o lote antes: `mutacoes.test.mts` reprova acima de **44 ativas**.
- **`npm run db:test:mutations` verde**, com cada quebra acusada pelo **cenário nomeado**, nunca por
  "deu ✗ em algum lugar".

### 3. A trava de mesa — `delete from public.ativos` na cadeia do import
Um teste que lê as migrations como TEXTO (sem banco, como `migrations-lock.test.ts` e
`transicoes-sql.test.ts` já fazem) e afirma, sobre o corpo VIGENTE de cada função:
- **dentro da cadeia do import**, `delete from public.ativos` aparece no corpo de **exatamente uma**
  função, e ela é `import_apagar_acervo_filial`;
- a **orquestradora não contém a string** e **referencia pelo nome** cada uma das auxiliares;
- as auxiliares que a ficha nomeia **existem** e nenhuma sumiu.

⚠ **A invariante é ESCOPADA à cadeia do import, e o cabeçalho do teste tem de dizer por quê**, com os
cinco lugares legítimos nomeados: `apagar_ativo` (`0082`), `resetar_acervo`/`resetar_itens`/
`resetar_dados_ficticios` (`0083`/`0089`/`0090`) e `apagar_ativos_conflito_filiais` (`0093`→`0100`).
Escrever a invariante global faria a trava **nascer vermelha por motivo legítimo** — e a F48 já
escreveu que gate assim é gate que alguém desliga.

⚠ **Asserção sobre ESTRUTURA, não sobre tamanho.** Nada de teto de `length(pg_get_functiondef(...))`
nem de contagem de linhas: um comentário novo derrubaria a trava sem que nada de errado tivesse
acontecido. Reuse `corpoVigente()` de `scripts/db/corpo-vigente.mjs` em vez de reimplementar o
resolvedor — ele já varre da migration maior para a menor e já tem teste próprio.

O caminho da ficha é `src/lib/import/import-uma-porta.test.ts`. A convenção da casa para trava que lê
migration é `src/lib/validators/` (é onde moram `migrations-lock.test.ts`, `transicoes-sql.test.ts`,
`detentor-sql.test.ts` e `tipos-item-sql.test.ts`). **Escolha, e escreva o motivo em uma linha** — o
importante é que o arquivo esteja coberto por um projeto do Vitest (`vitest.config.mts`), porque teste
fora do runner nunca roda e ninguém fica sabendo (é asserção da própria F45).

### 4. Os catálogos que a fase move junto
- **`supabase/tests/catalogo_secdef.sql`**: se as auxiliares nascerem `security definer`, os nomes
  entram em `k_secdef` no MESMO commit — a asserção 1 confere nos dois sentidos e o
  `banco-sem-docker` fica vermelho por construção se você deixar para depois. Meça o total (hoje
  **38**) e escreva o novo.
- **`supabase/tests/seguranca_catalogo.sql`** e **`supabase/tests/dev_destrutivo.sql`**: releia o que
  cada um afirma sobre a janela `estoque.dev_destrutivo` e sobre os grants das RPCs de escrita, e
  ajuste **só** o que a decomposição tornou falso. Não duplique aqui o que o `catalogo_secdef` já
  afirma — duas fontes para o mesmo fato é como um gate morre (F48 · Decisão 2).
- **`src/lib/types/database.ts`**: as auxiliares aparecem em `Functions`. Ver a Decisão 6.
- **`supabase/migrations.lock.json`** por `npm run db:lock`, no mesmo commit da `0131`.

### 5. O par `status_apos_movimentacao` × `rel_estoque_asof` — MEÇA ANTES DE FAZER
A ficha manda extrair `tipos_que_zeram_detentor()`. **Confira primeiro se a F36 já entregou isso** com
outro nome: `public.status_tem_detentor(public.status_ativo)` na `0110`, cujo `comment` se declara
*"fonte única do zeramento"*, chamada por `rel_estoque_asof` nas duas expressões de detentor e
protegida por `src/lib/validators/detentor-sql.test.ts`; e a matriz de transições já tem
`src/lib/validators/transicoes-sql.test.ts`. **Se estiver fechado, a entrega desta frente é a ATA
dizendo que a F36 fechou o item, com as linhas citadas** — e nada de código. Criar uma terceira função
para o mesmo fato é o defeito, não a entrega. Se você achar uma assimetria REAL que sobreviveu à
`0110`, aí sim: extraia, e mostre a assimetria com as duas listas lado a lado.

### 6. O apply — ensaio primeiro, produção depois, e o gate pode não disparar
1. **Ensaio**, em `begin; … rollback;` primeiro (é o que pegou o no-op da F50), depois de verdade.
2. **Verificação pós-apply obrigatória** do runbook §5: `pg_proc` com **exatamente 1 linha** para
   `importar_ativos_substituir` e 4 args; `has_function_privilege` com `authenticated=true`,
   `anon=false`, `service_role=false` na orquestradora; os quatro papéis `false` em cada auxiliar;
   `notify pgrst, 'reload schema';`.
3. **Produção**, pelo mesmo caminho, com backup/contagens antes e depois — a `0131` não toca dado, mas
   ela **recria a função que apaga acervo**, e a regra 5 do `CLAUDE.md` vale pelo que a função pode
   fazer, não pelo que a migration faz.
4. **Se o gate do modo automático disparar**: handoff em `scratchpad/` pelo caminho B do runbook, com
   o SQL rodável e o bloco de conferência, e a pendência nomeada no relatório. **Não pare, não peça
   permissão, não invente caminho de apply alternativo, não force o classificador.**
5. **Smoke** (`node scripts/smoke/smoke-prod.mjs`) depois do deploy. Ele não exercita o import (que é
   destrutivo), e dizer isso no relatório vale mais do que deixar implícito.

### 7. O fechamento de sempre
`docs/PLAN-F51.md` (antes de implementar, com as assinaturas desenhadas e as seis decisões tomadas),
`docs/RELATORIO-F51.md`, ata em `docs/DECISOES.md`, emenda na `docs/MATRIZ-REGRAS.md` a partir de
**R-ACC-45** com o contador atualizado (hoje **248**), entrada no `CHANGELOG.md`, versão **1.56.0** no
`package.json` e no topo de `src/lib/versoes/registry.ts`, tag anotada `v1.56.0` publicada, PR
mergeado. E a **dívida X marcada como abatida** em `docs/DIVIDA-TECNICA.md`, com o número real de
linhas que a próxima mudança vai custar em vez das 393 — é a métrica que justifica a fase.

⚠ **A entrada do `registry.ts` é uma fase INVISÍVEL ao operador, e o `CLAUDE.md` diz o que fazer:**
2 a 6 mudanças em **linguagem de operador**, 2 frases honestas sobre o efeito real, **nunca** "nada
mudou para você" e nunca o silêncio de pular a entrada. Há teste que recusa vocabulário de
desenvolvedor. Um molde honesto: *"O import de startup continua fazendo exatamente o que fazia. O que
mudou é por dentro: dar manutenção nele deixou de exigir reescrever a operação inteira."*

## Fora — não toque
- **Nenhuma guarda nova, em RPC nenhuma** — é F52. Não toque em `exigir_gestao_de`, em
  `existe_outro_admin_ativo`, nem acrescente escopo a nada.
- **Nenhuma mudança de comportamento.** Nenhuma mensagem de erro reescrita, nenhuma validação nova,
  nenhuma ordem de operação alterada, nenhum campo novo no retorno, nenhuma coluna nova em
  `import_logs`. Se você achar um bug de verdade no caminho, **registre-o no backlog do relatório** e
  siga — consertar aqui destrói a prova de equivalência, que é a única rede desta fase.
- **Nenhuma mudança de assinatura**, nem da orquestradora nem de nada que `actions/importar.ts` chame.
- **Nenhum `empresa_id`**, nenhum recorte de filial, nenhum vocabulário como dado (F56), nenhum
  seletor de empresa.
- **Não edite migration aplicada.** As onze cópias históricas ficam como estão, resíduo do item N
  incluído. `migrations.lock.json` reprova, e reprovar é o comportamento certo.
- **Não converta as asserções fracas de outros roteiros** e não mexa na quarentena do injetor — as
  duas entradas de lá estão marcadas `fase: 'F52'`.
- **Não crie uma terceira porta para a janela `estoque.dev_destrutivo`** e não mexa em
  `guarda_acervo` (`0081`).
- **Não mexa na branch protection**, não rode roteiro SQL contra produção (os roteiros ESCREVEM, ainda
  que em `begin; … rollback;` — regra permanente 5), não rode `npm run db:seed`/`db:reset` contra
  nada que não seja DEV.
- Nenhuma dependência nova, nem em `devDependencies`. Nenhum recurso pago. Nenhum dado real em
  fixture, roteiro, mutação, evidência ou comentário — tudo sintético (`WAP0001234`, `ZZF19…`,
  "Fulano").
- Backlog herdado, e continua fora — entrega avulsa PATCH: o comentário morto em
  `scripts/gen-types.ts` (cita o job `banco`, removido na v1.51.1) e a exclusão `_%` em
  `supabase/ci/impressao-schema.sql`.

# A ordem de entrega não é livre
1. **Medir primeiro**, e escrever `docs/PLAN-F51.md` com os números reais: o mapa de blocos da `0094`
   linha a linha, as linhas de cada auxiliar, as **assinaturas desenhadas** (o que cada uma recebe e
   devolve), o total de `k_secdef`, o total de mutações ativas, os lugares vivos com
   `delete from public.ativos` fora do import. Teste escrito a partir do número da ficha nasce errado.
2. **Decisões 1 a 6 tomadas e registradas ANTES de escrever SQL.** A 2 decide se a fase é segura; a 6
   decide se o PR consegue ficar verde.
3. **O roteiro ANTES da migration.** Rode `import_substituir.sql` contra o corpo de HOJE e guarde a
   saída. Ela é o gabarito: sem ela, "o resultado é o mesmo" é afirmação, não prova.
4. **A trava (frente 3) ANTES da migration**, e ela nasce **VERMELHA** — as auxiliares ainda não
   existem. **Guarde a saída vermelha**: é evidência de relatório, não estado intermediário a esconder
   (regra 4 do §4 do plano).
5. **A migration `0131`**, com `npm run db:lock` e `k_secdef` no MESMO commit.
6. **A seção 0 do roteiro e as mutações** (as duas reapontadas + as novas), com
   `npm run db:test:mutations` verde.
7. **A comparação antes × depois**, cenário a cenário, colada em `docs/f51-evidencias/`.
8. **O apply** (ensaio → produção) e, só então, `npm run db:types` e a Decisão 6 se resolve.
9. **Frente 5** (o par do detentor) — medição e ata, código só se a assimetria existir de verdade.
10. **Matriz, dívida X, CHANGELOG, versão, tag, ata, relatório e PR no fim.**

# As decisões obrigatórias — meça antes de decidir, registre em `docs/DECISOES.md`

**Decisão 1 — `security definer` ou `security invoker` nas auxiliares?** Dentro de uma `SECURITY
DEFINER`, `current_user` já é o dono; uma auxiliar INVOKER chamada dali roda com os mesmos
privilégios. Quer dizer: INVOKER **funciona** e ENCOLHE a superfície mais concentrada de poder do
banco em vez de crescê-la em sete. O que protege as auxiliares é o `revoke`, não o `prosecdef`. Contra:
a ficha assume DEFINER; `catalogo_secdef.sql` foi desenhado para classificá-las; e uma auxiliar INVOKER
que um dia seja chamada de fora de um contexto definer se comporta diferente, em silêncio. **Meça as
duas consequências** — o que `catalogo_secdef.sql` cobra em cada caso e o que `seguranca_catalogo.sql`
já afirma sobre grants — e decida. Qualquer que seja a escolha, `set search_path = public` em TODAS (é
asserção do catálogo) e `revoke` nos quatro papéis.

**Decisão 2 — a ordem física do bloco 4, e é a decisão mais perigosa da fase.** Hoje 4a/4b/4c/4d rodam
no MESMO `for` por ativo. Separar em `import_criar_ativos` e `import_lancar_movimentacoes` como duas
passagens muda `created_at` e o `id desc` do desempate que `rel_estoque_asof` usa
(`order by ativo_id, data desc, created_at desc, (tipo='ajuste') desc, id desc`), e o trigger
`trg_aplicar_movimentacao` (`0004:135`) deriva o estado. As opções sérias:
**(a)** a orquestradora **mantém o loop** e chama as duas auxiliares **por ativo**, preservando a ordem
exata — a equivalência é por construção, e o custo é um `perform`/`select` por ativo dentro do loop;
**(b)** `import_criar_ativos` recebe o plano inteiro e mantém o loop com 4a–4d por dentro, e
`import_lancar_movimentacoes` **não nasce nesta fase** — contraria a lista da ficha, e o motivo tem de
ser escrito;
**(c)** duas passagens completas, com **prova** de que a ordem resultante é a mesma — e essa prova tem
de ser um cenário do roteiro com ativos em estados diferentes, não um argumento.
**Meça o custo de (a)** antes de descartá-la por desempenho: o import de startup roda uma vez por
filial, na janela de go-live, e a planilha maior tem ordem de mil linhas. Se (a) custar caro, diga
quanto, medido — não estimado.

**Decisão 3 — as 79 linhas da conferência (blocos 5/5b/5c/5d).** A lista de sete da ficha não as
cobre. Ou nasce `import_conferir_resultado` (oitava auxiliar, e o `k_secdef` vai a 46), ou elas ficam
na orquestradora. Argumento para extrair: é o bloco mais denso do corpo (79 linhas, um `except`/`union
all` de 40) e é exatamente o tipo de coisa que a F52 e a virada vão querer mudar sem reescrever tudo.
Argumento para não extrair: ela é a **verificação** da orquestradora, e verificação que sai da função
que orquestra é verificação que alguém esquece de chamar. **Decida e escreva o motivo.**

**Decisão 4 — o `pg_advisory_xact_lock` fica onde?** Ele está hoje no bloco 1a (`0094:116`), no meio do
que vira `import_validar_plano`, e é ele que serializa dois applies simultâneos da mesma filial. A
ficha manda a janela `estoque.dev_destrutivo` ficar no topo e é silenciosa sobre o lock. Trate os dois
pela mesma régua — efeito local à transação, declarado à vista na função que orquestra — ou explique
por que não. **Um lock tomado dentro de uma auxiliar continua valendo** (é `xact`), então isto é
legibilidade e superfície, não correção; mas é decisão, não acidente.

**Decisão 5 — onde mora a trava, e o que ela lê.** Os três candidatos:
`src/lib/import/import-uma-porta.test.ts` (o caminho da ficha), `src/lib/validators/` (onde já moram
`migrations-lock.test.ts`, `transicoes-sql.test.ts`, `detentor-sql.test.ts` e `tipos-item-sql.test.ts`
— a convenção da casa para trava que lê migration) e `scripts/db/*.test.mts` (ao lado de
`mutacoes.test.mts` e `corpo-vigente.test.mts`). **Medido: o projeto `puro` do `vitest.config.mts`
inclui `src/**/*.test.ts`, `scripts/**/*.test.ts` e `scripts/**/*.test.mts`** — os três rodam, então a
cobertura pelo runner não decide. O que decide é o import de `corpoVigente()`: ele vive em
`scripts/db/corpo-vigente.mjs`, e importar `.mjs` de `scripts/` a partir de `src/` sob o alias `@/`
pode não passar em `npx tsc --noEmit` (o `include` do `tsconfig` e a resolução de módulo são outra
pergunta que a do Vitest). **Meça isso antes de escolher** — e, se não passar, o teste vai para
`scripts/db/`, que é onde os testes que leem migrations já moram, e o motivo entra em uma linha na
ata. Reusar `corpoVigente()` é requisito nos três casos: reimplementar o resolvedor cria a segunda
fonte do mesmo fato.

**Decisão 6 — o `database.ts` e o gate de deriva.** A `0131` cria funções `public` novas;
`npm run db:types:diff` reprova enquanto o arquivo de tipos não as conhecer, e ele é passo do
*required check*. `npm run db:types` gera **de produção**. Os caminhos honestos, em ordem de
preferência: (i) aplicar em produção e regenerar — o caminho limpo, e é por isso que o apply vem antes
do fim; (ii) hand-fix nominal no `database.ts` acrescentando as assinaturas das auxiliares, com
comentário datado dizendo que foi à mão e por quê (há precedente registrado: `DECISOES.md:448`);
(iii) se nem um nem outro der, a fase **não mergeia** e a pendência é essa — diga isso com todas as
letras em vez de afrouxar o gate. **Afrouxar o `diff-tipos.mjs` para passar não é opção.**

# A trava
A trava desta fase é a de mesa (frente 3): **na cadeia do import, `delete from public.ativos` mora no
corpo de uma função só, e a orquestradora referencia as auxiliares pelo nome sem conter a string**.
Ela transforma "a função destrutiva é uma só" de intenção em invariante conferida a cada
`npm run test`, sem banco. Ao lado dela, no banco: `import_substituir.sql` (o contrato de
comportamento, com a seção 0 nova), `catalogo_secdef.sql` (as auxiliares classificadas, nos dois
sentidos) e o **injetor**, com uma mutação por auxiliar — que é a única ferramenta capaz de provar que
os roteiros sabem ficar vermelhos.

# Critérios de aceitação — autoverifique item a item e cole a evidência de cada um
1. A migration é a **`0131`** (não a `0130` da ficha), e `npm run db:lock` foi rodado no mesmo commit.
2. A orquestradora tem assinatura e retorno **byte a byte iguais** aos da `0094` — mostrado por diff.
3. As auxiliares da ficha existem, com os nomes da ficha; a oitava (ou a ausência dela) está decidida
   e registrada (Decisão 3).
4. `import_apagar_acervo_filial` é a **única função da cadeia do import** com `delete from
   public.ativos`; a orquestradora **não** contém a string. A trava prova isso e **reprova quando
   sabotada** — saída colada.
5. O cabeçalho da trava nomeia os **cinco lugares legítimos** fora do import e explica por que a
   invariante é escopada. A trava **não** usa teto de tamanho nem contagem de linhas.
6. `revoke all … from public, anon, authenticated, service_role` em todas as auxiliares, com
   `has_function_privilege` devolvendo **false nos quatro papéis** para cada uma — saída real colada,
   do ensaio.
7. A janela `estoque.dev_destrutivo` está na função de **topo**, com o motivo escrito; a Decisão 4
   (advisory lock) está tomada e registrada.
8. A guarda `e_admin()` continua na orquestradora, antes de qualquer auxiliar, com o `errcode = '42501'`.
9. O resíduo do item N saiu do corpo NOVO, e **nenhuma migration histórica foi editada** — provado por
   `git diff` e pelo `migrations-lock.test.ts` verde.
10. `import_substituir.sql` dá **o mesmo resultado, rótulo a rótulo**, antes e depois — as duas saídas
    em `docs/f51-evidencias/`, lado a lado no relatório.
11. A **seção 0** exercita cada auxiliar isoladamente, com rótulos que não são prefixo uns dos outros,
    e o cabeçalho dela diz que roda como `postgres` e por que isso não contradiz o `revoke`.
12. As duas mutações do import foram **reapontadas** para as auxiliares, com as sondas `prova`
    reescritas; há **uma mutação nova por auxiliar**; `mutacoes.test.mts` passa — e o **teto de 44 ativas**
    foi tratado explicitamente (39 hoje + 7 ou 8 novas estoura), com a escolha registrada e `npm run db:test:mutations` acusa cada quebra **pelo
    cenário nomeado**.
13. `catalogo_secdef.sql` conhece as auxiliares (se DEFINER), com o total medido antes (**38**) e
    depois; a asserção 1 passa nos dois sentidos.
14. O `md5` normalizado do corpo antigo está na ata, com o aviso de que `md5` cru não compara
    ambientes.
15. A **frente 5** (o par `status_apos_movimentacao` × `rel_estoque_asof`) está resolvida: ou a ata diz
    que a **F36/`0110` já entregou o item**, com as linhas citadas, ou existe a assimetria real e ela
    está mostrada com as duas listas lado a lado.
16. `npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos; nenhuma dependência
    nova no `package.json`; `git diff` **não** mostra `empresa_id`, guarda nova, mensagem de erro
    reescrita nem mudança em `src/lib/actions/importar.ts`.
17. `npm run db:types:diff` passa no `banco-sem-docker`, e a Decisão 6 está registrada com o caminho
    que você usou.
18. O apply foi tentado em ensaio e produção pelo caminho A, com a verificação pós-apply do runbook
    colada; se o gate disparou, o handoff está em `scratchpad/` e a pendência está nomeada.
19. `docs/MATRIZ-REGRAS.md` traz a emenda F51 a partir de **R-ACC-45**, com o teste que prova cada
    regra e o contador atualizado (hoje 248).
20. `docs/DIVIDA-TECNICA.md` marca o item **X** como abatido, com o número real de linhas que a
    próxima mudança da RPC vai custar.
21. Versão **1.56.0** no `package.json` e no topo do `registry.ts` (2 a 6 mudanças em **linguagem de
    operador**, honestas sobre uma fase invisível), tag `v1.56.0` anotada e publicada, entrada no
    `CHANGELOG.md`.
22. PR mergeado com `verificar` e `banco-sem-docker` verdes; `main` em estado de repouso válido — sem
    branch aberta, sem auxiliar órfã, sem trava pela metade, sem exceção sem motivo escrito.

# Verificação — rode de verdade
A cada incremento: `npm run lint`, `npm run test`, `npx tsc --noEmit`; `npm run build` antes do PR.
Depois da migration: `npm run db:lock` e, se houver Postgres nesta mesa, `npm run db:test`
**inteiro** — não só `import_substituir.sql`: a regra da F17 (`RUNBOOK-BANCO.md:94`) manda rodar TODOS
os roteiros ao mexer em função, e esta fase mexe na maior delas. Se não houver Postgres (a mesa não
tem Docker desde a F46), o `banco-sem-docker` do PR é quem roda — e você **lê a saída dele** com
`gh run view --log-failed` em vez de supor. Leia a falha, corrija a **causa raiz** e repita até passar.
**Não afrouxe trava, não acrescente exceção para ficar verde, não troque a prova de equivalência por
uma afirmação, não desligue mutação porque deu trabalho.** Falha persistindo depois de ~3 ciclos: mude
de abordagem e registre a troca.

Provas obrigatórias, cada uma com a saída real em `docs/f51-evidencias/`:
- **A saída do `import_substituir.sql` ANTES da migration**, e a de DEPOIS, rótulo a rótulo.
- **A saída VERMELHA da trava** antes de as auxiliares existirem.
- **Sabotagem A:** ponha `delete from public.ativos` no corpo da orquestradora; a trava acusa.
- **Sabotagem B:** ponha `delete from public.ativos` numa segunda auxiliar do import; a trava acusa.
- **Sabotagem C:** apague a referência a uma auxiliar do corpo da orquestradora; a trava acusa (a
  auxiliar órfã é o modo realista de esta decomposição apodrecer).
- **Sabotagem D:** escreva a invariante na forma **global** e mostre-a nascendo vermelha por causa de
  `apagar_ativo` e das RPCs de reset — é a prova de que a escopagem não foi conveniência.
- **Sabotagem E (mesa):** mude, numa migration futura fictícia, o trecho que uma das duas mutações
  reapontadas procura, e mostre `trocarNoCorpo` reprovando ALTO. É a rede do fato 7.
- **Sabotagem F (banco):** neutralize a guarda de backup dentro de `import_validar_plano` e mostre o
  cenário `3` do roteiro ficando ✗; reverta. Idem para a revalidação e o cenário `2`.
- **`has_function_privilege` nos quatro papéis** para cada auxiliar, do ensaio, em
  `begin; … rollback;`.
- **`npm run db:test:mutations` completo**, com a tabela final do injetor.
- **`npm run build` limpo**, colado por inteiro.
- **O smoke** (`node scripts/smoke/smoke-prod.mjs`) depois do deploy, com a ressalva escrita de que ele
  **não exercita o import** — que é destrutivo e só roda na janela de go-live de uma filial.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem
espere confirmação em nenhuma hipótese. Régua, nesta ordem: (1) este prompt; (2) a ficha da F51 no §5
do plano; (3) as convenções do repositório (`CLAUDE.md`, `RUNBOOK-BANCO.md`, código existente); (4) a
opção mais simples e reversível. Decisão não-óbvia vai para `docs/DECISOES.md` com data, contexto,
escolha e motivo.

Falha persistindo depois de ~3 tentativas: **mude de abordagem** em vez de repetir, e registre a troca.
Bloqueio real (MCP ausente, gate do modo automático disparando, credencial recusada, produção
inalcançável, mesa sem Postgres): contorne se for seguro; senão, **entregue o resto e registre a
pendência com o que falta para resolvê-la**. O caminho B do runbook existe exatamente para isso e já
está escrito. **Não mexa em credencial, não invente caminho de apply alternativo, não force o
classificador de segurança, não desative a proteção da `main`.**

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que a medição
esteja no relatório. Foi assim que a F46 trocou "aplicar duas vezes" por prova de determinismo, a F47
trocou 34 por 58, a F48 trocou 54 por 55, a F49 trocou nove por dezenove, e a F50 trocou doze módulos
por catorze. **Aqui já há quatro divergências medidas de saída: a migration é a `0131` e não a `0130`;
o corpo tem 393 linhas e não 394/430; a lista de sete auxiliares deixa 79 linhas sem dono; e o lote de
mutações tem 39 ativas contra um teto de 44, que uma por auxiliar estoura.**

# Git e segurança
Branch `f51-decomposicao-rpc-import`, commits pequenos e frequentes, mensagens em pt-BR no padrão
conventional (`refactor(f51): …`, `test(f51): …`, `docs(f51): …`, `fix(f51): …`). PR com `gh pr create`;
merge só com os dois checks verdes. **Nunca:** push forçado, `git reset --hard`, `git checkout -- .`,
`git clean -fd`, amend de commit que não é seu, commitar `.env*`, `scratchpad/` ou dado real, editar
migration aplicada, mexer na branch protection, rodar roteiro SQL contra produção, rodar
`db:seed`/`db:reset` fora do DEV, ou escrever em produção fora do apply autorizado da `0131`.

# Como trabalhar
Explore com subagentes paralelos — um por frente, e **cada um volta só com resumo e NÚMEROS MEDIDOS**:
(a) o mapa de blocos da `0094` linha a linha, com o que cada bloco lê e escreve e quais das 20
variáveis do `declare` ele usa — é o insumo das assinaturas; (b) as onze cópias e o que mudou de uma
para a outra, para saber o que a decomposição **não** pode perder; (c) o rig de verificação:
`import_substituir.sql`, as duas mutações do import, `mutacoes.test.mts`, `corpo-vigente.mjs`,
`catalogo_secdef.sql`, `seguranca_catalogo.sql`, `dev_destrutivo.sql` — quem cobra o quê, e o que
quebra quando a função vira oito; (d) os cinco lugares vivos com `delete from public.ativos` fora do
import, um a um, com a migration vigente de cada; (e) o par `status_apos_movimentacao` ×
`rel_estoque_asof` e a `0110`, para responder se o item da ficha já está fechado.
Escreva `docs/PLAN-F51.md` antes de implementar, com as contagens reais, as **assinaturas desenhadas**
e as seis decisões já tomadas.

Ao final, **revisão adversarial por subagente em contexto fresco**, contra o `PLAN-F51.md` e os 22
critérios, com estas perguntas: a decomposição mudou a ordem física de alguma escrita — e, se mudou, a
prova disso é um cenário ou um argumento? algum comportamento observável mudou (mensagem, código de
erro, campo do retorno, ordem de recusa)? o `revoke` das auxiliares é real, ou é o no-op silencioso que
a F50 mediu? a trava é escopada por motivo escrito, ou virou isenção por categoria? ela reprova quando
sabotada nos três modos (string na orquestradora, string numa segunda auxiliar, auxiliar órfã)? as
mutações reapontadas continuam PEGANDO — a sonda `prova` mira a função certa? algum roteiro passou a
contar sobre conjunto vazio depois da mudança? a janela `estoque.dev_destrutivo` ganhou uma terceira
porta sem ninguém perceber? o `k_secdef` foi atualizado nos dois sentidos? o retorno da orquestradora
ainda satisfaz `rpcRetornoSchema` (`src/lib/actions/importar.ts:120`)? algum arquivo fora do escopo foi
tocado — especialmente da F52, da F56 ou de `src/lib/actions/`? **Aponte apenas lacunas de correção ou
de requisito declarado — não preferências de estilo.** Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F51.md`, em pt-BR, no padrão dos relatórios F45→F50: o que mudou por arquivo e por
quê; **os números MEDIDOS** (o mapa de blocos com as linhas de cada auxiliar, as assinaturas finais, o
total de `k_secdef` antes e depois, o lote de mutações antes e depois, os lugares com `delete from
public.ativos`), lado a lado com o que a ficha previa, e **cada divergência explicada** — a começar
pelas três já conhecidas (a `0131`, as 393 linhas, as 79 linhas sem dono); as seis decisões
obrigatórias com o custo que decidiu cada uma; a **comparação antes × depois do roteiro, rótulo a
rótulo**; as seis sabotagens com saída real, mais a saída vermelha da trava; os 22 critérios
autoverificados; o que este relatório **NÃO** prova (no mínimo: que a equivalência foi provada pelos
**cenários que o roteiro cobre**, e o roteiro cobre 4 + a seção 0 — não o espaço inteiro de planos de
import; que o smoke **não** exercita o import; que a trava é de TEXTO das migrations, não do banco — o
que está no ar é o que o apply pôs lá, e quem responde por isso é a verificação pós-apply; e que nada
aqui reduz a superfície da RPC, só a reorganiza); pendências (o apply, se o gate disparar; a
`database.ts`, se a Decisão 6 caiu no hand-fix) e backlog nomeado para a **F52** e para a **F56** — em
especial o que a decomposição facilitou e o que ela **não** facilitou.
**Evidências, não afirmações:** saída real e completa dos comandos. Termine a resposta final com um
resumo de 5 linhas em pt-BR.

# Idioma
Narrativa, plano, ata, relatório, comentários de código, comentários de migration, mensagens de erro,
`comment on function` e commits em **pt-BR**. Identificadores de domínio em português sem acento
(`import_validar_plano`, `import_apagar_acervo_filial`); utilitários e infra em inglês. As mudanças do
`registry.ts` em LINGUAGEM DE OPERADOR — há teste que recusa vocabulário de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~10 minutos)

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar. Se já houver falha,
#    o prompt precisa saber (acrescente uma linha dizendo qual).
npm run lint; npm run test; npm run build; npx tsc --noEmit

# 2. O gh EXISTE (F45 §15) — só pode não estar no PATH desta sessão.
& "C:\Program Files\GitHub CLI\gh.exe" auth status

# 3. ESTA FASE É A QUE MAIS SE PAGA COM POSTGRES NA MESA. Iterar numa RPC de
#    393 linhas a um push por vez é inviável — a própria ficha diz que a F46
#    (o db:test local) existe para destravar esta fase. Se der para subir, suba:
supabase start
npm run db:test              # confira que os 29 roteiros passam HOJE
npm run db:test:mutations    # e que o injetor está verde HOJE (39 ativas)

# 4. A versão do Claude Code (o modo `auto` exige 2.1.83+).
claude --version
```

Dentro do Claude Code, antes de colar: `/permissions` (confira que `Bash(git push*)` não está negado —
a fase abre PR e publica tag) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado).

**Conecte o MCP do Supabase antes de colar.** Esta fase recria a função mais destrutiva do sistema, e o
MCP é o que permite o ciclo certo: ensaio em `begin; … rollback;` → ensaio de verdade → produção, com a
verificação pós-apply do runbook. Sem ele a fase entrega o repositório e a `0131` fica pendente — o que
é legítimo e tem precedente (a `0128` ficou três fases), mas é o plano B, e ele **também** empurra a
Decisão 6 para o hand-fix do `database.ts`.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f51
# cole o bloco do prompt inteiro e deixe rodando
```

Modo `auto` é o certo: a fase roda `npm ci`, `npm run db:lock`, `gh pr create`, `git tag`/`push` e um
apply de migration por MCP — nada disso passa numa allowlist estreita, e nada disso é ação que o
classificador bloqueia. O que ela **não** faz (push forçado, reset destrutivo, editar migration
aplicada, roteiro SQL contra produção, mexer na proteção da `main`) está no escopo negativo do prompt.

⚠ **A única coisa desta fase que o classificador PODE recusar é o `apply_migration` da `0131`**, porque
o corpo dela contém `delete from public.ativos`. Isso é o gate do modo automático funcionando, não erro
— e o prompt manda o agente cair no caminho B (handoff em `scratchpad/`) e seguir. Na F24 ele não
disparou; se disparar aqui, você vai encontrar o SQL pronto para colar no SQL Editor.

Opcional, e recomendado para desatendido — a condição de parada como avaliador separado:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit passam limpos, a migration 0131 existe
com db:lock rodado, import_substituir.sql dá o mesmo resultado rótulo a rótulo antes e depois, a trava de
uma-porta-só reprova quando sabotada, npm run db:test:mutations está verde, e o PR está mergeado com
verificar e banco-sem-docker verdes
```

Sem colidir com trabalho local: `claude --worktree f51 --model opus --permission-mode auto` (aceite o
diálogo de confiança uma vez, antes).

### Enquanto roda

Esta fase é **a mais cara em ciclo de CI de todo o bloco de preparação**: ela reescreve a maior função
do banco, acrescenta migration, estende um roteiro e mexe no injetor — os três passos mais lentos do
`banco-sem-docker` de uma vez. Sem Postgres na mesa, espere muitos pushes. **Com** Postgres na mesa, o
ciclo cai de minutos para segundos, e é por isso que o pré-voo insiste nele.

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Três momentos para acompanhar:

1. **A saída do `import_substituir.sql` ANTES da migration.** Se ela não foi capturada, a fase perdeu o
   gabarito e "o resultado é o mesmo" vira afirmação. É o primeiro artefato que deve aparecer em
   `docs/f51-evidencias/`.
2. **O primeiro run da trava**, que nasce **VERMELHA** porque as auxiliares ainda não existem. Vermelho
   ali é a fase funcionando.
3. **O `db:test:mutations` depois da migration.** As duas mutações reapontadas são o ponto frágil: se a
   sonda `prova` continuar mirando a orquestradora, elas viram "não detectadas" e o diagnóstico sai
   errado. Confira a tabela final do injetor, não só o exit code.

### Ao voltar

1. Leia a **Decisão 2** na ata (a ordem física do bloco 4). É a decisão que pode ter quebrado
   comportamento em silêncio. Se a escolha foi "duas passagens completas", confira que existe um
   **cenário de roteiro** com ativos em estados diferentes provando a ordem, e não só um parágrafo.
2. Compare, com os olhos, as duas saídas do `import_substituir.sql` em `docs/f51-evidencias/`. Rótulo a
   rótulo. É a prova central da fase e ela cabe numa tela.
3. Confira a **sabotagem D**: a invariante global nascendo vermelha por causa de `apagar_ativo` e das
   RPCs de reset. Sem ela, a escopagem da trava é conveniência disfarçada de decisão.
4. `git diff main...f51-decomposicao-rpc-import -- supabase/migrations/` deve mostrar **exatamente** a
   `0131` e o `migrations.lock.json`. Qualquer migration antiga tocada = a fase quebrou a regra mais
   dura do repositório (e o `migrations-lock.test.ts` deveria ter pego antes).
5. `git diff main...f51-decomposicao-rpc-import -- src/lib/actions/` deve vir **vazio**. A assinatura
   não mudou; se a action mudou, alguma coisa mudou de comportamento.
6. Se a `0131` foi para produção: faça um import de startup **numa filial de teste do ensaio**, com CSV
   fictício, e confira o retorno. Em produção, nenhum import — o próximo é o de uma filial nova, na
   janela de go-live dela.
7. Rode você mesmo `npm run test` e `npm run build` uma vez.
8. Veio errado? **Regra dos 2 strikes:** depois de duas correções falhas, não emende a sessão — peça um
   prompt novo com o aprendizado e rode em sessão limpa. Nesta fase em particular, emendar é pior do
   que o normal: a prova de equivalência depende de o gabarito ter sido tirado antes da primeira
   mudança.

---

## Suposições que fiz

1. **F51 é a próxima fase e a F50 está fechada**: `main` limpa no merge `853a69b` (PR #33),
   `package.json` em 1.55.0, tag `v1.55.0` publicada, última migration `0130`, **nenhuma migration
   pendente de apply**. Se você tiver começado algo à mão, o prompt precisa de uma linha dizendo o quê.
2. **A migration desta fase é a `0131`**, a versão é **1.56.0** (fase = MINOR sobre 1.55.0) e a matriz
   começa em **R-ACC-45** sobre o contador 248. Se sair alguma correção avulsa (PATCH) antes desta
   fase, o agente recalcula a partir do `package.json` e do fim da matriz.
3. **A ficha da F51 no §5 do plano é o escopo.** As quatro divergências que medi contra o disco de
   hoje — a `0131` no lugar da `0130`; 393 linhas de corpo e não 394/430; as sete auxiliares deixando
   79 linhas (a conferência pós-insert) sem dono; e o lote do injetor com 39 mutações ativas contra um
   teto de 44, que uma mutação por auxiliar estoura — estão escritas no prompt como medição, e o
   agente é mandado remedir todas antes de usar. A quinta divergência possível é a mais barata de
   todas: a trava "uma função só" da ficha, que nasce vermelha se escrita globalmente.
4. **A fase é refatoração PURA.** Nenhum bug encontrado no caminho é consertado aqui: vai para o
   backlog do relatório. É a única forma de a prova de equivalência valer alguma coisa.
5. **O apply em produção é tentado, não garantido.** O prompt manda ensaio → produção pelo caminho A do
   runbook e, se o gate do modo automático disparar, cair no caminho B (handoff em `scratchpad/`) e
   registrar a pendência sem parar. Na F24 o gate não disparou; assumi que aqui também pode não
   disparar, mas não contei com isso.
6. **A Decisão 1 (DEFINER × INVOKER) ficou em aberto de propósito.** A ficha assume `security definer`;
   eu medi que INVOKER funciona igual dentro de um contexto definer e encolheria a superfície. Deixei o
   agente medir e decidir, com o `catalogo_secdef.sql` como árbitro. Se você tiver preferência, é uma
   linha a acrescentar no prompt.
7. **O item do par `status_apos_movimentacao` × `rel_estoque_asof` provavelmente já está fechado pela
   F36** (`0110` criou `status_tem_detentor`, com `detentor-sql.test.ts` protegendo, e
   `transicoes-sql.test.ts` já cobre a matriz de transições). O prompt manda medir e, se estiver
   fechado, entregar **ata em vez de código**.
8. **Não incluí teste de componente, régua de layout nem qualquer refatoração de front.** O §8 do plano
   os deixa de fora da preparação de propósito, e esta fase não toca `src/` além da trava e (se a
   Decisão 6 exigir) do `database.ts`.
