// =============================================================================
// bench-formas.mts — o custo do parse Zod nas leituras de LOTE (F58 · Frente F)
// =============================================================================
// POR QUE ELE EXISTE
//
// A ficha da F58 nomeia um risco só: "Zod por linha vira regressão em leitura de lote". O harness
// de TTFB (`scripts/perf/medir.mjs`) não alcança export nem backup — são Server Actions, POST com
// id de build. Este benchmark mede o que o harness não mede: o parse, sozinho, no volume de
// PRODUÇÃO medido pelo censo (`docs/f58-evidencias/censo-producao.json`), com linhas FICTÍCIAS
// (`WAP0001234`, "Fulano"), em três modos — sem parse (a linha base do cast de antes), forma
// ESTRITA e forma FROUXA. É ele que decide o modo das leituras de lote (Decisão 5).
//
// Nada aqui fala com banco. Determinístico: a mesma semente gera as mesmas linhas.
//
// USO
//   npx tsx scripts/perf/bench-formas.mts [--rotulo=f58-bench-antes-lote-2] [--saida=docs/perf/x.json]
// =============================================================================

import { writeFileSync } from 'node:fs'
import { z } from 'zod'

const opcao = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
const ROTULO = opcao('rotulo') ?? 'f58-bench-formas'
const SAIDA = opcao('saida')

// O volume do censo de produção (15/09/2026) — o maior domínio de cada leitura de lote.
const VOLUME = { ativos: 1620, movimentacoes: 3553, lancamentos: 142, termos: 106 } as const

// ---------------------------------------------------------------------------
// Gerador fictício, determinístico
// ---------------------------------------------------------------------------
let semente = 58
const aleatorio = () => {
  semente = (semente * 1103515245 + 12345) % 2147483648
  return semente / 2147483648
}
const escolher = <T,>(xs: readonly T[]): T => xs[Math.floor(aleatorio() * xs.length)]
const talvez = <T,>(v: T, chanceNulo: number): T | null => (aleatorio() < chanceNulo ? null : v)
const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
const CATEGORIAS = ['notebook', 'desktop', 'monitor', 'celular', 'tablet', 'outro'] as const
const STATUS = ['em_estoque', 'reservado', 'em_uso', 'emprestado', 'em_triagem', 'em_manutencao', 'defasado', 'descartado', 'devolvido_fornecedor'] as const
const TIPOS = ['compra', 'saida', 'emprestimo', 'devolucao', 'transferencia', 'ajuste', 'estorno'] as const

function ativo(i: number) {
  return {
    id: uuid(i),
    patrimonio: talvez(`WAP${String(1234 + i).padStart(7, '0')}`, 0.02),
    patrimonio_original: talvez('WAP0001234', 0.02),
    service_tag: talvez(`ST${i}`, 0.04),
    categoria: escolher(CATEGORIAS),
    marca: talvez('Marca Fictícia', 0.01),
    modelo: talvez('Modelo X', 0.01),
    memoria: talvez('16GB', 0.5),
    armazenamento: talvez('512GB', 0.5),
    processador: talvez('i5', 0.6),
    fornecedor: talvez('Fornecedor Fictício', 0.01),
    hostname: talvez(`HOST-${i}`, 0.17),
    imei: null,
    telefone: null,
    pulsus: null,
    filial_id: 1 + (i % 5),
    status: escolher(STATUS),
    colaborador_atual: talvez('Fulano de Tal', 0.23),
    setor_atual: talvez('Setor Fictício', 0.87),
    termo_assinado: talvez(escolher(['sim', 'nao', 'enviado', 'gerado'] as const), 0.9),
    termo_data: talvez('2026-01-01', 0.9),
    pendencia: talvez('sem patrimônio', 0.95),
    observacoes: talvez('observação fictícia', 0.47),
    origem: 'importacao',
    substitui_ativo_id: null,
    created_at: '2026-07-20T12:00:00.000Z',
    updated_at: '2026-09-01T12:00:00.000Z',
    filiais: { slug: 'alfa', nome: 'Filial Alfa' },
  }
}

function movimentacao(i: number) {
  return {
    id: uuid(100000 + i),
    ordem: i,
    ativo_id: uuid(i % VOLUME.ativos),
    tipo: escolher(TIPOS),
    data: '2026-08-01',
    created_at: '2026-08-01T12:00:00.000Z',
    filial_id: 1 + (i % 5),
    filial_destino_id: talvez(2, 0.99),
    motivo: talvez('outro', 0.89),
    colaborador: talvez('Fulano de Tal', 0.59),
    setor: talvez('Setor Fictício', 0.91),
    chamado: talvez('CH-0001', 0.88),
    observacao: talvez('obs fictícia', 0.07),
    estorno_de: null,
    snapshot_anterior: talvez({ status: 'em_estoque', colaborador: null, setor: null, filial_id: 1 }, 0.3),
    ativo: { patrimonio: 'WAP0001234', categoria: 'notebook', marca: 'Marca', modelo: 'Modelo' },
    autor: talvez({ nome: 'Fulano' }, 0.1),
    filial: { nome: 'Filial Alfa', slug: 'alfa' },
  }
}

