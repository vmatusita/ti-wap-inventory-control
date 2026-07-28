import { describe, it, expect } from 'vitest'
import {
  nomeArquivoTermo,
  TERMO_NOME_PREFIXO,
  NOME_ARQUIVO_MAX,
} from '@/lib/termos/nome-arquivo'
import { TERMO_TIPOS } from '@/lib/termos/tipos'

// F20B — o nome do arquivo baixado passou a seguir o padrão oficial do Johnny
// (`<tipo> - <patrimônio(s)> - <colaborador>.docx`). Antes saía sem patrimônio e
// com o nome do colaborador hifenizado ("Responsabilidade Notebook - Fulano-de-Tal").
// Dados 100% fictícios (regra 2 do CLAUDE.md).

describe('nomeArquivoTermo — um caso por tipo de termo', () => {
  it('devolução por desligamento', () => {
    expect(
      nomeArquivoTermo('devolucao_desligamento', {
        colaborador: 'Fulano de Tal',
        patrimonios: 'LEA0000001, WAP0001234',
      }),
    ).toBe('Termo de devolução - DESLIGAMENTO - LEA0000001 - WAP0001234 - Fulano de Tal.docx')
  })

  it('devolução de equipamento', () => {
    expect(
      nomeArquivoTermo('devolucao_equipamento', {
        colaborador: 'Fulano de Tal',
        patrimonios: 'WAP0001234',
      }),
    ).toBe('Termo de devolução equipamentos - WAP0001234 - Fulano de Tal.docx')
  })

  it('responsabilidade de notebook', () => {
    expect(
      nomeArquivoTermo('responsabilidade_notebook', {
        colaborador: 'Beltrana de Souza Prado',
        patrimonio: 'LEA0000002',
      }),
    ).toBe('Termo de Responsabilidade Notebook - LEA0000002 - Beltrana de Souza Prado.docx')
  })

  it('responsabilidade de desktop', () => {
    expect(
      nomeArquivoTermo('responsabilidade_desktop', {
        colaborador: 'Fulano de Tal',
        patrimonio: 'WAP0004491',
      }),
    ).toBe('Termo de Responsabilidade Desktop - WAP0004491 - Fulano de Tal.docx')
  })

  it('responsabilidade de celular', () => {
    expect(
      nomeArquivoTermo('responsabilidade_celular', {
        colaborador: 'Fulano de Tal',
        patrimonio: 'WAP0004491',
      }),
    ).toBe('Termo de Responsabilidade Celular - WAP0004491 - Fulano de Tal.docx')
  })

  // As DUAS variantes de monitor caem no mesmo prefixo — é o padrão do Johnny, e o
  // "monitor" minúsculo também é. A variante só muda o modelo .docx, não o nome.
  it('as duas variantes de monitor produzem o mesmo prefixo, com "monitor" minúsculo', () => {
    const campos = { colaborador: 'Sicrano Boaventura', patrimonio: 'WAP0005678' }
    const esperado = 'Termo de Responsabilidade monitor - WAP0005678 - Sicrano Boaventura.docx'
    expect(nomeArquivoTermo('responsabilidade_monitor_interno', campos)).toBe(esperado)
    expect(nomeArquivoTermo('responsabilidade_monitor_homeoffice', campos)).toBe(esperado)
  })
})

