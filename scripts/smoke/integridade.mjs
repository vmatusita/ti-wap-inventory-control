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
// ---------------------------------------------------------------------------

import { readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  avaliarIntegridade,
  filtrarPorReleitura,
  impressaoDoEstado,
  tabelaDoResumo,
} from './alarme.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const TIMEOUT_MS = 20_000

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

    return {
      ok,
      alvo,
      achados,
      podeDescer,
      impressao: impressaoDoEstado(achados),
      resumoMd: tabelaDoResumo({ alvo, totais, base }),
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
