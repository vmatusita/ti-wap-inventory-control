import { createClient } from '@/lib/supabase/server'
import { chaveColaborador, chavesDistintas } from '@/lib/colaboradores/chave'

// Leituras do cadastro de pessoas (F37 · D5). Rota só do operador — usam o client do
// servidor com a sessão dele (RLS `authenticated`), como o resto de src/lib/queries.

export type Colaborador = {
  id: string
  nome: string
  matricula: string | null
  setor: string | null
  filial_id: number | null
  ativo: boolean
  nome_chave: string
}

export type ColaboradorAdmin = Colaborador & {
  created_at: string
  movimentacoes: number
  lancamentos: number
}

/** Uma linha da fila de consolidação — já agregada pelo banco (view da 0112). */
export type TextoDeColaborador = {
  nome_chave: string
  grafia_exemplo: string
  ocorrencias: number
  grafias: number
  filial_id: number | null
  ja_cadastrado: boolean
  colaborador_id: string | null
}

export type ResumoConsolidacao = {
  /** Grupos de nome distintos ainda sem cadastro. */
  gruposPendentes: number
  /** Registros (movimentações + lançamentos) por trás desses grupos. */
  registrosPendentes: number
  /** Grupos que já têm cadastro correspondente. */
  gruposCadastrados: number
  /** Registros cobertos por um cadastro. */
  registrosCadastrados: number
  /** A fila foi cortada pelo teto? Então os números acima são de um recorte. */
  truncado: boolean
}

// O teto existe porque a fila é uma LISTA, e lista sem teto é a armadilha das 1.000
// linhas (v1.40.2). Mas os NÚMEROS do resumo nunca saem de linhas contadas aqui —
// saem de agregação no banco (`resumoDaConsolidacao`), justamente para o resumo
// continuar verdadeiro quando a lista estiver cortada.
const TETO_FILA = 500

/** Catálogo ativo, para o combobox do fluxo (nome + chave, o mínimo). */
export async function listarColaboradoresAtivos(): Promise<Colaborador[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('colaboradores')
    .select('id, nome, matricula, setor, filial_id, ativo, nome_chave')
    .eq('ativo', true)
    .order('nome', { ascending: true })
    .limit(2000)
  if (error) throw new Error(`Falha ao listar colaboradores: ${error.message}`)
  return (data ?? []) as Colaborador[]
}

/** Cadastro completo + quantos registros cada pessoa já tem vinculados. */
export async function listarColaboradoresAdmin(): Promise<ColaboradorAdmin[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('colaboradores')
    .select(
      'id, nome, matricula, setor, filial_id, ativo, nome_chave, created_at, movimentacoes(count), lancamentos_item(count)',
    )
    .order('nome', { ascending: true })
    .limit(2000)
  if (error) throw new Error(`Falha ao listar colaboradores: ${error.message}`)
  type Row = Colaborador & {
    created_at: string
    movimentacoes: { count: number }[]
    lancamentos_item: { count: number }[]
  }
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    nome: r.nome,
    matricula: r.matricula,
    setor: r.setor,
    filial_id: r.filial_id,
    ativo: r.ativo,
    nome_chave: r.nome_chave,
    created_at: r.created_at,
    movimentacoes: r.movimentacoes?.[0]?.count ?? 0,
    lancamentos: r.lancamentos_item?.[0]?.count ?? 0,
  }))
}

/**
 * A fila de consolidação: os nomes digitados à mão que ainda não têm cadastro,
 * agrupados pela chave normalizada, do mais frequente para o menos.
 *
 * O agrupamento e a contagem vêm PRONTOS da view `v_colaboradores_textos` (0112) —
 * nunca de linhas lidas aqui. É a lição do teto de 1.000
 * (docs/RELATORIO-CORRECAO-TRUNCAMENTO-1000.md): contar no cliente é contar o que
 * coube na página, não o que existe.
 */
