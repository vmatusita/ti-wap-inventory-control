# RELATÓRIO F32 — Relatórios v3: a cor virou língua, o clique virou atalho, o estoque ganhou curva

> Ordem: `docs/prompts/F32-relatorios-v3-ultracode.md` · Fonte: `docs/ANALISE-RELATORIOS-2026-08-10.md` (§2 os 24 achados, §4 as medições de cor) · Plano: `docs/PLAN-F32.md` · Protótipo: `mockups/relatorio-v3-proposta.html`
> Executada em 10/08/2026, modo autônomo. **11 commits**, 75 arquivos, +5.279/−229 linhas. Nenhuma migration, nenhuma dependência nova.

---

## 1. Baseline medido antes de editar

| Comando | Antes | Depois |
|---|---|---|
| `npx vitest run` | 108 arquivos · **2.347** testes · 0 falha | 122 arquivos · **2.505** testes · 0 falha |
| `npm run lint` | limpo | limpo |
| `npx tsc --noEmit` | limpo | limpo |
| `npm run build` | compila | compila (33,2 s) |
| `npm run contraste` | exit 0 | exit 0 (10 pares novos, todos `exigir`) |

+158 testes, todos de função pura nova ou de guarda estática — nenhum teste foi afrouxado, desabilitado ou apagado.

## 2. Como a fase foi executada

Quatro frentes na ordem A → B → C → D, com `lint` + `test` verdes entre uma e outra, exatamente como a ordem prescreveu. Dentro de cada frente, agentes paralelos com **dono exclusivo por arquivo** declarado antes de lançar (a receita da F28), e `corpo-relatorio-v2.tsx`, `corpo-relatorio.tsx`, as rotas e os arquivos de teste de guarda reservados ao orquestrador. **Zero colisão de escrita** em 16 agentes de implementação.

O que a exploração inicial (6 leitores paralelos) corrigiu na leitura da análise está no §1 do `PLAN-F32.md`; o achado mais útil foi que **a tabela de Entradas já tinha filtro por motivo**, o que dispensou metade do trabalho previsto no RV-12a.

## 3. Checklist RV-01..RV-24 — autoverificado

