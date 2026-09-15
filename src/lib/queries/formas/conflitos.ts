import 'server-only'
import { z } from 'zod'
import { naoNulaNaView } from '@/lib/supabase/colunas-de-view'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao, reciboDeRpc } from '@/lib/supabase/leitura'

// As FORMAS da mesa de conflitos entre filiais (F58 · Frente C).
//
// `v_conflitos_filiais` é VIEW: o gerador tipa todas as colunas como anuláveis. Cinco delas o SQL
// vivo garante não-nulas (a `0134`: a chave vem de `grupos`, que filtra `i.chave is not null`; o
// ativo, a filial, o status e a categoria vêm de `ativos` por join interno) — e só essas cinco
// tiram o `null`, pela marca do mapa `COLUNAS_DE_VIEW_NAO_NULAS`. As demais continuam anuláveis,
// como a view as entrega.
//
// Até a F58 o tipo `RowLado` afirmava isso à mão e `paginarTodos<RowLado>` o aceitava sem conferir.

const sn = z.string().nullable()
const nn = z.number().nullable()

export const LEITURA_LADOS_DE_CONFLITO = leituraDeRelacao({
  rotulo: 'conflitos.lados',
  origem: 'v_conflitos_filiais',
  select:
    'chave, ativo_id, patrimonio, service_tag, filial_id, filial, filial_nome, status, categoria, marca, modelo, hostname, colaborador_atual, setor_atual, origem, pendencia, entrada_em, updated_at, movimentacoes, movimentacoes_reais, ultima_mov_data, ultima_mov_tipo, termos, tem_historico_real',
  forma: z.strictObject({
    chave: naoNulaNaView('v_conflitos_filiais', 'chave', z.string()),
    ativo_id: naoNulaNaView('v_conflitos_filiais', 'ativo_id', z.string()),
    patrimonio: sn,
    service_tag: sn,
    filial_id: naoNulaNaView('v_conflitos_filiais', 'filial_id', z.number()),
    filial: sn,
    filial_nome: sn,
    status: naoNulaNaView('v_conflitos_filiais', 'status', ENUM.statusAtivo),
    categoria: naoNulaNaView('v_conflitos_filiais', 'categoria', ENUM.categoriaAtivo),
    marca: sn,
    modelo: sn,
    hostname: sn,
    colaborador_atual: sn,
    setor_atual: sn,
    origem: sn,
    pendencia: sn,
    entrada_em: sn,
    updated_at: sn,
    movimentacoes: nn,
    movimentacoes_reais: nn,
    ultima_mov_data: sn,
    ultima_mov_tipo: sn,
    termos: nn,
    tem_historico_real: z.boolean().nullable(),
  }),
  ordem: ['chave', 'ativo_id'],
})

// ---------------------------------------------------------------------------
// lote 3 — o RECIBO de `apagar_ativos_conflito_filiais` (`actions/conflitos.ts::apagarConflito`)
// ---------------------------------------------------------------------------
// RPC que ESCREVE: a forma é provada contra o CORPO VIVO (migration 0132, o `create or
// replace` mais recente), não chamada pelo conferidor. Um único `return jsonb_build_object(…)`
// no corpo, com estas oito chaves — todas opcionais na forma porque a action já trata cada uma
// com `?? default` (o tipo à mão de antes já as declarava assim).

export const LEITURA_APAGAR_CONFLITO = reciboDeRpc({
  rotulo: 'conflitos.apagar',
  rpc: 'apagar_ativos_conflito_filiais',
  // Um só retorno no corpo vivo (0132): toda chave é obrigatória.
  forma: z.strictObject({
    ativos: z.number(),
    movimentacoes: z.number(),
    anotacoes: z.number(),
    pendencias_item: z.number(),
    termos: z.number(),
    ponteiros_anulados: z.number(),
    arquivos_termos: z.array(z.string()),
    selecionados: z.json(),
  }),
})

// ---------------------------------------------------------------------------
// Revisão adversarial da F58 — o BACKUP EM ARQUIVO da mesa (`acervoDosAtivos`)
// ---------------------------------------------------------------------------
// Acima do teto de ativos da exclusão, o backup sai da RPC e vira arquivo, montado com `select('*')`
// de cinco tabelas — a mesma classe de leitura dos backups da Zona destrutiva e do import. Até a
// revisão adversarial ele lia com `paginarTodos<unknown>`, sem forma nenhuma: a coluna que uma
// migration acrescentasse chegava ao arquivo por acaso, e nada provava isso. Aqui: `z.looseObject`
// (a coluna que a forma não conhece TEM de chegar ao backup — `backup-frouxo.test.ts`), declarando só
// o que o código lê da linha.

const s = z.string()

export const LEITURA_BACKUP_ATIVOS_CONFLITO = leituraDeRelacao({
  rotulo: 'conflitos.backup-ativos',
  origem: 'ativos',
  select: '*',
  forma: z.looseObject({ id: s }),
  ordem: ['id'],
})

export const LEITURA_BACKUP_MOVIMENTACOES_CONFLITO = leituraDeRelacao({
  rotulo: 'conflitos.backup-movimentacoes',
  origem: 'movimentacoes',
  select: '*',
  forma: z.looseObject({ id: s }),
  ordem: ['id'],
})

export const LEITURA_BACKUP_ANOTACOES_CONFLITO = leituraDeRelacao({
  rotulo: 'conflitos.backup-anotacoes',
  origem: 'anotacoes',
  select: '*',
  forma: z.looseObject({ id: s }),
  ordem: ['id'],
})

export const LEITURA_BACKUP_PENDENCIAS_ITEM_CONFLITO = leituraDeRelacao({
  rotulo: 'conflitos.backup-pendencias-item',
  origem: 'pendencias_item',
  select: '*',
  forma: z.looseObject({ id: s }),
  ordem: ['id'],
})

// `ativo_ids` é a coluna que o recorte em memória lê (o array não tem FK).
export const LEITURA_BACKUP_TERMOS_GERADOS_CONFLITO = leituraDeRelacao({
  rotulo: 'conflitos.backup-termos-gerados',
  origem: 'termos_gerados',
  select: '*',
  forma: z.looseObject({ id: s, ativo_ids: z.array(s) }),
  ordem: ['id'],
})
