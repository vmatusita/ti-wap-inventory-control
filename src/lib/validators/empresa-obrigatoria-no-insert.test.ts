import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// =============================================================================
// O TIPO COMO TRAVA — `empresa_id` OBRIGATÓRIO no `Insert` das 20 (F67C, 16/11/2026 — decisão 4 do PLAN-F67C)
// =============================================================================
// Até a F67C as 20 tabelas de negócio tinham `empresa_id … not null default public.empresa_legada()`, e o gerador de
// tipos lê "not null COM default" como OPCIONAL no `Insert` (`empresa_id?: string`): o compilador deixava qualquer
// escritor omitir a empresa, e a linha nascia da WAP por omissão. A F67C tira o default (a contração) e faz TODA escrita
// dizer a empresa (a expansão). Com o `Insert` exigindo a coluna, um `.insert(...)` sem empresa deixa de COMPILAR — o
// `npm run typecheck` vira a trava do app.
//
// O gate de deriva (`db:types:diff`) não vê isto: ele compara CONJUNTOS (relação, coluna, função), não opcionalidade
// (`scripts/db/tipos-conjuntos.mjs`). Uma regeneração do `database.ts` a partir de um banco que ainda tivesse o default
// (o ensaio antes da contração, um banco local velho) traria o `?` de volta sem ninguém perceber — é a regressão que
// esta trava reprova.
//
// A LISTA DAS 20 sai de `k_negocio` em `supabase/tests/catalogo_policies.sql` — a fonte única; aqui ela só é lida.
// O `database.ts` é lido pelo COMPILADOR (o mesmo motivo de `tipos-conjuntos.mjs`: o gerador emite blocos em uma linha
// só, e regex de linha perde entradas).
// =============================================================================

const RAIZ = process.cwd()
const CATALOGO = readFileSync(join(RAIZ, 'supabase', 'tests', 'catalogo_policies.sql'), 'utf8')
const TIPOS = readFileSync(join(RAIZ, 'src', 'lib', 'types', 'database.ts'), 'utf8')

function kNegocio(): string[] {
  const m = /k_negocio text\[\] := array\[([\s\S]*?)\];/.exec(CATALOGO)
  if (!m) throw new Error('catalogo_policies.sql: não achei k_negocio — a fonte única das tabelas de negócio')
  return [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1])
}

type Forma = { existe: boolean; opcional: boolean; tipo: string }

function membros(tipo: ts.TypeNode | undefined): ts.PropertySignature[] {
  return tipo && ts.isTypeLiteralNode(tipo) ? tipo.members.filter(ts.isPropertySignature) : []
}
function nome(m: ts.PropertySignature): string {
  return ts.isIdentifier(m.name) || ts.isStringLiteral(m.name) ? m.name.text : m.name.getText()
}

/**
 * A forma de `empresa_id` em cada bloco (`Row`, `Insert`, `Update`) de cada tabela de `public` — lida do AST.
 * Mapa `tabela.bloco` → forma. Lança se o arquivo não tiver `Database.public.Tables` (formato do gerador mudou).
 */
export function formasDeEmpresaId(texto: string): Map<string, Forma> {
  const arquivo = ts.createSourceFile('database.ts', texto, ts.ScriptTarget.Latest, true)
  const saida = new Map<string, Forma>()
  let achou = false
  const visitar = (no: ts.Node) => {
    if (ts.isTypeAliasDeclaration(no) && no.name.text === 'Database') {
      for (const esquema of membros(no.type)) {
        if (nome(esquema) !== 'public') continue
        for (const secao of membros(esquema.type)) {
          if (nome(secao) !== 'Tables') continue
          achou = true
          for (const rel of membros(secao.type)) {
            for (const bloco of membros(rel.type)) {
              const b = nome(bloco)
              if (b !== 'Row' && b !== 'Insert' && b !== 'Update') continue
              const col = membros(bloco.type).find((c) => nome(c) === 'empresa_id')
              saida.set(`${nome(rel)}.${b}`, {
                existe: !!col,
                opcional: !!col?.questionToken,
                tipo: col?.type ? col.type.getText(arquivo).replace(/\s+/g, ' ') : '',
              })
            }
          }
        }
      }
    }
    ts.forEachChild(no, visitar)
  }
  visitar(arquivo)
  if (!achou) throw new Error('database.ts: não achei Database.public.Tables — o formato do gerador mudou')
  return saida
}

