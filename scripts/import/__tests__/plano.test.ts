// Testes do plano de carga (consolidação + reconciliação) — dados SINTÉTICOS.
import { describe, expect, it } from 'vitest'
import type { RegistroDevolucao, RegistroInventario, RegistroSaida } from '../parse'
import { montarPlano, type EntradaPlano } from '../plano'

const HOJE = '2026-07-15'

function regInv(o: Partial<RegistroInventario>): RegistroInventario {
  return {
    arquivo: 'inv-teste.csv', linha: 2, site: 'Matriz', marca: 'Dell', tipo: 'Notebook',
    modelo: 'Modelo X', fornecedor: 'WAP', serviceTag: 'TAG00001', patrimonio: 'WAP8001',
    memoria: '8GB', armazenamento: '256GB', processador: 'i5', hostname: 'WAP0008001',
    dataEntrega: '', status: 'Estoque', situacao: 'Guardada', dataInclusao: '10/01/2026',
    colaborador: '', glpi: '', termoAtivos: '', observacao: '', ...o,
  }
}

function regSaida(o: Partial<RegistroSaida>): RegistroSaida {
  return {
    arquivo: 'saida-teste.csv', linha: 2, data: '10/02/2026', unidade: 'Matriz',
    categoria: 'Notebook', marcaModelo: 'Dell Modelo X', patrimonio: 'WAP8001',
    tipoMovimentacao: 'Saída', chamado: '9001', colaboradorSetor: 'Fulana de Tal / Logística',
    tipo: 'Nova Contratação', termoAssinado: 'Sim', ...o,
  }
}

function regDev(o: Partial<RegistroDevolucao>): RegistroDevolucao {
  return {
    arquivo: 'dev-teste.csv', linha: 2, data: '10/03/2026', unidade: 'Matriz',
    categoria: 'Notebook', marcaModelo: 'Dell Modelo X', patrimonio: 'WAP8001',
    colaborador: 'Fulana de Tal', tipoEntrada: 'Devolução', itensFaltantes: 'Certo',
    setor: 'Logística', tipo: 'Desligamento', ...o,
  }
}

function entrada(o: Partial<EntradaPlano>): EntradaPlano {
  return { inventarios: [], saidas: [], devolucoes: [], hoje: HOJE, resolucoes: [], ...o }
}

function planoDe(o: Partial<EntradaPlano>) {
  return montarPlano(entrada(o))
}

describe('consolidação entre abas', () => {
  it('mesmo patrimônio + mesma service tag em 2 arquivos = 1 ativo, com aviso', () => {
    const p = planoDe({
      inventarios: [
        { filialDoArquivo: 'Matriz', registros: [regInv({ arquivo: 'a.csv', site: 'Matriz' })] },
        { filialDoArquivo: 'Serra', registros: [regInv({ arquivo: 'b.csv', site: 'Serra', linha: 5 })] },
      ],
    })
    expect(p.ativos).toHaveLength(1)
    expect(p.inconsistencias.filter((i) => i.tipo === 'ativo_em_multiplas_abas')).toHaveLength(1)
    expect(p.estatisticas.consolidacoesEntreAbas).toBe(1)
  })

  it('Sites divergentes: vence a linha auto-consistente (Site = filial do arquivo)', () => {
    const p = planoDe({
      inventarios: [
        // no arquivo da Matriz a linha diz Serra (não auto-consistente)
        { filialDoArquivo: 'Matriz', registros: [regInv({ arquivo: 'a.csv', site: 'Serra' })] },
        // no arquivo de Serra a linha diz Serra (auto-consistente) → vence
        { filialDoArquivo: 'Serra', registros: [regInv({ arquivo: 'b.csv', site: 'Serra', colaborador: 'Beltrano' })] },
      ],
    })
    expect(p.ativos).toHaveLength(1)
    expect(p.ativos[0]!.filial).toBe('Serra')
  })

  it('o Site da LINHA decide a filial, não o arquivo', () => {
    const p = planoDe({
      inventarios: [{ filialDoArquivo: 'Serra', registros: [regInv({ site: 'Linhares' })] }],
    })
    expect(p.ativos[0]!.filial).toBe('Linhares')
  })
})

