// A LÓGICA DO ALARME — funções PURAS (F55 · Frente D).
//
// POR QUE ELAS SÃO PURAS E MORAM AQUI. O que decide se o Johnny é acordado de
// madrugada não pode viver dentro de um passo de YAML, onde a única forma de
// provar é rodar o workflow. Aqui elas são funções de entrada→saída, testadas em
// `alarme.test.mts` com os casos que já quebrariam de verdade — inclusive o mais
// perigoso deles, o verde de UM par fechando o alarme de OUTRO.
//
// Quem as consome é `scripts/smoke/integridade.mjs` (a sonda) e o
// `.github/workflows/saude.yml` (a issue).

// ---------------------------------------------------------------------------
// 1. A AVALIAÇÃO — o resumo × a linha de base
// ---------------------------------------------------------------------------

/**
 * Compara o `(chave, total)` que `checagens_integridade_resumo()` devolveu com a
 * linha de base VERSIONADA daquele alvo.
 *
 * ⚠ ELA FECHA EM FALHA, e isso é o ponto. Três coisas alarmam:
 *   · total ACIMA da linha de base — o achado que a fase existe para pegar;
 *   · chave que o resumo devolveu e a política NÃO conhece — checagem nova que
 *     ninguém decidiu se acorda alguém;
 *   · chave que a política espera e o resumo NÃO devolveu — foi assim que DUAS
 *     checagens sumiram em silêncio na `0098` (o cabeçalho de
 *     `src/lib/validators/dev-integridade.ts` conta a história).
 * Uma sonda que só olhasse os números seria cega para as duas últimas, que são
 * exatamente as falhas do PRÓPRIO detector.
 *
 * ⚠ `totais` é tipado como `number | null` de propósito: ele vem do PostgREST,
 * onde um `bigint` pode chegar como texto, `null`, ou simplesmente não chegar. A
 * função defende contra isso (total ilegível vira ACHADO, nunca zero), e o tipo
 * tem de dizer a verdade sobre o que ela recebe — senão o teste que prova a
 * defesa não compila.
 *
 * @param {Record<string, number | null>} totais  o que o resumo devolveu
 * @param {Record<string, number>} base    a linha de base daquele alvo
 * @returns {{ok: boolean, achados: Array<{chave: string, total: number|null, base: number|null, motivo: string}>, podeDescer: Array<{chave: string, total: number, base: number}>}}
 */
export function avaliarIntegridade(totais, base) {
  const achados = []
  const podeDescer = []

  const chavesBase = Object.keys(base).sort()
  const chavesTotais = Object.keys(totais).sort()

  for (const chave of chavesTotais) {
    if (!(chave in base)) {
      achados.push({
        chave,
        total: totais[chave],
        base: null,
        motivo:
          'checagem que a política não conhece — alguém acrescentou uma checagem sem decidir ' +
          'se ela acorda o Johnny (acrescente-a a scripts/smoke/linha-de-base.json)',
      })
    }
  }

  for (const chave of chavesBase) {
    if (!(chave in totais)) {
      achados.push({
        chave,
        total: null,
        base: base[chave],
        motivo:
          'checagem esperada que o resumo NÃO devolveu — ou ela sumiu do banco, ou o resumo ' +
          'parou de enxergá-la (foi assim que duas sumiram em silêncio na 0098)',
      })
      continue
    }
    const total = totais[chave]
    if (typeof total !== 'number' || !Number.isFinite(total)) {
      achados.push({ chave, total: null, base: base[chave], motivo: 'total ilegível' })
      continue
    }
    if (total > base[chave]) {
      achados.push({
        chave,
        total,
        base: base[chave],
        motivo: `passou da linha de base (${base[chave]} → ${total})`,
      })
    } else if (total < base[chave]) {
      podeDescer.push({ chave, total, base: base[chave] })
    }
  }

  return { ok: achados.length === 0, achados, podeDescer }
}

/**
 * O achado sobreviveu à releitura? Só as chaves com falso positivo transitório
 * declarado passam por aqui — hoje, `backup_orfao` (um backup em voo aparece
 * contado por alguns segundos, F54 §10).
 *
 * Um achado que some na segunda leitura NÃO alarma: era operação em andamento.
 * Um que fica, alarma.
 */
export function filtrarPorReleitura(achados, achadosDaReleitura, chavesComReleitura) {
  const naReleitura = new Set(achadosDaReleitura.map((a) => a.chave))
  return achados.filter(
    (a) => !chavesComReleitura.includes(a.chave) || naReleitura.has(a.chave),
  )
}

// ---------------------------------------------------------------------------
// 2. A ISSUE — abrir, atualizar, comentar, fechar. POR PAR.
// ---------------------------------------------------------------------------

/**
 * O par `(alvo, parte)` como ele aparece no TÍTULO da issue.
 *
 * ⚠ É AQUI QUE MORA A DECISÃO MAIS IMPORTANTE DO ALARME. Se houvesse uma issue
 * só, a Parte A verde — que roda de 6 em 6 horas — fecharia o alarme de
 * integridade que a Parte B (diária) abriu, e ele piscaria todo dia; e um
 * disparo verde contra o ENSAIO fecharia um alarme real de PRODUÇÃO. Cada par
 * tem o seu estado, e só o verde do MESMO par fecha o alarme dele.
 */
