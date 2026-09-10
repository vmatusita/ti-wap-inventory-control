import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// A TRAVA DO WORKFLOW DE SAÚDE (F55 · Frente D).
//
// POR QUE ELE EXISTE, E POR QUE NÃO BASTA O `ci-passos.test.ts`. Aquele arquivo
// lê `.github/workflows/ci.yml` por CAMINHO FIXO (`CAMINHO_YAML`, linha 34):
// um workflow em arquivo NOVO passa inteiro por fora dele. Medido em 10/09/2026:
// um `saude.yml` sem `timeout-minutes`, com `on: pull_request` por engano, ou com
// um `echo` de secret, não seria pego por teste nenhum — e um workflow agendado
// quebrado é pior que nenhum, porque ele parece estar vigiando.
//
// Molde: `src/lib/ci-passos.test.ts`. Leitura TEXTUAL do YAML, sem parser (não há
// um na stack fechada do CLAUDE.md, e as invariantes aqui são todas textuais).

const CAMINHO = join(process.cwd(), '.github', 'workflows', 'saude.yml')
const YAML = existsSync(CAMINHO) ? readFileSync(CAMINHO, 'utf8') : ''

/**
 * O YAML sem os COMENTÁRIOS — e esta separação não é estética.
 *
 * As proibições daqui (nada de `npm ci`, nada de eco de secret, nada da forma
 * `&& secrets.X_ENSAIO ||`) são sobre o que o workflow FAZ. Mas o cabeçalho do
 * `saude.yml` EXPLICA cada uma delas, e explicar exige citar — foi assim que as
 * três nasceram vermelhas na primeira execução, acusando o próprio comentário que
 * garante que a coisa não acontece. É a mesma armadilha que o cabeçalho da `0136`
 * descreve sobre o gate do modo automático: o classificador lê o TEXTO, não a
 * intenção.
 *
 * As asserções de PROIBIÇÃO leem `CODIGO`; as que EXIGEM uma explicação escrita
 * (o horário de Brasília ao lado do cron) leem `YAML` inteiro.
 */
