// =============================================================================
// recorte-rel.mjs — a trava de recorte das RPCs de relatório (F60 · Frente C)
// =============================================================================
// POR QUE ELE EXISTE
//
// A F60 troca `p_filial smallint` com `(p_filial is null or col = p_filial)` por
// `p_filiais smallint[]` com `col = any (p_filiais)` nas sete `rel_*` que recortam
// por filial (R-ACC-71 da emenda F59: "se nulo pode significar 'mostre tudo', a
// forma é proibida"). Este módulo é a metade DE MESA da trava que torna a forma
// velha impossível de voltar: julga o CORPO vivo de toda `public.rel_*`, pelo
// REPLAY das migrations — nunca o banco —, e reprova qualquer uma que não recorte,
// que recorte de um jeito anulável, ou que leia tabela fora do recorte.
//
// O PAR dela é o bloco 7 de `supabase/tests/catalogo_secdef.sql` (o catálogo do
// CI, autoridade sobre fatos de `pg_proc`); as regras de FORMA do corpo (R2–R4)
// ficam só aqui, porque só a mesa tem o léxico e os escopos — `prosrc` é texto,
// não árvore, para função `language sql` clássica (ver o cabeçalho do bloco 7).
//
// AS QUATRO REGRAS (a especificação fechada da fase, `spec-trava.md`)
//
//   R1 — declara: existe um argumento chamado `p_filiais` cujo tipo normaliza
//        para `smallint[]` (aceita `int2[]`, `smallint []`, `_int2`). Argumento
//        `p_filiais` de outro tipo reprova; função sem ele reprova.
//   R2 — liga: toda ocorrência de `p_filiais` no corpo está EXATAMENTE na forma
//        `<colref> = any ( p_filiais )` — nunca dentro de `coalesce`, `nullif`,
//        `case`, lista do `select`, argumento de outra função, ramo de `or` ou
//        sob `not`. E há pelo menos uma ocorrência.
//   R3 — não-anulável: cada `<colref> = any (p_filiais)` é CONJUNÇÃO DIRETA de um
//        `where`/`on`/`having` — não uma disjunção, não dentro de `case`. Aceita o
//        recursivo "grupo entre parênteses que é, ele mesmo, conjunção direta".
//   R4 — escopo das leituras: cada escopo de `select` só lê tabela-base se ele
//        mesmo tem uma ligação R2+R3, ou herda cobertura por estar no from/join
//        (tabela derivada, lateral) ou num where/on/having (exists/in) de um
//        escopo COBERTO. CTE nunca herda; subconsulta na lista do select/group
//        by/order by também não. `TABELAS_SEM_FILIAL` é a exceção de vocabulário.
//
// FALHA FECHADA (o ponto cego da réplica de árvore, que tende a "pular o que não
// entendeu" — a mesma lição de `predicado-policies.mjs`, F59)
//
//   · DDL de `rel_*` montado dinamicamente — `create|alter|drop function` dentro
//     de literal ou de corpo `$…$` de OUTRA função/bloco `do` — reprova com
//     arquivo e linha;
//   · comando de `rel_*` que o replay não consegue ler reprova, nunca é pulado;
//   · a auto-conferência prova que TODO `create|alter|drop function rel_*` (e
//     `alter|drop routine rel_*`) fora de comentário, em toda migration, foi
//     consumido pelo replay;
//   · `routine` é `function` para o replay (revisão do lote 2, F60): no Postgres
//     `alter routine`/`drop routine` agem sobre FUNÇÃO tanto quanto `alter
//     function`/`drop function` — até a revisão, o replay só lia a palavra
//     `function`, e `alter routine <sem recorte>() rename to rel_x` entrava no
//     prefixo com a mesa verde, enquanto `drop routine rel_x(…)` deixava a
//     função VIVA no replay. `create routine` não existe (a rotina nasce por
//     `create function`/`create procedure`), e `procedure` não entra — o
//     Postgres recusa `alter`/`drop procedure` sobre função ("is not a
//     procedure"), a mesma régua de `migrations-f38.test.ts::funcoesDerrubadas`;
//   · `alter function|routine <não-rel>(...) rename to rel_*` FALHA FECHADO: este módulo
//     só rastreia o corpo de funções `rel_*`, então um nome que ENTRA no prefixo
//     por rename vindo de fora dele chega sem corpo conhecido — a especificação
//     (`spec-trava.md`) dá as duas saídas possíveis ("rastreie também as
//     definições não-rel" ou "falhe fechado dizendo que não sabe o corpo"); a
//     escolhida aqui é a mais estrita: falhar, porque o caso não ocorre nas
//     migrations de hoje (medido) e rastrear TODA função do banco só para este
//     caso extremo dobraria o módulo sem necessidade real;
//   · `alter function|routine rel_x(...) set …/security …/strict…` (qualquer coisa além
//     de `rename to` e `owner to`) também FALHA FECHADO pelo mesmo motivo: o
//     módulo não replica o EFEITO desses atributos no corpo, e "refletir sem
//     saber refletir" seria pior que reprovar. `owner to` é ignorado (a
//     especificação permite).
//
// ⚠ ESTE MÓDULO NÃO FALA COM BANCO — roda na mesa, sem Postgres. O consumidor é
// `src/lib/validators/rpcs-recorte-sql.test.ts`.
//
// ⚠ NÃO DUPLICA O LÉXICO: `lexar`/`linhaDe`/`carregarMigrations` vêm por import de
// `predicado-policies.mjs`; `fimDoComando`/`definicoesDeFuncao`/`tipoDoArgumento`
// vêm de `corpo-vigente.mjs`. Os NOMES de argumento (que `definicoesDeFuncao` não
// guarda — só o tipo) são lidos EM PARALELO aqui, com o próprio `lexar` sobre o
// texto que `definicoesDeFuncao` já recortou (`d.texto`), em vez de estender o
// módulo compartilhado — ele fica fora da lista de arquivos que esta ordem toca.
// Pelo mesmo motivo, `executesSuspeitos` (que fala de "policy", não de "function
// rel_*") não é importado: a checagem equivalente para DDL de função dinâmica é
// uma implementação PARALELA, pequena, focada no vocabulário certo.
// =============================================================================

import { lexar, linhaDe, carregarMigrations } from './predicado-policies.mjs'
import { fimDoComando, definicoesDeFuncao, tipoDoArgumento } from './corpo-vigente.mjs'

export { carregarMigrations }

/** O prefixo que define o universo — case-insensitive, com ou sem esquema citado. */
export const PREFIXO_REL = /^rel_/i

/**
 * O texto que a auto-conferência procura fora de comentário (módulo A, item 3 da spec).
 *
 * `routine` entra ao lado de `function` (revisão do lote 2, F60): sem ele, a prova de que
 * "todo DDL de `rel_*` foi consumido" continuava cega para `alter|drop routine rel_*` mesmo
 * com o replay lendo a palavra. O padrão é um SUPERCONJUNTO estrito do anterior — nenhum
 * texto que casava deixou de casar; `create routine rel_…` também casa, e como a forma não
 * existe no Postgres (o replay não a consome) ela só pode reprovar fechado, nunca abrir.
 */
export const PADRAO_DDL_FUNCAO_REL = /\b(create|alter|drop)\s+(or\s+replace\s+)?(function|routine)\s+("?public"?\s*\.\s*)?"?rel_/gi

/**
 * As palavras que, depois de `alter`/`drop`, nomeiam uma FUNÇÃO para o replay. `routine` vale
 * `function` no Postgres para os dois comandos; `procedure` não (recusado sobre função).
 */
const PALAVRAS_DE_FUNCAO = new Set(['function', 'routine'])

/** As tabelas de vocabulário sem `filial_id` (módulo B, regra R4) — com o motivo. */
export const TABELAS_SEM_FILIAL = [
  'itens', // 0014 — catálogo de itens por quantidade, sem coluna de filial
  'motivos', // 0003 — vocabulário De→Para de motivo, sem coluna de filial
  'tipos_item', // 0114 — vocabulário do checklist de devolução, sem coluna de filial
]

export class ErroDeLeituraRecorte extends Error {}

// -----------------------------------------------------------------------------
// Argumentos — tipo já vem de `tipoDoArgumento` (corpo-vigente.mjs); o NOME é
// lido em paralelo aqui, sobre o MESMO texto (`d.texto`), com o léxico importado.
// -----------------------------------------------------------------------------

/** Palavras de MODO de argumento — não fazem parte do nome nem do tipo. */
const MODOS_ARGUMENTO = new Set(['in', 'out', 'inout', 'variadic'])

function nomeToken(t) {
  if (!t) return null
  if (t.tipo === 'ident') return t.v
  if (t.tipo === 'qident') return t.v.toLowerCase()
  return null
}

/**
 * Os argumentos de uma definição de função (`definicoesDeFuncao`), com NOME e
 * tipo normalizado — releitura em paralelo do texto já recortado, usando o
 * léxico importado (nunca duplicado): acha a lista `(…)` por TOKENS (respeita
 * string/comentário/`$…$` porque `lexar` já respeita), separa por vírgula de
 * profundidade 0 e aplica `tipoDoArgumento` ao grupo INTEIRO de cada argumento
 * (com o nome, se houver) — exatamente como `definicoesDeFuncao` já faz, só que
 * aqui também guardamos qual token era o nome.
 * @param {string} textoCreate o `d.texto` de uma entrada de `definicoesDeFuncao`
 * @returns {{ nome: string|null, tipo: string }[]}
 */
