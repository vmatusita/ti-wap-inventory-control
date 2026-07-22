ultracode

# OS-F11 (ultracode) — navegação e estrutura: busca global Ctrl+K · lista de movimentações · saldos por filial · ordenação e paginação de tabelas (+3)

Ordem **executável e autocontida**. Nasce da **Onda 3** do `docs/BACKLOG-UX.md` (22/07/2026). Objetivo em uma linha: dar ao sistema a **estrutura de navegação** que a operação diária pede — os **7 itens**: paleta de busca global (T1), ajuda contextual + atalho `?` (T3), ordenação e paginação decentes (T7), a11y/consistência de forms (T9), filtros do relatório na URL (T10), a **página de lista de movimentações** que nunca existiu (M8) e os saldos de itens **por filial lado a lado** (I4). **Zero migration, zero dependência nova.**

**Modo autônomo com acesso total (CLAUDE.md).** Você está rodando **de forma autônoma: ninguém vai responder perguntas — não pare para perguntar nem espere confirmação em nenhuma hipótese.** Régua de decisão: (1) esta ordem; (2) convenções do repositório/CLAUDE.md; (3) a opção mais simples e reversível — registrada em `docs/DECISOES.md` (decisão · alternativas · porquê). Se a mesma falha persistir após ~3 tentativas, mude de abordagem e registre. Bloqueio real (serviço fora, credencial faltando): contorne se for seguro; senão siga com o resto e registre a pendência no relatório.

Sistema **em produção com dados reais** (~1.600 ativos, 5 filiais). Esta OS não toca banco, não toca no import, não afrouxa salvaguarda nenhuma e **não pode regredir nada da F9/F10**. Item de fora do escopo §2 "aproveitado" = frente fora do escopo: pare a frente e registre.

**Pré-requisitos: F9 e F10 concluídas** (linhas no `README.md`; uma ordem por vez). **As âncoras desta ordem são por SÍMBOLO, não por linha** — a base real está duas ordens à frente da medição original: localize sempre por nome de função/componente (Grep), nunca confie em número de linha.

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code na raiz do repositório. O `CLAUDE.md` é lido sozinho e manda sempre. O orquestrador segue a §1; os blocos §W1–§W7 são os prompts completos dos subagentes. A autoridade do escopo e das decisões está na **§2 (decidido pelo Johnny, 22/07/2026)**.

---

## §0 — O que estamos construindo (diagnóstico já feito — âncoras por símbolo)

| ID | Fricção (fato) | Onde olhar |
|---|---|---|
| **T1** | Não há busca global nem paleta de comandos; cada lista tem busca própria e isolada; o `ui/command.tsx` já está no projeto (usado nos comboboxes) | `app-header.tsx` (sem busca), `ativo-combobox.tsx` (padrão de busca server) |
| **T3** | A `/ajuda` (F6B, com âncoras por seção) só é alcançável pela sidebar — nenhuma tela linka `#secao` no ponto de dúvida; o atalho `?` está registrado como backlog em `docs/DECISOES.md` (entrada sobre o atalho de ajuda) | `src/lib/ajuda/conteudo.ts` (ids das seções), `ajuda/page.tsx` |
| **T7** | Nenhuma tabela ordena por coluna; paginação é só Anterior/Próxima, sem salto nem tamanho | `ativos-table.tsx` (TanStack só exibição), `ativos-paginacao.tsx` |
| **T9** | `aria-invalid` ~1 ocorrência e `sr-only` ~0 no app; dialogs alternam `useState(enviando)` manual e `useTransition` (dívidas K/O do `docs/DIVIDA-TECNICA.md`) | `estornar-dialog.tsx`, `confirmar-assinatura-dialog.tsx` (manuais) vs `filial-dialog.tsx` (useTransition) |
| **T10** | Filtros das tabelas internas do relatório são efêmeros (estado local), divergindo do padrão URL do resto do app — somem no refresh e não são compartilháveis | `use-filtros-tabela.ts` ("puramente controlada"), `filtros-tabela.tsx` |
| **M8** | **Não existe lista de movimentações** — a sidebar vai direto ao form e o único histórico é a linha do tempo por ativo; "o que registrei hoje?" não tem resposta | `sidebar-nav.tsx` (item Movimentações → `/movimentacoes/nova`), pasta `app/(app)/movimentacoes/` só tem `nova/` |
| **I4** | Saldos de itens: uma filial por vez ou consolidado — sem visão das 5 lado a lado ("onde tem mouse sobrando?" = trocar filtro 5×) | `itens/page.tsx` (tabela sem coluna de filial), `queries/itens.ts` (`getSaldosItens(filialId | null)`) |

---

## §1 — Orquestração (sessão principal)

### 1.0 GATE de entrada

(a) **F9 e F10 concluídas** (README) e working tree **limpo** na `main`. (b) Baseline **verde hoje**: `npm run lint && npm run test && npm run build` — se a suíte já estiver vermelha antes de começar, **PARE e reporte** (não conserte falha pré-existente em silêncio). (c) `supabase/migrations/` fica **intocada** — esta OS não cria migration; frente que "precisar" de banco está com escopo errado. (d) `docs/BACKLOG-UX.md` §5 marca como **Onda 3** exatamente os 7 itens da §2. Falhou qualquer um → **PARE e reporte**.

