## gen_types

`scripts/gen-types.ts` (91 linhas) gera `src/lib/types/database.ts` de forma segura para `npm run db:types`. Motivação (cabeçalho, linhas 1-14): `supabase gen types --linked` ESCREVE um JSON de erro por cima do arquivo quando o projeto não está linkado neste ambiente (`LegacyProjectNotLinkedError`) — o footgun do redirecionamento `> database.ts`, que trunca antes de saber se o comando deu certo.

FOOTGUN 1 (o do cabeçalho, já citado acima): resolvido capturando a saída da CLI em memória (`spawnSync`) e só gravando se `saida.includes('export type Database') || saida.includes('export interface Database')`; gravação atômica via `.tmp` + `renameSync` no MESMO diretório; qualquer falha sai 1 sem tocar no arquivo existente (`rmSync(TMP,{force:true})` antes de abortar).

FOOTGUN 2 (comentário linhas ~40-51, F22 29-30/07/2026): a CLI SEM pin resolve para a mais nova a cada execução (`npx supabase@latest`). Medido: a 2.110.0 gera `p_filial: number` onde a 2.109.1 gera `p_filial: number | null` nas sete RPCs `rel_*` (o app passa `null` de propósito no relatório consolidado "geral") — churn de tipo em arquivos que a fase nem tocou. Resolvido fixando `const VERSAO_CLI = '2.109.1'` — A MESMA versão fixada no job `banco` de `.github/workflows/ci.yml` linha 88 (comentário: "Mexeu lá, mexa aqui").

FONTE DO BANCO (env vars): `DB_TYPES_PROJECT_REF` (lida e `.trim()`ada, linha 39) decide o caminho — setada → `['supabase@2.109.1','gen','types','typescript','--project-id',REF]` (fala com a Management API via `SUPABASE_ACCESS_TOKEN`, já em `.env.local`); vazia → `['supabase@2.109.1','gen','types','typescript','--linked']` (comportamento antigo, precisa de `supabase/.temp/linked-project.json`, que múltiplas atas do DECISOES.md confirmam NÃO existir nesta máquina — falha com `LegacyProjectNotLinkedError`). O ref não é hardcoded de propósito (comentário linhas 33-35: apontar para o banco errado geraria tipos errados sem ninguém notar).

Execução: `spawnSync('npx', args, {encoding:'utf8', shell: process.platform==='win32', maxBuffer: 32*1024*1024})`. `r.error` → aborta ("Não consegui executar o supabase CLI"). `r.status!==0` → aborta com dica contextual (conferir `SUPABASE_ACCESS_TOKEN`/`DB_TYPES_PROJECT_REF`, ou "Projeto não linkado? Rode com DB_TYPES_PROJECT_REF=..."), imprimindo até 800 chars do stderr.

`package.json`: `"db:types": "tsx scripts/gen-types.ts"` (linha 15). Não há `supabase` (CLI) em `dependencies`/`devDependencies` — é sempre `npx supabase@<pin>`, i.e. rede em tempo de execução, nunca uma entrada no `package.json`. Confirmado por `cat package.json`.

## forma_database_ts

1897 linhas, um único arquivo, um único schema (`public`) — não há blocos `auth.*`/`storage.*`/`graphql_public.*`, confirmando escopo `public`-only na geração.

Cabeçalho (linhas 1-14): `export type Json = string|number|boolean|null|{[key:string]:Json|undefined}|Json[]`; depois `export type Database = { __InternalSupabase: { PostgrestVersion: "14.5" } public: { Tables:{} Views:{} Functions:{} Enums:{} CompositeTypes:{} } }`. `PostgrestVersion` vem do servidor no momento da geração — não é derivável do catálogo do Postgres nem das migrations.

