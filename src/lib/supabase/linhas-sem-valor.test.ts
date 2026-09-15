import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { linhaOuFalha, linhasOuFalha, valorOuFalha } from '@/lib/supabase/linhas'
import { caminhoNormalizado, conferirValores } from '@/lib/supabase/forma'

// NENHUM VALOR DE LINHA NO ERRO DE FORMA (F58 · Frente C · decisão 6 — a sabotagem F).
//
// A forma errada LANÇA em produção (decisão i do Johnny), e o erro vai para o log pelo
// `registrarFalha`. Um log de servidor com o valor da linha que falhou é vazamento: patrimônio, nome
// de pessoa, e-mail, id — e, dentro de um `jsonb`, até a CHAVE pode ser dado (nome de item, slug de
// filial). Este teste planta SENTINELAS fictícias nas linhas que falham e exige que nenhuma apareça:
//  · na mensagem do `ErroDeForma`;
//  · no erro serializado inteiro (as propriedades próprias);
//  · nos `problemas` (caminho + código);
//  · no que o `registrarFalha` escreve no `console.error`.
// E prova a normalização do caminho: chave de `z.record` vira `<chave>`, índice vira `[]`, e a issue
// de chave desconhecida leva a CONTAGEM, não os nomes.
//
// O dado chega por `doBanco<T>()`: DIZ ter o tipo da linha — como o supabase-js diz — e entrega outra
// coisa, que é exatamente o caso que a conferência em execução existe para pegar. Por isso a
// amarração de tipo passa e a recusa acontece em execução.
//
// Sabotagem F (docs/f58-evidencias): ligar `reportInput` e levar `issue.input` aos problemas,
// interpolar um valor na mensagem, ou deixar a chave crua do record no caminho — este teste fica
// vermelho nos três.

const SENTINELAS = [
  'WAP0009876', // patrimônio fictício
  'fulano.sentinela@wap.ind.br',
  '11111111-2222-4333-8444-555555555555',
  'filial-sentinela',
  'CHAVE_SENTINELA_DE_ITEM',
  'Nome Sentinela da Silva',
  '424242',
]

/** O que o banco entregou, com o tipo que o cliente PROMETE. */
function doBanco<T>(valor: unknown): T {
  return JSON.parse(JSON.stringify(valor))
}

let linhasDeLog: string[] = []
beforeEach(() => {
  linhasDeLog = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    linhasDeLog.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  })
})
afterEach(() => vi.restoreAllMocks())

function serializado(valor: unknown): string {
  return JSON.stringify(valor, (_k, v: unknown) => {
    if (v instanceof Error) return { ...Object.fromEntries(Object.entries(v)), message: v.message, name: v.name, stack: v.stack }
    return v
  })
}

function semSentinela(...textos: string[]) {
  const tudo = textos.join('\n')
  for (const s of SENTINELAS) expect(tudo, `vazou "${s}"`).not.toContain(s)
}

describe('o erro de forma não carrega valor de linha', () => {
  it('coluna com tipo errado: mensagem, erro serializado e log sem valor', () => {
    const forma = z.strictObject({ id: z.string(), patrimonio: z.string(), quantidade: z.number() })
    const r = linhasOuFalha(
      doBanco<z.output<typeof forma>[]>([
        { id: '11111111-2222-4333-8444-555555555555', patrimonio: 'WAP0009876', quantidade: 1 },
        { id: '11111111-2222-4333-8444-555555555555', patrimonio: 9876, quantidade: '424242' },
      ]),
      forma,
      'prova.sem-valor',
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro.message).toContain('prova.sem-valor')
    expect(r.erro.problemas.map((p) => p.caminho)).toEqual(expect.arrayContaining(['[].patrimonio', '[].quantidade']))
    expect(linhasDeLog.length, 'o registrarFalha tem de ter escrito a linha').toBeGreaterThan(0)
    semSentinela(r.erro.message, serializado(r.erro), serializado(r.erro.problemas), ...linhasDeLog)
  })

  it('jsonb com chave DINÂMICA (record): o caminho leva <chave>, nunca a chave', () => {
    const forma = z.strictObject({ id: z.string(), contagens: z.record(z.string(), z.number()) })
    const r = linhaOuFalha(
      doBanco<z.output<typeof forma>>({ id: 'x', contagens: { CHAVE_SENTINELA_DE_ITEM: 'Nome Sentinela da Silva' } }),
      forma,
      'prova.record',
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erro.problemas[0]?.caminho).toBe('contagens.<chave>')
    semSentinela(r.erro.message, serializado(r.erro), ...linhasDeLog)
  })

  it('chave DESCONHECIDA num objeto estrito: a issue leva a contagem, não o nome', () => {
    const forma = z.strictObject({ dados: z.strictObject({ versao: z.number() }) })
    const r = valorOuFalha(
      doBanco<z.output<typeof forma>>({ dados: { versao: 2, CHAVE_SENTINELA_DE_ITEM: 1, 'filial-sentinela': 2 } }),
      forma,
      'prova.chave-desconhecida',
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    const p = r.erro.problemas.find((x) => x.codigo === 'unrecognized_keys')
    expect(p?.chaves).toBe(2)
    expect(p?.caminho).toBe('dados')
    semSentinela(r.erro.message, serializado(r.erro), ...linhasDeLog)
  })

  it('valor fora do enum e e-mail em coluna errada: nenhum valor na saída', () => {
    const forma = z.strictObject({ status: z.enum(['em_estoque', 'em_uso']), contato: z.number() })
    const r = linhasOuFalha(
      doBanco<z.output<typeof forma>[]>([{ status: 'filial-sentinela', contato: 'fulano.sentinela@wap.ind.br' }]),
      forma,
      'prova.enum',
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    semSentinela(r.erro.message, serializado(r.erro), ...linhasDeLog)
  })
})

describe('a normalização do caminho', () => {
  const forma = z.strictObject({
    lista: z.array(z.strictObject({ rotulo: z.string() })),
    mapa: z.record(z.string(), z.strictObject({ total: z.number() })),
    talvez: z.strictObject({ fundo: z.array(z.number()) }).nullable(),
  })
  it.each([
    [['lista', 3, 'rotulo'], 'lista[].rotulo'],
    [['mapa', 'CHAVE_SENTINELA_DE_ITEM', 'total'], 'mapa.<chave>.total'],
    [['talvez', 'fundo', 7], 'talvez.fundo[]'],
    [['coluna_que_nao_existe'], '<chave>'],
  ])('%j → %s', (caminho, esperado) => {
    expect(caminhoNormalizado(forma, caminho as PropertyKey[])).toBe(esperado)
  })

  it('conferirValores prefixa o índice da linha com []', () => {
    const c = conferirValores([{ lista: [{ rotulo: 1 }], mapa: {}, talvez: null }], forma, ['[]'])
    expect(c.recusas[0]?.problemas[0]?.caminho).toBe('[].lista[].rotulo')
  })
})
