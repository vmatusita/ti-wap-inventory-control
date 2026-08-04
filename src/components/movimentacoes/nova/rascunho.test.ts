import { describe, it, expect } from 'vitest'
import { desserializarRascunho } from '@/components/movimentacoes/nova/rascunho'
import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'

// Dados 100% ficticios (CLAUDE.md): ids sinteticos, "Fulano da Silva".
const ID1 = '123e4567-e89b-12d3-a456-426614174000'
const ID2 = '223e4567-e89b-12d3-a456-426614174000'

function bruto(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ids: [ID1, ID2],
    config: {
      data: '2026-07-22',
      tipo: 'saida',
      motivo: 'novo_colaborador',
      colaborador: 'Fulano da Silva',
      setor: 'TI',
      chamado: '123',
      termo: 'sim',
      termoData: '2026-07-22',
      observacao: 'obs',
      filialDestinoId: '2',
      itensFaltantes: ['mouse'],
    },
    statusResultante: 'em_estoque',
    passo: 2,
    ...over,
  })
}

describe('desserializarRascunho — entrada hostil vira estado utilizavel', () => {
  it('rascunho íntegro volta inteiro', () => {
    const r = desserializarRascunho(bruto())
    expect(r).not.toBeNull()
    expect(r!.ids).toEqual([ID1, ID2])
    expect(r!.passo).toBe(2)
    expect(r!.statusResultante).toBe('em_estoque')
    expect(r!.config.tipo).toBe('saida')
    expect(r!.config.colaborador).toBe('Fulano da Silva')
    expect(r!.config.itensFaltantes).toEqual(['mouse'])
  })

  it('null / JSON quebrado / não-objeto => null', () => {
    expect(desserializarRascunho(null)).toBeNull()
    expect(desserializarRascunho('')).toBeNull()
    expect(desserializarRascunho('{ isso não é json')).toBeNull()
    expect(desserializarRascunho('"texto"')).toBeNull()
    expect(desserializarRascunho('null')).toBeNull()
  })

  it('sem ids (ou só lixo em ids) => null — banner só faz sentido com lote', () => {
    expect(desserializarRascunho(bruto({ ids: [] }))).toBeNull()
    expect(desserializarRascunho(bruto({ ids: [1, null, ''] }))).toBeNull()
    expect(desserializarRascunho(JSON.stringify({ config: {} }))).toBeNull()
  })

  it('ids repetidos são deduplicados e o teto corta o excesso', () => {
    const muitos = Array.from(
      { length: MAX_LOTE_MOVIMENTACAO + 5 },
      (_, i) => `id-${i}`,
    )
    expect(desserializarRascunho(bruto({ ids: [ID1, ID1, ID2] }))!.ids).toEqual([
      ID1,
      ID2,
    ])
    expect(desserializarRascunho(bruto({ ids: muitos }))!.ids).toHaveLength(
      MAX_LOTE_MOVIMENTACAO,
    )
  })

  it('tipo/termo/status fora do vocabulário do domínio viram vazio', () => {
    const r = desserializarRascunho(
      bruto({
        config: { tipo: 'inventado', termo: 'talvez', colaborador: 'Fulano da Silva' },
        statusResultante: 'nao_existe',
      }),
    )!
    expect(r.config.tipo).toBe('')
    expect(r.config.termo).toBe('')
    expect(r.statusResultante).toBe('')
    expect(r.config.colaborador).toBe('Fulano da Silva')
  })

  it('config ausente ou com tipos errados cai no padrão, sem quebrar', () => {
    const r = desserializarRascunho(bruto({ config: undefined }))!
    expect(r.config.tipo).toBe('')
    expect(r.config.data).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r.config.itensFaltantes).toEqual([])

    const r2 = desserializarRascunho(
      bruto({ config: { motivo: 42, itensFaltantes: ['mouse', 7, null] } }),
    )!
    expect(r2.config.motivo).toBe('')
    expect(r2.config.itensFaltantes).toEqual(['mouse'])
  })

  it('passo fora de 1..3 (ou não numérico) volta para 1', () => {
    expect(desserializarRascunho(bruto({ passo: 9 }))!.passo).toBe(1)
    expect(desserializarRascunho(bruto({ passo: 0 }))!.passo).toBe(1)
    expect(desserializarRascunho(bruto({ passo: '2' }))!.passo).toBe(1)
    expect(desserializarRascunho(bruto({ passo: 3 }))!.passo).toBe(3)
  })
})

