import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Infra compartilhada da camada de dados dos relatórios (OS-F3 3.6). Reúne o que
// todos os módulos de relatório usam: o client tipado já resolvido (RLS do
// operador OU client administrativo p/ sessão por senha — lib/auth/acesso.ts), a
// resolução de filial e os utilitários de leitura (paginação do PostgREST,
// "última mov por ativo", rótulo de modelo). Ver docs/DECISOES.md.

export type DbClient = SupabaseClient<Database>

export type Filial = { id: number; nome: string; slug: string }

// ⚠ LÊ O `error` — e é uma linha que separa "quebrou" de "quebrou em silêncio".
//
// Até a F50 esta função fazia `const { data } = await …` e descartava o `error`:
// qualquer falha virava `null`, e `null` vira `notFound()` em TODA rota de relatório
// — para o operador E para o visualizador por senha —, sem uma linha de log.
//
// Hoje `filiais.slug` é `unique` GLOBAL (`0003_tabelas.sql:11`), então não havia bug
// ativo: `maybeSingle()` sobre uma coluna única devolve 0 ou 1 linha, nunca duas. O
// conserto é PREVENTIVO, e a prevenção tem data marcada: quando a unicidade do slug
// passar a ser por empresa, dois slugs iguais em empresas diferentes farão o
// PostgREST devolver PGRST116 ("mais de uma linha"), e a versão antiga transformaria
// isso num 404 mudo em todo relatório — o modo de falha mais caro de diagnosticar,
// porque a tela não mente: ela some.
export async function resolverFilialPorSlug(
  client: DbClient,
  slug: string,
): Promise<Filial | null> {
  const { data, error } = await client
    .from('filiais')
    .select('id, nome, slug')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(`Falha ao resolver a filial "${slug}": ${error.message}`)
  return data ?? null
}

// Rótulo de modelo a partir de marca+modelo (fonte única das listas do
// relatório). Vazio → "Sem modelo".
export function modeloDe(marca: string | null, modelo: string | null): string {
  return [marca, modelo].filter(Boolean).join(' ').trim() || 'Sem modelo'
}

// Paginação única do PostgREST (que corta selects em 1.000 linhas). Uma única
// constante de página; o TETO é de cada chamada (F60, abaixo).
//
// O teto NÃO é um limite de leitura: ULTRAPASSÁ-LO lança — não alcançá-lo. Ver
// o off-by-one corrigido em `paginarTodos` (19/08/2026, revisão): um acervo de
// exatamente `cap` linhas precisa CONCLUIR a leitura, não abortar; só a linha
// `cap + 1` é excedente de verdade. Um teto que corta dado e devolve o
// acumulado seria a mesma falha silenciosa que esta paginação existe para
// eliminar — só que num número maior e mais convincente.
const PAGINA = 1000

// ⚠ F60 (fato 15 · PLAN-F60 §2.1 e §10, decisão 5) — O TETO É POR CHAMADA, E É OBRIGATÓRIO.
//
// Até a F59 havia um `CAP_PAGINACAO = 100_000` só, para as 48 chamadas: a leitura dos 23 itens
// do catálogo e a de todas as movimentações tinham o MESMO teto, e ele não dizia nada sobre
// nenhuma das duas — um laço que lesse o catálogo mil vezes maior do que é passaria calado
// até 100 mil linhas. Agora o `cap` é o terceiro parâmetro (o quarto em `paginarPorIds`), SEM
// valor padrão: esquecer é erro de `tsc`, não um teto herdado. E cada chamada passa a constante
// do DOMÍNIO que ela lê, com a conta escrita aqui — a régua do plano:
//
//   teto = o menor valor da série 1–2–5 × 10ⁿ que seja ≥ 20 × o volume de produção de 16/09/2026,
//          com PISO de 10.000.
//
// Por que 20×: o domínio precisa crescer mais de uma ordem de grandeza para o teto disparar em
// operação legítima, e um laço ou um filtro esquecido (que multiplica a leitura, não a soma) ainda
// estoura na primeira execução. Por que o piso: abaixo de ~500 linhas, 20× é ruído — um único
// import de startup de filial passa dele —, e um teto que dispara em operação legítima vira
// exceção na cara do gestor. Leitura em LOTE de 100 ids: máx. por ativo × 100 × 20, com o mesmo
// piso (o `cap` vale por lote, como sempre valeu — o `paginarTodos` interno o recebe).
//
// Quando um domínio passar do teto de verdade, a correção é refazer a conta aqui, com o volume
// novo e a data — nunca trocar a constante da chamada por uma maior "que cabe".

