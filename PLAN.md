# PLAN — F29 · Onda B2 (relatórios, administração e base global)

Ordem: `docs/prompts/F29-onda-b2-relatorios-admin-ultracode.md` (18 itens).
Fonte da análise: `docs/ANALISE-UX-2026-08-07.md` §6–8.
Baseline medido antes de editar (07/08/2026): **95 arquivos de teste · 2.041 testes** verdes;
`supabase/` intocado; `node scripts/contraste.mjs` fora do CI.

Este arquivo é autossuficiente: quem retomar a fase do zero consegue continuar só com ele.

---

## 0. Fatos do código que o plano assume (medidos, não supostos)

| # | Fato | Onde |
|---|------|------|
| F1 | `intervaloDoPreset` **não é exportada**; `PRESETS` e o `switch` são duas listas mantidas à mão | `src/lib/relatorios/periodo.ts:36-41`, `:43-59` |
| F2 | "Semana" tem **duas** janelas: ao vivo = dom→hoje (`weekStartsOn:0`); dialog de gerar = seg→sex (`semanaUtilCorrente`, `weekStartsOn:1`) | `periodo.ts:30-34`, `:50-51` |
| F3 | **A corrida de versão JÁ é barrada pelo banco**: `unique (periodo_de, periodo_ate, filial_id, versao)` na `0010:16` **e** o índice `relatorios_gerados_periodo_filial_versao_uidx` com `coalesce(filial_id,-1)` na `0013:10-11` (que cobre o consolidado). O defeito real não é duplicata silenciosa — é a **mensagem** e o snapshot montado que se perde. Logo: **nenhuma migration**, e o item 2c vira *catch 23505 + retry* | `supabase/migrations/0010`, `0013` |
| F4 | `lerContasAuth` **não** traz `last_sign_in_at` — precisa entrar no tipo `ContaAuth` e em `UsuarioAdmin` | `src/lib/queries/admin.ts:45`, `:9-26` |
| F5 | `usuarios-tabela.tsx` é Server Component; `admin/itens/page.tsx` renderiza a tabela **inline** (não há `itens-tabela.tsx`) | — |
| F6 | `eventos_admin.acao` é **TEXT**, não enum: ação nova não exige migration | `0065:23,34` |
| F7 | `filial-dialog.tsx` **não tem** caixa de erro pós-submit (só `toast.error`) — a ordem supõe que tem | `filial-dialog.tsx:77-80` |
| F8 | O stepper do wizard está em `nova-movimentacao-form.tsx:1216-1248` (não 1085-1095) e é `<button>` **nativo**, como os botões de ordenação de `ativos-table.tsx:244-265` | — |
| F9 | `Input` (`ui/input.tsx:11`) e `SelectTrigger` (`ui/select.tsx:47`) têm altura **fixa** `h-8`, sem prop responsiva → correção só por `className` local | — |
| F10 | O padrão de alvo de toque tem 6 variantes (`sm:h-8`, `sm:h-7`, `sm:size-8`, `sm:size-7`, `sm:min-h-0`, `sm:min-h-8`); a regra é **espelhar o irmão da linha** | `acoes-dev.tsx:63-64` |
| F11 | O único ponto de render do snapshot é `CorpoRelatorio`; o congelado **nunca** recebe `links` | `gerados/[id]/page.tsx:92` |
| F12 | Confinamento do visualizador = 3 camadas (proxy · layout · shell reduzido sem sidebar/paleta/atalhos). `viewer-nav` só tem "Ao vivo" e "Gerados" | `src/proxy.ts`, `(app)/layout.tsx:144-180` |
| F13 | `MetaSnapshot.filialSlug` existe no snapshot congelado → o slug do "ver no ao vivo" **não precisa de query** | `tipos.ts:92-106` |
| F14 | `periodoAnterior()` (janela do Δ) vive em `queries/relatorios/snapshot.ts:35-40` — módulo de servidor | — |
| F15 | Não há helper de URL pública; o único precedente é `origemDaRequisicao` | `actions/admin.ts:43-50` |
| F16 | A rota pública da senha é `src/app/(app)/relatorios/acesso/page.tsx` → `/relatorios/acesso` | — |

