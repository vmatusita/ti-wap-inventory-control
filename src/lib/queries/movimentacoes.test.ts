import { describe, expect, it } from 'vitest'
import {
  interpretarBuscaMovimentacao,
  patrimoniosAmbiguosNaPagina,
} from '@/lib/queries/movimentacoes'

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

// Patrimônio repete em casos raros (spec §5): buscar `WAP0001234` na lista traz
// o histórico dos DOIS ativos intercalado, e a tabela precisa marcar quais
// linhas exigem a service tag para desempatar.
// Dados 100% fictícios (CLAUDE.md regra 2).
describe('patrimoniosAmbiguosNaPagina', () => {
  it('página sem linhas não tem ambiguidade', () => {
    expect(patrimoniosAmbiguosNaPagina([])).toEqual(new Set())
  })

  it('o MESMO ativo em várias linhas NÃO é duplicidade', () => {
    const linhas = [
      { ativo_id: 'a1', patrimonio: 'WAP0001234' },
      { ativo_id: 'a1', patrimonio: 'WAP0001234' },
      { ativo_id: 'a1', patrimonio: 'WAP0001234' },
    ]
    expect(patrimoniosAmbiguosNaPagina(linhas)).toEqual(new Set())
  })

  it('dois ATIVOS distintos com o mesmo patrimônio marcam o patrimônio', () => {
    const linhas = [
      { ativo_id: 'a1', patrimonio: 'WAP0001234' },
      { ativo_id: 'a2', patrimonio: 'WAP0001234' },
      { ativo_id: 'a3', patrimonio: 'WAP0005678' },
    ]
    expect(patrimoniosAmbiguosNaPagina(linhas)).toEqual(
      new Set(['WAP0001234']),
    )
  })

  it('ativos sem patrimônio (F7E) não contam como duplicidade entre si', () => {
    const linhas = [
      { ativo_id: 'a1', patrimonio: null },
      { ativo_id: 'a2', patrimonio: null },
      { ativo_id: 'a3', patrimonio: 'WAP0001234' },
    ]
    expect(patrimoniosAmbiguosNaPagina(linhas)).toEqual(new Set())
  })
})
