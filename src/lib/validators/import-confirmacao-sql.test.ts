import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { confirmacaoImportConfere, prefixoBackupImport } from '@/lib/validators/importar'

// GUARDA DE SINCRONIA TS↔SQL DA CONFIRMAÇÃO E DO PREFIXO DO IMPORT (F52).
//
// Até esta fase havia DUAS réguas para a mesma pergunta: a Server Action do import comparava
// a confirmação por IGUALDADE EXATA e a RPC não comparava nada — quem chamasse
// `/rest/v1/rpc/importar_ativos_substituir` direto, com a anon key e o próprio JWT, pulava o
// campo de confirmação inteiro. Agora a RPC confere, e as duas pontas precisam responder a
// MESMA coisa.
//
// É a lição que a `0100` aprendeu à força com o digest da seleção: uma régua na tela e outra
// no banco é uma confirmação que ora confere e ora não, e ninguém consegue dizer por quê.
//
// Mesma técnica de `chave-sql.test.ts` (F37), `detentor-sql.test.ts` (F36) e
// `tipos-item-sql.test.ts` (F39): deriva a expressão DIRETO do SQL da migration vigente e
// compara com o TS. O COMPORTAMENTO ponta a ponta é provado por roteiro SQL no CI
// (`supabase/tests/import_fora_da_unidade.sql`, cenários 3a/3b e 2a/2b/2c); aqui a rede é de
// compilação, e ela é a que pega a divergência ANTES do push.

const DIR_MIGRACOES = join(process.cwd(), 'supabase', 'migrations')

// Âncora da DEFINIÇÃO, não do nome: `comment on function`, `revoke` e `grant` também citam a
// função, e um `lastIndexOf` pelo nome cru cairia numa dessas linhas — depois do corpo.
const ANCORA_VALIDAR = 'create or replace function public.import_validar_plano'
const ANCORA_PREFIXO = 'create or replace function public.prefixo_backup_import'

/** A migration VIGENTE de uma função: a de maior número que a define. */
function migrationVigente(ancora: string): { arquivo: string; sql: string } {
  const arquivos = readdirSync(DIR_MIGRACOES)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => readFileSync(join(DIR_MIGRACOES, f), 'utf8').includes(ancora))
    .sort() // prefixo numérico zero-padded ordena lexicograficamente
  const arquivo = arquivos.at(-1)
  if (!arquivo) throw new Error(`nenhuma migration define ${ancora}`)
  return { arquivo, sql: readFileSync(join(DIR_MIGRACOES, arquivo), 'utf8') }
}

