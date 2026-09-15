import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
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
//     'rel_resumo', …)` literal — exigência do tripwire do visualizador —, e o descritor guarda o
//     mesmo nome para o conferidor. Sem esta checagem, um call-site que lesse OUTRA relação com a
//     forma daqui só seria pego se a amarração de tipo falhasse por acaso.
//
// Lê o disco na COLETA.

const RAIZ = process.cwd()
const PASTA_FORMAS = join(RAIZ, 'src', 'lib', 'queries', 'formas')

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
})
