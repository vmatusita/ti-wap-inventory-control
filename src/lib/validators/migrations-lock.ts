import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// A TRAVA DE HASH DAS MIGRATIONS (F46, 06/09/2026) — as funções puras.
//
// ⚠ POR QUE ESTE ARQUIVO EXISTE. "Migration aplicada nunca se edita" está escrito em três
// lugares — `CLAUDE.md` (convenções · Banco), `docs/RUNBOOK-BANCO.md` e a regra 8 do §4 do
// `docs/PLANO-MULTIEMPRESA.md` — e até esta fase **nada no repositório impedia**. Um byte
// alterado na `0031` passava por `lint`, `test`, `build` e pelo job `banco` VERDE, porque o
// job aplica a cadeia num banco NOVO: ele prova que as 126 aplicam limpo, nunca que são as
// mesmas de ontem. A regra vivia de memória, e memória não é defesa.
//
// E o custo do erro não é teórico: as migrations do repositório são aplicadas por MCP, uma a
// uma, e o ledger do Supabase é estruturalmente incompatível com a numeração dos arquivos
// (dívida A, `docs/DIVIDA-TECNICA.md:160`). Editar uma migration já aplicada produz um
// repositório que diz uma coisa e um banco que faz outra, **sem nenhum sinal**: o CI continua
// verde, porque ele só sabe que o texto de hoje aplica limpo do zero.
//
// O QUE ESTA TRAVA PROVA, E O QUE ELA NÃO PROVA. Ela prova que o TEXTO das migrations travadas
// é o mesmo de quando entraram. Ela **não** prova nada sobre o banco — o controle de efeito
// continua sendo a sonda por `pg_get_functiondef` do `RUNBOOK-BANCO.md`, e a dívida A continua
// aberta. São redes diferentes, para buracos diferentes.
//
// ⚠ A NORMALIZAÇÃO NÃO É DETALHE. O hash é do conteúdo com `\r\n` → `\n`. Sem isso, o mesmo
// arquivo teria dois hashes — um no Windows do desenvolvimento, outro no Linux do CI — e a
// trava acusaria deriva a cada clone, o que a treinaria a ser ignorada. O `.gitattributes` já
// pede `eol=lf`, mas ele age no checkout: um arquivo criado por ferramenta que escreva CRLF,
// ou um clone com `core.autocrlf` diferente, ainda chegaria com CRLF ao disco. A normalização
// aqui é a segunda linha, e é a que não depende de configuração de máquina.
//
// A normalização é feita em BYTES, não em texto: ler como utf8 e reserializar faria o hash
// depender do round-trip de codificação (BOM, sequência inválida), e o que se quer travar é o
// arquivo, não a interpretação dele.

/** Onde as migrations vivem, a partir da raiz do repositório. */
export const DIR_MIGRACOES = ['supabase', 'migrations'] as const

/** Onde o lock vive, a partir da raiz do repositório. */
export const ARQUIVO_LOCK = ['supabase', 'migrations.lock.json'] as const

/** O formato do arquivo travado. `_leia` existe porque JSON não tem comentário. */
export type MigrationsLock = {
  _leia: string
  algoritmo: string
  normalizacao: string
  gerado_por: string
  migrations: Record<string, string>
}

/** O texto do cabeçalho do lock. Fica aqui para o script e o teste não divergirem. */
export const CABECALHO_LOCK = {
  _leia:
    'Trava de hash das migrations (F46). Uma entrada por arquivo de supabase/migrations/. ' +
    'src/lib/validators/migrations-lock.test.ts reprova quando um arquivo travado muda um byte, ' +
    'some ou é renomeado, e quando aparece migration nova ainda não travada. ' +
    'ALTERAR MIGRATION JÁ APLICADA É PROIBIDO: sua mudança vira migration NOVA. ' +
    'Regrave este arquivo com `npm run db:lock` — só ao ACRESCENTAR uma migration.',
  algoritmo: 'sha256',
  normalizacao: 'CRLF (0D 0A) → LF (0A), em bytes, antes do hash',
  gerado_por: 'npm run db:lock',
} as const

/**
 * `\r\n` → `\n`, em bytes. Um `\r` solto (sem `\n` depois) é preservado: ele faz parte do
 * conteúdo e é o mesmo nas duas plataformas — trocá-lo mudaria o arquivo, não o normalizaria.
 */
export function normalizarConteudo(bruto: Uint8Array): Uint8Array {
  const saida = new Uint8Array(bruto.length)
  let n = 0
  for (let i = 0; i < bruto.length; i++) {
    if (bruto[i] === 0x0d && bruto[i + 1] === 0x0a) continue
    saida[n++] = bruto[i]
  }
  return saida.subarray(0, n)
}

/** O sha256 do conteúdo normalizado, em hexadecimal minúsculo. */
export function hashDoConteudo(bruto: Uint8Array): string {
  return createHash('sha256').update(normalizarConteudo(bruto)).digest('hex')
}

