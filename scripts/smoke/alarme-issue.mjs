#!/usr/bin/env node
// ---------------------------------------------------------------------------
// A ISSUE DE ALARME — abrir, atualizar, comentar e FECHAR, por par (F55 · Frente D)
// ---------------------------------------------------------------------------
// Decisão do Johnny (10/09/2026): o alarme avisa por ISSUE no repositório, mais o
// e-mail nativo do GitHub. R$ 0, sem serviço novo.
//
//   node scripts/smoke/alarme-issue.mjs --alvo=producao --parte=integridade \
//        --veredito=veredito.json --run-url=https://…
//   node scripts/smoke/alarme-issue.mjs --alvo=producao --parte=sonda \
//        --resultado=falha --motivo="a Parte A do smoke falhou" --run-url=https://…
//
// ⚠ O ESTADO É POR PAR `(alvo, parte)`, e essa é a decisão que evita dois modos
// de falha reais:
//   · a Parte A roda de 6 em 6 horas e a Parte B uma vez por dia. Com uma issue
//     só, o verde da Parte A fecharia todo dia o alarme de integridade que a
//     Parte B abriu — e ele piscaria eternamente;
//   · um disparo manual verde contra o ENSAIO fecharia um alarme REAL de
//     PRODUÇÃO.
// Cada par tem a sua issue, e só o verde do MESMO par a fecha.
//
// ⚠ NADA DE DADO AQUI DENTRO. O corpo é montado por `corpoDoAlarme`, campo a
// campo, a partir de `(chave, total, base, motivo)` — e o resumo de integridade
// (`0138`) não devolve amostra, então não há nem de onde tirar um patrimônio.
//
// A LÓGICA (abrir/atualizar/comentar/fechar) é função PURA em `alarme.mjs`, com
// teste próprio. Aqui só mora a conversa com o `gh`.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { appendFileSync } from 'node:fs'
import {
  corpoDoAlarme,
  decidirIssue,
  impressaoDoCorpo,
  impressaoDoEstado,
  issueDoPar,
  MARCA_DE_IMPRESSAO,
  tituloDoAlarme,
} from './alarme.mjs'

const LABEL = 'alarme'

const argv = process.argv.slice(2)
const arg = (nome, padrao = '') => {
  const p = argv.find((a) => a.startsWith(`--${nome}=`))
  return p ? p.slice(nome.length + 3) : padrao
}

const alvo = arg('alvo')
const parte = arg('parte')
const linkDoRun = arg('run-url', '(sem link)')
const caminhoVeredito = arg('veredito')
const resultado = arg('resultado')
const motivo = arg('motivo', 'sem detalhe')

const log = (...a) => process.stdout.write(a.join(' ') + '\n')

function gh(args, entrada) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    input: entrada,
    maxBuffer: 8 * 1024 * 1024,
  })
}

// ⚠ A marca e a leitura dela moram em `alarme.mjs`, o módulo PURO. Este arquivo
// chama `main()` na importação: o que ficasse aqui, teste nenhum alcançaria — e
// foi exatamente aqui que a revisão adversarial achou o defeito de 10/09/2026.
const MARCA = MARCA_DE_IMPRESSAO

function veredito() {
  if (caminhoVeredito) {
    const v = JSON.parse(readFileSync(caminhoVeredito, 'utf8'))
    return {
      ok: Boolean(v.ok),
      achados: v.achados ?? [],
      podeDescer: v.podeDescer ?? [],
      medidoEm: v.medidoEm ?? new Date().toISOString(),
    }
  }
  // Forma simples: a Parte A, cujo veredito é o código de saída do smoke.
  const ok = resultado === 'ok'
  return {
    ok,
    achados: ok ? [] : [{ chave: `(${parte})`, total: null, base: null, motivo }],
    podeDescer: [],
    medidoEm: new Date().toISOString(),
  }
}

