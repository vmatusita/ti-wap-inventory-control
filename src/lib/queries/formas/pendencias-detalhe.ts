import 'server-only'
import { z } from 'zod'
import { naoNulaNaView } from '@/lib/supabase/colunas-de-view'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

// As formas das leituras de `queries/pendencias-detalhe.ts` (F58 · Frente C · lote 2).
//
// `v_fila_pendencias` é VIEW: o gerador tipa toda coluna como anulável. `id` e `ordem` o SQL
// garante não-nulos (`colunas-de-view.ts`, já declarados no mapa) — os dois casts que existiam
// aqui (`r.id as string`, `(r.ordem ?? r.id) as string`) supunham exatamente isso. As demais
// continuam anuláveis, como a view as entrega.

const s = z.string()
const sn = z.string().nullable()

export const LEITURA_FILA_PENDENCIAS = leituraDeRelacao({
  rotulo: 'pendencias-detalhe.fila',
  origem: 'v_fila_pendencias',
  select:
    'id, ordem, pendencia_item_id, item, patrimonio, categoria, filial, filial_nome, pendencia, colaborador_atual, setor_atual, marca, modelo, desde',
  forma: z.strictObject({
    id: naoNulaNaView('v_fila_pendencias', 'id', z.string()),
    ordem: naoNulaNaView('v_fila_pendencias', 'ordem', z.string()),
    pendencia_item_id: sn,
    item: sn,
    patrimonio: sn,
    categoria: ENUM.categoriaAtivo.nullable(),
    filial: sn,
    filial_nome: sn,
    pendencia: sn,
    colaborador_atual: sn,
    setor_atual: sn,
    marca: sn,
    modelo: sn,
    desde: sn,
  }),
  ordem: ['ordem'],
})

// F28/PND-01 — os ids/service tags do balde 'patrimonio' da página (`buscarServiceTags`).
export const LEITURA_SERVICE_TAGS_PENDENCIAS = leituraDeRelacao({
  rotulo: 'pendencias-detalhe.service-tags',
  origem: 'ativos',
  select: 'id, service_tag',
  forma: z.strictObject({ id: s, service_tag: sn }),
  ordem: ['id'],
})
