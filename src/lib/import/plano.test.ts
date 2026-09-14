import { describe, expect, it } from 'vitest'
import { csvCorrigidoDeArquivo, validarCsvImport } from './plano'
import { ErroArquivoImport, LIMITES_CAMPO_PLANO, MAX_COLUNAS_PLANILHA, MAX_LINHAS_PLANILHA } from './limites'
import type { FilialSelecionada } from './tipos'
import type { VocabularioImport } from './vocabulario'

// ===========================================================================
// Helpers — CSVs 100% FICTÍCIOS (padrão WAP0001234 / "Fulano"/"Ciclano").
//
// F56 · Frente D (segunda metade) — o vocabulário deixou de ser hardcoded em
// `deparas.ts`; o motor recebe `VocabularioImport` por parâmetro. A fixture
// abaixo espelha byte a byte o vocabulário que estava hardcoded até aqui (os
// mesmos 18 termos históricos, 5 categorias, 17 estados, 7 prefixos) — a
// regressão de que o SEED real bate com isto mora em `vocabulario.test.ts`
// (fixture DERIVADA do SQL); aqui o que importa é o COMPORTAMENTO do motor
// dado um vocabulário, não a fidelidade ao seed.

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
const LINHARES: FilialSelecionada = { id: 3, slug: 'linhares', nome: 'Linhares' }

const VOCAB: VocabularioImport = {
  filiais: [
    { id: MATRIZ.id, nome: MATRIZ.nome, ativa: true },
    { id: CD.id, nome: CD.nome, ativa: true },
    { id: LINHARES.id, nome: LINHARES.nome, ativa: true },
    { id: EUSEBIO.id, nome: EUSEBIO.nome, ativa: true },
    { id: SERRA.id, nome: SERRA.nome, ativa: true },
  ],
  apelidos: [
    { filialId: CD.id, apelido: 'CD-AFP' },
    { filialId: CD.id, apelido: 'CD-PENA' },
    { filialId: CD.id, apelido: 'CD Pena' },
    { filialId: CD.id, apelido: 'Afonso Pena' },
    { filialId: EUSEBIO.id, apelido: 'Filial-CE' },
    { filialId: SERRA.id, apelido: 'Serra Park' },
    { filialId: LINHARES.id, apelido: 'Filial - Linhares' },
  ],
  categorias: [
    { termo: 'notebook', categoria: 'notebook', rotulo: 'Notebook' },
    { termo: 'desktop', categoria: 'desktop', rotulo: 'Desktop' },
    { termo: 'monitor', categoria: 'monitor', rotulo: 'Monitor' },
    { termo: 'celular', categoria: 'celular', rotulo: 'Celular' },
    { termo: 'tablet', categoria: 'tablet', rotulo: 'Tablet' },
  ],
  estados: [
    { termo: 'saida', estado: 'em_uso', rotulo: 'Saída' },
    { termo: 'remanejo', estado: 'em_uso', rotulo: null },
    { termo: 'estoque', estado: 'em_estoque', rotulo: 'Estoque' },
    { termo: 'reservado', estado: 'reservado', rotulo: 'Reservado' },
    { termo: 'emprestimo', estado: 'emprestado', rotulo: 'Empréstimo' },
    { termo: 'validar', estado: 'em_triagem', rotulo: 'Validar' },
    { termo: 'manutencao', estado: 'em_manutencao', rotulo: 'Manutenção' },
    { termo: 'defasado', estado: 'defasado', rotulo: 'Defasado' },
    { termo: 'descarte', estado: 'descartado', rotulo: null },
    { termo: 'descartado', estado: 'descartado', rotulo: null },
  ],
  prefixosPatrimonio: ['WAP', 'PRO', 'LEA', 'TEC', 'STF', 'PAT', 'NOO'],
}

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
  return validarCsvImport(buf(montar(H_MATRIZ, linhas)), filial, VOCAB, HOJE)
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
    expect(r.resumo.layout).toBe('colunas18')
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
      VOCAB,
      HOJE,
    )
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.resumo.layout).toBe('colunas16')
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
      VOCAB,
      HOJE,
    )
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.resumo.layout).toBe('colunas20')
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
    const r = validarCsvImport(buf(montar(header, [])), MATRIZ, VOCAB, HOJE)
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
    const r = validarCsvImport(Buffer.from(texto, 'latin1'), EUSEBIO, VOCAB, HOJE)
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos[0]!.observacoes).toBe('Configuração ç ã')
  })
  it('UTF-8 com BOM', () => {
    const texto = montar(H_MATRIZ, [rowMatriz({ Observação: 'com BOM' })])
    const comBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(texto, 'utf8')])
    const r = validarCsvImport(comBom, MATRIZ, VOCAB, HOJE)
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

