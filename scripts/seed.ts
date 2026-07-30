// scripts/seed.ts — popula o banco de DESENVOLVIMENTO com dados 100% FICTICIOS
// (regra 2 do CLAUDE.md). ~1.200 ativos + historico de movimentacoes coerente
// com a maquina de estados (o trigger valida cada linha). Deterministico:
// rodar de novo apos `npm run db:reset` reproduz os MESMOS dados de negocio
// (patrimonios, categorias, status, colaboradores, datas, sequencias, contagens)
// e os mesmos UUIDs (ativos e movimentacoes). Os timestamps created_at/updated_at
// dos ATIVOS vem do banco (now()/trigger) e nao sao reproduzidos byte-a-byte.
//
// ESTRATEGIA (ver resumo da OS-F1): a distribuicao de STATUS FINAL (~65% em uso,
// etc.) e a meta primaria — e o que faz a demo/os graficos terem cara de verdade
// (spec 10.1). Por isso cada ativo recebe um status-alvo e o script gera a menor
// sequencia VALIDA de movimentacoes que leva ate ele (a OS autoriza "movimentacoes
// extras no fim se preciso"). O total de movimentacoes resultante e maior que o
// "~700" citado na OS — impossivel ter ~65% em uso com so ~700 eventos sobre 1.200
// ativos, ja que o status e 100% derivado das movimentacoes. As demais metas
// (categoria, filial, status, forma mensal) sao respeitadas.
//
// F21 (29/07/2026): o seed passou a garantir tambem as CONTAS ficticias dos tres
// cargos (admin / operador / consulta), com vinculos de filial variados, e algumas
// linhas ficticias na trilha de auditoria. Sem isso o DEV so tem a conta admin do
// backfill e nao ha como ver o modelo de acesso funcionando na tela. Essa parte e
// IDEMPOTENTE (conta existente e reaproveitada), porque `reset` preserva contas.
//
// Uso: `npm run db:seed` (exige as guardas do .env.local — ver scripts/env-guard.ts).
import { fakerPT_BR as faker } from '@faker-js/faker'
import seedrandom from 'seedrandom'
import {
  assertGuardsAndGetConfig,
  createAdminClient,
  loadEnvLocal,
  type GuardedConfig,
} from './env-guard'

// ============================ CONFIG =============================

const RNG_SEED = 'wap-estoque-v1'
const FAKER_SEED = 20260710
const TOTAL_ATIVOS = 1200

type Categoria = 'notebook' | 'celular' | 'monitor' | 'desktop' | 'tablet'
type Status =
  | 'em_uso'
  | 'em_estoque'
  | 'defasado'
  | 'reservado'
  | 'descartado'
  | 'em_manutencao'
  | 'em_triagem'
type Tipo =
  | 'compra'
  | 'saida'
  | 'emprestimo'
  | 'reserva'
  | 'devolucao'
  | 'triagem_ok'
  | 'envio_manutencao'
  | 'marcar_defasado'
  | 'descarte'
  | 'transferencia'

// Proporcoes reais (spec 5 / OS-F1 3.3). Somam 1.
const CATEGORIA_DIST: [Categoria, number][] = [
  ['notebook', 0.42],
  ['celular', 0.28],
  ['monitor', 0.25],
  ['desktop', 0.04],
  ['tablet', 0.01],
]

// Distribuicao por filial (FINAL). Chaveada por slug (0007).
const FILIAL_DIST: [string, number][] = [
  ['matriz', 0.72],
  ['linhares', 0.12],
  ['cd-afonso-pena', 0.08],
  ['serra', 0.05],
  ['eusebio', 0.03],
]

// Status final desejado (OS-F1 3.3.6). Somam 1.
const STATUS_DIST: [Status, number][] = [
  ['em_uso', 0.65],
  ['em_estoque', 0.12],
  ['defasado', 0.08],
  ['reservado', 0.06],
  ['descartado', 0.04],
  ['em_manutencao', 0.03],
  ['em_triagem', 0.02],
]

// Forma da distribuicao das movimentacoes por mes (jan..jul). Pesos relativos
// (a OS cita 95,90,100,70,75,80,30 — usados como FORMA, nao valor absoluto).
const MONTHLY_SHAPE: number[] = [95, 90, 100, 70, 75, 80, 30] // indices 0..6 = jan..jul
const WINDOW_YEAR = 2026
const WINDOW_FIRST_DAY_JAN = 5 // janela: 05/01/2026
const WINDOW_LAST_DAY_JUL = 3 // ate 03/07/2026
const DIAS_NO_MES = [31, 28, 31, 30, 31, 30, 31] // 2026 nao e bissexto

const SERVICE_TAG_RATE = 0.85
const DUP_PATRIMONIO_PAIRS = 6 // 6 pares (12 ativos) com patrimonio repetido + service tag diferente
const SEM_PATRIMONIO = 25 // ativos sem patrimonio fisico -> pendencia
const COMPRA_RATE = 0.05 // ~5% dos ativos ganham uma 'compra' no periodo
const TRANSFER_RATE = 0.03 // ~3% dos ativos sofrem 'transferencia' entre filiais

const PREFIXOS = ['WAP', 'PRO', 'LEA', 'TEC'] as const
const NUM_MIN = 8000 // faixa inexistente nas planilhas reais
const NUM_MAX = 9999

const FORNECEDOR_POR_PREFIXO: Record<string, string> = {
  WAP: 'WAP',
  PRO: 'Proprinter',
  LEA: 'Leasing TI',
  TEC: 'TechSupply',
}

const MODELOS: Record<Categoria, { marca: string; modelo: string }[]> = {
  notebook: [
    { marca: 'Dell', modelo: 'Latitude 3450' },
    { marca: 'Dell', modelo: 'Latitude 5440' },
    { marca: 'Lenovo', modelo: 'ThinkPad E14' },
    { marca: 'HP', modelo: 'ProBook 445 G10' },
    { marca: 'Acer', modelo: 'TravelMate P2' },
  ],
  celular: [
    { marca: 'Samsung', modelo: 'Galaxy A16' },
    { marca: 'Samsung', modelo: 'Galaxy A55' },
    { marca: 'Motorola', modelo: 'Moto G84' },
    { marca: 'Xiaomi', modelo: 'Redmi 13' },
  ],
  monitor: [
    { marca: 'Dell', modelo: 'P2422H' },
    { marca: 'LG', modelo: '24MK430H' },
    { marca: 'Samsung', modelo: 'LF24T350' },
    { marca: 'AOC', modelo: '24B2H' },
  ],
  desktop: [
    { marca: 'Dell', modelo: 'OptiPlex 3000' },
    { marca: 'Lenovo', modelo: 'ThinkCentre M70q' },
    { marca: 'HP', modelo: 'ProDesk 400 G9' },
  ],
  tablet: [
    { marca: 'Samsung', modelo: 'Galaxy Tab A9' },
    { marca: 'Lenovo', modelo: 'Tab M10' },
  ],
}

const SETORES = [
  'TI',
  'RH',
  'Financeiro',
  'Comercial',
  'Logística',
  'Produção',
  'Diretoria',
  'Marketing',
  'Compras',
  'Qualidade',
  'Fiscal',
  'PCP',
]
const MEMORIAS = ['8 GB', '16 GB', '32 GB']
const ARMAZENAMENTOS = ['256 GB SSD', '512 GB SSD', '1 TB SSD']
const PROCESSADORES = ['Intel i5', 'Intel i7', 'Ryzen 5', 'Ryzen 7']
const ACESSORIOS = ['carregador', 'mochila', 'mouse', 'teclado', 'mousepad']

const MOTIVO_SAIDA: [string, number][] = [
  ['novo_colaborador', 0.55],
  ['troca_upgrade', 0.15],
  ['monitor_adicional', 0.08],
  ['uso_compartilhado', 0.07],
  ['troca_titular', 0.05],
  ['reposicao', 0.05],
  ['assistencia', 0.03],
  ['outro', 0.02],
]
const MOTIVO_DEVOLUCAO: [string, number][] = [
  ['desligamento', 0.7],
  ['troca_upgrade', 0.18],
  ['afastamento', 0.05],
  ['garantia', 0.03],
  ['manutencao', 0.02],
  ['outro', 0.02],
]

// ---- Itens por quantidade (F3B) ----
type GrupoItem = 'acessorio' | 'componente'
type TipoLanc = 'entrada' | 'saida' | 'reserva' | 'liberacao' | 'ajuste'

