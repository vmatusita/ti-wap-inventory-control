// =============================================================================
// medir-maximos.mts — o MÁXIMO VIVO de cada coluna de texto das 20 tabelas de negócio (F66B · Frente A)
// =============================================================================
//   npx tsx --env-file=.env.local scripts/comprimento/medir-maximos.mts --alvo=producao|ensaio \
//     [--tetos=docs/f66b-evidencias/tetos-propostos.json] [--saida=arquivo.json]
//
// POR QUE ELE EXISTE. A régua do teto da F66B (decisão 2 do PLAN-F66B) exige que nenhum teto fique abaixo do maior valor
// vivo da coluna nos dois bancos. O caminho natural é o bloco SQL só leitura pelo conector da Supabase
// (`docs/f66b-evidencias/contagem-violacao.sql`, que continua sendo o PORTÃO de cada lote); quando o conector não alcança
// o projeto — a run da F66B começou com ele ligado a outra conta, como a da v1.71.2 —, este script mede o mesmo pela API
// de leitura do app, com uma sessão de CONSULTA (a RLS de quem lê, como a tela). O molde é
// `scripts/colaboradores/medir-uso.mts`.
//
// O QUE ELE NÃO FAZ. Não escreve nada, não chama RPC, não imprime valor, id, nome, patrimônio, filial nem e-mail: lê as
// tabelas por páginas (ordem total pela PK), confere que leu TUDO (`count exact` de cada uma, ou para), mede em memória e
// imprime SÓ números. As credenciais entram por `--env-file` (o valor nunca passa por mão); o alvo é conferido antes do
// login: produção pelo ref conhecido de scripts/env-guard.ts, ensaio pela persona FICTÍCIA do seed.
//
// O QUE ELE NÃO ALCANÇA. As tabelas que a RLS não mostra à consulta (`eventos_admin`, `import_logs`: só administrador;
// `senhas_acesso`: ninguém pela API) saem como "não legível" — o máximo delas vem do formato que o código grava e do
// bloco SQL do portão. "Não legível" nunca vira zero.
//
// A CONTAGEM. `char_length` do Postgres conta CARACTERES (code points, num banco UTF-8); o equivalente em JS é
// `[...s].length` (o `s.length` conta unidades UTF-16 e é ≥). O script guarda os dois.
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const opcao = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? ''
function recusar(motivo: string): never {
  console.error(`[medir-maximos] RECUSADO: ${motivo}`)
  process.exit(2)
}
const refDe = (u: string) => {
  try {
    return new URL(u).hostname.split('.')[0] ?? ''
  } catch {
    return ''
  }
}

// O universo: as colunas text (e o text[]) das 20 tabelas de `k_negocio`, lidas do catálogo com a cadeia inteira de
// migrations aplicada (PLAN-F66B §2). A trava `comprimento_por_coluna.sql` confere o universo contra o catálogo; aqui
// ele só diz o que ler. `pk` é a ordem total da paginação.
const UNIVERSO: Record<string, { pk: string[]; colunas: string[]; arrays?: string[] }> = {
  anotacoes: { pk: ['id'], colunas: ['texto'] },
  ativos: {
    pk: ['id'],
    colunas: [
      'patrimonio', 'patrimonio_original', 'marca', 'modelo', 'service_tag', 'hostname', 'memoria', 'armazenamento',
      'processador', 'fornecedor', 'colaborador_atual', 'setor_atual', 'pendencia', 'origem', 'observacoes', 'telefone',
      'imei', 'pulsus',
    ],
  },
  colaboradores: { pk: ['id'], colunas: ['nome', 'matricula', 'setor', 'nome_chave'] },
  eventos_admin: { pk: ['id'], colunas: ['acao', 'alvo'] },
  filiais: { pk: ['id'], colunas: ['slug', 'nome', 'cidade'] },
  import_logs: { pk: ['id'], colunas: ['modo', 'arquivo_hash', 'backup_path'] },
  import_prefixos_patrimonio: { pk: ['empresa_id', 'prefixo'], colunas: ['prefixo'] },
  import_termos_categoria: { pk: ['empresa_id', 'termo'], colunas: ['termo', 'rotulo'] },
  import_termos_estado: { pk: ['empresa_id', 'termo'], colunas: ['termo', 'rotulo'] },
  itens: { pk: ['id'], colunas: ['nome', 'nome_chave'] },
  kits_modelos: { pk: ['id'], colunas: ['nome'] },
  lancamentos_item: { pk: ['id'], colunas: ['chamado', 'colaborador', 'observacao'] },
  motivos: { pk: ['empresa_id', 'codigo'], colunas: ['codigo', 'rotulo'] },
  movimentacoes: {
    pk: ['id'],
    colunas: ['motivo', 'colaborador', 'setor', 'chamado', 'observacao', 'chamado_fornecedor'],
    arrays: ['itens_faltantes'],
  },
  pendencias_item: { pk: ['id'], colunas: ['item', 'colaborador', 'status', 'desfecho', 'observacao'] },
  relatorios_gerados: { pk: ['id'], colunas: ['observacao'] },
  senhas_acesso: { pk: ['id'], colunas: ['rotulo', 'hash'] },
  termos_gerados: { pk: ['id'], colunas: ['tipo', 'colaborador', 'arquivo_path'] },
  tipos_item: { pk: ['id'], colunas: ['slug', 'rotulo'] },
  unidades_apelidos: { pk: ['id'], colunas: ['apelido', 'apelido_chave'] },
}

