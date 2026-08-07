import { describe, it, expect } from 'vitest'
import {
  contarPatrimoniosRascunho,
  desserializarRascunhoCompra,
  MAX_CHARS_TEXTO_RASCUNHO,
  rascunhoVazio,
  type RascunhoCompra,
} from '@/components/ativos/rascunho-compra'
import { MAX_LOTE_COMPRA } from '@/lib/patrimonio'

// Dados 100% fictícios (CLAUDE.md): patrimônio de exemplo, sem colaborador real.
function bruto(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    modo: 'lista',
    textoLista: 'WAP0001234, ST-AAA111',
    faixaInicio: '',
    faixaFim: '',
    faixaSts: '',
    categoria: 'notebook',
    marca: 'Dell',
    modelo: 'Latitude 5420',
    memoria: '8 GB',
    armazenamento: '256 GB',
    processador: 'i5',
    fornecedor: 'WAP',
    filialId: '2',
    observacao: 'NF-e 12345',
    data: '2026-08-01',
    telefone: '',
    imei: '',
    pulsus: '',
    salvoEm: '2026-08-07T12:00:00.000Z',
    ...over,
  })
}

describe('desserializarRascunhoCompra — rascunho vazio', () => {
  it('nada digitado (JSON vazio) => null', () => {
    expect(desserializarRascunhoCompra('{}')).toBeNull()
  })

  it('só a data (default do formulário virgem) => null', () => {
    expect(
      desserializarRascunhoCompra(JSON.stringify({ data: '2026-08-07' })),
    ).toBeNull()
  })

  it('só espaços em branco nos campos de texto => null', () => {
    expect(
      desserializarRascunhoCompra(
        bruto({
          textoLista: '   ',
          categoria: '',
          marca: '  ',
          modelo: '',
          memoria: '',
          armazenamento: '',
          processador: '',
          fornecedor: '',
          filialId: '',
          observacao: '  ',
          telefone: '',
          imei: '',
          pulsus: '',
        }),
      ),
    ).toBeNull()
  })

  it('null / string vazia => null', () => {
    expect(desserializarRascunhoCompra(null)).toBeNull()
    expect(desserializarRascunhoCompra('')).toBeNull()
  })
})

describe('desserializarRascunhoCompra — ida e volta completa', () => {
  it('rascunho íntegro volta inteiro', () => {
    const r = desserializarRascunhoCompra(bruto())
    expect(r).not.toBeNull()
    expect(r).toEqual<RascunhoCompra>({
      modo: 'lista',
      textoLista: 'WAP0001234, ST-AAA111',
      faixaInicio: '',
      faixaFim: '',
      faixaSts: '',
      categoria: 'notebook',
      marca: 'Dell',
      modelo: 'Latitude 5420',
      memoria: '8 GB',
      armazenamento: '256 GB',
      processador: 'i5',
      fornecedor: 'WAP',
      filialId: '2',
      observacao: 'NF-e 12345',
      data: '2026-08-01',
      telefone: '',
      imei: '',
      pulsus: '',
      salvoEm: '2026-08-07T12:00:00.000Z',
    })
  })

  it('modo faixa e campos de celular também voltam inteiros', () => {
    const r = desserializarRascunhoCompra(
      bruto({
        modo: 'faixa',
        textoLista: '',
        faixaInicio: 'WAP0006026',
        faixaFim: 'WAP0006028',
        faixaSts: 'ST-A\nST-B\nST-C',
        categoria: 'celular',
        telefone: '(41) 90000-0000',
        imei: '000000000000000',
        pulsus: 'id-pulsus',
      }),
    )!
    expect(r.modo).toBe('faixa')
    expect(r.faixaInicio).toBe('WAP0006026')
    expect(r.faixaFim).toBe('WAP0006028')
    expect(r.faixaSts).toBe('ST-A\nST-B\nST-C')
    expect(r.categoria).toBe('celular')
    expect(r.telefone).toBe('(41) 90000-0000')
    expect(r.imei).toBe('000000000000000')
    expect(r.pulsus).toBe('id-pulsus')
  })
})

