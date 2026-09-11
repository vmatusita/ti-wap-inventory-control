// Leitor de TEXTO do seed do vocabulário do import (migration 0139) — usado SÓ
// por testes (F56 · Frente D). Não é ele próprio um teste: fica fora de
// `*.test.ts` de propósito, para `vocabulario-sql.test.ts` (a guarda contra o
// seed) e `vocabulario.test.ts` (a regressão dos 18 termos históricos, com a
// fixture CONSTRUÍDA a partir deste mesmo SQL) reusarem o MESMO parser, em vez
// de reimplementá-lo cada um o seu.
//
// Puro: só leitura de arquivo + regex de texto, sem SQL parser. Nenhum literal
// de filial/WAP mora aqui — só nomes de TABELA/COLUNA do vocabulário (genéricos,
// iguais em qualquer instalação do sistema) —, por isso este arquivo não entra
// na allowlist do `sem-wapismo.test.ts`: ele não tem o que a trava proíbe.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR_MIGRACOES = join(process.cwd(), 'supabase', 'migrations')

function lerMigracoes(): { arquivo: string; sql: string }[] {
  return readdirSync(DIR_MIGRACOES)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((arquivo) => ({ arquivo, sql: readFileSync(join(DIR_MIGRACOES, arquivo), 'utf8') }))
}

/** A migration VIGENTE que contém a âncora — a de MAIOR número (não deveria haver
 *  duas: migration aplicada nunca se edita; a busca por âncora, e não por número
 *  fixo, é só para a mensagem de erro apontar o arquivo certo). */
export function migracaoComAncora(ancora: string): { arquivo: string; sql: string } {
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
export function corpoDoComando(sql: string, ancora: string): string {
  const inicio = sql.indexOf(ancora)
  if (inicio === -1) throw new Error(`âncora não encontrada: "${ancora}"`)
  const aposAncora = inicio + ancora.length
  const fimRel = sql.slice(aposAncora).indexOf(';')
  if (fimRel === -1) throw new Error(`comando sem ';' de fechamento após "${ancora}"`)
  return sql.slice(aposAncora, aposAncora + fimRel)
}

export type LinhaApelido = { slug: string; apelido: string }

export function apelidosNoSql(sql: string): LinhaApelido[] {
  const corpo = corpoDoComando(sql, 'insert into public.unidades_apelidos (filial_id, apelido)')
  return [...corpo.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)].map((m) => ({
    slug: m[1]!,
    apelido: m[2]!,
  }))
}

export type LinhaCategoria = { termo: string; categoria: string; rotulo: string | null }

export function categoriasNoSql(sql: string): LinhaCategoria[] {
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

export type LinhaEstado = { termo: string; estado: string; rotulo: string | null }

export function estadosNoSql(sql: string): LinhaEstado[] {
  const corpo = corpoDoComando(sql, 'insert into public.import_termos_estado (termo, estado, rotulo) values')
  return [...corpo.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(null|'[^']*')\s*\)/g)].map((m) => ({
    termo: m[1]!,
    estado: m[2]!,
    rotulo: m[3] === 'null' ? null : m[3]!.slice(1, -1),
  }))
}

export function prefixosNoSql(sql: string): string[] {
  const corpo = corpoDoComando(sql, 'insert into public.import_prefixos_patrimonio (prefixo) values')
  return [...corpo.matchAll(/\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]!)
}

export function checkPrefixoFormato(sql: string): string {
  const m = sql.match(/import_prefixos_patrimonio_formato check \(prefixo ~ '([^']+)'\)/)
  if (!m) throw new Error('não achei o check import_prefixos_patrimonio_formato')
  return m[1]!
}

/** As tuplas `(slug, nome)` do seed fixo de filiais (0007) — só as CINCO originais.
 *  `filialteste` não entra: não tem migration própria (nasceu direto em produção)
 *  e o nome próprio dela não é histórico (não tinha apelido nenhum). */
export function filiaisNoSeedFixo(): { slug: string; nome: string }[] {
  const { sql } = migracaoComAncora('insert into public.filiais (slug, nome) values')
  const corpo = corpoDoComando(sql, 'insert into public.filiais (slug, nome) values')
  return [...corpo.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)].map((m) => ({
    slug: m[1]!,
    nome: m[2]!,
  }))
}

/** O rename idempotente da 0026: `serra-park` → slug `serra`, nome `Serra`. */
export function nomesDasFiliaisHoje(): Map<string, string> {
  const mapa = new Map(filiaisNoSeedFixo().map((f) => [f.slug, f.nome]))
  if (mapa.has('serra-park')) {
    mapa.delete('serra-park')
    mapa.set('serra', 'Serra')
  }
  return mapa
}

/** slug → id, pela ORDEM de inserção do seed fixo (0007) — espelha a coluna
 *  identity do banco: a 0026 faz UPDATE (não delete+insert), então o id de
 *  "Serra" é o mesmo que "Serra Park" já tinha. Só para FIXTURE de teste — os
 *  ids reais são atribuídos pelo Postgres; nenhum código de produção depende
 *  desta função. */
export function idsPorSlugDoSeedFixo(): Map<string, number> {
  const mapa = new Map<string, number>()
  filiaisNoSeedFixo().forEach(({ slug }, i) => {
    mapa.set(slug === 'serra-park' ? 'serra' : slug, i + 1)
  })
  return mapa
}