export function argumentosComNome(textoCreate) {
  const { tokens } = lexar(textoCreate)
  const abre = tokens.findIndex((t) => t.tipo === 'punct' && t.v === '(')
  if (abre === -1) return []
  let prof = 0
  let fecha = -1
  for (let j = abre; j < tokens.length; j++) {
    const t = tokens[j]
    if (t.tipo === 'punct' && t.v === '(') prof++
    else if (t.tipo === 'punct' && t.v === ')') {
      prof--
      if (prof === 0) {
        fecha = j
        break
      }
    }
  }
  if (fecha === -1 || fecha === abre + 1) return []

  const argTokens = tokens.slice(abre + 1, fecha)
  const grupos = []
  let atual = []
  let p = 0
  for (const t of argTokens) {
    if (t.tipo === 'punct' && (t.v === '(' || t.v === '[')) p++
    else if (t.tipo === 'punct' && (t.v === ')' || t.v === ']')) p--
    if (t.tipo === 'punct' && t.v === ',' && p === 0) {
      grupos.push(atual)
      atual = []
      continue
    }
    atual.push(t)
  }
  if (atual.length > 0) grupos.push(atual)

  return grupos.map((g) => {
    let i = 0
    if (nomeToken(g[i]) !== null && MODOS_ARGUMENTO.has(nomeToken(g[i]))) i++
    const textoGrupo = g.length > 0 ? textoCreate.slice(g[0].ini, g.at(-1).fim) : ''
    const tipo = tipoDoArgumento(textoGrupo.slice(g[i]?.ini !== undefined ? g[i].ini - g[0].ini : 0))
    // O NOME existe quando, IGNORANDO o modo, sobra mais de um token e o
    // primeiro deles é identificador simples — o mesmo critério de
    // `tipoDoArgumento`, só que devolvendo a metade que ele descarta.
    const restoSemModo = g.slice(i)
    let nome = null
    if (restoSemModo.length > 1 && nomeToken(restoSemModo[0]) !== null && /^[a-z_][a-z0-9_]*$/i.test(nomeToken(restoSemModo[0]))) {
      // confirma que o tipoDoArgumento também concorda que há nome (ele checa
      // se o segundo token não CONTINUA um tipo composto, ex. "character varying")
      const textoSemModo = textoCreate.slice(restoSemModo[0].ini, restoSemModo.at(-1).fim)
      const tipoSemModo = tipoDoArgumento(textoSemModo)
      const textoSoTipo = textoCreate.slice(restoSemModo[1].ini, restoSemModo.at(-1).fim)
      if (tipoSemModo.toLowerCase() === tipoDoArgumento(textoSoTipo).toLowerCase()) {
        nome = nomeToken(restoSemModo[0])
      }
    }
    return { nome, tipo }
  })
}

/** O tipo aceito por R1, normalizado — `smallint[]`, `int2[]`, `smallint []`, `_int2`. */
export function ehTipoRecorte(tipo) {
  const s = tipo.trim().toLowerCase().replace(/\s+/g, '')
  return s === 'smallint[]' || s === 'int2[]' || s === '_int2'
}

// -----------------------------------------------------------------------------
// O replay — o universo VIVO de `public.rel_*`, na ordem das migrations
// -----------------------------------------------------------------------------

function nomeDeToken(t) {
  return t && (t.tipo === 'ident' || t.tipo === 'qident') ? (t.tipo === 'qident' ? t.v.toLowerCase() : t.v) : null
}

/** Nome qualificado a partir de `tk[i]` — schema implícito `public`. `{ schema, nome, prox }`. */
function nomeQualificado(tk, i) {
  const primeiro = nomeDeToken(tk[i])
  if (primeiro === null) return null
  if (tk[i + 1]?.tipo === 'punct' && tk[i + 1].v === '.' && nomeDeToken(tk[i + 2]) !== null) {
    return { schema: primeiro, nome: nomeDeToken(tk[i + 2]), prox: i + 3 }
  }
  return { schema: 'public', nome: primeiro, prox: i + 1 }
}

/**
 * Substitui, no texto ISOLADO de um comando `create function`, o trecho do
 * nome qualificado (`tk[j]`..`tk[q.prox-1]`) pela forma NUA já normalizada por
 * `nomeQualificado` (`q.schema`/`q.nome`, minúsculos, sem aspas) — preservando
 * tudo antes e depois byte a byte. Não muda nada quando o nome já vem sem
 * aspas (a troca é idempotente: mesmo texto, só minúsculo). Usada só para
 * alimentar `definicoesDeFuncao`, que não lê `"nome"` citado (RE_FUNCAO exige
 * identificador nu) — nunca para decidir se a função é `rel_*` (isso já foi
 * decidido acima, por `nomeQualificado`, que respeita `qident`).
 * @param {string} sql
 * @param {{ini:number, fim:number}[]} tk
 * @param {number} j índice do primeiro token do nome (schema ou função)
 * @param {{schema:string, nome:string, prox:number}} q
 * @param {string} textoComandoBruto `sql.slice(tk[0].ini, fimDoComando)`
 */
function normalizarNomeQualificadoNoTexto(sql, tk, j, q, textoComandoBruto) {
  const antes = sql.slice(tk[0].ini, tk[j].ini)
  const nomeNormalizado = q.prox === j + 1 ? q.nome : `${q.schema}.${q.nome}`
  const depois = sql.slice(tk[q.prox - 1].fim, tk[0].ini + textoComandoBruto.length)
  return antes + nomeNormalizado + depois
}

/** O trecho `(…)` a partir do `(` em `tk[i]` — texto e o índice do token seguinte. */
function tiposEntreParenteses(tk, i, sqlArquivo) {
  if (!(tk[i]?.tipo === 'punct' && tk[i].v === '(')) return null
  let prof = 0
  for (let j = i; j < tk.length; j++) {
    const t = tk[j]
    if (t.tipo !== 'punct') continue
    if (t.v === '(') prof++
    else if (t.v === ')') {
      prof--
      if (prof === 0) return { texto: sqlArquivo.slice(tk[i].fim, t.ini), prox: j + 1 }
    }
  }
  return null
}

/** Os tipos de uma lista de argumentos já em TEXTO (assinatura de `drop`/`alter`), via `tipoDoArgumento`. */
function tiposDaListaTexto(texto) {
  const partes = []
  let nivel = 0
  let atual = ''
  for (const c of texto) {
    if (c === '(' || c === '[') nivel++
    else if (c === ')' || c === ']') nivel--
    if (c === ',' && nivel === 0) {
      partes.push(atual)
      atual = ''
      continue
    }
    atual += c
  }
  if (atual.trim() !== '') partes.push(atual)
  return partes.map((p) => p.trim()).filter((p) => p !== '').map(tipoDoArgumento)
}

const assinaturaDe = (schema, nome, tipos) => `${schema}.${nome}(${tipos.join(',')})`

/**
 * Reproduz, em ordem, o que as migrations fazem com `public.rel_*` (e detecta,
 * fail-closed, um rename de FORA do prefixo para dentro dele).
 * @param {{ arquivo: string, sql: string }[]} migrations
 */
export function replayFuncoesRel(migrations) {
  /** @type {Map<string, { esquema: string, nome: string, argumentos: {nome:string|null, tipo:string}[], corpo: string, definicao: string, arquivo: string, linha: number }>} */
  const vivas = new Map()
  const falhas = []
  let consumidos = 0
  let encontrados = 0

  for (const { arquivo, sql } of migrations) {
    const falhar = (pos, motivo) => falhas.push({ arquivo, linha: linhaDe(sql, pos), motivo })
    const inicios = new Set()
    const literais = []
    const semComentario = sql.split('')

    let i = 0
    while (i < sql.length) {
      const fimC = fimDoComando(sql, i)
      const ate = fimC === -1 ? sql.length : fimC
      let lexado
      try {
        lexado = lexar(sql.slice(i, ate), i)
      } catch (err) {
        falhar(i, `o léxico não leu o comando: ${err.message}`)
        i = ate
        continue
      }
      for (const [a, b] of lexado.comentarios) for (let k = a; k < b; k++) semComentario[k] = ' '
      for (const t of lexado.tokens) if (t.tipo === 'str' || t.tipo === 'dollar') literais.push(t)
      const tk = lexado.tokens.filter((t) => !(t.tipo === 'punct' && t.v === ';'))
      if (tk.length > 0) {
        const consumiu = aplicarComandoFuncao(tk, sql, arquivo, vivas, falhar)
        if (consumiu) {
          consumidos++
          inicios.add(tk[0].ini)
        }
      }
      i = ate
    }

    // O `execute`/`format` DENTRO de corpo `$…$` de OUTRA função ou bloco `do`:
    // o replay não sabe o que ele monta. Réplica focada (não importa
    // `executesSuspeitos`, que fala de "policy") — falha fechada quando o corpo
    // menciona "function" E "rel_" (o par que indicaria DDL de rel_* dinâmico),
    // ou quando o `execute` não está na forma segura (só %I/%L/%%, sem
    // concatenação nem verbo parametrizado).
    for (const t of literais) {
      if (t.tipo !== 'dollar') continue
      const tag = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(t.ini))?.[0] ?? '$$'
      for (const p of executesSuspeitosFuncaoRel(t.v)) falhar(t.ini + tag.length + p.pos, p.motivo)
    }

    // AUTO-CONFERÊNCIA: todo `create|alter|drop function rel_*` (e `alter|drop
    // routine rel_*`) fora de comentário foi consumido — ou mora em literal/`$…$` e já reprovou acima
    // como DDL dinâmico, ou é algo que o replay não soube dividir.
    const limpo = semComentario.join('')
    for (const m of limpo.matchAll(PADRAO_DDL_FUNCAO_REL)) {
      encontrados++
      if (inicios.has(m.index)) continue
      const dentro = literais.find((t) => m.index >= t.ini && m.index < t.fim)
      if (dentro) {
        falhar(
          m.index,
          `DDL de rel_* montado dinamicamente ("${m[0]}" dentro de ${dentro.tipo === 'dollar' ? 'corpo $…$' : 'literal'}) — o replay não sabe o que ele cria; escreva o comando por extenso na migration`,
        )
      } else {
        falhar(m.index, `"${m[0]}" fora de comentário que o replay não consumiu`)
      }
    }
  }

  return { vivas, consumidos, encontrados, falhas }
}

