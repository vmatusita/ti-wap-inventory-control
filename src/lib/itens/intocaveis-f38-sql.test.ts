import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  corpoVigente,
  definicoesDeFuncao,
  fimDoComando,
  listarMigrations,
  PASTA_MIGRATIONS,
} from '../../../scripts/db/corpo-vigente.mjs'

// =============================================================================
// A TRAVA TS↔SQL DO CENÁRIO 14 (item AD da dívida técnica, 18/09/2026)
// =============================================================================
// POR QUE ELA EXISTE
//
// A guarda de "nenhuma função intocável da F38 ganhou código novo" existe em DOIS
// mecanismos independentes, que não se falam:
//
//   1. TS — `RECRIACOES_AUTORIZADAS` em `migrations-f38.test.ts`, que libera por
//      MIGRATION a recriação de uma intocável (prova por DIFF no disco).
//   2. SQL — o cenário 14 de `supabase/tests/f38_itens_com_ativo.sql`, que varre o
//      corpo VIVO (`pg_get_functiondef`) de dez... treze funções, procurando
//      marcas da F38 por `ilike`, e tira da varredura, por `replace()` de texto
//      LITERAL, os trechos exatos que uma exceção autorizou.
//
// A `0146` entrou só com a exceção do TS (18/09/2026). O CI da `main` caiu no
// cenário 14 — o SQL não sabia da exceção — e o commit `98a78da` acrescentou a do
// SQL, à mão, olhando a mensagem de erro. Duas listas mantidas por duas pessoas
// (ou dois momentos do mesmo Claude) em dois arquivos é exatamente o formato que
// diverge: da PRÓXIMA vez, se alguém acrescentar só a exceção do SQL — ou só a do
// TS — nada AQUI vai acusar. A suíte deste arquivo é isso: a leitura de `git show
// 98a78da` (que arrumou o SQL) virando um teste que reprova ANTES do CI, sem
// precisar de banco.
//
// O QUE ESTA SUÍTE FAZ
//
// Ela lê o TEXTO do cenário 14 (a lista `p.proname in (...)`, os padrões
// `ilike '...'` e as exceções por função `case when p.proname = 'X' then
// replace(replace(..., 'a', ''), 'b', '')`) e reproduz, em TypeScript, a MESMA
// pergunta que o roteiro faz no banco — mas contra o corpo VIGENTE resolvido de
// `supabase/migrations/` via `scripts/db/corpo-vigente.mjs` (F47), sem Postgres.
//
// O QUE ELA NÃO FAZ
//
// Ela não substitui o cenário 14 — que é quem prova o banco de verdade, com
// `pg_get_functiondef` de um Postgres real, no job `banco-sem-docker`. Ela pega
// LOCAL o que hoje só aquele job pegava: se as duas listas divergirem, o
// `npm run test` cai na hora, e ninguém descobre só depois do push.
//
// EXTRAÇÃO, NÃO REESCRITA — E FALHA FECHADA
//
// As funções `blocoDoCenario14`/`listaDeFuncoes`/`padroesIlike`/
// `excecoesPorFuncao` abaixo LEEM o SQL do roteiro; elas não o reescrevem à mão
// aqui dentro. Se o marcador do cenário sumir, se a lista de funções vier vazia
// ou se os padrões `ilike` não forem achados, cada uma LANÇA com uma mensagem
// que diz exatamente o que não achou — nunca devolve uma lista vazia em silêncio
// (uma lista vazia faria a trava desta suíte passar SEMPRE, o oposto do que ela
// promete). É a mesma doutrina de `corpo-vigente.mjs`: "falhar aqui, na mesa e
// sem banco, custa um segundo".
//
// CUIDADO CONHECIDO, CONFERIDO — funções DROPADAS não existem em `pg_proc` e o
// cenário 14 simplesmente não as acha; o espelho de baixo (`resolverFuncao`)
// trata "criada e depois derrubada, sem recriação" como AUSENTE, não como erro
// (as três `rel_*` antigas, sucedidas pelas `_filiais` na F60/`0145`, são
// justamente esse caso — e continuam na lista do cenário 14 hoje). E
// `corpo-vigente.mjs` pode ler pseudo-SQL de um COMENTÁRIO de cabeçalho como se
// fosse corpo real (nota de memória "corpo-vigente lê comentário como SQL",
// medida na F53) — `pareceCorpoDeFuncao` abaixo é a guarda contra isso: se o
// texto resolvido não tiver cara de corpo de função de verdade, a suíte lança em
// vez de avaliar marca sobre lixo. Conferido nesta revisão: as treze funções do
// cenário 14 resolvem hoje para corpo de verdade, nenhuma pega o comentário.
//
// DOIS PONTOS CEGOS FECHADOS NA REVISÃO ADVERSARIAL (18/09/2026) — (1) a segunda
// exceção nominal escrita como ramo do MESMO `case` (`… when p.proname = 'b' then …`,
// sem repetir `case`) não era reconhecida; (2) uma SOBRECARGA nova e limpa de uma
// intocável faria `corpoVigente` (que resolve por nome) devolver só a nova, e a
// antiga — ainda viva em `pg_proc` — deixaria de ser examinada: a trava passaria
// calada. O primeiro agora é lido; o segundo agora PARA a suíte, porque resolver por
// assinatura exigiria também o `drop` por assinatura, e nenhuma das treze tem hoje
// mais de uma. A assinatura é lida por `assinaturaNormalizada`, e não pelos `tipos`
// do `corpo-vigente.mjs`, que deixam o comentário de fim de linha vazar para dentro
// da lista de parâmetros.
//
// SEMÂNTICA DO ILIKE — `%` é qualquer sequência (inclusive vazia e inclusive
// atravessando quebra de linha, porque o corpo de função tem várias), `_` é UM
// caractere qualquer, e a comparação é sem caixa. `regexDoIlike` converte para
// `RegExp` respeitando isso — inclusive o exemplo do próprio pedido da ordem:
// `%pendencia_item_id%` casa `pendenciaXitemXid`.
// =============================================================================

