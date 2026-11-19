import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { corpoVigente } from '../../../scripts/db/corpo-vigente.mjs'
import { FORMA_SNAPSHOT } from '@/lib/queries/formas/relatorios-gerados'
import {
  CAMPOS_QUE_NAO_SAEM,
  LISTA_BRANCA_PORTA,
  LISTA_DO_SNAPSHOT,
  cabeNaLista,
  caminhosDaLista,
  completarParaRender,
  type Lista,
} from './lista-branca-porta'

// A TRAVA DA LISTA BRANCA DA PORTA (F68 · decisão 7 · sabotagem E).
//
// Três perguntas, as três sobre o que está no DISCO hoje:
//   1. TS = SQL: a lista de `lista-branca-porta.ts` é, por igualdade profunda, o `k_lista` do corpo VIGENTE de
//      `public.relatorio_publico_dados` (o último `create function` dela nas migrations). Uma chave acrescentada de um lado
//      só reprova aqui.
//   2. TODO campo da forma Zod do snapshot (`FORMA_SNAPSHOT`, schemas 1 e 2 — que espelha `tipos.ts` campo a campo, com a
//      prova de compilação de `relatorios-gerados-tipos.test.ts`) está classificado: OU sai (está na lista) OU não sai
//      (`CAMPOS_QUE_NAO_SAEM`, com motivo) — nunca nos dois, nunca em nenhum. Um campo novo em `tipos.ts` (e na forma)
//      reprova até alguém decidir, por escrito, se ele sai.
//   3. Nenhum nome de campo de pessoa ou de id interno está na lista (a sabotagem E pelo lado do TS).

type Def = { type: string; shape?: Record<string, z.ZodType>; element?: z.ZodType; innerType?: z.ZodType; options?: z.ZodType[] }
const defDe = (s: z.ZodType) => (s as unknown as { _zod: { def: Def } })._zod.def

/** Os caminhos-folha de uma forma Zod (`a.b[].c`). Objeto → as chaves; array → `[]`; optional/nullable → o de dentro;
 *  união → a soma dos ramos; o resto é folha. */
function caminhosDaForma(schema: z.ZodType, prefixo = ''): string[] {
  const d = defDe(schema)
  switch (d.type) {
    case 'object':
      return Object.entries(d.shape ?? {}).flatMap(([k, v]) => caminhosDaForma(v, prefixo ? `${prefixo}.${k}` : k))
    case 'array':
      return caminhosDaForma(d.element!, `${prefixo}[]`)
    case 'optional':
    case 'nullable':
      return caminhosDaForma(d.innerType!, prefixo)
    case 'union':
      return [...new Set((d.options ?? []).flatMap((o) => caminhosDaForma(o, prefixo)))]
    default:
      return [prefixo]
  }
}

const SQL = corpoVigente('public.relatorio_publico_dados(text, text, text, jsonb)')

function listaDoSql(): unknown {
  const m = /k_lista\s+constant\s+jsonb\s*:=\s*'([\s\S]*?)'::jsonb\s*;/.exec(SQL.sql)
  if (!m) throw new Error(`${SQL.arquivo}: o corpo de relatorio_publico_dados não tem mais o literal k_lista`)
  return JSON.parse(m[1]!)
}

const DA_FORMA = [...new Set(caminhosDaForma(FORMA_SNAPSHOT as unknown as z.ZodType))].sort()
const SAEM = caminhosDaLista(LISTA_DO_SNAPSHOT as Lista).sort()
const NAO_SAEM = CAMPOS_QUE_NAO_SAEM.map((c) => c.caminho as string).sort()

