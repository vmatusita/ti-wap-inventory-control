# Runbook — operações de banco (Supabase)

Procedimento único para aplicar migrations e mudanças de banco neste projeto. Nasceu do item **A** do plano de dívida técnica (`docs/DIVIDA-TECNICA.md`) para tirar da cabeça o que hoje é conhecimento tribal (o "gate", o apply manual, as armadilhas).

## Quando usar este runbook

Use **sempre** que a mudança tocar o banco: nova migration, `create or replace` de função/trigger/view, `add value` de enum, RPC nova, policy de RLS, alteração de dado em produção. Não use para mudança só de código — essa vai pelo deploy normal da Vercel.

**Pare e leia antes de rodar qualquer coisa** se a mudança contiver `delete from public.ativos` ou `delete from public.movimentacoes`: ela bate no *gate* (abaixo) e o caminho é outro.

## Pré-requisitos e acessos

| Precisa de | Para quê | Quem tem |
|---|---|---|
| **MCP Supabase** conectado | `apply_migration`, `execute_sql`, `get_advisors`, `list_migrations` | o agente, na sessão |
| **SQL Editor** do projeto de produção | migrations que batem no gate (caminho B) | só o Johnny |
| `.env.local` apontando para **DEV** | rodar `db:seed`/`db:reset` sem risco | qualquer dev |

Não existe Supabase CLI local apontando para produção — toda operação em prod passa por MCP ou pelo SQL Editor. A CLI local está linkada ao projeto de **ensaio**.

## O caminho, em 30 segundos

1. Escreva a migration em `supabase/migrations/NNNN_*.sql` (nunca edite uma já aplicada).
2. **Tente sempre o caminho A primeiro** (o agente aplica via MCP), mesmo que o corpo contenha `delete from ativos/movimentacoes` — medido repetidas vezes que a DEFINIÇÃO de função não dispara o classificador (emenda F56 da seção "O gate", abaixo). Só recue para o caminho **B** (humano no SQL Editor) se o MCP **de fato recusar** o apply.
3. Aplique em **ensaio primeiro**, sempre.
4. Rode a **verificação pós-apply** (assinatura, grants, contagens antes = depois).
5. Mexeu em função/trigger/RPC/enum? Rode **TODOS** os roteiros de `supabase/tests/*.sql`.
6. `notify pgrst, 'reload schema';` se mudou assinatura de RPC ou colunas.
7. Só então aplique em produção — e repita 4→6.
8. Migration que muda o que o código novo usa: **SQL antes do deploy** da Vercel. *(Emenda F60, 17/09/2026:)* e o que o
   código VELHO ainda usa — `drop` de assinatura, view que muda o plano do que a versão no ar lê — vai **depois** do
   deploy, pela receita de "A janela do `drop`", abaixo.

## Topologia

| Papel | Projeto Supabase (ref) | Uso |
|---|---|---|
| **Produção** | `pbtjcalbmepmrqzprusb` | dados reais da WAP (go-live 15/07/2026) |
| **Ensaio** | `sgmvldiizsrjbxzzpmhh` | rehearsal — a Supabase CLI local está linkada a ESTE |

Operações de banco são feitas **via MCP Supabase** (o ambiente não tem CLI local apontando para produção). O `supabase/schema.sql` é histórico (banner no topo) — a verdade são as migrations em `supabase/migrations/`.

> **Esta tabela tem consumidor no código.** `scripts/env-guard.ts` mantém a lista `REFS_DE_PRODUCAO`, que faz `npm run db:seed` / `npm run db:reset` **recusarem** qualquer ref de produção, independentemente do que estiver no `.env.local` (descoberto na F11, 22/07/2026: as guardas anteriores só conferiam se `SEED_PROJECT_REF` **batia com a URL** — consistência, não identidade —, e ambos apontavam para produção). **Projeto de produção novo entra nesta tabela E naquela lista, no mesmo commit.** Um ref de produção que não esteja lá volta a ser um alvo válido para o seed de dados fictícios.

## O "gate" do modo automático

**⚠ Emenda F56 (14/09/2026) — corrigido contra o comportamento MEDIDO três vezes.** O parágrafo abaixo descreve o que esta seção afirmava até a F55: que o classificador barra a `create or replace function` cujo corpo contém `delete from public.ativos`/`delete from public.movimentacoes`. **Isso é mais forte do que o comportamento real.** Três medições independentes — as migrations `0048` e `0064` (Anexo A) e uma sonda dedicada (`execute_sql` com a string dentro de um `if false then`, ata de 09/09 em `docs/DECISOES.md`) — mostram que `apply_migration`/`execute_sql` via MCP **não dispara** o classificador para a DEFINIÇÃO da função: o corpo é gravado, não executado, no momento do apply. O que pode disparar o gate é a EXECUÇÃO real do `delete` — chamar a RPC de verdade —, nunca redefini-la. Na prática, isso significa: **o agente aplica estas migrations pelo MCP**, como qualquer outra, com a MESMA verificação pós-apply (abaixo); "humano no circuito" continua valendo para quem *usa* a função (o botão "Substituir tudo" tem confirmação digitada e é só de admin), não para quem a *publica*. A `0139` (F56, aditiva, sem `delete`) e a `0140` (F56, recria `importar_ativos_substituir` — TEM `delete from public.ativos` no corpo) seguem este caminho corrigido: a `0139` já foi aplicada assim em **ensaio e produção** (`docs/f56-evidencias/P1-apply-0139-ensaio.txt` e `P3-apply-0139-producao.txt`); a `0140` também, em **ensaio e produção** (`P2-apply-0140-ensaio.txt`, com o rollback ensaiado logo em seguida, e `P5-apply-0140-producao.txt`, com a sonda de paridade nas 11 classes depois).

O texto original, mantido como registro do que se acreditava até aqui: *"O classificador do modo autônomo bloqueia qualquer DDL cujo corpo contenha `delete from public.ativos` ou `delete from public.movimentacoes` (via `apply_migration`/`execute_sql` do MCP) — em qualquer projeto, prod ou ensaio. Na prática isso atinge só a RPC destrutiva do import (`importar_ativos_substituir`, migrations 0031–0037, 0040). O objetivo é impedir que o agente rode uma exclusão de acervo sem um humano no circuito."*

**Consequência prática, agora:** a seção "Divergência" abaixo (ledger sem `0031`-`0037`/`0040`/`0048`) documenta um estado HISTÓRICO — dessas migrations aplicadas de fato à mão, antes de o comportamento real do gate ter sido medido. Migration nova nesta cadeia (a partir da F56) é aplicada pelo agente e **é** registrada em `supabase_migrations.schema_migrations`, como qualquer outra. Se uma execução real da RPC algum dia disparar o classificador (nunca medido até aqui), o caminho B abaixo — humano no SQL Editor — continua sendo o plano B.

## Aplicar uma migration

### A) Migration NÃO-destrutiva (não toca `delete from ativos/movimentacoes`)
O orquestrador aplica direto via MCP (`apply_migration`) em **ensaio primeiro**, depois produção; confere com `get_advisors` + um smoke só-leitura. Registrada no ledger normalmente.

### B) Migration DESTRUTIVA / que recria a RPC de import (bate no gate)

**⚠ Desde a F56, este caminho só entra em cena se o classificador REALMENTE bloquear o apply** (nunca medido acontecendo até aqui — ver a emenda da seção do gate, acima). O primeiro passo, sempre, é tentar o caminho **A** (o agente aplica direto via MCP): se `apply_migration`/`execute_sql` recusar, **aí sim** siga o fluxo abaixo. Fluxo humano-no-circuito (o que se fazia por padrão até a F55, quando a régua era "toda migration com `delete from ativos/movimentacoes` bate no gate"):
1. **Migration no repo** (`supabase/migrations/NNNN_*.sql`) — fonte da verdade versionada. Recriações de função por `create or replace` PURO (assinatura idêntica → sem overload).
2. **SQL de handoff** em `scratchpad/` (cópia rodável + bloco de conferência).
3. **Diff-review**: o diff da nova migration vs a anterior deve ser **só a mudança pretendida** (ex.: "diff 0040 vs 0037 = só a guarda p_contagens"). Qualquer outra diferença é bug. Revisão adversarial byte-a-byte antes do merge.
4. **Johnny roda no SQL Editor de produção** após conferir.
5. **Verificação pós-apply OBRIGATÓRIA** (fecha a armadilha do "arquivo errado" — na F7E o editor rodou a 0033 no lugar da 0034 por engano):
   ```sql
   -- a função ficou com a assinatura certa e SEM overload?
   select p.oid::regprocedure::text
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'importar_ativos_substituir';
   -- esperado: EXATAMENTE 1 linha, 4 args (jsonb, text, jsonb, jsonb)

   -- o grant está certo? (anon/service_role NÃO devem ter execute)
   select r.rolname, has_function_privilege(r.rolname,
     'public.importar_ativos_substituir(jsonb,text,jsonb,jsonb)', 'execute')
   from (values ('anon'),('authenticated'),('service_role')) r(rolname);
   -- esperado: authenticated=true, anon=false, service_role=false
   ```
6. **Recarregar o cache do PostgREST**: `notify pgrst, 'reload schema';` (senão a API não enxerga a nova assinatura).
7. **Smoke só-leitura de produção** (ver o padrão nas atas de F7* em `docs/DECISOES.md`).

## `security definer` — três exigências que não se negociam (F52)

Uma função `security definer` roda como o **dono** e **passa por fora de toda policy de RLS**.
As policies não a alcançam, então a autorização dela **tem de ser interna** — não existe
segunda linha. Estas três valem para toda `security definer` nova ou recriada, e a terceira é
a que a F52 acrescentou.

1. **Autorização por dentro, antes de qualquer efeito.** A guarda de cargo (`e_admin()`,
   `e_dev()`, `pode_escrever()`, `exigir_dev_para_destruir()`) vem **antes** da primeira
   escrita, da primeira trava e da primeira leitura que o chamador possa influenciar. Mover uma
   guarda para depois de um `lock` muda a ordem em que a recusa acontece — e num botão
   destrutivo isso é a diferença entre "recusado" e "recusado com o acervo já travado".

2. **Privilégio explícito, e mínimo.** `revoke all … from public, anon, service_role` sempre; e
   `grant execute … to authenticated` **só** se a função for API de verdade. Auxiliar chamada
   por `perform` de dentro de outra `security definer` **não precisa de grant nenhum** — ela
   roda como o dono. A palavra `public` no `revoke` é obrigatória: sem ela o revoke de `anon` é
   no-op (medido na F50). ⚠ O padrão "abre na fase, fecha na fase seguinte depois do advisor"
   já aconteceu **duas vezes** (`0074`→`0078` e `0082`→`0088`). Nasça fechada.

3. **Toda `security definer` que receba id do cliente confere ESCOPO antes de qualquer efeito.**
   "Id do cliente" é qualquer parâmetro que aponte para um objeto do acervo ou uma conta:
   `uuid`, `uuid[]`, `smallint` de filial — **e `text` de caminho ou nome** (`p_backup_path`,
   `pode_escrever_arquivo_termo(p_nome text)`). O parâmetro `text` conta, e é justamente o que
   uma varredura ingênua esquece.

   O que é "conferir escopo": perguntar se **aquele objeto é de quem está chamando** — não só
   se quem chama tem patente. `e_admin()` responde "você é administrador?"; ela **não** responde
   "esta filial é sua?". As duas perguntas são diferentes, e é a segunda que falta quando um
   id vem do payload.

   A trava executável disso é `supabase/tests/definer_sem_tenant.sql`, e ela reprova **por
   função NOMEADA, nunca por prefixo**: as cinco RPCs de conta citam `exigir_gestao_de` e
   passariam verdes por um critério de prefixo `exigir_`. Exceção é **nominal**, com o motivo
   escrito e a migration que a criou **na mesma linha** — a mesma doutrina dos catálogos da F48.

   ⚠ **Nem toda função sem guarda no corpo é um furo.** `estorno_item_coerente` (`0068`) e
   `termo_ancora_coerente` (`0069`) recebem id do cliente e sozinhas não protegem nada: a
   autorização está **ANDada ao lado, na mesma expressão da policy**. Reprová-las seria reprovar
   código seguro — por isso a trava é híbrida (universo derivado do catálogo × lista nominal
   classificada), e não uma varredura de texto.

   E o inverso também existe: `pode_ler_arquivo_termo` (`0129`) recebe `p_nome text`, é
   alcançável por `authenticated`, e **ignora o parâmetro de propósito** — o corpo é só
   `papel_atual() is not null`. Isso é "todo logado ativo lê todo termo", intencional até a F67
   fechar por join. Nenhuma automação distingue "ignora de propósito" de "esqueceram": só uma
   decisão humana escrita.

## Rollback — a regra geral

Toda migration entra com o rollback **escrito antes do apply**, no rodapé do próprio arquivo. O histórico do anexo A mostra que ele quase sempre cai num destes quatro moldes:

| A migration é… | O rollback é | Perde dado? |
|---|---|---|
| **Aditiva** (coluna, tabela, índice, RPC nova) | `drop` do que ela criou | Não — nada do acervo |
| **Recriação de função/view** (`create or replace` puro) | `create or replace` de volta ao **corpo da migration anterior** | Não |
| **Substituição de assinatura** (função de nome novo + `drop` da velha, em arquivos separados — F60) | Antes do `drop`: reverter o app, depois `drop` das novas. Depois do `drop`: recriar a velha com o corpo VIVO do arquivo **e os grants**, `notify pgrst, 'reload schema'`, e só então reverter o app — ver "A janela do `drop`". ⚠ "Reverter o app" **nunca** é `git revert` do merge inteiro (tiraria do repositório as migrations já aplicadas) | Não |
| **`add value` de enum** | Não há — mas o valor é inócuo enquanto ninguém o usa | Não |
| **Toca dado** (`update`/`delete` de linhas) | O comando inverso, **a partir do backup das linhas** | Só se o backup falhar |

Três exigências que não se negociam:

1. **Confira o corpo vigente ANTES de recriar uma função.** O rollback de um `create or replace` é o corpo anterior — se ele já tinha drift em relação ao repo, você reverte para algo que nunca existiu. O jeito de conferir é `pg_get_functiondef` (ver "Conferir o estado do banco").
2. **Operação que toca dado exporta backup antes** (linhas em `scratchpad/`, ou o jsonb/arquivo que as RPCs destrutivas já gravam sozinhas) e confere **contagens antes = depois**.
3. **Rollback que reabre um furo de segurança só faz sentido junto do rollback completo da fase.** Várias entradas do anexo A dizem isso explicitamente — desfazer só a policy deixa o sistema pior que antes da migration.

## A janela do `drop` — receita (F60, 17/09/2026)

**Quando usar:** sempre que uma função chamada pelo app for SUBSTITUÍDA por outra de nome novo — a assinatura muda
de um jeito que `create or replace` não aceita (outro tipo de parâmetro, outra coluna de retorno) — e a velha tiver
de sair do banco. A F60 escreveu esta receita para as sete `rel_*` (`p_filial smallint` → `rel_*_filiais(p_filiais
smallint[], …)`); a virada multiempresa vai usá-la de novo.

**Por que existe.** O app no ar e o banco mudam em momentos diferentes. A criação das funções novas vai ANTES do merge
(nada da versão no ar as chama); a remoção das velhas só pode vir DEPOIS de o app novo estar no ar e de ninguém mais as
chamar. `drop` com o app velho no ar é **404 do PostgREST** na cara de quem opera. E o Postgres **não registra
dependência de CORPO de função**: `drop function` nunca avisa quem quebrou — a prova de que ninguém chama tem de vir de
fora, e vem do `pg_stat_statements`, que separa por papel e não lê dado (`track_functions = none` nos dois bancos:
`pg_stat_user_functions` fica vazia e não serve).

**As migrations:** criação e `drop` em ARQUIVOS SEPARADOS, as duas na `main` pelo mesmo PR. No CI e no ENSAIO elas rodam
na ordem da cadeia (o ensaio não tem app de produção: lá o `drop` não espera deploy). Em PRODUÇÃO, a de `drop` é a
última coisa, depois dos passos abaixo. `drop function` **sem** `if exists` e **sem** `cascade`: uma velha que não
existe é apply fora de ordem, e uma dependência que apareça tem de falhar alto.

**O canal.** O caminho A de sempre (o MCP da Supabase, `apply_migration`/`execute_sql`). Sem MCP na sessão, há o PADRÃO
da `0131`/`0132` — **um padrão a reescrever na hora, não um script do repositório**: o de 09/09/2026 foi escrito ad hoc e
nunca versionado (nenhum arquivo de `scripts/` faz apply de migration). Ele lia o arquivo, conferia o sha256 contra
`migrations.lock.json` e fazia um POST a `database/query` da Management API com o `SUPABASE_ACCESS_TOKEN` que JÁ estava no
processo — e, desde a F55, esse token não mora mais no `.env.local` (`docs/f56-handoff/medicoes/R-runbook-apply.md`, Fato
31): sem ele já no ambiente — nunca procurado —, o padrão não existe. Sobra o caminho B (o SQL Editor, colando o arquivo
inteiro, com a verificação pós-apply conferindo o `md5` do `prosrc`). Sem nenhum dos caminhos, nada desta receita começa —
e o PR que chama as funções novas não é mergeado (foi o repouso da própria F60, ata (j) de 17/09/2026 em `DECISOES.md`).
*(Corrigido na revisão final da F60, 17/09/2026: o texto apresentava "o caminho da `0131`" como script pronto.)*

### Os passos

1. **Pré-condição, só leitura.** Deploy `READY` na Vercel; `/api/saude` responde a versão nova E o commit do merge;
   `node scripts/smoke/smoke-prod.mjs` com 0 falha (a Parte B já chama as funções novas). Peça a quem estiver com o
   sistema aberto que **recarregue a página**: uma aba de antes do deploy pode seguir presa ao código velho (Skew
   Protection), e o `pg_stat_statements` não enxerga aba parada — só a chamada que ela fizer.

2. **Leitura T0** — velhas e novas, por papel. O PostgREST cita a função **entre aspas** (`"public"."rel_resumo"(`), e é
   a aspa de fechamento que separa `"rel_resumo"(` de `"rel_resumo_filiais"(`. Saem só papel, chamadas e número de formas
   de statement — **nunca o texto do statement**. Rode como `postgres` (MCP `execute_sql` ou SQL Editor); troque a lista
   `values` pelos nomes da vez:

   ```sql
   select jsonb_build_object(
     'agora',       now(),
     'dealloc',     (select dealloc from pg_stat_statements_info),
     'stats_reset', (select stats_reset from pg_stat_statements_info),
     'por_papel', coalesce((
       select jsonb_agg(x order by x.nome, x.papel) from (
         select n.nome, r.rolname as papel, sum(s.calls) as chamadas, count(*) as formas_de_statement
           from pg_stat_statements s
           join pg_roles r on r.oid = s.userid
           cross join (values
             -- as VELHAS
             ('rel_estoque_asof'), ('rel_saldo_itens'), ('rel_mov_itens'), ('rel_frescor_itens'),
             ('rel_mov_por_mes'), ('rel_por_motivo'), ('rel_resumo'),
             -- as NOVAS
             ('rel_estoque_asof_filiais'), ('rel_saldo_itens_filiais'), ('rel_mov_itens_filiais'),
             ('rel_frescor_itens_filiais'), ('rel_mov_por_mes_filiais'), ('rel_por_motivo_filiais'),
             ('rel_resumo_filiais'), ('rel_contagem_status_filiais')
           ) as n(nome)
          where s.query ~ ('"' || n.nome || '"\s*\(')
            and r.rolname in ('authenticated', 'service_role', 'anon')
          group by n.nome, r.rolname
       ) x), '[]'::jsonb)
   ) as janela;
   ```

   Grave a resposta inteira (é só número) fora do repositório; ela entra na evidência da fase.