`Tables:` linhas 16-1147 — 21 tabelas, em ordem ALFABÉTICA (a primeira é `_bkp_relatorios_gerados_f6a`, porque `_` ordena antes de letras minúsculas — consistente com o `sortGeneratorMetadata` do gerador oficial): `_bkp_relatorios_gerados_f6a, ambiente, anotacoes, ativos, colaboradores, eventos_admin, filiais, import_logs, itens, kits_modelos, lancamentos_item, motivos, movimentacoes, operador_filiais, pendencias_item, profiles, relatorios_gerados, senha_tentativas, senhas_acesso, termos_gerados, tipos_item`. Cada entrada: `Row`/`Insert`/`Update`/`Relationships: []` (ou array de `{foreignKeyName,columns,isOneToOne,referencedRelation,referencedColumns}`).

`Views:` linhas 1148-1347 — 9 views (`v_colaboradores_consolidacao, v_colaboradores_textos, v_conflitos_filiais, v_conflitos_filiais_grupos, v_estoque_atual, v_fila_pendencias, v_movimentacoes_mes, v_pendencias, v_pendencias_item`). Só `Row`+`Relationships` — sem `Insert`/`Update` (não são gravadas pelo app).

`Functions:` linhas 1348-1674 — 59 funções (contadas por grep), alfabéticas, `{Args: {...}|never, Returns: <escalar>|{...}[]|undefined}`. Nenhuma das funções TRIGGER do projeto (`guarda_acervo`, `valida_lancamento_item`, `handle_new_user`, `profiles_guarda_dev`, etc. — confirmado por grep, ausentes das 59) aparece aqui — consistente com a regra do gerador oficial que exclui `return_type in ('trigger','event_trigger')` (ver `opcao_b`).

`Enums:` linhas 1675-1720 — 6 enums (`categoria_ativo, grupo_item, papel_usuario, status_ativo, termo_status, tipo_lancamento, tipo_movimentacao`). `CompositeTypes: { [_ in never]: never }` linhas 1721-1723 (nenhum tipo composto no banco).

Linhas 1727-1842: os genéricos `Tables<>`/`TablesInsert<>`/`TablesUpdate<>`/`Enums<>`/`CompositeTypes<>` — boilerplate padrão do gerador, agnóstico de schema, não muda entre execuções.

Rodapé (linhas 1844-1897): `export const Constants = { public: { Enums: { <os mesmos 6 enums, como arrays readonly literais> } } } as const` — espelho em runtime dos unions de `Enums`, usado por `.includes()` em código de app.

HAND-FIXES DELIBERADOS que a ata registra (14/07 e 31/08, mais o padrão que se repete entre elas):
- 14/07 F3B: após regenerar via MCP (porque `--linked` falha localmente), a nulabilidade `p_filial: number | null` das RPCs `rel_*` foi restaurada à mão — "igual ao que a CLI gerava" (DECISOES.md linha 205).
- 14/07 F5A: a CLI truncou o arquivo com o JSON de erro; restaurado via `git checkout` + edições cirúrgicas (valor `'gerado'` no enum `termo_status` + `Constants`, bloco da tabela `termos_gerados`) a partir da saída do MCP (linha 240).
- 24/07 (mesma classe, achado da revisão F21, linha 2903-2907): a regeneração desfez em silêncio a remoção manual da coluna GERADA `profiles.nome` de `Insert`/`Update`; restaurada.
- Padrão recorrente entre essas datas (ex. X4/`senha_tentativas`, linha 448; `import_logs`+função, linha 602; `observacao` em F6B, linha 573; enum `troca` da F15, linha 1683): em vez de regenerar tudo (o que reverteria os hand-fixes acima), o time insere CIRURGICAMENTE só a tabela/função/valor de enum novo, preservando o resto do arquivo à mão.
- 31/08 F41 (linha 7864, "`npm run db:types` estava velho, e aponta para PRODUÇÃO"): ÚNICA regeneração completa registrada nesse intervalo — de PRODUÇÃO, CLI 2.109.1, porque o ensaio não tem `_bkp_relatorios_gerados_f6a` e regenerar dele a apagaria do arquivo em silêncio. Revelou que a nulabilidade de `p_observacao` também regride (`string|null`→`string`) em `estornar_movimentacao_com_itens` e `resolver_pendencias_item_com_lancamentos` — mas desta vez NÃO foi hand-fixed de volta: os 2 chamadores TS passaram a enviar `''` em vez de `?? null` (equivalente, porque as RPCs fazem `nullif(btrim(coalesce(p_observacao,'')),'')`).
- Checagem direta no arquivo atual (`grep -n "p_filial" database.ts`): NENHUMA das 7 ocorrências em `rel_*` mostra `| null` hoje — todas são `p_filial: number` puro. Como a F41 é a última regeneração completa e a própria ata dela diz que regenerar de produção "reproduz a mesma diferença" (a de `p_observacao`), é plausível que o hand-fix de `p_filial` descrito em F21/F22 também não tenha sobrevivido a essa regeneração — ou o problema foi resolvido de outra forma que esta leitura não confirma. Está fora do escopo desta frente resolver; registro como discrepância a decidir (linha própria em `docs/DECISOES.md`) antes de qualquer trabalho que dependa da nulabilidade exata desses parâmetros — o gate de deriva por CONJUNTO (tabela/coluna/função) não é afetado por ela, porque não compara nulabilidade.

