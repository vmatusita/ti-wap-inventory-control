# PLAN — F27 (Onda A da análise de UX: "Costuras e segurança de operação")

Ordem: `docs/prompts/F27-onda-a-ux-ultracode.md` (07/08/2026). Trabalho direto na `main`.
Fonte: `docs/ANALISE-UX-2026-08-07.md` §10, Onda A. Este arquivo é o **gabarito antifuga**:
a revisão adversarial confere o diff contra ele.

## Baseline medido antes de qualquer edição (07/08/2026)

- `npm run lint` → exit 0, sem saída.
- `npm run test` → **83 arquivos, 1.865 testes**, exit 0, 132,78 s.
- `git log -1` → `c5124f8 fix(f26): a 3ª volta …`; `main` sincronizada com `origin/main`.
- Untracked esperados: `_claude_tmp/`, `docs/ANALISE-UX-2026-08-07.md`, `docs/prompts/F27-onda-a-ux-ultracode.md`.

> **Nota de ambiente (registrar no relatório).** A sessão foi aberta em
> `C:\Users\victor.matusita\Documents\Projetos\ti-wap-inventory-control`, que é uma **cópia
> velha e quebrada** do projeto (src da era F3, sem `package.json`, sem docs, `git` sem
> nenhum commit). O repositório real — o desta ordem — é
> `C:\Users\victor.matusita\OneDrive - FRESNOMAQ IND DE MAQUINAS SA\Documents\Projetos\ti-wap-inventory-control`.
> Todo o trabalho da F27 acontece no repositório real.

## Regras da fase (do CLAUDE.md e da ordem)

- **Zero migration, zero dependência nova.** Diff de `supabase/` vazio; `package.json` intocado.
- Nada de Onda B/C — inclusive as metades `b` de MOV-01 e REL-13. O que aparecer vai ao backlog do relatório.
- UI/commits em pt-BR. Nenhum dado real em teste/fixture/exemplo.
- `src/lib/types/database.ts` (gerado) e `src/components/ui/` — só o item UXG-02 toca `ui/`, com motivo documentado.
- Teste da ajuda quebrando por mudança de texto ⇒ conserta-se a **ajuda**, nunca o teste.

## Ordem de execução

**Fase A (sozinha, porque toca muitos `page.tsx` que os outros blocos também tocam):** FLX-03.
**Fase B (paralela, propriedade de arquivo disjunta):** B1…B8 abaixo.
**Fase C:** lint + test + build, revisão adversarial em contexto fresco, docs, commits, push.

`CHANGELOG.md`, `README.md`, `docs/DECISOES.md`, `docs/RELATORIO-F27.md`, `PLAN.md` e
`src/lib/ajuda/**` são **meus** (do orquestrador) — nenhum agente de bloco os edita; cada um
**reporta** o que a ajuda precisa refletir.

---

## Fase A — FLX-03 · Título de documento por página

- `src/app/layout.tsx` → `title: { default: 'Estoque TI · WAP', template: '%s · Estoque TI WAP' }`.
- Um `metadata.title` curto por página: Ativos, Movimentações, Itens, Pendências, Relatórios,
  Relatórios gerados, cada tela de `/admin/**`, Desenvolvedor (`/dev`, `/dev/destrutivo`).
- Ficha do ativo: `generateMetadata` com o patrimônio (fallback "Ativo sem patrimônio").
- `/login` é client ⇒ criar `src/app/login/layout.tsx` só com o metadata.
- A ajuda já tem metadata — não mexer.

## Fase B — blocos paralelos (arquivos disjuntos)

### B1 · FLX-01 — `next` nas duas portas
`src/lib/supabase/proxy.ts` · `src/lib/actions/auth.ts` · `src/app/login/**` (form) ·
`src/app/(app)/layout.tsx` · `src/app/(app)/relatorios/[filial]/page.tsx` ·
`src/app/(app)/relatorios/gerados/page.tsx` · `src/app/(app)/relatorios/gerados/[id]/page.tsx`
Grava `next=pathname+search` nos dois redirects do proxy e nos redirects de cookie **expirado**;
repassa por campo oculto no form de login; `signIn` redireciona com `destinoSeguro(next)`.
Precedente a copiar: o fluxo do visualizador (`proxy.ts:98-112` + `confirmarAcesso`).

