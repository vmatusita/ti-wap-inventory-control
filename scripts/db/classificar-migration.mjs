// =============================================================================
// classificar-migration.mjs — o LEITOR ÚNICO e o CLASSIFICADOR de migrations (F63)
// =============================================================================
// POR QUE ELE EXISTE (docs/PLAN-F63.md, decisões 3 e 5)
//
// Até a F62 havia três leitores de migration espalhados pelos testes, todos fracos do
// mesmo jeito: `semComentarios` tirava só a linha que COMEÇA com `--`, e
// `semCorposDeFuncao` tirava só `$$ … $$`. Medido na cadeia de 157 arquivos (fato 14):
// 12 arquivos usam dollar-quote com RÓTULO (`$function$`, `$smoke$`, `$recopia$` …) que
// aquele leitor não enxerga; 2 têm `$$` DENTRO de comentário (0133, 0150); e 10 têm
// bloco `do` de topo — cinco deles escrevendo dado —, que `semCorposDeFuncao` APAGAVA
// como se fosse corpo de função guardado. Um `do $$ … $$` é EXECUTADO no apply: um
// `update` de backfill dentro dele passava reto pela guarda de topo (a 0133 passou).
//
// Este módulo é o leitor ÚNICO: a guarda de topo de `migrations-f38.test.ts` e o
// classificador daqui leem pelo MESMO léxico. Ele imita o léxico do Postgres, na ordem
// em que o Postgres lê:
//   · comentário de linha (`--`) e de bloco (`/* */`, que ANINHA no Postgres) só contam
//     fora de texto, identificador citado e dollar-quote — por isso um `$$` escrito num
//     comentário não abre corpo nenhum, e um `--` dentro de texto não é comentário;
//   · texto `'…'` (com `''`), `E'…'` (com `\'`), identificador `"…"` (com `""`);
//   · dollar-quote `$$ … $$` ou `$rótulo$ … $rótulo$` (o rótulo não começa com dígito:
//     `$1` é parâmetro).
// Depois do léxico:
//   · o corpo de `create [or replace] function|procedure` é TEXTO GUARDADO — sai;
//   · o corpo de `do` é CÓDIGO EXECUTADO — entra, lido de novo pelo mesmo léxico, e cada
//     comando dele vira comando executado com `origem: 'do'`.
//
// FALHA FECHADA. Dollar-quote, texto, identificador ou comentário de bloco sem fecho
// LANÇA `LeituraIlegivel` com o trecho, em vez de devolver menos: uma guarda que pula o
// que não entendeu é a mesma cegueira com outra cara (a lição da F60 sobre o leitor de
// nome de rotina). Comando que o leitor LÊ mas não sabe CLASSIFICAR não lança: vira o
// veredito ILEGÍVEL, que reprova a partir da 0159 e só é registrado no censo abaixo
// dela. Assim ler as 157 sem lançar (critério 9) e a falha fechada convivem.
//
// ⚠ O QUE ELE NÃO VÊ (e o relatório diz): é leitor ESTÁTICO. SQL dinâmico (`execute`) e
// função chamada no apply não são vistos por dentro — por isso os dois viram ILEGÍVEL,
// nunca ADITIVA. Um CHECK ou índice que chame função que escreve também não é visto.
//
// ⚠ ESTE MÓDULO NÃO FALA COM BANCO e não tem dependência: é testável na mesa
// (`src/lib/validators/migrations-backfill.test.ts` e o censo de toda a cadeia).
// =============================================================================

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** As classes, em ordem crescente de risco sobre DADO. */
export const CLASSES = /** @type {const} */ (['ADITIVA', 'BACKFILL', 'DESTRUTIVA'])
export const ILEGIVEL = 'ILEGÍVEL'

/** A partir desta migration o cabeçalho é obrigatório e a classe é conferida (F63). */
export const PRIMEIRA_COM_REGRA = '0159'

/** A tabela do par de backup (0159). */
export const TABELA_BACKUP = 'public.backups_migration'

/** O leitor não soube ler: delimitador sem fecho. Sempre com o trecho. */
export class LeituraIlegivel extends Error {}

function trecho(sql, i) {
  return sql.slice(Math.max(0, i - 40), i + 80).replace(/\s+/g, ' ')
}

function ilegivel(motivo, sql, i) {
  return new LeituraIlegivel(`${motivo} — ilegível para o classificador perto de «${trecho(sql, i)}»`)
}

// -----------------------------------------------------------------------------
// 1. O LÉXICO — o mesmo do Postgres, só no que muda o que é código
// -----------------------------------------------------------------------------

const CARACTERE_DE_IDENT = /[A-Za-z0-9_$\u0080-￿]/
const DOLLAR_QUOTE = /^\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/

/**
 * Os tokens do SQL, em ordem, cobrindo o texto INTEIRO (a concatenação dos `texto` devolve
 * a entrada byte a byte).
 *   · `codigo`     — o resto;
 *   · `comentario` — `-- …` (sem a quebra de linha) ou `/* … *\/` (aninhado);
 *   · `texto`      — `'…'`, com `''` e, se precedido de `E`, com `\'`;
 *   · `ident`      — `"…"`, com `""`;
 *   · `dolar`      — `$rótulo$ … $rótulo$`, com `corpo` (o que fica entre os rótulos).
 * @param {string} sql
 * @returns {{ tipo: 'codigo'|'comentario'|'texto'|'ident'|'dolar', ini: number, fim: number, texto: string, corpo?: string, rotulo?: string }[]}
 */
export function lexar(sql) {
  const toks = []
  const n = sql.length
  let i = 0
  let codigoIni = 0
  const fecharCodigo = (fim) => {
    if (fim > codigoIni) toks.push({ tipo: 'codigo', ini: codigoIni, fim, texto: sql.slice(codigoIni, fim) })
  }
  const empurrar = (tipo, ini, fim, extra = {}) => {
    fecharCodigo(ini)
    toks.push({ tipo, ini, fim, texto: sql.slice(ini, fim), ...extra })
    i = fim
    codigoIni = fim
  }
  while (i < n) {
    const c = sql[i]
    const d = sql[i + 1]
    if (c === '-' && d === '-') {
      let j = sql.indexOf('\n', i)
      if (j < 0) j = n
      empurrar('comentario', i, j)
      continue
    }
    if (c === '/' && d === '*') {
      let prof = 0
      let j = i
      while (j < n) {
        if (sql[j] === '/' && sql[j + 1] === '*') {
          prof++
          j += 2
        } else if (sql[j] === '*' && sql[j + 1] === '/') {
          prof--
          j += 2
          if (prof === 0) break
        } else {
          j++
        }
      }
      if (prof !== 0) throw ilegivel('comentário de bloco sem fecho', sql, i)
      empurrar('comentario', i, j)
      continue
    }
    if (c === "'") {
      // `E'…'` (ou `e'…'`): a barra invertida escapa. O `E` tem de ser palavra solta —
      // `nome'` não é prefixo de nada.
      const comBarra = i > 0 && /[eE]/.test(sql[i - 1]) && !(i > 1 && CARACTERE_DE_IDENT.test(sql[i - 2]))
      let j = i + 1
      for (;;) {
        if (j >= n) throw ilegivel('texto sem fecho', sql, i)
        const ch = sql[j]
        if (comBarra && ch === '\\') {
          j += 2
          continue
        }
        if (ch === "'") {
          if (sql[j + 1] === "'") {
            j += 2
            continue
          }
          j++
          break
        }
        j++
      }
      empurrar('texto', i, j)
      continue
    }
    if (c === '"') {
      let j = i + 1
      for (;;) {
        if (j >= n) throw ilegivel('identificador citado sem fecho', sql, i)
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') {
            j += 2
            continue
          }
          j++
          break
        }
        j++
      }
      empurrar('ident', i, j)
      continue
    }
    if (c === '$' && !(i > 0 && CARACTERE_DE_IDENT.test(sql[i - 1]))) {
      const m = DOLLAR_QUOTE.exec(sql.slice(i, i + 80))
      if (m) {
        const rotulo = m[0]
        const fechoEm = sql.indexOf(rotulo, i + rotulo.length)
        if (fechoEm < 0) throw ilegivel(`dollar-quote ${rotulo} sem fecho`, sql, i)
        empurrar('dolar', i, fechoEm + rotulo.length, {
          rotulo,
          corpo: sql.slice(i + rotulo.length, fechoEm),
          corpoIni: i + rotulo.length,
        })
        continue
      }
    }
    i++
  }
  fecharCodigo(n)
  return toks
}

/**
 * O SQL sem NENHUM comentário (linha inteira, fim de linha e bloco aninhado), com texto,
 * identificador e corpo dollar-quoted intactos. É o `semComentarios` do leitor único: o
 * de antes da F63 só tirava a linha que começava com `--`.
 * @param {string} sql
 */
export function semComentarios(sql) {
  return lexar(sql)
    .map((t) => (t.tipo === 'comentario' ? (t.texto.startsWith('--') ? '' : ' ') : t.texto))
    .join('')
}

// -----------------------------------------------------------------------------
// 2. OS COMANDOS EXECUTADOS — o que o apply RODA
// -----------------------------------------------------------------------------

