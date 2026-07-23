import { describe, it, expect } from 'vitest'
import {
  camposVisiveis,
  derivarOpcoesCampo,
  filtrarLinhas,
  agregarResumo,
  chaveResumoMotivo,
  nomeParamFiltro,
  lerFiltrosDaQuery,
  escreverFiltrosNaQuery,
  limparFiltrosNaQuery,
  sanitizarFiltros,
  decidirFiltros,
  PREFIXO_FILTROS,
  type CampoFiltro,
} from '@/components/relatorios/use-filtros-tabela'

// Rede de paridade do núcleo puro do `useFiltrosTabela` (OS tech-debt 3.2). A
// verificação de Ut/UX é visual (/verify), mas estas funções carregam a lógica
// que precisa continuar idêntica: derivação de opções (ordem!), filtragem e o
// resumo top-12. Testes deterministas, sem React.
// F11/T10: somam-se os casos da (de)serialização dos filtros na URL — o estado
// saiu do `useState` e passou a morar nos searchParams, com prefixo por tabela.

type Linha = {
  filial: string
  categoria: 'notebook' | 'celular' | 'monitor' | 'desktop' | 'tablet' | 'outro'
  motivo: string | null
  tipo: 'saida' | 'devolucao' | 'compra' | 'emprestimo'
}

const linha = (p: Partial<Linha>): Linha => ({
  filial: 'Matriz',
  categoria: 'notebook',
  motivo: 'Novo colaborador',
  tipo: 'saida',
  ...p,
})

describe('camposVisiveis', () => {
  const campos: CampoFiltro[] = ['filial', 'categoria', 'motivo']

  it('esconde a filial fora do consolidado', () => {
    expect(camposVisiveis(campos, false)).toEqual(['categoria', 'motivo'])
    expect(camposVisiveis(campos, undefined)).toEqual(['categoria', 'motivo'])
  })

  it('mostra a filial no consolidado', () => {
    expect(camposVisiveis(campos, true)).toEqual(['filial', 'categoria', 'motivo'])
  })

  it('preserva a ordem declarada dos demais campos', () => {
    expect(camposVisiveis(['filial', 'categoria', 'tipo'], true)).toEqual([
      'filial',
      'categoria',
      'tipo',
    ])
  })
})

describe('derivarOpcoesCampo', () => {
  it('categoria = ordem canônica fixa (todas, mesmo ausentes nos dados)', () => {
    const opcoes = derivarOpcoesCampo([linha({ categoria: 'monitor' })], 'categoria')
    expect(opcoes.map((o) => o.valor)).toEqual([
      'notebook',
      'celular',
      'monitor',
      'desktop',
      'tablet',
      'outro',
    ])
    expect(opcoes[0]).toEqual({ valor: 'notebook', rotulo: 'Notebook' })
  })

  it('tipo = ordem de aparição, sem ordenar, sem repetir', () => {
    const rows = [
      linha({ tipo: 'devolucao' }),
      linha({ tipo: 'compra' }),
      linha({ tipo: 'devolucao' }),
    ]
    const opcoes = derivarOpcoesCampo(rows, 'tipo')
    expect(opcoes.map((o) => o.valor)).toEqual(['devolucao', 'compra'])
    expect(opcoes.map((o) => o.rotulo)).toEqual(['Devolução', 'Compra'])
  })

  it('filial = únicos, ordenados pt-BR', () => {
    const rows = [
      linha({ filial: 'São Paulo' }),
      linha({ filial: 'Araucária' }),
      linha({ filial: 'São Paulo' }),
      linha({ filial: 'Matriz' }),
    ]
    const opcoes = derivarOpcoesCampo(rows, 'filial')
    expect(opcoes.map((o) => o.valor)).toEqual(['Araucária', 'Matriz', 'São Paulo'])
  })

  it('motivo = únicos não-nulos, ordenados pt-BR', () => {
    const rows = [
      linha({ motivo: 'Troca' }),
      linha({ motivo: null }),
      linha({ motivo: 'Avaria' }),
      linha({ motivo: 'Troca' }),
    ]
    const opcoes = derivarOpcoesCampo(rows, 'motivo')
    expect(opcoes.map((o) => o.valor)).toEqual(['Avaria', 'Troca'])
  })
})

