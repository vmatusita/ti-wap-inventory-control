ultracode

# OS-F17 (ultracode) — CI de banco verde de novo (roteiro da F14 × `troca` da F15) + legendas explicativas no relatório

Ordem **executável e autocontida** (24/07/2026), com duas frentes independentes. **(A)** O job `banco` do CI está VERMELHO — `roteiro supabase/tests/manutencao_fornecedor.sql marcou ✗ (cenário falhou)` — e precisa voltar ao verde pela causa raiz. **(B)** O relatório (ao vivo e snapshots) ganhou semântica visual nas últimas fases (Δ colorido, linhas estornadas esmaecidas, badges de manutenção em quatro cores, pílula "Troca") sem explicar nada disso a quem lê — entram **legendas explicativas** e melhorias de leitura a seu critério. Objetivo em uma linha: CI 100% verde no GitHub e um relatório que **se explica sozinho** para o operador e para o visualizador por senha — sem migration, sem dependência nova e sem mudar nenhum número.

**Modo autônomo com acesso total (CLAUDE.md).** Você roda de forma autônoma: **ninguém vai responder perguntas — não pare para perguntar nem espere confirmação em nenhuma hipótese.** Régua de decisão: (1) esta ordem; (2) spec/CLAUDE.md/convenções do repositório; (3) a opção mais simples e reversível — registrada em `docs/DECISOES.md` (data · contexto · escolha · motivo). Mesma falha após ~3 tentativas → mude de abordagem e registre. Bloqueio real → contorne se for seguro; senão siga com o resto e registre a pendência no relatório.

**Produção e git.** Trabalho **direto na `main`** (precedente F14/F15), commits locais pequenos e frequentes; **push = deploy automático (Vercel)**. Dois marcos de push, nesta ordem: (1) a correção da Frente A **pode ser pushada sozinha** assim que provada — é mudança só de roteiro de teste (`supabase/tests/`) + docs, não muda o app, e destrava o sinal verdadeiro do CI; (2) a Frente B vai no **marco verde final** (§1.4). **Nenhuma migration nesta ordem; nenhum apply em produção.** Proibido sempre: force push, `git reset --hard`, `git clean`, editar migration já aplicada, deletar/pular/enfraquecer teste para passar. Se o classificador barrar um push (precedente F7/0034): não insista — deixe commitado local, relatório completo e a instrução de 2 minutos para o Johnny.

**Dados e segredos.** Nenhum dado real (nome, patrimônio, e-mail) em teste, exemplo, screenshot ou relatório — sempre fictícios (`WAP0001234`/"Fulano"). O único contato com banco nesta ordem é a **prova dos roteiros**, que são `begin; … rollback;` (nada persiste) — no stack local do Supabase CLI ou no projeto de **ENSAIO** (`sgmvldiizsrjbxzzpmhh`, runbook), **nunca no de produção**.

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code na raiz do repositório. O `CLAUDE.md` é lido sozinho e manda sempre.

---

## §0 — Diagnóstico já mapeado (confirme antes de corrigir)

**O sintoma.** O CI é o **GitHub Actions** (`.github/workflows/ci.yml`; a Vercel só faz o deploy — o app em produção não está quebrado por isso). O job `banco` sobe um Postgres pelo Supabase CLI, aplica TODAS as migrations em ordem, cria o operador `ci@wap.ind.br` e roda cada `supabase/tests/*.sql` com `psql`; qualquer `WARNING: ✗` na saída falha a run com exatamente a mensagem vista.

**A causa provável (hipótese forte — confirme reproduzindo).** O roteiro `supabase/tests/manutencao_fornecedor.sql` é da F14 e **não foi atualizado na F15**:

