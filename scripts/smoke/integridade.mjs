#!/usr/bin/env node
// ---------------------------------------------------------------------------
// A SONDA DE INTEGRIDADE AGENDADA (F55 · Frente D)
// ---------------------------------------------------------------------------
// Abre sessão com a conta de cargo `consulta`, lê `checagens_integridade_resumo()`
// e compara com a linha de base versionada. É a "Parte B" do smoke AGENDADO.
//
//   node scripts/smoke/integridade.mjs --alvo=producao
//   node scripts/smoke/integridade.mjs --alvo=ensaio --saida=veredito.json
//
// POR QUE ELE É UM ARQUIVO NOVO, E NÃO UM MODO DO `smoke-prod.mjs`
// ----------------------------------------------------------------
//  1. **ZERO DEPENDÊNCIA.** Só `fetch` global. O `smoke-prod.mjs` importa
//     `@supabase/supabase-js` e por isso exige `npm ci`; aqui não há nada a
//     instalar. Isso importa por dois motivos medidos: minuto de Actions em
//     repositório privado custa (o CI já consome ~2.800–3.200 min/mês, e a cota
//     é 2.000 ou 3.000), e uma queda do registro do npm viraria ALARME FALSO —
//     a sonda ficaria vermelha por um motivo que não é o sistema.
//  2. **A CONTA É `consulta`.** A Parte C do `smoke-prod.mjs` supõe conta ADMIN:
//     seis dos checks dela viram AVISO com o texto *"sessão não aceita"*, que
//     MENTE sobre a causa (a sessão foi aceita; o que faltou foi cargo). A Parte
//     C continua sendo o ritual local, com a conta admin.
//
// COMO ELE FICA PRONTO PARA A F73 (o canário de isolamento)
// ---------------------------------------------------------
// `abrirSessao(cfg)` recebe credencial e devolve um token; as afirmações rodam
// POR SESSÃO, numa lista. A F73 acrescenta uma segunda sessão (o segundo tenant)
// e uma afirmação de isolamento — sem reescrever este arquivo.
//
// REGRAS QUE ESTE ARQUIVO NÃO QUEBRA (CLAUDE.md)
//  · Nenhum segredo aqui dentro: tudo vem de variável de ambiente, e NADA de
//    credencial é impresso — nem em erro, nem em stack.
//  · Nenhum conteúdo de linha do banco sai: o resumo devolve `(chave, total)` e
//    é só isso que se imprime. Amostra não passa por aqui porque não existe na
//    função (`0138`).
//  · **FALTA DE CREDENCIAL É FALHA.** Isto é o agendado: verde por omissão é
//    pior que vermelho, porque ensina a confiar num alarme que não olhou nada.
//
// A DERIVA DE MIGRATIONS (reauditoria 18/09/2026, item AE · passo 2). Depois do
// resumo de integridade, a MESMA sessão da conta `consulta` lê o ledger inteiro
// (`public.ledger_de_migracoes()`, migration `0148`) e compara com os arquivos de
// `supabase/migrations/` pelo contrato com base fixa — a lógica pura mora em
// `deriva-migrations.mjs`. Uma falha da PRÓPRIA sonda (a RPC não responde, a
// pasta de migrations não está no checkout) é ACHADO, vermelho: a sonda que não
// olhou não pode passar por verde. Para decidir SE um arquivo pendente já passou
// da tolerância, a sonda precisa saber QUANDO ele entrou na `main`. Duas fontes,
// nesta ordem:
//   1. a API REST do GitHub (`GET /repos/.../commits?path=...`) — o caminho da
//      Action: sem clone profundo (`fetch-depth: 0` baixaria o HISTÓRICO INTEIRO
//      do repositório a cada execução — e `docs/DIVIDA-TECNICA.md` item AK já
//      registra 62 MB de evidência binária nesse histórico, crescendo a cada fase
//      visual; o custo se pagaria a cada execução), sem token novo (o
//      `GITHUB_TOKEN` do job, `contents: read`, já é suficiente para a API de
//      commits num repositório privado) e no mesmo idioma "só fetch" deste
//      arquivo;
//   2. `git log` local — só quando não há `GITHUB_TOKEN`/`GITHUB_REPOSITORY` no
//      ambiente (rodando na mesa, fora da Action). Um checkout local comum já tem
//      o histórico; não existe custo de Actions a evitar aqui. ⚠ Num checkout
//      RASO (o `actions/checkout` padrão é `fetch-depth: 1`) o `git log` mente:
//      o commit enxertado "adiciona" todos os arquivos, e toda migration pareceria
//      ter entrado AGORA — a deriva velha passaria por pendência recente. Raso →
//      sem data (aviso), nunca data falsa.
// Arquivo sem data por NENHUMA das duas vira AVISO em `avaliarDerivaMigrations`
// ("data desconhecida"), nunca alarme por omissão — a sonda não acusa deriva que
// não sabe medir. ⚠ As duas fontes dão a data do COMMIT que acrescentou o arquivo,
// que é anterior ou igual ao merge na `main`: a idade medida nunca é MENOR que a
// real, então o erro possível é alarmar cedo, nunca calar (ver
// `dataDeEntradaDaRespostaDaApi`).
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process'
import { readFileSync, appendFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  avaliarIntegridade,
  filtrarPorReleitura,
  impressaoDoEstado,
  tabelaDoResumo,
} from './alarme.mjs'
import {
  arquivosPendentes,
  avaliarDerivaMigrations,
  dataDeEntradaDaRespostaDaApi,
  dataDeEntradaDoGitLog,
} from './deriva-migrations.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ_DO_REPO = join(AQUI, '..', '..')
const PASTA_MIGRATIONS = join(RAIZ_DO_REPO, 'supabase', 'migrations')
const TIMEOUT_MS = 20_000
const TOLERANCIA_DERIVA_HORAS = 24
const POR_PAGINA_DA_API = 100

