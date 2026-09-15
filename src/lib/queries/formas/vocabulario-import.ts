import 'server-only'
import { z } from 'zod'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

// As formas do vocabulário do import de startup (F58 · Frente C · lote 2).
//
// `categoria`/`estado` saem do enum INTEIRO do banco (o CHECK de `import_termos_categoria`/
// `import_termos_estado`, migration 0139, estreita o domínio, mas o gerador não sabe disso) — a
// amarração exige o tipo EXATO do select, então a forma fica no enum largo; o estreitamento para
// `CategoriaImport`/`EstadoPlanilha` é feito à parte, por um guard puro (sem `as`), em
// `queries/vocabulario-import.ts`.

export const LEITURA_VOCAB_CATEGORIAS = leituraDeRelacao({
  rotulo: 'vocabulario-import.categorias',
  origem: 'import_termos_categoria',
  select: 'termo, categoria, rotulo',
  forma: z.strictObject({
    termo: z.string(),
    categoria: ENUM.categoriaAtivo,
    rotulo: z.string().nullable(),
  }),
  ordem: ['termo'],
})

export const LEITURA_VOCAB_ESTADOS = leituraDeRelacao({
  rotulo: 'vocabulario-import.estados',
  origem: 'import_termos_estado',
  select: 'termo, estado, rotulo',
  forma: z.strictObject({
    termo: z.string(),
    estado: ENUM.statusAtivo,
    rotulo: z.string().nullable(),
  }),
  ordem: ['termo'],
})
