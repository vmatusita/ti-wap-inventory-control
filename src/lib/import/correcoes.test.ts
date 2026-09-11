import { describe, expect, it } from 'vitest'
import {
  COLUNA_POR_CAMPO,
  agruparErros,
  aplicarCorrecoes,
  csvCorrigido,
  csvCorrigidoParaTexto,
  distanciaLevenshtein,
  sugerirValor,
  validarCorrecao,
} from './correcoes'
import { CATEGORIAS_TERMOS, ESTADOS_CORRIGIVEIS, SITUACAO_CANONICA } from './deparas'
import { extrairRegistros, mapaColunas, parseCsv, type RegistroImport } from './parse'
import { hashConteudo, validarCsvImport } from './plano'
import type { CampoEditavel, CorrecaoImport, FilialSelecionada } from './tipos'

// ===========================================================================
// Helpers — CSVs 100% FICTÍCIOS (padrão WAP0001234 / "Fulano"), como na F7.

const H_MATRIZ =
  'Site;Marca;Tipo;Modelo;Fornecedor;Service Tag;Patrimônio;Memória;Armazenamento;Processador;Hostname;Data de Entrega;Status;Situação;Data de Inclusão;Colaborador;Termo de Ativos;Observação'
const H_CD =
  'Site;Marca;Tipo;Modelo;Fornecedor;Service Tag;Patrimônio;Memória;Armazenamento;Processador;Hostname;Status;Situação;Data de Inclusão;Colaborador;Observação'

const HOJE = '2026-07-16'
const MATRIZ: FilialSelecionada = { id: 1, slug: 'matriz', nome: 'Matriz' }

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
function rowMatriz(over: Record<string, string> = {}): Record<string, string> {
  return { Site: 'Matriz', Tipo: 'Notebook', 'Patrimônio': 'WAP0001234', Status: 'Estoque', ...over }
}

/** Aplica correções sobre um texto CSV e devolve o resultado + os registros já corrigidos. */
function aplicar(texto: string, correcoes: CorrecaoImport[], filialNome: string | undefined = 'Matriz') {
  const csv = parseCsv(texto)
  const r = aplicarCorrecoes(csv, correcoes, mapaColunas(csv.header), filialNome)
  return { ...r, registros: extrairRegistros(r.csv).registros, original: csv }
}

/** Atalho do ciclo completo do preview (o que a tela faz a cada correção). */
function validar(
  linhas: Record<string, string>[],
  correcoes: CorrecaoImport[] = [],
  filial = MATRIZ,
  existentesEmOutraFilial?: ReadonlyMap<string, string>,
) {
  return validarCsvImport(
    buf(montar(H_MATRIZ, linhas)),
    filial,
    HOJE,
    correcoes,
    existentesEmOutraFilial,
  )
}

const LAYOUT_MATRIZ = new Set(mapaColunas(H_MATRIZ.split(';')).keys())
const LAYOUT_CD = new Set(mapaColunas(H_CD.split(';')).keys())

// ===========================================================================

describe('COLUNA_POR_CAMPO — espelha o que extrairRegistros lê', () => {
  // Se esta correspondência divergir, a correção escreveria numa célula e a
  // validação leria outra: o erro "corrigido" reapareceria intacto.
  const CAMPO_NO_REGISTRO: Record<CampoEditavel, keyof RegistroImport> = {
    site: 'site',
    tipo: 'tipo',
    patrimonio: 'patrimonio',
    serviceTag: 'serviceTag',
    situacao: 'situacao',
    colaborador: 'colaborador',
    dataInclusao: 'dataInclusao',
    dataEntrega: 'dataEntrega',
  }

  it.each(Object.keys(CAMPO_NO_REGISTRO) as CampoEditavel[])(
    '%s: escrever na coluna mapeada aparece no campo do registro',
    (campo) => {
      const csv = parseCsv(montar(H_MATRIZ, [rowMatriz()]))
      const i = mapaColunas(csv.header).get(COLUNA_POR_CAMPO[campo])
      expect(i, `coluna "${COLUNA_POR_CAMPO[campo]}" não existe no layout matriz`).toBeDefined()
      const celulas = csv.linhas[0]!.celulas
      while (celulas.length <= i!) celulas.push('')
      celulas[i!] = 'SENTINELA'
      const { registros } = extrairRegistros(csv)
      expect(registros[0]![CAMPO_NO_REGISTRO[campo]]).toBe('SENTINELA')
    },
  )

  it('cobre exatamente os CampoEditavel do contrato', () => {
    expect(Object.keys(COLUNA_POR_CAMPO).sort()).toEqual([
      'colaborador',
      'dataEntrega',
      'dataInclusao',
      'patrimonio',
      'serviceTag',
      'site',
      'situacao',
      'tipo',
    ])
  })
})

// ===========================================================================