3. **Tráfego real com o app novo:** `node scripts/perf/medir.mjs` (a sessão do operador; o visualizador só se uma senha
   ativa for resolvida) e `node scripts/smoke/smoke-prod.mjs`. É o que garante que o Δ das NOVAS sai positivo — sem ele,
   "velhas = 0" num fim de tarde vazio não prova nada.

   ⚠ **O papel `service_role` (o visualizador por senha) quase nunca tem tráfego nesta janela, e Δ = 0 ali NÃO prova
   ausência de chamador.** `medir.mjs` só acrescenta as rotas do visualizador com `VIEW_SESSION_SECRET` E uma senha de
   acesso ativa resolvida (nem a F59 nem a F60 a resolveram — `PLAN-F60.md` §3.7), e `smoke-prod.mjs` não tem caminho de
   visualizador. Por isso a prova desse papel é ESTÁTICA, rodada antes do T1, e as duas partes têm de valer:
   - nenhum chamador das velhas pelo nome no código — tem de sair VAZIO (as exclusões são os instrumentos de medição, que
     citam as velhas de propósito, e o gerador histórico da `0134`):

     ```bash
     git grep -nE "['\"]rel_(estoque_asof|saldo_itens|mov_itens|frescor_itens|mov_por_mes|por_motivo|resumo)['\"]" -- 'src/**' 'scripts/**' ':!**/*.test.*' ':!scripts/perf/**' ':!scripts/db/gerar-0134.mjs'
     ```

   - `npx vitest run src/lib/queries/relatorios/fronteira-viewer.test.ts` verde — a lista branca da superfície que o
     client do visualizador (`resolverAcessoRelatorio`) alcança só pode citar as sete `_filiais` (a catraca `RPCS ≤ 7`).

   *(Acrescentado na revisão final da F60, 17/09/2026: o critério (b) aceitava Δ = 0 em `service_role` pela simples falta de
   tráfego.)*

4. **Espera de ao menos 30 minutos** entre o T0 e o T1, com o app novo no ar.

5. **Leitura T1** — o MESMO SQL.

6. **O critério — o `drop` só acontece se os quatro valerem:**
   - **(a)** Δ chamadas das VELHAS = **0** em `authenticated`, `service_role` **e** `anon` entre T0 e T1 (entrada que
     não existe em T0 e existe em T1 é Δ > 0);
   - **(b)** Δ das NOVAS **> 0** em `authenticated`; em `service_role`, Δ = 0 das novas só é aceitável se nenhum
     tráfego de visualizador foi gerado **E** a prova ESTÁTICA do passo 3 passou (o `git grep` vazio e
     `fronteira-viewer.test.ts` verde) — o Δ = 0 das velhas ali, sozinho, é falta de tráfego, não ausência de chamador;
   - **(c)** `dealloc` **igual** em T0 e T1 — se mudou, o `pg_stat_statements` despejou entradas para caber no
     `pg_stat_statements.max`, uma entrada de velha pode ter sido despejada e recriada no meio, e Δ = 0 não prova nada:
     repita a janela;
   - **(d)** `stats_reset` **igual** em T0 e T1 — um reset no meio zera os contadores e o Δ sai zero ou negativo sem
     provar nada: repita a janela. *(Os rodapés da `0143`/`0145` listam três condições; esta, a quarta, vale igual.)*

7. **Apareceu chamador numa velha: NÃO derrube.** Identifique pelo PAPEL e pela contagem de formas de statement — nunca
   pelo texto: `authenticated` com forma nova é aba de antes do deploy ou deploy anterior ainda servindo (peça o
   recarregamento, confira na Vercel que não há deploy antigo promovido); `service_role` é visualizador por senha preso
   ao código velho, ou script (`scripts/**` com `db.rpc` direto — `git grep` pelo nome velho); `anon` não devia aparecer
   (a 6a de `catalogo_secdef.sql` garante que `anon` não tem EXECUTE, e a chamada dele morre em erro de permissão antes
   de executar) — Δ de `anon` > 0 é grant errado, e é achado por si. Espere, e releia a partir do passo 2. **O que NÃO
   conta como chamador:** as leituras da própria sessão de apply (papel `postgres`, fora do filtro) e os blocos de
   medição da fase, que citam as funções SEM aspas e terminam em `raise exception` — a expressão regular não os casa.

8. **Aplicar** (a migration já está na `main`), pelo canal acima, nesta ordem na F60: a `0144` (a view de colaboradores,
   que também espera o deploy, com a sonda de conjunto imediatamente antes e depois) e a `0145` (o `drop`).

9. **Depois do `drop`, só leitura:**
   - `notify pgrst, 'reload schema';` — senão o cache do PostgREST continua anunciando as velhas;
   - a prova de AUSÊNCIA, uma linha por velha, esperado `null` nas sete:

     ```sql
     select a.assinatura, to_regprocedure(a.assinatura) as ainda_existe
       from (values
         ('public.rel_estoque_asof(smallint, date)'),
         ('public.rel_saldo_itens(smallint, date)'),
         ('public.rel_mov_itens(smallint, date, date)'),
         ('public.rel_frescor_itens(smallint, date)'),
         ('public.rel_mov_por_mes(smallint, date, date)'),
         ('public.rel_por_motivo(smallint, date, date)'),
         ('public.rel_resumo(smallint, date, date)')
       ) as a(assinatura);
     ```

   - e a de PRESENÇA das novas (uma assinatura cada, grants da criação — a verificação pós-apply da `0143`/`0141`);
   - `node scripts/smoke/smoke-prod.mjs` outra vez, com 0 falha;
   - a sonda de paridade ensaio × produção ("Sonda de paridade ensaio × produção", abaixo) — as classes `func` e
     `grant_func` têm de bater, com as velhas fora nos DOIS bancos.

10. **O classificador barrou o `drop`:** registre, **não reformule**, e siga. O merge já aconteceu; as velhas ficam em
    produção — ninguém as chama, e o comportamento delas é o de antes —; o `drop` vai para o topo do relatório da fase
    com o comando, para o Johnny rodar no SQL Editor (caminho B). É o único repouso com pendência aceitável.
    Desde a v1.66.3 (reauditoria de 18/09/2026, item AE) a **Parte B do `saude.yml`** compara o ledger com o
    repositório uma vez por dia, e uma migration ≥ `0146` que fique mais de 24 h na `main` sem aparecer no ledger
    abre alarme (`docs/RUNBOOK-ALARME.md`, "A deriva de migrations"). Mesmo assim, escreva a pendência: o alarme
    só dispara depois da tolerância, e até lá a janela aberta não acende nada. (Até a F60 não havia checagem
    nenhuma, nem no `/api/saude` nem no smoke.)

### Voltar atrás

A ordem é a INVERSA da de apply, e o `drop` é a parte que um `create or replace` não desfaz: **antes** do `drop`,
reverte-se o app e só então se derrubam as novas; **depois** do `drop`, recriam-se as velhas (corpo VIVO lido do
arquivo, com os grants — função recriada do zero não os traz), `notify pgrst, 'reload schema'`, e só então se reverte o
app.

