# PLAN — F19 (UX/a11y + modo escuro)

Ordem: `docs/prompts/F19-correcoes-ux-dark-mode.md`. Trabalho direto na `main` local.
Este arquivo é o **gabarito antifuga**: a revisão final confere o diff contra ele.

> Colisão de nome: já existe uma fase F19 (auditoria de regras, `docs/RELATORIO-F19.md`).
> Esta ordem pede o relatório em `docs/F19-RELATORIO.md` — nomes distintos, nada é sobrescrito.

## Baseline (medida ANTES de qualquer mudança, commit `37774eb`)

| Comando | Resultado |
|---|---|
| `npm run lint` | ✅ limpo (nenhuma saída além do cabeçalho do script) |
| `npm run build` | ✅ `Compiled successfully in 8.0s`, 24 rotas, 0 erro |
| `npx vitest run` | ✅ **56 arquivos / 1092 testes**, 0 falha |

Nada estava vermelho. A régua de pronto é: continuar verde **e** 1092 testes no mínimo.

## Descobertas da exploração que corrigem a ordem

1. `gerar-relatorio-dialog.tsx:107` ("Escopo") **não rotula um Select** — rotula dois `<Button>` de
   alternância. Correção certa é `role="group"` + `aria-labelledby`, não `htmlFor`.
2. `editar-ativo-dialog.tsx:180` **já está correto**: usa `<FormLabel>`+`<FormControl>`, e
   `ui/form.tsx` injeta `htmlFor`/`id` por `Slot`. Pôr `id` à mão QUEBRARIA a injeção. **Não tocar.**
3. `sidebar-nav.tsx:73` (chip "em breve") é **código morto** — os 8 itens de `ITENS` têm `href`,
   o ramo placeholder nunca renderiza. Ajuste feito assim mesmo (1 caractere), registrado como tal.
4. Pontos sem `catch` **além** dos listados na ordem: `criar-senha-dialog`, `item-combobox`,
   `historico-lancamentos`, `nova-compra-form`, `colar-lista-dialog`, `gerar-termo-dialog`.
   Mesma classe de defeito → entram.
5. `README.md` e `docs/BACKLOG-UX.md` listam **T12 "remover next-themes (dependência morta)"** e
   `docs/DECISOES.md:289` fixa "tema claro por design, toggle não adicionado". A F19 revoga os dois.

## Incremento 1 — P1-1: rede muda em mutação (try/catch)

**Decisão:** `try/catch` **inline**, replicando o padrão que o repo já usa duas vezes
(`importar-wizard.tsx` F7F, `convidar-usuario-dialog.tsx` F13/B1) — **sem helper**. Motivo: 6 formatos
de retorno diferentes convivem (`{ok,erro}`, união discriminada, `{ok,resultados,erroGeral}`,
`{ok,criados,erros}`, sem `ok`, array puro) e cada sítio precisa de mensagem **específica** em pt-BR;
um helper genérico viraria `unknown` + casts. Registrado em `DECISOES.md`.

Mensagem-molde: `Não foi possível <ação>. Verifique sua conexão e tente de novo.`

### Mutações com `startTransition` (toast no catch)
- [ ] `src/components/ativos/anotar-dialog.tsx` (`salvar`)
- [ ] `src/components/ativos/estornar-dialog.tsx` (`confirmar`)
- [ ] `src/components/ativos/corrigir-patrimonio-dialog.tsx` (`salvar`)
- [ ] `src/components/ativos/definir-service-tag-dialog.tsx` (`salvar`)
- [ ] `src/components/ativos/confirmar-assinatura-dialog.tsx` (`confirmar` **e** `desfazer` — 2)
- [ ] `src/components/admin/filial-dialog.tsx` (`salvar`)
- [ ] `src/components/admin/item-dialog.tsx` (`salvar` **e** `remover` — 2)
- [ ] `src/components/admin/kit-dialog.tsx` (`salvar`)
- [ ] `src/components/admin/motivo-dialog.tsx` (`salvar`)
- [ ] `src/components/admin/senha-acoes.tsx` (`alternar`)
- [ ] `src/components/admin/criar-senha-dialog.tsx` (`salvar`) — extra
- [ ] `src/components/itens/lancar-item-dialog.tsx` (`salvar`)
- [ ] `src/components/itens/item-combobox.tsx` (`criar`) — extra
- [ ] `src/components/itens/historico-lancamentos.tsx` (`confirmar`) — extra
- [ ] `src/components/relatorios/gerar-relatorio-dialog.tsx` (`gerar`)
- [ ] `src/components/pendencias/resolver-pendencia-item-dialog.tsx` (`resolver`)

### Handlers `async` com `try/finally` sem `catch`
- [ ] `src/components/movimentacoes/nova-movimentacao-form.tsx` — `registrar` (**a mensagem tem de
      dizer que o lote NÃO se perdeu**) e `restaurarRascunho`
- [ ] `src/components/movimentacoes/devolucao-fornecedor-form.tsx` (`enviar`)
- [ ] `src/components/ativos/nova-compra-form.tsx` (`enviar`) — extra
- [ ] `src/components/movimentacoes/nova/colar-lista-dialog.tsx` (`conferir`) — extra
- [ ] `src/components/movimentacoes/gerar-termo-dialog.tsx` (`preparar` — sem try nenhum) — extra

