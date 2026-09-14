import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chaveVersao, ehViolacaoDeVersao } from '@/lib/relatorios/versao-snapshot'

// F57 · Frente G — a trava TS ↔ SQL da `chaveVersao`.
//
// `chaveVersao` é um espelho, em TypeScript, da chave única do snapshot. Até a F57 não havia trava
// nenhuma — a mesma classe de `colaborador_chave` e `item_chave`, que esta casa já travou. Aqui o
// SQL é LIDO DO DISCO (nunca uma cópia redigitada): a `unique` da tabela na `0010` e o índice que
// cobre o consolidado na `0013`. Comparação por texto normalizado — sem caixa, espaço colapsado —,
// porque o SQL da casa não escreve sempre em minúscula.
//
// ⚠ O LAÇO QUE A F65 HERDA (não consertado aqui, só registrado): quando a unique ganhar `empresa_id`
// e o índice for recriado, este teste reprova — de propósito — em DOIS pontos ao mesmo tempo: a
// chave (que tem de ganhar a empresa) e o nome do índice que `ehViolacaoDeVersao` casa (que muda
// com a recriação).

const PASTA = join(process.cwd(), 'supabase', 'migrations')
const normal = (s: string) => s.toLowerCase().replace(/\s+/g, ' ')

function vigenteCom(ancora: string): { arquivo: string; sql: string } {
  const arquivo = readdirSync(PASTA)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => normal(readFileSync(join(PASTA, f), 'utf8')).includes(ancora))
    .at(-1)
  if (!arquivo) throw new Error(`nenhuma migration contém "${ancora}"`)
  return { arquivo, sql: normal(readFileSync(join(PASTA, arquivo), 'utf8')) }
}

/** Os itens de primeiro nível entre o `(` que segue `depoisDe` e o `)` que o fecha. */
function itensEntreParenteses(sql: string, depoisDe: string): string[] {
  const inicio = sql.indexOf(depoisDe)
  if (inicio < 0) throw new Error(`"${depoisDe}" não encontrado`)
  let i = sql.indexOf('(', inicio + depoisDe.length)
  const itens: string[] = []
  let atual = ''
  let profundidade = 0
  for (; i < sql.length; i++) {
    const c = sql[i]
    if (c === '(') {
      profundidade++
      if (profundidade === 1) continue
    } else if (c === ')') {
      profundidade--
      if (profundidade === 0) break
    } else if (c === ',' && profundidade === 1) {
      itens.push(atual.trim())
      atual = ''
      continue
    }
    atual += c
  }
  itens.push(atual.trim())
  return itens
}

const semCoalesce = (coluna: string) => coluna.replace(/^coalesce\(\s*([a-z_]+)\s*,.*\)$/, '$1')
const camelParaSnake = (nome: string) => nome.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`)

describe('a chave única do snapshot, no banco (lida do disco)', () => {
  const tabela = vigenteCom('create table public.relatorios_gerados')
  const indice = vigenteCom('create unique index if not exists relatorios_gerados_periodo_filial_versao_uidx')

  it('as definições vigentes são a 0010 (unique da tabela) e a 0013 (índice do consolidado)', () => {
    expect(tabela.arquivo).toBe('0010_relatorios_gerados.sql')
    expect(indice.arquivo).toBe('0013_relatorios_gerados_unique_geral.sql')
  })

  it('a unique da tabela e o índice têm as MESMAS quatro colunas, na mesma ordem, com a versão por último', () => {
    const daTabela = itensEntreParenteses(tabela.sql, 'unique')
    const doIndice = itensEntreParenteses(indice.sql, 'on public.relatorios_gerados')
    expect(daTabela).toEqual(['periodo_de', 'periodo_ate', 'filial_id', 'versao'])
    expect(doIndice.map(semCoalesce)).toEqual(daTabela)
    // E o índice é o que dá ao consolidado (NULL) uma chave concreta.
    expect(doIndice[2]).toBe('coalesce(filial_id, -1)')
  })
})

describe('chaveVersao espelha a chave única, MENOS a versão', () => {
  const colunas = itensEntreParenteses(
    vigenteCom('create table public.relatorios_gerados').sql,
    'unique',
  )
  const semVersao = colunas.filter((c) => c !== 'versao')

  it('os parâmetros são as colunas da chave, na ordem da unique', () => {
    const fonte = readFileSync(
      join(process.cwd(), 'src', 'lib', 'relatorios', 'versao-snapshot.ts'),
      'utf8',
    )
    const assinatura = fonte.match(/export function chaveVersao\(([^)]*)\)/)
    expect(assinatura, 'chaveVersao exportada de versao-snapshot.ts').not.toBeNull()
    const nomes = (assinatura?.[1] ?? '')
      .split(',')
      .map((p) => p.split(':')[0].trim())
      .filter(Boolean)
    expect(nomes.map(camelParaSnake)).toEqual(semVersao)
  })

  it('a chave tem uma parte por coluna, na mesma ordem', () => {
    expect(chaveVersao('2026-09-06', '2026-09-12', 2).split('|')).toEqual([
      '2026-09-06',
      '2026-09-12',
      '2',
    ])
  })

  it('mudar QUALQUER coluna da chave muda a chave (nenhuma é ignorada)', () => {
    const base = chaveVersao('2026-09-06', '2026-09-12', 2)
    expect(chaveVersao('2026-09-07', '2026-09-12', 2)).not.toBe(base)
    // o caso que uma chave `periodo|filial` erraria: mesmo começo, fim diferente
    expect(chaveVersao('2026-09-06', '2026-09-13', 2)).not.toBe(base)
    expect(chaveVersao('2026-09-06', '2026-09-12', 3)).not.toBe(base)
  })

  it('o consolidado (filial null) tem chave própria, que não colide com filial nenhuma', () => {
    const consolidado = chaveVersao('2026-09-06', '2026-09-12', null)
    for (const id of [1, 2, 3, 32767]) {
      expect(chaveVersao('2026-09-06', '2026-09-12', id)).not.toBe(consolidado)
    }
  })
})

describe('a segunda pista da renumeração casa pelo NOME do índice (o laço da F65)', () => {
  it('ehViolacaoDeVersao reconhece a violação pelo nome do índice LIDO DO SQL', () => {
    const indice = vigenteCom('create unique index if not exists relatorios_gerados_periodo_filial_versao_uidx')
    const nome = indice.sql.match(/create unique index if not exists ([a-z_]+)/)?.[1] ?? ''
    expect(nome).toBe('relatorios_gerados_periodo_filial_versao_uidx')
    // Sem "duplicate key" e sem o código 23505: só o NOME pode fazer isto dar true. Quando a F65
    // recriar o índice com outro nome, esta linha reprova junto com a chave — que é o aviso.
    expect(ehViolacaoDeVersao(null, `violates unique constraint "${nome}"`)).toBe(true)
  })
})
