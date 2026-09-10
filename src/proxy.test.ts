import { describe, expect, it } from 'vitest'
import { config } from '@/proxy'

// O MATCHER DO PROXY, PROVADO ROTA A ROTA (F55).
//
// POR QUE ESTE ARQUIVO EXISTE. A F55 acrescentou UMA exclusão ao `matcher` —
// `api/saude`, para a sonda sem sessão não receber um 307 no lugar da resposta.
// Uma exclusão no matcher é a coisa mais barata de escrever e a mais perigosa de
// errar: ela não quebra nada, não acusa nada, e a rota simplesmente passa a viver
// **fora do roteamento de acesso**. Um `|` no lugar errado abriria o site inteiro.
//
// ⚠ E A REVISÃO ADVERSARIAL ACHOU EXATAMENTE ISSO na primeira escrita: sem o `$`,
// o `(?!…)` casa por PREFIXO, e `/api/saude-financeira` ou `/api/saudeanimal`
// nasceriam sem sessão — contrariando a garantia escrita no próprio comentário do
// arquivo ("rota nova de API nasce protegida por padrão").
//
// O que este teste NÃO prova: o que `updateSession` faz DEPOIS de o matcher deixar
// passar. Isso é `supabase/tests/papeis_rls.sql` e a Parte A do smoke.

/** O matcher, compilado como o Next o compila: ancorado nas duas pontas. */
function casaOMatcher(pathname: string): boolean {
  const padroes = config.matcher as string[]
  return padroes.some((p) => new RegExp(`^${p}$`).test(pathname))
}

describe('o matcher declara UM padrão só', () => {
  it('é um array com um padrão', () => {
    expect(Array.isArray(config.matcher)).toBe(true)
    expect(config.matcher).toHaveLength(1)
  })
})

describe('as rotas que o proxy TEM de ver', () => {
  it.each([
    ['/', 'o dashboard'],
    ['/login', 'a porta pública'],
    ['/ativos', 'a lista'],
    ['/ativos/WAP0000000', 'uma ficha'],
    ['/pendencias', 'a mesa'],
    ['/relatorios/matriz', 'o relatório ao vivo'],
    ['/relatorios/acesso', 'a entrada por senha'],
    ['/admin/usuarios', 'a área de administração'],
    ['/dev', 'a área do desenvolvedor'],
    ['/itens', 'a rota do desvio do link legado'],
    ['/api/outra-coisa', 'uma rota de API QUALQUER — ela nasce PROTEGIDA'],
  ])('%s (%s) passa pelo proxy', (rota) => {
    expect(casaOMatcher(rota), `${rota} ficou FORA do proxy`).toBe(true)
  })
})

describe('a única rota excluída é a sonda, e ela é EXATA', () => {
  it('/api/saude é excluída', () => {
    expect(casaOMatcher('/api/saude')).toBe(false)
  })

  // ⚠ REGRESSÃO DA REVISÃO ADVERSARIAL: sem o `$`, as três abaixo também
  // escapariam, e nasceriam sem sessão sem ninguém notar.
  it.each(['/api/saude-financeira', '/api/saudeanimal', '/api/saude/interna', '/api/saude/'])(
    '%s NÃO é excluída — o `$` fecha a exclusão na rota exata',
    (rota) => {
      expect(casaOMatcher(rota), `${rota} escapou do proxy por prefixo`).toBe(true)
    },
  )

  it('o padrão tem o `$` depois de `api/saude` (a trava textual, além da de comportamento)', () => {
    expect((config.matcher as string[])[0]).toContain('api/saude$')
  })
})

describe('os assets continuam fora, como sempre estiveram', () => {
  it.each([
    '/_next/static/chunks/main.js',
    '/_next/image',
    '/favicon.ico',
    '/marca.svg',
    '/foto.png',
    '/foto.JPG',
  ])('%s é excluída', (caminho) => {
    // `.JPG` maiúsculo: o padrão é case-sensitive e NÃO o exclui. É o
    // comportamento de hoje, herdado — registrado aqui para não ser confundido
    // com algo que a F55 quebrou.
    const excluido = !casaOMatcher(caminho)
    if (caminho === '/foto.JPG') expect(excluido).toBe(false)
    else expect(excluido, `${caminho} deveria ficar fora do proxy`).toBe(true)
  })
})