⚠ **"Reverter o app" NÃO é `git revert` do merge inteiro.** O merge leva junto as migrations já aplicadas, o
`supabase/migrations.lock.json`, os roteiros e as listas de `src/lib/itens/migrations-f38.test.ts`: revertê-lo tiraria do
repositório o que o banco TEM, a cadeia do CI deixaria de construir o banco de verdade, e a migration de reversão não
teria o que derrubar no CI. Reverter o app é um PR que desfaz os commits que mudaram os CHAMADORES (as queries, a porta
`src/lib/supabase/rpc.ts`, os componentes, os scripts que chamam as funções) e redeploy — mantendo `supabase/**` intacto
e o `src/lib/types/database.ts` conhecendo toda assinatura viva no banco de destino (o gate de deriva só reprova o que o
banco tem e o arquivo não). O CI desse PR diz o que mais ficou incoerente; nada se desliga para ele passar. A receita da
F60, passo a passo, está na entrada dela no Anexo A. *(Os rodapés da `0143` e da `0145` diziam "`git revert` do merge"; desde
`5094f6f` dizem "nunca `git revert` do merge inteiro", com o atalho "os commits de `src/`/`scripts/`". O escopo exato é o
deste parágrafo, que prevalece: um commit da fase que mistura `supabase/**` com `src/**` — `b5c4587` leva a `0143`–`0145`,
o lock E as listas de `src/lib/itens/migrations-f38.test.ts` — desfaz-se por TRECHO, nunca por `git revert <sha>` inteiro:
tirar `0143`–`0145` de `DA_F38` com os arquivos ainda no disco reprova "nenhuma migration a partir da 0116 fica de fora
da lista". Corrigido na revisão final da F60, 17/09/2026.)*

## O rollback da F62 — a cópia de volta PRIMEIRO (22/09/2026)

**Quando usar:** depois do apply das `0152`→`0158`, se a impressão do acesso "depois" divergir da "antes" em qualquer
combinação, ou se alguém perder ou ganhar acesso por causa da troca do cargo. Em **produção**, o rollback é **imediato**
(ordem F62: "cópia de volta primeiro, antes do diagnóstico") — o diagnóstico vem depois, no ensaio.

**Por que a ordem não é livre.** Depois do apply, o cargo VIVO é o de `membros`; `profiles.papel`/`ativo` ficaram
congelados no minuto do apply. Quem foi desligado, rebaixado ou promovido depois só aparece em `membros`. Desfazer as
funções sem copiar antes faz `papel_atual()` voltar a ler a coluna congelada — e **um desligado volta a entrar**, em
silêncio. O roteiro `supabase/tests/f62_rollback.sql` prova os dois caminhos no CI a cada push (rb1: com a cópia, a
impressão de todo perfil volta idêntica; rb2: sem ela, o desligado recupera o cargo).

**Os dois arquivos** (em `supabase/rollback/`, fora de `migrations/` — não entram no ledger nem na trava de hash):

| passo | arquivo | o que faz | seguro com o app novo no ar? |
|---|---|---|---|
| 1 | `F62-1-copia-de-volta.sql` | trava `membros` contra escrita (SHARE ROW EXCLUSIVE, até o fim da transação) e copia `papel`/`ativo` de `membros` (empresa legada) para `profiles`, só onde diverge, com a janela `estoque.gestao_usuarios` (sem ela, `profiles_guarda_dev` recusa mexer num dev) e a marca `estoque.cargo_congelado` (sem ela, a guarda da 0158 recusa gravar a coluna congelada pela janela) | **sim** — o app novo não lê a coluna congelada |
| 2 | `F62-2-desfaz.sql` (GERADO; a mesa reprova se divergir do corpo vigente de antes) | reemite as dez funções com o corpo de antes, derruba o que a F62 criou na ordem inversa (`0157` → `0152`), devolve `handle_new_user` ao corpo da `0057`, `notify pgrst` | **não** — derruba `membros`, que o app novo lê |

**A receita:**

0. **Foto de antes do rollback**: `docs/f62-evidencias/impressao-acesso.sql` no banco (só agregados e md5 — nunca id,
   nome ou e-mail). É contra ela que o passo 4 confere.
1. **A cópia** (`F62-1-copia-de-volta.sql`, pelo conector, o arquivo inteiro). Conferir: `0` perfis com `(papel, ativo)`
   diferente entre `profiles` e a membership na empresa legada.
2. **O app.** Se o app da F62 **já está no ar**, voltar para o deploy anterior ao merge (Vercel: promover o deployment
   anterior) **antes** do passo 3 — o app velho lê a coluna que o passo 1 acabou de acertar. **Nunca** `git revert` do
   merge inteiro: tiraria do repositório as migrations já aplicadas. Se o apply foi antes do merge (a janela normal da
   fase), não há o que voltar.
3. **O desfazer, COM A CÓPIA DE NOVO:** `F62-1-copia-de-volta.sql` seguido de `F62-2-desfaz.sql`, os dois no MESMO
   `execute_sql` (uma transação só). Entre o passo 1 e este as RPCs ainda gravam em `membros` (só o desfazer as devolve a
   `profiles`): a cópia refeita pega essa troca de cargo, e a trava que ela põe em `membros` faz a troca que chegar
   DURANTE o desfazer esperar e FALHAR depois do `drop` — em vez de sumir com a tela dizendo "feito". *(Achado da revisão
   adversarial da F62, 22/09/2026: rodar o desfazer sozinho perdia essa janela.)*
4. **Conferir**: a impressão do acesso de novo — igual à do passo 0, combinação a combinação e no md5 global; `membros`,
   `empresas`, `plataforma_admins` ausentes; `operador_filiais` com a PK `(usuario_id, filial_id)`; `papel_atual()` lendo
   `profiles` (md5 do `prosrc` = o da `0073`); `get_advisors(security)` sem achado novo.
5. **No repositório**: a reversão vira migration NOVA (nunca editar as `0152`→`0158`), com as travas da F62
   reconciliadas no mesmo commit (`cargo-em-membros.test.ts`, `cargo_em_membros.sql`, `cargo_equivalencia.sql`,
   `isolamento_tenant.sql`, `k_secdef`/`k_infra`/`k_policies_public` dos catálogos, as mutações `f62-*`) e a ata em
   `DECISOES.md`.

**Ensaio primeiro** quando houver tempo; em emergência de produção, a cópia vai direto — ela é idempotente e não
derruba nada.

⚠ **Desde a F63 (23/09/2026), o rollback da F62 exige o da F63 ANTES** — a ordem inversa do apply entre fases. A F62
derruba `empresas` e `empresa_legada()` sem `cascade`, e a F63 pendurou nelas oito FKs e oito defaults: rodar
`F62-2-desfaz.sql` com a F63 no banco recusa. Receita "O rollback da F63", abaixo; o roteiro `f62_rollback.sql` já roda
`F63-desfaz.sql` antes dos dois caminhos.

## A disciplina de backup de migração (F63, 23/09/2026)

A F63 criou três peças: o cabeçalho de classe OBRIGATÓRIO, o classificador que o confere contra o que o arquivo
executa, e a tabela `public.backups_migration`, onde toda migration que sobrescreve dado vivo guarda antes o valor
antigo. Até a F62 isso era protocolo à mão (a `0111` guardou o backup das linhas FORA do repositório); agora é trava.

### A classe e o classificador

- Todo arquivo a partir da `0159` começa com `-- classe: ADITIVA | BACKFILL | DESTRUTIVA` (um só). A classe mede o
  risco sobre DADO que já existia: **ADITIVA** cria, comenta, concede, indexa, acrescenta coluna com default sem
  reescrita, escreve SÓ em tabela criada na mesma migration; **BACKFILL** faz `update`, `insert … on conflict do update`
  ou `insert` em tabela que já existia; **DESTRUTIVA** faz `delete`, `truncate`, `drop table`, `drop column`,
  `alter column … type`, `drop … cascade`, ou TROCA o que um nome aponta: `rename`/`set schema` de uma tabela que já
  existia, ou `rename column` dela (a cópia transformada que assume o nome é uma reescrita sem `update`). A declarada nunca é MENOR que a calculada.
- O classificador é `scripts/db/classificar-migration.mjs` (sem dependência, sem banco): `node
  scripts/db/classificar-migration.mjs` confere os arquivos ≥ `0159`; com `--censo`, imprime a classe calculada da cadeia
  inteira. A trava de mesa é `src/lib/validators/migrations-backfill.test.ts`, e a guarda de topo de
  `src/lib/itens/migrations-f38.test.ts` lê pelo MESMO leitor.
- **O leitor é o do Postgres**: comentário (inclusive de bloco aninhado) só fora de texto e de dollar-quote; o corpo de
  `create function|procedure` é texto GUARDADO (sai); o corpo de `do` é código EXECUTADO (entra, e cada comando dele é
  classificado como se fosse de topo). Delimitador sem fecho LANÇA.
- **ILEGÍVEL reprova** a partir da `0159`: SQL dinâmico (`execute`), `call`, chamada no apply de função fora da lista
  fechada `FUNCOES_SEM_ESCRITA` (o leitor não vê o que ela faz), `add column` com default fora da lista fechada de
  não-voláteis, coluna gerada STORED, serial/identity em tabela existente, reescrita sem perda. Precisa de uma dessas?
  Separe em migration própria e declare o motivo na ata — o classificador não tem válvula.
- **Válvulas proibidas** em qualquer código executado (topo ou `do`): `set_config`/`set` de `estoque.dev_destrutivo`,
  `session_replication_role`, `alter table … disable trigger`. E sem `begin`/`commit` de topo: quem decide a transação é
  o apply.
- **O rodapé** traz o `ROLLBACK` escrito (depois do último comando).

### Receita: migration BACKFILL

Antes de CADA comando que sobrescreve valor de tabela que já existia, o bloco canônico — um por coluna alterada, na
forma EXATA abaixo (o classificador lê item a item):

```sql
-- classe: BACKFILL
insert into public.backups_migration (migration, tabela, coluna, chave, valor_anterior)
select '0170_exemplo.sql', 'public.x', 'status', t.id::text, to_jsonb(t.status)
  from public.x t
 where t.status = 'antigo';
update public.x t
   set status = 'novo'
 where t.status = 'antigo';
-- ROLLBACK (a partir de backups_migration):
--   update public.x t
--      set status = (jsonb_populate_record(null::public.x, jsonb_build_object('status', b.valor_anterior))).status
--     from public.backups_migration b
--    where b.migration = '0170_exemplo.sql' and b.tabela = 'public.x' and b.coluna = 'status' and b.chave = t.id::text;
```

- O literal `migration` é **exatamente** o nome do arquivo — o erro mais provável é copiar o bloco de outra migration e
  esquecer de trocar, o que faria o rollback restaurar as linhas de OUTRA migration. O classificador reprova.
- O `where` do bloco é **byte a byte** o `where` do comando (um espaço de diferença reprova; um `… or true` também). Para a
  tabela inteira: `where true` nos dois.
- `to_jsonb(<alias>.<coluna>)` é da MESMA coluna do literal `coluna`, o `from` é a MESMA tabela do comando, e o
  `<alias>` do valor e o da chave são o APELIDO dessa tabela do `from` — com um `join`, `to_jsonb(o.status)` guardaria a
  coluna homônima de outra tabela, e o classificador reprova.
- O rollback usa `jsonb_populate_record`: devolve o tipo certo (array, jsonb, enum) e o `null` (SQL NULL em
  `valor_anterior` quer dizer que o valor ERA null). Ensaiado por `supabase/tests/empresa_no_acervo.sql`, bloco 5.
- **Fora da receita, e por isso reprovados:** `merge` (não tem `where` verificável — escreva `update`), o backfill dentro
  de `do` (escreva no topo), a escrita aninhada num CTE. `insert` puro em tabela existente é BACKFILL sem par (não há
  valor anterior); o rodapé diz como apagar o que entrou.
- **O acervo tem uma trava a mais, sem válvula**: a guarda de topo de `migrations-f38.test.ts` reprova `update`/`delete`/
  `merge`/`truncate` em `movimentacoes`, `lancamentos_item` e `ativos`, e a TROCA delas (`rename`, `set schema`, `drop
  table`, outra tabela renomeada para o nome delas) — de topo OU dentro de `do` — **mesmo com classe declarada**. A única exceção é a `0133` (anterior à régua, nominal e fechada). Um backfill legítimo de `ativos` no
  futuro entra por **exceção nominal NOVA** em `EXCECOES_TOPO_NO_ACERVO`, com o motivo e a **decisão do Johnny** citados
  na linha — e isso exige mexer, de propósito, na asserção que impede a lista de crescer a partir da `0159`. Em
  `movimentacoes`/`lancamentos_item` o backfill nem roda: a `guarda_acervo` recusa UPDATE até do service role, e abrir a
  janela `estoque.dev_destrutivo` para isso é proibido.
- **Um valor anterior por célula, por migration** (`unique (migration, tabela, coluna, chave)`): o rollback devolve O
  valor de antes, sem ambiguidade. Duas passadas na MESMA coluna da MESMA tabela numa migration só funcionam com `where`s
  mutuamente exclusivos; se a segunda precisar tocar linha que a primeira já tocou, ela vai numa migration NOVA (com o
  par dela). No CI cada comando confirma sozinho: a segunda passada que colidir (`23505`) deixaria a primeira aplicada.
- **Retenção:** os pares ficam até uma migration DESTRUTIVA nomeada apagá-los — no mínimo 90 dias depois do apply em
  produção.

### Receita: `add column` sem reescrita (a coluna nova numa tabela viva)

1. `add column <c> <tipo> not null default <expressão não-volátil> [references …]` — num comando só. O PG 11+ guarda o
   valor no catálogo (`attmissingval`, `atthasmissing = true`) e NÃO reescreve tupla nem dispara gatilho. **Sem
   `update` de backfill** e **sem `set not null` separado**. Default aceito sem reescrita (a lista fechada do
   classificador): literal, `public.empresa_legada()`, `now()`, `current_timestamp`, `current_date`, `localtimestamp`,
   `transaction_timestamp()`, `statement_timestamp()`. Default volátil (`gen_random_uuid()`, `clock_timestamp()`,
   `nextval`) reescreve a tabela inteira.
2. **O lock**: ADD COLUMN toma ACCESS EXCLUSIVE; a FK toma SHARE ROW EXCLUSIVE na tabela referenciada e valida com uma
   varredura. `set lock_timeout = '2s';` no topo e `reset lock_timeout;` no fim — NÃO `set local` (o CI aplica cada
   comando solto, `psql -f` sem `-1`, e ali `set local` não vale), e sem `begin`/`commit`. Várias tabelas: na ordem em
   que o app toma os locks. Se o lock não vier: registrar e repetir, **no máximo três vezes em 30 min**; nunca subir o
   timeout, nunca matar sessão do app.
3. **As provas, nos DOIS bancos, com o MESMO texto antes e depois** (`docs/f63-evidencias/impressao-acervo.sql`):
   `pg_relation_filenode()` igual (nenhuma reescrita da tabela) e o md5 de `(id, xmin)` igual (nenhum update — o
   `relfilenode` sozinho NÃO vê um update: o MVCC grava a versão nova no mesmo arquivo; o `xmin` sobrevive ao freeze
   desde o PG 9.4). Em produção, o md5 pode diferir SÓ pela atividade do app entre as duas fotos (a `janela`: linhas com
   `xmin` a partir do corte do "antes"); `janela = linhas` é backfill. E, no catálogo, `atthasmissing = true`, a FK
   `convalidated`, o default preso à função pelo `pg_depend`.
4. **O rollback**: `drop column if exists` (sem reescrita; a coluna fica `attisdropped`).

### O rollback da F63 — e a ordem ENTRE fases

- **Quando:** o `relfilenode` mudou, o md5 de `(id, xmin)` divergiu além da janela, apareceu advisor não declarado que
  cita objeto da fase, ou o smoke/conferidor de formas recusou depois do apply. Em produção, **imediato**, antes do
  diagnóstico.
- **O arquivo:** `supabase/rollback/F63-desfaz.sql` — `0161` → `0160` → `0159` (a ordem inversa do apply), `drop column
  if exists` nas oito, e `backups_migration` só se estiver VAZIA (recusa com 55000 se houver par gravado: o rollback da
  migration que o gravou vem antes). Num banco vivo: o `execute_sql` do conector com o conteúdo EXATO do arquivo que o
  CI ensaia (`supabase/tests/f63_rollback.sql`, que prova o esquema das oito voltando à impressão de antes da `0159`) —
  a única escrita fora do `apply_migration`, e só num desfecho ruim. O ledger fica (a linha das três continua lá).
- **Entre fases:** o rollback de uma fase pressupõe o das fases DEPOIS dela. O da F62 exige o da F63 antes; o da F63
  exigirá o da F65 antes (quando a F65 pendurar FK composta e unique nas oito).

## Restauração — recolocar DADO a partir de um backup (F54, 09/09/2026)

**Rollback e restauração são coisas diferentes, e confundi-las custa caro.** Tudo o que está
acima trata de *reverter DDL* — desfazer o que uma migration criou. Esta seção trata de
*recolocar dado que uma operação destrutiva apagou*: o import de startup, o reset da Zona
destrutiva, o "apagar ativo" e a exclusão de conflito entre filiais.

> **Por que não o `restore` do Supabase.** Ele restaura o **projeto inteiro**. Hoje isso já é
> canhão para mosquito; no multiempresa levaria os outros clientes de volta ao ponto do backup.
> É por isso que a F73 (o piloto) depende do restaurador desta seção e não daquele botão.

### O que existe

| peça | onde | para quê |
|---|---|---|
| a ferramenta | `scripts/db/restaurar.mjs` | lê o backup, confere e aplica |
| a prova mecânica | `supabase/tests/restauracao.sql` | 13 asserções, rodam no `banco-sem-docker` |
| a prova ponta a ponta | `docs/f54-evidencias/12-ensaio-ponta-a-ponta.txt` | com `.docx` de verdade, no ensaio |

```bash
DATABASE_URL=postgresql://… node scripts/db/restaurar.mjs <backup.json>            # confere
DATABASE_URL=postgresql://… node scripts/db/restaurar.mjs <backup.json> --aplicar  # aplica
```

Sem `--aplicar` ele não escreve nada. **Ele recusa qualquer ref de produção**, nas duas formas
de `DATABASE_URL` (a direta, com o ref no host, e a do *pooler*, com o ref no nome de usuário —
que é a que o painel do Supabase oferece primeiro).

### A ordem de inserção

`ativos` → `movimentacoes` → `pendencias_item` → `lancamentos_item` → `anotacoes` → `termos_gerados`

Derivada das 24 FKs do acervo. As auto-FKs (`ativos.substitui_ativo_id`, `movimentacoes.estorno_de`,
`lancamentos_item.estorna_id`) **não são deferráveis**: inserir com a coluna nula e fazer `update`
depois. **Nenhuma FK do acervo tem `ON DELETE CASCADE`** — tudo o que some está escrito no corpo da
RPC, e por isso o backup consegue ser completo.

### As quatro armadilhas

Todas viraram asserção em `supabase/tests/restauracao.sql`. Estão aqui porque quem restaura às
três da manhã lê o runbook, não o roteiro.

**1. `movimentacoes.ordem` é `generated always as identity`** (F53). Sem `overriding system value`
o INSERT é **recusado**. Esta é a armadilha boa: falha alto e cedo.

**2. …e `overriding system value` NÃO avança a sequência.** Sem `setval` depois, a **primeira**
movimentação registrada após a restauração viola `movimentacoes_ordem_uidx`. Esta é a ruim: falha
baixo e tarde, na cara do operador, dias depois, longe do restore.

```sql
select setval(pg_get_serial_sequence('public.movimentacoes','ordem'),
              coalesce((select max(ordem) from public.movimentacoes), 1), true);
```

⚠ Ela só morde de verdade quando a sequência do banco de destino está **atrás** — projeto novo,
outro ambiente, o piloto. Restaurar no mesmo banco não expõe o defeito, então não confie em ter
visto passar.

**3. `trg_aplicar_movimentacao` é BEFORE INSERT e faz DUAS coisas.** Recalcula `ativos.status` *e*
**insere `pendencias_item` sozinho** numa `devolucao` com itens faltantes. Restaurar com ele ligado
não é "deixar a máquina de estados derivar": é **duplicar** a pendência que o backup já traz
(medido — cenário 3c). Desligue-o dentro da transação:

```sql
alter table public.movimentacoes disable trigger trg_aplicar_movimentacao;
-- … os inserts …
alter table public.movimentacoes enable trigger trg_aplicar_movimentacao;
```

**4. `set constraints all immediate` é obrigatório antes do `alter table` — e o modo tem de VOLTAR.**
`pendencias_item.movimentacao_id` é a **única** FK `DEFERRABLE INITIALLY DEFERRED` do acervo. Com
eventos de constraint pendentes, o Postgres recusa o `alter table … disable trigger` com
`55006: cannot ALTER TABLE … because it has pending trigger events`.

E a segunda metade, que é a que pega: **`set constraints all immediate` vale para o resto da
transação**, e o caminho **normal** de escrita depende do modo deferido — `aplicar_movimentacao`
insere `pendencias_item` apontando para `new.id`, uma linha de `movimentacoes` que ainda não
existe. Com a FK imediata, isso vira `23503` para quem só registrou uma devolução. **Devolva o
modo antes de soltar o banco para uso normal.**

> As duas metades da armadilha 4 foram descobertas **rodando**, não lendo — a primeira derrubou o
> roteiro, e a segunda derrubou o roteiro de novo, um passo depois.

### E os `.docx`? (o que a F54 consertou)

Desde a F54 os documentos de responsabilidade são **copiados para o backup antes** de saírem do
bucket `termos`, e **não são removidos se a cópia falhar**. Eles moram em:

```
<caminho do backup sem o .json>/termos/<arquivo>.docx     ← import, reset, conflito acima de 25
ativo/<id do ativo>/termos/<arquivo>.docx                  ← apagar ativo
conflito/<digest da seleção>/termos/<arquivo>.docx         ← conflito abaixo de 25
```

A raiz é sempre **derivável** do que a RPC já gravou na própria transação — não há manifesto nem
evento novo para consultar (nem para falhar). Restaurar um `.docx` é baixá-lo dali e subi-lo de
volta em `termos/<arquivo>.docx`, com o mesmo nome.

### Quando o backup não tem o que você quer restaurar

Leia o `nao_incluido` do cabeçalho — o `restaurar.mjs` **imprime** esse campo, não o ignora. E note
a diferença que a saída faz questão de mostrar:

- **`versao: 0`** (backups do reset anteriores à F54) — o arquivo **não declara os próprios limites**
  e a conferência de contagens **não foi feita**. Isso não é o mesmo que "está completo".
- **`nao_incluido: []`** — o backup se declara completo para o que aquela operação apaga.

Se o que falta for uma tabela que a RPC apagou e o exportador não leu, **não invente**: o dado não
está no arquivo. O caminho é a trilha (`eventos_admin`, que guarda o backup em jsonb para as
exclusões pequenas) ou o `import_logs`.

## Roteiros de teste SQL — rode TODOS ao mexer em função/trigger (regra nova, F17)

**Mudou uma função, um trigger, a máquina de estados ou uma RPC (qualquer `create or replace` de função, ou um `add value` de enum que muda comportamento)? Rode TODOS os roteiros de `supabase/tests/*.sql` antes do push — não só o roteiro novo da fase.**

**Mudou ou criou uma policy?** Ela passa pela doutrina do predicado (emenda F59 da `MATRIZ-REGRAS.md`, R-ACC-63 em diante): `src/lib/validators/policies-initplan.test.ts` a julga na mesa, e o bloco 4 de `supabase/tests/catalogo_policies.sql` no CI. Policy nova entra no universo congelado (`k_policies_public`), e exceção — policy que depende da linha de propósito — se declara **em `catalogo_policies.sql`** (`k_excecoes_predicado`), por ocorrência, com migration, motivo e destino, nunca afrouxando a trava.

Por quê: `npm run lint` / `test` / `build` **não executam** os roteiros SQL — só o job de banco do CI (GitHub Actions; hoje `banco-sem-docker` — o `banco` citado nesta seção era o job antigo, com Docker, que saiu na v1.51.1) os roda (sobe um Postgres, aplica `0001`→última migration e roda cada `*.sql` com `psql`, falhando em qualquer `WARNING: ✗`). Foi exatamente o furo da **F15**: a `0047` mudou a RPC `devolver_ao_fornecedor` (o substituto passou a nascer por `troca`, não `compra`); o roteiro novo `troca.sql` cobriu o comportamento novo, mas o roteiro `manutencao_fornecedor.sql` (F14) **continuou exigindo `compra`** no cenário 4d → o job `banco` ficou vermelho a cada run desde o push da F15, sem que `lint/test/build` locais acusassem nada. Corrigido na **F17** (4d passou a exigir `troca`; ata em `docs/DECISOES.md`).

Como rodar sem Docker/psql local (este ambiente): prove os roteiros no projeto de **ENSAIO** via MCP Supabase `execute_sql` — bloco `begin; … rollback;` que devolve **LINHAS** (o MCP engole `NOTICE`/`WARNING`, então não confie neles: compare o valor real numa `select` final, ex.: `select tipo from movimentacoes where id = <substituto_mov_id>`). Confirme antes que o ensaio está com as migrations em dia (`list_migrations`). A prova final continua sendo o job `banco` **verde** no GitHub após o push.

## Conferir o estado do banco

O ledger de migrations **não** responde "o banco está certo?" — quem responde é o objeto no banco. Estas três sondas são o controle que funciona.
### Como conferir o efeito (sem depender do ledger)

```sql
-- 0039 aplicada? Nenhuma tabela de backup órfã deve sobrar.
select count(*) as tabelas_backup
from pg_tables where schemaname = 'public' and tablename like 'backup%';
-- esperado: 0

-- 0040 aplicada? A guarda de contagens tem de estar no corpo da RPC.
select pg_get_functiondef(p.oid) like '%p_contagens is null%' as tem_guarda
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'importar_ativos_substituir';
-- esperado: true (exatamente 1 linha)
```

### ⚠️ O ledger NÃO é o controle de integridade (medição de 24/07/2026)

**Nunca rode `supabase db push` contra produção a partir deste repo.** A reauditoria de dívida técnica (24/07) mediu o ledger e achou uma incompatibilidade **estrutural**, não uma simples defasagem:

- As `version` do ledger são **timestamps de 14 dígitos gerados pelo MCP no ato do apply** (`20260722145340` → `0041_dominios_login`); os arquivos do repo usam prefixo sequencial (`0041_…sql`). A doc do Supabase confirma que a CLI identifica migration **pelo timestamp do nome do arquivo** ("a new row will be inserted into the migration history table with timestamp as its unique id").
- Portanto os dois esquemas **não casam para praticamente nenhuma migration** — não só para as faltantes. Um `db push` tentaria reaplicar migrations já aplicadas.
  *(Emenda de 22/09/2026, [`ADR-003`](ADR-003-metodo-de-migration.md): lido na fonte atual da CLI, o `db push` hoje **aborta** com `DbPushMissingLocalError` antes de aplicar qualquer coisa, porque as `version` remotas não casam com nenhum arquivo. O dano descrito abaixo vem do passo seguinte, o `migration repair` que "destrava" a CLI, e ele também é proibido.)*
- **O dano concreto:** a RPC do import é redefinida em cadeia (`0032`→`0037`→**`0048`**). Reaplicar `0031`–`0037` **regrediria** o corpo vivo para o da `0037`, desfazendo a `0048`.

**O controle que funciona (e que já se usa):**
1. **Sonda de efeito** — conferir o objeto no banco (`pg_get_functiondef`, `information_schema`, `has_function_privilege`), não o ledger. É o método de fingerprint que a F19 usou para provar paridade ensaio×produção. ⚠ **Mas a forma CRUA do fingerprint tem um falso-positivo — use a sonda normalizada da seção abaixo.**
2. **Job `banco` do CI** — prova que as 56 migrations aplicam limpo e em ordem num Postgres novo.
3. **Verificação pós-apply** do passo 5 acima.

### Sonda de paridade ensaio × produção (use ESTA — a crua engana)

⚠ **`md5(pg_get_functiondef(oid))` cru NÃO serve para comparar ambientes.** Em 25/07/2026 ele
apontou `criar_compra_lote` como divergente entre ensaio e produção, e a conclusão ("a `0055`/`0040`
não chegaram ao ensaio") era **falsa**: a diferença era só o **fim de linha** — produção guarda o
corpo com CRLF e o ensaio com LF (1.664 vs 1.617 bytes, exatamente os 47 `\r`). O fim de linha
depende de **como** o SQL foi aplicado (SQL Editor no Windows vs MCP), não do que ele faz.
**Normalize sempre**, e ao achar divergência **abra a diferença antes de reportá-la**.

Rode o bloco abaixo nos DOIS projetos e compare linha a linha (10 classes de objeto). O filtro
`not like '\_%'` exclui as tabelas de backup ad-hoc, que existem só em produção por construção.

```sql
with
funcs as (
  select 'func' classe, p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' obj,
         md5(regexp_replace(pg_get_functiondef(p.oid),'\s+',' ','g')||p.prosecdef::text||p.provolatile::text) fp
  from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'),
cols as (
  select 'coluna', c.table_name||'.'||c.column_name,
         md5(c.data_type||c.is_nullable||coalesce(regexp_replace(c.column_default,'\s+',' ','g'),'-')||coalesce(c.character_maximum_length::text,'-'))
  from information_schema.columns c where c.table_schema='public' and c.table_name not like '\_%'),
cons as (
  select 'constraint', conrelid::regclass::text||'.'||conname,
         md5(regexp_replace(pg_get_constraintdef(oid),'\s+',' ','g'))
  from pg_constraint where connamespace='public'::regnamespace),
idx as (
  select 'indice', indexname, md5(regexp_replace(indexdef,'\s+',' ','g'))
  from pg_indexes where schemaname='public'),
pol as (
  select 'policy', tablename||'.'||policyname,
         md5(cmd||roles::text||coalesce(regexp_replace(qual,'\s+',' ','g'),'-')||coalesce(regexp_replace(with_check,'\s+',' ','g'),'-')||permissive::text)
  from pg_policies where schemaname='public'),
vws as (
  select 'view', c.relname,
         md5(regexp_replace(pg_get_viewdef(c.oid,true),'\s+',' ','g')||coalesce(c.reloptions::text,'-'))
  from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and c.relkind='v'),
enums as (
  select 'enum', t.typname, md5(string_agg(e.enumlabel, ',' order by e.enumsortorder))
  from pg_type t join pg_enum e on e.enumtypid=t.oid
  join pg_namespace ns on ns.oid=t.typnamespace where ns.nspname='public' group by t.typname),
trg as (
  select 'trigger', c.relname||'.'||t.tgname, md5(regexp_replace(pg_get_triggerdef(t.oid),'\s+',' ','g'))
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and not t.tgisinternal),
rls as (
  select 'rls_flag', c.relname, md5(c.relrowsecurity::text||c.relforcerowsecurity::text)
  from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
  where ns.nspname='public' and c.relkind='r' and c.relname not like '\_%'),
grants as (
  select 'grant_func', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
         md5(has_function_privilege('anon',p.oid,'execute')::text
           ||has_function_privilege('authenticated',p.oid,'execute')::text
           ||has_function_privilege('service_role',p.oid,'execute')::text)
  from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'),
tudo as (
  select * from funcs union all select * from cols union all select * from cons
  union all select * from idx union all select * from pol union all select * from vws
  union all select * from enums union all select * from trg union all select * from rls
  union all select * from grants)
select classe, count(*) as objetos, md5(string_agg(obj||'='||fp,'|' order by obj)) as fp_classe
from tudo group by classe order by classe;
```

Classe que divergir → repita só aquela classe **sem** o `group by`, e faça o `except` dos dois
resultados para achar o objeto exato.

⚠ **SEGUNDO FALSO-POSITIVO CONHECIDO, e ele derrota até a sonda normalizada: COMENTÁRIO.**
(F23, 30/07/2026.) Quando uma função grande é recriada **colando o SQL à mão em cada banco**
— que é o que o apply por MCP obriga —, é fácil reescrever levemente um comentário interno
entre uma colagem e outra. O corpo passa a diferir em bytes e no md5 normalizado, e o
comportamento é **idêntico**. Aconteceu com `apagar_ativo` (5580 × 5529 bytes) e `apagar_item`
(2567 × 2563). Antes de concluir "os bancos divergiram", refaça o hash **sem as linhas de
comentário** — se bater, a divergência é redacional:

```sql
with d as (
  select p.proname, string_agg(l, ' ' order by ord) as codigo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
         lateral regexp_split_to_table(pg_get_functiondef(p.oid), e'\n') with ordinality as t(l, ord)
   where n.nspname='public' and p.proname = :nome
     and btrim(l) not like '--%' and btrim(l) <> ''
   group by p.proname)
select proname, md5(regexp_replace(codigo, '\s+', ' ', 'g')) as fp_codigo, length(codigo)
  from d;
```

A lição operacional: **o que precisa ser idêntico é o CÓDIGO**; comentário divergente é dívida
de redação, não de comportamento — mas vale corrigir na próxima recriação daquela função, para
a sonda agregada voltar a ser um sinal limpo.

**Resultado de 25/07/2026 (depois do rollout de `0056`/`0058`/`0059`/`0060`):** as **10 classes
batem** entre ensaio e produção — 15 funções, 15 grants, 201 colunas, 56 constraints, 47 índices,
20 policies, 5 views, 6 enums, 2 triggers, 15 flags de RLS. Paridade completa; a única diferença
fora do filtro é `_bkp_relatorios_gerados_f6a`, retida em produção de propósito.

**Estado medido em 24/07/2026:** 56 migrations no repo, **46 no ledger** *(a `0057` entrou no mesmo dia, por caminho A, no ledger de ensaio e produção)*. As 10 ausentes (`0031`–`0037`, `0039`, `0040`, `0056`) foram **todas sondadas e estão aplicadas** — inclusive a **`0056`** (as sete RPCs `rel_*` já estão com `anon` sem `execute`), que o `CHANGELOG` ainda dava como pendente de handoff.

## A trava de hash das migrations (F46, 06/09/2026)

**Migration aplicada nunca se edita** deixou de ser só texto. `supabase/migrations.lock.json` guarda
o sha256 do conteúdo de cada arquivo de `supabase/migrations/`, e
`src/lib/validators/migrations-lock.test.ts` recalcula tudo a cada `npm run test`.

Por que ela existe: até aqui, um byte alterado na `0031` passava por `lint`, `test`, `build` **e
pelo job `banco` VERDE** — porque aquele job aplica a cadeia num banco NOVO. Ele prova que as 126
aplicam limpo; nunca que são as mesmas de ontem. Como as migrations deste repositório são aplicadas
**por MCP, uma a uma**, e o ledger é estruturalmente incompatível com a numeração dos arquivos (a
seção acima), editar uma já aplicada produz um repositório que diz uma coisa e um banco que faz
outra, **sem nenhum sinal**.

O hash é do conteúdo com `\r\n` → `\n`, em bytes. Não é frescura: medido em 06/09/2026, a árvore de
trabalho no Windows tem CRLF em quase todas as migrations (`0001`: 51 linhas com CR; `0127`: 322),
enquanto o blob do git — o que o Linux do CI recebe — é LF. Com a normalização os 126 hashes batem
com o blob do git; sem ela a trava acusaria deriva a cada clone e seria treinada a ser ignorada.

### O que fazer quando ela reprova

O teste diz qual das três coisas aconteceu, e **a resposta é diferente em cada caso**.

| A mensagem diz | O que aconteceu | O que fazer |
|---|---|---|
| `MUDOU depois de travada` | você editou uma migration já travada | **Desfaça a edição** (`git checkout -- supabase/migrations/<arquivo>`) e escreva uma **migration NOVA** com o que queria mudar. **NÃO** rode `npm run db:lock`. |
| `não existe mais no disco` | migration travada apagada ou renomeada | Restaure o arquivo com o **nome original**. Renomear tem o mesmo efeito de editar: o ledger e o Anexo A passam a apontar para um nome que não existe. |
| `ainda não está em … lock.json` | migration nova | `npm run db:lock`, e comite o lock **no mesmo commit** da migration. |

⚠ **A resposta certa quase nunca é "regrave o lock".** Ela é a resposta certa para **um** dos três
casos — o de migration nova. Nos outros dois, regravar apaga a prova do erro que a trava existe para
pegar. Por isso a mensagem do caso `MUDOU` nem cita o comando, e o `npm run db:lock` **RECUSA** —
sai 1 **sem gravar nada** — quando alguma migration já travada mudou de conteúdo.

**A exceção legítima, e é rara:** uma migration que **nunca chegou a banco nenhum** (nem ensaio nem
produção) ainda pode ser corrigida no lugar — foi escrita e ainda não aplicada. Só para esse caso
existe a flag explícita:

```bash
npm run db:lock -- --regravar-alterada
```

E, usando-a, **diga no commit** por que a migration não tinha sido aplicada em lugar nenhum. Se
houver dúvida se ela chegou, a **sonda de efeito** da seção acima responde; o ledger, não.

### Quem acrescenta migration atualiza DUAS listas (e escreve a classe)

1. `supabase/migrations.lock.json`, por `npm run db:lock`.
2. `src/lib/itens/migrations-f38.test.ts`, que já exigia (desde a F38) que toda migration a partir da
   `0116` esteja numa lista dele.
3. (F63) O cabeçalho `-- classe: ADITIVA | BACKFILL | DESTRUTIVA` e o `ROLLBACK` no rodapé, a partir da `0159` —
   `src/lib/validators/migrations-backfill.test.ts` confere contra o que o arquivo executa ("A disciplina de backup de
   migração", acima).

As três reprovam sozinhas e nomeiam o arquivo — nenhuma depende de alguém lembrar.

### O banco do CI na mesa (sem o Docker do Supabase)

O CI tem **um** job de banco: **`banco-sem-docker`** — `services: postgres:17`, com o bootstrap
declarado em `supabase/ci/`, rodando o MESMO `scripts/db/rodar-roteiros.sh` que `npm run db:test`
chama na mesa. Ele é o *required status check* da `main`, ao lado de `verificar`.

> **Histórico, porque o nome do job confunde quem chega agora.** Até a **v1.51.1** (06/09/2026)
> havia dois: o `banco` original, que subia o stack Docker do Supabase CLI, e este. Os dois rodaram
> em paralelo por cinco runs, chamando o mesmo runner, e a **igualdade de veredito entre eles**
> (25 roteiros, 577 asserções, 0 falhas) foi o que provou que o bootstrap declarado estava certo.
> Só então o antigo saiu. O nome `banco-sem-docker` ficou: renomeá-lo exige, no mesmo movimento,
> trocar o *required status check* na branch protection — senão o check exigido para de reportar e
> todo PR trava sem nada vermelho na tela.

Ele é reproduzível em qualquer Postgres 17 vazio, sem Docker e sem a CLI do Supabase. Na mesa:

```bash
createdb estoque
psql -d estoque -v ON_ERROR_STOP=1 -f supabase/ci/bootstrap-roles.sql
psql -d estoque -v ON_ERROR_STOP=1 -f supabase/ci/bootstrap-auth.sql
psql -d estoque -v ON_ERROR_STOP=1 -f supabase/ci/bootstrap-storage.sql
psql -d estoque -v ON_ERROR_STOP=1 -f supabase/ci/bootstrap-ledger.sql
for f in $(ls supabase/migrations/*.sql | sort); do
  psql -d estoque -v ON_ERROR_STOP=1 -q -f "$f" || { echo "falhou: $f"; break; }
done
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/estoque npm run db:test
```

Esperado (F60, 17/09/2026 — CI 35178186717, depois da `0145`; este número **cresce a cada fase que acrescenta roteiro**, então trate como a forma mais recente medida, não como constante): `35 roteiro(s), 855 asserções no total`, zero `✗`; e o injetor, `90/90 detectadas pelo cenário nomeado`. *(Até a F56, CI 34853956001, depois da `0140`: `34 roteiro(s), 818 asserções`. Entre as duas medições entraram, entre outros, o roteiro `f60_recorte.sql`, com 17 asserções, e o cenário `11a`–`11c` de `asof_desempate.sql`.)*

⚠ **O bootstrap é o recorte MÍNIMO do que o `supabase start` entrega, e o "mínimo" é deliberado nos
dois sentidos.** Ele **não** concede privilégio nenhum em `public` — porque o `supabase start` do job
antigo também não concede (está escrito em `supabase/tests/papeis_rls.sql`), e os roteiros plantam os
próprios `grant`, tabela por tabela. Um `grant … on all tables` ali faria `seguranca_catalogo.sql`
passar por **motivo errado** e mascararia todo REVOKE futuro. Se um roteiro ficar vermelho no job
novo e verde no antigo, **o defeito é do bootstrap, nunca do roteiro**.

### As migrations NÃO são idempotentes, e isso é por desenho

Medido em 06/09/2026: aplicar a cadeia duas vezes no mesmo banco **morre na primeira migration** —
a `0001` abre com `create table public.profiles (` sem `if not exists`. São 69 `create policy` sem
`drop … if exists`, 45 `create index` sem `if not exists`, 7 `create type`, 7 `create trigger` e 4
`create view` sem `or replace`. Elas foram escritas para rodar **uma vez**, e torná-las idempotentes
hoje seria **editar migration aplicada** — o que a trava acima proíbe.

Por isso o job novo não "aplica de novo": ele aplica a mesma cadeia **do zero em dois bancos limpos**
e compara a impressão digital do schema por classe (`supabase/ci/impressao-schema.sql`, que é a sonda
de paridade desta página, agora executável). Divergência reprova. É **determinismo**, não
idempotência — e é a pergunta que interessa quando a mesma cadeia vai para ensaio e para produção.


## Armadilhas conhecidas (todas já aconteceram)
- **Banco novo nasce em UTC — e o fuso do negócio é uma CONFIGURAÇÃO, não um trecho de SQL.** Desde a `0124` (30/08/2026) o banco roda em `America/Sao_Paulo`, gravado com `alter database … set timezone`. É isso que faz `current_date` nas RPCs carimbar a data certa (entre 21h e meia-noite, um banco em UTC grava o dia seguinte — o item W da dívida). A armadilha: **restore, branch de banco ou projeto novo voltam ao default de fábrica** e o sintoma só aparece à noite, no relatório de quem lançou. Mitigação: `supabase/tests/fuso_do_negocio.sql` reprova no job `banco`, e a asserção nº 4 dele é independente do horário de propósito. Ao criar qualquer banco novo, reaplique a `0124` antes de qualquer carga.
- **Valor novo de enum não pode ser USADO na mesma transação que o acrescenta — e cada migration é uma transação.** O Postgres recusa (`unsafe use of new value`) qualquer uso de um valor recém-criado por `alter type … add value` antes de a transação que o criou fazer commit: um `case` numa função, uma comparação, um `check`, um default. Como o job de banco e o apply aplicam cada arquivo numa transação própria, uma fase que **cria o valor e o usa** precisa de **duas migrations**: a primeira só com `alter type … add value if not exists 'x'` (idempotente, sem `before`/`after`), a segunda com os usos — e a BASE de cada `create or replace` da segunda é o **corpo VIGENTE** da função (`scripts/db/corpo-vigente.mjs` na mesa, `pg_get_functiondef` no banco), nunca a migration que a criou. O projeto pagou isso três vezes: **`0044`→`0045`** (F14, `status_ativo += devolvido_fornecedor` e `tipo_movimentacao += devolucao_fornecedor`), **`0046`→`0047`** (F15, `tipo_movimentacao += troca`) e **`0108`→`0109`** (F34, `tipo_movimentacao += envio_triagem`, com os md5 do corpo anterior na ata). O atalho de migration única existe e já foi usado uma vez — a `0027` (F6A) comparou `tipo::text = 'retorno'` em vez do enum, porque o cast para texto não exige que o valor já pertença ao tipo —, mas é pegadinha fácil de esquecer na próxima comparação e não se repetiu. **Não há rollback** de `add value` (o valor fica inerte enquanto ninguém o usa). **A conversão de enum para `text + CHECK` NÃO foi feita, por decisão** (F58, `PLANO-MULTIEMPRESA.md` §5 → "Não entra"): o argumento a favor é bom — `add value` virar `alter table … drop constraint`/`add constraint` na mesma transação —, mas os enums estão em produção com a história inteira das migrations, e views, funções, policies e o `database.ts` dependem deles; converter seria reescrever dezenas de objetos para economizar uma migration por fase. Mitigação: esta regra, e o roteiro de banco reprovando no CI a migration única que tentar usar o valor na mesma transação.
- **Arquivo errado no SQL Editor** — rodar a migration anterior por engano (F7E: 0033 no lugar da 0034 → nada aplicado, erro `42701` depois). Mitigação: a verificação pós-apply do passo 5.
- **Cache do PostgREST** — sem `notify pgrst`, a API recusa a nova assinatura da RPC. Mitigação: passo 6.
- **Overload de função** — recriar com assinatura diferente (ou pular a ordem das migrations que fazem `drop`+`create`) deixa duas versões coexistindo → PostgREST não resolve a chamada. Mitigação: sempre `create or replace` puro com assinatura idêntica; verificação do passo 5.
- **Ordem migration → deploy** — se a migration muda a assinatura/colunas que o código novo usa, aplicar o SQL ANTES do deploy da Vercel.
- **Roteiro de teste defasado após mudar função/trigger** — a F15 mudou a RPC mas só atualizou o roteiro novo; o roteiro antigo (`manutencao_fornecedor.sql` 4d) ficou exigindo o comportamento velho (`compra`) e derrubou o job `banco` silenciosamente (lint/test/build locais não rodam SQL). Mitigação: a regra "rode TODOS os roteiros" da seção acima.
- **Asserção nova do `papeis_rls.sql` sobre relação FORA do bloco de grants → `42501` só no CI, e leva o arquivo inteiro.** O roteiro é o único que faz `set local role authenticated`, e um projeto Supabase **hospedado** concede a `anon`/`authenticated` os privilégios de TABELA de `public` por *default privilege*. O Postgres NOVO que o job `banco` sobe **não** reproduz esses defaults. Então uma asserção que faça `select … from X` (ou escreva em X) sem X no bloco de grants explícito do topo do roteiro dá `ERROR: permission denied for table X` (`42501`), **aborta o `do $$` inteiro** — levando com ele todas as seções seguintes, que nem chegam a rodar — e **passa VERDE no ensaio**. É uma resposta certa para a pergunta errada: ali se mede *policy (RLS)*, não privilégio; quem mede privilégio é `seguranca_catalogo.sql`. **Inclusive VIEW:** `v_estoque_atual` precisou de `grant` próprio, porque o atalho `grant … on all tables in schema public` cobria views e o bloco explícito não — e o atalho está barrado no próprio roteiro: a variante de UPDATE cai no bloco `do $trava$` (devolveria o UPDATE de TABELA em `profiles` que a `0063` revogou, e a asserção `3g`, de escalada de privilégio, passaria por engano), e a de SELECT foi proibida pela regra escrita ali ("só entra a tabela/verbo que uma asserção realmente usa"), porque `on all tables` mascararia qualquer REVOKE futuro. Aconteceu com `ativos` no primeiro push da F21 e de novo com `v_estoque_atual` na revisão da `0070`. Mitigação: toda asserção nova entra **junto** com a sua relação/verbo no bloco de grants, com o comentário dizendo qual asserção a usa — e a prova é o job `banco` verde, não o run no ensaio.

## Escalada — quando parar e chamar o Johnny

O modo autônomo (`CLAUDE.md`) decide e executa sozinho, inclusive em produção. Estes são os casos em que ele **para**:

| Situação | Por quê |
|---|---|
| A migration bate no **gate** (caminho B) | Só o Johnny roda no SQL Editor de produção — é o humano no circuito, por desenho |
| **Divergência ensaio × produção** que não seja fim de linha | Abrir a diferença é obrigatório antes de reportar; se ela for real, é drift e não se corrige por reflexo |
| **Contagem do acervo mudou** quando a migration não devia tocar dado | Sinal de efeito colateral — não siga para o próximo passo |
| `get_advisors(security)` com **achado NOVO** depois do apply | O apply abriu um furo; o rollback vem antes do diagnóstico |
| Falta **insumo físico** (CSV real, credencial que não existe no ambiente) | Não há como o agente obter — é a única "pergunta" prevista no modo autônomo |

Fora desses casos: decida, execute, e registre a ata em [`DECISOES.md`](DECISOES.md).

---

## Anexo A — histórico de apply, migration a migration

Registro append-only do que foi aplicado, como foi conferido e qual era o rollback de cada uma. **É histórico, não procedimento** — o procedimento está no topo. Serve para responder "esta migration chegou aos dois bancos?" e "qual era o corpo anterior desta função?" sem depender do ledger.

O bloco abaixo abre com a divergência do ledger medida em 23/07/2026, que é a razão de este anexo existir.


`list_migrations` de produção mostra `0001`–`0030` + `rate_limit_senha` (0025) + `0038` + `0041`. **Faltam no ledger** (aplicadas à mão pelo gate, mas os objetos EXISTEM em produção — `import_logs`, a RPC de 4 args etc.):

- **0031, 0032, 0033, 0034, 0035, 0036, 0037** — as migrations do import de startup (F7…F8).
- `0029` **não existe** (gap real na numeração; nunca foi criada).
- **`0039` (drop dos backups) e `0040` (hardening das RPCs) — JÁ APLICADAS, só fora do ledger.** *Correção de 23/07/2026 (F12).* Até esta data o runbook, o `README.md` e o `CHANGELOG.md` diziam que as duas estavam **pendentes de apply**. **Medição direta no banco de produção desmente:** não existe **nenhuma** tabela `backup%` (é exatamente o efeito da `0039`) e o corpo de `importar_ativos_substituir` **contém** a guarda `p_contagens is null` (efeito da `0040`). O que falta é o **registro**, não o efeito — elas entram na reconciliação abaixo, junto com as `0031`–`0037`. **Conferir antes de reconciliar** (ver os dois SELECTs em "Conferir o estado do banco", no corpo do runbook): registrar no ledger uma migration que não esteja aplicada é pior que a divergência.
- **`0041`** (domínios de login: `@stefanini.com` + `@latam.stefanini.com`, 22/07/2026) — **aplicada por MCP em prod E ensaio**, e no ledger dos dois. Não bate no gate (é `create or replace` de trigger, sem `delete from`).
- **`0042`** (`itens.estoque_minimo` — F12, 23/07/2026) e **`0043`** (`kits_modelos` — F12, 23/07/2026) — as duas **aditivas** (coluna com default `0` + tabela nova com RLS), sem `delete from`, então **não batem no gate**: aplicadas por MCP em **ensaio primeiro** e depois em produção, e registradas no ledger dos dois normalmente. Rollback documentado no backup lógico da ordem: são aditivas, o `drop` não perde nenhum dado do acervo.
- **`0044`** (enums `devolvido_fornecedor`/`devolucao_fornecedor` — F14, 23/07/2026) e **`0045`** (colunas `movimentacoes.chamado_fornecedor` + `ativos.substitui_ativo_id`, check `NOT VALID`, recriação de `status_apos_movimentacao`/`aplicar_movimentacao`/`rel_estoque_asof` por `create or replace` puro, RPC nova `devolver_ao_fornecedor`) — **aditivas**, sem `delete from` → **não batem no gate**: aplicadas por MCP em **ensaio primeiro** e depois em produção, registradas no ledger dos dois. `0044`/`0045` são migrations **separadas** de propósito (valor de enum novo não é usável na transação que o adiciona). Verificação pós-apply em produção: enums 9/14, colunas/check/índice presentes, RPC 1 assinatura + grants (authenticated=true, anon/service_role=false), diffs corretos das 3 funções (conferidos ANTES de recriar: corpos vigentes = base 0022/0023/0024, sem drift), acervo inalterado (1593). Rollback lógico: `drop` das colunas/índice/RPC + `create or replace` das 3 funções de volta aos corpos 0022/0023/0024 (nenhum dado do acervo se perde).
- **`0046`** (`add value 'troca'` — F15, 23/07/2026), **`0047`** (usos de `troca`: recriação de `status_apos_movimentacao`/`aplicar_movimentacao`/`rel_estoque_asof` + `devolver_ao_fornecedor` por `create or replace` puro) e **`0048`** (recriação de `importar_ativos_substituir` — só a expressão da pendência muda: service tag vazia → `'sem service tag'`) — **aditivas**, sem `delete from` de dado no ato do apply → **não batem no gate**: aplicadas por MCP em **ensaio primeiro** e depois em produção, registradas no ledger dos dois. `0046`/`0047` **separadas** de propósito (valor de enum novo não é usável na transação que o adiciona — espelho de 0044/0045). A `0048` faz `create or replace` de uma RPC que **tem** `delete from` no corpo, mas o `apply_migration` do MCP não a barrou (o corpo não é executado no apply, só redefinido). Verificação pós-apply em produção: enum 15/`troca` no fim, 1 assinatura por função + grants corretos (as 2 RPCs de escrita authenticated-only; `rel_estoque_asof` idêntica à 0045), casos novos por `pg_get_functiondef`, `get_advisors(security)` 0 achados NOVOS, acervo inalterado (1596). Rollback lógico: `create or replace` das funções de volta aos corpos 0045/0040 (o enum `add value` é inócuo se não usado).
- **`0049`** (`create or replace view v_pendencias` — ativo `origem='importacao'` deixa de ser cobrado por "termo pendente", 24/07/2026) — **não-destrutiva** (só redefine a view; nenhum `delete from`), então **não bate no gate**: caminho **A** — aplicada por MCP em **ensaio primeiro** e depois produção, registrada no ledger dos dois (version timestamp, name `0049_pendencia_termo_dispensa_import`). Diff vs 0028 = só `and a.origem is distinct from 'importacao'` no ramo de termo (CASE `pendencia` + CASE `desde` + WHERE); 14 colunas idênticas. Verificação pós-apply em produção: `v_pendencias` 1.163→60, "termo pendente" 1.142→2, `import_ainda_termo=0`, `get_advisors(security)` 0 achado novo. **Sem passo de PostgREST/deploy** (colunas inalteradas). Rollback: `create or replace` de volta ao corpo 0028.
- **`0057`** (nome + sobrenome do operador, 24/07/2026) — **aditiva**, sem `delete from` → **não bate no gate**: caminho **A**, aplicada por MCP em **ensaio primeiro** e depois em produção, registrada no ledger dos dois. Renomeia `profiles.nome` → `primeiro_nome`, acrescenta `sobrenome` e devolve `nome` como coluna **GERADA** (`nullif(btrim(primeiro_nome || ' ' || sobrenome), '')`), para que os ~10 pontos do app que leem `profiles.nome` continuem recebendo o nome de exibição sem uma linha de mudança. Dependências levantadas ANTES do apply (`pg_depend` + `pg_get_functiondef`): única view sobre colunas de `profiles` é `v_pendencias_item` — recriada por `create or replace` com a **mesma lista de colunas**, então `v_fila_pendencias` não precisou ser tocada; única função que cita `profiles` é `handle_new_user` — recriada com a trava de domínio da `0041` **intacta** e o `revoke` reafirmado. Verificação em ensaio antes de produção: `DO` block que gravou/leu/reverteu a coluna gerada + o roteiro `supabase/tests/dominios_login.sql` adaptado (16 asserções, 0 falha, tudo em rollback). Contagens de produção **antes = depois**: 9 perfis (9 com nome), 1.597 ativos, `v_fila_pendencias` 58, `v_pendencias_item` 3; `has_function_privilege('anon', 'handle_new_user()', 'execute')` = false. Cache do PostgREST recarregado nos dois. Smoke `smoke-prod.mjs` rodado **depois** do apply contra o app em produção (ainda com o código anterior): **52 OK · 0 falha** — prova que a coluna gerada não quebrou nenhuma leitura já no ar. Rollback sem perda: `drop column nome` → `rename primeiro_nome to nome` → `drop column sobrenome` → `create or replace` da view e do trigger com os corpos da `0052`/`0041`.
- **`0061`–`0066`** (F21 — cargos, vínculo de filiais, RLS por papel, auditoria e storage;
  29/07/2026) — **aditivas** (nenhum `delete from` de dado no ato do apply) → **não batem no
  gate**: caminho **A**, aplicadas por MCP em **ensaio primeiro** e depois em produção,
  registradas no ledger dos dois. Seis migrations, uma por assunto: `0061` enum
  `papel_usuario` + `profiles.papel`/`ativo` + `operador_filiais` + backfill (`BACKFILL = admin`
  do §0 da ordem); `0062` as três funções `security definer`/`stable`
  (`papel_atual`/`e_admin`/`pode_escrever_filial`); `0063` a troca das policies de escrita +
  o **grant de coluna** de `profiles`; `0064` as guardas internas das RPCs; `0065`
  `eventos_admin`; `0066` as policies de `storage.objects`.

  **A armadilha que a `0059` armou, e como foi desarmada.** Nas 6 tabelas em que a `0059`
  dropou a `"leitura operador"` (`ativos`, `filiais`, `itens`, `kits_modelos`, `motivos`,
  `termos_gerados`), a `"operador escreve" FOR ALL` virou a **única porta de LEITURA** — um
  `alter policy` nela teria cegado o app para todo não-admin. A `0063` faz, na ordem e numa
  transação só: (1) recria a policy de SELECT `using (true)`, (2) dropa a FOR ALL, (3) cria
  uma policy **por verbo** de escrita (uma policy por comando, para não reacender
  `multiple_permissive_policies`). `policies_public` foi de **20 → 39**.

  **`0064` e o gate.** O corpo de `importar_ativos_substituir` contém
  `delete from public.ativos` e `delete from public.movimentacoes`, mas o `apply_migration`
  **não barrou** — mesmo precedente da `0048`: o corpo não é executado no apply, só
  redefinido. Os corpos das duas RPCs foram **copiados dos arquivos** das últimas migrations
  que as definiram (`criar_compra_lote` da `0040`, `importar_ativos_substituir` da `0048`), com
  a única diferença sendo o bloco de guarda — **provado por `diff`** antes do apply (15 linhas
  a mais na de import, 12 na de compra, zero outra alteração em 366 e 55 linhas).

  **Verificação pós-apply em produção:**
  - backfill — `papel admin = 9`, vínculos `esperado=54 real=54` (9 perfis × 6 filiais ativas),
    `desativados=0`;
  - as 3 funções — `definer=true`, `vol=s`, `anon=false`, `authenticated=true`;
  - `fp_normalizado` (`md5(regexp_replace(prosrc,'\s+',' ','g'))`) das duas RPCs **idêntico**
    entre **repo, ensaio e produção**: `criar_compra_lote` = `394c24d2…`,
    `importar_ativos_substituir` = `3e3fd387…`. *(Efeito colateral bem-vindo: isso também
    eliminou o drift de CRLF do `criar_compra_lote` que a seção "Sonda de paridade" documenta —
    produção guardava o corpo com CRLF, agora bate com o ensaio.)*
  - só **1** policy de escrita com predicado `true` (o INSERT de `import_logs`, por design);
    as 6 tabelas do grupo com **exatamente 1** porta de leitura cada;
  - grant de coluna de `profiles` = **`primeiro_nome+sobrenome`** e nada mais;
  - acervo **inalterado**: ativos 1230, movimentações 2361, termos 6, import_logs 8,
    lançamentos 9, `v_fila_pendencias` 55, objetos de storage 27 — antes = depois;
  - `notify pgrst, 'reload schema'` nos dois (assinatura não mudou, mas é barato).

  **Paridade ensaio × produção** (sonda normalizada, 6 classes relevantes à fase):
  `enum` 7, `func` 18, `grant_func` 18, `policy_public` 39, `policy_storage` 8 — **fingerprint
  idêntico nas cinco**. `grant_coluna` diverge por construção (428 em produção × 412 no
  ensaio): a diferença são exatamente as **16** linhas de `_bkp_relatorios_gerados_f6a`, a
  tabela de backup retida só em produção de propósito (`0039`/`0058`).

  **Roteiro `supabase/tests/papeis_rls.sql`** rodado nos **dois** bancos: **41 asserções,
  0 falha** em cada. Ele planta 1 linha em `senhas_acesso`, `import_logs`, `eventos_admin` e no
  bucket `backups-import` ANTES de trocar de papel — sem isso, as asserções "não vê nada"
  passariam de graça no Postgres NOVO do CI, onde essas tabelas nascem vazias; e checa o outro
  lado (o admin VÊ), para uma policy que escondesse de todos não passar nos dois testes. Ele cria as próprias fixtures (4 identidades fictícias `f21.*@wap.ind.br`,
  2 ativos `WAP000900x`) dentro de `begin; … rollback;` — conferido depois em produção que
  **nada sobrou** (0 usuários residuais, 0 ativos de teste, contagens de volta ao baseline).
  Antes de rodar em produção foi conferido que **nenhuma** das chaves fictícias colidia com
  dado real (patrimônio, e-mail, uuid, código de motivo, slug de filial: 0 colisões).

  **Advisors (ensaio, antes → depois):** `rls_policy_always_true` **12 → 1** — nenhum WARN
  **novo de RLS**. Aparecem 3 WARN novos de **outra** classe
  (`authenticated_security_definer_function_executable` nas três funções da `0062`): são
  inerentes ao desenho — uma expressão de policy é avaliada com os privilégios de quem
  consulta, então `authenticated` precisa de `EXECUTE`; as três respondem só sobre o próprio
  chamador. Aceitos e registrados em `docs/DECISOES.md` (2026-07-29 · F21).

  **Rollback lógico** (documentado no rodapé de cada migration): dropar as policies novas e
  recriar `"operador escreve" FOR ALL using(true) with check(true)` nas 6, devolver as
  `alter policy` a `true`, `revoke`/`grant update` de `profiles` de volta ao amplo, reaplicar
  os corpos da `0040`/`0048` sem as guardas, e `drop` de `eventos_admin`,
  `operador_filiais`, das 3 funções, das 2 colunas de `profiles` e do enum. **Nenhum dado do
  acervo se perde em nenhum dos passos.**
- **`0067`** (F21 — dois furos achados pela REVISÃO ADVERSARIAL da própria fase; 29/07/2026) —
  **aditiva** (duas `alter policy`, nenhum dado tocado) → caminho **A**, aplicada por MCP em
  **ensaio primeiro** e depois em produção, no ledger dos dois.

  **1. `movimentacoes` gateava a filial que o CLIENTE DECLARA.** A `0063` seguiu a letra do §5
  da ordem (`with check (pode_escrever_filial(filial_id))`) e `movimentacoes.filial_id` é uma
  **coluna livre do payload** — nada no banco exigia que ela batesse com a filial do ativo.
  Deputado confuso clássico, e com o efeito AMPLIFICADO porque `aplicar_movimentacao` é
  `security definer`: o `update ativos` dele nunca passa pela policy "operador atualiza".

  **Exploit REPRODUZIDO no ensaio antes da correção** (não é hipótese):
  operador vinculado só à filial 1, ativo na filial 2, `pode_escrever_filial(2) = false`;
  `insert into movimentacoes (ativo_id=<ativo da f2>, tipo='transferencia', filial_id=1,
  filial_destino_id=1)` → **ACEITO**, e o ativo **migrou para a filial 1**. Dali em diante toda
  escrita nele é legítima para o atacante. Variantes: `tipo='ajuste'` com
  `status_resultante='descartado'` (o ajuste pula a máquina de estados) e `tipo='saida'`
  (troca o detentor) — em ativo de filial alheia nos dois casos. A anon key está no bundle do
  navegador, então o request forjado não exige nada além de `curl`.

  **Correção:** gatear também a filial de **ORIGEM lida do banco** —
  `pode_escrever_filial((snapshot_anterior ->> 'filial_id')::smallint)`. `snapshot_anterior` é
  preenchido pelo próprio trigger, na primeira coisa que ele faz, a partir de
  `select * into v_ativo from ativos where id = new.ativo_id for update` — logo é a filial
  REAL, sob lock, e o trigger **sobrescreve** o que o cliente tenha mandado nesse campo.
  Não se usou `exists (select ... from ativos ...)` porque nesse ponto o trigger JÁ moveu o
  ativo, e o `exists` recusaria a transferência legítima que o §0 autoriza
  (`TRANSFERENCIA_EXIGE_VINCULO_DESTINO = nao`).
  **A ordem de avaliação (BEFORE trigger → WITH CHECK) foi confirmada por TESTE**, não por
  leitura de doc: com a policy nova o exploit passa a 42501 e os quatro fluxos legítimos
  seguem passando (ajuste na vinculada · transferência da vinculada para outra · admin em
  qualquer filial · compra pela RPC, em que o ativo nasce na mesma transação).

  **2. `import_logs` seguia com INSERT `with check (true)`.** A `0063` deixou como estava por
  determinação do §5 ("escrita como está (RPCs)"), no raciocínio de que a policy é vestigial
  porque quem grava é a RPC `security definer`. Certo quanto à RPC, **errado quanto ao resto**:
  `authenticated` tem privilégio de INSERT na TABELA (default do Supabase; nenhuma migration o
  revoga), então qualquer logado — **inclusive o cargo `consulta`** — gravava linhas falsas na
  trilha do import destrutivo por `POST /rest/v1/import_logs`. Trilha que qualquer um escreve
  não é trilha; e com a leitura agora restrita a admin, o admin veria histórico envenenado sem
  como distinguir. Corrigido para `with check ((select e_admin()))` — a RPC não é afetada.

  **Verificação pós-apply nos dois bancos:**
  - `select count(*) from pg_policies where schemaname='public' and cmd<>'SELECT' and
    (qual='true' or with_check='true')` → **0**. Não sobrou NENHUMA policy de escrita
    permissiva em nenhuma tabela.
  - a policy de `movimentacoes` cita `pode_escrever_filial(filial_id)` **e** `snapshot_anterior`.
  - acervo inalterado: ativos 1230, movimentações 2361, senhas 4, import_logs 8, storage 27.
  - **advisor `rls_policy_always_true`: 12 (entrada da F21) → 1 (após 0063) → 0 (após 0067).**

  **Cobertura de teste:** o roteiro `supabase/tests/papeis_rls.sql` foi de 41 para **45
  asserções**, e as quatro novas são exatamente a lacuna que deixou o furo passar —
  `2c-bis` (o caso CRUZADO: `filial_id` mentido em ativo de filial alheia), `2c-ter` (o ativo
  **não** migrou), `2h` (a transferência LEGÍTIMA continua passando — sem ela, a correção
  poderia ter fechado o furo quebrando o fluxo normal) e `3f-bis` (o operador não forja a
  trilha do import). O `2c` que já existia **não** cobria: lá o ativo e o `filial_id` são os
  dois da filial não vinculada, então ele passaria mesmo sem a correção. **45/0 nos dois bancos.**

  **Rollback:**
  `alter policy "operador insere" on public.movimentacoes with check (public.pode_escrever_filial(filial_id));`
  `alter policy "operador insere" on public.import_logs with check (true);`
  (reabre os dois furos — só faz sentido junto de um rollback completo da F21).
- **`0068`** (F21 — o mesmo furo da `0067` no irmão que ela não alcançou; achado pela
  **RE-REVISÃO** das correções; 29/07/2026) — **aditiva** (uma função nova + um `alter policy`),
  caminho **A**, aplicada por MCP em **ensaio primeiro** e depois em produção, no ledger dos dois.

  **O furo.** A `0067` fechou o padrão "gatear dado que o escritor escolhe" em `movimentacoes` e
  deixou `lancamentos_item` intacto. Ali `filial_id` **é** o objeto da escrita (o saldo daquela
  filial), então o predicado é auto-consistente — mas a OUTRA coluna da mesma linha,
  `estorna_id`, é ponteiro livre para qualquer linha da tabela, e nada a conferia: a FK da `0015`
  não filtra e o trigger `valida_lancamento_item` olha saldo e reserva, sem mencioná-la.
  Um operador da filial 1 estornava um lançamento da filial 2 declarando `filial_id: 1`. O dano
  cai todo fora da filial dele: o lançamento alheio passa a aparecer **"estornado"** no histórico
  e no relatório (a derivação é "existe alguém apontando para mim", **sem filtro de filial**), o
  **saldo continua contando** — histórico e saldo se contradizem — e o índice único queima a vaga,
  então o operador legítimo **nunca mais** consegue estorná-lo (a tabela é imutável).

  **Por que a primeira revisão errou ao refutar.** Ela classificou como "folga pré-existente do
  esquema, não da fase" — verdade quanto ao esquema (`estorna_id` é FK livre desde a `0015`), mas
  a conclusão não segue: **foi a F21 que transformou filial em fronteira de escrita**. Antes da
  `0063`, `with check (true)` tornava o caso irrelevante; não havia privilégio a violar.

  **A armadilha do fecho, encontrada ao testar antes de aplicar.** A primeira tentativa usou um
  `exists` inline; dentro de um subselect **na própria tabela**, a referência nua `estorna_id`
  resolve para a coluna do ALIAS da subconsulta — a condição virava `o.id = o.estorna_id`, sempre
  falsa, e o predicado **recusava o estorno legítimo** (medido: ataque recusado E legítimo
  recusado). Trocado por `estorno_item_coerente(p_estorna_id, p_filial, p_item)` —
  `security definer`, `stable`, parâmetros nomeados, sem escopo ambíguo possível.

  **Provado no ensaio antes de aplicar em produção:**
  ```
  ATAQUE estorna_id de OUTRA filial   → RECUSADO (42501)
  ATAQUE estorna_id de OUTRO item     → RECUSADO (23514, um check pegou antes)
  LEGÍTIMO estorno mesma filial+item  → ACEITO
  LEGÍTIMO lançamento sem estorno     → ACEITO
  ```

  **Verificação pós-apply nos dois bancos:** a policy `"operador lanca"` cita
  `pode_escrever_filial` **e** `estorno_item_coerente`; `anon` sem execute e `authenticated` com
  execute na função nova; **0** policies de escrita com predicado `true` em qualquer tabela;
  `lancamentos_item` inalterado (9 linhas em produção), acervo intocado (1230/2361).
  Roteiro `papeis_rls.sql`: **45 → 47 asserções** (`2e-bis` ataque, `2e-ter` legítimo),
  **47/0 nos dois bancos**.

  **Rollback:**
  `alter policy "operador lanca" on public.lancamentos_item with check (public.pode_escrever_filial(filial_id));`
  `drop function public.estorno_item_coerente(uuid, smallint, smallint);`
- **`0069`** (F21 — o TERMO, a linha E o `.docx`, também é matéria de FILIAL; achado pela
  **TERCEIRA volta** da revisão adversarial da fase; 30/07/2026) — **aditiva** (3 funções novas,
  1 índice, 6 `alter policy`; nenhuma linha e nenhum objeto de Storage tocado), caminho **A**,
  aplicada por MCP em **ensaio primeiro** e depois em produção, no ledger dos dois.

  **O furo.** A `0063` gateou `termos_gerados` e o bucket `termos` **só pelo CARGO**, com a
  justificativa escrita no próprio corpo: *"sem filial própria (guarda `ativo_ids[]`), então o
  predicado é o cargo. O recorte por filial deste fluxo vive na action."* "Vive na action" é
  exatamente o que o CLAUDE.md proíbe como ÚNICA linha — e aqui a action não é atravessada:
  `authenticated` tem privilégio de tabela em `termos_gerados` e em `storage.objects`, e a anon key
  está no bundle do navegador. Um operador vinculado só à filial 1 apagava a LINHA e **DESTRUÍA o
  `.docx` assinado** de um termo da filial 5 por `curl`, e o ativo continuava com
  `termo_assinado = 'sim'` — sem arquivo, sem nada no sistema saber da perda. Terceira aparição do
  padrão que a `0067` e a `0068` fecharam, e a pior das três: aquelas corrompiam número, esta
  destrói documento.

  **A correção — três predicados que se sustentam um no outro.** `pode_escrever_termo(uuid[])` (a
  filial de cada ativo, **LIDA de `ativos`** numa função `security definer`, nunca declarada pelo
  cliente) nas 3 policies de escrita da tabela; `pode_escrever_arquivo_termo(text)` nas 3 do bucket
  (`bool_and` de `pode_escrever_termo` sobre as linhas cujo `arquivo_path` bate com o nome do
  objeto, com `coalesce(…, true)` para nome que NENHUMA linha referencia); e dois invariantes **só
  nas WITH CHECK** — `termo_ancora_coerente(uuid[], uuid[])` (`ativo_ids` tem de ser o conjunto
  derivado das movimentações citadas) e `arquivo_path = id::text || '.docx'`. Mais o índice
  `termos_gerados_arquivo_path_idx`, que serve o predicado de storage.
  - **Por que os dois invariantes, e não só a filial:** sem a âncora, gatear `ativo_ids` é parede de
    papel no INSERT — o atacante declara os ativos DELE, passa o gate e **queima a vaga** da chave
    única `(tipo, movimentacao_ids)` da outra filial, que nunca mais gera aquele termo (é
    literalmente o dano da `0068`, em documento). Sem o path canônico, ele aponta a própria linha
    para o `.docx` alheio e, pelo `bool_and`, passa a **BLOQUEAR** a regeneração legítima da outra
    filial — um DoS de brinde ao fechar o furo.
  - **Por que o `coalesce(…, true)` no storage:** `persistirTermo` sobe o objeto **ANTES** de gravar
    a linha, então uma policy que exigisse linha correspondente quebraria TODA geração de termo. E
    não abre nada: para destruir o `.docx` da f5, o nome **ESTÁ** referenciado pela linha da f5.
  - **As USING ficam só com a filial**, de propósito: é isso que deixa o admin APAGAR linha legada
    ou degenerada. Quem barra a CRIAÇÃO de linha inválida são as WITH CHECK.
  - ⚠ **Consequência para código novo:** quem inserir em `termos_gerados` tem de **mandar o `id`** e
    derivar o path dele. Deixar o default `gen_random_uuid()` gerar o id e mandar um path qualquer
    passa a ser recusado.

  **⚠ A consulta de PRÉ-APLICAÇÃO é OBRIGATÓRIA — e a que importa é a última.** Nenhum contador
  impede o apply (a migration é aditiva e as USING não exigem coerência), mas cada um muda **quem
  alcança** as linhas que já existem; e a junção `arquivo_path × storage.objects.name` é a única que
  diz se a metade de **STORAGE é no-op**: os dois lados casam por **igualdade de string**, e nada no
  banco garante essa igualdade — só o código. Se `path_sem_objeto > 0`, o nome daquela linha é
  "não referenciado" pelo lado de storage, o `coalesce(…, true)` vale, e o **DELETE do `.docx` dela
  continua aberto** — com todas as verificações pós-apply verdes. Normalize o path (ou renomeie o
  objeto) antes de confiar na metade de storage para aquelas linhas. Os 5 contadores
  (`total`, `path_fora_do_padrao`, `com_ativo_morto`, `ativo_ids_vazio`, `incoerente`) e as duas
  junções estão no cabeçalho da migration, prontos para colar. A que faltava, e que não pode faltar
  de novo:

  ```sql
  -- a metade de STORAGE é no-op para toda linha em que path_sem_objeto contar
  select count(*) filter (where o.name is null)     as path_sem_objeto,
         count(*) filter (where o.name is not null) as path_casa_objeto
    from public.termos_gerados t
    left join storage.objects o
           on o.bucket_id = 'termos' and o.name = t.arquivo_path;
  ```

  **Medido em produção ANTES do apply:** **6** termos · `path_fora_do_padrao` **0** ·
  `com_ativo_morto` **0** · `ativo_ids_vazio` **0** · `incoerente` **0** · junção
  `arquivo_path × storage.objects.name` **6/6 casando** (nenhuma linha legada vira matéria de admin,
  e a metade de storage protege todas as 6) · **3** objetos do bucket `termos` não referenciados por
  linha nenhuma (9 objetos, 6 linhas — resíduo de regeneração, que o fallback deixa livre por
  desenho).

  **⚠ `e_admin()` é a PRIMEIRA condição de `pode_escrever_termo`, FORA do `and`.** A primeira
  escrita da migration tinha `coalesce(array_length(p_ativo_ids,1),0) > 0 and (e_admin() or not
  exists (…))`, e **três refutadores independentes** acharam o mesmo defeito: para
  `ativo_ids = '{}'` isso é FALSE para todo mundo, admin incluído — nas 3 policies da tabela E no
  predicado de storage (`bool_and(false)`). A linha viraria lixo **IMORTAL** (nem UPDATE nem DELETE
  por sessão nenhuma), o `.docx` dela indestrutível e insobrescrevível, e a vaga
  `(tipo, movimentacao_ids)` queimada **para sempre** — exatamente o dano que a migration existe
  para fechar, criado por ela. O estado é representável hoje (não há CHECK sobre `ativo_ids`) e é o
  resíduo que um atacante deixaria. A asserção `5h` do roteiro existe **só** para travar essa ordem;
  quem mexer no predicado e a vir falhar não deve "consertar o teste".

  **⚠ O exploit NÃO foi reproduzido** (ao contrário da `0067`/`0068`): a revisão foi read-only e
  `termos_gerados` tem ZERO linhas no ensaio, então não havia vítima sem plantar fixture. A prova é
  o roteiro, rodado **ANTES** do apply (os `2i-bis` devem FALHAR, provando o furo aberto) e
  **DEPOIS** (todos verdes).

  **Verificação pós-apply nos dois bancos:** as 3 funções com `prosecdef = true`, `anon` sem execute
  e `authenticated` com execute; as 3 policies da tabela citando `pode_escrever_termo` e as 3 do
  bucket citando `pode_escrever_arquivo_termo`; `policies_public` **39** e `policies_storage` **8**
  — **inalterados**, porque são `alter policy` e não policy nova; acervo **idêntico ao pré**
  (ativos 1230, movs 2363, perfis 10, termos 6, objetos `termos` 9).
  **Advisor:** `authenticated_security_definer_function_executable` **cresce em 3** — inerente ao
  desenho, porque a expressão de policy é avaliada com os privilégios de quem consulta e portanto
  `authenticated` precisa de EXECUTE; as três respondem só sobre o próprio chamador. Precedente
  aceito na `0062` (as três da fase) e na `0068` (`estorno_item_coerente`).
  **Descoberta lateral que economiza uma hora:** `storage.objects` tem um trigger
  `protect_objects_delete` (`BEFORE DELETE FOR EACH STATEMENT`) que barra **toda** exclusão direta
  por SQL — a policy de DELETE do bucket só é exercitada pela API de Storage. Quem for testar
  exclusão de objeto por `psql`/MCP bate no trigger, não na policy; por isso a asserção prova o
  INSERT sobre o path alheio, que usa o mesmo predicado.

  **Rollback** (reabre o furo — só faz sentido junto de um rollback completo da F21): as 6
  `alter policy` de volta a `(select public.papel_atual()) in ('admin','operador')` (as 3 de storage
  com o `bucket_id = 'termos' and` na frente), `drop index public.termos_gerados_arquivo_path_idx` e
  `drop function` das três. Lista literal no rodapé do cabeçalho da migration.
- **`0070`** (F21 — a desativação passa a fechar a **LEITURA**; mesma revisão da `0069`;
  30/07/2026) — **aditiva**: **14 `alter policy`, zero objeto novo, zero dado tocado**. Caminho
  **A**, ensaio primeiro e depois produção, no ledger dos dois.

  **O furo.** A `0061` escreveu, e a `0063` repetiu como "REGRA DE OURO", que `profiles.ativo =
  false` vale "no request seguinte". Vale — **para escrita**. Toda policy de SELECT seguia
  `using (true)`, e o `authenticated` de quem foi desligado continua sendo `authenticated` enquanto
  o access token dele não expira (~1h). Nesse intervalo o acervo inteiro saía por
  `GET /rest/v1/ativos?select=*` com a anon key do bundle — colaborador, setor, filial e patrimônio
  —, e o mesmo valia para `movimentacoes` (quem levou o quê), `termos_gerados`, `anotacoes` e
  `profiles` (a equipe toda). As **5 views** (`security_invoker = true`) e as **7 RPCs `rel_*`**
  (INVOKER) **derivavam** o mesmo vazamento. O ban do Auth (`ban_duration`) impede login NOVO; não
  invalida o token que a pessoa já tem na mão. A UI mandava o desligado para
  `/login?erro=acesso-desativado`, mas a UI nunca foi a defesa.

  **A correção.** Um predicado só — `using ((select public.papel_atual()) is not null)` — nas **13**
  policies de SELECT de `public` (`ativos`, `movimentacoes`, `anotacoes`, `lancamentos_item`,
  `termos_gerados`, `relatorios_gerados`, `filiais`, `motivos`, `itens`, `kits_modelos`, `profiles`,
  `operador_filiais`, `pendencias_item`) **+ 1** no SELECT do bucket `termos`. `papel_atual()` é NULL
  em três situações equivalentes a "não é mais gente daqui": sem sessão, sem linha em `profiles`,
  perfil desativado. **Não é recorte por cargo nem por filial** — `consulta` segue lendo o app
  inteiro e `operador` segue lendo todas as filiais; para todo perfil ATIVO o resultado é idêntico
  ao de antes, linha por linha. As views e as RPCs `rel_*` herdam **sem DDL**: é o mesmo
  `security_invoker`/INVOKER que fazia o vazamento derivar. Ficam de fora por já satisfazerem a
  invariante: `import_logs`/`eventos_admin` (SELECT já é `(select e_admin())`),
  `senhas_acesso`/`senha_tentativas` (RLS ligada e ZERO policy) e o bucket `backups-import` (as 4
  policies já são `e_admin()`, `0066`). O `(select …)` é obrigatório e não estético: sem argumento de
  coluna a expressão vira **InitPlan**, avaliada uma vez por statement e não por linha — e são estas
  as policies que varrem o acervo.

  **⚠ Isto é EMENDA a uma invariante escrita em quatro lugares** ("todo logado LÊ tudo"):
  `CLAUDE.md`, ADR-002 §3, o cabeçalho da `0063` e `docs/MATRIZ-REGRAS.md` (R-ACC-02 / C7 /
  R-ACC-21). Os quatro são emendados no MESMO commit. Deixar a lei escrita dizendo o contrário do
  banco é como se produz o próximo furo: o próximo agente "corrige a regressão" e reabre isto.

  **⚠ A ausência de recursão em `profiles` é PREMISSA DE CATÁLOGO, não intuição.** A policy de
  SELECT de `profiles` passa a chamar `papel_atual()`, que LÊ `profiles`. Não recursa porque
  `papel_atual()` tem `prosecdef = true` com `proowner = postgres` (o `prosecdef` também impede o
  inlining da função SQL, o outro caminho de auto-referência) **e** `public.profiles` tem
  `relowner = postgres` + `relforcerowsecurity = false` — dentro da função `current_user` é o dono
  da tabela, e dono ignora RLS na própria tabela salvo `FORCE ROW LEVEL SECURITY`. **Confira os três
  antes de aplicar em banco novo** (`pg_class.relowner`/`relforcerowsecurity` + `pg_proc.prosecdef`/
  `proowner`); se algum cair, o erro é `42P17 "infinite recursion detected in policy for relation"`
  — ruidoso e imediato, não silencioso. *(Medido na F62, 22/09/2026: quem de fato segura a leitura interna fora da
  policy é o ATRIBUTO do dono — `postgres` tem `rolbypassrls` no banco hospedado e é superusuário no CI, e isso vence
  até o `force`. Confira também `pg_roles.rolbypassrls` do dono; o cenário 9o de `isolamento_tenant.sql` trava isso.)* O roteiro provoca esse caminho de propósito (`1b-bis`).

  **⚠ Operacional: a conta de `SMOKE_EMAIL` tem de estar ATIVA em `profiles`.**
  `scripts/smoke/smoke-prod.mjs` é o **único** consumidor que roda sob SESSÃO — anon key +
  `signInWithPassword`, e não service role —, então com a `0070` um perfil desligado passa a falhar
  **em massa** nas leituras (`v_fila_pendencias`, `v_pendencias`, `rel_saldo_itens` ×2, `rel_resumo`,
  `rel_mov_por_mes`, `v_estoque_atual`). Falhar aí é **por desenho**, não regressão: quem desativar
  a conta do smoke em `/admin/usuarios` derruba o smoke, não o app. **O outro ponto que quebra se
  alguém mexer num default:** `definirAcesso` (`actions/auth.ts`) faz
  `update profiles … .select('id')`, e o `.select()` depois de um UPDATE do PostgREST **exige** a
  policy de SELECT. Hoje funciona porque `handle_new_user` insere só (id, primeiro_nome, sobrenome) e
  `papel`/`ativo` assumem os defaults da `0061` (`'operador'`, `true`), então `papel_atual()` já é
  não-nulo no primeiro request de quem aceitou o convite. Quem mudar o default de `profiles.ativo`
  para `false` ("conta pendente até aceitar") mata o convite na última tela, sem erro no banco.

  **Verificação pós-apply nos dois bancos:** **0** policies de SELECT com `qual = 'true'` e **0** de
  escrita com predicado `true`; `policies_public` **39** e `policies_storage` **8** (inalterados —
  são `alter policy`); acervo **idêntico ao pré** (ativos 1230, movs 2363, perfis 10, termos 6,
  objetos `termos` 9). Advisor **sem mudança nenhuma** (`rls_policy_always_true` não aponta policy de
  SELECT). O visualizador por senha fica **intocado**: ele é `anon` e é servido pelo client de
  service role (`rolbypassrls = true`), então estas policies nunca foram a porta dele — e é por isso
  que a `0070` também **não fecha nada** do lado do viewer, onde o mecanismo continua sendo a
  revogação da senha.

  **Roteiro `supabase/tests/papeis_rls.sql`** (cobrindo as duas migrations): **47 → 64 asserções**,
  **64 OK / 0 falhas nos DOIS bancos**, sem resíduo (conferido depois em produção:
  `residuo_ativos` 0, `residuo_contas` 0). As de ataque entram **em par** com as legítimas, de
  propósito: `4d`/`4e`/`4f`/`4g` (o desligado não lê `ativos`, `profiles`, os `.docx` do bucket nem a
  view) ao lado de `1b-bis`/`1b-ter` (o cargo mais fraco, ATIVO, continua lendo `profiles` e
  `v_estoque_atual`) — sem esse par, um gate que **cegasse o app** passaria verde.

  **Rollback:** as 13 `alter policy` de volta a `using (true)` e a de storage a
  `using (bucket_id = 'termos')` — lista literal no rodapé do cabeçalho da migration. As reversões
  da `0069` e da `0070` são **independentes de propósito**: derrubar o gate de leitura não pode
  reabrir o furo do termo.
- **`0079`–`0088`** (F23 — as ferramentas destrutivas do cargo dev; 30/07/2026) — **dez
  migrations, aplicadas por MCP em ensaio primeiro e depois em produção**, todas no ledger dos
  dois. Nenhuma linha de acervo foi tocada em produção: contagens antes = depois (ativos 1232,
  movimentações 2377, lançamentos 9, termos 7), e `movimentacoes.forcado` segue **0** — a fase
  INSTALA as ferramentas, usá-las é decisão do dev, depois.

  **⚠ O GATE NÃO BARROU — de novo, e vale registrar o precedente.** Três destas migrations
  (`0080`, `0082`, `0083`, `0087`) contêm `delete from public.ativos` / `delete from
  public.movimentacoes` no corpo, e o `apply_migration` do MCP **aceitou as quatro**. Mesmo
  motivo da `0048` e da `0064`: em `create or replace` o corpo é redefinido, não executado.
  O caminho **B** ficou preparado mas não foi preciso.

  **⚠ ORDEM DE APPLY OBRIGATÓRIA — `0080` ANTES da `0081`.** A `0081` instala o trigger
  `guarda_acervo`, que recusa exclusão de acervo fora da janela `estoque.dev_destrutivo`; a
  `0080` é que ensina a RPC de import a abrir essa janela. Na ordem inversa, o "Substituir
  tudo" fica QUEBRADO na janela entre as duas.

  **O que cada uma faz:** `0079` a coluna `forcado` (a marca); `0080` o import abre a janela;
  `0081` a guarda (função + 3 triggers); `0082` apagar ativo/movimentação/item; `0083` resetar
  acervo/itens + o caminho nomeado do `db:reset`; `0084` forçar estado/saldo; `0085`
  vocabulário da trilha + a 8ª checagem; `0086` a prévia do reset; `0087` correções da prova;
  `0088` superfície de RPC.

  **A prova de que a `0080` é diff mínimo** (o método é reaproveitável para qualquer recriação
  de função grande): o corpo vivo era idêntico nos dois bancos
  (`md5(regexp_replace(pg_get_functiondef(oid),'\s+',' ','g'))` = `d533780c5084f907c27d29d8f4af5642`,
  17.486 bytes). **Depois** do apply, remove-se do corpo vivo só as linhas marcadas `F23` e
  recalcula-se o md5 — ele volta a ser `d533780c…`. Isso prova, em cada banco, que a
  recriação não introduziu NENHUMA outra diferença — inclusive contra erro de transcrição, que
  é o risco real quando se cola 19 KB de função à mão.

  ```sql
  with viva as (
    select pg_get_functiondef('public.importar_ativos_substituir(jsonb,text,jsonb,jsonb)'::regprocedure) as d),
  sem_f23 as (
    select string_agg(l, e'\n' order by ord) as d
      from viva, regexp_split_to_table(viva.d, e'\n') with ordinality as t(l, ord)
     where l !~ 'F23' and l !~ 'dev_destrutivo' and l !~ 'guarda_acervo'
       and l !~ 'sem este fecho' and l !~ 'correriam com a guarda')
  select md5(regexp_replace((select d from sem_f23),'\s+',' ','g')) = 'd533780c5084f907c27d29d8f4af5642' as fiel;
  ```

  **Verificação pós-apply nos dois bancos:** 12 funções novas, todas `definer`, com
  `anon = false`; `authenticated = true` nas oito ferramentas + `previa_reset`, e **invertido**
  em `resetar_dados_ficticios` (`authenticated = false`, `service_role = true`) e **fechado**
  em `guarda_acervo` (ninguém); `abre = fecha − 1` em toda RPC que abre a janela (o `−1` é o
  fecho do bloco `exception`); os 3 triggers com os eventos certos (`ativos` **só DELETE**);
  `notify pgrst, 'reload schema'` nos dois.

  **A guarda MORDE — provado em PRODUÇÃO, dentro de `begin; … rollback;`** (para que nem uma
  falha da guarda pudesse tocar dado real): como **service role**, `delete` e `update` em
  `movimentacoes`, `delete` em `ativos` e em `lancamentos_item`, `insert` com `forcado = true`,
  e as RPCs `apagar_ativo`/`previa_reset` → **todos 42501**; e o INSERT legítimo de
  movimentação **continua passando**. Era a garantia que o critério 7 pedia e que **não
  existia**: antes da `0081`, a imutabilidade era a AUSÊNCIA de policy de UPDATE/DELETE, que
  não segura quem tem `rolbypassrls`.

  **Advisors (produção, antes → depois):** `rls_enabled_no_policy` 3 → 3 (as mesmas
  pré-existentes); `authenticated_security_definer_function_executable` 17 → 26 (+9 líquido,
  depois da `0088` devolver duas). São da mesma classe inerente que a `0062`/`0069` já
  aceitaram: função chamada com o client de sessão precisa de `execute` para `authenticated`, e
  cada uma tem guarda interna. **Nenhum WARN novo de RLS.**

  **⚠ Efeito colateral que muda uma ferramenta de desenvolvimento:** `scripts/reset.ts` NÃO
  apaga mais por `.delete()` — a guarda recusaria o service role. Ele passou a chamar
  `resetar_dados_ficticios('RESETAR DADOS FICTICIOS')`. A proteção contra rodar em produção
  continua sendo `scripts/env-guard.ts` (`REFS_DE_PRODUCAO`), do lado do script.

  **Rollback lógico** (reabre o acervo para o service role — só faz sentido junto de um
  rollback completo da F23): `drop trigger` nos três + `drop function public.guarda_acervo()`;
  `drop function` das ferramentas; reaplicar o corpo da `0064` no import; `drop column forcado`
  nas duas tabelas. **Nenhum dado do acervo se perde em nenhum passo.**
- **Retroativo C3 (F15 — toca dado, caminho B).** UPDATE de **2 linhas** de `movimentacoes` (`tipo 'compra'→'troca'` no nascimento dos substitutos já registrados, `ativo_id in (select id from ativos where substitui_ativo_id is not null)`). O classificador **não barrou** um UPDATE de 2 linhas via `execute_sql`. Backup das linhas em `scratchpad/f15/retroativo-backup.md` (WAP0005656/WAP0005657); antes=depois conferido (`compra` de substituto 2→0, `troca` 0→2); `status_resultante`/estado dos ativos intactos (a transição de `troca` é a mesma da `compra`). Rollback: `update movimentacoes set tipo='compra' where id in ('5cc393bc-…','95d3d096-…')`.
- **`0131` + `0132`** (F51/F52 — a decomposição da RPC de import e as guardas de escopo no-op; escritas em 08/09/2026, **aplicadas em produção só em 09/09/2026**, na v1.59.1) — as duas na **mesma janela e nessa ordem**, porque a `0132` recria `import_validar_plano` e `importar_ativos_substituir`, que só existem na forma decomposta depois da `0131`. **Nenhuma toca dado:** 11 funções novas, 4 recriadas, 1 índice (`import_logs_filial_hash_idx`) e 2 `comment on`. O ensaio já as tinha desde o desvio da F54.

  **⚠ O gate não disparou — medido, e o Anexo já tinha dois precedentes disso.** A seção "O gate do modo automático" diz que o classificador bloqueia DDL cujo corpo contenha `delete from public.ativos`. Uma sonda de `execute_sql` com essa string dentro de um ramo `if false then` passou, e o acervo ficou intacto (1621). Isso **concorda com a `0048` e com a `0064`**, que este mesmo Anexo registra como *"o `apply_migration` não barrou — o corpo não é executado no apply, só redefinido"*. A frase da seção do gate é mais forte do que o comportamento medido, três vezes agora.

  **Como foi aplicada, e por que não por colagem.** Por um script que faz `readFileSync` do arquivo e um POST à Management API, conferindo o **sha256 contra `migrations.lock.json` antes de enviar** e abortando se divergir. O motivo é o incidente F7E (colar a migration errada) e o risco de colagem truncada: 42.554 + 48.144 bytes não se conferem a olho. Cada arquivo foi **uma única execução** — nenhuma das duas tem `begin/commit` explícito, então a atomicidade depende disso.

  **Verificação pós-apply.** Os 6 itens do rodapé da `0131`: 1 assinatura sem overload; `authenticated=true`/`anon=false`/`service_role=false` na orquestradora; as 8 auxiliares fechadas nos três papéis (0 de 24 abertas); **nenhuma** com entrada de ACL de grantee vazio (o `=X/` que representa PUBLIC — ⚠ um `like '%=X/%'` casa também com `postgres=X/postgres` e dá falso positivo: teste `a::text like '=%'` sobre `unnest(proacl)`); resíduo do item N ausente; `notify pgrst` emitido. `get_advisors(security)`: **nenhuma das 11 funções novas** aparece entre as `security definer` alcançáveis pelo `authenticated`. Smoke de produção **108 OK · 1 aviso · 0 falha**. Acervo antes = depois (ativos 1621).

  **A prova forte é a sonda de paridade**, e ela achou uma herança: as 10 classes batem em contagem com o ensaio e **9 bateram em fingerprint**. A décima (`func`) divergia em três funções — `apagar_ativo`, `apagar_item` e `reabrir_pendencias_item_com_estornos` — e **só em linhas de comentário**: removendo os comentários de linha, o fingerprint das **76** funções já era idêntico nos dois (`98bf752c5fbf5a48b05f7edcceac9d2e`). **Fechada no mesmo dia** reemitindo os três `create or replace` recortados por script das migrations vigentes (`0082` 96-235 e 434-507, `0122` 56-164), **em produção e no ensaio**: `func` = `bf4bddddb44ef22d8b64c80fb83e4e95` nos dois, `grant_func` inalterada, 10 de 10.

  ⚠ **A causa NÃO é o caminho do apply** — a primeira leitura disto dizia "crase perdida numa colagem manual" e estava errada (generalizava de `apagar_item`; `apagar_movimentacao` tem quatro crases e batia, `reabrir_pendencias` não tem nenhuma e divergia). A causa é **edição de comentário em migration já aplicada**, pelo caminho `npm run db:lock -- --regravar-alterada`. Havia **três variantes** do mesmo comentário em circulação, e a mais nova era a do **repositório**: produção e ensaio estavam ambos atrás dele, cada um num ponto diferente. **A referência é sempre o repositório, nunca o banco gêmeo.** Ata completa em `docs/DECISOES.md`.

  ⚠ **O buraco de processo que isto expõe, e que segue aberto:** cada edição não-executável de migration aplicada deixa para trás, em silêncio e para sempre, todo banco que já a aplicou — nada reaplica a função. Hoje só a sonda de paridade acusa, e ela só é rodada em janela de apply.

  **Ledger.** Registradas como `20260901000131`/`20260901000132` (mesma convenção que o ensaio usa), junto com `0136`/`0137`, que a F54 aplicou em produção e **não** havia registrado — cada uma conferida **pelo efeito** antes de entrar, que é a regra deste Anexo.

  **Rollback** (nenhum passo perde dado): `create or replace` de `apagar_ativos_conflito_filiais` com o corpo da `0100`; idem `importar_ativos_substituir` e `import_validar_plano` com os corpos da `0131`; `exigir_gestao_de` com o da `0074`; `drop` + `create` de `existe_outro_admin_ativo(uuid)` da `0074` **reemitindo os revokes da `0078`** (único passo que perde privilégio); `drop` de `mesmo_escopo_de_gestao`, `exigir_ativos_da_empresa` e `prefixo_backup_import`; `drop index import_logs_filial_hash_idx`; e só **então** `create or replace` de `importar_ativos_substituir` com o corpo monolítico da `0094` seguido do `drop` das 8 auxiliares. Fingerprints normalizados de antes, para conferir a volta: `importar_ativos_substituir` `0c5f33bbfc7e812dd8fb4ca3e87070c0` · `apagar_ativos_conflito_filiais` `f21695b89d7d5051ddf9d43cc00bf3e6` · `exigir_gestao_de` `13dabe501de45d7527a3be80ca6cfe87` · `existe_outro_admin_ativo(uuid)` `7dcc8eb131619919c5ef4fa7843052ca`.
- **`0141` a `0145`** (F60 — o recorte que corta scan; escritas em 16/09/2026, **v1.65.0**) — **APLICADAS nos dois bancos em 17/09/2026**
  (atas F60 (l) e (m) em `docs/DECISOES.md`; evidências `docs/f60-evidencias/apply-ensaio.txt`,
  `apply-producao-antes-do-merge.txt` e `pos-deploy-e-drop.txt`). O canal de apply (o conector MCP da Supabase) caiu
  durante a execução — o PR #52 ficou aberto e sem merge (ata (j)) — e voltou no mesmo dia. O CI foi refeito sobre o HEAD
  antes do merge (run 35215000369, `5bbc0ca`, verde). Os "Ensaio · produção" abaixo trazem o RESULTADO; o parágrafo
  seguinte guarda o estado do CI na hora do bloqueio. O que
  existe de prova de banco é do CI (`banco-sem-docker`, cadeia `0001`→`0145`, run 35178186717: 35 roteiros, 855
  asserções, 90/90 mutações) e das emulações só leitura em ensaio e produção (`docs/perf/f60-*.json`). ⚠ **Esse run é de
  `d83f8ec`.** Depois dele vieram `5094f6f` (comentários da `0143`/`0145`/`f60_recorte.sql`, com o lock das duas
  regravado) e a revisão final (a trava de mesa, o instrumento da equivalência, o registry) até o **SHA de código
  congelado `c516467`** — e o CI NÃO rodou sobre eles (`npm run test`, `lint`, `tsc`, `build` e `verificar:actions`
  verdes na mesa, `docs/f60-evidencias/revisao-final-build.txt`).

  **O plano: cinco migrations, em duas janelas de produção.** **`0141`, `0142` e `0143` ANTES do merge** (nada que a
  `1.64.0` no ar chame: uma função nova, um índice, sete funções de nome novo) e **`0144` e `0145` DEPOIS do deploy**,
  pela receita de "A janela do `drop`" (a `0144` muda o plano do que a `1.64.0` lê; a `0145` derruba o que ela chama).
  **Nenhuma toca dado.** Nenhuma bate no gate (sem `delete from ativos/movimentacoes`): caminho **A**, **ensaio
  primeiro** e **só depois de o CI (`banco-sem-docker`) ter rodado a cadeia `0001`→`0145` SOBRE O SHA QUE VAI SER
  APLICADO** (emenda F56). O run 35178186717 é de `d83f8ec`, anterior à regravação do lock da `0143`/`0145` e ao SHA
  congelado `c516467`: antes do primeiro apply, um CI verde (`verificar` e `banco-sem-docker`) sobre o HEAD do PR #52 é
  exigido — não se reaproveita o run antigo. *(Corrigido na revisão final, 17/09/2026: o texto dava a pré-condição por
  cumprida.)* No ensaio as cinco vão na ordem da cadeia, sem esperar deploy (não há app de produção lá). `npm run db:lock` e
  `DA_F38` de `src/lib/itens/migrations-f38.test.ts` já estão no repositório para as cinco; a `0143` entrou em
  `RECRIACOES_AUTORIZADAS` e a `0145` em `REMOCOES_AUTORIZADAS` (a guarda de intocáveis passou a ler `drop`, nome citado
  e `drop routine` na revisão do lote 2).

  **`0141_rel_contagem_status.sql`** — cria `rel_contagem_status_filiais(p_filiais smallint[])` → `(status, total)`, os
  KPIs do dashboard numa ida; `revoke all … from public, anon` + `grant execute … to authenticated, service_role` na
  mesma migration (função nova em `public` nasce com EXECUTE para `anon`). **Verificação pós-apply** (o rodapé dela):
  1 assinatura; `prosecdef = false`, `provolatile = 's'`, `proisstrict = false`, `proconfig = {search_path=public}`;
  `anon` false · `authenticated` true · `service_role` true, e a `proacl` sem a entrada de PUBLIC (teste `a::text like
  '=%'` sobre `unnest(proacl)` — `like '%=X/%'` casa `postgres=X/postgres`); `md5(regexp_replace(prosrc,'\s+',' ','g'))`
  igual ao do corpo do arquivo; `count(*)` com `null` e com `'{}'` = 0; a soma do
  consolidado (a lista de todas as filiais) = `count(*)` de `ativos`; `notify pgrst, 'reload schema'`. Ensaio: aplicada
  (ledger `rel_contagem_status`), md5 `695b38a8…`, NULL/`'{}'` 0, consolidado = ativos · produção: aplicada antes do merge,
  idem; o plano chamando a função: `Index Only Scan ativos_filial_status_idx`, 1,36 ms, 272 buffers. **Rollback:** se o app que a chama estiver no ar, reverter o app PRIMEIRO (o dashboard volta a ler
  as páginas de `ativos`); só então `drop` da assinatura e `notify pgrst, 'reload schema'`.

  **`0142_lanc_item_criado_por_idx.sql`** — cria `lanc_item_criado_por_idx on public.lancamentos_item (criado_por,
  created_at desc, id desc) where estorna_id is null`, com o "antes" do ensaio no cabeçalho (sem lançamento, 50.035
  linhas: 10,406 ms, 1.286 buffers, `Incremental Sort` sobre `lanc_item_created_idx`). ⚠ `create index` sem
  `concurrently` (que não roda em bloco de transação): em produção `lancamentos_item` tem 155 linhas, e o bloqueio de
  escrita dura o tempo de montar um índice de 155 linhas. **Verificação pós-apply:** em `pg_indexes`, o `indexdef` traz
  `btree (criado_por, created_at DESC, id DESC)` e `WHERE (estorna_id IS NULL)`; no ENSAIO, o harness
  `scripts/perf/medir-itens.mjs` no mesmo patamar (50 mil, marcador de limpeza, contagem antes e depois) mostra `Index
  Scan using lanc_item_criado_por_idx` sem nó de sort e os buffers parados — o "depois", que vai para a evidência e NÃO
  para o cabeçalho (a trava de hash o congelou). Ensaio: aplicada (ledger `lanc_item_criado_por_idx`); o "depois" do harness — sem lançamento 10,406 → **0,017 ms**, 3
  buffers, sem sort (`docs/perf/f60-itens-ensaio-depois.json`) · produção: aplicada antes do merge, `indexdef` conferido;
  já fora de `unused_index` nos advisors depois do deploy. **Rollback:** `drop
  index if exists public.lanc_item_criado_por_idx` — só muda o plano; o primeiro a ser desfeito.

  **`0143_rel_filiais.sql`** — cria as SETE `rel_*_filiais` com os grants de cada uma. As cinco simples mudam SÓ o
  recorte; `rel_mov_itens_filiais` ganha a guarda `exists` de filiais; `rel_saldo_itens_filiais` devolve dois níveis;
  `rel_estoque_asof_filiais` é a lateral ancorada em `ativos`. **Antes do apply, a equivalência EMULADA** fechou nos dois
  bancos (1.004 células cada, com a `0141`; zero divergência — `docs/perf/f60-equivalencia-emulada.json`; migration
  aplicada não se edita, e erro achado depois custa migration nova). **Verificação pós-apply**, cada banco: sete linhas em
  `pg_proc`, cada `oid::regprocedure` com `smallint[]` na frente e sem overload; os atributos da 7d nas sete; `anon` false
  / `authenticated` true / `service_role` true nas sete e nenhuma `proacl` com PUBLIC; o `md5` normalizado do `prosrc` de
  cada uma igual ao do cabeçalho (`rel_mov_por_mes_filiais` `f961349d…`, `rel_por_motivo_filiais` `4340acc3…`,
  `rel_resumo_filiais` `ad948cbb…`, `rel_frescor_itens_filiais` `edd2fa35…`, `rel_mov_itens_filiais` `55be37e2…`,
  `rel_saldo_itens_filiais` `01aa17a8…`, `rel_estoque_asof_filiais` `54943d2f…`); `count(*)` com `null` e `'{}'` = 0 nas
  sete; `notify pgrst, 'reload schema'`; **a equivalência com a FUNÇÃO de verdade** nas mesmas células (só contagem e hash) —
  `node scripts/perf/equivalencia-rel.mjs gerar-equivalencia-real --alvo=<ensaio|producao>
  --datas=docs/perf/f60-datas-amostra.json --dir=<fora-do-repo>`, cada bloco pelo canal com a resposta em
  `<dir>/respostas/<nome>.resposta.txt`, e `analisar-equivalencia --real --dir=<…> --saida=<…>`; o bloco recusa sozinho função
  nova ausente, `prosrc` aplicado diferente do versionado e função velha já derrubada (roda ENTRE o apply da `0143` e o
  da `0145`) — hash diferente em qualquer célula segura o merge; `get_advisors(security)` sem achado novo; em produção, ainda antes do
  merge, `scripts/formas/conferir.mts` sobre os descritores novos (conta do smoke, só contagens), o `explain` "depois" das sete pelo
  `medir-rel.mjs gerar-a1 --funcao=<nome>_filiais` e o de `rel_contagem_status_filiais` e do as-of, com a confirmação do
  orçamento, pelo `equivalencia-rel.mjs gerar-custo-real --alvo=producao --hoje=AAAA-MM-DD --dir=<…>` + `analisar-custo --real
  --dir=<…> --saida=<…> --confirmar-orcamento=docs/perf/asof-orcamento.json` (grava só `medicao.confirmacao`). ⚠ Num banco com a `0143` e sem a `0145`, o bloco 7 de `catalogo_secdef.sql` fica VERMELHO em
  `7a`/`7b` nomeando as sete velhas — é o estado esperado da janela, não um defeito. Ensaio: aplicada (ledger
  `rel_filiais`), os sete md5 iguais, equivalência com a função de verdade 1.004/1.004 · produção: aplicada antes do merge,
  os sete md5 iguais, equivalência real 1.004/1.004 (`docs/perf/f60-equivalencia-real.json`), conferidor 271 pontos sem
  reprovação, `explain` "depois" (`f60-producao-depois-rel.json`), orçamento confirmado (razão 0,833). **Rollback:** antes da `0145` — se o app novo estiver no ar, reverter o app PRIMEIRO; só então `drop` das
  sete (as assinaturas com `smallint[]` na frente, as mesmas dos `revoke` do fim do arquivo) e `notify pgrst, 'reload
  schema'`; derrubar antes do revert quebra o app no ar com 404. Depois da `0145` — ver a ordem da fase, abaixo.

  **`0144_colaboradores_textos_por_nome.sql`** — `create or replace view public.v_colaboradores_textos` com a chave por
  NOME distinto: mesmas colunas, mesma ordem, mesmos tipos, `security_invoker` mantido; `v_colaboradores_consolidacao`
  herda sem ser recriada. **Vai a produção DEPOIS do deploy**, na janela, antes da `0145`. **Verificação — a sonda de
  igualdade de conjunto IMEDIATAMENTE ANTES e IMEDIATAMENTE DEPOIS do apply, no mesmo banco:**
  `select count(*), md5(string_agg(v::text, '|' order by v::text)) from public.v_colaboradores_textos v;` — os dois
  pares iguais (diferente → rollback, sem discussão: a tela não pode perder linha nem número); `reloptions` =
  `{security_invoker=true}`; `notify pgrst, 'reload schema'`. A emulação em produção deu 922 linhas e o mesmo `md5`,
  ~100 → ~50 ms (`docs/perf/f60-colaboradores-emulacao-producao.json`). Ensaio: aplicada (ledger
  `colaboradores_textos_por_nome`), 780 linhas · md5 `816c2505…` antes e depois · produção: aplicada na janela, depois do
  deploy, 923 linhas · md5 `08374799…` antes e depois, o resumo idêntico. **Rollback:** `create or replace view` com o corpo da `0115` (o agregado por
  `colaborador_chave(t.nome)` com os dois `mode()`) e `notify pgrst, 'reload schema'` — independe do app, porque as
  colunas são as mesmas nos dois sentidos.

  **`0145_drop_rel_filial.sql`** — `drop function` das sete assinaturas velhas, sem `if exists` e sem `cascade`:
  `rel_estoque_asof(smallint, date)` (corpo vivo `0134`), `rel_saldo_itens(smallint, date)` (`0027`),
  `rel_mov_itens(smallint, date, date)` e `rel_frescor_itens(smallint, date)` (`0016`), `rel_mov_por_mes`,
  `rel_por_motivo` e `rel_resumo` (`smallint, date, date`, `0011`). **Em produção, só pela receita de "A janela do
  `drop`"**: T0 → tráfego → espera ≥ 30 min → T1; Δ velhas 0 nos três papéis, Δ novas > 0 em `authenticated`, `dealloc` e
  `stats_reset` iguais — em produção, T0 11:26:39Z → T1 11:57:59Z (31,35 min): as sete velhas Δ 0 em `authenticated` e
  `service_role`, nenhuma em `anon`; as oito novas de +1 a +122 em `authenticated`; `dealloc` 0 = 0; `stats_reset` igual
  (`docs/f60-evidencias/janela-do-drop.json`). **Verificação pós-apply:** `notify pgrst, 'reload schema'`; `to_regprocedure` das sete
  = `null`; as sete `_filiais` e `rel_contagem_status_filiais` vivas, uma assinatura cada, com os grants; smoke com 0
  falha; sonda de paridade ensaio × produção (`func` e `grant_func` batendo, as velhas fora nos dois). Ensaio: aplicada (ledger
  `drop_rel_filial`), as sete `null` · produção: aplicada às 11:59Z, as sete `null`, nove `rel_*` vivas com os grants,
  smoke 109 OK · 0 falha, paridade **11 de 11** classes, bloco 7 só leitura verde nos dois bancos. **Rollback:** ver a ordem da fase, logo abaixo.

  **Tipos — as DUAS regenerações.** `src/lib/types/database.ts` entrou com *hand-fix* datado (`// hand-fix F60 —
  substituído pela regeneração do ensaio`) do estado FINAL da cadeia — o gate de deriva do CI constrói a cadeia inteira,
  com o `drop`, e está verde (34 relações · 312 colunas · 76 funções). O hand-fix se confere em dois momentos, e os dois
  valem: **(1) do ENSAIO, depois do apply da cadeia inteira (`0141`→`0145`)** — `npm run db:types` apontado para o ensaio
  e o `git diff` do arquivo contra o hand-fix: só pode sobrar diferença de objeto que só produção tem (a lição da F41); o
  resultado vai para a evidência, NÃO para o commit; **(2) de PRODUÇÃO, depois do `drop`** — a regra de sempre da
  `ARQUITETURA.md` §10 (`DB_TYPES_PROJECT_REF=<ref de prod>`); é ESTE o arquivo que substitui o hand-fix no repositório.
  Antes do `drop` em produção, regenerar de lá traria as sete velhas de volta ao tipo — o que o `@ts-expect-error` (24) de
  `linhas-tipos.test.ts` recusa. **Resultado (17/09/2026):** sem `SUPABASE_ACCESS_TOKEN` a CLI fixada não tem canal, e os
  dois vieram do MCP `generate_typescript_types` — ensaio e produção **byte a byte iguais** entre si e ao hand-fix sem as 8
  linhas de comentário (md5 `4465cfaf…`); o arquivo de produção substituiu o hand-fix no PR de documentação da fase.

  **Ledger.** As cinco registradas pelo `apply_migration` nos dois bancos, com o `name` sem o prefixo numérico (a convenção
  das recentes): `rel_contagem_status`, `lanc_item_criado_por_idx`, `rel_filiais`, `colaboradores_textos_por_nome`,
  `drop_rel_filial` — cada uma conferida pelo efeito (a verificação acima), que é a regra deste Anexo.

  **A ordem de rollback da fase — o inverso da de apply, e o `drop` é a parte que `create or replace` não desfaz.** Em
  banco real, rollback é **migration nova de reversão** (a aplicada não se edita), com `npm run db:lock` e as guardas que fixam o universo da fase reconciliadas no MESMO commit (a lista está em "O que a
  reversão reabre", logo abaixo). ⚠ **"Reverter o app" NUNCA é `git revert` do merge inteiro** (os rodapés da `0143` e da
  `0145` dizem isso desde `5094f6f`; o escopo exato é o de "Voltar atrás"): o merge leva as migrations já aplicadas, o lock, os
  roteiros e as listas; revertê-lo tiraria do repositório o que o banco TEM e a cadeia do CI deixaria de construir o banco
  de verdade. **Reverter o app** = um PR que desfaz os commits que mudaram os CHAMADORES (`src/lib/queries/**`, a porta
  `src/lib/supabase/rpc.ts`, os descritores, os componentes, os scripts que chamam as funções) + redeploy, com
  `supabase/**` intacto e o `database.ts` conhecendo toda assinatura viva no banco de destino. O CI desse PR diz o que mais
  ficou incoerente.

  1. **Antes do merge** (`0141`–`0143` aplicadas em produção, PR aberto): não há app a reverter — a `1.64.0` nunca as
     chamou. Derrubar as oito funções novas (as sete `_filiais` e `rel_contagem_status_filiais`) e, se for o caso, o
     índice da `0142`, com `notify pgrst, 'reload schema'`, é o rollback de BANCO; no repositório, as migrations ficam e a
     reversão entra como migration nova na mesma cadeia.
  2. **Depois do merge e do deploy, ANTES do `drop`** (a `0145` na `main`, não aplicada em produção):
     1. **reverter o app** (o PR acima) → `/api/saude` com a versão anterior; o app volta a chamar as sete velhas, que
        existem em produção, e a ler os KPIs pelas páginas de `ativos`;
     2. **só então** derrubar as funções novas, com `notify pgrst, 'reload schema'` — derrubar antes do revert quebra o
        app no ar (404);
     3. se a `0144` já tiver sido aplicada: a view pelo corpo da `0115` (`create or replace view`) — independente do app;
     4. o índice da `0142`, se for o caso: `drop index` — independente de tudo;
     5. a cadeia: a `0145` continua nela sem apply em produção (o mesmo estado da janela). Para fechar a divergência, a
        migration de reversão recria as sete velhas por `create or replace` com os grants reemitidos — no-op em produção,
        onde elas existem; cria no CI e no ensaio, onde a `0145` as derrubou.
  3. **Depois do `drop`** (a `0145` aplicada):
     1. **recriar as sete velhas** com os corpos VIVOS, lidos do ARQUIVO e não de memória: `rel_estoque_asof` da `0134`
        (como está viva: `language sql stable set search_path = public`, SEM a palavra `security invoker`),
        `rel_saldo_itens` da `0027`, `rel_mov_itens` e `rel_frescor_itens` da `0016`, `rel_mov_por_mes`, `rel_por_motivo`
        e `rel_resumo` da `0011` — **e os grants da `0056`** (revogar de PUBLIC e `anon`; EXECUTE para `authenticated` e
        `service_role`), que uma função recriada do zero não traz. É a MESMA migration de reversão do caso 2.5, e serve
        aos dois estados de produção;
     2. `notify pgrst, 'reload schema'`; conferir `to_regprocedure` das sete não nulo, os grants por papel e o `md5`
        normalizado do `prosrc` contra os arquivos;
     3. **só então reverter o app** (o PR acima) — reverter antes deixa o app velho chamando nomes que não existem;
     4. depois, se for o caso, derrubar as novas (o passo 2.2), a view pela `0115` e o índice.

  ⚠ **O que a reversão reabre, e a trava vai dizer:** as sete velhas vivas de novo violam R1 na mesa
  (`rpcs-recorte-sql.test.ts`) e `7a`/`7b` no catálogo do CI. A migration de reversão declara as sete em
  `k_excecoes_recorte` (`supabase/tests/catalogo_secdef.sql`), com `motivo:` e `destino:` na linha, e uma ata — reabrir o
  fail-open do nulo é DECISÃO, nunca efeito colateral.

  ⚠ **A exceção declarada NÃO basta para o CI da migration de reversão ficar verde** (medido na revisão final, 17/09/2026:
  com a `0146` sintética recriando `rel_resumo` e a exceção declarada, a mesa dá zero violações, mas o replay tem 10 vivas).
  As guardas que fixam o universo de HOJE reprovam, e cada uma se reconcilia no MESMO commit da migration, com a mesma ata —
  reescrever a régua, nunca desligá-la:
  1. **`src/lib/validators/rpcs-recorte-sql.test.ts`, describe 1** — fixa as sete velhas FORA do universo e `vivas.size` = 9;
     recriar as velhas ou derrubar as novas muda esses fatos, e o describe é reescrito para o universo pós-reversão.
  2. **`src/lib/validators/asof-orcamento.test.ts`** — se a reversão derrubar `rel_estoque_asof_filiais`, o veredito real vira
     `sem-corpo-vivo`: `FUNCAO`/`CHAVE_REPLAY` e `docs/perf/asof-orcamento.json` passam a orçar o as-of vivo (medido de novo).
  3. **`src/lib/itens/migrations-f38.test.ts`** — a migration nova entra em `DA_F38`; recriar as intocáveis `rel_estoque_asof`/
     `rel_saldo_itens`/`rel_mov_itens` pede `RECRIACOES_AUTORIZADAS`; derrubar as sucessoras intocáveis
     `rel_*_filiais` pede `REMOCOES_AUTORIZADAS`.
  4. **Se a reversão derrubar as novas:** tudo o que as chama — os 59 pontos dos 8 roteiros de `supabase/tests/`,
     `f60_recorte.sql`, as mutações ancoradas nelas em `scripts/db/mutacoes.mjs`, os descritores e a porta — volta no MESMO
     PR (`git grep -n "_filiais" -- supabase/tests scripts src` lista o que falta).

- **`0150_movimentacao_decomposta.sql`** (reauditoria de 18/09, passo 4, item AG; escrita e **aplicada nos dois bancos
  em 21/09/2026, ANTES do merge**, v1.66.5) — troca o corpo monolítico do gatilho `aplicar_movimentacao()` por uma
  orquestradora fina sobre seis auxiliares `movimentacao_*` (`security definer`, fechadas nos quatro papéis). **Não toca
  dado:** sete `create or replace`, seis `revoke`, seis `comment on`. Caminho **A** (sem `delete from ativos` nem de
  `movimentacoes`; o único DELETE é o de `pendencias_item`, que o gatilho já fazia), pelo `apply_migration` do conector,
  ensaio primeiro e só depois de o CI (`banco-sem-docker`) ter rodado a cadeia `0001`→`0150` sobre o SHA aplicado (run
  35624750703, `1e51e92`). Ata em `docs/DECISOES.md` (21/09/2026, v1.66.5); saídas em `docs/ag-evidencias/`.

  **Ledger:** ensaio `20260921130816` · produção `20260921132408`, os dois `movimentacao_decomposta`.

  **Verificação pós-apply** (o rodapé da `0150`), igual nos dois bancos: md5 do `prosrc` = md5 do trecho entre os `$$`
  do arquivo nas SETE funções (`aplicar_movimentacao` `aecfe7cc…`, `movimentacao_estornar` `baa02669…`,
  `movimentacao_transicionar` `bc8bf350…`, `movimentacao_abrir_pendencias_item` `b9950cd2…`,
  `movimentacao_desfazer_pendencias_item` `35a12016…`, `movimentacao_detentor_sincronizado` `41213c2b…`,
  `movimentacao_pendencia_de_termo_restaurada` `ff66ea0b…`); uma assinatura por nome; o gatilho `BEFORE INSERT`
  apontando para a orquestradora; as seis com `proacl = {postgres=X/postgres}` e `anon`/`authenticated`/`service_role`
  false; a orquestradora com a ACL de ANTES (`{postgres=X/postgres,service_role=X/postgres}`: o `create or replace`
  preserva a da `0038`, e o `service_role` é o resíduo AS de `DIVIDA-TECNICA.md`). `get_advisors`: as mesmas contagens
  da linha de base, nos dois tipos, e **nenhuma das seis** entre as `security definer` alcançáveis pelo `authenticated`.
  Sonda de paridade: as 10 classes idênticas em contagem e fingerprint (`func` 94, `grant_func` 94). Tipos gerados de
  produção = do ensaio = `src/lib/types/database.ts` (md5 `fefed8c2…`). Smoke de produção **109 OK · 1 aviso · 0 falha**
  (o aviso é o antigo de `kits_modelos`). Movimentações de produção antes = depois (3612).

  **A prova de comportamento é do ensaio e do CI, nunca de produção:** `supabase/tests/movimentacao_grade.sql` desliga
  o gatilho de `movimentacoes` nos cenários 2f/2n (ACCESS EXCLUSIVE), e por isso **não roda em produção nem em
  transação desfeita**. No ensaio ele rodou em transação desfeita antes e depois do apply, com o mesmo md5 da grade
  (`3e7fb539…`, 369 passos) que o CI deu contra a `0146` e contra a `0150`.

  **Rollback** (nenhum passo perde dado; a ordem é o inverso da de apply e não é livre): **1º)** reemitir
  `aplicar_movimentacao()` com o corpo monolítico da `0146` (md5 do `prosrc` de antes: `5d14b2a12f4ea57c2217598f2f45b01c`,
  para conferir a volta); **2º)** só então derrubar as seis auxiliares pelas assinaturas do rodapé da `0150`. O inverso
  derrubaria as auxiliares com a orquestradora nova no ar, e toda movimentação passaria a falhar. No repositório, a
  reversão é migration nova, com `RECRIACOES_AUTORIZADAS` (a orquestradora) e `REMOCOES_AUTORIZADAS` (as seis, que são
  intocáveis) em `src/lib/itens/migrations-f38.test.ts`, o cenário 14 de `f38_itens_com_ativo.sql`, `k_secdef` de
  `catalogo_secdef.sql`, a porta `movimentacao-uma-porta.test.ts` e as mutações `ag-*` de `scripts/db/mutacoes.mjs`
  reconciliados no mesmo commit.

- **`0151_escrita_atomica_reconfere_no_banco.sql`** (revisão de código de 22/09/2026, v1.66.7; **aplicada nos dois
  bancos** em 22/09, caminho A, texto do arquivo sem alteração pelo conector). Recria quatro das cinco escritas
  atômicas da `0149` (as mesmas assinaturas, `security invoker`) para reconferir a pré-condição no `WHERE` do UPDATE, e
  o lote para perguntar DEPOIS do UPDATE quem continua pendente. Não toca dado. Ordem: CI verde sobre o SHA aplicado
  (run `35751364907`: 38 roteiros, 924 asserções, 0 `✗`; injetor 105/105), ensaio, ensaio de comportamento em
  `begin; … rollback;` contra o dado do ensaio (os cenários 13–16 e os dois do lote devolvendo linhas, nada sobrando
  depois), produção. **Verificação pós-apply**, igual nos dois bancos: md5 do `prosrc` = md5 do trecho entre os `$$`
  do arquivo nas quatro (`8bc05beb…`, `81016770…`, `d0fbb062…`, `e3cdfc6b…`), `corrigir_patrimonio_com_anotacao`
  intocada (`db7d17eb…`), uma assinatura cada, grants `anon=false · authenticated=true · service_role=false`; ledger
  `escrita_atomica_reconfere_no_banco` nos dois; advisor de segurança inalterado (29 no WARN de definer). **Rollback:**
  migration nova reemitindo as quatro com o corpo da `0149`. O app segue funcionando com o corpo antigo, e só as frases
  novas deixam de aparecer.

- **`0152`→`0158` — a raiz do tenant e o cargo por empresa** (F62, 22/09/2026, v1.67.0; **aplicadas nos dois
  bancos** em 22/09, pelo conector, uma `apply_migration` por arquivo, o texto do arquivo no SHA de código congelado
  `f31175a`). Ledger: `raiz_do_tenant`, `membros`, `plataforma_admins`, `filiais_empresa`, `vinculo_por_membership`,
  `funcoes_de_conjunto`, `cargo_em_membros` (produção: `0152` às 18:13:49 e `0158` às 18:20:07, -03). Ordem: CI verde
  sobre o SHA (run `35783705125`: todos os roteiros com 0 `✗`, injetor 125/125, `db:types:diff` verde), ensaio,
  produção. **O portão:** a impressão do acesso por perfil (`docs/f62-evidencias/impressao-acesso.sql`) refeita na hora
  antes de cada apply e repetida depois — **igual nos dois bancos**: ensaio `f2cfd5a1…` (5 perfis), produção
  `a5de88cf…` (16 perfis), combinação a combinação. **Verificação pós-apply** (`docs/f62-evidencias/verificacao-pos-apply.sql`),
  igual nos dois: md5 do `prosrc` = md5 do trecho entre os `$$` do arquivo nas **19** funções criadas ou recriadas, uma
  assinatura cada, grants como desenhados; RLS ligada e sem `force` em `empresas`/`membros`/`plataforma_admins`; dados:
  perfis = memberships na WAP = iguais em papel e ativo (5 · 16), 0 perfil sem membership, vínculos 5 · 25 com 0
  incoerentes, `plataforma_admins` = devs (0 · 2), 6 filiais na WAP. As 61 policies de antes com o MESMO md5 (53 em
  `public` + 8 em Storage); a única nova é a de SELECT de `membros`. Advisor de segurança 3 → 5 e 29 → 34, só os
  declarados (`empresas`/`plataforma_admins` sem policy; `e_plataforma` e as quatro de conjunto). **Paridade** ensaio ×
  produção nas 11 classes: igual em contagem e fingerprint. Conferidor de formas contra produção: 271 pontos, 0 recusas.
  Evidência em `docs/f62-evidencias/depois/`. **Rollback:** a receita "O rollback da F62" (acima) — a cópia de volta
  primeiro, e de novo junto do desfazer.

- **`0159`→`0161` — `empresa_id` no acervo (lote 1) e a tabela do par de backup** (F63, 23/09/2026, v1.68.0).
  `0159_backups_migration` (ADITIVA: a tabela fechada no molde de `ambiente`), `0160_empresa_no_acervo_cadastros`
  (`colaboradores`, `itens`, `termos_gerados`, `anotacoes`) e `0161_empresa_no_acervo_movimento` (`ativos`,
  `movimentacoes`, `pendencias_item`, `lancamentos_item`, na ordem de lock do app): `add column empresa_id uuid not null default public.empresa_legada()
  references public.empresas (id)`, SEM update, com `lock_timeout` de 2 s. Ledger: `backups_migration`,
  `empresa_no_acervo_cadastros`, `empresa_no_acervo_movimento`. **O portão** é a impressão do acervo
  (`docs/f63-evidencias/impressao-acervo.sql`) antes × depois: `relfilenode` e md5 de `(id, xmin)` iguais nas oito.
  **Estado do apply e as provas:** `docs/RELATORIO-F63.md` (topo) e `docs/f63-evidencias/`. **Rollback:** "O rollback
  da F63", acima.

  ⚠ **Lacuna deste Anexo, registrada e não preenchida aqui:** não há entradas das `0133`→`0140` (F53 a F56) nem das
  `0146`→`0149` (passos 1 e 2 da reauditoria), embora as atas dessas fases e entregas registrem os applies.
---

## Anexo B — reconciliação do ledger (opcional, cosmética)

Registrar no ledger as migrations já aplicadas, para o histórico bater com produção. **Metadados apenas** (não recria nada — só insere linhas) e, pelo que está acima, **não torna o repo pushável**: serve para leitura humana do histórico, não como garantia. Rodar no SQL Editor de produção:

```sql
-- Registra 0031–0037, 0039 e 0040 como já aplicadas (idempotente por 'on conflict').
-- version = prefixo do nome do arquivo (mesmo padrão das 0001–0007 no ledger).
-- RODE ANTES os dois SELECTs de "Como conferir o efeito": 0039/0040 entram aqui
-- porque a medição de 23/07/2026 provou que os EFEITOS delas estão em produção.
insert into supabase_migrations.schema_migrations (version, name)
values
  ('0031','import_logs'),
  ('0032','import_rpcs'),
  ('0033','import_correcoes'),
  ('0034','import_melhorias'),
  ('0035','import_compra_data_real_no_relatorio'),
  ('0036','reverter_compra_abertura_baseline'),
  ('0037','import_patrimonio_forcado'),
  ('0039','drop_backups_orfaos'),
  ('0040','hardening_rpcs'),
  ('0056','rel_rpcs_revoke_anon')   -- aplicada (medido 24/07: anon sem execute nas 7 rel_*)
on conflict (version) do nothing;
```

> **Confira o `name` real dos arquivos** em `supabase/migrations/` antes de rodar (o `version` é que importa para o `on conflict`; o `name` é só rótulo).
Conferir antes: `select version, name from supabase_migrations.schema_migrations order by version;`. Reversível (`delete` das mesmas `version`). Como o apply de produção é manual (gate), esta reconciliação é para **fidelidade do histórico**, não muda o funcionamento.

