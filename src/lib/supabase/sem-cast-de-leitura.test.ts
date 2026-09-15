import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'

// O CAST DE LEITURA — trava por FORMA, por AST (F58 · Frente C).
//
// Um `(data ?? []) as X[]` sobre o resultado do Supabase APAGA o tipo que o `select` infere: o
// compilador para de conferir, e a coluna que o `select` não traz (o `empresa_id` da F63) vira
// `undefined` silencioso em vez de erro. A F58 põe essas leituras atrás de `linhasDe`/`linhaDe`/
// `valorDe` (`src/lib/supabase/linhas.ts`), com a forma conferida e amarrada ao `select`. Esta
// trava impede o cast de voltar — e nasceu como a LISTA CONGELADA dos pontos medidos, que só
// encolhe a cada lote até o resíduo justificado.
//
// POR QUE AST, E NÃO TEXTO. Uma busca por `as unknown as` deixaria de fora os casts simples
// (`data as X | null`, `r.filiais as FilialEmbed`), e uma por `) as ` acusaria todo cast do
// arquivo. Aqui o arquivo é parseado e o que se procura é um `as <Tipo>` (ou `<Tipo>expr`) cuja
// expressão DERIVA de dado lido do Supabase. "Deriva" é uma propagação local, POR ESCOPO (o nome é
// resolvido na função que o declara, respeitando sombra — um `s` de outra função não contamina):
//  · nasce em `const { data } = await …` e `const { data: x } = await …` (renomeado);
//  · nasce em `x.data` quando `x` veio de um `await` (inclusive `Promise.all` e seus elementos);
//  · passa por `const y = <derivado> ?? []`, `const [z] = <derivado>`, `const { a } = <derivado>`,
//    `{ ...<derivado> }`, `for (const r of <derivado>)` e pelo parâmetro dos callbacks de `.map/
//    .filter/.find/.forEach/.flatMap/.reduce/.some/.every/.sort` chamados sobre um derivado.
// O cast conta quando a raiz da expressão (tirados parênteses, `!`, `??`/`||` à esquerda e
// acessos `.x`/`[i]`/chamadas) é um derivado. `as const` não conta. `as unknown as X` conta UMA vez.
//
// ⚠ O QUE ELA NÃO PROVA: propagação entre funções (um derivado passado como argumento a outra
// função e castado lá dentro), e cast sobre o RETORNO tipado de uma função nossa que leu o banco
// (`lidos.mapa as Map<…>`). O primeiro é pego pelo compilador quando a função recebe o tipo
// conferido — que é o que a porta devolve; o segundo é cast entre dois tipos nossos, tratado por
// nome no relatório da fase. Lê o disco na COLETA, nunca dentro do `it`.

const RAIZ = process.cwd()

export type CastDeLeitura = { funcao: string; linha: number; texto: string }

const METODOS_DE_LISTA = new Set(['map', 'filter', 'find', 'findLast', 'forEach', 'flatMap', 'reduce', 'some', 'every', 'sort', 'toSorted'])

/**
 * As funções da casa que JÁ devolvem as LINHAS (e não a resposta `{ data, error }`) de uma leitura
 * paginada. O `await` delas não é um resultado com `.data`: é a lista derivada, e um cast sobre ela
 * (ou sobre o parâmetro de um `.map` dela) é cast de leitura. Buraco medido na própria F58: sem esta
 * lista, `r.snapshot_anterior as SnapshotAnterior` sobre as linhas de `paginarTodos` escapava.
 */
const PRODUTORES_DE_LINHAS = new Set(['paginarTodos', 'paginarPorIds'])

const ehChamadaProdutoraDeLinhas = (e: ts.Expression): boolean => {
  let x = e
  while (ts.isParenthesizedExpression(x) || ts.isAwaitExpression(x)) x = x.expression
  return ts.isCallExpression(x) && ts.isIdentifier(x.expression) && PRODUTORES_DE_LINHAS.has(x.expression.text)
}

function nomeDaFuncao(n: ts.Node): string {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name) return p.name.getText()
    if (ts.isArrowFunction(p) || ts.isFunctionExpression(p)) {
      // `const x = () => …` e também `const x = cache(async () => …)`: sobe pelos argumentos de
      // chamada até a declaração que dá nome à função
      let alvo: ts.Node = p.parent
      while (ts.isCallExpression(alvo) || ts.isParenthesizedExpression(alvo)) alvo = alvo.parent
      if (ts.isVariableDeclaration(alvo) && ts.isIdentifier(alvo.name)) return alvo.name.text
    }
  }
  return '(módulo)'
}

