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
  // 18/09/2026 (revisão de código, avulsa) — a `0146` recria `aplicar_movimentacao` (intocável)
  // para RECUSAR o estorno de uma devolução cuja pendência de item já teve desfecho — antes o
  // DELETE da pendência estourava a FK NO ACTION de `lancamentos_item.pendencia_item_id` (23503).
  // Entra pela exceção nominal `RECRIACOES_AUTORIZADAS`, mais abaixo.
  '0146',
  // Reauditoria de 18/09/2026, passo 2 (v1.66.3) — as três migrations são COBERTURA: nenhuma
  // cria nem recria função intocável, nenhuma mexe em enum, nenhuma tem DELETE/UPDATE de topo.
  // A `0147` só derruba o índice `itens_nome_uidx`, redundante ao `itens_nome_chave_uidx` (F41a).
  '0147',
  // A `0148` cria `ledger_de_migracoes()`, a leitura do ledger que a sonda de deriva usa (AE).
  '0148',
  // A `0149` cria cinco funções NOVAS `security invoker` que juntam o update em `ativos` e a
  // anotação numa transação só (item U) — nenhuma recria função existente.
  '0149',
  // Reauditoria de 18/09, passo 4 (v1.66.5, item AG) — a `0150` decompõe `aplicar_movimentacao`
  // (intocável) numa orquestradora fina sobre seis auxiliares `movimentacao_*`, pela receita da
  // F51. Entra pela exceção nominal `RECRIACOES_AUTORIZADAS`, e as seis entram em INTOCAVEIS.
  '0150',
  // Revisão de código de 22/09/2026 (v1.66.7) — a `0151` recria QUATRO das cinco escritas
  // atômicas da `0149` (nenhuma é intocável) para reconferir a pré-condição no WHERE do UPDATE.
  // Sem enum, sem DELETE/UPDATE de topo.
  '0151',
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
  // Reauditoria de 18/09, passo 4 (0150, item AG) — as seis auxiliares de
  // `aplicar_movimentacao`. Pela MESMA régua das sucessoras acima: a lista protege o que a
  // função FAZ, e depois da decomposição o que a máquina de estados faz mora nelas. Sem elas,
  // uma migration futura poderia recriar `movimentacao_estornar` com outro corpo e esta guarda
  // — que provava "nenhuma migration mexe no estorno sem exceção declarada" — não diria nada.
  'movimentacao_estornar',
  'movimentacao_pendencia_de_termo_restaurada',
  'movimentacao_desfazer_pendencias_item',
  'movimentacao_abrir_pendencias_item',
  'movimentacao_transicionar',
  'movimentacao_detentor_sincronizado',
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

// ---------------------------------------------------------------------------------------------------
// A LEITURA DO NOME DE UMA ROTINA — um leitor só, para `create` e para `drop` (F60 · revisão do lote 2)
// ---------------------------------------------------------------------------------------------------
// Até a revisão do lote 2 as duas guardas liam o nome por regex, `(?:public\.)?([a-z_][a-z0-9_]*)`, e
// a regex só enxergava nome NU. Medido pelo revisor 3: `drop function public."rel_saldo_itens_filiais"(…)`
// devolvia `["public"]` (o esquema fazia as vezes de nome), `drop function "public"."rel_estoque_asof_filiais"(…)`
// devolvia `[]`, e `drop routine public.rel_mov_itens_filiais(…)` — que no Postgres derruba FUNÇÃO
// tanto quanto `drop function` — nem era lido. As três derrubariam uma intocável com "NENHUMA função
// intocável é derrubada" verde. `create function public."x"(…)` tinha a mesma cegueira desde a F38.
//
// O leitor abaixo lê o que o Postgres lê: `[esquema.]nome`, cada parte NUA (dobrada para minúsculas, como
// o parser faz) ou CITADA (exata, com `""` → `"` — `"Rel_Saldo_Itens"` é OUTRA função, e não pode virar
// `rel_saldo_itens` por excesso de zelo), espaço permitido em volta do ponto. E FALHA FECHADA: o que ele
// não sabe ler (aspa sem fecho, parêntese sem fecho, um `&` de `U&"…"` depois do nome) LANÇA com o
// trecho, em vez de devolver uma lista menor — uma guarda que pula o que não entendeu é a mesma cegueira
// com outra cara. Medido na revisão: sobre as 144 migrations da cadeia, as duas leituras novas devolvem
// EXATAMENTE o que as regex devolviam, e nenhuma lança.

/** O trecho em volta de `i`, numa linha, para a mensagem de falha. */
function ilegivel(sql: string, i: number, comando: string): Error {
  return new Error(`${comando} ilegível para a guarda perto de «${sql.slice(Math.max(0, i - 40), i + 60).replace(/\s+/g, ' ')}»`)
}

function pularEspacos(sql: string, i: number): number {
  while (i < sql.length && /\s/.test(sql[i])) i++
  return i
}

