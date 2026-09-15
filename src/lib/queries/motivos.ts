import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { TipoMovimentacao } from '@/lib/dominio'
import { linhasDe } from '@/lib/supabase/linhas'
import { LEITURA_MOTIVOS_ATIVOS } from '@/lib/queries/formas/motivos'

export type Motivo = {
  codigo: string
  rotulo: string
  aplica_a: TipoMovimentacao[]
}

// Motivos ativos. `aplica_a` restringe em quais tipos de movimentacao cada
// motivo aparece (a UI filtra por isso). Ordenado por rotulo.
export async function listarMotivos(): Promise<Motivo[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('motivos')
    .select(LEITURA_MOTIVOS_ATIVOS.select)
    .eq('ativo', true)
    .order('rotulo', { ascending: true })

  if (error) throw new Error(`Falha ao listar motivos: ${error.message}`)
  return linhasDe(data, LEITURA_MOTIVOS_ATIVOS.forma, LEITURA_MOTIVOS_ATIVOS.rotulo)
}
