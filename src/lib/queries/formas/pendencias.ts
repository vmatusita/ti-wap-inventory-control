import 'server-only'
import { z } from 'zod'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao, reciboDeRpc } from '@/lib/supabase/leitura'

// As formas das leituras de `actions/pendencias.ts` (F58 · Frente C · lote 3).

const s = z.string()
const sn = z.string().nullable()
const n = z.number()

// ---------------------------------------------------------------------------
// `montarLancamentosDaResolucao` — a PONTE tipo→item (F38 · §E)
// ---------------------------------------------------------------------------
// As duas leituras que alimentam `resolverItemDoSlug` (`lib/itens/ponte-tipo-item.ts`); os
// dois selects casam EXATAMENTE com `ItemDoCatalogo`/`TipoParaPonte`, que já são os tipos que
// aquela função pura declara — a forma aqui não inventa vocabulário novo.

export const LEITURA_TIPOS_ITEM_PARA_PONTE = leituraDeRelacao({
  rotulo: 'pendencias.tipos-para-ponte',
  origem: 'tipos_item',
  select: 'id, slug, rotulo',
  forma: z.strictObject({ id: n, slug: s, rotulo: s }),
  ordem: ['id'],
})

export const LEITURA_ITENS_PARA_PONTE = leituraDeRelacao({
  rotulo: 'pendencias.itens-para-ponte',
  origem: 'itens',
  select: 'id, nome, ativo, tipo_id',
  forma: z.strictObject({ id: n, nome: s, ativo: z.boolean(), tipo_id: n.nullable() }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// `reabrirPendenciaItem` — os lançamentos a estornar da(s) pendência(s) reaberta(s)
// ---------------------------------------------------------------------------

export const LEITURA_LANCAMENTOS_DA_REABERTURA = leituraDeRelacao({
  rotulo: 'pendencias.lancamentos-da-reabertura',
  origem: 'lancamentos_item',
  select:
    'id, item_id, filial_id, tipo, quantidade, chamado, observacao, colaborador, colaborador_id, pendencia_item_id',
  forma: z.strictObject({
    id: s,
    item_id: n,
    filial_id: n,
    tipo: ENUM.tipoLancamento,
    quantidade: n,
    chamado: sn,
    observacao: sn,
    colaborador: sn,
    colaborador_id: sn,
    pendencia_item_id: sn,
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// `resolverPendenciaItem` — o RECIBO de `resolver_pendencias_item_com_lancamentos` (0126)
// ---------------------------------------------------------------------------
// Duas variantes no corpo vigente: o atalho de lote vazio (`resolvidas`, `lancamentos`) e o
// caminho normal, que acrescenta `regularizacoes`/`unidades_regularizadas` — união pelas
// chaves, todas opcionais (a action já trata cada uma com `?? 0`/`as … | null`).

export const LEITURA_RESOLVER_PENDENCIAS_COM_LANCAMENTOS = reciboDeRpc({
  rotulo: 'pendencias.resolver-com-lancamentos',
  rpc: 'resolver_pendencias_item_com_lancamentos',
  // Duas variantes (0126): `resolvidas`/`lancamentos` nas duas; as de regularização só na que regulariza.
  forma: z.strictObject({
    resolvidas: n,
    lancamentos: n,
    regularizacoes: n.optional(),
    unidades_regularizadas: n.optional(),
  }),
})