/** Onde termina o citado que abre em `i` (identificador `"…"` ou texto `'…'`, com a aspa dobrada), ou -1. */
function fimDoCitado(sql: string, i: number): number {
  const aspa = sql[i]
  for (let j = i + 1; j < sql.length; j++) {
    if (sql[j] !== aspa) continue
    if (sql[j + 1] === aspa) {
      j++
      continue
    }
    return j + 1
  }
  return -1
}

/** Um identificador em `i`: nu (minúsculas) ou citado (exato). */
function lerIdentificador(sql: string, i: number): { valor: string; fim: number } | null {
  if (sql[i] === '"') {
    const fim = fimDoCitado(sql, i)
    return fim < 0 ? null : { valor: sql.slice(i + 1, fim - 1).replaceAll('""', '"'), fim }
  }
  const nu = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(sql.slice(i, i + 128))
  return nu ? { valor: nu[0].toLowerCase(), fim: i + nu[0].length } : null
}

/** `[esquema.]nome` a partir de `i`: o NOME (a última parte) e onde a leitura parou. */
function lerNomeDeRotina(sql: string, i: number): { nome: string; fim: number } | null {
  let atual = lerIdentificador(sql, pularEspacos(sql, i))
  if (!atual) return null
  for (;;) {
    const ponto = pularEspacos(sql, atual.fim)
    if (sql[ponto] !== '.') return { nome: atual.valor, fim: atual.fim }
    const proximo = lerIdentificador(sql, pularEspacos(sql, ponto + 1))
    if (!proximo) return null
    atual = proximo
  }
}

/** Onde termina o `( … )` que abre em `i`, atravessando citados (um tipo `"char"`, um nome com `)`), ou -1. */
function fimDosParenteses(sql: string, i: number): number {
  let profundidade = 0
  for (let j = i; j < sql.length; j++) {
    const c = sql[j]
    if (c === '"' || c === "'") {
      const fim = fimDoCitado(sql, j)
      if (fim < 0) return -1
      j = fim - 1
    } else if (c === '(') {
      profundidade++
    } else if (c === ')' && --profundidade === 0) {
      return j + 1
    }
  }
  return -1
}

/**
 * Os nomes de função que um SQL DEFINE — só `create [or replace] function`, e só
 * fora de comentário de linha. Comentário citando o nome de uma função (que as
 * migrations desta casa fazem o tempo todo) não conta como recriação. O nome é lido
 * por `lerNomeDeRotina` (nu ou citado, com ou sem esquema), e o que vem depois dele
 * tem de ser a lista de argumentos — senão a leitura LANÇA.
 */
function funcoesDefinidas(sql: string): string[] {
  const texto = semComentarios(sql)
  const nomes: string[] = []
  for (const m of texto.matchAll(/\bcreate\s+(?:or\s+replace\s+)?function\s+/gi)) {
    const lido = lerNomeDeRotina(texto, m.index + m[0].length)
    if (!lido || texto[pularEspacos(texto, lido.fim)] !== '(') throw ilegivel(texto, m.index, '`create function`')
    nomes.push(lido.nome)
  }
  return nomes
}

/**
 * Os nomes de função que um SQL DERRUBA — `drop function|routine [if exists] a[(…)][, b[(…)]…]
 * [cascade|restrict]`, fora de comentário de linha. (F60, PLAN §1.2 (m).)
 *
 * ⚠ POR QUE ELA EXISTE: até a F60 a guarda de intocáveis só lia `create`. A `0145` derruba três
 * intocáveis (`rel_saldo_itens`, `rel_mov_itens`, `rel_estoque_asof`) e passaria sem acusar nada —
 * "nenhuma migration toca uma intocável" continuaria verde com três delas fora do banco. Derrubar é
 * tocar, e mais do que recriar.
 *
 * ⚠ `drop routine` ENTRA, e `drop procedure` não: `routine` derruba função (e procedimento), então é
 * a mesma remoção com outra palavra; `procedure` só derruba procedimento — o Postgres RECUSA
 * `drop procedure` sobre uma função ("is not a procedure"), e as intocáveis são todas funções.
 *
 * A lista é lida por posição, não partida por vírgula: a vírgula ENTRE os tipos fica dentro dos
 * parênteses (atravessados por `fimDosParenteses`, que respeita citados), e a de ENTRE as rotinas é a
 * que sobra depois deles. Os parênteses são opcionais (`drop function x;` vale quando o nome é único).
 */
