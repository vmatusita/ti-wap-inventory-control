import 'server-only'
import type { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { ehTermoTipo, type TermoTipo } from '@/lib/termos/tipos'
import type { CamposTermo } from '@/lib/validators/termo'
import { linhasDe } from '@/lib/supabase/linhas'
import { LEITURA_TERMOS_DO_ATIVO } from '@/lib/queries/formas/termos'

// Um termo já gerado, para o histórico na ficha do ativo (F5A §5).
export type TermoGerado = {
  id: string
  tipo: TermoTipo
  colaborador: string | null
  arquivo_path: string
  dados: CamposTermo & { data?: string }
  movimentacao_ids: string[]
  ativo_ids: string[]
  created_at: string
  atualizado_em: string
  gerado_por_nome: string | null
}

// F58: o select e a forma moram em `queries/formas/termos.ts` (LEITURA_TERMOS_DO_ATIVO), como
// LITERAL — era montado por `+` (select não-literal). `tipo` vem `string` da forma (a coluna é
// texto com CHECK dos 7 valores, migration 0021) e é estreitado aqui por `ehTermoTipo`, o guard puro
// que já existia: fora do domínio só acontece se `TERMO_TIPOS` e o CHECK divergirem — falha de
// integridade, e lança, como `vocabulario-import.ts` faz para o mesmo caso.
function mapRow(r: z.infer<typeof LEITURA_TERMOS_DO_ATIVO.forma>): TermoGerado {
  if (!ehTermoTipo(r.tipo)) {
    throw new Error(`Termo com tipo fora do domínio esperado: "${r.tipo}" (id ${r.id}).`)
  }
  return {
    id: r.id,
    tipo: r.tipo,
    colaborador: r.colaborador,
    arquivo_path: r.arquivo_path,
    dados: r.dados,
    movimentacao_ids: r.movimentacao_ids,
    ativo_ids: r.ativo_ids,
    created_at: r.created_at,
    atualizado_em: r.atualizado_em,
    gerado_por_nome: r.autor.nome,
  }
}

// Termos que incluem este ativo (responsabilidade dele ou devolução em lote que o
// contém). Mais recente no topo.
export async function listarTermosDoAtivo(ativoId: string): Promise<TermoGerado[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('termos_gerados')
    .select(LEITURA_TERMOS_DO_ATIVO.select)
    .contains('ativo_ids', [ativoId])
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Falha ao carregar termos: ${error.message}`)
  return linhasDe(data, LEITURA_TERMOS_DO_ATIVO.forma, LEITURA_TERMOS_DO_ATIVO.rotulo).map(mapRow)
}
