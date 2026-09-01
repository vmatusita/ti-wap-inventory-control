import { describe, expect, it } from 'vitest'

import {
  distribuicaoDoItem,
  resumoDaLista,
  rotulosCurtosDeFilial,
} from '@/lib/itens/distribuicao'
import type { LinhaDeItem, NumerosDoItem } from '@/lib/itens/lista'
import type { MinimosPorItem } from '@/lib/itens/repor'
// A MESMA função pura que `BadgeRepor` chama — é ela que prova que o cartão e o
// selo da linha contam a mesma coisa (critério 5 da F44).
import { precisaRepor } from '@/lib/validators/item'

// A DISTRIBUIÇÃO POR FILIAL (F43) — a aritmética que sustenta a coluna nova.
//
// O que estes testes protegem, e por que cada um existe:
//  · o rótulo curto NUNCA pode ficar ambíguo (duas filiais, o mesmo cabeçalho);
//  · a ordem das células é a de quem chama — se ela variar por linha, a coluna
//    de uma filial cai em lugares diferentes e a tabela deixa de comparar nada;
//  · a filial sem lançamento vira uma célula de ZEROS, e não um buraco — a coluna
//    mostra sempre um número (a distinção `0`/`—` custou uma dúvida por linha no
//    julgamento em contexto fresco e não pagava nada);
//  · o resumo soma o RECORTE e conta o "repor" pelo CONSOLIDADO. São duas
//    perguntas diferentes sobre a mesma linha, e trocá-las manda comprar o que
//    está sobrando na filial ao lado.

function numeros(p: Partial<NumerosDoItem> = {}): NumerosDoItem {
  return { total: 0, estoque: 0, atrelados: 0, falta: 0, ...p }
}

function linha(p: Partial<LinhaDeItem> = {}): LinhaDeItem {
  return {
    item_id: 1,
    item: 'Mouse sem fio',
    grupo: 'acessorio',
    ordem: 0,
    tipoRotulo: null,
    saldo: numeros(),
    consolidado: numeros(),
    porFilial: {},
    foraDasFiliais: 0,
    ...p,
  }
}

describe('o rótulo curto da filial', () => {
  it('devolve o nome inteiro quando ele já cabe no cabeçalho', () => {
    const r = rotulosCurtosDeFilial([
      { id: 1, nome: 'Aurora' },
      { id: 2, nome: 'Matriz' },
    ])
    expect(r).toEqual({ 1: 'Aurora', 2: 'Matriz' })
  })

  it('encurta para o primeiro pedaço o nome que não cabe', () => {
    const r = rotulosCurtosDeFilial([{ id: 5, nome: 'Estância Velha do Norte' }])
    expect(r[5]).toBe('Estância')
  })

  it('quebra também no hífen e na barra, não só no espaço', () => {
    const r = rotulosCurtosDeFilial([
      { id: 1, nome: 'Cerrado-Alto de Baixo' },
      { id: 2, nome: 'Litoral/Norte da Serra' },
    ])
    expect(r[1]).toBe('Cerrado')
    expect(r[2]).toBe('Litoral')
  })

  it('NÃO encurta quando duas filiais virariam o mesmo cabeçalho', () => {
    const r = rotulosCurtosDeFilial([
      { id: 1, nome: 'Serra do Norte Alto' },
      { id: 2, nome: 'Serra do Sul Profundo' },
    ])
    expect(r[1]).toBe('Serra do Norte Alto')
    expect(r[2]).toBe('Serra do Sul Profundo')
  })

  it('a colisão ignora acento e caixa — "Estância" e "estancia" colidem', () => {
    const r = rotulosCurtosDeFilial([
      { id: 1, nome: 'Estância Velha do Norte' },
      { id: 2, nome: 'estancia Nova do Sul' },
    ])
    expect(r[1]).toBe('Estância Velha do Norte')
    expect(r[2]).toBe('estancia Nova do Sul')
  })

  it('uma filial curta não impede a vizinha comprida de encurtar', () => {
    const r = rotulosCurtosDeFilial([
      { id: 1, nome: 'Dunas' },
      { id: 2, nome: 'Cerrado Alto do Vale' },
    ])
    expect(r).toEqual({ 1: 'Dunas', 2: 'Cerrado' })
  })

  it('aguenta lista vazia e nome só de espaço sem estourar', () => {
    expect(rotulosCurtosDeFilial([])).toEqual({})
    expect(rotulosCurtosDeFilial([{ id: 1, nome: '   ' }])[1]).toBe('')
  })
})

