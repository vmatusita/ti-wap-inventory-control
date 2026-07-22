# OS-F9 (ultracode) — quick wins de UX da operação: busca por colaborador · colar do Excel · filtros do histórico de itens · badge de pendências (+10)

Ordem **executável e autocontida**. Nasce da **Onda 1** do `docs/BACKLOG-UX.md` (22/07/2026 — diagnóstico completo com âncoras de código; leia a tabela §5 de lá se quiser o contexto, mas esta OS repete tudo o que é necessário). Objetivo em uma linha: **14 melhorias pequenas e de alto retorno** nos fluxos de movimentação, compra, itens e no shell — **zero migration, zero dependência nova, zero mudança de regra de negócio**. Só TypeScript/UI/textos.

**Modo autônomo com acesso total (CLAUDE.md).** Sistema **em produção com dados reais** (go-live 15/07, ~1.600 ativos, 5 filiais). Esta OS não toca banco, não toca RPC/trigger/view, não toca no import e não afrouxa nenhuma salvaguarda existente. Subagente que se pegar "aproveitando para fazer" item da Onda 2/3 do backlog está fora do escopo: pare e registre.

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code na raiz do repositório. O `CLAUDE.md` é lido sozinho e manda sempre. O orquestrador segue a §1; os blocos §W1–§W6 são os prompts completos dos subagentes (autocontidos). A autoridade do escopo está na **§2 (escopo decidido pelo Johnny, 22/07/2026)**.

---

## §0 — O que estamos consertando (diagnóstico já feito — âncoras reais)

Fricções pequenas, todas com causa localizada no código atual (pós-F8 + manutenção de 21/07). Linhas são referência de leitura — **confira ao abrir o arquivo** (o repo pode ter drift de ±poucas linhas).

| ID | Fricção (fato) | Âncora |
|---|---|---|
| **M2** | Combobox de ativos não busca por colaborador (a lista `/ativos` busca); placeholder nem cita service tag/hostname | `src/lib/queries/ativos.ts:278-280` vs `:92`; `src/components/movimentacoes/ativo-combobox.tsx:70` |
| **M7** | Adicionar ativo que estreita a interseção de tipos **limpa o tipo em silêncio**, sem dizer qual ativo causou | `src/components/movimentacoes/nova-movimentacao-form.tsx:122-137` (`ajustarTipoPara` :122-127, `adicionar` :128-132) |
| **M10** | Data da movimentação e data do termo são sempre digitadas; sem atalho "Hoje/Ontem" | `src/components/movimentacoes/nova/passo-movimentacao.tsx:287-296` e `:225-234` |
| **A1** | Colar 2 colunas do Excel falha: `parsearLista` só aceita vírgula como separador | `src/lib/patrimonio.ts:25-44` (split em `:34-40`) |
| **A3** | Duplicata dentro da lista colada só aparece **depois** do submit (o preview não deduplica) | `src/lib/patrimonio.ts:25-44`; server acusa em `src/lib/actions/compras.ts:44-53` |
| **A5** | Compra recomeça do zero: filial e categoria sem default, sem autofoco | `src/components/ativos/nova-compra-form.tsx:39,46` |
| **A7** | Bipagem por leitor USB **já funciona** no textarea (scanner = teclado+Enter) e ninguém sabe | documentar em `src/lib/ajuda/conteudo.ts` (seção da compra) |
| **I3** | Histórico de lançamentos só filtra por filial — a query já aceita `itemId` e a página não usa | `src/app/(app)/itens/page.tsx:51-55`; `src/lib/queries/itens.ts:154-155` |
| **I6** | Lançar um item que está na tabela de saldos exige reabrir o dialog e procurá-lo de novo no combobox | `src/app/(app)/itens/page.tsx:93-137` (linhas em :110-131); `src/components/itens/lancar-item-dialog.tsx` |
| **I5a** | A ajuda **mente**: afirma que existe "estoque mínimo configurado" — campo que não existe (é item futuro da F5) | `src/lib/ajuda/conteudo.ts:299` e `:497` |
| **T2** | "Pendências" na sidebar é link seco, sem contagem; e os KPIs do dashboard não navegam para as listas (as duas metades do mesmo item do backlog) | `src/components/layout/sidebar-nav.tsx:30`; `(app)/page.tsx:70` |
| **T4** | **Revogar senha de acesso é 1 clique sem confirmação** — único destrutivo do app sem diálogo | `src/components/admin/senha-acoes.tsx:15-25` |
| **T6** | Não há como copiar patrimônio com um clique (clipboard só em convite/senha) | ficha `src/app/(app)/ativos/[id]/page.tsx`; `src/components/ativos/ativos-table.tsx` |
| **T8** | Empty states inconsistentes: ricos em `/ativos` e `/relatorios/gerados`, texto seco em Pendências/Itens/Import/dashboard | `pendencias/page.tsx:95`, `itens/page.tsx:88`, `admin/importar/page.tsx:39`, `(app)/page.tsx:85,123`; padrão bom em `ativos/page.tsx:72-79` |

---

## §1 — Orquestração (sessão principal)

