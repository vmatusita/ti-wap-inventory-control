import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { semComentarios } from '../../../scripts/db/classificar-migration.mjs'
import { definicoesDeFuncao, listarMigrations } from '../../../scripts/db/corpo-vigente.mjs'

// =============================================================================
// AS TRAVAS ADVISORY TÊM UMA FORMA SÓ POR FAMÍLIA, E O "TUDO" CARREGA A EMPRESA (F67, 13/11/2026 — decisão 8)
// =============================================================================
// `pg_advisory_xact_lock(bigint)` e `pg_advisory_xact_lock(int, int)` são ESPAÇOS DE CHAVE DIFERENTES (PG 17,
// functions-admin: "these two key spaces do not overlap"). Duas funções da MESMA família que travassem por formas
// diferentes deixariam de se excluir — e, na expansão da F67, a assinatura antiga e a nova de um mesmo nome vivem
// juntas nos bancos: se elas não tomarem a MESMA chave, o app velho e o novo resetam, importam ou apagam conflito ao
// mesmo tempo. E a SENTINELA do "tudo" (`-1` até a F67) era uma chave do SISTEMA inteiro: com a empresa no "tudo", ela
// passa a `hashtext(<empresa>::text)`.
//
// O QUE ESTA TRAVA LÊ: o REPLAY das migrations (o corpo vigente de cada ASSINATURA, com os `drop function` seguidos),
// em DOIS momentos — o fim da EXPANSÃO (antes da migration de contração, quando antiga e nova coexistem) e o fim da
// cadeia. Em cada um, toda chamada `pg_advisory*` de todo corpo vigente: a família é o 1º argumento
// (`hashtext('<nome>')`, ou a expressão quando não é hashtext), a forma é o número de argumentos.
//   (a) uma família, UMA forma;
//   (b) na família `import_substituir`, o 2º argumento é a filial (`…::int`) ou carrega a EMPRESA — nunca um literal
//       numérico (a sentinela `-1`);
//   (c) a família `conflito_filiais_apagar` (a mesa) é por empresa: `(int, int)` com a empresa no 2º argumento.
// A sabotagem H (abaixo) prova que o verificador acusa os três jeitos de errar, sobre corpos sintéticos.
// =============================================================================

const RAIZ = process.cwd()
const PASTA = join(RAIZ, 'supabase', 'migrations')

/** As migrations que SÓ contraem (derrubam assinaturas antigas da expansão). Lista nominal: a receita do RUNBOOK, Anexo F67. */
const CONTRACOES = new Set(['0193_contracao_assinaturas_antigas.sql'])

type Corpo = { assinatura: string; nome: string; sql: string }
type Chamada = { funcao: string; familia: string; aridade: number; args: string[]; trecho: string }

function normalizarTipo(t: string): string {
  return t
    .toLowerCase()
    .replace(/^public\./, '')
    .replace(/\s+/g, ' ')
    .replace(/^int$|^int4$/, 'integer')
    .replace(/^int2$/, 'smallint')
    .trim()
}

/** O replay: o corpo vigente de cada ASSINATURA até a migration `ate` (exclusive se `pular` a contém). */
function replay(pular: (arquivo: string) => boolean): Map<string, Corpo> {
  const vivas = new Map<string, Corpo>()
  for (const arquivo of listarMigrations(RAIZ)) {
    if (pular(arquivo)) continue
    const sql = readFileSync(join(PASTA, arquivo), 'utf8').replace(/\r\n/g, '\n')
    // os drops, na ordem do arquivo (o código, sem comentário)
    const codigo = semComentarios(sql)
    for (const m of codigo.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi)) {
      const tipos = m[2].split(',').map((x) => normalizarTipo(x)).filter((x) => x !== '')
      vivas.delete(`${m[1].toLowerCase()}(${tipos.join(',')})`)
    }
    for (const d of definicoesDeFuncao(sql)) {
      if (d.esquema !== 'public') continue
      const chave = `${d.nome}(${d.tipos.map(normalizarTipo).join(',')})`
      vivas.set(chave, { assinatura: chave, nome: d.nome, sql: d.texto })
    }
  }
  return vivas
}

/** Os argumentos de topo de uma chamada a partir do `(`. */
function argumentos(texto: string, abre: number): { args: string[]; fim: number } {
  let prof = 0
  let atual = ''
  const args: string[] = []
  for (let i = abre; i < texto.length; i++) {
    const c = texto[i]
    if (c === '(') {
      prof++
      if (prof === 1) continue
    } else if (c === ')') {
      prof--
      if (prof === 0) {
        args.push(atual.trim())
        return { args, fim: i }
      }
    } else if (c === ',' && prof === 1) {
      args.push(atual.trim())
      atual = ''
      continue
    }
    atual += c
  }
  return { args, fim: texto.length }
}

/** Toda chamada `pg_advisory*` do código de um corpo. */
function chamadasAdvisory(corpos: Corpo[]): Chamada[] {
  const saida: Chamada[] = []
  for (const c of corpos) {
    const codigo = semComentarios(c.sql)
    for (const m of codigo.matchAll(/\bpg_(?:try_)?advisory_(?:xact_)?lock(?:_shared)?\s*\(/gi)) {
      const abre = (m.index ?? 0) + m[0].length - 1
      const { args } = argumentos(codigo, abre)
      const h = /^hashtext\s*\(\s*'([^']*)'\s*\)$/i.exec(args[0] ?? '')
      saida.push({
        funcao: c.assinatura,
        familia: h ? h[1] : `expr:${(args[0] ?? '').replace(/\s+/g, ' ').replace(/^[a-z_]+\./i, '')}`,
        aridade: args.length,
        args,
        trecho: codigo.slice(m.index ?? 0, (m.index ?? 0) + 140).replace(/\s+/g, ' '),
      })
    }
  }
  return saida
}

