import { describe, expect, it } from 'vitest'
import { validarCsvImport } from './plano'
import type { FilialSelecionada } from './tipos'

// ===========================================================================
// Helpers — CSVs 100% FICTÍCIOS (padrão WAP0001234 / "Fulano"/"Ciclano").

const H_MATRIZ =
  'Site;Marca;Tipo;Modelo;Fornecedor;Service Tag;Patrimônio;Memória;Armazenamento;Processador;Hostname;Data de Entrega;Status;Situação;Data de Inclusão;Colaborador;Termo de Ativos;Observação'
const H_CD =
  'Site;Marca;Tipo;Modelo;Fornecedor;Service Tag;Patrimônio;Memória;Armazenamento;Processador;Hostname;Status;Situação;Data de Inclusão;Colaborador;Observação'
const H_PADRAO20 =
  'Site;Marca;Tipo;Modelo;Fornecedor;Service Tag;Patrimônio;Memória;Armazenamento;Processador;Hostname;Data de Entrega;Status;Situação;Data de Inclusão;Colaborador;Termo de Ativos;Observação;Grade;GLPI'

const HOJE = '2026-07-16'

const MATRIZ: FilialSelecionada = { id: 1, slug: 'matriz', nome: 'Matriz' }
const SERRA: FilialSelecionada = { id: 5, slug: 'serra', nome: 'Serra' }
const CD: FilialSelecionada = { id: 2, slug: 'cd-afonso-pena', nome: 'CD-Afonso Pena' }
const EUSEBIO: FilialSelecionada = { id: 4, slug: 'eusebio', nome: 'Eusébio' }

function linhaDe(headers: string[], v: Record<string, string>): string {
  return headers.map((h) => v[h] ?? '').join(';')
}
function montar(headerLine: string, linhas: Record<string, string>[]): string {
  const headers = headerLine.split(';')
  return [headerLine, ...linhas.map((l) => linhaDe(headers, l))].join('\n')
}
function buf(s: string): Buffer {
  return Buffer.from(s, 'utf8')
}
/** Linha mínima válida no layout matriz (em_estoque, notebook, patrimônio ok). */
function rowMatriz(over: Record<string, string> = {}): Record<string, string> {
  return { Site: 'Matriz', Tipo: 'Notebook', 'Patrimônio': 'WAP0001234', Status: 'Estoque', ...over }
}
function validarMatriz(linhas: Record<string, string>[], filial = MATRIZ) {
  return validarCsvImport(buf(montar(H_MATRIZ, linhas)), filial, HOJE)
}

// ===========================================================================

describe('layouts válidos', () => {
  it('matriz — plano completo, campos do alinhamento F7 §3', () => {
    const r = validarMatriz([
      rowMatriz({
        Marca: 'Dell',
        Modelo: 'Latitude 3440',
        'Service Tag': 'SVC-ABC',
        'Patrimônio': 'WAP4491', // canoniza
        'Data de Entrega': '10/01/2025',
        'Data de Inclusão': '15/12/2024',
        Observação: 'nota teste',
        'Termo de Ativos': 'Sim', // IGNORADO
      }),
    ])
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.resumo.layout).toBe('matriz')
    expect(r.plano).not.toBeNull()
    expect(r.plano!.filialId).toBe(1)
    expect(r.plano!.totalLinhasDados).toBe(1)
    const a = r.plano!.ativos[0]!
    expect(a.patrimonio).toBe('WAP0004491')
    expect(a.patrimonioOriginal).toBe('WAP4491')
    expect(a.serviceTag).toBe('SVC-ABC')
    expect(a.categoria).toBe('notebook')
    expect(a.modelo).toBe('Latitude 3440')
    expect(a.estadoAlvo).toBe('em_estoque')
    expect(a.dataEntrada).toBe('2024-12-15') // mais antiga válida
    expect(a.observacoes).toBe('nota teste')
    expect(a.chamado).toBeNull() // matriz não tem GLPI
  })

  it('cd — 16 colunas, sem Data de Entrega/Termo/GLPI', () => {
    const r = validarCsvImport(
      buf(
        montar(H_CD, [
          { Site: 'Matriz', Tipo: 'Monitor', 'Patrimônio': 'WAP0000123', Situação: 'Estoque', 'Data de Inclusão': '01/03/2025' },
        ]),
      ),
      MATRIZ,
      HOJE,
    )
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.resumo.layout).toBe('cd')
    expect(r.plano!.ativos[0]!.categoria).toBe('monitor')
    expect(r.plano!.ativos[0]!.dataEntrada).toBe('2025-03-01')
    expect(r.plano!.ativos[0]!.chamado).toBeNull()
  })

  it('padrao20 — GLPI → chamado; Grade ignorada; Site com De→Para', () => {
    const r = validarCsvImport(
      buf(
        montar(H_PADRAO20, [
          {
            Site: 'Serra Park', // De→Para → Serra
            Tipo: 'Celular',
            'Patrimônio': 'WAP0000777',
            Status: 'Saída',
            'Data de Inclusão': '05/05/2025',
            Colaborador: 'Fulano / Vendas',
            GLPI: 'Chamado 6766',
            Grade: 'X-IGNORADA',
          },
        ]),
      ),
      SERRA,
      HOJE,
    )
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.resumo.layout).toBe('padrao20')
    const a = r.plano!.ativos[0]!
    expect(a.estadoAlvo).toBe('em_uso')
    expect(a.colaborador).toBe('Fulano')
    expect(a.setor).toBe('Vendas')
    expect(a.chamado).toBe('6766')
    // em_uso COM colaborador → sem aviso
    expect(r.avisos.some((e) => e.tipo === 'estado_em_uso_sem_colaborador')).toBe(false)
  })
})

