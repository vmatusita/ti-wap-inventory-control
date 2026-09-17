import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { deveSemear } from './use-dialogo-semeado'

// A TRAVA DO DIÁLOGO SEMEADO (F61) — nome fixado pela ficha.
//
// Todo diálogo de `src/components/**` que inicializa `useState` a partir de uma
// PROP usa `useDialogoSemeado` (semeia na abertura) ou é uma exceção nomeada com
// motivo. E `onOpenChange={setAlgo}` direto, ao lado de estado semeado de prop, é
// o defeito em pessoa: reprova sempre.
//
// A leitura é pelo COMPILADOR (AST), não por regex: "a prop" é o nome
// desestruturado do primeiro parâmetro de um componente (função com nome em
// maiúscula), e "semeado" é um `useState(...)` cujo argumento cita esse nome. O
// rig é grau 1 — nada aqui abre diálogo; a regra de semear é a função pura
// `deveSemear`, e o uso se prova por leitura.

const RAIZ = process.cwd()

type Analise = {
  /** Os `useState` cujo argumento cita uma prop: `linha: nome da prop`. */
  semeadosDeProp: string[]
  usaHook: boolean
  /** `onOpenChange={setX}` direto. */
  setterCruNoOnOpenChange: string[]
}

function nomesDoPadrao(padrao: ts.BindingName): string[] {
  if (ts.isIdentifier(padrao)) return [padrao.text]
  const nomes: string[] = []
  for (const elemento of padrao.elements) {
    if (ts.isOmittedExpression(elemento)) continue
    nomes.push(...nomesDoPadrao(elemento.name))
  }
  return nomes
}

/** A análise de UM arquivo — a mesma que a sabotagem chama com código sintético. */
function analisarDialogo(arquivo: string, codigo: string): Analise {
  const sf = ts.createSourceFile(arquivo, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const props = new Set<string>()
  const analise: Analise = { semeadosDeProp: [], usaHook: false, setterCruNoOnOpenChange: [] }

  const ehComponente = (no: ts.Node): no is ts.FunctionLikeDeclaration => {
    if (ts.isFunctionDeclaration(no)) return !!no.name && /^[A-Z]/.test(no.name.text)
    if ((ts.isArrowFunction(no) || ts.isFunctionExpression(no)) && ts.isVariableDeclaration(no.parent)) {
      return ts.isIdentifier(no.parent.name) && /^[A-Z]/.test(no.parent.name.text)
    }
    return false
  }

  // 1ª passada: as props de todo componente do arquivo.
  const juntarProps = (no: ts.Node) => {
    if (ehComponente(no) && no.parameters[0]) {
      for (const nome of nomesDoPadrao(no.parameters[0].name)) props.add(nome)
    }
    ts.forEachChild(no, juntarProps)
  }
  juntarProps(sf)

  const linha = (no: ts.Node) => sf.getLineAndCharacterOfPosition(no.getStart(sf)).line + 1

  const citaProp = (no: ts.Node): string | null => {
    // `x.nome` — o `nome` depois do ponto é propriedade, não a prop `nome`.
    if (ts.isIdentifier(no) && props.has(no.text)) {
      const pai = no.parent
      if (ts.isPropertyAccessExpression(pai) && pai.name === no) return null
      if (ts.isPropertyAssignment(pai) && pai.name === no) return null
      return no.text
    }
    let achado: string | null = null
    ts.forEachChild(no, (filho) => {
      achado ??= citaProp(filho)
    })
    return achado
  }

  // 2ª passada: os `useState` semeados, o hook e o `onOpenChange` cru.
  const visitar = (no: ts.Node) => {
    if (ts.isCallExpression(no)) {
      const chamada = no.expression.getText(sf)
      if ((chamada === 'useState' || chamada === 'React.useState') && no.arguments[0]) {
        const prop = citaProp(no.arguments[0])
        if (prop) analise.semeadosDeProp.push(`linha ${linha(no)}: ${prop}`)
      }
      if (chamada === 'useDialogoSemeado') analise.usaHook = true
    }
    if (
      ts.isJsxAttribute(no) &&
      no.name.getText(sf) === 'onOpenChange' &&
      no.initializer &&
      ts.isJsxExpression(no.initializer) &&
      no.initializer.expression &&
      ts.isIdentifier(no.initializer.expression) &&
      /^set[A-Z]/.test(no.initializer.expression.text)
    ) {
      analise.setterCruNoOnOpenChange.push(`linha ${linha(no)}: ${no.initializer.expression.text}`)
    }
    ts.forEachChild(no, visitar)
  }
  visitar(sf)
  return analise
}

/** As recusas de um arquivo (vazio = verde). */
function recusasDoDialogo(arquivo: string, codigo: string, excecoes: typeof EXCECOES): string[] {
  const a = analisarDialogo(arquivo, codigo)
  const recusas: string[] = []
  if (a.semeadosDeProp.length === 0) return recusas
  if (!a.usaHook && !excecoes.some((e) => e.arquivo === arquivo)) {
    recusas.push(
      `${arquivo} semeia useState de prop (${a.semeadosDeProp.join('; ')}) sem useDialogoSemeado — ` +
        `reabrir mostraria o render velho`,
    )
  }
  for (const cru of a.setterCruNoOnOpenChange) {
    recusas.push(`${arquivo} passa onOpenChange direto a um setter (${cru}) ao lado de estado semeado de prop`)
  }
  return recusas
}

/**
 * As EXCEÇÕES — diálogos que semeiam de prop e NÃO usam o hook de propósito.
 * Cada uma com o motivo; exceção que não semeia de prop reprova (morta).
 */
const EXCECOES: readonly { arquivo: string; motivo: string }[] = [
  {
    arquivo: 'src/components/itens/lancar-item-dialog.tsx',
    motivo:
      'mantém o estado ENTRE aberturas de propósito (o carrinho e o "Repetir último", :478-491) — semear na abertura apagaria o que o operador deixou montado',
  },
]

function dialogosDeComponentes(): { arquivo: string; codigo: string }[] {
  const achados: { arquivo: string; codigo: string }[] = []
  const visitar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome)
      if (statSync(caminho).isDirectory()) {
        visitar(caminho)
        continue
      }
      if (!/(-dialog|^dialogo-[a-z-]+)\.tsx$/.test(nome) || nome.endsWith('.test.tsx')) continue
      achados.push({
        arquivo: relative(RAIZ, caminho).split(sep).join('/'),
        codigo: readFileSync(caminho, 'utf8'),
      })
    }
  }
  visitar(join(RAIZ, 'src', 'components'))
  return achados.sort((a, b) => a.arquivo.localeCompare(b.arquivo))
}

