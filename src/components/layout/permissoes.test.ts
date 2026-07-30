import { describe, expect, it } from 'vitest'
import { filiaisParaEscrita, podeEscreverNaFilial } from './permissoes'
import type { Permissoes } from './permissoes'

// F21 — o gating de UI que depende do VÍNCULO de filiais. A hierarquia pura já é
// coberta por `src/lib/auth/papeis.test.ts`; aqui provamos os dois casos que
// custaram comentário no módulo: o admin numa filial FORA da lista de ativas e o
// recorte de um select de escrita preservando a ordem da lista de leitura.

const FILIAIS = [
  { id: 1, slug: 'matriz', nome: 'Matriz' },
  { id: 2, slug: 'filial-b', nome: 'Filial B' },
  { id: 3, slug: 'filial-c', nome: 'Filial C' },
]

const admin: Permissoes = { papel: 'admin', filiaisEscrita: [1, 2, 3] }
const operador: Permissoes = { papel: 'operador', filiaisEscrita: [2] }
const consulta: Permissoes = { papel: 'consulta', filiaisEscrita: [] }
const operadorSemVinculo: Permissoes = { papel: 'operador', filiaisEscrita: [] }

describe('podeEscreverNaFilial', () => {
  it('admin escreve em qualquer filial, inclusive fora da lista de ativas', () => {
    expect(podeEscreverNaFilial(admin, 1)).toBe(true)
    // 99 = filial desativada (ativo de import antigo): o banco deixa o admin
    // escrever, então a UI não pode esconder o botão.
    expect(podeEscreverNaFilial(admin, 99)).toBe(true)
  })

  it('operador escreve só na filial vinculada', () => {
    expect(podeEscreverNaFilial(operador, 2)).toBe(true)
    expect(podeEscreverNaFilial(operador, 1)).toBe(false)
    expect(podeEscreverNaFilial(operador, 99)).toBe(false)
  })

  it('consulta e operador sem vínculo não escrevem em lugar nenhum', () => {
    expect(podeEscreverNaFilial(consulta, 1)).toBe(false)
    expect(podeEscreverNaFilial(operadorSemVinculo, 1)).toBe(false)
  })

  it('filial ausente e sessão ausente nunca liberam', () => {
    expect(podeEscreverNaFilial(operador, null)).toBe(false)
    expect(podeEscreverNaFilial(admin, null)).toBe(false)
    expect(podeEscreverNaFilial(null, 1)).toBe(false)
    expect(podeEscreverNaFilial(undefined, 1)).toBe(false)
  })
})

describe('filiaisParaEscrita', () => {
  it('admin recebe a lista inteira, na mesma ordem', () => {
    expect(filiaisParaEscrita(admin, FILIAIS)).toEqual(FILIAIS)
  })

  it('operador recebe só as vinculadas', () => {
    expect(filiaisParaEscrita(operador, FILIAIS).map((f) => f.slug)).toEqual(['filial-b'])
  })

  it('consulta, operador sem vínculo e sem sessão recebem lista vazia', () => {
    expect(filiaisParaEscrita(consulta, FILIAIS)).toEqual([])
    expect(filiaisParaEscrita(operadorSemVinculo, FILIAIS)).toEqual([])
    expect(filiaisParaEscrita(null, FILIAIS)).toEqual([])
  })

  it('vínculo em filial que não está na lista da tela é ignorado', () => {
    const fantasma: Permissoes = { papel: 'operador', filiaisEscrita: [2, 42] }
    expect(filiaisParaEscrita(fantasma, FILIAIS).map((f) => f.id)).toEqual([2])
  })
})