| # | Item | Estado | Evidência |
|---|---|---|---|
| RV-01 | Mesma cor de status em toda superfície | ✅ | `acentoDoTile()` em `kpi-tiles.tsx` (barra de 3px, `total` sem acento); swatch nos verbetes com `status` em `legendas.tsx`; nenhum fundo saturado |
| RV-02 | Paleta corrigida por medição | ✅ | 3 hex em `STATUS_CHART_COLOR` + badge rosa em `STATUS_META`; `rotulo-grafico.test.ts` remedido (a triagem virou o rótulo de preto para branco por 0,03) |
| RV-03 | Gap de 2px entre marcas coladas | ✅ | `stroke="var(--card)" strokeWidth={2}` em `barras-empilhadas`, `grafico-mov-serie`, `barras-divergentes` e `barra-acervo` |
| RV-04 | Chip foto × período | ✅ | `janela`/`periodoJanela` em `card-relatorio.tsx` + `janela-card.ts` (13 testes); 12 cards ligados; verbete "Foto × período" no glossário |
| RV-05 | Fim de semana e "hoje" na série diária | ✅ | `calendario-serie.ts` (10 testes); tick atenuado só quando `granularidade === 'dia'`; balde de hoje a 55% + nota "hoje, parcial"; gateado pela prop de rota `aoVivo` |
| RV-06 | Evolução do estoque | ✅ | `serie-estado.ts` (11 testes) + `getSerieEstado()` + `SerieEstadoGrafico`; campo opcional `serieEstado?`, `schema` segue 2 |
| RV-07 | Acervo por situação (1 barra) | ✅ | `acervo.ts` (6 testes, um deles prova que o total = soma dos totais das categorias) + `barra-acervo.tsx`; entre os tiles e o resto |
| RV-08 | Percentual nos motivos | ✅ | `percentual.ts` (14 testes); rótulo "219 · 52%" com o % em `fill-muted-foreground`; tooltip repete; soma zero → sem % |
| RV-09 | Medidor estoque × mínimo | ✅ | `medidor-minimo.ts` (18 testes) + `medidor-minimo.tsx`; `minimo?` opcional em `SaldoItemPeriodo`; item sem mínimo não ganha medidor |
| RV-10 | Divergentes: eixo responsivo | ✅ | `useEstreito` extraído para módulo próprio; 110 → 150px no desktop, corte de 18 → 24 caracteres; nome cheio confirmado no cabeçalho do tooltip (`dataKey="item"` nunca é o truncado) |
| RV-11 | Resumo de transferências | ✅ | `transferencias-resumo.ts` (7 testes, um prova que a soma dos pares = nº de linhas); só no consolidado; reusa `ChipsResumo` |
| RV-12 | Clique-para-filtrar | ✅ | `cliques-grafico.ts` (15 testes) + `recorteFilialAtivos` extraído de `kpi-links.ts`; gate duplo (`links` na página **e** no corpo); `aria-label` por alvo; nota persistente por card; `confinamento-viewer.test.ts` cobre o caminho novo |
| RV-13 | Scroll-spy nos chips | ⚠️ | `IntersectionObserver` implementado em `chips-ancora.tsx` (nunca handler de scroll) — **não pôde ser exercitado** no ambiente (ver §11) |
| RV-14 | Contagem nos chips | ✅ | `ancora-contagem.ts` (6 testes); estruturais (Principais/Resumo/Observações/Como ler) sem número — conferido no DOM |
| RV-15 | Legenda interativa | ✅ | `serie-isolada.ts` (7 testes); medido no DOM: clique põe `aria-pressed=true` e leva a outra série a `opacity: 0.25`; clique de novo restaura |
| RV-16 | Carimbo "atualizado às HH:mm" | ✅ | `carimbo-hora.ts` (7 testes); texto persistente nos dois componentes; sem `print:hidden` (sai no papel) |
| RV-17 | Viewer lembra a filial | ✅ | `relatorio-visitado.ts` (21 testes) + `useSyncExternalStore` em `viewer-nav.tsx`; validação na LEITURA, provada com 17 entradas hostis no teste de confinamento |
| RV-18 | Porta da senha | ✅ | `autoComplete="current-password"` + "Não tem a senha? Peça à TI da WAP." (texto, sem link) |
| RV-19 | Ícones de grupo + resumo de risco | ✅ | `icone` (chave) em `GrupoColapsavel`; `resumo-manutencao.ts` (9 testes) — partes zero somem, o "30" vem da constante |
| RV-20 | GrupoKpis rebaixado | ✅ | `bg-muted/40` sem borda, valor `text-lg`; o acento sobreviveu porque `borderTopStyle` passou a ser explícito |
| RV-21 | `--chart-1..5` = escala da casa | ✅ | `globals.css` nos dois blocos (`:root` e `.dark`); régua registrada em `ARQUITETURA.md` |
| RV-22 | Figuras proporcionais | ✅ | `tabular-nums` removido só do valor grande de `KpiTiles`/`GrupoKpis`; Δ, rótulos e colunas de tabela intactos |
| RV-23 | Total no tooltip das empilhadas | ✅ | rodapé "Total · N" via `formatter`, dentro da caixa do tooltip |
| RV-24 | Impressão P&B | ⚠️ | Auditado **estruturalmente**, não visto em preview (ver §11). A revisão adversarial achou aqui um defeito real e ele foi corrigido — ver §5, achado 3. Nenhuma hachura foi acrescentada. |

**24/24 implementados.** Dois (RV-13 e RV-24) com verificação visual pendente, declarada.

## 4. O que a medição desmentiu

