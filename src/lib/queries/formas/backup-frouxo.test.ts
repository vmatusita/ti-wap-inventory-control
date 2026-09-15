import { describe, expect, it } from 'vitest'
import { linhasDe } from '@/lib/supabase/linhas'
import {
  LEITURA_BACKUP_ANOTACOES,
  LEITURA_BACKUP_ATIVOS,
  LEITURA_BACKUP_LANCAMENTOS_ITEM,
  LEITURA_BACKUP_MOVIMENTACOES,
  LEITURA_BACKUP_PENDENCIAS_ITEM,
  LEITURA_BACKUP_TERMOS_GERADOS,
} from '@/lib/queries/formas/dev-destrutivo'
import {
  LEITURA_BACKUP_ANOTACOES_IMPORT,
  LEITURA_BACKUP_ATIVOS_IMPORT,
  LEITURA_BACKUP_MOVIMENTACOES_IMPORT,
  LEITURA_BACKUP_PENDENCIAS_ITEM_IMPORT,
  LEITURA_BACKUP_TERMOS_GERADOS_IMPORT,
} from '@/lib/queries/formas/import-logs'

// A SABOTAGEM D da fase (F58 · Frente C · lote 2, regra 8): os backups de `select('*')`
// (Zona destrutiva e import de startup) são `z.looseObject` de propósito — a coluna que a forma
// não declara TEM de sobreviver no JSON do backup, porque é ela que carrega o que uma migration
// futura acrescentou e este catálogo ainda não conhece (o defeito que a F54 matou).
//
// Este teste prova exatamente isso, com uma linha FICTÍCIA carregando uma coluna que NENHUMA
// forma declara (`coluna_nova_f63`). Se um dia alguém trocar um `z.looseObject` daqui por
// `z.object` (o padrão que REMOVE coluna não declarada em silêncio — ver `forma.ts` §2), a
// coluna desaparece do resultado e este teste fica VERMELHO. É o alarme.

const COLUNA_DESCONHECIDA = 'coluna_nova_f63'
const VALOR_FICTICIO = 'dado-que-nenhuma-forma-declara'

describe('os backups de select(*) preservam coluna que a forma não conhece (sabotagem D)', () => {
  it.each([
    ['dev-destrutivo.backup-ativos', LEITURA_BACKUP_ATIVOS],
    ['dev-destrutivo.backup-movimentacoes', LEITURA_BACKUP_MOVIMENTACOES],
    ['dev-destrutivo.backup-anotacoes', LEITURA_BACKUP_ANOTACOES],
    ['dev-destrutivo.backup-pendencias-item', LEITURA_BACKUP_PENDENCIAS_ITEM],
    ['dev-destrutivo.backup-lancamentos-item', LEITURA_BACKUP_LANCAMENTOS_ITEM],
    ['import-logs.backup-ativos', LEITURA_BACKUP_ATIVOS_IMPORT],
    ['import-logs.backup-movimentacoes', LEITURA_BACKUP_MOVIMENTACOES_IMPORT],
    ['import-logs.backup-anotacoes', LEITURA_BACKUP_ANOTACOES_IMPORT],
    ['import-logs.backup-pendencias-item', LEITURA_BACKUP_PENDENCIAS_ITEM_IMPORT],
  ] as const)('%s: linhasDe devolve a coluna desconhecida intacta', (_rotulo, descritor) => {
    const linhaFicticia = { id: 'id-ficticio', [COLUNA_DESCONHECIDA]: VALOR_FICTICIO }
    const [linha] = linhasDe([linhaFicticia], descritor.forma, descritor.rotulo)
    expect((linha as Record<string, unknown>)[COLUNA_DESCONHECIDA]).toBe(VALOR_FICTICIO)
  })

  // As duas formas de `termos_gerados` declaram `ativo_ids` (a coluna que o código lê) — a
  // linha fictícia precisa dela para passar pela conferência.
  it.each([
    ['dev-destrutivo.backup-termos-gerados', LEITURA_BACKUP_TERMOS_GERADOS],
    ['import-logs.backup-termos-gerados', LEITURA_BACKUP_TERMOS_GERADOS_IMPORT],
  ] as const)('%s: linhasDe devolve a coluna desconhecida intacta', (_rotulo, descritor) => {
    const linhaFicticia = {
      id: 'id-ficticio',
      ativo_ids: ['ativo-ficticio'],
      [COLUNA_DESCONHECIDA]: VALOR_FICTICIO,
    }
    const [linha] = linhasDe([linhaFicticia], descritor.forma, descritor.rotulo)
    expect((linha as Record<string, unknown>)[COLUNA_DESCONHECIDA]).toBe(VALOR_FICTICIO)
  })
})
