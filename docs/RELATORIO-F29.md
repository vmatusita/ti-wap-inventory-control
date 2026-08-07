# Relatório — F29 · Onda B2 (relatórios, administração e base global)

**Ordem:** `docs/prompts/F29-onda-b2-relatorios-admin-ultracode.md` (18 itens)
**Fonte:** `docs/ANALISE-UX-2026-08-07.md` §§6–8 · **Plano:** `PLAN.md`
**Base:** `1223ed4` (fim da F28) · **Data:** 07/08/2026

Esta fase fecha a **Onda B** da análise de UX: a metade que a F28 não cobriu — relatórios,
administração e a base transversal (a11y, consistência, contraste).

---

## 1. Baseline medido antes de editar

| | Antes | Depois |
|---|---:|---:|
| Arquivos de teste | 95 | **100** |
| Testes | 2.041 | **2.121** |
| Pares medidos por `scripts/contraste.mjs` | 44 | **61** |
| Contraste no CI | não | **sim** |
| Dependências em `package.json` | 27 + 14 dev | **iguais** |
| Diff de `supabase/` | — | **vazio** |

14 commits, 117 arquivos, +4.379 / −797.

---

## 2. Como a fase foi executada

1. **Mapeamento paralelo** (7 leitores só-leitura, um por frente) antes de qualquer edição —
   é dele que saíram os fatos F1–F16 do `PLAN.md`, inclusive os três que **desmentiram a
   ordem** (§4).
2. `PLAN.md` autossuficiente, commitado antes da primeira edição.
3. Quatro frentes disjuntas em sequência — REL (1–8), ADM (9–12), UXG (14–18) —, com
   `lint` + `test` ao fim de cada uma e um commit por item ou par correlato.
4. **Item 13 (alvos de toque) por último e isolado**, como a ordem manda: ele toca ~15
   arquivos e conflitaria com qualquer frente rodando em paralelo.
5. **Revisão adversarial em contexto fresco**: 5 lentes independentes sobre o diff da fase,
   cada achado submetido a um **cético** encarregado de refutá-lo. 6 achados, **4
   confirmados e corrigidos**, 2 refutados (§5).

---

## 3. Checklist dos 18 itens — autoverificado

### Bloco 1 · Relatórios

