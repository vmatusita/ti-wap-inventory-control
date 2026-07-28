# RELATÓRIO F20B — Nome oficial do arquivo dos termos + "Tentar novamente" que funciona

**Data:** 28/07/2026 · **Ordem:** [`prompts/F20B-ultracode.md`](prompts/F20B-ultracode.md) · **Branch:** `main`
**Escopo:** 100% camada de app — **zero migration, zero escrita em banco, zero operação
destrutiva, zero mudança no Storage, zero dependência nova** (`package.json` byte a byte igual).

> **Por que "F20B" e não "F20".** A ordem se autointitula F20 e manda escrever
> `docs/RELATORIO-F20.md`. Mas a **F20 já existe** — a `/ajuda` multi-página, concluída em
> 24/07/2026 — e já ocupa esse arquivo **e** `docs/prompts/F20-ultracode.md`. Seguir ao pé da
> letra teria **sobrescrito o relatório da fase anterior**. Adotado o sufixo **B**, mesmo
> precedente da F19, que teve a mesma colisão. Nada foi sobrescrito. (Ata em
> [`DECISOES.md`](DECISOES.md), 2026-07-28 · F20B, Decisão 0.)

---

## 1. O que mudou e por quê

Duas queixas do Johnny no mesmo dia, ambas pequenas e ambas com a mesma assinatura: **uma coisa
que parecia funcionar e não funcionava.**

### Frente A — o nome do arquivo do termo

O `.docx` baixava como `Responsabilidade Notebook - Fulano-de-Tal.docx`: **sem patrimônio
nenhum** e com o nome do colaborador **hifenizado e sem acento**. O padrão oficial — o dos
arquivos que o Johnny nomeava à mão — é `<tipo do termo> - <patrimônio(s)> - <colaborador>.docx`,
com espaços normais.

O que foi feito:

- Nasceu a função pura **`nomeArquivoTermo(tipo, campos)`** em
  [`src/lib/termos/nome-arquivo.ts`](../src/lib/termos/nome-arquivo.ts), com **34 testes**.
  Ela tinha de sair da action: `src/lib/actions/termos.ts` é `'use server'`, e a varredura de
  `use-server-exports.test.ts` só admite `export async function` / `export type` — a lógica não
  podia nascer nem ser reexportada de lá, e sem sair de lá não teria teste.
- O prefixo por tipo ganhou **mapa próprio** (`TERMO_NOME_PREFIXO`), separado de `TERMO_ROTULO`.
  O helper antigo derivava o nome do arquivo do rótulo de UI — que também alimenta a ficha, o
  seletor de variante e a tabela de modelos da ajuda. Com isso, **mexer num rótulo de tela
  renomeava os downloads em silêncio**. Agora não mais.
- Os patrimônios entram **na ordem do documento** (notebook → monitor → celular → demais, que é
  o que `ordenarEquipamentos` já produz). `"sem patrimônio"` (F7E) e partes vazias ficam de fora.
  Acentos e espaços do colaborador são preservados.
- Teto de **150 caracteres**: corta a lista de patrimônios do fim para o começo, sempre em
  separador inteiro, nunca no meio de um código.
- `urlTermo` passou a trazer a coluna `dados` (o jsonb com os campos salvos na geração). É daí
  que saem os patrimônios — e é por isso que **termo gerado antes desta ordem também baixa com o
  nome novo**, sem tocar em banco nem em Storage: o nome é calculado na hora do download.

### Frente B — o "Tentar novamente" que não tentava

Quando uma tela falhava ao carregar, o operador clicava em "Tentar novamente" e **nada
acontecia**; só sair-e-voltar ou F5 recuperava.

**Causa:** os 5 `error.tsx` chamavam `reset()` puro. No App Router o reset apenas limpa o estado
de erro e re-renderiza o segmento — ele **não refaz as leituras de Server Component** que
falharam. O componente lança de novo, com os mesmos dados, e o boundary reaparece. Do ponto de
vista de quem clica: um botão morto.

