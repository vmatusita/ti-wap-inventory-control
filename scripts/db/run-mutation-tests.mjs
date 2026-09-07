#!/usr/bin/env node
// =============================================================================
// run-mutation-tests.mjs — o INJETOR DE MUTAÇÕES (F47, 06/09/2026)
// =============================================================================
// A pergunta que este script responde é a que 25 roteiros e 577 asserções nunca
// tinham respondido: **eles sabem ficar vermelhos?**
//
// Ele quebra o banco de propósito, uma quebra por vez, e exige que o roteiro
// correspondente acuse **o cenário NOMEADO** — nunca "deu ✗ em algum lugar".
// Detectada pelo cenário errado é ACHADO, não sucesso.
//
//     npm run db:test:mutations
//     DATABASE_URL=postgresql://… npm run db:test:mutations
//     npm run db:test:mutations -- --apenas rls-piso-de-leitura-aberto-em-ativos
//
// -----------------------------------------------------------------------------
// AS QUATRO DECISÕES DE DESENHO, E POR QUE CADA UMA
// -----------------------------------------------------------------------------
// 1. EXECUÇÃO DE CONTROLE PRIMEIRO. Sem mutação nenhuma, os roteiros do lote têm
//    de vir todos verdes. Se o controle não fecha, o injetor ABORTA ANTES DE
//    MUTAR: um roteiro já vermelho faria TODAS as mutações "serem detectadas", e
//    o relatório sairia triunfante medindo nada.
//
// 2. UM BANCO POR MUTAÇÃO. Todo roteiro é `begin; … rollback;` — a mutação tem de
//    sobreviver ao rollback, então ela é COMMITADA antes. `create database …
//    template <base>` é o caminho barato e SEM lógica de reversão para errar: o
//    banco inteiro é jogado fora depois. Reverter mutação à mão seria uma segunda
//    implementação, com os próprios defeitos, no caminho crítico da prova.
//
// 3. A MUTAÇÃO PEGOU, E ISSO É PROVADO. Aplicar com `ON_ERROR_STOP=1` e, quando o
//    catálogo declara `prova`, rodar a sonda e exigir o valor esperado. Uma
//    mutação que NÃO aplica deixa o roteiro verde e se disfarça de "não
//    detectada" — o diagnóstico mais valioso da fase, gasto num erro de sintaxe.
//    Os dois casos têm mensagens diferentes de propósito.
//
// 4. RÓTULO COMPARADO POR IGUALDADE DE TOKEN, NUNCA POR SUBSTRING. Os roteiros
//    estão cheios de rótulo que é prefixo de outro — `2c`/`2c-bis`/`2c-ter`,
//    `4e`/`4e-bis`/`4e-ter`, `12a`…`12e`, e em `dev_destrutivo.sql` o rótulo NU
//    `1` é prefixo de outros dezenove. Um `includes('✗ 2c')` acenderia para o
//    cenário errado e o injetor mentiria com convicção.
//
// -----------------------------------------------------------------------------
// ⚠ A INVERSÃO DE CÓDIGO DE SAÍDA — NÃO "CONSERTE" ISTO
// -----------------------------------------------------------------------------
// `scripts/db/rodar-roteiros.sh` sai **1** quando o roteiro fica vermelho. Para o
// CI isso é falha; para o INJETOR é SUCESSO — é a prova de que a asserção acordou.
// O injetor por isso não olha o código de saída do runner para decidir: ele lê a
// SAÍDA e procura os rótulos. O código de saída só ajuda a distinguir "roteiro
// vermelho" de "psql morreu", e nem para isso ele basta.
// =============================================================================

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { MUTACOES, QUARENTENA } from './mutacoes.mjs'
import { emitiuLinhaFim, rotulosCaidos } from './saida-roteiro.mjs'

/**
 * Diagnóstico vai TUDO para stdout — inclusive as linhas `::error::`.
 *
 * ⚠ Não é preferência de estilo. Misturar `console.log` e `console.error` num script de
 * CI produz um log EMBARALHADO: os dois fluxos são bufferizados de forma independente
 * quando a saída é um pipe, e o GitHub Actions os intercala na ordem em que chegam, não
 * na ordem em que foram escritos. Medido na F47 (run 34074976775): a mensagem
 * "O CONTROLE NÃO FECHOU VERDE" apareceu NO MEIO da listagem do controle, quinze linhas
 * antes do ✗ que a causou — o leitor precisa reconstruir a ordem para entender o
 * veredito, e uma ferramenta de diagnóstico com log fora de ordem é uma ferramenta em
 * que se confia menos.
 *
 * `::error::` funciona em stdout: os workflow commands do GitHub Actions são lidos dos
 * dois fluxos.
 */
