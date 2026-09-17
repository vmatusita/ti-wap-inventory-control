import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TABELAS_ASSINADAS, opcoesDaAssinatura } from './assinatura-realtime'
import { chaveDeStorage, chaveDoEscopo, nomeDoCanal } from '@/lib/escopo/chave'

// O GANCHO DO ESCOPO NO TEMPO REAL (F50).
//
// Duas coisas são travadas aqui, e as duas por escrito antes de existir motivo:
//   1. as três assinaturas saem de UMA função — três objetos montados à mão divergem
//      sozinhos, e no dia do `filter:` de escopo divergiriam justamente onde importa;
//   2. nenhum `filter` é emitido enquanto não se puder provar que ele é total.
const FONTE_COMPONENTE = readFileSync(
  join(process.cwd(), 'src', 'components', 'relatorios', 'realtime-refresh.tsx'),
  'utf8',
)

describe('opcoesDaAssinatura: uma função para as três tabelas', () => {
  it('as três tabelas assinadas são exatamente as de sempre', () => {
    expect([...TABELAS_ASSINADAS]).toEqual(['movimentacoes', 'lancamentos_item', 'anotacoes'])
  })

  it('devolve INSERT no schema public, sem filtro', () => {
    for (const t of TABELAS_ASSINADAS) {
      expect(opcoesDaAssinatura(t)).toEqual({ event: 'INSERT', schema: 'public', table: t })
    }
  })

  it('NENHUMA assinatura emite `filter` hoje', () => {
    // A régua da fase: não emitir filtro que não se consiga provar total. Medido —
    // a tela consolidada (`geral`) precisa acordar com INSERT de qualquer filial, duas
    // das três montagens do componente nem são de relatório, e `anotacoes` não tem
    // `filial_id` (0017:6-13), então para ela o filtro é impossível hoje.
    //
    // Um filtro errado não dá erro: ele faz o canal parar de acordar, o selo "ao vivo"
    // mente, e ninguém percebe por semanas. Quando o `filter` de escopo entrar, é
    // AQUI que este teste muda — de propósito, com alguém olhando.
    for (const t of TABELAS_ASSINADAS) {
      expect(opcoesDaAssinatura(t).filter, `${t} ganhou filtro sem passar por esta trava`).toBeUndefined()
    }
  })
})

