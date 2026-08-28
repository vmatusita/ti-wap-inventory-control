import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  ACENTOS_DE,
  ACENTOS_PARA,
  chaveColaborador,
  chavesDistintas,
} from '@/lib/colaboradores/chave'

// GUARDA DE SINCRONIA TS↔SQL DA CHAVE DE COLABORADOR (F37).
//
// `chaveColaborador` (TS) se declara espelho de `public.colaborador_chave(text)`, a
// função IMMUTABLE da migration 0112 que alimenta a coluna GERADA
// `colaboradores.nome_chave` e a view `v_colaboradores_textos`. É essa igualdade que
// permite ao servidor resolver `colaborador_id` a partir do texto digitado, e é uma
// igualdade que ninguém percebe quebrar: um acento a mais na tabela do SQL e o
// vínculo simplesmente para de acontecer, em silêncio, sem erro nenhum.
//
// Mesma técnica de `detentor-sql.test.ts` (F36) e `transicoes-sql.test.ts`: deriva o
// vocabulário DIRETO do SQL da migration vigente e compara com o TS. O comportamento
// em si é provado por roteiro SQL no job `banco` do CI
// (`supabase/tests/f37_colaboradores_tipos.sql`); aqui a rede é de compilação.

const DIR_MIGRACOES = join(process.cwd(), 'supabase', 'migrations')

// Âncora da DEFINIÇÃO, não do nome: `comment on function`, `revoke` e `grant` também
// citam a função, e um `lastIndexOf` pelo nome cru cairia numa dessas linhas — depois
// do corpo — e não acharia o `translate` nenhum.
const ANCORA_CREATE = 'create or replace function public.colaborador_chave'

/** A migration VIGENTE da função: a de maior número que a define. */
function migrationVigenteDaChave(): { arquivo: string; sql: string } {
  const arquivos = readdirSync(DIR_MIGRACOES)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) =>
      readFileSync(join(DIR_MIGRACOES, f), 'utf8').includes(ANCORA_CREATE),
    )
    .sort() // prefixo numérico zero-padded ordena lexicograficamente
  const arquivo = arquivos.at(-1)
  if (!arquivo) throw new Error('nenhuma migration define colaborador_chave')
  return { arquivo, sql: readFileSync(join(DIR_MIGRACOES, arquivo), 'utf8') }
}

/**
 * Os dois argumentos do `translate(...)` do corpo, na ordem em que estão no SQL.
 *
 * O padrão exige o `normalize(p_nome, NFC)` POR DENTRO do `translate` — não é
 * frescura: a tabela de acentos só conhece a forma precomposta, então o `normalize`
 * tem de vir ANTES dela ou o nome em NFD atravessa intacto. Casar a estrutura aqui
 * faz a ordem das duas operações ser parte do que este teste trava.
 */
function tabelaDeAcentosNoSql(sql: string): { de: string; para: string } {
  const corpo = sql.slice(sql.lastIndexOf(ANCORA_CREATE))
  const m = corpo.match(
    /translate\(\s*normalize\(\s*p_nome\s*,\s*NFC\s*\)\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/,
  )
  if (!m) {
    throw new Error(
      'não achei o translate(normalize(p_nome, NFC), …, …) de colaborador_chave',
    )
  }
  return { de: m[1], para: m[2] }
}

/** A classe de espaço do `regexp_replace(..., '<classe>', ' ', 'g')` do corpo. */
function classeDeEspacoNoSql(sql: string): string {
  const corpo = sql.slice(sql.lastIndexOf(ANCORA_CREATE))
  const m = corpo.match(/regexp_replace\([\s\S]*?,\s*'(\[[^']*\]\+)'\s*,\s*' '\s*,\s*'g'\s*\)/)
  if (!m) throw new Error('não achei a classe de espaço de colaborador_chave')
  return m[1]
}

