// Testes do parse de CSV (encoding, header, extração) — CSVs SINTÉTICOS
// escritos em arquivos temporários do sistema (nunca dados reais).
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { montarPlanoItens } from '../itens'
import {
  decodificarCsv,
  extrairDevolucoes,
  extrairInventario,
  extrairSaidas,
  parseCsvCru,
} from '../parse'

const dir = mkdtempSync(join(tmpdir(), 'carga-f4-teste-'))
let seq = 0
function arquivoTemp(conteudo: string | Buffer): string {
  const p = join(dir, `sintetico-${seq++}.csv`)
  writeFileSync(p, conteudo)
  return p
}

const HEADER_FILIAL =
  'Site:;Marca:;Tipo:;Modelo:;Grade;Fornecedor:;Service Tag;Patrimônio;Memoria;Armazenamento;Processador;Hostname;Data de Entrega:;Status;Situação;Data de Inclusão;Colaborador;GLPI;Termo de Ativos;Observação:'

describe('decodificarCsv', () => {
  it('detecta BOM UTF-8 (formato real do export de 15/07/2026)', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Observação;çã', 'utf8')])
    const r = decodificarCsv(buf)
    expect(r.encoding).toBe('utf-8')
    expect(r.texto).toBe('Observação;çã')
  })

  it('cai para windows-1252 quando os bytes não são UTF-8 válido', () => {
    // "ção" em cp1252: e7 e3 6f — inválido como UTF-8
    const buf = Buffer.from([0x63, 0xe7, 0xe3, 0x6f])
    const r = decodificarCsv(buf)
    expect(r.encoding).toBe('windows-1252')
    expect(r.texto).toBe('cção')
  })
})

describe('extrairInventario', () => {
  it('lê o layout de filial (20 col) com célula multilinha entre aspas', () => {
    const csv = [
      HEADER_FILIAL,
      'Serra;Samsung;Celular;Fone Z;;WAP;"\nTAG08010";WAP8010;4GB;128GB;CPU;WAP0008010;01/02/2026;Remanejo;Saída ;15/01/2026;Fulana de Tal;9001;SIM;obs',
      ';;;;;;;;;;;;;;;;;;;',
      ';;;;;;TAGSOLTA;;;;;;;;;;;;;',
    ].join('\r\n')
    const cru = parseCsvCru(arquivoTemp('﻿' + csv))
    const { layout, registros, descartadas } = extrairInventario(cru)
    expect(layout).toBe('filial')
    expect(registros).toHaveLength(1)
    expect(registros[0]).toMatchObject({ site: 'Serra', patrimonio: 'WAP8010', glpi: '9001', linha: 2 })
    // célula multilinha vem com a quebra preservada (normalizada depois)
    expect(registros[0]!.serviceTag).toContain('TAG08010')
    // linha só com service tag solta → descartada com rastro
    expect(descartadas).toHaveLength(1)
    expect(descartadas[0]!.linha).toBe(4)
  })

  it('header de MOVIMENTAÇÃO no lugar de inventário → arquivo trocado (aborta)', () => {
    const csv = 'Data da Saída;Unidade;Categoria;Marca / Modelo;Patrimônio;Tipo de Movimentação;Chamado;Colaborador/Setor;Tipo;Termo Assinado\n'
    expect(() => extrairInventario(parseCsvCru(arquivoTemp(csv)))).toThrow(/arquivo trocado/)
  })

  it('header desconhecido → aborta', () => {
    const csv = 'Coluna A;Coluna B\n1;2\n'
    expect(() => extrairInventario(parseCsvCru(arquivoTemp(csv)))).toThrow(/arquivo trocado/)
  })
})

describe('extrairSaidas / extrairDevolucoes', () => {
  it('extrai saídas com colunas vazias à direita', () => {
    const csv = [
      'Data da Saída;Unidade;Categoria;Marca / Modelo;Patrimônio;Tipo de Movimentação;Chamado;Colaborador/Setor;Tipo;Termo Assinado;;',
      '05/01/2026;Matriz;Celular;Marca Fone Z;LEA0008020;Saída;9001;Fulana de Tal / Setor X;Nova Contratação;Sim;;',
      ';;;;;;;;;;;',
    ].join('\r\n')
    const { registros } = extrairSaidas(parseCsvCru(arquivoTemp(csv)))
    expect(registros).toHaveLength(1)
    expect(registros[0]).toMatchObject({ data: '05/01/2026', unidade: 'Matriz', patrimonio: 'LEA0008020' })
  })

  it('extrai devoluções e valida layout', () => {
    const csv = [
      'Data da devolução;Unidade;Categoria;Marca / Modelo;Patrimônio;Colaborador;Tipo de entrada;Itens faltantes;Setor;Tipo',
      '10/02/2026;Linhares;Notebook;Marca Note W;LEA0008021;Beltrano;Devolução;Mochila, MousePad;Setor Y;Desligamento',
    ].join('\r\n')
    const { registros } = extrairDevolucoes(parseCsvCru(arquivoTemp(csv)))
    expect(registros).toHaveLength(1)
    expect(registros[0]).toMatchObject({ tipoEntrada: 'Devolução', itensFaltantes: 'Mochila, MousePad' })
    expect(() => extrairSaidas(parseCsvCru(arquivoTemp(csv)))).toThrow(/arquivo trocado/)
  })
})

describe('montarPlanoItens (3.2b)', () => {
  it('normaliza nomes contra o catálogo e só gera lançamento com saldo > 0', () => {
    const csv = [
      'Item;Filial;Saldo',
      'Mouse USB;Matriz;5',
      'mouse usb;Linhares;0',
      'Teclado ABNT;Serra Park;2',
    ].join('\n')
    const plano = montarPlanoItens(parseCsvCru(arquivoTemp(csv)), ['Mouse USB', 'Teclado ABNT'], false)
    expect(plano.inconsistencias).toHaveLength(0)
    expect(plano.saldos).toEqual([
      expect.objectContaining({ nomeItem: 'Mouse USB', filial: 'Matriz', saldo: 5 }),
      expect.objectContaining({ nomeItem: 'Teclado ABNT', filial: 'Serra', saldo: 2 }),
    ])
  })

  it('item fora do catálogo → bloqueante; saldo inválido → bloqueante', () => {
    const csv = ['Item;Filial;Saldo', 'Cabo HDMI;Matriz;3', 'Mouse USB;Matriz;-1'].join('\n')
    const plano = montarPlanoItens(parseCsvCru(arquivoTemp(csv)), ['Mouse USB'], false)
    expect(plano.inconsistencias.map((i) => i.tipo).sort()).toEqual(['item_desconhecido', 'saldo_invalido'])
    expect(plano.inconsistencias.every((i) => i.severidade === 'bloqueante')).toBe(true)
  })

  it('header sem colunas reconhecíveis → arquivo trocado (aborta)', () => {
    const csv = 'Produto;Local;Qtde em 15/07\nMouse USB;Matriz;5\n'
    expect(() => montarPlanoItens(parseCsvCru(arquivoTemp(csv)), [], false)).toThrow(/arquivo trocado/)
  })
})
