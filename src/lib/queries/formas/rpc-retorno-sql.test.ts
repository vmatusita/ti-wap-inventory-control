import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { corpoVigente } from '../../../../scripts/db/corpo-vigente.mjs'
import { CATALOGO } from '@/lib/queries/formas/catalogo'
import type { ReciboDeRpc } from '@/lib/supabase/leitura'

// OS RECIBOS DE RPC, PROVADOS PELO SQL VIVO — sem chamar a função (F58 · Frente E · decisão ii).
//
// Uma RPC que ESCREVE nunca é chamada pelo conferidor de formas, em banco nenhum; e uma RPC que só o
// cargo desenvolvedor alcança não pode ser chamada pela conta de produção do conferidor (admin). A
// forma do que elas devolvem — o "recibo" — se prova, então, contra o CORPO VIVO da função (o último
// `create or replace` nas migrations, via `corpo-vigente.mjs`):
//
//  · `returns table (…)`  → a forma é um objeto ESTRITO com EXATAMENTE as colunas do retorno vivo;
//  · `returns jsonb`       → cada VARIANTE do objeto devolvido (cada `jsonb_build_object` de um
//    `return`, de um `select` final ou de uma atribuição a variável) tem de CABER na forma: nenhuma
//    chave que a forma estrita não declare (a issue `unrecognized_keys` lançaria) e nenhuma chave
//    OBRIGATÓRIA da forma ausente da variante (lançaria `invalid_type`). Uma forma com mais de uma
//    variante real declara as chaves das variantes curtas como opcionais, ou é uma união.
//
// ⚠ O QUE ELE NÃO PROVA: o TIPO de cada valor (a mesa não executa o SQL). Isso é o conferidor, na
// execução, para as RPCs de leitura; para as que escrevem, o tipo segue a coluna/variável que o corpo
// grava — e é o motivo de o recibo ser estrito nas chaves. Disco lido na COLETA.

