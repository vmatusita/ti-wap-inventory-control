import { describe, expect, it } from 'vitest'
import {
  chaveLinha,
  chaveMassa,
  faltamNoGrupo,
  grupoPronto,
  opsDoGrupo,
  resumoOps,
  type Rascunho,
} from './ops-grupo'
import type { CorrecaoImport, GrupoErro, RegistroImport } from '@/lib/import'

// Dados 100% FICTÍCIOS (WAP0001234 / "Fulano"). O módulo é puro (sem React) — o
// Vitest o pega por src/**/*.test.ts.

function reg(linha: number, over: Partial<RegistroImport> = {}): RegistroImport {
  return {
    linha,
    site: 'Matriz',
    marca: 'Dell',
    tipo: 'Notebook',
    modelo: 'X',
    fornecedor: 'WAP',
    serviceTag: '',
    patrimonio: '',
    memoria: '',
    armazenamento: '',
    processador: '',
    hostname: '',
    dataEntrega: '',
    status: 'Estoque',
    situacao: 'Estoque',
    dataInclusao: '',
    colaborador: '',
    glpi: '',
    observacao: '',
    ...over,
  }
}

function grupo(over: Partial<GrupoErro> & { correcao: GrupoErro['correcao'] }): GrupoErro {
  return { tipo: 'x', chave: '', linhas: [], erros: [], ...over }
}

const FILIAL = 'Matriz'

describe('chaves', () => {
  it('massa e linha são estáveis e distintas', () => {
    const g = grupo({ tipo: 'categoria_desconhecida', chave: 'Notbook', correcao: { kind: 'categoria', sugestao: 'notebook' } })
    expect(chaveMassa(g)).toBe('m|categoria_desconhecida|Notbook')
    expect(chaveLinha(3, 'patrimonio')).toBe('l|3|patrimonio')
    expect(chaveLinha(3, 'patrimonio')).not.toBe(chaveMassa(g))
  })
})

