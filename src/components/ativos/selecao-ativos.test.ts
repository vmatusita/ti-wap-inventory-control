import { describe, expect, it } from 'vitest'
import {
  alternarSelecao,
  estadoDoCabecalho,
  marcarTodosDaPagina,
  MAX_SELECAO,
  podarForaDaPagina,
  textoCopiavel,
} from './selecao-ativos'
import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import { TAMANHOS_PAGINA } from '@/lib/ativos/lista'

// ATV-03 (F30) — a lista mostra até 100 linhas e o lote aceita 30. Esse
// descompasso é a razão de existir deste módulo, e destes testes.

const ids = (n: number, base = 0) => Array.from({ length: n }, (_, i) => `id-${base + i}`)

describe('o teto da seleção é o teto do lote', () => {
  it('MAX_SELECAO não é um número digitado — é MAX_LOTE_MOVIMENTACAO', () => {
    expect(MAX_SELECAO).toBe(MAX_LOTE_MOVIMENTACAO)
  })

  it('a maior página cabe mais ativos do que o lote (é por isso que há corte)', () => {
    expect(Math.max(...TAMANHOS_PAGINA)).toBeGreaterThan(MAX_SELECAO)
  })
})

describe('alternarSelecao', () => {
  it('marca e desmarca sem tocar no conjunto original', () => {
    const atual = new Set(['a'])
    const r = alternarSelecao(atual, 'b', true)
    expect([...r.proxima]).toEqual(['a', 'b'])
    expect([...atual]).toEqual(['a'])
    expect(r.entraram).toBe(1)

    const r2 = alternarSelecao(r.proxima, 'a', false)
    expect([...r2.proxima]).toEqual(['b'])
    expect(r2.foraPeloTeto).toBe(0)
  })

  it('marcar de novo o que já está marcado não muda nada nem avisa', () => {
    const r = alternarSelecao(new Set(['a']), 'a', true)
    expect([...r.proxima]).toEqual(['a'])
    expect(r.entraram).toBe(0)
    expect(r.foraPeloTeto).toBe(0)
  })

  it('desmarcar o que não está marcado é inofensivo', () => {
    const r = alternarSelecao(new Set(['a']), 'zzz', false)
    expect([...r.proxima]).toEqual(['a'])
  })

  // O caso da ordem de serviço: "ao tentar selecionar o 31º, recuse com toast".
  it('recusa o 31º e sinaliza o teto', () => {
    const cheio = new Set(ids(MAX_SELECAO))
    const r = alternarSelecao(cheio, 'sobrando', true)
    expect(r.proxima.size).toBe(MAX_SELECAO)
    expect(r.proxima.has('sobrando')).toBe(false)
    expect(r.foraPeloTeto).toBe(1)
  })

  it('com o teto cheio, DESMARCAR continua funcionando (senão trava o operador)', () => {
    const cheio = new Set(ids(MAX_SELECAO))
    const r = alternarSelecao(cheio, 'id-0', false)
    expect(r.proxima.size).toBe(MAX_SELECAO - 1)
    expect(r.foraPeloTeto).toBe(0)
  })
})

describe('marcarTodosDaPagina', () => {
  it('marca a página inteira quando ela cabe', () => {
    const r = marcarTodosDaPagina(new Set(), ids(5), true)
    expect(r.proxima.size).toBe(5)
    expect(r.entraram).toBe(5)
    expect(r.foraPeloTeto).toBe(0)
  })

  it('numa página de 100, leva 30 e diz que 70 ficaram de fora', () => {
    const pagina = ids(100)
    const r = marcarTodosDaPagina(new Set(), pagina, true)
    expect(r.proxima.size).toBe(MAX_SELECAO)
    expect(r.entraram).toBe(MAX_SELECAO)
    expect(r.foraPeloTeto).toBe(100 - MAX_SELECAO)
    // Leva os PRIMEIROS, na ordem da página — é a ordem que o operador ordenou.
    expect([...r.proxima]).toEqual(pagina.slice(0, MAX_SELECAO))
  })

  it('respeita o que já estava marcado ao completar o teto', () => {
    const jaMarcados = new Set(ids(28))
    const r = marcarTodosDaPagina(jaMarcados, ids(10, 100), true)
    expect(r.entraram).toBe(2)
    expect(r.foraPeloTeto).toBe(8)
    expect(r.proxima.size).toBe(MAX_SELECAO)
  })

  it('não recontabiliza como excedente o que já estava marcado', () => {
    const pagina = ids(5)
    const r = marcarTodosDaPagina(new Set(pagina), pagina, true)
    expect(r.entraram).toBe(0)
    expect(r.foraPeloTeto).toBe(0)
  })

  it('desmarcar tira só os ids desta página', () => {
    const atual = new Set([...ids(3), 'de-outra-pagina'])
    const r = marcarTodosDaPagina(atual, ids(3), false)
    expect([...r.proxima]).toEqual(['de-outra-pagina'])
  })

  it('página vazia não muda nada', () => {
    const r = marcarTodosDaPagina(new Set(['a']), [], true)
    expect([...r.proxima]).toEqual(['a'])
  })
})