- Cenário **4d** (linhas ~202–204): `select count(*) … where id = v_submov and … tipo = 'compra'` — espera que a movimentação do substituto criada pela RPC `devolver_ao_fornecedor` seja `compra`.
- A migration **`0047`** (F15/C3) mudou exatamente isso: o substituto passou a nascer por **`troca`** — e o roteiro novo `supabase/tests/troca.sql` (cenário C3.1) assevera o comportamento novo, inclusive `count(compra) = 0` para o substituto.
- Ou seja: os dois roteiros exigem comportamentos **opostos** da mesma RPC. Com a `0047` aplicada, o 4d marca `✗ 4d compra do substituto ausente` em toda run, desde o push da F15. O **produto está certo** (spec §7 item 7, Emenda F15; `docs/DECISOES.md` 2026-07-23 · F15); o roteiro é que ficou para trás.

**Regra da correção:** o roteiro se atualiza para o comportamento **vigente** (4d passa a exigir `tipo = 'troca'`), nunca o contrário — e **nenhum cenário é deletado, pulado ou enfraquecido**. Se a reprodução (§A1) mostrar QUALQUER outro `✗` além do 4d — neste ou nos outros 4 roteiros —, todos entram no mesmo tratamento: comportamento vigente confirmado na spec/migrations → roteiro atualizado; comportamento errado de verdade → é bug de produto, aí sim corrija o produto (não é o esperado aqui; se acontecer, registre com destaque).

---

## §1 — Orquestração

### 1.0 GATE de entrada

(a) Working tree **limpo na `main`** e sincronizado com `origin` (este arquivo de ordem, untracked, não conta). Sujo → PARE e reporte. (b) Baseline local verde HOJE: `npm run lint && npm run test && npm run build` (a F16 fechou com 993 testes) — vermelho → PARE e reporte. **O vermelho conhecido do job `banco` no GitHub NÃO trava o gate: ele é o objeto da Frente A.** (c) Inventário de capacidades, registrado no relatório: Docker/`supabase start` disponível? MCP Supabase acessível (ensaio)? `gh` autenticado? A Frente A se adapta ao que existir (§A1). (d) `ls supabase/migrations/` — última conhecida `0048`; se houver mais nova, só anote (esta ordem **não cria migration**).

### 1.1 Grafo

    ONDA 1 (∥, arquivos disjuntos §1.3)      ONDA 2 (orquestrador)
    Frente A (CI banco) ∥ Frente B (legendas) → integração (lint+test+build na união)
                                              → revisão adversarial (5 lentes) → emendas
                                              → re-verificação → rollout §1.4
                                              → docs §1.5 → RELATORIO-F17

### 1.2 Regras globais

1. **Escopo fechado nesta ordem.** O que surgir de fora vira backlog no relatório (CLAUDE.md regra 1).
2. **Zero migration, zero RPC nova/alterada, zero dependência nova** (`package.json` byte a byte igual). Nada de job/serviço novo no CI — o workflow já cobre; o furo da F15 foi de prática, não de pipeline.
3. Convenções CLAUDE.md integrais: pt-BR em UI/erros/commits; Server Components por padrão; `src/components/ui/**` intocado; datas `dd/MM/yyyy`; `tabular-nums`.
4. **Verificação real a cada incremento:** `npm run lint && npm run test && npm run build`; função pura nova → teste Vitest; roteiro SQL → prova §A1. Causa raiz, nunca supressão.
5. **Invariantes:** NENHUMA contagem do relatório muda; nenhum dado muda; snapshots já gerados continuam abrindo; o viewer não ganha href fora de `/relatorios/**`; dashboard não muda de comportamento; import, termos, kits e itens intocados.
6. Commits pt-BR, estilo conventional: `fix(f17): roteiro da manutenção alinhado à troca da F15`, `feat(f17): legendas explicativas no relatório`.

### 1.3 Propriedade de arquivos (disjunta na onda 1)

