import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { chamarRpc } from '@/lib/supabase/rpc'

// A EMPRESA DE UMA FILIAL — de onde o TS tira o `p_empresa` das operações POR FILIAL (F67, 13/11/2026).
//
// Desde a F67 as destrutivas, a prévia, o import e a mesa recebem `p_empresa uuid` como 1º parâmetro, e o BANCO confere
// a empresa de novo (a filial, a linha, o alvo) — o TS só a declara (docs/PLAN-F67.md, decisão 13). Nas operações POR
// FILIAL (o reset de uma filial, a prévia dela, o forçar saldo, o import de startup) a empresa é a DA FILIAL, lida no
// servidor pela função do banco `empresa_da_filial` (0185) — `filiais` não é tabela do acervo, e a leitura não cita a
// coluna no TS. Nas operações sem filial (o "tudo", a linha do acervo, as contas, a mesa) a empresa é a legada EXPLÍCITA,
// `empresaDaOperacao()` (empresa-legada.ts), até a F70 trazer a empresa da sessão.

type Client = SupabaseClient<Database>

/** A empresa de uma filial (NULL se a filial não existe ou não é visível a quem pede). */
export async function empresaDaFilial(client: Client, filialId: number): Promise<string | null> {
  const { data, error } = await chamarRpc(client, 'empresa_da_filial', { p_filial: filialId })
  if (error) throw new Error(`Falha ao ler a empresa da filial: ${error.message}`)
  return typeof data === 'string' ? data : null
}

/**
 * As unidades (filiais) da MESMA empresa de uma filial — o recorte das leituras de identidade do acervo (a nota F66 da
 * ficha F67): o par de outra EMPRESA não é conflito nem impede cadastro (a identidade do ativo é por empresa, F65).
 * NULL se a filial não existe ou não é visível a quem pede.
 */
export async function unidadesDaMesmaEmpresa(client: Client, filialId: number): Promise<number[] | null> {
  const empresa = await empresaDaFilial(client, filialId)
  if (empresa === null) return null
  const { data, error } = await client.from('filiais').select('id').eq('empresa_id', empresa).order('id')
  if (error) throw new Error(`Falha ao ler as unidades da empresa: ${error.message}`)
  return (data ?? []).map((f) => f.id)
}
