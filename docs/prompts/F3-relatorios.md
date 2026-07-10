# OS-F3 — Relatórios em tempo real + administração

Executor desta ordem no repositório `ti-wap-inventory-control`. Siga na ordem. Ambiguidade → **PARE e pergunte ao Johnny**.

## 0. Antes de qualquer coisa (obrigatório)

1. Leia `CLAUDE.md`, `docs/ESPECIFICACAO.md` §7 (conteúdo dos relatórios — é o contrato desta fase) e §3, `docs/PLANEJAMENTO.md` §2.1, e **abra `mockups/dashboard-relatorio.html` no navegador** — ele é a referência visual aprovada (hierarquia, cores, tom). Consulte a doc atual do componente `chart` do shadcn (Recharts v3) e do Supabase Realtime antes de codar.
2. Pré-requisitos (senão PARE): F2 mergeada; seed carregado; conta de operador disponível; env `VIEW_SESSION_SECRET` definida em `.env.example` (valor real só no `.env.local`/Vercel).

## 1. Objetivo

Os dois modos de relatório da spec §7: a página **ao vivo** `/relatorios/[filial]` sempre atual e o **relatório gerado da semana** — snapshot interativo, congelado e versionado (spec §7.1), com histórico. **Acesso por senha** às rotas de relatório (spec §3): visualizador entra sem conta, com senha gerida pelo admin. Home com KPIs. Telas de administração (usuários/convites `@wap.ind.br`, **senhas de acesso**, filiais, motivos). Dados ainda fictícios — no fim desta fase o Johnny demonstra para 2–3 pessoas que recebem o e-mail hoje, entregando a elas só o link + senha.

## 2. Escopo proibido

- NÃO importador (F4), NÃO acessórios por quantidade (F5), NÃO resumo por e-mail (F5), NÃO dark mode (F5).
- NÃO usar Recharts fora do wrapper `chart` do shadcn; NÃO adicionar lib de gráfico nova.
- NÃO gráfico de dois eixos y; NÃO pizza com mais de 5 fatias (use barras horizontais).

## 3. Tarefas

### 3.1 Camada de dados — `src/lib/queries/relatorios.ts`

Funções tipadas, todas parametrizadas por `filialSlug | 'geral'` e período `{de, ate}`: `getKpis` (total, em_uso, em_estoque, reservado, em_manutencao, em_triagem, defasado), `getEstoquePorCategoria`, `getDisponiveisPorModelo` (status em_estoque, agrupado por marca+modelo, ordenado desc), `getReservadosComChamado` (status reservado + último chamado da linha do tempo), `getEmManutencao` (patrimônio, modelo, observação da última movimentação), `getMovimentacoesPorMes` (saídas × devoluções), `getPorMotivo` (saída e devolução separados), `getPendencias` (via `v_pendencias`), `getUltimasMovimentacoes` (paginada, incluindo a coluna `observacao`), `getResumoPeriodo` (contagens por tipo→motivo→categoria, por filial — insumo do texto 3.3.6) e `getSnapshotRelatorio(filialSlug, de, ate)` — reúne TODAS as anteriores num único objeto JSON serializável (é o que a tarefa 3.8 congela).

### 3.2 Rota e layout — `src/app/(app)/relatorios/[filial]/page.tsx`

1. Tabs de filial no topo (todas as filiais ativas + "Consolidado" = slug `geral`); tab ativa com o sublinhado amarelo do mockup. Filtro de período à direita: presets Esta semana / Últimos 30 dias / Este ano / Tudo + range custom — via searchParams, server-side.
2. Grade igual à do mockup: linha de KPI tiles → chips de pendências → card largo "Movimentações por mês" → 2 colunas ("Ativos por categoria" | "Saídas por motivo") → 2 colunas ("Disponíveis por modelo" | "Em manutenção, caso a caso") → card largo "Últimas movimentações" → card largo "Devoluções por motivo".
3. Acrescente (não está no mockup): card "Reservados" listando patrimônio · modelo · nº do chamado; e o bloco "Resumo do período" (3.3.6).

### 3.3 Conteúdo dos cards

1. **KPIs**: número grande + rótulo + sub-rótulo, como no mockup.
2. **Gráficos** (todos com o `chart` do shadcn): movimentações por mês = barras agrupadas saídas `#eda100` × devoluções `#2a78d6`, rótulo de valor em cima de cada barra (o amarelo exige rótulo visível), legenda com totais; categoria/motivos = barras horizontais de série única com valor à direita. Tooltip padrão do wrapper em todos.
3. **Disponíveis por modelo**: lista `NN× · modelo` (formato do e-mail semanal).
4. **Em manutenção**: lista patrimônio · modelo · observação truncada com tooltip do texto completo.
5. **Últimas movimentações**: tabela com Data, Tipo (pill amarela saída / azul devolução / verde compra), Patrimônio, Ativo, Colaborador/Setor, Filial, Chamado e **Observação** (truncada com tooltip do texto completo; ícone 💬 discreto quando houver); botão "Exportar CSV" (a coluna observação vai no CSV).
6. **Resumo do período**: texto gerado no formato do e-mail atual — "No período de X a Y foram realizadas N saídas: **Matriz** — novo colaborador: 04 notebooks, 04 monitores; …" — a partir de `getResumoPeriodo`. Botão "Copiar texto".
7. Todo card tem estado vazio ("Sem registros no período") e skeleton.

