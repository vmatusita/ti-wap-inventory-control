# Planejamento de Desenvolvimento — Estoque TI WAP

**v1.0 · 09/07/2026 · Victor Matusita (Johnny) + Claude**

A [`ESPECIFICACAO.md`](./ESPECIFICACAO.md) define **o quê** o sistema é. Este documento define **como e em que ordem** ele será construído. Nenhuma linha de código antes deste plano ser validado pelo Johnny.

---

## 1. Princípios do plano

1. **Nenhum dado real até a F4.** Desenvolvimento, testes e demonstrações rodam com dados fictícios de estrutura idêntica à real. Os dados reais só entram quando a WAP quiser, pelo importador dentro do próprio sistema — não existe "fase de migração" fora do app, nem sincronização automática com planilhas.
2. **Demonstrável cedo.** Cada fase termina com algo clicável; na F3 já dá para mostrar os relatórios para quem recebe o e-mail hoje, sem ter exposto nenhum dado real.
3. **Uma pessoa desenvolvendo.** Fases pequenas, sem dependência cruzada, com critério de pronto objetivo — dá para parar e retomar sem se perder.
4. **O banco protege as regras, a UI só facilita.** Validações críticas (máquina de estados, permissões) vivem no Postgres; se a interface tiver bug, o dado não corrompe.
5. **Custo R$ 0 para a empresa.** Só serviço em plano gratuito ou já pago pelo Johnny (a conta Vercel Pro dele); nenhuma biblioteca com licença comercial. Detalhes na seção de custos.

## 2. Stack fechada

| Peça | Escolha | Papel | Por quê |
|---|---|---|---|
| Framework | **Next.js 16 (App Router, Turbopack) + React 19 + TypeScript (strict)** | Rotas, páginas, Server Components/Actions | Linha **16.2.x** é a atual (16.2 lançado em mar/2026; conferido em 09/07/2026) — Turbopack padrão, dev muito mais rápido; leitura sempre-fresca casa com relatórios |
| Estilo | **Tailwind CSS v4** | Utilitários de CSS | Preferência do Johnny; par natural do shadcn |
| Componentes | **shadcn/ui** (sobre Radix) | Tabela, form, dialog, select, toast… | Componentes prontos e acessíveis, sem lock-in (código fica no repo) |
| Gráficos | **Recharts v3** via componente `chart` do shadcn | Barras, donut, KPIs do relatório | Análise completa na §2.1 — o `chart` do shadcn usa Recharts v3 por baixo (confirmado na doc oficial); cobre 100% dos gráficos da spec §7 |
| Backend | **Supabase** (Postgres 15+, Auth, RLS, Realtime, Storage) | Banco, login por convite, permissões, tempo real | Decisão confirmada em 09/07; free tier comporta o volume; MCP já conectado |
| Cliente do banco | **@supabase/supabase-js + @supabase/ssr** | Acesso ao Postgres no server e no client | Padrão oficial p/ App Router; respeita RLS por sessão |
| Tipos do banco | **Supabase CLI → `gen types`** | Tipos TS gerados do schema | Uma fonte de verdade (o banco); sem ORM duplicando modelo |
| Validação | **Zod + react-hook-form** | Schemas de formulário e Server Actions | Mesma definição valida no navegador e no servidor |
| Tabelas ricas | **TanStack Table** (via data-table do shadcn) | Lista de ativos/movimentações com filtro, ordenação, paginação | Padrão maduro; o data-table do shadcn já vem montado sobre ele |
| CSV | **PapaParse** | Ler as planilhas no importador (F4) e exportar CSV | Robusto com encoding/delimitador `;` dos arquivos reais |
| Datas | **date-fns** (locale pt-BR) | Formatação e contas de data | Leve, tree-shakeable |
| Deploy | **Vercel** — conta **Pro já paga do Johnny** | Produção + preview por branch | O Hobby gratuito é restrito por fair use a uso pessoal **não-comercial** e não serve para sistema de empresa; o Pro dele cobre sem custo novo |
| Qualidade | **ESLint + Prettier**; **Vitest** pontual | Lint/format; teste unitário só onde há lógica pura | Testar o que quebra de verdade: normalização de patrimônio e mapeamentos De→Para |