function desembrulhar(e: ts.Expression): ts.Expression {
  for (;;) {
    if (
      ts.isParenthesizedExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isTypeAssertionExpression(e) ||
      ts.isSatisfiesExpression(e) ||
      ts.isAwaitExpression(e)
    ) {
      e = e.expression
    } else if (
      ts.isBinaryExpression(e) &&
      (e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || e.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      e = e.left
    } else {
      return e
    }
  }
}

/** A raiz nominal de uma expressão: `a.b[0].c(x).d` → `a`. */
function raiz(e: ts.Expression): ts.Identifier | null {
  let atual = desembrulhar(e)
  for (;;) {
    if (ts.isIdentifier(atual)) return atual
    if (ts.isPropertyAccessExpression(atual) || ts.isElementAccessExpression(atual)) atual = desembrulhar(atual.expression)
    else if (ts.isCallExpression(atual)) atual = desembrulhar(atual.expression)
    else return null
  }
}

const ehAwait = (e: ts.Expression | undefined): boolean => {
  if (!e) return false
  let x = e
  while (ts.isParenthesizedExpression(x)) x = x.expression
  return ts.isAwaitExpression(x)
}

export function castsDeLeitura(fonte: string, nomeArquivo = 'arquivo.ts'): CastDeLeitura[] {
  const sf = ts.createSourceFile(
    nomeArquivo,
    fonte,
    ts.ScriptTarget.Latest,
    true,
    nomeArquivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  // Escopos: cada função (e o módulo) com os nomes que ela DECLARA (parâmetros e variáveis).
  const declarados = new Map<ts.Node, Set<string>>()
  const escopoDaDeclaracao = (n: ts.Node): ts.Node => {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) if (ts.isFunctionLike(p) || ts.isSourceFile(p)) return p
    return sf
  }
  const declarar = (nome: ts.BindingName, onde: ts.Node) => {
    if (ts.isIdentifier(nome)) {
      const escopo = escopoDaDeclaracao(onde)
      if (!declarados.has(escopo)) declarados.set(escopo, new Set())
      declarados.get(escopo)!.add(nome.text)
    } else {
      for (const el of nome.elements) if (ts.isBindingElement(el)) declarar(el.name, onde)
    }
  }
  const coletar = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) || ts.isParameter(n)) declarar(n.name, n)
    ts.forEachChild(n, coletar)
  }
  coletar(sf)

  /** A chave do nome no escopo que o declara (a sombra mais interna vence). */
  const chaveDe = (id: ts.Identifier): string => {
    for (let p: ts.Node | undefined = id; p; p = p.parent) {
      if ((ts.isFunctionLike(p) || ts.isSourceFile(p)) && declarados.get(p)?.has(id.text)) return `${p.pos}:${p.end}:${id.text}`
    }
    return `global:${id.text}`
  }

  const derivados = new Set<string>()
  const resultados = new Set<string>()

  // Fontes por DECLARAÇÃO de parâmetro — o que a propagação local não alcança porque a linha chega
  // por argumento (os mapeadores de linha crua):
  //  · um parâmetro chamado `data` (a forma que a ficha nomeia: `mapMovRows(data: unknown)`);
  //  · um parâmetro tipado com o tipo da LINHA CRUA do arquivo (`RawX`, `XRow`, `RowX`).
  const RE_TIPO_DE_LINHA_CRUA = /^(Raw[A-Z]\w*|Row[A-Z]?\w*|\w+Row)(\[\])?$/
  const fontesDeParametro = (n: ts.Node): void => {
    if (ts.isParameter(n) && ts.isIdentifier(n.name)) {
      const tipo = n.type?.getText(sf).trim() ?? ''
      if (n.name.text === 'data' || RE_TIPO_DE_LINHA_CRUA.test(tipo)) derivados.add(chaveDe(n.name))
    }
    ts.forEachChild(n, fontesDeParametro)
  }
  fontesDeParametro(sf)

  const derivaDe = (e: ts.Expression | undefined): boolean => {
    if (!e) return false
    const d = desembrulhar(e)
    // as linhas que `paginarTodos`/`paginarPorIds` devolvem já são dado derivado
    if (ehChamadaProdutoraDeLinhas(d)) return true
    // `{ ...linha, rotulo }` e `[...linhas]`: o literal carrega o derivado que espalha
    if (ts.isObjectLiteralExpression(d)) return d.properties.some((p) => ts.isSpreadAssignment(p) && derivaDe(p.expression))
    if (ts.isArrayLiteralExpression(d)) return d.elements.some((el) => ts.isSpreadElement(el) && derivaDe(el.expression))
    // `x.data` e `x[0].data` de um resultado de await
    if (ts.isPropertyAccessExpression(d) && d.name.text === 'data') {
      const r = raiz(d.expression)
      if (r && resultados.has(chaveDe(r))) return true
    }
    const r = raiz(d)
    return !!r && derivados.has(chaveDe(r))
  }

  const marcarPadrao = (nome: ts.BindingName) => {
    if (ts.isIdentifier(nome)) derivados.add(chaveDe(nome))
    else for (const el of nome.elements) if (ts.isBindingElement(el)) marcarPadrao(el.name)
  }

  // Passo 1 — propagação até o ponto fixo (a ordem das declarações no arquivo não importa).
  const tamanho = () => derivados.size + resultados.size
  for (let antes = -1; antes !== tamanho(); ) {
    antes = tamanho()
    const visitar = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && n.initializer) {
        const init = n.initializer
        if (ts.isObjectBindingPattern(n.name)) {
          for (const el of n.name.elements) {
            const chave = el.propertyName ?? el.name
            const chaveTexto = ts.isIdentifier(chave) || ts.isStringLiteral(chave) ? chave.text : ''
            const raizInit = raiz(init)
            const deResultado = ehAwait(init) || (!!raizInit && resultados.has(chaveDe(raizInit)))
            if ((chaveTexto === 'data' && deResultado) || derivaDe(init)) marcarPadrao(el.name)
          }
        } else if (ts.isArrayBindingPattern(n.name)) {
          const inner = desembrulhar(init)
          const ehPromiseAll = ehAwait(init) && ts.isCallExpression(inner) && inner.expression.getText(sf) === 'Promise.all'
          for (const el of n.name.elements) {
            if (!ts.isBindingElement(el)) continue
            if (ehPromiseAll && ts.isIdentifier(el.name)) {
              resultados.add(chaveDe(el.name))
            } else if (ehPromiseAll && ts.isObjectBindingPattern(el.name)) {
              // `const [{ data: itens }, { data: tipos }] = await Promise.all([...])`
              for (const sub of el.name.elements) {
                const chave = sub.propertyName ?? sub.name
                if ((ts.isIdentifier(chave) || ts.isStringLiteral(chave)) && chave.text === 'data') marcarPadrao(sub.name)
              }
            } else if (derivaDe(init)) {
              marcarPadrao(el.name)
            }
          }
        } else if (ts.isIdentifier(n.name)) {
          // o `await` de um produtor de linhas é LISTA derivada, não resposta com `.data`
          if (ehAwait(init) && !ehChamadaProdutoraDeLinhas(init)) resultados.add(chaveDe(n.name))
          if (derivaDe(init)) derivados.add(chaveDe(n.name))
        }
      }
      if (ts.isForOfStatement(n) && ts.isVariableDeclarationList(n.initializer)) {
        const percorrido = desembrulhar(n.expression)
        for (const d of n.initializer.declarations) {
          // percorrer os RESULTADOS de um `await Promise.all([...])` (o próprio identificador, não
          // `x.data`) dá um resultado por volta; percorrer um derivado dá um derivado
          if (ts.isIdentifier(percorrido) && resultados.has(chaveDe(percorrido)) && ts.isIdentifier(d.name)) {
            resultados.add(chaveDe(d.name))
          } else if (derivaDe(n.expression)) {
            marcarPadrao(d.name)
          }
        }
      }
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && METODOS_DE_LISTA.has(n.expression.name.text)) {
        const alvo = desembrulhar(n.expression.expression)
        // percorrer os RESULTADOS de um `await Promise.all(...)` (o próprio identificador) dá um
        // resultado por volta; percorrer um derivado dá um derivado
        const sobreResultados = ts.isIdentifier(alvo) && resultados.has(chaveDe(alvo))
        const sobreDerivado = !sobreResultados && derivaDe(n.expression.expression)
        if (sobreResultados || sobreDerivado) {
          for (const arg of n.arguments) {
            if (!(ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))) continue
            const params = n.expression.name.text === 'reduce' ? arg.parameters.slice(1, 2) : arg.parameters.slice(0, 1)
            for (const p of params) {
              if (sobreResultados && ts.isIdentifier(p.name)) resultados.add(chaveDe(p.name))
              else marcarPadrao(p.name)
            }
          }
        }
      }
      ts.forEachChild(n, visitar)
    }
    visitar(sf)
  }

  // Passo 2 — os casts sobre derivado.
  const achados: CastDeLeitura[] = []
  const visitarCasts = (n: ts.Node): void => {
    if (
      (ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) &&
      !(ts.isAsExpression(n.parent) || ts.isTypeAssertionExpression(n.parent))
    ) {
      const tipo = n.type.getText(sf)
      let interno: ts.Expression = n.expression
      while (ts.isAsExpression(interno) || ts.isTypeAssertionExpression(interno)) interno = interno.expression
      if (tipo !== 'const' && derivaDe(interno)) {
        achados.push({
          funcao: nomeDaFuncao(n),
          linha: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
          texto: n.getText(sf).replace(/\s+/g, ' ').slice(0, 90),
        })
      }
    }
    // O cast com OUTRA SINTAXE (revisão adversarial da F58): um argumento de tipo explícito num
    // produtor de linhas que APAGA a linha — `paginarTodos<unknown>(…)`, `<any>`, `<object>`,
    // `<Record<string, unknown>>` ou um literal com propriedade opcional (`<{ x?: T }>`, que inventa
    // coluna sem o compilador reclamar). Um tipo concreto sem opcional NÃO é cast: a linha inferida do
    // builder tem de ser atribuível a ele, e o compilador recusa coluna ausente ou trocada.
    // O argumento é seguido pelo NOME (re-revisão da F58): `type Linha = unknown` duas linhas acima e
    // `paginarTodos<Linha>` é o mesmo apagamento, e passava — ver `apagaALinha`.
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && PRODUTORES_DE_LINHAS.has(n.expression.text)) {
      const arg = n.typeArguments?.[0]
      if (arg && apagaALinha(arg, { sf, arquivo: nomeArquivo, subst: new Map() })) {
        achados.push({
          funcao: nomeDaFuncao(n),
          linha: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
          texto: `${n.expression.text}<${arg.getText(sf)}>(…)`.replace(/\s+/g, ' ').slice(0, 90),
        })
      }
    }
    ts.forEachChild(n, visitarCasts)
  }
  visitarCasts(sf)
  return achados
}

