import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Infra compartilhada da camada de dados dos relatórios (OS-F3 3.6). Reúne o que
// todos os módulos de relatório usam: o client tipado já resolvido (RLS do
// operador OU client administrativo p/ sessão por senha — lib/auth/acesso.ts), a
// resolução de filial e os utilitários de leitura (paginação do PostgREST,
// "última mov por ativo", rótulo de modelo). Ver docs/DECISOES.md.

export type DbClient = SupabaseClient<Database>

export type Filial = { id: number; nome: string; slug: string }

export async function resolverFilialPorSlug(
  client: DbClient,
  slug: string,
): Promise<Filial | null> {
  const { data } = await client
    .from('filiais')
    .select('id, nome, slug')
    .eq('slug', slug)
    .maybeSingle()
  return data ?? null
}

// Rótulo de modelo a partir de marca+modelo (fonte única das listas do
// relatório). Vazio → "Sem modelo".
export function modeloDe(marca: string | null, modelo: string | null): string {
  return [marca, modelo].filter(Boolean).join(' ').trim() || 'Sem modelo'
}

// Paginação única do PostgREST (que corta selects em 1.000 linhas). Uma única
// constante de página e um teto único: o maior domínio hoje é "todos os ativos"
// (~1,6 mil) e "movimentações de um período"; 100 páginas dão ~60× de folga
// sobre o pior caso atual. (Antes: 4 loops com tetos divergentes 20k/50k/100k;
// unificar em 100k só AMPLIA o menor, nunca trunca o que já passava.)
//
// O teto NÃO é um limite de leitura: alcançá-lo LANÇA. Um teto que corta dado e
// devolve o acumulado seria a mesma falha silenciosa que esta paginação existe
// para eliminar — só que num número maior e mais convincente.
const PAGINA = 1000
const CAP_PAGINACAO = 100_000

// ⚠ EXIGE ORDEM TOTAL na consulta paginada — não é detalhe de estilo.
//
// `.range(from,to)` vira OFFSET/LIMIT no Postgres, e OFFSET sobre uma relação
// SEM ordem total é indefinido: nada obriga duas consultas independentes a
// enumerarem as linhas na mesma sequência (o plano pode mudar entre elas — seq
// scan × index scan, workers paralelos), e aí páginas vizinhas repetem linhas e
// perdem outras. Ordenar por coluna com empate (só `created_at`, só `data`)
// tem o mesmo defeito dentro do grupo empatado.
//
// Por isso toda chamada daqui ordena por algo ÚNICO, ou por um critério de
// exibição seguido de um desempate único (`id`). Quando a fonte é uma RPC que
// não tem `order by` no corpo — o caso de `rel_estoque_asof` —, a ordem é
// imposta AQUI, na chamada: o builder de RPC do supabase-js aceita `.order()` e
// `.range()` como qualquer select, então não é preciso mexer na função SQL.
//
// ⚠ O FIM É "PÁGINA VAZIA", nunca "página menor que `PAGINA`".
//
// `PAGINA` é o tamanho PEDIDO; o servidor devolve o que quiser até esse teto. O
// `max-rows` do PostgREST é config de projeto (Settings → API no Supabase) e não
// vale nada supor que é 1.000: baixado para 500, toda página vira curta e um
// `rows.length < PAGINA → break` pararia na PRIMEIRA — exatamente o corte
// silencioso que esta função existe para impedir, agora disfarçado de paginação.
// Por isso o avanço é `from += rows.length` (o que o servidor de fato entregou,
// não o que pedimos) e a parada é `rows.length === 0`. Custa uma requisição
// extra por leitura, que retorna vazia; é o preço de não depender de um
// parâmetro remoto que ninguém aqui controla.
export async function paginarTodos<Row>(
  rotuloErro: string,
  fazPagina: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Row[]> {
  const acc: Row[] = []
  let from = 0
  for (;;) {
    const { data, error } = await fazPagina(from, from + PAGINA - 1)
    if (error) throw new Error(`${rotuloErro}: ${error.message}`)
    const rows = (data ?? []) as Row[]
    if (rows.length === 0) break
    acc.push(...rows)
    from += rows.length
    if (from >= CAP_PAGINACAO)
      throw new Error(
        `${rotuloErro}: teto de paginação atingido (${CAP_PAGINACAO} linhas). ` +
          'A leitura foi abortada de propósito — devolver o acumulado seria afirmar ' +
          'um número truncado com cara de certo.',
      )
  }
  return acc
}

// Lote de ids para as leituras `.in('coluna', ids)`.
//
// O corte de 1.000 linhas não é o único teto de uma lista grande de ids: o
// PostgREST recebe o filtro na QUERY STRING (`?ativo_id=in.(uuid,uuid,…)`), e
// um uuid custa 37 caracteres com a vírgula. Mil ids passam de 37 KB de URL e a
// requisição morre no proxy (414) ANTES de qualquer truncamento — um modo de
// falha diferente, e barulhento em vez de silencioso. 100 ids ≈ 3,7 KB deixa
// folga confortável para os dois limites.
const LOTE_IDS = 100

// Lê em lotes uma consulta filtrada por uma lista de ids, paginando CADA lote
// (um id pode ter várias linhas — movimentações de um ativo, por exemplo, então
// nem o tamanho do lote limita o número de linhas devolvidas).
//
// A ordem do resultado é a dos lotes, isto é, a de `ids`: quem depende de
// ordenação (o `ultimoPorAtivo`, que reduz linhas JÁ ordenadas) precisa ordenar
// DENTRO de cada lote e agrupar por id — que é exatamente o que os chamadores
// fazem, porque o desempate deles é por ativo, nunca entre ativos diferentes.
//
// Os lotes vão EM PARALELO. É a mesma invariante de cima que autoriza: nenhum
// ativo se divide entre dois lotes, então nada num lote depende de outro e a
// ordem em que chegam não muda o resultado — `partes.flat()` recompõe a ordem
// de `ids` pelo índice, não pela chegada. Em série, `manutencaoDeEstado` com o
// preset "Tudo" pagaria ⌈n/100⌉ round-trips enfileirados em CADA uma das quatro
// leituras por id; em paralelo, paga a latência de um lote só.
export async function paginarPorIds<Row>(
  rotuloErro: string,
  ids: readonly string[],
  fazPagina: (
    lote: string[],
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Row[]> {
  if (ids.length === 0) return []
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += LOTE_IDS) lotes.push(ids.slice(i, i + LOTE_IDS))
  const partes = await Promise.all(
    lotes.map((lote) =>
      paginarTodos<Row>(rotuloErro, (from, to) => fazPagina(lote, from, to)),
    ),
  )
  return partes.flat()
}

// "Última movimentação por ativo": reduz linhas JÁ ordenadas (mais recente
// primeiro) a um Map ativo→primeiro valor visto. Fonte única do padrão que se
// repetia para chamado, envio e retorno de manutenção.
export function ultimoPorAtivo<T, V>(
  rows: T[],
  ativoDe: (r: T) => string,
  valorDe: (r: T) => V,
): Map<string, V> {
  const out = new Map<string, V>()
  for (const r of rows) {
    const id = ativoDe(r)
    if (!out.has(id)) out.set(id, valorDe(r))
  }
  return out
}
