# Relatório da F26 — o par troca/upgrade: devolução e saída registradas na mesma tela

> Ordem: [`prompts/F26-troca-upgrade-ultracode.md`](prompts/F26-troca-upgrade-ultracode.md) (04/08/2026, Johnny).
> Execução autônoma (modo do `CLAUDE.md`), orquestração multiagente.
> Baseline: `b50d1ea` (topo da `main` ao fim da F25) · Entrega: `c7f28e2` (o commit que fecha o código; este relatório entra logo depois).
> **Em produção desde 04/08/2026** (deploy pela `main`, smoke pós-deploy **93 OK · 4 aviso · 0 falha**).

---

## 1. O que mudou, e por quê

Trocar o equipamento de alguém é **uma** operação do mundo real que sempre valeu **duas** movimentações: a `devolucao` do antigo e a `saida` do novo, as duas com o **motivo** `troca_upgrade`. Até aqui isso custava **duas passadas completas** pelo fluxo de nova movimentação — montar lote, escolher tipo, escolher motivo, redigitar colaborador, chamado e contexto, revisar, registrar. Duas vezes.

A F26 acrescentou o **facilitador do par**, na mesma família dos que a spec §6 já lista ("repetir última", "duplicar", "aplicar kit"): quando tipo e motivo casam com a troca, a mesma tela abre a metade oposta e as duas entram num **único registrar**.

### (A) A seção é derivada, não um modo

`ofereceContrapartida(config)` responde a partir de duas coisas: o **tipo** e o **código** do motivo. Por isso a seção aparece igual venha o motivo do select, de um **kit**, do **"repetir última"** ou do **"duplicar"** — nenhum caso especial por origem. E some do mesmo jeito: toda mudança de `Config` passa por `sincronizarContrapartida`, que **apaga o estado da contrapartida** quando a config nova deixa de oferecê-la. Sem isso sobraria um lote invisível, pronto para reaparecer quando o operador voltasse ao motivo.

A detecção é sempre pelo **código** `troca_upgrade` (constante única `MOTIVO_TROCA_UPGRADE`), nunca pelo rótulo: o admin renomeia "Troca / upgrade" em `admin/motivos` quando quiser. O rótulo exibido na seção vem do catálogo. Motivo desativado some do select, ninguém o escolhe, e o facilitador simplesmente não aparece — sem código de exceção.

⚠ **Vocabulário:** `troca` é um **TIPO** de movimentação (F15 — o nascimento do substituto vindo do fornecedor, gravado só pela RPC `devolver_ao_fornecedor`). `troca_upgrade` é um **MOTIVO**. Esta fase é 100% sobre o motivo; o tipo `troca`, a RPC e o fluxo `movimentacoes/devolucao-fornecedor` ficaram **byte a byte** (prova em §3.4).

### (B) O pré-preenchimento é honesto por decisão

Quem recebe o equipamento novo é quase sempre quem devolveu o antigo, então o colaborador vem preenchido — **mas só quando TODOS os equipamentos da metade principal estão com a mesma pessoa**. Detentores mistos, ou algum equipamento sem detentor, deixam o campo vazio. Chutar aqui entrega o notebook novo para a pessoa errada, e o operador confirma sem ler.

O nome sai do lote **em memória**, capturado **antes** do envio. Ler depois do insert daria vazio **sempre**: o trigger `aplicar_movimentacao` zera o `colaborador_atual` do ativo devolvido.

### (C) As guardas do par — e onde cada uma vive

| Guarda | Cliente | Servidor |
|---|---|---|
| Metades disjuntas | `validarPar` (mensagem nomeando o patrimônio) + recusa na entrada | `registrarMovimentacoes` recusa ativo repetido no lote |
| Teto **somado** ≤ 30 | `validarPar`, mensagem derivada de `MAX_LOTE_MOVIMENTACAO` | `loteMovimentacaoSchema.max` sobre o array inteiro |
| Contrapartida aberta e vazia | `validarPar` bloqueia o registrar | — (é regra de formulário) |
| Ativo em estado inválido para a metade | recusa na entrada (toast) **e** `validarPar` no envio | trigger `aplicar_movimentacao` (transição inválida) |
| Filiais das duas metades | — | `exigirEscritaEm` recusa o lote inteiro |

