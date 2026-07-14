/**
 * Gera `src/lib/types/database.ts` de forma SEGURA (usado por `npm run db:types`).
 *
 * Motivacao (DECISOES 2026-07-14, F3B e F5A): `supabase gen types --linked`
 * ESCREVE um JSON de erro por cima do arquivo quando o projeto nao esta linkado
 * neste ambiente (LegacyProjectNotLinkedError), destruindo os tipos — o footgun
 * do redirecionamento de shell `> database.ts`, que trunca ANTES de saber se o
 * comando deu certo.
 *
 * Aqui a saida da CLI e capturada em memoria; so gravamos se ela parecer
 * TypeScript valido, e a escrita e atomica (arquivo temporario + rename no mesmo
 * diretorio). Em QUALQUER falha, o `database.ts` existente permanece intacto e o
 * processo sai com codigo 1.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const DESTINO = join(process.cwd(), 'src', 'lib', 'types', 'database.ts')
const TMP = `${DESTINO}.tmp`

function abortar(msg: string, detalhe?: string): never {
  console.error(`[db:types] ${msg}`)
  console.error('[db:types] O database.ts existente NAO foi alterado.')
  if (detalhe) console.error(detalhe.slice(0, 800))
  process.exit(1)
}

const r = spawnSync(
  'npx',
  ['supabase', 'gen', 'types', 'typescript', '--linked'],
  {
    encoding: 'utf8',
    // No Windows o `npx` e um .cmd — precisa de shell para ser resolvido.
    shell: process.platform === 'win32',
    maxBuffer: 32 * 1024 * 1024,
  },
)

if (r.error) abortar(`Nao consegui executar o supabase CLI: ${r.error.message}`)
if (r.status !== 0) abortar(`supabase gen types falhou (exit ${r.status}).`, r.stderr)

const saida = (r.stdout ?? '').trim()

// A saida valida do gerador declara o tipo/interface Database. Se veio um JSON de
// erro, texto vazio ou qualquer outra coisa, recusamos sem tocar no arquivo.
const pareceTs =
  saida.includes('export type Database') || saida.includes('export interface Database')
if (!pareceTs) {
  abortar('A saida da CLI nao parece TypeScript valido (provavel erro de link).', saida)
}

try {
  writeFileSync(TMP, `${saida}\n`, 'utf8')
  renameSync(TMP, DESTINO) // atomico: mesmo diretorio
} catch (err) {
  rmSync(TMP, { force: true })
  abortar(`Falha ao gravar o database.ts: ${(err as Error).message}`)
}

console.log('[db:types] database.ts atualizado com sucesso.')
