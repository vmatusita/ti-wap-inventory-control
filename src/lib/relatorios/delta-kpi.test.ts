import { describe, expect, it } from 'vitest'
import type { KpisRelatorio } from '@/lib/relatorios/tipos'
import { CLASSE_COR_DELTA, corDelta, SENTIDO_KPI, textoDelta } from './delta-kpi'

// Todas as chaves de KpisRelatorio (menos as opcionais? emprestado é opcional no
// tipo mas o mapa cobre). Trava que o mapa cobre exatamente o conjunto esperado.
const CHAVES: (keyof KpisRelatorio)[] = [
  'total',
  'em_uso',
  'em_estoque',
  'reservado',
  'em_manutencao',
  'em_triagem',
  'defasado',
  'emprestado',
]

describe('SENTIDO_KPI', () => {
  it('cobre todas as chaves de KPI (nenhuma fica sem sentido)', () => {
    for (const c of CHAVES) expect(SENTIDO_KPI[c]).toBeDefined()
  })

  it('estoque é positivo (subir é bom)', () => {
    expect(SENTIDO_KPI.em_estoque).toBe('positivo')
  })

  it('manutenção e triagem são negativos (subir é ruim)', () => {
    expect(SENTIDO_KPI.em_manutencao).toBe('negativo')
    expect(SENTIDO_KPI.em_triagem).toBe('negativo')
  })

  it('total, em uso, reservado, reserva técnica e emprestado são neutros', () => {
    expect(SENTIDO_KPI.total).toBe('neutro')
    expect(SENTIDO_KPI.em_uso).toBe('neutro')
    expect(SENTIDO_KPI.reservado).toBe('neutro')
    expect(SENTIDO_KPI.defasado).toBe('neutro')
    expect(SENTIDO_KPI.emprestado).toBe('neutro')
  })
})

describe('corDelta', () => {
  it('Δ zero é sempre neutro, qualquer indicador', () => {
    expect(corDelta('em_estoque', 0)).toBe('neutro')
    expect(corDelta('em_manutencao', 0)).toBe('neutro')
    expect(corDelta('total', 0)).toBe('neutro')
  })

  it('positivo: subir=verde, descer=vermelho', () => {
    expect(corDelta('em_estoque', 5)).toBe('verde')
    expect(corDelta('em_estoque', -5)).toBe('vermelho')
  })

  it('negativo: subir=vermelho, descer=verde (invertido)', () => {
    expect(corDelta('em_manutencao', 3)).toBe('vermelho')
    expect(corDelta('em_manutencao', -3)).toBe('verde')
    expect(corDelta('em_triagem', 1)).toBe('vermelho')
    expect(corDelta('em_triagem', -1)).toBe('verde')
  })

  it('neutro: sempre neutro, suba ou desça', () => {
    expect(corDelta('total', 9)).toBe('neutro')
    expect(corDelta('total', -9)).toBe('neutro')
    expect(corDelta('em_uso', 4)).toBe('neutro')
    expect(corDelta('reservado', -4)).toBe('neutro')
    expect(corDelta('defasado', 2)).toBe('neutro')
    expect(corDelta('emprestado', -2)).toBe('neutro')
  })

  it('a cor nunca colore de vermelho um aumento de estoque (regressão do bug direcional)', () => {
    // Antes da F16 o Δ era direcional: +estoque era verde e +manutenção também.
    // Agora +manutenção é vermelho.
    expect(corDelta('em_estoque', 10)).toBe('verde')
    expect(corDelta('em_manutencao', 10)).toBe('vermelho')
  })
})

describe('CLASSE_COR_DELTA', () => {
  it('mapeia os três veredictos para classes distintas', () => {
    expect(CLASSE_COR_DELTA.verde).toContain('green')
    expect(CLASSE_COR_DELTA.vermelho).toContain('red')
    expect(CLASSE_COR_DELTA.neutro).toContain('muted-foreground')
  })
})

// F29/REL-07 — o Δ dizia "▲ +12" e mais nada: de que número, em relação a que
// janela? O texto da Dica responde, usando a MESMA `periodoAnterior` que o motor
// usa para calcular `kpisAnterior` — rótulo e número não podem divergir.
describe('textoDelta', () => {
  it('diz o valor anterior, a janela de comparação e o valor atual', () => {
    expect(textoDelta(92, 80, { de: '2026-07-12', ate: '2026-07-18' })).toBe(
      'Anterior: 80 (05/07/2026 a 11/07/2026) → atual: 92 (12/07/2026 a 18/07/2026)',
    )
  })

  it('sem período (dashboard) não monta texto nenhum — o tile fica como era', () => {
    expect(textoDelta(92, 80, undefined)).toBeNull()
  })

  it('a janela tem a MESMA duração do período, terminando na véspera', () => {
    const t = textoDelta(1, 1, { de: '2026-07-15', ate: '2026-07-15' })
    expect(t).toContain('(14/07/2026 a 14/07/2026)')
  })

  it('formata milhar em pt-BR nos dois valores', () => {
    const t = textoDelta(1234, 1200, { de: '2026-01-01', ate: '2026-01-31' })
    expect(t).toContain('Anterior: 1.200')
    expect(t).toContain('atual: 1.234')
  })
})
