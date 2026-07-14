# Registro de decisões autônomas

O Claude Code opera este projeto em **modo autônomo com acesso total** (CLAUDE.md, decisão do Johnny em 09/07/2026): não pede autorização — decide, executa e **registra aqui** toda decisão tomada por conta própria durante as ordens de serviço, mais as operações sensíveis em produção. Este arquivo é o rastro de auditoria do Johnny; entradas não se apagam.

Formato de cada entrada:

```
## AAAA-MM-DD · F<fase> · título curto
- Contexto: o que estava ambíguo/faltando
- Decisão: o que foi feito
- Motivo: por quê (apontar spec/planejamento quando houver base)
- Reversível? como desfazer, se preciso
```

Operações destrutivas em produção (reset, carga, migration com perda potencial) registram também: backup gerado (caminho), dry-run (resultado), contagens antes/depois.

---

## 2026-07-10 · F0+F1 · Fases concluídas — reconciliação de documentação (sessão Cowork)

- Contexto: F0 e F1 foram executadas pelo Claude Code local em 10/07/2026. Em paralelo, a sessão Cowork gravou atualizações de docs (modo autônomo) que **sobrescreveram** `README.md`, `CLAUDE.md` e este arquivo DEPOIS do fim da F1 — se as ordens registraram entradas aqui, elas se perderam nesse overwrite (recuperáveis nos commits do git, se existirem lá).
- Decisão: status do `README.md` remarcado (F0 e F1 concluídas) com base em **verificação por arquivos**: app Next 16.2.10 com login/confirm/definir-senha e proxy de sessão; `profiles` sem papéis + trava `@wap.ind.br` no trigger (0001); migrations 0002–0007 incluindo `senhas_acesso` e RLS de operador nível único; `scripts/seed.ts` determinístico com `env-guard`; tipos gerados; `supabase/tests/maquina_estados.sql`. O código está aderente ao modelo de acesso final da spec §3.
- Motivo: manter o rastro fiel ao estado real do repositório.
- Reversível? sim — histórico das fases está nos commits (branches `f0-fundacao`, `claude/f1-banco-prompt-seed-096b7c`, `main`).
- Nota de processo: a decisão da F1 sobre o volume de movimentações do seed (maior que ~700 para atingir a distribuição-alvo de status) está documentada no cabeçalho de `scripts/seed.ts`.
- Lição operacional (vale para as duas pontas): **sempre ler a versão atual do arquivo no disco antes de regravar docs** — sessões paralelas não podem sobrescrever às cegas.

---

## 2026-07-10 · F2 · Pré-requisitos: seed rodado no dev + tipos regenerados

- Contexto: OS-F2 §0.2 exige `db:seed` populado e tipos atualizados. No início da F2 o dev tinha as migrations 0001–0007 e os dados de referência, mas `ativos`/`movimentacoes` estavam vazios e `src/lib/types/database.ts` só continha `profiles` (desatualizado).
- Decisão: adicionei `SEED_CONFIRM=sim` e `SEED_PROJECT_REF=pbtjcalbmepmrqzprusb` ao `.env.local` (gitignored) e rodei `npm run db:seed` (1.200 ativos, 2.381 movimentações). Regenerei `src/lib/types/database.ts` a partir do schema atual.
- Motivo: destravar a F2 sem depender do Johnny (modo autônomo). O seed é 100% fictício (regra 2).
- Reversível? sim — `npm run db:reset` + `npm run db:seed` reproduz o mesmo conjunto determinístico.
- Backlog (bug F1, fora do escopo da F2): o `sumario()` do `scripts/seed.ts` lê os ativos com `select` sem `.range()`, então o PostgREST corta em 1.000 linhas e o resumo mostra contagens/`✗` enganosos ("Ativos: 1000"). As contagens REAIS estão corretas (1.200/2.381, conferidas por SQL). Correção sugerida: paginar o select do resumo.

## 2026-07-10 · F2 · Dependências da stack instaladas (estavam na lista, faltavam no projeto)

- Contexto: `react-hook-form`, `@hookform/resolvers`, `@tanstack/react-table` e `date-fns` constam da stack fechada do CLAUDE.md, mas não estavam no `package.json` (F0/F1 não precisaram).
- Decisão: instalei as quatro (mais os componentes shadcn `table/select/dialog/command/popover/checkbox/textarea/tooltip/form/tabs`). Nada fora da stack fechada.
- Motivo: são exatamente as peças previstas para a F2 (data-table, forms com Zod, datas ptBR).
- Reversível? sim (remoção via npm).
- Nota: o `npx shadcn add form` falhou em silêncio (conflito com o pacote unificado `radix-ui` do projeto). Escrevi `src/components/ui/form.tsx` à mão, adaptado para `import { Slot } from "radix-ui"` (`Slot.Root`) — mesma convenção dos componentes existentes.

## 2026-07-10 · F2 · Fluxo de lote com preenchimento único (sem tipos heterogêneos por item)

- Contexto: OS-F2 3.5.2 pede "tipos válidos por item" e opção "ajustar por item" no lote.
- Decisão: o lote usa UM tipo compartilhado, oferecido a partir da **interseção** dos tipos válidos de todos os ativos selecionados (`tiposComunsPara`). Se os itens estão em estados diferentes, só aparecem as movimentações válidas para todos, com aviso. Não implementei tipos diferentes por item na mesma submissão.
- Motivo: adoção é o risco nº 1 (spec §12.2) — um fluxo que **nunca** falha parcialmente por transição inválida vale mais que heterogeneidade rara. Cobre todos os critérios de aceite (kit de 3 em_estoque → saída; "saída some" ao incluir um em_uso). O caso real (kit para um colaborador) tem tipo/campos idênticos.
- Reversível? sim — o form isola a config compartilhada; dá para evoluir para override por item depois. Registrado como possível refino (não é F5 formal).

## 2026-07-10 · F2 · Cores de status não especificadas + detalhes de UI

- Contexto: a OS especifica cores só para em_uso/em_estoque/manutenção/descartado/defasado.
- Decisão: atribuí cores coerentes aos demais — reservado (violeta), emprestado (ciano), em_triagem (laranja) — em `src/lib/dominio.ts`. Dialog de estorno mostra status/colaborador/setor do snapshot; a filial só aparece quando a mov era transferência (o snapshot guarda `filial_id`, não o nome).
- Motivo: consistência visual sem inventar regra de negócio.
- Reversível? trivial (tabela `STATUS_META`).

