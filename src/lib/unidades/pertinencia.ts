import 'server-only'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { selecaoFilialIds, selecaoFilialSlugs } from '@/lib/url-params'
import { SLUG_CONSOLIDADO } from '@/lib/unidades/slugs'

// A FILIAL PEDIDA NA URL EXISTE? — a recusa explícita das rotas que leem `filial` (F57 · Frente F).
//
// O DEFEITO QUE ELA FECHA. Até a F57, `/ativos?filial=9999` abria normalmente: o parser aceitava o
// número, a query recortava por ele, e a tela dizia "nada com esses filtros" — uma lista vazia
// AMBÍGUA, indistinguível de uma filial que existe e está vazia. Uma só das oito rotas recusava
// (`/relatorios/[filial]`, com `notFound()`); as outras sete abriam com qualquer id ou slug.
//
// ⚠ A RÉGUA É ESTREITA DE PROPÓSITO (decisão 2 do Johnny, 14/09/2026):
//   · filial que NÃO EXISTE em `filiais` → `notFound()`;
//   · filial DESATIVADA → continua valendo. Ela existe, e o link antigo não pode mudar de sentido
//     em silêncio (F25 §4.7) — por isso a consulta NÃO filtra `ativo`;
//   · filial de OUTRA unidade → continua abrindo para qualquer cargo. Todo cargo lê tudo
//     (ADR-001/002); esta fase não estreita leitura de ninguém;
//   · LIXO continua IGNORADO pela doutrina do parser (`url-params.ts`): o que não tem a forma de
//     um id (`abc`) ou está fora da faixa `smallint` (`99999`) nunca foi um pedido de filial — cai
//     no padrão, como sempre caiu. A recusa é para o pedido BEM FORMADO que não existe (`9999`);
//   · `/itens/conferencia` é o caso especial: lá o parâmetro governa ESCRITA, e "existe mas você
//     não escreve nela" continua caindo no seletor. Esta função só recusa o que não existe.
//
// Qualquer valor inexistente numa lista (`?filial=2,9999`) recusa a lista inteira: o sistema nunca
// gera um link desses, e abrir a tela recortada pela metade que existe seria a mesma resposta
// ambígua, só que menor.
//
// CUSTO: uma consulta de uma linha por valor, e SÓ quando a URL traz uma lista. Sem parâmetro,
// com `todas` ou com lixo, nenhuma.
//
// ⚠ `client` é obrigatório: as rotas de relatório servem também o visualizador por SENHA, que lê
// pelo client resolvido (`resolverAcessoRelatorio`). Com o client de sessão ele leria `filiais`
// vazia e TODA filial pareceria inexistente — um 404 para quem só queria ver o relatório.

/** Os pedidos que não aparecem entre os que existem — a conta pura, sem banco. */
export function valoresInexistentes<T extends number | string>(
  pedidos: readonly T[],
  existentes: readonly T[],
): T[] {
  return pedidos.filter((p) => !existentes.includes(p))
}

/**
 * Responde `notFound()` quando a URL pede, por id ou por slug, uma filial que não existe.
 *
 * `familia` segue a do filtro da rota: `'id'` (`/ativos`, `/movimentacoes`, `/itens`,
 * `/itens/historico`, `/itens/conferencia`) ou `'slug'` (`/pendencias`, `/relatorios/gerados`,
 * `/relatorios/[filial]`). `aceitaConsolidado` deixa passar o slug do Consolidado, que não é linha de
 * `filiais` — só nas duas rotas de relatório.
 */
export async function recusarFilialInexistente(
  client: SupabaseClient<Database>,
  param: string | null | undefined,
  familia: 'id' | 'slug',
  opcoes: { readonly aceitaConsolidado?: boolean } = {},
): Promise<void> {
  if (familia === 'id') {
    const selecao = selecaoFilialIds(param)
    if (selecao.modo !== 'lista') return
    const { data, error } = await client.from('filiais').select('id').in('id', selecao.valores)
    if (error) throw new Error(`Falha ao conferir a filial pedida: ${error.message}`)
    const existentes = (data ?? []).map((f) => f.id)
    if (valoresInexistentes(selecao.valores, existentes).length > 0) notFound()
    return
  }

  const selecao = selecaoFilialSlugs(param)
  if (selecao.modo !== 'lista') return
  const pedidos = opcoes.aceitaConsolidado
    ? selecao.valores.filter((s) => s !== SLUG_CONSOLIDADO)
    : selecao.valores
  if (pedidos.length === 0) return
  const { data, error } = await client.from('filiais').select('slug').in('slug', pedidos)
  if (error) throw new Error(`Falha ao conferir a filial pedida: ${error.message}`)
  const existentes = (data ?? []).map((f) => f.slug)
  if (valoresInexistentes(pedidos, existentes).length > 0) notFound()
}
