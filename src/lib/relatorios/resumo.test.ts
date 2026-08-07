import { describe, it, expect } from 'vitest'
import { achatarDisponiveis, gerarTextoResumo } from '@/lib/relatorios/resumo'
import type { ResumoPeriodo, ResumoTipo } from '@/lib/relatorios/tipos'

// Dados 100% fictícios (CLAUDE.md regra 2). B3/F6B: cada motivo em linha própria;
// o `;` que separava motivos deixa de existir (a quebra de linha o substitui).

const VAZIO: ResumoTipo = { total: 0, filiais: [] }

function resumo(over: Partial<ResumoPeriodo>): ResumoPeriodo {
  return {
    de: '2026-07-12',
    ate: '2026-07-18',
    saidas: VAZIO,
    devolucoes: VAZIO,
    ...over,
  }
}

describe('gerarTextoResumo — B3: quebra de linha por motivo', () => {
  it('filial com 1 motivo: cabeçalho + 1 linha indentada, sem ";"', () => {
    const texto = gerarTextoResumo(
      resumo({
        saidas: {
          total: 4,
          filiais: [
            {
              filial: 'Matriz',
              total: 4,
              motivos: [
                {
                  motivo: 'Novo colaborador',
                  total: 4,
                  categorias: [{ categoria: 'notebook', total: 4 }],
                },
              ],
            },
          ],
        },
      }),
    )
    const linhas = texto.split('\n')
    expect(linhas).toContain('Foram realizadas 4 saídas:')
    expect(linhas).toContain('• Matriz (4) —')
    expect(linhas).toContain('  novo colaborador: 04 notebooks')
    expect(texto).not.toContain(';')
  })

  it('filial com N motivos: cada motivo em sua própria linha, na ordem', () => {
    const texto = gerarTextoResumo(
      resumo({
        saidas: {
          total: 8,
          filiais: [
            {
              filial: 'Filial Norte',
              total: 8,
              motivos: [
                {
                  motivo: 'Novo colaborador',
                  total: 6,
                  categorias: [
                    { categoria: 'notebook', total: 4 },
                    { categoria: 'monitor', total: 2 },
                  ],
                },
                {
                  motivo: 'Troca',
                  total: 2,
                  categorias: [{ categoria: 'desktop', total: 2 }],
                },
              ],
            },
          ],
        },
      }),
    )
    const linhas = texto.split('\n')
    const iCab = linhas.indexOf('• Filial Norte (8) —')
    const iM1 = linhas.indexOf('  novo colaborador: 04 notebooks, 02 monitores')
    const iM2 = linhas.indexOf('  troca: 02 desktops')
    expect(iCab).toBeGreaterThanOrEqual(0)
    expect(iM1).toBe(iCab + 1)
    expect(iM2).toBe(iCab + 2)
    expect(texto).not.toContain(';')
  })

  it('cobre os dois tipos (saídas e devoluções) com várias filiais', () => {
    const texto = gerarTextoResumo(
      resumo({
        saidas: {
          total: 5,
          filiais: [
            {
              filial: 'Matriz',
              total: 5,
              motivos: [
                {
                  motivo: 'Novo colaborador',
                  total: 5,
                  categorias: [{ categoria: 'celular', total: 5 }],
                },
              ],
            },
          ],
        },
        devolucoes: {
          total: 3,
          filiais: [
            {
              filial: 'Filial Sul',
              total: 3,
              motivos: [
                {
                  motivo: 'Desligamento',
                  total: 3,
                  categorias: [{ categoria: 'notebook', total: 3 }],
                },
              ],
            },
          ],
        },
      }),
    )
    const linhas = texto.split('\n')
    expect(linhas).toContain('Foram realizadas 5 saídas:')
    expect(linhas).toContain('• Matriz (5) —')
    expect(linhas).toContain('  novo colaborador: 05 celulares')
    expect(linhas).toContain('Foram realizadas 3 devoluções:')
    expect(linhas).toContain('• Filial Sul (3) —')
    expect(linhas).toContain('  desligamento: 03 notebooks')
    expect(texto).not.toContain(';')
  })

  it('resumo vazio: mensagens de "nenhuma" nos dois blocos', () => {
    const texto = gerarTextoResumo(resumo({}))
    const linhas = texto.split('\n')
    expect(linhas).toContain('No período de 12/07/2026 a 18/07/2026:')
    expect(linhas).toContain('Nenhuma saída registrada no período.')
    expect(linhas).toContain('Nenhuma devolução registrada no período.')
    expect(texto).not.toContain('•')
  })

  it('singular: "Foi realizada 1 saída" e motivo único', () => {
    const texto = gerarTextoResumo(
      resumo({
        saidas: {
          total: 1,
          filiais: [
            {
              filial: 'Matriz',
              total: 1,
              motivos: [
                {
                  motivo: 'Novo colaborador',
                  total: 1,
                  categorias: [{ categoria: 'notebook', total: 1 }],
                },
              ],
            },
          ],
        },
      }),
    )
    expect(texto.split('\n')).toContain('Foi realizada 1 saída:')
    expect(texto).toContain('  novo colaborador: 01 notebook')
  })
})

