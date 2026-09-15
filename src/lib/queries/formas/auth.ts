import 'server-only'
import { z } from 'zod'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao, leituraDeRpc } from '@/lib/supabase/leitura'

// As formas das leituras de `auth/acesso.ts` (F58 · Frente C · lote 3).

const sn = z.string().nullable()

// `papel_atual()` — RPC de LEITURA (`stable`), não recibo: o conferidor de formas PODE
// chamá-la (é `select`/RPC estável, nunca escreve). Está em `ESCALARES_ANULAVEIS`
// (`src/lib/supabase/rpc.ts`): perfil sem sessão, sem perfil ou desativado devolve NULL — "sem
// cargo", não erro. `lerPapel` continua distinguindo esse `null` de "não deu para saber".
export const LEITURA_PAPEL_ATUAL = leituraDeRpc({
  rotulo: 'auth.papel-atual',
  rpc: 'papel_atual',
  forma: ENUM.papelUsuario.nullable(),
  retorno: 'valor',
  matriz: { tipo: 'sem-argumentos' },
})

// `getOperador` — o perfil do operador logado. `profiles.papel` é not null (migration 0061) —
// o tipo à mão (`perfil.papel as PapelUsuario`) escondia que a coluna já vem tipada certo pelo
// select; a forma aqui devolve `PapelUsuario` direto, sem cast.
export const LEITURA_PERFIL_OPERADOR = leituraDeRelacao({
  rotulo: 'auth.perfil-operador',
  origem: 'profiles',
  select: 'nome, papel, ativo, excluido_em',
  forma: z.strictObject({
    nome: sn,
    papel: ENUM.papelUsuario,
    ativo: z.boolean(),
    excluido_em: sn,
  }),
  ordem: ['id'],
})
