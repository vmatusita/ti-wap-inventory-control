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
  // F55 (10/09/2026) — a `0138` decompõe `dev_checagens_integridade` em um NÚCLEO
  // (o SQL das doze checagens, movido byte a byte) mais duas portas, e acrescenta
  // `checagens_integridade_resumo` e `rotulo_de_ambiente`. Entra aqui pelo motivo
  // escrito acima: a lista é COBERTURA, não o índice da F38. Ela interessa em
  // particular à guarda de intocáveis (recria UMA função existente e só uma) e à
  // de `security invoker` — as três novas são `security definer`, e as três estão
  // em `supabase/tests/catalogo_secdef.sql` no mesmo commit.
  '0138',
  // F56 · Frente D (11/09/2026) — a `0139` é o vocabulário do import virando dado:
  // uma função IMMUTABLE nova (`vocabulario_chave`), quatro tabelas, um índice de
  // expressão em `filiais` e uma função-gatilho nova (`vocabulario_unidades_guarda`,
  // `security invoker` — não entra na lista de `security definer` nenhuma). Não
  // recria função existente nenhuma (passa pela guarda de intocáveis sem exceção
  // nova), não mexe em enum, e não tem DELETE/UPDATE de topo (é inteiramente
  // aditiva — as quatro tabelas nascem vazias e são semeadas pelo próprio INSERT
  // dela, nunca por um UPDATE em `ativos`/`movimentacoes`/`lancamentos_item`).
  '0139',
  // F56 · Frente F (11/09/2026) — a `0140` recria as TRÊS funções da cadeia do
  // import (`import_apagar_acervo_filial`, `import_revalidar_contagens`,
  // `importar_ativos_substituir`) para tratar os cinco caminhos de FK do fato 27.
  // Nenhuma das três está em INTOCAVEIS — não precisa de exceção nominal. Os
  // quatro UPDATE/DELETE novos (dois UPDATE em `lancamentos_item`, um DELETE em
  // `pendencias_item`, um UPDATE em `ativos`) moram DENTRO do corpo `$$ … $$` de
  // `import_apagar_acervo_filial` — `semCorposDeFuncao` os remove antes da
  // varredura de DELETE/UPDATE em massa, e a guarda é sobre o que o APPLY
  // executa (um `create or replace function`), não sobre o que a função faz
  // quando chamada depois. `import_apagar_acervo_filial` continua a única com
  // `delete from public.ativos` — a trava da F51 (`import-uma-porta.test.ts`)
  // é quem prova isso, não esta lista.
  '0140',
  // F60 · Frente B (16/09/2026) — a `0141` cria UMA função nova de leitura,
  // `rel_contagem_status_filiais(smallint[])` (os KPIs do dashboard numa ida só), com
  // `revoke … from public, anon` e `grant … to authenticated, service_role`. Mesmo motivo de
  // sempre: a lista é COBERTURA. Não recria função existente (passa pela guarda de intocáveis
  // sem exceção), não mexe em enum, não tem DELETE/UPDATE de topo, e entra também na lista de
  // funções NOVAS `security invoker`, mais abaixo.
  '0141',
  // F60 · Frente B (16/09/2026) — a `0142` é só um índice parcial em `lancamentos_item`
  // (`lanc_item_criado_por_idx`, o "último lançamento" de /itens), o que a medição de plano no
  // ensaio pediu (R-REL-33). Mesmo motivo da `0135`: COBERTURA — não cria nem recria função, não
  // mexe em enum, não tem DELETE/UPDATE de topo.
  '0142',
  // F60 · Frente D (16/09/2026) — a `0143` CRIA as sete `rel_*_filiais` (o recorte como lista
  // obrigatória), com `revoke … from public, anon` e `grant … to authenticated, service_role` cada.
  // Três delas SUCEDEM intocáveis (`rel_saldo_itens`, `rel_mov_itens`, `rel_estoque_asof`) e herdam
  // a intocabilidade — por isso a criação passa pela exceção nominal `RECRIACOES_AUTORIZADAS`, e
  // as sete entram na lista de funções novas `security invoker`, mais abaixo.
  '0143',
  // F60 · Frente D — a `0144` é um `create or replace view` de `v_colaboradores_textos` (a chave por
  // nome distinto, mesmas colunas). Mesmo motivo de sempre: COBERTURA — não cria nem recria
  // função, não mexe em enum, não tem DELETE/UPDATE de topo.
  '0144',
  // F60 · Frente D — a `0145` DERRUBA as sete assinaturas velhas das `rel_*`, três delas
  // intocáveis. É a primeira migration desta faixa com `drop function`, e foi ela que mostrou que a
  // guarda de intocáveis só lia `create` (PLAN-F60 §1.2 (m)): um `drop` passaria calado. A guarda
  // agora lê os dois, e o drop mora numa exceção nominal própria, `REMOCOES_AUTORIZADAS`.
  '0145',
]

