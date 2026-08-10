# Análise minuciosa — Relatórios: design de informação, gráficos, legendas e interatividade

> **Estoque TI WAP** · análise de 10/08/2026 sobre o working tree pós-F31 · pedido do Johnny: *"análise minuciosa dos relatórios, para melhoria e talvez novas funções de UX e UI, interatividade, design, tipos de gráfico para cada dado, legendas… para que tudo fique óbvio o que é o quê só de bater o olho e também seja agradável de visualizar."*
>
> **Método:** leitura integral da área de relatórios (as 4 rotas de `/relatorios/**`, os ~45 componentes de `src/components/relatorios/`, `src/lib/relatorios/*`, `src/lib/queries/relatorios/*`, tokens em `globals.css` e `dominio.ts`), da spec §7, do mockup de referência (`mockups/dashboard-relatorio.html`) e do histórico F3→F31 (`ANALISE-UX-2026-08-07.md`, `RELATORIO-F16/F17/F29`, CHANGELOG). As recomendações de cor foram **validadas por script** (simulação de daltonismo Machado–Oliveira–Fernandes 2009, distância OKLab, contraste WCAG) — os números estão no §4, nenhum é de olhômetro. Um protótipo navegável acompanha: **`mockups/relatorio-v3-proposta.html`** (dados 100% fictícios).
>
> **Escopo:** design de informação e visualização — o que a análise de 07/08 (fluxos/correções) **não** cobriu. Nada aqui repete os REL-01…REL-13 já entregues nas F27/F29/F30; os 3 remanescentes daquela série entram na priorização com o código original (§5). Convenção de IDs desta análise: **RV-xx** ("Relatórios · Visual"), para não colidir com a série REL-xx de 07/08.
>
> **Legenda:** Impacto **A**lto / **M**édio / **B**aixo · Esforço **P** ≈ até meio dia · **M** ≈ 1–2 dias · **G** ≈ 3+ dias.

---

## 0. Onde o relatório está — e o que esta análise procura

O relatório v2 é **maduro**. Vale registrar o que foi conferido e está certo, para não virar falso achado: a grade segue o formato do e-mail (spec §7/F3B); todos os 4 gráficos têm tooltip (F29); rótulos de valor são adaptativos (somem em série longa e entra eixo Y — `rotulo-grafico.ts`); o rótulo dentro do segmento empilhado escolhe branco/preto por luminância medida (F19); o Δ dos KPIs tem semântica de cor por indicador com a seta como segundo canal e Dica com a janela de comparação (F16/F29); as legendas explicativas existem e são texto-no-lugar, nunca só hover (F17); o glossário cobre 100% dos status por teste; a manutenção ordena abertos-com-mais-dias primeiro (`estoque.ts:427-430`); a impressão sai clara, compacta e com todas as colunas (F19/F30); o visualizador por senha é confinado por teste estático; contraste tem script e portão de CI (F29).

O que esta análise encontra é a camada que sobra depois disso tudo — e ela tem um diagnóstico central:

