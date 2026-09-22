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
//  6. Os roteiros SQL seguem o molde da linha `FIM` — porque as fases
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

/** O YAML sem as linhas de comentário — para asserções que falam do que EXECUTA. */
function semComentarios(yaml: string): string {
  return yaml
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n')
}

/**
 * O job MAIS o bloco de comentário que vem logo acima dele.
 *
 * ⚠ Existe porque `corpoDoJob` começa na linha `  <nome>:` e, no YAML, o comentário que
 * explica um job vive ACIMA dele. Sem isto, uma asserção sobre os comentários-cicatriz
 * passaria a olhar um texto que não os contém — e reprovaria por engano, empurrando quem
 * fosse "consertar" a apagar a asserção em vez do defeito.
 */
function blocoDoJob(nome: string): string {
  const linhas = YAML.split('\n')
  const cabecalho = linhas.findIndex((l) => l === `  ${nome}:`)
  expect(cabecalho, `o job \`${nome}\` sumiu do ci.yml`).toBeGreaterThan(-1)
  let inicio = cabecalho
  while (inicio > 0 && /^ {2}#/.test(linhas[inicio - 1])) inicio--
  return linhas.slice(inicio, cabecalho).join('\n') + '\n' + corpoDoJob(nome)
}

const VERIFICAR = corpoDoJob('verificar')

// O job de banco. Chamou-se `banco` até a v1.51.1 (06/09/2026), quando o job antigo — o
// que subia o stack Docker do Supabase CLI — foi removido e este ficou sozinho. O nome é
// contrato: ele é o *required status check* da `main`, cobrado PELO NOME (ver describe 8).
//
// `blocoDoJob` e não `corpoDoJob`: as cicatrizes que o describe 8 cobra moram no comentário
// de cabeçalho, que é justamente o que uma remoção de job leva junto sem ninguém notar.
const BANCO_SEM_DOCKER = blocoDoJob('banco-sem-docker')

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
    expect(BANCO_SEM_DOCKER).toContain('scripts/db/rodar-roteiros.sh')
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

  // A metade que faltava, e que só o CI AO VIVO mostrou (v1.50.1): desligar
  // `cancel-in-progress` não basta. Com o grupo por `ref`, os pushes na `main`
  // continuam na mesma fila, e o GitHub cancela a execução PENDENTE quando outra
  // entra. Aconteceu no rollout da F45 — o commit `dab346c` ficou sem CI nenhum.
  // O grupo por SHA dá fila própria a cada commit de push.
  it('o grupo de concorrência é por SHA em push (senão o commit pendente é descartado)', () => {
    const linha = YAML.split('\n').find((l) => l.trim().startsWith('group:'))
    expect(linha, 'sumiu a chave group do concurrency').toBeTruthy()
    expect(
      linha!,
      'com o grupo por `ref`, um push que entra na fila cancela o anterior PENDENTE',
    ).toContain('github.sha')
    expect(linha!).toContain("github.event_name == 'pull_request'")
  })
})