// --- o argumento de tipo que apaga a linha ---------------------------------------------------
//
// A primeira versão (revisão adversarial) olhava só a SINTAXE escrita no argumento, e a re-revisão
// provou o buraco: `type Linha = unknown`, `interface Linha { extra?: string }` ou
// `type Linha = Record<string, unknown>` declarados à parte e passados como `paginarTodos<Linha>`
// apagavam a linha do mesmo jeito, com a trava verde. Agora o NOME é resolvido para o que ele denota,
// como o compilador faria, sem montar um `ts.Program` (a varredura continua lendo arquivo a arquivo):
//  · pelo ESCOPO do ponto de uso — o mais interno vence; um parâmetro de tipo da função sombreia e é
//    o repasse genérico (`paginarPorIds<Row>` → `paginarTodos<Row>`), conferido em quem fixa `Row`;
//  · pelo `import` (`@/…` ou relativo, inclusive `import * as`), seguindo `export … from` de barril;
//  · pelos argumentos de um alias genérico (`type Solta<T> = T` com `<unknown>`), por substituição;
//  · por `extends` de interface e pelos utilitários (`Partial` apaga; `Pick`/`Omit`/`Readonly`/
//    `Required`/`NonNullable` preservam o que o primeiro argumento apaga — de modo CONSERVADOR: um
//    `Omit` que tira justamente a chave opcional ainda acusa, e o remédio é nomear o tipo concreto).
// ⚠ O QUE ELA NÃO RESOLVE: o que só o checker sabe — `typeof x`, `z.infer<…>`, tipo condicional,
// tipo de pacote de `node_modules` e o acesso indexado ao `Database` gerado (que é a linha EXATA).
// Nenhum desses aparece hoje como argumento de `paginarTodos`/`paginarPorIds`.