/**
 * Os `execute` de um corpo `$…$` que a trava não prova inofensivos para as
 * `rel_*` — a mesma doutrina de `predicado-policies.mjs::executesSuspeitos`,
 * com o vocabulário trocado de "policy" para "function"+"rel_".
 * @param {string} corpo
 * @returns {{ pos: number, motivo: string }[]}
 */
export function executesSuspeitosFuncaoRel(corpo) {
  let lexado
  try {
    lexado = lexar(corpo)
  } catch {
    return []
  }
  const tk = lexado.tokens
  const achados = []
  const execs = tk.map((t, i) => [t, i]).filter(([t]) => t.tipo === 'ident' && t.v === 'execute')
  if (execs.length === 0) return achados

  const codigo = corpo.split('')
  for (const [a, b] of lexado.comentarios) for (let k = a; k < b; k++) codigo[k] = ' '
  const decodificados = tk.filter((t) => t.tipo === 'str' || t.tipo === 'dollar').map((t) => t.v).join('')
  const textoTotal = (codigo.join('') + decodificados).toLowerCase().replace(/['"\s|]/g, '')
  if (textoTotal.includes('rel_')) {
    achados.push({
      pos: execs[0][0].ini,
      motivo:
        'corpo com "execute" que menciona "rel_" (mesmo partida entre literais ou numa variável) — DDL de rel_* montado dinamicamente não é lido pelo replay; escreva o comando por extenso na migration',
    })
  }
  const fim = (i) => tk[i] === undefined || (tk[i].tipo === 'punct' && tk[i].v === ';') || (tk[i].tipo === 'ident' && ['using', 'into'].includes(tk[i].v))
  for (const [t, i] of execs) {
    if (tk[i - 1]?.tipo === 'ident' && ['grant', 'revoke'].includes(tk[i - 1].v)) continue
    if (tk[i + 1]?.tipo === 'ident' && ['function', 'procedure'].includes(tk[i + 1].v)) continue
    const a = tk[i + 1]
    let ok = false
    if (a?.tipo === 'str') {
      ok = fim(i + 2)
    } else if (a?.tipo === 'ident' && a.v === 'format' && tk[i + 2]?.v === '(' && tk[i + 3]?.tipo === 'str') {
      const semEscapes = tk[i + 3].v.replace(/%%/g, '')
      const soIdentELiteral = !/%(?!\d*\$?[IL])/.test(semEscapes)
      let prof = 0
      let j = i + 2
      for (; j < tk.length; j++) {
        if (tk[j].tipo === 'punct' && tk[j].v === '(') prof++
        else if (tk[j].tipo === 'punct' && tk[j].v === ')' && --prof === 0) break
      }
      ok = soIdentELiteral && fim(j + 1)
    }
    if (!ok) {
      achados.push({
        pos: t.ini,
        motivo:
          'execute de SQL que a trava não lê — só passa execute \'<literal>\' ou execute format(\'<literal>\', …) com %I/%L, sem %s e sem concatenação; DDL de rel_* num laço é o ponto cego que esta falha fechada existe para barrar',
      })
    }
  }
  return achados
}

/**
 * Aplica UM comando (já tokenizado, sem `;`) ao mapa de vivas. Devolve `true`
 * quando o comando é relevante para `rel_*` (contado em `consumidos`).
 *
 * `drop`/`alter` seguidos de `function` OU `routine` caem no MESMO caminho — a
 * palavra só muda a mensagem (`PALAVRAS_DE_FUNCAO`).
 */
function aplicarComandoFuncao(tk, sql, arquivo, vivas, falhar) {
  const p0 = nomeDeToken(tk[0])
  if (p0 === 'create') return criarFuncao(tk, sql, arquivo, vivas, falhar)
  const palavra = nomeDeToken(tk[1])
  if (!PALAVRAS_DE_FUNCAO.has(palavra)) return false
  if (p0 === 'drop') return dropFuncao(tk, sql, arquivo, vivas, falhar, palavra)
  if (p0 === 'alter') return alterFuncao(tk, sql, arquivo, vivas, falhar, palavra)
  return false
}

function criarFuncao(tk, sql, arquivo, vivas, falhar) {
  // tk pode começar em "create function" OU "create or replace function".
  let j
  if (tk[1]?.v === 'or' && tk[2]?.v === 'replace' && nomeDeToken(tk[3]) === 'function') j = 3
  else if (nomeDeToken(tk[1]) === 'function') j = 1
  else return false // "create" de outra coisa (table, policy, index…) — irrelevante aqui
  j++ // agora aponta para o nome
  const q = nomeQualificado(tk, j)
  if (!q) {
    falhar(tk[0].ini, `comando "create function" ilegível para o replay — a trava não pula o que não lê`)
    return true
  }
  const relevante = PREFIXO_REL.test(q.nome)
  const args = tiposEntreParenteses(tk, q.prox, sql)
  if (!args) {
    falhar(tk[0].ini, `comando "create function ${q.nome}" sem lista de argumentos legível`)
    return true
  }
  if (!relevante) return false // não é rel_*: comando ignorado, não conta como consumido

  // Reusa `definicoesDeFuncao` sobre o TEXTO deste comando isolado — ela já sabe
  // separar tipos e extrair o corpo (`texto`), a mesma API que `corpoVigente` usa.
  //
  // ⚠ `definicoesDeFuncao` (corpo-vigente.mjs, RE_FUNCAO) só casa identificador
  // NU (`[a-z_][a-z0-9_]*`) — um nome CITADO (`"rel_x"`) não casaria e o comando
  // cairia no "formato inesperado" abaixo, falhando fechado mas pelo motivo
  // errado (achado da revisão adversarial, F60: módulo A exige "nome citado ou
  // não"). Em vez de tocar o módulo compartilhado (usado por `mutacoes.mjs` e
  // fora do escopo desta ordem), normalizamos AQUI, só neste texto isolado, as
  // aspas do nome/esquema que `nomeQualificado` (que já sabe ler `qident`) já
  // reconheceu — o resto do comando (corpo, tipos) segue byte a byte.
  const textoComandoBruto = sql.slice(tk[0].ini, (tk.at(-1)?.fim ?? tk[0].fim) + 1)
  const textoComando = normalizarNomeQualificadoNoTexto(sql, tk, j, q, textoComandoBruto)
  const defs = definicoesDeFuncao(textoComando).filter((d) => d.nome === q.nome.toLowerCase() && d.esquema === q.schema.toLowerCase())
  if (defs.length === 0) {
    falhar(
      tk[0].ini,
      `"create function ${q.nome}" reconhecido pelo replay léxico, mas definicoesDeFuncao não o leu — formato inesperado (verifique parênteses/tipos; nome citado já é normalizado antes desta chamada)`,
    )
    return true
  }
  const def = defs[defs.length - 1]
  const argumentos = argumentosComNome(def.texto)
  const dollar = lexarPrimeiroDollar(def.texto)
  const chave = assinaturaDe(q.schema, q.nome, def.tipos)
  vivas.set(chave, {
    esquema: q.schema,
    nome: q.nome,
    argumentos,
    corpo: dollar,
    definicao: def.texto,
    arquivo,
    linha: linhaDe(sql, tk[0].ini),
  })
  return true
}

function lexarPrimeiroDollar(textoCreate) {
  const { tokens } = lexar(textoCreate)
  const t = tokens.find((tk) => tk.tipo === 'dollar')
  return t ? t.v : ''
}

function dropFuncao(tk, sql, arquivo, vivas, falhar, palavra) {
  let j = 2
  let seExiste = false
  if (tk[j]?.v === 'if' && tk[j + 1]?.v === 'exists') {
    seExiste = true
    j += 2
  }
  let algumRelevante = false
  for (;;) {
    const q = nomeQualificado(tk, j)
    if (!q) {
      falhar(tk[0].ini, `comando "drop ${palavra}" ilegível para o replay — a trava não pula o que não lê`)
      return true
    }
    const args = tiposEntreParenteses(tk, q.prox, sql)
    j = args ? args.prox : q.prox
    const relevante = PREFIXO_REL.test(q.nome)
    if (relevante) {
      algumRelevante = true
      const tipos = args ? tiposDaListaTexto(args.texto) : []
      const chave = assinaturaDe(q.schema, q.nome, tipos)
      if (!vivas.delete(chave) && !seExiste) {
        falhar(tk[0].ini, `drop ${palavra} de uma rel_* que o replay não conhece (${chave}) — o Postgres recusaria`)
      }
    }
    if (tk[j]?.tipo === 'punct' && tk[j].v === ',') {
      j++
      continue
    }
    break
  }
  const resto = tk.slice(j)
  if (resto.length > 1 || (resto.length === 1 && !['cascade', 'restrict'].includes(resto[0].v))) {
    if (algumRelevante) falhar(tk[0].ini, `"drop ${palavra}" com cauda que o replay não entende: "${resto.map((t) => t.v).join(' ')}"`)
  }
  return algumRelevante
}

function alterFuncao(tk, sql, arquivo, vivas, falhar, palavra) {
  let j = 2
  const q = nomeQualificado(tk, j)
  if (!q) return false
  const args = tiposEntreParenteses(tk, q.prox, sql)
  j = args ? args.prox : q.prox
  const tipos = args ? tiposDaListaTexto(args.texto) : []
  const chaveOrigem = assinaturaDe(q.schema, q.nome, tipos)
  const origemRel = PREFIXO_REL.test(q.nome)

  // rename to <novo>
  if (tk[j]?.v === 'rename' && tk[j + 1]?.v === 'to' && nomeDeToken(tk[j + 2]) !== null && j + 3 === tk.length) {
    const novoNome = nomeDeToken(tk[j + 2])
    const destinoRel = PREFIXO_REL.test(novoNome)
    if (!origemRel && destinoRel) {
      // FALHA FECHADA (escolha da spec, a mais estrita): renomear de FORA do
      // prefixo para dentro dele exigiria conhecer o corpo de uma função que
      // este módulo não rastreia — nunca ocorreu nas migrations medidas.
      falhar(
        tk[0].ini,
        `alter ${palavra} ${chaveOrigem} rename to ${novoNome} — um nome FORA do prefixo rel_ está entrando nele por rename; a trava não rastreia o corpo de funções fora de rel_* e falha fechado (escreva um "create function" explícito para ${novoNome})`,
      )
      return true
    }
    if (!origemRel) return false // rename entre dois nomes fora do prefixo: irrelevante
    const viva = vivas.get(chaveOrigem)
    if (!viva) {
      falhar(tk[0].ini, `alter ${palavra} … rename de uma rel_* que o replay não conhece (${chaveOrigem})`)
      return true
    }
    vivas.delete(chaveOrigem)
    if (destinoRel) {
      const novaChave = assinaturaDe(q.schema, novoNome, tipos)
      vivas.set(novaChave, { ...viva, nome: novoNome, arquivo, linha: linhaDe(sql, tk[0].ini) })
    }
    // destino fora do prefixo: sai do universo (removido, sem novo registro) — não é falha.
    return true
  }

  if (!origemRel) return false

  // owner to <alguém> — ignorado, por decisão explícita da especificação.
  if (tk[j]?.v === 'owner' && tk[j + 1]?.v === 'to') return true

  // qualquer outro `alter function|routine` sobre uma rel_* viva (set/security/strict/
  // cost/rows/…) — a trava não replica o EFEITO no corpo: falha fechada.
  if (!vivas.has(chaveOrigem)) {
    falhar(tk[0].ini, `alter ${palavra} de uma rel_* que o replay não conhece (${chaveOrigem})`)
    return true
  }
  falhar(
    tk[0].ini,
    `alter ${palavra} ${chaveOrigem} muda algo que a trava não replica (nem "rename to", nem "owner to") — escreva um "create or replace function" explícito com o corpo por extenso`,
  )
  return true
}

// -----------------------------------------------------------------------------
// R1 — declara o parâmetro de recorte
// -----------------------------------------------------------------------------

/**
 * @param {{ nome: string|null, tipo: string }[]} argumentos
 * @returns {{ ok: true } | { ok: false, motivo: string }}
 */
export function checarR1(argumentos) {
  const doRecorte = argumentos.filter((a) => a.nome === 'p_filiais')
  if (doRecorte.length === 0) return { ok: false, motivo: 'não declara o parâmetro de recorte "p_filiais"' }
  const comTipoErrado = doRecorte.find((a) => !ehTipoRecorte(a.tipo))
  if (comTipoErrado) {
    return { ok: false, motivo: `declara "p_filiais" com tipo "${comTipoErrado.tipo}" — precisa normalizar para smallint[]` }
  }
  return { ok: true }
}

// -----------------------------------------------------------------------------
// R2 / R3 — a ligação exata e a conjunção direta (busca FLAT sobre os tokens)
// -----------------------------------------------------------------------------

const ENDERS_CLAUSULA = new Set([
  'and',
  'group',
  'order',
  'limit',
  'offset',
  'window',
  'union',
  'intersect',
  'except',
  'join',
  'left',
  'right',
  'inner',
  'full',
  'cross',
  'where',
  'returning',
])

const PALAVRAS_ANTES_DE_GRUPO = new Set(['and', 'or', 'not', 'where', 'having', 'on'])
const PALAVRAS_QUE_REPROVAM_GRUPO = new Set(['case', 'when', 'then', 'else', 'select'])

function ehIdentTok(t) {
  return t && (t.tipo === 'ident' || t.tipo === 'qident')
}

function valorTok(t) {
  return t.tipo === 'qident' ? t.v.toLowerCase() : t.v
}

/** Índice do `)` que fecha o `(` em `tk[idxAbre]` — varredura linear por profundidade. */
function fecharGrupo(tk, idxAbre) {
  let prof = 0
  for (let j = idxAbre; j < tk.length; j++) {
    if (tk[j].tipo === 'punct' && tk[j].v === '(') prof++
    else if (tk[j].tipo === 'punct' && tk[j].v === ')') {
      prof--
      if (prof === 0) return j
    }
  }
  return -1
}

/**
 * Acha, a partir do índice `k` de uma ocorrência de `p_filiais`, se ela está na
 * forma `<colref> = any ( p_filiais )` (R2). Devolve o span `[inicioColref,
 * fechaAny]` (índices de token, inclusive), mais o NOME da coluna e o
 * QUALIFICADOR (o `ident` antes do `.`, ou `null` se `<colref>` for um `ident`
 * solto) — usados pelo R4 (`colunaValida`) para provar que a ligação é de fato
 * sobre a coluna de filial, não sobre um identificador qualquer que só POR
 * COINCIDÊNCIA satisfaz a forma sintática (achado "Furo 3" da revisão
 * adversarial, F60: um `join` decorativo filtrando `mov.id` em vez de
 * `mov.filial_id`) — ou `null` se a forma não casar.
 */
function casarLigacao(tk, k) {
  if (!(tk[k - 1]?.tipo === 'punct' && tk[k - 1].v === '(')) return null
  if (!(tk[k + 1]?.tipo === 'punct' && tk[k + 1].v === ')')) return null
  if (!(ehIdentTok(tk[k - 2]) && valorTok(tk[k - 2]) === 'any')) return null
  if (!(tk[k - 3]?.tipo === 'op' && tk[k - 3].v === '=')) return null
  const fimColref = k - 4
  if (!ehIdentTok(tk[fimColref])) return null
  let inicioColref = fimColref
  if (tk[fimColref - 1]?.tipo === 'punct' && tk[fimColref - 1].v === '.' && ehIdentTok(tk[fimColref - 2])) {
    inicioColref = fimColref - 2
    // uma 3ª parte (schema.tabela.coluna) não é "ident ou ident.ident" — reprova
    if (tk[inicioColref - 1]?.tipo === 'punct' && tk[inicioColref - 1].v === '.') return null
  }
  return {
    inicioColref,
    fechaAny: k + 1,
    coluna: valorTok(tk[fimColref]),
    qualificador: inicioColref !== fimColref ? valorTok(tk[inicioColref]) : null,
  }
}

/**
 * R3 — a comparação `[inicio, fim]` é conjunção direta de `where`/`on`/`having`?
 * Recursivo: se o token antes é `(`, o GRUPO inteiro precisa satisfazer a mesma
 * regra, e o `(` não pode ser chamada de função nem `case/when/then/else/select`.
 */
function ehConjuncaoDireta(tk, inicio, fim) {
  const antes = tk[inicio - 1]
  const depois = tk[fim + 1]

  const antesClausula = ehIdentTok(antes) && ['where', 'on', 'having', 'and'].includes(valorTok(antes))
  const antesAbreGrupo = antes?.tipo === 'punct' && antes.v === '('
  if (!antesClausula && !antesAbreGrupo) return false

  const depoisOk =
    depois === undefined ||
    (depois.tipo === 'punct' && depois.v === ')') ||
    (ehIdentTok(depois) && ENDERS_CLAUSULA.has(valorTok(depois)))
  if (!depoisOk) return false

  if (antesClausula) return true

  const idxAbre = inicio - 1
  const preAbre = tk[idxAbre - 1]
  if (ehIdentTok(preAbre)) {
    const v = valorTok(preAbre)
    if (PALAVRAS_QUE_REPROVAM_GRUPO.has(v)) return false
    if (!PALAVRAS_ANTES_DE_GRUPO.has(v)) return false // identificador solto = chamada de função
  }
  const idxFecha = fecharGrupo(tk, idxAbre)
  if (idxFecha === -1) return false
  return ehConjuncaoDireta(tk, idxAbre, idxFecha)
}

/**
 * Todas as ocorrências de `p_filiais` num corpo, julgadas por R2+R3.
 * @param {string} corpo
 * @returns {{
 *   ok: boolean,
 *   ocorrencias: number,
 *   passantes: { inicioColref: number, fechaAny: number, onde: number }[],
 *   falhas: { pos: number, motivo: string }[],
 * }}
 */
export function ligacoesDoParametro(corpo) {
  const { tokens } = lexar(corpo)
  const tk = tokens.filter((t) => !(t.tipo === 'punct' && t.v === ';'))
  const falhas = []
  const passantes = []
  let ocorrencias = 0

  for (let k = 0; k < tk.length; k++) {
    const t = tk[k]
    if (!((t.tipo === 'ident' && t.v === 'p_filiais') || (t.tipo === 'qident' && t.v.toLowerCase() === 'p_filiais'))) continue
    ocorrencias++
    const lig = casarLigacao(tk, k)
    if (!lig) {
      falhas.push({
        pos: t.ini,
        motivo: 'ocorrência de "p_filiais" fora da forma exata "<coluna> = any (p_filiais)" (R2)',
      })
      continue
    }
    if (!ehConjuncaoDireta(tk, lig.inicioColref, lig.fechaAny)) {
      falhas.push({
        pos: t.ini,
        motivo: 'a ligação "= any (p_filiais)" não é conjunção DIRETA de where/on/having — há disjunção, negação ou cláusula errada no caminho (R3)',
      })
      continue
    }
    passantes.push({ ...lig, onde: t.ini })
  }

  return { ok: ocorrencias > 0 && falhas.length === 0, ocorrencias, passantes, falhas }
}

// -----------------------------------------------------------------------------
// R4 — escopo das leituras (o nível do total)
// -----------------------------------------------------------------------------

const CLAUSULAS_TOPO = new Set(['from', 'where', 'group', 'having', 'order', 'limit', 'offset', 'window', 'fetch', 'for'])
const JUNCAO = new Set(['join', 'inner', 'left', 'right', 'full', 'outer', 'cross', 'natural', 'lateral', 'only'])

function ehInicioSelect(tk, i) {
  return ehIdentTok(tk[i]) && ['select', 'with', 'values'].includes(valorTok(tk[i]))
}

/**
 * Agrupa tokens em itens planos + grupos aninhados (só para o parêntese em si —
 * não distingue subquery aqui; isso é feito por quem consome). Espelho mínimo,
 * LOCAL, do que `predicado-policies.mjs::aninhar` faz (não exportado por lá).
 */
function aninharLocal(tokens) {
  const raiz = { tipo: 'grupo', itens: [] }
  const pilha = [raiz]
  for (const t of tokens) {
    if (t.tipo === 'punct' && t.v === '(') {
      const g = { tipo: 'grupo', abre: t, itens: [] }
      pilha.at(-1).itens.push(g)
      pilha.push(g)
    } else if (t.tipo === 'punct' && t.v === ')') {
      if (pilha.length === 1) throw new ErroDeLeituraRecorte('")" sem "(" correspondente')
      pilha.pop().fecha = t
    } else {
      pilha.at(-1).itens.push(t)
    }
  }
  if (pilha.length !== 1) throw new ErroDeLeituraRecorte('"(" sem ")" correspondente')
  return raiz.itens
}

const ehGrupo = (it) => it?.tipo === 'grupo'
const ehSubselectGrupo = (g) => ehGrupo(g) && ehInicioSelect(g.itens, 0)

/**
 * Separa os itens (já sem o `select`/`with` inicial) nas clausulas de topo,
 * preservando SIBLINGS de `union`/`intersect`/`except` como ramos distintos.
 * Cada bloco de `resto` carrega sua CLÁUSULA (`where`/`having`/`group`/`order`/
 * `limit`/`offset`/`window`/`fetch`/`for`) — antes do reparo desta revisão, os
 * nove eram um blob só e uma subconsulta em GROUP BY/ORDER BY (que a spec
 * proíbe expressamente de herdar) era tratada como se estivesse em WHERE
 * (achado 1 da revisão adversarial, "revisor catálogo", F60).
 * @returns {{ ramos: { alvo: any[], from: any[]|null, resto: {clausula:string, itens:any[]}[] }[] }}
 */
function segmentarComUniao(itens) {
  const ramos = []
  let atualAlvo = []
  let atualFrom = null
  let atualResto = []
  let atual = atualAlvo

  const fecharRamo = () => {
    ramos.push({ alvo: atualAlvo, from: atualFrom, resto: atualResto })
    atualAlvo = []
    atualFrom = null
    atualResto = []
    atual = atualAlvo
  }

  for (let i = 0; i < itens.length; i++) {
    const it = itens[i]
    if (ehIdentTok(it) && ['union', 'intersect', 'except'].includes(valorTok(it))) {
      fecharRamo()
      let j = i + 1
      if (ehIdentTok(itens[j]) && valorTok(itens[j]) === 'all') j++
      if (ehInicioSelect(itens, j) && valorTok(itens[j]) === 'select') {
        i = j // o próximo item processado é o token depois de "select"
        continue
      }
      // ramo não-select (ex.: values, ou outro select composto) — trata os
      // itens restantes do ramo como alvo cru; R4 não filtra tabela aqui.
      continue
    }
    if (ehIdentTok(it) && CLAUSULAS_TOPO.has(valorTok(it))) {
      if (valorTok(it) === 'from' && atualFrom === null) {
        atualFrom = []
        atual = atualFrom
      } else {
        const bloco = { clausula: valorTok(it), itens: [] }
        atualResto.push(bloco)
        atual = bloco.itens
      }
      continue
    }
    atual.push(it)
  }
  fecharRamo()
  return ramos
}

/** Nome (cadeia `ident[.ident]`) a partir do item i de uma lista de itens PLANA (sem grupo). */
function lerCadeiaItens(itens, i) {
  const partes = [itens[i]]
  let j = i + 1
  while (itens[j]?.tipo === 'punct' && itens[j].v === '.' && ehIdentTok(itens[j + 1])) {
    partes.push(itens[j + 1])
    j += 2
  }
  return { nome: partes.map(valorTok).join('.'), ultima: valorTok(partes.at(-1)), prox: j }
}

/**
 * Lê o FROM de um ramo: tabelas-base (nome, alias — exceto nome de CTE visível,
 * que não é leitura de tabela-base), tabelas derivadas/laterais (grupo select —
 * vira escopo filho ELEGÍVEL a herdar) e chamadas de função (ignoradas). A
 * condição de `on` é INTEIRAMENTE pulada aqui (ela não é FROM — é procurada por
 * `temLigacaoPropria` direto nos itens crus do `from`, por fora desta função) —
 * sem isso, "t.filial_id = any(p_filiais) and …" seria lido token a token como
 * se cada identificador fosse uma nova tabela (o defeito medido nesta sessão).
 * @param {any[]} itens
 * @param {Set<string>} nomesCte
 */
function lerFromLocal(itens, nomesCte) {
  const entradas = []
  let i = 0
  while (i < itens.length) {
    const it = itens[i]
    if (it?.tipo === 'punct' && it.v === ',') {
      i++
      continue
    }
    if (ehIdentTok(it) && JUNCAO.has(valorTok(it))) {
      i++
      continue
    }
    if (ehIdentTok(it) && valorTok(it) === 'on') {
      // pula a condição INTEIRA, até a próxima vírgula ou palavra de junção do
      // FROM (a mesma régua de `predicado-policies.mjs::lerFrom`) — um `grupo`
      // aninhado já é opaco aqui, então uma vírgula DENTRO de uma chamada de
      // função na condição não interrompe a varredura por engano.
      i++
      while (i < itens.length && !(itens[i]?.tipo === 'punct' && itens[i].v === ',') && !(ehIdentTok(itens[i]) && JUNCAO.has(valorTok(itens[i])))) {
        i++
      }
      continue
    }
    if (ehIdentTok(it) && valorTok(it) === 'using' && ehGrupo(itens[i + 1])) {
      i += 2
      continue
    }
    if (ehGrupo(it)) {
      if (ehSubselectGrupo(it)) {
        // O ALIAS é capturado (não só pulado) porque o R4 precisa dele para
        // duas coisas novas desta revisão: resolver o QUALIFICADOR de uma
        // ligação `<alias>.id = any (p_filiais)` até a tabela real (a exceção
        // de `filiais.id`, abaixo) e reconhecer CORRELAÇÃO (`referenciaAlgumAlias`)
        // — sem o alias, uma tabela derivada/lateral herdava cobertura só por
        // estar "por perto" do escopo coberto, sem nenhuma relação com ele
        // (achados "Furo 2"/"Furo 3" da revisão adversarial, F60).
        const entradaDerivada = { tipo: 'derivada', grupo: it, alias: null }
        entradas.push(entradaDerivada)
        i++
        if (ehIdentTok(itens[i]) && valorTok(itens[i]) === 'as') i++
        if (ehIdentTok(itens[i]) && !JUNCAO.has(valorTok(itens[i])) && valorTok(itens[i]) !== 'on') {
          entradaDerivada.alias = valorTok(itens[i])
          i++
        }
      } else {
        i++ // junção entre parênteses — não esperado nos corpos desta fase; ignora com segurança
      }
      continue
    }
    if (ehIdentTok(it)) {
      const { nome, ultima, prox } = lerCadeiaItens(itens, i)
      if (ehGrupo(itens[prox])) {
        i = prox + 1 // chamada de função no FROM — não é leitura de tabela-base
        continue
      }
      const ehCte = nomesCte.has(ultima)
      // alias por omissão = o próprio nome da tabela/CTE, como o Postgres resolve.
      const entradaFrom = ehCte
        ? { tipo: 'cte', nome: ultima, alias: ultima }
        : { tipo: 'tabela', nome: ultima, nomeCompleto: nome, alias: ultima }
      entradas.push(entradaFrom)
      i = prox
      if (ehIdentTok(itens[i]) && valorTok(itens[i]) === 'as') i++
      if (ehIdentTok(itens[i]) && !JUNCAO.has(valorTok(itens[i])) && valorTok(itens[i]) !== 'on') {
        entradaFrom.alias = valorTok(itens[i])
        i++
      }
      continue
    }
    i++
  }
  return entradas
}

/**
 * A coluna de uma ligação passante é de fato a coluna do RECORTE, ou só
 * coincide sintaticamente com a forma `<colref> = any (p_filiais)` sem ser
 * semanticamente uma coluna de filial ("Furo 3" da revisão adversarial, F60:
 * `mov.id = any (p_filiais)` — um JOIN decorativo cujo comparador não tem
 * NADA a ver com filial, mas casa R2/R3 igualzinho a `mov.filial_id`)?
 *
 * A régua: o nome da coluna precisa ser `filial_id` (a convenção universal do
 * banco — 976 ocorrências nas migrations, contra zero de qualquer variante
 * como `filial`/`id_filial`), OU o nome pode ser `id` quando — e só quando —
 * o QUALIFICADOR resolve, dentro do MESMO escopo onde a ligação está escrita,
 * para a própria tabela `filiais` (o padrão-guarda do módulo B/D da spec:
 * `where exists (select 1 from public.filiais f where f.id = any (p_filiais))`
 * — ali `f.id` É o identificador da filial, não um substituto qualquer).
 *
 * Sem esta régua, R2/R3 aceitam QUALQUER `<colref>` — inclusive `mov.id`,
 * `ativo.numero_serie` (se fosse smallint) ou qualquer outra coluna que só por
 * COINCIDÊNCIA de tipo compile contra `smallint[]` — e o R4 (que só olha "há
 * uma ligação passante neste escopo?", nunca QUAL coluna) trata isso como
 * cobertura plena do escopo inteiro. Fechado aqui, na origem, em vez de tentar
 * modelar "cobertura por tabela" (que quebraria o padrão LEGÍTIMO, também
 * medido nesta revisão, de `rel_resumo_filiais`: `movimentacoes` recorta por
 * `m.filial_id`, e `ativos`/`filiais` entram por JOIN de chave primária sem
 * precisar repetir o filtro — a garantia ali é a igualdade de chave, não uma
 * segunda comparação; ver docs/DECISOES.md, decisão F60).
 * @param {{ coluna: string, qualificador: string|null }} lig
 * @param {Map<string,string>} aliasParaTabela alias → tabela, NESTE escopo
 */
function colunaValida(lig, aliasParaTabela) {
  if (!lig) return false
  if (lig.coluna === 'filial_id') return true
  if (lig.coluna === 'id' && lig.qualificador && aliasParaTabela.get(lig.qualificador) === 'filiais') return true
  return false
}

/**
 * Varre um conjunto de itens (podendo conter grupos) buscando ocorrências
 * PASSANTES de `p_filiais` — que já passaram R2+R3 (`posicoesPassantes`) E cuja
 * coluna é de fato a do recorte (`colunaValida`) — que pertencem DIRETAMENTE a
 * este nível — não dentro de um grupo que é ele mesmo uma subquery (essas
 * formam escopo próprio e são tratadas por quem chama), mas SIM dentro de um
 * grupo de agrupamento comum (parênteses booleanos) e dentro de argumentos de
 * EXISTS/IN cujo conteúdo já foi decidido pertencer a outro escopo — por isso
 * este walker só entra em grupos NÃO-select.
 * @param {any[]} itens
 * @param {Set<number>} posicoesPassantes posições (ini) de ocorrências que já
 *   passaram R2+R3 em toda a função (calculado uma vez, globalmente)
 * @param {Map<string, {coluna:string, qualificador:string|null}>} posicaoParaLigacao
 * @param {Map<string,string>} aliasParaTabela alias → tabela, NESTE escopo
 * @returns {boolean} true se achou ao menos uma ocorrência passante e válida neste nível
 */
function temLigacaoPropria(itens, posicoesPassantes, posicaoParaLigacao, aliasParaTabela) {
  let achou = false
  for (const it of itens) {
    if (ehGrupo(it)) {
      if (ehSubselectGrupo(it)) continue // escopo próprio — não desce
      if (temLigacaoPropria(it.itens, posicoesPassantes, posicaoParaLigacao, aliasParaTabela)) achou = true
      continue
    }
    if ((it.tipo === 'ident' && it.v === 'p_filiais') || (it.tipo === 'qident' && it.v.toLowerCase() === 'p_filiais')) {
      if (posicoesPassantes.has(it.ini) && colunaValida(posicaoParaLigacao.get(it.ini), aliasParaTabela)) achou = true
    }
  }
  return achou
}

/**
 * Uma referência de coluna QUALIFICADA (`<alias>.<coluna>`) em `itens` aponta
 * para algum alias em `aliasesVisiveis`? Usada para exigir CORRELAÇÃO antes de
 * herdar cobertura do pai — sem isso, um `exists (select ... de qualquer
 * tabela, sem relação nenhuma com o pai)` herdava cobertura só por estar
 * sintaticamente dentro de um `where` coberto ("Furo 2" da revisão
 * adversarial, F60), e o mesmo valia para uma tabela derivada solta no FROM
 * ("Furo 3"). O `cross join lateral` legítimo (`corpos-novos.sql §7`)
 * continua passando porque ele de fato CORRELACIONA — a lateral interna lê
 * `m.ativo_id = a.id`, uma referência qualificada ao alias externo `a`.
 * @param {any[]} itens
 * @param {Set<string>} aliasesVisiveis
 */
function referenciaAlgumAlias(itens, aliasesVisiveis) {
  if (aliasesVisiveis.size === 0) return false
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i]
    if (ehGrupo(it)) {
      if (referenciaAlgumAlias(it.itens, aliasesVisiveis)) return true
      continue
    }
    if (ehIdentTok(it) && itens[i + 1]?.tipo === 'punct' && itens[i + 1].v === '.' && ehIdentTok(itens[i + 2])) {
      if (aliasesVisiveis.has(valorTok(it))) return true
    }
  }
  return false
}

