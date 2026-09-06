import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// A TRAVA DA F45 — o portão de qualidade não se desmonta em silêncio.
//
// Este arquivo nasce VERDE, porque é varredura de catálogo (regra 4 do §4 do
// plano multiempresa: onde a trava não pode nascer vermelha, ela vem no mesmo
// commit, e a prova de que ela SABE ficar vermelha vai no relatório da fase).
//
// O que ele defende, e por que cada item existe:
//
//  1. Os passos do job `verificar` continuam lá, e `verificar:actions` continua
//     DEPOIS do build — ele lê `.next/server`, então a posição não é livre.
//  2. Todo `npm run X` citado no YAML tem um script `X` no `package.json`. É
//     assim que este tipo de gate morre: alguém renomeia o script, o passo passa
//     a chamar um nome que não existe, e o CI... continua verde, porque um
//     `npm run` de script inexistente é um caso que ninguém revisa.
//  3. `cancel-in-progress` NÃO vale para push na `main`. Valia até a F45, e ali
//     era um buraco: dois pushes seguidos cancelavam o CI do primeiro e o commit
//     intermediário ia a produção sem validação.
//  4. O passo dos roteiros chama `scripts/db/rodar-roteiros.sh`, e não um loop
//     inline — se o loop voltar para o YAML, local e CI voltam a divergir.
//  5. COBERTURA DO RUNNER: todo `*.test.ts?(x)` do repositório está dentro de
//     algum `include` de algum projeto do Vitest. Antes da F45 o `include` era
//     `['src/**/*.test.ts', 'scripts/import/__tests__/**/*.test.ts']` — um
//     `.test.tsx` não casava, e teste escrito em `scripts/env-guard.ts`,
//     `scripts/design/` ou `scripts/termos/` nunca rodava e ninguém ficava
//     sabendo. Esta é a asserção que impede o buraco de voltar.
//  6. Os 24 roteiros SQL seguem o molde da linha `FIM` — porque as fases
//     seguintes vão escrever roteiro novo, e o runner reprova quem não a emite.

const RAIZ = process.cwd()
const CAMINHO_YAML = join(RAIZ, '.github', 'workflows', 'ci.yml')
const YAML = readFileSync(CAMINHO_YAML, 'utf8')
const PACOTE = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}

/** O texto de um job, do cabeçalho dele até o próximo job (indentação de 2). */
function corpoDoJob(nome: string): string {
  const linhas = YAML.split('\n')
  const inicio = linhas.findIndex((l) => l === `  ${nome}:`)
  expect(inicio, `o job \`${nome}\` sumiu do ci.yml`).toBeGreaterThan(-1)
  let fim = linhas.length
  for (let i = inicio + 1; i < linhas.length; i++) {
    if (/^ {2}\S/.test(linhas[i])) {
      fim = i
      break
    }
  }
  return linhas.slice(inicio, fim).join('\n')
}

const VERIFICAR = corpoDoJob('verificar')
const BANCO = corpoDoJob('banco')

describe('1. o job `verificar` mantém os passos que reprovam', () => {
  const OBRIGATORIOS = [
    'npm ci',
    'npm run lint',
    'npm run test',
    'npm run contraste',
    'npm run build',
    'npm run verificar:actions',
  ]

  it.each(OBRIGATORIOS)('roda `%s`', (comando) => {
    expect(VERIFICAR).toContain(comando)
  })

  it('`verificar:actions` vem DEPOIS do build (ele lê `.next/server`)', () => {
    const build = VERIFICAR.indexOf('npm run build')
    const gate = VERIFICAR.indexOf('npm run verificar:actions')
    expect(build).toBeGreaterThan(-1)
    expect(gate).toBeGreaterThan(-1)
    expect(
      gate,
      'o gate de artefato lê .next/server — antes do build ele sai 1 por falta de pasta',
    ).toBeGreaterThan(build)
  })
})

