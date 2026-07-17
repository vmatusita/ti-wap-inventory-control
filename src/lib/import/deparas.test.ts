import { describe, expect, it } from 'vitest'
import {
  CATEGORIAS_TERMOS,
  ESTADOS_CORRIGIVEIS,
  SITUACAO_CANONICA,
  TIPO_CANONICO,
  chaveServiceTag,
  estadoPlanilha,
  extrairChamado,
  filialPorSlug,
  limparCampo,
  mapearCategoria,
  mapearUnidade,
  normalizarHeader,
  normalizarServiceTag,
  normalizarTexto,
  parseColaboradorInventario,
  parseData,
  patrimonioVazio,
  resolverDataEntrega,
} from './deparas'
import type { CategoriaAtivo, StatusAtivo } from './tipos'

// Nenhum dado real — tudo fictício (padrão WAP0001234 / "Fulano").

describe('normalizarTexto / normalizarHeader', () => {
  it('remove acento, minúsculas, `:` final e colapsa espaços', () => {
    expect(normalizarTexto('Situação:')).toBe('situacao')
    expect(normalizarTexto('  Data   de   Inclusão  ')).toBe('data de inclusao')
    expect(normalizarTexto('Patrimônio')).toBe('patrimonio')
  })
  it('normalizarHeader tira `:`/espaços à direita (headers reais têm `Site:`)', () => {
    expect(normalizarHeader('Site:')).toBe('site')
    expect(normalizarHeader('Data de Entrega ')).toBe('data de entrega')
    expect(normalizarHeader('Observação')).toBe('observacao')
  })
})

describe('limparCampo', () => {
  it('vazio-na-prática → null; senão aparado', () => {
    expect(limparCampo('-')).toBeNull()
    expect(limparCampo('N/A')).toBeNull()
    expect(limparCampo('0')).toBeNull()
    expect(limparCampo('')).toBeNull()
    expect(limparCampo('   ')).toBeNull()
    expect(limparCampo('  Dell  Latitude ')).toBe('Dell Latitude')
  })
})

describe('mapearUnidade (De→Para de unidades, spec §5 ampliado)', () => {
  it('aplica os apelidos reais das planilhas', () => {
    expect(mapearUnidade('Serra Park')).toBe('Serra')
    expect(mapearUnidade('Filial-CE')).toBe('Eusébio')
    expect(mapearUnidade('CD-PENA')).toBe('CD-Afonso Pena')
    expect(mapearUnidade('Afonso Pena')).toBe('CD-Afonso Pena')
    expect(mapearUnidade('Matriz ')).toBe('Matriz')
    expect(mapearUnidade('Filial - Linhares')).toBe('Linhares')
  })
  it('desconhecido → null', () => {
    expect(mapearUnidade('Fábrica X')).toBeNull()
    expect(mapearUnidade('')).toBeNull()
  })
})

describe('filialPorSlug', () => {
  it('slug do banco → filial oficial', () => {
    expect(filialPorSlug('cd-afonso-pena')).toBe('CD-Afonso Pena')
    expect(filialPorSlug('matriz')).toBe('Matriz')
    expect(filialPorSlug('eusebio')).toBe('Eusébio')
    expect(filialPorSlug('inexistente')).toBeNull()
  })
})

describe('mapearCategoria (Tipo → enum; desconhecido = null p/ bloqueante)', () => {
  it('conhecidos', () => {
    expect(mapearCategoria('Notebook')).toBe('notebook')
    expect(mapearCategoria('CELULAR')).toBe('celular')
    expect(mapearCategoria('Monitor')).toBe('monitor')
  })
  it('desconhecido/vazio → null (F7 §3 bloqueia)', () => {
    expect(mapearCategoria('Teclado')).toBeNull()
    expect(mapearCategoria('')).toBeNull()
  })
})

describe('estadoPlanilha (precedência Situação > Status — DECISOES 15/07)', () => {
  it('Situação vence quando preenchida', () => {
    expect(estadoPlanilha('Estoque', 'Descarte')).toBe('descartado')
    expect(estadoPlanilha('Estoque', 'Manutenção')).toBe('em_manutencao')
  })
  it('sem Situação → Status', () => {
    expect(estadoPlanilha('Remanejo', '')).toBe('em_uso')
    expect(estadoPlanilha('Estoque', '')).toBe('em_estoque')
  })
  it('fora da tabela → null', () => {
    expect(estadoPlanilha('Foo', '')).toBeNull()
    expect(estadoPlanilha('', '')).toBeNull()
  })
})

