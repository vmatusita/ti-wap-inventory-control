import 'server-only'
import { z } from 'zod'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

// A forma da leitura da última compra do operador (F58 · Frente C · lote 2).
//
// `CAMPOS_DO_ATIVO` é o mesmo template de `queries/compras.ts` — já literal (const de string
// única, sem `+`), então o select infere certo sem nenhuma mudança de texto.

const sn = z.string().nullable()

const CAMPOS_DO_ATIVO = 'categoria, marca, modelo, memoria, armazenamento, processador, fornecedor'

export const LEITURA_ULTIMA_COMPRA_DO_OPERADOR = leituraDeRelacao({
  rotulo: 'compras.ultima-do-operador',
  origem: 'movimentacoes',
  select: `filial_id, ativos(patrimonio, ${CAMPOS_DO_ATIVO})`,
  forma: z.strictObject({
    // `movimentacoes.filial_id` é not null (migration 0003) — o tipo à mão de
    // `UltimaCompraRow` dizia `number | null`; o compilador já não precisava do `?? null`.
    filial_id: z.number(),
    // `movimentacoes.ativo_id` é not null (migration 0003) → embed NÃO-nulo (mesmo precedente
    // de `MOV_BASE.ativo`, `formas/relatorios.ts`). O tipo à mão de `UltimaCompraRow` dizia
    // `ativos: {...} | null`; era a suposição que sobrava do embed, não o que o select garante.
    ativos: z.strictObject({
      patrimonio: sn,
      // `ativos.categoria` é not null (migration 0003) — a leitura direta (sem embed) já
      // sabe disso; aqui o embed confere o mesmo tipo.
      categoria: ENUM.categoriaAtivo,
      marca: sn,
      modelo: sn,
      memoria: sn,
      armazenamento: sn,
      processador: sn,
      fornecedor: sn,
    }),
  }),
  ordem: ['id'],
})
