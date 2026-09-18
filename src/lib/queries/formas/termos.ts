import 'server-only'
import { z } from 'zod'
import { ENUM } from '@/lib/supabase/enums'
import { leituraDeRelacao } from '@/lib/supabase/leitura'

// A forma da leitura de `queries/termos.ts` (F58 · Frente C · lote 2).
//
// `termos_gerados.tipo` é TEXTO com CHECK — a migration 0021 restringe a coluna aos mesmos 7 valores
// de `TERMO_TIPOS`. A amarração exige o tipo do select (`string`); o estreitamento para `TermoTipo` é
// feito à parte, por `ehTermoTipo` (guard puro já existente — nenhum `as`). Com o CHECK no banco, o
// guard só dispara se a lista do código e o CHECK divergirem, e aí lança, no molde de
// `vocabulario-import.ts`.
//
// `dados` é o jsonb com os `CamposTermo` do momento da geração, mais `data`. A forma de LEITURA não é
// o `camposTermoSchema` de ESCRITA: não impõe os tetos de tamanho (termo gravado antes de um teto
// mudar não pode derrubar a ficha do ativo) e é frouxa (chave de uma versão antiga passa). O que ela
// exige é objeto, e texto em cada campo conhecido quando presente. Até a revisão do lote 2 isto era
// `z.custom<CamposTermo>()` — sem predicado, o cast de antes com outra sintaxe
// (`sem-custom-sem-predicado.test.ts` reprova). `termos.test.ts` confere que as chaves acompanham o
// schema de escrita.
const texto = z.string().optional()

export const FORMA_DADOS_DO_TERMO = z.looseObject({
  colaborador: texto,
  marca: texto,
  modelo: texto,
  service_tag: texto,
  patrimonio: texto,
  chamado: texto,
  telefone: texto,
  imei: texto,
  pulsus: texto,
  obs: texto,
  descricao: texto,
  series: texto,
  patrimonios: texto,
  marcas_modelos: texto,
  outros_componentes: texto,
  acessorios: texto,
  observacao: texto,
  tecnico: texto,
  cidade: texto,
  data: texto,
})

const s = z.string()
const sn = z.string().nullable()

const TERMOS_COLS =
  'id, tipo, colaborador, arquivo_path, dados, movimentacao_ids, ativo_ids, created_at, atualizado_em'
const TERMOS_AUTOR_EMBED = 'autor:profiles!termos_gerados_gerado_por_fkey(nome)'

export const LEITURA_TERMOS_DO_ATIVO = leituraDeRelacao({
  rotulo: 'termos.do-ativo',
  origem: 'termos_gerados',
  select: `${TERMOS_COLS}, ${TERMOS_AUTOR_EMBED}`,
  forma: z.strictObject({
    id: s,
    tipo: s,
    colaborador: sn,
    arquivo_path: s,
    dados: FORMA_DADOS_DO_TERMO,
    movimentacao_ids: z.array(s),
    ativo_ids: z.array(s),
    created_at: s,
    atualizado_em: s,
    // `termos_gerados.gerado_por` é not null (tipo gerado: `string`, não `string | null`) →
    // embed NÃO-nulo.
    autor: z.strictObject({ nome: sn }),
  }),
  ordem: ['id'],
})

// ---------------------------------------------------------------------------
// lote 3 — `actions/termos.ts`
// ---------------------------------------------------------------------------

const n = z.number()

// `cidadesDasFiliais` — `filiais.nome`/`filiais.cidade` são not null (migration 0003).
export const LEITURA_CIDADES_DAS_FILIAIS = leituraDeRelacao({
  rotulo: 'termos.cidades-das-filiais',
  origem: 'filiais',
  select: 'id, nome, cidade',
  forma: z.strictObject({ id: n, nome: s, cidade: s }),
  ordem: ['id'],
})

