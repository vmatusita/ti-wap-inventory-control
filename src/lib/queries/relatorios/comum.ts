import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Infra compartilhada da camada de dados dos relatórios (OS-F3 3.6). Reúne o que
// todos os módulos de relatório usam: o client tipado já resolvido (RLS do
// operador OU client administrativo p/ sessão por senha — lib/auth/acesso.ts), a
// resolução de filial e os utilitários de leitura (paginação do PostgREST,
// "última mov por ativo", rótulo de modelo). Ver docs/DECISOES.md.

export type DbClient = SupabaseClient<Database>

export type Filial = { id: number; nome: string; slug: string }

export async function resolverFilialPorSlug(
  client: DbClient,
  slug: string,
): Promise<Filial | null> {
  const { data } = await client
    .from('filiais')
    .select('id, nome, slug')
    .eq('slug', slug)
    .maybeSingle()
  return data ?? null
}

// Rótulo de modelo a partir de marca+modelo (fonte única das listas do
// relatório). Vazio → "Sem modelo".
export function modeloDe(marca: string | null, modelo: string | null): string {
  return [marca, modelo].filter(Boolean).join(' ').trim() || 'Sem modelo'
}

// Paginação única do PostgREST (que corta selects em 1.000 linhas). Uma única
// constante de página e um teto único: o maior domínio hoje é "todos os ativos"
// (~1,2 mil) e "movimentações de um período"; 100 páginas dão ~80× de folga
// sobre o pior caso atual. O teto é só um cinto de segurança contra loop
// infinito — nenhuma consulta real chega perto. (Antes: 4 loops com tetos
// divergentes 20k/50k/100k; unificar em 100k só AMPLIA o menor, nunca trunca o
// que já passava.)
const PAGINA = 1000
const CAP_PAGINACAO = 100_000

export async function paginarTodos<Row>(
  rotuloErro: string,
  fazPagina: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Row[]> {
  const acc: Row[] = []
  for (let from = 0; from < CAP_PAGINACAO; from += PAGINA) {
    const { data, error } = await fazPagina(from, from + PAGINA - 1)
    if (error) throw new Error(`${rotuloErro}: ${error.message}`)
    const rows = (data ?? []) as Row[]
    acc.push(...rows)
    if (rows.length < PAGINA) break
  }
  return acc
}

// "Última movimentação por ativo": reduz linhas JÁ ordenadas (mais recente
// primeiro) a um Map ativo→primeiro valor visto. Fonte única do padrão que se
// repetia para chamado, envio e retorno de manutenção.
export function ultimoPorAtivo<T, V>(
  rows: T[],
  ativoDe: (r: T) => string,
  valorDe: (r: T) => V,
): Map<string, V> {
  const out = new Map<string, V>()
  for (const r of rows) {
    const id = ativoDe(r)
    if (!out.has(id)) out.set(id, valorDe(r))
  }
  return out
}