describe('filial fora do vocabulário (F56 — Frente A)', () => {
  // Uma filial que o vocabulário de unidades não conhece (a "Filial de Teste" de
  // produção, ou qualquer filial nova) não tem como ser conferida pela coluna Site.
  // Antes, TODA linha virava `site_divergente` com uma mensagem que culpava o ARQUIVO.
  // O defeito é de CADASTRO: o motor emite UM bloqueante, com a mensagem verdadeira.
  const INVENTADA: FilialSelecionada = { id: 99, slug: 'filial-inventada', nome: 'Filial Inventada' }

  it('emite UM bloqueante filial_fora_do_vocabulario e nenhum site_divergente', () => {
    const r = validarMatriz(
      [
        rowMatriz({ Site: 'Filial Inventada', 'Patrimônio': 'WAP0001234' }),
        rowMatriz({ Site: 'Filial Inventada', 'Patrimônio': 'WAP0001235' }),
        rowMatriz({ Site: 'Qualquer coisa', 'Patrimônio': 'WAP0001236' }),
      ],
      INVENTADA,
    )
    expect(r.plano).toBeNull()
    expect(r.bloqueantes.filter((e) => e.tipo === 'filial_fora_do_vocabulario')).toHaveLength(1)
    expect(r.bloqueantes.some((e) => e.tipo === 'site_divergente')).toBe(false)
  })

  it('a mensagem aponta o cadastro, não o arquivo', () => {
    const r = validarMatriz([rowMatriz({ Site: 'Filial Inventada' })], INVENTADA)
    const erro = r.bloqueantes.find((e) => e.tipo === 'filial_fora_do_vocabulario')!
    expect(erro.mensagem).toContain('Filial Inventada')
    expect(erro.mensagem).toContain('vocabulário')
    expect(erro.mensagem).toContain('não está no arquivo')
  })

  it('o card é informativo (kind nenhuma), um só', () => {
    const r = validarMatriz(
      [rowMatriz({ Site: 'Filial Inventada' }), rowMatriz({ Site: 'Filial Inventada', 'Patrimônio': 'WAP0001299' })],
      INVENTADA,
    )
    const grupos = r.grupos.filter((g) => g.tipo === 'filial_fora_do_vocabulario')
    expect(grupos).toHaveLength(1)
    expect(grupos[0]!.correcao.kind).toBe('nenhuma')
    expect(r.grupos.some((g) => g.tipo === 'site_divergente')).toBe(false)
  })

  it('os outros erros da linha continuam aparecendo (o preview segue útil)', () => {
    const r = validarMatriz([rowMatriz({ Site: 'Filial Inventada', Tipo: 'Impressora' })], INVENTADA)
    expect(r.bloqueantes.some((e) => e.tipo === 'categoria_desconhecida')).toBe(true)
  })
})