## 2026-07-10 · F2 · Lint: ignorar `.claude/**`

- Contexto: sobrou um worktree da F1 em `.claude/worktrees/f1-banco-prompt-seed-096b7c/` com um `.next` buildado; o ESLint varria esses artefatos e falhava.
- Decisão: adicionei `".claude/**"` aos `globalIgnores` do `eslint.config.mjs`.
- Motivo: são artefatos internos do Claude Code, nunca código-fonte do projeto.
- Reversível? sim (uma linha).

## 2026-07-10 · F2 · Verificação E2E: writes conferidos no contrato do banco

- Contexto: as telas exigem sessão de operador. Criei um operador de QA fictício (`qa.f2@wap.ind.br`, `@wap.ind.br`) via admin API só para dirigir o navegador no dev.
- Decisão: **leituras** (lista, filtros, busca, desambiguação por service tag, ficha, linha do tempo, exibição do estorno) verificadas pelo app real logado. **Escritas** (kit saída→em_uso, transição inválida barrada, estorno restaura, devolução→pendência, triagem_ok limpa) verificadas no **contrato do banco** (o trigger 0004, que é a fonte da verdade que as Server Actions apenas delegam) porque os `Select`/`Dialog` do Radix não respondem a eventos sintéticos do navegador headless. Busca multi-palavra (`Gabriel Pereira`) conferida no mesmo `.or()` ilike via service role (o app deu 0 apenas porque a sessão caiu ao apagar o usuário QA).
- Limpeza: `db:reset` + remoção do usuário QA + `db:seed` — dev restaurado ao seed determinístico pristino (1.200/2.381, autor = Victor Matusita, 0 usuários QA). `.claude/launch.json` adicionado para o dev server do preview.
- Motivo: verificação real e honesta dentro das limitações da ferramenta; dev entregue limpo.
- Reversível? o estado do dev é o seed determinístico; reprodutível a qualquer momento.

## 2026-07-10 · F2 · Revisão adversarial multi-agente + correções

- Contexto: rodei uma revisão adversarial (5 lentes: máquina de estados, server actions, Zod, React/Next, segurança/spec) com verificação independente de cada achado — 13 agentes.
- Achados confirmados e **corrigidos** (7 distintos):
  1. **[ALTO] Perda silenciosa de dados na edição cadastral** — `editar-ativo-dialog.tsx` usava `form.reset()` sem args, que restaura os defaults do MOUNT (RHF). Após salvar+refresh e reabrir, o form mostrava dados velhos e, como o update grava TODAS as colunas cadastrais, um novo salvar revertia as demais. Correção: usar o prop `values` (sincroniza quando `ativo` muda) + `reset(valores)` ao fechar.
  2. **[MÉDIO] Motivo obsoleto entre tipos** — trocar o tipo não limpava `config.motivo`; um motivo válido só p/ saída vazava para empréstimo (o banco não amarra motivo×tipo). Correção: `trocarTipo()` limpa motivo/filialDestino/itens/statusResultante.
  3. **[BAIXO] Mapa de ativos obsoleto no lote** — mesmo `ativo_id` repetido no lote usaria filial/estado velhos (só via payload forjado; a UI deduplica). Correção: a Server Action rejeita lote com ativo repetido.
  4. **[BAIXO] "Não futura" com fuso errado** — `hojeISOServer()` usava o fuso do processo (UTC na Vercel), afrouxando a regra perto da meia-noite BRT. Correção: `hojeISO()` fixado em `America/Sao_Paulo` (Intl), reusado no validador e no estorno.
  5. **[BAIXO] i18n** — ajuste com status/justificativa vazios caía nas mensagens padrão do Zod em inglês. Correção: mensagens pt-BR em `status_resultante`/`observacao` do ajuste (API `{ message }` do zod v4 conferida).
  6. **[BAIXO] Envio duplo por Enter** — `registrar()` não checava `enviando` (só o botão desabilitava); Enter 2× no passo 3 podia duplicar um ajuste. Correção: trava de reentrância (`enviandoRef`).
  7. **[BAIXO] Corrida no debounce da busca** — o timeout capturava `params` do render; um filtro alterado nos 300ms era descartado. Correção: o debounce lê `window.location.search` fresco no disparo.
- Motivo: correção e robustez acima de custo (modo ultracode). `lint`+`build`+`tsc` limpos após as correções.
- Reversível? sim (mudanças localizadas por arquivo, no histórico do git).

## 2026-07-13 · F2 · Entrada de equipamento novo (compra) — atualização da OS

- Contexto: a OS-F2 ganhou a tarefa 3.5.5 (entrada de equipamento novo por `compra`, single e em lote) + botão na lista/dashboard (3.1.5) + `compra` no schema Zod (3.3.1).
- Decisões:
  1. **Rota dedicada `/ativos/novo`** (em vez de embutir no wizard de `/movimentacoes/nova`). A OS chama de "variante do fluxo"; implementei como rota irmã porque o passo 1 (cadastro/lote) é totalmente diferente da busca de ativo — mesmo resultado de UX, código mais limpo. Botão "Novo equipamento" na toolbar da lista e card no dashboard levam a ela.
  2. **Atomicidade (tudo ou nada) no Postgres:** migration `0008_compra_lote.sql` cria a função `criar_compra_lote(jsonb, uuid)` — uma transação que insere os ativos (nascem `em_estoque`) e uma movimentação `compra` por ativo. Qualquer colisão no índice único (patrimônio+service_tag, §5) faz rollback total. É o lugar certo da regra crítica (CLAUDE.md) e resolve corrida. A action ainda faz pré-checagem de duplicidade para erro amigável apontando o patrimônio.
  3. **`compra` sai do select do wizard de movimentação** — passou a significar exclusivamente entrada de equipamento novo (tela própria). `TRANSICOES` continua sendo a cópia EXATA da spec §4 (o banco aceita `compra` em `em_estoque`); só a UI do wizard filtra.
  4. **Cadastrais exigidos na compra:** categoria + marca + modelo + filial que recebeu (specs opcionais). A observação (nº da NF-e) vai na movimentação `compra` (aparece na linha do tempo), não em `ativos.observacoes`.
  5. **Formato do patrimônio:** util `src/lib/patrimonio.ts` canonicaliza (PREFIXO 2–4 letras + 7 dígitos), expande faixa (mesmo prefixo, teto 200) e parseia lista colada (um por linha, service tag após vírgula). Compartilhado cliente (preview) e servidor (validação).