| # | Item | Estado | Evidência |
|---|---|---|---|
| 1 | **REL-03** preset "Semana passada" | ✅ | `periodo.ts:36-41` (PRESETS) e o `case 'semana-passada'`; `semanaUtilAnterior` é o atalho do diálogo. **T11 não foi resolvida** — a dualidade é herdada e travada por teste ("difere da janela do preset — a dualidade é deliberada"). 18 testes novos em `periodo.test.ts`. |
| 2a | **REL-04a** aviso de versão existente | ✅ | `consultarVersaoDoPeriodo` (só leitura, `exigirPapel('operador')`); o diálogo consulta ao abrir e a cada mudança de **data ou escopo** (a chave do efeito inclui `slugAlvo`), com debounce de 350 ms e descarte de resposta obsoleta. Texto por função pura testada. |
| 2b | **REL-04b** abre com o período ativo | ✅ | `periodoInicialDoDialog(periodo, semana, teto)`, testada; a página passa o período resolvido. Atalhos "Usar semana corrente"/"Usar semana passada". |
| 2c | **REL-04c** corrida de versão | ✅ (sem migration) | A constraint **já existia** (`0010:16` + `0013:10-11`) — ver §4.1. Entregue a mitigação de app: reconhecimento do `23505` + renumeração em até 4 tentativas, reaproveitando o snapshot. |
| 3a | **REL-05a** paginação | ✅ | `GERADOS_PAGE_SIZE = 30`, `.range()` + `count: 'exact'`; `AtivosPaginacao` preserva a query (o filtro de filial sobrevive à virada de página). |
| 3b | **REL-05b** badge "superada" | ✅ (melhor que o pedido) | **Exata**, não aproximada — uma consulta extra de 4 colunas recortada pelas datas da página. Ata em `DECISOES.md`. |
| 3c | **REL-05c** navegação no snapshot | ✅ | `vizinhosDoRelatorio` + "Ver este período no ao vivo" (slug do próprio `meta`, sem query). Os três destinos ficam em `/relatorios/**` — provado por teste (§6). |
| 4a | **REL-06a** tooltips + corte do rótulo | ✅ | `ChartTooltip` em empilhadas e divergentes (esta com `formatter` próprio: os valores de saída são **negativos** no dado). Corte por `deveRotularSegmento(valor, maxTotal)`, testada — de "≥2" para "≥1 se couber". |
| 4b | **REL-06b** série longa | ✅ | `mostrarRotulosDaSerie(qtd)` (teto 20) + `YAxis` enxuto quando os rótulos somem. |
| 5 | **REL-07** Δ com valor anterior | ✅ | `textoDelta` usa `periodoAnterior`, a **mesma** função do motor (que mudou de casa por isso). Vale no ao vivo **e** no congelado (o período vem do `meta`). Seta e número seguem visíveis. |
| 6 | **REL-08** "Copiar texto" completo | ✅ | `gerarTextoResumo(resumo, extras?)` — linha de KPIs no topo + bloco "Em estoque (N)". **Nos dois corpos**, v1 e v2 (achado da revisão, §5.3). Sem extras a saída é byte a byte a de antes, travado por teste. |
| 7a | **REL-09a** âncoras | ✅ | `id="resumo"` no card + chips "Resumo" e "Observações" (este condicional a `s.meta.observacao`). |
| 7b | **REL-09b** grupo recolhido abre | ✅ | `grupo-colapsavel.tsx` escuta o hash no mount e no `hashchange`; **só abre**, nunca fecha. |
| 8 | **REL** regra transversal | ✅ | Nada novo só em hover: o Δ mantém seta+número; a `Dica` abre por **foco de teclado**. Navegação nova é `print:hidden`. Nenhuma contagem alterada (§6). |

### Bloco 2 · Administração

| # | Item | Estado | Evidência |
|---|---|---|---|
| 9a | **ADM-02a** "aguardando primeiro acesso" | ✅ | `last_sign_in_at` entrou em `ContaAuth`/`UsuarioAdmin`; regra pura `aguardandoPrimeiroAcesso(u, authIndisponivel)` — cobre **`last_sign_in_at` null OU nome vazio**, com a guarda contra acusação em massa quando o Auth cai. 4 testes. |
| 9b | **ADM-02b** "Gerar novo link de acesso" | ✅ | Action nova reaproveitando o ramo de recuperação (extraído para helper); **as duas travas do convite repetidas** (`exigirAdmin` + anti-dev com falha fechada), com tripwire de fonte. Trilha `convite_reenviado`. |
| 10a | **ADM-03a** filtros | ✅ | Usuários (nome, e-mail, **rótulo** do cargo, **nomes** das filiais) e Itens (nome, grupo); `aria-label` e contagem "N de M" **nos dois**. |
| 10b | **ADM-03b** ordenação | ✅ | `created_at desc`. Ata registrada. |
| 11a | **ADM-04a** preview do kit | ✅ | `descreverKit(payload, motivoRotulo)` pura e testada (6 casos), com `rotuloTipo`/`rotuloTermo`/`rotuloCategoria`. Campo ausente **não** vira "não informado". |
| 11b | **ADM-04b** duplicar | ✅ | `duplicarDe` abre o diálogo em modo criação; nome "Cópia de {nome}" cortado em 80 (o limite do schema). |
| 12a | **ADM-05a** link + senha | ✅ | `criarSenhaAcesso` devolve a URL pública derivada da requisição (padrão do link de convite — não há URL base no ambiente); botão "Copiar link e senha" com mensagem pronta. |
| 12b | **ADM-05b** "Testar senha…" | ✅ | Action com `exigirAdmin`, `verificarSenha` (timing-safe, o mesmo do login público), retorno **só** `{confere}`. Tripwires de fonte provam que nada mais sai. Sem trilha — ata em `DECISOES.md`. |

### Bloco 3 · Base global

