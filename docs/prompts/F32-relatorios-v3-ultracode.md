ultracode

# Missão

Executar **inteira** a análise de design dos relatórios de 10/08/2026 (`docs/ANALISE-RELATORIOS-2026-08-10.md`): os **24 achados RV-01..RV-24**, todos aprovados pelo Johnny — a unificação da cor de status, os polimentos de leitura, a interatividade nova e as três funções novas (evolução do estoque, medidor estoque×mínimo, resumo de transferências). Ao final: `npm run lint`, `npm run test`, `npm run build` e `npm run contraste` limpos, documentação e ajuda atualizadas e **main pushada** (a Vercel deploya sozinha). Esta é a ordem de serviço **F32**.

# Contexto

- Projeto **Estoque TI WAP** (Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui · Recharts v3 via componente `chart` · Supabase). Regras permanentes de `@CLAUDE.md` valem inteiras: modo autônomo, stack fechada, UI/commits pt-BR, NUNCA dados reais em fixture/teste/screenshot/evidência, custo R$ 0.
- **Fonte normativa:** `@docs/ANALISE-RELATORIOS-2026-08-10.md` — cada RV-xx está especificado no §2 dela (com arquivo:linha) e as medições de cor no §4. **Referência visual do "depois":** `mockups/relatorio-v3-proposta.html` (protótipo navegável, dados fictícios) — é referência de intenção, não pixel-perfect. Arquivo:linha foram verificados em 10/08; se uma linha se moveu, vale a **intenção**, ancore pelo trecho.
- Comandos: `npm run lint` · `npm run test` (Vitest, funções puras) · `npm run build` · `npm run contraste` (`scripts/contraste.mjs`, já no CI). Testes da ajuda (F20) travam frases literais — comportamento visível que mudar aqui atualiza a página correspondente em `src/lib/ajuda/conteudo/` (`relatorio-ao-vivo`, `relatorios-gerados`); rota nova sem ajuda quebra o build de propósito.
- Precedentes do repo que esta ordem REUSA (não reinvente): interatividade gateada por cargo/superfície via prop `links` (`kpi-links.ts` + `corpo-relatorio-v2.tsx` — só operador + só ao vivo; snapshot e viewer nunca recebem); teste de confinamento do visualizador (`confinamento-viewer.test.ts`, F29) que varre os href dos componentes de relatório; réguas de rótulo de gráfico (`lib/relatorios/rotulo-grafico.ts` — `deveRotularSegmento`, `fillRotuloSegmento`, `mostrarRotulosDaSerie`); campos OPCIONAIS no snapshot v2 mantendo `schema: 2` (precedentes `movimentacoesItens?`, `emprestado?` em `lib/relatorios/tipos.ts`); memória leve por `sessionStorage` com validação na leitura (`lib/ativos/ativos-recentes.ts`, F29); reconstrução as-of por RPC `rel_estoque_asof` (chamada hoje em `queries/relatorios/estoque.ts`; a consolidada mede ~233 ms — comentário em `app/(app)/relatorios/[filial]/page.tsx`); pares de contraste medidos em `scripts/contraste.mjs`; filtros de tabela serializados na URL com prefixo por tabela (`use-filtros-tabela.ts`, `sd.*`/`en.*`/`tr.*`/`mi.*`).
- A numeração da paleta é a do §2/RV-02 da análise (hex exatos, já validados por simulação de daltonismo): `em_estoque #16a34a` (mantém) · `reservado #6d28d9` · `em_uso #2a78d6` (mantém) · `emprestado #06b6d4` · `em_triagem #db2777` · `em_manutencao #d97706` (mantém) · `defasado #9ca3af` (mantém, neutro de de-ênfase). O badge de `em_triagem` em `STATUS_META` acompanha o matiz (`bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300`).

# Escopo — 4 frentes, na ordem

## Frente A — a cor vira língua (RV-02 → RV-03 → RV-01 → RV-07 → RV-21)

Fundação de todo o resto; execute primeiro e isolada.