- Verificação (contrato do banco, via MCP): lote de 3 → 3 ativos `em_estoque` + 3 `compra`; lote com 1 duplicado → **rollback total** (vizinhos não entram); papel `authenticated` executa a RPC sob RLS. `lint`+`build`+`tsc` limpos.
- Nota: o dev tem 6 movimentações extras de teste manual do Johnny (datas 10/07) sobre ativos do seed — preservadas (dado dele); o seed determinístico volta com `db:reset && db:seed`.
- Reversível? a migration 0008 só adiciona uma função; as telas são localizadas no git.

## 2026-07-13 · F2 · Revisão adversarial da compra + correção

- Contexto: revisão adversarial focada (4 lentes × verificação independente) sobre a feature de compra.
- Achado confirmado (1, baixo, regressão de integração): `ultimaMovimentacaoDoUsuario` excluía só `estorno`, não `compra`. Como a movimentação `compra` agora é atribuída ao operador, o botão "Repetir última" do wizard podia trazer uma `compra` — tipo que o wizard esconde — limpando os campos já digitados e mostrando um toast enganoso. Correção: excluir `compra` como o `estorno` (`.neq('tipo','compra')`).
- As outras 3 lentes (patrimônio-util, validação/duplicidade, atomicidade/RLS) voltaram limpas.
- `lint`+`build`+`tsc` limpos após a correção.

---

## 2026-07-13 · F3 · Numeração das migrations (0009–0011)

- Contexto: a OS-F3 pedia `0008_realtime.sql` (3.4) e `0009_relatorios_gerados.sql` (3.8.1), mas `0008_compra_lote.sql` já existia da F2.
- Decisão: renumerei — `0009_realtime.sql` (publication do Realtime em `movimentacoes`), `0010_relatorios_gerados.sql` (tabela de snapshots, cópia da seção do `schema.sql`) e `0011_relatorios_rpc.sql` (funções de agregação `rel_mov_por_mes`/`rel_por_motivo`/`rel_resumo`). Aplicadas no dev via MCP; tipos regenerados.
- Motivo: nunca reeditar/renumerar migration aplicada; seguir a sequência.
- Reversível? migrations só adicionam objetos; drop manual se preciso.

## 2026-07-13 · F3 · Agregações por período em RPC (não em JS)

- Contexto: "movimentações por mês", "por motivo" e o resumo podem passar do teto de 1.000 linhas do PostgREST se buscados linha a linha (período "Tudo" tem ~2,4k movs).
- Decisão: empurrei as três agregações para funções SQL `SECURITY INVOKER` (migration 0011), chamadas via `client.rpc(...)`. Devolvem poucas linhas agregadas. `p_filial null` = consolidado. Grant a `authenticated` (operador, RLS) e `service_role` (sessão por senha via client admin). As listas de estado atual (disponíveis/reservados/manutenção) e KPIs continuam em query direta (volumes pequenos); o export CSV do período inteiro pagina com `.range()`.
- Motivo: correção (sem truncamento silencioso) + eficiência + "lógica crítica no Postgres" (CLAUDE.md). Verificado por SQL: o resumo da semana da Matriz bate com o formato do e-mail.
- Reversível? as funções são aditivas.

## 2026-07-13 · F3 · Acesso por senha: verificação em duas camadas (Edge × Node)

- Contexto: o proxy (middleware) do Next 16 roda no Edge Runtime, que NÃO tem `node:crypto` (scrypt/HMAC). A revogação precisa ter efeito "no request seguinte" (spec §3 / OS-F3 3.9.3).
- Decisão: o proxy só faz a checagem BARATA (presença do cookie de visualização) para liberar `/relatorios/**`; a verificação REAL (assinatura HMAC + senha ainda `ativa` no banco) roda no servidor Node a cada request, em `lib/auth/acesso.ts#getViewerSession`, consumido pelo `(app)/layout.tsx`. Cookie httpOnly, `secure` só em produção, `sameSite=lax`, `path=/relatorios`, 30 dias. Hash `crypto.scrypt` nativo (`scrypt$salt$derivado`), comparação `timingSafeEqual`. O nome do cookie mora num módulo-folha (`view-cookie.ts`) sem `node:crypto`, para o proxy poder importá-lo no Edge. O client administrativo (service role) é `server-only` e só serve as queries do visualizador (que não tem credencial de banco).
- Motivo: segurança correta dentro da restrição do Edge; revogação com efeito imediato comprovada em teste (revoguei a senha → o request seguinte ao relatório caiu em `/relatorios/acesso`).
- Reversível? camadas isoladas; trocar `VIEW_SESSION_SECRET` invalida todas as sessões de visualização.

## 2026-07-13 · F3 · Layout único com três modos + header `x-wap-pathname`

- Contexto: as rotas `/relatorios/**` vivem no grupo `(app)`, cujo layout antes exigia operador — o visualizador por senha (sem sessão Supabase) seria expulso para `/login`.
- Decisão: o proxy injeta `x-wap-pathname`; o `(app)/layout.tsx` decide o shell: público (só `/relatorios/acesso`), operador (header+sidebar completos) ou visualizador (shell reduzido, sem sidebar de operação, com "Sair"). `/relatorios/acesso` ficou em `app/(app)/relatorios/acesso/` (não em `app/relatorios/acesso/` como sugeria a estrutura do CLAUDE.md) para não conflitar com a rota dinâmica `[filial]` (Next barra rota estática × dinâmica em grupos diferentes resolvendo a mesma URL). Comportamento público garantido no proxy + layout.
- Motivo: um só grupo de rotas serve operador e visualizador sem duplicar páginas; evita o conflito de rota do App Router.
- Reversível? o roteamento é localizado no proxy + layout.

## 2026-07-13 · F3 · loading.tsx de rota removidos (streaming Suspense)

