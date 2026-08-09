import { describe, expect, it } from 'vitest'
import {
  ATRIBUTO_SIDEBAR,
  CHAVE_SIDEBAR,
  leituraDoStorage,
  SCRIPT_SIDEBAR,
  valorParaStorage,
  VALOR_EXPANDIDA,
  VALOR_RECOLHIDA,
} from './sidebar-preferencia'

// UXG-13 (F30) — a preferência da sidebar. Duas coisas justificam estes testes:
//
// 1. O PADRÃO tem de ser "expandida" para qualquer entrada que não seja
//    exatamente 'recolhida'. Chave ausente, valor de uma versão anterior, lixo
//    escrito por outra aba — nada disso pode esconder o menu de alguém.
// 2. O SCRIPT INLINE roda antes do React, fora de qualquer tela: se ele lançar,
//    ninguém vê o erro e o anti-flash simplesmente para de existir.

describe('leituraDoStorage — só um valor recolhe', () => {
  it('recolhe apenas com o valor canônico', () => {
    expect(leituraDoStorage(VALOR_RECOLHIDA)).toBe(true)
  })

  it.each([
    null,
    undefined,
    '',
    VALOR_EXPANDIDA,
    'true',
    '1',
    'RECOLHIDA',
    ' recolhida ',
    'colapsada',
    '{"recolhida":true}',
  ])('não recolhe com %j', (valor) => {
    expect(leituraDoStorage(valor)).toBe(false)
  })
})

describe('valorParaStorage', () => {
  it('grava os dois estados com os valores canônicos', () => {
    expect(valorParaStorage(true)).toBe(VALOR_RECOLHIDA)
    expect(valorParaStorage(false)).toBe(VALOR_EXPANDIDA)
  })

  it('o que se grava é o que se lê (ida e volta)', () => {
    for (const estado of [true, false]) {
      expect(leituraDoStorage(valorParaStorage(estado))).toBe(estado)
    }
  })
})

describe('SCRIPT_SIDEBAR — o anti-flash', () => {
  it('usa a MESMA chave, o MESMO valor e o MESMO atributo do resto do módulo', () => {
    expect(SCRIPT_SIDEBAR).toContain(`'${CHAVE_SIDEBAR}'`)
    expect(SCRIPT_SIDEBAR).toContain(`'${VALOR_RECOLHIDA}'`)
    expect(SCRIPT_SIDEBAR).toContain(`dataset.${ATRIBUTO_SIDEBAR}`)
  })

  it('engole o próprio erro — localStorage LANÇA em navegador com storage bloqueado', () => {
    expect(SCRIPT_SIDEBAR).toMatch(/^try\{/)
    expect(SCRIPT_SIDEBAR).toMatch(/\}catch\(e\)\{\}$/)
  })

  it('não tem quebra de linha nem aspas duplas (vai inline num atributo HTML)', () => {
    expect(SCRIPT_SIDEBAR).not.toMatch(/[\n\r]/)
    expect(SCRIPT_SIDEBAR).not.toContain('"')
  })

  it('não fecha a tag <script> por acidente', () => {
    // Um `</script>` dentro do texto encerraria o bloco no meio e jogaria o
    // resto do código como HTML na página.
    expect(SCRIPT_SIDEBAR.toLowerCase()).not.toContain('</script')
  })

  it('só ESCREVE o atributo quando a preferência é recolher', () => {
    // O caminho "expandida" não pode escrever nada: o CSS liga no atributo
    // PRESENTE, e um `data-sidebar="expandida"` seria só ruído no <html>.
    const depoisDoIf = SCRIPT_SIDEBAR.slice(SCRIPT_SIDEBAR.indexOf('if('))
    expect(depoisDoIf).not.toContain('else')
  })

  it('roda de verdade e marca o <html> conforme o storage', () => {
    // O Vitest deste repositório roda em `node`, sem DOM: montamos o mínimo que
    // o script toca e o executamos, para o contrato ser exercido e não só lido.
    function executar(guardado: string | null): string | undefined {
      const documentElement = { dataset: {} as Record<string, string | undefined> }
      const contexto = {
        localStorage: { getItem: () => guardado },
        document: { documentElement },
      }
      new Function('localStorage', 'document', SCRIPT_SIDEBAR)(
        contexto.localStorage,
        contexto.document,
      )
      return documentElement.dataset[ATRIBUTO_SIDEBAR]
    }

    expect(executar(VALOR_RECOLHIDA)).toBe(VALOR_RECOLHIDA)
    expect(executar(VALOR_EXPANDIDA)).toBeUndefined()
    expect(executar(null)).toBeUndefined()
  })

  it('não derruba a página quando o storage lança', () => {
    const documentElement = { dataset: {} as Record<string, string | undefined> }
    expect(() =>
      new Function('localStorage', 'document', SCRIPT_SIDEBAR)(
        {
          getItem: () => {
            throw new Error('storage bloqueado')
          },
        },
        { documentElement },
      ),
    ).not.toThrow()
    expect(documentElement.dataset[ATRIBUTO_SIDEBAR]).toBeUndefined()
  })
})