// Catalogo ~25 itens — nomes GENERICOS de produto (regra 2: nada real). Plano
// §3.8: memorias separadas por DDR e tamanho; "kit teclado+mouse" e item proprio.
// `ordem` = posicao no array (o admin ajusta depois).
const ITENS_CATALOGO: { nome: string; grupo: GrupoItem }[] = [
  { nome: 'Fone de ouvido', grupo: 'acessorio' },
  { nome: 'Headset', grupo: 'acessorio' },
  { nome: 'Mochila para notebook', grupo: 'acessorio' },
  { nome: 'Teclado USB', grupo: 'acessorio' },
  { nome: 'Mouse USB', grupo: 'acessorio' },
  { nome: 'Kit teclado + mouse', grupo: 'acessorio' },
  { nome: 'Mousepad', grupo: 'acessorio' },
  { nome: 'Hub USB-C', grupo: 'acessorio' },
  { nome: 'Adaptador USB-C', grupo: 'acessorio' },
  { nome: 'Carregador Type-C', grupo: 'acessorio' },
  { nome: 'Carregador micro-USB', grupo: 'acessorio' },
  { nome: 'Cabo HDMI', grupo: 'acessorio' },
  { nome: 'Webcam', grupo: 'acessorio' },
  { nome: 'Suporte para notebook', grupo: 'acessorio' },
  { nome: 'SSD 256 GB', grupo: 'componente' },
  { nome: 'SSD 512 GB', grupo: 'componente' },
  { nome: 'SSD 1 TB', grupo: 'componente' },
  { nome: 'Memória notebook DDR4 4 GB', grupo: 'componente' },
  { nome: 'Memória notebook DDR4 8 GB', grupo: 'componente' },
  { nome: 'Memória notebook DDR4 16 GB', grupo: 'componente' },
  { nome: 'Memória notebook DDR5 8 GB', grupo: 'componente' },
  { nome: 'Memória notebook DDR5 16 GB', grupo: 'componente' },
  { nome: 'Memória desktop DDR3 8 GB', grupo: 'componente' },
  { nome: 'Memória desktop DDR4 8 GB', grupo: 'componente' },
  { nome: 'Memória desktop DDR4 16 GB', grupo: 'componente' },
]

type ItemSeed = { id: number; nome: string; grupo: GrupoItem }
type LancRow = {
  item_id: number
  filial_id: number
  tipo: TipoLanc
  quantidade: number
  chamado: string | null
  colaborador: string | null
  data: string
  observacao: string | null
}

// Micro-narrativas de manutencao (o "texto vermelho" do e-mail) — ficticias.
const ANOTACAO_PROBLEMAS = [
  'problema de tela',
  'não liga',
  'teclado com defeito',
  'bateria não segura carga',
  'superaquecimento',
  'porta USB danificada',
]
const ANOTACAO_PASSOS: ((p: string) => string)[] = [
  (p) => `Recolhido — ${p}.`,
  () => 'Aberto chamado com a assistência técnica.',
  () => 'Cotação solicitada ao fornecedor.',
  () => 'Aguardando aprovação da NF-e.',
  () => 'Peça a caminho — previsão para os próximos dias.',
  () => 'Reparo em andamento na assistência.',
]

// ============================ RNG / HELPERS =============================

const rng = seedrandom(RNG_SEED)