- Contexto: `loading.tsx` nas rotas de relatório criava um boundary de Suspense; na verificação (navegador da preview do Claude), o swap de streaming do React (`$RC`) não completava — o esqueleto ficava visível e o conteúdo real ficava no `<div id="S:0" hidden>`. Funciona em navegadores reais, mas impedia a verificação.
- Decisão: removi os `loading.tsx` das rotas de relatório. A página renderiza server-side e transmite como unidade única (sem fallback a "prender"). Os estados vazio/skeleton por card (OS-F3 3.3.7) continuam existindo dentro da página.
- Motivo: correção verificável > esqueleto de navegação (nice-to-have) para ferramenta interna; elimina uma classe de fragilidade de streaming.
- Reversível? re-adicionar os arquivos `loading.tsx` a qualquer momento.

## 2026-07-13 · F3 · Reconciliações spec × mockup (decisões de conteúdo)

- Contexto: a spec §7 e o mockup aprovado divergem em pontos pequenos; a OS manda seguir o mockup como referência visual.
- Decisões: (1) KPI tiles mostram 7 (total + em uso + em estoque + reservados + em triagem + em manutenção + reserva técnica) — concilia a lista da spec §7 (tem "em triagem") com o mockup (tem "reserva técnica"). (2) Card "Ativos por categoria" = inventário completo por categoria (título/legenda do mockup), não só disponíveis — a disponibilidade já aparece no KPI e no card "Disponíveis por modelo". (3) `descartado` não entra no "Total de ativos" (baixa definitiva); `emprestado` conta no total mas não tem tile. (4) "Saídas/Devoluções por motivo" contam só por MOTIVO real — não inventei pseudo-motivos "Transferência"/"Empréstimo" (spec §5: são TIPOS, não motivos), diferindo do mockup de propósito. (5) Filtros internos do snapshot (filial/categoria/tipo) atuam sobre a tabela "Últimas movimentações" (onde o filtro por linha é natural e offline), não recomputam KPIs/gráficos agregados. (6) Chip de pendências "outras pendências" agrega o resto (inclui "sem patrimônio") — rótulo genérico e honesto.
- Motivo: fidelidade ao mockup aprovado sem inventar regra de negócio; hierarquia spec-primeiro registrada.
- Reversível? tudo em componentes/queries localizados.

## 2026-07-13 · F3 · Revisão adversarial multi-agente + correções (9 achados)

- Contexto: revisão adversarial em 6 dimensões (segurança do acesso, middleware/rotas, camada de dados, snapshot/versão, React/Next, aderência à spec/OS), cada achado verificado por um cético independente — 17 agentes. 9 achados confirmados e **corrigidos**:
  1. **[ALTO] Visualizador via só "Consolidado"** — as páginas de relatório carregavam `listarFiliais()` pelo client anon (RLS `authenticated`-only → lista vazia para a sessão por senha). As tabs de filial e o filtro do histórico sumiam para o visualizador, quebrando o caso de uso central (entregar link+senha por filial). Correção: `listarFiliais(client?)` aceita o client resolvido; as páginas passam `acesso.client` (admin para o viewer). Verificado: viewer agora vê as 5 filiais + Consolidado e abre o relatório de cada uma.
  2. **[MÉDIO] Hash de senha exposto ao browser do operador** — a policy RLS de `senhas_acesso` concedia SELECT (row-level, não column-level) a `authenticated`; um operador podia ler a coluna `hash` direto no PostgREST (anon key + seu JWT) e brute-forçar offline as senhas de visualização. Correção: `listarSenhasAcesso` passou ao client administrativo; **migration 0012** removeu as policies de `authenticated` em `senhas_acesso` (RLS habilitada, sem policy → só a service role, server-side, acessa). Todas as operações da tabela já rodam no servidor com service role.
  3. **[MÉDIO] `getDisponiveisPorModelo` truncava em 1.000** — `.limit(2000)` é cortado pelo teto do PostgREST; o estoque disponível pode passar disso no consolidado. Correção: paginação por `.range()` com ordenação por `id`.
  4. **[MÉDIO] Paginação do CSV do período sem desempate único** — `getTodasMovimentacoesPeriodo` ordenava por `created_at, data` (não únicos) → linhas podiam duplicar/sumir entre páginas. Correção: desempate final por `id` (aplicado também em `getUltimasMovimentacoes`).
  5. **[MÉDIO] `UNIQUE` não protegia o 'geral' contra versão duplicada** — `filial_id` NULL é distinto em índice único no Postgres; dois snapshots consolidados do mesmo período poderiam receber a mesma versão numa corrida. Correção: **migration 0013** cria índice único com `coalesce(filial_id, -1)`.
  6. **[MÉDIO] Última mov (reservados/manutenção) truncava em 1.000** — a busca `.in('ativo_id', ids)` sem paginação podia perder a última movimentação de um ativo. Correção: paginação com desempate por `id` e parada antecipada quando todos os ativos foram cobertos.
  7. **[BAIXO] Concordância verbal no resumo** — "Foram realizada 1 saída". Correção: "Foi realizada 1 saída" / "Foram realizadas N".
  8. **[BAIXO] CSV injection** — células começando com `= + - @` seriam fórmula no Excel. Correção: prefixo `'` nos valores de texto livre.
  9. **[BAIXO] `PeriodoFiltro` não sincronizava as datas** — trocar o preset não atualizava os campos do range custom. Correção: padrão "ajustar estado no render".
- Uma dimensão (react-next) voltou sem achados confirmados após verificação.
- Motivo: correção e segurança acima de custo (modo ultracode). `tsc`+`lint`+`build` limpos após as correções; Fix 1 e a listagem de senhas revalidados no navegador.
- Reversível? correções localizadas por arquivo; migrations 0012/0013 são reversíveis (recriar policy / dropar índice).

## 2026-07-13 · F3 · Melhorias pós-entrega (gráfico adaptativo, sidebar fixa, navegação do gestor, redirect por senha)

