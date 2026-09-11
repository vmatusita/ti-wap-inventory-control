import { describe, expect, it } from 'vitest'
import { decodificarCsv, detectarLayout, extrairRegistros, parseCsv } from './parse'

// Headers de display (com acentos e `:`) dos 3 layouts — testam a normalização.
const H_MATRIZ =
  'Site;Marca;Tipo;Modelo;Fornecedor;Service Tag;Patrimônio;Memória;Armazenamento;Processador;Hostname;Data de Entrega;Status;Situação;Data de Inclusão;Colaborador;Termo de Ativos;Observação'
const H_CD =
  'Site;Marca;Tipo;Modelo;Fornecedor;Service Tag;Patrimônio;Memória;Armazenamento;Processador;Hostname;Status;Situação;Data de Inclusão;Colaborador;Observação'
const H_PADRAO20 =
  'Site;Marca;Tipo;Modelo;Fornecedor;Service Tag;Patrimônio;Memória;Armazenamento;Processador;Hostname;Data de Entrega;Status;Situação;Data de Inclusão;Colaborador;Termo de Ativos;Observação;Grade;GLPI'

describe('decodificarCsv (encoding)', () => {
  it('UTF-8 sem BOM', () => {
    const r = decodificarCsv(Buffer.from('Coração;ção', 'utf8'))
    expect(r.encoding).toBe('utf-8')
    expect(r.texto).toBe('Coração;ção')
  })
  it('UTF-8 com BOM → BOM removido', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Ativo;ç', 'utf8')])
    const r = decodificarCsv(buf)
    expect(r.encoding).toBe('utf-8')
    expect(r.texto).toBe('Ativo;ç')
    expect(r.texto.charCodeAt(0)).not.toBe(0xfeff)
  })
  it('cp1252 (Excel WAP) → windows-1252 com acentos corretos', () => {
    // latin1 == cp1252 para ç(0xE7)/ã(0xE3) — bytes inválidos em UTF-8 → fallback
    const buf = Buffer.from('Eusébio;Coração;ção', 'latin1')
    const r = decodificarCsv(buf)
    expect(r.encoding).toBe('windows-1252')
    expect(r.texto).toBe('Eusébio;Coração;ção')
  })
  it('aceita ArrayBuffer e Uint8Array', () => {
    const u8 = new Uint8Array(Buffer.from('abc;def', 'utf8'))
    expect(decodificarCsv(u8).texto).toBe('abc;def')
    const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
    expect(decodificarCsv(ab).texto).toBe('abc;def')
  })
})

describe('parseCsv', () => {
  it('separa por `;`, aparando as células de dados', () => {
    const csv = parseCsv('A;B;C\n 1 ; 2 ; 3 ')
    expect(csv.header).toEqual(['A', 'B', 'C'])
    expect(csv.linhas[0]).toEqual({ celulas: ['1', '2', '3'], linha: 2 })
  })
})

describe('detectarLayout (conjunto de nomes normalizados)', () => {
  it('reconhece os 3 layouts', () => {
    expect(detectarLayout(H_MATRIZ.split(';')).layout).toBe('colunas18')
    expect(detectarLayout(H_CD.split(';')).layout).toBe('colunas16')
    expect(detectarLayout(H_PADRAO20.split(';')).layout).toBe('colunas20')
  })
  it('tolera coluna vazia à direita (separador sobrando)', () => {
    expect(detectarLayout([...H_MATRIZ.split(';'), ''].join(';').split(';')).layout).toBe('colunas18')
  })
  it('header quebrado → layout null + faltando/sobrando', () => {
    const semPatrimonio = H_MATRIZ.split(';').filter((c) => c !== 'Patrimônio')
    const det = detectarLayout(semPatrimonio)
    expect(det.layout).toBeNull()
    expect(det.faltando).toContain('patrimonio')
  })
  it('coluna extra desconhecida → layout null', () => {
    const det = detectarLayout([...H_MATRIZ.split(';'), 'Cor Favorita'])
    expect(det.layout).toBeNull()
    expect(det.sobrando).toContain('cor favorita')
  })
})

describe('extrairRegistros', () => {
  it('pula linha 100% vazia, descarta linha sem Site e sem patrimônio', () => {
    const texto = [
      H_MATRIZ,
      'Matriz;Dell;Notebook;;;;WAP0001234;;;;;;Estoque;;;;;', // ativo ok
      ';;;;;;;;;;;;;;;;;', // 100% vazia → pulada
      'Matriz;;;;;;;;;;;;;;;; ;', // sem patrimônio mas com Site → é registro (site preenchido)
      ';;Notebook;;;SVC-1;;;;;;;;;;;;', // sem Site E sem patrimônio → descartada
    ].join('\n')
    const csv = parseCsv(texto)
    const { registros, descartadas, totalLinhasDados } = extrairRegistros(csv)
    expect(registros.length).toBe(2)
    expect(descartadas.length).toBe(1)
    // não conta a 100% vazia; conta registros + descartadas
    expect(totalLinhasDados).toBe(3)
  })
})
