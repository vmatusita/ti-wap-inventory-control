# Relatório F27 — Onda A da análise de UX ("Costuras e segurança de operação")

> Ordem: `docs/prompts/F27-onda-a-ux-ultracode.md` (07/08/2026) · Fonte dos itens:
> `docs/ANALISE-UX-2026-08-07.md` §10 · Trabalho direto na `main`, modo autônomo.
> Base: `c5124f8` (F26, 04/08/2026). **Zero migration, zero dependência nova.**

---

## 0. Antes de tudo: a sessão abriu no diretório errado

A ordem foi colada numa sessão cujo diretório de trabalho era
`C:\Users\victor.matusita\Documents\Projetos\ti-wap-inventory-control`. **Aquilo não é o
projeto.** O que há lá:

| Evidência | Medida |
|---|---|
| `src/` | 118 arquivos, da era F3 — sem `/pendencias`, `/itens`, `/dev`, `/ajuda`, sem import, sem termos |
| `package.json`, `tsconfig.json`, `vitest.config.ts` | **não existem** |
| `docs/`, `supabase/`, `scripts/`, `public/`, `mockups/` | vazios |
| `.git` | **zero commits, zero objetos**, sem remote (`git log` → "does not have any commits yet") |
| `.next/` | build de **13/07/2026**, com as rotas antigas — nunca conteve a árvore da F26 |
| `scratch-build.log` | do mesmo 13/07, mostra o `npm` falhando por **falta de `package.json`** |

Ou seja: `npm run lint`, `npm run test` e `npm run build` são **impossíveis** ali, e os ~40
arquivos que os 26 itens citam em sua maioria não existem. Executar a ordem naquela pasta
significaria inventar o sistema do zero e escrever um relatório sem nenhuma saída real.

O repositório real foi localizado em
`C:\Users\victor.matusita\OneDrive - FRESNOMAQ IND DE MAQUINAS SA\Documents\Projetos\ti-wap-inventory-control`
e confirmado por **três evidências independentes**: `main` em `c5124f8 fix(f26): a 3ª volta…`,
sincronizado com `origin/main`; `git status` trazendo **exatamente** os três untracked que a
ordem nomeia (`_claude_tmp/`, a análise de 07/08 e a própria ordem); e a presença da ordem em
`docs/prompts/`. O acesso ao diretório foi pedido e concedido **antes de qualquer escrita**, e
nada foi escrito na cópia velha. Ata em `docs/DECISOES.md` (2026-08-07).

> **Pendência para o Johnny:** decidir o destino daquela pasta. Ela é lixo de 13/07 e vai
> confundir qualquer sessão aberta ali. A F27 não a apagou — está fora do escopo da ordem.

---

## 1. Baseline medido antes de editar

```
npm run lint   → exit 0 (sem saída)
npm run test   → Test Files 83 passed (83) · Tests 1865 passed (1865) · exit 0 · 132,78 s
git log -1     → c5124f8  ·  main sincronizada com origin/main
```

---

## 2. Checklist dos 26 itens — autoverificado

Legenda: ✅ feito · ⚠️ feito com desvio registrado. Todos os `arquivo:linha` são do working
tree entregue. Os roteiros manuais estão em §5.

### Bloco 1 · Reentrada e navegação

| # | Item | Status | Evidência |
|---|---|---|---|
| 1 | **FLX-01** `next` nas duas portas | ✅ | `proxy.ts:82-94` (sessão expirada), `:117-124` (/relatorios sem cookie), `:130-134` (rota genérica) gravam `next`; `auth.ts:38-43` (`signIn` → `destinoSeguro`); `login/page.tsx:32,54` (campo oculto); `otp.ts:57-60` (`redirectAcessoRelatorios`); `(app)/layout.tsx:167` + `relatorios/[filial]/page.tsx:75-81` + `gerados/page.tsx:41-47` + `gerados/[id]/page.tsx:29-35` (cookie **expirado**) |
| 2 | **FLX-02** "Ver todas" → lista | ✅ | `(app)/page.tsx:347` `href="/movimentacoes?filial=todas"`; import de `ROTA_RELATORIO_CONSOLIDADO` removido |
| 3 | **FLX-03** título por página | ⚠️ | `app/layout.tsx:20-26` (template); 22 páginas do grupo (app) + `login/layout.tsx` (novo); `ativos/[id]/page.tsx:52-70` (`generateMetadata` com patrimônio, consulta mínima). **Desvio:** `/dev/destrutivo` ficou com o título de `/dev` ("Desenvolvedor"), revogando a decisão de títulos distintos — o título próprio vazava o nome da área restrita para quem era barrado e derrubava o smoke. Ver §12 |
| 4 | **FLX-04** card Pendências × conflitos | ⚠️ | `(app)/page.tsx:125-152` (`contarConflitosAbertos` no `Promise.all`, **mesmo recorte de filial** da fila e do selo) e a linha âmbar com link. **Desvio:** a ordem mandava pôr a linha "no lugar da frase condicional" (ramo de fila vazia); ela ficou **fora do ternário** — ver §3.1 |
| 5 | **FLX-05** devolução ao fornecedor na paleta | ✅ | `paleta-comandos.tsx:156-168` ("Devolver ao fornecedor", apelidos `fornecedor`/`baixa`/`sem conserto`) e `:169-176` ("Novo equipamento", `compra`/`cadastrar`) |