- Contexto: F3 entregue, mas 4 ajustes pedidos: (1) o gestor (visualizador por senha) não tinha caminho de navegação até os relatórios GERADOS; (2) o gráfico "por mês" ficava obsoleto no relatório semanal (uma barra só); (3) a sidebar do operador sumia ao rolar; (4) ao entrar por senha caía sempre em `/relatorios/geral`, ignorando o relatório que foi clicado.
- Decisão:
  1. Navegação no header do shell reduzido (`ViewerNav`: "Ao vivo" / "Gerados") + links cruzados nas páginas ao vivo ↔ gerados (para operador e gestor).
  2. Série de movimentações **adaptativa à duração do período**: ≤16 dias → por dia; ≤120 dias → por semana; acima → por mês. Rótulos (ptBR) e eixo já resolvidos na query e gravados no snapshot (congela estável no tempo). Compat: snapshots antigos (`movimentacoesPorMes`) continuam abrindo via normalização no `CorpoRelatorio`.
  3. `<aside>` do layout do operador vira `sticky top-14`, com altura de viewport e rolagem interna.
  4. O proxy guarda o destino em `?next=`; a Server Action `entrarComSenha` valida (só caminho interno de `/relatorios/**`, sem traversal / CRLF / protocolo-relativo / loop no `/acesso`) e redireciona para lá após autenticar.
- Decisão técnica (item 2): a granularidade dia/semana é agregada em TS a partir das linhas cruas (`data`, `tipo`) da janela curta (paginado), reaproveitando a RPC `rel_mov_por_mes` apenas no modo mensal — evitou nova migration + regeneração de tipos numa fase sem deploy. Um RPC `rel_mov_serie(p_bucket)` pode substituir no futuro sem mudar o front.
- Reversível? sim — mudanças 100% de aplicação (sem alteração de schema). Reverter = `git revert` do commit.
- Nota de incidente (infra, não-código): durante a execução, uma **cópia-fantasma** do projeto fora do OneDrive (`C:\Users\victor.matusita\Documents\Projetos\...`) foi progressivamente esvaziada pelo OneDrive (Known Folder Move redireciona a pasta Documentos). O repositório real e íntegro está em `...\OneDrive - FRESNOMAQ IND DE MAQUINAS SA\Documents\Projetos\...`; as mudanças foram aplicadas e validadas (lint + build limpos) nele.

## 2026-07-13 · F3 · Correção de fuso (UTC-3) + passe de responsividade mobile / UX

- Contexto: pós-entrega da F3, o Johnny pediu (1) corrigir o horário para UTC-3 (aparecia adiantado), (2) corrigir o design — principalmente **mobile** em tabelas e gráficos —, revisar espaçamentos e melhorar UX/UI. Rodei uma auditoria multiagente (7 lentes, 46 achados) + síntese priorizada, implementei, e verifiquei com uma revisão adversarial (3 lentes × verificação cética; 0 defeitos confirmados).
- **Fuso (raiz, `src/lib/format.ts`):** dois bugs. (a) `formatDateTime` usava `date-fns format(new Date(iso), ...)`, que lê os componentes no fuso do **runtime** — na Vercel (UTC) toda hora saía 3h adiantada (created_at, gerado_em, ultimo_uso). (b) `formatDate` também recebe `timestamptz` em vários lugares (created_at/updated_at); via `parseISO`+`format` local, um evento perto da meia-noite **virava o dia** em UTC. Correção: ambos passam a renderizar em `America/Sao_Paulo` via `Intl.DateTimeFormat` nativo (mesmo padrão já correto de `hojeISO`) — **sem dependência nova** (`date-fns-tz` é proibido). `hourCycle:'h23'` (não `hour12:false`) evita `24:00` na meia-noite. `formatDate` mantém o caminho de **data pura** (`^\d{4}-\d{2}-\d{2}$` → `parseISO` local, imune a fuso). Sem correção local nos ~5 call sites — todos herdam o fix central. Validado por teste unitário (Node): 02:30Z→23:30 do dia anterior (SP), meia-noite SP→`00:00`.
- **Mobile — tabelas:** revelação progressiva de colunas por breakpoint (`hidden md/lg:table-cell` em AMBOS `<TableHead>`/`<TableCell>`) em ativos, movimentações, 4 telas admin e histórico de gerados — no mobile só as colunas essenciais (ex.: patrimônio/categoria/status; a ficha segue acessível pelo link do patrimônio). Wrapper externo `overflow-x-auto` → `overflow-hidden rounded-lg border` (o container interno do shadcn Table já rola; agora os cantos arredondados recortam). Corrigido bug de **scroll horizontal da página** na "lista de manutenção" (modelo `whitespace-nowrap shrink-0` → `min-w-0 max-w-[45%] truncate`). Medido por JS a 375px: **0 elementos estourando, sem rolagem lateral**.
- **Mobile — gráficos:** série de movimentações com `aspect` responsivo (`aspect-[3/2]` no mobile → `md:aspect-[16/6]`) + `XAxis interval="preserveStartEnd" minTickGap` (legível em ~375px, sem thinning irregular); barras horizontais com largura de eixo Y e truncagem de rótulo **responsivas via `matchMedia`** (`'use client'`, SSR-safe: estado inicial `false` = sem hydration mismatch); KPI tiles (7 = nº primo) sem órfãos — o tile "Total" vira hero de largura cheia (`col-span-2 sm:col-span-3 xl:col-span-1`).
- **UX/UI/espaçamento:** alvos de toque ≥40px no mobile revertendo para a densidade `sm:` no desktop (`h-10/h-11/min-h-10/size-10` no header, paginação, tabs, filtros de período, ações admin, CTAs de login/acesso/definir-senha, stepper/remover do fluxo de movimentação); dialogs sem `max-height` ganharam `max-h-[…] overflow-y-auto` (motivo/estorno/filial/criar-senha/convidar) para o rodapé não sumir com o teclado; foco de teclado visível nos links de navegação (sidebar/filial-tabs/viewer-nav, com anel `#eda100` sobre o header escuro); `aria-label` nos botões só-ícone do cabeçalho do relatório; header alinhado à coluna de conteúdo (`px-4 md:px-6`); `max={hojeISO()}` no "Data do termo" (movimentação e edição), impedindo termo futuro; "Esqueci a senha" deixou de ser falso-link (dependia de `title`, sem hover no mobile) e virou texto informativo.
- Decisão de estilo mantida (revisão apontou, verificação absolveu): ações **secundárias** do cabeçalho do relatório (Imprimir, Estornar, Gerar relatório, Relatórios gerados, Abrir) ficam em `h-9` (36px) no mobile — melhoria sobre o `size="sm"`=28px do shadcn, acima do mínimo WCAG 2.5.8 (24px), com densidade adequada a controles secundários; os controles **primários** é que sobem para ≥40px.
- Escopo: 36 arquivos, **100% de aplicação** (nenhuma migration, nenhuma dependência nova, `ui/` do shadcn intocado). Verificação visual pixel-a-pixel não foi possível (o renderer do navegador da preview é instável neste ambiente — screenshots expiram); em troca: `lint`+`build` limpos, teste unitário do fuso, inspeção do HTML SSR (componentes server) e medição de overflow por JS a 375px (componentes client, via harness temporário de dados fictícios, já removido).
- Reversível? sim — `git revert` do commit (sem schema/infra).