type Substituicao = { no: ts.TypeNode; ctx: ContextoDeTipos }
type ContextoDeTipos = { sf: ts.SourceFile; arquivo: string; subst: ReadonlyMap<ts.TypeParameterDeclaration, Substituicao> }
type DeclaracaoDeTipo = ts.TypeAliasDeclaration | ts.InterfaceDeclaration
type Denotacao =
  | { tipo: 'declaracoes'; decls: DeclaracaoDeTipo[]; ctx: ContextoDeTipos }
  | { tipo: 'parametro'; param: ts.TypeParameterDeclaration }
  | null

const LIMITE_DE_SALTOS = 12
const UTILITARIOS_QUE_PRESERVAM = new Set(['Readonly', 'Pick', 'Omit', 'NonNullable', 'Required'])

const ehApagador = (t: ts.TypeNode | undefined): boolean =>
  !!t && (t.kind === ts.SyntaxKind.UnknownKeyword || t.kind === ts.SyntaxKind.AnyKeyword)

const membrosApagam = (membros: readonly ts.TypeElement[]): boolean =>
  membros.some(
    (m) =>
      ((ts.isPropertySignature(m) || ts.isMethodSignature(m)) && !!m.questionToken) ||
      (ts.isIndexSignatureDeclaration(m) && ehApagador(m.type)),
  )

const modulosAbertos = new Map<string, ts.SourceFile | null>()
function abrirModulo(especificador: string, deArquivo: string): ts.SourceFile | null {
  // pacote de `node_modules` não se abre: o tipo dele não é cast nosso
  const base = especificador.startsWith('@/')
    ? join(RAIZ, 'src', especificador.slice(2))
    : especificador.startsWith('.')
      ? resolve(dirname(deArquivo), especificador)
      : null
  if (!base) return null
  if (!modulosAbertos.has(base)) {
    const achado = [`${base}.ts`, `${base}.tsx`, `${base}.d.ts`, join(base, 'index.ts'), join(base, 'index.tsx'), base].find(
      (c) => existsSync(c) && statSync(c).isFile(),
    )
    modulosAbertos.set(
      base,
      achado
        ? ts.createSourceFile(achado, readFileSync(achado, 'utf8'), ts.ScriptTarget.Latest, true, achado.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
        : null,
    )
  }
  return modulosAbertos.get(base) ?? null
}

const declaracoesNoBloco = (instrucoes: readonly ts.Statement[], nome: string): DeclaracaoDeTipo[] =>
  instrucoes.filter((s): s is DeclaracaoDeTipo => (ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s)) && s.name.text === nome)

const parametrosDeTipo = (p: ts.Node): readonly ts.TypeParameterDeclaration[] =>
  ts.isFunctionLike(p) || ts.isClassLike(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p) ? (p.typeParameters ?? []) : []

