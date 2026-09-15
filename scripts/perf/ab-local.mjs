// =============================================================================
// ab-local.mjs — A/B de TTFB INTERCALADO entre dois `next start` locais que falam com o ENSAIO (F58 · Frente F)
// =============================================================================
// O MÉTODO (o da F33, ata de 10/08/2026): dois servidores do mesmo projeto contra o mesmo banco, diferindo só no
// commit — A = antes (a `main`, numa worktree temporária), B = depois (a branch) —, medidos INTERCALADOS: a cada
// rodada cada lado roda o `medir-local.mjs` uma vez, e QUEM VAI PRIMEIRO ALTERNA de rodada em rodada. A leitura honesta
// é a NORMALIZADA pelo controle, nunca o número bruto — o próprio controle deriva de uma execução para outra:
//  · `/ajuda` — rota do app que a fase não toca (o controle da F33);
//  · `/vercel.svg` — estático, fora do matcher do proxy (o controle de rede).
// Por rota e por lado: a mediana das medianas de TTFB das rodadas. Razão bruta = B/A; normalizada = (B/A) ÷ (B/A do
// controle). GATE: nenhuma rota (fora os controles) acima de +10% na leitura normalizada por `/ajuda`; a normalizada
// por `/vercel.svg` sai ao lado.
//
// Só GET (é o `medir.mjs` quem mede), só ENSAIO (o `medir-local.mjs` recusa outro alvo), persona fictícia, e a saída
// guarda só tempo e status — nenhum id, nenhum valor.
//
// USO (os dois servidores já de pé; a credencial entra por --env-file):
//   node --env-file=.env.local scripts/perf/ab-local.mjs --porta-a=3101 --porta-b=3100 \
//     --rodadas=8 --repeticoes=3 --aquecimento=1 --saida=docs/perf/f58-ab-ttfb.json --tmp=<pasta das rodadas>
// =============================================================================

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const opcao = (nome, padrao) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? padrao
function recusar(motivo) {
  console.error(`[ab-local] RECUSADO: ${motivo}`)
  process.exit(2)
}
const caminho = (p) => (isAbsolute(p) ? p : join(RAIZ, p))

const portaA = opcao('porta-a')
const portaB = opcao('porta-b')
if (!/^\d{4,5}$/.test(portaA ?? '') || !/^\d{4,5}$/.test(portaB ?? '') || portaA === portaB) recusar('informe --porta-a e --porta-b diferentes.')
const RODADAS = Number(opcao('rodadas', '8'))
const REPETICOES = opcao('repeticoes', '3')
const AQUECIMENTO = opcao('aquecimento', '1')
const PERSONA = opcao('persona')
const SAIDA = opcao('saida')
const TMP = opcao('tmp')
if (!SAIDA || !TMP) recusar('informe --saida=<json> e --tmp=<pasta das rodadas>.')
if (!Number.isInteger(RODADAS) || RODADAS < 2) recusar('--rodadas precisa ser inteiro ≥ 2 (a alternância exige par de ordens).')
mkdirSync(caminho(TMP), { recursive: true })

async function saude(porta) {
  const r = await fetch(`http://localhost:${porta}/api/saude`, { signal: AbortSignal.timeout(20000) })
  const corpo = await r.json().catch(() => ({}))
  return { http: r.status, versao: corpo.versao ?? null, commit: corpo.commit ?? corpo.sha ?? null }
}
const identidade = { A: await saude(portaA), B: await saude(portaB) }
console.log(`[ab-local] A (antes)  :${portaA} · versão ${identidade.A.versao} · commit ${identidade.A.commit ?? '?'}`)
console.log(`[ab-local] B (depois) :${portaB} · versão ${identidade.B.versao} · commit ${identidade.B.commit ?? '?'}`)
if (identidade.A.http !== 200 || identidade.B.http !== 200) recusar('um dos servidores não respondeu 200 em /api/saude.')

const medianasPorRota = { A: new Map(), B: new Map() } // chave `rota|sessao` → [ttfb_mediana por rodada]
const falhas = []
const inicio = new Date().toISOString()

