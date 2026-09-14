// F25 — resolução do filtro de filial: URL + cargo → a SELEÇÃO de unidades.
//
// POR QUE UM MÓDULO, e não a conta repetida em cada página: o filtro de filial é
// lido em DOIS lugares por superfície — o Server Component que monta a tela e a
// Server Action que exporta o CSV, que NÃO recebe objeto pronto e reparseia a
// querystring da própria página (`exportar.ts`). Foi a divergência entre cópias
// desse tipo de parse que produziu os achados F12-W4-01/-03/-04/-05, e a regra da
// casa desde então (F12 · W6A) é que o parser more num módulo só.
//
// Com o padrão POR CARGO a duplicação ficaria ainda mais cara: a conta deixou de
// ser "parseie o número" e virou "parseie, e se não vier nada aplique a regra do
// cargo de quem está pedindo". Uma cópia esquecida no export faz o CSV trazer o
// acervo inteiro enquanto a tela mostra duas filiais — sem erro nenhum.
//
// CONVENÇÃO DE RETORNO (F57): o MODO passa adiante. `{ modo: 'todas' }` é "sem
// recorte", com nome; `{ modo: 'lista' }` são as filiais pedidas. Até a F57 este
// módulo devolvia `[]` para "sem recorte" — o mesmo valor para "cargo que vê tudo" e
// para "sentinela `filial=todas`" —, e qualquer outro `[]` que chegasse à query (uma
// interseção que esvaziou, um filtro que não resolveu) também virava "todas", em
// silêncio. Estas funções devolvem a SELEÇÃO; quem a transforma no que uma query
// aceita é `efetivar` (`auth/recorte-leitura.ts`), que a intersecta com o recorte de
// leitura da sessão.

import { ABA_RELATORIO_CONSOLIDADO, unidadesMarcadasPorPadrao } from '@/lib/auth/papeis'
import type { PapelUsuario } from '@/lib/auth/papeis'
import { selecaoFilialIds, selecaoFilialSlugs } from '@/lib/url-params'

// Estrutural de propósito: `Operador` mora em `auth/acesso.ts`, que é `server-only`,
// e este módulo é puro (tem teste em ambiente node, sem banco e sem sessão).
export type OperadorDoFiltro = {
  papel: PapelUsuario
  filiaisEscrita: readonly number[]
} | null

// F57 — AS SELEÇÕES: o que o usuário pediu, com o MODO passado adiante em vez de achatado.
// `familia` é o que permite a `efetivar` (auth/recorte-leitura.ts) intersectar `todas` com um
// recorte restrito: diante de "todas", só a família diz se a resposta são ids ou slugs.

/** A seleção das telas que filtram por ID (`/ativos`, `/movimentacoes`, `/itens`). */
export type SelecaoDeUnidades =
  | { readonly familia: 'id'; readonly modo: 'todas' }
  | { readonly familia: 'id'; readonly modo: 'lista'; readonly ids: readonly number[] }

/**
 * A seleção das telas que filtram por SLUG (`/pendencias`, `/relatorios/gerados`).
 *
 * `incluiSemUnidade` é o terceiro valor: pede também as linhas que não pertencem a filial
 * nenhuma — o consolidado (`filial_id is null`) de `/relatorios/gerados`, pedido na URL pelo slug
 * reservado do Consolidado. Só a variante SEM padrão o liga.
 */
export type SelecaoDeUnidadesPorSlug =
  | { readonly familia: 'slug'; readonly modo: 'todas' }
  | {
      readonly familia: 'slug'
      readonly modo: 'lista'
      readonly slugs: readonly string[]
      readonly incluiSemUnidade: boolean
    }

const TODAS_POR_ID: SelecaoDeUnidades = Object.freeze({ familia: 'id', modo: 'todas' })
const TODAS_POR_SLUG: SelecaoDeUnidadesPorSlug = Object.freeze({
  familia: 'slug',
  modo: 'todas',
})

/**
 * A seleção das telas que filtram por ID (`/ativos`, `/movimentacoes`, `/itens`,
 * `/itens/historico`) — e do CSV de cada uma.
 */
export function selecaoDeUnidades(
  param: string | null | undefined,
  operador: OperadorDoFiltro,
  filiaisAtivas: readonly number[],
): SelecaoDeUnidades {
  const sel = selecaoFilialIds(param)
  if (sel.modo === 'todas') return TODAS_POR_ID
  if (sel.modo === 'lista') return { familia: 'id', modo: 'lista', ids: sel.valores }
  return unidadesMarcadasPorPadrao(operador?.papel, operador?.filiaisEscrita ?? [], filiaisAtivas)
}

