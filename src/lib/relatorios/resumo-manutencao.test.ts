import { describe, expect, it } from 'vitest'
import { MANUTENCAO_ALERTA_DIAS } from '@/lib/relatorios/manutencao-alerta'
import { resumoRiscoManutencao } from '@/lib/relatorios/resumo-manutencao'

// Fábrica com os 3 campos que o resumo lê — o resto de ManutencaoCaso é irrelevante
// aqui (o `Pick` na assinatura já documenta isso), então nem entra no fixture.
function caso(
  fechado: boolean,
  diasEmManutencao: number | null,
  desfecho?: 'retorno' | 'devolvido_fornecedor',
) {
  return { fechado, diasEmManutencao, desfecho }
}

describe('resumoRiscoManutencao', () => {
  it('zero casos: frase honesta, sem "0 caso(s)"', () => {
    expect(resumoRiscoManutencao([])).toBe('nenhum caso em manutenção no período')
  })

  it('só abertos, nenhum em alerta: a parte de alerta e a de encerrados somem', () => {
    const casos = [caso(false, 1), caso(false, 5), caso(false, null)]
    expect(resumoRiscoManutencao(casos)).toBe('3 casos')
  })

  it('só fechados: nenhum fechado alerta (mesmo com dias altos) — só a parte de encerrados aparece', () => {
    const casos = [caso(true, 999), caso(true, 2)]
    expect(resumoRiscoManutencao(casos)).toBe('2 casos · 2 encerrados no período')
  })

  it('mistura casos abertos, em alerta e encerrados — as 3 partes juntas', () => {
    const casos = [
      // 1 aberto sob o limiar (não alerta)
      caso(false, 10),
      // 3 abertos em alerta
      caso(false, MANUTENCAO_ALERTA_DIAS),
      caso(false, MANUTENCAO_ALERTA_DIAS + 50),
      caso(false, MANUTENCAO_ALERTA_DIAS + 1),
      // 2 encerrados (um por retorno, um devolvido ao fornecedor)
      caso(true, 40, 'retorno'),
      caso(true, 12, 'devolvido_fornecedor'),
    ]
    expect(resumoRiscoManutencao(casos)).toBe(
      `6 casos · 3 em alerta (${MANUTENCAO_ALERTA_DIAS}+ dias) · 2 encerrados no período`,
    )
  })

  it('limiar de alerta: exatamente MANUTENCAO_ALERTA_DIAS entra, um dia antes não', () => {
    const noLimiar = [caso(false, MANUTENCAO_ALERTA_DIAS)]
    expect(resumoRiscoManutencao(noLimiar)).toBe(
      `1 caso · 1 em alerta (${MANUTENCAO_ALERTA_DIAS}+ dias)`,
    )

    const umDiaAntes = [caso(false, MANUTENCAO_ALERTA_DIAS - 1)]
    expect(resumoRiscoManutencao(umDiaAntes)).toBe('1 caso')
  })

  it('devolvido_fornecedor conta como encerrado (fechado governa, não o desfecho — RV-19b)', () => {
    const casos = [caso(true, 5, 'devolvido_fornecedor')]
    expect(resumoRiscoManutencao(casos)).toBe('1 caso · 1 encerrado no período')
  })

  it('diasEmManutencao null nunca alerta, aberto ou fechado', () => {
    const casos = [caso(false, null), caso(true, null)]
    expect(resumoRiscoManutencao(casos)).toBe('2 casos · 1 encerrado no período')
  })

  it('singular nas 3 partes ao mesmo tempo: 1 caso · 1 em alerta · 1 encerrado', () => {
    // Só dá pra ter alerta E encerrado juntos em casos DIFERENTES (fechado nunca
    // alerta) — daqui exercitamos o singular de cada parte com 2 casos.
    const casos = [caso(false, MANUTENCAO_ALERTA_DIAS), caso(true, 3)]
    expect(resumoRiscoManutencao(casos)).toBe(
      `2 casos · 1 em alerta (${MANUTENCAO_ALERTA_DIAS}+ dias) · 1 encerrado no período`,
    )
  })

  it('plural nas 3 partes: N casos · N em alerta · N encerrados', () => {
    const casos = [
      caso(false, MANUTENCAO_ALERTA_DIAS),
      caso(false, MANUTENCAO_ALERTA_DIAS + 10),
      caso(true, 1),
      caso(true, 2),
    ]
    expect(resumoRiscoManutencao(casos)).toBe(
      `4 casos · 2 em alerta (${MANUTENCAO_ALERTA_DIAS}+ dias) · 2 encerrados no período`,
    )
  })
})