**Correção — e aqui a ordem foi corrigida pela doc.** A ordem previa escrever à mão
`startTransition(() => { router.refresh(); reset() })`, mandando conferir a doc antes (regra 6 do
`CLAUDE.md`). A doc mudou: desde o **Next 16.2.0** o boundary recebe a prop **`unstable_retry`**,
e a referência de `error.js` diz, na seção `#reset`:

> "In most cases, you should use `unstable_retry()` instead. However, if you have a specific
> reason to clear the error state and re-render the error boundary's children without re-fetching
> the contents, you can use the `reset()` function."

E em `#unstable_retry`: *"When executed, the function will try to re-fetch and re-render the error
boundary's children."* Fonte:
`https://nextjs.org/docs/app/api-reference/file-conventions/error` · tabela *Version History* da
mesma página: `v16.2.0 | unstable_retry prop added`.

O repositório está no **16.2.10** (pinado, sem `^`). Conferido no pacote instalado
(`node_modules/next/dist/client/components/error-boundary.js`), a implementação é **literalmente
o que a ordem esperava**:

```js
this.unstable_retry = () => {
  startTransition(() => {
    this.context?.refresh()
    this.reset()
  })
}
```

`refresh()` **antes** do `reset()`, na mesma transição — inverter traz o bug de volta. Ou seja: a
hipótese da ordem estava mecanicamente certa, só deixou de precisar ser escrita à mão.

A mecânica foi extraída para
[`src/components/layout/tentar-novamente.tsx`](../src/components/layout/tentar-novamente.tsx),
usado pelos 5 boundaries. Durante a tentativa o botão desabilita e vira "Tentando…" com `Loader2`
(padrão do repo), então clique repetido não empilha. **Preservados** título, mensagem, ícone, os
CTAs extras ("Ir para o início" na raiz, "Limpar filtros" em pendências) e até o **rótulo
divergente da raiz** ("Tentar de novo") — a ordem exige "nenhum outro comportamento/texto muda".

---

## 2. Decisões

Ata completa em [`DECISOES.md`](DECISOES.md) (2026-07-28 · F20B). Em resumo:

| # | Decisão | Alternativa descartada |
|---|---|---|
| 0 | Esta ordem é a **F20B** | Sobrescrever os arquivos da F20 anterior |
| 1 | Nome de arquivo com **mapa próprio** de prefixos | Continuar derivando de `TERMO_ROTULO` |
| 2 | **Função pura** em `src/lib/termos/`, importada pela action | Helper privado na action (sem teste possível) |
| 3 | Teto de 150: corta patrimônios do fim; depois o colaborador, **por code point** | `slice()` cru (parte par surrogate) |
| 4 | **`unstable_retry`** da doc vigente | `router.refresh() + reset()` à mão, como a ordem previa |
| 5 | `aoTentar` **opcional**, com fallback para `refresh()+reset()` | Prop obrigatória (rename futuro = bug de volta, em silêncio) |
| 6 | **Preservar** o rótulo divergente da raiz | Unificar para "Tentar novamente" |

---

## 3. Evidências

### 3.1 Portão — saídas reais

Contagem de testes: **1457 → 1491** (+34), **69 → 70** arquivos. Disco e git conferidos batendo
(`find` = `git ls-files` = 70), porque durante a revisão um subagente chegou a deixar um arquivo
de teste temporário na árvore — ele foi removido e a contagem foi remedida depois.

```
=== npm run lint ===

> estoque-ti-wap@0.1.0 lint
> eslint

=== npm run test ===

> estoque-ti-wap@0.1.0 test
> vitest run

 RUN  v4.1.10 C:/Users/yukig/ti-wap-inventory-control

 Test Files  70 passed (70)
      Tests  1491 passed (1491)
   Start at  16:40:23
   Duration  15.88s (transform 3.08s, setup 0ms, import 141.38s, tests 2.08s, environment 7ms)

=== npm run build ===

> estoque-ti-wap@0.1.0 build
> next build

▲ Next.js 16.2.10 (Turbopack)
- Environments: .env.local
- Experiments (use with caution):
  · serverActions

  Creating an optimized production build ...
✓ Compiled successfully in 3.9s
  Running TypeScript ...
  Finished TypeScript in 6.5s ...
✓ Generating static pages using 11 workers (25/25)
```

