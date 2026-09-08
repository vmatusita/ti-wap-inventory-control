import { describe, it, expect } from 'vitest'
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
  })

  it('o módulo é PURO — sem React, sem Supabase, sem DOM', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'lib', 'escopo', 'chave.ts'), 'utf8')
    for (const proibido of ['react', 'supabase', 'server-only', 'use client']) {
      expect(fonte.toLowerCase(), `chave.ts importou ${proibido}`).not.toContain(
        `from '${proibido}`,
      )
    }
  })
})
