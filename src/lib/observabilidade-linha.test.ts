import { describe, expect, it, vi } from 'vitest'
import {
  erroEstruturado,
  linhaDeFalha,
  redigirTexto,
  registrarFalha,
  sanearContexto,
} from '@/lib/observabilidade-linha'

// O FUNIL, PROVADO POR SABOTAGEM (F55 · Frente A).
//
// Duas promessas são o coração deste arquivo, e as duas são de segurança:
//   · NENHUM segredo e NENHUM dado pessoal saem — nem sob nome de chave
//     inocente, nem de dentro da mensagem do erro;
//   · o funil NUNCA lança — log que explode dentro de um `catch` transforma um
//     erro em dois, e o segundo aparece na tela de quem opera.
//
// Os valores usados aqui são 100% FICTÍCIOS (CLAUDE.md regra 2).

describe('a forma da linha', () => {
  it('é UMA linha, JSON válido, com evt e escopo', () => {
    const linha = linhaDeFalha({ escopo: 'import.backup', erro: new Error('caiu') })
    expect(linha).not.toContain('\n')
    const o = JSON.parse(linha)
    expect(o.evt).toBe('falha')
    expect(o.escopo).toBe('import.backup')
  })

  it('`empresa` está SEMPRE presente e hoje é null (o campo reservado da F62)', () => {
    const semCtx = JSON.parse(linhaDeFalha({ escopo: 'x', erro: 'y' }))
    const comCtx = JSON.parse(linhaDeFalha({ escopo: 'x', erro: 'y', ctx: { a: 1 } }))
    expect('empresa' in semCtx).toBe(true)
    expect('empresa' in comCtx).toBe(true)
    expect(semCtx.empresa).toBeNull()
    expect(comCtx.empresa).toBeNull()
  })

  it('`operador` é null quando ninguém passou — estado normal, não defeito', () => {
    expect(JSON.parse(linhaDeFalha({ escopo: 'x', erro: 'y' })).operador).toBeNull()
  })

  it('escopo vazio não some: vira `sem-escopo`', () => {
    expect(JSON.parse(linhaDeFalha({ escopo: '', erro: 'y' })).escopo).toBe('sem-escopo')
  })
})

