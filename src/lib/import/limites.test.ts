import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ErroArquivoImport,
  FOLGA_MINIMA,
  LIMITE_CORPO_PLATAFORMA,
  LIMITES_CAMPO_PLANO,
  MAX_ARQUIVO_HASH,
  MAX_BYTES_CONTEUDO,
  MAX_COLUNAS_PLANILHA,
  MAX_CORRECOES,
  MAX_CRU,
  MAX_LINHAS_PLANILHA,
  MAX_PARA,
  MAX_XML_DESCOMPRIMIDO,
  ORCAMENTO_RESPOSTA_PREVIEW,
  TAMANHO_MAX_ARQUIVO,
  conferirTetos,
} from './limites'
import { validarCsvImport } from './plano'
import type { CsvCru } from './parse'
import type { FilialSelecionada } from './tipos'
import type { VocabularioImport } from './vocabulario'

// F56 · Frente C — a TRAVA dos tetos do import (Decisão 6 do PLAN-F56.md; critério
// 11). Nasceu VERMELHA contra os números de HOJE, antes da correção (saída em
// `docs/f56-evidencias/C1-limites-vermelho.txt`): naquele momento `TAMANHO_MAX_ARQUIVO`
// era 5 MiB, `MAX_LINHAS_PLANILHA` 20.000, `MAX_CORRECOES` 20.000, `MAX_CRU`/`MAX_PARA`
// 500/200, sem `MAX_BYTES_CONTEUDO`/`MAX_XML_DESCOMPRIMIDO`/`ORCAMENTO_RESPOSTA_PREVIEW`
// nenhum, e o CSV não tinha teto de linha/coluna/conteúdo — o corpo 3 do pior caso já
// passava de 4,5 MB com 1.142 linhas (fato 22/PLAN §Decisão 6).
//
// Os números abaixo são os da CONTA — medidos com o SERIALIZADOR REAL do Next
// (`scripts/perf/medir-corpos-import.mts`, saída completa em
// `docs/f56-evidencias/C2-conta-dos-corpos.txt`). Mudar qualquer constante sem refazer
// essa conta reprova o teste (1) — é o gatilho para rodar o script de novo.

describe('carimbo — os números para os quais a conta foi feita', () => {
  it('nenhuma constante muda sem a conta ser refeita (rode scripts/perf/medir-corpos-import.mts)', () => {
    const carimbo = {
      TAMANHO_MAX_ARQUIVO,
      MAX_LINHAS_PLANILHA,
      MAX_COLUNAS_PLANILHA,
      MAX_BYTES_CONTEUDO,
      MAX_XML_DESCOMPRIMIDO,
      MAX_CORRECOES,
      MAX_CRU,
      MAX_PARA,
      MAX_ARQUIVO_HASH,
      LIMITE_CORPO_PLATAFORMA,
      FOLGA_MINIMA,
      ORCAMENTO_RESPOSTA_PREVIEW,
      LIMITES_CAMPO_PLANO,
    }
    expect(
      carimbo,
      'uma constante de src/lib/import/limites.ts mudou sem a conta ser refeita — rode ' +
        '`NODE_OPTIONS="--conditions=react-server" npx tsx scripts/perf/medir-corpos-import.mts` ' +
        'de novo, atualize este carimbo E as cinco desigualdades abaixo com os números novos, ' +
        'e registre o porquê em docs/DECISOES.md.',
    ).toEqual({
      TAMANHO_MAX_ARQUIVO: 1 * 1024 * 1024,
      MAX_LINHAS_PLANILHA: 2_000,
      MAX_COLUNAS_PLANILHA: 40,
      MAX_BYTES_CONTEUDO: 768 * 1024,
      MAX_XML_DESCOMPRIMIDO: 32 * 1024 * 1024,
      MAX_CORRECOES: 500,
      MAX_CRU: 120,
      MAX_PARA: 120,
      MAX_ARQUIVO_HASH: 128,
      LIMITE_CORPO_PLATAFORMA: 4_500_000,
      FOLGA_MINIMA: 1.5,
      ORCAMENTO_RESPOSTA_PREVIEW: 2_000_000,
      LIMITES_CAMPO_PLANO: {
        patrimonio: 60, patrimonioOriginal: 60, serviceTag: 60, categoria: 30, marca: 60,
        modelo: 120, fornecedor: 80, memoria: 40, armazenamento: 40, processador: 80,
        hostname: 60, observacoes: 500, dataEntrada: 10, dataAjuste: 10, estadoAlvo: 30,
        colaborador: 120, setor: 80, chamado: 40,
      },
    })
  })

  it('MAX_LINHAS_PLANILHA fica acima da maior planilha já importada, com a folga escrita', () => {
    // Fato 4 do PLAN-F56.md: a maior planilha já importada em produção tem 1.228 linhas.
    // 2.000 = 1,63× esse máximo — a folga que o cabeçalho de `limites.ts` documenta.
    const MAIOR_PLANILHA_JA_IMPORTADA = 1228
    expect(MAX_LINHAS_PLANILHA).toBeGreaterThanOrEqual(1.5 * MAIOR_PLANILHA_JA_IMPORTADA)
  })
})

