import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { paginarTodos } from '@/lib/queries/relatorios/comum'
import type { CategoriaAtivo, StatusAtivo } from '@/lib/dominio'
import type { DbClient } from '@/lib/auth/acesso'
import type { GrupoConflito, LadoConflito } from '@/lib/pendencias/conflitos'

// Leituras da MESA DE CONFLITOS entre filiais (F24) — a seção própria de /pendencias.
//
// O conflito é DERIVADO (migrations 0092/0096): não há flag nem tabela de estado. Estas
// funções leem as duas views e nada mais. As views são `security_invoker`, então valem as
// mesmas regras de leitura de sempre: todo logado ATIVO enxerga; perfil desativado ou
// arquivado, não.
//
// A paginação é por GRUPO, não por ativo — e isso não é detalhe de implementação: paginar
// sobre os ativos cortaria um grupo entre duas páginas, e o sentido inteiro da mesa é ver
// os lados JUNTOS. Por isso a leitura é em dois passos: `v_conflitos_filiais_grupos` dá os
// grupos da página (com `.range()`), e `v_conflitos_filiais` dá os lados desses grupos
// (`.in('chave', …)`). Nunca há grupo partido.

const PAGE_SIZE = 20

/**
 * Faixa pedida além do fim do resultado. O PostgREST responde 416 com este código em vez de
 * uma lista vazia — mesma constante e mesmo tratamento de `listarPendencias`.
 */
const RANGE_INVALIDO = 'PGRST103'

export type PaginaConflitos = {
  grupos: GrupoConflito[]
  total: number
  page: number
  pageSize: number
}

type RowLado = {
  chave: string
  ativo_id: string
  patrimonio: string | null
  service_tag: string | null
  filial_id: number
  filial: string | null
  filial_nome: string | null
  status: StatusAtivo
  categoria: CategoriaAtivo
  marca: string | null
  modelo: string | null
  hostname: string | null
  colaborador_atual: string | null
  setor_atual: string | null
  origem: string | null
  pendencia: string | null
  entrada_em: string | null
  updated_at: string | null
  movimentacoes: number | null
  movimentacoes_reais: number | null
  ultima_mov_data: string | null
  ultima_mov_tipo: string | null
  termos: number | null
  tem_historico_real: boolean | null
}

const LADO_SELECT =
  'chave, ativo_id, patrimonio, service_tag, filial_id, filial, filial_nome, status, categoria, marca, modelo, hostname, colaborador_atual, setor_atual, origem, pendencia, entrada_em, updated_at, movimentacoes, movimentacoes_reais, ultima_mov_data, ultima_mov_tipo, termos, tem_historico_real'

/**
 * As chaves não-nulas de um resultado da view.
 *
 * Toda coluna de view sai `nullable` nos tipos gerados, mas `v_conflitos_filiais` já filtra
 * `chave is not null` na origem (ativo sem identidade — sem patrimônio E sem service tag —
 * nunca entra num grupo). O guard existe para satisfazer o tipo sem `!`, e é barato.
 */
function chavesNaoNulas(linhas: { chave: string | null }[] | null): string[] {
  return (linhas ?? []).map((r) => r.chave).filter((c): c is string => c !== null)
}

/**
 * Todas as chaves de conflito que tocam uma filial — PAGINADO.
 *
 * ⚠ A paginação não é zelo excessivo: o PostgREST corta todo select em 1.000 linhas EM
 * SILÊNCIO, e o volume de conflitos NÃO é necessariamente pequeno. O cenário que a própria
 * F24 destravou é justamente o que o torna grande: importar por engano o CSV de uma filial
 * escolhendo OUTRA filial na tela cria um conflito por linha do arquivo — centenas de uma
 * vez. Sem paginar, a mesa mostraria os 1.000 primeiros e esconderia o resto sem avisar,
 * que é exatamente o tipo de truncamento silencioso que este projeto não aceita.
 */
async function chavesDasFiliais(
  client: DbClient,
  filialSlugs: readonly string[],
): Promise<string[]> {
  const rows = await paginarTodos<{ chave: string | null }>(
    'Falha ao listar as chaves de conflito da filial',
    (from, to) =>
      client
        .from('v_conflitos_filiais')
        .select('chave')
        .in('filial', filialSlugs)
        .order('chave')
        // ⚠ Desempate OBRIGATÓRIO: `chave` sozinha não é uma ordenação total, e o Postgres
        // não promete a mesma ordem entre os dois `range()` de páginas consecutivas — um
        // empate na fronteira das 1.000 linhas some sem aviso. `ativo_id` é único na view.
        .order('ativo_id')
        .range(from, to),
  )
  return [...new Set(chavesNaoNulas(rows))]
}

