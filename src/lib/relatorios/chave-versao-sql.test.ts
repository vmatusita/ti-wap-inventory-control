import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chaveVersao, ehViolacaoDeVersao } from '@/lib/relatorios/versao-snapshot'

// F57 · Frente G — a trava TS ↔ SQL da `chaveVersao`.
//
// `chaveVersao` é um espelho, em TypeScript, da chave única do snapshot. Até a F57 não havia trava
// nenhuma — a mesma classe de `colaborador_chave` e `item_chave`, que esta casa já travou. Aqui o
// SQL é LIDO DO DISCO (nunca uma cópia redigitada): a `unique` da tabela na `0010` e o índice que
// cobre o consolidado — nascido na `0013`, recriado por empresa na `0171`. Comparação por texto normalizado — sem caixa, espaço colapsado —,
// porque o SQL da casa não escreve sempre em minúscula.
//
// O LAÇO DA F57, FECHADO NA F65 (0171): o índice do snapshot ganhou `empresa_id` (recriado com o MESMO
// nome, pelo provisório `…_f65` → drop → rename), e a chave ganhou a empresa no mesmo commit. A FONTE do
// índice passa a ser a migration que o recriou (a 0171); a `unique` da tabela (0010) fica — é por tenant
// de forma implícita (`filial_id` determina a empresa; o nulo do Consolidado não colide) e está na lista
// nominal de supabase/tests/unicidade_por_empresa.sql.

const PASTA = join(process.cwd(), 'supabase', 'migrations')
const normal = (s: string) => s.toLowerCase().replace(/\s+/g, ' ')

// Cada migration é lida e normalizada UMA vez, na coleta. Até o fechamento da F57, `vigenteCom`
// relia a pasta inteira a cada chamada — três vezes por arquivo, uma delas DENTRO do corpo de um
// `it`: sozinho custava ~150 ms, e sob a carga da suíte inteira passou dos 5 s de tempo-limite
// (`docs/f57-evidencias/fechamento-verificacao.txt`). A leitura é a mesma; só não se repete.
const MIGRATIONS: readonly { arquivo: string; sql: string }[] = readdirSync(PASTA)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((arquivo) => ({ arquivo, sql: normal(readFileSync(join(PASTA, arquivo), 'utf8')) }))

function vigenteCom(ancora: string): { arquivo: string; sql: string } {
  const vigente = MIGRATIONS.filter((m) => m.sql.includes(ancora)).at(-1)
  if (!vigente) throw new Error(`nenhuma migration contém "${ancora}"`)
  return vigente
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

// A migration VIGENTE do índice: a última que o recria com o nome contratual (o rename do provisório). Lida DENTRO
// de cada caso (e não na coleta): sem a 0171, cada caso cai com o próprio nome em vez de o arquivo inteiro abortar.
const RENAME = 'alter index public.relatorios_gerados_periodo_filial_versao_uidx_f65 rename to relatorios_gerados_periodo_filial_versao_uidx'
const CRIA = 'create unique index relatorios_gerados_periodo_filial_versao_uidx_f65 on public.relatorios_gerados'
const indiceVigente = () => vigenteCom(RENAME)
const colunasDoIndice = () => itensEntreParenteses(indiceVigente().sql, CRIA)

describe('a chave única do snapshot, no banco (lida do disco)', () => {
  const tabela = vigenteCom('create table public.relatorios_gerados')

  it('as definições vigentes são a 0010 (unique da tabela) e a 0171 (o índice por empresa, com o nome contratual)', () => {
    const indice = indiceVigente()
    expect(tabela.arquivo).toBe('0010_relatorios_gerados.sql')
    expect(indice.arquivo).toBe('0171_snapshot_por_empresa.sql')
    // nenhuma migration DEPOIS da 0171 mexe no índice (o provisório → drop → rename é o último evento)
    const depois = MIGRATIONS.filter((m) => m.arquivo > indice.arquivo && m.sql.includes('relatorios_gerados_periodo_filial_versao_uidx'))
    expect(depois.map((m) => m.arquivo)).toEqual([])
  })

  it('o índice é a unique da tabela COM a empresa na frente, e dá ao Consolidado (NULL) uma chave concreta', () => {
    const daTabela = itensEntreParenteses(tabela.sql, 'unique')
    expect(daTabela).toEqual(['periodo_de', 'periodo_ate', 'filial_id', 'versao'])
    const colunas = colunasDoIndice()
    expect(colunas[0]).toBe('empresa_id')
    expect(colunas.slice(1).map(semCoalesce)).toEqual(daTabela)
    expect(colunas[3]).toBe('coalesce(filial_id, -1)')
  })
})

describe('chaveVersao espelha o índice por empresa, MENOS a versão', () => {
  it('os parâmetros são as colunas da chave, na ordem do índice (a empresa primeiro)', () => {
    const semVersao = colunasDoIndice().map(semCoalesce).filter((c) => c !== 'versao')
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
    expect(semVersao).toEqual(['empresa_id', 'periodo_de', 'periodo_ate', 'filial_id'])
  })

  const A = '00000000-0000-4000-8000-00000000000a'
  const B = '00000000-0000-4000-8000-00000000000b'

  it('a chave tem uma parte por coluna, na mesma ordem', () => {
    expect(chaveVersao(A, '2026-09-06', '2026-09-12', 2).split('|')).toEqual([A, '2026-09-06', '2026-09-12', '2'])
  })

  it('mudar QUALQUER coluna da chave muda a chave (nenhuma é ignorada)', () => {
    const base = chaveVersao(A, '2026-09-06', '2026-09-12', 2)
    expect(chaveVersao(B, '2026-09-06', '2026-09-12', 2)).not.toBe(base)
    expect(chaveVersao(A, '2026-09-07', '2026-09-12', 2)).not.toBe(base)
    // o caso que uma chave `periodo|filial` erraria: mesmo começo, fim diferente
    expect(chaveVersao(A, '2026-09-06', '2026-09-13', 2)).not.toBe(base)
    expect(chaveVersao(A, '2026-09-06', '2026-09-12', 3)).not.toBe(base)
  })

  it('o CONSOLIDADO da empresa A e o da B no mesmo período dão chaves DIFERENTES (a sabotagem G, na mesa)', () => {
    expect(chaveVersao(A, '2026-09-06', '2026-09-12', null)).not.toBe(chaveVersao(B, '2026-09-06', '2026-09-12', null))
  })

  it('o consolidado (filial null) tem chave própria, que não colide com filial nenhuma', () => {
    const consolidado = chaveVersao(A, '2026-09-06', '2026-09-12', null)
    for (const id of [1, 2, 3, 32767]) {
      expect(chaveVersao(A, '2026-09-06', '2026-09-12', id)).not.toBe(consolidado)
    }
  })
})

describe('a segunda pista da renumeração casa pelo NOME do índice (o laço da F57, fechado na F65)', () => {
  it('ehViolacaoDeVersao reconhece a violação pelo nome do índice LIDO DO SQL', () => {
    const nome = indiceVigente().sql.match(/rename to ([a-z_]+)/)?.[1] ?? ''
    expect(nome).toBe('relatorios_gerados_periodo_filial_versao_uidx')
    // Sem "duplicate key" e sem o código 23505: só o NOME pode fazer isto dar true.
    expect(ehViolacaoDeVersao(null, `violates unique constraint "${nome}"`)).toBe(true)
    // e o provisório, se um dia uma mensagem o citasse, contém o nome contratual
    expect(ehViolacaoDeVersao(null, `violates unique constraint "${nome}_f65"`)).toBe(true)
  })
})
