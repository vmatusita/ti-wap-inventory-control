import 'server-only'
import { createClient } from '@/lib/supabase/server'
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
  filialSlug: string | null = null,
): Promise<number> {
  if (!filialSlug) {
    const { count, error } = await client
      .from('v_conflitos_filiais_grupos')
      .select('chave', { count: 'exact', head: true })
    if (error) throw new Error(`Falha ao contar conflitos: ${error.message}`)
    return count ?? 0
  }

  // Com filial: a view agregada não guarda o slug (ela agrega os nomes), então a contagem
  // sai dos LADOS — chaves distintas cujo lado está nesta filial.
  const { data, error } = await client
    .from('v_conflitos_filiais')
    .select('chave')
    .eq('filial', filialSlug)
  if (error) throw new Error(`Falha ao contar conflitos da filial: ${error.message}`)
  return new Set(chavesNaoNulas(data)).size
}

/**
 * Contagem para o badge da sidebar. Falha de leitura NÃO derruba o shell — devolve 0 e
 * registra no log, exatamente como `contarPendenciasAbertas` faz desde a F9.
 */
export async function contarConflitosAbertos(): Promise<number> {
  try {
    const client = await createClient()
    return await contarGruposConflito(client, null)
  } catch (e) {
    console.error(`Falha ao contar conflitos entre filiais: ${(e as Error).message}`)
    return 0
  }
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
  opts: { filialSlug?: string | null; page?: number } = {},
): Promise<PaginaConflitos> {
  const client = await createClient()
  const page = Math.max(1, opts.page ?? 1)
  const filialSlug = opts.filialSlug?.trim() || null

  // Com filtro de filial, as chaves visíveis saem dos lados daquela filial; sem filtro,
  // saem direto da view agregada (que já é uma linha por grupo).
  let chaves: string[]
  let total: number

  if (filialSlug) {
    const { data, error } = await client
      .from('v_conflitos_filiais')
      .select('chave')
      .eq('filial', filialSlug)
    if (error) throw new Error(`Falha ao listar conflitos: ${error.message}`)
    // `chave` é nullable no tipo gerado (toda coluna de view é), mas a view FILTRA
    // `chave is not null` — ativo sem identidade nunca entra. O guard satisfaz o tipo.
    const todas = [...new Set(chavesNaoNulas(data))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    total = todas.length
    chaves = todas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  } else {
    const { data, error, count } = await client
      .from('v_conflitos_filiais_grupos')
      .select('chave, rotulo', { count: 'exact' })
      .order('rotulo', { ascending: true })
      .order('chave', { ascending: true })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    if (error) throw new Error(`Falha ao listar conflitos: ${error.message}`)
    total = count ?? 0
    chaves = chavesNaoNulas(data)
  }

  if (chaves.length === 0) {
    return { grupos: [], total, page, pageSize: PAGE_SIZE }
  }

  const { data: lados, error: erroLados } = await client
    .from('v_conflitos_filiais')
    .select(LADO_SELECT)
    .in('chave', chaves)
    .order('chave', { ascending: true })
    .order('filial_id', { ascending: true })
  if (erroLados) throw new Error(`Falha ao ler os lados do conflito: ${erroLados.message}`)

  const porChave = new Map<string, LadoConflito[]>()
  for (const r of (lados ?? []) as RowLado[]) {
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
  opts: { filialSlug?: string | null } = {},
): Promise<{ chave: string; lado: LadoConflito }[]> {
  const client = await createClient()
  let query = client
    .from('v_conflitos_filiais')
    .select(LADO_SELECT)
    .order('chave', { ascending: true })
    .order('filial_id', { ascending: true })

  const filialSlug = opts.filialSlug?.trim() || null
  if (filialSlug) {
    // Recorte por filial: as CHAVES cujo lado está nesta filial — e depois TODOS os lados
    // dessas chaves. Filtrar direto por `filial` traria só metade de cada conflito, e um
    // conflito com um lado só não é um conflito: é uma linha sem sentido no arquivo.
    const { data, error } = await client
      .from('v_conflitos_filiais')
      .select('chave')
      .eq('filial', filialSlug)
    if (error) throw new Error(`Falha ao exportar conflitos: ${error.message}`)
    const chaves = [...new Set(chavesNaoNulas(data))]
    if (chaves.length === 0) return []
    query = query.in('chave', chaves)
  }

  const { data, error } = await query
  if (error) throw new Error(`Falha ao exportar conflitos: ${error.message}`)
  return ((data ?? []) as RowLado[]).map((r) => ({ chave: r.chave, lado: mapearLado(r) }))
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