- **RV-02** Troque os 3 hex em `STATUS_CHART_COLOR` e o badge de `em_triagem` em `STATUS_META` conforme o Contexto. Registre os pares novos de badge em `scripts/contraste.mjs` (claro e escuro) — nenhum par `exigir: true` pode reprovar. Ata em `docs/DECISOES.md`: a troca de matiz da triagem muda vocabulário visual (badge + gráfico juntos, nas listas e no relatório).
- **RV-03** Gap de 2px na cor da superfície entre marcas coladas: `stroke="var(--card)" strokeWidth={2}` nos `<Bar>` empilhados (`barras-empilhadas.tsx`) e nos pares de `grafico-mov-serie.tsx` e `barras-divergentes.tsx`.
- **RV-01** A mesma cor de status em toda superfície: (a) KPI tiles e tiles do grupo ganham **acento discreto** — barra de 3px no topo do tile na cor do status (`STATUS_CHART_COLOR`); "Total de ativos" fica sem acento; (b) verbetes de status do glossário (`legendas.tsx`/`legendas.ts` — eles já carregam `status?`) ganham swatch de 10px antes do termo; (c) nada de fundo saturado em bloco grande — acento é acento.
- **RV-07** Card "Acervo por situação": UMA barra 100% empilhada com o total geral, entre os KPI tiles e o restante, derivada de dados que a página já tem (`estoqueCatStatus` agregado ou `kpis`), mesmas cores, rótulo nos segmentos que couberem (régua `deveRotularSegmento`), total na ponta, tooltip. Vale no ao vivo e no snapshot v2 (é render de dados existentes — nenhum campo novo).
- **RV-21** Defina `--chart-1..5` em `globals.css` como a escala categórica da casa (azul da marca, amarelo da marca, `#16a34a`, `#6d28d9`, `#db2777`) e registre em `docs/ARQUITETURA.md` que gráfico novo usa token, não hex avulso.

## Frente B — leitura de relance (RV-04, RV-05, RV-08, RV-10, RV-19, RV-20, RV-22, RV-23)

- **RV-04** `CardRelatorio` ganha prop `janela?: 'foto' | 'periodo'` que renderiza chip padronizado de 11px junto ao subtítulo — cinza "foto de dd/MM" (estado as-of, data = fim do período) e azul-claro "dd/MM – dd/MM" (fluxo). Aplique nos cards do corpo v2 conforme a natureza de cada um (empilhadas/disponíveis/reservados/manutenção/saldo por item = foto; série/motivos/movimentação por item = período). Verbete novo no glossário ("foto × período"). Sem `janela`, o card fica exatamente como era (dashboard e v1 não mudam).
- **RV-05** Série diária (`grafico-mov-serie.tsx`), só quando granularidade = dia: ticks de sábado/domingo atenuados; o balde de HOJE (quando `ate` ≥ hoje, só no ao vivo) com barras atenuadas (~55% de opacidade) + nota curta na legenda ("hoje, parcial"). Dado e contagens intactos; a decisão de "é fds/é hoje" vira função pura testada.
- **RV-08** `barras-horizontais.tsx` ganha prop `comPercentual`: rótulo da ponta vira "219 · 52%" (% do total da própria lista, fragmento do % em `text-muted-foreground`; tooltip repete). Ligue nos dois cards de motivo. Percentual por função pura testada (soma zero → sem %).
- **RV-10** Divergentes: largura do eixo Y responsiva (110 → ~150 no desktop, como as horizontais) e nome completo do item legível via tooltip (confira que o header do tooltip usa o valor não truncado).
- **RV-19** (a) Ícone lucide discreto (16px, `text-muted-foreground`) antes do título dos 3 GRUPOS (`GrupoColapsavel`): Package/Headphones/MemoryStick ou equivalentes já usados no app — só nos grupos, não nas tabelas. (b) Subtítulo do card de manutenção vira resumo de risco: "N casos · X em alerta (30+ dias) · Y encerrados no período" — derive de `manutencaoEmAlerta`/`fechado`, função pura testada; some as partes zero com naturalidade.
- **RV-20** `GrupoKpis` rebaixado na hierarquia: fundo `bg-muted/40` sem borda, valor `text-lg` — resumo do grupo, não segunda fileira de KPIs.
- **RV-22** Valores grandes dos tiles (KpiTiles e GrupoKpis) perdem `tabular-nums` (só o valor grande; rótulos, Δ e toda coluna de tabela continuam tabulares).
- **RV-23** Tooltip das empilhadas ganha a linha "Total · N" da categoria (formatter).

