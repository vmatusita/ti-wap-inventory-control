import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Vitest cobre SÓ funções puras (CLAUDE.md — stack): domínio, patrimônio, datas,
// período, termos e os validadores Zod (espelho da máquina de estados §4). Não
// há jsdom/React aqui — ambiente `node`, sem tocar em componentes ou banco.
// F4: inclui o motor de normalização da carga única (scripts/import) — CSVs
// SINTÉTICOS apenas, jamais dados reais.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/import/__tests__/**/*.test.ts'],
  },
  resolve: {
    // Mesmo alias do tsconfig (@/* -> src/*), para os imports funcionarem.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