/** O piso da régua: nenhum teto abaixo disto (ver a conta acima). */
export const CAP_PISO = 10_000
/**
 * `ativos` — 1.635 em 16/09 × 20 = 32.700 → 50.000 (30,6× de folga). Vale também para o as-of
 * (`rel_estoque_asof`: no máximo UMA linha por ativo) e para `v_conflitos_filiais` (no máximo UM
 * lado por ativo): os dois são limitados pelo número de ativos, não por um volume próprio.
 */
export const CAP_ATIVOS = 50_000
/** `movimentacoes` — 3.578 em 16/09 × 20 = 71.560 → 100.000 (27,9×). É o teto único de antes. */
export const CAP_MOVIMENTACOES = 100_000
/** `lancamentos_item` — 155 em 16/09 × 20 = 3.100 → piso (64,5×). */
export const CAP_LANCAMENTOS_ITEM = CAP_PISO
/** `termos_gerados` — 107 em 16/09 × 20 = 2.140 → piso (93×). */
export const CAP_TERMOS_GERADOS = CAP_PISO
/** `colaboradores` — 34 em 16/09 → piso (294×). */
export const CAP_COLABORADORES = CAP_PISO
/** `itens` (o catálogo) — 23 em 16/09 → piso (434×). */
export const CAP_ITENS = CAP_PISO
/** `anotacoes` — 16 em 16/09 → piso (625×). */
export const CAP_ANOTACOES = CAP_PISO
/** `pendencias_item` — 17 em 16/09 → piso (588×). */
export const CAP_PENDENCIAS_ITEM = CAP_PISO
/**
 * As movimentações de UM ativo (a linha do tempo da ficha) — máx. 9 por ativo em 16/09 × 20 = 180
 * → piso.
 */
export const CAP_MOVIMENTACOES_DO_ATIVO = CAP_PISO
/**
 * Um LOTE de 100 ids lido em `movimentacoes` por `ativo_id` — máx. 9 por ativo em 16/09:
 * 9 × 100 × 20 = 18.000 → 20.000.
 */
export const CAP_LOTE_MOVIMENTACOES = 20_000
/**
 * Um LOTE de 100 ids em qualquer outra tabela — `anotacoes` (máx. 2 por ativo), `ativos` por `id`
 * ou por `substitui_ativo_id`, estornos (≤ 1 por movimentação), `termos_gerados`,
 * `pendencias_item`, lançamentos por movimentação/pendência e `v_conflitos_filiais` por ativo:
 * ≤ 200 linhas por lote × 20 = 4.000 → piso.
 */
