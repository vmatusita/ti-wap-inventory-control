import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Guarda de ARQUIVO para a promessa central da F38 (critério 9 da ordem): as
// migrations da fase recriam UMA função existente, e só uma.
//
// POR QUE ESTE TESTE EXISTE, E POR QUE ELE NÃO É md5. O roteiro SQL da fase tinha
// um cenário que comparava `md5(pg_get_functiondef(...))` contra os hashes lidos de
// produção. Ele passou no ensaio e **falhou no job `banco`**, que monta um Postgres
// novo: `pg_get_functiondef` reconstrói o texto, e detalhes de formatação/versão do
// servidor mudam o hash sem que uma linha de corpo tenha mudado. md5 absoluto prova
// "é o mesmo BANCO", não "é a mesma FUNÇÃO".
//
// A pergunta certa é sobre o DIFF, e o diff está no disco: quais funções as
// migrations desta fase recriam? Isso é verificável em qualquer máquina, sem banco
// nenhum, e é o que este teste responde.
//
// (O md5 continua sendo a prova certa onde é comparável — produção antes × depois do
// apply, mesmo servidor. Está em `docs/RELATORIO-F38.md` §5.)

const DIR = join(process.cwd(), 'supabase', 'migrations')

/**
 * As migrations que a F38 acrescentou — INCLUSIVE as de correção posteriores
 * (0122, ordem dos inversos; 0123, ordem dos itens do lote).
 *
 * ⚠ ESTA LISTA É A COBERTURA DO TESTE, e não um registro histórico. Enquanto ela
 * parou em `0121`, a 0122 — que recria DUAS funções — passava inteira por fora de
 * todas as asserções abaixo: podia ter recriado uma intocável, acrescentado valor
 * de enum ou virado `security definer`, e o arquivo continuaria verde. Migration
 * nova da fase entra AQUI no mesmo commit em que nasce.
 *
 * Desde 30/08/2026 a lista passou a receber também migration de FORA da F38 (a
 * `0124`, do fuso do negócio): a asserção "nenhuma migration a partir da 0116 fica
 * de fora" cobra TODAS as posteriores, e essa cobrança é a parte que vale — a
 * migration nova cai sob as guardas de intocáveis, de enum e de DELETE em massa
 * mesmo sem ser da fase. Ler a lista como "o que já passou por estas guardas", e
 * não como o índice da F38.
 */
const DA_F38 = [
  '0116',
  '0117',
  '0118',
  '0119',
  '0120',
  '0121',
  '0122',
  '0123',
  '0124',
  // F41 (31/08/2026) — as três da partição da quantidade. Entram aqui pelo motivo
  // escrito acima: a lista é a COBERTURA, não o índice da F38. É por estar aqui que
  // a 0126 (que recria DUAS funções) passa pelas guardas de intocáveis, de enum, de
  // DELETE/UPDATE em massa e de `security invoker`.
  '0125',
  '0126',
  '0127',
  // F47 (06/09/2026) — a adoção de `_bkp_relatorios_gerados_f6a` no versionamento.
  // Entra aqui pelo mesmo motivo escrito acima: a lista é a COBERTURA, não o índice da
  // F38. Ela não recria função nenhuma, mas passa pelas guardas de DELETE/UPDATE em
  // massa e de `security invoker` como qualquer outra — que é o ponto.
  '0128',
  // F50 (08/09/2026) — `pode_ler_arquivo_termo` + a policy de SELECT do bucket
  // `termos` + os cinco `revoke` de `anon`. Mesmo motivo: a lista é COBERTURA. Ela
  // interessa em particular às guardas de `security invoker` e de intocáveis, porque
  // esta migration MENCIONA `status_apos_movimentacao` (para revogar o EXECUTE dela)
  // sem redefini-la — e é bom que uma varredura confira essa distinção.
  '0129',
  // F50 — o grant que faltava ao lado dos cinco revoke da 0129 (o CI provou a
  // divergencia: em producao o grant explicito ja existia, no banco do CI nao).
  '0130',
]

/** As dez que a ordem nomeia como intocáveis. */
const INTOCAVEIS = [
  'aplicar_movimentacao',
  'guarda_acervo',
  'rel_saldo_itens',
  'rel_mov_itens',
  'rel_estoque_asof',
  'status_apos_movimentacao',
  'status_tem_detentor',
  'transferir_item',
  'criar_compra_lote',
  'devolver_ao_fornecedor',
] as const

function arquivosDaFase(): { nome: string; sql: string }[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.sql') && DA_F38.includes(f.slice(0, 4)))
    .sort()
    .map((nome) => ({ nome, sql: readFileSync(join(DIR, nome), 'utf8') }))
}

