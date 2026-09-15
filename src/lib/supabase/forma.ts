import type { z } from 'zod'
import type { Json } from '@/lib/types/database'

// A FORMA DO QUE SAI DO BANCO — a metade PURA (F58 · Frente C · Decisões 4, 5 e 6).
//
// Este módulo não importa nada de runtime além do próprio Zod (que chega pelo schema), não
// fala com banco e não loga. Ele guarda três coisas, e é importável por qualquer um — pelo
// Vitest, pelo conferidor de formas (`scripts/formas/conferir.mts`) e por `linhas.ts`, que é a
// porta que o aplicativo usa e que acrescenta o `registrarFalha`:
//
//  1. A AMARRAÇÃO, em tipo. O schema de uma leitura fica preso ao tipo que o `select` INFERE:
//     declarar uma coluna que o select não traz não compila; trocar o tipo de uma coluna não
//     compila; e, na forma ESTRITA, esquecer uma coluna que o select traz também não compila.
//     O schema só pode MUDAR o tipo inferido em dois lugares, os dois nomeados: estreitar uma
//     coluna `Json` para a forma real dela, e tirar o `null` de uma coluna de VIEW que o mapa
//     `COLUNAS_DE_VIEW_NAO_NULAS` (`colunas-de-view.ts`) autoriza, com a evidência do SQL vivo.
//     Um `z.object({…})` solto — o `as X[]` de antes com outra roupa — deixaria o `empresa_id`
//     da F63 passar exatamente igual; é isso que esta amarração existe para impedir.
//
//  2. A CONFERÊNCIA, em runtime: cada linha passa pelo schema, e o que não passar vira um
//     `ProblemaDeForma` com o CAMINHO NORMALIZADO do campo e o CÓDIGO da issue — nunca o valor.
//
//  3. O ERRO DE FORMA (`ErroDeForma`), que é o que a leitura LANÇA (decisão i do Johnny,
//     15/09/2026: forma errada é falha de leitura, nunca "registra e segue").
//
// ⚠ NENHUM VALOR DE LINHA SAI DAQUI. A mensagem, os problemas e o `ctx` do log carregam só
// rótulo de leitura, nome de coluna DECLARADA no schema, código de issue e contagens:
//  · o Zod 4 não anexa o valor recebido à issue a menos que se peça `reportInput` — e aqui
//    ninguém pede; mesmo assim a mensagem padrão da issue NÃO é usada, só o `code`;
//  · a chave de um `z.record` e a chave não declarada de um objeto frouxo viram `<chave>`
//    (chave de `jsonb` pode ser DADO — nome de item, slug de filial), o índice de lista vira `[]`;
//  · a issue de chaves desconhecidas (`unrecognized_keys`) leva a CONTAGEM, não os nomes.
//  `linhas-sem-valor.test.ts` prova isto por sabotagem.

// ---------------------------------------------------------------------------
// 1. A amarração
// ---------------------------------------------------------------------------

/** O que o compilador mostra quando a forma não bate com o select. */
export type Recusa<M extends string> = { readonly '⛔ forma recusada pela F58': M }

declare const MARCA_NAO_NULA: unique symbol

/**
 * Marca de tipo de um schema de coluna de VIEW que tira o `null` do tipo gerado — só nasce de
 * `naoNulaNaView` (`colunas-de-view.ts`), que exige a coluna no mapa com a evidência do SQL vivo.
 */
export type MarcaNaoNula = { readonly [MARCA_NAO_NULA]: true }

type Mutuo<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

type SaidaDe<Z> = Z extends z.ZodType ? z.output<Z> : never

type JsonNaoNulo = NonNullable<Json>

/** A coluna (ou o valor) é `jsonb` — o gerador a tipa `Json`, com ou sem `| null`. */
type EhColunaJson<E> = [JsonNaoNulo] extends [NonNullable<E>] ? true : false

/**
 * O `Json` visto pela SAÍDA de um schema Zod. A saída de `z.looseObject` carrega um índice
 * `[chave: string]: unknown` (o que ela não declara passa adiante sem tipo), e `unknown` não cabe
 * no índice do `Json` do gerador — sem esta forma, estreitar um `jsonb` para um objeto FROUXO não
 * compilaria, e o snapshot de `gerados.ts` (que TEM de ser frouxo) ficaria sem porta.
 */