A dupla checagem do estado do ativo **não é redundância**: a recusa na entrada é gentileza imediata, e a checagem no envio segura o caso real de um **rascunho que dormiu** enquanto outro operador movimentava aquele equipamento.

### (D) O adiamento, o atalho — e a armadilha que quase o matou

"Deixar a contrapartida para depois" registra só a metade montada, e a tela de sucesso oferece **"Registrar agora a saída da troca"** (ou a devolução), reabrindo o fluxo com tipo, motivo e colaborador prontos. **Nenhuma pendência e nenhum estado no servidor** — é conveniência de navegação, e é a decisão registrada ("só a tela").

Duas armadilhas medidas neste caminho:

1. **`/movimentacoes/nova` → `/movimentacoes/nova?tipo=…` é a MESMA rota.** No Next isso é *soft navigation*: o Server Component re-executa, mas o formulário fica na mesma posição da árvore e **não remonta** — e todo o estado inicial dele vem de `useState(() => …)`, que só roda na montagem. O atalho abriria a tela sem pré-preencher **nada**, em silêncio. A correção é uma `key` derivada dos searchParams na página.
2. **O `contrapartida=nao` não bastava para impedir o laço.** Ele recolhe a seção na chegada, mas o `deixarParaDepois` continua ligado — e o painel da segunda metade voltava a dizer "falta a outra metade da troca", apontando para a que o operador acabava de registrar. Cinco das seis lentes da primeira revisão adversarial acharam isso (§3.5). A decisão virou função pura (`deveOferecerAtalho`) sobre um campo do **par**, `contrapartida.jaRegistrada` — e o campo tem de ser do par, não da montagem: a segunda volta (§3.7) mostrou que, como estado de montagem, ele não sobrevivia ao rascunho e era herdado por um par novo montado na mesma tela.

### (E) Painel de sucesso, revisão e rascunho

O passo 3 mostra **dois blocos separados** ("Devolução — N ativos" / "Saída da troca — M ativos"), cada um com os seus campos, e o aviso de possível duplicata (M5) consulta as duas metades **com o tipo de cada uma**. O painel de sucesso mostra os dois grupos e puxa o documento de cada metade: **termos de responsabilidade** encadeados (com o foco andando sozinho, mecânica da F10 intacta) para os entregues, e o **termo de devolução** consolidado dos que voltaram. O mapa de modelo não mudou — `desligamento` continua puxando `devolucao_desligamento`; a troca puxa `devolucao_equipamento`.

O rascunho (M6) carrega a contrapartida (ids, campos e o flag), a restauração refaz a interseção **das duas metades** avisando o que caiu, e o teto vale para a soma. **Rascunho gravado antes desta fase restaura sem erro** — é o primeiro teste do bloco novo.

---

## 2. Checklist da ordem — autoverificado item a item

### Critérios de aceitação