// ---------------------------------------------------------------------------
// 1. O alvo, conferido antes do login
// ---------------------------------------------------------------------------
const alvo = opcao('alvo')
if (alvo !== 'ensaio' && alvo !== 'producao') recusar('informe --alvo=ensaio ou --alvo=producao.')
const refEnsaio = process.env.SEED_PROJECT_REF ?? ''
if (!refEnsaio) recusar('SEED_PROJECT_REF ausente (rode com --env-file=.env.local).')
const envGuard = readFileSync(join(RAIZ, 'scripts', 'env-guard.ts'), 'utf8')
const refsProducao = [...(/REFS_DE_PRODUCAO_CONHECIDOS\s*=\s*\[([^\]]*)\]/.exec(envGuard)?.[1] ?? '').matchAll(/'([a-z0-9]+)'/g)].map(
  (m) => m[1],
)
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
console.log(`[medir-maximos] alvo ${alvo.toUpperCase()} · ref ${refDe(url)} · só leitura, só números`)

const tetosArq = opcao('tetos')
const tetos: Record<string, number> = tetosArq ? JSON.parse(readFileSync(resolve(RAIZ, tetosArq), 'utf8')) : {}

const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
{
  const { data, error } = await db.auth.signInWithPassword({ email, password: senha })
  if (error || !data?.session) recusar(`login recusado (${error?.status ?? '?'}).`)
}

// ---------------------------------------------------------------------------
// 2. A leitura — tudo, por página na ordem da PK, conferido contra o count exato
// ---------------------------------------------------------------------------
type Linha = Record<string, unknown>
type Lida = { legivel: true; linhas: Linha[] } | { legivel: false; motivo: string }
async function lerTudo(tabela: string, pk: string[], colunas: string[]): Promise<Lida> {
  const { count, error: erroCount } = await db.from(tabela).select(pk[0], { count: 'exact', head: true })
  if (erroCount) return { legivel: false, motivo: `count recusado (${erroCount.code ?? '?'})` }
  if (count === null) return { legivel: false, motivo: 'count nulo' }
  const linhas: Linha[] = []
  const pagina = 1000
  for (let de = 0; ; de += pagina) {
    let q = db.from(tabela).select([...new Set([...pk, ...colunas])].join(', '))
    for (const k of pk) q = q.order(k, { ascending: true })
    const { data, error } = await q.range(de, de + pagina - 1)
    if (error) return { legivel: false, motivo: `leitura recusada (${error.code ?? '?'})` }
    const lote = (data ?? []) as unknown as Linha[]
    linhas.push(...lote)
    if (lote.length < pagina) break
  }
  if (linhas.length !== count) recusar(`${tabela}: li ${linhas.length} de ${count} — a contagem não fecha.`)
  // RLS que esconde TUDO devolve 0 linhas sem erro: só é "legível" se o count bate e a tabela não está vazia OU o
  // count é 0 de verdade — não dá para distinguir pela API; o relatório marca `linhas = 0` para conferência no SQL.
  return { legivel: true, linhas }
}

type Medida = {
  linhas: number
  nao_nulos: number
  max_caracteres: number
  max_utf16: number
  acima_do_teto: number | null
  teto: number | null
}
const resultado: {
  alvo: string
  ref: string
  medido_em: string
  tabelas: Record<string, { legivel: boolean; linhas: number | null; motivo?: string }>
  colunas: Record<string, Medida>
  arrays: Record<string, { linhas: number; nao_nulos: number; max_elementos: number; max_caracteres_elemento: number }>
} = { alvo, ref: refDe(url), medido_em: new Date().toISOString(), tabelas: {}, colunas: {}, arrays: {} }