| Frente | Arquivos |
|---|---|
| **A** | `supabase/tests/**`, `docs/RUNBOOK-BANCO.md` (regra nova §A3) |
| **B** | `src/components/relatorios/**`, `src/lib/relatorios/**`, `src/lib/ajuda/conteudo.ts` (+ teste), `src/app/(app)/relatorios/**` (se precisar), `docs/ESPECIFICACAO.md` §7 (emenda) |
| **Orquestrador** | `docs/DECISOES.md`, `README.md`, `CHANGELOG.md`, `docs/prompts/README.md`, `docs/RELATORIO-F17.md`, push |

Fronteira da B: **não toque** `src/lib/queries/**`/builders de snapshot, a menos que uma melhoria do §B5 exija campo opcional novo — aí `schema: 2` intacto, campo opcional (precedente F16) e registro em DECISOES.

---

## §A — Frente A: o CI de banco volta ao verde

**A1 — Reproduza como o CI, pelo melhor caminho disponível** (registre qual usou):

1. **Docker disponível** → réplica exata do job: `supabase start` e o loop de `psql` do próprio workflow (crie o operador `ci@wap.ind.br` como lá; adapte o loop ao PowerShell se preciso) sobre os 5 roteiros de `supabase/tests/`. Padrão-ouro — use também na re-verificação pós-correção.
2. **Sem Docker, MCP Supabase OK** → prove no projeto de **ENSAIO** via `execute_sql`. Atenção: a ferramenta pode engolir `NOTICE`/`WARNING` — então **não dependa deles**: prove com consultas que retornam **linhas** (ex.: bloco `begin … rollback` que executa o cenário e um `select` final com o `tipo` da movimentação do substituto). Antes, confirme que o ensaio está com as migrations em dia (`list_migrations`); faltando alguma, aplique **no ensaio** (caminho A do runbook — ensaio não é produção).
3. **Nenhum dos dois** → análise estática linha a linha dos 5 roteiros contra as migrations vigentes (`0001`→`0048`) + o CI do push como prova final (§A4). Registre o limite no relatório.

**A2 — Corrija pela causa raiz.** Atualize o cenário 4d (asserção + mensagens ✓/✗ + comentários) para exigir a movimentação do substituto como **`troca`** — mantendo TODAS as demais asserções do cenário 4 (antigo → `devolvido_fornecedor`; substituto `em_estoque` com vínculo; fornecedor herdado; a movimentação existe e aparece nas Entradas — agora rotulada "Troca"). Depois **varra o roteiro inteiro e os outros 4** (`maquina_estados`, `itens_quantidade`, `dominios_login`, `troca`) por qualquer outra asserção defasada frente às `0044`–`0048` e trate igual. Rode a suíte completa de roteiros até **zero ✗**.

**A3 — Prevenção (barata, textual).** No `docs/RUNBOOK-BANCO.md`, uma regra nova e curta: **mudou função/trigger/máquina de estados → rode TODOS os roteiros de `supabase/tests/` antes do push, não só o novo** (foi exatamente o furo da F15: `lint`+`test`+`build` verdes não executam os roteiros SQL — só o job `banco` no GitHub executa). Ata em `docs/DECISOES.md` (por que quebrou, por que a correção é no roteiro, a regra nova).

**A4 — Prova no mundo real.** Push da Frente A (só `supabase/tests/**` + docs — pode ir na frente, ver preâmbulo). Depois: com `gh` autenticado → `gh run watch` / `gh run list --workflow CI --limit 1` até a run do commit ficar **verde** (cole a evidência no relatório); sem `gh` → pendência registrada com o link da aba Actions para o Johnny conferir num clique.

**Aceite A (autoverifique item a item):**
- [ ] Os 5 roteiros terminam **sem `WARNING ✗`** num Postgres com TODAS as migrations aplicadas (prova pelo caminho 1 ou 2; ou análise + CI verde no caminho 3).
- [ ] Nenhum cenário deletado, pulado ou enfraquecido; o 4d continua exigindo a movimentação do substituto — agora como `troca`.
- [ ] Run do GitHub Actions verde (job `banco` incluso) **ou** pendência com link registrada.
- [ ] Runbook com a regra nova + ata em DECISOES.

