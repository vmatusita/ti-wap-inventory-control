#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Harness de medição de performance dos ITENS por quantidade (F37 · frente C)
// ---------------------------------------------------------------------------
// Popula um banco de ENSAIO com volume 100% FICTÍCIO em três patamares — 10 mil,
// 100 mil e 500 mil lançamentos de item — e mede, em CADA patamar, com
// EXPLAIN ANALYZE:
//   1. public.rel_saldo_itens(null, hoje)   e também com UMA filial;
//   2. public.rel_mov_itens(null, <de>, <hoje>);
//   3. o custo POR INSERT do trigger `valida_lancamento_item` — inserts
//      individuais num par (item, filial) que já acumulou muitas linhas (o
//      "par quente"), que é o driver quadrático descrito abaixo;
//   4. o histórico paginado da tela de itens (offset raso e offset profundo).
//
//   node scripts/perf/medir-itens.mjs
//   MEDIR_ITENS_PATAMARES=100,1000,5000 node scripts/perf/medir-itens.mjs   (smoke)
//
// **ESTE ARQUIVO NÃO FOI EXECUTADO NESTA SESSÃO** (ordem explícita da OS-F37: o
// projeto de ensaio sgmvldiizsrjbxzzpmhh está INACTIVE/pausado, e produção está
// proibida em qualquer hipótese). Confira só a sintaxe: `node --check
// scripts/perf/medir-itens.mjs`. Antes do primeiro uso real, confirme contra a
// documentação vigente da Management API (regra 6 do CLAUDE.md) o shape exato
// da resposta de `POST /database/query` — o parser abaixo (`extrairLinhas`) é
// DEFENSIVO e aceita as formas mais prováveis, mas não foi validado contra o
// endpoint ao vivo.
//
// REGRAS QUE ESTE ARQUIVO NÃO QUEBRA (CLAUDE.md):
//  - **Nunca produção, em hipótese nenhuma.** A guarda (seção 2) recusa
//    qualquer ref de `REFS_DE_PRODUCAO` — olhando tanto a variável de ref
//    quanto qualquer URL de Supabase presente no ambiente (mesma dupla
//    checagem de `scripts/env-guard.ts`, motivada pelo achado da F11: comparar
//    duas variáveis entre si é teste de CONSISTÊNCIA, não de IDENTIDADE contra
//    produção — as duas podem concordar e ainda assim serem produção).
//  - **Confirmação explícita.** `MEDIR_ITENS_CONFIRM=sim` é obrigatório, no
//    espelho de `SEED_CONFIRM` (scripts/env-guard.ts).
//  - **Segredos só do ambiente, mascarados em QUALQUER saída** — inclusive
//    stack trace — mesmo padrão de `scripts/perf/medir.mjs`.
//  - **Dados 100% fictícios.** `@faker-js/faker` com seed determinístico
//    (idioma de `scripts/seed.ts`); todo lançamento e todo item fictício
//    criado por este script leva um marcador único e óbvio (`PERF-F37`), que é
//    exatamente o que a limpeza usa para achar tudo de volta.
//  - **Limpeza obrigatória, inclusive em erro** (try/finally): conta ANTES,
//    conta DEPOIS, imprime as duas; se a limpeza não zerar o que este script
//    criou, o script GRITA e sai != 0 — um ensaio sujo envenena todo rehearsal
//    futuro (§C.2 da ordem).
//  - **Nenhuma otimização.** Este arquivo só MEDE. Nenhum índice novo, nenhuma
//    paginação nova, nenhum saldo materializado — isso é decisão de outra fase
//    (D6, docs/PLAN-F36-F39.md §9).
//
// ---------------------------------------------------------------------------
// POR QUE POPULAR CUSTA O(N²) — E O QUE ESTE SCRIPT FAZ SOBRE ISSO
// ---------------------------------------------------------------------------
// `public.valida_lancamento_item()` (supabase/migrations/0015, corpo final na
// 0027) roda `perform pg_advisory_xact_lock(new.item_id, new.filial_id)` e
// depois agrega TODO o diário existente do par (item, filial) — um
// `select coalesce(sum(...))` sobre `public.lancamentos_item` filtrado por
// `item_id = new.item_id and filial_id = new.filial_id` — a CADA INSERT, via
// o trigger `trg_valida_lancamento_item` (BEFORE INSERT). Popular N linhas do
// MESMO par custa O(N²): a k-ésima linha reagrega as k-1 anteriores.
//
// Duas respostas, as DUAS declaradas no JSON de saída (`metodo.pares`,
// `metodo.linhas_por_par`, `metodo.populacao`):
//
//   a) ESPALHAR por muitos pares. Este harness CRIA um catálogo fictício de
//      itens (`MEDIR_ITENS_ITENS_FICTICIOS`, default 300) e cruza com as
//      filiais REAIS já existentes no ensaio (não fictícias — filial não é
//      dado sensível, é estrutura organizacional), formando uma piscina de
//      pares. O custo quadrático é por PAR, não pelo total: com N pares e
//      L linhas por par (L << total), o custo é N·O(L²), não O((N·L)²).
//   b) DESLIGAR o trigger durante a população (opt-in, nunca por padrão — o
//      padrão MEDE o custo real, que é o entregável da fase). Ver
//      `MEDIR_ITENS_DESLIGAR_TRIGGER` na seção 2.
//
// Mesmo espalhando, este harness dedica de propósito UM par — o "par quente"
// (o primeiro item fictício × a primeira filial) — para receber uma fatia
// maior das linhas (`MEDIR_ITENS_FRACAO_QUENTE`), justamente para ter, em cada
// patamar, um par "que já tem muitas linhas" sobre o qual medir o custo por
// INSERT (medida 3) — é o par que a ordem pede.
//
// ---------------------------------------------------------------------------
// A GUARDA DE DELETE EM `lancamentos_item` — E POR QUE A LIMPEZA PRECISA DELA
// ---------------------------------------------------------------------------
// `guarda_acervo` (migration 0081) recusa DELETE em `public.lancamentos_item`
// para TODO MUNDO — inclusive service role — fora da janela local-à-transação
// `estoque.dev_destrutivo`. Isso vale também no projeto de ENSAIO (mesma
// árvore de migrations). Sem abrir essa janela, a limpeza deste script
// simplesmente falharia com `42501` e o ensaio ficaria permanentemente sujo.
//
// Este script abre a janela (`set_config('estoque.dev_destrutivo','on',true)`)
// SÓ dentro da transação de limpeza, SÓ depois de todas as guardas de
// ambiente (seção 2) terem passado, e a fecha ao final da mesma transação
// (a semântica de `is_local=true` já fecha sozinha no COMMIT). Isto não é um
// furo na guarda: o comentário da própria 0081 reconhece que quem tem acesso
// direto ao SQL (SQL Editor, ou aqui, a Management API como `postgres`) está
// FORA do modelo de ameaça do trigger — "é a mesma fronteira que a 0073
// aceitou". A autorização de quem PODE rodar este script é humana (quem tem o
// `SUPABASE_ACCESS_TOKEN` do projeto de ensaio), não uma RPC.
// **Nunca** faça isso contra produção — é exatamente por isso que a guarda de
// ref (seção 2) roda ANTES de qualquer SQL, sem exceção.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import { fakerPT_BR as faker } from '@faker-js/faker'
import seedrandom from 'seedrandom'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')

