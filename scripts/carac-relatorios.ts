// scripts/carac-relatorios.ts — REDE DE SEGURANÇA da Fase 3.5 (unificação dos
// motores de relatório v1/v2). READ-ONLY. Congela a saída das agregações do
// relatório para comparar byte-a-byte ANTES × DEPOIS da refatoração.
//
// Uso:
//   npx tsx scripts/carac-relatorios.ts <saida.json>           # superfície ESTÁVEL (v2 + getKpis consolidado)
//   npx tsx scripts/carac-relatorios.ts <saida.json> --equiv   # + tabela de equivalência v1×v2 (só ANTES de remover o v1)
//
// A superfície estável é o que precisa sair IDÊNTICO depois: getSnapshotRelatorioV2
// (relatório ao vivo + geração de snapshot) e getKpis(consolidado) (dashboard).
// O módulo é importado DINAMICAMENTE para o script continuar compilando depois que
// o v1 (getSnapshotRelatorio & cia.) for removido.
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { loadEnvLocal } from './env-guard'
import { hojeISO } from '@/lib/format'
import { semanaUtilCorrente } from '@/lib/relatorios/periodo'
import type { DbClient } from '@/lib/queries/relatorios'

type Combo = { filial: string; nome: string; de: string; ate: string }

function periodos(): { nome: string; de: string; ate: string }[] {
  const hoje = hojeISO()
  const semana = semanaUtilCorrente(hoje)
  return [
    { nome: 'semana-atual', de: semana.de, ate: semana.ate }, // fast path (ate = sexta, >= hoje)
    { nome: 'ano-ate-hoje', de: '2026-01-01', ate: hoje }, // fast path
    { nome: 'tudo', de: '2000-01-01', ate: hoje }, // fast path
    { nome: 'fev-fechado', de: '2026-02-01', ate: '2026-02-28' }, // AS-OF (passado)
    { nome: 'mai-fechado', de: '2026-05-01', ate: '2026-05-31' }, // AS-OF (passado)
  ]
}

const FILIAIS = ['geral', 'matriz', 'linhares', 'eusebio']

// Ordena as chaves recursivamente → JSON estável, imune à ordem de inserção.
function estavel(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(estavel)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = estavel((v as Record<string, unknown>)[k])
    }
    return out
  }
  return v
}

function conectar(): DbClient {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) {
    console.error('[carac] faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local')
    process.exit(1)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as any
}

async function capturarEstavel(outfile: string) {
  const client = conectar()
  const rel = await import('@/lib/queries/relatorios')
  const combos: Combo[] = FILIAIS.flatMap((filial) =>
    periodos().map((p) => ({ filial, ...p })),
  )

  const v2: Record<string, unknown> = {}
  for (const c of combos) {
    const chave = `${c.filial}|${c.nome}`
    v2[chave] = await rel.getSnapshotRelatorioV2(client, c.filial, {
      de: c.de,
      ate: c.ate,
      rotulo: c.nome,
    })
  }

  // Dashboard: getKpis consolidado (null). É o único caminho v1 que sobrevive —
  // precisa sair idêntico nos 7 campos exibidos após o reroute para o estado.
  const getKpisConsolidado = await rel.getKpis(client, null as never)

  const saida = estavel({ hoje: hojeISO(), v2, getKpisConsolidado })
  writeFileSync(outfile, JSON.stringify(saida, null, 2))
  console.log(`[carac] superfície estável gravada: ${outfile}`)
  console.log(`[carac] combos v2: ${combos.length} | getKpis(consolidado): ${JSON.stringify(getKpisConsolidado)}`)
}

// --------- Equivalência v1×v2 (só ANTES de remover o v1) ---------
type Kpis = Record<string, number | undefined>
const CAMPOS_KPI = ['total', 'em_uso', 'em_estoque', 'reservado', 'em_manutencao', 'em_triagem', 'defasado']

function kpisIguais(a: Kpis, b: Kpis): boolean {
  return CAMPOS_KPI.every((k) => (a[k] ?? 0) === (b[k] ?? 0))
}
function mesmoConjunto(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = new Set(a)
  return b.every((x) => sa.has(x))
}
function ok(b: boolean): string {
  return b ? '✓' : '✗'
}

async function equivalencia() {
  const client = conectar()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rel: any = await import('@/lib/queries/relatorios')
  if (typeof rel.getSnapshotRelatorio !== 'function') {
    console.log('[equiv] getSnapshotRelatorio (v1) não existe mais — nada a comparar (v1 já removido).')
    return
  }
  const hoje = hojeISO()
  const periodo = { de: '2026-01-01', ate: hoje, rotulo: 'equiv' } // fast path → estado atual

  console.log('\n===== EQUIVALÊNCIA v1 × v2 (estado atual) =====')
  console.log('filial          kpis  categoria  disp(Σ)  reservados  manut(set)')
  let tudoOk = true
  for (const filial of FILIAIS) {
    const [v1, v2] = await Promise.all([
      rel.getSnapshotRelatorio(client, filial, periodo),
      rel.getSnapshotRelatorioV2(client, filial, periodo),
    ])
    // KPIs
    const kOk = kpisIguais(v1.kpis, v2.kpis)
    // Categoria (ContagemCategoria[] idêntico)
    const cOk = JSON.stringify(estavel(v1.estoquePorCategoria)) === JSON.stringify(estavel(v2.estoquePorCategoria))
    // Disponíveis: v1 é ItemModelo[] plano; v2 é ModelosPorCategoria[] → achata por modelo.
    const dispV1 = new Map<string, number>()
    for (const m of v1.disponiveisPorModelo) dispV1.set(m.modelo, (dispV1.get(m.modelo) ?? 0) + m.total)
    const dispV2 = new Map<string, number>()
    for (const g of v2.disponiveisPorModelo)
      for (const m of g.modelos) dispV2.set(m.modelo, (dispV2.get(m.modelo) ?? 0) + m.total)
    const dOk =
      dispV1.size === dispV2.size && [...dispV1].every(([k, v]) => dispV2.get(k) === v)
    // Reservados: mesmo shape; para ate=hoje o "último chamado ≤ hoje" == "último chamado".
    const rOk = JSON.stringify(estavel(v1.reservados)) === JSON.stringify(estavel(v2.reservados))
    // Manutenção: conjunto de patrimônios em manutenção deve bater.
    const mOk = mesmoConjunto(
      v1.emManutencao.map((x: { patrimonio: string }) => x.patrimonio),
      v2.manutencao.map((x: { patrimonio: string }) => x.patrimonio),
    )
    tudoOk = tudoOk && kOk && cOk && dOk && rOk && mOk
    console.log(
      `${filial.padEnd(15)} ${ok(kOk).padEnd(5)} ${ok(cOk).padEnd(9)} ${ok(dOk).padEnd(8)} ${ok(rOk).padEnd(11)} ${ok(mOk)}`,
    )
  }
  console.log(`\n[equiv] ${tudoOk ? '✓ TODAS as agregações v1 são reproduzidas pelo v2 (estado atual).' : '✗ HÁ DIVERGÊNCIA — investigar antes de remover o v1.'}`)
}

async function main() {
  const args = process.argv.slice(2)
  const outfile = args.find((a) => !a.startsWith('--'))
  if (!outfile) {
    console.error('uso: tsx scripts/carac-relatorios.ts <saida.json> [--equiv]')
    process.exit(1)
  }
  await capturarEstavel(outfile)
  if (args.includes('--equiv')) await equivalencia()
}

main().catch((e) => {
  console.error('[carac] ERRO:', e instanceof Error ? e.stack ?? e.message : e)
  process.exit(1)
})
