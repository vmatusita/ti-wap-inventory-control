# OS-F3B — Relatórios v2: formato do e-mail + itens por quantidade

Executor desta ordem no repositório `ti-wap-inventory-control`. Siga na ordem. **Modo autônomo (CLAUDE.md): não peça autorização** — decida, registre em `docs/DECISOES.md` e siga.

## 0. Antes de qualquer coisa (obrigatório)

1. Leia `CLAUDE.md`, **`docs/PLANO-RELATORIOS-V2.md` (é o contrato desta ordem — decisões do Johnny de 14/07/2026, todas fechadas)**, `docs/RELATORIO-V2-PARA-APROVACAO.md` (a promessa aprovada pelo analista — o relatório final tem que cumprir o que esse papel mostra), spec §4/§5/§7/§8 e as entradas da F3 em `docs/DECISOES.md` (padrões já estabelecidos: RPCs de agregação da migration 0011, compat de snapshot no `CorpoRelatorio`, fuso `America/Sao_Paulo` em `src/lib/format.ts`, revelação progressiva de colunas no mobile).
2. Consulte a doc atual (Context7/MCP) antes de codar: componente `chart` do shadcn (Recharts v3 — barras empilhadas horizontais, barras divergentes com valores negativos, `LabelList`), Supabase (RPC, Realtime publication, RLS).
3. Pré-requisitos (falhou → pare e reporte): F3 na `main` (`/relatorios/[filial]`, `/relatorios/gerados` funcionando); migrations 0001–0013 aplicadas (confira a última — as novas começam na próxima livre, indicada abaixo como 0014+); seed do dev populado; `npm run lint` e `npm run build` limpos ANTES de começar (linha de base).
4. Migrations desta ordem são **aditivas** (nenhuma altera/apaga dado). Aplique no dev primeiro, produção depois de `lint`+`build` limpos. Não reedite migration aplicada.

## 1. Objetivo

Reestruturar o relatório no **formato do e-mail semanal** (plano §4): três grupos — **equipamentos principais**, **acessórios e periféricos**, **componentes** — cada um com movimentação do período, estoque do último dia e situação com observações; ao final, as **tabelas detalhadas de Saídas e Entradas**. Para isso, nasce o controle de **itens por quantidade** (catálogo + lançamentos, antecipado da F5), as **anotações** na linha do tempo do ativo e a reconstrução **as-of** do estoque. Sem export CSV nos relatórios (decisão do plano §3.9). Ao fim, o relatório cobre 100% do e-mail — dados ainda fictícios; a demo pré-F4 já é neste formato.

## 2. Escopo proibido

- NÃO alterar a máquina de estados dos ativos (spec §4) nem os 13 tipos de movimentação — itens por quantidade são um mundo paralelo, sem patrimônio e sem estado.
- NÃO criar tela de importação; a carga dos saldos iniciais é da F4 (script, planilha de gestão online — plano §3.11). Aqui só existe o modelo + lançamento manual.
- NÃO adicionar dependência (stack fechada). Recharts só via wrapper `chart` do shadcn.
- NÃO deixar export CSV em NENHUMA rota de relatório — **remova o da F3** (tarefa 3.9). O backup CSV administrativo e o PapaParse (scripts F4) ficam.
- NÃO mexer no acesso por senha, cookies, RLS de `senhas_acesso` nem no modelo operador/visualizador (padrões F3 intocados).
- NÃO fazer: kits de lote salvos, alertas por e-mail, HTML autocontido, dark mode, integração checklist-devolução ↔ quantidade, estoque mínimo por item — tudo F5 (plano §10).
- NÃO usar dado real em seed/catálogo/teste — itens do catálogo são nomes genéricos de produto; colaboradores/chamados/patrimônios sempre fictícios.

## 3. Tarefas

Execute em **dois blocos de commit** (plano §9): B1 = banco + operação (3.1–3.5) · B2 = relatório v2 (3.6–3.11). `lint`+`build` limpos ao fim de cada bloco.