### B2 · FLX-02 + FLX-04 + FLX-05
`src/app/(app)/page.tsx` · `src/components/layout/paleta-comandos.tsx`
- FLX-02: "Ver todas" → `/movimentacoes?filial=todas`.
- FLX-04: `contarConflitosAbertos` no `Promise.all` da home; linha destacada com link quando > 0.
- FLX-05: paleta ganha "Devolver ao fornecedor" (`fornecedor`/`baixa`/`sem conserto`) e
  "Novo equipamento" (`compra`/`cadastrar`), no grupo Ações já gateado por `podeEscrever`.

### B3 · MOV-01a + MOV-04 + MOV-07 + MOV-08 + MOV-14
`src/components/movimentacoes/nova-movimentacao-form.tsx` ·
`src/components/movimentacoes/nova/passo-revisao.tsx` ·
`src/app/(app)/movimentacoes/nova/page.tsx`
- 01a: box de erro com `tabIndex={-1}` + ref, `focus()` + `scrollIntoView({block:'nearest'})`
  na validação local **e** no retorno de servidor que faz `setPasso(2)`. (A metade `b` é da Onda B.)
- 04: `adicionar()` respeita `MAX_LOTE_MOVIMENTACAO` contando `itens.length + naOutraMetade.size`,
  com o mesmo toast de recusa da contrapartida.
- 07: motivo/termo/termoData da "repetir última" só quando `tipoValido`; senão limpa e mantém o warning.
- 08: enquanto a consulta de duplicata está em voo, "conferindo duplicatas…" ao lado do botão e
  Enter-de-registrar ignorado **só nessa janela** (clique segue livre; o aviso continua não-bloqueante).
- 14: `?duplicar=`/`?ativo=` que não resolve ⇒ banner âmbar no form.

### B4 · MOV-09 + MOV-13
`src/lib/actions/termos.ts` (+ dialog do termo) ·
`src/components/movimentacoes/nova/painel-sucesso.tsx` ·
`src/components/movimentacoes/devolucao-fornecedor-form.tsx`
- 09: `data`/`termo_data` no `MOV_SELECT`; termo abre com `mov.termo_data ?? mov.data ?? hoje` (editável).
- 13: `tabIndex={-1}` + `focus()` no `<h2>` ao montar, nos **dois** painéis de sucesso.

### B5 · ATV-01 + ATV-05 + PND-03
`src/lib/queries/ativos.ts` · `src/components/ativos/ativos-filtros.tsx` ·
`src/app/(app)/ativos/page.tsx` · `src/components/relatorios/pendencias-chips.tsx` ·
`src/components/relatorios/corpo-relatorio-v2.tsx` · `src/app/(app)/pendencias/page.tsx`
- 01: `service_tag`, `hostname`, `telefone`, `imei` no `.or()` de `aplicarFiltrosAtivos` + placeholder.
- 05: subtítulo honesto — com filtro "N encontrados"; recorte de cargo "N nas suas filiais";
  repouso de admin "N cadastrados" (usar os booleanos que a página já calcula).
- 03: prop de link opcional por chip; `/pendencias` e relatório **ao vivo para operador** viram
  `<Link>`; **visualizador por senha e snapshot congelado continuam `<span>`**.

### B6 · REL-02 + REL-10 + REL-13a
`src/components/relatorios/periodo-filtro.tsx` · `tabela-itens-grupo.tsx` ·
`manutencao-casos.tsx` · `celulas.tsx`
- 02: partir da query atual e sobrescrever só `preset`/`de`/`ate` (padrão de `gerados-filtro.tsx:33-38`).
- 10: importar o verde de `CLASSE_COR_DELTA` (fonte única) — não duplicar classe à mão.
- 13a: `print:whitespace-normal print:overflow-visible` na observação.

