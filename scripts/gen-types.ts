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

/**
 * F21 (29/07/2026): `--linked` depende de `supabase/.temp/linked-project.json`, que NAO
 * existe em toda maquina — nesta, `gen types --linked` falha com
 * `LegacyProjectNotLinkedError` e o script abortava sem alternativa, deixando
 * `npm run db:types` inutilizavel (e a regeneracao de tipos e passo obrigatorio de
 * qualquer fase que mexa no banco).
 *
 * Alternativa: `--project-id <ref>`, que fala com a Management API e precisa apenas do
 * `SUPABASE_ACCESS_TOKEN` (ja presente no .env.local). Ordem de preferencia:
 *   1. `DB_TYPES_PROJECT_REF` no ambiente  → `--project-id <ref>`  (caminho explicito)
 *   2. sem a variavel                      → `--linked`            (comportamento antigo)
 *
 * O ref NAO vem hardcoded de proposito: apontar o gerador para producao por engano
 * geraria tipos do banco errado sem ninguem notar. Quem quer o caminho novo diz qual ref.
 */
const REF = (process.env.DB_TYPES_PROJECT_REF ?? '').trim()
const args = REF
  ? ['supabase', 'gen', 'types', 'typescript', '--project-id', REF]
  : ['supabase', 'gen', 'types', 'typescript', '--linked']

console.log(`[db:types] gerando por ${REF ? `--project-id ${REF}` : '--linked'}`)

const r = spawnSync('npx', args, {
  encoding: 'utf8',
  // No Windows o `npx` e um .cmd — precisa de shell para ser resolvido.
  shell: process.platform === 'win32',
  maxBuffer: 32 * 1024 * 1024,
})

if (r.error) abortar(`Nao consegui executar o supabase CLI: ${r.error.message}`)
if (r.status !== 0) {
  abortar(
    `supabase gen types falhou (exit ${r.status}).` +
      (REF
        ? ' Confira SUPABASE_ACCESS_TOKEN e o ref em DB_TYPES_PROJECT_REF.'
        : ' Projeto nao linkado? Rode com DB_TYPES_PROJECT_REF=<ref> (ver comentario acima).'),
    r.stderr,
  )
}

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