// F7B — tabelas canônicas reversas: o que a tela GRAVA na célula tem que voltar
// ao estado/categoria pretendido pelo mesmo De→Para que valida o CSV.
describe('SITUACAO_CANONICA (F7B §3.4) — ciclo fechado com estadoPlanilha', () => {
  const ESPERADOS: Exclude<StatusAtivo, 'descartado'>[] = [
    'em_estoque',
    'em_uso',
    'reservado',
    'emprestado',
    'em_triagem',
    'em_manutencao',
    'defasado',
  ]

  it('cobre os 7 estados (descartado fica de fora — continua bloqueante)', () => {
    expect(Object.keys(SITUACAO_CANONICA).sort()).toEqual([...ESPERADOS].sort())
    expect(Object.keys(SITUACAO_CANONICA)).not.toContain('descartado')
  })

  it.each(ESPERADOS)('%s → termo → volta ao mesmo estado (Situação vence Status)', (estado) => {
    const termo = SITUACAO_CANONICA[estado]
    expect(estadoPlanilha('', termo)).toBe(estado)
    // Situação preenchida vence QUALQUER Status na linha — é o que faz a
    // correção em massa de estado funcionar gravando só em Situação.
    expect(estadoPlanilha('Descarte', termo)).toBe(estado)
  })

  it('os termos canônicos são exatamente os da OS-F7B §3.4', () => {
    expect(SITUACAO_CANONICA).toEqual({
      em_estoque: 'Estoque',
      em_uso: 'Saída',
      reservado: 'Reservado',
      emprestado: 'Empréstimo',
      em_triagem: 'Validar',
      em_manutencao: 'Manutenção',
      defasado: 'Defasado',
    })
  })

  it('todo termo canônico está entre os corrigíveis; nenhum corrigível vira descartado', () => {
    for (const termo of Object.values(SITUACAO_CANONICA)) {
      expect(ESTADOS_CORRIGIVEIS).toContain(normalizarTexto(termo))
    }
    for (const termo of ESTADOS_CORRIGIVEIS) {
      expect(estadoPlanilha('', termo)).not.toBe('descartado')
      expect(estadoPlanilha('', termo)).not.toBeNull()
    }
    expect(ESTADOS_CORRIGIVEIS).not.toContain('descarte')
    expect(ESTADOS_CORRIGIVEIS).not.toContain('descartado')
  })
})

describe('TIPO_CANONICO (F7B) — ciclo fechado com mapearCategoria', () => {
  it.each(['notebook', 'desktop', 'monitor', 'celular', 'tablet'] as Exclude<
    CategoriaAtivo,
    'outro'
  >[])('%s → termo → volta à mesma categoria', (categoria) => {
    expect(mapearCategoria(TIPO_CANONICO[categoria])).toBe(categoria)
  })

  it('todo termo do vocabulário mapeia; `outro` não é alcançável pelo CSV', () => {
    for (const termo of CATEGORIAS_TERMOS) expect(mapearCategoria(termo)).not.toBeNull()
    expect(Object.keys(TIPO_CANONICO)).not.toContain('outro')
  })
})

describe('parseData (espelho F4: só dd/mm/aaaa; futura sinalizada)', () => {
  const hoje = '2026-07-16'
  it('data válida → iso', () => {
    expect(parseData('15/12/2025', hoje)).toEqual({ iso: '2025-12-15', invalida: false, futura: false })
  })
  it('futura → iso + futura true', () => {
    const r = parseData('01/09/2099', hoje)
    expect(r.iso).toBe('2099-09-01')
    expect(r.futura).toBe(true)
  })
  it('vazio/N-A → null sem invalida', () => {
    expect(parseData('', hoje)).toEqual({ iso: null, invalida: false, futura: false })
    expect(parseData('N/A', hoje)).toEqual({ iso: null, invalida: false, futura: false })
  })
  it('lixo/quebrada → invalida', () => {
    expect(parseData('#######', hoje).invalida).toBe(true)
    expect(parseData('24/06/205', hoje).invalida).toBe(true) // ano < 2000
    expect(parseData('31/02/2025', hoje).invalida).toBe(true) // 31 de fev
    expect(parseData('01/set', hoje).invalida).toBe(true)
    expect(parseData('15/12/25', hoje).invalida).toBe(true) // dd/MM/yy NÃO aceito (espelho F4)
  })
})

