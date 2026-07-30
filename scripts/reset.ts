// scripts/reset.ts — zera os dados de desenvolvimento.
// Apaga anotacoes/lancamentos_item/termos_gerados (+ .docx no Storage) ->
// movimentacoes -> ativos -> itens (nessa ordem, por causa das FKs). PRESERVA
// filiais, motivos e profiles (dados de
// referencia / contas). O catalogo de itens (F3B) e dado de DEV recriado pelo
// seed, entao tambem e limpo aqui. Mesmas guardas anti-acidente do seed.
//
// F21 (29/07/2026) — as duas tabelas novas do modelo de cargos, e por que cada
// uma cai de um lado da linha. A regra desta ferramenta e "apaga o ACERVO, preserva
// as CONTAS":
//   * `operador_filiais` (vinculo de escrita do operador) e PRESERVADA, junto de
//     `profiles`: e configuracao de CONTA, nao dado de acervo. Apaga-la deixaria as
//     contas do banco de ensaio sem escrever em lugar nenhum ate o proximo seed —
//     um efeito colateral que ninguem espera de um "reset dos dados". O seed
//     reescreve os vinculos das contas ficticias a cada rodada, de todo modo.
//   * `eventos_admin` (trilha de auditoria) e LIMPA, porque o seed insere linhas
//     ficticias nela: nao limpar duplicaria a trilha a cada rodada. Este e o UNICO
//     lugar do projeto que apaga a trilha, e so aqui faz sentido — o app nao tem
//     caminho de update/delete nela (migration 0065), de proposito.
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

  // termos_gerados (F5A): sem FK de outras tabelas apontando p/ ela — ordem livre.
  // Apaga as linhas E os .docx do bucket privado `termos` (senão ficam órfãos).
  const { count: termoCount, error: termoErr } = await db
    .from('termos_gerados')
    .delete({ count: 'exact' })
    .gte('created_at', EPOCH)
  if (termoErr) throw new Error(`Falha ao apagar termos_gerados: ${termoErr.message}`)
  const { data: termoObjs } = await db.storage.from('termos').list('', { limit: 1000 })
  if (termoObjs && termoObjs.length > 0) {
    await db.storage.from('termos').remove(termoObjs.map((o) => o.name))
  }

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

  // eventos_admin (F21): a trilha de auditoria ficticia que o seed insere. Filtro
  // por `quando` (coluna NOT NULL com default now()), no mesmo idioma dos demais.
  const { count: eventoCount, error: eventoErr } = await db
    .from('eventos_admin')
    .delete({ count: 'exact' })
    .gte('quando', EPOCH)
  if (eventoErr) throw new Error(`Falha ao apagar eventos_admin: ${eventoErr.message}`)

  console.log(
    `[reset] apagados: ${anotCount ?? 0} anotacoes, ${lancCount ?? 0} lancamentos_item, ` +
      `${termoCount ?? 0} termos_gerados, ${movCount ?? 0} movimentacoes, ` +
      `${ativoCount ?? 0} ativos, ${itemCount ?? 0} itens, ${eventoCount ?? 0} eventos_admin.`,
  )
  console.log(
    '[reset] preservados: filiais, motivos, profiles (contas, com cargo) e operador_filiais (vinculos de escrita).',
  )
}

main().catch((err) => {
  console.error('[reset] erro:', err instanceof Error ? err.message : err)
  process.exit(1)
})