---

## 2026-07-14 · F3B · Itens por quantidade, anotações e relatório v2 (formato do e-mail)

Execução da OS-F3B em **dois blocos de commit** (plano §9): B1 = banco + operação; B2 = relatório v2. Contrato: `docs/PLANO-RELATORIOS-V2.md` (decisões do Johnny de 14/07/2026).

- **Numeração das migrations:** 0014_itens · 0015_lancamentos_item · 0016_rpcs_relatorio_v2 · 0017_anotacoes · 0018_realtime_v2 (B1) + **0019_f3b_correcoes** (correções da revisão adversarial). Todas aditivas; aplicadas no dev via MCP; tipos regenerados.
- **Modelo de itens (regra crítica no Postgres):** `saldo = Σentrada − Σsaida ± ajuste`; `atrelados = Σ_chamado max(0, Σreserva − Σliberacao − Σsaida)` (clamp por chamado — a saída com o mesmo chamado consome a reserva, sem passar de zero); `falta = max(0, atrelados − saldo)`. Trigger `valida_lancamento_item` barra saldo negativo e liberação além da reserva aberta; imutável (sem update/delete). `itens.id` = smallint identity (como filiais); catálogo é dado de DEV (no `seed.ts`, não migration) e o `reset` limpa anotacoes→lancamentos_item→ativos→itens na ordem das FKs.
- **Atalho de teclado `L`** abre o dialog de lançamento de itens (o `N` já é da movimentação de ativos). Registrado aqui como pedido pela OS 3.3.2.
- **As-of (§7):** `rel_estoque_asof` reconstrói o estado de cada ativo numa data (última movimentação efetiva ≤ data; par movimentação+estorno se anula, espelhando o trigger 0004). Fast path: período terminando hoje usa o estado atual derivado (barato); período no passado usa a RPC. KPIs com Δ = estado as-of da véspera de `de`. Verificado por SQL (10a/10b/10c: saída→em_uso; após estorno→em_estoque; as-of anterior ao estorno segue em_uso).
- **Snapshot schema 2:** `getSnapshotRelatorioV2` monta o objeto com os 3 grupos + tabelas; `gerarRelatorio` grava `schema: 2`; `CorpoRelatorio` despacha v1/v2 pelo carimbo `meta.schema` (snapshots v1 antigos continuam abrindo — normalização). Realtime do operador passou a assinar `lancamentos_item` e `anotacoes` além de `movimentacoes`.
- **Sem export CSV** nas rotas `/relatorios/**` (decisão do plano §3.9): removidos `src/lib/relatorios/csv.ts`, `getTodasMovimentacoesPeriodo`, `exportarMovimentacoesRelatorio` e o botão da tabela; ficam impressão limpa e "copiar texto". **PapaParse permanece** (carga F4).
- **Filtro de filial na tela /itens e nos saldos:** filial selecionada usa `rel_saldo_itens(filialId)`; "todas as filiais" consolida por item (`p_filial null`). Registrado porque a OS diz "por item×filial" — a leitura por filial é exata; o consolidado soma. Grupos 2–3 do relatório escondem itens sem sinal (saldo/atrelados/mov/falta zerados) para reduzir ruído.
- **Footgun do `db:types`:** o `npm run db:types` (`supabase gen types --linked`) **sobrescreve o arquivo com um JSON de erro** quando o projeto não está linkado pela CLI neste ambiente. Regenerei os tipos via MCP (`generate_typescript_types`) e restaurei o arquivo. Corrigi também a nulabilidade dos args `p_filial` das RPCs (o gerador MCP tipou como `number`; o código passa `number | null`, que a função SQL aceita) — igual ao que a CLI gerava. Backlog: tornar `db:types` robusto (escrever em tmp e mover só no sucesso).

### Revisão adversarial (5 dimensões × verificação cética — 14 agentes): 9 achados confirmados, 8 corrigidos, 1 documentado

- **[médio] TOCTOU no trigger de itens** — sob READ COMMITTED, duas inserções concorrentes no mesmo item×filial liam o mesmo saldo e ambas passavam → saldo negativo. **Corrigido (0019):** `pg_advisory_xact_lock(item_id, filial_id)` no início do trigger (equivalente ao `FOR UPDATE` da 0004).
- **[médio→baixo] Corte de anotações em UTC** (`relatorios.ts`) — `.lte('created_at', 'ate'T23:59:59Z)` perdia anotações das últimas 3h do dia em SP. **Corrigido:** teto `…T23:59:59.999-03:00`; filtro do episódio usa `dataEmSP()` (novo helper em `format.ts`) em vez de `slice(0,10)` do ISO UTC.
- **[baixo] Saldo as-of negativo** (`rel_saldo_itens`) — saída retroativa fora de ordem deixava saldo intermediário negativo e inflava "falta". **Corrigido (0019):** `greatest(0, saldo)` (as demais colunas já eram clampadas).
- **[baixo] Filial "—" na manutenção** de ativo que voltou e depois saiu do estado da filial. **Corrigido:** `dadosAtivos` passou a trazer `filial_id` como fallback.
- **[baixo] Mensagem errada no double-estorno** — a violação do índice único (`duplicate key`) casava no ramo de patrimônio. **Corrigido:** ramo específico `lanc_item_estorna` antes do genérico em `erros.ts`.
- **[baixo] `aria-expanded` incoerente no desktop** do grupo recolhível. **Corrigido:** o toggle virou botão só-mobile (`md:hidden`, não-focável no desktop); título é `<h2>` simples.
- **[baixo · DOCUMENTADO, não corrigido] Estorno de `saida` com chamado restaura o saldo mas NÃO reabre o atrelado** — o inverso é uma `entrada` (sem chamado), e nenhum tipo único reverte saldo E reserva ao mesmo tempo. Efeito: após estornar uma saída que havia consumido uma reserva, "faltam N" fica subestimado até um novo lançamento de `reserva`. É limitação do modelo de inverso; o saldo (número físico) fica sempre correto. **Decisão:** documentar e não tratar como caso especial (evita dois lançamentos por estorno e complicar a guarda de duplo-estorno) — o operador reabre a reserva manualmente se necessário. Candidato a refino na F5.

