// A MEDIÇÃO B2 DA v1.71.2 — quantos cadastros de colaborador estão SEM USO, SÓ CONTAGENS, só leitura.
//
//   npx tsx --env-file=.env.local scripts/colaboradores/medir-uso.mts --alvo=producao|ensaio [--saida=arquivo.json]
//
// POR QUE ESTE INSTRUMENTO EXISTE. A regra do uso efetivo mora no banco, na função `colaboradores_uso_efetivo()`
// (migration 0180). Para medir o "antes" — e, depois do apply, conferir que o selo "Sem uso" da tela bate com a regra
// (critério A8) — o caminho natural é o SQL só-leitura pelo conector da Supabase; quando ele não alcança o projeto (a
// run da v1.71.2 teve o conector ligado a outra conta), este script mede o mesmo pela API de leitura do app, com uma
// sessão de CONSULTA (a RLS de quem lê, como a tela). A regra é a MESMA, por extenso (docs/PLAN-v1.71.1-v1.71.2.md
// §2.2), e a chave do nome é `chaveColaborador` — o espelho de `colaborador_chave` provado por chave-sql.test.ts.
//
// O QUE ELE NÃO FAZ. Não escreve nada, não chama RPC, não imprime nome, id, patrimônio, filial nem e-mail: lê as quatro
// tabelas por páginas (keyset pelo `id`), confere que leu TUDO (`count exact` de cada uma, ou para), calcula em memória e
// imprime SÓ números. As credenciais entram por `--env-file` (o valor nunca passa por mão); o alvo é conferido antes do
// login: produção pelo ref conhecido de scripts/env-guard.ts, ensaio pela persona FICTÍCIA do seed (o molde de
// scripts/formas/conferir.mts).

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { chaveColaborador } from '../../src/lib/colaboradores/chave'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const opcao = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? ''
function recusar(motivo: string): never {
  console.error(`[medir-uso] RECUSADO: ${motivo}`)
  process.exit(2)
}
const refDe = (u: string) => {
  try {
    return new URL(u).hostname.split('.')[0] ?? ''
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// 1. O alvo, conferido antes do login
// ---------------------------------------------------------------------------
const alvo = opcao('alvo')
if (alvo !== 'ensaio' && alvo !== 'producao') recusar('informe --alvo=ensaio ou --alvo=producao.')
const refEnsaio = process.env.SEED_PROJECT_REF ?? ''
if (!refEnsaio) recusar('SEED_PROJECT_REF ausente (rode com --env-file=.env.local).')
const envGuard = readFileSync(join(RAIZ, 'scripts', 'env-guard.ts'), 'utf8')
const refsProducao = [...(/REFS_DE_PRODUCAO_CONHECIDOS\s*=\s*\[([^\]]*)\]/.exec(envGuard)?.[1] ?? '').matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1])
if (refsProducao.length === 0) recusar('não li REFS_DE_PRODUCAO_CONHECIDOS de scripts/env-guard.ts.')

let url = ''
let anon = ''
let email = ''
let senha = ''
if (alvo === 'ensaio') {
  url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  email = 'seed.consulta@wap.ind.br'
  senha = /const\s+SENHA_PERFIS_SEED\s*=\s*['"]([^'"]+)['"]/.exec(readFileSync(join(RAIZ, 'scripts', 'seed.ts'), 'utf8'))?.[1] ?? ''
  if (refDe(url) !== refEnsaio) recusar('o ref de NEXT_PUBLIC_SUPABASE_URL não é o SEED_PROJECT_REF.')
  if (refsProducao.includes(refDe(url))) recusar('o ref do "ensaio" é um ref de produção conhecido.')
} else {
  url = process.env.SMOKE_SUPABASE_URL ?? ''
  anon = process.env.SMOKE_SUPABASE_ANON_KEY ?? ''
  email = process.env.SMOKE_EMAIL ?? ''
  senha = process.env.SMOKE_SENHA ?? ''
  if (!url || !anon || !email || !senha) recusar('faltam SMOKE_SUPABASE_URL/ANON_KEY/EMAIL/SENHA.')
  if (refDe(url) === refEnsaio) recusar('SMOKE_SUPABASE_URL aponta para o ENSAIO — não é produção.')
  if (!refsProducao.includes(refDe(url))) recusar('o ref de SMOKE_SUPABASE_URL não é um ref de produção conhecido.')
}
if (!url || !anon || !senha) recusar('credencial incompleta para o alvo.')
console.log(`[medir-uso] alvo ${alvo.toUpperCase()} · ref ${refDe(url)} · só leitura, só contagens`)

const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
{
  const { data, error } = await db.auth.signInWithPassword({ email, password: senha })
  if (error || !data?.session) recusar(`login recusado (${error?.status ?? '?'}).`)
}

// ---------------------------------------------------------------------------
// 2. A leitura — tudo, por keyset, conferido contra o count exato
// ---------------------------------------------------------------------------
type Linha = Record<string, string | boolean | null>
async function lerTudo(tabela: string, colunas: string): Promise<Linha[]> {
  const { count, error: erroCount } = await db.from(tabela).select('id', { count: 'exact', head: true })
  if (erroCount || count === null) recusar(`não contei ${tabela} (${erroCount?.code ?? 'sem count'}).`)
  const linhas: Linha[] = []
  let depoisDe: string | null = null
  for (;;) {
    let q = db.from(tabela).select(colunas).order('id', { ascending: true }).limit(1000)
    if (depoisDe !== null) q = q.gt('id', depoisDe)
    const { data, error } = await q
    if (error) recusar(`falha ao ler ${tabela} (${error.code}).`)
    const pagina = (data ?? []) as unknown as Linha[]
    linhas.push(...pagina)
    if (pagina.length === 0) break
    depoisDe = String(pagina[pagina.length - 1].id)
  }
  if (linhas.length !== count) recusar(`${tabela}: li ${linhas.length} de ${count} — a contagem não fecha.`)
  return linhas
}