export function tituloDoAlarme(alvo, parte) {
  return `[alarme] ${alvo} · ${parte}`
}

/** A issue do par, dentro de uma lista de issues abertas. `null` se não houver. */
export function issueDoPar(issues, alvo, parte) {
  const titulo = tituloDoAlarme(alvo, parte)
  return issues.find((i) => i.title === titulo) ?? null
}

/**
 * O que fazer com a issue deste par, dado o veredito de agora.
 *
 * `abrir`     — vermelho e não havia issue;
 * `comentar`  — vermelho, já havia issue, e o ESTADO MUDOU (comentário novo +
 *               corpo atualizado). Comentário só quando muda: senão a issue vira
 *               uma parede de "ainda vermelho" e ninguém lê a próxima;
 * `atualizar` — vermelho, já havia issue, e o estado é o MESMO (só o corpo, para
 *               o "última verificação" ficar fresco, sem notificar ninguém);
 * `fechar`    — verde e havia issue (com comentário dizendo que voltou);
 * `nada`      — verde e não havia issue. O dia normal.
 */
export function decidirIssue({ vermelho, issueAberta, impressaoAtual }) {
  if (vermelho) {
    if (!issueAberta) return { acao: 'abrir' }
    return issueAberta.impressao === impressaoAtual
      ? { acao: 'atualizar', numero: issueAberta.number }
      : { acao: 'comentar', numero: issueAberta.number }
  }
  if (issueAberta) return { acao: 'fechar', numero: issueAberta.number }
  return { acao: 'nada' }
}

/**
 * A IMPRESSÃO do estado: o que precisa mudar para valer um comentário novo.
 * É o conjunto de chaves em alarme com os totais — não o corpo inteiro, que
 * carrega o link do run e mudaria a cada execução.
 */
export function impressaoDoEstado(achados) {
  return achados
    .map((a) => `${a.chave}=${a.total ?? 'ausente'}/${a.base ?? '?'}`)
    .sort()
    .join(';')
}

// ---------------------------------------------------------------------------
// 3. O CORPO DA ISSUE — nunca amostra, nunca nome, nunca patrimônio
// ---------------------------------------------------------------------------

/**
 * ⚠ O QUE NUNCA ENTRA AQUI: amostra, nome de pessoa, patrimônio, filial. O que
 * entra é CONTAGEM — e é por isso que `checagens_integridade_resumo()` devolve
 * só `(chave, total)`: a issue não tem por onde receber um dado de ninguém,
 * mesmo que alguém quisesse.
 */
export function corpoDoAlarme({ alvo, parte, achados, podeDescer, linkDoRun, medidoEm }) {
  const linhas = []
  linhas.push(`**Alvo:** \`${alvo}\` · **Parte:** \`${parte}\``)
  linhas.push(`**Última verificação:** ${medidoEm}`)
  linhas.push('')
  linhas.push('## O que falhou')
  linhas.push('')
  linhas.push('| checagem | total | linha de base | motivo |')
  linhas.push('|---|---:|---:|---|')
  for (const a of achados) {
    linhas.push(
      `| \`${a.chave}\` | ${a.total ?? '—'} | ${a.base ?? '—'} | ${a.motivo} |`,
    )
  }
  if (podeDescer.length) {
    linhas.push('')
    linhas.push('## A linha de base pode descer')
    linhas.push('')
    for (const d of podeDescer) {
      linhas.push(`- \`${d.chave}\`: hoje ${d.total}, base ${d.base} — alguém limpou achados.`)
    }
  }
  linhas.push('')
  linhas.push('## O que fazer')
  linhas.push('')
  linhas.push('O procedimento está em [`docs/RUNBOOK-ALARME.md`](../blob/main/docs/RUNBOOK-ALARME.md):')
  linhas.push('o que cada checagem quer dizer, onde olhar, e o que **não** fazer.')
  linhas.push('')
  linhas.push(`Execução que abriu/atualizou este alarme: ${linkDoRun}`)
  linhas.push('')
  linhas.push(
    '> Esta issue é aberta, atualizada e **fechada sozinha** pelo `.github/workflows/saude.yml`. ' +
      'Ela some quando o mesmo par `(alvo, parte)` voltar ao verde. Não há amostra aqui: o resumo ' +
      'de integridade devolve contagem, nunca linha de dado.',
  )
  return linhas.join('\n')
}

/** A linha do `$GITHUB_STEP_SUMMARY` — a série temporal de custo zero. */
export function tabelaDoResumo({ alvo, totais, base }) {
  const linhas = ['| checagem | total | linha de base | |', '|---|---:|---:|:--|']
  for (const chave of Object.keys(base).sort()) {
    const total = totais[chave]
    const marca =
      total === undefined ? '⚠ ausente' : total > base[chave] ? '✗' : total < base[chave] ? '↓' : '✓'
    linhas.push(`| \`${chave}\` | ${total ?? '—'} | ${base[chave]} | ${marca} |`)
  }
  return `### Integridade · \`${alvo}\`\n\n${linhas.join('\n')}`
}
