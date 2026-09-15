# PLAN-F58 — A fronteira tipada do banco

**Fase F58** do `PLANO-MULTIEMPRESA.md` (§5, Bloco D) · branch `f58-fronteira-tipada-do-banco` · versão-alvo **`1.63.0`** ·
**sem migration** · plano medido em 15/09/2026, antes do primeiro commit que toca `src/`.

> O objetivo cabe numa frase: *uma coluna ausente do `select` (`empresa_id`, amanhã) tem de ser erro de compilação, e não
> `undefined` silencioso.* Três peças: a **porta única de RPC** (`src/lib/supabase/rpc.ts`), a **porta da leitura**
> (`src/lib/supabase/linhas.ts`, com a forma conferida por Zod e AMARRADA ao tipo que o `select` infere) e o **`erros.ts`
> enumerável**, conferido contra o SQL vivo. Duas decisões do Johnny estendem a ficha: **(i) forma errada LANÇA** e **(ii) a
> prova é contra PRODUÇÃO, só leitura, antes do merge**.

---

## 1. Estado de partida — remedido

A régua é a do prompt: a medição ganha da frase escrita, e a divergência vai para o relatório. Medido por dez leitores de
exploração em paralelo (relatórios em `scratchpad/`, só números aqui) e conferido à mão onde decidia desenho.

| Fato | O cabeçalho da ordem diz | Medido | Nota |
|---|---|---|---|
| 1 | `1.62.0`, última migration `0140`, 201 arquivos / 5.104 testes | **igual** — suíte de base 201/5.104 verde em 4m56s | build de base `8d6bd18` exit 0 |
| 2 | 37 `.rpc(` em `src/**` fora de teste, 18 arquivos, 1 dinâmica | **igual** — `actions/` 22, `queries/` 13, `auth/` 2; nenhuma em `app/`/`components/` | a dinâmica só alcança `resetar_acervo` e `resetar_itens` |
| 3 | 17 em `scripts/**` (10 em seis `.ts`, 7 em dois `.mjs`); 13 em teste | **igual**; os 13 de teste são **roteiro sobre o texto da fonte** (9) e **fixture do detector** (4) — nenhum dublê de client | |
| 4 | 10 `rel_*`; builder por `Promise.all` e `.order().range()` | **igual** | nenhuma chamada encadeia `.single()` |
| 5 | `filialParaRpc` com 8 chamadores em `src/**` + 1 em script | **igual**; o `database.ts` **não tem** hand-fix de nulabilidade nas sete `rel_*` (o cabeçalho de `diff-tipos.mjs` promete um que não existe) | |
| 6 | 3 mentiras de argumento fora de `Json` | **igual**; nuance: `p_backup_path` é **opcional** no gerador (`default null`), `p_filial` do reset é **obrigatório e não-anulável** | |
| 7 | 15 `as unknown as Json`, 12 em RPC, 3 em tabela | **igual** | |
| 8 | mentiras de retorno: `rel_estoque_asof.colaborador/setor`, `papel_atual`, `rotulo_de_ambiente` | **mais quatro**: `rel_estoque_asof.marca/modelo`, `devolver_ao_fornecedor.substituto_id/substituto_mov_id` (NULL no caminho NORMAL de "devolver sem troca"), `ultima_migracao_aplicada` | ver §2 |
| 9 | 22 `as unknown as` de leitura; 14 de builder | **igual** (queries 19 + actions 3; builder: `dev-destrutivo` 7, `recorte-consulta` 5, `ativos` 2) | |
| 10 | ~52 simples; ~74 nas duas pastas; ~84 com limítrofes e de fora | **102 pontos**: `queries/` 65 (19 + 46), `actions/` 32, fora das duas pastas **5** (não 2: `auth/acesso.ts:117,197`, `app/(app)/dev/acoes-export.ts:139`, `app/(app)/page.tsx:173`, `ativos/identidade.ts:175`) | a contagem OFICIAL é a da trava `sem-cast-de-leitura.test.ts` |
| 11 | 9 `select` concatenados; 18 leituras de view | **igual**; e mais: `select` passado por **identificador** (`RESUMO_SELECT`, `EXPORT_SELECT`) já infere — o que quebra é o `+` e o parâmetro `: string` de `listaSelect` | `paginarTodos` apaga o tipo com `data: unknown` → `(data ?? []) as Row[]` e ~33 chamadas o herdam |
| 12 | 16 `select('*')` que devolvem linha | **igual** — 15 são backup JSON, 1 é a ficha do ativo | |
| 13 | `erros.ts`: 70 `if`, 132 substrings, 10 nomes, 8 do motor, `toLowerCase` na 21 | **igual**; `traduzErroBanco`: **84** chamadas em 17 arquivos (não 85) | 46 grafias de reserva nunca existiram viva (§6) |
| 14 | 5 casamentos por texto fora do `erros.ts` | **14 pontos em 7 arquivos** — mais 9 em `admin.ts` (convite e `traduzErroDeGestao`), `colaboradores.ts`, `dev.ts`, `kits.ts`, `tipos-item.ts`, com **6 nomes de constraint novos** e **3 regex sobre mensagem do Supabase Auth** | |
| 16 | `DbClient` declarado duas vezes | **igual** (backlog) | |
| 17 | `medir.mjs` mede produção sem `PERF_URL_APP` | **igual**; e ele carrega o `.env.local` sozinho — o invólucro `medir-local.mjs` esvazia `SMOKE_*` no processo filho | |
| 19 | `validar-truncamento.ts` como precedente de script que importa `server-only` | **o precedente está quebrado desde a F49**: rodado como o próprio cabeçalho manda (`npx tsx …`, sem `NODE_OPTIONS=--conditions=react-server`), lança no import; `gerar-errata-truncamento.ts` tem o mesmo defeito | a porta nasce SEM `server-only` por isso |
| — | personas do ensaio | a senha do seed só vale hoje para `seed.consulta@wap.ind.br`; `seed.dev`, `seed.admin` e `seed.operador.matriz` recusam (`invalid_credentials`) | a medição e o censo do ensaio usam `seed.consulta` |

