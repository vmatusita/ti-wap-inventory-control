import { describe, it, expect , vi } from 'vitest'

// F49 — um módulo de `@/lib/queries/**` (ou algo que ele alcança) passou a declarar
// `import 'server-only'`, que é a fronteira RSC: ele existe para QUEBRAR o build se um
// Client Component importar a query. No ambiente `node` do Vitest esse import lança
// sempre, então o stub vazio. Não afrouxa nada — quem prova a fronteira é o
// `npm run build` (ver `src/lib/queries/servidor-apenas.test.ts`).
vi.mock('server-only', () => ({}))
import { resolverAncora } from '@/lib/ajuda/ancora'
import { SECOES } from '@/lib/ajuda/conteudo'

// Os 10 ids da ajuda de pagina unica (F6B→F19), pela visao de compatibilidade.
// Desde a F20 quem passa `ids` para `AncoraAoMontar` e `ancorasDaPagina(pagina)`
// (registry.ts) — os ids legados nunca chegam la; eles vivem no redirecionador.
const IDS = SECOES.map((s) => s.id)

describe('resolverAncora', () => {
  it('resolve o hash com "#" para o id da seção', () => {
    expect(resolverAncora('#itens', IDS)).toBe('itens')
  })

  it('aceita o id sem "#" (location.hash já vem com, mas não dependemos disso)', () => {
    expect(resolverAncora('itens', IDS)).toBe('itens')
  })

  it('devolve null para hash vazio', () => {
    expect(resolverAncora('', IDS)).toBeNull()
    expect(resolverAncora('#', IDS)).toBeNull()
  })

  it('devolve null para âncora que não é seção (lista branca)', () => {
    expect(resolverAncora('#nao-existe', IDS)).toBeNull()
    expect(resolverAncora('#top', IDS)).toBeNull()
  })

  it('resolve id com hífen', () => {
    expect(resolverAncora('#como-fazer', IDS)).toBe('como-fazer')
  })

  it('é case-sensitive, igual ao getElementById do navegador', () => {
    expect(resolverAncora('#Itens', IDS)).toBeNull()
    expect(resolverAncora('#COMO-FAZER', IDS)).toBeNull()
  })

  it('decodifica percent-encoding', () => {
    expect(resolverAncora('#como%2Dfazer', IDS)).toBe('como-fazer')
    expect(resolverAncora('#%69tens', IDS)).toBe('itens')
  })

  it('não lança em hash malformado — devolve null', () => {
    expect(() => resolverAncora('#%E2', IDS)).not.toThrow()
    expect(resolverAncora('#%E2', IDS)).toBeNull()
    expect(resolverAncora('#%', IDS)).toBeNull()
  })

  it('usa o texto cru quando o decode falha mas o cru é uma seção válida', () => {
    // '%' solto quebra o decode; o cru continua sendo comparado com a lista.
    expect(resolverAncora('#itens%', IDS)).toBeNull()
  })

  it('devolve null com lista de ids vazia (nada é seletor válido)', () => {
    expect(resolverAncora('#itens', [])).toBeNull()
  })

  it('não deixa o hash virar seletor arbitrário de DOM', () => {
    expect(resolverAncora('#__next', IDS)).toBeNull()
    expect(resolverAncora('#body', IDS)).toBeNull()
    expect(resolverAncora('#itens x', IDS)).toBeNull()
  })

  it('resolve TODAS as seções reais do manual', () => {
    for (const id of IDS) {
      expect(resolverAncora(`#${id}`, IDS)).toBe(id)
    }
    expect(IDS).toHaveLength(10)
  })

  // F20: este teste dizia "cobre as âncoras usadas hoje pelo LinkAjuda das
  // telas". Desde a F20 NENHUM `LinkAjuda` usa âncora — ele aponta para uma
  // PÁGINA (`registry.test.ts` falha se alguém voltar a usar `ancora=`). O que
  // continua verdadeiro, e vale travar, é que os 10 ids antigos seguem
  // resolvendo na lista branca; o destino de cada um é coisa de `legado.test.ts`.
  it('os 10 ids da ajuda de página única continuam resolvendo', () => {
    for (const id of IDS) {
      expect(resolverAncora(`#${id}`, IDS)).toBe(id)
    }
  })
})