1. **A tabela de Entradas já filtrava por motivo** (`tabela-entradas.tsx`) — a ordem previa acrescentá-lo "se não tiver".
2. **`STATUS_CHART_COLOR.em_uso` não é hex**, é `var(--color-brand-azul)`. Nada a fazer, mas isso importa: `fillRotuloSegmento` só converte hex e os tokens que ele lista, e cor nova fora dessa lista cai em luminância 0 e escolhe o rótulo errado em silêncio.
3. **A análise supôs que `<Cell>` seria o caminho para variar opacidade por barra.** No Recharts v3 instalado, `Cell` está **depreciado com remoção anunciada na v4** — a fase usou o prop `shape`, que é o caminho atual.
4. **A rota de acesso por senha está em `src/app/(app)/relatorios/acesso/`**, não em `src/app/relatorios/acesso/` como o `CLAUDE.md` prescreve. Divergência **pré-existente**, fora do escopo — registrada no backlog (§10).
5. **O comentário que dizia que o par do chip cinza já era "validado em uso" era falso.** Ele nunca tinha sido medido — ver §5.

## 5. Revisão adversarial — 5 achados, 3 confirmados

Cinco lentes independentes (vazamento do viewer · retrocompatibilidade de snapshot · contagens intactas · a11y/contraste · cobertura dos 24 itens), cada achado submetido a um cético instruído a **derrubar** antes de virar correção. **Vazamento do viewer e retrocompatibilidade de snapshot voltaram vazias.**

**Confirmados e corrigidos (commit `231bac9`):**

1. **Byte NUL cru em `transferencias-resumo.ts`** — o separador da chave do `Map` era `0x00`. A função funcionava e `tsc`/`vitest` passavam (NUL é code point válido num template literal), mas o **git classificava o arquivo inteiro como binário**: `git diff` respondia "Binary files differ", `blame` e o GitHub não mostravam linha nenhuma, `grep` só o lia com `-a`. O arquivo escapava justamente do mecanismo com que esta fase audita as próprias mudanças. Trocado por `::`. *(Provado: `git grep` acha a linha em `HEAD` e não achava no blob anterior.)*
2. **O chip "foto de dd/MM" reprovava AA** — nasceu com `muted-foreground` sobre `muted`, **4,34:1** nos 11px em que é renderizado. Pior: é **exatamente o par que `scripts/contraste.mjs` já catalogava como defeito conhecido** (P2-8, "pílula fallback — ANTES"), com a correção ao lado. A lição: copiar de um lugar que *está em produção* não é copiar de um lugar *medido*. Passou a `gray-200/gray-600` (6,11:1 · 5,64:1) e os quatro pares do chip entraram no portão.
3. **O medidor não distinguia "no limite" de "com folga" sem cor** — o preenchimento satura em 100% assim que o estoque alcança o mínimo, então os dois níveis desenhavam a MESMA barra, diferindo só por âmbar × verde, que têm luminância quase igual e viram o mesmo cinza no papel. O nível "no limite" ganhou **rótulo de texto permanente** (5,05:1 claro · 10,43:1 escuro, ambos no portão).

**Refutados:** "o relatório da fase não existe" (ele é sempre o último commit — precedente F29/F31) e "o acento vaza para o dashboard" (decisão consciente, registrada em `DECISOES.md`; o próprio RV-22 altera o componente compartilhado do mesmo jeito).

## 6. Dois defeitos que só o navegador pegou

Os roteiros manuais foram rodados contra um andaime temporário (`/verify`) com dados 100% fictícios, sem login e sem banco. **A primeira coisa que a página fez foi devolver HTTP 500.** Nenhum dos dois passou por `lint`, `tsc` ou `build` — os três ficaram verdes o tempo todo.

1. **Ícone lucide como prop de Server Component → Client Component.** `corpo-relatorio-v2.tsx` é Server Component, `GrupoColapsavel` é `'use client'`, e um componente React é uma função: "Functions cannot be passed directly to Client Components". A rota `/relatorios/[filial]` inteira caía. Agora atravessa a **chave**.
2. **`PREFIXO_FILTROS` lido do servidor valia `undefined`.** A constante morava num módulo `'use client'`; o bundler o substitui por uma referência, e ler propriedade de referência não devolve valor. O clique-para-filtrar montaria `undefined.motivo=Troca` na URL e o filtro nunca aplicaria, **em silêncio** — o sintoma visível era a dica das Devoluções dizendo "filtrar as Saídas". A constante mudou para `src/lib/relatorios/prefixos-tabela.ts` (puro) e o módulo cliente reexporta.

