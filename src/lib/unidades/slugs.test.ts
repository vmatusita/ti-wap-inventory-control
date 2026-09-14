import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { FILIAL_TODAS, SLUG_CONSOLIDADO, SLUGS_RESERVADOS } from '@/lib/unidades/slugs'
import { SLUGS_RESERVADOS as SLUGS_RESERVADOS_DA_AJUDA } from '@/lib/ajuda/registry'

// F57 · Frente D — os slugs reservados numa fonte só, e a trava estreita que a mantém.
//
// A TRAVA: o literal EXATO `'geral'` ou `'todas'` não aparece em `src/lib/**` fora de
// `src/lib/unidades/slugs.ts`. Lida pelo AST do TypeScript (a mesma técnica de
// `import/sem-wapismo.test.ts`), então comentário nunca conta — o compilador não o expõe como nó
// — e só conta o literal INTEIRO: "todas as filiais" dentro de uma frase é texto, não slug.
//
// O ESCOPO É `src/lib/**`, NÃO `src/**`, de propósito (a ficha avisa): `src/components/**` tem
// textos de tela legítimos, e a regra aqui é sobre a lógica que decide rota e filtro.
//
// ALLOWLIST NOMINAL, com o motivo de cada entrada:
//   · arquivos de TESTE (`*.test.ts`/`*.test.tsx`) não são varridos — eles descrevem URLs de
//     propósito (`'geral,bravo'`, `'todas'` como entrada de parser);
//   · COMENTÁRIOS não são nó do AST — nunca contam;
//   · o DISCRIMINANTE de estado `'todas'` — `modo: 'todas'`/`tipo: 'todas'` num objeto ou num
//     tipo, `x.modo === 'todas'`, `case 'todas':` de um `switch (x.modo)` — não é o slug: é o
//     NOME de um modo (`SelecaoDeUnidades`, `VistaDasUnidades`, `SelecaoFilial`,
//     `EscopoDosNumeros`). A isenção é só para `'todas'` e só nesses quatro formatos; `'geral'`
//     não tem isenção nenhuma.

const RAIZ = process.cwd()
const MODULO = 'src/lib/unidades/slugs.ts'
const PALAVRAS = new Set<string>([FILIAL_TODAS, SLUG_CONSOLIDADO])
const DISCRIMINANTES = new Set(['modo', 'tipo'])

type Achado = { arquivo: string; linha: number; texto: string }

function nomeDaPropriedade(nome: ts.PropertyName): string | null {
  return ts.isIdentifier(nome) || ts.isStringLiteral(nome) ? nome.text : null
}

function ehDiscriminanteDeModo(no: ts.Node): boolean {
  const pai = no.parent
  if (!pai) return false
  // { modo: 'todas' }
  if (ts.isPropertyAssignment(pai) && pai.initializer === no) {
    return DISCRIMINANTES.has(nomeDaPropriedade(pai.name) ?? '')
  }
  // type T = { readonly modo: 'todas' }
  if (ts.isLiteralTypeNode(pai) && pai.parent && ts.isPropertySignature(pai.parent)) {
    return DISCRIMINANTES.has(nomeDaPropriedade(pai.parent.name) ?? '')
  }
  // x.modo === 'todas' · x.modo !== 'todas'
  if (
    ts.isBinaryExpression(pai) &&
    (pai.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      pai.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)
  ) {
    const outro = pai.left === no ? pai.right : pai.left
    return ts.isPropertyAccessExpression(outro) && DISCRIMINANTES.has(outro.name.text)
  }
  // switch (x.modo) { case 'todas': … }
  if (ts.isCaseClause(pai) && pai.expression === no) {
    const sw = pai.parent.parent
    return (
      ts.isSwitchStatement(sw) &&
      ts.isPropertyAccessExpression(sw.expression) &&
      DISCRIMINANTES.has(sw.expression.name.text)
    )
  }
  return false
}

/** Os usos do slug reservado num código-fonte (já descontada a isenção do discriminante). */
function usosDeSlugReservado(codigo: string, arquivo: string): Achado[] {
  const sf = ts.createSourceFile(
    arquivo,
    codigo,
    ts.ScriptTarget.Latest,
    true,
    arquivo.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const achados: Achado[] = []
  const visita = (no: ts.Node) => {
    if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) {
      const texto = no.text
      const isento = texto === FILIAL_TODAS && ehDiscriminanteDeModo(no)
      if (PALAVRAS.has(texto) && !isento) {
        const { line } = sf.getLineAndCharacterOfPosition(no.getStart(sf))
        achados.push({ arquivo, linha: line + 1, texto })
      }
    }
    ts.forEachChild(no, visita)
  }
  visita(sf)
  return achados
}

