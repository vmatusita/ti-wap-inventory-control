import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// TRÊS projetos desde a reauditoria de 22/09/2026 (passo 5, frente E/K/Y) — DOIS
// desde a F45. Até a F45 havia um `include` só, e ele deixava dois buracos:
// `.test.tsx` NÃO casa com `*.test.ts` (um teste de componente nunca rodaria, e
// ninguém ficaria sabendo) e teste escrito em `scripts/env-guard.ts`,
// `scripts/design/` ou `scripts/termos/` também ficava fora do runner.
// `src/lib/ci-passos.test.ts` agora afirma que TODO `*.test.ts?(x)` do
// repositório está coberto por algum `include` daqui — o buraco não volta em
// silêncio — e que nenhum arquivo casa com o `include` de dois projetos ao
// mesmo tempo (o terceiro projeto tornou esse segundo buraco possível pela
// primeira vez, ver `componentes` abaixo).
//
// `puro` é EXATAMENTE o que rodava antes da F45 (mesmos dois padrões, mesmos
// 149 arquivos), acrescido de `scripts/**` para fechar o buraco. `componentes`
// é o piso de componente GRAU 1 (F45). `dom` é o piso GRAU 2 (interação),
// aprovado em 22/09/2026 — ver o comentário dele, mais abaixo.
const alias = {
  // Mesmo alias do tsconfig (@/* -> src/*), para os imports funcionarem.
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  // F55 — `server-only` resolvido para o MÓDULO VAZIO que o próprio pacote
  // publica.
  //
  // O pacote tem um `exports` com a condição `react-server`: nela ele resolve
  // para `empty.js` (um no-op); em qualquer outra, para `index.js`, que LANÇA
  // incondicionalmente ("This module cannot be imported from a Client Component
  // module"). O Vitest não declara a condição `react-server`, então todo teste
  // que importasse — mesmo TRANSITIVAMENTE — um módulo com `import
  // 'server-only'` morria na avaliação, antes da primeira asserção.
  //
  // Até a F55 isso passava despercebido porque nenhum módulo testado importava
  // um só-servidor. Quando o funil de falha (`registrarFalha`) entrou em 36
  // arquivos, `src/lib/actions/erros.test.ts` — que testa a função PURA
  // `traduzErroBanco` — parou de conseguir carregar o próprio módulo. A escolha
  // era ou espalhar a metade pura do funil por toda parte (e a promessa da
  // ficha, "o funil é `server-only`", virava letra morta), ou dizer ao runner
  // qual condição ele está simulando. É isto.
  //
  // ⚠ Isto NÃO afrouxa nada em PRODUÇÃO: o build do Next continua resolvendo o
  // pacote pela condição real, e um Client Component que importe um módulo
  // só-servidor continua quebrando o build — que é onde a promessa vale.
  'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
}