// ---------------------------------------------------------------------------
// As formas — REPRESENTATIVAS das leituras de lote (export de ativos, lista/histórico de
// movimentações, backup de select('*')). O tipo de cada coluna é o do `database.ts`.
// ---------------------------------------------------------------------------
const s = z.string()
const sn = z.string().nullable()
const ATIVO_SHAPE = {
  id: s, patrimonio: sn, patrimonio_original: sn, service_tag: sn, categoria: z.enum(CATEGORIAS), marca: sn, modelo: sn,
  memoria: sn, armazenamento: sn, processador: sn, fornecedor: sn, hostname: sn, imei: sn, telefone: sn, pulsus: sn,
  filial_id: z.number(), status: z.enum(STATUS), colaborador_atual: sn, setor_atual: sn,
  termo_assinado: z.enum(['sim', 'nao', 'enviado', 'gerado']).nullable(), termo_data: sn, pendencia: sn, observacoes: sn,
  origem: s, substitui_ativo_id: sn, created_at: s, updated_at: s,
  filiais: z.strictObject({ slug: s, nome: s }),
}
const MOV_SHAPE = {
  id: s, ordem: z.number(), ativo_id: s, tipo: z.enum(TIPOS), data: s, created_at: s, filial_id: z.number(),
  filial_destino_id: z.number().nullable(), motivo: sn, colaborador: sn, setor: sn, chamado: sn, observacao: sn, estorno_de: sn,
  snapshot_anterior: z.looseObject({ status: s.optional(), colaborador: sn.optional(), setor: sn.optional(), filial_id: z.number().nullable().optional() }).nullable(),
  ativo: z.strictObject({ patrimonio: sn, categoria: z.enum(CATEGORIAS), marca: sn, modelo: sn }),
  autor: z.strictObject({ nome: s }).nullable(),
  filial: z.strictObject({ nome: s, slug: s }),
}

const CASOS = [
  { leitura: 'export de ativos (colunas explícitas + embed)', linhas: () => Array.from({ length: VOLUME.ativos }, (_, i) => ativo(i)), estrita: z.strictObject(ATIVO_SHAPE), frouxa: z.looseObject(ATIVO_SHAPE) },
  { leitura: 'histórico/lista de movimentações (embeds + jsonb)', linhas: () => Array.from({ length: VOLUME.movimentacoes }, (_, i) => movimentacao(i)), estrita: z.strictObject(MOV_SHAPE), frouxa: z.looseObject(MOV_SHAPE) },
  { leitura: 'backup select(*) de ativos — frouxa com 3 colunas declaradas', linhas: () => Array.from({ length: VOLUME.ativos }, (_, i) => ativo(i)), estrita: null, frouxa: z.looseObject({ id: s, filial_id: z.number(), patrimonio: sn }) },
] as const

function medir(fn: () => void, rodadas = 21, aquecimento = 5): { mediana: number; p95: number } {
  for (let i = 0; i < aquecimento; i++) fn()
  const t: number[] = []
  for (let i = 0; i < rodadas; i++) {
    const a = performance.now()
    fn()
    t.push(performance.now() - a)
  }
  t.sort((x, y) => x - y)
  const r = (v: number) => Math.round(v * 100) / 100
  return { mediana: r(t[Math.floor(t.length / 2)]), p95: r(t[Math.min(t.length - 1, Math.ceil(t.length * 0.95) - 1)]) }
}

const resultados = []
for (const caso of CASOS) {
  for (const fator of [1, 10]) {
    const base = caso.linhas()
    const linhas = fator === 1 ? base : Array.from({ length: fator }, () => base).flat()
    let soma = 0
    const semParse = medir(() => {
      soma = 0
      for (const l of linhas) soma += (l as { id: string }).id.length
    })
    const estrita = caso.estrita ? medir(() => { for (const l of linhas) caso.estrita!.parse(l) }) : null
    const frouxa = medir(() => { for (const l of linhas) caso.frouxa.parse(l) })
    resultados.push({ leitura: caso.leitura, linhas: linhas.length, fator, sem_parse_ms: semParse, estrita_ms: estrita, frouxa_ms: frouxa })
    void soma
  }
}

const relatorio = {
  rotulo: ROTULO,
  o_que_e: 'Custo do parse Zod por leitura de lote, linhas fictícias no volume do censo de produção (fator 1) e 10× (fator 10). Mediana e p95 de 21 rodadas após 5 de aquecimento.',
  node: process.version,
  zod: '4.5.4',
  volume_censo_producao: VOLUME,
  resultados,
}
console.log(`| leitura | linhas | sem parse (ms) | estrita (ms) | frouxa (ms) |`)
console.log(`|---|---:|---:|---:|---:|`)
for (const r of resultados) {
  console.log(`| ${r.leitura} | ${r.linhas} | ${r.sem_parse_ms.mediana} | ${r.estrita_ms?.mediana ?? '—'} | ${r.frouxa_ms.mediana} |`)
}
if (SAIDA) {
  writeFileSync(SAIDA, JSON.stringify(relatorio, null, 2) + '\n', 'utf8')
  console.log(`gravado em ${SAIDA}`)
}
