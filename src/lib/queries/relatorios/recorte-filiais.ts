import 'server-only'
import { cache } from 'react'
import type { DbClient } from './comum'

// O RECORTE DAS `rel_*_filiais` — onde o "todas" vira LISTA (F60 · PLAN-F60 §6.3 e §10, decisão 2).
//
// Até a F59 o consolidado era `p_filial = null`: o nulo significava "tudo", e uma função que
// recebesse NULL por engano devolvia o acervo inteiro sem erro. As `rel_*_filiais` recebem uma
// LISTA obrigatória (`p_filiais smallint[]`, ligada por `= any`), e NULL ou `'{}'` dão zero linhas.
// O consolidado passa a ser, então, a lista EXPLÍCITA de todas as filiais — e ela nasce aqui, num
// lugar só. O lote 1 usa esta leitura nos KPIs do dashboard (`queries/dashboard.ts`); o lote 2
// acrescenta `recorteDeFiliais` ao lado e a leva para o relatório inteiro.

/**
 * Os ids de TODAS as filiais, INCLUSIVE as desativadas, em ordem de id — o recorte do CONSOLIDADO.
 *
 * ⚠ SEM filtro de `ativo`, e não é descuido. `listarFiliais()` (`queries/filiais.ts`) lê só as
 * ATIVAS, porque serve filtros e destinos de escrita; usá-la aqui apagaria do consolidado, em
 * silêncio, o ativo, o lançamento e a movimentação que ainda moram numa filial desativada (fato 9).
 * Como `ativos`/`movimentacoes`/`lancamentos_item` têm `filial_id` NOT NULL com FK para `filiais`,
 * esta lista cobre exatamente o conjunto que `p_filial = null` cobria — o número do consolidado
 * não muda. A RLS de `filiais` não recorta linha nenhuma para quem lê (`using (papel_atual() is not
 * null)`, 0070), e o client administrativo do visualizador por senha não passa por RLS: a lista é a
 * mesma para os dois.
 *
 * Ordem por `id` porque o recorte é CONJUNTO (`= any`): a ordem só existe para a lista ser
 * determinística entre renders e nos logs, nunca para mudar um resultado.
 *
 * ⚠ NUNCA TRUNCADA EM SILÊNCIO. O PostgREST corta todo `select` no `max-rows` do projeto; um
 * consolidado com uma filial a menos seria um número menor com cara de certo. A leitura pede o
 * `count` exato NA MESMA consulta e LANÇA se as linhas lidas não forem todas — sem supor quanto vale
 * o `max-rows` (a lição de `paginarTodos`: o teto é do servidor, não desta constante).
 *
 * MEMOIZADA POR REQUEST (`cache()` do React), com o CLIENT como argumento: o mesmo client desce
 * por toda leitura de um request (o snapshot inteiro recebe um só), e o `cache` compara argumento
 * por `Object.is` — client igual, uma leitura; client da sessão e client administrativo, entradas
 * separadas, como em `listarFiliais`. Fora de um render de Server Component (Server Action, script)
 * o `cache` não memoiza, e a leitura — de poucas linhas — continua correta. Uma falha também fica
 * memoizada até o fim do request (contrato do `cache`), e é o que se quer: o mesmo request não
 * deve ver dois consolidados diferentes.
 */
export const filiaisDoConsolidado = cache(async function filiaisDoConsolidado(
  client: DbClient,
): Promise<number[]> {
  const { data, error, count } = await client
    .from('filiais')
    .select('id', { count: 'exact' })
    .order('id', { ascending: true })
  if (error) throw new Error(`Falha ao ler as filiais do consolidado: ${error.message}`)
  const ids = (data ?? []).map((f) => f.id)
  if (count === null || count !== ids.length)
    throw new Error(
      `Falha ao ler as filiais do consolidado: ${ids.length} de ${count ?? '?'} filiais lidas. ` +
        'Um consolidado com filial a menos seria um número truncado com cara de certo.',
    )
  return ids
})