type JsonDeSaida =
  | string
  | number
  | boolean
  | null
  | readonly JsonDeSaida[]
  | { readonly [chave: string]: unknown }

/**
 * Uma coluna confere quando a SAÍDA do schema é:
 *  · para coluna `Json`: qualquer forma JSON (estreitar para a forma real é o propósito);
 *  · para as outras: EXATAMENTE o tipo inferido (atribuível nos dois sentidos);
 *  · com a marca de view não-nula: exatamente o tipo inferido SEM o `null`.
 */
type ColunaConfere<E, Z> =
  EhColunaJson<E> extends true
    ? [SaidaDe<Z>] extends [JsonDeSaida]
      ? true
      : false
    : Mutuo<SaidaDe<Z>, E> extends true
      ? true
      : Z extends MarcaNaoNula
        ? Mutuo<SaidaDe<Z>, NonNullable<E>>
        : false

/** Um schema de LINHA: objeto Zod estrito ou frouxo (o modo se confere em runtime). */
export type FormaDeLinha = z.ZodObject<z.core.$ZodShape, z.core.$ZodObjectConfig>

type ShapeDe<F> = F extends z.ZodObject<infer S, z.core.$ZodObjectConfig> ? S : never

/** Objeto frouxo (`z.looseObject`) — o único cuja configuração de saída tem índice de string. */
type EhFrouxa<F> =
  F extends z.ZodObject<z.core.$ZodShape, infer C>
    ? C extends z.core.$ZodObjectConfig
      ? string extends keyof C['out']
        ? true
        : false
      : false
    : false

type ColunasDivergentes<L, S> = {
  [K in keyof S & keyof L]: ColunaConfere<L[K], S[K]> extends true ? never : K
}[keyof S & keyof L]

type ConfereColunas<L, S> = [ColunasDivergentes<L, S>] extends [never]
  ? unknown
  : Recusa<`o tipo destas colunas diverge do select: ${ColunasDivergentes<L, S> & string}`>

/** `unknown` quando a forma F serve para a linha L; senão, uma `Recusa` com o motivo. */
export type ConfereLinha<L, F> = [L] extends [{ error: true }]
  ? Recusa<'o select não é literal: o supabase-js não infere a linha — junte o texto num literal só'>
  : [Exclude<keyof ShapeDe<F>, keyof L>] extends [never]
    ? EhFrouxa<F> extends true
      ? ConfereColunas<L, ShapeDe<F>>
      : [Exclude<keyof L, keyof ShapeDe<F>>] extends [never]
        ? ConfereColunas<L, ShapeDe<F>>
        : Recusa<`a forma estrita não declara colunas que o select traz: ${Exclude<keyof L, keyof ShapeDe<F>> & string}`>
    : Recusa<`a forma declara colunas que o select não traz: ${Exclude<keyof ShapeDe<F>, keyof L> & string}`>

/**
 * A linha que a leitura devolve: as colunas do select, com o tipo do schema onde ele declara
 * (e o tipo inferido nas demais, que só existem na forma frouxa).
 */
export type LinhaConferida<L, F> = {
  [K in keyof L]: K extends keyof ShapeDe<F> ? SaidaDe<ShapeDe<F>[K]> : L[K]
}

/**
 * `unknown` quando a saída do schema Z cabe no valor V: para `Json` (retorno `jsonb` de RPC),
 * qualquer forma JSON; para escalar, um subtipo do tipo lido.
 */
export type ConfereValor<V, Z> = (
  EhColunaJson<V> extends true
    ? [SaidaDe<Z>] extends [JsonDeSaida]
      ? true
      : false
    : [SaidaDe<Z>] extends [V]
      ? true
      : false
) extends true
  ? unknown
  : Recusa<'a saída do schema não cabe no tipo do valor lido'>

