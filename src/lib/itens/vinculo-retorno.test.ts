import { describe, expect, it } from 'vitest'
import {
  COM_VINCULO_TEXTO,
  MOTIVO_SEM_VINCULO_TEXTO,
  decidirVinculoRetorno,
  decidirVinculosDoLote,
  pessoaDaLinhaDeItem,
  type SaldoDaPessoa,
} from '@/lib/itens/vinculo-retorno'

const PESSOA = '11111111-1111-4111-8111-111111111111'
const saldo = (item_id: number, filial_id: number, com_a_pessoa: number): SaldoDaPessoa => ({
  item_id,
  filial_id,
  com_a_pessoa,
})

describe('decidirVinculoRetorno — a regra §C.3', () => {
  it('pessoa com saldo suficiente mantém o vínculo (a conta dela baixa)', () => {
    const d = decidirVinculoRetorno({
      colaboradorId: PESSOA,
      itemId: 3,
      filialId: 1,
      quantidade: 1,
      saldos: [saldo(3, 1, 2)],
    })
    expect(d).toEqual({ colaboradorId: PESSOA, motivoSemVinculo: null })
  })

  it('saldo exatamente igual à quantidade ainda mantém o vínculo', () => {
    const d = decidirVinculoRetorno({
      colaboradorId: PESSOA,
      itemId: 3,
      filialId: 1,
      quantidade: 2,
      saldos: [saldo(3, 1, 2)],
    })
    expect(d.colaboradorId).toBe(PESSOA)
  })

  it('ENTREGA ANTIGA: pessoa com saldo zero grava SEM vínculo, e não é erro', () => {
    const d = decidirVinculoRetorno({
      colaboradorId: PESSOA,
      itemId: 3,
      filialId: 1,
      quantidade: 1,
      saldos: [],
    })
    expect(d).toEqual({ colaboradorId: null, motivoSemVinculo: 'sem_saldo' })
  })

  it('saldo insuficiente (tem 1, devolve 2) também sai sem vínculo', () => {
    const d = decidirVinculoRetorno({
      colaboradorId: PESSOA,
      itemId: 3,
      filialId: 1,
      quantidade: 2,
      saldos: [saldo(3, 1, 1)],
    })
    expect(d.motivoSemVinculo).toBe('sem_saldo')
  })

  it('o saldo é por PAR (item, filial) — saldo de outra filial não conta', () => {
    const d = decidirVinculoRetorno({
      colaboradorId: PESSOA,
      itemId: 3,
      filialId: 1,
      quantidade: 1,
      saldos: [saldo(3, 2, 10)],
    })
    expect(d.motivoSemVinculo).toBe('sem_saldo')
  })

  it('o saldo é por par — saldo de outro item na mesma filial não conta', () => {
    const d = decidirVinculoRetorno({
      colaboradorId: PESSOA,
      itemId: 3,
      filialId: 1,
      quantidade: 1,
      saldos: [saldo(4, 1, 10)],
    })
    expect(d.motivoSemVinculo).toBe('sem_saldo')
  })

  it('nome digitado que não está no cadastro: sem vínculo, motivo próprio', () => {
    const d = decidirVinculoRetorno({
      colaboradorId: null,
      itemId: 3,
      filialId: 1,
      quantidade: 1,
      saldos: [saldo(3, 1, 5)],
    })
    expect(d).toEqual({ colaboradorId: null, motivoSemVinculo: 'sem_cadastro' })
  })

  it('devolução que não nomeia ninguém: sem vínculo, motivo próprio', () => {
    const d = decidirVinculoRetorno({
      colaboradorId: PESSOA,
      itemId: 3,
      filialId: 1,
      quantidade: 1,
      saldos: [saldo(3, 1, 5)],
      temNome: false,
    })
    expect(d).toEqual({ colaboradorId: null, motivoSemVinculo: 'sem_pessoa' })
  })

  it('todo motivo tem texto de tela, e nenhum deles fala de erro', () => {
    for (const texto of Object.values(MOTIVO_SEM_VINCULO_TEXTO)) {
      expect(texto.length).toBeGreaterThan(20)
      expect(texto.toLowerCase()).not.toContain('erro')
      expect(texto.toLowerCase()).not.toContain('falha')
    }
    expect(COM_VINCULO_TEXTO.length).toBeGreaterThan(20)
  })
})