| # | Critério | Situação | Prova |
|---|---|---|---|
| 1 | Sentido devolução → saída registra junto; devolvidos `em_triagem` sem detentor, entregues `em_uso` com o colaborador | ✅ | §3.3 (exercício no ENSAIO, estados conferidos por SQL) + `troca-upgrade.test.ts` §"montarItensDoPar" |
| 2 | Sentido saída → devolução: o espelho exato | ✅ | §3.3 (mesmo exercício, sentido invertido) + teste "sentido saída → devolução: o espelho exato" |
| 3 | Prefill honesto (único detentor pré-preenche; misto/vazio não) | ✅ | `troca-upgrade.test.ts` §"prefillContrapartida" (6 casos) + §"sincronizarPrefill" (6 casos: o prefill ACOMPANHA o lote enquanto o campo for do sistema — ver §3.7) |
| 4 | "Deixar para depois" registra só a metade principal; atalho pré-preenchido; nenhuma pendência no servidor | ✅ | `montarItensDoPar` §"deixar para depois"; `linkContrapartida` (4 casos); `deveOferecerAtalho` (6 casos); zero migration (§3.4) |
| 5 | Painel do par: termos de responsabilidade + termo de devolução, nos dois sentidos, com `desligamento` intacto no lote simples | ⚠️ **parcial** | Código lido e revisado (`painel-sucesso.tsx`: `grupoComTermo`, `gruposDevolucao`, mapa de motivo preservado). **Não exercitado na tela** — ver §6 |
| 6 | Guardas: disjunção, teto somado, seção vazia, limpeza ao trocar tipo/motivo, estado inválido avisado | ✅ | `troca-upgrade.test.ts` §"validarPar" (9 casos) + §"contrapartidaAtiva"; limpeza por `sincronizarContrapartida` (chamada por `set`/`trocarTipo`/`aplicarConfig`) e por `ajustarTipoPara`/`restaurarRascunho`/`reiniciar`, que zeram a contrapartida explicitamente |
| 7 | Falha parcial devolve cada ativo à metade certa; chips "já registrados"; nada se perde | ⚠️ **parcial** | Código lido e revisado (`submetidosPrincipal`/`submetidosContra` separados; erros das duas metades listados). **Não exercitado ao vivo** — ver §6 |
| 8 | Rascunho novo salva/restaura o par com re-interseção; rascunho antigo restaura sem erro | ✅ | `rascunho.test.ts` §"a contrapartida (F26)" — 9 casos, o primeiro sendo o formato ANTIGO |
| 9 | Nada fora do fluxo mudou (zero migration, `troca`/RPC/devolução-fornecedor byte a byte, relatórios, kits, motivos, import, lista) | ✅ | §3.4 — `git diff` vazio em cada alvo |
| 10 | `lint`, `test`, `build` limpos; guardas da ajuda verdes; smoke OK; deploy READY | ✅ | §3.1, §3.2, §3.6 |
| 11 | Documentação emendada + este relatório | ✅ | §5 |

### Escopo — o que a ordem mandou NÃO tocar

| Item | Situação |
|---|---|
| Nenhuma migration, RPC, policy ou trigger | ✅ `git diff b50d1ea..HEAD -- supabase/` é **vazio** |
| Tipo `troca`, RPC `devolver_ao_fornecedor`, fluxo devolução-fornecedor | ✅ diff vazio nos arquivos do fluxo |
| Máquina de estados e `TRANSICOES` | ✅ `validators/movimentacao.ts` **não** foi alterado |
| RLS / cargos / vínculos | ✅ nada em `src/lib/auth/**`; o par usa as guardas existentes da action |
| Relatórios e snapshots | ✅ diff vazio em `queries/relatorios`, `lib/relatorios`, `components/relatorios`, `app/(app)/relatorios` |
| Kits e `admin/kits` | ✅ diff vazio em `validators/kit.ts` e `app/(app)/admin` — o payload do kit **não** ganhou contrapartida |
| `admin/motivos`, import, lista `/movimentacoes`, linha do tempo | ✅ diff vazio |
| `src/components/ui/**` | ✅ diff vazio |
| Dependência nova | ✅ diff vazio em `package.json`/`package-lock.json` |
| Dado real em seed/fixture/teste/screenshot | ✅ os dados do exercício são `WAP000900x` / "Fulano de Tal" / "Beltrana de Tal" |

**Uma alteração fora do fluxo, deliberada e registrada:** `src/lib/dominio.ts` ganhou `ehTipoMovimentacao`/`ehStatusAtivo` (+13 linhas), e `rascunho.ts` passou a usá-los. É a correção do achado 3 da revisão — o mesmo defeito que a fase introduziria em `configInicialDaUrl` **já existia** no rascunho desde a F10. Consertar um e deixar o gêmeo seria estranho; está em §3.5.

---

## 3. Evidências (saídas reais)

### 3.1 Baseline — medida ANTES de qualquer mudança

```
$ npm run lint
> eslint
(sem saída = limpo)

$ npm run test
 Test Files  82 passed (82)
      Tests  1778 passed (1778)

$ npm run build
(exit code 0)
```

