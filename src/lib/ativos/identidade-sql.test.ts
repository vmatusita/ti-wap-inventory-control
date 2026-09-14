import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chaveDeIdentidade, chaveDeIdentidadeSemUnidade } from '@/lib/ativos/identidade'

// F57 · Frente E — a trava TS ↔ SQL da identidade do ativo.
//
// `src/lib/ativos/identidade.ts` espelha duas coisas do banco, e as duas são lidas do DISCO aqui
// (nunca uma cópia redigitada): a função `public.chave_identidade_ativo` na migration VIGENTE (a
// de maior número que a define — hoje a `0099`) e os dois índices únicos por filial da `0091`. A
// comparação é por texto normalizado (sem caixa, espaço colapsado): o SQL não é executado — a
// prova de comportamento do lado do banco é `supabase/tests/conflito_filiais.sql`.
//
// Mesmo molde de `colaboradores/chave-sql.test.ts` e `itens/chave-sql.test.ts`: a migration de
// maior número que contém a âncora é a vigente.

const PASTA = join(process.cwd(), 'supabase', 'migrations')

function vigenteCom(ancora: string): { arquivo: string; sql: string } {
  const arquivo = readdirSync(PASTA)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => readFileSync(join(PASTA, f), 'utf8').toLowerCase().includes(ancora))
    .at(-1)
  if (!arquivo) throw new Error(`nenhuma migration contém "${ancora}"`)
  return { arquivo, sql: readFileSync(join(PASTA, arquivo), 'utf8') }
}

const normal = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

describe('chaveDeIdentidadeSemUnidade espelha public.chave_identidade_ativo', () => {
  const ANCORA = 'create or replace function public.chave_identidade_ativo('
  const { arquivo, sql } = vigenteCom(ANCORA)
  const inicio = sql.toLowerCase().indexOf(ANCORA)
  const corpo = normal(sql.slice(inicio, sql.indexOf('$$;', inicio)))

  it(`a definição vigente é a da 0099 (${arquivo})`, () => {
    // Se uma migration nova redefinir a função, este teste aponta o arquivo e força reler a régua.
    expect(arquivo).toBe('0099_chave_identidade_e_guarda_filial.sql')
  })

  it('o ramo COM patrimônio: prefixo de comprimento, `::` e coalesce da tag', () => {
    expect(corpo).toContain(
      normal(
        "when p_patrimonio is not null then length(p_patrimonio)::text || ':' || p_patrimonio || '::' || coalesce(p_service_tag, '')",
      ),
    )
  })

  it('o ramo SEM patrimônio: a tag sozinha, com a sentinela ∅, só se não for vazia', () => {
    expect(corpo).toContain(
      normal("when coalesce(p_service_tag, '') <> '' then '∅::' || p_service_tag"),
    )
    expect(corpo).toContain('else null')
  })

  it.each([
    // [patrimônio, tag, a chave que o SQL da 0099 produz]
    ['WAP0001234', 'ST-01', '10:WAP0001234::ST-01'],
    ['WAP0001234', null, '10:WAP0001234::'],
    ['WAP0001234', '', '10:WAP0001234::'], // coalesce: null e '' são a mesma coisa
    ['', 'ST-01', '0:::ST-01'], // patrimônio vazio NÃO é null no SQL
    [null, 'ST-01', '∅::ST-01'],
    [null, '', null], // sem identidade
    [null, null, null],
    ['A😀', null, '2:A😀::'], // `length` do Postgres conta caractere, não unidade UTF-16
  ] as const)('chave(%j, %j) = %j', (patrimonio, tag, esperada) => {
    expect(chaveDeIdentidadeSemUnidade(patrimonio, tag)).toBe(esperada)
  })

  it('o separador não é ambíguo (o ACHADO 1 da 0099, do lado TypeScript)', () => {
    expect(chaveDeIdentidadeSemUnidade('A::B', null)).not.toBe(chaveDeIdentidadeSemUnidade('A', 'B::'))
    expect(chaveDeIdentidadeSemUnidade('∅', 'X')).not.toBe(chaveDeIdentidadeSemUnidade(null, 'X'))
  })
})

describe('chaveDeIdentidade espelha os índices únicos POR FILIAL da 0091', () => {
  const COM = 'create unique index ativos_patrimonio_service_tag_uidx'
  const SEM = 'create unique index ativos_service_tag_sem_patrimonio_uidx'

  it('nenhuma migration depois da 0091 recria os dois índices', () => {
    expect(vigenteCom(COM).arquivo).toBe('0091_identidade_por_filial.sql')
    expect(vigenteCom(SEM).arquivo).toBe('0091_identidade_por_filial.sql')
  })

  it('os dois índices começam pela filial', () => {
    const sql = normal(vigenteCom(COM).sql)
    expect(sql).toContain(
      normal("create unique index ativos_patrimonio_service_tag_uidx on public.ativos (filial_id, patrimonio, (coalesce(service_tag, '')))"),
    )
    expect(sql).toContain(
      normal("create unique index ativos_service_tag_sem_patrimonio_uidx on public.ativos (filial_id, (coalesce(service_tag, '')))"),
    )
    expect(sql).toContain(normal("where patrimonio is null and coalesce(service_tag, '') <> ''"))
  })

  it('a unidade entra na chave, à esquerda — o mesmo par em duas filiais são DUAS identidades', () => {
    const naBravo = chaveDeIdentidade(2, 'WAP0001234', 'ST-01')
    const naCharlie = chaveDeIdentidade(3, 'WAP0001234', 'ST-01')
    expect(naBravo).not.toBe(naCharlie)
    expect(naBravo).toBe(`2|${chaveDeIdentidadeSemUnidade('WAP0001234', 'ST-01')}`)
    expect(chaveDeIdentidade(2, null, null)).toBeNull()
  })
})