/**
 * Os nomes de função que um SQL DEFINE — só `create [or replace] function`, e só
 * fora de comentário de linha. Comentário citando o nome de uma função (que as
 * migrations desta casa fazem o tempo todo) não conta como recriação.
 */
function funcoesDefinidas(sql: string): string[] {
  const semComentario = sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi
  const nomes: string[] = []
  for (const m of semComentario.matchAll(re)) nomes.push(m[1].toLowerCase())
  return nomes
}

describe('migrations da F38 — o critério 9, provado no disco', () => {
  it('toda migration listada como da fase existe no disco', () => {
    const achadas = arquivosDaFase().map((a) => a.nome.slice(0, 4))
    expect(achadas).toEqual(DA_F38)
  })

  // A guarda da guarda: sem ela, esquecer de acrescentar a migration nova em
  // `DA_F38` não quebra nada — só apaga a cobertura em silêncio, que foi
  // exatamente o que aconteceu com a 0122. A última da F37 é a 0115.
  it('nenhuma migration a partir da 0116 fica de fora da lista', () => {
    const posteriores = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql') && /^\d{4}_/.test(f) && f.slice(0, 4) >= '0116')
      .map((f) => f.slice(0, 4))
      .sort()
    expect(posteriores, 'migration nova sem cobertura em DA_F38').toEqual(DA_F38)
  })

  it('NENHUMA função intocável é recriada pelas migrations da fase', () => {
    for (const { nome, sql } of arquivosDaFase()) {
      const definidas = funcoesDefinidas(sql)
      for (const proibida of INTOCAVEIS) {
        expect(definidas, `${nome} recria ${proibida}`).not.toContain(proibida)
      }
    }
  })

  it('a ÚNICA função existente recriada é valida_lancamento_item, e só na 0118', () => {
    const porArquivo = new Map(
      arquivosDaFase().map((a) => [a.nome.slice(0, 4), funcoesDefinidas(a.sql)]),
    )
    expect(porArquivo.get('0118')).toContain('valida_lancamento_item')
    for (const num of DA_F38.filter((n) => n !== '0118')) {
      expect(porArquivo.get(num), `${num} recria valida_lancamento_item`).not.toContain(
        'valida_lancamento_item',
      )
    }
  })

  it('nenhum valor novo de enum entra na fase', () => {
    for (const { nome, sql } of arquivosDaFase()) {
      const semComentario = sql
        .split('\n')
        .filter((l) => !l.trimStart().startsWith('--'))
        .join('\n')
      expect(semComentario, `${nome} acrescenta valor de enum`).not.toMatch(
        /alter\s+type\s+[^;]*add\s+value/i,
      )
    }
  })

  it('nenhuma migration da fase apaga registro do acervo', () => {
    for (const { nome, sql } of arquivosDaFase()) {
      const semComentario = sql
        .split('\n')
        .filter((l) => !l.trimStart().startsWith('--'))
        .join('\n')
      for (const tabela of ['movimentacoes', 'lancamentos_item', 'ativos']) {
        expect(semComentario, `${nome} apaga de ${tabela}`).not.toMatch(
          new RegExp(`delete\\s+from\\s+(public\\.)?${tabela}\\b`, 'i'),
        )
        expect(semComentario, `${nome} atualiza ${tabela} em massa`).not.toMatch(
          new RegExp(`update\\s+(public\\.)?${tabela}\\s+set`, 'i'),
        )
      }
    }
  })

  it('toda função NOVA da fase é declarada security invoker', () => {
    const novas = [
      'criar_movimentacao_com_itens',
      'rel_saldo_colaborador',
      'resolver_pendencias_item_com_lancamentos',
      'reabrir_pendencias_item_com_estornos',
      'estornar_movimentacao_com_itens',
      // F41 — o avulso transacional. Entra na lista para que a exigência valha
      // também para ele: RPC de acervo desta casa é `security invoker`, e a
      // permissão por filial é da policy, nunca de um `definer` que a contorne.
      'lancar_itens_lote',
    ]
    const tudo = arquivosDaFase()
      .map((a) => a.sql)
      .join('\n')
    for (const fn of novas) {
      // O bloco da função vai do `create … function <nome>` até o `$$;` que o fecha.
      const i = tudo.indexOf(`function public.${fn}(`)
      expect(i, `${fn} não foi encontrada nas migrations da fase`).toBeGreaterThan(-1)
      const bloco = tudo.slice(i, tudo.indexOf('$$;', i))
      expect(bloco, `${fn} não declara security invoker`).toMatch(/security\s+invoker/i)
      expect(bloco, `${fn} é security definer`).not.toMatch(/security\s+definer/i)
    }
  })
})
