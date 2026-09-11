import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PREFIXO_PATRIMONIO_FONTE } from '@/lib/patrimonio'
import {
  ESTADOS,
  TIPO_CANONICO,
  SITUACAO_CANONICA,
  PREFIXOS_PATRIMONIO,
  mapearUnidade,
  mapearCategoria,
  normalizarTexto,
} from './deparas'

// GUARDA DO SEED DO VOCABULÁRIO DO IMPORT (F56 · Frente D, Decisão 1).
//
// Molde `src/lib/validators/tipos-item-sql.test.ts` (F39): "os literais esperados
// vivem AQUI, no próprio teste, e não num módulo que alguém possa 'arrumar' junto com
// o seed". Os 13 apelidos (+ 5 nomes próprios), as 5 categorias, os 17 estados, as 12
// formas de exibição e os 7 prefixos são a fixture deste teste; o seed da migration
// 0139 é o OUTRO lado — se um dia divergirem, é aqui que o `npm run test` acusa, sem
// depender de ninguém lembrar de "manter os dois sincronizados".
//
// Este teste NASCE VERMELHO antes da 0139 existir (não há migration para ler) — é a
// trava do item 1a da ordem da fase, guardada em docs/f56-evidencias/.

const DIR_MIGRACOES = join(process.cwd(), 'supabase', 'migrations')

function lerMigracoes(): { arquivo: string; sql: string }[] {
  return readdirSync(DIR_MIGRACOES)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((arquivo) => ({ arquivo, sql: readFileSync(join(DIR_MIGRACOES, arquivo), 'utf8') }))
}

/** A migration VIGENTE que contém a âncora — a de MAIOR número (não deveria haver
 *  duas: migration aplicada nunca se edita; a busca por âncora, e não por número
 *  fixo, é só para a mensagem de erro apontar o arquivo certo enquanto a 0139 ainda
 *  não existe). */
function migracaoComAncora(ancora: string): { arquivo: string; sql: string } {
  const achadas = lerMigracoes().filter((m) => m.sql.includes(ancora))
  const arquivo = achadas.at(-1)
  if (!arquivo) {
    throw new Error(
      `nenhuma migration contém "${ancora}" — a 0139 (vocabulário do import) ainda não existe`,
    )
  }
  return arquivo
}

// -----------------------------------------------------------------------------
// Extração das tuplas de cada INSERT — funções PURAS de texto, sem SQL parser.
// -----------------------------------------------------------------------------

/** O trecho entre `ancora` e o `;` que fecha o comando (o PRIMEIRO `;` depois dela —
 *  nenhum dos quatro INSERTs desta migration tem `;` dentro de literal). */
function corpoDoComando(sql: string, ancora: string): string {
  const inicio = sql.indexOf(ancora)
  if (inicio === -1) throw new Error(`âncora não encontrada: "${ancora}"`)
  const aposAncora = inicio + ancora.length
  const fimRel = sql.slice(aposAncora).indexOf(';')
  if (fimRel === -1) throw new Error(`comando sem ';' de fechamento após "${ancora}"`)
  return sql.slice(aposAncora, aposAncora + fimRel)
}

type LinhaApelido = { slug: string; apelido: string }

function apelidosNoSql(sql: string): LinhaApelido[] {
  const corpo = corpoDoComando(
    sql,
    'insert into public.unidades_apelidos (filial_id, apelido)',
  )
  return [...corpo.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)].map((m) => ({
    slug: m[1]!,
    apelido: m[2]!,
  }))
}

type LinhaCategoria = { termo: string; categoria: string; rotulo: string | null }

function categoriasNoSql(sql: string): LinhaCategoria[] {
  const corpo = corpoDoComando(
    sql,
    'insert into public.import_termos_categoria (termo, categoria, rotulo) values',
  )
  return [...corpo.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)].map((m) => ({
    termo: m[1]!,
    categoria: m[2]!,
    rotulo: m[3]!,
  }))
}