### 3.4 Tempo real

Client component fino que assina INSERTs em `movimentacoes` (Supabase Realtime — habilite a publication via migration `0008_realtime.sql`) e chama `router.refresh()` com debounce de 2s + badge discreto "atualizado agora". Fallback: `refetch` on focus. Página segue 100% funcional sem WebSocket. **Sessões por senha não abrem websocket** (não têm credencial de banco): para elas, revalidação automática a cada 60 s (tarefa 3.9.5).

### 3.5 Export e impressão

1. CSV das últimas movimentações do período: client-side com PapaParse — **delimitador `;`, UTF-8 com BOM** (abre certo no Excel BR), nome `relatorio-{filial}-{aaaa-mm-dd}.csv`.
2. CSS `@media print`: esconder sidebar/tabs/botões, cards em coluna única — "imprimir em PDF" limpo.

### 3.6 Home — `src/app/(app)/page.tsx`

Substituir o placeholder da F0: KPIs consolidados, "minhas pendências" (top 5 de `v_pendencias`), últimas 5 movimentações, atalhos (Nova movimentação p/ admin, Relatórios).

### 3.7 Administração — `src/app/(app)/admin/*` (só admin; guarda na rota E na action)

1. `usuarios`: tabela de profiles (nome, e-mail, criado em) + "Convidar usuário" (dialog: só e-mail — **validação client e server: precisa terminar com `@wap.ind.br`**, com mensagem clara) via Server Action usando a API admin de convite do Supabase (service key, server-side; confirme a chamada na doc atual). Sem papéis: todo convidado é operador (nível único, spec §3).
2. `filiais`: CRUD (nome, slug, ativo). Bloquear desativar filial com ativos (mostrar contagem).
3. `motivos`: tabela com rótulo, código, `aplica_a` (checkboxes de tipos), ativo. Criar/editar/desativar (nunca excluir — histórico referencia).
4. `senhas`: gestão das **senhas de acesso** dos relatórios (tabela `senhas_acesso`, criada na F1). Criar: dialog com rótulo obrigatório ("Filial Linhares", "Stefanini"…) + senha definida à mão ou gerada forte (botão) — **exibida UMA única vez** após salvar, com botão copiar; guarda-se só o hash (**`crypto.scrypt` nativo do Node — proibido adicionar lib de hash**). Listar: rótulo, criada em, último uso, status. Ações: revogar / reativar. NUNCA logar ou armazenar a senha em claro.

### 3.8 Relatório gerado da semana (snapshot interativo — spec §7.1)

1. Migration `0009_relatorios_gerados.sql`: copie a tabela `relatorios_gerados` + índice + RLS do `supabase/schema.sql` (seção "RELATÓRIOS GERADOS"). Regenere os tipos.
2. Server Action `gerarRelatorio({filialSlug, de, ate})` (só admin): chama `getSnapshotRelatorio`, calcula `versao = max(versao)+1` para o mesmo (período, filial), insere e retorna o id. Nenhum update/delete existe — snapshot é imutável.
3. Botão "**Gerar relatório**" no topo da página ao vivo (só admin): dialog com período (padrão: **segunda a sexta da semana corrente**, como os e-mails reais "22/06 até 26/06"), escopo (filial atual ou geral) e confirmação mostrando o resumo do que será congelado. Sucesso → navega para o snapshot novo.
4. `/relatorios/gerados/page.tsx` — histórico: tabela (Período, Filial, Versão, Gerado por, Em, botão Abrir), mais recente primeiro, filtro por filial. Sessão por senha vê e abre; o botão de gerar só aparece (e só funciona) para operador logado.
5. `/relatorios/gerados/[id]/page.tsx` — renderiza o snapshot **reaproveitando os MESMOS componentes de card/gráfico da página ao vivo** (eles devem aceitar dados via props — refatore o necessário; proibido duplicar componente). Diferenças obrigatórias: banner fixo no topo "📄 Relatório gerado · período X–Y · versão N · por Fulano em dd/MM/yyyy HH:mm — dados congelados"; **filtros internos client-side** (filial se geral, categoria, tipo) aplicados sobre o JSON do snapshot, sem ir ao banco; se existir versão mais nova do mesmo período, banner âmbar "Existe a versão N+1 deste relatório" com link; export CSV e impressão funcionam sobre o snapshot; observações das movimentações visíveis como na página ao vivo.
6. Realtime NÃO se aplica aqui (é congelado) — não assine canal nesta rota.

