import type { GrupoItem, TipoLancamento } from '@/lib/dominio'
import { OBS_SALDO_INICIAL } from '@/lib/dominio'
import type { Periodo } from '@/lib/relatorios/periodo'
import type {
  GrupoRelatorio,
  LinhaLancamentoItem,
  SaldoItemPeriodo,
} from '@/lib/relatorios/tipos'
import { marcaEstorno } from '@/lib/relatorios/estorno'
import { paginarTodos, type DbClient } from './comum'
import { filialParaRpc } from '@/lib/queries/rpc-filial'

// Itens por quantidade nos grupos 2–3 do relatório v2 (acessórios/componentes —
// OS-F3 3.6): saldo as-of + movimentação no período + carimbo de frescor + a
// última observação de cada item. Esconde itens sem nenhum sinal no filtro.

// Grupos 2–3: saldo as-of + movimentação no período + frescor + última obs.
export async function getGruposItens(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
): Promise<GrupoRelatorio[]> {
  const [saldos, movs, frescor, obsRows] = await Promise.all([
    client.rpc('rel_saldo_itens', { p_filial: filialParaRpc(filialId), p_ate: periodo.ate }),
    client.rpc('rel_mov_itens', { p_filial: filialParaRpc(filialId), p_de: periodo.de, p_ate: periodo.ate }),
    client.rpc('rel_frescor_itens', { p_filial: filialParaRpc(filialId), p_ate: periodo.ate }),
    (() => {
      let q = client
        .from('lancamentos_item')
        .select('item_id, observacao, data, created_at')
        .not('observacao', 'is', null)
        // F23: a correção de saldo do dev tem `observacao` NÃO-NULA por construção (é ali que
        // mora a justificativa obrigatória), então esta leitura — que existe justamente para
        // exibir observações no relatório — publicaria o texto que o desenvolvedor escreveu
        // para si mesmo. Segundo dos dois pontos do lado dos ITENS que a revisão adversarial
        // encontrou depois que a varredura da fase parou em `movimentacoes`.
        .eq('forcado', false)
        .gte('data', periodo.de)
        .lte('data', periodo.ate)
      if (filialId) q = q.eq('filial_id', filialId)
      return q.order('created_at', { ascending: false }).limit(1000)
    })(),
  ])
  if (saldos.error) throw new Error(`Falha nos saldos de itens: ${saldos.error.message}`)
  if (movs.error) throw new Error(`Falha na movimentação de itens: ${movs.error.message}`)
  // As outras duas leituras também LANÇAM: um `data` nulo silencioso faria o
  // relatório afirmar "nenhum lançamento no grupo" (frescor) e apagar a última
  // observação de cada item — e a geração de snapshot congelaria a afirmação.
  if (frescor.error)
    throw new Error(`Falha no frescor dos itens: ${frescor.error.message}`)
  if (obsRows.error)
    throw new Error(`Falha nas observações dos itens: ${obsRows.error.message}`)

  const movPorItem = new Map<number, { entradas: number; saidas: number }>()
  for (const m of movs.data ?? []) {
    movPorItem.set(m.item_id, { entradas: Number(m.entradas), saidas: Number(m.saidas) })
  }
  const obsPorItem = new Map<number, string>()
  for (const o of obsRows.data ?? []) {
    if (o.observacao && !obsPorItem.has(o.item_id)) obsPorItem.set(o.item_id, o.observacao)
  }
  const frescorPorGrupo = new Map<GrupoItem, string | null>()
  for (const f of frescor.data ?? []) frescorPorGrupo.set(f.grupo, f.ultima)

  const porGrupo = new Map<GrupoItem, SaldoItemPeriodo[]>()
  for (const s of saldos.data ?? []) {
    const mov = movPorItem.get(s.item_id) ?? { entradas: 0, saidas: 0 }
    const total = Number(s.total)
    const estoque = Number(s.estoque)
    const atrelados = Number(s.atrelados)
    const falta = Number(s.falta)
    // Esconde itens sem nenhum sinal no filtro (total/estoque/atrelados/mov/falta zerados).
    if (
      total === 0 && estoque === 0 && atrelados === 0 && falta === 0 &&
      mov.entradas === 0 && mov.saidas === 0
    ) {
      continue
    }
    const linha: SaldoItemPeriodo = {
      item: s.item,
      total,
      estoque,
      atrelados,
      falta,
      entradas: mov.entradas,
      saidas: mov.saidas,
      delta: mov.entradas - mov.saidas,
      obs: obsPorItem.get(s.item_id) ?? null,
    }
    const lista = porGrupo.get(s.grupo) ?? []
    lista.push(linha)
    porGrupo.set(s.grupo, lista)
  }

  const grupos: GrupoRelatorio[] = []
  for (const grupo of ['acessorio', 'componente'] as GrupoItem[]) {
    const itens = porGrupo.get(grupo) ?? []
    grupos.push({
      grupo,
      itens,
      ultimoLancamento: frescorPorGrupo.get(grupo) ?? null,
      temAtrelados: itens.some((i) => i.atrelados > 0),
    })
  }
  return grupos
}

// ===========================================================================
// B5 (F6B) — tabela de movimentações de ITENS por quantidade no período (seção
// própria). Ao contrário de rel_mov_itens (agregado Σ por item), esta é lançamento
// a lançamento: PostgREST direto em lancamentos_item com os embeds de item e
// filial, filtrada pela janela. Recebe o client resolvido (serve operador E
// viewer por senha, como as demais leituras de relatório). Traz o período
// COMPLETO, paginado como as tabelas irmãs (Saídas/Entradas/Transferências) — sem
// teto próprio, para não truncar em silêncio nem exibir contador enganoso; congela
// junto no snapshot (o relatório é semanal — dezenas de linhas; o teto de 100k do
// paginarTodos é só cinto de segurança contra loop, nunca alcançado).
// ===========================================================================

