/**
 * ERRATA dos snapshots congelados com números truncados pelo corte de 1.000
 * linhas do PostgREST.
 *
 *   npx tsx scripts/manutencao/gerar-errata-truncamento.ts            # dry-run
 *   npx tsx scripts/manutencao/gerar-errata-truncamento.ts --executar # grava
 *
 * `relatorios_gerados` é IMUTÁVEL por regra: a v1 nunca é apagada nem editada.
 * A errata é sempre uma linha NOVA, com `versao = max+1` do mesmo
 * (periodo_de, periodo_ate, filial_id) — a UI já mostra a anterior como
 * "superada" sozinha.
 *
 * REGRA DE ELEGIBILIDADE. O último import "Substituir tudo" foi em 31/07/2026:
 * os imports de go-live APAGARAM e recriaram o acervo, então reconstruir um
 * estado as-of anterior a essa data produz número enganoso — pior que o erro
 * que se quer corrigir. Só é elegível o snapshot cujas DUAS datas reconstruídas
 * (o `periodo_ate` e o `ate` da janela anterior) sejam POSTERIORES a 31/07/2026.
 * Os snapshots de julho com `kpisAnterior = 1000` são NÃO-ERRATÁVEIS de
 * propósito — ficam como estão, e o motivo está no relatório da entrega.
 *
 * Regra 2 do CLAUDE.md: a saída imprime SÓ CONTAGENS e ids técnicos (uuid de
 * snapshot) — nenhum patrimônio, nome de colaborador ou linha de produção.
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { loadEnvLocal } from '../env-guard'
import { getSnapshotRelatorioV2 } from '../../src/lib/queries/relatorios/snapshot'
import { periodoAnterior } from '../../src/lib/relatorios/periodo'
import type { SnapshotRelatorioV2 } from '../../src/lib/relatorios/tipos'
import { formatDate } from '../../src/lib/format'
import type { DbClient } from '../../src/lib/queries/relatorios/comum'

loadEnvLocal()

const EXECUTAR = process.argv.includes('--executar')

/** Data do último import "Substituir tudo" (conferida em `import_logs`). */
const CORTE_IMPORT = '2026-07-31'

/** Marca que torna a errata idempotente: se já existe v2 com isto, não duplica. */
const MARCA_ERRATA = '[errata automática]'

const OBSERVACAO_ERRATA =
  `${MARCA_ERRATA} Correção do truncamento de 1.000 linhas: a versão anterior deste ` +
  'relatório congelou apenas os primeiros 1.000 ativos do acervo, porque a leitura que ' +
  'reconstrói o estoque numa data passada era cortada nesse limite. Os totais desta versão ' +
  'foram recalculados sobre o acervo inteiro. Ressalva 1: exclusões feitas DEPOIS da geração ' +
  'original (por exemplo, resoluções de conflito entre filiais) não são reconstruíveis ' +
  'retroativamente — um ativo apagado desde então não reaparece nestes números. Ressalva 2: ' +
  'os quadros que dependem do cadastro do equipamento (patrimônio, marca e modelo) mostram o ' +
  'cadastro COMO ESTÁ HOJE, não como estava na geração original; a seção de pendências foi ' +
  'preservada exatamente como a versão anterior a congelou.'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url || !serviceRoleKey) {
  console.error('[errata] NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.')
  process.exit(1)
}
const client = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}) as unknown as DbClient

type LinhaSnapshot = {
  id: string
  periodo_de: string
  periodo_ate: string
  filial_id: number | null
  versao: number
  gerado_em: string
  observacao: string | null
  dados: Record<string, unknown>
}

function totalDe(dados: Record<string, unknown>, chave: 'kpis' | 'kpisAnterior'): number | null {
  const k = dados[chave] as { total?: number } | undefined
  return typeof k?.total === 'number' ? k.total : null
}

