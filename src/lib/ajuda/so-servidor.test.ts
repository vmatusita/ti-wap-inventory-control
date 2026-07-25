import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, it, expect } from 'vitest'

// O TRAP do só-servidor era só um COMENTÁRIO no topo de `registry.ts` — e um
// comentário não impede ninguém. Basta um `import { PAGINAS } from '@/lib/ajuda/registry'`
// num Client Component para o bundle de TODA tela do app carregar as 33 páginas
// de documentação e o PapaParse que `CAP_EXPORT` arrasta. Compila, passa no
// lint, passa nos testes, e ninguém percebe até alguém medir o bundle.
//
// Achado da re-revisão adversarial da F20: "o invariante em nome do qual a
// emenda migrou o mapa de âncoras não tem nenhuma guarda automatizada".
// Este teste é a guarda. Mesmo espírito de `src/lib/use-server-exports.test.ts`.
const RAIZ = process.cwd()

// Módulos de `lib/ajuda` que arrastam servidor. Os PUROS ficam de fora de
// propósito: `busca.ts`, `ancora.ts` e `tipos.ts` são feitos para o cliente.
const SO_SERVIDOR = [
  'registry',
  'conteudo',
  'derivacao',
  'legado',
  'indice',
  'conteudo/', // qualquer página
]

function arquivosTsx(dir: string): string[] {
  const achados: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) achados.push(...arquivosTsx(caminho))
    else if (nome.endsWith('.tsx') || nome.endsWith('.ts')) achados.push(caminho)
  }
  return achados
}

function ehClientComponent(fonte: string): boolean {
  // A diretiva só vale nas primeiras linhas do arquivo, antes de qualquer import.
  return /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(fonte)
}

// O `import` começa na coluna 0 e a cláusula NÃO pode atravessar um `from`:
// sem essa trava, um import multilinha de React engolia as linhas seguintes e
// atribuía a diretiva errada ao módulo errado (o primeiro rascunho deste teste
// acusou a paleta por um `import type` que ele mesmo leu torto).
const IMPORT_DE_AJUDA = /^import\s+(type\s+)?((?:(?!\bfrom\b)[\s\S])*?)from\s*['"]@\/lib\/ajuda\/([^'"]+)['"]/gm

/** Imports de `@/lib/ajuda/...` que NÃO são `import type`. */
function importaValorDeAjuda(fonte: string): string[] {
  const achados: string[] = []
  for (const m of fonte.matchAll(IMPORT_DE_AJUDA)) {
    const [, ehTipo, clausula, modulo] = m
    // `import { type X, type Y } from …` também é só tipo.
    const soTipos =
      Boolean(ehTipo) ||
      (clausula.includes('{') &&
        clausula
          .replace(/[{}]/g, '')
          .split(',')
          .filter((p) => p.trim())
          .every((p) => p.trim().startsWith('type ')))
    if (!soTipos) achados.push(modulo)
  }
  return achados
}

describe('TRAP do só-servidor: o conteúdo da documentação nunca vai para o cliente', () => {
  const fontes = [join(RAIZ, 'src', 'app'), join(RAIZ, 'src', 'components')]
    .flatMap(arquivosTsx)
    .map((caminho) => ({ caminho, fonte: readFileSync(caminho, 'utf8') }))

  it('encontra os Client Components do projeto (a varredura não está vazia)', () => {
    const clientes = fontes.filter((f) => ehClientComponent(f.fonte))
    // Se este número desabar, a detecção quebrou e o teste vira fachada.
    expect(clientes.length).toBeGreaterThan(50)
  })

  it('nenhum Client Component importa VALOR de um módulo só-servidor', () => {
    const violacoes: string[] = []
    for (const { caminho, fonte } of fontes) {
      if (!ehClientComponent(fonte)) continue
      for (const modulo of importaValorDeAjuda(fonte)) {
        if (SO_SERVIDOR.some((m) => modulo === m || modulo.startsWith(m))) {
          violacoes.push(`${relative(RAIZ, caminho).split(sep).join('/')} → @/lib/ajuda/${modulo}`)
        }
      }
    }
    expect(violacoes, `Client Component importando conteúdo só-servidor:\n${violacoes.join('\n')}`).toEqual(
      [],
    )
  })

  it('os módulos declarados PUROS continuam sem import de servidor', () => {
    // `ancora.ts` (mapa das âncoras antigas + resolução), `busca.ts` e
    // `tipos.ts` são importados por Client Components — se ganharem um import
    // de domínio/validators/csv, o trap volta pela porta dos fundos.
    for (const nome of ['ancora.ts', 'busca.ts', 'tipos.ts']) {
      const fonte = readFileSync(join(RAIZ, 'src', 'lib', 'ajuda', nome), 'utf8')
      const imports = [
        ...fonte.matchAll(/^import\s+(type\s+)?(?:(?!\bfrom\b)[\s\S])*?from\s*['"]([^'"]+)['"]/gm),
      ]
      for (const [, ehTipo, alvo] of imports) {
        if (ehTipo) continue
        expect(
          alvo.startsWith('@/lib/ajuda/') || !alvo.startsWith('@/'),
          `${nome} importa valor de ${alvo} — deixaria de ser puro`,
        ).toBe(true)
      }
    }
  })
})