---

## 2. O mapa das mentiras — lido do SQL vivo e confirmado por contagem

### 2.1 Argumentos que o app passa NULL de propósito (`ARGUMENTOS_ANULAVEIS`, em `rpc.ts`)

| Função | Parâmetro | Motivo | Evidência no corpo vivo |
|---|---|---|---|
| as sete `rel_*` (`estoque_asof`, `saldo_itens`, `mov_itens`, `frescor_itens`, `mov_por_mes`, `por_motivo`, `resumo`) | `p_filial` | consolidado | `p_filial is null or` — **uma constante só (`RECORTE_DO_RELATORIO`), a linha que a F60 troca** |
| `previa_reset`, `resetar_acervo`, `resetar_itens` | `p_filial` | alcance GLOBAL da Zona destrutiva | `p_filial is null or` |
| `apagar_ativos_conflito_filiais` | `p_backup_path` | "sem arquivo" até 25 ativos | `coalesce(p_backup_path, '')` |

Nenhuma é `strict`. **O caso que a trava tem de recusar**, e que vira a sabotagem B: `resetar_acervo.p_contagens` também tem
`p_contagens is null or …` — mas dentro de `if … then raise`. É recusa, não domínio.

### 2.2 Retornos que saem NULL e o gerador diz que não (`COLUNAS_DE_RETORNO_ANULAVEIS` e `ESCALARES_ANULAVEIS`)

