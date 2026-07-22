# Changelog — Estoque TI WAP

Histórico das fases (ordens de serviço `docs/prompts/F*`), da mais recente para a mais antiga. Cada fase roda em **modo autônomo** (`CLAUDE.md`): o Claude Code decide, executa, faz merge/deploy e registra o rastro detalhado — decisões, contagens, atas de rollout — em [`docs/DECISOES.md`](docs/DECISOES.md). Este arquivo é o resumo navegável; a ata completa de cada item está em `DECISOES.md` na data indicada.

Legenda: ✅ concluída · 🚧 pendente · 🔒 em produção. As migrations destrutivas do import (0031–0037, 0040) são aplicadas à mão pelo Johnny no SQL Editor por causa do "gate" do modo autônomo — ver [`docs/RUNBOOK-BANCO.md`](docs/RUNBOOK-BANCO.md).

---

## 22/07/2026 — F9: quick wins de UX da operação

- ✅ **F9** (execução multi-agente: 5 frentes paralelas → integração → revisão adversarial de 9 dimensões) — os **14 itens da Onda 1** do novo [`docs/BACKLOG-UX.md`](docs/BACKLOG-UX.md), **sem migration e sem dependência nova**:
  - **Movimentação** — o combobox passa a achar ativo pelo **nome do colaborador** (M2); adicionar ativo que estreita a interseção de estados deixa de limpar o tipo em silêncio e **diz qual ativo causou** (M7); chips **Hoje/Ontem** nos dois campos de data (M10).
  - **Compra** — o colar-lista aceita **TAB e ponto e vírgula** além da vírgula, então duas colunas do Excel entram direto (A1); **duplicata é acusada no preview**, com o número da linha, antes do envio (A3); autofoco no campo e **memória de filial/categoria** por dispositivo (A5); a ajuda documenta a **bipagem por leitor USB**, que já funcionava e ninguém sabia (A7).
  - **Itens** — histórico filtra por **item, tipo e período** com estado na URL (I3); botão na linha do saldo abre o lançamento **já preenchido** (I6).
  - **Transversal** — **badge de contagem** em Pendências na sidebar e KPIs do dashboard **linkando** para as listas filtradas (T2); **confirmação ao revogar senha** de acesso, o último destrutivo sem diálogo (T4); **copiar patrimônio** com um clique na ficha e na lista (T6); componente `EstadoVazio` padronizando os vazios de Pendências, Itens, Import e dashboard (T8).
  - **Correção da ajuda (I5a)** — a `/ajuda` prometia "estoque mínimo configurado", campo que **não existe** (é F5). Passa a descrever a semântica real de *Falta* da migration `0027`; a fórmula escrita na própria ordem de serviço foi descartada porque a `0027` a rejeita por escrito.
- ✅ **Revisão adversarial** — 32 achados brutos, cada um julgado por 3 céticos com lentes distintas; **8 sobreviveram** e foram corrigidos, com destaque para: perda de filtro quando dois filtros de `/itens` são trocados na mesma janela de navegação (o `window.location` "fresco" que o repo usava era placebo — o Next só escreve a history no commit); `?item=` fora da faixa do `smallint` derrubando a página; e o bloco novo da ajuda mandando "digitar TAB" num campo onde Tab move o foco.

## 21/07/2026 — Manutenção: dívida técnica, segurança e documentação