describe('estadoDoCabecalho', () => {
  it('vazio, parcial e cheio', () => {
    const pagina = ids(3)
    expect(estadoDoCabecalho(new Set(), pagina)).toBe(false)
    expect(estadoDoCabecalho(new Set(['id-0']), pagina)).toBe('indeterminate')
    expect(estadoDoCabecalho(new Set(pagina), pagina)).toBe(true)
  })

  it('página vazia nunca fica marcada', () => {
    expect(estadoDoCabecalho(new Set(['a']), [])).toBe(false)
  })

  it('seleção de fora da página não conta como cheia', () => {
    // 3 marcados, mas nenhum é desta página: o cabeçalho tem de dizer "vazio".
    expect(estadoDoCabecalho(new Set(ids(3, 90)), ids(3))).toBe(false)
  })

  // O defeito relatado em produção: página de 100 com o teto de 30 marcados.
  // Enquanto isto lia 'indeterminate', o Radix mandava `true` no clique
  // seguinte, `marcarTodosDaPagina` não tinha o que acrescentar e a seleção em
  // massa não se desfazia pelo cabeçalho — só uma a uma.
  it('teto cheio lê CHEIO, não parcial — é o que faz o 2º clique limpar', () => {
    const pagina = ids(100)
    const marcados = new Set(pagina.slice(0, MAX_SELECAO))
    expect(estadoDoCabecalho(marcados, pagina)).toBe(true)
  })

  it('o ciclo completo do cabeçalho numa página maior que o teto', () => {
    const pagina = ids(100)
    expect(estadoDoCabecalho(new Set(), pagina)).toBe(false) // 1º clique: marca

    const depoisDoPrimeiro = marcarTodosDaPagina(new Set(), pagina, true)
    expect(depoisDoPrimeiro.proxima.size).toBe(MAX_SELECAO)
    expect(estadoDoCabecalho(depoisDoPrimeiro.proxima, pagina)).toBe(true) // 2º clique: limpa

    const depoisDoSegundo = marcarTodosDaPagina(depoisDoPrimeiro.proxima, pagina, false)
    expect(depoisDoSegundo.proxima.size).toBe(0)
    expect(estadoDoCabecalho(depoisDoSegundo.proxima, pagina)).toBe(false)
  })

  it('parcial ABAIXO do teto continua indeterminado (ainda cabe mais)', () => {
    const pagina = ids(100)
    const marcados = new Set(pagina.slice(0, MAX_SELECAO - 1))
    expect(estadoDoCabecalho(marcados, pagina)).toBe('indeterminate')
  })

  it('página menor que o teto não muda de comportamento', () => {
    const pagina = ids(10)
    expect(estadoDoCabecalho(new Set(pagina.slice(0, 4)), pagina)).toBe('indeterminate')
    expect(estadoDoCabecalho(new Set(pagina), pagina)).toBe(true)
  })
})

describe('podarForaDaPagina', () => {
  it('tira quem não está mais na página', () => {
    const r = podarForaDaPagina(new Set(['a', 'b', 'c']), ['b'])
    expect([...r]).toEqual(['b'])
  })

  it('devolve o MESMO objeto quando nada some (não dispara re-render à toa)', () => {
    const atual = new Set(['a', 'b'])
    expect(podarForaDaPagina(atual, ['a', 'b', 'c'])).toBe(atual)
  })

  it('página nova sem nenhum id conhecido zera a seleção', () => {
    expect(podarForaDaPagina(new Set(['a']), ['x', 'y']).size).toBe(0)
  })
})

describe('textoCopiavel', () => {
  it('um patrimônio por linha, na ordem recebida', () => {
    const r = textoCopiavel(['WAP0004491', 'WAP0000123'])
    expect(r.texto).toBe('WAP0004491\nWAP0000123')
    expect(r.copiados).toBe(2)
    expect(r.semPatrimonio).toBe(0)
  })

  it('ativo sem patrimônio (F7E) sai da lista e é contado', () => {
    const r = textoCopiavel(['WAP0004491', null, '  ', 'WAP0000123'])
    expect(r.texto).toBe('WAP0004491\nWAP0000123')
    expect(r.copiados).toBe(2)
    expect(r.semPatrimonio).toBe(2)
  })

  it('só sem patrimônio devolve texto vazio — o chamador não tem o que copiar', () => {
    const r = textoCopiavel([null, null])
    expect(r.texto).toBe('')
    expect(r.copiados).toBe(0)
    expect(r.semPatrimonio).toBe(2)
  })
})