describe('lista branca da porta: TS = SQL', () => {
  it('o k_lista de relatorio_publico_dados (corpo vigente) é, por igualdade profunda, LISTA_BRANCA_PORTA', () => {
    expect(listaDoSql()).toEqual(JSON.parse(JSON.stringify(LISTA_BRANCA_PORTA)))
  })

  it('a função monta TODA resposta de tabela pela projeção (relatorio_publico_projetar com uma seção do k_lista)', () => {
    const corpo = SQL.sql.replace(/--[^\n]*/g, '')
    const usos = corpo.match(/public\.relatorio_publico_projetar\s*\(/g) ?? []
    const secoes = [...corpo.matchAll(/k_lista\s*->\s*'([a-z]+)'/g)].map((m) => m[1])
    expect(usos.length).toBeGreaterThanOrEqual(6)
    expect(new Set(secoes)).toEqual(new Set(Object.keys(LISTA_BRANCA_PORTA)))
  })
})

describe('lista branca da porta: todo campo do snapshot está classificado', () => {
  it('a forma do snapshot tem os campos que a lista e a classificação dizem (sanidade do varredor)', () => {
    expect(DA_FORMA.length).toBeGreaterThan(150)
    expect(DA_FORMA).toContain('saidas[].colaboradorSetor')
    expect(DA_FORMA).toContain('ultimasMovimentacoes[].colaborador_setor')
  })

  it('todo campo da forma SAI ou NÃO SAI — e nenhum fica sem classe', () => {
    const semClasse = DA_FORMA.filter((c) => !SAEM.includes(c) && !NAO_SAEM.includes(c))
    expect(semClasse, 'campo do snapshot sem classe — decida se ele sai (lista) ou não (CAMPOS_QUE_NAO_SAEM)').toEqual([])
  })

  it('nenhum campo está nas duas classes', () => {
    expect(SAEM.filter((c) => NAO_SAEM.includes(c))).toEqual([])
  })

  it('nenhuma entrada envelheceu: todo caminho da lista e da classificação existe na forma', () => {
    expect(SAEM.filter((c) => !DA_FORMA.includes(c))).toEqual([])
    expect(NAO_SAEM.filter((c) => !DA_FORMA.includes(c))).toEqual([])
  })

  it('a contagem: 213 caminhos saem, 15 não saem (o PLAN-F68 §4)', () => {
    expect({ saem: SAEM.length, naoSaem: NAO_SAEM.length }).toEqual({ saem: DA_FORMA.length - 15, naoSaem: 15 })
  })
})

describe('lista branca da porta: nenhum campo de pessoa nem id interno', () => {
  const PROIBIDO = /colaborador|setor|autor|gerado_?por|criado_?por|ativoId|empresa_?id|filial_?id|senha_?id|hash|^id$/i
  const todas = (l: Lista): string[] =>
    l === true ? [] : Array.isArray(l) ? todas(l[0] as Lista)
      : Object.entries(l as Record<string, Lista>).flatMap(([k, v]) => [k, ...todas(v)])

  it('nenhuma chave da lista do SNAPSHOT tem nome de pessoa ou de id interno', () => {
    expect(todas(LISTA_DO_SNAPSHOT as Lista).filter((k) => PROIBIDO.test(k))).toEqual([])
  })

  it('fora do snapshot, o único `id` que sai é o do relatório (o endereço do detalhe e dos vizinhos)', () => {
    const { gerado, ...resto } = LISTA_BRANCA_PORTA
    const geradoSemDados = Object.fromEntries(Object.entries(gerado).filter(([k]) => k !== 'dados'))
    const chaves = todas({ ...resto, gerado: geradoSemDados } as Lista).filter((k) => PROIBIDO.test(k))
    expect([...new Set(chaves)]).toEqual(['id'])
  })
})

describe('lista branca da porta: o TS fecha a segunda linha', () => {
  it('cabeNaLista recusa uma chave de pessoa, um objeto numa folha, e aceita o que a lista deixa', () => {
    const lista = LISTA_DO_SNAPSHOT as Lista
    expect(cabeNaLista({ saidas: [{ patrimonio: 'WAP0001234', obs: null }] }, lista)).toBe(true)
    expect(cabeNaLista({ saidas: [{ patrimonio: 'WAP0001234', colaboradorSetor: 'Fulano' }] }, lista)).toBe(false)
    expect(cabeNaLista({ meta: { observacao: { aninhado: 'x' } } }, lista)).toBe(false)
    expect(cabeNaLista({ manutencao: [{ anotacoes: [{ texto: 't', autor: 'Fulano' }] }] }, lista)).toBe(false)
  })

  it('completarParaRender devolve as chaves de pessoa como null e os ids como índice — nunca um valor', () => {
    const r = completarParaRender({
      saidas: [{ patrimonio: 'WAP0001234' }, { patrimonio: 'WAP0001235' }],
      manutencao: [{ anotacoes: [{ texto: 't', em: '2001-01-01' }] }],
    }) as { saidas: Record<string, unknown>[]; manutencao: { anotacoes: Record<string, unknown>[] }[] }
    expect(r.saidas[0]).toEqual({ patrimonio: 'WAP0001234', colaboradorSetor: null, id: 'porta-0' })
    expect(r.saidas[1]!.id).toBe('porta-1')
    expect(r.manutencao[0]!.anotacoes[0]!.autor).toBeNull()
    expect('ativoId' in r.saidas[0]!).toBe(false)
  })
})
