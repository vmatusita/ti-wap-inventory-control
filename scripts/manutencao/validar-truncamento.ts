/**
 * Valida contra PRODUÇÃO que o corte de 1.000 linhas do PostgREST não afeta mais
 * as leituras do relatório. SÓ LEITURA — nenhuma escrita, nenhuma RPC de escrita.
 *
 *   npx tsx scripts/manutencao/validar-truncamento.ts
 *
 * Compara, para cada caso, o `lerEstadoAtivos` CORRIGIDO (o motor de verdade,
 * importado de src/) com uma contagem paginada bruta feita aqui — duas
 * implementações independentes que precisam concordar. E acusa falha se
 * qualquer leitura devolver EXATAMENTE 1.000, a assinatura do truncamento.
 *
 * Regra 2 do CLAUDE.md: a saída imprime SÓ CONTAGENS. Nenhum patrimônio, nome de
 * colaborador ou linha de produção sai daqui.
 *
 * NÃO usa `assertGuardsAndGetConfig` de propósito: aquelas guardas existem para
 * IMPEDIR que o seed/reset (destrutivos) toquem produção. Este script é o caso
 * oposto — precisa ler produção, e só lê.
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnvLocal } from '../env-guard'
import { lerEstadoAtivos } from '../../src/lib/queries/relatorios/estoque'
import { periodoAnterior } from '../../src/lib/relatorios/periodo'
import { semanaUtilCorrente } from '../../src/lib/relatorios/periodo'
import { hojeISO } from '../../src/lib/format'
import { filialParaRpc } from '../../src/lib/queries/rpc-filial'
import type { DbClient } from '../../src/lib/queries/relatorios/comum'

loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url || !serviceRoleKey) {
  console.error(
    '[validar-truncamento] NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias (.env.local).',
  )
  process.exit(1)
}

const client = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as unknown as DbClient

const PAGINA = 1000
let falhas = 0

function checar(ok: boolean, descricao: string) {
  console.log(`  ${ok ? 'OK  ' : 'FALHA'} ${descricao}`)
  if (!ok) falhas++
}

/** Contagem paginada bruta da RPC as-of — independente do motor de src/. */
async function contarAsofBruto(filialId: number | null, data: string): Promise<number> {
  let total = 0
  for (let from = 0; from < 100_000; from += PAGINA) {
    const { data: pag, error } = await client
      // `filialParaRpc` preserva o NULL (= consolidado). Passar `undefined`
      // OMITE o argumento do payload, e o PostgREST não acha a sobrecarga.
      .rpc('rel_estoque_asof', {
        p_filial: filialParaRpc(filialId),
        p_data: data,
      })
      .order('ativo_id', { ascending: true })
      .range(from, from + PAGINA - 1)
    if (error) throw new Error(`RPC as-of falhou: ${error.message}`)
    const n = pag?.length ?? 0
    total += n
    if (n < PAGINA) break
  }
  return total
}

/** Contagem oficial do acervo vivo (count exact — não sofre max-rows). */
async function contarAtivosVivos(filialId: number | null): Promise<number> {
  let q = client
    .from('ativos')
    .select('id', { count: 'exact', head: true })
    .not('status', 'in', '("descartado","devolvido_fornecedor")')
  if (filialId) q = q.eq('filial_id', filialId)
  const { count, error } = await q
  if (error) throw new Error(`Contagem de ativos falhou: ${error.message}`)
  return count ?? 0
}

async function caso(rotulo: string, filialId: number | null, data: string) {
  console.log(`\n· ${rotulo} — as-of ${data}`)
  const doMotor = (await lerEstadoAtivos(client, filialId, data)).length
  const bruto = await contarAsofBruto(filialId, data)
  const ehFuturoOuHoje = data >= hojeISO()

  console.log(`  motor lerEstadoAtivos: ${doMotor}`)
  console.log(`  contagem paginada bruta: ${bruto}`)

  if (ehFuturoOuHoje) {
    // Fast path: o motor lê `ativos` direto, então a régua é o count exact.
    const vivos = await contarAtivosVivos(filialId)
    console.log(`  count exact de ativos vivos: ${vivos}`)
    checar(doMotor === vivos, `motor (${doMotor}) == count exact (${vivos})`)
  } else {
    checar(doMotor === bruto, `motor (${doMotor}) == bruto paginado (${bruto})`)
  }
  checar(doMotor !== PAGINA, `motor não devolveu exatamente ${PAGINA} (assinatura do corte)`)
  checar(bruto !== PAGINA, `bruto não devolveu exatamente ${PAGINA}`)
  return doMotor
}

async function main() {
  console.log('=== Validação do truncamento de 1.000 linhas (SÓ LEITURA) ===')
  console.log(`projeto: ${new URL(url).hostname.split('.')[0]} · hoje: ${hojeISO()}`)

  // 1) Estado atual (fast path) — consolidado.
  await caso('consolidado, hoje (fast path)', null, hojeISO())

  // 2) Data passada, consolidado — o caminho as-of, onde estava o bug.
  await caso('consolidado, data passada', null, '2026-08-15')

  // 3) Data passada, Matriz sozinha — prova que o corte não era só do consolidado.
  const matriz = await caso('Matriz (filial 1), data passada', 1, '2026-08-15')
  checar(matriz > PAGINA, `Matriz sozinha passa de ${PAGINA} ativos (${matriz})`)

  // 4) O comparativo do relatório ao vivo da semana atual: é o Δ que mostrava o
  //    salto fantasma de centenas.
  const semana = semanaUtilCorrente()
  const anterior = periodoAnterior(semana)
  console.log(
    `\n· relatório ao vivo consolidado — período ${semana.de}..${semana.ate}, anterior ${anterior.de}..${anterior.ate}`,
  )
  const kpis = (await lerEstadoAtivos(client, null, semana.ate)).length
  const kpisAnt = (await lerEstadoAtivos(client, null, anterior.ate)).length
  console.log(`  kpis.total: ${kpis}`)
  console.log(`  kpisAnterior.total: ${kpisAnt}`)
  console.log(`  Δ do total: ${kpis - kpisAnt >= 0 ? '+' : ''}${kpis - kpisAnt}`)
  checar(kpisAnt > PAGINA, `kpisAnterior.total > ${PAGINA} (não truncado)`)
  checar(
    Math.abs(kpis - kpisAnt) < 100,
    `Δ do total sem o salto fantasma de centenas (${kpis - kpisAnt})`,
  )

  // 5) Evidência para os vereditos da varredura que dependiam de volume real.
  console.log('\n· volumes que sustentam os vereditos da varredura')
  const { count: movs } = await client
    .from('movimentacoes')
    .select('id', { count: 'exact', head: true })
  const { count: lanc } = await client
    .from('lancamentos_item')
    .select('id', { count: 'exact', head: true })
  const { count: anot } = await client
    .from('anotacoes')
    .select('id', { count: 'exact', head: true })
  console.log(`  movimentacoes: ${movs} · lancamentos_item: ${lanc} · anotacoes: ${anot}`)
  checar(
    (movs ?? 0) > PAGINA,
    `movimentacoes já passa de ${PAGINA} — leitura ampla dessa tabela truncaria`,
  )

  console.log(
    `\n=== ${falhas === 0 ? 'TUDO OK' : `${falhas} FALHA(S)`} ===`,
  )
  process.exit(falhas === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('[validar-truncamento]', e instanceof Error ? e.message : e)
  process.exit(1)
})
