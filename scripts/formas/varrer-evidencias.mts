// =============================================================================
// varrer-evidencias.mts — nenhum dado real nas evidências da F58 (critério 32)
// =============================================================================
// Varre os arquivos de `docs/f58-evidencias/` (e os caminhos extras passados) atrás de:
//  · patrimônio no formato canônico (`WAP` + 7 dígitos);
//  · endereço de e-mail;
//  · UUID;
//  · o NOME e o SLUG de cada filial REAL — carregados, em memória, da própria produção (só leitura,
//    pela conta do smoke), e NUNCA gravados, impressos ou comparados fora deste processo.
// As sentinelas FICTÍCIAS que os testes e as sabotagens usam de propósito ficam numa lista nominal.
//
// A SAÍDA é só contagem por arquivo e por categoria. O valor casado não sai — nem na tela, nem no
// arquivo. Sai 1 quando há ocorrência.
//
// USO
//   npx tsx --env-file=.env.local scripts/formas/varrer-evidencias.mts [--saida=arquivo.json] [caminho …]
// =============================================================================

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
function recusar(motivo: string): never {
  console.error(`[varrer] RECUSADO: ${motivo}`)
  process.exit(2)
}
const refDe = (url: string) => {
  try {
    return new URL(url).hostname.split('.')[0] ?? ''
  } catch {
    return ''
  }
}

// As sentinelas fictícias — cada uma com o lugar que a usa. Qualquer outra ocorrência conta.
const FICTICIOS = new Set([
  'WAP0009876', // linhas-sem-valor.test.ts (sabotagem F)
  'WAP0001234', // fixture fictícia do import (regra 2 do CLAUDE.md)
  'fulano.sentinela@wap.ind.br', // linhas-sem-valor.test.ts (sabotagem F)
  '11111111-2222-4333-8444-555555555555', // linhas-sem-valor.test.ts (sabotagem F)
  'seed.consulta@wap.ind.br', // persona FICTÍCIA do ensaio (scripts/seed.ts)
])

const PADROES: Record<string, RegExp> = {
  patrimonio: /\bWAP\d{7}\b/g,
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  uuid: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
}

// ---------------------------------------------------------------------------
// 1. Identidade de PRODUÇÃO antes de ler — o molde do conferidor
// ---------------------------------------------------------------------------
const refEnsaio = process.env.SEED_PROJECT_REF ?? ''
const envGuard = readFileSync(join(RAIZ, 'scripts', 'env-guard.ts'), 'utf8')
const refsProducao = [...(/REFS_DE_PRODUCAO_CONHECIDOS\s*=\s*\[([^\]]*)\]/.exec(envGuard)?.[1] ?? '').matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1])
const url = process.env.SMOKE_SUPABASE_URL ?? ''
const anon = process.env.SMOKE_SUPABASE_ANON_KEY ?? ''
const email = process.env.SMOKE_EMAIL ?? ''
const senha = process.env.SMOKE_SENHA ?? ''
if (!refEnsaio || refsProducao.length === 0) recusar('SEED_PROJECT_REF ou REFS_DE_PRODUCAO_CONHECIDOS ausentes.')
if (!url || !anon || !email || !senha) recusar('faltam SMOKE_SUPABASE_URL/ANON_KEY/EMAIL/SENHA.')
if (refDe(url) === refEnsaio || !refsProducao.includes(refDe(url))) recusar('SMOKE_SUPABASE_URL não é um ref de produção conhecido.')
console.log(`[varrer] nomes e slugs de filial lidos de PRODUÇÃO · ref ${refDe(url)} · só leitura, só em memória`)

const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
{
  const { data, error } = await db.auth.signInWithPassword({ email, password: senha })
  if (error || !data?.session) recusar(`login recusado (${error?.status ?? '?'}).`)
}
const { data: filiais, error: errFiliais } = await db.from('filiais').select('nome, slug')
await db.auth.signOut().catch(() => {})
if (errFiliais || !filiais || filiais.length === 0) recusar(`não li as filiais (${errFiliais?.code ?? 'vazio'}).`)

// Termos de filial: nome e slug, sem caixa. Termo curto demais (≤ 2) colidiria com qualquer texto — sai
// da comparação e é CONTADO na saída, para ninguém achar que foi varrido.
const termos = new Set<string>()
let termosCurtos = 0
for (const f of filiais) {
  for (const t of [f.nome, f.slug]) {
    const v = String(t ?? '').trim().toLowerCase()
    if (v.length <= 2) termosCurtos++
    else termos.add(v)
  }
}
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const reFilial = new RegExp(`(?<![\\p{L}\\p{N}])(${[...termos].map(escapar).join('|')})(?![\\p{L}\\p{N}])`, 'giu')

// ---------------------------------------------------------------------------
// 2. A varredura
// ---------------------------------------------------------------------------
const extras = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const saida = process.argv.find((a) => a.startsWith('--saida='))?.slice('--saida='.length)
const alvos = [join(RAIZ, 'docs', 'f58-evidencias'), ...extras.map((e) => join(RAIZ, e))]

function arquivos(p: string, acc: string[] = []): string[] {
  const st = statSync(p)
  if (st.isFile()) acc.push(p)
  else for (const e of readdirSync(p)) arquivos(join(p, e), acc)
  return acc
}

type Contagem = { arquivo: string; patrimonio: number; email: number; uuid: number; filial: number; ficticios: number }
const resultado: Contagem[] = []
for (const arq of alvos.flatMap((a) => arquivos(a))) {
  const texto = readFileSync(arq, 'utf8')
  const c: Contagem = { arquivo: relative(RAIZ, arq).split(sep).join('/'), patrimonio: 0, email: 0, uuid: 0, filial: 0, ficticios: 0 }
  for (const [cat, re] of Object.entries(PADROES)) {
    for (const m of texto.matchAll(re)) {
      if (FICTICIOS.has(m[0]) || FICTICIOS.has(m[0].toLowerCase())) c.ficticios++
      else c[cat as 'patrimonio' | 'email' | 'uuid']++
    }
  }
  c.filial = [...texto.matchAll(reFilial)].length
  resultado.push(c)
}

const sujos = resultado.filter((c) => c.patrimonio + c.email + c.uuid + c.filial > 0)
const resumo = {
  gerado_em: new Date().toISOString(),
  arquivos: resultado.length,
  filiais_lidas: filiais.length,
  termos_de_filial_comparados: termos.size,
  termos_curtos_fora_da_comparacao: termosCurtos,
  arquivos_com_ocorrencia: sujos.length,
  por_arquivo: resultado,
}
if (saida) writeFileSync(isAbsolute(saida) ? saida : join(RAIZ, saida), JSON.stringify(resumo, null, 2) + '\n')
for (const c of resultado) {
  const t = c.patrimonio + c.email + c.uuid + c.filial
  console.log(`${t === 0 ? 'limpo' : 'OCORRÊNCIA'}  ${c.arquivo}  patrimônio ${c.patrimonio} · e-mail ${c.email} · uuid ${c.uuid} · filial ${c.filial} · fictícios ${c.ficticios}`)
}
console.log(`[varrer] ${resultado.length} arquivo(s), ${sujos.length} com ocorrência · ${termos.size} termo(s) de filial comparados, ${termosCurtos} curto(s) fora`)
process.exit(sujos.length > 0 ? 1 : 0)
