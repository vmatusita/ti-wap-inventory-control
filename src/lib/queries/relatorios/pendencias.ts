import {
  ILIKE_ITENS_FALTANTES,
  OR_PATRIMONIO,
  TEXTO_TERMO_PENDENTE,
  TEXTO_TRIAGEM_PARADA,
} from '@/lib/pendencias/filtro'
import type { TipoPendencia } from '@/lib/pendencias/rotulos'
import type { ChipPendencia } from '@/lib/relatorios/tipos'
import type { DbClient } from './comum'

// Pendências (contagens agregadas via v_fila_pendencias — OS-F3 3.6 → F18). Recebe
// o slug da filial (null = consolidado). Devolve só os chips com total > 0. Desde a
// F18 o bucket 'itens' conta uma linha por ITEM faltante ABERTO (modelo próprio
// pendencias_item), não mais o texto no campo livre do ativo; os demais buckets são
// idênticos. Usado no AO VIVO (relatório/dashboard) e congelado na GERAÇÃO de
// snapshot — snapshots antigos não retroagem (o jsonb é estático).

// Query base: a fila, opcionalmente recortada por filial. O tipo dela é o contrato
// dos predicados de balde logo abaixo.
function queryBase(client: DbClient, filialSlug: string | null) {
  let query = client.from('v_fila_pendencias').select('*', { count: 'exact', head: true })
  if (filialSlug) query = query.eq('filial', filialSlug)
  return query
}

type QueryFila = ReturnType<typeof queryBase>

// Balde = todo TipoPendencia MENOS 'outras', que é resto e não predicado.
type BaldeChip = Exclude<TipoPendencia, 'outras'>

// A TRAVA que faltava. `Record<BaldeChip, …>` é exaustivo: um `TipoPendencia` novo em
// `pendencias/rotulos.ts` NÃO compila até ganhar predicado e rótulo aqui, e entra na
// subtração de "outras" sozinho. Foi exatamente esse elo que faltou quando o balde
// 'patrimonio' passou a existir na aba de /pendencias e ninguém o acrescentou aos
// chips: o chip anunciava "56 outras" e a aba "Outra" devolvia ZERO (medido em
// produção em 25/07/2026 — total 58 = 2 termo + 0 itens + 0 triagem + 56 patrimônio).
//
// Os predicados vêm de `@/lib/pendencias/filtro`, os MESMOS que `queryPendencias`
// (queries/pendencias-detalhe.ts) aplica nas abas e no CSV, e os mesmos textos que
// `classificarPendencia` lê. Uma regra, um dono.
//
// A ORDEM DE DECLARAÇÃO é a ordem dos chips na tela (`Object.keys` preserva a ordem
// de inserção de chaves string).
const BALDES: Record<
  BaldeChip,
  { rotulo: string; filtrar: (q: QueryFila) => QueryFila }
> = {
  termo: {
    rotulo: 'termos de responsabilidade pendentes',
    filtrar: (q) => q.eq('pendencia', TEXTO_TERMO_PENDENTE),
  },
  itens: {
    rotulo: 'itens faltantes de devoluções',
    filtrar: (q) => q.ilike('pendencia', ILIKE_ITENS_FALTANTES),
  },
  triagem: {
    rotulo: 'ativos aguardando triagem',
    filtrar: (q) => q.eq('pendencia', TEXTO_TRIAGEM_PARADA),
  },
  patrimonio: {
    rotulo: 'patrimônios a acertar',
    filtrar: (q) => q.or(OR_PATRIMONIO),
  },
}

const CHAVES_BALDE = Object.keys(BALDES) as BaldeChip[]

async function contar(
  client: DbClient,
  filialSlug: string | null,
  filtrar?: (q: QueryFila) => QueryFila,
): Promise<number> {
  const base = queryBase(client, filialSlug)
  const { count, error } = await (filtrar ? filtrar(base) : base)
  if (error) throw new Error(`Falha ao contar pendências: ${error.message}`)
  return count ?? 0
}

export async function getPendencias(
  client: DbClient,
  filialSlug: string | null,
): Promise<ChipPendencia[]> {
  const [total, ...contagens] = await Promise.all([
    contar(client, filialSlug, undefined),
    ...CHAVES_BALDE.map((chave) => contar(client, filialSlug, BALDES[chave].filtrar)),
  ])

  // "outras" é o RESTO: o que a fila tem e nenhum balde reivindicou. Só assim o chip
  // promete o mesmo lote que a aba "Outra" entrega (`queryPendencias` a define como a
  // negação dos mesmos quatro predicados).
  const somaBaldes = contagens.reduce((acc, n) => acc + n, 0)
  const resto = total - somaBaldes

  // Resto NEGATIVO significa que dois baldes contaram a MESMA linha — a pendência é
  // `;`-joinable (dominio.ts), então um texto como 'itens faltantes: mochila; sem
  // patrimônio físico' casa dois predicados. Clampar em zero calado esconderia
  // justamente o sintoma do bug que estes baldes acabaram de consertar; o clamp fica
  // (o chip não pode mostrar número negativo), mas agora deixa rastro no servidor.
  if (resto < 0) {
    console.error(
      `[pendencias] baldes sobrepostos em ${filialSlug ?? 'geral'}: somam ${somaBaldes} de um total de ${total}. ` +
        'Uma linha da fila casa mais de um predicado (pendência `;`-joinable?) — ver lib/pendencias/filtro.ts.',
    )
  }

  const chips: ChipPendencia[] = [
    ...CHAVES_BALDE.map((chave, i) => ({
      chave,
      rotulo: BALDES[chave].rotulo,
      total: contagens[i],
    })),
    { chave: 'outras', rotulo: 'outras pendências', total: Math.max(0, resto) },
  ]
  return chips.filter((c) => c.total > 0)
}