describe('as cinco desigualdades — corpo ≤ min(bodySizeLimit, LIMITE_CORPO_PLATAFORMA) / FOLGA_MINIMA', () => {
  // `next.config.ts` só resolve CommonJS (comentário de `next.config.ts`) — o teste LÊ
  // o arquivo como texto em vez de importar (Decisão 6: "o teste lê o next.config.ts").
  function bodySizeLimitDoNextConfig(): number {
    const texto = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')
    const m = texto.match(/bodySizeLimit:\s*([0-9_]+)/)
    if (!m) throw new Error('bodySizeLimit não encontrado em next.config.ts (formato mudou?)')
    return Number(m[1]!.replace(/_/g, ''))
  }

  const TETO_COM_FOLGA = Math.min(bodySizeLimitDoNextConfig(), LIMITE_CORPO_PLATAFORMA) / FOLGA_MINIMA

  it('bodySizeLimit do next.config.ts é o mesmo nº de bytes de LIMITE_CORPO_PLATAFORMA', () => {
    // Decisão 6: alinhado de propósito — o `next dev` local se comporta como produção.
    expect(bodySizeLimitDoNextConfig()).toBe(LIMITE_CORPO_PLATAFORMA)
  })

  // Coeficientes MEDIDOS (bytes, serializador real — `docs/f56-evidencias/C2-conta-dos-corpos.txt`,
  // remedição da F56 · Frente C sobre os números FINAIS da Decisão 6). Cada valor é o PIOR
  // CASO ACEITO do corpo correspondente — nunca um caso que o motor RECUSA.
  const CORPO1_CORPO4_MULTIPART_PIOR_CASO = 1_193_983 // CSV no teto de arquivo (1 MiB) + 500 correções no teto; o .xlsx equivalente (1.179.479) é menor
  const CORPO2_RESPOSTA_PIOR_CASO = 1_943_783 // N=2.000, "2.000 Sites distintos" (Flight) — o pior dos cenários patológicos, já com o orçamento de resposta aplicado
  const CORPO3_PEDIDO_APLICAR_PIOR_CASO = 1_838_884 // N=2.000, 1.024 KiB de conteúdo + 1.000 correções no teto (combinado pior×pior)
  const CORPO5_RESPOSTA_CSV_CORRIGIDO_PIOR_CASO = 811_281 // N=2.000, 1.024 KiB, estilo aspas/barras (Flight)

  it('corpo 1 = corpo 4 (pedido de validarImport/baixarCsvCorrigido — arquivo + correções)', () => {
    expect(CORPO1_CORPO4_MULTIPART_PIOR_CASO).toBeLessThanOrEqual(TETO_COM_FOLGA)
  })
  it('corpo 2 (resposta de validarImport — a ValidacaoImport inteira, com o orçamento aplicado)', () => {
    expect(CORPO2_RESPOSTA_PIOR_CASO).toBeLessThanOrEqual(TETO_COM_FOLGA)
  })
  it('corpo 3 (pedido de aplicarImport — plano + correções + custo + confirmação)', () => {
    expect(CORPO3_PEDIDO_APLICAR_PIOR_CASO).toBeLessThanOrEqual(TETO_COM_FOLGA)
  })
  it('corpo 5 (resposta de baixarCsvCorrigido — o CSV corrigido)', () => {
    expect(CORPO5_RESPOSTA_CSV_CORRIGIDO_PIOR_CASO).toBeLessThanOrEqual(TETO_COM_FOLGA)
  })
})

// ---------------------------------------------------------------------------
// conferirTetos — unitário, direto (sem precisar montar .xlsx/CSV real)

function csvDe(nColunas: number, nLinhas: number, celula: (l: number, c: number) => string): CsvCru {
  const header = Array.from({ length: nColunas }, (_, c) => `Col${c + 1}`)
  const linhas = Array.from({ length: nLinhas }, (_, l) => ({
    linha: l + 2,
    celulas: Array.from({ length: nColunas }, (_, c) => celula(l, c)),
  }))
  return { header, linhas }
}

