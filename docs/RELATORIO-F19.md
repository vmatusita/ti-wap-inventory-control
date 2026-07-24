# Relatório F19 — Auditoria de regras de negócio e verificação de fluxos

**OS-F19 (ultracode) · 24/07/2026 · direto na `main`.** Auditoria completa de conformidade spec ↔ banco ↔ app ↔ produção, verificação executável dos fluxos e correção das divergências confirmadas. Entregável central: [`docs/MATRIZ-REGRAS.md`](MATRIZ-REGRAS.md).

## Sumário executivo

| Métrica | Valor |
|---|---|
| Regras auditadas (7 áreas) | **209** |
| Conformes (prova executada ou por leitura) | **207** |
| Divergências confirmadas (bug) | **2** — ambas corrigidas |
| Doc desatualizada (spec/arquitetura emendada) | **2** |
| Não-implementado / handoff de config | **2** (leaked-password, signups — dashboard de Auth) |
| Migrations novas | **0054** (as-of desempate) · **0055** (grant) — não-destrutivas, caminho A |
| Roteiros SQL novos | 5 (`transicoes_extra`, `import_substituir`, `seguranca_catalogo`, `itens_extra`, `asof_desempate`) |
| Testes Vitest | 1018 → **1059** (+41: classificarPendencia, scrypt, anti-open-redirect) |
| Produção conferida | 100% read-only (estado × histórico, identidade, pendências, termos, itens, advisors, grants, ledger, smoke) |

**Veredito:** a base está **sólida**. Nenhuma regra corrompe dado nem fura acesso de forma explorável. As duas divergências (uma na reconstrução as-of de período passado, uma no grant de uma RPC) foram diagnosticadas na raiz, corrigidas por migration mínima e provadas antes/depois.

## Achados por severidade (evidência real colada)

### MÉDIO — `rel_estoque_asof`: desempate não-determinístico (achado C1 → migration 0054)
O import de startup insere a `compra` de abertura + o `ajuste` de reconciliação na MESMA transação (mesmo `created_at`; e mesmo `data` quando a linha tem uma data só). O `distinct on (ativo_id) order by data desc, created_at desc, id desc` empatava e caía no `id` (uuid aleatório) → ~metade dos 1.002 ativos com esse par resolvia para a COMPRA (`em_estoque`) em vez do AJUSTE (estado real).

**Evidência (SELECT em produção, read-only):**
```
rel_estoque_asof(hoje) × ativos:  status_diverge = 501  ·  501/501 no padrão compra+ajuste mesmo (data,created_at)
```
`ativos.status` é a verdade (o trigger faz last-insert-wins = o ajuste). Só afeta a reconstrução as-of de **período passado** (snapshot regerado/errata); o ao vivo lê `ativos` direto (`estoque.ts:44`).

**Correção (migration 0054, `create or replace` puro, diff = 1 cláusula):** no empate, `(e.tipo = 'ajuste') desc` faz a reconciliação vencer o nascimento — espelho do last-insert-wins do trigger. Fora do import cada mov é transação própria → inócuo.

**Prova (ENSAIO, teste adversarial):** compra com uuid ALTO + ajuste com uuid BAIXO e mesmo `created_at` → sem o fix o `id desc` pegaria a compra; com o fix `rel_estoque_asof` devolve `em_uso` (o ajuste) = `ativos`. Roteiro `asof_desempate.sql` (com controle que pega a regressão). Reconcilia a observação da F6A (16/07, "período passado subestima o inventário", deixada como backlog "herança F4"): a F6A viu o sintoma, a F19 achou a raiz.

_Latente NÃO corrigido (diff mínimo):_ o colaborador/setor as-of de um `ajuste` lê `snapshot_anterior` → posse de import não aparece na saída as-of (1.149) — **benigno**: essas colunas não são consumidas por relatório nenhum (`estoque.ts` lê só status/categoria/filial). Documentado (matriz R-REL-30).

### MÉDIO — `criar_compra_lote` executável por `anon`/`service_role` (achado C7 → migration 0055)
As outras 2 RPCs de escrita são authenticated-only; esta não. A 0040 endureceu o corpo (auth.uid()) mas o revoke era só `from public` — no-op, porque anon/service_role têm grant DIRETO.

**Evidência (SELECT em produção, `proacl`):**
```
criar_compra_lote        proacl = {postgres, anon, authenticated, service_role}   ← anon/service_role têm EXECUTE
devolver_ao_fornecedor   proacl = {postgres, authenticated}                        (correto)
importar_ativos_substituir proacl = {postgres, authenticated}                      (correto)
```
Risco real **BAIXO**: `criar_compra_lote` é SECURITY INVOKER → a RLS de INSERT de `ativos`/`movimentacoes` (só authenticated) barra o anon. Mas é divergência da invariante spec §9 / CLAUDE.md ("escrita = authenticated-only").