/** Parte a lista de tokens em comandos, no `;` que está em código. */
function partirEmComandos(toks) {
  const comandos = []
  let atual = []
  const fechar = () => {
    if (atual.some((t) => t.tipo !== 'comentario' && !(t.tipo === 'codigo' && !t.texto.trim()))) comandos.push(atual)
    atual = []
  }
  for (const t of toks) {
    if (t.tipo !== 'codigo' || !t.texto.includes(';')) {
      atual.push(t)
      continue
    }
    let ini = 0
    for (let k = 0; k < t.texto.length; k++) {
      if (t.texto[k] !== ';') continue
      if (k > ini) atual.push({ tipo: 'codigo', ini: t.ini + ini, fim: t.ini + k, texto: t.texto.slice(ini, k) })
      fechar()
      ini = k + 1
    }
    if (ini < t.texto.length) atual.push({ tipo: 'codigo', ini: t.ini + ini, fim: t.fim, texto: t.texto.slice(ini) })
  }
  fechar()
  return comandos
}

/** As primeiras palavras de CÓDIGO do comando, em minúsculas (o "cabeçalho"). */
function cabecaDe(toks) {
  return toks
    .filter((t) => t.tipo === 'codigo' || t.tipo === 'ident' || t.tipo === 'texto' || t.tipo === 'dolar')
    .map((t) => (t.tipo === 'codigo' ? t.texto : ' ¤ '))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
    .toLowerCase()
}

const CRIA_ROTINA = /^create\s+(?:or\s+replace\s+)?(?:function|procedure)\b/
const E_DO = /^do\b/

/**
 * `bruto`: o comando SEM comentário, com texto e identificador VERBATIM e o corpo de
 * função trocado por `$corpo$`. `mascarado`: o MESMO comprimento de `bruto`, com o
 * conteúdo de texto e de dollar-quote trocado por `_` — casar padrão em `mascarado` não
 * enxerga palavra de dentro de texto, e o índice achado nele vale em `bruto`.
 */
function montar(toks, { corpoGuardado }) {
  let bruto = ''
  let mascarado = ''
  for (const t of toks) {
    if (t.tipo === 'comentario') {
      const troca = t.texto.startsWith('--') ? '' : ' '
      bruto += troca
      mascarado += troca
    } else if (t.tipo === 'codigo' || t.tipo === 'ident') {
      bruto += t.texto
      mascarado += t.texto
    } else if (t.tipo === 'dolar' && corpoGuardado === t) {
      bruto += '$corpo$'
      mascarado += '$corpo$'
    } else {
      // texto ou dollar-quote que não é corpo de rotina: uma CONSTANTE de texto.
      bruto += t.texto
      mascarado += t.texto[0] + '_'.repeat(Math.max(0, t.texto.length - 2)) + t.texto[t.texto.length - 1]
    }
  }
  return { bruto: bruto.trim() ? bruto : '', mascarado }
}

/**
 * Os comandos que o apply EXECUTA, em ordem: os de topo e, no lugar de cada `do`, os
 * comandos do corpo dele (`origem: 'do'`). O corpo de `create function|procedure` sai
 * (é texto guardado), mesmo dentro de um `do`. LANÇA `LeituraIlegivel` no que não sabe
 * ler.
 * @param {string} sql
 * @returns {{ bruto: string, mascarado: string, cabeca: string, origem: 'topo'|'do', ini: number }[]}
 */
export function comandosExecutados(sql) {
  return lerComandos(sql, 'topo', 0, 0)
}

