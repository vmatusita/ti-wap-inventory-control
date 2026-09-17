# PLAN-F61 — Os pontos de injeção da UI

> Fase **F61** do [`PLANO-MULTIEMPRESA.md`](PLANO-MULTIEMPRESA.md) (§5, Bloco D) — a **última fase de
> preparação**. Ordem de serviço: [`prompts/F61-pontos-de-injecao-da-ui-ultracode.md`](prompts/F61-pontos-de-injecao-da-ui-ultracode.md).
> Versão da fase: **`1.66.0`** (fase = MINOR, regra 8). Fase **só de código**: nenhuma migration, nenhum banco.
> Branch `f61-pontos-de-injecao-da-ui`, a partir de `4cf8016` (tag `v1.65.0`).
>
> Este plano foi escrito **antes** do primeiro commit que toca `src/` (a única exceção é o commit do instrumento
> em `scripts/design/`), e o "antes" da prova visual entrou nele antes do primeiro commit que muda uma classe.
> As seções marcadas **(cresce)** são atualizadas durante a execução.

---

## 0. Onde a fase começa — a linha de base medida (17/09/2026)

| medida | valor | como |
|---|---|---|
| `main` / tag | `4cf8016` = `v1.65.0` | `git tag --points-at 4cf8016` |
| `package.json` | `1.65.0` | leitura |
| migrations | 144 arquivos, última `0145_drop_rel_filial.sql` | `ls supabase/migrations` |
| `npm run test` | **228 arquivos, 6.432 testes**, verde (249,9 s) | saída real |
| `npx tsc --noEmit` · `npm run lint` | limpos | saída real |
| `npm run contraste` | verde; **157 pares** declarados em `PARES`, 158 linhas de veredito | saída real + contagem do array |
| régua (`consistencia.test.ts`) | `PENDENTES` = **32** entradas (15 prefixos + 17 arquivos); `SOB_REGRA` = **77** de 251 fontes | réplica do código do teste |
| catraca da paleta (`cores.test.ts`) | `TETO_PALETA_CRUA` = **473**, `ARQUIVOS_COM_PALETA` = **61** (recontado: 473 em 61) | réplica da regex do teste |
| superfície do visualizador (`confinamento-viewer.test.ts`) | fecho = **155** arquivos; `SUPERFICIE_MINIMA` = **125** (folga real 30) | réplica do fecho |
| `.test.tsx` (rig grau 1) | **5** | `find src -name "*.test.tsx"` |
| Chromium do Playwright | sobe nesta máquina (prévia F43 rodada: 1 PNG em 18 s) | execução real |

---

## 1. Os 28 fatos, remedidos contra o disco de hoje

Seis leitores paralelos remediram cada fato **pelo código dos próprios testes** (réplica fora do repositório),
nunca por grep à mão onde havia teste. Onde a medição diverge do texto da ordem, **a medição ganha** e a
divergência está marcada.

| # | o que a ordem diz | medido hoje | veredito |
|---:|---|---|---|
| 1 | `main` em `4cf8016`, tag `v1.65.0`, 144 migrations (última `0145`), 228 arquivos / 6.432 testes | idem | confere |
| 2 | `PENDENTES` 32 entradas (15+17), teste de prefixo em `:132`, `SOB_REGRA` em `:161` sem catraca | idem (`:132`, `:161`) | confere |
| 3 | 45 de 77 reprovam, 113 violações; admin 35/21/58 (moldura 41 em 19, escala 15 em 9, largura 1, px 1); relatórios 42/24/55 (px 24 em 14, escala 18 em 9, moldura 11 em 10, largura 2); wizard + grupos-erros = 26 | idem em todos os subtotais (16 + 10 = 26); por regra: R2 = 3 · R3/4 = 33 · R5 = 25 · R6 = 52 · R1/R4b/R7/R8 = 0 | confere |
| 4 | a conversão já está decidida no `PLANO-DESIGN-SYSTEM` e muda pixel; `QuadroDeTabela` = `Card` com `border bg-transparent py-0 ring-0`; `Aviso` sem intenção de sucesso (`aviso.tsx:52`); 3 larguras de célula | idem (`quadro-de-tabela.tsx:45`; `aviso.tsx:52`; `tabela-erros:30`, `tabela-itens-grupo:142`, `lista-manutencao:17`) | confere |
| 5 | rotas `(app)/admin` e `(app)/relatorios`: "12 arquivos, 13 rotas sem casco, 3 esqueletos" | **18 `.tsx`** (13 `page.tsx`, **4 `loading.tsx`**, 1 `layout.tsx`) | ⚠ **diverge** no número de arquivos e de esqueletos; 13 rotas confere. Não muda o escopo: as rotas ficam em `PENDENTES` |
| 6 | a catraca "`SOB_REGRA.length` só cresce" tem dois furos | confirmado por leitura (apagar arquivo = falso vermelho; arquivo novo em prefixo isento passa calado) | confere |
| 7 | `Marca`: `label='Estoque TI'`, chip em `:23`, `WAP` em `:27`; 8 chamadas em 7 arquivos; `casco-de-autenticacao` sem consumidor | idem | confere |
| 8 | `text-white` 18 (5 `hover:`, 1 comentário) + 8 `/NN`; `bg-brand-dark` em 7 arquivos + `viewer-nav` = 8; `text-black` sobre amarelo em 5; `MARCADORES_LOGIN` em `smoke-prod.mjs:186` | idem | confere |
| 9 | duas grafias, seis endereços; nenhum teste confere título | idem. **Medido a mais:** 33 `page.tsx`; 31 têm título próprio (29 `metadata` + 2 `generateMetadata`; `/login` herda `title: 'Entrar'` de `login/layout.tsx`); **só `/auth/confirm` e `/auth/definir-senha` mostram o `default`** ("Estoque TI · WAP") | confere |
| 10 | 44 literais WAP em 30 arquivos (63 em 41 com as allowlists) | **44 em 30; 63 em 41** (réplica AST da `sem-wapismo`) | confere |
| 11 | crédito: 4 chamadas (uma morta), a da sidebar renderizada duas vezes | idem (`login:115`, `rodape-sidebar:75`, `versoes:117`, `casco-de-autenticacao:80`) | confere |
| 12 | sem configuração de instância; `ESCOPO_UNICO` em `pertencimento.ts:36-48` "não é uma configuração"; consumidores majoritariamente Client | idem (`login/page.tsx:1` é `'use client'`) | confere |
| 13 | `contraste.mjs` mede por nome, só valor literal; pares em `:342`, `:343`, `:346-350` | idem; `PARES` tem 157 entradas | confere |
| 14 | 473 em 61; âmbar 293 · verde 84 · vermelho 50; admin + relatórios = 112 | idem (112 = **componentes** `admin/` 46 + `relatorios/` 66; pelas rotas daria 145) | confere |
| 15 | 12 sítios do verde, 46 ocorrências, zeram 7 arquivos (473 → 427, 61 → 54); tokens idênticos à paleta v4 | idem, byte a byte (oklch de `green-100/800/950/300` = `--selo-em-estoque*`) | confere |
| 16 | resto do verde: 31 linhas, 94 ocorrências, 23 arquivos no total; `legendas.ts:52` usa `dark:green-900` | idem (o "no total" inclui os 12; fora deles: 19 linhas, 48 ocorrências, 13 arquivos) | confere |
| 17 | `badge.tsx`: `warning` em `:17-18` (ata `DECISOES.md:801`), sem `sucesso`; o molde `warning` repinta | idem; os 7 selos NÃO passam `variant` (usam o `default` sobrescrito por classe) | confere |
| 18 | `medidor-minimo.tsx` tem duas linhas verdes (`:22`, `:27`); `--grafico-em-estoque` ≠ `green-600` | idem | confere |
| 19 | regra derivada do CSS: 36 tons, 204 usos proibidos, 136 âmbar | idem (36 / 204 / 136; grep cru de âmbar 301) | confere |
| 20 | `confirmacao-digitada.tsx` 87 linhas, zero consumidores, sem `mono`/`spellCheck`, comentário falso em `:28-30` | idem; o comentário ocupa `:27-32` | confere (±1 linha) |
| 21 | a tabela das 4 confirmações; `dicaConfirmacaoNaoConfere` importada por 3 fora de `layout/` | idem, integral (ver §8) | confere |
| 22 | 26 diálogos; defeito em filial, kit, motivo, gerar-relatório; item re-semeia incompleto; tipo-item e colaborador semeiam certo | 25 casam `*-dialog.tsx` + `dev/destrutivo/dialogo-destrutivo.tsx` = 26; resto idem | confere |
| 23 | só `ativos-filtros` e `pendencias-filtros` perdem o fix; `lista-filtros` tem cópia em `useRef`; vazamento latente `/itens` → `/itens/historico` | idem; o vazamento está reconstruído passo a passo em §10 | confere |
| 24 | 7 chaves `wap:*`, só `wap:compra:defaults` é `localStorage`; o teste de assinatura esquece `itens:conferencia` | idem; 20 chamadas `getItem/setItem/removeItem` fora de teste | confere |
| 25 | fecho 155, mínimo 125, comentário da folga caducou | idem; `layout/` no fecho: `aviso`, `filtro-filial`, `link-ajuda`, `marca`, `nav-rolavel`, `progresso-navegacao`, `viewer-header`, `viewer-nav` | confere |
| 26 | `capturar.mjs` fotografaria dado real do ensaio; o caminho é a prévia estática | confirmado por leitura de `capturar.mjs` (nunca executado) e do `INVENTARIO-CREDENCIAIS.md` §2 — o `.env.local` **não foi aberto** | confere |
| 27 | rig grau 1 (`renderToStaticMarkup`, `node`), 5 `.test.tsx`; `Dialog` não renderiza no rig | idem (o Portal do Radix só monta em `useLayoutEffect`) | confere |
| 28 | regras 1, 2, 3, 6, 7, 8 pesam | — | — |

**Divergências contra a ficha F61** (§5 do plano, escrita em 04/09 sobre a v1.49.1) — as quinze já declaradas na
ordem mais a do fato 5: a isenção está em `:132`, não `:130`; 45 arquivos e 113 violações, não 44 e 109; o cromo
escuro são oito arquivos; o crédito tem quatro chamadas; o `sucesso` no molde do `warning` repintaria;
`medidor-minimo` tem duas linhas; o selo âmbar já existe e a regra derivada do CSS proibiria 204 usos; a trava da
dica reprovaria hoje; a mesa não é o único lugar fora de `/dev` que apaga cadastro de ativo; os diálogos de CRUD
são seis, quatro com defeito, mais o de relatórios; só dois filtros perdem o fix; a lição de `checklist-lote.ts`
é a fronteira `'use client'`; só uma das sete chaves é `localStorage`; a superfície tem 155 arquivos; as fotos não
podem vir de `capturar.mjs`. **Mais uma, medida agora:** as rotas de admin + relatórios são 18 `.tsx` com 4
esqueletos (o texto da ordem diz 12 e 3).

---

## 2. As decisões