| Função | Coluna/escalar | Evidência | Censo de produção (15/09) |
|---|---|---|---|
| `rel_estoque_asof` | `colaborador`, `setor` | `when not public.status_tem_detentor(…) then null` | hoje: colaborador **1.472** nulos, setor **1.445** de 1.611 linhas; 180 dias atrás: 958 e 959 de 959 |
| `rel_estoque_asof` | `marca`, `modelo` | `a.marca`, `a.modelo` (colunas anuláveis de `ativos`) | modelo 11 nulos (marca 0 em produção, 4 no ensaio) |
| `devolver_ao_fornecedor` | `substituto_id`, `substituto_mov_id` | só atribuídas dentro de `if p_substituto is not null …` | RPC que ESCREVE — provada pelo SQL, nunca chamada |
| `papel_atual` | escalar | `and p.ativo and p.excluido_em is null` (zero linhas → NULL) | — |
| `ultima_migracao_aplicada` | escalar | `when undefined_table then return null` | — |
| `rotulo_de_ambiente` | escalar | `… limit 1` sobre `public.ambiente` (produção não tem linha) | — |

`criar_compra_lote.patrimonio` **não entra**: a action sempre manda o patrimônio (schema Zod exige), e `item->>'patrimonio'` só
seria NULL com payload fora do contrato.

### 2.3 Colunas de view que o gerador diz anuláveis e o SQL garante não-nulas (`COLUNAS_DE_VIEW_NAO_NULAS`)

Só entram as que alguma leitura migrada ESTREITA — cada uma com o trecho da definição viva (`colunas-de-view-sql.test.ts`) e
0 nulos no censo de produção. Candidatas medidas: `v_estoque_atual.filial/total` (join interno e `count(*)`),
`v_colaboradores_consolidacao.*` (`count(*)`, `coalesce(sum…, 0)`, `is not null`), `v_colaboradores_textos` (tudo menos
`colaborador_id`), `v_conflitos_filiais_grupos.chave/rotulo`, e em `v_fila_pendencias`/`v_pendencias_item` o `id`, `ordem`,
`categoria`, `filial`, `filial_nome` e `status`. Duas exigem prova SEMÂNTICA, não sintática, e **não** entram no mapa:
`v_fila_pendencias.pendencia` (o `else null` é morto pela correlação `where`↔`case`) e `desde` (o `left join` é garantido
pela FK not null + imutabilidade do acervo). Continuam anuláveis no tipo.

### 2.4 O censo (decisão ii) — só números

`scripts/formas/censo.mjs`, só leitura, identidade do alvo conferida antes do primeiro `select`. Evidência:
`docs/f58-evidencias/censo-{ensaio,producao}.json`.

| | Ensaio | Produção |
|---|---:|---:|
| relações lidas por `src/**` | 29 | 29 |
| linhas somadas | 6.000 | 7.032 (+16 de `anotacoes`, recontada após falha transitória) |
| maiores: `movimentacoes` · `ativos` · `v_colaboradores_textos` | 3.245 · 1.606 · 780 | **3.553 · 1.620 · 918** |
| `v_conflitos_filiais` · grupos | 0 · 0 | **138 · 68** |
| `relatorios_gerados` | 1 | **13** (7 consolidados) |
| `lancamentos_item` · `termos_gerados` · `eventos_admin` | 35 · 2 · 0 | 142 · 106 · 100 |
| `statement_timeout` | nenhum | nenhum (as views pesadas responderam) |

**Onde o seed NÃO representa produção** (e por isso a prova é a de produção): o ensaio tem **zero** conflitos entre filiais,
**zero** colaboradores cadastrados, **zero** eventos administrativos e **um** snapshot gerado — as quatro superfícies onde a
forma real mais pode surpreender. `ativos.patrimonio` tem 31 nulos em produção e 0 no ensaio.

---

## 3. As assinaturas

### 3.1 A porta (`src/lib/supabase/rpc.ts`, SEM `server-only`)

```ts
chamarRpc<N extends NomeRpc>(client: SupabaseClient<Database>, nome: N, ...resto: [] | [ArgumentosDaPorta<N>])
  // → o BUILDER: client.rpc(nome, args).returns<ResultadoDaPorta<N>>()
```