describe('a regra de semear (funcao pura)', () => {
  it('semeia so na transicao fechado -> aberto', () => {
    expect(deveSemear(false, true)).toBe(true)
    expect(deveSemear(true, false)).toBe(false)
    expect(deveSemear(true, true)).toBe(false)
    expect(deveSemear(false, false)).toBe(false)
  })
})

describe('todo dialogo que semeia de prop usa useDialogoSemeado (F61)', () => {
  const dialogos = dialogosDeComponentes()

  it('o varredor acha os dialogos', () => {
    expect(dialogos.length).toBeGreaterThanOrEqual(26)
  })

  it.each(dialogos)('$arquivo', ({ arquivo, codigo }) => {
    expect(recusasDoDialogo(arquivo, codigo, EXCECOES)).toEqual([])
  })

  it.each(EXCECOES)('a excecao $arquivo existe, semeia de prop e tem motivo', ({ arquivo, motivo }) => {
    const alvo = dialogos.find((d) => d.arquivo === arquivo)
    expect(alvo, `exceção morta: ${arquivo} não existe`).toBeDefined()
    expect(
      analisarDialogo(arquivo, alvo!.codigo).semeadosDeProp.length,
      `exceção morta: ${arquivo} não semeia de prop`,
    ).toBeGreaterThan(0)
    expect(motivo.length).toBeGreaterThanOrEqual(20)
  })

  // SABOTAGEM G, guardada como teste — código sintético, nada em disco.
  describe('a trava enxerga o defeito', () => {
    const DEFEITO = `
      'use client'
      import { useState } from 'react'
      export function MarcaDialog({ marca }: { marca?: { nome: string } }) {
        const [aberto, setAberto] = useState(false)
        const [nome, setNome] = useState(marca?.nome ?? '')
        return <Dialog open={aberto} onOpenChange={setAberto}><input value={nome} onChange={(e) => setNome(e.target.value)} /></Dialog>
      }`
    const CONSERTADO = `
      'use client'
      import { useState } from 'react'
      import { useDialogoSemeado } from '@/components/dialogos/use-dialogo-semeado'
      export function MarcaDialog({ marca }: { marca?: { nome: string } }) {
        const [nome, setNome] = useState(marca?.nome ?? '')
        const { aberto, mudarAberto } = useDialogoSemeado(() => setNome(marca?.nome ?? ''))
        return <Dialog open={aberto} onOpenChange={mudarAberto}><input value={nome} onChange={(e) => setNome(e.target.value)} /></Dialog>
      }`

    it('useState semeado de prop + onOpenChange={setAberto} reprova duas vezes', () => {
      const recusas = recusasDoDialogo('src/components/admin/marca-dialog.tsx', DEFEITO, EXCECOES)
      expect(recusas).toHaveLength(2)
      expect(recusas[0]).toContain('sem useDialogoSemeado')
      expect(recusas[1]).toContain('onOpenChange direto a um setter')
    })

    it('o mesmo diálogo com o hook passa', () => {
      expect(recusasDoDialogo('src/components/admin/marca-dialog.tsx', CONSERTADO, EXCECOES)).toEqual([])
    })

    it('o nome depois do ponto não é a prop (x.marca não semeia)', () => {
      const codigo = `export function XDialog({ marca }: { marca: string }) { const [a] = useState(outro.marca); return null }`
      expect(analisarDialogo('x-dialog.tsx', codigo).semeadosDeProp).toEqual([])
    })
  })
})