describe('a distribuição de um item entre as filiais', () => {
  const filiais = [
    { id: 1, nome: 'Aurora' },
    { id: 2, nome: 'Bonança' },
    { id: 3, nome: 'Dunas' },
  ]
  const rotulos = rotulosCurtosDeFilial(filiais)

  it('a filial sem lançamento nenhum vira uma célula de zeros, e não um buraco', () => {
    // A coluna mostra SEMPRE um número: para quem pergunta "de onde eu tiro um?",
    // "nunca teve" e "acabou" respondem a mesma coisa — dali, não.
    const l = linha({ porFilial: { 1: numeros({ total: 4, estoque: 0 }) } })
    const d = distribuicaoDoItem(l, filiais, rotulos)
    expect(d[1].numeros).toEqual({ total: 0, estoque: 0, atrelados: 0, falta: 0 })
    expect(d[1].emUso).toBe(0)
    expect(d[1].nome).toBe('Bonança')
  })

  it('respeita a ORDEM recebida, para a coluna cair sempre no mesmo lugar', () => {
    const l = linha({
      saldo: numeros({ total: 10, estoque: 10 }),
      porFilial: { 3: numeros({ total: 1, estoque: 1 }), 1: numeros({ total: 9, estoque: 9 }) },
    })
    const d = distribuicaoDoItem(l, filiais, rotulos)
    expect(d.map((c) => c.filialId)).toEqual([1, 2, 3])
  })

  it('deriva "em uso" da mesma fórmula da tabela (total + falta − estoque − reservado)', () => {
    const l = linha({
      saldo: numeros({ total: 12, estoque: 4 }),
      porFilial: { 1: numeros({ total: 12, estoque: 4, atrelados: 1 }) },
    })
    const d = distribuicaoDoItem(l, filiais, rotulos)
    expect(d[0].emUso).toBe(7)
  })

  it('usa o nome cheio como rótulo quando a filial não está no mapa', () => {
    const l = linha({ porFilial: {} })
    const d = distribuicaoDoItem(l, [{ id: 9, nome: 'Filial Sem Mapa' }], {})
    expect(d[0].rotulo).toBe('Filial Sem Mapa')
    expect(d[0].nome).toBe('Filial Sem Mapa')
  })
})