describe('nomeArquivoTermo — segmento dos patrimônios', () => {
  it('preserva a ORDEM do documento (não ordena alfabeticamente)', () => {
    expect(
      nomeArquivoTermo('devolucao_equipamento', {
        colaborador: 'Fulano de Tal',
        patrimonios: 'WAP0009999, LEA0000001, AAA0000001',
      }),
    ).toBe(
      'Termo de devolução equipamentos - WAP0009999 - LEA0000001 - AAA0000001 - Fulano de Tal.docx',
    )
  })

  it('descarta "sem patrimônio" (F7E) no meio da lista', () => {
    expect(
      nomeArquivoTermo('devolucao_equipamento', {
        colaborador: 'Fulano de Tal',
        patrimonios: 'WAP0001234, sem patrimônio, LEA0000001',
      }),
    ).toBe('Termo de devolução equipamentos - WAP0001234 - LEA0000001 - Fulano de Tal.docx')
  })

  it('descarta "sem patrimônio" digitado com outra caixa ou sem acento', () => {
    expect(
      nomeArquivoTermo('devolucao_equipamento', {
        colaborador: 'Fulano de Tal',
        patrimonios: 'SEM PATRIMONIO, WAP0001234, Sem Patrimônio',
      }),
    ).toBe('Termo de devolução equipamentos - WAP0001234 - Fulano de Tal.docx')
  })

  it('descarta partes vazias e vírgulas sobrando', () => {
    expect(
      nomeArquivoTermo('devolucao_equipamento', {
        colaborador: 'Fulano de Tal',
        patrimonios: 'WAP0001234, ,  , LEA0000001,',
      }),
    ).toBe('Termo de devolução equipamentos - WAP0001234 - LEA0000001 - Fulano de Tal.docx')
  })

  it('sem nenhum patrimônio útil, o segmento inteiro some', () => {
    expect(
      nomeArquivoTermo('devolucao_equipamento', {
        colaborador: 'Fulano de Tal',
        patrimonios: 'sem patrimônio',
      }),
    ).toBe('Termo de devolução equipamentos - Fulano de Tal.docx')
  })

  it('campo editado à mão sem vírgula vira UM patrimônio só', () => {
    expect(
      nomeArquivoTermo('devolucao_equipamento', {
        colaborador: 'Fulano de Tal',
        patrimonios: 'WAP0001234 e o monitor antigo',
      }),
    ).toBe(
      'Termo de devolução equipamentos - WAP0001234 e o monitor antigo - Fulano de Tal.docx',
    )
  })

  // A família decide o campo: responsabilidade lê `patrimonio`, devolução lê
  // `patrimonios`. Trocar um pelo outro não pode vazar para o nome.
  it('responsabilidade lê `patrimonio` e ignora `patrimonios`', () => {
    expect(
      nomeArquivoTermo('responsabilidade_notebook', {
        colaborador: 'Fulano de Tal',
        patrimonio: 'WAP0001234',
        patrimonios: 'NAO0000001, NAO0000002',
      }),
    ).toBe('Termo de Responsabilidade Notebook - WAP0001234 - Fulano de Tal.docx')
  })

  // A vírgula só é separador na DEVOLUÇÃO. Na responsabilidade o campo é UM ativo
  // e é editável — dividir ali inventaria um patrimônio que não existe.
  it('vírgula no campo da responsabilidade é TEXTO, não separador', () => {
    expect(
      nomeArquivoTermo('responsabilidade_notebook', {
        colaborador: 'Fulano de Tal',
        patrimonio: 'WAP0001234, com carregador',
      }),
    ).toBe(
      'Termo de Responsabilidade Notebook - WAP0001234, com carregador - Fulano de Tal.docx',
    )
  })

  it('devolução lê `patrimonios` e ignora `patrimonio`', () => {
    expect(
      nomeArquivoTermo('devolucao_equipamento', {
        colaborador: 'Fulano de Tal',
        patrimonio: 'NAO0000001',
        patrimonios: 'WAP0001234',
      }),
    ).toBe('Termo de devolução equipamentos - WAP0001234 - Fulano de Tal.docx')
  })
})

describe('nomeArquivoTermo — segmento do colaborador', () => {
  it('preserva espaços e acentos (o padrão antigo hifenizava e tirava acento)', () => {
    expect(
      nomeArquivoTermo('responsabilidade_notebook', {
        colaborador: 'João Conceição de Assunção',
        patrimonio: 'WAP0001234',
      }),
    ).toBe('Termo de Responsabilidade Notebook - WAP0001234 - João Conceição de Assunção.docx')
  })

  it('colaborador vazio some do nome', () => {
    expect(
      nomeArquivoTermo('devolucao_equipamento', {
        colaborador: '',
        patrimonios: 'WAP0001234',
      }),
    ).toBe('Termo de devolução equipamentos - WAP0001234.docx')
  })

  it('colaborador só com espaços some do nome', () => {
    expect(
      nomeArquivoTermo('devolucao_equipamento', {
        colaborador: '   ',
        patrimonios: 'WAP0001234',
      }),
    ).toBe('Termo de devolução equipamentos - WAP0001234.docx')
  })

  it('campos vazios: sobra só o prefixo (todo campo do schema é opcional)', () => {
    expect(nomeArquivoTermo('responsabilidade_notebook', {})).toBe(
      'Termo de Responsabilidade Notebook.docx',
    )
  })
})