---

## §B — Frente B: o relatório que se explica sozinho

**Por que legendas:** o leitor mais importante do relatório — o **visualizador por senha** — não tem acesso ao `/ajuda` (rota de operador). Toda a semântica visual das F14–F16 chega a ele sem explicação: Δ verde/vermelho/cinza, linha esmaecida "estornada", badge âmbar × vermelha × verde × cinza da manutenção, pílula "Troca" nas Entradas, "Guardados" vs "Em estoque" (o MESMO número com dois nomes), "Reserva técnica". As legendas moram **dentro do relatório**, para as duas audiências, no ao vivo **e** nos snapshots — **antigos inclusive**: legenda é render, não dado (espelho da decisão F16 sobre a cor do Δ). Alvo primário = componentes v2 (ao vivo + snapshots v2); o corpo v1 (snapshots pré-F3B) não regride e ganha de graça o que vier pelos componentes compartilhados — registre a decisão.

**Princípios de forma (valem para todas):** discretas (`text-xs text-muted-foreground`, o padrão das legendas de série que já existem em `grafico-mov-serie.tsx` e `barras-empilhadas.tsx`); **nunca só em hover/tooltip** (mobile e impressão precisam ler); condicionais quando o gatilho é condicional; textos centralizados em constantes/funções puras **testadas** em `src/lib/relatorios/` — nada de string repetida em cinco arquivos.

**B1 — Legenda do Δ dos KPIs.** Junto ao primeiro bloco de KPIs (e onde mais fizer sentido sem poluir): Δ = variação vs período anterior; a **cor tem sentido por indicador** (verde = melhorou, vermelho = piorou, cinza = neutro — ex.: "Em manutenção" subir é vermelho). Renderiza só quando há Δ na tela (dashboard e snapshots v1, sem `kpisAnterior`, não mudam).

**B2 — Nota de estorno nas tabelas detalhadas.** Onde houver ao menos uma linha estornada visível: "linha esmaecida = movimentação estornada depois (a contagem do período continua incluindo a original)". É a comunicação honesta do achado F16 §3 — **sem mudar contagem nenhuma**. Vale também para a tabela de movimentações de itens (lá com o par estorno/estornado).

**B3 — Legenda dos badges de manutenção.** No card "Em manutenção, caso a caso": âmbar = em andamento · vermelho = parado há 30+ dias · verde = voltou · cinza = devolvido ao fornecedor (sem conserto; o substituto, quando houve, entra nas Entradas como "Troca"). Decida se mostra sempre ou só os estados presentes nos casos exibidos — e registre.

**B4 — "Como ler este relatório" (glossário).** Seção recolhível (reuse `GrupoColapsavel`; decida posição e se ganha chip-âncora) com uma linha por termo: os 7 KPIs + "Guardados (= Em estoque)" e "Emprestados"; o que conta como **Saída** (saída + empréstimo), **Entrada** (devolução + compra + **troca** — troca = substituto entregue pelo fornecedor, não é compra), **Transferências** (aparecem nas DUAS filiais); "estoque no último dia do período" (as-of); **estorno** (§8 regra 6). Derive os textos de `src/lib/dominio.ts`/constantes novas, com função pura + teste que trava a cobertura (todo status de `STATUS_ORDEM` visível no relatório tem verbete). Impressão: decida se imprime aberto ou fechado — o critério é o papel continuar útil — e registre.