const RAIZ = process.cwd()
const CAMINHO_ROTEIRO = join(RAIZ, 'supabase', 'tests', 'f38_itens_com_ativo.sql')
const ROTEIRO_RELATIVO = 'supabase/tests/f38_itens_com_ativo.sql'
const CAMINHO_MIGRATIONS_TEST_TS = join(RAIZ, 'src', 'lib', 'itens', 'migrations-f38.test.ts')

// -----------------------------------------------------------------------------
// UTILITÁRIOS DE TEXTO (quote-aware — os literais SQL/TS podem trazer vírgula e
// parêntese DENTRO da aspa, como o trecho2 da 0146: "..., FK NO ACTION")
// -----------------------------------------------------------------------------

/** O SQL sem as linhas de comentário `--` (mesma técnica de `migrations-f38.test.ts`). */
function semComentariosSql(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
}

/** Onde termina o `(` que abre em `abre`, contando parênteses e pulando literais `'...'` (com `''` escapado). */
function fimDosParenteses(texto: string, abre: number): number {
  let nivel = 0
  for (let i = abre; i < texto.length; i++) {
    const c = texto[i]
    if (c === "'") {
      i++
      while (i < texto.length) {
        if (texto[i] === "'") {
          if (texto[i + 1] === "'") {
            i += 2
            continue
          }
          break
        }
        i++
      }
      continue
    }
    if (c === '(') nivel++
    else if (c === ')') {
      nivel--
      if (nivel === 0) return i
    }
  }
  return -1
}

/** Divide por vírgula de PRIMEIRO nível, pulando parênteses e literais `'...'`. */
function dividirPorVirgulaDeTopo(texto: string): string[] {
  const partes: string[] = []
  let nivel = 0
  let atual = ''
  let i = 0
  while (i < texto.length) {
    const c = texto[i]
    if (c === "'") {
      atual += c
      i++
      while (i < texto.length) {
        atual += texto[i]
        if (texto[i] === "'" && texto[i + 1] === "'") {
          atual += texto[i + 1]
          i += 2
          continue
        }
        if (texto[i] === "'") {
          i++
          break
        }
        i++
      }
      continue
    }
    if (c === '(') nivel++
    else if (c === ')') nivel--
    if (c === ',' && nivel === 0) {
      partes.push(atual)
      atual = ''
      i++
      continue
    }
    atual += c
    i++
  }
  if (atual.trim() !== '') partes.push(atual)
  return partes
}

/** Um literal `'texto'` (com `''` escapado) — lança se `texto` não for exatamente isso. */
function literalDeString(texto: string, contexto: string): string {
  const m = /^'((?:[^']|'')*)'$/.exec(texto.trim())
  if (!m) {
    throw new Error(
      `intocaveis-f38-sql: esperava um literal 'texto' em ${contexto}, achei «${texto.trim().slice(0, 120)}»`,
    )
  }
  return m[1].replace(/''/g, "'")
}

// -----------------------------------------------------------------------------
// EXTRAÇÃO DO CENÁRIO 14, A PARTIR DO ROTEIRO SQL
// -----------------------------------------------------------------------------

const MARCADOR_CENARIO_14 = /14\s*[—–-]\s*AS FUNÇÕES QUE ESTA FASE PROMETEU NÃO TOCAR/i

/**
 * O texto do comando `select count(*) into v_n ... ;` do cenário 14 — do início
 * do comando até o `;` que o fecha (via `fimDoComando`, que já sabe pular
 * comentário, literal e bloco dollar-quoted; aqui não há dollar-quote, mas há
 * comentário e literal no meio do comando).
 */
export function blocoDoCenario14(sql: string): string {
  const h = sql.search(MARCADOR_CENARIO_14)
  if (h === -1) {
    throw new Error(
      `intocaveis-f38-sql: não achei o marcador do cenário 14 ("14 — AS FUNÇÕES QUE ESTA ` +
        `FASE PROMETEU NÃO TOCAR") em ${ROTEIRO_RELATIVO}. A extração está cega — o título do ` +
        `cenário mudou, ou o cenário foi removido/renumerado. Não dá para inferir a lista de ` +
        `funções nem os padrões de marca sem achar o bloco primeiro; ajuste o marcador aqui.`,
    )
  }
  const inicio = sql.indexOf('select count(*) into v_n', h)
  if (inicio === -1) {
    throw new Error(
      `intocaveis-f38-sql: achei o marcador do cenário 14 em ${ROTEIRO_RELATIVO}, mas não achei ` +
        `"select count(*) into v_n" logo depois — a consulta do cenário mudou de forma.`,
    )
  }
  const fim = fimDoComando(sql, inicio)
  if (fim === -1) {
    throw new Error(
      `intocaveis-f38-sql: a consulta do cenário 14 em ${ROTEIRO_RELATIVO} não fecha com ";" — ` +
        `o scanner de comando ficou preso (literal ou comentário sem fim?).`,
    )
  }
  return sql.slice(inicio, fim)
}

