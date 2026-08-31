#!/usr/bin/env node
// AS MEDIDAS DO SISTEMA DE DESIGN — a régua que diz se uma frente andou (F40).
//
// Ferramenta de DEV. Não toca banco, não lê .env, não roda no CI.
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
// `src/lib/dominio/cores.test.ts` usa).
//
// ⚠ ERA UM `.mjs` COM AS RÉGUAS COPIADAS À MÃO, e a revisão de 31/08/2026 desfez
// isso. O arquivo trazia a própria cópia de `semComentarios` — a duplicação que o
// cabeçalho de `src/lib/layout/texto-fonte.ts` diz textualmente não poder existir
// ("duas cópias divergiriam, e a divergência aqui não faz o teste falhar: faz ele
// medir outra coisa em silêncio") — e mais duas réguas próprias, que JÁ tinham
// divergido do teste:
//
//   · a escala listava só passos INTEIROS, então `p-2.5` e `gap-3.5` eram
//     invisíveis. O script dizia 46 passos fora da escala; são 88.
//   · a moldura era um regex sobre `className="…"` literal, que casava com
//     `border-b`, `border-dashed`, `border-input` e `rounded-full border` (nenhum
//     é moldura) e perdia tudo que é montado em `cn(...)` — o buraco que a regra 6
//     do teste fechou de propósito. Dizia 178; são 167. Os dois erros se
//     cancelavam e o total parecia certo.
//
// Agora é `.ts` rodado por `tsx`, importando de `src/lib/layout/` — o mesmo
// caminho de `scripts/carac-relatorios.ts`, que já é um `.ts` em `scripts/`
// importando pelo alias `@/`. Uma régua só, e é a régua testada.
//
// Uso:
//   npx tsx scripts/design/medir.ts           → mede a árvore de trabalho
//   npx tsx scripts/design/medir.ts <caminho> → mede outra cópia (ex.: um
//                                               worktree numa revisão anterior,
//                                               para o antes/depois de uma frente)
//
// AO FECHAR CADA FRENTE: rode, compare com o relatório da frente anterior e
// abaixe `TETO_PALETA_CRUA` no mesmo commit. É assim que o teto vira catraca em
// vez de enfeite.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { semComentarios } from '@/lib/layout/texto-fonte'
import {
  classNames,
  classes,
  ehMolduraAMao,
  ehStringDeClasse,
  passoForaDaEscala,
} from '@/lib/layout/regua-de-classes'

const RAIZ = process.argv[2] ?? process.cwd()

type Arquivo = { rel: string; texto: string }

function arquivos(exts: string[], sob: string[], excluir: RegExp | null): Arquivo[] {
  const achadas: Arquivo[] = []
  const visitar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome)
      if (statSync(caminho).isDirectory()) {
        visitar(caminho)
        continue
      }
      if (!exts.some((e) => nome.endsWith(e))) continue
      const rel = relative(RAIZ, caminho).split(sep).join('/')
      if (excluir && excluir.test(rel)) continue
      achadas.push({ rel, texto: readFileSync(caminho, 'utf8') })
    }
  }
  for (const d of sob) visitar(join(RAIZ, d))
  return achadas
}

/** Quantas ocorrências esta medida acha num texto? */
type Contador = (texto: string) => number

type Medida = {
  nome: string
  exts: string[]
  sob: string[]
  excluir: string | null
  conta: Contador
}

/** O contador de sempre, para as medidas que são só um regex. */
const porRegex =
  (re: RegExp): Contador =>
  (texto) =>
    (texto.match(re) ?? []).length

const MEDIDAS: Medida[] = [
  {
    nome: 'Classes de paleta crua',
    exts: ['.ts', '.tsx'],
    sob: ['src'],
    excluir: null,
    // A MESMA expressão de `src/lib/dominio/cores.test.ts` (a catraca), letra por
    // letra — é o que faz os dois números serem comparáveis.
    conta: porRegex(
      /\b(bg|text|border|ring|fill|stroke)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900|950)\b/g,
    ),
  },
  {
    nome: 'Molduras `rounded-* border` a mao',
    exts: ['.tsx'],
    sob: ['src'],
    excluir: 'src/components/ui/',
    // A REGRA 6, não um regex parecido com ela: `classNames` remonta o `cn(...)`
    // antes de medir, e `ehMolduraAMao` sabe que `border-b`/`border-input`/
    // `rounded-full` não fazem moldura e que a tracejada do estado vazio é isenta.
    conta: (texto) => classNames(texto).filter(({ valor }) => ehMolduraAMao(valor)).length,
  },
  {
    nome: '`<h1>` escritos a mao (fora do sistema)',
    exts: ['.tsx'],
    sob: ['src'],
    excluir:
      'src/components/layout/pagina.tsx|src/components/layout/casco-de-autenticacao.tsx',
    conta: porRegex(/<h1[\s>]/g),
  },
  {
    nome: 'Passos de espacamento fora da escala',
    exts: ['.tsx'],
    sob: ['src/app', 'src/components'],
    excluir: 'src/components/ui/',
    // A REGRA 3/4. A versão antiga listava (5|7|9|10|…) e não via `p-2.5`.
    conta: (texto) =>
      classes(texto)
        .filter(({ valor }) => ehStringDeClasse(valor))
        .flatMap(({ valor }) => valor.split(/\s+/))
        .filter((parte) => passoForaDaEscala(parte)).length,
  },
  {
    nome: 'Fontes arbitrarias `text-[Npx]`',
    exts: ['.tsx'],
    sob: ['src'],
    excluir: null,
    conta: porRegex(/text-\[[0-9]+px\]/g),
  },
  {
    nome: 'Larguras `w-[NNNpx]`',
    exts: ['.tsx'],
    sob: ['src'],
    excluir: null,
    conta: porRegex(/\bw-\[[0-9]+px\]/g),
  },
  {
    nome: 'Estados vazios `border-dashed` a mao',
    exts: ['.tsx'],
    sob: ['src'],
    excluir: 'estado-vazio.tsx',
    conta: porRegex(/className="[^"]*border-dashed[^"]*"/g),
  },
]

for (const m of MEDIDAS) {
  const arqs = arquivos(m.exts, m.sob, m.excluir ? new RegExp(m.excluir) : null)
  let bruto = 0
  let codigo = 0
  const fb = new Set<string>()
  const fc = new Set<string>()
  for (const a of arqs) {
    const nb = m.conta(a.texto)
    if (nb) {
      bruto += nb
      fb.add(a.rel)
    }
    const nc = m.conta(semComentarios(a.texto))
    if (nc) {
      codigo += nc
      fc.add(a.rel)
    }
  }
  console.log(
    `${m.nome.padEnd(42)} | bruto ${String(bruto).padStart(4)} em ${String(fb.size).padStart(3)} arq | CODIGO ${String(codigo).padStart(4)} em ${String(fc.size).padStart(3)} arq`,
  )
}