type LinhaEstado = { termo: string; estado: string; rotulo: string | null }

function estadosNoSql(sql: string): LinhaEstado[] {
  const corpo = corpoDoComando(
    sql,
    'insert into public.import_termos_estado (termo, estado, rotulo) values',
  )
  return [
    ...corpo.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(null|'[^']*')\s*\)/g),
  ].map((m) => ({
    termo: m[1]!,
    estado: m[2]!,
    rotulo: m[3] === 'null' ? null : m[3]!.slice(1, -1),
  }))
}

function prefixosNoSql(sql: string): string[] {
  const corpo = corpoDoComando(sql, 'insert into public.import_prefixos_patrimonio (prefixo) values')
  return [...corpo.matchAll(/\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]!)
}

function checkPrefixoFormato(sql: string): string {
  const m = sql.match(/import_prefixos_patrimonio_formato check \(prefixo ~ '([^']+)'\)/)
  if (!m) throw new Error('não achei o check import_prefixos_patrimonio_formato')
  return m[1]!
}

/** As tuplas `(slug, nome)` do seed fixo de filiais (0007) — só as CINCO originais.
 *  `filialteste` não entra: não tem migration própria (nasceu direto em produção,
 *  fato 3 da ordem) e o nome próprio dela não é histórico (não tinha apelido nenhum
 *  no deparas.ts de hoje). */
function filiaisNoSeedFixo(): { slug: string; nome: string }[] {
  const { sql } = migracaoComAncora('insert into public.filiais (slug, nome) values')
  const corpo = corpoDoComando(sql, 'insert into public.filiais (slug, nome) values')
  return [...corpo.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)].map((m) => ({
    slug: m[1]!,
    nome: m[2]!,
  }))
}

/** O rename idempotente da 0026: `serra-park` → slug `serra`, nome `Serra`. */
function nomesDasFiliaisHoje(): Map<string, string> {
  const mapa = new Map(filiaisNoSeedFixo().map((f) => [f.slug, f.nome]))
  if (mapa.has('serra-park')) {
    mapa.delete('serra-park')
    mapa.set('serra', 'Serra')
  }
  return mapa
}

// -----------------------------------------------------------------------------
// OS LITERAIS ESPERADOS — vivem aqui, e só aqui.
// -----------------------------------------------------------------------------

/** Os 13 apelidos HISTÓRICOS, na ordem do seed (slug da filial dona, apelido cru). */
const APELIDOS_13: readonly LinhaApelido[] = [
  { slug: 'matriz', apelido: 'matriz sao marcos' },
  { slug: 'cd-afonso-pena', apelido: 'cd-afp' },
  { slug: 'cd-afonso-pena', apelido: 'cd afp' },
  { slug: 'cd-afonso-pena', apelido: 'cd-pena' },
  { slug: 'cd-afonso-pena', apelido: 'cd pena' },
  // COM hífen — o nome PRÓPRIO da CD, no banco, é "CD Afonso Pena" (SEM hífen); a
  // forma com hífen é apelido, não o termo implícito. Trocar as duas em silêncio
  // quebra a CD (armadilha documentada na medição V da F56).
  { slug: 'cd-afonso-pena', apelido: 'cd-afonso pena' },
  { slug: 'cd-afonso-pena', apelido: 'cd-afonsopena' },
  { slug: 'cd-afonso-pena', apelido: 'afonso pena' },
  { slug: 'eusebio', apelido: 'filial-ce' },
  { slug: 'eusebio', apelido: 'filial ce' },
  { slug: 'serra', apelido: 'serra park' },
  { slug: 'linhares', apelido: 'filial - linhares' },
  { slug: 'linhares', apelido: 'filial linhares' },
]