### 2.1 As três decisões do Johnny (17/09/2026)

1. **Converter os 45 arquivos agora**, pela escala do `PLANO-DESIGN-SYSTEM`, com as mudanças listadas e
   fotografadas. Sem F61B planejada — só a válvula por arquivo, com medição.
2. **As quatro confirmações digitadas passam por `ConfirmacaoDigitada`**; a trava da dica nasce sem exceção.
3. **O nome do SISTEMA entra no ponto de injeção, com uma grafia; as frases da EMPRESA ficam**, listadas para a F70.

### 2.2 As doze decisões desta fase

**D1 · A fonte única.** Mora em **`src/lib/identidade/sistema.ts`**, módulo **puro** (sem `'use client'`, sem
`server-only`, sem `process.env`, sem banco), no molde de `lib/escopo/chave.ts`: quem consome chama a FUNÇÃO
`identidadeDoSistema()`, que devolve `{ sigla: 'WAP', nome: 'Estoque TI', nomeCompleto: 'Estoque TI WAP',
descricao: 'Controle de ativos de TI da WAP', credito: { autor: 'vmatusita', site: 'https://www.vmatusita.com.br' } | null }`
— os valores de HOJE. Como função e não como constante: o call-site não muda quando a resposta deixar de ser fixa.
Chega ao Client Component por **import direto** (é valor comum de módulo sem diretiva, o que a
`fronteira-rsc.test.ts` permite). **Não reusa** `ESCOPO_UNICO` (escopo de DADO, sai na F62) nem `chaveDoEscopo`
(prefixo de canal e de storage): isto é identidade EXIBIDA. **Como a F70 a troca:** o `contextoDoApp()` por request
resolve a empresa no servidor e desce a identidade por prop até a `Marca`, o metadata (`generateMetadata`) e o
crédito; `identidadeDoSistema()` vira o valor-padrão de instância ou some. O cabeçalho do módulo diz isso e diz que
**ele não é autorização**.

**D2 · Os tokens da marca e do cromo.** O fundo continua o token que já existe (`bg-brand-dark`,
`bg-brand-amarelo` — e por isso o marcador do smoke não muda); o par nasce **do lado do texto**:
`--brand-dark-texto: #ffffff` e `--brand-amarelo-texto: #000000`, declarados com valor LITERAL em `:root` **e**
em `.dark` (o cromo não acompanha o tema, e o `contraste.mjs` só lê literal), com apelidos `--color-*` no
`@theme inline`. Troca nos **oito** arquivos do cromo (`app-header`, `viewer-header`, `viewer-nav`, `login/page`,
`auth/confirm/page`, `auth/definir-senha/page`, `relatorios/acesso-form`, `casco-de-autenticacao`):
`text-white` → `text-brand-dark-texto`, com os `hover:` e os `/70`/`/80`/`/15` (a compilação real mostra a mesma
fórmula `color-mix(in oklab, <cor> NN%, transparent)` para `white` e para o token = `#ffffff`). Os **cinco**
`text-black` sobre o amarelo — o chip da `Marca`, o botão "Nova movimentação", as iniciais do avatar, o botão
"Gerar relatório" e o passo atual do wizard de import — têm o MESMO significado (texto legível sobre a superfície
amarela da marca) e viram `text-brand-amarelo-texto`. `scripts/contraste.mjs` passa a nomear os pares novos no
MESMO commit. Zero pixel, provado pela comparação de pixel.

**D3 · O nome do sistema.** Grafia única: **`Estoque TI WAP`** (nome + sigla, sem ponto) — é a que 31 das 33 rotas
já mostram na aba pelo `template`, a da 404, a de `/versoes` e a de `/ajuda`. Endereços que passam a ler a fonte:
`layout.tsx` (`default` = `nomeCompleto`, `template` = `%s · ${nomeCompleto}`, `description` = `descricao`), a 404
(`Página não encontrada · ${nomeCompleto}`), `/versoes` (description e o texto do rodapé), `/ajuda` (description),
`auth/confirm` (`Acesso ao ${nome}`), o `label` padrão da `Marca` e o rótulo `${nome} · Relatórios` do
`viewer-header`. **O que muda na aba:** só as duas rotas sem título próprio (`/auth/confirm`,
`/auth/definir-senha`) passam de "Estoque TI · WAP" para "Estoque TI WAP". Nenhum rótulo que a ajuda cita muda
(`Estoque TI · Relatórios` continua exatamente este texto — `comecar.test.ts` o confere).

**D4 · A régua.** A conversão por classe está escrita UMA vez em §3.1; a catraca, em §3.3; os motivos por entrada
de `PENDENTES`, em §3.4. `acesso-form.tsx` (porta, frente d) entra na régua com o prefixo e é convertido como os
outros.

**D5 · A válvula.** `DEVOLVIDOS_F61B` nasce vazia e só recebe arquivo com defeito MEDIDO (rolagem horizontal a
390 px, texto truncado que perde sentido, tabela que quebra no relatório gerado) e o caminho da evidência. **(cresce)**
— hoje: não usada.

**D6 · O verde.** Um par novo por SIGNIFICADO, com os valores da paleta que o verde já tem:
`--sucesso`/`--sucesso-texto` (claro `green-100`/`green-800`, escuro `green-950`/`green-300`) = o verde de "deu
certo / está valendo": o selo "Ativo/Ativa" de cadastro, os três círculos de operação concluída, a pílula "voltou
em…" e a legenda que a espelha. **Mesmos valores de `--selo-em-estoque`, nome distinto** — "em estoque" é status
de ativo, não sucesso. `<Badge variant="sucesso">` = `bg-sucesso text-sucesso-texto` **sem opacidade** (o molde
do `warning`, um token com `/10`, repintaria — fato 17), com ata no molde da F7F. `medidor-minimo.tsx`: FOLGA ≠
sucesso → `--medidor-folga` (trilho, `green-100`/`green-950`) e `--medidor-folga-barra` (preenchimento,
`green-600`/`green-500`). As duas caixas verdes do import e do teste de senha viram `<Aviso intencao="sucesso">`,
intenção nova do `Aviso` (`role="status"`), com as cores do par `sucesso`. Destino de cada linha do resto: §7.

**D7 · A regra de tinta.** Proíbe em `src/` (fora de teste): `(bg|text|border|ring|fill|stroke)-green-(100|800|950|300)`
**sem** modificador de opacidade (o par que duplica `--sucesso`), e `text-white`/`text-black` (o par que duplica
os textos de marca), em qualquer variante (`dark:`, `hover:`, `/NN`). Lista de exceções NOMEADA
(`{arquivo, trecho, motivo}`), que só encolhe e reprova exceção que não casa com nada. **Nunca derivada dos
comentários do CSS** (fato 19). `TETO_PALETA_CRUA`/`ARQUIVOS_COM_PALETA` descem no commit de cada lote e fecham no
número medido. **(cresce)**

**D8 · A confirmação.** `ConfirmacaoDigitada` ganha `mono?` (o texto esperado em fonte mono),
`exibirEsperado?` (padrão `true`; o import mostra o texto dentro do rótulo), `aviso?` (substitui a linha do
esperado — o apagar conta sem e-mail) e `spellCheck={false}` fixo. A régua de igualdade continua FORA do componente
(`confere` por prop). Comportamento de cada uma antes × depois em §8.

**D9 · `useDialogoSemeado`.** `src/components/dialogos/use-dialogo-semeado.ts` (hook de cliente mora em
`components/`, não em `lib/`): `useDialogoSemeado(semear: () => void)` → `{ aberto, mudarAberto }`, que chama
`semear()` **na abertura** (transição fechado → aberto), lendo as props daquele render. A regra é a função pura
`deveSemear(estavaAberto, vaiAbrir)`. Consumidores e exceções em §9; trava estática `dialogo-semeado.test.ts`.

**D10 · Os filtros.** `src/components/filtros/url.ts` (`'use client'`, estado de módulo documentado como
compartilhado): o `pendente` passa a ser **por caminho** (`Map<caminho, …>`), e a API recebe o `pathname`.
`itens-filtros` e `historico-filtros` migram; `ativos-filtros` e `pendencias-filtros` ganham o fix;
`movimentacoes/lista-filtros` troca a cópia em `useRef` pelo módulo. O teste do vazamento nasce VERMELHO contra o
`url-filtros.ts` de hoje. Os outros montadores ficam (§10).

**D11 · O storage.** As sete chaves `wap:*` passam a sair de funções que chamam `chaveDeStorage(…)` NO USO (nada
de constante de módulo congelando o valor, `chave.ts:37-40`), idênticas byte a byte.
`assinatura-realtime.test.ts` afirma as sete. Trava: nenhum literal/template começando com `wap:` em `src/` de
produção fora de `lib/escopo/chave.ts` (exceto os dois nomes de `CustomEvent`), e nenhuma chamada
`localStorage`/`sessionStorage` com chave que não saia de uma função que devolve `chaveDeStorage(…)` ou da lista de
exceções (`wap-sidebar`, `theme`). §11.

**D12 · A prova visual.** Prévia estática `scripts/design/previa-f61.tsx` (componentes REAIS, dados fictícios, CSS do
`globals.css`, Playwright 1440×900 e 390×844, claro e escuro), com dublê de `@/components/ui/dialog` só no
`tsconfig.previa-f61.json`; HTML normalizado por vitrine; portão em três partes (diff de classes × tabela; pixel
por quadro; "sem vitrine" declarado). §12.

---

## 3. A régua

### 3.1 A regra de conversão — escrita uma vez

| código | o que a régua pega | conversão | muda pixel? |
|---|---|---|---|
| **T1** | `text-[10px]` · `text-[11px]` · `text-[13px]` | `text-xs` (12 px) — `PLANO-DESIGN-SYSTEM` §3.4 | sim: 10/11 → 12 cresce; 13 → 12 encolhe |
| **E1** | passo de espaçamento fora de {0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16} | **o passo da escala mais próximo; no empate, o de CIMA** — o precedente escrito do plano (§3.1: `space-y-5` sobe para 24 px). `2.5`→`3`, `3.5`→`4`, `5`→`6`, `7`→`8`, `9`→`8`, `10`→`12`. Um critério, nenhum caso a caso | sim, ±2 a ±8 px |
| **E2** | passo sem vizinho acima (`pr-32`, 128 px) | não arredonda: a reserva de espaço vira layout de classe (decisão no arquivo, §3.2) | sim |
| **L1** | `w-[Npx]` · `max-w-[Npx]` de campo | o degrau da escala de largura CONVENCIONAL mais próximo (a que a mensagem da regra 5 cita: `w-36`, `w-40`… `w-56`, `w-64`), **não** o passo dinâmico do v4 (`w-65` reescreveria o mesmo pixel escolhido no braço): `260` → `w-64` (256), `220` → `w-56` (224) | sim, ±4 px |
| **L2** | `max-w-*` de célula/coluna (regra 2: só xs/sm/md/full/none/fit/min/max) | a MESMA medida como largura da coluna (`max-w-40` → `w-40`; `max-w-[220px]` → `w-56`); porcentagem → fração da escala (`max-w-[45%]` → `w-2/5`) — com o truncamento mantido | sim (a coluna deixa de encolher até o conteúdo) |
| **M1** | moldura de TABELA ou lista de linhas (`overflow-* rounded-* border`, `divide-y rounded-* border`) | `<QuadroDeTabela>` — existe para não repintar: só o raio muda | sim: raio 6/8 → 12 px |
| **M2** | caixa de AVISO (tinta `destructive`, `warning`, `amber`, `green`) | `<Aviso intencao="erro·atencao·sucesso·informacao">` — a intenção pela tinta; o conteúdo com mais de um bloco ganha um `div` com o ritmo que a caixa tinha | sim: raio → 12, `p-4` → `p-3`, véu/âmbar cru → token da intenção; ganha `role` |
| **M3** | VALOR em linha (código, senha, link copiável, slug) e PASTILHA (apelido) | valor: a BORDA sai e fica o preenchimento `bg-muted/40` com o raio (não é agrupamento, é um campo somente-leitura); pastilha: `rounded-full` (a geometria que a régua já reconhece como pastilha) | sim: some o traço / cantos redondos |
| **M4** | AGRUPAMENTO neutro (seção, grade de opções, cartão de caso) | `<Card>` (`size="sm"` quando o respiro é `p-3`), com o `space-y-N` virando `gap-N` (o `Card` é `flex-col`) | sim: raio → 12, traço `border` → `ring-1`, fundo `bg-card` |