describe('o resumo da lista (os cartões do topo)', () => {
  it('soma os números do RECORTE, item a item', () => {
    const r = resumoDaLista(
      [
        linha({ item_id: 1, saldo: numeros({ total: 10, estoque: 6, atrelados: 1 }) }),
        linha({ item_id: 2, saldo: numeros({ total: 4, estoque: 4 }) }),
      ],
      {},
    )
    expect(r).toMatchObject({ itens: 2, total: 14, estoque: 10, atrelados: 1, emUso: 3 })
  })

  // ⚠ F44 — ESTES QUATRO CASOS MUDARAM DE RESPOSTA, e a mudança é uma REVISÃO
  // registrada, não um conserto. Até a v1.48.0 o cartão *A repor* contava pelo
  // CONSOLIDADO mesmo com filtro de filial (decisão de 23/07/2026, F12 · I5:
  // "julgar pelo recorte de uma filial mandaria comprar o que está sobrando na
  // filial ao lado"). O Johnny revogou essa parte em 01/09/2026: com filtro, o
  // aviso é da filial filtrada. Ver `docs/DECISOES.md`.
  it('conta "a repor" pelo RECORTE — a revisão de 01/09/2026', () => {
    // O recorte de UMA filial tem 0 na prateleira; as outras filiais têm 30.
    // ATÉ A v1.48.0 ISTO NÃO ALERTAVA. Agora alerta, e é o pedido: quem opera
    // Cerrado Alto quer saber que a prateleira DELE está vazia.
    const r = resumoDaLista(
      [
        linha({
          item_id: 7,
          saldo: numeros({ total: 0, estoque: 0 }),
          consolidado: numeros({ total: 30, estoque: 30 }),
        }),
      ],
      { 7: 10 },
    )
    expect(r.aRepor).toBe(1)
  })

  it('SEM recorte nada muda: `saldo === consolidado` e a conta é a de sempre', () => {
    const r = resumoDaLista(
      [
        // Sem filtro, `montarLinhasDeItem` põe o consolidado nos dois campos.
        linha({ item_id: 7, saldo: numeros({ estoque: 3 }), consolidado: numeros({ estoque: 3 }) }),
        linha({
          item_id: 8,
          saldo: numeros({ estoque: 30 }),
          consolidado: numeros({ estoque: 30 }),
        }),
      ],
      { 7: 10, 8: 10 },
    )
    expect(r.aRepor).toBe(1)
  })

  // ⚠ ESTE É O CRITÉRIO 5 DA F44: o cartão e o selo da linha NUNCA discordam.
  // Os dois passam pela MESMA função pura sobre o MESMO número.
  it('o cartão conta exatamente o que o selo da linha acende — mesma regra, mesmo número', () => {
    const linhas = [
      // recorte vazio, consolidado cheio → o selo acende (é do recorte)
      linha({ item_id: 1, saldo: numeros({ estoque: 0 }), consolidado: numeros({ estoque: 99 }) }),
      // recorte cheio, consolidado vazio → o selo NÃO acende
      linha({ item_id: 2, saldo: numeros({ estoque: 99 }), consolidado: numeros({ estoque: 0 }) }),
    ]
    // ⚠ TIPADO, e não inferido: sem a anotação o literal vira `{ 1: number; 2: number }`
    // e o `minimos[l.item_id]` de duas linhas abaixo é um erro de índice sob
    // `strict` — que `npm run build` e `npm run lint` não pegam (o build só
    // typecheca o grafo do app), só `tsc --noEmit`.
    const minimos: MinimosPorItem = { 1: 10, 2: 10 }
    const r = resumoDaLista(linhas, minimos)
    // O que o SELO faria, item a item — a mesma conta que `BadgeRepor` faz.
    const selosAcesos = linhas.filter((l) => precisaRepor(l.saldo.estoque, minimos[l.item_id]))
    expect(r.aRepor).toBe(selosAcesos.length)
    expect(r.aRepor).toBe(1)
  })

  it('mínimo ausente (item desativado com saldo) nunca alerta', () => {
    const r = resumoDaLista([linha({ item_id: 9, saldo: numeros({ estoque: 0 }) })], {})
    expect(r.aRepor).toBe(0)
  })

  it('estoque IGUAL ao mínimo não repõe — o mínimo é piso, não gatilho', () => {
    const r = resumoDaLista([linha({ item_id: 3, saldo: numeros({ estoque: 5 }) })], { 3: 5 })
    expect(r.aRepor).toBe(0)
  })

  it('conta os itens com déficit e soma o déficit', () => {
    const r = resumoDaLista(
      [
        linha({ item_id: 1, saldo: numeros({ total: 4, falta: 2 }) }),
        linha({ item_id: 2, saldo: numeros({ total: 4 }) }),
      ],
      {},
    )
    expect(r.comFalta).toBe(1)
    expect(r.falta).toBe(2)
  })

  it('lista vazia devolve tudo em zero, e não NaN', () => {
    const r = resumoDaLista([], {})
    expect(r).toEqual({
      itens: 0,
      total: 0,
      estoque: 0,
      emUso: 0,
      atrelados: 0,
      falta: 0,
      aRepor: 0,
      comFalta: 0,
    })
  })
})