### 2.1 Gráficos: Recharts × alternativas (análise pedida em 09/07)

O que os relatórios precisam (spec §7): barras (mensal, motivos), listas ordenadas por valor, KPIs, donut opcional, tooltip, tempo real e export. Não precisam de mapa, milhões de pontos nem drill-down infinito.

| Biblioteca | Licença/custo | Ponto forte | Veredito para este projeto |
|---|---|---|---|
| **Recharts v3** ✅ | MIT, grátis | É a base do componente `chart` do shadcn — mesmo design system do resto do app; API React declarativa; v3 atual e ativa | **Escolhida.** Cobre 100% dos gráficos da spec com o menor custo de manutenção para um dev solo |
| Apache ECharts | Apache-2.0, grátis | O mais próximo de Power BI em interação: dataZoom, brush, drill-down, toolbox de export, datasets enormes | Poder que a spec não pede hoje; exige wrapper React, tema manual fora do shadcn e bundle maior. **Upgrade natural na F5** se pedirem exploração interativa pesada |
| Tremor (Vercel) | Apache-2.0, grátis | Blocos de dashboard prontos (KPI, bar list) | Usa Recharts por baixo; o `chart` do shadcn + nossos componentes já cumprem o mesmo papel |
| Nivo | MIT, grátis | Visual bonito por padrão, muitos tipos | Tema próprio ao lado do shadcn = dois design systems no mesmo app, sem ganho real |
| Chart.js | MIT, grátis | Canvas, rápido | Menos "React-way"; integrar tooltip/tema custa mais |
| Highcharts / AG Charts / MUI X Charts Pro | **Licença comercial paga** | O visual mais "BI de caixinha" | **Fora** pela regra de custo zero |

**Conclusão:** a sensação "Power BI" que as filiais vão ter vem menos da biblioteca e mais da UX que já está na spec — filtros de período/filial, KPIs, clique-para-ver-a-tabela, tempo real e export. Recharts entrega isso integrado ao shadcn. Se um dia pedirem zoom/brush/drill-down de verdade, troca-se **um gráfico específico** por ECharts (os dados vêm das mesmas views do banco) — mudança localizada e ainda R$ 0.

### O que fica de fora (e por quê)

- **Prisma / Drizzle** — redundante: o modelo vive no Postgres (migrations SQL + RLS + trigger) e os tipos vêm do `gen types`. Um ORM aqui só duplicaria o schema. (O plugin Prisma local instalado não será usado neste projeto.)
- **Redux / Zustand / TanStack Query** — o estado do servidor chega via Server Components e Realtime; estado local de formulário fica no react-hook-form. Se surgir necessidade real de cache no cliente, reavalia-se na F5.
- **Power BI** — descartado na v1 (decisão de 09/07, spec §7); o Postgres fica aberto para conexão futura.
- **Highcharts, AG Charts, MUI X Charts Pro** — as opções mais "Power BI de caixinha" têm **licença comercial paga**; violam a regra de custo zero.
- **Apache ECharts** — gratuito (Apache-2.0) e o mais próximo de Power BI em interatividade, mas fica fora da v1 por complexidade, não por custo (§2.1); documentado como upgrade da F5.
- **Monorepo / Turborepo** — é um app só.
- **i18n** — sistema interno, só pt-BR.
- **Testes E2E (Playwright) desde o início** — custo alto para uma pessoa; entra na F5 se o sistema virar crítico. Até lá: Vitest nas funções puras + teste manual guiado pelo critério de pronto.
- **Docker / infra própria** — Supabase e Vercel gerenciam tudo; ambiente local usa o Supabase CLI (`supabase start`) só se necessário.

### Custos — regra: R$ 0 para a empresa (números conferidos em 09/07/2026)