// ---------------------------------------------------------------------------
// 2. O modo da forma — conferido em RUNTIME, porque `$strict` e `$strip` são o MESMO tipo
// ---------------------------------------------------------------------------
//
// Medido no Zod 4.5.4 (`v4/core/schemas.d.ts:634-645`): `$strict` e `$strip` são os dois
// `{ out: {}; in: {} }` — o compilador não distingue `z.strictObject` de `z.object`. O
// `z.object` padrão REMOVE a coluna que não declara (fato 12): num `select('*')` de backup é
// apagar dado em silêncio. A diferença existe no runtime: o estrito tem `catchall` `never`, o
// frouxo `unknown`, e o padrão não tem `catchall`. Por isso a primeira leitura de uma forma sem
// modo lança — um erro de PROGRAMAÇÃO, que nenhum teste de rota deixa passar.

export type ModoDaForma = 'estrita' | 'frouxa'

export function modoDaForma(forma: FormaDeLinha): ModoDaForma | null {
  const catchall = (forma._zod.def as { catchall?: z.ZodType }).catchall
  const tipo = catchall?._zod.def.type
  if (tipo === 'never') return 'estrita'
  if (tipo === 'unknown') return 'frouxa'
  return null
}

// ---------------------------------------------------------------------------
// 3. O caminho normalizado
// ---------------------------------------------------------------------------

export type ProblemaDeForma = {
  /** Ex.: `[].dados.colunas[].rotulo`, `[].contagens.<chave>`. Nunca um valor. */
  readonly caminho: string
  /** O `code` da issue do Zod (`invalid_type`, `unrecognized_keys`…). */
  readonly codigo: string
  /** Só em `unrecognized_keys`: QUANTAS chaves sobraram — os nomes podem ser dado. */
  readonly chaves?: number
}

type DefQualquer = {
  type: string
  shape?: Record<string, z.ZodType>
  catchall?: z.ZodType
  element?: z.ZodType
  valueType?: z.ZodType
  innerType?: z.ZodType
  in?: z.ZodType
  options?: readonly z.ZodType[]
  items?: readonly z.ZodType[]
  rest?: z.ZodType | null
  left?: z.ZodType
  right?: z.ZodType
  getter?: () => z.ZodType
}

const EMBRULHOS = new Set(['optional', 'nullable', 'default', 'prefault', 'readonly', 'nonoptional', 'catch', 'success'])

function desembrulhar(schema: z.ZodType | undefined): z.ZodType | undefined {
  let atual = schema
  for (let i = 0; i < 20 && atual; i++) {
    const def = atual._zod.def as DefQualquer
    if (EMBRULHOS.has(def.type) && def.innerType) atual = def.innerType
    else if (def.type === 'pipe' && def.in) atual = def.in
    else if (def.type === 'lazy' && def.getter) atual = def.getter()
    else return atual
  }
  return atual
}

/** O rótulo de UM segmento do caminho, e o schema onde continuar descendo. */
function passo(
  schema: z.ZodType | undefined,
  segmento: PropertyKey,
): { rotulo: string; proximo: z.ZodType | undefined } {
  const alvo = desembrulhar(schema)
  const def = alvo?._zod.def as DefQualquer | undefined
  const generico = typeof segmento === 'number' ? '[]' : '<chave>'
  if (!def) return { rotulo: generico, proximo: undefined }
  switch (def.type) {
    case 'object':
      if (typeof segmento === 'string' && def.shape && Object.hasOwn(def.shape, segmento)) {
        return { rotulo: segmento, proximo: def.shape[segmento] }
      }
      return { rotulo: '<chave>', proximo: def.catchall }
    case 'record':
      return { rotulo: '<chave>', proximo: def.valueType }
    case 'array':
      return { rotulo: '[]', proximo: def.element }
    case 'tuple':
      return {
        rotulo: '[]',
        proximo: typeof segmento === 'number' ? (def.items?.[segmento] ?? def.rest ?? undefined) : undefined,
      }
    case 'union':
      // Sem saber qual opção a issue percorreu, só é seguro nomear a chave se ALGUMA opção
      // objeto a declara — nome declarado em schema é nome de coluna/campo, não dado.
      for (const opcao of def.options ?? []) {
        const r = passo(opcao, segmento)
        if (r.rotulo !== '<chave>' && r.rotulo !== '[]') return r
      }
      return { rotulo: generico, proximo: undefined }
    case 'intersection': {
      const r = passo(def.left, segmento)
      return r.rotulo === '<chave>' ? passo(def.right, segmento) : r
    }
    default:
      return { rotulo: generico, proximo: undefined }
  }
}