// `prepararTermo` — as movimentações + o ativo/motivo do lote. Era um `select` montado por `+`
// (`MOV_SELECT`, categoria 2 — select não-literal); vira UM literal só, mesmo texto. O embed
// `ativo` sai NÃO-NULO (`movimentacoes.ativo_id` é not null, migration 0003 — o mesmo
// precedente de `FILIAL_EMBED`/`RESUMO_SELECT` em `formas/ativos.ts`); o tipo à mão de antes
// (`ativo: {…} | null`) supunha o mesmo par nulo do cast que existia aqui. `motivo_rel` segue
// NULÁVEL (`movimentacoes.motivo` é anulável).
export const MOV_SELECT_TERMO =
  'id, tipo, motivo, colaborador, chamado, itens_faltantes, snapshot_anterior, data, termo_data, ativo:ativos!movimentacoes_ativo_id_fkey(id, categoria, marca, modelo, service_tag, patrimonio, colaborador_atual, telefone, imei, pulsus, filial_id), motivo_rel:motivos!movimentacoes_motivo_fkey(rotulo)'

export const LEITURA_MOV_PARA_TERMO = leituraDeRelacao({
  rotulo: 'termos.mov-para-termo',
  origem: 'movimentacoes',
  select: MOV_SELECT_TERMO,
  forma: z.strictObject({
    id: s,
    tipo: ENUM.tipoMovimentacao,
    motivo: sn,
    colaborador: sn,
    chamado: sn,
    itens_faltantes: z.array(s).nullable(),
    snapshot_anterior: z.looseObject({ colaborador: sn.optional() }).nullable(),
    data: s,
    termo_data: sn,
    ativo: z.strictObject({
      id: s,
      categoria: ENUM.categoriaAtivo,
      marca: sn,
      modelo: sn,
      service_tag: sn,
      patrimonio: sn,
      colaborador_atual: sn,
      telefone: sn,
      imei: sn,
      pulsus: sn,
      filial_id: n,
    }),
    motivo_rel: z.strictObject({ rotulo: s }).nullable(),
  }),
  ordem: ['id'],
})

// `prepararTermo` — termos já salvos para exatamente este conjunto de movimentações (edição).
// `dados` reusa `FORMA_DADOS_DO_TERMO`; `tipo` continua `string` na forma (a coluna é texto com
// CHECK, migration 0021) — quem estreita para `TermoTipo` é a própria action, com `ehTermoTipo`.
export const LEITURA_TERMOS_EXISTENTES_DO_CONJUNTO = leituraDeRelacao({
  rotulo: 'termos.existentes-do-conjunto',
  origem: 'termos_gerados',
  select: 'tipo, dados',
  forma: z.strictObject({ tipo: s, dados: FORMA_DADOS_DO_TERMO }),
  ordem: ['id'],
})

// `urlTermo` — mesmo par (coluna texto + CHECK) de `LEITURA_TERMOS_DO_ATIVO`: `tipo` fica
// `string` na forma, estreitado por `ehTermoTipo` na action, como em `queries/termos.ts`.
export const LEITURA_URL_TERMO = leituraDeRelacao({
  rotulo: 'termos.url-termo',
  origem: 'termos_gerados',
  select: 'arquivo_path, tipo, colaborador, dados',
  forma: z.strictObject({
    arquivo_path: s,
    tipo: s,
    colaborador: sn,
    dados: FORMA_DADOS_DO_TERMO,
  }),
  ordem: ['id'],
})

// `confirmarAssinaturaLote` — os alvos do lote (para decidir quem ainda precisa ser
// confirmado). O `id` puro de quem o UPDATE tocou saía daqui também (`LEITURA_ATIVOS_ID`),
// até a reauditoria de 18/09/2026 (item U, 0149): a confirmação e a anotação viraram UMA
// RPC, `confirmar_assinatura_lote_com_anotacoes`, que devolve esses ids tipados pela porta.
export const LEITURA_ALVOS_ASSINATURA_LOTE = leituraDeRelacao({
  rotulo: 'termos.alvos-assinatura-lote',
  origem: 'ativos',
  select: 'id, filial_id, termo_assinado',
  forma: z.strictObject({ id: s, filial_id: n, termo_assinado: ENUM.termoStatus.nullable() }),
  ordem: ['id'],
})