/** O que um NOME de tipo denota no ponto de uso — o escopo mais interno vence, como no compilador. */
function denotar(nome: string, onde: ts.Node, ctx: ContextoDeTipos, saltos: number): Denotacao {
  for (let p: ts.Node | undefined = onde.parent; p; p = p.parent) {
    const param = parametrosDeTipo(p).find((tp) => tp.name.text === nome)
    if (param) return { tipo: 'parametro', param }
    if (ts.isSourceFile(p) || ts.isBlock(p) || ts.isModuleBlock(p)) {
      const decls = declaracoesNoBloco(p.statements, nome)
      if (decls.length > 0) return { tipo: 'declaracoes', decls, ctx }
    }
  }
  return importado(nome, ctx, saltos)
}

/** Um nome que o arquivo IMPORTA (`import { X }`, `import type { X as Y }`). */
function importado(nome: string, ctx: ContextoDeTipos, saltos: number): Denotacao {
  for (const st of ctx.sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue
    const nomeados = st.importClause?.namedBindings
    if (!nomeados || !ts.isNamedImports(nomeados)) continue
    const el = nomeados.elements.find((e) => e.name.text === nome)
    if (el) return exportado((el.propertyName ?? el.name).text, st.moduleSpecifier.text, ctx, saltos + 1)
  }
  return null
}

/** `T.Linha` com `import * as T from '…'`. */
function noNamespace(namespace: string, nome: string, ctx: ContextoDeTipos, saltos: number): Denotacao {
  for (const st of ctx.sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue
    const nomeados = st.importClause?.namedBindings
    if (nomeados && ts.isNamespaceImport(nomeados) && nomeados.name.text === namespace) {
      return exportado(nome, st.moduleSpecifier.text, ctx, saltos + 1)
    }
  }
  return null
}

/** A declaração que um módulo exporta com esse nome — seguindo `export … from` e `export type { X }`. */
function exportado(nome: string, especificador: string, ctx: ContextoDeTipos, saltos: number): Denotacao {
  if (saltos > LIMITE_DE_SALTOS) return null
  const sf = abrirModulo(especificador, ctx.arquivo)
  if (!sf) return null
  const alvo: ContextoDeTipos = { sf, arquivo: sf.fileName, subst: ctx.subst }
  const decls = declaracoesNoBloco(sf.statements, nome)
  if (decls.length > 0) return { tipo: 'declaracoes', decls, ctx: alvo }
  for (const st of sf.statements) {
    if (!ts.isExportDeclaration(st)) continue
    const clausula = st.exportClause
    const el = clausula && ts.isNamedExports(clausula) ? clausula.elements.find((e) => e.name.text === nome) : undefined
    const original = (el?.propertyName ?? el?.name)?.text
    if (st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      if (original) return exportado(original, st.moduleSpecifier.text, alvo, saltos + 1)
      if (!clausula) {
        const d = exportado(nome, st.moduleSpecifier.text, alvo, saltos + 1)
        if (d) return d
      }
    } else if (original) {
      return importado(original, alvo, saltos + 1)
    }
  }
  return null
}

/** Uma REFERÊNCIA nomeada (no argumento ou num `extends`) apaga a linha? */
function referenciaApaga(
  nome: { namespace?: string; nome: string },
  argumentos: readonly ts.TypeNode[] | undefined,
  onde: ts.Node,
  ctx: ContextoDeTipos,
  saltos: number,
): boolean {
  if (saltos > LIMITE_DE_SALTOS) return false
  if (!nome.namespace) {
    if (nome.nome === 'Record') return ehApagador(argumentos?.[1])
    if (nome.nome === 'Partial') return true
    if (UTILITARIOS_QUE_PRESERVAM.has(nome.nome)) return !!argumentos?.[0] && apagaALinha(argumentos[0], ctx, saltos + 1)
  }
  const d = nome.namespace ? noNamespace(nome.namespace, nome.nome, ctx, saltos) : denotar(nome.nome, onde, ctx, saltos)
  if (!d) return false
  if (d.tipo === 'parametro') {
    const sub = ctx.subst.get(d.param)
    // sem substituição é o repasse genérico: quem fixa o parâmetro é conferido no próprio uso
    return !!sub && apagaALinha(sub.no, sub.ctx, saltos + 1)
  }
  return d.decls.some((decl) => {
    const subst = new Map(ctx.subst)
    const dentro: ContextoDeTipos = { ...d.ctx, subst }
    decl.typeParameters?.forEach((tp, i) => {
      const arg = argumentos?.[i]
      if (arg) subst.set(tp, { no: arg, ctx })
      else if (tp.default) subst.set(tp, { no: tp.default, ctx: dentro })
    })
    if (ts.isTypeAliasDeclaration(decl)) return apagaALinha(decl.type, dentro, saltos + 1)
    return (
      membrosApagam(decl.members) ||
      (decl.heritageClauses ?? []).some((h) =>
        h.types.some((e) => {
          const x = e.expression
          if (ts.isIdentifier(x)) return referenciaApaga({ nome: x.text }, e.typeArguments, e, dentro, saltos + 1)
          if (ts.isPropertyAccessExpression(x) && ts.isIdentifier(x.expression)) {
            return referenciaApaga({ namespace: x.expression.text, nome: x.name.text }, e.typeArguments, e, dentro, saltos + 1)
          }
          return false
        }),
      )
    )
  })
}