### B1 · 3.1 Migrations (numeração a partir da próxima livre; nomes indicativos)

1. `0014_itens.sql` — tabela `itens`: `id`, `nome` (único, case-insensitive), `grupo` enum (`acessorio` | `componente`), `ativo` boolean default true, `ordem` int. RLS padrão do projeto (`authenticated` tudo; `anon` nada).
2. `0015_lancamentos_item.sql` — tabela `lancamentos_item`: `id`, `item_id` FK, `filial_id` FK, `tipo` enum (`entrada` | `saida` | `reserva` | `liberacao` | `ajuste`), `quantidade` int, `chamado` text, `colaborador` text, `data` date, `observacao` text, `criado_por` FK profiles, `created_at`, `estorna_id` FK auto-referente (nulável). Constraints/tigger (a regra crítica vive no Postgres — CLAUDE.md):
   - `quantidade > 0` para todos os tipos, EXCETO `ajuste`, que aceita sinal livre (`<> 0`) e **exige `observacao`** (mesma doutrina do ajuste de ativos, spec §8).
   - `chamado` obrigatório em `reserva` e `liberacao`.
   - Trigger BEFORE INSERT: rejeitar lançamento que deixe **saldo** (Σ entradas − Σ saídas ± ajustes) ou **atrelados** negativos para o par item×filial. Imutável: sem UPDATE/DELETE (correção = lançamento inverso com `estorna_id`).
   - Comentário SQL documentando a semântica: `atrelados = Σ reserva − Σ liberacao − Σ saida com chamado que tenha reserva aberta (mesmo item×filial×chamado)`; `falta = max(0, atrelados − saldo)`.
3. `0016_rpcs_relatorio_v2.sql` — funções `SECURITY INVOKER` (padrão da 0011, grant `authenticated` + `service_role`):
   - `rel_saldo_itens(p_filial, p_ate date)` → item, grupo, saldo, atrelados, falta **as-of** (Σ até a data).
   - `rel_mov_itens(p_filial, p_de, p_ate)` → entradas e saídas por item no período.
   - `rel_estoque_asof(p_filial, p_data date)` → estado de cada ativo na data = resultado da última movimentação **efetiva** ≤ data (par movimentação+estorno se anula — mesma semântica do trigger).
4. `0017_anotacoes.sql` — tabela `anotacoes`: `id`, `ativo_id` FK, `texto` (1–2000), `criado_por`, `created_at`. Imutável, RLS padrão.
5. `0018_realtime_v2.sql` — publication do Realtime ganha `lancamentos_item` e `anotacoes`.
6. `npm run db:types` — tipos regenerados.

### B1 · 3.2 Seed fictício estendido — `scripts/seed.ts`

Guardas anti-produção intocadas; determinístico (seedrandom); `db:reset` limpa as tabelas novas. Adicionar: catálogo ~25 itens (acessórios: fone, mochila, teclado, mouse, **kit teclado+mouse**, mousepad, hub USB-C, adaptador USB-C, carregador Type-C, carregador micro-USB…; componentes: SSD e **memórias separadas por DDR e tamanho** — notebook DDR4 4/8/16GB, DDR5 8/16GB, desktop DDR3/DDR4 — decisão do plano §3.8); algumas centenas de lançamentos em 7 meses com sazonalidade; reservas com chamados fictícios, **incluindo pelo menos um item com falta** (atrelados > saldo) e um com saldo zerado; 2–4 anotações em ativos `em_manutencao` com datas espaçadas (narrativa evolutiva fictícia).

### B1 · 3.3 Itens: saldos + lançamento — `src/app/(app)/itens/page.tsx`