// ---------------------------------------------------------------------------
// 1. Ambiente (cascata idêntica à do smoke/medir.mjs — scripts/smoke/README.md)
// ---------------------------------------------------------------------------

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

carregarEnvArquivo(join(RAIZ, '.env.local'))

const argv = process.argv.slice(2)
function opcao(nome, padrao) {
  const i = argv.indexOf(`--${nome}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : padrao
}
const temFlag = (nome) => argv.includes(`--${nome}`)

// Guarda de NaN (mesmo motivo do achado 6 da F34-perf, replicado aqui: um
// argv/env malformado não pode virar timeout zero nem "zero rodadas" caladas).
// `>= 0` de propósito — só valor malformado/negativo cai no padrão.
function numeroOuPadrao(valor, padrao) {
  const texto = typeof valor === 'string' ? valor.trim() : valor
  if (texto === undefined || texto === null || texto === '') return padrao
  const n = Number(texto)
  return Number.isFinite(n) && n >= 0 ? n : padrao
}

// Lista de inteiros positivos separados por vírgula, ORDENADA ascendente (os
// patamares são CUMULATIVOS — ver seção 6). Qualquer token malformado (NaN,
// <= 0) derruba a lista INTEIRA para o padrão — um patamar inválido no meio
// (ex.: "10000,,500000") não deve virar "dois patamares" em silêncio.
function listaDeInteirosOuPadrao(valor, padrao) {
  const texto = typeof valor === 'string' ? valor.trim() : ''
  if (!texto) return padrao
  const partes = texto.split(',').map((p) => p.trim())
  const nums = partes.map((p) => Number(p))
  if (nums.some((n) => !Number.isFinite(n) || n <= 0 || !Number.isInteger(n))) return padrao
  return [...new Set(nums)].sort((a, b) => a - b)
}

const REF = opcao('ref', process.env.MEDIR_ITENS_REF || '')
const TOKEN = process.env.MEDIR_ITENS_ACCESS_TOKEN || process.env.SUPABASE_ACCESS_TOKEN || ''
const CONFIRMADO = process.env.MEDIR_ITENS_CONFIRM === 'sim'

const ROTULO = opcao('rotulo', process.env.MEDIR_ITENS_ROTULO || 'f37-itens-ensaio')
const SAIDA = opcao('saida', process.env.MEDIR_ITENS_SAIDA || '')
const TIMEOUT_MS = numeroOuPadrao(opcao('timeout', process.env.MEDIR_ITENS_TIMEOUT_MS), 180000)
const PATAMARES = listaDeInteirosOuPadrao(
  opcao('patamares', process.env.MEDIR_ITENS_PATAMARES),
  [10000, 100000, 500000],
)
const ITENS_FICTICIOS = Math.max(
  1,
  numeroOuPadrao(opcao('itens-ficticios', process.env.MEDIR_ITENS_ITENS_FICTICIOS), 300),
)
// `Math.max(1, ...)` em vez de `|| padrao` (aqui e nas três constantes
// abaixo): `0 || padrao` substituiria em silêncio um `0` EXPLICITAMENTE
// pedido pelo padrão — e para LOTE, especificamente, `0` seria pior que um
// valor errado: `Math.min(LOTE, restante)` viraria `0` e o
// `while (restante > 0)` de `popularIncremento` LOOPARIA PARA SEMPRE
// (restante nunca diminuiria). `Math.max(1, ...)` fecha os dois problemas:
// não mascara um `0` explícito com o padrão, e nunca deixa o piso chegar a
// zero.
const LOTE = Math.max(1, numeroOuPadrao(opcao('lote', process.env.MEDIR_ITENS_LOTE), 500))
const FRACAO_QUENTE = (() => {
  const n = numeroOuPadrao(opcao('fracao-quente', process.env.MEDIR_ITENS_FRACAO_QUENTE), 0.15)
  return n > 0 && n < 1 ? n : 0.15
})()
const REPETICOES_LEITURA = Math.max(1, numeroOuPadrao(process.env.MEDIR_ITENS_REPETICOES_LEITURA, 3))
const REPETICOES_INSERT = Math.max(1, numeroOuPadrao(process.env.MEDIR_ITENS_REPETICOES_INSERT, 20))
// Opt-in, NUNCA padrão (ver "POR QUE POPULAR CUSTA O(N²)" acima) — desliga
// `trg_valida_lancamento_item` (só ele; `lancamentos_item_guarda_acervo`
// continua ligado) durante a população, religando no finally.
const DESLIGAR_TRIGGER_POPULACAO =
  temFlag('desligar-trigger') || process.env.MEDIR_ITENS_DESLIGAR_TRIGGER === 'sim'

const NOME_TRIGGER_VALIDACAO = 'trg_valida_lancamento_item' // supabase/migrations/0015
const MARCADOR = 'PERF-F37' // prefixo único — a limpeza acha tudo por ele

// ---------------------------------------------------------------------------
// 2. Guardas — rodam ANTES de qualquer chamada de rede (CLAUDE.md, §C.2 da OS)
// ---------------------------------------------------------------------------

// ESPELHA `scripts/env-guard.ts` (REFS_DE_PRODUCAO) e docs/RUNBOOK-BANCO.md.
// Este arquivo é .mjs e aquele é .ts — não dá para importar direto — então a
// lista é REPLICADA aqui, de propósito. Projeto novo de produção entra nos
// DOIS arquivos (este e scripts/env-guard.ts) no MESMO commit; deixar só um
// atualizado é o tipo de drift que este comentário existe para evitar.
const REFS_DE_PRODUCAO = ['pbtjcalbmepmrqzprusb']

function refDeUrl(url) {
  try {
    return new URL(url).hostname.split('.')[0] || null
  } catch {
    return null
  }
}

function assertGuardas() {
  const erros = []

  if (!CONFIRMADO) {
    erros.push(
      'MEDIR_ITENS_CONFIRM diferente de "sim". Defina MEDIR_ITENS_CONFIRM=sim para confirmar que você quer mesmo popular e apagar linhas neste projeto.',
    )
  }
  if (!REF) {
    erros.push('MEDIR_ITENS_REF ausente. Defina o ref do projeto de ENSAIO (nunca produção).')
  }
  if (!TOKEN) {
    erros.push(
      'SUPABASE_ACCESS_TOKEN (ou MEDIR_ITENS_ACCESS_TOKEN) ausente — necessário para falar com a Management API.',
    )
  }

  // A checagem de "ref da URL E variável de ref" do env-guard.ts (achado F11):
  // comparar duas variáveis entre si é teste de CONSISTÊNCIA, não de
  // IDENTIDADE — as duas podem concordar e ainda ser produção. Por isso cada
  // ref encontrado (o explícito E qualquer um escondido numa URL de Supabase
  // que porventura esteja no .env.local) é checado, um a um, contra a lista
  // de produção — nenhum atalho por "eles batem entre si".
  const urlNoAmbiente =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.PERF_SUPABASE_URL ||
    process.env.SMOKE_SUPABASE_URL ||
    ''
  const refNaUrl = urlNoAmbiente ? refDeUrl(urlNoAmbiente) : null

  for (const ref of [REF, refNaUrl]) {
    if (ref && (REFS_DE_PRODUCAO).includes(ref)) {
      erros.push(
        `O ref "${ref}" é PRODUÇÃO (docs/RUNBOOK-BANCO.md). Este harness popula e APAGA linhas — nunca roda ali, em hipótese nenhuma. Aponte MEDIR_ITENS_REF (e, se presente, NEXT_PUBLIC_SUPABASE_URL) para o projeto de ensaio.`,
      )
      break
    }
  }

  if (PATAMARES.length === 0) {
    erros.push('MEDIR_ITENS_PATAMARES resultou em lista vazia — confira o formato ("10000,100000,500000").')
  }

  if (erros.length > 0) {
    console.error('\n[GUARDA] Execução recusada:\n- ' + erros.join('\n- ') + '\n')
    process.exit(1)
  }
}

assertGuardas()

// ---------------------------------------------------------------------------
// 3. Máscara de segredos — envolve TODO o console (padrão do smoke/medir.mjs)
// ---------------------------------------------------------------------------
// O REF entra na lista de "segredos" também: não é uma senha, mas nenhum ref
// de projeto real precisa aparecer em log nem no JSON versionado — o arquivo
// de saída usa sempre o literal 'ensaio' (ver seção 8), e os logs mascaram
// qualquer ocorrência do ref, por hábito e por segurança em profundidade.
const SEGREDOS = [TOKEN, REF].filter((v) => typeof v === 'string' && v.length >= 6)

function mascarar(valor) {
  let texto = typeof valor === 'string' ? valor : String(valor ?? '')
  for (const segredo of SEGREDOS) texto = texto.split(segredo).join('***')
  return texto
}
function textoDe(valor) {
  return typeof valor === 'string' ? valor : inspect(valor, { depth: 5 })
}
for (const metodo of ['log', 'error', 'warn', 'info', 'debug']) {
  const original = console[metodo].bind(console)
  console[metodo] = (...args) => original(...args.map((a) => mascarar(textoDe(a))))
}
function log(texto = '') {
  console.log(mascarar(texto))
}
function descreverErro(erro) {
  if (!erro) return 'erro desconhecido'
  if (erro instanceof Error) return mascarar(`${erro.message || erro.name}${erro.stack ? '\n' + erro.stack : ''}`)
  const codigo = erro.code ? `[${erro.code}] ` : ''
  return mascarar(`${codigo}${erro.message ?? JSON.stringify(erro)}`)
}

// ---------------------------------------------------------------------------
// 4. Transporte — Management API (não há psql, Docker nem CLI apontando pro
//    ensaio neste ambiente). Se um dia houver conexão Postgres direta, ESTE é
//    o ÚNICO trecho a trocar — todo o resto do arquivo fala só com `consultar`
//    e `explain`, nunca com fetch/URL diretamente.
// ---------------------------------------------------------------------------

const URL_MANAGEMENT_API = `https://api.supabase.com/v1/projects/${REF}/database/query`

// Extrai as linhas do resultado. A ordem que a Management API devolve o
// resultado do ÚLTIMO select do payload não está 100% documentada aqui
// (ver aviso no cabeçalho) — por isso o parser é DEFENSIVO: aceita a resposta
// já como array de linhas, ou embrulhada em `{ result: [...] }` / `{ data: [...] }`.
function extrairLinhas(json) {
  if (Array.isArray(json)) return json
  if (json && Array.isArray(json.result)) return json.result
  if (json && Array.isArray(json.data)) return json.data
  throw new Error(`Formato de resposta inesperado da Management API: ${inspect(json, { depth: 3 })}`)
}

async function consultar(sql) {
  let resposta
  try {
    resposta = await fetch(URL_MANAGEMENT_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (erro) {
    throw new Error(`Falha de rede falando com a Management API: ${descreverErro(erro)}`)
  }

  const corpoTexto = await resposta.text()
  let corpo
  try {
    corpo = corpoTexto ? JSON.parse(corpoTexto) : null
  } catch {
    corpo = corpoTexto
  }

  if (!resposta.ok) {
    const msg =
      corpo && typeof corpo === 'object' && 'message' in corpo
        ? corpo.message
        : typeof corpo === 'string'
          ? corpo
          : JSON.stringify(corpo)
    throw new Error(`Management API respondeu HTTP ${resposta.status}: ${mascarar(String(msg))}`)
  }

  return extrairLinhas(corpo ?? [])
}

// Um valor json/text é UUID? Checagem defensiva antes de interpolar qualquer
// coisa vinda do banco de volta numa query (mesmo sendo, aqui, só um id que o
// próprio ensaio devolveu — nunca confie de graça num id que vai virar SQL).
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function assertUuid(v, contexto) {
  if (typeof v !== 'string' || !RE_UUID.test(v)) {
    throw new Error(`Valor não é um UUID válido (${contexto}): ${inspect(v)}`)
  }
  return v
}

// EXPLAIN ANALYZE, BUFFERS, FORMAT JSON — devolve { execution_ms, planning_ms,
// shared_hit, shared_read, plano_resumo }. Roda a query PARA VALER (é o que
// ANALYZE faz) — usado tanto para as leituras (sem efeito colateral) quanto
// para os inserts individuais medidos (medida 3), que precisam acontecer de
// verdade para o par quente continuar crescendo entre uma chamada e outra.
async function explain(sql) {
  const linhas = await consultar(`explain (analyze, buffers, format json) ${sql}`)
  if (!linhas.length) throw new Error(`EXPLAIN não devolveu linha nenhuma para: ${sql}`)
  const bruto = linhas[0]['QUERY PLAN'] ?? linhas[0]['query plan'] ?? linhas[0]
  const plano = typeof bruto === 'string' ? JSON.parse(bruto) : bruto
  const raiz = Array.isArray(plano) ? plano[0] : plano
  if (!raiz || !raiz.Plan) {
    throw new Error(
      `EXPLAIN (FORMAT JSON) veio num formato que não reconheço — confira o shape real da ` +
        `Management API (ver aviso no cabeçalho do arquivo). Bruto: ${inspect(linhas[0], { depth: 4 })}`,
    )
  }

  function somarBuffers(node, acc) {
    acc.hit += Number(node['Shared Hit Blocks'] ?? 0)
    acc.read += Number(node['Shared Read Blocks'] ?? 0)
    for (const filho of node.Plans ?? []) somarBuffers(filho, acc)
    return acc
  }
  const buffers = somarBuffers(raiz.Plan, { hit: 0, read: 0 })

  const tipo = raiz.Plan?.['Node Type'] ?? '?'
  const alvo = raiz.Plan?.['Relation Name']
    ? ` on ${raiz.Plan['Relation Name']}`
    : raiz.Plan?.['Index Name']
      ? ` (${raiz.Plan['Index Name']})`
      : ''

  return {
    execution_ms: Number(raiz['Execution Time'] ?? 0),
    planning_ms: Number(raiz['Planning Time'] ?? 0),
    shared_hit: buffers.hit,
    shared_read: buffers.read,
    plano_resumo: `${tipo}${alvo}`,
  }
}

const mediana = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const meio = Math.floor(s.length / 2)
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2
}
const r1 = (x) => (x === null || x === undefined ? null : Math.round(x * 10) / 10)

// Repete um EXPLAIN read-only (sem efeito colateral) `n` vezes e devolve a
// MEDIANA de execution/planning — reduz ruído de conexão fria/cache do plano
// — mantendo shared_hit/read/plano_resumo da ÚLTIMA execução (estado estável).
async function explainRepetido(sql, n) {
  const amostras = []
  for (let i = 0; i < n; i++) amostras.push(await explain(sql))
  const ultima = amostras[amostras.length - 1]
  return {
    execution_ms: r1(mediana(amostras.map((a) => a.execution_ms))),
    planning_ms: r1(mediana(amostras.map((a) => a.planning_ms))),
    shared_hit: ultima.shared_hit,
    shared_read: ultima.shared_read,
    plano_resumo: ultima.plano_resumo,
  }
}

// ---------------------------------------------------------------------------
// 5. RNG determinístico (mesmo idioma de scripts/seed.ts: seedrandom para os
//    sorteios estruturais — quantidade, distribuição pelos pares — e
//    @faker-js/faker com seed fixo para o único campo "com cara de nome"
//    (`colaborador`, opcional, sem nenhuma regra de negócio presa a ele).
// ---------------------------------------------------------------------------
const RNG_SEED = 'medir-itens-f37-v1'
const FAKER_SEED = 20260828
faker.seed(FAKER_SEED)
const rng = seedrandom(RNG_SEED)
const randInt = (min, max) => min + Math.floor(rng() * (max - min + 1))
const chance = (p) => rng() < p

// `colaborador` é opcional e não entra em nenhuma regra de validação — mas a
// ordem (§C.2) pede dados fictícios via @faker-js/faker com seed fixo, e não
// só "dados neutros"; 30% das linhas levam um nome fictício (mesmo gerador de
// scripts/seed.ts), as demais ficam null. Aspas simples do nome são
// escapadas (`''`) antes de entrar no literal SQL — defesa de hábito, não
// porque o locale pt_BR do faker costume produzir apóstrofo.
function colaboradorFicticioOuNulo() {
  if (!chance(0.3)) return null
  return faker.person.fullName().replace(/'/g, "''")
}

// ---------------------------------------------------------------------------
// 6. Descoberta de contexto e preparação da piscina de pares (item × filial)
// ---------------------------------------------------------------------------

async function descobrirCriadoPor() {
  let linhas = await consultar(
    `select id from public.profiles where ativo = true and excluido_em is null order by created_at asc limit 1;`,
  )
  if (!linhas.length) {
    // FK só exige EXISTÊNCIA, não "ativo" — mas preferimos uma conta ativa;
    // se não houver (ensaio sem seed rodado?), qualquer perfil existente serve.
    linhas = await consultar(`select id from public.profiles order by created_at asc limit 1;`)
  }
  if (!linhas.length) {
    throw new Error(
      'Nenhum profile encontrado no ensaio — rode `npm run db:seed` lá antes (o harness precisa de um criado_por válido).',
    )
  }
  return assertUuid(linhas[0].id, 'profiles.id (criado_por)')
}

async function descobrirFiliais() {
  const linhas = await consultar(`select id from public.filiais where ativo = true order by id;`)
  if (!linhas.length) throw new Error('Nenhuma filial ativa encontrada no ensaio.')
  return linhas.map((l) => Number(l.id))
}

// Contagem das linhas MARCADAS (por este script, em QUALQUER execução
// anterior) — é o "antes"/"depois" da limpeza (§C.2 da ordem). Nunca conta a
// tabela inteira: um ensaio pode ter outras linhas legítimas (seed do F1 etc.)
// que este script não deve tocar nem contar como se fossem dele.
async function contarMarcadas() {
  const [lanc] = await consultar(
    `select count(*)::bigint as n from public.lancamentos_item where observacao like '${MARCADOR}%';`,
  )
  const [itens] = await consultar(
    `select count(*)::bigint as n from public.itens where nome like '${MARCADOR}%';`,
  )
  return { lancamentos_item: Number(lanc.n), itens: Number(itens.n) }
}

// Cria o catálogo fictício de itens deste harness — nomes ÚNICOS (índice
// único case-insensitive em itens_nome_uidx), todos com o marcador no nome,
// para a limpeza achar de volta. `grupo` é irrelevante para a medição (afeta
// só agrupamento/ordem de exibição); 'acessorio' para todos, por simplicidade.
async function criarItensFicticios(quantidade) {
  const ids = []
  for (let inicio = 0; inicio < quantidade; inicio += LOTE) {
    const fim = Math.min(inicio + LOTE, quantidade)
    const linhas = []
    for (let i = inicio; i < fim; i++) {
      const nome = `${MARCADOR} item ${String(i + 1).padStart(6, '0')}`
      linhas.push(`('${nome}', 'acessorio', ${i})`)
    }
    const sql = `insert into public.itens (nome, grupo, ordem) values ${linhas.join(', ')} returning id;`
    const inseridos = await consultar(sql)
    for (const r of inseridos) ids.push(Number(r.id))
  }
  return ids
}

// Monta a piscina de pares (item_id, filial_id): produto cartesiano dos itens
// fictícios × filiais reais do ensaio. `pares[0]` é o PAR QUENTE (ver
// cabeçalho e FRACAO_QUENTE) — primeiro item fictício × primeira filial.
function montarPares(itemIds, filialIds) {
  const pares = []
  for (const itemId of itemIds) for (const filialId of filialIds) pares.push({ itemId, filialId })
  return pares
}

// ---------------------------------------------------------------------------
// 7. População — cumulativa entre patamares (popular até 10 mil, medir,
//    popular o INCREMENTO até 100 mil, medir, até 500 mil, medir). Só
//    'entrada' — ver justificativa no cabeçalho de cada seção abaixo.
// ---------------------------------------------------------------------------
// Por que só 'entrada': o custo que este harness mede é o da AGREGAÇÃO do
// trigger (soma o diário do par a cada insert), que é o MESMO custo não
// importa a mistura de tipos. 'entrada' sozinha (i) nunca deixa o saldo
// negativo — dispensa simular saldo corrente por par em JS, como o
// scripts/seed.ts precisa fazer para os 7 tipos de movimentação —, e (ii)
// nunca aciona o guard de reserva/liberação. Menos código, zero risco de um
// INSERT em lote abortar no meio por uma combinação inválida. `quantidade` é
// só um inteiro pequeno sorteado (1..50); não representa nada de negócio.

async function popularIncremento(pares, alvoTotal, jaInserido, criadoPor) {
  const faltam = alvoTotal - jaInserido
  if (faltam <= 0) return 0

  const nQuente = Math.round(faltam * FRACAO_QUENTE)
  let restante = faltam
  let cursorPar = 0
  let inseridos = 0

  while (restante > 0) {
    const tamanho = Math.min(LOTE, restante)
    const linhas = []
    for (let i = 0; i < tamanho; i++) {
      // As primeiras `nQuente` linhas deste incremento vão para o par quente
      // (pares[0]); o resto roda round-robin pela piscina inteira (que
      // INCLUI o próprio par quente — ele fica ainda mais quente, de
      // propósito: é o par "que já tem muitas linhas" da medida 3).
      const usaQuente = inseridos < nQuente
      const par = usaQuente ? pares[0] : pares[cursorPar++ % pares.length]
      const quantidade = randInt(1, 50)
      const colaborador = colaboradorFicticioOuNulo()
      const colaboradorSql = colaborador === null ? 'null' : `'${colaborador}'`
      linhas.push(
        `(${par.itemId}, ${par.filialId}, 'entrada', ${quantidade}, current_date, ${colaboradorSql}, '${MARCADOR} ensaio automatizado (scripts/perf/medir-itens.mjs)', '${criadoPor}'::uuid)`,
      )
      inseridos++
    }
    const sql =
      `insert into public.lancamentos_item ` +
      `(item_id, filial_id, tipo, quantidade, data, colaborador, observacao, criado_por) ` +
      `values ${linhas.join(', ')};`
    await consultar(sql)
    restante -= tamanho
  }
  return inseridos
}

// ---------------------------------------------------------------------------
// 8. Medições — as quatro pedidas pela ordem, para o patamar corrente.
// ---------------------------------------------------------------------------

async function medirPatamar(pares, filialIds, totalAtual, criadoPor) {
  const medidas = []
  const parQuente = pares[0]
  const umaFilial = filialIds[0]

  medidas.push({
    nome: 'rel_saldo_itens (consolidado)',
    sql_rotulo: 'select * from rel_saldo_itens(null::smallint, current_date)',
    ...(await explainRepetido(
      `select * from public.rel_saldo_itens(null::smallint, current_date);`,
      REPETICOES_LEITURA,
    )),
  })

  medidas.push({
    nome: 'rel_saldo_itens (uma filial)',
    sql_rotulo: `select * from rel_saldo_itens(${umaFilial}::smallint, current_date)`,
    ...(await explainRepetido(
      `select * from public.rel_saldo_itens(${umaFilial}::smallint, current_date);`,
      REPETICOES_LEITURA,
    )),
  })

  medidas.push({
    nome: 'rel_mov_itens (consolidado, 30 dias)',
    sql_rotulo: "select * from rel_mov_itens(null::smallint, current_date - 30, current_date)",
    ...(await explainRepetido(
      `select * from public.rel_mov_itens(null::smallint, (current_date - 30)::date, current_date);`,
      REPETICOES_LEITURA,
    )),
  })

  // Medida 3 — custo por INSERT do trigger, no par que já tem muitas linhas.
  // Cada repetição insere UMA linha de verdade no par quente (ele cresce um
  // pouco a cada chamada — efeito desprezível sobre a mediana e, de resto,
  // mais fiel: é o mesmo padrão de "uma pessoa lançando um item por vez").
  const amostrasInsert = []
  for (let i = 0; i < REPETICOES_INSERT; i++) {
    const r = await explain(
      `insert into public.lancamentos_item (item_id, filial_id, tipo, quantidade, data, observacao, criado_por) ` +
        `values (${parQuente.itemId}, ${parQuente.filialId}, 'entrada', 1, current_date, ` +
        `'${MARCADOR} medida individual do trigger (scripts/perf/medir-itens.mjs)', '${criadoPor}'::uuid);`,
    )
    amostrasInsert.push(r)
  }
  const ultimaInsert = amostrasInsert[amostrasInsert.length - 1]
  medidas.push({
    nome: `trigger valida_lancamento_item (custo por INSERT no par quente, N=${REPETICOES_INSERT} inserts individuais)`,
    sql_rotulo: 'insert into lancamentos_item (...) values (par quente, entrada, 1)',
    execution_ms: r1(mediana(amostrasInsert.map((a) => a.execution_ms))),
    planning_ms: r1(mediana(amostrasInsert.map((a) => a.planning_ms))),
    shared_hit: ultimaInsert.shared_hit,
    shared_read: ultimaInsert.shared_read,
    plano_resumo: ultimaInsert.plano_resumo,
  })
  // Os inserts da medida 3 SOMAM ao total do par quente — refletido no
  // próximo incremento de população (jaInserido é reconciliado no chamador).

  // Medida 4 — histórico paginado (mesmo shape de src/lib/queries/itens.ts,
  // LANC_SELECT + queryHistorico): offset raso (primeira página) e offset
  // profundo (a última página da tabela inteira — o pior caso de OFFSET).
  const offsetProfundo = Math.max(0, totalAtual - 20)
  const historicoSql = (offset) =>
    `select l.id, l.data, l.tipo, l.quantidade, l.chamado, l.colaborador, l.observacao, l.estorna_id, l.created_at, ` +
    `i.nome as item_nome, i.grupo as item_grupo, f.nome as filial_nome, p.nome as autor_nome ` +
    `from public.lancamentos_item l ` +
    `join public.itens i on i.id = l.item_id ` +
    `join public.filiais f on f.id = l.filial_id ` +
    `join public.profiles p on p.id = l.criado_por ` +
    `order by l.data desc, l.created_at desc, l.id desc ` +
    `limit 20 offset ${offset};`

  medidas.push({
    nome: 'histórico paginado (offset 0 — primeira página)',
    sql_rotulo: 'select ... join itens/filiais/profiles ... order by data desc, created_at desc limit 20 offset 0',
    ...(await explainRepetido(historicoSql(0), REPETICOES_LEITURA)),
  })
  medidas.push({
    nome: `histórico paginado (offset profundo = ${offsetProfundo} — última página)`,
    sql_rotulo: `select ... limit 20 offset ${offsetProfundo}`,
    ...(await explainRepetido(historicoSql(offsetProfundo), REPETICOES_LEITURA)),
  })

  return { medidas, insertsExtras: REPETICOES_INSERT }
}

// ---------------------------------------------------------------------------
// 9. Limpeza — obrigatória, inclusive em erro. Abre a janela
//    `estoque.dev_destrutivo` SÓ para esta transação (ver "A GUARDA DE DELETE"
//    no cabeçalho), religa o trigger de validação se ele foi desligado, e
//    conta ANTES/DEPOIS.
// ---------------------------------------------------------------------------

async function limpar(triggerFoiDesligado) {
  // Religar o trigger é feito ANTES do delete, num statement próprio: se o
  // delete falhar no meio, ainda assim não queremos deixar o banco com a
  // validação de saldo desligada por mais tempo que o estritamente
  // necessário — o próprio finally do chamador tenta este religamento de
  // novo (idempotente: `enable trigger` num trigger já ligado não erra).
  if (triggerFoiDesligado) {
    await consultar(
      `alter table public.lancamentos_item enable trigger ${NOME_TRIGGER_VALIDACAO};`,
    )
  }

  // A janela abre e fecha DENTRO desta única transação (is_local=true fecha
  // sozinha no commit) — nunca vaza para fora deste bloco. Ver o aviso longo
  // no cabeçalho do arquivo sobre por que isto é seguro e necessário.
  await consultar(
    `begin;\n` +
      `select set_config('estoque.dev_destrutivo', 'on', true);\n` +
      `delete from public.lancamentos_item where observacao like '${MARCADOR}%';\n` +
      `delete from public.itens where nome like '${MARCADOR}%';\n` +
      `commit;`,
  )
}

// ---------------------------------------------------------------------------
// 10. Orquestração
// ---------------------------------------------------------------------------

async function main() {
  log('---------------------------------------------------------------')
  log(`Harness de performance dos itens · F37 · rótulo "${ROTULO}"`)
  log(`Alvo: ensaio (ref mascarado) · Management API`)
  log(`Patamares: ${PATAMARES.join(', ')} lançamentos (cumulativo)`)
  log(
    `Trigger de validação durante a população: ${DESLIGAR_TRIGGER_POPULACAO ? 'DESLIGADO (custo real não medido na população)' : 'ligado (custo real)'}`,
  )
  log('---------------------------------------------------------------')

  const inicio = new Date().toISOString()
  const antes = await contarMarcadas()
  if (antes.lancamentos_item > 0 || antes.itens > 0) {
    log('')
    log(
      `ATENÇÃO — este ensaio já tinha linhas marcadas ${MARCADOR} ANTES desta execução ` +
        `(lancamentos_item: ${antes.lancamentos_item}, itens: ${antes.itens}) — provável limpeza ` +
        `anterior que falhou. Esta execução vai limpar TUDO que estiver marcado, incluindo o que sobrou.`,
    )
  }
  log(`Contagem ANTES (linhas marcadas ${MARCADOR}): lancamentos_item=${antes.lancamentos_item}, itens=${antes.itens}`)

  let triggerFoiDesligado = false
  const resultadoPatamares = []
  let erroFatal = null
  let paresCount = 0

  try {
    log('')
    log('Descobrindo contexto do ensaio (filiais, criado_por)...')
    const criadoPor = await descobrirCriadoPor()
    const filialIds = await descobrirFiliais()
    log(`  filiais ativas encontradas: ${filialIds.length}`)

    log(`Criando ${ITENS_FICTICIOS} itens fictícios (marcador ${MARCADOR})...`)
    const itemIds = await criarItensFicticios(ITENS_FICTICIOS)
    const pares = montarPares(itemIds, filialIds)
    paresCount = pares.length
    log(`  pares (item × filial) disponíveis: ${pares.length} (par quente = pares[0])`)

    if (DESLIGAR_TRIGGER_POPULACAO) {
      log(`Desligando ${NOME_TRIGGER_VALIDACAO} para a população (opt-in, religa no finally)...`)
      await consultar(`alter table public.lancamentos_item disable trigger ${NOME_TRIGGER_VALIDACAO};`)
      triggerFoiDesligado = true
    }

    let totalAtual = 0
    for (const alvo of PATAMARES) {
      log('')
      log(`Patamar ${alvo}: populando incremento de ${alvo - totalAtual} linha(s)...`)
      const t0 = performance.now()
      const inseridos = await popularIncremento(pares, alvo, totalAtual, criadoPor)
      const populacao_ms = performance.now() - t0
      totalAtual += inseridos
      log(`  incremento concluído em ${r1(populacao_ms)} ms (total agora: ${totalAtual})`)

      log(`  medindo (EXPLAIN ANALYZE)...`)
      const { medidas, insertsExtras } = await medirPatamar(pares, filialIds, totalAtual, criadoPor)
      // Os N inserts da medida 3 também gravaram linhas de verdade no par
      // quente — reconciliamos o total para o próximo incremento não
      // "reinserir" essas linhas nem subestimar o total real do banco.
      totalAtual += insertsExtras

      resultadoPatamares.push({ linhas: alvo, populacao_ms: r1(populacao_ms), medidas })
      log(`  patamar ${alvo}: ${medidas.length} medida(s) registrada(s).`)
    }
  } catch (erro) {
    erroFatal = descreverErro(erro)
    log('')
    log(`ERRO durante população/medição: ${erroFatal}`)
    log('Prosseguindo para a limpeza mesmo assim (try/finally) — §C.2 da ordem.')
  } finally {
    log('')
    log('Limpando o ensaio (obrigatório, inclusive em erro)...')
    try {
      await limpar(triggerFoiDesligado)
    } catch (erroLimpeza) {
      // Se a limpeza em si falhar, isso é gritado mais abaixo (depois !== 0),
      // mas também aqui, imediatamente — é a pendência número um do relatório.
      log('')
      log(`ATENÇÃO GRAVE — a LIMPEZA falhou: ${descreverErro(erroLimpeza)}`)
      erroFatal = erroFatal ? `${erroFatal}; limpeza também falhou: ${descreverErro(erroLimpeza)}` : descreverErro(erroLimpeza)
    }
  }

  const fim = new Date().toISOString()
  const depois = await contarMarcadas().catch((erro) => {
    log(`ATENÇÃO — não foi possível contar DEPOIS da limpeza: ${descreverErro(erro)}`)
    return { lancamentos_item: -1, itens: -1 }
  })
  log(`Contagem DEPOIS (linhas marcadas ${MARCADOR}): lancamentos_item=${depois.lancamentos_item}, itens=${depois.itens}`)

  const ensaioFicouSujo = depois.lancamentos_item !== 0 || depois.itens !== 0
  if (ensaioFicouSujo) {
    log('')
    log(
      'ATENÇÃO GRAVE — O ENSAIO FICOU SUJO. A limpeza não removeu tudo que este script marcou. ' +
        'Investigue e remova manualmente antes de rodar qualquer outro rehearsal aqui — ' +
        'ver "A GUARDA DE DELETE" no cabeçalho deste arquivo (a janela estoque.dev_destrutivo ' +
        'pode não ter sido aberta com sucesso, ou o DELETE falhou por outro motivo).',
    )
  }

  // pares = itens fictícios × filiais descobertas (0 se falhou antes de
  // montar a piscina); linhas_por_par = média no MAIOR patamar realmente
  // alcançado (não o alvo declarado, que pode não ter sido atingido — §C.3).
  const maiorPatamarAlcancado = resultadoPatamares.length
    ? resultadoPatamares[resultadoPatamares.length - 1].linhas
    : 0
  const linhasPorParMedia = paresCount > 0 ? r1(maiorPatamarAlcancado / paresCount) : null

  const relatorio = {
    rotulo: ROTULO,
    alvo: 'ensaio', // nunca o ref real — ver seção 3
    node: process.version,
    inicio,
    fim,
    metodo: {
      patamares: PATAMARES,
      pares: paresCount,
      itens_ficticios: ITENS_FICTICIOS,
      linhas_por_par: linhasPorParMedia,
      repeticoes: { leitura: REPETICOES_LEITURA, insert_par_quente: REPETICOES_INSERT },
      populacao: DESLIGAR_TRIGGER_POPULACAO
        ? `trigger ${NOME_TRIGGER_VALIDACAO} DESLIGADO durante a população (alter table ... disable trigger), religado ao final — custo real do trigger NÃO refletido no tempo de população, só nas medidas 3 explícitas.`
        : `trigger ${NOME_TRIGGER_VALIDACAO} ligado (custo real medido no tempo de população)`,
      limpeza: ensaioFicouSujo
        ? 'FALHOU — ver contagens antes/depois e o aviso acima'
        : 'ok — contagem marcada voltou a 0 nas duas tabelas',
    },
    patamares: resultadoPatamares,
    contagens: { antes, depois },
    erro: erroFatal,
  }

  log('')
  log('---------------------------------------------------------------')
  log(`Patamares medidos: ${resultadoPatamares.map((p) => p.linhas).join(', ') || '(nenhum — falhou antes do primeiro)'}`)
  log(`Ensaio limpo: ${ensaioFicouSujo ? 'NÃO — ver acima' : 'sim'}`)
  log('---------------------------------------------------------------')

  const destino = SAIDA ? resolve(RAIZ, SAIDA) : join(RAIZ, 'docs', 'perf', `${ROTULO}.json`)
  mkdirSync(dirname(destino), { recursive: true })
  writeFileSync(destino, JSON.stringify(relatorio, null, 2) + '\n', 'utf8')
  log(`JSON gravado em ${destino.replace(RAIZ, '.')}`)

  if (erroFatal || ensaioFicouSujo) process.exitCode = 1
}

main().catch((erro) => {
  console.error(`ERRO FATAL: ${descreverErro(erro)}`)
  process.exitCode = 1
})
