import { describe, it, expect } from 'vitest'
import { Constants } from '@/lib/types/database'
import {
  rotuloTermo,
  rotuloStatus,
  rotuloTipo,
  rotuloCategoria,
  rotuloAcessorio,
  OBS_CARGA_GOLIVE,
  OBS_IMPORT_STARTUP,
  TERMO_META,
  TERMO_STATUS_ORDEM,
  STATUS_META,
  STATUS_ORDEM,
  CATEGORIA_META,
  CATEGORIA_ORDEM,
} from '@/lib/dominio'

describe('rotuloTermo', () => {
  it('inclui o status "gerado" (F5A) — o defeito que o Sprint 0 corrigiu', () => {
    expect(rotuloTermo('gerado')).toBe('Gerado')
  })

  it('rotula os demais status', () => {
    expect(rotuloTermo('sim')).toBe('Assinado')
    expect(rotuloTermo('enviado')).toBe('Enviado (sem assinatura)')
    expect(rotuloTermo('nao')).toBe('Não gerado')
  })

  it('devolve "Não informado" para null/undefined', () => {
    expect(rotuloTermo(null)).toBe('Não informado')
    expect(rotuloTermo(undefined)).toBe('Não informado')
  })

  it('cobre exatamente os quatro status do enum', () => {
    expect(Object.keys(TERMO_META).sort()).toEqual(['enviado', 'gerado', 'nao', 'sim'])
  })
})

describe('TERMO_STATUS_ORDEM (fonte única das opções do <Select> de termo)', () => {
  // Dívida técnica — item D (21/07/2026): o select de termo_status era hard-coded no
  // JSX. Agora deriva desta lista. Este teste amarra a lista ao ENUM GERADO do banco:
  // se um valor entrar/sair de termo_status no Postgres (+ db:types), a permutação
  // deixa de bater e o teste quebra — o select nunca fica mudo ou órfão.
  it('é uma permutação exata do enum termo_status gerado', () => {
    expect([...TERMO_STATUS_ORDEM].sort()).toEqual([...Constants.public.Enums.termo_status].sort())
  })

  it('cada valor tem rótulo próprio (não cai no passthrough)', () => {
    for (const t of TERMO_STATUS_ORDEM) {
      expect(rotuloTermo(t)).not.toBe(t)
    }
  })
})

describe('rótulos de domínio', () => {
  it('rotula status e tipo em pt-BR', () => {
    expect(rotuloStatus('em_uso')).toBe('Em uso')
    expect(rotuloStatus('em_manutencao')).toBe('Em manutenção')
    expect(rotuloTipo('saida')).toBe('Saída')
    expect(rotuloTipo('transferencia')).toBe('Transferência')
    expect(rotuloCategoria('notebook')).toBe('Notebook')
  })

  it('rotuloAcessorio faz passthrough de código desconhecido', () => {
    expect(rotuloAcessorio('mouse')).toBe('Mouse')
    expect(rotuloAcessorio('inexistente')).toBe('inexistente')
  })
})

describe('OBS_CARGA_GOLIVE (marcador da carga go-live — F6A-A1)', () => {
  // Trava o literal: ~1.576 linhas em produção têm exatamente este texto, e a
  // leitura do relatório (queries/relatorios/movimentacoes.ts) e a escrita da
  // carga (scripts/import/plano.ts) dependem dele. Mudar a string re-exibiria a
  // carga inicial no relatório. É a fonte única — plano.ts importa daqui.
  it('é a string exata gravada pela carga F4', () => {
    expect(OBS_CARGA_GOLIVE).toBe('carga go-live')
  })
})

describe('OBS_IMPORT_STARTUP (marcador do import de startup — F7 → baseline F8)', () => {
  // Trava o PREFIXO do marcador que a RPC importar_ativos_substituir grava (`import
  // startup dd/MM/yyyy`) e que o relatório usa para ESCONDER as movimentações do import
  // do período (queries/relatorios/movimentacoes.ts — `not.like 'import startup*'`).
  // A partir da F8 (migration 0036) a COMPRA de abertura volta a levar SEMPRE este
  // marcador (com ou sem data) — baseline; então nenhuma compra de abertura aparece nas
  // Entradas. Mudar o literal aqui sem mudar o hard-code do SQL vazaria o acervo de
  // abertura no relatório. Fonte única do prefixo (as migrations o replicam à mão).
  it('é o prefixo exato gravado pela RPC de import', () => {
    expect(OBS_IMPORT_STARTUP).toBe('import startup')
  })
})

describe('ordens canônicas', () => {
  it('STATUS_ORDEM cobre todos os status sem duplicar', () => {
    expect([...STATUS_ORDEM].sort()).toEqual(Object.keys(STATUS_META).sort())
    expect(new Set(STATUS_ORDEM).size).toBe(STATUS_ORDEM.length)
  })

  it('CATEGORIA_ORDEM cobre todas as categorias sem duplicar', () => {
    expect([...CATEGORIA_ORDEM].sort()).toEqual(Object.keys(CATEGORIA_META).sort())
    expect(new Set(CATEGORIA_ORDEM).size).toBe(CATEGORIA_ORDEM.length)
  })
})