### 1.1 Grafo de execução

```
FASE 0 (orquestrador)      ONDA 1 (6 frentes ∥ · arquivos disjuntos)       ONDA 2 (1 frente)        FINAL (orquestrador)
gate §1.0 · branch f11     W1 lista de movimentações (M8)                  W7 revisão adversarial   lint+test+build ·
componente LinkAjuda   →   W2 paleta global + atalho ? (T1 · T3-shell)  →  + E2E em DEV +        →  merge main · deploy ·
(contrato §1.5) ·          W3 ordenação e paginação (T7)                   emendas de docs +        smoke leitura ·
baseline verde             W4 saldos por filial (I4)                       RELATORIO-F11.md         resumo consolidado
                           W5 relatório na URL (T10)                       (fallback §1.4.4 se o
                           W6 a11y e forms (T9)                             push for barrado)
```

- **Isolamento (precedente F6A→F10):** subagentes paralelos na **mesma árvore**, branch única `f11`, propriedade de arquivos disjunta (§1.3). Worktrees baratos disponíveis → aceitável; decida, registre, siga.
- O único artefato compartilhado é o **`LinkAjuda`**, criado na **fase 0** (§1.5) — cada frente o aplica **nas suas próprias telas**; ninguém edita arquivo alheio para isso.
- **Ninguém toca** `package.json`, `next.config.ts`, `src/components/ui/**`, `.env`, `supabase/**`.

### 1.2 Regras globais

1. **Desenvolvimento e smokes dos subagentes contra o Supabase DEV** (projeto de ensaio); **nenhum subagente toca produção** — produção e deploy são só do orquestrador (§1.4). Custo **R$ 0**.
2. **Zero migration, zero RPC/trigger/view.** Leitura nova = função em `src/lib/queries/` sobre o que já existe (I4 usa a RPC existente N vezes, nunca uma nova).
3. **Zero dependência nova.** `package.json` sai **byte a byte igual**.
4. **Nenhum dado real** em código/teste/exemplo: `WAP0001234` / "Fulano da Silva".
5. Convenções CLAUDE.md: UI/erros/commits **pt-BR**; escrita via Server Actions + Zod; leituras em `src/lib/queries/`; client chama **proxies de action**, nunca importa `queries/` direto; datas `dd/MM/yyyy`; `tabular-nums`; Server Components por padrão.
6. **Verificação — rode de verdade:** `npm run lint && npm run test && npm run build` no recorte de cada frente e na união; leia as falhas, corrija a **causa raiz** e repita até passar. **Nunca** desabilite, pule ou delete teste para passar; funções puras novas ganham teste Vitest.
7. Cada subagente entrega: código na branch + checklist **autoverificado** + rascunho para `docs/DECISOES.md` + pendências.
8. **Invariantes intocáveis:** tudo da F9 e da F10 (badge, EstadoVazio, copiar patrimônio, chips de data, colar lote, carrinho, export CSV, rascunho, teto 30…); máquina de estados no banco; modelo de acesso (nível único + viewer por senha — a paleta e o badge **não** aparecem no shell do visualizador); import e salvaguardas.
9. Commits pt-BR estilo conventional por frente: `feat(f11): paleta de busca global`, etc. Commits pequenos e frequentes — são os checkpoints reais. **Nunca:** force push, `git reset --hard`, `git clean -fd`, amend de commit alheio.

### 1.3 Mapa de propriedade de arquivos (disjunto por construção)

| Dono | Arquivos |
|---|---|
| **Fase 0 (orquestrador)** | `src/components/layout/link-ajuda.tsx` (**novo**) |
| **W1** | `src/app/(app)/movimentacoes/page.tsx` + `loading.tsx` (**novos**), `src/components/movimentacoes/lista-movimentacoes.tsx` + `lista-filtros.tsx` (**novos**), `src/lib/queries/movimentacoes.ts`, `src/components/layout/sidebar-nav.tsx` (só o href), `src/app/(app)/movimentacoes/nova/page.tsx` (só o `LinkAjuda`) |
| **W2** | `src/components/layout/paleta-comandos.tsx` (**novo**), `src/app/(app)/layout.tsx`, `src/components/layout/app-header.tsx`, `src/components/movimentacoes/atalho-global.tsx` (ou atalhos dentro da paleta — decida e registre), `src/app/(app)/pendencias/page.tsx`, `src/app/(app)/admin/importar/page.tsx`, `src/app/(app)/relatorios/[filial]/page.tsx` (nesses três: **só** o `LinkAjuda`) |
| **W3** | `src/lib/queries/ativos.ts`, `src/app/(app)/ativos/page.tsx`, `src/app/(app)/ativos/novo/page.tsx` (só `LinkAjuda`), `src/components/ativos/{ativos-table,ativos-filtros,ativos-paginacao}.tsx` |
| **W4** | `src/lib/queries/itens.ts`, `src/app/(app)/itens/page.tsx`, `src/components/itens/**` |
| **W5** | `src/components/relatorios/{use-filtros-tabela.ts(+.test.ts), filtros-tabela.tsx}` e as tabelas consumidoras em `src/components/relatorios/` |
| **W6** | `src/components/ativos/*-dialog.tsx`, `src/components/admin/**`, `src/app/login/page.tsx` — **não** toca `components/movimentacoes/**`, `components/itens/**`, `components/relatorios/**` (donos acima; o que achar lá, anote pro W7) |
| **W7** | Revisão (toca qualquer arquivo para **corrigir**) + `README.md`, `CHANGELOG.md`, `docs/prompts/README.md`, `docs/DECISOES.md`, `docs/BACKLOG-UX.md`, `docs/ESPECIFICACAO.md` (§6: nova tela `/movimentacoes`), `src/lib/ajuda/conteudo.ts` (+ teste), `docs/RELATORIO-F11.md` (**novo**) |