/**
 * Extrai, recursivamente, os ESCOPOS de `select` de um corpo — cada um com suas
 * tabelas-base lidas e se está coberto (R4), respeitando herança (from/lateral,
 * where/on/having-exists/in — SÓ quando correlacionada, ver `referenciaAlgumAlias`)
 * e não-herança (CTE, lista do select/group/order, e agora também group/order/
 * limit/offset/window/fetch/for — ver `ambiente.nomesCte`/`segmentarComUniao`).
 * @param {any[]} itensSelect itens de UM `select` (sem o `select` inicial em si,
 *   já sem `with`), i.e. o corpo INTEIRO da consulta a partir do primeiro token
 *   depois de `select`/`with … select`.
 * @param {{ herdaDoPai: boolean, coberturaDoPai: boolean }} contexto
 * @param {Set<number>} posicoesPassantes
 * @param {{ nome: string, coberto: boolean, tabelas: string[] }[]} saida acumulador
 * @param {{ nomesCte: Set<string>, aliasesAncestrais: Set<string>, posicaoParaLigacao: Map<number,any> }} ambiente
 */
function processarEscopo(itensAPartirDoSelect, contexto, posicoesPassantes, saida, ambiente) {
  const { nomesCte, aliasesAncestrais, posicaoParaLigacao } = ambiente
  // itensAPartirDoSelect começa DEPOIS do "select" (já consumido por quem chama).
  const ramos = segmentarComUniao(itensAPartirDoSelect)
  for (const ramo of ramos) {
    const entradasFrom = ramo.from ? lerFromLocal(ramo.from, nomesCte) : []
    const tabelasBase = entradasFrom.filter((e) => e.tipo === 'tabela').map((e) => e.nome)
    const derivadas = entradasFrom.filter((e) => e.tipo === 'derivada')

    // alias → tabela, só das tabelas-base DESTE escopo (para resolver a exceção
    // `filiais.id` de `colunaValida`); aliases DESTE escopo (tabela, derivada
    // OU cte) — para saber quem uma subquery filha pode correlacionar.
    const aliasParaTabela = new Map(entradasFrom.filter((e) => e.tipo === 'tabela' && e.alias).map((e) => [e.alias, e.nome]))
    const aliasesDesteEscopo = new Set(entradasFrom.filter((e) => e.alias).map((e) => e.alias))
    const aliasesVisiveisDaqui = new Set([...aliasesAncestrais, ...aliasesDesteEscopo])
    const ambienteFilho = { nomesCte, aliasesAncestrais: aliasesVisiveisDaqui, posicaoParaLigacao }

    // ligação própria: no FROM (nas condições ON, que ficam misturadas nos
    // itens do from — cobertas por temLigacaoPropria também), no WHERE e no
    // HAVING deste ramo.
    const proprioNoFrom = ramo.from ? temLigacaoPropria(ramo.from, posicoesPassantes, posicaoParaLigacao, aliasParaTabela) : false
    const proprioNoResto = ramo.resto.some((bloco) => temLigacaoPropria(bloco.itens, posicoesPassantes, posicaoParaLigacao, aliasParaTabela))
    const selfCoberto = proprioNoFrom || proprioNoResto

    const coberto = selfCoberto || (contexto.herdaDoPai && contexto.coberturaDoPai)

    saida.push({ tabelas: tabelasBase, coberto })

    // tabelas derivadas/laterais no FROM: escopo filho que HERDA esta cobertura
    // SÓ quando correlacionada a um alias visível (ancestral ou deste próprio
    // FROM) — nunca de graça. Os subselects DENTRO de cada derivada são
    // achados por ela mesma quando recursamos (não pela busca solta abaixo,
    // que exclui o que já é derivada).
    for (const d of derivadas) {
      const itensSemSelect = d.grupo.itens.slice(1) // remove o token "select"/"with"
      const correlacionada = referenciaAlgumAlias(d.grupo.itens, aliasesVisiveisDaqui)
      processarEscopo(itensSemSelect, { herdaDoPai: correlacionada, coberturaDoPai: coberto }, posicoesPassantes, saida, ambienteFilho)
    }

    // subqueries em WHERE/HAVING/ON via exists()/in(): herdam esta cobertura
    // SÓ quando (a) vêm de fato envolvidas por exists()/in() — a forma que a
    // spec descreve, não qualquer subconsulta solta na cláusula — E (b) são
    // CORRELACIONADAS a um alias visível. GROUP BY/ORDER BY/LIMIT/OFFSET/
    // WINDOW/FETCH/FOR NUNCA entram aqui (ver o bloco seguinte) — antes do
    // reparo, os nove tipos de cláusula vinham misturados num só balde e uma
    // subconsulta em ORDER BY herdava como se estivesse em WHERE (achado 1 da
    // revisão "revisor catálogo", F60).
    const gruposDeDerivadas = new Set(derivadas.map((d) => d.grupo))
    const blocosOndeHaving = ramo.resto.filter((b) => b.clausula === 'where' || b.clausula === 'having').map((b) => b.itens)
    for (const bloco of [...blocosOndeHaving, ramo.from ?? []]) {
      for (const achado of acharSubselectsSoltosComContexto(bloco, gruposDeDerivadas)) {
        const itensSemSelect = achado.grupo.itens.slice(1)
        const elegivel = achado.wrapper !== null && referenciaAlgumAlias(achado.grupo.itens, aliasesVisiveisDaqui)
        processarEscopo(itensSemSelect, { herdaDoPai: elegivel, coberturaDoPai: coberto }, posicoesPassantes, saida, ambienteFilho)
      }
    }

    // subquery em GROUP BY/ORDER BY/LIMIT/OFFSET/WINDOW/FETCH/FOR: NUNCA herda
    // (a mesma régua da lista do SELECT) — a spec fala expressamente de
    // "group by/order by" e o defeito medido cobria os outros cinco também.
    const blocosSemHeranca = ramo.resto.filter((b) => !(b.clausula === 'where' || b.clausula === 'having')).map((b) => b.itens)
    for (const bloco of blocosSemHeranca) {
      for (const sub of acharSubselectsSoltos(bloco, gruposDeDerivadas)) {
        const itensSemSelect = sub.itens.slice(1)
        processarEscopo(itensSemSelect, { herdaDoPai: false, coberturaDoPai: false }, posicoesPassantes, saida, ambienteFilho)
      }
    }

    // subquery na lista do SELECT (alvo): NUNCA herda.
    for (const sub of acharSubselectsSoltos(ramo.alvo, gruposDeDerivadas)) {
      const itensSemSelect = sub.itens.slice(1)
      processarEscopo(itensSemSelect, { herdaDoPai: false, coberturaDoPai: false }, posicoesPassantes, saida, ambienteFilho)
    }
  }
}

