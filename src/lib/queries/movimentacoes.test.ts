import { describe, expect, it , vi } from 'vitest'

// F49 — um módulo de `@/lib/queries/**` (ou algo que ele alcança) passou a declarar
// `import 'server-only'`, que é a fronteira RSC: ele existe para QUEBRAR o build se um
// Client Component importar a query. No ambiente `node` do Vitest esse import lança
// sempre, então o stub vazio. Não afrouxa nada — quem prova a fronteira é o
// `npm run build` (ver `src/lib/queries/servidor-apenas.test.ts`).
vi.mock('server-only', () => ({}))
import {
  interpretarBuscaMovimentacao,
  patrimoniosAmbiguosNaPagina,
} from '@/lib/queries/movimentacoes'

// F11/M8 — a busca da lista de movimentações é de CAMPO ÚNICO (decisão do
// Johnny): o PostgREST não faz `OR` entre a tabela e um embed, então o termo
// precisa escolher UM lado. Quem escolhe é esta função pura.
// Dados 100% fictícios (CLAUDE.md regra 2).
describe('interpretarBuscaMovimentacao', () => {
  it('sem termo (vazio, só espaços, null/undefined) não filtra nada', () => {
    expect(interpretarBuscaMovimentacao('')).toBeNull()
    expect(interpretarBuscaMovimentacao('   ')).toBeNull()
    expect(interpretarBuscaMovimentacao(null)).toBeNull()
    expect(interpretarBuscaMovimentacao(undefined)).toBeNull()
  })

  it('texto que canonicaliza vira busca por PATRIMÔNIO (canônica + crua)', () => {
    expect(interpretarBuscaMovimentacao('WAP0001234')).toEqual({
      campo: 'patrimonio',
      valor: 'WAP0001234',
      canonico: 'WAP0001234',
      cru: 'WAP0001234',
    })
  })

  it('canonicaliza as grafias soltas do dia a dia (e guarda a forma crua)', () => {
    // espaço, minúscula, hífen e zeros à esquerda ausentes
    const crus: Record<string, string> = {
      'wap 4491': 'WAP4491',
      WAP4491: 'WAP4491',
      'wap-4491': 'WAP-4491',
      Wap0004491: 'WAP0004491',
    }
    for (const [bruto, cru] of Object.entries(crus)) {
      expect(interpretarBuscaMovimentacao(bruto)).toEqual({
        campo: 'patrimonio',
        valor: 'WAP0004491',
        canonico: 'WAP0004491',
        cru,
      })
    }
  })

  // F12-W4-02: 29 ativos em produção têm patrimônio fora do formato canônico
  // (a F7J deixou entrar valores assim) e NENHUM canoniza. Antes, todos caíam no
  // ramo colaborador e devolviam zero linhas — o histórico era inalcançável.
  it('patrimônio FORA do padrão canônico ainda é buscado como patrimônio', () => {
    expect(interpretarBuscaMovimentacao('LEA7LYHQH4')).toEqual({
      campo: 'patrimonio',
      valor: 'LEA7LYHQH4',
      canonico: null,
      cru: 'LEA7LYHQH4',
    })
    // Minúsculas: o `.ilike` ignora a caixa, mas a legenda mostra em maiúsculas.
    expect(interpretarBuscaMovimentacao(' lea7lyhqh4 ')).toEqual({
      campo: 'patrimonio',
      valor: 'LEA7LYHQH4',
      canonico: null,
      cru: 'LEA7LYHQH4',
    })
  })

  it('nome de pessoa cai na busca por COLABORADOR', () => {
    expect(interpretarBuscaMovimentacao('  Fulano da Silva ')).toEqual({
      campo: 'colaborador',
      valor: 'Fulano da Silva',
    })
  })

  // A forma de plaqueta é testada sobre o termo ORIGINAL, nunca sobre o `cru`:
  // o `cru` junta as palavras (para "wap 4491" achar "WAP4491") e, se ele
  // decidisse o ramo, "Fulano 12" viraria "FULANO12" e seria lido como plaqueta.
  // (Termo com espaço que CANONIZA — "wap 4491" — segue no ramo patrimônio: é a
  // grafia solta que a F11 já aceitava de propósito.)
  it('nome com número (mais de uma palavra) continua em COLABORADOR', () => {
    expect(interpretarBuscaMovimentacao('Fulano 12')).toEqual({
      campo: 'colaborador',
      valor: 'Fulano 12',
    })
    expect(interpretarBuscaMovimentacao('Beltrano 2024')).toEqual({
      campo: 'colaborador',
      valor: 'Beltrano 2024',
    })
  })

  // Palavra só de letras não distingue plaqueta de nome — fica em colaborador.
  it('palavra só de letras (sem dígito) continua em COLABORADOR', () => {
    expect(interpretarBuscaMovimentacao('Fulano')).toEqual({
      campo: 'colaborador',
      valor: 'Fulano',
    })
  })

  // MUDANÇA DELIBERADA da F12 (antes ia para colaborador): o acervo tem
  // patrimônio não-canônico só de dígitos, e nenhum colaborador se chama "4491".
  it('número solto de 4+ dígitos é lido como patrimônio cru', () => {
    expect(interpretarBuscaMovimentacao('4491')).toEqual({
      campo: 'patrimonio',
      valor: '4491',
      canonico: null,
      cru: '4491',
    })
  })

  it('termo curto demais para plaqueta (< 4) fica em colaborador', () => {
    expect(interpretarBuscaMovimentacao('A1')).toEqual({
      campo: 'colaborador',
      valor: 'A1',
    })
  })

  it('neutraliza os curingas do ILIKE virando espaço (não colando as palavras)', () => {
    expect(interpretarBuscaMovimentacao('Fulano%Silva')).toEqual({
      campo: 'colaborador',
      valor: 'Fulano Silva',
    })
    expect(interpretarBuscaMovimentacao('Bel_trano')).toEqual({
      campo: 'colaborador',
      valor: 'Bel trano',
    })
    expect(interpretarBuscaMovimentacao('Fulano, (TI)')).toEqual({
      campo: 'colaborador',
      valor: 'Fulano TI',
    })
  })

  it('termo só de curinga NÃO vira filtro (senão `%%` esconderia linhas sem colaborador)', () => {
    expect(interpretarBuscaMovimentacao('%%%')).toBeNull()
    expect(interpretarBuscaMovimentacao('*')).toBeNull()
  })

  // Mais de 7 dígitos significativos NÃO canoniza (`canonicalizarPatrimonio`
  // devolve null) — mas ainda tem a forma de plaqueta, então é procurado cru.
  it('mais de 7 dígitos significativos vira patrimônio CRU, não colaborador', () => {
    expect(interpretarBuscaMovimentacao('WAP12345678')).toEqual({
      campo: 'patrimonio',
      valor: 'WAP12345678',
      canonico: null,
      cru: 'WAP12345678',
    })
  })

  // O `cru` e o `canonico` entram numa string `.or()` do PostgREST; qualquer
  // metacaractere (`,` `(` `)` `.` `%` `_` `*`) ali quebraria o parser ou viraria
  // curinga. O charset da forma de plaqueta é a defesa — este teste a tranca.
  it('nenhum metacaractere do PostgREST escapa pelo ramo patrimônio', () => {
    for (const sujo of [
      'WAP,0001234',
      'WAP(0001234)',
      'WAP%1234',
      'WAP_1234',
      'WAP*1234',
      'WAP.1234',
    ]) {
      const b = interpretarBuscaMovimentacao(sujo)
      expect(b?.campo).toBe('colaborador')
    }
  })
})

