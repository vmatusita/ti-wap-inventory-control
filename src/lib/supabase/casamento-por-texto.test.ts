import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// NENHUM CASAMENTO DE ERRO POR TEXTO LITERAL FORA DA LISTA (F58 · Frente D) — trava por FORMA.
//
// `src/lib/supabase/erros-do-banco.ts` nomeia toda frase que o aplicativo reconhece numa mensagem
// de erro, e `erros-do-banco-sql.test.ts` confere cada uma contra o SQL vivo. Um
// `m.includes('texto solto')` escrito fora dali é uma frase que ninguém confere — exatamente o que a
// F58 tirou de oito arquivos (132 em `erros.ts`, 23 nos outros sete). Esta trava reprova, por AST, o
// casamento com TEXTO FIXO sobre um valor que DERIVA de mensagem de erro:
//
//  · `.includes(x)`, `.startsWith(x)`, `.endsWith(x)`, `.indexOf(x)`, `.match(x)`, `.search(x)`
//    cujo receptor deriva de mensagem e cujo `x` é texto fixo;
//  · `/regex/.test(y)` com `y` derivado de mensagem.
//
// "Texto fixo" é o literal de string, o template sem interpolação, a regex literal, o nome de uma
// constante LOCAL com um desses (`const FRASE = 'x'`) e o parâmetro de um callback sobre uma LISTA
// LITERAL (`['a', 'b'].some((f) => m.includes(f))`) — as três formas de escrever a mesma frase solta.
//
// "Deriva de mensagem" é local, por arquivo: expressão que lê `.message`, `.details`, `.hint` ou
// `.code` (também depois de `?? ''`, `.toLowerCase()`, `String(...)`), os nomes que recebem uma dessas
// (`const m = (erro.message ?? '').toLowerCase()`), e o parâmetro chamado `mensagem`, `message` ou
// `msg`. Casar pela constante nomeada (`casa(m, MSG_SQL.x)`, `casaConstraint(m, 'itens_nome_uidx')`)
// não é casamento por texto solto e passa — o nome da constraint é TIPADO pela lista.
//
// Testes não entram na varredura (eles ESCREVEM mensagens de propósito). Sabotagem G
// (docs/f58-evidencias): um `m.includes('texto solto')` em `erros.ts` fica vermelho aqui.

const RAIZ = process.cwd()
const ISENTOS = new Set(['src/lib/supabase/erros-do-banco.ts'])
const METODOS = new Set(['includes', 'startsWith', 'endsWith', 'indexOf', 'match', 'search'])
const METODOS_DE_LISTA = new Set(['some', 'every', 'find', 'findIndex', 'filter'])
const CAMPOS_DE_ERRO = new Set(['message', 'details', 'hint', 'code'])
const PARAMETROS_DE_MENSAGEM = new Set(['mensagem', 'message', 'msg'])

export type Casamento = { linha: number; texto: string }

export function casamentosPorTexto(fonte: string, nomeArquivo = 'arquivo.ts'): Casamento[] {
  const sf = ts.createSourceFile(
    nomeArquivo,
    fonte,
    ts.ScriptTarget.Latest,
    true,
    nomeArquivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const derivados = new Set<string>()
  const constantesDeTexto = new Set<string>()
  const ehTextoLiteral = (e: ts.Node | undefined): boolean =>
    !!e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isRegularExpressionLiteral(e))

  const leCampoDeErro = (e: ts.Node): boolean => {
    let achou = false
    const v = (n: ts.Node): void => {
      if (achou) return
      if (ts.isPropertyAccessExpression(n) && CAMPOS_DE_ERRO.has(n.name.text)) achou = true
      else if (ts.isIdentifier(n) && derivados.has(n.text)) achou = true
      else ts.forEachChild(n, v)
    }
    v(e)
    return achou
  }

  // propagação até o ponto fixo
  for (let antes = -1; antes !== derivados.size + constantesDeTexto.size; ) {
    antes = derivados.size + constantesDeTexto.size
    const visitar = (n: ts.Node): void => {
      if (ts.isParameter(n) && ts.isIdentifier(n.name) && PARAMETROS_DE_MENSAGEM.has(n.name.text)) derivados.add(n.name.text)
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        if (leCampoDeErro(n.initializer)) derivados.add(n.name.text)
        if (ehTextoLiteral(n.initializer)) constantesDeTexto.add(n.name.text)
      }
      ts.forEachChild(n, visitar)
    }
    visitar(sf)
  }

  /** O identificador é parâmetro de um callback passado a `[literais].some(...)` e afins? */
  const ehElementoDeListaLiteral = (id: ts.Identifier): boolean => {
    for (let p: ts.Node | undefined = id.parent; p; p = p.parent) {
      if (!ts.isArrowFunction(p) && !ts.isFunctionExpression(p)) continue
      const declara = p.parameters.some((par) => ts.isIdentifier(par.name) && par.name.text === id.text)
      if (!declara) continue
      const chamada = p.parent
      if (!chamada || !ts.isCallExpression(chamada) || !ts.isPropertyAccessExpression(chamada.expression)) return false
      if (!METODOS_DE_LISTA.has(chamada.expression.name.text)) return false
      const lista = chamada.expression.expression
      return ts.isArrayLiteralExpression(lista) && lista.elements.length > 0 && lista.elements.every(ehTextoLiteral)
    }
    return false
  }

  const ehTextoFixo = (e: ts.Expression | undefined): boolean => {
    if (!e) return false
    if (ehTextoLiteral(e)) return true
    if (ts.isIdentifier(e)) return constantesDeTexto.has(e.text) || ehElementoDeListaLiteral(e)
    return false
  }

  const achados: Casamento[] = []
  const registrar = (n: ts.Node) =>
    achados.push({
      linha: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
      texto: n.getText(sf).replace(/\s+/g, ' ').slice(0, 90),
    })
  const visitarChamadas = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const metodo = n.expression.name.text
      const receptor = n.expression.expression
      if (METODOS.has(metodo) && ehTextoFixo(n.arguments[0]) && leCampoDeErro(receptor)) registrar(n)
      else if (metodo === 'test' && ts.isRegularExpressionLiteral(receptor) && n.arguments[0] && leCampoDeErro(n.arguments[0])) registrar(n)
    }
    ts.forEachChild(n, visitarChamadas)
  }
  visitarChamadas(sf)
  return achados
}