/**
 * Acha, dentro de uma lista de itens (podendo ter grupos comuns aninhados), todo
 * grupo-select que NÃO é uma "derivada" de FROM já tratada por `lerFromLocal`
 * (essas ficam em `excluir`, por identidade de objeto) — usado para
 * select-list/group/order/limit/offset/window/fetch/for, onde todo OUTRO
 * grupo-select achado é subquery e NUNCA herda. Não desce dentro de um
 * grupo-select achado — o corpo dele pertence ao ESCOPO FILHO, processado
 * recursivamente por quem chama, não a este nível.
 */
function acharSubselectsSoltos(itens, excluir = new Set()) {
  const achados = []
  const andar = (lista) => {
    for (const it of lista) {
      if (ehGrupo(it)) {
        if (ehSubselectGrupo(it)) {
          if (!excluir.has(it)) achados.push(it)
        } else {
          andar(it.itens)
        }
      }
    }
  }
  andar(itens)
  return achados
}

/**
 * A mesma varredura de `acharSubselectsSoltos`, mas para WHERE/HAVING/ON —
 * aqui cada achado também diz se veio imediatamente precedido de `exists`/`in`
 * (o `wrapper`) na MESMA lista onde apareceu — só essa forma é elegível a
 * herdar cobertura (módulo B da spec: "numa condição where/on/having (exists,
 * in) de um escopo COBERTO"); uma subconsulta ESCALAR solta no meio do WHERE
 * (`and (select max(x) from y) > 100`), sem exists/in, não é o caso que a spec
 * descreve — vira escopo próprio, como select-list.
 */