---

## 1. Regras duras desta fase

1. **Visualizador por senha nunca ganha href para fora de `/relatorios/**`.** Todos os links novos do item 3 são internos a `/relatorios`. Conferir um a um no roteiro manual.
2. **Snapshot congelado permanece imutável** — nada no caminho de render escreve; nenhum componente novo com Server Action entra na árvore de `CorpoRelatorio`.
3. **Nenhuma contagem de relatório muda.** Os itens 4/5/6 mexem em apresentação e texto, nunca em agregação.
4. **Zero dependência nova.** `diff` de `package.json` só na seção `scripts`.
5. **`supabase/` com diff vazio** (ver F3 — a constraint que a ordem cogitava já existe; nada a aplicar, nada em handoff).
6. **Testes da ajuda travam frases literais** — realidade que mudar aqui atualiza `src/lib/ajuda/conteudo/`.

---

## 2. Ordem de execução (frentes disjuntas)

```
A. Bloco REL   — itens 1..8      (lib/relatorios, components/relatorios, actions/relatorios, queries/gerados)
B. Bloco ADM   — itens 9..12     (lib/actions/admin|senhas, queries/admin, components/admin)
C. Bloco UXG   — itens 14..18    (layout, loading, contraste/CI, header/paleta)
D. Item 13     — alvos de toque  (ISOLADO, por último: toca ~15 arquivos e conflita com A/B/C)
E. Docs + testes + revisão adversarial + push
```

Verificação `npm run lint && npm run test` ao fim de cada bloco. Commit por item ou par correlato.

---

## 3. Bloco A — Relatórios

### Item 1 · REL-03 — preset "Semana passada"

**`src/lib/relatorios/periodo.ts`**
- `PresetPeriodo` ganha `'semana-passada'`.
- `PRESETS` ganha `{ valor: 'semana-passada', rotulo: 'Semana passada' }` **depois** de `'semana'`.
- `intervaloDoPreset` ganha o `case`: `de = startOfWeek(subWeeks(base,1), {weekStartsOn:0})`, `ate = endOfWeek(subWeeks(base,1), {weekStartsOn:0})` — semana **fechada** dom→sáb, sempre no passado (por isso `ate` é o sábado, e não `hoje` como no preset `'semana'`).
- Nova função exportada e pura `semanaUtilAnterior(hoje = hojeISO())` = **seg→sex da semana anterior** (`weekStartsOn:1`), o par de `semanaUtilCorrente`.
- Nova função exportada e pura `periodoAnterior(periodo)` — **movida** de `queries/relatorios/snapshot.ts` (F14) para cá, para o item 5 poder usá-la sem arrastar Supabase para um componente. `snapshot.ts` passa a importá-la.
- Nova função pura `periodoInicialDoDialog(periodo, semana, teto)` (item 2b): devolve `{de,ate}` do período ativo, com `ate` limitado ao teto e recuo para `semana` se o recorte ficar inválido.

**UI:** `PeriodoFiltro` renderiza `PRESETS.map` — o botão aparece sozinho. No `GerarRelatorioDialog`, dois atalhos: **"Usar semana corrente"** (seg→sex desta semana) e **"Usar semana passada"** (seg→sex da anterior).

**T11 (decisão aberta — NÃO resolver):** o preset herda a dualidade de F2. Ao vivo = **dom→sáb** da semana anterior; atalho do dialog = **seg→sex** da anterior. Cada superfície segue a janela que já usava. **Ata em `DECISOES.md`.**

**Testes:** `periodo.test.ts` — `'semana-passada'` com `hoje` injetado em 5 cenários (meio de semana, domingo, sábado, virada de mês, virada de ano); `semanaUtilAnterior` (segunda, 4 dias de diferença); `periodoInicialDoDialog`.

### Item 2 · REL-04 — gerar snapshot sem surpresa