### 1.0 GATE de entrada

(a) Working tree **limpo** na `main`; `npm run lint` + `npm run test` + `npm run build` **verdes** antes de qualquer edição (baseline). (b) `supabase/migrations/` vai até `0040_hardening_rpcs.sql` — **esta OS não cria migration nenhuma**; se qualquer frente concluir que precisa de banco, é sinal de escopo errado: PARE a frente e registre. (c) `docs/BACKLOG-UX.md` existe em `docs/` e a tabela §5 de lá marca como **Onda 1** exatamente os 14 itens do §2 (fonte do escopo). (d) Estrutura conforme CLAUDE.md. Falhou qualquer um → **PARE e reporte**.

### 1.1 Grafo de execução

```
FASE 0 (orquestrador)     ONDA 1 (5 frentes paralelas · arquivos disjuntos)   ONDA 2 (1 frente)      FINAL (orquestrador)
gate §1.0 · branch f9     W1 movimentações  (M2 · M7 · M10)                   W6 revisão adversarial  lint+test+build na base
componente EstadoVazio →  W2 compra         (A1 · A3 · A5)                 →  + smoke E2E em DEV   →  final · merge na main ·
(contrato §1.4) ·         W3 itens          (I3 · I6 · vazio de /itens)       + emendas de docs       deploy único Vercel ·
baseline verde            W4 shell          (T2 — badge e KPIs · T8)                                  resumo consolidado
                          W5 ficha/admin/ajuda (T4 · T6 · A7 · I5a)
```

- **Isolamento (precedente F6A/F7B/F7E/F7F):** worktrees no Windows/OneDrive custam caro — **subagentes paralelos na mesma árvore**, branch única `f9`, propriedade de arquivos **disjunta por construção** (§1.3). Worktrees baratos disponíveis → aceitável; decida, registre, siga.
- O único artefato compartilhado entre frentes é o `EstadoVazio`, e ele **nasce na fase 0, antes do fan-out** — W3 e W4 apenas importam. Nenhum outro arquivo tem dois donos.
- **Nenhuma frente toca banco, `.env`, `next.config.ts`, `package.json` ou `src/components/ui/**`** (o `Badge` já tem `variant="warning"` desde a F7F — use-o, não o edite).

### 1.2 Regras globais

1. **Desenvolvimento e smokes dos subagentes contra o Supabase DEV** (projeto de ensaio); **nenhum subagente toca produção** — produção e deploy são só do orquestrador (§1.5). Custo **R$ 0**.
2. **Zero migration, zero RPC/trigger/view.** Leitura nova = função em `src/lib/queries/` sobre views/tabelas existentes.
3. **Zero dependência nova** (precedente F6B) — nem componente shadcn novo: confirmações usam o `Dialog` comum já padronizado no app. `package.json` sai desta OS **byte a byte igual**.
4. **Nenhum dado real** em código/teste/fixture/screenshot: exemplos sempre `WAP0001234` / "Fulano da Silva" / `NB-WAP0001234`.
5. Convenções CLAUDE.md: UI/erros/commits **pt-BR**; escrita só via Server Actions + Zod; leituras em `src/lib/queries/`; datas exibidas `dd/MM/yyyy`; números de tabela `tabular-nums`; patrimônio sempre canônico (`WAP0004491`); Server Components por padrão, `'use client'` só onde precisa.
6. Cada subagente entrega: código na branch + checklist **autoverificado** + rascunho para `docs/DECISOES.md` (data · contexto · escolha · motivo) + pendências; `lint`+`test`+`build` limpos **no seu recorte**.
7. **Invariantes intocáveis:** máquina de estados e validação final no Postgres (a UI continua sendo filtro, nunca juiz); "a movimentação é a fonte da verdade"; lote de movimentação continua **máx 10** (subir o teto é M11/Onda 2 — fora); modelo de acesso de nível único + viewer por senha intactos; import e suas salvaguardas intactos; nenhum texto de domínio muda de vocabulário (§5 da spec).
8. Commits pt-BR estilo conventional por frente: `feat(f9): busca por colaborador no combobox de ativos`, etc.

### 1.3 Mapa de propriedade de arquivos (disjunto por construção)