/** Os 18 termos históricos = os 13 apelidos ACIMA + os 5 nomes próprios normalizados
 *  (que NÃO viram linha em unidades_apelidos — Decisão 2, "o nome próprio sempre
 *  vale"). É a MESMA lista de chaves que `UNIDADES` tem hoje em `deparas.ts` — essa
 *  igualdade é o describe temporário no fim do arquivo, e sai quando a Frente D2
 *  apagar `UNIDADES`. Aqui a lista é reconstruída a partir do SQL (o seed + o nome
 *  das filiais lido de 0007/0026), não copiada de cabeça — é essa reconstrução que
 *  prova que "cd afonso pena" (sem hífen) é o nome, não um apelido.
 */
const NOMES_PROPRIOS_ESPERADOS: readonly { slug: string; chave: string }[] = [
  { slug: 'matriz', chave: 'matriz' },
  { slug: 'cd-afonso-pena', chave: 'cd afonso pena' },
  { slug: 'linhares', chave: 'linhares' },
  { slug: 'serra', chave: 'serra' },
  { slug: 'eusebio', chave: 'eusebio' },
]

const CATEGORIAS_5: readonly LinhaCategoria[] = [
  { termo: 'notebook', categoria: 'notebook', rotulo: 'Notebook' },
  { termo: 'desktop', categoria: 'desktop', rotulo: 'Desktop' },
  { termo: 'monitor', categoria: 'monitor', rotulo: 'Monitor' },
  { termo: 'celular', categoria: 'celular', rotulo: 'Celular' },
  { termo: 'tablet', categoria: 'tablet', rotulo: 'Tablet' },
]

const ESTADOS_17: readonly LinhaEstado[] = [
  { termo: 'saida', estado: 'em_uso', rotulo: 'Saída' },
  { termo: 'remanejo', estado: 'em_uso', rotulo: null },
  { termo: 'guardada', estado: 'em_estoque', rotulo: null },
  { termo: 'estoque', estado: 'em_estoque', rotulo: 'Estoque' },
  { termo: 'reservada', estado: 'reservado', rotulo: null },
  { termo: 'reservado', estado: 'reservado', rotulo: 'Reservado' },
  { termo: 'emprestimo', estado: 'emprestado', rotulo: 'Empréstimo' },
  { termo: 'validar', estado: 'em_triagem', rotulo: 'Validar' },
  { termo: 'devolvido', estado: 'em_triagem', rotulo: null },
  { termo: 'devolucao', estado: 'em_triagem', rotulo: null },
  { termo: 'manutencao', estado: 'em_manutencao', rotulo: 'Manutenção' },
  { termo: 'rt wap', estado: 'defasado', rotulo: null },
  { termo: 'posse wap', estado: 'defasado', rotulo: null },
  { termo: 'defasada', estado: 'defasado', rotulo: null },
  { termo: 'defasado', estado: 'defasado', rotulo: 'Defasado' },
  { termo: 'descarte', estado: 'descartado', rotulo: null },
  { termo: 'descartado', estado: 'descartado', rotulo: null },
]

const PREFIXOS_7: readonly string[] = ['WAP', 'PRO', 'LEA', 'TEC', 'STF', 'PAT', 'NOO']

// -----------------------------------------------------------------------------
// Testes
// -----------------------------------------------------------------------------

describe('0139: os 13 apelidos históricos, um por filial certa', () => {
  const { arquivo, sql } = migracaoComAncora(
    'insert into public.unidades_apelidos (filial_id, apelido)',
  )
  const doSql = apelidosNoSql(sql)

  it(`a migration vigente (${arquivo}) semeia pelo menos um apelido (guarda do próprio teste)`, () => {
    expect(doSql.length).toBeGreaterThan(0)
  })

  it('são exatamente os 13, na mesma ordem, apontando para o slug certo', () => {
    expect(doSql).toEqual(APELIDOS_13)
  })

  it('nenhum apelido está vazio ou é só espaço', () => {
    for (const l of doSql) expect(l.apelido.trim().length).toBeGreaterThan(0)
  })

  it('nenhum apelido se repete (13 chaves distintas)', () => {
    const chaves = doSql.map((l) => normalizarTexto(l.apelido))
    expect(new Set(chaves).size).toBe(chaves.length)
  })
})

