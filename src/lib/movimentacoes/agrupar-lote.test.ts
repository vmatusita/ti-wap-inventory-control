import { describe, it, expect } from 'vitest'
import { inicioDeLote, type LinhaParaAgrupar } from '@/lib/movimentacoes/agrupar-lote'

// Dados 100% fictícios (CLAUDE.md): "Fulano"/"Ciclana", timestamps sintéticos.
function linha(over: Partial<LinhaParaAgrupar> & { id: string }): LinhaParaAgrupar {
  return {
    created_at: '2026-08-07T15:30:10.000Z',
    autor_nome: 'Fulano da Silva',
    ...over,
  }
}

describe('inicioDeLote — separador visual entre lotes', () => {
  it('a primeira linha da página nunca marca', () => {
    const linhas = [linha({ id: '1' })]
    expect(inicioDeLote(linhas)).toEqual(new Set())
  })

  it('mesmo autor + mesmo minuto: um lote só, nenhum separador depois da 1ª', () => {
    const linhas = [
      linha({ id: '1', created_at: '2026-08-07T15:30:05.000Z' }),
      linha({ id: '2', created_at: '2026-08-07T15:30:40.000Z' }),
      linha({ id: '3', created_at: '2026-08-07T15:30:59.000Z' }),
    ]
    expect(inicioDeLote(linhas)).toEqual(new Set())
  })

  it('mesmo autor, minuto seguinte: separador na linha que muda de minuto', () => {
    const linhas = [
      linha({ id: '1', created_at: '2026-08-07T15:30:59.000Z' }),
      linha({ id: '2', created_at: '2026-08-07T15:31:00.000Z' }),
    ]
    expect(inicioDeLote(linhas)).toEqual(new Set(['2']))
  })

  it('mesmo minuto, autor diferente: separador na linha que troca de autor', () => {
    const linhas = [
      linha({ id: '1', autor_nome: 'Fulano da Silva' }),
      linha({ id: '2', autor_nome: 'Ciclana Souza' }),
    ]
    expect(inicioDeLote(linhas)).toEqual(new Set(['2']))
  })

  it('três lotes intercalados: cada troca de autor OU minuto marca a linha seguinte', () => {
    const linhas = [
      linha({ id: '1', autor_nome: 'Fulano', created_at: '2026-08-07T15:30:00.000Z' }),
      linha({ id: '2', autor_nome: 'Fulano', created_at: '2026-08-07T15:30:20.000Z' }),
      linha({ id: '3', autor_nome: 'Ciclana', created_at: '2026-08-07T15:30:20.000Z' }),
      linha({ id: '4', autor_nome: 'Ciclana', created_at: '2026-08-07T15:31:00.000Z' }),
      linha({ id: '5', autor_nome: 'Fulano', created_at: '2026-08-07T15:31:00.000Z' }),
    ]
    expect(inicioDeLote(linhas)).toEqual(new Set(['3', '4', '5']))
  })

  it('vira o dia (UTC) no meio de um lote: minuto muda, então separa — não é a exceção', () => {
    const linhas = [
      linha({ id: '1', created_at: '2026-08-06T23:59:50.000Z' }),
      linha({ id: '2', created_at: '2026-08-07T00:00:05.000Z' }),
    ]
    expect(inicioDeLote(linhas)).toEqual(new Set(['2']))
  })

  it('formato de entrada com/sem milissegundos ou offset +00:00 não muda o resultado', () => {
    const linhas = [
      linha({ id: '1', created_at: '2026-08-07T15:30:05+00:00' }),
      linha({ id: '2', created_at: '2026-08-07T15:30:40.123Z' }),
    ]
    expect(inicioDeLote(linhas)).toEqual(new Set())
  })

  it('autor nulo (histórico legado) é tratado como um valor de autor próprio', () => {
    const linhas = [
      linha({ id: '1', autor_nome: null }),
      linha({ id: '2', autor_nome: null }),
      linha({ id: '3', autor_nome: 'Fulano' }),
    ]
    expect(inicioDeLote(linhas)).toEqual(new Set(['3']))
  })

  it('lista vazia devolve conjunto vazio', () => {
    expect(inicioDeLote([])).toEqual(new Set())
  })
})