const argv = process.argv.slice(2)
const arg = (nome, padrao) => {
  const p = argv.find((a) => a.startsWith(`--${nome}=`))
  return p ? p.slice(nome.length + 3) : padrao
}

const alvo = arg('alvo', process.env.SMOKE_ALVO || '')
const saida = arg('saida', '')

const log = (...a) => process.stdout.write(a.join(' ') + '\n')

// ---------------------------------------------------------------------------
// Máscara — o mesmo contrato do `smoke-prod.mjs`: nenhum segredo sai, venha de
// onde vier (inclusive de dentro de um erro do fetch).
// ---------------------------------------------------------------------------
const SEGREDOS = []
function mascarar(texto) {
  let t = typeof texto === 'string' ? texto : String(texto ?? '')
  for (const s of SEGREDOS) if (s && s.length >= 4) t = t.split(s).join('***')
  return t
}
function descreverErro(erro) {
  if (!erro) return 'erro desconhecido'
  if (erro instanceof Error) return mascarar(erro.message || erro.name)
  // Erro do PostgREST: CÓDIGO e MENSAGEM, nunca `details` — ele carrega valor de
  // linha (o precedente escrito de `smoke-prod.mjs:120-128`).
  const codigo = erro.code ? `[${erro.code}] ` : ''
  return mascarar(`${codigo}${erro.message ?? JSON.stringify(erro)}`)
}

// ---------------------------------------------------------------------------
// Sessão e leitura — só `fetch`
// ---------------------------------------------------------------------------

/** Abre sessão por senha e devolve o access token. Nunca imprime a credencial. */
async function abrirSessao({ url, chave, email, senha }) {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: chave, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const corpo = await r.json().catch(() => null)
  if (!r.ok || !corpo?.access_token) {
    throw new Error(
      `login recusado (HTTP ${r.status}): ${descreverErro(corpo?.error_description ?? corpo?.msg ?? corpo)}`,
    )
  }
  return corpo.access_token
}