describe('0139: os 5 nomes próprios (não viram linha) somados aos 13 apelidos são os 18 termos históricos', () => {
  const { sql } = migracaoComAncora('insert into public.unidades_apelidos (filial_id, apelido)')
  const apelidos = apelidosNoSql(sql)
  const nomesHoje = nomesDasFiliaisHoje()

  it.each(NOMES_PROPRIOS_ESPERADOS)(
    'o nome da filial $slug normaliza para "$chave" (lido de 0007/0026, não copiado de cabeça)',
    ({ slug, chave }) => {
      const nome = nomesHoje.get(slug)
      expect(nome, `slug "${slug}" não está no seed fixo de filiais`).toBeDefined()
      expect(normalizarTexto(nome!)).toBe(chave)
    },
  )

  it('13 apelidos + 5 nomes próprios = 18 termos históricos, sem repetição entre os dois grupos', () => {
    const chavesApelidos = apelidos.map((a) => normalizarTexto(a.apelido))
    const chavesNomes = NOMES_PROPRIOS_ESPERADOS.map((n) => n.chave)
    const todas = [...chavesApelidos, ...chavesNomes]
    expect(todas).toHaveLength(18)
    expect(new Set(todas).size).toBe(18)
  })
})

describe('0139: as 5 categorias, cada uma com rótulo', () => {
  const { arquivo, sql } = migracaoComAncora(
    'insert into public.import_termos_categoria (termo, categoria, rotulo) values',
  )
  const doSql = categoriasNoSql(sql)

  it(`a migration vigente (${arquivo}) semeia pelo menos uma categoria (guarda do próprio teste)`, () => {
    expect(doSql.length).toBeGreaterThan(0)
  })

  it('são exatamente as 5, na mesma ordem, com o rótulo certo', () => {
    expect(doSql).toEqual(CATEGORIAS_5)
  })

  it('nenhuma categoria do seed é "outro" (o check da tabela também recusaria)', () => {
    for (const l of doSql) expect(l.categoria).not.toBe('outro')
  })
})

describe('0139: os 17 estados, 7 com rótulo', () => {
  const { arquivo, sql } = migracaoComAncora(
    'insert into public.import_termos_estado (termo, estado, rotulo) values',
  )
  const doSql = estadosNoSql(sql)

  it(`a migration vigente (${arquivo}) semeia pelo menos um estado (guarda do próprio teste)`, () => {
    expect(doSql.length).toBeGreaterThan(0)
  })

  it('são exatamente os 17, na mesma ordem, cada um com o estado e o rótulo certos', () => {
    expect(doSql).toEqual(ESTADOS_17)
  })

  it('nenhum estado do seed é devolvido_fornecedor (o check da tabela também recusaria)', () => {
    for (const l of doSql) expect(l.estado).not.toBe('devolvido_fornecedor')
  })

  it('exatamente 7 termos têm rótulo (as formas de exibição de estado)', () => {
    expect(doSql.filter((l) => l.rotulo !== null)).toHaveLength(7)
  })

  it('descartado não tem rótulo em nenhuma das suas duas linhas (o check da tabela também recusaria)', () => {
    for (const l of doSql.filter((l) => l.estado === 'descartado')) {
      expect(l.rotulo).toBeNull()
    }
  })

  it('todo rótulo normaliza de volta para o próprio termo da linha', () => {
    for (const l of doSql.filter((l) => l.rotulo !== null)) {
      expect(normalizarTexto(l.rotulo!)).toBe(l.termo)
    }
  })
})

