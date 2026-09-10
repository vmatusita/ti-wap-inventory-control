#!/usr/bin/env node
// =============================================================================
// restaurar.mjs — devolve ao banco o que um backup da F54 guardou.
// =============================================================================
// FERRAMENTA, não feature do app — mesma natureza de `scripts/import/` (a carga do
// go-live). Não é importada por nada em `src/`, não vai para o bundle, e roda a mão.
//
// POR QUE ELA EXISTE. Até a F54 a restauração não existia: nem código, nem desenho,
// nem uma vez executada. Um backup que ninguém sabe restaurar é um arquivo, não um
// backup. O `restore` que o Supabase oferece é do PROJETO INTEIRO — no multiempresa
// isso levaria os outros clientes de volta ao ponto do backup, e é por isso que a F73
// (o piloto) depende deste script e não daquele botão.
//
// -----------------------------------------------------------------------------
// COMO SE USA
// -----------------------------------------------------------------------------
//   DATABASE_URL=postgresql://…  node scripts/db/restaurar.mjs <caminho-do-backup>
//   DATABASE_URL=postgresql://…  node scripts/db/restaurar.mjs <caminho> --aplicar
//
// Sem `--aplicar` ele CONFERE e não escreve nada (mesmo padrão de `scripts/termos/`).
// O `<caminho-do-backup>` é um arquivo `.json` local, ou o nome de um objeto do bucket
// `backups-import` (aí ele baixa, e para isso precisa de NEXT_PUBLIC_SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY).
//
// -----------------------------------------------------------------------------
// AS QUATRO ARMADILHAS, e onde cada uma é tratada aqui
// -----------------------------------------------------------------------------
// Todas viraram asserção em `supabase/tests/restauracao.sql`, que roda no CI. O que
// segue é onde este script paga cada uma:
//
//  1. `movimentacoes.ordem` é `generated always as identity` (F53). Sem
//     `overriding system value` o INSERT é RECUSADO. → `inserirMovimentacoes`.
//  2. Com ele, a SEQUÊNCIA não avança. Sem `setval` depois, a PRIMEIRA movimentação
//     registrada após a restauração viola `movimentacoes_ordem_uidx` — e o sintoma
//     aparece na cara do operador, dias depois, longe daqui. → `acertarSequencia`.
//     ⚠ Isto morde de verdade quando se restaura num banco cuja sequência está ATRÁS
//     (projeto novo, outro ambiente, o piloto da F73). Restaurar no mesmo banco não
//     expõe o defeito, e é por isso que ele não pode depender de sorte.
//  3. `trg_aplicar_movimentacao` é BEFORE INSERT e RECALCULA o estado — e mais: ele
//     INSERE `pendencias_item` sozinho numa `devolucao` com itens faltantes. Deixar a
//     máquina derivar não é "mais honesto", é DUPLICAR a pendência que o backup já
//     traz (medido: cenário 3c do roteiro). → o trigger é desligado dentro da
//     transação, e o estado restaurado é o que se salvou.
//  4. `set constraints all immediate` é obrigatório antes de desligar o trigger — a FK
//     `pendencias_item.movimentacao_id` é DEFERRABLE INITIALLY DEFERRED, e com eventos
//     pendentes o Postgres recusa o `alter table` com `55006`. E o modo tem de VOLTAR
//     a deferido antes de o banco ser solto para uso normal, porque
//     `aplicar_movimentacao` depende dele (ele aponta para uma linha que ainda não
//     existe). As duas metades foram descobertas RODANDO, não lendo.
//
// -----------------------------------------------------------------------------
// O QUE ELE NÃO FAZ
// -----------------------------------------------------------------------------
// · Não aponta para produção. Nunca. Ver `REFS_DE_ENSAIO` abaixo.
// · Não decide o que restaurar: ele restaura o que está no arquivo. Recorte é assunto
//   de quem escolheu o backup.
// · Não repõe o que o backup não traz. É para isso que existe o campo `nao_incluido`
//   no cabeçalho — ele é IMPRESSO na conferência, e não ignorado.
// =============================================================================

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// -----------------------------------------------------------------------------
// A GUARDA — por PERMISSÃO, nunca por consistência (F55 inverteu a F11)
// -----------------------------------------------------------------------------
// Até a F55 (10/09/2026) esta era uma lista de NEGAÇÃO com um item
// (`REFS_DE_PRODUCAO`): um ref INVENTADO, ou um projeto de produção NOVO, passava.
// Agora é uma lista de PERMISSÃO — o ref TEM de estar em `REFS_DE_ENSAIO` — MAIS o
// caso legítimo do CI: uma `DATABASE_URL` de Postgres LOCAL, sem ref nenhum, também
// passa (é assim que o `banco-sem-docker` roda `db:test:mutations`). Essa exceção NÃO
// existe em `scripts/env-guard.ts`: lá um ref ausente já é erro de configuração antes
// desta guarda ser alcançada — as duas semânticas são diferentes de propósito.
//
// ⚠ ESPELHA `REFS_DE_ENSAIO` de `scripts/env-guard.ts`, e a duplicação é obrigada:
// este arquivo é `.mjs` e aquele é `.ts` — um não importa o outro sem transpilar. O
// que impede as duas listas de divergirem é `scripts/db/restaurar-guarda.test.mts`,
// que lê os DOIS arquivos e exige que os conjuntos sejam iguais.
//
// ⚠ E A LIÇÃO É DA F11 (22/07/2026), que está escrita no `env-guard.ts`: as guardas de
// lá comparavam `SEED_PROJECT_REF` com a URL — um teste de CONSISTÊNCIA, não de
// IDENTIDADE. Com os dois apontando para produção (que era o estado do `.env.local`
// naquele dia) as três guardas passavam, e `npm run db:reset` teria zerado o acervo
// real. Consistência não protege de nada quando o erro é coerente.
const REFS_DE_ENSAIO = ['sgmvldiizsrjbxzzpmhh']