- `ArgumentosDaPorta<N>`: os `Args` gerados, com `| null` SÓ nos parâmetros do mapa e `Json` → `JsonSerializavel`.
- `ResultadoDaPorta<N>`: os `Returns` gerados, com `| null` SÓ nas colunas/escalares dos mapas.
- `.returns<>()` é o **depreciado, de propósito**: é o único que preserva `.order()/.range()`; o `.overrideTypes()` recomendado
  devolve builder terminal (medido em `postgrest-js` 2.112.4, `index.d.mts:852/951/1735`).
- A chamada dinâmica: `chamarRpc(supabase, bloco === 'acervo' ? 'resetar_acervo' : 'resetar_itens', {…})` — `N` vira a união
  fechada das duas.
- **`src/lib/supabase/json.ts`**: `JsonSerializavel` + `paraJson(valor): Json` para as 3 escritas de tabela.

### 3.2 A amarração (`src/lib/supabase/forma.ts`, puro) e a porta da leitura (`linhas.ts`)

```ts
linhasDe<L extends object, F extends FormaDeLinha>(dados: readonly L[] | null, forma: F & ConfereLinha<L, F>, rotulo): LinhaConferida<L, F>[]
linhaDe (dado: L | null, …)                                        → LinhaConferida<L, F> | null
valorDe<V, Z>(dado: V, forma: Z & ConfereValor<V, Z>, rotulo)      → z.output<Z>   // jsonb de RPC, escalar
linhasOuFalha / linhaOuFalha / valorOuFalha                         → { ok: true, … } | { ok: false, erro: ErroDeForma }
```

`ConfereLinha<L, F>` é `unknown` quando a forma serve e uma `Recusa<'motivo'>` quando não — o compilador mostra o motivo:
- chave da forma fora do `select` → recusa (o `empresa_id` da F63);
- forma ESTRITA sem uma coluna que o `select` traz → recusa;
- tipo de coluna diferente do inferido (atribuível nos DOIS sentidos) → recusa;
- permitido mudar o tipo só em dois lugares: coluna `Json` → forma JSON (inclusive frouxa), e coluna de view com a marca
  `naoNulaNaView(view, coluna, schema)`, que só existe para entradas de `COLUNAS_DE_VIEW_NAO_NULAS`;
- `select` não literal (`GenericStringError`) → recusa com "junte o texto num literal só".

`$strict` e `$strip` são **o mesmo tipo** no Zod 4 (`{ out: {}; in: {} }`, medido) — por isso `z.object` padrão é recusado em
RUNTIME (`modoDaForma`: sem `catchall` → lança erro de programação) e por AST nos módulos de forma.

Prova em compilação: `src/lib/supabase/linhas-tipos.test.ts`, 19 casos, 11 com `@ts-expect-error`; o controle positivo (a
cópia sem as diretivas) está em `docs/f58-evidencias/C-controle-positivo-amarracao.txt`.

### 3.3 O erro de forma

`ErroDeForma extends Error` · `code = 'F58_FORMA'` · `rotulo` · `problemas: { caminho, codigo, chaves? }[]` (até 5 distintos) ·
`recusadas` · `lidas`. Mensagem: *Forma inesperada em "‹rótulo›": N de M linha(s) recusada(s) — ‹caminho› (‹código›)*.
Caminho normalizado andando pelo schema: chave declarada → nome; chave de `z.record` ou não declarada → `<chave>`; índice → `[]`;
`unrecognized_keys` → só a CONTAGEM. A mensagem padrão da issue do Zod nunca é usada; `reportInput` nunca é ligado.
`registrarFalha({ escopo: 'leitura.‹rótulo›', erro, ctx: { lidas, recusadas, problemas } })` — uma vez, dentro da porta.

---

## 4. O modo por categoria (provisório até o benchmark de lote)

