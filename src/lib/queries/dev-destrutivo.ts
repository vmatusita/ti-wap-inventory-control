import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { exigirDev } from '@/lib/auth/acesso'
import type { DbClient } from '@/lib/auth/acesso'
import { rotuloDoAtivo } from '@/lib/validators/dev-destrutivo'
import type { StatusAtivo } from '@/lib/dominio'

// Leituras da ZONA DESTRUTIVA da /dev (F23) — todas guardadas por `exigirDev()`.
//
// Mesma doutrina de `src/lib/queries/dev.ts`: a guarda está AQUI além de no layout, porque o
// layout protege a ROTA e estas funções são chamadas por Server Components e por Server
// Actions. E, como lá, **RPC guardada por cargo vai pelo client de SESSÃO** — o service role
// não carrega identidade, `auth.uid()` é NULL, `e_dev()` devolve false e a chamada volta 42501.
//
// ⚠ O QUE ESTAS FUNÇÕES SÃO PARA: mostrar, ANTES de qualquer botão, o TAMANHO REAL do estrago
// ("este ativo tem 7 movimentações e 1 termo"). A ordem F23 §5 pede contagens lidas na hora, e
// não é enfeite: é o que transforma "apagar" numa decisão informada. Elas nunca são a
// autorização — quem decide é a RPC.

class SemPermissao extends Error {}

async function sessaoDeDev(): Promise<DbClient> {
  const supabase = await createClient()
  const aut = await exigirDev(supabase)
  if (!aut.ok) throw new SemPermissao(aut.erro)
  return supabase
}

// ---------------------------------------------------------------------------
// 1. Achar o ativo
// ---------------------------------------------------------------------------

export type CandidatoAtivo = {
  id: string
  patrimonio: string | null
  service_tag: string | null
  hostname: string | null
  categoria: string
  marca: string | null
  modelo: string | null
  status: StatusAtivo
  filial_id: number
  colaborador_atual: string | null
  /** O texto que confirma a exclusão deste ativo (patrimônio, ou tag, ou id). */
  rotulo: string
}

/** Teto da busca: a tela é de escolha, não de listagem. */
const MAX_CANDIDATOS = 25

/**
 * Busca ativos por patrimônio, service tag ou hostname.
 *
 * ⚠ DEVOLVE LISTA, e a tela TEM de tratar mais de um resultado. Não é zelo teórico: a regra da
 * casa diz que "patrimônio repete em casos raros — o par patrimônio + service tag é a chave"
 * (spec §5, CLAUDE.md). Numa ferramenta que APAGA, resolver a ambiguidade escolhendo o
 * primeiro seria apagar o ativo errado.
 */
export async function buscarAtivosDestrutivo(termo: string): Promise<CandidatoAtivo[]> {
  const supabase = await sessaoDeDev()
  const t = termo.trim()
  if (t.length < 2) return []

  // `%` e `_` do usuário viram literais — sem isto, um `%` sozinho lista o acervo inteiro.
  const like = `%${t.replace(/[%_\\]/g, (c) => `\\${c}`)}%`

  const { data, error } = await supabase
    .from('ativos')
    .select(
      'id, patrimonio, service_tag, hostname, categoria, marca, modelo, status, filial_id, colaborador_atual',
    )
    .or(`patrimonio.ilike.${like},service_tag.ilike.${like},hostname.ilike.${like}`)
    .order('patrimonio', { ascending: true, nullsFirst: false })
    .limit(MAX_CANDIDATOS)

  if (error) throw new Error(`Falha ao buscar ativos: ${error.message}`)
  return (data ?? []).map((a) => ({ ...a, rotulo: rotuloDoAtivo(a) }) as CandidatoAtivo)
}

// ---------------------------------------------------------------------------
// 2. O tamanho do estrago, por ativo
// ---------------------------------------------------------------------------

export type MovimentacaoDoAtivo = {
  id: string
  tipo: string
  data: string
  created_at: string
  observacao: string | null
  status_anterior: StatusAtivo | null
  status_resultante: StatusAtivo | null
  forcado: boolean
  /** Foi gerada por um estorno? (Existe outra movimentação apontando para esta.) */
  estornada: boolean
  /** É a ÚLTIMA pela ordenação (created_at, id) — a única apagável. */
  ultima: boolean
  /** Existe termo citando esta movimentação? Se sim, a RPC recusa apagá-la. */
  temTermo: boolean
}

export type FichaDestrutiva = {
  ativo: CandidatoAtivo
  movimentacoes: MovimentacaoDoAtivo[]
  totais: {
    movimentacoes: number
    anotacoes: number
    pendenciasItem: number
    termos: number
  }
  /** Termo de LOTE que cobre este ativo E outros — a RPC recusa apagar o ativo. */
  termoDeLoteBloqueia: boolean
}

