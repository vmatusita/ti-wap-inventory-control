import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// PARIDADE: os 7 prefixos do seed da migration 0139 (o banco) × PREFIXOS_CONHECIDOS
// de scripts/import/normalizar.ts (a ferramenta do go-live F4, que a ficha manda NÃO
// generalizar — mas cuja cópia independente do vocabulário não pode DIVERGIR do banco
// sem ninguém notar).
//
// Lê o TEXTO do script, não importa o módulo: `scripts/import/normalizar.ts` é uma
// ferramenta de linha de comando (F4), fora do grafo de import da aplicação — puxá-lo
// para dentro de `src/` só para ler uma constante acoplaria o app à ferramenta
// histórica, o oposto do que a fase pede ("os scripts da F4 permanecem intocados").

const RAIZ = process.cwd()

function textoDoScript(): string {
  return readFileSync(
    join(RAIZ, 'scripts', 'import', 'normalizar.ts'),
    'utf8',
  )
}

/** `PREFIXOS_CONHECIDOS = new Set([...])` — os literais entre colchetes. */
function prefixosConhecidosDoScript(): string[] {
  const texto = textoDoScript()
  const m = texto.match(/PREFIXOS_CONHECIDOS\s*=\s*new Set\(\[([^\]]*)\]\)/)
  if (!m) throw new Error('não achei PREFIXOS_CONHECIDOS em scripts/import/normalizar.ts')
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!)
}

const DIR_MIGRACOES = join(RAIZ, 'supabase', 'migrations')

function migracaoDoSeed(): { arquivo: string; sql: string } {
  const ancora = 'insert into public.import_prefixos_patrimonio (prefixo) values'
  const arquivos = readdirSync(DIR_MIGRACOES)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => readFileSync(join(DIR_MIGRACOES, f), 'utf8').includes(ancora))
    .sort()
  const arquivo = arquivos.at(-1)
  if (!arquivo) {
    throw new Error(
      'nenhuma migration semeia import_prefixos_patrimonio — a 0139 (vocabulário do import) ainda não existe',
    )
  }
  return { arquivo, sql: readFileSync(join(DIR_MIGRACOES, arquivo), 'utf8') }
}

function prefixosDoSeed(sql: string): string[] {
  const ancora = 'insert into public.import_prefixos_patrimonio (prefixo) values'
  const inicio = sql.indexOf(ancora)
  const corpo = sql.slice(inicio + ancora.length, sql.indexOf(';', inicio))
  return [...corpo.matchAll(/\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]!)
}

describe('prefixos de patrimônio: seed da 0139 × PREFIXOS_CONHECIDOS do script da F4', () => {
  it('scripts/import/normalizar.ts tem PREFIXOS_CONHECIDOS não vazio (guarda do próprio teste)', () => {
    expect(prefixosConhecidosDoScript().length).toBeGreaterThan(0)
  })

  it('o seed da 0139 tem 7 prefixos (guarda do próprio teste)', () => {
    const { sql } = migracaoDoSeed()
    expect(prefixosDoSeed(sql)).toHaveLength(7)
  })

  it('o seed (banco) e PREFIXOS_CONHECIDOS (script F4) são o MESMO conjunto de 7', () => {
    const { sql } = migracaoDoSeed()
    const doSeed = prefixosDoSeed(sql)
    const doScript = prefixosConhecidosDoScript()
    expect(new Set(doSeed)).toEqual(new Set(doScript))
    expect(doSeed).toHaveLength(7)
    expect(doScript).toHaveLength(7)
  })

  it('nenhum prefixo do script está fora do formato de duas a quatro letras maiúsculas', () => {
    for (const p of prefixosConhecidosDoScript()) expect(p).toMatch(/^[A-Z]{2,4}$/)
  })
})
