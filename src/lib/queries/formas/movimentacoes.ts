import 'server-only'
import { z } from 'zod'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao, reciboDeRpc } from '@/lib/supabase/leitura'

// As FORMAS das leituras de `queries/movimentacoes.ts` (F58 · Frente C).

const s = z.string()
const sn = z.string().nullable()
const n = z.number()

/**
 * O retrato do ativo ANTES da movimentação (`movimentacoes.snapshot_anterior`, jsonb gravado pelo
 * trigger). FROUXO: é coluna `jsonb` de dado histórico — um retrato gravado por uma versão antiga do
 * trigger pode não ter uma das chaves, ou ter outras. Cada chave é opcional e anulável; quem lê
 * normaliza a ausência para `null`, que é o que a tela do estorno sempre tratou.
 */
export const FORMA_SNAPSHOT_ANTERIOR = z.looseObject({
  status: ENUM.statusAtivo.nullable().optional(),
  colaborador: sn.optional(),
  setor: sn.optional(),
  filial_id: z.number().nullable().optional(),
})

/**
 * A linha do tempo da ficha do ativo. Até a F58 o `select` era montado por `+`, a inferência do
 * supabase-js caía, e a linha era tipada à mão (`RawTimelineRow`) com um cast no `jsonb` — com a
 * justificativa, falsa, de que o supabase-js não inferia os hints de FK. Ele infere, quando o texto
 * é LITERAL.
 */
