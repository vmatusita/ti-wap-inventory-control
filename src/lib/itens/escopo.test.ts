import { describe, expect, it } from 'vitest'
import {
  apoioDoRepor,
  cabecalhosComEscopo,
  escopoDosNumeros,
  fraseDoResumo,
  legendaDaTabela,
  ondeDoEscopo,
  rotuloDoEscopo,
  rotuloEstoqueDoRepor,
  type LegendaDeNumero,
} from '@/lib/itens/escopo'
import { NUMEROS_ITEM } from '@/lib/ajuda/conteudo/itens-por-quantidade'
import { efetivar, recorteDe, type RecorteDeLeitura } from '@/lib/auth/recorte-leitura'

// F57 — o recorte chega como `UnidadesEfetivas`; `TODAS` e `marcadas` são as duas formas de hoje.
const TODAS = efetivar(recorteDe(null), { familia: 'id', modo: 'todas' })
const marcadas = (ids: number[]) =>
  efetivar(recorteDe(null), { familia: 'id', modo: 'lista', ids })

// Filiais INVENTADAS (regra 2 do CLAUDE.md) — nenhuma das cinco da WAP.
const FILIAIS = [
  { id: 1, nome: 'Aurora' },
  { id: 3, nome: 'Cerrado Alto' },
  { id: 5, nome: 'Estância Velha do Norte' },
]

/** A frase que a fase existe para tirar da tela quando há recorte. */
const FRASE_DA_TI = 'tudo que a TI possui'
const FRASE_DA_TI_LONGA = 'Tudo que a TI possui'

describe('escopoDosNumeros — de quem são os números que a tela mostra', () => {
  it('sem recorte é "todas" — o modo `todas` das unidades, não "todas marcadas"', () => {
    expect(escopoDosNumeros(FILIAIS, TODAS)).toEqual({ tipo: 'todas' })
  })

  it('marcar TODAS as filiais à mão NÃO é o mesmo que não filtrar', () => {
    // Sem recorte a tela mostra o `consolidado` da RPC, que enxerga a filial
    // desativada com saldo; marcando as três, ela mostra a soma das três colunas.
    // São dois números diferentes, e a legenda tem de dizer qual está na tela.
    const todasMarcadas = escopoDosNumeros(
      FILIAIS,
      marcadas(FILIAIS.map((f) => f.id)),
    )
    expect(todasMarcadas.tipo).toBe('varias')
    expect(todasMarcadas).not.toEqual({ tipo: 'todas' })
  })

  it('uma filial marcada devolve o NOME dela', () => {
    expect(escopoDosNumeros(FILIAIS, marcadas([3]))).toEqual({ tipo: 'uma', nome: 'Cerrado Alto' })
  })

  it('duas ou mais devolvem os nomes na ordem do recorte', () => {
    expect(escopoDosNumeros(FILIAIS, marcadas([5, 1]))).toEqual({
      tipo: 'varias',
      nomes: ['Estância Velha do Norte', 'Aurora'],
    })
  })

  it('id de filial que não existe mais (URL antiga) não vira nome inventado', () => {
    expect(escopoDosNumeros(FILIAIS, marcadas([99]))).toEqual({ tipo: 'varias', nomes: [] })
    // …e com uma conhecida junto, sobra a conhecida — que é a verdade do recorte.
    expect(escopoDosNumeros(FILIAIS, marcadas([3, 99]))).toEqual({ tipo: 'uma', nome: 'Cerrado Alto' })
  })

  it('F57 — a interseção VAZIA não vira "todas": vira o plural genérico, sem nome', () => {
    // O fail-open da legenda: um recorte que não alcança a filial pedida esvaziava a lista, e a
    // lista vazia fazia a tela afirmar "todas as filiais" embaixo de um número que não é de nenhuma.
    const restrito: RecorteDeLeitura = {
      alcance: 'restrito',
      unidades: [{ id: 1, slug: 'aurora' }],
      alcancaSemUnidade: false,
    }
    const vazia = efetivar(restrito, { familia: 'id', modo: 'lista', ids: [3] })
    expect(escopoDosNumeros(FILIAIS, vazia)).toEqual({ tipo: 'varias', nomes: [] })
  })
})

