# RELATÓRIO — OS-F14 · Manutenção com fornecedor (23/07/2026)

Quatro melhorias no ciclo de manutenção: registrar o **chamado do fornecedor** (MN1), ganhar o
desfecho terminal **"Devolvido ao fornecedor"** (MN2) e, nesse desfecho, cadastrar o **substituto
com vínculo de sucessão** no mesmo submit (MN3/MN4). Entregue direto na `main`, migrations
aditivas aplicadas em produção pelo caminho A do runbook, código deployado e verificado.

**Resultado:** ✅ produção migrada e no ar. Suíte verde (**929 testes**, +4), lint 0, build 0.
Revisão adversarial de 5 lentes (1 achado real corrigido). Acervo de produção **intocado**
(1593 ativos antes e depois). Nenhum dado real neste relatório — exemplos fictícios.

---

## 1. O que mudou (arquivos e porquês)

### Banco (migrations 0044 + 0045, roteiro SQL)
- **0044** (`add value` dos dois enums, migration separada de propósito — valor de enum não é
  usável na transação que o adiciona): `status_ativo += devolvido_fornecedor`,
  `tipo_movimentacao += devolucao_fornecedor`.
- **0045** (aditiva, sem `delete`): coluna `movimentacoes.chamado_fornecedor` (texto livre) +
  check `NOT VALID` que a exige no `envio_manutencao` (preserva o histórico); coluna
  `ativos.substitui_ativo_id` + índice; recriação de **3 funções** por `create or replace` puro:
  - `status_apos_movimentacao` — diff vs 0024 = só o caso novo (`em_manutencao + devolucao_fornecedor → devolvido_fornecedor`) e a exclusão de `devolvido_fornecedor` na `transferencia`;
  - `rel_estoque_asof` — diff vs 0022 = só o WHERE (`status not in ('descartado','devolvido_fornecedor')`);
  - `aplicar_movimentacao` — **emenda da revisão** (ver §3), diff vs 0023 = só `devolucao_fornecedor` nas 2 listas de zeramento do detentor;
  - RPC nova **`devolver_ao_fornecedor`** (SECURITY INVOKER, atômica, grants a `authenticated`).
- `supabase/tests/manutencao_fornecedor.sql` — roteiro no padrão `maquina_estados.sql` (✓/✗,
  begin…rollback): 7 cenários cobrindo MN1 (check), MN2 (transições + válvula + estorno + zeramento
  do detentor) e MN3/MN4 (RPC com/sem substituto, colisão com rollback total, herança).
- `scripts/seed.ts` — `chamado_fornecedor` em todo `envio_manutencao` (senão o seed quebraria na
  check) + 2 casos fictícios do fluxo (1 sem substituto, 1 com substituto vinculado).

### Motor + fluxo (W2)
- `src/lib/dominio.ts` — `STATUS_META`/`STATUS_CHART_COLOR`/`STATUS_ORDEM` do estado novo (badge
  cinza-neutra de baixa) + `TIPO_META` do tipo novo.
- `src/lib/validators/movimentacao.ts` — `TRANSICOES` (em_manutencao ganha `devolucao_fornecedor`;
  chave terminal `devolvido_fornecedor: ['ajuste']`), `CAMPOS_POR_TIPO` (envio_manutencao passa a
  coletar `chamado` opcional + `chamado_fornecedor` **obrigatório**), `envioManutencaoSchema`.
- `src/lib/validators/devolucao-fornecedor.ts` + `src/lib/actions/devolucao-fornecedor.ts`
  (**novos**) — validador e Server Action dedicados (pré-checagens amigáveis + RPC); chamados e
  fornecedor herdados **no servidor**.
- `src/components/movimentacoes/devolucao-fornecedor-form.tsx` +
  `src/app/(app)/movimentacoes/devolucao-fornecedor/page.tsx` (**novos**) — fluxo próprio: sub-form
  do substituto, opção "sem substituto", painel de sucesso com os dois ativos.
- `nova-movimentacao-form.tsx` (lote filtra `devolucao_fornecedor`), `lista-filtros.tsx`,
  `kit.ts` (`TIPOS_EXCLUIDOS_DO_KIT`), `config.ts`/`passo-movimentacao.tsx`/`rascunho.ts`.

### Leituras, ficha, relatório, varredura (W3)
- `queries/movimentacoes.ts` (timeline expõe `chamado_fornecedor`; `ultimoEnvioManutencao`),
  `queries/ativos.ts` (vínculo de sucessão nos 2 sentidos), `queries/relatorios/estoque.ts`
  (inventário/KPIs/as-of excluem `devolvido_fornecedor`; card de manutenção mostra o chamado do
  fornecedor e fecha o caso por devolução com badge própria).
- ficha `ativos/[id]/page.tsx` — botão "Devolver ao fornecedor" (só em manutenção), links
  "Substitui …"/"Substituído por …", seção "Histórico do ativo substituído" (reuso somente-leitura
  de `LinhaDoTempo`). `linha-do-tempo.tsx`, `manutencao-casos.tsx`, `barras-empilhadas.tsx`,
  `page.tsx` (comentário do KPI), `ajuda/conteudo.ts`, import `deparas.ts`/`ops-grupo.ts`/`grupos-erros.tsx`.

Tabela ponto × decisão da varredura: `scratchpad/f14/impacto.md` (insumo do revisor).

## 2. Decisões
Registradas em `docs/DECISOES.md` (ata 2026-07-23 · F14). Destaques: chamados e fornecedor do
substituto resolvidos **no servidor** (autoridade + trata ativos legados sem o campo);
`devolucao_fornecedor` **fora** do fluxo de lote genérico (action dedicada, lote sempre 1);
a série de movimentação do relatório **não soma `descarte`** — logo `devolucao_fornecedor` fica de
fora por omissão (paridade), exceto a **compra do substituto** que aparece nas Entradas; execução
num único contexto (não em frentes paralelas) por causa das quebras de TS cruzadas.