// Refs de PRODUÇÃO conhecidos, usados SÓ para dar a mensagem CERTA quando alguém
// aponta para lá. A permissão de verdade é `REFS_DE_ENSAIO`, acima — um ref de
// produção NOVO que não esteja aqui ainda cai no "ref não permitido" genérico,
// RECUSADO do mesmo jeito.
const REFS_DE_PRODUCAO_CONHECIDOS = ['pbtjcalbmepmrqzprusb']

/** O `<ref>` de uma URL `https://<ref>.supabase.co`, ou null. */
export function refDaUrl(url) {
  try {
    return new URL(url).hostname.split('.')[0] || null
  } catch {
    return null
  }
}

/**
 * O `<ref>` escondido numa `DATABASE_URL` do Supabase, ou null.
 *
 * As duas formas que existem hoje:
 *   · direta:  postgresql://postgres:<senha>@db.<ref>.supabase.co:5432/postgres
 *   · pooler:  postgresql://postgres.<ref>:<senha>@aws-0-<região>.pooler.supabase.com:…
 *
 * ⚠ A SEGUNDA É A ARMADILHA: no pooler o ref viaja no NOME DE USUÁRIO, não no host.
 * Uma guarda que só olhasse o host deixaria passar a `DATABASE_URL` de produção na
 * forma que o painel do Supabase oferece primeiro.
 */
export function refDaDatabaseUrl(dbUrl) {
  if (!dbUrl) return null
  const porHost = /@db\.([a-z0-9]{20})\.supabase\.co/i.exec(dbUrl)
  if (porHost) return porHost[1]
  const porUsuario = /:\/\/postgres\.([a-z0-9]{20}):/i.exec(dbUrl)
  if (porUsuario) return porUsuario[1]
  return null
}

/**
 * Só passam: um ref de `REFS_DE_ENSAIO`, ou NENHUM ref (Postgres local, sem
 * subdomínio do Supabase — o caso legítimo do CI). Qualquer outro ref é recusado;
 * a mensagem muda conforme ele bater com um dos conhecidos de produção ou não.
 * Sai do processo.
 */
export function exigirAmbientePermitido(refs) {
  for (const ref of refs) {
    if (!ref) continue // sem ref = Postgres local, caso legítimo do CI
    if (REFS_DE_ENSAIO.includes(ref)) continue
    if (REFS_DE_PRODUCAO_CONHECIDOS.includes(ref)) {
      console.error(
        `\n[GUARDA] Execução recusada: o ref "${ref}" é PRODUÇÃO ` +
          '(docs/RUNBOOK-BANCO.md).\n' +
          'Este script NUNCA restaura em produção — nem com confirmação, nem com variável\n' +
          'de ambiente. Aponte DATABASE_URL e NEXT_PUBLIC_SUPABASE_URL para o projeto de\n' +
          'ensaio, ou para um Postgres descartável.\n',
      )
    } else {
      console.error(
        `\n[GUARDA] Execução recusada: o ref "${ref}" não está na lista de ensaio\n` +
          'permitida (REFS_DE_ENSAIO em scripts/db/restaurar.mjs). Aponte DATABASE_URL e\n' +
          'NEXT_PUBLIC_SUPABASE_URL para o projeto de ensaio, ou para um Postgres\n' +
          'descartável sem ref (como no CI).\n',
      )
    }
    process.exit(1)
  }
}

