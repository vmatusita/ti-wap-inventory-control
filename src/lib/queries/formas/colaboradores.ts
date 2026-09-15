import 'server-only'
import { z } from 'zod'
import { naoNulaNaView } from '@/lib/supabase/colunas-de-view'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

// As formas das leituras do cadastro de pessoas (F58 · Frente C · lote 2).

const sn = z.string().nullable()

export const LEITURA_FILA_CONSOLIDACAO = leituraDeRelacao({
  rotulo: 'colaboradores.fila-consolidacao',
  origem: 'v_colaboradores_textos',
  select: 'nome_chave, grafia_exemplo, ocorrencias, grafias, filial_id, ja_cadastrado, colaborador_id',
  forma: z.strictObject({
    nome_chave: naoNulaNaView('v_colaboradores_textos', 'nome_chave', z.string()),
    grafia_exemplo: naoNulaNaView('v_colaboradores_textos', 'grafia_exemplo', z.string()),
    ocorrencias: naoNulaNaView('v_colaboradores_textos', 'ocorrencias', z.number()),
    grafias: naoNulaNaView('v_colaboradores_textos', 'grafias', z.number()),
    filial_id: naoNulaNaView('v_colaboradores_textos', 'filial_id', z.number()),
    ja_cadastrado: naoNulaNaView('v_colaboradores_textos', 'ja_cadastrado', z.boolean()),
    colaborador_id: sn,
  }),
  ordem: ['nome_chave'],
})

export const LEITURA_RESUMO_CONSOLIDACAO = leituraDeRelacao({
  rotulo: 'colaboradores.resumo-consolidacao',
  origem: 'v_colaboradores_consolidacao',
  select: 'ja_cadastrado, grupos, registros',
  forma: z.strictObject({
    ja_cadastrado: naoNulaNaView('v_colaboradores_consolidacao', 'ja_cadastrado', z.boolean()),
    grupos: naoNulaNaView('v_colaboradores_consolidacao', 'grupos', z.number()),
    registros: naoNulaNaView('v_colaboradores_consolidacao', 'registros', z.number()),
  }),
  ordem: ['ja_cadastrado'],
})

export const LEITURA_COLABORADORES_POR_NOME = leituraDeRelacao({
  rotulo: 'colaboradores.por-nome-chave',
  origem: 'colaboradores',
  select: 'id, nome_chave',
  forma: z.strictObject({ id: z.string(), nome_chave: sn }),
  ordem: ['id'],
})

// As três fontes do campo de colaborador (F37 · A.4): o cadastro e as duas tabelas de
// histórico que guardam nome digitado à mão.
export const LEITURA_SUGESTAO_CADASTRO = leituraDeRelacao({
  rotulo: 'colaboradores.sugestao-cadastro',
  origem: 'colaboradores',
  select: 'nome',
  forma: z.strictObject({ nome: z.string() }),
  ordem: ['id'],
})

export const LEITURA_SUGESTAO_MOVIMENTACOES = leituraDeRelacao({
  rotulo: 'colaboradores.sugestao-movimentacoes',
  origem: 'movimentacoes',
  select: 'colaborador',
  forma: z.strictObject({ colaborador: sn }),
  ordem: ['id'],
})

export const LEITURA_SUGESTAO_LANCAMENTOS = leituraDeRelacao({
  rotulo: 'colaboradores.sugestao-lancamentos',
  origem: 'lancamentos_item',
  select: 'colaborador',
  forma: z.strictObject({ colaborador: sn }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// lote 3 — `actions/colaboradores.ts::consolidarColaboradores`
// ---------------------------------------------------------------------------
// Mesma view de `LEITURA_FILA_CONSOLIDACAO`, com um recorte menor de colunas — a action só
// precisa da chave, da grafia a usar e da filial. `naoNulaNaView` reusa exatamente as mesmas
// entradas do mapa (`colunas-de-view.ts`) que a fila já usa.

export const LEITURA_GRUPOS_A_CONSOLIDAR = leituraDeRelacao({
  rotulo: 'colaboradores.grupos-a-consolidar',
  origem: 'v_colaboradores_textos',
  select: 'nome_chave, grafia_exemplo, filial_id, ja_cadastrado',
  forma: z.strictObject({
    nome_chave: naoNulaNaView('v_colaboradores_textos', 'nome_chave', z.string()),
    grafia_exemplo: naoNulaNaView('v_colaboradores_textos', 'grafia_exemplo', z.string()),
    filial_id: naoNulaNaView('v_colaboradores_textos', 'filial_id', z.number()),
    ja_cadastrado: naoNulaNaView('v_colaboradores_textos', 'ja_cadastrado', z.boolean()),
  }),
  ordem: ['nome_chave'],
})

