import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { VERSOES, compararSemver, partesSemver, versaoAtual } from '@/lib/versoes/registry'

const RAIZ = process.cwd()

function versaoDoPacote(): string {
  const caminho = join(RAIZ, 'package.json')
  let cru: string
  try {
    cru = readFileSync(caminho, 'utf8')
  } catch {
    throw new Error(
      `nao foi possivel ler ${caminho} — o vitest precisa rodar a partir da raiz do repositorio`,
    )
  }
  return (JSON.parse(cru) as { version: string }).version
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

function dataDeVerdade(iso: string): boolean {
  if (!DATA_ISO.test(iso)) return false
  // `new Date('2026-02-31')` nao lanca: normaliza para 03/03. Comparar de volta
  // e o que pega dia inexistente.
  const d = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso
}

describe('registry de versoes', () => {
  it('tem entradas', () => {
    expect(VERSOES.length).toBeGreaterThan(0)
  })

  it('toda versao e um semver valido', () => {
    for (const v of VERSOES) {
      expect(v.versao, `versao fora do padrao: ${v.versao}`).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })

  it('nao ha versao repetida', () => {
    const versoes = VERSOES.map((v) => v.versao)
    expect(new Set(versoes).size).toBe(versoes.length)
  })

  it('a ordem e estritamente decrescente (comparacao numerica, nao textual)', () => {
    for (let i = 1; i < VERSOES.length; i += 1) {
      const anterior = VERSOES[i - 1].versao
      const atual = VERSOES[i].versao
      expect(
        compararSemver(anterior, atual),
        `${anterior} deveria vir DEPOIS de ${atual} no registry`,
      ).toBeGreaterThan(0)
    }
  })

  it('o comparador de semver nao cai na armadilha do texto', () => {
    // '1.9.0' > '1.10.0' comparando como string — e o que este comparador evita.
    expect(compararSemver('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compararSemver('1.9.1', '1.9.0')).toBeGreaterThan(0)
    expect(compararSemver('1.0.0', '0.6.0')).toBeGreaterThan(0)
    expect(compararSemver('1.2.3', '1.2.3')).toBe(0)
    expect(partesSemver('1.40.0')).toEqual([1, 40, 0])
  })

  it('toda data e uma data real no formato yyyy-MM-dd', () => {
    for (const v of VERSOES) {
      expect(dataDeVerdade(v.data), `data invalida na ${v.versao}: ${v.data}`).toBe(true)
    }
  })

  it('nenhuma data esta no futuro', () => {
    const hoje = new Date().toISOString().slice(0, 10)
    for (const v of VERSOES) {
      expect(v.data <= hoje, `${v.versao} datada no futuro: ${v.data}`).toBe(true)
    }
  })

  it('as datas nao crescem lendo de cima para baixo', () => {
    for (let i = 1; i < VERSOES.length; i += 1) {
      const acima = VERSOES[i - 1]
      const abaixo = VERSOES[i]
      expect(
        abaixo.data <= acima.data,
        `${abaixo.versao} (${abaixo.data}) esta abaixo de ${acima.versao} (${acima.data}) e e mais nova`,
      ).toBe(true)
    }
  })

  it('toda entrada tem titulo de uma linha', () => {
    for (const v of VERSOES) {
      expect(v.titulo.trim().length, `titulo vazio na ${v.versao}`).toBeGreaterThan(0)
      expect(v.titulo).not.toContain('\n')
    }
  })

  it('toda entrada tem de 2 a 6 mudancas, nenhuma vazia e nenhuma com quebra de linha', () => {
    for (const v of VERSOES) {
      expect(v.mudancas.length, `mudancas fora da faixa 2..6 na ${v.versao}`).toBeGreaterThanOrEqual(2)
      expect(v.mudancas.length, `mudancas fora da faixa 2..6 na ${v.versao}`).toBeLessThanOrEqual(6)
      for (const m of v.mudancas) {
        expect(m.trim().length, `mudanca vazia na ${v.versao}`).toBeGreaterThan(0)
        expect(m, `mudanca com quebra de linha na ${v.versao}`).not.toContain('\n')
      }
    }
  })

  it('a fase, quando existe, e unica e segue o padrao das ordens de servico', () => {
    const fases = VERSOES.map((v) => v.fase).filter((f): f is string => Boolean(f))
    expect(new Set(fases).size, 'a mesma fase aparece em duas versoes').toBe(fases.length)
    for (const f of fases) {
      expect(f, `rotulo de fase fora do padrao: ${f}`).toMatch(/^F\d+[A-Z]?(-UX)?$/)
    }
  })

  it('a versao atual e a primeira do registry', () => {
    expect(versaoAtual()).toBe(VERSOES[0])
  })

  it('a versao atual e exatamente a do package.json', () => {
    expect(VERSOES[0].versao).toBe(versaoDoPacote())
  })

  it('a 1.0.0 e o go-live de 15/07/2026', () => {
    const golive = VERSOES.find((v) => v.versao === '1.0.0')
    expect(golive, 'a 1.0.0 nao existe no registry').toBeDefined()
    expect(golive?.data).toBe('2026-07-15')
    expect(golive?.fase).toBe('F4')
  })

  it('tudo que veio antes do go-live e 0.x, e tudo depois e 1.x ou maior', () => {
    const golive = VERSOES.findIndex((v) => v.versao === '1.0.0')
    VERSOES.slice(golive).forEach((v, i) => {
      if (i === 0) return
      expect(partesSemver(v.versao)[0], `${v.versao} deveria ser 0.x (anterior ao go-live)`).toBe(0)
    })
    VERSOES.slice(0, golive).forEach((v) => {
      expect(partesSemver(v.versao)[0], `${v.versao} deveria ser 1.x (posterior ao go-live)`).toBe(1)
    })
  })

  it('nao vaza vocabulario de desenvolvedor para quem opera', () => {
    // Mesma lista da documentacao (`src/lib/ajuda/registry.test.ts`), acrescida
    // do que o CHANGELOG usa e a traducao pode arrastar sem querer.
    const proibidos = [
      'Server Action',
      'Server Component',
      'RLS',
      'row-level security',
      'migration',
      'trigger do banco',
      'endpoint',
      'payload',
      'jsonb',
      'PostgREST',
      'Supabase',
      'RPC',
      'policy',
      'Postgres',
      'commit',
      'deploy',
      'enum',
      'schema',
      'Next.js',
      'TypeScript',
      'Vercel',
    ]
    const texto = JSON.stringify(VERSOES)
    for (const termo of proibidos) {
      expect(texto.includes(termo), `vocabulario de desenvolvedor no registry: "${termo}"`).toBe(
        false,
      )
    }
  })
})
