import { describe, expect, it } from 'vitest'
import {
  calcularSaldoApos,
  MOTIVO_SALDO_APOS_DEGRADADO,
  type LancamentoParaSaldoApos,
} from '@/lib/itens/saldo-apos'

// ITN-03a — "Saldo após". Dados 100% fictícios (CLAUDE.md): item "Mouse USB
// fictício", filial fictícia — só o que a conta precisa (tipo, quantidade,
// chamado, data/created_at/id para a ordem).
function linha(
  id: string,
  data: string,
  tipo: LancamentoParaSaldoApos['tipo'],
  quantidade: number,
  chamado: string | null = null,
  createdAt = `${data}T12:00:00.000000+00:00`,
): LancamentoParaSaldoApos {
  return { id, data, created_at: createdAt, tipo, quantidade, chamado }
}

function saldoPorId(res: ReturnType<typeof calcularSaldoApos>, id: string): number | null {
  const l = res.linhas.find((x) => x.id === id)
  if (!l) throw new Error(`linha ${id} não encontrada no resultado`)
  return l.saldoApos
}

describe('calcularSaldoApos — sequência simples entrada/saída', () => {
  it('desfaz corretamente do mais recente para o mais antigo', () => {
    const linhas = [
      linha('a', '2026-08-01', 'entrada', 10),
      linha('b', '2026-08-05', 'saida', 4),
    ]
    const res = calcularSaldoApos(linhas, { total: 10, atrelados: 0, estoque: 6, falta: 0 })
    expect(res.motivoDegradado).toBeNull()
    expect(saldoPorId(res, 'b')).toBe(6) // mais recente = saldo atual
    expect(saldoPorId(res, 'a')).toBe(10) // antes da saída
    // ordem de exibição = ordem de cálculo (mais recente primeiro)
    expect(res.linhas.map((l) => l.id)).toEqual(['b', 'a'])
  })
})

describe('calcularSaldoApos — ajuste negativo', () => {
  it('baixa o total/estoque sem saturar', () => {
    const linhas = [
      linha('a', '2026-08-01', 'entrada', 10),
      linha('b', '2026-08-06', 'ajuste', -3),
    ]
    const res = calcularSaldoApos(linhas, { total: 7, atrelados: 0, estoque: 7, falta: 0 })
    expect(res.motivoDegradado).toBeNull()
    expect(saldoPorId(res, 'b')).toBe(7)
    expect(saldoPorId(res, 'a')).toBe(10)
  })
})

describe('calcularSaldoApos — saturação em zero', () => {
  it('mostra 0 (não um número negativo) no ponto em que o bruto satura, e ainda assim fecha', () => {
    // 01/08 entrada +2 (bruto 2) · 02/08 ajuste -5 (bruto -3 → estoque 0,
    // saturado) · 03/08 entrada +4 (bruto 1 → saldo atual).
    const linhas = [
      linha('a', '2026-08-01', 'entrada', 2),
      linha('b', '2026-08-02', 'ajuste', -5),
      linha('c', '2026-08-03', 'entrada', 4),
    ]
    const res = calcularSaldoApos(linhas, { total: 1, atrelados: 0, estoque: 1, falta: 0 })
    expect(res.motivoDegradado).toBeNull()
    expect(saldoPorId(res, 'c')).toBe(1) // saldo atual
    expect(saldoPorId(res, 'b')).toBe(0) // bruto -3, floored — nunca negativo
    expect(saldoPorId(res, 'a')).toBe(2) // antes do ajuste
  })

  it('degrada (não reconstrói) quando o recorte não fecha com o saldo atual', () => {
    // Só a entrada foi passada (ex.: histórico incompleto/corrida) — o saldo
    // atual informado (7) não bate com o que estas linhas produzem (10).
    const linhas = [linha('a', '2026-08-01', 'entrada', 10)]
    const res = calcularSaldoApos(linhas, { total: 7, atrelados: 0, estoque: 7, falta: 0 })
    expect(res.motivoDegradado).toBe(MOTIVO_SALDO_APOS_DEGRADADO)
    expect(res.linhas.every((l) => l.saldoApos === null)).toBe(true)
  })
})

describe('calcularSaldoApos — estorno', () => {
  it('as duas linhas (original + inverso) entram na conta como lançamentos reais', () => {
    const linhas = [
      linha('a', '2026-08-01', 'entrada', 10),
      linha('b', '2026-08-02', 'reserva', 4, '555'),
      // estorno da reserva: liberação do mesmo chamado, mesma quantidade
      linha('c', '2026-08-03', 'liberacao', 4, '555'),
    ]
    const res = calcularSaldoApos(linhas, { total: 10, atrelados: 0, estoque: 10, falta: 0 })
    expect(res.motivoDegradado).toBeNull()
    expect(saldoPorId(res, 'c')).toBe(10) // volta ao que era antes da reserva
    expect(saldoPorId(res, 'b')).toBe(6) // 10 atrelado 4
    expect(saldoPorId(res, 'a')).toBe(10)
  })
})

describe('calcularSaldoApos — lista vazia', () => {
  it('devolve lista vazia sem degradar', () => {
    const res = calcularSaldoApos([], { total: 0, atrelados: 0, estoque: 0, falta: 0 })
    expect(res).toEqual({ linhas: [], motivoDegradado: null })
  })
})

describe('calcularSaldoApos — ordem de cálculo diverge da ordem de registro', () => {
  it('ordena por data, não por created_at/id, quando os dois divergem', () => {
    // "b" foi REGISTRADO depois de "a" (created_at maior) mas sua DATA de
    // negócio é anterior — a conta e a exibição seguem a data.
    const linhas = [
      linha('a', '2026-08-05', 'entrada', 10, null, '2026-08-01T09:00:00+00:00'),
      linha('b', '2026-08-01', 'entrada', 3, null, '2026-08-06T09:00:00+00:00'),
    ]
    const res = calcularSaldoApos(linhas, { total: 13, atrelados: 0, estoque: 13, falta: 0 })
    expect(res.motivoDegradado).toBeNull()
    // mais recente por DATA é "a" (05/08), não "b" (registrado por último)
    expect(res.linhas.map((l) => l.id)).toEqual(['a', 'b'])
    expect(saldoPorId(res, 'a')).toBe(13)
    expect(saldoPorId(res, 'b')).toBe(3)
  })
})
