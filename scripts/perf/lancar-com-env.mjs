// Lança um comando Node (o `next build`/`next start` de uma worktree) com as variáveis que ESTE processo recebeu por
// `--env-file`, sem copiar o `.env.local` para lugar nenhum e sem passar `--env-file` adiante.
//
// Por que existe: `node --env-file=… next build` falha — o Next abre workers com o `execArgv` do processo pai, e o Node
// recusa `--env-file` dentro de NODE_OPTIONS ("--env-file= is not allowed in NODE_OPTIONS"). Aqui o filho nasce com
// `execArgv` vazio e o ambiente herdado. Nenhum valor é impresso.
//
// USO: node --env-file=<repo>/.env.local lancar-com-env.mjs --cwd=<pasta> -- <script relativo à pasta> [args…]
//   ex.: … --cwd=C:/Users/x/f58-wt-main -- node_modules/next/dist/bin/next build
import { spawn } from 'node:child_process'
import { isAbsolute, join } from 'node:path'

const i = process.argv.indexOf('--')
const cwd = process.argv.find((a) => a.startsWith('--cwd='))?.slice('--cwd='.length)
if (i === -1 || !cwd) {
  console.error('[lancar] uso: --cwd=<pasta> -- <script> [args…]')
  process.exit(2)
}
const [script, ...args] = process.argv.slice(i + 1)
if (!script) {
  console.error('[lancar] faltou o script depois de --')
  process.exit(2)
}
const env = { ...process.env }
delete env.NODE_OPTIONS
console.log(`[lancar] ${script} ${args.join(' ')} · cwd ${cwd} · ambiente herdado (${Object.keys(env).length} variáveis, valores não impressos)`)
const filho = spawn(process.execPath, [isAbsolute(script) ? script : join(cwd, script), ...args], { cwd, env, stdio: 'inherit' })
filho.on('exit', (codigo, sinal) => process.exit(codigo ?? (sinal ? 1 : 0)))
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => filho.kill(s))