describe('rotuloDoEscopo e fraseDoResumo — a linha acima dos cartões', () => {
  it('nomeia a filial quando é uma só', () => {
    expect(fraseDoResumo({ tipo: 'uma', nome: 'Cerrado Alto' })).toBe(
      'Números de Cerrado Alto',
    )
  })

  it('conta, em vez de listar, quando são várias', () => {
    expect(fraseDoResumo({ tipo: 'varias', nomes: ['Aurora', 'Dunas', 'Bonança'] })).toBe(
      'Números somados de 3 filiais',
    )
  })

  it('sem recorte diz "todas as filiais", e não fica em silêncio', () => {
    expect(fraseDoResumo({ tipo: 'todas' })).toBe('Números de todas as filiais')
  })

  it('recorte sem nome conhecido degrada para o plural genérico', () => {
    expect(rotuloDoEscopo({ tipo: 'varias', nomes: [] })).toBe('filiais filtradas')
  })

  // ⚠ O CAMINHO DEGRADADO TEM DE SAIR EM PORTUGUÊS, e este teste existe porque ele
  // não saía: `rotuloDoEscopo` devolvia "as filiais filtradas" COM artigo, e as
  // três frases que o compõem já trazem a preposição — o resultado era
  // "Números somados de AS filiais filtradas" e "nas AS filiais filtradas".
  // Testar o rótulo isolado não pega isso; só testar as frases COMPOSTAS pega.
  it('as três frases compostas saem em português, mesmo sem nome conhecido', () => {
    const escopo = { tipo: 'varias', nomes: [] } as const
    const frases = [
      fraseDoResumo(escopo),
      `estoque ${rotuloEstoqueDoRepor(escopo)}`,
      `o número é ${ondeDoEscopo(escopo)}`,
    ]
    for (const f of frases) {
      expect(f, f).not.toMatch(/\bde as\b/)
      expect(f, f).not.toMatch(/\bnas as\b/)
      expect(f, f).not.toMatch(/\bem as\b/)
    }
    expect(fraseDoResumo(escopo)).toBe('Números somados de filiais filtradas')
    expect(ondeDoEscopo(escopo)).toBe('nas filiais filtradas')
    expect(rotuloEstoqueDoRepor(escopo)).toBe('estoque somado de filiais filtradas')
  })

  // A mesma varredura, agora sobre TODOS os escopos plausíveis — é a rede que pega
  // um artigo duplicado que alguém acrescente amanhã em qualquer um dos rótulos.
  it('nenhuma frase composta duplica artigo, em nenhum escopo', () => {
    const escopos = [
      { tipo: 'todas' } as const,
      { tipo: 'uma', nome: 'Aurora' } as const,
      { tipo: 'varias', nomes: ['Aurora', 'Dunas'] } as const,
      { tipo: 'varias', nomes: [] } as const,
    ]
    for (const e of escopos) {
      const frases = [fraseDoResumo(e), rotuloEstoqueDoRepor(e), ondeDoEscopo(e)]
      for (const f of frases) {
        expect(f, `${e.tipo}: ${f}`).not.toMatch(/\b(de|em|nas?|das?) as\b/)
      }
    }
  })
})

describe('legendaDaTabela — a <caption>, que escreve os nomes por extenso', () => {
  const chaves = ['total', 'estoque', 'emUso', 'falta']

  it('nomeia as colunas a partir de NUMEROS_ITEM, e não de uma lista redigitada', () => {
    const texto = legendaDaTabela(NUMEROS_ITEM, { tipo: 'uma', nome: 'Cerrado Alto' }, chaves)
    expect(texto).toBe(
      'Total, Em estoque, Em uso e Falta são de Cerrado Alto.',
    )
    // A prova de que os rótulos vêm de lá: todos aparecem, com o texto de lá.
    for (const chave of chaves) {
      const rotulo = NUMEROS_ITEM.find((n) => n.chave === chave)!.rotulo
      expect(texto).toContain(rotulo)
    }
  })

  it('com várias filiais, LISTA os nomes — a caption tem largura para isso', () => {
    expect(
      legendaDaTabela(
        NUMEROS_ITEM,
        { tipo: 'varias', nomes: ['Aurora', 'Cerrado Alto', 'Estância Velha do Norte'] },
        chaves,
      ),
    ).toBe(
      'Total, Em estoque, Em uso e Falta somam 3 filiais: Aurora, Cerrado Alto e Estância Velha do Norte.',
    )
  })

  it('sem recorte, diz que são de todas — a tela nunca fica sem escopo declarado', () => {
    expect(legendaDaTabela(NUMEROS_ITEM, { tipo: 'todas' }, chaves)).toBe(
      'Total, Em estoque, Em uso e Falta são de todas as filiais.',
    )
  })

  it('acompanha as colunas VISÍVEIS: com duas, a frase cita duas', () => {
    expect(
      legendaDaTabela(NUMEROS_ITEM, { tipo: 'uma', nome: 'Aurora' }, ['estoque', 'emUso']),
    ).toBe('Em estoque e Em uso são de Aurora.')
  })

  it('chave desconhecida não vira frase quebrada', () => {
    expect(legendaDaTabela(NUMEROS_ITEM, { tipo: 'todas' }, ['naoExiste'])).toBe(
      'Os números desta tabela são de todas as filiais.',
    )
  })
})

