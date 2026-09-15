import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { definicoesDeFuncao, fimDoComando } from '../../../scripts/db/corpo-vigente.mjs'
import {
  CONSTRAINTS_TRADUZIDAS,
  FRASES_DO_AUTH,
  FRASES_DO_MOTOR,
  MSG_SQL,
  TABELAS_CITADAS_EM_ERRO,
} from '@/lib/supabase/erros-do-banco'

// AS FRASES DE ERRO CONFERIDAS CONTRA O SQL VIVO (F58 · Frente D).
//
// Duas perguntas, as duas contra o banco que as migrations produzem HOJE — nunca contra um `grep`,
// que acharia o texto num corpo histórico já apagado por um `create or replace` posterior e nasceria
// verde para uma tradução morta:
//
//  1. As grafias de `MSG_SQL`, contra o CORPO VIVO de cada função — o último `create [or replace]
//     function` de cada assinatura, varrendo as migrations em ordem, SEM os comentários (texto que só
//     vive num `--` não é mensagem que o banco escreve), comparado sem caixa (`erros.ts` minusculiza;
//     o SQL escreve com maiúscula). Todo ramo tem ao menos uma grafia VIVA, e CADA grafia é viva ou é
//     a gêmea de acento de uma grafia viva do MESMO ramo. Frase que só existe num corpo histórico
//     REPROVA, com mensagem própria — e a que não existe em SQL nenhum sem ser gêmea, também.
//
//  2. Cada nome de `CONSTRAINTS_TRADUZIDAS` existe no ESQUEMA VIVO, por uma réplica das migrations
//     aplicada NA ORDEM DO TEXTO — `create table` (o `constraint <nome>` inline e o nome implícito
//     `<tabela>_<coluna>_key` de coluna `unique`), `add constraint`, `create [unique] index`,
//     `drop index`, `drop constraint`, `rename constraint`, `alter index … rename to`.
//
// Sabotagem G (docs/f58-evidencias): devolver 'saldo insuficiente' ao ramo `estoqueInsuficiente`
// reprova aqui — a frase existiu (0015/0019/0024) e morreu na doutrina Total/Estoque, e o ramo segue
// tendo 'estoque insuficiente' vivo. É a prova de que o teste não é um `grep` nem um "algum casa".
// Disco lido na COLETA.

const PASTA = join(process.cwd(), 'supabase', 'migrations')
const semComentario = (sql: string) => sql.replace(/--[^\n]*/g, '')
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const MIGRATIONS = readdirSync(PASTA)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((arquivo) => ({ arquivo, sql: readFileSync(join(PASTA, arquivo), 'utf8') }))

// --- 1. os corpos vivos e os históricos -------------------------------------------------------
const CORPOS_VIVOS = new Map<string, string>()
const TODOS_OS_CORPOS: string[] = []
for (const m of MIGRATIONS) {
  for (const d of definicoesDeFuncao(m.sql)) {
    const texto = semComentario(d.texto).toLowerCase()
    CORPOS_VIVOS.set(`${d.esquema}.${d.nome}(${d.tipos.join(',')})`, texto)
    TODOS_OS_CORPOS.push(texto)
  }
}
const TEXTOS_VIVOS = [...CORPOS_VIVOS.values()]

const grafiaViva = (grafia: string) => TEXTOS_VIVOS.some((t) => t.includes(grafia.toLowerCase()))
const grafiaHistorica = (grafia: string) =>
  !grafiaViva(grafia) && TODOS_OS_CORPOS.some((t) => t.includes(grafia.toLowerCase()))

export type VeredictoDeGrafia = 'viva' | 'gemea-de-viva' | 'historica' | 'sem-fonte'

/** O veredicto de uma grafia DENTRO do seu ramo. */
export function veredicto(grafia: string, doRamo: readonly string[]): VeredictoDeGrafia {
  if (grafiaViva(grafia)) return 'viva'
  if (grafiaHistorica(grafia)) return 'historica'
  const gemea = doRamo.some((outra) => outra !== grafia && grafiaViva(outra) && semAcento(outra) === semAcento(grafia))
  return gemea ? 'gemea-de-viva' : 'sem-fonte'
}

// --- 2. a réplica do esquema: nomes de constraint e de índice vivos ---------------------------