describe('nomeArquivoTermo — sanitização', () => {
  // \ / : * ? " < > | são proibidos em nome de arquivo no Windows. Como os campos
  // são texto livre editável (spec §3.9), qualquer um pode aparecer.
  it('remove todos os caracteres proibidos do Windows e colapsa o espaço que sobra', () => {
    expect(
      nomeArquivoTermo('responsabilidade_notebook', {
        colaborador: 'Fulano \\ / : * ? " < > | de Tal',
        patrimonio: 'WAP0001234',
      }),
    ).toBe('Termo de Responsabilidade Notebook - WAP0001234 - Fulano de Tal.docx')
  })

  it('sanitiza também o segmento do patrimônio', () => {
    expect(
      nomeArquivoTermo('devolucao_equipamento', {
        colaborador: 'Fulano de Tal',
        patrimonios: 'WAP0001234/, LEA:0000001',
      }),
    ).toBe('Termo de devolução equipamentos - WAP0001234 - LEA0000001 - Fulano de Tal.docx')
  })

  it('tabulação e quebra de linha viram espaço, sem grudar as palavras', () => {
    expect(
      nomeArquivoTermo('responsabilidade_notebook', {
        colaborador: 'Fulano\tde\nTal',
        patrimonio: 'WAP0001234',
      }),
    ).toBe('Termo de Responsabilidade Notebook - WAP0001234 - Fulano de Tal.docx')
  })

  it('nenhum caractere de controle sobrevive', () => {
    // Montados por codigo: caractere de controle cru no fonte e invisivel no diff
    // e ja virou mojibake neste projeto. Aqui eles entram pela porta dos fundos.
    const nulo = String.fromCharCode(0)
    const del = String.fromCharCode(127)
    const nome = nomeArquivoTermo('responsabilidade_notebook', {
      colaborador: `Fulano${nulo} de${del} Tal`,
      patrimonio: `WAP${nulo}0001234`,
    })
    expect(nome).toBe('Termo de Responsabilidade Notebook - WAP0001234 - Fulano de Tal.docx')
    expect([...nome].some((c) => (c.codePointAt(0) ?? 0) < 32)).toBe(false)
  })
})

describe('nomeArquivoTermo — caracteres invisíveis e pontas', () => {
  // U+202E inverte a exibição do nome no gerenciador de downloads (truque de
  // disfarçar extensão); U+200B produz nomes idênticos aos olhos e distintos para
  // a busca. Tudo isso chega colado de e-mail/planilha no campo, que é texto livre.
  it('remove marcas de direção, largura zero e BOM', () => {
    const rlo = String.fromCodePoint(0x202e)
    const zwsp = String.fromCodePoint(0x200b)
    const bom = String.fromCodePoint(0xfeff)
    const nome = nomeArquivoTermo('responsabilidade_notebook', {
      colaborador: `${rlo}Fulano${zwsp} de Tal${bom}`,
      patrimonio: `WAP${zwsp}0001234`,
    })
    expect(nome).toBe('Termo de Responsabilidade Notebook - WAP0001234 - Fulano de Tal.docx')
  })

  it('remove os controles C1 (U+0080–U+009F)', () => {
    const c1 = String.fromCodePoint(0x9b)
    expect(
      nomeArquivoTermo('responsabilidade_notebook', {
        colaborador: `Fulano${c1} de Tal`,
        patrimonio: 'WAP0001234',
      }),
    ).toBe('Termo de Responsabilidade Notebook - WAP0001234 - Fulano de Tal.docx')
  })

  // O `nomeDownload` antigo aparava as pontas de graça; sem isso o nome sai com
  // separador duplicado e traço solto antes da extensão.
  it('apara traço e espaço sobrando nas pontas de cada segmento', () => {
    expect(
      nomeArquivoTermo('responsabilidade_notebook', {
        colaborador: '- Fulano de Tal -',
        patrimonio: ' -WAP0001234- ',
      }),
    ).toBe('Termo de Responsabilidade Notebook - WAP0001234 - Fulano de Tal.docx')
  })

  it('traço no MEIO do nome é preservado', () => {
    expect(
      nomeArquivoTermo('responsabilidade_notebook', {
        colaborador: 'Ana-Maria de Tal',
        patrimonio: 'WAP-0001234',
      }),
    ).toBe('Termo de Responsabilidade Notebook - WAP-0001234 - Ana-Maria de Tal.docx')
  })
})