### 3.2 Portões ao fim

```
$ npm run lint
> eslint
(sem saída = limpo)

$ npm run test
 Test Files  83 passed (83)
      Tests  1860 passed (1860)

$ npm run build
✓ Compiled successfully in 14.5s
✓ Generating static pages using 7 workers (27/27) in 1237ms
```

**+82 testes** (1778 → 1860), **+1 arquivo** de teste: `troca-upgrade.test.ts` com **62 casos** (era o arquivo inteiro novo), mais **20** em `rascunho.test.ts` (13 deles novos, sobre a contrapartida e a chave herdada) e **37** em `config.test.ts` (7 novos, sobre `configInicialDaUrl`).

Guardas da ajuda F20, isoladamente:

```
$ npx vitest run src/lib/ajuda
 Test Files  11 passed (11)
      Tests  395 passed (395)
```

### 3.3 O exercício no ENSAIO — dados 100% fictícios

Não há caminho autorizado para dirigir a tela logada no navegador (a regra está registrada: o bypass de autenticação foi barrado pelo classificador de segurança em 23/07 e **não se insiste**). O que dá para provar sem credencial é o **payload**: montei no ENSAIO (`sgmvldiizsrjbxzzpmhh`) exatamente o array que `montarItensDoPar` + `montarRow` produzem, na mesma ordem, e conferi o efeito da máquina de estados.

Ativos fictícios criados (`WAP0009001`–`WAP0009006`, todos com `observacoes` dizendo que são do exercício). Estado inicial: os "antigos" entregues a "Fulano de Tal" por uma saída normal.

**Sentido devolução → saída** (principal primeiro, campos compartilhados iguais nas duas metades):

```
patrimonio  | status      | colaborador_atual | setor_atual | termo_assinado
WAP0009001  | em_triagem  | (null)            | (null)      | (null)
WAP0009002  | em_uso      | Fulano de Tal     | TI          | sim
```

**Sentido saída → devolução** (o espelho):

```
patrimonio  | status      | colaborador_atual | setor_atual
WAP0009003  | em_triagem  | (null)            | (null)
WAP0009004  | em_uso      | Beltrana de Tal   | Financeiro
```

As seis linhas gravadas, como o banco as vê:

```
patrimonio | tipo      | motivo           | chamado | itens_faltantes | forcado
WAP0009001 | saida     | novo_colaborador | (null)  | (null)          | false
WAP0009003 | saida     | novo_colaborador | (null)  | (null)          | false
WAP0009001 | devolucao | troca_upgrade    | 90001   | {carregador}    | false
WAP0009002 | saida     | troca_upgrade    | 90001   | (null)          | false
WAP0009003 | devolucao | troca_upgrade    | (null)  | {}              | false
WAP0009004 | saida     | troca_upgrade    | (null)  | (null)          | false
```

São `saida` e `devolucao` **normais**: nenhuma coluna nova, `forcado = false`, nenhuma marca de "par". E a pendência de item da metade que recebe nasceu como sempre (trigger da `0051`):

```
item        | colaborador   | status | patrimonio
carregador  | Fulano de Tal | aberta | WAP0009001
```

`WAP0009005` e `WAP0009006` ficaram `em_estoque` no ENSAIO, prontos como substitutos para o roteiro manual do §7.

### 3.4 Zero mudança de banco e escopo intocado — a prova é o diff

```
$ git diff b50d1ea..HEAD --stat -- supabase/
(vazio)

$ git diff b50d1ea..HEAD --stat -- src/components/movimentacoes/devolucao-fornecedor-form.tsx \
    "src/app/(app)/movimentacoes/devolucao-fornecedor" src/lib/actions/ativos.ts
(vazio)

$ git diff b50d1ea..HEAD --stat -- src/lib/queries/relatorios src/lib/relatorios \
    src/components/relatorios "src/app/(app)/relatorios"
(vazio)

$ git diff b50d1ea..HEAD --stat -- src/lib/validators/kit.ts "src/app/(app)/admin" \
    src/lib/import src/components/movimentacoes/lista-movimentacoes.tsx \
    src/components/ui src/components/ativos/linha-do-tempo.tsx
(vazio)

$ git diff b50d1ea..HEAD -- package.json package-lock.json
(vazio)
```