/** Os itens de primeiro nível de uma lista separada por vírgula (parêntese e texto não separam). */
function itensDePrimeiroNivel(lista: string): string[] {
  const itens: string[] = []
  let nivel = 0
  let atual = ''
  let emTexto = false
  for (const c of lista) {
    if (c === "'") emTexto = !emTexto
    if (!emTexto && c === '(') nivel++
    if (!emTexto && c === ')') nivel--
    if (!emTexto && c === ',' && nivel === 0) {
      itens.push(atual)
      atual = ''
      continue
    }
    atual += c
  }
  if (atual.trim()) itens.push(atual)
  return itens
}

export function nomesVivos(migrations: readonly { sql: string }[]): Set<string> {
  const vivos = new Set<string>()
  for (const { sql: bruto } of migrations) {
    const sql = semComentario(bruto).toLowerCase()
    // Os comandos se aplicam na ORDEM EM QUE APARECEM no arquivo — não "todos os create, depois
    // todos os drop". A 0091 faz `drop index X; create unique index X` (o mesmo nome, recriado por
    // filial), e aplicar por tipo de comando daria X como morto. A primeira versão desta réplica,
    // na mesa, errou exatamente isso; o caso sintético abaixo o guarda.
    const eventos: { pos: number; aplicar: () => void }[] = []
    const em = (re: RegExp, aplicar: (m: RegExpMatchArray) => void) => {
      for (const m of sql.matchAll(re)) eventos.push({ pos: m.index ?? 0, aplicar: () => aplicar(m) })
    }
    em(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/g, (m) => {
      const tabela = m[1]
      const inicio = (m.index ?? 0) + m[0].length - 1
      const fim = fimDoComando(sql, inicio)
      const corpo = sql.slice(inicio + 1, fim === -1 ? sql.length : fim)
      for (const c of corpo.matchAll(/constraint\s+([a-z_][a-z0-9_]*)/g)) vivos.add(c[1])
      // Cada definição de coluna é um item de PRIMEIRO NÍVEL da lista — vírgula dentro de parêntese
      // (`numeric(10,2)`, `check (x in ('a','b'))`) ou de texto não separa. A primeira versão partia
      // em "vírgula + quebra de linha" e dava o `unique` de `slug` ao `id` quando os dois dividiam a
      // linha; nas migrations reais passava por sorte de diagramação.
      for (const item of itensDePrimeiroNivel(corpo)) {
        const col = /^\s*([a-z_][a-z0-9_]*)\s+[a-z]/.exec(item)?.[1]
        if (col && /\bunique\b/.test(item) && !/^\s*(constraint|unique|primary|foreign|check|exclude)\b/.test(item)) {
          vivos.add(`${tabela}_${col}_key`.slice(0, 63))
        }
      }
    })
    em(/add\s+constraint\s+([a-z_][a-z0-9_]*)/g, (m) => vivos.add(m[1]))
    em(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/g, (m) => vivos.add(m[1]))
    em(/drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/g, (m) => vivos.delete(m[1]))
    em(/drop\s+constraint\s+(?:if\s+exists\s+)?([a-z_][a-z0-9_]*)/g, (m) => vivos.delete(m[1]))
    em(/rename\s+constraint\s+([a-z_][a-z0-9_]*)\s+to\s+([a-z_][a-z0-9_]*)/g, (m) => {
      vivos.delete(m[1])
      vivos.add(m[2])
    })
    em(/alter\s+index\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+rename\s+to\s+([a-z_][a-z0-9_]*)/g, (m) => {
      vivos.delete(m[1])
      vivos.add(m[2])
    })
    eventos.sort((a, b) => a.pos - b.pos).forEach((e) => e.aplicar())
  }
  return vivos
}
const NOMES_VIVOS = nomesVivos(MIGRATIONS)
const TABELAS_VIVAS = new Set(
  MIGRATIONS.flatMap((m) =>
    [...semComentario(m.sql).toLowerCase().matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/g)].map((x) => x[1]),
  ),
)