function lerComandos(sql, origem, base, profundidade) {
  if (profundidade > 4) throw ilegivel('`do` aninhado fundo demais', sql, 0)
  const saida = []
  for (const toks of partirEmComandos(lexar(sql))) {
    // Dentro de `do`, o comando vem depois do prefixo de controle do plpgsql (`begin`, `then`,
    // `loop`…): `begin create function … $g$ … $g$` continua sendo corpo GUARDADO.
    const cabeca = origem === 'do' ? separarControle(cabecaDe(toks)).comando.toLowerCase() : cabecaDe(toks)
    const ini = base + (toks.find((t) => t.tipo !== 'comentario' && (t.tipo !== 'codigo' || t.texto.trim()))?.ini ?? toks[0].ini)
    if (E_DO.test(cabeca)) {
      // DO [ LANGUAGE nome ] código — o LANGUAGE pode vir antes ou depois (doc do PG 17).
      const corpo = toks.find((t) => t.tipo === 'dolar' || t.tipo === 'texto')
      if (!corpo) throw ilegivel('`do` sem corpo', sql, toks[0].ini)
      const lingua = /\blanguage\s+("?)([a-z_]+)\1/i.exec(toks.filter((t) => t.tipo === 'codigo' || t.tipo === 'ident').map((t) => t.texto).join(' '))
      if (lingua && lingua[2].toLowerCase() !== 'plpgsql') {
        saida.push({ bruto: `/* do em ${lingua[2]} */`, mascarado: `/* do em ${lingua[2]} */`, cabeca: 'do?', origem, ini, ilegivel: `bloco do em ${lingua[2]}` })
        continue
      }
      const texto = corpo.tipo === 'dolar' ? corpo.corpo : corpo.texto.slice(1, -1).replaceAll("''", "'")
      const inicioDoCorpo = base + (corpo.tipo === 'dolar' ? corpo.corpoIni : corpo.ini + 1)
      saida.push(...lerComandos(texto, 'do', inicioDoCorpo, profundidade + 1))
      continue
    }
    let corpoGuardado = null
    if (CRIA_ROTINA.test(cabeca)) {
      corpoGuardado = toks.find((t) => t.tipo === 'dolar') ?? null
      if (!corpoGuardado && !toks.some((t) => t.tipo === 'texto') && !/\breturn\b|\bbegin\s+atomic\b/.test(cabeca)) {
        throw ilegivel('`create function` sem corpo reconhecível', sql, toks[0].ini)
      }
    }
    const { bruto, mascarado } = montar(toks, { corpoGuardado })
    if (!bruto.trim()) continue
    saida.push({ bruto: bruto.trim(), mascarado: mascarado.trim(), cabeca, origem, ini })
  }
  return saida
}

/**
 * O texto que o apply EXECUTA, num só texto: sem comentário, sem corpo de função, com o
 * corpo de todo `do` no lugar dele. É o que a guarda de topo de
 * `src/lib/itens/migrations-f38.test.ts` lê desde a F63.
 * @param {string} sql
 */
export function textoExecutado(sql) {
  return comandosExecutados(sql)
    .map((c) => c.bruto)
    .join(';\n')
}

// -----------------------------------------------------------------------------
// 3. A LEITURA DE UM COMANDO — alvos de escrita, chamadas, válvulas
// -----------------------------------------------------------------------------

/**
 * TODOS os comandos de um texto SQL — os executados E os guardados num corpo dollar-quoted (de
 * função, de `do`) —, partidos no `;` que está em CÓDIGO, com o texto entre aspas trocado por `''`
 * e sem comentário; o corpo dollar-quoted é código de novo, e fronteira de comando. Para as travas
 * que procuram uma LEITURA onde quer que ela esteja escrita (a de "ninguém lê `empresa_id`", o
 * describe 5 de `catalogos-seguranca`), e não o que o apply executa (2ª rodada da revisão adversarial
 * da F63: o `split(';')` cru partia `'estado; transição'` ao meio, e o alias ficava no outro pedaço).
 * @param {string} sql
 * @returns {string[]}
 */
export function comandosDoTexto(sql) {
  const comandos = []
  let atual = ''
  const fechar = () => {
    if (atual.trim()) comandos.push(atual)
    atual = ''
  }
  const andar = (s) => {
    for (const t of lexar(s)) {
      if (t.tipo === 'dolar') {
        fechar()
        andar(t.corpo ?? '')
        fechar()
      } else if (t.tipo === 'texto') atual += "''"
      else if (t.tipo === 'comentario') atual += ' '
      else if (t.tipo === 'ident') atual += t.texto
      else
        t.texto.split(';').forEach((parte, k) => {
          if (k > 0) fechar()
          atual += parte
        })
    }
  }
  andar(sql)
  fechar()
  return comandos
}

// `[esquema.]nome`, cada parte nua (minúsculas) ou citada (exata).
const PARTE = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)`
const NOME_QUALIFICADO = String.raw`${PARTE}(?:\s*\.\s*${PARTE})?`

function normalizarNome(nome) {
  const partes = []
  const re = new RegExp(PARTE, 'g')
  for (const m of nome.matchAll(re)) {
    const p = m[0]
    partes.push(p.startsWith('"') ? p.slice(1, -1).replaceAll('""', '"') : p.toLowerCase())
  }
  return partes.length === 1 ? `public.${partes[0]}` : `${partes[0]}.${partes[1]}`
}

const PALAVRAS_NAO_ALIAS = new Set([
  'set', 'where', 'from', 'using', 'on', 'returning', 'default', 'values', 'select', 'as',
  'when', 'then', 'with', 'overriding', 'union', 'order', 'group', 'limit',
])

/**
 * Os ALVOS de escrita de um comando, lidos no texto MASCARADO (texto de dentro de aspa
 * não conta). Cada alvo: `{ verbo, tabela, pos }`, com `verbo` em
 * update · delete · insert · upsert (insert … on conflict … do update) · merge · truncate.
 */
function alvosDeEscrita(mascarado) {
  const alvos = []
  const achar = (re, verbo) => {
    for (const m of mascarado.matchAll(re)) {
      alvos.push({ verbo, tabela: normalizarNome(m[1]), pos: m.index })
    }
  }
  // `update [only] t [ [as] alias ] set` — o alias é o que a regex antiga não via
  // (`update public.movimentacoes m set …`, a 0133).
  for (const m of mascarado.matchAll(new RegExp(String.raw`\bupdate\s+(?:only\s+)?(${NOME_QUALIFICADO})(?:\s+(?:as\s+)?(${PARTE}))?\s+set\b`, 'gi'))) {
    if (m[2] && PALAVRAS_NAO_ALIAS.has(m[2].toLowerCase())) continue
    alvos.push({ verbo: 'update', tabela: normalizarNome(m[1]), pos: m.index })
  }
  achar(new RegExp(String.raw`\bdelete\s+from\s+(?:only\s+)?(${NOME_QUALIFICADO})`, 'gi'), 'delete')
  achar(new RegExp(String.raw`\bmerge\s+into\s+(?:only\s+)?(${NOME_QUALIFICADO})`, 'gi'), 'merge')
  for (const m of mascarado.matchAll(new RegExp(String.raw`\binsert\s+into\s+(${NOME_QUALIFICADO})`, 'gi'))) {
    const upsert = /\bon\s+conflict\b[\s\S]*?\bdo\s+update\b/i.test(mascarado.slice(m.index))
    alvos.push({ verbo: upsert ? 'upsert' : 'insert', tabela: normalizarNome(m[1]), pos: m.index })
  }
  // `truncate [table] [only] a, b [cascade]`
  for (const m of mascarado.matchAll(/\btruncate\s+(?:table\s+)?([^;]*)/gi)) {
    const lista = m[1].replace(/\b(?:restart|continue)\s+identity\b|\bcascade\b|\brestrict\b|\bonly\b/gi, ' ')
    for (const nome of lista.split(',')) {
      const t = nome.trim()
      if (t) alvos.push({ verbo: 'truncate', tabela: normalizarNome(t.replace(/\s*\*\s*$/, '')), pos: m.index })
    }
  }
  return alvos
}

/** As tabelas que um comando CRIA (`create [temp] table [if not exists] x`). */
function tabelasCriadas(mascarado) {
  const criadas = []
  for (const m of mascarado.matchAll(new RegExp(String.raw`\bcreate\s+(?:(?:global|local)\s+)?(?:(?:temp|temporary|unlogged)\s+)?table\s+(?:if\s+not\s+exists\s+)?(${NOME_QUALIFICADO})`, 'gi'))) {
    criadas.push(normalizarNome(m[1]))
  }
  return criadas
}

/**
 * A LISTA FECHADA de funções que o classificador aceita ver CHAMADAS no apply sem virar
 * ILEGÍVEL: as do Postgres que só leem ou calculam (e os nomes de tipo, que a sintaxe
 * `numeric(10,2)` faz parecer chamada), mais UMA do projeto, `empresa_legada()` — `sql
 * stable` que devolve uma constante (0152), amarrada ao espelho TS por teste. Qualquer
 * outro nome chamado no apply é uma função que o leitor estático não vê por dentro, e
 * pode escrever: ILEGÍVEL. Crescer esta lista é decisão escrita, como toda exceção
 * nominal desta casa.
 */
export const FUNCOES_SEM_ESCRITA = new Set([
  // agregados e janelas
  'count', 'sum', 'min', 'max', 'avg', 'bool_and', 'bool_or', 'every', 'array_agg', 'string_agg',
  'jsonb_agg', 'json_agg', 'jsonb_object_agg', 'json_object_agg', 'row_number', 'rank',
  'dense_rank', 'lag', 'lead', 'first_value', 'last_value', 'ntile',
  // condicionais e comparação
  'coalesce', 'nullif', 'greatest', 'least', 'num_nonnulls', 'num_nulls',
  // texto
  'md5', 'sha256', 'encode', 'decode', 'lower', 'upper', 'initcap', 'btrim', 'trim', 'ltrim',
  'rtrim', 'length', 'char_length', 'octet_length', 'substr', 'substring', 'replace',
  'translate', 'regexp_replace', 'regexp_match', 'regexp_matches', 'regexp_split_to_array',
  'regexp_split_to_table', 'split_part', 'concat', 'concat_ws', 'format', 'left', 'right',
  'lpad', 'rpad', 'position', 'strpos', 'starts_with', 'repeat', 'reverse', 'quote_ident',
  'quote_literal', 'quote_nullable', 'string_to_array', 'array_to_string', 'unaccent', 'chr',
  'ascii', 'to_char', 'to_number', 'to_date', 'to_timestamp', 'normalize',
  // números e datas
  'abs', 'round', 'floor', 'ceil', 'ceiling', 'mod', 'trunc', 'div', 'power', 'sqrt',
  'now', 'current_setting', 'clock_timestamp', 'statement_timestamp', 'transaction_timestamp',
  'timezone', 'date_trunc', 'date_part', 'extract', 'age', 'make_date', 'make_time',
  'make_timestamp', 'make_timestamptz', 'make_interval', 'isfinite', 'justify_interval',
  // json e arrays
  'to_jsonb', 'to_json', 'row_to_json', 'jsonb_build_object', 'jsonb_build_array',
  'json_build_object', 'json_build_array', 'jsonb_typeof', 'json_typeof',
  'jsonb_array_length', 'jsonb_array_elements', 'jsonb_array_elements_text', 'jsonb_each',
  'jsonb_each_text', 'jsonb_object_keys', 'jsonb_set', 'jsonb_insert', 'jsonb_strip_nulls',
  'jsonb_path_query', 'jsonb_path_exists', 'jsonb_extract_path', 'jsonb_extract_path_text',
  'jsonb_populate_record', 'jsonb_to_record', 'jsonb_to_recordset', 'jsonb_pretty',
  'array_length', 'array_position', 'array_positions', 'array_remove', 'array_append',
  'array_prepend', 'array_cat', 'array_fill', 'cardinality', 'unnest', 'generate_series',
  'generate_subscripts', 'array_lower', 'array_upper',
  // catálogo (só leitura)
  'to_regclass', 'to_regprocedure', 'to_regproc', 'to_regtype', 'to_regrole',
  'to_regnamespace', 'obj_description', 'col_description', 'pg_get_functiondef',
  'pg_get_function_identity_arguments', 'pg_get_function_arguments', 'pg_get_expr',
  'pg_get_constraintdef', 'pg_get_indexdef', 'pg_get_viewdef', 'pg_get_triggerdef',
  'pg_get_userbyid', 'pg_relation_filenode', 'pg_relation_size', 'pg_total_relation_size',
  'pg_table_size', 'pg_indexes_size', 'pg_size_pretty', 'has_table_privilege',
  'has_function_privilege', 'has_column_privilege', 'has_schema_privilege',
  'has_sequence_privilege', 'pg_has_role', 'format_type', 'pg_typeof', 'current_schema',
  'current_schemas', 'version', 'pg_backend_pid', 'pg_current_xact_id', 'txid_current',
  'row_security_active', 'pg_column_size', 'current_database', 'current_user', 'session_user',
  'pg_get_serial_sequence',
  // aleatório e identidade (não escrevem; o default VOLÁTIL é regra à parte, em `add column`)
  'gen_random_uuid', 'random', 'uuid_generate_v4',
  // efeito fora das tabelas: aviso e trava de sessão (sem escrita em tabela)
  'pg_notify', 'set_config', 'pg_advisory_xact_lock', 'pg_try_advisory_xact_lock', 'pg_sleep',
  // nomes de TIPO com modificador — `numeric(10,2)`, `varchar(20)`, `timestamp(3)`
  'numeric', 'decimal', 'varchar', 'char', 'character', 'bit', 'varbit', 'timestamp',
  'timestamptz', 'time', 'timetz', 'interval', 'float', 'double', 'varying',
  // formas especiais do SQL que a sintaxe escreve como chamada
  'overlay',
  // a do projeto: `sql stable`, sem parâmetro, devolve a constante da empresa legada (0152)
  'public.empresa_legada',
])

// Palavras que a sintaxe SQL/plpgsql põe antes de `(` sem serem chamada.
const PALAVRAS_ANTES_DE_PARENTESE = new Set([
  'in', 'exists', 'values', 'any', 'all', 'some', 'array', 'cast', 'filter', 'over', 'and', 'or',
  'not', 'select', 'from', 'where', 'as', 'into', 'set', 'on', 'using', 'check', 'returns',
  'table', 'row', 'then', 'else', 'when', 'is', 'return', 'if', 'elsif', 'while', 'loop',
  'case', 'by', 'partition', 'within', 'group', 'distinct', 'unique', 'primary', 'key',
  'references', 'foreign', 'with', 'conflict', 'include', 'default', 'returning', 'lateral',
  'join', 'having', 'union', 'intersect', 'except', 'raise', 'perform', 'like', 'ilike',
  'between', 'overlaps', 'collate', 'escape', 'similar', 'to', 'for', 'of', 'do', 'update',
  'delete', 'insert', 'nulls', 'order', 'limit', 'offset', 'fetch', 'grouping', 'rollup', 'cube',
  'sets', 'exclude', 'constraint', 'generated', 'stored', 'identity', 'always', 'rows', 'range',
  'preceding', 'following', 'current', 'unbounded', 'only', 'recursive', 'materialized',
  'strict', 'execute', 'call', 'begin', 'declare', 'end', 'exception', 'diagnostics', 'get',
])

// A palavra ANTES de `nome (` que faz do parêntese uma lista de colunas, não uma chamada:
// `insert into t (a, b)`, `… as t(x)`, `create table t (…)`, `on t (col)`, `references t (id)`.
const ANTES_DE_LISTA_DE_COLUNAS = new Set([
  'into', 'as', 'table', 'on', 'references', 'index', 'view', 'type', 'exists', 'with', 'function',
  'procedure', 'trigger', 'policy', 'constraint', 'key', 'routine',
])

/** As chamadas de função de um trecho MASCARADO que não estão na lista fechada. */
function chamadasForaDaLista(mascarado) {
  const fora = []
  const re = new RegExp(String.raw`(?<![\w$."])(${NOME_QUALIFICADO})\s*\(`, 'gi')
  for (const m of mascarado.matchAll(re)) {
    const anterior = /([A-Za-z_]+)\s*$/.exec(mascarado.slice(Math.max(0, m.index - 40), m.index))
    if (anterior && ANTES_DE_LISTA_DE_COLUNAS.has(anterior[1].toLowerCase())) continue
    const cru = m[1]
    const partes = [...cru.matchAll(new RegExp(PARTE, 'g'))].map((p) => (p[0].startsWith('"') ? p[0].slice(1, -1) : p[0].toLowerCase()))
    if (partes.length === 1 && PALAVRAS_ANTES_DE_PARENTESE.has(partes[0])) continue
    const nome = partes.length === 1 ? partes[0] : `${partes[0]}.${partes[1]}`
    const semCatalogo = nome.startsWith('pg_catalog.') ? nome.slice(11) : nome
    if (FUNCOES_SEM_ESCRITA.has(semCatalogo) || FUNCOES_SEM_ESCRITA.has(nome)) continue
    fora.push(nome)
  }
  return fora
}

/**
 * As VÁLVULAS: o que desarma as guardas do acervo. Nenhum arquivo ≥ 0159 abre uma delas
 * em código executado (topo ou `do`) — a janela `estoque.dev_destrutivo` é da exclusão
 * deliberada da F23, não ferramenta de migração (a 0133 a abriu dentro de um `do`).
 */
function valvulasAbertas(mascarado, bruto) {
  const achadas = []
  // `set_config('<guc>', …)`: o nome vem no PRIMEIRO texto; só um literal inteiro é lido aqui — o nome
  // MONTADO (concatenação, variável, função) é ILEGÍVEL em `lerComando` (revisão adversarial da F63).
  for (const m of bruto.matchAll(/\bset_config\s*\(\s*'((?:[^']|'')*)'\s*,/gi)) {
    const guc = m[1].replaceAll("''", "'").trim().toLowerCase()
    if (guc === 'estoque.dev_destrutivo') achadas.push('set_config de estoque.dev_destrutivo (a janela destrutiva)')
    if (guc === 'session_replication_role') achadas.push('set_config de session_replication_role (desliga gatilhos)')
  }
  if (/\bset\s+(?:local\s+|session\s+)?estoque\.dev_destrutivo\b/i.test(mascarado)) achadas.push('set estoque.dev_destrutivo')
  if (/\bsession_replication_role\b/i.test(mascarado)) achadas.push('session_replication_role (desliga gatilhos)')
  if (/\bdisable\s+(?:always\s+)?trigger\b/i.test(mascarado)) achadas.push('disable trigger (desliga a guarda)')
  return achadas
}

/**
 * `set_config` cujo NOME de GUC não é um texto literal inteiro (concatenação, variável, chamada): o leitor
 * não sabe que chave ele liga — e `set_config('estoque.' || 'dev_destrutivo', 'on', …)` abriria a
 * válvula por fora da checagem acima. Falha fechada: ILEGÍVEL.
 */
function setConfigComNomeMontado(mascarado) {
  const achados = []
  for (const m of mascarado.matchAll(/\bset_config\s*\(/gi)) {
    let prof = 0
    let j = m.index + m[0].length
    const ini = j
    for (; j < mascarado.length; j++) {
      const ch = mascarado[j]
      if (ch === '(') prof++
      else if (ch === ')') {
        if (prof === 0) break
        prof--
      } else if (ch === ',' && prof === 0) break
    }
    if (!/^\s*'_*'\s*$/.test(mascarado.slice(ini, j))) achados.push('set_config com o nome da GUC montado (o leitor não sabe qual chave ele liga)')
  }
  return achados
}

const DEFAULTS_NAO_VOLATEIS = /^(?:public\.empresa_legada\(\)|now\(\)|current_timestamp|current_date|localtimestamp|transaction_timestamp\(\)|statement_timestamp\(\))$/i

/** O default de um `add column` é seguro (sem reescrita)? Literal ou lista fechada. */
function defaultSemReescrita(expr) {
  const e = expr.trim().replace(/\s+/g, ' ')
  const semCast = e.replace(/(?:\s*::\s*[a-z_][a-z0-9_ ]*(?:\([^)]*\))?(?:\[\])*)+$/i, '').trim()
  if (/^'_*'$/.test(semCast)) return true // texto (mascarado)
  if (/^-?\d+(?:\.\d+)?$/.test(semCast)) return true
  if (/^(?:true|false|null)$/i.test(semCast)) return true
  if (/^array\s*\[\s*\]$/i.test(semCast)) return true
  return DEFAULTS_NAO_VOLATEIS.test(semCast)
}

/** Os `add column` do comando e o que há de errado com o default de cada um. */
function addColumnsSuspeitos(mascarado) {
  const suspeitos = []
  const re = /\badd\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?("(?:[^"]|"")+"|[a-z_][a-z0-9_$]*)\s+/gi
  for (const m of mascarado.matchAll(re)) {
    const nome = m[1].toLowerCase()
    if (['constraint', 'primary', 'unique', 'check', 'foreign', 'exclude'].includes(nome)) continue
    // a definição vai até a próxima vírgula de profundidade 0 (ou o fim do comando)
    let prof = 0
    let j = m.index + m[0].length
    for (; j < mascarado.length; j++) {
      const ch = mascarado[j]
      if (ch === '(') prof++
      else if (ch === ')') {
        if (prof === 0) break
        prof--
      } else if (ch === ',' && prof === 0) break
    }
    const def = mascarado.slice(m.index + m[0].length, j)
    if (/\bgenerated\s+always\s+as\s*\(/i.test(def) || /\bstored\b/i.test(def)) {
      suspeitos.push(`${nome}: coluna gerada STORED reescreve a tabela`)
      continue
    }
    if (/\b(?:small|big)?serial\b|\bgenerated\s+(?:always|by\s+default)\s+as\s+identity\b/i.test(def)) {
      suspeitos.push(`${nome}: serial/identity preenche por sequência (reescreve a tabela)`)
      continue
    }
    const d = /\bdefault\s+([\s\S]*?)(?=\s+(?:not\s+null|null|references|check|constraint|unique|primary|collate|generated)\b|$)/i.exec(def)
    if (d && !defaultSemReescrita(d[1])) suspeitos.push(`${nome}: default «${d[1].trim()}» fora da lista fechada de defaults sem reescrita`)
  }
  return suspeitos
}

/**
 * DDL que apaga ou converte DADO: `drop table|schema|sequence`, `drop … cascade`, e as
 * AÇÕES de `alter table` `drop [column] x` e `alter [column] x [set data] type`. Cada
 * achado vem com a tabela (quando há), para o classificador poupar a tabela criada na
 * MESMA migration.
 * @returns {{ motivo: string, tabelas: string[] }[]}
 */
function ddlDestrutiva(mascarado) {
  const achados = []
  const drop = new RegExp(String.raw`^\s*drop\s+(table|schema|sequence)\s+(?:if\s+exists\s+)?([^;]*)`, 'i').exec(mascarado)
  if (drop) {
    const nomes = drop[2]
      .replace(/\b(?:cascade|restrict)\b/gi, ' ')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    achados.push({ motivo: `drop ${drop[1].toLowerCase()}`, tabelas: drop[1].toLowerCase() === 'table' ? nomes.map(normalizarNome) : [] })
  }
  if (/^\s*drop\s+(?:materialized\s+view|view|type|domain|extension|function|procedure|routine|index|policy|trigger|rule|publication)\b[^;]*\bcascade\b/i.test(mascarado)) {
    achados.push({ motivo: 'drop … cascade (derruba dependentes, inclusive coluna)', tabelas: [] })
  }
  const alter = new RegExp(String.raw`^\s*alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${NOME_QUALIFICADO})\s+`, 'i').exec(mascarado)
  // A TROCA DE NOME (2ª rodada da revisão adversarial da F63). Renomear — ou mudar de esquema — uma tabela que já
  // existia, ou uma coluna dela, faz o nome que o app lê apontar para OUTRO dado: `create table x_copia (like
  // ativos); insert into x_copia select <transformado> from ativos; alter table ativos rename to ativos_velha; alter
  // table x_copia rename to ativos` reescreve a tabela inteira sem um `update` sequer, e o `insert` é em tabela criada
  // aqui. DESTRUTIVA — a tabela criada no próprio arquivo fica poupada, como no `drop`. `rename constraint` não
  // mexe em dado.
  if (alter) {
    const tabela = normalizarNome(alter[1])
    const acao = mascarado.slice(alter[0].length)
    if (/^rename\s+to\b/i.test(acao)) achados.push({ motivo: `alter table ${tabela} rename to (o nome passa a apontar para outro dado)`, tabelas: [tabela] })
    else if (/^set\s+schema\b/i.test(acao)) achados.push({ motivo: `alter table ${tabela} set schema (o nome passa a apontar para outro dado)`, tabelas: [tabela] })
    else if (new RegExp(String.raw`^rename\s+(?:column\s+)?(?!constraint\b)${PARTE}\s+to\b`, 'i').test(acao)) {
      achados.push({ motivo: `alter table ${tabela} rename column (o nome da coluna passa a apontar para outro dado)`, tabelas: [tabela] })
    }
  }
  if (alter && !/^\s*alter\s+table\s+[^;]*?\s+rename\b/i.test(mascarado)) {
    const tabela = normalizarNome(alter[1])
    const acoes = mascarado.slice(alter[0].length)
    for (const [a, b] of itensDeTopo(acoes)) {
      const acao = acoes.slice(a, b).trim()
      if (/^drop\s+(?!constraint\b)/i.test(acao)) achados.push({ motivo: `alter table ${tabela} drop column`, tabelas: [tabela] })
      if (new RegExp(String.raw`^alter\s+(?:column\s+)?${PARTE}\s+(?:set\s+data\s+)?type\b`, 'i').test(acao)) {
        achados.push({ motivo: `alter table ${tabela} alter column … type (reescreve e converte)`, tabelas: [tabela] })
      }
    }
  }
  return achados
}

/** Reescrita da tabela sem perda de dado, que o leitor não classifica: ILEGÍVEL. */
function reescritaSemPerda(mascarado) {
  const achados = []
  if (/\bset\s+(?:logged|unlogged|tablespace)\b/i.test(mascarado) && /\balter\s+table\b/i.test(mascarado)) achados.push('alter table set logged/unlogged/tablespace (reescreve)')
  if (/\bvacuum\s+(?:\(\s*)?full\b|\bcluster\b/i.test(mascarado)) achados.push('vacuum full/cluster (reescreve)')
  if (/\balter\s+sequence\b[^;]*\brestart\b/i.test(mascarado)) achados.push('alter sequence restart (muda estado)')
  return achados
}

// Cabeças de comando de TOPO que o classificador sabe ler.
const CABECAS_CONHECIDAS = [
  /^create\b/, /^alter\b/, /^drop\b/, /^comment\s+on\b/, /^grant\b/, /^revoke\b/, /^insert\b/,
  /^update\b/, /^delete\b/, /^merge\b/, /^truncate\b/, /^with\b/, /^select\b/, /^notify\b/,
  /^set\b/, /^reset\b/, /^analyze\b/, /^reindex\b/, /^refresh\s+materialized\s+view\b/,
  /^security\s+label\b/, /^lock\b/, /^begin\b/, /^commit\b/, /^end\b/, /^rollback\b/,
  /^start\s+transaction\b/, /^savepoint\b/, /^release\b/, /^values\b/, /^vacuum\b/, /^cluster\b/,
]

// O prefixo de CONTROLE de um comando plpgsql (dentro de `do`), que sai antes de ler a
// cabeça do comando de verdade. O que o prefixo tem de expressão (a condição do `if`, a
// consulta do `for … in`) é lido como EXPRESSÃO.
function separarControle(mascarado) {
  let resto = mascarado.trim()
  let expressoes = ''
  for (let volta = 0; volta < 20; volta++) {
    const antes = resto
    let m
    if ((m = /^<<\s*[a-z_][a-z0-9_]*\s*>>/i.exec(resto))) resto = resto.slice(m[0].length).trim()
    else if ((m = /^(?:declare|begin|else|loop|then)\b/i.exec(resto))) resto = resto.slice(m[0].length).trim()
    else if ((m = /^end(?:\s+(?:if|loop|case))?\b/i.exec(resto))) resto = resto.slice(m[0].length).trim()
    else if ((m = /^(?:if|elsif|elseif|while)\b([\s\S]*?)\b(?:then|loop)\b/i.exec(resto))) {
      expressoes += ' ' + m[1]
      resto = resto.slice(m[0].length).trim()
    } else if ((m = /^(?:for|foreach)\b([\s\S]*?)\bloop\b/i.exec(resto))) {
      expressoes += ' ' + m[1]
      resto = resto.slice(m[0].length).trim()
    } else if ((m = /^(?:exception\s+)?when\b[\s\S]*?\bthen\b/i.exec(resto))) resto = resto.slice(m[0].length).trim()
    if (resto === antes) break
  }
  return { comando: resto, expressoes }
}

// Cabeças DDL: o que vem nelas (a expressão de uma policy, de um índice, de um gatilho)
// é GUARDADO, não executado no apply — chamada ali não conta como chamada.
const CABECA_DDL = /^(?:create|alter|drop|comment|grant|revoke|security\s+label|notify|analyze|reindex|lock)\b/i

/**
 * A leitura de UM comando executado: o que ele escreve, o que chama, se abre válvula,
 * se é DDL destrutiva, se o `add column` reescreve, se a cabeça é conhecida.
 */
function lerComando(cmd) {
  const { comando, expressoes } = cmd.origem === 'do' ? separarControle(cmd.mascarado) : { comando: cmd.mascarado.trim(), expressoes: '' }
  const cabeca = comando.replace(/\s+/g, ' ').slice(0, 60).toLowerCase()
  const ddl = CABECA_DDL.test(cabeca)
  const ilegiveis = []
  if (cmd.ilegivel) ilegiveis.push(cmd.ilegivel)
  // SQL dinâmico: `execute …` que não é `grant/revoke execute on` nem `execute function`
  // do gatilho — o leitor estático não vê o texto que roda.
  if (!/^(?:grant|revoke|alter\s+default\s+privileges)\b/i.test(cabeca)) {
    for (const m of cmd.mascarado.matchAll(/\bexecute\b(?!\s+(?:function|procedure|on)\b)/gi)) {
      ilegiveis.push(`SQL dinâmico (execute) perto de «${cmd.bruto.slice(m.index, m.index + 60).replace(/\s+/g, ' ')}»`)
    }
  }
  if (/^call\b/i.test(cabeca)) ilegiveis.push('call de procedimento (o leitor não vê o que ele escreve)')
  if (/^copy\b/i.test(cabeca)) ilegiveis.push('copy')
  if (/^(?:do|execute|prepare|import|load|discard|listen|unlisten|checkpoint|explain)\b/i.test(cabeca)) ilegiveis.push(`comando ${cabeca.split(' ')[0]}`)
  // Chamadas: na EXPRESSÃO de controle, e no comando quando ele não é DDL (select,
  // perform, insert … select, update … set, raise, atribuição, return).
  const chamadas = chamadasForaDaLista(expressoes)
  if (!ddl) chamadas.push(...chamadasForaDaLista(comando))
  // `create table … as select` e `create materialized view … as` EXECUTAM a consulta
  if (/^create\s+(?:(?:temp|temporary|unlogged)\s+)?(?:table|materialized\s+view)\b[\s\S]*\bas\s*\(?\s*(?:select|with|values)\b/i.test(comando)) {
    chamadas.push(...chamadasForaDaLista(comando.slice(comando.search(/\bas\s*\(?\s*(?:select|with|values)\b/i))))
  }
  for (const nome of chamadas) ilegiveis.push(`chamada de ${nome}() no apply (o leitor não vê o que ela faz)`)
  if (cmd.origem === 'topo' && !CABECAS_CONHECIDAS.some((re) => re.test(cabeca))) ilegiveis.push(`comando de topo desconhecido: «${cabeca.slice(0, 40)}»`)
  ilegiveis.push(...reescritaSemPerda(comando))
  ilegiveis.push(...setConfigComNomeMontado(cmd.mascarado))
  return {
    cabeca,
    comando,
    // Em comando DDL não há escrita executada: `revoke truncate on public.ativos` (0090)
    // não trunca nada, e o `do instead update` de uma regra é guardado.
    alvos: ddl ? [] : alvosDeEscrita(cmd.mascarado),
    criadas: tabelasCriadas(cmd.mascarado),
    valvulas: valvulasAbertas(cmd.mascarado, cmd.bruto),
    destrutiva: ddlDestrutiva(comando),
    addColumn: addColumnsSuspeitos(comando),
    ilegiveis,
    transacao: cmd.origem === 'topo' && /^(?:begin|commit|end|rollback|abort|start\s+transaction|savepoint|release)\b/i.test(cabeca),
  }
}

/**
 * As ESCRITAS que o apply executa (topo e `do`), fora de comando DDL: `{ verbo, tabela,
 * origem }`, com a tabela normalizada (`public.x`; alias, `only` e nome citado resolvidos).
 * É o que a guarda de topo de `migrations-f38.test.ts` lê, junto com `textoExecutado`.
 * @param {string} sql
 * @returns {{ verbo: string, tabela: string, origem: 'topo'|'do' }[]}
 */
export function escritasExecutadas(sql) {
  return classificar(sql).escritas
}

/**
 * As TROCAS de tabela que o apply executa (topo e `do`): `{ verbo: 'rename'|'set schema'|'drop table', tabela,
 * origem }` — no `rename`/`set schema`, as tabelas originais por trás do nome de origem E o nome de destino. A guarda
 * de topo de `migrations-f38.test.ts` lê junto com as escritas: trocar uma tabela do acervo inteira é o `update` que
 * não aparece no texto (2ª rodada da revisão adversarial da F63).
 * @param {string} sql
 * @returns {{ verbo: string, tabela: string, origem: 'topo'|'do' }[]}
 */
export function trocasDeTabela(sql) {
  return classificar(sql).trocas
}

function parteNormalizada(p) {
  return p.startsWith('"') ? p.slice(1, -1).replaceAll('""', '"') : p.toLowerCase()
}

/**
 * A IDENTIDADE das tabelas ao longo da migration (revisão adversarial da F63). O alvo de uma escrita é
 * lido pelo NOME, e um nome muda dentro do arquivo: `alter table public.movimentacoes rename to x;
 * update x …; alter table x rename to movimentacoes` escondia o `update` da guarda de topo, e
 * `rename` + `create table <o nome antigo> (like …)` + `insert` fazia a cópia de uma tabela viva passar
 * por "tabela criada aqui" (ADITIVA). E uma view criada no arquivo é atualizável: escrever nela é
 * escrever na tabela de baixo. Aqui cada nome aponta para as tabelas ORIGINAIS (as que existiam antes
 * da migration), e o nome que foi renomeado embora não "nasce" de novo com um `create table`.
 */
function novaIdentidade() {
  const apelidos = new Map()
  const renomeadasDe = new Set()
  const canon = (t) => apelidos.get(t) ?? [t]
  const RENOMEIA = new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${NOME_QUALIFICADO})\s+rename\s+to\s+(${PARTE})\s*$`, 'i')
  const MUDA_ESQUEMA = new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${NOME_QUALIFICADO})\s+set\s+schema\s+(${PARTE})\s*$`, 'i')
  const CRIA_VIEW = new RegExp(String.raw`^create\s+(?:or\s+replace\s+)?(?:(?:temp|temporary)\s+)?(?:recursive\s+)?view\s+(${NOME_QUALIFICADO})`, 'i')
  function mover(de, para) {
    apelidos.set(para, canon(de))
    apelidos.delete(de)
    renomeadasDe.add(de)
  }
  /**
   * As TROCAS de tabela deste comando (2ª rodada da revisão adversarial): o `rename`/`set schema` de uma tabela
   * (as originais por trás do nome de origem, e o nome de destino, que passa a ter outro dono) e o `drop table`.
   * É o que a guarda de topo lê junto com as escritas — uma tabela do acervo trocada inteira é o `update` que não
   * aparece. Chamada ANTES de `registrar`, com a identidade de antes do comando.
   */
  function trocas(comando) {
    let m
    if ((m = RENOMEIA.exec(comando))) {
      const de = normalizarNome(m[1])
      return [...canon(de), `${de.split('.')[0]}.${parteNormalizada(m[2])}`].map((tabela) => ({ verbo: 'rename', tabela }))
    }
    if ((m = MUDA_ESQUEMA.exec(comando))) {
      const de = normalizarNome(m[1])
      return [...canon(de), `${parteNormalizada(m[2])}.${de.split('.')[1]}`].map((tabela) => ({ verbo: 'set schema', tabela }))
    }
    if ((m = /^drop\s+table\s+(?:if\s+exists\s+)?([^;]*)$/i.exec(comando))) {
      return m[1]
        .replace(/\b(?:cascade|restrict)\b/gi, ' ')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .flatMap((n) => canon(normalizarNome(n)))
        .map((tabela) => ({ verbo: 'drop table', tabela }))
    }
    return []
  }
  function registrar(comando) {
    let m
    if ((m = RENOMEIA.exec(comando))) {
      const de = normalizarNome(m[1])
      mover(de, `${de.split('.')[0]}.${parteNormalizada(m[2])}`)
    } else if ((m = MUDA_ESQUEMA.exec(comando))) {
      const de = normalizarNome(m[1])
      mover(de, `${parteNormalizada(m[2])}.${de.split('.')[1]}`)
    } else if ((m = CRIA_VIEW.exec(comando))) {
      const bases = new Set()
      for (const f of comando.matchAll(new RegExp(String.raw`\b(?:from|join)\s+(?:only\s+)?(${NOME_QUALIFICADO})`, 'gi'))) {
        for (const t of canon(normalizarNome(f[1]))) bases.add(t)
      }
      if (bases.size) apelidos.set(normalizarNome(m[1]), [...bases])
    }
  }
  return { canon, registrar, trocas, renomeadasDe }
}

// -----------------------------------------------------------------------------
// 4. O CLASSIFICADOR
// -----------------------------------------------------------------------------

/** A classe DECLARADA no cabeçalho (`-- classe: X`), ou null; todas, se houver mais de uma. */
export function classesDeclaradas(sql) {
  return [...sql.matchAll(/^--\s*classe:\s*([A-ZÇÃÍÉ]+)/gm)].map((m) => m[1])
}

const RISCO = { ADITIVA: 0, BACKFILL: 1, DESTRUTIVA: 2 }

/**
 * A classe CALCULADA de uma migration — o que ela EXECUTA ao ser aplicada.
 *   ADITIVA    — só cria, comenta, concede, indexa, liga RLS, acrescenta coluna com default
 *                sem reescrita; escreve SÓ em tabela criada na MESMA migration; derruba só
 *                objeto sem dado (função, view, policy, gatilho, índice), sem `cascade`.
 *   BACKFILL   — `update`, `insert … on conflict do update`, `merge`, ou `insert` (puro)
 *                em tabela que já existia.
 *   DESTRUTIVA — `delete`, `truncate`, `drop table|schema|sequence`, `drop column`,
 *                `alter column … type`, `drop … cascade`, e o `rename`/`set schema` de uma
 *                tabela que já existia ou o `rename column` dela (a troca de tabela).
 *   ILEGÍVEL   — SQL dinâmico, chamada de função fora da lista fechada, `call`, `add column`
 *                com default fora da lista fechada, reescrita sem perda, comando de topo
 *                desconhecido. Nunca vira ADITIVA.
 * @param {string} sql
 */
export function classificar(sql) {
  const comandos = comandosExecutados(sql)
  const criadasAqui = new Set()
  const leituras = []
  const motivos = { ADITIVA: [], BACKFILL: [], DESTRUTIVA: [] }
  const ilegiveis = []
  const valvulas = []
  const transacao = []
  const escritas = []
  const trocas = []
  const identidade = novaIdentidade()
  const criadaAqui = (t) => t.startsWith('pg_temp.') || identidade.canon(t).every((x) => x.startsWith('pg_temp.') || criadasAqui.has(x))
  let risco = 0
  for (const cmd of comandos) {
    const l = lerComando(cmd)
    leituras.push({ cmd, l })
    // A tabela criada neste comando conta para os comandos SEGUINTES (e para ele mesmo,
    // no `create table … as`/`insert` do mesmo texto não há caso real). O nome de uma tabela que
    // já existia e foi RENOMEADA embora não renasce com um `create table` (a cópia viva).
    for (const t of l.criadas) if (!identidade.renomeadasDe.has(t)) criadasAqui.add(t)
    for (const a of l.alvos) {
      for (const t of identidade.canon(a.tabela)) escritas.push({ verbo: a.verbo, tabela: t, origem: cmd.origem })
      if (criadaAqui(a.tabela)) continue
      const apaga = a.verbo === 'delete' || a.verbo === 'truncate' || (a.verbo === 'merge' && /\bthen\s+delete\b/i.test(cmd.mascarado))
      const classe = apaga ? 'DESTRUTIVA' : 'BACKFILL'
      const nomes = identidade.canon(a.tabela).join(', ')
      motivos[classe].push(`${a.verbo} em ${nomes}${nomes !== a.tabela ? ` (pelo nome ${a.tabela})` : ''}${cmd.origem === 'do' ? ' (dentro de do)' : ''}`)
      risco = Math.max(risco, RISCO[classe])
    }
    for (const d of l.destrutiva) {
      // a tabela criada NESTA migration não tem dado de antes a perder
      if (d.tabelas.length && d.tabelas.every(criadaAqui)) continue
      motivos.DESTRUTIVA.push(d.motivo)
      risco = Math.max(risco, 2)
    }
    for (const t of identidade.trocas(l.comando)) trocas.push({ ...t, origem: cmd.origem })
    identidade.registrar(l.comando)
    for (const a of l.addColumn) {
      const alvo = /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?("(?:[^"]|"")+"(?:\s*\.\s*"(?:[^"]|"")+")?|[a-z_][a-z0-9_$.]*)/i.exec(cmd.mascarado)
      if (alvo && criadaAqui(normalizarNome(alvo[1]))) continue
      ilegiveis.push(`add column ${a}`)
    }
    ilegiveis.push(...l.ilegiveis)
    valvulas.push(...l.valvulas)
    if (l.transacao) transacao.push(l.cabeca.split(' ')[0])
  }
  const calculada = CLASSES[risco]
  return {
    comandos: leituras,
    calculada,
    veredito: ilegiveis.length ? ILEGIVEL : calculada,
    motivos,
    ilegiveis,
    valvulas,
    transacao,
    escritas,
    trocas,
    criadas: [...criadasAqui],
  }
}

// -----------------------------------------------------------------------------
// 5. A REGRA (≥ 0159) — o cabeçalho, a classe, o par de backup, as válvulas
// -----------------------------------------------------------------------------

/** A posição de uma palavra de PROFUNDIDADE 0 (fora de parênteses) no texto mascarado. */
function palavrasDeTopo(mascarado, palavra) {
  const achadas = []
  let prof = 0
  const re = new RegExp(String.raw`\b${palavra}\b`, 'iy')
  for (let i = 0; i < mascarado.length; i++) {
    const ch = mascarado[i]
    if (ch === '(') prof++
    else if (ch === ')') prof--
    else if (prof === 0 && /[a-z]/i.test(ch) && (i === 0 || !/[\w$]/.test(mascarado[i - 1]))) {
      re.lastIndex = i
      if (re.test(mascarado)) achadas.push(i)
    }
  }
  return achadas
}

/** Os itens de profundidade 0 de uma lista separada por vírgula. */
function itensDeTopo(texto) {
  const itens = []
  let prof = 0
  let ini = 0
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (ch === '(' || ch === '[') prof++
    else if (ch === ')' || ch === ']') prof--
    else if (ch === ',' && prof === 0) {
      itens.push([ini, i])
      ini = i + 1
    }
  }
  itens.push([ini, texto.length])
  return itens
}

/**
 * O `where` de profundidade 0 de um comando, do `where` até o fim (ou até `returning` /
 * `on conflict`). Num upsert, é o `where` ANTES do `on conflict` (o da consulta que
 * alimenta o insert), nunca o do `do update … where`.
 */
function clausulaWhere(cmd) {
  const conflito = palavrasDeTopo(cmd.mascarado, 'on').find((p) => /^on\s+conflict\b/i.test(cmd.mascarado.slice(p)))
  const wheres = palavrasDeTopo(cmd.mascarado, 'where').filter((p) => conflito === undefined || p < conflito)
  if (!wheres.length) return null
  const ini = wheres[wheres.length - 1]
  const cortes = [...palavrasDeTopo(cmd.mascarado, 'returning'), ...(conflito === undefined ? [] : [conflito])].filter((p) => p > ini)
  const fim = cortes.length ? Math.min(...cortes) : cmd.bruto.length
  return cmd.bruto.slice(ini, fim).trim()
}

/** As colunas atribuídas no `set` de profundidade 0 de um update / do update. */
function colunasDoSet(cmd) {
  const sets = palavrasDeTopo(cmd.mascarado, 'set')
  if (!sets.length) return null
  const ini = sets[0] + 3
  const paradas = ['from', 'where', 'returning'].flatMap((p) => palavrasDeTopo(cmd.mascarado, p)).filter((p) => p > ini)
  const fim = paradas.length ? Math.min(...paradas) : cmd.mascarado.length
  const lista = cmd.mascarado.slice(ini, fim)
  const colunas = []
  for (const [a, b] of itensDeTopo(lista)) {
    const item = lista.slice(a, b).trim()
    const m = /^\(\s*([^)]*)\)\s*=/.exec(item) ?? /^("(?:[^"]|"")+"|[a-z_][a-z0-9_$]*)\s*(?:\[[^\]]*\])?\s*=/i.exec(item)
    if (!m) return null
    for (const c of m[1].split(',')) colunas.push(c.trim().replace(/^"|"$/g, '').toLowerCase())
  }
  return colunas
}

