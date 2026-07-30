import { describe, expect, it } from 'vitest'
import {
  CAMPOS_CONFLITO,
  camposDivergentes,
  ladosComHistoricoReal,
  normalizarValor,
  resumoDaExclusao,
  type LadoConflito,
} from './conflitos'

// A comparação campo a campo é o coração da mesa: é ela que responde "o que difere entre os
// dois cadastros?". Se errar, a tela realça o campo errado — e alguém apaga o cadastro
// errado por causa disso. Por isso é função pura e por isso tem teste próprio.

function lado(over: Partial<LadoConflito> = {}): LadoConflito {
  return {
    ativoId: '11111111-1111-4111-8111-111111111111',
    patrimonio: 'WAP0001234',
    serviceTag: 'ST-A',
    filialId: 1,
    filialSlug: 'matriz',
    filialNome: 'Matriz',
    status: 'em_estoque',
    categoria: 'notebook',
    marca: 'Dell',
    modelo: 'Latitude 5420',
    hostname: 'NB-0001',
    colaborador: null,
    setor: null,
    origem: 'importacao',
    pendencia: null,
    entradaEm: '2026-07-01',
    atualizadoEm: '2026-07-01T00:00:00Z',
    movimentacoes: 1,
    movimentacoesReais: 0,
    ultimaMovData: '2026-07-01',
    ultimaMovTipo: 'compra',
    termos: 0,
    temHistoricoReal: false,
    ...over,
  }
}

describe('normalizarValor — ausência tem uma forma só', () => {
  it('null, undefined e string só de espaço são a MESMA ausência', () => {
    // Sem isto, um lado com marca '' e outro com marca null apareceriam como
    // divergentes — e os dois são "sem marca".
    expect(normalizarValor(null)).toBeNull()
    expect(normalizarValor(undefined)).toBeNull()
    expect(normalizarValor('')).toBeNull()
    expect(normalizarValor('   ')).toBeNull()
  })

  it('apara as pontas mas preserva o conteúdo', () => {
    expect(normalizarValor('  Dell  ')).toBe('Dell')
    expect(normalizarValor(0)).toBe('0')
  })
})

describe('camposDivergentes', () => {
  it('grupo com menos de dois lados não tem o que comparar', () => {
    expect(camposDivergentes([]).size).toBe(0)
    expect(camposDivergentes([lado()]).size).toBe(0)
  })

  it('lados idênticos não acendem nada', () => {
    expect(camposDivergentes([lado(), lado({ ativoId: 'outro' })]).size).toBe(0)
  })

  it('acende só os campos que realmente diferem', () => {
    const d = camposDivergentes([
      lado(),
      lado({ ativoId: 'b', status: 'em_uso', colaborador: 'Fulano de Teste' }),
    ])
    expect([...d].sort()).toEqual(['colaborador', 'status'])
  })

  it('vazio × null NÃO é divergência (os dois são ausência)', () => {
    const d = camposDivergentes([lado({ marca: null }), lado({ ativoId: 'b', marca: '  ' })])
    expect(d.has('marca')).toBe(false)
  })

  it('maiúscula É divergência — são cadastros digitados por pessoas diferentes', () => {
    // Decisão registrada: normalizar caixa esconderia justamente a pista que a mesa
    // existe para mostrar ("Dell" num lado, "DELL" no outro).
    const d = camposDivergentes([lado(), lado({ ativoId: 'b', marca: 'DELL' })])
    expect(d.has('marca')).toBe(true)
  })

  it('a FILIAL não entra no diff — ela difere sempre, por definição', () => {
    // Um realce que acende em 100% dos casos não informa nada. A filial ganha destaque
    // próprio no cabeçalho de cada lado.
    const chaves = CAMPOS_CONFLITO.map((c) => c.chave) as string[]
    expect(chaves).not.toContain('filialNome')
    expect(chaves).not.toContain('filialId')
    expect(chaves).not.toContain('filialSlug')
  })

  it('funciona com TRÊS lados (a ordem §1.2 proíbe forçar par)', () => {
    const d = camposDivergentes([
      lado({ modelo: 'A' }),
      lado({ ativoId: 'b', modelo: 'A' }),
      lado({ ativoId: 'c', modelo: 'B' }),
    ])
    expect(d.has('modelo')).toBe(true)
  })
})

describe('ladosComHistoricoReal / resumoDaExclusao', () => {
  it('o selo vem do banco e não é recalculado na tela', () => {
    // A definição de "carga do import" mora em `mov_da_carga_import` (migration 0092),
    // medida sobre o marcador real que a RPC grava. Duas cópias dariam telas que discordam.
    const comVida = lado({ ativoId: 'a', temHistoricoReal: true, movimentacoesReais: 3 })
    const soCarga = lado({ ativoId: 'b', temHistoricoReal: false })
    expect(ladosComHistoricoReal([comVida, soCarga])).toEqual([comVida])
  })

  it('o resumo do diálogo soma o que morre junto e agrupa por filial', () => {
    const r = resumoDaExclusao([
      lado({ ativoId: 'a', filialNome: 'Serra', movimentacoes: 2, termos: 1 }),
      lado({ ativoId: 'b', filialNome: 'Serra', movimentacoes: 1, termos: 0 }),
      lado({
        ativoId: 'c',
        filialNome: 'Linhares',
        movimentacoes: 5,
        termos: 2,
        temHistoricoReal: true,
      }),
    ])
    expect(r.ativos).toBe(3)
    expect(r.movimentacoes).toBe(8)
    expect(r.termos).toBe(3)
    expect(r.porFilial).toEqual([
      { filial: 'Linhares', ativos: 1 },
      { filial: 'Serra', ativos: 2 },
    ])
    expect(r.comHistoricoReal.map((l) => l.ativoId)).toEqual(['c'])
  })

  it('seleção vazia devolve zeros, sem estourar', () => {
    const r = resumoDaExclusao([])
    expect(r).toEqual({
      ativos: 0,
      movimentacoes: 0,
      termos: 0,
      porFilial: [],
      comHistoricoReal: [],
    })
  })
})