## bkp_no_database_ts

Linhas 17-49 de `src/lib/types/database.ts`, literal:

```
      _bkp_relatorios_gerados_f6a: {
        Row: {
          dados: Json | null
          filial_id: number | null
          gerado_em: string | null
          gerado_por: string | null
          id: string | null
          periodo_ate: string | null
          periodo_de: string | null
          versao: number | null
        }
        Insert: {
          dados?: Json | null
          filial_id?: number | null
          gerado_em?: string | null
          gerado_por?: string | null
          id?: string | null
          periodo_ate?: string | null
          periodo_de?: string | null
          versao?: number | null
        }
        Update: {
          dados?: Json | null
          filial_id?: number | null
          gerado_em?: string | null
          gerado_por?: string | null
          id?: string | null
          periodo_ate?: string | null
          periodo_de?: string | null
          versao?: number | null
        }
        Relationships: []
      }
```

8 colunas, TODAS anuláveis nas 3 formas (Row/Insert/Update): `dados: Json`, `filial_id: number`, `gerado_em: string`, `gerado_por: string`, `id: string`, `periodo_ate: string`, `periodo_de: string`, `versao: number`. Em `Insert`/`Update` as 8 são também OPCIONAIS (`?:` + `| null`) — ou seja, a linha inteira é gravável sem nenhum campo obrigatório. `id` tipado `string | null` (não `uuid` estrito) e SEM default — reforça que nasceu de `create table ... as select` ad hoc (F6A), nunca de uma migration com `id uuid primary key default gen_random_uuid()`. É a ÚNICA tabela do arquivo com prefixo `_`. `Relationships: []` — nenhuma FK. É exatamente esta forma (8 colunas, mesmos nomes, mesma nulabilidade tripla) que a migration `0128` precisa reproduzir em `create table if not exists public._bkp_relatorios_gerados_f6a (...)` para não divergir do que já existe em produção (que, segundo `supabase/migrations/0039_drop_backups_orfaos.sql` e `0058_drop_backup_f18.sql`, tem só 2 linhas — os 2 snapshots do go-live — e RLS possivelmente já ligada por remendo manual, então a `0128` não pode presumir `create policy` idempotente).

## opcao_a

`npx supabase@2.109.1 gen types typescript --db-url <url>`.

FLAG CONFIRMADA na doc oficial vigente: https://supabase.com/docs/reference/cli/supabase-gen-types — "--db-url <string> — Generate types from a database url", conexão via connection string percent-encoded; mutuamente exclusiva com `--linked`/`--local`/`--project-id`. Confirmação primária, direta no CÓDIGO da CLI NA TAG PINADA (não na doc genérica, que é sempre "vigente" e pode ter mudado desde 07/2026): `gh api repos/supabase/cli/contents/apps/cli-go/cmd/gen.go?ref=v2.109.1` mostra, linha ~150: `typeFlags.String("db-url", "", "Generate types from a database url.")` e `genTypesCmd.MarkFlagsMutuallyExclusive("local", "linked", "project-id", "db-url")`. A flag EXISTE e se comporta como a doc descreve, na versão exata que este repositório fixa.