function erro(msg) {
  console.log(msg)
}

const RAIZ = process.cwd()
const RUNNER = join('scripts', 'db', 'rodar-roteiros.sh')
const PASTA_ROTEIROS = join('supabase', 'tests')

const URL_PADRAO = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const URL_BASE = process.env.DATABASE_URL || URL_PADRAO

/** `--apenas a,b,c` roda só essas mutações (depuração; o CI nunca passa a flag). */
const ARGS = process.argv.slice(2)
const iApenas = ARGS.indexOf('--apenas')
const FILTRO =
  iApenas === -1 ? null : new Set((ARGS[iApenas + 1] ?? '').split(',').map((s) => s.trim()))

// ---------------------------------------------------------------------------
// psql
// ---------------------------------------------------------------------------

/** A mesma URL, apontando para outro banco. */
function urlDoBanco(nome) {
  const u = new URL(URL_BASE)
  u.pathname = `/${nome}`
  return u.toString()
}

/** O nome do banco na URL base — o banco que os roteiros medem. */
function nomeDoBancoBase() {
  const p = new URL(URL_BASE).pathname.replace(/^\//, '')
  if (!p) throw new Error(`DATABASE_URL sem nome de banco: ${URL_BASE}`)
  return p
}

/**
 * Roda SQL por psql. `url` decide o banco.
 * @returns {{ok: boolean, saida: string}}
 */
function psql(url, sql) {
  const args = ['-v', 'ON_ERROR_STOP=1', '-q', url, '-c', sql]
  const r = spawnSync('psql', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (r.error) return { ok: false, saida: `${saida}\n${r.error.message}` }
  return { ok: r.status === 0, saida }
}

/** Uma linha, uma coluna, como texto. */
function psqlValor(url, sql) {
  const r = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-tA', url, '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  if (r.error || r.status !== 0) {
    return { ok: false, valor: null, saida: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error?.message ?? ''}` }
  }
  return { ok: true, valor: (r.stdout ?? '').trim(), saida: r.stdout ?? '' }
}

// ---------------------------------------------------------------------------
// O runner dos roteiros
// ---------------------------------------------------------------------------

/**
 * Chama `scripts/db/rodar-roteiros.sh` — o MESMO arquivo que o CI e a mesa chamam.
 * Reusar é o ponto: reimplementar o parsing de roteiro criaria um segundo runner,
 * e a divergência entre os dois só apareceria no dia em que importasse.
 */
function rodarRoteiros(url, roteiros) {
  const r = spawnSync('bash', [RUNNER, ...roteiros], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: url },
    maxBuffer: 64 * 1024 * 1024,
  })
  return {
    codigo: r.status,
    saida: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    erro: r.error?.message ?? null,
  }
}

// A leitura da saída (`rotulosCaidos` / `emitiuLinhaFim`) mora em
// `scripts/db/saida-roteiro.mjs`: são funções PURAS, e é lá que elas são testadas
// sem banco. É a regra que, errada, faria o injetor mentir com convicção.

// ---------------------------------------------------------------------------
// O laço
// ---------------------------------------------------------------------------

const RESULTADO = {
  DETECTADA: 'detectada',
  NAO_DETECTADA: 'NÃO detectada',
  NAO_APLICOU: 'NÃO aplicou',
  ABORTOU: 'roteiro abortou',
}

function log(...a) {
  console.log(...a)
}

function main() {
  const lote = FILTRO ? MUTACOES.filter((m) => FILTRO.has(m.id)) : MUTACOES
  if (lote.length === 0) {
    erro('::error::nenhuma mutação selecionada — confira o `--apenas`')
    return 1
  }
  // ⚠ CORRESPONDÊNCIA PARCIAL TAMBÉM É ERRO. `--apenas a,b` com `b` digitado errado
  // devolve um lote de UM, a guarda acima não dispara, e o script termina dizendo
  // "lote inteiro detectado" — quem pediu duas mutações sai achando que conferiu duas.
  // Uma flag de depuração que mente é pior do que não existir.
  if (FILTRO) {
    const encontrados = new Set(lote.map((m) => m.id))
    const semDono = [...FILTRO].filter((id) => !encontrados.has(id))
    if (semDono.length > 0) {
      erro(`::error::o \`--apenas\` cita id que não existe no catálogo: ${semDono.join(', ')}`)
      return 1
    }
  }

  const bancoBase = nomeDoBancoBase()
  const roteirosDoLote = [...new Set(lote.map((m) => m.roteiro))].sort()

  log('='.repeat(78))
  log('INJETOR DE MUTAÇÕES (F47)')
  log('='.repeat(78))
  log(`banco base .......... ${bancoBase}`)
  log(`mutações ativas ..... ${lote.length}${FILTRO ? ' (filtradas)' : ''}`)
  log(`em quarentena ....... ${QUARENTENA.length} (declaradas, NÃO executadas)`)
  log(`roteiros do lote .... ${roteirosDoLote.join(', ')}`)
  log('')

  for (const r of roteirosDoLote) {
    if (!existsSync(join(RAIZ, PASTA_ROTEIROS, r))) {
      erro(`::error::o roteiro ${PASTA_ROTEIROS}/${r} não existe`)
      return 1
    }
  }

  // ---------------------------------------------------------------------------
  // 1. CONTROLE — sem isto, tudo o que vem depois é teatro
  // ---------------------------------------------------------------------------
  log('---- CONTROLE: os roteiros do lote, SEM mutação nenhuma ----')
  const caminhos = roteirosDoLote.map((r) => `${PASTA_ROTEIROS}/${r}`)
  const controle = rodarRoteiros(URL_BASE, caminhos)
  if (controle.erro) {
    erro(`::error::não consegui executar ${RUNNER}: ${controle.erro}`)
    return 1
  }
  if (controle.codigo !== 0) {
    log(controle.saida)
    erro('')
    erro('::error::O CONTROLE NÃO FECHOU VERDE — abortando ANTES de mutar.')
    erro(
      '::error::Um roteiro já vermelho faria TODAS as mutações "serem detectadas". ' +
        'Conserte o roteiro (ou o banco) e rode de novo; nada foi mutado.',
    )
    return 1
  }
  const caidosNoControle = rotulosCaidos(controle.saida)
  if (caidosNoControle.size > 0) {
    erro(
      `::error::o runner saiu 0 mas há ✗ na saída do controle (${[...caidosNoControle].join(', ')}) — ` +
        'o parser do injetor e o do runner discordam. Abortando.',
    )
    return 1
  }
  log(`controle verde: ${roteirosDoLote.length} roteiro(s), nenhum ✗.`)
  log('')

  // Um `create database … template X` exige que NINGUÉM esteja conectado a X. As
  // sessões do controle já morreram (psql é de vida curta), mas uma conexão
  // esquecida faria TODAS as mutações falharem com um erro que não é sobre elas.
  psql(URL_BASE, `select pg_terminate_backend(pid)
                    from pg_stat_activity
                   where datname = current_database() and pid <> pg_backend_pid()`)

  // ---------------------------------------------------------------------------
  // 2. AS MUTAÇÕES
  // ---------------------------------------------------------------------------
  const linhas = []
  let i = 0

  for (const m of lote) {
    i++
    const banco = `mut_${String(i).padStart(2, '0')}`
    const url = urlDoBanco(banco)
    const t0 = process.hrtime.bigint()
    let resultado = RESULTADO.DETECTADA
    let detalhe = ''

    log(`[${i}/${lote.length}] ${m.id}  →  ${m.roteiro}  (espera ✗ ${m.derruba.join(', ')})`)

    // 2a. banco descartável, cópia do base
    psql(URL_BASE, `drop database if exists ${banco}`)
    const criou = psql(URL_BASE, `create database ${banco} template ${bancoBase}`)
    if (!criou.ok) {
      erro(`::error::não consegui criar o banco ${banco}: ${criou.saida.trim()}`)
      return 1
    }

    try {
      // 2b. aplicar a mutação
      const aplicou = psql(url, m.sql)
      if (!aplicou.ok) {
        resultado = RESULTADO.NAO_APLICOU
        detalhe = `o SQL da mutação foi recusado: ${primeiraLinhaDeErro(aplicou.saida)}`
      }

      // 2c. a sonda prova que a mutação PEGOU
      if (resultado === RESULTADO.DETECTADA && m.prova) {
        const sonda = psqlValor(url, m.prova.sql)
        if (!sonda.ok) {
          resultado = RESULTADO.NAO_APLICOU
          detalhe = `a sonda de prova não rodou: ${primeiraLinhaDeErro(sonda.saida)}`
        } else if (sonda.valor !== m.prova.espera) {
          resultado = RESULTADO.NAO_APLICOU
          detalhe =
            `a sonda diz que a mutação NÃO pegou (esperava "${m.prova.espera}", veio ` +
            `"${sonda.valor}") — o SQL aplicou sem erro e mesmo assim não mudou nada`
        }
      }

      // 2d. o roteiro, contra o banco mutado
      if (resultado === RESULTADO.DETECTADA) {
        const exec = rodarRoteiros(url, [`${PASTA_ROTEIROS}/${m.roteiro}`])
        const caidos = rotulosCaidos(exec.saida)
        const faltando = m.derruba.filter((r) => !caidos.has(r))
        const chegouAoFim = emitiuLinhaFim(exec.saida, m.roteiro)

        if (!chegouAoFim) {
          // Detectada de algum jeito, mas NÃO pelo cenário nomeado: o roteiro morreu
          // antes de contar. É diagnóstico próprio — e reprova.
          resultado = RESULTADO.ABORTOU
          detalhe =
            `o roteiro não emitiu a linha FIM (morreu no meio). Rótulos que chegaram a cair: ` +
            `${[...caidos].join(', ') || '(nenhum)'}`
        } else if (faltando.length > 0) {
          resultado = RESULTADO.NAO_DETECTADA
          detalhe =
            `esperava ✗ em [${m.derruba.join(', ')}], NÃO caiu [${faltando.join(', ')}]; ` +
            `caiu de fato [${[...caidos].join(', ') || 'nada'}]`
        } else {
          const extras = [...caidos].filter((r) => !m.derruba.includes(r))
          if (extras.length > 0) {
            // Não reprova — mas vai para o relatório: cenário que cai junto é raio de
            // explosão a documentar, não ruído a esconder.
            detalhe = `também caíram (efeito colateral): ${extras.join(', ')}`
          }
        }
      }
    } finally {
      psql(URL_BASE, `drop database if exists ${banco}`)
    }

    const ms = Number((process.hrtime.bigint() - t0) / 1_000_000n)
    linhas.push({ id: m.id, roteiro: m.roteiro, esperado: m.derruba.join(','), resultado, detalhe, ms })

    const simbolo = resultado === RESULTADO.DETECTADA ? '✓' : '✗'
    log(`      ${simbolo} ${resultado}${detalhe ? ` — ${detalhe}` : ''}  (${ms} ms)`)
  }

  // ---------------------------------------------------------------------------
  // 3. O LOG AUDITÁVEL
  // ---------------------------------------------------------------------------
  log('')
  log('='.repeat(110))
  log('RESULTADO DO LOTE')
  log('='.repeat(110))
  const larguraId = Math.max(8, ...linhas.map((l) => l.id.length))
  const larguraRot = Math.max(8, ...linhas.map((l) => l.roteiro.length))
  const larguraCen = Math.max(8, ...linhas.map((l) => l.esperado.length))
  log(
    `${'mutação'.padEnd(larguraId)}  ${'roteiro'.padEnd(larguraRot)}  ` +
      `${'cenário esperado'.padEnd(larguraCen)}  ${'caiu?'.padEnd(16)}  tempo`,
  )
  log('-'.repeat(110))
  for (const l of linhas) {
    log(
      `${l.id.padEnd(larguraId)}  ${l.roteiro.padEnd(larguraRot)}  ` +
        `${l.esperado.padEnd(larguraCen)}  ${l.resultado.padEnd(16)}  ${String(l.ms).padStart(6)} ms`,
    )
    if (l.detalhe) log(`${' '.repeat(larguraId)}  └─ ${l.detalhe}`)
  }
  log('-'.repeat(110))

  const detectadas = linhas.filter((l) => l.resultado === RESULTADO.DETECTADA).length
  const totalMs = linhas.reduce((s, l) => s + l.ms, 0)
  log(`${detectadas}/${linhas.length} detectadas pelo cenário nomeado · ${totalMs} ms no total`)

  if (QUARENTENA.length > 0) {
    log('')
    log(`QUARENTENA — ${QUARENTENA.length} quebra(s) REAL(is) que o rig de hoje não sabe acusar.`)
    log('Nada aqui foi executado. Cada entrada nomeia a fase que a adota.')
    for (const q of QUARENTENA) {
      log(`  · ${q.id}  [${q.roteiro} · adota: ${q.fase}]`)
      log(`      ${q.indetectavel}`)
    }
  }

  const falhas = linhas.filter((l) => l.resultado !== RESULTADO.DETECTADA)
  if (falhas.length === 0) {
    log('')
    log('Lote inteiro detectado pelo cenário nomeado.')
    return 0
  }

  log('')
  for (const f of falhas) {
    erro(`::error::[${f.resultado}] ${f.id} (${f.roteiro}) — ${f.detalhe}`)
  }
  erro(
    `::error::${falhas.length} de ${linhas.length} mutação(ões) não terminaram como "detectada".`,
  )
  return 1
}

/** A primeira linha de ERROR do psql — o resto é ruído para o log do CI. */
function primeiraLinhaDeErro(saida) {
  const linha = saida.split('\n').find((l) => /ERROR:/.test(l))
  return (linha ?? saida.split('\n').find((l) => l.trim()) ?? '').trim().slice(0, 300)
}

process.exit(main())