async function encerrarSessao({ url, chave, token }) {
  try {
    await fetch(`${url}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: chave, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    // Encerrar a sessão é higiene, não é o veredito: uma falha aqui não muda o
    // resultado da sonda, e engolir é a resposta certa.
  }
}

async function chamarRpc({ url, chave, token, nome }) {
  const r = await fetch(`${url}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: {
      apikey: chave,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: '{}',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`RPC ${nome} (HTTP ${r.status}): ${descreverErro(corpo)}`)
  return corpo
}

async function lerTabela({ url, chave, token, recurso }) {
  const r = await fetch(`${url}/rest/v1/${recurso}`, {
    headers: { apikey: chave, authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const corpo = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`leitura ${recurso} (HTTP ${r.status}): ${descreverErro(corpo)}`)
  return corpo
}

/** `[{chave, total}]` → `{chave: número}`. `total` vem de um `bigint`. */
function totaisDoResumo(linhas) {
  const totais = {}
  for (const l of linhas ?? []) {
    if (!l || typeof l.chave !== 'string') continue
    const n = Number(l.total)
    totais[l.chave] = Number.isFinite(n) ? n : null
  }
  return totais
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// A deriva de migrations — I/O (a lógica pura mora em deriva-migrations.mjs)
// ---------------------------------------------------------------------------

/** Os arquivos de `supabase/migrations/`, como `deriva-migrations.mjs` espera. */
function listarArquivosDeMigration() {
  try {
    return readdirSync(PASTA_MIGRATIONS).filter((f) => f.endsWith('.sql'))
  } catch {
    return []
  }
}

/**
 * A data em que cada arquivo PENDENTE entrou na `main`, pela API do GitHub.
 * Ver o cabeçalho do arquivo para o porquê (evita `fetch-depth: 0`).
 *
 * Uma falha por arquivo (rede, 404, repositório sem histórico bastante) não
 * derruba a sonda: o arquivo fica sem data, e `avaliarDerivaMigrations` o
 * relata como AVISO ("data desconhecida"), nunca alarme por omissão.
 */
async function dataDeEntradaPelaApiDoGithub({ arquivos, repositorio, token }) {
  const [dono, nome] = (repositorio || '').split('/')
  const resultado = {}
  if (!dono || !nome) return resultado

  for (const arquivo of arquivos) {
    const caminho = `supabase/migrations/${arquivo}`
    try {
      const url =
        `https://api.github.com/repos/${dono}/${nome}/commits` +
        `?path=${encodeURIComponent(caminho)}&per_page=${POR_PAGINA_DA_API}`
      const r = await fetch(url, {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!r.ok) continue
      const commits = await r.json().catch(() => null)
      // A interpretação (o último da página é o mais antigo; página CHEIA → sem data, porque
      // o commit de adição pode estar na seguinte) mora em deriva-migrations.mjs, com teste.
      const data = dataDeEntradaDaRespostaDaApi(commits, POR_PAGINA_DA_API)
      if (data) resultado[arquivo] = data
    } catch {
      // rede/timeout: este arquivo fica sem data — vira aviso, não interrompe a sonda.
    }
  }
  return resultado
}

/** O mesmo, por `git log` local — só usado quando não há credencial de API (fora da Action).
 * Checkout RASO devolve vazio: ali o `git log` daria a data do commit enxertado para todo
 * arquivo, e a deriva velha passaria por pendência recente (ver o cabeçalho). */
function dataDeEntradaPeloGitLocal(arquivos) {
  const resultado = {}
  let raso = true // na dúvida (git ausente, erro), trata como raso: sem data, nunca data falsa
  try {
    raso =
      execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
        cwd: RAIZ_DO_REPO,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() !== 'false'
  } catch {
    return resultado
  }
  if (raso) return resultado
  for (const arquivo of arquivos) {
    try {
      const saida = execFileSync(
        'git',
        ['log', '--diff-filter=A', '--format=%cI', '--', `supabase/migrations/${arquivo}`],
        { cwd: RAIZ_DO_REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      )
      const data = dataDeEntradaDoGitLog(saida, raso)
      if (data) resultado[arquivo] = data
    } catch {
      // sem repositório git local, ou arquivo sem histórico de "adição" — sem data.
    }
  }
  return resultado
}

/** A checagem de deriva inteira: lista os arquivos, lê o ledger, resolve as datas de
 * entrada dos PENDENTES e devolve achados/avisos no MESMO formato dos doze. Lança se
 * não conseguir olhar — quem chama transforma isso em ACHADO. */
async function checarDerivaDeMigrations({ url, chave, token }) {
  const arquivos = listarArquivosDeMigration()
  if (arquivos.length === 0) {
    throw new Error('não achei arquivo nenhum em supabase/migrations/ — o checkout está incompleto')
  }

  const ledger = await chamarRpc({ url, chave, token, nome: 'ledger_de_migracoes' })
  if (!Array.isArray(ledger)) {
    throw new Error('ledger_de_migracoes() não devolveu uma lista')
  }

  // Só busca data de quem está pendente — o MESMO cálculo do veredito, nunca um filtro
  // paralelo (o anterior, "nome fora da ponta", mandava o histórico inteiro para a API).
  const pendentes = arquivosPendentes({ arquivosRepo: arquivos, ledger })

  const repositorio = process.env.GITHUB_REPOSITORY || ''
  const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
  const dataDeEntrada = pendentes.length === 0
    ? {}
    : repositorio && githubToken
      ? await dataDeEntradaPelaApiDoGithub({ arquivos: pendentes, repositorio, token: githubToken })
      : dataDeEntradaPeloGitLocal(pendentes)

  return avaliarDerivaMigrations({
    arquivosRepo: arquivos,
    ledger,
    agora: new Date(),
    dataDeEntrada,
    toleranciaHoras: TOLERANCIA_DERIVA_HORAS,
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const politica = JSON.parse(readFileSync(join(AQUI, 'linha-de-base.json'), 'utf8'))

  const problemas = []
  if (!alvo) problemas.push('--alvo=producao|ensaio não informado')
  else if (!politica.alvos[alvo]) problemas.push(`alvo desconhecido: ${alvo}`)

  // ⚠ A CREDENCIAL É POR ALVO, e a resolução é EXPLÍCITA de propósito.
  // O caminho tentador seria uma expressão do YAML —
  // `inputs.alvo == 'ensaio' && secrets.X_ENSAIO || secrets.X_PRODUCAO` — e ela
  // tem um modo de falha silencioso e grave: se o secret do ENSAIO não estiver
  // cadastrado, a expressão CAI NO DE PRODUÇÃO, e um disparo que pedia ensaio
  // sonda produção sem avisar ninguém. Aqui o nome é montado a partir do alvo, e
  // ausência é ausência.
  // `SMOKE_*` sem sufixo continua valendo, e é o caminho LOCAL — uma máquina,
  // um alvo por vez.
  const sufixo = alvo ? `_${alvo.toUpperCase()}` : ''
  const doAlvo = (nome) => process.env[`${nome}${sufixo}`] || process.env[nome] || ''
  const cfg = {
    url: doAlvo('SMOKE_SUPABASE_URL').replace(/\/+$/, ''),
    chave: doAlvo('SMOKE_SUPABASE_ANON_KEY'),
    email: doAlvo('SMOKE_EMAIL'),
    senha: doAlvo('SMOKE_SENHA'),
  }
  SEGREDOS.push(cfg.chave, cfg.email, cfg.senha)

  // ⚠ FALHA, NUNCA "PULADA". No agendado, credencial ausente significa que a
  // sonda não olhou nada — e um verde nessas condições é a pior mentira que um
  // alarme pode contar.
  for (const [nome, v] of [
    ['SMOKE_SUPABASE_URL', cfg.url],
    ['SMOKE_SUPABASE_ANON_KEY', cfg.chave],
    ['SMOKE_EMAIL', cfg.email],
    ['SMOKE_SENHA', cfg.senha],
  ]) {
    if (!v) problemas.push(`${nome} ausente`)
  }

  if (problemas.length) {
    log('SONDA DE INTEGRIDADE — NÃO EXECUTADA')
    for (const p of problemas) log(`  · ${p}`)
    log('')
    log('  Isto é FALHA, não pendência: no agendado, a sonda que não olha nada')
    log('  não pode reportar verde.')
    return { ok: false, alvo, achados: [{ chave: '(credencial)', total: null, base: null, motivo: problemas.join('; ') }], podeDescer: [], resumoMd: '' }
  }

  const base = politica.alvos[alvo]
  log(`SONDA DE INTEGRIDADE · alvo=${alvo} · ${cfg.url}`)

  let token
  try {
    token = await abrirSessao(cfg)
    log('  [OK   ] sessão aberta com a conta de consulta (conta mascarada)')
  } catch (erro) {
    log(`  [FALHA] ${descreverErro(erro)}`)
    return {
      ok: false,
      alvo,
      achados: [{ chave: '(sessão)', total: null, base: null, motivo: descreverErro(erro) }],
      podeDescer: [],
      resumoMd: '',
    }
  }

  try {
    // (1) PROVA DE SESSÃO: um logado ativo lê o acervo. É o piso de leitura da
    //     0070/0073, e ele vale para o cargo `consulta` como para qualquer outro.
    //     Só a CONTAGEM de linhas sai daqui — nunca o conteúdo.
    for (const recurso of ['filiais?select=id&limit=1', 'ativos?select=id&limit=1']) {
      const linhas = await lerTabela({ ...cfg, token, recurso })
      const nome = recurso.split('?')[0]
      if (!Array.isArray(linhas) || linhas.length === 0) {
        log(`  [FALHA] leitura de ${nome} veio vazia — a sessão não está lendo o acervo`)
        return {
          ok: false,
          alvo,
          achados: [
            { chave: '(leitura)', total: null, base: null, motivo: `${nome} devolveu 0 linhas` },
          ],
          podeDescer: [],
          resumoMd: '',
        }
      }
      log(`  [OK   ] leitura de ${nome} com sessão (${linhas.length} linha)`)
    }

    // (2) O RESUMO DE INTEGRIDADE.
    const linhas = await chamarRpc({ ...cfg, token, nome: 'checagens_integridade_resumo' })
    const totais = totaisDoResumo(linhas)
    log(`  [OK   ] resumo de integridade: ${Object.keys(totais).length} chaves`)

    let { ok, achados, podeDescer } = avaliarIntegridade(totais, base)

    // (3) A RELEITURA DE CONFIRMAÇÃO. Só para as chaves com falso positivo
    //     transitório declarado — hoje, `backup_orfao`: um backup em voo aparece
    //     contado por alguns segundos (F54 §10). Um achado que some na segunda
    //     leitura era operação em andamento, não corrupção.
    const precisaReler = achados.some((a) => politica.chaves_com_releitura.includes(a.chave))
    if (precisaReler) {
      log(`  [ .. ] releitura de confirmação em ${politica.releitura_segundos}s…`)
      await esperar(politica.releitura_segundos * 1000)
      const linhas2 = await chamarRpc({ ...cfg, token, nome: 'checagens_integridade_resumo' })
      const segunda = avaliarIntegridade(totaisDoResumo(linhas2), base)
      const antes = achados.length
      achados = filtrarPorReleitura(achados, segunda.achados, politica.chaves_com_releitura)
      ok = achados.length === 0
      log(`  [OK   ] releitura: ${antes} → ${achados.length} achado(s)`)
    }

    for (const a of achados) log(`  [FALHA] ${a.chave}: ${a.motivo}`)
    for (const d of podeDescer) {
      log(`  [AVISO] ${d.chave}: hoje ${d.total}, base ${d.base} — a linha de base pode DESCER`)
    }
    if (ok) log('  todas as doze dentro da linha de base.')

    // (4) A DERIVA DE MIGRATIONS (item AE, passo 2 da reauditoria de 18/09/2026).
    // Roda na MESMA sessão da conta `consulta`, por cima do veredito das doze —
    // "fecha em falha" do mesmo jeito (achado = vermelho), mas é uma checagem À
    // PARTE: não é um total fixo contra `linha-de-base.json`, é uma comparação
    // DINÂMICA contra os arquivos de `supabase/migrations/` no disco. Se a PRÓPRIA
    // sonda não conseguir olhar (a RPC da 0148 não responde neste alvo, o checkout
    // veio sem migrations), isso é ACHADO: a 0148 foi aplicada nos dois bancos
    // ANTES deste código entrar na main, então não há janela de rollout a tolerar,
    // e a RPC sumida é justamente o tipo de deriva que esta checagem existe para
    // acusar. Só a DATA de um pendente pode faltar sem alarme (API do GitHub fora
    // do ar) — vira aviso por arquivo, em `avaliarDerivaMigrations`.
    let avisosDeDeriva = []
    try {
      const deriva = await checarDerivaDeMigrations({ ...cfg, token })
      if (deriva.achados.length) {
        achados = achados.concat(deriva.achados)
        ok = achados.length === 0
      }
      avisosDeDeriva = deriva.avisos
      for (const a of deriva.achados) log(`  [FALHA] ${a.chave}: ${a.motivo}`)
      for (const av of deriva.avisos) log(`  [AVISO] ${av.chave}: ${av.motivo}`)
      if (!deriva.achados.length) {
        log(
          `  [OK   ] deriva de migrations: ${deriva.pendentes.length} pendente(s)` +
            (deriva.ultimaNoLedger ? ` · a mais nova no ledger é ${deriva.ultimaNoLedger.arquivo}` : ''),
        )
      }
    } catch (erro) {
      const falha = {
        chave: 'deriva_migrations:sonda_falhou',
        total: null,
        base: null,
        motivo: `a checagem de deriva não conseguiu olhar: ${descreverErro(erro)}`,
      }
      achados = achados.concat([falha])
      ok = false
      log(`  [FALHA] ${falha.chave}: ${falha.motivo}`)
    }

    let resumoMd = tabelaDoResumo({ alvo, totais, base })
    const achadosDeDeriva = achados.filter((a) => a.chave.startsWith('deriva_migrations:'))
    if (achadosDeDeriva.length || avisosDeDeriva.length) {
      const linhasDeriva = ['', '### Deriva de migrations (repositório × ledger)', '']
      for (const a of achadosDeDeriva) linhasDeriva.push(`- ✗ \`${a.chave}\`: ${a.motivo}`)
      for (const av of avisosDeDeriva) linhasDeriva.push(`- aviso \`${av.chave}\`: ${av.motivo}`)
      resumoMd += '\n' + linhasDeriva.join('\n')
    }

    return {
      ok,
      alvo,
      achados,
      podeDescer,
      avisosDeDeriva,
      impressao: impressaoDoEstado(achados),
      resumoMd,
    }
  } catch (erro) {
    log(`  [FALHA] ${descreverErro(erro)}`)
    return {
      ok: false,
      alvo,
      achados: [{ chave: '(sonda)', total: null, base: null, motivo: descreverErro(erro) }],
      podeDescer: [],
      resumoMd: '',
    }
  } finally {
    await encerrarSessao({ ...cfg, token })
  }
}

const veredito = await main().catch((erro) => ({
  ok: false,
  alvo,
  achados: [{ chave: '(sonda)', total: null, base: null, motivo: descreverErro(erro) }],
  podeDescer: [],
  resumoMd: '',
}))

veredito.impressao = veredito.impressao ?? impressaoDoEstado(veredito.achados)
veredito.medidoEm = new Date().toISOString()

if (saida) writeFileSync(saida, JSON.stringify(veredito, null, 2), 'utf8')
if (process.env.GITHUB_STEP_SUMMARY && veredito.resumoMd) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${veredito.resumoMd}\n\n`, 'utf8')
}

log('')
log(veredito.ok ? 'VEREDITO: verde.' : `VEREDITO: VERMELHO (${veredito.achados.length} achado(s)).`)
process.exitCode = veredito.ok ? 0 : 1
