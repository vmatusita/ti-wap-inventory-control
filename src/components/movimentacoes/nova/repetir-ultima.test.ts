import { describe, it, expect } from 'vitest'
import { camposDaRepeticao } from '@/components/movimentacoes/nova/repetir-ultima'
import type { UltimaMovimentacaoUsuario } from '@/lib/queries/movimentacoes'

// "Repetir última" no passo 2 (MOV-07). Dados 100% fictícios (CLAUDE.md).

const ULTIMA: UltimaMovimentacaoUsuario = {
  tipo: 'saida',
  motivo: 'novo_colaborador',
  colaborador: 'Fulano de Tal',
  setor: 'TI',
  chamado: '12345',
  termo_assinado: 'gerado',
  termo_data: '2026-07-20',
}

describe('camposDaRepeticao — tipo válido para os ativos atuais', () => {
  it('aplica motivo, termo e data do termo da última movimentação', () => {
    const c = camposDaRepeticao(ULTIMA, true)
    expect(c).toEqual({
      motivo: 'novo_colaborador',
      termo: 'gerado',
      termoData: '2026-07-20',
    })
  })

  it('campos ausentes na última viram string vazia (nunca undefined/null)', () => {
    const c = camposDaRepeticao(
      { motivo: null, termo_assinado: null, termo_data: null },
      true,
    )
    expect(c).toEqual({ motivo: '', termo: '', termoData: '' })
  })
})

describe('camposDaRepeticao — tipo NÃO vale mais para os ativos atuais', () => {
  it('não aplica motivo, termo nem termoData — os três voltam vazios', () => {
    const c = camposDaRepeticao(ULTIMA, false)
    expect(c).toEqual({ motivo: '', termo: '', termoData: '' })
  })

  it('vale mesmo quando a última tinha os três campos preenchidos', () => {
    // O ponto do bug (MOV-07): sem esta guarda, motivo/termo/termoData da
    // última vazavam para um tipo diferente, incoerentes e invisíveis na
    // tela (Zod só exige min(1), sem checar aplica_a).
    const c = camposDaRepeticao(ULTIMA, false)
    expect(c.motivo).not.toBe(ULTIMA.motivo)
    expect(c.motivo).toBe('')
  })
})
