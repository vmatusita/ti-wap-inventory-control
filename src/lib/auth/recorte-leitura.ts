// O RECORTE DE LEITURA — o que uma sessão pode ler, e o tipo que torna "sem recorte"
// irrepresentável (F57).
//
// Hoje a palavra "filial" carrega quatro significados fundidos: o escopo de ESCRITA (onde a
// pessoa grava), o filtro de EXIBIÇÃO (o que ela marcou no seletor), a chave de IDENTIDADE do
// ativo (o índice por filial da 0091) e — o que não tinha nome nenhum — o recorte de LEITURA:
// o que essa sessão pode ver. Este módulo é a casa do quarto.
//
// ⚠ O QUE ELE É HOJE: um NO-OP. `recorteDe()` devolve o recorte UNIVERSAL para toda sessão, e
// isso é a RESPOSTA CORRETA, não um atalho: a ADR-001 e a ADR-002 dão o sistema inteiro em
// modo leitura a todo logado ativo (o piso é `papel_atual() is not null` no banco, migrations
// 0070/0073), e o visualizador por senha lê os relatórios inteiros. Nada muda para quem opera.
// É a regra 5 do §4 do plano ("no-op primeiro"): a fechadura entra inerte, com uma empresa só.
//
// ⚠ O QUE ELE SERÁ NA VIRADA (F70/F72): `recorteDe()` passa a devolver as unidades da EMPRESA da
// sessão, e `efetivar()` — que já hoje é uma interseção de verdade — começa a cortar. Um lugar,
// e nenhum call-site para caçar: toda query e toda action que filtra por filial já recebe
// `UnidadesEfetivas`, e `UnidadesEfetivas` só nasce aqui dentro.
//
// ⚠ POR QUE UM TIPO NOMINAL, e não mais `number[]`. A convenção antiga era `[] = todas`, escrita
// em caixa alta no cabeçalho de `filtros/filial.ts`. Ela funciona enquanto "todas" é a
// resposta certa para quem pede nada — e vira FAIL-OPEN no dia em que uma interseção esvaziar:
// o recorte da empresa ∩ o filtro da URL dá vazio, o vazio significa "sem recorte", e a query
// devolve o acervo de todas as empresas. Sem erro nenhum. Aqui a lista vazia não existe: o
// "tudo" tem nome (`todas`), o "nada" tem nome (`nenhuma`), e a lista só existe com pelo menos
// um valor.
//
// ⚠ E O QUE ELE NÃO É: `return selecao`. A distinção decide se a fechadura é verificável — é o
// argumento de `pertenceAoEscopo` (src/lib/escopo/pertencimento.ts). Um `efetivar` que devolvesse
// a seleção sem olhar o recorte seria indetectável por EFEITO enquanto o recorte for universal:
// nenhum teste distinguiria "intersectou e concordou" de "não intersectou". Por isso ela é uma
// interseção de verdade, que hoje só recebe o recorte universal — alimentada com um recorte
// RESTRITO ela corta, e `recorte.test.ts` prova exatamente isso.

import type { PapelUsuario } from '@/lib/auth/papeis'
import type { SelecaoDeUnidades, SelecaoDeUnidadesPorSlug } from '@/lib/filtros/filial'

// ---------------------------------------------------------------------------
// O recorte
// ---------------------------------------------------------------------------

/** Uma unidade que o recorte alcança — com as DUAS chaves, porque as duas famílias de filtro
 *  existem de propósito (as views de pendência e de conflito expõem o slug) e porque, depois da
 *  virada, slug repete entre empresas: só o recorte sabe qual `matriz` é a da sessão. */
export type UnidadeDoRecorte = { readonly id: number; readonly slug: string }

export type RecorteDeLeitura =
  /** Lê todas as unidades, e também as linhas que não pertencem a unidade nenhuma. */
  | { readonly alcance: 'universal' }
  | {
      readonly alcance: 'restrito'
      readonly unidades: readonly UnidadeDoRecorte[]
      /** Alcança as linhas SEM unidade (o consolidado de `/relatorios/gerados`)? */
      readonly alcancaSemUnidade: boolean
    }

/** O único recorte que existe hoje. Congelado: é compartilhado por toda sessão. */
export const RECORTE_UNIVERSAL: RecorteDeLeitura = Object.freeze({ alcance: 'universal' })

/**
 * O menor recorte de sessão de que a pergunta precisa. Estrutural de propósito — `Operador`
 * (`auth/acesso.ts`, só-servidor), `Permissoes` (`components/layout/permissoes.ts`) e
 * `OperadorDoFiltro` (`filtros/filial.ts`) servem, e nenhuma tela importa módulo de servidor
 * para chamar isto. `null`/`undefined` é o visualizador por senha e a sessão sem perfil.
 */
export type SessaoDoRecorte = { readonly papel: PapelUsuario } | null | undefined