Conflito previsto: nenhum arquivo com dois donos. Quem precisar de arquivo alheio: dono implementa, interessado especifica; na dúvida, anote pro W7.

### 1.4 Integração e final (orquestrador)

1. **Fim da onda 1:** mesma árvore → sem merge; `npm run lint && npm run test && npm run build` na união; smoke rápido em DEV (abrir `/movimentacoes`, paleta, `/ativos?ord=…`, `/itens?visao=filiais`).
2. **Lançar W7**; aplicar as correções dos achados.
3. **Merge na `main`** com o §3 todo verde → **deploy único** (o fluxo de deploy que o projeto já usa) → smoke de **leitura** em produção (dashboard, `/movimentacoes`, paleta, um relatório) → resumo consolidado no fim da resposta (~10 linhas, pt-BR).
4. **Fallback sem drama:** se o push/merge/deploy for **bloqueado pelo ambiente** (classificador de segurança em modo automático — precedente conhecido da F7), **não insista e não tente contornar**: encerre com a branch `f11` íntegra e testada, o `docs/RELATORIO-F11.md` completo e, no resumo, a linha exata que falta executar (ex.: `git checkout main && git merge f11 && git push`). O trabalho não se perde; o Johnny conclui com um comando.

### 1.5 CONTRATO entre frentes (fixo — mudar = decisão registrada)

- **`LinkAjuda` (fase 0):** `src/components/layout/link-ajuda.tsx`, Server Component: `{ ancora: string; rotulo?: string }` → ícone `?` discreto (`CircleHelp` do lucide, muted, alvo ≥40px no mobile, `aria-label` = rotulo ?? "Ajuda sobre esta tela") linkando `/ajuda#<ancora>`. **As âncoras são os ids reais das seções de `src/lib/ajuda/conteudo.ts`** — a fase 0 confere os ids existentes e os lista num comentário do componente; frente que citar âncora inexistente está errada, não o componente. **Mapa tela→âncora (ids que JÁ existem em `conteudo.ts` — os únicos válidos: `conceito, status, movimentacoes, termos, itens, pendencias, relatorios, como-fazer, admin, acesso`):** `/movimentacoes` e `/movimentacoes/nova` → `#movimentacoes` · `/pendencias` → `#pendencias` · `/relatorios/[filial]` → `#relatorios` · `/itens` → `#itens` · `/ativos` → `#status` · `/ativos/novo` → `#como-fazer` · `/admin/importar` → `#admin` (não existe seção "importar" — o import é nota dentro de Administração). **Não existem** seções `ativos`/`importar`/`compra` — não invente âncora nova; o conteúdo novo de ajuda do W7 entra **dentro** dessas seções, sem criar id que a Onda 1 já esteja referenciando.
- **Busca da paleta (W2):** reusa o **proxy de busca de ativos que já existe** em `src/lib/actions/movimentacoes.ts` (o mesmo do combobox — importar, **não** editar o arquivo; ele já busca por patrimônio/ST/hostname/marca/modelo/colaborador desde a F9).
- **`AtivosPaginacao` (W3):** ganha "página X de Y", salto e tamanho **mantendo a API atual retrocompatível** (props novas opcionais; sem prop nova = comportamento idêntico) — os outros consumidores (`/pendencias`, histórico de `/itens`) **não são editados** nesta OS e continuam funcionando.
- **Ordenação (W3):** whitelist exportada de colunas ordenáveis + parser puro `parseOrdenacao(param) → { coluna, direcao } | null` (com teste); param `ord=<coluna>.<asc|desc>`; inválido = ignorado.

---

## §W1 — Subagente W1: a lista de movimentações que nunca existiu (M8)

Você é um subagente executando a frente **W1** da OS-F11. Modo autônomo. Seus arquivos: linha W1 do §1.3. Leia antes: `queries/movimentacoes.ts` inteiro (padrões `TIMELINE_SELECT` — embed do autor via `profiles!movimentacoes_criado_por_fkey` — e o mecanismo de estorno `tipo='estorno'` + `estorno_de`), **`getHistoricoLancamentos` em `queries/itens.ts`** (o exemplar real do padrão anti-N+1: 2ª consulta `.in('estorna_id', ids)` + `Set` — em `movimentacoes` a coluna equivalente é `estorno_de`), `ativos/page.tsx` + `ativos-filtros.tsx` (o padrão URL de filtros a copiar), `ativos-paginacao.tsx` (reusar como está), `dominio.ts` (rótulos de tipo), `linha-do-tempo.tsx` (como estorno/estornada são exibidos).