| Dono | Arquivos |
|---|---|
| **Fase 0 (orquestrador)** | `src/components/layout/estado-vazio.tsx` (**novo**) |
| **W1** | `src/lib/queries/ativos.ts`, `src/components/movimentacoes/ativo-combobox.tsx`, `src/components/movimentacoes/nova-movimentacao-form.tsx`, `src/components/movimentacoes/nova/passo-movimentacao.tsx`, `src/components/movimentacoes/nova/config.ts` (se precisar), `src/lib/format.ts` (`hojeISO` mora aqui, `:85`; `ontemISO()` entra ao lado) + `src/lib/format.test.ts` (**novo**) |
| **W2** | `src/lib/patrimonio.ts` + `src/lib/patrimonio.test.ts`, `src/components/ativos/nova-compra-form.tsx` |
| **W3** | `src/app/(app)/itens/page.tsx`, `src/lib/queries/itens.ts`, `src/components/itens/**` (dialog, histórico, filtros + novos arquivos da pasta) |
| **W4** | `src/app/(app)/layout.tsx`, `src/components/layout/sidebar-nav.tsx`, `src/components/layout/app-header.tsx`, `src/lib/queries/pendencias-detalhe.ts`, `src/app/(app)/page.tsx`, `src/app/(app)/pendencias/page.tsx`, `src/app/(app)/admin/importar/page.tsx`, `src/components/relatorios/kpi-tiles.tsx` (**só** prop opcional de link) |
| **W5** | `src/components/admin/senha-acoes.tsx`, `src/app/(app)/admin/senhas/page.tsx` (**só** passar a prop `rotulo` na `:63`), `src/app/(app)/ativos/[id]/page.tsx`, `src/components/ativos/ativos-table.tsx`, `src/components/ativos/copiar-patrimonio.tsx` (**novo**), `src/lib/ajuda/conteudo.ts` + `conteudo.test.ts` |
| **W6** | Revisão (toca qualquer arquivo para **corrigir** achados) + `README.md`, `CHANGELOG.md`, `docs/prompts/README.md`, `docs/DECISOES.md`, `docs/BACKLOG-UX.md` |

Conflito previsto: **nenhum** — as frentes não compartilham arquivo. Se uma frente sentir necessidade de editar arquivo alheio, o mecanismo é o mesmo da F7F: quem é dono implementa, quem precisa especifica; na dúvida, anote para o W6.

### 1.4 CONTRATO — `EstadoVazio` (fase 0; fixo — mudar = decisão registrada)

O orquestrador cria, **antes do fan-out**, `src/components/layout/estado-vazio.tsx` (Server Component, sem estado):

```tsx
type EstadoVazioProps = {
  titulo: string
  descricao?: string
  icone?: LucideIcon            // default: Inbox
  acao?: { href: string; rotulo: string }   // CTA opcional (Link + Button)
  variante?: 'card' | 'inline'  // card = borda tracejada + ícone (padrão /ativos); inline = compacto p/ cards do dashboard
}
```

Visual do `card`: o padrão bom já existente em `src/app/(app)/ativos/page.tsx:72-79` (borda tracejada, ícone muted, título + descrição, CTA quando fizer sentido). `inline`: uma linha, ícone pequeno + texto muted, sem borda. Commit próprio na fase 0; W3/W4 **importam e não editam**.

### 1.5 Integração e final (orquestrador)

1. **Fim da onda 1:** mesma árvore → não há merge; rode `npm run lint && npm run test && npm run build` na união. Quebrou algo entre frentes (import de tipo, prop renomeada), o orquestrador conserta ou devolve à frente dona.
2. **Lançar W6** (revisão adversarial + E2E em DEV + emendas de docs). Aplicar as correções dos achados.
3. **Merge na `main`** quando o aceite geral §3 estiver todo verde.
4. **Deploy único** Vercel → smoke de leitura em produção (abrir dashboard, `/ativos`, `/itens`, `/pendencias`, fluxo de nova movimentação **até a revisão, sem registrar**) → resumo consolidado: checklists, decisões em `DECISOES.md`, docs emendados, pendências e backlog.

---

## §W1 — Subagente W1: movimentações — busca por colaborador · reset explicado · chips de data

Você é um subagente executando a frente **W1** da OS-F9. Modo autônomo. Seus arquivos: os da linha W1 do §1.3 — nada além. Leia antes: `src/components/movimentacoes/ativo-combobox.tsx` inteiro, `nova-movimentacao-form.tsx` (foco em `adicionar`/`ajustarTipoPara`, ~linhas 60-160), `nova/passo-movimentacao.tsx` (campos de data), `src/lib/queries/ativos.ts` (`buscarAtivosParaCombobox` `:268-296`; `RESUMO_SELECT` `:241-242`; `or()` `:278-280`; a busca da lista com colaborador em `:92`, para copiar o padrão), `src/lib/dominio.ts` (rótulos de tipo/status).

### Entregas

1. **M2 — busca por colaborador no combobox.**
   - Em `queries/ativos.ts`: incluir `colaborador_atual` em **quatro** pontos — o `or()` multi-palavra (`:278-280`; mesmo padrão da lista em `:92` — `palavrasDaBusca`/`sanitizeTerm` já suportam), o `RESUMO_SELECT` (`:241-242`), o tipo `AtivoResumo` e o mapper `resumoDe`. A action `buscarAtivosParaMovimentacao` é proxy puro — nada fora dos arquivos do W1 muda (efeito benigno: `buscarAtivoResumo` passa a carregar o campo também).
   - No item do dropdown (`ativo-combobox.tsx`): exibir o colaborador atual (texto muted, truncado) quando existir — quem busca "Fulano" precisa ver qual notebook é de qual Fulano.
   - Placeholder do campo passa a dizer o que a busca realmente cobre: `Buscar patrimônio, service tag, hostname, marca, modelo ou colaborador… (mín. 2 caracteres)` — mantendo o sufixo de mínimo que o placeholder atual já tem (`ativo-combobox.tsx:70`).
   - **Não mude** debounce (300ms), mínimo de 2 caracteres, limite de 12 nem a ordenação — só o alcance da busca.