function arquivosDeLib(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) arquivosDeLib(caminho, saida)
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome)) saida.push(caminho)
  }
  return saida
}

const posix = (p: string) => relative(RAIZ, p).split(sep).join('/')

describe('os slugs reservados moram numa fonte só (src/lib/unidades/slugs.ts)', () => {
  it('`geral` e `todas` não aparecem como literal em src/lib/** fora do módulo', () => {
    const achados = arquivosDeLib(join(RAIZ, 'src', 'lib'))
      .map((p) => ({ p, rel: posix(p) }))
      .filter(({ rel }) => rel !== MODULO)
      .flatMap(({ p, rel }) => usosDeSlugReservado(readFileSync(p, 'utf8'), rel))
      .map((a) => `${a.arquivo}:${a.linha} '${a.texto}'`)
    expect(achados, `importe de ${MODULO} em vez de escrever a palavra`).toEqual([])
  })

  it('a varredura enxerga o que deve (guarda do próprio teste)', () => {
    // O módulo tem as duas palavras — se o leitor parasse de ver literal, isto cairia.
    const doModulo = usosDeSlugReservado(readFileSync(join(RAIZ, MODULO), 'utf8'), MODULO)
    expect(doModulo.map((a) => a.texto).sort()).toEqual(['geral', 'todas'])
    // O literal solto é visto — em comparação, em default, em template sem expressão.
    expect(usosDeSlugReservado(`const a = s === 'geral'`, 'x.ts')).toHaveLength(1)
    expect(usosDeSlugReservado('const b = id ?? `todas`', 'x.ts')).toHaveLength(1)
    expect(usosDeSlugReservado(`fn('todas')`, 'x.ts')).toHaveLength(1)
  })

  it('a isenção do discriminante é ESTREITA: só `todas`, só como nome de modo', () => {
    for (const isento of [
      `const a = { modo: 'todas' }`,
      `type T = { readonly modo: 'todas' } | { readonly tipo: 'todas' }`,
      `if (sel.modo === 'todas') {}`,
      `switch (v.modo) { case 'todas': break }`,
    ]) {
      expect(usosDeSlugReservado(isento, 'x.ts'), isento).toEqual([])
    }
    for (const acusado of [
      `const a = { modo: 'geral' }`, // `geral` nunca é isento
      `const b = { filial: 'todas' }`, // outra propriedade: é o slug
      `if (param === 'todas') {}`, // comparação com variável que não é modo/tipo
      `switch (slug) { case 'todas': break }`, // switch sobre o slug
    ]) {
      expect(usosDeSlugReservado(acusado, 'x.ts'), acusado).toHaveLength(1)
    }
  })

  it('comentário e frase não contam', () => {
    expect(usosDeSlugReservado(`// o 'geral' e o 'todas'\nconst x = 1`, 'x.ts')).toEqual([])
    expect(usosDeSlugReservado(`const t = 'todas as filiais'`, 'x.ts')).toEqual([])
  })

  it('os valores não mudaram (links antigos continuam valendo)', () => {
    expect(FILIAL_TODAS).toBe('todas')
    expect(SLUG_CONSOLIDADO).toBe('geral')
    expect([...SLUGS_RESERVADOS].sort()).toEqual(['geral', 'todas'])
  })
})

describe('o homônimo SEM relação: SLUGS_RESERVADOS da ajuda', () => {
  it('são slugs de PÁGINA de ajuda, e continuam separados', () => {
    expect(SLUGS_RESERVADOS_DA_AJUDA).toEqual(['manual'])
    for (const s of SLUGS_RESERVADOS) expect(SLUGS_RESERVADOS_DA_AJUDA).not.toContain(s)
  })

  it('os dois lados deixam o aviso escrito para o próximo não unificar', () => {
    for (const arquivo of [MODULO, 'src/lib/validators/admin.ts']) {
      const fonte = readFileSync(join(RAIZ, arquivo), 'utf8')
      expect(fonte, arquivo).toContain('HOMÔNIMO SEM RELAÇÃO')
      expect(fonte, arquivo).toContain('src/lib/ajuda/registry.ts')
    }
    // E o registry da ajuda não depende do módulo das unidades.
    const registry = readFileSync(join(RAIZ, 'src', 'lib', 'ajuda', 'registry.ts'), 'utf8')
    expect(registry).not.toContain('unidades/slugs')
  })
})
