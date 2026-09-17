# Relatório F61 — Os pontos de injeção da UI

**v1.66.0** · **sem migration — fase só de código** · 17/09/2026 · SHA de código congelado **`fcfb7b3`** ·
código no [PR #54](https://github.com/vmatusita/ti-wap-inventory-control/pull/54) (merge `c7d1a23`) ·
documentação no PR de fecho, com a tag anotada `v1.66.0` no merge dele

> A última fase de preparação do multiempresa. `src/components/admin/` e `src/components/relatorios/` — os dois
> diretórios onde a UI de tenant vai nascer — saíram da isenção da régua de layout, e os **45 arquivos** que ela
> reprovava (**113 violações**) foram convertidos pela escala do sistema de design. A isenção não pode voltar: a régua
> recusa, por construção, qualquer entrada de `PENDENTES` sob esses dois prefixos, e a catraca passou a comparar
> **conjuntos nominais** — arquivo novo fora da régua reprova, arquivo apagado passa, arquivo que volta a ser isento
> reprova com o nome. A sigla, o nome do sistema e o crédito de autoria passaram a sair de **uma fonte só**, com **uma**
> grafia; o texto sobre o cromo escuro e sobre o amarelo da marca virou **par de tokens medido**; e cinco correções
> pequenas que a virada tornaria caras foram fechadas — o verde de sucesso, a confirmação digitada única, o diálogo que
> semeava do render velho, o filtro que perdia clique e a chave de storage literal. **Nenhum número de tela mudou, e
> nenhum pixel mudou fora da tabela de mudanças de propósito**: 242 linhas, conferidas dos dois lados — contra o diff de
> classes por arquivo desde a `v1.65.0` e contra a comparação de pixel das 8 vitrines de uma prévia estática nova, onde
> o cromo inteiro deu **zero**. A válvula de escape (`DEVOLVIDOS_F61B`) fechou a fase **vazia**: não há F61B.

---

# 1. O ROTEIRO DO JOHNNY — o que conferir, e o que ficou

*Nada aqui é pedido de autorização: a fase fechou inteira. É o que vale a pena olhar, e o que não se resolveu nela.*

### Por que esta fase não fotografou o app

O caminho natural para provar "nenhum pixel mudou" seria `scripts/design/capturar.mjs`, que sobe o `next dev` e fotografa
as telas de verdade. **Não foi usado, de propósito:** o `.env.local` aponta para o **ensaio**, que guarda cópia de dado
real — nome de pessoa, patrimônio, filial. Fotografar de lá poria dado real numa evidência versionada. A prova visual
saiu de um instrumento novo, `scripts/design/previa-f61.tsx`: os componentes reais de `src/`, o `globals.css` do próprio
app, dublê de `Dialog` e de `server-only`, **dados 100% fictícios**. É menos do que a tela de produção — e o §12 diz
exatamente quanto menos.

### Conferir (5 minutos, só leitura)

```bash
npx vitest run src/lib/layout/consistencia.test.ts
```
983 casos. Se algum arquivo de `components/admin/` ou `components/relatorios/` sair da régua, este comando o nomeia.

```bash
npx tsx scripts/design/diff-classes-f61.ts
```
Compara, arquivo por arquivo, toda classe CSS que mudou desde a `v1.65.0` com a tabela de mudanças de propósito.
Deve dizer *"nenhuma diferença sem linha, nenhuma linha sem diferença"*.

```bash
npm run contraste
```
167 pares. Os 12 novos da F61 estão marcados na saída; um deles é o "antes registrado" do medidor (§12).

E, para ver com os olhos: [`docs/f61-evidencias/depois/`](f61-evidencias/depois) tem as 8 vitrines em PNG (claro e
escuro, 1440 e 390), e [`antes/`](f61-evidencias/antes) as mesmas de antes da fase. O relatório da comparação, quadro a
quadro, é [`G-pixels.txt`](f61-evidencias/G-pixels.txt).

### O que ficou, com dono

| o que | por quê | dono |
|---|---|---|
| As **rotas** `(app)/admin/**` e `(app)/relatorios/**` (18 `.tsx`: 13 sem casco, 4 esqueletos) seguem em `PENDENTES` | é o casco — regras 7 e 8 da régua —, matéria das frentes **b** e **c** do sistema de design. A F61 destravou os **componentes** | `PLANO-DESIGN-SYSTEM.md`, frentes b/c |
| `EstadoVazio` não adotado nos 5 vazios de tabela do admin | trocar o componente acrescentaria um ícone que essas telas não têm e ~16 px de altura — mudança visível fora do combinado. Aplicou-se a regra de **escala** (`py-10` → `py-12`) | backlog PATCH |
| A barra de folga do medidor mede **2,93:1** (piso 3:1) | é a cor de ANTES da fase; consertar é escurecer a barra = gráfico visivelmente diferente | backlog PATCH, com nome em `contraste.mjs` |
| `PainelSucesso` rola na horizontal a 390 px | rolava igual antes da fase; está fora de `admin/` e `relatorios/` | backlog PATCH |
| As **frases da empresa** (9 sítios: "É operador da WAP?", "posse WAP", `voce@wap.ind.br`…) | decisão iii do Johnny: **ficam**. São frase de empresa, não nome de sistema | F70 (`PLAN-F61.md` §5.2) |
| O prefixo `wap` das chaves de storage | `chaveDeStorage` já o centraliza; separar por empresa é a virada | F62 (`ESCOPO_UNICO`) / F70 |
| `PassoMovimentacao`, `nova-compra-form`, `importar-wizard`, `grupos-erros` seguem grandes | fora do escopo por ordem expressa | backlog de decomposição |

### Rollback — se precisar

**Pós-deploy, conferido:** `/api/saude` responde `1.66.0` / `c7d1a23`, banco ok; `scripts/smoke/smoke-prod.mjs`
deu **109 OK · 1 aviso · 0 falha** — o aviso é o de `kits_modelos`, de sempre, não regressão desta fase
([`M-revisao-adversarial.txt`](f61-evidencias/M-revisao-adversarial.txt), bloco 5).

`git revert` do merge. A fase é **só código**: nenhuma migration, nenhum dado, nenhuma chave de storage renomeada (as
sete são byte a byte as de antes — é o que `assinatura-realtime.test.ts` prova). Reverter não perde rascunho de ninguém.

---

# 2. O que mudou, por arquivo e por quê

**123 arquivos** (115 em `src/`, 7 em `scripts/` e o `vitest.config.mts`), **23 deles novos**. Os commits saíram
por FRENTE, não por lote — o porquê está na divergência 11.

### Os módulos novos — os pontos de injeção

| arquivo | o que é | quem injeta depois |
|---|---|---|
| `src/lib/identidade/sistema.ts` | `identidadeDoSistema()` → `{sigla, nome, nomeCompleto, descricao, credito}`. **Puro**: sem `'use client'`, sem `server-only`, sem `process.env`, sem banco | F70 troca o corpo; os 10 consumidores não mudam |
| `src/lib/layout/pendentes-da-regua.ts` | `PENDENTES` (30, com motivo), `SOB_REGRA_CONGELADA` (154), `DIRETORIOS_SEM_ISENCAO`, `DEVOLVIDOS_F61B` e `conferirCatraca()` | — (é a régua) |
| `src/lib/layout/regra-de-tinta.ts` | `PARES_PROIBIDOS` + `EXCECOES_DE_TINTA` (vazia) + `conferirTinta()` | — |
| `src/lib/varredura/literais.ts` | a varredura AST da `sem-wapismo` promovida a módulo (só literal: `StringLiteral`, parte de template, `JsxText`) | usada por 3 travas |
| `src/components/dialogos/use-dialogo-semeado.ts` | `deveSemear()` (pura) + `useDialogoSemeado()` | 8 diálogos |
| `src/components/filtros/url.ts` | base pendente **por caminho** + `useEsquecerFiltrosAoSair()` | 5 filtros |

### Os 45 convertidos (as 113 violações)

Regra escrita **uma vez** (`PLAN-F61.md` §3.1) e aplicada mecanicamente, com nome por tipo de defeito:

| regra | defeito | conversão | ocorrências |
|---|---|---|---:|
| **T1** | `text-[11px]`, `text-[13px]` e afins | `text-xs` / `text-sm` pela escala §3.4 | 31 |
| **E1** | espaçamento fora da escala (`gap-5`, `py-10`, `mt-7`…) | o degrau da escala §3.1 — **empate sobe** | 44 |
| **E2** | espaçamento arbitrário (`p-[18px]`) | idem | 6 |
| **L1/L2** | largura de célula à mão (`w-[140px]`) | a escala de larguras | 12 |
| **M1–M4** | moldura à mão (`border rounded-lg p-4`) | `QuadroDeTabela` / `Card` / `Aviso` | 20 |

**Empate sobe** é a única escolha da regra que não é forçada: `gap-5` fica entre `gap-4` e `gap-6`, e subir é o que
mantém a legibilidade em 390 px. Está na tabela de mudanças de propósito, linha a linha, com o efeito visível marcado.

### Os que mudaram de cor por token (sem mudar de cor)

`--sucesso`/`--sucesso-texto`, `--medidor-folga`/`--medidor-folga-barra`, `--brand-dark-texto` (#ffffff) e
`--brand-amarelo-texto` (#000000), **literais em `:root` e em `.dark`** — porque `contraste.mjs` lê o valor por NOME nos
dois blocos, e um `var(--x)` no lugar do literal faz a régua **estourar** em vez de ignorar em silêncio (sabotagem E2).
O `Aviso` ganhou a quarta intenção (`sucesso`, papel ARIA `status`) e o `Badge`, a variante `sucesso`. Os 8 arquivos do
cromo trocaram `text-white`/`text-black` pelos tokens: **zero pixel** de diferença (§5).

---

# 3. Os números MEDIDOS, lado a lado com a ficha

| medida | ficha/ordem dizia | **medido** | onde |
|---|---|---|---|
| arquivos reprovados pela régua | 44 | **45** | `B-regua-vermelha.txt` |
| violações | 109 | **113** | idem |
| linha da isenção por prefixo | `consistencia.test.ts:130` | **`:132`** | leitura |
| arquivos do cromo escuro | 7 | **8** (o 8º é `viewer-nav.tsx`, sem `bg-brand-dark` próprio) | `PLAN-F61.md` §6 |
| chamadas do crédito | 3 | **4** (uma num componente sem consumidor) | `PLAN-F61.md` §5.1 |
| diálogos de CRUD do admin | "3 de 5" | **4 de 6**, mais o de relatórios | `PLAN-F61.md` §9 |
| filtros que perdem o fix | "3 dos 5" | **2** (o terceiro tinha cópia em `useRef`) | `PLAN-F61.md` §10 |
| chaves em `localStorage` | "prioridade nas 3" | **1** das sete | `PLAN-F61.md` §11 |
| rotas de admin/relatórios | "12 arquivos e 3 esqueletos" | **18 `.tsx`**: 13 rotas, 4 esqueletos | `PLAN-F61.md` §3.4 |
| sítios de verde | 12 | **12** — mas dois são as DUAS linhas do `medidor-minimo` | `PLAN-F61.md` §7.1 |
| callouts âmbar legítimos | 302 | **301** no grep cru; **293** na catraca | `PLAN-F61.md` §7.3 |

E o antes × depois do repositório:

| medida | antes (`v1.65.0`) | **depois (`1.66.0`)** |
|---|---:|---:|
| `npm run test` | 228 arquivos · 6.432 testes | **238 arquivos · 7.027 testes** |
| `.test.tsx` (rig grau 1) | 5 | **11** |
| `SOB_REGRA` (arquivos sob a régua) | 77 de 251 | **154** |
| arquivos reprovados pela régua | 45 (113 violações) | **0** |
| `PENDENTES` | 32 entradas (15 prefixos + 17 arquivos) | **30**, todas com motivo |
| `DEVOLVIDOS_F61B` | — | **vazia** |
| `TETO_PALETA_CRUA` / `ARQUIVOS_COM_PALETA` | 473 / 61 | **413 / 53** |
| superfície do visualizador / `SUPERFICIE_MINIMA` | 155 / 125 (folga 30) | **158 / 149** (folga 9, os dois números escritos) |
| pares em `scripts/contraste.mjs` | 157 | **167** |

---

# 4. As doze decisões, com o custo que decidiu cada uma

As três do Johnny e as doze da fase estão na ata de [`DECISOES.md`](DECISOES.md) (17/09/2026, entradas (a)–(g)) com o
contexto e o motivo. Aqui, o resumo com o que cada uma custou:

1. **A fonte única** (`identidadeDoSistema()`) — pura, porque três tipos de consumidor a chamam (Server Component,
   Client Component e o `metadata` do `layout.tsx`): qualquer marca fecharia uma porta. **Não é autorização.**
2. **Os tokens da marca e do cromo** — literais nos dois blocos, nos 8 arquivos; razões idênticas às de antes
   (9,70 · 18,89 · 9,48 · 12,17 · 14,60).
3. **A grafia única** `Estoque TI WAP` — muda de propósito o título da aba de `/auth/confirm` e `/auth/definir-senha`.
4. **A régua** — 45 convertidos, catraca por conjunto nominal, 30 pendentes com motivo próprio.
5. **A válvula** — `DEVOLVIDOS_F61B` **não foi usada**. Não há F61B.
6. **O verde** — dois pares distintos (`sucesso` ≠ `medidor-folga`), porque amarrá-los faria a próxima mudança de um
   mexer no outro; a variante usa o par **cheio**, não o molde do `warning` com opacidade, que repintaria os selos.
7. **A regra de tinta** — lista de exceções **escrita**, não derivada dos comentários do CSS (derivar proibiria 204 usos
   legítimos); fechou **vazia**.
8. **A confirmação digitada** — as **quatro** migradas (decisão ii), e a mesa de conflitos passou a anunciar o erro.
9. **`useDialogoSemeado`** — 8 consumidores; exceção nomeada: `lancar-item-dialog` (mantém o carrinho entre aberturas
   de propósito). `editar-ativo-dialog` nem dispara a trava: o react-hook-form sincroniza por `values`.
10. **Os filtros** — pendente **por caminho**; fechou o vazamento `/itens` → `/itens/historico` que a ficha não previa.
11. **O storage** — sete construtoras, chave **calculada no uso** (constante de módulo congelaria o valor antes de o
    escopo existir); exceções `wap-sidebar` e `theme`, nomeadas.
12. **A prova visual** — prévia estática, §5.

### As divergências declaradas

Vinte e três — mais os cinco consertos que a revisão adversarial forçou, que têm seção própria (§7). Nenhuma foi
silenciosa: cada uma está num comentário de código, numa linha da tabela de mudanças de
propósito ou numa entrada da ata.

**O que a ficha e a ordem diziam, e o disco desmentiu (nove)** — a tabela do §3. Todas registradas também na emenda F61
da [`MATRIZ-REGRAS.md`](MATRIZ-REGRAS.md), na seção "as afirmações erradas conhecidas", que não se edita.

**O que a fase decidiu diferente do plano (seis):**

10. **`scripts/design/capturar.mjs` não foi usado.** Aponta para o ensaio, que guarda cópia de dado real. Instrumento
    novo, prévia estática — o custo é o §12.1.
11. **Commits por FRENTE, não por lote.** A conversão, os pontos de injeção e as correções se cruzam nos mesmos arquivos
    (o `importar-wizard` recebeu classe, token **e** a caixa de confirmação), e `git add` é por arquivo.
12. **O par do medidor entrou como `antes: true`, não `exigir: true`** — 2,93:1 contra o piso de 3:1. Backlog PATCH.
13. **`EstadoVazio` não adotado** nos cinco vazios do admin: só a regra de escala.
14. **A variante `sucesso` usa o par cheio**, não o molde do `warning` (token + `/10`), que repintaria os selos.
15. **As QUATRO confirmações migraram**, não "as que couberem" — decisão ii do Johnny, porque a trava nasceria com três
    exceções.

**O que a execução encontrou e a ordem não previa (oito):**

16. **O vazamento de filtro ENTRE rotas** (`/itens` → `/itens/historico`): defeito real, provado vermelho antes da
    correção (sabotagem H).
17. **Nomes de filial reais em placeholders de produção** ("Ex.: Linhares", "CD Afonso Pena"). A prévia os **mascara**
    ("Filial de exemplo") — substituição declarada na evidência; o fonte não mudou.
18. **A sabotagem K1 nasceu no-op** — a classe que o roteiro mandava trocar já não existia depois da conversão. Refeita
    com uma classe atual do mesmo arquivo.
19. **A faixa de antialias** do comparador de pixel: medida (Δ máx 14 em HTML byte a byte idêntico), corte em Δ > 16.
    Sem ela o portão reprovaria por ruído de recorte; com ela, **um** pixel forte ainda reprova.
20. **O filtro `ehCaminhoOuEndereco`** no diff de classes: 187 falsas "classes" eram trechos de caminho e URL.
21. **A varredura da regra de tinta acusava o próprio teste** (`cores.test.ts` **cita** as classes proibidas para
    testá-las). `*.test.ts(x)` saiu do escopo da varredura.

**22. O relógio do runner — a única mudança de configuração da fase, e a mais delicada de justificar.** Fechada a
frente G, a suíte foi rodada mais três vezes para conferir os números do relatório. Sem **nenhuma** mudança de código
entre elas, deu **0, 2, 5 e 1** reprovações — todas por `Test timed out in 5000ms`, cada vez em arquivos **diferentes**
(`url.test.ts`, `registry.test.ts`, `chaves-de-storage.test.ts` a 5.106 ms). Rodados isolados, os mesmos arquivos são
verdes em ~2 s. Saída das quatro em [`L-relogio-do-runner.txt`](f61-evidencias/L-relogio-do-runner.txt).

A causa não é da F61, mas a F61 a tornou visível: **51 arquivos** desta suíte varrem a árvore do repositório
(`readdirSync` recursivo, `coletarLiterais`, o compilador TypeScript) lendo centenas de fontes **dentro do corpo do
teste**. O custo deles não depende do que afirmam — depende de quantos arquivos o projeto tem e de quão ocupado está o
disco —, e a fase acrescentou 11 arquivos de teste ao mesmo paralelismo. Os 5 s padrão do Vitest foram feitos para teste
unitário de função, não para análise estática de árvore inteira.

**A escolha, e a alternativa recusada.** O remendo óbvio seria pendurar `60_000` em cada teste que estourasse — foi o que
tentei primeiro, em dois deles, e na rodada seguinte estourou um terceiro que não estava na lista. Pendurar em 51 testes,
um a um, até a próxima fase recomeçar a fila, é dívida disfarçada de conserto. A fase pôs **um** número em **um** lugar:
`testTimeout: 60_000` nos dois projetos de `vitest.config.mts`, com o comentário que conta a medição inteira. Os dois
remendos foram **revertidos** — `src/lib/ajuda/registry.test.ts` voltou byte a byte ao que era, e nenhum teste da F61
carrega relógio próprio.

**O que isso NÃO afrouxa.** Timeout não é asserção de ninguém: em nenhuma das quatro rodadas uma asserção falhou — a
contagem de reprovação bateu, todas as vezes, com a de timeout. O que o relógio pega (laço infinito, promessa que nunca
resolve) continua sendo pego, 55 s depois. A folga é ~3x o pior tempo já medido nesta mesa (a `sem-wapismo`, ~22 s
isolada), que **já carregava este mesmo `60_000`** no próprio teste desde 14/09: a config só promove a exceção dela a
regra da casa. É a única linha de configuração que a F61 muda, e é uma mudança de **relógio**, não de trava.

**O resultado.** Com o relógio novo, duas rodadas seguidas: **238 arquivos · 7.022 testes, zero reprovação e
zero timeout** nas duas. O verde deixou de ser sorteio — e é esse verde, não o das quatro rodadas anteriores, que o §9
registra.

**23. O portão de classes confundia a DATA da versão com uma classe.** Rodado sobre o HEAD já com a entrada `1.66.0` no
registry — isto é, **depois** do bump —, o portão (a) acusou uma diferença sem linha:
`src/lib/versoes/registry.ts × 1 "2026-09-17"`. É falso positivo, e nasceria em **toda** fase: toda fase acrescenta uma
versão ao registry, e toda versão tem uma data. A exclusão entrou ao lado das de caminho e URL, e é exata — o Tailwind
não tem classe com a forma `AAAA-MM-DD`. Provado que **não cegou o portão**: a sabotagem K1 (uma classe trocada à
revelia da tabela) continua acusando o arquivo e as duas classes. As duas saídas, verde e vermelha, estão em
[`G-diff-classes.txt`](f61-evidencias/G-diff-classes.txt).

---

# 5. A prova visual: as duas metades do portão

A promessa da fase é negativa — *"nada mudou fora desta tabela"* — e por isso precisa de **dois** portões que se fecham
um contra o outro. A tabela é a mesma nos dois: [`mudancas-de-proposito.json`](f61-evidencias/mudancas-de-proposito.json),
**242 linhas**, legível em [`.md`](f61-evidencias/mudancas-de-proposito.md). Por frente: **C** (a régua) 159 · **E** (as
correções) 52 · **D** (os pontos de injeção) 31. Por efeito: **150 com efeito visível**, 92 sem (troca de nome com o
mesmo valor).

### (a) O diff de classes — cobre TODO arquivo de `src/`

`npx tsx scripts/design/diff-classes-f61.ts` extrai, arquivo por arquivo, o **multiconjunto** de classes CSS do fonte em
`v1.65.0` e no HEAD, e cruza a diferença com a tabela:

```
ref: v1.65.0 · tabela: 242 linha(s) em docs/f61-evidencias/mudancas-de-proposito.json
✔ nenhuma diferença sem linha, nenhuma linha sem diferença.
```

Nos dois sentidos: diferença sem linha reprova (mudança não declarada) **e** linha sem diferença reprova (linha morta na
tabela). Um filtro (`ehCaminhoOuEndereco`) tira do escopo 187 falsas "classes" que eram trechos de caminho e URL.

### (b) O pixel — cobre as 8 vitrines

`node scripts/design/comparar-pixels-f61.mjs`, `antes/` × `depois/`, 103 quadros × 2 temas × 2 larguras:

| veredito | linhas | o que quer dizer |
|---|---:|---|
| **ok (zero)** | **176** | o gabarito diz "não muda" — e não mudou **um pixel** |
| informa (mudou, como esperado) | 208 | o gabarito diz "muda", e mudou. **Não audita** se a mudança é a que a tabela descreve — ver §12.9 |
| informa (não mudou) | 28 | o gabarito diz "muda", mas naquele tema/largura o efeito não aparece |
| informa (foto inteira) | 32 | as 8 páginas inteiras, só para olhar |
| **reprova** | **0** | — |

**O cromo inteiro deu zero** — `login`, `auth-confirmar`, `app-header`, `viewer-header`, `acesso-form`,
`marca-sobre-popover` e `nao-encontrado` —, nos dois temas e nas duas larguras: é a prova de que trocar
`text-white`/`text-black` pelos pares de tokens não repintou nada.

**Os dois quadros que mudam por um motivo que não é classe:** `cromo/rodape-sidebar` e `cromo/versoes-rodape` mostram o
NÚMERO da versão, que passou de `v1.65.0` para `v1.66.0` — o registry, não o CSS. A comparação feita **antes do bump**,
com os dois em zero, está em [`G-pixels-antes-do-bump.txt`](f61-evidencias/G-pixels-antes-do-bump.txt).

**A faixa de antialias, medida e não chutada.** O recorte de cada quadro sai da foto da página inteira; quando um quadro
acima muda de altura, o mesmo conteúdo é recortado com outro alinhamento sub-pixel. Medido em quadros cujo HTML
normalizado é **byte a byte idêntico**: de 1 a 64 pixels afetados, com Δ máximo **14** por canal. O comparador passou a
contar `pixelsForaDoAntialias` com corte em Δ > 16 e a imprimir as duas contagens. **Não é limiar de porcentagem: um
pixel forte reprova** — a sabotagem K2 provou isso, com 22 reprovações a partir da troca de UM token.

**Determinismo do instrumento.** Duas rodadas idênticas chegaram a diferir em 2 quadros. Corrigido com um fio de
rasterização (`--num-raster-threads=1`), fonte sem hinting e sem posicionamento sub-pixel, e o `autofocus` fora do
documento da foto. Conferido: **4 rodadas × 6 pares, zero diferenças**.

---

# 6. As onze sabotagens, com a saída real

Cada uma quebrou alguma coisa de propósito e exigiu que a trava acusasse **o culpado pelo nome**, não um erro genérico.

| # | o que foi quebrado | o que a trava disse | arquivo |
|---|---|---|---|
| **A** | nada (controle) — a régua sobre o código convertido | 982 casos verdes (983 depois do conserto 5 da revisão — §7) | [`A-regua-verde.txt`](f61-evidencias/A-regua-verde.txt) |
| **B1** | os dois diretórios devolvidos à isenção | a régua acusou os **45** arquivos, um a um, com a violação de cada | [`B-regua-vermelha.txt`](f61-evidencias/B-regua-vermelha.txt) |
| **B2** | a catraca: arquivo novo fora da régua · arquivo do piso devolvido à isenção · arquivo apagado | os dois primeiros reprovam nomeando; **o terceiro passa** — exclusão legítima não quebra a fase | [`B-catraca.txt`](f61-evidencias/B-catraca.txt) |
| **C** | a sigla, o nome e o autor injetados como literal em quem lê a fonte | reprovou os três, e passou para comentário de linha, de bloco e identificador (a varredura só enxerga **literal**) | [`C-literais.txt`](f61-evidencias/C-literais.txt) |
| **D** | o par cru do verde num selo sintético; `text-white`/`text-black` com variante; uma exceção que não casa com nada | reprovou os três — e deixou passar o callout âmbar legítimo e o véu verde translúcido | [`D-tinta.txt`](f61-evidencias/D-tinta.txt) |
| **E1** | `--brand-amarelo-texto` = `#b8b8b8` (cópia fora do repositório) | 1,09:1 contra o piso 4,5:1, **saída com código 1** | [`E-contraste-sabotado.txt`](f61-evidencias/E-contraste-sabotado.txt) |
| **E2** | o token escrito como `var(--foreground)` em vez do literal | `Error: cor desconhecida: "brand-dark-texto"` — a régua **estoura**, não ignora em silêncio | idem |
| **F** | uma caixa de confirmação sem os atributos (a mesa de antes); um arquivo fora de `layout/` importando a dica | as duas reprovaram | [`F-confirmacao.txt`](f61-evidencias/F-confirmacao.txt) |
| **G** | `useState` semeado de prop + `onOpenChange={setAberto}` | reprovou **duas vezes** (uma por regra); o mesmo diálogo com o hook passa; `x.marca` não é semeadura | [`G-dialogo-semeado.txt`](f61-evidencias/G-dialogo-semeado.txt) |
| **H** | o vazamento de filtro entre `/itens` e `/itens/historico`, **antes** da correção | vermelho, com a URL da outra tela na mensagem — depois, 14 verdes | [`H-vazamento-vermelho-antes.txt`](f61-evidencias/H-vazamento-vermelho-antes.txt) · [`verde`](f61-evidencias/H-vazamento-verde.txt) |
| **I** | `setItem` com literal `"wap:"`; a chave numa constante de módulo; a construtora guardada e passada por identificador | as três reprovaram (a segunda **sem chamada nenhuma**); a chamada no uso passa | [`I-storage.txt`](f61-evidencias/I-storage.txt) |
| **J** | o crédito desligado (`credito: null`) | nas duas variantes não sobra linha, separador nem link — só a versão | [`J-credito.txt`](f61-evidencias/J-credito.txt) |
| **K1** | uma classe trocada à revelia da tabela | o portão acusou **o arquivo e as duas classes** (a que saiu e a que entrou) | [`K1-diff-classes-sabotado.txt`](f61-evidencias/K1-diff-classes-sabotado.txt) |
| **K2** | um token de cor trocado no `globals.css` | **22 reprovações** de pixel, com o bbox de cada uma | [`K2-pixels-token-sabotado.txt`](f61-evidencias/K2-pixels-token-sabotado.txt) |

**A sabotagem K1 nasceu no-op** e está registrado: o roteiro mandava trocar uma classe que a conversão já tinha
eliminado. Refeita com uma classe **atual** do mesmo arquivo — e aí acusou.

---

# 7. A revisão adversarial — o que ela quebrou

Dois revisores frescos, sem contexto da execução, em paralelo e só-leitura: um atacando as **travas**, outro atacando a
**prova visual**. Ordem dada aos dois: tentar QUEBRAR, colar saída real, e dizer quando não conseguissem. A ata é a
entrada (i) de [`DECISOES.md`](DECISOES.md); a saída dos consertos está em
[`M-revisao-adversarial.txt`](f61-evidencias/M-revisao-adversarial.txt).

### O que eles confirmaram

Vale tanto quanto o que acharam. A régua **resistiu** aos três ataques de caminho — barra invertida do Windows
(`fontes()` normaliza o separador), subdiretório novo (`startsWith` pega qualquer profundidade) e prefixo mal-casado
(`conferirCatraca` compara os **dois** sentidos). O filtro `ehCaminhoOuEndereco` não descarta nenhuma classe legítima:
não há utilitário do Tailwind que comece com `src/`, `@/` ou `https:`, nem que termine em `.ts`/`.json`/`.css`. E a
recontagem independente dos **27 arquivos com linha sem vitrine**, feita do JSON bruto, bateu com o número do relatório.

### Cinco viraram conserto, cada um com sabotagem própria

| # | o furo | o conserto | a sabotagem que o prova |
|---|---|---|---|
| 1 | A confiança da chave de storage era por **NOME**: uma função LOCAL chamada `chaveDeStorage` — colisão de nome, erro comum — fazia toda `chave*` do arquivo virar confiável | o arquivo precisa **importar** a construtora de verdade | a homônima não compra confiança; a mesma função, num arquivo que importa, continua confiável |
| 2 | **A prop desestruturada DENTRO do corpo** (`function D(props) { const { filial } = props }`) deixava a trava da semeadura cega — e isso é TypeScript idiomático, não truque | o varredor junta também os nomes desestruturados do parâmetro no corpo | o esconderijo reprova duas vezes; desestruturar de um objeto QUALQUER continua **não** semeando |
| 3 | O portão de classes virava **"tabela vazia" em silêncio** quando o JSON do gabarito faltava — e o sintoma medido não era verde por engano, era **vermelho com 279 diferenças**, que se lê como "quase tudo mudou sem documentação" | estoura com a causa escrita | a mensagem nomeia o arquivo e diz "não foi commitado junto com o código" |
| 4 | **Template com interpolação era descartado em silêncio**: `` `flex ${cond ? 'gap-6' : 'gap-4'}` `` não passa em `ehStringDeClasse` por causa do `$`, e trocar o literal de dentro mudava pixel sem aparecer | registrado **opaco** — o portão não entende o template, mas vê qualquer edição nele | o portão segue verde nos 45; o padrão não existe neles, existe em `pendencias/`, que migra depois |
| 5 | **A porta pelo NOME**: o varredor pula `*.test.tsx`, então um arquivo de produção NOMEADO assim, importado por uma página, escaparia da régua inteira | código de produção **não importa de módulo `*.test`** | a régua foi de 982 para **983** casos |

### Cinco viraram declaração, não conserto

Estão no §12, itens **9 a 13**: o portão de pixel não audita a correspondência nos quadros que mudam; o portão de
classes não lê `globals.css`, e a faixa de antialias mascara troca de tom pequena; a comparação é agregada **por
arquivo**, então troca cruzada dentro do mesmo arquivo dá líquido zero; as travas são de texto e de nome, então literal
fragmentado (`'W' + 'AP'`) e acesso computado passam; e o gabarito é autoverificação, não auditoria independente.

**O critério da escolha, escrito.** O alvo destas travas é o **acidente e a deriva** — o arquivo novo que ninguém
converteu, a colisão de nome, a prop lida do jeito de sempre —, não o adversário decidido. Consertei o que era plausível
**por acidente**; declarei o que só cai para quem quer burlar. Perseguir o adversário decidido com casamento de texto é
corrida sem linha de chegada: quem quiser esse nível precisa de análise semântica de tipos, que é outro instrumento e
outra fase.

**Duas palavras saíram dos documentos** porque prometiam mais do que a trava entrega: *"reprova **sempre**"* na R-UI-61i
da matriz, e *"a linha da tabela **explica**"* na tabela de vereditos de pixel.

---

# 8. O censo das frases da empresa (o que a F70 vai encontrar)

Decisão iii do Johnny: **nome do sistema** entra na fonte; **frase da empresa** fica onde está, nomeada, para a F70. O
censo completo (réplica AST da `sem-wapismo`, só literal, `src/**` fora de teste) está em `PLAN-F61.md` §5.2. Em resumo:

- **Entrou na fonte (10 arquivos):** o chip da `Marca`, o `metadata` do `layout.tsx`, a 404, `/versoes`, `/ajuda`, o
  manual, o rodapé da sidebar, o cabeçalho do visualizador, `auth/confirm` e o crédito.
- **Fica → F70 (9 sítios):** `voce@wap.ind.br` no login, "É operador da WAP?" e "Peça à TI da WAP" na porta de senha,
  "defasados / posse WAP" nos KPIs, a legenda de reserva, dois placeholders `WAP-NB-1234`, o fornecedor `WAP` e o
  domínio de login (esse último é **regra de negócio**, não frase: F69/F70).
- **Fica, é nome interno:** os cabeçalhos HTTP `x-wap-*`, os keyframes `wap-barra-*`, os dois `CustomEvent`, o escopo
  `'wap'` de `lib/escopo/` (F62 tira o `ESCOPO_UNICO`).
- **Fora por decisão:** `lib/ajuda/conteudo/**` (18 ocorrências) → F71; `lib/versoes/registry.ts` (2) → **o histórico
  não se reescreve**.

---

# 9. A fronteira

A F61 é a **última fase de preparação**. O que as dezessete fases de F45 a F61 entregaram tem valor por si — e é por
isso que nenhuma delas é desperdício se o multiempresa nunca acontecer. O que elas deixaram pronto, para a virada:

| camada | o que existe hoje | quem usa na virada |
|---|---|---|
| **Banco** | escopo de escrita por filial, RLS com `papel_atual()`/`e_admin()`, imutabilidade por trigger, o lock das migrations, o injetor de mutações, os `rel_*_filiais` com recorte obrigatório | F62+ |
| **Dado** | `src/lib/escopo/` — `chaveDeStorage`, `pertencimento`, `ESCOPO_UNICO` como o único lugar que sabe que hoje só há uma empresa | **F62** tira o `ESCOPO_UNICO` |
| **Servidor** | a porta de RPC, `linhas.ts`, a memória por request com chave estável, o teto obrigatório de paginação | F63+ |
| **UI** | **esta fase**: a identidade por fonte única, a régua sem isenção nos dois diretórios de tenant, a chave de storage calculada no uso, o filtro por caminho, o diálogo semeado na abertura, o par de tokens da marca | **F70** (`contextoDoApp()`) |

**A fronteira foi alcançada em 17/09/2026, na versão `1.66.0`.** Da F62 em diante, cada fase acrescenta estrutura que
**só** o multiempresa usa — e aí a pergunta "vale a pena?" passa a ter resposta diferente. A linha está escrita no §6 do
[`PLANO-MULTIEMPRESA.md`](PLANO-MULTIEMPRESA.md).

---

# 10. Os 30 critérios, autoverificados

| # | critério | como foi conferido | ✅ |
|---|---|---|---|
| 1 | Nenhum arquivo de `components/admin/` ou `components/relatorios/` isento da régua | `DIRETORIOS_SEM_ISENCAO` + 983 casos verdes | ✅ |
| 2 | Os 45 arquivos convertidos pela escala do `PLANO-DESIGN-SYSTEM` | regra escrita uma vez (§3.1 do plano), 113 violações a zero | ✅ |
| 3 | A régua reprovaria a volta da isenção, nomeando os arquivos | sabotagem B1 — os 45 acusados um a um | ✅ |
| 4 | Catraca que vê arquivo novo | sabotagem B2, caso 1 | ✅ |
| 5 | Catraca que **não** reprova exclusão legítima | sabotagem B2, caso 3 — passa | ✅ |
| 6 | `PENDENTES` só encolhe, com motivo escrito | 32 → 30; motivo com 10+ caracteres é teste | ✅ |
| 7 | A válvula por arquivo existe e exige defeito medido + evidência | `DEVOLVIDOS_F61B` + `DEVOLVIDOS_F61B_CONGELADOS`; fechou **vazia** | ✅ |
| 8 | Sigla, nome e crédito de uma fonte só, com os valores de hoje | `identidadeDoSistema()`; `sem-literais.test.ts` prova os valores | ✅ |
| 9 | A fonte é pura (sem ambiente, sem banco, sem diretiva) | teste próprio | ✅ |
| 10 | Uma grafia só do nome do sistema | `Estoque TI WAP`; as duas linhas da mudança de aba na tabela | ✅ |
| 11 | Quem lê a fonte não escreve o literal | varredura AST, lista nominal com catraca; sabotagem C | ✅ |
| 12 | O crédito é desligável e some inteiro | sabotagem J, nas duas variantes | ✅ |
| 13 | `Marca` e cromo com par de tokens medido nos dois temas | 12 pares novos em `contraste.mjs`, verde | ✅ |
| 14 | O medidor de contraste **estoura** se o token não for literal | sabotagem E2 | ✅ |
| 15 | O verde virou token, com `<Badge variant="sucesso">` | `--sucesso`/`--sucesso-texto`; `badge.test.tsx` | ✅ |
| 16 | Regra de tinta com lista de exceções **nomeada** | `regra-de-tinta.ts`; a lista fechou vazia | ✅ |
| 17 | A regra de tinta reprova exceção morta | sabotagem D, caso 3 | ✅ |
| 18 | `TETO_PALETA_CRUA` no número medido | 473 → **413**, 61 → **53** arquivos | ✅ |
| 19 | As quatro confirmações por `ConfirmacaoDigitada` | `confirmacao-digitada-fronteira.test.ts`, sem exceção | ✅ |
| 20 | A confirmação da mesa de conflitos anuncia o erro | `aria-invalid`, `aria-describedby`, `role="alert"`; sabotagem F | ✅ |
| 21 | Diálogos semeiam na ABERTURA | `useDialogoSemeado`, 8 consumidores; sabotagem G | ✅ |
| 22 | Os filtros de URL compartilham um módulo | `src/components/filtros/url.ts`, os cinco | ✅ |
| 23 | O pendente de filtro é por caminho | sabotagem H, vermelha antes da correção | ✅ |
| 24 | As sete chaves `wap:*` por `chaveDeStorage` | `chaves-de-storage.test.ts`; sabotagem I | ✅ |
| 25 | As sete chaves **byte a byte** idênticas | `assinatura-realtime.test.ts`, as sete | ✅ |
| 26 | Nenhum número de tela mudou | nenhuma query, RPC ou cálculo tocado; suíte verde | ✅ |
| 27 | Nenhum pixel fora da tabela | portão (b): 176 quadros em zero, 0 reprovação | ✅ |
| 28 | Toda troca de classe tem dono | portão (a): nenhuma diferença sem linha, nenhuma linha sem diferença | ✅ |
| 29 | Prova visual antes × depois, com dados fictícios | `antes/` e `depois/`, 8 vitrines × 2 temas × 2 larguras | ✅ |
| 30 | Onze sabotagens com saída real | §6 — quatorze saídas, contando B1/B2, E1/E2 e K1/K2; mais cinco da revisão adversarial (§7) | ✅ |

**Fecho:** `npm run test` **238 arquivos · 7.027 testes** verdes · `npx tsc --noEmit` limpo · `npm run lint`
limpo · `npm run build` limpo · `npm run contraste` verde (167 pares).

---

# 11. O estado de repouso — se o projeto parar aqui por dois meses

- **Nada a aplicar.** Fase só de código: nenhuma migration pendente, nenhuma janela aberta, nenhum `drop` combinado.
- **Nada a limpar.** O instrumento de prova (`scripts/design/previa-f61.tsx` e os dois comparadores) é reexecutável e não
  toca banco nem sobe servidor; as evidências são arquivos versionados.
- **O que enferruja primeiro:** a tabela de mudanças de propósito é **relativa à `v1.65.0`**. Ela prova esta fase, e o
  portão (a) deixa de fazer sentido assim que a próxima fase mexer em classe — o que está certo: a tabela é o registro
  desta virada, não uma trava permanente. As travas permanentes são as outras onze.
- **O que continua valendo sozinho:** régua, catraca, regra de tinta, fronteira da dica, semeadura, filtro por caminho,
  chaves de storage e literais da identidade rodam no `npm run test` de todo dia, sem depender de ninguém lembrar.

---

# 12. O que este relatório NÃO prova

1. **Que a foto seja a tela de produção.** É a prévia estática: dublê de `Dialog`, `server-only` dublado, fonte
   `system-ui` no lugar da Geist, dados fictícios. Prova que o HTML e o CSS do app produzem aquele desenho — não que o
   app, com sessão e banco, o produza.
2. **Que o teste de componente prove interação.** O rig é **grau 1**: afirma o HTML que o servidor produz. Abrir e fechar
   um diálogo, digitar e ver a dica aparecer — isso não se prova por render.
3. **Que a regra de tinta julgue a cor renderizada.** Ela julga **nome de classe no fonte**. Uma cor escrita em style
   inline, ou montada em runtime, passa por ela (e não geraria CSS no Tailwind v4, que varre o fonte — mas a regra não é
   o que impede isso).
4. **Que a fonte única já seja por empresa.** É um ponto de injeção com valores **fixos** até a F70.
5. **Que a chave de storage separe empresas.** O prefixo é `wap` até a virada — a própria `chaveDeStorage` diz isso.
6. **Que o diff de classes cubra as telas fora das vitrines.** Ele cobre **todo** arquivo de `src/`; a prova de **pixel**
   é só das 8 vitrines. O que não tem vitrine está declarado linha a linha na tabela, com o motivo (rota `async` com
   sessão, estado que só existe depois de um POST, ramo que a prévia não monta) — são **27 arquivos**.
7. **Que o contraste do medidor esteja em conformidade.** Não está: 2,93:1 contra o piso de 3:1. Está **registrado** como
   o "antes" da fase, com nome, e não corrigido de propósito.
8. **Que o `EstadoVazio` tenha sido adotado.** Não foi — só a regra de escala foi aplicada aos cinco vazios.
9. **Que o portão de pixel audite a CORRESPONDÊNCIA nos quadros que mudam.** Para um quadro marcado "muda", o único
   critério é *algum* pixel diferente. Ele **não** confere que a região que mudou é a que a linha da tabela descreve,
   nem que a magnitude bate com o efeito alegado. Os **176 "zero"** são a parte que prova; os 208 "mudou, como
   esperado" são informação, não auditoria.
10. **Que o portão de classes veja mudança de VALOR de token.** Ele lê `.ts`/`.tsx` — nunca `globals.css`. Trocar o
    valor de um token sem tocar em nenhum nome de classe é invisível para ele; quem pega isso é o portão de pixel, e só
    se o efeito passar da faixa de antialias (Δ > 16 por canal). Uma troca **deliberadamente pequena** — um cinza um
    passo mais claro, Δ ≈ 6 — passaria pelos dois. A sabotagem K2 prova o caso forte (22 reprovações), não o sutil.
11. **Que o portão de classes veja troca CRUZADA dentro do mesmo arquivo.** Ele compara multiconjuntos agregados **por
    arquivo**, não por linha. Se dois elementos do mesmo arquivo trocarem de classe entre si, a contagem de cada valor
    fica idêntica e a diferença líquida é zero — nenhuma linha é exigida, embora os dois elementos tenham mudado. O
    modo `--esqueleto` pareia por linha, mas o **veredito** não usa esse pareamento.
12. **Que as travas resistam a quem quer burlá-las.** Elas são checagens de **texto e de nome**, não de tipo nem de
    símbolo resolvido. Quem escrever `'W' + 'AP'` no lugar de `'WAP'`, ou alcançar a dica por import de namespace com
    nome computado, passa. A revisão adversarial da fase encontrou esses caminhos e eles **não** foram fechados: o
    alvo destas travas é o **acidente e a deriva** — o arquivo novo que ninguém lembrou de converter, a colisão de
    nome, a prop lida do jeito de sempre —, não o adversário decidido. Os dois casos que eram **plausíveis por
    acidente** foram fechados e têm sabotagem própria: a construtora de chave homônima e a prop desestruturada dentro
    do corpo.
13. **Que o gabarito e a tabela sejam auditoria independente.** Quem escreveu o código, a tabela de mudanças e o
    veredito de cada quadro foi o mesmo processo. É autoverificação bem instrumentada — o modelo que o `CLAUDE.md`
    autoriza —, não conferência cega por terceiro. A revisão adversarial recontou, do JSON bruto, os **27 arquivos com
    linha sem vitrine** e bateu; não achou motivo vago nem sinal de gabarito ajustado ao resultado. Isso é uma amostra,
    não uma prova de ausência.

---

# 13. Pendências e backlog nomeado

| item | onde | dono |
|---|---|---|
| `ESCOPO_UNICO` sai; a chave de storage passa a carregar a empresa | `src/lib/escopo/` | **F62** |
| `contextoDoApp()` — a fonte única passa a ler a empresa; as frases da empresa (9 sítios) viram texto de tenant | `src/lib/identidade/sistema.ts`, `PLAN-F61.md` §5.2 | **F70** |
| A documentação do operador (`lib/ajuda/conteudo/**`, 18 ocorrências da sigla) | — | **F71** |
| As **rotas** de `(app)/admin/**` e `(app)/relatorios/**` (13 sem casco, 4 esqueletos) | `PENDENTES` | frentes **b**/**c** do sistema de design |
| Adoção do `EstadoVazio` nos 5 vazios de tabela do admin | — | PATCH |
| A barra de folga do medidor a 2,93:1 | `contraste.mjs` (`antes: true`) | PATCH |
| `PainelSucesso` rola na horizontal a 390 px | `movimentacoes/nova/painel-sucesso.tsx` | PATCH |
| Decomposição de `PassoMovimentacao`, `nova-compra-form`, `importar-wizard`, `grupos-erros` | — | backlog (fora do escopo por ordem) |
| `scripts/design/capturar.mjs` aponta para o ensaio | — | backlog (fora do escopo por ordem) |
| Portão de classes: comparar por LINHA, não agregado por arquivo (fecha a troca cruzada — §12.11) | `scripts/design/diff-classes-f61.ts` | backlog do instrumento |
| Portão de classes: ler `globals.css` (hoje só `.ts`/`.tsx` — §12.10) | idem | backlog do instrumento |
| Portão de pixel: conferir que a região que mudou bate com a linha da tabela (§12.9) | `comparar-pixels-f61.mjs` | backlog do instrumento |
| **Não há F61B.** A válvula fechou vazia | `DEVOLVIDOS_F61B` | — |
