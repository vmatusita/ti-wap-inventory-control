import { describe, expect, it } from 'vitest'

import {
  encontrarDonoDoTermo,
  mensagemColisaoApelido,
  mensagemColisaoNomeFilial,
  type ApelidoParaTermo,
  type FilialParaTermo,
} from './dono-do-termo'

// F56 · Frente E · Decisões 2 e 13 do PLAN-F56.
//
// O conjunto de teste imita as cinco filiais da WAP + a Filial de Teste
// (100% fictício — nenhum dado real do acervo). `id: 5` fica INATIVA de
// propósito: a Decisão 2 do PLAN-F56 é explícita — "toda filial, ativa ou
// inativa, é unidade conhecida" — e é isso que o bloco final prova.

const FILIAIS: FilialParaTermo[] = [
  { id: 1, nome: 'Matriz' },
  { id: 2, nome: 'CD Afonso Pena' },
  { id: 3, nome: 'Serra' },
  { id: 4, nome: 'Eusébio' },
  { id: 5, nome: 'Filial de Teste', ativo: false },
]

const APELIDOS: ApelidoParaTermo[] = [{ filialId: 3, apelido: 'Serra Park' }]

describe('encontrarDonoDoTermo — nome × apelido', () => {
  it('acha o dono pelo NOME PRÓPRIO', () => {
    expect(encontrarDonoDoTermo('Matriz', FILIAIS, APELIDOS)).toEqual({
      filialId: 1,
      nomeFilial: 'Matriz',
      origem: 'nome_proprio',
    })
  })

  it('acha o dono por APELIDO', () => {
    expect(encontrarDonoDoTermo('Serra Park', FILIAIS, APELIDOS)).toEqual({
      filialId: 3,
      nomeFilial: 'Serra',
      origem: 'apelido',
    })
  })

  it('termo livre (sem dono) devolve null', () => {
    expect(encontrarDonoDoTermo('Sede', FILIAIS, APELIDOS)).toBeNull()
  })

  it('caixa e acento não importam (espelho de normalizarTexto/vocabulario_chave)', () => {
    expect(encontrarDonoDoTermo('eusebio', FILIAIS, APELIDOS)?.filialId).toBe(4)
    expect(encontrarDonoDoTermo('EUSÉBIO', FILIAIS, APELIDOS)?.filialId).toBe(4)
    expect(encontrarDonoDoTermo('SERRA PARK', FILIAIS, APELIDOS)?.filialId).toBe(3)
    expect(encontrarDonoDoTermo('  serra   park  ', FILIAIS, APELIDOS)?.filialId).toBe(3)
  })

  it('termo vazio, ou só espaço, nunca acha dono', () => {
    expect(encontrarDonoDoTermo('', FILIAIS, APELIDOS)).toBeNull()
    expect(encontrarDonoDoTermo('   ', FILIAIS, APELIDOS)).toBeNull()
  })

  it('filial INATIVA continua sendo dona do próprio nome (Decisão 2)', () => {
    expect(encontrarDonoDoTermo('Filial de Teste', FILIAIS, APELIDOS)).toEqual({
      filialId: 5,
      nomeFilial: 'Filial de Teste',
      origem: 'nome_proprio',
    })
  })
})

describe('mensagemColisaoApelido — cadastrar apelido', () => {
  it('sem colisão, null', () => {
    expect(mensagemColisaoApelido('Sede', 4, null)).toBeNull()
  })

  it('apelido igual ao nome PRÓPRIO da PRÓPRIA filial — "não precisa de apelido"', () => {
    const dono = encontrarDonoDoTermo('Serra', FILIAIS, APELIDOS)
    const msg = mensagemColisaoApelido('Serra', 3, dono)
    expect(msg).toBe(
      'O nome próprio desta filial já vale sempre na coluna Site — não precisa de apelido igual a ele.',
    )
  })

  it('apelido igual ao nome de OUTRA filial — nomeia a filial dona («Matriz» é o nome da filial Matriz)', () => {
    const dono = encontrarDonoDoTermo('Matriz', FILIAIS, APELIDOS)
    const msg = mensagemColisaoApelido('Matriz', 3, dono)
    expect(msg).toBe('«Matriz» é o nome da filial Matriz.')
  })

  it('apelido igual a apelido de OUTRA filial — o exemplo da ordem', () => {
    const dono = encontrarDonoDoTermo('Serra Park', FILIAIS, APELIDOS)
    const msg = mensagemColisaoApelido('Serra Park', 1, dono)
    expect(msg).toBe(
      '«Serra Park» já é apelido da filial Serra — um termo só pode apontar para uma filial.',
    )
  })

  it('o MESMO apelido, já cadastrado para a PRÓPRIA filial', () => {
    const dono = encontrarDonoDoTermo('Serra Park', FILIAIS, APELIDOS)
    const msg = mensagemColisaoApelido('Serra Park', 3, dono)
    expect(msg).toBe('«Serra Park» já é apelido desta filial.')
  })
})

describe('mensagemColisaoNomeFilial — criar ou renomear filial', () => {
  it('sem colisão, null', () => {
    expect(mensagemColisaoNomeFilial('Sede', null, null)).toBeNull()
  })

  it('criar filial com nome que já é de OUTRA filial — recusado', () => {
    const dono = encontrarDonoDoTermo('serra', FILIAIS, APELIDOS)
    const msg = mensagemColisaoNomeFilial('Serra', null, dono)
    expect(msg).toBe('«Serra» já é o nome da filial Serra.')
  })

  it('renomear para o PRÓPRIO nome atual (só caixa/acento mudou) não é colisão', () => {
    const dono = encontrarDonoDoTermo('EUSEBIO', FILIAIS, APELIDOS)
    const msg = mensagemColisaoNomeFilial('EUSEBIO', 4, dono)
    expect(msg).toBeNull()
  })

  it('renomear para um termo que já é APELIDO de OUTRA filial — recusado', () => {
    const dono = encontrarDonoDoTermo('Serra Park', FILIAIS, APELIDOS)
    const msg = mensagemColisaoNomeFilial('Serra Park', 1, dono)
    expect(msg).toBe('«Serra Park» já é apelido da filial Serra — escolha outro nome.')
  })

  it('renomear a PRÓPRIA filial para um apelido DELA MESMA — "remova o apelido antes"', () => {
    const dono = encontrarDonoDoTermo('Serra Park', FILIAIS, APELIDOS)
    const msg = mensagemColisaoNomeFilial('Serra Park', 3, dono)
    expect(msg).toBe(
      '«Serra Park» já é apelido desta própria filial — remova o apelido antes de usá-lo como nome.',
    )
  })

  it('filial INATIVA conta: criar filial nova com o nome dela é recusado (Decisão 2)', () => {
    const dono = encontrarDonoDoTermo('Filial de Teste', FILIAIS, APELIDOS)
    const msg = mensagemColisaoNomeFilial('Filial de Teste', null, dono)
    expect(msg).toBe('«Filial de Teste» já é o nome da filial Filial de Teste.')
  })
})
