import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { traduzErroBanco } from '@/lib/actions/erros'

// F67C (16/11/2026) — A FRASE DO 23502 EM `empresa_id` (PLAN-F67C, decisão 18).
//
// Sem o default, um escritor que esqueça a empresa leva 23502 ("null value in column "empresa_id" …"). A tela diz o que
// aconteceu em vez do genérico, SEM o `details` do Postgres (que traz os valores da linha). A frase só sai para o erro
// do MOTOR na coluna `empresa_id` — o 23502 de outra coluna segue o caminho de antes. E a conferência CONTRA O ESQUEMA:
// as 20 tabelas de `k_negocio` têm `empresa_id` `string` (not null) no `Row` do `database.ts`.

const FRASE =
  'Não foi possível gravar: o registro ficou sem a empresa. Recarregue a página e tente de novo; se continuar, avise o administrador.'

describe('traduzErroBanco — 23502 em empresa_id', () => {
  it('a frase sai para o erro do motor na coluna empresa_id', () => {
    expect(
      traduzErroBanco('null value in column "empresa_id" of relation "ativos" violates not-null constraint', '23502'),
    ).toBe(FRASE)
  })
  it('não vaza o details e não sai para o 23502 de OUTRA coluna', () => {
    expect(
      traduzErroBanco('null value in column "nome" of relation "ativos" violates not-null constraint', '23502'),
    ).not.toBe(FRASE)
    // a frase é fixa: nenhum trecho da mensagem do motor (nem o `details`, que nunca chega aqui) entra nela
    expect(traduzErroBanco(`null value in column "empresa_id" Failing row contains (segredo)`, "23502")).not.toContain("segredo")
  })
  it('um 23503 que cita empresa_id não é a frase (só o 23502)', () => {
    expect(traduzErroBanco('violates foreign key constraint "x" empresa_id', '23503')).not.toBe(FRASE)
  })
})

// o mesmo leitor de AST de empresa-obrigatoria-no-insert.test.ts (importá-lo reexecutaria os describes dele)
function formaDoRow(texto: string, tabela: string): { existe: boolean; opcional: boolean; tipo: string } | null {
  const arquivo = ts.createSourceFile('database.ts', texto, ts.ScriptTarget.Latest, true)
  let achada: { existe: boolean; opcional: boolean; tipo: string } | null = null
  const props = (t: ts.TypeNode | undefined) => (t && ts.isTypeLiteralNode(t) ? t.members.filter(ts.isPropertySignature) : [])
  const nome = (m: ts.PropertySignature) => (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name) ? m.name.text : m.name.getText())
  const visitar = (no: ts.Node) => {
    if (ts.isTypeAliasDeclaration(no) && no.name.text === 'Database') {
      const pub = props(no.type).find((e) => nome(e) === 'public')
      const tabelas = props(pub?.type).find((e) => nome(e) === 'Tables')
      const rel = props(tabelas?.type).find((e) => nome(e) === tabela)
      const row = props(rel?.type).find((e) => nome(e) === 'Row')
      const col = props(row?.type).find((e) => nome(e) === 'empresa_id')
      achada = { existe: !!col, opcional: !!col?.questionToken, tipo: col?.type ? col.type.getText(arquivo).replace(/\s+/g, ' ') : '' }
    }
    ts.forEachChild(no, visitar)
  }
  visitar(arquivo)
  return achada
}

describe('contra o esquema: as 20 de k_negocio têm empresa_id string (not null) no Row', () => {
  const catalogo = readFileSync(join(process.cwd(), 'supabase', 'tests', 'catalogo_policies.sql'), 'utf8')
  const tipos = readFileSync(join(process.cwd(), 'src', 'lib', 'types', 'database.ts'), 'utf8')
  const m = /k_negocio text\[\] := array\[([\s\S]*?)\];/.exec(catalogo)
  const tabelas = m ? [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]) : []

  it('universo: 20 tabelas', () => {
    expect(tabelas).toHaveLength(20)
  })
  it.each(tabelas)('%s.Row.empresa_id é string, sem null e sem ?', (t) => {
    const forma = formaDoRow(tipos, t)
    expect(forma, t).toBeDefined()
    expect(forma).toMatchObject({ existe: true, opcional: false, tipo: 'string' })
  })
})