/**
 * As dez que a ordem da F38 nomeia como intocáveis — e, desde a F60, as SUCESSORAS das três
 * `rel_*` que a `0145` derruba.
 *
 * ⚠ Por que as sucessoras entram: a lista protege o que a função FAZ (o saldo, o movimento de
 * itens, o estado as-of), não uma grafia de nome. Depois do drop, `rel_saldo_itens` não existe
 * mais; se a sucessora ficasse de fora, uma migration futura poderia recriar
 * `rel_saldo_itens_filiais` com outro corpo e esta guarda — que provava "nenhuma migration mexe no
 * saldo sem exceção declarada" — passaria a provar nada. As velhas FICAM na lista: recriar o nome
 * antigo continua sendo um desvio a declarar.
 */
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
  // F60 (0143) — as sucessoras, com o recorte como lista obrigatória.
  'rel_saldo_itens_filiais',
  'rel_mov_itens_filiais',
  'rel_estoque_asof_filiais',
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

/**
 * Os nomes de função que um SQL DERRUBA — `drop function [if exists] a(…)[, b(…)…]`, fora de
 * comentário de linha. (F60, PLAN §1.2 (m).)
 *
 * ⚠ POR QUE ELA EXISTE: até a F60 a guarda de intocáveis só lia `create`. A `0145` derruba três
 * intocáveis (`rel_saldo_itens`, `rel_mov_itens`, `rel_estoque_asof`) e passaria sem acusar nada —
 * "nenhuma migration toca uma intocável" continuaria verde com três delas fora do banco. Derrubar é
 * tocar, e mais do que recriar.
 *
 * A lista de assinaturas de um `drop` pode ter vírgulas DENTRO dos parênteses (os tipos) e ENTRE
 * as funções: os parênteses são esvaziados primeiro (até não sobrar nenhum aninhado), e só então a
 * lista é partida na vírgula.
 */