const MOV_ITENS_SELECT =
  'id, data, tipo, quantidade, chamado, colaborador, observacao, estorna_id, ' +
  'item:itens!lancamentos_item_item_id_fkey(nome, grupo), ' +
  'filial:filiais!lancamentos_item_filial_id_fkey(nome)'

type RawMovItemRow = {
  id: string
  data: string
  tipo: TipoLancamento
  quantidade: number
  chamado: string | null
  colaborador: string | null
  observacao: string | null
  estorna_id: string | null
  item: { nome: string; grupo: GrupoItem } | null
  filial: { nome: string } | null
}

// A carga de saldos iniciais (F6C) marca os lançamentos de abertura com esta obs
// EXATA — não são movimentação do período. Predicado puro (testado): usado como
// backstop em JS do filtro do banco (defesa em profundidade). NULL não é marcador
// → aparece; o gotcha do `.neq` + NULL é resolvido no `.or` null-safe da query.
export function ehSaldoInicialGoLive(obs: string | null): boolean {
  return obs === OBS_SALDO_INICIAL
}

// Mapeia a linha crua (embeds do PostgREST) para o tipo do relatório. Puro.
export function mapLancamentoItemRow(r: RawMovItemRow): LinhaLancamentoItem {
  return {
    id: r.id,
    data: r.data,
    filial: r.filial?.nome ?? '—',
    item: r.item?.nome ?? '—',
    grupo: r.item?.grupo ?? 'acessorio',
    tipo: r.tipo,
    quantidade: Number(r.quantidade),
    chamado: r.chamado,
    colaborador: r.colaborador,
    obs: r.observacao,
    ehEstorno: r.estorna_id != null,
  }
}

// F16/T1 — quais lançamentos do período FORAM estornados, e quando. Simetria com
// `ehEstorno` (que marca o lançamento inverso): aqui um lançamento normal é
// "estornado" quando existe OUTRO com `estorna_id` apontando para ele (índice único
// `lanc_item_estorna_uidx` garante no máximo um). Map `estorna_id → data`, as-of
// `ate` (um estorno posterior ao fim do período não retroage ao snapshot congelado).
async function buscarLancEstornadosAteData(
  client: DbClient,
  ate: string,
): Promise<Map<string, string>> {
  const rows = await paginarTodos<{ estorna_id: string | null; data: string }>(
    'Falha ao ler estornos de itens',
    (from, to) =>
      client
        .from('lancamentos_item')
        .select('estorna_id, data')
        .not('estorna_id', 'is', null)
        .lte('data', ate)
        .order('id', { ascending: true })
        .range(from, to),
  )
  const map = new Map<string, string>()
  for (const r of rows) if (r.estorna_id && !map.has(r.estorna_id)) map.set(r.estorna_id, r.data)
  return map
}

export async function getLancamentosItensPeriodo(
  client: DbClient,
  filialId: number | null,
  periodo: Periodo,
): Promise<LinhaLancamentoItem[]> {
  // Período COMPLETO, paginado como buscarLinhasPeriodo (Saídas/Entradas/Transf.):
  // sem teto próprio que truncaria em silêncio e enganaria o contador da seção.
  const [rows, estornados] = await Promise.all([
    paginarTodos<RawMovItemRow>(
      'Falha ao listar movimentações de itens',
      (from, to) => {
        let q = client
          .from('lancamentos_item')
          .select(MOV_ITENS_SELECT)
          .gte('data', periodo.de)
          .lte('data', periodo.ate)
          // F6C: exclui os lançamentos de saldo inicial da carga (não são do período).
          // `.neq` sozinho descartaria observacao IS NULL (PostgREST) — o `.or` null-safe
          // preserva as linhas sem observação. Mesmo padrão do filtro da carga em A1.
          .or(`observacao.is.null,observacao.neq."${OBS_SALDO_INICIAL}"`)
          // F23: a CORREÇÃO DE SALDO do desenvolvedor (ferramenta "Forçar saldo" da /dev) não
          // é lançamento do período.
          //
          // ⚠ Achado da revisão adversarial da F23, e vale registrar o erro: a varredura que
          // concluiu "só o card de últimas movimentações precisa de filtro" percorreu os
          // consumidores de `movimentacoes` e PAROU ALI — o lado dos ITENS tem a sua própria
          // tabela detalhada de relatório, e esta é a única leitura dela sem allow-list de
          // tipo. Sem esta linha, a correção-dev entrava na tabela do relatório do período
          // COM a justificativa escrita pelo dev impressa e exportada no CSV.
          //
          // O saldo em si CONTINUA contando com o ajuste (é o ponto de forçar o saldo): quem
          // soma é `rel_saldo_itens`, que não passa por aqui. O que se exclui é a linha do
          // relatório de MOVIMENTO do período, não o efeito no estoque.
          .eq('forcado', false)
        if (filialId) q = q.eq('filial_id', filialId)
        return q
          .order('data', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      },
    ),
    buscarLancEstornadosAteData(client, periodo.ate),
  ])
  // Backstop em JS do filtro da carga (defesa em profundidade — testado).
  return rows
    .filter((r) => !ehSaldoInicialGoLive(r.observacao))
    .map((r) => ({ ...mapLancamentoItemRow(r), ...marcaEstorno(estornados.get(r.id)) }))
}