function funcoesDerrubadas(sql: string): string[] {
  const texto = semComentarios(sql)
  const nomes: string[] = []
  for (const m of texto.matchAll(/\bdrop\s+(?:function|routine)\s+(?:if\s+exists\s+)?/gi)) {
    let i = m.index + m[0].length
    for (;;) {
      const lido = lerNomeDeRotina(texto, i)
      if (!lido) throw ilegivel(texto, m.index, '`drop function`/`drop routine`')
      nomes.push(lido.nome)
      i = pularEspacos(texto, lido.fim)
      if (texto[i] === '(') {
        i = fimDosParenteses(texto, i)
        if (i < 0) throw ilegivel(texto, m.index, '`drop function`/`drop routine`')
        i = pularEspacos(texto, i)
      }
      if (texto[i] === ',') {
        i++
        continue
      }
      if (i >= texto.length || texto[i] === ';' || /^(?:cascade|restrict)\b/i.test(texto.slice(i, i + 9))) break
      throw ilegivel(texto, m.index, '`drop function`/`drop routine`')
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
    // 18/09/2026 — a `0146` recria `aplicar_movimentacao` com o corpo vivo da `0134` mais UM
    // bloco `if exists (…) then raise …` no ramo do estorno. O que a torna aceitável é o DIFF:
    // inserção pura de 11 linhas (3 de comentário), zero removidas — conferido por `diff` contra a
    // `0134` e ensaiado no banco de ensaio em transação desfeita (antes: 23503; depois: a recusa
    // nova; pendência ABERTA continua sendo apagada pelo estorno).
    '0146': ['aplicar_movimentacao'],
    // 21/09/2026 — a `0150` (reauditoria, passo 4, item AG) decompõe `aplicar_movimentacao`
    // numa orquestradora fina sobre SEIS auxiliares que ela CRIA (nome novo) — e que nascem
    // intocáveis (ver INTOCAVEIS). A lista é EXAUSTIVA sobre tudo o que a migration define,
    // como a da `0143`. O que torna a exceção aceitável não é um diff pequeno — o corpo muda
    // inteiro —, é a equivalência provada: `supabase/tests/movimentacao_grade.sql` nasceu num
    // commit SEM a 0150 e deu o MESMO texto, passo a passo, contra a 0146 e contra a 0150 (369
    // passos, md5 idêntico, no CI e no ensaio), e o código foi movido, não reescrito.
    '0150': [
      'aplicar_movimentacao',
      'movimentacao_estornar',
      'movimentacao_pendencia_de_termo_restaurada',
      'movimentacao_desfazer_pendencias_item',
      'movimentacao_abrir_pendencias_item',
      'movimentacao_transicionar',
      'movimentacao_detentor_sincronizado',
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

  // F60 · revisão do lote 2 (revisor 3, achado 2): as três grafias que a regex de nome NU deixava passar
  // — e cada uma derruba uma intocável de verdade no Postgres. Os casos são os que o revisor rodou.
  it.each([
    ['o nome citado', 'drop function public."rel_saldo_itens_filiais"(smallint[], date);', ['rel_saldo_itens_filiais']],
    ['o esquema e o nome citados', 'drop function "public"."rel_estoque_asof_filiais"(smallint[], date);', ['rel_estoque_asof_filiais']],
    ['`drop routine`', 'drop routine public.rel_mov_itens_filiais(smallint[], date, date);', ['rel_mov_itens_filiais']],
    ['`DROP ROUTINE` em maiúsculas, nu, com `cascade`', 'DROP ROUTINE PUBLIC.TRANSFERIR_ITEM(uuid) CASCADE;', ['transferir_item']],
    ['sem a lista de argumentos', 'drop function public.status_tem_detentor;', ['status_tem_detentor']],
    ['espaço em volta do ponto e dos parênteses, com `restrict`', 'drop function if exists public . guarda_acervo ( ) restrict;', ['guarda_acervo']],
    [
      'vírgula e parêntese dentro de citado, tipo citado e tipo com precisão',
      'drop function public.a("char", character varying(10)), public."b,c)"(int), aplicar_movimentacao;',
      ['a', 'b,c)', 'aplicar_movimentacao'],
    ],
  ])('a leitura de `drop` enxerga %s (guarda da guarda)', (_nome, sql, esperado) => {
    expect(funcoesDerrubadas(sql)).toEqual(esperado)
  })

  it('um derrubado citado com OUTRA grafia não vira a intocável (o Postgres distingue, a guarda também)', () => {
    // `"Rel_Saldo_Itens"` é outra função: dobrar o citado para minúsculas acusaria uma remoção que não
    // aconteceu — e ensinaria a desligar a guarda.
    expect(funcoesDerrubadas('drop function "Rel_Saldo_Itens"(smallint, date);')).toEqual(['Rel_Saldo_Itens'])
  })

  it.each([
    ['um `&` depois do nome (o `U&"…"`)', 'drop function public.x & y;'],
    ['aspa sem fecho', 'drop function public."x(int);'],
    ['parêntese sem fecho', 'drop function public.x(int;'],
    ['nome que não é identificador', 'drop routine 42;'],
  ])('a leitura de `drop` LANÇA no que não sabe ler, em vez de devolver menos: %s', (_nome, sql) => {
    expect(() => funcoesDerrubadas(sql)).toThrow(/ilegível para a guarda/)
  })

  it('a leitura de `create function` enxerga o nome citado e LANÇA sem a lista de argumentos (guarda da guarda)', () => {
    expect(
      funcoesDefinidas('create or replace function public."aplicar_movimentacao"(p uuid) returns void language sql as $$ select 1 $$;'),
    ).toEqual(['aplicar_movimentacao'])
    expect(funcoesDefinidas('CREATE FUNCTION "public"."Guarda_Acervo"() returns trigger')).toEqual(['Guarda_Acervo'])
    expect(() => funcoesDefinidas('create function public.x returns void')).toThrow(/ilegível para a guarda/)
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