/** Teto da linha do tempo exibida no diálogo. */
const MAX_MOVS_DIALOGO = 50

export async function carregarFichaDestrutiva(
  ativoId: string,
): Promise<FichaDestrutiva | null> {
  const supabase = await sessaoDeDev()

  const { data: ativo, error: eAtivo } = await supabase
    .from('ativos')
    .select(
      'id, patrimonio, service_tag, hostname, categoria, marca, modelo, status, filial_id, colaborador_atual',
    )
    .eq('id', ativoId)
    .maybeSingle()
  if (eAtivo) throw new Error(`Falha ao carregar o ativo: ${eAtivo.message}`)
  if (!ativo) return null

  // ⚠ ORDENAÇÃO (created_at desc, id desc) — a MESMA de `apagar_movimentacao` (0082), e não a
  // da ficha comum (`created_at, data`) nem a do as-of (0054). As três existem e NÃO são
  // equivalentes quando `created_at` e `data` discordam, o que o import de startup produz em
  // massa. Se esta tela ordenasse por outra régua, ela marcaria como "última" uma linha que a
  // RPC recusaria — um botão que sempre falha.
  const { data: movs, error: eMovs } = await supabase
    .from('movimentacoes')
    .select('id, tipo, data, created_at, observacao, status_anterior, status_resultante, forcado, estorno_de')
    .eq('ativo_id', ativoId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MAX_MOVS_DIALOGO)
  if (eMovs) throw new Error(`Falha ao carregar as movimentações: ${eMovs.message}`)

  const [totMov, totAnot, totPend, termos] = await Promise.all([
    supabase.from('movimentacoes').select('id', { count: 'exact', head: true }).eq('ativo_id', ativoId),
    supabase.from('anotacoes').select('id', { count: 'exact', head: true }).eq('ativo_id', ativoId),
    supabase.from('pendencias_item').select('id', { count: 'exact', head: true }).eq('ativo_id', ativoId),
    supabase.from('termos_gerados').select('id, ativo_ids, movimentacao_ids').contains('ativo_ids', [ativoId]),
  ])
  if (termos.error) throw new Error(`Falha ao carregar os termos: ${termos.error.message}`)

  const linhasTermo = termos.data ?? []
  const termoDeLoteBloqueia = linhasTermo.some((t) =>
    (t.ativo_ids ?? []).some((x: string) => x !== ativoId),
  )
  const movsComTermo = new Set(linhasTermo.flatMap((t) => t.movimentacao_ids ?? []))

  const lista = movs ?? []
  const estornadas = new Set(
    lista.map((m) => m.estorno_de).filter((x): x is string => typeof x === 'string'),
  )
  // A primeira da lista já é a última pela ordenação acima — mas só quando a página cobre
  // TODAS as movimentações. Com o teto batido, a mais nova continua sendo a primeira (a
  // ordenação é decrescente), então o cálculo segue válido.
  const idUltima = lista[0]?.id ?? null

  return {
    ativo: { ...ativo, rotulo: rotuloDoAtivo(ativo) } as CandidatoAtivo,
    movimentacoes: lista.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      data: m.data,
      created_at: m.created_at,
      observacao: m.observacao,
      status_anterior: m.status_anterior,
      status_resultante: m.status_resultante,
      forcado: m.forcado,
      estornada: estornadas.has(m.id),
      ultima: m.id === idUltima,
      temTermo: movsComTermo.has(m.id),
    })),
    totais: {
      movimentacoes: totMov.count ?? 0,
      anotacoes: totAnot.count ?? 0,
      pendenciasItem: totPend.count ?? 0,
      termos: linhasTermo.length,
    },
    termoDeLoteBloqueia,
  }
}

/**
 * O identificador que confirma o apagamento de UMA movimentação: o rótulo do ativo dela.
 *
 * ⚠ Existe para a action poder conferir a confirmação digitada ANTES de chamar a RPC — o §1.3
 * da ordem exige a validação nas DUAS camadas. A RPC continua sendo a trava (ela compara com o
 * que lê na própria transação); esta leitura é o que permite dar a mensagem em pt-BR certa em
 * vez de deixar o SQLSTATE subir.
 */