### Entregas

1. **Query `listarMovimentacoes`** em `queries/movimentacoes.ts`: filtros `{ de, ate, tipo, filialId, q, page, pageSize=30 }`, `count: 'exact'`, ordenada por mais recente; embed do ativo (patrimônio/categoria/modelo, via `ativo_id`) e do operador (perfil via FK `criado_por` — padrão `TIMELINE_SELECT`); marca `ehEstorno` (`tipo === 'estorno'`) e `estornada` (2ª consulta fixa `.in('estorno_de', ids)` + `Set`, espelhando `getHistoricoLancamentos` — nunca N+1). **Busca `q` (decisão §2):** se o texto canonicaliza como patrimônio (`canonicalizarPatrimonio`) → igualdade em `ativos.patrimonio` via embed **`!inner`** (`select('…, ativos!inner(…)')` + `.eq('ativos.patrimonio', canon)`) — **padrão novo no projeto**: nenhuma query usa `!inner` hoje; sem ele o embed vira LEFT JOIN e o filtro **não recorta** as linhas; senão → `ilike` em `movimentacoes.colaborador`. A lista é 100% Server Component — **não** crie proxy de action.
2. **Rota `/movimentacoes`** (`page.tsx` novo + `loading.tsx` com skeleton, padrão F6B): título + `LinkAjuda` (âncora da seção de movimentações) + botão "Nova movimentação" (link `/movimentacoes/nova`) + filtros na URL (`lista-filtros.tsx`: período de/ate, tipo com rótulos do domínio, filial, busca — padrão visual/URL de `ativos-filtros.tsx`; mudar filtro reseta `page`) + tabela (`lista-movimentacoes.tsx`: Data · Tipo (pílula com `rotuloTipo`/`pillTipo` de `dominio.ts`; precedente de render em `bloco-ajuda.tsx`) · Patrimônio (link para a ficha, com fallback "sem patrimônio") · Colaborador · Filial · Operador · Obs truncada; badges "(estorno)"/"(estornada)" como na linha do tempo; colunas menos importantes somem no mobile) + `AtivosPaginacao` + `EstadoVazio` (F9) quando vazio.
3. **Sidebar:** o item "Movimentações" passa a apontar para **`/movimentacoes`** (decisão §2). O atalho `N`, o botão do header e o card do dashboard **continuam** indo direto a `/movimentacoes/nova` — zero fricção nova para registrar.
4. **`LinkAjuda`** também em `/movimentacoes/nova` (cabeçalho; âncora `#movimentacoes` — mapa §1.5).

### O que NÃO fazer

Não mexer no fluxo de nova movimentação (form/passos/painel), no `atalho-global.tsx` (é do W2), em validators/actions de escrita, nem inventar view/RPC.

### Aceite W1

- [ ] Em DEV: `/movimentacoes?tipo=saida&de=2026-07-01&ate=2026-07-31&q=WAP0001234` filtra, pagina e é compartilhável; back/forward ok; param inválido ignorado
- [ ] Buscar "Fulano" acha por colaborador; buscar "wap 4491" (canonicaliza) acha por patrimônio; estornada aparece marcada
- [ ] Sidebar → lista; `N`/header/dashboard → form direto; vazio usa `EstadoVazio`; skeleton no primeiro load
- [ ] `LinkAjuda` em `/movimentacoes` e `/movimentacoes/nova` com âncora válida (`#movimentacoes`)
- [ ] `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W2 — Subagente W2: paleta global Ctrl+K · atalho ? · ajuda contextual do shell (T1 · T3)

Você é um subagente executando a frente **W2** da OS-F11. Modo autônomo. Seus arquivos: linha W2 do §1.3. Leia antes: `app-header.tsx`, `(app)/layout.tsx` (os 3 modos de shell — a paleta só existe no shell do **operador**), `atalho-global.tsx` (a guarda de campos de texto a reusar), `ativo-combobox.tsx` (padrão de busca server com debounce), `ui/command.tsx` (o que já existe do cmdk), `src/lib/ajuda/conteudo.ts` (ids das âncoras).

### Entregas

1. **T1 — `paleta-comandos.tsx`** (client), montada no layout do operador: dialog do `Command` com 3 grupos — **Ativos** (busca server ≥2 chars com debounce ~300ms via o proxy existente do contrato §1.5; item mostra patrimônio·modelo·colaborador·status; Enter → `/ativos/<id>`), **Ir para** (as rotas da sidebar), **Ações** ("Nova movimentação" → `/movimentacoes/nova`, "Lançar item" → `/itens`). Abre por **Ctrl+K / Cmd+K** (estes abrem **mesmo com foco em input** — padrão de paleta; o modificador já desambigua) e **"/"** (este respeita a guarda de inputs). **Exporte a função `editando` de `atalho-global.tsx`** (você é o dono) e importe-a na paleta — não reescreva a guarda (ela já cobre INPUT/TEXTAREA/SELECT, `role="combobox"` e `isContentEditable`). Esc fecha; foco inicial no campo; `aria-label` no dialog. **Não** monta no shell do visualizador.
2. **Botão de busca no header** (`app-header.tsx`): ícone de lupa + `<kbd>Ctrl K</kbd>` no desktop (só ícone no mobile), abrindo a paleta — descoberta para quem não vive de atalho.
3. **T3 — atalho `?`**: `e.key === '?'` (nunca `e.code` — a posição física do `?` muda entre layouts, e ele **sempre chega com Shift**: a guarda de modificadores rejeita só Ctrl/Meta/Alt, como o `n` de hoje — **não** adicione guarda de `shiftKey`) + a guarda de inputs, navegando para `/ajuda`. Fecha o backlog registrado em `docs/DECISOES.md` (F6B, "Backlog devolvido ao Johnny": *"Atalho global `?` para a Ajuda (1 linha no `(app)/layout.tsx`)"* — cite-o no rascunho de decisão). Implementar no `atalho-global.tsx` **ou** dentro da paleta — decida pelo mais simples e registre.
4. **`LinkAjuda` nas telas do shell:** `/pendencias` (`#pendencias`), `/admin/importar` (**`#admin`** — não existe seção "importar") e `/relatorios/[filial]` (`#relatorios`) — no título da página. **Só** essa edição nesses arquivos.

