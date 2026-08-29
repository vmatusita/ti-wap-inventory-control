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

/** As migrations que a F38 acrescentou. */
const DA_F38 = ['0116', '0117', '0118', '0119', '0120', '0121']

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
  it('as seis migrations da fase existem', () => {
    const achadas = arquivosDaFase().map((a) => a.nome.slice(0, 4))
    expect(achadas).toEqual(DA_F38)
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