for (let k = 1; k <= RODADAS; k++) {
  const ordem = k % 2 === 1 ? ['A', 'B'] : ['B', 'A']
  for (const lado of ordem) {
    const porta = lado === 'A' ? portaA : portaB
    const arquivo = join(caminho(TMP), `${lado}-r${k}.json`)
    const args = [
      join(RAIZ, 'scripts', 'perf', 'medir-local.mjs'),
      `--porta=${porta}`,
      `--rotulo=f58-ab-${lado.toLowerCase()}-r${k}`,
      `--repeticoes=${REPETICOES}`,
      `--aquecimento=${AQUECIMENTO}`,
      `--saida=${arquivo}`,
      ...(PERSONA ? [`--persona=${PERSONA}`] : []),
    ]
    const r = spawnSync(process.execPath, args, { cwd: RAIZ, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    if (r.status !== 0) {
      falhas.push({ rodada: k, lado, codigo: r.status })
      console.log(`[ab-local] rodada ${k} · ${lado}: medir-local saiu ${r.status}`)
      continue
    }
    const rel = JSON.parse(readFileSync(arquivo, 'utf8'))
    for (const rota of rel.rotas) {
      const chave = `${rota.rota}|${rota.sessao}`
      if (!medianasPorRota[lado].has(chave)) medianasPorRota[lado].set(chave, [])
      if (rota.ttfb_mediana !== null) medianasPorRota[lado].get(chave).push(rota.ttfb_mediana)
      if (rota.falhas > 0 || rota.status.some((s) => s !== 200)) falhas.push({ rodada: k, lado, rota: chave, status: rota.status, falhas: rota.falhas })
    }
    console.log(`[ab-local] rodada ${k}/${RODADAS} · ${lado} ok`)
  }
}

const mediana = (xs) => {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const r1 = (x) => (x === null ? null : Math.round(x * 10) / 10)
const r3 = (x) => (x === null ? null : Math.round(x * 1000) / 1000)

const chaves = [...new Set([...medianasPorRota.A.keys(), ...medianasPorRota.B.keys()])]
const bruto = new Map(
  chaves.map((c) => {
    const a = mediana(medianasPorRota.A.get(c) ?? [])
    const b = mediana(medianasPorRota.B.get(c) ?? [])
    return [c, { a, b, razao: a && b ? b / a : null, rodadasA: medianasPorRota.A.get(c)?.length ?? 0, rodadasB: medianasPorRota.B.get(c)?.length ?? 0 }]
  }),
)
const controle = (prefixo) => [...bruto].find(([c]) => c.startsWith(prefixo))?.[1]?.razao ?? null
const cAjuda = controle('/ajuda')
const cSvg = controle('/vercel.svg')
if (!cAjuda || !cSvg) recusar('um dos controles (/ajuda, /vercel.svg) não tem medida nos dois lados.')

const rotas = [...bruto].map(([c, v]) => {
  const ehControle = c.startsWith('/ajuda|') || c.startsWith('/vercel.svg')
  const normAjuda = v.razao !== null ? v.razao / cAjuda : null
  const normSvg = v.razao !== null ? v.razao / cSvg : null
  return {
    rota: c,
    controle: ehControle,
    ttfb_mediana_a: r1(v.a),
    ttfb_mediana_b: r1(v.b),
    rodadas_a: v.rodadasA,
    rodadas_b: v.rodadasB,
    razao_bruta: r3(v.razao),
    normalizada_por_ajuda: r3(normAjuda),
    normalizada_por_svg: r3(normSvg),
    acima_de_10pct: !ehControle && normAjuda !== null && normAjuda > 1.1,
  }
})
const reprovadas = rotas.filter((r) => r.acima_de_10pct)
const relatorio = {
  o_que_e: 'A/B de TTFB intercalado F58 · Frente F — só tempo e status; nenhum id, nenhum valor.',
  metodo: { rodadas: RODADAS, repeticoes_por_rodada: Number(REPETICOES), aquecimento: Number(AQUECIMENTO), ordem: 'alternada por rodada', agregacao: 'mediana das medianas por rodada', controles: ['/ajuda', '/vercel.svg'], gate: 'nenhuma rota acima de +10% normalizada por /ajuda' },
  identidade,
  inicio,
  fim: new Date().toISOString(),
  controles: { ajuda_razao_bruta: r3(cAjuda), vercel_svg_razao_bruta: r3(cSvg) },
  falhas,
  rotas,
  reprovadas: reprovadas.map((r) => r.rota),
}
mkdirSync(dirname(caminho(SAIDA)), { recursive: true })
writeFileSync(caminho(SAIDA), JSON.stringify(relatorio, null, 2) + '\n')

console.log('\n| Rota | A (ms) | B (ms) | B/A bruto | normalizado /ajuda | normalizado /vercel.svg |')
console.log('|---|---:|---:|---:|---:|---:|')
for (const r of rotas) console.log(`| \`${r.rota}\`${r.controle ? ' (controle)' : ''} | ${r.ttfb_mediana_a} | ${r.ttfb_mediana_b} | ${r.razao_bruta} | ${r.normalizada_por_ajuda}${r.acima_de_10pct ? ' ⚠' : ''} | ${r.normalizada_por_svg} |`)
console.log(`\n[ab-local] ${rotas.length} rotas · ${falhas.length} falha(s) · ${reprovadas.length} acima de +10% normalizado · ${SAIDA}`)
process.exit(reprovadas.length > 0 || falhas.length > 0 ? 1 : 0)