describe('header', () => {
  it('quebrado → bloqueante header_invalido, plano null', () => {
    const header = H_MATRIZ.split(';').filter((c) => c !== 'Patrimônio').join(';')
    const r = validarCsvImport(buf(montar(header, [])), MATRIZ, HOJE)
    expect(r.plano).toBeNull()
    expect(r.bloqueantes).toHaveLength(1)
    expect(r.bloqueantes[0]!.tipo).toBe('header_invalido')
    expect(r.bloqueantes[0]!.mensagem).toContain('patrimonio')
  })
})

describe('encoding', () => {
  it('cp1252 (Excel WAP) com acentos fictícios', () => {
    const texto = montar(H_MATRIZ, [
      { Site: 'Eusébio', Tipo: 'Notebook', 'Patrimônio': 'WAP0000900', Status: 'Estoque', Observação: 'Configuração ç ã' },
    ])
    const r = validarCsvImport(Buffer.from(texto, 'latin1'), EUSEBIO, HOJE)
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos[0]!.observacoes).toBe('Configuração ç ã')
  })
  it('UTF-8 com BOM', () => {
    const texto = montar(H_MATRIZ, [rowMatriz({ Observação: 'com BOM' })])
    const comBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(texto, 'utf8')])
    const r = validarCsvImport(comBom, MATRIZ, HOJE)
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos[0]!.observacoes).toBe('com BOM')
  })
})

describe('patrimônio', () => {
  it('canoniza prefixos LEA/STF', () => {
    const r = validarMatriz([
      rowMatriz({ 'Patrimônio': 'LEA57', 'Service Tag': 'A' }),
      rowMatriz({ 'Patrimônio': 'STF123', 'Service Tag': 'B' }),
    ])
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos.map((a) => a.patrimonio).sort()).toEqual(['LEA0000057', 'STF0000123'])
  })

  it('inválido/vazio → bloqueante patrimonio_invalido', () => {
    const r = validarMatriz([
      rowMatriz({ 'Patrimônio': 'ABC' }),
      rowMatriz({ 'Patrimônio': '' }),
    ])
    expect(r.plano).toBeNull()
    expect(r.bloqueantes.filter((e) => e.tipo === 'patrimonio_invalido')).toHaveLength(2)
  })
})

describe('duplicidade dentro do CSV (índice único coalesce(service_tag,\'\'))', () => {
  it('par patrimônio+ST repetido → bloqueante par_duplicado', () => {
    const r = validarMatriz([
      rowMatriz({ 'Patrimônio': 'WAP0001234', 'Service Tag': 'SVC1' }),
      rowMatriz({ 'Patrimônio': 'WAP0001234', 'Service Tag': 'SVC1' }),
    ])
    expect(r.plano).toBeNull()
    expect(r.bloqueantes.filter((e) => e.tipo === 'par_duplicado')).toHaveLength(2)
  })

  it('patrimônio repetido SEM service tag → bloqueante', () => {
    const r = validarMatriz([
      rowMatriz({ 'Patrimônio': 'WAP0001234' }),
      rowMatriz({ 'Patrimônio': 'WAP0001234' }),
    ])
    expect(r.plano).toBeNull()
    expect(r.bloqueantes.filter((e) => e.tipo === 'patrimonio_duplicado_sem_service_tag')).toHaveLength(2)
  })

  it('mesmo patrimônio com service tags DISTINTAS → legítimo (spec §5)', () => {
    const r = validarMatriz([
      rowMatriz({ 'Patrimônio': 'WAP0001234', 'Service Tag': 'A' }),
      rowMatriz({ 'Patrimônio': 'WAP0001234', 'Service Tag': 'B' }),
    ])
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos).toHaveLength(2)
  })
})

describe('Site (import nunca transfere)', () => {
  it('Site ≠ filial escolhida → bloqueante site_divergente', () => {
    const r = validarMatriz([rowMatriz({ Site: 'Serra' })]) // filial = Matriz
    expect(r.plano).toBeNull()
    expect(r.bloqueantes[0]!.tipo).toBe('site_divergente')
  })
  it('Site com De→Para casando a filial → ok', () => {
    const r = validarMatriz([rowMatriz({ Site: 'CD-PENA' })], CD)
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos).toHaveLength(1)
  })
})