### Bloco 2 · Wizard de movimentação

| # | Item | Status | Evidência |
|---|---|---|---|
| 6 | **MOV-01a** erro com scroll e foco | ✅ | `nova-movimentacao-form.tsx:196` (`errosRef`), `:1019-1029` (efeito com `focus()` + `scrollIntoView({block:'nearest'})`), cobrindo validação local **e** retorno de servidor que volta ao passo 2. Metade `b` **não feita**, como manda a ordem |
| 7 | **MOV-04** teto de 30 no um-a-um | ✅ | `nova-movimentacao-form.tsx:396-410` — guarda no início de `adicionar()`, contando `itens.length + naOutraMetade.size`, com o toast de recusa da contrapartida |
| 8 | **MOV-07** "repetir última" e motivo | ✅ | `nova/repetir-ultima.ts` (função pura + `CAMPOS_DO_TIPO_VAZIOS`), usada em `nova-movimentacao-form.tsx:722-748`; `toast.warning` preservado. **A revisão adversarial achou o mesmo defeito em outros 3 caminhos** (`:144` duplicar, `:637` rascunho, `:364` ajuste de tipo) — corrigidos também, ver §11.2. **Teste puro novo (+3 casos)** |
| 9 | **MOV-08** Enter duplo × duplicata | ✅ | `passo-revisao.tsx:93-106` (prop), `:116`, `:138-179` (efeito), `:221-240` (indicador "Conferindo duplicatas…"); o **clique nunca foi gateado** — o aviso segue não-bloqueante |
| 10 | **MOV-09** termo herda a data | ✅ | `actions/termos.ts:79-83` (tipo), `:102-104` (`data, termo_data` no `MOV_SELECT`), `:177-186` (`termo_data ?? data ?? hoje`), nos três caminhos. Campo segue editável |
| 11 | **MOV-13** sucesso focado | ✅ | `nova/painel-sucesso.tsx:245,247-257,279` e o mesmo em `devolucao-fornecedor-form.tsx` — `tabIndex={-1}` + `focus()` no `<h2>` ao montar |
| 12 | **MOV-14** origem inválida avisa | ✅ | `movimentacoes/nova/page.tsx:107-165` (detecta os três caminhos) + `nova-movimentacao-form.tsx:111,129` (prop) e o banner âmbar |

### Bloco 3 · Ativos e pendências

| # | Item | Status | Evidência |
|---|---|---|---|
| 13 | **ATV-01** paridade de campos na busca | ✅ | `queries/ativos.ts:119` — `.or()` de 4 → 8 predicados (`service_tag`, `hostname`, `telefone`, `imei`); `ativos-filtros.tsx:172` (placeholder). CSV herda (mesma função). **Ajuda corrigida** (§4) |
| 14 | **ATV-05** subtítulo honesto | ✅ | `lib/ativos/lista.ts:116-129` (`rotuloSubtitulo`, pura) + `ativos/page.tsx:194`. **Teste puro novo (7 casos)** |
| 15 | **PND-03** chips clicáveis | ✅ | `pendencias-chips.tsx` (prop `comLink`, `TIPOS_COM_FILTRO`), `pendencias/page.tsx:232`, `corpo-relatorio-v2.tsx` só no ramo **operador ao vivo**. **Viewer e snapshot seguem `<span>`** |

### Bloco 4 · Relatórios