function varrer(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) varrer(p, acc)
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts') && !/\.test\.tsx?$/.test(e.name)) acc.push(p)
  }
  return acc
}
const rel = (p: string) => relative(RAIZ, p).split(sep).join('/')

const ARQUIVOS = varrer(join(RAIZ, 'src'))
const ACHADOS = ARQUIVOS.map((p) => ({ arquivo: rel(p), casamentos: casamentosPorTexto(readFileSync(p, 'utf8'), p) })).filter(
  (a) => a.casamentos.length > 0 && !ISENTOS.has(a.arquivo),
)

describe('o detector de casamento por texto (guarda do próprio teste)', () => {
  it.each([
    ['m.includes literal', "function f(e: {message: string}){ const m = (e.message ?? '').toLowerCase(); return m.includes('duplicate key') }"],
    ['error.message.toLowerCase().includes', "function f(error: {message: string}){ return error.message.toLowerCase().includes('filiais_slug_key') }"],
    ['template sem interpolação', 'function f(mensagem: string){ return mensagem.includes(`backup deste import`) }'],
    ['regex .test sobre mensagem', 'function f(mensagem: string){ return /n[ãa]o encontrad/i.test(mensagem) }'],
    ['parâmetro msg', "function f(msg: string){ return msg.includes('restrito') }"],
    ['constante local de texto', "const FRASE = 'duplicate'\nfunction f(e: {message: string}){ return e.message.includes(FRASE) }"],
    ['lista literal com .some', "function f(e: {message: string}){ const m = e.message; return ['a', 'b'].some((x) => m.includes(x)) }"],
    ['.details e .hint', "function f(e: {details: string; hint: string}){ return e.details.startsWith('x') || e.hint.endsWith('y') }"],
  ])('casa: %s', (_n, fonte) => {
    expect(casamentosPorTexto(fonte).length).toBeGreaterThan(0)
  })
  it.each([
    ['constante nomeada da lista', 'function f(e: {message: string}){ return casa(e.message, MSG_SQL.transicaoInvalida) }'],
    ['nome de constraint tipado', "function f(e: {message: string}){ return casaConstraint(e.message, 'itens_nome_uidx') }"],
    ['texto que não é erro', "function f(nome: string){ return nome.includes('WAP') }"],
    ['lista que não é literal', 'function f(msg: string){ return DOMINIOS.some((d) => msg.includes(d.slice(1))) }'],
    ['comparação de code por igualdade', "function f(code: string){ return code === '23505' }"],
    ['comentário', "// m.includes('duplicate key')"],
  ])('não casa: %s', (_n, fonte) => {
    expect(casamentosPorTexto(fonte)).toEqual([])
  })
  it('a varredura enxerga o src', () => {
    expect(ARQUIVOS.length).toBeGreaterThan(200)
  })
})

describe('nenhum casamento de erro por texto solto fora de erros-do-banco.ts', () => {
  it('zero', () => {
    const fora = ACHADOS.flatMap((a) => a.casamentos.map((c) => `${a.arquivo}:${c.linha} ${c.texto}`))
    expect(
      fora,
      'Casamento de mensagem de erro por texto solto: nomeie a frase em src/lib/supabase/erros-do-banco.ts ' +
        '(MSG_SQL, CONSTRAINTS_TRADUZIDAS, FRASES_DO_MOTOR ou FRASES_DO_AUTH) e case por `casa`/`casaConstraint` — ' +
        'é assim que erros-do-banco-sql.test.ts a confere contra o SQL vivo.',
    ).toEqual([])
  })
})
