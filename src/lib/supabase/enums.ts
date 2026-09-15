import { z } from 'zod'
import { Constants } from '@/lib/types/database'

// Os ENUMS do banco em Zod (F58 · Frente C) — derivados das tuplas que o próprio gerador publica
// em `Constants.public.Enums`, nunca redigitados. Um valor novo de enum (depois de `db:types`) entra
// aqui sozinho, e a amarração de `forma.ts` reprova o schema que ficar com uma lista velha: a SAÍDA
// dele deixaria de ser exatamente o tipo inferido da coluna.
const E = Constants.public.Enums

export const ENUM = {
  categoriaAtivo: z.enum(E.categoria_ativo),
  grupoItem: z.enum(E.grupo_item),
  papelUsuario: z.enum(E.papel_usuario),
  statusAtivo: z.enum(E.status_ativo),
  termoStatus: z.enum(E.termo_status),
  tipoLancamento: z.enum(E.tipo_lancamento),
  tipoMovimentacao: z.enum(E.tipo_movimentacao),
}