**(a) aviso de versão existente.** Nova Server Action `consultarVersaoDoPeriodo({filialSlug, de, ate})` em `actions/relatorios.ts` (só leitura, `exigirPapel(client,'operador')`, mesma resolução de slug e o mesmo `filial_id is null | eq`): devolve `{ versao, autorNome, geradoEm } | null`. O dialog chama ao **abrir** e a cada mudança de data/escopo (debounce ~350 ms, `useTransition` à parte) e monta no box de confirmação: *"Já existe a v2 deste período, gerada por {nome} em {data} — você criará a v3."*

**(b) período ativo.** `relatorios/[filial]/page.tsx` passa `padraoDe/padraoAte` = `periodoInicialDoDialog(periodo, semana, teto)` (era sempre `semanaUtilCorrente`), mais `semanaDe/semanaAte` e `semanaAnteriorDe/semanaAnteriorAte` para os atalhos.

**(c) corrida.** Ver F3: **sem migration.** `gerarRelatorio` passa a inserir num laço de até **4 tentativas**: recalcula `max+1`, insere; se o erro for violação de unicidade (`code === '23505'` ou a mensagem citando o índice), refaz a leitura e tenta de novo; esgotado o laço, devolve mensagem própria. O snapshot já montado é reaproveitado (não se remonta). **Ata**: a análise supunha duplicata silenciosa; o banco já recusa desde a `0013` — o que se perde hoje é o trabalho e a explicação.

**Testes:** função pura `mensagemVersaoExistente(info)` (o texto do aviso) e `ehViolacaoDeVersao(code, message)`.

### Item 3 · REL-05 — arquivo de gerados navegável

**(a) paginação.** `listarRelatoriosGerados(client, filialSlugs, {pagina, tamanho})` passa a usar `.range()` e `{ count: 'exact' }`; devolve `{ linhas, total }`. Página = **30** (constante exportada `GERADOS_PAGE_SIZE`, reaproveitável pela ajuda). Param na URL no padrão da casa, preservando o filtro (`gerados-filtro.tsx` já é o modelo).

**(b) badge "superada".** Exato, não aproximado: depois de carregar a página, **uma** consulta extra `select periodo_de, periodo_ate, filial_id, versao` com `.in('periodo_de', <datas distintas da página>)` monta o `max(versao)` por chave em memória. Quem tiver `versao < max` recebe a badge. Registro do limite: a consulta extra é recortada pelas datas **da página**, o que é suficiente porque a chave inclui `periodo_de`.

**(c) navegação no snapshot.** Nova query `vizinhosDoRelatorio(client, {filialId, periodoDe, id})` → `{ anterior, proximo }` (mesma filial; anterior = maior `periodo_de` menor que o atual; próximo = menor `periodo_de` maior). Na página: "← período anterior" / "próximo →" e **"Ver este período no ao vivo"** → `/relatorios/${s.meta.filialSlug}?preset=custom&de=…&ate=…` (F13). **Os três links ficam dentro de `/relatorios/**`.**

### Item 4 · REL-06 — gráficos legíveis

- `barras-empilhadas.tsx`: `<ChartTooltip cursor={false} content={<ChartTooltipContent />} />` (padrão de `barras-horizontais.tsx:73`). Corte do rótulo desce para **≥1 quando a barra comportar**, via função pura nova `deveRotularSegmento(valor, maxTotal)` em `lib/relatorios/rotulo-grafico.ts` (mostra quando `valor >= 1 && valor / maxTotal >= 0.04`), testada.
- `barras-divergentes.tsx`: `ChartTooltip` com `formatter` próprio — os valores de saída são **negativos** no dado (para irem à esquerda) e o tooltip precisa exibir o **absoluto**.
- `grafico-mov-serie.tsx`: função pura `mostrarRotulosDaSerie(qtdPontos)` (`<= 20`); quando falsa, esconde os `LabelList` e mostra um `<YAxis>` enxuto (`width={28}`, `allowDecimals={false}`).

### Item 5 · REL-07 — Δ com o valor anterior