describe('cabecalhosComEscopo — a legenda derivada, sem tocar em NUMEROS_ITEM', () => {
  it('sem recorte devolve a lista INTACTA, item a item', () => {
    const saida = cabecalhosComEscopo(NUMEROS_ITEM, { tipo: 'todas' })
    expect(saida).toEqual([...NUMEROS_ITEM])
  })

  it('NUNCA muta a lista de origem — NUMEROS_ITEM é fonte compartilhada com a ajuda', () => {
    const antes = JSON.stringify(NUMEROS_ITEM)
    cabecalhosComEscopo(NUMEROS_ITEM, { tipo: 'uma', nome: 'Cerrado Alto' })
    cabecalhosComEscopo(NUMEROS_ITEM, { tipo: 'varias', nomes: ['Aurora', 'Dunas'] })
    expect(JSON.stringify(NUMEROS_ITEM)).toBe(antes)
  })

  // ⚠ ESTE É O CRITÉRIO 1 DA FASE, em forma de teste: com recorte, NENHUMA frase
  // da legenda pode afirmar escopo de TI.
  it('com UMA filial, a frase "tudo que a TI possui" some de TODOS os campos', () => {
    const saida = cabecalhosComEscopo(NUMEROS_ITEM, { tipo: 'uma', nome: 'Cerrado Alto' })
    const tudo = JSON.stringify(saida)
    expect(tudo).not.toContain(FRASE_DA_TI)
    expect(tudo).not.toContain(FRASE_DA_TI_LONGA)
  })

  it('com VÁRIAS filiais, idem', () => {
    const saida = cabecalhosComEscopo(NUMEROS_ITEM, {
      tipo: 'varias',
      nomes: ['Aurora', 'Cerrado Alto'],
    })
    const tudo = JSON.stringify(saida)
    expect(tudo).not.toContain(FRASE_DA_TI)
    expect(tudo).not.toContain(FRASE_DA_TI_LONGA)
  })

  it('e a frase CONTINUA lá sem recorte — a ajuda descreve o significado sem filtro', () => {
    const saida = cabecalhosComEscopo(NUMEROS_ITEM, { tipo: 'todas' })
    expect(JSON.stringify(saida)).toContain(FRASE_DA_TI)
  })

  it('o `curto` de "total" nomeia a filial, e cabe no cabeçalho da coluna', () => {
    const uma = cabecalhosComEscopo(NUMEROS_ITEM, { tipo: 'uma', nome: 'Cerrado Alto' })
    const curto = uma.find((n) => n.chave === 'total')!.curto!
    expect(curto).toBe('tudo em Cerrado Alto')
    // O `curto` de hoje tem 20 caracteres e a coluna foi medida com ele; um apoio
    // muito mais comprido empurra a tabela e joga coluna para fora da tela em 390px.
    expect(curto.length).toBeLessThanOrEqual(28)
  })

  it('com várias, o `curto` de "total" conta as filiais', () => {
    const varias = cabecalhosComEscopo(NUMEROS_ITEM, {
      tipo: 'varias',
      nomes: ['Aurora', 'Cerrado Alto', 'Dunas'],
    })
    expect(varias.find((n) => n.chave === 'total')!.curto).toBe('tudo nas 3 filiais')
  })

  it('os OUTROS números mantêm rótulo e `curto` — só a explicação ganha o escopo', () => {
    const uma = cabecalhosComEscopo(NUMEROS_ITEM, { tipo: 'uma', nome: 'Aurora' })
    for (const chave of ['estoque', 'emUso', 'atrelados', 'falta']) {
      const antes = NUMEROS_ITEM.find((n) => n.chave === chave)!
      const depois = uma.find((n) => n.chave === chave)!
      expect(depois.rotulo).toBe(antes.rotulo)
      expect(depois.curto).toBe(antes.curto)
      expect(depois.explicacao).toContain(antes.explicacao)
      expect(depois.explicacao).toContain('só de Aurora')
    }
  })

  it('OS NOMES DOS CINCO NÚMEROS NÃO MUDAM, em nenhum escopo (decisão da F43)', () => {
    const escopos = [
      { tipo: 'todas' } as const,
      { tipo: 'uma', nome: 'Aurora' } as const,
      { tipo: 'varias', nomes: ['Aurora', 'Dunas'] } as const,
    ]
    for (const escopo of escopos) {
      const saida = cabecalhosComEscopo(NUMEROS_ITEM, escopo)
      expect(saida.map((n) => n.rotulo)).toEqual(NUMEROS_ITEM.map((n) => n.rotulo))
      expect(saida.map((n) => n.chave)).toEqual(NUMEROS_ITEM.map((n) => n.chave))
    }
  })

  it('funciona sobre uma lista qualquer, não só sobre NUMEROS_ITEM', () => {
    const inventada: LegendaDeNumero[] = [
      { chave: 'total', rotulo: 'Total', curto: 'x', explicacao: 'y' },
    ]
    const saida = cabecalhosComEscopo(inventada, { tipo: 'uma', nome: 'Dunas' })
    expect(saida[0].curto).toBe('tudo em Dunas')
  })
})

