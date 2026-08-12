// A conferencia do mapeamento fase -> versao e POR CONTAGEM, nao por leitura
// (ordem F35, §V): o CHANGELOG.md e a fonte do historico, entao e dele que sai
// a lista de fases e de datas que o registry precisa cobrir.
//
// Este teste tambem e o que faz a REGRA PERMANENTE valer: entrada nova no
// CHANGELOG sem versao correspondente derruba o `npm run test`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { VERSOES } from '@/lib/versoes/registry'

const RAIZ = process.cwd()

/** Cabecalho que nao e entrega — o roadmap no pe do arquivo. */
const CABECALHOS_IGNORADOS = ['Pendências (roadmap)']

/**
 * Codigos com cara de fase que o CHANGELOG cita e que NAO tem versao, de
 * proposito. Cada um com o motivo — a lista so cresce com justificativa:
 *
 * - `F5` e `F6C`: backlog, nunca executadas. Aparecem em prosa de outras
 *   entradas ("os dois itens que o backlog ainda devia a F5").
 * - `F6`: taquigrafia da dupla F6A/F6B ("o convite virou link copiavel na F6");
 *   nao existe ordem de servico chamada so "F6".
 * - `F7C`: rotulo de uma DECISAO ("a decisao F7C de 17/07"), nao de uma ordem
 *   de servico. Ver `CLAUDE.md`, regra 2.
 */
const SEM_VERSAO = new Set(['F5', 'F6', 'F6C', 'F7C'])

const FASE = /\bF\d+[A-Z]?(?:-UX)?\b/g

type EntradaChangelog = { titulo: string; data: string; corpo: string }

function lerChangelog(): EntradaChangelog[] {
  const cru = readFileSync(join(RAIZ, 'CHANGELOG.md'), 'utf8')
  const linhas = cru.split('\n')
  const entradas: EntradaChangelog[] = []
  let atual: EntradaChangelog | null = null

  for (const linha of linhas) {
    if (linha.startsWith('## ')) {
      const titulo = linha.slice(3).trim()
      if (CABECALHOS_IGNORADOS.some((i) => titulo.startsWith(i))) {
        atual = null
        continue
      }
      const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(titulo)
      atual = { titulo, data: m ? `${m[3]}-${m[2]}-${m[1]}` : '', corpo: '' }
      entradas.push(atual)
      continue
    }
    if (atual) atual.corpo += `${linha}\n`
  }
  return entradas
}

function fasesCitadas(texto: string): string[] {
  return [...texto.matchAll(FASE)].map((m) => m[0])
}

describe('cobertura do CHANGELOG pelo registry de versoes', () => {
  const entradas = lerChangelog()
  const fasesDoRegistry = new Set(VERSOES.map((v) => v.fase).filter(Boolean))
  const datasDoRegistry = new Set(VERSOES.map((v) => v.data))

  it('o CHANGELOG foi lido de verdade', () => {
    expect(entradas.length).toBeGreaterThan(40)
    for (const e of entradas) {
      expect(e.data, `cabecalho sem data reconhecivel: "${e.titulo}"`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('toda fase citada no CHANGELOG tem versao no registry', () => {
    const faltando = new Set<string>()
    for (const e of entradas) {
      for (const fase of fasesCitadas(`${e.titulo}\n${e.corpo}`)) {
        if (SEM_VERSAO.has(fase)) continue
        if (!fasesDoRegistry.has(fase)) faltando.add(fase)
      }
    }
    expect(
      [...faltando].sort(),
      'fase do CHANGELOG sem versao — acrescente a entrada em src/lib/versoes/registry.ts (ou a SEM_VERSAO, se ela nunca foi executada)',
    ).toEqual([])
  })

  it('toda data de entrega do CHANGELOG existe no registry', () => {
    const faltando = new Set<string>()
    for (const e of entradas) if (!datasDoRegistry.has(e.data)) faltando.add(e.data)
    expect(
      [...faltando].sort(),
      'entrada do CHANGELOG sem nenhuma versao na mesma data — toda entrega vira versao (regra permanente do CLAUDE.md)',
    ).toEqual([])
  })

  it('ha pelo menos uma versao por entrada do CHANGELOG', () => {
    expect(VERSOES.length).toBeGreaterThanOrEqual(entradas.length)
  })

  it('o registry nao inventa fase que o CHANGELOG desconhece', () => {
    const noChangelog = new Set(
      entradas.flatMap((e) => fasesCitadas(`${e.titulo}\n${e.corpo}`)),
    )
    const inventadas = [...fasesDoRegistry].filter((f) => f && !noChangelog.has(f))
    expect(inventadas.sort(), 'fase no registry que o CHANGELOG nao cita').toEqual([])
  })
})