`DeltaKpi` ganha props opcionais `valorAnterior` e `janela` e envolve o conteúdo na `Dica`:
`Anterior: {N} ({dd/MM}–{dd/MM}) → atual: {M}`.
A janela vem de `periodoAnterior({de,ate})` (agora pura, item 1) aplicada ao período do snapshot — **a mesma função que o motor usa para calcular `kpisAnterior`**, então o texto não pode divergir do número. `KpiTiles`/`GrupoKpis` ganham a prop `periodo?: {de,ate}`; sem ela o Δ continua exatamente como hoje (dashboard). Texto montado por função pura `textoDelta(...)`, testada.

### Item 6 · REL-08 — "Copiar texto" completo

`gerarTextoResumo(resumo, extras?)` — segundo parâmetro **opcional** (chamada antiga = saída idêntica, testes atuais intactos):
```ts
extras?: { kpis?: KpisRelatorio; disponiveis?: ItemModelo[] }
```
- Linha de KPIs no topo (depois do período): `Total 412 · Em uso 300 · Em estoque 80 · Reservados 12 · Em triagem 8 · Em manutenção 7 · Reserva técnica 5`.
- Bloco final `Em estoque (N): 16× Modelo A, 04× Modelo B…` — ordenado por total desc, formato `pad2`.
`ResumoPeriodoCard` recebe os extras; no v2 `disponiveisPorModelo` é `ModelosPorCategoria[]` → achatar; no v1 já é `ItemModelo[]`.

### Item 7 · REL-09 — âncoras completas e que abrem

- `corpo-relatorio-v2.tsx`: o card do Resumo ganha `id="resumo"` + `scroll-mt-28`.
- `chips-ancora.tsx`: chips **"Resumo"** e (condicional) **"Observações"**; nova prop `temObservacao`.
- `grupo-colapsavel.tsx`: abre quando `location.hash === '#'+id` — no mount e no `hashchange` (só abre; nunca fecha).

### Item 8 · regra transversal

Nada novo só em hover que o papel precise ler. O Δ do item 5 mantém seta + número visíveis; a `Dica` é acréscimo. `print:hidden` em navegação nova.

---

## 4. Bloco B — Administração

### Item 9 · ADM-02 — convite com estado e reenvio
- `queries/admin.ts`: `ContaAuth` e `UsuarioAdmin` ganham `ultimoAcesso: string | null` (de `last_sign_in_at`).
- Badge **"aguardando primeiro acesso"** quando `ultimoAcesso == null` **ou** `nome` vazio (regra pura `aguardandoPrimeiroAcesso(u)`, testada).
- Nova action `gerarLinkDeAcesso({email})` em `actions/admin.ts`, reaproveitando o ramo de recuperação (`:192-235`) extraído para helper interno. **Mantém as duas travas do original**: `exigirAdmin` e o anti-furo dev (`perfilPorEmail` + `MSG_SO_DEV_GERE_DEV`, falha fechada) — sem isso um admin geraria link de recuperação da conta de um dev. Trilha `convite_reenviado` (vocabulário existente, F6).
- Ação por linha "Gerar novo link de acesso" com o mesmo padrão de cópia do convite.

### Item 10 · ADM-03 — tabelas admin encontráveis
- `usuarios-tabela.tsx` vira `'use client'` (os filhos já são client) + input de filtro com `aria-label` e contagem "N de M". Casamento por `casaBusca` de `lib/ajuda/busca.ts` sobre nome + e-mail + rótulo do cargo + nomes das filiais.
- `admin/itens/page.tsx`: tabela extraída para `components/admin/itens-tabela.tsx` (`'use client'`), filtro por nome + grupo.
- `queries/admin.ts:102`: ordenação `created_at` **desc**. Ata.

### Item 11 · ADM-04 — kits com preview e duplicar
- `kit-dialog.tsx`: bloco "Como o kit aplica" no rodapé, montado por função pura `descreverKit(payload)` (usa `rotuloTipo`/`rotuloTermo`/`rotuloCategoria` — nunca texto redigitado), testada.
- `admin/kits/page.tsx`: ação **"Duplicar"** por linha → abre o dialog em modo criação com o payload copiado e nome `Cópia de {nome}` (o índice único barra colisão e `MSG_KIT_DUPLICADO` já explica).