**Correção (migration 0055):** `revoke all … from public, anon, service_role; grant execute … to authenticated` (espelha o padrão das outras 2). Não toca corpo nem dado. **Prova (ENSAIO):** anon=false, service_role=false, authenticated=true. Trava em CI por `seguranca_catalogo.sql`.

### BAIXO — Doc desatualizada (emendas)
- **spec §5**: fórmula de `falta` e enum de `lancamentos_item` traziam o modelo pré-0027 (a própria §5 l.139 já tinha a nova). Código correto desde 0027/F12. → emenda citando a decisão.
- **ARQUITETURA.md**: "13 tipos" (são 15), "0001→0040" (são →0055), espelho TS apontado para `dominio.ts` (é `validators/movimentacao.ts`). → emenda.

### BAIXO — Regra 3 (saída/empréstimo → colaborador OU setor + motivo) só no Zod (R-MOV-02/03)
Enforçada só no `superRefine`/`min(1)`; o trigger não valida. **Decisão F19:** aceitar o enforcement no Zod/Server-Action (o único escritor de `movimentacoes`) e NÃO adicionar check no banco. Motivos: `movimentacoes` é append-only (sem UPDATE que reavaliaria); há **14** saídas/empréstimos legados do go-live sem destino (o banco nunca foi o portão); a consequência de um bypass é qualidade de dado, não corrupção. Reversível.

## Onda 3 — Consistência de produção (100% read-only)
Todos os checks fecharam limpos exceto os dois achados acima. Baseline: 1597 ativos, 3077 movimentações. Replay do histórico: **todas as 24 triplas (estado_anterior, tipo, estado_resultante) são transições legais**; 0 ilegais. Identidade: 0 pares duplicados, 0 "mesmo patrimônio ambos sem service tag". Pendências: 0 `ativos.pendencia` com "itens faltantes" (F18 cumprida). Advisors: 0 achado NOVO. Smoke `smoke-prod.mjs --exigir-f12`: **50 OK · 1 aviso · 0 falha** (baseline F12 era 33). Detalhe na matriz §Onda 3.

## Rollout (produção)
- **Migrations aplicadas por MCP** (caminho A do runbook — as duas não-destrutivas, sem `delete from`, sem tocar dado, não batem no gate): `0054` (`create or replace rel_estoque_asof`) e `0055` (revoke/grant de `criar_compra_lote`). Ensaio primeiro (provado), depois produção.
- **Verificação pós-apply em produção (antes → depois):**
  - `rel_estoque_asof(hoje)` × `ativos` divergência de status: **501 → 0** ✓ (cláusula de desempate presente no corpo)
  - `criar_compra_lote` grants: anon **true → false**, service_role **true → false**, authenticated = true ✓
  - acervo intacto: **1597** ativos, **3077** movimentações (idênticos ao antes)
  - `get_advisors(security)`: logicamente inalterado (0054 = `create or replace` de função SQL; 0055 = aperto de grant — nenhum adiciona achado); PostgREST recarregado (`notify pgrst`).
- **CI (GitHub Actions):** jobs `verificar` (lint+test 1059+build) e `banco` (aplica 0001→0055 + roda os 12 roteiros, incluindo os 5 novos) — <!-- run + conclusão preenchidos no push -->.
- **Deploy Vercel:** <!-- READY + get_runtime_errors preenchidos no push -->.
- **Smoke pós-deploy:** <!-- reexecução preenchida no push -->.

## Backlog (handoff ao Johnny)
- **Config de Auth (não-SQL, não-versionada):** habilitar Leaked Password Protection (R-ACC-22) e confirmar "signups disabled" (R-ACC-18) no dashboard.
- **DROP dos 2 backups órfãos** (`_bkp_relatorios_gerados_f6a`, `_f18_backup_pendencia`, RLS on) — pré-existente.
- **`devolucao_fornecedor`** fora das exclusões de "repetir última"/"recentes" (legado F14) — pré-existente.
- Reconciliação do ledger (registrar 0031-0037/0039/0040 já aplicadas) — pré-existente, opcional.
- Backlog de prova de baixo valor: `unique_violation` dedicado dos 2 índices parciais do import (R-IMP-08); conferências 5b-5d/rollback específicas do import (R-IMP-37).

## O que este relatório NÃO prova (limites honestos, padrão F12–F18)
- **Sem E2E visual autenticado** (login wall; o agente não digita senha). Todo fluxo de tela foi provado no **nível de dados** (as mesmas views/queries/actions), + SELECTs de produção + roteiros SQL + Vitest. Render exato, convite de operador fim-a-fim e a tela do import destrutivo real ficam para o clique humano.
- **Roteiros provados no ENSAIO** por SELECT-que-devolve-linhas (o MCP engole NOTICE/WARNING); a prova ✓/✗ canônica é o **job `banco` do CI** no push.
- **Config de Auth** não é lida por SQL — conferência no dashboard.

## Próximos passos
1. Johnny: conferir as 2 configs de Auth no dashboard.
2. Considerar o DROP dos backups órfãos e a reconciliação do ledger numa janela.
3. O E2E visual segue como o único vão que só um humano fecha.