`src/lib/validators/movimentacao.ts` também **não** foi tocado: a máquina de estados, `TRANSICOES`, `CAMPOS_POR_TIPO` e `MAX_LOTE_MOVIMENTACAO` são consumidos pelo par, nunca alterados por ele.

### 3.5 Revisão adversarial em contexto fresco (§V)

**Primeira volta** — 6 lentes independentes sobre o diff da fase, cada achado submetido a 3 céticos com refutação por padrão (42 agentes). **12 achados brutos**, convergindo em **5 defeitos distintos** — todos reais, todos corrigidos no commit `8990e85`:

| # | Defeito | Quantas lentes | Correção |
|---|---|---|---|
| 1 | O `contrapartida=nao` **não impedia o laço**: registrada a metade que veio pelo atalho, o painel voltava a oferecer o atalho, apontando para a metade recém-gravada | 5 de 6 | `deveOferecerAtalho` (função pura) + estado `veioDoAtalho`, que morre no "Registrar outra movimentação" |
| 2 | Atalho podia virar **botão morto**: link idêntico à URL atual é navegação que não acontece, e o estado inicial só é lido na montagem | 1 | `de=<movimentação de origem>` no link + `key` da página derivada de **todos** os searchParams |
| 3 | `tipo in TIPO_META` aceita chaves **herdadas de `Object.prototype`**: `?tipo=toString` passava por tipo válido e o passo 2 estourava em `CAMPOS_POR_TIPO[tipo].campos` | 2 | `ehTipoMovimentacao`/`ehStatusAtivo` em `dominio.ts` — **e o mesmo defeito no rascunho, que vinha da F10** |
| 4 | Restaurar rascunho descartava a contrapartida **em silêncio** quando o tipo da metade principal caía na re-interseção | 2 | aviso dizendo quantos equipamentos da outra metade ficaram de fora, e por quê |
| 5 | Com a seção recolhida, o lote principal **recusava ativo por causa de estado invisível** na tela | 1 | a recusa passou a valer só com a contrapartida ATIVA (`validarPar` barra no envio se ela for reaberta com o mesmo ativo nos dois lados) |

Cada correção ganhou teste: `deveOferecerAtalho` (5 casos), `de=` no link (1), chave herdada de `Object.prototype` em `configInicialDaUrl` (1) e no rascunho (1). **+9 testes.**

⚠ **Uma ressalva honesta sobre os votos dos céticos.** A contagem bruta foi "23 refutaram, 6 mantiveram", e 10 dos 12 achados aparecem como refutados — mas esse sinal está **contaminado**: eu apliquei as correções na árvore de trabalho **enquanto** os céticos liam o código, e vários deles disseram exatamente isso ("o cenário não reproduz mais… a correção já está no working tree"). Dois céticos que leram os commits revisados confirmaram o achado nº 1 palavra por palavra. Portanto **não** tratei "refutado" como "não era defeito": conferi os cinco eu mesmo contra o código antes de corrigir, e o nº 3 é demonstrável em uma linha (`'toString' in {a:1}` → `true`).

**Segunda volta** — 4 lentes sobre o HEAD **já corrigido** (`8990e85`), para fechar o ciclo "corrija e re-revise até limpar": ver §3.7.

### 3.6 Deploy e smoke pós-deploy (produção)

Deploy do commit `8990e85` pela `main`: estado **READY** (`dpl_2fscgB7YuPrXkjRQLDY4iak3EjRd`, target `production`).

```
$ node scripts/smoke/smoke-prod.mjs
  [OK   ] /movimentacoes/nova — HTTP 307 → /login          (parte A, sem sessão)
  [OK   ] /movimentacoes/nova — HTTP 200 (98662 bytes)     (parte C, logado)
========================================================================
RESUMO · 93 OK · 4 aviso · 0 n/a (pré-F12) · 0 falha
========================================================================
```

