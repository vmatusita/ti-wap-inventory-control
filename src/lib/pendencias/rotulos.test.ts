import { describe, it, expect, vi } from 'vitest'
import { PENDENCIA_SEM_PATRIMONIO, PENDENCIA_SEM_SERVICE_TAG } from '@/lib/dominio'
import {
  ROTULO_TIPO_PENDENCIA,
  CLASSE_TIPO_PENDENCIA,
  type TipoPendencia,
} from '@/lib/pendencias/rotulos'

// R-PEN-04 — classificação do bucket de pendência a partir do texto canônico da
// view v_fila_pendencias. A FUNÇÃO `classificarPendencia` mora em
// `@/lib/queries/pendencias-detalhe` (módulo server-only que re-exporta os rótulos
// de `@/lib/pendencias/rotulos`); NÃO existe em rotulos.ts. Este arquivo testa o
// comportamento REAL dessa função + os rótulos/cores que rotulos.ts expõe.
//
// pendencias-detalhe.ts importa 'server-only' e '@/lib/supabase/server' (client do
// Supabase, que toca next/headers). Como só exercitamos a função PURA
// classificarPendencia, stubamos os dois para o import não estourar no ambiente
// node do Vitest. `classificarPendencia` não usa nada disso.
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

// Import DEPOIS dos mocks (hoisting do vi.mock garante, mas mantém a intenção clara).
import { classificarPendencia } from '@/lib/queries/pendencias-detalhe'

// Literal exato gravado pelo go-live F4 (patrimônio não canônico). classificarPendencia
// casa pelo PREFIXO sem a parte "(importado…)".
const PATRIMONIO_NAO_CANONICO =
  'patrimônio não canônico (importado como veio da planilha)'

describe('classificarPendencia — buckets da spec §5 (R-PEN-04)', () => {
  it('bucket termo: exatamente "termo pendente"', () => {
    expect(classificarPendencia('termo pendente')).toBe<TipoPendencia>('termo')
  })

  it('bucket triagem: exatamente "triagem parada"', () => {
    expect(classificarPendencia('triagem parada')).toBe<TipoPendencia>('triagem')
  })

  it('bucket itens: prefixo "itens faltantes…" (pendencias_item / F18)', () => {
    expect(classificarPendencia('itens faltantes: Mouse, Teclado')).toBe<TipoPendencia>(
      'itens',
    )
    // O prefixo sozinho também classifica.
    expect(classificarPendencia('itens faltantes')).toBe<TipoPendencia>('itens')
  })

  it('bucket patrimonio: "sem patrimônio físico" (importado sem plaqueta)', () => {
    expect(classificarPendencia(PENDENCIA_SEM_PATRIMONIO)).toBe<TipoPendencia>(
      'patrimonio',
    )
  })

  it('bucket patrimonio: "patrimônio não canônico" (go-live F4)', () => {
    expect(classificarPendencia(PATRIMONIO_NAO_CANONICO)).toBe<TipoPendencia>(
      'patrimonio',
    )
  })

  it('bucket outras: "sem service tag" NÃO é rótulo próprio — cai em outras', () => {
    // A função só tem 5 buckets; "sem service tag" (F15) não é um deles → campo livre.
    expect(classificarPendencia(PENDENCIA_SEM_SERVICE_TAG)).toBe<TipoPendencia>(
      'outras',
    )
  })

  it('bucket outras: campo livre arbitrário', () => {
    expect(classificarPendencia('aguardando avaliação do técnico')).toBe<TipoPendencia>(
      'outras',
    )
  })

  it('bucket outras: null e string vazia', () => {
    expect(classificarPendencia(null)).toBe<TipoPendencia>('outras')
    expect(classificarPendencia('')).toBe<TipoPendencia>('outras')
  })
})

describe('classificarPendencia — `;`-join de múltiplos trechos e semântica includes/igualdade', () => {
  it('join com "sem patrimônio físico" vence por includes → patrimonio', () => {
    expect(
      classificarPendencia('sem patrimônio físico; sem service tag'),
    ).toBe<TipoPendencia>('patrimonio')
  })

  it('join com "termo pendente" NÃO casa (é igualdade exata, não includes) → outras', () => {
    // termo/triagem exigem igualdade EXATA; num string juntado a igualdade falha e
    // nenhum bucket de substring bate → outras.
    expect(
      classificarPendencia('termo pendente; sem service tag'),
    ).toBe<TipoPendencia>('outras')
  })

  it('join que contém "itens faltantes" NO INÍCIO → itens (startsWith)', () => {
    expect(
      classificarPendencia('itens faltantes: Fonte; sem service tag'),
    ).toBe<TipoPendencia>('itens')
  })
})

describe('classificarPendencia — case-insensitivity (toLowerCase interno)', () => {
  it('"ITENS FALTANTES" em maiúsculas → itens', () => {
    expect(classificarPendencia('ITENS FALTANTES: X')).toBe<TipoPendencia>('itens')
  })

  it('"SEM PATRIMÔNIO FÍSICO" em maiúsculas → patrimonio', () => {
    expect(classificarPendencia('SEM PATRIMÔNIO FÍSICO')).toBe<TipoPendencia>(
      'patrimonio',
    )
  })
})

describe('ROTULO_TIPO_PENDENCIA / CLASSE_TIPO_PENDENCIA (rotulos.ts) — afins', () => {
  it('cada tipo tem o rótulo pt-BR esperado', () => {
    expect(ROTULO_TIPO_PENDENCIA).toEqual({
      termo: 'Termo',
      itens: 'Itens faltantes',
      triagem: 'Triagem',
      patrimonio: 'Patrimônio',
      // F24 — o único tipo que não vem de `v_fila_pendencias`: ele é derivado das views
      // de conflito e vive na mesa própria de /pendencias.
      conflito: 'Conflito entre filiais',
      outras: 'Outra',
    })
  })

  it('todo bucket produzido por classificarPendencia tem rótulo e classe de cor', () => {
    const exemplos: Array<string | null> = [
      'termo pendente',
      'triagem parada',
      'itens faltantes: X',
      PENDENCIA_SEM_PATRIMONIO,
      'campo livre qualquer',
      null,
    ]
    for (const p of exemplos) {
      const tipo = classificarPendencia(p)
      expect(ROTULO_TIPO_PENDENCIA[tipo]).toBeTruthy()
      expect(CLASSE_TIPO_PENDENCIA[tipo]).toBeTruthy()
    }
  })

  it('o rótulo exibido do texto canônico "termo pendente" é "Termo"', () => {
    expect(ROTULO_TIPO_PENDENCIA[classificarPendencia('termo pendente')]).toBe('Termo')
  })
})
