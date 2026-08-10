ultracode

# Missão

Ordem de serviço **F33 — Performance**. Tornar o sistema mensuravelmente mais rápido — carregamento entre páginas, tempo de resposta das rotas, conversa com o banco, bundle e cache — **sem mudar um pixel do estado final de nenhuma tela, um texto de UI, uma contagem de relatório ou uma regra de negócio**. O trabalho é guiado por medição: baseline ANTES de qualquer edição, otimizações provadas uma a uma, medição DEPOIS nas mesmas condições — a tabela antes/depois é a prova central da fase. Ao final: `npm run lint`, `npm run test`, `npm run build` e `npm run contraste` limpos, `docs/RELATORIO-F33.md` com evidências e **main pushada** (a Vercel deploya sozinha), com smoke e medição de produção pós-deploy.

# Contexto

- Projeto **Estoque TI WAP** (Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui · Recharts v3 · Supabase via `@supabase/ssr`). Regras permanentes de `@CLAUDE.md` valem inteiras: modo autônomo, stack fechada, UI/commits pt-BR, NUNCA dados reais em fixture/teste/evidência, custo R$ 0. Em produção desde 15/07/2026 (~1.230 ativos, 5 filiais, uso diário).
- Comandos: `npm run lint` · `npm run test` (Vitest, funções puras, 2.505+) · `npm run build` · `npm run contraste`. Smoke logado reexecutável contra produção: `scripts/smoke/smoke-prod.mjs` (leia `scripts/smoke/README.md` — é lá que está o mecanismo de credenciais/login que você vai REUSAR no harness). CI no push: lint+test+build + job `banco` que sobe Postgres, aplica todas as migrations e roda `supabase/tests/`.
- Banco: dois projetos Supabase (ensaio e produção); o caminho de migration é o de `@docs/RUNBOOK-BANCO.md` — ensaio → sonda → produção, apply via MCP (o ledger não é pushável por construção; `supabase db push` proibido). Nesta ordem, migrations **só aditivas e reversíveis** (índices; reescrita de policy com semântica idêntica), no próximo número livre de `supabase/migrations/`.
- **ATENÇÃO ao ambiente local:** o `.env.local` desta máquina aponta para **PRODUÇÃO** (pendência conhecida do README). Consequências: (a) `npm run dev`/`next start` local leem produção — tudo bem para medição **read-only**, que é o mesmo precedente do smoke logado; (b) **JAMAIS** rode `db:seed`/`db:reset` (as guardas existem; não as teste); (c) nenhuma escrita de teste em produção — escrita se prova por teste puro, pelos roteiros SQL no CI e pelo ensaio; (d) o harness só faz GET.
- Suspeitos já conhecidos (confirme medindo — não assuma, e não se limite a eles):
  - `src/lib/supabase/proxy.ts` faz `await supabase.auth.getUser()` — **uma ida de rede ao Auth do Supabase por request/navegação**. Suspeito nº 1 do custo fixo de "carregamento entre páginas".
  - Relatórios reconstroem estoque as-of via RPC `rel_estoque_asof` (~233 ms por chamada — comentário em `app/(app)/relatorios/[filial]/page.tsx`); a evolução do estoque (F32) faz até ~9 chamadas em `Promise.all`.
  - Os advisors de performance de 25/07 (`0059`) trataram `auth.uid()` → `(select auth.uid())` em `profiles` — mas as policies das fases F21→F31 (`papel_atual()`, `e_admin()`, `pode_escrever_filial()`…, migrations `0061`→`0104`) vieram DEPOIS. Rode os advisors de novo, nos DOIS projetos.
  - `src/lib/queries/**`: procure `select('*')` largos, contagens exact sem `head: true`, `await` sequenciais paralelizáveis, N+1 (ficha + linha do tempo), referência (filiais, motivos, catálogo) refeita a cada request e leituras que layout e página pedem em dobro na mesma navegação.
- **Regra 6 do CLAUDE.md vale dobrado aqui:** toda API que você for usar para otimizar — validação local de JWT/`getClaims` do `@supabase/ssr`, `React cache()`, `'use cache'`/`unstable_cache`/`revalidateTag` do Next 16, comportamento atual de prefetch — **confirme na documentação oficial ATUAL** (MCP Context7 / doc online) antes de escrever. Não confie em API de memória: cache e auth erradas aqui viram incidente, não bug cosmético.

# Método — medir → atacar → provar (nesta ordem)

## Frente A — Baseline e mapa (proibido otimizar antes de fechá-la)