describe('estado (precedência Situação > Status; descartado bloqueia)', () => {
  it('Estoque|Descarte → estado_descartado bloqueante', () => {
    const r = validarMatriz([rowMatriz({ Status: 'Estoque', Situação: 'Descarte' })])
    expect(r.plano).toBeNull()
    expect(r.bloqueantes[0]!.tipo).toBe('estado_descartado')
  })
  it('Remanejo|(vazio) → em_uso; sem colaborador → aviso', () => {
    const r = validarMatriz([rowMatriz({ Status: 'Remanejo' })])
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos[0]!.estadoAlvo).toBe('em_uso')
    expect(r.avisos.some((e) => e.tipo === 'estado_em_uso_sem_colaborador')).toBe(true)
  })
  it('Estoque|Manutenção → em_manutencao', () => {
    const r = validarMatriz([rowMatriz({ Status: 'Estoque', Situação: 'Manutenção' })])
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos[0]!.estadoAlvo).toBe('em_manutencao')
  })
  it('valor fora da tabela → estado_desconhecido bloqueante', () => {
    const r = validarMatriz([rowMatriz({ Status: 'Xyz', Situação: '' })])
    expect(r.plano).toBeNull()
    expect(r.bloqueantes[0]!.tipo).toBe('estado_desconhecido')
  })
})

describe('categoria', () => {
  it('Tipo fora do De→Para → bloqueante categoria_desconhecida', () => {
    const r = validarMatriz([rowMatriz({ Tipo: 'Impressora' })])
    expect(r.plano).toBeNull()
    expect(r.bloqueantes[0]!.tipo).toBe('categoria_desconhecida')
  })
})

describe('datas → dataEntrada + aviso', () => {
  it('ambas vazias → dataEntrada null + sem_data_entrada', () => {
    const r = validarMatriz([rowMatriz({ 'Data de Inclusão': '', 'Data de Entrega': '' })])
    expect(r.plano!.ativos[0]!.dataEntrada).toBeNull()
    expect(r.avisos.some((e) => e.tipo === 'sem_data_entrada')).toBe(true)
    expect(r.resumo.semData).toBe(1)
  })
  it('quebrada/futura → dataEntrada null + aviso', () => {
    const r = validarMatriz([rowMatriz({ 'Data de Inclusão': '#######', 'Data de Entrega': '01/01/2099' })])
    expect(r.plano!.ativos[0]!.dataEntrada).toBeNull()
    expect(r.avisos.some((e) => e.tipo === 'sem_data_entrada')).toBe(true)
  })
  it('mais antiga válida entre Inclusão e Entrega', () => {
    const r = validarMatriz([rowMatriz({ 'Data de Inclusão': '10/01/2025', 'Data de Entrega': '05/01/2025' })])
    expect(r.plano!.ativos[0]!.dataEntrada).toBe('2025-01-05')
    expect(r.avisos.some((e) => e.tipo === 'sem_data_entrada')).toBe(false)
  })
})

describe('linhas vazias / sem chave / cadastrais', () => {
  it('linha 100% vazia pulada; linha sem Site e sem patrimônio → aviso linha_sem_chave', () => {
    // 2ª linha só com Tipo/Service Tag preenchidos (sem Site, sem patrimônio)
    const r = validarMatriz([rowMatriz(), { Tipo: 'Notebook', 'Service Tag': 'SOLTA' }])
    expect(r.avisos.some((e) => e.tipo === 'linha_sem_chave')).toBe(true)
    expect(r.plano!.ativos).toHaveLength(1) // só a linha válida
  })
  it('Observação vazia → null; cadastrais vazios → null', () => {
    const r = validarMatriz([rowMatriz({ Observação: '', Marca: '', Modelo: '-' })])
    const a = r.plano!.ativos[0]!
    expect(a.observacoes).toBeNull()
    expect(a.marca).toBeNull()
    expect(a.modelo).toBeNull()
  })
})

describe('hash', () => {
  it('sha-256 estável (mesmo conteúdo → mesmo hash; conteúdo diferente → diferente)', () => {
    const csvA = buf(montar(H_MATRIZ, [rowMatriz({ Observação: 'a' })]))
    const csvB = buf(montar(H_MATRIZ, [rowMatriz({ Observação: 'b' })]))
    const h1 = validarCsvImport(csvA, MATRIZ, HOJE).plano!.arquivoHash
    const h2 = validarCsvImport(csvA, MATRIZ, HOJE).plano!.arquivoHash
    const h3 = validarCsvImport(csvB, MATRIZ, HOJE).plano!.arquivoHash
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    expect(h1).toBe(h2)
    expect(h1).not.toBe(h3)
  })
})
