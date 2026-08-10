import { describe, expect, it } from 'vitest'
import { paresDeTransferencia } from '@/lib/relatorios/transferencias-resumo'

// Nomes de filial fictícios (CLAUDE.md).
const linha = (de: string, para: string) => ({ de, para })

describe('paresDeTransferencia', () => {
  it('agrupa por origem → destino', () => {
    expect(
      paresDeTransferencia([
        linha('Matriz', 'Serra Park'),
        linha('Matriz', 'Serra Park'),
        linha('Serra Park', 'Matriz'),
      ]),
    ).toEqual([
      { de: 'Matriz', para: 'Serra Park', total: 2 },
      { de: 'Serra Park', para: 'Matriz', total: 1 },
    ])
  })

  it('origem → destino NÃO é o mesmo que destino → origem', () => {
    const pares = paresDeTransferencia([linha('Matriz', 'Filial Sul'), linha('Filial Sul', 'Matriz')])
    expect(pares).toHaveLength(2)
    expect(pares.every((p) => p.total === 1)).toBe(true)
  })

  it('a soma dos pares é o número de linhas — o resumo não muda contagem', () => {
    const linhas = [
      linha('Matriz', 'Serra Park'),
      linha('Matriz', 'Filial Sul'),
      linha('Matriz', 'Serra Park'),
      linha('Filial Sul', 'Matriz'),
      linha('Filial Sul', 'Matriz'),
    ]
    const total = paresDeTransferencia(linhas).reduce((t, p) => t + p.total, 0)
    expect(total).toBe(linhas.length)
  })

  it('ordena do par mais movimentado para o menos', () => {
    const pares = paresDeTransferencia([
      linha('A', 'B'),
      linha('C', 'D'),
      linha('C', 'D'),
      linha('C', 'D'),
    ])
    expect(pares.map((p) => p.total)).toEqual([3, 1])
  })

  it('empate desempata por nome — o snapshot congela sempre a mesma ordem', () => {
    const direta = paresDeTransferencia([linha('Zeta', 'Alfa'), linha('Alfa', 'Zeta')])
    const invertida = paresDeTransferencia([linha('Alfa', 'Zeta'), linha('Zeta', 'Alfa')])
    expect(direta).toEqual(invertida)
    expect(direta[0]).toEqual({ de: 'Alfa', para: 'Zeta', total: 1 })
  })

  it('lista vazia devolve vazio (a linha de chips não renderiza)', () => {
    expect(paresDeTransferencia([])).toEqual([])
  })

  it('filial ausente vira travessão em vez de "undefined"', () => {
    const pares = paresDeTransferencia([
      { de: null, para: 'Matriz' } as unknown as { de: string; para: string },
    ])
    expect(pares).toEqual([{ de: '—', para: 'Matriz', total: 1 }])
  })
})