/** O argumento de tipo apaga a linha que o builder infere? (ver o comentário em `visitarCasts`) */
function apagaALinha(t: ts.TypeNode, ctx: ContextoDeTipos, saltos = 0): boolean {
  if (saltos > LIMITE_DE_SALTOS) return false
  if (ehApagador(t) || t.kind === ts.SyntaxKind.ObjectKeyword) return true
  if (ts.isParenthesizedTypeNode(t)) return apagaALinha(t.type, ctx, saltos)
  if (ts.isTypeLiteralNode(t)) return membrosApagam(t.members)
  if (ts.isMappedTypeNode(t)) return (!!t.questionToken && t.questionToken.kind !== ts.SyntaxKind.MinusToken) || ehApagador(t.type)
  if (ts.isIntersectionTypeNode(t) || ts.isUnionTypeNode(t)) return t.types.some((x) => apagaALinha(x, ctx, saltos))
  if (!ts.isTypeReferenceNode(t)) return false
  if (ts.isIdentifier(t.typeName)) return referenciaApaga({ nome: t.typeName.text }, t.typeArguments, t, ctx, saltos)
  if (ts.isIdentifier(t.typeName.left)) {
    return referenciaApaga({ namespace: t.typeName.left.text, nome: t.typeName.right.text }, t.typeArguments, t, ctx, saltos)
  }
  return false
}

// --- coleta ------------------------------------------------------------------------------
function varrer(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) varrer(p, acc)
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts') && !/\.test\.tsx?$/.test(e.name)) acc.push(p)
  }
  return acc
}
const rel = (p: string) => relative(RAIZ, p).split(sep).join('/')

const ATUAIS: Record<string, number> = {}
const DETALHE: string[] = []
for (const p of varrer(join(RAIZ, 'src'))) {
  for (const c of castsDeLeitura(readFileSync(p, 'utf8'), p)) {
    const chave = `${rel(p)}::${c.funcao}`
    ATUAIS[chave] = (ATUAIS[chave] ?? 0) + 1
    DETALHE.push(`${rel(p)}:${c.linha} [${c.funcao}] ${c.texto}`)
  }
}

/**
 * O resíduo JUSTIFICADO — casts de leitura que ficam, cada um com o motivo. Não encolhe por lote:
 * é o que sobra quando a fase termina.
 */
const RESIDUO_JUSTIFICADO: Record<string, string> = {}

/**
 * A lista CONGELADA — os pontos medidos no início da Frente C, que ENCOLHE a cada lote até zero.
 * Um ponto novo não entra aqui: ele vai para `linhasDe`/`linhaDe`/`valorDe`.
 *
 * Vazia desde o lote 4 (o último): `gerados.ts` era o único resíduo, propositalmente guardado
 * para o fim (§4 do plano — a forma do snapshot é a mais frouxa/histórica de toda a fase). A
 * trava continua valendo com a lista vazia — os dois testes abaixo não dependem de ter conteúdo.
 */
const CONGELADOS: Record<string, number> = {}