function funcoesDerrubadas(sql: string): string[] {
  const nomes: string[] = []
  for (const m of semComentarios(sql).matchAll(/drop\s+function\s+(?:if\s+exists\s+)?([^;]*)/gi)) {
    let lista = m[1]
    for (let antes = ''; antes !== lista; ) {
      antes = lista
      lista = lista.replace(/\([^()]*\)/g, '')
    }
    for (const parte of lista.split(',')) {
      const nome = /^\s*(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)/i.exec(parte)?.[1]
      if (nome) nomes.push(nome.toLowerCase())
    }
  }
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
    // F60 — a `0143` CRIA as sete `rel_*_filiais` (nome novo, não `create or replace`). Três são
    // intocáveis desde que nasceram (as sucessoras — ver INTOCAVEIS); as outras quatro são nomeadas
    // para que a exceção seja EXAUSTIVA, como na `0134`. O que a torna aceitável é o diff contra o
    // corpo vivo de cada velha, escrito no cabeçalho dela e provado pela equivalência velho × novo
    // (1.004 células iguais nos dois bancos, PLAN-F60 §8).
    '0143': [
      'rel_mov_por_mes_filiais',
      'rel_por_motivo_filiais',
      'rel_resumo_filiais',
      'rel_frescor_itens_filiais',
      'rel_mov_itens_filiais',
      'rel_saldo_itens_filiais',
      'rel_estoque_asof_filiais',
    ],
  }

  // A MESMA doutrina para o `drop` (F60): exceção NOMINAL, por migration, exaustiva. A `0145`
  // derruba as sete assinaturas velhas das `rel_*` — três delas intocáveis — porque as sucessoras já
  // existem (`0143`) e o app deixou de chamá-las (PLAN-F60 §9, a janela do drop).
  const REMOCOES_AUTORIZADAS: Record<string, readonly string[]> = {
    '0145': [
      'rel_estoque_asof',
      'rel_saldo_itens',
      'rel_mov_itens',
      'rel_frescor_itens',
      'rel_mov_por_mes',
      'rel_por_motivo',
      'rel_resumo',
    ],
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

  it('NENHUMA função intocável é derrubada pelas migrations da fase, fora da exceção nominal (F60)', () => {
    for (const { nome, sql } of arquivosDaFase()) {
      const derrubadas = funcoesDerrubadas(sql)
      const liberadas = REMOCOES_AUTORIZADAS[nome.slice(0, 4)] ?? []
      for (const proibida of INTOCAVEIS) {
        if (liberadas.includes(proibida)) continue
        expect(derrubadas, `${nome} derruba ${proibida}`).not.toContain(proibida)
      }
    }
  })

  it('a exceção de remoção é exaustiva — a migration liberada não derruba nada além do declarado', () => {
    for (const [num, liberadas] of Object.entries(REMOCOES_AUTORIZADAS)) {
      const arquivo = arquivosDaFase().find((a) => a.nome.startsWith(num))
      expect(arquivo, `${num} está em REMOCOES_AUTORIZADAS mas não existe no disco`).toBeDefined()
      expect(funcoesDerrubadas(arquivo!.sql).sort(), `${num} derruba função fora da exceção declarada`).toEqual(
        [...liberadas].sort(),
      )
    }
  })

  // O contrato passa adiante: uma intocável só sai do banco se a SUCESSORA dela (`<nome>_filiais`)
  // nasceu numa migration da fase ANTERIOR ao drop, e é ela mesma intocável. Sem isto, a exceção
  // de remoção deixaria a próxima fase derrubar o saldo de itens sem pôr nada no lugar.
  it('toda intocável derrubada tem a sucessora criada ANTES, e a sucessora é intocável (F60)', () => {
    const fase = arquivosDaFase()
    for (const [i, { nome, sql }] of fase.entries()) {
      for (const derrubada of funcoesDerrubadas(sql).filter((f) => (INTOCAVEIS as readonly string[]).includes(f))) {
        const sucessora = `${derrubada}_filiais`
        expect(INTOCAVEIS as readonly string[], `${nome}: a sucessora de ${derrubada} não é intocável`).toContain(sucessora)
        const criadaAntes = fase.slice(0, i).some((a) => funcoesDefinidas(a.sql).includes(sucessora))
        expect(criadaAntes, `${nome} derruba ${derrubada} sem ${sucessora} criada antes`).toBe(true)
      }
    }
  })

  it('a leitura de `drop function` acha o que o apply derruba, e só isso (guarda da guarda)', () => {
    // Sem esta asserção, uma `funcoesDerrubadas` que devolvesse sempre `[]` deixaria as três acima
    // verdes por vácuo — o mesmo defeito que a guarda tinha antes de ler `drop`.
    const sql = [
      '-- drop function public.status_tem_detentor(public.status_ativo);',
      'drop function public.rel_saldo_itens(smallint, date);',
      'drop function if exists public.guarda_acervo(), transferir_item(uuid, numeric(10, 2), text);',
      'create or replace function public.x() returns void language sql as $$ select 1 $$;',
    ].join('\n')
    expect(funcoesDerrubadas(sql)).toEqual(['rel_saldo_itens', 'guarda_acervo', 'transferir_item'])
    // e a 0145 real é vista inteira (sete), não só a primeira linha
    const real = arquivosDaFase().find((a) => a.nome.startsWith('0145'))
    expect(funcoesDerrubadas(real!.sql)).toHaveLength(7)
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
      // F60 (0141) — os KPIs do dashboard. `rel_*` desta casa é `security invoker` (a RLS de
      // `ativos` vale como valia para o `select` que ela substitui), e a trava do recorte (bloco 7
      // de `catalogo_secdef.sql`) cobra o mesmo no catálogo; aqui a prova é no disco.
      'rel_contagem_status_filiais',
      // F60 (0143) — as sete substitutas das `rel_*` que recortavam por `p_filial`. Mesmo motivo:
      // `security invoker` (o as-of volta a escrever a palavra, que a `0109` perdeu), e o bloco 7
      // (7d) cobra o mesmo no catálogo.
      'rel_mov_por_mes_filiais',
      'rel_por_motivo_filiais',
      'rel_resumo_filiais',
      'rel_frescor_itens_filiais',
      'rel_mov_itens_filiais',
      'rel_saldo_itens_filiais',
      'rel_estoque_asof_filiais',
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