| Serviço | Plano | Custo novo | Observações |
|---|---|---|---|
| Supabase | **Free** | R$ 0 | 500 MB de banco (anos de folga p/ ~1,2k ativos), Auth até 50k usuários, Realtime 200 conexões simultâneas e 2M mensagens/mês, 1 GB de storage, **2 projetos gratuitos** — exatamente o que o plano usa: produção + ensaio do importador. **Pausa após 1 semana sem requisição**: religa no painel em segundos; com uso diário não acontece |
| Vercel | **Pro (conta que o Johnny já paga)** | R$ 0 | O Hobby gratuito é restrito por fair use a **uso pessoal não-comercial** — não serve para sistema interno de empresa. Como o Pro já está pago, nada muda no bolso |
| Next.js 16, shadcn/ui, Recharts, Zod, TanStack Table, PapaParse, date-fns | open source | R$ 0 | Licenças MIT/Apache — nenhuma licença comercial em nada do projeto |
| Upgrade futuro (opcional) | Supabase Pro US$ 25/mês | só se a WAP pagar | Backup diário gerenciado, sem pausa por inatividade, mais compute — **não é pré-requisito de nada** neste plano |

Ponto de atenção (também no checklist da seção 8): produção em contas do Johnny (Vercel Pro pessoal + Supabase Free) custa zero e funciona, mas cria dependência dele — fica documentado como risco de continuidade.

## 3. Estratégia de dados (a decisão que organiza o plano)

```
 F1 ────────────── F3          F4                depois
 [ seed fictício ]──► demo ──► [reset] ──► [carga ÚNICA via scripts] ──► operação 100% manual
                                                │
                                                └─ relatório de inconsistências p/ revisão
```

1. **Dev/demonstração (F1–F3):** seed **fictício e determinístico** — ~1.200 ativos nas proporções reais (42% notebooks, 28% celulares, 25% monitores, 4% desktops, 1,5% tablets; ~70% em uso, ~5% em estoque, ~10% reserva técnica…), ~700 movimentações espalhadas por 7 meses com sazonalidade parecida, 5 filiais, nomes de pessoas **gerados** (nenhum colaborador real), chamados e termos variados, incluindo casos-limite de propósito (ativo sem patrimônio, devolução com itens faltantes, triagem parada). Gráficos ficam com cara de verdade e a demo não expõe ninguém.
2. **Go-live (F4):** reset do seed → o Johnny roda os **scripts de carga** (`scripts/import/`) com os 3 CSVs: dry-run → relatório de inconsistências → carga em ordem cronológica recalculando os estados. Idempotente dentro da janela do go-live. **Sem tela — decisão de 09/07/2026: o sistema não tem importação.**
3. **Ensaio geral antes do go-live:** rodar o importador com as planilhas reais **em projeto Supabase de teste** (sem carga na produção) para calibrar os De→Para da spec §5 com zero risco.
4. **Depois do go-live:** planilhas viram só-leitura (cutover); os scripts ficam no repositório apenas como ferramenta de emergência. A única entrada de dados passa a ser a **operação manual** — que é o produto: mais prática que o Excel (facilitadores da F2 e kits da F5).

## 4. Fases detalhadas

**Execução: cada fase é uma ordem de serviço rodada no Claude Code** (ver seção 9 e `docs/prompts/`). As estimativas abaixo em "sessões de ~2–3h" foram feitas pensando em codar à mão; com o Claude Code executando, cada fase tende a virar **1–3 rodadas de prompt + o tempo do Johnny revisando e testando os critérios de aceite** — o esforço total cai bastante, mas os critérios de pronto continuam exatamente os mesmos (quem aceita é o Johnny, não o Claude).

### F0 — Fundação (4–5 sessões)
- **Entrega:** repositório organizado, Next.js + Tailwind + shadcn instalados, projeto Supabase criado, login por convite funcionando (admin convida → pessoa recebe e-mail → define senha → entra como **operador**; e-mails só `@wap.ind.br`, validado também no banco), layout base (sidebar, header, tema claro), deploy na Vercel com variáveis de ambiente.
- **Fora do escopo:** qualquer tela de dados.
- **Pronto quando:** duas contas de operador logam **em produção** e veem o layout vazio; convite fora de `@wap.ind.br` é recusado.

### F1 — Banco + dados fictícios (3–4 sessões)
- **Entrega:** `schema.sql` revisado e quebrado em migrations versionadas; tipos TS gerados; **script de seed fictício** (item 3.1) com reset; views de relatório respondendo.
- **Fora do escopo:** telas.
- **Pronto quando:** seed roda e resseta com um comando; `v_estoque_atual` e `v_movimentacoes_mes` retornam os números do seed; a anon key sem sessão não lê nada (teste manual de RLS).