### Item 12 · ADM-05 — senha de acesso utilizável
- `criarSenhaAcesso` passa a devolver a **URL pública** (`new URL('/relatorios/acesso', origemDaRequisicao(headers()))`, F15/F16). O dialog mostra a URL e o botão **"Copiar link e senha"** (mensagem pronta).
- Nova action `testarSenhaAcesso({id, senha})`: `exigirAdmin`, lê o hash daquela senha pelo client administrativo, `verificarSenha`, devolve **só** `{confere: boolean}`. A senha digitada **não** é exibida, logada nem gravada. Trilha `senha_testada` com `alvo` = rótulo e `detalhe: {confere}` (F6 permite ação nova sem migration).
- `senha-acoes.tsx`: item "Testar senha…" com dialog próprio.

---

## 5. Bloco C — Base global

### Item 14 · UXG-04 — navs roláveis com affordance
Novo `src/components/layout/nav-rolavel.tsx` (`'use client'`): **wrapper `relative`** + `<nav>` rolável dentro + dois overlays `pointer-events-none` de gradiente, exibidos só do lado que ainda tem conteúdo (`scroll` + `ResizeObserver`).
⚠ `chips-ancora` é `sticky top-14`: o **wrapper** recebe o `sticky`/`z`/`print:hidden` e o `<nav>` fica sem — envolver um sticky num div em fluxo normal o mataria. API: `NavRolavel({ className, navClassName, 'aria-label', children })`. Aplicado a `filial-tabs`, `admin-nav`, `chips-ancora`.

### Item 15 · UXG-05 — `role="alert"` nos irmãos
`nova-compra-form` (×2, com foco/scroll no padrão MOV-01a por serem formulário longo fora de dialog), `colar-lista-dialog`, `apagar-usuario-dialog` (só o ramo `email === null`; a outra caixa já tem), `mesa-conflitos` (os dois boxes de `DialogoApagarConflito`, **não** o banner estático — `role="alert"` em elemento que já nasce montado vira ruído a cada navegação).
**Divergência F7:** `filial-dialog` não tem caixa pós-submit. Entrega: caixa inline com `role="alert"` no padrão dos irmãos, alimentada pelo erro de `salvar()` (o toast continua). Ata.

### Item 16 · UXG-06 — loading anunciado e skeleton certo
- Novo `src/components/layout/carregando.tsx`: `<div role="status" aria-busy="true">` + `<span className="sr-only">Carregando…</span>`. Envolve o conteúdo dos **13** `loading.tsx`.
- Novos: `dev/loading.tsx` (4 cards, sem duplicar o `<h1>` que o `dev/layout.tsx` renderiza fora do boundary), `ativos/novo/loading.tsx` e `movimentacoes/devolucao-fornecedor/loading.tsx` (skeleton de formulário — hoje herdam o de lista).

### Item 17 · UXG-07 — contraste no CI
- Pares novos em `scripts/contraste.mjs`: dark de violet/cyan/orange/slate/teal; `muted-foreground`×`background` (claro e escuro); `primary`×`primary-foreground` (claro e escuro); `brand-amarelo`×`brand-dark`; `white/70`×`brand-dark`.
- **Medir antes de marcar `exigir`**. Reprovou: corrige o token/classe se couber no escopo; senão entra como known-fail comentado + item de backlog + ata.
- `package.json`: `"contraste": "node scripts/contraste.mjs"`.
- `.github/workflows/ci.yml`: step **"Contraste (WCAG)"** no job `verificar`, **antes do build** (Node puro, sem env nem build — reprova cedo e barato).