describe('conferirTetos', () => {
  it('aceita no teto exato de linhas e colunas', () => {
    const csv = csvDe(MAX_COLUNAS_PLANILHA, MAX_LINHAS_PLANILHA, () => 'x')
    expect(() => conferirTetos(csv)).not.toThrow()
  })

  it('recusa 1 linha acima do teto, com a mensagem do leitor', () => {
    const csv = csvDe(5, MAX_LINHAS_PLANILHA + 1, () => 'x')
    expect(() => conferirTetos(csv)).toThrow(ErroArquivoImport)
    expect(() => conferirTetos(csv)).toThrow(`${(MAX_LINHAS_PLANILHA + 1).toLocaleString('pt-BR')} linhas`)
  })

  it('recusa 1 coluna acima do teto', () => {
    const csv = csvDe(MAX_COLUNAS_PLANILHA + 1, 1, () => 'x')
    expect(() => conferirTetos(csv)).toThrow(ErroArquivoImport)
    expect(() => conferirTetos(csv)).toThrow(`${MAX_COLUNAS_PLANILHA + 1} colunas`)
  })

  it('colunas vazias à direita do cabeçalho não contam para o teto de colunas', () => {
    const header = [...Array.from({ length: MAX_COLUNAS_PLANILHA }, (_, i) => `Col${i + 1}`), '', '', '']
    const csv: CsvCru = { header, linhas: [{ linha: 2, celulas: ['x'] }] }
    expect(() => conferirTetos(csv)).not.toThrow()
  })

  it('recusa conteúdo acima do teto de bytes (célula gigante)', () => {
    const csv = csvDe(1, 1, () => 'a'.repeat(MAX_BYTES_CONTEUDO + 1))
    expect(() => conferirTetos(csv)).toThrow(ErroArquivoImport)
    expect(() => conferirTetos(csv)).toThrow(/conteúdo/i)
  })

  it('aceita conteúdo no teto (soma de várias células, com folga para o cabeçalho)', () => {
    // -100 B de folga: o cabeçalho ("Col1".."Col10") também soma no total.
    const porCelula = Math.floor((MAX_BYTES_CONTEUDO - 100) / 10)
    const csv = csvDe(10, 1, () => 'a'.repeat(porCelula))
    expect(() => conferirTetos(csv)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Pior caso patológico — MOTOR REAL, N=2.000, contra ORCAMENTO_RESPOSTA_PREVIEW
// (critério 11 — item 3 da Decisão 6). Reproduz os quatro cenários do relatório C2
// (docs/f56-evidencias/C2-conta-dos-corpos.txt), em miniatura, direto pelo Vitest —
// só o gate de bytes JSON, sem o serializador Flight (esse fica no script versionado,
// que exige NODE_OPTIONS=react-server e não roda aqui).

const FILIAL: FilialSelecionada = { id: 1, slug: 'matriz', nome: 'Matriz' }

// F56 · Frente D — o vocabulário deixou de ser hardcoded; o motor recebe
// `VocabularioImport` por parâmetro. Fixture mínima (só o que este arquivo usa —
// Notebook/Estoque/Saída e o prefixo WAP, para a auto-detecção pelo hostname).
const VOCAB: VocabularioImport = {
  filiais: [{ id: FILIAL.id, nome: FILIAL.nome, ativa: true }],
  apelidos: [],
  categorias: [{ termo: 'notebook', categoria: 'notebook', rotulo: 'Notebook' }],
  estados: [
    { termo: 'saida', estado: 'em_uso', rotulo: 'Saída' },
    { termo: 'estoque', estado: 'em_estoque', rotulo: 'Estoque' },
  ],
  prefixosPatrimonio: ['WAP', 'PRO', 'LEA', 'TEC', 'STF', 'PAT', 'NOO'],
}

const H20 = [
  'Site', 'Marca', 'Tipo', 'Modelo', 'Fornecedor', 'Service Tag', 'Patrimônio',
  'Memória', 'Armazenamento', 'Processador', 'Hostname', 'Data de Entrega',
  'Status', 'Situação', 'Data de Inclusão', 'Colaborador', 'Termo de Ativos', 'Observação',
  'Grade', 'GLPI',
]
function csvCelula(v: string): string {
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}
function montarCsvTexto(linhas: string[][]): Uint8Array {
  return new TextEncoder().encode([H20.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n'))
}
function linhaBloqueante4Curta(i: number, siteUnico: boolean): string[] {
  const site = siteUnico ? `LIXO-SITE-${i}` : 'LIXO-SITE'
  const cells: Record<string, string> = {
    Site: site, Marca: 'x', Tipo: 'LIXO-TIPO', Modelo: 'x', Fornecedor: 'x',
    'Service Tag': 'x', 'Patrimônio': 'LIXO-PATR', 'Memória': 'x', Armazenamento: 'x',
    Processador: 'x', Hostname: 'x', 'Data de Entrega': '', Status: 'LIXO-ESTADO', Situação: 'LIXO-ESTADO',
    'Data de Inclusão': '01/03/2025', Colaborador: '', 'Termo de Ativos': '', Observação: '',
    Grade: '', GLPI: '',
  }
  return H20.map((h) => csvCelula(cells[h] ?? ''))
}
function linhaDuplicataCurta(i: number): string[] {
  const cells: Record<string, string> = {
    Site: 'Matriz', Marca: 'x', Tipo: 'Notebook', Modelo: 'x', Fornecedor: 'x',
    'Service Tag': 'ST-DUP-FIXA', 'Patrimônio': 'WAP9999999', 'Memória': 'x', Armazenamento: 'x',
    Processador: 'x', Hostname: `x${i}`, 'Data de Entrega': '', Status: '', Situação: 'Estoque',
    'Data de Inclusão': '01/03/2025', Colaborador: '', 'Termo de Ativos': '', Observação: '',
    Grade: '', GLPI: '',
  }
  return H20.map((h) => csvCelula(cells[h] ?? ''))
}
function linhaAvisosCurta(i: number): string[] {
  const grupo = i % 3
  const cells: Record<string, string> = {
    Site: 'Matriz', Marca: 'x', Tipo: 'Notebook', Modelo: 'x', Fornecedor: 'x',
    'Service Tag': `ST${i}`, 'Patrimônio': grupo === 2 ? `WAP9${String(i + 1).padStart(6, '0')}` : '',
    'Memória': 'x', Armazenamento: 'x', Processador: 'x',
    Hostname: grupo === 1 ? `NB-WAP9${String(900000 + i).padStart(6, '0')}` : `x${i}`,
    'Data de Entrega': '', Status: '', Situação: 'Saída', 'Data de Inclusão': '',
    Colaborador: '', 'Termo de Ativos': '', Observação: '', Grade: '', GLPI: '',
  }
  return H20.map((h) => csvCelula(cells[h] ?? ''))
}

const N = 2000

function bytesJson(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v), 'utf8')
}

describe('pior caso patológico (motor real, N=2.000) cabe no ORCAMENTO_RESPOSTA_PREVIEW', () => {
  it('quatro bloqueantes por linha', () => {
    const linhas = Array.from({ length: N }, (_, i) => linhaBloqueante4Curta(i, false))
    const v = validarCsvImport(montarCsvTexto(linhas), FILIAL, VOCAB, '2026-09-11')
    expect(v.resumo.detalhe.totalBloqueantes).toBe(4 * N)
    expect(bytesJson(v)).toBeLessThanOrEqual(ORCAMENTO_RESPOSTA_PREVIEW)
  })

  it('duplicata em toda linha (o achado O(N²) da medição C2)', () => {
    const linhas = Array.from({ length: N }, (_, i) => linhaDuplicataCurta(i))
    const v = validarCsvImport(montarCsvTexto(linhas), FILIAL, VOCAB, '2026-09-11')
    expect(v.resumo.detalhe.totalBloqueantes).toBe(N)
    expect(bytesJson(v)).toBeLessThanOrEqual(ORCAMENTO_RESPOSTA_PREVIEW)
    // A mensagem de CADA bloqueante nunca embute a lista inteira de linhas — só um
    // resumo (10 primeiras + "e mais N"), a correção do achado C2 §1.3.
    for (const b of v.bloqueantes) expect(b.mensagem.length).toBeLessThan(300)
  })

  it('2.000 Sites distintos (muitos grupos pequenos)', () => {
    const linhas = Array.from({ length: N }, (_, i) => linhaBloqueante4Curta(i, true))
    const v = validarCsvImport(montarCsvTexto(linhas), FILIAL, VOCAB, '2026-09-11')
    expect(v.grupos.length).toBeGreaterThan(N) // ~N grupos de site_divergente + os fixos
    expect(bytesJson(v)).toBeLessThanOrEqual(ORCAMENTO_RESPOSTA_PREVIEW)
  })

  it('arquivo válido com o máximo de avisos', () => {
    const linhas = Array.from({ length: N }, (_, i) => linhaAvisosCurta(i))
    const v = validarCsvImport(montarCsvTexto(linhas), FILIAL, VOCAB, '2026-09-11')
    expect(v.resumo.detalhe.totalAvisos).toBeGreaterThan(0)
    expect(bytesJson(v)).toBeLessThanOrEqual(ORCAMENTO_RESPOSTA_PREVIEW)
  })

  it('o piso do degrau nunca chega a 0 por tipo, mesmo no pior caso', () => {
    const linhas = Array.from({ length: N }, (_, i) => linhaDuplicataCurta(i))
    const v = validarCsvImport(montarCsvTexto(linhas), FILIAL, VOCAB, '2026-09-11')
    if (v.resumo.detalhe.reduzido) {
      const porTipo = new Map<string, number>()
      for (const b of v.bloqueantes) porTipo.set(b.tipo, (porTipo.get(b.tipo) ?? 0) + 1)
      for (const n of porTipo.values()) expect(n).toBeGreaterThanOrEqual(1)
    }
  })
})