## Frente C — interatividade e navegação (RV-12, RV-13, RV-14, RV-15, RV-16, RV-17, RV-18)

- **RV-12** Clique-para-filtrar, sob a MESMA guarda dos KPI tiles (só operador + só ao vivo — o sinal `links`/`ehOperador` que o corpo já recebe; snapshot e viewer ficam 100% estáticos como hoje): (a) clicar numa barra de "Saídas por motivo" seta o filtro de motivo da tabela de Saídas na URL (`sd.*`) e rola até `#saidas`; "Devoluções por motivo" idem para a tabela de Entradas (se a tabela de entradas não tiver filtro por motivo, acrescente-o no padrão das saídas); (b) clicar num segmento das empilhadas navega para `/ativos?status=X&categoria=Y` (+ recorte de filial no padrão de `kpi-links.ts`/F25 — siga o precedente à risca, inclusive a sentinela `filial=todas` no consolidado); (c) cursor pointer + `aria-label` por alvo clicável ("Ver as 55 saídas por Troca / upgrade"); (d) o teste de confinamento do viewer passa a cobrir os elementos novos. Montagem de URL por função pura testada.
- **RV-13** Scroll-spy nos chips-âncora: `IntersectionObserver` marca a seção visível (`aria-current` + destaque no padrão do protótipo), e a nav rola o chip ativo para a vista. Sem jank: observer nas seções, não em scroll handler.
- **RV-14** Chips-âncora com contagem ("Saídas · 19") — os números já estão no snapshot; chips estruturais (Resumo, Como ler) ficam sem número.
- **RV-15** Legenda da série vira interativa: clicar numa entrada atenua/isola a outra série (state local; clicar de novo restaura). Nada muda para viewer/snapshot além do mesmo comportamento local de tela (não navega, não persiste — permitido nas três superfícies).
- **RV-16** Carimbo "atualizado às HH:mm": `realtime-refresh.tsx` (operador) e `viewer-auto-refresh.tsx` (senha) mostram a hora local do último refresh em texto persistente (não só title); atualiza a cada refresh/evento. Formatador puro testado. O carimbo SAI na impressão.
- **RV-17** Viewer: "Ao vivo" (`viewer-nav.tsx`) passa a apontar para o último `/relatorios/[slug]` visitado, memorizado em `sessionStorage` no padrão de `ativos-recentes.ts` (validação na leitura; fallback `/relatorios/geral`). Nenhuma rota nova, nenhum href fora de `/relatorios/**`.
- **RV-18** `acesso-form.tsx`: `autoComplete="current-password"` + linha de socorro "Não tem a senha? Peça à TI da WAP." (texto sem link).

## Frente D — funções novas (RV-06, RV-09, RV-11)

- **RV-06 · Evolução do estoque.** Card novo "Evolução do estoque" no grupo Equipamentos principais: **linha única** de `em_estoque` (cor do status, a mesma língua da Frente A), um ponto por semana reconstruído **as-of** via `rel_estoque_asof` — SEM migration e SEM RPC nova: chamadas em `Promise.all` no server. Régua (decida os detalhes dentro dela e registre): máximo ~9 leituras as-of por render; pontos = fins de semana fechados dentro do período (últimas ~8 semanas) + o ponto do fim do período; mínimo 3 pontos, senão o card não renderiza; rótulos dd/MM prontos (estáveis no snapshot). O resultado entra no snapshot v2 como campo **opcional** (`serieEstado?` em `lib/relatorios/tipos.ts`, mantendo `schema: 2`) — congela na geração; snapshots antigos sem o campo não renderizam o card e não quebram. Marcas: linha 2px, pontos com anel da superfície, valor final rotulado em INK (nunca na cor da série), grade hairline, tooltip. Sem eixo duplo, sem segunda série nesta ordem.
- **RV-09 · Medidor estoque × mínimo.** A leitura dos itens do relatório (`queries/relatorios/itens.ts`) passa a trazer o `minimo` do catálogo (campo **opcional** `minimo?` em `SaldoItemPeriodo` — snapshots antigos toleram ausência). Na tabela de saldo (`tabela-itens-grupo.tsx`), célula Estoque ganha micro-medidor (barra ~44×6px sob o número): preenchimento `min(estoque/minimo, 1)`; verde quando estoque ≥ mínimo com folga, âmbar quando `estoque − minimo ≤ max(2, 20% do mínimo)`, vermelho quando em falta. Item sem mínimo cadastrado: sem medidor (como hoje). Chip "faltam N" permanece. Régua de cor por função pura testada; cores por token/classe AA, não hex mágico.
- **RV-11 · Resumo de transferências.** No consolidado, acima da tabela de Transferências, linha de chips "Origem → Destino · N" derivada em memória (groupBy de/para), no padrão visual dos `ChipsResumo`. Só quando houver transferência; não muda contagem nenhuma.