| # | Item | Estado | Evidência |
|---|---|---|---|
| 13 | **UXG-03** alvos de toque | ✅ | Os 2 `<button>` nativos (ordenação e stepper) + 14 botões `h-7`/`h-8` + os campos das **quatro** barras de filtro e o gatilho compartilhado de filial. `ui/` intocado. |
| 14 | **UXG-04** navs roláveis | ✅ | `NavRolavel` nas três; **overlay**, não `mask-image` (ata). O `sticky` dos chips foi para o wrapper. |
| 15 | **UXG-05** `role="alert"` | ✅ | `nova-compra-form` (×2, a do servidor com foco+rolagem), `colar-lista-dialog`, `apagar-usuario-dialog`, `mesa-conflitos` (os 2 boxes pós-consulta). `filial-dialog` **ganhou** a caixa que não existia (ata). |
| 16a | **UXG-06a** loading anunciado | ✅ | `Carregando` nos 13; o anúncio é **irmão** do conteúdo para não quebrar o `space-y-*` (ata). |
| 16b | **UXG-06b** skeletons certos | ✅ | `dev/loading.tsx`, `ativos/novo/loading.tsx` e `movimentacoes/devolucao-fornecedor/loading.tsx` — os dois últimos a ordem permitia registrar como "não vale o custo"; valeram. |
| 17 | **UXG-07** contraste no CI | ✅ | 17 pares novos, **todos medidos antes** de virarem exigidos, **nenhum reprovou** → sem known-fail novo. Step antes do build + `npm run contraste`. Portão provado com par forjado (§7). |
| 18a | **UXG-10a** campo-placebo | ✅ | `w-64` no desktop (é um `<button>` — ata), lupa no mobile. |
| 18b | **UXG-10b** "Recentes" | ✅ | `lib/ativos/ativos-recentes.ts` (`sessionStorage`, teto 5, **validação na leitura**) + `LembrarAtivoRecente` na ficha. 8 testes. |
| 18c | **UXG-10d** `?` abre overlay | ✅ | `AtalhosDialog` com link "Documentação completa". **3 páginas de ajuda e 2 testes** atualizados. |
| 18d | **UXG-10e** marca é link | ✅ | Operador → `/`; visualizador → Consolidado (nunca `/`, que o proxy devolveria à porta da senha). `marca.tsx` continua burro. |
| 18e | **UXG-12** user-menu | ✅ | E-mail (`text-xs`) e, **só para operador**, "Escreve em: {filiais}". `Operador.email` veio de `getOperador`, que já lia o user. |

---

## 4. O que a medição desmentiu (e por que isso muda o item)

### 4.1 A corrida de versão do snapshot nunca produziu duplicata

A ordem (item 2c) e a análise (REL-04) descrevem `max+1` como "duas queries sem lock: dois
operadores geram duplicata em silêncio", e autorizam uma constraint única aditiva **em
handoff**.

Ela **já existe desde a F3**: `0010:16` cria a tabela com
`unique (periodo_de, periodo_ate, filial_id, versao)`, e a `0013:10-11` acrescenta o índice
com `coalesce(filial_id, -1)` — exatamente para cobrir o consolidado, onde `NULL` não colide
com `NULL`. O comentário da `0013` descreve o cenário palavra por palavra.

Consequência: **nenhuma migration, nada em handoff**, `supabase/` com diff vazio. O defeito
real era **perda** (o segundo operador levava erro genérico e o snapshot as-of ia junto), e é
isso que a mitigação de app conserta.

### 4.2 `filial-dialog` não tinha a caixa de erro que o item supunha

O UXG-05 lista o arquivo entre as "caixas sem `role`". Não havia caixa: o erro ia só por
`toast.error`. Entregue a caixa nova, no padrão dos irmãos. Ata registrada.

### 4.3 O stepper não estava onde a ordem dizia

A ordem aponta `nova-movimentacao-form.tsx:1085-1095`; ali está a função `reiniciar()`. O JSX
do stepper está em **1216-1248** — e é `<button>` **nativo**, sem classe de altura nenhuma,
como os botões de ordenação de `ativos-table.tsx`. Nos dois usei `min-h` (não `h`): são
`inline-flex` dentro de `<th>`/`<li>`, e altura fixa desalinharia os vizinhos.