describe('categoria (massa) — a sugestão pré-selecionada conta', () => {
  const g = grupo({
    tipo: 'categoria_desconhecida',
    chave: 'Notbook',
    linhas: [2, 3, 4],
    correcao: { kind: 'categoria', sugestao: 'notebook' },
  })

  it('pronto sem o operador tocar (usa a sugestão) e emite 1 substituir de massa', () => {
    expect(grupoPronto(g, {}, {})).toBe(true)
    expect(opsDoGrupo(g, {}, {}, FILIAL)).toEqual([
      { op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' },
    ])
  })

  it('sem sugestão e sem escolha → não pronto, nenhuma op', () => {
    const semSug = grupo({ ...g, correcao: { kind: 'categoria', sugestao: null } })
    expect(grupoPronto(semSug, {}, {})).toBe(false)
    expect(opsDoGrupo(semSug, {}, {}, FILIAL)).toEqual([])
  })

  it('a escolha do operador sobrepõe a sugestão', () => {
    const r: Rascunho = { [chaveMassa(g)]: 'desktop' }
    expect(opsDoGrupo(g, r, {}, FILIAL)).toEqual([
      { op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Desktop' },
    ])
  })
})

describe('estado (massa)', () => {
  const g = grupo({
    tipo: 'estado_desconhecido',
    chave: 'Ativo␟Xablau',
    linhas: [5],
    correcao: { kind: 'estado', statusDe: 'Ativo', situacaoDe: 'Xablau', sugestao: null },
  })

  it('não pronto sem escolha; pronto e grava o termo canônico ao escolher', () => {
    expect(grupoPronto(g, {}, {})).toBe(false)
    const r: Rascunho = { [chaveMassa(g)]: 'em_estoque' }
    expect(grupoPronto(g, r, {})).toBe(true)
    expect(opsDoGrupo(g, r, {}, FILIAL)).toEqual([
      { op: 'substituir_estado', statusDe: 'Ativo', situacaoDe: 'Xablau', para: 'Estoque' },
    ])
  })
})

describe('site_desconhecido / remoções — ação fixa, sempre pronta', () => {
  it('site desconhecido vira a filial selecionada', () => {
    const g = grupo({ tipo: 'site_divergente', chave: 'Matrz', linhas: [2], correcao: { kind: 'site_desconhecido' } })
    expect(grupoPronto(g, {}, {})).toBe(true)
    expect(opsDoGrupo(g, {}, {}, FILIAL)).toEqual([
      { op: 'substituir', campo: 'site', de: 'Matrz', para: 'Matriz' },
    ])
  })

  it('site de outra filial e "já existe em outra filial" só removem', () => {
    for (const kind of ['site_outra_filial', 'existe_em_outra_filial'] as const) {
      const correcao =
        kind === 'existe_em_outra_filial'
          ? ({ kind, filial: 'Linhares' } as const)
          : ({ kind } as const)
      const g = grupo({ tipo: 't', chave: 'Serra', linhas: [9, 11], correcao })
      expect(grupoPronto(g, {}, {})).toBe(true)
      expect(opsDoGrupo(g, {}, {}, FILIAL)).toEqual([
        { op: 'remover_linha', linha: 9 },
        { op: 'remover_linha', linha: 11 },
      ])
    }
  })
})

// F7F — o botão de seção e o lote GLOBAL passam a incluir grupos pontuais
// PARCIALMENTE preenchidos: `grupoPronto` deixou de ser tudo-ou-nada (`.every`)
// e virou "há ≥1 linha pronta" (`.some`). `opsDoGrupo` já emitia só as prontas.
describe('patrimônio (pontual) — F7F: PARCIAIS entram no lote', () => {
  const contexto = { 2: reg(2, { patrimonio: '1011' }), 3: reg(3, { patrimonio: 'WAP-XYZ' }) }
  const g = grupo({ tipo: 'patrimonio_invalido', chave: '', linhas: [2, 3], correcao: { kind: 'patrimonio' } })

  it('nada preenchido → não pronto, faltam 2, nenhuma op', () => {
    expect(grupoPronto(g, {}, contexto)).toBe(false)
    expect(faltamNoGrupo(g, {}, contexto)).toBe(2)
    expect(opsDoGrupo(g, {}, contexto, FILIAL)).toEqual([])
  })

  it('só uma preenchida → PRONTO (F7F), a op da preenchida sai, faltam 1', () => {
    const r: Rascunho = { [chaveLinha(2, 'patrimonio')]: 'wap 1011' }
    expect(grupoPronto(g, r, contexto)).toBe(true)
    expect(faltamNoGrupo(g, r, contexto)).toBe(1)
    expect(opsDoGrupo(g, r, contexto, FILIAL)).toEqual([
      { op: 'editar', linha: 2, campo: 'patrimonio', para: 'wap 1011' },
    ])
  })

  it('3 linhas, 2 preenchidas válidas → pronto, 2 ops, faltam 1 (exemplo da OS)', () => {
    const ctx3 = {
      2: reg(2, { patrimonio: '1011' }),
      3: reg(3, { patrimonio: '1012' }),
      4: reg(4, { patrimonio: '1013' }),
    }
    const g3 = grupo({
      tipo: 'patrimonio_invalido',
      chave: '',
      linhas: [2, 3, 4],
      correcao: { kind: 'patrimonio' },
    })
    const r: Rascunho = {
      [chaveLinha(2, 'patrimonio')]: 'WAP0001011',
      [chaveLinha(3, 'patrimonio')]: 'WAP0001012',
    }
    expect(grupoPronto(g3, r, ctx3)).toBe(true)
    expect(opsDoGrupo(g3, r, ctx3, FILIAL)).toHaveLength(2)
    expect(faltamNoGrupo(g3, r, ctx3)).toBe(1)
  })

  it('todas preenchidas e canonizáveis → pronto, faltam 0, 2 ops', () => {
    const r: Rascunho = {
      [chaveLinha(2, 'patrimonio')]: 'WAP0001011',
      [chaveLinha(3, 'patrimonio')]: 'WAP0001012',
    }
    expect(grupoPronto(g, r, contexto)).toBe(true)
    expect(faltamNoGrupo(g, r, contexto)).toBe(0)
    expect(opsDoGrupo(g, r, contexto, FILIAL)).toHaveLength(2)
  })

  it('linha não-canônica é excluída, mas ≥1 canônica já deixa o grupo pronto (F7F)', () => {
    const r: Rascunho = { [chaveLinha(2, 'patrimonio')]: 'lixo', [chaveLinha(3, 'patrimonio')]: 'WAP0001012' }
    expect(grupoPronto(g, r, contexto)).toBe(true)
    expect(faltamNoGrupo(g, r, contexto)).toBe(1)
    expect(opsDoGrupo(g, r, contexto, FILIAL)).toEqual([
      { op: 'editar', linha: 3, campo: 'patrimonio', para: 'WAP0001012' },
    ])
  })
})

describe('patrimonio_vazio (aviso, F7E) — opcional, fora do lote, só as preenchidas', () => {
  // Linhas "vazio-na-prática": importam sem patrimônio (pendência). Preencher é
  // opcional — o card fica fora do botão de seção e do lote global (grupoPronto = false).
  const contexto = {
    2: reg(2, { patrimonio: '', serviceTag: 'ST-A' }),
    3: reg(3, { patrimonio: 'SEM PATRIMONIO', serviceTag: 'ST-B' }),
  }
  const g = grupo({
    tipo: 'patrimonio_vazio',
    chave: '',
    linhas: [2, 3],
    correcao: { kind: 'patrimonio_vazio' },
  })

  it('nunca fica pronto (preencher é opcional) e faltam = 0', () => {
    expect(grupoPronto(g, {}, contexto)).toBe(false)
    expect(faltamNoGrupo(g, {}, contexto)).toBe(0)
    expect(opsDoGrupo(g, {}, contexto, FILIAL)).toEqual([])
  })

  it('emite editar só das linhas preenchidas com patrimônio canônico', () => {
    // linha 2 preenchida (canoniza → WAP0001234); linha 3 fica em branco.
    const r: Rascunho = { [chaveLinha(2, 'patrimonio')]: 'wap 1234' }
    expect(grupoPronto(g, r, contexto)).toBe(false)
    expect(opsDoGrupo(g, r, contexto, FILIAL)).toEqual([
      { op: 'editar', linha: 2, campo: 'patrimonio', para: 'wap 1234' },
    ])
  })

  it('valor preenchido que não canoniza não é emitido', () => {
    const r: Rascunho = { [chaveLinha(2, 'patrimonio')]: 'lixo' }
    expect(opsDoGrupo(g, r, contexto, FILIAL)).toEqual([])
  })
})

describe('data (pontual) — futura/inválida não deixa pronto', () => {
  const contexto = { 2: reg(2, { patrimonio: 'WAP0001234', dataInclusao: '' }) }
  const g = grupo({ tipo: 'sem_data_entrada', chave: '', linhas: [2], correcao: { kind: 'data' } })

  it('vazio não fica pronto', () => {
    expect(grupoPronto(g, {}, contexto)).toBe(false)
  })

  it('data futura não fica pronta', () => {
    const r: Rascunho = { [chaveLinha(2, 'dataInclusao')]: '01/01/2099' }
    expect(grupoPronto(g, r, contexto)).toBe(false)
  })

  it('data válida fica pronta e emite editar dataInclusao', () => {
    const r: Rascunho = { [chaveLinha(2, 'dataInclusao')]: '10/01/2025' }
    expect(grupoPronto(g, r, contexto)).toBe(true)
    expect(opsDoGrupo(g, r, contexto, FILIAL)).toEqual([
      { op: 'editar', linha: 2, campo: 'dataInclusao', para: '10/01/2025' },
    ])
  })
})

describe('colaborador (pontual) — igual ao original não conta', () => {
  const contexto = { 2: reg(2, { patrimonio: 'WAP0001234', colaborador: '' }) }
  const g = grupo({ tipo: 'estado_em_uso_sem_colaborador', chave: '', linhas: [2], correcao: { kind: 'colaborador' } })

  it('preenchido fica pronto', () => {
    const r: Rascunho = { [chaveLinha(2, 'colaborador')]: 'Fulano de Tal / TI' }
    expect(grupoPronto(g, r, contexto)).toBe(true)
    expect(opsDoGrupo(g, r, contexto, FILIAL)).toEqual([
      { op: 'editar', linha: 2, campo: 'colaborador', para: 'Fulano de Tal / TI' },
    ])
  })
})

describe('duplicata / nenhuma — nunca entram no lote', () => {
  it('duplicata não fica pronta e não emite nada pelo lote', () => {
    const g = grupo({ tipo: 'par_duplicado', chave: '', linhas: [14, 15], correcao: { kind: 'duplicata' } })
    expect(grupoPronto(g, {}, {})).toBe(false)
    expect(opsDoGrupo(g, {}, {}, FILIAL)).toEqual([])
  })

  it('nenhuma nunca', () => {
    const g = grupo({ tipo: 'header_invalido', chave: '', linhas: [1], correcao: { kind: 'nenhuma' } })
    expect(grupoPronto(g, {}, {})).toBe(false)
    expect(opsDoGrupo(g, {}, {}, FILIAL)).toEqual([])
  })
})

describe('resumoOps — remoção primeiro, pt-BR', () => {
  it('conta e ordena', () => {
    const ops: CorrecaoImport[] = [
      { op: 'editar', linha: 2, campo: 'patrimonio', para: 'WAP0001011' },
      { op: 'editar', linha: 3, campo: 'patrimonio', para: 'WAP0001012' },
      { op: 'substituir', campo: 'tipo', de: 'Notbook', para: 'Notebook' },
      { op: 'remover_linha', linha: 9 },
      { op: 'remover_linha', linha: 11 },
      { op: 'substituir_estado', statusDe: 'A', situacaoDe: 'B', para: 'Estoque' },
    ]
    expect(resumoOps(ops)).toBe('2 linhas removidas · 1 tipo · 1 estado · 2 patrimônios')
  })

  it('singular e vazio', () => {
    expect(resumoOps([{ op: 'remover_linha', linha: 9 }])).toBe('1 linha removida')
    expect(resumoOps([])).toBe('')
  })
})
