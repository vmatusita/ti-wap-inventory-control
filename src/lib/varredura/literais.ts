import ts from 'typescript'
import { readFileSync } from 'node:fs'

// OS LITERAIS DE UM ARQUIVO, PELO COMPILADOR — a varredura da `sem-wapismo` (F56),
// promovida a módulo na F61.
//
// A F56 escreveu esta varredura dentro de `src/lib/import/sem-wapismo.test.ts`. A
// F61 precisou da MESMA pergunta — "este arquivo escreve a sigla, o nome do sistema
// ou o autor como TEXTO?" — para a trava dos pontos de injeção
// (`src/lib/identidade/sem-literais.test.ts`), e duas cópias de um parser divergem
// em silêncio (a lição de `src/lib/layout/regua-de-classes.ts`). Então ela mora
// aqui, e as duas travas a importam.
//
// O QUE ELA DEVOLVE: só LITERAIS — `StringLiteral`, `NoSubstitutionTemplateLiteral`,
// `TemplateHead`/`TemplateMiddle`/`TemplateTail` e `JsxText` (que também cobre texto
// de atributo JSX sem chaves, porque `placeholder="…"` é um `StringLiteral` no AST)
// — NUNCA comentário (o compilador não os expõe como nó) e NUNCA identificador
// (`const WAP = …` não é literal; o `'WAP'` do lado direito é).
//
// `literaisDoCodigo` recebe o TEXTO, e é o que deixa uma sabotagem injetar um
// literal EM MEMÓRIA num arquivo de verdade sem escrever nada em disco.
//
// Módulo só de servidor por natureza (Vitest e `tsx`); nenhuma tela o importa.

export type Literal = { linha: number; texto: string }

/** Todo nó LITERAL (nunca comentário, nunca identificador) de um código. */
export function literaisDoCodigo(nomeDoArquivo: string, codigo: string): Literal[] {
  const sf = ts.createSourceFile(
    nomeDoArquivo,
    codigo,
    ts.ScriptTarget.Latest,
    true,
    nomeDoArquivo.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const achados: Literal[] = []

  function visita(no: ts.Node) {
    if (
      ts.isStringLiteral(no) ||
      ts.isNoSubstitutionTemplateLiteral(no) ||
      ts.isTemplateHead(no) ||
      ts.isTemplateMiddle(no) ||
      ts.isTemplateTail(no) ||
      ts.isJsxText(no)
    ) {
      const texto = (no as unknown as { text: string }).text
      const { line } = sf.getLineAndCharacterOfPosition(no.getStart(sf))
      achados.push({ linha: line + 1, texto })
    }
    ts.forEachChild(no, visita)
  }
  visita(sf)
  return achados
}

/** Todo nó LITERAL de um arquivo em disco. */
export function coletarLiterais(caminhoAbsoluto: string): Literal[] {
  return literaisDoCodigo(caminhoAbsoluto, readFileSync(caminhoAbsoluto, 'utf8'))
}