| Categoria | Modo | Por quê |
|---|---|---|
| tabela com `select` literal, leitura pequena | **estrito** | a forma inteira; coluna nova no `select` sem schema não compila |
| `select` concatenado (fato 11) | vira literal, depois estrito | a inferência volta |
| view | estrito; `null` só sai com a marca | o gerador diz anulável; o SQL e o censo decidem |
| retorno de RPC `returns table` | estrito, sobre o tipo JÁ alargado pela porta | a mentira se corrige uma vez, na porta |
| retorno `jsonb` de RPC que escreve | estrito com variantes (união) onde o corpo tem mais de um `return` | provado pelo SQL, nunca chamado |
| coluna `jsonb` (snapshot de `gerados.ts`) | **frouxo**, aceitando `SnapshotRelatorio | SnapshotRelatorioV2` | a forma antiga TEM de passar |
| `select('*')` de backup/export | **frouxo OBRIGATÓRIO** | coluna que o schema não conhece tem de chegar ao backup |
| leitura de LOTE com colunas explícitas | **decide o benchmark** (Frente F, antes do lote 2) | critério de custo da ficha |

Onde moram: `src/lib/queries/formas/‹área›.ts` — **com** `import 'server-only'` (a catraca da F49 continua valendo: select e nome
de coluna não vão para o bundle do cliente). Cada leitura é um descritor `{ rotulo, origem | rpc, select, forma, ordem }`; a
query e a action importam o descritor e o conferidor importa O MESMO. Quando a leitura é de ação `'use server'`, o descritor mora
em `formas/` (módulo `'use server'` só pode exportar função assíncrona).

---

## 5. As frentes, em ordem, e o tamanho de cada lote

| Frente | O que entra | Pontos |
|---|---|---:|
| **A** | mapa + censo (feito: `d5b1054`, `defcab2`) + linha de base de TTFB (feita: 16 rotas, `8d6bd18`) + este plano | — |
| **B** | `rpc.ts`, `json.ts`, as 37 chamadas de `src/**` + `validar-truncamento.ts`; `rpc-filial.ts` apagado; `rpc-unica-porta.test.ts`; `rpc-mapas-sql.test.ts`; as travas de texto de `admin.test.ts`/`dev.test.ts`/`importar.test.ts`/`fronteira-viewer.test.ts` passam a ler `chamarRpc(…, 'nome'` provando O MESMO (sessão, não service role; ordem) | 38 chamadas · 15 `as unknown as Json` · 4 mentiras de argumento |
| **C · lote 1** | `queries/tipos-item.ts` e `queries/relatorios/**` (inclui `paginarTodos` inferindo a linha do builder) | 5 casts + ~20 chamadores de `paginarTodos` + 2 selects concatenados |
| **F · benchmark** | `scripts/perf/bench-formas.mts`, linhas fictícias no volume do censo | — |
| **C · lote 2** | o resto de `queries/` (menos `gerados.ts`) | 57 casts (+7 de builder em `dev-destrutivo`) |
| **C · lote 3** | `actions/` e os de fora | 37 casts |
| **C · lote 4** | `queries/gerados.ts` — por ÚLTIMO | 3 casts (o snapshot) |
| **D** | listas nomeadas, os 14 casamentos de fora, teste contra o SQL vivo, trava por forma, runbook do enum | 70 ramos · 132 substrings · 18 nomes |
| **E** | `scripts/formas/conferir.mts` — ensaio, produção cedo, produção no SHA congelado | todos os descritores |
| **F · final** | benchmark no SHA congelado; A/B de TTFB intercalado contra o ensaio; `medir.mjs` de produção antes/depois | — |
| **G** | versão, revisão adversarial, SHA congelado, rodadas finais, docs, PR, deploy, PR de documentação, tag | — |

Entre cada lote: `lint`, `test` (arquivos tocados) e `tsc` verdes, commit próprio. Suíte inteira antes de cada push.

---

## 6. O `erros.ts` enumerável (Frente D)

