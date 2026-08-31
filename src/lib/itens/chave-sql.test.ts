import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ACENTOS_DE, ACENTOS_PARA, chaveItem } from '@/lib/itens/chave'
import { chaveColaborador } from '@/lib/colaboradores/chave'

// GUARDA DE SINCRONIA TS↔SQL DA CHAVE DE ITEM (F41).
//
// `chaveItem` (TS) se declara espelho de `public.item_chave(text)`, a função
// IMMUTABLE da migration 0125 que alimenta a coluna GERADA `itens.nome_chave` e o
// índice único `itens_nome_chave_uidx`. É essa igualdade que permite ao servidor
// achar o item já cadastrado a partir do texto digitado, e é uma igualdade que
// ninguém percebe quebrar: um acento a mais na tabela do SQL e a busca deixa de
// achar, em silêncio — o cadastro tenta inserir e leva um erro de índice único onde
// deveria ter simplesmente selecionado o item que já existia.
//
// Mesma técnica de `colaboradores/chave-sql.test.ts` (F37), `detentor-sql.test.ts`
// (F36) e `transicoes-sql.test.ts`: deriva o vocabulário DIRETO do SQL da migration
// vigente e compara com o TS. O comportamento em si é provado por roteiro SQL no job
// `banco` do CI (`supabase/tests/f41_regularizacao.sql`); aqui a rede é de compilação.

const DIR_MIGRACOES = join(process.cwd(), 'supabase', 'migrations')

// Âncora da DEFINIÇÃO, não do nome: `comment on function`, `revoke` e `grant` também
// citam a função, e um `lastIndexOf` pelo nome cru cairia numa dessas linhas — depois
// do corpo — e não acharia o `translate` nenhum.
const ANCORA_CREATE = 'create or replace function public.item_chave'

/** A migration VIGENTE da função: a de maior número que a define. */
function migrationVigenteDaChave(): { arquivo: string; sql: string } {
  const arquivos = readdirSync(DIR_MIGRACOES)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) =>
      readFileSync(join(DIR_MIGRACOES, f), 'utf8').includes(ANCORA_CREATE),
    )
    .sort() // prefixo numérico zero-padded ordena lexicograficamente
  const arquivo = arquivos.at(-1)
  if (!arquivo) throw new Error('nenhuma migration define item_chave')
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
      'não achei o translate(normalize(p_nome, NFC), …, …) de item_chave',
    )
  }
  return { de: m[1], para: m[2] }
}

/** A classe de espaço do `regexp_replace(..., '<classe>', ' ', 'g')` do corpo. */
function classeDeEspacoNoSql(sql: string): string {
  const corpo = sql.slice(sql.lastIndexOf(ANCORA_CREATE))
  const m = corpo.match(/regexp_replace\([\s\S]*?,\s*'(\[[^']*\]\+)'\s*,\s*' '\s*,\s*'g'\s*\)/)
  if (!m) throw new Error('não achei a classe de espaço de item_chave')
  return m[1]
}

describe('chaveItem (TS) espelha item_chave (SQL da migration vigente)', () => {
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

  it('o SQL normaliza para NFC antes de tudo (senão o mesmo nome em NFD vira outro item)', () => {
    const corpo = sql.slice(sql.lastIndexOf(ANCORA_CREATE))
    expect(corpo).toMatch(/normalize\(\s*p_nome\s*,\s*NFC\s*\)/)
  })

  it('a função SQL é IMMUTABLE e STRICT (senão não cabe na coluna gerada)', () => {
    const corpo = sql.slice(sql.lastIndexOf(ANCORA_CREATE))
    // A coluna `itens.nome_chave` é `generated always as (public.item_chave(nome))
    // stored`: o Postgres só aceita expressão IMMUTABLE ali. Perder o `immutable`
    // numa recriação futura quebraria a migration inteira, não só esta chave.
    expect(corpo).toMatch(/\bimmutable\b/i)
    expect(corpo).toMatch(/\bstrict\b/i)
  })

  it('as duas formas Unicode do MESMO nome dão a MESMA chave', () => {
    const precomposto = 'Cabo Optico'.replace('O', 'Ó') // NFC: 'Ó' é um código só
    const decomposto = precomposto.normalize('NFD') // 'O' + acento combinante
    // Sanidade do próprio caso: se as duas formas fossem iguais o teste não mediria
    // nada — e o erro clássico é escrever as duas variantes no código-fonte e o
    // editor normalizar as duas para a mesma coisa.
    expect(decomposto).not.toBe(precomposto)
    expect(decomposto.length).toBeGreaterThan(precomposto.length)
    expect(chaveItem(decomposto)).toBe('cabo optico')
    expect(chaveItem(decomposto)).toBe(chaveItem(precomposto))
  })

  it('o SQL apara DEPOIS de colapsar (btrim por fora do regexp_replace)', () => {
    const corpo = sql.slice(sql.lastIndexOf(ANCORA_CREATE))
    const posBtrim = corpo.indexOf('btrim(')
    const posRegexp = corpo.indexOf('regexp_replace(')
    expect(posBtrim).toBeGreaterThan(-1)
    expect(posRegexp).toBeGreaterThan(posBtrim)
  })

  // Corpus: cada caso exercita uma operação da função. Os valores esperados foram
  // conferidos contra o Postgres real (ensaio, 31/08/2026) — inclusive a igualdade
  // com `colaborador_chave` do mesmo texto, medida no mesmo `select`.
  it.each([
    ['  Mochila   de Notebook  ', 'mochila de notebook'],
    ['MOCHILA DE NOTEBOOK', 'mochila de notebook'],
    ['mochila  de  notebook', 'mochila de notebook'],
    ['Adaptador USB-C / HDMI', 'adaptador usb-c / hdmi'],
    ['Cabo Óptico Ñ Padrão', 'cabo optico n padrao'],
    ['Mouse\tsem\nfio', 'mouse sem fio'],
    ['\tCarregador\r\n', 'carregador'],
    ['ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucn'],
    ['', ''],
    ['   ', ''],
  ])('normaliza %j → %j', (entrada, esperado) => {
    expect(chaveItem(entrada)).toBe(esperado)
  })

  it('todo caractere da tabela de acentos some da chave', () => {
    for (const c of ACENTOS_DE) {
      const chave = chaveItem(c)
      expect(chave, `${c} sobreviveu como ${chave}`).not.toContain(c)
    }
  })

  it('nulo e indefinido devolvem chave vazia', () => {
    expect(chaveItem(null)).toBe('')
    expect(chaveItem(undefined)).toBe('')
  })

  // A 0125 declara, com todas as letras, ser "espelho EXATO de colaborador_chave".
  // Este caso trava essa afirmação: se um dos dois lados ganhar um acento novo e o
  // outro não, aqui quebra — mesmo que cada guarda TS↔SQL continue passando sozinha.
  it('normaliza IDÊNTICO a chaveColaborador (a 0125 se declara espelho da 0112)', () => {
    for (const texto of [
      '  Mochila   de Notebook  ',
      'Cabo Óptico Ñ Padrão',
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'Mouse\tsem\nfio',
      '',
    ]) {
      expect(chaveItem(texto)).toBe(chaveColaborador(texto))
    }
  })
})