// O RELÓGIO DO RUNNER (F61, 17/09/2026) — 60 s no lugar dos 5 s padrão do Vitest.
//
// Esta suíte é dominada por teste de ANÁLISE ESTÁTICA: **51 arquivos** varrem a
// árvore do repositório (`readdirSync` recursivo, `coletarLiterais`, o compilador
// TypeScript) lendo centenas de fontes DENTRO do corpo do teste. O custo deles não
// depende do que afirmam — depende de quantos arquivos o projeto tem e de quão
// ocupado o disco está —, e cresce a cada fase. Os 5 s padrão do Vitest foram
// feitos para teste unitário de função, não para isso.
//
// O sintoma medido em 17/09, na mesa: a MESMA suíte, quatro rodadas seguidas, sem
// nenhuma mudança de código entre elas — **0, 2, 5 e 1** reprovações, todas por
// `Test timed out in 5000ms` e cada vez em arquivos DIFERENTES (`url.test.ts` e
// `registry.test.ts` na segunda; três arquivos na terceira;
// `chaves-de-storage.test.ts`, a 5.106 ms, na quarta). Rodados isolados, todos
// verdes em ~2 s. É o relógio, não a trava: em nenhuma das quatro uma asserção
// falhou — 7.022 testes, e a contagem de reprovação bateu com a de timeout.
//
// A F61 acrescentou 11 arquivos de teste, que disputam o mesmo disco — ela tornou
// visível uma fragilidade que já existia, e por isso conserta aqui em vez de
// pendurar `60_000` em 51 testes, um a um, até a próxima fase recomeçar a fila.
//
// ⚠ Isto NÃO afrouxa nenhuma trava: timeout não é asserção de ninguém. O que ele
// pega — laço infinito, promessa que nunca resolve — continua sendo pego, 55 s
// depois. A folga é ~3x o pior tempo já medido (a `sem-wapismo`, ~22 s isolada),
// que já carregava este mesmo `60_000` no próprio teste desde 14/09 — esta config
// só promove a exceção dela a regra da casa.
const RELOGIO = 60_000

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'puro',
          testTimeout: RELOGIO,
          // Funções puras (CLAUDE.md — stack): domínio, patrimônio, datas,
          // período, termos e os validadores Zod (espelho da máquina de estados
          // §4). Ambiente `node`, sem tocar em componentes ou banco.
          // F4: inclui o motor de normalização da carga única (scripts/import) —
          // CSVs SINTÉTICOS apenas, jamais dados reais.
          environment: 'node',
          include: [
            'src/**/*.test.ts',
            // F45: `scripts/**` no lugar do antigo `scripts/import/__tests__/**`
            // — o recorte estreito fazia teste em `scripts/design/` ou
            // `scripts/termos/` nascer morto.
            'scripts/**/*.test.ts',
            'scripts/**/*.test.mts',
          ],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'componentes',
          testTimeout: RELOGIO,
          // PISO DE TESTE DE COMPONENTE, GRAU 1 (F45). Render ESTÁTICO por
          // `renderToStaticMarkup` de `react-dom/server`, que já é dependência
          // (`react-dom` 19.2.8) — zero dependência nova, como manda a regra 3
          // do CLAUDE.md e a decisão 4 do plano multiempresa.
          //
          // O que estes testes afirmam é o HTML que o servidor produz — papel
          // ARIA, `id` de `aria-describedby`, presença de `<h1>` —, que é
          // justamente o que quebra em silêncio numa decomposição.
          //
          // O transform de JSX sai de graça: o esbuild do Vitest lê
          // `"jsx": "react-jsx"` do `tsconfig.json`. Provado antes de escrever o
          // primeiro teste de verdade (docs/f45-evidencias/prova-1-transform-jsx.txt).
          //
          // GRAU 2 (interação, evento, estado) foi a "proposta escrita ao Johnny
          // depois do piloto" que este comentário prometia — aprovada em
          // 22/09/2026 (reauditoria, passo 5, frente E/K/Y) e mora no projeto
          // `dom`, logo abaixo. Este projeto CONTINUA só grau 1: por isso o
          // `exclude` de `*.dom.test.tsx` — sem ele um arquivo `.dom.test.tsx`
          // (que espera jsdom/happy-dom) rodaria TAMBÉM aqui, em `environment:
          // 'node'`, e cairia na primeira chamada de API de DOM que
          // `renderToStaticMarkup` nunca precisou simular.
          environment: 'node',
          include: ['src/**/*.test.tsx'],
          exclude: ['src/**/*.dom.test.tsx'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'dom',
          testTimeout: RELOGIO,
          // PISO DE TESTE DE COMPONENTE, GRAU 2 — interação real (Testing
          // Library + `@testing-library/user-event`), aprovado pelo Johnny em
          // 22/09/2026 (reauditoria de dívida técnica, passo 5, frente E/K/Y).
          // Só para os QUATRO componentes-gigantes que mais provavelmente
          // quebrariam em silêncio numa decomposição futura — não é o piso
          // geral de todo componente (esse continua sendo o grau 1, acima).
          //
          // `happy-dom`, e NÃO `jsdom` — medido nesta própria fase (22/09/2026),
          // não por gosto:
          //   · o Radix (base do `Select`/`Command`/`DropdownMenu` daqui) chama
          //     `ResizeObserver`, `Element.hasPointerCapture` /
          //     `setPointerCapture` e `Element.scrollIntoView` em interações
          //     comuns (abrir um combobox, rolar até um item). Rodar
          //     `grupos-erros.dom.test.tsx` sob jsdom 30 (instalado à parte,
          //     temporariamente, só para esta medição) reproduziu exatamente
          //     isso: `TypeError: target.hasPointerCapture is not a function`,
          //     lançado de dentro do `@radix-ui/react-select`, derrubando 2 dos
          //     3 testes — o happy-dom 20 implementa as três APIs nativamente,
          //     sem polyfill escrito à mão, e os mesmos 3 testes passam.
          //   · desempenho: o MESMO arquivo, a mesma máquina — `environment`
          //     (a montagem do DOM) levou 677 ms sob happy-dom contra 3,07 s
          //     sob jsdom, e a duração total do arquivo foi 6,53 s contra
          //     21,43 s (jsdom ainda mais lento aqui por lançar as 2 exceções
          //     não tratadas no meio do caminho). Não é o motivo principal (o
          //     motivo é o Radix não rodar de jeito nenhum sob jsdom), mas
          //     pesou no desempate, e bate com o ~1,6x que o bench isolado do
          //     levantamento mediu com 20 arquivos triviais.
          //
          // `include` ESTREITO de propósito: só `*.dom.test.tsx`, nunca
          // `*.test.tsx` — um teste puro ou de render estático não precisa do
          // custo de montar um DOM inteiro, e rodar os dois projetos sobre o
          // mesmo arquivo duplicaria a suíte em silêncio (é o que o describe 5
          // de `ci-passos.test.ts` passou a provar que NÃO acontece).
          environment: 'happy-dom',
          include: ['src/**/*.dom.test.tsx'],
        },
      },
    ],
  },
})