// O que vem depois da tabela do `from` e NÃO é o apelido dela.
const NAO_APELIDO_NO_FROM = new Set([...PALAVRAS_NAO_ALIAS, 'join', 'inner', 'left', 'right', 'full', 'cross', 'natural', 'lateral', 'tablesample'])

/**
 * O bloco de backup canônico (RUNBOOK-BANCO.md, receita BACKFILL):
 *
 *   insert into public.backups_migration (migration, tabela, coluna, chave, valor_anterior)
 *   select '<arquivo>.sql', 'public.x', 'coluna', t.id::text, to_jsonb(t.coluna)
 *     from public.x t
 *    where <W>;
 *
 * Devolve os problemas do bloco (vazio = canônico) e o que ele declara.
 */
function lerBlocoDeBackup(cmd, nomeArquivo) {
  const problemas = []
  const cab = /^insert\s+into\s+public\.backups_migration\s*\(\s*migration\s*,\s*tabela\s*,\s*coluna\s*,\s*chave\s*,\s*valor_anterior\s*\)\s*select\b/i.exec(cmd.mascarado.trim())
  if (!cab) return { problemas: ['o bloco de backup não está na forma canônica «insert into public.backups_migration (migration, tabela, coluna, chave, valor_anterior) select …»'] }
  const deslocamento = cmd.mascarado.indexOf(cmd.mascarado.trim())
  const selectFim = deslocamento + cab[0].length
  const froms = palavrasDeTopo(cmd.mascarado, 'from').filter((p) => p > selectFim)
  if (!froms.length) return { problemas: ['o bloco de backup não tem from'] }
  const listaBruta = cmd.bruto.slice(selectFim, froms[0])
  const listaMasc = cmd.mascarado.slice(selectFim, froms[0])
  const itens = itensDeTopo(listaMasc).map(([a, b]) => ({ bruto: listaBruta.slice(a, b).trim(), masc: listaMasc.slice(a, b).trim() }))
  if (itens.length !== 5) return { problemas: [`o select do backup tem ${itens.length} itens, e a forma canônica tem 5`] }
  const literal = (item) => (/^'_*'$/.test(item.masc) ? item.bruto.slice(1, -1).replaceAll("''", "'") : null)
  const migration = literal(itens[0])
  const tabela = literal(itens[1])
  const coluna = literal(itens[2])
  if (migration === null) problemas.push('o 1º item do backup (migration) não é um texto literal')
  else if (migration !== nomeArquivo) problemas.push(`o literal migration do backup é '${migration}', e o arquivo é '${nomeArquivo}' (bloco copiado de outra migration?)`)
  if (tabela === null || !/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(tabela)) problemas.push('o 2º item do backup (tabela) não é um texto literal esquema.tabela')
  if (coluna === null || !/^[a-z_][a-z0-9_]*$/.test(coluna)) problemas.push('o 3º item do backup (coluna) não é um texto literal de coluna')
  const valor = /^to_jsonb\s*\(\s*(?:([a-z_][a-z0-9_]*)\s*\.\s*)?("?)([a-z_][a-z0-9_]*)\2\s*\)$/i.exec(itens[4].masc)
  if (!valor) problemas.push('o 5º item do backup (valor_anterior) não é to_jsonb(<alias>.<coluna>)')
  else if (coluna !== null && valor[3].toLowerCase() !== coluna) problemas.push(`o backup guarda to_jsonb(…${valor[3]}) mas declara a coluna '${coluna}'`)
  const alvoFrom = new RegExp(String.raw`^from\s+(?:only\s+)?(${NOME_QUALIFICADO})(?:\s+(?:as\s+)?(${PARTE}))?`, 'i').exec(cmd.mascarado.slice(froms[0]))
  if (!alvoFrom) problemas.push('o from do backup não nomeia uma tabela')
  else {
    if (tabela !== null && normalizarNome(alvoFrom[1]) !== tabela) problemas.push(`o backup lê de ${normalizarNome(alvoFrom[1])} mas declara a tabela '${tabela}'`)
    // O valor e a chave vêm da TABELA DO FROM (2ª rodada da revisão adversarial da F63). Com um `join`,
    // `to_jsonb(o.preco)` guardaria a coluna homônima de OUTRA tabela — e o rollback devolveria um valor que a linha
    // nunca teve; `o.id::text` apontaria o rollback para outras linhas. Sem qualificação, a coluna ambígua é erro do
    // próprio Postgres no apply.
    const apelido = alvoFrom[2] && !NAO_APELIDO_NO_FROM.has(alvoFrom[2].toLowerCase()) ? parteNormalizada(alvoFrom[2]) : normalizarNome(alvoFrom[1]).split('.')[1]
    if (valor && valor[1] && valor[1].toLowerCase() !== apelido) {
      problemas.push(`o valor_anterior do backup vem de ${valor[1]}.${valor[3]}, e a tabela do from é ${apelido} (a coluna de outra tabela do join?)`)
    }
    for (const q of itens[3].masc.matchAll(/(?<![\w$.])([a-z_][a-z0-9_$]*)\s*\.\s*(?=[a-z_"])/gi)) {
      if (q[1].toLowerCase() !== apelido) problemas.push(`a chave do backup vem de ${q[1]}., e a tabela do from é ${apelido} (a chave de outra tabela do join?)`)
    }
  }
  const where = clausulaWhere(cmd)
  if (!where) problemas.push('o backup não tem where (para a tabela inteira, escreva «where true»)')
  return { problemas, migration, tabela, coluna, where }
}

/**
 * Os problemas de uma migration diante da REGRA DA F63. Vazio = passa.
 * Para arquivo < 0159 devolve [] (a regra não retroage: migration aplicada não se edita)
 * — o que ela seria vai para o CENSO.
 * @param {string} nomeArquivo ex. `0160_empresa_no_acervo_cadastros.sql`
 * @param {string} sql
 * @returns {string[]}
 */
export function conferirMigration(nomeArquivo, sql) {
  if (nomeArquivo.slice(0, 4) < PRIMEIRA_COM_REGRA) return []
  const problemas = []
  const declaradas = classesDeclaradas(sql)
  if (declaradas.length === 0) problemas.push('sem o cabeçalho «-- classe: ADITIVA | BACKFILL | DESTRUTIVA» (obrigatório a partir da 0159)')
  else if (declaradas.length > 1) problemas.push(`mais de um cabeçalho de classe: ${declaradas.join(', ')}`)
  else if (!CLASSES.includes(declaradas[0])) problemas.push(`classe declarada desconhecida: ${declaradas[0]}`)

  let c
  try {
    c = classificar(sql)
  } catch (e) {
    return [...problemas, `o leitor não conseguiu ler: ${e.message}`]
  }
  if (c.veredito === ILEGIVEL) problemas.push(`ILEGÍVEL: ${c.ilegiveis.join(' · ')}`)
  const declarada = declaradas.length === 1 && CLASSES.includes(declaradas[0]) ? declaradas[0] : null
  if (declarada && RISCO[declarada] < RISCO[c.calculada]) {
    const porque = [...c.motivos.BACKFILL, ...c.motivos.DESTRUTIVA].join(', ')
    problemas.push(`declara ${declarada} e executa ${c.calculada} (${porque})`)
  }
  for (const v of c.valvulas) problemas.push(`abre válvula das guardas: ${v}`)
  for (const t of c.transacao) problemas.push(`controle de transação de topo («${t}»): quem decide a transação é o apply (decisão 2 da F63)`)

  // O par de backup: antes de cada comando que SOBRESCREVE valor de tabela que já existia.
  const cmds = c.comandos
  const usados = new Set()
  let algumBackup = false
  for (let k = 0; k < cmds.length; k++) {
    const { cmd, l } = cmds[k]
    const sobrescritas = l.alvos.filter(
      (a) => ['update', 'upsert', 'merge'].includes(a.verbo) && !a.tabela.startsWith('pg_temp.') && !c.criadas.includes(a.tabela) && a.tabela !== TABELA_BACKUP,
    )
    if (!sobrescritas.length) continue
    for (const alvo of sobrescritas) {
      const onde = `${alvo.verbo} em ${alvo.tabela}`
      if (alvo.verbo === 'merge') {
        problemas.push(`${onde}: merge não tem where verificável para o par de backup — use update com where`)
        continue
      }
      if (cmd.origem === 'do') {
        problemas.push(`${onde}: a escrita está dentro de um bloco do — o backfill se escreve no TOPO, com o par de backup antes`)
        continue
      }
      if (alvo.pos !== cmd.mascarado.search(/\S/) && !/^with\b/i.test(cmd.mascarado.trim())) {
        problemas.push(`${onde}: a escrita está aninhada no comando — o par de backup não é verificável`)
        continue
      }
      const blocos = []
      for (let j = k - 1; j >= 0 && /^insert\s+into\s+public\.backups_migration\b/i.test(cmds[j].cmd.mascarado.trim()); j--) blocos.unshift(j)
      if (!blocos.length) {
        problemas.push(`${onde}: sem o bloco «insert into public.backups_migration … select …» imediatamente antes`)
        continue
      }
      const whereDoComando = clausulaWhere(cmd)
      const colunas = alvo.verbo === 'update' ? colunasDoSet(cmd) : colunasDoSet({ mascarado: cmd.mascarado.slice(cmd.mascarado.search(/\bdo\s+update\b/i)), bruto: cmd.bruto.slice(cmd.mascarado.search(/\bdo\s+update\b/i)) })
      const cobertas = new Set()
      for (const j of blocos) {
        usados.add(j)
        algumBackup = true
        const b = lerBlocoDeBackup(cmds[j].cmd, nomeArquivo)
        for (const p of b.problemas) problemas.push(`${onde}: ${p}`)
        if (b.tabela && b.tabela !== alvo.tabela) problemas.push(`${onde}: o bloco de backup antes dele é de '${b.tabela}'`)
        if (b.where && b.where !== whereDoComando) {
          problemas.push(`${onde}: o where do backup («${b.where}») não é byte a byte o where do comando («${whereDoComando ?? 'nenhum'}»)`)
        }
        if (b.coluna) cobertas.add(b.coluna)
      }
      if (!colunas) problemas.push(`${onde}: não consegui ler as colunas do set`)
      else for (const col of colunas) if (!cobertas.has(col)) problemas.push(`${onde}: a coluna '${col}' é alterada sem par de backup`)
    }
  }
  // bloco de backup solto (sem o comando que ele protege logo depois) ou com nome errado
  for (let j = 0; j < cmds.length; j++) {
    if (usados.has(j) || !/^insert\s+into\s+public\.backups_migration\b/i.test(cmds[j].cmd.mascarado.trim())) continue
    algumBackup = true
    const b = lerBlocoDeBackup(cmds[j].cmd, nomeArquivo)
    for (const p of b.problemas) problemas.push(`bloco de backup solto: ${p}`)
    problemas.push('bloco de backup sem o comando que ele protege logo depois')
  }

  // O rodapé: o rollback escrito DEPOIS do último comando.
  const toks = lexar(sql)
  const ultimoCodigo = [...toks].reverse().find((t) => t.tipo !== 'comentario' && !(t.tipo === 'codigo' && !t.texto.trim()))
  const rodape = ultimoCodigo ? sql.slice(ultimoCodigo.fim) : sql
  if (!/ROLLBACK/.test(rodape)) problemas.push('sem o ROLLBACK escrito no rodapé (depois do último comando)')
  if (algumBackup) {
    if (!rodape.includes(TABELA_BACKUP) || !rodape.includes(`migration = '${nomeArquivo}'`)) {
      problemas.push(`o rodapé não restaura a partir de ${TABELA_BACKUP} (… where migration = '${nomeArquivo}')`)
    }
  }
  return problemas
}

// -----------------------------------------------------------------------------
// 6. O CENSO da cadeia inteira
// -----------------------------------------------------------------------------

/**
 * A classe calculada de cada migration de `supabase/migrations/`, com a declarada ao
 * lado. É EVIDÊNCIA, não trava, para < 0159.
 * @param {string} [raiz]
 */
export function censo(raiz = process.cwd()) {
  const pasta = join(raiz, 'supabase', 'migrations')
  return readdirSync(pasta)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((arquivo) => {
      const sql = readFileSync(join(pasta, arquivo), 'utf8').replace(/\r\n/g, '\n')
      const c = classificar(sql)
      const declaradas = classesDeclaradas(sql)
      return {
        arquivo,
        declarada: declaradas[0] ?? null,
        calculada: c.calculada,
        veredito: c.veredito,
        motivos: [...c.motivos.BACKFILL, ...c.motivos.DESTRUTIVA],
        ilegiveis: c.ilegiveis,
        valvulas: c.valvulas,
        doComEscrita: c.comandos.some(({ cmd, l }) => cmd.origem === 'do' && l.alvos.length > 0),
      }
    })
}

// -----------------------------------------------------------------------------
// 7. A LINHA DE COMANDO — `node scripts/db/classificar-migration.mjs --censo`
// -----------------------------------------------------------------------------
// Imprime o censo da cadeia em markdown (a evidência `docs/f63-evidencias/censo-cadeia.md`).
// Sem argumento, confere os arquivos ≥ 0159 pela regra e sai 1 se algum reprovar.

function linhaDoCenso(x) {
  const celula = (s) => s.replaceAll('|', '\|')
  return `| \`${x.arquivo}\` | ${x.declarada ?? '—'} | ${x.calculada} | ${x.veredito} | ${celula(x.motivos.join('; ') || '—')} | ${celula(
    [...x.ilegiveis, ...x.valvulas.map((v) => `válvula: ${v}`)].join('; ') || '—',
  )} |`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const raiz = process.cwd()
  if (process.argv.includes('--censo')) {
    const r = censo(raiz)
    const por = {}
    for (const x of r) por[x.veredito] = (por[x.veredito] ?? 0) + 1
    console.log(`# Censo da cadeia pelo classificador — ${r.length} migrations\n`)
    console.log(`Por veredito: ${Object.entries(por).map(([k, v]) => `${k} ${v}`).join(' · ')}\n`)
    console.log('| arquivo | declarada | calculada | veredito | por quê (escrita em tabela que já existia) | ilegível / válvula |')
    console.log('|---|---|---|---|---|---|')
    for (const x of r) if (x.veredito !== 'ADITIVA' || x.declarada) console.log(linhaDoCenso(x))
    console.log(`\n(${r.filter((x) => x.veredito === 'ADITIVA' && !x.declarada).length} arquivos ADITIVA sem cabeçalho omitidos da tabela.)`)
  } else {
    const pasta = join(raiz, 'supabase', 'migrations')
    let ruins = 0
    for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort()) {
      const problemas = conferirMigration(arquivo, readFileSync(join(pasta, arquivo), 'utf8').replace(/\r\n/g, '\n'))
      for (const p of problemas) console.log(`✗ ${arquivo}: ${p}`)
      if (problemas.length) ruins++
    }
    console.log(ruins ? `${ruins} migration(s) reprovada(s)` : 'todas as migrations a partir da 0159 passam pela regra')
    process.exitCode = ruins ? 1 : 0
  }
}