const CODIGO = YAML.split('\n')
  .map((l) => (/^\s*#/.test(l) ? '' : l.replace(/\s+#\s.*$/, '')))
  .join('\n')

/** As linhas de `on:` até o próximo bloco de topo. */
function blocoDeGatilho(yaml: string): string {
  const i = yaml.indexOf('\non:')
  if (i === -1) return ''
  const resto = yaml.slice(i + 1)
  const fim = resto.search(/\n(?![ \t#])[A-Za-z]/)
  return fim === -1 ? resto : resto.slice(0, fim)
}

/** Os nomes dos jobs (chaves de dois espaços dentro de `jobs:`). */
function nomesDosJobs(yaml: string): string[] {
  const i = yaml.indexOf('\njobs:')
  if (i === -1) return []
  const dentro = yaml.slice(i + '\njobs:'.length)
  return [...dentro.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)].map((m) => m[1])
}

describe('.github/workflows/saude.yml — o arquivo existe e é próprio', () => {
  it('existe', () => {
    expect(existsSync(CAMINHO), 'a sonda agendada precisa de arquivo próprio').toBe(true)
  })

  it('NÃO é um job do ci.yml — o ci.yml continua com exatamente dois', () => {
    // Espelho da asserção de `ci-passos.test.ts:376-378`, aqui pelo outro lado:
    // um job de sonda dentro do `ci.yml` viraria required check por engano.
    const ci = readFileSync(join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8')
    expect(nomesDosJobs(ci)).toEqual(['verificar', 'banco-sem-docker'])
    expect(ci).not.toContain('integridade.mjs')
    expect(ci).not.toContain('alarme-issue.mjs')
  })
})

describe('os gatilhos — agendado e manual, e SÓ', () => {
  const gatilho = blocoDeGatilho(YAML)

  it('tem `schedule`', () => {
    expect(gatilho).toContain('schedule:')
  })

  it('tem `workflow_dispatch` com os inputs `alvo` e `partes`', () => {
    expect(gatilho).toContain('workflow_dispatch:')
    expect(gatilho).toMatch(/alvo:/)
    expect(gatilho).toMatch(/partes:/)
    expect(gatilho).toMatch(/options:\s*\[producao, ensaio\]/)
  })

  it.each(['push', 'pull_request', 'pull_request_target'])(
    'NÃO roda em `%s` — um PR não pode ficar vermelho porque a produção teve um soluço',
    (evento) => {
      expect(gatilho).not.toMatch(new RegExp(`^\\s{2}${evento}:`, 'm'))
    },
  )

  it('os crons usam MINUTO QUEBRADO', () => {
    // A doc do GitHub: sob carga alta o `schedule` atrasa e "some queued jobs may
    // be dropped", e a carga é maior no começo de cada hora.
    const crons = [...gatilho.matchAll(/cron:\s*'([^']+)'/g)].map((m) => m[1])
    expect(crons.length).toBeGreaterThanOrEqual(2)
    for (const cron of crons) {
      const minuto = Number(cron.split(' ')[0])
      expect(Number.isInteger(minuto), `cron sem minuto fixo: ${cron}`).toBe(true)
      expect(minuto % 5, `cron em minuto redondo (${cron}) — o horário mais disputado`).not.toBe(0)
    }
  })

  it('o horário de Brasília está escrito ao lado de cada cron em UTC', () => {
    expect(gatilho).toMatch(/Bras[ií]lia/)
  })
})

describe('as permissões — mínimas, e nada além', () => {
  it('declara `permissions` com contents: read e issues: write', () => {
    expect(YAML).toMatch(/^permissions:\s*$/m)
    expect(YAML).toMatch(/^\s{2}contents: read\s*$/m)
    expect(YAML).toMatch(/^\s{2}issues: write\s*$/m)
  })

  it('NÃO pede nada além dessas duas', () => {
    const i = YAML.indexOf('\npermissions:')
    const bloco = YAML.slice(i + 1).split(/\n(?![ \t#])/)[0]
    const chaves = [...bloco.matchAll(/^\s{2}([a-z-]+):/gm)].map((m) => m[1])
    expect(chaves.sort()).toEqual(['contents', 'issues'])
  })

  it.each(['write-all', 'read-all', 'id-token', 'packages', 'deployments'])(
    'não pede `%s`',
    (chave) => {
      expect(CODIGO).not.toContain(chave)
    },
  )
})

describe('a higiene do job', () => {
  it('todo job tem `timeout-minutes` curto', () => {
    const tempos = [...YAML.matchAll(/timeout-minutes:\s*(\d+)/g)].map((m) => Number(m[1]))
    expect(tempos.length).toBe(nomesDosJobs(YAML).length)
    for (const t of tempos) expect(t).toBeLessThanOrEqual(15)
  })

  it('usa Node 24, o mesmo do ci.yml', () => {
    expect(YAML).toMatch(/node-version:\s*24/)
    expect([...YAML.matchAll(/node-version:\s*(\d+)/g)].every((m) => m[1] === '24')).toBe(true)
  })

  it('tem concorrência SEM cancelamento — cancelar uma sonda no meio é não sondar', () => {
    expect(YAML).toMatch(/^concurrency:/m)
    expect(YAML).toMatch(/cancel-in-progress:\s*false/)
  })

  it('NÃO roda `npm ci` — minuto custa, e o registro do npm viraria falso alarme', () => {
    expect(CODIGO).not.toMatch(/npm\s+ci\b/)
    expect(CODIGO).not.toMatch(/npm\s+install\b/)
  })
})

describe('SEGREDO NENHUM É IMPRESSO', () => {
  // A varredura procura o padrão de eco, não o valor: `echo`, `cat`, `printf` ou
  // `>>` de qualquer coisa que venha de `secrets.` ou de uma variável `SENHA`/
  // `KEY`/`TOKEN`.
  const linhas = CODIGO.split('\n')

  it('nenhum `echo`/`printf`/`cat` de `secrets.`', () => {
    const suspeitas = linhas.filter(
      (l) => /\b(echo|printf|cat)\b/.test(l) && /secrets\./.test(l),
    )
    expect(suspeitas, suspeitas.join('\n')).toEqual([])
  })

  it.each(['SENHA', 'ANON_KEY', 'GH_TOKEN', 'GITHUB_TOKEN'])(
    'nenhum `echo` de `$%s`',
    (nome) => {
      const suspeitas = linhas.filter(
        (l) => /\b(echo|printf|cat)\b/.test(l) && new RegExp(`\\$\\{?${nome}`).test(l),
      )
      expect(suspeitas, suspeitas.join('\n')).toEqual([])
    },
  )

  it('nenhum `env` / `printenv` / `set -x` solto', () => {
    for (const proibido of [/^\s*(-\s*)?run:\s*env\s*$/m, /\bprintenv\b/, /\bset\s+-x\b/]) {
      expect(YAML).not.toMatch(proibido)
    }
  })

  it('o secret do alarme é o GITHUB_TOKEN, não um PAT', () => {
    expect(YAML).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}')
    expect(CODIGO).not.toMatch(/secrets\.[A-Z_]*PAT\b/)
  })
})

describe('o que o workflow chama existe', () => {
  it.each([
    'scripts/smoke/smoke-prod.mjs',
    'scripts/smoke/integridade.mjs',
    'scripts/smoke/alarme-issue.mjs',
    'scripts/smoke/alarme.mjs',
    'scripts/smoke/linha-de-base.json',
  ])('%s existe', (caminho) => {
    expect(existsSync(join(process.cwd(), caminho))).toBe(true)
  })

  it('todo `node scripts/...` citado no YAML aponta para um arquivo real', () => {
    const chamados = [...CODIGO.matchAll(/node\s+(scripts\/[\w./-]+)/g)].map((m) => m[1])
    expect(chamados.length).toBeGreaterThan(0)
    for (const c of chamados) {
      expect(existsSync(join(process.cwd(), c)), `${c} não existe`).toBe(true)
    }
  })

  it('o alarme é chamado UMA vez por job, com o par (alvo, parte) explícito', () => {
    const partes = [...CODIGO.matchAll(/--parte=(\w+)/g)].map((m) => m[1])
    expect(partes.sort()).toEqual(['integridade', 'sonda'])
    // TRÊS: o `--alvo` da sonda de integridade e os dois do alarme, um por par.
    expect([...CODIGO.matchAll(/--alvo="\$ALVO"/g)]).toHaveLength(3)
  })
})

describe('a credencial é resolvida por ALVO, sem o `||` que cai em produção', () => {
  it('os DOIS conjuntos de secret entram no ambiente, e o script escolhe', () => {
    for (const nome of [
      'SMOKE_SUPABASE_URL_PRODUCAO',
      'SMOKE_SUPABASE_ANON_KEY_PRODUCAO',
      'SMOKE_EMAIL_PRODUCAO',
      'SMOKE_SENHA_PRODUCAO',
      'SMOKE_SUPABASE_URL_ENSAIO',
      'SMOKE_SUPABASE_ANON_KEY_ENSAIO',
      'SMOKE_EMAIL_ENSAIO',
      'SMOKE_SENHA_ENSAIO',
    ]) {
      expect(YAML, `${nome} não entra no ambiente do job`).toContain(`secrets.${nome}`)
    }
  })

  it('NÃO usa a forma `... && secrets.X_ENSAIO || secrets.X_PRODUCAO`', () => {
    // Com o secret do ensaio ausente, essa expressão CAI NO DE PRODUÇÃO — e um
    // disparo que pedia ensaio sondaria produção sem avisar ninguém.
    expect(CODIGO).not.toMatch(/&&\s*secrets\.[A-Z_]*ENSAIO\s*\|\|/)
  })
})
