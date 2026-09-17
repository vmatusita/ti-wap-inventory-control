import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { CATALOGO } from '@/lib/queries/formas/catalogo'
import type { Descritor } from '@/lib/supabase/leitura'

// O CATÁLOGO DE FORMAS — completo, e falando da mesma relação que o call-site (F58 · Frentes C e E).
//
// Duas garantias, e as duas protegem a prova contra produção (decisão ii do Johnny):
//
//  1. TODO descritor exportado de `src/lib/queries/formas/**` está em `CATALOGO`. O conferidor de
//     formas só percorre o catálogo; uma forma fora dele nunca passaria pelo dado real, e a decisão i
//     a faria lançar em produção sem ter sido provada.
//
//  2. O NOME da relação (ou da RPC) do descritor aparece LITERAL no arquivo de `src/**` que usa
//     aquele descritor. O call-site escreve `.from('movimentacoes')` / `chamarRpc(client,
//     'rel_resumo_filiais', …)` literal — exigência do tripwire do visualizador —, e o descritor guarda o
//     mesmo nome para o conferidor. Sem esta checagem, um call-site que lesse OUTRA relação com a
//     forma daqui só seria pego se a amarração de tipo falhasse por acaso.
//
// Lê o disco na COLETA.

const RAIZ = process.cwd()
const PASTA_FORMAS = join(RAIZ, 'src', 'lib', 'queries', 'formas')
/** O tipo gerado, lido como TEXTO — só para saber se uma coluna vem anulável do banco (checagem 3b). */
const TIPOS_GERADOS = readFileSync(join(RAIZ, 'src', 'lib', 'types', 'database.ts'), 'utf8')

function varrer(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) varrer(p, acc)
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(p)
  }
  return acc
}
const rel = (p: string) => relative(RAIZ, p).split(sep).join('/')

/** Os nomes `LEITURA_*`/`RECIBO_*` exportados pelos módulos de forma. */
const EXPORTADOS = varrer(PASTA_FORMAS)
  .filter((p) => !p.endsWith('catalogo.ts'))
  .flatMap((p) =>
    [...readFileSync(p, 'utf8').matchAll(/export const ((?:LEITURA|RECIBO)_[A-Z0-9_]+)\s*=/g)].map((m) => m[1]),
  )

/** Os nomes na lista `CATALOGO`, na ordem em que aparecem — a mesma ordem do array em runtime. */
const FONTE_CATALOGO = readFileSync(join(PASTA_FORMAS, 'catalogo.ts'), 'utf8')
const CORPO_DA_LISTA = FONTE_CATALOGO.slice(FONTE_CATALOGO.indexOf('export const CATALOGO'))
const NOMES_NO_CATALOGO = [...CORPO_DA_LISTA.matchAll(/^\s+((?:LEITURA|RECIBO)_[A-Z0-9_]+),?\s*$/gm)].map((m) => m[1])

/** O descritor de runtime de cada nome (a lista e o array têm a mesma ordem). */
const POR_NOME = new Map<string, Descritor>(NOMES_NO_CATALOGO.map((nome, i) => [nome, CATALOGO[i]]))

const ARQUIVOS_SRC = varrer(join(RAIZ, 'src'))
  .filter((p) => !p.startsWith(PASTA_FORMAS))
  .map((p) => ({ arquivo: rel(p), fonte: readFileSync(p, 'utf8') }))