### F2 — Operação (7–8 sessões)
- **Entrega:** lista de ativos (busca + filtros filial/categoria/status), ficha do ativo com linha do tempo, **nova movimentação** (fluxo rápido, em lote — notebook+monitor+celular do mesmo chamado de uma vez), estorno, validações Zod espelhando a máquina de estados, e os **facilitadores anti-Excel** (data default, atalho `N`, "repetir última", "duplicar" da linha do tempo).
- **Fora do escopo:** relatórios, importador, admin de usuários.
- **Pronto quando:** o ciclo compra → saída → devolução → triagem → estoque é registrável de ponta a ponta na interface, com os erros certos ao tentar transições inválidas.

### F3 — Relatórios (5–6 sessões)
- **Entrega:** `/relatorios/[filial]` + consolidado, com tudo da spec §7: KPIs, movimentações por mês, disponíveis por modelo, reservados com chamado, manutenção caso a caso, motivos, pendências, últimas movimentações (com observações), resumo do período no formato do e-mail, export CSV/impressão. Realtime atualizando a página aberta. **+ Relatório gerado da semana** (spec §7.1): snapshot interativo congelado e versionado, com histórico — o clique que substitui o ritual de sexta-feira. **+ Acesso por senha** (spec §3): visualizador entra sem conta (senha → cookie assinado; gestão de senhas com rótulo e revogação em `admin/senhas`; auto-refresh de 60 s no lugar do realtime). (O mockup `mockups/dashboard-relatorio.html` é a referência visual.)
- **Fora do escopo:** acessórios por quantidade (F5).
- **Pronto quando:** demo com dados fictícios validada com 2–3 pessoas que recebem o e-mail hoje (inclusive de filial).

### F4 — Carga inicial + go-live (4–6 sessões)
- **Entrega:** scripts de carga única em `scripts/import/` (parse cp1252/`;` → normalização De→Para → **dry-run com relatório de inconsistências** → carga idempotente com guardas anti-acidente), ensaio completo com as planilhas reais no projeto de ensaio, go-live na produção com aprovação explícita e cutover. **Nenhuma tela nova** — o sistema não tem importação (decisão de 09/07/2026).
- **Pronto quando:** números no sistema batem com as planilhas reais (1.179 ativos, 423 saídas, 291 devoluções, menos duplicatas tratadas); inconsistências revisadas pelo Johnny; planilhas marcadas como só-leitura; e-mail de equipamentos principais aposentado; `grep importador src/` = zero.

### F5 — Refino (contínuo, priorizado pelo uso)
Acessórios/componentes por quantidade (fecha a 2ª metade do e-mail semanal) · alertas de pendência · resumo semanal automático por e-mail (opcional) · backup CSV agendado · upload dos termos assinados (Storage) · dark mode · testes E2E se fizer sentido.

## 5. Ordem de construção das telas (dentro de F2–F3)

1. Lista de ativos (é a base de tudo e valida o data-table)
2. Ficha do ativo + linha do tempo
3. Nova movimentação (a tela mais importante — meta: registrar em ≤30s)
4. Home/dashboard (KPIs simples reaproveitando as views)
5. Relatório por filial ao vivo + geração do snapshot semanal (o produto para as filiais)
6. Administração (convites, filiais, motivos)
7. — (a F4 não cria telas: a carga inicial é via scripts, fora do app)

## 6. Definição de pronto (vale para toda fase)

- Build passa sem warning de TypeScript; lint limpo.
- RLS verificada: anon sem sessão não lê nem escreve; cookie de visualização (a partir da F3) não abre rota de operação.
- Tela funciona em notebook e celular (as filiais vão abrir no celular).
- **Nenhum dado real** em código, seed, fixture ou screenshot no repositório.
- Migration versionada para qualquer mudança de banco; nada aplicado "na mão" na produção.
- Commit com mensagem descritiva; deploy de preview conferido na Vercel.

## 7. Riscos deste plano