/**
 * O que esta sessão pode ler.
 *
 * ⚠ PONTO DE INJEÇÃO (F70/F72): aqui passa a sair o recorte da EMPRESA da sessão. O parâmetro
 * já existe e já é passado por todos os chamadores — é isso que torna a virada uma troca de
 * CORPO, e não uma caçada por call-sites.
 *
 * O parâmetro é aceito e IGNORADO hoje, e isso é deliberado (o mesmo argumento de
 * `escopoDoImportLog`): todo cargo lê tudo (ADR-001/002), então o universal é a resposta certa
 * para qualquer sessão.
 */
export function recorteDe(sessao: SessaoDoRecorte): RecorteDeLeitura {
  // `void` e não `_sessao`: o prefixo com underline calaria o lint mas apagaria o nome, e o
  // nome é metade da documentação. A linha diz em código o que o comentário diz em prosa.
  void sessao
  return RECORTE_UNIVERSAL
}

// ---------------------------------------------------------------------------
// As unidades efetivas
// ---------------------------------------------------------------------------

/** As duas famílias de filtro de filial: por id (`filial_id`) e por slug (as views). */
export type FamiliaDeUnidade = 'id' | 'slug'

export type ValorDaFamilia<F extends FamiliaDeUnidade> = F extends 'id' ? number : string

/**
 * O que a query aplica — a ÚNICA forma de ler `UnidadesEfetivas`.
 *
 * - `todas` — nenhum filtro: todas as unidades e as linhas sem unidade.
 * - `lista` — estas unidades (NUNCA vazia: `valores` é tupla com pelo menos um); com
 *   `incluiSemUnidade`, também as linhas que não pertencem a unidade nenhuma.
 * - `somente-sem-unidade` — só as linhas sem unidade (`/relatorios/gerados?filial=geral`).
 * - `nenhuma` — nada passa. É o que uma interseção vazia produz, e tem nome para nunca poder
 *   ser confundida com `todas`.
 */
export type VistaDasUnidades<T> =
  | { readonly modo: 'todas' }
  | {
      readonly modo: 'lista'
      readonly valores: readonly [T, ...T[]]
      readonly incluiSemUnidade: boolean
    }
  | { readonly modo: 'somente-sem-unidade' }
  | { readonly modo: 'nenhuma' }

// A marca. Um `Symbol` de verdade, NÃO exportado: fora deste arquivo não há como escrever a
// chave, então não há objeto literal que satisfaça o tipo, e nenhum `as` direto converte para
// ele (os tipos não se sobrepõem). A única fuga que o TypeScript não fecha — a dupla asserção
// por `unknown` — é fechada pela trava de fonte de `recorte.test.ts`.
const MARCA: unique symbol = Symbol('UnidadesEfetivas')

/**
 * As unidades que uma query ou uma action pode ler: o recorte da sessão ∩ o que foi pedido.
 *
 * NOMINAL — só `efetivar` produz. Toda função que filtra por filial recebe isto, nunca
 * `number[]`/`string[]` cru. Leia com `lerUnidades`.
 *
 * ⚠ Não atravessa a fronteira do Server Component: chave de símbolo não serializa. Ele vive
 * entre a página/action e a query; para uma prop de componente, derive valores simples da vista.
 */
export type UnidadesEfetivas<F extends FamiliaDeUnidade = 'id'> = {
  readonly [MARCA]: {
    readonly familia: F
    readonly vista: VistaDasUnidades<ValorDaFamilia<F>>
  }
}

function naoVazia<T>(xs: readonly T[]): xs is readonly [T, ...T[]] {
  return xs.length > 0
}

/** Sem repetição, na ordem em que apareceram (a da URL). */
function unicos<T>(xs: readonly T[]): T[] {
  const saida: T[] = []
  for (const x of xs) if (!saida.includes(x)) saida.push(x)
  return saida
}

/**
 * A INTERSEÇÃO, genérica nas duas famílias.
 *
 * `doRecorte === null` é o recorte universal; `pedido === null` é a seleção `todas`. Os dois
 * operandos entram SEMPRE — é o que faz desta função uma operação, e não uma cópia da seleção.
 */
function intersectar<T>(
  doRecorte: { readonly valores: readonly T[]; readonly alcancaSemUnidade: boolean } | null,
  pedido: { readonly valores: readonly T[]; readonly incluiSemUnidade: boolean } | null,
): VistaDasUnidades<T> {
  if (doRecorte === null && pedido === null) return Object.freeze({ modo: 'todas' })

  const valores = unicos(
    pedido === null
      ? (doRecorte?.valores ?? [])
      : doRecorte === null
        ? pedido.valores
        : pedido.valores.filter((v) => doRecorte.valores.includes(v)),
  )
  const semUnidade =
    (pedido === null ? true : pedido.incluiSemUnidade) &&
    (doRecorte === null ? true : doRecorte.alcancaSemUnidade)

  if (naoVazia(valores)) {
    return Object.freeze({
      modo: 'lista',
      valores: Object.freeze(valores) as readonly T[] as readonly [T, ...T[]],
      incluiSemUnidade: semUnidade,
    })
  }
  return Object.freeze(semUnidade ? { modo: 'somente-sem-unidade' } : { modo: 'nenhuma' })
}

function embrulhar<F extends FamiliaDeUnidade>(
  familia: F,
  vista: VistaDasUnidades<ValorDaFamilia<F>>,
): UnidadesEfetivas<F> {
  return Object.freeze({ [MARCA]: Object.freeze({ familia, vista }) })
}

