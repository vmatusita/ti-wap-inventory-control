import { describe, it, expect, vi } from 'vitest'
import {
  PENDENCIA_PATRIMONIO_NAO_CANONICO,
  PENDENCIA_SEM_PATRIMONIO,
} from '@/lib/dominio'
import {
  ILIKE_ITENS_FALTANTES,
  OR_PATRIMONIO,
  PREFIXO_ITENS_FALTANTES,
  TEXTOS_PATRIMONIO,
  TEXTO_TERMO_PENDENTE,
  TEXTO_TRIAGEM_PARADA,
} from '@/lib/pendencias/filtro'
import type { TipoPendencia } from '@/lib/pendencias/rotulos'

// Os predicados de balde de pendência são a fonte de UMA regra lida por três
// consumidores (ver o cabeçalho de filtro.ts). Este arquivo trava as duas coisas que,
// quando divergiram, produziram o chip que anunciava "56 outras" para uma aba que
// devolvia ZERO:
//   1. a FORMA dos literais, que o `.or()` do PostgREST não perdoa;
//   2. o ACORDO entre o predicado SQL e `classificarPendencia`, que é a leitura em
//      TypeScript da mesma regra sobre a linha já lida.

// pendencias-detalhe.ts é server-only e importa o client do Supabase (toca
// next/headers). Só exercitamos a função PURA — mesmos stubs de `rotulos.test.ts`.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { classificarPendencia } from '@/lib/queries/pendencias-detalhe'

describe('predicados de pendência — forma segura para o `.or()` do PostgREST', () => {
  it('nenhum texto de balde tem vírgula ou parêntese', () => {
    // O `.or()` parte a VÍRGULA como separador de condições e trata PARÊNTESES como
    // agrupamento: um literal com qualquer um dos dois vira filtro corrompido, sem
    // erro nenhum. É por isso que PENDENCIA_PATRIMONIO_NAO_CANONICO é só o PREFIXO
    // de 'patrimônio não canônico (importado como veio da planilha)'.
    for (const texto of [
      TEXTO_TERMO_PENDENTE,
      TEXTO_TRIAGEM_PARADA,
      PREFIXO_ITENS_FALTANTES,
      ...TEXTOS_PATRIMONIO,
    ]) {
      expect(texto, `literal "${texto}"`).not.toMatch(/[,()]/)
    }
  })

  it('OR_PATRIMONIO tem uma condição por texto, separadas por vírgula', () => {
    expect(OR_PATRIMONIO).toBe(
      `pendencia.ilike.%${PENDENCIA_SEM_PATRIMONIO}%,pendencia.ilike.%${PENDENCIA_PATRIMONIO_NAO_CANONICO}%`,
    )
    // Uma vírgula a mais (literal com vírgula dentro) inventaria uma 3ª condição.
    expect(OR_PATRIMONIO.split(',')).toHaveLength(TEXTOS_PATRIMONIO.length)
    expect(OR_PATRIMONIO).not.toContain('(')
  })

  it('o balde de itens casa por PREFIXO, nunca por igualdade', () => {
    // A view sintetiza 'itens faltantes: <item>' (0052) — sem o `%` final o filtro
    // não acharia linha nenhuma.
    expect(ILIKE_ITENS_FALTANTES).toBe(`${PREFIXO_ITENS_FALTANTES}%`)
    expect(ILIKE_ITENS_FALTANTES.endsWith('%')).toBe(true)
  })
})

describe('predicado SQL × classificarPendencia — o acordo que o chip mentiroso rompeu', () => {
  // Cada linha é: o texto que o filtro SQL reivindica → o balde que a leitura em
  // TypeScript tem de devolver para a MESMA linha. Divergir aqui é o chip prometendo
  // um lote que a aba não entrega.
  const CASOS: Array<[string, TipoPendencia]> = [
    [TEXTO_TERMO_PENDENTE, 'termo'],
    [TEXTO_TRIAGEM_PARADA, 'triagem'],
    [`${PREFIXO_ITENS_FALTANTES}: Mochila`, 'itens'],
    ...TEXTOS_PATRIMONIO.map((t): [string, TipoPendencia] => [t, 'patrimonio']),
  ]

  for (const [texto, balde] of CASOS) {
    it(`"${texto}" → ${balde}`, () => {
      expect(classificarPendencia(texto)).toBe(balde)
    })
  }

  it('o texto COMPLETO do go-live F4 casa pelo prefixo', () => {
    // O filtro usa `%prefixo%`; a função usa `includes`. As duas leituras têm de
    // aceitar o literal inteiro, com a parte "(importado…)" que nunca entra no filtro.
    const completo = 'patrimônio não canônico (importado como veio da planilha)'
    expect(completo).toContain(PENDENCIA_PATRIMONIO_NAO_CANONICO)
    expect(classificarPendencia(completo)).toBe<TipoPendencia>('patrimonio')
  })
})