export async function filaDeConsolidacao(): Promise<TextoDeColaborador[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_colaboradores_textos')
    .select('nome_chave, grafia_exemplo, ocorrencias, grafias, filial_id, ja_cadastrado, colaborador_id')
    .eq('ja_cadastrado', false)
    .order('ocorrencias', { ascending: false })
    .order('grafia_exemplo', { ascending: true })
    .limit(TETO_FILA)
  if (error) throw new Error(`Falha ao ler a fila de consolidação: ${error.message}`)
  type Row = {
    nome_chave: string | null
    grafia_exemplo: string | null
    ocorrencias: number | null
    grafias: number | null
    filial_id: number | null
    ja_cadastrado: boolean | null
    colaborador_id: string | null
  }
  return ((data ?? []) as Row[])
    .filter((r): r is Row & { nome_chave: string } => Boolean(r.nome_chave))
    .map((r) => ({
      nome_chave: r.nome_chave,
      grafia_exemplo: r.grafia_exemplo ?? r.nome_chave,
      ocorrencias: r.ocorrencias ?? 0,
      grafias: r.grafias ?? 1,
      filial_id: r.filial_id,
      ja_cadastrado: false,
      colaborador_id: null,
    }))
}

/**
 * Os números que a tela diz na cara. Contados NO BANCO: `count` com `head: true` não
 * traz linha nenhuma, só o total — então nem o teto de 1.000 nem o teto da fila
 * acima influem no que é exibido. E o resumo diz se a LISTA foi cortada, para o
 * operador nunca confundir "é isso que existe" com "é isso que coube".
 */
export async function resumoDaConsolidacao(): Promise<ResumoConsolidacao> {
  const supabase = await createClient()

  const contar = async (cadastrado: boolean) => {
    const { count, error } = await supabase
      .from('v_colaboradores_textos')
      .select('nome_chave', { count: 'exact', head: true })
      .eq('ja_cadastrado', cadastrado)
    if (error) throw new Error(`Falha ao contar a consolidação: ${error.message}`)
    return count ?? 0
  }

  const somarOcorrencias = async (cadastrado: boolean) => {
    // Soma por páginas: `ocorrencias` é um número por grupo e o PostgREST não soma.
    // A leitura é EXPLICITAMENTE paginada até o fim — nunca uma página só, que é o
    // defeito que o teto de 1.000 documentou.
    const PAGINA = 1000
    let total = 0
    for (let de = 0; ; de += PAGINA) {
      const { data, error } = await supabase
        .from('v_colaboradores_textos')
        .select('ocorrencias')
        .eq('ja_cadastrado', cadastrado)
        .range(de, de + PAGINA - 1)
      if (error) throw new Error(`Falha ao somar a consolidação: ${error.message}`)
      const linhas = (data ?? []) as { ocorrencias: number | null }[]
      for (const l of linhas) total += l.ocorrencias ?? 0
      if (linhas.length < PAGINA) return total
    }
  }

  const [gruposPendentes, gruposCadastrados, registrosPendentes, registrosCadastrados] =
    await Promise.all([
      contar(false),
      contar(true),
      somarOcorrencias(false),
      somarOcorrencias(true),
    ])

  return {
    gruposPendentes,
    registrosPendentes,
    gruposCadastrados,
    registrosCadastrados,
    truncado: gruposPendentes > TETO_FILA,
  }
}

/**
 * Resolve nomes em ids de cadastro, numa consulta só, pela chave normalizada.
 *
 * É o coração do híbrido (F37 §A.3): o registro NOVO grava `colaborador_id` **e** o
 * texto, e o id é descoberto AQUI, no servidor, a partir do que o operador deixou no
 * campo. Quem escolheu da lista resolve; quem digitou "joão  silva" para o cadastro
 * "João Silva" também resolve (a chave é a mesma); quem digitou um nome que não
 * existe não resolve — e a movimentação é gravada do mesmo jeito, com id nulo.
 *
 * Nunca lança: se a consulta falhar, devolve um mapa vazio. O vínculo é um bônus, e
 * derrubar a movimentação do operador por causa dele seria trocar o essencial pelo
 * acessório.
 */
