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

  // ⚠ Os dois avisos valem AO MESMO TEMPO, e este é o pior caso: lote misto cuja
  // PRIMEIRA filial não tem cidade. Com `else if`, o aviso do lote engolia o da
  // cidade vazia e o documento saía começando por vírgula sem ninguém dizer por quê.
  it('lote misto COM a primeira filial sem cidade avisa as DUAS coisas', () => {
    const r = cidadeDoTermo([{ filial_id: 9 }, { filial_id: 3 }], FILIAIS)
    expect(r.cidade).toBe('')
    expect(r.avisos).toHaveLength(2)
    expect(r.avisos.some((a) => a.includes('mais de uma filial'))).toBe(true)
    expect(r.avisos.some((a) => a.includes('não tem cidade cadastrada'))).toBe(true)
  })

  it('lote misto com a primeira filial OK avisa só do lote', () => {
    const r = cidadeDoTermo([{ filial_id: 3 }, { filial_id: 9 }], FILIAIS)
    expect(r.cidade).toBe('Linhares')
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

  // ⚠ Telefone/IMEI/Pulsus NÃO são cobrados, nem no celular. A 0101 não faz
  // backfill, então a frota inteira anterior à F25 os tem nulos: o aviso apareceria
  // em ~100% dos termos de celular e treinaria o operador a ignorar o banner — que
  // é o mesmo que carrega "lote de filiais divergentes" e "filial sem cidade". E a
  // frase seria falsa: os três são campos editáveis do diálogo, digitados ali desde
  // a F5A, então não "saem em branco" por não estarem no cadastro.
  it('CELULAR sem os três campos novos NÃO é cobrado', () => {
    expect(camposFaltantesDoTermo(ativo({ categoria: 'celular' }))).toEqual([])
  })

  it('celular COM os três campos também não cobra nada', () => {
    const cel = ativo({
      categoria: 'celular',
      telefone: '(41) 90000-0000',
      imei: '000000000000000',
      pulsus: 'PULSUS-1',
    })
    expect(camposFaltantesDoTermo(cel)).toEqual([])
  })

  it('o celular continua cobrando os campos CADASTRAIS, como toda categoria', () => {
    expect(
      camposFaltantesDoTermo(ativo({ categoria: 'celular', modelo: null })),
    ).toEqual(['modelo'])
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