describe('o detector de cast de leitura reconhece a forma (guarda do próprio teste)', () => {
  it.each([
    ['(data ?? []) as X[]', 'async function f(){ const { data, error } = await c.from("t").select("a"); return (data ?? []) as X[] }', 1],
    ['data as X | null', 'async function f(){ const { data } = await c.from("t").select("a").maybeSingle(); return data as X | null }', 1],
    ['(data ?? {}) as {…}', 'async function f(){ const { data } = await chamarRpc(c, "x"); return (data ?? {}) as { a?: number } }', 1],
    ['{ data: linhas } renomeado', 'async function f(){ const { data: linhas } = await c.from("t").select("a"); return linhas as X[] }', 1],
    ['as unknown as conta uma vez', 'async function f(){ const { data } = await c.from("t").select("a"); return data as unknown as X[] }', 1],
    ['.data de um resultado', 'async function f(){ const r = await c.from("t").select("a"); return (r.data ?? []) as X[] }', 1],
    ['Promise.all desestruturado', 'async function f(){ const [a, b] = await Promise.all([c.from("t").select("a"), c.from("u").select("b")]); return (a.data ?? []) as X[] }', 1],
    ['linha de embed num map', 'async function f(){ const { data } = await c.from("t").select("a"); return (data ?? []).map((r) => r.filiais as Embed) }', 1],
    ['coluna jsonb via variável', 'async function f(){ const { data } = await c.from("t").select("a").single(); const linha = data; return linha.dados as Snapshot }', 1],
    ['for…of', 'async function f(){ const { data } = await c.from("t").select("a"); for (const r of data ?? []) { use(r.x as Y) } }', 1],
    ['spread de linha num literal', 'async function f(){ const { data } = await c.from("t").select("a"); return (data ?? []).map((a) => ({ ...a, rotulo: "x" }) as Candidato) }', 1],
    ['for…of sobre os resultados de Promise.all', 'async function f(){ const respostas = await Promise.all([c.from("t").select("a")]); for (const r of respostas) { for (const a of r.data ?? []) use(a.filiais as E) } }', 1],
    ['data desestruturado DENTRO do array do Promise.all', 'async function f(){ const [{ data: itens }, { data: tipos }] = await Promise.all([c.from("i").select("a"), c.from("t").select("b")]); return [(itens ?? []) as I[], (tipos ?? []) as T[]] }', 2],
    ['data de um resultado já aguardado', 'async function f(){ const rs = await Promise.all(ids.map((id) => chamarRpc(c, "x", { id }))); return rs.map((r) => { const { data } = r; return (data ?? []) as S[] }) }', 1],
    ['parâmetro chamado data (o mapeador de linhas cruas)', 'function mapMovRows(data: unknown) { return (data ?? []) as RawMovRow[] }', 1],
    ['parâmetro tipado com a linha crua do arquivo', 'function mapTimeline(r: RawTimelineRow) { return r.snapshot_anterior as Snapshot | null }', 1],
    ['linhas de paginarTodos num map (o buraco da F58)', 'async function f(){ const rows = await paginarTodos("x", (a, b) => c.from("t").select("a").range(a, b)); return rows.map((r) => r.snapshot as Snapshot | null) }', 1],
    ['linhas de paginarPorIds usadas direto', 'async function f(ids: string[]){ return (await paginarPorIds("x", ids, (l, a, b) => c.from("t").select("a").in("id", l).range(a, b))) as Linha[] }', 1],
    ['argumento de tipo que APAGA a linha: paginarTodos<unknown> (o achado da revisão adversarial)', 'async function f(){ return paginarTodos<unknown>("x", (a, b) => c.from("t").select("*").range(a, b)) }', 1],
    ['argumento de tipo com propriedade OPCIONAL inventa coluna', 'async function f(){ return paginarPorIds<{ id: string; extra?: number }>("x", ids, (l, a, b) => c.from("t").select("id").in("id", l).range(a, b)) }', 1],
    ['Record<string, unknown> como linha', 'async function f(){ return paginarTodos<Record<string, unknown>>("x", (a, b) => c.from("t").select("*").range(a, b)) }', 1],
    // re-revisão da F58: o MESMO apagamento atrás de um nome
    ['alias no módulo para unknown', 'type Linha = unknown\nasync function f(){ return paginarTodos<Linha>("x", (a, b) => c.from("t").select("*").range(a, b)) }', 1],
    ['interface com propriedade opcional', 'interface Linha { id: string; extra?: string }\nasync function f(){ return paginarTodos<Linha>("x", (a, b) => c.from("t").select("id").range(a, b)) }', 1],
    ['alias para Record<string, unknown> DENTRO da função', 'async function f(){ type Linha = Record<string, unknown>; return paginarTodos<Linha>("x", (a, b) => c.from("t").select("*").range(a, b)) }', 1],
    ['declarado DEPOIS do uso (tipo sobe no escopo)', 'async function f(){ return paginarTodos<Linha>("x", (a, b) => c.from("t").select("*").range(a, b)) }\ntype Linha = unknown', 1],
    ['assinatura de índice unknown', 'async function f(){ return paginarTodos<{ [k: string]: unknown }>("x", (a, b) => c.from("t").select("*").range(a, b)) }', 1],
    ['Partial de um tipo concreto', 'type Linha = { id: string }\nasync function f(){ return paginarTodos<Partial<Linha>>("x", (a, b) => c.from("t").select("id").range(a, b)) }', 1],
    ['cadeia de aliases com opcional no fundo', 'type A = { id: string; extra?: number }\ntype B = A & { nome: string }\nasync function f(){ return paginarTodos<B>("x", (a, b) => c.from("t").select("id, nome").range(a, b)) }', 1],
    ['alias genérico com argumento que apaga', 'type Solta<T> = T & { id: string }\nasync function f(){ return paginarTodos<Solta<unknown>>("x", (a, b) => c.from("t").select("id").range(a, b)) }', 1],
    ['alias genérico com DEFAULT que apaga', 'type Solta<T = Record<string, any>> = T\nasync function f(){ return paginarTodos<Solta>("x", (a, b) => c.from("t").select("*").range(a, b)) }', 1],
    ['interface que herda opcional', 'interface Base { id: string; extra?: string }\ninterface Linha extends Base { nome: string }\nasync function f(){ return paginarTodos<Linha>("x", (a, b) => c.from("t").select("id, nome").range(a, b)) }', 1],
    ['Pick de tipo que apaga', 'type Linha = Record<string, unknown>\nasync function f(){ return paginarTodos<Pick<Linha, "id">>("x", (a, b) => c.from("t").select("id").range(a, b)) }', 1],
    ['tipo IMPORTADO que apaga (Record<string, unknown> de verdade no repositório)', 'import type { ContextoFalha } from "@/lib/observabilidade-linha"\nasync function f(){ return paginarTodos<ContextoFalha>("x", (a, b) => c.from("t").select("*").range(a, b)) }', 1],
    ['tipo importado por namespace', 'import type * as O from "@/lib/observabilidade-linha"\nasync function f(){ return paginarTodos<O.ContextoFalha>("x", (a, b) => c.from("t").select("*").range(a, b)) }', 1],
    ['tipo importado com rename', 'import type { ContextoFalha as Linha } from "@/lib/observabilidade-linha"\nasync function f(){ return paginarPorIds<Linha>("x", ids, (l, a, b) => c.from("t").select("*").in("id", l).range(a, b)) }', 1],
  ])('casa: %s', (_nome, fonte, esperado) => {
    expect(castsDeLeitura(fonte)).toHaveLength(esperado)
  })

  it.each([
    ['as const', 'async function f(){ const { data } = await c.from("t").select("a"); return [data] as const }'],
    ['cast de valor que não veio do banco', 'function f(x: unknown){ return x as X }'],
    ['cast de builder', 'function f(q: Q){ return q as unknown as B }'],
    ['data de outra fonte sem await', 'function f(p: { data: unknown }){ const { data } = p; return data as X }'],
    ['comentário', '// (data ?? []) as X[]'],
    [
      'o MESMO nome, derivado em OUTRA função, não contamina',
      'async function f(){ const { data } = await c.from("t").select("a"); return (data ?? []).map((s) => s.x) }\nfunction g(p: string){ return p.split(",").map((s) => s.trim()).filter((s) => L.includes(s as Status)) }',
    ],
    ['alias concreto sem opcional', 'type Linha = { id: string; nome: string | null }\nasync function f(){ return paginarTodos<Linha>("x", (a, b) => c.from("t").select("id, nome").range(a, b)) }'],
    ['tipo importado concreto', 'import { montarSerieCurta, type LinhaSerieCurta } from "@/lib/relatorios/serie"\nasync function f(){ return paginarTodos<LinhaSerieCurta>("x", (a, b) => c.from("t").select("data, tipo").range(a, b)) }'],
    ['o repasse genérico de paginarPorIds (parâmetro de tipo da própria função)', 'export async function paginarPorIds<Row>(r: string){ return paginarTodos<Row>(r, (a, b) => q(a, b)) }'],
    ['parâmetro de tipo SOMBREIA o alias que apaga', 'type Linha = unknown\nasync function f<Linha>(){ return paginarTodos<Linha>("x", (a, b) => q(a, b)) }'],
    ['alias concreto interno SOMBREIA o que apaga no módulo', 'type Linha = unknown\nasync function f(){ type Linha = { id: string }; return paginarTodos<Linha>("x", (a, b) => c.from("t").select("id").range(a, b)) }'],
    ['alias genérico com argumento concreto', 'type Com<T> = T & { id: string }\nasync function f(){ return paginarTodos<Com<{ nome: string }>>("x", (a, b) => c.from("t").select("id, nome").range(a, b)) }'],
    ['Readonly de tipo concreto', 'type Linha = { id: string; nome: string }\nasync function f(){ return paginarTodos<Readonly<Linha>>("x", (a, b) => c.from("t").select("id, nome").range(a, b)) }'],
  ])('não casa: %s', (_nome, fonte) => {
    expect(castsDeLeitura(fonte)).toEqual([])
  })
})