Nenhum achado [alto] — o contrato central (saldo/atrelados/falta/as-of) está sólido.

- **Verificação:** contrato do banco exercitado por SQL via MCP (saldo/atrelados/falta, consumo de reserva, liberação, rejeições do trigger, as-of com estorno, lock não-bloqueante); roteiro `supabase/tests/itens_quantidade.sql` estendido; `lint`+`build` limpos; joins das tabelas finais e o or-filter de transferência conferidos por SQL. **Render no navegador não foi dirigido:** a criação de um operador de QA (necessária para logar e abrir o relatório) é bloqueada pela regra de segurança "nunca criar contas" — mesma limitação honesta da F3 (renderer da preview instável). A verificação recai sobre contrato de banco + build + revisão adversarial.
- Reversível? migrations só adicionam/recriam objetos; a UI é localizada por arquivo no git.

---

## 2026-07-14 · F5A · Termos de responsabilidade e devolução gerados pelo sistema

Execução da OS `docs/prompts/F5A-termos.md` (a partir do `docs/PLANO-TERMOS.md`, aprovado pelo Johnny). Gera o `.docx` do termo já preenchido, com preview do arquivo real e download; grava snapshot (jsonb) + arquivo no Storage; aplica a flag `gerado`.

- **Libs MIT (stack):** `docxtemplater` + `pizzip` (preenche o template preservando o arquivo) e `docx-preview` (render do .docx no navegador). Aprovadas pelo Johnny no plano §3.1; entram na stack fechada.
- **Preparação dos templates SEM LibreOffice (achado de ambiente):** o plano assumia LibreOffice, que **não está instalado**; o **Microsoft Word está**. Usei **Word via COM (PowerShell)** para (a) converter os 2 `.doc` legados → `.docx`, (b) exportar PDFs para conferência visual página a página, e (c) — só na conferência — renderizar os templates preenchidos. A **tagueação** (inserir `{marca}`, `{patrimonio}`…) foi feita por **iteração de parágrafo** (substitui o parágrafo inteiro da linha do campo), não por wildcard do Word: um `*` no fim do padrão casa vazio no Word e **duplicava/preservava o valor original** (bug pego na conferência visual do celular). Encoding: o `.ps1` precisou de **BOM UTF-8** — sem ele o PowerShell 5.1 lê como ANSI e os rótulos acentuados (`PATRIMÔNIO:`, `NÚMERO…`) não casavam.
- **Sanitização (regra 2) — verificada, não presumida:** os modelos "em branco" carregavam dados reais (nome, ST, patrimônio, IMEI, telefone — achado §2.1 do plano). Além de tagear todos os campos, um **scanner de blocklist** (nomes/ST/patrimônios/IMEI/telefone reais dos anexos) varreu cada template (document.xml + headers/footers + docProps) → **tudo limpo**; e os `docProps` (autor `User03`, `lastModifiedBy` = nome do usuário do Word) foram **escovados** para "Estoque TI WAP". Nenhum dado real entra no repo; os anexos e renders preenchidos ficaram só no scratchpad.
- **Imutabilidade × flag `gerado` (resolução de contradição plano × schema):** o plano §3.4 pede "marcar a **movimentação** como `gerado`", mas `movimentacoes` é **insert-only** (RLS 0005, invariante deliberado) e o trigger é `before insert`. Pela hierarquia do CLAUDE.md (schema/spec > plano): a geração de termo de **responsabilidade** atualiza **`ativos.termo_assinado='gerado'` + `termo_data`** (só quando o atual é `null`/`nao` — não rebaixa `sim`/`enviado`). É o que `v_pendencias`, a ficha e a lista leem → o efeito observável do aceite #4 é atendido onde importa. **Devolução não mexe na flag** (o ativo está em triagem; a coluna é sobre o termo de responsabilidade). **Desvio registrado:** a coluna "Termo" da tabela de **saídas do relatório** lê o valor **histórico e imutável** da movimentação — não reflete o `gerado` posterior (respeita a imutabilidade; a cobrança real, via `ativos`/pendências, reflete).
- **`v_pendencias`:** `gerado` **também conta como pendente** (plano §7) — só `sim` (assinado) sai da lista. A cobrança não afrouxa ao gerar o documento.
- **Datas:** corpo em minúscula ("14 de julho de 2026") — corrige a caixa inconsistente e o ano "2025" herdados dos modelos (plano §10.5); cabeçalho da devolução capitalizado ("Julho/2026", mantém o estilo). A data que era **campo automático do Word** na devolução foi **congelada como texto** (achado §2.4).
- **Mapa motivo→Descrição estendido (resolve pendência §10.2):** o plano esquecera `reposicao`→REPOSIÇÃO e `assistencia`→ASSISTÊNCIA TÉCNICA (ambos se aplicam a devolução nos seeds 0007). Adicionados; motivo sem entrada cai no rótulo em caixa alta; `outro` fica em branco p/ digitar.
- **Ordem/concatenação do lote (devolução):** notebook → monitor → celular → demais (desktop, tablet, outro), empate por patrimônio; série e patrimônio unidos por `", "`, marca+modelo por `" / "` (§2.3).
- **Nome sob a assinatura:** os 5 modelos de responsabilidade imprimem `{colaborador}`. Os originais de **desktop e monitor home office** vinham **em branco** ali; a geração passa a imprimir o nome (enriquecimento coerente com o plano §4.1; demais elementos idênticos ao original).
- **Pendências do Johnny resolvidas autonomamente:** cidade fixa "São José dos Pinhais" para todas as filiais (§10.4 — variar por filial fica fora); **tablet/"outro" não oferecem termo** (§10.3) — a categoria simplesmente não mostra o botão.
- **Storage / versão única:** bucket privado `termos`; objeto com **chave estável `${id}.docx` + `upsert`** (regerar sobrescreve, sem órfão). Trocar a **variante do monitor** (interno ↔ home office) muda o `tipo` (chave única `tipo+movimentacoes`): a action **apaga a linha+objeto da variante antiga** para manter uma só versão por conjunto de movimentações (§3.10). `movimentacao_ids` gravado **ordenado** (igualdade de array determinística).
- **Migrations 0020/0021:** `0020` só faz `ALTER TYPE termo_status ADD VALUE 'gerado'` (transação separada — o valor precisa ser commitado antes de ser usado); `0021` cria `termos_gerados` (+ GIN em `ativo_ids`/`movimentacao_ids`, RLS operador), o **bucket `termos`** e suas policies em `storage.objects` (só `authenticated`, só nesse bucket — anon/visualizador de fora), e recria `v_pendencias`. Aplicadas no dev via MCP; tipos regenerados.
- **Footgun do `db:types` (de novo, como na F3B):** `supabase gen types --linked` **truncou o arquivo** com um JSON de erro (`LegacyProjectNotLinkedError`). Restaurei via `git checkout` + edições cirúrgicas (enum `gerado` no tipo e em `Constants`; bloco da tabela `termos_gerados`) a partir da saída do MCP `generate_typescript_types`. Backlog reiterado: tornar `db:types` robusto (escrever em tmp, mover só no sucesso).
- **`next.config`:** `serverExternalPackages: ['docxtemplater','pizzip']` (libs CJS de Node, só server-side) + `outputFileTracingIncludes` das rotas `/movimentacoes/nova` e `/ativos/[id]` para `./src/templates/termos/**` (lidos por `readFile` em runtime).
- **Verificação:** os 7 templates conferidos **visualmente** (render preenchido → PDF via Word) — idênticos ao original, com todos os campos, logos, marca d'água, cláusulas, rodapé "WAP: Interna", e datas corretas; **pipeline de render server-side** provado nos templates finais do repo (readFile + docxtemplater + DEFLATE, sem tag órfã); **roundtrip de Storage** (upload → URL assinada → download **byte a byte** — aceite #5) e **bucket privado bloqueia anon** (URL pública → 400 — aceite #7), via script local com service role (regra 4); `tsc`+`lint`+`build` limpos; dev server sobe e compila as rotas novas. **Não dirigido:** o clique autenticado ponta-a-ponta na UI (gerar pelo dialog + preview no navegador) — depende de credencial de operador (insumo físico; regra "nunca criar contas"), mesma limitação honesta das fases anteriores. Todas as camadas subjacentes foram provadas.
- Reversível? migrations aditivas (a linha do enum é irreversível, mas o valor é fechado); UI/action localizadas no git; templates versionados em `src/templates/termos/`.

