import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { comandosDoTexto, semComentarios as semComentariosSql } from '../../../scripts/db/classificar-migration.mjs'
import { definicoesDeFuncao } from '../../../scripts/db/corpo-vigente.mjs'
import { semComentarios } from '@/lib/layout/texto-fonte'

// =============================================================================
// NINGUÉM LÊ `empresa_id` DO ACERVO ANTES DA F66 (F63, 23/09/2026 — decisão 7 do PLAN-F63)
// =============================================================================
// A F63 põe a coluna nas oito tabelas do acervo e NADA a lê: o recorte por empresa é da F66
// (policies) e da F67 (escrita). Uma leitura antecipada — um `.eq('empresa_id', …)`, um
// `.select('id, empresa_id')` — seria recorte feito pela metade, com a coluna preenchida pelo
// default da WAP, e daria a sensação de isolamento que não existe.
//
// É VARREDURA: nasce verde no mesmo commit (regra 4 da §4), e por isso cada leitura prova que
// acusa com um caso sintético (a sabotagem I). O universo é CONTADO — uma varredura que não
// achasse nenhuma consulta às oito passaria verde sem ter olhado nada.
//
// O QUE ELA OLHA
//   1. TS — em `src/**` (fora de `*.test.*` e de `src/lib/types/database.ts`, a exceção
//      nomeada: é o espelho GERADO do banco, e descreve a coluna sem lê-la), toda cadeia
//      `.from('<uma das oito>')…` lida até o fim dos métodos encadeados, e todo descritor
//      `leituraDeRelacao({ origem: '<uma das oito>', … })` (a porta das formas da F58, onde o
//      `select` mora numa constante). Nenhum cita `empresa_id`.
//   2. SQL, no DISCO — o corpo VIGENTE de toda função das migrations: nenhum cita `empresa_id`
//      junto de uma das oito.
//   3. SQL, no CATÁLOGO — as policies das oito, as funções e as views de `public`: é o bloco 7
//      de `supabase/tests/empresa_no_acervo.sql`, que roda no banco do CI (os roteiros de
//      catálogo ficam fora do universo daqui por construção — não moram em `src/**`).
//
// A LISTA DAS OITO sai de `k_lote1` em `supabase/tests/catalogo_policies.sql` — a fonte única
// (decisão 6); aqui ela é só lida.
// =============================================================================

const RAIZ = process.cwd()
const CATALOGO = readFileSync(join(RAIZ, 'supabase', 'tests', 'catalogo_policies.sql'), 'utf8')

function lote1(): string[] {
  const m = /k_lote1 text\[\] := array\[([\s\S]*?)\];/.exec(CATALOGO)
  if (!m) throw new Error('catalogo_policies.sql: não achei k_lote1 — a fonte única das oito')
  return [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1])
}

/** A exceção nomeada da varredura TS: o espelho gerado do banco. */
const EXCECOES_TS = ['src/lib/types/database.ts'] as const

// Todo fonte JS/TS que o bundler aceita — `.mts`/`.cts` e os `.js` também (2ª rodada da revisão
// adversarial: a varredura só via `.ts`/`.tsx`, e um utilitário `.mts` novo escaparia das duas travas).
const FONTE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const TESTE = /\.test\.(?:[cm]?[jt]s|[jt]sx)$/

function arquivosFonte(dir: string): string[] {
  const saida: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) saida.push(...arquivosFonte(caminho))
    else if (FONTE.test(nome) && !TESTE.test(nome)) saida.push(caminho)
  }
  return saida
}

/** Onde termina o `(`/`<` que abre em `i`, atravessando texto e template. */
function fimDoPar(texto: string, i: number): number {
  const abre = texto[i]
  const fecha = abre === '(' ? ')' : '>'
  let prof = 0
  for (let j = i; j < texto.length; j++) {
    const c = texto[j]
    if (c === "'" || c === '"' || c === '`') {
      for (j++; j < texto.length && texto[j] !== c; j++) if (texto[j] === '\\') j++
      continue
    }
    if (c === abre) prof++
    else if (c === fecha && --prof === 0) return j + 1
  }
  return -1
}

