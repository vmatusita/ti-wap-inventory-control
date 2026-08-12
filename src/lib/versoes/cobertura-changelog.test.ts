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

  // POR CONTAGEM, e nao por presenca da data — e a diferenca decide se a REGRA
  // PERMANENTE vale ou nao. Perguntar so `datasDoRegistry.has(e.data)` deixava
  // passar a segunda entrega do mesmo dia: ela herdava a data de uma versao que
  // ja existia e ia para producao sem bump, sem entrada no registry e sem tag —
  // exatamente o caso PATCH do item 8 do `CLAUDE.md`. E duas entregas no mesmo
  // dia sao a norma aqui, nao a excecao: 7 em 24/07, 5 em 23/07, e a propria
  // 1.39.1 divide 11/08 com a F34.
  it('cada entrada do CHANGELOG tem uma versao propria na mesma data', () => {
    const contar = (datas: string[]) =>
      datas.reduce((m, d) => m.set(d, (m.get(d) ?? 0) + 1), new Map<string, number>())
    const noChangelog = contar(entradas.map((e) => e.data))
    const noRegistry = contar(VERSOES.map((v) => v.data))

    const descobertas = [...noChangelog]
      .filter(([data, quantas]) => (noRegistry.get(data) ?? 0) < quantas)
      .map(
        ([data, quantas]) =>
          `${data}: ${quantas} entrada(s) no CHANGELOG para ${noRegistry.get(data) ?? 0} versao(oes)`,
      )
      .sort()

    expect(
      descobertas,
      'entrada do CHANGELOG sem versao propria na mesma data — toda entrega vira versao, com bump e tag (regra permanente do CLAUDE.md, item 8)',
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