Os **4 avisos são preexistentes e alheios à fase**: catálogo de itens vazio em produção (3 deles) e "RLS de `kits_modelos` não comprovada porque não há kit cadastrado".

A entrada de `/movimentacoes/nova` na parte C ganhou **marcador de conteúdo** nesta fase (`Registre uma movimentação`, o subtítulo do corpo). Até aqui ela exigia só HTTP 200 — e um 200 servindo um formulário quebrado continuaria verde. O marcador **não** é `Nova movimentação`: essa string é `<h1>`, item do shell e texto do botão do header ao mesmo tempo, e passaria numa página errada.

### 3.7 Segunda volta adversarial (contra o HEAD corrigido)

Justamente porque os votos da primeira volta estavam contaminados, rodei uma **segunda volta** contra o `8990e85` — a árvore limpa, com os cinco fixes dentro —, com quatro lentes: "os fixes estão completos?", "o fix quebrou algo?", "ordem × entrega" e "a documentação mente?". Ela achou **13 coisas**, e as mais sérias eram **defeitos do próprio conserto**:

| # | Achado | Correção |
|---|---|---|
| 1 | **O marcador do atalho era estado de MONTAGEM, e o rascunho não o carregava.** Salvar o lote na tela aberta pelo atalho e restaurá-lo numa URL limpa devolvia `deixarParaDepois: true` sem o marcador — e o laço voltava, pelo Restaurar | O marcador virou **campo do PAR** (`ContrapartidaTroca.jaRegistrada`), persistido no rascunho junto com o `deixarParaDepois` |
| 2 | **O mesmo marcador era herdado por um par NOVO** montado na tela do atalho: o texto afirmava uma movimentação que não existe e o painel **escondia** um atalho genuinamente pendente | Resolvido pela mesma mudança: `nascerContrapartida` devolve `jaRegistrada: false` por construção |
| 3 | **O prefill congelava no nascimento da seção.** Abrir a seção com um notebook do Fulano e depois juntar o da Beltrana deixava "Fulano de Tal" escrito num lote de detentores **mistos** — o chute silencioso que o critério 3 proíbe | `sincronizarPrefill` (pura): o prefill acompanha o lote **enquanto o campo for do sistema**; `prefillColaborador` guarda o último valor automático e é o que distingue "do sistema" de "o operador digitou" |
| 4–13 | Documentação: o relatório ainda não existia quando a lente leu; contagem de testes desatualizada em 3 arquivos; "três módulos novos" quando são quatro; a matriz chamando `aplicarConfig` de "porta única"; duas contagens de casos erradas; a spec/CHANGELOG/README/ajuda afirmando que o painel **sempre** oferece o atalho; e a ata do atalho sem o `de=` | Todas aplicadas — ver §5 |

**+11 testes** nesta volta (6 de `sincronizarPrefill`, 1 do par novo herdando o marcador, 4 do rascunho carregando `jaRegistrada`/`prefillColaborador`). Portões depois dela: lint limpo, **1.860 testes**, build compilado.

⚠ **Não houve terceira volta.** O ciclo "corrija e re-revise até limpar" parou aqui, com os achados da segunda volta corrigidos e testados, mas **sem** uma leitura adversarial nova sobre essas últimas correções.

---

## 4. Decisões registradas

**9 atas** em [`DECISOES.md`](DECISOES.md) (2026-08-04 · F26) — oito de desenho e uma da revisão em duas voltas. As que mais importam:

