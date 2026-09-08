import { describe, expect, it , vi } from 'vitest'

// F49 — um módulo de `@/lib/queries/**` (ou algo que ele alcança) passou a declarar
// `import 'server-only'`, que é a fronteira RSC: ele existe para QUEBRAR o build se um
// Client Component importar a query. No ambiente `node` do Vitest esse import lança
// sempre, então o stub vazio. Não afrouxa nada — quem prova a fronteira é o
// `npm run build` (ver `src/lib/queries/servidor-apenas.test.ts`).
vi.mock('server-only', () => ({}))
import { dedupPorFrequencia, MAX_SUGESTOES } from '@/lib/queries/compras'

// A4 (F10) — a sugestão de marca/modelo/fornecedor existe para fazer a grafia
// CONVERGIR. Dentro de uma mesma chave normalizada ("dell") tem de vencer a
// grafia MAIS USADA no acervo; eleger a primeira em ordem alfabética espalharia
// a divergência com a chancela do sistema (achado da revisão adversarial da F10).
// Valores fictícios — nenhum fornecedor/marca real do acervo entra aqui.
describe('dedupPorFrequencia (A4 — sugestões do acervo)', () => {
  function repetir(valor: string, n: number): string[] {
    return Array.from({ length: n }, () => valor)
  }

  it('elege a grafia MAIS FREQUENTE da chave, não a alfabética', () => {
    // 900 "DELL" × 12 "Dell": alfabeticamente (pt-BR) "Dell" vem primeiro.
    const valores = [...repetir('DELL', 900), ...repetir('Dell', 12)]
    expect(dedupPorFrequencia(valores)).toEqual(['DELL'])
  })

  it('vale nos dois sentidos (a maioria decide, seja qual for a caixa)', () => {
    const valores = [...repetir('Dell', 900), ...repetir('DELL', 12)]
    expect(dedupPorFrequencia(valores)).toEqual(['Dell'])
  })

  it('empate técnico cai na ordem alfabética pt-BR (critério antigo)', () => {
    expect(dedupPorFrequencia(['DELL', 'Dell'])).toEqual(['Dell'])
  })

  it('agrupa ignorando caixa e espaços das pontas', () => {
    const r = dedupPorFrequencia([' Dell ', 'dell', 'Dell', 'Acme Fictícia'])
    expect(r).toContain('Dell')
    expect(r).toHaveLength(2)
  })

  it('ordena as chaves pelo total do grupo (soma das grafias)', () => {
    const valores = [
      ...repetir('Acme Fictícia', 5),
      ...repetir('BETA FICTÍCIA', 4),
      ...repetir('Beta Fictícia', 4),
    ]
    // Beta soma 8 (4 + 4) e passa à frente de Acme, com a grafia empatada
    // resolvida pelo alfabeto (em pt-BR a minúscula vem antes).
    expect(dedupPorFrequencia(valores)).toEqual(['Beta Fictícia', 'Acme Fictícia'])
  })

  it('descarta nulos e vazios e devolve no máximo MAX_SUGESTOES', () => {
    const valores = [
      null,
      '',
      '   ',
      ...Array.from({ length: MAX_SUGESTOES + 5 }, (_, i) => `Marca ${i}`),
    ]
    const r = dedupPorFrequencia(valores)
    expect(r).toHaveLength(MAX_SUGESTOES)
    expect(r.every((v) => v.trim().length > 0)).toBe(true)
  })
})