## Housekeeping

- Commite esta ordem (`docs/prompts/F32-relatorios-v3-ultracode.md`), a análise (`docs/ANALISE-RELATORIOS-2026-08-10.md`) e o protótipo (`mockups/relatorio-v3-proposta.html`) se estiverem untracked. Sujeira de git alheia: não toque; registre.

# Regras transversais (valem para TODAS as frentes)

- **Nenhuma contagem de relatório muda.** Os diffs em `queries/relatorios/*` se limitam a ACRESCENTAR leituras (mínimo dos itens, série as-of); nenhuma fórmula de agregação existente muda linha alguma.
- **Nada novo só em hover**: todo sinal tem texto/rótulo persistente; tooltip complementa, nunca é o único canal.
- **Viewer por senha confinado**: nenhum href novo para fora de `/relatorios/**`; o teste de confinamento cobre os elementos novos e continua passando.
- **Snapshot congelado**: estático (zero Server Action na árvore, zero `links`), retrocompatível (todo campo novo é opcional; abra um snapshot v1 e um v2 antigo no roteiro manual — nada quebra, seções novas apenas não aparecem).
- **Hex único nos dois temas** nos gráficos (modelo vigente); badges novos com par `dark:` AA no padrão F19.
- **Impressão**: nada regride (compactação F30, tema claro F19); o carimbo RV-16 entra; elementos só-de-navegação novos são `print:hidden`.

# Fora (não toque)

- Tudo do §3 da análise: donut/pizza/gauge, eixo duplo, ECharts ou lib nova, export CSV do relatório, alertas/e-mail, sparkline por tile, steps dark próprios por gráfico, a dualidade T11 das duas semanas.
- **Nenhuma migration, nenhuma RPC nova**: diff de `supabase/` VAZIO; `supabase db push` proibido.
- Modelo de acesso, RLS, máquina de estados; `src/lib/types/database.ts`; `src/components/ui/` fora de motivo documentado; telas fora da área de relatórios (o dashboard só é tocado se um componente compartilhado exigir — e aí a tela dele não pode mudar sem necessidade, ex.: RV-22 vale nos tiles compartilhados).
- Dados reais em fixture/teste/screenshot/evidência: proibição permanente.

# Critérios de aceitação

- **24/24** achados implementados conforme o §2 da análise e as especificações acima, com checklist autoverificado item a item (RV-01..RV-24; o RV-24 é o roteiro de impressão P&B da Verificação — hachura só se o roteiro reprovar, e só em `@media print`).
- `npm run lint`, `npm run test`, `npm run build`, `npm run contraste` **limpos**, saídas reais no relatório; a contagem total de testes **sobe** (funções puras novas: percentual, chip foto/período, régua fds/hoje, resumo de risco, URLs do clique, régua do medidor, série as-of, carimbo HH:mm).
- `package.json` sem dependência nova; diff de `supabase/` vazio; nenhum texto novo de UI em inglês; contagens idênticas às de antes (prove por diff das queries); teste de confinamento passando e cobrindo os elementos novos; snapshot v1 e v2 antigos abrindo (roteiro manual).
- `CHANGELOG.md` (entrada F32 no topo), `README.md` (status), `docs/DECISOES.md` (atas — no mínimo: matiz da triagem; régua dos baldes da série as-of; régua âmbar do medidor; escolha dos ícones de grupo), ajuda atualizada (`relatorio-ao-vivo` e `relatorios-gerados` com: cores/acentos, chip foto×período, evolução do estoque, cliques do operador, chips com contagem, carimbo de hora).
- Commits pequenos pt-BR (`feat(f32): …`), `git pull --rebase` antes do push, **main pushada** com tudo verde. Push bloqueado pelo ambiente: não insista — commits locais + pendência no relatório.

# Verificação — rode de verdade