describe('rotuloEstoqueDoRepor — o lado visível da revisão de 23/07/2026', () => {
  it('sem recorte continua dizendo o que dizia até a v1.48.0', () => {
    expect(rotuloEstoqueDoRepor({ tipo: 'todas' })).toBe('estoque de todas as filiais')
  })

  it('com uma filial, NOMEIA o estoque que está na conta', () => {
    expect(rotuloEstoqueDoRepor({ tipo: 'uma', nome: 'Cerrado Alto' })).toBe(
      'estoque em Cerrado Alto',
    )
  })

  it('com várias, diz que é soma', () => {
    expect(
      rotuloEstoqueDoRepor({ tipo: 'varias', nomes: ['Aurora', 'Dunas', 'Bonança'] }),
    ).toBe('estoque somado de 3 filiais')
  })

  it('sob recorte, NUNCA afirma "todas as filiais" — era o defeito', () => {
    expect(rotuloEstoqueDoRepor({ tipo: 'uma', nome: 'Aurora' })).not.toContain('todas')
    expect(rotuloEstoqueDoRepor({ tipo: 'varias', nomes: ['A', 'B'] })).not.toContain('todas')
  })
})

// ---------------------------------------------------------------------------
// O APOIO DO CARTÃO *A repor* — a frase que estava dentro do componente
// ---------------------------------------------------------------------------
//
// ⚠ ESTES CASOS EXISTEM PORQUE UM DELES FALHAVA. Enquanto a frase era montada em
// `alarmes()` (`components/itens/resumo-de-itens.tsx`), nenhum teste a alcançava —
// este repositório não renderiza componente —, e a concordância seguia `aRepor` em
// vez do denominador: com UM item a repor numa lista de 44, a tela escrevia
// "de 44 **item** abaixo do mínimo".
describe('apoioDoRepor — o texto de apoio do cartão "A repor"', () => {
  it('com denominador, o substantivo concorda com o DENOMINADOR, não com a contagem', () => {
    expect(apoioDoRepor(1, 44, { tipo: 'todas' })).toBe('de 44 itens abaixo do mínimo')
    expect(apoioDoRepor(36, 44, { tipo: 'todas' })).toBe('de 44 itens abaixo do mínimo')
  })

  it('nunca escreve "de N item" — o defeito que a revisão da F44 pegou', () => {
    for (const aRepor of [1, 2, 43]) {
      const texto = apoioDoRepor(aRepor, 44, { tipo: 'uma', nome: 'Cerrado Alto' })
      expect(texto, texto).not.toMatch(/de 44 item/)
    }
  })

  it('sem denominador (todos acendem), concorda com a contagem do cartão', () => {
    expect(apoioDoRepor(1, 1, { tipo: 'todas' })).toBe('item abaixo do mínimo')
    expect(apoioDoRepor(44, 44, { tipo: 'todas' })).toBe('itens abaixo do mínimo')
  })

  it('herda o escopo, e é ele que diz de qual prateleira a tela está falando', () => {
    expect(apoioDoRepor(3, 44, { tipo: 'uma', nome: 'Cerrado Alto' })).toBe(
      'de 44 itens abaixo do mínimo em Cerrado Alto',
    )
    expect(apoioDoRepor(3, 44, { tipo: 'varias', nomes: ['Aurora', 'Dunas'] })).toBe(
      'de 44 itens abaixo do mínimo nas 2 filiais',
    )
  })

  it('sem recorte NÃO acrescenta lugar — "em todas as filiais" seria dizer o padrão', () => {
    expect(apoioDoRepor(3, 44, { tipo: 'todas' })).not.toContain('em todas')
  })

  it('separa milhar em pt-BR, como todo número desta tela', () => {
    expect(apoioDoRepor(2, 1200, { tipo: 'todas' })).toBe('de 1.200 itens abaixo do mínimo')
  })

  it('nenhum escopo duplica artigo na frase composta', () => {
    const escopos = [
      { tipo: 'todas' } as const,
      { tipo: 'uma', nome: 'Aurora' } as const,
      { tipo: 'varias', nomes: ['Aurora', 'Dunas'] } as const,
      { tipo: 'varias', nomes: [] } as const,
    ]
    for (const e of escopos) {
      const texto = apoioDoRepor(2, 44, e)
      expect(texto, texto).not.toMatch(/(de|em|nas?|das?) as/)
    }
  })
})