- **`src/lib/erros-banco/listas.ts`** (puro): `CONSTRAINTS_TRADUZIDAS` (**18** nomes: os 10 do `erros.ts` com o NOME REAL —
  `lanc_item_estorna_uidx`, `ativos_patrimonio_service_tag_uidx` eram prefixos —, `filiais_slug_key`,
  `relatorios_gerados_periodo_filial_versao_uidx`, e os 6 achados fora: `colaboradores_nome_chave_uidx`,
  `colaboradores_nome_nao_vazio`, `kits_modelos_nome_uidx`, `tipos_item_slug_key`, `tipos_item_slug_formato`,
  `tipos_item_rotulo_nao_vazio`); `MSG_SQL` (um ramo → suas grafias); `FRASES_DO_MOTOR` (8, isentas por nome);
  `FRASES_DO_AUTH` (as 3 regex do Supabase Auth, isentas por nome — não são SQL).
- **O teste contra o SQL vivo** (`listas-sql.test.ts`): cada ramo de `MSG_SQL` tem ao menos UMA grafia no corpo vivo (sem
  comentário) de alguma função; cada nome de constraint/índice existe no esquema vivo por uma réplica em ordem de
  `create table` (nome explícito e implícito `<tabela>_<coluna>_key`), `add constraint`, `create [unique] index`, `drop` e
  `rename` (medido: nenhum `rename` nas 139 migrations). Um texto que só vive em migration histórica reprova.
- **A trava por forma** (`casamento-por-texto.test.ts`, AST): `.includes/.match/.test/.indexOf/.startsWith` com literal sobre
  valor derivado de mensagem de erro, fora de `listas.ts`/`erros.ts`, reprova.
- **Traduções mortas medidas**: nenhum ramo inteiro morto; **4 grafias só-históricas** (`última movimentação efetiva`,
  `saldo insuficiente`, `saldo negativo`, `liberação maior`), **1 só-comentário** (`reserva aberta`), **42 grafias-reserva que
  nunca existiram** (a metade com/sem acento de cada par) e **1 falso-vivo por prefixo** (`so a ultima movimentacao`, que casa
  a mensagem de ESTORNO e é interceptado antes pelo ramo certo). Decisão de cada uma no relatório.
- **A lição do enum** vai para `RUNBOOK-BANCO.md` › Armadilhas conhecidas: `0044/0045`, `0046/0047`, `0108/0109`, e o atalho
  `tipo::text = 'valor'` da `0027`. Nenhum enum convertido.

---

## 7. O conferidor e a medição (Frentes E e F)

**Conferidor** — `scripts/formas/conferir.mts`, rodado com
`NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/formas/conferir.mts --alvo=ensaio|producao`.
- Importa o CATÁLOGO de descritores de `src/lib/queries/formas/` (sem cópia) e a conferência pura de `forma.ts`.
- Identidade antes da primeira leitura: ensaio = ref de `NEXT_PUBLIC_*` igual a `SEED_PROJECT_REF`; produção = ref de `SMOKE_*`
  diferente dele e dentro de `REFS_DE_PRODUCAO_CONHECIDOS`. Alvo ambíguo recusa.
- Só leitura: `select`/`head` e as RPCs de uma lista de CHAMÁVEIS calculada do corpo vivo (`stable`/`immutable`, sem
  insert/update/delete), conferida antes de cada chamada. RPC que escreve nunca é chamada; a forma do retorno dela se prova em
  `rpc-retorno-sql.test.ts` (chaves de `jsonb_build_object` e colunas de `returns table`, todas as variantes).
- Cobertura: cada descritor sobre a relação inteira, paginada por ordem total, com `lidas = count exato` da mesma consulta;
  TODOS os snapshots de `relatorios_gerados`; as `rel_*` em matriz — consolidado e cada filial ativa × semana corrente, período
  inteiro desde o dado mais antigo e uma janela intermediária —, cada célula rotulada por NÚMERO DE ORDEM;
  `rel_saldo_colaborador` sobre uma amostra de pessoas.
- Saída: por ponto, lidas · aceitas · recusadas · erros de leitura, e para cada recusa o caminho normalizado e o código. Nenhum
  valor, id, slug, e-mail ou patrimônio. Gate: 0 recusa, 0 erro, lidas = count.