export async function alvoDaMovimentacao(
  movimentacaoId: string,
): Promise<{ ativoId: string; rotulo: string } | null> {
  const supabase = await sessaoDeDev()

  // ⚠ DUAS consultas simples em vez de um embed `ativos!inner(...)`, de propósito. O embed do
  // PostgREST devolve OBJETO ou ARRAY conforme ele infere a cardinalidade, e aqui o preço de
  // errar essa inferência seria silencioso e grave: o rótulo cairia para o `id` do ativo, a
  // confirmação digitada NUNCA bateria, e a ferramenta recusaria tudo sem explicar por quê.
  // Duas leituras de chave primária custam nada e não dependem de inferência nenhuma.
  const { data: mov, error: eMov } = await supabase
    .from('movimentacoes')
    .select('ativo_id')
    .eq('id', movimentacaoId)
    .maybeSingle()
  if (eMov) throw new Error(`Falha ao carregar a movimentação: ${eMov.message}`)
  if (!mov) return null

  const { data: ativo, error: eAtivo } = await supabase
    .from('ativos')
    .select('id, patrimonio, service_tag')
    .eq('id', mov.ativo_id)
    .maybeSingle()
  if (eAtivo) throw new Error(`Falha ao carregar o ativo: ${eAtivo.message}`)
  if (!ativo) return null

  return { ativoId: ativo.id, rotulo: rotuloDoAtivo(ativo) }
}

/** O nome do item — a confirmação digitada do `apagar_item`. Mesma razão de `alvoDaMovimentacao`. */
export async function nomeDoItem(itemId: number): Promise<string | null> {
  const supabase = await sessaoDeDev()
  const { data, error } = await supabase
    .from('itens')
    .select('nome')
    .eq('id', itemId)
    .maybeSingle()
  if (error) throw new Error(`Falha ao carregar o item: ${error.message}`)
  return data?.nome ?? null
}

// ---------------------------------------------------------------------------
// 3. Itens do catálogo
// ---------------------------------------------------------------------------

export type CandidatoItem = {
  id: number
  nome: string
  grupo: string
  ativo: boolean
  lancamentos: number
}

export async function listarItensDestrutivo(): Promise<CandidatoItem[]> {
  const supabase = await sessaoDeDev()

  const { data, error } = await supabase
    .from('itens')
    .select('id, nome, grupo, ativo')
    .order('nome', { ascending: true })
  if (error) throw new Error(`Falha ao listar itens: ${error.message}`)

  const itens = data ?? []
  if (itens.length === 0) return []

  // Contagem por item numa consulta só: traz os `item_id` dos lançamentos e agrupa aqui. O
  // catálogo é curado e pequeno (unidades), então isto não é o gargalo de ninguém.
  const { data: lanc, error: eLanc } = await supabase.from('lancamentos_item').select('item_id')
  if (eLanc) throw new Error(`Falha ao contar lançamentos: ${eLanc.message}`)

  const porItem = new Map<number, number>()
  for (const l of lanc ?? []) porItem.set(l.item_id, (porItem.get(l.item_id) ?? 0) + 1)

  return itens.map((i) => ({ ...i, lancamentos: porItem.get(i.id) ?? 0 }) as CandidatoItem)
}

// ---------------------------------------------------------------------------
// 4. Prévia do reset
// ---------------------------------------------------------------------------

export type PreviaReset = {
  bloco: 'acervo' | 'itens'
  filial_id: number | null
  /** O texto que confirma este reset (nome da filial, ou RESETAR TUDO). */
  rotulo: string
  termo_misto_bloqueia: boolean
  /** No formato EXATO que a RPC de reset exige em `p_contagens` — não remonte. */
  contagens: Record<string, number>
}

/**
 * Conta o recorte de um reset.
 *
 * ⚠ Vai pela RPC `previa_reset` (0086) e NÃO por consultas daqui, de propósito: as RPCs de
 * reset recusam (40001) contagens que não batam com as delas no instante do apply. Contar por
 * outro caminho — ainda que "equivalente" — tornaria o reset inaplicável, e a mensagem de erro
 * apontaria para a causa errada ("o estado mudou"). O objeto `contagens` é devolvido à RPC sem
 * ser remontado.
 */
export async function previaDoReset(
  bloco: 'acervo' | 'itens',
  filialId: number | null,
): Promise<PreviaReset> {
  const supabase = await sessaoDeDev()
  // ⚠ O cast existe porque `supabase gen types` declara TODO parâmetro de RPC como
  // não-anulável, mesmo quando o SQL aceita NULL — e aqui `p_filial = null` é um valor de
  // domínio, não um descuido: é o ALCANCE GLOBAL. A função em SQL trata `p_filial is null` em
  // cada contagem (migration 0086).
  const { data, error } = await supabase.rpc('previa_reset', {
    p_bloco: bloco,
    p_filial: filialId as unknown as number,
  })
  if (error) throw new Error(`Falha ao calcular a prévia do reset: ${error.message}`)
  return data as unknown as PreviaReset
}

// ---------------------------------------------------------------------------
// 5. O BACKUP do reset — sem ele a RPC recusa
// ---------------------------------------------------------------------------

