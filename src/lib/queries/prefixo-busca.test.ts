import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MIN_PREFIXO_SUGESTAO, prefixoSeguro } from '@/lib/queries/prefixo-busca'

// A neutralização de curinga dos campos que sugerem enquanto se digita.
//
// Ela vivia DUPLICADA (queries/movimentacoes.ts e queries/colaboradores.ts) até a
// revisão de 28/08/2026. O conjunto neutralizado é regra de segurança do ILIKE, não
// estilo — e é por isso que, além de testar a função, este arquivo trava a
// UNICIDADE dela: se alguém recriar uma cópia local, o último teste cai.

describe('prefixoSeguro', () => {
  it('neutraliza os curingas do LIKE/ILIKE do PostgREST', () => {
    // Sem isto, `%` no campo devolveria o histórico INTEIRO (o padrão vira `%%`).
    expect(prefixoSeguro('%')).toBe('')
    expect(prefixoSeguro('jo%o')).toBe('joo')
    expect(prefixoSeguro('jo_o')).toBe('joo')
    // O PostgREST traduz `*` para `%`, então ele também é curinga.
    expect(prefixoSeguro('jo*o')).toBe('joo')
  })

  it('neutraliza o que quebra o parser da querystring', () => {
    expect(prefixoSeguro('jo(ao)')).toBe('joao')
    expect(prefixoSeguro('joao,silva')).toBe('joaosilva')
    expect(prefixoSeguro('joao\\silva')).toBe('joaosilva')
  })

  it('apara as pontas e deixa passar nome comum, acento incluso', () => {
    expect(prefixoSeguro('  João  ')).toBe('João')
    expect(prefixoSeguro("D'Ávila")).toBe("D'Ávila")
  })

  it('o mínimo de prefixo é 2 — uma letra varreria a base à toa', () => {
    expect(MIN_PREFIXO_SUGESTAO).toBe(2)
  })

  it('existe UMA implementação só: nenhum outro arquivo redefine prefixoSeguro', () => {
    // Era este o defeito: duas cópias verbatim, uma delas declarando-se "espelho".
    // Tapar um buraco numa e esquecer a outra não quebrava build nenhum.
    const arquivos = [
      'src/lib/queries/movimentacoes.ts',
      'src/lib/queries/colaboradores.ts',
    ]
    for (const rel of arquivos) {
      const fonte = readFileSync(join(process.cwd(), rel), 'utf8')
      expect(fonte, `${rel} voltou a definir prefixoSeguro localmente`).not.toMatch(
        /function\s+prefixoSeguro\s*\(/,
      )
    }
  })
})