function acharSubselectsSoltosComContexto(itens, excluir = new Set()) {
  const achados = []
  const andar = (lista) => {
    for (let i = 0; i < lista.length; i++) {
      const it = lista[i]
      if (ehGrupo(it)) {
        if (ehSubselectGrupo(it)) {
          if (!excluir.has(it)) {
            const anterior = lista[i - 1]
            const wrapper = ehIdentTok(anterior) && ['exists', 'in'].includes(valorTok(anterior)) ? valorTok(anterior) : null
            achados.push({ grupo: it, wrapper })
          }
        } else {
          andar(it.itens)
        }
      }
    }
  }
  andar(itens)
  return achados
}

/**
 * Extrai as definições de CTE de um `with …` e o select principal que segue.
 * @param {any[]} itensAPartirDoWith itens depois do token "with" (e do opcional "recursive")
 * @returns {{ ctes: { nome: string, grupo: any }[], itensSelectPrincipal: any[] } | null}
 */
function lerWith(itensAPartirDoWith) {
  let i = 0
  if (ehIdentTok(itensAPartirDoWith[i]) && valorTok(itensAPartirDoWith[i]) === 'recursive') i++
  const ctes = []
  for (;;) {
    if (!ehIdentTok(itensAPartirDoWith[i])) return null
    const nome = valorTok(itensAPartirDoWith[i])
    i++
    if (ehGrupo(itensAPartirDoWith[i]) && !ehSubselectGrupo(itensAPartirDoWith[i])) i++ // lista de colunas opcional
    if (!(ehIdentTok(itensAPartirDoWith[i]) && valorTok(itensAPartirDoWith[i]) === 'as')) return null
    i++
    if (!ehSubselectGrupo(itensAPartirDoWith[i])) return null
    ctes.push({ nome, grupo: itensAPartirDoWith[i] })
    i++
    if (itensAPartirDoWith[i]?.tipo === 'punct' && itensAPartirDoWith[i].v === ',') {
      i++
      continue
    }
    break
  }
  if (!(ehIdentTok(itensAPartirDoWith[i]) && valorTok(itensAPartirDoWith[i]) === 'select')) return null
  return { ctes, itensSelectPrincipal: itensAPartirDoWith.slice(i + 1) }
}

