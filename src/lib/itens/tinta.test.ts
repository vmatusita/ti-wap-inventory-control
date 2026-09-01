import { describe, expect, it } from 'vitest'
import { TINTA_DO_NUMERO, tintaDoNumero } from '@/lib/itens/tinta'
import { NUMEROS_ITEM } from '@/lib/ajuda/conteudo/itens-por-quantidade'
import { STATUS_META } from '@/lib/dominio'

// A regex da catraca de `src/lib/dominio/cores.test.ts` — a mesma, de propósito:
// se ela mudar lá, este teste tem de continuar medindo a mesma coisa.
const PALETA_DO_TAILWIND =
  /\b(bg|text|border|ring|fill|stroke)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900|950)\b/

describe('TINTA_DO_NUMERO — uma cor por número, na língua que o produto já fala', () => {
  it('cobre os CINCO números de NUMEROS_ITEM, sem sobrar nem faltar chave', () => {
    expect(Object.keys(TINTA_DO_NUMERO).sort()).toEqual(
      NUMEROS_ITEM.map((n) => n.chave).sort(),
    )
  })

  it('nenhuma tinta é paleta crua — é tudo token (a catraca só desce)', () => {
    for (const [chave, tinta] of Object.entries(TINTA_DO_NUMERO)) {
      expect(tinta.texto, `${chave}.texto`).not.toMatch(PALETA_DO_TAILWIND)
      expect(tinta.marca, `${chave}.marca`).not.toMatch(PALETA_DO_TAILWIND)
    }
  })

  it('o texto pinta TEXTO e a marca pinta FUNDO — trocar os dois some da tela', () => {
    for (const [chave, tinta] of Object.entries(TINTA_DO_NUMERO)) {
      expect(tinta.texto, `${chave}.texto`).toMatch(/^text-/)
      expect(tinta.marca, `${chave}.marca`).toMatch(/^bg-/)
    }
  })

  it('cada número tem tinta PRÓPRIA — duas colunas com a mesma cor não são chave', () => {
    const textos = Object.values(TINTA_DO_NUMERO).map((t) => t.texto)
    expect(new Set(textos).size).toBe(textos.length)
  })

  // ⚠ ESTA É A REGRA DA FASE: verde e azul têm de querer dizer, na tela de itens, a
  // MESMA coisa que já querem dizer na tela de ativos. `STATUS_META` é a fonte.
  it('"Em estoque" usa a família de matiz que o produto já usa para em_estoque', () => {
    expect(STATUS_META.em_estoque.badge).toContain('selo-em-estoque')
    expect(TINTA_DO_NUMERO.estoque.texto).toBe('text-selo-em-estoque-texto')
    expect(TINTA_DO_NUMERO.estoque.marca).toBe('bg-selo-em-estoque-texto')
  })

  it('"Em uso" usa a família de matiz que o produto já usa para em_uso', () => {
    expect(STATUS_META.em_uso.badge).toContain('selo-em-uso')
    expect(TINTA_DO_NUMERO.emUso.texto).toBe('text-selo-em-uso-texto')
    expect(TINTA_DO_NUMERO.emUso.marca).toBe('bg-selo-em-uso-texto')
  })

  it('"Reservado" usa a família do selo reservado — sem inventar um segundo violeta', () => {
    expect(STATUS_META.reservado.badge).toContain('selo-reservado')
    expect(TINTA_DO_NUMERO.atrelados.texto).toBe('text-selo-reservado-texto')
  })

  it('"Total" é o NEUTRO, e não o violeta de Reservado (seria colisão de dialeto)', () => {
    expect(TINTA_DO_NUMERO.total.texto).toBe('text-muted-foreground')
    expect(TINTA_DO_NUMERO.total.texto).not.toContain('selo-reservado')
  })

  it('"Falta" é vermelho, a família do selo "faltam N" que já existia', () => {
    expect(TINTA_DO_NUMERO.falta.texto).toBe('text-destructive')
  })

  it('tintaDoNumero devolve o neutro para chave desconhecida, sem estourar', () => {
    expect(tintaDoNumero('naoExiste')).toEqual(TINTA_DO_NUMERO.total)
    expect(tintaDoNumero('estoque')).toEqual(TINTA_DO_NUMERO.estoque)
  })
})
