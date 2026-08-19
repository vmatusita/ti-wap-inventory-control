import { describe, expect, it } from 'vitest'

import { TIPO_LANCAMENTO_META, type TipoLancamento } from '@/lib/dominio'
import {
  avisoQuantidadeInvalida,
  efeitoNoEstoque,
  previewEstoque,
  qtdComSinal,
  textoPreview,
} from '@/lib/itens/efeito-lancamento'
import { calcularSaldoApos, type LancamentoParaSaldoApos } from '@/lib/itens/saldo-apos'

describe('efeitoNoEstoque', () => {
  it('entrada, devolução (liberacao) e retorno REPÕEM a prateleira', () => {
    expect(efeitoNoEstoque('entrada', 5)).toBe(5)
    expect(efeitoNoEstoque('liberacao', 2)).toBe(2)
    expect(efeitoNoEstoque('retorno', 3)).toBe(3)
  })

  it('liberação (saida) e atrelar (reserva) TIRAM da prateleira', () => {
    expect(efeitoNoEstoque('saida', 3)).toBe(-3)
    expect(efeitoNoEstoque('reserva', 2)).toBe(-2)
  })

  it('ajuste carrega o próprio sinal', () => {
    expect(efeitoNoEstoque('ajuste', 4)).toBe(4)
    expect(efeitoNoEstoque('ajuste', -4)).toBe(-4)
  })

  it('cobre todos os tipos do enum (tipo novo quebra aqui, de propósito)', () => {
    for (const t of Object.keys(TIPO_LANCAMENTO_META) as TipoLancamento[]) {
      expect(Number.isFinite(efeitoNoEstoque(t, 1)), t).toBe(true)
    }
  })

  it('bate com calcularSaldoApos numa sequência sem saturação (a mesma fórmula do banco)', () => {
    // entrada 10 → saida 3 → reserva 2 (#48211) → liberacao 2 (#48211) →
    // retorno 3 → ajuste −1. Nenhum acumulado toca o zero, então o Δestoque de
    // cada lançamento TEM de ser exatamente `efeitoNoEstoque`.
    const seq: { tipo: TipoLancamento; quantidade: number; chamado: string | null }[] = [
      { tipo: 'entrada', quantidade: 10, chamado: null },
      { tipo: 'saida', quantidade: 3, chamado: null },
      { tipo: 'reserva', quantidade: 2, chamado: '48211' },
      { tipo: 'liberacao', quantidade: 2, chamado: '48211' },
      { tipo: 'retorno', quantidade: 3, chamado: null },
      { tipo: 'ajuste', quantidade: -1, chamado: null },
    ]
    const linhas: LancamentoParaSaldoApos[] = seq.map((l, i) => ({
      id: `id-${i}`,
      data: `2026-08-${String(i + 1).padStart(2, '0')}`,
      created_at: `2026-08-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      tipo: l.tipo,
      quantidade: l.quantidade,
      chamado: l.chamado,
    }))
    // Saldo final da sequência: total 9 · atrelados 0 · liberados 0 · estoque 9.
    const resultado = calcularSaldoApos(linhas, { total: 9, atrelados: 0, estoque: 9, falta: 0 })
    expect(resultado.motivoDegradado).toBeNull()
    const porId = new Map(resultado.linhas.map((l) => [l.id, l.saldoApos]))
    let acumulado = 0
    seq.forEach((l, i) => {
      acumulado += efeitoNoEstoque(l.tipo, l.quantidade)
      expect(porId.get(`id-${i}`), `saldo após o lançamento ${i} (${l.tipo})`).toBe(acumulado)
    })
  })
})

describe('qtdComSinal', () => {
  it('põe o sinal do EFEITO, não o da quantidade crua', () => {
    expect(qtdComSinal('entrada', 10)).toBe('+10')
    expect(qtdComSinal('saida', 3)).toBe('-3')
    expect(qtdComSinal('reserva', 2)).toBe('-2')
    expect(qtdComSinal('liberacao', 2)).toBe('+2')
    expect(qtdComSinal('retorno', 3)).toBe('+3')
    expect(qtdComSinal('ajuste', -4)).toBe('-4')
    expect(qtdComSinal('ajuste', 4)).toBe('+4')
  })

  it('formata em pt-BR (milhar com ponto)', () => {
    expect(qtdComSinal('entrada', 1500)).toBe('+1.500')
    expect(qtdComSinal('saida', 1500)).toBe('-1.500')
  })
})

describe('previewEstoque', () => {
  it('mostra o antes → depois do estoque da filial', () => {
    expect(previewEstoque('saida', 2, 14)).toEqual({
      antes: 14,
      depois: 12,
      recusado: false,
      alertaPar: false,
    })
    expect(previewEstoque('entrada', 10, 14)).toEqual({
      antes: 14,
      depois: 24,
      recusado: false,
      alertaPar: false,
    })
    expect(previewEstoque('ajuste', -3, 14)).toEqual({
      antes: 14,
      depois: 11,
      recusado: false,
      alertaPar: false,
    })
  })

  it('acusa a recusa quando a prateleira ficaria negativa (a regra do trigger)', () => {
    const p = previewEstoque('saida', 20, 2)
    expect(p).toEqual({ antes: 2, depois: -18, recusado: true, alertaPar: false })
    expect(textoPreview(p!)).toContain('será recusado')
  })

  it('fica calado sem saldo carregado, sem quantidade ou com quantidade inválida', () => {
    expect(previewEstoque('saida', 2, null)).toBeNull()
    expect(previewEstoque('saida', 2, undefined)).toBeNull()
    expect(previewEstoque('saida', 0, 14)).toBeNull()
    expect(previewEstoque('saida', 1.5, 14)).toBeNull()
    expect(previewEstoque('saida', -2, 14)).toBeNull()
    expect(previewEstoque('ajuste', 0, 14)).toBeNull()
  })

  it('ajuste negativo é prévia válida (o alternador − Baixar produz exatamente isso)', () => {
    expect(previewEstoque('ajuste', -14, 14)).toEqual({
      antes: 14,
      depois: 0,
      recusado: false,
      alertaPar: false,
    })
    expect(previewEstoque('ajuste', -15, 14)?.recusado).toBe(true)
  })

  it('o texto da prévia é pt-BR e afirma o não-efeito da recusa', () => {
    expect(textoPreview({ antes: 14, depois: 12, recusado: false, alertaPar: false })).toBe(
      'Estoque na filial: 14 → 12',
    )
    expect(textoPreview({ antes: 2, depois: -18, recusado: true, alertaPar: false })).toBe(
      'Estoque na filial: 2 → -18 — será recusado (estoque insuficiente)',
    )
  })
})

describe('previewEstoque — alertaPar (achado 10)', () => {
  it('é true só em liberacao (Devolução) e retorno (Retorno) — varre os seis tipos', () => {
    // Quantidade 1 é válida em qualquer tipo (positiva), então a varredura
    // não esbarra na regra "negativa fora do Ajuste" de previewEstoque.
    for (const t of Object.keys(TIPO_LANCAMENTO_META) as TipoLancamento[]) {
      const esperado = t === 'liberacao' || t === 'retorno'
      expect(previewEstoque(t, 1, 10)?.alertaPar, t).toBe(esperado)
    }
  })
})

describe('textoPreview — ressalva do par (achado 10)', () => {
  it('inclui a ressalva do par (com os rótulos oficiais) quando alertaPar', () => {
    const texto = textoPreview({ antes: 14, depois: 16, recusado: false, alertaPar: true })
    expect(texto).toContain('quantidade em aberto do par')
    expect(texto).toContain(TIPO_LANCAMENTO_META.liberacao.rotulo)
    expect(texto).toContain(TIPO_LANCAMENTO_META.retorno.rotulo)
  })

  it('NÃO inclui a ressalva do par quando alertaPar é false', () => {
    const texto = textoPreview({ antes: 14, depois: 12, recusado: false, alertaPar: false })
    expect(texto).not.toContain('quantidade em aberto do par')
  })

  it('continua dizendo "será recusado" quando o estoque ficaria negativo', () => {
    const texto = textoPreview({ antes: 2, depois: -18, recusado: true, alertaPar: false })
    expect(texto).toContain('será recusado')
  })
})

describe('avisoQuantidadeInvalida (achado 14)', () => {
  it('avisa, citando o rótulo oficial do Ajuste, quando a quantidade é negativa fora dele', () => {
    const tiposForaDoAjuste = (Object.keys(TIPO_LANCAMENTO_META) as TipoLancamento[]).filter(
      (t) => t !== 'ajuste',
    )
    for (const t of tiposForaDoAjuste) {
      const aviso = avisoQuantidadeInvalida(t, -3)
      expect(aviso, t).not.toBeNull()
      expect(aviso, t).toContain(TIPO_LANCAMENTO_META.ajuste.rotulo)
    }
  })

  it('fica calado (null) para negativo no Ajuste — é a única quantidade negativa legítima', () => {
    expect(avisoQuantidadeInvalida('ajuste', -5)).toBeNull()
  })

  it('fica calado para zero, positivo e valor não inteiro (inclusive NaN)', () => {
    expect(avisoQuantidadeInvalida('saida', 0)).toBeNull()
    expect(avisoQuantidadeInvalida('saida', 5)).toBeNull()
    expect(avisoQuantidadeInvalida('saida', 1.5)).toBeNull()
    expect(avisoQuantidadeInvalida('saida', NaN)).toBeNull()
  })
})