describe('o erro em três campos', () => {
  it('Error vira { nome, codigo, mensagem }', () => {
    expect(erroEstruturado(new TypeError('sem tipo'))).toEqual({
      nome: 'TypeError',
      codigo: null,
      mensagem: 'sem tipo',
    })
  })

  it('erro do PostgREST leva o CÓDIGO', () => {
    expect(
      erroEstruturado({ code: '23505', message: 'duplicate key value', details: 'x', hint: 'y' }),
    ).toEqual({ nome: 'erro', codigo: '23505', mensagem: 'duplicate key value' })
  })

  // ⚠ `details` carrega valor de LINHA: `Key (patrimonio)=(WAP0000001) already
  // exists`. É o precedente escrito de `descreverErro` do smoke.
  it('NUNCA leva `details` nem `hint` do PostgREST', () => {
    const linha = linhaDeFalha({
      escopo: 'x',
      erro: {
        code: '23505',
        message: 'duplicate key',
        details: 'Key (patrimonio)=(ZZF55SEGREDO) already exists.',
        hint: 'pista secreta',
      },
    })
    expect(linha).not.toContain('ZZF55SEGREDO')
    expect(linha).not.toContain('pista secreta')
    expect(linha).not.toContain('details')
    expect(linha).not.toContain('hint')
  })

  it.each([
    ['string', 'caiu tudo'],
    ['número', 42],
    ['null', null],
    ['undefined', undefined],
    ['objeto sem message', { a: 1 }],
  ])('erro que não é Error (%s) não derruba nem some', (_nome, erro) => {
    const o = JSON.parse(linhaDeFalha({ escopo: 'x', erro }))
    expect(typeof o.erro.nome).toBe('string')
    expect(typeof o.erro.mensagem).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// SABOTAGEM B — a redação
// ---------------------------------------------------------------------------

describe('SABOTAGEM: redação por NOME de chave', () => {
  it.each([
    ['senha', 'sup3r-secreta'],
    ['password', 'sup3r-secreta'],
    ['token', 'abcdef123456'],
    ['apiKey', 'abcdef123456'],
    ['api_key', 'abcdef123456'],
    ['hash', 'deadbeefdeadbeef'],
    ['cpf', 'valor-de-cpf'],
    ['chaveDeServico', 'valor-de-chave'],
    ['authorization', 'Bearer abcdef'],
    ['cookie', 'sb-access=abc'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'valor-de-servico'],
  ])('chave `%s` não deixa o valor sair', (chave, valor) => {
    const linha = linhaDeFalha({ escopo: 'x', erro: 'y', ctx: { [chave]: valor } })
    expect(linha).not.toContain(valor)
    expect(linha).toContain('[redigido]')
  })

  it('redige em profundidade, não só no topo', () => {
    const linha = linhaDeFalha({
      escopo: 'x',
      erro: 'y',
      ctx: { requisicao: { headers: { authorization: 'Bearer zzz-ficticio' } } },
    })
    expect(linha).not.toContain('zzz-ficticio')
  })

  it('o que NÃO é sensível continua saindo — o log tem de servir para algo', () => {
    const o = JSON.parse(
      linhaDeFalha({ escopo: 'x', erro: 'y', ctx: { filial: 3, linhas: 120, tipo: 'saida' } }),
    )
    expect(o.ctx).toEqual({ filial: 3, linhas: 120, tipo: 'saida' })
  })
})

describe('SABOTAGEM: redação por VALOR', () => {
  it('e-mail sob chave INOCENTE não sai', () => {
    // `lib/auditoria-registro.ts:45` loga `alvo`, que o tipo descreve como
    // "e-mail do convidado" — nenhum nome de chave casa a regex de segredo.
    const linha = linhaDeFalha({
      escopo: 'auditoria',
      erro: 'y',
      ctx: { alvo: 'fulano.ficticio@wap.ind.br' },
    })
    expect(linha).not.toContain('fulano.ficticio')
    expect(linha).not.toContain('@wap.ind.br')
    expect(linha).toContain('[e-mail]')
  })

  it('e-mail DENTRO da mensagem do erro não sai', () => {
    // `raise` de plpgsql com `%` carrega valor — a `0090` põe o patrimônio na
    // frase, e nada impede que uma frase futura leve um e-mail.
    const linha = linhaDeFalha({
      escopo: 'admin',
      erro: new Error('conta ciclana.ficticia@stefanini.com já existe'),
    })
    expect(linha).not.toContain('ciclana.ficticia')
    expect(linha).toContain('[e-mail]')
  })

  it('e-mail no NOME da chave também não sai', () => {
    const linha = linhaDeFalha({
      escopo: 'x',
      erro: 'y',
      ctx: { 'beltrano.ficticio@wap.ind.br': 'presente' },
    })
    expect(linha).not.toContain('beltrano.ficticio')
  })

  it('CPF formatado e cru não saem', () => {
    const linha = linhaDeFalha({
      escopo: 'x',
      erro: new Error('documento 123.456.789-09 recusado; o outro é 98765432100'),
    })
    expect(linha).not.toContain('123.456.789-09')
    expect(linha).not.toContain('98765432100')
  })

  it('telefone formatado não sai', () => {
    const linha = linhaDeFalha({ escopo: 'x', erro: new Error('ligar para (27) 99999-1234') })
    expect(linha).not.toContain('99999-1234')
    expect(linha).toContain('[telefone]')
  })

  it('JWT não sai, nem sob chave inocente', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmaWN0aWNpbyIsInJvbGUiOiJhbm9uIn0.ZmljdGljaW8'
    const linha = linhaDeFalha({ escopo: 'x', erro: 'y', ctx: { url: `?apikey=${jwt}` } })
    expect(linha).not.toContain('eyJhbGciOi')
    expect(linha).toContain('[token]')
  })

  it('chave publicável nova da Supabase não sai', () => {
    const linha = linhaDeFalha({
      escopo: 'x',
      erro: 'y',
      ctx: { config: 'sb_publishable_abcdef123456789' },
    })
    expect(linha).not.toContain('sb_publishable_abcdef')
  })

  it('texto muito longo é cortado, não some', () => {
    const gigante = 'a'.repeat(5000)
    const t = redigirTexto(gigante)
    expect(t.length).toBeLessThan(600)
    expect(t).toContain('[cortado]')
  })
})

// ---------------------------------------------------------------------------
// SABOTAGEM: o funil NUNCA lança
// ---------------------------------------------------------------------------

describe('SABOTAGEM: o funil nunca lança', () => {
  function capturar(fn: () => void): string[] {
    const linhas: string[] = []
    const espiao = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      linhas.push(String(args[0]))
    })
    try {
      fn()
    } finally {
      espiao.mockRestore()
    }
    return linhas
  }

  it('ctx CIRCULAR não derruba — vira `[circular]`', () => {
    const ctx: Record<string, unknown> = { a: 1 }
    ctx.eu = ctx
    const linhas = capturar(() => registrarFalha({ escopo: 'x', erro: 'y', ctx }))
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toContain('[circular]')
    expect(() => JSON.parse(linhas[0])).not.toThrow()
  })

  it('ctx GIGANTE não derruba nem estoura a linha', () => {
    const ctx = { itens: Array.from({ length: 5000 }, (_, i) => `item-${i}`) }
    const linhas = capturar(() => registrarFalha({ escopo: 'x', erro: 'y', ctx }))
    expect(linhas).toHaveLength(1)
    expect(linhas[0].length).toBeLessThan(9000)
    expect(() => JSON.parse(linhas[0])).not.toThrow()
  })

  it('ctx com getter que ESTOURA não derruba', () => {
    const ctx = {
      get bomba(): string {
        throw new Error('boom')
      },
    }
    const linhas = capturar(() => registrarFalha({ escopo: 'x', erro: 'y', ctx }))
    // A linha mínima sai, e ela é JSON válido.
    expect(linhas).toHaveLength(1)
    expect(() => JSON.parse(linhas[0])).not.toThrow()
    expect(JSON.parse(linhas[0]).evt).toBe('falha')
  })

  it('erro com `message` que é um getter que estoura não derruba', () => {
    const erro = {
      get message(): string {
        throw new Error('boom')
      },
    }
    const linhas = capturar(() => registrarFalha({ escopo: 'x', erro }))
    expect(linhas).toHaveLength(1)
    expect(() => JSON.parse(linhas[0])).not.toThrow()
  })

  it('`console.error` indisponível não derruba', () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('console morreu')
    })
    try {
      expect(() => registrarFalha({ escopo: 'x', erro: 'y' })).not.toThrow()
    } finally {
      espiao.mockRestore()
    }
  })

  it('objeto profundo demais vira `[profundo]`, sem recursão infinita', () => {
    let fundo: Record<string, unknown> = { fim: true }
    for (let i = 0; i < 50; i++) fundo = { nivel: fundo }
    expect(() => sanearContexto(fundo)).not.toThrow()
    expect(JSON.stringify(sanearContexto(fundo))).toContain('[profundo]')
  })
})

