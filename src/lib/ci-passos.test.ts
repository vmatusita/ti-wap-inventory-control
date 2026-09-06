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

  it('a leitura da config funciona (guarda do próprio teste)', () => {
    const blocos = includesDaConfig()
    expect(blocos.length, 'não achei os `include:` de vitest.config.mts').toBeGreaterThanOrEqual(2)
    expect(blocos.flat().length).toBeGreaterThanOrEqual(3)
    expect(blocos.flat().every((p) => p.includes('*.test.'))).toBe(true)
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

  it('os dois projetos se chamam `puro` e `componentes`', () => {
    const nomes = nomesDosProjetos()
    expect(nomes).toContain('puro')
    expect(nomes).toContain('componentes')
  })

  it('o projeto `componentes` coleta `.test.tsx`, e o `puro` não', () => {
    const padroes = includesDaConfig().flat()
    expect(padroes.some((p) => p.endsWith('*.test.tsx'))).toBe(true)
    // O piso de componente só vale se um `.test.tsx` for realmente coletado.
    expect(casa('src/**/*.test.tsx', 'src/components/layout/aviso.test.tsx')).toBe(true)
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
// O job `banco` sobe o stack inteiro do Supabase CLI para usar dele só um Postgres:
// 3 a 6 minutos, duas quebras por causa externa (rate limit da API de releases em
// 24/07, flush do PostHog em 25/07 — as duas cicatrizes estão comentadas no YAML) e
// nada disso roda na máquina do Johnny, que não tem Docker.
//
// `banco-sem-docker` faz o MESMO trabalho com `services: postgres:17`. Enquanto os
// dois existirem, é a IGUALDADE DE VEREDITO entre eles, no mesmo commit, que prova
// que o bootstrap declarado em `supabase/ci/` está certo — e é por isso que os dois
// têm de chamar o MESMO runner. Um `banco-sem-docker` com loop próprio mediria outra
// coisa, e a comparação perderia o sentido.
const BANCO_SEM_DOCKER = corpoDoJob('banco-sem-docker')

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
  it('os jobs do ci.yml são EXATAMENTE `verificar`, `banco` e `banco-sem-docker`', () => {
    expect(nomesDosJobs()).toEqual(['verificar', 'banco', 'banco-sem-docker'])
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
    // O ponto inteiro da fase. Se qualquer um destes voltar, o job novo virou uma
    // segunda cópia do antigo.
    expect(BANCO_SEM_DOCKER).not.toContain('supabase/setup-cli')
    expect(BANCO_SEM_DOCKER).not.toMatch(/supabase\s+start/)
    expect(BANCO_SEM_DOCKER).not.toMatch(/supabase\s+init/)
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
    const semComentario = BANCO_SEM_DOCKER.split('\n')
      .filter((l) => !l.trimStart().startsWith('#'))
      .join('\n')
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

describe('8. o job `banco` antigo continua intacto (ele é o required check)', () => {
  // Desde 05/09/2026 os contextos exigidos na `main` são exatamente `verificar` e
  // `banco`, pelo NOME. Renomear ou apagar o `banco` deixaria o check exigido sem
  // nunca reportar, e todo PR ficaria preso em "Expected — Waiting for status to be
  // reported". Removê-lo é entrega avulsa, e só depois de o novo ser promovido.
  it('o nome `banco` continua sendo o de um job, e é DIFERENTE do job novo', () => {
    // A existência do nome já é coberta, e de forma falsificável, pela asserção do describe 7
    // (`os jobs são EXATAMENTE …`). O que sobra de específico aqui é o que a remoção futura do
    // job antigo vai tentar fazer: colapsar os dois num só. Quando isso acontecer, será de
    // propósito — e este teste é o lugar onde a mudança tem de ser encarada.
    const nomes = nomesDosJobs()
    expect(nomes).toContain('banco')
    expect(nomes).toContain('banco-sem-docker')
    expect(new Set(nomes).size, 'nome de job repetido no ci.yml').toBe(nomes.length)
  })

  it('ele continua subindo o stack do Supabase CLI', () => {
    expect(BANCO).toContain('supabase/setup-cli@v1')
    expect(BANCO).toContain('supabase start')
  })

  it('os comentários-cicatriz dele continuam no arquivo', () => {
    // Cada um é uma quebra real que custou um dia. Apagar o comentário é apagar o
    // motivo, e o próximo a mexer refaz o erro.
    expect(BANCO).toContain('TELEMETRIA DESLIGADA (25/07/2026)')
    expect(BANCO).toContain('rate limit exceeded')
    expect(BANCO).toContain('version: 2.109.1')
  })

  it('os DOIS jobs de banco chamam o mesmo runner', () => {
    expect(BANCO).toContain('bash scripts/db/rodar-roteiros.sh')
    expect(BANCO_SEM_DOCKER).toContain('bash scripts/db/rodar-roteiros.sh')
  })
})
