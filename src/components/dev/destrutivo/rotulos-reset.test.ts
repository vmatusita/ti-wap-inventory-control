import { describe, expect, it } from 'vitest'
import { ROTULOS_CONTAGEM_RESET, rotuloContagemReset } from '@/components/dev/destrutivo/rotulos-reset'

// Testes do mapa de rótulos da prévia do reset (F27/B8, DEV-02). Cobre as seis chaves reais que
// `previa_reset`/`resetar_acervo`/`resetar_itens` (migrations 0086/0083) trocam entre si, e o
// fallback para uma chave nova — a mesma chave que antes era só `chave.replace(/_/g, ' ')`.

describe('rotuloContagemReset', () => {
  it('usa o rótulo curado para as cinco chaves do bloco "acervo"', () => {
    expect(rotuloContagemReset('ativos')).toBe('ativos')
    expect(rotuloContagemReset('movimentacoes')).toBe('movimentações')
    expect(rotuloContagemReset('anotacoes')).toBe('anotações')
    expect(rotuloContagemReset('pendencias_item')).toBe('pendências de item')
    expect(rotuloContagemReset('termos')).toBe('termos')
  })

  it('usa o rótulo curado para a chave do bloco "itens"', () => {
    expect(rotuloContagemReset('lancamentos')).toBe('lançamentos de item')
  })

  it('cai para chave.replace(/_/g, " ") quando a chave não está no mapa', () => {
    // O caso que motivou a troca: sem curadoria, `pendencias_item` viraria "pendencias item" e
    // `lancamentos` viraria "lancamentos" — o fallback é aceitável só para o que ninguém previu.
    expect(rotuloContagemReset('kits_associados')).toBe('kits associados')
    expect(rotuloContagemReset('foo_bar_baz')).toBe('foo bar baz')
  })

  it('fallback devolve a chave intacta quando não tem sublinhado', () => {
    expect(rotuloContagemReset('foo')).toBe('foo')
  })

  it('o mapa tem exatamente as seis chaves que as RPCs de reset conhecem hoje', () => {
    // Trava de sincronia: se uma migration futura acrescentar ou remover uma coluna de
    // `p_contagens` (0083/0086) sem que este mapa mude junto, este teste denuncia a divergência
    // em vez de deixá-la passar despercebida.
    expect(Object.keys(ROTULOS_CONTAGEM_RESET).sort()).toEqual(
      ['anotacoes', 'ativos', 'lancamentos', 'movimentacoes', 'pendencias_item', 'termos'].sort(),
    )
  })
})
