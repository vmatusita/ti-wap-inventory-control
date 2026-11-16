import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TABELAS_ASSINADAS, opcoesDaAssinatura } from './assinatura-realtime'
import { chaveDeStorage, chaveDoEscopo, nomeDoCanal } from '@/lib/escopo/chave'

// O GANCHO DO ESCOPO NO TEMPO REAL (F50) — e o FILTRO DE EMPRESA (F67B, 16/11/2026).
//
// Três coisas são travadas aqui:
//   1. as três assinaturas saem de UMA função — três objetos montados à mão divergem
//      sozinhos, e no dia do `filter:` de escopo divergiriam justamente onde importa;
//   2. desde a F67B, TODA assinatura emite `filter: 'empresa_id=eq.<uuid>'` — a empresa vem do
//      SERVIDOR (o Server Component a passa por prop) e é validada aqui: vazia ou malformada é
//      recusada, nunca vira um filtro que não casa nada (o canal pararia de acordar em silêncio);
//   3. o componente não monta assinatura nem filtro por fora dela, e recebe a empresa por prop.
// A segurança NÃO é o filtro: é a policy de SELECT de cada tabela, que o Realtime confere por
// assinante (docs/PLAN-F67B.md, decisão 13; a trava de catálogo é o §9 de catalogo_policies.sql).
const FONTE_COMPONENTE = readFileSync(
  join(process.cwd(), 'src', 'components', 'relatorios', 'realtime-refresh.tsx'),
  'utf8',
)
const EMPRESA = '00000000-0000-4000-a000-000000000001'

describe('opcoesDaAssinatura: uma função para as três tabelas, com a empresa', () => {
  it('as três tabelas assinadas são exatamente as de sempre', () => {
    expect([...TABELAS_ASSINADAS]).toEqual(['movimentacoes', 'lancamentos_item', 'anotacoes'])
  })

  it('TABELAS_ASSINADAS é EXATAMENTE a publication congelada no catálogo (k_realtime), nos dois sentidos', () => {
    // A trava de catálogo (catalogo_policies.sql §9: 9a/9b o conjunto; 9c–9e a RLS, o recorte e a replica identity de
    // cada tabela) só vale para o que o app assina se as duas listas forem a MESMA — tabela assinada fora da publication
    // nunca acorda; tabela na publication fora da lista é um canal que ninguém audita aqui.
    const sql = readFileSync(join(process.cwd(), 'supabase', 'tests', 'catalogo_policies.sql'), 'utf8')
    const m = /k_realtime\s+text\[\]\s*:=\s*array\[([^\]]*)\]/.exec(sql)
    expect(m, 'k_realtime não encontrado em catalogo_policies.sql').not.toBeNull()
    const doCatalogo = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort()
    expect([...TABELAS_ASSINADAS].sort()).toEqual(doCatalogo)
  })

  it('devolve INSERT no schema public, com o filtro da empresa — SEMPRE', () => {
    for (const t of TABELAS_ASSINADAS) {
      expect(opcoesDaAssinatura(t, EMPRESA)).toEqual({
        event: 'INSERT',
        schema: 'public',
        table: t,
        filter: `empresa_id=eq.${EMPRESA}`,
      })
    }
  })

  it('o filtro é provadamente TOTAL hoje: as três tabelas têm empresa_id (0160/0161) e 0 linhas fora da legada', () => {
    // A régua da F50 — não emitir filtro que não se consiga provar total — continua: medido em
    // produção em 16/11/2026 (docs/f67b-evidencias/antes/producao/contagens.txt), as três tabelas
    // da publication têm a coluna e nenhuma linha fora da empresa legada. Um filtro errado não dá
    // erro: o canal para de acordar e o selo "ao vivo" mente — por isso a empresa é validada.
    for (const t of TABELAS_ASSINADAS) {
      expect(opcoesDaAssinatura(t, EMPRESA).filter).toMatch(
        /^empresa_id=eq\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )
    }
  })

  it.each([
    ['vazia', ''],
    ['só espaços', '   '],
    ['maiúscula', EMPRESA.toUpperCase()],
    ['sem hífens', EMPRESA.replace(/-/g, '')],
    ['com vírgula (um segundo filtro escondido)', `${EMPRESA},filial_id=eq.1`],
    ['com operador', `neq.${EMPRESA}`],
  ])('recusa empresa %s (nunca emite filtro que não casa nada)', (_nome, valor) => {
    expect(() => opcoesDaAssinatura('movimentacoes', valor)).toThrow()
  })
})

describe('o componente não monta assinatura à mão, e recebe a empresa do servidor', () => {
  it('as opções vêm de `opcoesDaAssinatura`, com a empresa da prop', () => {
    expect(FONTE_COMPONENTE).toContain('opcoesDaAssinatura(tabela, empresaId)')
    // O jeito antigo: `{ event: 'INSERT', schema: 'public', table: 'x' }` escrito no
    // componente, três vezes. Se voltar, as três divergem de novo.
    expect(
      /\{\s*event:\s*'INSERT'/.test(FONTE_COMPONENTE),
      'assinatura montada à mão no componente — use `opcoesDaAssinatura`',
    ).toBe(false)
    expect(/filter\s*:/.test(FONTE_COMPONENTE), 'filtro montado à mão no componente').toBe(false)
  })

  it('a empresa chega por PROP (o componente é "use client" e não a lê do navegador)', () => {
    expect(FONTE_COMPONENTE).toMatch(
      /export function RealtimeRefresh\(\{\s*empresaId\s*\}:\s*\{\s*empresaId:\s*string\s*\}\)/,
    )
    expect(FONTE_COMPONENTE).not.toMatch(/empresaDaOperacao|EMPRESA_LEGADA_ID/)
    // a empresa entra nas dependências do efeito: trocar a empresa refaz o canal
    expect(FONTE_COMPONENTE).toContain('[router, empresaId]')
  })

  it('as três montagens passam a empresa do servidor', () => {
    for (const pagina of [
      ['relatorios', '[filial]', 'page.tsx'],
      ['itens', 'page.tsx'],
      ['itens', 'historico', 'page.tsx'],
    ]) {
      const fonte = readFileSync(join(process.cwd(), 'src', 'app', '(app)', ...pagina), 'utf8')
      expect(fonte, pagina.join('/')).toContain('<RealtimeRefresh empresaId={empresaDaOperacao()} />')
      expect(fonte, pagina.join('/')).not.toContain('<RealtimeRefresh />')
    }
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
