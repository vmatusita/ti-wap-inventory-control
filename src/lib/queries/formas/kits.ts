import 'server-only'
import { z } from 'zod'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

// A forma da leitura do catálogo de KITS (F58 · Frente C · lote 2).
//
// `payload` é jsonb de forma LIVRE aqui, de propósito: quem valida o FORMATO do kit é
// `kitPayloadSchema`, em `queries/kits.ts`, LINHA A LINHA — kit com payload inválido é descartado da
// lista e contado em `invalidos`, e nunca derruba a página (F12 · W1). Por isso a forma só exige que
// seja JSON (`z.json()` aceita objeto, lista, texto, número e `null`). A primeira versão exigia
// objeto (`z.looseObject({})`), e um único payload `null` fazia a lista INTEIRA lançar — o wizard de
// movimentação e `/admin/kits` fora do ar por causa de um kit. A revisão do lote 2 pegou.

export const KIT_SELECT = 'id, nome, payload, ativo, created_at'

export const FORMA_KIT = z.strictObject({
  id: z.string(),
  nome: z.string(),
  payload: z.json(),
  ativo: z.boolean(),
  created_at: z.string(),
})

export const LEITURA_KITS_ATIVOS = leituraDeRelacao({
  rotulo: 'kits.ativos',
  origem: 'kits_modelos',
  select: KIT_SELECT,
  forma: FORMA_KIT,
  ordem: ['id'],
})

export const LEITURA_KITS_ADMIN = leituraDeRelacao({
  rotulo: 'kits.admin',
  origem: 'kits_modelos',
  select: KIT_SELECT,
  forma: FORMA_KIT,
  ordem: ['id'],
})