1. **Harness de medição sem dependência nova**: `scripts/perf/medir.mjs` (Node puro + `fetch`, padrão do smoke). Para a lista fixa de rotas — no mínimo `/login`, dashboard (`/`), `/ativos`, `/ativos/[id]` (um id real de produção, só GET), `/movimentacoes`, `/movimentacoes/nova`, `/itens`, `/pendencias`, `/relatorios/geral`, `/relatorios/[uma filial]`, `/relatorios/gerados`, um snapshot congelado, `/ajuda` — meça **TTFB e tempo total do HTML**, mediana e p95 de **≥7 medições aquecidas** por rota, com sessão de **operador** (reuse o login do smoke) e, nas rotas de relatório, também com cookie de **visualizador**. Dois alvos: **(a) produção atual** (URL Vercel, ANTES de qualquer mudança — este é o baseline que ninguém consegue refazer depois) e **(b) `next start` local** (build de produção). Saída versionável: `docs/perf/baseline-2026-08-10.json` + tabela em md. O harness aceita a URL-alvo por env para ser reexecutável no "depois".
2. `npm run build` limpo e a **tabela de rotas capturada** (First Load JS por rota + shared chunks) como parte do baseline.
3. **Mapa da conversa com o banco por rota**: quantas queries, quais, em série ou em paralelo; duplicatas na mesma renderização; selects largos; contagens sem `head`; N+1. Fonte: leitura do código de `queries/`/páginas + instrumentação local se ajudar.
4. **Advisors de performance (MCP Supabase) nos dois projetos** + `EXPLAIN (ANALYZE, BUFFERS)` read-only das ~5 queries mais lentas/frequentes (use `pg_stat_statements` se disponível).
5. Consolide em `docs/PLAN-F33.md`: achados **ranqueados por (ganho estimado × certeza × risco)**, plano de ataque por frente com arquivos nomeados, o que NÃO será feito, e — por item — **como o ganho será provado**. O plano é o gabarito da revisão adversarial.

## Frente B — Custo fixo de navegação (middleware e sessão)

- Objetivo: **derrubar a ida de rede por navegação** do `proxy.ts`, PRESERVANDO na íntegra: a expiração **B8** (24h desde o LOGIN, semântica exata de `last_sign_in_at` documentada no próprio arquivo), o refresh de token, o confinamento do visualizador, os headers `x-wap-pathname`/`x-wap-search` e os redirects com `next`. Caminho candidato: validação **local** de JWT (`getClaims`/JWKS assimétrico) no lugar de `getUser()` a cada request — SÓ se a doc atual do `@supabase/ssr` confirmar o padrão E os claims disponíveis sustentarem a régua B8. Se não sustentarem, desenhe o híbrido mais simples (ex.: validação local + `getUser()` de rede apenas quando o token está perto de expirar) ou desista e registre por quê, com o número do que isso custa por navegação. Se o caminho da sessão mudar, a régua B8 vira função pura testada.
- Confira o **matcher** do middleware (estáticos/`_next`/assets fora do caminho caro), o prefetch dos `Link` da sidebar em produção e o custo do layout `(app)` por navegação (dedupe com `React cache()` do que layout e página pedem em dobro — perfil/cargo é o candidato óbvio).
- **Estados de loading: transitório pode, pixel final não.** Só adicione `loading.tsx`/`Suspense` se (a) reutilizar o padrão de skeleton que o app JÁ tem e (b) o estado final da tela ficar idêntico. Na dúvida, não adicione — backlog.

## Frente C — Conversa com o banco (código)

- Paralelize waterfalls (`Promise.all`), dedupe por request com `React cache()` nas leituras repetidas (perfil/cargo, filiais, motivos), estreite selects às colunas usadas, contagens com `{ count: 'exact', head: true }`, N+1 → uma query com `in()`/join, paginação de verdade onde a lista puxa mais do que mostra.
- **Regra dura: nenhuma mudança de resultado.** As funções de `queries/` devolvem os mesmos dados para os mesmos argumentos. Coluna sai do select só quando ninguém a usa — prova pelo TypeScript strict: se o build passa sem ela, não era usada.

## Frente D — Banco (migrations, ensaio → produção)

- **Índices** que advisors/EXPLAIN sustentarem (FKs sem índice; filtros e ordenações frequentes das listas: filial+status, `criado_em desc`, busca por patrimônio normalizado…): migration aditiva, ensaio → sonda → produção, per runbook. Meça o plano **antes/depois de cada índice** e derrube o que não mudou plano — índice morto não fica.
- **Policies RLS**: se o advisor apontar initplan/função-por-linha, reescreva **preservando semântica EXATA** — prova: roteiro de RLS de `supabase/tests/` verde (CI/banco local) + advisors zerados + smoke. **Proibido relaxar qualquer policy**; entre performance e clareza da regra de acesso, a regra vence.
- Trigger/função de negócio **não** se altera nesta ordem (o gate do runbook nem chega a ser acionado); se um ganho exigir isso, vira pendência declarada no relatório.