`lint` sem nenhuma saída = limpo. Build com **27 linhas de rota**, TypeScript limpo (o
`tsconfig` inclui os `.test.ts`, então o build também type-checa os testes novos).

Diff da fase — 11 arquivos:

```
 PLAN.md                                    | 383 ++++++++++++++++-------------
 docs/prompts/F20B-ultracode.md             | 114 +++++++++
 src/app/(app)/ativos/error.tsx             |  12 +-
 src/app/(app)/error.tsx                    |  20 +-
 src/app/(app)/itens/error.tsx              |  11 +-
 src/app/(app)/movimentacoes/error.tsx      |  11 +-
 src/app/(app)/pendencias/error.tsx         |  16 +-
 src/components/layout/tentar-novamente.tsx |  77 ++++++
 src/lib/actions/termos.ts                  |  39 +--
 src/lib/termos/nome-arquivo.test.ts        | 322 ++++++++++++++++++++++++
 src/lib/termos/nome-arquivo.ts             | 142 +++++++++++
```

Nenhum teste existente foi alterado ou removido. `package.json`, `supabase/` e
`src/templates/termos/` intocados.

### 3.2 O limite declarado pela ordem NÃO se sustentou — a Frente B foi provada no navegador

A ordem (§V) dava como certo que "o clique real no boundary e o download real no navegador não
são automatizáveis aqui (login wall — o agente não digita senha)". **Isso está desatualizado
desde a F20:** existe o caminho do proxy de sessão — um script faz o login pela API do Supabase,
monta o mesmo cookie que o smoke usa e o entrega à aba; o token nunca passa pelo contexto do
agente. Não é digitar senha em formulário.

Com `npm run dev` + sessão entregue à aba, rodou-se um **A/B controlado em `/ativos`**. A falha
foi induzida por um gatilho em arquivo (`existsSync('.falha-teste-f20b')` no topo do Server
Component), o que permite **desligar a causa sem recompilar** — exatamente o cenário "a causa foi
resolvida, agora clique". Tudo foi revertido depois (`git checkout`; árvore limpa conferida).

**Teste 1 — boundary NOVO, causa ainda presente:**

```json
{ "durante":  { "temSpinner": true },
  "depois":   { "texto": "Tentar novamente", "disabled": false,
                "boundaryVisivel": true, "temTabela": false, "corpoVazio": false } }
```

Durante a transição o rótulo deixou de casar com "Tentar" (virou "Tentando…") e o spinner estava
no DOM. Com a causa persistindo: o boundary re-renderiza limpo — **sem tela branca, sem travar
desabilitado, sem loop**.

**Teste 2 — boundary NOVO, causa resolvida (o que a ordem quer provar):**

```json
{ "recuperouSemF5": true, "linhasCarregadas": 50, "boundarySumiu": true,
  "documentoPreservado": true, "navegacaoInalterada": true }
```

A tabela voltou com dados **e** uma variável gravada no `window` antes do clique sobreviveu —
prova de que **não houve recarregamento de página**. O segmento refez as leituras sozinho.

**Teste 3 — contrafactual, boundary ANTIGO (`reset()` puro) restaurado, mesmas condições:**

```json
{ "estadoInicial": { "boundaryVisivel": true, "temTabela": false },
  "recuperou": false, "boundaryAindaVisivel": true, "documentoPreservado": true }
```

15 segundos de espera após o clique: **nada**. E o controle que fecha o argumento — um F5 logo
em seguida carregou a tela normalmente (100 linhas), provando que a causa **estava** resolvida
durante o clique. É o sintoma do Johnny, reproduzido em laboratório e depois eliminado.

### 3.3 Frente A provada ponta a ponta contra termos REAIS anteriores à ordem

Duas fichas de produção com termos gerados em **27 e 28/07** (antes desta ordem). O `a.download`
foi **interceptado** (o clique real no link foi bloqueado — nada foi baixado) e conferido **só na
estrutura**. Nenhum nome, patrimônio ou conteúdo real aparece aqui — regra 2 do `CLAUDE.md`.

Termo de **responsabilidade de notebook**, gerado em 27/07:

