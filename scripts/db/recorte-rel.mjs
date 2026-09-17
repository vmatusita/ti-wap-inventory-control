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
//        `where`/`on`/`having` — não uma disjunção, não dentro de `case`, e sem `or`
//        em NENHUM ponto do caminho até o limite da cláusula (a precedência do
//        `and` sobre o `or` — revisão final). Aceita o recursivo "grupo entre
//        parênteses que é, ele mesmo, conjunção direta". Referência posicional
//        (`$1`) reprova por R2.
//   R4 — escopo das leituras, POR TABELA (revisão final): cada tabela-base lida
//        precisa estar coberta — por uma ligação R2+R3 sobre ela, por igualdade de
//        CHAVE com uma tabela coberta (respeitando o lado nulável de LEFT/RIGHT/FULL
//        JOIN), pela filial calculada de uma lateral coberta, ou por herança de um
//        alias coberto de fora (derivada lateral, exists/in). CTE nunca herda;
//        subconsulta na lista do select/group by/order by também não.
//        `TABELAS_SEM_FILIAL` é a exceção de vocabulário. E o resultado tem de
//        DEPENDER do recorte: nulo ou vazio não pode devolver linhas. O detalhe está
//        no cabeçalho da seção R4, abaixo.
//
// FALHA FECHADA (o ponto cego da réplica de árvore, que tende a "pular o que não
// entendeu" — a mesma lição de `predicado-policies.mjs`, F59)
//
//   · DDL de `rel_*` montado dinamicamente — `create|alter|drop function` dentro
//     de literal ou de corpo `$…$` OU entre aspas simples/E-string (`do '…'`, `as
//     '…'` — revisão final) de OUTRA função/bloco `do` — reprova com arquivo e linha;
//   · o corpo julgado é o literal depois do `as` de nível zero (nunca um `default
//     $d$…$d$` antes dele), e corpo com mais de um comando reprova (a função sql
//     devolve o ÚLTIMO) — revisão final;
//   · a identidade da função é a do Postgres: tipos em forma canônica (`int2[]` =
//     `smallint[]`), `drop`/`alter` sem lista de argumentos resolvem pelo nome
//     único, e identificador em escape Unicode (`U&"…"`) em DDL de função reprova —
//     revisão final;
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
 * @returns {{ nome: string|null, tipo: string, modo: string }[]}
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
    let modo = 'in'
    if (nomeToken(g[i]) !== null && MODOS_ARGUMENTO.has(nomeToken(g[i]))) {
      modo = nomeToken(g[i])
      i++
    }
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
    return { nome, tipo, modo }
  })
}

/** O tipo aceito por R1, normalizado — `smallint[]`, `int2[]`, `smallint []`, `_int2`. */
export function ehTipoRecorte(tipo) {
  const s = tipo.trim().toLowerCase().replace(/\s+/g, '')
  return s === 'smallint[]' || s === 'int2[]' || s === '_int2'
}

/**
 * Os apelidos de tipo que o Postgres trata como o MESMO tipo — o nome que `format_type` escreve à
 * direita. Conjunto fechado de propósito (a trava é de vocabulário fechado): tipo fora da lista
 * segue com a grafia que tem.
 */
const APELIDOS_DE_TIPO = new Map([
  ['int2', 'smallint'],
  ['int', 'integer'],
  ['int4', 'integer'],
  ['int8', 'bigint'],
  ['bool', 'boolean'],
  ['float4', 'real'],
  ['float8', 'double precision'],
  ['decimal', 'numeric'],
  ['varchar', 'character varying'],
  ['char', 'character'],
  ['bpchar', 'character'],
  ['varbit', 'bit varying'],
  ['timestamptz', 'timestamp with time zone'],
  ['timestamp', 'timestamp without time zone'],
  ['timetz', 'time with time zone'],
  ['time', 'time without time zone'],
])

/**
 * O tipo de um argumento na forma CANÔNICA da identidade da função — a chave do replay.
 *
 * Revisão final da F60 (achado "orçamento verde com corpo morto"): a chave usava a grafia CRUA de
 * `tipoDoArgumento`, e o Postgres trata `int2[]`, `smallint []`, `smallint[]` e `_int2` — ou
 * `pg_catalog.date` e `date` — como a MESMA assinatura. Um `create or replace` com outra grafia
 * SUBSTITUI a função no banco, mas no replay virava uma segunda chave, e a definição velha
 * continuava "viva" para quem a procurasse pela chave de sempre (`asof-orcamento.test.ts`). Aqui a
 * grafia colapsa: esquema `pg_catalog.`/`public.`, aspas, `typmod` (`varchar(10)`), dimensões de
 * array (`[3]`, `[][]`, `array`), prefixo `_` e os apelidos de `APELIDOS_DE_TIPO`.
 * @param {string} tipo o tipo já sem nome e sem modo (`tipoDoArgumento`)
 */