### 4.4 O padrão de alvo de toque tem 6 variantes, não 3

A ordem cita "12 usos" de `h-10 sm:h-8`. O grep exaustivo achou **24 linhas** nas três
variantes exatas e mais ~13 nas irmãs (`sm:h-7`, `sm:size-7`, `sm:min-h-8`). A regra real,
documentada em `acoes-dev.tsx:63-64`, é **espelhar o irmão da linha** — foi ela que segui,
e é por isso que `linha-do-tempo` recebeu `sm:h-7` e não `sm:h-8`.

---

## 5. Revisão adversarial — 6 achados, 4 confirmados

Cinco lentes independentes (vazamento do viewer · correção dos relatórios · segurança do
admin · base global · cobertura dos 18 itens), cada achado submetido a um **cético**
encarregado de refutá-lo.

**A lente do vazamento do visualizador voltou VAZIA** — nenhum achado.

### 5.1 ✅ corrigido · O campo cresceu e o botão ao lado não

Subir o `Input` dos filtros para `h-10` no celular sem subir o "Pesquisar"/"Limpar"/"Filtrar
por filial" ao lado quebrou o alinhamento — e deixou justamente aqueles botões nos 32px que o
item 13 existe para corrigir. Corrigido nas **quatro** barras de filtro mais o gatilho
compartilhado. `/ativos` não estava na lista da ordem, mas usa o mesmo gatilho: deixá-lo fora
produziria uma linha de alturas mistas, pior que o defeito original.

### 5.2 ✅ corrigido · `docs/RELATORIO-F29.md` não existia

Este arquivo. O `CHANGELOG.md` e o `README.md` já apontavam para ele.

### 5.3 ✅ corrigido · O "Copiar texto" dos snapshots v1 ficou mudo

`CorpoRelatorioV1` (o corpo dos snapshots pré-F3B, que continuam abrindo pelo link antigo) não
recebia os extras: o **mesmo botão** produziria textos diferentes conforme a idade do snapshot,
sem nada na tela explicando. Ali `disponiveisPorModelo` já é a lista plana, então entra sem
achatar. Guarda de fonte trava os dois corpos.

### 5.4 ✅ corrigido · Uma leitura que falha virava uma mentira específica

`lerUltimaVersao` fazia `const { data } = await q` — e o supabase-js **nunca rejeita a promise**
em falha de rede: devolve `{data: null, error}`. A falha virava "período virgem", a próxima
versão seria sempre 1, o insert bateria no índice único nas 4 tentativas do laço **novo** e o
operador levaria *"Outra pessoa gerou este mesmo período agora há pouco"* sobre uma queda de
infraestrutura.

Este é o achado mais instrutivo da fase: **foi o laço da F29 que transformou um erro genérico
numa afirmação falsa**. Antes, a mesma leitura quebrada produzia `traduzErroBanco` — feio, mas
honesto. Agora a leitura distingue "não há versão" de "não deu para saber": a geração **recusa**
e deixa rastro; o aviso do diálogo segue degradando de propósito (perder um aviso não é perder
a geração, e isso está documentado no componente).

### 5.5 ❌ refutado · "`testarSenhaAcesso` é um oráculo de senha sem rate limit"

O cético refutou por modelo de ameaça: `entrarComSenha` é **público e não autenticado** (daí o
rate limit persistente por IP); `testarSenhaAcesso` exige `exigirAdmin`, e quem já é
administrador **cria e revoga** senhas de acesso — não precisa adivinhar nenhuma. Aceito.
Fica registrado como limite conhecido: um administrador com a conta comprometida ganha um
caminho de verificação sem contador, mas não ganha capacidade que já não tivesse.

### 5.6 ❌ refutado · "`periodoInicialDoDialog` aceita o preset `tudo` (~26 anos)"