/**
 * Julga R4 para um corpo: devolve `{ ok, violacoes:[{ tabela }] }`.
 * @param {string} corpo
 * @param {{ inicioColref: number, fechaAny: number, onde: number, coluna: string, qualificador: string|null }[]} ligacoesPassantes
 */
export function checarR4(corpo, ligacoesPassantes) {
  const { tokens } = lexar(corpo)
  const tk = tokens.filter((t) => !(t.tipo === 'punct' && t.v === ';'))
  const posicoesPassantes = new Set(ligacoesPassantes.map((l) => l.onde))
  const posicaoParaLigacao = new Map(ligacoesPassantes.map((l) => [l.onde, l]))
  let itens
  try {
    itens = aninharLocal(tk)
  } catch (err) {
    return { ok: false, violacoes: [], ilegivel: err.message }
  }

  const saida = []
  const ambienteBase = { nomesCte: new Set(), aliasesAncestrais: new Set(), posicaoParaLigacao }
  if (ehIdentTok(itens[0]) && valorTok(itens[0]) === 'with') {
    const w = lerWith(itens.slice(1))
    if (!w) return { ok: false, violacoes: [], ilegivel: 'corpo com "with" em formato que o R4 não lê' }
    // todo nome de CTE fica visível para as OUTRAS ctes e para o select final —
    // sem isso, "from niveis n" seria lido como leitura da tabela-base "niveis".
    const nomesCte = new Set(w.ctes.map((c) => c.nome))
    const ambienteComCte = { ...ambienteBase, nomesCte }
    // cada CTE é escopo PRÓPRIO — nunca herda de ninguém.
    for (const cte of w.ctes) {
      processarEscopo(cte.grupo.itens.slice(1), { herdaDoPai: false, coberturaDoPai: false }, posicoesPassantes, saida, ambienteComCte)
    }
    processarEscopo(w.itensSelectPrincipal, { herdaDoPai: false, coberturaDoPai: false }, posicoesPassantes, saida, ambienteComCte)
  } else if (ehIdentTok(itens[0]) && valorTok(itens[0]) === 'select') {
    processarEscopo(itens.slice(1), { herdaDoPai: false, coberturaDoPai: false }, posicoesPassantes, saida, ambienteBase)
  } else {
    return { ok: false, violacoes: [], ilegivel: 'corpo que não começa com "select" nem "with" — R4 não lê' }
  }

  const violacoes = []
  for (const escopo of saida) {
    if (escopo.coberto) continue
    for (const tabela of escopo.tabelas) {
      if (TABELAS_SEM_FILIAL.includes(tabela)) continue
      violacoes.push({ tabela })
    }
  }
  return { ok: violacoes.length === 0, violacoes }
}