describe('duplicidade de patrimônio (ordem 3.1.8)', () => {
  it('tags todas distintas → ativos distintos, sem bloqueante', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [
          regInv({ serviceTag: 'TAG00001' }),
          regInv({ linha: 3, serviceTag: 'TAG00002' }),
        ],
      }],
    })
    expect(p.ativos).toHaveLength(2)
    expect(p.inconsistencias.filter((i) => i.severidade === 'bloqueante')).toHaveLength(0)
  })

  it('tag parcial (uma linha sem tag) → bloqueante patrimonio_duplicado_sem_service_tag', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [regInv({}), regInv({ linha: 3, serviceTag: '' })],
      }],
    })
    const bloq = p.inconsistencias.filter((i) => i.tipo === 'patrimonio_duplicado_sem_service_tag')
    expect(bloq).toHaveLength(1)
    expect(bloq[0]!.severidade).toBe('bloqueante')
  })

  it('resolução "consolidar" funde em 1 ativo e vira aviso', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [regInv({}), regInv({ linha: 3, serviceTag: '', memoria: '16GB', marca: '' })],
      }],
      resolucoes: [{ patrimonio: 'WAP0008001', acao: 'consolidar', nota: 'mesma máquina listada 2x' }],
    })
    expect(p.ativos).toHaveLength(1)
    expect(p.ativos[0]!.serviceTag).toBe('TAG00001')
    expect(p.inconsistencias.filter((i) => i.severidade === 'bloqueante')).toHaveLength(0)
    expect(p.inconsistencias.filter((i) => i.tipo === 'duplicidade_resolvida')).toHaveLength(1)
  })

  it('resolução "pular" descarta as linhas sem tag', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [regInv({}), regInv({ linha: 3, serviceTag: '' })],
      }],
      resolucoes: [{ patrimonio: 'WAP0008001', acao: 'pular' }],
    })
    expect(p.ativos).toHaveLength(1)
    expect(p.ativos[0]!.serviceTag).toBe('TAG00001')
  })
})