### Leituras de digitação (degradar **calado**, sem toast — evita toast por tecla)
- [ ] `src/components/movimentacoes/ativo-combobox.tsx` (2 efeitos)
- [ ] `src/components/layout/paleta-comandos.tsx`
- [ ] `src/components/movimentacoes/nova/campo-sugerido.tsx`
- [ ] `src/components/movimentacoes/nova/passo-revisao.tsx`
- [ ] `src/components/ativos/nova-compra-form.tsx` (efeito de sugestões)

## Incremento 2 — P1-2: `<Label>` sem nome acessível no Select

Padrão: `<Label htmlFor="X">` + `<SelectTrigger id="X">`. **Sem** `aria-label` junto (sobrescreveria
o label visível). Prefixo `passo-` no wizard para não ambiguar com `mov-*` de `lista-filtros`.

- [ ] `src/components/movimentacoes/nova/passo-movimentacao.tsx` — 5: `passo-tipo`, `passo-motivo`,
      `passo-termo`, `passo-filial-destino`, `passo-status`
- [ ] `src/components/itens/lancar-item-dialog.tsx` — 2: `lanc-filial`, `lanc-tipo`
- [ ] `src/components/ativos/nova-compra-form.tsx` — 2: `compra-categoria`, `compra-filial`
- [ ] `src/components/movimentacoes/devolucao-fornecedor-form.tsx` — 2: `sub-categoria`, `sub-filial`
- [ ] `src/components/movimentacoes/gerar-termo-dialog.tsx` — 1: `termo-modelo` (extra)
- [ ] `src/components/relatorios/gerar-relatorio-dialog.tsx` — "Escopo" → `role="group"` +
      `aria-labelledby` (**não** é Select)
- [ ] `src/components/ativos/editar-ativo-dialog.tsx` — **NÃO TOCAR** (já correto por `FormControl`)

## Incremento 3 — P1-3 + P2-8: contrastes medidos

- [ ] `src/lib/relatorios/delta-kpi.ts` — `text-green-600` → `text-green-700` (3,22 → **4,94:1**)
- [ ] `src/lib/dominio.ts` — fallback de `pillTipo`/`pillTipoLancamento`: `bg-muted text-muted-foreground`
      (4,34:1) → `bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400` (**6,11** / **5,64:1**)
- [ ] `src/components/layout/sidebar-nav.tsx` — chip "em breve" `text-[10px]` → `text-[11px]`
- [ ] `scripts/contraste.mjs` — mede tudo, nos DOIS temas (já escrito e conferido contra a revisão:
      reproduz 3,22 · 4,34 · 6,11 · 2,54)

## Incremento 4 — núcleo do modo escuro

- [x] `src/app/globals.css` — `@custom-variant dark` com `@media not print` **e** bloco `.dark`
      dentro de `@media not print`. Isso, sozinho, faz a **impressão sair sempre clara**: na mídia
      print o `.dark` não declara token (cai no `:root` claro) e **nenhum** `dark:` casa.
      CSS puro — sem JS, sem flash, sem duplicar paleta. *(Provado no CSS compilado.)*
- [ ] `src/app/globals.css` — `color-scheme: light !important` no `@media print` (o next-themes
      escreve `color-scheme` **inline** com `enableSystem`; inline vence CSS sem `!important`)
- [x] `src/components/layout/theme-provider.tsx` — fronteira client do next-themes
- [x] `src/app/layout.tsx` — `suppressHydrationWarning` + provider envolvendo `{children}` **e**
      `<Toaster/>` (é o que conserta o P1-4 sem tocar em `ui/sonner.tsx`)
- [ ] `src/components/layout/user-menu.tsx` — toggle Claro/Escuro/Sistema
      (`DropdownMenuRadioGroup`, ícones, marcação **não só por cor**, rótulos pt-BR)
- [ ] Viewer por senha **não** ganha toggle: `UserMenu` só é montado em `app-header.tsx`, e o viewer
      usa `viewer-header.tsx`. Sai de graça — registrar em `DECISOES.md`.

## Incremento 5 — varredura de pares `dark:` faltantes (21 achados)

Mapa canônico do repo: `bg-*-100`→`dark:bg-*-950` · `text-*-700|800`→`dark:text-*-300` ·
`text-*-600`→`dark:text-*-400` · callout âmbar → `dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200`.

- [ ] `src/lib/dominio.ts` — `TIPO_PILL`: `saida`, `devolucao`, `compra` (3)
- [ ] `src/app/(app)/page.tsx:231` — `text-amber-800` → `+ dark:text-amber-300`
- [ ] `src/app/(app)/relatorios/gerados/[id]/page.tsx:53` — banner "versão mais nova" (zero `dark:`)
- [ ] `src/components/relatorios/pendencias-chips.tsx:17` — chip (zero `dark:`)
- [ ] `src/app/(app)/admin/{filiais,itens,kits,motivos,senhas}/page.tsx` — badge verde "Ativo/Ativa" (5)
- [ ] `border-amber-300` sem par (5): `(app)/ativos/[id]/page.tsx:205`,
      `ativos/pendencias-item-ficha.tsx:33`, `movimentacoes/gerar-termo-dialog.tsx:259`,
      `ativos/linha-do-tempo.tsx:226`, `relatorios/tabela-entradas.tsx:188`