- ✅ **Revisão de código + segurança** — migration `0038` (revoke execute nas funções de gatilho), RLS nas tabelas de backup expostas, correções de `.blob()`. Backlog para o Johnny: DROP dos backups órfãos (`0039`), hardening das RPCs (`0040`). Ata em `docs/DECISOES.md`.
- ✅ **Auditoria de dívida técnica em faixas** — diagnóstico em [`docs/DIVIDA-TECNICA.md`](docs/DIVIDA-TECNICA.md); remediação: dedup/código-morto, **CI de banco** (job que sobe Postgres e aplica `0001→0040` + roteiros de `supabase/tests/`), propagação de SQLSTATE, escada de precedência do patrimônio extraída, Dependabot, [`docs/ADR-001-rls-por-filial.md`](docs/ADR-001-rls-por-filial.md) e [`docs/RUNBOOK-BANCO.md`](docs/RUNBOOK-BANCO.md). Migrations `0039` (drop backups) e `0040` (hardening) ficam pendentes de apply pelo Johnny.
- ✅ **Higiene de documentação** — `supabase/schema.sql` (rascunho congelado na F1) **aposentado**; `README` enxugado com o histórico movido para este `CHANGELOG`; novo [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## 20/07/2026 — Refino do import (deploy-only, exceto onde indicado)

- ✅ **F7K** — modelo que repete a marca (`HP` + `HP Pro SFF 280 G9` → rótulo "HP HP…") é auto-corrigido no import (`modeloSemMarca`), consertando na fonte todos os displays. Sem migration.
- ✅ **F7J** — hostname aceita patrimônio com <7 dígitos só para prefixos conhecidos (`WAP, PRO, LEA, TEC, STF, PAT, NOO`); valor fora do padrão pode ser **forçado** e vira patrimônio não-canônico; botão "Sem patrimônio" limpa o campo → pendência. Migration `0037` relaxa a validação de formato no banco (fica só sanidade ≤60; a régua passa para o motor/UI).
- ✅ **F7-pós** — auto-preenchimento do patrimônio pelo hostname vira **correção automática silenciosa** e passa a valer também para patrimônio fora de formato; toda forma textual de ausência de plaqueta importa vazio (nulo + pendência). Sem migration.
- ✅ **F7G / F7H / F8** — `admin/importar` passa a ler **`.xlsx` nativo** (ExcelJS, aprovado pelo Johnny), consertando ~355 datas da Matriz perdidas na reexportação CSV (F7G). A F7H (compra com data real nas Entradas) foi **revertida pela F8** (`0036`): a compra de abertura do import volta a ser **sempre baseline** (fora das Entradas, com ou sem data); a data real segue na ficha/linha do tempo/as-of. Import de histórico de saída/devolução **descartado** (decisão do Johnny). SQL de produção entregue ao Johnny (gate).

## 17/07/2026 — Import de startup: robustez

- ✅ 🔒 **F7F** — facilitadores antes do próximo go-live, sem migration: erro do "Substituir tudo" traduzido por SQLSTATE + substring e logado, `bodySizeLimit` 8 MB; patrimônio ausente auto-preenchido pelo hostname (aviso âmbar auditável); "Aplicar tudo" inclui grupos parciais; tier âmbar (aviso ≠ erro).
- ✅ 🔒 **F7E** — datas de entrega `dd/MMM` puxam o ano da inclusão e datam o **ajuste**; **patrimônio vazio** importa NULO com pendência `sem patrimônio físico` (lista + `/pendencias`); erros do mesmo tipo agrupados num card com sugestão 1-clique do hostname. Migration `0034` (patrimônio nullable + índice parcial + RPC com pendência).
- ✅ 🔒 **F7B** — erros e avisos do import se corrigem **no passo Preview**, não no CSV: agrupados por valor e corrigidos em massa (com sugestão por Levenshtein), pontuais com o contexto da linha, painel com Desfazer e reanálise automática. CSV original imutável; correções auditadas em `import_logs.correcoes` (migration `0033`).

## 16/07/2026 — Import de startup + melhorias pós-go-live

- ✅ 🔒 **F7** — tela `admin/importar` para o go-live novo de cada filial (só modo *Substituir tudo*, com backup automático + confirmação pelo nome da filial + preview tudo-ou-nada). Revoga a regra "não existe importação" (spec §10.2 emendada). Migrations `0031` (import_logs) e `0032` (RPC transacional).
- ✅ **F6B** — melhorias de UX (execução multi-agente): loading nativo (barra + skeletons), semana default dom–sáb, observação no snapshot (migration `0030`), seção de movimentações de itens no relatório, confirmar/desfazer assinatura de termo, corrigir patrimônio, sessões de 24h, página `/ajuda`. Zero dependência nova.
- ✅ **F6A** — correções pós-go-live (execução multi-agente): carga de go-live filtrada do relatório do período; semântica Total/Estoque dos itens (migration `0027`, novo tipo `retorno`); pendências só para o operador + página `/pendencias` (migration `0028`).

## 15/07/2026 — Go-live

- ✅ 🔒 **F4 — carga inicial única + cutover** — dados reais em produção: **1.596 ativos** e **3.231 movimentações** das 5 filiais, zero falhas do trigger, estado conferido 1.596/1.596 contra a planilha. Scripts em `scripts/import/` (3 layouts, reconciliação compra→replay→ajuste, dry-run, guardas `CARGA_*`), revisão adversarial, ensaio aprovado antes da produção; migration `0026` (filial `serra`). A partir daqui as planilhas antigas são somente-leitura e a entrada do dia a dia é 100% manual. Pendências da janela: carga dos saldos de itens (F6C) e senhas de acesso das filiais.

## 14/07/2026 — Relatório no formato do e-mail + termos

- ✅ **F5A — termos gerados pelo sistema** — os 7 modelos (5 de responsabilidade + 2 de devolução) gerados em `.docx` fiel ao original, com preview do arquivo real no navegador e download; snapshot `jsonb` + arquivo no Storage privado; novo status `gerado`. Migrations `0020`–`0021`. Plano: [`docs/PLANO-TERMOS.md`](docs/PLANO-TERMOS.md).
- ✅ **F3B — relatórios v2** — relatório no formato do e-mail (3 grupos: principais/acessórios/componentes + tabelas de Saídas/Entradas/Transferências); **itens por quantidade** antecipados da F5 (catálogo `admin/itens` + tela `/itens` com saldo/atrelados/falta, trigger de saldo); anotações na linha do tempo; reconstrução as-of; snapshot schema 2. Migrations `0014`–`0018`. Plano: [`docs/PLANO-RELATORIOS-V2.md`](docs/PLANO-RELATORIOS-V2.md).

## 13/07/2026 — Operação e relatórios

- ✅ **F3 — relatórios + administração** — relatório **ao vivo** `/relatorios/[filial]` + consolidado `geral`, KPIs, gráficos Recharts, resumo no formato do e-mail; **snapshot semanal versionado** imutável; **acesso por senha** sem conta (scrypt + cookie HMAC, revogação com efeito no request seguinte); tempo real + auto-refresh; export CSV e impressão; administração (convites, senhas, filiais, motivos). Migrations `0009`–`0011`.
- ✅ **F2 — operação** — lista com filtros/busca server-side + data-table, ficha com linha do tempo, nova movimentação em lote com validações Zod espelhando a máquina de estados, estorno da última movimentação, entrada de equipamento novo por compra (RPC `criar_compra_lote`, migration `0008`), facilitadores anti-Excel (atalho `N`, "repetir última", "duplicar", data default, foco na busca).

## 10/07/2026 — Fundação

- ✅ **F1 — banco + dados fictícios** — migrations `0001`–`0007` (incl. `senhas_acesso`), seed determinístico com guardas anti-produção, tipos gerados, roteiro SQL de teste da máquina de estados.
- ✅ **F0 — fundação** — projeto Next 16.2.10, login por convite restrito a `@wap.ind.br`, layout, sessão via proxy, deploy na Vercel.

---

## Pendências (roadmap)

- 🚧 **F6C — carga dos saldos de itens** ([`docs/prompts/F6C-carga-saldos-itens.md`](docs/prompts/F6C-carga-saldos-itens.md)) — **por último**, quando o Johnny entregar o export da planilha de gestão online (decisão de 16/07/2026: melhorias primeiro, cargas depois). Único item que depende de insumo físico do Johnny.
- 🚧 **F5 — refino** ([`docs/prompts/F5-refino.md`](docs/prompts/F5-refino.md)) — alertas, e-mail, estoque mínimo por item, upload do PDF assinado (item 5.5).
- 🚧 **Banco** — aplicar migrations `0039` (drop dos backups órfãos) e `0040` (hardening das RPCs) em produção (gate; ver `docs/RUNBOOK-BANCO.md`).