// -----------------------------------------------------------------------------
// psql — o mesmo caminho que `run-mutation-tests.mjs` e `rodar-roteiros.sh` usam
// -----------------------------------------------------------------------------
/**
 * Roda SQL por `psql`, passando-o num ARQUIVO (`-f`) e nunca num argumento (`-c`).
 *
 * ⚠ `-c` NÃO SERVE AQUI, e o motivo é um teto do sistema operacional, não de estilo.
 * O SQL de uma restauração é um INSERT com todas as linhas do backup: medido em
 * produção, `movimentacoes` soma **2,85 MB** e `ativos` **1,17 MB**. O limite por
 * argumento é 128 KiB no Linux (`MAX_ARG_STRLEN`) e menor ainda no Windows —
 * reproduzido nesta mesa: 30.000 caracteres passam, 40.000 dão `ENAMETOOLONG`. Com
 * `-c`, o script só aplicaria backups de umas trinta linhas, e falharia em qualquer
 * um de verdade — sem que nada no caminho feliz denunciasse.
 * (Achado da revisão adversarial, reproduzido antes de corrigir.)
 */
function psql(url, sql, { silencioso = false } = {}) {
  const arquivo = join(tmpdir(), `restaurar-${process.pid}-${sql.length}.sql`)
  writeFileSync(arquivo, sql, 'utf8')
  try {
    const r = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-q', url, '-f', arquivo], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    if (r.status !== 0 && !silencioso) {
      throw new Error(`psql falhou:\n${r.stderr || r.stdout}`)
    }
    return r
  } finally {
    try {
      unlinkSync(arquivo)
    } catch {
      /* o arquivo é temporário: não conseguir apagá-lo não invalida a restauração */
    }
  }
}

function psqlValor(url, sql) {
  const r = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-tA', url, '-c', sql], {
    encoding: 'utf8',
  })
  if (r.status !== 0) throw new Error(`psql falhou:\n${r.stderr}`)
  return r.stdout.trim()
}

// -----------------------------------------------------------------------------
// O backup
// -----------------------------------------------------------------------------

/** As tabelas do acervo, NA ORDEM DE INSERÇÃO derivada das 24 FKs. */
export const ORDEM_DE_INSERCAO = [
  'ativos',
  'movimentacoes',
  'pendencias_item',
  'lancamentos_item',
  'anotacoes',
  'termos_gerados',
]

/**
 * A `versao` do cabeçalho, com 0 para os backups anteriores ao campo.
 *
 * ⚠ NÃO INVENTA 1. Os backups do reset gravados antes da F54 não têm `versao` nem
 * `contagens`, e tratá-los como v1 faria a conferência de contagens comparar contra
 * `undefined` e "passar". A diferença entre "não conferi" e "conferi e bateu" tem de
 * chegar à saída — é a única coisa que impede alguém de restaurar achando que
 * restaurou tudo.
 */
export function versaoDoBackup(cabecalho) {
  return typeof cabecalho?.versao === 'number' ? cabecalho.versao : 0
}

/** O prefixo onde as cópias de `.docx` daquele backup moram (F54). */
export function prefixoDasCopias(caminhoDoBackup) {
  return `${caminhoDoBackup.replace(/\.json$/, '')}/termos/`
}

// -----------------------------------------------------------------------------
// A restauração, em SQL
// -----------------------------------------------------------------------------

function literal(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (Array.isArray(v)) {
    // ⚠ ARRAY VAZIO NÃO PODE VIRAR `array[]` — o Postgres recusa com
    // `42P18: cannot determine type of empty array`, e a transação inteira morre.
    // Não é hipótese: produção tem **73** movimentações com `itens_faltantes = '{}'`,
    // então qualquer backup que contenha uma delas abortava a restauração.
    // O literal `'{}'` não tem esse problema: no contexto de um INSERT o Postgres o
    // converte para o tipo da COLUNA, que é justamente o que se quer aqui.
    // (Achado da revisão adversarial, reproduzido antes de corrigir.)
    if (v.length === 0) return `'{}'`
    return `array[${v.map((x) => literal(x)).join(',')}]`
  }
  if (typeof v === 'object') return `${literal(JSON.stringify(v))}::jsonb`
  return `'${String(v).replace(/'/g, "''")}'`
}

