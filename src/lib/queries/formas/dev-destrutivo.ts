import 'server-only'
import { z } from 'zod'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao, reciboDeRpc } from '@/lib/supabase/leitura'

// As formas das leituras da ZONA DESTRUTIVA (F58 · Frente C · lote 2).

const s = z.string()
const sn = z.string().nullable()
const n = z.number()

// ---------------------------------------------------------------------------
// 1. Achar o ativo — MESMO select em `buscarAtivosDestrutivo` e `carregarFichaDestrutiva`.
// ---------------------------------------------------------------------------

export const LEITURA_CANDIDATOS_DESTRUTIVO = leituraDeRelacao({
  rotulo: 'dev-destrutivo.candidatos',
  origem: 'ativos',
  select:
    'id, patrimonio, service_tag, hostname, categoria, marca, modelo, status, filial_id, colaborador_atual',
  forma: z.strictObject({
    id: s,
    patrimonio: sn,
    service_tag: sn,
    hostname: sn,
    categoria: ENUM.categoriaAtivo,
    marca: sn,
    modelo: sn,
    status: ENUM.statusAtivo,
    filial_id: n,
    colaborador_atual: sn,
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// 2. O tamanho do estrago — `carregarFichaDestrutiva`
// ---------------------------------------------------------------------------

export const LEITURA_MOVS_DESTRUTIVO = leituraDeRelacao({
  rotulo: 'dev-destrutivo.movimentacoes-do-ativo',
  origem: 'movimentacoes',
  select: 'id, tipo, data, created_at, observacao, status_anterior, status_resultante, forcado, estorno_de',
  forma: z.strictObject({
    id: s,
    tipo: ENUM.tipoMovimentacao,
    data: s,
    created_at: s,
    observacao: sn,
    status_anterior: ENUM.statusAtivo.nullable(),
    status_resultante: ENUM.statusAtivo.nullable(),
    forcado: z.boolean(),
    estorno_de: sn,
  }),
  ordem: ['id'],
})

export const LEITURA_TERMOS_DO_ATIVO_DESTRUTIVO = leituraDeRelacao({
  rotulo: 'dev-destrutivo.termos-do-ativo',
  origem: 'termos_gerados',
  select: 'id, ativo_ids, movimentacao_ids',
  forma: z.strictObject({
    id: s,
    ativo_ids: z.array(s),
    movimentacao_ids: z.array(s),
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// 3. Itens do catálogo — `listarItensDestrutivo`
// ---------------------------------------------------------------------------

export const LEITURA_ITENS_DESTRUTIVO = leituraDeRelacao({
  rotulo: 'dev-destrutivo.itens',
  origem: 'itens',
  select: 'id, nome, grupo, ativo',
  forma: z.strictObject({
    id: n,
    nome: s,
    grupo: ENUM.grupoItem,
    ativo: z.boolean(),
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// 4. A prévia do reset — RECIBO, não leitura de conferidor.
// ---------------------------------------------------------------------------
// `previa_reset` exige `exigir_dev_para_destruir()` por dentro (migration 0086) — a conta de
// PRODUÇÃO do conferidor é `admin` e nunca a alcança. A forma é provada contra o CORPO VIVO
// (`jsonb_build_object('bloco', p_bloco, 'filial_id', p_filial, 'rotulo', …,
// 'termo_misto_bloqueia', v_misto, 'contagens', …)`): as cinco chaves sempre saem, `contagens`
// sai com as cinco chaves do bloco `acervo` OU a chave única de `itens` — daí o `z.record`.

export const LEITURA_PREVIA_RESET = reciboDeRpc({
  rotulo: 'dev-destrutivo.previa-reset',
  rpc: 'previa_reset',
  forma: z.strictObject({
    bloco: z.enum(['acervo', 'itens']),
    filial_id: n.nullable(),
    rotulo: s,
    termo_misto_bloqueia: z.boolean(),
    contagens: z.record(z.string(), n),
  }),
})

// ---------------------------------------------------------------------------
// 5. O BACKUP do reset — `select('*')`, FROUXA (decisão 5 e regra 8 do lote 2): a coluna que a
//    forma não declara tem de chegar ao backup JSON intacta. Cada forma declara só as colunas
//    que `montarBackupDoReset` LÊ da linha (as demais atravessam pelo `catchall` de
//    `z.looseObject`) — o resto do objeto vai para o arquivo sem que o código precise nomeá-lo.
// ---------------------------------------------------------------------------

export const LEITURA_BACKUP_ATIVOS = leituraDeRelacao({
  rotulo: 'dev-destrutivo.backup-ativos',
  origem: 'ativos',
  select: '*',
  forma: z.looseObject({ id: s }),
  ordem: ['id'],
})

export const LEITURA_BACKUP_MOVIMENTACOES = leituraDeRelacao({
  rotulo: 'dev-destrutivo.backup-movimentacoes',
  origem: 'movimentacoes',
  select: '*',
  forma: z.looseObject({ id: s }),
  ordem: ['id'],
})

export const LEITURA_BACKUP_ANOTACOES = leituraDeRelacao({
  rotulo: 'dev-destrutivo.backup-anotacoes',
  origem: 'anotacoes',
  select: '*',
  forma: z.looseObject({ id: s }),
  ordem: ['id'],
})

export const LEITURA_BACKUP_PENDENCIAS_ITEM = leituraDeRelacao({
  rotulo: 'dev-destrutivo.backup-pendencias-item',
  origem: 'pendencias_item',
  select: '*',
  forma: z.looseObject({ id: s }),
  ordem: ['id'],
})

export const LEITURA_BACKUP_TERMOS_GERADOS = leituraDeRelacao({
  rotulo: 'dev-destrutivo.backup-termos-gerados',
  origem: 'termos_gerados',
  select: '*',
  forma: z.looseObject({ id: s, ativo_ids: z.array(s) }),
  ordem: ['id'],
})

export const LEITURA_BACKUP_LANCAMENTOS_ITEM = leituraDeRelacao({
  rotulo: 'dev-destrutivo.backup-lancamentos-item',
  origem: 'lancamentos_item',
  select: '*',
  forma: z.looseObject({ id: s }),
  ordem: ['id'],
})