function mapearLado(r: RowLado): LadoConflito {
  return {
    ativoId: r.ativo_id,
    patrimonio: r.patrimonio,
    serviceTag: r.service_tag,
    filialId: r.filial_id,
    filialSlug: r.filial ?? '',
    filialNome: r.filial_nome ?? '—',
    status: r.status,
    categoria: r.categoria,
    marca: r.marca,
    modelo: r.modelo,
    hostname: r.hostname,
    colaborador: r.colaborador_atual,
    setor: r.setor_atual,
    origem: r.origem,
    pendencia: r.pendencia,
    entradaEm: r.entrada_em,
    atualizadoEm: r.updated_at,
    movimentacoes: r.movimentacoes ?? 0,
    movimentacoesReais: r.movimentacoes_reais ?? 0,
    ultimaMovData: r.ultima_mov_data,
    ultimaMovTipo: r.ultima_mov_tipo,
    termos: r.termos ?? 0,
    temHistoricoReal: r.tem_historico_real ?? false,
  }
}

/**
 * Quantos GRUPOS de conflito existem (opcionalmente recortados por filial).
 *
 * ⚠ A decisão registrada (docs/DECISOES.md, F24): **um GRUPO = uma pendência**. Contar
 * ativos daria 2 (ou 3) por conflito e inflaria o badge com o mesmo problema contado duas
 * vezes; quem olha a fila quer saber quantas DECISÕES estão esperando, e cada grupo é uma
 * decisão só ("qual destes é o certo?").
 *
 * O recorte por filial é pelo LADO: um grupo entra na contagem da filial X se ALGUM dos
 * lados dele está em X. Isso significa que o mesmo grupo aparece na contagem das duas
 * filiais envolvidas — e está certo, porque o problema é das duas.
 */
export async function contarGruposConflito(
  client: DbClient,
  filialSlugs: readonly string[] = [],
): Promise<number> {
  if (filialSlugs.length === 0) {
    const { count, error } = await client
      .from('v_conflitos_filiais_grupos')
      .select('chave', { count: 'exact', head: true })
    if (error) throw new Error(`Falha ao contar conflitos: ${error.message}`)
    return count ?? 0
  }

  // ⚠ F25 — COM DUAS OU MAIS FILIAIS O ATALHO ABAIXO MENTE. O invariante que o
  // autoriza ("um grupo tem no máximo UM lado por filial") vale POR FILIAL: um
  // grupo cujos dois lados estão nas duas filiais selecionadas seria contado DUAS
  // vezes, e o chip anunciaria o dobro do trabalho — violando a decisão da F24 de
  // que um GRUPO é uma pendência. Aqui não há saída barata: é preciso contar
  // CHAVES DISTINTAS, e por isso a varredura paginada. Ela custa uma requisição
  // na prática (282 lados / 138 grupos em produção em 04/08/2026, contra a página
  // de 1.000 de `paginarTodos`).
  if (filialSlugs.length > 1) {
    return (await chavesDasFiliais(client, filialSlugs)).length
  }

  // Com filial: a view agregada não guarda o slug (ela agrega os nomes), então a contagem
  // sai dos LADOS.
  //
  // ⚠ Contar os lados DESTA filial já É contar os grupos: um grupo tem no máximo UM lado
  // por filial (é o que o índice único por filial da 0091 garante, e a chave de identidade
  // é injetiva desde a 0099), logo lados-na-filial e chaves-distintas-na-filial são o mesmo
  // número. Por isso aqui vai um `count exact / head` — uma requisição, sem trazer linha
  // nenhuma — e não a varredura paginada de `chavesDaFilial`: esta contagem roda no
  // carregamento de TODA aba de /pendencias (o chip aparece em qualquer uma), inclusive nas
  // que nem mostram a mesa.
  const { count, error } = await client
    .from('v_conflitos_filiais')
    .select('ativo_id', { count: 'exact', head: true })
    .eq('filial', filialSlugs[0])
  if (error) throw new Error(`Falha ao contar conflitos: ${error.message}`)
  return count ?? 0
}

/**
 * Contagem para o badge da sidebar. Falha de leitura NÃO derruba o shell — devolve 0 e
 * registra no log, exatamente como `contarPendenciasAbertas` faz desde a F9.
 */