export const CAP_LOTE = CAP_PISO

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
//
// ⚠ F58 — A LINHA É INFERIDA DO BUILDER, NÃO DECLARADA. Até a F58 `fazPagina` devolvia
// `{ data: unknown }` e esta função fazia `(data ?? []) as Row[]`: um cast só, aqui dentro, que
// apagava o tipo do `select` para as ~33 leituras em lote que passam por ela — quem chamava
// `paginarTodos<X>` escrevia QUALQUER `X`, e uma coluna ausente do `select` virava `undefined`
// silencioso. Agora `Row` sai do tipo que o supabase-js infere do `select` literal, e um `<X>`
// explícito no chamador só compila se a linha real couber nele.
//
// ⚠ F60 — DUAS FORMAS DE PEDIR A PÁGINA, UM LAÇO SÓ (PLAN-F60 §2.1 e §10, decisão 5).
//
// · OFFSET — `fazPagina(from, to)` com `.range(from, to)`: a forma de sempre. Fica onde o keyset
//   não cabe, e cada uma dessas chamadas diz o motivo ao lado: ordem COMPOSTA sem cursor simples
//   (trocar `created_at desc, id desc` por `ordem desc` muda a ordem visível no empate — o backlog
//   das "duas réguas" da F53), fonte RPC (a porta devolve builder sem filtro no TIPO — `rpc.ts`),
//   lista de tela de página única, ou view sem unicidade declarada.
//
// · KEYSET — `{ porChave(depoisDe, tamanho), chaveDe(linha) }`: onde a ordem de hoje já é UMA
//   coluna única (o `id`). A consulta ordena ASC por ela, filtra `.gt(coluna, depoisDe)` quando
//   `depoisDe` não é `null` e pede `.limit(tamanho)`; `chaveDe` devolve o valor dessa coluna na
//   linha, e o laço guarda o da última linha como o `depoisDe` da página seguinte. A ordem de
//   saída é a MESMA do OFFSET por `id` — o que muda é o custo da página N: o OFFSET lê e
//   DESCARTA as linhas das N−1 páginas anteriores a cada pedido, e o `gt` as deixa de fora no
//   próprio filtro. No volume de 16/09 (uma ou duas páginas por leitura) a diferença não se mede;
//   o que se compra é a forma, que para de crescer com o número da página.
//
// O FIM é o MESMO critério nas duas — a página menor que o teto OBSERVADO, documentado acima — e o
// laço é um só (`lerPaginas`, abaixo): duplicá-lo seria reabrir, numa cópia, o off-by-one do teto
// e o `continue` da primeira página que a revisão de 19/08 levou três achados para acertar.
//
// ⚠ A GUARDA DA CHAVE (só no keyset): toda chave tem de ser ESTRITAMENTE maior que a anterior —
// dentro da página e na virada entre páginas. Não é zelo. Um `.gt` esquecido devolve a mesma
// primeira página para sempre (laço até o teto, com linhas repetidas no meio); um `.order` DESC
// ou esquecido faz o `.gt` pular linhas que ainda não vieram. Os dois são corte ou duplicata
// SILENCIOSOS no resultado, e a guarda os transforma em exceção na primeira página que mostra o
// defeito. A comparação é a do JavaScript no tipo da chave, e casa com a do Postgres nos dois
// cursores que existem: inteiro (número com número) e uuid (o texto canônico que o PostgREST
// devolve é minúsculo, com os hífens nas mesmas posições, e `'0'…'9' < 'a'…'f'` em código de
// caractere — então a ordem do texto é a ordem dos 128 bits, que é a do `uuid_cmp`). Uma coluna
// de TEXTO com collation não tem essa garantia: não use keyset nela sem refazer esta conta — a
// guarda lançaria (alto, nunca calado), mas lançaria em operação legítima.
type RespostaDePagina<Row> = { data: readonly Row[] | null; error: { message: string } | null }

/** O valor do cursor do keyset: o `id` inteiro ou uuid (ver a guarda da chave, acima). */
export type ChaveDeKeyset = string | number

/** OFFSET: a janela `[from, to]` vira `.range(from, to)`. */
export type PaginaPorOffset<Row> = (from: number, to: number) => PromiseLike<RespostaDePagina<Row>>

/** KEYSET: a página das linhas com chave `> depoisDe` (`null` = a primeira), em ordem ASC, até `tamanho`. */
export type PaginaPorChave<Row, K extends ChaveDeKeyset> = {
  porChave: (depoisDe: K | null, tamanho: number) => PromiseLike<RespostaDePagina<Row>>
  chaveDe: (linha: Row) => K
}

export async function paginarTodos<Row, K extends ChaveDeKeyset = string>(
  rotuloErro: string,
  fazPagina: PaginaPorOffset<Row> | PaginaPorChave<Row, K>,
  cap: number,
): Promise<Row[]> {
  if (typeof fazPagina === 'function') {
    return lerPaginas(rotuloErro, cap, (lidas) => fazPagina(lidas, lidas + PAGINA - 1), () => {})
  }
  const { porChave, chaveDe } = fazPagina
  let depoisDe: K | null = null
  return lerPaginas(
    rotuloErro,
    cap,
    () => porChave(depoisDe, PAGINA),
    (rows) => {
      for (const linha of rows) {
        const chave = chaveDe(linha)
        if (depoisDe !== null && !chaveCresce(depoisDe, chave))
          throw new Error(
            `${rotuloErro}: a chave do keyset não cresceu (${String(depoisDe)} → ${String(chave)}). ` +
              'A consulta tem de ordenar ASC pela coluna do cursor e filtrar `gt` nela — ' +
              'seguir leria linha repetida ou pularia linha, em silêncio.',
          )
        depoisDe = chave
      }
    },
  )
}