export function tipoCanonico(tipo) {
  let s = tipo.trim().toLowerCase().replace(/"/g, '').replace(/\s+/g, ' ')
  s = s.replace(/^(pg_catalog|public)\s*\.\s*/, '')
  s = s.replace(/\s*\([^()]*\)/g, '')
  let array = false
  if (/\s+array(\s*\[\s*\d*\s*\])?$/.test(s)) {
    array = true
    s = s.replace(/\s+array(\s*\[\s*\d*\s*\])?$/, '')
  }
  if (/(\s*\[\s*\d*\s*\])+$/.test(s)) {
    array = true
    s = s.replace(/(\s*\[\s*\d*\s*\])+$/, '')
  }
  s = s.trim()
  if (s.startsWith('_')) {
    array = true
    s = s.slice(1)
  }
  s = APELIDOS_DE_TIPO.get(s) ?? s
  return array ? `${s}[]` : s
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
  // Argumento `out` não faz parte da identidade da função (o Postgres o ignora em `drop`/`alter`).
  return partes
    .map((p) => p.trim())
    .filter((p) => p !== '' && !/^out\s/i.test(p))
    .map(tipoDoArgumento)
}

/** A chave do replay — tipos na forma CANÔNICA (`tipoCanonico`), a identidade que o Postgres usa. */
const assinaturaDe = (schema, nome, tipos) => `${schema}.${nome}(${tipos.map(tipoCanonico).join(',')})`

/**
 * `drop`/`alter` SEM lista de argumentos (`drop function if exists public.rel_x;`) — válido no
 * Postgres quando o nome é único no esquema. Revisão final da F60: o replay montava a chave
 * `rel_x()`, que não casava com a assinatura viva, e o `drop` não derrubava nada — a função
 * seguia "viva" no replay e o orçamento do as-of ficava verde sobre um corpo que o banco não tem.
 * Devolve a chave viva (nome único), `null` quando não há nenhuma, e reprova a ambiguidade.
 */
function chavePorNomeUnico(vivas, schema, nome, falhar, pos, comando) {
  const prefixo = `${schema}.${nome}(`
  const candidatas = [...vivas.keys()].filter((k) => k.startsWith(prefixo))
  if (candidatas.length > 1) {
    falhar(pos, `${comando} ${schema}.${nome} sem lista de argumentos, e há ${candidatas.length} assinaturas vivas (${candidatas.join(', ')}) — o Postgres recusa ("not unique"); escreva a assinatura`)
    return { ambigua: true, chave: null }
  }
  return { ambigua: false, chave: candidatas[0] ?? null }
}

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
    const corposEntreAspas = []
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
      lexado.tokens.forEach((t, k) => {
        if (t.tipo !== 'str' && t.tipo !== 'dollar') return
        literais.push(t)
        if (t.tipo === 'str' && ehCorpoDeCodigo(lexado.tokens, k)) corposEntreAspas.push(t)
      })
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
    // O MESMO julgamento para o corpo de código escrito entre ASPAS SIMPLES — `do '…'`, `do E'…'`,
    // `language plpgsql as '…'` (revisão final da F60). Até aqui só o corpo `$…$` era julgado, e
    // um bloco `do` entre aspas com o nome partido (`'re' || 'l_x'`) ou escrito com escape de
    // E-string (`\x72el_x`) criava uma `rel_*` fora do replay sem falha nenhuma: nem a regex da
    // auto-conferência (texto cru) nem este laço o viam. O léxico já DECODIFICA a string (`''` e os
    // escapes de E-string), então o texto julgado é o que o Postgres executa. Só corpo de CÓDIGO
    // entra (literal logo depois de `as`/`do`): um `comment on … is 'execute …'` não é SQL. A
    // posição é aproximada ao começo do literal — a linha é a que importa.
    for (const t of corposEntreAspas) {
      const prefixo = /^[eE]'/.test(sql.slice(t.ini, t.ini + 2)) ? 2 : 1
      for (const p of executesSuspeitosFuncaoRel(t.v)) falhar(Math.min(t.ini + prefixo + p.pos, t.fim - 1), p.motivo)
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
 * O literal entre aspas em `tokens[k]` é CORPO DE CÓDIGO? `do '…'`, `do language x '…'` e o corpo
 * de função `as '…'`. O `as` de coluna/tipo nunca é seguido de literal — `cast(x as text)` é
 * seguido de identificador —, então a regra não confunde texto com código.
 */
function ehCorpoDeCodigo(tokens, k) {
  const ant = tokens[k - 1]
  if (ant?.tipo !== 'ident') return false
  if (ant.v === 'as' || ant.v === 'do') return true
  return tokens[k - 2]?.tipo === 'ident' && tokens[k - 2].v === 'language' && tokens[k - 3]?.tipo === 'ident' && tokens[k - 3].v === 'do'
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
  const ehDdlDeFuncao =
    (p0 === 'create' && (nomeDeToken(tk[1]) === 'function' || (tk[1]?.v === 'or' && tk[2]?.v === 'replace' && nomeDeToken(tk[3]) === 'function'))) ||
    ((p0 === 'drop' || p0 === 'alter') && PALAVRAS_DE_FUNCAO.has(nomeDeToken(tk[1])))
  // Identificador com escape Unicode (`U&"\0072el_x"`, com ou sem UESCAPE) — revisão final da F60.
  // O léxico não o decodifica (vira `u` + `&` + identificador citado), então o nome real é
  // desconhecido: um `rename to U&"…"` levava uma função SEM recorte para dentro do prefixo rel_
  // sem falha, e um `drop function U&"…"(…)` deixava a rel_* viva no replay. Falha fechada em todo
  // DDL de função — a trava não pula o nome que não lê.
  if (ehDdlDeFuncao && tk.some((t, i) => t.tipo === 'ident' && t.v === 'u' && tk[i + 1]?.tipo === 'op' && tk[i + 1].v.startsWith('&'))) {
    falhar(tk[0].ini, `DDL de função com identificador em escape Unicode (U&"…") — o replay não decodifica o nome e não sabe se ele é rel_*; escreva o nome por extenso`)
    return true
  }
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
  const corpo = corpoDaDefinicao(def.texto)
  if (corpo === null) {
    falhar(tk[0].ini, `"create function ${q.nome}" sem corpo legível depois de "as" ($…$ ou '…') — a trava não julga o que não lê`)
    return true
  }
  // A identidade: os tipos dos argumentos que NÃO são `out` (o Postgres os ignora na assinatura),
  // na forma canônica. `def.tipos` e `argumentos` saem do mesmo texto; os argumentos trazem o modo.
  const tiposDaIdentidade = argumentos.length === def.tipos.length ? def.tipos.filter((_, k) => argumentos[k].modo !== 'out') : def.tipos
  const chave = assinaturaDe(q.schema, q.nome, tiposDaIdentidade)
  vivas.set(chave, {
    esquema: q.schema,
    nome: q.nome,
    argumentos,
    corpo,
    definicao: def.texto,
    arquivo,
    linha: linhaDe(sql, tk[0].ini),
  })
  return true
}

/**
 * O CORPO de um `create function`: o literal (`$…$` ou `'…'`) que vem logo depois do `as` de
 * NÍVEL ZERO de parênteses — nunca um literal da lista de argumentos (`default $d$…$d$`), de
 * `returns table (…)` ou de `set <guc> = $x$…$x$`. Revisão final da F60: a versão anterior pegava o
 * PRIMEIRO `$…$` do comando, e um `default` com texto-isca antes do corpo fazia a mesa aprovar a
 * isca enquanto o corpo de verdade, depois do `as`, nunca era lido. `null` quando não há corpo
 * legível (a função vira falha fechada em quem chama).
 * @param {string} textoCreate
 * @returns {string|null}
 */
function corpoDaDefinicao(textoCreate) {
  const { tokens } = lexar(textoCreate)
  let prof = 0
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.tipo === 'punct' && t.v === '(') prof++
    else if (t.tipo === 'punct' && t.v === ')') prof--
    else if (prof === 0 && t.tipo === 'ident' && t.v === 'as') {
      const prox = tokens[i + 1]
      if (prox && (prox.tipo === 'dollar' || prox.tipo === 'str')) return prox.v
    }
  }
  return null
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
      if (args) {
        const chave = assinaturaDe(q.schema, q.nome, tiposDaListaTexto(args.texto))
        if (!vivas.delete(chave) && !seExiste) {
          falhar(tk[0].ini, `drop ${palavra} de uma rel_* que o replay não conhece (${chave}) — o Postgres recusaria`)
        }
      } else {
        const { ambigua, chave } = chavePorNomeUnico(vivas, q.schema, q.nome, falhar, tk[0].ini, `drop ${palavra}`)
        if (chave) vivas.delete(chave)
        else if (!ambigua && !seExiste) {
          falhar(tk[0].ini, `drop ${palavra} de uma rel_* que o replay não conhece (${q.schema}.${q.nome}, sem lista de argumentos) — o Postgres recusaria`)
        }
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
  const origemRel = PREFIXO_REL.test(q.nome)
  let tipos = args ? tiposDaListaTexto(args.texto) : []
  let chaveOrigem = assinaturaDe(q.schema, q.nome, tipos)
  if (!args && origemRel) {
    // `alter function rel_x rename to …` sem lista de argumentos: o nome único resolve (revisão
    // final da F60, o mesmo caso do `drop`).
    const { ambigua, chave } = chavePorNomeUnico(vivas, q.schema, q.nome, falhar, tk[0].ini, `alter ${palavra}`)
    if (ambigua) return true
    if (chave) {
      chaveOrigem = chave
      tipos = chave.slice(chave.indexOf('(') + 1, -1).split(',').filter((t) => t !== '')
    }
  }

  // rename to <novo>
  if (tk[j]?.v === 'rename' && tk[j + 1]?.v === 'to') {
    // O destino tem de ser UM identificador legível. Revisão final da F60: `rename to U&"\0072el_x"`
    // (três tokens) não casava a forma e caía no "irrelevante" abaixo — uma função sem recorte
    // entrava no prefixo rel_ em silêncio. Destino ilegível reprova, venha a origem de onde vier.
    const novoNome = j + 3 === tk.length ? nomeDeToken(tk[j + 2]) : null
    if (novoNome === null) {
      falhar(tk[0].ini, `alter ${palavra} ${chaveOrigem} rename to <destino que o replay não lê> — a trava não sabe se o nome novo é rel_*; escreva o destino como um identificador simples`)
      return true
    }
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

/** Palavras que, logo DEPOIS da ligação, fecham a cláusula dela (além de `and`, `)` e `,`). */
const FIM_DE_CLAUSULA = new Set([
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
  'natural',
  'where',
  'having',
  'on',
  'returning',
  'fetch',
  'for',
])

/** Onde uma conjunção direta pode começar. */
const ABRE_CLAUSULA = new Set(['where', 'on', 'having'])

/** Palavras de junção que também são nome de função (`left(x, 3)`): seguidas de `(`, não são junção. */
const TAMBEM_NOME_DE_FUNCAO = new Set(['left', 'right'])

/**
 * Palavras que, no caminho da ligação até o COMEÇO da cláusula, provam que ela não é conjunção
 * direta dessa cláusula: um `or` (a precedência do `and` torna a ligação opcional), ou o sinal de
 * que o caminho saiu da expressão booleana (lista do `select`, `case`, junção…).
 */
const QUEBRA_A_ESQUERDA = new Set([
  'or',
  'select',
  'from',
  'case',
  'when',
  'then',
  'else',
  'join',
  'left',
  'right',
  'inner',
  'full',
  'cross',
  'natural',
  'lateral',
  'group',
  'order',
  'limit',
  'offset',
  'window',
  'union',
  'intersect',
  'except',
  'returning',
  'using',
  'values',
  'into',
  'set',
])

/** O mesmo, no caminho da ligação até o FIM da cláusula (`case … end` inteiro é pulado antes). */
const QUEBRA_A_DIREITA = new Set(['or', 'select', 'from', 'when', 'then', 'else', 'end', 'values', 'into', 'set'])

const PALAVRAS_ANTES_DE_GRUPO = new Set(['and', 'or', 'not', 'where', 'having', 'on'])
const PALAVRAS_QUE_REPROVAM_GRUPO = new Set(['case', 'when', 'then', 'else', 'select'])

function ehIdentTok(t) {
  return t && (t.tipo === 'ident' || t.tipo === 'qident')
}

/** Palavra-chave: só `ident` (um `"where"` citado é nome, não cláusula). */
function ehPalavra(t, ...palavras) {
  return t?.tipo === 'ident' && (palavras.length === 0 || palavras.includes(t.v))
}

function ehPunct(t, v) {
  return t?.tipo === 'punct' && t.v === v
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

/** Índice do `(` que abre o `)` em `tk[idxFecha]`. */
function abrirGrupo(tk, idxFecha) {
  let prof = 0
  for (let j = idxFecha; j >= 0; j--) {
    if (tk[j].tipo === 'punct' && tk[j].v === ')') prof++
    else if (tk[j].tipo === 'punct' && tk[j].v === '(') {
      prof--
      if (prof === 0) return j
    }
  }
  return -1
}

/** O `case` do `end` em `tk[idxEnd]`, na mesma profundidade de parênteses (grupos pulados). */
function caseDoEnd(tk, idxEnd) {
  let prof = 0
  for (let j = idxEnd; j >= 0; j--) {
    if (ehPunct(tk[j], ')')) {
      j = abrirGrupo(tk, j)
      if (j === -1) return -1
      continue
    }
    if (ehPunct(tk[j], '(')) return -1
    if (ehPalavra(tk[j], 'end')) prof++
    else if (ehPalavra(tk[j], 'case')) {
      prof--
      if (prof === 0) return j
    }
  }
  return -1
}

/** O `end` do `case` em `tk[idxCase]`, na mesma profundidade de parênteses (grupos pulados). */
function endDoCase(tk, idxCase) {
  let prof = 0
  for (let j = idxCase; j < tk.length; j++) {
    if (ehPunct(tk[j], '(')) {
      j = fecharGrupo(tk, j)
      if (j === -1) return -1
      continue
    }
    if (ehPunct(tk[j], ')')) return -1
    if (ehPalavra(tk[j], 'case')) prof++
    else if (ehPalavra(tk[j], 'end')) {
      prof--
      if (prof === 0) return j
    }
  }
  return -1
}

/** `from` de `is [not] distinct from` não é a cláusula FROM. */
const ehFromDeDistinct = (tk, i) => ehPalavra(tk[i], 'from') && ehPalavra(tk[i - 1], 'distinct')

/**
 * Anda da ligação para a ESQUERDA, na mesma profundidade, até o começo da cláusula: `where`/`on`/
 * `having` (`{ tipo: 'clausula' }`) ou o `(` de um grupo que a contém (`{ tipo: 'grupo' }`). Grupos
 * inteiros e `case … end` são pulados. Devolve `null` quando o caminho cruza um `or` ou sai da
 * expressão booleana.
 */
function limiteEsquerdo(tk, inicio) {
  for (let i = inicio - 1; i >= 0; i--) {
    const t = tk[i]
    if (t.tipo === 'punct') {
      if (t.v === ')') {
        i = abrirGrupo(tk, i)
        if (i === -1) return null
        continue
      }
      if (t.v === '(') return { tipo: 'grupo', idx: i }
      if (t.v === ',' || t.v === ';') return null
      continue
    }
    if (t.tipo !== 'ident') continue
    if (ABRE_CLAUSULA.has(t.v)) return { tipo: 'clausula', idx: i }
    if (t.v === 'end') {
      i = caseDoEnd(tk, i)
      if (i === -1) return null
      continue
    }
    if (ehFromDeDistinct(tk, i)) continue
    if (TAMBEM_NOME_DE_FUNCAO.has(t.v) && ehPunct(tk[i + 1], '(')) continue
    if (QUEBRA_A_ESQUERDA.has(t.v)) return null
  }
  return null
}

/** O espelho de `limiteEsquerdo`: até o fim da cláusula (`{ tipo: 'clausula'|'grupo'|'fim' }`) ou `null`. */
function limiteDireito(tk, fim) {
  for (let i = fim + 1; i < tk.length; i++) {
    const t = tk[i]
    if (t.tipo === 'punct') {
      if (t.v === '(') {
        i = fecharGrupo(tk, i)
        if (i === -1) return null
        continue
      }
      if (t.v === ')') return { tipo: 'grupo', idx: i }
      if (t.v === ',' || t.v === ';') return { tipo: 'clausula', idx: i }
      continue
    }
    if (t.tipo !== 'ident') continue
    if (t.v === 'case') {
      i = endDoCase(tk, i)
      if (i === -1) return null
      continue
    }
    if (ehFromDeDistinct(tk, i)) continue
    if (TAMBEM_NOME_DE_FUNCAO.has(t.v) && ehPunct(tk[i + 1], '(')) continue
    if (FIM_DE_CLAUSULA.has(t.v)) return { tipo: 'clausula', idx: i }
    if (QUEBRA_A_DIREITA.has(t.v)) return null
  }
  return { tipo: 'fim', idx: tk.length }
}

/**
 * Acha, a partir do índice `k` de uma ocorrência de `p_filiais`, se ela está na
 * forma `<colref> = any ( p_filiais )` (R2). Devolve o span `[inicioColref,
 * fechaAny]` (índices de token, inclusive), mais o NOME da coluna e o
 * QUALIFICADOR (o `ident` antes do `.`, ou `null` se `<colref>` for um `ident`
 * solto) — ou `null` se a forma não casar.
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
 *
 * Revisão final da F60 (achados "precedência do or"): a versão anterior olhava só o token VIZINHO
 * de cada lado — `and` bastava. Como o `and` liga mais forte que o `or`, `where x or y and
 * col = any (p_filiais)` é `x or (y and …)`, e `where col = any (p_filiais) and true or true` é
 * `(… and true) or true`: a ligação fica opcional e nulo/vazio devolve tudo, com a mesa verde.
 * Agora o vizinho imediato continua exigido (`and`/`where`/`on`/`having`/`(` antes; `and`/`)`/`,`/
 * fim de cláusula depois — o que barra `not`, operador e cast colados), E a varredura anda até o
 * limite REAL da cláusula nos dois sentidos, na mesma profundidade, pulando grupos e `case … end`:
 * um `or` no caminho reprova. Se o limite à esquerda é um `(`, o grupo inteiro precisa fechar
 * exatamente no limite à direita e ser, ele mesmo, conjunção direta (recursivo), e o `(` não pode
 * ser chamada de função nem `case/when/then/else/select`.
 */
function ehConjuncaoDireta(tk, inicio, fim) {
  const antes = tk[inicio - 1]
  const depois = tk[fim + 1]
  const antesOk = ehPalavra(antes, 'where', 'on', 'having', 'and') || ehPunct(antes, '(')
  if (!antesOk) return false
  const depoisOk =
    depois === undefined ||
    ehPunct(depois, ')') ||
    ehPunct(depois, ',') ||
    (depois.tipo === 'ident' && (depois.v === 'and' || FIM_DE_CLAUSULA.has(depois.v)))
  if (!depoisOk) return false

  const esq = limiteEsquerdo(tk, inicio)
  const dir = limiteDireito(tk, fim)
  if (!esq || !dir) return false
  if (esq.tipo === 'clausula') return true

  // O limite à esquerda é um `(`: o grupo tem de fechar exatamente onde a varredura à direita parou.
  if (dir.tipo !== 'grupo' || fecharGrupo(tk, esq.idx) !== dir.idx) return false
  const preAbre = tk[esq.idx - 1]
  if (preAbre?.tipo === 'qident') return false // "fn"(…) é chamada de função
  if (preAbre?.tipo === 'ident') {
    if (PALAVRAS_QUE_REPROVAM_GRUPO.has(preAbre.v)) return false
    if (!PALAVRAS_ANTES_DE_GRUPO.has(preAbre.v)) return false // identificador solto = chamada de função
  }
  return ehConjuncaoDireta(tk, esq.idx, dir.idx)
}

/**
 * Todas as ocorrências de `p_filiais` num corpo, julgadas por R2+R3.
 *
 * Revisão final da F60: referência POSICIONAL (`$1`, `$2`…) reprova por R2. Numa função `language
 * sql` ela é o próprio argumento — `where … or $1 is null` é o nulo-é-tudo com outra grafia —, e a
 * trava só enxerga o parâmetro de recorte pelo nome. Nenhuma `rel_*` viva usa `$n`.
 * @param {string} corpo
 * @returns {{
 *   ok: boolean,
 *   ocorrencias: number,
 *   passantes: { inicioColref: number, fechaAny: number, onde: number, coluna: string, qualificador: string|null }[],
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
    if (t.tipo === 'param') {
      falhas.push({
        pos: t.ini,
        motivo: `referência posicional "${t.v}" no corpo — numa função sql ela pode ser o próprio p_filiais fora da forma exata; use o nome do parâmetro (R2)`,
      })
      continue
    }
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
        motivo: 'a ligação "= any (p_filiais)" não é conjunção DIRETA de where/on/having — há disjunção (inclusive por precedência do and sobre o or), negação ou cláusula errada no caminho (R3)',
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
//
// A COBERTURA É POR TABELA, NÃO POR ESCOPO (revisão final da F60). Até a revisão, um escopo inteiro
// ficava "coberto" quando QUALQUER ligação válida aparecia em QUALQUER lugar dele, e isso deixava
// passar três famílias de fail-open, medidas:
//   · a ligação no `on` de um LEFT/RIGHT/FULL JOIN — ela não filtra o lado PRESERVADO, e com
//     p_filiais nulo o lado preservado sai inteiro (`ativos a left join filiais f on … and f.id =
//     any (p_filiais)`);
//   · a junção decorativa — `movimentacoes m cross join filiais f where f.id = any (p_filiais)`
//     (ou `cross join ativos a where a.filial_id = any (…)`): a tabela coberta não tem relação
//     nenhuma com a outra;
//   · a correlação decidida só pelo NOME do alias, sem saber se a tabela derivada é `lateral` nem
//     se o alias foi redeclarado por dentro (sombreamento).
// A decisão da F60 que recusou a cobertura por tabela (docs/DECISOES.md) tinha um motivo certo —
// `rel_resumo_filiais` lê `ativos`/`filiais` por JOIN de chave primária a partir de `movimentacoes`
// recortada, sem repetir o filtro — e esse motivo é o que a regra de PROPAGAÇÃO abaixo preserva.
//
// A REGRA, por ramo de `select`:
//   1. Cada entrada do FROM (tabela, CTE, derivada, função) sabe COMO entrou: base, vírgula, inner,
//      cross, left, right, full — e se é `lateral`. Junção entre parênteses, chamada de função que
//      lê tabela e `from` repetido reprovam como ilegíveis (falha fechada).
//   2. Uma ligação passante (R2+R3) cobre a entrada do seu QUALIFICADOR quando a coluna é
//      `filial_id`, ou `id` da tabela `filiais`. No where/having e no `on` de inner/cross, cobre
//      qualquer entrada até ali; no `on` de LEFT JOIN, só a entrada juntada (o lado que pode
//      sumir); no de RIGHT JOIN, só as anteriores; no de FULL JOIN, nada. Ligação sem qualificador
//      só cobre quando o FROM tem uma entrada só.
//   3. A cobertura PROPAGA por igualdade de CHAVE entre dois aliases — `x.id = y.<algo>_id`, `x.id =
//      y.id` ou `x.filial_id = y.filial_id`, conjunção direta —: no where/having e no `on` de inner,
//      nos dois sentidos; no `on` de LEFT JOIN, só do lado preservado para a entrada juntada; no de
//      RIGHT JOIN, só da entrada juntada para as anteriores; no de FULL JOIN, não propaga.
//   4. Uma derivada `lateral` (inner/cross/vírgula) COBERTA cobre as entradas anteriores cujo
//      `filial_id` ela lê — é a filial CALCULADA do as-of (`corpos-novos.sql §7`).
//   5. Um escopo filho herda cobertura só pela mesma igualdade de chave com um alias COBERTO de fora:
//      derivada `lateral` vê as entradas anteriores do FROM e os ancestrais; derivada não-lateral só
//      os ancestrais; `exists`/`in` no where/having/on veem o escopo e os ancestrais; CTE, lista do
//      select, group/order/limit/… nunca herdam. O alias local SOMBREIA o de fora.
//   6. Toda tabela-base não coberta, fora de `TABELAS_SEM_FILIAL`, é violação.
//
// E O RESULTADO TEM DE DEPENDER DO RECORTE (a regra positiva do fato 7, NULL e '{}' → nada): cada
// ramo do select de topo precisa de UMA destas — ligação no where/having; entrada coberta que não
// seja o lado nulável de uma junção externa; CTE ou derivada não-nulável que dependa do recorte; ou
// a guarda `exists (<subconsulta que depende do recorte>)` como conjunção direta do where/having.
// Sem isso, `itens i left join lancamentos_item l on … and l.filial_id = any (p_filiais)` devolve o
// catálogo inteiro com p_filiais nulo — é exatamente o que a guarda `exists` de
// `rel_mov_itens_filiais` (0143) impede, e agora a mesa sabe disso.
//
// LIMITE DECLARADO (não é prova semântica): uma coluna CALCULADA que se chame `filial_id` numa
// lateral é aceita pela regra 4 como a filial calculada do as-of — a mesa não prova o que a
// expressão calcula. Quem prova o resultado das oito vivas é o roteiro `f60_recorte.sql` (1a–1h).

const CLAUSULAS_TOPO = new Set(['from', 'where', 'group', 'having', 'order', 'limit', 'offset', 'window', 'fetch', 'for'])
const PALAVRAS_DE_JUNCAO = new Set(['join', 'inner', 'left', 'right', 'full', 'outer', 'cross', 'natural', 'lateral'])

/**
 * Funções de conjunto do catálogo que não leem tabela — as únicas aceitas no FROM (sem esquema ou
 * com `pg_catalog.`). Qualquer outra chamada de função no FROM é ilegível para o R4: a mesa não lê
 * o que ela lê por dentro (revisão final da F60: `union all select * from public.le_tudo()` passava).
 */
const FUNCOES_DE_FROM_SEM_LEITURA = new Set([
  'unnest',
  'generate_series',
  'generate_subscripts',
  'jsonb_array_elements',
  'jsonb_array_elements_text',
  'json_array_elements',
  'json_array_elements_text',
  'jsonb_each',
  'jsonb_each_text',
  'json_each',
  'json_each_text',
  'jsonb_to_record',
  'jsonb_to_recordset',
  'json_to_record',
  'json_to_recordset',
  'regexp_split_to_table',
  'regexp_matches',
  'string_to_table',
])

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
 * `limit`/`offset`/`window`/`fetch`/`for`) — uma subconsulta em GROUP BY/ORDER BY
 * nunca herda (achado 1 da revisão adversarial, "revisor catálogo", F60).
 *
 * Revisão final da F60: `is [not] distinct from` não abre cláusula (antes, o `from` dele virava um
 * bloco de resto e ESCONDIA as junções seguintes do FROM), e um segundo `from` de verdade no mesmo
 * ramo é ilegível — nunca um bloco que ninguém lê como leitura de tabela.
 * @param {any[]} itens
 * @param {string[]} ilegiveis acumulador
 * @returns {{ alvo: any[], from: any[]|null, resto: {clausula:string, itens:any[]}[] }[]}
 */
function segmentarComUniao(itens, ilegiveis) {
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
    if (ehPalavra(it, 'union', 'intersect', 'except')) {
      fecharRamo()
      let j = i + 1
      if (ehPalavra(itens[j], 'all', 'distinct')) j++
      if (ehPalavra(itens[j], 'select')) {
        i = j // o próximo item processado é o token depois de "select"
        continue
      }
      // ramo entre parênteses ou `values` — o R4 não lê a forma: falha fechada.
      ilegiveis.push('ramo de union/intersect/except que não começa com "select" — o R4 não lê a forma; escreva o ramo como select simples')
      continue
    }
    if (ehPalavra(it) && CLAUSULAS_TOPO.has(it.v)) {
      if (it.v === 'from' && ehPalavra(itens[i - 1], 'distinct')) {
        atual.push(it)
        continue
      }
      if (it.v === 'from') {
        if (atualFrom === null) {
          atualFrom = []
          atual = atualFrom
        } else {
          ilegiveis.push('"from" repetido no mesmo select — o R4 não lê a forma')
        }
        continue
      }
      const bloco = { clausula: it.v, itens: [] }
      atualResto.push(bloco)
      atual = bloco.itens
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
  return { nome: partes.map(valorTok).join('.'), ultima: valorTok(partes.at(-1)), prox: j, qualificado: partes.length > 1 }
}

/** O alias (e a lista de colunas `x(a, b)`) depois de uma entrada do FROM — devolve o novo índice. */
function lerAlias(itens, i, entrada) {
  if (ehPalavra(itens[i], 'as')) i++
  const t = itens[i]
  const ehReservada = ehPalavra(t) && (PALAVRAS_DE_JUNCAO.has(t.v) || ['on', 'using', 'only'].includes(t.v))
  if (ehIdentTok(t) && !ehReservada) {
    entrada.alias = valorTok(t)
    i++
    if (ehGrupo(itens[i]) && !ehSubselectGrupo(itens[i])) i++ // lista de colunas do alias
  }
  return i
}

/**
 * Lê o FROM de um ramo em ENTRADAS, cada uma com o tipo (`tabela`/`cte`/`derivada`/`funcao`), o
 * alias, a junção por que entrou (`base`, `virgula`, `inner`, `cross`, `left`, `right`, `full`,
 * `desconhecida`), a marca `lateral` e os itens da condição `on`.
 * @param {any[]} itens
 * @param {Set<string>} nomesCte
 * @param {string[]} ilegiveis acumulador
 */
function lerFromLocal(itens, nomesCte, ilegiveis) {
  const entradas = []
  let palavras = []
  let virgula = false

  const novaEntrada = (e) => {
    let juncao
    if (entradas.length === 0) juncao = 'base'
    else if (virgula) juncao = 'virgula'
    else if (palavras.includes('full')) juncao = 'full'
    else if (palavras.includes('left')) juncao = 'left'
    else if (palavras.includes('right')) juncao = 'right'
    else if (palavras.includes('cross')) juncao = 'cross'
    else if (palavras.includes('join')) juncao = 'inner'
    else juncao = 'desconhecida'
    if (juncao === 'desconhecida') ilegiveis.push(`entrada do FROM sem junção reconhecível antes de "${e.nome ?? e.alias ?? 'subconsulta'}" — o R4 não lê a forma`)
    e.juncao = juncao
    e.lateral = palavras.includes('lateral')
    e.natural = palavras.includes('natural')
    e.on = null
    entradas.push(e)
    palavras = []
    virgula = false
  }

  let i = 0
  while (i < itens.length) {
    const it = itens[i]
    if (ehPunct(it, ',')) {
      virgula = true
      i++
      continue
    }
    if (ehPalavra(it) && PALAVRAS_DE_JUNCAO.has(it.v) && !(TAMBEM_NOME_DE_FUNCAO.has(it.v) && ehGrupo(itens[i + 1]))) {
      palavras.push(it.v)
      i++
      continue
    }
    if (ehPalavra(it, 'only')) {
      i++
      continue
    }
    if (ehPalavra(it, 'on')) {
      // a condição INTEIRA, até a próxima vírgula ou palavra de junção do FROM — um `grupo`
      // aninhado é opaco, então vírgula dentro de chamada de função não interrompe a varredura.
      i++
      const condicao = []
      while (
        i < itens.length &&
        !ehPunct(itens[i], ',') &&
        !(ehPalavra(itens[i]) && PALAVRAS_DE_JUNCAO.has(itens[i].v) && !(TAMBEM_NOME_DE_FUNCAO.has(itens[i].v) && ehGrupo(itens[i + 1])))
      ) {
        condicao.push(itens[i])
        i++
      }
      if (entradas.length > 0) entradas.at(-1).on = condicao
      continue
    }
    if (ehPalavra(it, 'using') && ehGrupo(itens[i + 1])) {
      i += 2 // igualdade implícita — não propaga cobertura (a mesa não sabe de que lado vem a coluna)
      continue
    }
    if (ehGrupo(it)) {
      if (ehSubselectGrupo(it)) {
        const e = { tipo: 'derivada', grupo: it, alias: null }
        novaEntrada(e)
        i = lerAlias(itens, i + 1, e)
      } else if (ehPalavra(it.itens[0], 'table') && ehIdentTok(it.itens[1]) && lerCadeiaItens(it.itens, 1).prox === it.itens.length) {
        // `(table public.movimentacoes) m` é `select * from public.movimentacoes` — leitura de
        // tabela como outra qualquer (revisão final da F60: era "pulada com segurança").
        const c = lerCadeiaItens(it.itens, 1)
        const ehCte = !c.qualificado && nomesCte.has(c.ultima)
        const e = ehCte ? { tipo: 'cte', nome: c.ultima, alias: c.ultima } : { tipo: 'tabela', nome: c.ultima, nomeCompleto: c.nome, alias: c.ultima }
        novaEntrada(e)
        i = lerAlias(itens, i + 1, e)
      } else {
        ilegiveis.push('junção ou expressão entre parênteses no FROM — o R4 não lê a forma; escreva as junções sem parênteses')
        i++
      }
      continue
    }
    if (ehIdentTok(it)) {
      const c = lerCadeiaItens(itens, i)
      if (ehGrupo(itens[c.prox])) {
        const doCatalogo = !c.qualificado || c.nome.startsWith('pg_catalog.')
        if (!(doCatalogo && FUNCOES_DE_FROM_SEM_LEITURA.has(c.ultima))) {
          ilegiveis.push(`chamada de função no FROM ("${c.nome}(…)") — o R4 não lê o que ela lê por dentro; leia as tabelas no próprio corpo`)
        }
        const e = { tipo: 'funcao', nome: c.ultima, alias: c.ultima }
        novaEntrada(e)
        i = lerAlias(itens, c.prox + 1, e)
        continue
      }
      const ehCte = !c.qualificado && nomesCte.has(c.ultima)
      // alias por omissão = o próprio nome da tabela/CTE, como o Postgres resolve.
      const e = ehCte ? { tipo: 'cte', nome: c.ultima, alias: c.ultima } : { tipo: 'tabela', nome: c.ultima, nomeCompleto: c.nome, alias: c.ultima }
      novaEntrada(e)
      i = lerAlias(itens, c.prox, e)
      continue
    }
    i++
  }
  return entradas
}

/**
 * As CONJUNÇÕES DIRETAS de uma condição (itens aninhados): divide no `and` de topo — o de
 * `between … and …` e os de dentro de `case … end` não contam —, abre grupos que são, eles mesmos,
 * conjunção pura, e devolve NADA quando há `or` de topo (nenhuma parte é garantida).
 * @param {any[]} itens
 * @returns {any[][]}
 */
function conjuncoesDiretas(itens) {
  const partes = []
  let atual = []
  let between = false
  let casos = 0
  for (const it of itens) {
    if (ehPalavra(it)) {
      if (it.v === 'case') casos++
      else if (it.v === 'end' && casos > 0) casos--
      else if (casos === 0) {
        if (it.v === 'or') return []
        if (it.v === 'between') between = true
        else if (it.v === 'and') {
          if (between) between = false
          else {
            partes.push(atual)
            atual = []
            continue
          }
        }
      }
    }
    atual.push(it)
  }
  partes.push(atual)
  const saida = []
  for (const p of partes) {
    if (p.length === 1 && ehGrupo(p[0]) && !ehSubselectGrupo(p[0])) saida.push(...conjuncoesDiretas(p[0].itens))
    else if (p.length > 0) saida.push(p)
  }
  return saida
}

const ehTokenPFiliais = (t) => (t?.tipo === 'ident' && t.v === 'p_filiais') || (t?.tipo === 'qident' && t.v.toLowerCase() === 'p_filiais')

/** A conjunção é uma ligação passante (`[q.]col = any (p_filiais)`, já aprovada por R2+R3)? */
function lerLigacaoConjuncao(p, posicoesPassantes) {
  const n = p.length
  const g = p[n - 1]
  if (!ehGrupo(g) || g.itens.length !== 1 || !ehTokenPFiliais(g.itens[0]) || !posicoesPassantes.has(g.itens[0].ini)) return null
  if (!ehPalavra(p[n - 2], 'any') || !(p[n - 3]?.tipo === 'op' && p[n - 3].v === '=')) return null
  if (n === 6 && ehIdentTok(p[0]) && ehPunct(p[1], '.') && ehIdentTok(p[2])) return { qualificador: valorTok(p[0]), coluna: valorTok(p[2]) }
  if (n === 4 && ehIdentTok(p[0])) return { qualificador: null, coluna: valorTok(p[0]) }
  return null
}

/** A conjunção é uma igualdade `a.x = b.y` entre dois aliases? */
function lerIgualdadeConjuncao(p) {
  if (p.length !== 7) return null
  const ok =
    ehIdentTok(p[0]) && ehPunct(p[1], '.') && ehIdentTok(p[2]) && p[3]?.tipo === 'op' && p[3].v === '=' && ehIdentTok(p[4]) && ehPunct(p[5], '.') && ehIdentTok(p[6])
  return ok ? { a: valorTok(p[0]), colA: valorTok(p[2]), b: valorTok(p[4]), colB: valorTok(p[6]) } : null
}

/** A igualdade é de CHAVE (a que liga linha a linha, não por coincidência de valor)? */
function ehIgualdadeDeChave(colA, colB) {
  const fk = (c) => c === 'id' || c.endsWith('_id')
  return (colA === 'id' && fk(colB)) || (colB === 'id' && fk(colA)) || (colA === 'filial_id' && colB === 'filial_id')
}

/**
 * A coluna da ligação é a do RECORTE da entrada? `filial_id` (a convenção universal do banco), ou
 * `id` quando a entrada é a própria tabela `filiais` (o padrão-guarda `where exists (select 1 from
 * public.filiais f where f.id = any (p_filiais))`) — "Furo 3" da revisão adversarial: `mov.id =
 * any (p_filiais)` casa R2/R3 e não é filial nenhuma.
 */
function colunaValida(lig, entrada) {
  if (lig.coluna === 'filial_id') return true
  return lig.coluna === 'id' && entrada.tipo === 'tabela' && entrada.nome === 'filiais'
}

/** Referências qualificadas `alias.coluna` em qualquer profundidade de `itens`. */
function referenciasQualificadas(itens, saida = []) {
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i]
    if (ehGrupo(it)) {
      referenciasQualificadas(it.itens, saida)
      continue
    }
    if (ehIdentTok(it) && ehPunct(itens[i + 1], '.') && ehIdentTok(itens[i + 2])) saida.push({ alias: valorTok(it), coluna: valorTok(itens[i + 2]) })
  }
  return saida
}

/** Os aliases que o FROM de topo de uma subconsulta declara — o que sombreia os de fora. */
function aliasesDeclarados(grupo, nomesCte) {
  const s = new Set()
  for (const r of segmentarComUniao(grupo.itens.slice(1), [])) {
    if (!r.from) continue
    for (const e of lerFromLocal(r.from, nomesCte, [])) if (e.alias) s.add(e.alias)
  }
  return s
}

/**
 * Acha, dentro de uma lista de itens (podendo ter grupos comuns aninhados), todo grupo-select que
 * NÃO é uma derivada de FROM (essas ficam em `excluir`, por identidade de objeto), dizendo se veio
 * imediatamente precedido de `exists`/`in` (o `wrapper`) na MESMA lista. Não desce dentro de um
 * grupo-select achado — o corpo dele é do escopo filho.
 */
function acharSubselects(itens, excluir = new Set()) {
  const achados = []
  const andar = (lista) => {
    for (let i = 0; i < lista.length; i++) {
      const it = lista[i]
      if (!ehGrupo(it)) continue
      if (ehSubselectGrupo(it)) {
        if (excluir.has(it)) continue
        const anterior = lista[i - 1]
        const wrapper = ehPalavra(anterior, 'exists', 'in') ? anterior.v : null
        achados.push({ grupo: it, wrapper })
      } else {
        andar(it.itens)
      }
    }
  }
  andar(itens)
  return achados
}

/**
 * Processa um `select` (itens depois do `select`), acumulando em `ambiente.violacoes` as tabelas
 * lidas fora do recorte e em `ambiente.ilegiveis` o que o R4 não lê. Devolve se TODO ramo depende
 * do recorte (a regra positiva — ver o cabeçalho da seção).
 * @param {any[]} itensAPartirDoSelect
 * @param {{ herda: boolean, visiveis: Set<string>, cobertos: Set<string> }} contexto `visiveis`: os
 *   aliases de fora que este escopo enxerga; `cobertos`: os que, entre eles, estão cobertos.
 * @param {{ nomesCte: Set<string>, ctesDependentes: Map<string, boolean>, posicoesPassantes: Set<number>, ilegiveis: string[], violacoes: {tabela:string}[] }} ambiente
 * @returns {boolean}
 */
function processarEscopo(itensAPartirDoSelect, contexto, ambiente) {
  const { nomesCte, ctesDependentes, posicoesPassantes, ilegiveis, violacoes } = ambiente
  const cobertosDeFora = contexto.herda ? contexto.cobertos : new Set()
  let todosDependem = true

  for (const ramo of segmentarComUniao(itensAPartirDoSelect, ilegiveis)) {
    const entradas = ramo.from ? lerFromLocal(ramo.from, nomesCte, ilegiveis) : []
    const locais = new Map()
    entradas.forEach((e, k) => {
      if (e.alias && !locais.has(e.alias)) locais.set(e.alias, k)
    })
    // O alias LOCAL sombreia o de fora; um alias que não é de ninguém não resolve.
    const resolver = (q) => {
      if (q === null) return entradas.length === 1 ? { local: 0 } : null
      if (locais.has(q)) return { local: locais.get(q) }
      if (contexto.visiveis.has(q)) return { fora: q }
      return null
    }

    // O lado NULÁVEL de cada junção externa, ao fim da cadeia de junções.
    const nulavel = entradas.map(() => false)
    entradas.forEach((e, k) => {
      if (e.juncao === 'left') nulavel[k] = true
      else if (e.juncao === 'right') for (let j = 0; j < k; j++) nulavel[j] = true
      else if (e.juncao === 'full') for (let j = 0; j <= k; j++) nulavel[j] = true
    })

    const blocosOnde = ramo.resto.filter((b) => b.clausula === 'where' || b.clausula === 'having')
    /** @type {{ c: any[], k: number|null }[]} `k`: a entrada em cujo `on` a conjunção está; `null` = where/having */
    const fatos = []
    for (const b of blocosOnde) for (const c of conjuncoesDiretas(b.itens)) fatos.push({ c, k: null })
    entradas.forEach((e, k) => {
      if (e.on) for (const c of conjuncoesDiretas(e.on)) fatos.push({ c, k })
    })

    const juncaoDe = (k) => (k === null ? 'where' : entradas[k].juncao)
    const ehInterna = (j) => ['where', 'base', 'virgula', 'inner', 'cross'].includes(j)

    const cobertos = new Set()
    let depende = false

    // 2. ligações
    for (const { c, k } of fatos) {
      const lig = lerLigacaoConjuncao(c, posicoesPassantes)
      if (!lig) continue
      if (k === null) depende = true // no where/having, nulo ou vazio zera o ramo
      const r = resolver(lig.qualificador)
      if (!r || r.local === undefined || !colunaValida(lig, entradas[r.local])) continue
      const j = juncaoDe(k)
      const cobre = ehInterna(j) ? k === null || r.local <= k : j === 'left' ? r.local === k : j === 'right' ? r.local < k : false
      if (cobre) cobertos.add(r.local)
    }

    // 3–5. propagação até parar de mudar
    const igualdades = fatos
      .map(({ c, k }) => ({ ig: lerIgualdadeConjuncao(c), k }))
      .filter((x) => x.ig !== null && ehIgualdadeDeChave(x.ig.colA, x.ig.colB))
    const lateraisLidas = entradas
      .map((e, k) => {
        if (e.tipo !== 'derivada' || !e.lateral || !ehInterna(e.juncao)) return null
        const sombra = aliasesDeclarados(e.grupo, nomesCte)
        const lidas = new Set()
        for (const ref of referenciasQualificadas(e.grupo.itens)) {
          if (ref.coluna !== 'filial_id' || sombra.has(ref.alias) || !locais.has(ref.alias)) continue
          const alvo = locais.get(ref.alias)
          if (alvo < k) lidas.add(alvo)
        }
        return { k, lidas }
      })
      .filter(Boolean)

    /** A igualdade escrita em `k` leva a cobertura de `de` (local, ou `null` = de fora) para `para`? */
    const propaga = (k, de, para) => {
      const j = juncaoDe(k)
      if (ehInterna(j)) return k === null || ((de === null || de <= k) && para <= k)
      if (j === 'left') return para === k && (de === null || de < k)
      if (j === 'right') return para < k && (de === null || de === k)
      return false
    }

    let mudou = true
    while (mudou) {
      mudou = false
      const cobrir = (idx) => {
        if (!cobertos.has(idx)) {
          cobertos.add(idx)
          mudou = true
        }
      }
      for (const { ig, k } of igualdades) {
        const ra = resolver(ig.a)
        const rb = resolver(ig.b)
        if (!ra || !rb) continue
        for (const [de, para] of [
          [ra, rb],
          [rb, ra],
        ]) {
          if (para.local === undefined) continue
          if (de.local !== undefined) {
            if (de.local !== para.local && cobertos.has(de.local) && propaga(k, de.local, para.local)) cobrir(para.local)
          } else if (cobertosDeFora.has(de.fora) && propaga(k, null, para.local)) {
            cobrir(para.local)
          }
        }
      }
      for (const { k, lidas } of lateraisLidas) {
        if (!cobertos.has(k)) continue
        for (const idx of lidas) cobrir(idx)
      }
    }

    // 6. violações
    entradas.forEach((e, k) => {
      if (e.tipo === 'tabela' && !cobertos.has(k) && !TABELAS_SEM_FILIAL.includes(e.nome)) violacoes.push({ tabela: e.nome })
    })

    // a regra positiva — entrada coberta fora do lado nulável, ou CTE não-nulável que depende
    if ([...cobertos].some((k) => !nulavel[k])) depende = true
    if (entradas.some((e, k) => e.tipo === 'cte' && !nulavel[k] && ctesDependentes.get(e.nome) === true)) depende = true

    // os escopos filhos
    const aliasCobertos = new Set([...cobertos].map((k) => entradas[k].alias).filter(Boolean))
    const gruposDerivadas = new Set()
    entradas.forEach((e, k) => {
      if (e.tipo !== 'derivada') return
      gruposDerivadas.add(e.grupo)
      if (!ehPalavra(e.grupo.itens[0], 'select', 'values')) {
        ilegiveis.push('"with" dentro de subconsulta — o R4 não lê a forma; suba a CTE para o topo do corpo')
        return
      }
      const anteriores = e.lateral ? entradas.slice(0, k) : []
      const visiveis = new Set([...contexto.visiveis, ...anteriores.map((x) => x.alias).filter(Boolean)])
      const cobertosFilho = new Set([...cobertosDeFora, ...anteriores.map((x, j) => (cobertos.has(j) ? x.alias : null)).filter(Boolean)])
      const dependeFilho = processarEscopo(e.grupo.itens.slice(1), { herda: true, visiveis, cobertos: cobertosFilho }, ambiente)
      if (dependeFilho && !nulavel[k]) depende = true
    })

    const visiveisSub = new Set([...contexto.visiveis, ...locais.keys()])
    const cobertosSub = new Set([...cobertosDeFora, ...aliasCobertos])
    const guardas = new Set(
      fatos
        .filter((f) => f.k === null && f.c.length === 2 && ehPalavra(f.c[0], 'exists') && ehSubselectGrupo(f.c[1]))
        .map((f) => f.c[1]),
    )
    const processarSub = (grupo, herda) => {
      if (!ehPalavra(grupo.itens[0], 'select', 'values')) {
        ilegiveis.push('"with" dentro de subconsulta — o R4 não lê a forma; suba a CTE para o topo do corpo')
        return false
      }
      return processarEscopo(grupo.itens.slice(1), { herda, visiveis: visiveisSub, cobertos: herda ? cobertosSub : new Set() }, ambiente)
    }
    // where/having e as condições `on` (que moram nos itens do from): exists/in herdam
    for (const bloco of [...blocosOnde.map((b) => b.itens), ramo.from ?? []]) {
      for (const achado of acharSubselects(bloco, gruposDerivadas)) {
        const dependeSub = processarSub(achado.grupo, achado.wrapper !== null)
        if (dependeSub && guardas.has(achado.grupo)) depende = true
      }
    }
    // group/order/limit/offset/window/fetch/for e a lista do select: NUNCA herdam
    for (const bloco of [...ramo.resto.filter((b) => b.clausula !== 'where' && b.clausula !== 'having').map((b) => b.itens), ramo.alvo]) {
      for (const achado of acharSubselects(bloco, gruposDerivadas)) processarSub(achado.grupo, false)
    }

    if (!depende) todosDependem = false
  }
  return todosDependem
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
    if (ehPalavra(itensAPartirDoWith[i], 'not') && ehPalavra(itensAPartirDoWith[i + 1], 'materialized')) i += 2
    else if (ehPalavra(itensAPartirDoWith[i], 'materialized')) i++
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
 * Quantos comandos de topo há num corpo — `;` fora de parênteses separa comandos.
 * @param {{tipo:string, v:string}[]} tokens
 */
function contarComandosDeTopo(tokens) {
  let prof = 0
  let comandos = 0
  let noComando = false
  for (const t of tokens) {
    if (ehPunct(t, ';') && prof === 0) {
      noComando = false
      continue
    }
    if (!noComando) {
      comandos++
      noComando = true
    }
    if (ehPunct(t, '(')) prof++
    else if (ehPunct(t, ')')) prof--
  }
  return comandos
}

/**
 * Julga R4 para um corpo: `{ ok, violacoes: [{ tabela }], dependeDoRecorte, ilegivel? }`.
 * @param {string} corpo
 * @param {{ onde: number }[]} ligacoesPassantes as que passaram R2+R3 (`ligacoesDoParametro`)
 */
export function checarR4(corpo, ligacoesPassantes) {
  const { tokens } = lexar(corpo)
  // Revisão final da F60: com mais de um comando, uma função `language sql` devolve o resultado do
  // ÚLTIMO — e o R4, que tirava os `;` e lia tudo como um select só, julgava o primeiro (recortado)
  // e deixava o segundo (sem recorte) escondido num bloco que ninguém lia.
  const comandos = contarComandosDeTopo(tokens)
  if (comandos > 1) {
    return {
      ok: false,
      violacoes: [],
      dependeDoRecorte: false,
      ilegivel: `corpo com ${comandos} comandos — função sql devolve o resultado do ÚLTIMO, e o R4 julga um select só; escreva o corpo como um único comando`,
    }
  }
  const tk = tokens.filter((t) => !(t.tipo === 'punct' && t.v === ';'))
  let itens
  try {
    itens = aninharLocal(tk)
  } catch (err) {
    return { ok: false, violacoes: [], dependeDoRecorte: false, ilegivel: err.message }
  }

  const ambiente = {
    nomesCte: new Set(),
    ctesDependentes: new Map(),
    posicoesPassantes: new Set(ligacoesPassantes.map((l) => l.onde)),
    ilegiveis: [],
    violacoes: [],
  }
  const semHeranca = () => ({ herda: false, visiveis: new Set(), cobertos: new Set() })
  let depende
  if (ehPalavra(itens[0], 'with')) {
    const w = lerWith(itens.slice(1))
    if (!w) return { ok: false, violacoes: [], dependeDoRecorte: false, ilegivel: 'corpo com "with" em formato que o R4 não lê' }
    // todo nome de CTE fica visível para as OUTRAS ctes e para o select final — sem isso, "from
    // niveis n" seria lido como leitura da tabela-base "niveis". Cada CTE é escopo PRÓPRIO, nunca
    // herda; e se ela DEPENDE do recorte fica anotado para quem a lê depois.
    for (const c of w.ctes) ambiente.nomesCte.add(c.nome)
    for (const cte of w.ctes) {
      if (!ehPalavra(cte.grupo.itens[0], 'select')) {
        ambiente.ilegiveis.push(`CTE "${cte.nome}" que não é select simples — o R4 não lê a forma`)
        continue
      }
      ambiente.ctesDependentes.set(cte.nome, processarEscopo(cte.grupo.itens.slice(1), semHeranca(), ambiente))
    }
    depende = processarEscopo(w.itensSelectPrincipal, semHeranca(), ambiente)
  } else if (ehPalavra(itens[0], 'select')) {
    depende = processarEscopo(itens.slice(1), semHeranca(), ambiente)
  } else {
    return { ok: false, violacoes: [], dependeDoRecorte: false, ilegivel: 'corpo que não começa com "select" nem "with" — R4 não lê' }
  }

  if (ambiente.ilegiveis.length > 0) {
    return { ok: false, violacoes: ambiente.violacoes, dependeDoRecorte: depende, ilegivel: [...new Set(ambiente.ilegiveis)].join('; ') }
  }
  return { ok: ambiente.violacoes.length === 0 && depende, violacoes: ambiente.violacoes, dependeDoRecorte: depende }
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
    if (lig.ocorrencias === 0) {
      violacoes.push({
        funcao,
        regra: 'R2',
        mensagem: `${chave} (${def.arquivo}:${def.linha}) — R2: declara "p_filiais" e não usa no corpo`,
      })
      continue
    }

    const r4 = checarR4(def.corpo, lig.passantes)
    if (r4.ilegivel) {
      violacoes.push({ funcao, regra: 'R4', mensagem: `${chave} (${def.arquivo}:${def.linha}) — R4: corpo ilegível para o escopo (${r4.ilegivel})` })
      continue
    }
    if (!r4.ok) {
      // UMA violação por função, com as duas metades do R4 quando houver as duas.
      const partes = []
      if (r4.violacoes.length > 0) {
        partes.push(`lê ${[...new Set(r4.violacoes.map((v) => v.tabela))].join(', ')} fora do recorte (tabela sem ligação própria nem cobertura por chave, junção ou herança)`)
      }
      if (!r4.dependeDoRecorte) {
        partes.push('o resultado não depende do recorte — com p_filiais nulo ou vazio algum ramo do select de topo ainda devolve linhas (fato 7)')
      }
      violacoes.push({ funcao, regra: 'R4', mensagem: `${chave} (${def.arquivo}:${def.linha}) — R4: ${partes.join('; ')}` })
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
