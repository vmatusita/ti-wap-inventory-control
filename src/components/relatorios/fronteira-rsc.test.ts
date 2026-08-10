import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// FRONTEIRA RSC — o tripwire do VALOR que atravessa para o lado errado.
//
// Nasceu de um defeito medido na F32, e vale registrar como ele se pareceu:
//
//   `corpo-relatorio-v2.tsx` (Server Component) passou a importar a constante
//   `PREFIXO_FILTROS` de `use-filtros-tabela.ts`, que é um módulo `'use client'`.
//   Em runtime, `PREFIXO_FILTROS.saidas` valia **`undefined`** — o bundler
//   substitui o módulo cliente por uma REFERÊNCIA, e ler propriedade de uma
//   referência não devolve o valor. O clique-para-filtrar montava
//   `undefined.motivo=…` na URL e o filtro nunca aplicava.
//
// O que torna esta classe perigosa: `tsc` valida contra os TIPOS do módulo (que
// existem e estão certos), o `eslint` não olha a fronteira e o `next build`
// compila sem reclamar. Só o navegador reclama — e mesmo ele não lança: entrega
// `undefined` em silêncio. Por isso a guarda é estática e mora aqui.
//
// A regra: um Server Component pode importar COMPONENTES de um módulo cliente
// (é exatamente para isso que a fronteira existe — o bundler troca por uma
// referência e o React resolve no cliente). O que ele NÃO pode é importar um
// VALOR comum (constante, função utilitária) e usá-lo durante o render do
// servidor. Convenção que separa os dois: componente começa com maiúscula.

const RAIZ = join(process.cwd(), 'src')

function arquivosDeCodigo(dir: string): string[] {
  const saida: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) {
      saida.push(...arquivosDeCodigo(caminho))
    } else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
      saida.push(caminho)
    }
  }
  return saida
}

// `'use client'` só vale como PRIMEIRA instrução do módulo; comentários antes
// dela são permitidos. Procurar a string solta pegaria a menção dentro de um
// comentário (é o mesmo cuidado do varredor de href em confinamento-viewer).
function ehModuloCliente(fonte: string): boolean {
  for (const linha of fonte.split('\n')) {
    const t = linha.trim()
    if (t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) continue
    return /^['"]use client['"]/.test(t)
  }
  return false
}

// `import { a, b as c, type D } from '@/x'` → os nomes IMPORTADOS como valor.
const RE_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g

function importesDeValor(fonte: string): { modulo: string; nomes: string[] }[] {
  const achados: { modulo: string; nomes: string[] }[] = []
  for (const m of fonte.matchAll(RE_IMPORT)) {
    const bruto = m[1]
    const modulo = m[2]
    const nomes = bruto
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && !p.startsWith('type '))
      // `a as b`: o que importa é o nome LOCAL, que é o usado no render.
      .map((p) => (p.includes(' as ') ? p.split(' as ')[1].trim() : p))
    if (nomes.length > 0) achados.push({ modulo, nomes })
  }
  return achados
}

function resolverAlias(modulo: string): string | null {
  if (!modulo.startsWith('@/')) return null
  const base = join(RAIZ, modulo.slice(2))
  for (const tentativa of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    try {
      if (statSync(tentativa).isFile()) return tentativa
    } catch {
      // caminho inexistente — tenta o próximo sufixo
    }
  }
  return null
}

// Componente por convenção: **PascalCase** — maiúscula seguida de MINÚSCULA.
// Um componente atravessa a fronteira legitimamente; é o valor comum que não.
//
// A primeira versão desta função testava só `/^[A-Z]/`, e com ela a guarda
// nascia inútil: `PREFIXO_FILTROS` — o defeito exato que motivou o teste —
// começa com maiúscula e passaria por componente. Constante em SCREAMING_SNAKE
// é justamente o formato mais comum do valor perigoso. Foi a autoguarda abaixo
// que pegou isso, o que é o argumento de existir uma autoguarda.
function pareceComponente(nome: string): boolean {
  return /^[A-Z][a-z]/.test(nome)
}

describe('fronteira RSC: Server Component não importa VALOR de módulo cliente', () => {
  const arquivos = [
    ...arquivosDeCodigo(join(RAIZ, 'app')),
    ...arquivosDeCodigo(join(RAIZ, 'components')),
  ]

  it('enxerga a árvore (sanidade do caminho)', () => {
    expect(arquivos.length).toBeGreaterThan(50)
  })

  it('nenhum valor comum atravessa a fronteira', () => {
    const violacoes: string[] = []
    for (const caminho of arquivos) {
      const fonte = readFileSync(caminho, 'utf8')
      if (ehModuloCliente(fonte)) continue // cliente → cliente é livre
      for (const { modulo, nomes } of importesDeValor(fonte)) {
        const alvo = resolverAlias(modulo)
        if (!alvo) continue
        if (!ehModuloCliente(readFileSync(alvo, 'utf8'))) continue
        for (const nome of nomes) {
          if (pareceComponente(nome)) continue
          violacoes.push(
            `${caminho.split(/[\\/]/).slice(-2).join('/')}: importa "${nome}" de "${modulo}", que é 'use client' — no servidor esse valor vale undefined`,
          )
        }
      }
    }
    expect(
      violacoes,
      'mova o valor para um módulo puro (ex.: lib/relatorios/prefixos-tabela.ts) e reexporte do módulo cliente',
    ).toEqual([])
  })

  // Autoguarda: um detector que pare de detectar transforma este teste numa
  // varredura que passa a seco. (A mesma disciplina do varredor de href.)
  it('o detector realmente detecta (guarda do próprio teste)', () => {
    expect(ehModuloCliente("'use client'\nimport x from 'y'")).toBe(true)
    expect(ehModuloCliente("// comentário\n\n'use client'\n")).toBe(true)
    // A string dentro de um comentário NÃO conta como diretiva.
    expect(ehModuloCliente("// fala sobre 'use client' aqui\nimport x from 'y'")).toBe(false)
    expect(ehModuloCliente("import x from 'y'")).toBe(false)

    const imports = importesDeValor(
      "import { PREFIXO_FILTROS, type Campo, Botao as B } from '@/x'",
    )
    expect(imports).toEqual([{ modulo: '@/x', nomes: ['PREFIXO_FILTROS', 'B'] }])
    expect(pareceComponente('PREFIXO_FILTROS')).toBe(false)
    expect(pareceComponente('Botao')).toBe(true)
  })

  // O caso concreto que originou a guarda, travado nominalmente: se alguém
  // devolver a constante para o módulo cliente, este teste diz o porquê.
  it('PREFIXO_FILTROS mora num módulo puro (o defeito original da F32)', () => {
    const puro = readFileSync(join(RAIZ, 'lib', 'relatorios', 'prefixos-tabela.ts'), 'utf8')
    expect(ehModuloCliente(puro)).toBe(false)
    expect(puro).toContain('saidas:')
    const corpo = readFileSync(
      join(RAIZ, 'components', 'relatorios', 'corpo-relatorio-v2.tsx'),
      'utf8',
    )
    expect(corpo).toContain("from '@/lib/relatorios/prefixos-tabela'")
  })
})