async function main() {
  console.log('=== Errata dos snapshots truncados ===')
  console.log(`modo: ${EXECUTAR ? 'EXECUTAR (grava)' : 'DRY-RUN (não grava)'}`)

  const { data: todos, error } = await client
    .from('relatorios_gerados')
    .select('id, periodo_de, periodo_ate, filial_id, versao, gerado_em, observacao, dados')
    .order('periodo_de', { ascending: true })
    .order('versao', { ascending: true })
  if (error) throw new Error(`Falha ao ler snapshots: ${error.message}`)
  const linhas = (todos ?? []) as unknown as LinhaSnapshot[]
  console.log(`snapshots existentes: ${linhas.length}`)

  // Backup JSON de TODAS as linhas — FORA do repositório e DURÁVEL (autoproteção,
  // § Modo de operação do CLAUDE.md). Não vai em `tmpdir()`: o `%TEMP%` do Windows
  // é varrido sem aviso, e um backup que pode ter sumido não é backup — é um
  // caminho impresso no console. Se a errata gravar uma v2 errada, é este arquivo
  // que reconstitui o estado anterior.
  const dir = join(homedir(), 'estoque-ti-backups', 'errata-truncamento')
  mkdirSync(dir, { recursive: true })
  const arquivoBackup = join(dir, `relatorios_gerados-${CORTE_IMPORT}.json`)
  writeFileSync(arquivoBackup, JSON.stringify(linhas, null, 1), 'utf8')
  // Conferido, não suposto: o `writeFileSync` acima pode ter ido para um disco
  // cheio ou uma pasta sincronizada que rejeitou a escrita.
  const bytes = statSync(arquivoBackup).size
  if (bytes === 0) throw new Error(`Backup vazio em ${arquivoBackup} — nada será gravado.`)
  console.log(`backup durável: ${arquivoBackup} (${bytes} bytes, ${linhas.length} linhas)`)

  // A versão mais recente por (período, filial) — a errata só nasce da mais nova.
  const chave = (l: LinhaSnapshot) => `${l.periodo_de}|${l.periodo_ate}|${l.filial_id ?? -1}`
  const maisNova = new Map<string, LinhaSnapshot>()
  for (const l of linhas) {
    const atual = maisNova.get(chave(l))
    if (!atual || l.versao > atual.versao) maisNova.set(chave(l), l)
  }

  const paraGerar: LinhaSnapshot[] = []
  console.log('\n--- triagem ---')
  for (const l of [...maisNova.values()].sort((a, b) => a.periodo_de.localeCompare(b.periodo_de))) {
    const k = totalDe(l.dados, 'kpis')
    const ka = totalDe(l.dados, 'kpisAnterior')
    const anterior = periodoAnterior({ de: l.periodo_de, ate: l.periodo_ate })
    const escopo = l.filial_id === null ? 'consolidado' : `filial ${l.filial_id}`
    const rot = `${l.id.slice(0, 8)} ${l.periodo_de}..${l.periodo_ate} ${escopo} v${l.versao}`

    const truncado = k === 1000 || ka === 1000
    const datasOk = l.periodo_ate > CORTE_IMPORT && anterior.ate > CORTE_IMPORT
    const jaErratado = (l.observacao ?? '').includes(MARCA_ERRATA)

    // A ordem dos testes é a MESMA do `if` que decide `paraGerar` — senão o
    // relatório explica o snapshot por um motivo que não foi o que o excluiu.
    // A regra de data manda em tudo: ela vale inclusive para quem NÃO tem a
    // assinatura do truncamento, porque reconstruir antes do import de
    // "Substituir tudo" produziria número pior que o congelado.
    let veredito: string
    if (jaErratado) veredito = 'JÁ ERRATADO — nada a fazer (idempotência)'
    else if (!datasOk)
      veredito =
        `NÃO-ERRATÁVEL — reconstruiria ${l.periodo_ate} e ${anterior.ate}, ` +
        `não posteriores ao import de ${CORTE_IMPORT}` +
        (truncado ? ' (tem a assinatura do truncamento)' : '')
    else if (!truncado) veredito = 'sem assinatura de truncamento — será conferido'
    else veredito = 'ELEGÍVEL'

    console.log(`  ${rot} | kpis=${k} kpisAnt=${ka} | ${veredito}`)
    if (!jaErratado && datasOk) paraGerar.push(l)
  }

  if (paraGerar.length === 0) {
    console.log('\nNenhum snapshot elegível. Nada a fazer.')
    return
  }

  console.log('\n--- reconstrução com o motor corrigido ---')
  const mapeamento: { v1: string; v2: string | null; de: string; ate: string; escopo: string; antes: string; depois: string }[] = []

  // Autor resolvido UMA vez, antes do laço: o resultado é invariante e consultá-lo
  // por snapshot abria uma janela feia — se o perfil dev fosse desativado no meio
  // da execução, o `throw` de `devMaisAntigo()` pararia o lote pela metade, com
  // parte das erratas já gravada. Só no modo EXECUTAR: o dry-run não deve exigir
  // um perfil dev ativo para rodar.
  //
  // 19/08/2026 (revisão, achado 13) — segundo motivo da guarda: `paraGerar.length
  // > 0` abaixo é redundante com o `return` de `paraGerar.length === 0` logo
  // acima, e é PROPOSITAL: sem essa condição também aqui, o invariante "só chega
  // nesta linha com algo para gerar" passaria a depender de ninguém nunca separar
  // as duas linhas num refactor futuro. Sem ela (ou sem o `return` de cima),
  // reexecutar o script depois que as erratas elegíveis já foram todas geradas —
  // o caso normal de reexecução — chamaria `devMaisAntigo()` e LANÇARIA se
  // nenhum perfil dev estivesse ativo, transformando um no-op silencioso em
  // ruído. As asserções `autor!` mais abaixo continuam seguras com isto: elas só
  // são alcançadas dentro do laço sobre `paraGerar` (que não roda se ele estiver
  // vazio) e dentro do ramo `EXECUTAR` (o único em que `devMaisAntigo()` chegou a
  // rodar e `autor` deixou de ser `null`).
  const autor = EXECUTAR && paraGerar.length > 0 ? await devMaisAntigo() : null

  for (const l of paraGerar) {
    const escopo = l.filial_id === null ? 'geral' : await slugDaFilial(l.filial_id)
    const periodo = {
      de: l.periodo_de,
      ate: l.periodo_ate,
      rotulo: `${formatDate(l.periodo_de)} a ${formatDate(l.periodo_ate)}`,
    }
    // `incluirPendencias: false` NÃO é economia — é honestidade. `getPendencias`
    // não recebe período nenhum: ela conta a fila de pendências CORRENTE. Deixá-la
    // reconstruir estamparia a fila de HOJE num relatório de semanas atrás, e a
    // v2 apresentaria como "a versão corrigida daquela semana" uma seção que
    // nunca foi daquela semana. O que era as-of na v1 continua as-of na v2; o que
    // não era, a v2 herda congelado da v1 em vez de inventar.
    const novo = await getSnapshotRelatorioV2(client, escopo, periodo, false)
    novo.pendencias = (l.dados.pendencias ?? []) as SnapshotRelatorioV2['pendencias']
    const antesK = totalDe(l.dados, 'kpis')
    const antesKA = totalDe(l.dados, 'kpisAnterior')
    const depoisK = novo.kpis.total
    const depoisKA = novo.kpisAnterior.total

    const mudou = antesK !== depoisK || antesKA !== depoisKA
    console.log(
      `  ${l.id.slice(0, 8)} ${l.periodo_de}..${l.periodo_ate} ${escopo}: ` +
        `kpis ${antesK}→${depoisK} · kpisAnterior ${antesKA}→${depoisKA} ` +
        `${mudou ? '(DIVERGE — errata)' : '(idêntico — sem errata)'}`,
    )
    if (!mudou) continue

    novo.meta.observacao = OBSERVACAO_ERRATA
    const proxima = l.versao + 1
    const registro = {
      v1: l.id,
      v2: null as string | null,
      de: l.periodo_de,
      ate: l.periodo_ate,
      escopo,
      antes: `kpis=${antesK} kpisAnterior=${antesKA}`,
      depois: `kpis=${depoisK} kpisAnterior=${depoisKA}`,
    }

    if (!EXECUTAR) {
      console.log(`    [dry-run] gravaria v${proxima}`)
      mapeamento.push(registro)
      continue
    }

    const { data: inserido, error: eIns } = await client
      .from('relatorios_gerados')
      .insert({
        periodo_de: l.periodo_de,
        periodo_ate: l.periodo_ate,
        filial_id: l.filial_id,
        versao: proxima,
        dados: novo as never,
        gerado_por: autor!,
        observacao: OBSERVACAO_ERRATA,
      })
      .select('id')
      .single()
    if (eIns) throw new Error(`Falha ao inserir a errata: ${eIns.message}`)
    registro.v2 = inserido!.id
    console.log(`    gravado v${proxima}: ${inserido!.id} (autor ${autor!.slice(0, 8)})`)
    mapeamento.push(registro)
  }

  console.log('\n--- mapeamento v1 → v2 ---')
  for (const m of mapeamento) {
    console.log(`  ${m.de}..${m.ate} ${m.escopo}: ${m.v1} → ${m.v2 ?? '(dry-run)'}`)
    console.log(`      antes: ${m.antes}`)
    console.log(`      depois: ${m.depois}`)
  }
  if (!EXECUTAR) console.log('\nDRY-RUN: nada foi gravado. Rode com --executar.')
}

async function slugDaFilial(id: number): Promise<string> {
  const { data, error } = await client.from('filiais').select('slug').eq('id', id).maybeSingle()
  if (error || !data) throw new Error(`Filial ${id} não encontrada`)
  return data.slug
}

/** Perfil de cargo dev mais antigo e ativo — o autor das erratas. */
async function devMaisAntigo(): Promise<string> {
  const { data, error } = await client
    .from('profiles')
    .select('id, created_at')
    .eq('papel', 'dev')
    .eq('ativo', true)
    .is('excluido_em', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error || !data) throw new Error('Nenhum perfil dev ativo encontrado para assinar a errata.')
  return data.id
}

main().catch((e) => {
  console.error('[errata]', e instanceof Error ? e.message : e)
  process.exit(1)
})
