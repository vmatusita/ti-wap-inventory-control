import { describe, expect, it } from 'vitest'
import { emitiuLinhaFim, rotulosCaidos } from './saida-roteiro.mjs'

// A TRAVA DO PARSER DO INJETOR — F47, roda sem banco.
//
// Aqui mora a regra que decide "detectada" × "não detectada". Errada, ela não quebra
// nada: ela faz o injetor concordar consigo mesmo e reportar sucesso medindo o cenário
// errado. As armadilhas abaixo são REAIS, tiradas dos roteiros do repositório.

describe('1. rotulosCaidos — token, nunca substring', () => {
  it('lê um ✗ de WARNING', () => {
    const saida = "psql:supabase/tests/papeis_rls.sql:940: WARNING:  ✗ 2c operador MOVIMENTOU na filial NÃO vinculada (f2)"
    expect([...rotulosCaidos(saida)]).toEqual(['2c'])
  })

  it('lê um ✗ de NOTICE também (o runner conta os dois)', () => {
    expect([...rotulosCaidos('NOTICE:  ✗ 5f admin leu 1 linha(s) de senhas_acesso')]).toEqual(['5f'])
  })

  it('NÃO confunde `2c` com `2c-bis` — a armadilha central', () => {
    const saida = 'WARNING:  ✗ 2c-bis operador MOVIMENTOU ativo da filial não vinculada'
    const caidos = rotulosCaidos(saida)
    expect(caidos.has('2c-bis')).toBe(true)
    expect(caidos.has('2c'), 'prefixo casando é o defeito que faz o injetor mentir').toBe(false)
  })

  it('NÃO confunde o rótulo NU `1` com `1z`, `1c-bis`, `12a` (dev_destrutivo)', () => {
    const saida = [
      'WARNING:  ✗ 1z resetar_dados_ficticios passou numa base SEM a marca',
      'WARNING:  ✗ 1c-bis grants de dev_checagens_integridade inesperados',
      'WARNING:  ✗ 12a apagar_ativo aceitou uma confirmação errada',
    ].join('\n')
    const caidos = rotulosCaidos(saida)
    expect([...caidos].sort()).toEqual(['12a', '1c-bis', '1z'])
    expect(caidos.has('1')).toBe(false)
    expect(caidos.has('1c')).toBe(false)
    expect(caidos.has('12')).toBe(false)
  })

  it('aceita os DOIS espaços de conflito_filiais.sql', () => {
    expect([...rotulosCaidos('WARNING:  ✗ 1a  esperava 4 grupos de conflito, veio 3')]).toEqual(['1a'])
  })

  it('IGNORA a linha TOTAL, que é agregado e não cenário', () => {
    // Pior do que ruído: o agregado carrega códigos como `12c_CONFIRMACAO_ITEM`, e quem
    // lesse o blob por substring atribuiria a falha de `12c` também a `2c`.
    const saida =
      'WARNING:  ✗ TOTAL dev_destrutivo: 2 falha(s) — 12c_CONFIRMACAO_ITEM; 12d_CONFIRMACAO_RESET'
    expect([...rotulosCaidos(saida)]).toEqual([])
  })

  it('NÃO conta um ✗ citado no meio de um texto informativo', () => {
    // Mesma convenção do runner: o ✗ tem de ABRIR a mensagem do NOTICE/WARNING.
    expect([...rotulosCaidos('NOTICE:  o roteiro marca ✗ quando falha')]).toEqual([])
    expect([...rotulosCaidos('-- comentário com ✗ 9z no meio')]).toEqual([])
  })

  it('devolve conjunto (rótulo repetido não conta duas vezes)', () => {
    const saida = 'WARNING:  ✗ 2f a\nWARNING:  ✗ 2f b\nWARNING:  ✗ 2f-bis c'
    expect([...rotulosCaidos(saida)].sort()).toEqual(['2f', '2f-bis'])
  })

  it('saída limpa devolve conjunto vazio', () => {
    expect(rotulosCaidos('NOTICE:  ✓ 2c operador recusado, como esperado').size).toBe(0)
    expect(rotulosCaidos('').size).toBe(0)
  })
})

describe('2. emitiuLinhaFim — separa "não caiu" de "morreu no meio"', () => {
  it('reconhece a linha FIM do roteiro certo', () => {
    const saida = 'NOTICE:  FIM papeis_rls: 84 asserções, 0 falhas'
    expect(emitiuLinhaFim(saida, 'papeis_rls.sql')).toBe(true)
    expect(emitiuLinhaFim(saida, 'papeis_rls')).toBe(true)
  })

  it('NÃO aceita a linha FIM de OUTRO roteiro', () => {
    // O injetor roda um roteiro por vez, mas a saída pode carregar contexto; aceitar a
    // linha errada faria um roteiro abortado passar por completo.
    expect(emitiuLinhaFim('NOTICE:  FIM cargo_dev: 40 asserções, 0 falhas', 'papeis_rls.sql')).toBe(
      false,
    )
  })

  it('é falso quando o roteiro morreu antes de contar', () => {
    const saida = 'WARNING:  ✗ 2c …\npsql:supabase/tests/papeis_rls.sql:900: ERROR:  permission denied'
    expect(emitiuLinhaFim(saida, 'papeis_rls.sql')).toBe(false)
  })

  it('exige os DOIS números (uma linha meio escrita não conta)', () => {
    expect(emitiuLinhaFim('NOTICE:  FIM papeis_rls: asserções, falhas', 'papeis_rls.sql')).toBe(false)
  })
})

describe('3. a combinação dos dois — os quatro diagnósticos do injetor', () => {
  // É a tabela-verdade que o motor usa. Escrita aqui para que a mudança de um dos dois
  // lados não desloque o diagnóstico em silêncio.
  const FIM = 'NOTICE:  FIM papeis_rls: 84 asserções, 1 falhas'

  it('caiu o esperado + chegou ao fim = DETECTADA', () => {
    const saida = `WARNING:  ✗ 4d desativado LEU 2 ativo(s)\n${FIM}`
    expect(rotulosCaidos(saida).has('4d')).toBe(true)
    expect(emitiuLinhaFim(saida, 'papeis_rls.sql')).toBe(true)
  })

  it('não caiu nada + chegou ao fim = NÃO DETECTADA (o achado da fase)', () => {
    const saida = `NOTICE:  ✓ 4d desativado não leu ativo nenhum\n${FIM}`
    expect(rotulosCaidos(saida).has('4d')).toBe(false)
    expect(emitiuLinhaFim(saida, 'papeis_rls.sql')).toBe(true)
  })

  it('caiu outro rótulo = detectada pelo cenário ERRADO, que é achado e não sucesso', () => {
    const saida = `WARNING:  ✗ 4e desativado LEU 3 perfil(is)\n${FIM}`
    const caidos = rotulosCaidos(saida)
    expect(caidos.has('4d')).toBe(false)
    expect(caidos.has('4e')).toBe(true)
  })

  it('sem a linha FIM = ABORTOU, mesmo com rótulo caído', () => {
    const saida = 'WARNING:  ✗ 4d desativado LEU 2 ativo(s)\nERROR:  division by zero'
    expect(rotulosCaidos(saida).has('4d')).toBe(true)
    expect(emitiuLinhaFim(saida, 'papeis_rls.sql')).toBe(false)
  })
})
