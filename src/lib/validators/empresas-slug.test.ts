import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PASTA_MIGRATIONS, listarMigrations } from '../../../scripts/db/corpo-vigente.mjs'

// A TRAVA DOS SLUGS RESERVADOS — F62 (22/09/2026).
//
// `public.empresas.slug` vai virar segmento de URL (a porta de cada empresa — F68/F70). Um slug
// igual a uma rota de topo do app (`/admin`, `/ativos`…) ou a um valor especial de URL
// (`?filial=todas`) seria uma empresa que sequestra uma rota. A migration 0152 fecha isso no
// banco com o CHECK `empresas_slug_reservado`, com a lista FECHADA = o censo dos segmentos de
// topo de `src/app/**` ∪ a lista da ficha F62 ∪ `todas`. Esta trava mantém as duas coisas
// iguais: rota de topo NOVA sem entrar na lista reprova aqui, na mesa — e a correção é uma
// migration nova que recria o CHECK (nunca editar a 0152).
//
// A lista é lida da migration VIGENTE que define `empresas_slug_reservado` (a última que o
// cita), nunca copiada para cá.

const RAIZ = process.cwd()

/** Os segmentos de topo de um diretório `app/`, descendo nos grupos `(x)`. */
function segmentosDeTopo(listar: (dir: string) => { nome: string; dir: boolean }[], dir: string): string[] {
  const saida: string[] = []
  for (const e of listar(dir)) {
    if (!e.dir) continue
    if (e.nome.startsWith('(') && e.nome.endsWith(')')) {
      saida.push(...segmentosDeTopo(listar, join(dir, e.nome)))
      continue
    }
    // segmento dinâmico (`[x]`), privado (`_x`) e interceptado (`@x`) não viram URL literal
    if (/^[[_@]/.test(e.nome)) continue
    saida.push(e.nome)
  }
  return [...new Set(saida)].sort()
}

const listarDisco = (dir: string) =>
  readdirSync(dir).map((nome) => ({ nome, dir: statSync(join(dir, nome)).isDirectory() }))

/** A lista fechada do CHECK `empresas_slug_reservado`, da última migration que o define. */
function reservadosDaMigration(): { lista: string[]; arquivo: string } {
  let achado: { lista: string[]; arquivo: string } | null = null
  for (const arquivo of listarMigrations(RAIZ)) {
    const sql = readFileSync(join(RAIZ, ...PASTA_MIGRATIONS, arquivo), 'utf8')
    const m = /constraint empresas_slug_reservado check \(\s*slug <> all \(array\[([\s\S]*?)\]::text\[\]\)/.exec(sql)
    if (m) achado = { lista: [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]).sort(), arquivo }
  }
  if (!achado) throw new Error('nenhuma migration define empresas_slug_reservado')
  return achado
}

/** O formato do slug, da mesma migration. */
function formatoDaMigration(): RegExp {
  let re: RegExp | null = null
  for (const arquivo of listarMigrations(RAIZ)) {
    const sql = readFileSync(join(RAIZ, ...PASTA_MIGRATIONS, arquivo), 'utf8')
    const m = /constraint empresas_slug_formato check \(\s*slug ~ '([^']+)'/.exec(sql)
    if (m) re = new RegExp(m[1])
  }
  if (!re) throw new Error('nenhuma migration define empresas_slug_formato')
  return re
}

const SEGMENTOS = segmentosDeTopo(listarDisco, join(RAIZ, 'src', 'app'))
const RESERVADOS = reservadosDaMigration()
const FORMATO = formatoDaMigration()

/** Os segmentos de topo que NÃO estão reservados. */
function naoReservados(segmentos: string[], reservados: string[]): string[] {
  return segmentos.filter((s) => !reservados.includes(s))
}

describe('empresas.slug — a lista de reservados acompanha as rotas de topo', () => {
  it('o censo achou as rotas de topo de verdade (guarda do próprio teste)', () => {
    expect(SEGMENTOS).toEqual(expect.arrayContaining(['admin', 'api', 'ativos', 'login', 'relatorios']))
    expect(SEGMENTOS.length).toBeGreaterThanOrEqual(10)
  })

  it('todo segmento de topo de src/app (grupos incluídos) é slug RESERVADO', () => {
    expect(
      naoReservados(SEGMENTOS, RESERVADOS.lista),
      `rota de topo nova sem reserva em ${RESERVADOS.arquivo} — crie uma migration que recrie empresas_slug_reservado com ela`,
    ).toEqual([])
  })

  it('a lista traz os da ficha F62 e o valor de URL "todas"', () => {
    for (const s of ['app', 'geral', 'plataforma', 'r', 'www', 'todas']) {
      expect(RESERVADOS.lista, s).toContain(s)
    }
  })

  it('SABOTAGEM H (mesa): uma rota de topo sintética não reservada é acusada', () => {
    const falso = (dir: string) =>
      dir.endsWith('app')
        ? [{ nome: '(app)', dir: true }, { nome: 'api', dir: true }, { nome: 'globals.css', dir: false }]
        : [{ nome: 'admin', dir: true }, { nome: 'nova-area', dir: true }, { nome: '[filial]', dir: true }]
    const seg = segmentosDeTopo(falso, 'app')
    expect(seg).toEqual(['admin', 'api', 'nova-area'])
    expect(naoReservados(seg, RESERVADOS.lista)).toEqual(['nova-area'])
  })

  it('o formato recusa maiúscula, espaço e hífen nas pontas, e aceita o slug da WAP', () => {
    expect(FORMATO.test('wap')).toBe(true)
    expect(FORMATO.test('empresa-b')).toBe(true)
    for (const ruim of ['WAP', 'Wap', 'com espaco', '-wap', 'wap-', 'wap--b', 'wap_b']) {
      expect(FORMATO.test(ruim), ruim).toBe(false)
    }
  })
})
