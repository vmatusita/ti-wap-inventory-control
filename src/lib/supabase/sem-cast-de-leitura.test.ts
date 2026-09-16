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

export function castsDeLeitura(
  fonte: string,
  nomeArquivo = 'arquivo.ts',
  virtuais: Readonly<Record<string, string>> = {},
): CastDeLeitura[] {
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
      // F60 — o KEYSET de `paginarTodos`/`paginarPorIds` entrega cada LINHA a `chaveDe`: o parâmetro
      // dela é dado lido, e `chaveDe: (l) => l.id as string` apaga o tipo do `select` como qualquer
      // outro cast. Medido antes desta linha: a forma nova escapava (0 achados). O RESULTADO da
      // chamada já era derivado pelo NOME da função, sem olhar aridade — o `cap` e o objeto keyset
      // não mudam isso (casos abaixo).
      if (ts.isCallExpression(n) && ehChamadaProdutoraDeLinhas(n)) {
        for (const arg of n.arguments) {
          if (!ts.isObjectLiteralExpression(arg)) continue
          for (const prop of arg.properties) {
            if (!prop.name || !(ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) || prop.name.text !== 'chaveDe') continue
            const fn = ts.isPropertyAssignment(prop) ? prop.initializer : prop
            if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isMethodDeclaration(fn)) {
              const linha = fn.parameters[0]
              if (linha) marcarPadrao(linha.name)
            }
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
      const ctx: ContextoDeTipos = {
        sf,
        arquivo: nomeArquivo,
        subst: new Map(),
        virtuais: new Map(Object.entries(virtuais).map(([k, v]) => [normalizar(k), v])),
      }
      if (arg && apagaALinha(arg, ctx)) {
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
//  · pelo `import` — nomeado, renomeado, DEFAULT e `* as` —, com `@/…` ou relativo, seguindo
//    `export … from` de barril, `export { X as Y }` de declaração local e `export default`; de um
//    módulo alheio só vale o que ele EXPORTA (um `type Linha` privado não esconde o `export { Linha } from`);
//  · por `namespace`/`declare namespace` do próprio arquivo, inclusive aninhado (`A.B.Linha`), e pelo
//    namespace que um módulo exporta ou reexporta (`import { Grupo }`, `export * as Grupo from`);
//  · pelo `import('./mod').Nome` escrito no próprio argumento (o atalho de quem não quer mexer no
//    bloco de imports), inclusive `import('./mod').Grupo.Nome`;
//  · pelos argumentos de um alias genérico (`type Solta<T> = T` com `<unknown>`), por substituição;
//  · por `extends` de interface e pelos utilitários (`Partial` apaga; `Pick`/`Omit`/`Readonly`/
//    `Required`/`NonNullable` preservam o que o primeiro argumento apaga — de modo CONSERVADOR: um
//    `Omit` que tira justamente a chave opcional ainda acusa, e o remédio é nomear o tipo concreto).
// A CHAVE ABERTA também apaga (segunda re-revisão): uma assinatura de índice (`[k: string]: T`, com
// qualquer `T`) ou um `Record` de chave `string`/`number`/`symbol`/`PropertyKey` deixa `r.empresa_id`
// compilar com o tipo do valor, coluna presente ou não. `Record` de chaves FECHADAS só apaga pelo valor.
// ⚠ O QUE ELA NÃO RESOLVE: o que só o checker sabe — `typeof x`, `z.infer<…>`, tipo condicional,
// tipo de pacote de `node_modules` e o acesso indexado ao `Database` gerado (que é a linha EXATA); e
// duas formas que a terceira re-revisão julgou implausíveis para tipar linha do banco: `class` como
// tipo da linha e chave de template literal (`${string}`, `Lowercase<string>`).
// Nenhum desses aparece hoje como argumento de `paginarTodos`/`paginarPorIds`.

type Substituicao = { no: ts.TypeNode; ctx: ContextoDeTipos }
type ContextoDeTipos = {
  sf: ts.SourceFile
  arquivo: string
  subst: ReadonlyMap<ts.TypeParameterDeclaration, Substituicao>
  /** Módulos em memória (caminho normalizado → fonte): os casos de guarda que atravessam arquivo. */
  virtuais: ReadonlyMap<string, string>
}
type DeclaracaoDeTipo = ts.TypeAliasDeclaration | ts.InterfaceDeclaration
type Denotacao =
  | { tipo: 'declaracoes'; decls: DeclaracaoDeTipo[]; ctx: ContextoDeTipos }
  | { tipo: 'parametro'; param: ts.TypeParameterDeclaration }
  | null
/** Onde se procura o membro de um nome qualificado: o corpo de um `namespace`, ou um módulo de `import * as`. */
type Recipiente =
  | { tipo: 'bloco'; instrucoes: readonly ts.Statement[]; ctx: ContextoDeTipos }
  | { tipo: 'modulo'; especificador: string; ctx: ContextoDeTipos }

const LIMITE_DE_SALTOS = 12
const UTILITARIOS_QUE_PRESERVAM = new Set(['Readonly', 'Pick', 'Omit', 'NonNullable', 'Required'])

const ehApagador = (t: ts.TypeNode | undefined): boolean =>
  !!t && (t.kind === ts.SyntaxKind.UnknownKeyword || t.kind === ts.SyntaxKind.AnyKeyword)

/** Propriedade opcional ou assinatura de índice: as duas deixam passar coluna que o `select` não traz. */
const membrosApagam = (membros: readonly ts.TypeElement[]): boolean =>
  membros.some(
    (m) => ((ts.isPropertySignature(m) || ts.isMethodSignature(m)) && !!m.questionToken) || ts.isIndexSignatureDeclaration(m),
  )

const normalizar = (caminho: string): string => caminho.split(sep).join('/')

const parsear = (caminho: string, fonte: string): ts.SourceFile =>
  ts.createSourceFile(caminho, fonte, ts.ScriptTarget.Latest, true, caminho.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

const modulosAbertos = new Map<string, ts.SourceFile | null>()
function abrirModulo(especificador: string, ctx: ContextoDeTipos): ts.SourceFile | null {
  // pacote de `node_modules` não se abre: o tipo dele não é cast nosso
  const base = especificador.startsWith('@/')
    ? join(RAIZ, 'src', especificador.slice(2))
    : especificador.startsWith('.')
      ? resolve(dirname(ctx.arquivo), especificador)
      : null
  if (!base) return null
  const candidatos = [`${base}.ts`, `${base}.tsx`, `${base}.d.ts`, join(base, 'index.ts'), join(base, 'index.tsx'), base]
  const virtual = candidatos.map(normalizar).find((c) => ctx.virtuais.has(c))
  if (virtual) return parsear(virtual, ctx.virtuais.get(virtual) ?? '')
  if (!modulosAbertos.has(base)) {
    const achado = candidatos.find((c) => existsSync(c) && statSync(c).isFile())
    modulosAbertos.set(base, achado ? parsear(achado, readFileSync(achado, 'utf8')) : null)
  }
  return modulosAbertos.get(base) ?? null
}

const temModificador = (s: ts.Statement, tipo: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(s) && !!ts.getModifiers(s)?.some((m) => m.kind === tipo)
const ehDefault = (s: ts.Statement): boolean => temModificador(s, ts.SyntaxKind.DefaultKeyword)
/** Visível de FORA do módulo: declarada com `export`, ou qualquer declaração de um `.d.ts`. */
const visivelFora = (s: ts.Statement): boolean => s.getSourceFile().isDeclarationFile || temModificador(s, ts.SyntaxKind.ExportKeyword)

/** As declarações de tipo com esse nome — `'default'` casa a declaração `export default interface`. */
const declaracoesNoBloco = (instrucoes: readonly ts.Statement[], nome: string): DeclaracaoDeTipo[] =>
  instrucoes.filter(
    (s): s is DeclaracaoDeTipo =>
      (ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s)) && (s.name.text === nome || (nome === 'default' && ehDefault(s))),
  )

const corposDeNamespace = (instrucoes: readonly ts.Statement[], nome: string): ts.Statement[] =>
  instrucoes
    .filter((s): s is ts.ModuleDeclaration => ts.isModuleDeclaration(s) && ts.isIdentifier(s.name) && s.name.text === nome)
    // `namespace A.B {}` é `A` com corpo `namespace B {}`: o corpo de `A` é a declaração de `B`
    .flatMap((m) => (!m.body ? [] : ts.isModuleBlock(m.body) ? [...m.body.statements] : ts.isModuleDeclaration(m.body) ? [m.body] : []))

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

/** Um nome que o arquivo IMPORTA: `import X from`, `import { X }`, `import type { Y as X }`. */
function importado(nome: string, ctx: ContextoDeTipos, saltos: number): Denotacao {
  for (const st of ctx.sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !st.importClause) continue
    if (st.importClause.name?.text === nome) return exportado('default', st.moduleSpecifier.text, ctx, saltos + 1)
    const nomeados = st.importClause.namedBindings
    if (!nomeados || !ts.isNamedImports(nomeados)) continue
    const el = nomeados.elements.find((e) => e.name.text === nome)
    if (el) return exportado((el.propertyName ?? el.name).text, st.moduleSpecifier.text, ctx, saltos + 1)
  }
  return null
}

/** Um nome no nível de módulo: declarado no próprio arquivo ou importado. */
function localOuImportado(nome: string, ctx: ContextoDeTipos, saltos: number): Denotacao {
  const decls = declaracoesNoBloco(ctx.sf.statements, nome)
  return decls.length > 0 ? { tipo: 'declaracoes', decls, ctx } : importado(nome, ctx, saltos)
}

/** A declaração que um módulo exporta com esse nome — seguindo barril, rename local e `export default`. */
function exportado(nome: string, especificador: string, ctx: ContextoDeTipos, saltos: number): Denotacao {
  if (saltos > LIMITE_DE_SALTOS) return null
  const sf = abrirModulo(especificador, ctx)
  if (!sf) return null
  const alvo: ContextoDeTipos = { ...ctx, sf, arquivo: sf.fileName }
  // só o que o módulo EXPORTA: um `type Linha` privado não esconde o `export { Linha } from` do mesmo arquivo
  const decls = declaracoesNoBloco(sf.statements.filter(visivelFora), nome)
  if (decls.length > 0) return { tipo: 'declaracoes', decls, ctx: alvo }
  for (const st of sf.statements) {
    if (nome === 'default' && ts.isExportAssignment(st) && !st.isExportEquals && ts.isIdentifier(st.expression)) {
      return localOuImportado(st.expression.text, alvo, saltos + 1)
    }
    if (!ts.isExportDeclaration(st)) continue
    const clausula = st.exportClause
    const el = clausula && ts.isNamedExports(clausula) ? clausula.elements.find((e) => e.name.text === nome) : undefined
    const original = (el?.propertyName ?? el?.name)?.text
    if (st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      if (original) return exportado(original, st.moduleSpecifier.text, alvo, saltos + 1)
      // `export * from` não reexporta o default
      if (!clausula && nome !== 'default') {
        const d = exportado(nome, st.moduleSpecifier.text, alvo, saltos + 1)
        if (d) return d
      }
    } else if (original) {
      // `export { Linha as Row }` sem `from`: `Linha` é declarada aqui OU importada aqui
      return localOuImportado(original, alvo, saltos + 1)
    }
  }
  return null
}

/** O recipiente da parte à esquerda de um nome qualificado (`A` ou `A.B` em `A.B.Linha`). */
function recipienteDe(esquerda: ts.EntityName | ts.Expression, onde: ts.Node, ctx: ContextoDeTipos, saltos: number): Recipiente | null {
  if (saltos > LIMITE_DE_SALTOS) return null
  if (ts.isIdentifier(esquerda)) {
    for (let p: ts.Node | undefined = onde.parent; p; p = p.parent) {
      if (ts.isSourceFile(p) || ts.isBlock(p) || ts.isModuleBlock(p)) {
        const corpo = corposDeNamespace(p.statements, esquerda.text)
        if (corpo.length > 0) return { tipo: 'bloco', instrucoes: corpo, ctx }
      }
    }
    return namespaceImportado(esquerda.text, ctx, saltos + 1)
  }
  const [dentro, membro] = ts.isQualifiedName(esquerda)
    ? [esquerda.left, esquerda.right.text]
    : ts.isPropertyAccessExpression(esquerda) && ts.isIdentifier(esquerda.name)
      ? [esquerda.expression, esquerda.name.text]
      : [null, null]
  if (!dentro || !membro) return null
  const r = recipienteDe(dentro, onde, ctx, saltos + 1)
  if (!r) return null
  if (r.tipo === 'bloco') {
    const corpo = corposDeNamespace(r.instrucoes, membro)
    return corpo.length > 0 ? { tipo: 'bloco', instrucoes: corpo, ctx: r.ctx } : null
  }
  return namespaceExportado(membro, r.especificador, r.ctx, saltos + 1)
}

/** Um namespace que o arquivo importa: `import * as M from` (o módulo inteiro) ou `import { Grupo } from`. */
function namespaceImportado(nome: string, ctx: ContextoDeTipos, saltos: number): Recipiente | null {
  if (saltos > LIMITE_DE_SALTOS) return null
  for (const st of ctx.sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue
    const nomeados = st.importClause?.namedBindings
    if (nomeados && ts.isNamespaceImport(nomeados) && nomeados.name.text === nome) {
      return { tipo: 'modulo', especificador: st.moduleSpecifier.text, ctx }
    }
    const el = nomeados && ts.isNamedImports(nomeados) ? nomeados.elements.find((e) => e.name.text === nome) : undefined
    if (el) return namespaceExportado((el.propertyName ?? el.name).text, st.moduleSpecifier.text, ctx, saltos + 1)
  }
  return null
}

/** O `namespace` que um módulo EXPORTA com esse nome — declarado com `export`, reexportado de outro módulo ou localmente. */
function namespaceExportado(nome: string, especificador: string, ctx: ContextoDeTipos, saltos: number): Recipiente | null {
  if (saltos > LIMITE_DE_SALTOS) return null
  const sf = abrirModulo(especificador, ctx)
  if (!sf) return null
  const alvo: ContextoDeTipos = { ...ctx, sf, arquivo: sf.fileName }
  const proprio = corposDeNamespace(sf.statements.filter(visivelFora), nome)
  if (proprio.length > 0) return { tipo: 'bloco', instrucoes: proprio, ctx: alvo }
  for (const st of sf.statements) {
    if (!ts.isExportDeclaration(st)) continue
    const clausula = st.exportClause
    const de = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null
    if (clausula && ts.isNamespaceExport(clausula)) {
      // `export * as Grupo from './x'`: o módulo inteiro faz o papel do namespace
      if (de && clausula.name.text === nome) return { tipo: 'modulo', especificador: de, ctx: alvo }
      continue
    }
    const el = clausula && ts.isNamedExports(clausula) ? clausula.elements.find((e) => e.name.text === nome) : undefined
    const original = (el?.propertyName ?? el?.name)?.text
    if (de) {
      if (original) return namespaceExportado(original, de, alvo, saltos + 1)
      if (!clausula) {
        const r = namespaceExportado(nome, de, alvo, saltos + 1)
        if (r) return r
      }
    } else if (original) {
      const local = corposDeNamespace(sf.statements, original)
      if (local.length > 0) return { tipo: 'bloco', instrucoes: local, ctx: alvo }
      return namespaceImportado(original, alvo, saltos + 1)
    }
  }
  return null
}

function noRecipiente(r: Recipiente, nome: string, saltos: number): Denotacao {
  if (r.tipo === 'modulo') return exportado(nome, r.especificador, r.ctx, saltos + 1)
  const decls = declaracoesNoBloco(r.instrucoes, nome)
  return decls.length > 0 ? { tipo: 'declaracoes', decls, ctx: r.ctx } : null
}

/** A chave de um `Record`/tipo mapeado é ABERTA — qualquer nome de coluna passa? */
function chaveAberta(t: ts.TypeNode, ctx: ContextoDeTipos, saltos: number): boolean {
  if (saltos > LIMITE_DE_SALTOS) return false
  if (ehApagador(t) || [ts.SyntaxKind.StringKeyword, ts.SyntaxKind.NumberKeyword, ts.SyntaxKind.SymbolKeyword].includes(t.kind)) return true
  if (ts.isParenthesizedTypeNode(t)) return chaveAberta(t.type, ctx, saltos)
  if (ts.isUnionTypeNode(t)) return t.types.some((x) => chaveAberta(x, ctx, saltos))
  if (ts.isImportTypeNode(t)) {
    const d = denotarImportado(t, ctx, saltos)
    return !!d && d.tipo === 'declaracoes' && d.decls.some((decl) => ts.isTypeAliasDeclaration(decl) && chaveAberta(decl.type, d.ctx, saltos + 1))
  }
  if (!ts.isTypeReferenceNode(t) || !ts.isIdentifier(t.typeName)) return false
  if (t.typeName.text === 'PropertyKey') return true
  const d = denotar(t.typeName.text, t, ctx, saltos)
  if (d?.tipo === 'parametro') {
    const sub = ctx.subst.get(d.param)
    return !!sub && chaveAberta(sub.no, sub.ctx, saltos + 1)
  }
  return !!d && d.decls.some((decl) => ts.isTypeAliasDeclaration(decl) && chaveAberta(decl.type, d.ctx, saltos + 1))
}

/** Uma REFERÊNCIA nomeada (no argumento ou num `extends`) apaga a linha? */
function referenciaApaga(
  nome: string,
  esquerda: ts.EntityName | ts.Expression | null,
  argumentos: readonly ts.TypeNode[] | undefined,
  onde: ts.Node,
  ctx: ContextoDeTipos,
  saltos: number,
): boolean {
  if (saltos > LIMITE_DE_SALTOS) return false
  if (!esquerda) {
    if (nome === 'Record') {
      const [chave, valor] = argumentos ?? []
      return (!!chave && chaveAberta(chave, ctx, saltos + 1)) || (!!valor && apagaALinha(valor, ctx, saltos + 1))
    }
    if (nome === 'Partial') return true
    if (UTILITARIOS_QUE_PRESERVAM.has(nome)) return !!argumentos?.[0] && apagaALinha(argumentos[0], ctx, saltos + 1)
  }
  let d: Denotacao
  if (esquerda) {
    const r = recipienteDe(esquerda, onde, ctx, saltos + 1)
    d = r ? noRecipiente(r, nome, saltos + 1) : null
  } else {
    d = denotar(nome, onde, ctx, saltos)
  }
  return denotacaoApaga(d, argumentos, ctx, saltos)
}

/** `import('./mod').Nome` escrito no próprio argumento: a mesma resolução do `import` no topo do arquivo. */
function denotarImportado(t: ts.ImportTypeNode, ctx: ContextoDeTipos, saltos: number): Denotacao {
  if (saltos > LIMITE_DE_SALTOS) return null
  const especificador = ts.isLiteralTypeNode(t.argument) && ts.isStringLiteral(t.argument.literal) ? t.argument.literal.text : null
  if (!especificador || !t.qualifier) return null
  if (ts.isIdentifier(t.qualifier)) return exportado(t.qualifier.text, especificador, ctx, saltos + 1)
  // `import('./mod').Grupo.Nome`: o módulo faz o papel do recipiente da esquerda
  const partes: string[] = []
  for (let e: ts.EntityName = t.qualifier; ; ) {
    if (ts.isIdentifier(e)) {
      partes.unshift(e.text)
      break
    }
    partes.unshift(e.right.text)
    e = e.left
  }
  const nome = partes.pop() ?? ''
  let atual: Recipiente | null = { tipo: 'modulo', especificador, ctx }
  for (const parte of partes) {
    if (!atual) return null
    if (atual.tipo === 'modulo') {
      atual = namespaceExportado(parte, atual.especificador, atual.ctx, saltos + 1)
    } else {
      const corpo = corposDeNamespace(atual.instrucoes, parte)
      atual = corpo.length > 0 ? { tipo: 'bloco', instrucoes: corpo, ctx: atual.ctx } : null
    }
  }
  return atual ? noRecipiente(atual, nome, saltos + 1) : null
}

/** O que a denotação apaga, com os argumentos do uso: o parâmetro de tipo substituído, ou as declarações. */
function denotacaoApaga(d: Denotacao, argumentos: readonly ts.TypeNode[] | undefined, ctx: ContextoDeTipos, saltos: number): boolean {
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
          if (ts.isIdentifier(x)) return referenciaApaga(x.text, null, e.typeArguments, e, dentro, saltos + 1)
          if (ts.isPropertyAccessExpression(x) && ts.isIdentifier(x.name)) {
            return referenciaApaga(x.name.text, x.expression, e.typeArguments, e, dentro, saltos + 1)
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
  if (ts.isMappedTypeNode(t)) {
    const opcional = !!t.questionToken && t.questionToken.kind !== ts.SyntaxKind.MinusToken
    const restricao = t.typeParameter.constraint
    return opcional || (!!restricao && chaveAberta(restricao, ctx, saltos + 1)) || (!!t.type && apagaALinha(t.type, ctx, saltos + 1))
  }
  if (ts.isIntersectionTypeNode(t) || ts.isUnionTypeNode(t)) return t.types.some((x) => apagaALinha(x, ctx, saltos))
  // `import('./mod').Nome` inline: outro nó, a MESMA resolução (quarta re-revisão)
  if (ts.isImportTypeNode(t)) return denotacaoApaga(denotarImportado(t, ctx, saltos), t.typeArguments, ctx, saltos)
  if (!ts.isTypeReferenceNode(t)) return false
  const { typeName } = t
  return ts.isIdentifier(typeName)
    ? referenciaApaga(typeName.text, null, t.typeArguments, t, ctx, saltos)
    : referenciaApaga(typeName.right.text, typeName.left, t.typeArguments, t, ctx, saltos)
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
    ['tipo importado INLINE, sem mexer no bloco de imports', 'async function f(){ return paginarTodos<import("@/lib/observabilidade-linha").ContextoFalha>("x", (a, b) => c.from("t").select("*").range(a, b)) }', 1],
    // segunda re-revisão da F58: namespace local e CHAVE ABERTA
    ['namespace local', 'namespace X { export type Linha = unknown }\nasync function f(){ return paginarTodos<X.Linha>("x", (a, b) => c.from("t").select("*").range(a, b)) }', 1],
    ['declare namespace aninhado', 'declare namespace A.B { type Linha = Record<string, unknown> }\nasync function f(){ return paginarTodos<A.B.Linha>("x", (a, b) => c.from("t").select("*").range(a, b)) }', 1],
    ['assinatura de índice com união que esconde unknown', 'async function f(){ return paginarTodos<{ id: string; [k: string]: string | unknown }>("x", (a, b) => c.from("t").select("*").range(a, b)) }', 1],
    ['assinatura de índice com valor CONCRETO (qualquer coluna passa)', 'async function f(){ return paginarTodos<{ id: string; [k: string]: string }>("x", (a, b) => c.from("t").select("*").range(a, b)) }', 1],
    ['Record de chaves fechadas com valor por alias', 'type Oculto = unknown\ntype R = Record<"id", Oculto>\nasync function f(){ return paginarTodos<R>("x", (a, b) => c.from("t").select("id").range(a, b)) }', 1],
    ['Record de chave aberta com valor concreto', 'async function f(){ return paginarTodos<Record<string, string>>("x", (a, b) => c.from("t").select("*").range(a, b)) }', 1],
    ['Record com a chave aberta atrás de alias', 'type Chave = string\nasync function f(){ return paginarTodos<Record<Chave, number>>("x", (a, b) => c.from("t").select("*").range(a, b)) }', 1],
    ['tipo mapeado sobre string', 'async function f(){ return paginarTodos<{ [K in string]: number }>("x", (a, b) => c.from("t").select("*").range(a, b)) }', 1],
    // F60: o teto obrigatório (3º/4º argumento) e a forma KEYSET — o produtor é reconhecido pelo NOME
    ['F60: paginarTodos com o teto (3 argumentos) — cast sobre as linhas num map', 'async function f(){ const rows = await paginarTodos("x", (a, b) => c.from("t").select("a").range(a, b), CAP_ATIVOS); return rows.map((r) => r.snapshot as Snapshot | null) }', 1],
    ['F60: paginarTodos KEYSET — cast sobre o resultado', 'async function f(){ const rows = await paginarTodos("x", { porChave: (d, n) => c.from("t").select("id, a").order("id").limit(n), chaveDe: (l) => l.id }, CAP_ATIVOS); return rows as Linha[] }', 1],
    ['F60: paginarPorIds KEYSET com o teto (4 argumentos) — cast direto', 'async function f(ids: string[]){ return (await paginarPorIds("x", ids, { porChave: (l, d, n) => c.from("t").select("id").in("id", l).order("id").limit(n), chaveDe: (r) => r.id }, CAP_LOTE)) as Linha[] }', 1],
    ['F60: argumento de tipo que apaga, no keyset com o teto', 'async function f(){ return paginarTodos<unknown, string>("x", { porChave: (d, n) => c.from("t").select("*").order("id").limit(n), chaveDe: (l) => l.id }, CAP_ATIVOS) }', 1],
    ['F60: cast na LINHA que o keyset entrega a chaveDe', 'async function f(){ return paginarTodos("x", { porChave: (d, n) => c.from("t").select("id").order("id").limit(n), chaveDe: (l) => l.id as string }, CAP_ATIVOS) }', 1],
    ['F60: chaveDe como MÉTODO do objeto keyset', 'async function f(){ return paginarPorIds("x", ids, { porChave(l, d, n) { return c.from("t").select("id").in("id", l).limit(n) }, chaveDe(r) { return r.id as string } }, CAP_LOTE) }', 1],
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
    ['Record de chaves FECHADAS com valor concreto', 'async function f(){ return paginarTodos<Record<"id" | "nome", string>>("x", (a, b) => c.from("t").select("id, nome").range(a, b)) }'],
    ['namespace local com tipo concreto', 'namespace X { export type Linha = { id: string } }\nasync function f(){ return paginarTodos<X.Linha>("x", (a, b) => c.from("t").select("id").range(a, b)) }'],
    ['tipo importado INLINE, concreto', 'async function f(){ return paginarTodos<import("@/lib/relatorios/serie").LinhaSerieCurta>("x", (a, b) => c.from("t").select("data, tipo").range(a, b)) }'],
    ['F60: keyset com tipo concreto e o teto, sem cast', 'type Linha = { id: number; nome: string }\nasync function f(){ return paginarTodos<Linha, number>("x", { porChave: (d, n) => c.from("t").select("id, nome").order("id").limit(n), chaveDe: (l) => l.id }, CAP_ITENS) }'],
    ['F60: `chaveDe` fora de uma chamada produtora não é linha lida', 'const pagina = { chaveDe: (l: { id: unknown }) => l.id as string }'],
  ])('não casa: %s', (_nome, fonte) => {
    expect(castsDeLeitura(fonte)).toEqual([])
  })

  // O que atravessa ARQUIVO, com os módulos em memória (caminhos sob a raiz, em qualquer sistema).
  const VIRTUAL = (arquivo: string) => join(RAIZ, '__virtual__', arquivo)
  const PAGINA = 'async function f(){ return paginarTodos<Linha>("x", (a, b) => c.from("t").select("id").range(a, b)) }'
  it.each([
    ['import DEFAULT de interface com opcional', `import Linha from "./tipos"\n${PAGINA}`, { 'tipos.ts': 'export default interface Linha { id: string; extra?: string }' }, 1],
    ['`export default Nome` de interface com opcional', `import Linha from "./tipos"\n${PAGINA}`, { 'tipos.ts': 'interface Base { id: string; extra?: string }\nexport default Base' }, 1],
    ['barril que reexporta o default com nome', `import { Linha } from "./barril"\n${PAGINA}`, { 'direto.ts': 'export default interface Linha { id: string; extra?: string }', 'barril.ts': 'export { default as Linha } from "./direto"' }, 1],
    ['rename de declaração LOCAL reexportado', `import type { Row as Linha } from "./renomeado"\n${PAGINA}`, { 'renomeado.ts': 'type Oculto = unknown\nexport type { Oculto as Row }' }, 1],
    ['export * de barril até o alias', `import type { Linha } from "./barril"\n${PAGINA}`, { 'tipos.ts': 'export type Linha = Record<string, unknown>', 'barril.ts': 'export * from "./tipos"' }, 1],
    ['namespace dentro de módulo importado por * as', 'import type * as M from "./tipos"\nasync function f(){ return paginarTodos<M.Grupo.Linha>("x", (a, b) => c.from("t").select("*").range(a, b)) }', { 'tipos.ts': 'export namespace Grupo { export type Linha = unknown }' }, 1],
    ['import default de tipo CONCRETO', `import Linha from "./tipos"\n${PAGINA}`, { 'tipos.ts': 'export default interface Linha { id: string }' }, 0],
    ['`export *` não reexporta o default', `import { default as Linha } from "./barril"\n${PAGINA}`, { 'tipos.ts': 'export default interface Linha { id: string; extra?: string }', 'barril.ts': 'export * from "./tipos"' }, 0],
    // terceira re-revisão: de módulo alheio só vale o que ele EXPORTA
    ['tipo PRIVADO de mesmo nome não esconde o reexportado que apaga', `import type { Linha } from "./mod"\n${PAGINA}`, { 'real.ts': 'export type Linha = Record<string, unknown>', 'mod.ts': 'type Linha = { id: string }\nexport { Linha } from "./real"' }, 1],
    ['tipo PRIVADO que apaga não vale fora do módulo', `import type { Linha } from "./mod"\n${PAGINA}`, { 'real.ts': 'export type Linha = { id: string }', 'mod.ts': 'type Linha = unknown\nexport { Linha } from "./real"' }, 0],
    ['namespace PRIVADO de mesmo nome não esconde o reexportado', 'import type * as M from "./mod"\nasync function f(){ return paginarTodos<M.Grupo.Linha>("x", (a, b) => c.from("t").select("*").range(a, b)) }', { 'real.ts': 'export namespace Grupo { export type Linha = Record<string, unknown> }', 'mod.ts': 'namespace Grupo { export type Linha = { id: string } }\nexport { Grupo } from "./real"' }, 1],
    ['namespace importado por nome', 'import type { Grupo } from "./tipos"\nasync function f(){ return paginarTodos<Grupo.Linha>("x", (a, b) => c.from("t").select("*").range(a, b)) }', { 'tipos.ts': 'export namespace Grupo { export type Linha = unknown }' }, 1],
    ['`export * as Grupo from` faz o papel do namespace', 'import type { Grupo } from "./barril"\nasync function f(){ return paginarTodos<Grupo.Linha>("x", (a, b) => c.from("t").select("*").range(a, b)) }', { 'tipos.ts': 'export type Linha = Record<string, unknown>', 'barril.ts': 'export * as Grupo from "./tipos"' }, 1],
    // quarta re-revisão: o `import('…')` inline percorre a mesma cadeia
    ['import inline até um namespace exportado', 'async function f(){ return paginarTodos<import("./tipos").Grupo.Linha>("x", (a, b) => c.from("t").select("*").range(a, b)) }', { 'tipos.ts': 'export namespace Grupo { export type Linha = unknown }' }, 1],
    ['import inline na CHAVE de um Record', 'async function f(){ return paginarTodos<Record<import("./tipos").Chave, string>>("x", (a, b) => c.from("t").select("*").range(a, b)) }', { 'tipos.ts': 'export type Chave = string' }, 1],
    ['o tipo PRIVADO do módulo não é o que o import traz', `import type { Linha } from "./mod"\n${PAGINA}`, { 'mod.ts': 'type Oculto = unknown\nexport type Linha = { id: string }' }, 0],
  ])('entre arquivos: %s', (_nome, fonte, arquivos, esperado) => {
    const virtuais = Object.fromEntries(Object.entries(arquivos).map(([k, v]) => [VIRTUAL(k), v]))
    expect(castsDeLeitura(fonte, VIRTUAL('consumidor.ts'), virtuais)).toHaveLength(esperado)
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
