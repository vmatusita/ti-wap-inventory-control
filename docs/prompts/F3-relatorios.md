# OS-F3 — Relatórios em tempo real + administração

Executor desta ordem no repositório `ti-wap-inventory-control`. Siga na ordem. Ambiguidade → **PARE e pergunte ao Johnny**.

## 0. Antes de qualquer coisa (obrigatório)

1. Leia `CLAUDE.md`, `docs/ESPECIFICACAO.md` §7 (conteúdo dos relatórios — é o contrato desta fase) e §3, `docs/PLANEJAMENTO.md` §2.1, e **abra `mockups/dashboard-relatorio.html` no navegador** — ele é a referência visual aprovada (hierarquia, cores, tom). Consulte a doc atual do componente `chart` do shadcn (Recharts v3) e do Supabase Realtime antes de codar.
2. Pré-requisitos (senão PARE): F2 mergeada; seed carregado; contas admin e viewer disponíveis.

## 1. Objetivo

O link que substitui o e-mail semanal: `/relatorios/[filial]` sempre atual, com todas as seções da spec §7, atualizando sozinho quando entra movimentação, com export. Home com KPIs. Telas de administração (usuários/convites, filiais, motivos). Dados ainda fictícios — no fim desta fase o Johnny demonstra para 2–3 pessoas que recebem o e-mail hoje.

## 2. Escopo proibido

- NÃO importador (F4), NÃO acessórios por quantidade (F5), NÃO resumo por e-mail (F5), NÃO dark mode (F5).
- NÃO usar Recharts fora do wrapper `chart` do shadcn; NÃO adicionar lib de gráfico nova.
- NÃO gráfico de dois eixos y; NÃO pizza com mais de 5 fatias (use barras horizontais).

## 3. Tarefas

### 3.1 Camada de dados — `src/lib/queries/relatorios.ts`

Funções tipadas, todas parametrizadas por `filialSlug | 'geral'` e período `{de, ate}`: `getKpis` (total, em_uso, em_estoque, reservado, em_manutencao, em_triagem, defasado), `getEstoquePorCategoria`, `getDisponiveisPorModelo` (status em_estoque, agrupado por marca+modelo, ordenado desc), `getReservadosComChamado` (status reservado + último chamado da linha do tempo), `getEmManutencao` (patrimônio, modelo, observação da última movimentação), `getMovimentacoesPorMes` (saídas × devoluções), `getPorMotivo` (saída e devolução separados), `getPendencias` (via `v_pendencias`), `getUltimasMovimentacoes` (paginada), `getResumoPeriodo` (contagens por tipo→motivo→categoria, por filial — insumo do texto 3.3.6).

### 3.2 Rota e layout — `src/app/(app)/relatorios/[filial]/page.tsx`

1. Tabs de filial no topo (todas as filiais ativas + "Consolidado" = slug `geral`); tab ativa com o sublinhado amarelo do mockup. Filtro de período à direita: presets Esta semana / Últimos 30 dias / Este ano / Tudo + range custom — via searchParams, server-side.
2. Grade igual à do mockup: linha de KPI tiles → chips de pendências → card largo "Movimentações por mês" → 2 colunas ("Ativos por categoria" | "Saídas por motivo") → 2 colunas ("Disponíveis por modelo" | "Em manutenção, caso a caso") → card largo "Últimas movimentações" → card largo "Devoluções por motivo".
3. Acrescente (não está no mockup): card "Reservados" listando patrimônio · modelo · nº do chamado; e o bloco "Resumo do período" (3.3.6).

### 3.3 Conteúdo dos cards

