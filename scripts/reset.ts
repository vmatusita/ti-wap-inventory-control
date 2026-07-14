// scripts/reset.ts — zera os dados de desenvolvimento.
// Apaga anotacoes/lancamentos_item -> movimentacoes -> ativos -> itens (nessa
// ordem, por causa das FKs). PRESERVA filiais, motivos e profiles (dados de
// referencia / contas). O catalogo de itens (F3B) e dado de DEV recriado pelo
// seed, entao tambem e limpo aqui. Mesmas guardas anti-acidente do seed.
// Uso: `npm run db:reset`.
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

  // Ordem importa (FKs): anotacoes/lancamentos_item -> movimentacoes -> ativos
  // -> itens. O filtro created_at >= epoch casa todas as linhas (coluna NOT NULL).
  const EPOCH = '1970-01-01T00:00:00Z'

  const { count: anotCount, error: anotErr } = await db
    .from('anotacoes')
    .delete({ count: 'exact' })
    .gte('created_at', EPOCH)
  if (anotErr) throw new Error(`Falha ao apagar anotacoes: ${anotErr.message}`)

  const { count: lancCount, error: lancErr } = await db
    .from('lancamentos_item')
    .delete({ count: 'exact' })
    .gte('created_at', EPOCH)
  if (lancErr) throw new Error(`Falha ao apagar lancamentos_item: ${lancErr.message}`)

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

  const { count: itemCount, error: itemErr } = await db
    .from('itens')
    .delete({ count: 'exact' })
    .gte('created_at', EPOCH)
  if (itemErr) throw new Error(`Falha ao apagar itens: ${itemErr.message}`)

  console.log(
    `[reset] apagados: ${anotCount ?? 0} anotacoes, ${lancCount ?? 0} lancamentos_item, ` +
      `${movCount ?? 0} movimentacoes, ${ativoCount ?? 0} ativos, ${itemCount ?? 0} itens.`,
  )
  console.log('[reset] preservados: filiais, motivos, profiles.')
}

main().catch((err) => {
  console.error('[reset] erro:', err instanceof Error ? err.message : err)
  process.exit(1)
})