O **exemplo para não confundir M2 com M4**: a caixa é M2 se ela carrega tinta de intenção; sem tinta, é M4 — a
caixa neutra `bg-muted/*` com uma frase de orientação é `Aviso intencao="informacao"` (o `Aviso` informação já é
`bg-muted/50`), e a com um formulário/opções é `Card`.

### 3.2 As 113 violações × a conversão prevista

(Gerada da réplica do teste — `regua-violacoes.json`. "Prevista" = aplicação mecânica de §3.1; o que a execução
decidir diferente vai para a tabela de mudanças de propósito com o motivo.)

| # | arquivo:linha | regra | hoje | conversão prevista | categoria |
|---:|---|---|---|---|---|
| 1 | `admin/colaboradores-tabela.tsx:110` | R3/4 | `py-10` | `py-12` | E1 · escala (vizinho mais próximo; empate sobe) |
| 2 | `admin/colaboradores-tabela.tsx:116` | R6 | `overflow-hidden rounded-lg border` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |
| 3 | `admin/convidar-usuario-dialog.tsx:165` | R6 | `flex items-center gap-2 rounded-md border bg-muted/40 p-3` | sem borda (preenchimento) | M3 · valor copiável |
| 4 | `admin/criar-senha-dialog.tsx:140` | R6 | `block break-all rounded-md border bg-muted/40 p-3 font-mono text-xs` | sem borda (preenchimento) ou `rounded-full` | M3 · valor/pastilha |
| 5 | `admin/criar-senha-dialog.tsx:148` | R6 | `flex items-center gap-2 rounded-md border bg-muted/40 p-3` | sem borda (preenchimento) | M3 · valor copiável |
| 6 | `admin/fila-consolidacao.tsx:177` | R3/4 | `py-10` | `py-12` | E1 · escala (vizinho mais próximo; empate sobe) |
| 7 | `admin/fila-consolidacao.tsx:208` | R6 | `overflow-hidden rounded-lg border` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |
| 8 | `admin/fila-consolidacao.tsx:280` | R6 | `rounded-lg border p-3` | `<Card>` (`size="sm"` se p-3) | M4 · agrupamento |
| 9 | `admin/filial-apelidos.tsx:70` | R6 | `rounded-md border bg-muted/50 px-2 py-1 text-sm` | sem borda (preenchimento) ou `rounded-full` | M3 · valor/pastilha |
| 10 | `admin/filial-apelidos.tsx:76` | R6 | `flex items-center gap-1 rounded-md border px-2 py-1 text-sm` | sem borda (preenchimento) ou `rounded-full` | M3 · valor/pastilha |
| 11 | `admin/filial-dialog.tsx:252` | R6 | `rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive` | `<Aviso intencao="erro">` | M2 · aviso |
| 12 | `admin/importar/correcoes-aplicadas.tsx:39` | R6 | `divide-y rounded-lg border` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |
| 13 | `admin/importar/correcoes-aplicadas.tsx:45` | R3/4 | `p-2.5` | `p-3` | E1 · escala (vizinho mais próximo; empate sobe) |
| 14 | `admin/importar/grupos-erros.tsx:91` | R6 | `overflow-x-auto rounded-md border` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |
| 15 | `admin/importar/grupos-erros.tsx:152` | R6 | `space-y-3 rounded-lg border p-4` | `<Card>` (`size="sm"` se p-3) | M4 · agrupamento |
| 16 | `admin/importar/grupos-erros.tsx:522` | R3/4 | `p-2.5` | `p-3` | E1 · escala (vizinho mais próximo; empate sobe) |
| 17 | `admin/importar/grupos-erros.tsx:522` | R6 | `flex flex-wrap items-center gap-2 rounded-md border p-2.5` | `<Card>` (`size="sm"` se p-3) | M4 · agrupamento |
| 18 | `admin/importar/grupos-erros.tsx:712` | R6 | `space-y-2 rounded-md border p-3` | `<Card>` (`size="sm"` se p-3) | M4 · agrupamento |
| 19 | `admin/importar/grupos-erros.tsx:917` | R3/4 | `p-2.5` | `p-3` | E1 · escala (vizinho mais próximo; empate sobe) |
| 20 | `admin/importar/grupos-erros.tsx:917` | R6 | `flex flex-wrap items-center gap-2 rounded-md border p-2.5` | `<Card>` (`size="sm"` se p-3) | M4 · agrupamento |
| 21 | `admin/importar/grupos-erros.tsx:970` | R3/4 | `p-2.5` | `p-3` | E1 · escala (vizinho mais próximo; empate sobe) |
| 22 | `admin/importar/grupos-erros.tsx:970` | R6 | `flex flex-wrap items-center gap-2 rounded-md border p-2.5` | `<Card>` (`size="sm"` se p-3) | M4 · agrupamento |
| 23 | `admin/importar/grupos-erros.tsx:1081` | R6 | `flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3` | `<Card>` (`size="sm"` se p-3) | M4 · agrupamento |
| 24 | `admin/importar/importar-wizard.tsx:96` | R6 | `rounded-lg border p-4` | `<Card>` (`size="sm"` se p-3) | M4 · agrupamento |
| 25 | `admin/importar/importar-wizard.tsx:130` | R6 | `space-y-2 rounded-lg border bg-muted/30 p-4` | `<Card>` (`size="sm"` se p-3) | M4 · agrupamento |
| 26 | `admin/importar/importar-wizard.tsx:143` | R6 | `overflow-x-auto rounded-md border bg-background` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |
| 27 | `admin/importar/importar-wizard.tsx:509` | R3/4 | `space-y-5` | `space-y-6` | E1 · escala (vizinho mais próximo; empate sobe) |
| 28 | `admin/importar/importar-wizard.tsx:529` | R6 | `rounded-lg border bg-muted/30 p-4` | `<Card>` (`size="sm"` se p-3) | M4 · agrupamento |
| 29 | `admin/importar/importar-wizard.tsx:615` | R3/4 | `space-y-5` | `space-y-6` | E1 · escala (vizinho mais próximo; empate sobe) |
| 30 | `admin/importar/importar-wizard.tsx:667` | R6 | `rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning` | `<Aviso intencao="atencao">` | M2 · aviso |
| 31 | `admin/importar/importar-wizard.tsx:679` | R6 | `rounded-lg border border-green-600/40 bg-green-50 p-4 dark:border-green-400/30 dark:bg-green-950/30` | `<Aviso intencao="sucesso">` | M2 · aviso (intenção nova) |
| 32 | `admin/importar/importar-wizard.tsx:784` | R6 | `rounded-lg border border-destructive/40 bg-destructive/5 p-4` | `<Aviso intencao="erro">` | M2 · aviso |
| 33 | `admin/importar/importar-wizard.tsx:804` | R6 | `rounded-lg border divide-y text-sm` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |
| 34 | `admin/importar/importar-wizard.tsx:806` | R3/4 | `p-2.5` | `p-3` | E1 · escala (vizinho mais próximo; empate sobe) |
| 35 | `admin/importar/importar-wizard.tsx:884` | R3/4 | `space-y-5` | `space-y-6` | E1 · escala (vizinho mais próximo; empate sobe) |
| 36 | `admin/importar/importar-wizard.tsx:930` | R6 | `rounded-lg border border-destructive/50 bg-destructive/5 p-4` | `<Aviso intencao="erro">` | M2 · aviso |
| 37 | `admin/importar/importar-wizard.tsx:1055` | R3/4 | `space-y-5` | `space-y-6` | E1 · escala (vizinho mais próximo; empate sobe) |
| 38 | `admin/importar/importar-wizard.tsx:1112` | R6 | `rounded-lg border border-warning/40 bg-warning/5 p-4` | `<Aviso intencao="atencao">` | M2 · aviso |
| 39 | `admin/importar/importar-wizard.tsx:1134` | R6 | `rounded-lg border border-warning/40 bg-warning/5 p-4` | `<Aviso intencao="atencao">` | M2 · aviso |
| 40 | `admin/importar/tabela-erros.tsx:15` | R6 | `overflow-x-auto rounded-lg border` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |
| 41 | `admin/importar/tabela-erros.tsx:30` | R2 | `max-w-40` | ver L2 | L2 · teto de célula |
| 42 | `admin/itens-tabela.tsx:78` | R3/4 | `py-10` | `py-12` | E1 · escala (vizinho mais próximo; empate sobe) |
| 43 | `admin/itens-tabela.tsx:84` | R6 | `overflow-hidden rounded-lg border` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |
| 44 | `admin/kit-dialog.tsx:307` | R6 | `grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-3` | `<Card>` (`size="sm"` se p-3) | M4 · agrupamento |
| 45 | `admin/kit-dialog.tsx:356` | R6 | `rounded-md border bg-muted/40 p-3 text-sm` | `<Card>` (`size="sm"` se p-3) | M4 · agrupamento |
| 46 | `admin/testar-senha-dialog.tsx:103` | R6 | `flex items-center gap-2 rounded-md border border-green-600/40 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200` | `<Aviso intencao="sucesso">` | M2 · aviso (intenção nova) |
| 47 | `admin/testar-senha-dialog.tsx:112` | R6 | `flex items-center gap-2 rounded-md border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200` | `<Aviso intencao="atencao">` | M2 · aviso |
| 48 | `admin/tipo-item-dialog.tsx:162` | R6 | `rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm text-muted-foreground` | sem borda (preenchimento) ou `rounded-full` | M3 · valor/pastilha |
| 49 | `admin/tipos-item-tabela.tsx:58` | R3/4 | `py-10` | `py-12` | E1 · escala (vizinho mais próximo; empate sobe) |
| 50 | `admin/tipos-item-tabela.tsx:64` | R6 | `overflow-hidden rounded-lg border` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |
| 51 | `admin/usuarios/apagar-usuario-dialog.tsx:104` | R3/4 | `pl-5` | `pl-6` | E1 · escala (vizinho mais próximo; empate sobe) |
| 52 | `admin/usuarios/auditoria-filtro.tsx:44` | R5 | `w-[260px]` | `w-64` (256px) | L1 · largura px |
| 53 | `admin/usuarios/auditoria-tabela.tsx:28` | R6 | `overflow-x-auto rounded-lg border` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |
| 54 | `admin/usuarios/encerrar-sessoes-dialog.tsx:89` | R6 | `rounded-md border border-warning/40 bg-warning/5 p-3 text-sm` | `<Aviso intencao="atencao">` | M2 · aviso |
| 55 | `admin/usuarios/gerar-link-acesso.tsx:107` | R6 | `rounded-md border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200` | `<Aviso intencao="atencao">` | M2 · aviso |
| 56 | `admin/usuarios/gerar-link-acesso.tsx:122` | R6 | `flex items-center gap-2 rounded-md border bg-muted/40 p-3` | sem borda (preenchimento) | M3 · valor copiável |
| 57 | `admin/usuarios/usuarios-tabela.tsx:157` | R3/4 | `py-10` | `py-12` | E1 · escala (vizinho mais próximo; empate sobe) |
| 58 | `admin/usuarios/usuarios-tabela.tsx:161` | R6 | `overflow-x-auto rounded-lg border` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |
| 59 | `relatorios/acesso-form.tsx:25` | R3/4 | `py-10` | `py-12` | E1 · escala (vizinho mais próximo; empate sobe) |
| 60 | `relatorios/card-relatorio.tsx:49` | R6 | `scroll-mt-28 min-w-0 rounded-xl border bg-card p-4 md:p-5 md:col-span-2 break-inside-avoid` | `<Card>` (`size="sm"` se p-3) | M4 · agrupamento |
| 61 | `relatorios/card-relatorio.tsx:59` | R3/4 | `p-5` | `p-6` | E1 · escala (vizinho mais próximo; empate sobe) |
| 62 | `relatorios/card-relatorio.tsx:86` | R5 | `text-[11px]` | `text-xs` | T1 · texto |
| 63 | `relatorios/celulas.tsx:18` | R5 | `max-w-[220px]` | `w-56` (224px) | L1 · largura px |
| 64 | `relatorios/celulas.tsx:59` | R5 | `text-[11px]` | `text-xs` | T1 · texto |
| 65 | `relatorios/celulas.tsx:77` | R5 | `text-[10px]` | `text-xs` | T1 · texto |
| 66 | `relatorios/corpo-relatorio-v2.tsx:182` | R3/4 | `gap-3.5` | `gap-4` | E1 · escala (vizinho mais próximo; empate sobe) |
| 67 | `relatorios/corpo-relatorio-v2.tsx:335` | R3/4 | `gap-3.5` | `gap-4` | E1 · escala (vizinho mais próximo; empate sobe) |
| 68 | `relatorios/corpo-relatorio-v2.tsx:365` | R3/4 | `gap-3.5` | `gap-4` | E1 · escala (vizinho mais próximo; empate sobe) |
| 69 | `relatorios/corpo-relatorio.tsx:114` | R3/4 | `space-y-3.5` | `space-y-4` | E1 · escala (vizinho mais próximo; empate sobe) |
| 70 | `relatorios/corpo-relatorio.tsx:119` | R3/4 | `gap-3.5` | `gap-4` | E1 · escala (vizinho mais próximo; empate sobe) |
| 71 | `relatorios/filtros-tabela.tsx:56` | R5 | `w-[220px]` | `w-56` (224px) | L1 · largura px |
| 72 | `relatorios/filtros-tabela.tsx:67` | R3/4 | `pl-7` | `pl-8` | E1 · escala (vizinho mais próximo; empate sobe) |
| 73 | `relatorios/filtros-tabela.tsx:121` | R3/4 | `px-2.5` | `px-3` | E1 · escala (vizinho mais próximo; empate sobe) |
| 74 | `relatorios/gerar-relatorio-dialog.tsx:262` | R6 | `rounded-md border bg-muted/40 p-3 text-sm` | `<Card>` (`size="sm"` se p-3) | M4 · agrupamento |
| 75 | `relatorios/grupo-colapsavel.tsx:105` | R3/4 | `space-y-3.5` | `space-y-4` | E1 · escala (vizinho mais próximo; empate sobe) |
| 76 | `relatorios/kpi-tiles.tsx:85` | R5 | `text-[11px]` | `text-xs` | T1 · texto |
| 77 | `relatorios/kpi-tiles.tsx:89` | R5 | `text-[11px]` | `text-xs` | T1 · texto |
| 78 | `relatorios/kpi-tiles.tsx:126` | R3/4 | `gap-2.5` | `gap-3` | E1 · escala (vizinho mais próximo; empate sobe) |
| 79 | `relatorios/kpi-tiles.tsx:134` | R3/4 | `px-3.5` | `px-4` | E1 · escala (vizinho mais próximo; empate sobe) |
| 80 | `relatorios/kpi-tiles.tsx:160` | R5 | `text-[11px]` | `text-xs` | T1 · texto |
| 81 | `relatorios/kpi-tiles.tsx:215` | R3/4 | `gap-2.5` | `gap-3` | E1 · escala (vizinho mais próximo; empate sobe) |
| 82 | `relatorios/kpi-tiles.tsx:229` | R3/4 | `py-2.5` | `py-3` | E1 · escala (vizinho mais próximo; empate sobe) |
| 83 | `relatorios/kpi-tiles.tsx:247` | R5 | `text-[11px]` | `text-xs` | T1 · texto |
| 84 | `relatorios/legendas.tsx:52` | R3/4 | `pt-2.5` | `pt-3` | E1 · escala (vizinho mais próximo; empate sobe) |
| 85 | `relatorios/legendas.tsx:74` | R3/4 | `gap-y-2.5` | `gap-y-3` | E1 · escala (vizinho mais próximo; empate sobe) |
| 86 | `relatorios/lista-manutencao.tsx:12` | R5 | `text-[13px]` | `text-xs` | T1 · texto |
| 87 | `relatorios/lista-manutencao.tsx:17` | R2 | `max-w-[45%]` | ver L2 | L2 · teto de célula |
| 88 | `relatorios/lista-modelo-categoria.tsx:27` | R5 | `text-[13px]` | `text-xs` | T1 · texto |
| 89 | `relatorios/lista-modelo.tsx:14` | R5 | `text-[13px]` | `text-xs` | T1 · texto |
| 90 | `relatorios/lista-reservados.tsx:12` | R5 | `text-[13px]` | `text-xs` | T1 · texto |
| 91 | `relatorios/manutencao-casos.tsx:26` | R6 | `break-inside-avoid rounded-lg border bg-card p-3` | `<Card>` (`size="sm"` se p-3) | M4 · agrupamento |
| 92 | `relatorios/manutencao-casos.tsx:41` | R5 | `text-[11px]` | `text-xs` | T1 · texto |
| 93 | `relatorios/manutencao-casos.tsx:47` | R5 | `text-[11px]` | `text-xs` | T1 · texto |
| 94 | `relatorios/manutencao-casos.tsx:57` | R5 | `text-[11px]` | `text-xs` | T1 · texto |
| 95 | `relatorios/manutencao-casos.tsx:112` | R5 | `text-[13px]` | `text-xs` | T1 · texto |
| 96 | `relatorios/medidor-minimo.tsx:59` | R5 | `text-[10px]` | `text-xs` | T1 · texto |
| 97 | `relatorios/observacao-card.tsx:12` | R6 | `scroll-mt-28 break-inside-avoid rounded-lg border border-l-4 border-brand-amarelo bg-brand-amarelo/5 p-4` | `<Card size="sm">` com a barra de marca | M4 · destaque |
| 98 | `relatorios/resumo-periodo.tsx:48` | R3/4 | `pt-9` | `pt-8` | E1 · escala (vizinho mais próximo; empate sobe) |
| 99 | `relatorios/resumo-periodo.tsx:48` | R3/4 | `pr-32` | `pr-— (estrutural)` | E1 · escala (vizinho mais próximo; empate sobe) |
| 100 | `relatorios/resumo-periodo.tsx:48` | R5 | `text-[13px]` | `text-xs` | T1 · texto |
| 101 | `relatorios/tabela-entradas.tsx:143` | R6 | `overflow-hidden rounded-lg border` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |
| 102 | `relatorios/tabela-entradas.tsx:220` | R5 | `text-[11px]` | `text-xs` | T1 · texto |
| 103 | `relatorios/tabela-entradas.tsx:220` | R6 | `rounded border border-amber-300 bg-amber-50 px-1.5 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300` | `<Aviso intencao="atencao">` | M2 · aviso |
| 104 | `relatorios/tabela-itens-grupo.tsx:48` | R6 | `overflow-hidden rounded-lg border` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |
| 105 | `relatorios/tabela-itens-grupo.tsx:134` | R5 | `text-[11px]` | `text-xs` | T1 · texto |
| 106 | `relatorios/tabela-itens-grupo.tsx:142` | R2 | `max-w-[220px]` | ver L2 | L2 · teto de célula |
| 107 | `relatorios/tabela-itens-grupo.tsx:142` | R5 | `max-w-[220px]` | `w-56` (224px) | L1 · largura px |
| 108 | `relatorios/tabela-mov-itens.tsx:108` | R6 | `overflow-hidden rounded-lg border` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |
| 109 | `relatorios/tabela-mov-itens.tsx:164` | R5 | `text-[11px]` | `text-xs` | T1 · texto |
| 110 | `relatorios/tabela-mov-itens.tsx:171` | R5 | `text-[10px]` | `text-xs` | T1 · texto |
| 111 | `relatorios/tabela-movimentacoes.tsx:67` | R6 | `overflow-hidden rounded-lg border` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |
| 112 | `relatorios/tabela-saidas.tsx:133` | R6 | `overflow-hidden rounded-lg border` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |
| 113 | `relatorios/tabela-transferencias.tsx:138` | R6 | `overflow-hidden rounded-lg border` | `<QuadroDeTabela>` | M1 · quadro de tabela/lista |

