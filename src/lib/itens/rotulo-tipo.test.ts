import { describe, expect, it } from 'vitest'
import { mapaRotulosTipo, rotuloTipoItem } from '@/lib/itens/rotulo-tipo'

// F39 · §E — o rótulo do tipo de item, agora derivado do catálogo `tipos_item`.
//
// A RÉGUA DESTA FRENTE: nenhum rótulo que o operador vê hoje pode mudar. Estes
// testes provam o comportamento que a função antiga de rótulo tinha, slug a slug — os
// mesmos sete literais que a 0114 semeou e que o histórico em produção cita.

// O catálogo como ele sai do banco (os 7 do seed, mais um desativado).
const CATALOGO = [
  { slug: 'carregador', rotulo: 'Carregador' },
  { slug: 'mochila', rotulo: 'Mochila' },
  { slug: 'mouse', rotulo: 'Mouse' },
  { slug: 'teclado', rotulo: 'Teclado' },
  { slug: 'mousepad', rotulo: 'Mousepad' },
  { slug: 'fone', rotulo: 'Fone de ouvido' },
  { slug: 'cabo', rotulo: 'Cabo' },
  // Desativado no admin. Ele CONTINUA no mapa: quem exibe passado carrega
  // `listarTiposItem()` (todos), e o histórico que o cita tem de sair legível.
  { slug: 'adaptador', rotulo: 'Adaptador' },
]

describe('mapaRotulosTipo', () => {
  it('constrói o mapa slug → rótulo', () => {
    const mapa = mapaRotulosTipo(CATALOGO)
    expect(mapa.mouse).toBe('Mouse')
    expect(mapa.fone).toBe('Fone de ouvido')
  })

  it('catálogo vazio devolve mapa vazio, sem quebrar', () => {
    expect(mapaRotulosTipo([])).toEqual({})
  })

  it('o último slug repetido vence (não deveria ocorrer — `slug` é único no banco)', () => {
    const mapa = mapaRotulosTipo([
      { slug: 'mouse', rotulo: 'Mouse' },
      { slug: 'mouse', rotulo: 'Mouse sem fio' },
    ])
    expect(mapa.mouse).toBe('Mouse sem fio')
  })
})

describe('rotuloTipoItem', () => {
  const mapa = mapaRotulosTipo(CATALOGO)

  it.each([
    ['carregador', 'Carregador'],
    ['mochila', 'Mochila'],
    ['mouse', 'Mouse'],
    ['teclado', 'Teclado'],
    ['mousepad', 'Mousepad'],
    ['fone', 'Fone de ouvido'],
    ['cabo', 'Cabo'],
  ])('o slug histórico %s continua exibindo "%s"', (slug, rotulo) => {
    expect(rotuloTipoItem(slug, mapa)).toBe(rotulo)
  })

  it('tipo DESATIVADO no catálogo continua com rótulo (o histórico é fato)', () => {
    expect(rotuloTipoItem('adaptador', mapa)).toBe('Adaptador')
  })

  it('slug DESCONHECIDO cai no próprio slug — o mesmo `?? codigo` de antes', () => {
    // `movimentacoes.itens_faltantes` e `pendencias_item.item` guardam texto livre,
    // sem FK: um slug gravado antes de `tipos_item` existir precisa aparecer como
    // está, nunca sumir da tela.
    expect(rotuloTipoItem('inexistente', mapa)).toBe('inexistente')
    expect(rotuloTipoItem('suporte_notebook', mapa)).toBe('suporte_notebook')
  })

  it('mapa VAZIO faz todo slug cair no próprio slug', () => {
    expect(rotuloTipoItem('mouse', {})).toBe('mouse')
  })

  it('string vazia devolve string vazia (não inventa rótulo)', () => {
    expect(rotuloTipoItem('', mapa)).toBe('')
  })

  it('não herda propriedade de Object.prototype como se fosse rótulo', () => {
    // Um `Record` comum devolveria a função `toString` para o slug "toString".
    // O mapa é montado a partir do banco, mas o slug vem de coluna de texto livre.
    expect(typeof rotuloTipoItem('toString', mapa)).toBe('string')
    expect(rotuloTipoItem('toString', mapa)).toBe('toString')
  })
})
