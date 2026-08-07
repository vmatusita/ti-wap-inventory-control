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

  // Achado da revisão adversarial da F26 (defeito que vinha da F10): o `in`
  // enxerga as chaves HERDADAS de Object.prototype, então um sessionStorage
  // adulterado com `tipo: "toString"` passava por tipo válido e só estourava
  // depois, dentro de `CAMPOS_POR_TIPO[tipo].campos`.
  it('chave herdada de Object.prototype não passa por tipo nem por status', () => {
    for (const lixo of ['toString', 'constructor', 'hasOwnProperty', 'valueOf']) {
      const r = desserializarRascunho(
        bruto({ config: { tipo: lixo }, statusResultante: lixo }),
      )!
      expect(r.config.tipo).toBe('')
      expect(r.statusResultante).toBe('')
    }
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
      jaRegistrada: false,
      prefillColaborador: undefined,
    })
  })

  // Achado da SEGUNDA volta adversarial: o marcador "a outra metade já está no
  // banco" vivia só na montagem, e o rascunho carregava o `deixarParaDepois`
  // sem ele — restaurar numa URL limpa ressuscitava o laço do atalho.
  it('`jaRegistrada` viaja junto com o "deixar para depois"', () => {
    const r = desserializarRascunho(
      comContrapartida({
        contrapartida: { deixarParaDepois: true, jaRegistrada: true },
      }),
    )!
    expect(r.contrapartida!.deixarParaDepois).toBe(true)
    expect(r.contrapartida!.jaRegistrada).toBe(true)
  })

  it('`jaRegistrada` ausente (rascunho de antes) vira false, não undefined', () => {
    const r = desserializarRascunho(comContrapartida())!
    expect(r.contrapartida!.jaRegistrada).toBe(false)
  })

  it('`prefillColaborador` ausente fica undefined — o campo passa a ser do operador', () => {
    const r = desserializarRascunho(comContrapartida())!
    expect(r.contrapartida!.prefillColaborador).toBeUndefined()
  })

  it('`prefillColaborador` presente volta como está', () => {
    const r = desserializarRascunho(
      comContrapartida({ contrapartida: { prefillColaborador: 'Fulano da Silva' } }),
    )!
    expect(r.contrapartida!.prefillColaborador).toBe('Fulano da Silva')
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

// F28/MOV-11 — o snapshot que alimenta o banner "lote não registrado" (quais
// patrimônios, de que tipo, salvo quando). O requisito mais importante deste
// bloco é o PRIMEIRO teste, no mesmo molde da F26: um rascunho gravado ANTES
// desta fase (o `bruto()` de sempre, sem as três chaves) restaura sem erro.
describe('desserializarRascunho — o resumo do banner (F28/MOV-11)', () => {
  it('rascunho antigo sem as chaves novas restaura sem erro, campos vazios', () => {
    const r = desserializarRascunho(bruto())!
    expect(r).not.toBeNull()
    expect(r.ids).toEqual([ID1, ID2])
    expect(r.patrimonios).toEqual([])
    expect(r.tipo).toBe('')
    expect(r.salvoEm).toBe('')
  })

  it('snapshot completo (patrimônios, tipo e salvoEm) volta inteiro', () => {
    const r = desserializarRascunho(
      bruto({
        patrimonios: ['WAP0001234', 'WAP0001250', ''],
        tipo: 'saida',
        salvoEm: '2026-08-07T12:00:00.000Z',
      }),
    )!
    expect(r.patrimonios).toEqual(['WAP0001234', 'WAP0001250', ''])
    expect(r.tipo).toBe('saida')
    expect(r.salvoEm).toBe('2026-08-07T12:00:00.000Z')
  })

  it('lixo nos campos novos é saneado, sem derrubar o rascunho', () => {
    const r = desserializarRascunho(
      bruto({
        // Número dentro do array de patrimônios (sessionStorage adulterado) e
        // `salvoEm` que não é ISO: nenhum dos dois pode lançar — a validação
        // de formato de data é do RENDER (formatTempoRelativo), não daqui.
        patrimonios: ['WAP0001234', 42, null],
        salvoEm: 'ontem à noite',
      }),
    )!
    expect(r).not.toBeNull()
    expect(r.patrimonios).toEqual(['WAP0001234'])
    expect(r.salvoEm).toBe('ontem à noite')
  })
})