Contagem por código: T1 = 21 · E1 = 33 · L1 = 4 · L2 = 3 · M1 = 17 · M2 = 12 (2 delas pedem a intenção nova
`sucesso`) · M3 = 7 · M4 = 16.

**Os casos que a aplicação mecânica não resolve, e o que se faz com cada um** (a medição da execução pode trocar a
escolha; a troca vai para a tabela de mudanças com o motivo):

| arquivo | por que não é mecânico | decisão |
|---|---|---|
| `relatorios/resumo-periodo.tsx:48` (`pt-9 pr-0 text-[13px] sm:pt-0 sm:pr-32`) | o `pre` reserva espaço para o botão "Copiar texto" posicionado por cima; `pr-32` não tem vizinho | E2: a reserva vira o menor passo que ainda cobre o botão, ou o botão sai do `absolute` para o fluxo (classe, sem mudar a ordem) — medido na vitrine |
| `relatorios/lista-manutencao.tsx:17` (`max-w-[45%]`) | teto proporcional de item flex | L2: `w-2/5` com `truncate` (a coluna do modelo passa a ter largura fixa de 40%) |
| `admin/importar/tabela-erros.tsx:30` (`max-w-40 truncate` na célula) | teto de célula | L2: `w-40` (o cabeçalho da coluna já é `w-40`) |
| `relatorios/celulas.tsx:18` + `tabela-itens-grupo.tsx:142` (`max-w-[220px]`) | a mesma medida, escrita duas vezes (uma ignora a constante) | L1/L2: `w-56` nos dois — **a constante continua como está e a cópia continua cópia** (unificá-las é refatoração, não troca de classe) |
| as caixas com `<ul>`/`<code>`/`<p>`/`<span>` | o componente de sistema é `div` | M1 embrulha a lista; M3 tira a borda do elemento de texto; M2/M4 trocam `p`/`section` por `div` do componente — a ORDEM dos elementos não muda |
| `relatorios/observacao-card.tsx:12` (`border-l-4 border-brand-amarelo bg-brand-amarelo/5`) | destaque de MARCA, não aviso | M4: `Card` com a barra de marca à esquerda por classe |
| as 2 caixas verdes (`importar-wizard.tsx:679`, `testar-senha-dialog.tsx:103`) | o `Aviso` não tinha intenção de sucesso | M2 com a intenção nova `sucesso` (D6) |
| os 5 vazios `py-10 border-dashed` das tabelas de admin | a regra só pega o passo | E1: `py-12`. **Adotar `EstadoVazio`** (ícone novo, `py-16`) é mudança de conteúdo, não de classe → backlog |

