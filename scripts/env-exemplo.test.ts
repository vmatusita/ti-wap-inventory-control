import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// =============================================================================
// A COBERTURA DO `.env.example` — F55 (10/09/2026), Decisão 7.
// =============================================================================
// Até aqui o `.env.example` documentava seis variáveis; o código lê 51+ nomes de
// `process.env` em `src/` + `scripts/` (medido nesta fase). Uma variável nova podia
// nascer lida por um script sem NUNCA aparecer em lugar nenhum que alguém copiasse
// para montar um ambiente — o script só falhava na hora de rodar, longe de onde a
// variável nasceu.
//
// A REGRA: todo `process.env.X` lido por `src/` ou `scripts/` NÃO-TESTE tem de estar
// no `.env.example` **ou** na lista nominal de SISTEMA declarada logo abaixo (com o
// motivo de cada uma escrito — nenhuma é "óbvia" o bastante para dispensar motivo).
// As de FERRAMENTA entram no `.env.example` numa seção própria, comentadas, sem
// valor: `.env.example` é vocabulário, nunca segredo.
//
// A regra em si é a função pura `variaveisSemCobertura`, testada isolada na seção 1
// e provada MORDER na seção 2; a varredura real do disco (seção 3) chama a MESMA
// função. A seção 4 confere que o `.env.example` nunca ganhou um valor de verdade.
// =============================================================================

const RAIZ = process.cwd()

/** Todo `process.env.NOME` citado no texto, na ordem em que aparece (com repetição). */
export function extrairNomesDeEnv(fonte: string): string[] {
  return [...fonte.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)].map((m) => m[1])
}

/** Os nomes declarados num `.env.example`: o texto antes do `=` de cada linha não-comentário. */
export function nomesNoEnvExample(conteudo: string): string[] {
  return conteudo
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .filter((l) => l.includes('='))
    .map((l) => l.slice(0, l.indexOf('=')).trim())
    .filter(Boolean)
}

/**
 * A REGRA, como função PURA: toda variável de `lidas` tem de estar em `declaradas`
 * (o `.env.example`) OU em `sistema` (a lista nominal). O que sobra é o que falta
 * cobrir — em ORDEM ALFABÉTICA e sem repetição, para uma mensagem de erro estável.
 */
export function variaveisSemCobertura(
  lidas: string[],
  declaradas: string[],
  sistema: string[],
): string[] {
  const cobertas = new Set([...declaradas, ...sistema])
  return [...new Set(lidas)].filter((v) => !cobertas.has(v)).sort()
}

describe('1. as três funções puras (guarda do próprio teste)', () => {
  it('extrai `process.env.X` do texto, na ordem, com repetição', () => {
    expect(extrairNomesDeEnv('const a = process.env.FOO\nconst b = process.env.BAR')).toEqual([
      'FOO',
      'BAR',
    ])
    expect(extrairNomesDeEnv('process.env.FOO; process.env.FOO;')).toEqual(['FOO', 'FOO'])
  })

  it('ignora o que não é `process.env.<NOME>`', () => {
    expect(extrairNomesDeEnv('const a = 1\n// processo.env.FOO não é isto\nprocess.envFOO')).toEqual(
      [],
    )
  })

  it('lê os nomes declarados no `.env.example` real do repositório', () => {
    const nomes = nomesNoEnvExample(readFileSync(join(RAIZ, '.env.example'), 'utf8'))
    expect(nomes.length).toBeGreaterThan(5)
    expect(nomes).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(nomes).toContain('SEED_PROJECT_REF')
  })

  it('variaveisSemCobertura: nada sobra quando tudo está coberto (declarado OU sistema)', () => {
    expect(variaveisSemCobertura(['A', 'B'], ['A'], ['B'])).toEqual([])
  })

  it('variaveisSemCobertura: o que falta sai ORDENADO e SEM repetição', () => {
    expect(variaveisSemCobertura(['Z', 'A', 'Z', 'A', 'B'], ['B'], [])).toEqual(['A', 'Z'])
  })
})

describe('2. a prova de que a regra MORDE', () => {
  it('uma variável F55 fictícia, nunca declarada em lugar nenhum, é acusada', () => {
    // O fonte é FICTÍCIO e nunca toca disco — é a prova de que a comparação em si
    // sabe reprovar, isolada de qualquer coincidência do repositório real.
    const fonteFicticio = `
      export function alvoDeTesteF55() {
        return process.env.VARIAVEL_QUE_NAO_EXISTE_F55
      }
    `
    const lidas = extrairNomesDeEnv(fonteFicticio)
    const declaradas = nomesNoEnvExample(readFileSync(join(RAIZ, '.env.example'), 'utf8'))
    const sistema = VARIAVEIS_DE_SISTEMA.map(([nome]) => nome)

    expect(lidas).toContain('VARIAVEL_QUE_NAO_EXISTE_F55')
    const faltando = variaveisSemCobertura(lidas, declaradas, sistema)
    expect(faltando).toContain('VARIAVEL_QUE_NAO_EXISTE_F55')
  })

  it('a mesma variável, se estivesse no `.env.example`, deixaria de ser acusada', () => {
    // Confirma que a função não acusa por vício de construção (ex.: sempre reprovar).
    const lidas = ['VARIAVEL_QUE_NAO_EXISTE_F55']
    expect(variaveisSemCobertura(lidas, ['VARIAVEL_QUE_NAO_EXISTE_F55'], [])).toEqual([])
  })
})

