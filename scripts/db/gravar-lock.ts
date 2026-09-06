// scripts/db/gravar-lock.ts — regrava `supabase/migrations.lock.json` (F46, 06/09/2026).
//
// `npm run db:lock`. É a ÚNICA coisa no repositório que escreve o lock — o teste
// (`src/lib/validators/migrations-lock.test.ts`) só lê e compara.
//
// ⚠ QUANDO RODAR: **ao ACRESCENTAR uma migration**, no mesmo commit dela. Só nisso.
//
// ⚠ QUANDO NÃO RODAR: quando o teste acusar que uma migration TRAVADA mudou. Ali este script é
// exatamente a coisa errada a fazer — ele apagaria a prova do erro que a trava existe para
// pegar. A resposta certa é desfazer a edição e escrever uma migration NOVA (CLAUDE.md ·
// Convenções · Banco; `docs/RUNBOOK-BANCO.md` § "A trava de hash das migrations").
//
// A lógica de hash mora em `src/lib/validators/migrations-lock.ts`, importada aqui e pelo
// teste. Duplicá-la seria criar a deriva TS↔TS que este repositório já fecha em três guardas
// (`chave-sql.test.ts`, `tipos-item-sql.test.ts`, `transicoes-sql.test.ts`): um "normalizei
// diferente" entre gravador e conferente faria a trava acusar deriva que não existe.

import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ARQUIVO_LOCK,
  conferirLock,
  hashesDoDisco,
  serializarLock,
} from '@/lib/validators/migrations-lock'

// ⚠ GUARDA: este script ESCREVE. Se ele algum dia for importado de dentro do Vitest, o teste
// deixaria de conferir o lock e passaria a regravá-lo — verde por construção, que é a única
// coisa pior do que trava nenhuma. Nada o importa hoje; a guarda existe para o dia em que
// alguém tentar "reaproveitar" e não perceber o que quebrou.
if (process.env.VITEST) {
  throw new Error(
    'scripts/db/gravar-lock.ts foi carregado dentro do Vitest. Ele ESCREVE o lock — ' +
      'um teste que o importa deixa de conferir e passa a regravar. Use as funções puras de ' +
      'src/lib/validators/migrations-lock.ts.',
  )
}

const raiz = process.cwd()
const caminho = join(raiz, ...ARQUIVO_LOCK)

const noDisco = hashesDoDisco(raiz)

// O antes, só para o relatório na tela: quem roda quer saber O QUE mudou, não só que gravou.
let travadosAntes: Record<string, string> = {}
try {
  travadosAntes = (JSON.parse(readFileSync(caminho, 'utf8')) as { migrations?: Record<string, string> })
    .migrations ?? {}
} catch {
  console.log(`${ARQUIVO_LOCK.join('/')} ainda não existe — gravando pela primeira vez.`)
}

const problemas = conferirLock(travadosAntes, noDisco)
const novas = problemas.filter((p) => p.tipo === 'nova')
const alteradas = problemas.filter((p) => p.tipo === 'alterada')
const sumidas = problemas.filter((p) => p.tipo === 'sumiu')

writeFileSync(caminho, serializarLock(noDisco), 'utf8')

console.log(`${ARQUIVO_LOCK.join('/')} gravado: ${Object.keys(noDisco).length} migrations.`)
for (const p of novas) console.log(`  + travada agora: ${p.arquivo}`)
for (const p of sumidas) console.log(`  - saiu do lock:  ${p.arquivo}`)

// ⚠ NÃO É UM `console.log` DECORATIVO. Regravar por cima de uma migration ALTERADA é o único
// uso deste script que contraria a regra que ele serve. Ele não pode recusar em silêncio (há
// o caso legítimo raro: uma migration que nunca chegou a banco nenhum), mas tem de gritar — e
// o teste continuará verde depois disto, então esta é a última chance de alguém perceber.
if (alteradas.length > 0) {
  console.log('')
  console.log('⚠ ATENÇÃO — este comando acabou de regravar o hash de migration(s) JÁ TRAVADA(S):')
  for (const p of alteradas) console.log(`  ! ${p.arquivo}`)
  console.log('')
  console.log('  Se ela já foi aplicada em ensaio ou produção, isto é o erro que a trava existe')
  console.log('  para pegar: `git checkout -- supabase/migrations/<arquivo>` e escreva uma')
  console.log('  migration NOVA. Se ela nunca chegou a banco nenhum, diga isso no commit.')
  process.exitCode = 1
}
