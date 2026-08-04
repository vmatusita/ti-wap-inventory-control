// F25 — resolução do filtro de filial: URL + cargo → a lista efetiva.
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
// CONVENÇÃO DE RETORNO: `[]` = SEM RECORTE (todas as filiais). É o mesmo valor
// para "cargo que vê tudo" e para "sentinela `filial=todas`", porque para a query
// as duas coisas são a mesma: não aplicar `.in`.

import { filtroFilialPadrao } from '@/lib/auth/papeis'
import type { PapelUsuario } from '@/lib/auth/papeis'
import { selecaoFilialIds, selecaoFilialSlugs } from '@/lib/url-params'

// Estrutural de propósito: `Operador` mora em `auth/acesso.ts`, que é `server-only`,
// e este módulo é puro (tem teste em ambiente node, sem banco e sem sessão).
export type OperadorDoFiltro = {
  papel: PapelUsuario
  filiaisEscrita: readonly number[]
} | null

/**
 * Filiais efetivas das telas que filtram por ID (`/ativos`, `/movimentacoes`,
 * `/itens`). `[]` = sem recorte.
 */
export function resolverFiliaisIds(
  param: string | null | undefined,
  operador: OperadorDoFiltro,
  filiaisAtivas: readonly number[],
): number[] {
  const sel = selecaoFilialIds(param)
  if (sel.modo === 'todas') return []
  if (sel.modo === 'lista') return sel.valores
  return filtroFilialPadrao(operador?.papel, operador?.filiaisEscrita ?? [], filiaisAtivas)
}

/**
 * Filiais efetivas das telas que filtram por SLUG (`/pendencias`). `[]` = sem
 * recorte.
 *
 * `filiais` precisa trazer id E slug porque o padrão do cargo sai de `filiaisEscrita`,
 * que é uma lista de IDs — a tradução para slug acontece aqui, e não na página.
 * Slug que não está na lista de filiais ATIVAS é preservado assim mesmo: é o
 * comportamento de hoje (um `?filial=<slug de filial desativada>` continua
 * recortando), e mudá-lo seria alterar em silêncio o sentido de links antigos.
 */
export function resolverFiliaisSlugs(
  param: string | null | undefined,
  operador: OperadorDoFiltro,
  filiais: readonly { id: number; slug: string }[],
): string[] {
  const sel = selecaoFilialSlugs(param)
  if (sel.modo === 'todas') return []
  if (sel.modo === 'lista') return sel.valores
  const padrao = filtroFilialPadrao(
    operador?.papel,
    operador?.filiaisEscrita ?? [],
    filiais.map((f) => f.id),
  )
  if (padrao.length === 0) return []
  return filiais.filter((f) => padrao.includes(f.id)).map((f) => f.slug)
}

/**
 * Variante SEM padrão por cargo: a ausência do param significa "todas" para todo
 * mundo, inclusive para o operador.
 *
 * Existe por uma decisão explícita da F25 (§4.7): `/relatorios/gerados` é o ARQUIVO
 * de snapshots, e boa parte dele é de relatório CONSOLIDADO (`filial_id is null`),
 * que não pertence a filial nenhuma. Recortar por padrão esconderia justamente
 * esses — o operador abriria o histórico e concluiria que os consolidados sumiram.
 */
export function resolverFiliaisSlugsSemPadrao(param: string | null | undefined): string[] {
  const sel = selecaoFilialSlugs(param)
  return sel.modo === 'lista' ? sel.valores : []
}