### O que NÃO fazer

Não criar índice/busca própria (a busca de ativos é o proxy existente; a busca da ajuda continua na página dela); não adicionar a paleta ao viewer; não mexer no `N` além de conviver com ele; não tocar em `sidebar-nav.tsx` (é do W1).

### Aceite W2

- [ ] Ctrl+K/Cmd+K abrem a paleta inclusive com foco em input (o modificador desambigua); "/" e "?" NÃO disparam com foco em input/textarea/select/combobox; Esc fecha; teclado puro navega e seleciona
- [ ] Buscar "WAP0001234" → Enter abre a ficha; "Ir para Pendências" navega; lupa do header funciona no mobile
- [ ] `?` abre a ajuda respeitando a guarda; viewer por senha não tem paleta nem atalhos
- [ ] `LinkAjuda` presente em pendências/import/relatório com âncoras válidas; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W3 — Subagente W3: ordenação por coluna e paginação decente (T7)

Você é um subagente executando a frente **W3** da OS-F11. Modo autônomo. Seus arquivos: linha W3 do §1.3. Leia antes: `queries/ativos.ts` (`listarAtivos` — filtros, `order` atual, tipo de params), `ativos/page.tsx` (parse de searchParams), `ativos-table.tsx` (TanStack em modo exibição), `ativos-paginacao.tsx` (API atual e quem mais a consome — `/pendencias` e o histórico de `/itens`: **não edite os consumidores**).

### Entregas

1. **Ordenação na URL (`/ativos`):** whitelist exportada — `patrimonio`, `categoria`, `modelo`, `status`, `colaborador_atual` (colunas da própria tabela; **`marca` fica fora**: a tabela funde "Marca / Modelo" num cabeçalho único `id: 'modelo'` — ordenar ali ordena por `modelo`; **filial** fica fora por ser embed — registre os dois cortes) — + parser puro `parseOrdenacao` com teste (contrato §1.5). Colunas nuláveis (`patrimonio`, `colaborador_atual`) ordenam com `nullsFirst: false` (nulos por último em asc e desc — espelha `buscarAtivosParaCombobox`). `listarAtivos` ganha o param de ordenação (sem `ord`, o default atual `updated_at desc` permanece); `ativos-table.tsx` ganha cabeçalhos clicáveis nas colunas da whitelist com ciclo asc→desc→limpa, indicador visual e `aria-sort`; estado vive na URL (`?ord=patrimonio.asc`), preservando os demais filtros e resetando `page`.
2. **Paginação melhor (`ativos-paginacao.tsx`):** "Página X de Y", salto direto (input numérico com submit) e tamanho de página (25/50/100, default o atual) via URL (`?pp=`), **com API retrocompatível** (§1.5) — sem as props novas, comportamento idêntico ao de hoje para os outros consumidores. `ListarAtivosParams`/`listarAtivos` ganham `pageSize?` (validado ∈ {25, 50, 100}, default `PAGE_SIZE` = 50; o retorno reflete o valor usado); `ativos/page.tsx` valida `pp` e repassa.
3. **`LinkAjuda`** em `/ativos` (âncora `#status`) e `/ativos/novo` (`#como-fazer`) — não existem seções `ativos`/`compra` na ajuda; siga o mapa do §1.5.

### O que NÃO fazer

Não adicionar ordenação em pendências/itens/relatórios (fica para quando pedirem — o componente já sai pronto para reuso), não mudar o default de ordenação atual, não tocar nos consumidores da paginação.

### Aceite W3