// F29/REL-08 — o texto copiado passou a incluir o que o e-mail real trazia: a
// linha de KPIs e o bloco "Em estoque (N)". Os extras são OPCIONAIS: sem eles a
// saída tem de ser byte a byte a de antes (é o que os casos acima travam).
describe('gerarTextoResumo — extras (F29/REL-08)', () => {
  const KPIS = {
    total: 412,
    em_uso: 300,
    em_estoque: 80,
    reservado: 12,
    em_triagem: 8,
    em_manutencao: 7,
    defasado: 5,
    emprestado: 3,
  }

  it('sem extras, o texto é EXATAMENTE o de antes', () => {
    const base = gerarTextoResumo(resumo({}))
    expect(gerarTextoResumo(resumo({}), {})).toBe(base)
    expect(gerarTextoResumo(resumo({}), undefined)).toBe(base)
  })

  it('a linha de KPIs entra logo abaixo do período', () => {
    const linhas = gerarTextoResumo(resumo({}), { kpis: KPIS }).split('\n')
    expect(linhas[0]).toContain('No período de')
    expect(linhas[1]).toBe('')
    expect(linhas[2]).toBe(
      'Total 412 · Em uso 300 · Em estoque 80 · Reservados 12 · Em triagem 8 · Em manutenção 7 · Reserva técnica 5',
    )
  })

  it('"Em estoque" fecha o texto, do modelo mais numeroso ao menos', () => {
    const texto = gerarTextoResumo(resumo({}), {
      disponiveis: [
        { modelo: 'Positivo Master', total: 4 },
        { modelo: 'Dell Latitude 3440', total: 16 },
      ],
    })
    const linhas = texto.split('\n')
    expect(linhas[linhas.length - 1]).toBe(
      'Em estoque (20): 16× Dell Latitude 3440, 04× Positivo Master',
    )
    // Linha em branco separando das devoluções — o bloco não gruda no anterior.
    expect(linhas[linhas.length - 2]).toBe('')
  })

  it('empate de total desempata pelo nome, em pt-BR', () => {
    const texto = gerarTextoResumo(resumo({}), {
      disponiveis: [
        { modelo: 'Órion 5', total: 2 },
        { modelo: 'Alfa 1', total: 2 },
      ],
    })
    expect(texto).toContain('02× Alfa 1, 02× Órion 5')
  })

  it('modelo zerado não entra na lista nem no total entre parênteses', () => {
    const texto = gerarTextoResumo(resumo({}), {
      disponiveis: [
        { modelo: 'Com saldo', total: 3 },
        { modelo: 'Sem saldo', total: 0 },
      ],
    })
    expect(texto).toContain('Em estoque (3): 03× Com saldo')
    expect(texto).not.toContain('Sem saldo')
  })

  it('sem nenhum modelo com saldo, o bloco não aparece (nem uma linha vazia solta)', () => {
    const texto = gerarTextoResumo(resumo({}), { disponiveis: [] })
    expect(texto).not.toContain('Em estoque')
    expect(texto).toBe(gerarTextoResumo(resumo({})))
  })

  it('o total entre parênteses é a soma da lista impressa', () => {
    const texto = gerarTextoResumo(resumo({}), {
      disponiveis: [
        { modelo: 'A', total: 7 },
        { modelo: 'B', total: 5 },
        { modelo: '   ', total: 2 },
      ],
    })
    expect(texto).toContain('Em estoque (14): 07× A, 05× B, 02× —')
  })
})

describe('achatarDisponiveis', () => {
  it('junta os modelos de todas as categorias numa lista só', () => {
    expect(
      achatarDisponiveis([
        { modelos: [{ modelo: 'Notebook X', total: 3 }] },
        { modelos: [{ modelo: 'Monitor Y', total: 5 }, { modelo: 'Monitor Z', total: 1 }] },
      ]),
    ).toEqual([
      { modelo: 'Notebook X', total: 3 },
      { modelo: 'Monitor Y', total: 5 },
      { modelo: 'Monitor Z', total: 1 },
    ])
  })

  it('grupo sem modelo não deixa buraco', () => {
    expect(achatarDisponiveis([{ modelos: [] }])).toEqual([])
    expect(achatarDisponiveis([])).toEqual([])
  })
})
