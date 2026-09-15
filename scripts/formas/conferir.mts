// =============================================================================
// conferir.mts — cada forma da F58 contra as linhas REAIS (F58 · Frente E · decisão ii)
// =============================================================================
// POR QUE ELE EXISTE
//
// A decisão i do Johnny (15/09/2026) faz forma errada LANÇAR em produção. Um schema que o
// compilador aceitou pode ainda assim estar errado sobre o DADO — um nulo do go-live, um snapshot
// de formato antigo, uma coluna de view que o SQL não garante. A decisão ii responde: antes do
// merge, cada forma passa pelas linhas reais de PRODUÇÃO, só leitura, e a evidência guarda só
// contagens e caminhos de campo normalizados.
//
// O QUE ELE IMPORTA, E POR QUE NÃO COPIA: o CATÁLOGO de descritores de `src/lib/queries/formas/`
// (o mesmo `select` e a mesma forma que a query e a action usam) e a conferência pura de
// `src/lib/supabase/forma.ts`. Os módulos de forma declaram `server-only` — por isso este script
// roda com `NODE_OPTIONS=--conditions=react-server` (o precedente é `scripts/perf/medir-corpos-import.mts`).
//
// SÓ LEITURA, SEM EXCEÇÃO
//  · relações: `select` com `count: 'exact'` e páginas por ordem total;
//  · RPCs: SÓ as de uma lista de CHAMÁVEIS calculada do CORPO VIVO — `stable`/`immutable` e sem
//    insert/update/delete —, conferida ANTES DE CADA chamada; falha fechada;
//  · RPC que escreve (`recibo`) não é chamada em banco nenhum — a forma dela se prova pelo SQL;
//  · a única escrita tolerada é a sessão que o login grava no Supabase Auth.
//
// A SAÍDA não tem valor, id, slug, e-mail nem patrimônio: por ponto, linhas lidas · count exato ·
// aceitas · recusadas · erros, e para cada recusa o caminho normalizado e o código da issue. As
// células da matriz das `rel_*` são rotuladas por NÚMERO DE ORDEM (`filial #3 · janela 2`).
//
// USO
//   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/formas/conferir.mts \
//     --alvo=ensaio|producao --saida=docs/f58-evidencias/conferidor-<alvo>-<rodada>.json
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { corpoVigente } from '../db/corpo-vigente.mjs'
import { CATALOGO } from '../../src/lib/queries/formas/catalogo'
import { conferirValores, type ProblemaDeForma } from '../../src/lib/supabase/forma'
import type { LeituraDeRelacao, LeituraDeRpc, MatrizDeRpc } from '../../src/lib/supabase/leitura'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const opcao = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
function recusar(motivo: string): never {
  console.error(`[conferir] RECUSADO: ${motivo}`)
  process.exit(2)
}
const refDe = (url: string) => {
  try {
    return new URL(url).hostname.split('.')[0] ?? ''
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// 1. Alvo e identidade — ANTES da primeira leitura
// ---------------------------------------------------------------------------
const alvo = opcao('alvo')
if (alvo !== 'ensaio' && alvo !== 'producao') recusar('informe --alvo=ensaio ou --alvo=producao.')
const saida = opcao('saida')
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
  email = opcao('persona') || 'seed.consulta@wap.ind.br'
  if (!/^seed\.[a-z]+@wap\.ind\.br$/.test(email)) recusar('no ensaio a persona tem de ser FICTÍCIA (seed.<x>@wap.ind.br).')
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

const sha = execSync('git rev-parse --short HEAD', { cwd: RAIZ }).toString().trim()
const sujo = execSync('git status --porcelain -- src scripts', { cwd: RAIZ }).toString().trim() !== ''
console.log(`[conferir] alvo ${alvo.toUpperCase()} · ref ${refDe(url)} · HEAD ${sha}${sujo ? ' (+ árvore com mudança em src/scripts — rodada NÃO vale como gate)' : ''} · só leitura`)

// ---------------------------------------------------------------------------
// 2. Os chamáveis — do CORPO VIVO, falha fechada
// ---------------------------------------------------------------------------
function chamavel(nome: string): { ok: boolean; motivo: string } {
  try {
    const { sql } = corpoVigente(`public.${nome}`, RAIZ)
    const semComentario = sql.replace(/--[^\n]*/g, '').toLowerCase().replace(/\s+/g, ' ')
    const i = semComentario.search(/\bas \$[a-z_]*\$/)
    const cabecalho = i === -1 ? semComentario : semComentario.slice(0, i)
    const cauda = semComentario.slice(semComentario.lastIndexOf('$'))
    const volatil = /\b(stable|immutable)\b/.test(cabecalho) || /\b(stable|immutable)\b/.test(cauda)
    const escreve = /\b(insert into|update [a-z_."]+ set|delete from|truncate|perform [a-z_.]*(apagar|resetar|criar|definir|lancar|registrar))/.test(semComentario)
    if (!volatil) return { ok: false, motivo: 'não é stable/immutable no corpo vivo' }
    if (escreve) return { ok: false, motivo: 'o corpo vivo escreve' }
    return { ok: true, motivo: '' }
  } catch (e) {
    return { ok: false, motivo: `corpo vivo não resolvido (${(e as Error).message.slice(0, 60)})` }
  }
}

// ---------------------------------------------------------------------------
// 3. Sessão
// ---------------------------------------------------------------------------
const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
{
  const { data, error } = await db.auth.signInWithPassword({ email, password: senha })
  if (error || !data?.session) recusar(`login recusado (${error?.status ?? '?'} ${error?.code ?? ''}).`)
}
console.log('[conferir] login ok')

type Ponto = {
  ponto: string
  lidas: number
  count: number | null
  aceitas: number
  recusadas: number
  erros: string[]
  problemas: { caminho: string; codigo: string; ocorrencias: number }[]
  amostragem?: string
  nao_provado?: string
  ordem_provada?: string
  filtro_do_call_site?: string[]
}

function acumular(p: Ponto, recusas: { problemas: ProblemaDeForma[] }[]) {
  for (const r of recusas) for (const pr of r.problemas) {
    const achado = p.problemas.find((x) => x.caminho === pr.caminho && x.codigo === pr.codigo)
    if (achado) achado.ocorrencias++
    else p.problemas.push({ caminho: pr.caminho, codigo: pr.codigo, ocorrencias: 1 })
  }
}

const PAGINA = 1000
const erroDe = (e: { code?: string; message?: string } | null, status?: number) => (e ? `${e.code ?? '?'}${status ? ` · HTTP ${status}` : ''}` : '')

// ---------------------------------------------------------------------------
// 4. Relações — a tabela/view inteira, paginada por ordem total
// ---------------------------------------------------------------------------
async function conferirRelacao(d: LeituraDeRelacao): Promise<Ponto> {
  const p: Ponto = { ponto: d.rotulo, lidas: 0, count: null, aceitas: 0, recusadas: 0, erros: [], problemas: [] }
  // A pré-condição que o call-site SEMPRE aplica (`naoNulas` do descritor) vale para o count E para cada página: a
  // forma foi escrita para a leitura filtrada, e ler a relação sem o filtro é conferir outra leitura (a rodada cedo
  // em produção recusou 2.093 e 3.247 linhas das sugestões por isso).
  if (d.naoNulas?.length) p.filtro_do_call_site = d.naoNulas.map((col) => `${col} is not null`)
  let qc = db.from(d.origem).select(d.select, { count: 'exact', head: true })
  for (const col of d.naoNulas ?? []) qc = qc.not(col, 'is', null)
  const c = await qc
  if (c.error) {
    p.erros.push(`count: ${erroDe(c.error, c.status)}`)
    return p
  }
  p.count = c.count ?? 0
  const chaves = new ChavesDeOrdem(d.ordem, 'relacao')
  for (let de = 0; ; de += PAGINA) {
    let q = db.from(d.origem).select(d.select)
    for (const col of d.naoNulas ?? []) q = q.not(col, 'is', null)
    for (const col of d.ordem) q = q.order(col, { ascending: true })
    const r = await q.range(de, de + PAGINA - 1)
    if (r.error) {
      p.erros.push(`página ${de / PAGINA + 1}: ${erroDe(r.error)}`)
      return p
    }
    const linhas = (r.data ?? []) as unknown[]
    chaves.registrar(linhas)
    const conf = conferirValores(linhas, d.forma, ['[]'])
    p.lidas += linhas.length
    p.aceitas += conf.aceitas.length
    p.recusadas += conf.recusas.length
    acumular(p, conf.recusas)
    if (linhas.length < PAGINA) break
  }
  chaves.fechar(p)
  return p
}

/**
 * A prova, em execução, de que a ordem declarada é TOTAL: nenhuma linha lida repete a combinação
 * das colunas de ordem. Ordem que não é total deixa a paginação repetir uma linha numa página e
 * pular outra na seguinte — e `lidas = count` continuaria batendo. As chaves ficam só em memória;
 * sai a CONTAGEM de repetições, nunca o valor.
 */
class ChavesDeOrdem {
  private vistas = new Set<string>()
  private repetidas = 0
  private semAsColunas = 0
  constructor(
    private readonly colunas: readonly string[] | undefined,
    private readonly tipo: 'relacao' | 'rpc',
  ) {}
  registrar(linhas: unknown[]) {
    if (!this.colunas || this.colunas.length === 0) return
    for (const l of linhas) {
      const linha = l as Record<string, unknown>
      // A coluna de ordem pode não estar no select da leitura (o `id` de quem lê só `nome`): aí não há chave a
      // comparar na LINHA. A rodada cedo no ensaio acusou N−1 repetições em 20 relações por isso — chave `undefined`.
      if (!this.colunas.every((c) => Object.hasOwn(linha, c))) {
        this.semAsColunas++
        continue
      }
      const k = JSON.stringify(this.colunas.map((c) => linha[c]))
      if (this.vistas.has(k)) this.repetidas++
      else this.vistas.add(k)
    }
  }
  fechar(p: Ponto) {
    if (this.repetidas > 0) p.erros.push(`ordem não total: ${this.repetidas} linha(s) repetiram a chave de ordem`)
    // Relação: a ordem declarada termina na chave primária, que é total no banco mesmo fora do select — registra o
    // método, não reprova. RPC não tem chave primária: coluna de ordem que não volta na linha é erro de descritor.
    if (this.semAsColunas > 0) {
      if (this.tipo === 'rpc') p.erros.push(`ordem declarada com coluna que o retorno não traz (${this.semAsColunas} linha(s))`)
      else p.ordem_provada = 'pela chave primária no banco (coluna de ordem fora do select)'
    }
    this.vistas.clear()
  }
}

// ---------------------------------------------------------------------------
// 5. RPCs de leitura — a matriz, cada célula por número de ordem
// ---------------------------------------------------------------------------
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const menos = (dias: number) => {
  const d = new Date(`${hoje}T12:00:00-03:00`)
  d.setDate(d.getDate() - dias)
  return d.toISOString().slice(0, 10)
}
const segunda = (() => {
  const d = new Date(`${hoje}T12:00:00-03:00`)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
})()

// Os valores de filial e de pessoa passam pela memória e NUNCA saem: a célula é rotulada por ordem.
const filiaisAtivas = ((await db.from('filiais').select('id').eq('ativo', true).order('id')).data ?? []).map((f) => f.id as number)
const maisAntiga = ((await db.from('movimentacoes').select('data').order('data', { ascending: true }).limit(1)).data ?? [])[0]?.data as string | undefined
const inicio = maisAntiga ?? menos(365)
const meio = (() => {
  const a = new Date(`${inicio}T12:00:00-03:00`).getTime()
  const b = new Date(`${hoje}T12:00:00-03:00`).getTime()
  return new Date(Math.round((a + b) / 2)).toISOString().slice(0, 10)
})()
const pessoas = ((await db.from('colaboradores').select('id').order('id').limit(25)).data ?? []).map((p) => p.id as string)

type Celula = { rotulo: string; args: Record<string, unknown> }
function celulas(m: MatrizDeRpc): Celula[] {
  const recortes: { rotulo: string; filial: number | null }[] = [
    { rotulo: 'consolidado', filial: null },
    ...filiaisAtivas.map((id, i) => ({ rotulo: `filial #${i + 1}`, filial: id })),
  ]
  switch (m.tipo) {
    case 'sem-argumentos':
      return [{ rotulo: 'única', args: {} }]
    case 'colaborador':
      return pessoas.map((id, i) => ({ rotulo: `pessoa #${i + 1}`, args: { [m.colaborador]: id } }))
    case 'filial-e-data':
      return recortes.flatMap((r) =>
        [hoje, inicio, meio].map((data, j) => ({ rotulo: `${r.rotulo} · data ${j + 1}`, args: { [m.filial]: r.filial, [m.data]: data } })),
      )
    case 'filial-e-periodo':
      return recortes.flatMap((r) =>
        [[segunda, hoje], [inicio, hoje], [meio, hoje]].map(([de, ate], j) => ({
          rotulo: `${r.rotulo} · janela ${j + 1}`,
          args: { [m.filial]: r.filial, [m.de]: de, [m.ate]: ate },
        })),
      )
  }
}

async function conferirRpc(d: LeituraDeRpc): Promise<Ponto[]> {
  const pontos: Ponto[] = []
  const lista = celulas(d.matriz)
  if (lista.length === 0) {
    pontos.push({ ponto: `${d.rotulo} · (nenhuma célula)`, lidas: 0, count: null, aceitas: 0, recusadas: 0, erros: [], problemas: [], nao_provado: 'a matriz não gerou célula no alvo (nenhuma filial ou pessoa para chamar)' })
  }
  for (const cel of lista) {
    const p: Ponto = { ponto: `${d.rotulo} · ${cel.rotulo}`, lidas: 0, count: null, aceitas: 0, recusadas: 0, erros: [], problemas: [] }
    pontos.push(p)
    const ch = chamavel(d.rpc)
    if (!ch.ok) {
      p.erros.push(`NÃO CHAMÁVEL: ${ch.motivo}`)
      continue
    }
    if (d.retorno === 'valor') {
      const r = await db.rpc(d.rpc, cel.args)
      if (r.error) {
        p.erros.push(erroDe(r.error))
        continue
      }
      const conf = conferirValores([r.data], d.forma, [])
      p.lidas = 1
      p.count = 1
      p.aceitas = conf.aceitas.length
      p.recusadas = conf.recusas.length
      acumular(p, conf.recusas)
      continue
    }
    // POST com count exato e UMA linha: o HEAD iria por GET, e `null` num argumento (o consolidado) não se expressa
    // na query string — a rodada cedo no ensaio perdeu todas as células consolidadas assim.
    const c = await db.rpc(d.rpc, cel.args, { count: 'exact' }).range(0, 0)
    if (c.error) {
      p.erros.push(`count: ${erroDe(c.error, c.status)}`)
      continue
    }
    p.count = c.count ?? null
    const chaves = new ChavesDeOrdem(d.ordem, 'rpc')
    for (let de = 0; ; de += PAGINA) {
      if (!chamavel(d.rpc).ok) {
        p.erros.push('NÃO CHAMÁVEL na página seguinte')
        break
      }
      let q = db.rpc(d.rpc, cel.args)
      for (const col of d.ordem ?? []) q = q.order(col, { ascending: true })
      const r = await q.range(de, de + PAGINA - 1)
      if (r.error) {
        p.erros.push(`página ${de / PAGINA + 1}: ${erroDe(r.error)}`)
        break
      }
      const linhas = (r.data ?? []) as unknown[]
      chaves.registrar(linhas)
      const conf = conferirValores(linhas, d.forma, ['[]'])
      p.lidas += linhas.length
      p.aceitas += conf.aceitas.length
      p.recusadas += conf.recusas.length
      acumular(p, conf.recusas)
      if (linhas.length < PAGINA) break
    }
    // RPC sem `ordem` declarada só é segura enquanto cabe numa página: acima disso, a ordem do
    // PostgREST entre páginas não é garantida — o ponto fica NÃO PROVADO em vez de verde.
    if (!d.ordem && (p.count ?? 0) > PAGINA) p.nao_provado = `retorno maior que uma página (${PAGINA}) sem ordem total declarada`
    chaves.fechar(p)
  }
  return pontos
}

// ---------------------------------------------------------------------------
// 6. Rodada, gate e saída — só números e caminhos normalizados
// ---------------------------------------------------------------------------
const inicioRodada = new Date().toISOString()
const pontos: Ponto[] = []
const recibos: string[] = []
for (const d of CATALOGO) {
  if (d.tipo === 'relacao') pontos.push(await conferirRelacao(d))
  else if (d.tipo === 'rpc') pontos.push(...(await conferirRpc(d)))
  else recibos.push(d.rotulo)
}
await db.auth.signOut().catch(() => {})

for (const p of pontos) {
  if (p.count !== null && p.count > 0 && p.lidas === 0 && p.erros.length === 0) p.nao_provado = 'há linhas e nenhuma foi lida'
}
// Descritor que não leu linha NENHUMA, somando todos os pontos dele, não teve a forma exercitada no alvo. Não reprova —
// o count exato zero é um fato do alvo —, mas vai para uma lista própria, e o relatório diz onde cada um foi provado.
const lidasPorDescritor = new Map<string, number>()
for (const p of pontos) {
  const k = p.ponto.split(' · ')[0]
  lidasPorDescritor.set(k, (lidasPorDescritor.get(k) ?? 0) + p.lidas)
}
const semLinhasNoAlvo = [...lidasPorDescritor].filter(([, n]) => n === 0).map(([k]) => k)
const reprovados = pontos.filter(
  (p) => p.recusadas > 0 || p.erros.length > 0 || p.nao_provado || (p.count !== null && p.lidas !== p.count),
)
const relatorio = {
  o_que_e: 'Conferidor de formas F58 · Frente E — só contagens e caminhos normalizados; nenhum valor.',
  alvo,
  sha,
  arvore_limpa_em_src_scripts: !sujo,
  inicio: inicioRodada,
  fim: new Date().toISOString(),
  totais: {
    pontos: pontos.length,
    linhas_lidas: pontos.reduce((n, p) => n + p.lidas, 0),
    recusadas: pontos.reduce((n, p) => n + p.recusadas, 0),
    com_erro: pontos.filter((p) => p.erros.length > 0).length,
    reprovados: reprovados.length,
  },
  recibos_provados_pelo_sql_e_nao_chamados: recibos,
  descritores_sem_linha_no_alvo: semLinhasNoAlvo,
  pontos,
}
// O resumo vai para a tela ANTES de gravar: uma falha de escrita não pode jogar fora uma rodada inteira
// de leitura (a primeira rodada no ensaio perdeu tudo assim — `--saida` absoluto era juntado à raiz).
for (const p of pontos) {
  const marca = reprovados.includes(p) ? 'REPROVA' : 'ok     '
  const probl = p.problemas.map((x) => `${x.caminho} ${x.codigo}×${x.ocorrencias}`).join('; ')
  console.log(`  ${marca} ${p.ponto.padEnd(58)} lidas ${String(p.lidas).padStart(6)} · count ${String(p.count ?? '—').padStart(6)} · recusadas ${p.recusadas}${p.erros.length ? ` · ERROS ${p.erros.join(' | ')}` : ''}${p.nao_provado ? ` · NÃO PROVADO: ${p.nao_provado}` : ''}${probl ? ` · ${probl}` : ''}`)
}
if (semLinhasNoAlvo.length > 0) console.log(`[conferir] ${semLinhasNoAlvo.length} descritor(es) sem linha no alvo (forma não exercitada aqui): ${semLinhasNoAlvo.join(', ')}`)
console.log(`[conferir] ${pontos.length} pontos · ${relatorio.totais.linhas_lidas} linhas · ${relatorio.totais.recusadas} recusadas · ${reprovados.length} reprovados${saida ? ` · ${saida}` : ''}`)
if (saida) {
  const absoluto = /^[A-Za-z]:[\\/]|^[\\/]/.test(saida)
  const destino = absoluto ? saida : join(RAIZ, saida)
  mkdirSync(dirname(destino), { recursive: true })
  writeFileSync(destino, JSON.stringify(relatorio, null, 2) + '\n', 'utf8')
}
process.exitCode = reprovados.length > 0 ? 1 : 0
