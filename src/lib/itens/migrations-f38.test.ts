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
  // F51 (08/09/2026) — a decomposição da RPC de import em oito auxiliares. Mesmo
  // motivo de sempre: a lista é COBERTURA. Ela é a PRIMEIRA migration desta faixa
  // a recriar uma função que apaga acervo, e foi ela que expôs o exagero da
  // varredura de DELETE logo abaixo — ver a nota lá.
  '0131',
  // F52 (08/09/2026) — as guardas de escopo no-op. Mesmo motivo de sempre: a lista é
  // COBERTURA, não o índice da F38. Ela interessa em particular às guardas de intocáveis
  // e de DELETE/UPDATE em massa, porque recria DUAS funções cujo corpo contém
  // `delete from public.ativos` (`importar_ativos_substituir` e
  // `apagar_ativos_conflito_filiais`) — e é justamente a distinção "corpo de função que o
  // Postgres GUARDA" vs. "comando que a migration RODA" que a 0131 obrigou a escrever.
  '0132',
  // F53 (09/09/2026) — a ordem total das movimentações. Mesmo motivo de sempre: a lista é
  // COBERTURA. A `0133` é a PRIMEIRA migration desta faixa a fazer UPDATE em massa numa
  // tabela de acervo — ela abre a janela `estoque.dev_destrutivo` para o backfill de
  // `movimentacoes.ordem` e a fecha logo depois, inclusive no caminho de erro. É exatamente
  // o caso que as guardas de UPDATE/DELETE em massa aqui existem para vigiar, e o que a
  // torna aceitável é que o comando é `set ordem = <ranking>`, sem tocar nenhuma outra
  // coluna — provado por hash do par `(id, data, created_at, tipo)` antes e depois.
  '0133',
  // F53 — a `0134` recria `aplicar_movimentacao` (que está em INTOCAVEIS logo abaixo) e
  // `rel_estoque_asof`, trocando UMA linha em cada: o desempate deixa de terminar no uuid
  // de `id`. Nenhuma delas apaga acervo.
  '0134',
  // F53 — a `0135` é só um índice (`data desc, ordem desc`), o que a medição de plano pediu
  // depois que a `0134` trocou a régua da lista. Nenhuma função, nenhum dado.
  '0135',
  // F54 — a `0136` recria `dev_checagens_integridade` (só-leitura, área /dev) para
  // acrescentar a DÉCIMA SEGUNDA checagem: backup órfão em `backups-import`. O diff contra
  // o corpo vigente da `0127` é uma INSERÇÃO PURA de 81 linhas (`120a121,201`), zero
  // removidas — as onze anteriores continuam byte a byte. Nenhum dado tocado.
  '0136',
  // F54 — a `0137` e SO um `comment on column` (o verbo `import_falhou` no vocabulario
  // da trilha). Nao toca dado, nao muda estrutura, nao recria funcao.
  '0137',
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

/** O SQL sem as linhas de comentário `--`. */
function semComentarios(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
}

/**
 * O SQL sem os CORPOS dollar-quoted (`$$ … $$`), isto é: só o que a migration
 * EXECUTA ao ser aplicada. Corpo de função é texto que o Postgres guarda, não
 * comando que ele roda — a distinção que a F51 tornou necessária (ver a asserção
 * de DELETE abaixo, e a "guarda da guarda" que prova que ela não virou peneira).
 */
function semCorposDeFuncao(sql: string): string {
  return sql.replace(/\$\$[\s\S]*?\$\$/g, '\n/* corpo de função */\n')
}

/**
 * Os nomes de função que um SQL DEFINE — só `create [or replace] function`, e só
 * fora de comentário de linha. Comentário citando o nome de uma função (que as
 * migrations desta casa fazem o tempo todo) não conta como recriação.
 */