1. **"Só a tela"** — nem vínculo do par no banco, nem pendência automática de troca incompleta; as duas ideias foram para o backlog. Consequência aceita: as duas movimentações são **independentes** depois de gravadas, e estornar uma não desfaz a outra.
2. **`data`, `chamado` e `observacao` são compartilhados** pelas duas metades; o motivo da contrapartida é fixo. A troca é um evento só — campos duplicados convidariam a divergência silenciosa entre as duas linhas do mesmo fato.
3. **O prefill só acontece quando é honesto**, e é capturado antes do envio.
4. **A metade principal vai primeiro** no array submetido, porque a action interrompe no primeiro erro.
5. **O atalho é querystring**, com `contrapartida=nao` (contra o laço) e `de=` (contra o botão morto); e a `key` da página é o que faz a mesma rota remontar.
6. **`setor_atual` NÃO entra no `RESUMO_SELECT`** — o prefill vale só o colaborador, que já satisfaz a regra "colaborador OU setor" da saída.
7. **A detecção é pelo código do motivo**; motivo desativado simplesmente não dispara o facilitador.
8. **O ativo em estado inválido é recusado na entrada** da contrapartida (e não "limpa o tipo", como no lote principal, porque o tipo da metade oposta é derivado e não pode ser limpo).

---

## 5. Documentação emendada

| Documento | O que mudou |
|---|---|
| `docs/ESPECIFICACAO.md` | §6 item 4: o par entra na lista de facilitadores ("**Desde a F26, também o par troca/upgrade**"); e uma **emenda datada** no fim da §6 com a mecânica das duas metades, o aviso de vocabulário (`troca` × `troca_upgrade`) e a consequência aceita |
| `docs/MATRIZ-REGRAS.md` | Emenda F26 com **R-MOV-30…36** (7 regras); contador do cabeçalho corrigido — dizia "217 hoje" quando a emenda F25 já declarava 224 → **231** |
| `docs/DECISOES.md` | 9 atas (2026-08-04 · F26), sendo uma da revisão em duas voltas |
| Ajuda F20 | `registrar-movimentacao`: âncora `registrar-troca-upgrade` com o passo a passo, mais 4 linhas na tabela de erros (todas com o teto **interpolado** da constante — escrever o número à mão derruba um guarda) e link para a página irmã. `devolucao-e-triagem`: âncora `devolucao-troca-upgrade`, vista do lado de quem recebe, mais 1 linha de erro. Termos de busca dos dois: troca, upgrade, contrapartida |
| `CHANGELOG.md` · `README.md` · `docs/prompts/README.md` | Entrada no topo, parágrafo de status (e os dois contadores `F0 → F26`) e a linha da fase |

---

## 6. O que este relatório NÃO prova

- **Nada foi exercitado na TELA.** Não existe caminho autorizado para dirigir uma rota logada no navegador (o bypass de autenticação foi barrado pelo classificador de segurança em 23/07 e a regra é não insistir). Tudo o que se afirma sobre a UI vem de **leitura de código, testes de função pura e revisão adversarial** — não de cliques. Em particular, **não** foram vistos funcionando: a seção nascendo e sumindo ao trocar tipo/motivo, o encadeamento de foco dos termos no painel do par, o atalho do "deixar para depois" de ponta a ponta, e a volta de uma falha parcial separando as metades.
- **A falha parcial não foi induzida.** O critério 7 está marcado como parcial: o código foi lido e revisado, mas ninguém movimentou um ativo por fora entre a revisão e o registrar para ver as metades voltarem separadas.
- **O exercício do ENSAIO prova o payload, não o formulário.** As seis movimentações foram inseridas por SQL, replicando exatamente o que `montarItensDoPar` + `montarRow` produzem. Isso prova a máquina de estados, o motivo, os campos compartilhados e a pendência de item — **não** prova que a tela monta esse payload (isso quem prova são os testes de `montarItensDoPar`).
- **Nenhum `.docx` foi aberto.** O termo de responsabilidade e o de devolução do par não foram gerados nem conferidos num leitor de Word; o que se afirma é que o painel oferece o **modelo certo** para cada metade, o que se lê no código.
- **Concorrência não foi testada.** Dois operadores montando trocas sobre o mesmo equipamento ao mesmo tempo caem nas guardas existentes (trigger de transição, barreira de ativo repetido), mas isso não foi exercitado.
- **Os votos dos céticos da 1ª volta não são sinal limpo** — a árvore mudou durante a revisão; ver a ressalva em §3.5.
- **As contagens de relatório não foram medidas antes e depois.** O argumento é de construção — nenhum arquivo de relatório mudou (diff vazio) e as linhas gravadas são `saida`/`devolucao` comuns —, não uma comparação numérica.