/** As violações das regras (a), (b) e (c). */
function violacoesAdvisory(chamadas: Chamada[]): string[] {
  const v: string[] = []
  const formas = new Map<string, Set<number>>()
  for (const c of chamadas) {
    if (!formas.has(c.familia)) formas.set(c.familia, new Set())
    formas.get(c.familia)!.add(c.aridade)
  }
  for (const [familia, ar] of formas) {
    if (ar.size > 1) v.push(`(a) a família ${familia} tem ${ar.size} formas: ${[...ar].sort().join(' e ')} argumento(s)`)
  }
  for (const c of chamadas) {
    if (c.familia === 'import_substituir') {
      const segundo = (c.args[1] ?? '').replace(/\s+/g, ' ')
      if (/^-?\s*\d+$/.test(segundo)) v.push(`(b) ${c.funcao}: a sentinela do "tudo" é o literal ${segundo}, sem a empresa`)
      else if (!/::\s*int\b/i.test(segundo) && !/empresa/i.test(segundo))
        v.push(`(b) ${c.funcao}: o 2º argumento (${segundo}) não é a filial nem carrega a empresa`)
    }
    if (c.familia === 'conflito_filiais_apagar') {
      if (c.aridade !== 2 || !/empresa/i.test(c.args[1] ?? ''))
        v.push(`(c) ${c.funcao}: a trava da mesa não é por empresa (${c.trecho})`)
    }
  }
  return v
}

describe('F67 — as travas advisory: uma forma por família, e o "tudo" com a empresa (decisão 8)', () => {
  const ultimaDaExpansao = replay((a) => CONTRACOES.has(a))
  const fimDaCadeia = replay(() => false)

  it('a lista nominal de contrações existe no disco (a trava não lê um momento que não existe)', () => {
    const arquivos = new Set(listarMigrations(RAIZ))
    for (const a of CONTRACOES) expect(arquivos.has(a), `${a} não existe`).toBe(true)
  })

  it('no fim da EXPANSÃO (antiga e nova vivas juntas), toda família tem uma forma só e o "tudo" carrega a empresa', () => {
    const chamadas = chamadasAdvisory([...ultimaDaExpansao.values()])
    expect(chamadas.length, 'o censo não achou nenhuma chamada advisory — o leitor quebrou').toBeGreaterThan(10)
    expect(violacoesAdvisory(chamadas)).toEqual([])
  })

  it('no fim da cadeia (contraída), idem', () => {
    expect(violacoesAdvisory(chamadasAdvisory([...fimDaCadeia.values()]))).toEqual([])
  })

  it('na expansão, a assinatura ANTIGA e a NOVA de cada nome tomam a MESMA família e forma (os resets e a mesa)', () => {
    const chamadas = chamadasAdvisory([...ultimaDaExpansao.values()])
    for (const nome of ['resetar_acervo', 'resetar_itens', 'apagar_ativos_conflito_filiais']) {
      const doNome = chamadas.filter((c) => c.funcao.startsWith(`${nome}(`))
      const assinaturas = new Set(doNome.map((c) => c.funcao))
      expect(assinaturas.size, `${nome}: a antiga e a nova deveriam viver juntas na expansão`).toBe(2)
      const formas = new Set(doNome.map((c) => `${c.familia}/${c.aridade}`))
      expect([...formas], `${nome}: formas diferentes entre a antiga e a nova`).toHaveLength(nome === 'apagar_ativos_conflito_filiais' ? 1 : 1)
    }
  })

  describe('a sabotagem H — o verificador ACUSA os três jeitos de errar', () => {
    const corpo = (assinatura: string, sql: string): Corpo => ({ assinatura, nome: assinatura.split('(')[0], sql })
    it('uma assinatura antiga com a sentinela -1', () => {
      const v = violacoesAdvisory(
        chamadasAdvisory([
          corpo('resetar_acervo(smallint)', "perform pg_advisory_xact_lock(hashtext('import_substituir'), -1);"),
        ]),
      )
      expect(v.some((x) => x.startsWith('(b)') && x.includes('-1'))).toBe(true)
    })
    it('a sentinela do "tudo" sem a empresa (um literal qualquer)', () => {
      const v = violacoesAdvisory(
        chamadasAdvisory([corpo('resetar_itens(uuid)', "perform pg_advisory_xact_lock(hashtext('import_substituir'), 0);")]),
      )
      expect(v.some((x) => x.startsWith('(b)'))).toBe(true)
    })
    it('uma chamada da família que muda de (int, int) para (bigint)', () => {
      const v = violacoesAdvisory(
        chamadasAdvisory([
          corpo('a(uuid)', "perform pg_advisory_xact_lock(hashtext('conflito_filiais_apagar'), hashtext(p_empresa::text));"),
          corpo('b(uuid)', "perform pg_advisory_xact_lock(hashtext('conflito_filiais_apagar'));"),
        ]),
      )
      expect(v.some((x) => x.startsWith('(a)') && x.includes('conflito_filiais_apagar'))).toBe(true)
      expect(v.some((x) => x.startsWith('(c)'))).toBe(true)
    })
  })
})