// F7E (OS §2.1) — Data de Entrega no formato dd/MMM, ano puxado da inclusão.
describe('resolverDataEntrega (F7E — dd/MMM com ano da inclusão)', () => {
  const hoje = '2026-07-16'

  it('dd/MMM usa o ano da inclusão (mesmo ano)', () => {
    expect(resolverDataEntrega('18/nov', '2024-11-01', hoje)).toEqual({
      iso: '2024-11-18',
      invalida: false,
      futura: false,
    })
  })

  it('virada de ano: entrega antes da inclusão no calendário → ano + 1', () => {
    // entrega 21/jan, inclusão 18/12/2024 → 21/01/2025
    expect(resolverDataEntrega('21/jan', '2024-12-18', hoje)).toEqual({
      iso: '2025-01-21',
      invalida: false,
      futura: false,
    })
  })

  it('mesmo mês, dia da entrega < dia da inclusão → ano + 1', () => {
    expect(resolverDataEntrega('05/nov', '2024-11-20', hoje).iso).toBe('2025-11-05')
  })

  it('mesmo dia/mês da inclusão (limite): NÃO vira o ano', () => {
    expect(resolverDataEntrega('01/nov', '2024-11-01', hoje).iso).toBe('2024-11-01')
  })

  it('resultado no futuro → futura true', () => {
    const r = resolverDataEntrega('20/dez', '2026-07-01', hoje) // 2026-12-20 > hoje
    expect(r.iso).toBe('2026-12-20')
    expect(r.futura).toBe(true)
  })

  it('inclusão nula (sem âncora de ano) → inválida', () => {
    expect(resolverDataEntrega('18/nov', null, hoje)).toEqual({
      iso: null,
      invalida: true,
      futura: false,
    })
  })

  it('31/fev (dia/mês irreal) → inválida', () => {
    expect(resolverDataEntrega('31/fev', '2024-02-01', hoje).invalida).toBe(true)
  })

  it('bissexto 29/fev vale em ano bissexto (2024)', () => {
    expect(resolverDataEntrega('29/fev', '2024-02-01', hoje).iso).toBe('2024-02-29')
    // 2025 não é bissexto → 29/fev inválida
    expect(resolverDataEntrega('29/fev', '2025-02-01', hoje).invalida).toBe(true)
  })

  it('mês abreviado com ponto e caixa qualquer (Nov., JAN, Dez.)', () => {
    expect(resolverDataEntrega('18/Nov.', '2024-11-01', hoje).iso).toBe('2024-11-18')
    expect(resolverDataEntrega('03/JAN', '2024-01-01', hoje).iso).toBe('2024-01-03')
    expect(resolverDataEntrega('10/Dez.', '2024-12-01', hoje).iso).toBe('2024-12-10')
  })

  it('vazio-na-prática → sem data, não é erro', () => {
    expect(resolverDataEntrega('', '2024-01-01', hoje)).toEqual({ iso: null, invalida: false, futura: false })
    expect(resolverDataEntrega('-', '2024-01-01', hoje)).toEqual({ iso: null, invalida: false, futura: false })
    expect(resolverDataEntrega('N/A', '2024-01-01', hoje)).toEqual({ iso: null, invalida: false, futura: false })
  })

  it('dd/MM/aaaa completa passa direto (delega a parseData; inclusão irrelevante)', () => {
    expect(resolverDataEntrega('10/01/2025', null, hoje)).toEqual(parseData('10/01/2025', hoje))
    expect(resolverDataEntrega('31/02/2025', null, hoje).invalida).toBe(true) // 31 de fev
    expect(resolverDataEntrega('01/09/2099', null, hoje).futura).toBe(true)
  })

  it('mês abreviado desconhecido / lixo → inválida', () => {
    expect(resolverDataEntrega('18/xyz', '2024-01-01', hoje).invalida).toBe(true)
    expect(resolverDataEntrega('#######', '2024-01-01', hoje).invalida).toBe(true)
    expect(resolverDataEntrega('18/11', '2024-01-01', hoje).invalida).toBe(true) // dd/MM (sem ano nem mês por extenso)
    expect(resolverDataEntrega('nov/2024', '2024-01-01', hoje).invalida).toBe(true)
  })
})

// F7E (OS §2.2) — patrimônio "vazio na prática" (importa nulo, não bloqueia).
describe('patrimonioVazio (F7E)', () => {
  it('vazios/placeholders → true', () => {
    for (const v of ['', '-', 'n/a', 'N/A', 'x', '0', 'SEM PATRIMONIO', 'sem patrimônio', 'Sem Patrimônio']) {
      expect(patrimonioVazio(v), `"${v}" deveria ser vazio-na-prática`).toBe(true)
    }
    expect(patrimonioVazio(null)).toBe(true)
    expect(patrimonioVazio(undefined)).toBe(true)
  })
  it('patrimônio canônico ou só-números NÃO é vazio', () => {
    expect(patrimonioVazio('WAP0001234')).toBe(false)
    expect(patrimonioVazio('WAP4491')).toBe(false)
    expect(patrimonioVazio('12345')).toBe(false)
    expect(patrimonioVazio('ABC')).toBe(false)
  })
})

describe('service tag', () => {
  it('normaliza e detecta vazio', () => {
    expect(normalizarServiceTag('  ABC 123 ')).toBe('ABC 123')
    expect(normalizarServiceTag('-')).toBeNull()
    expect(normalizarServiceTag('')).toBeNull()
  })
  it('chaveServiceTag = caixa alta sem espaços (espelha coalesce do índice)', () => {
    expect(chaveServiceTag('ab c')).toBe('ABC')
    expect(chaveServiceTag(null)).toBe('')
  })
})

describe('extrairChamado (GLPI)', () => {
  it('extrai número; texto sem dígito → null', () => {
    expect(extrairChamado('Chamado 6766')).toBe('6766')
    expect(extrairChamado('1234')).toBe('1234')
    expect(extrairChamado('SIM')).toBeNull()
    expect(extrairChamado('N/A')).toBeNull()
  })
})

describe('parseColaboradorInventario', () => {
  it('separa Nome / Setor quando o texto traz', () => {
    expect(parseColaboradorInventario('Fulano de Tal / TI')).toEqual({
      colaborador: 'Fulano de Tal',
      setor: 'TI',
    })
    expect(parseColaboradorInventario('Ciclano')).toEqual({ colaborador: 'Ciclano', setor: null })
    expect(parseColaboradorInventario('-')).toEqual({ colaborador: null, setor: null })
  })
})