/** Estritamente maior, e no MESMO tipo: chave que troca de tipo no meio da leitura também é defeito. */
function chaveCresce(anterior: ChaveDeKeyset, atual: ChaveDeKeyset): boolean {
  if (typeof anterior === 'number' && typeof atual === 'number') return atual > anterior
  if (typeof anterior === 'string' && typeof atual === 'string') return atual > anterior
  return false
}

// O laço das duas formas. `pedir(lidas)` busca a próxima página (o OFFSET usa `lidas` como
// `from`; o keyset ignora e usa o cursor que `aceitar` avançou); `aceitar(rows)` roda ANTES de a
// página entrar no acumulado — é onde o keyset confere a ordem e move o cursor.
async function lerPaginas<Row>(
  rotuloErro: string,
  cap: number,
  pedir: (lidas: number) => PromiseLike<RespostaDePagina<Row>>,
  aceitar: (rows: readonly Row[]) => void,
): Promise<Row[]> {
  // O `cap` é obrigatório no TIPO; aqui se recusa o valor que o esvaziaria sem erro de
  // compilação — `0`, negativo, `NaN` (divisão por zero numa conta) ou `Infinity`.
  if (!Number.isSafeInteger(cap) || cap <= 0)
    throw new Error(`${rotuloErro}: teto de paginação inválido (${cap}) — passe a constante CAP_* do domínio.`)
  const acc: Row[] = []
  // Teto de linhas por página OBSERVADO na primeira resposta do servidor —
  // não é `PAGINA` (o que pedimos), é o que ele de fato entregou. `null` até a
  // primeira página chegar. Ver o comentário acima.
  let teto: number | null = null
  for (;;) {
    const { data, error } = await pedir(acc.length)
    if (error) throw new Error(`${rotuloErro}: ${error.message}`)
    const rows = data ?? []
    if (rows.length === 0) break
    aceitar(rows)
    acc.push(...rows)
    // Teto sobre o EXCEDENTE, não sobre o total exato — ACHADO 6, 19/08/2026
    // (revisão). `>`, não `>=`: um acervo de exatamente `cap` linhas (por
    // exemplo 100 páginas de 1.000 com `cap` 100.000) faz o acumulado chegar a
    // `cap` na última página cheia, e `cap > cap` é falso — a leitura conclui.
    // Com `>=` esse mesmo acervo, que COUBE certinho no teto, virava exceção
    // como se tivesse estourado; só a linha `cap + 1` de verdade deve lançar.
    if (acc.length > cap)
      throw new Error(
        `${rotuloErro}: teto de paginação atingido (${cap} linhas). ` +
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
//
// F60 — as MESMAS duas formas de `paginarTodos`, agora recebendo o lote na frente: OFFSET
// `(lote, from, to)` ou KEYSET `{ porChave(lote, depoisDe, tamanho), chaveDe }`. O cursor do keyset
// é POR LOTE (cada lote é uma leitura paginada independente, que começa em `null`), e o `cap`
// também — é o teto de UM lote, como o de antes (as constantes `CAP_LOTE*` carregam essa conta).
export type PaginaPorOffsetDoLote<Row> = (
  lote: string[],
  from: number,
  to: number,
) => PromiseLike<RespostaDePagina<Row>>

export type PaginaPorChaveDoLote<Row, K extends ChaveDeKeyset> = {
  porChave: (lote: string[], depoisDe: K | null, tamanho: number) => PromiseLike<RespostaDePagina<Row>>
  chaveDe: (linha: Row) => K
}

export async function paginarPorIds<Row, K extends ChaveDeKeyset = string>(
  rotuloErro: string,
  ids: readonly string[],
  fazPagina: PaginaPorOffsetDoLote<Row> | PaginaPorChaveDoLote<Row, K>,
  cap: number,
): Promise<Row[]> {
  if (ids.length === 0) return []
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += LOTE_IDS) lotes.push(ids.slice(i, i + LOTE_IDS))
  const pagina = (lote: string[]): PaginaPorOffset<Row> | PaginaPorChave<Row, K> => {
    if (typeof fazPagina === 'function') return (from, to) => fazPagina(lote, from, to)
    const { porChave, chaveDe } = fazPagina
    return { porChave: (depoisDe, tamanho) => porChave(lote, depoisDe, tamanho), chaveDe }
  }
  const partes = await mapComLimite(lotes, LIMITE_LOTES_PARALELOS, (lote) =>
    paginarTodos<Row, K>(rotuloErro, pagina(lote), cap),
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