## Frente E — Bundle e cliente

- Da tabela do build, ataque as rotas com First Load JS acima da mediana. Candidatos visíveis: `docx-preview` (client) → import dinâmico no ponto de uso; cards de gráfico (Recharts) → `dynamic()` mantendo o pixel final idêntico; confirme que `exceljs`/`docxtemplater`/`pizzip` **nunca** entram em bundle de cliente (`serverExternalPackages` + grep de imports); confira se `optimizePackageImports` do Next 16 já cobre `lucide-react`/`date-fns` ou se há import que anula o tree-shaking.
- `dynamic()` sem fallback visual novo além do padrão de skeleton existente; nenhum layout shift novo.

## Frente F — Cache (a frente mais perigosa — regras duras)

- Padrão-ouro: **cache por request** (`React cache()`) — sempre seguro; use à vontade.
- **Cache entre requests** só para dado de referência **global e idêntico para todos os logados** (filiais, motivos, catálogo de itens/kits) — NUNCA nada recortado por usuário/cargo/filial vinculada, NUNCA sessão, NUNCA acervo/movimentações/relatórios (mudam a cada lançamento). Requisitos cumulativos: API vigente confirmada na doc atual do Next 16; **invalidação explícita** (`revalidateTag`/`revalidatePath`) disparada pelas Server Actions de admin que alteram esses cadastros; TTL curto de rede de segurança; e **prova de não-vazamento** — por construção (a chave não contém nada de sessão E a função cacheada não lê `cookies()`) e por roteiro (duas sessões de cargos diferentes não enxergam nada uma da outra por cima do cache).
- Sobrou qualquer dúvida de vazamento? **Não cacheie entre requests.** O ganho não paga o risco. Registre a decisão.

## Housekeeping

- Commite esta ordem (`docs/prompts/F33-performance-ultracode.md`) se estiver untracked. Sujeira de git alheia: não toque; registre.

# Fora (não toque)

- **Design**: nenhum pixel do estado final de nenhuma tela — nenhuma classe Tailwind com efeito visual, nenhum texto de UI, `globals.css`, tema claro/escuro, `src/components/ui/`, impressão. Os testes da ajuda (F20) travam frases literais: se um quebrar, você mudou comportamento visível — **desfaça a mudança**, não o teste.
- **Contagens e regras**: nenhuma fórmula de relatório, snapshot congelado (bytes e render intocados), máquina de estados, modelo de acesso, semântica de RLS, trigger, RPC de negócio.
- **Dependência nova NENHUMA** (nem dev). Redis/ISR pago/serviço novo/ECharts: não. Custo R$ 0. Flags experimentais do Next só se a doc atual as der como estáveis/seguras e o efeito for invisível ao usuário.
- Refatorações de forma da dívida técnica (import gigante E, forms K, `termos.ts` L): outra ordem. Não "aproveite para fazer".
- `db:seed`/`db:reset` nesta máquina; escrita de teste em produção; dados reais em teste/fixture/evidência; force push; qualquer migration destrutiva.

# Critérios de aceitação

- **Tabela antes/depois** (mediana E p95, por rota, produção e local, mesmas condições e mesmo harness) em `docs/RELATORIO-F33.md`, com baseline e "depois" versionados em `docs/perf/`.
- **Meta orientadora: −30% de TTFB nas 3 rotas mais lentas do baseline; nenhuma rota >10% pior.** Se a meta não for alcançável, o relatório **prova o porquê com números** (ex.: piso de RTT app↔Supabase; rota dominada por N chamadas de RPC já paralelas) — "não deu" sem medição não é resposta.
- **First Load JS**: nenhuma rota cresce; as atacadas diminuem (tabela do build antes/depois).
- **Advisors de performance**: zero achado novo nos dois projetos; cada achado do baseline listado como resolvido ou descartado com motivo.
- `lint` · `test` · `build` · `contraste` limpos (saídas reais no relatório); suíte completa verde; roteiros de `supabase/tests/` verdes se o banco foi tocado (o CI conta como prova); **smoke pós-deploy verde** ou pendência declarada com o que falta.
- **Zero mudança visual/comportamental**: diff inteiro revisado com essa lente na revisão adversarial; roteiro manual das rotas da lista antes/depois; diff de textos de UI vazio; nenhuma migration destrutiva; `package.json` sem dependência nova.
- `CHANGELOG.md` (entrada F33 no topo), `README.md` (status), `docs/DECISOES.md` (atas: caminho escolhido no middleware; cada cache entre requests; cada índice criado/derrubado; cada policy reescrita; cada otimização tentada e revertida), `docs/PLAN-F33.md` e `docs/RELATORIO-F33.md` completos.
- Commits pequenos pt-BR (`perf(f33): …`), `git pull --rebase` antes do push, **main pushada com tudo verde**.