É literalmente o que o item 2b pede ("pré-preencha com o período ativo da página"), o operador
vê as duas datas e a linha "Será congelado: … de … a …", e o atalho "Usar semana corrente" está
ao lado. Aceito — mas anotado no backlog como possível refinamento (§10).

---

## 6. Invariantes da ordem — provados

| Invariante | Prova |
|---|---|
| **Nenhuma dependência nova** | `git diff 1223ed4..HEAD -- package.json` = **1 linha**, o script `contraste`. |
| **Diff de `supabase/` vazio** | `git diff --stat 1223ed4..HEAD -- supabase/` → vazio. |
| **Visualizador confinado a `/relatorios/**`** | Teste novo `components/relatorios/confinamento-viewer.test.ts`: varre os href literais das 3 rotas + todos os componentes de relatório + o chrome do viewer; exige que sejam internos; registra as 3 exceções com a **guarda de cargo** que as protege; asserção própria para os KPI tiles (href vem por prop). **Provado plantando um `href="/ativos"`** em `chips-ancora` → 1 failed; restaurado. |
| **Snapshot congelado imutável** | Nenhuma Server Action entrou na árvore de `CorpoRelatorio`; o teste acima também trava que a página do snapshot **não** passa `links`. |
| **Nenhuma contagem de relatório alterada** | Os itens 4/5/6 tocam apresentação e texto. As funções de agregação (`queries/relatorios/*`) têm diff só em `snapshot.ts`, e ali a única mudança é o **import** de `periodoAnterior` — a fórmula é a mesma linha por linha. |
| **Nenhum texto novo de UI em inglês** | Varredura do diff `.tsx` por strings de UI: nada. |

---

## 7. Verificação executada

### `npm run lint`
```
> estoque-ti-wap@0.1.0 lint
> eslint
```
(sem saída = limpo)

### `npm run test`
```
 Test Files  99 passed (99)
      Tests  2121 passed (2121)
   Duration  17.02s
```

### `npm run build`
```
✓ Compiled successfully in 5.9s
✓ Generating static pages using 11 workers (27/27) in 665ms
exit 0
```

### `node scripts/contraste.mjs`
```
exit 0
```
61 pares medidos; 11 reprovações, **todas marcadas `antes: true`** — são o registro
deliberado dos defeitos que revisões passadas corrigiram (e o par `green-700`/`green-100`,
pré-existente e fora de escopo desde a F19). **Nenhum par `exigir: true` reprova.**

**Prova de que o portão pega:** com um par exigido forjado (`gray-300` sobre `background`),
o script sai **1**; sem ele, **0**.

### Step do CI
```yaml
- name: Contraste (WCAG 2.1 AA)
  run: npm run contraste
```
No job `verificar`, **antes do build** — Node puro, sem env, sem banco: reprova cedo e barato.

---

## 8. Roteiro manual executado

O que foi feito de fato, e como:

| O quê | Como foi verificado | Resultado |
|---|---|---|
| Telas **públicas** renderizam | `npm run dev` + navegador (`/login`, `/relatorios/acesso`) | OK, **zero** erro de console e **zero** erro no log do servidor |
| **Confinamento do visualizador** | Teste estático novo (§6), com defeito plantado e revertido | OK — e agora permanente |
| **Snapshot sem `links`** | Asserção no mesmo teste | OK |
| Trava do **contraste** no CI | Par forjado → exit 1; limpo → exit 0 | OK |
| Guardas do **"Testar senha"** | Tripwires de fonte (`actions/senhas.test.ts`) | OK |
| Guardas do **"Gerar novo link"** | Tripwire de fonte (`actions/admin.test.ts`) | OK |

### ⚠ O que NÃO foi verificado clicando

**A tela logada não foi percorrida no navegador.** O `.env.local` desta máquina aponta para o
projeto de **produção**, e entrar exigiria digitar a senha da conta de smoke num formulário —
coisa que eu não faço. O que dependia de sessão foi coberto por **testes estáticos** (os
tripwires e o guarda de confinamento) e pelo **smoke**, que lê as credenciais do próprio
ambiente. As cinco verificações que a ordem lista e que **só um humano fecha** estão na §11.

---

