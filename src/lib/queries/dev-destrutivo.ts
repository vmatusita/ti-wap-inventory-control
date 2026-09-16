import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { exigirDev } from '@/lib/auth/acesso'
import type { DbClient } from '@/lib/auth/acesso'
import { rotuloDoAtivo } from '@/lib/validators/dev-destrutivo'
import type { StatusAtivo } from '@/lib/dominio'
import {
  CAP_ANOTACOES,
  CAP_ATIVOS,
  CAP_LANCAMENTOS_ITEM,
  CAP_LOTE,
  CAP_LOTE_MOVIMENTACOES,
  CAP_MOVIMENTACOES,
  CAP_PENDENCIAS_ITEM,
  CAP_TERMOS_GERADOS,
  mapComLimite,
  paginarTodos,
  LIMITE_LOTES_PARALELOS,
} from '@/lib/queries/relatorios/comum'
import { chamarRpc } from '@/lib/supabase/rpc'
import { linhaDe, linhasDe, valorDe } from '@/lib/supabase/linhas'
import {
  LEITURA_BACKUP_ANOTACOES,
  LEITURA_BACKUP_ATIVOS,
  LEITURA_BACKUP_LANCAMENTOS_ITEM,
  LEITURA_BACKUP_MOVIMENTACOES,
  LEITURA_BACKUP_PENDENCIAS_ITEM,
  LEITURA_BACKUP_TERMOS_GERADOS,
  LEITURA_CANDIDATOS_DESTRUTIVO,
  LEITURA_ITENS_DESTRUTIVO,
  LEITURA_MOVS_DESTRUTIVO,
  LEITURA_PREVIA_RESET,
  LEITURA_TERMOS_DO_ATIVO_DESTRUTIVO,
} from '@/lib/queries/formas/dev-destrutivo'

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

  // Metacaracteres do ILIKE **e** do parser do `.or()` do PostgREST, na mesma cobertura de
  // `pendencias-detalhe.ts`, `itens.ts` e `conflitos.ts` (`* % _ , ( ) \`).
  //
  // Escapar só `% _ \` não bastava: `,` `(` `)` são separador e agrupamento do `.or()`, e o
  // patrimônio é texto livre de até 60 caracteres desde a F7J — buscar por `STF003 (LOC)`
  // montava um filtro que o PostgREST não parseia (400), e a Zona destrutiva respondia
  // "Não foi possível buscar agora" para um termo perfeitamente válido. O `*` entra porque
  // o PostgREST o TRADUZ para `%` no ilike.
  const like = `%${t.replace(/[%_*,()\\]/g, ' ')}%`

  const { data, error } = await supabase
    .from('ativos')
    .select(LEITURA_CANDIDATOS_DESTRUTIVO.select)
    .or(`patrimonio.ilike.${like},service_tag.ilike.${like},hostname.ilike.${like}`)
    .order('patrimonio', { ascending: true, nullsFirst: false })
    .limit(MAX_CANDIDATOS)

  if (error) throw new Error(`Falha ao buscar ativos: ${error.message}`)
  const linhas = linhasDe(data, LEITURA_CANDIDATOS_DESTRUTIVO.forma, LEITURA_CANDIDATOS_DESTRUTIVO.rotulo)
  return linhas.map((a): CandidatoAtivo => ({ ...a, rotulo: rotuloDoAtivo(a) }))
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

  const { data: ativoBruto, error: eAtivo } = await supabase
    .from('ativos')
    .select(LEITURA_CANDIDATOS_DESTRUTIVO.select)
    .eq('id', ativoId)
    .maybeSingle()
  if (eAtivo) throw new Error(`Falha ao carregar o ativo: ${eAtivo.message}`)
  const ativo = linhaDe(ativoBruto, LEITURA_CANDIDATOS_DESTRUTIVO.forma, LEITURA_CANDIDATOS_DESTRUTIVO.rotulo)
  if (!ativo) return null

  // ⚠ ORDENAÇÃO (created_at desc, id desc) — a MESMA de `apagar_movimentacao` (0082), e não a
  // da ficha comum (`created_at, data`) nem a do as-of (0054). As três existem e NÃO são
  // equivalentes quando `created_at` e `data` discordam, o que o import de startup produz em
  // massa. Se esta tela ordenasse por outra régua, ela marcaria como "última" uma linha que a
  // RPC recusaria — um botão que sempre falha.
  const { data: movsBrutas, error: eMovs } = await supabase
    .from('movimentacoes')
    .select(LEITURA_MOVS_DESTRUTIVO.select)
    .eq('ativo_id', ativoId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MAX_MOVS_DIALOGO)
  if (eMovs) throw new Error(`Falha ao carregar as movimentações: ${eMovs.message}`)

  const [totMov, totAnot, totPend, termos] = await Promise.all([
    supabase.from('movimentacoes').select('id', { count: 'exact', head: true }).eq('ativo_id', ativoId),
    supabase.from('anotacoes').select('id', { count: 'exact', head: true }).eq('ativo_id', ativoId),
    supabase.from('pendencias_item').select('id', { count: 'exact', head: true }).eq('ativo_id', ativoId),
    supabase
      .from('termos_gerados')
      .select(LEITURA_TERMOS_DO_ATIVO_DESTRUTIVO.select)
      .contains('ativo_ids', [ativoId]),
  ])
  if (termos.error) throw new Error(`Falha ao carregar os termos: ${termos.error.message}`)

  const linhasTermo = linhasDe(
    termos.data,
    LEITURA_TERMOS_DO_ATIVO_DESTRUTIVO.forma,
    LEITURA_TERMOS_DO_ATIVO_DESTRUTIVO.rotulo,
  )
  const termoDeLoteBloqueia = linhasTermo.some((t) =>
    (t.ativo_ids ?? []).some((x) => x !== ativoId),
  )
  const movsComTermo = new Set(linhasTermo.flatMap((t) => t.movimentacao_ids ?? []))

  const lista = linhasDe(movsBrutas, LEITURA_MOVS_DESTRUTIVO.forma, LEITURA_MOVS_DESTRUTIVO.rotulo)
  const estornadas = new Set(
    lista.map((m) => m.estorno_de).filter((x): x is string => typeof x === 'string'),
  )
  // A primeira da lista já é a última pela ordenação acima — mas só quando a página cobre
  // TODAS as movimentações. Com o teto batido, a mais nova continua sendo a primeira (a
  // ordenação é decrescente), então o cálculo segue válido.
  const idUltima = lista[0]?.id ?? null

  return {
    ativo: { ...ativo, rotulo: rotuloDoAtivo(ativo) },
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
    .select(LEITURA_ITENS_DESTRUTIVO.select)
    .order('nome', { ascending: true })
  if (error) throw new Error(`Falha ao listar itens: ${error.message}`)

  const itens = linhasDe(data, LEITURA_ITENS_DESTRUTIVO.forma, LEITURA_ITENS_DESTRUTIVO.rotulo)
  if (itens.length === 0) return []

  // Contagem CONTADA NO BANCO, uma consulta por item, em LOTES — não mais toda de uma vez.
  //
  // A versão anterior trazia os `item_id` de TODOS os lançamentos e agrupava em
  // JS. Isso só parecia barato porque o corte de 1.000 do PostgREST limitava a
  // leitura sem querer — e limitando, mentia no número. Paginar consertaria a
  // mentira e trocaria por outra conta: `lancamentos_item` é HISTÓRICO de evento
  // e cresce sem teto, então a cada abertura da Zona destrutiva o servidor
  // materializaria a tabela inteira para produzir um punhado de inteiros.
  //
  // `count: 'exact', head: true` devolve só o número no header — não passa pelo
  // `max-rows`, não trafega linha nenhuma.
  //
  // 19/08/2026 (revisão) — ACHADO 7: o comentário anterior defendia o `Promise.all` dizendo
  // que "o leque é o tamanho do CATÁLOGO, que aí sim é curado e pequeno". Isso ficou falso: o
  // catálogo cresce (a curadoria é de conteúdo, não de tamanho), e cada item vira uma
  // requisição HTTP própria ao PostgREST, todas em voo ao mesmo tempo — 60 itens = 60
  // requisições simultâneas só para abrir a tela. Trocado por `mapComLimite`, que mantém a
  // MESMA semântica (resultado por índice, um erro de contagem derruba tudo com a mesma
  // mensagem) mas trava o leque em `LIMITE_LOTES_PARALELOS`.
  //
  // Isso é remendo, não conserto — e fica registrado como dívida: o conserto de fundo é uma
  // RPC `security definer` com `select item_id, count(*) from lancamentos_item group by
  // item_id` (mesmo padrão de `dev_checagens_integridade()`), numa ida só ao banco em vez de N.
  // Não entrou aqui porque exige migration nova (próxima é 0110) + `npm run db:types` +
  // aplicar em PRODUÇÃO, e essa aplicação está fora do escopo desta edição.
  const contagens = await mapComLimite(itens, LIMITE_LOTES_PARALELOS, async (i) => {
    const { count, error: eCount } = await supabase
      .from('lancamentos_item')
      .select('id', { count: 'exact', head: true })
      .eq('item_id', i.id)
    if (eCount) throw new Error(`Falha ao contar lançamentos: ${eCount.message}`)
    return count ?? 0
  })

  return itens.map((i, n): CandidatoItem => ({ ...i, lancamentos: contagens[n] }))
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
  // `p_filial = null` é o ALCANCE GLOBAL, valor de domínio — a porta aceita null aqui por
  // `ALCANCE_DO_RESET` (src/lib/supabase/rpc.ts).
  const { data, error } = await chamarRpc(supabase, 'previa_reset', {
    p_bloco: bloco,
    p_filial: filialId,
  })
  if (error) throw new Error(`Falha ao calcular a prévia do reset: ${error.message}`)
  return valorDe(data, LEITURA_PREVIA_RESET.forma, LEITURA_PREVIA_RESET.rotulo)
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

  // F58 — cada tabela lê pela `paginarTodos` compartilhada (que infere a linha do BUILDER, não
  // mais um genérico solto) e confere com a forma FROUXA de backup daquela tabela
  // (`formas/dev-destrutivo.ts`, `LEITURA_BACKUP_*`): a coluna que a forma não declara atravessa
  // pelo `catchall` de `z.looseObject` — é o que garante que o backup nunca perde coluna nova.
  //
  // F60 (PLAN §2.1, #14–#24): TODAS as leituras deste backup por KEYSET pelo `id` — a ordem de
  // antes já era a PK, então o arquivo sai byte a byte na mesma ordem. O teto é o do domínio na
  // leitura global e o de LOTE na leitura por `.in()`/`.overlaps()` de 100 ids.

  const gerado_em = new Date().toISOString()

  if (bloco === 'itens') {
    const lancamentos = linhasDe(
      await paginarTodos(
        'Falha ao exportar lançamentos',
        {
          porChave: (depoisDe, tamanho) => {
            let q = supabase
              .from('lancamentos_item')
              .select(LEITURA_BACKUP_LANCAMENTOS_ITEM.select)
              .order('id')
              .limit(tamanho)
            if (filialId !== null) q = q.eq('filial_id', filialId)
            return depoisDe === null ? q : q.gt('id', depoisDe)
          },
          chaveDe: (l) => l.id,
        },
        CAP_LANCAMENTOS_ITEM,
      ),
      LEITURA_BACKUP_LANCAMENTOS_ITEM.forma,
      LEITURA_BACKUP_LANCAMENTOS_ITEM.rotulo,
    )
  // F54 — CABEÇALHO COMPLETO (Decisão 4). Este backup não tinha `versao` nem `contagens`,
  // e os dois faltavam por motivos diferentes: sem `versao` a trava de formato não teria o
  // que congelar, e sem `contagens` a conferência de restauração não teria com o que
  // comparar o que foi reinserido. Ganharam ambos, e `versao` nasce em 1.
  //
  // ⚠ O QUE ACONTECE COM OS BACKUPS ANTIGOS: os que já estão no bucket não têm os campos e
  // não vão ganhar (não se reescreve backup). O restaurador trata `versao` ausente como 0
  // e, nesse caso, NÃO tenta a conferência de contagens — ele diz por escrito que aquele
  // arquivo é anterior ao campo. A diferença entre "não conferi" e "conferi e bateu" tem
  // de aparecer na saída, senão a ausência vira falso conforto.
    return {
      versao: 1,
      bloco,
      filial_id: filialId,
      gerado_em,
      contagens: { lancamentos_item: lancamentos.length },
      // O reset de itens apaga `lancamentos_item` e nada mais — e é exatamente isso que
      // este backup lê. Medido contra o corpo vigente de `resetar_itens` (0089).
      nao_incluido: [],
      lancamentos_item: lancamentos,
    }
  }

  // ACERVO. O recorte é pelo ATIVO (a filial em que ele está HOJE) — igual ao da RPC.
  const ativos = linhasDe(
    await paginarTodos(
      'Falha ao exportar ativos',
      {
        porChave: (depoisDe, tamanho) => {
          let q = supabase.from('ativos').select(LEITURA_BACKUP_ATIVOS.select).order('id').limit(tamanho)
          if (filialId !== null) q = q.eq('filial_id', filialId)
          return depoisDe === null ? q : q.gt('id', depoisDe)
        },
        chaveDe: (a) => a.id,
      },
      CAP_ATIVOS,
    ),
    LEITURA_BACKUP_ATIVOS.forma,
    LEITURA_BACKUP_ATIVOS.rotulo,
  )
  const ids = ativos.map((a) => a.id)

  // `.in()` monta o filtro na URL: mil uuids estouram o limite. Mesmo lote de 100 do import.
  const LOTE = 100
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += LOTE) lotes.push(ids.slice(i, i + LOTE))

  /** Os ids do recorte, para o bloco de ponteiros que atravessam a fronteira (F23). */
  const doRecorte = new Set(ids)

  // Três funções, e não uma genérica sobre o nome da tabela: o nome tem de ficar LITERAL em
  // cada `.from(…)` (exigência do catálogo de formas — F58 · Frente C), e um parâmetro `tabela`
  // montaria o nome em runtime.
  async function backupMovimentacoes(): Promise<Record<string, unknown>[]> {
    if (filialId === null) {
      return linhasDe(
        await paginarTodos(
          'Falha ao exportar movimentacoes',
          {
            porChave: (depoisDe, tamanho) => {
              const q = supabase.from('movimentacoes').select(LEITURA_BACKUP_MOVIMENTACOES.select).order('id').limit(tamanho)
              return depoisDe === null ? q : q.gt('id', depoisDe)
            },
            chaveDe: (m) => m.id,
          },
          CAP_MOVIMENTACOES,
        ),
        LEITURA_BACKUP_MOVIMENTACOES.forma,
        LEITURA_BACKUP_MOVIMENTACOES.rotulo,
      )
    }
    const acc: Record<string, unknown>[] = []
    for (const lote of lotes) {
      const rows = await paginarTodos(
        'Falha ao exportar movimentacoes',
        {
          porChave: (depoisDe, tamanho) => {
            const q = supabase
              .from('movimentacoes')
              .select(LEITURA_BACKUP_MOVIMENTACOES.select)
              .in('ativo_id', lote)
              .order('id')
              .limit(tamanho)
            return depoisDe === null ? q : q.gt('id', depoisDe)
          },
          chaveDe: (m) => m.id,
        },
        CAP_LOTE_MOVIMENTACOES,
      )
      acc.push(...linhasDe(rows, LEITURA_BACKUP_MOVIMENTACOES.forma, LEITURA_BACKUP_MOVIMENTACOES.rotulo))
    }
    return acc
  }

  async function backupAnotacoes(): Promise<Record<string, unknown>[]> {
    if (filialId === null) {
      return linhasDe(
        await paginarTodos(
          'Falha ao exportar anotacoes',
          {
            porChave: (depoisDe, tamanho) => {
              const q = supabase.from('anotacoes').select(LEITURA_BACKUP_ANOTACOES.select).order('id').limit(tamanho)
              return depoisDe === null ? q : q.gt('id', depoisDe)
            },
            chaveDe: (a) => a.id,
          },
          CAP_ANOTACOES,
        ),
        LEITURA_BACKUP_ANOTACOES.forma,
        LEITURA_BACKUP_ANOTACOES.rotulo,
      )
    }
    const acc: Record<string, unknown>[] = []
    for (const lote of lotes) {
      const rows = await paginarTodos(
        'Falha ao exportar anotacoes',
        {
          porChave: (depoisDe, tamanho) => {
            const q = supabase
              .from('anotacoes')
              .select(LEITURA_BACKUP_ANOTACOES.select)
              .in('ativo_id', lote)
              .order('id')
              .limit(tamanho)
            return depoisDe === null ? q : q.gt('id', depoisDe)
          },
          chaveDe: (a) => a.id,
        },
        CAP_LOTE,
      )
      acc.push(...linhasDe(rows, LEITURA_BACKUP_ANOTACOES.forma, LEITURA_BACKUP_ANOTACOES.rotulo))
    }
    return acc
  }

  async function backupPendenciasItem(): Promise<Record<string, unknown>[]> {
    if (filialId === null) {
      return linhasDe(
        await paginarTodos(
          'Falha ao exportar pendencias_item',
          {
            porChave: (depoisDe, tamanho) => {
              const q = supabase
                .from('pendencias_item')
                .select(LEITURA_BACKUP_PENDENCIAS_ITEM.select)
                .order('id')
                .limit(tamanho)
              return depoisDe === null ? q : q.gt('id', depoisDe)
            },
            chaveDe: (p) => p.id,
          },
          CAP_PENDENCIAS_ITEM,
        ),
        LEITURA_BACKUP_PENDENCIAS_ITEM.forma,
        LEITURA_BACKUP_PENDENCIAS_ITEM.rotulo,
      )
    }
    const acc: Record<string, unknown>[] = []
    for (const lote of lotes) {
      const rows = await paginarTodos(
        'Falha ao exportar pendencias_item',
        {
          porChave: (depoisDe, tamanho) => {
            const q = supabase
              .from('pendencias_item')
              .select(LEITURA_BACKUP_PENDENCIAS_ITEM.select)
              .in('ativo_id', lote)
              .order('id')
              .limit(tamanho)
            return depoisDe === null ? q : q.gt('id', depoisDe)
          },
          chaveDe: (p) => p.id,
        },
        CAP_LOTE,
      )
      acc.push(...linhasDe(rows, LEITURA_BACKUP_PENDENCIAS_ITEM.forma, LEITURA_BACKUP_PENDENCIAS_ITEM.rotulo))
    }
    return acc
  }

  const [movimentacoes, anotacoes, pendencias_item] = await Promise.all([
    backupMovimentacoes(),
    backupAnotacoes(),
    backupPendenciasItem(),
  ])

  // Termos: referenciam por `ativo_ids uuid[]`, sem FK — a régua é a mesma da RPC.
  //
  // ⚠ GÊMEO de `exportarAcervoFilial` (queries/import-logs.ts): mexeu num, mexa no outro.
  // Os dois liam a tabela INTEIRA e filtravam em TypeScript; a F54 passou os dois para o
  // recorte no BANCO (`&&` sobre `ativo_ids`, em lotes de 100, com o índice GIN
  // `termos_gerados_ativos_gin`). A medição, o cruzamento e a razão de a troca não ser por
  // velocidade estão escritos por extenso lá — aqui não se repete o número, só a régua.
  //
  // A ficha da F54 nomeava só o exportador do import. Este tinha a MESMA leitura sem
  // recorte, e deixar metade da classe corrigida seria a pior das três saídas: a próxima
  // pessoa a ler os dois encontraria duas réguas e teria de adivinhar qual é a boa.
  //
  // ⚠ DEDUPLICAÇÃO: termo de lote que cruze dois lotes de ids volta duas vezes, e linha
  // repetida no backup vira violação de chave primária na restauração.
  //
  // O alcance GLOBAL (`filialId is null`) continua lendo a tabela inteira — ali não há
  // recorte a aplicar: o reset global apaga TODOS os termos, e ler tudo é o recorte certo.
  let termos_gerados: Record<string, unknown>[]
  if (filialId === null) {
    termos_gerados = linhasDe(
      await paginarTodos(
        'Falha ao exportar termos',
        {
          porChave: (depoisDe, tamanho) => {
            const q = supabase.from('termos_gerados').select(LEITURA_BACKUP_TERMOS_GERADOS.select).order('id').limit(tamanho)
            return depoisDe === null ? q : q.gt('id', depoisDe)
          },
          chaveDe: (t) => t.id,
        },
        CAP_TERMOS_GERADOS,
      ),
      LEITURA_BACKUP_TERMOS_GERADOS.forma,
      LEITURA_BACKUP_TERMOS_GERADOS.rotulo,
    )
  } else {
    const porId = new Map<string, Record<string, unknown>>()
    for (const lote of lotes) {
      const rows = await paginarTodos(
        'Falha ao exportar termos',
        {
          porChave: (depoisDe, tamanho) => {
            const q = supabase
              .from('termos_gerados')
              .select(LEITURA_BACKUP_TERMOS_GERADOS.select)
              .overlaps('ativo_ids', lote)
              .order('id')
              .limit(tamanho)
            return depoisDe === null ? q : q.gt('id', depoisDe)
          },
          chaveDe: (t) => t.id,
        },
        CAP_LOTE,
      )
      const parte = linhasDe(rows, LEITURA_BACKUP_TERMOS_GERADOS.forma, LEITURA_BACKUP_TERMOS_GERADOS.rotulo)
      for (const t of parte) porId.set(String(t.id), t)
    }
    termos_gerados = [...porId.values()].sort((a, b) =>
      String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0,
    )
  }

  // ⚠ OS PONTEIROS QUE ATRAVESSAM O RECORTE — achado da revisão adversarial da F23.
  // `resetar_acervo` faz `update ativos set substitui_ativo_id = null where substitui_ativo_id
  // in (<ids do recorte>)`, e esse UPDATE alcança ativos de OUTRAS filiais: o substituto (F14/
  // F15) fica na filial dele, apontando para um ativo que vai morrer aqui. Sem esta leitura, o
  // ponteiro se perdia em silêncio E fora do backup — o backup só trazia os ativos do recorte,
  // então não haveria como saber depois quem apontava para quem.
  //
  // Guardamos a linha INTEIRA desses ativos (eles não são apagados; só perdem o ponteiro), o
  // que basta para reconstruir a ligação à mão se for preciso.
  const ponteiros_perdidos =
    ids.length === 0
      ? []
      : await (async () => {
          const acc: Record<string, unknown>[] = []
          for (const lote of lotes.length > 0 ? lotes : [[]]) {
            if (lote.length === 0) continue
            const rows = await paginarTodos(
              'Falha ao exportar ativos que apontam para o recorte',
              {
                porChave: (depoisDe, tamanho) => {
                  const q = supabase
                    .from('ativos')
                    .select(LEITURA_BACKUP_ATIVOS.select)
                    .in('substitui_ativo_id', lote)
                    .order('id')
                    .limit(tamanho)
                  return depoisDe === null ? q : q.gt('id', depoisDe)
                },
                chaveDe: (a) => a.id,
              },
              CAP_LOTE,
            )
            acc.push(...linhasDe(rows, LEITURA_BACKUP_ATIVOS.forma, LEITURA_BACKUP_ATIVOS.rotulo))
          }
          // No alcance GLOBAL todo ativo está no recorte, então quem aponta já está em `ativos`
          // — a lista sai vazia por construção, e é isso mesmo.
          return acc.filter((a) => !doRecorte.has(String(a.id)))
        })()

  // F54 — CABEÇALHO COMPLETO (Decisão 4). Este backup não tinha `versao` nem `contagens`,
  // e os dois faltavam por motivos diferentes: sem `versao` a trava de formato não teria o
  // que congelar, e sem `contagens` a conferência de restauração não teria com o que
  // comparar o que foi reinserido. Ganharam ambos, e `versao` nasce em 1.
  //
  // ⚠ O QUE ACONTECE COM OS BACKUPS ANTIGOS: os que já estão no bucket não têm os campos e
  // não vão ganhar (não se reescreve backup). O restaurador trata `versao` ausente como 0
  // e, nesse caso, NÃO tenta a conferência de contagens — ele diz por escrito que aquele
  // arquivo é anterior ao campo. A diferença entre "não conferi" e "conferi e bateu" tem
  // de aparecer na saída, senão a ausência vira falso conforto.
  return {
    versao: 1,
    bloco,
    filial_id: filialId,
    gerado_em,
    contagens: {
      ativos: ativos.length,
      movimentacoes: movimentacoes.length,
      anotacoes: anotacoes.length,
      pendencias_item: pendencias_item.length,
      termos_gerados: termos_gerados.length,
    },
    // F54 — LEVANTADO POR MEDIÇÃO, não redigido de memória: `resetar_acervo` (corpo
    // vigente da 0089) apaga `pendencias_item`, `termos_gerados`, `anotacoes`,
    // `movimentacoes` e `ativos` — e este exportador lê as cinco. A diferença é VAZIA.
    // Os `.docx` deixaram de faltar nesta fase: eles são copiados para
    // `<caminho deste JSON sem .json>/termos/` antes de serem removidos do bucket.
    nao_incluido: [],
    ativos,
    movimentacoes,
    anotacoes,
    pendencias_item,
    termos_gerados,
    ponteiros_perdidos,
  }
}