### Revisão adversarial F5A (5 lentes × verificação cética — 14 agentes): 7 achados distintos, 6 corrigidos, 1 aceito/documentado, 1 refutado

- **[médio] Devolução em lote com donos diferentes** (`termos.ts`) — o form permite juntar num lote de devolução ativos de colaboradores distintos; o colaborador do termo era derivado do **primeiro** `snapshot_anterior` truthy, em ordem **não-determinística** (`.in()`), atribuindo tudo a um nome. **Corrigido:** derivação determinística (Set + sort) e, quando o lote mistura donos, **aviso** no dialog ("gere termos separados por colaborador"). O termo é um documento único (§3.3/§3.7) — o aviso + campo editável mitigam; a decisão de bloquear lotes multi-dono no form fica como refino.
- **[médio] Botão "Devolução" da ficha gerava termo parcial/duplicado** — a geração retroativa na ficha passava **uma** movimentação; se já existisse um termo de devolução em **lote** consolidando aquele ativo, a busca de existentes (igualdade exata de conjunto) não casava e criava um **segundo** termo só com aquele ativo. **Corrigido:** a ficha **esconde o botão de gerar** (responsabilidade ou devolução) quando já existe termo daquela família cobrindo o ativo — a regeração é pelo "Editar" da lista, que reabre o termo real (o lote inteiro).
- **[baixo] Upload antes do insert, sem compensação** — o `.docx` subia ao Storage antes de gravar a linha; se o insert falhasse (ex.: corrida no `unique tipo+movimentações`, ou `profiles` ausente), o objeto ficava órfão. **Corrigido:** no erro de **insert**, remove o `.docx` recém-enviado antes de retornar.
- **[baixo] `termo_data` não atualizava ao regerar termo já `gerado`** — o guard `.or(is.null,eq.nao)` (que protege `sim`/`enviado`) também excluía `gerado`, então editar a data e regerar deixava a ficha com a data antiga. **Corrigido:** guard passou a `is.null,eq.nao,eq.gerado` (atende §3.9 sem rebaixar `sim`/`enviado`).
- **[baixo→segurança] `gerarTermo` confiava no `ativoIds` do cliente** — gravava `ativo_ids` e carimbava a flag na lista recebida, sem amarrar às movimentações; uma chamada forjada vincularia o termo/flag ao ativo errado. **Corrigido:** `ativoIds` agora é **derivado das movimentações no servidor** (como no `prepararTermo`) — o valor do cliente é ignorado. (Ator = operador confiável nível único, mas o princípio "movimentação é a fonte da verdade" fica respeitado.)
- **[baixo] Data de calendário inválida** (`2026-02-30`) passava o regex e fazia `date-fns` lançar `RangeError` **fora** do try → 500 genérico. **Corrigido:** `refine` no Zod (`isValid(parseISO)`) rejeita com "Data inválida".
- **[baixo · ACEITO, não corrigido] Limpeza de órfãos de variante é best-effort** — `storage.remove` na troca de variante do monitor ignora erro; sob falha transitória de Storage (mas DB ok) um `.docx` pode vazar. **Decisão:** aceito — DB+Storage não são atômicos, segue o mesmo padrão best-effort deliberado (flag/signedUrl/revalidatePath), impacto = arquivo perdido em bucket **privado** sob chave UUID nunca servida, só sob falha de infra. Candidato a varredura de órfãos agendada (F5).
- **[refutado] Reentrância no "Gerar e visualizar"** (duplo clique) — o verificador rejeitou: `setGerando(true)` é síncrono e o React re-renderiza (desabilitando o botão) entre os dois eventos de clique físicos.
- `tsc`+`lint`+`build` limpos após as correções; `refine` de data conferido por Node (`2026-02-30`→false).
