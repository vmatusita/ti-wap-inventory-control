import { describe, it, expect } from 'vitest'
import {
  camposVisiveis,
  derivarOpcoesCampo,
  filtrarLinhas,
  agregarResumo,
  chaveResumoMotivo,
  type CampoFiltro,
} from '@/components/relatorios/use-filtros-tabela'

// Rede de paridade do núcleo puro do `useFiltrosTabela` (OS tech-debt 3.2). A
// verificação de Ut/UX é visual (/verify), mas estas funções carregam a lógica
// que precisa continuar idêntica: derivação de opções (ordem!), filtragem e o
// resumo top-12. Testes deterministas, sem React.

type Linha = {
  filial: string
  categoria: 'notebook' | 'celular' | 'monitor' | 'desktop' | 'tablet' | 'outro'
  motivo: string | null
  tipo: 'saida' | 'devolucao' | 'compra' | 'emprestimo'
}

const linha = (p: Partial<Linha>): Linha => ({
  filial: 'Matriz',
  categoria: 'notebook',
  motivo: 'Novo colaborador',
  tipo: 'saida',
  ...p,
})

describe('camposVisiveis', () => {
  const campos: CampoFiltro[] = ['filial', 'categoria', 'motivo']

  it('esconde a filial fora do consolidado', () => {
    expect(camposVisiveis(campos, false)).toEqual(['categoria', 'motivo'])
    expect(camposVisiveis(campos, undefined)).toEqual(['categoria', 'motivo'])
  })

  it('mostra a filial no consolidado', () => {
    expect(camposVisiveis(campos, true)).toEqual(['filial', 'categoria', 'motivo'])
  })

  it('preserva a ordem declarada dos demais campos', () => {
    expect(camposVisiveis(['filial', 'categoria', 'tipo'], true)).toEqual([
      'filial',
      'categoria',
      'tipo',
    ])
  })
})

describe('derivarOpcoesCampo', () => {
  it('categoria = ordem canônica fixa (todas, mesmo ausentes nos dados)', () => {
    const opcoes = derivarOpcoesCampo([linha({ categoria: 'monitor' })], 'categoria')
    expect(opcoes.map((o) => o.valor)).toEqual([
      'notebook',
      'celular',
      'monitor',
      'desktop',
      'tablet',
      'outro',
    ])
    expect(opcoes[0]).toEqual({ valor: 'notebook', rotulo: 'Notebook' })
  })

  it('tipo = ordem de aparição, sem ordenar, sem repetir', () => {
    const rows = [
      linha({ tipo: 'devolucao' }),
      linha({ tipo: 'compra' }),
      linha({ tipo: 'devolucao' }),
    ]
    const opcoes = derivarOpcoesCampo(rows, 'tipo')
    expect(opcoes.map((o) => o.valor)).toEqual(['devolucao', 'compra'])
    expect(opcoes.map((o) => o.rotulo)).toEqual(['Devolução', 'Compra'])
  })

  it('filial = únicos, ordenados pt-BR', () => {
    const rows = [
      linha({ filial: 'São Paulo' }),
      linha({ filial: 'Araucária' }),
      linha({ filial: 'São Paulo' }),
      linha({ filial: 'Matriz' }),
    ]
    const opcoes = derivarOpcoesCampo(rows, 'filial')
    expect(opcoes.map((o) => o.valor)).toEqual(['Araucária', 'Matriz', 'São Paulo'])
  })

  it('motivo = únicos não-nulos, ordenados pt-BR', () => {
    const rows = [
      linha({ motivo: 'Troca' }),
      linha({ motivo: null }),
      linha({ motivo: 'Avaria' }),
      linha({ motivo: 'Troca' }),
    ]
    const opcoes = derivarOpcoesCampo(rows, 'motivo')
    expect(opcoes.map((o) => o.valor)).toEqual(['Avaria', 'Troca'])
  })
})

describe('filtrarLinhas', () => {
  const rows = [
    linha({ filial: 'Matriz', categoria: 'notebook', motivo: 'Troca' }),
    linha({ filial: 'Araucária', categoria: 'celular', motivo: 'Avaria' }),
    linha({ filial: 'Matriz', categoria: 'celular', motivo: null }),
  ]
  const vazio = { filial: '', categoria: '', motivo: '', tipo: '' }

  it('sem filtro devolve tudo', () => {
    expect(filtrarLinhas(rows, ['filial', 'categoria', 'motivo'], vazio)).toHaveLength(3)
  })

  it('casa exato em um campo', () => {
    const out = filtrarLinhas(rows, ['filial', 'categoria', 'motivo'], { ...vazio, filial: 'Matriz' })
    expect(out).toHaveLength(2)
  })

  it('combina campos (AND)', () => {
    const out = filtrarLinhas(rows, ['filial', 'categoria', 'motivo'], {
      ...vazio,
      filial: 'Matriz',
      categoria: 'celular',
    })
    expect(out).toHaveLength(1)
    expect(out[0].motivo).toBeNull()
  })

  it('motivo nulo é excluído quando há filtro de motivo', () => {
    const out = filtrarLinhas(rows, ['motivo'], { ...vazio, motivo: 'Troca' })
    expect(out).toHaveLength(1)
    expect(out[0].filial).toBe('Matriz')
  })

  it('campos fora da lista ativa não filtram', () => {
    // 'filial' não está nos campos ativos → o valor não restringe.
    const out = filtrarLinhas(rows, ['categoria'], { ...vazio, filial: 'Matriz', categoria: 'celular' })
    expect(out).toHaveLength(2)
  })
})

describe('agregarResumo', () => {
  it('conta por chave e ordena decrescente', () => {
    const rows = [
      linha({ motivo: 'Troca' }),
      linha({ motivo: 'Avaria' }),
      linha({ motivo: 'Troca' }),
      linha({ motivo: 'Troca' }),
    ]
    const out = agregarResumo(rows, (r) => chaveResumoMotivo(r, false))
    expect(out).toEqual([
      ['Troca', 3],
      ['Avaria', 1],
    ])
  })

  it('no consolidado agrupa por "filial · motivo"', () => {
    const rows = [
      linha({ filial: 'Matriz', motivo: 'Troca' }),
      linha({ filial: 'Araucária', motivo: 'Troca' }),
      linha({ filial: 'Matriz', motivo: 'Troca' }),
    ]
    const out = agregarResumo(rows, (r) => chaveResumoMotivo(r, true))
    expect(out).toEqual([
      ['Matriz · Troca', 2],
      ['Araucária · Troca', 1],
    ])
  })

  it('limita a 12 chaves', () => {
    const rows = Array.from({ length: 20 }, (_, i) => linha({ motivo: `Motivo ${i}` }))
    expect(agregarResumo(rows, (r) => chaveResumoMotivo(r, false))).toHaveLength(12)
  })

  it('motivo nulo vira "Outro"', () => {
    const out = agregarResumo([linha({ motivo: null })], (r) => chaveResumoMotivo(r, false))
    expect(out).toEqual([['Outro', 1]])
  })
})

describe('chaveResumoMotivo', () => {
  it('consolidado prefixa a filial; por-filial usa só o motivo', () => {
    expect(chaveResumoMotivo({ filial: 'Matriz', motivo: 'Troca' }, true)).toBe('Matriz · Troca')
    expect(chaveResumoMotivo({ filial: 'Matriz', motivo: 'Troca' }, false)).toBe('Troca')
    expect(chaveResumoMotivo({ filial: 'Matriz', motivo: null }, true)).toBe('Matriz · Outro')
  })
})
