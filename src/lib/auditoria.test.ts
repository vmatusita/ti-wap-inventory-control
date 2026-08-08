import { describe, it, expect } from 'vitest'
import {
  ACAO_ROTULO,
  ACOES_ADMIN,
  eAcaoAdmin,
  eAcaoDestrutiva,
  rotuloAcao,
  sanearFiltrosAuditoria,
} from '@/lib/auditoria'

// Vocabulário e recortes da trilha de auditoria (`eventos_admin`).
//
// O saneamento dos recortes vivia DUPLICADO — em `queries/eventos-admin.ts` (a tela) e em
// `app/(app)/dev/acoes-export.ts` (o CSV) — e a cópia do export tinha a regex de data com os
// escapes perdidos: `/^d{4}-d{2}-d{2}$/` casa o literal "dddd-dd-dd", nunca uma data. O
// efeito era mudo: os filtros `de`/`ate` sumiam e o arquivo trazia a trilha inteira enquanto
// a tela mostrava o período. Régua única aqui, travada por estes testes.

describe('sanearFiltrosAuditoria — o período', () => {
  it('aceita uma data ISO real (o caso que a regex quebrada rejeitava)', () => {
    const f = sanearFiltrosAuditoria({ de: '2026-08-01', ate: '2026-08-07' })
    expect(f.de).toBe('2026-08-01')
    expect(f.ate).toBe('2026-08-07')
  })

  it('rejeita o que NÃO é uma data no formato ISO', () => {
    for (const v of ['dddd-dd-dd', '07/08/2026', '2026-8-1', '2026-08-07T00:00:00', 'ontem', '']) {
      expect(sanearFiltrosAuditoria({ de: v }).de, `deveria recusar "${v}"`).toBeNull()
    }
  })

  it('ausência de período é ausência de filtro (nunca lista vazia)', () => {
    const f = sanearFiltrosAuditoria({})
    expect(f).toEqual({ acao: null, autor: null, de: null, ate: null, alvo: null })
  })
})

describe('sanearFiltrosAuditoria — ação, autor e alvo', () => {
  it('só passa verbo do vocabulário fechado', () => {
    expect(sanearFiltrosAuditoria({ acao: 'papel_alterado' }).acao).toBe('papel_alterado')
    expect(sanearFiltrosAuditoria({ acao: 'conflito_filiais_resolvido' }).acao).toBe(
      'conflito_filiais_resolvido',
    )
    expect(sanearFiltrosAuditoria({ acao: 'verbo_inventado' }).acao).toBeNull()
  })

  it('apara o texto e recusa o que passa do teto de 120', () => {
    expect(sanearFiltrosAuditoria({ alvo: '  fulano@wap.ind.br  ' }).alvo).toBe(
      'fulano@wap.ind.br',
    )
    expect(sanearFiltrosAuditoria({ alvo: '   ' }).alvo).toBeNull()
    expect(sanearFiltrosAuditoria({ autor: 'x'.repeat(121) }).autor).toBeNull()
    expect(sanearFiltrosAuditoria({ autor: 'x'.repeat(120) }).autor).toHaveLength(120)
  })
})

describe('vocabulário: a exclusão de conflito entre filiais (F24)', () => {
  // A RPC `apagar_ativos_conflito_filiais` (0093/0098/0100) grava este verbo desde 30/07, e
  // ele ficou de fora do TypeScript: a trilha mostrava a chave crua, o filtro por tipo de
  // ação (montado a partir de ACOES_ADMIN nas duas telas de auditoria) não oferecia a opção,
  // e `eAcaoDestrutiva` respondia false para a única exclusão de ativo que o admin alcança.
  it('está no vocabulário, tem rótulo em pt-BR e conta como irreversível', () => {
    expect(ACOES_ADMIN).toContain('conflito_filiais_resolvido')
    expect(eAcaoAdmin('conflito_filiais_resolvido')).toBe(true)
    expect(rotuloAcao('conflito_filiais_resolvido')).toBe('Conflito entre filiais resolvido')
    expect(eAcaoDestrutiva('conflito_filiais_resolvido')).toBe(true)
  })

  it('toda ação do vocabulário tem rótulo próprio (nenhuma cai no verbo cru)', () => {
    for (const a of ACOES_ADMIN) {
      expect(ACAO_ROTULO[a], `sem rótulo: ${a}`).toBeTruthy()
      expect(rotuloAcao(a)).not.toBe(a)
    }
  })
})