describe('nomeArquivoTermo — teto de comprimento', () => {
  const LONGO = {
    colaborador: 'Fulano de Tal',
    patrimonios: [
      'WAP0000001',
      'WAP0000002',
      'WAP0000003',
      'WAP0000004',
      'WAP0000005',
      'WAP0000006',
      'WAP0000007',
      'WAP0000008',
    ].join(', '),
  }

  it('corta a lista em separador inteiro, nunca no meio de um código', () => {
    const nome = nomeArquivoTermo('devolucao_equipamento', LONGO)
    expect(nome.length).toBeLessThanOrEqual(NOME_ARQUIVO_MAX)
    // Os 7 primeiros cabem (143 chars); o 8º estouraria para 156.
    expect(nome).toBe(
      'Termo de devolução equipamentos - WAP0000001 - WAP0000002 - WAP0000003 - ' +
        'WAP0000004 - WAP0000005 - WAP0000006 - WAP0000007 - Fulano de Tal.docx',
    )
    expect(nome).not.toContain('WAP0000008')
  })

  it('o corte nunca deixa um código pela metade', () => {
    const nome = nomeArquivoTermo('devolucao_equipamento', LONGO)
    const meio = nome
      .replace('Termo de devolução equipamentos - ', '')
      .replace(' - Fulano de Tal.docx', '')
    for (const parte of meio.split(' - ')) {
      expect(parte, `patrimônio truncado: ${parte}`).toMatch(/^WAP\d{7}$/)
    }
  })

  it('colaborador quilométrico e sem patrimônio: corta o nome e respeita o teto', () => {
    const nome = nomeArquivoTermo('responsabilidade_notebook', {
      colaborador: 'A'.repeat(200),
    })
    expect(nome.length).toBe(NOME_ARQUIVO_MAX)
    expect(nome.startsWith('Termo de Responsabilidade Notebook - AAA')).toBe(true)
    expect(nome.endsWith('.docx')).toBe(true)
  })

  // Achado da revisão adversarial: `slice()` conta unidades de código e partia um
  // par surrogate ao meio, deixando meio caractere inválido no nome do arquivo.
  it('o corte do colaborador não parte um caractere ao meio (par surrogate)', () => {
    const emoji = String.fromCodePoint(0x1f600)
    for (let n = 100; n <= 112; n++) {
      const nome = nomeArquivoTermo('responsabilidade_notebook', {
        colaborador: 'A'.repeat(n) + emoji.repeat(10),
      })
      const soltos = [...nome].filter((c) => {
        const cp = c.codePointAt(0) ?? 0
        return cp >= 0xd800 && cp <= 0xdfff
      })
      expect(soltos, `surrogate solto com colaborador de ${n} letras: ${nome}`).toEqual([])
      expect(nome.length).toBeLessThanOrEqual(NOME_ARQUIVO_MAX)
    }
  })

  it('respeita o teto mesmo com colaborador E patrimônios estourando juntos', () => {
    const nome = nomeArquivoTermo('devolucao_desligamento', {
      colaborador: 'B'.repeat(200),
      patrimonios: LONGO.patrimonios,
    })
    expect(nome.length).toBeLessThanOrEqual(NOME_ARQUIVO_MAX)
    expect(nome.endsWith('.docx')).toBe(true)
  })
})

describe('nomeArquivoTermo — varredura de todos os tipos', () => {
  // Pega o modelo novo que alguém acrescente em TERMO_TIPOS sem atualizar o mapa de
  // prefixos (o Record já obriga em tempo de compilação; isto pega prefixo vazio).
  it.each(TERMO_TIPOS)('%s tem prefixo e produz um nome válido', (tipo) => {
    expect(TERMO_NOME_PREFIXO[tipo], `tipo sem prefixo: ${tipo}`).toBeTruthy()

    const nome = nomeArquivoTermo(tipo, {
      colaborador: 'Fulano de Tal',
      patrimonio: 'WAP0001234',
      patrimonios: 'WAP0001234',
    })
    expect(nome.startsWith(TERMO_NOME_PREFIXO[tipo])).toBe(true)
    expect(nome).toContain('WAP0001234')
    expect(nome).toContain('Fulano de Tal')
    expect(nome.endsWith('.docx')).toBe(true)
    expect(nome.length).toBeLessThanOrEqual(NOME_ARQUIVO_MAX)
    // Nenhum caractere proibido pelo Windows escapou do prefixo fixo.
    expect(nome, `nome inválido no Windows: ${nome}`).not.toMatch(/[\\/:*?"<>|]/)
  })
})