describe('4. o passo dos roteiros chama o script, não um loop inline', () => {
  it('o job de banco chama `bash scripts/db/rodar-roteiros.sh`', () => {
    expect(BANCO_SEM_DOCKER).toContain('bash scripts/db/rodar-roteiros.sh')
  })

  it('o loop `for f in supabase/tests/*.sql` NÃO voltou para o YAML', () => {
    expect(BANCO_SEM_DOCKER).not.toMatch(/for\s+f\s+in\s+supabase\/tests/)
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

  // A config é lida como TEXTO, pelo mesmo motivo que o YAML: `import()` de um
  // `.mts` é recusado por `tsc --noEmit` (TS5097 — só com
  // `allowImportingTsExtensions`), e afrouxar o tsconfig inteiro para um teste
  // sair verde é o tipo de troca que esta fase existe para não fazer.
  const CONFIG_VITEST = readFileSync(join(RAIZ, 'vitest.config.mts'), 'utf8')

  /** Os `include: [...]` da config, um array por projeto, na ordem. */
  function includesDaConfig(): string[][] {
    return [...CONFIG_VITEST.matchAll(/include:\s*\[([^\]]*)\]/g)].map((m) =>
      [...m[1].matchAll(/'([^']+)'/g)].map((s) => s[1]),
    )
  }

  /** Os `name: '...'` de dentro de `test: { … }` — os nomes dos projetos. */
  function nomesDosProjetos(): string[] {
    return [...CONFIG_VITEST.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1])
  }

  /**
   * Um projeto do Vitest — nome, `include` e `exclude` — recortado do texto
   * entre o `name: '<nome>'` dele e o `name:` seguinte (ou o fim do arquivo).
   *
   * Nasceu na reauditoria de 22/09/2026 (passo 5, frente E/K/Y), quando o
   * terceiro projeto (`dom`) tornou possível um buraco que os DOIS projetos da
   * F45 não tinham como abrir: um arquivo `*.dom.test.tsx` casa tanto com o
   * `include` de `componentes` (`*.test.tsx`, que não distingue o `.dom.` do
   * meio) quanto com o de `dom` — só o `exclude` de `componentes` impede que
   * ele rode NOS DOIS. `includesDaConfig`, acima, lê só o `include`: cega para
   * essa segunda casa, ela deixaria a dupla-execução voltar em silêncio.
   */
  function projetosDaConfig(): { nome: string; include: string[]; exclude: string[] }[] {
    const nomes = [...CONFIG_VITEST.matchAll(/name:\s*'([^']+)'/g)]
    return nomes.map((m, i) => {
      const inicio = m.index ?? 0
      const fim = nomes[i + 1]?.index ?? CONFIG_VITEST.length
      const bloco = CONFIG_VITEST.slice(inicio, fim)
      const listar = (chave: 'include' | 'exclude') =>
        [...bloco.matchAll(new RegExp(`${chave}:\\s*\\[([^\\]]*)\\]`, 'g'))].flatMap((mm) =>
          [...mm[1].matchAll(/'([^']+)'/g)].map((s) => s[1]),
        )
      return { nome: m[1], include: listar('include'), exclude: listar('exclude') }
    })
  }

  it('a leitura da config funciona (guarda do próprio teste)', () => {
    const blocos = includesDaConfig()
    expect(blocos.length, 'não achei os `include:` de vitest.config.mts').toBeGreaterThanOrEqual(3)
    expect(blocos.flat().length).toBeGreaterThanOrEqual(4)
    // `*.test.` (com o asterisco) não casa mais com todo padrão desde o `dom`:
    // `src/**/*.dom.test.tsx` tem `.dom.` entre o `*` e o `test`. `.test.` sem
    // o asterisco continua valendo para os quatro padrões — é o que garante
    // que a config lida de fato aponta para arquivo `*.test.*`.
    expect(blocos.flat().every((p) => p.includes('.test.'))).toBe(true)
  })

  it('todo arquivo `*.test.*` está coberto por algum projeto do Vitest', () => {
    const padroes = includesDaConfig().flat()
    const testes = testesDoRepo(RAIZ)
    expect(testes.length, 'a varredura não achou teste nenhum — ela está quebrada').toBeGreaterThan(100)

    const orfaos = testes.filter((t) => !padroes.some((p) => casa(p, t)))
    expect(
      orfaos,
      `estes arquivos de teste NÃO rodam em projeto nenhum (${padroes.join(', ')})`,
    ).toEqual([])
  })

  it('nenhum arquivo de teste roda em mais de um projeto (include menos exclude)', () => {
    // A cobertura acima prova o piso (ninguém fica de fora); esta prova o teto
    // (ninguém roda em dobro). Um arquivo `*.dom.test.tsx` sem o `exclude` de
    // `componentes` casaria com os DOIS `include` — a suíte dele rodaria duas
    // vezes, uma em `node` (onde as APIs de DOM que ele usa nem existem) e
    // outra em `happy-dom`, e só a segunda passaria: verde por metade,
    // silenciosamente.
    const projetos = projetosDaConfig()
    const testes = testesDoRepo(RAIZ)
    const emDobro = testes.filter((t) => {
      const rodamNele = projetos.filter(
        (p) =>
          p.include.some((padrao) => casa(padrao, t)) &&
          !p.exclude.some((padrao) => casa(padrao, t)),
      )
      return rodamNele.length > 1
    })
    expect(
      emDobro,
      `estes arquivos rodam em mais de um projeto do Vitest ao mesmo tempo: ${emDobro.join(', ')}`,
    ).toEqual([])
  })

  it('os três projetos se chamam `puro`, `componentes` e `dom`', () => {
    const nomes = nomesDosProjetos()
    expect(nomes).toContain('puro')
    expect(nomes).toContain('componentes')
    expect(nomes).toContain('dom')
  })

  it('o projeto `componentes` coleta `.test.tsx`, e o `puro` não', () => {
    const padroes = includesDaConfig().flat()
    expect(padroes.some((p) => p.endsWith('*.test.tsx'))).toBe(true)
    // O piso de componente só vale se um `.test.tsx` for realmente coletado.
    expect(casa('src/**/*.test.tsx', 'src/components/layout/aviso.test.tsx')).toBe(true)
  })

  it('o projeto `dom` coleta só `.dom.test.tsx`, e `componentes` o exclui', () => {
    const projetos = projetosDaConfig()
    const dom = projetos.find((p) => p.nome === 'dom')
    const componentes = projetos.find((p) => p.nome === 'componentes')
    expect(dom?.include, 'o projeto `dom` sumiu ou perdeu o include').toContain(
      'src/**/*.dom.test.tsx',
    )
    expect(
      componentes?.exclude,
      '`componentes` tem de excluir `*.dom.test.tsx` — senão ele roda nos dois projetos',
    ).toContain('src/**/*.dom.test.tsx')
    // O ambiente é o que justifica o projeto existir: sem `happy-dom` aqui, o
    // Radix (ResizeObserver/hasPointerCapture/scrollIntoView) morre na
    // primeira interação. Ver o comentário do projeto em vitest.config.mts.
    expect(CONFIG_VITEST).toMatch(/name:\s*'dom'[\s\S]*?environment:\s*'happy-dom'/)
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

// ---------------------------------------------------------------------------
// F46 — o job de banco SEM o Docker do Supabase
// ---------------------------------------------------------------------------
// Até a v1.51.1 havia DOIS jobs de banco, e era a IGUALDADE DE VEREDITO entre eles,
// no mesmo commit, que provava que o bootstrap declarado em `supabase/ci/` estava
// certo. Provada essa igualdade em cinco runs seguidos, o antigo saiu (describe 8).
//
// Com um só, a régua que resta é outra e continua valendo: o job e a mesa rodam o
// MESMO `scripts/db/rodar-roteiros.sh`. Um job com loop próprio mediria outra coisa,
// e local × CI voltariam a divergir por construção — que é o buraco que a F45 fechou.

/**
 * Os nomes dos jobs, lidos do bloco `jobs:` — e SÓ de dentro dele.
 *
 * ⚠ O recorte não é frescura: `on: push: branches:` também tem chaves em indentação 2
 * (`  push:`), e uma regex solta sobre o arquivo inteiro devolveria `push` como se fosse job.
 */
function nomesDosJobs(): string[] {
  const i = YAML.indexOf('\njobs:\n')
  expect(i, 'sumiu o bloco `jobs:` do ci.yml').toBeGreaterThan(-1)
  return [...YAML.slice(i).matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)].map((m) => m[1])
}

describe('7. o job de banco sem Docker existe e mede a mesma coisa', () => {
  // ⚠ ESTA ASSERÇÃO SUBSTITUIU DUAS TAUTOLOGIAS, apanhadas na revisão adversarial da F46.
  //
  // Havia aqui um `expect(BANCO_SEM_DOCKER.length).toBeGreaterThan(0)` e, no describe 8, um
  // `expect(YAML).toContain('\n  banco:\n')`. As duas NUNCA podiam falhar de forma
  // independente: `corpoDoJob` já faz `expect(inicio).toBeGreaterThan(-1)` por DENTRO, e ele
  // roda no carregamento do módulo (linhas `const BANCO = …` / `const BANCO_SEM_DOCKER = …`).
  // Se o job sumisse, o arquivo inteiro morria na coleta, antes de qualquer `it` nomeado — ou
  // seja, chegar a executar aquelas duas linhas já pressupunha o que elas "verificavam".
  // Asserção que não sabe ficar vermelha é sensação de rede, que é o que a F45 existiu para
  // matar; deixá-las seria a trava desta fase repetindo o defeito que ela denuncia.
  //
  // Esta aqui é estritamente mais forte e SABE falhar: pega job renomeado, job apagado e job
  // novo que ninguém declarou — inclusive o cenário que mais importa, `banco` virar outro nome
  // e o *required status check* parar de reportar para sempre.
  it('os jobs do ci.yml são EXATAMENTE `verificar` e `banco-sem-docker`', () => {
    expect(nomesDosJobs()).toEqual(['verificar', 'banco-sem-docker'])
  })

  it('`banco-sem-docker` é um job de verdade, não um cabeçalho vazio', () => {
    expect(BANCO_SEM_DOCKER).toMatch(/^\s{4}runs-on:/m)
    expect(BANCO_SEM_DOCKER).toMatch(/^\s{4}steps:/m)
    expect(
      BANCO_SEM_DOCKER.match(/^\s{6}- (name|uses):/gm)?.length ?? 0,
      'o job perdeu passos',
    ).toBeGreaterThanOrEqual(6)
  })

  it('ele chama o MESMO runner que o job `banco` — não um loop próprio', () => {
    expect(BANCO_SEM_DOCKER).toContain('bash scripts/db/rodar-roteiros.sh')
    expect(BANCO_SEM_DOCKER).not.toMatch(/for\s+f\s+in\s+supabase\/tests/)
  })

  it('ele passa `DATABASE_URL` para o runner (é assim que o script aponta para o serviço)', () => {
    // O runner aceita `DATABASE_URL` desde a F45 e, quando ela falta, cai no Postgres
    // do `supabase start` (porta 54322). Sem esta variável o job novo mediria o banco
    // ERRADO — ou nenhum — e o passo passaria por engano.
    expect(BANCO_SEM_DOCKER).toMatch(/DATABASE_URL:\s*postgresql:\/\//)
  })

  it('ele NÃO usa `supabase start`, `supabase init` nem `supabase/setup-cli`', () => {
    // O ponto inteiro da fase. Se qualquer um destes voltar, o job voltou a ser o
    // antigo.
    //
    // ⚠ Sem tirar os comentários, esta asserção se autodenuncia — desde a v1.51.1 o
    // cabeçalho do job NARRA os dois incidentes que tiraram a CLI do caminho crítico,
    // e ali as palavras `supabase start`/`init` aparecem de propósito. Um teste que
    // reprova pela própria documentação ensina a apagar o comentário, que é
    // exatamente o que não se quer.
    expect(semComentarios(BANCO_SEM_DOCKER)).not.toContain('supabase/setup-cli')
    expect(semComentarios(BANCO_SEM_DOCKER)).not.toMatch(/supabase\s+start/)
    expect(semComentarios(BANCO_SEM_DOCKER)).not.toMatch(/supabase\s+init/)
  })

  it('ele sobe um Postgres do major de PRODUÇÃO como serviço', () => {
    expect(BANCO_SEM_DOCKER).toMatch(/image:\s*postgres:17\b/)
    // Sem health-check os passos começam antes de o banco aceitar conexão: falha de
    // corrida, que aparece como "could not connect" intermitente.
    expect(BANCO_SEM_DOCKER).toContain('--health-cmd pg_isready')
  })

  it('o BOOTSTRAP é aplicado ANTES das migrations', () => {
    // Sem `auth`/`storage`/roles no lugar, a `0001` morre na FK para `auth.users` e a
    // `0021` morre em `storage.buckets`. A ordem não é preferência de leitura.
    const boot = BANCO_SEM_DOCKER.indexOf('supabase/ci/bootstrap-roles.sql')
    const migra = BANCO_SEM_DOCKER.indexOf('supabase/migrations/*.sql')
    expect(boot, 'o passo de bootstrap sumiu').toBeGreaterThan(-1)
    expect(migra, 'o passo que aplica as migrations sumiu').toBeGreaterThan(-1)
    expect(boot, 'o bootstrap tem de vir antes das migrations').toBeLessThan(migra)
  })

  it('a ordem `migrations → roteiros` não inverte', () => {
    const migra = BANCO_SEM_DOCKER.indexOf('supabase/migrations/*.sql')
    const roteiros = BANCO_SEM_DOCKER.indexOf('bash scripts/db/rodar-roteiros.sh')
    expect(
      roteiros,
      'roteiros antes das migrations é um banco vazio sendo medido',
    ).toBeGreaterThan(migra)
  })

  it('as migrations são aplicadas com `ON_ERROR_STOP=1`, sem recorte', () => {
    // `ON_ERROR_STOP` desligado faria o psql seguir depois do erro e o passo terminar
    // 0 — verde sobre um banco meio aplicado.
    expect(BANCO_SEM_DOCKER).toContain('ON_ERROR_STOP=1')
    // A pasta INTEIRA: nenhum recorte por faixa de número. A faixa "0001→0040" escrita
    // à mão já envelheceu uma vez, e o comentário do job antigo registra isso.
    expect(BANCO_SEM_DOCKER).toContain('supabase/migrations/*.sql')
  })

  it('nenhum passo mascara erro com `|| true` ou saída descartada', () => {
    // A exceção legítima do job ANTIGO (`supabase stop || true`, num passo `if: always()`
    // de limpeza) não existe aqui: este job não tem stack para derrubar. Qualquer
    // `|| true` neste job seria verificação que não sabe reprovar.
    //
    // ⚠ Sem tirar os comentários, esta asserção se autodenuncia: o próprio YAML tem um
    // comentário dizendo "nada de `|| true`", e o `toContain` casaria com ele. Um teste
    // que reprova pela sua própria documentação ensina a apagar o comentário.
    const semComentario = semComentarios(BANCO_SEM_DOCKER)
    expect(semComentario).not.toContain('|| true')
    expect(semComentario).not.toMatch(/>\s*\/dev\/null/)
  })

  const ARQUIVOS_CI = [
    'bootstrap-roles.sql',
    'bootstrap-auth.sql',
    'bootstrap-storage.sql',
    'bootstrap-ledger.sql',
    'impressao-schema.sql',
  ]

  it.each(ARQUIVOS_CI)('`supabase/ci/%s` existe e é citado pelo job', (arquivo) => {
    expect(existsSync(join(RAIZ, 'supabase', 'ci', arquivo))).toBe(true)
    expect(BANCO_SEM_DOCKER).toContain(`supabase/ci/${arquivo}`)
  })

  it('o bootstrap NÃO concede privilégio de tabela em `public`', () => {
    // ⚠ A ARMADILHA DO EXCESSO, não a da falta. Um `grant … on all tables in schema
    // public` faria `seguranca_catalogo.sql` passar por MOTIVO ERRADO e mascararia todo
    // REVOKE futuro — o próprio `supabase/tests/papeis_rls.sql` proíbe esse atalho por
    // escrito, e registra que o `supabase start` do job ANTIGO também não entrega esses
    // defaults. Conceder aqui seria divergir do job antigo na direção mais perigosa:
    // verde por um ambiente MAIS permissivo que produção.
    const sql = ARQUIVOS_CI.map((a) => readFileSync(join(RAIZ, 'supabase', 'ci', a), 'utf8'))
      .join('\n')
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n')

    expect(sql).not.toMatch(/on all tables/i)
    expect(sql).not.toMatch(/alter default privileges/i)
    expect(sql, 'nenhum grant sobre objeto de `public`').not.toMatch(/grant[^;]*\bon\s+public\./i)
  })

  it('o bootstrap liga RLS em `storage.objects`', () => {
    // Nenhuma migration liga — num Supabase a tabela já vem com RLS. Num Postgres cru
    // ela nasce DESLIGADA, e aí as 8 policies de `0021`/`0031` ficam inertes: as
    // asserções 6a..6f de `papeis_rls.sql`, que medem que o operador NÃO alcança o
    // objeto de filial alheia, passariam medindo nada.
    const storage = readFileSync(join(RAIZ, 'supabase', 'ci', 'bootstrap-storage.sql'), 'utf8')
    expect(storage).toMatch(/alter table storage\.objects enable row level security/i)
  })
})

describe('8. o job `banco` antigo saiu — e o que ele ensinou não saiu com ele', () => {
  // O job `banco` (Supabase CLI + Docker) foi REMOVIDO na v1.51.1, depois de:
  //   (a) chegar ao MESMO veredito do job novo em cinco runs seguidos, e
  //   (b) a branch protection já exigir `banco-sem-docker` — nunca antes, senão o
  //       próprio PR de remoção ficaria preso em "Expected — Waiting for status".
  //
  // ⚠ O QUE ESTE DESCRIBE DEFENDE AGORA NÃO É A AUSÊNCIA — é a MEMÓRIA. Apagar um
  // job apaga junto os comentários que explicam por que ele era assim, e é aí que a
  // decisão volta a ser tomada do zero daqui a um ano. Os dois incidentes que
  // tiraram a CLI do caminho crítico foram MOVIDOS para o cabeçalho do job vivo, e
  // é isso que as asserções abaixo cobram.

  it('nenhum vestígio executável do stack do Supabase CLI voltou ao YAML', () => {
    // Fora dos comentários: nenhum `uses: supabase/setup-cli`, nenhum `supabase
    // start`/`init`. Se alguém "restaurar" o job antigo, esta reprova.
    const semComentario = semComentarios(YAML)
    expect(semComentario).not.toContain('supabase/setup-cli')
    expect(semComentario).not.toMatch(/supabase\s+(start|init|stop)/)
    expect(semComentario).not.toContain('SUPABASE_TELEMETRY_DISABLED')
  })

  it('as duas cicatrizes continuam escritas no YAML, agora no job vivo', () => {
    // Cada uma é uma quebra real, por causa EXTERNA, que custou um dia. Elas são o
    // motivo de não haver CLI no caminho crítico — apagá-las convida o próximo a
    // voltar atrás "porque o `supabase start` é mais simples".
    expect(BANCO_SEM_DOCKER, 'sumiu a cicatriz do rate limit (24/07/2026)').toContain(
      'rate limit',
    )
    expect(BANCO_SEM_DOCKER, 'sumiu a cicatriz do flush do PostHog (25/07/2026)').toContain(
      'PostHog',
    )
    expect(BANCO_SEM_DOCKER, 'sumiu o veto de Docker (09/08/2026)').toContain('Docker')
  })

  it('o job vivo avisa que o NOME dele é o required check', () => {
    // A armadilha que a remoção do job antigo quase criou, e que vai reaparecer no
    // dia em que alguém quiser renomear este: trocar o nome sem trocar a proteção
    // deixa o check exigido sem nunca reportar, e o PR trava sem nada vermelho na
    // tela para explicar. O aviso tem de morar ao lado do nome.
    expect(BANCO_SEM_DOCKER).toContain('required status check')
    expect(BANCO_SEM_DOCKER).toContain('required_status_checks')
  })

  it('o runner continua sendo o mesmo arquivo que `npm run db:test` chama', () => {
    // Era a igualdade entre os dois jobs que provava o bootstrap; com um só, o que
    // resta é a igualdade entre o CI e a mesa. Ela não pode se perder junto.
    expect(BANCO_SEM_DOCKER).toContain('bash scripts/db/rodar-roteiros.sh')
    expect(PACOTE.scripts['db:test']).toContain('scripts/db/rodar-roteiros.sh')
  })
})

// ---------------------------------------------------------------------------
// F47 — o injetor de mutações e o gate de deriva de tipos
// ---------------------------------------------------------------------------
// O describe 7 pergunta "o job mede o banco?". Este pergunta as duas coisas que a F47
// acrescentou: o `database.ts` acompanha o banco, e os roteiros SABEM ficar vermelhos.
//
// ⚠ A LISTA DE JOBS NÃO MUDOU, E ISSO É A DECISÃO 2 DA FASE, não um esquecimento.
// Medido no run 34048772118: um job PRÓPRIO pagaria de novo os ~41s de overhead fixo
// (subir o `postgres:17` 26s + instalar `psql` 15s) que o job existente já pagou, contra
// ~6-8s de reaplicar bootstrap+migrations — e, como a proteção da `main` não se toca
// nesta fase, um job novo NUNCA seria required check: seria um portão que não fecha.
// Como PASSO dentro do job que já é required, o gate vale desde o primeiro dia.
describe('9. as duas ferramentas da F47 rodam de verdade no CI', () => {
  const PASSOS = semComentarios(BANCO_SEM_DOCKER)

  it('os dois scripts existem no `package.json` e apontam para os arquivos reais', () => {
    expect(PACOTE.scripts['db:test:mutations']).toBe('node scripts/db/run-mutation-tests.mjs')
    expect(PACOTE.scripts['db:types:diff']).toBe('node scripts/db/diff-tipos.mjs')
  })

  const ARQUIVOS = [
    'run-mutation-tests.mjs', // o motor
    'mutacoes.mjs', // o catálogo — separado do motor, para a F51/F52 mexerem só aqui
    'corpo-vigente.mjs', // resolve o corpo VIVO de uma função nas migrations
    'saida-roteiro.mjs', // a leitura da saída: token, nunca substring
    'diff-tipos.mjs', // o gate de deriva
    'tipos-conjuntos.mjs', // as peças puras do gate
  ]

  it.each(ARQUIVOS)('`scripts/db/%s` existe', (arquivo) => {
    expect(existsSync(join(RAIZ, 'scripts', 'db', arquivo))).toBe(true)
  })

  it('o job chama os dois — e chama o script de verdade, não um eco', () => {
    expect(PASSOS).toContain('npm run db:types:diff')
    expect(PASSOS).toContain('npm run db:test:mutations')
  })

  it('nenhum dos dois é CONDICIONAL', () => {
    // ⚠ A restrição inegociável da fase, confirmada na documentação oficial do GitHub:
    // um job ou passo PULADO por `if:` reporta status "Success" e não impede o merge,
    // mesmo sendo required check. Gatear estes dois por label de PR (que era a opção da
    // ficha) os deixaria verdes sem terem rodado — e ninguém saberia. Esta asserção é o
    // que impede alguém de "aliviar o CI" acrescentando um `if:` mais tarde.
    const linhas = PASSOS.split('\n')
    for (const alvo of ['npm run db:types:diff', 'npm run db:test:mutations']) {
      const i = linhas.findIndex((l) => l.includes(alvo))
      expect(i, `o passo de \`${alvo}\` sumiu do job`).toBeGreaterThan(-1)
      // A janela do passo: do `- name:` anterior até a linha do comando.
      let inicio = i
      while (inicio > 0 && !/^\s{6}- (name|uses):/.test(linhas[inicio])) inicio--
      const passo = linhas.slice(inicio, i + 1).join('\n')
      expect(passo, `\`${alvo}\` virou condicional — passo pulado reporta SUCESSO`).not.toMatch(
        /^\s*if:/m,
      )
    }
  })

  it('nenhum dos dois mascara erro', () => {
    // Repete o espírito do describe 7 para os passos novos: uma verificação que não sabe
    // reprovar é o que a F45 existiu para matar.
    const trecho = PASSOS.slice(PASSOS.indexOf('npm run db:types:diff') - 400)
    expect(trecho).not.toContain('|| true')
    expect(trecho).not.toMatch(/>\s*\/dev\/null/)
    expect(trecho).not.toContain('continue-on-error')
  })

  it('o gate de tipos roda DEPOIS das migrations', () => {
    // Antes delas ele mediria um banco vazio: conjunto vazio nunca tem nada que o
    // repositório não tenha, e o passo passaria VERDE sem ter medido nada. (O script tem
    // guarda própria contra isso; esta asserção evita chegar lá.)
    const migra = PASSOS.indexOf('supabase/migrations/*.sql')
    const gate = PASSOS.indexOf('npm run db:types:diff')
    expect(migra).toBeGreaterThan(-1)
    expect(gate).toBeGreaterThan(-1)
    expect(gate, 'o gate de tipos antes das migrations mede um banco vazio').toBeGreaterThan(migra)
  })

  it('o injetor roda DEPOIS dos roteiros', () => {
    // Se o acervo de asserções já estiver vermelho, o veredito honesto é o do passo dos
    // roteiros. O injetor aborta sozinho na execução de controle, mas ler o vermelho na
    // ordem certa poupa quem depura.
    const roteiros = PASSOS.indexOf('bash scripts/db/rodar-roteiros.sh')
    const injetor = PASSOS.indexOf('npm run db:test:mutations')
    expect(injetor).toBeGreaterThan(roteiros)
  })

  it('o job instala as dependências ANTES do gate de tipos', () => {
    // O gate lê o `database.ts` pelo COMPILADOR TypeScript, que vive em `node_modules`.
    // Sem `npm ci` antes, o passo morre em "Cannot find package 'typescript'" — falha por
    // ambiente, no meio de um required check.
    const npmci = PASSOS.indexOf('npm ci')
    const gate = PASSOS.indexOf('npm run db:types:diff')
    expect(npmci, 'o job perdeu o `npm ci`').toBeGreaterThan(-1)
    expect(npmci).toBeLessThan(gate)
    expect(PASSOS, 'sem setup-node o `npm ci` usa o Node do runner, não o major do projeto')
      .toContain('actions/setup-node')
  })

  it('o injetor não reimplementa o runner — ele reusa `rodar-roteiros.sh`', () => {
    // Um segundo runner divergiria do primeiro, e a divergência só apareceria no dia em
    // que importasse. É a mesma razão de o job e a mesa chamarem o mesmo arquivo.
    const motor = readFileSync(join(RAIZ, 'scripts', 'db', 'run-mutation-tests.mjs'), 'utf8')
    expect(motor).toContain('rodar-roteiros.sh')
    // E ele documenta a INVERSÃO do código de saída: o runner sai 1 quando o roteiro fica
    // vermelho, e para o injetor isso é SUCESSO. Sem o aviso escrito, o próximo leitor
    // "conserta" isso.
    expect(motor, 'a inversão do código de saída tem de estar escrita').toMatch(/INVERSÃO/)
  })
})
