import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// GUARDA DOS SETE SLUGS HISTÓRICOS DO CATÁLOGO DE TIPOS DE ITEM.
//
// ⚠ ESTA GUARDA FOI INVERTIDA NA F39, e a inversão é deliberada. Até aqui ela
// provava que a lista fixa de acessórios em `dominio.ts` e o seed de `tipos_item`
// (migration 0114) eram o MESMO conjunto — dois lados, um espelho.
// A F39 removeu o lado TS: o vocabulário passou a ser só o catálogo do banco, que o
// administrador edita em Administração → Tipos de item. Sem um dos lados, o teste
// antigo perderia o sentido.
//
// O QUE CONTINUA PRECISANDO DE PROTEÇÃO, e por isso o teste ficou de pé: os SETE
// SLUGS HISTÓRICOS. São eles — e exatamente eles — que `movimentacoes.itens_faltantes`
// e `pendencias_item.item` guardam em PRODUÇÃO, como texto livre, sem FK e sem CHECK
// que obrigue a nada. Some um do seed e toda pendência antiga que o cita passa a
// exibir o slug cru em vez do rótulo; mude um rótulo e o operador vê outra palavra
// para o mesmo registro de sempre.
//
// Então os literais esperados vivem AQUI, no próprio teste, e não num módulo que
// alguém possa "arrumar" junto com o seed. É essa separação que faz a guarda valer:
// para quebrá-la de propósito é preciso editar dois arquivos com intenções opostas.
//
// Mesma técnica de `detentor-sql.test.ts` (F36), `transicoes-sql.test.ts` e
// `chave-sql.test.ts`: deriva o vocabulário DIRETO do SQL da migration vigente.

/**
 * Os sete slugs históricos, na ORDEM do seed, com os rótulos que o operador vê.
 *
 * ⚠ NÃO É "o catálogo": o administrador pode acrescentar tipos, e isso é o desenho.
 * É o PISO — o que o histórico em produção já cita e não pode deixar de existir.
 */
const HISTORICOS: readonly { slug: string; rotulo: string }[] = [
  { slug: 'carregador', rotulo: 'Carregador' },
  { slug: 'mochila', rotulo: 'Mochila' },
  { slug: 'mouse', rotulo: 'Mouse' },
  { slug: 'teclado', rotulo: 'Teclado' },
  { slug: 'mousepad', rotulo: 'Mousepad' },
  // F37/B.2 — era "Fone". A troca foi deliberada e vale nos dois lados; o SLUG
  // gravado (`fone`) nunca mudou, e nenhum registro antigo foi tocado.
  { slug: 'fone', rotulo: 'Fone de ouvido' },
  { slug: 'cabo', rotulo: 'Cabo' },
]

const DIR_MIGRACOES = join(process.cwd(), 'supabase', 'migrations')
const ANCORA_SEED = 'insert into public.tipos_item (slug, rotulo, ordem) values'

/** A migration VIGENTE do seed: a de maior número que o escreve. */
function migrationVigenteDoSeed(): { arquivo: string; sql: string } {
  const arquivos = readdirSync(DIR_MIGRACOES)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) =>
      readFileSync(join(DIR_MIGRACOES, f), 'utf8').includes(ANCORA_SEED),
    )
    .sort()
  const arquivo = arquivos.at(-1)
  if (!arquivo) throw new Error('nenhuma migration semeia tipos_item')
  return { arquivo, sql: readFileSync(join(DIR_MIGRACOES, arquivo), 'utf8') }
}

type LinhaSeed = { slug: string; rotulo: string; ordem: number }

/** As tuplas `('slug', 'Rótulo', N)` do seed, na ordem em que estão no arquivo. */
function seedNoSql(sql: string): LinhaSeed[] {
  const inicio = sql.lastIndexOf(ANCORA_SEED)
  const trecho = sql.slice(inicio + ANCORA_SEED.length)
  // Para no `;` que fecha o INSERT — sem isso, um comentário de smoke mais abaixo
  // com tuplas de exemplo entraria na lista.
  const corpo = trecho.slice(0, trecho.indexOf(';'))
  return [...corpo.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(\d+)\s*\)/g)].map(
    (m) => ({ slug: m[1], rotulo: m[2], ordem: Number(m[3]) }),
  )
}

describe('o seed de tipos_item mantém os SETE slugs históricos', () => {
  const { arquivo, sql } = migrationVigenteDoSeed()
  const doSql = seedNoSql(sql)

  it(`a migration vigente (${arquivo}) semeia pelo menos um tipo (guarda do próprio teste)`, () => {
    expect(doSql.length).toBeGreaterThan(0)
  })

  it('os sete slugs históricos estão no seed, na mesma ORDEM', () => {
    // Igualdade, e não "contém": o seed da 0114 é exatamente a lista histórica.
    // Um tipo novo entra por INSERT do admin, em runtime — não reescrevendo este
    // seed, que é o que o histórico em produção cita.
    expect(doSql.map((l) => l.slug)).toEqual(HISTORICOS.map((h) => h.slug))
  })

  it.each(HISTORICOS)('o rótulo de $slug continua sendo "$rotulo"', ({ slug, rotulo }) => {
    const linha = doSql.find((l) => l.slug === slug)
    expect(linha, `${slug} não está no seed da ${arquivo}`).toBeDefined()
    expect(linha?.rotulo).toBe(rotulo)
  })

  it('o slug fone exibe "Fone de ouvido" (a única troca de rótulo da F37)', () => {
    expect(doSql.find((l) => l.slug === 'fone')?.rotulo).toBe('Fone de ouvido')
  })

  it('nenhum slug do seed é maiúsculo ou acentuado (o CHECK do banco recusaria)', () => {
    for (const l of doSql) expect(l.slug).toMatch(/^[a-z][a-z0-9_]{1,29}$/)
  })

  it('as ordens são distintas e crescentes — a lista tem um só jeito de sair', () => {
    const ordens = doSql.map((l) => l.ordem)
    expect(new Set(ordens).size).toBe(ordens.length)
    expect([...ordens].sort((a, b) => a - b)).toEqual(ordens)
  })

  it('nenhum rótulo do SQL vem vazio ou só com espaço', () => {
    for (const l of doSql) expect(l.rotulo.trim().length).toBeGreaterThan(0)
  })
})

// A guarda da guarda: se alguém apagar a lista de cima, o teste acima passaria a
// comparar dois vazios e diria "verde" sem provar nada.
describe('a própria lista histórica não pode encolher em silêncio', () => {
  it('são SETE, e os sete slugs são os que a 0114 semeou', () => {
    expect(HISTORICOS).toHaveLength(7)
    expect(HISTORICOS.map((h) => h.slug)).toEqual([
      'carregador',
      'mochila',
      'mouse',
      'teclado',
      'mousepad',
      'fone',
      'cabo',
    ])
  })
})