function funcoesDefinidas(sql: string): string[] {
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi
  const nomes: string[] = []
  for (const m of semComentarios(sql).matchAll(re)) nomes.push(m[1].toLowerCase())
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

  // ⚠ EXCEÇÃO NOMINAL, com o motivo e a migration na MESMA linha (a doutrina dos catálogos
  // da F48, reafirmada pela F52). A régua NÃO foi afrouxada: ela continua reprovando
  // qualquer outra migration que toque uma intocável, e continua reprovando a `0134` se ela
  // recriar uma intocável DIFERENTE das nomeadas aqui. O que mudou é que a exceção passou a
  // ser declarada em vez de impossível — que é o mesmo movimento que a F51 fez uma asserção
  // abaixo, quando o grep cru de DELETE reprovava a `0131` por motivo legítimo.
  //
  // Precisa existir porque recriar `aplicar_movimentacao` NÃO é um efeito colateral da F53:
  // é a fase inteira. A trava do estorno vive dentro dela, desempatava por `id` (um
  // `gen_random_uuid()`) e, medido em produção, apontava a linha errada em 643 dos 1620
  // ativos. O que torna a exceção aceitável é o DIFF, provado por `scripts/db/gerar-0134.mjs`
  // (que deriva o corpo VIGENTE e troca UM trecho, em vez de colar uma cópia que envelhece):
  // 1 linha removida, 1 acrescentada.
  const RECRIACOES_AUTORIZADAS: Record<string, readonly string[]> = {
    // F53 — a `0134` troca o desempate. `aplicar_movimentacao` é intocável; `rel_estoque_asof`
    // não está em INTOCAVEIS, mas é nomeada aqui para que a exceção seja EXAUSTIVA.
    '0134': ['aplicar_movimentacao', 'rel_estoque_asof'],
  }

  it('NENHUMA função intocável é recriada pelas migrations da fase', () => {
    for (const { nome, sql } of arquivosDaFase()) {
      const definidas = funcoesDefinidas(sql)
      const liberadas = RECRIACOES_AUTORIZADAS[nome.slice(0, 4)] ?? []
      for (const proibida of INTOCAVEIS) {
        if (liberadas.includes(proibida)) continue
        expect(definidas, `${nome} recria ${proibida}`).not.toContain(proibida)
      }
    }
  })

  // A guarda da exceção: sem ela, `RECRIACOES_AUTORIZADAS` seria um cheque em branco — bastaria
  // a `0134` recriar mais uma função para passar despercebida. Aqui a lista é EXAUSTIVA: a
  // migration nomeada recria EXATAMENTE o que a exceção declara, nem mais nem menos.
  it('a exceção nominal é exaustiva — a migration liberada não recria nada além do declarado', () => {
    for (const [num, liberadas] of Object.entries(RECRIACOES_AUTORIZADAS)) {
      const arquivo = arquivosDaFase().find((a) => a.nome.startsWith(num))
      expect(arquivo, `${num} está em RECRIACOES_AUTORIZADAS mas não existe no disco`).toBeDefined()
      const definidas = funcoesDefinidas(arquivo!.sql).sort()
      expect(definidas, `${num} recria função fora da exceção declarada`).toEqual(
        [...liberadas].sort(),
      )
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
      expect(semComentarios(sql), `${nome} acrescenta valor de enum`).not.toMatch(
        /alter\s+type\s+[^;]*add\s+value/i,
      )
    }
  })

  it('nenhuma migration da fase apaga registro do acervo AO SER APLICADA', () => {
    // ⚠ A REGRA É SOBRE O QUE EXECUTA NO APPLY, e a distinção passou a importar na
    // F51 (08/09/2026). Até a 0130, a varredura era um grep cru sobre o arquivo
    // inteiro, e funcionava porque nenhuma migration da faixa recriava função
    // destrutiva. A 0131 é a primeira: ela recria `importar_ativos_substituir` e
    // cria `import_apagar_acervo_filial`, cujo corpo TEM `delete from
    // public.ativos` — o import de startup apaga a filial antes de gravar, é o
    // desenho dele desde a 0032. Um `create or replace function` não apaga nada
    // ao ser aplicado; um `delete` de TOPO, sim.
    //
    // O grep cru reprovava a 0131 por motivo legítimo — e gate que nasce vermelho
    // por motivo legítimo é gate que alguém desliga (asserção da F48). A correção
    // não foi afrouxar a régua: foi apontá-la para o que ela sempre quis dizer.
    // Um `delete` de topo continua reprovando, e a asserção logo abaixo prova
    // isso em vez de confiar em quem leu.
    //
    // O mesmo raciocínio, com as mesmas palavras, já estava em
    // `scripts/db/mutacoes.test.mts` (describe 5).
    for (const { nome, sql } of arquivosDaFase()) {
      const deTopo = semCorposDeFuncao(semComentarios(sql))
      for (const tabela of ['movimentacoes', 'lancamentos_item', 'ativos']) {
        expect(deTopo, `${nome} apaga de ${tabela} no apply`).not.toMatch(
          new RegExp(`delete\\s+from\\s+(public\\.)?${tabela}\\b`, 'i'),
        )
        expect(deTopo, `${nome} atualiza ${tabela} em massa no apply`).not.toMatch(
          new RegExp(`update\\s+(public\\.)?${tabela}\\s+set`, 'i'),
        )
      }
    }
  })

  it('a varredura de DELETE ainda reprova um comando de TOPO (guarda da guarda)', () => {
    // Sem esta asserção, a correção acima seria indistinguível de ter desligado a
    // anterior: os dois passam verde num repositório limpo. Aqui a diferença
    // aparece — o `delete` dentro do corpo é ignorado, o de topo não.
    const dentroDoCorpo = [
      'create or replace function public.f() returns void',
      'language plpgsql as $$',
      'begin',
      '  delete from public.ativos where filial_id = 1;',
      'end $$;',
    ].join('\n')
    const noTopo = `${dentroDoCorpo}\n\ndelete from public.ativos where filial_id = 1;\n`

    const re = /delete\s+from\s+(public\.)?ativos\b/i
    expect(semCorposDeFuncao(dentroDoCorpo), 'corpo de função deveria ser ignorado').not.toMatch(re)
    expect(semCorposDeFuncao(noTopo), 'delete de TOPO deveria continuar sendo pego').toMatch(re)
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
