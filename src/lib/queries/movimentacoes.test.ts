import { describe, expect, it } from 'vitest'
import { interpretarBuscaMovimentacao } from '@/lib/queries/movimentacoes'

// F11/M8 — a busca da lista de movimentações é de CAMPO ÚNICO (decisão do
// Johnny): o PostgREST não faz `OR` entre a tabela e um embed, então o termo
// precisa escolher UM lado. Quem escolhe é esta função pura.
// Dados 100% fictícios (CLAUDE.md regra 2).
describe('interpretarBuscaMovimentacao', () => {
  it('sem termo (vazio, só espaços, null/undefined) não filtra nada', () => {
    expect(interpretarBuscaMovimentacao('')).toBeNull()
    expect(interpretarBuscaMovimentacao('   ')).toBeNull()
    expect(interpretarBuscaMovimentacao(null)).toBeNull()
    expect(interpretarBuscaMovimentacao(undefined)).toBeNull()
  })

  it('texto que canonicaliza vira busca por PATRIMÔNIO (igualdade)', () => {
    expect(interpretarBuscaMovimentacao('WAP0001234')).toEqual({
      campo: 'patrimonio',
      valor: 'WAP0001234',
    })
  })

  it('canonicaliza as grafias soltas do dia a dia', () => {
    // espaço, minúscula, hífen e zeros à esquerda ausentes
    for (const bruto of ['wap 4491', 'WAP4491', 'wap-4491', 'Wap0004491']) {
      expect(interpretarBuscaMovimentacao(bruto)).toEqual({
        campo: 'patrimonio',
        valor: 'WAP0004491',
      })
    }
  })

  it('nome de pessoa cai na busca por COLABORADOR', () => {
    expect(interpretarBuscaMovimentacao('  Fulano da Silva ')).toEqual({
      campo: 'colaborador',
      valor: 'Fulano da Silva',
    })
  })

  it('número solto não é patrimônio (falta o prefixo) — vai para colaborador', () => {
    expect(interpretarBuscaMovimentacao('4491')).toEqual({
      campo: 'colaborador',
      valor: '4491',
    })
  })

  it('neutraliza os curingas do ILIKE virando espaço (não colando as palavras)', () => {
    expect(interpretarBuscaMovimentacao('Fulano%Silva')).toEqual({
      campo: 'colaborador',
      valor: 'Fulano Silva',
    })
    expect(interpretarBuscaMovimentacao('Bel_trano')).toEqual({
      campo: 'colaborador',
      valor: 'Bel trano',
    })
    expect(interpretarBuscaMovimentacao('Fulano, (TI)')).toEqual({
      campo: 'colaborador',
      valor: 'Fulano TI',
    })
  })

  it('termo só de curinga NÃO vira filtro (senão `%%` esconderia linhas sem colaborador)', () => {
    expect(interpretarBuscaMovimentacao('%%%')).toBeNull()
    expect(interpretarBuscaMovimentacao('*')).toBeNull()
  })

  it('mais de 7 dígitos significativos não é patrimônio válido', () => {
    expect(interpretarBuscaMovimentacao('WAP12345678')).toEqual({
      campo: 'colaborador',
      valor: 'WAP12345678',
    })
  })
})
