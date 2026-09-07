#!/usr/bin/env node
// =============================================================================
// diff-tipos.mjs — o GATE DE DERIVA de `src/lib/types/database.ts` (F47)
// =============================================================================
// O buraco que ele fecha: hoje uma migration pode acrescentar coluna e ninguém é
// obrigado a rodar `npm run db:types`. O `database.ts` envelhece em silêncio — e
// não é hipótese: a ata da F41 registra que "o `database.ts` commitado
// simplesmente estava velho, porque nenhuma fase regenerava desde a F38".
//
//     npm run db:types:diff
//     DATABASE_URL=postgresql://… npm run db:types:diff
//
// -----------------------------------------------------------------------------
// COMPARA CONJUNTO, NUNCA `diff -u`
// -----------------------------------------------------------------------------
// De um lado o BANCO (relações, colunas, nomes de função lidos do catálogo); do
// outro o `database.ts` do repositório, lido pelo compilador TypeScript. Reprova
// SÓ quando o banco tem o que o repositório não tem.
//
// A DIREÇÃO CONTRÁRIA É LEGÍTIMA, e por três motivos registrados:
//   1. `__InternalSupabase.PostgrestVersion` vem do SERVIDOR PostgREST, não do
//      catálogo do Postgres — nenhum banco "tem" essa chave.
//   2. O arquivo tem hand-fixes deliberados de nulabilidade (atas de 14/07/2026 e
//      31/08/2026): a CLI é fixada em 2.109.1 porque a 2.110.0 REGRIDE a
//      nulabilidade dos parâmetros das sete RPCs `rel_*`.
//   3. O arquivo é gerado de PRODUÇÃO, e produção tem objeto que nenhuma migration
//      cria — foi o caso de `_bkp_relatorios_gerados_f6a` até a migration 0128
//      desta fase adotá-la.
// Um passo de CI que falha por motivo legítimo é desabilitado na terceira vez. A
// assimetria não é frouxidão: é o que mantém o gate vivo.
//
// -----------------------------------------------------------------------------
// ⚠ O LIMITE HONESTO DESTE GATE
// -----------------------------------------------------------------------------
// Ele compara o `database.ts` com o banco DO CI — o que as migrations constroem.
// A deriva de PRODUÇÃO (um objeto criado à mão no SQL Editor, como a própria
// `_bkp_relatorios_gerados_f6a` foi) continua invisível para ele até alguém rodar
// `npm run db:types`. O que ele garante é o inverso, e isso já é muito: nenhuma
// migration nova entra sem os tipos correspondentes.
//
// -----------------------------------------------------------------------------
// AS REGRAS DE INCLUSÃO, UMA A UMA — e a medição que as decidiu
// -----------------------------------------------------------------------------
// Este gate reproduz o recorte do gerador oficial. Errá-lo produz gate que nasce
// vermelho por motivo legítimo, então cada filtro tem o motivo escrito ao lado, e a
// medição está no `docs/RELATORIO-F47.md`:
//
//   · ESQUEMA: só `public`. Não existe `supabase/config.toml` neste repositório e
//     `scripts/gen-types.ts` nunca passa `--schema`, então o gerador usa o default
//     — que é `public` e nada mais. Bate com o arquivo, que não tem `auth.*`/`storage.*`.
//   · RELAÇÕES: `relkind in ('r','p','v')` — tabela, particionada e VIEW. As views
//     entram porque o gerador as emite em `Database['public']['Views']`, com `Row`;
//     medido: 9 views nas migrations, 9 no `database.ts`.
//   · MATERIALIZED VIEW (`m`) e FOREIGN TABLE (`f`) ficam de FORA. Não existe
//     nenhuma no repositório, e incluí-las sem saber o que o gerador faz com elas
//     seria plantar um vermelho legítimo à espera. Se uma nascer, este filtro é a
//     linha a rever — de propósito, com decisão registrada.
//   · COLUNAS: `attnum > 0 and not attisdropped` — fora as colunas de sistema
//     (`tableoid`, `xmin`) e as dropadas que ainda ocupam um `attnum`.
//   · FUNÇÕES: `prokind = 'f'` e retorno fora de (`trigger`, `event_trigger`). É A REGRA MAIS
//     ARRISCADA DE ERRAR, e por isso foi MEDIDA antes de escrita: as migrations
//     definem 64 funções em `public`; o `database.ts` lista 59; a diferença são
//     EXATAMENTE as cinco que retornam `trigger` (`aplicar_movimentacao`,
//     `guarda_acervo`, `handle_new_user`, `profiles_guarda_dev`,
//     `valida_lancamento_item`). Zero resíduo nas duas direções.
//   · FUNÇÃO COMPARADA POR NOME, não por assinatura: o gerador usa o nome como
//     chave e funde as sobrecargas numa união de tipos.
// =============================================================================

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  compararConjuntos,
  conjuntosDoArquivoDeTipos,
  mensagemDeDeriva,
} from './tipos-conjuntos.mjs'

/**
 * Diagnóstico vai TUDO para stdout — inclusive as linhas `::error::`.
 *
 * ⚠ Não é preferência de estilo. Misturar `console.log` e `console.error` num script de
 * CI produz um log EMBARALHADO: os dois fluxos são bufferizados de forma independente
 * quando a saída é um pipe, e o GitHub Actions os intercala na ordem em que chegam, não
 * na ordem em que foram escritos. Medido na F47 (run 34074976775): a mensagem
 * "O CONTROLE NÃO FECHOU VERDE" apareceu NO MEIO da listagem do controle, quinze linhas
 * antes do ✗ que a causou — o leitor precisa reconstruir a ordem para entender o
 * veredito, e uma ferramenta de diagnóstico com log fora de ordem é uma ferramenta em
 * que se confia menos.
 *
 * `::error::` funciona em stdout: os workflow commands do GitHub Actions são lidos dos
 * dois fluxos.
 */