| # | Item | Status | Evidência |
|---|---|---|---|
| 16 | **REL-02** período preserva filtros | ✅ | `periodo-filtro.tsx:31,51-57` — parte de `params.toString()` e sobrescreve só `preset`/`de`/`ate`, removendo os que deixam de valer |
| 17 | **REL-10** verde AA | ✅ | `tabela-itens-grupo.tsx:19,114` e `manutencao-casos.tsx` importam `CLASSE_COR_DELTA` — fonte única, sem classe duplicada |
| 18 | **REL-13a** observação impressa | ⚠️→✅ | `obs-tooltip.tsx:39` ganhou `print:overflow-visible print:whitespace-normal print:break-words`. **Desvio corrigido:** a 1ª implementação contornava em `celulas.tsx` com bloco duplicado — ver §3.2 |

### Bloco 5 · Administração e /dev

| # | Item | Status | Evidência |
|---|---|---|---|
| 19 | **ADM-01** excluir item confirma | ✅ | `item-dialog.tsx:274` (`onClick={() => setConfirmando(true)}`) + `:148-179` (passo de confirmação, **foco no Cancelar**, frase nomeando o item) |
| 20 | **ADM-06** "Novo import" zera a filial | ✅ | `importar-wizard.tsx:451-465` — `setFilialId('')` no `recomecar()` |
| 21 | **ADM-07** uma régua e uma dica | ✅ | `validators/confirmacao-digitada.ts` (novo, puro, testado) usado nas **três** telas: `importar-wizard.tsx:280`, `apagar-usuario-dialog.tsx:57` e `dialogo-destrutivo.tsx` (esta última **só depois da revisão adversarial** — ver §11.1). **Réguas preservadas** — investigação do servidor de cada uma em §3.3 e em `DECISOES.md` |
| 22 | **DEV-01** as 9 checagens na tela | ✅ | `queries/dev.ts:218-229` (as 2 entradas), `:245-251` (`juntarCatalogoComResultados`), contagem **derivada** do catálogo; rede permanente para chave desconhecida. **Teste puro novo** |
| 23 | **DEV-02** nome de filial na Zona destrutiva | ✅ | `painel-ativo.tsx:43,62-65,141` (`filial {nomeDaFilial(...)}`) + `dev/destrutivo/page.tsx` passando `filiais`; `destrutivo/rotulos-reset.ts` (mapa fixo + fallback). **Teste puro novo** |

### Bloco 6 · Base global

| # | Item | Status | Evidência |
|---|---|---|---|
| 24 | **UXG-01** `global-error.tsx` | ✅ | `app/global-error.tsx` (novo, `<html lang="pt-BR">`, CSS+fonte reimportados, botão `reset()`); `app/error.tsx` (novo) para `/login` e `/auth/**` |
| 25 | **UXG-02** modais em pt-BR + alvo de toque | ✅ | `ui/dialog.tsx:83,88` e `ui/sheet.tsx:84,89` — "Fechar" e `size-10 sm:size-7`, **com comentário de motivo no arquivo** + ata em `DECISOES.md` |
| 26 | **UXG-08** três feedbacks | ✅ | (a) `copiar-patrimonio.tsx:34-53` (toast nos **dois** caminhos); (b) `user-menu.tsx:42-59,119-121` e `viewer-header.tsx:15-29,46-48` (`useFormStatus`); (c) `realtime-refresh.tsx:49-59` e `ui/skeleton.tsx:3-16` (`motion-reduce` + par `dark:`) |

**26 de 26 implementados.** Nenhum item se revelou "já atendido" por commit posterior à análise.

---

## 3. Desvios da letra da ordem (e por quê)

### 3.1 FLX-04 — a linha de conflitos vale também com a fila cheia
A ordem manda pôr a linha *"no lugar da frase condicional atual"*, que vivia no ramo de **fila
vazia**. Implementada assim, ela só apareceria com a fila vazia — e com 3 na fila e 2
conflitos o card mostraria "3" ao lado de um selo "5", a **mesma divergência** que o item
existe para fechar, só que mais difícil de notar que o 🎉 original. A linha ficou fora do
ternário, valendo para fila vazia, fila cheia e falha de leitura da fila.

### 3.2 REL-13a — o clamp foi desfeito na fonte, não contornado na célula
A primeira implementação (feita por um agente que não era dono de `obs-tooltip.tsx`)
contornou o problema dentro de `CelulaObs`: dois blocos irmãos, um `print:hidden` e outro
só-impressão. Isso duplicava conteúdo no DOM e **não alcançava** os outros consumidores do
componente — inclusive a coluna Obs da tabela "Saldo por item", que também é relatório
impresso. Trocado pela correção literal que a ordem pedia, no próprio `ObsTooltip`, que
conserta os cinco consumidores de uma vez e não muda nada na tela.