/**
 * Lê TODAS as linhas que um reset vai apagar, para serem gravadas no bucket antes do apply.
 *
 * ⚠ TODA leitura é PAGINADA. O corte default de 1.000 linhas do PostgREST deixaria o backup
 * INCOMPLETO justamente nos recortes grandes (a Matriz sozinha passa de 1.200 ativos) — e um
 * backup que não bate com o que será apagado é pior do que não ter backup, porque dá confiança
 * falsa. É a mesma razão (e o mesmo idioma) do backup do import.
 *
 * ⚠ Inclui `pendencias_item`, que `exportarAcervoFilial` NÃO traz: aquele exportador nasceu
 * antes da F18 e nunca aprendeu a tabela — a mesma lacuna que deixou a RPC do import sem
 * apagá-la. Aqui as duas pontas (o que se apaga e o que se salva) são a mesma lista.
 */
export async function montarBackupDoReset(
  bloco: 'acervo' | 'itens',
  filialId: number | null,
): Promise<Record<string, unknown>> {
  const supabase = await sessaoDeDev()

  const PAGINA = 1000

  // Paginador deliberadamente SEM genérico: as consultas abaixo são de tabelas diferentes, e
  // um `T` inferido do builder do supabase-js não unifica entre elas. O backup é um dump —
  // aqui o tipo certo é mesmo `Record<string, unknown>`, e a tipagem forte vive nas queries
  // que a tela consome, não neste JSON.
  type Pagina = { data: Record<string, unknown>[] | null; error: { message: string } | null }
  async function todas(
    rotulo: string,
    consulta: (from: number, to: number) => PromiseLike<Pagina>,
  ): Promise<Record<string, unknown>[]> {
    const acc: Record<string, unknown>[] = []
    for (let from = 0; ; from += PAGINA) {
      const { data, error } = await consulta(from, from + PAGINA - 1)
      if (error) throw new Error(`${rotulo}: ${error.message}`)
      const lote = data ?? []
      acc.push(...lote)
      if (lote.length < PAGINA) return acc
    }
  }

  const gerado_em = new Date().toISOString()

  if (bloco === 'itens') {
    const lancamentos = await todas('Falha ao exportar lançamentos', (from, to) => {
      const q = supabase.from('lancamentos_item').select('*').order('id').range(from, to)
      return (filialId !== null ? q.eq('filial_id', filialId) : q) as unknown as PromiseLike<Pagina>
    })
    return { bloco, filial_id: filialId, gerado_em, lancamentos_item: lancamentos }
  }

  // ACERVO. O recorte é pelo ATIVO (a filial em que ele está HOJE) — igual ao da RPC.
  const ativos = await todas('Falha ao exportar ativos', (from, to) => {
    const q = supabase.from('ativos').select('*').order('id').range(from, to)
    return (filialId !== null ? q.eq('filial_id', filialId) : q) as unknown as PromiseLike<Pagina>
  })
  const ids = ativos.map((a) => String(a.id))

  // `.in()` monta o filtro na URL: mil uuids estouram o limite. Mesmo lote de 100 do import.
  const LOTE = 100
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += LOTE) lotes.push(ids.slice(i, i + LOTE))

  async function porAtivo(
    tabela: 'movimentacoes' | 'anotacoes' | 'pendencias_item',
  ): Promise<Record<string, unknown>[]> {
    if (filialId === null) {
      return todas(
        `Falha ao exportar ${tabela}`,
        (from, to) =>
          supabase.from(tabela).select('*').order('id').range(from, to) as unknown as PromiseLike<Pagina>,
      )
    }
    const acc: Record<string, unknown>[] = []
    for (const lote of lotes) {
      const parte = await todas(
        `Falha ao exportar ${tabela}`,
        (from, to) =>
          supabase
            .from(tabela)
            .select('*')
            .in('ativo_id', lote)
            .order('id')
            .range(from, to) as unknown as PromiseLike<Pagina>,
      )
      acc.push(...parte)
    }
    return acc
  }

  const [movimentacoes, anotacoes, pendencias_item] = await Promise.all([
    porAtivo('movimentacoes'),
    porAtivo('anotacoes'),
    porAtivo('pendencias_item'),
  ])

  // Termos: referenciam por `ativo_ids uuid[]`, sem FK — a régua é a mesma da RPC.
  const todosTermos = await todas(
    'Falha ao exportar termos',
    (from, to) =>
      supabase.from('termos_gerados').select('*').order('id').range(from, to) as unknown as PromiseLike<Pagina>,
  )
  const doRecorte = new Set(ids)
  const termos_gerados =
    filialId === null
      ? todosTermos
      : todosTermos.filter((t) =>
          ((t.ativo_ids as string[] | null) ?? []).some((x) => doRecorte.has(x)),
        )

  return {
    bloco,
    filial_id: filialId,
    gerado_em,
    ativos,
    movimentacoes,
    anotacoes,
    pendencias_item,
    termos_gerados,
  }
}
