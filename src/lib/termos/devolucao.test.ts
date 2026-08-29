import { describe, it, expect } from 'vitest'
import {
  ordenarEquipamentos,
  concatenarEquipamentos,
  descricaoDevolucao,
  observacaoSugestao,
  type EquipamentoDevolucao,
} from '@/lib/termos/devolucao'

function eq(p: Partial<EquipamentoDevolucao> & { categoria: EquipamentoDevolucao['categoria']; patrimonio: string | null }): EquipamentoDevolucao {
  return { service_tag: null, marca: null, modelo: null, ...p }
}

describe('ordenarEquipamentos', () => {
  it('ordena por categoria (notebook→monitor→celular→…) e desempata por patrimônio', () => {
    const itens = [
      eq({ categoria: 'celular', patrimonio: 'WAP0000002' }),
      eq({ categoria: 'notebook', patrimonio: 'WAP0000009' }),
      eq({ categoria: 'notebook', patrimonio: 'WAP0000001' }),
      eq({ categoria: 'monitor', patrimonio: 'WAP0000005' }),
    ]
    expect(ordenarEquipamentos(itens).map((i) => i.patrimonio)).toEqual([
      'WAP0000001',
      'WAP0000009',
      'WAP0000005',
      'WAP0000002',
    ])
  })

  it('não muta o array original', () => {
    const itens = [
      eq({ categoria: 'celular', patrimonio: 'B' }),
      eq({ categoria: 'notebook', patrimonio: 'A' }),
    ]
    const copia = [...itens]
    ordenarEquipamentos(itens)
    expect(itens).toEqual(copia)
  })

  it('patrimônio nulo (F7E — sem plaqueta) ordena por último no empate de categoria', () => {
    const itens = [
      eq({ categoria: 'notebook', patrimonio: null }),
      eq({ categoria: 'notebook', patrimonio: 'WAP0000002' }),
      eq({ categoria: 'notebook', patrimonio: 'WAP0000001' }),
    ]
    expect(ordenarEquipamentos(itens).map((i) => i.patrimonio)).toEqual([
      'WAP0000001',
      'WAP0000002',
      null,
    ])
  })

  it('a categoria ainda manda: nulo de categoria anterior vem antes de patrimônio de categoria posterior', () => {
    const itens = [
      eq({ categoria: 'celular', patrimonio: 'WAP0000009' }),
      eq({ categoria: 'notebook', patrimonio: null }),
    ]
    expect(ordenarEquipamentos(itens).map((i) => i.categoria)).toEqual([
      'notebook',
      'celular',
    ])
  })
})

describe('concatenarEquipamentos', () => {
  it('concatena posicionalmente as três colunas', () => {
    const r = concatenarEquipamentos([
      eq({ categoria: 'notebook', patrimonio: 'P1', service_tag: 'ST1', marca: 'Dell', modelo: 'X' }),
      eq({ categoria: 'monitor', patrimonio: 'P2', service_tag: null, marca: 'HP', modelo: null }),
    ])
    expect(r.series).toBe('ST1, ')
    expect(r.patrimonios).toBe('P1, P2')
    expect(r.marcas_modelos).toBe('Dell X / HP')
  })

  it('patrimônio nulo (F7E) imprime "sem patrimônio" no lugar do número', () => {
    const r = concatenarEquipamentos([
      eq({ categoria: 'notebook', patrimonio: 'P1', service_tag: 'ST1' }),
      eq({ categoria: 'monitor', patrimonio: null, service_tag: 'ST2' }),
    ])
    expect(r.patrimonios).toBe('P1, sem patrimônio')
    expect(r.series).toBe('ST1, ST2')
  })
})

describe('descricaoDevolucao', () => {
  it('mapeia motivos conhecidos para a descrição em caixa alta', () => {
    expect(descricaoDevolucao('desligamento')).toBe('DESLIGAMENTO')
    expect(descricaoDevolucao('troca_upgrade')).toBe('TROCA/UPGRADE')
  })

  it('deixa "outro" em branco para o operador digitar', () => {
    expect(descricaoDevolucao('outro')).toBe('')
  })

  it('usa o rótulo em caixa alta quando o código não está no mapa', () => {
    expect(descricaoDevolucao(null, 'Algum Motivo')).toBe('ALGUM MOTIVO')
    expect(descricaoDevolucao('desconhecido', 'Custom')).toBe('CUSTOM')
  })

  it('devolve string vazia quando não há código nem rótulo', () => {
    expect(descricaoDevolucao(null, null)).toBe('')
  })
})

describe('observacaoSugestao', () => {
  // F39 — o vocabulário deixou de morar numa constante do código e passou a vir do
  // catálogo `tipos_item` (F37), por parâmetro. Os RÓTULOS ESPERADOS SÃO OS MESMOS:
  // a migration 0114 semeou os 7 slugs históricos com exatamente os rótulos da
  // constante que saiu. Mudou a assinatura, não o texto do papel.
  const ROTULOS = {
    carregador: 'Carregador',
    mochila: 'Mochila',
    mouse: 'Mouse',
    teclado: 'Teclado',
    mousepad: 'Mousepad',
    fone: 'Fone de ouvido',
    cabo: 'Cabo',
  }

  it('lista acessórios faltantes, deduplicando e rotulando', () => {
    expect(observacaoSugestao(['mouse', 'mouse', 'teclado'], ROTULOS)).toBe(
      'Não devolvido(s): Mouse, Teclado',
    )
  })

  it('ignora vazios e devolve string vazia quando nada falta', () => {
    expect(observacaoSugestao(['', 'cabo'], ROTULOS)).toBe('Não devolvido(s): Cabo')
    expect(observacaoSugestao([], ROTULOS)).toBe('')
  })

  it('os SETE slugs históricos saem com os rótulos de sempre', () => {
    // A régua da §E: nenhum rótulo que o operador vê hoje pode mudar. Este é o
    // teste que a prova, slug a slug.
    expect(
      observacaoSugestao(
        ['carregador', 'mochila', 'mouse', 'teclado', 'mousepad', 'fone', 'cabo'],
        ROTULOS,
      ),
    ).toBe(
      'Não devolvido(s): Carregador, Mochila, Mouse, Teclado, Mousepad, Fone de ouvido, Cabo',
    )
  })

  it('slug SEM tipo no catálogo continua legível (o mesmo `?? codigo` de antes)', () => {
    // `movimentacoes.itens_faltantes` guarda texto livre, sem FK: um slug gravado
    // antes de `tipos_item` existir tem de aparecer como está, nunca sumir.
    expect(observacaoSugestao(['mouse', 'suporte_notebook'], ROTULOS)).toBe(
      'Não devolvido(s): Mouse, suporte_notebook',
    )
  })

  it('mapa VAZIO cai inteiro no slug cru, sem quebrar', () => {
    expect(observacaoSugestao(['mouse'], {})).toBe('Não devolvido(s): mouse')
  })
})