### 3.3 ADM-07 — a régua de cada tela foi preservada; só a mensagem unificou
Como a ordem mandava, o servidor de cada tela foi investigado **antes**:

| Tela | Action | RPC |
|---|---|---|
| Import | `actions/importar.ts:329` — **igualdade exata**, sem trim/caixa | `importar_ativos_substituir` nem repete a checagem |
| Apagar conta | `validators/admin.ts:249` — tolera trim+caixa | `apagar_usuario` (`0074`) **não recebe confirmação nenhuma** — a checagem é ergonomia, não autorização |
| Zona destrutiva | `confirmacaoConfere` — trim+caixa | `0082`/`0083` comparam `upper(btrim(...))` — tolerante **nas duas camadas** |

Por isso o cliente do import **continua exato**: afrouxá-lo habilitaria um botão "Substituir
tudo" clicável que o servidor recusaria do mesmo jeito. O que faltava era **explicação**, e é
só ela que foi unificada.

### 3.4 Um erro de rótulo, não de código
O agente do bloco FLX-01 devolveu o item como **"já atendido, nada editado"**. O `git diff`
mostra o contrário: os comentários `// FLX-01`, o `next` nos três redirects do proxy, o campo
oculto no login, o `destinoSeguro` no `signIn` e o helper `redirectAcessoRelatorios` são
**linhas adicionadas nesta fase**. O trabalho está feito e correto; o relatório dele sobre si
mesmo é que estava errado — provavelmente por reler os arquivos no fim e reconhecer o próprio
código como pré-existente. Fica registrado porque afeta a confiança em auto-relato de agente.

---

## 4. Documentação da ajuda ajustada (a realidade mudou, o texto seguiu)

| Página | O que tinha ficado **falso** | Correção |
|---|---|---|
| `lista-de-ativos.ts:49` | "O campo de busca aceita patrimônio, colaborador, marca ou modelo." | passou a listar service tag, hostname, telefone e IMEI |
| `problemas-comuns.ts:38` | "…**essas duas** são as que também procuram por service tag e por hostname. O campo da lista de Ativos procura por patrimônio, colaborador, marca ou modelo" | reescrito: as três buscas acham por service tag e hostname; **a da lista é a única** que acha por telefone e IMEI |
| `problemas-comuns.ts:33` | lista de campos da busca sem telefone/IMEI | acrescentados, com a ressalva de que valem na lista de Ativos |
| `mapa-das-telas.ts:109` | Card "Últimas movimentações" … "ver todas" **para o relatório** | "para a lista de movimentações" |
| `mapa-das-telas.ts:108` | Card "Pendências" sem mencionar conflitos | acrescentada a linha âmbar de conflito entre filiais e por que ela existe |

`termos-de-responsabilidade.ts:83` já afirmava que o diálogo do termo abre com a data vinda da
movimentação — era **imprecisão antes** do MOV-09; agora o texto passou a ser verdade sem
precisar mudar. Nenhum teste de ajuda foi alterado: os 395 testes de `src/lib/ajuda` passam
com os textos novos.

---

## 5. Roteiro manual (o que teste puro não cobre)

Estes são os passos a executar na tela. **Eles não foram executados nesta sessão** — não há
servidor de dev nem banco acessível aqui; ver §8.

1. **FLX-01 operador** — deslogado, abrir `/pendencias?filial=3` → cai em
   `/login?next=%2Fpendencias%3Ffilial%3D3` → logar → **volta para `/pendencias?filial=3`**.
2. **FLX-01 visualizador** — abrir um snapshot com senha, esperar o cookie vencer (ou apagá-lo)
   e deixar o auto-refresh disparar → tela da senha → **volta ao mesmo snapshot**, com filial,
   período e filtros. Tentar `?next=https://exemplo.com` → cai na Home/relatório padrão.
3. **FLX-03** — abrir `/`, `/ativos`, `/itens` e `/admin/itens` em abas: títulos **distintos**;
   ficha de ativo mostra o patrimônio; ativo sem patrimônio mostra "Ativo sem patrimônio".
4. **FLX-04** — com a fila vazia e ≥1 conflito, o card mostra o 🎉 **e** a linha âmbar; com a
   fila cheia e ≥1 conflito, a linha continua aparecendo (é o desvio §3.1).
5. **MOV-01a** — passo 2 longo, rolar até o fim, clicar "Revisar" sem preencher: a tela **rola
   até** o quadro vermelho e ele recebe foco.