describe('o catálogo de formas', () => {
  it('a varredura enxerga os módulos e a lista (guarda do próprio teste)', () => {
    expect(EXPORTADOS.length).toBeGreaterThan(0)
    // a leitura por texto da lista casa o array de runtime, item a item
    expect(NOMES_NO_CATALOGO.length).toBe(CATALOGO.length)
  })

  it('todo descritor exportado de formas/** está no CATALOGO', () => {
    const fora = EXPORTADOS.filter((nome) => !POR_NOME.has(nome))
    expect(fora, 'forma fora do catálogo nunca passaria pelo conferidor contra produção').toEqual([])
  })

  it('nenhum rótulo repetido (o rótulo identifica a leitura no erro de forma e na evidência)', () => {
    const rotulos = CATALOGO.map((d) => d.rotulo)
    expect(rotulos.filter((r, i) => rotulos.indexOf(r) !== i)).toEqual([])
  })

  it.each(NOMES_NO_CATALOGO.map((nome) => [nome]))(
    '%s: quem usa o descritor lê a MESMA relação/RPC, com o nome literal',
    (nome) => {
      const d = POR_NOME.get(nome)!
      if (d.tipo === 'recibo') return // RPC que escreve: provada pelo SQL, sem call-site de leitura
      const alvo = d.tipo === 'relacao' ? d.origem : d.rpc
      const usuarios = ARQUIVOS_SRC.filter((a) => new RegExp(String.raw`\b${nome}\b`).test(a.fonte))
      expect(usuarios.length, `${nome}: nenhum arquivo de src/** usa este descritor`).toBeGreaterThan(0)
      const literal =
        d.tipo === 'relacao'
          ? new RegExp(String.raw`\.from\(\s*'${alvo}'\s*\)`)
          : new RegExp(String.raw`chamarRpc\([^,()]+,\s*'${alvo}'`)
      const semLiteral = usuarios.filter((a) => !literal.test(a.fonte)).map((a) => a.arquivo)
      expect(semLiteral, `${nome}: o arquivo usa a forma mas não lê '${alvo}' com o nome literal`).toEqual([])
    },
  )

  // 3. A PRÉ-CONDIÇÃO DE FILTRO (`naoNulas`), nos dois sentidos. O supabase-js estreita o tipo inferido com
  //    `.not(coluna, 'is', null)`, e a amarração então EXIGE a forma não-nula — mas a forma só vale para a leitura
  //    FILTRADA. O conferidor lê a relação com o filtro que o descritor declara; esta checagem garante que o descritor
  //    declara o que o call-site faz. (Achado da rodada cedo do conferidor: as sugestões de colaborador e setor
  //    recusaram 2.093 e 3.247 linhas de produção porque o filtro só existia no call-site.)
  const naoNula = (schema: z.core.$ZodType | undefined): boolean => {
    const tipo = schema?._zod.def.type
    return tipo !== undefined && tipo !== 'nullable' && tipo !== 'optional'
  }
  it.each(NOMES_NO_CATALOGO.map((nome) => [nome]))('%s: a pré-condição `naoNulas` bate com o `.not(…, "is", null)` do call-site', (nome) => {
    const d = POR_NOME.get(nome)!
    if (d.tipo !== 'relacao') return
    const usuarios = ARQUIVOS_SRC.filter((a) => new RegExp(String.raw`\b${nome}\b`).test(a.fonte))
    const filtro = (col: string) => new RegExp(String.raw`\.not\(\s*'${col}',\s*'is',\s*null\s*\)`)
    // (a) o que o descritor declara, o call-site faz
    for (const col of d.naoNulas ?? []) {
      const semFiltro = usuarios.filter((a) => !filtro(col).test(a.fonte)).map((a) => a.arquivo)
      expect(semFiltro, `${nome}: declara naoNulas '${col}', mas o arquivo não filtra .not('${col}', 'is', null)`).toEqual([])
    }
    // (b) coluna NÃO-nula na forma que o call-site filtra por `.not(…, 'is', null)` tem de estar declarada
    const shape: Readonly<Record<string, z.core.$ZodType>> = d.forma.shape
    for (const [col, schema] of Object.entries(shape)) {
      if (!naoNula(schema) || (d.naoNulas ?? []).includes(col)) continue
      const filtram = usuarios.filter((a) => filtro(col).test(a.fonte)).map((a) => a.arquivo)
      // o filtro pode ser de OUTRA leitura do mesmo arquivo — só vale como achado se a coluna vier ANULÁVEL do banco
      if (filtram.length === 0) continue
      expect(
        colunaAnulavelNoGerador(d.origem, col),
        `${nome}: a forma declara '${col}' não-nula e o arquivo filtra .not('${col}', 'is', null), mas o descritor não declara naoNulas — o conferidor leria os nulos que o call-site descarta`,
      ).toBe(false)
    }
  })
})

/** A coluna vem anulável no tipo gerado (`src/lib/types/database.ts`)? Leitura por texto, sem importar o arquivo. */
function colunaAnulavelNoGerador(relacao: string, coluna: string): boolean {
  // Tolerante a CRLF: `core.autocrlf` pode trazer o arquivo com \r\n para a mesa, e uma regex só de \n faria a checagem
  // 3b devolver "não anulável" calada — nunca reprovaria.
  const texto = TIPOS_GERADOS.replace(/\r\n/g, '\n')
  const i = texto.search(new RegExp(String.raw`\n {6}${relacao}: \{\n {8}Row: \{`))
  if (i === -1) throw new Error(`catalogo.test: não achei a Row de "${relacao}" em database.ts — o formato do gerador mudou?`)
  const fim = texto.indexOf('\n        }', i)
  const row = texto.slice(i, fim)
  return new RegExp(String.raw`\n {10}${coluna}: [^\n]*\| null\n`).test(row + '\n')
}