CUSTO/RISCO CONCRETO, medido no próprio código-fonte da tag v2.109.1 (não é opinião — é o que `apps/cli-go/internal/gen/types/types.go` faz): a função `Run()` só evita Docker quando `projectId != ""` (chama a Management API, `V1GenerateTypescriptTypesWithResponse` — é o caminho que `scripts/gen-types.ts` já usa hoje via `--project-id`/`--linked`). QUALQUER OUTRO caminho — inclusive `--db-url` — cai no branch que monta `hostConfig{NetworkMode: network.NetworkHost}` e chama `utils.DockerRunOnceWithConfig(ctx, container.Config{Image: utils.Config.Studio.PgmetaImage, Env:[...], Cmd:["node","dist/server/server.js"]}, hostConfig, ...)` — ou seja, **`--db-url` sobe um CONTAINER DOCKER LOCAL rodando `postgres-meta`** (imagem `supabase/postgres-meta:v0.90.0`, confirmada em `packages/stack/src/versions.unit.test.ts` do repo `supabase/sdk`) para fazer a introspecção e a geração, MESMO quando o Postgres-alvo é remoto/CI. Ele fala com esse container local via `PG_META_DB_URL` (a connection string que você passou) — o container é quem de fato introspecciona e gera.

Isso significa: `--db-url` exige (i) um daemon Docker rodando na máquina que invoca a CLI, e (ii) o pull bem-sucedido de `supabase/postgres-meta` de um registry de terceiro. **É exatamente a classe de dependência que a F46 tirou do caminho crítico** — o próprio prompt da F47 diz, na seção "Fora — não toque": *"Docker, `supabase start`, `supabase init`, `setup-cli` no caminho crítico. A F46 os tirou de lá por dois incidentes de causa externa."* Um runner GitHub-hosted TEM Docker (então tecnicamente RODA), mas usá-lo aqui reintroduz, num job/passo NOVO e potencialmente required check, o mesmo padrão de falha externa (registry fora do ar/rate-limited) que motivou trocar o job `banco` pelo `banco-sem-docker` — e o próprio `banco-sem-docker` existe precisamente para NÃO puxar imagem nenhuma da Supabase.

Custo adicional, menor: mesmo ignorando o Docker, `--project-id`/`--linked` (os únicos caminhos sem Docker) não servem para este gate — não há projeto Supabase nem `linked-project.json` apontando para o Postgres efêmero que o job `banco-sem-docker` constrói a partir das migrations; é só um `services: postgres` puro do GitHub Actions, sem ref de projeto. Então a vantagem central que a Decisão 1 do prompt atribui à opção (a) — "os dois lados saem do MESMO gerador" — só vale para os caminhos que NÃO alcançam o banco do CI. O único caminho que alcança (`--db-url`) tem o custo do Docker.

## opcao_b

Ler os conjuntos do catálogo do Postgres por SQL, e comparar com os conjuntos extraídos de `database.ts` pelo compilador TypeScript (já é dependência — `"typescript": "^5"` em `devDependencies`, usado por `tsc --noEmit`).

ESCOPO CONFIRMADO — só `public`: não existe `supabase/config.toml` neste repositório (`find supabase -maxdepth 1` não lista o arquivo, e não está no `.gitignore` — simplesmente nunca foi criado, este projeto nunca rodou `supabase init`). No código da CLI pinada (`apps/cli-go/internal/gen/types/types.go`, v2.109.1): `if len(schemas)==0 { schemas = append(["public"], utils.Config.Api.Schemas...) }` — sem `config.toml`, `utils.Config.Api.Schemas` é o zero-value (vazio), e `scripts/gen-types.ts` nunca passa `--schema`. Logo o escopo real, hoje, é sempre `nspname = 'public'`. Confirma o fato de `database.ts` não ter blocos `auth.*`/`storage.*`.

