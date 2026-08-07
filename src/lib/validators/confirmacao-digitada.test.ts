import { describe, expect, it } from 'vitest'
import { dicaConfirmacaoNaoConfere } from '@/lib/validators/confirmacao-digitada'

// Testes da dica compartilhada de confirmação digitada (F27 · ADM-07).

describe('dicaConfirmacaoNaoConfere', () => {
  it('não mostra nada com o campo vazio (ninguém digitou ainda)', () => {
    expect(dicaConfirmacaoNaoConfere('', false, 'Linhares')).toBeNull()
  })

  it('campo só com espaço conta como vazio', () => {
    expect(dicaConfirmacaoNaoConfere('   ', false, 'Linhares')).toBeNull()
  })

  it('não mostra nada quando já confere, mesmo com confere calculado por régua tolerante', () => {
    expect(dicaConfirmacaoNaoConfere('linhares', true, 'Linhares')).toBeNull()
  })

  it('mostra a dica nomeando o alvo quando o campo tem texto e não confere', () => {
    expect(dicaConfirmacaoNaoConfere('linhares', false, 'Linhares')).toBe(
      'O texto não confere — digite exatamente Linhares',
    )
  })

  it('não decide sozinha o que é "igual" — depende do `confere` recebido', () => {
    // A mesma dupla (digitado, esperado) pode estar certa numa tela de régua tolerante
    // (apagar conta / Zona destrutiva) e errada na régua exata do import — por isso a
    // função recebe `confere` já calculado pelo chamador, e não recalcula por conta própria.
    expect(dicaConfirmacaoNaoConfere('MATRIZ', true, 'Matriz')).toBeNull()
    expect(dicaConfirmacaoNaoConfere('MATRIZ', false, 'Matriz')).toBe(
      'O texto não confere — digite exatamente Matriz',
    )
  })
})