### 3.9 Acesso por senha às rotas de relatório (spec §3 — sem conta)

1. **Página `/relatorios/acesso`** (pública): card no estilo do login com UM campo de senha + botão "Entrar". Erro sempre genérico ("Senha inválida") — nunca dizer se a senha existe/foi revogada. Rate-limit simples em memória por IP (5 tentativas/min → "Aguarde um instante").
2. **Server Action de validação:** compara com `crypto.scrypt` contra as `senhas_acesso` **ativas** (comparação timing-safe), atualiza `ultimo_uso` e emite cookie httpOnly/secure/sameSite=lax **assinado com HMAC** (`VIEW_SESSION_SECRET`) contendo `{senha_id, exp}` — validade 30 dias. Toda a validação roda no servidor com o client administrativo; **nada de anon key para isso**.
3. **Middleware:** rotas `/relatorios/**` aceitam sessão Supabase **OU** cookie de visualização válido; toda outra rota do grupo `(app)` continua exigindo sessão. A cada request de visualização, conferir (server-side) que a senha do cookie continua `ativa` — **revogar mata o acesso no request seguinte**.
4. **Shell de visualização:** quem entra por senha vê só o universo de relatórios (tabs de filial, período, histórico de gerados) — **sem** sidebar de operação, sem links para ativos/movimentações/admin, com botão "Sair" (apaga o cookie). As queries dessas páginas rodam no servidor com o client administrativo; jamais expor esse client ao browser.
5. **Atualização automática:** para sessões por senha, componente que faz `router.refresh()` a cada 60 s + botão manual de atualizar (substitui o realtime, tarefa 3.4).

### 3.10 Sanidade de segurança do acesso por senha (checklist interno antes de entregar)

- Cookie sem assinatura válida, expirado ou de senha revogada → redirect para `/relatorios/acesso`.
- Com cookie de visualização: `/ativos`, `/movimentacoes/nova`, `/admin/*` e TODAS as Server Actions de escrita retornam bloqueio (rota e action).
- O hash nunca sai do servidor (nenhuma query de `senhas_acesso` em Client Component).
- `VIEW_SESSION_SECRET` só em env; não commitada.

## 4. Critérios de aceite

- [ ] `/relatorios/matriz` reproduz a estrutura do mockup com os dados do seed; tabs trocam filial; `geral` consolida.
- [ ] Filtro de período muda gráficos, listas, resumo e export (conferir 1 número à mão no SQL editor).
- [ ] Duas janelas abertas: registrar movimentação numa → relatório da outra atualiza em ≤ 5s sem F5.
- [ ] Resumo do período bate com o estilo do e-mail (Johnny compara com um PDF real) e o "Copiar texto" funciona.
- [ ] CSV abre no Excel BR com acentos e colunas certas.
- [ ] Impressão (Ctrl+P) sai limpa em 1–3 páginas.
- [ ] Convite `@wap.ind.br` chega e a pessoa entra como operador; convite fora do domínio é recusado com mensagem clara.
- [ ] Criar senha de acesso com rótulo → ela abre `/relatorios/*` sem conta; com o cookie de senha, `/ativos` e `/admin/*` seguem bloqueados.
- [ ] Revogar a senha em `admin/senhas` → o acesso morre no request seguinte (F5 na página → volta para a tela de senha).
- [ ] Sessão por senha vê o shell reduzido (sem sidebar de operação) e a página se atualiza sozinha em ~60 s após uma movimentação nova.
- [ ] Gerar relatório da semana (seg–sex) → abre o snapshot; registrar movimentação nova → página ao vivo muda, **snapshot não muda**.
- [ ] Regerar o mesmo período → versão 2; a versão 1 mostra o banner "existe versão mais recente" com link.
- [ ] Sessão por senha abre o histórico e o snapshot, mas não vê "Gerar relatório" (e a action exige sessão de operador).
- [ ] Filtros internos do snapshot funcionam offline do banco (desligar rede após carregar e filtrar mesmo assim).
- [ ] Observações aparecem nas últimas movimentações (ao vivo e no snapshot) com tooltip do texto completo.
- [ ] Mobile 375px: KPIs empilham, tabela vira scroll horizontal, gráficos legíveis.
- [ ] `lint` + `build` limpos.

## 5. Entrega

Branch `f3-relatorios`. Resumo final: checklist marcado, screenshot (ou descrição) do relatório da Matriz, diferenças conscientes em relação ao mockup (com motivo), pendências/perguntas. Lembrete ao Johnny no resumo: **agendar a demo com 2–3 destinatários do e-mail antes de abrir a F4.**