describe('chaveColaborador (TS) espelha colaborador_chave (SQL da migration vigente)', () => {
  const { arquivo, sql } = migrationVigenteDaChave()
  const acentos = tabelaDeAcentosNoSql(sql)
  const classe = classeDeEspacoNoSql(sql)

  it(`a migration vigente (${arquivo}) tem tabela de acentos não vazia (guarda do próprio teste)`, () => {
    expect(acentos.de.length).toBeGreaterThan(0)
  })

  it('a tabela de acentos do TS é EXATAMENTE a do SQL', () => {
    expect(ACENTOS_DE).toBe(acentos.de)
    expect(ACENTOS_PARA).toBe(acentos.para)
  })

  it('os dois lados do translate têm o mesmo comprimento (senão o SQL descarta caracteres)', () => {
    // translate(x, de, para) com `para` mais curto APAGA os caracteres sobrando de
    // `de` em vez de traduzi-los — um erro que passa despercebido no olho.
    expect(acentos.para.length).toBe(acentos.de.length)
  })

  it('nenhum caractere se repete no lado esquerdo do translate', () => {
    expect(new Set([...acentos.de]).size).toBe(acentos.de.length)
  })

  it('a classe de espaço é a explícita — nunca `\\s`', () => {
    // `\s` do Postgres é [[:space:]] (locale) e o do JavaScript inclui NBSP: os dois
    // NÃO são o mesmo conjunto. A classe explícita é o que torna este teste uma prova.
    expect(classe).toBe('[ \\t\\n\\r\\f\\v]+')
    expect(sql.slice(sql.lastIndexOf(ANCORA_CREATE))).not.toMatch(/'\\s\+'/)
  })

  it('o SQL normaliza para NFC antes de tudo (senão o mesmo nome em NFD vira outra pessoa)', () => {
    const corpo = sql.slice(sql.lastIndexOf(ANCORA_CREATE))
    expect(corpo).toMatch(/normalize\(\s*p_nome\s*,\s*NFC\s*\)/)
  })

  it('as duas formas Unicode do MESMO nome dão a MESMA chave', () => {
    const precomposto = 'Joao Silva'.replace('a', 'ã') // NFC: 'ã' e um codigo so
    const decomposto = precomposto.normalize('NFD') // 'a' + til combinante
    // Sanidade do proprio caso: se as duas formas fossem iguais o teste nao mediria
    // nada — e o erro classico de escrever as duas variantes no codigo-fonte e o
    // editor normalizar as duas para a mesma coisa.
    expect(decomposto).not.toBe(precomposto)
    expect(decomposto.length).toBeGreaterThan(precomposto.length)
    expect(chaveColaborador(decomposto)).toBe('joao silva')
    expect(chaveColaborador(decomposto)).toBe(chaveColaborador(precomposto))
  })

  it('o SQL apara DEPOIS de colapsar (btrim por fora do regexp_replace)', () => {
    const corpo = sql.slice(sql.lastIndexOf(ANCORA_CREATE))
    const posBtrim = corpo.indexOf('btrim(')
    const posRegexp = corpo.indexOf('regexp_replace(')
    expect(posBtrim).toBeGreaterThan(-1)
    expect(posRegexp).toBeGreaterThan(posBtrim)
  })

  // Corpus: cada caso exercita uma operação da função. Os valores esperados foram
  // conferidos contra o Postgres real (ensaio em transação desfeita, 28/08/2026).
  it.each([
    ['  João   Silva  ', 'joao silva'],
    ['JOAO SILVA', 'joao silva'],
    ['joão  silva', 'joao silva'],
    ['José  Antônio   Peçanha', 'jose antonio pecanha'],
    ['Ção Ñandú Ünico', 'cao nandu unico'],
    ['Maria\tdos\nSantos', 'maria dos santos'],
    ['\tFulano\r\n', 'fulano'],
    ['ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucn'],
    ['', ''],
    ['   ', ''],
  ])('normaliza %j → %j', (entrada, esperado) => {
    expect(chaveColaborador(entrada)).toBe(esperado)
  })

  it('todo caractere da tabela de acentos some da chave', () => {
    for (const c of ACENTOS_DE) {
      const chave = chaveColaborador(c)
      expect(chave, `${c} sobreviveu como ${chave}`).not.toContain(c)
    }
  })

  it('nulo e indefinido devolvem chave vazia, e vazia não casa com cadastro nenhum', () => {
    expect(chaveColaborador(null)).toBe('')
    expect(chaveColaborador(undefined)).toBe('')
  })

  it('chavesDistintas junta as grafias e preserva a ordem de aparição', () => {
    expect(
      chavesDistintas(['João Silva', 'JOAO SILVA', null, 'Maria', '  ', 'joão  silva']),
    ).toEqual(['joao silva', 'maria'])
  })
})