## 9. Documentação da ajuda ajustada

| Página | O que mudou |
|---|---|
| `relatorio-ao-vivo` | O preset novo, a **dualidade das duas semanas**, os chips "Resumo"/"Observações", o grupo que abre com a âncora no celular, a Dica do Δ e o que o "Copiar texto" passou a trazer |
| `relatorios-gerados` | O período que o diálogo herda, os atalhos de semana, o aviso de versão existente, a paginação (lendo `GERADOS_PAGE_SIZE`), a badge "superada", os três atalhos do rodapé do snapshot e a mensagem nova de colisão |
| `limites-e-atalhos` | O `?` que abre o quadro, a linha do tamanho de página dos gerados (**pela constante**), o campo de busca do header e o grupo "Recentes" |
| `mapa-das-telas` | O campo de busca, a marca como link, o e-mail e o "Escreve em:" no menu do usuário, e a distinção **ícone "?" × tecla "?"** |
| `comece-aqui` | A tecla `?` |
| `usuarios-e-senhas` | "Gerar novo link" na linha, o badge de primeiro acesso, a ordenação nova, a busca, o link+senha e o "Testar senha…" |
| `kits-de-movimentacao` | O bloco "Como o kit aplica" e o "Duplicar" |
| `administracao` | A busca do catálogo de itens |

**Dois testes da ajuda mudaram junto com a realidade** (`? abre esta ajuda` → `? abre o quadro
de atalhos`), e a lista de presets do teste deixou de ser digitada: ela agora **lê `PRESETS`**,
então preset novo sem documentação quebra o teste — foi exatamente o que aconteceu com "Semana
passada".

Uma guarda antiga precisou ser estreitada: `comecar.test.ts` proibia a expressão "de domingo a
sábado" no texto **inteiro** da página, para travar que "Esta semana" vai até HOJE. Isso deixou
de servir quando "Semana passada" entrou — ele **É** a semana fechada, e descrevê-lo assim é o
correto. A proibição passou a mirar a frase que de fato erraria.

---

## 10. Backlog novo (visto e não feito)

1. **`senha_testada` na trilha de auditoria.** Depende de acrescentar o verbo a
   `ACOES_ADMIN`/`ACAO_ROTULO` **e** ao `comment` da coluna (migration) — proibido nesta ordem.
2. **`green-700` sobre `green-100`** continua reprovando AA por 0,0004 (pré-existente, F19).
   Está no script como `antes: true` e não trava o CI.
3. **`periodoInicialDoDialog` com o preset "Tudo"** abre o diálogo com ~26 anos. É o que a
   ordem pede, mas talvez mereça um teto (ex.: cair na semana quando o período passar de N dias).
4. **`ativos-filtros.tsx` não estava na lista do item 13** e foi tocado por coerência de linha.
   Se houver outra barra de filtro fora do radar, vale uma varredura dedicada.
5. **Onda C** segue intocada: REL-01 (impressão das colunas), ATV-03, ITN-01, ITN-04,
   UXG-13b (sidebar colapsável).

---

## 11. O que este relatório NÃO prova

Escrito para ser lido antes de confiar em qualquer linha acima.

1. **Nenhuma tela logada foi aberta no navegador.** Build, lint, 2.121 testes e os tripwires
   de fonte provam estrutura e regras puras — **não provam pixel**. Especificamente, não vi com
   os olhos: o degradê das navs roláveis em 360px, o alinhamento das barras de filtro depois do
   ajuste de altura, o tooltip das barras divergentes, a `Dica` do Δ abrindo por teclado, o
   campo-placebo do header, o grupo "Recentes" populado, o quadro do `?` e o "Escreve em:" no
   menu.
2. **As cinco verificações manuais que a ordem lista continuam abertas** e são para o Johnny:
   (a) visualizador por senha navegando gerados → anterior/próximo → ao vivo; (b) âncora
   abrindo grupo recolhido no celular; (c) "Testar senha" com senha certa e errada; (d)
   campo-placebo abrindo a paleta; (e) "Recentes" populando. O confinamento do visualizador
   está provado **estaticamente**; o resto não.