describe('filtrarLinhas', () => {
  const rows = [
    linha({ filial: 'Matriz', categoria: 'notebook', motivo: 'Troca' }),
    linha({ filial: 'Araucária', categoria: 'celular', motivo: 'Avaria' }),
    linha({ filial: 'Matriz', categoria: 'celular', motivo: null }),
  ]
  const vazio = { filial: '', categoria: '', motivo: '', tipo: '' }

  it('sem filtro devolve tudo', () => {
    expect(filtrarLinhas(rows, ['filial', 'categoria', 'motivo'], vazio)).toHaveLength(3)
  })

  it('casa exato em um campo', () => {
    const out = filtrarLinhas(rows, ['filial', 'categoria', 'motivo'], { ...vazio, filial: 'Matriz' })
    expect(out).toHaveLength(2)
  })

  it('combina campos (AND)', () => {
    const out = filtrarLinhas(rows, ['filial', 'categoria', 'motivo'], {
      ...vazio,
      filial: 'Matriz',
      categoria: 'celular',
    })
    expect(out).toHaveLength(1)
    expect(out[0].motivo).toBeNull()
  })

  it('motivo nulo é excluído quando há filtro de motivo', () => {
    const out = filtrarLinhas(rows, ['motivo'], { ...vazio, motivo: 'Troca' })
    expect(out).toHaveLength(1)
    expect(out[0].filial).toBe('Matriz')
  })

  it('campos fora da lista ativa não filtram', () => {
    // 'filial' não está nos campos ativos → o valor não restringe.
    const out = filtrarLinhas(rows, ['categoria'], { ...vazio, filial: 'Matriz', categoria: 'celular' })
    expect(out).toHaveLength(2)
  })
})

describe('agregarResumo', () => {
  it('conta por chave e ordena decrescente', () => {
    const rows = [
      linha({ motivo: 'Troca' }),
      linha({ motivo: 'Avaria' }),
      linha({ motivo: 'Troca' }),
      linha({ motivo: 'Troca' }),
    ]
    const out = agregarResumo(rows, (r) => chaveResumoMotivo(r, false))
    expect(out).toEqual([
      ['Troca', 3],
      ['Avaria', 1],
    ])
  })

  it('no consolidado agrupa por "filial · motivo"', () => {
    const rows = [
      linha({ filial: 'Matriz', motivo: 'Troca' }),
      linha({ filial: 'Araucária', motivo: 'Troca' }),
      linha({ filial: 'Matriz', motivo: 'Troca' }),
    ]
    const out = agregarResumo(rows, (r) => chaveResumoMotivo(r, true))
    expect(out).toEqual([
      ['Matriz · Troca', 2],
      ['Araucária · Troca', 1],
    ])
  })

  it('limita a 12 chaves', () => {
    const rows = Array.from({ length: 20 }, (_, i) => linha({ motivo: `Motivo ${i}` }))
    expect(agregarResumo(rows, (r) => chaveResumoMotivo(r, false))).toHaveLength(12)
  })

  it('motivo nulo vira "Outro"', () => {
    const out = agregarResumo([linha({ motivo: null })], (r) => chaveResumoMotivo(r, false))
    expect(out).toEqual([['Outro', 1]])
  })
})

describe('chaveResumoMotivo', () => {
  it('consolidado prefixa a filial; por-filial usa só o motivo', () => {
    expect(chaveResumoMotivo({ filial: 'Matriz', motivo: 'Troca' }, true)).toBe('Matriz · Troca')
    expect(chaveResumoMotivo({ filial: 'Matriz', motivo: 'Troca' }, false)).toBe('Troca')
    expect(chaveResumoMotivo({ filial: 'Matriz', motivo: null }, true)).toBe('Matriz · Outro')
  })
})

// ---------- F11/T10: filtros na URL ----------

const SD = PREFIXO_FILTROS.saidas
const EN = PREFIXO_FILTROS.entradas

describe('PREFIXO_FILTROS', () => {
  it('não repete prefixo entre tabelas (senão duas colidiriam na mesma URL)', () => {
    const valores = Object.values(PREFIXO_FILTROS)
    expect(new Set(valores).size).toBe(valores.length)
  })
})

describe('nomeParamFiltro', () => {
  it('monta `<prefixo>.<campo>`', () => {
    expect(nomeParamFiltro(SD, 'motivo')).toBe('sd.motivo')
    expect(nomeParamFiltro(EN, 'categoria')).toBe('en.categoria')
  })
})