SQL EXATO (simplificado do gerador oficial `@supabase/postgrest-typegen`, repo `supabase/sdk`, `packages/postgrest-typegen/src/introspection/sql/`, restrito ao que o escopo do gate pede — "tabelas, colunas de Row/Insert, nomes de funções", NÃO views):

```sql
-- Tabelas (Row):
select c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r','p');

-- Colunas dessas tabelas (Row = todas; Insert/Update = subtrair as geradas, ver regra 4):
select c.relname as table_name, a.attname as column_name,
       a.attgenerated in ('s','v') as is_generated
from pg_attribute a
join pg_class c on a.attrelid = c.oid
join pg_namespace n on c.relnamespace = n.oid
where n.nspname = 'public'
  and c.relkind in ('r','p')
  and a.attnum > 0
  and not a.attisdropped;

-- Funções (nomes):
select p.proname as function_name
from pg_proc p
join pg_namespace n on p.pronamespace = n.oid
where n.nspname = 'public'
  and p.prokind = 'f'
  and pg_get_function_result(p.oid) not in ('trigger','event_trigger');
```

REGRAS DE INCLUSÃO a reproduzir — uma a uma, cada uma citada na fonte oficial:

1. **Schema = `public` só.** Já justificado acima. `filterByList()` (`helpers.ts` do `postgrest-typegen`): quando `include` é passado, a função retorna `IN (...)` e NUNCA consulta a lista de exclusão padrão (`information_schema, pg_catalog, pg_toast`) — ou seja, o "excluir schema de sistema" fica moot quando já se inclui só `public`.
2. **Tabelas: `pg_class.relkind IN ('r','p')`** — ordinárias + particionadas. `table.sql.ts` linha 35: `c.relkind IN ('r', 'p')`. Exclui views (`'v'`), materialized views (`'m'`), foreign tables (`'f'`), índices, sequências. O filtro de privilégio real (`pg_has_role(...) OR has_table_privilege(...) OR has_any_column_privilege(...)`, linhas 38-44) é irrelevante aqui DESDE QUE o script de CI conecte com o mesmo role que roda as migrations/roteiros (dono de tudo) — é o mesmo padrão que `scripts/db/rodar-roteiros.sh` já usa.
3. **Colunas: `a.attnum > 0 AND NOT a.attisdropped`** (`columns.sql.ts` linhas 148-149) — descarta colunas de sistema (`attnum<=0`, ex. `tableoid`, `xmin`) e colunas dropadas que ainda ocupam um `attnum`. O gerador oficial varre `relkind IN ('r','v','m','f','p')` (todas as relações, para servir também `Views`); como o escopo do gate É só tabela, restringir a `('r','p')` (mesmo filtro da regra 2) é o recorte correto — não copiar o `('r','v','m','f','p')` cegamente, ou o diff passaria a cobrar colunas de view que não são o alvo declarado.
4. **Coluna GERADA sai de `Insert`/`Update`, fica em `Row`.** `a.attgenerated IN ('s','v')` (`columns.sql.ts` linhas 48-49, comentário: "neither accepts writes"). É a regra por trás do hand-fix de `profiles.nome` documentado em `docs/DECISOES.md` (achado da F21, linha ~2903: "a regeneração do database.ts desfez em silêncio a edição manual... que tirava nome (coluna GERADA) de Insert/Update"). Se o diff comparar o CONJUNTO de colunas de `Insert` sem subtrair as geradas, toda coluna gerada vira falso positivo ("banco tem, repo não tem em Insert") — a asserção teria de ser calibrada contra o estado atual (regra do próprio prompt F47: "o gate tem de vir VERDE contra o estado atual") ANTES de ligar.
5. **Funções: `pg_proc.prokind = 'f'`** só (`functions.sql.ts` linha 70). Exclui procedures (`'p'`), agregadas (`'a'`), window functions (`'w'`) — este projeto não parece ter nenhuma dessas categorias hoje, mas a regra precisa estar escrita para não quebrar se uma nascer.
6. **Função que RETORNA `trigger`/`event_trigger` é excluída do conjunto**, e essa exclusão NÃO está no `WHERE` de `functions.sql.ts` — é um filtro pós-query em JS: `introspection/index.ts` linhas 122-124: `functions: functions.filter(({return_type}) => !["trigger","event_trigger"].includes(return_type))`, onde `return_type = pg_get_function_result(f.oid)`. Precisa virar `AND pg_get_function_result(p.oid) NOT IN ('trigger','event_trigger')` no SQL (ou um filtro equivalente pós-query). Confirmado empiricamente NESTE repositório: nenhuma das funções trigger conhecidas (`guarda_acervo`, `valida_lancamento_item`, `handle_new_user`, `profiles_guarda_dev`, e as que disparam em `movimentacoes`/`lancamentos_item`/`ativos`) aparece nas 59 funções hoje listadas em `database.ts` (checado por grep) — a regra já está implicitamente honrada pelo arquivo atual; errar essa exclusão no gate faria ele acusar "banco tem função X que o repo não tem" para toda trigger function legítima.
7. **Views/materialized views/foreign tables** são consultas SEPARADAS no gerador oficial (`VIEWS_SQL`, `MATERIALIZED_VIEWS_SQL`, `FOREIGN_TABLES_SQL`) e viram `Database["public"]["Views"]`, não `Tables`. O texto da ordem F47 (§4 do escopo, e o enunciado desta tarefa) fala só em "tabela/coluna/função" — views ficam de fora do diff a menos que o implementador decida ampliar deliberadamente; isto é uma decisão de escopo a confirmar/registrar, não algo que esta leitura resolveu sozinha.