function garantirLabel() {
  try {
    gh(['label', 'create', LABEL, '--color', 'd73a4a', '--description', 'Alarme automático da sonda de saúde (F55)'])
    log(`  label \`${LABEL}\` criada`)
  } catch {
    // Já existe — que é o caso normal a partir do segundo dia.
  }
}

function issuesAbertas() {
  const bruto = gh(['issue', 'list', '--state', 'open', '--label', LABEL, '--limit', '50', '--json', 'number,title,body'])
  const lista = JSON.parse(bruto || '[]')
  return lista.map((i) => ({ number: i.number, title: i.title, impressao: impressaoDoCorpo(i.body) }))
}

function main() {
  if (!alvo || !parte) {
    log('uso: --alvo=<producao|ensaio> --parte=<sonda|integridade> [--veredito=… | --resultado=ok|falha --motivo=…]')
    process.exitCode = 2
    return
  }

  const v = veredito()
  const impressaoAtual = impressaoDoEstado(v.achados)
  const titulo = tituloDoAlarme(alvo, parte)

  garantirLabel()
  const abertas = issuesAbertas()
  const aberta = issueDoPar(abertas, alvo, parte)
  const decisao = decidirIssue({ vermelho: !v.ok, issueAberta: aberta, impressaoAtual })

  const corpo =
    corpoDoAlarme({ alvo, parte, achados: v.achados, podeDescer: v.podeDescer, linkDoRun, medidoEm: v.medidoEm }) +
    `\n\n${MARCA(impressaoAtual)}`

  log(`alarme: par (${alvo}, ${parte}) · ${v.ok ? 'verde' : 'VERMELHO'} · ação: ${decisao.acao}`)

  switch (decisao.acao) {
    case 'abrir': {
      const saida = gh(['issue', 'create', '--title', titulo, '--label', LABEL, '--body-file', '-'], corpo)
      log(`  issue aberta: ${saida.trim()}`)
      break
    }
    case 'comentar': {
      gh(['issue', 'edit', String(decisao.numero), '--body-file', '-'], corpo)
      gh(
        ['issue', 'comment', String(decisao.numero), '--body-file', '-'],
        `O estado deste alarme MUDOU em ${v.medidoEm}.\n\n` +
          v.achados.map((a) => `- \`${a.chave}\`: ${a.motivo}`).join('\n') +
          `\n\nExecução: ${linkDoRun}`,
      )
      log(`  issue #${decisao.numero} atualizada e comentada (o estado mudou)`)
      break
    }
    case 'atualizar': {
      // Sem comentário: o estado é o mesmo, e um comentário por execução
      // transformaria a issue numa parede que ninguém lê.
      gh(['issue', 'edit', String(decisao.numero), '--body-file', '-'], corpo)
      log(`  issue #${decisao.numero} teve o corpo atualizado (estado inalterado, sem comentar)`)
      break
    }
    case 'fechar': {
      gh(
        ['issue', 'comment', String(decisao.numero), '--body-file', '-'],
        `Voltou ao normal em ${v.medidoEm}: o par \`(${alvo}, ${parte})\` está verde de novo.\n\nExecução: ${linkDoRun}`,
      )
      gh(['issue', 'close', String(decisao.numero), '--reason', 'completed'])
      log(`  issue #${decisao.numero} FECHADA — o par voltou ao verde`)
      break
    }
    default:
      log('  nada a fazer (verde, e não havia alarme aberto)')
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `**Alarme \`(${alvo}, ${parte})\`:** ${v.ok ? '✓ verde' : '✗ VERMELHO'} — ação: \`${decisao.acao}\`\n\n`,
      'utf8',
    )
  }

  // ⚠ O CÓDIGO DE SAÍDA REFLETE O VEREDITO, não o sucesso da conversa com o gh.
  // Um passo verde com uma issue aberta seria a pior combinação possível.
  process.exitCode = v.ok ? 0 : 1
}

main()