describe('decidirVinculosDoLote — o saldo é consumido linha a linha', () => {
  it('duas linhas do MESMO par dividem o saldo: a segunda sai sem vínculo', () => {
    const r = decidirVinculosDoLote(
      [
        { itemId: 3, filialId: 1, quantidade: 1 },
        { itemId: 3, filialId: 1, quantidade: 1 },
      ],
      { colaboradorId: PESSOA, saldos: [saldo(3, 1, 1)] },
    )
    expect(r[0].colaboradorId).toBe(PESSOA)
    expect(r[1].colaboradorId).toBeNull()
    expect(r[1].motivoSemVinculo).toBe('sem_saldo')
  })

  it('saldo que cobre as duas mantém as duas vinculadas', () => {
    const r = decidirVinculosDoLote(
      [
        { itemId: 3, filialId: 1, quantidade: 1 },
        { itemId: 3, filialId: 1, quantidade: 1 },
      ],
      { colaboradorId: PESSOA, saldos: [saldo(3, 1, 2)] },
    )
    expect(r.every((l) => l.colaboradorId === PESSOA)).toBe(true)
  })

  it('pares diferentes não disputam saldo entre si', () => {
    const r = decidirVinculosDoLote(
      [
        { itemId: 3, filialId: 1, quantidade: 1 },
        { itemId: 4, filialId: 1, quantidade: 1 },
      ],
      { colaboradorId: PESSOA, saldos: [saldo(3, 1, 1), saldo(4, 1, 1)] },
    )
    expect(r.every((l) => l.colaboradorId === PESSOA)).toBe(true)
  })

  it('preserva os campos originais de cada linha', () => {
    const r = decidirVinculosDoLote([{ itemId: 3, filialId: 1, quantidade: 2, tipoSlug: 'cabo' }], {
      colaboradorId: PESSOA,
      saldos: [saldo(3, 1, 5)],
    })
    expect(r[0].tipoSlug).toBe('cabo')
    expect(r[0].quantidade).toBe(2)
  })

  it('lote vazio devolve lista vazia', () => {
    expect(decidirVinculosDoLote([], { colaboradorId: PESSOA, saldos: [] })).toEqual([])
  })

  it('sem pessoa no cadastro, nenhuma linha do lote se vincula', () => {
    const r = decidirVinculosDoLote(
      [
        { itemId: 3, filialId: 1, quantidade: 1 },
        { itemId: 4, filialId: 1, quantidade: 1 },
      ],
      { colaboradorId: null, saldos: [saldo(3, 1, 9), saldo(4, 1, 9)] },
    )
    expect(r.every((l) => l.colaboradorId === null && l.motivoSemVinculo === 'sem_cadastro')).toBe(
      true,
    )
  })
})

describe('pessoaDaLinhaDeItem — de onde sai a pessoa em cada caminho', () => {
  it('ENTREGA usa o campo Colaborador do formulário', () => {
    expect(
      pessoaDaLinhaDeItem({
        tipo: 'saida',
        colaboradorDoFormulario: 'Fulano Novo',
        detentorAtual: 'Ninguém Antigo',
      }),
    ).toBe('Fulano Novo')
  })

  it('DEVOLUÇÃO usa o DETENTOR do ativo — o formulário nem tem o campo', () => {
    expect(
      pessoaDaLinhaDeItem({
        tipo: 'retorno',
        colaboradorDoFormulario: null,
        detentorAtual: 'Fulano Detentor',
      }),
    ).toBe('Fulano Detentor')
  })

  it('devolução IGNORA o campo do formulário mesmo quando ele vem preenchido', () => {
    expect(
      pessoaDaLinhaDeItem({
        tipo: 'retorno',
        colaboradorDoFormulario: 'Alguém Que Não Devolveu',
        detentorAtual: 'Fulano Detentor',
      }),
    ).toBe('Fulano Detentor')
  })

  it('ativo sem detentor devolve null — e isso não é erro', () => {
    expect(
      pessoaDaLinhaDeItem({ tipo: 'retorno', colaboradorDoFormulario: 'X', detentorAtual: null }),
    ).toBeNull()
  })

  it('só espaço não é nome', () => {
    for (const v of ['   ', '', null, undefined]) {
      expect(
        pessoaDaLinhaDeItem({ tipo: 'saida', colaboradorDoFormulario: v, detentorAtual: 'Y' }),
      ).toBeNull()
    }
  })
})
