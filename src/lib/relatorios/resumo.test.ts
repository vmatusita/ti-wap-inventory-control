import { describe, it, expect } from 'vitest'
import { gerarTextoResumo } from '@/lib/relatorios/resumo'
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
