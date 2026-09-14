import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { recusarFilialInexistente, valoresInexistentes } from '@/lib/unidades/pertinencia'
import type { Database } from '@/lib/types/database'

// F57 · Frente F — a recusa de filial inexistente, sem banco. Filiais 100% fictícias:
// ativas alfa(1) bravo(2) charlie(3) delta(4); desativada extinta(5).

const FILIAIS = [
  { id: 1, slug: 'alfa', ativo: true },
  { id: 2, slug: 'bravo', ativo: true },
  { id: 3, slug: 'charlie', ativo: true },
  { id: 4, slug: 'delta', ativo: true },
  { id: 5, slug: 'extinta', ativo: false },
]

function clienteDasFiliais(): { client: SupabaseClient<Database>; consultas: number } {
  const estado = { consultas: 0 }
  function from(tabela: string) {
    if (tabela !== 'filiais') throw new Error(`tabela inesperada: ${tabela}`)
    estado.consultas++
    const filtros: { coluna: string; valores: unknown[] }[] = []
    const builder: unknown = new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === 'then') {
            return (resolver: (v: unknown) => void) =>
              resolver({
                data: FILIAIS.filter((f) =>
                  filtros.every(({ coluna, valores }) =>
                    valores.includes(f[coluna as 'id' | 'slug']),
                  ),
                ),
                error: null,
              })
          }
          return (coluna: string, valores: unknown[]) => {
            if (prop === 'in') filtros.push({ coluna, valores })
            return builder
          }
        },
      },
    )
    return builder
  }
  return {
    client: { from } as unknown as SupabaseClient<Database>,
    get consultas() {
      return estado.consultas
    },
  }
}

// `notFound()` do Next lança um erro com `digest` de 404 — é o que a rota propaga.
async function desfecho(
  param: string | undefined,
  familia: 'id' | 'slug',
  opcoes?: { aceitaConsolidado?: boolean },
): Promise<{ resposta: 'abre' | '404'; consultas: number }> {
  const c = clienteDasFiliais()
  try {
    await recusarFilialInexistente(c.client, param, familia, opcoes)
    return { resposta: 'abre', consultas: c.consultas }
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? ''
    if (digest.includes('404')) return { resposta: '404', consultas: c.consultas }
    throw e
  }
}

describe('valoresInexistentes — a conta pura', () => {
  it('devolve o que foi pedido e não existe, na ordem do pedido', () => {
    expect(valoresInexistentes([2, 9999, 4, 77], [1, 2, 3, 4])).toEqual([9999, 77])
    expect(valoresInexistentes(['bravo'], ['bravo'])).toEqual([])
  })
})

describe('recusarFilialInexistente — família por ID', () => {
  it('filial que existe abre', async () => {
    expect(await desfecho('2', 'id')).toEqual({ resposta: 'abre', consultas: 1 })
    expect(await desfecho('1,4', 'id')).toEqual({ resposta: 'abre', consultas: 1 })
  })

  it('filial que NÃO existe responde 404 — sozinha ou no meio de uma lista', async () => {
    expect((await desfecho('9999', 'id')).resposta).toBe('404')
    expect((await desfecho('2,9999', 'id')).resposta).toBe('404')
  })

  it('filial DESATIVADA existe: abre (o link antigo não muda de sentido)', async () => {
    expect((await desfecho('5', 'id')).resposta).toBe('abre')
  })

  it('sem parâmetro, `todas` e lixo não consultam nada — o parser já os ignora', async () => {
    for (const param of [undefined, '', 'todas', 'abc', '99999', '0,-1']) {
      expect(await desfecho(param, 'id'), String(param)).toEqual({ resposta: 'abre', consultas: 0 })
    }
  })
})

describe('recusarFilialInexistente — família por SLUG', () => {
  it('slug que existe abre; o de filial desativada também', async () => {
    expect((await desfecho('bravo', 'slug')).resposta).toBe('abre')
    expect((await desfecho('extinta', 'slug')).resposta).toBe('abre')
  })

  it('slug que não existe responde 404', async () => {
    expect((await desfecho('fantasma', 'slug')).resposta).toBe('404')
    expect((await desfecho('bravo,fantasma', 'slug')).resposta).toBe('404')
  })

  it('o slug do Consolidado só passa onde a rota o aceita', async () => {
    expect(await desfecho('geral', 'slug', { aceitaConsolidado: true })).toEqual({
      resposta: 'abre',
      consultas: 0,
    })
    expect((await desfecho('geral,bravo', 'slug', { aceitaConsolidado: true })).resposta).toBe('abre')
    // Em /pendencias `geral` não é filial nenhuma.
    expect((await desfecho('geral', 'slug')).resposta).toBe('404')
  })

  it('slug fora do formato é lixo: ignorado, sem consulta', async () => {
    expect(await desfecho('NÃO VALE', 'slug')).toEqual({ resposta: 'abre', consultas: 0 })
  })
})