/**
 * O SQL de uma tabela. `movimentacoes` ganha `overriding system value` — armadilha 1.
 */
export function sqlDeInsercao(tabela, linhas) {
  if (!linhas || linhas.length === 0) return null
  const colunas = [...new Set(linhas.flatMap((l) => Object.keys(l)))]
  const override = tabela === 'movimentacoes' ? ' overriding system value' : ''
  const valores = linhas
    .map((l) => `(${colunas.map((c) => literal(l[c] ?? null)).join(', ')})`)
    .join(',\n  ')
  return `insert into public.${tabela} (${colunas.join(', ')})${override}\nvalues\n  ${valores};`
}

/** Armadilha 2: a sequência tem de terminar em max(ordem). */
export function sqlDaSequencia() {
  return [
    '-- Armadilha 2 (ata 1 da F53): `overriding system value` NÃO avança a sequência.',
    '-- Sem isto, a PRIMEIRA movimentação registrada depois da restauração viola',
    '-- `movimentacoes_ordem_uidx` — e o erro aparece para o operador, não aqui.',
    "select setval(pg_get_serial_sequence('public.movimentacoes','ordem'),",
    '              coalesce((select max(ordem) from public.movimentacoes), 1), true);',
  ].join('\n')
}

function montarTransacao(backup, caminho) {
  const partes = ['begin;']

  // Armadilha 4, primeira metade.
  partes.push('set constraints all immediate;')
  // Armadilha 3.
  partes.push('alter table public.movimentacoes disable trigger trg_aplicar_movimentacao;')
  // ⚠ SÃO DOIS GATILHOS VIVOS, NÃO UM — e a Decisão 7 tratou o problema como se fosse
  // um só. `lancamentos_item` está na ORDEM_DE_INSERCAO e tem
  // `trg_valida_lancamento_item` (BEFORE INSERT ROW), que levanta `check_violation` em
  // "Estoque insuficiente" e nos dois irmãos. Num INSERT multi-linha o BEFORE ROW NÃO
  // enxerga as linhas anteriores do MESMO comando: toda saída/retorno/liberação do
  // backup seria validada contra o estado ANTERIOR à restauração, e o backup do reset
  // de itens — o único que contém `lancamentos_item`, e cujo cabeçalho a Decisão 4
  // acabou de completar — seria irrestaurável por construção.
  // (Achado da revisão adversarial.)
  partes.push('alter table public.lancamentos_item disable trigger trg_valida_lancamento_item;')
  // A janela: o backup PODE conter linhas com `forcado = true`, que `guarda_acervo`
  // recusaria fora dela (0079/0081).
  partes.push("select set_config('estoque.dev_destrutivo','on',true);")

  for (const tabela of ORDEM_DE_INSERCAO) {
    const sql = sqlDeInsercao(tabela, backup[tabela])
    if (sql) partes.push(`-- ${tabela}: ${backup[tabela].length} linha(s)`, sql)
  }

  partes.push("select set_config('estoque.dev_destrutivo','off',true);")
  partes.push('alter table public.lancamentos_item enable trigger trg_valida_lancamento_item;')
  partes.push('alter table public.movimentacoes enable trigger trg_aplicar_movimentacao;')
  // Armadilha 4, segunda metade: devolve o modo que o caminho normal de escrita exige.
  partes.push('set constraints all deferred;')
  partes.push(sqlDaSequencia())
  partes.push('commit;')
  partes.push(`-- origem: ${caminho}`)
  return partes.join('\n\n')
}

// -----------------------------------------------------------------------------
// main
// -----------------------------------------------------------------------------

