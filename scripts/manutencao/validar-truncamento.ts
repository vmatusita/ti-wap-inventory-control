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
import { periodoAnterior, semanaUtilCorrente } from '../../src/lib/relatorios/periodo'
import { hojeISO } from '../../src/lib/format'
import { chamarRpc } from '../../src/lib/supabase/rpc'
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

/**
 * Contagem paginada bruta da RPC as-of — INDEPENDENTE do motor de src/.
 *
 * 19/08/2026 (revisão, achado 2): este laço continua HAND-ROLLED de propósito,
 * mesmo existindo `paginarTodos` em src/lib/queries/relatorios/comum.ts. É a
 * decisão de projeto do docblock acima: este oráculo não pode compartilhar
 * código com o motor que ele valida, senão um defeito no paginador
 * compartilhado mentiria nos DOIS lados de toda comparação `doMotor ===
 * bruto` (ver `caso()`, mais abaixo) e a checagem perderia o valor. NÃO troque
 * por `paginarTodos` — isso reintroduziria o acoplamento que este arquivo
 * existe para evitar.
 *
 * Isso não desculpa reimplementar a paginação de qualquer jeito: até
 * 19/08/2026 este laço parava com `n < PAGINA` (PAGINA = tamanho PEDIDO por
 * página), o EXATO padrão que a v1.40.3 baniu do paginador compartilhado. Se
 * o `max-rows` do projeto Supabase (Settings → API) estiver abaixo de PAGINA
 * — por exemplo 500 —, toda página vem curta e `n < PAGINA` para na
 * PRIMEIRA. O validador que deveria PROVAR a ausência de truncamento passava
 * a cometer o mesmo corte silencioso, e as asserções contra `PAGINA` (1000)
 * não pegavam isso porque o número errado batia com o teto real do servidor,
 * não com 1000.
 *
 * Critério corrigido — o mesmo do paginador compartilhado, reescrito à mão:
 * avança por `n` (o que o servidor DE FATO devolveu, nunca o tamanho pedido)
 * e só para por página VAZIA (fim garantido, sempre seguro) ou por uma página
 * mais curta que a PRIMEIRA página não-vazia observada nesta chamada — o teto
 * efetivo do servidor não muda no meio de uma paginação, então uma página
 * mais curta que o teto já observado só pode ser a última. Nunca compare
 * contra PAGINA: é o tamanho pedido, não o que define o fim.
 */
async function contarAsofBruto(filialId: number | null, data: string): Promise<number> {
  const CAP_ANTI_LOOP = 100_000
  let total = 0
  let from = 0
  let primeiraPagina: number | null = null
  // F60 · lote 2 — o recorte é a LISTA que `rel_estoque_asof_filiais` exige (NULL nela dá ZERO
  // linhas, não o consolidado). A lista do consolidado é lida AQUI, por `listaDeTodasAsFiliais`, e
  // não por `recorteDeFiliais` de src/ — pela mesma regra do laço à mão logo abaixo: o oráculo não
  // compartilha código com o motor que ele valida.
  const filiais = filialId === null ? await listaDeTodasAsFiliais() : [filialId]
  for (;;) {
    const { data: pag, error } = await chamarRpc(client, 'rel_estoque_asof_filiais', {
      p_filiais: filiais,
      p_data: data,
    })
      .order('ativo_id', { ascending: true })
      .range(from, from + PAGINA - 1)
    if (error) throw new Error(`RPC as-of falhou: ${error.message}`)
    const n = pag?.length ?? 0
    if (n === 0) break
    total += n
    from += n
    if (primeiraPagina === null) primeiraPagina = n
    else if (n < primeiraPagina) break
    // `>` e não `>=`: o teto é sobre o EXCEDENTE. Com exatamente CAP_ANTI_LOOP
    // linhas a leitura está COMPLETA, e `>=` abortaria o script inteiro (nem
    // `caso()` nem `main()` tratam exceção) numa contagem que deu certo — o
    // mesmo off-by-one que a revisão corrigiu em `paginarTodos`.
    if (from > CAP_ANTI_LOOP)
      throw new Error(
        `contarAsofBruto: teto anti-loop atingido (${CAP_ANTI_LOOP} linhas) — abortado de ` +
          'propósito para não devolver um total truncado com cara de certo.',
      )
  }
  return total
}

/**
 * TODAS as filiais, inclusive as desativadas, em ordem de id — o consolidado das `rel_*_filiais`,
 * lido independentemente do motor. `count` exato na MESMA consulta: uma lista truncada pelo
 * `max-rows` daria um consolidado menor com cara de certo, e aqui isso LANÇA.
 */
async function listaDeTodasAsFiliais(): Promise<number[]> {
  const { data, error, count } = await client.from('filiais').select('id', { count: 'exact' }).order('id')
  if (error) throw new Error(`Leitura das filiais falhou: ${error.message}`)
  const ids = (data ?? []).map((f) => f.id)
  if (count === null || count !== ids.length || ids.length === 0)
    throw new Error(`Leitura das filiais incompleta: ${ids.length} de ${count ?? '?'}.`)
  return ids
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
  // Sem limiar sobre o Δ. Um `Math.abs(kpis - kpisAnt) < 100` reprovaria o
  // go-live de uma filial nova pela tela `admin/importar` — centenas de ativos
  // numa semana é evento LEGÍTIMO e já aconteceu (20–31/07). Um validador
  // reexecutável que acusa FALHA no caminho normal ensina quem o roda a ignorar
  // o resultado. Quem detecta o truncamento é a checagem acima (`kpisAnt` preso
  // em 1.000), e ela não depende de adivinhar quanto o acervo pode variar.
  console.log(`  (Δ é informativo — variação grande pode ser import de go-live, não truncamento)`)

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