describe('a confirmação do import — TS e SQL são UMA régua só (F52)', () => {
  it('a RPC confere a confirmação (antes da F52 ela não conferia NADA)', () => {
    const { sql } = migrationVigente(ANCORA_VALIDAR)
    // A conferência existe, e ela lê a confirmação de DENTRO de p_plano — não de um
    // parâmetro novo, porque parâmetro novo (mesmo com `default`) cria overload.
    expect(sql).toContain("p_plano->>'confirmacao'")
  })

  it('a expressão SQL usa a régua da CASA — upper(btrim(coalesce(...)))', () => {
    const { sql } = migrationVigente(ANCORA_VALIDAR)
    // A régua das oito irmãs destrutivas (0082/0083/0087/0089). Se alguém trocar por
    // igualdade crua, ou por `lower`, ou tirar o `btrim`, esta asserção cai — e cai ANTES
    // do push, que é o ponto.
    expect(sql).toMatch(/upper\(btrim\(coalesce\(v_confirmacao, ''\)\)\)/)
    expect(sql).toMatch(/upper\(btrim\(coalesce\(v_filial_nome, ''\)\)\)/)
  })

  it('a régua NÃO é igualdade exata — o afrouxamento é deliberado', () => {
    const { sql } = migrationVigente(ANCORA_VALIDAR)
    // `upper(btrim())` é ESTRITAMENTE mais permissiva que a igualdade exata que a Server
    // Action usava. É o que garante o critério de não-regressão da fase: tudo o que era
    // aceito ontem continua sendo aceito. Adotar igualdade exata no banco faria o
    // contrário — passaria a recusar o que a tela já aceitava.
    expect(sql).not.toMatch(/v_confirmacao\s*<>\s*v_filial_nome/)
  })

  // A tabela de casos: os dois lados têm de produzir o MESMO veredito. O lado SQL é
  // simulado aqui pela definição da régua (upper + trim), que a asserção acima acabou de
  // provar ser a que está na migration.
  const reguaSql = (digitado: string, esperado: string): boolean => {
    const a = digitado.trim().toUpperCase()
    const b = esperado.trim().toUpperCase()
    // O SQL compara com `<>`: iguais → passa. String vazia dos dois lados passaria no SQL,
    // mas o nome da filial nunca é vazio (`filiais.nome` é not null), e o TS recusa vazio
    // explicitamente — a divergência é conhecida e está coberta pelo caso 'ambos vazios'.
    return a === b
  }

  const CASOS: { digitado: string; esperado: string; nota: string }[] = [
    { digitado: 'Matriz', esperado: 'Matriz', nota: 'idêntico' },
    { digitado: 'matriz', esperado: 'Matriz', nota: 'caixa trocada' },
    { digitado: '  Matriz  ', esperado: 'Matriz', nota: 'espaço nas pontas' },
    { digitado: ' MATRIZ ', esperado: 'Matriz', nota: 'caixa E espaço' },
    { digitado: 'Matriz', esperado: ' Matriz ', nota: 'espaço no esperado' },
    { digitado: 'Matri', esperado: 'Matriz', nota: 'prefixo NÃO basta' },
    { digitado: 'Matrizz', esperado: 'Matriz', nota: 'sufixo NÃO basta' },
    { digitado: 'Ma triz', esperado: 'Matriz', nota: 'espaço no meio NÃO é ignorado' },
    { digitado: 'Filial Norte', esperado: 'Filial Norte', nota: 'nome composto' },
    { digitado: 'filial norte', esperado: 'Filial Norte', nota: 'composto, caixa trocada' },
    { digitado: '', esperado: 'Matriz', nota: 'vazio recusa' },
    { digitado: '   ', esperado: 'Matriz', nota: 'só espaço recusa' },
  ]

  it.each(CASOS)(
    'TS e SQL dão o MESMO veredito: $nota ("$digitado" × "$esperado")',
    ({ digitado, esperado }) => {
      expect(confirmacaoImportConfere(digitado, esperado)).toBe(reguaSql(digitado, esperado))
    },
  )

  it('o único ponto em que os dois lados divergem é o vazio, e ele é inalcançável', () => {
    // O TS recusa explicitamente string vazia (`a !== ''`); a régua SQL, sozinha, aceitaria
    // vazio == vazio. Não é um furo: `filiais.nome` é `not null` e nenhuma filial se chama
    // "". O caso está escrito aqui para que a divergência seja CONHECIDA, e não descoberta.
    expect(confirmacaoImportConfere('', '')).toBe(false)
    expect(reguaSql('', '')).toBe(true)
  })
})

describe('o prefixo do backup do import — TS e SQL são UMA régua só (F52)', () => {
  it('a função SQL devolve import/filial-<id>/', () => {
    const { sql } = migrationVigente(ANCORA_PREFIXO)
    expect(sql).toContain("select 'import/filial-' || p_filial::text || '/'")
  })

  it('a gêmea TS produz exatamente a mesma string', () => {
    // Se as duas divergirem, TODO import passa a ser recusado com "o backup informado não é
    // o backup DESTA filial" — e o caminho estaria certo dos dois lados, só que diferentes.
    for (const id of [1, 2, 5, 42, 114]) {
      expect(prefixoBackupImport(id)).toBe(`import/filial-${id}/`)
    }
  })

  it('o prefixo é por ID, nunca por slug', () => {
    // O slug colide no dia em que deixar de ser único global, e com `upsert:false` o segundo
    // import falharia por causa do primeiro. Esta asserção existe para que trocar de volta
    // para slug seja um teste vermelho, e não uma decisão silenciosa.
    expect(prefixoBackupImport(7)).toMatch(/^import\/filial-\d+\/$/)
  })
})