## 3. Revisão adversarial (5 lentes, refutação por padrão)
- **rpc-atomicidade, vazamento-mn1, inventário, aceites** — 0 achados (todas as suspeitas refutadas
  por leitura do código).
- **máquina-estados — 1 achado (média), CORRIGIDO:** o trigger `aplicar_movimentacao` não fora
  recriado, então `devolucao_fornecedor` (espelho de `descarte`) **não zerava** colaborador/setor.
  Pelo caminho `ajuste → em_manutencao` (que preserva o detentor) e depois devolução, um ativo
  baixado ficaria com "colaborador fantasma" na ficha e na busca. Correção: recriar o trigger
  acrescentando `devolucao_fornecedor` às 2 listas de zeramento. Provado por asserção em ensaio
  (`GHOST_FIX_OK`) e roteiro (cenário 7).
- 1 achado baixo (import morto `Button`) corrigido. **Re-revisão do trigger: LIMPO** (diff
  token-idêntico a 0023 + só as 2 listas; estorno intacto).

## 4. Saídas reais

### Qualidade (união, local)
```
LINT_EXIT=0
TEST_EXIT=0   → Test Files 44 passed (44) · Tests 929 passed (929)
BUILD_EXIT=0
```

### Roteiro SQL (ensaio — asserção com rollback)
```
ERROR: P0001: ROTEIRO_F14_OK   (7 cenários passaram; nada persistido — ativos_teste_residual=0)
ERROR: P0001: GHOST_FIX_OK     (emenda do trigger: ajuste preserva detentor; devolução zera)
```

### Smoke BASELINE (produção, pré-apply)
```
ativos_total=1593 · devolucoes=0 · envio_manutencao=0
enums/colunas novos: ausentes (pré-F14)
corpos vigentes = base 0022/0023/0024:  sam=true  asof=true  trigger=true   (sem drift)
```

### Apply + verificação pós-apply (produção)
```
0044 apply: success   0045 apply: success
enum.status = {…,descartado,devolvido_fornecedor}      enum.tipo = {…,estorno,devolucao_fornecedor}
col.chamado_fornecedor=1  col.substitui_ativo_id=1  check.envio=1  idx.substitui=1
rpc.count=1  rpc.args=(p_ativo_id uuid, p_mov jsonb, p_substituto jsonb, p_criado_por uuid)
sam.caso_novo=true  asof.exclui_devolvido=true  trigger.zera_devolucao=true
grants: anon=false  authenticated=true  service_role=false
ativos_total_inalterado=1593   devolucoes_persistidas=0
advisors (security): 0 achados NOVOS da F14 (a RPC é SECURITY INVOKER)
notify pgrst 'reload schema': ok
```

### Deploy + smoke PÓS-DEPLOY
```
push: 05c5575..e05856e main -> main
deploy dpl_9atsjaFy6fyYnVhMJXa1MJyMUSBG (commit e05856e) state=READY target=production
DB read-only: ativos_total=1593 · devolvido_fornecedor=0 · substitutos=0 · devolucoes=0
              chamado_fornecedor preenchido=0 · enum.status=9 · enum.tipo=14 · rpc callable=true
runtime errors (Vercel, última 1h): nenhum
```

## 5. O que este relatório NÃO prova

- **O fluxo real em produção só será exercido na PRÓXIMA manutenção de verdade.** Hoje o acervo tem
  **0 `envio_manutencao`** — nenhum ativo foi para manutenção em produção ainda —, então nenhuma
  devolução ao fornecedor foi (nem podia ser) registrada. `devolucoes_persistidas=0` e
  `chamado_fornecedor preenchido=0` são o estado correto, não uma falha.
- **Não houve E2E autenticado em navegador.** As telas ficam atrás do login de operador e este
  ambiente não insere credenciais (limitação registrada desde a F11/F12). A prova do motor é o
  **roteiro SQL** (7 cenários, ✓ em ensaio) + a suíte Vitest; a prova do banco em produção é a
  verificação pós-apply e o smoke read-only. O clique real fica com o Johnny.
- **Smoke `.mjs` ausente.** `scratchpad/smoke/smoke-prod.mjs` (baseline F12/F13) não está neste
  checkout (é gitignorado e não sobreviveu) e as env `SMOKE_*` não existem no `.env.local`. O smoke
  desta ordem foi feito por **contagens/status via MCP** (padrão F12) — read-only, sem tocar dado.
- **CI (job `banco`) não confirmado deste ambiente.** `gh` não está instalado e o MCP do GitHub
  exige autenticação. O push disparou o CI; o job `banco` aplica **todas** as migrations do zero e
  roda os roteiros. Verifiquei os componentes (0044/0045 aplicam; o roteiro passa em ensaio), mas o
  **status do run no GitHub Actions deve ser conferido no painel**.

### O que o Johnny confere no PRIMEIRO caso real
1. Enviar um ativo à manutenção: o form de `envio_manutencao` agora **exige** o chamado do
   fornecedor (mensagem em pt-BR se faltar).
2. Na ficha desse ativo (em manutenção), o botão **"Devolver ao fornecedor"**; registrar com um
   substituto → painel mostra os **dois** ativos (antigo devolvido, novo em estoque), com links.
3. Ficha do novo: seção **"Histórico do ativo substituído — WAP…"** + link; ficha do antigo:
   **"Substituído por WAP…"**; o antigo some do inventário/KPIs; a compra do novo aparece nas
   **Entradas** do relatório do período.