describe('inferência e casamento de movimentações', () => {
  it('movimentação de patrimônio fora do inventário → ativo origem=inferido', () => {
    const p = planoDe({ saidas: [regSaida({ patrimonio: 'TEC8009', marcaModelo: 'Dell Notebook Y' })] })
    expect(p.ativos).toHaveLength(1)
    expect(p.ativos[0]).toMatchObject({ origem: 'inferido', patrimonio: 'TEC0008009', marca: 'Dell', filial: 'Matriz' })
    expect(p.inconsistencias.filter((i) => i.tipo === 'ativo_inferido')).toHaveLength(1)
    // compra inicial + saída
    expect(p.movimentacoes.map((m) => m.tipo)).toEqual(['compra', 'saida'])
  })

  it('grafias diferentes do mesmo patrimônio casam pelo canônico (WAP8001 ≡ WAP0008001)', () => {
    const p = planoDe({
      inventarios: [{ filialDoArquivo: 'Matriz', registros: [regInv({ patrimonio: 'WAP0008001' })] }],
      saidas: [regSaida({ patrimonio: 'WAP8001' })],
    })
    expect(p.ativos).toHaveLength(1)
    expect(p.estatisticas.ativosInferidos).toBe(0)
  })

  it('patrimônio duplicado legítimo: desambigua pela categoria', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [
          regInv({ tipo: 'Notebook', serviceTag: 'TAG00001' }),
          regInv({ linha: 3, tipo: 'Monitor', serviceTag: 'TAG00002' }),
        ],
      }],
      saidas: [regSaida({ categoria: 'Monitor' })],
    })
    const saida = p.movimentacoes.find((m) => m.tipo === 'saida')!
    expect(saida.chaveAtivo).toContain('TAG00002')
  })

  it('duplicado sem como desambiguar → movimentação não importada + aviso', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [
          regInv({ serviceTag: 'TAG00001' }),
          regInv({ linha: 3, serviceTag: 'TAG00002' }),
        ],
      }],
      saidas: [regSaida({})],
    })
    expect(p.movimentacoes.filter((m) => m.tipo === 'saida')).toHaveLength(0)
    expect(p.inconsistencias.filter((i) => i.tipo === 'movimentacao_patrimonio_ambiguo')).toHaveLength(1)
  })

  it('linhas exatamente idênticas na mesma planilha → mantém 1 + duplicata_exata', () => {
    const d = regDev({})
    const p = planoDe({
      inventarios: [{ filialDoArquivo: 'Matriz', registros: [regInv({ status: 'Estoque', situacao: 'Guardada' })] }],
      saidas: [regSaida({ data: '10/02/2026' })],
      devolucoes: [d, { ...d, linha: 3 }],
    })
    expect(p.inconsistencias.filter((i) => i.tipo === 'duplicata_exata')).toHaveLength(1)
    expect(p.movimentacoes.filter((m) => m.tipo === 'devolucao')).toHaveLength(1)
  })

  it('Devolução com Tipo de entrada = Compra vira movimentação compra (sem compra inicial duplicada)', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [regInv({ dataInclusao: '10/02/2026', status: 'Remanejo', situacao: 'Saída', colaborador: 'Beltrano' })],
      }],
      devolucoes: [regDev({ data: '10/02/2026', tipoEntrada: 'Compra', tipo: 'Compra' })],
    })
    const compras = p.movimentacoes.filter((m) => m.tipo === 'compra')
    expect(compras).toHaveLength(1)
    expect(compras[0]!.papel).toBe('replay')
  })
})