**A guarda:** `src/components/relatorios/fronteira-rsc.test.ts` varre todo Server Component de `src/app` e `src/components` procurando import de VALOR vindo de módulo `'use client'`. **Provada por mutação** — reintroduzir o import derruba 2 testes; restaurar deixa 4 verdes. A autoguarda do próprio teste pegou um erro meu no caminho: o primeiro predicado aceitava qualquer maiúscula inicial, e `PREFIXO_FILTROS` — o defeito exato que motivou o teste — teria passado por componente.

## 7. Invariantes da ordem — provados

| Invariante | Prova |
|---|---|
| Nenhuma migration | `git diff b15bc57..HEAD -- supabase/` **vazio** |
| Nenhuma dependência nova | `git diff b15bc57..HEAD -- package.json package-lock.json` **vazio** |
| Nenhuma contagem mudou | As **únicas 3 linhas removidas** em `src/lib/queries/relatorios/` são as desestruturações dos `Promise.all`, estendidas para receber as leituras novas. Zero fórmula de agregação tocada. |
| Viewer confinado | No DOM, modo viewer: **10 hrefs, todos `#fragmento`**, zero fora de `/relatorios/**`, zero alvo clicável. `confinamento-viewer.test.ts` ganhou as duas categorias novas que o varredor por regex não vê (`router.push` e href vindo de storage) |
| Snapshot antigo abre | Modo "antigo" (v2 sem os campos da F32): HTTP 200, sem card de evolução, sem medidor, nada quebra |
| Snapshot estático | Modos `snap` e `viewer`: zero dica de clique, zero href externo, sem "hoje, parcial" no congelado |
| Contagem de testes sobe | 2.347 → **2.505** |

## 8. Roteiros manuais executados

Andaime `/verify` com dados fictícios, quatro modos (`operador`, `viewer`, `snap`, `antigo`) — **todos HTTP 200**.

1. **Ao vivo como operador** — acentos, barra do acervo, chips com contagem, dicas de clique (3), 11 links de KPI, "hoje, parcial", resumo de risco da manutenção ("3 casos · 1 em alerta (30+ dias) · 1 encerrado no período"), chips de transferência ("Filial Fictícia Norte → Filial Fictícia Sul: 2"). ✅
2. **Viewer por senha** — zero dica de clique, zero href fora de `/relatorios/**`, zero `aria-label` de alvo clicável; continua vendo evolução, medidores e chips. ✅
3. **Snapshot novo e antigo** — o novo com `serieEstado` e `minimo`; o antigo sem os dois, abrindo limpo. ✅
4. **Impressão A4 e P&B** — **não vista em preview** (§11). Auditoria estrutural: os canais que seguram a leitura sem cor estão todos presentes (rótulo dentro do segmento com fill escolhido por luminância medida, total na ponta, legenda escrita, gaps do RV-03, borda no medidor em `print:`), a dica de clique ganhou `print:hidden` (é navegação) e o carimbo de hora **não** é `print:hidden` (a ordem manda sair no papel). Foi nesta auditoria que o achado 3 do §5 apareceu.
5. **Mobile 360 px** — `document.scrollWidth === clientWidth === 360`: **sem rolagem horizontal do documento**. O que transborda está dentro dos próprios contêineres roláveis (a nav de chips e as tabelas). Grupos "Acessórios"/"Componentes" nascem recolhidos; "Principais" aberto. ✅

## 9. Documentação ajustada

`relatorio-ao-vivo` e `relatorios-gerados` (a lista que narra a ordem das seções foi reescrita **contra o componente**, porque dois cards entraram no meio dela) · 8 atas em `DECISOES.md` · entrada no `CHANGELOG.md` (sem o selo 🔒 — a fase ainda não foi deployada) · `README.md` (F0→F32 e o parágrafo da fase) · a régua do token de gráfico em `ARQUITETURA.md`.