- [ ] `movimentacoes/nova/passo-movimentacao.tsx:215` — `border-green-600/40` sem par
- [ ] `relatorios/manutencao-casos.tsx:86` — ícone `text-amber-500`
- [ ] `movimentacoes/nova/colar-lista-dialog.tsx:338` — `accent-amber-600`
- [ ] `src/components/ui/dialog.tsx:42` + `src/components/ui/sheet.tsx:40` — scrim `bg-black/10`
      some no escuro. **É `ui/*`** → registrar o motivo em `DECISOES.md` (defeito criado por ligar o tema)

**Não tocar** (falsos positivos conferidos): `barras-empilhadas` `fill-white` (sobre hex fixo),
`realtime-refresh` `bg-green-500`, `linha-do-tempo:95` trilho, `ui/chart.tsx` (seletores),
`observacao-card` (tokens de marca), e todo o chrome `bg-brand-dark`/`bg-brand-amarelo`.

## Incremento 6 — P2 restantes

- [ ] **P2-5** `src/app/(app)/ativos/page.tsx` — `EstadoVazio` + `temFiltro`.
      `temFiltro = Boolean(q || filialId || categoria || status.length > 0 || semPatrimonio)`
      (⚠ `status` é array: `Boolean([])` é `true`); `ord`/`pp`/`page` **fora**; "banco vazio" exige
      `resultado.total === 0`. Tirar `PackageOpen` do import **sem** levar `PackagePlus`.
- [ ] **P2-6** `role="alert"`: `nova-movimentacao-form.tsx` ("Revise antes de continuar") e
      `nova/passo-movimentacao.tsx` ("Itens que falharam"); `login/page.tsx` ganha `<p role="alert">`
      persistente (mantendo o toast, como a ordem pede)
- [ ] **P2-7** `src/components/relatorios/barras-empilhadas.tsx` — cor do rótulo por **luminância**
      do segmento (branco só onde ≥4,5:1 — medido: só o violeta), fonte 10 → 11px
- [ ] **P2-9** `nova-movimentacao-form.tsx` — `aria-label="Etapas"` na `<ol>` + `aria-current="step"`
- [ ] **P2-10** `title=` → `Tooltip`: `itens/saldos-filiais.tsx` (2), `itens/badge-repor.tsx`,
      `relatorios/celulas.tsx` (`BadgeEstornada`). ⚠ `saldos-filiais` e `badge-repor` são **Server
      Components** — o Tooltip do Radix é client; envolver só o trecho necessário
- [ ] **P2-11** `layout/progresso-navegacao.tsx` — `motion-reduce:hidden`; `motion-reduce:animate-none`
      nos `animate-spin` com texto: `gerar-termo-dialog` (2), `colar-lista-dialog`,
      `viewer-auto-refresh`, `filial-tabs`
- [ ] **P2-12a** `(app)/ativos/[id]/page.tsx` — "Voltar para ativos" vira client link:
      `history.back()` **só** se `document.referrer` for mesma origem e `/ativos`; senão `/ativos`.
      ⚠ nunca navegar *para* o referrer (open redirect)
- [ ] **P2-12b** mesma ficha — "Corrigir patrimônio" + "Definir service tag" num `⋯`.
      ⚠ os 2 dialogs têm `open` **interno** e trigger acoplado → precisam de `open`/`onOpenChange`
      opcionais; dialogs como **irmãos** do menu (não dentro); `onSelect` com `preventDefault()`
- [ ] **P2-12c** `ativos/linha-do-tempo.tsx` — destaque `:target`. ⚠ o `id` está no `<li>` mas o
      cartão é o `<div>` filho → mirar o filho

## Incremento 7 — docs, verificação e fecho

- [ ] `docs/DECISOES.md` — try/catch inline vs helper · impressão CSS-only · viewer sem toggle ·
      `:target` · edição de `ui/dialog|sheet` · revogação do T12/linha 289
- [ ] `README.md` + `docs/BACKLOG-UX.md` — tirar T12 ("remover next-themes")
- [ ] `CHANGELOG.md` — entrada no formato existente
- [ ] `docs/F19-RELATORIO.md` — checklist, tabela de contrastes, saídas reais, smoke, checklist de 2 min
- [ ] Smoke público (`build` + `start` + curl) · smoke logado degradado (**não há `.env.smoke`**)
- [ ] Revisão em contexto fresco contra este PLAN + critérios; corrigir e re-revisar
- [ ] `git push origin main` — **último ato**, só com tudo verde

## Fora de escopo (backlog, não tocar nesta ordem)

Banco/migrations · Server Actions e regras de negócio · dependência nova · templates/scripts/mockups ·
`db:reset`/`db:seed` · remover variantes `dark:` existentes.
