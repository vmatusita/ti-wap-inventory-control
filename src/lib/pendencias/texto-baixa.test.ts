import { describe, expect, it } from 'vitest'
import {
  PREFIXO_BAIXA,
  textoDaBaixa,
  textoDoRetornoDaPendencia,
} from '@/lib/pendencias/texto-baixa'

describe('textoDaBaixa', () => {
  it('a observação do operador é a justificativa quando ele escreveu uma', () => {
    expect(
      textoDaBaixa({ itemRotulo: 'Cabo', observacaoDaResolucao: 'Sumiu na mudança de andar' }),
    ).toBe('Sumiu na mudança de andar')
  })

  it('observação só com espaço não conta como escrita', () => {
    const t = textoDaBaixa({ itemRotulo: 'Cabo', observacaoDaResolucao: '   ' })
    expect(t.startsWith(PREFIXO_BAIXA)).toBe(true)
  })

  it('sem observação, compõe o texto padrão com item e pessoa', () => {
    expect(textoDaBaixa({ itemRotulo: 'Fone de ouvido', colaborador: 'Fulano Teste' })).toBe(
      'Baixa de item faltante: Fone de ouvido (estava com Fulano Teste) — não vai voltar.',
    )
  })

  it('sem pessoa, o texto padrão não inventa parênteses vazio', () => {
    expect(textoDaBaixa({ itemRotulo: 'Mochila' })).toBe(
      'Baixa de item faltante: Mochila — não vai voltar.',
    )
  })

  it('NUNCA devolve vazio — o CHECK do banco não aceitaria', () => {
    for (const ctx of [
      { itemRotulo: '' },
      { itemRotulo: '   ', colaborador: '  ' },
      { itemRotulo: '', observacaoDaResolucao: '' },
    ]) {
      expect(textoDaBaixa(ctx).trim().length).toBeGreaterThan(0)
    }
  })

  it('respeita o teto de 500 caracteres nos dois caminhos', () => {
    expect(textoDaBaixa({ itemRotulo: 'x', observacaoDaResolucao: 'a'.repeat(900) })).toHaveLength(
      500,
    )
    expect(
      textoDaBaixa({ itemRotulo: 'b'.repeat(400), colaborador: 'c'.repeat(400) }).length,
    ).toBeLessThanOrEqual(500)
  })
})

describe('textoDoRetornoDaPendencia', () => {
  it('diz "recuperado" no desfecho de recuperação', () => {
    expect(textoDoRetornoDaPendencia('recuperado', { itemRotulo: 'Cabo', colaborador: 'Fulano' })).toBe(
      'Pendência resolvida: Cabo com Fulano foi recuperado.',
    )
  })

  it('diz "baixa" no desfecho de baixa', () => {
    expect(textoDoRetornoDaPendencia('baixa', { itemRotulo: 'Cabo' })).toBe(
      'Pendência resolvida: Cabo recebeu baixa.',
    )
  })

  it('sem pessoa, não deixa a preposição solta', () => {
    expect(textoDoRetornoDaPendencia('recuperado', { itemRotulo: 'Cabo', colaborador: '  ' })).toBe(
      'Pendência resolvida: Cabo foi recuperado.',
    )
  })

  it('respeita o teto de 500 caracteres', () => {
    expect(
      textoDoRetornoDaPendencia('baixa', { itemRotulo: 'x'.repeat(600) }).length,
    ).toBeLessThanOrEqual(500)
  })
})