### 3.3 A catraca — sem os dois furos do fato 6

A lista `PENDENTES`, a função `ehPendente` e a catraca saem do corpo do teste para um módulo puro,
`src/lib/layout/pendentes-da-regua.ts` — pelo mesmo motivo que os detectores já moram em `regua-de-classes.ts`: o
que se quer provar com um arquivo SINTÉTICO EM MEMÓRIA (sabotagem B) precisa das mesmas funções que o teste usa,
e duas cópias de régua divergem em silêncio. As perguntas de cada regra (`culpadosDaRegraN`) vão para
`regua-de-classes.ts`; as MENSAGENS continuam no teste. O número de casos de `consistencia.test.ts` antes e depois
da extração é conferido (a extração não pode sumir com caso nenhum).

| furo / exigência | a trava |
|---|---|
| arquivo em `components/admin/` ou `components/relatorios/` isento por `PENDENTES` (prefixo, nome ou entrada nova) | `DIRETORIOS_SEM_ISENCAO`: nenhuma entrada de `PENDENTES` começa por eles; e todo `.tsx` existente neles está em `SOB_REGRA` — exceto `DEVOLVIDOS_F61B` |
| a válvula | `DEVOLVIDOS_F61B: { arquivo, defeito, evidencia }[]` — nasce **vazia**; cada entrada exige arquivo existente nos dois diretórios, defeito não vazio e `evidencia` apontando arquivo existente em `docs/f61-evidencias/`; só encolhe (⊆ `DEVOLVIDOS_F61B_CONGELADOS`) |
| `PENDENTES` só encolhe | `PENDENTES` ⊆ `PENDENTES_CONGELADOS` (entrada nova reprova); "entrada morta" já reprovava |
| o piso de `SOB_REGRA` sem reprovar remoção legítima | **conjunto nomeado**: `SOB_REGRA_CONGELADA` (os caminhos medidos depois da conversão). Todo caminho dela que AINDA EXISTE tem de estar em `SOB_REGRA`; o que foi apagado passa. Arquivo novo fora de prefixo pendente entra sozinho |
| cada entrada que fica tem motivo próprio | `PENDENTES` vira `{ caminho, frente, motivo }[]`; teste: motivo não vazio |

### 3.4 As 30 entradas que ficam em `PENDENTES`, com o motivo de cada uma

| entrada | frente | motivo |
|---|---|---|
| `src/app/(app)/page.tsx` | a | a home ainda escreve o próprio casco |
| `src/app/(app)/pendencias/` | a | a rota ainda não usa `<Pagina>` |
| `src/app/(app)/movimentacoes/` | a | rotas do wizard e da devolução, fora do casco |
| `src/components/pendencias/` | a | migra junto com a rota (mesa de conflitos inclusa) |
| `src/components/movimentacoes/` | a | o wizard de lote; migra com a rota, nunca isolado |
| `src/app/(app)/relatorios/` | b | as ROTAS: 13 rotas sem casco (R7) e 4 esqueletos (R8) — o casco das rotas é da frente b, não desta fase |
| `src/app/(app)/admin/` | c | as ROTAS: os painéis escrevem `<h1>` e a barra de abas; decidir a subnavegação é da frente c |
| `src/app/(app)/dev/` | d | área do desenvolvedor, layout próprio |
| `src/app/(app)/ajuda/` | d | documentação do operador, rotas dinâmicas |
| `src/app/(app)/versoes/` | d | página sem banco, ainda não migrada |
| `src/app/(app)/layout.tsx` | d | a casca do app (sidebar, header, anti-flash) |
| `src/app/(app)/loading.tsx` | d | o esqueleto da casca acompanha o `layout.tsx` |
| `src/app/(app)/error.tsx` | d | painel de erro da casca |
| `src/app/(app)/not-found.tsx` | d | 404 dentro da casca |
| `src/app/layout.tsx` | d | layout raiz (fontes, metadata, provedores) |
| `src/app/error.tsx` | d | erro global |
| `src/app/global-error.tsx` | d | erro fatal, fora dos provedores |
| `src/app/not-found.tsx` | d | 404 pública |
| `src/app/login/` | d | porta pública; migra para o `CascoDeAutenticacao` |
| `src/app/auth/` | d | portas de convite e senha; idem |
| `src/components/dev/` | d | painéis de diagnóstico e Zona destrutiva |
| `src/components/ajuda/` | d | blocos da documentação |
| `src/components/layout/app-header.tsx` | d · casca | o cabeçalho do app (arquivo nomeado: um prefixo `layout/` isentaria componente de sistema novo) |
| `src/components/layout/atalhos-dialog.tsx` | d · casca | diálogo de atalhos, superfície de portal |
| `src/components/layout/aviso-sem-escrita.tsx` | d · casca | faixa de permissão anterior ao `Aviso` |
| `src/components/layout/esqueleto-relatorio.tsx` | b · casca | esqueleto de streaming do relatório; migra com as rotas de relatório |
| `src/components/layout/painel-erro.tsx` | d · casca | painel de erro compartilhado |
| `src/components/layout/paleta-comandos.tsx` | d · casca | paleta de comandos (`cmdk`), portal |
| `src/components/layout/sidebar-nav.tsx` | d · casca | a navegação lateral |
| `src/components/ativos/nova-compra-form.tsx` | decisão F40 | 1.412 linhas e 30 `useState`: formulário é outra frente (e a ficha F61 põe a decomposição em "Não entra") |

---

## 4. A tabela de mudanças de propósito **(cresce)**

**Fonte única:** `docs/f61-evidencias/mudancas-de-proposito.json` — uma linha por troca de string de classe
(`arquivo`, `antes`, `depois`, `n`, `efeitoVisivel`, `vitrine`, `motivo`, `frente`). É o GABARITO do portão (a):
`npx tsx scripts/design/diff-classes-f61.ts` compara, por arquivo de fonte de produção, o multiconjunto de strings
de classe de `v1.65.0` com o da árvore de trabalho e exige que as diferenças e as linhas sejam o MESMO conjunto. A
versão em markdown sai de `--markdown` e é colada em §4.1 ao fim de cada lote.

### 4.1 A tabela

_(preenchida lote a lote)_

---

## 5. O nome do sistema e as frases da empresa

### 5.1 Os endereços do nome do sistema (decisão iii, D3)

| endereço | hoje | depois (fonte) | texto visível muda? |
|---|---|---|---|
| `src/app/layout.tsx:22` `title.default` | `Estoque TI · WAP` | `nomeCompleto` | **sim** — só na aba de `/auth/confirm` e `/auth/definir-senha` (as únicas sem título próprio): "Estoque TI · WAP" → "Estoque TI WAP" |
| `src/app/layout.tsx:23` `title.template` | `%s · Estoque TI WAP` | `%s · ${nomeCompleto}` | não |
| `src/app/layout.tsx:25` `description` | `Controle de ativos de TI da WAP` | `descricao` | não |
| `src/app/not-found.tsx:25` | `Página não encontrada · Estoque TI WAP` | `Página não encontrada · ${nomeCompleto}` | não |
| `(app)/versoes/page.tsx:19` description | `O que mudou em cada versão do Estoque TI WAP.` | idem com `nomeCompleto` | não |
| `(app)/versoes/page.tsx:116` rodapé | `Estoque TI WAP · v…` | `${nomeCompleto} · v…` | não |
| `(app)/ajuda/page.tsx:16` description | `Documentação do operador do Estoque TI WAP.` | idem com `nomeCompleto` | não |
| `auth/confirm/page.tsx:42` | `Acesso ao Estoque TI` | `Acesso ao ${nome}` | não |
| `components/layout/marca.tsx:10` `label` padrão | `Estoque TI` | `nome` | não |
| `components/layout/marca.tsx:27` chip | `WAP` | `sigla` (prop, padrão da fonte) | não |
| `components/layout/viewer-header.tsx:51` | `Estoque TI · Relatórios` | `${nome} · Relatórios` | não |
| `components/layout/credito-autor.tsx:19-20` | `vmatusita` / o site | `credito.autor` / `credito.site` | não |

**Fora por decisão (documentação, F71):** `lib/ajuda/conteudo/mapa-das-telas.ts:80` ("A marca 'WAP · Estoque TI'")
e `acesso-e-sessoes.ts:160` — conteúdo de ajuda não se edita nesta fase; a grafia da ajuda vira backlog da F71.

### 5.2 O censo das frases da EMPRESA (backlog nomeado da F70)

Réplica AST da `sem-wapismo` (só literal: `StringLiteral`, template, `JsxText`), `src/**` fora de teste.