- [ ] `/ativos?ord=marca.desc&pp=100&status=em_uso` ordena, dimensiona e é compartilhável; back/forward ok; `ord`/`pp` inválidos ignorados; trocar filtro/ordenar reseta a página
- [ ] Cabeçalhos com indicador e `aria-sort`; teclado aciona; `/pendencias` e histórico de `/itens` seguem idênticos (zero edição neles)
- [ ] `LinkAjuda` em `/ativos` (`#status`) e `/ativos/novo` (`#como-fazer`)
- [ ] `parseOrdenacao` com teste verde; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W4 — Subagente W4: saldos das 5 filiais lado a lado (I4)

Você é um subagente executando a frente **W4** da OS-F11. Modo autônomo. Seus arquivos: linha W4 do §1.3. Leia antes: `queries/itens.ts` (`getSaldosItens(filialId | null)` sobre a RPC `rel_saldo_itens`), `queries/filiais.ts` (`listarFiliais` — nomes vêm daqui, **nunca** hard-code), `itens/page.tsx` (tabela por grupo; filtros `q`/`grupo` client-side), `itens-filtros.tsx`.

### Entregas

1. **`getSaldosPorFilial()`** em `queries/itens.ts`: `Promise.all` de `getSaldosItens(f.id)` para cada filial de `listarFiliais` (**número fixo de chamadas = nº de filiais**, hoje 5 — nunca por item) + o consolidado; retorna estrutura por item × filial pronta para a tabela. Zero RPC nova.
2. **Toggle "Consolidado | Por filial"** em `/itens`, estado na URL (`?visao=filiais`): na visão por filial, a tabela de saldos ganha uma coluna de **estoque por filial** (cabeçalhos = nomes reais de `listarFiliais`) + coluna de total; badge "faltam N" aparece na célula da filial correspondente; grupos e filtros `q`/`grupo` continuam valendo; o select de filial **fica oculto** nessa visão (decisão §2 — ele é redundante ali). Mobile: scroll horizontal com a coluna do item fixa se trivial (senão, scroll simples), `tabular-nums`.
3. **`LinkAjuda`** em `/itens` (âncora `#itens`).

### O que NÃO fazer

Não mexer no dialog de lançar (F10 acabou de refazê-lo), no histórico, nos exports (F10), nem criar view/RPC de agregação.

### Aceite W4

- [ ] `/itens?visao=filiais` mostra as 5 colunas com os nomes reais; consolidado continua o default e idêntico ao de antes; URL compartilhável
- [ ] "Faltam N" aparece na filial certa (validar em DEV com lançamentos fictícios em 2 filiais); filtros `q`/`grupo` funcionam nas duas visões
- [ ] `LinkAjuda` em `/itens` (`#itens`); sem regressão no lançar/histórico/export da F10; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W5 — Subagente W5: filtros do relatório na URL (T10)

Você é um subagente executando a frente **W5** da OS-F11. Modo autônomo. Seus arquivos: linha W5 do §1.3. Leia antes: `use-filtros-tabela.ts` + `.test.ts` (o hook é "puramente controlado" — estado local), `filtros-tabela.tsx`, as tabelas consumidoras em `components/relatorios/` (saídas, entradas, transferências, movimentações, itens — liste-as por grep de `useFiltrosTabela`), `relatorios/[filial]/page.tsx` (como `preset`/`de`/`ate` já vivem na URL — o padrão a estender), `viewer-auto-refresh.tsx`/`realtime-refresh.tsx` (o refresh não pode apagar os params).

### Entregas

1. **`use-filtros-tabela` passa a persistir na URL** com **prefixo por tabela** (decisão §2). Os campos são **Selects categóricos** (`CampoFiltro` — ex.: `motivo`, `filial`), não busca textual: os params ficam `?sd.motivo=<cod>&sd.filial=<id>` (Saídas), `?en.motivo=<cod>` (Entradas) etc. — valor = `Opcao.valor`, ausente = todas. Prefixo curto passado por argumento; assinatura pública do hook preservada ao máximo (consumidores mudam só para passar o prefixo). **`filtros-tabela.tsx` permanece inalterado** — é puramente controlado, sem estado próprio; a mudança vive no hook + nas tabelas consumidoras. Extraia a (de)serialização para funções puras testáveis; atualize o `.test.ts` (sem apagar casos — adapte).
2. **Comportamento:** refresh/back/forward preservam filtros; "limpar" remove os params; o realtime/auto-refresh (`router.refresh`) não os perde (são URL); impressão ignora os filtros ativos como hoje (confira o CSS de print); o **viewer por senha** usa as mesmas rotas — teste com uma senha de DEV.
3. Nenhuma mudança visual além do necessário.

### O que NÃO fazer

Não mexer no período (`preset/de/ate` já são URL), nem em snapshot/geração, nem nos gráficos, nem adicionar filtros novos.

### Aceite W5