### Item 18 · UXG-10 + UXG-12 — descoberta e identidade
- (a) `app-header.tsx`: campo-placebo `w-64` no desktop ("Buscar ativo, tela ou ação…" + `kbd`), mesmo `onClick`; a lupa continua no mobile.
- (b) `src/lib/ativos/ativos-recentes.ts` (padrão de `lista-visitada.ts`, `sessionStorage`, teto 5, validação de forma na leitura) + `<RegistrarAtivoRecente>` montado na ficha; grupo **"Recentes"** no topo da paleta. Zero servidor.
- (c) `atalho-global.tsx`: `?` abre um **Dialog** de atalhos (N, L, Ctrl+K, /, ?) com link "documentação completa" → `/ajuda`. Atualizar `limites-e-atalhos.ts` (a linha do `?` diz "Abre esta documentação") e os testes que travam a frase.
- (d) `marca.tsx` continua burro; quem envolve com `<Link>` é o header: operador → `/`, visualizador → `/relatorios/geral`.
- (e) `user-menu.tsx`: e-mail em `text-xs` e, para operador, "Escreve em: {filiais}". `Operador` ganha `email` (já disponível em `getOperador`); os nomes das filiais saem de `listarFiliais()` que o shell já busca.

---

## 6. Item 13 (isolado, por último) · UXG-03 — alvos de toque

Regra: **espelhar o irmão da linha** (F10). Desktop não muda.

| Arquivo | Alvo | Correção |
|---|---|---|
| `ativos/ativos-table.tsx:244-265` | `<button>` nativo de ordenação, sem altura | `min-h-10 sm:min-h-0` (preserva `-mx-2 px-2 py-1`) |
| `movimentacoes/nova-movimentacao-form.tsx:1216-1248` | stepper, `<button>` nativo | `min-h-10 sm:min-h-0` |
| `pendencias/fila-pendencias-tabela.tsx` (174,184,196,332,349,360,374) | `h-8` fixo | `h-10 sm:h-8` |
| `ativos/termos-da-ficha.tsx:186,196` | `h-8` fixo | `h-10 sm:h-8` |
| `ativos/linha-do-tempo.tsx:200` | `h-7` fixo | `h-10 sm:h-7` |
| `ativos/pendencias-item-ficha.tsx:67` | `h-8` | `h-10 sm:h-8` |
| `admin/importar/baixar-backup-button.tsx:43` | `h-8` | `h-10 sm:h-8` |
| `ativos/confirmar-assinatura-dialog.tsx:250` | `h-7` | `h-10 sm:h-7` |
| `itens/itens-filtros.tsx:205,215` | `h-8` | `h-10 sm:h-8` |
| `movimentacoes/lista-filtros.tsx`, `itens/historico-filtros.tsx`, `pendencias/pendencias-filtros.tsx` | Input/SelectTrigger herdando `h-8` (F9) | `className="h-10 sm:h-8"` em cada instância — **sem** editar `ui/input.tsx`/`ui/select.tsx` |

Fora da lista da ordem, mesmo defeito, mesma linha: `pendencias/resolver-pendencia-item-dialog.tsx:208` → corrigir junto (é irmão direto) e registrar.

---

## 7. Verificação

- Por bloco: `npm run lint && npm run test`.
- Final: `npm run build`, suíte completa, `node scripts/contraste.mjs`, saídas guardadas.
- Revisão adversarial em contexto fresco contra os 18 itens, com foco em: **link vazando para fora de `/relatorios/**`**, snapshot congelado alterado, contagem de relatório mudada.
- Roteiro manual (o que teste puro não cobre): visualizador navegando gerados → anterior/próximo → ao vivo sem escapar; âncora abrindo grupo recolhido no mobile; "Testar senha" com senha certa e errada; campo-placebo abrindo a paleta; Recentes populando.
- Pós-push: `node scripts/smoke/smoke-prod.mjs` (credenciais existem no `.env.local`).

## 8. Entregáveis de documentação

`docs/RELATORIO-F29.md` · entrada F29 no topo do `CHANGELOG.md` · `README.md` (status) · atas em `docs/DECISOES.md` (mínimo: dualidade de semana do item 1; corrida de versão já barrada pelo banco no 2c; exatidão do "superada" no 3b; caixa nova em `filial-dialog`; ordenação de usuários; known-fails de contraste, se houver) · páginas de ajuda afetadas (relatórios, gerados, atalhos, administração, usuários e senhas).