---

## 7. Roteiro manual de 5 minutos (para o Johnny)

Faça no **ENSAIO**, com os equipamentos fictícios que a fase deixou prontos (`WAP0009002` está **em uso com "Fulano de Tal"**; `WAP0009005` e `WAP0009006` estão **em estoque**).

1. **Sentido devolução → saída (1,5 min).** Movimentações › Nova → busque `WAP0009002` → avance → tipo **Devolução**, motivo **Troca / upgrade**. A seção **"Saída da troca"** tem de abrir, já com o colaborador **"Fulano de Tal"** preenchido. Escolha `WAP0009005` na busca da seção, revise (dois blocos separados, contagens certas) e registre. Confira as duas fichas: `WAP0009002` em triagem sem detentor, `WAP0009005` em uso com Fulano.
2. **Os dois termos (1 min).** Ainda na tela de sucesso: gere o **termo de responsabilidade** de `WAP0009005` e o **termo de devolução** de `WAP0009002`. Os dois blocos têm de aparecer no mesmo painel.
3. **Sentido saída → devolução (1 min).** Nova movimentação → busque `WAP0009006` → tipo **Saída**, motivo **Troca / upgrade** → a seção **"Devolução da troca"** abre. Na busca dela, digite **"Fulano"**: o equipamento que está com ele tem de aparecer. Registre junto.
4. **Deixar para depois + atalho (1 min).** Repita o passo 1 com outro equipamento, mas marque **"Deixar a contrapartida para depois"** e registre. Na tela de sucesso, clique em **"Registrar agora a saída da troca"**: o fluxo tem de reabrir com tipo, motivo e colaborador **já preenchidos**, e a seção do par **recolhida** — e, ao registrar essa metade, o painel **não** pode voltar a oferecer o atalho (era o defeito nº 1 da revisão).
5. **As guardas (30 s).** Tente pôr o **mesmo** equipamento nas duas metades — tem de ser recusado nomeando o patrimônio. Troque o motivo para outro qualquer: a seção tem de **sumir**, e voltar vazia quando você escolher Troca/upgrade de novo.
6. **Os relatórios (30 s).** Abra `/relatorios` do período: as linhas da troca aparecem nas tabelas **Saídas** e **Entradas** como qualquer saída e devolução — nenhuma contagem nova, nenhuma coluna nova.

---

## 8. Pendências e backlog

| Item | Nota |
|---|---|
| **Vínculo do par no banco** | Backlog, por decisão do Johnny ("só a tela"). Seria uma migration aditiva; `montarItensDoPar` é o único lugar da UI que mudaria |
| **Pendência de "troca sem contrapartida"** | Backlog, mesma decisão. Hoje o adiamento não deixa rastro no servidor — só o atalho na tela de sucesso |
| **E2E visual de tela logada** | Continua sem caminho autorizado. Se o Johnny quiser, ele autoriza explicitamente numa conversa e o scaffold volta a ser possível |
| **`?ativo=`/`?duplicar=` sem guarda de uuid** | Preexistente, fora do escopo desta ordem: um valor fora do formato faz o Postgres devolver 22P02 e a página cai no error boundary genérico onde o certo seria um 404. `ehUuid` (`lib/url-params.ts`) já existe e `/ativos/novo` já faz o certo |
| **Colisão de IDs na `MATRIZ-REGRAS`** | Preexistente: a emenda F25 reusou `R-TER-14/15/16`, que já existiam na área A5. A F26 não repetiu o erro (usou `R-MOV-30…36`, livres), mas a colisão da F25 continua lá |
| **Equipamentos fictícios no ENSAIO** | `WAP0009001`–`WAP0009006` e as 6 movimentações do exercício ficaram no ensaio, marcados em `observacoes`. Servem ao roteiro do §7; apagá-los exige a Zona destrutiva do dev, porque o trigger `guarda_acervo` recusa DELETE fora dela |

---

*Relatório escrito ao fim da execução autônoma da F26, em 04/08/2026.*