1. Tabela de saldos por item×filial: filtros (filial, grupo, busca), colunas item · grupo · saldo · atrelados · **falta** (badge vermelho "faltam N"). Números com `tabular-nums`.
2. Botão "**Lançar**" → dialog enxuto (meta ≤15 s): item (combobox com busca) → filial → tipo → quantidade → chamado (obrigatório se reserva/liberação) → colaborador (opcional) → data (default hoje) → obs (obrigatória se ajuste). **"Repetir último"** pré-preenche tudo menos a quantidade. Atalho de teclado para abrir o dialog (registre a tecla escolhida em DECISOES — `N` já é da movimentação de ativos).
3. Histórico de lançamentos (tabela paginada, mais recente primeiro) com ação "**Estornar**" → confirma e cria o lançamento inverso com `estorna_id` (nada se apaga); linha estornada/estorno sinalizadas.
4. Escritas via Server Actions com Zod (validators compartilhados em `src/lib/validators/`), leituras em `src/lib/queries/itens.ts`. Sidebar do operador ganha "Itens" (entre Movimentações e Relatórios). Visualizador por senha NÃO vê esta rota.

### B1 · 3.4 Admin do catálogo — `src/app/(app)/admin/itens/page.tsx`

CRUD no padrão de `admin/motivos`: nome, grupo, ordem, ativo. Desativar, nunca excluir item com lançamentos (histórico referencia — mostre a contagem).

### B1 · 3.5 Anotações na ficha do ativo — `src/app/(app)/ativos/[id]`

Botão "**Anotar**" (dialog com textarea) via Server Action + Zod. A linha do tempo intercala anotações entre as movimentações, em estilo visualmente distinto (nota, sem seta de transição de estado), com autor e data/hora (fuso `America/Sao_Paulo` — use `src/lib/format.ts`).

### B2 · 3.6 Camada de dados v2 — `src/lib/queries/relatorios.ts`

1. **As-of com fast path** (plano §7): período terminando hoje → estado derivado atual (caminho barato, o de hoje); período com fim no passado → `rel_estoque_asof` / `rel_saldo_itens` com `p_ate` = fim do período. Vale para TODAS as listas de estado (disponíveis, reservados, manutenção, saldos).
2. **KPIs com Δ**: calcular também o período anterior de mesma duração e devolver a diferença por KPI.
3. **Manutenção enriquecida**: por ativo — patrimônio, modelo, filial, chamado, data de envio, **dias em manutenção**, obs do envio, anotações do período (autor+data) e retorno (se houve no período); incluir também os que **voltaram** de manutenção dentro do período.
4. **Grupos 2–3**: saldos as-of (item, grupo, saldo, atrelados, falta, última obs relevante do período), movimentação por item (entradas × saídas), **carimbo de frescor** = data do último lançamento do grupo na filial.
5. **Tabelas finais**: saídas (`saida` + `emprestimo`), entradas (`devolucao` + `compra`), transferências — todas as colunas do plano §4.4, paginadas com desempate por `id` (padrão F3).
6. `getSnapshotRelatorio` passa a montar o objeto **schema 2** com tudo acima (serializável, congelável).

### B2 · 3.7 Página v2 — `/relatorios/[filial]` (e `geral`)

Nova ordem de seções (esqueleto do plano §4 — substitui a grade F3):