export async function contarConflitosAbertos(
  // F25 — mesmo recorte do badge de pendências: o selo tem de contar o que a mesa
  // vai mostrar para quem está olhando.
  filialSlugs: readonly string[] = [],
): Promise<number> {
  try {
    const client = await createClient()
    return await contarGruposConflito(client, filialSlugs)
  } catch (e) {
    console.error(`Falha ao contar conflitos entre filiais: ${(e as Error).message}`)
    return 0
  }
}

/**
 * As chaves cujo GRUPO tem algum lado casando com a busca da barra de filtros.
 *
 * Sem isto, digitar um patrimônio na aba de conflitos não fazia nada: a caixa de busca
 * continuava na tela, o `?q=` continuava na URL, e a mesa devolvia tudo como se nenhum
 * filtro tivesse sido pedido. Filtro que a tela oferece e ignora é pior do que filtro que
 * não existe.
 *
 * ⚠ Basta UM lado casar para o grupo inteiro ficar — cortar o lado que não casa desfaria
 * justamente a comparação que a mesa existe para permitir.
 *
 * A sanitização dos metacaracteres é a mesma de `queryPendencias`: o `*` entra na lista
 * porque o PostgREST o TRADUZ para `%` no ilike, e sem ele `?q=*` viraria `%%%`, devolvendo
 * a mesa inteira como se fosse o resultado da busca.
 */
async function chavesPorBusca(client: DbClient, termo: string): Promise<Set<string>> {
  const esc = termo.replace(/[%_*,()\\]/g, ' ').trim()
  if (esc === '') return new Set()

  const rows = await paginarTodos<{ chave: string | null }>(
    'Falha ao buscar conflitos',
    (from, to) =>
      client
        .from('v_conflitos_filiais')
        .select('chave')
        .or(
          `patrimonio.ilike.%${esc}%,service_tag.ilike.%${esc}%,` +
            `colaborador_atual.ilike.%${esc}%,hostname.ilike.%${esc}%,modelo.ilike.%${esc}%`,
        )
        .order('chave')
        // ⚠ Aqui o desempate não é zelo: sem recorte de filial a mesma `chave` aparece 2–3
        // vezes (uma por lado), então ordenar só por ela deixa empates de verdade. Sem
        // `ativo_id`, uma busca ampla que passe de 1.000 lados pode perder uma chave na
        // virada de página e o grupo somer da mesa E do CSV — o truncamento silencioso que
        // esta paginação existe para impedir.
        .order('ativo_id')
        .range(from, to),
  )
  return new Set(chavesNaoNulas(rows))
}

/**
 * Uma página de GRUPOS, com todos os lados de cada um.
 *
 * Passo 1 — os grupos da página, ordenados pelo rótulo (estável e legível: o patrimônio,
 * ou a service tag quando não há plaqueta). Passo 2 — todos os lados desses grupos.
 * Entre os dois passos o acervo pode mudar; se um grupo se desfizer nesse intervalo ele
 * simplesmente some da lista (sem lados = sem linha), que é o comportamento certo para uma
 * fonte derivada.
 */
