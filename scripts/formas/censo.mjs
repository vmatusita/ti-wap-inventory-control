// =============================================================================
// censo.mjs — quantas linhas e quantos NULOS por coluna o app lê (F58 · Frente A)
// =============================================================================
// POR QUE ELE VEM ANTES DE QUALQUER SCHEMA
//
// A F58 põe um schema Zod em cada leitura que hoje apaga o tipo com um cast, e a decisão i
// do Johnny (15/09/2026) faz forma errada LANÇAR em produção. O `database.ts` gerado mente
// nos dois sentidos — tipa toda coluna de `returns table` como não-nula e toda coluna de
// VIEW como anulável (fato 8) —, então um schema copiado dele é palpite, e palpite errado é
// tela quebrada. Este censo CONTA, no banco de verdade, o que o schema vai encontrar:
// linhas e nulos por coluna de cada tabela e view que `src/**` lê, e de cada retorno de
// `rel_*`. O total de linhas é também o volume do benchmark de lote (Frente F).
//
// O QUE ELE IMPRIME E GRAVA: nome de relação, nome de coluna e NÚMERO. Nenhum valor de
// linha, nenhum id, nenhum slug, nenhum e-mail. As linhas de `rel_*` passam pela memória
// para serem contadas e são descartadas.
//
// SÓ LEITURA, SEM EXCEÇÃO
//  · tabelas e views: `select ... { count: 'exact', head: true }` (HEAD, nenhuma linha
//    trafega) — só a amostragem de fallback de view lenta traz linhas, e só para contar;
//  · RPCs: SÓ as `rel_*` que `src/**` chama, e cada uma é conferida no CORPO VIVO antes
//    da primeira chamada — `stable`/`immutable` e sem insert/update/delete (falha fechada);
//  · a única escrita tolerada é a sessão que o login grava no Supabase Auth — a mesma do
//    smoke pós-deploy.
//
// OS DOIS ALVOS, com a identidade conferida ANTES da primeira leitura
//  · `--alvo=ensaio`   → `NEXT_PUBLIC_*` + persona fictícia do seed; exige ref = SEED_PROJECT_REF;
//  · `--alvo=producao` → `SMOKE_*` (a conta do ritual pós-deploy); exige ref ≠ SEED_PROJECT_REF
//    e ref ∈ `REFS_DE_PRODUCAO_CONHECIDOS` (lido de `scripts/env-guard.ts`, não redigitado).
//  Qualquer outra combinação recusa.
//
// USO
//   node --env-file=.env.local scripts/formas/censo.mjs --alvo=ensaio   --saida=docs/f58-evidencias/censo-ensaio.json
//   node --env-file=.env.local scripts/formas/censo.mjs --alvo=producao --saida=docs/f58-evidencias/censo-producao.json
// =============================================================================

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { conjuntosDoArquivoDeTipos } from '../db/tipos-conjuntos.mjs'
import { corpoVigente } from '../db/corpo-vigente.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function opcao(nome) {
  const pref = `--${nome}=`
  const a = process.argv.find((x) => x.startsWith(pref))
  return a ? a.slice(pref.length) : undefined
}
function recusar(motivo) {
  console.error(`[censo] RECUSADO: ${motivo}`)
  process.exit(2)
}
const refDe = (url) => {
  try {
    return new URL(url).hostname.split('.')[0] || ''
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// 1. O alvo e a identidade
// ---------------------------------------------------------------------------
const alvo = opcao('alvo')
if (alvo !== 'ensaio' && alvo !== 'producao') recusar('informe --alvo=ensaio ou --alvo=producao.')
const saida = opcao('saida')

const refEnsaio = process.env.SEED_PROJECT_REF ?? ''
if (!refEnsaio) recusar('SEED_PROJECT_REF ausente (rode com --env-file=.env.local).')
const envGuard = readFileSync(join(RAIZ, 'scripts', 'env-guard.ts'), 'utf8')
const refsProducao = [
  ...(/REFS_DE_PRODUCAO_CONHECIDOS\s*=\s*\[([^\]]*)\]/.exec(envGuard)?.[1] ?? '').matchAll(/'([a-z0-9]+)'/g),
].map((m) => m[1])
if (refsProducao.length === 0) recusar('não li REFS_DE_PRODUCAO_CONHECIDOS de scripts/env-guard.ts.')

let url, anon, email, senha
if (alvo === 'ensaio') {
  url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  email = process.env.PERF_PERSONA || 'seed.dev@wap.ind.br'
  if (!/^seed\.[a-z]+@wap\.ind\.br$/.test(email)) recusar('no ensaio a persona tem de ser FICTÍCIA (seed.<x>@wap.ind.br).')
  const fonteSeed = readFileSync(join(RAIZ, 'scripts', 'seed.ts'), 'utf8')
  senha = /const\s+SENHA_PERFIS_SEED\s*=\s*['"]([^'"]+)['"]/.exec(fonteSeed)?.[1] ?? ''
  if (refDe(url) !== refEnsaio) recusar('o ref de NEXT_PUBLIC_SUPABASE_URL não é o SEED_PROJECT_REF.')
  if (refsProducao.includes(refDe(url))) recusar('o ref do "ensaio" é um ref de produção conhecido.')
} else {
  url = process.env.SMOKE_SUPABASE_URL ?? ''
  anon = process.env.SMOKE_SUPABASE_ANON_KEY ?? ''
  email = process.env.SMOKE_EMAIL ?? ''
  senha = process.env.SMOKE_SENHA ?? ''
  const ref = refDe(url)
  if (!url || !anon || !email || !senha) recusar('faltam SMOKE_SUPABASE_URL/ANON_KEY/EMAIL/SENHA.')
  if (ref === refEnsaio) recusar('SMOKE_SUPABASE_URL aponta para o ENSAIO — não é produção.')
  if (!refsProducao.includes(ref)) recusar('o ref de SMOKE_SUPABASE_URL não é um ref de produção conhecido.')
}
if (!url || !anon || !senha) recusar('credencial incompleta para o alvo.')

console.log(`[censo] alvo ${alvo.toUpperCase()} · ref ${refDe(url)} · só leitura`)

// ---------------------------------------------------------------------------
// 2. O que o app lê: relações (de `database.ts`) cruzadas com `.from('x')` em src/**
// ---------------------------------------------------------------------------
const tiposTexto = readFileSync(join(RAIZ, 'src', 'lib', 'types', 'database.ts'), 'utf8')
const { relacoes, colunas } = conjuntosDoArquivoDeTipos(tiposTexto)
const viewsDeclaradas = new Set(
  [...tiposTexto.matchAll(/^\s{6}(v_[a-z_]+): \{/gm)].map((m) => m[1]),
)

function varrer(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) varrer(p, acc)
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(p)
  }
  return acc
}
const lidasPor = new Map() // relação → Set de arquivos
const rpcsLidas = new Set()
for (const arq of varrer(join(RAIZ, 'src'))) {
  const fonte = readFileSync(arq, 'utf8')
  const rel = relative(RAIZ, arq).split(sep).join('/')
  for (const m of fonte.matchAll(/\.from\(\s*['"`]([a-z_]+)['"`]/g)) {
    if (!relacoes.has(m[1])) continue
    if (!lidasPor.has(m[1])) lidasPor.set(m[1], new Set())
    lidasPor.get(m[1]).add(rel)
  }
  for (const m of fonte.matchAll(/['"`](rel_[a-z_]+)['"`]/g)) rpcsLidas.add(m[1])
}
// As tabelas que o backup lê por NOME EM VARIÁVEL (`tabela()` em conflitos/dev-destrutivo/
// import-logs) já aparecem literais em outros pontos; a conferência abaixo o prova.
const relacoesDoApp = [...lidasPor.keys()].sort()

// ---------------------------------------------------------------------------
// 3. Sessão
// ---------------------------------------------------------------------------
const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
{
  const { data, error } = await db.auth.signInWithPassword({ email, password: senha })
  if (error || !data?.session) recusar(`login recusado (${error?.status ?? '?'} ${error?.code ?? ''}).`)
}
console.log('[censo] login ok')

const TIMEOUT_PG = '57014'
const inicio = new Date().toISOString()

async function comLimite(itens, limite, fn) {
  const out = new Array(itens.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, async () => {
      for (;;) {
        const k = i++
        if (k >= itens.length) return
        out[k] = await fn(itens[k], k)
      }
    }),
  )
  return out
}

const descrever = (e) => (e ? `${e.code ?? '?'}` : null)

// ---------------------------------------------------------------------------
// 4. Tabelas e views — HEAD com count exato; view lenta cai para amostragem
// ---------------------------------------------------------------------------
async function contarRelacao(relacao) {
  const cols = [...colunas].filter((c) => c.startsWith(`${relacao}.`)).map((c) => c.slice(relacao.length + 1)).sort()
  const tipo = viewsDeclaradas.has(relacao) ? 'view' : 'tabela'
  const total = await db.from(relacao).select('*', { count: 'exact', head: true })
  const registro = { relacao, tipo, lida_por_arquivos: lidasPor.get(relacao)?.size ?? 0, colunas: cols.length }
  if (total.error) {
    if (total.error.code === TIMEOUT_PG) return { ...registro, ...(await amostrar(relacao, cols)) }
    return { ...registro, metodo: 'erro', erro: descrever(total.error) }
  }
  const nulos = {}
  const erros = {}
  let estourou = false
  await comLimite(cols, 4, async (col) => {
    if (estourou) return
    const r = await db.from(relacao).select(col, { count: 'exact', head: true }).is(col, null)
    if (r.error) {
      if (r.error.code === TIMEOUT_PG) estourou = true
      erros[col] = descrever(r.error)
    } else nulos[col] = r.count ?? 0
  })
  if (estourou) return { ...registro, linhas: total.count, ...(await amostrar(relacao, cols)) }
  return { ...registro, metodo: 'count exato (HEAD)', linhas: total.count ?? 0, nulos, ...(Object.keys(erros).length ? { erros } : {}) }
}

// Fallback declarado: página a página, contando nulos em memória. Nenhum valor sai.
async function amostrar(relacao, cols) {
  const PAGINA = 500
  const MAX_PAGINAS = 20
  const nulos = Object.fromEntries(cols.map((c) => [c, 0]))
  let lidas = 0
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const r = await db.from(relacao).select(cols.join(',')).range(p * PAGINA, (p + 1) * PAGINA - 1)
    if (r.error) return { metodo: `amostragem interrompida na página ${p + 1}`, amostra_linhas: lidas, nulos, erro: descrever(r.error) }
    for (const linha of r.data ?? []) {
      lidas++
      for (const c of cols) if (linha[c] === null || linha[c] === undefined) nulos[c]++
    }
    if ((r.data ?? []).length < PAGINA) return { metodo: `varredura por páginas de ${PAGINA} (count exato estourou o statement_timeout)`, linhas: lidas, nulos }
  }
  return { metodo: `AMOSTRA de ${lidas} linhas (${MAX_PAGINAS} páginas de ${PAGINA}; count exato estourou)`, amostra_linhas: lidas, nulos }
}

console.log(`[censo] ${relacoesDoApp.length} relações lidas por src/** — contando…`)
const resultadosRel = await comLimite(relacoesDoApp, 3, contarRelacao)

// ---------------------------------------------------------------------------
// 5. Retornos de `rel_*` — só as que src/** chama, cada uma conferida no corpo vivo
// ---------------------------------------------------------------------------
function exigirSoLeitura(nome) {
  const { sql } = corpoVigente(nome, RAIZ)
  const semComentario = sql.replace(/--[^\n]*/g, '')
  const cabecalho = semComentario.slice(0, semComentario.search(/\bas\s+\$/i) === -1 ? 400 : semComentario.search(/\bas\s+\$/i))
  const depoisDoCorpo = semComentario.slice(semComentario.lastIndexOf('$'))
  const volatil = /\b(stable|immutable)\b/i.test(cabecalho) || /\b(stable|immutable)\b/i.test(depoisDoCorpo)
  const escreve = /\b(insert\s+into|update\s+[a-z_.]+\s+set|delete\s+from)\b/i.test(semComentario)
  if (!volatil || escreve) throw new Error(`${nome} não é chamável: stable/immutable=${volatil}, escreve=${escreve}`)
}

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const diasAtras = (n) => {
  const d = new Date(`${hoje}T12:00:00-03:00`)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function contarLinhas(nome, chamada, linhas) {
  const nulos = {}
  for (const l of linhas) for (const [k, v] of Object.entries(l)) {
    nulos[k] ??= 0
    if (v === null || v === undefined) nulos[k]++
  }
  return { funcao: nome, chamada, linhas: linhas.length, nulos }
}

async function paginarRpc(nome, args, ordem) {
  const acc = []
  for (let de = 0; ; de += 1000) {
    let q = db.rpc(nome, args)
    if (ordem) q = q.order(ordem, { ascending: true })
    const r = await q.range(de, de + 999)
    if (r.error) throw Object.assign(new Error(nome), { codigo: r.error.code })
    acc.push(...(r.data ?? []))
    if ((r.data ?? []).length < 1000) return acc
    if (de > 200_000) throw new Error(`${nome}: teto`)
  }
}

const resultadosRpc = []
const MATRIZ = {
  rel_estoque_asof: [
    ['consolidado · hoje', { p_filial: null, p_data: hoje }, 'ativo_id'],
    ['consolidado · 180 dias atrás', { p_filial: null, p_data: diasAtras(180) }, 'ativo_id'],
  ],
  rel_saldo_itens: [['consolidado · hoje', { p_filial: null, p_ate: hoje }, 'item_id']],
  rel_mov_itens: [['consolidado · 365 dias', { p_filial: null, p_de: diasAtras(365), p_ate: hoje }, 'item_id']],
  rel_frescor_itens: [['consolidado · hoje', { p_filial: null, p_ate: hoje }, null]],
  rel_mov_por_mes: [['consolidado · 365 dias', { p_filial: null, p_de: diasAtras(365), p_ate: hoje }, null]],
  rel_por_motivo: [['consolidado · 365 dias', { p_filial: null, p_de: diasAtras(365), p_ate: hoje }, null]],
  rel_resumo: [['consolidado · 365 dias', { p_filial: null, p_de: diasAtras(365), p_ate: hoje }, null]],
}
for (const nome of [...rpcsLidas].sort()) {
  try {
    exigirSoLeitura(nome)
  } catch (e) {
    resultadosRpc.push({ funcao: nome, chamada: 'não chamada', erro: e.message })
    continue
  }
  if (nome === 'rel_saldo_colaborador') {
    // Amostra de pessoas: os ids passam pela memória e nunca saem daqui.
    const pessoas = await db.from('colaboradores').select('id').order('id').limit(40)
    if (pessoas.error) {
      resultadosRpc.push({ funcao: nome, chamada: 'amostra de pessoas', erro: descrever(pessoas.error) })
      continue
    }
    const linhas = []
    for (const p of pessoas.data ?? []) {
      const r = await db.rpc(nome, { p_colaborador: p.id })
      if (r.error) {
        resultadosRpc.push({ funcao: nome, chamada: 'amostra de pessoas', erro: descrever(r.error) })
        break
      }
      linhas.push(...(r.data ?? []))
    }
    resultadosRpc.push({ ...contarLinhas(nome, `amostra de ${pessoas.data?.length ?? 0} pessoas`, linhas) })
    continue
  }
  for (const [rotulo, args, ordem] of MATRIZ[nome] ?? []) {
    try {
      resultadosRpc.push(contarLinhas(nome, rotulo, await paginarRpc(nome, args, ordem)))
    } catch (e) {
      resultadosRpc.push({ funcao: nome, chamada: rotulo, erro: e.codigo ?? e.message })
    }
  }
  if (!MATRIZ[nome]) resultadosRpc.push({ funcao: nome, chamada: 'sem matriz declarada no censo', erro: 'NÃO MEDIDA' })
}

await db.auth.signOut().catch(() => {})

// ---------------------------------------------------------------------------
// 6. Saída — só nomes e números
// ---------------------------------------------------------------------------
const totalLinhas = resultadosRel.reduce((n, r) => n + (typeof r.linhas === 'number' ? r.linhas : 0), 0)
const relatorio = {
  o_que_e: 'Censo F58 · Frente A — linhas e nulos por coluna do que src/** lê. Só nomes e números; nenhum valor.',
  alvo,
  inicio,
  fim: new Date().toISOString(),
  total_linhas_relacoes: totalLinhas,
  relacoes: resultadosRel,
  rpcs: resultadosRpc,
}
if (saida) {
  mkdirSync(dirname(join(RAIZ, saida)), { recursive: true })
  writeFileSync(join(RAIZ, saida), JSON.stringify(relatorio, null, 2) + '\n', 'utf8')
  console.log(`[censo] gravado em ${saida}`)
}
for (const r of resultadosRel) {
  const nulosTxt = r.nulos ? Object.entries(r.nulos).filter(([, n]) => n > 0).map(([c, n]) => `${c}=${n}`).join(' ') : ''
  console.log(`  ${r.tipo.padEnd(6)} ${r.relacao.padEnd(34)} ${String(r.linhas ?? r.amostra_linhas ?? '—').padStart(7)}  ${r.metodo ?? ''}${r.erro ? ` ERRO ${r.erro}` : ''}${nulosTxt ? `  nulos: ${nulosTxt}` : ''}`)
}
for (const r of resultadosRpc) {
  const nulosTxt = r.nulos ? Object.entries(r.nulos).filter(([, n]) => n > 0).map(([c, n]) => `${c}=${n}`).join(' ') : ''
  console.log(`  rpc    ${r.funcao.padEnd(34)} ${String(r.linhas ?? '—').padStart(7)}  ${r.chamada}${r.erro ? ` ERRO ${r.erro}` : ''}${nulosTxt ? `  nulos: ${nulosTxt}` : ''}`)
}
console.log(`[censo] total de linhas nas relações: ${totalLinhas}`)