describe('2. todo `npm run X` do CI tem script no package.json', () => {
  const chamados = [...YAML.matchAll(/npm run ([a-z0-9:-]+)/g)].map((m) => m[1])

  it('o YAML chama pelo menos seis scripts (guarda do próprio teste)', () => {
    expect(new Set(chamados).size).toBeGreaterThanOrEqual(6)
  })

  it.each([...new Set(chamados)])('`%s` existe no package.json', (nome) => {
    expect(Object.keys(PACOTE.scripts)).toContain(nome)
  })

  // Estes três nasceram na F45 e são o contrato com o desenvolvedor: o CI e a
  // máquina dele rodam o MESMO comando. Nomeados um a um porque a asserção
  // acima só cobre o que o YAML cita, e `db:test:um` é de uso humano.
  it.each(['verificar:actions', 'db:test', 'db:test:um'])(
    '`%s` continua no package.json',
    (nome) => {
      expect(PACOTE.scripts[nome]).toBeTruthy()
    },
  )

  it('`db:test` e `db:test:um` chamam o MESMO runner que o CI chama', () => {
    expect(PACOTE.scripts['db:test']).toContain('scripts/db/rodar-roteiros.sh')
    expect(PACOTE.scripts['db:test:um']).toContain('scripts/db/rodar-roteiros.sh')
    expect(BANCO).toContain('scripts/db/rodar-roteiros.sh')
  })
})

describe('3. `cancel-in-progress` não vale para push na main', () => {
  it('o CI ainda roda em push na `main`', () => {
    expect(YAML).toMatch(/push:\s*\n\s*branches:\s*\[main\]/)
  })

  it('`cancel-in-progress` não é `true` incondicional', () => {
    const linha = YAML.split('\n').find((l) => l.includes('cancel-in-progress:'))
    expect(linha, 'sumiu a chave cancel-in-progress').toBeTruthy()
    expect(
      linha!.trim(),
      'com `true` fixo, dois pushes seguidos na main publicam o commit do meio sem CI',
    ).not.toBe('cancel-in-progress: true')
  })

  it('o cancelamento está condicionado a pull_request', () => {
    expect(YAML).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}")
  })
})

describe('4. o passo dos roteiros chama o script, não um loop inline', () => {
  it('o job `banco` chama `bash scripts/db/rodar-roteiros.sh`', () => {
    expect(BANCO).toContain('bash scripts/db/rodar-roteiros.sh')
  })

  it('o loop `for f in supabase/tests/*.sql` NÃO voltou para o YAML', () => {
    expect(BANCO).not.toMatch(/for\s+f\s+in\s+supabase\/tests/)
  })

  it('o runner existe', () => {
    expect(existsSync(join(RAIZ, 'scripts', 'db', 'rodar-roteiros.sh'))).toBe(true)
  })

  const RUNNER = readFileSync(join(RAIZ, 'scripts', 'db', 'rodar-roteiros.sh'), 'utf8')

  it('o runner carrega `_asserts.sql` ANTES do roteiro, na mesma sessão de psql', () => {
    // Dois `-f` na mesma chamada. Função criada dentro do `begin; … rollback;`
    // do roteiro sumiria no rollback.
    expect(RUNNER).toMatch(/-f\s+"\$ASSERTS"\s+-f\s+"\$f"/)
  })

  it('o runner pula os arquivos `_*.sql`', () => {
    expect(RUNNER).toMatch(/_\*\)\s*continue/)
  })

  it('o runner EXIGE a linha FIM e conta ✗ em NOTICE além de WARNING', () => {
    expect(RUNNER).toContain('asserções, ')
    expect(RUNNER).toMatch(/\(WARNING\|NOTICE\)/)
  })

  it('`supabase/tests/_asserts.sql` existe e define `assert_zero_de`', () => {
    const asserts = join(RAIZ, 'supabase', 'tests', '_asserts.sql')
    expect(existsSync(asserts)).toBe(true)
    expect(readFileSync(asserts, 'utf8')).toContain('pg_temp.assert_zero_de')
  })
})

