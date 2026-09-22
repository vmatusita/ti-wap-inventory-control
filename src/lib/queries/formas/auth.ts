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

// `getOperador` — o que é da CONTA: o nome e o arquivamento. F62: o cargo e o status saíram
// daqui (`profiles.papel`/`profiles.ativo` congelaram — decisão iii) e moram em `membros`.
export const LEITURA_PERFIL_OPERADOR = leituraDeRelacao({
  rotulo: 'auth.perfil-operador',
  origem: 'profiles',
  select: 'nome, excluido_em',
  forma: z.strictObject({
    nome: sn,
    excluido_em: sn,
  }),
  ordem: ['id'],
})

// `getOperador` — o CARGO e o STATUS do operador logado, na membership da empresa legada (F62).
// `membros.papel` é not null (0153) e vem tipado como `PapelUsuario` pelo select, sem cast; o
// `id` é o da membership, que é a dona dos vínculos de escrita (`operador_filiais.membro_id`).
export const LEITURA_MEMBRO_OPERADOR = leituraDeRelacao({
  rotulo: 'auth.membro-operador',
  origem: 'membros',
  select: 'id, papel, ativo',
  forma: z.strictObject({
    id: z.string(),
    papel: ENUM.papelUsuario,
    ativo: z.boolean(),
  }),
  ordem: ['id'],
})