describe('desserializarRascunhoCompra — JSON corrompido', () => {
  it('JSON quebrado / não-objeto => null', () => {
    expect(desserializarRascunhoCompra('{ isso não é json')).toBeNull()
    expect(desserializarRascunhoCompra('"texto"')).toBeNull()
    expect(desserializarRascunhoCompra('42')).toBeNull()
    expect(desserializarRascunhoCompra('null')).toBeNull()
    expect(desserializarRascunhoCompra('[1,2,3]')).toBeNull()
  })
})

describe('desserializarRascunhoCompra — campos de tipo errado viram default', () => {
  it('cada campo de texto com tipo errado vira string vazia, sem lançar', () => {
    const r = desserializarRascunhoCompra(
      bruto({
        textoLista: 42,
        marca: null,
        modelo: ['Latitude'],
        memoria: {},
        armazenamento: true,
        fornecedor: undefined,
        filialId: 2,
        observacao: 7,
        telefone: 41900000000,
        imei: null,
        pulsus: false,
      }),
    )!
    expect(r).not.toBeNull()
    expect(r.textoLista).toBe('')
    expect(r.marca).toBe('')
    expect(r.modelo).toBe('')
    expect(r.memoria).toBe('')
    expect(r.armazenamento).toBe('')
    expect(r.fornecedor).toBe('')
    expect(r.filialId).toBe('')
    expect(r.observacao).toBe('')
    expect(r.telefone).toBe('')
    expect(r.imei).toBe('')
    expect(r.pulsus).toBe('')
    // O que sobrou íntegro (categoria válida) segura o rascunho longe do null.
    expect(r.categoria).toBe('notebook')
  })

  it('categoria fora do vocabulário (ou herdada de Object.prototype) vira vazia', () => {
    for (const lixo of ['inventada', 'toString', 'constructor', 'hasOwnProperty']) {
      const r = desserializarRascunhoCompra(bruto({ categoria: lixo }))!
      expect(r.categoria).toBe('')
    }
  })

  it('modo fora de "lista"/"faixa" vira "lista"', () => {
    expect(desserializarRascunhoCompra(bruto({ modo: 'outracoisa' }))!.modo).toBe(
      'lista',
    )
    expect(desserializarRascunhoCompra(bruto({ modo: 42 }))!.modo).toBe('lista')
  })

  it('data ausente ou de tipo errado cai no default (data de hoje)', () => {
    const r = desserializarRascunhoCompra(bruto({ data: 99 }))!
    expect(r.data).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('desserializarRascunhoCompra — rascunho antigo/parcial restaura sem erro', () => {
  it('objeto só com o campo mais antigo (textoLista) restaura com o resto em default', () => {
    const r = desserializarRascunhoCompra(
      JSON.stringify({ textoLista: 'WAP0001234, ST-AAA111' }),
    )!
    expect(r).not.toBeNull()
    expect(r.textoLista).toBe('WAP0001234, ST-AAA111')
    expect(r.modo).toBe('lista')
    expect(r.categoria).toBe('')
    expect(r.filialId).toBe('')
    expect(r.telefone).toBe('')
    expect(r.imei).toBe('')
    expect(r.pulsus).toBe('')
    expect(r.salvoEm).toBe('')
    expect(r.data).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('rascunho salvo antes dos campos de celular existirem restaura sem erro', () => {
    const semCelular = bruto()
    const obj = JSON.parse(semCelular) as Record<string, unknown>
    delete obj.telefone
    delete obj.imei
    delete obj.pulsus
    const r = desserializarRascunhoCompra(JSON.stringify(obj))!
    expect(r).not.toBeNull()
    expect(r.telefone).toBe('')
    expect(r.imei).toBe('')
    expect(r.pulsus).toBe('')
  })
})

describe('desserializarRascunhoCompra — teto de tamanho do texto colado', () => {
  it('texto colado é truncado no teto, nunca lança nem devolve tudo', () => {
    const gigante = 'A'.repeat(MAX_CHARS_TEXTO_RASCUNHO + 5_000)
    const r = desserializarRascunhoCompra(bruto({ textoLista: gigante }))!
    expect(r.textoLista.length).toBe(MAX_CHARS_TEXTO_RASCUNHO)
  })

  it('faixaSts gigante também é truncada', () => {
    const gigante = 'ST-A\n'.repeat(10_000)
    const r = desserializarRascunhoCompra(
      bruto({ modo: 'faixa', faixaSts: gigante }),
    )!
    expect(r.faixaSts.length).toBe(MAX_CHARS_TEXTO_RASCUNHO)
  })
})

describe('rascunhoVazio', () => {
  const base: Omit<RascunhoCompra, 'salvoEm' | 'data'> = {
    modo: 'lista',
    textoLista: '',
    faixaInicio: '',
    faixaFim: '',
    faixaSts: '',
    categoria: '',
    marca: '',
    modelo: '',
    memoria: '',
    armazenamento: '',
    processador: '',
    fornecedor: '',
    filialId: '',
    observacao: '',
    telefone: '',
    imei: '',
    pulsus: '',
  }

  it('tudo vazio => vazio', () => {
    expect(rascunhoVazio(base)).toBe(true)
  })

  it('um único campo com conteúdo já basta para não ser vazio', () => {
    expect(rascunhoVazio({ ...base, textoLista: 'WAP0001234, ST-A' })).toBe(false)
    expect(rascunhoVazio({ ...base, categoria: 'notebook' })).toBe(false)
    expect(rascunhoVazio({ ...base, marca: 'Dell' })).toBe(false)
    expect(rascunhoVazio({ ...base, filialId: '2' })).toBe(false)
  })
})

describe('contarPatrimoniosRascunho', () => {
  it('modo lista conta pelos itens válidos do texto colado', () => {
    const r = desserializarRascunhoCompra(
      bruto({ textoLista: 'WAP0001234, ST-A\nWAP0001235, ST-B\nlinha inválida' }),
    )!
    expect(contarPatrimoniosRascunho(r)).toBe(2)
  })

  it('modo faixa conta pela expansão de início..fim', () => {
    const r = desserializarRascunhoCompra(
      bruto({
        modo: 'faixa',
        textoLista: '',
        faixaInicio: 'WAP0006026',
        faixaFim: 'WAP0006030',
      }),
    )!
    expect(contarPatrimoniosRascunho(r)).toBe(5)
  })

  it('faixa incompleta (só início, ou início > fim) conta zero, nunca lança', () => {
    const soInicio = desserializarRascunhoCompra(
      bruto({ modo: 'faixa', textoLista: '', faixaInicio: 'WAP0006026', faixaFim: '' }),
    )!
    expect(contarPatrimoniosRascunho(soInicio)).toBe(0)

    const invertida = desserializarRascunhoCompra(
      bruto({
        modo: 'faixa',
        textoLista: '',
        faixaInicio: 'WAP0006030',
        faixaFim: 'WAP0006026',
      }),
    )!
    expect(contarPatrimoniosRascunho(invertida)).toBe(0)
  })

  it('a contagem nunca ultrapassa o teto do lote', () => {
    const r = desserializarRascunhoCompra(
      bruto({
        modo: 'faixa',
        textoLista: '',
        faixaInicio: 'WAP0000001',
        // Faixa MUITO maior que o teto: expandirFaixa recusa e devolve erro
        // (sem `itens`) — a contagem cai no fallback 0, não numa lista gigante.
        faixaFim: `WAP0${String(MAX_LOTE_COMPRA + 500).padStart(6, '0')}`,
      }),
    )!
    expect(contarPatrimoniosRascunho(r)).toBe(0)
  })
})