| arquivo:linha | texto | classe | destino |
|---|---|---|---|
| `src/app/layout.tsx:25` | "Controle de ativos de TI da WAP" | frase da empresa (metadata) | passa a sair da fonte (`descricao`) com o mesmo texto; a F70 a deriva da empresa |
| `src/app/login/page.tsx:63` | placeholder `voce@wap.ind.br` | frase da empresa | **fica** (decisão iii) → F70 |
| `src/components/relatorios/acesso-form.tsx:53` | "É operador da WAP?" | frase da empresa | fica → F70 (a ajuda cita o rótulo: `comecar.test.ts`) |
| `src/components/relatorios/acesso-form.tsx:59` | "Não tem a senha? Peça à TI da WAP." | frase da empresa | fica → F70 |
| `src/components/relatorios/kpi-tiles.tsx:59` | "defasados / posse WAP" | frase da empresa | fica → F70 |
| `src/lib/relatorios/legendas.ts:146` | "…ainda em posse da WAP como reserva…" | frase da empresa | fica → F70 |
| `src/components/ativos/editar-ativo-dialog.tsx:268` | placeholder `WAP-NB-1234` | frase da empresa (exemplo de hostname) | fica → F70 |
| `src/components/movimentacoes/devolucao-fornecedor-form.tsx:501` | placeholder `WAP-NB-1234` | idem | fica → F70 |
| `src/components/ativos/nova-compra-form.tsx:1363` | placeholder `WAP` (fornecedor) | frase da empresa | fica → F70 |
| `src/lib/auth/dominios-email.ts:16` | `@wap.ind.br` | regra de negócio (domínio de login) | fica → F69/F70 |
| `src/components/layout/marca.tsx:27` | chip `WAP` | nome do sistema (sigla) | **entra na fonte** |
| `src/app/(app)/layout.tsx:45,49`, `relatorios/[filial]/page.tsx:90-91`, `gerados/[id]/page.tsx:42-43`, `gerados/page.tsx:55-56`, `lib/supabase/proxy.ts:29,37` | `x-wap-pathname` / `x-wap-search` | nome interno não visível (cabeçalho HTTP) | fica |
| `components/ativos/lista-visitada.ts:16`, `ativos/nova-compra-form.tsx:58`, `ativos/rascunho-compra.ts:23`, `itens/conferencia/rascunho.ts:24`, `movimentacoes/nova/rascunho.ts:26`, `relatorios/relatorio-visitado.ts:26`, `lib/ativos/ativos-recentes.ts:14` | chaves `wap:*` | nome interno | passam por `chaveDeStorage` (D11), mesma chave |
| `itens/lancar-item-evento.ts:5,18`, `itens/transferir-item-evento.ts:12,23` | `wap:lancar-item`, `wap:transferir-item` | nome interno (CustomEvent) | fica, exceção nomeada da trava de storage |
| `layout/progresso-navegacao.tsx:35,126,127` | keyframes `wap-barra-*` | nome interno | fica |
| `layout/sidebar-preferencia.ts:15` | `wap-sidebar` | nome interno (preferência do aparelho) | fica, exceção nomeada |
| `lib/escopo/chave.ts:32`, `lib/escopo/pertencimento.ts:48` | `'wap'` | escopo de dado | fica (F62 tira `ESCOPO_UNICO`) |
| `lib/ajuda/conteudo/**` (18) e `lib/versoes/registry.ts` (2) | ajuda e histórico | fora por decisão | F71 (ajuda); o histórico não se reescreve |

---

## 6. A marca e o cromo escuro (D2)

| arquivo | hoje | depois |
|---|---|---|
| `layout/marca.tsx:23` | `bg-brand-amarelo … text-black` | `bg-brand-amarelo … text-brand-amarelo-texto`; texto `{sigla}` |
| `layout/app-header.tsx` `:63,70,129,138,153,164` | `text-white`, `hover:text-white`, `text-white/70`; o botão `bg-brand-amarelo text-black` | `text-brand-dark-texto` (+ `hover:`, `/70`); `text-brand-amarelo-texto` |
| `layout/user-menu.tsx:99` | avatar `bg-brand-amarelo text-black` | `text-brand-amarelo-texto` |
| `layout/viewer-header.tsx:29,42,57` | `text-white`, `/80` | `text-brand-dark-texto`, `/80` |
| `layout/viewer-nav.tsx:103-104` | `text-white`, `hover:text-white`, `bg-white/15` | `text-brand-dark-texto` (+ `hover:`), `bg-brand-dark-texto/15` |
| `app/login/page.tsx:99`, `auth/confirm/page.tsx:41-42`, `auth/definir-senha/page.tsx:35-36`, `relatorios/acesso-form.tsx:28-29`, `layout/casco-de-autenticacao.tsx:56,63` | `labelClassName="text-white"`, `text-white/70` | `text-brand-dark-texto`, `/70` |
| `relatorios/gerar-relatorio-dialog.tsx:151` | botão `bg-brand-amarelo text-black` | `text-brand-amarelo-texto` |
| `admin/importar/importar-wizard.tsx:185` | passo atual `bg-brand-amarelo text-black` | `text-brand-amarelo-texto` |
| `globals.css` | `--brand-dark`, `--brand-amarelo` só em `:root` | + `--brand-dark-texto: #ffffff` e `--brand-amarelo-texto: #000000` em `:root` e `.dark`; apelidos `--color-brand-*-texto` |
| `scripts/contraste.mjs:342-350` | `black` sobre `brand-amarelo`; `white` sobre `brand-dark`; `white/70`, `white/80` | `brand-amarelo-texto` sobre `brand-amarelo`; `brand-dark-texto` sobre `brand-dark`; `/70`, `/80` — nos dois temas |
| `scripts/smoke/smoke-prod.mjs:186` | `MARCADORES_LOGIN = ['bg-brand-dark', 'max-w-sm']` | **não muda** (o fundo continua `bg-brand-dark`) |

(Números de linha de hoje; a execução confere cada um. Nenhum `text-white` fora destes arquivos.)

---

## 7. O verde (D6) e a regra de tinta (D7)

### 7.1 Os 12 sítios

| sítio | significado | destino |
|---|---|---|
| `(app)/admin/filiais/page.tsx:80`, `kits/page.tsx:126`, `motivos/page.tsx:71`, `senhas/page.tsx:76`, `admin/colaboradores-tabela.tsx:156`, `admin/itens-tabela.tsx:147`, `admin/tipos-item-tabela.tsx:94` | cadastro ativo | `<Badge variant="sucesso">` (o `className` de cor sai) |
| `ativos/nova-compra-form.tsx:847`, `movimentacoes/devolucao-fornecedor-form.tsx:206`, `movimentacoes/nova/painel-sucesso.tsx:278` | operação concluída (círculo) | `bg-sucesso text-sucesso-texto` |
| `relatorios/manutencao-casos.tsx:47` | caso resolvido ("voltou em…") | `bg-sucesso text-sucesso-texto` |
| `relatorios/medidor-minimo.tsx:22` (trilho) e `:27` (barra) | FOLGA do medidor | `bg-medidor-folga` / `bg-medidor-folga-barra` |

### 7.2 O resto do verde (19 linhas, 48 ocorrências, 13 arquivos) — destino por linha

| linha | significado | destino |
|---|---|---|
| `lib/relatorios/legendas.ts:52` (`bg-green-100 dark:bg-green-900`) | legenda "voltou ao estoque" — diz espelhar a pílula de `manutencao-casos` | **token `bg-sucesso`** (conserta o `dark:green-900` que divergia do par) — efeito visível no escuro, na tabela |
| `admin/importar/importar-wizard.tsx:679-680`, `admin/testar-senha-dialog.tsx:103` | caixa de sucesso | `<Aviso intencao="sucesso">` (M2) |
| `admin/importar/grupos-erros.tsx:237,852`, `importar-wizard.tsx:101,1056` (`text-green-600 dark:text-green-400`) | "ok" de linha/resumo do import | **fora desta fase** — tom de texto (600/400) que não é o par de nenhum token criado; a tinta não o duplica. Backlog PATCH "o verde de texto" |
| `ativos/termos-da-ficha.tsx:142`, `dev/integridade-painel.tsx:45`, `movimentacoes/nova/painel-sucesso.tsx:79`, `movimentacoes/nova/passo-movimentacao.tsx:344`, `lib/relatorios/delta-kpi.ts:53` | ícone/texto "ok"; Δ favorável | fora desta fase, mesmo motivo (PATCH) |
| `itens/conferencia/conferencia-estoque.tsx:468,566`, `movimentacoes/nova/checklist-faltantes.tsx:303` (`emerald-*`) | "confere" / "Voltou" | fora desta fase: família `emerald`, significado próprio a decidir (PATCH) |
| `relatorios/realtime-refresh.tsx:87-88` | "ao vivo" | fora desta fase: significado próprio (PATCH) |

### 7.3 A regra de tinta

| proibido (src de produção, fora de teste) | duplica | exceções nomeadas |
|---|---|---|
| `(bg\|text\|border\|ring\|fill\|stroke)-green-(100\|800\|950\|300)` sem `/NN`, em qualquer variante | `--sucesso`/`--sucesso-texto` | **(cresce)** — a meta é zero |
| `text-white`, `text-black` (e `hover:`, `/NN`) | `--brand-dark-texto`/`--brand-amarelo-texto` | **(cresce)** |

---

## 8. As quatro confirmações (D8, decisão ii)

### 8.1 Hoje

| | mesa de conflitos | "Substituir tudo" do import | apagar conta | Zona destrutiva (6 chamadas) |
|---|---|---|---|---|
| trecho | `pendencias/mesa-conflitos.tsx:539-551` | `admin/importar/importar-wizard.tsx:1002-1023` | `admin/usuarios/apagar-usuario-dialog.tsx:121-152` | `dev/destrutivo/dialogo-destrutivo.tsx:144-163` |
| rótulo | "Para confirmar, digite exatamente:" | "Digite **<filial>** para confirmar" (nome `font-mono font-semibold` no rótulo) | "Para confirmar, digite o e-mail da conta" | "Para confirmar, digite exatamente:" |
| esperado | GERADO: `textoConfirmacaoConflito(n)` → `APAGAR <n>` | `previa.filial.nome` | `email` | prop `esperado` |
| onde aparece | `<p>` mono abaixo do rótulo | dentro do rótulo | `<p>` sem mono (ou `role="alert"` quando não há e-mail) | `<p>` mono |
| igualdade | `confirmacaoConflitoConfere` (trim + minúsculas pt-BR) | `confirmacaoImportConfere` (trim + maiúsculas pt-BR) | inline: trim + `toLowerCase` | `confirmacaoConfere` (trim + minúsculas pt-BR) |
| `aria-invalid` / `describedby` / dica `role="alert"` | **não / não / não** | sim / sim / sim | sim / sim / sim | sim / sim / sim |
| `spellCheck={false}` | sim | não | não | sim |
| Enter executa | não | não | **sim** (`:142`) | não (há justificativa abaixo) |
| desabilitado | `executando` | não | `apagando \|\| email === null` | `executando` |
| validação no servidor | action `validarExclusaoDeConflito` (`actions/conflitos.ts:198`) + RPC `apagar_ativos_conflito_filiais` | action `confirmacaoImportConfere` (`actions/importar.ts:555`) + RPC (`upper(btrim)`, F52) | action `validarExclusaoDeUsuario` (`actions/dev.ts:143`); a RPC `apagar_usuario` não confere texto | RPC (0082–0084) — a action só repassa |