## 10. Backlog novo (visto e não feito)

1. **A rota `relatorios/acesso` está em `src/app/(app)/`**, e o `CLAUDE.md` a prescreve fora do grupo. Divergência pré-existente, não tocada.
2. **A barra "Acervo por situação" não é clicável**, embora os segmentos dela sejam os mesmos das empilhadas. O RV-12 só pedia as empilhadas; ficou fora de propósito.
3. **O card "Evolução do estoque" não aparece no preset padrão** (7 dias não juntam 3 semanas fechadas). Se o Johnny quiser a curva sempre visível, o caminho é um card que olhe as últimas 8 semanas **independentemente do período** — o que exige decidir o que fazer com o chip de janela, que passaria a mentir.
4. **O custo das 9 leituras as-of por render não foi medido em produção.** A régua tem teto, mas o número real (a RPC consolidada media ~233 ms em 2026-07) precisa de medição pós-deploy.
5. **O blob antigo de `transferencias-resumo.ts` continua binário no histórico** — consertá-lo exigiria reescrever história, o que a ordem proíbe. A versão atual e todas as futuras são texto.

## 11. O que este relatório NÃO prova

- **Impressão foi auditada por CSS e por estrutura, não vista em papel nem em preview.** O painel do navegador desta sessão não compõe quadros, então `screenshot` e preview de impressão não estavam disponíveis. O RV-24 pede um preview P&B de verdade: **é o primeiro item para o Johnny conferir de olho.**
- **O scroll-spy (RV-13) não foi exercitado.** `IntersectionObserver` não entrega callback nenhum neste ambiente (medido: um observer novo sobre elementos existentes produziu zero entradas). O código está no lugar e usa observer, não handler de scroll — mas ninguém o viu marcar um chip.
- **A geometria das barras não foi vista.** A animação do Recharts depende de `requestAnimationFrame`, que não roda sem compositing; os `<rect>` ficam com altura zero. Confirmado que é do ambiente e não do código: a linha da evolução do estoque, que desliga a animação, renderiza normalmente. **Consequência prática: o clique nas barras (RV-12) não pôde ser disparado de verdade** — o que existe é a URL montada por função pura testada, o gate provado por teste estático e a ausência total de alvos no viewer, medida no DOM.
- **Nada foi exercitado contra o banco de produção.** Todos os roteiros usaram dados fictícios em memória. O smoke (`scripts/smoke/`) **não foi rodado**: ele exige login com credencial, e este agente não digita senha em formulário. Fica como pendência de pós-deploy.
- **A concorrência do realtime não foi exercida.** O carimbo de hora foi verificado por teste de função pura e por leitura de código, não com dois eventos disputando o mesmo refresh.
- **O tema escuro não foi visto**, só medido: os pares novos passam no `contraste.mjs`, mas ninguém olhou a tela escura.
- **Nada foi deployado.** A `main` está com 12 commits à frente do `origin` no momento em que este relatório é escrito.

## 12. Commits da fase

```
3cfd850 docs(f32): a ordem, a análise de 10/08, o protótipo e o PLAN da fase
9e6fb02 feat(f32): a paleta de status reprovava na medição — RV-02
484f7a2 feat(f32): respiro de 2px, total no tooltip e eixo que respira — RV-03, RV-23, RV-10
fcda965 feat(f32): o acento nos tiles, a barra do acervo e a escala em token — RV-01, RV-07, RV-21
31eb513 feat(f32): leitura de relance — RV-04, RV-05, RV-08, RV-19, RV-20, RV-22
65f8707 feat(f32): interatividade e navegação — RV-12 a RV-18
faf8f83 feat(f32): as três funções novas — RV-06, RV-09, RV-11
398b291 fix(f32): dois defeitos que só o navegador pegou — e a guarda para os dois
2c47b02 chore(f32): remove o andaime de verificação e o bypass do proxy
d09a295 docs(f32): ajuda, atas, CHANGELOG, README e a régua de cor de gráfico
231bac9 fix(f32): os 3 achados que sobreviveram ao cético da revisão adversarial
```