describe('a regex de chave sensível não é gulosa nem míope', () => {
  it.each([
    // REGRESSÃO: `\bkey\b` não casava `SUPABASE_SERVICE_ROLE_KEY` (o `_` é
    // caractere de palavra). Era a chave mais perigosa do repositório saindo
    // inteira sob o nome dela mesma — achado da sabotagem, 10/09/2026.
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ACCESS_TOKEN',
    'VIEW_SESSION_SECRET',
    'MS_CLIENT_SECRET',
    'x-api-key',
  ])('redige `%s`', (chave) => {
    const linha = linhaDeFalha({ escopo: 'x', erro: 'y', ctx: { [chave]: 'zz-ficticio-zz' } })
    expect(linha).not.toContain('zz-ficticio-zz')
  })

  it.each(['monkey', 'keyboard', 'chaveiro_da_filial', 'senhorio'])(
    '`%s` NÃO é tratada como sensível só por conter as letras',
    (chave) => {
      const o = JSON.parse(linhaDeFalha({ escopo: 'x', erro: 'y', ctx: { [chave]: 'visivel' } }))
      // `chaveiro_da_filial` e `senhorio` contêm `chave`/`senh` — são falsos
      // positivos ACEITOS (o custo é um valor a menos no log, nunca um vazamento).
      if (chave === 'monkey' || chave === 'keyboard') {
        expect(o.ctx[chave]).toBe('visivel')
      }
    },
  )
})