EXTRAÇÃO DO LADO `database.ts` — compilador TS × regex: o arquivo tem 21 tabelas e 59 funções em formato bem regular (prettier), mas várias `Args`/`Returns` são multi-linha (`criar_movimentacao_com_itens`, `resetar_acervo`, `apagar_ativos_conflito_filiais`, `dev_checagens_integridade`, etc. — vistos ao ler o arquivo). Um regex ingênuo por linha quebraria nesses casos ou exigiria estado de parênteses balanceados reimplementado à mão. Como `typescript` já é dependência aprovada (usada em `tsc --noEmit`, regra 6/8 do CLAUDE.md não entra em jogo — não é dependência NOVA), a rota recomendada é `ts.createSourceFile` + navegar o AST até os nós de tipo-literal de `Database["public"]["Tables"]`/`["Views"]`/`["Functions"]`, coletando as chaves de cada `TypeLiteralNode` — dá garantia real de parse (não corta no meio de um `Args` multi-linha) e é testável com fixture pequena no Vitest, sem banco, como o próprio prompt F47 exige para `diff-tipos.mjs`.

## recomendacao

**Decisão 1: opção (b).** O trade-off real não é o que a ficha da F47 enquadra ("CLI de terceiro no caminho, mas sem calibragem manual" × "zero rede, mas replicar regras à mão") — é mais assimétrico do que isso, e a medição no CÓDIGO-FONTE da própria CLI pinada (v2.109.1) muda o resultado:

