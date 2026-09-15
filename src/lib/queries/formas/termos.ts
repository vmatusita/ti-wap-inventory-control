import 'server-only'
import { z } from 'zod'
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
