# F56 — handoff para continuar em outra máquina

*Escrito em 11/09/2026 (fim da tarde), quando o Johnny precisou trocar de máquina no meio da fase. Este arquivo é
o ponto de partida da próxima sessão: leia-o INTEIRO antes de qualquer comando. A ordem de serviço continua
sendo `docs/prompts/F56-import-sem-wapismo-e-sem-bomba-ultracode.md` e o plano aprovado, `docs/PLAN-F56.md`.*

---

## 0. Em uma frase

A F56 está **pela metade**: as Frentes **A, B, C e a primeira metade da D** (migration `0139`) estão feitas,
verificadas por revisão adversarial, com CI verde, e foram para a `main` pelo PR #42. A `0139` está **aplicada e
verificada no ENSAIO**, e **NÃO em produção**. As Frentes **D2, E, F, G e H** ficaram em andamento e o trabalho
parcial delas está na branch **`f56-continuacao`**, num commit de WIP **não verificado** (pode não compilar).

## 1. Onde está cada coisa

| O quê | Onde | Estado |
|---|---|---|
| Frente A — `filial_fora_do_vocabulario` | commit `f7cee4b` (na `main` pelo PR #42) | feito, verificado |
| Frente B — enums de `Enums<>`, `ExcluirDaUniao`, regex numa fonte só, passo `typecheck` no CI | `b804cdd` (main) | feito, revisão adversarial aprovada |
| Frente C — tetos 1 MiB / 2.000 linhas / 768 KiB / 500 correções, `.xlsx` antes do load, `linha_desalinhada`, `valor_longo_demais`, O(N²) das duplicatas, orçamento da resposta | `202503f` (main) | feito, revisão adversarial aprovada |
| Frente D1 — migration `0139` (vocabulário no banco), guardas, catálogos, roteiro, 2 mutações, `database.ts` hand-fix | `7c7a360` (main) | feito, 3 rodadas de revisão |
| Correção do cenário 5e do roteiro | `31c7878` (main) | CI verde: run 34636816039 — 34 roteiros, 801 asserções, 69/69 mutações |
| `0139` no ENSAIO | `docs/f56-evidencias/P1-apply-0139-ensaio.txt` | **aplicada e verificada** (md5 dos corpos, do seed e do comment batem com o arquivo) |
| `0139` em PRODUÇÃO | — | **NÃO aplicada** (ver §4, passo 3) |
| D2, E, F (SQL), G (preparo) — trabalho parcial | branch `f56-continuacao`, commit "wip(f56)…" | **NÃO verificado** — agentes interrompidos no meio |
| Relatórios das 13 medições desta sessão (antes só no temp da máquina 1) | `docs/f56-handoff/medicoes/` | referência das decisões; sem dado real (varridos) |
| Scripts dos workflows (com os prompts exatos de cada agente) | `docs/f56-handoff/workflows/*.js` | reaproveitáveis; troque o caminho do scratchpad por `docs/f56-handoff/medicoes` |
| Impressões esperadas da `0139` para o apply de produção | `docs/f56-handoff/scripts/esperado-0139.mjs` | rode com `node` na raiz do repo |

## 2. O que já foi decidido e medido (não refazer)

Tudo está no `docs/PLAN-F56.md` (as treze decisões) e nas atas da F56 no fim de `docs/DECISOES.md`. Os pontos que a
próxima sessão mais precisa ter na cabeça:

- **Tabelas da `0139`:** `unidades_apelidos` (13 apelidos por slug; o nome próprio da filial vale sempre, sem linha),
  `import_termos_categoria` (5), `import_termos_estado` (17, 12 rótulos com acento), `import_prefixos_patrimonio` (7);
  `vocabulario_chave(text)` espelha `normalizarTexto` (classe explícita de 25 code points, `collate "und-x-icu"`);
  ambiguidade barrada por `filiais_nome_chave_uidx`, `unidades_apelidos_apelido_chave_uidx` e o gatilho
  `vocabulario_unidades_guarda` (P0001 com mensagem que nomeia termo e filial). Verbos novos na trilha:
  `apelido_incluido`, `apelido_removido`, `usuario_criado`.
- **Tetos (limites.ts é a fonte única):** arquivo 1 MiB · 2.000 linhas · 40 colunas · 768 KiB de conteúdo (bytes já
  escapados para JSON) · 32 MiB de XML descomprimido · 500 correções · 120/120 · `LIMITES_CAMPO_PLANO` ·
  `bodySizeLimit` 4.500.000 · folga 1,5 · orçamento da resposta 2.000.000 B de JSON. Tabela dos cinco corpos em
  `docs/f56-evidencias/C2-conta-dos-corpos.txt`.
- **Contrato da FK (Frente F), fixo:** acervo = ativos da filial ATUAL. `p_contagens`/custo/backup ganham
  `pendencias_item`, `lancamentos_movimentacao`, `lancamentos_pendencia`, `ponteiros_substituto` (chave ausente vale
  **0** e é conferida contra o vivo). Retorno da RPC ganha `pendencias_apagadas`, `lancamentos_desvinculados`,
  `ponteiros_anulados` (`.default(0)` no Zod). Ordem na auxiliar: desvincula `pendencia_item_id` → desvincula
  `movimentacao_id` → apaga `pendencias_item` do acervo → anula `substitui_ativo_id` de fora → deletes de sempre
  (movimentações num statement só). Backup `versao: 2` com `pendencias_item`, `lancamentos_desvinculados`
  (`[{id, movimentacao_id, pendencia_item_id}]`) e `ponteiros_perdidos`; `restaurar.mjs` religa e recusa versão > 2.
  `RECUSAS_DA_RPC` ganha `23502, 23503, 23505, 23514, 40001, 40P01`; `import_falhou` grava `backup_path` quando o
  backup fica e `backup_descartado` só quando sai; o ramo `safeParse` grava evento com `backup_path`.
- **Smoke (Decisão 11):** Playwright contra `next dev` local apontado para o ENSAIO; guarda que lê SÓ
  `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` e **nunca `SMOKE_*`** (que apontam para
  PRODUÇÃO com a conta admin); persona `seed.admin@wap.ind.br` por `auth.admin` com senha aleatória em memória,
  desativada no fim; filial `sede` como fixture permanente do ensaio.

**Achados desta sessão que viraram decisão/ata** (não perca):
1. `npm run build` NÃO checa tipo de arquivo fora do grafo da app → CI ganhou `npm run typecheck`.
2. Mensagens de duplicata eram O(N²) (45 MB de resposta com 2.000 linhas) → corrigido.
3. `.xlsx` bomba disfarçada (298 KB → 300 MB) passava pelo leitor → inflado com `maxOutputLength` antes do load.
4. Gatilho BEFORE lendo coluna gerada não funciona (pego na revisão, antes do CI).
5. O cenário 5e do roteiro lia `FOUND` ao contrário (pego pelo CI).
6. As tabelas novas herdam os privilégios padrão do Supabase (inclusive TRUNCATE para anon/authenticated) —
   igual a `tipos_item`, `filiais` etc.; só `ativos` teve TRUNCATE revogado. **Backlog de hardening**, não defeito
   da fase.
7. As outras quatro RPCs destrutivas (`apagar_ativo`, `apagar_movimentacao`, `resetar_acervo`,
   `apagar_ativos_conflito_filiais`) não tratam os dois elos de `lancamentos_item` → **backlog nomeado**.

## 3. O que está no commit de WIP (`f56-continuacao`) — confira ANTES de confiar

Os agentes foram interrompidos no meio. Cada frente precisa ser **terminada e revisada** (o padrão desta fase:
implementador → revisor adversarial em contexto fresco → correção). Arquivos tocados por frente:

- **D2 (motor por parâmetro, trava `sem-wapismo` verde):** `src/lib/import/{vocabulario.ts,vocabulario.test.ts,
  leitor-seed-vocabulario.ts,deparas.ts,deparas.test.ts,plano.ts,plano.test.ts,correcoes.ts,correcoes.test.ts,
  parse.ts,parse.test.ts,resolver-patrimonio.ts,resolver-patrimonio.test.ts,tipos.ts,index.ts,enums-sql.test.ts,
  limites.test.ts,vocabulario-sql.test.ts,xlsx.test.ts,sem-wapismo.test.ts}`, `src/lib/queries/vocabulario-import.ts`,
  `src/lib/actions/importar.ts` (+ `importar.test.ts`), `src/app/(app)/admin/importar/page.tsx`,
  `src/components/admin/importar/{grupos-erros.tsx,importar-wizard.tsx,ops-grupo.ts,ops-grupo.test.ts}`,
  `src/lib/patrimonio.ts`, `src/lib/patrimonio-sql.test.ts`, `scripts/perf/*`.
- **E (apelidos em Administração › Filiais):** `src/components/admin/{filial-apelidos.tsx,filial-apelidos.test.tsx,
  filial-dialog.tsx}`, `src/app/(app)/admin/filiais/page.tsx`, `src/lib/actions/{unidades-apelidos.ts,admin.ts,
  erros.ts,guardas-de-action.test.ts}`, `src/lib/validators/admin.ts`, `src/lib/queries/admin.ts`, `src/lib/unidades/`,
  evidências `E1`/`E2`.
- **F — metade SQL:** `supabase/migrations/0140_import_desarma_fk.sql` (**ainda não passou por revisão nem CI; nunca
  foi a banco nenhum**), `supabase/migrations.lock.json`, `src/lib/itens/migrations-f38.test.ts`,
  `supabase/tests/{import_substituir.sql,restauracao.sql}`, `scripts/db/{mutacoes.mjs,mutacoes.test.mts,
  restaurar.mjs,restaurar-guarda.test.mts}`, evidência `F1-diff-dos-corpos.txt`.
- **G — preparo do smoke:** `scripts/smoke/{guarda-ensaio.ts,guarda-ensaio.test.ts,persona.ts,checagens.ts,
  fixtures-passe2.ts,planilha.ts,import-ensaio.ts,README.md}`, `scripts/env-guard.ts`, evidências `G1`.
  **Nada foi executado contra banco.**
- `docs/DECISOES.md` pode ter atas parciais anexadas por esses agentes — releia o fim do arquivo.
- `src/lib/queries/relatorios/fronteira-viewer.test.ts` foi tocado por algum agente — confira se é do escopo.

⚠ Como a `0140` e o lock nunca foram a banco real, editar a `0140` e regravar com
`npm run db:lock -- --regravar-alterada` é permitido (registre na ata).

## 4. O caminho daqui até o fim, na ordem

1. **Retomar na outra máquina:**
   ```powershell
   git fetch origin; git checkout f56-continuacao; npm ci
   npm run lint; npx tsc --noEmit; npm run test   # medir o estado real do WIP
   ```
   `.env.local` com os MESMOS nomes da máquina 1 (NEXT_PUBLIC_* → ensaio `sgmvldiizsrjbxzzpmhh`; SMOKE_* →
   produção `pbtjcalbmepmrqzprusb`; `SUPABASE_SERVICE_ROLE_KEY` do ensaio). Conecte o MCP da Supabase e o `gh`.
2. **Terminar e revisar D2 e E** (podem ir em paralelo: arquivos disjuntos). Critérios 1, 3-7, 20, 21. A trava
   `sem-wapismo` tem de ficar verde sem exceção por categoria. Use os prompts de
   `docs/f56-handoff/workflows/f56-frentes-d2-e-e-*.js`.
3. **Aplicar a `0139` em PRODUÇÃO ANTES de mergear D2/E** (o código delas lê as tabelas). Molde: o apply do ensaio
   em `P1-apply-0139-ensaio.txt` — `apply_migration(name='vocabulario_import')` com o texto integral do arquivo, e
   conferir md5 dos corpos/seed/comment com `node docs/f56-handoff/scripts/esperado-0139.mjs`, RLS, policies,
   advisors sem achado novo, contagens do acervo antes = depois, `notify pgrst`.
4. **Terminar e revisar a metade SQL da F** (`0140`, roteiros, mutações, restaurador) e fazer a **metade TypeScript**
   (backup v2 em `aplicarImport`, `custoSubstituir`/`exportarAcervoFilial` com as classes novas, `RECUSAS_DA_RPC`,
   `import_falhou`, `rpcRetornoSchema`, tela do "o que será apagado", `backup-formato`/`backup-completude`).
   Prompt de referência: `docs/f56-handoff/workflows/f56-frente-f1-sql-*.js`. CI verde → `0140` no ENSAIO (caminho B:
   md5 do `prosrc` normalizado das três funções contra o arquivo) → depois produção. Se o classificador barrar, NÃO
   reformule: handoff de SQL para o Johnny rodar no SQL Editor.
5. **Frente G — rodar o smoke no ENSAIO** (os três passes; as doze checagens iguais antes e depois; persona
   desativada no fim). Os passos marcados `SELETOR-A-CONFERIR` dependem das telas finais de D2/E.
6. **Frente H — fechamento:** ajuda do import (`src/lib/ajuda/conteudo/import-de-startup.ts` e páginas de mensagens;
   cuidado com os `toContain` de `gestao.test.ts:729-800`), `ESPECIFICACAO.md` §5 e §10.2, `ARQUITETURA.md` §10,
   `MATRIZ-REGRAS.md` (R-IMP-42+ e emenda da R-IMP-41), `RUNBOOK-BANCO.md` "O gate do modo automático", atas,
   `scripts/smoke/README.md`, `CHANGELOG.md`, `package.json` **1.61.0**, `src/lib/versoes/registry.ts` (linguagem de
   operador), `docs/README.md` (índice), `docs/RELATORIO-F56.md` com o roteiro do Johnny no topo.
7. **Revisão adversarial final** em contexto fresco contra o PLAN e os 35 critérios; corrigir e re-revisar.
8. `npm run db:types` de PRODUÇÃO (substitui o hand-fix), PR novo de `f56-continuacao` → `main` com `verificar` e
   `banco-sem-docker` verdes, merge, deploy, `node scripts/smoke/smoke-prod.mjs`, tag anotada `v1.61.0` publicada.

## 5. Números de referência (para os "antes × depois")

- Linha de base de testes no começo da fase: **4.611 testes / 180 arquivos**; depois de A-D1: **4.850 / 186** (+ a
  trava `sem-wapismo` vermelha de propósito, fora do commit).
- CI: 25→**34 roteiros**, **801 asserções**; injetor **69/69** (teto 70).
- Ensaio antes do smoke: ativos 1602 · movimentações 3239 · lançamentos de item 31 · pendências de item 23 ·
  termos 2 · filiais 5 · perfis 4 · eventos_admin 0 · import_logs 0 · bucket backups-import vazio · 12 checagens =
  0 exceto `operador_sem_filial` = 1. Issue #41 (alarme do ensaio) **fechada** em 11/09 16:36 UTC.
- Produção: 6 filiais (matriz 1.142 ativos, cd-afonso-pena 199, linhares 161, serra 56, eusebio 58, filialteste 5);
  12 imports, o último em 31/07; maior planilha 1.228 linhas; FK presa: Matriz 16 pendências + 18 lançamentos,
  Linhares 16 lançamentos, Eusébio 1 pendência, Filial de Teste 12 lançamentos.
- Sonda de paridade ensaio × produção ANTES de qualquer DDL: 10 classes idênticas (`P0-sonda-paridade-antes-do-apply.txt`).
  Depois do apply da `0139` só no ensaio, a paridade vai divergir até a `0139` ir a produção — esperado.

## 6. Regras que não mudam com a troca de máquina

- Nenhum import roda em PRODUÇÃO nesta fase. O smoke só no ENSAIO, só na filial `sede` que ele cria.
- Nenhum dado real em teste, fixture, evidência, smoke ou log. Nunca imprimir valor de credencial.
- Migration aplicada em banco real nunca se edita (a `0139` já foi ao ensaio: correção é migration nova).
- Nada de push forçado, `git reset --hard`, mexer na proteção da `main`.