const normal = (s: string) => s.replace(/--[^\n]*/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** O trecho entre o `(` que abre em `abre` e o `)` que o fecha. */
function entreParenteses(sql: string, abre: number): string {
  let nivel = 0
  for (let i = abre; i < sql.length; i++) {
    const c = sql[i]
    if (c === "'") {
      i = sql.indexOf("'", i + 1)
      if (i === -1) break
      continue
    }
    if (c === '(') nivel++
    else if (c === ')' && --nivel === 0) return sql.slice(abre + 1, i)
  }
  return ''
}

/** Os itens de primeiro nível de uma lista separada por vírgula. */
function itensDePrimeiroNivel(lista: string): string[] {
  const itens: string[] = []
  let nivel = 0
  let atual = ''
  let emTexto = false
  for (const c of lista) {
    if (c === "'") emTexto = !emTexto
    if (!emTexto && c === '(') nivel++
    if (!emTexto && c === ')') nivel--
    if (!emTexto && c === ',' && nivel === 0) {
      itens.push(atual.trim())
      atual = ''
      continue
    }
    atual += c
  }
  if (atual.trim()) itens.push(atual.trim())
  return itens
}

type Retorno = { tipo: 'tabela'; colunas: string[] } | { tipo: 'jsonb'; variantes: string[][] } | { tipo: 'outro'; texto: string }

export function retornoVivo(sqlBruto: string): Retorno {
  const sql = normal(sqlBruto)
  const cabecalho = sql.slice(0, sql.search(/\bas \$[a-z_]*\$/))
  const iTabela = cabecalho.search(/\breturns table ?\(/)
  if (iTabela !== -1) {
    const lista = entreParenteses(cabecalho, cabecalho.indexOf('(', iTabela))
    return { tipo: 'tabela', colunas: itensDePrimeiroNivel(lista).map((c) => c.split(' ')[0]) }
  }
  if (/\breturns jsonb\b/.test(cabecalho)) {
    const variantes: string[][] = []
    for (const m of sql.matchAll(/(?:\breturn|\bselect|:=)\s*jsonb_build_object\s*\(/g)) {
      const abre = (m.index ?? 0) + m[0].length - 1
      const args = itensDePrimeiroNivel(entreParenteses(sql, abre))
      const chaves = args.filter((_, i) => i % 2 === 0).map((a) => /^'([^']+)'$/.exec(a)?.[1] ?? `(não literal: ${a.slice(0, 30)})`)
      variantes.push(chaves)
    }
    return { tipo: 'jsonb', variantes }
  }
  return { tipo: 'outro', texto: cabecalho.slice(cabecalho.lastIndexOf('returns')) }
}

type DefObjeto = { type: string; shape?: Record<string, z.ZodType>; catchall?: z.ZodType; options?: readonly z.ZodType[]; innerType?: z.ZodType }
const def = (s: z.ZodType) => s._zod.def as unknown as DefObjeto

function opcoesDeObjeto(forma: z.ZodType): DefObjeto[] {
  const d = def(forma)
  if (d.type === 'union') return (d.options ?? []).flatMap(opcoesDeObjeto)
  if (d.type === 'nullable' && d.innerType) return opcoesDeObjeto(d.innerType)
  return d.type === 'object' ? [d] : []
}
const ehOpcional = (s: z.ZodType): boolean => {
  const d = def(s)
  if (d.type === 'optional') return true
  if ((d.type === 'nullable' || d.type === 'default') && d.innerType) return ehOpcional(d.innerType)
  return false
}
const ehEstrita = (d: DefObjeto) => d.catchall !== undefined && def(d.catchall).type === 'never'

/** A variante cabe numa opção objeto da forma? Devolve o motivo quando não cabe. */
export function varianteCabe(chaves: string[], forma: z.ZodType): string | null {
  const opcoes = opcoesDeObjeto(forma)
  if (opcoes.length === 0) return 'a forma do recibo jsonb não é objeto (nem união de objetos)'
  const motivos: string[] = []
  for (const o of opcoes) {
    const shape = o.shape ?? {}
    const sobrando = ehEstrita(o) ? chaves.filter((c) => !(c in shape)) : []
    const faltando = Object.entries(shape).filter(([k, s]) => !chaves.includes(k) && !ehOpcional(s)).map(([k]) => k)
    if (sobrando.length === 0 && faltando.length === 0) return null
    motivos.push(`sobrando [${sobrando.join(', ')}] · faltando [${faltando.join(', ')}]`)
  }
  return motivos.join(' | ')
}

const RECIBOS = CATALOGO.filter((d): d is ReciboDeRpc => d.tipo === 'recibo').map((r) => {
  const { sql, arquivo } = corpoVigente(`public.${r.rpc}`)
  return [r.rotulo, r, arquivo, retornoVivo(sql)] as const
})

describe('a leitura do retorno vivo (guarda do próprio teste)', () => {
  it('returns table devolve as colunas', () => {
    const r = retornoVivo('create function f() returns table (a uuid, b text) language sql as $$ select 1 $$;')
    expect(r).toEqual({ tipo: 'tabela', colunas: ['a', 'b'] })
  })
  it('jsonb devolve TODAS as variantes de return — e só as de primeiro nível', () => {
    // o `jsonb_build_object('z', 1)` ANINHADO é o valor da chave `de`, não uma variante do retorno:
    // a leitura só toma o objeto que vem logo depois de `return`, `select` ou `:=`
    const r = retornoVivo(
      "create function f() returns jsonb language plpgsql as $$ begin if x then return jsonb_build_object('alterado', false, 'id', v); end if; return jsonb_build_object('alterado', true, 'id', v, 'de', jsonb_build_object('z', 1)); end $$;",
    )
    expect(r).toEqual({ tipo: 'jsonb', variantes: [['alterado', 'id'], ['alterado', 'id', 'de']] })
  })
})

describe('cada recibo cabe no retorno vivo da função', () => {
  it.each(RECIBOS)('%s', (_rotulo, recibo, arquivo, retorno) => {
    if (retorno.tipo === 'tabela') {
      const [opcao] = opcoesDeObjeto(recibo.forma)
      expect(opcao, `${recibo.rpc}: recibo de returns table tem de ser objeto`).toBeDefined()
      expect(ehEstrita(opcao!), `${recibo.rpc}: recibo de returns table tem de ser ESTRITO`).toBe(true)
      expect(Object.keys(opcao!.shape ?? {}).sort(), `${recibo.rpc} (${arquivo})`).toEqual([...retorno.colunas].sort())
      return
    }
    if (retorno.tipo === 'jsonb') {
      // variantes aninhadas (jsonb_build_object DENTRO de outro) aparecem como variantes à parte;
      // só as de primeiro nível contam — as que têm ao menos uma chave que a forma conhece
      const conhecidas = new Set(opcoesDeObjeto(recibo.forma).flatMap((o) => Object.keys(o.shape ?? {})))
      const deTopo = retorno.variantes.filter((v) => v.some((c) => conhecidas.has(c)))
      expect(deTopo.length, `${recibo.rpc} (${arquivo}): nenhuma variante do jsonb bate com a forma`).toBeGreaterThan(0)
      for (const v of deTopo) expect(varianteCabe(v, recibo.forma), `${recibo.rpc} (${arquivo}) variante [${v.join(', ')}]`).toBeNull()
      return
    }
    // escalar: nada a conferir por chave
    expect(retorno.tipo).toBe('outro')
  })
})
