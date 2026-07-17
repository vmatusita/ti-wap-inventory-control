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

  // F7E — só o NÃO-vazio-mas-não-canonicalizável segue bloqueante. O vazio
  // (`""`, `n/a`…) virou aviso `patrimonio_vazio` (ver bloco dedicado adiante).
  it('não-vazio não-canonicalizável (letras / só-números) → bloqueante patrimonio_invalido', () => {
    const r = validarMatriz([
      rowMatriz({ 'Patrimônio': 'ABC' }),
      rowMatriz({ 'Patrimônio': '12345' }),
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

// F7E — patrimônio vazio importa nulo (pendência), não bloqueia (OS §2.2/§2.4).
describe('F7E — patrimônio vazio → nulo + aviso patrimonio_vazio', () => {
  it('variantes de vazio importam com patrimônio NULO + aviso + resumo.semPatrimonio', () => {
    const r = validarMatriz([
      rowMatriz({ 'Patrimônio': '' }),
      rowMatriz({ 'Patrimônio': 'n/a', 'Service Tag': 'TAG-A' }),
      rowMatriz({ 'Patrimônio': 'SEM PATRIMONIO', 'Service Tag': 'TAG-B' }),
      rowMatriz({ 'Patrimônio': '-', 'Service Tag': 'TAG-C' }),
    ])
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano).not.toBeNull()
    expect(r.plano!.ativos.every((a) => a.patrimonio === null)).toBe(true)
    // patrimonioOriginal guarda o cru mesmo com patrimônio nulo
    expect(r.plano!.ativos.map((a) => a.patrimonioOriginal)).toEqual(['', 'n/a', 'SEM PATRIMONIO', '-'])
    expect(r.avisos.filter((e) => e.tipo === 'patrimonio_vazio')).toHaveLength(4)
    expect(r.resumo.semPatrimonio).toBe(4)
  })

  it('só-números (não-vazio) segue BLOQUEANTE patrimonio_invalido', () => {
    const r = validarMatriz([rowMatriz({ 'Patrimônio': '12345' })])
    expect(r.plano).toBeNull()
    expect(r.bloqueantes.filter((e) => e.tipo === 'patrimonio_invalido')).toHaveLength(1)
    expect(r.avisos.some((e) => e.tipo === 'patrimonio_vazio')).toBe(false)
  })

  it('candidatos inclui os sem-patrimônio-COM-tag (patrimonio null)', () => {
    const r = validarMatriz([
      rowMatriz(), // com patrimônio (linha 2)
      rowMatriz({ 'Patrimônio': 'n/a', 'Service Tag': 'ST-Y' }), // sem patrimônio (linha 3)
    ])
    expect(r.candidatos).toContainEqual({ linha: 3, patrimonio: null, serviceTag: 'ST-Y' })
  })
})

describe('F7E — dedupe dos sem-patrimônio (índice parcial de service tag)', () => {
  it('duas linhas SEM patrimônio com a MESMA tag (caixa diferente) → duplicata bloqueante', () => {
    const r = validarMatriz([
      rowMatriz({ 'Patrimônio': 'n/a', 'Service Tag': 'DUP' }),
      rowMatriz({ 'Patrimônio': '', 'Service Tag': 'dup' }), // uppercased colide → mesma chave ∅::DUP
    ])
    expect(r.plano).toBeNull()
    expect(r.bloqueantes.filter((e) => e.tipo === 'par_duplicado')).toHaveLength(2)
    expect(r.bloqueantes[0]!.coluna).toBe('Service Tag')
    expect(r.bloqueantes[0]!.mensagem).toContain('índice parcial')
  })

  it('duas linhas SEM patrimônio e SEM tag NÃO colidem (sem identidade, sem dedupe)', () => {
    const r = validarMatriz([
      rowMatriz({ 'Patrimônio': 'n/a' }),
      rowMatriz({ 'Patrimônio': 'SEM PATRIMONIO' }),
    ])
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos).toHaveLength(2)
    expect(r.resumo.semPatrimonio).toBe(2)
  })
})

describe('F7E — dataAjuste (ajuste de reconciliação) nas 3 quedas', () => {
  it('queda 1: entrega dd/MMM resolvida → dataAjuste = entrega; dataEntrada = inclusão (mais antiga)', () => {
    const r = validarMatriz([rowMatriz({ 'Data de Inclusão': '18/12/2024', 'Data de Entrega': '21/jan' })])
    const a = r.plano!.ativos[0]!
    expect(a.dataEntrada).toBe('2024-12-18') // mais antiga válida
    expect(a.dataAjuste).toBe('2025-01-21') // entrega resolvida (+1 na virada)
  })

  it('queda 2: sem entrega, inclusão válida → dataAjuste = dataEntrada (inclusão)', () => {
    const r = validarMatriz([rowMatriz({ 'Data de Inclusão': '10/03/2025', 'Data de Entrega': '' })])
    const a = r.plano!.ativos[0]!
    expect(a.dataEntrada).toBe('2025-03-10')
    expect(a.dataAjuste).toBe('2025-03-10')
  })

  it('queda 3: nenhuma data → dataAjuste null + aviso sem_data_entrada', () => {
    const r = validarMatriz([rowMatriz({ 'Data de Inclusão': '', 'Data de Entrega': '' })])
    const a = r.plano!.ativos[0]!
    expect(a.dataEntrada).toBeNull()
    expect(a.dataAjuste).toBeNull()
    expect(r.avisos.some((e) => e.tipo === 'sem_data_entrada')).toBe(true)
  })

  it('entrega dd/MMM SEM inclusão (sem âncora de ano) → cai no aviso sem_data_entrada', () => {
    const r = validarMatriz([rowMatriz({ 'Data de Inclusão': '', 'Data de Entrega': '18/nov' })])
    const a = r.plano!.ativos[0]!
    expect(a.dataEntrada).toBeNull()
    expect(a.dataAjuste).toBeNull()
    expect(r.avisos.some((e) => e.tipo === 'sem_data_entrada')).toBe(true)
  })

  it('entrega dd/MM/aaaa mais antiga que a inclusão participa da dataEntrada (retrocompat) e é o ajuste', () => {
    const r = validarMatriz([rowMatriz({ 'Data de Inclusão': '10/01/2025', 'Data de Entrega': '05/01/2025' })])
    const a = r.plano!.ativos[0]!
    expect(a.dataEntrada).toBe('2025-01-05') // mais antiga
    expect(a.dataAjuste).toBe('2025-01-05') // entrega válida vira o ajuste
  })
})

describe('F7E/F7C — sem patrimônio com tag existente em OUTRA filial', () => {
  const SEM = String.fromCodePoint(0x2205) // ∅ — sentinela do espaço de chave

  it('nulo-com-tag existente noutra filial → patrimonio_em_outra_filial (mensagem pela tag)', () => {
    const r = validarCsvImport(
      buf(montar(H_MATRIZ, [rowMatriz({ 'Patrimônio': 'n/a', 'Service Tag': 'ST-X' })])),
      MATRIZ,
      HOJE,
      [],
      new Map([[`${SEM}::ST-X`, 'Linhares']]),
    )
    expect(r.plano).toBeNull()
    const bloq = r.bloqueantes.find((e) => e.tipo === 'patrimonio_em_outra_filial')
    expect(bloq).toBeDefined()
    expect(bloq!.mensagem).toContain('Linhares')
    expect(bloq!.mensagem).toContain('ST-X')
  })

  it('nulo-SEM-tag não é detectável (aceito): mapa realista só tem chaves de tags reais', () => {
    // A action monta o mapa consultando por service_tag NÃO-vazias, então nunca
    // produz a chave `∅::` — a única com que um candidato nulo-sem-tag casaria.
    const r = validarCsvImport(
      buf(montar(H_MATRIZ, [rowMatriz({ 'Patrimônio': 'n/a' })])),
      MATRIZ,
      HOJE,
      [],
      new Map([[`${SEM}::ST-OUTRA`, 'Linhares']]),
    )
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos).toHaveLength(1)
    expect(r.candidatos).toContainEqual({ linha: 2, patrimonio: null, serviceTag: null })
  })
})

// F7F — patrimônio ausente + hostname com patrimônio embutido → auto-preenche no
// preview (decisão do Johnny, 17/07/2026; REVOGA a não-inferência por hostname de 16/07).
describe('F7F — auto-preenchimento do patrimônio pelo hostname', () => {
  it('(a) vazio/n/a/SEM PATRIMONIO + hostname NB-WAP0001234 → auto-preenche + aviso, sem patrimonio_vazio', () => {
    for (const vazio of ['', 'n/a', 'SEM PATRIMONIO']) {
      const r = validarMatriz([rowMatriz({ 'Patrimônio': vazio, Hostname: 'NB-WAP0001234' })])
      expect(r.bloqueantes).toHaveLength(0)
      const a = r.plano!.ativos[0]!
      expect(a.patrimonio).toBe('WAP0001234')
      expect(a.patrimonioOriginal).toBe(vazio) // guarda o cru mesmo auto-preenchido
      expect(r.avisos.filter((e) => e.tipo === 'patrimonio_do_hostname')).toHaveLength(1)
      expect(r.avisos.some((e) => e.tipo === 'patrimonio_vazio')).toBe(false)
      expect(r.resumo.patrimonioDoHostname).toBe(1)
      expect(r.resumo.semPatrimonio).toBe(0)
      const aviso = r.avisos.find((e) => e.tipo === 'patrimonio_do_hostname')!
      expect(aviso.mensagem).toContain('WAP0001234') // mensagem informativa cita o canônico
    }
  })

  it('(b) vazio SEM hostname aproveitável (DESKTOP-SALA) → nulo + patrimonio_vazio (F7E intacto)', () => {
    const r = validarMatriz([rowMatriz({ 'Patrimônio': '', Hostname: 'DESKTOP-SALA' })])
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos[0]!.patrimonio).toBeNull()
    expect(r.avisos.filter((e) => e.tipo === 'patrimonio_vazio')).toHaveLength(1)
    expect(r.avisos.some((e) => e.tipo === 'patrimonio_do_hostname')).toBe(false)
    expect(r.resumo.semPatrimonio).toBe(1)
    expect(r.resumo.patrimonioDoHostname).toBe(0)
  })

  it('(c) duas linhas vazias cujo hostname canoniza para o MESMO patrimônio → duplicata bloqueante', () => {
    const r = validarMatriz([
      rowMatriz({ 'Patrimônio': '', Hostname: 'NB-WAP0001234' }),
      rowMatriz({ 'Patrimônio': 'n/a', Hostname: 'DESKTOP-WAP0001234' }),
    ])
    // a dedupe usou o valor preenchido; ambas sem service tag colidem no índice único
    expect(r.plano).toBeNull()
    expect(r.bloqueantes.filter((e) => e.tipo === 'patrimonio_duplicado_sem_service_tag')).toHaveLength(2)
  })

  it('(d) patrimônio COM valor só-números (12345) + hostname válido → patrimonio_invalido, NÃO sobrescreve', () => {
    const r = validarMatriz([rowMatriz({ 'Patrimônio': '12345', Hostname: 'NB-WAP0009999' })])
    expect(r.plano).toBeNull()
    expect(r.bloqueantes.filter((e) => e.tipo === 'patrimonio_invalido')).toHaveLength(1)
    expect(r.avisos.some((e) => e.tipo === 'patrimonio_do_hostname')).toBe(false)
  })

  it('(e) hostname com número que NÃO canoniza (PC-01) + patrimônio vazio → F7E (nulo + patrimonio_vazio)', () => {
    const r = validarMatriz([rowMatriz({ 'Patrimônio': '', Hostname: 'PC-01' })])
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos[0]!.patrimonio).toBeNull()
    expect(r.avisos.filter((e) => e.tipo === 'patrimonio_vazio')).toHaveLength(1)
    expect(r.avisos.some((e) => e.tipo === 'patrimonio_do_hostname')).toBe(false)
    expect(r.resumo.patrimonioDoHostname).toBe(0)
  })

  it('(f) aviso patrimonio_do_hostname fica FORA do agrupamento (nenhum card), mas segue em avisos', () => {
    const r = validarMatriz([rowMatriz({ 'Patrimônio': '', Hostname: 'NB-WAP0001234' })])
    expect(r.avisos.some((e) => e.tipo === 'patrimonio_do_hostname')).toBe(true)
    expect(r.grupos.some((g) => g.tipo === 'patrimonio_do_hostname')).toBe(false)
  })

  it('(g) INJEÇÃO: hostname com payload em volta do token → auto-preenche só o canônico limpo', () => {
    // patrimônio vazio + hostname com token canônico embutido em meio a lixo de
    // fórmula/SQL/shell → o motor grava SÓ o token canônico, nunca o payload.
    const r = validarMatriz([rowMatriz({ 'Patrimônio': '', Hostname: '=WAP0001234; rm -rf /' })])
    expect(r.bloqueantes).toHaveLength(0)
    const a = r.plano!.ativos[0]!
    expect(a.patrimonio).toBe('WAP0001234')
    expect(a.patrimonio).toMatch(/^[A-Z]{2,4}\d{7}$/) // nunca um payload
    expect(r.avisos.filter((e) => e.tipo === 'patrimonio_do_hostname')).toHaveLength(1)
  })

  it('(h) INJEÇÃO: hostname sem token canônico (só payload) → nulo + patrimonio_vazio', () => {
    const r = validarMatriz([rowMatriz({ 'Patrimônio': '', Hostname: '=cmd()|nada' })])
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos[0]!.patrimonio).toBeNull()
    expect(r.avisos.filter((e) => e.tipo === 'patrimonio_vazio')).toHaveLength(1)
    expect(r.avisos.some((e) => e.tipo === 'patrimonio_do_hostname')).toBe(false)
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
