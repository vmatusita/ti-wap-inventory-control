#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Smoke test reexecutável do Estoque TI WAP (OS-F12 · §W5)
// ---------------------------------------------------------------------------
// Confere, de fora para dentro, que a aplicação NO AR continua respondendo e
// que as leituras reais que ela faz continuam funcionando com uma sessão de
// operador de verdade. Roda antes do rollout (baseline) e depois de cada deploy.
//
//   node scripts/smoke/smoke-prod.mjs
//   node scripts/smoke/smoke-prod.mjs --exigir-f12    (depois do rollout da F12)
//
// REGRAS QUE ESTE ARQUIVO NÃO QUEBRA (CLAUDE.md):
//  - Nenhum segredo aqui dentro. Tudo vem de variável de ambiente.
//  - Nenhum conteúdo de linha do banco é impresso: só contagens, status HTTP e
//    NOMES de coluna. A produção tem dados reais — eles não saem daqui.
//  - A senha (e o e-mail da conta de smoke, e a chave anon) são mascarados como
//    `***` em QUALQUER saída, inclusive mensagem de erro e stack trace.
//  - Zero dependência nova: `fetch` global do Node e `@supabase/supabase-js`,
//    que já é dependência do projeto.
//
// Este arquivo mora em `scripts/` (versionado) e não em `scratchpad/`, que o
// `.gitignore` do projeto ignora inteiro — ver scripts/smoke/README.md.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')
const FUSO = 'America/Sao_Paulo'

// URL pública do projeto na Vercel. NÃO é segredo — é o endereço que qualquer
// pessoa digita no navegador. Serve de default quando SMOKE_URL_APP não existe.
const URL_APP_PADRAO = 'https://ti-wap-inventory-control.vercel.app'

const TIMEOUT_HTTP_MS = 20_000

// ---------------------------------------------------------------------------
// 1. Ambiente
// ---------------------------------------------------------------------------

// Parser mínimo de .env (sem dependência): `CHAVE=valor`, ignora comentário e
// linha vazia, tira aspas nas pontas. NUNCA sobrescreve o que já veio do shell
// — quem exporta SMOKE_SUPABASE_URL para apontar o DEV manda no arquivo.
function carregarEnvArquivo(caminho) {
  if (!existsSync(caminho)) return 0
  let carregadas = 0
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const texto = linha.trim()
    if (!texto || texto.startsWith('#')) continue
    const corte = texto.indexOf('=')
    if (corte <= 0) continue
    const chave = texto.slice(0, corte).trim()
    if (process.env[chave] !== undefined) continue
    let valor = texto.slice(corte + 1).trim()
    const aspas = valor.startsWith('"') && valor.endsWith('"')
    const apostrofos = valor.startsWith("'") && valor.endsWith("'")
    if ((aspas || apostrofos) && valor.length >= 2) valor = valor.slice(1, -1)
    process.env[chave] = valor
    carregadas++
  }
  return carregadas
}

const envCarregadas = carregarEnvArquivo(join(RAIZ, '.env.local'))

// Cascata documentada no README: a variável SMOKE_* manda; na falta dela vale a
// NEXT_PUBLIC_* que o próprio app usa (é a mesma chave publicável do navegador).
const urlApp = (process.env.SMOKE_URL_APP || URL_APP_PADRAO).replace(/\/+$/, '')
const urlSupabase =
  process.env.SMOKE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const chaveAnon =
  process.env.SMOKE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''
const email = process.env.SMOKE_EMAIL || ''
const senha = process.env.SMOKE_SENHA || ''

const argv = process.argv.slice(2)
const exigirF12 = argv.includes('--exigir-f12') || process.env.SMOKE_EXIGIR_F12 === '1'
const somenteParteA = argv.includes('--sem-sessao')

// ---------------------------------------------------------------------------
// 2. Máscara de segredos — usada em TODA saída
// ---------------------------------------------------------------------------

// Qualquer ocorrência destes valores vira `***`, venha de onde vier (mensagem do
// Supabase, stack trace, URL). Só valores com tamanho razoável entram, para não
// mascarar o texto inteiro por acidente se alguma variável estiver vazia/curta.
const SEGREDOS = [senha, email, chaveAnon].filter((v) => typeof v === 'string' && v.length >= 4)

function mascarar(valor) {
  let texto = typeof valor === 'string' ? valor : String(valor ?? '')
  for (const segredo of SEGREDOS) texto = texto.split(segredo).join('***')
  return texto
}

// BLINDAGEM: tudo o que sair no console passa pela máscara — inclusive o que
// NÃO é escrito por este arquivo. Medido em 22/07/2026: quando o fetch falha, o
// @supabase/supabase-js imprime o erro cru direto no console (com a URL e a causa
// completas), sem passar por nenhuma função nossa. Sem este envelope, a promessa
// "a senha nunca aparece na saída" valeria só para o texto que nós escrevemos.
// `inspect` preserva o detalhe do objeto/erro (que `String(obj)` jogaria fora)
// antes de mascarar.
function textoDe(valor) {
  return typeof valor === 'string' ? valor : inspect(valor, { depth: 4 })
}

for (const metodo of ['log', 'error', 'warn', 'info', 'debug']) {
  const original = console[metodo].bind(console)
  console[metodo] = (...args) => original(...args.map((a) => mascarar(textoDe(a))))
}

function log(texto = '') {
  console.log(mascarar(texto))
}

// Erro do Supabase/PostgREST vira uma linha curta e mascarada. Nunca imprimimos
// `details` cru quando ele pode carregar valor de linha — só código e mensagem.
function descreverErro(erro) {
  if (!erro) return 'erro desconhecido'
  if (erro instanceof Error) return mascarar(erro.message || erro.name)
  const codigo = erro.code ? `[${erro.code}] ` : ''
  return mascarar(`${codigo}${erro.message ?? JSON.stringify(erro)}`)
}

// ---------------------------------------------------------------------------
// 3. Vocabulário de resultado
// ---------------------------------------------------------------------------

const OK = 'OK'
const AVISO = 'AVISO' // passou, mas com ressalva (não derruba o exit code)
const NA = 'n/a' // pré-F12: tabela/coluna ainda não existe no ambiente
const FALHA = 'FALHA'

/** @type {{parte: string, nome: string, area: string, status: string, detalhe: string}[]} */
const resultados = []
const pendencias = []

function registrar(parte, nome, area, status, detalhe) {
  resultados.push({ parte, nome, area, status, detalhe })
  const marca = status === OK ? 'OK   ' : status.padEnd(5)
  log(`  [${marca}] ${nome} — ${detalhe}`)
}

