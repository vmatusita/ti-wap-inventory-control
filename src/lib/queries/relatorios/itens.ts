import type { GrupoItem } from '@/lib/dominio'
import type { Periodo } from '@/lib/relatorios/periodo'
import type { GrupoRelatorio, SaldoItemPeriodo } from '@/lib/relatorios/tipos'
import type { DbClient } from './comum'

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
    client.rpc('rel_saldo_itens', { p_filial: filialId, p_ate: periodo.ate }),
    client.rpc('rel_mov_itens', { p_filial: filialId, p_de: periodo.de, p_ate: periodo.ate }),
    client.rpc('rel_frescor_itens', { p_filial: filialId, p_ate: periodo.ate }),
    (() => {
      let q = client
        .from('lancamentos_item')
        .select('item_id, observacao, data, created_at')
        .not('observacao', 'is', null)
        .gte('data', periodo.de)
        .lte('data', periodo.ate)
      if (filialId) q = q.eq('filial_id', filialId)
      return q.order('created_at', { ascending: false }).limit(1000)
    })(),
  ])
  if (saldos.error) throw new Error(`Falha nos saldos de itens: ${saldos.error.message}`)
  if (movs.error) throw new Error(`Falha na movimentação de itens: ${movs.error.message}`)

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