| Risco | Mitigação |
|---|---|
| Seed fictício não representar a sujeira real → carga quebrar no go-live | Ensaio geral na F4 com as 3 planilhas reais em projeto de teste (dry-run obrigatório); casos-limite reais (patrimônio N/A, duplicatas, typos) incluídos de propósito no seed |
| Validar visual só no fim | Demo da F3 com dados fictícios para quem recebe o e-mail hoje, antes de investir na F4 |
| Disponibilidade do Johnny (projeto nas horas vagas) | Fases curtas com pronto objetivo; qualquer fase concluída já se sustenta sozinha |
| Perguntas da spec §13 travarem o início | Nenhuma trava a F0/F1: filiais são cadastro flexível e o seed é fictício. As respostas só são obrigatórias antes da F4 (convites e filiais reais) |
| Projeto Supabase Free pausar (1 semana sem requisição) numa semana parada | Religar no painel leva segundos e nada se perde; a partir do go-live o uso é diário; se incomodar, ping semanal agendado entra na F5 |
| Sistema rodando em contas pessoais (Vercel Pro do Johnny, Supabase no e-mail dele) | Risco de continuidade aceito em troca do custo zero; documentar acessos e definir plano B no checklist §8 (transferir projeto é suportado pelas duas plataformas) |

## 8. Checklist antes de começar a F0

- [ ] Johnny valida este planejamento (e a spec v1.1)
- [x] Ordens de serviço F0–F5 geradas em `docs/prompts/` + `CLAUDE.md` na raiz do repo (09/07/2026)
- [ ] Responder as 7 perguntas da spec §13 (nenhuma trava a F0, mas a nº 1 — filiais — e a nº 3 — convites — precisam de resposta até a F4)
- [x] Vercel: deploy na conta **Pro já paga do Johnny** (definido em 09/07 — o Hobby gratuito não permite uso comercial)
- [ ] Supabase: criar os 2 projetos Free (produção + ensaio) em qual conta — e-mail pessoal do Johnny ou corporativo @wap.ind.br?
- [ ] Repositório: GitHub pessoal ou organização da WAP?
- [ ] Nome do sistema (working title: "Estoque TI WAP")

Validado isto, a F0 começa: abrir o Claude Code no repositório e colar `docs/prompts/F0-fundacao.md` (o projeto Supabase de dev eu posso criar pela integração já conectada aqui, antes de você rodar a ordem).

## 9. Execução das fases com Claude Code

Decisão de 09/07/2026: **cada fase é executada pelo Claude Code**, guiado por uma ordem de serviço extremamente detalhada — estilo engenheiro passando ordem para o pedreiro: o que ler antes, o que construir com caminhos exatos, o que é proibido, como provar que ficou pronto.

**As peças:**

- **`CLAUDE.md` (raiz do repo)** — as regras permanentes que o Claude Code lê automaticamente em toda sessão: stack travada, convenções, estrutura de pastas prescrita, "nunca dados reais", "custo zero", git. É o que garante consistência entre sessões independentes.
- **`docs/prompts/F0…F5`** — uma ordem de serviço por fase, autocontida, no formato fixo: **0)** pré-requisitos verificáveis (se falhar → parar), **1)** objetivo, **2)** escopo proibido, **3)** tarefas numeradas com caminhos e comportamentos exatos, **4)** critérios de aceite que o *Johnny* confere, **5)** formato da entrega (branch, commits, resumo com checklist).
- **`docs/prompts/README.md`** — o fluxo de uso passo a passo.

**O ciclo de cada fase:** conferir que a anterior fechou → colar a ordem no Claude Code → ele executa (e tem instrução explícita de PARAR e perguntar diante de ambiguidade) → entrega resumo com checklist → **Johnny testa item por item** → merge na `main` → marca no README. Uma ordem por sessão, nunca duas.

**Princípios embutidos em toda ordem:** proibido inventar escopo ("aproveitar e fazer"); proibido dado real e recurso pago; APIs de integração sempre conferidas na doc oficial atual (Context7) em vez de memória do modelo; `lint` + `build` limpos antes de encerrar; quem dá o aceite é o engenheiro (Johnny), nunca o pedreiro.

**Manutenção das ordens:** se o repositório mudar fora do fluxo (ajuste manual, decisão nova), a ordem da fase seguinte deve ser atualizada ANTES de rodar — prompt desatualizado constrói errado. As ordens F2–F4 assumem a estrutura de pastas prescrita no CLAUDE.md; cada uma começa verificando os pré-requisitos justamente para pegar esse tipo de desvio.