**A página tem os dados certos nos gráficos certos, mas a COR ainda não é uma língua.** O status do ativo — o conceito nº 1 do sistema — é colorido em um único lugar (os segmentos das barras empilhadas). Os 7 KPI tiles que abrem a página são monocromáticos; o glossário que explica os status é monocromático; e dentro da própria paleta dos segmentos, os dois vizinhos âmbar (`em_manutencao` #d97706) e laranja (`em_triagem` #ea580c) medem **ΔE 1,6 sob deutanopia e 6,7 em visão normal** — indistinguíveis para daltônicos e difíceis para todo mundo (medição no §4; o piso de visão normal é 15). Ou seja: a única superfície onde a cor trabalha, trabalha com dois matizes que se confundem. "Óbvio de bater o olho" é exatamente isto: **a mesma cor significando o mesmo status em todas as superfícies** (tile → segmento → badge → glossário), com uma paleta que passe nas medições.

O segundo diagnóstico: **o relatório mostra fluxo do período e foto do último dia, mas nenhuma evolução do estado** — não há como ver "a prateleira está esvaziando semana a semana?", a pergunta gerencial que o Δ dos KPIs só responde para uma janela. E o terceiro: **a interatividade existente é de leitura (tooltip), não de navegação** — os gráficos não conversam com as tabelas filtráveis que vivem 3 rolagens abaixo, embora os filtros por URL (`sd.*`) já existam e os KPI tiles clicáveis (F16) já tenham criado o precedente e a guarda (operador + ao vivo; snapshot/viewer estáticos).

Total: **24 achados** (4 altos, 12 médios, 8 baixos), zero dependência nova, zero migration obrigatória, nada que toque o modelo de acesso ou as decisões registradas (§7).

---

## 1. Inventário e veredito — bloco a bloco do corpo v2

A ordem é a do `corpo-relatorio-v2.tsx`. "Tipo certo?" avalia a escolha da forma de visualização para o dado (referência: o trabalho do dado — magnitude, identidade, polaridade, tendência, número isolado).

| # | Bloco | Forma hoje | Tipo certo? | O que falta (→ achado) |
|---|---|---|---|---|
| 1 | Chips-âncora (`chips-ancora.tsx`) | nav sticky de âncoras | ✅ | sem contagens, sem seção-ativa → RV-13, RV-14 |
| 2 | KPIs gerais (`kpi-tiles.tsx`) | 7 stat tiles + Δ | ✅ tiles são a forma certa (não gráfico) | monocromáticos; sem vínculo visual com os status → RV-01; tipografia RV-22 |
| 3 | Série de movimentações (`grafico-mov-serie.tsx`) | barras agrupadas saídas×devoluções | ✅ contagens discretas por balde pedem barra (não linha) | fim de semana/hoje sem marcação no balde diário; pares colados → RV-05, RV-03 |
| 4 | GrupoKpis (Guardados…) (`kpi-tiles.tsx:158`) | 4 stat tiles | ✅ | eco visual dos tiles de cima → RV-20 |
| 5 | Estoque por categoria × situação (`barras-empilhadas.tsx`) | barras horizontais empilhadas | ✅ composição por categoria é isto mesmo | **paleta com par ilegível** → RV-02; sem gap entre segmentos → RV-03; falta o "sumário de 1 linha" do acervo → RV-07 |
| 6 | Disponíveis por modelo (`lista-modelo-categoria.tsx`) | bar list agrupada | ✅ ranking com rótulo longo pede bar list (não pizza) | — (ok; máx. global compartilhado é escolha correta p/ comparação entre categorias) |
| 7 | Reservados (`lista-reservados.tsx`) | lista | ✅ | — |
| 8 | Saídas/Devoluções por motivo (`barras-horizontais.tsx`) | barras horizontais, 1 série | ✅ | sem % do total → RV-08 |
| 9 | Manutenção caso a caso (`manutencao-casos.tsx`) | cards + badges 4 cores + mini-timeline | ✅ caso-a-caso é o valor; agregação mataria o contexto | subtítulo não resume o risco ("X em alerta") → RV-19b |
| 10 | Saldo por item (`tabela-itens-grupo.tsx`) | tabela + chip "faltam N" | ✅ | a coluna Falta pede um medidor estoque×mínimo → RV-09 |
| 11 | Movimentação por item (`barras-divergentes.tsx`) | barras divergentes | ✅ polaridade entrada/saída é o caso clássico | truncagem de 18ch sem tooltip no rótulo → RV-10; gap RV-03 |
| 12 | Pendências (`pendencias-chips.tsx`) | chips âmbar (clicáveis p/ operador) | ✅ | — (F27 resolveu o clique) |
| 13 | Tabelas detalhadas (4×) | tabelas filtráveis por URL | ✅ | não recebem cliques dos gráficos → RV-12 |
| 14 | Resumo do período (`resumo-periodo.tsx`) | texto do e-mail + copiar | ✅ | — (F29 completou os extras) |
| 15 | Observação / Glossário (`legendas.tsx`) | card + `<dl>` recolhível | ✅ | glossário sem os swatches de cor que ele explica → RV-01c |
| — | **Ausente** | — | — | **evolução do estado (semana a semana)** → RV-06; carimbo de atualização → RV-16 |

**Veredito geral sobre "tipos de gráfico para cada dado": as formas estão certas.** Nenhum gráfico do relatório precisa trocar de tipo — barras agrupadas para fluxo discreto, empilhadas para composição, bar list para ranking, divergentes para polaridade, tiles para números isolados são exatamente o que a teoria manda, e o relatório acerta também no que ele **não** fez (nenhuma pizza, nenhum eixo duplo, nenhuma linha para contagens esparsas). O trabalho desta rodada não é trocar formas: é (a) consertar e **unificar a cor**, (b) acrescentar a **forma que falta** (série de estado), (c) fazer os gráficos **conversarem** com as tabelas e a página, e (d) polir marcas, legendas e microssinais.

---

## 2. Os achados

### §A — Cor como língua única da página (o "bater o olho")

**RV-01 · O status precisa da mesma cor em toda superfície 🎨 A/M**
Hoje a cor de status existe só nos segmentos de `barras-empilhadas.tsx` (via `STATUS_CHART_COLOR`) e nos badges das listas (via `STATUS_META`, com matizes ligeiramente diferentes). As três outras superfícies que falam de status são monocromáticas: os **7 KPI tiles** (`kpi-tiles.tsx:91-143`), os **4 tiles do grupo** (`:158-218`) e os **verbetes do glossário** (`legendas.tsx:65-83`). Resultado: o leitor aprende a cor num gráfico e não a reencontra em lugar nenhum — cada superfície reapresenta o vocabulário do zero.
*Proposta:* (a) cada KPI tile de status ganha um **acento discreto** na cor do seu status — a forma mais elegante é uma barra fina de 3px no topo do tile (ou um pontinho de 8px ao lado do rótulo), nunca o fundo inteiro (bloco saturado grande é exatamente o anti-padrão); "Total de ativos" fica sem acento (não é um status). (b) os verbetes de status do glossário ganham o **swatch** de 10px antes do termo (os `VerbeteRelatorio` já carregam `status?` — `legendas.ts:95` — o dado necessário já existe). (c) os badges de `STATUS_META` e os hex de `STATUS_CHART_COLOR` passam a ser **declaradamente o mesmo matiz** por status (ver RV-02). Com isso, tile → segmento → badge → glossário formam um único aprendizado. O `LinksKpi` e toda a lógica existente ficam intactos — é só apresentação.
*Custo:* M (toca `kpi-tiles`, `legendas.tsx`, `dominio.ts`; nenhum dado novo).

**RV-02 · A paleta de status reprova na medição — e a correção cabe em 3 hex 🎨 A/P**
Medido com simulação de daltonismo (Machado–Oliveira–Fernandes 2009, severidade 1.0) e distância em OKLab (×100), sobre a pilha na ordem canônica `STATUS_ORDEM` (verde → violeta → azul → ciano → laranja → âmbar → cinza):

- **`em_manutencao` #d97706 ↔ `em_triagem` #ea580c: ΔE 1,6 sob deutanopia; 6,7 em visão normal.** O piso para vizinhos é 8 (CVD) e 15 (visão normal). É o pior par possível — e o próprio código já admitia o problema ("âmbar × laranja vizinhos são quase a mesma cor para daltônicos", `barras-empilhadas.tsx:80-83`), mitigando com tooltip. Tooltip é desempate, não solução: numa barra com os dois status, **a cor não distingue nada para ~5% dos homens, e mal distingue para o resto**.
- `reservado` #7c3aed ↔ `em_uso` #2a78d6: ΔE 5,2 (deutan) — abaixo do piso 6.
- `emprestado` #0891b2 ↔ `em_uso` #2a78d6: ΔE 9,9 em visão normal — abaixo do piso 15.

*Proposta (validada — números completos no §4):* manter os matizes com semântica forte e mexer no mínimo:

| Status | Hoje | Proposto | Por quê |
|---|---|---|---|
| `em_estoque` | `#16a34a` verde | **mantém** | verde = disponível, semântica consolidada |
| `reservado` | `#7c3aed` | **`#6d28d9`** (violet-700) | um degrau mais escuro afasta do azul vizinho (deutan 5,2 → 7,6) |
| `em_uso` | `#2a78d6` azul da marca | **mantém** | é o token da marca |
| `emprestado` | `#0891b2` | **`#06b6d4`** (cyan-500) | um degrau mais claro afasta do azul (visão normal 9,9 → 17,5) |
| `em_triagem` | `#ea580c` laranja | **`#db2777`** (pink-600) | única família de matiz livre no sistema; mata o par 1,6 |
| `em_manutencao` | `#d97706` âmbar | **mantém** | âmbar = atenção, e é o matiz do badge "há N dias" |
| `defasado` | `#9ca3af` cinza | **mantém** | cinza de de-ênfase é deliberado (não é categoria "viva"); fica documentado fora da régua categórica |

Resultado da pilha proposta: pior par CVD **7,6** (na banda 6–8, que é legal porque os segmentos têm rótulo direto + tooltip + legenda — os três encodings secundários já existem) e pior par em visão normal **17,1** (piso 15). O badge de `em_triagem` em `STATUS_META` acompanha o matiz (`bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300` — par AA no padrão F19 dos irmãos), e os pares novos entram em `scripts/contraste.mjs` (o portão do CI já existe). A pílula neutra e os demais badges não mudam.
*Custo:* P (3 hex + 1 classe de badge + pares no script de contraste). É o item com a melhor razão retorno/custo da análise inteira.

**RV-03 · Gap de 2px entre marcas coladas 🎨 M/P**
Os segmentos empilhados se tocam sem separador (`barras-empilhadas.tsx:85-117` — nenhum `stroke` nos `<Bar>`), e as barras agrupadas da série idem. A técnica canônica é o **respiro na cor da superfície**: `stroke="var(--card)" strokeWidth={2}` em cada `<Bar>` empilhado (e nos pares da série/divergentes). Vizinhos de cor parecida passam a se separar pela fresta, não pela sorte do matiz — é o complemento estrutural do RV-02, e vale também na impressão P&B, onde é o gap (não a cor) que segura a leitura.
*Custo:* P (uma prop em 3 arquivos).

**RV-04 · Estado × fluxo precisa de um microssinal padronizado 🎨 M/P**
A confusão de leitura nº 1 de qualquer relatório de estoque é misturar **foto** ("Estoque no último dia", KPIs as-of) com **filme** ("Saídas por motivo", série, Δ). Hoje a distinção mora só nos subtítulos em texto (`"por categoria e situação"` vs `"no período"`), cada um com fraseado próprio. *Proposta:* `CardRelatorio` ganha uma prop `janela?: 'foto' | 'periodo'` que renderiza um **chip padronizado de 11px** junto ao subtítulo — cinza `foto de 08/08` para estado as-of, azul-claro `03/08 – 08/08` para fluxo (as datas reais vêm do `meta`). Um sinal, sempre no mesmo lugar, com o mesmo vocabulário — depois de dois relatórios o olho lê o chip sem pensar. O glossário ganha o verbete correspondente ("foto × período").
*Custo:* P (prop + chip + passar a janela nos ~8 cards; zero mudança de dado).

### §B — O gráfico certo para cada dado (ajustes e a forma que falta)

**RV-05 · Série diária: marcar fim de semana e "hoje" 🎨 M/P**
No preset padrão ("Esta semana", granularidade `dia`), o eixo é preenchido dom→hoje incluindo os zeros de sábado/domingo (`serie.ts:83-93` — correto). Mas o gráfico não diferencia dia útil de fim de semana, nem o balde de **hoje** (ainda incompleto — o leitor compara "hoje até as 10h" com dias fechados sem nenhum aviso visual). *Proposta:* (a) tick de sábado/domingo em `text-muted-foreground/60`; (b) a dupla de barras de hoje com opacidade 0.55 + nota curta na legenda ("hoje, parcial") — o dado não muda, o juízo fica honesto.
*Custo:* P (formatter do tick + `Cell`/opacidade condicional por `chave === hojeISO()` — só no ao vivo; snapshot congelado nunca tem "hoje" dentro do período por definição de geração, e quando tiver `ate = hoje` a marca até ajuda).

**RV-06 · A forma que falta: evolução do estado (a prateleira ao longo das semanas) ⚡ A/M–G**
O relatório responde "quanto saiu/entrou no período" (série) e "como está agora/no fim do período" (KPIs, empilhadas) — mas **não** "para onde a prateleira está indo": em_estoque semana a semana, o dado que transforma o Δ pontual em tendência. É a pergunta que justifica linha (tendência), e é a única forma ausente da página. *Proposta:* card "Evolução do estoque" no grupo Principais — **linha de `em_estoque`** (+ opcionalmente `em_manutencao`, máximo 2 séries) com um ponto por semana nas últimas 8 semanas encerradas dentro do período (mínimo 3 pontos para renderizar; menos que isso o card não aparece). Implementação sem migration: `rel_estoque_asof` já aceita data — 8 chamadas em `Promise.all` (a RPC consolidada mede 233 ms; 8 em paralelo cabem no orçamento da página, e o resultado entra no snapshot v2 como campo **opcional** `serieEstado?`, mantendo `schema: 2` — precedente `movimentacoesItens?`). Se o custo em produção incomodar, uma RPC dedicada `rel_kpis_asof_serie` vira otimização futura (aí sim, migration — decisão à parte). Marca: linha 2px, ponto final de 8px com o valor direto no fim (endpoint label), grade hairline; azul da marca para em_estoque? **Não** — em_estoque veste **a cor do status** (#16a34a), a mesma língua do RV-01.
*Custo:* M no app (query + componente + snapshot); G se optar pela RPC dedicada.

**RV-07 · O sumário executivo de 1 linha: "Acervo por situação" 🎨 M/P**
As empilhadas por categoria respondem "como cada categoria se divide" — mas ninguém soma de cabeça as 5 barras para saber a composição do acervo inteiro. O dado já está na página (`estoqueCatStatus` agregado, ou os próprios `kpis`). *Proposta:* uma **única barra 100% empilhada** ("Acervo por situação — N ativos") entre os KPI tiles e as empilhadas por categoria, com as mesmas cores (RV-02), rótulos nos segmentos ≥4% (a régua `deveRotularSegmento` já existe) e tooltip. É o gráfico que dá o "bater de olho" da página inteira em 24px de altura — e o elo visual entre os tiles coloridos (RV-01) e as empilhadas.
*Custo:* P (deriva de dados existentes; reusa o componente empilhado com 1 linha).

**RV-08 · Motivos com percentual ⚡ M/P**
"Novo colaborador: 219" — de quanto? A leitura gerencial de ranking por motivo é sempre relativa ("metade das saídas é contratação"). *Proposta:* `barras-horizontais.tsx` ganha prop opcional `comPercentual` — o rótulo da ponta vira `219 · 52%` (percentual do total da própria lista, `text-muted-foreground` no fragmento do %). Ativar nos dois cards de motivo; o tooltip repete. Nenhuma contagem muda.
*Custo:* P.

**RV-09 · "Falta" merece um medidor, não só um chip ⚡ M/M**
Na tabela de saldo por item, `falta > 0` vira chip vermelho "faltam N" (`tabela-itens-grupo.tsx:126-134`) — correto como alerta, mas binário: não se vê **quão perto do mínimo** os demais itens estão (o quase-vermelho é invisível). *Proposta:* a célula Estoque ganha um **micro-medidor** (barra de 44×6px sob o número): trilho na versão clara do matiz, preenchimento `estoque/minimo` limitado a 100% — verde quando ≥ mínimo, âmbar < mínimo+20%, vermelho quando em falta (é o padrão "meter" clássico; o trilho é um degrau claro do mesmo matiz, nunca cinza solto). Pede o `minimo` por item na leitura do relatório (`queries/relatorios/itens.ts` — o catálogo já tem a coluna; o dashboard já usa `minimosDoCatalogo`). Chip "faltam N" permanece (é o rótulo-relief).
*Custo:* M (leitura ganha 1 campo + snapshot opcional + célula). Se pesar, versão mínima: só o chip ganha o irmão âmbar "no limite" quando `estoque − minimo ≤ 2`.

**RV-10 · Divergentes: rótulo truncado sem socorro 🎨 B/P**
`tickFormatter` corta o nome do item em 18 caracteres com `…` (`barras-divergentes.tsx:94`) e não há como ler o nome completo (o tooltip do Recharts abre pela **barra**, não pelo tick — item sem movimento num dos lados tem barra minúscula). *Proposta:* largura do eixo responsiva (110→150 no `lg`, como as horizontais já fazem) e o nome completo no tooltip (header do `ChartTooltipContent` já o mostra — conferir que o `label` recebe o nome não-truncado, hoje recebe o truncado? Não: `dataKey="item"` usa o valor cheio, o truncado é só o tick — ok, documentar). Miudeza.
*Custo:* P.

**RV-11 · Transferências no consolidado: a linha-resumo dos pares ⚡ B/P**
A tabela de transferências lista movimento a movimento; no consolidado, a pergunta "quem mandou para quem?" exige varrer as linhas. *Proposta:* linha de chips-resumo acima da tabela — `Matriz → Serra Park · 4` — derivada em memória (`groupBy` de/para), no padrão visual dos `ChipsResumo` que Saídas/Entradas já têm. Sem gráfico (sankey/chord para meia dúzia de pares é canhão em mosca).
*Custo:* P.

### §C — Interatividade (dos gráficos para a página)

**RV-12 · Clique-para-filtrar: os gráficos apontando para as tabelas ⚡ A/M**
Os gráficos e as tabelas filtráveis são vizinhos que não se falam: ver "Troca / upgrade: 55" no gráfico de motivos e querer **as 55 linhas** custa rolar até Saídas e remontar o filtro à mão — sendo que o filtro já é serializável na URL (`sd.motivo`, `use-filtros-tabela.ts`) e o precedente de interatividade gateada existe desde a F16 (KPI tiles clicáveis: só operador + só ao vivo; snapshot e viewer nunca recebem `links`). *Proposta, sob a MESMA guarda:* (a) clicar numa barra de **motivo** seta `sd.motivo`/`en.motivo` na URL e rola até `#saidas`/`#entradas`; (b) clicar num **segmento** das empilhadas navega para `/ativos?status=X&categoria=Y` (+ `filial` quando não é o consolidado) — o destino que os KPI tiles já usam, refinado por categoria; (c) cursor `pointer` + `aria-label` por barra/segmento ("Ver as 55 saídas por Troca / upgrade"). Viewer por senha e snapshots: gráficos exatamente como hoje (o teste de confinamento de F29 já vigia os href — ele passa a vigiar estes também).
*Custo:* M (handlers Recharts + montagem de URL; a infra de filtros/rolagem/guardas já existe).

**RV-13 · Chips-âncora com seção ativa (scroll-spy) 🎨 M/P**
Numa página de 10+ seções, a barra sticky de chips não diz **onde o leitor está** (`chips-ancora.tsx` — links estáticos). *Proposta:* `IntersectionObserver` nas seções-alvo marca o chip ativo (`aria-current="true"` + fundo `bg-card`→`border-brand-amarelo/60 text-foreground`) e a nav rola o chip ativo para a vista. É o padrão de orientação de docs longas, e o custo é um hook pequeno num componente que já é client-adjacente (o wrapper `NavRolavel` já observa resize).
*Custo:* P.

**RV-14 · Chips-âncora com contagem 🎨 M/P**
"Saídas" ou "Saídas · 19"? A segunda versão responde "vale rolar até lá?" antes do gesto — e as contagens já estão todas no snapshot (`s.saidas.length`, `s.transferencias.length`…). *Proposta:* `ChipsAncora` recebe as contagens (número `tabular-nums` atenuado após o rótulo; chips estruturais — Resumo, Como ler — ficam sem número). Zero leitura nova.
*Custo:* P.

**RV-15 · Legenda interativa na série (isolar uma série) ⚡ B/P**
Clicar em "Saídas (423)" na legenda da série para atenuar a outra série (e clicar de novo para voltar) — o padrão Recharts de `hide` por `state`. Ganho real porém modesto num gráfico de 2 séries; entra como polimento, atrás dos demais.
*Custo:* P.

**RV-16 · Carimbo "atualizado às HH:mm" ⚡ M/P**
O mockup de referência previa "atualizado agora · 09/07/2026" no cabeçalho; hoje o operador tem o dot "ao vivo" sem hora (`realtime-refresh.tsx:58`) e o viewer tem a informação escondida num `title` de hover (`viewer-auto-refresh.tsx:27`) — canal que teclado e toque não alcançam. *Proposta:* os dois componentes exibem `atualizado às HH:mm` (hora local do último refresh, `text-xs text-muted-foreground`), atualizada a cada refresh/evento realtime. No impresso, o carimbo **sai no papel** (é a resposta de "de quando é este papel?" — hoje só o período sai, não o momento da impressão).
*Custo:* P. *(Era o REL-13b da análise de 07/08 — nunca entrou em ordem nenhuma.)*

**RV-17 · Viewer: "Ao vivo" volta sempre ao Consolidado (REL-11 remanescente) ⚡ B/P**
`viewer-nav.tsx:15` é `href` fixo `/relatorios/geral`; o gestor de UMA filial re-seleciona a aba a cada volta do arquivo de gerados. Memorizar o último `/relatorios/[slug]` visitado em `sessionStorage` (espelho do padrão `ativos-recentes.ts` da F29) resolve sem tocar em rota nem cargo.
*Custo:* P.

**RV-18 · Porta da senha: gerenciador de senhas bloqueado (REL-12 remanescente) 🎨 B/P**
`acesso-form.tsx:41` mantém `autoComplete="off"` — o gerenciador de senhas não oferece guardar a credencial de longa vida, e o gestor a redigita de memória toda manhã (sessão de 24h). Trocar para `current-password` + uma linha de socorro ("Não tem a senha? Peça à TI da WAP.") fecha o item.
*Custo:* P.

### §D — Design, marcas e microtipografia ("agradável de visualizar")

**RV-19 · Identidade visual das seções da página longa 🎨 M/P**
(a) Os títulos dos 3 grupos e das 4 tabelas são tipograficamente idênticos (`text-lg font-semibold`) — numa rolagem rápida nada diferencia "Equipamentos principais" de "Saídas". *Proposta:* ícone lucide discreto (16px, `text-muted-foreground`) antes do título de cada **grupo** (Package / Headphones / MemoryStick) — só nos grupos, para criar 3 marcos visuais na rolagem sem poluir as tabelas. (b) O subtítulo da manutenção vira resumo de risco: hoje `"14 caso(s) — envio, anotações e retorno"`; proposto `"14 casos · 3 em alerta (30+ dias) · 2 encerrados no período"` — a função `manutencaoEmAlerta` já existe, é um `filter().length`. O leitor decide se abre os cards sabendo o tamanho do problema.
*Custo:* P.

**RV-20 · GrupoKpis: reduzir o eco dos tiles-clone 🎨 B/P**
"Guardados / Reservados / Em manutenção" repetem 3 dos 7 números exibidos 200px acima, no mesmo desenho de tile (`kpi-tiles.tsx:158-218` — a redundância é herdada do formato do e-mail e o sub "= Em estoque" da F17 já explica). Sem mudar conteúdo: rebaixar a hierarquia visual — fundo `bg-muted/40` sem borda, valor `text-lg` (vs `text-2xl` dos principais) — para o olho ler "resumo do grupo", não "outra fileira de KPIs do mesmo peso". Com RV-01, o acento de cor por status já os diferencia dos de cima por si.
*Custo:* P.

**RV-21 · Tokens `--chart-1..5` continuam os cinzas default do shadcn 🎨 B/P**
`globals.css:96-100` tem os 5 tokens de chart neutros de fábrica, não usados por gráfico nenhum (os gráficos usam brand + hex de status). Um gráfico futuro que os use "porque é o token" sairá cinza. *Proposta:* defini-los como a escala categórica da casa — `--chart-1: var(--brand-azul)`, `--chart-2: var(--brand-amarelo)`, `--chart-3: #16a34a`, `--chart-4: #6d28d9`, `--chart-5: #db2777` — e registrar em `ARQUITETURA.md` que série nova usa token, não hex.
*Custo:* P.

**RV-22 · Números grandes com figuras proporcionais 🎨 B/P**
Os valores dos KPI tiles usam `tabular-nums` (`kpi-tiles.tsx:107`). Dígitos de largura fixa servem a colunas que alinham verticalmente (tabelas, eixos — a convenção do CLAUDE.md fala de tabelas); num número isolado de 24px, "121" ganha buracos. Remover `tabular-nums` **só do valor grande do tile** (rótulos, Δ e tabelas continuam tabulares). Detalhe de tipografia que os olhos notam sem saber nomear.
*Custo:* P.

**RV-23 · Total da linha no tooltip das empilhadas 🎨 B/P**
O tooltip lista os segmentos; o **total da categoria** fica só no rótulo da ponta. Acrescentar a linha "Total · N" no rodapé do tooltip (formatter) poupa a soma de cabeça no hover.
*Custo:* P.

**RV-24 · Impressão dos gráficos em P&B: documentar o canal que segura 🎨 B/P**
Muita impressora de escritório imprime P&B: as cores dos segmentos colapsam em cinzas parecidos. Os relief channels que seguram a leitura são os rótulos por segmento + o total + a legenda com texto — e o RV-03 (gaps) melhora exatamente este cenário. *Proposta mínima:* conferir na impressão P&B (checklist da ordem) que rótulo+gap bastam; se não bastarem, a alternativa documentada é padrão de hachura 45° só em `@media print` (opt-in, nunca decorativo em tela). Não propor hachura em tela.
*Custo:* P (verificação; hachura só se reprovar).

---

## 3. O que deliberadamente NÃO estou propondo

**Trocar tipos de gráfico existentes** (todas as formas estão certas — §1); **pizza/donut/gauge/radar** em qualquer lugar (composição já tem empilhadas; donut de 7 fatias com rótulo é pior em todos os critérios); **eixo duplo** (anti-padrão clássico — a evolução de estado do RV-06 é um card separado, nunca uma segunda escala na série de movimentações); **ECharts/interatividade estilo Power BI** (decisão registrada: Recharts v3; upgrade mapeado fora desta análise — e nada aqui precisa dele); **export CSV do relatório** (decisão de 14/07 mantida); **alertas/e-mail** (F5); **sparkline por KPI tile** (multiplicaria a leitura as-of por 7 tiles — o RV-06 entrega a mesma resposta num gráfico só; se um dia vier, vem do mesmo `serieEstado`); **dark steps próprios por gráfico** (a paleta RV-02 mantém o modelo hex-único vigente — a distinção CVD/visão-normal independe do fundo; a banda de luminância ideal do tema escuro fica como limitação documentada, aceitável porque impressão é sempre clara e o uso primário do relatório é diurno/claro — se o Johnny quiser fechar 100% no escuro um dia, o caminho é token com par claro/escuro, registrado como evolução); **mexer na dualidade das duas semanas** (T11 é decisão aberta do Johnny — fora do escopo visual).

---

## 4. Anexo — as medições de cor (reproduzíveis)

Método: simulação de protanopia/deuteranopia (Machado–Oliveira–Fernandes 2009, severidade 1.0), distância euclidiana em OKLab ×100 entre **vizinhos adjacentes da pilha** (na ordem `STATUS_ORDEM`, que é a ordem em que os segmentos se tocam), piso 8 (alvo) / 6 (mínimo com encoding secundário); piso de **visão normal** 15 (portão duro); contraste WCAG vs superfície do card. Superfícies: claro `#ffffff` (card), escuro `#171717`.

**Pilha atual** `#16a34a · #7c3aed · #2a78d6 · #0891b2 · #ea580c · #d97706 · #9ca3af`:

| Par crítico | ΔE CVD | ΔE visão normal | Veredito |
|---|---|---|---|
| `em_manutencao` ↔ `em_triagem` (#d97706↔#ea580c) | **1,6** (deutan) | **6,7** | **FALHA** nos dois pisos — par indistinguível |
| `reservado` ↔ `em_uso` (#7c3aed↔#2a78d6) | 5,2 (deutan) | 17,1 | FALHA CVD (abaixo do piso 6) |
| `emprestado` ↔ `em_uso` (#0891b2↔#2a78d6) | ok | **9,9** | FALHA visão normal |
| `defasado` #9ca3af | — | — | fora da régua: chroma 0,019 (cinza deliberado de de-ênfase; rótulo carrega) |

**Pilha proposta** `#16a34a · #6d28d9 · #2a78d6 · #06b6d4 · #db2777 · #d97706 · (#9ca3af)`:

| Verificação (claro, card branco) | Resultado |
|---|---|
| Banda de luminância OKLCH (0,43–0,77) | ✅ todos os 6 |
| Piso de croma (≥ 0,10) | ✅ todos os 6 |
| Pior par adjacente CVD | **7,6** (azul↔violeta, deutan) — banda 6–8, **legal** com os 3 encodings secundários já presentes (rótulo no segmento + tooltip + legenda) |
| Pior par adjacente visão normal | **17,1** (≥ 15 ✅) |
| Contraste vs card | ✅ exceto `#06b6d4` 2,43:1 — regra de alívio satisfeita pelos rótulos diretos e pelo total na ponta |

No escuro (`#171717`): a distinção entre categorias (CVD e visão normal) **é a mesma** — ΔE entre cores não depende do fundo; contraste vs card escuro ≥ 3:1 para todos exceto o violeta (2,5:1 — mesmo regime de alívio). A banda de luminância ideal do escuro (0,48–0,67) não fecha com hex único para ciano/violeta — limitação aceita e documentada (ver §3).

Pares avulsos conferidos: série `#eda100 ↔ #2a78d6` (saídas × devoluções): ΔE CVD 31,5 / visão normal 37,5 — **excelente** (azul×amarelo é o par mais seguro que existe para daltonismo; a escolha original da marca estava certa). O amarelo sobre card branco mede 2,17:1 — abaixo de 3:1, o que reforça a regra vigente de rótulos de valor visíveis (já cumprida) e o RV-03.

Para reproduzir/portar: os limiares acima podem entrar como casos novos em `scripts/contraste.mjs` (pares de badge) — e a checagem de ΔE-vizinhos pode virar um script irmão (`scripts/paleta-graficos.mjs`, Node puro, mesmos moldes) se quiserem o portão no CI; opcional, a ordem decide.

---

## 5. Priorização — 3 pacotes

**Pacote 1 — "A cor vira língua + polimento de leitura" (1 fase, só P/M, zero migration, zero query nova):**
RV-02 (paleta, o crítico) · RV-03 (gaps) · RV-01 (cor nos tiles/glossário) · RV-07 (acervo em 1 linha) · RV-04 (chip foto/período) · RV-08 (percentual nos motivos) · RV-13 + RV-14 (chips com spy e contagem) · RV-16 (carimbo de hora) · RV-19 (ícones de grupo + resumo de risco da manutenção) · RV-05 (fim de semana/hoje) · RV-17 · RV-18 · RV-22.
→ É o pacote que entrega o pedido do Johnny ("óbvio de bater o olho, agradável de visualizar") quase inteiro.

**Pacote 2 — "Função nova" (1 fase):**
RV-06 (evolução do estoque — a forma que falta) · RV-12 (clique-para-filtrar) · RV-09 (medidor de falta).
→ Os dois primeiros são os de maior valor percebido; decidir juntos porque tocam o snapshot (campo opcional) e a guarda operador/viewer.

**Pacote 3 — miudezas e opcionais, quando alguma ordem passar perto:**
RV-10 · RV-11 · RV-15 · RV-20 · RV-21 · RV-23 · RV-24.

**Protótipo:** `mockups/relatorio-v3-proposta.html` mostra os Pacotes 1+2 aplicados (dados fictícios, tema claro, tooltips e scroll-spy funcionais) — lado a lado mental com `mockups/dashboard-relatorio.html` (a referência F3). O que o protótipo demonstra: tiles com acento de status, barra única do acervo, paleta corrigida com gaps, chip foto/período, série com hoje/fim-de-semana, evolução do estoque, motivos com %, medidor de falta, chips-âncora com contagem + seção ativa, carimbo de hora, resumo de risco na manutenção.

---

## 6. Minuta de ordem de serviço (para o Johnny colar, se aprovar)

> **F32 — Relatórios v3: cor como língua, leitura de relance e as duas funções novas**
>
> Execute `docs/prompts/F32-relatorios-v3.md` [a criar a partir desta minuta]. Fonte: `docs/ANALISE-RELATORIOS-2026-08-10.md` (esta análise) + protótipo `mockups/relatorio-v3-proposta.html`. Escopo em duas frentes, na ordem:
>
> **Frente A (Pacote 1):** RV-02 → RV-03 → RV-01 → RV-07 → RV-04 → RV-08 → RV-13 → RV-14 → RV-16 → RV-19 → RV-05 → RV-17 → RV-18 → RV-22, exatamente como especificados no §2. Regras transversais: nenhuma contagem de relatório muda; nada novo só em hover (todo sinal tem texto/rótulo persistente); viewer por senha nunca ganha href fora de `/relatorios/**` (o teste de confinamento da F29 deve seguir passando e cobrir os elementos novos); snapshot congelado permanece 100% estático; badges novos com par dark AA e pares registrados em `scripts/contraste.mjs`; impressão conferida (inclusive P&B — RV-24).
> **Frente B (Pacote 2):** RV-06 (série de estado as-of semanal — sem migration nesta fase; campo opcional `serieEstado?` no snapshot v2 mantendo `schema: 2`) → RV-12 (clique-para-filtrar sob a guarda `links`/operador-ao-vivo) → RV-09 (medidor estoque×mínimo; a leitura de itens ganha o `minimo`).
> **Fora do escopo:** tudo do §3; T11; qualquer dependência nova.
> **DoD:** lint/build/testes limpos; testes novos para as funções puras (percentual, chip foto/período, série de estado, URLs do clique-para-filtrar); checklist autoverificado; ata em `docs/DECISOES.md` (inclusive a troca de matiz de `em_triagem`, que muda vocabulário visual — badge + gráfico juntos); ajuda (`relatorio-ao-vivo`) atualizada com as novidades visíveis ao operador e ao visualizador.

---

*Gerado por análise estática do working tree de 10/08/2026 (pós-F31) + medição de paleta por script. Nenhuma tela foi executada contra produção; toda afirmação "hoje é assim" cita arquivo (e linha, quando pontual) conferidos nesta data. Se algo divergir, a causa provável é commit posterior.*