// Patrimônio repete em casos raros (spec §5): buscar `WAP0001234` na lista traz
// o histórico dos DOIS ativos intercalado, e a tabela precisa marcar quais
// linhas exigem a service tag para desempatar.
// Dados 100% fictícios (CLAUDE.md regra 2).
describe('patrimoniosAmbiguosNaPagina', () => {
  it('página sem linhas não tem ambiguidade', () => {
    expect(patrimoniosAmbiguosNaPagina([])).toEqual(new Set())
  })

  it('o MESMO ativo em várias linhas NÃO é duplicidade', () => {
    const linhas = [
      { ativo_id: 'a1', patrimonio: 'WAP0001234' },
      { ativo_id: 'a1', patrimonio: 'WAP0001234' },
      { ativo_id: 'a1', patrimonio: 'WAP0001234' },
    ]
    expect(patrimoniosAmbiguosNaPagina(linhas)).toEqual(new Set())
  })

  it('dois ATIVOS distintos com o mesmo patrimônio marcam o patrimônio', () => {
    const linhas = [
      { ativo_id: 'a1', patrimonio: 'WAP0001234' },
      { ativo_id: 'a2', patrimonio: 'WAP0001234' },
      { ativo_id: 'a3', patrimonio: 'WAP0005678' },
    ]
    expect(patrimoniosAmbiguosNaPagina(linhas)).toEqual(
      new Set(['WAP0001234']),
    )
  })

  it('ativos sem patrimônio (F7E) não contam como duplicidade entre si', () => {
    const linhas = [
      { ativo_id: 'a1', patrimonio: null },
      { ativo_id: 'a2', patrimonio: null },
      { ativo_id: 'a3', patrimonio: 'WAP0001234' },
    ]
    expect(patrimoniosAmbiguosNaPagina(linhas)).toEqual(new Set())
  })
})