const [colaboradores, movimentacoes, lancamentos, ativos] = await Promise.all([
  lerTudo('colaboradores', 'id, empresa_id, nome_chave, ativo'),
  lerTudo('movimentacoes', 'id, empresa_id, tipo, estorno_de, colaborador, colaborador_id'),
  lerTudo('lancamentos_item', 'id, empresa_id, estorna_id, colaborador, colaborador_id'),
  lerTudo('ativos', 'id, empresa_id, colaborador_atual'),
])
await db.auth.signOut().catch(() => {})

// ---------------------------------------------------------------------------
// 3. A regra (PLAN §2.2) — a mesma da função 0180, por extenso
// ---------------------------------------------------------------------------
const vazio = (t: string | boolean | null) => typeof t !== 'string' || t.trim() === ''
const estornadas = new Set(movimentacoes.filter((m) => m.estorno_de).map((m) => String(m.estorno_de)))
const desfeitos = new Set(lancamentos.filter((l) => l.estorna_id).map((l) => String(l.estorna_id)))

type Conta = { v: number; e: number }
const porId = new Map<string, Conta>()
const porChave = new Map<string, Conta>()
const somar = (mapa: Map<string, Conta>, k: string, vale: boolean) => {
  const c = mapa.get(k) ?? { v: 0, e: 0 }
  if (vale) c.v++
  else c.e++
  mapa.set(k, c)
}
const registrar = (empresa: string, idPessoa: string | boolean | null, texto: string | boolean | null, vale: boolean) => {
  if (typeof idPessoa === 'string') somar(porId, `${empresa}|${idPessoa}`, vale)
  else if (!vazio(texto)) somar(porChave, `${empresa}|${chaveColaborador(String(texto))}`, vale)
}
for (const m of movimentacoes) {
  if (m.tipo === 'estorno') continue
  registrar(String(m.empresa_id), m.colaborador_id, m.colaborador, !estornadas.has(String(m.id)))
}
for (const l of lancamentos) {
  registrar(String(l.empresa_id), l.colaborador_id, l.colaborador, !l.estorna_id && !desfeitos.has(String(l.id)))
}
const detentores = new Map<string, number>()
for (const a of ativos) {
  if (vazio(a.colaborador_atual)) continue
  const k = `${a.empresa_id}|${chaveColaborador(String(a.colaborador_atual))}`
  detentores.set(k, (detentores.get(k) ?? 0) + 1)
}
// "Registros" como a tela conta hoje: o embed por colaborador_id, de qualquer tipo
const registrosDaTela = new Map<string, number>()
for (const r of [...movimentacoes, ...lancamentos]) {
  if (typeof r.colaborador_id === 'string') registrosDaTela.set(r.colaborador_id, (registrosDaTela.get(r.colaborador_id) ?? 0) + 1)
}

const n = {
  cadastros_total: colaboradores.length,
  cadastros_ativos: 0,
  ativos_com_registros_como_a_tela: 0,
  sem_registro_por_id: 0,
  sem_id_salvos_pela_chave: 0,
  sem_id_salvos_so_pelo_detentor: 0,
  sem_uso_efetivo: 0,
  sem_uso_nunca_usado: 0,
  sem_uso_so_estornados: 0,
  com_id_mas_so_estornados_por_id: 0,
  movimentacoes_estorno: movimentacoes.filter((m) => m.tipo === 'estorno').length,
  empresas_com_colaborador: new Set(colaboradores.map((c) => String(c.empresa_id))).size,
}
for (const c of colaboradores) {
  if (c.ativo !== true) continue
  n.cadastros_ativos++
  const e = String(c.empresa_id)
  const pi = porId.get(`${e}|${c.id}`) ?? { v: 0, e: 0 }
  const pc = typeof c.nome_chave === 'string' ? (porChave.get(`${e}|${c.nome_chave}`) ?? { v: 0, e: 0 }) : { v: 0, e: 0 }
  const det = typeof c.nome_chave === 'string' ? (detentores.get(`${e}|${c.nome_chave}`) ?? 0) : 0
  if ((registrosDaTela.get(String(c.id)) ?? 0) > 0) n.ativos_com_registros_como_a_tela++
  if (pi.v + pi.e === 0) {
    n.sem_registro_por_id++
    if (pc.v > 0) n.sem_id_salvos_pela_chave++
    else if (det > 0) n.sem_id_salvos_so_pelo_detentor++
  }
  if (pi.v + pc.v + det === 0) {
    n.sem_uso_efetivo++
    if (pi.e + pc.e === 0) n.sem_uso_nunca_usado++
    else n.sem_uso_so_estornados++
  }
  if (pi.v === 0 && pi.e > 0) n.com_id_mas_so_estornados_por_id++
}

const lidas = {
  colaboradores: colaboradores.length,
  movimentacoes: movimentacoes.length,
  lancamentos_item: lancamentos.length,
  ativos: ativos.length,
}
console.log(JSON.stringify({ alvo, lidas, contagens: n }, null, 2))
const saida = opcao('saida')
if (saida) writeFileSync(resolve(RAIZ, saida), `${JSON.stringify({ alvo, lidas, contagens: n }, null, 2)}\n`)
