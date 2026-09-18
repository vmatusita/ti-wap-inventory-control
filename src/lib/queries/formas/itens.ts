import 'server-only'
import { z } from 'zod'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao, leituraDeRpc, reciboDeRpc } from '@/lib/supabase/leitura'

// As formas das leituras de `queries/itens.ts` (F58 · Frente C · lote 2).

const s = z.string()
const sn = z.string().nullable()
const n = z.number()

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export const LEITURA_ITENS_ATIVOS = leituraDeRelacao({
  rotulo: 'itens.ativos',
  origem: 'itens',
  select: 'id, nome, grupo, estoque_minimo, tipo_id',
  forma: z.strictObject({
    id: n,
    nome: s,
    grupo: ENUM.grupoItem,
    estoque_minimo: n,
    tipo_id: n.nullable(),
  }),
  ordem: ['id'],
})

export const LEITURA_ITENS_ADMIN = leituraDeRelacao({
  rotulo: 'itens.admin',
  origem: 'itens',
  select: 'id, nome, grupo, ordem, ativo, estoque_minimo, tipo_id, lancamentos_item(count)',
  forma: z.strictObject({
    id: n,
    nome: s,
    grupo: ENUM.grupoItem,
    ordem: n,
    ativo: z.boolean(),
    estoque_minimo: n,
    tipo_id: n.nullable(),
    lancamentos_item: z.array(z.strictObject({ count: n })),
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// O histórico de lançamentos (tela paginada + export CSV) — mesmo select nos dois.
// ---------------------------------------------------------------------------
// `LANC_SELECT` (queries/itens.ts) era montado por `+` (categoria 2 — select não-literal); aqui
// vira um template único, sem mudar o texto. `item_id`/`filial_id`/`criado_por` são not null
// (migration 0015) → os três embeds saem OBJETOS NÃO-NULOS.

const LANC_COLS = 'id, data, tipo, quantidade, chamado, colaborador, observacao, estorna_id, created_at'
const LANC_ITEM_EMBED = 'item:itens!lancamentos_item_item_id_fkey(nome, grupo)'
const LANC_FILIAL_EMBED = 'filial:filiais!lancamentos_item_filial_id_fkey(nome)'
const LANC_AUTOR_EMBED = 'autor:profiles!lancamentos_item_criado_por_fkey(nome)'

// Um template SÓ (sem `+`) — é o texto EXATO de antes, só a forma de montar que muda: `+` sempre
// alarga para `string` (mesmo entre literais), um template com `${...}` de outras CONSTS
// literais preserva o literal completo (medido em `docs/f58-evidencias`, explore c, §3).
export const LANC_SELECT = `${LANC_COLS}, ${LANC_ITEM_EMBED}, ${LANC_FILIAL_EMBED}, ${LANC_AUTOR_EMBED}`

const FORMA_LANCAMENTO_HISTORICO = z.strictObject({
  id: s,
  data: s,
  tipo: ENUM.tipoLancamento,
  quantidade: n,
  chamado: sn,
  colaborador: sn,
  observacao: sn,
  estorna_id: sn,
  created_at: s,
  item: z.strictObject({ nome: s, grupo: ENUM.grupoItem }),
  filial: z.strictObject({ nome: s }),
  autor: z.strictObject({ nome: sn }),
})

export const LEITURA_HISTORICO_LANCAMENTOS = leituraDeRelacao({
  rotulo: 'itens.historico-lancamentos',
  origem: 'lancamentos_item',
  select: LANC_SELECT,
  forma: FORMA_LANCAMENTO_HISTORICO,
  ordem: ['id'],
})

export const LEITURA_HISTORICO_PARA_EXPORT = leituraDeRelacao({
  rotulo: 'itens.historico-export',
  origem: 'lancamentos_item',
  select: LANC_SELECT,
  forma: FORMA_LANCAMENTO_HISTORICO,
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// "Saldo após" (ITN-03a) — histórico completo de um item×filial
// ---------------------------------------------------------------------------

export const LEITURA_LANCAMENTOS_SALDO_APOS = leituraDeRelacao({
  rotulo: 'itens.lancamentos-saldo-apos',
  origem: 'lancamentos_item',
  select: 'id, data, created_at, tipo, quantidade, chamado',
  forma: z.strictObject({
    id: s,
    data: s,
    created_at: s,
    tipo: ENUM.tipoLancamento,
    quantidade: n,
    chamado: sn,
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// "Repetir último" (getUltimoLancamento) — caminho de falha ENGOLIDO (erro-engolido.test.ts):
// preservado tal qual; a forma errada segue o MESMO caminho (degrada para `null`).
// ---------------------------------------------------------------------------

export const LEITURA_ULTIMO_LANCAMENTO = leituraDeRelacao({
  rotulo: 'itens.ultimo-lancamento',
  origem: 'lancamentos_item',
  select: 'item_id, filial_id, tipo, chamado, colaborador',
  forma: z.strictObject({
    item_id: n,
    filial_id: n,
    tipo: ENUM.tipoLancamento,
    chamado: sn,
    colaborador: sn,
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// F38 — "Com esta pessoa" (RPC rel_saldo_colaborador, 0118) — as DUAS chamadas
// (saldoDoColaborador e saldosPorColaborador) usam o MESMO descritor.
// ---------------------------------------------------------------------------

export const LEITURA_SALDO_COLABORADOR = leituraDeRpc({
  rotulo: 'itens.saldo-colaborador',
  rpc: 'rel_saldo_colaborador',
  forma: z.strictObject({
    item_id: n,
    item: s,
    filial_id: n,
    filial: s,
    com_a_pessoa: n,
  }),
  retorno: 'linhas',
  matriz: { tipo: 'colaborador', colaborador: 'p_colaborador' },
  // uma linha por ITEM E FILIAL: `group by l.item_id, i.nome, l.filial_id, f.nome` (0118). Só
  // `item_id` repetia a chave para quem tem o mesmo item em duas filiais — a revisão do lote 2 pegou.
  ordem: ['item_id', 'filial_id'],
})

// ---------------------------------------------------------------------------
// F42/F38 — "o que foi junto" e os acessórios do termo
// ---------------------------------------------------------------------------
// `lancamentos_item.item_id` é not null → embed `itens` NÃO-nulo; `movimentacoes!inner(ativo_id)`
// é INNER explícito → NÃO-nulo. `regularizacao` é not null default false (migration 0125) — o
// tipo à mão dizia `boolean | null`; o `?? false` de antes escondia a diferença.

export const LEITURA_ITENS_JUNTO_DO_ATIVO = leituraDeRelacao({
  rotulo: 'itens.junto-do-ativo',
  origem: 'lancamentos_item',
  select: 'id, tipo, quantidade, data, movimentacao_id, regularizacao, itens(nome), movimentacoes!inner(ativo_id)',
  forma: z.strictObject({
    id: s,
    tipo: ENUM.tipoLancamento,
    quantidade: n,
    data: s,
    movimentacao_id: sn,
    regularizacao: z.boolean(),
    itens: z.strictObject({ nome: s }),
    movimentacoes: z.strictObject({ ativo_id: s }),
  }),
  ordem: ['id'],
})

// `itens!inner(tipo_id, tipos_item(id, rotulo, ordem))`: `itens!inner` é INNER explícito →
// NÃO-nulo; `itens.tipo_id` é anulável (F42) → o embed `tipos_item` (via `tipo_id`) fica
// NULÁVEL. `tipos_item.id/rotulo/ordem` são not null (migration 0114, mesmo padrão do catálogo
// de tipos de item já migrado no lote 1).
export const LEITURA_ACESSORIOS_DAS_MOVIMENTACOES = leituraDeRelacao({
  rotulo: 'itens.acessorios-movimentacoes',
  origem: 'lancamentos_item',
  select: 'quantidade, estorna_id, pendencia_item_id, itens!inner(tipo_id, tipos_item(id, rotulo, ordem))',
  forma: z.strictObject({
    quantidade: n,
    estorna_id: sn,
    pendencia_item_id: sn,
    itens: z.strictObject({
      tipo_id: n.nullable(),
      tipos_item: z.strictObject({ id: n, rotulo: s, ordem: n }).nullable(),
    }),
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// lote 3 — `actions/itens.ts`
// ---------------------------------------------------------------------------

// `estornarLancamento` — o lançamento original a estornar.
export const LEITURA_LANCAMENTO_PARA_ESTORNO = leituraDeRelacao({
  rotulo: 'itens.lancamento-para-estorno',
  origem: 'lancamentos_item',
  select:
    'id, item_id, filial_id, tipo, quantidade, chamado, observacao, estorna_id, colaborador, colaborador_id, regularizacao',
  forma: z.strictObject({
    id: s,
    item_id: n,
    filial_id: n,
    tipo: ENUM.tipoLancamento,
    quantidade: n,
    chamado: sn,
    observacao: sn,
    estorna_id: sn,
    colaborador: sn,
    colaborador_id: sn,
    regularizacao: z.boolean(),
  }),
  ordem: ['id'],
})

// `lancarItens` — o RECIBO de `lancar_itens_lote` (0126). Único `return jsonb_build_object(…)`
// no corpo vigente, com estas três chaves; opcionais porque a action já as trata com `?? 0`.
export const LEITURA_LANCAR_ITENS_LOTE = reciboDeRpc({
  rotulo: 'itens.lancar-itens-lote',
  rpc: 'lancar_itens_lote',
  // Um só retorno (0126): toda chave é obrigatória.
  forma: z.strictObject({
    linhas: n,
    regularizacoes: n,
    unidades_regularizadas: n,
  }),
})