**B5 — Melhorias a seu critério (menu, não obrigação).** Régua: só **leitura/explicação**; nada muda número, dado, RPC ou schema. Candidatas mapeadas (escolha o que agrega; registre o que descartou e por quê): empty-state com busca/filtro ativo dizendo "nenhuma … encontrada" em vez de "no período" (pendência anotada da F16 §8 — hoje Saídas/Entradas erram); subtítulo explicativo nos tiles do grupo (`GRUPO_TILES` hoje não tem `sub`, os principais têm); período por extenso perto do título, se ainda não estiver óbvio; `title`/`aria-label` nos ícones das badges; rodapé "dados até dd/MM" onde o snapshot já carrega a informação. **FORA (adiado por decisão do Johnny — não reabra):** contagens × estornadas, snapshot automático da sexta, motivo da regeração, selo "repor" no relatório, T11 (definições de semana), T12 (next-themes), export/HTML autocontido.

**Transversal B:** ajuda do operador (`src/lib/ajuda/conteudo.ts` + teste) menciona legendas/glossário; spec §7 ganha "(Emenda F17)" nos pontos tocados.

**Aceite B (autoverifique item a item):**
- [ ] Cada legenda visível para operador **e** viewer, no ao vivo **e** num snapshot antigo (estática — sem depender de campo novo).
- [ ] Impressão sem regressão: legendas essenciais imprimem; nenhum elemento fantasma (precedente do achado da lente 4 na F16); 375px sem scroll lateral novo; contraste AA claro/escuro.
- [ ] **Nenhum href novo para o viewer; nenhuma contagem alterada; dashboard intacto.**
- [ ] Textos das legendas em constantes/funções puras com Vitest; contagem de testes **só sobe** (993 → mais); nenhum teste deletado/enfraquecido.
- [ ] Empty-state das buscas corrigido nas tabelas pendentes (se mantido no menu B5).

---

### Revisão adversarial (entre integração e rollout)

Cinco lentes independentes em contexto fresco, **refutação por padrão**, apontando só lacuna de correção/requisito (não estilo): (1) fidelidade dos roteiros SQL ao comportamento vigente do banco `0001`→`0048` — algum ✓ que passa por coincidência? alguma asserção enfraquecida?; (2) viewer/RLS — nenhum href novo, nenhum vazamento de seção de operador; (3) compatibilidade v1/v2 e snapshots antigos; (4) mobile 375px + impressão (elemento fantasma, quebra de página, legenda ilegível); (5) contagens e regressão (nenhum número mudou; dashboard intacto; testes não enfraquecidos). Achado real → corrija → re-revise até limpar.

### 1.4 Rollout (orquestrador)

1. União verde local (`lint`+`test`+`build`) + prova §A1 sem ✗.
2. Push (a Frente A pode já ter ido; o restante vai agora). A Vercel publica sozinha — confira deploy **READY** e `get_runtime_errors` limpo (MCP Vercel, padrão F15/F16).
3. Actions verde (§A4).
4. Smoke leve: rotas públicas respondem (parte A do `scripts/smoke/smoke-prod.mjs`); sem credencial de smoke → registre a pendência, como na F16.

### 1.5 Documentação e relatório final

- `docs/DECISOES.md` — ata F17: causa raiz do CI, regra nova do runbook, decisões de forma das legendas, menu B5 (feito × descartado).
- `README.md` — status F17; e a linha do CI que ainda diz "0001→0043": troque por texto que não apodrece (ex.: "todas as migrations").
- `CHANGELOG.md` — entrada F17.
- `docs/prompts/README.md` — acrescente as linhas **F16 e F17** à tabela (a F16 está faltando).
- `docs/RELATORIO-F17.md` em pt-BR: o que mudou e por quê, por frente; **evidências reais coladas** (saídas de lint/test/build, prova dos roteiros com os ✓, link/estado da run do Actions, exemplo textual das legendas); pendências; seção "o que este relatório NÃO prova" (padrão F12–F16 — ex.: E2E autenticado barrado pelo login wall).
- Resposta final no chat: resumo de ~10 linhas em pt-BR com os aceites A e B **autoverificados item a item**.

# Idioma

Narrativa, decisões, relatório e UI em pt-BR; identificadores de domínio em português sem acento e utilitários em inglês (convenção do repo); commits em pt-BR, estilo conventional.
