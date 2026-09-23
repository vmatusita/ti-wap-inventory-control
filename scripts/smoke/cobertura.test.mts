import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { corpoVigente } from '../db/corpo-vigente.mjs'

// A COBERTURA DAS DOZE CHECAGENS — TRÊS conjuntos, um veredito (F55 · Frente D).
//
// POR QUE ELE EXISTE. Uma checagem de integridade nasce em três lugares: no SQL
// (o corpo de `checagens_integridade_nucleo`), no catálogo da tela (`CHECAGENS`
// em `src/lib/queries/dev.ts`, que dá nome e descrição a cada uma) e — desde a
// F55 — na POLÍTICA DO ALARME (`scripts/smoke/linha-de-base.json`, que diz a
// partir de que número ela acorda alguém). Os três podem divergir em silêncio, e
// já divergiram: a `0098` acrescentou DUAS chaves ao SQL e o catálogo ficou para
// trás, de modo que elas apareciam na tela como chave crua — está escrito no
// cabeçalho de `src/lib/validators/dev-integridade.ts`.
//
// Este arquivo é o que impede a terceira divergência, que seria a pior: uma
// checagem nova no SQL sem entrada na política nasceria SEM ALARME, e ninguém
// veria falta nenhuma. **Uma 13ª checagem não nasce sem alguém decidir se ela
// acorda o Johnny.**
//
// ⚠ O CATÁLOGO É LIDO DO FONTE, POR TEXTO, e não por `import`. `queries/dev.ts`
// importa `server-only` E `@/lib/supabase/server` (que puxa `next/headers`):
// importá-lo aqui arrastaria meia aplicação para dentro de um teste que só quer
// doze strings. O mesmo motivo pelo qual `dev-integridade.ts` existe.

const RAIZ = join(process.cwd())

// ---------------------------------------------------------------------------
// Os três conjuntos
// ---------------------------------------------------------------------------

/** (1) As chaves do catálogo da tela — lidas do FONTE de `src/lib/queries/dev.ts`. */
export function chavesDoCatalogo(fonte: string): string[] {
  const bloco = /export const CHECAGENS[\s\S]*?\n\]/.exec(fonte)
  if (!bloco) throw new Error('não achei `export const CHECAGENS` em src/lib/queries/dev.ts')
  return [...bloco[0].matchAll(/chave:\s*'([a-z_]+)'/g)].map((m) => m[1])
}

/** (2) As chaves do SQL — lidas do corpo VIGENTE da função-núcleo. */
export function chavesDoNucleo(sql: string): string[] {
  return [...sql.matchAll(/select\s+'([a-z_]+)'::text/g)].map((m) => m[1])
}

/** (3) As chaves da política do alarme, por alvo. */
export function chavesDaPolitica(politica: { alvos: Record<string, Record<string, number>> }): {
  alvo: string
  chaves: string[]
}[] {
  return Object.entries(politica.alvos).map(([alvo, base]) => ({
    alvo,
    chaves: Object.keys(base),
  }))
}

/** A comparação, como função PURA — é ela que o caso de sabotagem exercita. */
export function divergencias(
  a: { nome: string; chaves: string[] },
  b: { nome: string; chaves: string[] },
): string[] {
  const setA = new Set(a.chaves)
  const setB = new Set(b.chaves)
  const problemas: string[] = []
  for (const c of a.chaves) {
    if (!setB.has(c)) problemas.push(`\`${c}\` está em ${a.nome} e NÃO está em ${b.nome}`)
  }
  for (const c of b.chaves) {
    if (!setA.has(c)) problemas.push(`\`${c}\` está em ${b.nome} e NÃO está em ${a.nome}`)
  }
  return problemas
}

// ---------------------------------------------------------------------------
// (a) as funções puras
// ---------------------------------------------------------------------------