async function baixarDoBucket(caminho) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Para ler do bucket é preciso NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
    )
  }
  exigirAmbientePermitido([refDaUrl(url)])
  const r = await fetch(`${url}/storage/v1/object/backups-import/${caminho}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!r.ok) throw new Error(`Não consegui baixar "${caminho}" do bucket (HTTP ${r.status}).`)
  return JSON.parse(await r.text())
}

async function main() {
  const args = process.argv.slice(2)
  const aplicar = args.includes('--aplicar')
  const caminho = args.find((a) => !a.startsWith('--'))

  if (!caminho) {
    console.error(
      'uso: DATABASE_URL=… node scripts/db/restaurar.mjs <backup.json|caminho/no/bucket.json> [--aplicar]',
    )
    process.exit(1)
  }

  const dbUrl = process.env.DATABASE_URL
  // A guarda roda ANTES de qualquer leitura, e sobre TODAS as fontes de ref.
  exigirAmbientePermitido([
    refDaDatabaseUrl(dbUrl),
    refDaUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''),
  ])

  const backup = existsSync(caminho)
    ? JSON.parse(readFileSync(caminho, 'utf8'))
    : await baixarDoBucket(caminho)

  const versao = versaoDoBackup(backup)
  console.log(`\nBackup: ${caminho}`)
  console.log(`Formato: versão ${versao}${versao === 0 ? ' (anterior ao campo — ver abaixo)' : ''}`)
  if (backup.exportadoEm || backup.gerado_em) {
    console.log(`Exportado em: ${backup.exportadoEm ?? backup.gerado_em}`)
  }

  console.log('\nLinhas por tabela:')
  let total = 0
  for (const t of ORDEM_DE_INSERCAO) {
    const n = Array.isArray(backup[t]) ? backup[t].length : 0
    total += n
    console.log(`  ${t.padEnd(18)} ${String(n).padStart(6)}`)
  }
  console.log(`  ${'TOTAL'.padEnd(18)} ${String(total).padStart(6)}`)

  // ⚠ O `nao_incluido` é IMPRESSO, não ignorado. Ele é a única defesa contra restaurar
  // acreditando ter restaurado tudo, e um campo que ninguém lê não defende nada.
  const naoIncluido = backup.nao_incluido
  console.log('\nO que este backup declara NÃO levar:')
  if (versao === 0) {
    console.log(
      '  (formato anterior ao campo `nao_incluido` — este arquivo NÃO declara os próprios\n' +
        '   limites, e a conferência de contagens abaixo NÃO foi feita. Não é o mesmo que\n' +
        '   "está completo".)',
    )
  } else if (!Array.isArray(naoIncluido) || naoIncluido.length === 0) {
    console.log('  (nada — o backup se declara completo para o que a operação apaga)')
  } else {
    for (const x of naoIncluido) console.log(`  · ${x}`)
  }

  // Conferência de contagens (Decisão 8, forma 1). Só existe a partir da v1.
  if (versao > 0 && backup.contagens) {
    console.log('\nContagens do cabeçalho × linhas no arquivo:')
    for (const [chave, esperado] of Object.entries(backup.contagens)) {
      const real = Array.isArray(backup[chave]) ? backup[chave].length : null
      const marca = real === null ? '—' : real === esperado ? 'ok' : '✗ DIVERGE'
      console.log(`  ${chave.padEnd(18)} cabeçalho=${esperado}  arquivo=${real ?? '—'}  ${marca}`)
    }
  }

  console.log(`\nCópias de .docx deste backup: ${prefixoDasCopias(caminho)}`)

  const sql = montarTransacao(backup, caminho)

  if (!aplicar) {
    console.log(
      '\n--- CONFERÊNCIA (nada foi escrito). Rode de novo com --aplicar para valer. ---',
    )
    console.log(`SQL gerado: ${sql.split('\n').length} linhas.`)
    return
  }

  if (!dbUrl) {
    console.error('\nDATABASE_URL ausente — sem ela não há onde aplicar.')
    process.exit(1)
  }

  const antes = psqlValor(dbUrl, 'select count(*) from public.movimentacoes')
  psql(dbUrl, sql)
  const depois = psqlValor(dbUrl, 'select count(*) from public.movimentacoes')
  const ultima = psqlValor(
    dbUrl,
    "select last_value from pg_sequences where schemaname='public' and sequencename='movimentacoes_ordem_seq'",
  )
  console.log(`\nRestaurado. movimentacoes: ${antes} → ${depois}. Sequência em ${ultima}.`)
}

// Só roda quando invocado direto: o teste importa as funções puras deste arquivo.
if (process.argv[1] && process.argv[1].endsWith('restaurar.mjs')) {
  main().catch((e) => {
    console.error(`\n[restaurar] ${e.message}`)
    process.exit(1)
  })
}

export { REFS_DE_ENSAIO, REFS_DE_PRODUCAO_CONHECIDOS, montarTransacao }
