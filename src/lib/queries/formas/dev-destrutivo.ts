import 'server-only'
import { z } from 'zod'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao, reciboDeRpc } from '@/lib/supabase/leitura'

// F58 · lote 3 acrescenta os RECIBOS das seis RPCs de `actions/dev-destrutivo.ts` (apagar
// ativo/movimentação/item, resetar acervo/itens, forçar estado/saldo). Cada uma tem, no corpo
// vigente, um `select jsonb_build_object(…) into v_backup` (o BACKUP inline do evento de
// auditoria) além do `return jsonb_build_object(…)` de verdade — o scanner de
// `rpc-retorno-sql.test.ts` pega os dois como "variantes" (ele não distingue "select … into" de
// "return"). Cada forma abaixo é a UNIÃO das chaves de toda variante encontrada, todas
// `.optional()`: é o MESMO tratamento que a action já dava a cada campo (`?? 0`, `?? null`,
// `?? []`) desde antes desta fase — nenhuma ficou "mais opcional" do que já era na prática.

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

// ---------------------------------------------------------------------------
// 6. Os recibos das seis RPCs de `actions/dev-destrutivo.ts` (lote 3)
// ---------------------------------------------------------------------------

// `apagarAtivo` — `apagar_ativo` (0082). Variantes: o backup inline (`ativo`, `movimentacoes`,
// `termos`, `anotacoes`, `pendencias_item`) e o retorno de verdade (`ativo_id`, `rotulo`,
// `movimentacoes`, `anotacoes`, `pendencias_item`, `termos`, `ponteiros_anulados`,
// `arquivos_termos`).
export const LEITURA_APAGAR_ATIVO = reciboDeRpc({
  rotulo: 'dev-destrutivo.apagar-ativo',
  rpc: 'apagar_ativo',
  // Um só retorno (0082); `ativo` era a chave do backup interno do evento, não do retorno.
  forma: z.strictObject({
    ativo_id: s,
    rotulo: s,
    movimentacoes: n,
    anotacoes: n,
    pendencias_item: n,
    termos: n,
    ponteiros_anulados: n,
    arquivos_termos: z.array(s),
  }),
})

// `apagarMovimentacao` — `apagar_movimentacao` (0090). Variantes: o backup inline
// (`movimentacao`, `ativo_antes`, `pendencias_item`) e o retorno de verdade
// (`movimentacao_id`, `ativo_id`, `rotulo`, `tipo`, `status_restaurado`, `pendencias_item`).
export const LEITURA_APAGAR_MOVIMENTACAO = reciboDeRpc({
  rotulo: 'dev-destrutivo.apagar-movimentacao',
  rpc: 'apagar_movimentacao',
  // Um só retorno (0090); `movimentacao`/`ativo_antes` eram do backup interno do evento.
  forma: z.strictObject({
    pendencias_item: n,
    movimentacao_id: s,
    ativo_id: s,
    rotulo: s,
    tipo: s,
    status_restaurado: sn,
  }),
})

// `apagarItem` — `apagar_item` (0082). Variantes: o backup inline (`item`, `lancamentos`) e o
// retorno de verdade (`item_id`, `nome`, `lancamentos`).
export const LEITURA_APAGAR_ITEM = reciboDeRpc({
  rotulo: 'dev-destrutivo.apagar-item',
  rpc: 'apagar_item',
  // Um só retorno (0082); `item` era do backup interno do evento.
  forma: z.strictObject({
    lancamentos: n,
    item_id: n,
    nome: s,
  }),
})

// `resetarBloco` — `resetar_acervo`/`resetar_itens` (0089). Duas RPCs distintas chamadas pela
// MESMA action (`rpc` dinâmico — ver `src/lib/supabase/rpc.ts`), então uma forma SÓ, com a
// união das chaves das duas: `resetar_acervo` devolve `alcance, filial_id, rotulo, ativos,
// movimentacoes, anotacoes, pendencias_item, termos, arquivos_termos, restam_ativos`;
// `resetar_itens` devolve `alcance, filial_id, rotulo, lancamentos, restam_lancamentos`. A
// action espalha o objeto inteiro (`{ ...r, backup_path }`) sem nomear campo nenhum, então a
// folga de `.optional()` é exatamente o que ela já supunha (`Record<string, unknown> & {…}`).
// As duas RPCs de reset (0089) devolvem `alcance`, `filial_id` e `rotulo` sempre; o resto é do bloco — o acervo traz
// ativos…restam_ativos, os itens trazem lancamentos/restam_lancamentos. Uma forma só porque a action chama as duas.
export const FORMA_RESETAR_BLOCO = z.strictObject({
  alcance: s,
  filial_id: n.nullable(),
  rotulo: s,
  ativos: n.optional(),
  movimentacoes: n.optional(),
  anotacoes: n.optional(),
  pendencias_item: n.optional(),
  termos: n.optional(),
  arquivos_termos: z.array(s).optional(),
  restam_ativos: n.optional(),
  lancamentos: n.optional(),
  restam_lancamentos: n.optional(),
})

export const LEITURA_RESETAR_ACERVO = reciboDeRpc({
  rotulo: 'dev-destrutivo.resetar-acervo',
  rpc: 'resetar_acervo',
  forma: FORMA_RESETAR_BLOCO,
})

export const LEITURA_RESETAR_ITENS = reciboDeRpc({
  rotulo: 'dev-destrutivo.resetar-itens',
  rpc: 'resetar_itens',
  forma: FORMA_RESETAR_BLOCO,
})

// `forcarEstado` — `forcar_estado_ativo` (0110). Variantes: o atalho idempotente (`alterado`,
// `ativo_id`, `rotulo`, `status`) e o caminho que muda de fato (`alterado`, `ativo_id`,
// `rotulo`, `movimentacao_id`, `de`, `para`, `detentor_zerado`).
export const LEITURA_FORCAR_ESTADO = reciboDeRpc({
  rotulo: 'dev-destrutivo.forcar-estado',
  rpc: 'forcar_estado_ativo',
  // Duas variantes (0110): `alterado`/`ativo_id`/`rotulo` nas duas; `status` só na de "nada mudou"; o resto só na outra.
  forma: z.strictObject({
    alterado: z.boolean(),
    ativo_id: s,
    rotulo: s,
    status: s.optional(),
    movimentacao_id: s.optional(),
    de: s.optional(),
    para: s.optional(),
    detentor_zerado: z.boolean().optional(),
  }),
})

// `forcarSaldo` — `forcar_saldo_item` (0084). Variantes: o atalho idempotente (`alterado`,
// `item_id`, `item`, `filial_id`, `filial`, `saldo`) e o caminho que lança de fato (`alterado`,
// `item_id`, `item`, `filial_id`, `filial`, `de`, `para`, `delta`, `lancamento_id`).
export const LEITURA_FORCAR_SALDO = reciboDeRpc({
  rotulo: 'dev-destrutivo.forcar-saldo',
  rpc: 'forcar_saldo_item',
  // Duas variantes (0084): as cinco primeiras chaves nas duas; `saldo` só na de "nada mudou"; o resto só na outra.
  forma: z.strictObject({
    alterado: z.boolean(),
    item_id: n,
    item: s,
    filial_id: n,
    filial: s,
    saldo: n.optional(),
    de: n.optional(),
    para: n.optional(),
    delta: n.optional(),
    lancamento_id: s.optional(),
  }),
})