### 8.2 Depois (o que cada uma passa ao componente)

| | props | o que muda visível/audível |
|---|---|---|
| mesa | `mono`, `esperado={APAGAR n}`, `desabilitado={executando}` | **ganha** `aria-invalid`, `aria-describedby` e a dica `role="alert"` "O texto não confere — digite exatamente APAGAR n" (decisão ii) |
| import | `rotulo` com o nome mono, `exibirEsperado={false}`, sem `desabilitado` | `spellCheck={false}` (o corretor deixa de sublinhar o nome da filial) |
| apagar conta | `onEnter={apagar}`, `desabilitado={apagando \|\| email === null}`, `aviso` quando `email === null` | `spellCheck={false}` |
| destrutivo | `mono`, `desabilitado={executando}` | nenhuma |

A régua de igualdade, o texto esperado, o Enter, o desabilitado e as validações da action e da RPC **não mudam**.
O comentário falso de `confirmacao-digitada.tsx:27-32` é corrigido. **Trava:** `dicaConfirmacaoNaoConfere` só é
importada de `src/components/layout/` (e do próprio módulo e do teste dele) — sem exceção.

---

## 9. Os diálogos (D9)

| diálogo | estado semeado de prop | como re-semeia hoje | "Novo" limpa? | destino |
|---|---|---|---|---|
| `admin/filial-dialog.tsx` | nome, slug, slugTocado, ativo, cidade, apelidos | nunca (`onOpenChange={setAberto}` `:153`) | não | **hook** (defeito) |
| `admin/kit-dialog.tsx` | nome, tipo, motivo, termo, observacao, categorias, ativo | nunca (`:191`); `limpar()` após criar | sim | **hook** (defeito) |
| `admin/motivo-dialog.tsx` | rotulo, codigo, codigoTocado, ativo, aplicaA | nunca (`:103`) | não | **hook** (defeito) |
| `admin/item-dialog.tsx` | nome, grupo, ordem, estoqueMinimo, ativo | `mudarAberto` só zera `confirmando` | não | **hook** (defeito) |
| `relatorios/gerar-relatorio-dialog.tsx` | de, ate, escopo | nunca (`:146`) | — | **hook** (defeito) |
| `admin/tipo-item-dialog.tsx` | rotulo, slug, ordem, ativo | `mudarAberto` completo (`:50-67`) | sim (reabre semeando) | **hook** (a cópia certa deixa de ser cópia) |
| `admin/colaborador-dialog.tsx` | nome, matricula, setor, filial, ativo | `mudarAberto` completo (`:66-85`) | sim | **hook** |
| `admin/usuarios/editar-usuario-dialog.tsx` | papel, escolhidas | `abrir(open)` (`:105-112`) | — | **hook** se a forma couber (o `trocarPapel` continua fora) |
| `itens/lancar-item-dialog.tsx` | carrinho | mantém DE PROPÓSITO (`:478-491`) | — | **exceção nomeada** |
| `ativos/editar-ativo-dialog.tsx` | react-hook-form `values` | sincroniza sozinho | — | **exceção nomeada** |
| os outros 16 (`convidar-usuario`, `criar-senha`, `testar-senha`, `alterar-email`, `encerrar-sessoes`, `anotar`, `definir-service-tag`, `corrigir-patrimonio`, `confirmar-assinatura`, `estornar`, `atalhos`, `colar-lista`, `resolver-pendencia-item`, `gerar-termo`, `transferir-item`, `dialogo-destrutivo`) | nenhum `useState` inicializado de prop de registro | — | — | fora (a trava confere) |

"Novo abre vazio" é a consequência direta de semear na abertura e entra na tabela de mudanças e no registry.

---

## 10. Os filtros de URL (D10)

**O vazamento, passo a passo:** (1) em `/itens`, URL limpa, o operador aplica `filial=2` →
`registrarFiltrosEnviados('', 'filial=2')`; (2) antes do commit da navegação, clica em "Histórico"
(`itens/page.tsx:290`, link sem query); (3) `/itens/historico` monta com query vazia; (4) o primeiro filtro de lá
chama `baseFiltrosItens('')` — e como `pendente.commitadaAntes === ''` casa, devolve `filial=2`; (5) a URL vira
`/itens/historico?filial=2&item=…` sem que ninguém tenha filtrado o histórico por filial.

| filtro | hoje | depois |
|---|---|---|
| `itens/itens-filtros.tsx` | `url-filtros.ts` (sem caminho) | `filtros/url.ts` com o `pathname` |
| `itens/historico-filtros.tsx` | idem | idem |
| `ativos/ativos-filtros.tsx` (`:76,92,124`) | `params.toString()` / `window.location.search` — sem o fix | ganha o fix |
| `pendencias/pendencias-filtros.tsx` (`:56,69`) | idem | ganha o fix |
| `movimentacoes/lista-filtros.tsx` (`:112-139`) | cópia do fix em `useRef` | o módulo (mesma garantia) |
| `admin/usuarios/auditoria-filtro.tsx:28`, `dev/auditoria-filtro-dev.tsx:56`, `relatorios/gerados-filtro.tsx:34` | um campo só | ficam (não há segundo campo para disputar) |
| `relatorios/periodo-filtro.tsx:52,61` | dois modos excludentes do mesmo grupo de chaves | fica (risco residual baixo, registrado) |
| `ativos/ativos-table.tsx:211`, `relatorios/barras-horizontais.tsx:79` | chave única ("o último clique vence" é o certo) | ficam |
| `ativos/ativos-paginacao.tsx:73,94` | duas chaves (`page`, `pp`), 8 rotas | **fica** — a paginação não muda nesta fase (a ordem manda não mexer); o risco teórico vai para o backlog PATCH |

---

## 11. As chaves de storage (D11)

| chave | storage | construtor hoje | depois (calculado no uso) |
|---|---|---|---|
| `wap:compra:defaults` | local | `CHAVE_DEFAULTS` (`nova-compra-form.tsx:58`) | `chaveCompraDefaults()` → `chaveDeStorage('compra:defaults')` |
| `wap:compra:rascunho` | session | `CHAVE_RASCUNHO_COMPRA` (`rascunho-compra.ts:23`) | `chaveRascunhoCompra()` |
| `wap:mov:rascunho` | session | `CHAVE_RASCUNHO` (`movimentacoes/nova/rascunho.ts:26`) | `chaveRascunhoMovimentacao()` |
| `wap:itens:conferencia:<filialId>` | session | `PREFIXO_RASCUNHO_CONFERENCIA` + `chaveRascunhoConferencia` | `chaveRascunhoConferencia(filialId)` → `chaveDeStorage(\`itens:conferencia:${filialId}\`)` |
| `wap:ativos:ultima-lista` | session | `CHAVE_LISTA_ATIVOS` (`lista-visitada.ts:16`) | `chaveListaAtivos()` |
| `wap:ativos:recentes` | session | `CHAVE_ATIVOS_RECENTES` (`lib/ativos/ativos-recentes.ts:14`) | `chaveAtivosRecentes()` |
| `wap:relatorios:ultimo` | session | `CHAVE_RELATORIO_VISITADO` (`relatorio-visitado.ts:26`) | `chaveRelatorioVisitado()` |
| `wap-sidebar` | local | `CHAVE_SIDEBAR` + anti-flash | **exceção**: preferência do APARELHO; embutida no `SCRIPT_SIDEBAR`; renomear apagaria a de todo mundo |
| `theme` | local | `next-themes` (padrão `storageKey`) | **exceção**: padrão da biblioteca, preferência do aparelho |

Nomes de `CustomEvent` (`wap:lancar-item`, `wap:transferir-item`) não são storage: exceção nomeada da trava de
literal. Os testes que hoje importam as constantes passam a provar a MESMA chave pela função.

---

## 12. A prova visual (D12) **(cresce)**

- **Instrumento:** `scripts/design/previa-f61.tsx` + `previa-f61-dados.ts` + `duble-dialog.tsx` +
  `tsconfig.previa-f61.json` (o dublê do `Dialog` NUNCA entra no `tsconfig.previa.json` das prévias F43/F44, que
  precisam do diálogo real fechado). Comparadores: `comparar-pixels-f61.mjs` (portão b) e `diff-classes-f61.ts`
  (portão a).
- **Vitrines, REAL × DUBLÊ, "sem vitrine":** preenchidas quando o instrumento fechar.
- **Normalização do HTML:** corpo sem `<style>` (no lugar, o sha256 do CSS), ids de `useId` renumerados por ordem
  de aparição, uma tag por linha.
- **Portão:** (a) diff de classes por arquivo × tabela, mesmo conjunto; (b) pixel por QUADRO (recorte pelo bbox de
  cada lado), `zero` nas vitrines de efeito visível "não", informado nas outras; (c) "sem vitrine" declarado.
  Rolagem horizontal a 390 px medida por vitrine.

---

## 13. O que a documentação oficial diz (regra 6)

| tema | fonte | o que diz | implicação |
|---|---|---|---|
| `title.default`/`template` | `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md` (§ title) | `default` é o fallback de filho sem título; **`template` vale para os segmentos FILHOS, não para o que o define**; `absolute` ignora o template | o `default` do layout raiz não leva sufixo — por isso as duas rotas sem título mostram só "Estoque TI · WAP" hoje |
| herança de `description` | mesma doc, "Inheriting fields" | campo não declarado é herdado; objeto declarado substitui inteiro | a 404 e as páginas sem `description` herdam a do layout |
| `metadata` só em Server Component | mesma doc | `metadata`/`generateMetadata` só em Server Components | `/login` (`'use client'`) usa o `layout.tsx` do segmento — a fonte única entra nos layouts/páginas servidor |
| `not-found` e metadata | `.../03-file-conventions/not-found.md` + fonte do Next (Context7, `resolve-metadata.ts`) | a metadata do boundary `not-found` é aplicada por último e sobrepõe a do layout | a 404 continua declarando o próprio título, lido da fonte |
| tokens no `@theme inline` | Context7 `/websites/tailwindcss` | `--color-*` no `@theme` gera `bg-*`/`text-*`; `inline` usa o valor da variável | os pares novos seguem o molde dos `--color-selo-*` |
| opacidade sobre variável | compilação real com `@tailwindcss/node` 4.3.3 + `dist/lib.js` | `/NN` vira `color-mix(in oklab, <cor> NN%, transparent)` qualquer que seja a origem da cor | `text-brand-dark-texto/70` = `text-white/70` no pixel (baseline v4); só o fallback de navegador sem `color-mix` difere |
| `Badge`/`cva` | `ui/badge.tsx` + Context7 `/joe-bell/cva` | variante nova = uma chave em `variants.variant`; `cn()` (tailwind-merge) deixa a classe do consumidor vencer | `sucesso` entra como chave; os selos deixam de sobrescrever `default` por classe |
| `next-themes` `storageKey` | Context7 `/pacocoursey/next-themes` | padrão `'theme'`; `attribute` padrão `data-theme` (o app usa `class`) | `theme` fica como exceção nomeada |
| `aria-invalid`/`aria-describedby`/`role="alert"` | WAI-ARIA APG (Field Error Message) + MDN | `aria-invalid` só quando falha; `describedby` aponta o id da mensagem, que precisa existir; `role="alert"` é região viva assertiva, e o anúncio é mais confiável quando o nó já existe e só o texto muda | a mesa ganha os três; manter a dica montada só com erro (como hoje nas outras três) é registrado como limitação conhecida, não corrigida nesta fase |