export const LEITURA_LINHA_DO_TEMPO = leituraDeRelacao({
  rotulo: 'movimentacoes.linha-do-tempo',
  origem: 'movimentacoes',
  select:
    'id, tipo, motivo, data, colaborador, setor, chamado, chamado_fornecedor, status_anterior, status_resultante, itens_faltantes, observacao, estorno_de, snapshot_anterior, created_at, forcado, autor:profiles!movimentacoes_criado_por_fkey(nome), origem:filiais!movimentacoes_filial_id_fkey(nome), destino:filiais!movimentacoes_filial_destino_id_fkey(nome)',
  forma: z.strictObject({
    id: s,
    tipo: ENUM.tipoMovimentacao,
    motivo: sn,
    data: s,
    colaborador: sn,
    setor: sn,
    chamado: sn,
    chamado_fornecedor: sn,
    status_anterior: ENUM.statusAtivo.nullable(),
    status_resultante: ENUM.statusAtivo.nullable(),
    itens_faltantes: z.array(s).nullable(),
    observacao: sn,
    estorno_de: sn,
    snapshot_anterior: FORMA_SNAPSHOT_ANTERIOR.nullable(),
    created_at: s,
    forcado: z.boolean(),
    autor: z.strictObject({ nome: sn }),
    origem: z.strictObject({ nome: s }),
    destino: z.strictObject({ nome: s }).nullable(),
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// "Repetir último" da manutenção — `ultimoEnvioManutencao` (caminho de falha LANÇA).
// ---------------------------------------------------------------------------

export const LEITURA_ENVIO_MANUTENCAO = leituraDeRelacao({
  rotulo: 'movimentacoes.envio-manutencao',
  origem: 'movimentacoes',
  select: 'chamado, chamado_fornecedor',
  forma: z.strictObject({ chamado: sn, chamado_fornecedor: sn }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// "Repetir última" (F10/M3-adjacente) — `ultimaMovimentacaoDoUsuario`. Caminho de falha
// DEGRADA (`if (error) return null`, sem log): a forma errada segue o MESMO caminho.
// ---------------------------------------------------------------------------

export const LEITURA_ULTIMA_MOV_DO_USUARIO = leituraDeRelacao({
  rotulo: 'movimentacoes.ultima-do-usuario',
  origem: 'movimentacoes',
  select: 'tipo, motivo, colaborador, setor, chamado, termo_assinado, termo_data',
  forma: z.strictObject({
    tipo: ENUM.tipoMovimentacao,
    motivo: sn,
    colaborador: sn,
    setor: sn,
    chamado: sn,
    termo_assinado: ENUM.termoStatus.nullable(),
    termo_data: sn,
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// "Duplicar" (F10/M3) — `buscarMovimentacaoParaDuplicar`. Caminho de falha LANÇA.
// ---------------------------------------------------------------------------

export const LEITURA_MOV_PARA_DUPLICAR = leituraDeRelacao({
  rotulo: 'movimentacoes.para-duplicar',
  origem: 'movimentacoes',
  select:
    'ativo_id, tipo, motivo, colaborador, setor, chamado, termo_assinado, termo_data, observacao, filial_destino_id, itens_faltantes',
  forma: z.strictObject({
    ativo_id: s,
    tipo: ENUM.tipoMovimentacao,
    motivo: sn,
    colaborador: sn,
    setor: sn,
    chamado: sn,
    termo_assinado: ENUM.termoStatus.nullable(),
    termo_data: sn,
    observacao: sn,
    filial_destino_id: n.nullable(),
    itens_faltantes: z.array(s).nullable(),
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// F10/M4 — sugestões de colaborador/setor a partir do histórico (`sugestoesDeColuna`). Só
// `setor` é chamado hoje (`sugestoesColaboradores` saiu na revisão de 28/08/2026); a forma de
// `colaborador` fica pronta para quando o caminho genérico for reusado.
// ---------------------------------------------------------------------------

// ⚠ `.not(coluna, 'is', null)` no call-site NARROWS o tipo inferido do select — o supabase-js
// remove o `| null` da coluna filtrada (medido: `docs/f58-evidencias`, e reproduzido isolado
// durante o lote 2). A forma segue o tipo REAL depois do filtro: não-nula.

export const LEITURA_SUGESTAO_COLABORADOR_MOV = leituraDeRelacao({
  rotulo: 'movimentacoes.sugestao-colaborador',
  origem: 'movimentacoes',
  select: 'colaborador',
  forma: z.strictObject({ colaborador: s }),
  ordem: ['id'],
})

export const LEITURA_SUGESTAO_SETOR_MOV = leituraDeRelacao({
  rotulo: 'movimentacoes.sugestao-setor',
  origem: 'movimentacoes',
  select: 'setor',
  forma: z.strictObject({ setor: s }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// F10/M5 — possível duplicata do dia (`possiveisDuplicatasDoDia`). `ativo_id` é not null
// (migration 0003) → embed `ativos` NÃO-nulo.
// ---------------------------------------------------------------------------

export const LEITURA_CANDIDATAS_DUPLICATA = leituraDeRelacao({
  rotulo: 'movimentacoes.candidatas-duplicata',
  origem: 'movimentacoes',
  select: 'id, ativo_id, tipo, data, ativos(patrimonio)',
  forma: z.strictObject({
    id: s,
    ativo_id: s,
    tipo: ENUM.tipoMovimentacao,
    data: s,
    ativos: z.strictObject({ patrimonio: sn }),
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// F11/M8 — a LISTA de movimentações (`listarMovimentacoes`). Até a F58 o select era montado
// por `+` (`listaSelect`, categoria 2 — select não-literal); os dois textos abaixo são os
// mesmos, agora literais. `ativos` via `ativo_id` (not null, migration 0003) é NÃO-nulo nos
// DOIS — inclusive sem `!inner`: o `!inner` aqui não muda nulabilidade (a FK já garante), só a
// semântica do filtro por patrimônio (LEFT JOIN + filtro zeraria o embed sem excluir a linha;
// só é usado quando HÁ filtro por patrimônio, e nesse caso é sempre INNER). As duas formas
// compartilham a MESMA forma de linha.
// ---------------------------------------------------------------------------

const LISTA_COLS = 'id, tipo, data, created_at, colaborador, setor, observacao, ativo_id'
const LISTA_ATIVO_EMBED_COLS = 'patrimonio, service_tag, categoria, marca, modelo'
const LISTA_AUTOR_EMBED = 'autor:profiles!movimentacoes_criado_por_fkey(nome)'
const LISTA_FILIAL_EMBED = 'filial:filiais!movimentacoes_filial_id_fkey(nome)'

const FORMA_LISTA_MOVIMENTACAO = z.strictObject({
  id: s,
  tipo: ENUM.tipoMovimentacao,
  data: s,
  created_at: s,
  colaborador: sn,
  setor: sn,
  observacao: sn,
  ativo_id: s,
  ativos: z.strictObject({
    patrimonio: sn,
    service_tag: sn,
    categoria: ENUM.categoriaAtivo,
    marca: sn,
    modelo: sn,
  }),
  autor: z.strictObject({ nome: sn }),
  filial: z.strictObject({ nome: s }),
})

export const LEITURA_LISTA_MOVIMENTACOES = leituraDeRelacao({
  rotulo: 'movimentacoes.lista',
  origem: 'movimentacoes',
  select: `${LISTA_COLS}, ativos(${LISTA_ATIVO_EMBED_COLS}), ${LISTA_AUTOR_EMBED}, ${LISTA_FILIAL_EMBED}`,
  forma: FORMA_LISTA_MOVIMENTACAO,
  ordem: ['id'],
})

export const LEITURA_LISTA_MOVIMENTACOES_POR_PATRIMONIO = leituraDeRelacao({
  rotulo: 'movimentacoes.lista-por-patrimonio',
  origem: 'movimentacoes',
  select: `${LISTA_COLS}, ativos!inner(${LISTA_ATIVO_EMBED_COLS}), ${LISTA_AUTOR_EMBED}, ${LISTA_FILIAL_EMBED}`,
  forma: FORMA_LISTA_MOVIMENTACAO,
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// lote 3 — `actions/movimentacoes.ts`
// ---------------------------------------------------------------------------

// `registrarMovimentacoes` — o estado corrente de cada ativo do lote (filial de origem +
// status + detentor atual, para a regra §C.3 do vínculo).
export const LEITURA_ATIVOS_DO_LOTE = leituraDeRelacao({
  rotulo: 'movimentacoes.ativos-do-lote',
  origem: 'ativos',
  select: 'id, filial_id, status, colaborador_atual',
  forma: z.strictObject({
    id: s,
    filial_id: n,
    status: ENUM.statusAtivo,
    colaborador_atual: sn,
  }),
  ordem: ['id'],
})

// `estornarMovimentacao` — os lançamentos de item da movimentação a estornar.
export const LEITURA_ITENS_DA_MOVIMENTACAO_A_ESTORNAR = leituraDeRelacao({
  rotulo: 'movimentacoes.itens-a-estornar',
  origem: 'lancamentos_item',
  select:
    'id, item_id, filial_id, tipo, quantidade, chamado, observacao, colaborador, colaborador_id, regularizacao',
  forma: z.strictObject({
    id: s,
    item_id: n,
    filial_id: n,
    tipo: ENUM.tipoLancamento,
    quantidade: n,
    chamado: sn,
    observacao: sn,
    colaborador: sn,
    colaborador_id: sn,
    regularizacao: z.boolean(),
  }),
  ordem: ['id'],
})

// `registrarMovimentacoes` — o RECIBO de `criar_movimentacao_com_itens` (0126). Único
// `return jsonb_build_object(…)` no corpo vigente; `itens` sai sempre (mesmo lote sem item
// junto — a RPC devolve 0), mas segue opcional aqui pela mesma folga das demais chaves.
export const LEITURA_CRIAR_MOVIMENTACAO_COM_ITENS = reciboDeRpc({
  rotulo: 'movimentacoes.criar-com-itens',
  rpc: 'criar_movimentacao_com_itens',
  // Um só retorno (0126): toda chave é obrigatória.
  forma: z.strictObject({
    movimentacoes: z.array(s),
    itens: n,
    regularizacoes: n,
    unidades_regularizadas: n,
  }),
})