```json
{ "prefixoDetectado": "Termo de Responsabilidade Notebook", "qtdeSegmentos": 3,
  "segundoSegmentoPareceP2atrimonio": true, "ultimoSegmentoTemEspacoEAcentoPreservados": true,
  "aindaTemHifenizacaoAntiga": false, "comprimento": 76, "dentroDoTeto": true,
  "terminaEmDocx": true, "semCaractereProibidoWindows": true }
```

Termo de **devolução por desligamento** (multi-patrimônio), gerado em 28/07:

```json
{ "comecaComPrefixoCorreto": true, "qtdeSegmentosDepoisDoPrefixo": 4,
  "quantosParecemPatrimonio": 3, "ultimoSegmentoTemEspaco": true,
  "comprimento": 106, "dentroDoTeto": true, "semCaractereProibidoWindows": true }
```

Ou seja: o patrimônio — que **não existia** no nome antigo — está lá, três deles na devolução; a
hifenização sumiu; o prefixo composto (`Termo de devolução - DESLIGAMENTO`) saiu correto.

### 3.4 Sonda read-only nos dois projetos Supabase

Só contagens e nomes de chave — nenhum valor foi lido para fora.

| tipo | linhas | tem `patrimonio` | tem `patrimonios` | jsonb ≠ coluna |
|---|---|---|---|---|
| `devolucao_desligamento` | 1 | 0 | 1 | 0 |
| `devolucao_equipamento` | 1 | 0 | 1 | 0 |
| `responsabilidade_monitor_interno` | 2 | 2 | 0 | 0 |
| `responsabilidade_notebook` | 2 | 2 | 0 | 0 |

**100% das 6 linhas de produção** têm exatamente a chave que a função lê para a sua família, e
**zero divergência** entre `dados->>'colaborador'` e a coluna `colaborador` — o que sustenta a
promessa retroativa. O projeto de **ensaio** (`sgmvldiizsrjbxzzpmhh`) não tem nenhum termo
gerado, então não havia o que conferir lá. Nenhuma escrita, em nenhum dos dois.

### 3.5 Revisão adversarial

4 lentes em contexto fresco (Frente A · Frente B · raio de impacto · cumprimento literal dos
requisitos), cada achado submetido a um **cético instruído a derrubá-lo**, em contexto próprio.

**9 achados brutos → 0 confirmados, 9 refutados.** Nenhum defeito de corretude sobreviveu. Os
refutados eram: 7 itens de encerramento (§R) que ainda não tinham sido feitos no momento da
revisão — e que são etapa posterior no fluxo da própria ordem —, e 2 de frescor de
`docs/DIVIDA-TECNICA.md`, documento que o §R nem lista. Os dois de dívida técnica foram
**atendidos assim mesmo**, porque o diff os tornou factualmente falsos:

- item **L** creditando a `termos.ts` a "formatação de nome" que saiu daqui (e `604` → `611` linhas);
- item **U** apontando `termos.ts:516`, ponteiro que meu diff deslocou para `:533`.

O único defeito real da fase **não veio das lentes** — veio de uma sonda própria, disparada por
um rascunho de fuzz que um revisor deixou na árvore: no teto de 150 caracteres, o corte do nome
do colaborador usava `slice()`, que conta unidades de código UTF-16 e **partia um par surrogate
ao meio** (emoji colado no campo, que é texto livre de até 200 caracteres), deixando meio
caractere inválido no nome. Corrigido cortando por code point, com teste que varre a faixa de
cortes que reproduzia a falha.

---

## 4. Roteiro manual de 2 minutos

Para o Johnny conferir com as próprias mãos.

**A — o nome do arquivo (40 s).**

```bash
npm run dev
```

1. Abra a ficha de um ativo que **já tenha termo gerado antes de hoje** e clique em **Baixar**.
2. Olhe o nome do arquivo na barra de download: deve ser
   `<tipo> - <patrimônio> - <Nome Do Colaborador>.docx`, **com acento e espaço**, sem hífen no nome.
3. Agora gere um termo de **devolução em lote** com 2–3 equipamentos e baixe: os patrimônios
   devem aparecer **na mesma ordem do documento**, separados por ` - `.