// F26 — a contrapartida do par troca/upgrade no storage. O requisito mais
// importante deste bloco é o PRIMEIRO teste: um rascunho gravado ANTES desta
// fase (que é exatamente o `bruto()` acima, sem a chave) restaura sem erro e
// sem apagar o lote do operador.
describe('desserializarRascunho — a contrapartida (F26)', () => {
  const ID3 = '323e4567-e89b-12d3-a456-426614174000'

  function comContrapartida(over: Record<string, unknown> = {}): string {
    // `contrapartida` sai do spread de topo e entra MESCLADA — senão o override
    // parcial de um campo apagaria os outros seis.
    const { contrapartida: cp, ...resto } = over
    return bruto({
      config: {
        tipo: 'devolucao',
        motivo: 'troca_upgrade',
        data: '2026-08-04',
        itensFaltantes: [],
      },
      ...resto,
      contrapartida: {
        ids: [ID3],
        colaborador: 'Fulano da Silva',
        setor: 'TI',
        termo: 'sim',
        termoData: '2026-08-04',
        itensFaltantes: [],
        deixarParaDepois: false,
        ...((cp ?? {}) as Record<string, unknown>),
      },
    })
  }

  it('RASCUNHO ANTIGO (sem a chave) restaura sem erro e sem contrapartida', () => {
    const r = desserializarRascunho(bruto())!
    expect(r).not.toBeNull()
    expect(r.ids).toEqual([ID1, ID2])
    expect(r.contrapartida).toBeUndefined()
  })

  it('rascunho NOVO devolve a contrapartida inteira', () => {
    const r = desserializarRascunho(comContrapartida())!
    expect(r.contrapartida).toEqual({
      ids: [ID3],
      colaborador: 'Fulano da Silva',
      setor: 'TI',
      termo: 'sim',
      termoData: '2026-08-04',
      itensFaltantes: [],
      deixarParaDepois: false,
    })
  })

  it('"deixar para depois" só é verdadeiro quando é o booleano true', () => {
    const r = desserializarRascunho(
      comContrapartida({ contrapartida: { deixarParaDepois: 'sim' } }),
    )!
    expect(r.contrapartida!.deixarParaDepois).toBe(false)
  })

  it('contrapartida não-objeto é ignorada (não derruba o rascunho)', () => {
    for (const lixo of ['texto', 42, null, ['a']]) {
      const r = desserializarRascunho(bruto({ contrapartida: lixo }))!
      expect(r).not.toBeNull()
      expect(r.ids).toEqual([ID1, ID2])
      if (Array.isArray(lixo)) {
        // Array é objeto: vira uma contrapartida vazia, nunca um estado inválido.
        expect(r.contrapartida!.ids).toEqual([])
      } else {
        expect(r.contrapartida).toBeUndefined()
      }
    }
  })

  it('termo fora do vocabulário e itens não-texto são saneados', () => {
    const r = desserializarRascunho(
      comContrapartida({
        contrapartida: { termo: 'talvez', itensFaltantes: ['mouse', 7, null] },
      }),
    )!
    expect(r.contrapartida!.termo).toBe('')
    expect(r.contrapartida!.itensFaltantes).toEqual(['mouse'])
  })

  it('o teto é o do LOTE INTEIRO: a contrapartida só leva o que sobra', () => {
    const principais = Array.from(
      { length: MAX_LOTE_MOVIMENTACAO - 2 },
      (_, i) => `p-${i}`,
    )
    const opostos = Array.from({ length: 10 }, (_, i) => `c-${i}`)
    const r = desserializarRascunho(
      comContrapartida({ ids: principais, contrapartida: { ids: opostos } }),
    )!
    expect(r.ids).toHaveLength(MAX_LOTE_MOVIMENTACAO - 2)
    expect(r.contrapartida!.ids).toEqual(['c-0', 'c-1'])
  })

  it('lote principal já no teto deixa a contrapartida sem ids', () => {
    const principais = Array.from(
      { length: MAX_LOTE_MOVIMENTACAO },
      (_, i) => `p-${i}`,
    )
    const r = desserializarRascunho(
      comContrapartida({ ids: principais, contrapartida: { ids: [ID3] } }),
    )!
    expect(r.contrapartida!.ids).toEqual([])
  })

  it('ids repetidos na contrapartida são deduplicados', () => {
    const r = desserializarRascunho(
      comContrapartida({ contrapartida: { ids: [ID3, ID3, '', 7] } }),
    )!
    expect(r.contrapartida!.ids).toEqual([ID3])
  })
})