function juntar(partes: readonly string[]): string {
  let saida = ''
  for (const p of partes) {
    if (p === '[]') saida += '[]'
    else saida += saida === '' ? p : `.${p}`
  }
  return saida
}

/** O caminho de uma issue, normalizado: nome declarado, `<chave>` ou `[]`. */
export function caminhoNormalizado(schema: z.ZodType, caminho: readonly PropertyKey[]): string {
  const partes: string[] = []
  let atual: z.ZodType | undefined = schema
  for (const segmento of caminho) {
    const { rotulo, proximo } = passo(atual, segmento)
    partes.push(rotulo)
    atual = proximo
  }
  return juntar(partes)
}

type IssueMinima = { code?: string; path: readonly PropertyKey[]; keys?: readonly string[] }

/** Os problemas de UMA falha de parse, sem valor nenhum. */
export function problemasDaIssue(
  schema: z.ZodType,
  issues: readonly IssueMinima[],
  prefixo: readonly string[] = [],
): ProblemaDeForma[] {
  return issues.map((issue) => {
    const caminho = juntar([...prefixo, caminhoNormalizado(schema, issue.path)].filter((p) => p !== ''))
    const codigo = issue.code ?? 'desconhecido'
    return codigo === 'unrecognized_keys'
      ? { caminho: caminho || '(raiz)', codigo, chaves: issue.keys?.length ?? 0 }
      : { caminho: caminho || '(raiz)', codigo }
  })
}

// ---------------------------------------------------------------------------
// 4. A conferência e o erro
// ---------------------------------------------------------------------------

/** Até quantos problemas DISTINTOS o erro carrega — o log não precisa de mais para achar o schema. */
const MAX_PROBLEMAS = 5

export class ErroDeForma extends Error {
  override readonly name = 'ErroDeForma'
  /** O `code` que `erroEstruturado` (observabilidade) lê. */
  readonly code = 'F58_FORMA'

  constructor(
    /** O rótulo da leitura (`queries.tipos-item.listar`…), escrito no código — nunca dado. */
    readonly rotulo: string,
    readonly problemas: readonly ProblemaDeForma[],
    readonly recusadas: number,
    readonly lidas: number,
  ) {
    const primeiro = problemas[0]
    const alvo = primeiro ? `${primeiro.caminho} (${primeiro.codigo})` : 'sem detalhe'
    const mais = problemas.length > 1 ? ` e mais ${problemas.length - 1} problema(s)` : ''
    super(`Forma inesperada em "${rotulo}": ${recusadas} de ${lidas} linha(s) recusada(s) — ${alvo}${mais}.`)
  }
}

export type Conferencia<T> = {
  aceitas: T[]
  /** Uma entrada por linha recusada: o índice (posição, não dado) e os problemas dela. */
  recusas: { indice: number; problemas: ProblemaDeForma[] }[]
}

/**
 * Passa cada valor pelo schema. NUNCA lança por forma — devolve aceitas e recusas. É a função
 * que o conferidor usa para CONTAR as recusas de produção sem parar na primeira.
 */
export function conferirValores<T>(
  valores: readonly unknown[],
  forma: z.ZodType<T>,
  prefixo: readonly string[] = [],
): Conferencia<T> {
  const aceitas: T[] = []
  const recusas: Conferencia<T>['recusas'] = []
  for (let i = 0; i < valores.length; i++) {
    const r = forma.safeParse(valores[i])
    if (r.success) aceitas.push(r.data)
    else recusas.push({ indice: i, problemas: problemasDaIssue(forma, r.error.issues, prefixo) })
  }
  return { aceitas, recusas }
}

/** Os problemas DISTINTOS de várias recusas, com teto. */
export function problemasDistintos(recusas: Conferencia<unknown>['recusas']): ProblemaDeForma[] {
  const vistos = new Map<string, ProblemaDeForma>()
  for (const r of recusas) {
    for (const p of r.problemas) {
      const chave = `${p.caminho}|${p.codigo}`
      if (!vistos.has(chave)) vistos.set(chave, p)
      if (vistos.size >= MAX_PROBLEMAS) return [...vistos.values()]
    }
  }
  return [...vistos.values()]
}