describe('divergencias — a comparação', () => {
  it('conjuntos iguais não acusam', () => {
    expect(divergencias({ nome: 'A', chaves: ['x', 'y'] }, { nome: 'B', chaves: ['y', 'x'] })).toEqual(
      [],
    )
  })

  it('acusa nos DOIS sentidos, nomeando de que lado sobra', () => {
    const p = divergencias({ nome: 'SQL', chaves: ['x', 'z'] }, { nome: 'política', chaves: ['x', 'w'] })
    expect(p).toHaveLength(2)
    expect(p.join(' ')).toContain('`z` está em SQL e NÃO está em política')
    expect(p.join(' ')).toContain('`w` está em política e NÃO está em SQL')
  })

  // SABOTAGEM (critério 16): uma chave fictícia acrescentada a um dos lados
  // TEM de ser acusada. É a prova de que a regra morde — a mesma chave é
  // acrescentada e retirada aqui dentro, sem tocar em arquivo nenhum.
  it('SABOTAGEM: chave de `CHECAGENS` sem política de alarme é acusada', () => {
    const doCatalogo = ['patrimonio_duplicado', 'checagem_ficticia_f55']
    const daPolitica = ['patrimonio_duplicado']
    const p = divergencias({ nome: 'CHECAGENS', chaves: doCatalogo }, { nome: 'linha-de-base', chaves: daPolitica })
    expect(p).toHaveLength(1)
    expect(p[0]).toContain('checagem_ficticia_f55')
    // e, retirada a chave fictícia, volta a fechar
    expect(
      divergencias({ nome: 'CHECAGENS', chaves: daPolitica }, { nome: 'linha-de-base', chaves: daPolitica }),
    ).toEqual([])
  })
})

describe('chavesDoNucleo / chavesDoCatalogo — os leitores', () => {
  it('lê a chave de um bloco de `return query`', () => {
    const sql = "return query with d as (select 1) select 'minha_chave'::text, count(*)::bigint from d;"
    expect(chavesDoNucleo(sql)).toEqual(['minha_chave'])
  })

  it('lê a chave de uma entrada do catálogo', () => {
    const fonte = [
      'export const CHECAGENS: X[] = [',
      "  { chave: 'uma_chave', nome: 'N', descricao: 'D' },",
      ']',
    ].join('\n')
    expect(chavesDoCatalogo(fonte)).toEqual(['uma_chave'])
  })

  it('reclama alto quando o catálogo muda de forma', () => {
    expect(() => chavesDoCatalogo('const OUTRA_COISA = []')).toThrow(/não achei/)
  })
})

// ---------------------------------------------------------------------------
// (b) os três conjuntos REAIS
// ---------------------------------------------------------------------------