// F56 · Frente D (segunda metade) — o GATILHO FINAL: depois que o vocabulário virou
// dado, a condição deixa de ser "slug/nome não bate com as 5 filiais hardcoded" e
// passa a ser "o filial_id selecionado não está no vocabulário como filial ATIVA".
describe('filial fora do vocabulário — o gatilho final (F56 · Frente D)', () => {
  it('filial PRESENTE no vocabulário mas INATIVA continua disparando', () => {
    const vocabComEusebioInativo: VocabularioImport = {
      ...VOCAB,
      filiais: VOCAB.filiais.map((f) => (f.id === EUSEBIO.id ? { ...f, ativa: false } : f)),
    }
    const r = validarCsvImport(
      buf(montar(H_MATRIZ, [rowMatriz({ Site: 'Eusébio' })])),
      EUSEBIO,
      vocabComEusebioInativo,
      HOJE,
    )
    expect(r.plano).toBeNull()
    expect(r.bloqueantes.filter((e) => e.tipo === 'filial_fora_do_vocabulario')).toHaveLength(1)
    expect(r.bloqueantes.some((e) => e.tipo === 'site_divergente')).toBe(false)
  })

  it('filial ATIVA só com o nome próprio (sem nenhum apelido) NÃO dispara, e a linha com Site = o nome passa', () => {
    const semApelidos: VocabularioImport = { ...VOCAB, apelidos: [] }
    const r = validarCsvImport(
      buf(montar(H_MATRIZ, [rowMatriz({ Site: 'Matriz' })])),
      MATRIZ,
      semApelidos,
      HOJE,
    )
    expect(r.bloqueantes.some((e) => e.tipo === 'filial_fora_do_vocabulario')).toBe(false)
    expect(r.plano).not.toBeNull()
    expect(r.plano!.ativos).toHaveLength(1)
  })

  it('depois de um RENAME no vocabulário, o nome NOVO vale e o VELHO não', () => {
    const renomeada: VocabularioImport = {
      ...VOCAB,
      filiais: VOCAB.filiais.map((f) => (f.id === MATRIZ.id ? { ...f, nome: 'Sede Matriz' } : f)),
    }
    const comNomeNovo = validarCsvImport(
      buf(montar(H_MATRIZ, [rowMatriz({ Site: 'Sede Matriz' })])),
      MATRIZ,
      renomeada,
      HOJE,
    )
    expect(comNomeNovo.bloqueantes.some((e) => e.tipo === 'filial_fora_do_vocabulario')).toBe(false)
    expect(comNomeNovo.plano).not.toBeNull()

    const comNomeVelho = validarCsvImport(
      buf(montar(H_MATRIZ, [rowMatriz({ Site: 'Matriz' })])),
      MATRIZ,
      renomeada,
      HOJE,
    )
    // a filial SELECIONADA continua válida (id existe, ativa) — o gatilho final não
    // dispara —, mas a linha com o nome VELHO não bate mais com o filial_id: vira
    // site_divergente, exatamente como um typo bateria.
    expect(comNomeVelho.bloqueantes.some((e) => e.tipo === 'filial_fora_do_vocabulario')).toBe(false)
    expect(comNomeVelho.bloqueantes.some((e) => e.tipo === 'site_divergente')).toBe(true)
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
    // F7-pós: marcador de ausência NÃO fica no patrimonioOriginal (vazio → RPC nula →
    // ficha mostra "—"). Só valor com conteúdo real (fora de formato) é preservado.
    expect(r.plano!.ativos.map((a) => a.patrimonioOriginal)).toEqual(['', '', '', ''])
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

describe('F15 — service tag vazia importa (aviso, não bloqueia) e conta em resumo.semServiceTag', () => {
  it('importa sem service tag e conta as linhas em resumo.semServiceTag', () => {
    const r = validarMatriz([
      rowMatriz({ 'Patrimônio': 'WAP0001111', 'Service Tag': 'ST-A' }), // com tag
      rowMatriz({ 'Patrimônio': 'WAP0002222' }), // sem tag
      rowMatriz({ 'Patrimônio': 'WAP0003333', 'Service Tag': '  ' }), // só espaços → vazia
    ])
    expect(r.bloqueantes).toHaveLength(0) // ST vazia NUNCA bloqueia (só o cadastro manual exige)
    expect(r.plano!.ativos).toHaveLength(3)
    expect(r.resumo.semServiceTag).toBe(2)
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

  // F24 — o ativo SEM patrimônio também abre conflito, e pela service tag: ela é a
  // identidade quando não há plaqueta (índice parcial da 0091). Antes isto bloqueava o
  // import inteiro; agora a linha entra e o par vira pendência.
  it('nulo-com-tag existente noutra filial → AVISO de conflito (mensagem pela tag)', () => {
    const r = validarCsvImport(
      buf(montar(H_MATRIZ, [rowMatriz({ 'Patrimônio': 'n/a', 'Service Tag': 'ST-X' })])),
      MATRIZ,
      VOCAB,
      HOJE,
      [],
      new Map([[`${SEM}::ST-X`, 'Linhares']]),
    )
    expect(r.plano).not.toBeNull()
    expect(r.plano!.ativos).toHaveLength(1)
    expect(r.resumo.conflitos).toBe(1)
    expect(r.bloqueantes.find((e) => e.tipo === 'patrimonio_em_outra_filial')).toBeUndefined()
    const aviso = r.avisos.find((e) => e.tipo === 'patrimonio_em_outra_filial')
    expect(aviso).toBeDefined()
    expect(aviso!.mensagem).toContain('Linhares')
    expect(aviso!.mensagem).toContain('ST-X')
  })

  it('nulo-SEM-tag não é detectável (aceito): mapa realista só tem chaves de tags reais', () => {
    // A action monta o mapa consultando por service_tag NÃO-vazias, então nunca
    // produz a chave `∅::` — a única com que um candidato nulo-sem-tag casaria.
    const r = validarCsvImport(
      buf(montar(H_MATRIZ, [rowMatriz({ 'Patrimônio': 'n/a' })])),
      MATRIZ,
      VOCAB,
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
      expect(a.patrimonioOriginal).toBe('') // F7-pós: marcador de ausência não é preservado
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

  it('(d) F7-pós: patrimônio FORA DE FORMATO + hostname válido → substitui pelo hostname (REVOGA a invariante F7F)', () => {
    const r = validarMatriz([rowMatriz({ 'Patrimônio': '12345', Hostname: 'NB-WAP0009999' })])
    expect(r.bloqueantes).toHaveLength(0)
    const a = r.plano!.ativos[0]!
    expect(a.patrimonio).toBe('WAP0009999') // veio do hostname
    expect(a.patrimonioOriginal).toBe('12345') // o cru fica auditável
    expect(r.avisos.filter((e) => e.tipo === 'patrimonio_do_hostname')).toHaveLength(1)
    expect(r.avisos.some((e) => e.tipo === 'patrimonio_invalido')).toBe(false)
    // lixo não-numérico fora de formato também é substituído
    const r2 = validarMatriz([rowMatriz({ 'Patrimônio': 'ABC', Hostname: 'DESKTOP-WAP0004491' })])
    expect(r2.plano!.ativos[0]!.patrimonio).toBe('WAP0004491')
    expect(r2.plano!.ativos[0]!.patrimonioOriginal).toBe('ABC')
  })

  it('(d2) F7-pós: patrimônio FORA DE FORMATO SEM hostname aproveitável → segue BLOQUEANTE (decisão 5)', () => {
    const r = validarMatriz([rowMatriz({ 'Patrimônio': '12345', Hostname: 'DESKTOP-SALA' })])
    expect(r.plano).toBeNull()
    expect(r.bloqueantes.filter((e) => e.tipo === 'patrimonio_invalido')).toHaveLength(1)
    expect(r.avisos.some((e) => e.tipo === 'patrimonio_do_hostname')).toBe(false)
    const r2 = validarMatriz([rowMatriz({ 'Patrimônio': 'ABC', Hostname: '' })])
    expect(r2.plano).toBeNull()
    expect(r2.bloqueantes.filter((e) => e.tipo === 'patrimonio_invalido')).toHaveLength(1)
  })

  it('(d3) patrimônio VÁLIDO na célula vence o hostname (nunca é sobrescrito)', () => {
    const r = validarMatriz([rowMatriz({ 'Patrimônio': 'WAP0001111', Hostname: 'NB-WAP0009999' })])
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos[0]!.patrimonio).toBe('WAP0001111') // a célula vence o hostname
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

// F7-pós (Johnny 20/07/2026) — FORÇAR patrimônio fora do padrão (op forcar_patrimonio) e
// LIMPAR patrimônio (editar → vazio). A linha de dados é a linha 2 (linha 1 = cabeçalho).
describe('F7-pós — forçar patrimônio fora do padrão e limpar', () => {
  const csv = (over: Record<string, string>) => buf(montar(H_MATRIZ, [rowMatriz(over)]))

  it('sem forçar: valor fora de formato (LEA7LYHQH4) → bloqueante patrimonio_invalido', () => {
    const r = validarCsvImport(csv({ 'Patrimônio': 'LEA7LYHQH4', Hostname: 'DESKTOP-SALA' }), MATRIZ, VOCAB, HOJE)
    expect(r.plano).toBeNull()
    expect(r.bloqueantes.filter((e) => e.tipo === 'patrimonio_invalido')).toHaveLength(1)
  })

  it('forçando (forcar_patrimonio) → aceita o cru como patrimônio, sem bloquear', () => {
    const r = validarCsvImport(
      csv({ 'Patrimônio': 'LEA7LYHQH4', Hostname: 'DESKTOP-SALA' }),
      MATRIZ,
      VOCAB,
      HOJE,
      [{ op: 'forcar_patrimonio', linha: 2 }],
    )
    expect(r.bloqueantes).toHaveLength(0)
    const a = r.plano!.ativos[0]!
    expect(a.patrimonio).toBe('LEA7LYHQH4') // cru, fora do padrão
    expect(a.patrimonioOriginal).toBe('LEA7LYHQH4')
    expect(r.avisos.some((e) => e.tipo === 'patrimonio_invalido')).toBe(false)
  })

  it('forçar VENCE o hostname (o operador escolheu o valor cru)', () => {
    const r = validarCsvImport(
      csv({ 'Patrimônio': 'STF003LOC', Hostname: 'NB-WAP0001234' }),
      MATRIZ,
      VOCAB,
      HOJE,
      [{ op: 'forcar_patrimonio', linha: 2 }],
    )
    expect(r.plano!.ativos[0]!.patrimonio).toBe('STF003LOC') // não o WAP0001234 do hostname
  })

  it('forçar em cima de valor de AUSÊNCIA (n/a) não inventa patrimônio → segue pendência', () => {
    const r = validarCsvImport(
      csv({ 'Patrimônio': 'n/a', Hostname: 'DESKTOP-SALA' }),
      MATRIZ,
      VOCAB,
      HOJE,
      [{ op: 'forcar_patrimonio', linha: 2 }],
    )
    expect(r.plano!.ativos[0]!.patrimonio).toBeNull()
    expect(r.avisos.some((e) => e.tipo === 'patrimonio_vazio')).toBe(true)
  })

  it('limpar patrimônio (editar → vazio) num inválido → pendência (sem bloqueante)', () => {
    const r = validarCsvImport(
      csv({ 'Patrimônio': 'LEA7LYHQH4', Hostname: 'DESKTOP-SALA' }),
      MATRIZ,
      VOCAB,
      HOJE,
      [{ op: 'editar', linha: 2, campo: 'patrimonio', para: '' }],
    )
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos[0]!.patrimonio).toBeNull()
    expect(r.avisos.some((e) => e.tipo === 'patrimonio_vazio')).toBe(true)
  })

  it('forçar valor LONGO demais (>60 chars) → bloqueante no preview (espelha a sanidade da RPC)', () => {
    const longo = 'X'.repeat(61)
    const r = validarCsvImport(csv({ 'Patrimônio': longo, Hostname: 'DESKTOP-SALA' }), MATRIZ, VOCAB, HOJE, [
      { op: 'forcar_patrimonio', linha: 2 },
    ])
    expect(r.plano).toBeNull() // não passa pro apply (a RPC também recusaria)
    expect(r.bloqueantes.filter((e) => e.tipo === 'patrimonio_invalido')).toHaveLength(1)
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
    const h1 = validarCsvImport(csvA, MATRIZ, VOCAB, HOJE).plano!.arquivoHash
    const h2 = validarCsvImport(csvA, MATRIZ, VOCAB, HOJE).plano!.arquivoHash
    const h3 = validarCsvImport(csvB, MATRIZ, VOCAB, HOJE).plano!.arquivoHash
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    expect(h1).toBe(h2)
    expect(h1).not.toBe(h3)
  })
})

// F7K (Johnny 20/07/2026) — modelo que repete a marca é auto-corrigido no import.
describe('F7K — modelo sem marca duplicada', () => {
  it('marca "HP" + modelo "HP Pro SFF 280 G9" → plano guarda modelo "Pro SFF 280 G9"', () => {
    const r = validarMatriz([rowMatriz({ Marca: 'HP', Modelo: 'HP Pro SFF 280 G9' })])
    expect(r.bloqueantes).toHaveLength(0)
    const a = r.plano!.ativos[0]!
    expect(a.marca).toBe('HP')
    expect(a.modelo).toBe('Pro SFF 280 G9') // sem o "HP" repetido → rótulo "HP Pro SFF 280 G9"
  })
  it('modelo que não repete a marca é preservado', () => {
    const r = validarMatriz([rowMatriz({ Marca: 'Dell', Modelo: 'Latitude 5490' })])
    expect(r.plano!.ativos[0]!.modelo).toBe('Latitude 5490')
  })
})

// ===========================================================================
// F56 · Frente C — conferirTetos no CSV (Decisão 6, critério 10). Antes desta
// fase o CSV não tinha teto de linha/coluna/conteúdo nenhum — só o `.xlsx`.

describe('F56 · Frente C — conferirTetos no CSV', () => {
  it('recusa CSV com mais linhas de dados que o teto, com a mensagem do leitor', () => {
    const linhas = Array.from({ length: MAX_LINHAS_PLANILHA + 1 }, (_, i) =>
      rowMatriz({ 'Patrimônio': `WAP${String(i + 1).padStart(7, '0')}` }),
    )
    expect(() => validarMatriz(linhas)).toThrow(ErroArquivoImport)
    expect(() => validarMatriz(linhas)).toThrow(`${(MAX_LINHAS_PLANILHA + 1).toLocaleString('pt-BR')} linhas`)
    expect(() => validarMatriz(linhas)).toThrow(`${MAX_LINHAS_PLANILHA.toLocaleString('pt-BR')}`)
  })

  it('aceita CSV EXATAMENTE no teto de linhas (não é off-by-one)', () => {
    const linhas = Array.from({ length: MAX_LINHAS_PLANILHA }, (_, i) =>
      rowMatriz({ 'Patrimônio': `WAP${String(i + 1).padStart(7, '0')}` }),
    )
    expect(() => validarMatriz(linhas)).not.toThrow()
  })

  it('recusa CSV com mais colunas que o teto', () => {
    const header = Array.from({ length: MAX_COLUNAS_PLANILHA + 1 }, (_, i) => `Col${i + 1}`).join(';')
    const texto = [header, Array.from({ length: MAX_COLUNAS_PLANILHA + 1 }, () => 'x').join(';')].join('\n')
    expect(() => validarCsvImport(buf(texto), MATRIZ, VOCAB, HOJE)).toThrow(ErroArquivoImport)
    expect(() => validarCsvImport(buf(texto), MATRIZ, VOCAB, HOJE)).toThrow(`${MAX_COLUNAS_PLANILHA + 1} colunas`)
  })

  it('recusa quando o conteúdo total das células passa do teto de bytes', () => {
    // Uma célula ENORME sozinha já estoura MAX_BYTES_CONTEUDO (768 KiB) — o
    // teto de CONTEÚDO roda ANTES de qualquer `.max()` por campo (que só vale
    // depois que a linha vira candidato a `AtivoPlano`).
    const linhas = [rowMatriz({ Observação: 'a'.repeat(800_000) })]
    expect(() => validarMatriz(linhas)).toThrow(ErroArquivoImport)
    expect(() => validarMatriz(linhas)).toThrow(/conteúdo/i)
  })
})

// ===========================================================================
// F56 · Frente C — linha_desalinhada (Decisão 8). Célula a mais/a menos que a
// largura útil do cabeçalho é estrutura, não conteúdo — recusa, não corrige.

describe('F56 · Frente C — linha_desalinhada', () => {
  it('célula A MAIS (com valor) além da largura útil → bloqueante na linha certa', () => {
    const linhaComSobra = linhaDe(H_MATRIZ.split(';'), rowMatriz()) + ';VALOR SOBRANDO'
    const texto = [H_MATRIZ, linhaComSobra].join('\n')
    const r = validarCsvImport(buf(texto), MATRIZ, VOCAB, HOJE)
    expect(r.plano).toBeNull()
    expect(r.bloqueantes).toEqual([
      expect.objectContaining({ linha: 2, tipo: 'linha_desalinhada' }),
    ])
  })

  it('célula A MENOS que a largura útil → bloqueante (mensagem com a linha e a contagem)', () => {
    const colunas = H_MATRIZ.split(';').length
    const linhaCurta = Array.from({ length: colunas - 1 }, () => 'x').join(';') // falta 1 célula
    const texto = [H_MATRIZ, linhaCurta].join('\n')
    const r = validarCsvImport(buf(texto), MATRIZ, VOCAB, HOJE)
    expect(r.plano).toBeNull()
    const erro = r.bloqueantes.find((e) => e.tipo === 'linha_desalinhada')
    expect(erro).toBeDefined()
    expect(erro!.linha).toBe(2)
    expect(erro!.mensagem).toContain(`${colunas - 1} células`)
    expect(erro!.mensagem).toContain(`${colunas} colunas`)
  })

  it('colunas vazias à direita, linha em branco, `;` dentro de aspas, CRLF e `\\n` final continuam passando', () => {
    const linhaValida = linhaDe(
      H_MATRIZ.split(';'),
      rowMatriz({ 'Patrimônio': 'WAP0001111', Observação: '"nota; com ponto e vírgula"' }),
    )
    const linhaComColunasVaziasADireita =
      linhaDe(H_MATRIZ.split(';'), rowMatriz({ 'Patrimônio': 'WAP0002222' })) + ';;;' // só separador, sem valor
    const linhaEmBranco = Array.from({ length: H_MATRIZ.split(';').length }, () => '').join(';')
    const texto =
      [H_MATRIZ, linhaValida, linhaComColunasVaziasADireita, linhaEmBranco].join('\r\n') + '\r\n' // CRLF + \n final
    const comBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buf(texto)])
    const r = validarCsvImport(comBom, MATRIZ, VOCAB, HOJE)
    expect(r.bloqueantes.filter((e) => e.tipo === 'linha_desalinhada')).toEqual([])
    expect(r.plano).not.toBeNull()
    expect(r.plano!.ativos).toHaveLength(2) // as 2 linhas com Site/Patrimônio; a em branco é pulada
  })
})

// ===========================================================================
// F56 · revisão adversarial final (achado médio) — o "Baixar corrigido" passa pelas
// MESMAS travas estruturais de `analisar()`. Antes, `csvCorrigidoDeArquivo` lia e
// reserializava o arquivo sem teto nenhum e sem recusar linha desalinhada.

describe('F56 · revisão final — csvCorrigidoDeArquivo passa pelas travas da Frente C', () => {
  it('recusa arquivo acima do teto de linhas, com a mesma mensagem do leitor', async () => {
    const linhas = Array.from({ length: MAX_LINHAS_PLANILHA + 1 }, (_, i) =>
      rowMatriz({ 'Patrimônio': `WAP${String(i + 1).padStart(7, '0')}` }),
    )
    const conteudo = buf(montar(H_MATRIZ, linhas))
    await expect(csvCorrigidoDeArquivo(conteudo, [], VOCAB, MATRIZ.nome)).rejects.toThrow(ErroArquivoImport)
    await expect(csvCorrigidoDeArquivo(conteudo, [], VOCAB, MATRIZ.nome)).rejects.toThrow(
      `${(MAX_LINHAS_PLANILHA + 1).toLocaleString('pt-BR')} linhas`,
    )
  })

  it('recusa linha desalinhada em vez de devolvê-la com o valor na coluna errada', async () => {
    const linhaComSobra = linhaDe(H_MATRIZ.split(';'), rowMatriz()) + ';VALOR SOBRANDO'
    const conteudo = buf([H_MATRIZ, linhaComSobra].join('\n'))
    await expect(csvCorrigidoDeArquivo(conteudo, [], VOCAB, MATRIZ.nome)).rejects.toThrow(ErroArquivoImport)
    await expect(csvCorrigidoDeArquivo(conteudo, [], VOCAB, MATRIZ.nome)).rejects.toThrow(
      /linha desalinhada.*linha 2/,
    )
  })

  it('arquivo legítimo (colunas vazias à direita, linha em branco, `\\n` final) continua saindo', async () => {
    const colunas = H_MATRIZ.split(';')
    const linhaComColunasVaziasADireita = linhaDe(colunas, rowMatriz({ 'Patrimônio': 'WAP0002222' })) + ';;;'
    const linhaEmBranco = Array.from({ length: colunas.length }, () => '').join(';')
    const texto =
      [H_MATRIZ, linhaDe(colunas, rowMatriz()), linhaComColunasVaziasADireita, linhaEmBranco].join('\n') + '\n'
    const saida = await csvCorrigidoDeArquivo(buf(texto), [], VOCAB, MATRIZ.nome)
    expect(saida).toContain('WAP0001234')
    expect(saida).toContain('WAP0002222')
  })
})

// ===========================================================================
// F56 · Frente C — valor_longo_demais (critério 12). O motor recusa a CÉLULA
// acima do teto do campo ANTES do plano existir — nunca trunca.

describe('F56 · Frente C — valor_longo_demais', () => {
  it('célula acima do teto do campo vira bloqueante; a linha some do plano; as demais continuam', () => {
    const limite = LIMITES_CAMPO_PLANO.observacoes
    const r = validarMatriz([
      rowMatriz({ 'Patrimônio': 'WAP0001111', Observação: 'x'.repeat(limite + 1) }),
      rowMatriz({ 'Patrimônio': 'WAP0002222' }), // linha válida, sem observação longa
    ])
    expect(r.plano).toBeNull() // 1 bloqueante já derruba o plano
    const erro = r.bloqueantes.find((e) => e.tipo === 'valor_longo_demais')
    expect(erro).toBeDefined()
    expect(erro!.coluna).toBe('Observação')
    expect(erro!.mensagem).toContain(String(limite + 1))
    expect(erro!.mensagem).toContain(String(limite))
    // Exibição abreviada (60 + "…") — NUNCA o valor inteiro no `ErroImport.valor`.
    expect(erro!.valor.length).toBeLessThanOrEqual(61)
    expect(erro!.valor.endsWith('…')).toBe(true)

    // Removendo a correção manual: sem a linha ofensora, a outra segue válida —
    // prova que só a linha com o campo longo é recusada, não o arquivo inteiro.
    const r2 = validarMatriz([rowMatriz({ 'Patrimônio': 'WAP0002222' })])
    expect(r2.plano).not.toBeNull()
    expect(r2.plano!.ativos).toHaveLength(1)
  })

  it('não trunca — a linha simplesmente não vira AtivoPlano', () => {
    const limite = LIMITES_CAMPO_PLANO.marca
    const r = validarMatriz([rowMatriz({ Marca: 'M'.repeat(limite + 5) })])
    expect(r.plano).toBeNull()
    // Nenhum `AtivoPlano` foi montado para esta linha — não há valor truncado
    // circulando em lugar nenhum do resultado (nem em `candidatos`, que guarda
    // só patrimônio/serviceTag, não os campos de texto livre).
    expect(r.candidatos).toEqual([])
  })
})

// ===========================================================================
// F56 · Frente C — achado C2 §1.3: a mensagem de duplicata não embute a lista
// inteira de linhas (era O(N²): N mensagens de tamanho O(N) cada).

describe('F56 · Frente C — mensagem de duplicata não cresce com o tamanho do grupo', () => {
  it('grupo de 15 linhas duplicadas: mensagem cita só as 10 primeiras + "e mais 5"; grupo.linhas fica completo', () => {
    const linhas = Array.from({ length: 15 }, () =>
      rowMatriz({ 'Patrimônio': 'WAP0009999', 'Service Tag': 'ST-DUP' }),
    )
    const r = validarMatriz(linhas)
    const duplicados = r.bloqueantes.filter((e) => e.tipo === 'par_duplicado')
    expect(duplicados).toHaveLength(15)
    for (const e of duplicados) {
      expect(e.mensagem).toContain('e mais 5')
      expect(e.mensagem.length).toBeLessThan(200) // nunca O(N) por mensagem
    }
    // `grupo.linhas` continua com as 15 linhas — a lista completa NÃO some, só
    // deixa de ser reescrita dentro de cada mensagem individual.
    const grupo = r.grupos.find((g) => g.tipo === 'par_duplicado')
    expect(grupo?.linhas).toHaveLength(15)
  })

  it('grupo de 3 linhas (abaixo do limite de 10): mensagem lista todas, sem "e mais"', () => {
    const linhas = Array.from({ length: 3 }, () =>
      rowMatriz({ 'Patrimônio': 'WAP0008888', 'Service Tag': 'ST-DUP2' }),
    )
    const r = validarMatriz(linhas)
    const erro = r.bloqueantes.find((e) => e.tipo === 'par_duplicado')
    expect(erro!.mensagem).not.toContain('e mais')
    expect(erro!.mensagem).toContain('2, 3, 4') // linhas físicas 2-4 (header=1)
  })
})