describe('o componente não monta assinatura à mão', () => {
  it('as opções vêm de `opcoesDaAssinatura`, e nenhum objeto é montado no fonte', () => {
    expect(FONTE_COMPONENTE).toContain('opcoesDaAssinatura(')
    // O jeito antigo: `{ event: 'INSERT', schema: 'public', table: 'x' }` escrito no
    // componente, três vezes. Se voltar, as três divergem de novo.
    expect(
      /\{\s*event:\s*'INSERT'/.test(FONTE_COMPONENTE),
      'assinatura montada à mão no componente — use `opcoesDaAssinatura`',
    ).toBe(false)
  })

  it('nenhuma tabela é assinada por fora da lista', () => {
    // `.on('postgres_changes', …)` com nome de tabela literal no componente.
    const literais = [...FONTE_COMPONENTE.matchAll(/table:\s*'([a-z_]+)'/g)].map((m) => m[1])
    expect(literais, 'tabela assinada fora de TABELAS_ASSINADAS').toEqual([])
  })

  it('o nome do canal é PARAMETRIZADO, não literal', () => {
    expect(FONTE_COMPONENTE).toContain('nomeDoCanal(')
    expect(
      FONTE_COMPONENTE.includes(".channel('relatorio-tempo-real')"),
      'o nome do canal voltou a ser literal — a virada precisa dele parametrizado',
    ).toBe(false)
  })
})

describe('chaveDoEscopo serve aos DOIS consumidores', () => {
  it('devolve a chave do escopo corrente', () => {
    expect(chaveDoEscopo()).toBe('wap')
  })

  it('compõe nome de canal (F50)', () => {
    expect(nomeDoCanal('relatorio-tempo-real')).toBe('wap:relatorio-tempo-real')
  })

  it('compõe chave de storage IDÊNTICA às literais de hoje (F61)', () => {
    // Esta é a asserção que protege a F61 de uma regressão silenciosa: se o prefixo
    // mudar, todo rascunho e toda preferência já gravados no navegador viram lixo
    // inalcançável no primeiro deploy. "Sumiu meu rascunho" é o tipo de defeito que
    // ninguém liga à refatoração que o causou.
    expect(chaveDeStorage('compra:defaults')).toBe('wap:compra:defaults')
    expect(chaveDeStorage('mov:rascunho')).toBe('wap:mov:rascunho')
    expect(chaveDeStorage('relatorios:ultimo')).toBe('wap:relatorios:ultimo')
    expect(chaveDeStorage('ativos:recentes')).toBe('wap:ativos:recentes')
    expect(chaveDeStorage('ativos:ultima-lista')).toBe('wap:ativos:ultima-lista')
    expect(chaveDeStorage('compra:rascunho')).toBe('wap:compra:rascunho')
    // F61 — a sétima, que esta lista esquecia: a da conferência, com a filial no sufixo.
    expect(chaveDeStorage('itens:conferencia:3')).toBe('wap:itens:conferencia:3')
  })

  // F61 — AS SETE CONSTRUTORAS, e não só a composição. A F61 trocou as constantes de
  // módulo (`CHAVE_RASCUNHO = 'wap:mov:rascunho'`…) por funções que chamam
  // `chaveDeStorage` NO USO. O que protege o rascunho de quem já tem um gravado é esta
  // lista: cada construtora, chamada de verdade, devolve BYTE A BYTE a literal de antes.
  const SETE: readonly [string, () => Promise<string>, string][] = [
    ['compra:defaults (local)', async () => (await import('@/components/ativos/rascunho-compra')).chaveCompraDefaults(), 'wap:compra:defaults'],
    ['compra:rascunho', async () => (await import('@/components/ativos/rascunho-compra')).chaveRascunhoCompra(), 'wap:compra:rascunho'],
    ['mov:rascunho', async () => (await import('@/components/movimentacoes/nova/rascunho')).chaveRascunhoMovimentacao(), 'wap:mov:rascunho'],
    ['itens:conferencia:<filial>', async () => (await import('@/components/itens/conferencia/rascunho')).chaveRascunhoConferencia(3), 'wap:itens:conferencia:3'],
    ['ativos:ultima-lista', async () => (await import('@/components/ativos/lista-visitada')).chaveListaAtivos(), 'wap:ativos:ultima-lista'],
    ['ativos:recentes', async () => (await import('@/lib/ativos/ativos-recentes')).chaveAtivosRecentes(), 'wap:ativos:recentes'],
    ['relatorios:ultimo', async () => (await import('@/components/relatorios/relatorio-visitado')).chaveRelatorioVisitado(), 'wap:relatorios:ultimo'],
  ]

  it.each(SETE)('a construtora de %s devolve a chave de antes, byte a byte (F61)', async (_nome, obter, esperada) => {
    expect(await obter()).toBe(esperada)
    // Timeout explícito, no molde de sem-wapismo.test.ts: o PRIMEIRO import dinâmico
    // transforma a árvore do módulo a frio (medido: ~10 s nesta mesa). É o relógio do
    // runner, não a afirmação, que muda.
  }, 60_000)

  it('trocar o prefixo de chaveDeStorage derruba as SETE afirmações (sabotagem I)', async () => {
    // Em memória: o módulo de escopo é substituído por um que devolve outro prefixo, e as
    // sete construtoras são reimportadas por cima dele. Se alguma continuasse devolvendo a
    // literal antiga, ela não estaria passando pela construtora — e a trava falharia.
    vi.resetModules()
    vi.doMock('@/lib/escopo/chave', () => ({
      chaveDoEscopo: () => 'xyz',
      nomeDoCanal: (base: string) => `xyz:${base}`,
      chaveDeStorage: (base: string) => `xyz:${base}`,
    }))
    try {
      const resultados = await Promise.all(SETE.map(async ([nome, obter, esperada]) => ({ nome, obtida: await obter(), esperada })))
      expect(resultados.filter((r) => r.obtida === r.esperada).map((r) => r.nome)).toEqual([])
      expect(resultados.every((r) => r.obtida.startsWith('xyz:'))).toBe(true)
    } finally {
      vi.doUnmock('@/lib/escopo/chave')
      vi.resetModules()
    }
  }, 60_000)

  it('o módulo é PURO — sem React, sem Supabase, sem DOM', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'lib', 'escopo', 'chave.ts'), 'utf8')
    for (const proibido of ['react', 'supabase', 'server-only', 'use client']) {
      expect(fonte.toLowerCase(), `chave.ts importou ${proibido}`).not.toContain(
        `from '${proibido}`,
      )
    }
  })
})