6. **MOV-04** — com 30 no lote, tentar adicionar o 31º pelo combobox → toast de recusa.
7. **MOV-07** — "repetir última" com tipo não aplicável → toast de aviso **e motivo vazio**.
8. **MOV-08** — no passo 3, dois Enters rápidos: nada é registrado enquanto "Conferindo
   duplicatas…" está visível; o **clique** no botão continua registrando a qualquer momento.
9. **MOV-09** — registrar com data de ontem e gerar termo → diálogo abre com **ontem**.
10. **MOV-13** — registrar e conferir (leitor de tela/inspetor) que o foco vai ao `<h2>`.
11. **MOV-14** — `/movimentacoes/nova?ativo=<uuid inexistente>` → banner âmbar.
12. **ATV-01** — colar service tag e IMEI de ativos fictícios na busca da lista → encontram.
13. **ATV-05** — subtítulo muda entre "N encontrados" / "N nas suas filiais" / "N cadastrados".
14. **PND-03** — chips clicáveis em `/pendencias` e no ao vivo do operador; **entrar por senha
    e confirmar que os chips do viewer NÃO são links**.
15. **REL-02** — filtrar dentro de uma tabela, trocar o período, conferir que o filtro fica.
16. **REL-13a** — linha com observação longa → `Ctrl+P` → observação sai **completa**.
17. **ADM-01** — "Excluir" no catálogo abre confirmação com foco no Cancelar.
18. **ADM-06** — concluir um import e clicar "Novo import" → filial **vazia**.
19. **ADM-07** — digitar a caixa errada nas três telas → dica "O texto não confere…".
20. **DEV-01** — `/dev` lista **9** checagens e diz "9"; rodar e conferir os 9 resultados.
21. **DEV-02** — Zona destrutiva mostra "filial Matriz", não "filial 3"; prévia do reset em pt-BR.
22. **UXG-01** — forçar erro em `/login` → tela em pt-BR com "tentar de novo".
23. **UXG-02** — leitor de tela anuncia "Fechar"; no mobile o X mede ~40 px.
24. **UXG-08** — clipboard bloqueado → toast; "Sair" mostra pending; `prefers-reduced-motion`
    para as animações.

---

## 6. Verificação executada

### `npm run lint`
```
> estoque-ti-wap@0.1.0 lint
> eslint

=== LINT EXIT: 0 ===
```
Houve **uma falha real** no caminho, corrigida: `passo-revisao.tsx:144` chamava
`setConsultando(true)` no corpo do efeito, reprovado por `react-hooks/set-state-in-effect`.
Movido para dentro do callback async (que roda de forma síncrona até o primeiro `await`, então
a janela protegida é a mesma). Ata em `DECISOES.md`.

### `npm run test`
```
 RUN  v4.1.10

 Test Files  87 passed (87)
      Tests  1899 passed (1899)
   Start at  11:00:33
   Duration  95.52s (transform 22.88s, setup 0ms, import 541.03s, tests 17.63s, environment 51ms)

TEST EXIT: 0
```
**1.865 → 1.899 testes** (+34), **83 → 87 arquivos**. Os arquivos novos são todos de função
pura: `repetir-ultima.test.ts` (MOV-07, +3 casos depois da revisão), `lista.test.ts` /
`rotuloSubtitulo` (ATV-05), `dev-integridade.test.ts` (DEV-01), `rotulos-reset.test.ts` (DEV-02)
e `confirmacao-digitada.test.ts` (ADM-07), mais casos novos em `otp-destino.test.ts` (FLX-01).
Nenhum teste foi removido ou enfraquecido — inclusive os 395 da ajuda, que passam com os textos
corrigidos em §4.

### `npm run build`
```
✓ Generating static pages using 7 workers (27/27) in 1304ms
Route (app) — 29 rotas, incluindo /dev/destrutivo, /pendencias, /ajuda/[slug]
ƒ Proxy (Middleware)

=== BUILD EXIT: 0 ===
```
O gate `scripts/verificar-actions-build.mjs` faz parte do `build` e passou.

### Guardas da ordem
```
git diff c5124f8..HEAD --stat -- supabase/      → (vazio)
git diff c5124f8..HEAD -- package.json           → (vazio)
git diff c5124f8..HEAD -- package-lock.json      → (vazio)
git diff c5124f8..HEAD -- src/lib/types/database.ts → (vazio)
```

### `node scripts/smoke/smoke-prod.mjs` (produção, pós-deploy)