1. Cabeçalho: tabs de filial + filtro de período (mantidos) + **chips-âncora** fixos no topo ao rolar: Principais · Acessórios · Componentes · Saídas · Entradas.
2. KPIs gerais (tiles F3 + **Δ vs período anterior**, setinha ▲▼ com cor) + série do período (mantida, granularidade adaptativa dia/semana/mês).
3. **Grupo Equipamentos principais**: KPIs do grupo (guardados · reservados · em manutenção · emprestados, com Δ) → estoque no último dia por categoria×status (barras horizontais **empilhadas**, rótulo numérico por segmento + total na ponta) → disponíveis por modelo (bar list agrupada por categoria, barra proporcional + número à direita) → reservados com chamado (mantém F3) → **manutenção caso a caso** (um card por ativo: patrimônio, modelo, chamado, badge "há N dias", mini-linha do tempo: obs do envio → anotações → retorno) → saídas e entradas por motivo (barras horizontais ordenadas com rótulo).
4. **Grupo Acessórios e periféricos**: tabela item · **saldo** · atrelados · **Δ período** (verde/vermelho) · **falta** (chip vermelho "faltam N") · obs; gráfico de **barras divergentes** da movimentação por item (entradas → direita `#2a78d6`, saídas → esquerda `#eda100`, rótulo em valor absoluto; só itens com movimento); rodapé com carimbo "último lançamento em dd/MM".
5. **Grupo Componentes**: idem, filtrando `grupo = componente`; coluna atrelados só aparece se houver valor.
6. Pendências (mantém F3).
7. **Saídas do período** — título com contagem ("Saídas — N no período"), resumo por filial×motivo acima (gerador da F3), tabela com colunas exatas: Data · Filial · Categoria · Marca/Modelo · Patrimônio · Tipo · Motivo · Chamado · Colaborador/Setor · Termo · Obs; filtros internos (categoria, motivo, filial no consolidado).
8. **Entradas do período** — idem: Data · Filial · Categoria · Marca/Modelo · Patrimônio · Tipo (Devolução/Compra) · Motivo · Colaborador · Setor · Itens faltantes · Obs.
9. **Transferências** — bloco condicional (só se houver no período): Data · De → Para · Categoria · Marca/Modelo · Patrimônio · Chamado · Obs.
10. Resumo no formato do e-mail com "Copiar texto" (mantém) + botão Imprimir.

Mobile: seções recolhíveis (grupos fechados por padrão em <768px, exceto o primeiro), 375px sem scroll lateral (padrões F3). Impressão: `@media print` com **quebra de página por grupo**, tudo expandido, chips/botões ocultos.

### B2 · 3.8 Regras de gráfico (plano §5 — aplicar em todos)

Rótulo de valor **sempre visível** (tooltip é complemento), `tabular-nums`, paleta amarelo WAP `#eda100` = saídas / azul `#2a78d6` = entradas / neutros para status. Proibido: pizza/donut comparativa, 3D/gradiente, valor só no tooltip, eixo truncado. Tudo via wrapper `chart` do shadcn.

### B2 · 3.9 Remover export CSV dos relatórios (decisão do plano §3.9)

Remover botão e código de export CSV da página ao vivo, do snapshot e de qualquer rota `/relatorios/**` (inclusive o código morto). Ficam: impressão limpa e "copiar texto". NÃO tocar no backup CSV administrativo nem remover o PapaParse do projeto (é da carga F4).

### B2 · 3.10 Snapshot v2

1. `gerarRelatorio` grava o objeto novo com `schema: 2`. Regerar período retroativo usa o caminho as-of (3.6.1) — números fiéis ao período, não ao presente.
2. `CorpoRelatorio` renderiza **v1 e v2**: snapshots antigos continuam abrindo (normalização, padrão já existente na F3). Banner de versão/errata inalterado.
3. O carimbo de frescor dos grupos 2–3 congela junto no snapshot.
4. Realtime do operador passa a assinar também `lancamentos_item` (e `anotacoes`); auto-refresh de 60 s do visualizador inalterado. Nenhuma subscription na rota de snapshot (congelado).

### B2 · 3.11 Documentação (fecha a ordem)