describe('0139: os 7 prefixos de patrimônio, e o check bate com PREFIXO_PATRIMONIO_FONTE', () => {
  const { arquivo, sql } = migracaoComAncora(
    'insert into public.import_prefixos_patrimonio (prefixo) values',
  )
  const doSql = prefixosNoSql(sql)

  it(`a migration vigente (${arquivo}) semeia pelo menos um prefixo (guarda do próprio teste)`, () => {
    expect(doSql.length).toBeGreaterThan(0)
  })

  it('são exatamente os 7, na mesma ordem de PREFIXOS_PATRIMONIO', () => {
    expect(doSql).toEqual(PREFIXOS_7)
  })

  it("o check import_prefixos_patrimonio_formato é exatamente '^' + PREFIXO_PATRIMONIO_FONTE + '$'", () => {
    expect(checkPrefixoFormato(sql)).toBe(`^${PREFIXO_PATRIMONIO_FONTE}$`)
  })

  it('todo prefixo do seed bate com o check da própria tabela', () => {
    const re = new RegExp(checkPrefixoFormato(sql))
    for (const p of doSql) expect(p).toMatch(re)
  })
})

// -----------------------------------------------------------------------------
// ⚠ DESCRIBE TEMPORÁRIO — sai na Frente D2.
//
// Enquanto `deparas.ts` ainda tem UNIDADES/CATEGORIAS/ESTADOS/TIPO_CANONICO/
// SITUACAO_CANONICA/PREFIXOS_PATRIMONIO como dado hardcoded (a segunda metade da
// Frente D substitui essas constantes por parâmetro vindo do banco), este describe
// prova que o seed novo da 0139 e o código velho ainda concordam — a rede de
// segurança de quem vai apagar as constantes. Assim que elas saírem de deparas.ts,
// este describe (e só ele) fica órfão e deve ser apagado, não corrigido.
// -----------------------------------------------------------------------------
describe('(TEMPORÁRIO — sai quando a Frente D2 apagar as constantes de deparas.ts) o seed da 0139 ainda bate com o vocabulário hardcoded de hoje', () => {
  it('todo apelido histórico resolve, hoje, para a MESMA filial que o seed aponta', () => {
    const filialPorSlugLocal: Record<string, string> = {
      matriz: 'Matriz',
      'cd-afonso-pena': 'CD-Afonso Pena',
      linhares: 'Linhares',
      eusebio: 'Eusébio',
      serra: 'Serra',
    }
    for (const { slug, apelido } of APELIDOS_13) {
      expect(mapearUnidade(apelido), `apelido "${apelido}"`).toBe(filialPorSlugLocal[slug])
    }
  })

  it('as 5 categorias do seed resolvem, hoje, para o mesmo enum via mapearCategoria', () => {
    for (const { termo, categoria } of CATEGORIAS_5) {
      expect(mapearCategoria(termo)).toBe(categoria)
    }
  })

  it('ESTADOS (ainda exportado de deparas.ts) tem as mesmas 17 chaves → estado do seed', () => {
    const doTs = Object.entries(ESTADOS).map(([termo, estado]) => ({ termo, estado }))
    const doSeed = ESTADOS_17.map(({ termo, estado }) => ({ termo, estado }))
    expect(doTs).toEqual(doSeed)
  })

  it('TIPO_CANONICO (ainda exportado) tem exatamente os 5 rótulos de categoria do seed', () => {
    const doTs = Object.values(TIPO_CANONICO).sort()
    const doSeed = CATEGORIAS_5.map((c) => c.rotulo).sort()
    expect(doTs).toEqual(doSeed)
  })

  it('SITUACAO_CANONICA (ainda exportado) tem exatamente os 7 rótulos de estado do seed', () => {
    const doTs = Object.values(SITUACAO_CANONICA).sort()
    const doSeed = ESTADOS_17.filter((e) => e.rotulo !== null).map((e) => e.rotulo).sort()
    expect(doTs).toEqual(doSeed)
  })

  it('PREFIXOS_PATRIMONIO (ainda exportado) é o MESMO conjunto de 7 do seed', () => {
    expect([...PREFIXOS_PATRIMONIO].sort()).toEqual([...PREFIXOS_7].sort())
  })
})
