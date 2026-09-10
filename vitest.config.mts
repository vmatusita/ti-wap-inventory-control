import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// DOIS projetos desde a F45. Até aqui havia um `include` só, e ele deixava dois
// buracos: `.test.tsx` NÃO casa com `*.test.ts` (um teste de componente nunca
// rodaria, e ninguém ficaria sabendo) e teste escrito em `scripts/env-guard.ts`,
// `scripts/design/` ou `scripts/termos/` também ficava fora do runner.
// `src/lib/ci-passos.test.ts` agora afirma que TODO `*.test.ts?(x)` do
// repositório está coberto por algum `include` daqui — o buraco não volta em
// silêncio.
//
// `puro` é EXATAMENTE o que rodava antes (mesmos dois padrões, mesmos 149
// arquivos), acrescido de `scripts/**` para fechar o buraco. `componentes` é o
// piso novo.
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

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'puro',
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
          // PISO DE TESTE DE COMPONENTE, GRAU 1 (F45). Render ESTÁTICO por
          // `renderToStaticMarkup` de `react-dom/server`, que já é dependência
          // (`react-dom` 19.2.8) — zero dependência nova, como manda a regra 3
          // do CLAUDE.md e a decisão 4 do plano multiempresa.
          //
          // NÃO há jsdom nem Testing Library aqui, e é de propósito: grau 2
          // (interação, evento, estado) custa três dependências e vira proposta
          // escrita ao Johnny depois do piloto. O que estes testes afirmam é o
          // HTML que o servidor produz — papel ARIA, `id` de `aria-describedby`,
          // presença de `<h1>` —, que é justamente o que quebra em silêncio.
          //
          // O transform de JSX sai de graça: o esbuild do Vitest lê
          // `"jsx": "react-jsx"` do `tsconfig.json`. Provado antes de escrever o
          // primeiro teste de verdade (docs/f45-evidencias/prova-1-transform-jsx.txt).
          environment: 'node',
          include: ['src/**/*.test.tsx'],
        },
      },
    ],
  },
})
