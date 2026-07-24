import { describe, it, expect } from 'vitest'
import { separarNomeSalvo } from '@/lib/auth/nome-pessoa'

// Regra de prefill dos campos Nome/Sobrenome em /auth/definir-senha (migration
// 0057). Função pura e síncrona — roda no ambiente node, sem mock.
describe('separarNomeSalvo', () => {
  it('devolve as duas partes quando o sobrenome já está gravado', () => {
    expect(separarNomeSalvo('Fulano', 'de Tal')).toEqual({
      nome: 'Fulano',
      sobrenome: 'de Tal',
    })
  })

  it('não pré-preenche nada quando o perfil está vazio', () => {
    expect(separarNomeSalvo(null, null)).toEqual({ nome: '', sobrenome: '' })
    expect(separarNomeSalvo('   ', '')).toEqual({ nome: '', sobrenome: '' })
  })

  // O caso comum: o trigger do banco grava o e-mail em primeiro_nome enquanto
  // ninguém informou o nome. Ele NÃO pode aparecer no campo "Nome".
  it('ignora o fallback de e-mail do trigger', () => {
    expect(separarNomeSalvo('fulano@wap.ind.br', null)).toEqual({
      nome: '',
      sobrenome: '',
    })
    expect(separarNomeSalvo('fulano@latam.stefanini.com', null)).toEqual({
      nome: '',
      sobrenome: '',
    })
  })

  it('parte o nome completo antigo no primeiro espaço', () => {
    expect(separarNomeSalvo('Fulano de Tal', null)).toEqual({
      nome: 'Fulano',
      sobrenome: 'de Tal',
    })
    expect(separarNomeSalvo('Fulano Silva Souza', null)).toEqual({
      nome: 'Fulano',
      sobrenome: 'Silva Souza',
    })
  })

  it('nome único vai inteiro para o campo Nome, sem inventar sobrenome', () => {
    expect(separarNomeSalvo('Fulano', null)).toEqual({ nome: 'Fulano', sobrenome: '' })
  })

  it('tolera espaços em excesso no valor gravado', () => {
    expect(separarNomeSalvo('  Fulano   de Tal  ', null)).toEqual({
      nome: 'Fulano',
      sobrenome: 'de Tal',
    })
    expect(separarNomeSalvo('  Fulano  ', '  de Tal  ')).toEqual({
      nome: 'Fulano',
      sobrenome: 'de Tal',
    })
  })
})