# Verificação — rode de verdade

Após cada frente: `npm run lint && npm run test`; leia, corrija a **causa raiz**, repita até passar — sem suprimir erro nem desabilitar/deletar teste. **Otimização sem número que a sustente é revertida**: cada item do PLAN-F33 fecha com o "depois" medido ao lado do "antes" (mesmo harness, mesmas condições). Ao final: `build` + `contraste` + suíte completa + harness completo local; push; depois do deploy, **harness contra produção + smoke** (`scripts/smoke/`), saídas coladas no relatório. Roteiros manuais obrigatórios: (1) navegar TODAS as rotas da lista como operador conferindo que tudo está visualmente idêntico e funcional — inclusive login, expiração de sessão e o redirect com `next` se a Frente B tocou o middleware; (2) relatório como visualizador por senha (confinamento intacto); (3) uma sessão de cargo **consulta** confirmando que nenhum cache vazou nada de admin/escrita para ela; (4) escrita de ponta a ponta provada SEM tocar produção (testes puros + roteiros SQL do CI + ensaio quando preciso).

# Autonomia e decisões

Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em nenhuma hipótese. Régua: (1) esta ordem; (2) `CLAUDE.md`/spec e convenções do código; (3) o mais simples e reversível, registrado em `docs/DECISOES.md`. **Performance × qualquer invariante (design, contagem, acesso, B8): o invariante vence, sempre.** Mesma falha após ~3 tentativas: mude de abordagem e registre. Bloqueio real (credencial do smoke ausente, MCP fora do ar): siga com o resto e registre a pendência com o que falta para fechá-la.

# Git e segurança

Direto na `main` (modo autônomo do projeto; push autorizado pelo Johnny nesta ordem), commits pequenos e frequentes, um por otimização provada. Migrations: ensaio → sonda → produção, per `docs/RUNBOOK-BANCO.md` — nada destrutivo. **PROIBIDO:** force push, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit alheio, `supabase db push`, commitar `.env*` ou dado real. Push bloqueado pelo ambiente: não insista — commits locais + pendência no relatório.

# Como trabalhar

Frente A **inteira antes de qualquer edição**, com subagentes paralelos de exploração (middleware+auth; queries+páginas; build/bundle; banco/advisors — cada um volta só com resumo e números, não com código). `docs/PLAN-F33.md` é o gabarito. Frentes B–F em incrementos pequenos, **cada um com sua medição**; paralelismo só em arquivos disjuntos (worktrees se preciso); lint+test verdes entre frentes. Ao final, **revisão adversarial em contexto fresco** com lentes independentes: (a) pixel/texto idêntico — o diff inteiro lido com essa lente; (b) resultado de query idêntico; (c) vazamento de cache entre usuários/cargos/superfícies (operador × consulta × visualizador por senha); (d) semântica de RLS e da régua B8 preservadas; (e) honestidade das medições (mesmas condições? p95 e não só mediana? produção e não só local? aquecimento igual?). Cada achado passa por um cético antes de virar correção; só lacunas de correção ou requisito, não estilo; corrija e re-revise até limpar.

# Relatório final

`docs/RELATORIO-F33.md` em pt-BR, padrão da casa (espelhe `docs/RELATORIO-F32.md`): a tabela antes/depois no topo; o que mudou por frente e POR QUÊ, com o número de cada item; o que foi tentado e **revertido** (com o número que condenou); decisões (→ `DECISOES.md`); saídas reais de lint/test/build/contraste/smoke/harness; advisors antes/depois; roteiros manuais executados; pendências e backlog novo (inclusive otimizações descartadas e por quê); seção **"O que este relatório NÃO prova"** (ex.: números de produção medidos da sua rede, não da dos usuários; concorrência real não exercida). Resposta final: resumo de ~8 linhas com os números-chave e o estado do deploy.

# Idioma

Narrativa, plano, relatório, UI e commits em **pt-BR**; identificadores de domínio em português sem acento, utilitários/infra em inglês (convenção do `CLAUDE.md`).