/**
 * O recorte da sessão ∩ a seleção — a ÚNICA porta para `UnidadesEfetivas`.
 *
 * Hoje o recorte é sempre universal, então o resultado é a seleção, normalizada: `todas` fica
 * `todas`, a lista vira tupla não-vazia, e a lista que chegar vazia vira `nenhuma` (nunca
 * `todas` — é justamente o valor que esta fase proíbe de querer dizer "tudo").
 */
export function efetivar(recorte: RecorteDeLeitura, selecao: SelecaoDeUnidades): UnidadesEfetivas<'id'>
export function efetivar(
  recorte: RecorteDeLeitura,
  selecao: SelecaoDeUnidadesPorSlug,
): UnidadesEfetivas<'slug'>
export function efetivar(
  recorte: RecorteDeLeitura,
  selecao: SelecaoDeUnidades | SelecaoDeUnidadesPorSlug,
): UnidadesEfetivas<'id'> | UnidadesEfetivas<'slug'> {
  if (selecao.familia === 'id') {
    return embrulhar(
      'id',
      intersectar<number>(
        recorte.alcance === 'universal'
          ? null
          : {
              valores: recorte.unidades.map((u) => u.id),
              alcancaSemUnidade: recorte.alcancaSemUnidade,
            },
        // A família por id não tem linha "sem unidade" a pedir: `filial_id` é obrigatório nas
        // tabelas que ela filtra.
        selecao.modo === 'todas' ? null : { valores: selecao.ids, incluiSemUnidade: false },
      ),
    )
  }
  return embrulhar(
    'slug',
    intersectar<string>(
      recorte.alcance === 'universal'
        ? null
        : {
            valores: recorte.unidades.map((u) => u.slug),
            alcancaSemUnidade: recorte.alcancaSemUnidade,
          },
      selecao.modo === 'todas'
        ? null
        : { valores: selecao.slugs, incluiSemUnidade: selecao.incluiSemUnidade },
    ),
  )
}

/** A leitura das unidades efetivas — o que a query aplica. */
export function lerUnidades<F extends FamiliaDeUnidade>(
  unidades: UnidadesEfetivas<F>,
): VistaDasUnidades<ValorDaFamilia<F>> {
  return unidades[MARCA].vista
}

/** Ordem total e estável entre valores da MESMA família: número por valor, slug por unidade de código. */
function compararValores(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const sa = String(a)
  const sb = String(b)
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

/**
 * A CHAVE PRIMITIVA das unidades efetivas — uma string determinística que é IGUAL para duas
 * `UnidadesEfetivas` que pedem a mesma leitura, e diferente para as que pedem leituras diferentes
 * (F60 · fato 12 · PLAN §10, decisão 6).
 *
 * ⚠ POR QUE ELA EXISTE. `efetivar` embrulha um objeto NOVO a cada chamada (`embrulhar`, acima), e
 * o `cache()` do React compara argumento por `Object.is` — objeto é comparado por REFERÊNCIA
 * (doc oficial, `reference/react/cache.md`: "React will use shallow equality of the arguments";
 * no build `react-server` 19.2.8 o argumento-objeto vira chave de `WeakMap`). O layout do grupo
 * `(app)` e a página do dashboard montam, no MESMO request, duas `UnidadesEfetivas` com a MESMA
 * vista por caminhos diferentes — então memoizar a contagem de conflitos pelo objeto NUNCA
 * acertaria, e memoizar reconstruindo o objeto fora de `efetivar` furaria a marca. A chave é a
 * saída: primitiva, comparável por `Object.is`, e lida AQUI, o único módulo que enxerga a MARCA.
 *
 * O QUE ENTRA, e por quê cada peça: a FAMÍLIA (a mesma lista `[1]` por id e `['1']` por slug são
 * leituras diferentes), o MODO (`todas` ≠ `nenhuma` ≠ `somente-sem-unidade` — é a distinção que a
 * F57 criou e que uma chave não pode apagar), os VALORES ORDENADOS e `incluiSemUnidade` (muda o
 * resultado de `/relatorios/gerados`). É tudo o que a vista tem; nada fica de fora.
 *
 * ⚠ A ORDEM DOS VALORES É DESCARTADA DE PROPÓSITO: a mesma seleção pode chegar em ordens diferentes
 * (a da URL, a de `listarFiliais` por nome), e toda leitura que filtra por unidade trata a lista
 * como CONJUNTO (`in`, `= any`). Leitura que dependa da ORDEM da lista não pode ser memoizada por
 * esta chave. `JSON.stringify` e não `join(',')`: um slug com vírgula não pode colidir com dois slugs.
 */
export function chaveDasUnidades<F extends FamiliaDeUnidade>(unidades: UnidadesEfetivas<F>): string {
  const { familia, vista } = unidades[MARCA]
  if (vista.modo !== 'lista') return JSON.stringify([familia, vista.modo])
  const valores: (string | number)[] = [...vista.valores].sort(compararValores)
  return JSON.stringify([familia, vista.modo, valores, vista.incluiSemUnidade])
}