**Benchmark de lote** — `scripts/perf/bench-formas.mts`: linhas FICTÍCIAS geradas no volume do censo de produção (ativos 1.620,
movimentações 3.553, lançamentos 142, snapshots 13, e 10× o total como folga), parse estrito × frouxo × sem parse, mediana de 21
rodadas. Roda antes do lote 2 e de novo no SHA congelado.

**A/B de TTFB** — dois `next start` (a `main` numa worktree temporária, variáveis injetadas no processo por
`node --env-file=<repo>/.env.local`, nunca arquivo copiado; a branch no diretório principal), contra o ENSAIO, intercalados
pelo `medir-local.mjs`, `/vercel.svg` e `/ajuda` de controle, leitura normalizada pelo controle. Seguro: se a worktree ou a
injeção forem barradas, sequencial contra a linha de base de `8d6bd18`. **Produção**: `medir.mjs` antes do merge e depois do
deploy, registro.

---

## 8. As nove decisões

1. **A porta** — `src/lib/supabase/rpc.ts`, SEM `server-only` (é tipo mais uma linha, sem nome de coluna, e o precedente de
   script que importa `server-only` está quebrado); `chamarRpc(client, nome, ...args)` devolve o builder via `.returns<>()`; a
   dinâmica é união fechada; `scripts/**` ganha isenção nominal (catraca que só encolhe) para os 6 `.ts` que usam client SEM
   `Database` de propósito (`seed`, `reset`, `env-guard`, `fixtures-passe2`, `checagens`) e para os `.mjs`
   (`smoke-prod`, `medir-guarda`, `censo`) — `validar-truncamento.ts` migra; os 13 `.rpc(` de teste NÃO são olhados pela trava
   (roteiro sobre texto e fixture), e os roteiros passam a ler a forma nova.
2. **O mapa das mentiras** — três mapas nominais `as const` (argumentos, colunas de retorno + escalares, colunas de view), cada
   entrada `{ motivo, evidencia }`; a trava SQL confere a evidência no corpo/definição VIVA, e para argumento exige forma de
   domínio (`p is null or`, `or p is null`, `coalesce(p,`) fora de comando com `raise`, e função não `strict`.
3. **O `Json` tipado** — `JsonSerializavel` na porta (os 12 de RPC) e `paraJson()` para as 3 escritas de tabela; zero
   `as unknown as Json`.
4. **A amarração** — F-bound por intersecção `F & ConfereLinha<L, F>` com `Recusa<'motivo'>` legível; onde a inferência não
   alcança (select não literal) a própria amarração recusa, e o conserto é tornar o select literal.
5. **O modo por categoria** — §4, provisório até o benchmark; descritores em `src/lib/queries/formas/` com `server-only`.
6. **O erro de forma** — §3.3; as variantes `…OuFalha` põem a falha de forma no caminho de falha que a leitura já tem; nenhum
   `catch` novo; `lerPapel` usa `valorOuFalha` e continua devolvendo `{ ok: false }` para "não deu para saber".
7. **Os casts de builder** — os 5 de `recorte-consulta.ts` e os 2 de `ativos.ts` FICAM, nomeados na trava (apagam o tipo do
   BUILDER para aplicar o mesmo filtro a selects diferentes, decisão da F57); os 7 de `dev-destrutivo.ts` SAEM (apagam o tipo
   da LINHA do backup — são leitura disfarçada).
8. **As listas de erro** — §6; réplica das migrations para nomes; traduções mortas decididas uma a uma no relatório.
9. **O conferidor e a medição** — §7.

---

## 9. Reversão

Fase só de código. `git revert` dos commits **de trás para frente** — fechamento → E/F → D → lote 4 → lote 3 → lote 2 → lote 1
→ B → A — e o redeploy automático. Os lotes existem para a reversão poder parar no meio com `tsc` verde. Nenhum dado, nenhuma
migration, nenhuma sessão a desfazer.

## 10. SHA de código congelado

*(preenchido na Frente G, passo 3)*