2. **M7 — reset do tipo explicado.** Hoje, adicionar um ativo que estreita a interseção limpa o tipo escolhido em silêncio (`ajustarTipoPara` `:122-127`, chamado por `adicionar` `:128-132`). Ao limpar por causa do ativo recém-adicionado, dispare `toast.warning` nomeando o culpado com os rótulos do domínio (`dominio.ts`): `WAP0001234 (Em manutenção) não permite "Saída" — o tipo foi limpo.` Use o fallback `a.patrimonio ?? 'sem patrimônio'` (padrão já usado em `ativo-combobox.tsx:104`). Na prática só o recém-adicionado pode ser o culpado (ativos entram um a um pelo combobox); trate lista por robustez, **sem procurar caminho multi-add que não existe**. O aviso genérico de estados mistos do passo 2 continua como está.
3. **M10 — chips "Hoje / Ontem".** Nos dois campos de data do passo 2 (data da movimentação e data do termo), botões `type="button"` pequenos (outline, altura do input) ao lado do campo, que setam o valor para hoje/ontem. Criar `ontemISO()` em `src/lib/format.ts`, ao lado de `hojeISO()` (`:85`) — mesma mecânica `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })` aplicada a `new Date(Date.now() - 86_400_000)`, **nunca** `toISOString()` cru (fuso!). Teste Vitest em `src/lib/format.test.ts` (novo). `validators/data.ts` só **consome** `hojeISO` — não mexa lá (definir datas ali criaria ciclo de import, como o próprio arquivo documenta).

### O que NÃO fazer

Não tocar no schema Zod, na action, no teto de 10, no `atalho-global.tsx`, nem em `passo-ativos.tsx`/`passo-revisao.tsx`. Não adicionar busca inicial com <2 chars (é M3/Onda 2).

### Aceite W1

- [ ] Em DEV (seed fictício): buscar pelo nome de um colaborador fictício retorna os ativos dele, com o nome visível no dropdown; placeholder atualizado
- [ ] Adicionar ativo incompatível com o tipo já escolhido → toast nomeando ativo, estado e tipo; nada de reset mudo
- [ ] Chips Hoje/Ontem funcionam nos dois campos e respeitam `max={hojeISO()}`; `ontemISO()` com teste verde
- [ ] `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W2 — Subagente W2: compra — colar do Excel · duplicata no preview · defaults com memória

Você é um subagente executando a frente **W2** da OS-F9. Modo autônomo. Seus arquivos: `src/lib/patrimonio.ts` + `src/lib/patrimonio.test.ts` e `src/components/ativos/nova-compra-form.tsx`. Leia antes: `patrimonio.ts` inteiro (em especial `parsearLista` `:25-44` e `chavePatrimonio` `:75-77`), `patrimonio.test.ts` (padrão dos testes existentes), `nova-compra-form.tsx` inteiro (preview `useMemo` `:58-70`, estados `:39-48`, `reiniciar` `:136-149`).

### Entregas

1. **A1 — separadores do colar-lista.** `parsearLista` passa a aceitar **`,` `;` e TAB** como separador patrimônio→service tag: normalizar a linha (trim + remover separadores vazios à direita), dividir no **primeiro** separador; o resto (trim) é a service tag. Linha com **mais de 2 campos não-vazios** → erro claro por linha (`Linha 3: mais de 2 colunas — cole só patrimônio e service tag`). Vírgula com até 2 colunas permanece idêntica; a única mudança com vírgula é que 3+ campos — hoje descartados **em silêncio** (`:34-40`) — passam a acusar erro (mudança intencional; nenhum teste existente cobre 3 colunas). Atualizar o placeholder/hint do textarea para citar que dá para **colar direto duas colunas do Excel**.
2. **A3 — duplicata no preview.** `parsearLista` passa a carregar a **linha original** em cada item (campo opcional `linha?: number` em `ItemPatrimonio` — linhas em branco/inválidas não podem deslocar a numeração; o `map` do form não quebra, ele só usa patrimonio/service_tag). Nova função pura `duplicatasDaLista(itens)` em `patrimonio.ts` (usando `chavePatrimonio`) devolve as chaves repetidas **com as linhas originais**; o `useMemo` do preview marca **as duas** ocorrências (chip com estilo de erro + `Linha 5: WAP0001234 repetido na lista`). Duplicata entra nos erros do preview **e** o `disabled` do botão passa a incluir `preview.erros.length > 0` (hoje o gate é só `enviando || preview.itens.length === 0` — `:420-423`; o guard do `enviar()` `:74-77` continua como segunda linha). A checagem do servidor (`compras.ts:44-53`) permanece — não a remova.
3. **A5 — defaults com memória + autofoco.**
   - `autoFocus` no textarea da aba "Colar lista" (a aba default).
   - Ao cadastrar com sucesso, salvar `{ categoria, filialId }` em `localStorage` (`wap:compra:defaults`); ao montar o form com os campos **vazios**, pré-preencher a partir da chave — via `useEffect` pós-mount (não no `useState` inicial, para não quebrar hidratação). Valor inválido/filial inexistente → ignorar silenciosamente.
   - O `reiniciar` ("Cadastrar mais") já preserva categoria/filial/data — mantenha.

### Testes (Vitest — o grosso da frente)

`parsearLista`: vírgula (regressão), `;`, TAB, TAB com espaços, linha com 3 colunas → erro, separador à direita ignorado (`WAP0001234\t`), linha só com patrimônio. `duplicatasDaLista`: par repetido acusa as duas ocorrências **com o número de linha original** (inclua um caso com linha em branco/inválida ANTES do par repetido); mesmo patrimônio com STs diferentes **não** acusa; lista limpa → vazio. Suite existente de `patrimonio.test.ts` continua verde.

### O que NÃO fazer

Não mexer em `expandirFaixa` (service tag na faixa é A2/Onda 2), em `canonicalizarPatrimonio`, em `MAX_LOTE_COMPRA`, na action `registrarCompra` nem no schema Zod.

### Aceite W2

- [ ] Colar `WAP0001234⇥ST-ABC123` (TAB real) e `WAP0001235;ST-DEF456` funciona; 3 colunas dá erro por linha
- [ ] Lista com par repetido mostra erro no preview e o botão continua desabilitado — nada chega ao servidor
- [ ] Abrir `/ativos/novo` → foco no textarea; segunda compra do dia já vem com filial/categoria da anterior (mesmo após F5/refresh)
- [ ] Testes novos + suite antiga verdes; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md` (memória por dispositivo)

