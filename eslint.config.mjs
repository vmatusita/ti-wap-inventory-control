import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worktrees/artefatos internos do Claude Code (contem .next de outras fases).
    ".claude/**",
    // Rascunho de sessao: SQL avulso, scripts de sondagem, saidas. E ignorado
    // pelo git (.gitignore) e nunca entra no repo — lintar isso so gera ruido
    // que confunde na hora de decidir se a uniao esta verde (F13, 23/07/2026).
    "scratchpad/**",
  ]),
]);

export default eslintConfig;