3. **O laço de retry da versão nunca foi exercido com concorrência real.** Não há banco no
   Vitest. O que está provado é a **detecção** (`ehViolacaoDeVersao`, com e sem `code`), a
   forma do laço e a recusa quando a leitura falha — não o comportamento sob duas sessões
   gravando ao mesmo tempo.
4. **A badge "superada" não foi vista com dados reais.** A lógica é direta, mas a consulta
   extra nunca rodou contra um arquivo com v1 e v2 em páginas diferentes.
5. **A trilha de `convite_reenviado` da ação nova não foi gravada de verdade** — gerar um link
   de recuperação em produção cria token e evento, e eu não faço isso para testar.
6. **O contraste mede o TOKEN, não o pixel renderizado.** O script compõe as cores como o
   navegador compõe; ele não sabe se a classe medida é a classe que o componente realmente usa.
   Um par certo aplicado no lugar errado passa.
7. **`ResizeObserver` do `NavRolavel` não foi medido sob carga.** Ele observa o elemento e cada
   filho; com 7 abas isso é trivial, mas nunca foi perfilado.
8. **Nada foi verificado em produção depois do deploy** além do que o smoke cobre (§12).
9. **A revisão adversarial não é exaustiva.** Cinco lentes acharam seis coisas; a sexta lente
   que não existiu poderia achar a sétima. Uma delas voltou vazia — isso é evidência fraca de
   ausência, não prova.

---

## 12. CI e smoke de produção

### CI — run `31217075137` (commit `5882b8b`)

```
verificar: success   (lint · testes · CONTRASTE · build)
banco:     success   (Postgres novo + todas as migrations + roteiros SQL)
conclusion: success
```

O step **"Contraste (WCAG 2.1 AA)"** rodou pela primeira vez no CI e passou. O job `banco`
subiu um Postgres do zero, aplicou a pasta inteira de migrations e rodou os roteiros SQL —
confirmando, do lado do banco, que a fase não tocou em `supabase/`.

### Smoke de produção

```
RESUMO · 93 OK · 4 aviso · 0 n/a (pré-F12) · 0 falha
```

Os mesmos **4 avisos pré-existentes** de catálogo de itens vazio que a F28 já registrava —
nenhum novo. O script lê as credenciais do ambiente por conta própria e **nunca imprime
conteúdo de linha**: só status, contagens e nomes de coluna.

⚠ O smoke roda contra o app **no ar** e confere rotas e leituras; ele **não** exercita nenhuma
das telas novas desta fase (não clica em diálogo, não gera snapshot, não abre a paleta).

---

## 13. Commits da fase

```
417980b docs(f29): plano da Onda B2 — 18 itens, com o que a medição já desmentiu
ff94949 feat(f29): o preset "Semana passada" e o dialog que não congela o período errado
11b15fa feat(f29): o arquivo de gerados vira navegável — e a badge "superada" é exata
5ac314f feat(f29): gráficos com tooltip, Δ que diz o número anterior e resumo que abre como o e-mail
6e0e4a5 docs(f29): a ajuda acompanha o bloco de relatórios — e a lista de presets deixa de ser digitada
d692946 feat(f29): o convite mostra que nunca foi usado, e o link se refaz na própria linha
c4d4b70 feat(f29): kit com prévia e duplicar, senha entregue com link e conferível depois
a1654cd feat(f29): as fileiras roláveis avisam que rolam, o erro é anunciado e o loading tem voz
4770744 feat(f29): contraste no CI, a busca com porta visível e o "?" que não tira você da tela
2e6906d feat(f29): alvos de toque de 40px onde ainda faltavam (UXG-03, backlog da F13)
1092ae0 docs(f29): changelog, README e as 14 atas — inclusive as três suposições que a medição desmentiu
a21f8ec test(f29): guarda permanente do confinamento do visualizador — agora pelos LINKS
2fc4407 fix(f29): a revisão pegou — o campo cresceu e o botão ao lado não
e6376bf fix(f29): a revisão adversarial pegou mais dois — leitura que mente e resumo v1 mudo
```