1. `docs/ESPECIFICACAO.md`: reescrever §7 com a estrutura v2 (sem export CSV); atualizar §2 (não-objetivos: quantidade sai da F5) e §11 (linha F3B; F5 sem "acessórios por quantidade"); nova subseção do modelo de itens no §5. Pergunta 6 da §13 permanece como está (quantidade ≠ ativo com patrimônio).
2. `docs/PLANEJAMENTO.md`: fase F3B no §4 (entrega + pronto quando); F5 ajustada.
3. `CLAUDE.md`: estrutura de pastas prescrita ganha `itens/page.tsx`, `admin/itens/page.tsx`, `lib/queries/itens.ts`.
4. `docs/prompts/F4-importador-golive.md`: adicionar a tarefa de **carga dos saldos iniciais de itens** a partir do export da planilha de gestão online (4ª fonte da carga única; dry-run + conferência de contagens; plano B manual — plano §3.11).
5. `README.md`: status F3B + próximo passo; `docs/DECISOES.md`: entrada da fase com as decisões tomadas.
6. `docs/PLANO-RELATORIOS-V2.md` e `docs/RELATORIO-V2-PARA-APROVACAO.md` ficam **intocados** (histórico da decisão).

### B2 · 3.12 Verificação final

Estender o roteiro SQL de testes (`supabase/tests/`) com: saldo bloqueando negativo; reserva → atrelados; saída com chamado consumindo reserva; liberação; falta = max(0, atrelados − saldo); as-of com estorno no meio do período; ajuste sem obs rejeitado. Rodar `lint` + `build`, conferir mobile 375px (sem overflow) e autoverificar o checklist do §4 item a item.

## 4. Critérios de aceite

- [ ] `/relatorios/matriz` abre com a estrutura v2: chips-âncora, KPIs com Δ, 3 grupos, pendências, tabelas de Saídas/Entradas, resumo; `geral` consolida; tabs e período funcionam como antes.
- [ ] "Disponíveis por modelo" e estoque por categoria×status batem com o seed (conferência SQL de pelo menos 2 números).
- [ ] Snapshot de período retroativo usa as-of: gerar snapshot de um período passado → registrar movimentação nova → regerar → os números do período não mudam por causa da movimentação posterior.
- [ ] Reserva de item com chamado aparece em atrelados; item do seed com atrelados > saldo mostra o chip "faltam N" sem intervenção manual.
- [ ] Saída lançada com o mesmo chamado consome a reserva (atrelados caem); liberação idem.
- [ ] Lançamento de quantidade em ≤15 s com "repetir último"; tentativa de saldo negativo é bloqueada com erro amigável; ajuste sem observação é rejeitado.
- [ ] Estornar lançamento cria o inverso vinculado (nada some do histórico).
- [ ] Anotação criada na ficha aparece na linha do tempo (estilo distinto) e na seção de manutenção do relatório; "há N dias" correto.
- [ ] Tabelas de Saídas e Entradas com TODAS as colunas do §3.7 (7–8), filtros internos e contagem no título; transferências só aparecem quando houver.
- [ ] **Nenhum botão/rota de export CSV em `/relatorios/**`**; impressão limpa com quebra por grupo; "copiar texto" do resumo funciona.
- [ ] Snapshot v2 congela os 3 grupos (lançar item depois → snapshot não muda); snapshot v1 antigo continua abrindo.
- [ ] Realtime do operador reage a lançamento de item (≤5 s); sessão por senha segue com auto-refresh e SEM acesso a `/itens` e `/admin/*`.
- [ ] RLS: anon sem sessão não lê `itens`/`lancamentos_item`/`anotacoes` (teste manual como na F1).
- [ ] Mobile 375px sem scroll lateral; grupos recolhíveis.
- [ ] Docs do 3.11 atualizados; `lint` + `build` limpos; tipos regenerados.

## 5. Entrega

Direto na `main` ou branch `f3b-relatorios-v2` com merge por sua conta. **Dois blocos de commit** (ex.: `feat(f3b): itens por quantidade, anotações e migrations` · `feat(f3b): relatório v2 no formato do e-mail`). Deploy conferido na Vercel. Resumo final: checklist do §4 autoverificado item a item, decisões registradas em `docs/DECISOES.md`, pendências/backlog (o que surgir de fora do escopo), e a recomendação: **demo com 2–3 destinatários do e-mail já neste formato v2** (link + senha) antes de abrir a F4.