// A RLS não dá erro ao esconder: devolve 0 linhas e `count` 0. Estas três a consulta não lê por construção (policy de
// SELECT só para administrador, ou nenhuma) — medir aqui daria um ZERO falso. Ficam "não legível", e o máximo delas vem
// do bloco SQL do portão.
const SO_ADMIN: Record<string, string> = {
  eventos_admin: 'RLS: leitura só de administrador',
  import_logs: 'RLS: leitura só de administrador',
  senhas_acesso: 'RLS: nenhuma policy de leitura (só o servidor lê)',
}
for (const [tabela, def] of Object.entries(UNIVERSO)) {
  if (SO_ADMIN[tabela]) {
    resultado.tabelas[tabela] = { legivel: false, linhas: null, motivo: SO_ADMIN[tabela] }
    continue
  }
  const lida = await lerTudo(tabela, def.pk, [...def.colunas, ...(def.arrays ?? [])])
  if (!lida.legivel) {
    resultado.tabelas[tabela] = { legivel: false, linhas: null, motivo: lida.motivo }
    continue
  }
  resultado.tabelas[tabela] = { legivel: true, linhas: lida.linhas.length }
  for (const c of def.colunas) {
    const chave = `${tabela}.${c}`
    const teto = typeof tetos[chave] === 'number' ? tetos[chave] : null
    const m: Medida = { linhas: lida.linhas.length, nao_nulos: 0, max_caracteres: 0, max_utf16: 0, acima_do_teto: teto === null ? null : 0, teto }
    for (const l of lida.linhas) {
      const v = l[c]
      if (typeof v !== 'string') continue
      m.nao_nulos++
      const chars = [...v].length
      if (chars > m.max_caracteres) m.max_caracteres = chars
      if (v.length > m.max_utf16) m.max_utf16 = v.length
      if (teto !== null && chars > teto) m.acima_do_teto = (m.acima_do_teto ?? 0) + 1
    }
    resultado.colunas[chave] = m
  }
  for (const c of def.arrays ?? []) {
    const a = { linhas: lida.linhas.length, nao_nulos: 0, max_elementos: 0, max_caracteres_elemento: 0 }
    for (const l of lida.linhas) {
      const v = l[c]
      if (!Array.isArray(v)) continue
      a.nao_nulos++
      if (v.length > a.max_elementos) a.max_elementos = v.length
      for (const e of v) if (typeof e === 'string' && [...e].length > a.max_caracteres_elemento) a.max_caracteres_elemento = [...e].length
    }
    resultado.arrays[`${tabela}.${c}`] = a
  }
}
await db.auth.signOut().catch(() => {})

// ---------------------------------------------------------------------------
// 3. A saída — só números
// ---------------------------------------------------------------------------
const naoLegiveis = Object.entries(resultado.tabelas).filter(([, t]) => !t.legivel)
const comTeto = Object.values(resultado.colunas).filter((m) => m.teto !== null)
const violacoes = comTeto.reduce((s, m) => s + (m.acima_do_teto ?? 0), 0)
console.log(
  `[medir-maximos] ${Object.keys(resultado.tabelas).length - naoLegiveis.length} tabelas lidas · ${naoLegiveis.length} não legíveis · ` +
    `${Object.keys(resultado.colunas).length} colunas medidas · ${comTeto.length} com teto proposto · ${violacoes} linhas acima do teto`,
)
for (const [t, info] of naoLegiveis) console.log(`  não legível: ${t} (${info.motivo})`)
for (const [k, m] of Object.entries(resultado.colunas)) {
  console.log(
    `  ${k.padEnd(40)} linhas ${String(m.linhas).padStart(5)} · não nulos ${String(m.nao_nulos).padStart(5)} · máx ${String(m.max_caracteres).padStart(5)}` +
      (m.teto === null ? '' : ` · teto ${String(m.teto).padStart(5)} · acima ${m.acima_do_teto}`),
  )
}
for (const [k, a] of Object.entries(resultado.arrays)) {
  console.log(`  ${k.padEnd(40)} (text[]) linhas ${a.linhas} · não nulos ${a.nao_nulos} · máx elementos ${a.max_elementos} · máx caracteres/elemento ${a.max_caracteres_elemento}`)
}
const saida = opcao('saida')
if (saida) {
  writeFileSync(resolve(RAIZ, saida), JSON.stringify(resultado, null, 2) + '\n')
  console.log(`[medir-maximos] gravado em ${saida}`)
}
if (violacoes > 0) process.exitCode = 1