describe('5. cobertura do runner — nenhum teste do repositório fica fora', () => {
  /**
   * Glob→regex mínimo, para o vocabulário que os `include` usam (`**` de
   * diretório, `*` de nome, literais). Sem dependência: `picomatch` e
   * `minimatch` existem em `node_modules`, mas só como dependência TRANSITIVA —
   * um teste permanente não pode se pendurar nisso (regra 3 do CLAUDE.md).
   */
  function casa(padrao: string, caminho: string): boolean {
    const re = padrao
      .split('/')
      .map((parte) => {
        if (parte === '**') return '(?:[^/]+/)*'
        return parte.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '/'
      })
      .join('')
      .replace(/\/$/, '')
    return new RegExp(`^${re}$`).test(caminho)
  }

  it('o casador funciona (guarda do próprio teste)', () => {
    expect(casa('src/**/*.test.ts', 'src/lib/a.test.ts')).toBe(true)
    expect(casa('src/**/*.test.ts', 'src/a.test.ts')).toBe(true)
    expect(casa('src/**/*.test.ts', 'src/lib/x/y/a.test.ts')).toBe(true)
    expect(casa('src/**/*.test.ts', 'src/lib/a.test.tsx')).toBe(false)
    expect(casa('src/**/*.test.tsx', 'src/components/a.test.tsx')).toBe(true)
    expect(casa('scripts/**/*.test.ts', 'scripts/import/__tests__/a.test.ts')).toBe(true)
    expect(casa('scripts/**/*.test.ts', 'src/a.test.ts')).toBe(false)
  })

  const IGNORAR = new Set(['node_modules', '.next', '.git', '.vercel', 'coverage'])

  function testesDoRepo(dir: string, achados: string[] = []): string[] {
    for (const nome of readdirSync(dir)) {
      if (IGNORAR.has(nome)) continue
      const caminho = join(dir, nome)
      if (statSync(caminho).isDirectory()) testesDoRepo(caminho, achados)
      else if (/\.test\.(ts|tsx|mts|js|mjs)$/.test(nome)) {
        achados.push(relative(RAIZ, caminho).split(sep).join('/'))
      }
    }
    return achados
  }

  it('todo arquivo `*.test.*` está coberto por algum projeto do Vitest', async () => {
    const config = (await import('../../vitest.config.mts')).default as {
      test?: { projects?: { test?: { name?: string; include?: string[] } }[] }
    }
    const projetos = config.test?.projects ?? []
    expect(projetos.length, 'a config perdeu os projetos').toBeGreaterThanOrEqual(2)

    const padroes = projetos.flatMap((p) => p.test?.include ?? [])
    expect(padroes.length).toBeGreaterThan(0)

    const testes = testesDoRepo(RAIZ)
    expect(testes.length, 'a varredura não achou teste nenhum — ela está quebrada').toBeGreaterThan(100)

    const orfaos = testes.filter((t) => !padroes.some((p) => casa(p, t)))
    expect(
      orfaos,
      `estes arquivos de teste NÃO rodam em projeto nenhum (${padroes.join(', ')})`,
    ).toEqual([])
  })

  it('os dois projetos se chamam `puro` e `componentes`', async () => {
    const config = (await import('../../vitest.config.mts')).default as {
      test?: { projects?: { test?: { name?: string } }[] }
    }
    const nomes = (config.test?.projects ?? []).map((p) => p.test?.name)
    expect(nomes).toContain('puro')
    expect(nomes).toContain('componentes')
  })
})

describe('6. os roteiros SQL seguem o molde da linha FIM', () => {
  const PASTA = join(RAIZ, 'supabase', 'tests')
  const roteiros = readdirSync(PASTA).filter((f) => f.endsWith('.sql') && !f.startsWith('_'))

  it('há roteiro para conferir (guarda do próprio teste)', () => {
    expect(roteiros.length).toBeGreaterThanOrEqual(20)
  })

  it.each(roteiros)('%s emite `FIM <nome>: N asserções, M falhas` como última instrução', (arquivo) => {
    const nome = arquivo.replace(/\.sql$/, '')
    const linhas = readFileSync(join(PASTA, arquivo), 'utf8').split('\n')
    const i = linhas.findIndex((l) =>
      l.includes(`raise notice 'FIM ${nome}: % asserções, % falhas', v_ok + v_falhas, v_falhas;`),
    )
    expect(i, `${arquivo}: sem a linha FIM no molde da F45`).toBeGreaterThan(-1)
    expect(
      linhas.filter((l) => l.includes(`'FIM ${nome}:`)).length,
      `${arquivo}: mais de uma linha FIM`,
    ).toBe(1)
    // Última instrução do último bloco `do $$`: só assim ela deixa de sair
    // quando o roteiro aborta no meio, que é o sinal que o runner cobra.
    const seguinte = (linhas[i + 1] ?? '').trim()
    expect(
      seguinte,
      `${arquivo}: a linha FIM tem de fechar o bloco (achei "${seguinte}")`,
    ).toMatch(/^end(\s*\$\$;)?$/)
  })
})
