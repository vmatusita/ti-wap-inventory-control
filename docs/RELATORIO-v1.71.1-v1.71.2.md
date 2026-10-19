# RELATÓRIO v1.71.1 + v1.71.2 — Reservados por categoria · o colaborador que sobra do estorno

Ordem: [`prompts/prompt-reservados-por-categoria-e-colaborador-sem-uso.md`](prompts/prompt-reservados-por-categoria-e-colaborador-sem-uso.md).
Plano: [`PLAN-v1.71.1-v1.71.2.md`](PLAN-v1.71.1-v1.71.2.md). Atas: as duas de 2026-10-19 no fim de [`DECISOES.md`](DECISOES.md) — a da v1.71.1 já está na `main`; a da v1.71.2 vai com o PR #88.
Run de 19/10/2026.

## 0. No topo

### A resposta

**O colaborador cadastrado no campo da movimentação continua cadastrado e ativo depois do estorno.** O estorno desfaz
a movimentação e os itens, e devolve o equipamento sem detentor, mas não toca o cadastro, que segue nas sugestões do
campo. Isso está provado por roteiro. Agora a tela de colaboradores marca essa pessoa com o selo "Sem uso", e quem
decide desativar é você.

### Desfecho da run

- **v1.71.1 entregue em produção:** PR #86 mergeado (`408cbea`), tag `v1.71.1` publicada, `/api/saude` = `1.71.1`,
  smoke `109 OK · 1 aviso · 0 falha`.
- **v1.71.2 com o código pronto e o CI verde, mas SEM apply e SEM merge.** O conector da Supabase desta sessão estava
  ligado a OUTRA conta, onde o único projeto visível é um `prod` que não é da WAP. Por isso `execute_sql` nos dois
  projetos da WAP respondeu `You do not have permission to perform this action`, tanto na sessão principal quanto nos
  cinco subagentes. Pela própria ordem (§Autonomia), o PR #88 fica aberto, em rascunho, sem merge. O caminho está
  abaixo.

### O roteiro do Johnny: onde clicar

1. **O card novo (já no ar).** Abra **Relatórios › (uma filial com reservados)**. No grupo "Equipamentos principais",
   o card "Reservados" mostra:
   - o total no subtítulo ("N reservados"), que deve ser igual ao KPI "Reservados" do topo;
   - com duas categorias ou mais, os chips "Notebook 3 · Celular 2";
   - a lista separada por categoria, na ordem do card vizinho "Disponíveis por modelo".

   Abra também um relatório GERADO antigo em **Relatórios › Gerados**. Ele tem de abrir com o total e a lista numa
   coluna só, sem erro. Imprima um para ver a quebra de página.
2. **O selo, depois do caminho B.** Abra **Administração › Colaboradores** e use o filtro **"Uso: Sem uso"**.
   - A quantidade tem de bater com a contagem B2 (hoje, em produção: **1**).
   - Quem recebeu equipamento antes de ter cadastro NÃO pode aparecer ali.
   - Desative quem quiser pelo "Editar". Essa decisão é sua.

### O caminho B: o que ficou para você (a v1.71.2)

O apply não depende de decisão nova. Só faltou o canal. Reconecte o conector da Supabase do claude.ai na conta que
enxerga `pbtjcalbmepmrqzprusb` e `sgmvldiizsrjbxzzpmhh`, e peça numa sessão nova:

> Retome a v1.71.2 pelo §0 do docs/RELATORIO-v1.71.1-v1.71.2.md: aplique a 0180 no ensaio e em produção, confira, mergeie o PR #88 e publique a tag v1.71.2.