Rodou **duas vezes**. Na primeira, logo depois do push, ficou **vermelho** — e o que ele pegou
era real (§12):
```
RESUMO · 92 OK · 4 aviso · 0 n/a (pré-F12) · 1 falha

FALHAS:
  · [C] /dev/destrutivo (dev · zona destrutiva (F23)) — HTTP 200 COM o conteúdo da área
        restrita ("Zona destrutiva") — VAZAMENTO para o cargo errado
```
Depois do conserto e do redeploy:
```
RESUMO · 93 OK · 4 aviso · 0 n/a (pré-F12) · 0 falha

=== SMOKE EXIT: 0 ===
```
Os **4 avisos são os mesmos nas duas execuções** — não nasceram na F27. O detalhe de cada um
**não foi capturado** (a saída foi lida pelo fim, e as linhas de aviso ficaram acima do corte):
vale uma execução do Johnny com a saída inteira à vista.

---

## 7. Housekeeping

- `_claude_tmp/` **apagado** — continha um único `projeto-snapshot.tar.gz` (2,9 MB) de
  07/08 07:45, untracked e redundante com o histórico do git.
- `docs/ANALISE-UX-2026-08-07.md` e `docs/prompts/F27-onda-a-ux-ultracode.md` **commitados**
  (`45446c8`), antes de qualquer código.
- Nenhuma outra sujeira de git foi encontrada no working tree.

---

## 8. O que este relatório NÃO prova

1. **Nenhuma tela foi aberta.** Não há servidor de dev nem banco acessível nesta sessão: o
   roteiro de §5 é **para executar**, não um registro de execução. Tudo que se afirma sobre
   comportamento vem de leitura de código, dos testes puros e do build.
2. **O `next` não foi exercitado ponta a ponta.** `destinoSeguro` tem teste puro (URL absoluta,
   protocolo-relativo, backslash, traversal, CRLF), mas o round-trip real — proxy grava →
   formulário repassa → action redireciona → destino carrega **com sessão nova** — depende de
   Supabase e não foi feito. O caminho do visualizador com cookie **expirado de verdade** (24 h)
   é o menos exercitado de todos.
3. **Foco e leitor de tela são afirmações de código.** `tabIndex={-1}` + `focus()` estão lá;
   que o NVDA/VoiceOver anuncie o título do painel de sucesso, ninguém ouviu.
4. **A impressão não foi impressa.** `print:` só se prova no `Ctrl+P`. Que a observação longa
   caiba na largura da coluna no papel A4 é expectativa, não medição.
5. **Contraste não foi medido.** REL-10 confia em que `CLASSE_COR_DELTA` já era AA (F19). O
   `scripts/contraste.mjs` continua fora do CI e não foi rodado (é item UXG-07, Onda B).
6. **DEV-01 não viu a RPC responder.** As duas chaves novas vieram da leitura da migration
   `0098`; que a RPC devolva exatamente esses nomes hoje, em produção, não foi observado. A
   rede permanente existe justamente porque essa suposição pode envelhecer.
7. **O deploy foi verificado por fora, não por dentro.** O smoke rodou contra produção depois de
   cada um dos dois pushes e fechou verde (§6), o que prova que as 93 rotas respondem e que as
   leituras reais funcionam com uma sessão de operador de verdade. Ele **não** exercita nenhum
   dos comportamentos novos desta fase: não digita no wizard, não imprime, não expira sessão,
   não clica em chip. O roteiro de §5 continua inteiro por executar.
8. **Auto-relato de agente não é prova.** Um dos nove blocos classificou o próprio trabalho
   errado (§3.4). Os status desta tabela foram reconferidos contra o `git diff`, mas o
   mecanismo que produziu aquele engano é o mesmo que produziu os demais relatos.
9. **A revisão adversarial não é exaustiva.** Ela achou três lacunas reais (§11) — duas delas
   em itens que este relatório **já dava por fechados**, e uma em afirmação escrita neste
   próprio arquivo. Isso mede que a revisão funciona; **não** mede que sobrou zero. Ela leu
   estático, sem executar nada, e cobriu seis lentes — não todas as possíveis.
10. **As correções da revisão não tiveram volta nova.** Os três consertos de §11 passaram por
    lint, pelos testes e pelo build, mas **nenhuma segunda rodada adversarial** os auditou. É a
    mesma pendência honesta que a F26 registrou, e vale repetir em vez de esconder.

---

## 9. Backlog novo (visto e não feito, por escopo)

- **`ObsTooltip` fora de `relatorios/`** — `lista-movimentacoes.tsx` e
  `historico-lancamentos.tsx` herdaram a correção de impressão de graça; vale conferir se a
  largura da coluna deles se comporta no papel (não previsto pela ordem).
