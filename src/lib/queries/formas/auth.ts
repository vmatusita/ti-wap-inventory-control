import 'server-only'
import { z } from 'zod'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao, leituraDeRpc } from '@/lib/supabase/leitura'

// As formas das leituras de `auth/acesso.ts` (F58 · Frente C · lote 3).

const sn = z.string().nullable()

// `papel_na_empresa(p_empresa)` (F67; era `papel_atual()`) — RPC de LEITURA (`stable`), não recibo: o conferidor de
// formas PODE chamá-la (nunca escreve), com a empresa legada (a matriz `empresa-legada`). Está em `ESCALARES_ANULAVEIS`
// (`src/lib/supabase/rpc.ts`): sem sessão, sem membership ativa naquela empresa ou arquivado devolve NULL — "sem cargo",
// não erro. `lerPapel` continua distinguindo esse `null` de "não deu para saber".
export const LEITURA_PAPEL_ATUAL = leituraDeRpc({
  rotulo: 'auth.papel-atual',
  rpc: 'papel_na_empresa',
  forma: ENUM.papelUsuario.nullable(),
  retorno: 'valor',
  matriz: { tipo: 'empresa-legada', empresa: 'p_empresa' },
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