/** As funções em `p.proname in (...)` — lança se não achar a cláusula, ou se a lista vier vazia. */
export function listaDeFuncoes(bloco: string): string[] {
  const limpo = semComentariosSql(bloco)
  const m = /p\.proname\s+in\s*\(/i.exec(limpo)
  if (!m) {
    throw new Error(
      `intocaveis-f38-sql: não achei "p.proname in (" dentro do bloco do cenário 14 — a cláusula ` +
        `da lista de funções mudou de forma.`,
    )
  }
  const abre = m.index + m[0].length - 1
  const fecha = fimDosParenteses(limpo, abre)
  if (fecha === -1) {
    throw new Error(`intocaveis-f38-sql: "p.proname in (" não fecha no bloco do cenário 14.`)
  }
  const nomes = [...limpo.slice(abre + 1, fecha).matchAll(/'([^']*)'/g)].map((mm) => mm[1])
  if (nomes.length === 0) {
    throw new Error(
      `intocaveis-f38-sql: a lista "p.proname in (...)" do cenário 14 veio VAZIA — uma lista vazia ` +
        `faria esta trava passar sempre, então isto é tratado como falha de extração, nunca como ` +
        `"nenhuma função a checar".`,
    )
  }
  return nomes
}

/** Os padrões de `ilike '...'` do bloco — lança se nenhum for achado. */
export function padroesIlike(bloco: string): string[] {
  const limpo = semComentariosSql(bloco)
  const achados = [...limpo.matchAll(/ilike\s+'((?:[^']|'')*)'/gi)].map((mm) => mm[1].replace(/''/g, "'"))
  if (achados.length === 0) {
    throw new Error(
      `intocaveis-f38-sql: nenhum padrão "ilike '...'" foi achado no bloco do cenário 14 — a ` +
        `cláusula WHERE mudou de forma, e uma lista vazia de marcas faria esta trava passar sempre.`,
    )
  }
  return achados
}

/**
 * Onde termina o ramo `then` aberto em `inicio`: o próximo `when` (ramo seguinte do MESMO
 * `case`, escrito sem repetir a palavra `case`) ou `else`, no mesmo nível de parênteses — ou -1.
 * Aceitar o `when` é o que deixa a SEGUNDA exceção nominal ser escrita do jeito natural em SQL
 * (`case when p.proname = 'a' then … when p.proname = 'b' then … else … end`); antes, só o
 * `else` fechava o ramo, e o texto do segundo ramo vazava para dentro do primeiro (revisão
 * adversarial de 18/09/2026).
 */
function acharFimDoRamo(texto: string, inicio: number): number {
  const candidatos = [...texto.matchAll(/\b(?:when|else)\b/gi)].map((m) => m.index).filter((idx) => idx >= inicio)
  for (const idx of candidatos) {
    let nivel = 0
    let i = inicio
    while (i < idx) {
      const c = texto[i]
      if (c === "'") {
        i++
        while (i < idx) {
          if (texto[i] === "'") {
            if (texto[i + 1] === "'") {
              i += 2
              continue
            }
            i++
            break
          }
          i++
        }
        continue
      }
      if (c === '(') nivel++
      else if (c === ')') nivel--
      i++
    }
    if (nivel === 0) return idx
  }
  return -1
}

type Substituicao = { de: string; para: string }

/**
 * Os pares `(de, para)` de uma expressão `replace(replace(pg_get_functiondef(p.oid), 'a', 'b'), 'c', 'd')`,
 * NA ORDEM DE APLICAÇÃO (a `replace` mais interna primeiro — é ela que roda primeiro no Postgres).
 * Generaliza para 1, 2 ou N replaces encadeados; a base `pg_get_functiondef(p.oid)` devolve `[]`.
 */
function substituicoesDaExpressao(expr: string, contexto: string): Substituicao[] {
  const s = expr.trim()
  if (/^pg_get_functiondef\s*\(\s*p\.oid\s*\)$/i.test(s)) return []
  const m = /^replace\s*\(/i.exec(s)
  if (!m) {
    throw new Error(
      `intocaveis-f38-sql: a exceção de ${contexto} não é "replace(...)" nem "pg_get_functiondef(p.oid)" ` +
        `— não sei interpretar «${s.slice(0, 160)}»`,
    )
  }
  const abre = m[0].length - 1
  const fecha = fimDosParenteses(s, abre)
  if (fecha === -1) {
    throw new Error(`intocaveis-f38-sql: os parênteses de replace() não fecham na exceção de ${contexto}.`)
  }
  // O `replace(...)` tem de ser o ramo INTEIRO. Texto sobrando depois do `)` final era
  // ignorado em silêncio — e é justamente por onde um ramo mal delimitado escondia outro.
  const sobra = s.slice(fecha + 1).trim()
  if (sobra !== '') {
    throw new Error(
      `intocaveis-f38-sql: sobrou texto depois do replace(...) na exceção de ${contexto} — ` +
        `«${sobra.slice(0, 120)}». O ramo não termina onde esta leitura acha que termina.`,
    )
  }
  const partes = dividirPorVirgulaDeTopo(s.slice(abre + 1, fecha))
  if (partes.length !== 3) {
    throw new Error(
      `intocaveis-f38-sql: replace() da exceção de ${contexto} tem ${partes.length} argumento(s), ` +
        `esperava 3 (corpo, trecho, substituto) — «${s.slice(0, 160)}»`,
    )
  }
  const [internoTexto, deTexto, paraTexto] = partes
  const de = literalDeString(deTexto, `${contexto} (trecho a remover)`)
  const para = literalDeString(paraTexto, `${contexto} (substituto)`)
  return [...substituicoesDaExpressao(internoTexto, contexto), { de, para }]
}

/**
 * As exceções por função do bloco: cada ramo `when p.proname = 'X' then <replace...>` de um
 * `case … else … end` — com um `case` por função OU vários ramos no mesmo `case`.
 * ⚠ AO CONTRÁRIO de `listaDeFuncoes`/`padroesIlike`, um mapa VAZIO é um resultado válido — nem
 * toda versão do cenário 14 declara exceção (a de antes da `0146`, por exemplo, não tinha
 * nenhuma). Só lança se achar um ramo malformado.
 */
export function excecoesPorFuncao(bloco: string): Map<string, Substituicao[]> {
  const limpo = semComentariosSql(bloco)
  const mapa = new Map<string, Substituicao[]>()
  const re = /\bwhen\s+p\.proname\s*=\s*'([^']*)'\s+then\s+/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(limpo))) {
    const nome = m[1]
    const inicioExpr = m.index + m[0].length
    const fimExpr = acharFimDoRamo(limpo, inicioExpr)
    if (fimExpr === -1) {
      throw new Error(
        `intocaveis-f38-sql: achei "when p.proname = '${nome}' then" no cenário 14, mas não ` +
          `achei o "when"/"else" que fecha o ramo — a exceção de ${nome} está malformada no roteiro SQL.`,
      )
    }
    if (mapa.has(nome)) {
      throw new Error(
        `intocaveis-f38-sql: ${nome} tem DOIS ramos de exceção no cenário 14 — o Postgres usa só o ` +
          `primeiro, e esta leitura não vai adivinhar qual vale. Junte os replace() num ramo só.`,
      )
    }
    mapa.set(nome, substituicoesDaExpressao(limpo.slice(inicioExpr, fimExpr), nome))
  }
  return mapa
}

