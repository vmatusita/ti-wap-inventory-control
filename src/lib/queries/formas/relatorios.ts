import 'server-only'
import { z } from 'zod'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao, leituraDeRpc } from '@/lib/supabase/leitura'

// As FORMAS das leituras de `queries/relatorios/**` (F58 · Frente C · lote 1).
//
// É a superfície que o VISUALIZADOR POR SENHA percorre com o client administrativo — a mais
// exposta a um dado de formato inesperado, e por isso a primeira. As `rel_*` chegam com o tipo JÁ
// corrigido pela porta de RPC (`rpc.ts`: `colaborador`/`setor`/`marca`/`modelo` anuláveis no as-of);
// a forma daqui confere em runtime o que o tipo afirma, e o conferidor a roda na matriz de filiais ×
// datas contra produção.
//
// Os `select` moram aqui como LITERAIS (template de constantes, nunca `+`): é o literal que faz o
// supabase-js inferir a linha contra a qual `linhasDe` amarra a forma. Até a F58 dois deles eram
// montados por concatenação e a inferência caía em `GenericStringError`.

const s = z.string()
const sn = z.string().nullable()
const n = z.number()

// ---------------------------------------------------------------------------
// Retornos de RPC (`returns table`)
// ---------------------------------------------------------------------------

export const LEITURA_REL_ESTOQUE_ASOF = leituraDeRpc({
  rotulo: 'relatorios.rel-estoque-asof',
  rpc: 'rel_estoque_asof',
  forma: z.strictObject({
    ativo_id: s,
    categoria: ENUM.categoriaAtivo,
    marca: sn,
    modelo: sn,
    filial_id: n,
    status: ENUM.statusAtivo,
    colaborador: sn,
    setor: sn,
  }),
  retorno: 'linhas',
  matriz: { tipo: 'filial-e-data', filial: 'p_filial', data: 'p_data' },
  // uma linha por ativo: `distinct on (e.ativo_id)` no corpo vivo (0134)
  ordem: ['ativo_id'],
})

export const LEITURA_REL_SALDO_ITENS = leituraDeRpc({
  rotulo: 'relatorios.rel-saldo-itens',
  rpc: 'rel_saldo_itens',
  forma: z.strictObject({
    item_id: n,
    item: s,
    grupo: ENUM.grupoItem,
    ordem: n,
    total: n,
    estoque: n,
    atrelados: n,
    falta: n,
  }),
  retorno: 'linhas',
  matriz: { tipo: 'filial-e-data', filial: 'p_filial', data: 'p_ate' },
  // uma linha por item: o agregado final é `group by item_id` (0027)
  ordem: ['item_id'],
})

export const LEITURA_REL_MOV_ITENS = leituraDeRpc({
  rotulo: 'relatorios.rel-mov-itens',
  rpc: 'rel_mov_itens',
  forma: z.strictObject({ item_id: n, item: s, grupo: ENUM.grupoItem, ordem: n, entradas: n, saidas: n }),
  retorno: 'linhas',
  matriz: { tipo: 'filial-e-periodo', filial: 'p_filial', de: 'p_de', ate: 'p_ate' },
  // uma linha por item: `group by i.id, …` (0016)
  ordem: ['item_id'],
})

export const LEITURA_REL_FRESCOR_ITENS = leituraDeRpc({
  rotulo: 'relatorios.rel-frescor-itens',
  rpc: 'rel_frescor_itens',
  forma: z.strictObject({ grupo: ENUM.grupoItem, ultima: s }),
  retorno: 'linhas',
  matriz: { tipo: 'filial-e-data', filial: 'p_filial', data: 'p_ate' },
  // uma linha por grupo: `group by i.grupo` (0016)
  ordem: ['grupo'],
})

export const LEITURA_REL_MOV_POR_MES = leituraDeRpc({
  rotulo: 'relatorios.rel-mov-por-mes',
  rpc: 'rel_mov_por_mes',
  forma: z.strictObject({ mes: s, tipo: ENUM.tipoMovimentacao, total: n }),
  retorno: 'linhas',
  matriz: { tipo: 'filial-e-periodo', filial: 'p_filial', de: 'p_de', ate: 'p_ate' },
})

export const LEITURA_REL_POR_MOTIVO = leituraDeRpc({
  rotulo: 'relatorios.rel-por-motivo',
  rpc: 'rel_por_motivo',
  forma: z.strictObject({ tipo: ENUM.tipoMovimentacao, motivo: s, total: n }),
  retorno: 'linhas',
  matriz: { tipo: 'filial-e-periodo', filial: 'p_filial', de: 'p_de', ate: 'p_ate' },
})

