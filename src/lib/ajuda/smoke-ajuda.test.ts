import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect , vi } from 'vitest'

// F49 — um módulo de `@/lib/queries/**` (ou algo que ele alcança) passou a declarar
// `import 'server-only'`, que é a fronteira RSC: ele existe para QUEBRAR o build se um
// Client Component importar a query. No ambiente `node` do Vitest esse import lança
// sempre, então o stub vazio. Não afrouxa nada — quem prova a fronteira é o
// `npm run build` (ver `src/lib/queries/servidor-apenas.test.ts`).
vi.mock('server-only', () => ({}))
import { PAGINAS } from '@/lib/ajuda/registry'

// `scripts/smoke/smoke-prod.mjs` e um script .mjs: nao importa TypeScript, entao
// carrega uma COPIA da lista de paginas da documentacao. Copia envelhece — e um
// smoke que nao confere a pagina nova da a impressao de que conferiu tudo.
// Este teste le o script e compara com o registry: pagina nova (ou renomeada)
// sem entrada la quebra o `npm run test`, antes do deploy.
const SMOKE = join(process.cwd(), 'scripts', 'smoke', 'smoke-prod.mjs')

function paginasDoSmoke(): [string, string][] {
  const fonte = readFileSync(SMOKE, 'utf8')
  const bloco = fonte.match(/const PAGINAS_AJUDA = \[([\s\S]*?)\n\]/)
  if (!bloco) throw new Error('PAGINAS_AJUDA não encontrado em scripts/smoke/smoke-prod.mjs')
  return [...bloco[1].matchAll(/\[\s*'([^']+)'\s*,\s*'([^']*)'\s*\]/g)].map((m) => [m[1], m[2]])
}

describe('smoke de produção × registry da documentação', () => {
  it('o smoke cobre exatamente as páginas do registry', () => {
    const doSmoke = paginasDoSmoke().map(([slug]) => slug).sort()
    const doRegistry = PAGINAS.map((p) => p.slug).sort()
    expect(doSmoke).toEqual(doRegistry)
  })

  it('o marcador de cada página é o título real (o que o <h1> renderiza)', () => {
    for (const [slug, marcador] of paginasDoSmoke()) {
      const pagina = PAGINAS.find((p) => p.slug === slug)!
      expect(marcador, `marcador de ${slug}`).toBe(pagina.titulo)
    }
  })

  it('o manual completo também é conferido', () => {
    expect(readFileSync(SMOKE, 'utf8')).toContain("rota: '/ajuda/manual'")
  })
})