- [ ] Filtrar a tabela de Saídas, dar F5 → filtro continua; duas tabelas filtradas ao mesmo tempo sem colisão de params; link colado em outra aba reproduz o estado
- [ ] Viewer por senha: filtra, auto-refresh não apaga; impressão inalterada
- [ ] Testes do hook verdes (adaptados, não deletados); `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W6 — Subagente W6: a11y e consistência de forms (T9)

Você é um subagente executando a frente **W6** da OS-F11. Modo autônomo. Seus arquivos: linha W6 do §1.3 (repare no que é **de outros donos** nesta OS — `components/movimentacoes/**`, `components/itens/**`, `components/relatorios/**`: não toque; anote achados para o W7). Leia antes: `docs/DIVIDA-TECNICA.md` (dívidas K e O — o recorte desta frente paga **parte** delas), `estornar-dialog.tsx` e `confirmar-assinatura-dialog.tsx` (`useState(enviando)` manual), `filial-dialog.tsx`/`convidar-usuario-dialog.tsx` (`useTransition` — o padrão-alvo), `login/page.tsx`.

### Entregas

1. **Convergir loading para `useTransition`** nos diálogos que ainda usam `useState` de loading manual — inventário real: `estornar-dialog`, `confirmar-assinatura-dialog` (**dois** diálogos no arquivo: confirmar **e** desfazer) e `corrigir-patrimonio-dialog`; `anotar-dialog` e todo `components/admin/**` **já** usam `useTransition`. **Não tocar** `editar-ativo-dialog` (react-hook-form / `isSubmitting`) nem `login/page.tsx` (`useActionState`) — não são `useState` manual, e a decisão §2 proíbe migração para RHF. Comportamento idêntico, anti-duplo-submit preservado.
2. **Erros de formulário anunciáveis — só onde há erro inline por campo** (a maioria dos forms do app é toast-only, e o sonner já anuncia via `aria-live`: nesses, **nada a fazer**). Alvos reais conhecidos: `corrigir-patrimonio-dialog` (o `<p>` do preview — faltam `aria-invalid` **e** `aria-describedby`) e `convidar-usuario-dialog` (já tem `aria-invalid`; falta `id` no `<p>` de erro + `aria-describedby`). Varra o recorte por outros casos inline; mensagens continuam as mesmas.
3. **Ícones-só e leitores de tela:** varrer botões só-ícone dos seus diretórios — todos com `aria-label`; adicionar `sr-only` onde um rótulo visível não existe e o `aria-label` não basta (ex.: estados dinâmicos). Foco visível conferido nos elementos tocados.
4. **Foco inicial nos dialogs destrutivos** dos seus diretórios: botão Cancelar (padrão do revogar da F9).

### O que NÃO fazer

Não redesenhar forms, não trocar textos, não tocar em schemas/actions, não instalar nada, não sair dos seus diretórios.

### Aceite W6

- [ ] Grep no seu recorte: zero dialog com `useState` de loading manual; submissão dupla continua impossível
- [ ] Com leitor de tela (ou inspeção de árvore de acessibilidade): erro de form é anunciado (aria-invalid + describedby ligados); ícones-só têm nome acessível
- [ ] Nenhuma mudança visual perceptível além de foco; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W7 — Subagente W7 (ONDA 2): revisão adversarial + E2E + emendas + relatório

Você é um subagente executando a frente **W7** da OS-F11, sobre a base com W1–W6 integrados. Seu papel é **quebrar** o que as frentes entregaram, emendar os documentos e deixar a run auditável. Corrija o que achar; registre tudo (ok / corrigido / pendência justificada).

1. **Regressão em DEV** (seed fictício — `npm run db:seed` **no Supabase DEV, jamais em produção**): fluxos centrais (movimentação ponta a ponta, compra, lançamento com carrinho F10, export F10, estorno) + **tudo da F9/F10** + os 7 itens novos.
2. **Interação de atalhos (adversarial):** `N`, `L`, `Ctrl+K`, `/`, `?` — nenhum dispara com foco em campo de texto/combobox; nenhum colide com o outro; nada disso existe no shell do viewer; paleta com foco preso e Esc.
3. **URL state:** `ord`/`pp` (ativos), filtros de `/movimentacoes`, `visao=filiais` (itens), prefixos do relatório — compartilháveis, back/forward, inválido ignorado sem crash, `page` resetando quando deve.
4. **Escopo e higiene:** `git diff main...f11 --stat` só arquivos do mapa §1.3; `package.json` **byte a byte igual**; `supabase/` intocada; nenhum item fora da §2; nenhum dado real.
5. **A11y dos novos elementos:** paleta, cabeçalhos ordenáveis (`aria-sort`), toggle de visão, `LinkAjuda` (alvo/foco/label), contraste dos indicadores — AA.
6. **E2E documentado:** roteiro reproduzível de 12–18 passos cobrindo os 7 itens.
7. **Emendas:** `README.md` (status F11), `CHANGELOG.md` (entrada F11 com os 7), `docs/prompts/README.md` (linha F11), `docs/DECISOES.md` (entrada `2026-07-22 · F11`: decisões da §2 + rascunhos das frentes + o fechamento do backlog do atalho `?`), `docs/BACKLOG-UX.md` (Onda 3 concluída — as três ondas de UX fecham aqui; **permanecem abertas** as linhas "Já previstos (F5/F6C)" e "Exigem decisão" A8/T11/T12 — M11 fechou na F10: registre), `docs/ESPECIFICACAO.md` §6 (nova tela `/movimentacoes` e a mudança do destino da sidebar, citando a decisão), `src/lib/ajuda/conteudo.ts` (+ teste): blocos novos — busca global e atalhos (`Ctrl+K`, `/`, `?`), lista de movimentações, ordenação/tamanho de página, saldos por filial, filtros do relatório que agora ficam no link.
8. **`docs/RELATORIO-F11.md` (novo, pt-BR — evidências, não afirmações):** o que mudou por frente (arquivos e porquês), decisões (aponte `DECISOES.md`), **saídas reais e completas** de `npm run lint`, `npm run test` e `npm run build` na base final, o roteiro E2E executado com resultado, pendências/débitos (inclusive o que ficou da dívida K), e — se o fallback §1.4.4 disparou — a linha exata pendente.

### Aceite W7

- [ ] Cada item acima com veredito; correções commitadas; E2E documentado; RELATORIO-F11.md completo com as saídas reais
- [ ] Docs emendados; `lint`+`test`+`build` limpos na base final

---

## §2 — Escopo e decisões (Johnny, 22/07/2026) — autoridade

1. **Executar exatamente os 7 itens da Onda 3** do `docs/BACKLOG-UX.md` §5: **T1, T3, T7, T9, T10, M8, I4**. Nada além (o backlog não tem Onda 4 — o que sobrar de ideia nova vai para o resumo como sugestão, não como código).
2. **Decisões pré-tomadas** (W7 consolida em `DECISOES.md`):
   - **M8**: a sidebar "Movimentações" passa a apontar para a **lista** `/movimentacoes`; o atalho `N`, o botão do header e o card do dashboard seguem indo **direto ao form** — registrar como decisão de navegação. Busca `q` da lista: canonicaliza→patrimônio (embed `!inner`), senão colaborador (`ilike`) — um campo só, sem tentar OR entre tabelas no PostgREST. A lista **não** inclui filtro por operador nesta OS (o backlog o sugeria): "o que registrei hoje?" é atendido pela ordenação por data + período/tipo/filial + busca; filtro por operador fica como sugestão no resumo — registrar o corte.
   - **T1**: atalhos **Ctrl+K/Cmd+K** e **"/"**; busca reusa o proxy existente (zero código de busca novo); paleta inexistente no shell do visualizador.
   - **T3**: âncoras = ids reais das seções de `conteudo.ts`; atalho `?` fecha o backlog registrado em DECISOES.
   - **T7**: whitelist de ordenação só com colunas da tabela `ativos` (embed de filial fora, registrado); tamanhos de página 25/50/100 com default = o atual; tudo na URL.
   - **T9**: **sem** migração para react-hook-form (dívida K permanece aberta) — só `useTransition` + aria/`sr-only`/foco, e **apenas nos diretórios do W6**; diálogos de itens/movimentações/relatórios são anotados (W6→W7) e ficam como pendência registrada no `RELATORIO-F11` para uma próxima OS.
   - **T10**: params com **prefixo curto por tabela** sobre os `CampoFiltro` categóricos existentes (sem inventar busca textual); API do hook preservada; `filtros-tabela.tsx` intacto; testes adaptados, nunca deletados.
   - **I4**: N chamadas fixas da RPC existente (uma por filial de `listarFiliais`) em `Promise.all`; zero RPC nova; toggle na URL; select de filial oculto na visão por filial.
   - **Relatório**: além do resumo no chat, `docs/RELATORIO-F11.md` com evidências é entrega obrigatória (execução pode ser desatendida).
3. **Idioma:** narrativa, decisões, relatório e UI em **pt-BR**; código e identificadores em inglês; commits pt-BR estilo conventional (padrão do repositório).

## §3 — Aceite geral (orquestrador)

- [ ] Gate §1.0 (F9+F10 fechadas; baseline verde); fase 0 criou `LinkAjuda`; propriedade §1.3 respeitada (diff confere)
- [ ] Aceites W1–W7 completos; os **7 itens** da §2 entregues; revisão adversarial sem pendência crítica
- [ ] **Zero migration** (`supabase/` intocada), **zero dependência nova** (`package.json` intacto), **zero dado real**, custo R$ 0
- [ ] Invariantes §1.2.8 intactas: máquina de estados no banco; nível único + viewer por senha (paleta e badge **não** aparecem no shell do visualizador); import e salvaguardas; **tudo da F9/F10 sem regressão**
- [ ] `npm run lint` + `npm run test` + `npm run build` verdes na base final — saídas reais coladas no `RELATORIO-F11.md`
- [ ] Merge na `main` + deploy + smoke de leitura **ou** fallback §1.4.4 executado com a pendência de 1 linha documentada
- [ ] `DECISOES.md` consolidado; README/CHANGELOG/prompts/BACKLOG-UX/spec/ajuda emendados; `RELATORIO-F11.md` completo; resumo final em pt-BR (~10 linhas)