---

## 14. Os testes de componente (grau 1) **(cresce)**

| arquivo | o que prova (HTML que quebraria em silêncio) |
|---|---|
| `layout/marca.test.tsx` | sigla padrão `WAP` e outra sigla; o chip com `bg-brand-amarelo text-brand-amarelo-texto`; o rótulo padrão da fonte |
| `layout/credito-autor.test.tsx` | ligado (link com `rel`, `target`, `aria-label`) nas variantes longa e curta; desligado (fonte com crédito `null` por `vi.mock`) → nada |
| `layout/rodape-sidebar.test.tsx` | com o crédito desligado não sobra separador nem linha |
| `ui`/`layout/badge-sucesso.test.tsx` | `<Badge variant="sucesso">` → `bg-sucesso text-sucesso-texto`, sem classe `green-*` |
| `layout/confirmacao-digitada.test.tsx` (existe; cresce) | `mono`, `spellcheck="false"`, os três estados, as props da mesa (`APAGAR 3` × `APAGAR 2` → `aria-invalid` + `describedby` + `role="alert"`), `exibirEsperado`, `aviso` |
| `admin/tipos-item-tabela.test.tsx` | a moldura de sistema (`data-slot="card"`) e o selo `sucesso` |
| `relatorios/tabela-saidas.test.tsx` (ou outro alcançável) | a moldura de sistema na tabela do relatório |

---

## 15. Ordem de rollback

A fase é **só código**: `git revert -m 1 <merge>` e redeploy — nenhum passo de banco. As chaves de storage são as
MESMAS antes e depois (byte a byte, provado por teste), então reverter não apaga rascunho nem preferência de
ninguém. Os tokens de `globals.css` e os pares de `scripts/contraste.mjs` revertem juntos (mesmo commit). O
marcador do smoke (`bg-brand-dark`) não muda, então o `saude.yml` não alarma nem no deploy nem no revert.

---

## 16. O SHA de código congelado **(cresce)**

_(gravado na Frente G, passo 4)_

---

## 17. O que a execução mediu — o fecho do plano (17/09/2026)

### 17.1 A tabela de mudanças de propósito (§4, agora fechada)

**242 linhas**, fonte única em [`f61-evidencias/mudancas-de-proposito.json`](f61-evidencias/mudancas-de-proposito.json)
e renderizadas em [`f61-evidencias/mudancas-de-proposito.md`](f61-evidencias/mudancas-de-proposito.md). Por frente: **C**
(a régua) 159 · **E** (as correções) 52 · **D** (os pontos de injeção) 31. Por efeito: **150 com efeito visível**, 92 sem
(troca de nome com o mesmo valor). 27 arquivos têm pelo menos uma linha **sem vitrine**, e o motivo de cada um está na
linha (rota `async` com sessão, estado que só existe depois de um POST, ramo que a prévia não monta).

O portão (a) — `npx tsx scripts/design/diff-classes-f61.ts` — fecha o círculo:

```
ref: v1.65.0 · tabela: 242 linha(s) em docs/f61-evidencias/mudancas-de-proposito.json
✔ nenhuma diferença sem linha, nenhuma linha sem diferença.
```

### 17.2 As vitrines (§12, agora fechada)

`scripts/design/previa-f61.tsx` — **8 vitrines, 103 quadros** (94 nomeados + 9 selos derivados), dados 100% fictícios:

| vitrine | quadros | o que prova |
|---|---:|---|
| `cromo` | 10 | login, `auth/confirm`, cabeçalho do app, cabeçalho do visualizador, a porta de senha, o rodapé da sidebar, a sidebar, o rodapé de `/versoes` (TRECHO COPIADO), a `Marca` sobre `bg-popover` e a 404 |
| `admin-tabelas` | 10 + 9 selos | as três tabelas com selo "Ativo", os três vazios, usuários, auditoria, o filtro e a fila |
| `admin-importar` | 4 | as duas tabelas de erro, as correções aplicadas e o card de grupo |
| `admin-dialogos` | 21 | os 15 diálogos reais, abertos pelo dublê de `Dialog` |
| `relatorio` | 29 | KPIs, cartão, células, as seis tabelas, filtros, legendas, listas, casos de manutenção, o medidor nos três níveis, a observação e o resumo |
| `confirmacoes` | 13 | a `ConfirmacaoDigitada` com as props das QUATRO telas × vazio / não confere / confere, mais a conta sem e-mail |
| `selos-sucesso` | 2 | o painel de sucesso e o selo de status (controle) |
| `filtros` | 5 | os cinco filtros de lista no estado inicial (controle: não muda pixel) |

**Sem vitrine, declarado:** `auth/definir-senha` (Server Component com sessão e banco), o painel de sucesso da devolução
ao fornecedor (só existe depois do POST), o `importar-wizard` inteiro (máquina de etapas com upload), 9 dos 10 tipos de
correção do `grupos-erros` e o `CorpoRelatorio`/`CorpoRelatorioV2` montados (as peças que a régua reprova entram uma a uma).

### 17.3 O portão (b) — pixel por quadro

`comparar-pixels-f61.mjs`, `antes` × `depois`, 103 quadros × 2 temas × 2 larguras:
**176 quadros em "ok (zero)"**, nenhuma reprovação.

- **O cromo inteiro deu ZERO pixel** — `login`, `auth-confirmar`, `app-header`, `viewer-header`, `acesso-form` (só o
  respiro), `marca-sobre-popover` e `nao-encontrado` —, nos dois temas e nas duas larguras: é a prova de que trocar
  `text-white`/`text-black` pelos pares de tokens não repintou nada.
- **Dois quadros mudam por um motivo que não é classe**: `cromo/rodape-sidebar` e `cromo/versoes-rodape` mostram o NÚMERO
  da versão, que passou de `v1.65.0` para `v1.66.0` (o registry, não o CSS). A comparação feita ANTES do bump — com os
  dois em zero — está em [`f61-evidencias/G-pixels-antes-do-bump.txt`](f61-evidencias/G-pixels-antes-do-bump.txt).
- **A faixa de antialias.** O recorte de cada quadro sai da foto da página numa grade inteira, e a posição do quadro
  muda quando um quadro acima muda de altura: o MESMO conteúdo é recortado com outro alinhamento sub-pixel. Medido em
  quadros cujo HTML normalizado é byte a byte idêntico: 1 a 64 pixels, com Δ máximo **14** por canal. O portão passa a
  reprovar qualquer pixel com Δ > 16, e o relatório mostra as duas contagens. Não é limiar de porcentagem: **um** pixel
  forte reprova.
- **Rolagem horizontal a 390 px:** uma vitrine rola, `selos-sucesso` (399 × 390) — e rolava igual no "antes": é o
  `PainelSucesso` de `movimentacoes/nova/`, fora do escopo da conversão. Vai para o backlog PATCH.

### 17.4 Os números medidos, antes × depois

| medida | antes | depois |
|---|---:|---:|
| `npm run test` | 228 arquivos · 6.432 testes | **238 arquivos · 7.027 testes** |
| `.test.tsx` (rig grau 1) | 5 | **11** |
| `SOB_REGRA` | 77 | **154** |
| arquivos reprovados pela régua | 45 (113 violações) | **0** |
| `PENDENTES` | 32 entradas | **30** |
| `DEVOLVIDOS_F61B` | — | **vazia** |
| `TETO_PALETA_CRUA` / arquivos | 473 / 61 | **413 / 53** |
| superfície do visualizador / piso | 155 / 125 | **158 / 149** |
| pares em `scripts/contraste.mjs` | 157 | **167** |

### 17.5 As doze decisões, como ficaram

1. **A fonte única** — `src/lib/identidade/sistema.ts`, `identidadeDoSistema()`; puro, sem ambiente e sem banco.
2. **Os tokens da marca e do cromo** — `--brand-dark-texto` e `--brand-amarelo-texto`, literais nos dois blocos, nos oito
   arquivos; `contraste.mjs` mede os pares novos com as razões idênticas às de antes.
3. **O nome do sistema** — grafia única `Estoque TI WAP`; muda a aba de `/auth/confirm` e `/auth/definir-senha`.
4. **A régua** — §3.1 aplicada aos 45; catraca por conjunto nominal; 30 entradas de `PENDENTES` com motivo próprio.
5. **A válvula** — **não foi usada**: `DEVOLVIDOS_F61B` fechou vazia, e não há F61B.
6. **O verde** — `--sucesso`/`--sucesso-texto` (estado positivo) e `--medidor-folga`/`--medidor-folga-barra` (folga);
   `<Badge variant="sucesso">` sem opacidade; a legenda "voltou ao estoque" passou a espelhar de fato a pílula.
7. **A regra de tinta** — o par de verde e o texto branco/preto crus proibidos, lista de exceções **vazia**, não derivada
   do CSS; teto em 413 / 53.
8. **A confirmação** — `mono`, `exibirEsperado`, `aviso` e `spellCheck={false}`; as quatro migradas; a mesa anuncia o erro.
9. **`useDialogoSemeado`** — `src/components/dialogos/`; oito consumidores; exceção nomeada: `lancar-item-dialog`
   (`editar-ativo-dialog` nem dispara a trava, porque o react-hook-form sincroniza por `values`).
10. **Os filtros** — `src/components/filtros/url.ts`, pendente por caminho + `useEsquecerFiltrosAoSair`; os cinco migrados.
11. **O storage** — sete construtoras, chave calculada no uso; exceções `wap-sidebar` e `theme`, nomeadas.
12. **A prova visual** — §17.2 e §17.3.

### 17.6 O que mudou de propósito desde o plano

- O par do **medidor de folga** entra em `contraste.mjs` como **ANTES registrado**, não com `exigir: true`: `green-600`
  sobre `green-100` mede **2,93:1**, abaixo do piso de 3:1 do WCAG 1.4.11. É a cor que o medidor já tinha; a fase deu
  NOME ao par e não repinta. Escurecer a barra é mudança visível de gráfico — vai para o backlog PATCH, agora com nome.
- **`EstadoVazio` não foi adotado** nos cinco vazios de tabela: a régua reprova o passo (`py-10`), e trocar o componente
  acrescentaria um ícone que não existe hoje e 16 px de altura. Aplicou-se a regra de escala (`py-12`); a adoção do
  componente é backlog.
- **A ordem dos commits** saiu por FRENTE, não por lote: a conversão, os pontos de injeção e as correções se cruzam nos
  mesmos arquivos (o `importar-wizard` recebeu classe, token e a caixa de confirmação), e `git add` é por arquivo.
