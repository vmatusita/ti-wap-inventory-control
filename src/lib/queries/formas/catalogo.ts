import 'server-only'
import type { Descritor } from '@/lib/supabase/leitura'
import { LEITURA_TIPOS_ITEM, LEITURA_TIPOS_ITEM_ADMIN } from '@/lib/queries/formas/tipos-item'
import {
  LEITURA_MOV_ITENS_DO_PERIODO,
  LEITURA_REL_ESTOQUE_ASOF,
  LEITURA_REL_FRESCOR_ITENS,
  LEITURA_REL_MOV_ITENS,
  LEITURA_REL_MOV_POR_MES,
  LEITURA_REL_POR_MOTIVO,
  LEITURA_REL_RESUMO,
  LEITURA_REL_SALDO_ITENS,
  LEITURA_TABELA_DO_PERIODO,
  LEITURA_ULTIMAS_MOVIMENTACOES,
} from '@/lib/queries/formas/relatorios'
import { LEITURA_LADOS_DE_CONFLITO } from '@/lib/queries/formas/conflitos'
import { LEITURA_LINHA_DO_TEMPO } from '@/lib/queries/formas/movimentacoes'

// O CATÁLOGO DE FORMAS — toda leitura migrada para a porta da leitura (F58 · Frentes C e E).
//
// É a lista que o conferidor de formas (`scripts/formas/conferir.mts`) percorre contra o banco:
// cada descritor aqui é uma forma que precisa ser PROVADA contra as linhas reais de produção antes
// do merge (decisão ii do Johnny). `catalogo.test.ts` exige que todo descritor exportado de
// `src/lib/queries/formas/**` esteja nesta lista — uma forma fora do catálogo seria uma forma que
// nunca passou pelo dado real.
export const CATALOGO: readonly Descritor[] = [
  // lote 1 — tipos de item
  LEITURA_TIPOS_ITEM,
  LEITURA_TIPOS_ITEM_ADMIN,
  // lote 1 — relatórios (a superfície do visualizador por senha)
  LEITURA_REL_ESTOQUE_ASOF,
  LEITURA_REL_SALDO_ITENS,
  LEITURA_REL_MOV_ITENS,
  LEITURA_REL_FRESCOR_ITENS,
  LEITURA_REL_MOV_POR_MES,
  LEITURA_REL_POR_MOTIVO,
  LEITURA_REL_RESUMO,
  LEITURA_ULTIMAS_MOVIMENTACOES,
  LEITURA_TABELA_DO_PERIODO,
  LEITURA_MOV_ITENS_DO_PERIODO,
  // lote 1 — o que a inferência de `paginarTodos` desmascarou fora de relatórios
  LEITURA_LADOS_DE_CONFLITO,
  LEITURA_LINHA_DO_TEMPO,
]