describe('lerFiltrosDaQuery', () => {
  it('query vazia = tudo vazio ("todas")', () => {
    expect(lerFiltrosDaQuery('', SD)).toEqual({ filial: '', categoria: '', motivo: '', tipo: '' })
  })

  it('lê só os params do próprio prefixo', () => {
    const query = 'preset=mes&sd.motivo=Troca&en.motivo=Avaria&mv.tipo=compra'
    expect(lerFiltrosDaQuery(query, SD)).toEqual({
      filial: '',
      categoria: '',
      motivo: 'Troca',
      tipo: '',
    })
    expect(lerFiltrosDaQuery(query, EN).motivo).toBe('Avaria')
  })

  it('aceita a query com o "?" na frente (window.location.search)', () => {
    expect(lerFiltrosDaQuery('?sd.categoria=celular', SD).categoria).toBe('celular')
  })

  it('decodifica valor com espaço e acento', () => {
    const query = escreverFiltrosNaQuery('', SD, { motivo: 'Novo colaborador', filial: 'Araucária' })
    expect(lerFiltrosDaQuery(query, SD).motivo).toBe('Novo colaborador')
    expect(lerFiltrosDaQuery(query, SD).filial).toBe('Araucária')
  })

  it('param vazio equivale a ausente', () => {
    expect(lerFiltrosDaQuery('sd.motivo=', SD).motivo).toBe('')
  })
})

describe('escreverFiltrosNaQuery', () => {
  it('grava o param do campo trocado', () => {
    expect(escreverFiltrosNaQuery('', SD, { motivo: 'Troca' })).toBe('sd.motivo=Troca')
  })

  it('preserva o período e os params da outra tabela', () => {
    const out = escreverFiltrosNaQuery('preset=mes&en.motivo=Avaria', SD, { categoria: 'celular' })
    const params = new URLSearchParams(out)
    expect(params.get('preset')).toBe('mes')
    expect(params.get('en.motivo')).toBe('Avaria')
    expect(params.get('sd.categoria')).toBe('celular')
  })

  it('valor vazio REMOVE o param (nada de "sd.motivo=" pendurado)', () => {
    expect(escreverFiltrosNaQuery('preset=mes&sd.motivo=Troca', SD, { motivo: '' })).toBe(
      'preset=mes',
    )
  })

  it('campo ausente de `mudancas` fica intacto', () => {
    const out = escreverFiltrosNaQuery('sd.motivo=Troca', SD, { categoria: 'notebook' })
    expect(new URLSearchParams(out).get('sd.motivo')).toBe('Troca')
  })

  it('trocas sucessivas se compõem (duas tabelas na mesma URL)', () => {
    let query = escreverFiltrosNaQuery('preset=mes', SD, { motivo: 'Troca' })
    query = escreverFiltrosNaQuery(query, EN, { categoria: 'celular' })
    const params = new URLSearchParams(query)
    expect(params.get('sd.motivo')).toBe('Troca')
    expect(params.get('en.categoria')).toBe('celular')
    expect(params.get('preset')).toBe('mes')
  })
})

describe('limparFiltrosNaQuery', () => {
  it('tira todos os params da tabela e não toca no resto', () => {
    const query = 'preset=mes&sd.filial=Matriz&sd.motivo=Troca&en.motivo=Avaria'
    expect(limparFiltrosNaQuery(query, SD)).toBe('preset=mes&en.motivo=Avaria')
  })

  it('query só com os filtros da tabela fica vazia', () => {
    expect(limparFiltrosNaQuery('sd.motivo=Troca&sd.tipo=saida', SD)).toBe('')
  })
})

describe('sanitizarFiltros', () => {
  const opcoes = {
    categoria: [{ valor: 'celular', rotulo: 'Celular' }],
    motivo: [{ valor: 'Troca', rotulo: 'Troca' }],
  }

  it('mantém o valor que existe entre as opções', () => {
    const out = sanitizarFiltros(
      { filial: '', categoria: 'celular', motivo: 'Troca', tipo: '' },
      opcoes,
      ['categoria', 'motivo'],
    )
    expect(out).toEqual({ filial: '', categoria: 'celular', motivo: 'Troca', tipo: '' })
  })

  it('descarta valor que não existe mais (link antigo, período trocado)', () => {
    const out = sanitizarFiltros(
      { filial: '', categoria: 'celular', motivo: 'Sumiu', tipo: '' },
      opcoes,
      ['categoria', 'motivo'],
    )
    expect(out.motivo).toBe('')
    expect(out.categoria).toBe('celular')
  })

  it('ignora campo fora dos ativos (ex.: filial fora do consolidado)', () => {
    const out = sanitizarFiltros(
      { filial: 'Matriz', categoria: '', motivo: 'Troca', tipo: '' },
      { ...opcoes, filial: [{ valor: 'Matriz', rotulo: 'Matriz' }] },
      ['categoria', 'motivo'],
    )
    expect(out.filial).toBe('')
  })

  it('campo sem opções derivadas não filtra nada', () => {
    const out = sanitizarFiltros(
      { filial: '', categoria: '', motivo: 'Troca', tipo: '' },
      {},
      ['motivo'],
    )
    expect(out.motivo).toBe('')
  })
})

