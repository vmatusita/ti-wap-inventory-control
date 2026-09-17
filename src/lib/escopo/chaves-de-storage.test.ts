import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// A TRAVA DAS CHAVES DE STORAGE (F61) — `chaveDeStorage` é a única construtora.
//
// `src/lib/escopo/chave.ts` (F50) escreveu `chaveDeStorage(base)` para a F61: as
// sete chaves `wap:*` passam a ser MONTADAS por ela, idênticas byte a byte às
// literais de hoje (`src/lib/relatorios/assinatura-realtime.test.ts` confere as
// sete). Esta trava impede a volta, em duas regras lidas pelo COMPILADOR (AST):
//
//   A · nenhum literal ou template que COMECE por `wap:` em código de produção de
//       `src/` fora de `src/lib/escopo/chave.ts` — exceto os dois nomes de
//       `CustomEvent` (não são storage), nomeados.
//   B · toda chamada `.getItem/.setItem/.removeItem(chave, …)` recebe a chave de
//       uma CHAMADA a `chaveDeStorage(…)` ou a uma função `chave*` que DEVOLVE
//       `chaveDeStorage(…)` — calculada NO USO, nunca guardada numa constante de
//       módulo (que congelaria o valor; `chave.ts:37-40`). As exceções são as
//       preferências do APARELHO: `wap-sidebar` (embutida no script anti-flash de
//       `(app)/layout.tsx`; renomeá-la apagaria a preferência de todo mundo) e
//       `theme` (a chave padrão do `next-themes`, que nem aparece no nosso código).
//
// ⚠ Uma trava que só olhasse a CHAMADA já passaria hoje: as chamadas usam
// IDENTIFICADORES (`CHAVE_RASCUNHO`), e o literal mora numa constante no topo do
// módulo. Por isso as duas regras existem juntas.

const RAIZ = process.cwd()

/** Os nomes de evento que começam por `wap:` e NÃO são chave de storage. */
const EVENTOS: readonly { arquivo: string; literal: string }[] = [
  { arquivo: 'src/components/itens/lancar-item-evento.ts', literal: 'wap:lancar-item' },
  { arquivo: 'src/components/itens/transferir-item-evento.ts', literal: 'wap:transferir-item' },
]

/** As chaves de storage que não passam por `chaveDeStorage`, pelo IDENTIFICADOR usado. */
const EXCECOES_DE_STORAGE: readonly { identificador: string; chave: string; motivo: string }[] = [
  {
    identificador: 'CHAVE_SIDEBAR',
    chave: 'wap-sidebar',
    motivo:
      'preferência do APARELHO (sidebar recolhida), embutida no script anti-flash; renomear apagaria a de todo mundo',
  },
]

type Fonte = { arquivo: string; codigo: string }

function fontesDeProducao(): Fonte[] {
  const achadas: Fonte[] = []
  const visitar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome)
      if (statSync(caminho).isDirectory()) {
        visitar(caminho)
        continue
      }
      if (!/\.(ts|tsx)$/.test(nome) || /\.test\.(ts|tsx)$/.test(nome)) continue
      achadas.push({
        arquivo: relative(RAIZ, caminho).split(sep).join('/'),
        codigo: readFileSync(caminho, 'utf8'),
      })
    }
  }
  visitar(join(RAIZ, 'src'))
  return achadas
}