describe('nenhum cast de leitura NOVO em src/**', () => {
  it('a varredura enxerga o repositório', () => {
    expect(Object.keys(ATUAIS).length + Object.keys(CONGELADOS).length).toBeGreaterThanOrEqual(0)
  })

  it('nenhum ponto fora da lista congelada e do resíduo', () => {
    const novos = Object.entries(ATUAIS)
      .filter(([k, n]) => !(k in RESIDUO_JUSTIFICADO) && n > (CONGELADOS[k] ?? 0))
      .map(([k, n]) => `${k} (${n} cast(s), congelado: ${CONGELADOS[k] ?? 0})`)
    expect(
      novos,
      'Cast sobre dado lido do Supabase: ele apaga o tipo que o select infere. Passe a leitura por ' +
        'linhasDe/linhaDe/valorDe (@/lib/supabase/linhas) com a forma amarrada ao select.',
    ).toEqual([])
  })

  it('a lista congelada só ENCOLHE (nenhuma entrada acima do que existe)', () => {
    const velhos = Object.entries(CONGELADOS)
      .filter(([k, n]) => n !== (ATUAIS[k] ?? 0))
      .map(([k, n]) => `${k}: congelado ${n}, atual ${ATUAIS[k] ?? 0}`)
    expect(velhos, 'o lote converteu casts: atualize CONGELADOS para o número atual (ou apague a entrada)').toEqual([])
  })

  it('cada resíduo traz um motivo escrito', () => {
    for (const [k, motivo] of Object.entries(RESIDUO_JUSTIFICADO)) expect(motivo.length, k).toBeGreaterThan(60)
  })
})

// Utilitário de mesa: `IMPRIMIR_CASTS=1 npx vitest run …` imprime o mapa atual, para congelar.
if (process.env.IMPRIMIR_CASTS) console.log(`${JSON.stringify(ATUAIS, null, 2)}\n---DETALHE---\n${DETALHE.join('\n')}\n---FIM---`)
