import { describe, expect, it } from 'vitest'
import {
  rotuloCliqueMotivo,
  rotuloCliqueSegmento,
  urlAtivosPorSegmento,
  urlFiltroMotivo,
} from './cliques-grafico'

describe('urlFiltroMotivo', () => {
  it('querystring vazia: acrescenta só o param do motivo', () => {
    expect(urlFiltroMotivo('sd', 'Compra', '')).toBe('sd.motivo=Compra')
  })

  it('param já presente: substitui o valor, não duplica a chave', () => {
    const nova = urlFiltroMotivo('sd', 'Compra', 'sd.motivo=Novo+colaborador')
    const params = new URLSearchParams(nova)
    expect(params.getAll('sd.motivo')).toEqual(['Compra'])
  })

  it('motivo com espaço, barra e acento: encode correto e reversível', () => {
    const nova = urlFiltroMotivo('sd', 'Troca / upgrade', '')
    expect(new URLSearchParams(nova).get('sd.motivo')).toBe('Troca / upgrade')
  })

  it('preserva período e o filtro de OUTRA tabela (prefixo diferente)', () => {
    const atual = '?de=2026-08-03&ate=2026-08-10&en.motivo=Compra&sd.q=abc'
    const nova = urlFiltroMotivo('sd', 'Troca / upgrade', atual)
    const params = new URLSearchParams(nova)
    expect(params.get('de')).toBe('2026-08-03')
    expect(params.get('ate')).toBe('2026-08-10')
    expect(params.get('en.motivo')).toBe('Compra')
    expect(params.get('sd.q')).toBe('abc')
    expect(params.get('sd.motivo')).toBe('Troca / upgrade')
  })

  it('motivo vazio remove o param (nunca deixa `sd.motivo=` pendurado)', () => {
    const nova = urlFiltroMotivo('sd', '', '?de=2026-08-03&sd.motivo=Compra')
    expect(nova).not.toContain('sd.motivo')
    expect(new URLSearchParams(nova).get('de')).toBe('2026-08-03')
  })

  it('aceita a querystring ATUAL com "?" inicial (como useSearchParams a devolve com o prefixo montado pelo chamador)', () => {
    const nova = urlFiltroMotivo('sd', 'Compra', '?de=2026-08-03')
    expect(new URLSearchParams(nova).get('de')).toBe('2026-08-03')
    expect(new URLSearchParams(nova).get('sd.motivo')).toBe('Compra')
  })
})

describe('urlAtivosPorSegmento', () => {
  it('monta status + categoria + o recorte de filial, na ordem de linksKpiAtivos', () => {
    expect(urlAtivosPorSegmento('em_estoque', 'notebook', '&filial=todas')).toBe(
      '/ativos?status=em_estoque&categoria=notebook&filial=todas',
    )
  })

  it('recorte de filial específica (id numérico)', () => {
    expect(urlAtivosPorSegmento('em_manutencao', 'monitor', '&filial=7')).toBe(
      '/ativos?status=em_manutencao&categoria=monitor&filial=7',
    )
  })
})

describe('rotuloCliqueMotivo', () => {
  it('plural, saídas — o molde do enunciado', () => {
    expect(rotuloCliqueMotivo('Troca / upgrade', 55, 'saidas')).toBe(
      'Ver as 55 saídas por Troca / upgrade',
    )
  })

  it('singular, entradas', () => {
    expect(rotuloCliqueMotivo('Compra', 1, 'entradas')).toBe('Ver a 1 entrada por Compra')
  })

  it('plural, entradas', () => {
    expect(rotuloCliqueMotivo('Compra', 8, 'entradas')).toBe('Ver as 8 entradas por Compra')
  })

  it('singular, saídas', () => {
    expect(rotuloCliqueMotivo('Novo colaborador', 1, 'saidas')).toBe(
      'Ver a 1 saída por Novo colaborador',
    )
  })
})

describe('rotuloCliqueSegmento', () => {
  it('plural, categoria regular ("-s") — o molde do enunciado', () => {
    expect(rotuloCliqueSegmento('em_estoque', 'notebook', 12)).toBe(
      'Ver os 12 notebooks em estoque',
    )
  })

  it('singular: artigo e categoria no singular', () => {
    expect(rotuloCliqueSegmento('em_estoque', 'notebook', 1)).toBe('Ver o 1 notebook em estoque')
  })

  it('categoria irregular terminada em "r" (monitor→monitores)', () => {
    expect(rotuloCliqueSegmento('em_uso', 'monitor', 4)).toBe('Ver os 4 monitores em uso')
  })

  it('categoria irregular terminada em "r" (celular→celulares)', () => {
    expect(rotuloCliqueSegmento('reservado', 'celular', 2)).toBe('Ver os 2 celulares reservados')
  })

  it('status locução adverbial ("em …") não concorda no plural', () => {
    expect(rotuloCliqueSegmento('em_triagem', 'tablet', 3)).toBe('Ver os 3 tablets em triagem')
  })

  it('status particípio simples concorda no plural (defasado→defasados)', () => {
    expect(rotuloCliqueSegmento('defasado', 'desktop', 6)).toBe('Ver os 6 desktops defasados')
  })

  it('status de duas palavras: só a 1ª concorda (devolvido ao fornecedor→devolvidos ao fornecedor)', () => {
    expect(rotuloCliqueSegmento('devolvido_fornecedor', 'outro', 3)).toBe(
      'Ver os 3 outros devolvidos ao fornecedor',
    )
  })

  it('status particípio no singular não leva o "s" (emprestado)', () => {
    expect(rotuloCliqueSegmento('emprestado', 'notebook', 1)).toBe(
      'Ver o 1 notebook emprestado',
    )
  })
})
