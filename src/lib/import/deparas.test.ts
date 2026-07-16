import { describe, expect, it } from 'vitest'
import {
  chaveServiceTag,
  estadoPlanilha,
  extrairChamado,
  filialPorSlug,
  limparCampo,
  mapearCategoria,
  mapearUnidade,
  normalizarHeader,
  normalizarServiceTag,
  normalizarTexto,
  parseColaboradorInventario,
  parseData,
} from './deparas'

// Nenhum dado real — tudo fictício (padrão WAP0001234 / "Fulano").

describe('normalizarTexto / normalizarHeader', () => {
  it('remove acento, minúsculas, `:` final e colapsa espaços', () => {
    expect(normalizarTexto('Situação:')).toBe('situacao')
    expect(normalizarTexto('  Data   de   Inclusão  ')).toBe('data de inclusao')
    expect(normalizarTexto('Patrimônio')).toBe('patrimonio')
  })
  it('normalizarHeader tira `:`/espaços à direita (headers reais têm `Site:`)', () => {
    expect(normalizarHeader('Site:')).toBe('site')
    expect(normalizarHeader('Data de Entrega ')).toBe('data de entrega')
    expect(normalizarHeader('Observação')).toBe('observacao')
  })
})

describe('limparCampo', () => {
  it('vazio-na-prática → null; senão aparado', () => {
    expect(limparCampo('-')).toBeNull()
    expect(limparCampo('N/A')).toBeNull()
    expect(limparCampo('0')).toBeNull()
    expect(limparCampo('')).toBeNull()
    expect(limparCampo('   ')).toBeNull()
    expect(limparCampo('  Dell  Latitude ')).toBe('Dell Latitude')
  })
})

describe('mapearUnidade (De→Para de unidades, spec §5 ampliado)', () => {
  it('aplica os apelidos reais das planilhas', () => {
    expect(mapearUnidade('Serra Park')).toBe('Serra')
    expect(mapearUnidade('Filial-CE')).toBe('Eusébio')
    expect(mapearUnidade('CD-PENA')).toBe('CD-Afonso Pena')
    expect(mapearUnidade('Afonso Pena')).toBe('CD-Afonso Pena')
    expect(mapearUnidade('Matriz ')).toBe('Matriz')
    expect(mapearUnidade('Filial - Linhares')).toBe('Linhares')
  })
  it('desconhecido → null', () => {
    expect(mapearUnidade('Fábrica X')).toBeNull()
    expect(mapearUnidade('')).toBeNull()
  })
})

describe('filialPorSlug', () => {
  it('slug do banco → filial oficial', () => {
    expect(filialPorSlug('cd-afonso-pena')).toBe('CD-Afonso Pena')
    expect(filialPorSlug('matriz')).toBe('Matriz')
    expect(filialPorSlug('eusebio')).toBe('Eusébio')
    expect(filialPorSlug('inexistente')).toBeNull()
  })
})

describe('mapearCategoria (Tipo → enum; desconhecido = null p/ bloqueante)', () => {
  it('conhecidos', () => {
    expect(mapearCategoria('Notebook')).toBe('notebook')
    expect(mapearCategoria('CELULAR')).toBe('celular')
    expect(mapearCategoria('Monitor')).toBe('monitor')
  })
  it('desconhecido/vazio → null (F7 §3 bloqueia)', () => {
    expect(mapearCategoria('Teclado')).toBeNull()
    expect(mapearCategoria('')).toBeNull()
  })
})

describe('estadoPlanilha (precedência Situação > Status — DECISOES 15/07)', () => {
  it('Situação vence quando preenchida', () => {
    expect(estadoPlanilha('Estoque', 'Descarte')).toBe('descartado')
    expect(estadoPlanilha('Estoque', 'Manutenção')).toBe('em_manutencao')
  })
  it('sem Situação → Status', () => {
    expect(estadoPlanilha('Remanejo', '')).toBe('em_uso')
    expect(estadoPlanilha('Estoque', '')).toBe('em_estoque')
  })
  it('fora da tabela → null', () => {
    expect(estadoPlanilha('Foo', '')).toBeNull()
    expect(estadoPlanilha('', '')).toBeNull()
  })
})

describe('parseData (espelho F4: só dd/mm/aaaa; futura sinalizada)', () => {
  const hoje = '2026-07-16'
  it('data válida → iso', () => {
    expect(parseData('15/12/2025', hoje)).toEqual({ iso: '2025-12-15', invalida: false, futura: false })
  })
  it('futura → iso + futura true', () => {
    const r = parseData('01/09/2099', hoje)
    expect(r.iso).toBe('2099-09-01')
    expect(r.futura).toBe(true)
  })
  it('vazio/N-A → null sem invalida', () => {
    expect(parseData('', hoje)).toEqual({ iso: null, invalida: false, futura: false })
    expect(parseData('N/A', hoje)).toEqual({ iso: null, invalida: false, futura: false })
  })
  it('lixo/quebrada → invalida', () => {
    expect(parseData('#######', hoje).invalida).toBe(true)
    expect(parseData('24/06/205', hoje).invalida).toBe(true) // ano < 2000
    expect(parseData('31/02/2025', hoje).invalida).toBe(true) // 31 de fev
    expect(parseData('01/set', hoje).invalida).toBe(true)
    expect(parseData('15/12/25', hoje).invalida).toBe(true) // dd/MM/yy NÃO aceito (espelho F4)
  })
})

describe('service tag', () => {
  it('normaliza e detecta vazio', () => {
    expect(normalizarServiceTag('  ABC 123 ')).toBe('ABC 123')
    expect(normalizarServiceTag('-')).toBeNull()
    expect(normalizarServiceTag('')).toBeNull()
  })
  it('chaveServiceTag = caixa alta sem espaços (espelha coalesce do índice)', () => {
    expect(chaveServiceTag('ab c')).toBe('ABC')
    expect(chaveServiceTag(null)).toBe('')
  })
})

describe('extrairChamado (GLPI)', () => {
  it('extrai número; texto sem dígito → null', () => {
    expect(extrairChamado('Chamado 6766')).toBe('6766')
    expect(extrairChamado('1234')).toBe('1234')
    expect(extrairChamado('SIM')).toBeNull()
    expect(extrairChamado('N/A')).toBeNull()
  })
})

describe('parseColaboradorInventario', () => {
  it('separa Nome / Setor quando o texto traz', () => {
    expect(parseColaboradorInventario('Fulano de Tal / TI')).toEqual({
      colaborador: 'Fulano de Tal',
      setor: 'TI',
    })
    expect(parseColaboradorInventario('Ciclano')).toEqual({ colaborador: 'Ciclano', setor: null })
    expect(parseColaboradorInventario('-')).toEqual({ colaborador: null, setor: null })
  })
})