// -----------------------------------------------------------------------------
// C. A lista de exceções — fonte única no `.sql`
// -----------------------------------------------------------------------------

/** O arquivo em que o array de exceções mora (bloco 7, `catalogo_secdef.sql`). */
export const ARQUIVO_CATALOGO_RECORTE = ['supabase', 'tests', 'catalogo_secdef.sql']

/**
 * O formato de uma entrada de `k_excecoes_recorte` — por NOME de função (não por
 * ocorrência de 3 campos, que é o formato de `k_excecoes_predicado`): a chave de
 * recorte da F60 é sempre "a função inteira", não "uma cláusula específica".
 */
export const RE_ENTRADA_EXCECAO_RECORTE =
  /^\s*'([^']+)'\s*,?\s*--\s*(\d{4})\s*·\s*motivo:\s*(.+?)\s*·\s*destino:\s*(F\d+[A-Z]?|permanente)\b(.*)$/

function corpoDoArray(sqlCatalogo, nome) {
  const m = new RegExp(`\\b${nome}\\s+text\\[\\]\\s*:=\\s*array\\[([\\s\\S]*?)\\n\\s*\\](?:::text\\[\\])?\\s*;`).exec(sqlCatalogo)
  if (!m) return null
  return { corpo: m[1], linha: linhaDe(sqlCatalogo, m.index) }
}

/**
 * As exceções do recorte, lidas do `.sql` como TEXTO — fonte única (Decisão 2 da
 * F48), no molde de `lerExcecoesDoCatalogo`.
 * @param {string} sqlCatalogo
 * @returns {{ entradas: { nome: string, migration: string, motivo: string, destino: string, linha: number }[], problemas: string[] }}
 */
export function lerExcecoesDeRecorte(sqlCatalogo) {
  const achado = corpoDoArray(sqlCatalogo, 'k_excecoes_recorte')
  if (!achado) return { entradas: [], problemas: ['não achei o array k_excecoes_recorte em catalogo_secdef.sql'] }
  const entradas = []
  const problemas = []
  achado.corpo.split('\n').forEach((bruta, k) => {
    const l = bruta.trim()
    if (l === '' || l.startsWith('--')) return
    const linha = achado.linha + k
    const m = RE_ENTRADA_EXCECAO_RECORTE.exec(bruta)
    if (!m) {
      problemas.push(
        `catalogo_secdef.sql:${linha} — entrada de k_excecoes_recorte fora do formato "'nome_da_função', -- NNNN · motivo: … · destino: F<n>|permanente": ${l}`,
      )
      return
    }
    const [, nome, migration, motivo, destino] = m
    if (motivo.length < 40) problemas.push(`catalogo_secdef.sql:${linha} — motivo curto demais (precisa >40 caracteres) para "${nome}"`)
    if (!/^rel_[a-z_0-9]*$/.test(nome)) problemas.push(`catalogo_secdef.sql:${linha} — "${nome}" não parece nome de função rel_*`)
    entradas.push({ nome, migration, motivo, destino, linha })
  })
  const nomes = entradas.map((x) => x.nome)
  for (const n of new Set(nomes)) {
    if (nomes.filter((x) => x === n).length > 1) problemas.push(`k_excecoes_recorte repete "${n}"`)
  }
  return { entradas, problemas }
}

// -----------------------------------------------------------------------------
// D. O julgamento
// -----------------------------------------------------------------------------

/**
 * Julga o universo de `rel_*` vivo (pelo replay) contra R1–R4 e as exceções.
 * @param {{ migrations: { arquivo: string, sql: string }[], sqlCatalogo: string }} entrada
 * @returns {{
 *   vivas: Map<string, any>,
 *   violacoes: { funcao: string, regra: string, mensagem: string }[],
 *   falhas: { arquivo: string, linha: number, motivo: string }[],
 *   excecoes: { entradas: any[], problemas: string[] },
 *   consumidos: number,
 *   encontrados: number,
 * }}
 */
export function julgarRecorte({ migrations, sqlCatalogo }) {
  const replay = replayFuncoesRel(migrations)
  const excecoes = lerExcecoesDeRecorte(sqlCatalogo)
  const nomesExcecao = new Set(excecoes.entradas.map((e) => e.nome))

  const violacoes = []

  // O array de exceções (Decisão 2 da F48) é uma lista de NOMES, não de
  // assinaturas — por isso a exceção só pode valer quando o nome identifica UMA
  // única `rel_*` viva. Sem esta conta, um SEGUNDO overload do mesmo nome (que
  // não declara `p_filiais`) herdaria a isenção inteira sem ter sido avaliado —
  // o achado da revisão adversarial (F60): "exceção por NOME, não por
  // assinatura". Espelho da asserção 2 de `catalogo_secdef.sql` para
  // `k_secdef` ("nenhum nome tem mais de uma assinatura viva"), aqui aplicada
  // só aos nomes que estão de fato na lista de exceções — os demais overloads
  // de `rel_*` já são julgados um a um, por assinatura, então não precisam da
  // mesma trava (cada um se declara ou reprova sozinho).
  const vivasPorNome = new Map()
  for (const [chave, def] of replay.vivas) {
    if (!vivasPorNome.has(def.nome)) vivasPorNome.set(def.nome, [])
    vivasPorNome.get(def.nome).push({ chave, def })
  }

  for (const nome of nomesExcecao) {
    const vivasComEsteNome = vivasPorNome.get(nome) ?? []
    if (vivasComEsteNome.length === 0) {
      violacoes.push({
        funcao: `public.${nome}`,
        regra: 'exceção órfã',
        mensagem: `"${nome}" está em k_excecoes_recorte, mas não existe como nenhuma rel_* viva — remova a entrada ou corrija o nome`,
      })
    } else if (vivasComEsteNome.length > 1) {
      violacoes.push({
        funcao: `public.${nome}`,
        regra: 'exceção com overload',
        mensagem: `"${nome}" está em k_excecoes_recorte, mas hoje tem ${vivasComEsteNome.length} assinaturas vivas (${vivasComEsteNome.map((v) => v.chave).join(', ')}) — uma exceção por NOME não pode valer para mais de uma assinatura ao mesmo tempo: o overload extra herdaria a isenção sem ter sido avaliado por R1–R4. Resolva o overload (renomeie um dos dois) antes de manter a exceção`,
      })
    }
  }

  for (const [chave, def] of replay.vivas) {
    const funcao = `${def.esquema}.${def.nome}`
    // A isenção só se aplica quando o nome tem, HOJE, exatamente UMA assinatura
    // viva — a ambiguidade de overload já foi denunciada acima como violação
    // própria, e as duas (ou mais) assinaturas caem para o julgamento normal
    // por R1–R4, que as reprova cada uma pelo que de fato declaram.
    const ehExcecao = nomesExcecao.has(def.nome) && (vivasPorNome.get(def.nome)?.length ?? 0) === 1

    const r1 = checarR1(def.argumentos)
    if (ehExcecao) {
      // A exceção precisa valer NOS DOIS SENTIDOS: existe entre as vivas (aqui
      // está) e NÃO declara p_filiais (senão é exceção morta).
      if (r1.ok) {
        violacoes.push({
          funcao,
          regra: 'exceção morta',
          mensagem: `${chave} (${def.arquivo}:${def.linha}) — está em k_excecoes_recorte, mas DECLARA "p_filiais" corretamente: tire a exceção, a função já recorta`,
        })
      }
      continue
    }

    if (!r1.ok) {
      violacoes.push({ funcao, regra: 'R1', mensagem: `${chave} (${def.arquivo}:${def.linha}) — R1: ${r1.motivo}` })
      continue
    }

    const lig = ligacoesDoParametro(def.corpo)
    if (lig.ocorrencias === 0) {
      violacoes.push({
        funcao,
        regra: 'R2',
        mensagem: `${chave} (${def.arquivo}:${def.linha}) — R2: declara "p_filiais" e não usa no corpo`,
      })
      continue
    }
    if (lig.falhas.length > 0) {
      for (const f of lig.falhas) {
        const linha = linhaDe(def.definicao, f.pos)
        violacoes.push({
          funcao,
          regra: f.motivo.includes('(R3)') ? 'R3' : 'R2',
          mensagem: `${chave} (${def.arquivo}:${def.linha}, corpo linha relativa ${linha}) — ${f.motivo}`,
        })
      }
      continue
    }

    const r4 = checarR4(def.corpo, lig.passantes)
    if (r4.ilegivel) {
      violacoes.push({ funcao, regra: 'R4', mensagem: `${chave} (${def.arquivo}:${def.linha}) — R4: corpo ilegível para o escopo (${r4.ilegivel})` })
      continue
    }
    if (!r4.ok) {
      const tabelas = [...new Set(r4.violacoes.map((v) => v.tabela))].join(', ')
      violacoes.push({
        funcao,
        regra: 'R4',
        mensagem: `${chave} (${def.arquivo}:${def.linha}) — R4: lê ${tabelas} fora do recorte (escopo sem ligação própria nem herdada)`,
      })
    }
  }

  return {
    vivas: replay.vivas,
    violacoes,
    falhas: replay.falhas,
    excecoes,
    consumidos: replay.consumidos,
    encontrados: replay.encontrados,
  }
}

/** A mensagem de uma violação — já pronta em `julgarRecorte`; aqui só para simetria com `mensagemDeViolacao` do molde. */
export function mensagemDeViolacao(v) {
  return v.mensagem
}
