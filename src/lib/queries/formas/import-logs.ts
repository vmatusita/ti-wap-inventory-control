import 'server-only'
import { z } from 'zod'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

// As formas das leituras de `queries/import-logs.ts` (F58 · Frente C · lote 2).

const s = z.string()
const sn = z.string().nullable()

// ---------------------------------------------------------------------------
// `paresEmOutrasFiliais` — os dois embeds `filiais(nome)` de `ativos`.
// ---------------------------------------------------------------------------

export const LEITURA_PAR_COM_PATRIMONIO_EM_OUTRA_FILIAL = leituraDeRelacao({
  rotulo: 'import-logs.par-com-patrimonio-em-outra-filial',
  origem: 'ativos',
  select: 'patrimonio, service_tag, filiais(nome)',
  forma: z.strictObject({
    patrimonio: sn,
    service_tag: sn,
    // `ativos.filial_id` é not null — o embed por coluna sai objeto NÃO-nulo.
    filiais: z.strictObject({ nome: s }),
  }),
  ordem: ['id'],
})

export const LEITURA_PAR_SEM_PATRIMONIO_EM_OUTRA_FILIAL = leituraDeRelacao({
  rotulo: 'import-logs.par-sem-patrimonio-em-outra-filial',
  origem: 'ativos',
  select: 'service_tag, filiais(nome)',
  forma: z.strictObject({
    service_tag: sn,
    filiais: z.strictObject({ nome: s }),
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// O backup do import (`exportarAcervoFilial`/`exportarDesvinculosFk`) — `select('*')`, FROUXA
// (decisão 5 e regra 8 do lote 2): a coluna que a forma não declara chega ao JSON do backup
// intacta, pelo `catchall` de `z.looseObject`.
// ---------------------------------------------------------------------------

export const LEITURA_BACKUP_ATIVOS_IMPORT = leituraDeRelacao({
  rotulo: 'import-logs.backup-ativos',
  origem: 'ativos',
  select: '*',
  forma: z.looseObject({ id: s }),
  ordem: ['id'],
})

export const LEITURA_BACKUP_MOVIMENTACOES_IMPORT = leituraDeRelacao({
  rotulo: 'import-logs.backup-movimentacoes',
  origem: 'movimentacoes',
  select: '*',
  forma: z.looseObject({ id: s }),
  ordem: ['id'],
})

export const LEITURA_BACKUP_ANOTACOES_IMPORT = leituraDeRelacao({
  rotulo: 'import-logs.backup-anotacoes',
  origem: 'anotacoes',
  select: '*',
  forma: z.looseObject({ id: s }),
  ordem: ['id'],
})

export const LEITURA_BACKUP_TERMOS_GERADOS_IMPORT = leituraDeRelacao({
  rotulo: 'import-logs.backup-termos-gerados',
  origem: 'termos_gerados',
  select: '*',
  forma: z.looseObject({ id: s, ativo_ids: z.array(s) }),
  ordem: ['id'],
})

export const LEITURA_BACKUP_PENDENCIAS_ITEM_IMPORT = leituraDeRelacao({
  rotulo: 'import-logs.backup-pendencias-item',
  origem: 'pendencias_item',
  select: '*',
  forma: z.looseObject({ id: s }),
  ordem: ['id'],
})

export const LEITURA_BACKUP_LANCAMENTOS_ITEM_IMPORT = leituraDeRelacao({
  rotulo: 'import-logs.backup-lancamentos-item-desvinculados',
  origem: 'lancamentos_item',
  select: 'id, movimentacao_id, pendencia_item_id',
  forma: z.strictObject({
    id: s,
    movimentacao_id: sn,
    pendencia_item_id: sn,
  }),
  ordem: ['id'],
})