---

## §W3 — Subagente W3: itens — filtros do histórico · lançar da linha · vazio padronizado

Você é um subagente executando a frente **W3** da OS-F9. Modo autônomo. Seus arquivos: `src/app/(app)/itens/page.tsx`, `src/lib/queries/itens.ts`, `src/components/itens/**`. Leia antes: `itens/page.tsx` inteiro (parse de searchParams, chamada do histórico `:51-55`, tabela de saldos `:93-137`), `queries/itens.ts` (`getHistoricoLancamentos` `:140-196`), `lancar-item-dialog.tsx` inteiro (atalho `L` `:79-93`, `repetirUltimo` `:105-116`, states `:65-76` — incluem `aberto` `:65` e `qtdRef` `:76`, os dois que o I6 usa), `historico-lancamentos.tsx`, `itens-filtros.tsx`, e o contrato `EstadoVazio` (§1.4).

### Entregas

1. **I3 — filtros do histórico na URL.** Novo componente client `src/components/itens/historico-filtros.tsx` acima da tabela do histórico: **Item** (select do catálogo ativo), **Tipo** (os 6 tipos com os rótulos semânticos de `dominio.ts` — `rotuloTipoLancamento`), **De / Até** (inputs `type="date"`). Estado 100% na URL (padrão das outras listas): params `item`, `tipo`, `de`, `ate`; mudar filtro **reseta `page`**. `itens/page.tsx` valida os params defensivamente (**id numérico** do item — o id do catálogo é `number`, **não uuid** —, enum de tipo, datas ISO; inválido = ignorado) e repassa. `getHistoricoLancamentos` ganha `tipo` (`.eq('tipo', …)`) e `de`/`ate` (`.gte('data', …)` / `.lte('data', …)` — sobre a coluna **`data`**, a mesma exibida na tabela do histórico; **não** `created_at`, que divergiria da data mostrada) além do `itemId` que já aceita (`:154-155`) — **leitura pura, nada de view nova**. Os filtros de saldos (`q`/`grupo`/`filial`) continuam como estão; `filial` segue valendo para ambos.
2. **I6 — lançar a partir da linha do saldo.** Em cada linha da tabela de saldos, botão-ícone discreto (ex.: `Plus`, `aria-label="Lançar este item"`, alvo ≥40px no mobile) que abre o dialog **já com item + filial preenchidos**. Mecanismo (decisão §2): componente client mínimo por linha que dispara `window.dispatchEvent(new CustomEvent('wap:lancar-item', { detail: { itemId, filialId } }))`; `lancar-item-dialog.tsx` adiciona um listener (mesmo padrão do listener de teclado que já tem) que abre o dialog, aplica o preset e **foca a quantidade** (reusar `qtdRef`). Preset vence o estado anterior do form; o atalho `L` e o "Repetir último" continuam intactos.
3. **Vazio de `/itens`.** Trocar o texto seco de "Nenhum item no filtro atual." (`itens/page.tsx:88`) por `EstadoVazio` (§1.4) — e, enquanto o catálogo estiver vazio (pré-F6C), a variante `card` com CTA para `/admin/itens` ("Cadastre o catálogo em Administração → Itens"). Se o histórico tiver vazio seco, mesmo tratamento (`inline`).

### O que NÃO fazer

Não criar multi-item por lançamento (I1/Onda 2), não criar item inline no combobox (I2/Onda 2), não mexer em `admin/itens`, nas actions de escrita nem no saldo multi-filial (I4/Onda 2).