**B — o "Tentar novamente" (60 s).**

1. Abra `/ativos` já logado.
2. `F12` → aba **Network** → mude **No throttling** para **Offline**.
3. `F5`. A tela cai no painel de erro ("Não foi possível carregar os ativos") — header e menu
   continuam.
4. Volte a Network para **No throttling** (religue a rede).
5. Clique em **Tentar novamente**. O botão desabilita e mostra "Tentando…", e **a lista carrega
   sozinha, sem F5**. Esse é o comportamento que estava quebrado.
6. (Opcional) Repita deixando o Offline ligado ao clicar: o painel de erro volta limpo, sem tela
   branca e sem travar.

---

## 5. Pendências e backlog

Nada da ordem ficou por fazer. O que sobra são itens **fora do escopo desta ordem**, registrados
para não se perderem:

- **`docs/DIVIDA-TECNICA.md` tem outro ponteiro de linha defasado, alheio a esta fase.** O item
  **G** cita `nova-movimentacao-form.tsx:474`, mas o `as never` que ele descreve está hoje na
  linha **481** — e esse arquivo não foi tocado por esta fase. Achado de passagem pelo cético.
- **Rótulo divergente entre boundaries.** Quatro dizem "Tentar novamente" e a raiz diz "Tentar de
  novo". Foi **preservado de propósito** (a ordem proíbe mudar texto). Unificar é decisão de
  produto, de 1 linha.
- **`error.tsx` não cobre o `layout.tsx` do próprio segmento.** Um `throw` em `(app)/layout.tsx`
  continua caindo no boundary embutido do Next, em inglês. É um buraco separado do que esta ordem
  corrigiu; vale uma ordem própria se aparecer na prática.
- **`unstable_retry` é `unstable_`.** Pode ser renomeada num minor do Next. O fallback embutido
  cobre o caso sem quebrar nada, mas quando a API estabilizar vale trocar o nome e apagar o
  fallback. O `next` está pinado em `16.2.10` (sem `^`) — mantenha assim.
- **`.env.local` desta máquina continua apontando para PRODUÇÃO** (pendência antiga do README,
  ação do Johnny). Foi por isso que toda a verificação desta fase foi conduzida **read-only**.

---

## 6. O que este relatório NÃO prova

Sendo honesto sobre os limites do que foi verificado:

- **Não houve screenshot.** O painel do navegador não estava sendo exibido; todas as provas
  visuais são **medições no DOM** (presença de tabela, contagem de linhas, texto do botão,
  presença do spinner), não imagens.
- **O download real não foi executado.** O nome do arquivo foi lido do atributo `download` do
  link, com o clique interceptado. Que o Windows aceite o nome e que o Word abra o arquivo
  **continua não verificado por mim** — é o passo A do roteiro manual.
- **A prova em navegador foi contra o dev server (`npm run dev`), não contra a Vercel.** O
  comportamento do `unstable_retry` é de runtime do Next e não deve mudar, mas produção só será
  exercitada depois do deploy.
- **Só o boundary de `/ativos` foi clicado de verdade.** Os outros quatro usam o **mesmo
  componente** e foram conferidos por leitura + build, não por clique.
- **A frente A foi provada em 2 dos 6 termos de produção** (um de cada família). Os outros quatro
  são dos mesmos tipos e têm as mesmas chaves no jsonb (§3.4), mas não foram abertos um a um.
- **Nenhuma escrita foi exercitada.** Gerar um termo novo escreve no banco e no Storage; como o
  ambiente aponta para produção, isso não foi feito. O caminho `gerarTermo` está coberto por
  tipo, build e pelos testes da função pura — **não** por execução real.
- **O CI não foi conferido.** Não há `gh` CLI nesta máquina; os jobs `verificar` e `banco`
  ficaram por verificar após o push. `lint`, `test` e `build` locais estão verdes.
- **Testes de componente não existem** (a stack é fechada, sem jsdom/@testing-library). O
  `TentarNovamente` não tem teste unitário — o que o cobre é o build, a revisão e o A/B no
  navegador.
