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
// O teto NÃO é um limite de leitura: ULTRAPASSÁ-LO lança — não alcançá-lo. Ver
// o off-by-one corrigido em `paginarTodos` (19/08/2026, revisão): um acervo de
// exatamente CAP_PAGINACAO linhas precisa CONCLUIR a leitura, não abortar; só
// uma linha 100.001 é excedente de verdade. Um teto que corta dado e devolve o
// acumulado seria a mesma falha silenciosa que esta paginação existe para
// eliminar — só que num número maior e mais convincente.
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
// ⚠ O FIM é "página menor que o `max-rows` OBSERVADO", nunca "página menor
// que `PAGINA`" — nem, desde 19/08/2026 (revisão), simplesmente "página vazia".
//
// `PAGINA` é o tamanho PEDIDO; o servidor devolve `min(max-rows, linhas
// restantes)`. O `max-rows` do PostgREST é config de projeto (Settings → API
// no Supabase) e não vale nada supor que é 1.000: baixado para 500, toda
// página vira curta, e um `rows.length < PAGINA → break` pararia na PRIMEIRA —
// exatamente o corte silencioso que esta função existe para impedir, agora
// disfarçado de paginação. A versão anterior driblava isso do jeito mais caro
// possível: só parava em página VAZIA, pagando uma requisição extra em TODA
// leitura — mesmo quando a página anterior já tinha vindo curta e portanto já
// provava sozinha que o dado acabou (ACHADO 12, revisão de 19/08/2026).
//
// A correção observa o tamanho da PRIMEIRA página como o teto efetivo do
// servidor (`teto`, abaixo) e para assim que uma página vier ESTRITAMENTE
// MENOR que esse teto: `min(max-rows, restante)` só pode ficar abaixo de
// `max-rows` quando `restante` é o fator limitante — ou seja, quando o dado
// acabou. Vale tanto com max-rows=1.000 (o padrão) quanto com 500 ou qualquer
// outro valor configurado, porque o teto é OBSERVADO, nunca hardcoded. A
// PRIMEIRA página sozinha nunca é conclusiva — ela define o teto, não o
// confirma, porque um conjunto pequeno pode devolver uma primeira página curta
// que já é o fim de verdade, e nada na resposta distingue isso de um
// max-rows pequeno sem pedir a página seguinte (daí o `continue` logo depois
// de fixar `teto`, em vez de já testar `rows.length < teto` nela). Página
// vazia continua encerrando a leitura — é o caso em que o total é múltiplo
// exato do teto observado, e nenhuma página fica curta para avisar.
export async function paginarTodos<Row>(
  rotuloErro: string,
  fazPagina: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Row[]> {
  const acc: Row[] = []
  let from = 0
  // Teto de linhas por página OBSERVADO na primeira resposta do servidor —
  // não é `PAGINA` (o que pedimos), é o que ele de fato entregou. `null` até a
  // primeira página chegar. Ver o comentário acima.
  let teto: number | null = null
  for (;;) {
    const { data, error } = await fazPagina(from, from + PAGINA - 1)
    if (error) throw new Error(`${rotuloErro}: ${error.message}`)
    const rows = (data ?? []) as Row[]
    if (rows.length === 0) break
    acc.push(...rows)
    from += rows.length
    // Teto sobre o EXCEDENTE, não sobre o total exato — ACHADO 6, 19/08/2026
    // (revisão). `>`, não `>=`: um acervo de exatamente CAP_PAGINACAO linhas
    // (100 páginas de 1.000) faz `from` chegar a 100.000 na última página
    // cheia, e `100000 > 100000` é falso — a leitura conclui. Com `>=` esse
    // mesmo acervo, que COUBE certinho no teto, virava exceção como se tivesse
    // estourado; só uma linha 100.001 de verdade deve lançar.
    if (from > CAP_PAGINACAO)
      throw new Error(
        `${rotuloErro}: teto de paginação atingido (${CAP_PAGINACAO} linhas). ` +
          'A leitura foi abortada de propósito — devolver o acumulado seria afirmar ' +
          'um número truncado com cara de certo.',
      )
    if (teto === null) {
      // Primeira página: define o teto observado, não o confirma. Ver o
      // comentário acima — sempre pede mais uma antes de decidir que acabou.
      teto = rows.length
      continue
    }
    if (rows.length < teto) break
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

// Teto de lotes em voo ao mesmo tempo em `paginarPorIds` — ver o parágrafo "O
// TETO existe porque..." no comentário dela. Também importado por
// dev-destrutivo.ts para o mesmo fan-out de contagem em lote (ACHADO 7 de lá,
// mesmo motivo daqui) — 19/08/2026 (revisão).
export const LIMITE_LOTES_PARALELOS = 6

// Executa `fn` sobre `itens` com no máximo `limite` promessas em voo ao mesmo
// tempo. É um pool de `limite` "trabalhadores": cada um puxa o PRÓXIMO índice
// livre de uma fila compartilhada (`proximo`) assim que termina o anterior, em
// vez de lotes fixos de tamanho `limite` — lotes fixos desperdiçam
// concorrência (um item lento no lote 1 atrasa o lote 2 inteiro mesmo com
// vagas ociosas); o pool nunca fica com vaga livre enquanto houver item.
//
// O resultado sai NA ORDEM DE ENTRADA, não na ordem de conclusão: cada
// trabalhador grava em `resultados[indice]` — o índice que ele puxou da fila —
// então quem chama nunca precisa reordenar.
//
// Rejeição de qualquer `fn` propaga e NENHUMA fica órfã: cada trabalhador é
// uma função async dentro do array passado a `Promise.all`, então a rejeição
// sobe pelo `await fn(...)` do próprio trabalhador e o `Promise.all` é o
// handler dela — nunca uma promise solta fora de um await/all. (Ver o
// comentário longo em snapshot.ts: rejeição sem handler derruba o processo no
// Node, e numa função serverless isso alcança as requisições CONCORRENTES da
// MESMA instância, não só esta leitura — 19/08/2026, revisão, ACHADO 5.)
export async function mapComLimite<T, R>(
  itens: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = new Array(itens.length)
  let proximo = 0
  // FAIL-FAST na rejeição. Sem `abortado`, o `Promise.all` rejeita na hora mas
  // os OUTROS trabalhadores não ficam sabendo: seguem puxando índices da fila e
  // ABRINDO REQUISIÇÕES NOVAS para um resultado que o chamador já descartou —
  // gastando justamente o `db-pool` que `LIMITE_LOTES_PARALELOS` existe para
  // proteger. No `Promise.all` irrestrito de antes isso não podia acontecer
  // (tudo era disparado no instante zero, não sobrava fila pendente); com pool,
  // sobra. A chamada JÁ em voo não dá para cancelar — o que se impede é começar
  // trabalho NOVO depois do erro.
  let abortado = false
  async function trabalhador(): Promise<void> {
    for (;;) {
      if (abortado) return
      const indice = proximo++
      if (indice >= itens.length) return
      try {
        resultados[indice] = await fn(itens[indice], indice)
      } catch (err) {
        abortado = true
        throw err
      }
    }
  }
  const trabalhadores = Array.from({ length: Math.min(limite, itens.length) }, trabalhador)
  await Promise.all(trabalhadores)
  return resultados
}

// Lê em lotes uma consulta filtrada por uma lista de ids, paginando CADA lote
// (um id pode ter várias linhas — movimentações de um ativo, por exemplo, então
// nem o tamanho do lote limita o número de linhas devolvidas).
//
// A ordem do resultado é a dos lotes, isto é, a de `ids`: quem depende de
// ordenação (o `ultimoPorAtivo`, que reduz linhas JÁ ordenadas) precisa ordenar
// DENTRO de cada lote e agrupar por id — que é exatamente o que os chamadores
// fazem, porque o desempate deles é por ativo, nunca entre ativos diferentes.
//
// Os lotes vão EM PARALELO, até LIMITE_LOTES_PARALELOS por vez. É a mesma
// invariante de cima que autoriza o paralelismo: nenhum ativo se divide entre
// dois lotes, então nada num lote depende de outro e a ordem em que chegam não
// muda o resultado — `partes` sai na ordem de `lotes` (é o que `mapComLimite`
// garante, não a ordem de chegada), e `partes.flat()` recompõe a ordem de
// `ids`. Em série, `manutencaoDeEstado` com o preset "Tudo" pagaria ⌈n/100⌉
// round-trips enfileirados em CADA uma das quatro leituras por id; em paralelo
// irrestrito, pagaria a latência de um lote só.
//
// O TETO existe porque "paralelo irrestrito" cresce sozinho com o acervo, sem
// que ninguém precise tocar neste arquivo: hoje (~1,6 mil ativos) são 17 lotes
// por chamada, e o snapshot de relatório já dispara VÁRIAS destas
// concorrentemente — leitura de envios e de anotações da manutenção, por
// exemplo (estoque.ts) — o que soma dezenas de requisições PostgREST
// simultâneas por render contra o `db-pool` pequeno do plano Free. O número
// piora a cada filial nova importada. LIMITE_LOTES_PARALELOS = 6 dá folga
// sobre o pico de hoje sem devolver ao custo do fan-out serial — ACHADO 5,
// 19/08/2026 (revisão).
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
  const partes = await mapComLimite(lotes, LIMITE_LOTES_PARALELOS, (lote) =>
    paginarTodos<Row>(rotuloErro, (from, to) => fazPagina(lote, from, to)),
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