### Aceite W3

- [ ] `/itens?item=12&tipo=saida&de=2026-07-01&ate=2026-07-31` filtra o histórico e é compartilhável; back/forward funciona; trocar filtro volta à página 1
- [ ] Botão da linha abre o dialog com item+filial certos e foco na quantidade; `L` e "Repetir último" seguem funcionando; param inválido na URL não quebra a página
- [ ] Vazios de `/itens` usando `EstadoVazio`; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W4 — Subagente W4: shell — badge de pendências · vazios padronizados · KPIs clicáveis

Você é um subagente executando a frente **W4** da OS-F9. Modo autônomo. Seus arquivos: linha W4 do §1.3. Leia antes: `src/app/(app)/layout.tsx` (os 3 modos de shell), `sidebar-nav.tsx`, `app-header.tsx` (Sheet mobile `:23-44`), `src/lib/queries/pendencias-detalhe.ts` (fonte da página `/pendencias` — use a MESMA fonte), `(app)/page.tsx` (dashboard; vazios `:85,123`; como `KpiTiles` é consumido), `src/components/relatorios/kpi-tiles.tsx`, `pendencias/page.tsx:95`, `admin/importar/page.tsx:39`, contrato §1.4.

### Entregas

1. **T2 — badge de pendências na sidebar.** Nova função `contarPendenciasAbertas()` em `queries/pendencias-detalhe.ts` (count `{ head: true }` na **mesma view** que `listarPendencias` usa nesse arquivo — `v_pendencias`; confira o nome ali. **Não** invente critério novo de "aberta": o que a página lista, o badge conta). `(app)/layout.tsx` chama `await contarPendenciasAbertas()` **dentro do ramo do operador, depois de `getOperador` confirmar** (`layout.tsx:23-32`; hoje o layout não busca mais nada — não há o que paralelizar, e disparar antes executaria a contagem também na sessão de visualizador por senha, onde a RLS nega e derrubaria o shell dos relatórios). Passa para `SidebarNav` (desktop **e** o mesmo componente dentro do Sheet mobile — confira por onde a prop flui; se o Sheet mora no `app-header.tsx`, a prop passa por ele). Badge no item "Pendências": `Badge variant="warning"` (o tier âmbar da F7F) com o número; **0 → sem badge**; `aria-label` do link vira `Pendências — N abertas`. Sem realtime (decisão §2) — atualiza a cada navegação.
2. **T8 — vazios padronizados (fora de /itens, que é do W3).** Trocar por `EstadoVazio`: `pendencias/page.tsx:95` (variante `card`; descrição diferenciando "sem pendências" de "nada neste filtro" — o código já sabe se há filtro ativo), `admin/importar/page.tsx:39` — vazio do **Histórico de imports** (`card`; título tipo "Nenhum import realizado ainda" e descrição "quando um import rodar, ele aparece aqui com backup e contagens" — o que é o import a intro da página `:28-32` já explica, não duplique), dashboard `:85` e `:123` (`inline`; manter o tom leve — o "🎉" pode ficar no título). Não tocar nos vazios que já são ricos (`/ativos`, `/relatorios/gerados`, `/ajuda`).
3. **T2 (segunda metade) — KPIs do dashboard clicáveis.** É a segunda metade do item T2 do backlog ("conferir se os KPI tiles linkam para as listas filtradas; se não, linkar"). Hoje **não linkam**: o dashboard renderiza `<KpiTiles kpis={kpis} />` numa chamada única (`(app)/page.tsx:70`), sem noção de link. Adicionar a `kpi-tiles.tsx` uma **prop opcional** de links vinda do call site — ex.: `links?: Partial<Record<chave-do-tile, string>>` — e, **só no dashboard**, apontar cada KPI para a lista filtrada correspondente (tile de status → `/ativos?status=…` com o valor do enum — `/ativos` já aceita `status` em CSV, `ativos/page.tsx:38-42`; total → `/ativos`). O uso nos relatórios **não muda** (prop ausente = visual e comportamento idênticos).

### O que NÃO fazer

Não adicionar busca global (T1/Onda 3), não mexer no `atalho-global.tsx`, no `user-menu.tsx`, no shell do visualizador, nem criar realtime novo.

### Aceite W4

