import { describe, it, expect } from 'vitest'
import { BOM_UTF8, gerarCsv, nomeArquivoCsv, type ColunaCsv } from './csv'

// OS-F10 · T5 — o CSV precisa abrir no Excel pt-BR sem ajuste nenhum:
// BOM UTF-8, separador `;`, quebras CRLF e escape de aspas/separador.
// Dados 100% fictícios (CLAUDE.md).

type Linha = { patrimonio: string | null; nome: string; qtd: number }

const COLUNAS: ColunaCsv<Linha>[] = [
  { titulo: 'Patrimônio', valor: (l) => l.patrimonio },
  { titulo: 'Nome', valor: (l) => l.nome },
  { titulo: 'Qtd.', valor: (l) => l.qtd },
]

describe('gerarCsv', () => {
  it('começa com BOM UTF-8 e termina em CRLF', () => {
    const csv = gerarCsv(COLUNAS, [])
    expect(csv.startsWith(BOM_UTF8)).toBe(true)
    expect(BOM_UTF8).toBe('\uFEFF')
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('lista vazia gera só o cabeçalho (sem crash)', () => {
    expect(gerarCsv(COLUNAS, [])).toBe(`${BOM_UTF8}Patrimônio;Nome;Qtd.\r\n`)
  })

  it('usa ponto e vírgula como separador e CRLF entre as linhas', () => {
    const csv = gerarCsv(COLUNAS, [
      { patrimonio: 'WAP0001234', nome: 'Fulano da Silva', qtd: 2 },
      { patrimonio: 'WAP0004491', nome: 'Beltrana de Souza', qtd: 1 },
    ])
    expect(csv).toBe(
      `${BOM_UTF8}Patrimônio;Nome;Qtd.\r\n` +
        'WAP0001234;Fulano da Silva;2\r\n' +
        'WAP0004491;Beltrana de Souza;1\r\n',
    )
    // nenhum LF solto (sem CR antes) — Excel pt-BR exige CRLF
    expect(/(^|[^\r])\n/.test(csv)).toBe(false)
  })

  it('põe entre aspas a célula que contém o separador', () => {
    const csv = gerarCsv(COLUNAS, [
      { patrimonio: 'WAP0001234', nome: 'Sala 3; mesa 4', qtd: 1 },
    ])
    expect(csv).toContain('WAP0001234;"Sala 3; mesa 4";1\r\n')
  })

  it('dobra as aspas internas e envolve a célula', () => {
    const csv = gerarCsv(COLUNAS, [
      { patrimonio: 'WAP0001234', nome: 'Monitor 24" fictício', qtd: 1 },
    ])
    expect(csv).toContain('WAP0001234;"Monitor 24"" fictício";1\r\n')
  })

  it('põe entre aspas a célula com quebra de linha', () => {
    const csv = gerarCsv(COLUNAS, [
      { patrimonio: 'WAP0001234', nome: 'linha 1\nlinha 2', qtd: 1 },
    ])
    expect(csv).toContain('"linha 1\nlinha 2"')
  })

  it('trata null/undefined como célula vazia', () => {
    const colunas: ColunaCsv<Linha>[] = [
      ...COLUNAS,
      { titulo: 'Extra', valor: () => undefined },
    ]
    const csv = gerarCsv(colunas, [{ patrimonio: null, nome: '', qtd: 0 }])
    expect(csv).toContain(';;0;\r\n')
  })

  it('mantém número negativo intacto e usa vírgula no decimal', () => {
    const colunas: ColunaCsv<{ n: number }>[] = [
      { titulo: 'N', valor: (l) => l.n },
    ]
    expect(gerarCsv(colunas, [{ n: -3 }])).toContain('\r\n-3\r\n')
    expect(gerarCsv(colunas, [{ n: 1.5 }])).toContain('\r\n1,5\r\n')
  })

  it('neutraliza célula que o Excel executaria como fórmula', () => {
    const colunas: ColunaCsv<{ t: string }>[] = [
      { titulo: 'T', valor: (l) => l.t },
    ]
    expect(gerarCsv(colunas, [{ t: '=1+1' }])).toContain(`"'=1+1"`)
    expect(gerarCsv(colunas, [{ t: '@Fulano' }])).toContain(`"'@Fulano"`)
    expect(gerarCsv(colunas, [{ t: '-1+1' }])).toContain(`"'-1+1"`)
    // texto comum não é tocado
    expect(gerarCsv(colunas, [{ t: 'Notebook' }])).toContain('\r\nNotebook\r\n')
  })
})

describe('nomeArquivoCsv', () => {
  it('junta prefixo e data do dia', () => {
    expect(nomeArquivoCsv('ativos', '2026-07-22')).toBe('ativos-2026-07-22.csv')
  })
})
