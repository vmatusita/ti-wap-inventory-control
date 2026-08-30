#!/usr/bin/env node
// AS MEDIDAS DO SISTEMA DE DESIGN — a régua que diz se uma frente andou (F40).
//
// Ferramenta de DEV. Não toca banco, não lê .env, não roda no CI. Node puro,
// ZERO dependência (regra 3 do CLAUDE.md).
//
// Por que existe: `docs/PLANO-DESIGN-SYSTEM.md` §7 promete mover sete números, e
// §1.6 dá o `grep` de cada um. Só que o `grep` NÃO distingue código de
// comentário, e este repositório comenta muito — a varredura ingênua por `<h1`
// devolve 22 onde só há 19 `<h1>` de verdade, e os outros três são comentários
// que citam `<h1>` em prosa. Contar comentário faria a régua punir quem EXPLICA
// o que fez.
//
// Daí as DUAS colunas: BRUTO (o grep do inventário, comparável ao plano) e
// CÓDIGO (sem comentário, que é o que a catraca de
// `src/lib/dominio/cores.test.ts` usa). O removedor de comentários é o mesmo dos
// dois testes — `src/lib/layout/texto-fonte.ts` —, copiado aqui porque este
// arquivo é `.mjs` de script e não passa pelo alias do TypeScript.
//
// Uso:
//   node scripts/design/medir.mjs           → mede a árvore de trabalho
//   node scripts/design/medir.mjs <caminho> → mede outra cópia (ex.: um worktree
//                                             numa revisão anterior, para o
//                                             antes/depois de uma frente)
//
// AO FECHAR CADA FRENTE: rode, compare com o relatório da frente anterior e
// abaixe `TETO_PALETA_CRUA` no mesmo commit. É assim que o teto vira catraca em
// vez de enfeite.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const RAIZ = process.argv[2] ?? process.cwd()

function semComentarios(texto) {
  let fora = ''
  let i = 0
  let emTexto = null
  while (i < texto.length) {
    const c = texto[i]
    const proximo = texto[i + 1]
    if (emTexto) {
      fora += c
      if (c === '\\') { fora += proximo ?? ''; i += 2; continue }
      if (c === emTexto) emTexto = null
      i++
      continue
    }
    if (c === "'" || c === '"' || c === '`') { emTexto = c; fora += c; i++; continue }
    if (c === '/' && proximo === '/') { while (i < texto.length && texto[i] !== '\n') { fora += ' '; i++ } continue }
    if (c === '/' && proximo === '*') {
      while (i < texto.length && !(texto[i] === '*' && texto[i + 1] === '/')) { fora += texto[i] === '\n' ? '\n' : ' '; i++ }
      fora += '  '; i += 2; continue
    }
    fora += c
    i++
  }
  return fora
}

function arquivos(exts, sob) {
  const achadas = []
  const visitar = (dir) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome)
      if (statSync(caminho).isDirectory()) { visitar(caminho); continue }
      if (!exts.some((e) => nome.endsWith(e))) continue
      achadas.push({ rel: relative(RAIZ, caminho).split(sep).join('/'), texto: readFileSync(caminho, 'utf8') })
    }
  }
  for (const d of sob) visitar(join(RAIZ, d))
  return achadas
}

const MEDIDAS = [
  {
    nome: 'Classes de paleta crua',
    exts: ['.ts', '.tsx'], sob: ['src'], excluir: null,
    re: /\b(bg|text|border|ring|fill|stroke)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900|950)\b/g,
  },
  {
    nome: 'Molduras `rounded-* border` a mao',
    exts: ['.tsx'], sob: ['src'], excluir: 'src/components/ui/',
    re: /className="[^"]*rounded-[a-z0-9]*[^"]*\bborder\b[^"]*"/g,
  },
  {
    nome: '`<h1>` escritos a mao (fora do sistema)',
    exts: ['.tsx'], sob: ['src'], excluir: 'src/components/layout/pagina.tsx|src/components/layout/casco-de-autenticacao.tsx',
    re: /<h1[\s>]/g,
  },
  {
    nome: 'Passos de espacamento fora da escala',
    exts: ['.tsx'], sob: ['src/app', 'src/components'], excluir: 'src/components/ui/',
    re: /(^|[^a-z-])(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-y|space-x)-(5|7|9|10|11|13|14|15|18|20|24|32)\b/g,
  },
  {
    nome: 'Fontes arbitrarias `text-[Npx]`',
    exts: ['.tsx'], sob: ['src'], excluir: null,
    re: /text-\[[0-9]+px\]/g,
  },
  {
    nome: 'Larguras `w-[NNNpx]`',
    exts: ['.tsx'], sob: ['src'], excluir: null,
    re: /\bw-\[[0-9]+px\]/g,
  },
  {
    nome: 'Estados vazios `border-dashed` a mao',
    exts: ['.tsx'], sob: ['src'], excluir: 'estado-vazio.tsx',
    re: /className="[^"]*border-dashed[^"]*"/g,
  },
]

for (const m of MEDIDAS) {
  const excl = m.excluir ? new RegExp(m.excluir) : null
  const arqs = arquivos(m.exts, m.sob).filter((a) => !excl || !excl.test(a.rel))
  let bruto = 0, codigo = 0
  const fb = new Set(), fc = new Set()
  for (const a of arqs) {
    const nb = (a.texto.match(m.re) ?? []).length
    if (nb) { bruto += nb; fb.add(a.rel) }
    const nc = (semComentarios(a.texto).match(m.re) ?? []).length
    if (nc) { codigo += nc; fc.add(a.rel) }
  }
  console.log(
    `${m.nome.padEnd(42)} | bruto ${String(bruto).padStart(4)} em ${String(fb.size).padStart(3)} arq | CODIGO ${String(codigo).padStart(4)} em ${String(fc.size).padStart(3)} arq`,
  )
}