function erro(msg) {
  console.log(msg)
}

const RAIZ = process.cwd()
const ARQUIVO_TIPOS = join(RAIZ, 'src', 'lib', 'types', 'database.ts')
const URL_PADRAO = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const URL = process.env.DATABASE_URL || URL_PADRAO

/** Relações: tabela (`r`), particionada (`p`) e view (`v`). Ver o cabeçalho. */
const SQL_RELACOES = `
  select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v')
   order by 1`

/**
 * Colunas por relação. `pg_attribute` e não `information_schema.columns`: o
 * information_schema só mostra o que o usuário corrente enxerga por privilégio, e um
 * gate cujo resultado depende de QUEM conectou mede a coisa errada.
 */
const SQL_COLUNAS = `
  select c.relname || '.' || a.attname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v')
     and a.attnum > 0
     and not a.attisdropped
   order by 1`

// ⚠ `event_trigger` entra na exclusão junto com `trigger`, e não é zelo vazio: o
// gerador oficial exclui os DOIS (o filtro dele é `!['trigger','event_trigger']
// .includes(return_type)`). Hoje não existe nenhum `event trigger` neste repositório
// — conferido por grep em `supabase/migrations/` e `supabase/ci/` —, então esta
// metade da regra não muda número nenhum agora. Ela existe para o dia em que alguém
// criar um: sem ela, o gate nasceria vermelho por MOTIVO LEGÍTIMO, e um passo de CI
// que falha por motivo legítimo é desabilitado na terceira vez.
const SQL_FUNCOES = `
  select distinct p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and pg_get_function_result(p.oid) not in ('trigger', 'event_trigger')
   order by 1`

/** Uma coluna, N linhas. */
function listar(sql) {
  const r = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-tA', URL, '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (r.error) {
    erro(`::error::não consegui executar o psql: ${r.error.message}`)
    process.exit(1)
  }
  if (r.status !== 0) {
    erro(`::error::consulta ao catálogo falhou:\n${r.stderr ?? ''}`)
    process.exit(1)
  }
  return (r.stdout ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
}

function main() {
  const banco = {
    relacoes: new Set(listar(SQL_RELACOES)),
    colunas: new Set(listar(SQL_COLUNAS)),
    funcoes: new Set(listar(SQL_FUNCOES)),
  }

  // ⚠ GUARDA CONTRA O GATE VAZIO. Um banco sem relação nenhuma (URL apontando para
  // um Postgres cru, migrations não aplicadas) devolveria conjuntos vazios, e conjunto
  // vazio nunca tem nada que o repositório não tenha: o gate passaria VERDE sem ter
  // medido nada. Verificação que não sabe reprovar é o que a F45 existiu para matar.
  if (banco.relacoes.size < 10 || banco.funcoes.size < 10) {
    erro(
      `::error::o banco tem ${banco.relacoes.size} relação(ões) e ${banco.funcoes.size} função(ões) ` +
        `em \`public\` — isso não é o schema deste projeto. As migrations foram aplicadas em ${URL}?`,
    )
    return 1
  }

  // ⚠ O `throw` do parser tem de passar pela MESMA porta que o resto do diagnóstico.
  // `conjuntosDoArquivoDeTipos` reprova alto quando o formato do `database.ts` muda (o
  // dia em que a CLI do Supabase mudar de versão, que é o cenário para o qual aquela
  // guarda foi escrita). Sem este try/catch a mensagem sairia como stack trace do Node
  // em STDERR — fora do canal que o cabeçalho deste arquivo declara obrigatório, e sem
  // virar anotação `::error::` no Actions. Seria a política que este arquivo documenta
  // sendo furada pelo próprio arquivo.
  let repo
  try {
    repo = conjuntosDoArquivoDeTipos(readFileSync(ARQUIVO_TIPOS, 'utf8'))
  } catch (e) {
    erro(`::error::${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
  const deriva = compararConjuntos(banco, repo)

  console.log('---- gate de deriva de tipos ----')
  console.log(
    `banco ....... ${banco.relacoes.size} relações · ${banco.colunas.size} colunas · ` +
      `${banco.funcoes.size} funções`,
  )
  console.log(
    `database.ts . ${repo.relacoes.size} relações · ${repo.colunas.size} colunas · ` +
      `${repo.funcoes.size} funções`,
  )

  if (!deriva.derivou) {
    // O que o repositório tem A MAIS é legítimo (três motivos no cabeçalho). Sai no log
    // como diagnóstico, nunca como falha — quem lê o CI merece saber o tamanho da folga.
    const aMais = [
      ...[...repo.relacoes].filter((r) => !banco.relacoes.has(r)),
      ...[...repo.funcoes].filter((f) => !banco.funcoes.has(f)),
    ]
    console.log(
      `\nVERDE: o database.ts conhece tudo o que o banco tem.` +
        (aMais.length
          ? `\n(o arquivo tem ${aMais.length} objeto(s) a MAIS — legítimo, ver o cabeçalho ` +
            `de diff-tipos.mjs: ${aMais.join(', ')})`
          : ''),
    )
    return 0
  }

  erro('')
  erro(mensagemDeDeriva(deriva))
  erro('')
  const quantos = deriva.relacoes.length + deriva.colunas.length + deriva.funcoes.length
  erro(`::error::o database.ts está velho: ${quantos} objeto(s) do banco não estão nele.`)
  return 1
}

process.exit(main())