describe('aplicarCorrecoes — cada op aplica e conta certo', () => {
  it('substituir: troca o valor cru em TODAS as linhas que casam; conta as afetadas', () => {
    const texto = montar(H_MATRIZ, [
      rowMatriz({ Tipo: 'Notbook' }),
      rowMatriz({ Tipo: 'Notbook', 'Patrimônio': 'WAP0002222' }),
      rowMatriz({ Tipo: 'Monitor', 'Patrimônio': 'WAP0003333' }),
    ])
    const r = aplicar(texto, [{ op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' }])
    expect(r.porOp).toEqual([2])
    expect(r.registros.map((x) => x.tipo)).toEqual(['Notebook', 'Notebook', 'Monitor'])
    expect(r.linhasRemovidas).toBe(0)
    expect(r.invalidas).toHaveLength(0)
  })

  it('substituir: casa por valor APARADO e exato (não é substring)', () => {
    const texto = montar(H_MATRIZ, [
      rowMatriz({ Tipo: '  Notbook  ' }),
      rowMatriz({ Tipo: 'Notbook Pro', 'Patrimônio': 'WAP0002222' }),
    ])
    const r = aplicar(texto, [{ op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' }])
    expect(r.porOp).toEqual([1])
    expect(r.registros.map((x) => x.tipo)).toEqual(['Notebook', 'Notbook Pro'])
  })

  it('substituir_estado: casa o PAR (Status, Situação) e grava só em Situação', () => {
    const texto = montar(H_MATRIZ, [
      rowMatriz({ Status: 'Estoque', Situação: 'Xyz' }),
      rowMatriz({ Status: 'Estoque', Situação: 'Xyz', 'Patrimônio': 'WAP0002222' }),
      rowMatriz({ Status: 'Saída', Situação: 'Xyz', 'Patrimônio': 'WAP0003333' }), // par diferente
    ])
    const r = aplicar(texto, [
      { op: 'substituir_estado', statusDe: 'Estoque', situacaoDe: 'Xyz', para: SITUACAO_CANONICA.em_manutencao },
    ])
    expect(r.porOp).toEqual([2])
    expect(r.registros.map((x) => x.situacao)).toEqual(['Manutenção', 'Manutenção', 'Xyz'])
    expect(r.registros.map((x) => x.status)).toEqual(['Estoque', 'Estoque', 'Saída']) // Status intocado
  })

  it('editar: pontual, 1 linha, campo whitelisted', () => {
    const texto = montar(H_MATRIZ, [rowMatriz({ 'Patrimônio': 'ABC' }), rowMatriz({ 'Patrimônio': 'ABC' })])
    const r = aplicar(texto, [{ op: 'editar', linha: 2, campo: 'patrimonio', para: 'WAP4491' }])
    expect(r.porOp).toEqual([1])
    expect(r.registros.map((x) => x.patrimonio)).toEqual(['WAP4491', 'ABC'])
  })

  it('remover_linha: some do CSV corrigido e conta em linhasRemovidas', () => {
    const texto = montar(H_MATRIZ, [rowMatriz(), rowMatriz({ 'Patrimônio': 'WAP0002222' })])
    const r = aplicar(texto, [{ op: 'remover_linha', linha: 2 }])
    expect(r.porOp).toEqual([1])
    expect(r.linhasRemovidas).toBe(1)
    expect(r.registros.map((x) => x.patrimonio)).toEqual(['WAP0002222'])
  })

  it('não muta o CSV de entrada (a fonte continua sendo o arquivo enviado)', () => {
    const csv = parseCsv(montar(H_MATRIZ, [rowMatriz({ Tipo: 'Notbook' })]))
    const antes = JSON.stringify(csv)
    aplicarCorrecoes(
      csv,
      [
        { op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' },
        { op: 'editar', linha: 2, campo: 'colaborador', para: 'Fulano' },
      ],
      mapaColunas(csv.header),
      'Matriz',
    )
    expect(JSON.stringify(csv)).toBe(antes)
  })

  it('escrita além do comprimento da linha preenche o gap com vazio (§3.6)', () => {
    // Linha curta (FieldMismatch tolerado pelo Papa): só 3 células.
    const texto = [H_MATRIZ, 'Matriz;;Notebook'].join('\n')
    const r = aplicar(texto, [{ op: 'editar', linha: 2, campo: 'colaborador', para: 'Fulano / TI' }])
    expect(r.porOp).toEqual([1])
    expect(r.csv.linhas[0]!.celulas).toHaveLength(16) // até a coluna Colaborador (índice 15)
    expect(r.csv.linhas[0]!.celulas.slice(3, 15).every((c) => c === '')).toBe(true)
    expect(r.registros[0]!.colaborador).toBe('Fulano / TI')
  })

  it('o valor corrigido passa pela mesma normalização de célula digitada (aparado)', () => {
    const texto = montar(H_MATRIZ, [rowMatriz({ Tipo: 'Notbook' })])
    const r = aplicar(texto, [{ op: 'substituir', campo: 'tipo', de: 'Notbook', para: '  Notebook  ' }])
    expect(r.registros[0]!.tipo).toBe('Notebook')
  })

  it('porOp tem sempre o tamanho da lista, na ordem da lista', () => {
    const texto = montar(H_MATRIZ, [rowMatriz({ Tipo: 'Notbook' })])
    const r = aplicar(texto, [
      { op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' },
      { op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' },
      { op: 'remover_linha', linha: 99 },
    ])
    expect(r.porOp).toEqual([1, 0, 0])
  })
})

describe('aplicarCorrecoes — ordem determinística (§3.1)', () => {
  // Veículo: `tipo`. (Estes testes usavam `editar`+`site`, que a régua da decisão
  // 4 passou a recusar — a ordem é o que importa aqui, não o campo.)
  it('editar → substituir: a substituição enxerga a célula já editada', () => {
    const texto = montar(H_MATRIZ, [
      rowMatriz({ Tipo: 'Notbok' }),
      rowMatriz({ Tipo: 'Notbook', 'Patrimônio': 'WAP0002222' }),
    ])
    const r = aplicar(texto, [
      { op: 'editar', linha: 2, campo: 'tipo', para: 'Notbook' },
      { op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' },
    ])
    expect(r.porOp).toEqual([1, 2]) // o editar fez a linha 2 casar com a massa
    expect(r.registros.map((x) => x.tipo)).toEqual(['Notebook', 'Notebook'])
  })

  it('substituir → editar: a ordem inversa dá resultado diferente (nada de reordenar)', () => {
    const texto = montar(H_MATRIZ, [
      rowMatriz({ Tipo: 'Notbok' }),
      rowMatriz({ Tipo: 'Notbook', 'Patrimônio': 'WAP0002222' }),
    ])
    const r = aplicar(texto, [
      { op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' },
      { op: 'editar', linha: 2, campo: 'tipo', para: 'Notbook' },
    ])
    expect(r.porOp).toEqual([1, 1]) // a massa passou antes de a linha 2 casar
    expect(r.registros.map((x) => x.tipo)).toEqual(['Notbook', 'Notebook'])
  })

  it('editar e depois remover a mesma linha: as duas valem (§8.3)', () => {
    const texto = montar(H_MATRIZ, [rowMatriz(), rowMatriz({ 'Patrimônio': 'WAP0002222' })])
    const r = aplicar(texto, [
      { op: 'editar', linha: 2, campo: 'colaborador', para: 'Fulano' },
      { op: 'remover_linha', linha: 2 },
    ])
    expect(r.porOp).toEqual([1, 1])
    expect(r.registros).toHaveLength(1)
  })

  it('remover e depois editar a mesma linha: a edição é no-op 0 (§8.3)', () => {
    const texto = montar(H_MATRIZ, [rowMatriz(), rowMatriz({ 'Patrimônio': 'WAP0002222' })])
    const r = aplicar(texto, [
      { op: 'remover_linha', linha: 2 },
      { op: 'editar', linha: 2, campo: 'colaborador', para: 'Fulano' },
      { op: 'remover_linha', linha: 2 },
    ])
    expect(r.porOp).toEqual([1, 0, 0])
    expect(r.linhasRemovidas).toBe(1)
  })

  it('substituir não alcança linha removida antes', () => {
    const texto = montar(H_MATRIZ, [
      rowMatriz({ Tipo: 'Notbook' }),
      rowMatriz({ Tipo: 'Notbook', 'Patrimônio': 'WAP0002222' }),
    ])
    const r = aplicar(texto, [
      { op: 'remover_linha', linha: 2 },
      { op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' },
    ])
    expect(r.porOp).toEqual([1, 1]) // só a linha 3 sobrou
    expect(r.registros.map((x) => x.tipo)).toEqual(['Notebook'])
  })
})

describe('aplicarCorrecoes — no-ops (§8.2/§8.3, §3.7, §3.9): contagem 0, NUNCA erro', () => {
  it('valor `de` que não casa → 0 (correção órfã)', () => {
    const r = aplicar(montar(H_MATRIZ, [rowMatriz()]), [
      { op: 'substituir', campo: 'tipo', de: 'Impressora', para: 'Notebook' },
    ])
    expect(r.porOp).toEqual([0])
    expect(r.invalidas).toHaveLength(0)
  })

  it('linha inexistente → 0', () => {
    const r = aplicar(montar(H_MATRIZ, [rowMatriz()]), [
      { op: 'editar', linha: 99, campo: 'colaborador', para: 'Fulano' },
      { op: 'remover_linha', linha: 99 },
    ])
    expect(r.porOp).toEqual([0, 0])
    expect(r.invalidas).toHaveLength(0)
  })

  it('campo fora do layout (dataEntrega no cd) → 0 e NÃO é erro (§3.7)', () => {
    const texto = montar(H_CD, [
      { Site: 'Matriz', Tipo: 'Notebook', 'Patrimônio': 'WAP0001234', Status: 'Estoque' },
    ])
    const r = aplicar(texto, [{ op: 'editar', linha: 2, campo: 'dataEntrega', para: '01/02/2025' }])
    expect(r.porOp).toEqual([0])
    expect(r.invalidas).toHaveLength(0)
  })

  it('linha descartada (sem Site E sem patrimônio) fica fora do alcance (§3.9)', () => {
    const texto = montar(H_MATRIZ, [rowMatriz(), { Tipo: 'Notebook', 'Service Tag': 'SOLTA' }])
    const r = aplicar(texto, [
      { op: 'editar', linha: 3, campo: 'patrimonio', para: 'WAP0009999' },
      { op: 'remover_linha', linha: 3 },
      { op: 'substituir', campo: 'tipo', de: 'Notebook', para: 'Monitor' },
    ])
    expect(r.porOp).toEqual([0, 0, 1]) // a substituição em massa só pega a linha 2
    expect(r.linhasRemovidas).toBe(0)
    expect(r.invalidas).toHaveLength(0)
  })
})

// ===========================================================================

describe('validarCorrecao / correcao_invalida (§3.3–5)', () => {
  it('substituir de site CONHECIDO → inválida (decisão 4: outra filial só remove)', () => {
    const motivo = validarCorrecao(
      { op: 'substituir', campo: 'site', de: 'Serra Park', para: 'Matriz' },
      LAYOUT_MATRIZ,
      'Matriz',
    )
    expect(motivo).toContain('Serra')
    expect(motivo).toContain('remova as linhas')
  })

  it('substituir de site desconhecido para filial ≠ selecionada → inválida', () => {
    expect(
      validarCorrecao({ op: 'substituir', campo: 'site', de: 'Matriz SM', para: 'Serra' }, LAYOUT_MATRIZ, 'Matriz'),
    ).toContain('filial selecionada (Matriz)')
  })

  it('substituir de site desconhecido para a filial selecionada → válida (typo)', () => {
    expect(
      validarCorrecao({ op: 'substituir', campo: 'site', de: 'Matriz SM', para: 'Matriz' }, LAYOUT_MATRIZ, 'Matriz'),
    ).toBeNull()
    // apelido do De→Para que resolve para a MESMA filial também vale
    expect(
      validarCorrecao({ op: 'substituir', campo: 'site', de: 'CD Pena 2', para: 'CD-PENA' }, LAYOUT_MATRIZ, 'CD-Afonso Pena'),
    ).toBeNull()
  })

  it('estado → descartado é inválido em substituir_estado e em editar (régua da F7 intacta)', () => {
    expect(
      validarCorrecao({ op: 'substituir_estado', statusDe: 'Estoque', situacaoDe: '', para: 'Descarte' }, LAYOUT_MATRIZ, 'Matriz'),
    ).toContain('descartado')
    expect(
      validarCorrecao({ op: 'editar', linha: 2, campo: 'situacao', para: 'Descartado' }, LAYOUT_MATRIZ, 'Matriz'),
    ).toContain('descartado')
  })

  it('situação fora do vocabulário → inválida', () => {
    expect(
      validarCorrecao({ op: 'substituir_estado', statusDe: 'Estoque', situacaoDe: '', para: 'Xyz' }, LAYOUT_MATRIZ, 'Matriz'),
    ).toContain('não corresponde')
  })

  it('todos os termos canônicos de estado são aceitos', () => {
    for (const para of Object.values(SITUACAO_CANONICA)) {
      expect(
        validarCorrecao({ op: 'substituir_estado', statusDe: 'Estoque', situacaoDe: 'Xyz', para }, LAYOUT_MATRIZ, 'Matriz'),
      ).toBeNull()
    }
  })

  it('campo fora do layout → mensagem para a UI desabilitar (mas é no-op no motor)', () => {
    expect(validarCorrecao({ op: 'editar', linha: 2, campo: 'dataEntrega', para: '01/02/2025' }, LAYOUT_CD, 'Matriz')).toContain(
      'não existe no layout',
    )
    expect(validarCorrecao({ op: 'editar', linha: 2, campo: 'dataEntrega', para: '01/02/2025' }, LAYOUT_MATRIZ, 'Matriz')).toBeNull()
  })

  it('substituir em massa de patrimônio/service tag é barrado mesmo vindo de fora do TS (§3.2)', () => {
    // A union já barra em tempo de compilação; o JSON da action, não.
    const op = { op: 'substituir', campo: 'patrimonio', de: 'ABC', para: 'WAP0001234' } as unknown as CorrecaoImport
    expect(validarCorrecao(op, LAYOUT_MATRIZ, 'Matriz')).toContain('linha a linha')
  })

  it('op inválida vira bloqueante correcao_invalida (linha 0, coluna = campo) e NÃO é aplicada', () => {
    const r = validar(
      [rowMatriz({ Site: 'Serra' })],
      [{ op: 'substituir', campo: 'site', de: 'Serra', para: 'Matriz' }],
    )
    const invalida = r.bloqueantes.find((e) => e.tipo === 'correcao_invalida')
    expect(invalida).toBeDefined()
    expect(invalida!.linha).toBe(0)
    expect(invalida!.coluna).toBe('site')
    expect(r.correcoes.porOp).toEqual([0])
    expect(r.correcoes.aplicadas).toBe(0)
    // não aplicada: o site_divergente original continua lá
    expect(r.bloqueantes.some((e) => e.tipo === 'site_divergente')).toBe(true)
    expect(r.plano).toBeNull()
  })

  it('estado→descartado por fora da UI: bloqueante, e o estado_descartado continua', () => {
    const r = validar(
      [rowMatriz({ Situação: 'Descarte' })],
      [{ op: 'substituir_estado', statusDe: 'Estoque', situacaoDe: 'Descarte', para: 'Descartado' }],
    )
    expect(r.bloqueantes.some((e) => e.tipo === 'correcao_invalida')).toBe(true)
    expect(r.bloqueantes.some((e) => e.tipo === 'estado_descartado')).toBe(true)
    expect(r.plano).toBeNull()
  })
})

// ===========================================================================

describe('sugerirValor — Levenshtein próprio (zero dependência)', () => {
  it('distância de edição básica', () => {
    expect(distanciaLevenshtein('', '')).toBe(0)
    expect(distanciaLevenshtein('abc', 'abc')).toBe(0)
    expect(distanciaLevenshtein('', 'abc')).toBe(3)
    expect(distanciaLevenshtein('notbook', 'notebook')).toBe(1) // inserção
    expect(distanciaLevenshtein('kitten', 'sitting')).toBe(3) // clássico
  })

  it('typo próximo sugere (categoria)', () => {
    expect(sugerirValor('Notbook', CATEGORIAS_TERMOS)).toBe('notebook')
    expect(sugerirValor('MONITOR', CATEGORIAS_TERMOS)).toBe('monitor')
    expect(sugerirValor('Celullar', CATEGORIAS_TERMOS)).toBe('celular')
  })

  it('valor distante NÃO sugere (nada de palpite)', () => {
    expect(sugerirValor('Impressora', CATEGORIAS_TERMOS)).toBeNull()
    expect(sugerirValor('Teclado', CATEGORIAS_TERMOS)).toBeNull()
    expect(sugerirValor('', CATEGORIAS_TERMOS)).toBeNull()
    expect(sugerirValor('Notbook', [])).toBeNull()
  })

  it('respeita o limiar de 40% do comprimento (palavra curta não vira palpite)', () => {
    // distância 2 num valor de 3 letras = 67% → sem sugestão, mesmo com d ≤ 2
    expect(sugerirValor('Not', CATEGORIAS_TERMOS)).toBeNull()
    // distância 2 num valor de 8 letras = 25% → sugere
    expect(sugerirValor('Notebok2', CATEGORIAS_TERMOS)).toBe('notebook')
  })

  it('typo de estado sugere; termo de descarte não tem sugestão (o usuário decide)', () => {
    expect(sugerirValor('Manutencao', ESTADOS_CORRIGIVEIS)).toBe('manutencao')
    expect(sugerirValor('Estoqe', ESTADOS_CORRIGIVEIS)).toBe('estoque')
    expect(sugerirValor('Descarte', ESTADOS_CORRIGIVEIS)).toBeNull()
  })

  it('determinístico: empate resolve pelo primeiro candidato da lista', () => {
    // 'aaaaa' está a 1 de edição dos dois candidatos (1 ≤ 2 e 1 ≤ 40% de 5)
    expect(sugerirValor('aaaaa', ['aaaab', 'aaaac'])).toBe('aaaab')
    expect(sugerirValor('aaaaa', ['aaaac', 'aaaab'])).toBe('aaaac')
  })
})

// ===========================================================================

describe('agruparErros', () => {
  it('agrupa por tipo + valor cru e ordena do mais numeroso para o menos', () => {
    const r = validar([
      rowMatriz({ Tipo: 'Notbook' }),
      rowMatriz({ Tipo: 'Notbook', 'Patrimônio': 'WAP0002222' }),
      rowMatriz({ Tipo: 'Notbook', 'Patrimônio': 'WAP0003333' }),
      rowMatriz({ Tipo: 'Impressora', 'Patrimônio': 'WAP0004444' }),
    ])
    const grupos = r.grupos.filter((g) => g.tipo === 'categoria_desconhecida')
    expect(grupos).toHaveLength(2)
    expect(grupos[0]!.chave).toBe('Notbook')
    expect(grupos[0]!.linhas).toEqual([2, 3, 4])
    expect(grupos[0]!.erros).toHaveLength(3)
    expect(grupos[0]!.correcao).toEqual({ kind: 'categoria', sugestao: 'notebook' })
    expect(grupos[1]!.chave).toBe('Impressora')
    expect(grupos[1]!.correcao).toEqual({ kind: 'categoria', sugestao: null })
    // ordenação global: mais numeroso primeiro
    expect(r.grupos[0]!.linhas.length).toBeGreaterThanOrEqual(r.grupos[r.grupos.length - 1]!.linhas.length)
  })

  it('site desconhecido × site de outra filial conhecida (decisão 4)', () => {
    const r = validar([
      rowMatriz({ Site: 'Matriz SM' }),
      rowMatriz({ Site: 'Matriz SM', 'Patrimônio': 'WAP0002222' }),
      rowMatriz({ Site: 'Serra', 'Patrimônio': 'WAP0003333' }),
    ])
    const grupos = r.grupos.filter((g) => g.tipo === 'site_divergente')
    expect(grupos).toHaveLength(2)
    expect(grupos[0]!.chave).toBe('Matriz SM')
    expect(grupos[0]!.correcao).toEqual({ kind: 'site_desconhecido' })
    expect(grupos[1]!.chave).toBe('Serra')
    expect(grupos[1]!.correcao).toEqual({ kind: 'site_outra_filial' })
  })

  it('estado agrupa pelo PAR Status␟Situação e sugere o termo próximo', () => {
    const r = validar([
      rowMatriz({ Status: 'Estoque', Situação: 'Manutencao' }),
      rowMatriz({ Status: 'Estoque', Situação: 'Manutencao', 'Patrimônio': 'WAP0002222' }),
      rowMatriz({ Status: 'Xyz', Situação: '', 'Patrimônio': 'WAP0003333' }),
    ])
    // "Manutencao" (sem cedilha/til) resolve pelo De→Para → não é erro
    const grupos = r.grupos.filter((g) => g.tipo === 'estado_desconhecido')
    expect(grupos).toHaveLength(1)
    expect(grupos[0]!.chave).toBe('Xyz␟')
    expect(grupos[0]!.correcao).toEqual({ kind: 'estado', statusDe: 'Xyz', situacaoDe: '', sugestao: null })
    expect(grupos[0]!.linhas).toEqual([4])
  })

  it('estado_descartado vira grupo de estado (trocar) — nunca "aceitar"', () => {
    const r = validar([rowMatriz({ Situação: 'Descarte' })])
    const grupo = r.grupos.find((g) => g.tipo === 'estado_descartado')!
    expect(grupo.chave).toBe('Estoque␟Descarte')
    expect(grupo.correcao).toEqual({
      kind: 'estado',
      statusDe: 'Estoque',
      situacaoDe: 'Descarte',
      sugestao: null,
    })
  })

  it('kinds pontuais: patrimônio, duplicata, colaborador, data', () => {
    const r = validar([
      rowMatriz({ 'Patrimônio': 'ABC' }),
      rowMatriz({ 'Patrimônio': 'WAP0002222', 'Service Tag': 'SVC1' }),
      rowMatriz({ 'Patrimônio': 'WAP0002222', 'Service Tag': 'SVC1' }),
      rowMatriz({ 'Patrimônio': 'WAP0004444', Status: 'Saída', 'Data de Inclusão': '01/01/2025' }),
    ])
    expect(r.grupos.find((g) => g.tipo === 'patrimonio_invalido')!.correcao).toEqual({ kind: 'patrimonio' })
    expect(r.grupos.find((g) => g.tipo === 'par_duplicado')!.correcao).toEqual({ kind: 'duplicata' })
    expect(r.grupos.find((g) => g.tipo === 'estado_em_uso_sem_colaborador')!.correcao).toEqual({
      kind: 'colaborador',
    })
    expect(r.grupos.find((g) => g.tipo === 'sem_data_entrada')!.correcao).toEqual({ kind: 'data' })
  })

  it('F7E — sem_data_entrada agrupa TODAS as linhas num card único (não mais por valor cru)', () => {
    const r = validar([
      rowMatriz({ 'Data de Inclusão': '' }),
      rowMatriz({ 'Data de Inclusão': '', 'Patrimônio': 'WAP0002222' }),
      rowMatriz({ 'Data de Inclusão': '#######', 'Patrimônio': 'WAP0003333' }),
    ])
    const grupos = r.grupos.filter((g) => g.tipo === 'sem_data_entrada')
    expect(grupos).toHaveLength(1)
    expect(grupos[0]!.chave).toBe('')
    expect(grupos[0]!.linhas).toEqual([2, 3, 4]) // "" + ####### num só card
    expect(grupos[0]!.correcao).toEqual({ kind: 'data' })
  })

  // Por que data NÃO tem troca em massa (revisão adversarial da F7B, 17/07/2026).
  // `substituir` é global por construção: alcança toda linha cuja célula casa o
  // valor cru. Em Tipo/Site isso é exato — toda célula que casa é, por si, errada.
  // Em data NÃO: `sem_data_entrada` só é aviso quando Inclusão E Entrega falham,
  // então a linha 3 abaixo (Inclusão vazia, Entrega válida) NÃO está no grupo e
  // mesmo assim casaria com `de: ''` — e como dataEntrada é a mais ANTIGA válida,
  // uma data nova mais antiga que a Entrega mudaria a dataEntrada dela em
  // silêncio. Por isso a op é recusada no motor e no Zod, e a UI emite um `editar`
  // por linha do grupo. Este teste guarda a régua contra um chamador fora do TS.
  it('substituir em data é recusada: alcançaria linha sem aviso (correcao_invalida)', () => {
    const r = validar(
      [
        rowMatriz({ 'Data de Inclusão': '', 'Data de Entrega': '' }), // com aviso
        rowMatriz({ 'Data de Inclusão': '', 'Data de Entrega': '10/06/2025', 'Patrimônio': 'WAP0002222' }), // sem aviso
      ],
      // cast: o tipo já barra: isto é um chamador fora do TS (JSON da action)
      [{ op: 'substituir', campo: 'dataInclusao', de: '', para: '01/03/2025' } as unknown as CorrecaoImport],
    )
    expect(r.correcoes.porOp).toEqual([0]) // não aplicada
    const invalida = r.bloqueantes.find((e) => e.tipo === 'correcao_invalida')
    expect(invalida?.mensagem).toContain('linha a linha')
    // a linha SEM aviso ficou intacta — é isto que a régua protege
    expect(r.plano).toBeNull() // correcao_invalida é bloqueante
  })

  // O caminho legítimo da UI: uma op `editar` por linha do grupo. A linha 3 (sem
  // aviso) não é tocada — o oposto exato do vazamento do teste acima.
  it('data por `editar` linha a linha atinge só as linhas do grupo', () => {
    const r = validar(
      [
        rowMatriz({ 'Data de Inclusão': '', 'Data de Entrega': '' }), // com aviso — linha 2
        rowMatriz({ 'Data de Inclusão': '', 'Data de Entrega': '10/06/2025', 'Patrimônio': 'WAP0002222' }), // sem aviso — linha 3
      ],
      [{ op: 'editar', linha: 2, campo: 'dataInclusao', para: '01/03/2025' }],
    )
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.correcoes.porOp).toEqual([1])
    expect(r.plano!.ativos[0]!.dataEntrada).toBe('2025-03-01')
    // intacta: continua a Entrega dela, não a data digitada no grupo
    expect(r.plano!.ativos[1]!.dataEntrada).toBe('2025-06-10')
  })

  // Achados da revisão adversarial da F7B (17/07/2026) — regressão.
  describe('decisão 4 do Johnny: nenhuma via escreve o Site de outra filial', () => {
    // A régua nascera só no ramo `substituir`; pela via pontual o ativo da Serra
    // entrava como acervo da Matriz — a transferência mascarada que a decisão 4
    // proíbe. O servidor é a primeira linha, não a UI (OS-F7B §8.8).
    it('editar Site de linha que já é de outra filial conhecida → correcao_invalida', () => {
      const r = validar(
        [rowMatriz(), rowMatriz({ Site: 'Serra', 'Patrimônio': 'WAP0002222' })],
        [{ op: 'editar', linha: 3, campo: 'site', para: 'Matriz' }],
      )
      const invalida = r.bloqueantes.find((e) => e.tipo === 'correcao_invalida')
      expect(invalida?.mensagem).toContain('Serra')
      expect(r.correcoes.porOp).toEqual([0]) // não aplicada
      expect(r.plano).toBeNull()
    })

    it('editar Site para uma filial que NÃO é a selecionada → correcao_invalida', () => {
      const r = validar(
        [rowMatriz({ Site: 'Matrz' })],
        [{ op: 'editar', linha: 2, campo: 'site', para: 'Serra' }],
      )
      expect(r.bloqueantes.some((e) => e.tipo === 'correcao_invalida')).toBe(true)
      expect(r.correcoes.porOp).toEqual([0])
    })

    it('editar Site desconhecido (typo) para a filial selecionada CONTINUA valendo', () => {
      const r = validar(
        [rowMatriz({ Site: 'Matrz' })],
        [{ op: 'editar', linha: 2, campo: 'site', para: 'Matriz' }],
      )
      expect(r.bloqueantes).toHaveLength(0)
      expect(r.correcoes.porOp).toEqual([1])
      expect(r.plano!.ativos).toHaveLength(1)
    })
  })

  it('filial fora do De→Para: um card só, informativo, e nenhum card de Site', () => {
    // Uma filial nova cadastrada em admin/filiais não está no De→Para da spec §5.
    // Até a F56, TODO Site divergia e cada linha virava `site_divergente` (o card era
    // informativo desde a revisão da F7B, porque nenhuma correção de Site fechava o
    // erro). Desde a F56 (Frente A) o motor emite UM bloqueante
    // `filial_fora_do_vocabulario` e não confere a coluna Site linha a linha: o
    // defeito é do cadastro, não do arquivo. Este teste mudou por desenho (ata da F56).
    const nova: FilialSelecionada = { id: 9, slug: 'filial-teste', nome: 'Filial Teste' }
    const r = validar([rowMatriz({ Site: 'Filial Teste' })], [], nova)
    expect(r.grupos.some((g) => g.tipo === 'site_divergente')).toBe(false)
    const grupo = r.grupos.find((g) => g.tipo === 'filial_fora_do_vocabulario')
    expect(grupo?.correcao.kind).toBe('nenhuma')
  })

  it('csvCorrigido com a filial NÃO aplica op que o preview recusou', () => {
    // Sem `filialNome` a fachada não rodava a metade "para = a filial selecionada"
    // e o artefato baixado saía com uma transformação que o motor recusou —
    // caminho de lavagem (baixa com Site=Serra, reenvia escolhendo Serra).
    const texto = montar(H_MATRIZ, [rowMatriz({ Site: 'Matriz SM' })])
    const ops: CorrecaoImport[] = [{ op: 'substituir', campo: 'site', de: 'Matriz SM', para: 'Serra' }]
    expect(validarCsvImport(buf(texto), MATRIZ, HOJE, ops).plano).toBeNull() // preview recusa
    expect(csvCorrigido(buf(texto), ops, MATRIZ.nome)).toContain('Matriz SM') // artefato espelha o preview
    expect(csvCorrigido(buf(texto), ops, MATRIZ.nome)).not.toContain('Serra')
  })

  // F7C → F24 — a régua NASCEU bloqueante porque o índice único era GLOBAL e o insert da
  // RPC estourava (bug real, achado no CSV da Serra em 17/07/2026: 6 ativos já estavam em
  // Linhares/Matriz). Desde a migration 0091 a identidade é POR FILIAL: os dois cadastros
  // coexistem, não há colisão a evitar, e o que sobra é uma decisão de negócio. Por isso
  // a DETECÇÃO é idêntica e só o VEREDITO mudou — aviso no lugar de bloqueante.
  describe('ativo que também existe em OUTRA filial (F7C → F24)', () => {
    const chave = (p: string, st: string | null) => `${p}::${st ?? ''}`

    it('AVISA com patrimonio_em_outra_filial, agrupa pela filial dona e o plano APLICA', () => {
      const r = validar(
        [
          rowMatriz(),
          rowMatriz({ 'Patrimônio': 'WAP0002222', 'Service Tag': 'ST-B' }),
        ],
        [],
        MATRIZ,
        new Map([[chave('WAP0002222', 'ST-B'), 'Linhares']]),
      )
      // O tier É o array: nada de bloqueante, e o mesmo erro em `avisos`.
      expect(r.bloqueantes.find((e) => e.tipo === 'patrimonio_em_outra_filial')).toBeUndefined()
      const aviso = r.avisos.find((e) => e.tipo === 'patrimonio_em_outra_filial')
      expect(aviso?.linha).toBe(3)
      expect(aviso?.mensagem).toContain('Linhares')
      expect(aviso?.mensagem).toContain('conflito')

      // O que a F24 existe para destravar: a linha IMPORTA.
      expect(r.plano).not.toBeNull()
      expect(r.plano!.ativos).toHaveLength(2)
      expect(r.resumo.conflitos).toBe(1)

      // O card e o agrupamento por filial dona seguem exatamente como eram.
      const grupo = r.grupos.find((g) => g.tipo === 'patrimonio_em_outra_filial')
      expect(grupo?.chave).toBe('Linhares') // agrupa por filial dona
      expect(grupo?.correcao).toEqual({ kind: 'existe_em_outra_filial', filial: 'Linhares' })
    })

    // F24 — remover a linha continua funcionando; deixou é de ser a ÚNICA saída. Quem
    // remove sai sem conflito nenhum (e sem o ativo); quem não remove importa e resolve
    // na mesa. As duas saídas são legítimas — a diferença é que agora existe escolha.
    it('remover a linha continua sendo uma saída (agora opcional)', () => {
      const r = validar(
        [rowMatriz(), rowMatriz({ 'Patrimônio': 'WAP0002222', 'Service Tag': 'ST-B' })],
        [{ op: 'remover_linha', linha: 3 }],
        MATRIZ,
        new Map([[chave('WAP0002222', 'ST-B'), 'Linhares']]),
      )
      expect(r.bloqueantes).toHaveLength(0)
      expect(r.plano!.ativos.map((a) => a.patrimonio)).toEqual(['WAP0001234'])
      // removida a linha, não sobra conflito para abrir
      expect(r.resumo.conflitos).toBe(0)
      expect(r.avisos.find((e) => e.tipo === 'patrimonio_em_outra_filial')).toBeUndefined()
    })

    it('o par é EXATO: mesmo patrimônio com outra service tag não colide', () => {
      // o índice é (patrimonio, coalesce(service_tag,'')) — casar só por patrimônio
      // acusaria colisão que o banco não teria.
      const r = validar(
        [rowMatriz({ 'Service Tag': 'ST-A' })],
        [],
        MATRIZ,
        new Map([[chave('WAP0001234', 'ST-OUTRA'), 'Linhares']]),
      )
      expect(r.bloqueantes).toHaveLength(0)
      expect(r.plano!.ativos).toHaveLength(1)
    })

    it('mapa vazio (5º arg ausente) = comportamento anterior, byte a byte', () => {
      const linhas = [rowMatriz()]
      expect(validar(linhas, [], MATRIZ, new Map())).toEqual(validar(linhas))
    })

    it('`candidatos` sobrevive ao bloqueante (é o que a action leva ao banco)', () => {
      const r = validar([rowMatriz({ Tipo: 'Notbook' }), rowMatriz({ 'Patrimônio': 'WAP0002222' })])
      expect(r.plano).toBeNull() // categoria_desconhecida bloqueia
      // a linha boa segue candidata: sem isso a action não teria o que perguntar
      expect(r.candidatos).toEqual([{ linha: 3, patrimonio: 'WAP0002222', serviceTag: null }])
    })
  })

  // F7E (OS §2.5) — um card por tipo: patrimonio_invalido/sem_data_entrada/patrimonio_vazio
  // deixam de fragmentar por valor cru.
  describe('F7E — card único por tipo', () => {
    it('N patrimonio_invalido de valores distintos → 1 grupo (chave "")', () => {
      const r = validar([
        rowMatriz({ 'Patrimônio': 'ABC' }),
        rowMatriz({ 'Patrimônio': '12345' }),
        rowMatriz({ 'Patrimônio': '99999' }),
      ])
      const grupos = r.grupos.filter((g) => g.tipo === 'patrimonio_invalido')
      expect(grupos).toHaveLength(1)
      expect(grupos[0]!.chave).toBe('')
      expect(grupos[0]!.linhas).toEqual([2, 3, 4])
      expect(grupos[0]!.correcao).toEqual({ kind: 'patrimonio' })
    })

    it('patrimonio_vazio (aviso) → 1 card com kind patrimonio_vazio; NÃO bloqueia', () => {
      const r = validar([
        rowMatriz({ 'Patrimônio': '' }),
        rowMatriz({ 'Patrimônio': 'n/a', 'Service Tag': 'A' }),
        rowMatriz({ 'Patrimônio': 'SEM PATRIMONIO', 'Service Tag': 'B' }),
      ])
      const grupos = r.grupos.filter((g) => g.tipo === 'patrimonio_vazio')
      expect(grupos).toHaveLength(1)
      expect(grupos[0]!.chave).toBe('')
      expect(grupos[0]!.linhas).toEqual([2, 3, 4])
      expect(grupos[0]!.correcao).toEqual({ kind: 'patrimonio_vazio' })
      expect(r.bloqueantes).toHaveLength(0)
      expect(r.plano).not.toBeNull()
    })
  })

  it('linha_sem_chave: um card só, sem ação (§3.9)', () => {
    const r = validar([
      rowMatriz(),
      { Tipo: 'Notebook', 'Service Tag': 'SOLTA1' },
      { Tipo: 'Monitor', 'Service Tag': 'SOLTA2' },
    ])
    const grupos = r.grupos.filter((g) => g.tipo === 'linha_sem_chave')
    expect(grupos).toHaveLength(1)
    expect(grupos[0]!.linhas).toEqual([3, 4])
    expect(grupos[0]!.correcao).toEqual({ kind: 'nenhuma' })
  })

  it('agruparErros é puro e determinístico (mesma entrada → mesma saída)', () => {
    const registros: RegistroImport[] = []
    const erro = { linha: 2, coluna: 'Tipo', valor: 'Notbook', tipo: 'categoria_desconhecida', mensagem: 'x' }
    expect(agruparErros([erro], [], registros, 'Matriz')).toEqual(agruparErros([erro], [], registros, 'Matriz'))
  })
})

// ===========================================================================

describe('csvCorrigido / csvCorrigidoParaTexto — round-trip', () => {
  it('sem correções ≡ conteúdo lógico do original; header e ordem intactos; SEM BOM', () => {
    const texto = montar(H_MATRIZ, [
      rowMatriz({ Observação: 'nota' }),
      rowMatriz({ 'Patrimônio': 'WAP0009999', Marca: 'Dell' }),
    ])
    const saida = csvCorrigido(buf(texto), [])
    expect(saida.startsWith('﻿')).toBe(false) // quem baixa põe o BOM
    expect(saida.split('\r\n')[0]).toBe(H_MATRIZ) // grafia e ordem do header
    expect(saida).toContain('\r\n')
    expect(parseCsv(saida)).toEqual(parseCsv(texto))
  })

  it('preserva `;`, aspas e reescapa na volta', () => {
    const linha = 'Matriz;Dell;Notebook;"Mod ; 3440";;;WAP0001234;;;;;;Estoque;;;;;"Obs ""boa"""'
    const texto = [H_MATRIZ, linha].join('\n')
    const saida = csvCorrigido(buf(texto), [])
    expect(parseCsv(saida)).toEqual(parseCsv(texto))
    const reg = extrairRegistros(parseCsv(saida)).registros[0]!
    expect(reg.modelo).toBe('Mod ; 3440')
    expect(reg.observacao).toBe('Obs "boa"')
    expect(saida).toContain('"Mod ; 3440"')
    expect(saida).toContain('"Obs ""boa"""')
  })

  it('célula corrigida com `;`/aspas sai escapada e volta idêntica', () => {
    const texto = montar(H_MATRIZ, [rowMatriz()])
    const saida = csvCorrigido(buf(texto), [
      { op: 'editar', linha: 2, campo: 'colaborador', para: 'Fulano; "Ciclano" / TI' },
    ])
    expect(extrairRegistros(parseCsv(saida)).registros[0]!.colaborador).toBe('Fulano; "Ciclano" / TI')
  })

  it('linhas removidas ficam FORA do CSV corrigido', () => {
    const texto = montar(H_MATRIZ, [rowMatriz(), rowMatriz({ 'Patrimônio': 'WAP0002222' })])
    const saida = csvCorrigido(buf(texto), [{ op: 'remover_linha', linha: 2 }])
    expect(saida).not.toContain('WAP0001234')
    expect(saida).toContain('WAP0002222')
    expect(parseCsv(saida).linhas).toHaveLength(1)
  })

  it('o CSV corrigido reimporta LIMPO na primeira análise (facilitador da OS §5.3)', () => {
    const linhas = [
      rowMatriz({ Tipo: 'Notbook', Site: 'Matriz SM' }),
      rowMatriz({ Tipo: 'Notbook', Site: 'Matriz SM', 'Patrimônio': 'WAP0002222' }),
      rowMatriz({ 'Patrimônio': 'WAP0003333', Situação: 'Descarte' }),
    ]
    const correcoes: CorrecaoImport[] = [
      { op: 'substituir', campo: 'site', de: 'Matriz SM', para: 'Matriz' },
      { op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' },
      { op: 'remover_linha', linha: 4 },
    ]
    const original = buf(montar(H_MATRIZ, linhas))
    const comCorrecoes = validarCsvImport(original, MATRIZ, HOJE, correcoes)
    expect(comCorrecoes.bloqueantes).toHaveLength(0)

    const texto = csvCorrigido(original, correcoes)
    const reimport = validarCsvImport(buf(texto), MATRIZ, HOJE)
    expect(reimport.bloqueantes).toHaveLength(0)
    expect(reimport.plano!.ativos).toHaveLength(2)
    expect(reimport.plano!.ativos.map((a) => a.patrimonio)).toEqual(['WAP0001234', 'WAP0002222'])
    // mesmos ativos do preview corrigido — o artefato baixado é o que foi importado
    expect(reimport.plano!.ativos).toEqual(comCorrecoes.plano!.ativos)
  })

  it('csvCorrigidoParaTexto aceita header com caractere especial sem quebrar o round-trip', () => {
    const csv = parseCsv(['a;"b;c";d', '1;2;3'].join('\n'))
    expect(parseCsv(csvCorrigidoParaTexto(csv))).toEqual(csv)
  })
})

// ===========================================================================

describe('validarCsvImport com correções — o ciclo do preview', () => {
  it('correção em massa: 1 op resolve N linhas e o plano fica aplicável', () => {
    const data = { 'Data de Inclusão': '15/12/2024' }
    const r = validar(
      [
        rowMatriz({ Site: 'Matriz SM', ...data }),
        rowMatriz({ Site: 'Matriz SM', 'Patrimônio': 'WAP0002222', ...data }),
        rowMatriz({ Site: 'Matriz SM', 'Patrimônio': 'WAP0003333', ...data }),
      ],
      [{ op: 'substituir', campo: 'site', de: 'Matriz SM', para: 'Matriz' }],
    )
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.correcoes).toEqual({ aplicadas: 1, porOp: [3] })
    expect(r.plano!.ativos).toHaveLength(3)
    expect(r.grupos).toHaveLength(0)
  })

  it('arquivoHash continua sendo o do arquivo ORIGINAL (invariante da F7)', () => {
    const conserta: CorrecaoImport[] = [{ op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' }]
    const original = buf(montar(H_MATRIZ, [rowMatriz({ Tipo: 'Notbook' })]))

    expect(validarCsvImport(original, MATRIZ, HOJE).plano).toBeNull() // categoria_desconhecida
    const comCorrecao = validarCsvImport(original, MATRIZ, HOJE, conserta)
    expect(comCorrecao.plano).not.toBeNull()

    // hash do plano corrigido == hash do buffer enviado (o mesmo de um CSV que já
    // viesse limpo) e != hash do CSV corrigido reserializado.
    const jaLimpo = validarCsvImport(buf(montar(H_MATRIZ, [rowMatriz()])), MATRIZ, HOJE)
    expect(comCorrecao.plano!.arquivoHash).toBe(hashConteudo(original))
    expect(comCorrecao.plano!.arquivoHash).not.toBe(jaLimpo.plano!.arquivoHash)

    const doCorrigido = validarCsvImport(buf(csvCorrigido(original, conserta)), MATRIZ, HOJE)
    expect(comCorrecao.plano!.arquivoHash).not.toBe(doCorrigido.plano!.arquivoHash)
    // ...e a lista de correções muda o plano, nunca o hash
    expect(validarCsvImport(original, MATRIZ, HOJE, [{ op: 'remover_linha', linha: 2 }]).resumo.linhasRemovidas).toBe(1)
  })

  it('correção que cria duplicata → par_duplicado na reanálise (§8.1)', () => {
    const r = validar(
      [
        rowMatriz({ 'Patrimônio': 'WAP0001234', 'Service Tag': 'SVC1' }),
        rowMatriz({ 'Patrimônio': 'WAP0009999', 'Service Tag': 'SVC1' }),
      ],
      [{ op: 'editar', linha: 3, campo: 'patrimonio', para: 'WAP0001234' }],
    )
    expect(r.correcoes.porOp).toEqual([1])
    expect(r.bloqueantes.filter((e) => e.tipo === 'par_duplicado')).toHaveLength(2)
    expect(r.plano).toBeNull()
    expect(r.grupos.find((g) => g.tipo === 'par_duplicado')!.correcao).toEqual({ kind: 'duplicata' })
  })

  it('remover linha resolve a duplicata (§8.5)', () => {
    const linhas = [
      rowMatriz({ 'Patrimônio': 'WAP0001234', 'Service Tag': 'SVC1' }),
      rowMatriz({ 'Patrimônio': 'WAP0001234', 'Service Tag': 'SVC1' }),
    ]
    expect(validar(linhas).bloqueantes.filter((e) => e.tipo === 'par_duplicado')).toHaveLength(2)
    const r = validar(linhas, [{ op: 'remover_linha', linha: 3 }])
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos).toHaveLength(1)
    expect(r.resumo.linhasRemovidas).toBe(1)
  })

  it('todas as linhas removidas → bloqueante plano_vazio (§8.4)', () => {
    const r = validar([rowMatriz(), rowMatriz({ 'Patrimônio': 'WAP0002222' })], [
      { op: 'remover_linha', linha: 2 },
      { op: 'remover_linha', linha: 3 },
    ])
    expect(r.plano).toBeNull()
    expect(r.bloqueantes.filter((e) => e.tipo === 'plano_vazio')).toHaveLength(1)
    expect(r.resumo.criar).toBe(0)
    expect(r.resumo.linhasRemovidas).toBe(2)
    expect(r.grupos.find((g) => g.tipo === 'plano_vazio')!.correcao).toEqual({ kind: 'nenhuma' })
  })

  it('desfazer a correção reabre o erro (a lista de ops é o estado inteiro)', () => {
    const linhas = [rowMatriz({ Tipo: 'Notbook' })]
    const corrigido = validar(linhas, [{ op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' }])
    expect(corrigido.bloqueantes).toHaveLength(0)
    const desfeito = validar(linhas, []) // a UI só remove a op da lista
    expect(desfeito.bloqueantes.filter((e) => e.tipo === 'categoria_desconhecida')).toHaveLength(1)
  })

  it('correções valem para AVISOS (decisão 2 do Johnny) e avisos nunca bloqueiam', () => {
    const r = validar(
      [rowMatriz({ Status: 'Saída', 'Data de Inclusão': '' })],
      [
        { op: 'editar', linha: 2, campo: 'colaborador', para: 'Fulano de Tal / TI' },
        { op: 'editar', linha: 2, campo: 'dataInclusao', para: '10/01/2025' },
      ],
    )
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.avisos).toHaveLength(0)
    expect(r.correcoes.porOp).toEqual([1, 1])
    const a = r.plano!.ativos[0]!
    expect(a.colaborador).toBe('Fulano de Tal')
    expect(a.setor).toBe('TI')
    expect(a.dataEntrada).toBe('2025-01-10')
    expect(r.resumo.semData).toBe(0)
  })

  it('data inválida/futura na correção NÃO passa como conserto: o aviso continua', () => {
    // A validade da data é do Zod do W3 (contrato §1.5); se algo escapar, o motor
    // simplesmente não a reconhece — nunca vira dataEntrada.
    const invalida = validar([rowMatriz({ 'Data de Inclusão': '' })], [
      { op: 'editar', linha: 2, campo: 'dataInclusao', para: '31/02/2025' },
    ])
    expect(invalida.correcoes.porOp).toEqual([1])
    expect(invalida.plano!.ativos[0]!.dataEntrada).toBeNull()
    expect(invalida.avisos.some((e) => e.tipo === 'sem_data_entrada')).toBe(true)

    const futura = validar([rowMatriz({ 'Data de Inclusão': '' })], [
      { op: 'editar', linha: 2, campo: 'dataInclusao', para: '01/01/2099' },
    ])
    expect(futura.plano!.ativos[0]!.dataEntrada).toBeNull()
    expect(futura.avisos.some((e) => e.tipo === 'sem_data_entrada')).toBe(true)
  })

  it('contexto traz o registro CORRIGIDO, só das linhas com erro/aviso', () => {
    const data = { 'Data de Inclusão': '15/12/2024' }
    const r = validar([
      rowMatriz({ 'Patrimônio': 'ABC', Marca: 'Dell', Modelo: 'Latitude 3440', Hostname: 'NB-TESTE', ...data }),
      rowMatriz({ 'Patrimônio': 'WAP0002222', ...data }), // linha limpa: fica fora do contexto
    ])
    expect(Object.keys(r.contexto)).toEqual(['2'])
    expect(r.contexto[2]!.marca).toBe('Dell')
    expect(r.contexto[2]!.hostname).toBe('NB-TESTE')
    expect(r.contexto[2]!.patrimonio).toBe('ABC')

    const corrigido = validar(
      [
        rowMatriz({ 'Patrimônio': 'ABC', Tipo: 'Impressora', ...data }),
        rowMatriz({ 'Patrimônio': 'WAP0002222', ...data }),
      ],
      [{ op: 'editar', linha: 2, campo: 'patrimonio', para: 'WAP0004491' }],
    )
    // ainda com erro (categoria), mas o contexto mostra o patrimônio JÁ corrigido
    expect(corrigido.contexto[2]!.patrimonio).toBe('WAP0004491')
  })

  it('header_invalido: correções não se aplicam, 1 grupo sem ação (§8.6)', () => {
    const header = H_MATRIZ.split(';').filter((c) => c !== 'Patrimônio').join(';')
    const r = validarCsvImport(buf(montar(header, [])), MATRIZ, HOJE, [
      { op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' },
      { op: 'remover_linha', linha: 2 },
    ])
    expect(r.bloqueantes).toHaveLength(1)
    expect(r.bloqueantes[0]!.tipo).toBe('header_invalido')
    expect(r.grupos).toHaveLength(1)
    expect(r.grupos[0]!.correcao).toEqual({ kind: 'nenhuma' })
    expect(r.correcoes).toEqual({ aplicadas: 0, porOp: [0, 0] })
    expect(r.resumo.linhasRemovidas).toBe(0)
  })

  it('correção órfã: porOp 0 → a UI marca "sem efeito" (§8.2)', () => {
    const r = validar([rowMatriz({ Tipo: 'Notbook' })], [
      { op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' },
      { op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Monitor' }, // o valor sumiu
    ])
    expect(r.correcoes).toEqual({ aplicadas: 1, porOp: [1, 0] })
    expect(r.plano!.ativos[0]!.categoria).toBe('notebook')
  })

  it('cap 300 é do Zod do W3 — o motor não quebra se vier mais', () => {
    const muitas: CorrecaoImport[] = Array.from({ length: 350 }, () => ({
      op: 'substituir',
      campo: 'tipo',
      de: 'Notbook',
      para: 'Notebook',
    }))
    const r = validar([rowMatriz({ Tipo: 'Notbook' })], muitas)
    expect(r.correcoes.porOp).toHaveLength(350)
    expect(r.correcoes.aplicadas).toBe(1) // a 1ª aplica; as outras são órfãs
    expect(r.bloqueantes).toHaveLength(0)
  })

  it('correção de estado em massa resolve o descartado trocando a Situação', () => {
    const r = validar(
      [
        rowMatriz({ Situação: 'Descarte' }),
        rowMatriz({ Situação: 'Descarte', 'Patrimônio': 'WAP0002222' }),
      ],
      [
        {
          op: 'substituir_estado',
          statusDe: 'Estoque',
          situacaoDe: 'Descarte',
          para: SITUACAO_CANONICA.em_triagem,
        },
      ],
    )
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.correcoes.porOp).toEqual([2])
    expect(r.plano!.ativos.map((a) => a.estadoAlvo)).toEqual(['em_triagem', 'em_triagem'])
  })
})

// ===========================================================================

describe('retrocompatibilidade F7 — sem correções, nada muda', () => {
  const linhas = [
    rowMatriz({ Marca: 'Dell', 'Data de Inclusão': '15/12/2024' }),
    rowMatriz({ 'Patrimônio': 'ABC' }),
    rowMatriz({ 'Patrimônio': 'WAP0003333', Tipo: 'Impressora' }),
  ]

  it('2, 3 e 4 argumentos (com lista vazia) dão o MESMO resultado', () => {
    const texto = montar(H_MATRIZ, linhas)
    const dois = validarCsvImport(buf(texto), MATRIZ)
    const tres = validarCsvImport(buf(texto), MATRIZ, HOJE)
    const quatro = validarCsvImport(buf(texto), MATRIZ, HOJE, [])
    expect(tres).toEqual(quatro)
    expect(dois.bloqueantes).toEqual(tres.bloqueantes)
    expect(dois.plano).toEqual(tres.plano)
  })

  it('os campos novos do retorno são neutros quando não há correção', () => {
    const r = validar(linhas)
    expect(r.correcoes).toEqual({ aplicadas: 0, porOp: [] })
    expect(r.resumo.linhasRemovidas).toBe(0)
    expect(r.bloqueantes.some((e) => e.tipo === 'plano_vazio')).toBe(false)
    expect(r.bloqueantes.some((e) => e.tipo === 'correcao_invalida')).toBe(false)
    // a régua da F7 intacta: os mesmos bloqueantes de sempre
    expect(r.bloqueantes.map((e) => e.tipo).sort()).toEqual(['categoria_desconhecida', 'patrimonio_invalido'])
  })

  it('CSV limpo sem correções continua aplicável e sem grupos', () => {
    const r = validar([rowMatriz({ 'Data de Inclusão': '15/12/2024' })])
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.avisos).toHaveLength(0)
    expect(r.grupos).toHaveLength(0)
    expect(r.contexto).toEqual({})
    expect(r.plano!.ativos).toHaveLength(1)
    // F24 — `conflitos: 0` é a prova de §2.2: um CSV SEM conflito sai byte a byte igual
    // ao que saía antes da fase (mesmos erros, avisos, grupos, plano e contagens).
    expect(r.resumo).toEqual({ conflitos: 0, criar: 1, semData: 0, semPatrimonio: 0, semServiceTag: 1, patrimonioDoHostname: 0, layout: 'matriz', linhasRemovidas: 0 })
  })

  it('CSV vazio (0 linhas de dados) sem correções: comportamento da F7 preservado', () => {
    // plano_vazio é da F7B e só dispara quando houve REMOÇÃO — a RPC segue sendo
    // a guarda do plano sem ativos vindo de um arquivo vazio.
    const r = validarCsvImport(buf(montar(H_MATRIZ, [])), MATRIZ, HOJE)
    expect(r.bloqueantes).toHaveLength(0)
    expect(r.plano!.ativos).toHaveLength(0)
    expect(r.resumo.linhasRemovidas).toBe(0)
  })
})