A vantagem prometida da opção (a) — "os dois lados saem do MESMO gerador, então as regras de inclusão são idênticas por construção" — só é verdadeira para os DOIS caminhos da CLI que NÃO precisam de Docker (`--project-id`/`--linked`, que falam com a Management API hospedada). Mas nenhum dos dois alcança o Postgres efêmero do `banco-sem-docker` (não é projeto Supabase, não tem ref, não tem `linked-project.json`). O ÚNICO caminho da CLI capaz de apontar para uma connection string arbitrária é `--db-url` — e esse, medido linha a linha em `apps/cli-go/internal/gen/types/types.go` na tag `v2.109.1`, NÃO fala direto com o Postgres: ele sobe um **container Docker rodando `supabase/postgres-meta`** e delega a introspecção/geração a ele. Ou seja: a opção (a), na única forma em que ela de fato serve para este gate, reintroduz exatamente a classe de dependência que a F46 gastou uma fase inteira removendo do caminho crítico (Docker + pull de imagem de terceiro, sujeito às "duas incidentes de causa externa" que a própria ata de F46 documenta) — e o prompt da F47 PROÍBE isso com todas as letras na seção "Fora": *"Docker... no caminho crítico"*. Não é uma preferência de estilo; é a mesma classe de risco que motivou trocar o job `banco` pelo `banco-sem-docker`, agora reaparecendo dentro da ferramenta que prova que o `banco-sem-docker` não derivou.

Isso muda o cálculo: o "custo real" que a ficha atribui só à opção (b) — reproduzir as regras de inclusão do gerador — na prática TEM de ser pago de qualquer forma, porque a opção (a) só evita esse custo nos dois caminhos que não servem aqui. A diferença é que, para (b), esse custo é conhecido, pequeno e já rastreado até a fonte: as regras de inclusão do gerador oficial vivem hoje em `@supabase/postgrest-typegen` (`supabase/sdk`, pacote usado tanto pelo `postgres-meta` quanto, presumivelmente, pela Management API que gera o `database.ts` comitado hoje) — são ~6 condições de `WHERE`/filtro (relkind de tabela, `attnum`/`attisdropped` de coluna, `attgenerated` para Insert/Update, `prokind='f'` de função, exclusão de `return_type IN ('trigger','event_trigger')`, escopo `public`-only), cada uma já citada linha a linha na resposta `opcao_b`. Duas das regras mais arriscadas de errar já têm confirmação cruzada DENTRO deste repositório, sem depender de fé na doc externa: as 59 funções hoje em `database.ts` não incluem NENHUMA função trigger conhecida do schema (bate com a regra 6), e o `docs/DECISOES.md` já documenta o efeito exato da regra 4 (`profiles.nome`, coluna gerada, some de `Insert`/`Update`).

O que faria essa escolha fracassar: se o script de CI conectar com um role diferente do que roda as migrations (o filtro de privilégio do gerador oficial — `pg_has_role`/`has_table_privilege` — faria os conjuntos divergirem por VISIBILIDADE, não por schema real); mitigação: usar o mesmo role/URL que `scripts/db/rodar-roteiros.sh` já usa. Ou se uma regra de inclusão for mal replicada e o gate nascer vermelho por motivo ilegítimo contra o estado atual — o próprio prompt F47 já prevê essa saída: medir, e se não vier verde numa tentativa honesta de calibragem, TROCAR para (a) e registrar a troca (nesse caso a troca teria de aceitar o Docker, e ligar o passo/job SÓ como não-required, já que ele reintroduziria o risco externo que `banco-sem-docker` é required check por NÃO ter).

Sobre dependência nova: `npx supabase@<pin>` já é como este repositório invoca a CLI hoje (`scripts/gen-types.ts`) — é rede em tempo de execução, nunca uma entrada em `package.json`, então por si só NÃO fere a regra 3 do CLAUDE.md (que trata de dependência declarada/paga/com licença comercial). Minha recomendação contra (a) não é "npx = proibido" — é que a ÚNICA invocação de `npx supabase` capaz de servir este gate específico (`--db-url` contra o Postgres do CI) exige uma SEGUNDA coisa, mais pesada e explicitamente vetada (Docker + imagem de terceiro), que este repositório já decidiu, por escrito, tirar do caminho crítico. Se uma fase futura apontar o gate para um projeto Supabase hospedado de verdade (em vez do Postgres cru do `banco-sem-docker`), `--project-id`/`--linked` — sem Docker — voltam a ser viáveis e esta recomendação merece ser reaberta.