- [ ] Com pendências abertas no DEV: badge âmbar com número na sidebar desktop **e** no Sheet mobile; zero pendências → sem badge; contagem bate com a página `/pendencias`
- [ ] Vazios de Pendências/Import/dashboard via `EstadoVazio`, com CTA onde indicado; nenhum vazio rico regrediu
- [ ] KPIs do dashboard navegam para as listas filtradas; relatórios visualmente idênticos (confira `/relatorios/geral` e um snapshot gerado)
- [ ] `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W5 — Subagente W5: ficha/admin/ajuda — confirmar revogação · copiar patrimônio · ajuda honesta

Você é um subagente executando a frente **W5** da OS-F9. Modo autônomo. Seus arquivos: linha W5 do §1.3. Leia antes: `senha-acoes.tsx` inteiro (hoje: revogação em 1 clique com `useTransition`), `ativos/[id]/page.tsx` (cabeçalho da ficha, bloco de ações `:102-116`), `ativos-table.tsx` (a linha navega por `onClick`/`router.push` — `:165`, **não** é `Link`; a célula de patrimônio já contém um `Link` aninhado com `stopPropagation` `:56-69` — siga esse precedente), `estornar-dialog.tsx` (padrão de confirmação do app, para copiar), `src/lib/ajuda/conteudo.ts` + `conteudo.test.ts`.

### Entregas

1. **T4 — confirmação para revogar senha.** `SenhaAcoes` hoje recebe só `{ id, ativa }` (`senha-acoes.tsx:11`) — adicione a prop `rotulo` e passe-a no call site `admin/senhas/page.tsx:63` (`rotulo={s.rotulo}`; edição de 1 linha, prevista no mapa §1.3). Envolver a revogação num `Dialog` de confirmação no padrão do app (título "Revogar senha de acesso?", corpo citando o rótulo da senha e o efeito real — *"Quem usa esta senha perde o acesso aos relatórios no próximo carregamento."* — botão `variant="destructive"` "Revogar" com estado de envio, Cancelar com foco inicial). Manter o `useTransition` existente. **Não** instalar `alert-dialog` (§2).
2. **T6 — copiar patrimônio com um clique.** Novo client component `src/components/ativos/copiar-patrimonio.tsx`: `{ valor: string; rotulo?: string }` → botão-ícone (`Copy` do lucide, ghost, `aria-label` "Copiar patrimônio"/rótulo) que faz `navigator.clipboard.writeText(valor)` + `toast.success('Patrimônio copiado.')`; fallback silencioso se clipboard indisponível. Renderizar o botão **só quando houver valor** — patrimônio é nullable desde a F7E (na ficha o `h1` cai em "Sem patrimônio" `:84-86`; na tabela, no badge "sem patrimônio" `:61-68`; a service tag da ficha é condicional `:92-99`). Usar: (a) na **ficha**, ao lado do patrimônio (`h1` `:83-87`) **e** da service tag (`:92-99`); (b) na **tabela de ativos**, na célula de patrimônio — `stopPropagation` no clique basta para não disparar o `onClick` da linha (`preventDefault` é desnecessário; o `Link` da própria célula `:56-69` já usa esse padrão), com foco visível e alvo adequado no mobile.
3. **A7 + I5a — ajuda honesta e atualizada** em `src/lib/ajuda/conteudo.ts`:
   - **I5a (correção — prioridade):** `:299` — "Falta" deixa de citar "estoque mínimo configurado" e passa a explicar a semântica real: *falta = quando os atrelados superam o estoque (`max(0, atrelados − estoque)`)*. `:497` — o catálogo é "(nome, grupo, ordem)", sem "estoque mínimo". São **exatamente 2** ocorrências aspiracionais (`:299` e `:497`); a terceira que o `grep -n "mínimo"` acha (`:104`, "justificativa (mínimo 10 caracteres)") é validação **legítima** do Ajuste — **não alterar**. Estoque mínimo é F5 e a ajuda não pode prometê-lo.
   - **A7 (novo):** na seção `como-fazer`, **novo bloco** (tipo `passos` ou `nota`, conforme o tipo `Bloco` do arquivo) logo após o bloco "Dar entrada de ativos por compra" (`~:393-401`), título "Cadastrando com leitor de código de barras": o leitor USB digita e dá Enter, então **bipar direto no campo "Colar lista" funciona** — uma bipagem por linha; confira o preview antes de cadastrar.
   - **Registrar os facilitadores novos desta OS** nas seções correspondentes (1 linha cada): busca por colaborador (M2), colar do Excel com TAB (A1), chips Hoje/Ontem (M10), filtros do histórico (I3), lançar da linha (I6), copiar patrimônio (T6), badge de pendências (T2). Os textos podem ser escritos a partir **desta ordem** — não dependa dos diffs das outras frentes; o W6 confere a aderência.
   - `conteudo.test.ts` ajustado se necessário.

### O que NÃO fazer

Não implementar estoque mínimo (F5), não tocar em outras ações da ficha (estorno/edição/anotar), não adicionar cópia em outras tabelas (só ficha + `/ativos`).

### Aceite W5

- [ ] Revogar senha agora confirma antes; revogação continua funcionando e o toast permanece
- [ ] Copiar funciona na ficha (patrimônio e ST) e na tabela sem navegar a linha; `aria-label` + foco visível presentes
- [ ] `grep -n "mínimo" src/lib/ajuda/conteudo.ts` → só a ocorrência legítima da justificativa (`:104`); bloco de bipagem no ar; facilitadores novos citados
- [ ] `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W6 — Subagente W6 (ONDA 2): revisão adversarial + E2E + emendas

Você é um subagente executando a frente **W6** da OS-F9, sobre a base com W1–W5 integrados. Seu papel é **quebrar** o que as frentes entregaram e emendar os documentos. Corrija o que achar; registre tudo (ok / corrigido / pendência justificada).

