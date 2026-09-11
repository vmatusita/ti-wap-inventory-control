import { describe, expect, it, vi } from 'vitest'
import { hojeISO } from '@/lib/format'
import {
  chaveServiceTag,
  extrairChamado,
  hojeIso,
  limparCampo,
  modeloSemMarca,
  normalizarHeader,
  normalizarServiceTag,
  normalizarTexto,
  parseColaboradorInventario,
  parseData,
  patrimonioVazio,
  resolverDataEntrega,
} from './deparas'

// Nenhum dado real — tudo fictício (padrão WAP0001234 / "Fulano").
//
// F56 · Frente D (segunda metade) — `mapearUnidade`/`filialPorSlug`/
// `mapearCategoria`/`estadoPlanilha`/`extrairPatrimonioDoHostname`/
// `TIPO_CANONICO`/`SITUACAO_CANONICA` SAÍRAM deste arquivo (o vocabulário virou
// parâmetro, `./vocabulario.ts`) — os testes deles moraram para
// `vocabulario.test.ts`. O que continua aqui é o que NÃO depende de
// vocabulário: normalização de texto, datas, service tag, patrimônio
// "vazio-na-prática" e os campos auxiliares.

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

  // F7F+ (Johnny, 20/07/2026): família textual "sem patrimônio" da WAP → vazio.
  it('família textual "sem patrimônio" (SEMPAT, sem pat, s/pat, sem plaqueta…) → true', () => {
    for (const v of [
      'SEMPAT', 'sempat', 'SemPat',
      'SEM PAT', 'sem pat', 'sem patr', 'SEM PATRIMÔNIO FÍSICO', 'sem patrimonio fisico',
      'S/PAT', 's/ pat', 's/patrimonio',
      'sem plaqueta', 'SEM PLACA', 'sem etiqueta', 'sem número', 'sem num', 'sem identificação',
    ]) {
      expect(patrimonioVazio(v), `"${v}" deveria ser vazio-na-prática (F7F)`).toBe(true)
    }
  })

  it('a guarda não deixa um patrimônio VÁLIDO virar vazio, nem solta lixo/só-números', () => {
    // Prefixos que "parecem" a família mas canonicalizam → seguem patrimônio válido.
    expect(patrimonioVazio('SEM0001234')).toBe(false) // SEM + 7 dígitos = canônico
    expect(patrimonioVazio('SEMP0001234')).toBe(false) // SEMP + 7 dígitos = canônico
    expect(patrimonioVazio('SEM-0001234')).toBe(false) // canonicaliza (tira o '-')
    // Lixo sem declaração de ausência e só-números seguem bloqueando (decisão 5).
    expect(patrimonioVazio('WAPalmaq-teste')).toBe(false)
    expect(patrimonioVazio('semaforo')).toBe(false) // "sem" no início, mas não é "sem pat…"
    expect(patrimonioVazio('semana')).toBe(false)
    expect(patrimonioVazio('nadador')).toBe(false) // "nada" no início, mas é palavra, não ausência
    expect(patrimonioVazio('3652')).toBe(false)
    expect(patrimonioVazio('12345')).toBe(false)
    expect(patrimonioVazio('ABC')).toBe(false)
  })

  // F7-pós (Johnny, 20/07/2026): AMPLIA a família — tudo que DECLARE ausência importa
  // vazio, para não mais cair na mensagem "fora do formato (ex.: WAP0004491)".
  it('declarações de ausência ampliadas (não possui, s/n, n/i, sem serial/tag, símbolos…) → true', () => {
    for (const v of [
      // frases de negação
      'não possui', 'nao possui', 'NÃO TEM', 'nao tem', 'não consta', 'nao informado',
      'não identificado', 'nao localizado', 'não há', 'não existe',
      // abreviações
      's/n', 'S/N', 's/ n', 'n/i', 'N/I', 'n/t', 's/pat', 's/serie', 's/serial',
      // "sem <algo>" produtivo (fora da lista fixa antiga)
      'sem serial', 'SEM TAG', 'sem série', 'sem registro', 'sem tombamento',
      'sem numero de serie', 'sem info', 'sem informação', 'sem dados',
      // palavras isoladas de ausência
      'nenhum', 'nenhuma', 'nada', 'inexistente', 'ausente', 'indefinido', 'vazio', 'em branco',
      // só símbolos/pontuação
      '--', '---', '...', '???', '//', '*', '- - -',
    ]) {
      expect(patrimonioVazio(v), `"${v}" deveria ser vazio-na-prática (F7-pós)`).toBe(true)
    }
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

// F7K (Johnny 20/07/2026) — modelo que repete a marca no início vira só o resto.
describe('modeloSemMarca (F7K — não duplica a marca no modelo)', () => {
  it('modelo que começa com a marca → tira a marca-prefixo (whole word, caixa-insensível)', () => {
    expect(modeloSemMarca('HP', 'HP Pro SFF 280 G9')).toBe('Pro SFF 280 G9')
    expect(modeloSemMarca('Iphone', 'Iphone 15 Pro')).toBe('15 Pro')
    expect(modeloSemMarca('DELL', 'Dell E2222HS')).toBe('E2222HS')
    expect(modeloSemMarca('Motorola', 'Motorola G60')).toBe('G60')
  })
  it('não toca modelo que NÃO começa com a marca (ou sem marca)', () => {
    expect(modeloSemMarca('HP', 'Pro SFF 280 G9')).toBe('Pro SFF 280 G9')
    expect(modeloSemMarca('HP', 'HPX 200')).toBe('HPX 200') // não é palavra inteira
    expect(modeloSemMarca(null, 'HP Pro')).toBe('HP Pro')
    expect(modeloSemMarca('', 'HP Pro')).toBe('HP Pro')
    expect(modeloSemMarca(undefined, 'HP Pro')).toBe('HP Pro')
  })
  it('modelo que é SÓ a marca → null; vazio → null', () => {
    expect(modeloSemMarca('HP', 'HP')).toBeNull()
    expect(modeloSemMarca('HP', 'hp')).toBeNull()
    expect(modeloSemMarca('HP', '  HP  ')).toBeNull()
    expect(modeloSemMarca('HP', '')).toBeNull()
    expect(modeloSemMarca('HP', null)).toBeNull()
  })
})

describe('hojeIso (régua "data não futura" — fuso do NEGÓCIO, não de quem executa)', () => {
  // Dívida técnica item J (24/07/2026): esta função montava a data com `new Date()` +
  // getFullYear/getMonth/getDate, isto é, o fuso LOCAL DE QUEM EXECUTA. Os dois lados
  // da MESMA régua rodam em fusos diferentes — `ops-grupo.ts`/wizard no navegador
  // (BRT) e `validators/importar.ts` como Server Action na Vercel (UTC) —, então entre
  // 21:00 e 23:59 BRT o servidor já virava o dia e a mesma planilha era barrada no
  // preview e aceita na gravação. Estes testes travam o alinhamento com `hojeISO`.

  it('devolve a MESMA data que hojeISO (@/lib/format — fuso America/Sao_Paulo)', () => {
    expect(hojeIso()).toBe(hojeISO())
  })

  it('tem o formato yyyy-MM-dd que parseData compara', () => {
    expect(hojeIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('NÃO usa o fuso do processo: às 23:00 BRT (02:00 UTC do dia seguinte) segue no dia de SP', () => {
    // 2026-07-25T02:00:00Z = 24/07 às 23:00 em São Paulo. A implementação antiga,
    // sob TZ=UTC (a da Vercel), devolveria 2026-07-25 — um dia à frente do negócio.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-25T02:00:00Z'))
    try {
      expect(hojeIso()).toBe('2026-07-24')
    } finally {
      vi.useRealTimers()
    }
  })
})