/**
 * A seleção das telas que filtram por SLUG (`/pendencias`).
 *
 * `filiais` precisa trazer id E slug porque o padrão do cargo sai de `filiaisEscrita`,
 * que é uma lista de IDs — a tradução para slug acontece aqui, e não na página.
 * Slug que não está na lista de filiais ATIVAS é preservado assim mesmo: é o
 * comportamento de hoje (um `?filial=<slug de filial desativada>` continua
 * recortando), e mudá-lo seria alterar em silêncio o sentido de links antigos.
 */
export function selecaoDeUnidadesPorSlug(
  param: string | null | undefined,
  operador: OperadorDoFiltro,
  filiais: readonly { id: number; slug: string }[],
): SelecaoDeUnidadesPorSlug {
  const sel = selecaoFilialSlugs(param)
  if (sel.modo === 'todas') return TODAS_POR_SLUG
  if (sel.modo === 'lista') {
    return { familia: 'slug', modo: 'lista', slugs: sel.valores, incluiSemUnidade: false }
  }
  const padrao = unidadesMarcadasPorPadrao(
    operador?.papel,
    operador?.filiaisEscrita ?? [],
    filiais.map((f) => f.id),
  )
  if (padrao.modo === 'todas') return TODAS_POR_SLUG
  return {
    familia: 'slug',
    modo: 'lista',
    slugs: filiais.filter((f) => padrao.ids.includes(f.id)).map((f) => f.slug),
    incluiSemUnidade: false,
  }
}

/**
 * Variante SEM padrão por cargo: a ausência do param significa "todas" para todo
 * mundo, inclusive para o operador.
 *
 * Existe por uma decisão explícita da F25 (§4.7): `/relatorios/gerados` é o ARQUIVO
 * de snapshots, e boa parte dele é de relatório CONSOLIDADO (`filial_id is null`),
 * que não pertence a filial nenhuma. Recortar por padrão esconderia justamente
 * esses — o operador abriria o histórico e concluiria que os consolidados sumiram.
 *
 * F57 — o slug reservado do Consolidado deixa de ser "mais um slug" na lista: vira o flag
 * `incluiSemUnidade`, o terceiro valor. É a única seleção que o liga, porque esta é a única
 * tela cujo filtro aceita o Consolidado.
 */
export function selecaoDeUnidadesSemPadrao(
  param: string | null | undefined,
): SelecaoDeUnidadesPorSlug {
  const sel = selecaoFilialSlugs(param)
  if (sel.modo !== 'lista') return TODAS_POR_SLUG
  return {
    familia: 'slug',
    modo: 'lista',
    slugs: sel.valores.filter((s) => s !== ABA_RELATORIO_CONSOLIDADO),
    incluiSemUnidade: sel.valores.includes(ABA_RELATORIO_CONSOLIDADO),
  }
}

// ---------------------------------------------------------------------------
// ⚠ TRANSITÓRIO (F57) — os três nomes antigos. Saem no lote 4 da Frente H.
// ---------------------------------------------------------------------------
// Os consumidores migram em lotes (`docs/PLAN-F57.md` §4), e o `tsc` precisa ficar verde entre
// um commit e outro. Até o lote 4, quem ainda não migrou lê por estes invólucros finos — o
// ÚNICO lugar do repositório onde a convenção `[] = todas` sobrevive, e só até lá.

/** @deprecated F57 — transitório: use `selecaoDeUnidades` + `efetivar`. Sai no lote 4. */
export function resolverFiliaisIds(
  param: string | null | undefined,
  operador: OperadorDoFiltro,
  filiaisAtivas: readonly number[],
): number[] {
  const s = selecaoDeUnidades(param, operador, filiaisAtivas)
  return s.modo === 'todas' ? [] : [...s.ids]
}

/** @deprecated F57 — transitório: use `selecaoDeUnidadesPorSlug` + `efetivar`. Sai no lote 4. */
export function resolverFiliaisSlugs(
  param: string | null | undefined,
  operador: OperadorDoFiltro,
  filiais: readonly { id: number; slug: string }[],
): string[] {
  const s = selecaoDeUnidadesPorSlug(param, operador, filiais)
  return s.modo === 'todas' ? [] : [...s.slugs]
}

/**
 * @deprecated F57 — transitório: use `selecaoDeUnidadesSemPadrao` + `efetivar`. Sai no lote 4.
 * Devolve os slugs na ORDEM da URL, com o do Consolidado onde ele veio — é o que a tela ainda
 * mostra no rótulo do filtro até migrar.
 */
export function resolverFiliaisSlugsSemPadrao(param: string | null | undefined): string[] {
  const sel = selecaoFilialSlugs(param)
  return sel.modo === 'lista' ? sel.valores : []
}