function arvore({ arquivo, codigo }: Fonte): ts.SourceFile {
  return ts.createSourceFile(
    arquivo,
    codigo,
    ts.ScriptTarget.Latest,
    true,
    arquivo.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

function percorrer(no: ts.Node, visita: (no: ts.Node) => void) {
  visita(no)
  ts.forEachChild(no, (filho) => percorrer(filho, visita))
}

const linhaDe = (sf: ts.SourceFile, no: ts.Node) =>
  sf.getLineAndCharacterOfPosition(no.getStart(sf)).line + 1

/** Regra A — os literais que começam por `wap:`. */
function literaisWap(fonte: Fonte): string[] {
  if (fonte.arquivo === 'src/lib/escopo/chave.ts') return []
  const sf = arvore(fonte)
  const achados: string[] = []
  percorrer(sf, (no) => {
    let texto: string | null = null
    if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) texto = no.text
    else if (ts.isTemplateExpression(no)) texto = no.head.text
    if (texto === null || !texto.startsWith('wap:')) return
    if (EVENTOS.some((e) => e.arquivo === fonte.arquivo && e.literal === texto)) return
    achados.push(`${fonte.arquivo}:${linhaDe(sf, no)} escreve a chave "${texto}" à mão`)
  })
  return achados
}

/** As funções `chave*` do projeto que devolvem `chaveDeStorage(…)`. */
function construtorasDeChave(fontes: Fonte[]): Set<string> {
  const nomes = new Set<string>(['chaveDeStorage'])
  for (const fonte of fontes) {
    const sf = arvore(fonte)
    percorrer(sf, (no) => {
      if (!ts.isFunctionDeclaration(no) || !no.name || !/^chave[A-Z]/.test(no.name.text)) return
      const retornos: ts.Expression[] = []
      percorrer(no, (dentro) => {
        if (ts.isReturnStatement(dentro) && dentro.expression) retornos.push(dentro.expression)
      })
      const devolveAConstrutora =
        retornos.length === 1 &&
        ts.isCallExpression(retornos[0]) &&
        retornos[0].expression.getText(sf) === 'chaveDeStorage'
      if (devolveAConstrutora) nomes.add(no.name.text)
    })
  }
  return nomes
}

/** Regra B — as chamadas de storage cuja chave não sai da construtora. */
function chamadasSemConstrutora(fonte: Fonte, construtoras: Set<string>): string[] {
  const sf = arvore(fonte)
  const achados: string[] = []
  percorrer(sf, (no) => {
    if (!ts.isCallExpression(no) || !ts.isPropertyAccessExpression(no.expression)) return
    if (!['getItem', 'setItem', 'removeItem'].includes(no.expression.name.text)) return
    const chave = no.arguments[0]
    if (!chave) return
    if (ts.isCallExpression(chave) && construtoras.has(chave.expression.getText(sf))) return
    if (ts.isIdentifier(chave) && EXCECOES_DE_STORAGE.some((e) => e.identificador === chave.text)) return
    achados.push(
      `${fonte.arquivo}:${linhaDe(sf, no)} usa a chave "${chave.getText(sf)}" — ` +
        `monte-a por chaveDeStorage(…) no uso, não numa constante`,
    )
  })
  return achados
}

describe('as chaves de storage saem de chaveDeStorage (F61)', () => {
  const fontes = fontesDeProducao()
  const construtoras = construtorasDeChave(fontes)

  it('A · nenhum literal "wap:" fora de lib/escopo/chave.ts (salvo os dois nomes de evento)', () => {
    expect(fontes.flatMap(literaisWap)).toEqual([])
  })

  it('B · toda chamada de storage recebe a chave de uma construtora, calculada no uso', () => {
    expect(fontes.flatMap((f) => chamadasSemConstrutora(f, construtoras))).toEqual([])
  })

  it('as sete construtoras existem (e a de conferência leva a filial)', () => {
    for (const nome of [
      'chaveCompraDefaults',
      'chaveRascunhoCompra',
      'chaveRascunhoMovimentacao',
      'chaveRascunhoConferencia',
      'chaveListaAtivos',
      'chaveAtivosRecentes',
      'chaveRelatorioVisitado',
    ]) {
      expect(construtoras.has(nome), `${nome} não devolve chaveDeStorage(…)`).toBe(true)
    }
  })

  it.each(EVENTOS)('o nome de evento $literal existe em $arquivo', ({ arquivo, literal }) => {
    const fonte = fontes.find((f) => f.arquivo === arquivo)
    expect(fonte, `exceção morta: ${arquivo}`).toBeDefined()
    expect(fonte!.codigo).toContain(`'${literal}'`)
  })

  it.each(EXCECOES_DE_STORAGE)('a exceção $identificador ($chave) existe e diz por quê', (excecao) => {
    const usada = fontes.some((f) => f.codigo.includes(`Item(${excecao.identificador}`))
    expect(usada, `exceção morta: ${excecao.identificador}`).toBe(true)
    expect(excecao.motivo.length).toBeGreaterThanOrEqual(20)
    const definicao = fontes.find((f) => f.codigo.includes(`export const ${excecao.identificador} = '${excecao.chave}'`))
    expect(definicao, `${excecao.identificador} não é mais '${excecao.chave}'`).toBeDefined()
  })

  // SABOTAGEM I, guardada como teste — código sintético, nada em disco.
  describe('a trava enxerga a volta', () => {
    it('localStorage.setItem com literal "wap:" reprova nas DUAS regras', () => {
      const f = { arquivo: 'src/components/x/sintetico.ts', codigo: `localStorage.setItem('wap:x', '1')` }
      expect(literaisWap(f)).toHaveLength(1)
      expect(chamadasSemConstrutora(f, construtoras)).toHaveLength(1)
    })

    it('a constante de módulo com a chave reprova, mesmo sem chamada nenhuma', () => {
      const f = { arquivo: 'src/components/x/sintetico.ts', codigo: `export const CHAVE_X = 'wap:x'` }
      expect(literaisWap(f)).toHaveLength(1)
    })

    it('guardar a construtora numa constante e passar o identificador reprova', () => {
      const f = {
        arquivo: 'src/components/x/sintetico.ts',
        codigo: `const CHAVE_X = chaveDeStorage('x')\nsessionStorage.getItem(CHAVE_X)`,
      }
      expect(chamadasSemConstrutora(f, construtoras)).toHaveLength(1)
    })

    it('a chamada no uso passa', () => {
      const f = { arquivo: 'src/components/x/sintetico.ts', codigo: `sessionStorage.getItem(chaveDeStorage('x'))` }
      expect(chamadasSemConstrutora(f, construtoras)).toEqual([])
    })
  })
})
