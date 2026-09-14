import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { limpar } from '@/lib/use-server-exports'

// F57 · Frente F — toda rota que lê `filial` da URL chama o helper de pertinência.
//
// DESCOBERTA PELO DISCO, não por lista redigitada: uma rota nova que leia `sp.filial` (ou
// `params.filial`, ou `searchParams.get('filial')`) sem chamar `recusarFilialInexistente` derruba
// este teste no mesmo commit em que nasce. A contagem MÍNIMA de 8 é a medida da F57 — se a
// varredura passar a achar menos, o leitor ficou cego (e é o teste que avisa, não o silêncio).
//
// O QUE A VARREDURA PROVA: que o helper é CHAMADO na rota. O que ela NÃO prova: que o resultado
// foi respeitado em todo caminho, nem que a chamada vem antes da leitura — isso é revisão.

const RAIZ = process.cwd()
const HELPER = 'recusarFilialInexistente'
const MINIMO_DE_ROTAS = 8
const posix = (p: string) => relative(RAIZ, p).split(sep).join('/')

function arquivosDeApp(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) arquivosDeApp(p, saida)
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome)) saida.push(p)
  }
  return saida
}

/** O arquivo LÊ `filial` da URL? (fonte já sem comentários) */
function leFilialDaUrl(fonte: string): boolean {
  // `const sp = await searchParams` → `sp.filial` · `sp['filial']` (o nome da variável vem do fonte)
  for (const m of fonte.matchAll(/\bconst\s+(\w+)\s*=\s*await\s+searchParams\b/g)) {
    const v = m[1]
    if (new RegExp(String.raw`\b${v}\s*(?:\??\.\s*filial\b|\[\s*['"]filial['"]\s*\])`).test(fonte)) {
      return true
    }
  }
  // A rota dinâmica `[filial]`: pela assinatura (`params: Promise<{ filial: string }>`) ou pelo uso.
  if (/\bparams\s*:\s*Promise<\s*\{[^}]*\bfilial\s*:/.test(fonte)) return true
  if (/\bparams\s*\??\.\s*filial\b/.test(fonte)) return true
  if (/\{[^}]*\bfilial\b[^}]*\}\s*=\s*await\s+params\b/.test(fonte)) return true
  // Route handler: `searchParams.get('filial')`.
  if (/\bsearchParams\s*\.\s*get\(\s*['"]filial['"]\s*\)/.test(fonte)) return true
  return false
}

function rotasQueLeemFilial(): { arquivo: string; chamaHelper: boolean }[] {
  return arquivosDeApp(join(RAIZ, 'src', 'app'))
    .map((p) => ({ p, fonte: limpar(readFileSync(p, 'utf8'), false) }))
    .filter(({ fonte }) => leFilialDaUrl(fonte))
    .map(({ p, fonte }) => ({
      arquivo: posix(p),
      chamaHelper: new RegExp(String.raw`\b${HELPER}\s*\(`).test(fonte),
    }))
}

describe('toda rota que lê `filial` da URL recusa a filial inexistente', () => {
  it(`a varredura acha pelo menos ${MINIMO_DE_ROTAS} rotas (senão o leitor ficou cego)`, () => {
    expect(rotasQueLeemFilial().length).toBeGreaterThanOrEqual(MINIMO_DE_ROTAS)
  })

  it(`cada uma chama \`${HELPER}\``, () => {
    const semHelper = rotasQueLeemFilial()
      .filter((r) => !r.chamaHelper)
      .map((r) => r.arquivo)
    expect(semHelper, `chame ${HELPER} (src/lib/unidades/pertinencia.ts) nestas rotas`).toEqual([])
  })

  it('o leitor reconhece as quatro formas de ler o parâmetro (guarda do próprio teste)', () => {
    expect(leFilialDaUrl('const sp = await searchParams\nconst f = primeiro(sp.filial)')).toBe(true)
    expect(leFilialDaUrl("const q = await searchParams\nconst f = q['filial']")).toBe(true)
    expect(
      leFilialDaUrl('export default async function P({ params }: { params: Promise<{ filial: string }> }) {}'),
    ).toBe(true)
    expect(leFilialDaUrl('const { filial: slug } = await params')).toBe(true)
    expect(leFilialDaUrl("const f = url.searchParams.get('filial')")).toBe(true)
    // E não inventa: ler `l.filial` de uma linha do banco não é ler a URL.
    expect(leFilialDaUrl('const sp = await searchParams\nconst nome = linha.filial')).toBe(false)
  })
})