// -----------------------------------------------------------------------------
// As variáveis de SISTEMA — quem as define é o AMBIENTE (runtime do Next, deploy
// da Vercel, sistema operacional, runner do Vitest ou do GitHub Actions), nunca o
// operador deste projeto. Cada uma tem o motivo escrito por extenso: é exatamente
// o tipo de variável que alguém apaga do `.env.example` achando redundante — e
// aqui ela não pode desaparecer em silêncio, porque esta lista é o que a compara.
// -----------------------------------------------------------------------------
const VARIAVEIS_DE_SISTEMA: [nome: string, motivo: string][] = [
  ['NODE_ENV', 'padrão do Node/Next — quem define é o runtime (dev/build/start), nunca o operador'],
  ['CI', 'padrão de toda esteira de CI (GitHub Actions inclusive) — vale "true" quando roda em CI'],
  ['VITEST', 'definida pelo próprio runner do Vitest ao rodar os testes'],
  ['HOME', 'variável de SO (Linux/macOS) — usada só para localizar diretórios do usuário'],
  ['LOCALAPPDATA', 'variável de SO (Windows) — o par de HOME nesta plataforma'],
  ['VERCEL_ENV', 'definida pela Vercel no deploy (production/preview/development)'],
  ['VERCEL_GIT_COMMIT_REF', 'definida pela Vercel — o branch do deploy'],
  ['VERCEL_GIT_COMMIT_SHA', 'definida pela Vercel — o commit do deploy'],
  ['VERCEL_GIT_COMMIT_MESSAGE', 'definida pela Vercel — a mensagem do commit do deploy'],
  ['GITHUB_STEP_SUMMARY', 'definida pelo runner do GitHub Actions — arquivo do resumo do job'],
]

const IGNORAR = new Set(['node_modules', '.next', '.git', '.vercel', 'coverage'])

/** Todo arquivo-fonte (`.ts`/`.tsx`/`.mjs`/`.mts`) de `dir`, FORA de `*.test.*`. */
function fontesNaoTeste(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      fontesNaoTeste(caminho, achados)
    } else if (/\.(ts|tsx|mjs|mts)$/.test(nome) && !/\.test\.(ts|tsx|mjs|mts)$/.test(nome)) {
      achados.push(caminho)
    }
  }
  return achados
}

describe('3. a varredura real — src/ + scripts/ fora de teste, contra .env.example + sistema', () => {
  const arquivos = [...fontesNaoTeste(join(RAIZ, 'src')), ...fontesNaoTeste(join(RAIZ, 'scripts'))]
  const lidas = arquivos.flatMap((a) => extrairNomesDeEnv(readFileSync(a, 'utf8')))

  it('a varredura encontra arquivos e encontra variáveis (guarda do próprio teste)', () => {
    // Sem isto, um filtro quebrado (por exemplo, excluir TUDO por engano) deixaria a
    // lista vazia e a regra "morderia" por VACUIDADE — verde porque não sobrou nada
    // para comparar, não porque tudo está coberto.
    expect(arquivos.length).toBeGreaterThan(50)
    expect(lidas.length).toBeGreaterThan(20)
  })

  it('toda `process.env.X` do fonte real está no `.env.example` ou na lista de SISTEMA', () => {
    const declaradas = nomesNoEnvExample(readFileSync(join(RAIZ, '.env.example'), 'utf8'))
    const sistema = VARIAVEIS_DE_SISTEMA.map(([nome]) => nome)
    const faltando = variaveisSemCobertura(lidas, declaradas, sistema)
    expect(
      faltando,
      `faltam no .env.example (ou na lista VARIAVEIS_DE_SISTEMA deste teste): ${faltando.join(', ')}`,
    ).toEqual([])
  })
})

describe('4. o `.env.example` não tem valor nenhum — é vocabulário, não segredo', () => {
  it('toda linha `NOME=` termina exatamente no `=`, sem valor depois', () => {
    const linhas = readFileSync(join(RAIZ, '.env.example'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))

    expect(linhas.length).toBeGreaterThan(5)
    for (const l of linhas) {
      expect(l.includes('='), `linha sem "=": "${l}"`).toBe(true)
      expect(l.endsWith('='), `linha do .env.example com valor depois do "=": "${l}"`).toBe(true)
    }
  })
})
