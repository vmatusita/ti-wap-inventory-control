import { describe, expect, it } from 'vitest'
import { MAX_CORRECOES, parseCorrecoes, parseCorrecoesJson } from './importar'

// Recorte ESTRUTURAL das correções do import (OS-F7B / W3 · contrato §1.5). Esta
// é a primeira linha de defesa do servidor: o que passa daqui vai para o motor.
// O que depende de CSV/layout/filial (site conhecido, estado→descartado, campo
// fora do layout) é do motor (`correcao_invalida`) e NÃO se testa aqui.
// Dados 100% fictícios.

describe('parseCorrecoes — o que passa', () => {
  it('aceita as quatro ops do contrato', () => {
    const r = parseCorrecoes([
      { op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' },
      { op: 'substituir_estado', statusDe: 'Estoque', situacaoDe: 'Estoqe', para: 'Estoque' },
      { op: 'editar', linha: 7, campo: 'patrimonio', para: 'WAP0001234' },
      { op: 'remover_linha', linha: 9 },
    ])
    expect(r.ok).toBe(true)
  })

  it('lista vazia e `correcoes` ausente valem `[]`', () => {
    expect(parseCorrecoes([])).toEqual({ ok: true, correcoes: [] })
    expect(parseCorrecoesJson(null)).toEqual({ ok: true, correcoes: [] })
    expect(parseCorrecoesJson('')).toEqual({ ok: true, correcoes: [] })
  })

  it('apara `para` e `de` (célula corrigida = célula digitada na planilha)', () => {
    const r = parseCorrecoes([{ op: 'editar', linha: 3, campo: 'colaborador', para: '  Fulano de Tal / TI  ' }])
    expect(r.ok && r.correcoes[0]).toMatchObject({ para: 'Fulano de Tal / TI' })
  })

  it('aceita `de` vazio — Site em branco é um caso real de site desconhecido', () => {
    expect(parseCorrecoes([{ op: 'substituir', campo: 'site', de: '', para: 'Matriz' }]).ok).toBe(true)
  })

  it('aceita data válida e passada em editar (data é sempre linha a linha)', () => {
    expect(
      parseCorrecoes([{ op: 'editar', linha: 2, campo: 'dataInclusao', para: '05/03/2020' }]).ok,
    ).toBe(true)
    expect(
      parseCorrecoes([{ op: 'editar', linha: 2, campo: 'dataEntrega', para: '05/03/2020' }]).ok,
    ).toBe(true)
  })
})

describe('parseCorrecoes — o que o servidor barra', () => {
  it('recusa `substituir` de patrimônio/service tag (nunca em massa — §3.2)', () => {
    for (const campo of ['patrimonio', 'serviceTag']) {
      const r = parseCorrecoes([{ op: 'substituir', campo, de: 'WAP0001234', para: 'WAP0009999' }])
      expect(r.ok).toBe(false)
      expect(r.ok === false && r.erro).toContain('linha a linha')
    }
  })

  it('recusa `substituir` de data (revisão adversarial da F7B — alcançaria linha sem erro)', () => {
    // A troca em massa só é exata quando toda célula que casa é errada. Em data
    // não é: linha com Inclusão vazia + Entrega válida não tem aviso e casaria
    // com `de: ''`, tendo a dataEntrada mudada em silêncio. Só `editar`.
    for (const campo of ['dataInclusao', 'dataEntrega']) {
      const r = parseCorrecoes([{ op: 'substituir', campo, de: '', para: '05/03/2020' }])
      expect(r.ok).toBe(false)
      expect(r.ok === false && r.erro).toContain('linha a linha')
    }
  })

  it('recusa campo fora da whitelist (nada de editor genérico)', () => {
    const r = parseCorrecoes([{ op: 'editar', linha: 2, campo: 'marca', para: 'X' }])
    expect(r.ok).toBe(false)
  })

  it('recusa op desconhecida', () => {
    expect(parseCorrecoes([{ op: 'apagar_tudo', linha: 2 }]).ok).toBe(false)
  })

  it('recusa data inválida e data futura (mesma régua do CSV)', () => {
    const invalida = parseCorrecoes([{ op: 'editar', linha: 2, campo: 'dataInclusao', para: '31/02/2026' }])
    expect(invalida.ok).toBe(false)
    expect(invalida.ok === false && invalida.erro).toContain('dd/MM/aaaa')

    const futura = parseCorrecoes([{ op: 'editar', linha: 2, campo: 'dataInclusao', para: '01/01/2099' }])
    expect(futura.ok).toBe(false)
    expect(futura.ok === false && futura.erro).toContain('futura')
  })

  it('recusa `para` vazio ou só espaços', () => {
    expect(parseCorrecoes([{ op: 'editar', linha: 2, campo: 'colaborador', para: '   ' }]).ok).toBe(false)
    expect(parseCorrecoes([{ op: 'substituir', campo: 'tipo', de: 'X', para: '' }]).ok).toBe(false)
  })

  it('recusa linha < 2 (a linha 1 é o cabeçalho) e linha não inteira', () => {
    expect(parseCorrecoes([{ op: 'remover_linha', linha: 1 }]).ok).toBe(false)
    expect(parseCorrecoes([{ op: 'remover_linha', linha: 0 }]).ok).toBe(false)
    expect(parseCorrecoes([{ op: 'remover_linha', linha: 2.5 }]).ok).toBe(false)
  })

  it(`recusa mais de ${MAX_CORRECOES} ops (teto anti-payload; F7D)`, () => {
    const uma = { op: 'remover_linha', linha: 2 }
    expect(parseCorrecoes(Array.from({ length: MAX_CORRECOES }, () => uma)).ok).toBe(true)
    const demais = parseCorrecoes(Array.from({ length: MAX_CORRECOES + 1 }, () => uma))
    expect(demais.ok).toBe(false)
    expect(demais.ok === false && demais.erro).toContain('Correções demais')
  })

  it('aponta QUAL correção falhou', () => {
    const r = parseCorrecoes([
      { op: 'remover_linha', linha: 2 },
      { op: 'remover_linha', linha: 1 },
    ])
    expect(r.ok === false && r.erro).toContain('correção 2')
  })

  it('recusa payload que não é lista', () => {
    expect(parseCorrecoes({ op: 'remover_linha', linha: 2 }).ok).toBe(false)
    expect(parseCorrecoes('[]').ok).toBe(false)
  })
})

describe('parseCorrecoesJson — JSON malformado nunca vira throw cru', () => {
  it('devolve erro em pt-BR', () => {
    const r = parseCorrecoesJson('{isso não é json')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.erro).toContain('correções')
  })

  it('valida o conteúdo depois de desserializar', () => {
    expect(parseCorrecoesJson('[{"op":"remover_linha","linha":1}]').ok).toBe(false)
    expect(parseCorrecoesJson('[{"op":"remover_linha","linha":5}]').ok).toBe(true)
  })
})