/** A cadeia de métodos a partir de `i` (logo depois do `)` do `.from(…)`): `.x(…)?.y<T>(…)…`. */
function cadeiaDeMetodos(texto: string, i: number): string {
  let fim = i
  for (;;) {
    let j = fim
    while (j < texto.length && /\s/.test(texto[j])) j++
    const ponto = texto.startsWith('?.', j) ? 2 : texto[j] === '.' ? 1 : 0
    if (!ponto) break
    j += ponto
    const nome = /^[A-Za-z_$][\w$]*/.exec(texto.slice(j))
    if (!nome) break
    j += nome[0].length
    while (j < texto.length && /\s/.test(texto[j])) j++
    if (texto[j] === '<') {
      const f = fimDoPar(texto, j)
      if (f < 0) break
      j = f
    }
    if (texto[j] === '(') {
      const f = fimDoPar(texto, j)
      if (f < 0) break
      j = f
    }
    fim = j
  }
  return texto.slice(i, fim)
}

type Leitura = { onde: string; tabela: string; texto: string }

/** As leituras das oito num texto TS: as cadeias `.from('<t>')…` e os descritores `leituraDeRelacao`. */
function leiturasDoAcervo(fonte: string, arquivo: string, oito: readonly string[]): { leituras: Leitura[]; dinamicas: Leitura[] } {
  const texto = semComentarios(fonte)
  const leituras: Leitura[] = []
  const dinamicas: Leitura[] = []
  const linha = (i: number) => `${arquivo}:${texto.slice(0, i).split('\n').length}`
  for (const m of texto.matchAll(/\.from\(\s*/g)) {
    const abre = m.index + '.from'.length
    const fecha = fimDoPar(texto, abre)
    if (fecha < 0) continue
    const arg = texto.slice(abre + 1, fecha - 1).trim()
    const literal = /^(['"`])([a-z_0-9]+)\1$/.exec(arg)
    const cadeia = texto.slice(m.index, fecha) + cadeiaDeMetodos(texto, fecha)
    if (literal) {
      if (oito.includes(literal[2])) leituras.push({ onde: linha(m.index), tabela: literal[2], texto: cadeia })
    } else if (!/^(Array|Buffer|Object|Uint8Array)$/.test(/([A-Za-z_$][\w$]*)\s*$/.exec(texto.slice(0, m.index))?.[1] ?? '')) {
      // `.from(tabela)` com a tabela numa variável: não dá para saber se é uma das oito, então a
      // cadeia é conferida do mesmo jeito (o conservador).
      dinamicas.push({ onde: linha(m.index), tabela: arg, texto: cadeia })
    }
  }
  for (const m of texto.matchAll(/\bleituraDeRelacao\s*\(/g)) {
    const abre = m.index + m[0].length - 1
    const fecha = fimDoPar(texto, abre)
    if (fecha < 0) continue
    const corpo = texto.slice(abre, fecha)
    const origem = /\borigem\s*:\s*(['"`])([a-z_0-9]+)\1/.exec(corpo)
    if (origem && oito.includes(origem[2])) leituras.push({ onde: linha(m.index), tabela: origem[2], texto: corpo })
  }
  return { leituras, dinamicas }
}

const citaEmpresaId = (l: Leitura) => /\bempresa_id\b/.test(l.texto)

describe('ninguém lê empresa_id do acervo antes da F66 — TS (decisão 7)', () => {
  const oito = lote1()
  const arquivos = arquivosFonte(join(RAIZ, 'src'))
    .map((a) => relative(RAIZ, a).replaceAll('\\', '/'))
    .filter((a) => !(EXCECOES_TS as readonly string[]).includes(a))
  const todas = arquivos.map((a) => leiturasDoAcervo(readFileSync(join(RAIZ, a), 'utf8'), a, oito))
  const leituras = todas.flatMap((t) => t.leituras)
  const dinamicas = todas.flatMap((t) => t.dinamicas)

  it('a lista das oito vem de k_lote1 (catalogo_policies.sql) e tem as oito', () => {
    expect([...oito].sort()).toEqual(
      ['anotacoes', 'ativos', 'colaboradores', 'itens', 'lancamentos_item', 'movimentacoes', 'pendencias_item', 'termos_gerados'],
    )
  })

  it('o universo NÃO é vazio: há consultas às oito tabelas, e cada uma das oito é consultada', () => {
    expect(leituras.length, 'a varredura não achou consulta nenhuma às oito — ela olhou alguma coisa?').toBeGreaterThan(100)
    for (const t of oito) expect(leituras.some((l) => l.tabela === t), `nenhuma consulta a ${t}`).toBe(true)
  })

  it('nenhuma consulta às oito (`.from` ou descritor de forma) cita empresa_id', () => {
    expect(leituras.filter(citaEmpresaId).map((l) => `${l.onde} (${l.tabela})`)).toEqual([])
  })

  it('nenhuma consulta de tabela DINÂMICA (`.from(variavel)`) cita empresa_id', () => {
    expect(dinamicas.filter(citaEmpresaId).map((l) => `${l.onde} (${l.tabela})`)).toEqual([])
  })

  it('a exceção nomeada ainda existe (a lista não guarda fantasma)', () => {
    for (const a of EXCECOES_TS) expect(() => statSync(join(RAIZ, a)), `${a} sumiu`).not.toThrow()
  })

  it('o universo de arquivos é todo fonte JS/TS de src/** — `.mts`, `.cts`, `.js` e `.jsx` também, teste fora', () => {
    for (const n of ['a.ts', 'a.tsx', 'a.mts', 'a.cts', 'a.js', 'a.jsx', 'a.mjs', 'a.cjs', 'a.d.ts']) expect(FONTE.test(n) && !TESTE.test(n), n).toBe(true)
    for (const n of ['a.test.ts', 'a.test.tsx', 'a.test.mts', 'a.dom.test.tsx', 'a.css', 'a.json', 'a.md']) expect(FONTE.test(n) && !TESTE.test(n), n).toBe(false)
  })

  // SABOTAGEM I (TS) — cada um destes, sintético, TEM de acusar; e o par legítimo, não.
  it.each([
    ['`.eq(empresa_id)` em ativos', "const { data } = await supabase.from('ativos').select('id').eq('empresa_id', empresa)", true],
    ['`.select(id, empresa_id)` em ativos, em várias linhas', "await supabase\n  .from('ativos')\n  .select(\n    'id, empresa_id',\n  )\n  .order('id')", true],
    ['`.match({ empresa_id })` em itens', 'await admin.from("itens").select("id").match({ empresa_id: e })', true],
    ['`?.` e argumento de tipo', "await c?.from('movimentacoes').select<string>('*')?.filter('empresa_id', 'eq', x)", true],
    ['descritor de forma com `select` citando a coluna', "export const L = leituraDeRelacao({ rotulo: 'x', origem: 'lancamentos_item', select: 'id, empresa_id', forma: F, ordem: ['id'] })", true],
    ['descritor de forma com `ordem` pela coluna', "leituraDeRelacao({ rotulo: 'x', origem: 'anotacoes', select: 'id', forma: F, ordem: ['empresa_id', 'id'] })", true],
    ['par legítimo: tabela da F62 (membros)', "await supabase.from('membros').select('id').eq('empresa_id', EMPRESA_LEGADA_ID)", false],
    ['par legítimo: a cadeia das oito SEM a coluna', "await supabase.from('ativos').select('id, patrimonio').eq('filial_id', f)", false],
    ['par legítimo: empresa_id num COMENTÁRIO', "await supabase.from('ativos').select('id') // empresa_id só na F66", false],
    ['par legítimo: empresa_id DEPOIS da cadeia, noutra instrução', "await supabase.from('ativos').select('id');\nconst empresa_id = 1", false],
  ])('a varredura %s', (_nome, fonte, acusa) => {
    const { leituras: l, dinamicas: d } = leiturasDoAcervo(fonte, 'sintetico.ts', oito)
    expect([...l, ...d].some(citaEmpresaId)).toBe(acusa)
  })
})

/**
 * Cada ocorrência do literal `empresa_id` num texto TS — sem comentário e com os textos
 * concatenados colados (`'empresa' + '_id'` vira `'empresa_id'`) —, com o TRECHO que a situa: do
 * `.from(` mais próximo antes dela até ela, com o espaço normalizado (sem `.from(` antes, os 120
 * caracteres de antes). O trecho, e não a contagem, é o que a catraca compara (2ª rodada da revisão
 * adversarial): a linha é sempre a mesma `.eq('empresa_id', EMPRESA_LEGADA_ID)`, e uma troca 1-por-1
 * no mesmo arquivo manteria a contagem.
 */
function ocorrenciasDeEmpresaId(fonte: string): string[] {
  const texto = semComentarios(fonte).replace(/(['"`])\s*\+\s*\1/g, '')
  return [...texto.matchAll(/\bempresa_id\b/g)].map((m) => {
    const de = texto.lastIndexOf('.from(', m.index)
    return texto
      .slice(de >= 0 ? de : Math.max(0, m.index - 120), m.index + 'empresa_id'.length)
      .replace(/\s+/g, ' ')
      .trim()
  })
}

/**
 * A CATRACA (revisão adversarial da F63). A varredura acima lê a CADEIA que começa em `.from(…)`, e
 * a revisão mostrou três caminhos que ela não segue: a coluna numa CONSTANTE (`const C = 'empresa_id';
 * .select(C)`), o texto PARTIDO (`'empresa' + '_id'`) e o construtor REATRIBUÍDO noutra instrução (`let q
 * = supabase.from('ativos')…; q = q.eq('empresa_id', x)` — o idioma de `queries/ativos.ts` e
 * `queries/itens.ts`). Os três têm uma coisa em comum: o literal `empresa_id` aparece no fonte. Então
 * a catraca lê o literal, arquivo a arquivo, em todo `src/**` (fora de teste e do `database.ts`), e cada
 * ocorrência tem de ser EXATAMENTE uma das daqui, pelo TRECHO desde o `.from(` — hoje, só as leituras
 * de `membros`/`operador_filiais` da F62. Uma ocorrência nova, em qualquer arquivo e por qualquer
 * caminho — ou uma trocada no lugar de outra —, reprova e obriga a olhar; a F66, que é quem pode ler,
 * acrescenta as dela com o motivo.
 */
const EMPRESA_ID_NO_APP: Record<string, { trechos: string[]; motivo: string }> = {
  'src/lib/auth/acesso.ts': {
    trechos: [".from('membros') .select(LEITURA_MEMBRO_OPERADOR.select) .eq('profile_id', user.id) .eq('empresa_id"],
    motivo: 'F62: o cargo pela membership na empresa legada (membros)',
  },
  'src/lib/queries/admin.ts': {
    trechos: [
      ".from('membros').select('profile_id, papel, ativo').eq('empresa_id",
      ".from('operador_filiais').select('usuario_id, filial_id').eq('empresa_id",
      ".from('membros') .select('profile_id') .eq('empresa_id",
      ".from('membros') .select('papel, ativo') .eq('profile_id', id) .eq('empresa_id",
      ".from('membros') .select('papel, ativo') .eq('profile_id', id) .eq('empresa_id",
      ".from('operador_filiais') .select('filial_id') .eq('usuario_id', id) .eq('empresa_id",
    ],
    motivo: 'F62: a lista de usuários e os vínculos (membros, operador_filiais) na empresa legada',
  },
}

describe('ninguém lê empresa_id do acervo antes da F66 — a catraca do literal em src/**', () => {
  const oito = lote1()
  const arquivos = arquivosFonte(join(RAIZ, 'src'))
    .map((a) => relative(RAIZ, a).replaceAll('\\', '/'))
    .filter((a) => !(EXCECOES_TS as readonly string[]).includes(a))

  it('o literal empresa_id aparece EXATAMENTE onde a F62 o pôs, trecho a trecho, e em nenhum outro lugar', () => {
    const achado: Record<string, string[]> = {}
    for (const a of arquivos) {
      const trechos = ocorrenciasDeEmpresaId(readFileSync(join(RAIZ, a), 'utf8'))
      if (trechos.length) achado[a] = trechos
    }
    const esperado = Object.fromEntries(Object.entries(EMPRESA_ID_NO_APP).map(([a, { trechos }]) => [a, trechos]))
    expect(achado, 'empresa_id apareceu, sumiu ou mudou de consulta num arquivo de src/** — é leitura nova da coluna? O recorte do acervo é da F66').toEqual(esperado)
  })

  it('nenhum trecho liberado parte de uma das oito', () => {
    for (const [a, { trechos }] of Object.entries(EMPRESA_ID_NO_APP)) {
      for (const t of trechos) {
        const tabela = /^\.from\(\s*['"`]([a-z_0-9]+)['"`]/.exec(t)?.[1]
        expect(tabela, `${a}: trecho sem o .from( da tabela — «${t}»`).toBeDefined()
        expect(oito.includes(tabela!), `${a}: o trecho lê ${tabela}, uma das oito`).toBe(false)
      }
    }
  })

  it('toda entrada da catraca tem motivo escrito', () => {
    for (const [a, { motivo }] of Object.entries(EMPRESA_ID_NO_APP)) expect(motivo.length, `${a} sem motivo`).toBeGreaterThan(20)
  })

  // SABOTAGEM I (a indireção que a revisão achou) — cada forma ACRESCENTA uma ocorrência que a catraca vê.
  it.each([
    ['a coluna numa constante', "const CAMPO = 'empresa_id'\nawait supabase.from('ativos').select(CAMPO)"],
    ['o texto partido', "await supabase.from('itens').select('id,' + 'empresa' + '_id')"],
    ['o template', "const COL = `empresa_id`\nawait supabase.from('movimentacoes').select(`id, ${COL}`)"],
    ['o construtor reatribuído noutra instrução', "let q = supabase.from('ativos').select('id')\nif (x) q = q.eq('empresa_id', v)"],
  ])('a catraca conta %s', (_nome, fonte) => {
    expect(ocorrenciasDeEmpresaId(fonte).length).toBeGreaterThan(0)
  })

  it('a troca 1-por-1 no mesmo arquivo muda o trecho — a contagem ficaria igual (2ª rodada)', () => {
    const legitima = "const m = await supabase.from('membros').select('papel').eq('empresa_id', EMPRESA_LEGADA_ID)"
    const trocada = "let q = supabase.from('ativos').select('id')\nif (x) q = q.eq('empresa_id', EMPRESA_LEGADA_ID)"
    expect(ocorrenciasDeEmpresaId(trocada)).toHaveLength(ocorrenciasDeEmpresaId(legitima).length)
    expect(ocorrenciasDeEmpresaId(trocada)).not.toEqual(ocorrenciasDeEmpresaId(legitima))
    expect(ocorrenciasDeEmpresaId(trocada)[0]).toMatch(/^\.from\('ativos'\)/)
  })

  it('a catraca não conta o comentário (o par legítimo)', () => {
    expect(ocorrenciasDeEmpresaId("// o empresa_id só na F66\nawait supabase.from('ativos').select('id')")).toEqual([])
  })
})

describe('ninguém lê empresa_id do acervo antes da F66 — o corpo VIGENTE das funções (disco)', () => {
  const oito = lote1()
  const DIR = join(RAIZ, 'supabase', 'migrations')
  // O corpo vigente: a ÚLTIMA definição de cada (nome, tipos) na ordem de aplicação.
  const vigentes = new Map<string, { arquivo: string; texto: string }>()
  for (const arquivo of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = semComentariosSql(readFileSync(join(DIR, arquivo), 'utf8').replace(/\r\n/g, '\n'))
    for (const d of definicoesDeFuncao(sql)) vigentes.set(`${d.esquema}.${d.nome}(${d.tipos.join(',')})`, { arquivo, texto: d.texto })
  }
  // O apelido é lido por LOOKAHEAD (2ª rodada da revisão adversarial): consumido, ele engolia a palavra
  // seguinte — em `select count(*) into v_n from public.ativos a`, o "apelido" de `v_n` era o `from`, e
  // `public.ativos a` sumia da leitura.
  const RE_TABELA = String.raw`\b(?:from|join|update|into)\s+(?:only\s+)?(?:public\.)?([a-z_][a-z0-9_]*)(?=(?:\s+(?:as\s+)?([a-z_][a-z0-9_]*))?)`
  const NAO_ALIAS = new Set(['where', 'on', 'set', 'join', 'left', 'right', 'inner', 'full', 'cross', 'using', 'order', 'group', 'limit', 'returning', 'values', 'select', 'natural', 'lateral', 'for', 'and', 'or', 'union', 'having', 'window', 'offset', 'fetch', 'when', 'then', 'loop', 'into', 'from', 'as'])

  /** As tabelas das oito que um COMANDO lê ou escreve (`from`/`join`/`update`/`into`). */
  const tabelasDoAcervo = (cmd: string) => [...cmd.matchAll(new RegExp(RE_TABELA, 'gi'))].map((m) => m[1].toLowerCase()).filter((t) => oito.includes(t))

  /**
   * Os comandos de um corpo que LEEM `empresa_id` de uma das oito. Por COMANDO — partido pelo léxico
   * do leitor único (`comandosDoTexto`: o `;` dentro de texto não parte, o texto entre aspas sai) —, porque uma função
   * pode ler `m.empresa_id` de `membros` num comando e contar `ativos` noutro
   * (`checagens_integridade_nucleo`, desde a F62). Dentro do comando: `x.empresa_id` conta se `x`
   * é uma das oito ou o alias de uma delas; `empresa_id` sem qualificador conta se o comando lê ou
   * escreve uma das oito.
   */
  function leEmpresaIdDoAcervo(corpo: string): string[] {
    const achados: string[] = []
    for (const cmd of comandosDoTexto(corpo)) {
      if (!/\bempresa_id\b/.test(cmd)) continue
      const alias = new Map<string, string>()
      for (const m of cmd.matchAll(new RegExp(RE_TABELA, 'gi'))) {
        const tabela = m[1].toLowerCase()
        alias.set(tabela, tabela)
        if (m[2] && !NAO_ALIAS.has(m[2].toLowerCase())) alias.set(m[2].toLowerCase(), tabela)
      }
      for (const m of cmd.matchAll(/(?:\b([a-z_][a-z0-9_]*)\s*\.\s*)?\bempresa_id\b/gi)) {
        const q = m[1]?.toLowerCase()
        const tabela = q ? (alias.get(q) ?? q) : null
        if (tabela ? oito.includes(tabela) : tabelasDoAcervo(cmd).length > 0) {
          achados.push(cmd.replace(/\s+/g, ' ').trim().slice(0, 120))
          break
        }
      }
    }
    return achados
  }

  it('o universo não é vazio: há funções vigentes que tocam as oito', () => {
    expect(vigentes.size).toBeGreaterThan(80)
    expect([...vigentes.values()].filter((v) => tabelasDoAcervo(v.texto).length > 0).length).toBeGreaterThan(40)
  })

  it('nenhuma função vigente lê empresa_id de uma das oito', () => {
    expect(
      [...vigentes.entries()].flatMap(([k, v]) => leEmpresaIdDoAcervo(v.texto).map((c) => `${k} (vigente em ${v.arquivo}): ${c}`)),
    ).toEqual([])
  })

  it.each([
    ['um corpo lendo movimentacoes.empresa_id pelo alias', 'select m.empresa_id from public.movimentacoes m limit 1', true],
    ['um corpo filtrando ativos por empresa_id sem qualificador', 'select count(*) from public.ativos where empresa_id = p_empresa', true],
    ['um corpo gravando empresa_id em itens', 'insert into public.itens (nome, empresa_id) values (p_nome, p_empresa)', true],
    ['par legítimo: membros.empresa_id', 'select m.empresa_id from public.membros m limit 1', false],
    ['par legítimo: membros num comando, ativos noutro (a forma de checagens_integridade_nucleo)', 'select count(*) into v from public.ativos; select 1 from public.membros m where m.empresa_id = public.empresa_legada()', false],
    // 2ª rodada da revisão adversarial: o `;` dentro de TEXTO não parte o comando; o `into v_n from` não esconde a tabela
    ['`select … into v_n from` a tabela das oito', 'select count(*) into v_n from public.ativos a where a.empresa_id = p_x', true],
    ['um `;` num texto entre o alias e a leitura', "select count(*) into v_n from public.ativos a, public.movimentacoes m where m.motivo = 'estado; transicao invalida' and a.empresa_id = p_x", true],
    ['a leitura dentro do corpo dollar-quoted de uma função', "create function public.f() returns int language plpgsql as $f$ begin raise notice 'a; b'; return (select count(*) from public.itens i where i.empresa_id is null); end $f$", true],
    ['par legítimo: `empresa_id` só dentro de um texto', "select count(*) from public.ativos a where a.observacao = 'a.empresa_id; x'", false],
  ])('SABOTAGEM I (disco) — %s', (_nome, corpo, acusa) => {
    expect(leEmpresaIdDoAcervo(corpo).length > 0).toBe(acusa)
  })
})
