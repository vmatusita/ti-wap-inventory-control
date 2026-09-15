import 'server-only'
import { z } from 'zod'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

// A forma da leitura da TRILHA de auditoria (F58 · Frente C · lote 2).
//
// `detalhe` é jsonb de forma livre (cada ação grava o que faz sentido para ela), e a tela o mostra
// como veio. A forma exige só que seja JSON — `z.json()`, que aceita objeto, lista, escalar e
// `null`. Até a revisão do lote 2 isto era `z.custom<Json>()`: sem predicado, ele não confere nada e
// só muda o tipo, o cast de antes com outra sintaxe (`sem-custom-sem-predicado.test.ts` reprova).

export const LEITURA_EVENTOS_ADMIN = leituraDeRelacao({
  rotulo: 'eventos-admin.listar',
  origem: 'eventos_admin',
  select: 'id, quando, acao, alvo, detalhe, autor:profiles!eventos_admin_autor_fkey(nome)',
  forma: z.strictObject({
    id: z.string(),
    quando: z.string(),
    acao: z.string(),
    alvo: z.string().nullable(),
    detalhe: z.json(),
    autor: z.strictObject({ nome: z.string().nullable() }).nullable(),
  }),
  ordem: ['id'],
})
