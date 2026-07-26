import {
  PENDENCIA_PATRIMONIO_NAO_CANONICO,
  PENDENCIA_SEM_PATRIMONIO,
} from '@/lib/dominio'
import type { ChipPendencia } from '@/lib/relatorios/tipos'
import type { DbClient } from './comum'

// Pendências (contagens agregadas via v_fila_pendencias — OS-F3 3.6 → F18). Recebe
// o slug da filial (null = consolidado). Devolve só os chips com total > 0. Desde a
// F18 o bucket 'itens' conta uma linha por ITEM faltante ABERTO (modelo próprio
// pendencias_item), não mais o texto no campo livre do ativo; os demais buckets são
// idênticos. Usado no AO VIVO (relatório/dashboard) e congelado na GERAÇÃO de
// snapshot — snapshots antigos não retroagem (o jsonb é estático).

type FiltroPendencia = null | 'termo' | 'itens' | 'triagem' | 'patrimonio'

async function contarPendencia(
  client: DbClient,
  filialSlug: string | null,
  filtro: FiltroPendencia,
): Promise<number> {
  let query = client
    .from('v_fila_pendencias')
    .select('*', { count: 'exact', head: true })
  if (filialSlug) query = query.eq('filial', filialSlug)
  if (filtro === 'termo') query = query.eq('pendencia', 'termo pendente')
  else if (filtro === 'itens') query = query.ilike('pendencia', 'itens faltantes%')
  else if (filtro === 'triagem') query = query.eq('pendencia', 'triagem parada')
  else if (filtro === 'patrimonio')
    // MESMO predicado de `queryPendencias` (queries/pendencias-detalhe.ts): sem
    // plaqueta (F7E) OU não canônico (go-live F4). Literais sem vírgula/parênteses
    // — footgun do `.or()` do PostgREST.
    query = query.or(
      `pendencia.ilike.%${PENDENCIA_SEM_PATRIMONIO}%,pendencia.ilike.%${PENDENCIA_PATRIMONIO_NAO_CANONICO}%`,
    )
  const { count, error } = await query
  if (error) throw new Error(`Falha ao contar pendências: ${error.message}`)
  return count ?? 0
}

export async function getPendencias(
  client: DbClient,
  filialSlug: string | null,
): Promise<ChipPendencia[]> {
  const [total, termo, itens, triagem, patrimonio] = await Promise.all([
    contarPendencia(client, filialSlug, null),
    contarPendencia(client, filialSlug, 'termo'),
    contarPendencia(client, filialSlug, 'itens'),
    contarPendencia(client, filialSlug, 'triagem'),
    contarPendencia(client, filialSlug, 'patrimonio'),
  ])
  // `patrimonio` PRECISA entrar na subtração: sem ele, a fila de patrimônio caía
  // toda dentro de "outras" — e o filtro "Outra" da mesma tela EXCLUI esses textos
  // (queryPendencias), então o chip prometia um lote que a aba não entregava.
  // Medido em produção em 25/07/2026: total 58 = 2 termo + 0 itens + 0 triagem +
  // 56 patrimônio, ou seja, o chip anunciava "56 outras" e a aba "Outra" devolvia
  // ZERO. Os 5 baldes daqui passam a ser os mesmos 5 de `classificarPendencia` e as
  // mesmas 5 abas de `pendencias-filtros.tsx`.
  const outras = Math.max(0, total - termo - itens - triagem - patrimonio)

  const chips: ChipPendencia[] = [
    { chave: 'termo', rotulo: 'termos de responsabilidade pendentes', total: termo },
    { chave: 'itens', rotulo: 'itens faltantes de devoluções', total: itens },
    { chave: 'triagem', rotulo: 'ativos aguardando triagem', total: triagem },
    { chave: 'patrimonio', rotulo: 'patrimônios a acertar', total: patrimonio },
    { chave: 'outras', rotulo: 'outras pendências', total: outras },
  ]
  return chips.filter((c) => c.total > 0)
}