export async function resolverColaboradoresPorNome(
  supabase: Awaited<ReturnType<typeof createClient>>,
  nomes: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const chaves = chavesDistintas(nomes)
  if (chaves.length === 0) return mapa
  const { data, error } = await supabase
    .from('colaboradores')
    .select('id, nome_chave')
    .in('nome_chave', chaves)
  if (error) {
    console.error('[resolverColaboradoresPorNome] falha ao resolver', error.message)
    return mapa
  }
  for (const r of (data ?? []) as { id: string; nome_chave: string | null }[]) {
    if (r.nome_chave) mapa.set(r.nome_chave, r.id)
  }
  return mapa
}

// ---------------------------------------------------------------------------
// O campo de colaborador do fluxo (F37 · A.4)
// ---------------------------------------------------------------------------

/** O que o campo precisa saber a cada tecla, numa ida só ao servidor. */
export type SugestoesColaborador = {
  /** Nomes do CADASTRO que casam com o prefixo — a lista que a fase criou. */
  cadastrados: string[]
  /** Grafias do HISTÓRICO que casam e ainda NÃO têm cadastro correspondente. */
  historico: string[]
  /** O que está digitado AGORA já é um cadastro? Decide se oferecemos "Cadastrar". */
  jaCadastrado: boolean
}

const MIN_PREFIXO = 2
const TETO_SUGESTOES = 8

/** Neutraliza os curingas do ILIKE do PostgREST — espelho de `prefixoSeguro`
 *  em queries/movimentacoes.ts. Sem isso, digitar "%" listaria o cadastro inteiro. */
function prefixoSeguro(prefixo: string): string {
  return prefixo.trim().replace(/[%_*(),\\]/g, '')
}

/**
 * Alimenta o campo de colaborador do wizard e do lançamento de item.
 *
 * O CADASTRO vem primeiro e o histórico depois, mas os dois vêm — porque o campo
 * continua sendo texto livre e a maior parte dos nomes ainda só existe no histórico
 * enquanto a consolidação não acontece. Esconder o histórico transformaria o campo
 * numa lista fechada, que é exatamente o que a ordem manda NÃO fazer.
 */
export async function sugestoesDoCampoColaborador(
  prefixo: string,
): Promise<SugestoesColaborador> {
  const vazio: SugestoesColaborador = { cadastrados: [], historico: [], jaCadastrado: false }
  const termo = prefixoSeguro(prefixo)
  if (termo.length < MIN_PREFIXO) return vazio

  const supabase = await createClient()
  const chave = chaveColaborador(prefixo)

  const [doCadastro, doHistorico, exato] = await Promise.all([
    supabase
      .from('colaboradores')
      .select('nome')
      .eq('ativo', true)
      .ilike('nome', `${termo}%`)
      .order('nome')
      .limit(TETO_SUGESTOES),
    supabase
      .from('movimentacoes')
      .select('colaborador')
      .not('colaborador', 'is', null)
      .ilike('colaborador', `${termo}%`)
      .limit(50),
    supabase.from('colaboradores').select('id').eq('nome_chave', chave).maybeSingle(),
  ])

  if (doCadastro.error) {
    throw new Error(`Falha ao carregar sugestões: ${doCadastro.error.message}`)
  }

  const cadastrados = ((doCadastro.data ?? []) as { nome: string }[]).map((r) => r.nome)
  const chavesCadastradas = new Set(cadastrados.map((n) => chaveColaborador(n)))

  // Dedup pela MESMA chave do banco — assim "João Silva" e "joão  silva" não
  // aparecem como duas opções, e nenhuma grafia já cadastrada se repete na lista.
  const porChave = new Map<string, string>()
  for (const linha of (doHistorico.data ?? []) as { colaborador: string | null }[]) {
    const valor = linha.colaborador?.trim()
    if (!valor) continue
    const k = chaveColaborador(valor)
    if (!k || chavesCadastradas.has(k) || porChave.has(k)) continue
    porChave.set(k, valor)
  }

  return {
    cadastrados,
    historico: [...porChave.values()]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .slice(0, TETO_SUGESTOES),
    jaCadastrado: Boolean(exato.data?.id),
  }
}
