import { describe, it, expect , vi } from 'vitest'

// F49 — um módulo de `@/lib/queries/**` (ou algo que ele alcança) passou a declarar
// `import 'server-only'`, que é a fronteira RSC: ele existe para QUEBRAR o build se um
// Client Component importar a query. No ambiente `node` do Vitest esse import lança
// sempre, então o stub vazio. Não afrouxa nada — quem prova a fronteira é o
// `npm run build` (ver `src/lib/queries/servidor-apenas.test.ts`).
vi.mock('server-only', () => ({}))
import {
  DESTINO_LEGADO,
  IDS_LEGADOS,
  SECOES,
  resolverDestinoLegado,
  textoDaSecao,
} from '@/lib/ajuda/legado'
import { PAGINAS, ancorasDaPagina, paginaPorSlug } from '@/lib/ajuda/registry'
import type { SecaoLegada } from '@/lib/ajuda/tipos'

// Os 10 ids da ajuda de pagina unica (F6B→F19). Estao aqui LITERALMENTE de
// proposito: se alguem apagar uma linha de DESTINO_LEGADO, o favorito do
// operador vira 404 silencioso — e este teste falha antes disso acontecer.
const IDS_DA_AJUDA_ANTIGA: SecaoLegada[] = [
  'conceito',
  'status',
  'movimentacoes',
  'termos',
  'itens',
  'pendencias',
  'relatorios',
  'como-fazer',
  'admin',
  'acesso',
]

describe('compatibilidade das âncoras antigas (/ajuda#<id>)', () => {
  it('os 10 ids continuam tendo destino', () => {
    expect([...IDS_LEGADOS].sort()).toEqual([...IDS_DA_AJUDA_ANTIGA].sort())
    for (const id of IDS_DA_AJUDA_ANTIGA) {
      expect(DESTINO_LEGADO[id], `âncora sem destino: #${id}`).toBeTruthy()
    }
  })

  it('todo destino existe de verdade (página do registry ou âncora do índice)', () => {
    for (const [id, destino] of Object.entries(DESTINO_LEGADO)) {
      if (destino.startsWith('/ajuda#')) {
        // Âncora do índice = uma categoria. As categorias são renderizadas com
        // id = chave, então basta a chave existir.
        const chave = destino.slice('/ajuda#'.length)
        expect(
          PAGINAS.some((p) => p.categoria === chave),
          `#${id} aponta para a categoria inexistente ${chave}`,
        ).toBe(true)
        continue
      }
      const [rota, ancora] = destino.split('#')
      const slug = rota.replace('/ajuda/', '')
      const pagina = paginaPorSlug(slug)
      expect(pagina, `#${id} aponta para a página inexistente ${slug}`).toBeDefined()
      if (ancora) {
        expect(ancorasDaPagina(pagina!).map((a) => a.id)).toContain(ancora)
      }
    }
  })

  it('resolve o hash com e sem "#", e com escape de URL', () => {
    expect(resolverDestinoLegado('#status')).toBe('/ajuda/status-do-ativo')
    expect(resolverDestinoLegado('status')).toBe('/ajuda/status-do-ativo')
    expect(resolverDestinoLegado('#como-fazer')).toBe('/ajuda#fazer')
    expect(resolverDestinoLegado('#%63omo-fazer')).toBe('/ajuda#fazer')
  })

  it('é lista branca: hash desconhecido não redireciona nada', () => {
    expect(resolverDestinoLegado('')).toBeNull()
    expect(resolverDestinoLegado('#')).toBeNull()
    expect(resolverDestinoLegado('#Status')).toBeNull() // case-sensitive, como o navegador
    expect(resolverDestinoLegado('#../../admin')).toBeNull()
    expect(resolverDestinoLegado('#%E2')).toBeNull() // hash malformado não estoura
    expect(resolverDestinoLegado('#javascript:alert(1)')).toBeNull()
  })

  it('não entrega nada herdado do Object.prototype', () => {
    // Achado da revisão adversarial da F20: com `mapa[alvo]`, `#toString`
    // devolvia a FUNÇÃO nativa (truthy) e o `.split('#')` seguinte derrubava o
    // índice da ajuda. A chave tem de ser PRÓPRIA do mapa.
    for (const veneno of [
      '#toString',
      '#constructor',
      '#valueOf',
      '#__proto__',
      '#hasOwnProperty',
      '#isPrototypeOf',
      '#propertyIsEnumerable',
      '#__defineGetter__',
    ]) {
      expect(resolverDestinoLegado(veneno), veneno).toBeNull()
    }
  })

  it('todo destino é uma string de rota — nunca uma função', () => {
    for (const id of IDS_DA_AJUDA_ANTIGA) {
      const destino = resolverDestinoLegado(`#${id}`)
      expect(typeof destino).toBe('string')
      expect(destino!.startsWith('/ajuda')).toBe(true)
    }
  })
})

describe('visão de compatibilidade (o guarda-corpo do "nada se perdeu")', () => {
  it('as 10 seções antigas existem e nenhuma ficou sem conteúdo', () => {
    expect(SECOES.map((s) => s.id).sort()).toEqual([...IDS_DA_AJUDA_ANTIGA].sort())
    for (const s of SECOES) {
      expect(s.blocos.length, `seção legada vazia: ${s.id}`).toBeGreaterThan(0)
      expect(textoDaSecao(s).length).toBeGreaterThan(0)
    }
  })

  it('toda seção antiga é herdada por ao menos uma página', () => {
    for (const id of IDS_DA_AJUDA_ANTIGA) {
      const herdeiras = PAGINAS.filter((p) => p.legado?.includes(id))
      expect(herdeiras.length, `ninguém herdou a seção #${id}`).toBeGreaterThan(0)
    }
  })

  it('todo `legado` declarado é um id que existiu de verdade', () => {
    for (const p of PAGINAS) {
      for (const id of p.legado ?? []) {
        expect(IDS_DA_AJUDA_ANTIGA, `${p.slug} declara legado inexistente`).toContain(id)
      }
    }
  })
})