- **Onda B/C intactas** — nada de MOV-01b, MOV-02/03/05/06/10/11/12, ATV-02+, PND-01/02/04/05/06,
  ITN-*, REL-01/03..09, ADM-02..05/08..10, UXG-03..07/09..14. A metade `b` do MOV-01 e o resto
  do REL-13 seguem abertos, como a ordem determinou.
- **A cópia velha do projeto** em `Documents\Projetos\` (§0) — decisão do Johnny.

---

## 10. Commits da fase

```
45446c8  docs(f27): a análise de UX de 07/08, a ordem da Onda A e o gabarito da fase
481fff0  feat(f27): a reentrada guarda o destino e cada tela tem seu título (FLX-01, FLX-03)
4eb5fc9  feat(f27): as costuras do dashboard e as duas ações que faltavam na paleta (FLX-02, FLX-04, FLX-05)
3371047  fix(f27): o wizard para de errar em silêncio (MOV-01a, MOV-04, MOV-07, MOV-08, MOV-14)
7dafafb  fix(f27): o termo herda a data da movimentação e o sucesso é anunciado (MOV-09, MOV-13)
b4a8d3d  feat(f27): a busca acha pelo que identifica, o subtítulo não mente e os chips levam à fila (ATV-01, ATV-05, PND-03)
1a70aa9  fix(f27): trocar o período não apaga mais os filtros, e a observação sai inteira no papel (REL-02, REL-10, REL-13a)
21a376c  fix(f27): excluir item confirma, o import esquece a filial e a confirmação digitada explica (ADM-01, ADM-06, ADM-07)
a6098ea  feat(f27): as nove checagens aparecem e a Zona destrutiva fala nome de filial (DEV-01, DEV-02)
5abca91  feat(f27): erro fora do (app) fala pt-BR, e três feedbacks que faltavam (UXG-01, UXG-02, UXG-08)
4888143  docs(f27): a ajuda volta a descrever o que a tela faz, e as atas da fase
```
Mais o commit dos três achados da revisão adversarial e o de fechamento da fase (relatório,
changelog e README) — a lista definitiva sai de `git log --oneline c5124f8..HEAD`.

---

## 11. Revisão adversarial (contexto fresco, alvo congelado)

Seis lentes independentes leram `c5124f8..HEAD` — checklist dos 26 itens, correção de lógica,
segurança/modelo de acesso, escopo, a11y/UX e veracidade da documentação. Cada achado passou
por **dois julgadores**: um cético mandado derrubá-lo e um revisor de leitura independente.

**3 achados brutos · 3 sobreviveram · 0 refutados.** Todos os três foram corrigidos; nenhum
era estilo, os três eram lacuna de requisito. Atas em `docs/DECISOES.md` (2026-08-07, entrada
"Revisão adversarial").

### 11.1 ADM-07 tinha alcançado só DUAS das três telas (média)
O helper era chamado em `importar-wizard.tsx` e `apagar-usuario-dialog.tsx` — **nunca** em
`dialogo-destrutivo.tsx`, o diálogo único das sete ferramentas irreversíveis da Zona
destrutiva. Ali o `confere` já era calculado e só alimentava o `disabled`: com um caractere
errado, o botão "Apagar" ficava desabilitado e **mudo**, que é exatamente o sintoma que o item
existe para eliminar — na área mais perigosa do sistema. Pior: **este relatório e a ata já
afirmavam "as três telas"**, e o próprio docstring do helper dizia "nas duas telas que esta
fase toca". Corrigido (mesmo markup: `aria-invalid`, `aria-describedby`, `<p role="alert">`),
com a régua intacta.

### 11.2 MOV-07 estava fechado em um caminho; o defeito vivia em outros três (média)
O conserto entrou só no `repetirUltima()` — que é onde a ordem o cita. Mas o **mesmo padrão**
existia em três irmãos que também zeram `tipo` por invalidez sem limpar `motivo`/`termo`/
`termoData`: o clamp do `?duplicar=` (`:144`), o `restaurarRascunho()` (`:637`) e o
`ajustarTipoPara()` (`:364`). Como "duplicar" e restaurar rascunho são rotina, fechar só o
primeiro deixaria o item resolvido no papel e o defeito vivo no uso real. Generalizado para
`CAMPOS_DO_TIPO_VAZIOS`, aplicado nos quatro pontos, +3 casos de teste. **Foi extensão além
da linha citada pela ordem, e está registrada como tal.** Não mexi no `trocarTipo`: ali o tipo
cai por escolha do operador, e limpar o termo que ele acabou de digitar seria regressão.

### 11.3 As atas diziam que o "Close" morto tinha ficado (baixa)
O `"Close"` visível do `DialogFooter` (atrás de `showCloseButton`, hoje sem chamadores) foi
corrigido para "Fechar" **depois** de a ata registrá-lo como "não feito de propósito". Registros
alinhados: entrada nova em `DECISOES.md` revisando a anterior, item retirado do backlog acima.

### 11.4 O que a revisão confirmou como correto
Escopo limpo (diffs vazios em `supabase/`, `package.json`, `package-lock.json` e no
`database.ts` gerado; só os três arquivos previstos em `src/components/ui/`); nenhum item de
Onda B/C implementado de brinde; nenhum teste removido ou enfraquecido; o `next` do FLX-01 sem
open redirect; o **visualizador por senha sem nenhum link novo para fora de `/relatorios/**`**;
o aviso de duplicata ainda não-bloqueante (só o Enter espera, o clique nunca); e as páginas de
ajuda corrigidas de fato.

> **E o que ela NÃO pegou:** as seis lentes leram o diff estático e deram o FLX-03 por
> resolvido. O defeito de §12 estava ali, no `metadata` de uma rota, e só apareceu com o app
> no ar. É o argumento mais concreto desta fase a favor de rodar o smoke depois do deploy.

---

## 12. O smoke pós-deploy pegou o que nenhuma outra camada pegou

Este é o achado mais instrutivo da fase, e ele só existiu **depois** do push — lint, testes,
build e as seis lentes da revisão adversarial passaram por cima dele.

**O sintoma:** na primeira execução pós-deploy, o smoke acusou
`/dev/destrutivo — HTTP 200 COM o conteúdo da área restrita ("Zona destrutiva") — VAZAMENTO
para o cargo errado`. É o check que existe para provar que a área mais perigosa do sistema
(apagar ativo, resetar filial, forçar estado) não alcança quem não é dev.

**O diagnóstico**, feito contra a produção com a conta do smoke (que não é dev), imprimindo só
fatos estruturais e nenhum conteúdo de página:

| Medida | `/dev/destrutivo` | `/dev` |
|---|---|---|
| HTTP | 200 | 200 |
| Tamanho | 72.960 bytes | 72.133 bytes |
| `<title>` | **"Zona destrutiva · Estoque TI WAP"** | "Desenvolvedor · Estoque TI WAP" |
| "Apagar ativo" / "Resetar" / "Forçar estado" no corpo | **0 / 0 / 0** | 0 / 0 / 0 |
| "Área técnica de manutenção" (layout de `/dev`) no corpo | **0** | 0 |

Ou seja: **o controle de acesso nunca esteve em risco.** O corpo entregue é o do painel, do
mesmo tamanho do de `/dev`, sem uma única ferramenta destrutiva renderizada. O que aparecia era
o `<title>`: o `redirect('/')` do `dev/layout.tsx` é resolvido pelo Next **no servidor** e
devolve 200 com o corpo do painel, mas com o `<title>` resolvido a partir da rota **pedida**. O
`metadata.title = 'Zona destrutiva'` que a própria F27 acrescentou (FLX-03) caía no HTML de quem
acabava de ser barrado — e colidia com o `marcadorProibido` do smoke.

**O conserto:** `/dev/destrutivo` voltou a se chamar "Desenvolvedor" na aba, o que **revoga** a
decisão de títulos distintos que esta mesma fase tinha registrado (§3 e `DECISOES.md`). Anunciar
o nome da zona destrutiva para quem não pode entrar não tem contrapartida, e aba repetida entre
duas rotas exclusivas do cargo dev é preço barato. O marcador do smoke ganhou, ao lado, o aviso
da armadilha, para a próxima fase que mexer naquele título ver o acoplamento ali.

**O que NÃO foi feito, e por quê:** trocar o marcador do smoke por conteúdo de corpo ("Forçar
estado") deixaria o check mais forte — mas eu não tenho credencial de **dev** para provar que o
marcador novo aparece quando a área realmente renderiza, e um marcador que nunca casa é um check
que passa verde para sempre sem testar nada. Fica registrado para quem tiver a conta certa.

**A lição:** um marcador de segurança que é uma string capaz de virar `<title>` é frágil por
construção, e o `<title>` de uma rota barrada chegar ao usuário barrado é comportamento do Next
que ninguém tinha notado — nenhuma outra rota do app tem `marcadorProibido`, então a colisão só
podia nascer aqui. Nenhuma quantidade de teste puro pegaria isto: precisou do app no ar.

