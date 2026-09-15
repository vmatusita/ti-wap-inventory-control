import 'server-only'
import { z } from 'zod'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

// As FORMAS das leituras do catálogo de tipos de item (F58 · Frente C · lote 1).
//
// A query (`queries/tipos-item.ts`) monta a consulta com a origem e o `select` daqui, e confere
// as linhas com a forma daqui; o conferidor de formas (`scripts/formas/conferir.mts`) importa O
// MESMO descritor e passa as linhas reais pela MESMA forma. `listarTiposItem` é superfície do
// visualizador por senha (recebe o client resolvido do relatório).

const TIPO_ITEM = {
  id: z.number(),
  slug: z.string(),
  rotulo: z.string(),
  ativo: z.boolean(),
  ordem: z.number(),
}

export const LEITURA_TIPOS_ITEM = leituraDeRelacao({
  rotulo: 'tipos-item.listar',
  origem: 'tipos_item',
  select: 'id, slug, rotulo, ativo, ordem',
  forma: z.strictObject(TIPO_ITEM),
  ordem: ['id'],
})

export const LEITURA_TIPOS_ITEM_ADMIN = leituraDeRelacao({
  rotulo: 'tipos-item.admin',
  origem: 'tipos_item',
  select: 'id, slug, rotulo, ativo, ordem, itens(count)',
  forma: z.strictObject({ ...TIPO_ITEM, itens: z.array(z.strictObject({ count: z.number() })) }),
  ordem: ['id'],
})