/**
 * Lê `supabase/migrations/` e devolve `arquivo → hash`, em ordem de nome.
 *
 * Ordena por nome porque o prefixo é sequencial zero-padded (`0001_…`, `0127_…`) e ordena
 * lexicograficamente — a mesma premissa de `chave-sql.test.ts`. A ordem importa só para o
 * arquivo gravado ficar legível no diff; a conferência é por chave.
 */
export function hashesDoDisco(raiz: string): Record<string, string> {
  const dir = join(raiz, ...DIR_MIGRACOES)
  const arquivos = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  const mapa: Record<string, string> = {}
  for (const arquivo of arquivos) {
    mapa[arquivo] = hashDoConteudo(readFileSync(join(dir, arquivo)))
  }
  return mapa
}

/** Um problema encontrado pela conferência. `arquivo` é sempre o culpado nomeado. */
export type ProblemaDoLock = {
  tipo: 'alterada' | 'sumiu' | 'nova'
  arquivo: string
  mensagem: string
}

/**
 * Compara o lock com o disco. Função PURA: recebe os dois mapas, não lê nem escreve nada.
 *
 * ⚠ AS TRÊS CLASSES SÃO DELIBERADAMENTE DIFERENTES, porque a resposta certa a cada uma é
 * diferente — e uma mensagem genérica ("o lock não bate") empurraria as três para a mesma
 * saída errada, que é regravar o lock:
 *
 * - **alterada** — alguém editou uma migration já travada. A resposta é DESFAZER a edição e
 *   escrever uma migration NOVA. Regravar o lock aqui é apagar a prova do erro que a trava
 *   existe para pegar, então a mensagem não cita `npm run db:lock`.
 * - **sumiu** — arquivo travado apagado ou renomeado. Renomear uma migration aplicada tem o
 *   mesmo efeito de editá-la (o ledger e o histórico passam a apontar para um nome que não
 *   existe), então também é desfazer.
 * - **nova** — migration nova ainda não travada. É o fluxo NORMAL, e a resposta é uma linha:
 *   `npm run db:lock`, no mesmo commit.
 */
export function conferirLock(
  travados: Record<string, string>,
  noDisco: Record<string, string>,
): ProblemaDoLock[] {
  const problemas: ProblemaDoLock[] = []

  for (const [arquivo, hashTravado] of Object.entries(travados).sort()) {
    const hashAtual = noDisco[arquivo]
    if (hashAtual === undefined) {
      problemas.push({
        tipo: 'sumiu',
        arquivo,
        mensagem:
          `supabase/migrations/${arquivo} está travada em supabase/migrations.lock.json ` +
          `mas não existe mais no disco. Migration aplicada não se apaga nem se renomeia — ` +
          `restaure o arquivo com o nome original. Se ela nunca chegou a nenhum banco, ` +
          `remova a entrada do lock à mão e diga isso no commit.`,
      })
      continue
    }
    if (hashAtual !== hashTravado) {
      problemas.push({
        tipo: 'alterada',
        arquivo,
        mensagem:
          `supabase/migrations/${arquivo} MUDOU depois de travada ` +
          `(travado ${hashTravado.slice(0, 12)}…, no disco ${hashAtual.slice(0, 12)}…). ` +
          `Migration aplicada NUNCA se edita (CLAUDE.md · Convenções · Banco): desfaça a ` +
          `alteração neste arquivo e escreva uma migration NOVA com o que você queria mudar. ` +
          `NÃO regrave o lock — isso apagaria a prova.`,
      })
    }
  }

  for (const arquivo of Object.keys(noDisco).sort()) {
    if (travados[arquivo] === undefined) {
      problemas.push({
        tipo: 'nova',
        arquivo,
        mensagem:
          `supabase/migrations/${arquivo} ainda não está em supabase/migrations.lock.json. ` +
          `Migration nova é o fluxo normal: rode \`npm run db:lock\` e comite o lock ` +
          `no MESMO commit da migration.`,
      })
    }
  }

  return problemas
}

/** Lê o lock do disco. Erra com o caminho na mensagem — o arquivo é versionado, tem de existir. */
export function lerLock(raiz: string): MigrationsLock {
  const caminho = join(raiz, ...ARQUIVO_LOCK)
  let cru: string
  try {
    cru = readFileSync(caminho, 'utf8')
  } catch {
    throw new Error(
      `${ARQUIVO_LOCK.join('/')} não existe (procurei em ${caminho}). ` +
        `Ele é versionado — gere com \`npm run db:lock\`.`,
    )
  }
  const lock = JSON.parse(cru) as MigrationsLock
  if (!lock || typeof lock.migrations !== 'object' || lock.migrations === null) {
    throw new Error(
      `${ARQUIVO_LOCK.join('/')} não tem o campo \`migrations\` como objeto — arquivo corrompido.`,
    )
  }
  return lock
}

/** O JSON exato que o `npm run db:lock` grava. Uma linha por migration, `\n` no fim. */
export function serializarLock(migrations: Record<string, string>): string {
  return `${JSON.stringify({ ...CABECALHO_LOCK, migrations }, null, 2)}\n`
}
