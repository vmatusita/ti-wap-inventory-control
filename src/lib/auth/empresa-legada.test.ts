import { describe, expect, it } from 'vitest'
import { corpoVigente } from '../../../scripts/db/corpo-vigente.mjs'
import { EMPRESA_LEGADA_ID } from './empresa-legada'

// O espelho TS da empresa legada tem de ser o MESMO uuid que `public.empresa_legada()` devolve
// no corpo VIGENTE das migrations (F62). Divergir seria a tela lendo o cargo numa empresa e o
// banco decidindo o acesso em outra.
describe('EMPRESA_LEGADA_ID', () => {
  const { sql, arquivo } = corpoVigente('public.empresa_legada()')

  it('é o literal que public.empresa_legada() devolve no corpo vigente', () => {
    const m = /select\s+'([0-9a-f-]{36})'::uuid/i.exec(sql)
    expect(m, `${arquivo}: o corpo de empresa_legada() não é mais um literal uuid`).not.toBeNull()
    expect(m![1]).toBe(EMPRESA_LEGADA_ID)
  })

  it('é um uuid válido (v4, variante RFC)', () => {
    expect(EMPRESA_LEGADA_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