describe('reconciliação de estado (ordem 3.2.4)', () => {
  it('ativo só de inventário em uso: compra inicial + ajuste final para em_uso', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [regInv({ status: 'Remanejo', situacao: 'Saída ', colaborador: 'Beltrano', glpi: '9100' })],
      }],
    })
    expect(p.movimentacoes.map((m) => m.tipo)).toEqual(['compra', 'ajuste'])
    const ajuste = p.movimentacoes[1]!
    expect(ajuste).toMatchObject({ statusResultante: 'em_uso', chamado: '9100', colaborador: 'Beltrano' })
    expect(ajuste.observacao).toContain('carga go-live')
    // ajuste não seta colaborador no trigger → sincronização pós-carga
    expect(p.sincronizarColaborador).toEqual([{ chaveAtivo: p.ativos[0]!.chave, colaborador: 'Beltrano' }])
    expect(p.estatisticas.ajustesPorFilial).toEqual({ Matriz: 1 })
  })

  it('replay que já leva ao estado da planilha → SEM ajuste', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [regInv({ status: 'Remanejo', situacao: 'Saída', colaborador: 'Fulana de Tal' })],
      }],
      saidas: [regSaida({ colaboradorSetor: 'Fulana de Tal / Logística' })],
    })
    expect(p.movimentacoes.map((m) => m.tipo)).toEqual(['compra', 'saida'])
    expect(p.sincronizarColaborador).toHaveLength(0)
  })

  it('replay inválido para o estado corrente → estado_divergente, pulado, ajuste cobre', () => {
    // devolução sem saída anterior (a saída aconteceu antes da janela jan–jul)
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [regInv({ status: 'Estoque', situacao: 'Guardada' })],
      }],
      devolucoes: [regDev({})],
    })
    expect(p.inconsistencias.filter((i) => i.tipo === 'estado_divergente')).toHaveLength(1)
    // devolução pulada; estado final em_estoque = planilha → sem ajuste
    expect(p.movimentacoes.map((m) => m.tipo)).toEqual(['compra'])
  })

  it('compra inicial usa a data válida mais antiga; sem data válida usa a da 1ª movimentação', () => {
    const p1 = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [regInv({ dataInclusao: '10/01/2026', dataEntrega: '05/01/2026' })],
      }],
    })
    expect(p1.movimentacoes[0]!.data).toBe('2026-01-05')

    const p2 = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [regInv({ dataInclusao: '#######', dataEntrega: '', status: 'Remanejo', situacao: 'Saída' })],
      }],
      saidas: [regSaida({ data: '10/02/2026' })],
    })
    expect(p2.movimentacoes[0]!).toMatchObject({ tipo: 'compra', data: '2026-02-10' })
  })

  it('compra inicial nunca fica DEPOIS da 1ª movimentação do replay', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [regInv({ dataInclusao: '10/03/2026', status: 'Remanejo', situacao: 'Saída', colaborador: 'Fulana de Tal' })],
      }],
      saidas: [regSaida({ data: '10/02/2026', colaboradorSetor: 'Fulana de Tal' })],
    })
    const [compra, saida] = p.movimentacoes
    expect(compra!.tipo).toBe('compra')
    expect(saida!.tipo).toBe('saida')
    expect(compra!.data <= saida!.data).toBe(true)
  })

  it('transferência muda a filial simulada; Site do inventário volta a valer via sincronização', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'CD-Afonso Pena',
        registros: [regInv({ site: 'CD-PENA', status: 'Remanejo', situacao: 'Saída ', colaborador: 'Beltrano' })],
      }],
      saidas: [
        regSaida({ unidade: 'CD-AFP', tipo: 'Transferência Uni.', colaboradorSetor: 'Transferência para Matriz', data: '20/02/2026', chamado: '' }),
        regSaida({ linha: 3, unidade: 'Matriz', data: '25/02/2026', colaboradorSetor: 'Beltrano' }),
      ],
    })
    expect(p.movimentacoes.map((m) => m.tipo)).toEqual(['compra', 'transferencia', 'saida'])
    const transf = p.movimentacoes[1]!
    expect(transf.filialDestino).toBe('Matriz')
    // filial final = Site da linha (CD-Afonso Pena) → sincronização
    expect(p.sincronizarFilial).toEqual([{ chaveAtivo: p.ativos[0]!.chave, filial: 'CD-Afonso Pena' }])
  })

  it('estado da planilha em_uso sem colaborador + replay com colaborador → mantém o do replay', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [regInv({ status: 'Remanejo', situacao: 'Saída', colaborador: '' })],
      }],
      saidas: [regSaida({})],
    })
    expect(p.sincronizarColaborador).toHaveLength(0)
  })

  it('colaborador divergente entre replay e inventário → vence o inventário, com aviso', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [regInv({ status: 'Remanejo', situacao: 'Saída', colaborador: 'Sicrana' })],
      }],
      saidas: [regSaida({ colaboradorSetor: 'Fulana de Tal / Logística' })],
    })
    expect(p.sincronizarColaborador).toEqual([{ chaveAtivo: p.ativos[0]!.chave, colaborador: 'Sicrana' }])
    expect(p.inconsistencias.filter((i) => i.tipo === 'colaborador_divergente')).toHaveLength(1)
  })

  it('todo ativo termina com ≥1 movimentação (premissa da migration 0022)', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [
          regInv({}),
          regInv({ linha: 3, patrimonio: 'WAP8002', serviceTag: 'TAG00002', hostname: 'WAP0008002', status: 'Descarte', situacao: 'Descarte' }),
        ],
      }],
      saidas: [regSaida({ patrimonio: 'TEC8009' })],
    })
    const porAtivo = new Map<string, number>()
    for (const m of p.movimentacoes) porAtivo.set(m.chaveAtivo, (porAtivo.get(m.chaveAtivo) ?? 0) + 1)
    for (const a of p.ativos) expect(porAtivo.get(a.chave) ?? 0, a.patrimonio).toBeGreaterThan(0)
  })

  it('ordem global: cronológica com a cadeia de cada ativo preservada', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [
          regInv({ dataInclusao: '10/01/2026', status: 'Remanejo', situacao: 'Saída', colaborador: 'Fulana de Tal' }),
          regInv({ linha: 3, patrimonio: 'WAP8002', serviceTag: 'TAG00002', hostname: 'WAP0008002', dataInclusao: '05/01/2026' }),
        ],
      }],
      saidas: [regSaida({ colaboradorSetor: 'Fulana de Tal' })],
    })
    const datas = p.movimentacoes.map((m) => m.data)
    expect([...datas].sort()).toEqual(datas)
    const doPrimeiro = p.movimentacoes.filter((m) => m.chaveAtivo.includes('TAG00001')).map((m) => m.tipo)
    expect(doPrimeiro).toEqual(['compra', 'saida'])
  })
})