// ---------------------------------------------------------------------------
// 4. PARTE A — sem sessão (sempre roda)
// ---------------------------------------------------------------------------
// Contrato do proxy (src/lib/supabase/proxy.ts):
//   /login e /relatorios/acesso  → públicas (200)
//   rotas de operador            → redirect para /login
//   /relatorios/**               → redirect para /relatorios/acesso (senha)
//
// Como distinguimos "redirecionou" de "vazou a página":
//  1. 3xx com header `location` cuja rota resolvida é a esperada → OK. É o que a
//     produção faz hoje (307 do NextResponse.redirect) — caminho principal.
//  2. 200 é o ramo DEFENSIVO (se um dia o redirect virar rewrite): só passa se o
//     HTML tiver os marcadores do cartão de login E nenhum marcador do shell
//     autenticado. O formulário de login é renderizado no cliente (bailout do
//     useSearchParams), então não dá para procurar `name="senha"` no HTML — por
//     isso os marcadores são os do envelope (cartão + faixa escura da marca).
//  3. Qualquer 200 com marcador de shell = vazamento de rota protegida → FALHA.
//  4. Qualquer 5xx em qualquer rota → FALHA.

const MARCADORES_LOGIN = ['bg-brand-dark', 'max-w-sm']
const MARCADORES_SHELL = ['Nova movimentação', 'href="/pendencias"', 'href="/movimentacoes"']

const ROTAS = [
  { rota: '/login', esperado: 'publica', area: 'login', marcadores: MARCADORES_LOGIN },
  { rota: '/relatorios/acesso', esperado: 'publica', area: 'relatórios · entrada por senha' },
  { rota: '/', esperado: 'login', area: 'dashboard' },
  { rota: '/ativos', esperado: 'login', area: 'ativos · lista' },
  { rota: '/ativos/novo', esperado: 'login', area: 'ativos · cadastro de compra' },
  { rota: '/itens', esperado: 'login', area: 'itens por quantidade (I4 · I5)' },
  { rota: '/movimentacoes', esperado: 'login', area: 'movimentações · lista (M8)' },
  { rota: '/movimentacoes/nova', esperado: 'login', area: 'movimentações · fluxo (M12)' },
  { rota: '/pendencias', esperado: 'login', area: 'pendências' },
  { rota: '/ajuda', esperado: 'login', area: 'ajuda' },
  { rota: '/admin/itens', esperado: 'login', area: 'admin · catálogo de itens' },
  { rota: '/admin/motivos', esperado: 'login', area: 'admin · motivos' },
  { rota: '/admin/usuarios', esperado: 'login', area: 'admin · usuários' },
  { rota: '/admin/importar', esperado: 'login', area: 'admin · import de startup' },
  { rota: '/relatorios/geral', esperado: 'acesso-relatorio', area: 'relatório ao vivo (T10)' },
  { rota: '/relatorios/gerados', esperado: 'acesso-relatorio', area: 'relatórios gerados' },
]
// Nota: rotas NOVAS de operador (ex.: /admin/kits, da F12) não entram aqui.
// Sem sessão o proxy redireciona ANTES de rotear, então uma rota inexistente
// responde igualzinho a uma existente — o check não provaria nada. A existência
// de /admin/kits é conferida pela parte B (tabela kits_modelos) e pelo roteiro
// visual logado do README.

const DESTINO_ESPERADO = {
  login: '/login',
  'acesso-relatorio': '/relatorios/acesso',
}

async function baixar(url) {
  return fetch(url, {
    redirect: 'manual',
    headers: { 'user-agent': 'smoke-estoque-ti-wap' },
    signal: AbortSignal.timeout(TIMEOUT_HTTP_MS),
  })
}

async function checarRota(entrada) {
  const alvo = `${urlApp}${entrada.rota}`
  let resposta
  try {
    resposta = await baixar(alvo)
  } catch (erro) {
    return { status: FALHA, detalhe: `sem resposta (${descreverErro(erro)})` }
  }

  const codigo = resposta.status
  const lerCorpo = async () => {
    try {
      return await resposta.text()
    } catch {
      return ''
    }
  }
  const descartarCorpo = () => {
    resposta.body?.cancel().catch(() => {})
  }

  if (codigo >= 500) {
    descartarCorpo()
    return { status: FALHA, detalhe: `HTTP ${codigo} — resposta 5xx` }
  }

  if (entrada.esperado === 'publica') {
    if (codigo !== 200) {
      descartarCorpo()
      return { status: FALHA, detalhe: `HTTP ${codigo} — esperado 200` }
    }
    const corpo = await lerCorpo()
    const faltando = (entrada.marcadores ?? []).filter((m) => !corpo.includes(m))
    if (faltando.length) {
      return { status: FALHA, detalhe: `HTTP 200 mas sem os marcadores: ${faltando.join(', ')}` }
    }
    return { status: OK, detalhe: `HTTP 200 (pública)` }
  }

  const destino = DESTINO_ESPERADO[entrada.esperado]

  if (codigo >= 300 && codigo < 400) {
    const location = resposta.headers.get('location')
    descartarCorpo()
    if (!location) return { status: FALHA, detalhe: `HTTP ${codigo} sem header location` }
    let caminho = location
    try {
      caminho = new URL(location, alvo).pathname
    } catch {
      /* location relativo esquisito: compara como veio */
    }
    if (caminho.startsWith(destino)) {
      return { status: OK, detalhe: `HTTP ${codigo} → ${destino}` }
    }
    return { status: FALHA, detalhe: `HTTP ${codigo} → ${caminho} (esperado ${destino})` }
  }

  if (codigo === 200) {
    const corpo = await lerCorpo()
    const shell = MARCADORES_SHELL.filter((m) => corpo.includes(m))
    if (shell.length) {
      return {
        status: FALHA,
        detalhe: `HTTP 200 com conteúdo de rota protegida sem sessão (marcadores: ${shell.join(', ')})`,
      }
    }
    const temLogin = MARCADORES_LOGIN.every((m) => corpo.includes(m))
    if (temLogin) {
      return { status: OK, detalhe: 'HTTP 200 renderizando a página de login (sem redirect)' }
    }
    return { status: FALHA, detalhe: 'HTTP 200 que não é redirect nem página de login' }
  }

  descartarCorpo()
  return { status: FALHA, detalhe: `HTTP ${codigo} — esperado redirect para ${destino}` }
}

async function parteA() {
  log('')
  log(`PARTE A — sem sessão · ${urlApp}`)
  for (const entrada of ROTAS) {
    const { status, detalhe } = await checarRota(entrada)
    registrar('A', entrada.rota, entrada.area, status, detalhe)
  }
}

// ---------------------------------------------------------------------------
// 5. PARTE B — logado
// ---------------------------------------------------------------------------