/** Converte um padrão ILIKE (`%`/`_`, sem caixa) para RegExp — `%` e `_` casam quebra de linha. */
export function regexDoIlike(padrao: string): RegExp {
  let fonte = ''
  for (const ch of padrao) {
    if (ch === '%') fonte += '[\\s\\S]*'
    else if (ch === '_') fonte += '[\\s\\S]'
    else fonte += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${fonte}$`, 'i')
}

// -----------------------------------------------------------------------------
// O ESPELHO DO BANCO: o corpo VIGENTE de cada função, ou "ausente" (nunca criada,
// ou criada e depois DERRUBADA sem recriação — o mesmo que o cenário 14 vê ao não
// achar a função em `pg_proc`).
// -----------------------------------------------------------------------------

const migracoesEmOrdem = listarMigrations(RAIZ)
const cacheDeMigrations = new Map<string, string>()

function lerMigration(arquivo: string): string {
  let sql = cacheDeMigrations.get(arquivo)
  if (sql === undefined) {
    sql = readFileSync(join(RAIZ, ...PASTA_MIGRATIONS, arquivo), 'utf8')
    cacheDeMigrations.set(arquivo, sql)
  }
  return sql
}

/**
 * Os nomes que um `drop function|routine ...` de TOPO derruba num arquivo — versão
 * enxuta, escopada a esta trava (a versão exaustiva, com identificador citado e
 * `drop routine`/`cascade`, é `funcoesDerrubadas` em `migrations-f38.test.ts`; não
 * está exportada de lá, e reimplementá-la por inteiro aqui seria a QUINTA cópia do
 * mesmo leitor. As migrations de hoje só derrubam por nome NU `esquema.nome(...)`,
 * e é só isso que precisa reconhecer para decidir "existe ainda em pg_proc?").
 */
function nomesDerrubadosNoArquivo(sql: string): string[] {
  const texto = semComentariosSql(sql)
  const nomes: string[] = []
  const re = /\bdrop\s+(?:function|routine)\s+(?:if\s+exists\s+)?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) {
    const inicioLista = m.index + m[0].length
    const fimCmd = fimDoComando(texto, m.index)
    const listaTexto = fimCmd === -1 ? texto.slice(inicioLista) : texto.slice(inicioLista, fimCmd - 1)
    for (const item of dividirPorVirgulaDeTopo(listaTexto)) {
      const semArgs = item.split('(')[0]
      const partes = semArgs.split('.')
      const nomeBruto = partes[partes.length - 1]?.trim().replace(/^"+|"+$/g, '')
      if (nomeBruto) nomes.push(nomeBruto.toLowerCase())
    }
    re.lastIndex = fimCmd === -1 ? texto.length : fimCmd
  }
  return nomes
}

/** O arquivo de migration NUMERADO mais alto, com número > `numero`, que derruba `nome` — ou null. */
function foiDerrubadaDepois(nome: string, numero: string): string | null {
  for (const arquivo of migracoesEmOrdem) {
    if (arquivo.slice(0, 4) <= numero) continue
    if (nomesDerrubadosNoArquivo(lerMigration(arquivo)).includes(nome)) return arquivo
  }
  return null
}

/**
 * O corpo resolvido tem cara de corpo de função de verdade? Guarda contra a
 * armadilha medida na F53 (nota "corpo-vigente lê comentário como SQL"):
 * `corpo-vigente.mjs` não distingue `create function` DENTRO de um comentário de
 * cabeçalho (pseudo-SQL de receita de rollback) do `create function` real — ele
 * não tira comentário antes de procurar. Um corpo de verdade desta casa sempre
 * declara `language ...` e, quando plpgsql/sql, um bloco `$$ ... $$`.
 */
export function pareceCorpoDeFuncao(sql: string): boolean {
  return /\blanguage\s+[a-z]+/i.test(sql) && /\$[a-z_]*\$[\s\S]*\$[a-z_]*\$/i.test(sql)
}

/** O texto sem comentário `--` (até o fim da linha) e `/* … *\/`, pulando literais `'...'`. */
function semComentariosEmLinha(texto: string): string {
  let saida = ''
  let i = 0
  while (i < texto.length) {
    const c = texto[i]
    if (c === "'") {
      const fim = texto.indexOf("'", i + 1)
      const ate = fim === -1 ? texto.length : fim + 1
      saida += texto.slice(i, ate)
      i = ate
      continue
    }
    if (c === '-' && texto[i + 1] === '-') {
      const nl = texto.indexOf('\n', i)
      i = nl === -1 ? texto.length : nl
      continue
    }
    if (c === '/' && texto[i + 1] === '*') {
      const fim = texto.indexOf('*/', i + 2)
      i = fim === -1 ? texto.length : fim + 2
      continue
    }
    saida += c
    i++
  }
  return saida
}

/**
 * A assinatura de uma definição `create function <nome>(...)`, normalizada: sem comentário,
 * sem `default …`, sem caixa, com espaço colapsado. Os NOMES dos parâmetros ficam — e isso é
 * seguro, porque o Postgres recusa renomear parâmetro num `create or replace` (quem muda o
 * nome muda a assinatura de verdade, com `drop` antes).
 *
 * POR QUE NÃO `definicoesDeFuncao(...).tipos` do `corpo-vigente.mjs`: aquele leitor NÃO tira o
 * comentário `--` de FIM de linha de dentro da lista de parâmetros, e o texto do comentário
 * (com as vírgulas dele) vaza para os tipos — medido em 18/09/2026: `criar_compra_lote` sai com
 * DUAS "assinaturas" que são uma só, `(jsonb, uuid)`, só porque a `0008` comenta os parâmetros.
 * Só se lê o CABEÇALHO (até o primeiro `$tag$`): o corpo não tem parâmetro nenhum.
 */
export function assinaturaNormalizada(texto: string, nome: string): string {
  const cabecalho = semComentariosEmLinha(texto.split(/\$[a-z_]*\$/i)[0])
  const nomeEscapado = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`\\b${nomeEscapado}\\s*\\(`, 'i').exec(cabecalho)
  if (!m) {
    throw new Error(`intocaveis-f38-sql: não achei "${nome}(" no cabeçalho de uma definição de ${nome}.`)
  }
  const abre = m.index + m[0].length - 1
  const fecha = fimDosParenteses(cabecalho, abre)
  if (fecha === -1) {
    throw new Error(`intocaveis-f38-sql: a lista de parâmetros de ${nome} não fecha o parêntese.`)
  }
  return dividirPorVirgulaDeTopo(cabecalho.slice(abre + 1, fecha))
    .map((p) => p.replace(/\s*(?:\bdefault\b|=)[\s\S]*$/i, '').replace(/\s+/g, ' ').trim().toLowerCase())
    .filter((p) => p !== '')
    .join(', ')
}

/** Cada assinatura distinta que `nome` já teve na cadeia de migrations → os arquivos que a definem. */
function assinaturasNaHistoria(nome: string): Map<string, string[]> {
  const mapa = new Map<string, string[]>()
  for (const arquivo of migracoesEmOrdem) {
    for (const d of definicoesDeFuncao(lerMigration(arquivo))) {
      if (d.nome !== nome) continue
      const sig = assinaturaNormalizada(d.texto, nome)
      mapa.set(sig, [...(mapa.get(sig) ?? []), arquivo.slice(0, 4)])
    }
  }
  return mapa
}

type ResolucaoFuncao = { ausente: true; motivo: string } | { ausente: false; sql: string; numero: string; arquivo: string }

export function resolverFuncao(nome: string): ResolucaoFuncao {
  // ⚠ PONTO CEGO FECHADO (revisão adversarial de 18/09/2026): `corpoVigente` sem tipos devolve
  // o arquivo MAIS RECENTE que define QUALQUER sobrecarga do nome. Se uma migration futura criar
  // uma sobrecarga nova e limpa de uma intocável, a antiga — ainda viva em `pg_proc`, e que o
  // cenário 14 SQL examina, porque `p.proname in (...)` casa todas as sobrecargas — deixaria de
  // ser examinada AQUI, e esta trava passaria calada. Hoje nenhuma das treze tem mais de uma
  // assinatura; se passar a ter, a suíte para ALTO em vez de escolher uma.
  const assinaturas = assinaturasNaHistoria(nome)
  if (assinaturas.size > 1) {
    const vistas = [...assinaturas].map(([sig, arqs]) => `(${sig}) em ${arqs.join(' ')}`).join(' · ')
    throw new Error(
      `intocaveis-f38-sql: ${nome} tem ${assinaturas.size} assinaturas na história das migrations — ` +
        `${vistas}. Esta trava resolve o corpo vigente só pelo NOME e deixaria de examinar uma ` +
        `sobrecarga que o cenário 14 SQL examina. Estenda resolverFuncao para resolver (e derrubar) ` +
        `por assinatura antes de seguir.`,
    )
  }
  let vigente: { sql: string; arquivo: string }
  try {
    vigente = corpoVigente(nome, RAIZ)
  } catch (e) {
    if (e instanceof Error && /nenhuma migration define/.test(e.message)) {
      return { ausente: true, motivo: 'nunca foi definida em nenhuma migration — não existe em pg_proc' }
    }
    throw e
  }
  if (!pareceCorpoDeFuncao(vigente.sql)) {
    throw new Error(
      `intocaveis-f38-sql: o corpo vigente de ${nome} (${vigente.arquivo}) não parece um corpo de ` +
        `função de verdade (sem "language ..." e/ou sem bloco "$$...$$"). corpo-vigente.mjs pode ter ` +
        `lido pseudo-SQL de um COMENTÁRIO de cabeçalho no lugar do corpo real — ver a nota de memória ` +
        `"corpo-vigente lê comentário como SQL" — confira ${vigente.arquivo} à mão antes de confiar ` +
        `nesta trava.`,
    )
  }
  const numero = vigente.arquivo.slice(0, 4)
  const derrubadaEm = foiDerrubadaDepois(nome, numero)
  if (derrubadaEm) {
    return {
      ausente: true,
      motivo: `criada em ${vigente.arquivo}, derrubada depois em ${derrubadaEm} sem recriação — não existe mais em pg_proc`,
    }
  }
  return { ausente: false, sql: vigente.sql, numero, arquivo: vigente.arquivo }
}

// -----------------------------------------------------------------------------
// LEITURA DO LADO TS (`migrations-f38.test.ts`) — as constantes não são
// exportadas de lá (são locais ao `describe`), então este lado lê o TEXTO do
// arquivo, do mesmo jeito que o lado SQL lê o texto do roteiro. Mesma doutrina,
// mesma trava: as duas metades desta suíte leem, nenhuma reescreve.
// -----------------------------------------------------------------------------

/** O trecho balanceado que abre em `aberturaIdx` (`abreChar`/`fechaChar`), pulando literais `'...'`. */
function trechoBalanceadoTs(fonte: string, aberturaIdx: number, abreChar: string, fechaChar: string): string {
  let nivel = 0
  for (let i = aberturaIdx; i < fonte.length; i++) {
    const c = fonte[i]
    if (c === "'") {
      i++
      while (i < fonte.length && fonte[i] !== "'") i++
      continue
    }
    if (c === abreChar) nivel++
    else if (c === fechaChar) {
      nivel--
      if (nivel === 0) return fonte.slice(aberturaIdx, i + 1)
    }
  }
  throw new Error(
    `intocaveis-f38-sql: "${abreChar}...${fechaChar}" não fecha a partir do índice ${aberturaIdx} em ` +
      `migrations-f38.test.ts.`,
  )
}

/** Os literais `'texto'` de dentro de um bloco, com comentário `//`/`/* *​/` removido antes. */
function literaisDoBloco(bloco: string): string[] {
  const semBlocoComentario = bloco.replace(/\/\*[\s\S]*?\*\//g, '')
  const semLinha = semBlocoComentario
    .split('\n')
    .map((l) => {
      const i = l.indexOf('//')
      return i === -1 ? l : l.slice(0, i)
    })
    .join('\n')
  return [...semLinha.matchAll(/'([^']*)'/g)].map((m) => m[1])
}

/** `const NOME = [ ... ] as const` — os literais de string do array. */
export function lerArrayDeConstTs(fonte: string, nomeConst: string): string[] {
  const ancora = `const ${nomeConst} = [`
  const i = fonte.indexOf(ancora)
  if (i === -1) {
    throw new Error(
      `intocaveis-f38-sql: não achei "${ancora}" em migrations-f38.test.ts — a trava TS↔SQL não ` +
        `consegue ler ${nomeConst}; o nome ou a forma da declaração mudou lá.`,
    )
  }
  const abre = i + ancora.length - 1
  const bloco = trechoBalanceadoTs(fonte, abre, '[', ']')
  const nomes = literaisDoBloco(bloco)
  if (nomes.length === 0) {
    throw new Error(`intocaveis-f38-sql: ${nomeConst} veio VAZIA em migrations-f38.test.ts — extração cega.`)
  }
  return nomes
}

/** `const NOME: Record<string, readonly string[]> = { ... }` — os literais que NÃO são chave de 4 dígitos. */
export function lerFuncoesLiberadasTs(fonte: string, nomeConst: string): string[] {
  const marcador = new RegExp(`const\\s+${nomeConst}\\s*:[^=]*=\\s*\\{`)
  const m = marcador.exec(fonte)
  if (!m) {
    throw new Error(
      `intocaveis-f38-sql: não achei a declaração de "${nomeConst}" em migrations-f38.test.ts — a ` +
        `trava TS↔SQL não consegue lê-la.`,
    )
  }
  const abre = m.index + m[0].length - 1
  const bloco = trechoBalanceadoTs(fonte, abre, '{', '}')
  const nomes = literaisDoBloco(bloco).filter((s) => !/^\d{4}$/.test(s))
  if (nomes.length === 0) {
    throw new Error(`intocaveis-f38-sql: ${nomeConst} veio sem NENHUMA função liberada em migrations-f38.test.ts.`)
  }
  return nomes
}

// =============================================================================
// A SUÍTE
// =============================================================================

describe('cenário 14 do roteiro SQL, mirrorado em TS — item AD da dívida técnica', () => {
  const sqlRoteiro = readFileSync(CAMINHO_ROTEIRO, 'utf8')
  const bloco = blocoDoCenario14(sqlRoteiro)
  const funcoes = listaDeFuncoes(bloco)
  const padroes = padroesIlike(bloco)
  const excecoes = excecoesPorFuncao(bloco)
  const regexes = padroes.map((padrao) => ({ padrao, regex: regexDoIlike(padrao) }))

  it('a extração do cenário 14 não veio vazia (guarda da guarda)', () => {
    expect(funcoes.length).toBeGreaterThan(0)
    expect(padroes.length).toBeGreaterThan(0)
  })

  it('nenhuma das funções do cenário 14 carrega marca da F38 no corpo vigente, fora da exceção declarada', () => {
    const violacoes: string[] = []
    for (const nome of funcoes) {
      const resolucao = resolverFuncao(nome)
      if (resolucao.ausente) continue // dropada/nunca criada: o SQL também não a acha em pg_proc

      let corpo = resolucao.sql
      for (const { de, para } of excecoes.get(nome) ?? []) {
        corpo = corpo.split(de).join(para) // replace() do Postgres troca TODAS as ocorrências
      }

      for (const { padrao, regex } of regexes) {
        if (regex.test(corpo)) {
          violacoes.push(
            `a função ${nome}, no corpo vigente (migration ${resolucao.numero}), carrega a marca ` +
              `${padrao} — o cenário 14 de ${ROTEIRO_RELATIVO} vai reprovar no CI; acrescente lá a ` +
              `exceção nominal (replace do trecho exato) no mesmo commit que a migration`,
          )
          break // uma marca já basta para acusar a função
        }
      }
    }
    expect(violacoes, violacoes.length ? `\n${violacoes.join('\n')}` : '').toEqual([])
  })
})

describe('a relação entre o cenário 14 (SQL) e as listas do lado TS (migrations-f38.test.ts)', () => {
  const sqlRoteiro = readFileSync(CAMINHO_ROTEIRO, 'utf8')
  const bloco = blocoDoCenario14(sqlRoteiro)
  const funcoesSql = new Set(listaDeFuncoes(bloco))
  const excecoesSql = excecoesPorFuncao(bloco)

  const fonteTs = readFileSync(CAMINHO_MIGRATIONS_TEST_TS, 'utf8')
  const intocaveisTs = lerArrayDeConstTs(fonteTs, 'INTOCAVEIS')
  const liberadasTs = lerFuncoesLiberadasTs(fonteTs, 'RECRIACOES_AUTORIZADAS')

  // ⚠ INVARIANTE VERIFICADA HOJE, NÃO INVENTADA: a lista de funções que o cenário
  // 14 varre no banco é, byte a byte, a mesma lista que o TS nomeia como
  // INTOCAVEIS (as dez da F38 + as três sucessoras da F60). Elas nasceram
  // separadas (uma no SQL de 30/08, outra no TS na mesma leva) e hoje descrevem
  // exatamente o mesmo conjunto — é essa coincidência de intenção que este teste
  // trava, para que uma acrescentar uma função sem a outra pare de ser silenciosa.
  it('invariante: a lista de funções do cenário 14 (SQL) é o MESMO conjunto que INTOCAVEIS (TS)', () => {
    expect(funcoesSql).toEqual(new Set(intocaveisTs))
  })

  // ⚠ A INVARIANTE INVERSA NÃO VALE HOJE, E NÃO ESTÁ AQUI DE PROPÓSITO: a `0134`
  // está em RECRIACOES_AUTORIZADAS liberando `aplicar_movimentacao` E
  // `rel_estoque_asof`, mas o cenário 14 só tem exceção textual (`case when...`)
  // para `aplicar_movimentacao` — o diff da `0134` em `rel_estoque_asof` (trocar o
  // desempate por `ordem`) nunca introduziu nenhuma das cinco marcas da F38, então
  // não precisou de `replace()` nenhum lá. "toda liberação do TS tem exceção no
  // SQL" seria falso hoje; "toda exceção do SQL tem liberação no TS" é o que se
  // prova abaixo.
  it('invariante: toda função com exceção nominal no cenário 14 (SQL) tem entrada em RECRIACOES_AUTORIZADAS (TS)', () => {
    expect(excecoesSql.size).toBeGreaterThan(0) // guarda da guarda: hoje há pelo menos a da 0146
    for (const nome of excecoesSql.keys()) {
      expect(liberadasTs, `${nome} tem exceção nominal no SQL mas nenhuma entrada em RECRIACOES_AUTORIZADAS`).toContain(nome)
    }
  })
})

// -----------------------------------------------------------------------------
// GUARDA DA GUARDA: a extração lança alto (não devolve vazio) quando o texto que
// ela lê não tem a forma esperada — provado com SQL/TS sintéticos, sem depender
// do estado do repositório.
// -----------------------------------------------------------------------------

describe('a extração falha alto, nunca em silêncio (guarda da guarda)', () => {
  it('blocoDoCenario14 lança quando o marcador do cenário não existe', () => {
    expect(() => blocoDoCenario14('select 1;')).toThrow(/não achei o marcador do cenário 14/)
  })

  it('blocoDoCenario14 lança quando a consulta não fecha com ";"', () => {
    const sql = '-- 14 — AS FUNÇÕES QUE ESTA FASE PROMETEU NÃO TOCAR\nselect count(*) into v_n from pg_proc'
    expect(() => blocoDoCenario14(sql)).toThrow(/não fecha com ";"/)
  })

  it('listaDeFuncoes lança quando "p.proname in (...)" vem vazia', () => {
    expect(() => listaDeFuncoes('where p.proname in () and 1 = 1')).toThrow(/veio VAZIA/)
  })

  it('padroesIlike lança quando não há nenhum "ilike"', () => {
    expect(() => padroesIlike('where p.proname = \'x\'')).toThrow(/nenhum padrão/)
  })

  it('excecoesPorFuncao devolve mapa VAZIO (válido) quando não há nenhum "case when" — não lança', () => {
    expect(excecoesPorFuncao('where f.def ilike \'%x%\'').size).toBe(0)
  })

  it('excecoesPorFuncao lê 1, 2 ou N replaces encadeados, na ordem de aplicação, com vírgula DENTRO do literal', () => {
    const sql = `case when p.proname = 'f' then replace(replace(pg_get_functiondef(p.oid), 'a', ''), 'b, com virgula', 'c') else pg_get_functiondef(p.oid) end`
    const mapa = excecoesPorFuncao(sql)
    expect(mapa.get('f')).toEqual([
      { de: 'a', para: '' },
      { de: 'b, com virgula', para: 'c' },
    ])
  })

  it('excecoesPorFuncao lê DOIS ramos no MESMO case (sem repetir a palavra "case")', () => {
    const sql =
      `case when p.proname = 'funcao_a' then replace(pg_get_functiondef(p.oid), 'marca_a', '') ` +
      `when p.proname = 'funcao_b' then replace(pg_get_functiondef(p.oid), 'marca_b', '') ` +
      `else pg_get_functiondef(p.oid) end`
    const mapa = excecoesPorFuncao(sql)
    expect(mapa.get('funcao_a')).toEqual([{ de: 'marca_a', para: '' }])
    expect(mapa.get('funcao_b')).toEqual([{ de: 'marca_b', para: '' }])
  })

  it('excecoesPorFuncao lança quando sobra texto depois do replace(...) do ramo', () => {
    const sql = `case when p.proname = 'f' then replace(pg_get_functiondef(p.oid), 'a', '') || 'lixo' else pg_get_functiondef(p.oid) end`
    expect(() => excecoesPorFuncao(sql)).toThrow(/sobrou texto depois do replace/)
  })

  it('excecoesPorFuncao lança quando a mesma função tem dois ramos (o Postgres só usaria o primeiro)', () => {
    const sql =
      `case when p.proname = 'f' then replace(pg_get_functiondef(p.oid), 'a', '') ` +
      `when p.proname = 'f' then replace(pg_get_functiondef(p.oid), 'b', '') else pg_get_functiondef(p.oid) end`
    expect(() => excecoesPorFuncao(sql)).toThrow(/DOIS ramos/)
  })

  it('pareceCorpoDeFuncao aceita corpo de verdade e recusa o pseudo-SQL de comentário (armadilha da F53)', () => {
    expect(pareceCorpoDeFuncao('create function f() returns void language plpgsql as $$ begin end $$;')).toBe(true)
    expect(pareceCorpoDeFuncao('create function f() returns void language sql as $fn$ select 1 $fn$;')).toBe(true)
    // sem `language`: é o que sobra quando se lê a receita de rollback de um cabeçalho
    expect(pareceCorpoDeFuncao('create or replace function public.f() ... (corpo da 0134)')).toBe(false)
    // com `language`, mas sem bloco `$$ ... $$`
    expect(pareceCorpoDeFuncao('create function f() returns int language sql immutable')).toBe(false)
  })

  it('assinaturaNormalizada ignora comentário de FIM de linha com vírgula dentro (o caso do criar_compra_lote na 0008)', () => {
    const comComentario =
      'create or replace function public.criar_compra_lote(\n' +
      '  p_itens jsonb,      -- [{patrimonio, service_tag, categoria, marca}]\n' +
      '  p_criado_por uuid\n' +
      ') returns jsonb language plpgsql as $$ begin return null; end $$;'
    const semComentario =
      'create or replace function public.criar_compra_lote(p_itens jsonb, p_criado_por uuid)\n' +
      'returns jsonb language plpgsql as $$ begin return null; end $$;'
    expect(assinaturaNormalizada(comComentario, 'criar_compra_lote')).toBe('p_itens jsonb, p_criado_por uuid')
    expect(assinaturaNormalizada(semComentario, 'criar_compra_lote')).toBe('p_itens jsonb, p_criado_por uuid')
  })

  it('assinaturaNormalizada tira o default e trata a lista vazia (a assinatura das funções de gatilho)', () => {
    expect(assinaturaNormalizada("create function public.f(p_x int default 5, p_y text = 'a') returns void", 'f')).toBe(
      'p_x int, p_y text',
    )
    expect(assinaturaNormalizada('create or replace function public.aplicar_movimentacao() returns trigger', 'aplicar_movimentacao')).toBe('')
  })

  it('regexDoIlike converte % e _ com a semântica real do ILIKE (sem caixa, _ = 1 caractere, % atravessa linha)', () => {
    expect(regexDoIlike('%pendencia_item_id%').test('pendenciaXitemXid')).toBe(true)
    expect(regexDoIlike('%pendencia_item_id%').test('PENDENCIA_ITEM_ID')).toBe(true)
    expect(regexDoIlike('%F38%').test('linha 1\nmenciona F38\nlinha 3')).toBe(true)
    expect(regexDoIlike('%abc%').test('ab')).toBe(false)
  })

  it('lerArrayDeConstTs lança quando a constante não existe no arquivo', () => {
    expect(() => lerArrayDeConstTs('const OUTRA = [1]', 'INTOCAVEIS')).toThrow(/não achei/)
  })

  it('lerFuncoesLiberadasTs separa chave de migration (4 dígitos) de função liberada', () => {
    const fonte = "const X: Record<string, readonly string[]> = { '0134': ['a', 'b'], '0146': ['a'] }"
    // 'a' repete (mesma função liberada em duas migrations, como acontece de verdade com
    // aplicar_movimentacao em 0134 e 0146) — a função não deduplica, e quem lê usa `toContain`.
    expect(new Set(lerFuncoesLiberadasTs(fonte, 'X'))).toEqual(new Set(['a', 'b']))
  })
})
