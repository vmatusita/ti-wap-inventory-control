# Relatório da F47 — O injetor de mutações e o gate de deriva

**v1.52.0 · 06/09/2026 · PR [#27](https://github.com/vmatusita/ti-wap-inventory-control/pull/27) · branch `f47-injetor-mutacoes`**

Terceira fase do `docs/PLANO-MULTIEMPRESA.md` (§5, Bloco A), depois da F45 (o runner único e a ferramenta que recusa universo vazio) e da F46 (a trava de hash e o CI de banco sem Docker). Ela resolvia duas coisas que o repositório afirmava e não sabia:

- **que os roteiros SQL sabem ficar vermelhos.** Eram 25 roteiros e 577 asserções, e nenhuma prova de que alguma delas soubesse acusar. Sem isso, a fase seguinte escreveria quatro catálogos de segurança novos sem saber se catálogo consegue reprovar — quatro documentos com sensação de rede.
- **que o `src/lib/types/database.ts` acompanha o banco.** Uma migration podia acrescentar coluna e ninguém era obrigado a rodar `npm run db:types`. Já aconteceu: a ata da F41 registra que *"o `database.ts` commitado simplesmente estava velho, porque nenhuma fase regenerava desde a F38"*.

**Sem dependência nova, sem Docker, sem tocar na branch protection, e sem converter uma única asserção existente** — converter muda a FORÇA da asserção e é matéria da fase seguinte, por escrito.

---

## 1. O resultado, em números

| | Antes | Depois |
|---|---|---|
| Roteiros SQL com prova de que sabem reprovar | **0 de 25** | 6 de 25, por **28 quebras deliberadas** |
| Quebras reais que o rig não sabe acusar | desconhecidas | **5, declaradas**, cada uma nomeando a fase que a adota |
| Deriva do `database.ts` | invisível até alguém reparar | reprovada a cada CI, **nomeando o objeto** |
| Tabelas em `public` no banco do CI | 20 | 21 (a `_bkp_` órfã entrou no versionamento) |
| Isenção por prefixo em `seguranca_catalogo.sql` | `and left(relname,1) <> '_'` | **removida** |
| Asserções de mesa (Vitest) que rodam **sem banco** | 3 667 | 3 870 (**+203**) |
| Job `banco-sem-docker` | 62s | 86s |
| Relógio do CI (o job `verificar`, em paralelo) | 280s | **280s — não se mexeu** |
| Migrations | 127 | 128 |

---

## 2. O diagnóstico do prompt, conferido item a item

Nenhum ponto foi aceito por estar escrito. Cada linha traz o comando que o confirmou ou o derrubou.

| # | O prompt afirma | Como conferi | Resultado |
|---|---|---|---|
| 1 | A mesa não tem Postgres nem Docker | `winget list --name PostgreSQL` → *"No installed package found"*; idem para Docker; `C:\Program Files\PostgreSQL` não existe; `C:\Program Files\Docker` existe e está **vazio**; `which psql` → nada | ✅ confirmado |
| 2 | `_bkp_relatorios_gerados_f6a` só existe em produção | `grep -rn "_bkp_relatorios" supabase/migrations/` → **só comentários** na 0039 e na 0058; `database.ts:17` a lista | ✅ confirmado |
| 3 | O `--local` do gate de tipos está morto | o job `banco` (Docker) saiu no commit `40f5897` (v1.51.1) | ✅ confirmado — **e a leitura do fonte da CLI mudou a resposta da Decisão 1**, ver §5 |
| 4 | 34 asserções `if v_n = 0 then ✓` | `grep -rn "if v_.* = 0 then" supabase/tests/*.sql \| wc -l` → **58** | ⚠ a ficha está velha; usei o número medido. **Nenhuma foi convertida** |
| 5 | `ci-passos.test.ts` trava a lista de jobs | linha 377: `expect(nomesDosJobs()).toEqual(['verificar', 'banco-sem-docker'])` | ✅ confirmado — **e ela não precisou mudar**, ver §5, Decisão 2 |

### 2.1 A consequência de desenho do item 1

Sem Postgres na mesa, cada erro que só o CI pegaria custa um ciclo de push. Por isso a fase foi desenhada ao contrário do óbvio: **tudo que é provável sem banco virou módulo próprio, puro e testado**, e só o motor fala com o Postgres.

| Peça | Roda sem banco? |
|---|---|
| `corpo-vigente.mjs` — resolve o corpo VIVO de uma função nas migrations | ✅ |
| `mutacoes.mjs` — o catálogo | ✅ |
| `saida-roteiro.mjs` — a leitura da saída do runner | ✅ |
| `tipos-conjuntos.mjs` — os conjuntos do `database.ts` e a comparação | ✅ |
| `run-mutation-tests.mjs` — o motor | ❌ |
| `diff-tipos.mjs` — a leitura do catálogo do Postgres | ❌ |

O retorno foi medido: das 28 mutações, **26 foram detectadas no PRIMEIRO ciclo de CI**, e as duas correções que faltaram vieram de um achado real, não de erro de digitação. Um catálogo sem a trava de rótulos teria gasto vários ciclos em erros de digitação — que é o que a trava pega em meio segundo.

---

## 3. O injetor de mutações

### 3.1 O contrato, e as quatro decisões de desenho

**Execução de controle primeiro.** Sem mutação nenhuma, os roteiros do lote têm de vir verdes. Se o controle não fecha, o injetor **aborta antes de mutar** — um roteiro já vermelho faria *todas* as mutações "serem detectadas" e o relatório sairia triunfante medindo nada. Provado por sabotagem (§6.3).

**Um banco por mutação.** Todo roteiro é `begin; … rollback;`, então a quebra tem de ser commitada antes, e tem de sobreviver ao rollback. `create database … template <base>` é o caminho barato e **sem lógica de reversão para errar**: o banco inteiro é jogado fora depois. Reverter mutação à mão seria uma segunda implementação, com os próprios defeitos, no caminho crítico da prova.

**A mutação pegou, e isso é provado.** O SQL aplica com `ON_ERROR_STOP=1` e, quando o catálogo declara uma sonda, ela roda e o valor é conferido. Uma mutação que não aplica deixa o roteiro verde e **se disfarça de "não detectada"** — o diagnóstico mais valioso da fase, gasto num erro de sintaxe. Os dois casos têm mensagens diferentes de propósito, e a distinção foi provada por sabotagem (§6.2).

**Rótulo comparado por igualdade de TOKEN, nunca por substring.** Os roteiros estão cheios de rótulo que é prefixo de outro — `2c`/`2c-bis`/`2c-ter`, `4e`/`4e-bis`/`4e-ter`, `12a`…`12e` — e em `dev_destrutivo.sql` o rótulo NU `1` é prefixo de outros dezenove. Um `includes('✗ 2c')` acenderia para o cenário errado e o injetor mentiria com convicção. A regra está em `saida-roteiro.mjs` e tem 20 asserções próprias, incluindo a que prova que ela **não** aceita prefixo.

### 3.2 A inversão do código de saída, escrita para não ser "consertada"

`scripts/db/rodar-roteiros.sh` sai **1** quando o roteiro fica vermelho. Para o CI isso é falha; para o injetor é **sucesso** — é a prova de que a asserção acordou. O injetor por isso **não decide pelo código de saída**: ele lê a saída e procura os rótulos. O aviso está no cabeçalho do motor, e há asserção em `ci-passos.test.ts` exigindo que ele continue lá.

### 3.3 O lote, uma a uma

28 mutações ativas, 10 classes de defeito, os seis roteiros da ficha cobertos. Todas **detectadas pelo cenário nomeado** (run 34074587440 e o final).

| mutação | roteiro | cenário esperado | classe | detectada? |
|---|---|---|---|---|
| `rls-movimentacao-confia-na-filial-declarada` | papeis_rls | `2c-bis`, `2c-ter` | escopo-de-filial | ✅ |
| `rls-lancamento-de-item-confere-papel-e-esquece-filial` | papeis_rls | `2e` | **papel-sem-escopo** | ✅ |
| `rls-edicao-de-ativo-confere-papel-e-esquece-filial` | papeis_rls | `2g` | **papel-sem-escopo** | ✅ |
| `rls-piso-de-leitura-aberto-em-ativos` | papeis_rls | `4d` | piso-de-leitura | ✅ |
| `rls-desligada-em-senhas-de-acesso` | papeis_rls | `3d`, `5f` | rls-desligada | ✅ |
| `rls-auditoria-visivel-a-quem-escreve` | papeis_rls | `3f` | nivel-admin-afrouxado | ✅ |
| `rls-trilha-do-import-visivel-a-quem-escreve` | papeis_rls | `3e` | nivel-admin-afrouxado | ✅ |
| `rls-bucket-de-backup-visivel-a-quem-escreve` | papeis_rls | `6e` | nivel-admin-afrouxado | ✅ |
| `rls-termo-perde-as-invariantes-da-ancora` | papeis_rls | `2i-bis-3` | guarda-neutralizada | ✅ |
| `catalogo-rls-desligada-numa-tabela` | seguranca_catalogo | `2` | rls-desligada | ✅ |
| `catalogo-tabela-de-backup-sem-rls` | seguranca_catalogo | `2` | rls-desligada | ✅ |
| `catalogo-view-sem-security-invoker` | seguranca_catalogo | `3` | view-fura-rls | ✅ |
| `catalogo-funcao-gatilho-executavel-por-authenticated` | seguranca_catalogo | `4` | grant-devolvido | ✅ |
| `catalogo-gatilho-de-lancamento-vira-definer` | seguranca_catalogo | `4c` | guarda-neutralizada | ✅ |
| `catalogo-rpc-de-escrita-executavel-por-anon` | seguranca_catalogo | `1` | grant-devolvido | ✅ |
| `dev-guarda-de-gestao-aceita-nivel-admin` | cargo_dev | `2a`, `2b`, `2c`, `2e` | e-dev-virou-e-admin | ✅ |
| `dev-apagar-conta-aceita-nivel-admin` | cargo_dev | `2f-bis` | e-dev-virou-e-admin | ✅ |
| `dev-encerrar-sessoes-aceita-nivel-admin` | cargo_dev | `2f` | e-dev-virou-e-admin | ✅ |
| `dev-trigger-deixa-conceder-cargo-por-update-direto` | cargo_dev | `2h` | guarda-neutralizada | ✅ |
| `dev-auxiliar-de-gestao-executavel-por-authenticated` | cargo_dev | `5e` | grant-devolvido | ✅ |
| `destrutivo-justificativa-sem-tamanho-minimo` | dev_destrutivo | `12b`, `12e` | guarda-neutralizada | ✅ |
| `destrutivo-guarda-do-acervo-aceita-update` | dev_destrutivo | `2i`, `2k` | imutabilidade-afrouxada | ✅ |
| `destrutivo-guarda-do-acervo-aceita-delete` | dev_destrutivo | `2j`, `2l`, `2m`, `13c` | imutabilidade-afrouxada | ✅ |
| `destrutivo-marca-de-forcado-gravavel-por-qualquer-caminho` | dev_destrutivo | `2f`, `2n` | imutabilidade-afrouxada | ✅ |
| `import-sem-revalidacao-de-contagens` | import_substituir | `2` | guarda-neutralizada | ✅ |
| `import-sem-exigencia-de-backup` | import_substituir | `3` | guarda-neutralizada | ✅ |
| `conflito-justificativa-sem-tamanho-minimo` | conflito_filiais | `5f` | guarda-neutralizada | ✅ |
| `conflito-confirmacao-com-numero-errado-aceita` | conflito_filiais | `5d`, `5e` | guarda-neutralizada | ✅ |

**A mutação obrigatória da ficha** — "a guarda confere o papel e esquece o escopo" — aparece **duas** vezes, de propósito: em `lancamentos_item` e em `ativos`. É a quebra cross-tenant clássica e o ensaio geral da virada multiempresa. Há teste de mesa exigindo que ela exista e que o SQL dela troque mesmo `pode_escrever_filial(…)` por `pode_escrever()`.

### 3.4 A quarentena — 5 de 33 (15%), bem abaixo do terço da régua

| mutação | roteiro | por que o rig de hoje não a acusa | adota |
|---|---|---|---|
| `ancora-do-termo-sempre-coerente` | papeis_rls | **o achado da fase** — ver §3.5 | F48 |
| `leitura-de-colaboradores-sem-piso` | papeis_rls | o roteiro não planta linha em `colaboradores`; "viu 0 linhas" continua verdadeiro com a RLS desligada | F48 |
| `gestao-encerrar-sessoes-mira-o-alvo-errado` | cargo_dev | o cenário `3d` aceita "0 sessões removidas" como sucesso — asserção sobre conjunto vazio | F48 |
| `conflito-serializacao-por-advisory-lock` | conflito_filiais | nenhuma asserção abre uma SEGUNDA conexão; a trava só tem efeito sob concorrência | F52 |
| `conflito-backup-em-arquivo-sem-prefixo-do-digest` | conflito_filiais | a maior seleção testada tem 2 ativos, e o ramo de backup em arquivo só roda acima de 25 | F52 |

Três apontam **asserção fraca** (insumo direto da fase dos catálogos) e duas apontam **caminho não exercitado** (insumo da fase das travas de concorrência). Nenhuma virou correção aqui: o escopo proíbe, e a razão é boa — uma fase que prova o rig e conserta o rig no mesmo commit não prova nada, porque o veredito passa a depender da correção que ela mesma fez.

`scripts/db/mutacoes.test.mts` exige que a quarentena **não seja executável**, que toda entrada **nomeie uma fase**, que o motivo tenha substância, e que ela não passe de um terço do lote. A régua não depende de alguém lembrar dela.

### 3.5 O achado: o cenário `2i-bis-3` prova a conjunção, não a âncora

**Foi a própria ferramenta que o encontrou, no primeiro ciclo de CI (run 34074319187).** A mutação que neutraliza `termo_ancora_coerente` aplicou, a sonda confirmou que pegou, e o cenário `2i-bis-3` de `papeis_rls.sql` continuou **verde**.

Lendo depois: a policy `operador insere` de `termos_gerados` tem **quatro** conjunções no `with check`, e o `INSERT` do cenário usa `arquivo_path = 'forjado.docx'` com um `id` sorteado —

```sql
coalesce(array_length(ativo_ids, 1), 0) > 0
and public.pode_escrever_termo(ativo_ids)
and public.termo_ancora_coerente(movimentacao_ids, ativo_ids)
and arquivo_path = id::text || '.docx'      -- ⟵ esta já recusa sozinha
```

— então a quarta recusa o INSERT **antes de a âncora importar**. Remover só a invariante do path também não derruba o cenário: aí a âncora barra. **O cenário prova a conjunção das quatro**, embora a mensagem de ✓ dele afirme *"a âncora está no ar"*, que é mais do que ele sabe.

O que foi feito, pela Decisão 3: a mutação isolada da âncora foi para a quarentena, com o motivo medido e a fase que a adota; e entrou no lote ativo `rls-termo-perde-as-invariantes-da-ancora`, que remove as duas invariantes e derruba `2i-bis-3` de verdade. **Nenhuma asserção foi tocada.**

Evidência: `docs/f47-evidencias/ciclo-1-injetor.txt`.

### 3.6 O que o log mostra de graça: o raio de explosão

O injetor reporta os cenários que caem **junto** com o esperado. Não reprova — mas documenta, e é dado que a fase seguinte vai querer:

| mutação | também derruba |
|---|---|
| `rls-movimentacao-confia-na-filial-declarada` | `2g` |
| `dev-guarda-de-gestao-aceita-nivel-admin` | `2i`, `2i-bis`, `3a`, `3b`, `3c`, `3d`, `6a`, `6b`, `6e`, `4a`, `4b`, `4c` |
| `dev-apagar-conta-aceita-nivel-admin` | `3a`, `3b`, `4a` |
| `destrutivo-marca-de-forcado-gravavel-por-qualquer-caminho` | `2h` |
| `conflito-justificativa-sem-tamanho-minimo` | `4a`, `4b`, `3b` |
| `conflito-confirmacao-com-numero-errado-aceita` | `4a`, `4b`, `4e`, `3b` |

A leitura útil: as guardas de `cargo_dev.sql` e de `conflito_filiais.sql` são **compartilhadas** entre muitos cenários, e um afrouxamento no núcleo delas atravessa o roteiro inteiro. É o oposto de `papeis_rls.sql`, onde quase toda mutação atinge um cenário só — cada policy tem escopo próprio.

---

## 4. O gate de deriva de tipos

### 4.1 Compara conjunto, e reprova numa direção só

De um lado o banco (relações, colunas, nomes de função lidos do catálogo); do outro o `database.ts`, lido pelo **compilador TypeScript**. Reprova **só** quando o banco tem o que o arquivo não tem.

A direção contrária é legítima, e tem três motivos registrados: `PostgrestVersion` vem do servidor PostgREST, não do catálogo; o arquivo tem hand-fixes deliberados de nulabilidade (a CLI é fixada em 2.109.1 porque a 2.110.0 regride a nulabilidade das sete RPCs `rel_*`); e ele é gerado de **produção**, que tem objeto que nenhuma migration cria. Um passo de CI que falha por motivo legítimo é desabilitado na terceira vez — a assimetria é o que mantém o gate vivo.

### 4.2 A calibragem, medida com resíduo zero

O risco da opção escolhida era reproduzir errado as regras de inclusão do gerador. Elas foram medidas antes de escritas:

```
funções definidas nas migrations em `public` ......... 64
funções listadas em src/lib/types/database.ts ........ 59
diferença ............................................  5
as 5: aplicar_movimentacao, guarda_acervo, handle_new_user,
      profiles_guarda_dev, valida_lancamento_item
todas as 5 declaram `returns trigger`.
```

Logo, uma regra só: `prokind = 'f' and pg_get_function_result(oid) <> 'trigger'`. As demais são diretas (`relkind in ('r','p','v')`, `attnum > 0 and not attisdropped`), e as 9 views das migrations batem com as 9 do arquivo.

**Resultado contra o estado atual, no CI:**

```
banco ....... 30 relações · 299 colunas · 59 funções
database.ts . 30 relações · 299 colunas · 59 funções

VERDE: o database.ts conhece tudo o que o banco tem.
```

Simétrico, resíduo zero nas duas direções. Evidência: `docs/f47-evidencias/criterio-8-gate-de-tipos-verde.txt`.

### 4.3 Por que o compilador e não regex — medido

Uma extração por regex de linha (`/^ +([a-z_]+): \{/`) devolve **54** das 59 funções, porque o gerador emite algumas entradas numa linha só:

```ts
apagar_usuario: { Args: { p_alvo: string }; Returns: undefined }
```

Perder cinco nomes do lado do **repositório** faria o gate acusar deriva que não existe. O `typescript` (5.9.3) já é dependência do projeto, então usar o parser de verdade não custa dependência nova.

### 4.4 ⚠ O limite honesto deste gate, com todas as letras

**Ele compara o `database.ts` com o banco DO CI** — o que as 128 migrations constroem. A deriva de **PRODUÇÃO** continua invisível para ele: um objeto criado à mão no SQL Editor (como a própria `_bkp_relatorios_gerados_f6a` foi, em 16/07/2026) não aparece em migration nenhuma, então o banco do CI não o tem, e o gate não tem como saber que ele existe. Ele só é visto quando alguém roda `npm run db:types` e o arquivo passa a conhecê-lo — e aí o gate o trata como "o repositório tem a mais", que é a direção legítima.

O que o gate garante é o inverso, e já é muito: **nenhuma migration nova entra sem os tipos correspondentes**. Fechar a outra ponta exigiria apontar a leitura para produção a cada CI, que é credencial de produção num runner — decisão de outra fase, e não desta.

---

## 5. As três decisões obrigatórias, com o número que decidiu cada uma

### Decisão 1 — o gate lê o catálogo por SQL, não pela CLI → **opção (b)**

A ficha mandava `--local`, que exige Docker. Restavam (a) `npx supabase@2.109.1 gen types typescript --db-url` e (b) SQL + compilador.

**A medição inverteu o trade-off da ficha.** A vantagem prometida por (a) — "os dois lados saem do mesmo gerador" — só vale para `--project-id`/`--linked`, que falam com a Management API hospedada, e **nenhum dos dois alcança o Postgres efêmero do `banco-sem-docker`** (não é projeto Supabase, não tem ref, não tem `linked-project.json`). O único caminho que aponta para uma connection string arbitrária é `--db-url`, e lido no **fonte da CLI na tag que este repositório fixa** (`v2.109.1`, `apps/cli-go/internal/gen/types/types.go`), fora do caminho `projectId` ele monta um `hostConfig{NetworkMode: host}` e chama `DockerRunOnceWithConfig` com a imagem `supabase/postgres-meta`: **`--db-url` sobe um container Docker** e delega a introspecção a ele.

Ou seja, (a) na única forma que serviria aqui reintroduz Docker + pull de imagem de terceiro num passo de *required status check* — a classe de dependência que a F46 gastou uma fase removendo, e que o escopo desta fase proíbe por escrito.

Uma nota que vale registrar porque **eu estava errado antes de medir**: minha primeira hipótese era que `npx supabase@2.109.1` reintroduziria a cicatriz do rate limit de 24/07, porque o pacote baixaria o binário da API de releases do GitHub. `npm view supabase@2.109.1 optionalDependencies` mostra que **não**: a 2.109.1 distribui o binário por `optionalDependencies` por plataforma (`@supabase/cli-linux-x64` etc.), tudo pelo npm, sem `postinstall`. A cicatriz não se aplica; o que mata (a) é o Docker do `postgres-meta`, que é outro motivo.

### Decisão 2 — passo dentro de `banco-sem-docker`, **incondicional**

Medido no run 34048772118:

| | tempo |
|---|---|
| subir o `postgres:17` | 26s |
| instalar `psql` | 15s |
| bootstrap (4 arquivos) | <1s |
| 126 migrations | 6s |
| determinismo (2º banco do zero + 2 fingerprints + diff) | 6s |
| 25 roteiros, 577 asserções | 2s |
| **job inteiro** | **62s** |
| **`verificar`, em paralelo** | **280s** |

Um **job próprio** pagaria de novo os **41s de overhead fixo** para economizar os **6-8s** de reaplicar bootstrap + migrations — 5 a 7 vezes mais caro do que o que evita. E, como a **branch protection não se toca nesta fase**, um job novo nunca seria *required check*: um portão que não fecha. Como **passo** no job que já é required, o gate vale desde o primeiro dia — e a lista de jobs travada em `ci-passos.test.ts` **não precisou mudar**.

**Incondicional, contrariando a metade "em PR marcado" da ficha, e o motivo é documental:** a documentação oficial do GitHub sobre condições de execução de job diz que **um job pulado reporta status "Success" e não impede o merge, mesmo sendo required check**. Gatear por label deixaria o gate verde sem ter rodado, e ninguém saberia. A restrição inegociável da ordem ("o que é condicional não pode ser required check") resolve-se na outra ponta: nada é condicional, e há asserção impedindo que um `if:` apareça nesses passos depois.

Custo aceito e medido: o job passou a precisar de Node (`setup-node` 4s + `npm ci` 22s). Foi de **62s para 86s**; o relógio do CI, que é o `verificar`, não se mexeu.

⚠ **O risco que esta decisão aceita, de frente:** um defeito no injetor reprova um required check e trava merges. Mitigado por o injetor ser determinístico (sem rede, sem tempo, sem aleatório) e por a correção ser ela própria um PR cujo injetor já estaria corrigido — mas o risco existe e não foi eliminado.

### Decisão 3 — mutação não detectada REPROVA; a quarentena é declarada

O injetor sai não-zero com qualquer mutação ativa não detectada. Quem se prova indetectável **sem escrever catálogo novo** vai para a quarentena com SQL, motivo e fase adotante, e há teste cobrando as três coisas. Estado no fecho: **28 ativas, 5 em quarentena (15%)**. A régua do terço está no teste, não na memória de ninguém.

---

## 6. As sabotagens — a prova de que as duas ferramentas sabem ficar vermelhas

São entregável, não cerimônia. Cada uma foi aplicada, observada no CI com saída real, e **revertida**, com a reversão conferida.

### 6.1 O lote inteiro detectado pelo cenário nomeado (o estado de referência)

Run 34074587440, job `banco-sem-docker`: **success**.

```
27/27 detectadas pelo cenário nomeado · 9444 ms no total
```

Evidência completa: `docs/f47-evidencias/criterio-1-lote-interio-detectado.txt`.

### 6.2 Sabotagens 1 e 2 — a asserção desligada e o SQL que não aplica

Run 34074739445. Duas quebras num ciclo só, porque as duas se manifestam no mesmo passo e provam a distinção que mais importa.

**A asserção 4d de `papeis_rls.sql` foi desligada** (`if v_n = 0 then` virou `if true then`) — ela nunca mais marca `✗`:

```
rls-piso-de-leitura-aberto-em-ativos    papeis_rls.sql    4d    NÃO detectada    344 ms
   └─ esperava ✗ em [4d], NÃO caiu [4d]; caiu de fato [nada]
```

O injetor acusou **a mutação certa, e só ela**, nomeada. As outras 27 continuaram detectadas — a sabotagem não contaminou o lote.

**Uma mutação citando policy inexistente:**

```
sabotagem-f47-sql-que-nao-aplica    papeis_rls.sql    2e    NÃO aplicou    316 ms
   └─ o SQL da mutação foi recusado: ERROR:  policy "esta policy nao existe em lugar nenhum"
      for table "ativos" does not exist
```

**"NÃO aplicou", nunca "NÃO detectada".** É a distinção que impede o injetor de acusar de fraca uma asserção que está certa.

Evidência: `docs/f47-evidencias/sabotagem-1-e-2-injetor.txt`. Reversão conferida: `git diff main -- supabase/tests/papeis_rls.sql` vazio.

### 6.3 Sabotagem 3 — o controle vermelho aborta antes de mutar

Run 34074976775. Um passo temporário do CI quebrou o banco (`alter table public.motivos disable row level security`) **depois** do passo dos roteiros — que passou verde — e **antes** do injetor.

```
---- CONTROLE: os roteiros do lote, SEM mutação nenhuma ----
…
WARNING:  ✗ 3a operador CRIOU motivo (é matéria de admin)
WARNING:  ✗ 2 1 tabela(s) public SEM RLS: motivos

::error::O CONTROLE NÃO FECHOU VERDE — abortando ANTES de mutar.
::error::Um roteiro já vermelho faria TODAS as mutações "serem detectadas".
         Conserte o roteiro (ou o banco) e rode de novo; nada foi mutado.
```

**A prova de que nada foi mutado**, conferida no log inteiro: zero ocorrências de `RESULTADO DO LOTE`, zero linhas de mutação aplicada.

Evidência: `docs/f47-evidencias/sabotagem-3-controle-vermelho.txt`. Reversão conferida: o `ci.yml` não tem mais nenhuma ocorrência de "SABOTAGEM".

### 6.4 Sabotagem 4 — a coluna nova sem `npm run db:types`

*(preenchido a seguir, com a saída do run.)*

### 6.5 A quinta prova, permanente: a tabela `_` sem RLS

A ordem pedia uma sabotagem para provar que a isenção por prefixo removida fazia diferença. Ela virou coisa melhor: **uma mutação permanente do lote**, `catalogo-tabela-de-backup-sem-rls`, que cria `public._sabotagem_f47_sem_rls (x int)` sem RLS e exige `✗ 2` de `seguranca_catalogo.sql`.

Até esta fase essa quebra era **invisível** para os 25 roteiros — era exatamente o que a isenção escondia. Agora ela é cobrada a cada CI, para sempre, em vez de uma vez só.

---

## 7. A migration `0128` — a tabela órfã entra no versionamento

`_bkp_relatorios_gerados_f6a` existia **só em produção** desde 16/07/2026 (F6A, `create table as select` no SQL Editor), guardando 2 snapshots do go-live. Nenhuma migration a criava; o `database.ts` a conhece porque é gerado de produção. O banco do CI é construído a partir das migrations — **21 tabelas em produção contra 20 no CI**.

Isso derrubaria as duas entregas da fase se ficasse como estava: `seguranca_catalogo.sql` perde a isenção por prefixo aqui, e sem a tabela existir no CI a asserção passaria lá e acusaria em produção.

**A forma:** as 8 colunas anuláveis do `database.ts`, **sem PK e sem FK** — `create table as select` não copia constraint, e recriá-las faria o CI divergir de produção na direção contrária, que é o defeito que a migration veio corrigir, de cabeça para baixo. RLS ligada e leitura só do desenvolvedor (é arquivo morto de diagnóstico, não cadastro). Nenhuma policy de escrita, de propósito.

**Ela é idempotente, e é a única das 128.** O `RUNBOOK-BANCO.md` registra, com razão, que as migrations não são idempotentes por desenho. Esta é a exceção porque aplica sobre **dois estados iniciais diferentes**, e isso é o serviço dela: no CI a tabela não existe, em produção existe há dois meses. O `drop policy if exists` antes do `create policy` fecha o único ponto que derrubaria o apply em produção — forma que existe no repositório desde a `0012` e a `0059`.

**A ordem interna não foi livre:** `0128` → `db:lock` + a segunda lista → gate ligado → isenção removida. Fora dessa ordem, o gate e a asserção nasceriam vermelhos por causa da própria tabela que a fase estava trazendo para dentro.

**Aplicou limpo no banco do CI**, e em dois bancos independentes: o passo de determinismo aplica a cadeia inteira do zero num segundo banco e compara as impressões digitais por classe — idênticas.

⚠ **Em produção ela NÃO foi aplicada nesta janela.** Ver §10.

---

## 8. A isenção por prefixo saiu do `seguranca_catalogo.sql`

Havia ali um `and left(c.relname, 1) <> '_'` **sem motivo escrito**. Ele era a categoria por onde qualquer backup futuro escapava: uma tabela nascida `_scratch` sem RLS não era cobrada por asserção nenhuma daquele arquivo. E não era hipótese — quatro tabelas `_` já existiram (`_f8_backup_matriz_compras`, `_f7k_backup_modelo`, `_f18_backup_pendencia`, e a `_bkp_relatorios_gerados_f6a`, que continua lá).

A asserção vizinha, a das views, **nunca teve isenção nenhuma**. Era essa a assimetria, e ela não tinha razão de ser.

O comentário que ficou no lugar diz o que saiu, por quê, e por que só podia sair **depois** da `0128`.

---

## 9. Os 14 critérios de aceitação, autoverificados

*(preenchido no fecho, com a evidência de cada um.)*

---

## 10. Pendências e backlog nomeado

*(preenchido no fecho.)*
