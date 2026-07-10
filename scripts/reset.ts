// scripts/reset.ts — zera os dados de desenvolvimento.
// Apaga movimentacoes -> ativos (nessa ordem, por causa da FK). PRESERVA
// filiais, motivos e profiles (dados de referencia / contas). Mesmas guardas
// anti-acidente do seed. Uso: `npm run db:reset`.
import {
  assertGuardsAndGetConfig,
  createAdminClient,
  loadEnvLocal,
} from './env-guard'

async function main() {
  // Guardas SEMPRE primeiro.
  loadEnvLocal()
  const cfg = assertGuardsAndGetConfig()
  const db = createAdminClient(cfg)

  console.log(`[reset] projeto: ${cfg.projectRef}`)

  // Ordem importa: movimentacoes referencia ativos.
  // O filtro created_at >= epoch casa todas as linhas (coluna NOT NULL).
  const EPOCH = '1970-01-01T00:00:00Z'

  const { count: movCount, error: movErr } = await db
    .from('movimentacoes')
    .delete({ count: 'exact' })
    .gte('created_at', EPOCH)
  if (movErr) throw new Error(`Falha ao apagar movimentacoes: ${movErr.message}`)

  const { count: ativoCount, error: ativoErr } = await db
    .from('ativos')
    .delete({ count: 'exact' })
    .gte('created_at', EPOCH)
  if (ativoErr) throw new Error(`Falha ao apagar ativos: ${ativoErr.message}`)

  console.log(
    `[reset] apagados: ${movCount ?? 0} movimentacoes, ${ativoCount ?? 0} ativos.`,
  )
  console.log('[reset] preservados: filiais, motivos, profiles.')
}

main().catch((err) => {
  console.error('[reset] erro:', err instanceof Error ? err.message : err)
  process.exit(1)
})