describe('a réplica do esquema e dos corpos vivos (guarda do próprio teste)', () => {
  it('enxerga as migrations e as funções', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(100)
    expect(CORPOS_VIVOS.size).toBeGreaterThan(50)
  })
  it('um texto que só vive num corpo HISTÓRICO não é vivo (a prova de que não é grep)', () => {
    expect(MIGRATIONS.some((m) => semComentario(m.sql).toLowerCase().includes('saldo insuficiente'))).toBe(true)
    expect(veredicto('saldo insuficiente', ['estoque insuficiente', 'saldo insuficiente'])).toBe('historica')
  })
  it('a gêmea de acento só passa quando a outra grafia do ramo é viva', () => {
    expect(veredicto('inválida para ativo', ['invalida para ativo', 'inválida para ativo'])).toBe('gemea-de-viva')
    expect(veredicto('inválida para ativo', ['inválida para ativo'])).toBe('sem-fonte')
    expect(veredicto('frase que nenhum sql escreve', ['estoque insuficiente', 'frase que nenhum sql escreve'])).toBe('sem-fonte')
  })
  it('texto que só vive num COMENTÁRIO não é vivo', () => {
    const [d] = definicoesDeFuncao("create function public.f() returns void language plpgsql as $$ begin -- raise exception 'frase de comentario';\n null; end $$;")
    expect(semComentario(d!.texto)).not.toContain('frase de comentario')
  })
  it('a réplica resolve nome implícito, índice, check e rename', () => {
    const r = nomesVivos([
      { sql: 'create table public.t (id int primary key, slug text not null unique,\n nome text);' },
      { sql: 'create unique index t_nome_uidx on t (nome); create index t_x_idx on t (id);' },
      { sql: 'drop index if exists public.t_x_idx; alter table t add constraint t_ck check (id > 0);' },
      { sql: 'alter table t rename constraint t_ck to t_ck2;' },
    ])
    expect([...r].sort()).toEqual(['t_ck2', 't_nome_uidx', 't_slug_key'])
  })
  it('drop e create do MESMO nome no mesmo arquivo: vale a ordem do texto (o caso da 0091)', () => {
    const base = { sql: 'create unique index t_nome_uidx on t (nome);' }
    expect(nomesVivos([base, { sql: 'drop index if exists public.t_nome_uidx;\ncreate unique index t_nome_uidx on t (filial, nome);' }]).has('t_nome_uidx')).toBe(true)
    expect(nomesVivos([base, { sql: 'create unique index t_outro_uidx on t (nome);\ndrop index t_nome_uidx;' }]).has('t_nome_uidx')).toBe(false)
  })
})

const GRAFIAS_SQL = Object.entries(MSG_SQL).flatMap(([ramo, grafias]) => grafias.map((g) => [ramo, g, grafias] as const))

describe('MSG_SQL contra o corpo VIVO', () => {
  it.each(Object.entries(MSG_SQL))('o ramo %s tem ao menos uma grafia viva', (ramo, grafias) => {
    expect(grafias.some(grafiaViva), `MSG_SQL.${ramo}: nenhuma grafia no corpo vivo de função nenhuma — tradução morta`).toBe(true)
  })
  it.each(GRAFIAS_SQL)('%s · "%s"', (ramo, grafia, doRamo) => {
    const v = veredicto(grafia, doRamo)
    const motivo =
      v === 'historica'
        ? `MSG_SQL.${ramo}: "${grafia}" só existe num corpo HISTÓRICO — a migration que substituiu a função reescreveu a mensagem, e esta grafia morreu. Apague-a ou troque pela frase nova.`
        : `MSG_SQL.${ramo}: "${grafia}" não está em corpo de função nenhuma e não é a gêmea de acento de uma grafia viva do ramo. Se é frase do Postgres ou do Auth, ela vai em FRASES_DO_MOTOR/FRASES_DO_AUTH.`
    expect(v === 'viva' || v === 'gemea-de-viva', motivo).toBe(true)
  })
})

describe('a forma das listas', () => {
  const todas = [...Object.entries(MSG_SQL), ...Object.entries(FRASES_DO_MOTOR), ...Object.entries(FRASES_DO_AUTH)]
  it.each(todas)('%s: grafias em minúscula, aparadas e sem repetição', (_ramo, grafias) => {
    for (const g of grafias) {
      expect(g, 'grafia vazia').not.toBe('')
      expect(g).toBe(g.trim())
      expect(g).toBe(g.toLowerCase())
    }
    expect(new Set(grafias).size).toBe(grafias.length)
  })
})

describe('CONSTRAINTS_TRADUZIDAS — cada nome existe no esquema vivo', () => {
  it.each(Object.entries(CONSTRAINTS_TRADUZIDAS))('%s', (nome, { tabela }) => {
    expect(NOMES_VIVOS.has(nome), `${nome} não existe no esquema que as migrations produzem hoje`).toBe(true)
    expect(TABELAS_VIVAS.has(tabela), `${nome}: a tabela ${tabela} não existe`).toBe(true)
  })
  it.each(Object.entries(TABELAS_CITADAS_EM_ERRO))('a tabela citada %s (%s) existe viva', (_chave, tabela) => {
    expect(TABELAS_VIVAS.has(tabela)).toBe(true)
  })
})
