import { describe, expect, it } from 'vitest'
import {
  camposFaltantesDoTermo,
  cidadeDoTermo,
  mesclarCamposSalvos,
  type AtivoDoTermo,
  type FilialDoTermo,
} from '@/lib/termos/preparo'

// F25 — as decisões do pré-preenchimento do termo. Dados 100% fictícios.

const FILIAIS = new Map<number, FilialDoTermo>([
  [1, { id: 1, nome: 'Matriz', cidade: 'São José dos Pinhais' }],
  [3, { id: 3, nome: 'Linhares', cidade: 'Linhares' }],
  [9, { id: 9, nome: 'Filial Nova', cidade: '' }],
])

function ativo(over: Partial<AtivoDoTermo> = {}): AtivoDoTermo {
  return {
    categoria: 'notebook',
    marca: 'Marca',
    modelo: 'Modelo',
    service_tag: 'ABC1234',
    patrimonio: 'WAP0001234',
    telefone: null,
    imei: null,
    pulsus: null,
    filial_id: 1,
    ...over,
  }
}

describe('cidadeDoTermo', () => {
  it('usa a cidade da filial do ativo — e é ELA, não a da sede', () => {
    const r = cidadeDoTermo([{ filial_id: 3 }], FILIAIS)
    expect(r.cidade).toBe('Linhares')
    expect(r.avisos).toEqual([])
  })

  it('a Matriz continua saindo com São José dos Pinhais', () => {
    expect(cidadeDoTermo([{ filial_id: 1 }], FILIAIS).cidade).toBe('São José dos Pinhais')
  })

  it('lote de UMA filial (vários ativos) não avisa nada', () => {
    const r = cidadeDoTermo([{ filial_id: 3 }, { filial_id: 3 }], FILIAIS)
    expect(r.cidade).toBe('Linhares')
    expect(r.avisos).toEqual([])
  })

  it('lote MISTO usa a do primeiro e AVISA, nomeando as filiais', () => {
    const r = cidadeDoTermo([{ filial_id: 3 }, { filial_id: 1 }], FILIAIS)
    expect(r.cidade).toBe('Linhares')
    expect(r.avisos).toHaveLength(1)
    expect(r.avisos[0]).toContain('mais de uma filial')
    expect(r.avisos[0]).toContain('Linhares')
    expect(r.avisos[0]).toContain('Matriz')
  })

  it('filial SEM cidade cadastrada avisa e diz onde cadastrar', () => {
    const r = cidadeDoTermo([{ filial_id: 9 }], FILIAIS)
    expect(r.cidade).toBe('')
    expect(r.avisos).toHaveLength(1)
    expect(r.avisos[0]).toContain('Filial Nova')
    expect(r.avisos[0]).toContain('Administração → Filiais')
  })

  it('lote misto avisa do LOTE, não da cidade vazia (um aviso só, o que importa)', () => {
    const r = cidadeDoTermo([{ filial_id: 9 }, { filial_id: 3 }], FILIAIS)
    expect(r.avisos).toHaveLength(1)
    expect(r.avisos[0]).toContain('mais de uma filial')
  })

  it('filial desconhecida (fora do mapa) não quebra — degrada com aviso', () => {
    const r = cidadeDoTermo([{ filial_id: 77 }], FILIAIS)
    expect(r.cidade).toBe('')
    expect(r.avisos).toHaveLength(1)
  })

  it('sem ativo nenhum devolve vazio sem aviso', () => {
    expect(cidadeDoTermo([], FILIAIS)).toEqual({ cidade: '', avisos: [] })
  })
})

describe('camposFaltantesDoTermo', () => {
  it('ativo completo não tem faltantes', () => {
    expect(camposFaltantesDoTermo(ativo())).toEqual([])
  })

  it('cobra os campos cadastrais de sempre', () => {
    expect(camposFaltantesDoTermo(ativo({ marca: null, patrimonio: null }))).toEqual([
      'marca',
      'patrimônio',
    ])
  })

  it('CELULAR sem os três campos novos cobra os três', () => {
    expect(camposFaltantesDoTermo(ativo({ categoria: 'celular' }))).toEqual([
      'nº do telefone',
      'IMEI',
      'Pulsus',
    ])
  })

  it('celular COM os três campos não cobra nada', () => {
    const cel = ativo({
      categoria: 'celular',
      telefone: '(41) 90000-0000',
      imei: '000000000000000',
      pulsus: 'PULSUS-1',
    })
    expect(camposFaltantesDoTermo(cel)).toEqual([])
  })

  it('⚠ NOTEBOOK sem IMEI NÃO é cobrado — os campos não vazam para outra categoria', () => {
    expect(camposFaltantesDoTermo(ativo({ categoria: 'notebook' }))).toEqual([])
    expect(camposFaltantesDoTermo(ativo({ categoria: 'monitor' }))).toEqual([])
    expect(camposFaltantesDoTermo(ativo({ categoria: 'desktop' }))).toEqual([])
  })
})

describe('mesclarCamposSalvos — reabrir um termo já gerado', () => {
  it('o snapshot MANDA nas chaves que ele tem', () => {
    const r = mesclarCamposSalvos(
      { colaborador: 'Fulano', marca: 'Nova', cidade: 'Linhares' },
      { colaborador: 'Fulano de Tal', marca: 'Antiga', cidade: 'Serra' },
    )
    expect(r).toEqual({ colaborador: 'Fulano de Tal', marca: 'Antiga', cidade: 'Serra' })
  })

  it('TERMO ANTIGO sem `cidade` no jsonb completa com a da filial — nunca vazio', () => {
    // Todo termo gerado antes da F25 cai aqui. Sem a mescla o campo abriria vazio
    // e o documento sairia começando por vírgula (`nullGetter` rende '').
    const salvos = { colaborador: 'Fulano de Tal', marca: 'Antiga' }
    const r = mesclarCamposSalvos({ colaborador: 'Fulano', marca: 'Nova', cidade: 'Linhares' }, salvos)
    expect(r.cidade).toBe('Linhares')
    expect(r.colaborador).toBe('Fulano de Tal')
  })

  it('cidade salva VAZIA continua vencendo (foi uma edição deliberada)', () => {
    const r = mesclarCamposSalvos({ cidade: 'Linhares' }, { cidade: '' })
    expect(r.cidade).toBe('')
  })

  it('idem para os campos do celular de um termo antigo (eram digitados à mão)', () => {
    const r = mesclarCamposSalvos(
      { imei: '111111111111111', telefone: '(41) 90000-0000' },
      { imei: '999999999999999' },
    )
    expect(r.imei).toBe('999999999999999')
    // O que o snapshot não trouxe vem do cadastro — que agora existe.
    expect(r.telefone).toBe('(41) 90000-0000')
  })
})