export const LEITURA_REL_RESUMO = leituraDeRpc({
  rotulo: 'relatorios.rel-resumo',
  rpc: 'rel_resumo',
  forma: z.strictObject({
    tipo: ENUM.tipoMovimentacao,
    filial_slug: s,
    filial_nome: s,
    motivo: s,
    categoria: ENUM.categoriaAtivo,
    total: n,
  }),
  retorno: 'linhas',
  matriz: { tipo: 'filial-e-periodo', filial: 'p_filial', de: 'p_de', ate: 'p_ate' },
})

// ---------------------------------------------------------------------------
// Tabelas (`select` literal)
// ---------------------------------------------------------------------------

// As colunas diretas + os embeds de ativo/filial que as "últimas movimentações" e as tabelas
// detalhadas compartilham. Fonte única para não divergirem (herdado de relatorios/movimentacoes.ts).
const MOV_COLS = 'id, data, tipo, chamado, observacao, colaborador, setor'
const ATIVO_EMBED = 'ativo:ativos!movimentacoes_ativo_id_fkey(id, patrimonio, marca, modelo, categoria)'
const FILIAL_EMBED = 'filial:filiais!movimentacoes_filial_id_fkey(nome)'

const MOV_BASE = {
  id: s,
  data: s,
  tipo: ENUM.tipoMovimentacao,
  chamado: sn,
  observacao: sn,
  colaborador: sn,
  setor: sn,
  ativo: z.strictObject({ id: s, patrimonio: sn, marca: sn, modelo: sn, categoria: ENUM.categoriaAtivo }),
  filial: z.strictObject({ nome: s }),
}

export const LEITURA_ULTIMAS_MOVIMENTACOES = leituraDeRelacao({
  rotulo: 'relatorios.ultimas-movimentacoes',
  origem: 'movimentacoes',
  select: `${MOV_COLS}, ${ATIVO_EMBED}, ${FILIAL_EMBED}`,
  forma: z.strictObject(MOV_BASE),
  ordem: ['id'],
})

export const LEITURA_TABELA_DO_PERIODO = leituraDeRelacao({
  rotulo: 'relatorios.tabela-do-periodo',
  origem: 'movimentacoes',
  select: `${MOV_COLS}, motivo, termo_assinado, itens_faltantes, ${ATIVO_EMBED}, ${FILIAL_EMBED}, destino:filiais!movimentacoes_filial_destino_id_fkey(nome), motivoRotulo:motivos!movimentacoes_motivo_fkey(rotulo)`,
  forma: z.strictObject({
    ...MOV_BASE,
    motivo: sn,
    termo_assinado: ENUM.termoStatus.nullable(),
    itens_faltantes: z.array(s).nullable(),
    destino: z.strictObject({ nome: s }).nullable(),
    motivoRotulo: z.strictObject({ rotulo: s }).nullable(),
  }),
  ordem: ['id'],
})

export const LEITURA_MOV_ITENS_DO_PERIODO = leituraDeRelacao({
  rotulo: 'relatorios.mov-itens-do-periodo',
  origem: 'lancamentos_item',
  select:
    'id, data, tipo, quantidade, chamado, colaborador, observacao, estorna_id, item:itens!lancamentos_item_item_id_fkey(nome, grupo), filial:filiais!lancamentos_item_filial_id_fkey(nome)',
  forma: z.strictObject({
    id: s,
    data: s,
    tipo: ENUM.tipoLancamento,
    quantidade: n,
    chamado: sn,
    colaborador: sn,
    observacao: sn,
    estorna_id: sn,
    item: z.strictObject({ nome: s, grupo: ENUM.grupoItem }),
    filial: z.strictObject({ nome: s }),
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// lote 3 — `actions/relatorios.ts::lerUltimaVersao` (a versão vigente de um período×filial)
// ---------------------------------------------------------------------------
// `relatorios_gerados.gerado_por` é not null (migration 0010) → o embed `autor` sai OBJETO
// NÃO-NULO — o tipo à mão de antes (`autor: {…} | null`) supunha o mesmo par nulo do
// `data as unknown as {…}` que existia aqui.

export const LEITURA_ULTIMA_VERSAO_RELATORIO = leituraDeRelacao({
  rotulo: 'relatorios.ultima-versao',
  origem: 'relatorios_gerados',
  select: 'versao, gerado_em, autor:profiles!relatorios_gerados_gerado_por_fkey(nome)',
  forma: z.strictObject({
    versao: n,
    gerado_em: s,
    autor: z.strictObject({ nome: sn }),
  }),
  ordem: ['id'],
})