// ---------- F11 (revisão adversarial): descarte que não reativa sozinho ----------

describe('decidirFiltros', () => {
  const ATIVOS: CampoFiltro[] = ['categoria', 'motivo']
  const semTroca = {
    categoria: [{ valor: 'celular', rotulo: 'Celular' }],
    motivo: [{ valor: 'Avaria', rotulo: 'Avaria' }],
  }
  const comTroca = {
    categoria: [{ valor: 'celular', rotulo: 'Celular' }],
    motivo: [
      { valor: 'Avaria', rotulo: 'Avaria' },
      { valor: 'Troca', rotulo: 'Troca' },
    ],
  }
  const url = (p: Partial<Record<CampoFiltro, string>>): Record<CampoFiltro, string> => ({
    filial: '',
    categoria: '',
    motivo: '',
    tipo: '',
    ...p,
  })

  it('primeira decisão aceita o que existe entre as opções', () => {
    const d = decidirFiltros(null, url({ categoria: 'celular', motivo: 'Avaria' }), semTroca, ATIVOS)
    expect(d.aceito.categoria).toBe('celular')
    expect(d.aceito.motivo).toBe('Avaria')
  })

  it('primeira decisão descarta o valor ausente, mas lembra o que a URL dizia', () => {
    const d = decidirFiltros(null, url({ motivo: 'Troca' }), semTroca, ATIVOS)
    expect(d.aceito.motivo).toBe('')
    expect(d.url.motivo).toBe('Troca')
  })

  it('param inalterado devolve a MESMA referência (não reajusta estado no render)', () => {
    const antes = decidirFiltros(null, url({ motivo: 'Avaria' }), semTroca, ATIVOS)
    expect(decidirFiltros(antes, url({ motivo: 'Avaria' }), semTroca, ATIVOS)).toBe(antes)
  })

  it('descarte é pegajoso: o valor reaparecer nas opções NÃO reativa o filtro', () => {
    // Cenário do achado: link colado com `sd.motivo=Troca` num período sem
    // "Troca"; depois o realtime/auto-refresh traz uma saída com esse motivo.
    const antes = decidirFiltros(null, url({ motivo: 'Troca' }), semTroca, ATIVOS)
    const depois = decidirFiltros(antes, url({ motivo: 'Troca' }), comTroca, ATIVOS)
    expect(depois.aceito.motivo).toBe('')
  })

  it('descarte de um campo sobrevive à mudança de OUTRO param', () => {
    const antes = decidirFiltros(null, url({ motivo: 'Troca' }), semTroca, ATIVOS)
    const depois = decidirFiltros(
      antes,
      url({ motivo: 'Troca', categoria: 'celular' }),
      comTroca,
      ATIVOS,
    )
    expect(depois.aceito.categoria).toBe('celular')
    expect(depois.aceito.motivo).toBe('')
  })

  it('param novo refaz a decisão (link, aba de filial, período trocado)', () => {
    const antes = decidirFiltros(null, url({ motivo: 'Troca' }), semTroca, ATIVOS)
    const depois = decidirFiltros(antes, url({ motivo: 'Avaria' }), semTroca, ATIVOS)
    expect(depois.aceito.motivo).toBe('Avaria')
  })

  it('param que some da URL zera o campo', () => {
    const antes = decidirFiltros(null, url({ motivo: 'Avaria' }), semTroca, ATIVOS)
    const depois = decidirFiltros(antes, url({}), semTroca, ATIVOS)
    expect(depois.aceito.motivo).toBe('')
    expect(depois.url.motivo).toBe('')
  })

  it('campo fora dos ativos nunca é aceito (ex.: filial fora do consolidado)', () => {
    const d = decidirFiltros(
      null,
      url({ filial: 'Matriz' }),
      { ...semTroca, filial: [{ valor: 'Matriz', rotulo: 'Matriz' }] },
      ATIVOS,
    )
    expect(d.aceito.filial).toBe('')
    expect(d.url.filial).toBe('Matriz')
  })
})
