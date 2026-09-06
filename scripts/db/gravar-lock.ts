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

// ⚠ RECUSA POR PADRÃO QUANDO UMA MIGRATION TRAVADA MUDOU — e escrever antes de reclamar seria
// pior que não reclamar.
//
// A primeira versão deste script GRAVAVA e depois saía 1 com um aviso alto. Estava errado, e o
// motivo é o buraco que esta fase inteira existe para fechar: quem editou a `0031` sem querer e
// rodou `npm run db:lock` por reflexo (é o comando que a mensagem da classe "nova" ensina)
// terminaria com o lock JÁ REGRAVADO e o `npm run test` VERDE. O aviso teria rolado para fora da
// tela, e a única prova do erro teria sido apagada pela própria ferramenta. Verificação que grava
// primeiro e reclama depois não é verificação — é a coisa que a F45 existiu para matar.
//
// Então: recusa, não grava nada, e diz as duas saídas. A legítima é rara e existe — uma migration
// que NUNCA chegou a banco nenhum ainda pode ser corrigida no lugar —, e para ela há a flag
// explícita `--regravar-alterada`, que obriga quem a usa a saber o que está fazendo e deixa
// rastro no histórico do shell.
const FORCAR = process.argv.includes('--regravar-alterada')

if (alteradas.length > 0 && !FORCAR) {
  console.error('')
  console.error('✗ RECUSADO — nada foi gravado.')
  console.error('')
  console.error('  Estas migrations JÁ TRAVADAS mudaram de conteúdo:')
  for (const p of alteradas) console.error(`    ! ${p.arquivo}`)
  console.error('')
  console.error('  Migration aplicada NUNCA se edita (CLAUDE.md · Convenções · Banco). Regravar o')
  console.error('  lock aqui apagaria a prova do erro que a trava existe para pegar.')
  console.error('')
  console.error('  A saída certa, quase sempre:')
  for (const p of alteradas) console.error(`    git checkout -- supabase/migrations/${p.arquivo}`)
  console.error('  e escreva uma migration NOVA com o que você queria mudar.')
  console.error('')
  console.error('  A exceção, rara: se ela NUNCA chegou a ensaio nem a produção, ela ainda pode ser')
  console.error('  corrigida no lugar. Nesse caso, e só nesse caso:')
  console.error('    npm run db:lock -- --regravar-alterada')
  console.error('  e diga no commit que ela não tinha sido aplicada em lugar nenhum.')
  console.error('')
  console.error('  Em dúvida se ela chegou? A sonda de efeito responde; o ledger não.')
  console.error('  Ver docs/RUNBOOK-BANCO.md § "A trava de hash das migrations".')
  process.exit(1)
}

writeFileSync(caminho, serializarLock(noDisco), 'utf8')

console.log(`${ARQUIVO_LOCK.join('/')} gravado: ${Object.keys(noDisco).length} migrations.`)
for (const p of novas) console.log(`  + travada agora: ${p.arquivo}`)
for (const p of sumidas) console.log(`  - saiu do lock:  ${p.arquivo}`)

// O caminho da flag: gravou porque mandaram, mas deixa o registro alto na saída.
if (alteradas.length > 0) {
  console.log('')
  console.log('⚠ --regravar-alterada: o hash destas migrations JÁ TRAVADAS foi REGRAVADO:')
  for (const p of alteradas) console.log(`  ! ${p.arquivo}`)
  console.log('')
  console.log('  Diga no commit por que elas não tinham sido aplicadas em banco nenhum.')
}
