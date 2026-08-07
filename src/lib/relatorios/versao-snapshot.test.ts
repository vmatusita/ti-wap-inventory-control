import { describe, it, expect } from 'vitest'
import {
  ehViolacaoDeVersao,
  mensagemVersaoExistente,
} from '@/lib/relatorios/versao-snapshot'

describe('mensagemVersaoExistente', () => {
  it('não avisa nada quando o período ainda não tem snapshot', () => {
    expect(mensagemVersaoExistente(null)).toBeNull()
  })

  it('diz a versão que existe, quem gerou, quando — e qual será a nova', () => {
    expect(
      mensagemVersaoExistente({
        versao: 2,
        autorNome: 'Fulano de Tal',
        geradoEm: '2026-07-20T13:45:00-03:00',
      }),
    ).toBe(
      'Já existe a v2 deste período, gerada por Fulano de Tal em 20/07/2026 — você criará a v3.',
    )
  })

  it('autor ausente vira travessão, não "null"', () => {
    const m = mensagemVersaoExistente({
      versao: 1,
      autorNome: null,
      geradoEm: '2026-07-20T13:45:00-03:00',
    })
    expect(m).toContain('gerada por —')
    expect(m).toContain('você criará a v2')
  })
})

describe('ehViolacaoDeVersao', () => {
  it('reconhece o unique_violation pelo código', () => {
    expect(ehViolacaoDeVersao('23505', 'qualquer coisa')).toBe(true)
  })

  it('reconhece pelo nome do índice quando o código não vem', () => {
    expect(
      ehViolacaoDeVersao(
        null,
        'duplicate key value violates unique constraint "relatorios_gerados_periodo_filial_versao_uidx"',
      ),
    ).toBe(true)
  })

  it('reconhece a constraint de tabela da 0010 pelo par duplicate key + tabela', () => {
    expect(
      ehViolacaoDeVersao(
        undefined,
        'duplicate key value violates unique constraint "relatorios_gerados_periodo_de_periodo_ate_filial_id_versao_key"',
      ),
    ).toBe(true)
  })

  it('não confunde outro erro com colisão de versão', () => {
    expect(ehViolacaoDeVersao('23503', 'insert or update violates foreign key')).toBe(false)
    expect(ehViolacaoDeVersao(null, 'permission denied for table relatorios_gerados')).toBe(
      false,
    )
    expect(ehViolacaoDeVersao(null, null)).toBe(false)
  })

  // Um 23505 de OUTRA tabela não pode virar renumeração de versão em silêncio — mas
  // o código sozinho é a pista mais forte que o PostgREST dá, e esta action só
  // insere numa tabela. O teste registra a escolha.
  it('trata qualquer 23505 como colisão — a action só insere em relatorios_gerados', () => {
    expect(ehViolacaoDeVersao('23505', 'duplicate key on ativos_patrimonio_uidx')).toBe(true)
  })
})