function randInt(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}
function chance(p: number): boolean {
  return rng() < p
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}
function pickWeighted<T>(entries: [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [v, w] of entries) {
    r -= w
    if (r <= 0) return v
  }
  return entries[entries.length - 1][0]
}
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// UUID v4 deterministico (a partir da rng) — mantem os ids estaveis entre rodadas.
function detUuid(): string {
  const b: number[] = []
  for (let i = 0; i < 16; i++) b.push(Math.floor(rng() * 256))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = b.map((x) => x.toString(16).padStart(2, '0'))
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`
}

// Distribui `total` entre as chaves respeitando os pesos (maior resto) — soma exata.
function allocate<K>(total: number, dist: [K, number][]): [K, number][] {
  const raw = dist.map(([k, w]) => ({ k, exact: w * total }))
  const floored = raw.map((r) => ({ k: r.k, n: Math.floor(r.exact), frac: r.exact - Math.floor(r.exact) }))
  let used = floored.reduce((s, r) => s + r.n, 0)
  const byFrac = [...floored].sort((a, b) => b.frac - a.frac)
  let i = 0
  while (used < total) {
    byFrac[i % byFrac.length].n++
    used++
    i++
  }
  return floored.map((r) => [r.k, r.n])
}

// Monta um array de `total` chaves seguindo a distribuicao e embaralha.
function distributedPool<K>(total: number, dist: [K, number][]): K[] {
  const pool: K[] = []
  for (const [k, n] of allocate(total, dist)) for (let i = 0; i < n; i++) pool.push(k)
  return shuffle(pool)
}

function pad7(n: number): string {
  return String(n).padStart(7, '0')
}

// Ordinais do dia no ano (1=01/01). Offset = dias antes do mes (jan..jul).
const MONTH_OFFSET = [0, 31, 59, 90, 120, 151, 181]
const WIN_MIN_ORD = MONTH_OFFSET[0] + WINDOW_FIRST_DAY_JAN // 05/01 = 5
const WIN_MAX_ORD = MONTH_OFFSET[6] + WINDOW_LAST_DAY_JUL // 03/07 = 184

function ordToDate(ord: number): string {
  let m = 6
  while (m > 0 && ord <= MONTH_OFFSET[m]) m--
  const day = ord - MONTH_OFFSET[m]
  return `${WINDOW_YEAR}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
function sampleOrd(monthIdx: number): number {
  const min = monthIdx === 0 ? WINDOW_FIRST_DAY_JAN : 1
  const max = monthIdx === 6 ? WINDOW_LAST_DAY_JUL : DIAS_NO_MES[monthIdx]
  return MONTH_OFFSET[monthIdx] + randInt(min, max)
}
// Sorteia `n` datas seguindo a forma mensal, ESTRITAMENTE crescentes (a linha do
// tempo de um ativo nunca tem dois passos no mesmo dia) e dentro da janela.
function sortedDates(n: number): string[] {
  if (n === 0) return []
  const monthEntries: [number, number][] = MONTHLY_SHAPE.map((w, i) => [i, w])
  const ords: number[] = []
  for (let i = 0; i < n; i++) ords.push(sampleOrd(pickWeighted(monthEntries)))
  ords.sort((a, b) => a - b)
  for (let i = 1; i < ords.length; i++) if (ords[i] <= ords[i - 1]) ords[i] = ords[i - 1] + 1
  if (ords[ords.length - 1] > WIN_MAX_ORD) {
    const shift = ords[ords.length - 1] - WIN_MAX_ORD
    for (let i = 0; i < ords.length; i++) ords[i] = Math.max(WIN_MIN_ORD, ords[i] - shift)
  }
  return ords.map(ordToDate)
}

function motivoSaida(categoria: Categoria): string {
  const m = pickWeighted(MOTIVO_SAIDA)
  return m === 'monitor_adicional' && categoria !== 'monitor' ? 'novo_colaborador' : m
}
function termoSaida(): { termo: 'sim' | 'nao' | 'enviado' | null } {
  return { termo: pickWeighted<'sim' | 'nao' | 'enviado' | null>([
    ['sim', 0.55],
    ['enviado', 0.2],
    ['nao', 0.15],
    [null, 0.1],
  ]) }
}

// ============================ MODELOS DE DADOS =============================

type Step = {
  tipo: Tipo
  motivo?: string | null
  colaborador?: string | null
  setor?: string | null
  chamado?: string | null
  termo?: 'sim' | 'nao' | 'enviado' | null
  itens?: string[] | null
  destinoFilialId?: number // transferencia
  data?: string
}

type Ativo = {
  id: string
  patrimonio: string
  patrimonio_original: string | null
  categoria: Categoria
  marca: string | null
  modelo: string | null
  service_tag: string | null
  hostname: string | null
  memoria: string | null
  armazenamento: string | null
  processador: string | null
  fornecedor: string | null
  filial_id: number // INICIAL (transferencias movem ate a filial final)
  pendencia: string | null
  origem: string
  // metadados de geracao (nao vao pro banco):
  _statusAlvo: Status
  _filialFinalSlug: string
  _steps: Step[]
}

function novoColaborador(): { colaborador: string; setor: string; chamado: string | null } {
  return {
    colaborador: faker.person.fullName(),
    setor: pick(SETORES),
    chamado: chance(0.6) ? `CH${randInt(10000, 99999)}` : null,
  }
}

function itensFaltantes(): string[] | null {
  if (!chance(0.1)) return null
  const qtd = randInt(1, 2)
  return shuffle([...ACESSORIOS]).slice(0, qtd)
}

// Sequencia de movimentacoes que leva de em_estoque ao status alvo.
function buildSteps(status: Status, categoria: Categoria): Step[] {
  const steps: Step[] = []
  const saida = (): Step => {
    const c = novoColaborador()
    return {
      tipo: 'saida',
      motivo: motivoSaida(categoria),
      colaborador: c.colaborador,
      setor: c.setor,
      chamado: c.chamado,
      termo: termoSaida().termo,
    }
  }
  const devolucao = (afterEmprestimo = false): Step => ({
    tipo: 'devolucao',
    motivo: afterEmprestimo ? 'fim_emprestimo' : pickWeighted(MOTIVO_DEVOLUCAO),
    itens: itensFaltantes(),
  })
  const triagemOk = (): Step => ({ tipo: 'triagem_ok' })

  switch (status) {
    case 'em_uso': {
      if (chance(0.3)) {
        steps.push(saida(), devolucao(), triagemOk())
      }
      steps.push(saida())
      break
    }
    case 'em_estoque': {
      const r = rng()
      if (r < 0.4) {
        // sem historico (ativo parado em estoque)
      } else if (r < 0.7) {
        steps.push(saida(), devolucao(), triagemOk())
      } else {
        const c = novoColaborador()
        steps.push(
          { tipo: 'emprestimo', motivo: 'uso_compartilhado', colaborador: c.colaborador, setor: c.setor },
          devolucao(true),
          triagemOk(),
        )
      }
      break
    }
    case 'reservado': {
      if (chance(0.2)) steps.push(saida(), devolucao(), triagemOk())
      const c = novoColaborador()
      steps.push({ tipo: 'reserva', motivo: 'novo_colaborador', colaborador: c.colaborador, setor: c.setor, chamado: c.chamado })
      break
    }
    case 'em_manutencao': {
      if (chance(0.5)) {
        steps.push({ tipo: 'envio_manutencao', motivo: pick(['manutencao', 'assistencia']) })
      } else {
        steps.push(saida(), { tipo: 'envio_manutencao', motivo: pick(['manutencao', 'assistencia']) })
      }
      break
    }
    case 'em_triagem': {
      steps.push(saida(), devolucao())
      break
    }
    case 'defasado': {
      if (chance(0.5)) steps.push({ tipo: 'marcar_defasado' })
      else steps.push(saida(), devolucao(), triagemOk(), { tipo: 'marcar_defasado' })
      break
    }
    case 'descartado': {
      const r = rng()
      if (r < 0.4) steps.push({ tipo: 'descarte' })
      else if (r < 0.7) steps.push({ tipo: 'marcar_defasado' }, { tipo: 'descarte' })
      else steps.push(saida(), devolucao(), triagemOk(), { tipo: 'descarte' })
      break
    }
  }
  return steps
}

// ============================ GERACAO =============================

function gerarAtivos(filialIdBySlug: Map<string, number>): Ativo[] {
  const categorias = distributedPool(TOTAL_ATIVOS, CATEGORIA_DIST)
  const filiaisFinal = distributedPool(TOTAL_ATIVOS, FILIAL_DIST)
  const statuses = distributedPool(TOTAL_ATIVOS, STATUS_DIST)

  // Sorteio de papeis especiais por indice.
  const indices = shuffle([...Array(TOTAL_ATIVOS).keys()])
  const semPatrimonioIdx = new Set(indices.slice(0, SEM_PATRIMONIO))
  const dupIdx = indices.slice(SEM_PATRIMONIO, SEM_PATRIMONIO + DUP_PATRIMONIO_PAIRS * 2)
  const dupPairOf = new Map<number, number>() // idx -> id do par (0..5)
  for (let p = 0; p < DUP_PATRIMONIO_PAIRS; p++) {
    dupPairOf.set(dupIdx[p * 2], p)
    dupPairOf.set(dupIdx[p * 2 + 1], p)
  }

  // Pool de patrimonios unicos (prefixo + numero na faixa ficticia).
  const combos: string[] = []
  for (const pref of PREFIXOS) for (let n = NUM_MIN; n <= NUM_MAX; n++) combos.push(`${pref}${pad7(n)}`)
  shuffle(combos)
  let comboAt = 0
  const nextPatrimonio = () => combos[comboAt++]
  const dupPatrimonio: string[] = Array.from({ length: DUP_PATRIMONIO_PAIRS }, () => nextPatrimonio())

  let semPatCounter = 0
  const usedServiceTags = new Set<string>()
  const newServiceTag = (): string => {
    let t = faker.string.alphanumeric({ length: 7, casing: 'upper' })
    while (usedServiceTags.has(t)) t = faker.string.alphanumeric({ length: 7, casing: 'upper' })
    usedServiceTags.add(t)
    return t
  }

  const ativos: Ativo[] = []
  for (let i = 0; i < TOTAL_ATIVOS; i++) {
    const categoria = categorias[i]
    const status = statuses[i]
    const filialFinalSlug = filiaisFinal[i]
    const filialFinalId = filialIdBySlug.get(filialFinalSlug)!
    const mm = pick(MODELOS[categoria])

    const isSemPat = semPatrimonioIdx.has(i)
    const dupPair = dupPairOf.get(i)

    let patrimonio: string
    let service_tag: string | null
    let pendencia: string | null = null
    let fornecedor: string | null

    if (isSemPat) {
      semPatCounter++
      patrimonio = `PEND${pad7(semPatCounter)}`
      pendencia = 'sem patrimônio físico'
      service_tag = chance(0.5) ? newServiceTag() : null
      fornecedor = null
    } else if (dupPair !== undefined) {
      patrimonio = dupPatrimonio[dupPair]
      service_tag = newServiceTag() // pares repetidos SEMPRE com service tag distinta
      fornecedor = FORNECEDOR_POR_PREFIXO[patrimonio.slice(0, 3)] ?? null
    } else {
      patrimonio = nextPatrimonio()
      service_tag = chance(SERVICE_TAG_RATE) ? newServiceTag() : null
      fornecedor = FORNECEDOR_POR_PREFIXO[patrimonio.slice(0, 3)] ?? null
    }

    const isPcLike = categoria === 'notebook' || categoria === 'desktop'
    ativos.push({
      id: detUuid(),
      patrimonio,
      patrimonio_original: isSemPat ? null : patrimonio,
      categoria,
      marca: mm.marca,
      modelo: mm.modelo,
      service_tag,
      hostname: isPcLike ? `WAP-${categoria === 'notebook' ? 'NB' : 'PC'}-${randInt(1000, 9999)}` : null,
      memoria: isPcLike ? pick(MEMORIAS) : null,
      armazenamento: isPcLike ? pick(ARMAZENAMENTOS) : null,
      processador: isPcLike ? pick(PROCESSADORES) : null,
      fornecedor,
      filial_id: filialFinalId, // pode virar filial inicial diferente se houver transferencia (abaixo)
      pendencia,
      origem: 'cadastro',
      _statusAlvo: status,
      _filialFinalSlug: filialFinalSlug,
      _steps: buildSteps(status, categoria),
    })
  }

  // 'compra' em ~5% dos ativos (evento de entrada no periodo) — no inicio da cadeia.
  for (const a of ativos) {
    if (chance(COMPRA_RATE)) a._steps.unshift({ tipo: 'compra', motivo: null })
  }

  // 'transferencia' em ~3%: a filial FINAL e a alvo; a inicial passa a ser outra,
  // e injetamos uma transferencia (inicial -> final) apos a eventual compra.
  const filialIds = FILIAL_DIST.map(([slug]) => filialIdBySlug.get(slug)!)
  for (const a of ativos) {
    if (!chance(TRANSFER_RATE)) continue
    const outras = filialIds.filter((id) => id !== a.filial_id)
    const inicial = pick(outras)
    const finalId = a.filial_id
    a.filial_id = inicial // inicial passa a ser outra filial
    const insertAt = a._steps[0]?.tipo === 'compra' ? 1 : 0
    a._steps.splice(insertAt, 0, { tipo: 'transferencia', destinoFilialId: finalId })
  }

  // Datas: por ativo, sorteia N datas na forma mensal, ordena e casa com os passos.
  for (const a of ativos) {
    const datas = sortedDates(a._steps.length)
    a._steps.forEach((s, k) => (s.data = datas[k]))
  }

  return ativos
}

// ============================ INSERCAO =============================

async function inserirAtivos(db: ReturnType<typeof createAdminClient>, ativos: Ativo[]) {
  const BATCH = 500
  for (let i = 0; i < ativos.length; i += BATCH) {
    const rows = ativos.slice(i, i + BATCH).map((a) => ({
      id: a.id,
      patrimonio: a.patrimonio,
      patrimonio_original: a.patrimonio_original,
      categoria: a.categoria,
      marca: a.marca,
      modelo: a.modelo,
      service_tag: a.service_tag,
      hostname: a.hostname,
      memoria: a.memoria,
      armazenamento: a.armazenamento,
      processador: a.processador,
      fornecedor: a.fornecedor,
      filial_id: a.filial_id,
      pendencia: a.pendencia,
      origem: a.origem,
      // status fica no default 'em_estoque'; as movimentacoes derivam o resto.
    }))
    const { error } = await db.from('ativos').insert(rows)
    if (error) throw new Error(`Insert de ativos falhou (lote ${i}): ${error.message}`)
  }
  console.log(`[seed] ${ativos.length} ativos inseridos.`)
}

// Movimentacoes: linha a linha, POR ATIVO na ordem cronologica dos passos —
// o trigger le o status corrente do ativo e valida a transicao. A filial da
// movimentacao e a CORRENTE do ativo; so a transferencia a altera (origem ->
// destino), entao rastreamos a filial corrente enquanto caminhamos os passos.
async function inserirMovimentacoes(
  db: ReturnType<typeof createAdminClient>,
  ativos: Ativo[],
  criadoPor: string,
): Promise<number> {
  let total = 0
  let done = 0
  // F14: o envio_manutencao passa a EXIGIR chamado_fornecedor (check da migration 0045).
  // Valor ficticio e deterministico por ORDEM de insercao (nao consome a rng — nao
  // desloca a sequencia deterministica do resto do seed).
  let fornSeq = 0
  for (const a of ativos) {
    let filialCorrente = a.filial_id // inicial
    for (const s of a._steps) {
      const row = {
        id: detUuid(), // UUID deterministico (como nos ativos)
        ativo_id: a.id,
        tipo: s.tipo,
        motivo: s.motivo ?? null,
        data: s.data,
        filial_id: filialCorrente, // origem, no caso da transferencia
        filial_destino_id: s.tipo === 'transferencia' ? s.destinoFilialId : null,
        colaborador: s.colaborador ?? null,
        setor: s.setor ?? null,
        chamado: s.chamado ?? null,
        chamado_fornecedor:
          s.tipo === 'envio_manutencao'
            ? `OS-FORN-${String(++fornSeq).padStart(5, '0')}`
            : null,
        termo_assinado: s.termo ?? null,
        // termo_data acompanha o termo quando ele foi gerado/assinado (spec 5)
        termo_data: s.termo === 'sim' || s.termo === 'enviado' ? s.data : null,
        itens_faltantes: s.itens ?? null,
        criado_por: criadoPor,
        // created_at reflete a data historica do evento (movimentacoes recentes = jul)
        created_at: `${s.data}T12:00:00Z`,
      }
      const { error } = await db.from('movimentacoes').insert(row)
      if (error) {
        throw new Error(
          `Insert de movimentacao falhou (ativo ${a.patrimonio}, tipo ${s.tipo}): ${error.message}`,
        )
      }
      if (s.tipo === 'transferencia' && s.destinoFilialId) filialCorrente = s.destinoFilialId
      total++
    }
    done++
    if (done % 200 === 0) console.log(`[seed] movimentacoes: ${done}/${ativos.length} ativos processados...`)
  }
  console.log(`[seed] ${total} movimentacoes inseridas.`)
  return total
}

// A pendencia "sem patrimonio fisico" e intrinseca do ativo (nao tem etiqueta),
// mas o trigger zera pendencia em triagem_ok. Reaplicamos no estado FINAL para
// garantir os 25 exigidos pela OS-F1 3.3.4, independente da cadeia de cada um.
async function reforcarPendenciaSemPatrimonio(
  db: ReturnType<typeof createAdminClient>,
  ativos: Ativo[],
) {
  const ids = ativos.filter((a) => a.patrimonio.startsWith('PEND')).map((a) => a.id)
  if (ids.length === 0) return
  const { error } = await db
    .from('ativos')
    .update({ pendencia: 'sem patrimônio físico' })
    .in('id', ids)
  if (error) throw new Error(`Falha ao reforcar pendencia sem-patrimonio: ${error.message}`)
  console.log(`[seed] pendencia "sem patrimônio físico" reaplicada em ${ids.length} ativos.`)
}

// ============================ DEVOLUCAO AO FORNECEDOR (F14) =============================
// 2 casos ficticios do fluxo novo (para o relatorio e a ficha renderizarem o caminho):
//   * 1 devolvido ao fornecedor SEM substituto (fornecedor nao repos — credito);
//   * 1 devolvido COM substituto vinculado (substitui_ativo_id + fornecedor herdado).
// Patrimonios fora da faixa da geracao principal (8000-9999) para nao colidir. Ids
// gerados pelo banco (sem consumir a rng). Cada movimentacao passa pelo trigger da
// maquina de estados (valida a transicao). Datas dentro da janela do seed (jun-jul).
async function inserirCasosDevolucaoFornecedor(
  db: ReturnType<typeof createAdminClient>,
  filialIdBySlug: Map<string, number>,
  criadoPor: string,
) {
  const matriz = filialIdBySlug.get('matriz')!
  const insAtivo = async (row: Record<string, unknown>): Promise<string> => {
    const { data, error } = await db.from('ativos').insert(row).select('id').single()
    if (error) throw new Error(`F14 seed (ativo): ${error.message}`)
    return (data as { id: string }).id
  }
  const insMov = async (row: Record<string, unknown>) => {
    const { error } = await db.from('movimentacoes').insert(row)
    if (error) throw new Error(`F14 seed (mov ${String(row.tipo)}): ${error.message}`)
  }

  // Caso 1 — devolvido ao fornecedor SEM substituto (fornecedor nao repos).
  const a1 = await insAtivo({
    patrimonio: 'WAP0001401', patrimonio_original: 'WAP0001401', categoria: 'notebook',
    marca: 'Dell', modelo: 'Latitude 5440', service_tag: 'F14A1', hostname: 'WAP-NB-1401',
    memoria: '16 GB', armazenamento: '512 GB SSD', processador: 'Intel i7',
    fornecedor: 'TechSupply', filial_id: matriz, origem: 'cadastro',
  })
  await insMov({ ativo_id: a1, tipo: 'compra', data: '2026-06-05', filial_id: matriz, criado_por: criadoPor, created_at: '2026-06-05T12:00:00Z' })
  await insMov({ ativo_id: a1, tipo: 'envio_manutencao', data: '2026-06-20', filial_id: matriz, chamado: '77401', chamado_fornecedor: 'OS-FORN-4401', criado_por: criadoPor, created_at: '2026-06-20T12:00:00Z' })
  await insMov({ ativo_id: a1, tipo: 'devolucao_fornecedor', data: '2026-07-01', filial_id: matriz, chamado: '77401', chamado_fornecedor: 'OS-FORN-4401', observacao: 'Sem conserto — fornecedor não repôs (crédito).', criado_por: criadoPor, created_at: '2026-07-01T12:00:00Z' })

  // Caso 2 — devolvido COM substituto vinculado (fornecedor do substituto = do antigo).
  const a2 = await insAtivo({
    patrimonio: 'WAP0001402', patrimonio_original: 'WAP0001402', categoria: 'celular',
    marca: 'Samsung', modelo: 'Galaxy A55', service_tag: 'F14A2',
    fornecedor: 'Proprinter', filial_id: matriz, origem: 'cadastro',
  })
  await insMov({ ativo_id: a2, tipo: 'compra', data: '2026-06-06', filial_id: matriz, criado_por: criadoPor, created_at: '2026-06-06T12:00:00Z' })
  await insMov({ ativo_id: a2, tipo: 'envio_manutencao', data: '2026-06-22', filial_id: matriz, chamado: '77402', chamado_fornecedor: 'OS-FORN-4402', criado_por: criadoPor, created_at: '2026-06-22T12:00:00Z' })
  await insMov({ ativo_id: a2, tipo: 'devolucao_fornecedor', data: '2026-07-02', filial_id: matriz, chamado: '77402', chamado_fornecedor: 'OS-FORN-4402', observacao: 'Sem conserto — trocado por equipamento novo.', criado_por: criadoPor, created_at: '2026-07-02T12:00:00Z' })
  const sub = await insAtivo({
    patrimonio: 'WAP0001502', patrimonio_original: 'WAP0001502', categoria: 'celular',
    marca: 'Samsung', modelo: 'Galaxy A55', service_tag: 'F14S2',
    fornecedor: 'Proprinter', filial_id: matriz, origem: 'cadastro', substitui_ativo_id: a2,
  })
  // F15: o substituto NASCE por `troca` (não `compra`) — aparece nas Entradas rotulado "Troca".
  await insMov({ ativo_id: sub, tipo: 'troca', data: '2026-07-02', filial_id: matriz, observacao: 'Substituto de WAP0001402 (devolvido ao fornecedor).', criado_por: criadoPor, created_at: '2026-07-02T12:00:00Z' })

  // F15 (C1) — 1 ativo IMPORTADO sem service tag: nasce com a pendência 'sem service tag'
  // (espelho da F7E do patrimônio). Serve p/ /pendencias, a lista e o dialog "Definir service
  // tag" renderizarem em DEV. origem 'importacao' + compra de abertura marcada (fora das Entradas).
  const semTag = await insAtivo({
    patrimonio: 'WAP0001403', patrimonio_original: 'WAP0001403', categoria: 'notebook',
    marca: 'Lenovo', modelo: 'ThinkPad E14', service_tag: null,
    fornecedor: 'TechSupply', filial_id: matriz, origem: 'importacao',
    pendencia: 'sem service tag',
  })
  await insMov({ ativo_id: semTag, tipo: 'compra', data: '2026-07-03', filial_id: matriz, observacao: 'import startup 03/07/2026', criado_por: criadoPor, created_at: '2026-07-03T12:00:00Z' })

  console.log('[seed] 2 casos de devolucao ao fornecedor (1 sem substituto, 1 com substituto por troca) + 1 importado sem service tag.')
}

// ============================ ITENS POR QUANTIDADE (F3B) =============================

async function inserirItens(
  db: ReturnType<typeof createAdminClient>,
): Promise<ItemSeed[]> {
  const rows = ITENS_CATALOGO.map((c, i) => ({ nome: c.nome, grupo: c.grupo, ordem: i + 1 }))
  const { data, error } = await db.from('itens').insert(rows).select('id, nome, grupo')
  if (error) throw new Error(`Insert de itens falhou: ${error.message}`)
  console.log(`[seed] ${data?.length ?? 0} itens (catalogo) inseridos.`)
  return (data ?? []) as ItemSeed[]
}

// Casos GARANTIDOS (independentes do rng): 1 item com FALTA (atrelados > saldo,
// o "faltam N" do e-mail) e 1 com saldo ZERADO — exigidos pela OS 3.2.
function casosGarantidos(
  itens: ItemSeed[],
  filialIdBySlug: Map<string, number>,
): LancRow[] {
  const rows: LancRow[] = []
  const matriz = filialIdBySlug.get('matriz')!
  const linhares = filialIdBySlug.get('linhares')!
  const mouse = itens.find((i) => i.nome === 'Mouse USB')
  const carregador = itens.find((i) => i.nome === 'Carregador micro-USB')

  // FALTA: Mouse @ matriz -> saldo 5, atrelados 20 -> faltam 15.
  if (mouse) {
    const seq: [TipoLanc, number, string | null, string][] = [
      ['entrada', 40, null, '2026-01-08'],
      ['saida', 15, null, '2026-02-12'],
      ['saida', 20, null, '2026-03-20'],
      ['reserva', 12, '48870', '2026-05-05'],
      ['reserva', 8, '48915', '2026-06-18'],
    ]
    for (const [tipo, quantidade, chamado, data] of seq) {
      rows.push({ item_id: mouse.id, filial_id: matriz, tipo, quantidade, chamado, colaborador: null, data, observacao: null })
    }
  }
  // SALDO ZERADO: Carregador micro-USB @ linhares.
  if (carregador) {
    rows.push({ item_id: carregador.id, filial_id: linhares, tipo: 'entrada', quantidade: 12, chamado: null, colaborador: null, data: '2026-01-15', observacao: null })
    rows.push({ item_id: carregador.id, filial_id: linhares, tipo: 'saida', quantidade: 12, chamado: null, colaborador: null, data: '2026-03-22', observacao: null })
  }
  return rows
}

// Gera lancamentos VALIDOS (o trigger valida cada linha): por item×filial, uma
// cadeia cronologica que mantem saldo >= 0 e reserva liquida >= 0 por chamado.
// Sazonalidade reaproveita a forma mensal (sortedDates). `pular` = pares
// item×filial ja cobertos pelos casos garantidos (nao sobrepor).
function gerarLancamentos(
  itens: ItemSeed[],
  filialIdBySlug: Map<string, number>,
  pular: Set<string>,
): LancRow[] {
  const rows: LancRow[] = []
  const matriz = filialIdBySlug.get('matriz')!
  const outrasFiliais = [...filialIdBySlug.entries()]
    .filter(([s]) => s !== 'matriz')
    .map(([, id]) => id)
  const novoChamado = () => `${randInt(20000, 99999)}`

  function cadeia(itemId: number, filialId: number, grupo: GrupoItem, nEventos: number) {
    if (pular.has(`${itemId}:${filialId}`)) return
    let saldo = 0
    const reservaAberta = new Map<string, number>() // chamado -> reserva liquida (reserva - liberacao)
    const eventos: Omit<LancRow, 'data'>[] = []

    const inicial = grupo === 'acessorio' ? randInt(20, 80) : randInt(6, 30)
    saldo += inicial
    eventos.push({ item_id: itemId, filial_id: filialId, tipo: 'entrada', quantidade: inicial, chamado: null, colaborador: null, observacao: null })

    for (let i = 0; i < nEventos; i++) {
      const r = rng()
      if (r < 0.45 && saldo > 0) {
        const q = randInt(1, Math.min(saldo, grupo === 'acessorio' ? 8 : 4))
        // as vezes a saida cita um chamado com reserva aberta (consome atrelados)
        let chamado: string | null = null
        const abertos = [...reservaAberta.entries()].filter(([, n]) => n > 0)
        if (abertos.length && chance(0.5)) chamado = pick(abertos)[0]
        saldo -= q
        eventos.push({ item_id: itemId, filial_id: filialId, tipo: 'saida', quantidade: q, chamado, colaborador: chance(0.4) ? faker.person.fullName() : null, observacao: null })
      } else if (r < 0.65) {
        const q = grupo === 'acessorio' ? randInt(5, 40) : randInt(4, 16)
        saldo += q
        eventos.push({ item_id: itemId, filial_id: filialId, tipo: 'entrada', quantidade: q, chamado: null, colaborador: null, observacao: null })
      } else if (r < 0.85) {
        const q = randInt(1, 6)
        const ch = novoChamado()
        reservaAberta.set(ch, (reservaAberta.get(ch) ?? 0) + q)
        eventos.push({ item_id: itemId, filial_id: filialId, tipo: 'reserva', quantidade: q, chamado: ch, colaborador: chance(0.4) ? faker.person.fullName() : null, observacao: null })
      } else if (r < 0.92) {
        const abertos = [...reservaAberta.entries()].filter(([, n]) => n > 0)
        if (abertos.length) {
          const [ch, n] = pick(abertos)
          const q = randInt(1, n)
          reservaAberta.set(ch, n - q)
          eventos.push({ item_id: itemId, filial_id: filialId, tipo: 'liberacao', quantidade: q, chamado: ch, colaborador: null, observacao: null })
        }
      } else {
        const negativo = saldo > 0 && chance(0.5)
        const delta = negativo ? -randInt(1, Math.min(saldo, 3)) : randInt(1, 5)
        saldo += delta
        eventos.push({ item_id: itemId, filial_id: filialId, tipo: 'ajuste', quantidade: delta, chamado: null, colaborador: null, observacao: delta < 0 ? 'Acerto de inventário (baixa)' : 'Acerto de inventário (sobra)' })
      }
    }

    // Datas crescentes na forma mensal, na ordem de emissao (a validade do saldo
    // e garantida pela ORDEM de insercao, nao pela data).
    const datas = sortedDates(eventos.length)
    eventos.forEach((e, k) => rows.push({ ...e, data: datas[k] }))
  }

  for (const it of itens) {
    cadeia(it.id, matriz, it.grupo, randInt(4, 12))
    const extras = shuffle([...outrasFiliais]).slice(0, randInt(0, 2))
    for (const f of extras) cadeia(it.id, f, it.grupo, randInt(2, 7))
  }
  return rows
}

// Insercao 1 a 1 (o trigger valida cada linha contra o estado corrente do par
// item×filial — igual as movimentacoes). A ordem do array preserva a validade.
async function inserirLancamentos(
  db: ReturnType<typeof createAdminClient>,
  rows: LancRow[],
  criadoPor: string,
): Promise<number> {
  let total = 0
  for (const r of rows) {
    const { error } = await db.from('lancamentos_item').insert({
      item_id: r.item_id,
      filial_id: r.filial_id,
      tipo: r.tipo,
      quantidade: r.quantidade,
      chamado: r.chamado,
      colaborador: r.colaborador,
      data: r.data,
      observacao: r.observacao,
      criado_por: criadoPor,
      created_at: `${r.data}T12:00:00Z`,
    })
    if (error) {
      throw new Error(`Insert de lancamento_item falhou (item ${r.item_id}, ${r.tipo} ${r.quantidade}): ${error.message}`)
    }
    total++
    if (total % 200 === 0) console.log(`[seed] lancamentos_item: ${total} inseridos...`)
  }
  console.log(`[seed] ${total} lancamentos_item inseridos.`)
  return total
}

// 2-4 anotacoes por ativo em manutencao (alguns ativos), com datas espacadas —
// a micro-historia que a seção de manutencao do relatorio exibe.
async function inserirAnotacoes(
  db: ReturnType<typeof createAdminClient>,
  criadoPor: string,
): Promise<number> {
  const { data: ativos, error } = await db
    .from('ativos')
    .select('id')
    .eq('status', 'em_manutencao')
    .order('id', { ascending: true })
    .limit(6)
  if (error) throw new Error(`Falha ao listar ativos em manutencao: ${error.message}`)
  const lista = (ativos ?? []) as { id: string }[]
  const alvo = lista.slice(0, Math.min(5, lista.length))
  let total = 0
  for (const a of alvo) {
    const nNotas = randInt(2, 4)
    const problema = pick(ANOTACAO_PROBLEMAS)
    let ord = randInt(MONTH_OFFSET[5] + 5, MONTH_OFFSET[5] + 20) // meados de junho
    for (let k = 0; k < nNotas; k++) {
      const texto = k === 0 ? ANOTACAO_PASSOS[0](problema) : pick(ANOTACAO_PASSOS.slice(1))('')
      const data = ordToDate(Math.min(ord, WIN_MAX_ORD))
      const { error: e } = await db.from('anotacoes').insert({
        ativo_id: a.id,
        texto,
        criado_por: criadoPor,
        created_at: `${data}T14:30:00Z`,
      })
      if (e) throw new Error(`Insert de anotacao falhou: ${e.message}`)
      total++
      ord += randInt(4, 12)
    }
  }
  console.log(`[seed] ${total} anotacoes inseridas em ${alvo.length} ativos em manutencao.`)
  return total
}

// ============================ PERFIS FICTICIOS / CARGOS (F21) =============================
// A F21 criou tres CARGOS (admin > operador > consulta) e o VINCULO DE FILIAIS de
// escrita do operador (docs/ADR-002-papeis-e-permissoes.md · spec §3.1). Sem contas
// nos tres cargos, o DEV nao tem como exercitar nada disso: a unica conta do banco
// de ensaio e admin (backfill da migration 0061) e todo botao aparece para ela.
//
// Este bloco garante SEIS contas ficticias — uma por caso que a fase precisa
// mostrar — e e IDEMPOTENTE: conta que ja existe e reaproveitada (o `reset` preserva
// contas, como sempre preservou `profiles`), e papel/nome/vinculos sao reescritos a
// cada rodada, para o estado ser o mesmo depois de qualquer sequencia de comandos.
//
// Os literais de cargo abaixo espelham o enum `papel_usuario` do banco e
// `src/lib/auth/papeis.ts`; ficam repetidos aqui pela mesma razao que `Categoria` e
// `Status` no topo deste arquivo — o script nao importa a camada de dominio do app.
//
// REGRA 2 DO CLAUDE.md: tudo ficticio. Os e-mails levam o prefixo `seed.` de
// proposito, para nunca colidirem com o endereco de uma pessoa real; os nomes dizem
// "Ficticio(a)" na cara. O dominio TEM de ser corporativo — o trigger
// `handle_new_user` (migration 0041) recusa qualquer outro.

type PapelSeed = 'admin' | 'operador' | 'consulta'

// Senha ficticia, unica e igual para todas as contas do seed: elas existem so no
// projeto de ENSAIO (as guardas de env-guard.ts recusam producao) e servem para o
// Johnny logar como cada cargo e ver a diferenca na tela.
const SENHA_PERFIS_SEED = 'estoque-dev-2026'

type PerfilSeed = {
  email: string
  primeiro_nome: string
  sobrenome: string
  papel: PapelSeed
  ativo: boolean
  /** Slugs das filiais de escrita. Vazio = sem vinculo (falha segura no banco). */
  filiais: string[]
  /** Por que esta conta existe no seed — sai no sumario. */
  para: string
}

const PERFIS_SEED: PerfilSeed[] = [
  {
    email: 'seed.admin@wap.ind.br',
    primeiro_nome: 'Ana',
    sobrenome: 'Ficticia',
    papel: 'admin',
    ativo: true,
    filiais: [], // admin escreve em todas sem precisar de vinculo
    para: 'admin: ve /admin, importa, escreve em todas as filiais',
  },
  {
    email: 'seed.operador.matriz@wap.ind.br',
    primeiro_nome: 'Bruno',
    sobrenome: 'Ficticio',
    papel: 'operador',
    ativo: true,
    filiais: ['matriz'],
    para: 'operador de UMA filial: escreve na matriz e e recusado nas outras',
  },
  {
    email: 'seed.operador.duas@wap.ind.br',
    primeiro_nome: 'Carla',
    sobrenome: 'Ficticia',
    papel: 'operador',
    ativo: true,
    filiais: ['linhares', 'serra'],
    para: 'operador de DUAS filiais: seletor de filial com duas opcoes',
  },
  {
    email: 'seed.operador.sem.filial@wap.ind.br',
    primeiro_nome: 'Dario',
    sobrenome: 'Ficticio',
    papel: 'operador',
    ativo: true,
    filiais: [],
    para: 'operador SEM vinculo: le tudo e nao escreve em lugar nenhum (falha segura)',
  },
  {
    email: 'seed.consulta@wap.ind.br',
    primeiro_nome: 'Elisa',
    sobrenome: 'Ficticia',
    papel: 'consulta',
    ativo: true,
    filiais: [],
    para: 'consulta: nenhum botao de escrita em tela nenhuma',
  },
  {
    email: 'seed.desativado@wap.ind.br',
    primeiro_nome: 'Fabio',
    sobrenome: 'Ficticio',
    papel: 'operador',
    ativo: false,
    filiais: ['matriz'],
    para: 'DESATIVADO (ativo=false): cai no login no request seguinte, mesmo com vinculo',
  },
]

type PerfilCriado = { email: string; id: string; perfil: PerfilSeed; novo: boolean }

// Acoes de auditoria (`eventos_admin`, migration 0065). Vocabulario fechado em
// `src/lib/auditoria.ts` — repetido aqui pelo mesmo motivo dos cargos. Estas linhas
// dao conteudo a aba "Auditoria" de /admin/usuarios em DEV; o `reset` as apaga,
// porque e o seed quem as cria.
type AcaoSeed =
  | 'convite_gerado'
  | 'papel_alterado'
  | 'vinculos_alterados'
  | 'usuario_desativado'
  | 'senha_criada'
  | 'import_executado'

// A trilha e insert-only e sem update/delete no banco: o app so acrescenta linhas.
// `detalhe` NUNCA guarda segredo (nem hash, nem token) — regra do comment da coluna.
const EVENTOS_SEED: {
  acao: AcaoSeed
  alvo: string
  detalhe: Record<string, unknown> | null
  data: string
}[] = [
  { acao: 'convite_gerado', alvo: 'seed.consulta@wap.ind.br', detalhe: { papel: 'consulta' }, data: '2026-06-10' },
  { acao: 'papel_alterado', alvo: 'seed.operador.matriz@wap.ind.br', detalhe: { de: 'admin', para: 'operador' }, data: '2026-06-18' },
  { acao: 'vinculos_alterados', alvo: 'seed.operador.duas@wap.ind.br', detalhe: { filiais: ['linhares', 'serra'] }, data: '2026-06-25' },
  { acao: 'senha_criada', alvo: 'Parceiro (ficticio)', detalhe: null, data: '2026-07-01' },
  { acao: 'usuario_desativado', alvo: 'seed.desativado@wap.ind.br', detalhe: { motivo: 'saiu da equipe (ficticio)' }, data: '2026-07-02' },
  { acao: 'import_executado', alvo: 'matriz', detalhe: { criados: 809, apagados: 0 }, data: '2026-07-03' },
]

// Cria (ou reaproveita) as contas, reescreve papel/nome/ativo e refaz os vinculos.
// Devolve a lista, para o sumario e para escolher o autor das movimentacoes.
async function garantirPerfisSeed(
  db: ReturnType<typeof createAdminClient>,
  filialIdBySlug: Map<string, number>,
): Promise<PerfilCriado[]> {
  // Uma leitura so: a lista de contas do projeto de ensaio e minuscula.
  const { data: lista, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listErr) throw new Error(`Nao consegui listar as contas do Auth: ${listErr.message}`)
  const idPorEmail = new Map<string, string>()
  for (const u of lista?.users ?? []) {
    if (u.email) idPorEmail.set(u.email.toLowerCase(), u.id)
  }

  const criados: PerfilCriado[] = []
  for (const p of PERFIS_SEED) {
    const jaExiste = idPorEmail.get(p.email.toLowerCase())
    let id = jaExiste
    if (!id) {
      // `email_confirm: true` evita o passo de confirmacao por e-mail (que este
      // projeto nao usa: a entrada e por link de convite). O trigger
      // `handle_new_user` cria o profile e aplica a trava de dominio.
      const { data, error } = await db.auth.admin.createUser({
        email: p.email,
        password: SENHA_PERFIS_SEED,
        email_confirm: true,
        user_metadata: { nome: p.primeiro_nome, sobrenome: p.sobrenome },
      })
      if (error || !data?.user) {
        throw new Error(
          `Nao consegui criar a conta ficticia ${p.email}: ${error?.message ?? 'resposta vazia'}. ` +
            'Crie 1 conta @wap.ind.br a mao no projeto de ensaio e rode de novo.',
        )
      }
      id = data.user.id
    }

    // `nome` e coluna GERADA (migration 0057) — escrever nela e erro; grava-se
    // primeiro_nome/sobrenome. `papel`/`ativo` so o service role escreve (0063).
    // O `.select()` no fim nao e enfeite: sem ele, um UPDATE que nao casa linha
    // nenhuma (conta no Auth sem profile — nao deveria acontecer, o trigger cria)
    // passaria em silencio e a conta ficaria com o cargo default 'operador'.
    const { data: perfilGravado, error: upErr } = await db
      .from('profiles')
      .update({
        primeiro_nome: p.primeiro_nome,
        sobrenome: p.sobrenome,
        papel: p.papel,
        ativo: p.ativo,
      })
      .eq('id', id)
      .select('id')
    if (upErr) throw new Error(`Falha ao gravar o perfil de ${p.email}: ${upErr.message}`)
    if (!perfilGravado || perfilGravado.length === 0) {
      throw new Error(
        `A conta ${p.email} existe no Auth mas nao tem perfil em profiles — nada foi gravado. ` +
          'Confira o trigger handle_new_user no banco de ensaio.',
      )
    }

    // Vinculos: apaga e reinsere, para o estado final nao depender do que havia
    // antes (o backfill da 0061 pode ter vinculado a conta a TODAS as filiais).
    const { error: delErr } = await db.from('operador_filiais').delete().eq('usuario_id', id)
    if (delErr) throw new Error(`Falha ao limpar vinculos de ${p.email}: ${delErr.message}`)
    if (p.filiais.length > 0) {
      const rows = p.filiais.map((slug) => {
        const filialId = filialIdBySlug.get(slug)
        if (filialId === undefined) throw new Error(`Filial "${slug}" ausente (vinculo de ${p.email}).`)
        return { usuario_id: id, filial_id: filialId }
      })
      const { error: insErr } = await db.from('operador_filiais').insert(rows)
      if (insErr) throw new Error(`Falha ao vincular filiais de ${p.email}: ${insErr.message}`)
    }

    criados.push({ email: p.email, id: id!, perfil: p, novo: !jaExiste })
  }

  console.log(`[seed] perfis ficticios garantidos: ${criados.length} (senha: ${SENHA_PERFIS_SEED})`)
  for (const c of criados) {
    const filiais = c.perfil.filiais.length > 0 ? c.perfil.filiais.join('+') : '—'
    console.log(
      `        ${c.novo ? 'criado ' : 'reusado'}  ${c.perfil.papel.padEnd(9)} ${c.perfil.ativo ? 'ativo     ' : 'DESATIVADO'} ${filiais.padEnd(18)} ${c.email}`,
    )
  }
  return criados
}

// Linhas ficticias na trilha de auditoria, para a aba "Auditoria" renderizar em DEV.
// O autor e sempre o admin do seed; uma linha fica SEM autor de proposito, que e o
// caso "usuario removido" (a coluna e `on delete set null` justamente para isso).
async function inserirEventosAdmin(
  db: ReturnType<typeof createAdminClient>,
  autorId: string,
): Promise<number> {
  const rows = EVENTOS_SEED.map((e, i) => ({
    quando: `${e.data}T13:${String(10 + i).padStart(2, '0')}:00Z`,
    autor: e.acao === 'import_executado' ? null : autorId, // 1 linha sem autor
    acao: e.acao,
    alvo: e.alvo,
    detalhe: e.detalhe,
  }))
  const { error } = await db.from('eventos_admin').insert(rows)
  if (error) throw new Error(`Insert de eventos_admin falhou: ${error.message}`)
  console.log(`[seed] ${rows.length} eventos de auditoria ficticios inseridos.`)
  return rows.length
}

// ============================ SUMARIO =============================

function pct(n: number, total: number): number {
  return total === 0 ? 0 : (n * 100) / total
}
function mark(actualPct: number, targetPct: number): string {
  return Math.abs(actualPct - targetPct) <= 3 ? '✓' : '✗'
}

// PostgREST corta selects em ~1000 linhas por padrao, e o resumo do seed lida
// com ~1.2k ativos e ~2.4k movimentacoes. Pagina com .range() ate a ultima
// pagina incompleta para que as contagens e os checks (✓/✗) sejam reais — sem
// isso o sumario mostra "Ativos: 1000" e marca falso-negativos.
const PAGINA_SUMARIO = 1000
async function lerPaginado<Row>(
  rotulo: string,
  pagina: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Row[]> {
  const acc: Row[] = []
  for (let from = 0; ; from += PAGINA_SUMARIO) {
    const { data, error } = await pagina(from, from + PAGINA_SUMARIO - 1)
    if (error) throw new Error(`${rotulo}: ${error.message}`)
    const rows = (data ?? []) as Row[]
    acc.push(...rows)
    if (rows.length < PAGINA_SUMARIO) break
  }
  return acc
}

async function sumario(
  db: ReturnType<typeof createAdminClient>,
  slugById: Map<number, string>,
  totalMov: number,
  totalItens: number,
  totalLanc: number,
  totalAnot: number,
) {
  const rowsA = await lerPaginado<{
    categoria: string
    status: string
    filial_id: number
    patrimonio: string
    service_tag: string | null
    pendencia: string | null
  }>('Sumario (ativos)', (from, to) =>
    db
      .from('ativos')
      .select('categoria,status,filial_id,patrimonio,service_tag,pendencia')
      .range(from, to),
  )
  const rowsM = await lerPaginado<{ tipo: string; data: string }>(
    'Sumario (movimentacoes)',
    (from, to) => db.from('movimentacoes').select('tipo,data').range(from, to),
  )
  const totalA = rowsA.length

  const countBy = <T extends string | number>(rows: { [k: string]: unknown }[], key: string) => {
    const m = new Map<T, number>()
    for (const r of rows) {
      const k = r[key] as T
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }

  console.log('\n================ SUMARIO DO SEED ================')
  console.log(`Ativos: ${totalA}  |  Movimentacoes: ${rowsM.length}`)

  console.log('\n-- Por categoria (meta vs real, ±3pp) --')
  const catCount = countBy<string>(rowsA, 'categoria')
  for (const [cat, target] of CATEGORIA_DIST) {
    const p = pct(catCount.get(cat) ?? 0, totalA)
    console.log(`  ${mark(p, target * 100)} ${cat.padEnd(10)} ${(catCount.get(cat) ?? 0).toString().padStart(4)}  ${p.toFixed(1)}%  (meta ${(target * 100).toFixed(1)}%)`)
  }

  console.log('\n-- Por status (meta vs real, ±3pp) --')
  const stCount = countBy<string>(rowsA, 'status')
  for (const [st, target] of STATUS_DIST) {
    const p = pct(stCount.get(st) ?? 0, totalA)
    console.log(`  ${mark(p, target * 100)} ${st.padEnd(13)} ${(stCount.get(st) ?? 0).toString().padStart(4)}  ${p.toFixed(1)}%  (meta ${(target * 100).toFixed(1)}%)`)
  }

  console.log('\n-- Por filial (meta vs real, ±3pp) --')
  const filCount = countBy<number>(rowsA, 'filial_id')
  for (const [slug, target] of FILIAL_DIST) {
    let n = 0
    for (const [id, c] of filCount) if (slugById.get(id) === slug) n += c
    const p = pct(n, totalA)
    console.log(`  ${mark(p, target * 100)} ${slug.padEnd(15)} ${n.toString().padStart(4)}  ${p.toFixed(1)}%  (meta ${(target * 100).toFixed(1)}%)`)
  }

  console.log('\n-- Casos-limite (meta vs real) --')
  const semPat = rowsA.filter((r) => r.pendencia === 'sem patrimônio físico').length
  console.log(`  ${semPat === SEM_PATRIMONIO ? '✓' : '✗'} sem patrimonio (pendencia)  ${semPat}  (meta ${SEM_PATRIMONIO})`)
  const patCount = new Map<string, number>()
  for (const r of rowsA) patCount.set(r.patrimonio, (patCount.get(r.patrimonio) ?? 0) + 1)
  let dupPairs = 0
  for (const [, c] of patCount) if (c > 1) dupPairs++
  console.log(`  ${dupPairs === DUP_PATRIMONIO_PAIRS ? '✓' : '✗'} pares patrimonio repetido   ${dupPairs}  (meta ${DUP_PATRIMONIO_PAIRS})`)
  const comTag = rowsA.filter((r) => r.service_tag != null).length
  const pTag = pct(comTag, totalA)
  console.log(`  ${mark(pTag, SERVICE_TAG_RATE * 100)} com service_tag             ${comTag}  ${pTag.toFixed(1)}%  (meta ~${(SERVICE_TAG_RATE * 100).toFixed(0)}%)`)

  console.log('\n-- Movimentacoes por mes (forma; meta = pesos normalizados, ±3pp) --')
  const shapeTotal = MONTHLY_SHAPE.reduce((s, w) => s + w, 0)
  const monthCount = new Array(7).fill(0)
  for (const r of rowsM) {
    const m = Number(r.data.slice(5, 7)) - 1
    if (m >= 0 && m < 7) monthCount[m]++
  }
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul']
  for (let i = 0; i < 7; i++) {
    const p = pct(monthCount[i], rowsM.length)
    const target = pct(MONTHLY_SHAPE[i], shapeTotal)
    console.log(`  ${mark(p, target)} ${nomes[i]} ${monthCount[i].toString().padStart(4)}  ${p.toFixed(1)}%  (forma ${target.toFixed(1)}%)`)
  }

  console.log('\n-- Mix de tipos (real vs alvo citado na OS 3.3.4; DESVIO documentado) --')
  const OS_MIX: Record<string, number> = { saida: 55, devolucao: 35, compra: 5, transferencia: 3, emprestimo: 2 }
  const tipoCount = countBy<string>(rowsM, 'tipo')
  for (const [t, c] of [...tipoCount].sort((a, b) => b[1] - a[1])) {
    const alvo = OS_MIX[t] !== undefined ? `  (OS ~${OS_MIX[t]}%)` : ''
    console.log(`     ${t.padEnd(18)} ${c.toString().padStart(4)}  ${pct(c, rowsM.length).toFixed(1)}%${alvo}`)
  }

  console.log('\n-- Itens por quantidade (F3B) --')
  console.log(`  itens (catalogo): ${totalItens}  |  lancamentos: ${totalLanc}  |  anotacoes: ${totalAnot}`)
  // Falta e saldo zerado sao conceitos POR FILIAL (o e-mail e por filial); o
  // consolidado mascara a falta de uma filial com a sobra de outra. Checa por filial.
  // F6A: a RPC agora devolve total/estoque/atrelados/falta (sem `saldo`). Na
  // doutrina nova `falta` é indicador de anomalia (0 na operação válida — o
  // trigger impede estoque < 0), então a auto-verificação passa a checar
  // `atrelados > 0` (atrelar desconta o estoque) em vez de falta.
  type SaldoRow = { item: string; estoque: number; atrelados: number; falta: number }
  const idBySlug = new Map<string, number>()
  for (const [id, slug] of slugById) idBySlug.set(slug, id)
  let comAtrelados = 0
  for (const [, id] of idBySlug) {
    const { data } = await db.rpc('rel_saldo_itens', { p_filial: id, p_ate: '2026-12-31' })
    comAtrelados += ((data ?? []) as SaldoRow[]).filter((s) => Number(s.atrelados) > 0).length
  }
  const { data: sLinhares } = await db.rpc('rel_saldo_itens', {
    p_filial: idBySlug.get('linhares'),
    p_ate: '2026-12-31',
  })
  const carregador = ((sLinhares ?? []) as SaldoRow[]).find((s) => s.item === 'Carregador micro-USB')
  const zeradoOk = carregador ? Number(carregador.estoque) === 0 : false
  console.log(`  ${comAtrelados >= 1 ? '✓' : '✗'} itens com atrelados (F6A: atrelar desconta estoque), por filial: ${comAtrelados}  (meta >= 1)`)
  console.log(`  ${zeradoOk ? '✓' : '✗'} item com estoque zerado (Carregador micro-USB @ Linhares)  (meta: sim)`)

  console.log('\nNOTA (pendente de sign-off do Johnny): a estrategia prioriza a distribuicao de')
  console.log(`      STATUS FINAL (spec 10.1). Por isso o total de movimentacoes (~${totalMov}) e o mix`)
  console.log('      divergem do "~700" e dos percentuais de tipo citados na OS 3.3.4 — impossivel ter')
  console.log('      ~65% em uso com ~700 eventos (o status deriva 100% das movimentacoes).')
  console.log('==================================================\n')
}

// Roteiro pronto de teste manual dos cargos — o que o Johnny precisa ter na mao
// para conferir a F21 na tela em 5 minutos, sem procurar e-mail nem senha.
function sumarioPerfis(perfis: PerfilCriado[]) {
  console.log('=========== CONTAS FICTICIAS (CARGOS — F21) ===========')
  console.log(`Senha de todas: ${SENHA_PERFIS_SEED}`)
  for (const c of perfis) {
    const filiais = c.perfil.filiais.length > 0 ? c.perfil.filiais.join(' + ') : 'nenhuma'
    console.log(`  ${c.email}`)
    console.log(
      `      cargo ${c.perfil.papel} · ${c.perfil.ativo ? 'ativo' : 'DESATIVADO'} · filiais de escrita: ${filiais}`,
    )
    console.log(`      ${c.perfil.para}`)
  }
  console.log('Como conferir: logue com cada uma e olhe o menu (Administracao so no admin),')
  console.log('o botao amarelo do cabecalho (nao existe para consulta) e o seletor de filial')
  console.log('das telas de registro (so as vinculadas). O desativado cai no login.')
  console.log('======================================================\n')
}

// ============================ MAIN =============================

async function main() {
  // Guardas SEMPRE primeiro.
  loadEnvLocal()
  const cfg: GuardedConfig = assertGuardsAndGetConfig()
  faker.seed(FAKER_SEED)
  const db = createAdminClient(cfg)
  console.log(`[seed] projeto: ${cfg.projectRef}`)

  // Pre-requisitos de dados.
  const { data: filiais, error: fErr } = await db.from('filiais').select('id,slug')
  if (fErr) throw new Error(`Nao consegui ler filiais: ${fErr.message}`)
  if (!filiais || filiais.length === 0) throw new Error('Nenhuma filial. Aplique a migration 0007 antes do seed.')
  const filialIdBySlug = new Map<string, number>()
  const slugById = new Map<number, string>()
  for (const f of filiais as { id: number; slug: string }[]) {
    filialIdBySlug.set(f.slug, f.id)
    slugById.set(f.id, f.slug)
  }
  for (const [slug] of FILIAL_DIST) {
    if (!filialIdBySlug.has(slug)) throw new Error(`Filial "${slug}" ausente (esperada pela 0007).`)
  }

  // Banco precisa estar vazio (determinismo). Rode `npm run db:reset` antes.
  // Antes de QUALQUER escrita: uma rodada acidental aborta sem criar conta nenhuma.
  const { count, error: cErr } = await db.from('ativos').select('id', { count: 'exact', head: true })
  if (cErr) throw new Error(`Nao consegui contar ativos: ${cErr.message}`)
  if ((count ?? 0) > 0) {
    throw new Error(`Ja existem ${count} ativos. Rode "npm run db:reset" antes de "npm run db:seed".`)
  }

  // F21: as contas ficticias dos tres cargos (com vinculos variados). Idempotente.
  // O AUTOR das movimentacoes e o admin do seed — antes era "o primeiro profile do
  // banco", que dependia da ordem dos ids e podia cair numa conta real do ensaio.
  const perfis = await garantirPerfisSeed(db, filialIdBySlug)
  const admin = perfis.find((p) => p.perfil.papel === 'admin')
  if (!admin) throw new Error('Nenhum perfil admin no seed (PERFIS_SEED sem cargo admin?).')
  const criadoPor = admin.id

  console.log('[seed] gerando dados ficticios (deterministico)...')
  const ativos = gerarAtivos(filialIdBySlug)

  await inserirAtivos(db, ativos)
  const totalMov = await inserirMovimentacoes(db, ativos, criadoPor)
  await reforcarPendenciaSemPatrimonio(db, ativos)
  await inserirCasosDevolucaoFornecedor(db, filialIdBySlug, criadoPor)

  // F3B: catalogo de itens + lancamentos de quantidade + anotacoes de manutencao.
  const itens = await inserirItens(db)
  const garantidos = casosGarantidos(itens, filialIdBySlug)
  const pular = new Set(garantidos.map((r) => `${r.item_id}:${r.filial_id}`))
  const lancRows = [...garantidos, ...gerarLancamentos(itens, filialIdBySlug, pular)]
  const totalLanc = await inserirLancamentos(db, lancRows, criadoPor)
  const totalAnot = await inserirAnotacoes(db, criadoPor)

  // F21: trilha de auditoria ficticia (a aba "Auditoria" de /admin/usuarios).
  await inserirEventosAdmin(db, criadoPor)

  await sumario(db, slugById, totalMov, itens.length, totalLanc, totalAnot)
  sumarioPerfis(perfis)
  console.log('[seed] concluido.')
}

main().catch((err) => {
  console.error('[seed] erro:', err instanceof Error ? err.message : err)
  process.exit(1)
})