export async function listarConflitos(
  opts: { filialSlugs?: readonly string[]; q?: string | null; page?: number } = {},
): Promise<PaginaConflitos> {
  const client = await createClient()
  let page = Math.max(1, opts.page ?? 1)
  const filialSlugs = opts.filialSlugs ?? []
  const termo = opts.q?.trim() || null

  // ---- o UNIVERSO de chaves visíveis, ANTES de paginar ----
  // ⚠ Filtrar depois de paginar seria o defeito clássico: a página 1 traria 20 grupos, o
  // filtro cortaria 18 e a tela mostraria 2 dizendo "de 47" — com páginas seguintes vazias.
  // Por isso os dois filtros (filial e busca) restringem o universo primeiro; a paginação
  // vem depois, sobre o que sobrou.
  let universo: string[] | null = null

  if (filialSlugs.length > 0) universo = await chavesDasFiliais(client, filialSlugs)

  if (termo) {
    const porBusca = await chavesPorBusca(client, termo)
    universo = universo ? universo.filter((c) => porBusca.has(c)) : [...porBusca]
  }

  let chaves: string[]
  let total: number

  if (universo !== null) {
    const todas = universo.sort((a, b) => a.localeCompare(b, 'pt-BR'))
    total = todas.length
    // Este caminho fatia em memória, então uma página além do fim devolve lista vazia em
    // vez de 416 — mas devolveria a página PEDIDA no rodapé, e o operador veria "página 3"
    // sobre uma mesa vazia. Clampa para a última que existe, como o outro caminho faz.
    page = Math.min(page, Math.max(1, Math.ceil(total / PAGE_SIZE)))
    chaves = todas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  } else {
    const pagina = (p: number) =>
      client
        .from('v_conflitos_filiais_grupos')
        .select('chave, rotulo', { count: 'exact' })
        .order('rotulo', { ascending: true })
        .order('chave', { ascending: true })
        .range((p - 1) * PAGE_SIZE, p * PAGE_SIZE - 1)

    let { data, error, count } = await pagina(page)

    // Faixa além do fim → o PostgREST responde 416 com PGRST103, não uma lista vazia.
    // Sem este clamp, um `?page=3` de favorito — ou a própria página em que a pessoa
    // estava quando apagou o ÚLTIMO conflito dela — derrubaria a tela com erro, e o
    // "Tentar novamente" refalharia para sempre porque a URL não muda. Mesmo tratamento
    // (e mesma constante) de `listarPendencias`. Uma tentativa só, sem laço.
    if (error?.code === RANGE_INVALIDO) {
      const { count: total2, error: erroTotal } = await pagina(1)
      if (erroTotal) throw new Error(`Falha ao listar conflitos: ${erroTotal.message}`)
      page = Math.max(1, Math.ceil((total2 ?? 0) / PAGE_SIZE))
      ;({ data, error, count } = await pagina(page))
    }

    if (error) throw new Error(`Falha ao listar conflitos: ${error.message}`)
    total = count ?? 0
    chaves = chavesNaoNulas(data)
  }

  if (chaves.length === 0) {
    return { grupos: [], total, page, pageSize: PAGE_SIZE }
  }

  // Os lados dos grupos VISÍVEIS. `chaves` tem no máximo PAGE_SIZE (20) itens e um grupo
  // tem 2–3 lados, então isto cabe folgado numa página do PostgREST — mas pagina do mesmo
  // jeito, para o teto nunca ser uma suposição.
  const lados = await paginarTodos<RowLado>(
    'Falha ao ler os lados do conflito',
    (from, to) =>
      client
        .from('v_conflitos_filiais')
        .select(LADO_SELECT)
        .in('chave', chaves)
        .order('chave', { ascending: true })
        .order('filial_id', { ascending: true })
        .range(from, to),
  )

  const porChave = new Map<string, LadoConflito[]>()
  for (const r of lados) {
    const lista = porChave.get(r.chave)
    if (lista) lista.push(mapearLado(r))
    else porChave.set(r.chave, [mapearLado(r)])
  }

  const grupos: GrupoConflito[] = chaves
    .map((chave) => {
      const l = porChave.get(chave) ?? []
      return {
        chave,
        // Mesmo rótulo do banco (`v_conflitos_filiais_grupos.rotulo`): patrimônio, ou
        // service tag quando não há plaqueta. Derivado aqui para não depender de um
        // segundo select quando o caminho é o do filtro por filial.
        rotulo: l[0]?.patrimonio ?? l[0]?.serviceTag ?? chave,
        lados: l,
      }
    })
    // Grupo que se desfez entre os dois passos não tem lados — some da lista.
    .filter((g) => g.lados.length > 0)

  return { grupos, total, page, pageSize: PAGE_SIZE }
}

/**
 * TODOS os lados em conflito, para o export CSV — sem a paginação da tela.
 *
 * Uma linha por LADO (não por grupo), com a chave do grupo em cada uma, para que o arquivo
 * possa ser ordenado/agrupado no Excel e os pares fiquem adjacentes. Ordenado por chave e
 * filial: os dois lados do mesmo conflito saem lado a lado, como na tela.
 */