Os passos, na ordem (os mesmos da entrada `0180` do Anexo A do [`RUNBOOK-BANCO.md`](RUNBOOK-BANCO.md), que vai com o PR #88):

1. `get_advisors` (segurança e desempenho), no ensaio, como linha de base.
2. Confirmar que a função ainda não existe: `select to_regprocedure('public.colaboradores_uso_efetivo()') is null`.
3. `apply_migration` no ensaio, `name: colaboradores_uso_efetivo`, com o texto EXATO de
   `supabase/migrations/0180_colaboradores_uso_efetivo.sql`.
4. Rodar a sonda de efeito, uma linha só:

   ```sql
   select (select p.prosecdef from pg_proc p where p.oid = 'public.colaboradores_uso_efetivo()'::regprocedure) as secdef,      -- f
          (select p.provolatile::text from pg_proc p where p.oid = 'public.colaboradores_uso_efetivo()'::regprocedure) as volatil, -- s
          (select p.proconfig from pg_proc p where p.oid = 'public.colaboradores_uso_efetivo()'::regprocedure) as config,          -- {search_path=public}
          has_function_privilege('authenticated', 'public.colaboradores_uso_efetivo()', 'execute') as auth,   -- t
          has_function_privilege('anon', 'public.colaboradores_uso_efetivo()', 'execute') as anon,            -- f
          (select md5(prosrc) from pg_proc where oid = 'public.colaboradores_uso_efetivo()'::regprocedure) as md5_corpo,
          (select count(*) from public.colaboradores_uso_efetivo()) = (select count(*) from public.colaboradores) as uma_por_cadastro,
          (select count(*) from public.colaboradores_uso_efetivo() where sem_uso) as sem_uso;
   ```

   O `md5_corpo` tem de ser igual ao md5 do trecho entre os `$$` do arquivo, com quebras LF:
   **`b406f6cddc5375cafd9badda986ac893`**. Esse valor foi calculado do arquivo no PR #88 e é igual ao que a mesa
   PGlite mediu depois de aplicar a `0180`. A sonda inteira rodou na mesa e devolveu `f · s · {search_path=public} ·
   t · f · b406f6cd… · t`.
5. `notify pgrst, 'reload schema';`, depois `get_advisors` de novo. Achado novo leva ao rollback antes do diagnóstico.
6. Repetir os passos 1 a 5 em PRODUÇÃO. O `sem_uso` de produção tem de dar **1**, o número medido no "antes" pela
   regra (A8). Confira também com `npx tsx --env-file=.env.local scripts/colaboradores/medir-uso.mts --alvo=producao`.
7. `generate_typescript_types` de PRODUÇÃO. O bloco `colaboradores_uso_efetivo` gerado tem de bater com o hand-fix de
   `src/lib/types/database.ts`. Se bater, troque o comentário de hand-fix pelo arquivo gerado.
8. Tirar o PR #88 do rascunho e mergear depois do CI verde, sem `--admin`. Em seguida:
   - publicar a tag `v1.71.2` no commit do merge;
   - conferir `/api/saude` = `1.71.2`;
   - rodar `SMOKE_VERSAO_ESPERADA=1.71.2 node scripts/smoke/smoke-prod.mjs`;
   - em Administração › Colaboradores, confirmar que o filtro "Sem uso" mostra o número do passo 6.

**Rollback**, se algo reprovar depois do apply: derrubar a função (`drop function public.colaboradores_uso_efetivo();`).
Nenhum dado é tocado. O app em produção (v1.71.1) não a chama.

## 1. B1: as superfícies depois do estorno

A tabela abaixo vale para quem foi cadastrado no campo da movimentação e teve a movimentação estornada (✔ = provado
por execução no roteiro `supabase/tests/colaborador_estorno.sql`, 19 asserções verdes no CI; 📖 = por leitura do código).

| Superfície | O que mostra | Está certo? |
|---|---|---|
| O cadastro (`colaboradores`) ✔ | Continua ATIVO, sem nenhuma mudança. O formulário abandonado também deixa o cadastro de pé. | Sim pela doutrina ("não se apaga: desativa-se"). Faltava o administrador **achar** o caso, e o selo "Sem uso" resolve. |
| A movimentação original ✔ | Guarda o texto e o `colaborador_id`; aparece marcada como estornada. | Sim: o acervo é imutável. |
| A linha `estorno` ✔ | Existe, aponta a original e não tem pessoa (nem texto nem id). | Sim. |
| O inverso do item ✔ | `retorno` com o `colaborador_id` da pessoa quando ela tinha saldo; sem vínculo quando não tinha (§C.3 da F38). | Sim. |
| O ativo ✔ | Volta a "em estoque" sem detentor, o estado de antes da saída. | Sim. |
| "Com esta pessoa" ✔ | Vazio: o retorno zera a saída, e o par zerado não volta. | Sim. |
| Coluna "Registros" ✔ | Conta a movimentação estornada (1) e, com item, a saída e o inverso (2). | Sim pelo significado (o que está ligado ao cadastro), mas enganava sozinha. Agora o selo diz "N registros, todos estornados". |
| O campo Colaborador (sugestões) ✔ | Continua sugerindo a pessoa, e o botão "Cadastrar" some. | Sim por desenho (fora do escopo mudar). O selo mais o "Editar" resolvem. |
| Fila de consolidação ✔ | Não entra (`ja_cadastrado`). O texto da original e dos itens conta como ocorrência do cadastro. | Sim. |
| Relatório: Saídas / Entradas 📖 | A linha estornada continua, esmaecida, com o nome e o badge "Estornada em dd/MM/yyyy" (as-of o fim do período). | Sim. |
| Relatório: movimentações de itens 📖 | A original "estornada" e o inverso "(estorno)", os dois com o nome. | Sim. |
| Termo já gerado 📖 | Fica na ficha, com o nome, **sem marca** de estorno. O estorno restaura só `termo_assinado`/`termo_data` do ativo. | Parcial. O termo é o registro do momento, mas nada avisa que a movimentação dele foi desfeita. Vai para o backlog. |
| Pendências de item 📖 | A pendência de devolução ainda aberta é apagada pelo estorno; com desfecho, o estorno é recusado. | Sim. |
| Ficha do ativo / linha do tempo 📖 | A original riscada com "estornada", o destino em texto, e a linha do estorno sem pessoa. | Sim. |
| `/movimentacoes` 📖 | A original esmaecida com "(estornada)" e a linha "(estorno)" com "—" na coluna colaborador. | Sim. |

## 2. B2: as contagens (só números)

Instrumento só-leitura `scripts/colaboradores/medir-uso.mts`, pela API de leitura do app, paginado até o fim e
conferido contra `count exact`. A sessão foi a de consulta do smoke em produção e a persona fictícia `seed.consulta`
no ensaio. A regra é a de §2.2 do plano, a mesma da função. Saídas brutas em
`docs/v1.71.2-evidencias/b2-antes-*.json`. O SQL equivalente é a própria função `0180`. Para contar direto no banco,
depois do apply, use `select count(*) filter (where sem_uso) from public.colaboradores_uso_efetivo()`.

| Contagem (cadastros ativos) | Ensaio, antes | Produção, antes | Produção, depois do deploy |
|---|---:|---:|---:|
| cadastros (total / ativos) | 0 / 0 | 87 / 87 | pendente (caminho B) |
| com "Registros" > 0, como a tela conta hoje | 0 | 83 | — |
| sem registro vinculado por id | 0 | 4 | — |
| … desses, salvos pela chave do texto (o fato 13) | 0 | **3** | — |
| … desses, salvos só pelo detentor atual | 0 | 0 | — |
| **sem uso efetivo (o selo)** | 0 | **1** | pendente: o filtro tem de dar 1 |
| … nunca usado | 0 | 1 | — |
| … só registros estornados | 0 | 0 | — |
| com id, mas só registros estornados por id | 0 | 0 | — |
| movimentações `estorno` no acervo | 0 | 15 | — |

**O fato 13 confirmado com caso real:** dos 4 cadastros ativos de produção sem vínculo por id, 3 são salvos pela chave
do texto. Uma regra só por id marcaria essas 3 pessoas por engano. No ensaio não há cadastro nenhum, então a
confirmação "contando no ensaio" não tinha caso para contar (ata v1.71.2, item 2).

## 3. O que mudou, por arquivo

### v1.71.1 (PR #86, `408cbea`)

| Arquivo | Mudança |
|---|---|
| `src/lib/relatorios/reservados.ts` (novo) | `agruparReservados` (total, grupos na ordem `CATEGORIA_ORDEM`, itens por patrimônio, `null` se algum item vier sem categoria) e `rotuloReservados`. |
| `src/lib/relatorios/tipos.ts` | `ItemReservado.categoria?` (opcional, mantém `schema: 2`). |
| `src/lib/queries/formas/relatorios-gerados.ts` | `ITEM_RESERVADO` com `categoria` opcional, do vocabulário do banco. |
| `src/lib/queries/relatorios/estoque.ts` | `itensReservadosDeEstado` (pura) monta a lista com a categoria do estado, sem leitura nova; `reservadosDeEstado` faz as mesmas duas leituras e a chama. |
| `src/components/relatorios/lista-reservados.tsx` | Chips (com 2 categorias ou mais), grupos no molde do vizinho, lista corrida para snapshot antigo, `break-after-avoid` no cabeçalho do grupo. |
| `corpo-relatorio-v2.tsx`, `corpo-relatorio.tsx` | O subtítulo é o total. |
| testes | `reservados.test.ts`, `estoque.test.ts` (A1), `relatorios-gerados.test.ts` (A4), `lista-reservados.test.tsx`. |
| `scripts/design/previa-v1711.tsx` (novo) | A prévia estática antes × depois. |
| docs | Spec §7 item 2, ajuda (`relatorio-ao-vivo.ts`, `entregar-emprestar-reservar.ts`), ARQUITETURA §10, ata, README, CHANGELOG, `registry.ts`, `package.json`. |

### v1.71.2 (PR #88, sem merge)

| Arquivo | Mudança |
|---|---|
| `supabase/migrations/0180_colaboradores_uso_efetivo.sql` (nova) + `migrations.lock.json` | A função da regra. |
| `supabase/tests/colaborador_estorno.sql` (novo) | B1, o diagnóstico (ce1–ce10). |
| `supabase/tests/colaborador_uso_efetivo.sql` (novo) | A9, a regra (u0–u11), nascido vermelho. |
| `catalogo_policies.sql`, `empresa_no_acervo.sql`, `empresa_no_vocabulario.sql` | A exceção nominal em `k_leitura_tenant` (a fonte e as duas cópias). |
| `integridade_tenant.sql` | A L4 exclui pelo nome a função nova; a constante não muda. |
| `catalogos-seguranca.test.ts`, `empresa-acervo-sem-leitura.test.ts`, `migrations-f38.test.ts`, `diff-tipos.test.mts` | As listas e os censos com o objeto novo. |
| `scripts/db/mutacoes.mjs` + `.test.mts` | Cinco mutações `v1712-*`; teto de 151 para 156. |
| `src/lib/types/database.ts` | Hand-fix datado da função. |
| `src/lib/queries/formas/colaboradores.ts` + `catalogo.ts` | `LEITURA_USO_COLABORADORES`. |
| `src/lib/queries/colaboradores.ts` | `lerUsoDosColaboradores` (degrada para `null`); `ColaboradorAdmin.uso`. |
| `src/lib/colaboradores/uso.ts` (novo) + teste | O porquê do selo e o filtro. |
| `src/components/admin/colaboradores-tabela.tsx` + testes (grau 1 e DOM) + fixtures | O selo, o filtro e o aviso. |
| `scripts/colaboradores/medir-uso.mts` (novo) | A medição B2 só-leitura. |
| `scripts/design/previa-v1712.tsx` (novo), `previa-f61-dados.ts` | A prévia; as fixtures da F61 ganham `uso` "em uso", e a foto delas fica igual. |
| docs | Spec §6 (emenda), ajuda `administracao.ts`, ARQUITETURA §10, o documento das regras de acesso (R-ACC-117), RUNBOOK (Anexo A, `0180`), ata, README, `src/lib/colaboradores/CLAUDE.md`, CHANGELOG, `registry.ts`, `package.json`. |

## 4. As decisões

As duas atas de 2026-10-19 no fim de [`DECISOES.md`](DECISOES.md). Em resumo:

| Decisão | O quê |
|---|---|
| D1 | Sem canal de banco: a Frente B sai sem apply e sem merge. |
| D2 | O fato 6 está errado: nada a tirar de `PENDENTES`. |
| D3 | Os fatos 10 e 14 foram corrigidos: a última definição é a `0122`, e `rel_saldo_colaborador` é função. |
| D4 | A regra é **função**, não view, porque a 7c recusa view que lê `empresa_id`. A exceção é nominal, em `k_leitura_tenant`, como as `rel_*` da F66. |
| D5 | A montagem dos reservados ficou pura. |
| D6 | O total do card é o KPI por construção. |
| D7 | Cinco mutações, teto 156. |
| D8 | B2 medido pela leitura do app. |
| D9 | A semântica de "Em uso" e "Sem uso". |
| D10 | A leitura do uso degrada, não derruba. |

Também: a L4 e o censo de tipos com o objeto novo, a prévia sem o dublê de diálogo e o vermelho primeiro.

## 5. As evidências (saída real)

### 5.1 Linha de base (antes de tocar o código)

```
$ npm run test
 Test Files  259 passed (259)
      Tests  8036 passed (8036)
   Duration  211.28s
```

### 5.2 v1.71.1 — a mesa

```
$ npm run lint
> eslint
(exit 0, nenhum aviso — os dois avisos da primeira rodada, `_c` sem uso, foram corrigidos)

$ npx tsc --noEmit
tsc exit: 0

$ npm run test
 Test Files  261 passed (261)
      Tests  8061 passed (8061)
   Duration  170.58s

$ npm run build
 ✓ Compiled successfully   (… ƒ /relatorios/[filial] · ƒ /relatorios/gerados/[id] …)

$ npm run verificar:actions
[gate] chunks com Server Actions varridos: 24
[gate] VERDE — nenhum identificador registrado sem binding.

$ npm run contraste
(exit 0 — as linhas ❌ são os "antes" registrados de propósito no próprio script)

$ npx tsx --env-file=.env.local scripts/formas/varrer-evidencias.mts docs/v1.71.1-evidencias
[varrer] 92 arquivo(s), 0 com ocorrência · 9 termo(s) de filial comparados, 0 curto(s) fora
```

### 5.3 v1.71.1 — o CI do PR #86 (run 39291360774), o merge e a produção

```
verificar         pass  3m40s
banco-sem-docker  pass  3m07s
 Test Files  261 passed (261)
      Tests  8061 passed (8061)
VERDE: o database.ts conhece tudo o que o banco tem.
  52 roteiro(s), 1123 asserções no total
Lote inteiro detectado pelo cenário nomeado.

merge: 408cbea6656781028ceec9fef297fdcdd28c667c · 2026-10-19T17:11:11Z
tag:   v1.71.1 (anotada, no commit do merge, publicada)

$ curl -s https://ti-wap-inventory-control.vercel.app/api/saude
17:11:33 {"ok":true,"versao":"1.71.0","commit":"47344c9","banco":"ok","ms":641}
17:11:54 {"ok":true,"versao":"1.71.1","commit":"408cbea","banco":"ok","ms":224}

$ SMOKE_VERSAO_ESPERADA=1.71.1 node scripts/smoke/smoke-prod.mjs
  [AVISO] kits_modelos · anon NÃO lê (RLS) — anon leu 0 linhas, mas não há kit cadastrado — RLS não comprovada
RESUMO · 109 OK · 1 aviso · 0 n/a · 0 falha
(exit 0; o aviso é o antigo, o mesmo da F66; saída completa em docs/v1.71.1-evidencias/pos-deploy/smoke-prod.txt)
```

A revisão adversarial da Frente A (três lentes: dados e compatibilidade, tela e impressão, escopo e documentos, com
um cético por achado) deu **0 achado**. Um revisor simulou a paginação no Chromium em 154 alturas: 0 cabeçalho de grupo
separado da primeira linha, contra 35 no controle sem a classe.

### 5.4 v1.71.2 — a mesa

```
$ npm run lint            → exit 0
$ npx tsc --noEmit        → exit 0
$ npm run test
 Test Files  264 passed (264)
      Tests  8102 passed (8102)
   Duration  133.98s
$ npm run build           → ✓ Compiled successfully in 5.9s (… ƒ /admin/colaboradores …)
$ npm run verificar:actions
[gate] chunks com Server Actions varridos: 39
[gate] VERDE — nenhum identificador registrado sem binding.
$ npm run contraste       → exit 0
$ npx tsx --env-file=.env.local scripts/formas/varrer-evidencias.mts docs/v1.71.2-evidencias
[varrer] 56 arquivo(s), 0 com ocorrência · 9 termo(s) de filial comparados, 0 curto(s) fora
```

A mesa de Postgres é o PGlite 0.3.16 (PG 17 em WASM), fora do projeto, no scratchpad, no molde da F65. Ela aplica a
cadeia inteira em 11 s.

```
cadeia até a 0179 (hoje):
✓ colaborador_estorno.sql — FIM colaborador_estorno: 19 asserções, 0 falhas
✗ colaborador_uso_efetivo.sql — (sem FIM)
    WARNING: ✗ u0 a função public.colaboradores_uso_efetivo() não existe — a regra do uso efetivo não está no banco
com a 0180:
✓ colaborador_estorno.sql — FIM colaborador_estorno: 19 asserções, 0 falhas
✓ colaborador_uso_efetivo.sql — FIM colaborador_uso_efetivo: 11 asserções, 0 falhas
antes da exceção nominal (a prova de que ela é necessária):
✗ empresa_no_acervo.sql — 7b … lê: colaboradores_uso_efetivo
✗ catalogo_policies.sql — 15h … lê: colaboradores_uso_efetivo
a L4 com a 0180 e a exclusão pelo nome (a constante do CI não muda):
(medição) L4: … 54002b619d8aef1dfa32d6da8fb235cf (100 funções)   ← cadeia até a 0179
(medição) L4: … 54002b619d8aef1dfa32d6da8fb235cf (100 funções)   ← com a 0180
as cinco mutações:
✓ detectada  v1712-uso-conta-a-movimentacao-estornada  derrubou u1
✓ detectada  v1712-uso-conta-o-item-estornado          derrubou u5
✓ detectada  v1712-uso-esquece-o-historico-em-texto    derrubou u4
✓ detectada  v1712-uso-casa-a-chave-de-outra-empresa   derrubou u8
✓ detectada  v1712-uso-esquece-o-detentor              derrubou u6
```

### 5.5 v1.71.2 — o CI do PR #88

**Vermelho de propósito** (run 39292478389, só os roteiros), com o trecho em
`docs/v1.71.2-evidencias/B-roteiro-vermelho-ci.txt` no PR #88:

```
  ✓ colaborador_estorno — 19 asserções
  ✗ colaborador_uso_efetivo — não emitiu a linha 'FIM colaborador_uso_efetivo: N asserções, M falhas' — abortou antes do fim
  ✗ colaborador_uso_efetivo — marcou 1 ✗ (cenário falhou)
  54 roteiro(s), 1142 asserções no total
```

**Verde no commit final `e5112f2`** (run 39299994772):

```
verificar         pass  3m52s
banco-sem-docker  pass  2m38s
VERDE: o database.ts conhece tudo o que o banco tem.
  ✓ colaborador_estorno — 19 asserções
  ✓ colaborador_uso_efetivo — 11 asserções
  54 roteiro(s), 1153 asserções no total
controle verde: 26 roteiro(s), nenhum ✗.
v1712-uso-conta-a-movimentacao-estornada   colaborador_uso_efetivo.sql  u1  detectada
v1712-uso-conta-o-item-estornado           colaborador_uso_efetivo.sql  u5  detectada
v1712-uso-esquece-o-historico-em-texto     colaborador_uso_efetivo.sql  u4  detectada
v1712-uso-casa-a-chave-de-outra-empresa    colaborador_uso_efetivo.sql  u8  detectada
v1712-uso-esquece-o-detentor               colaborador_uso_efetivo.sql  u6  detectada
Lote inteiro detectado pelo cenário nomeado.
 Test Files  264 passed (264)
      Tests  8103 passed (8103)
[gate] VERDE — nenhum identificador registrado sem binding.
```

A revisão adversarial da Frente B teve três lentes: a regra no banco, as travas e o processo, e o app, o escopo e a
evidência. Cada achado passou por um cético. O resultado:
- **1 achado confirmado e corrigido:** o filtro "Uso" ficava preso depois de um refresh.
- **7 refutados.** Três deles eram baratos e foram feitos assim mesmo: o ponteiro do rodapé da `0180`, a ordem do
  `CLAUDE.md` da área, e dois casos a mais no roteiro (u11 e o u6 em outra grafia). A renomeação do cadastro ficou
  registrada como comportamento herdado da `0112`.
- **A re-revisão das correções deu 0 achado.** O detalhe está na ata, item 11.

### 5.6 v1.71.2 — o que NÃO tem saída, e por quê

Não há `/api/saude` em `1.71.2`, smoke da v1.71.2, contagem B2 "depois", advisors nem tipos de produção. Todos
dependem do apply da `0180`, que ficou no caminho B (§0) porque o conector da Supabase da run não alcançava os projetos
da WAP.

## 6. Pendências e backlog

**Pendente desta ordem**
- O caminho B (§0): o apply da `0180` nos dois bancos, o merge do PR #88, a tag `v1.71.2`, o deploy, o smoke, o A8
  "depois" e os tipos de produção no lugar do hand-fix.

**Backlog (regra 1, fora do escopo)**
- **O cadastro só nasce ao salvar.** Mover o `criarColaboradorInline` do clique para o INSERT da movimentação
  eliminaria o cadastro órfão na origem.
- **Desativar em lote os "Sem uso"**: uma ação de administrador sobre o filtro, com confirmação.
- **O card "Reservados" mostra para quem está reservado** (o colaborador/setor da reserva).
- **O termo de movimentação estornada sem marca**: sinalizar na ficha que o termo é de uma movimentação desfeita.
- **`v_colaboradores_textos` sem empresa** (N3 do plano): o join com `colaboradores` só pela chave. Hoje é inerte e
  fica para a F67/F70.
- **O texto copiado do relatório com a contagem por categoria** dos reservados (suposição 5 da ordem).