1. **Regressão dos fluxos centrais em DEV** (seed fictício — `npm run db:seed` **no Supabase DEV, jamais em produção**): movimentação ponta a ponta (busca → lote → tipo → revisão → sucesso → termo), compra em lote (lista com TAB + faixa), lançamento de item (dialog, `L`, repetir último, **linha do saldo**), estorno, admin de senhas. Nada pode ter regredido.
2. **Escopo e higiene:** `git diff main...f9 --stat` — só arquivos dos mapas §1.3; `package.json` **byte a byte igual**; zero migration nova; nenhum item de Onda 2/3 entrou de carona; nenhum dado real em código/teste/exemplo.
3. **A11y e mobile dos elementos novos:** `aria-label` e foco visível (copiar, lançar-da-linha, chips de data, badge); contraste AA do badge âmbar nos dois temas de fundo em que aparece; alvos ≥40px no mobile; navegação por teclado no Dialog de revogação (Esc/Tab/foco inicial no Cancelar).
4. **URL state:** filtros do histórico de itens compartilháveis, back/forward, param inválido ignorado sem crash; `page` resetando ao mudar filtro.
5. **Cross-frente:** o toast do M7 usa os rótulos certos do domínio; o preset do I6 não é sobrescrito pelo "Repetir último"; o `EstadoVazio` está consistente entre W3 e W4; a ajuda (W5) descreve fielmente o que W1–W4 entregaram — divergiu, corrija a ajuda.
6. **E2E documentado:** roteiro reproduzível no resumo (10–15 passos cobrindo os 14 itens).
7. **Emendas (parte da execução):** `README.md` (status F9), `CHANGELOG.md` (entrada F9 com a lista dos 14), `docs/prompts/README.md` (linha F9 na tabela), `docs/DECISOES.md` (entrada consolidada `2026-07-22 · F9`: decisões do §2 + rascunhos das frentes), `docs/BACKLOG-UX.md` (marcar a Onda 1 como concluída na tabela §5, com data).

### Aceite W6

- [ ] Cada item acima com veredito; correções commitadas; E2E documentado
- [ ] Docs emendados; `lint`+`test`+`build` limpos na base final

---

## §2 — Escopo decidido (Johnny, 22/07/2026) — autoridade

1. **Executar exatamente os 14 itens da Onda 1** do `docs/BACKLOG-UX.md` §5: **M2, M7, M10, A1, A3, A5, A7, I3, I6, I5a (correção da ajuda), T2, T4, T6, T8** — sendo que **T2 tem duas metades**, como no texto do item no backlog: badge de pendências na sidebar **e** KPIs do dashboard linkando para as listas filtradas. Nada da Onda 2/3 pega carona (nem M11, nem colar-lista na movimentação, nem export CSV, nem busca global).
2. **Decisões de implementação pré-tomadas nesta ordem** (W6 consolida em `DECISOES.md`):
   - **A5**: memória de filial/categoria da compra via `localStorage` (**por dispositivo**, chave `wap:compra:defaults`) — sem coluna nova em `profiles`, sem migration. Aceita-se que outro navegador não lembre.
   - **I6**: gatilho "lançar da linha" via `CustomEvent` tipado na `window` (mesmo padrão do listener de teclado `L` que o dialog já tem) — evita subir a tabela server-rendered inteira para client.
   - **T4**: confirmação com o **`Dialog` comum** do app (não instalar `alert-dialog` — regra §1.2.3).
   - **M10**: chips de data **só** no fluxo de movimentação (compra já tem default hoje e não é o gargalo).
   - **T8**: componente `EstadoVazio` próprio (§1.4), sem lib.
   - **T2**: contagem de pendências buscada **server-side no layout autenticado** a cada request (count `head` na mesma view da página `/pendencias`); atualiza na navegação — sem realtime nesta OS. KPIs viram links só no dashboard, via prop opcional.
3. **I5a corrige a ajuda para a semântica real** ("Falta" = `max(0, atrelados − estoque)`); o **estoque mínimo em si continua na F5** — não implementá-lo aqui.

## §3 — Aceite geral (orquestrador)

- [ ] Gate §1.0 passou; fase 0 criou `EstadoVazio` antes do fan-out; propriedade §1.3 respeitada (diff confere)
- [ ] Aceites W1–W6 completos e autoverificados; os **14 itens** do §2 entregues; revisão adversarial sem pendência crítica
- [ ] **Zero migration** (pasta continua terminando em `0040`), **zero dependência nova** (`package.json` intacto), **zero dado real**, custo R$ 0
- [ ] Invariantes §1.2.7 intactas (máquina de estados no banco, lote 10, acesso, import)
- [ ] `npm run lint` + `npm run test` + `npm run build` verdes na base final; deploy Vercel READY; smoke de leitura em produção ok
- [ ] `DECISOES.md` consolidado; README/CHANGELOG/prompts/BACKLOG-UX emendados; resumo final com checklist, decisões, pendências e o que ficou para as Ondas 2/3