Após cada frente: `npm run lint && npm run test`; leia, corrija a **causa raiz**, repita até passar — sem suprimir erro nem desabilitar/deletar teste (teste da ajuda quebrando = atualizar a documentação junto). Ao final: `npm run build` + `npm run contraste` + suíte completa, saídas guardadas. Roteiros manuais obrigatórios (com dados fictícios, resultado observado no relatório): (1) relatório ao vivo como operador — acentos, barra do acervo, cliques de motivo/segmento, scroll-spy, carimbo; (2) viewer por senha — nada clicável além do que já era, "Ao vivo" lembrando a filial; (3) snapshot NOVO (com serieEstado e minimo) e snapshot ANTIGO (v1 e v2 pré-F32) abrindo; (4) impressão A4 retrato do ao vivo e de um snapshot — e o mesmo preview em P&B (RV-24: rótulos+gaps seguram a leitura sem cor?); (5) mobile ~360px — chips, grupos recolhidos, tabelas. Depois do push, com credenciais no ambiente, rode o smoke (`scripts/smoke/`) e cole o resultado; sem credenciais, pendência para o Johnny.

# Autonomia e decisões

Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em nenhuma hipótese. Régua: (1) esta ordem; (2) a análise de 10/08 (§2 e §4); (3) `CLAUDE.md`/spec §7 e convenções do código; (4) o mais simples e reversível, registrado em `docs/DECISOES.md`. Divergência análise × código: o código vale, adapte a intenção, registre. Protótipo × análise: a análise vence (o protótipo é ilustração). Mesma falha após ~3 tentativas: mude de abordagem e registre. Bloqueio real: contorne se seguro; senão siga com o resto e registre a pendência.

# Git e segurança

Direto na `main` (modo autônomo do projeto; push autorizado pelo Johnny nesta ordem), commits pequenos e frequentes, um por incremento coeso. **PROIBIDO:** force push, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit alheio, qualquer operação em banco de produção, commitar `.env*` ou dado real.

# Como trabalhar

Explore com subagentes paralelos (área de relatórios; tokens/dominio; queries+snapshot; testes existentes de relatório) e escreva `PLAN.md` autossuficiente ANTES de editar: arquivos e interfaces nomeados por frente, fora-de-escopo declarado, verificação de ponta a ponta no final — inclua o mapa RV-xx → arquivos, porque várias frentes tocam os MESMOS arquivos (`barras-horizontais` recebe RV-08 e RV-12; `grafico-mov-serie` recebe RV-03, RV-05 e RV-15; `chips-ancora` recebe RV-13 e RV-14). Por isso a ordem das frentes é sequencial: **A → B → C → D**, com lint+test verdes entre uma e outra; dentro de cada frente, incrementos pequenos, um commit por item ou par correlato. Paralelismo fica DENTRO da frente e só em arquivos disjuntos (worktrees se necessário). Ao final, **revisão adversarial em contexto fresco** com lentes independentes — (a) vazamento do visualizador, (b) compatibilidade de snapshots antigos, (c) contagens intactas, (d) a11y/contraste dos elementos novos, (e) cobertura dos 24 itens contra o §2 da análise — cada achado submetido a um cético antes de virar correção; só lacunas de correção ou requisito, não estilo; corrija e re-revise até limpar. Não refatore fora dos pontos tocados.

# Relatório final

`docs/RELATORIO-F32.md` em pt-BR, padrão da casa (espelhe `docs/RELATORIO-F29.md`): o que mudou por frente; checklist RV-01..RV-24 autoverificado com evidência por item; o que a medição desmentiu (se a análise citou linha/estado que o código atual contradiz); decisões (→ `DECISOES.md`); saídas reais de lint/test/build/contraste (e smoke, se rodou); os 5 roteiros manuais executados; invariantes provados (confinamento, contagens, snapshot antigo, supabase/ vazio); pendências e backlog novo; seção **"O que este relatório NÃO prova"** (ex.: impressão vista em preview, não papel; concorrência do realtime não exercida). Resposta final: resumo de ~8 linhas — o que entrou, decisões-chave, estado do push/deploy, o que o Johnny confere de olho.

# Idioma

Narrativa, plano, relatório, UI e commits em **pt-BR**; identificadores de domínio em português sem acento, utilitários/infra em inglês (convenção do `CLAUDE.md`).