export async function listarConflitosParaExport(
  opts: { filialSlugs?: readonly string[]; q?: string | null } = {},
): Promise<{ chave: string; lado: LadoConflito }[]> {
  const client = await createClient()
  const filialSlugs = opts.filialSlugs ?? []
  const termo = opts.q?.trim() || null

  // Recorte por filial e/ou busca: as CHAVES que sobrevivem aos filtros — e depois TODOS os
  // lados dessas chaves. Filtrar direto por `filial` (ou pelo texto) traria só metade de
  // cada conflito, e um conflito com um lado só não é um conflito: é uma linha sem sentido
  // no arquivo.
  //
  // ⚠ Os MESMOS filtros da tela, pela mesma razão do invariante da F10 §T5: o arquivo tem
  // de sair com exatamente as linhas que estavam visíveis.
  let chaves: string[] | null = null
  if (filialSlugs.length > 0) chaves = await chavesDasFiliais(client, filialSlugs)
  if (termo) {
    const porBusca = await chavesPorBusca(client, termo)
    chaves = chaves ? chaves.filter((c) => porBusca.has(c)) : [...porBusca]
  }
  if (chaves !== null && chaves.length === 0) return []

  // Paginado: o export não tem teto de tela, e um import errado pode ter aberto centenas
  // de conflitos de uma vez. O corte de 1.000 do PostgREST sairia como arquivo incompleto
  // sem nenhum aviso — e um export truncado em silêncio é pior que um export que falha.
  const lados = await paginarTodos<RowLado>('Falha ao exportar conflitos', (from, to) => {
    let q = client
      .from('v_conflitos_filiais')
      .select(LADO_SELECT)
      .order('chave', { ascending: true })
      .order('filial_id', { ascending: true })
      .range(from, to)
    if (chaves) q = q.in('chave', chaves)
    return q
  })

  return lados.map((r) => ({ chave: r.chave, lado: mapearLado(r) }))
}

/**
 * O ACERVO COMPLETO dos ativos que vão ser apagados — para o backup em ARQUIVO.
 *
 * ⚠ Não confunda com `ladosDosAtivos`: aquele devolve o RESUMO da view (o que a tela
 * mostra); este devolve as LINHAS, com todo o rastro. A distinção é a diferença entre um
 * backup que restaura e um backup que só descreve.
 *
 * Abaixo do cap, quem monta o backup é a própria RPC, em jsonb, dentro da transação — e é
 * melhor assim. Acima do cap o jsonb sairia do razoável, então o backup vira arquivo, e o
 * arquivo tem de conter exatamente o que o jsonb conteria: ativo, movimentações, termos,
 * anotações e pendências de item. Espelha o `jsonb_build_object` da migration 0093.
 */
export async function acervoDosAtivos(
  client: DbClient,
  ativoIds: string[],
): Promise<{
  ativos: unknown[]
  movimentacoes: unknown[]
  termos_gerados: unknown[]
  anotacoes: unknown[]
  pendencias_item: unknown[]
}> {
  if (ativoIds.length === 0) {
    return { ativos: [], movimentacoes: [], termos_gerados: [], anotacoes: [], pendencias_item: [] }
  }

  const tabela = async (nome: 'ativos' | 'movimentacoes' | 'anotacoes' | 'pendencias_item') =>
    paginarTodos<unknown>(`Falha ao exportar ${nome} do backup`, (from, to) =>
      client
        .from(nome)
        .select('*')
        .in(nome === 'ativos' ? 'id' : 'ativo_id', ativoIds)
        .order('id')
        .range(from, to),
    )

  const [ativos, movimentacoes, anotacoes, pendencias_item, todosTermos] = await Promise.all([
    tabela('ativos'),
    tabela('movimentacoes'),
    tabela('anotacoes'),
    tabela('pendencias_item'),
    // `termos_gerados.ativo_ids` é array de uuid (sem FK), então o recorte é em memória —
    // mesmo caminho de `exportarAcervoFilial`.
    paginarTodos<{ ativo_ids: string[] }>('Falha ao exportar termos do backup', (from, to) =>
      client.from('termos_gerados').select('*').order('id').range(from, to),
    ),
  ])

  const alvo = new Set(ativoIds)
  const termos_gerados = todosTermos.filter((t) => t.ativo_ids.some((a) => alvo.has(a)))

  return { ativos, movimentacoes, anotacoes, pendencias_item, termos_gerados }
}

/**
 * Os lados de um conjunto de ativos, para o diálogo mostrar o resumo REAL lido na hora
 * (§4.3) — e não o que a tela tinha em memória quando a página carregou.
 */
export async function ladosDosAtivos(
  client: DbClient,
  ativoIds: string[],
): Promise<LadoConflito[]> {
  if (ativoIds.length === 0) return []
  const { data, error } = await client
    .from('v_conflitos_filiais')
    .select(LADO_SELECT)
    .in('ativo_id', ativoIds)
  if (error) throw new Error(`Falha ao ler os cadastros em conflito: ${error.message}`)
  return ((data ?? []) as RowLado[]).map(mapearLado)
}