describe('os TRÊS conjuntos concordam', () => {
  const doCatalogo = chavesDoCatalogo(
    readFileSync(join(RAIZ, 'src', 'lib', 'queries', 'dev.ts'), 'utf8'),
  )
  const doNucleo = chavesDoNucleo(corpoVigente('public.checagens_integridade_nucleo()', RAIZ).sql)
  const politica = JSON.parse(
    readFileSync(join(RAIZ, 'scripts', 'smoke', 'linha-de-base.json'), 'utf8'),
  )

  it('os três encontram DOZE chaves (guarda do próprio teste)', () => {
    expect(doCatalogo).toHaveLength(12)
    expect(doNucleo).toHaveLength(12)
    for (const { alvo, chaves } of chavesDaPolitica(politica)) {
      expect(chaves, `alvo ${alvo}`).toHaveLength(12)
    }
  })

  it('o SQL do núcleo e o catálogo da tela têm as MESMAS chaves', () => {
    const p = divergencias(
      { nome: 'o SQL de checagens_integridade_nucleo()', chaves: doNucleo },
      { nome: 'CHECAGENS de src/lib/queries/dev.ts', chaves: doCatalogo },
    )
    expect(p, p.join('\n')).toEqual([])
  })

  it.each(chavesDaPolitica(politica).map((p) => p.alvo))(
    'a política do alarme do alvo `%s` cobre exatamente as chaves do SQL',
    (alvo) => {
      const chaves = politica.alvos[alvo] as Record<string, number>
      const p = divergencias(
        { nome: 'o SQL de checagens_integridade_nucleo()', chaves: doNucleo },
        { nome: `linha-de-base.json → ${alvo}`, chaves: Object.keys(chaves) },
      )
      expect(
        p,
        p.join('\n') +
          '\n\nUma checagem nova no SQL sem entrada na política nasceria SEM ALARME. ' +
          'Acrescente-a a scripts/smoke/linha-de-base.json, nos DOIS alvos, com o total ' +
          'medido — e decida, por escrito, a partir de que número ela acorda alguém.',
      ).toEqual([])
    },
  )

  it('a função-núcleo é a fonte VIGENTE do SQL das doze (e ninguém mais o tem)', () => {
    const { arquivo } = corpoVigente('public.checagens_integridade_nucleo()', RAIZ)
    // F62 (22/09/2026): a 0158 a recriou trocando SÓ a operador_sem_filial (o cargo passou a
    // morar em membros) — as doze continuam num lugar só, agora o da 0158.
    expect(arquivo).toBe('0158_cargo_em_membros.sql')
    // A porta da /dev delega: o corpo dela NÃO tem mais as doze.
    const daPorta = chavesDoNucleo(corpoVigente('public.dev_checagens_integridade()', RAIZ).sql)
    expect(daPorta, 'o SQL das doze voltou a existir em DOIS lugares').toEqual([])
  })
})

// F64 (23/09/2026) — A CHAVE NOVA NOS TRÊS LUGARES, NO MESMO COMMIT (fato 14 da ordem F64). A 0164
// acrescenta a 13ª peça ao núcleo, `kit_motivo_orfao` (o kit cujo motivo não existe na empresa do
// kit). Os testes acima comparam os três conjuntos ENTRE SI — uma chave que não estivesse em NENHUM
// dos três passaria verde. Esta trava exige a chave nos três: no SQL vigente do núcleo, no catálogo
// curado `CHECAGENS` (com nome e descrição próprios) e na linha de base dos DOIS alvos, com 0 — uma
// chave NOVA entrando com zero, o que não é "subir a linha de base" (ata da F64). Nasceu VERMELHA
// (push das travas da F64), antes de a chave existir em lugar nenhum.
describe('a chave da F64 (kit_motivo_orfao) está nos TRÊS lugares', () => {
  const CHAVE_F64 = 'kit_motivo_orfao'
  const fonteDev = readFileSync(join(RAIZ, 'src', 'lib', 'queries', 'dev.ts'), 'utf8')
  const politica = JSON.parse(readFileSync(join(RAIZ, 'scripts', 'smoke', 'linha-de-base.json'), 'utf8'))

  it('no SQL vigente de checagens_integridade_nucleo()', () => {
    expect(chavesDoNucleo(corpoVigente('public.checagens_integridade_nucleo()', RAIZ).sql)).toContain(CHAVE_F64)
  })

  it('no catálogo curado CHECAGENS, com nome e descrição próprios (não a descrição de chave desconhecida)', () => {
    expect(chavesDoCatalogo(fonteDev)).toContain(CHAVE_F64)
    const entrada = new RegExp(String.raw`chave:\s*'${CHAVE_F64}'[\s\S]*?nome:\s*'([^']+)'[\s\S]*?descricao:\s*'([^']+)'`).exec(fonteDev)
    expect(entrada, 'a entrada da chave nova não tem nome e descrição').not.toBeNull()
    expect(entrada![1].length).toBeGreaterThan(10)
    expect(entrada![2].length).toBeGreaterThan(40)
  })

  it.each(Object.keys(politica.alvos))('na linha de base do alvo `%s`, com 0 (chave NOVA, não subida)', (alvo) => {
    expect(politica.alvos[alvo][CHAVE_F64]).toBe(0)
  })
})
