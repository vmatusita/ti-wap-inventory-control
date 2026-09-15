import 'server-only'
import { z } from 'zod'
import { naoNulaNaView } from '@/lib/supabase/colunas-de-view'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

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