1. **KPIs**: número grande + rótulo + sub-rótulo, como no mockup.
2. **Gráficos** (todos com o `chart` do shadcn): movimentações por mês = barras agrupadas saídas `#eda100` × devoluções `#2a78d6`, rótulo de valor em cima de cada barra (o amarelo exige rótulo visível), legenda com totais; categoria/motivos = barras horizontais de série única com valor à direita. Tooltip padrão do wrapper em todos.
3. **Disponíveis por modelo**: lista `NN× · modelo` (formato do e-mail semanal).
4. **Em manutenção**: lista patrimônio · modelo · observação truncada com tooltip do texto completo.
5. **Últimas movimentações**: tabela com Data, Tipo (pill amarela saída / azul devolução / verde compra), Patrimônio, Ativo, Colaborador/Setor, Filial, Chamado; botão "Exportar CSV".
6. **Resumo do período**: texto gerado no formato do e-mail atual — "No período de X a Y foram realizadas N saídas: **Matriz** — novo colaborador: 04 notebooks, 04 monitores; …" — a partir de `getResumoPeriodo`. Botão "Copiar texto".
7. Todo card tem estado vazio ("Sem registros no período") e skeleton.

### 3.4 Tempo real

Client component fino que assina INSERTs em `movimentacoes` (Supabase Realtime — habilite a publication via migration `0008_realtime.sql`) e chama `router.refresh()` com debounce de 2s + badge discreto "atualizado agora". Fallback: `refetch` on focus. Página segue 100% funcional sem WebSocket.

### 3.5 Export e impressão

1. CSV das últimas movimentações do período: client-side com PapaParse — **delimitador `;`, UTF-8 com BOM** (abre certo no Excel BR), nome `relatorio-{filial}-{aaaa-mm-dd}.csv`.
2. CSS `@media print`: esconder sidebar/tabs/botões, cards em coluna única — "imprimir em PDF" limpo.

### 3.6 Home — `src/app/(app)/page.tsx`

Substituir o placeholder da F0: KPIs consolidados, "minhas pendências" (top 5 de `v_pendencias`), últimas 5 movimentações, atalhos (Nova movimentação p/ admin, Relatórios).

### 3.7 Administração — `src/app/(app)/admin/*` (só admin; guarda na rota E na action)

1. `usuarios`: tabela de profiles (nome, e-mail, papel, criado em) + "Convidar usuário" (dialog: e-mail + papel) via Server Action usando a API admin de convite do Supabase (service key, server-side; confirme a chamada na doc atual) + trocar papel (confirmação ao promover a admin).
2. `filiais`: CRUD (nome, slug, ativo). Bloquear desativar filial com ativos (mostrar contagem).
3. `motivos`: tabela com rótulo, código, `aplica_a` (checkboxes de tipos), ativo. Criar/editar/desativar (nunca excluir — histórico referencia).

## 4. Critérios de aceite

- [ ] `/relatorios/matriz` reproduz a estrutura do mockup com os dados do seed; tabs trocam filial; `geral` consolida.
- [ ] Filtro de período muda gráficos, listas, resumo e export (conferir 1 número à mão no SQL editor).
- [ ] Duas janelas abertas: registrar movimentação numa → relatório da outra atualiza em ≤ 5s sem F5.
- [ ] Resumo do período bate com o estilo do e-mail (Johnny compara com um PDF real) e o "Copiar texto" funciona.
- [ ] CSV abre no Excel BR com acentos e colunas certas.
- [ ] Impressão (Ctrl+P) sai limpa em 1–3 páginas.
- [ ] Convite enviado pela tela de admin chega e a pessoa entra como viewer; viewer não acessa `/admin/*` (rota e action).
- [ ] Mobile 375px: KPIs empilham, tabela vira scroll horizontal, gráficos legíveis.
- [ ] `lint` + `build` limpos.

## 5. Entrega

Branch `f3-relatorios`. Resumo final: checklist marcado, screenshot (ou descrição) do relatório da Matriz, diferenças conscientes em relação ao mockup (com motivo), pendências/perguntas. Lembrete ao Johnny no resumo: **agendar a demo com 2–3 destinatários do e-mail antes de abrir a F4.**