/** Os defeitos do `Insert` das tabelas pedidas: ausente, opcional (`?`) ou de tipo que não é `string`. */
export function insertsSemEmpresaObrigatoria(texto: string, tabelas: readonly string[]): string[] {
  const formas = formasDeEmpresaId(texto)
  const defeitos: string[] = []
  for (const t of tabelas) {
    const f = formas.get(`${t}.Insert`)
    if (!f) defeitos.push(`${t} (sem bloco Insert no database.ts)`)
    else if (!f.existe) defeitos.push(`${t} (Insert sem empresa_id)`)
    else if (f.opcional) defeitos.push(`${t} (Insert com empresa_id?: opcional)`)
    else if (f.tipo !== 'string') defeitos.push(`${t} (Insert com empresa_id: ${f.tipo}, não string)`)
  }
  return defeitos
}

describe('o tipo como trava: empresa_id OBRIGATÓRIO no Insert das 20 (F67C, decisão 4)', () => {
  const vinte = kNegocio()

  it('a lista vem de k_negocio (catalogo_policies.sql) e tem as 20', () => {
    expect(vinte).toHaveLength(20)
    expect(new Set(vinte).size).toBe(20)
  })

  it('o universo não é vazio: cada uma das 20 tem Row, Insert e Update no database.ts', () => {
    const formas = formasDeEmpresaId(TIPOS)
    const faltam = vinte.flatMap((t) => ['Row', 'Insert', 'Update'].filter((b) => !formas.has(`${t}.${b}`)).map((b) => `${t}.${b}`))
    expect(faltam).toEqual([])
  })

  it('nenhuma das 20 aceita Insert sem empresa_id: a coluna é string e obrigatória (sem `?`)', () => {
    expect(insertsSemEmpresaObrigatoria(TIPOS, vinte)).toEqual([])
  })

  it('o Row das 20 tem empresa_id: string (a coluna é not null)', () => {
    const formas = formasDeEmpresaId(TIPOS)
    expect(vinte.filter((t) => { const f = formas.get(`${t}.Row`); return !f?.existe || f.opcional || f.tipo !== 'string' })).toEqual([])
  })

  it('o Update continua OPCIONAL (ninguém troca a empresa de um registro — guarda_empresa recusa no banco)', () => {
    const formas = formasDeEmpresaId(TIPOS)
    expect(vinte.filter((t) => { const f = formas.get(`${t}.Update`); return !f?.existe || !f.opcional })).toEqual([])
  })

  // A SABOTAGEM C (a parte do tipo): o `?` de volta numa tabela — como faria uma regeneração a partir de um banco que
  // ainda tivesse o default — tem de ser acusado pelo nome.
  it('sabotagem C — o `?` de volta no Insert (ou a coluna fora, ou de outro tipo) é acusado pelo nome', () => {
    const sintetico = (insert: string) => `export type Database = { public: { Tables: {
      motivos: { Row: { codigo: string; empresa_id: string }; Insert: { codigo: string; ${insert} }; Update: { empresa_id?: string } }
    } } }`
    expect(insertsSemEmpresaObrigatoria(sintetico('empresa_id?: string'), ['motivos'])).toEqual(['motivos (Insert com empresa_id?: opcional)'])
    expect(insertsSemEmpresaObrigatoria(sintetico(''), ['motivos'])).toEqual(['motivos (Insert sem empresa_id)'])
    expect(insertsSemEmpresaObrigatoria(sintetico('empresa_id: string | null'), ['motivos'])).toEqual(['motivos (Insert com empresa_id: string | null, não string)'])
    expect(insertsSemEmpresaObrigatoria(sintetico('empresa_id: string'), ['motivos'])).toEqual([])
    expect(insertsSemEmpresaObrigatoria(sintetico('empresa_id: string'), ['tabela_que_nao_existe'])).toEqual(['tabela_que_nao_existe (sem bloco Insert no database.ts)'])
  })

  it('o leitor falha alto se o formato do gerador mudar (conjunto vazio não passa por verde)', () => {
    expect(() => formasDeEmpresaId('export type Outro = {}')).toThrow(/Database.public.Tables/)
  })
})