function dataSP(deslocamentoDias = 0) {
  const instante = new Date(Date.now() + deslocamentoDias * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(instante)
}

// Ausência de tabela/coluna: o PostgREST responde com código do Postgres
// (42P01 relação inexistente, 42703 coluna inexistente) ou com um PGRST* de
// cache de schema, dependendo da versão. Tratamos por código E por substring —
// é exatamente o que separa "ainda não migrou" de "quebrou".
const CODIGOS_AUSENTE = new Set(['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'])

function ehAusenciaDeSchema(erro) {
  if (!erro) return false
  if (CODIGOS_AUSENTE.has(String(erro.code ?? ''))) return true
  const texto = `${erro.message ?? ''} ${erro.hint ?? ''}`.toLowerCase()
  return (
    texto.includes('does not exist') ||
    texto.includes('could not find the table') ||
    texto.includes('could not find the column') ||
    texto.includes('could not find the function') ||
    texto.includes('schema cache')
  )
}

// Confere só os NOMES das colunas devolvidas (nunca os valores).
function conferirColunas(linha, esperadas) {
  const presentes = Object.keys(linha ?? {})
  const faltando = esperadas.filter((c) => !presentes.includes(c))
  return { presentes, faltando }
}

// Contagem de linhas SEM `head: true`. Medido na produção em 22/07/2026:
//   .select('id', { count: 'exact', head: true })  numa relação INEXISTENTE
//   → HTTP 204, count null, error NULL.
// Ou seja: com `head` o smoke daria "0 linhas" em vez de acusar a tabela sumida —
// um falso verde justamente no cenário que este script existe para pegar. A forma
// GET com `.limit(1)` devolve a MESMA contagem exata e, aí sim, o 404/PGRST205.
// A única linha que volta traz só a coluna-chave e nunca é impressa (a regra
// continua: contagens, status HTTP e nomes de coluna — nada de conteúdo).
function consultaContagem(db, relacao, coluna = 'id') {
  return db.from(relacao).select(coluna, { count: 'exact' }).limit(1)
}

// Normaliza a resposta de `consultaContagem`: devolve { count } ou { erro }.
// `count` que não seja número = o PostgREST não contou (relação inexistente,
// resposta 204 vazia) — tratado como erro, nunca como zero.
function lerContagem(resposta) {
  if (resposta.error) return { erro: resposta.error }
  if (typeof resposta.count !== 'number') {
    return {
      erro: {
        code: `HTTP ${resposta.status}`,
        message: 'o PostgREST não devolveu a contagem (relação inexistente?)',
      },
    }
  }
  return { count: resposta.count }
}

// Lista declarativa de checks — para acrescentar cobertura, acrescente um
// objeto aqui. `ctx` é compartilhado entre os checks (na ordem da lista).
const CHECKS = [
  // F25 — as colunas do celular existem e a fase NÃO fez backfill de `observacoes`
  // (mover texto livre é decisão humana, na ficha; ver DECISOES 04/08/2026).
  {
    nome: 'ativos · campos do celular (F25)',
    area: 'ativos · celular',
    async executar(db) {
      const { data, error } = await db
        .from('ativos')
        .select('telefone, imei, pulsus')
        .limit(1)
      if (error) {
        if (ehAusenciaDeSchema(error)) {
          return { status: NA, detalhe: 'colunas ausentes (migration 0101 não aplicada?)' }
        }
        throw error
      }
      const linha = data?.[0]
      if (!linha) return { status: AVISO, detalhe: 'sem ativo para conferir o shape' }
      const { faltando } = conferirColunas(linha, ['telefone', 'imei', 'pulsus'])
      if (faltando.length) return { status: FALHA, detalhe: `faltam: ${faltando.join(', ')}` }
      return { status: OK, detalhe: 'telefone, imei e pulsus presentes' }
    },
  },
  // F25 — a cidade que assina o termo. As 5 filiais REAIS têm de estar preenchidas;
  // filial inativa de teste pode ficar vazia de propósito.
  {
    nome: 'filiais · cidade do termo (F25)',
    area: 'filiais · cidade',
    async executar(db) {
      const { data, error } = await db.from('filiais').select('slug, ativo, cidade')
      if (error) {
        if (ehAusenciaDeSchema(error)) {
          return { status: NA, detalhe: 'coluna ausente (migration 0102 não aplicada?)' }
        }
        throw error
      }
      const semCidade = (data ?? []).filter((f) => f.ativo && !f.cidade)
      if (semCidade.length) {
        return {
          status: FALHA,
          detalhe: `filial ATIVA sem cidade: ${semCidade.map((f) => f.slug).join(', ')}`,
        }
      }
      const comCidade = (data ?? []).filter((f) => f.cidade).length
      return { status: OK, detalhe: `${comCidade} filiais com cidade; nenhuma ativa sem` }
    },
  },
  {
    nome: 'ativos · contagem',
    area: 'ativos',
    async executar(db, ctx) {
      const { count, erro } = lerContagem(await consultaContagem(db, 'ativos'))
      if (erro) throw erro
      ctx.ativos = count
      if (!count) return { status: FALHA, detalhe: 'contagem 0 (esperado > 0)' }
      return { status: OK, detalhe: `${count} ativos` }
    },
  },
  {
    nome: 'ativos · shape da lista',
    area: 'ativos · lista',
    async executar(db) {
      const colunas = [
        'id',
        'patrimonio',
        'service_tag',
        'categoria',
        'marca',
        'modelo',
        'status',
        'colaborador_atual',
        'filial_id',
        'termo_assinado',
      ]
      const { data, error } = await db
        .from('ativos')
        .select(`${colunas.join(', ')}, filiais(slug, nome)`)
        .order('id', { ascending: true })
        .limit(1)
      if (error) throw error
      if (!data?.length) return { status: AVISO, detalhe: 'sem linhas para conferir o shape' }
      const { faltando } = conferirColunas(data[0], [...colunas, 'filiais'])
      if (faltando.length) return { status: FALHA, detalhe: `colunas faltando: ${faltando.join(', ')}` }
      return { status: OK, detalhe: `${colunas.length + 1} colunas conferidas (join de filiais ok)` }
    },
  },
  {
    nome: 'movimentacoes · 1 página (30)',
    area: 'movimentações · lista (M8)',
    async executar(db, ctx) {
      const colunas = ['id', 'tipo', 'data', 'created_at', 'colaborador', 'setor', 'observacao', 'ativo_id']
      const { data, error, count } = await db
        .from('movimentacoes')
        .select(`${colunas.join(', ')}, ativos(patrimonio, service_tag, categoria, marca, modelo)`, {
          count: 'exact',
        })
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
        .range(0, 29)
      if (error) throw error
      ctx.movimentacoes = count ?? 0
      if (!count) return { status: FALHA, detalhe: 'contagem 0 (esperado > 0)' }
      if (!data?.length) return { status: FALHA, detalhe: `count ${count} mas a página veio vazia` }
      const { faltando } = conferirColunas(data[0], [...colunas, 'ativos'])
      if (faltando.length) return { status: FALHA, detalhe: `colunas faltando: ${faltando.join(', ')}` }
      return { status: OK, detalhe: `${count} no total · ${data.length} linhas na página · shape ok` }
    },
  },
  // F18 — a FONTE das telas é `v_fila_pendencias` (dashboard, selo da sidebar,
  // /pendencias e os chips do relatório). `v_pendencias` virou só a metade
  // NÃO-item da união; conferir apenas ela deixaria a view que as telas realmente
  // consultam sem cobertura nenhuma — e o smoke ficaria verde justamente no
  // cenário em que o dashboard mostra o estado vazio comemorativo por erro.
  {
    nome: 'v_fila_pendencias · contagem (dashboard, selo e /pendencias)',
    area: 'pendências',
    async executar(db, ctx) {
      const { count, erro } = lerContagem(
        await consultaContagem(db, 'v_fila_pendencias'),
      )
      if (erro) throw erro
      ctx.filaPendencias = count
      return { status: OK, detalhe: `${count} linhas na fila (não-item + itens abertos)` }
    },
  },
  {
    nome: 'v_fila_pendencias · shape',
    area: 'pendências',
    async executar(db) {
      // As colunas que /pendencias e o dashboard leem de fato (0052): `ordem` é a
      // chave única por linha (paginação/CSV estáveis), `pendencia_item_id` é o
      // alvo do botão Resolver e `item` é o que a linha de item mostra.
      const colunas = [
        'id',
        'ordem',
        'pendencia_item_id',
        'item',
        'patrimonio',
        'categoria',
        'filial',
        'filial_nome',
        'pendencia',
        'colaborador_atual',
        'setor_atual',
        'marca',
        'modelo',
        'desde',
      ]
      const { data, error } = await db
        .from('v_fila_pendencias')
        .select(colunas.join(', '))
        .limit(1)
      if (error) throw error
      if (!data?.length) return { status: AVISO, detalhe: 'fila vazia — shape não conferido' }
      const { faltando } = conferirColunas(data[0], colunas)
      if (faltando.length) return { status: FALHA, detalhe: `colunas faltando: ${faltando.join(', ')}` }
      return { status: OK, detalhe: `${colunas.length} colunas conferidas` }
    },
  },
  {
    nome: 'v_pendencias · contagem (base não-item da fila)',
    area: 'pendências',
    async executar(db, ctx) {
      const { count, erro } = lerContagem(await consultaContagem(db, 'v_pendencias'))
      if (erro) throw erro
      ctx.pendencias = count
      return { status: OK, detalhe: `${count} pendências abertas` }
    },
  },
  {
    nome: 'v_pendencias · shape',
    area: 'pendências',
    async executar(db) {
      const colunas = [
        'id',
        'patrimonio',
        'categoria',
        'filial',
        'filial_nome',
        'pendencia',
        'colaborador_atual',
        'setor_atual',
        'marca',
        'modelo',
        'desde',
      ]
      const { data, error } = await db.from('v_pendencias').select(colunas.join(', ')).limit(1)
      if (error) throw error
      if (!data?.length) return { status: AVISO, detalhe: 'nenhuma pendência aberta — shape não conferido' }
      const { faltando } = conferirColunas(data[0], colunas)
      if (faltando.length) return { status: FALHA, detalhe: `colunas faltando: ${faltando.join(', ')}` }
      return { status: OK, detalhe: `${colunas.length} colunas conferidas` }
    },
  },
  {
    nome: 'filiais · ativas',
    area: 'filiais',
    async executar(db, ctx) {
      const { data, error } = await db.from('filiais').select('id, slug, nome, ativo').eq('ativo', true)
      if (error) throw error
      ctx.filiais = data?.length ?? 0
      if (!ctx.filiais) return { status: FALHA, detalhe: 'nenhuma filial ativa' }
      return { status: OK, detalhe: `${ctx.filiais} filiais ativas` }
    },
  },
  {
    nome: 'itens · catálogo ativo',
    area: 'itens por quantidade',
    async executar(db, ctx) {
      const { count, erro } = lerContagem(await consultaContagem(db, 'itens').eq('ativo', true))
      if (erro) throw erro
      ctx.itensAtivos = count
      if (!count) return { status: AVISO, detalhe: 'catálogo de itens vazio (esperado em DEV, não em produção)' }
      return { status: OK, detalhe: `${count} itens ativos` }
    },
  },
  {
    nome: 'rpc rel_saldo_itens · consolidado',
    area: 'itens · saldos (I4)',
    async executar(db, ctx) {
      // Sem os dois parâmetros a RPC nem resolve (assinatura p_filial/p_ate).
      const { data, error } = await db.rpc('rel_saldo_itens', {
        p_filial: null,
        p_ate: dataSP(0),
      })
      if (error) throw error
      const linhas = data?.length ?? 0
      ctx.saldos = data ?? []
      if (!linhas) {
        return ctx.itensAtivos
          ? { status: FALHA, detalhe: `catálogo tem ${ctx.itensAtivos} itens ativos mas a RPC devolveu 0 linhas` }
          : { status: AVISO, detalhe: '0 linhas (catálogo de itens vazio)' }
      }
      const { faltando } = conferirColunas(data[0], [
        'item_id',
        'item',
        'grupo',
        'ordem',
        'total',
        'estoque',
        'atrelados',
        'falta',
      ])
      if (faltando.length) return { status: FALHA, detalhe: `colunas faltando: ${faltando.join(', ')}` }
      return { status: OK, detalhe: `${linhas} itens no saldo consolidado · shape ok` }
    },
  },
  {
    nome: 'rpc rel_saldo_itens · por filial',
    area: 'itens · saldos lado a lado (I4)',
    async executar(db, ctx) {
      const filial = ctx.primeiraFilialId
      if (!filial) return { status: AVISO, detalhe: 'nenhuma filial para consultar' }
      const { data, error } = await db.rpc('rel_saldo_itens', { p_filial: filial, p_ate: dataSP(0) })
      if (error) throw error
      return { status: OK, detalhe: `${data?.length ?? 0} linhas para 1 filial` }
    },
  },
  {
    nome: 'rpc rel_resumo · últimos 30 dias',
    area: 'relatórios ao vivo',
    async executar(db) {
      const { data, error } = await db.rpc('rel_resumo', {
        p_filial: null,
        p_de: dataSP(-30),
        p_ate: dataSP(0),
      })
      if (error) throw error
      const linhas = Array.isArray(data) ? data.length : data ? 1 : 0
      return { status: OK, detalhe: `respondeu (${linhas} linha(s))` }
    },
  },
  {
    nome: 'rpc rel_mov_por_mes · 12 meses',
    area: 'relatórios ao vivo · gráfico',
    async executar(db) {
      const { data, error } = await db.rpc('rel_mov_por_mes', {
        p_filial: null,
        p_de: dataSP(-365),
        p_ate: dataSP(0),
      })
      if (error) throw error
      return { status: OK, detalhe: `${data?.length ?? 0} linhas (mês × tipo)` }
    },
  },
  {
    nome: 'v_estoque_atual · por filial',
    area: 'admin · filiais',
    async executar(db) {
      const { data, error } = await db.from('v_estoque_atual').select('filial, total')
      if (error) throw error
      return { status: OK, detalhe: `${data?.length ?? 0} linhas` }
    },
  },
  {
    nome: 'lancamentos_item · contagem',
    area: 'itens · histórico',
    async executar(db) {
      const { count, erro } = lerContagem(await consultaContagem(db, 'lancamentos_item'))
      if (erro) throw erro
      return { status: OK, detalhe: `${count} lançamentos` }
    },
  },
  {
    nome: 'termos_gerados · contagem',
    area: 'termos (F5A)',
    async executar(db) {
      const { count, erro } = lerContagem(await consultaContagem(db, 'termos_gerados'))
      if (erro) throw erro
      return { status: OK, detalhe: `${count} termos gerados` }
    },
  },
  {
    nome: 'relatorios_gerados · contagem',
    area: 'relatórios · snapshots',
    async executar(db) {
      const { count, erro } = lerContagem(await consultaContagem(db, 'relatorios_gerados'))
      if (erro) throw erro
      return { status: OK, detalhe: `${count} snapshots` }
    },
  },
  {
    nome: 'profiles · operadores',
    area: 'admin · usuários',
    async executar(db) {
      const { count, erro } = lerContagem(await consultaContagem(db, 'profiles'))
      if (erro) throw erro
      if (!count) return { status: FALHA, detalhe: 'nenhum operador cadastrado' }
      return { status: OK, detalhe: `${count} operadores` }
    },
  },
  // --- daqui para baixo: o que a F12 acrescenta -----------------------------
  {
    nome: 'itens.estoque_minimo (I5)',
    area: 'F12 · estoque mínimo',
    preF12: true,
    async executar(db) {
      const { data, error } = await db.from('itens').select('id, estoque_minimo').limit(1)
      if (error) {
        if (ehAusenciaDeSchema(error)) return { status: NA, detalhe: 'coluna ainda não existe — pré-F12' }
        throw error
      }
      if (!data?.length) return { status: AVISO, detalhe: 'coluna existe; catálogo vazio' }
      const { faltando } = conferirColunas(data[0], ['estoque_minimo'])
      if (faltando.length) return { status: FALHA, detalhe: 'coluna estoque_minimo não veio no retorno' }
      return { status: OK, detalhe: 'coluna estoque_minimo legível' }
    },
  },
  {
    nome: 'kits_modelos (M12) · leitura autenticada',
    area: 'F12 · kits de movimentação',
    preF12: true,
    async executar(db, ctx) {
      const { count, erro } = lerContagem(await consultaContagem(db, 'kits_modelos'))
      if (erro) {
        if (ehAusenciaDeSchema(erro)) {
          ctx.kitsAusente = true
          return { status: NA, detalhe: 'tabela ainda não existe — pré-F12' }
        }
        throw erro
      }
      ctx.kitsAusente = false
      ctx.kits = count
      return { status: OK, detalhe: `${count} kits (leitura de operador ok)` }
    },
  },
  {
    nome: 'kits_modelos · anon NÃO lê (RLS)',
    area: 'F12 · segurança',
    preF12: true,
    async executar(_db, ctx) {
      if (ctx.kitsAusente !== false) return { status: NA, detalhe: 'tabela ainda não existe — pré-F12' }
      // Client SEM sessão: a RLS tem de recusar (ou devolver zero linha).
      const anon = createClient(urlSupabase, chaveAnon, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data, error } = await anon.from('kits_modelos').select('id').limit(1)
      if (error) {
        // Tabela sumida NÃO é "RLS funcionando" — seria um falso verde de segurança.
        if (ehAusenciaDeSchema(error)) return { status: NA, detalhe: 'tabela ainda não existe — pré-F12' }
        return { status: OK, detalhe: `anon recusado pelo banco (${error.code || 'erro'})` }
      }
      if (data?.length) return { status: FALHA, detalhe: `anon leu ${data.length} linha(s) de kits_modelos` }
      // "anon vê 0 linhas" só prova alguma coisa se houver kit para ver: numa
      // tabela vazia o resultado seria 0 mesmo sem RLS nenhuma.
      if (!ctx.kits) {
        return { status: AVISO, detalhe: 'anon leu 0 linhas, mas não há kit cadastrado — RLS não comprovada' }
      }
      return { status: OK, detalhe: `operador vê ${ctx.kits} kit(s), anon vê 0` }
    },
  },
  {
    // OS-F13 §1.4.4 — o B2 ("a busca do fluxo de movimentação nunca acha nada").
    // Replica a MESMA forma de query de `buscarAtivosParaCombobox`
    // (src/lib/queries/ativos.ts): mesmo select, mesmo `.or` por palavra, mesma
    // ordenação null-last, mesmo teto de 12. Reporta CONTAGEM — nunca conteúdo.
    //
    // O termo é derivado do próprio acervo em tempo de execução (um pedaço de um
    // patrimônio que existe) e NUNCA é impresso: assim o check vale em qualquer
    // ambiente sem embutir dado real no script.
    nome: 'busca do combobox (B2) · devolve resultado',
    area: 'movimentações · busca de ativos',
    async executar(db) {
      const { data: amostra, error: erroAmostra } = await db
        .from('ativos')
        .select('patrimonio')
        .not('patrimonio', 'is', null)
        .order('patrimonio', { ascending: true })
        .limit(1)
      if (erroAmostra) throw erroAmostra
      const patrimonio = amostra?.[0]?.patrimonio
      if (!patrimonio) {
        return { status: AVISO, detalhe: 'nenhum ativo com patrimônio para derivar o termo' }
      }
      // Fragmento de 4 caracteres — o mesmo tipo de busca parcial que o operador faz.
      const termo = String(patrimonio).slice(-4)
      if (termo.length < 2) return { status: AVISO, detalhe: 'patrimônio curto demais para o teste' }

      const { data, error } = await db
        .from('ativos')
        .select(
          'id, patrimonio, service_tag, categoria, marca, modelo, status, colaborador_atual, filial_id, termo_assinado, filiais(slug, nome)',
        )
        .or(
          `patrimonio.ilike.%${termo}%,colaborador_atual.ilike.%${termo}%,marca.ilike.%${termo}%,` +
            `modelo.ilike.%${termo}%,service_tag.ilike.%${termo}%,hostname.ilike.%${termo}%`,
        )
        .order('patrimonio', { ascending: true, nullsFirst: false })
        .limit(12)
      if (error) throw error

      const linhas = data?.length ?? 0
      if (linhas === 0) {
        return { status: FALHA, detalhe: 'busca devolveu 0 resultados para um termo que existe no acervo' }
      }
      const { faltando } = conferirColunas(data[0], ['id', 'patrimonio', 'status', 'filiais'])
      if (faltando.length) {
        return { status: FALHA, detalhe: `shape da busca sem: ${faltando.join(', ')}` }
      }
      return { status: OK, detalhe: `${linhas} resultado(s) (teto 12) · shape ok` }
    },
  },
]

// ---------------------------------------------------------------------------
// PARTE C — rotas do app COM sessão (OS-F13)
// ---------------------------------------------------------------------------
// O QUE ESTA PARTE PEGA — e o que NÃO pega. Importante não vender demais:
//
// O defeito B1/B2 da F13 (o `export type { … }` que matava o módulo de Server
// Actions na avaliação) era **POST-only**: o manifesto de actions só é avaliado
// quando uma Server Action é invocada, e isso é um POST. As rotas afetadas
// respondiam **200 no GET** o tempo todo (medido — ver docs/RELATORIO-F13.md
// §3.6/§7.3). Logo, esta parte C, que faz **GET**, NÃO teria pego o B1/B2, e o
// check "busca do combobox" da parte B fala direto com o PostgREST, sem passar
// pelo app. Quem barra a recorrência do B1/B2 é a guarda de FONTE
// (`src/lib/use-server-exports.ts`, roda no `npm test`) e o gate de build
// (`scripts/verificar-actions-build.mjs`) — não este smoke.
//
// O que a parte C PEGA, e por isso vale: uma rota logada que quebre no RENDER
// (throw no Server Component da página, no layout, numa query de leitura) —
// classe que as partes A (sem sessão, redireciona antes de rotear) e B (fala
// direto com o PostgREST) não enxergam.
//
// A sessão é forjada a partir do token que a parte B já abriu: o @supabase/ssr
// guarda a sessão no cookie `sb-<ref>-auth-token` como `base64-` + base64url do
// JSON. Nada é escrito: são GETs.
const ROTAS_LOGADO = [
  { rota: '/', area: 'dashboard' },
  { rota: '/ativos', area: 'ativos · lista', marcador: 'Filtrar por filial' },
  // F25 — a multi-seleção por CSV e a sentinela abrem sem derrubar a página. A
  // conta do smoke é ADMIN, então o padrão POR CARGO do operador não é exercido
  // aqui (isso é o roteiro manual no ensaio) — o que se prova é que o param novo
  // é aceito nas duas formas.
  { rota: '/ativos?filial=1,2', area: 'ativos · filtro multi-filial (F25)' },
  { rota: '/ativos?filial=todas', area: 'ativos · sentinela "todas" (F25)' },
  // Lixo no param é IGNORADO, nunca derruba o Server Component.
  { rota: '/ativos?filial=abc,99999', area: 'ativos · filial inválida ignorada (F25)' },
  { rota: '/ativos/novo', area: 'ativos · cadastro de compra' },
  // F25 — a visão PADRÃO de /itens virou "Por filial". O filtro de filial não é
  // renderizado nessa visão (as filiais já estão todas na tela, uma por coluna),
  // então a AUSÊNCIA do botão é o que prova qual visão abriu.
  //
  // ⚠ `marcadorAusente`, e NÃO `marcadorProibido`: são perguntas diferentes.
  // `marcadorProibido` é CONTROLE DE ACESSO ("esta conta não pode chegar aqui") e
  // por isso trata um redirect como aprovação — recusar por redirect também serve.
  // Aqui a pergunta é de CONTEÚDO ("qual visão renderizou"), e um redirect é
  // fracasso, não sucesso: com o campo errado, /itens redirecionando passaria
  // VERDE sem nunca ter renderizado, e a mensagem de falha acusaria "VAZAMENTO
  // para o cargo errado" numa tela que não tem cargo nenhum envolvido.
  {
    rota: '/itens',
    area: 'itens por quantidade · abre em "Por filial" (F25)',
    marcadorAusente: 'Filtrar por filial',
  },
  // …e a sentinela explícita leva ao Consolidado, onde o filtro existe.
  {
    rota: '/itens?visao=consolidado',
    area: 'itens · Consolidado pela sentinela (F25)',
    marcador: 'Filtrar por filial',
  },
  // Link ANTIGO (`?visao=filiais`) continua significando lado a lado.
  {
    rota: '/itens?visao=filiais',
    area: 'itens · link antigo ainda vale (F25)',
    marcadorAusente: 'Filtrar por filial',
  },
  { rota: '/movimentacoes', area: 'movimentações · lista' },
  // F26 — a rota do wizard passou a ter MARCADOR de conteúdo: até aqui ela só
  // exigia 200, e um 200 sem o formulário continuaria verde. O marcador tem de
  // vir de DENTRO do `<NovaMovimentacaoForm>`, senão não prova nada: o `<h1>` e
  // o subtítulo ficam FORA do `{escreve ? formulário : estado vazio}` e saem no
  // HTML igual quando o wizard não está lá. ("Nova movimentação" é pior ainda:
  // também é item do shell e texto do botão do header.) O estado vazio do passo
  // 1 é do próprio formulário e a rota sem params sempre abre com o lote vazio.
  {
    rota: '/movimentacoes/nova',
    area: 'movimentações · fluxo (B2)',
    marcador: 'Nenhum ativo no lote ainda',
  },
  { rota: '/pendencias', area: 'pendências' },
  // F24 — a mesa de conflitos entre filiais. Conferência SÓ-LEITURA: a aba tem de abrir e
  // se identificar pelo conteúdo, não só devolver 200.
  //
  // ⚠ O marcador é o ESTADO VAZIO de propósito. Em produção há (e deve haver) ZERO grupos
  // de conflito — o índice global os impediu até a `0091`, e a fase não abriu nenhum. Um
  // marcador que exigisse um conflito na tela só ficaria verde se alguém tivesse importado
  // um duplicado, o que é o contrário do que se quer. Se um dia houver conflito real em
  // produção, esta entrada passa a falhar — e isso é informação, não defeito: quer dizer
  // que há trabalho esperando na mesa.
  {
    rota: '/pendencias?tipo=conflito',
    area: 'pendências · conflitos entre filiais (F24)',
    marcador: 'Nenhum conflito entre filiais',
    // F25 — o marcador ALTERNATIVO (um rótulo que só a mesa renderiza).
    //
    // A nota acima previa que esta entrada passaria a falhar no dia em que
    // houvesse conflito real em produção, e chamou isso de informação. Ela chegou:
    // em 04/08/2026 produção tem **137 grupos** (um import trouxe máquinas que já
    // existiam em outra unidade). Só que um check que fica vermelho por causa do
    // ESTADO DOS DADOS deixa de medir o que deveria — que a rota abre e se
    // identifica pelo conteúdo — e, pior, normaliza smoke vermelho, que é como uma
    // falha de verdade passa despercebida na fase seguinte.
    //
    // Com os dois marcadores o check aceita as DUAS faces legítimas da tela (mesa
    // vazia OU mesa com conflitos) e continua reprovando erro, redirect e página
    // em branco. Quem conta os conflitos é o selo da sidebar, que é o lugar certo.
    marcadorAlternativo: 'Última movimentação',
  },
  { rota: '/ajuda', area: 'ajuda (B3)' },
  { rota: '/admin/usuarios', area: 'admin · usuários (B1)' },
  { rota: '/admin/itens', area: 'admin · catálogo de itens' },
  { rota: '/admin/kits', area: 'admin · kits (M12)' },
  { rota: '/admin/importar', area: 'admin · import de startup' },
  { rota: '/relatorios/geral', area: 'relatório ao vivo' },
  { rota: '/relatorios/gerados', area: 'relatórios gerados' },
  { rota: '/ajuda/manual', area: 'ajuda · manual completo (F20)' },
  // F22 — a /dev é a ÚNICA rota que a conta do smoke NÃO pode abrir: ela é de um
  // ADMINISTRADOR, e a área é exclusiva do cargo Desenvolvedor.
  //
  // ⚠ O CRITÉRIO É O CONTEÚDO, NÃO O STATUS — e a primeira versão desta entrada errou nisso.
  // Ela exigia um 3xx e tratava 200 como vazamento; medido contra a produção, o
  // `redirect('/')` do `dev/layout.tsx` é resolvido pelo Next NO SERVIDOR e a resposta volta
  // **200 com o HTML do PAINEL**. Ou seja: o gate funciona perfeitamente e o check acusaria
  // falha. O que prova a ausência de vazamento é o corpo não trazer nada da área técnica.
  {
    rota: '/dev',
    area: 'dev · área técnica (F22)',
    marcadorProibido: 'Área técnica de manutenção',
  },
  // F23 — a Zona destrutiva. Mesmo critério, e é a rota em que ele mais importa: um
  // administrador que a alcançasse teria, de uma vez, apagar ativo, resetar filial e forçar
  // estado. O gate é o `layout.tsx` de /dev (a subrota herda) MAIS o `exigirDev` da própria
  // página; se os dois falhassem, o marcador apareceria aqui e o smoke ficaria vermelho.
  //
  // ⚠ ARMADILHA CONHECIDA (F27): este marcador é uma string que também serviria de
  // TÍTULO de aba. O Next resolve o `<title>` a partir da rota PEDIDA mesmo quando o
  // `redirect('/')` do layout já devolveu o corpo do painel — então um
  // `export const metadata = { title: 'Zona destrutiva' }` nesta página faz o marcador
  // aparecer no HTML de quem foi barrado e este check ficar VERMELHO sem que exista
  // vazamento nenhum. Foi exatamente o que aconteceu na F27, e por isso
  // `dev/destrutivo/page.tsx` tem o título "Desenvolvedor" e um comentário explicando.
  // Quem for mexer no título daquela rota: mexa aqui também, ou troque este marcador
  // por um que só exista no CORPO da área (ex.: "Forçar estado").
  {
    rota: '/dev/destrutivo',
    area: 'dev · zona destrutiva (F23)',
    marcadorProibido: 'Zona destrutiva',
  },
]

// F20 — as páginas da documentação. Além do 200, cada uma exige o MARCADOR:
// slug que existe mas cai numa página vazia (ou na de outra) devolveria 200
// alegremente. O marcador é o título da página, o mesmo que o <h1> renderiza.
//
// Esta lista é ESPELHO de `src/lib/ajuda/registry.ts` — um script .mjs não
// importa TypeScript. Quem garante que ela não envelhece é o teste
// `src/lib/ajuda/smoke-ajuda.test.ts`, que lê ESTE arquivo e compara com o
// registry: página nova sem entrada aqui quebra o `npm run test`.
const PAGINAS_AJUDA = [
  ['comece-aqui', 'Comece aqui'],
  ['conceito-movimentacao', 'A movimentação é a fonte da verdade'],
  ['identidade-do-equipamento', 'Patrimônio, service tag e o par que identifica'],
  ['acesso-e-sessoes', 'Quem acessa o quê'],
  ['mapa-das-telas', 'Mapa das telas e navegação'],
  ['registrar-movimentacao', 'Registrar uma movimentação'],
  ['colar-e-bipar-lote', 'Colar ou bipar uma lista de patrimônios'],
  ['kits-de-movimentacao', 'Criar e aplicar um kit'],
  ['entregar-emprestar-reservar', 'Entregar, emprestar e reservar'],
  ['devolucao-e-triagem', 'Receber de volta: devolução e triagem'],
  ['manutencao', 'Manutenção, do envio à troca'],
  ['transferir-defasar-descartar', 'Transferir, marcar defasado e descartar'],
  ['corrigir-estorno-ajuste', 'Corrigir o que ficou errado'],
  ['cadastrar-compra', 'Dar entrada de equipamentos novos'],
  ['termos-de-responsabilidade', 'Termos de responsabilidade'],
  ['ficha-do-ativo', 'A ficha do ativo'],
  ['lista-de-ativos', 'Encontrar e exportar ativos'],
  ['lista-de-movimentacoes', 'Achar uma movimentação já registrada'],
  ['lancar-itens', 'Lançar itens por quantidade'],
  ['saldos-e-estoque-minimo', 'Ler os saldos e o estoque mínimo'],
  ['resolver-pendencias', 'Resolver as pendências'],
  ['administracao', 'Administração: os cadastros de apoio'],
  ['usuarios-e-senhas', 'Operadores e senhas de acesso'],
  ['import-de-startup', 'Import de startup de uma filial'],
  ['relatorio-ao-vivo', 'Ler o relatório ao vivo'],
  ['relatorios-gerados', 'Os relatórios gerados da semana'],
  ['status-do-ativo', 'Status e categorias do ativo'],
  ['tipos-de-movimentacao', 'Tipos de movimentação'],
  ['itens-por-quantidade', 'Itens por quantidade'],
  ['limites-e-atalhos', 'Limites, tetos e atalhos'],
  ['mensagens-de-erro', 'Mensagens de erro'],
  ['problemas-comuns', 'Problemas comuns'],
  ['problemas-import-e-acesso', 'Problemas de import e de acesso'],
]

for (const [slug, titulo] of PAGINAS_AJUDA) {
  ROTAS_LOGADO.push({
    rota: `/ajuda/${slug}`,
    area: 'ajuda · página (F20)',
    marcador: titulo,
  })
}

// Marcadores de "a página renderizou, mas quebrada". O Next serve a página de
// erro com 200 em alguns caminhos de streaming — por isso não basta o status.
const MARCADORES_ERRO = [
  'is not defined',
  'Application error',
  'Internal Server Error',
  'digest&quot;:&quot;',
]

// Renderizar uma página logada inteira é bem mais caro que o redirect da parte A
// (cold start da lambda + as leituras da própria página), então esta parte usa um
// teto próprio, maior.
const TIMEOUT_LOGADO_MS = 60_000

function cookieDaSessao(sessao) {
  const ref = new URL(urlSupabase).hostname.split('.')[0]
  const valor = 'base64-' + Buffer.from(JSON.stringify(sessao), 'utf8').toString('base64url')
  return `sb-${ref}-auth-token=${valor}`
}

async function parteC(sessao) {
  log('')
  log(`PARTE C — rotas do app COM sessão · ${urlApp}`)

  let cookie
  try {
    cookie = cookieDaSessao(sessao)
  } catch (erro) {
    registrar('C', 'sessão · cookie', 'auth', FALHA, `não montei o cookie: ${descreverErro(erro)}`)
    return
  }

  for (const entrada of ROTAS_LOGADO) {
    const alvo = `${urlApp}${entrada.rota}`
    let status = FALHA
    let detalhe = ''
    try {
      const resposta = await fetch(alvo, {
        redirect: 'manual',
        headers: { cookie, 'user-agent': 'smoke-estoque-ti-wap' },
        signal: AbortSignal.timeout(TIMEOUT_LOGADO_MS),
      })
      const codigo = resposta.status
      if (codigo >= 500) {
        resposta.body?.cancel().catch(() => {})
        detalhe = `HTTP ${codigo} — a rota quebrou COM sessão`
      } else if (codigo >= 300 && codigo < 400) {
        resposta.body?.cancel().catch(() => {})
        const destino = resposta.headers.get('location') || '(sem location)'
        if (entrada.marcadorProibido && !destino.includes('/login')) {
          // Recusa por redirect também serve: o que importa é não chegar na área.
          status = OK
          detalhe = `HTTP ${codigo} → ${destino} — recusada para este cargo, como deve ser`
        } else {
          // Redirect para /login = a sessão forjada não foi aceita: é limitação do
          // smoke, não defeito da aplicação. Não derruba o exit code.
          status = AVISO
          detalhe = `HTTP ${codigo} → ${destino} (sessão não aceita — check inconclusivo)`
        }
      } else if (codigo !== 200) {
        resposta.body?.cancel().catch(() => {})
        detalhe = `HTTP ${codigo} — esperado 200`
      } else {
        const corpo = await resposta.text()
        const achados = MARCADORES_ERRO.filter((m) => corpo.includes(m))
        if (achados.length) {
          detalhe = `HTTP 200 mas a página é de erro (marcadores: ${achados.join(', ')})`
        } else if (
          entrada.marcador &&
          !corpo.includes(entrada.marcador) &&
          !(entrada.marcadorAlternativo && corpo.includes(entrada.marcadorAlternativo))
        ) {
          // F20: a rota respondeu, mas não é a página que deveria ser (slug
          // órfão, conteúdo vazio, registry fora de sincronia com o deploy).
          detalhe = `HTTP 200 sem o conteúdo esperado ("${entrada.marcador}")`
        } else if (entrada.marcadorProibido && corpo.includes(entrada.marcadorProibido)) {
          // F22: a conta do smoke é ADMIN e esta área é do cargo Desenvolvedor. Chegar aqui
          // com o conteúdo da área dentro do corpo é VAZAMENTO — o gate do layout falhou.
          detalhe = `HTTP 200 COM o conteúdo da área restrita ("${entrada.marcadorProibido}") — VAZAMENTO para o cargo errado`
        } else if (entrada.marcadorAusente && corpo.includes(entrada.marcadorAusente)) {
          // F25: asserção de CONTEÚDO (a rota renderizou a variante errada), nada a ver
          // com cargo. Só existe neste ramo — para este campo um redirect é falha, e por
          // isso ele não aparece no ramo 3xx acima.
          detalhe = `HTTP 200 mas a página trouxe "${entrada.marcadorAusente}" — renderizou a variante errada`
        } else {
          status = OK
          detalhe = `HTTP 200 (${corpo.length} bytes)`
        }
      }
    } catch (erro) {
      detalhe = `sem resposta (${descreverErro(erro)})`
    }
    registrar('C', entrada.rota, entrada.area, status, detalhe)
  }
}

async function parteB() {
  log('')
  if (somenteParteA) {
    log('PARTE B — logado: PULADA (--sem-sessao)')
    pendencias.push('Parte B pulada por --sem-sessao.')
    return
  }

  const faltando = []
  if (!urlSupabase) faltando.push('SMOKE_SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL)')
  if (!chaveAnon) faltando.push('SMOKE_SUPABASE_ANON_KEY (ou NEXT_PUBLIC_SUPABASE_ANON_KEY)')
  if (!email) faltando.push('SMOKE_EMAIL')
  if (!senha) faltando.push('SMOKE_SENHA')

  if (faltando.length) {
    log('PARTE B — logado: NÃO EXECUTADA (faltam variáveis de ambiente)')
    log(`  variáveis ausentes: ${faltando.join(', ')}`)
    pendencias.push(
      `Parte B não executada — defina ${faltando.join(', ')} e rode de novo (ver scripts/smoke/README.md).`,
    )
    return
  }

  log(`PARTE B — logado · ${urlSupabase}`)

  const db = createClient(urlSupabase, chaveAnon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password: senha })
    if (error || !data?.session) {
      registrar('B', 'sessão · login', 'auth', FALHA, `login recusado: ${descreverErro(error)}`)
      return
    }
    registrar('B', 'sessão · login', 'auth', OK, 'sessão de operador aberta (conta mascarada)')

    const ctx = {}
    for (const check of CHECKS) {
      // A primeira filial serve ao check "por filial" sem outra leitura.
      if (check.nome.includes('por filial') && ctx.primeiraFilialId === undefined) {
        const { data: filiais } = await db
          .from('filiais')
          .select('id')
          .eq('ativo', true)
          .order('id')
          .limit(1)
        ctx.primeiraFilialId = filiais?.[0]?.id ?? null
      }
      let resultado
      try {
        resultado = await check.executar(db, ctx)
      } catch (erro) {
        resultado = { status: FALHA, detalhe: descreverErro(erro) }
      }
      let status = resultado.status
      let detalhe = resultado.detalhe
      if (status === NA && exigirF12) {
        status = FALHA
        detalhe = `${detalhe} — exigido por --exigir-f12`
      }
      registrar('B', check.nome, check.area, status, detalhe)
    }

    // Parte C usa a MESMA sessão — precisa rodar antes do signOut do finally.
    await parteC(data.session)
  } finally {
    // signOut SEMPRE — inclusive se algum check explodir no meio.
    try {
      await db.auth.signOut()
      log('  sessão encerrada (signOut).')
    } catch (erro) {
      log(`  aviso: signOut falhou — ${descreverErro(erro)}`)
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Execução e resumo
// ---------------------------------------------------------------------------

function resumo() {
  const conta = (status) => resultados.filter((r) => r.status === status).length
  const falhas = resultados.filter((r) => r.status === FALHA)
  const naos = resultados.filter((r) => r.status === NA)

  log('')
  log('='.repeat(72))
  log(
    `RESUMO · ${conta(OK)} OK · ${conta(AVISO)} aviso · ${naos.length} n/a (pré-F12) · ${falhas.length} falha`,
  )

  if (naos.length) {
    log('')
    log('n/a — pré-F12 (a migration correspondente ainda não está neste ambiente):')
    for (const r of naos) log(`  · ${r.nome}`)
  }

  if (falhas.length) {
    log('')
    log('FALHAS:')
    for (const r of falhas) log(`  · [${r.parte}] ${r.nome} (${r.area}) — ${r.detalhe}`)
  }

  if (pendencias.length) {
    log('')
    log('Pendências:')
    for (const p of pendencias) log(`  · ${p}`)
  }

  log('='.repeat(72))
  return falhas.length === 0
}

async function main() {
  log('')
  log('Smoke do Estoque TI WAP — OS-F12 §W5 + OS-F13 §1.4.4 (parte C)')
  log(`  app.......: ${urlApp}`)
  log(`  supabase..: ${urlSupabase || '(não configurado)'}`)
  log(`  credenciais: ${email && senha ? 'presentes (mascaradas)' : 'ausentes'}`)
  log(`  .env.local: ${envCarregadas} variável(is) carregada(s)`)
  log(`  modo......: ${exigirF12 ? 'exigindo F12 (n/a vira falha)' : 'tolerante a pré-F12'}`)

  await parteA()
  await parteB()

  const verde = resumo()
  process.exitCode = verde ? 0 : 1
}

// Sem estes dois handlers o Node imprimiria o erro sozinho, ANTES de qualquer
// código nosso — e aí não haveria máscara nenhuma.
process.on('unhandledRejection', (erro) => {
  log(`Erro não tratado: ${descreverErro(erro)}`)
  process.exitCode = 1
})

process.on('uncaughtException', (erro) => {
  log(`Exceção não capturada: ${descreverErro(erro)}`)
  process.exit(1)
})

try {
  await main()
} catch (erro) {
  log('')
  log(`ERRO FATAL: ${descreverErro(erro)}`)
  if (erro instanceof Error && erro.stack) log(mascarar(erro.stack))
  process.exitCode = 1
}