### B7 · ADM-01 + ADM-06 + ADM-07
`src/components/admin/item-dialog.tsx` · `src/components/admin/importar/importar-wizard.tsx` ·
`src/components/admin/usuarios/apagar-usuario-dialog.tsx` · `src/lib/validators/dev-destrutivo.ts`
- 01: confirmação no padrão da casa (`senha-acoes.tsx`: foco no Cancelar, frase nomeando o item).
- 06: `setFilialId('')` no `recomecar()`.
- 07: **investigar antes** o que a action/RPC de cada tela aceita; onde o servidor compara exato,
  o cliente continua exato e ganha só a dica "O texto não confere — digite exatamente {alvo}".
  Registrar o achado em `docs/DECISOES.md` (via relatório do agente).

### B8 · DEV-01 + DEV-02
`src/lib/queries/dev.ts` · `src/components/dev/integridade-painel.tsx` ·
`src/components/dev/destrutivo/painel-ativo.tsx` · `painel-reset.tsx` ·
`src/app/(app)/dev/destrutivo/page.tsx`
- 01: as duas entradas que faltam (`arquivo_termo_orfao`, `conflito_entre_filiais`) **e** rede
  permanente: chave devolvida pela RPC fora do catálogo aparece no fim, rotulada pela própria chave.
  Contagem derivada do tamanho do catálogo.
- 02: nome da filial (a página já carrega `listarFiliaisParaVinculo()`); mapa fixo chave→rótulo
  pt-BR na prévia do reset, com o `replace(/_/g,' ')` como fallback.

### B9 · UXG-01 + UXG-02 + UXG-08
`src/app/global-error.tsx` (novo) · `src/app/error.tsx` (novo) ·
`src/components/ui/dialog.tsx` · `src/components/ui/sheet.tsx` ·
`src/components/ativos/copiar-patrimonio.tsx` · `src/components/layout/user-menu.tsx` ·
`src/components/layout/viewer-header.tsx` · `src/components/relatorios/realtime-refresh.tsx` ·
`src/components/ui/skeleton.tsx`
- 01: `<html lang="pt-BR">`/`<body>` próprios, linguagem visual do `PainelErro`, botão de tentar de novo.
- 02: "Close" → "Fechar"; X `size-7` → `size-10 sm:size-7`. **Comentário no arquivo + ata em DECISOES.md.**
- 08: toast de erro no copiar (ausência de `navigator.clipboard` **e** permissão negada);
  `useFormStatus` nos dois sign-out (padrão `botao-ativar.tsx`); `motion-reduce:animate-none`
  no `animate-ping` e no `animate-pulse`; par `dark:` (ou token) no dot verde do "ao vivo".

## Testes novos (função pura — a contagem total não pode cair de 1.865)

Candidatos naturais: subtítulo do ATV-05; guarda do MOV-07; mapa de rótulos do DEV-02;
catálogo/rede permanente do DEV-01; helper de confirmação digitada do ADM-07;
`destinoSeguro`/montagem do `next` do FLX-01.

## Housekeeping

- Apagar `_claude_tmp/` (fora do git).
- Commitar `docs/ANALISE-UX-2026-08-07.md` e `docs/prompts/F27-onda-a-ux-ultracode.md`.
- Sujeira de git que não seja minha: não tocar, registrar no relatório.

## Definição de pronto

26 itens implementados e autoverificados um a um · `lint`/`test`/`build` limpos com saída colada ·
`supabase/` sem diff · `package.json` sem dependência nova · nenhum texto novo de UI em inglês ·
`CHANGELOG.md` + `README.md` + `docs/DECISOES.md` + ajuda atualizados ·
`docs/RELATORIO-F27.md` no padrão da casa · commits `feat(f27)`/`fix(f27)` · `main` pushada.