describe('estados e pendências', () => {
  it('estado fora da tabela → bloqueante estado_desconhecido', () => {
    const p = planoDe({
      inventarios: [{ filialDoArquivo: 'Matriz', registros: [regInv({ status: 'Sumido', situacao: 'Perdido' })] }],
    })
    expect(p.inconsistencias.filter((i) => i.tipo === 'estado_desconhecido' && i.severidade === 'bloqueante')).toHaveLength(1)
  })

  it('Site desconhecido → bloqueante unidade_desconhecida', () => {
    const p = planoDe({
      inventarios: [{ filialDoArquivo: 'Matriz', registros: [regInv({ site: 'Marte' })] }],
    })
    expect(p.inconsistencias.filter((i) => i.tipo === 'unidade_desconhecida' && i.severidade === 'bloqueante')).toHaveLength(1)
  })

  it('sem patrimônio → placeholder com pendência (par único com a service tag)', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [
          regInv({ patrimonio: 'N/A', hostname: '' }),
          regInv({ linha: 3, patrimonio: '', serviceTag: '', hostname: '' }),
        ],
      }],
    })
    expect(p.ativos).toHaveLength(2)
    expect(p.ativos[0]!.patrimonio).toBe('SEMPAT')
    expect(p.ativos[1]!.patrimonio).toMatch(/^SEMPAT-.+-L3$/)
    for (const a of p.ativos) expect(a.pendencia).toContain('sem patrimônio')
  })

  it('patrimônio não parseável entra cru com pendência + aviso', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [regInv({ patrimonio: 'STF008LOC', serviceTag: 'AB12CD34', hostname: '' })],
      }],
    })
    expect(p.ativos[0]!.patrimonio).toBe('STF008LOC')
    expect(p.ativos[0]!.pendencia).toContain('não canônico')
    expect(p.inconsistencias.filter((i) => i.tipo === 'patrimonio_invalido')).toHaveLength(1)
  })

  it('service tag na coluna de patrimônio (colunas trocadas) → corrigido com aviso', () => {
    const p = planoDe({
      inventarios: [{
        filialDoArquivo: 'Matriz',
        registros: [regInv({ patrimonio: 'AB12CD3', serviceTag: 'LEA0008003', hostname: '' })],
      }],
    })
    expect(p.ativos[0]!.patrimonio).toBe('LEA0008003')
    expect(p.ativos[0]!.serviceTag).toBe('AB12CD3')
    expect(p.inconsistencias.filter((i) => i.tipo === 'patrimonio_service_tag_trocados')).toHaveLength(1)
  })

  it('inferência de prefixo por hostname dentro do plano completo', () => {
    const p = planoDe({
      inventarios: [{ filialDoArquivo: 'Matriz', registros: [regInv({ patrimonio: '8001', hostname: 'WAP0008001' })] }],
    })
    expect(p.ativos[0]!.patrimonio).toBe('WAP0008001')
  })
})
