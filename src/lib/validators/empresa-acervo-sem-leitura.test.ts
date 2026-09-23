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

// EMENDA F64 (23/09/2026 — decisão 7 do PLAN-F64). A F64 põe a coluna nas ONZE tabelas de negócio
// restantes (`k_lote2`), e a mesma régua passa a valer para as DEZENOVE (lote 1 + lote 2): ninguém lê
// `empresa_id` delas antes da F66. Com UMA exceção de propósito, nomeada: a ficha F64 manda conferir
// que o motivo do kit existe NA EMPRESA DO KIT, e isso é ler `kits_modelos.empresa_id` e
// `motivos.empresa_id` — leitura de INTEGRIDADE, não recorte. As duas funções que o fazem moram em
// `k_leitura_integridade` (catalogo_policies.sql, a fonte única), e a exceção vale SÓ nos comandos
// delas que tocam `kits_modelos`/`motivos` (a leitura do kit) — o mesmo corpo lendo a coluna de outra
// tabela do lote continua reprovado.
const RAIZ = process.cwd()
const CATALOGO = readFileSync(join(RAIZ, 'supabase', 'tests', 'catalogo_policies.sql'), 'utf8')

function listaDoCatalogo(nome: string, oQue: string): string[] {
  const m = new RegExp(String.raw`${nome} text\[\] := array\[([\s\S]*?)\];`).exec(CATALOGO)
  if (!m) throw new Error(`catalogo_policies.sql: não achei ${nome} — a fonte única ${oQue}`)
  return [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1])
}
const lote1 = () => listaDoCatalogo('k_lote1', 'das oito')
const lote2 = () => listaDoCatalogo('k_lote2', 'das onze')
/** As dezenove tabelas de negócio que têm `empresa_id` pelos lotes 1 (F63) e 2 (F64). */
const lotes = () => [...lote1(), ...lote2()]
/** As exceções nominais de leitura (F64): as duas leituras de integridade do kit. */
const leituraIntegridade = () => listaDoCatalogo('k_leitura_integridade', 'das exceções de leitura')
/** As tabelas cuja coluna as exceções podem ler — e só nelas (`k_tabelas_leitura_kit`, a fonte única). */
const TABELAS_DA_LEITURA_DO_KIT: readonly string[] = listaDoCatalogo('k_tabelas_leitura_kit', 'das tabelas da leitura do kit')

// EMENDA F65 (23/09/2026). A F65 cria três leituras legítimas de `empresa_id` no SQL — integridade e
// identidade, não recorte: `guarda_empresa` (só `new`/`old`, nas 20 de negócio), `termo_da_empresa`
// (`termos_gerados`, `movimentacoes`, `ativos`) e a diagonal por empresa de `vocabulario_unidades_guarda`
// (`filiais`, `unidades_apelidos`). Cada uma lê SÓ das tabelas dela: a fonte única é `k_leitura_tenant`
// em catalogo_policies.sql, entrada `função:tabela,tabela` — o mesmo despachante de
// `pg_temp.leitura_de_empresa` (_asserts.sql), aqui no disco.
const LEITURA_TENANT: ReadonlyMap<string, readonly string[]> = (() => {
  const m = /k_leitura_tenant text\[\] := array\[([\s\S]*?)\];/.exec(CATALOGO)
  if (!m) throw new Error('catalogo_policies.sql: não achei k_leitura_tenant — a fonte única das exceções da F65')
  return new Map([...m[1].matchAll(/'([a-z_0-9]+):([a-z_0-9,]+)'/g)].map((x) => [x[1], x[2].split(',')] as const))
})()

/** A exceção nomeada da varredura TS: o espelho gerado do banco. */
const EXCECOES_TS = ['src/lib/types/database.ts'] as const

// EMENDA F65 (23/09/2026 — decisões 5 e 6 do PLAN-F65). Duas cadeias TS passam a citar `empresa_id` de
// uma das dezenove ANTES da F66 — nenhuma é recorte (as duas continuam sem filtro de empresa): a
// IDENTIDADE da chave do snapshot (o índice da 0171 é por empresa, e a badge "superada" tem de agrupar
// pela mesma chave) e o ÁRBITRO do `ON CONFLICT` dos colaboradores (o unique da 0172/0174 é por empresa,
// e o Postgres só infere o índice com EXATAMENTE essas colunas). Exceção NOMINAL, por arquivo E tabela,
// cada uma usada exatamente uma vez — um `.eq('empresa_id', …)` novo no mesmo arquivo segue reprovado
// pela catraca abaixo, que compara trecho a trecho.
const EXCECOES_TS_F65: readonly { arquivo: string; tabela: string; motivo: string }[] = [
  {
    arquivo: 'src/lib/queries/gerados.ts',
    tabela: 'relatorios_gerados',
    motivo: 'F65 (decisão 6): a chave da versão do snapshot é por empresa — identidade da chave, não recorte',
  },
  {
    arquivo: 'src/lib/actions/colaboradores.ts',
    tabela: 'colaboradores',
    motivo: 'F65 (decisão 5): o árbitro do ON CONFLICT é o unique por empresa — alvo de inferência, não recorte',
  },
]
const ehExcecaoTsF65 = (l: Leitura) =>
  EXCECOES_TS_F65.some((e) => l.onde.startsWith(`${e.arquivo}:`) && l.tabela === e.tabela)

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
  // Desde a F64: as dezenove (os dois lotes). O nome `oito` fica — é o universo da trava, que cresceu.
  const oito = lotes()
  const arquivos = arquivosFonte(join(RAIZ, 'src'))
    .map((a) => relative(RAIZ, a).replaceAll('\\', '/'))
    .filter((a) => !(EXCECOES_TS as readonly string[]).includes(a))
  const todas = arquivos.map((a) => leiturasDoAcervo(readFileSync(join(RAIZ, a), 'utf8'), a, oito))
  const leituras = todas.flatMap((t) => t.leituras)
  const dinamicas = todas.flatMap((t) => t.dinamicas)

  it('a lista das oito vem de k_lote1 (catalogo_policies.sql) e tem as oito', () => {
    expect([...lote1()].sort()).toEqual(
      ['anotacoes', 'ativos', 'colaboradores', 'itens', 'lancamentos_item', 'movimentacoes', 'pendencias_item', 'termos_gerados'],
    )
  })

  it('a lista das onze vem de k_lote2 (catalogo_policies.sql) e tem as onze (F64)', () => {
    expect([...lote2()].sort()).toEqual([
      'eventos_admin', 'import_logs', 'import_prefixos_patrimonio', 'import_termos_categoria', 'import_termos_estado',
      'kits_modelos', 'motivos', 'relatorios_gerados', 'senhas_acesso', 'tipos_item', 'unidades_apelidos',
    ])
  })

  it('o universo NÃO é vazio: há consultas às dezenove tabelas, e cada uma é consultada', () => {
    expect(leituras.length, 'a varredura não achou consulta nenhuma às dezenove — ela olhou alguma coisa?').toBeGreaterThan(140)
    for (const t of oito) expect(leituras.some((l) => l.tabela === t), `nenhuma consulta a ${t}`).toBe(true)
  })

  it('nenhuma consulta às oito (`.from` ou descritor de forma) cita empresa_id — fora das duas exceções nominais da F65', () => {
    expect(leituras.filter((l) => citaEmpresaId(l) && !ehExcecaoTsF65(l)).map((l) => `${l.onde} (${l.tabela})`)).toEqual([])
  })

  it('cada exceção nominal da F65 é usada por EXATAMENTE uma cadeia (a lista não guarda fantasma nem cobre duas)', () => {
    for (const e of EXCECOES_TS_F65) {
      const usos = leituras.filter((l) => citaEmpresaId(l) && l.onde.startsWith(`${e.arquivo}:`) && l.tabela === e.tabela)
      expect(usos.map((l) => l.onde), `${e.arquivo} (${e.tabela})`).toHaveLength(1)
      expect(e.motivo.length, `${e.arquivo} sem motivo`).toBeGreaterThan(20)
    }
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
    // F64 — o lote 2 (sabotagem F da ordem)
    ['`.eq(empresa_id)` em eventos_admin (F64)', "await admin.from('eventos_admin').select('id, acao').eq('empresa_id', e).order('quando')", true],
    ['`.select(id, empresa_id)` em senhas_acesso (F64)', "const { data } = await admin.from('senhas_acesso').select('id, empresa_id').eq('ativa', true)", true],
    ['descritor de forma de motivos citando a coluna (F64)', "leituraDeRelacao({ rotulo: 'x', origem: 'motivos', select: 'codigo, rotulo, empresa_id', forma: F, ordem: ['codigo'] })", true],
    ['par legítimo: o lote 2 SEM a coluna', "await admin.from('eventos_admin').select('id, acao, alvo').order('quando', { ascending: false })", false],
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
  // F65 — as duas exceções nominais (EXCECOES_TS_F65, lá em cima): partem de uma das dezenove, e só elas podem.
  'src/lib/queries/gerados.ts': {
    trechos: [
      ".from('relatorios_gerados') .select('id, empresa_id",
      ".from('relatorios_gerados') .select('id, empresa_id, periodo_de, periodo_ate, filial_id, versao') .in('periodo_de', datas) if (eVersoes) { registrarFalha({ escopo: 'gerados.versoes-superadas', erro: eVersoes }) } else { for (const v of versoes ?? []) { const empresa = v.empresa_id",
    ],
    motivo: 'F65 (decisão 6): a empresa de cada versão, para a chave do snapshot (o índice da 0171)',
  },
  'src/lib/actions/colaboradores.ts': {
    trechos: [
      ".from('colaboradores') .upsert( aCriar.map((g) => ({ nome: g.grafia_exemplo.trim(), filial_id: g.filial_id, criado_por: aut.uid, })), { onConflict: 'empresa_id",
    ],
    motivo: 'F65 (decisão 5): o alvo do ON CONFLICT da consolidação (o unique por empresa da 0172/0174)',
  },
}

describe('ninguém lê empresa_id do acervo antes da F66 — a catraca do literal em src/**', () => {
  const oito = lotes()
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

  it('nenhum trecho liberado parte de uma das oito — fora das exceções nominais da F65, cada uma da SUA tabela', () => {
    for (const [a, { trechos }] of Object.entries(EMPRESA_ID_NO_APP)) {
      for (const t of trechos) {
        const tabela = /^\.from\(\s*['"`]([a-z_0-9]+)['"`]/.exec(t)?.[1]
        expect(tabela, `${a}: trecho sem o .from( da tabela — «${t}»`).toBeDefined()
        const nominal = EXCECOES_TS_F65.some((e) => e.arquivo === a && e.tabela === tabela)
        expect(oito.includes(tabela!) && !nominal, `${a}: o trecho lê ${tabela}, uma das oito`).toBe(false)
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
  const oito = lotes()
  const excecoes = leituraIntegridade()
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

  // As tabelas em que cada função é GATILHO, lidas do disco (`create trigger … on T … execute function F(`).
  // Um `drop trigger X on T` não é seguido: nenhuma migration derruba gatilho de função que interesse aqui, e o
  // catálogo (15h, no CI) é a palavra final sobre o vivo.
  const GATILHOS = new Map<string, Set<string>>()
  for (const arquivo of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = semComentariosSql(readFileSync(join(DIR, arquivo), 'utf8').replace(/\r\n/g, '\n'))
    const RE = /create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+[a-z_0-9]+[^;]*?\bon\s+(?:public\.)?([a-z_0-9]+)[^;]*?execute\s+(?:function|procedure)\s+(?:public\.)?([a-z_0-9]+)\s*\(/gi
    for (const m of sql.matchAll(RE)) {
      const funcao = m[2].toLowerCase()
      if (!GATILHOS.has(funcao)) GATILHOS.set(funcao, new Set())
      GATILHOS.get(funcao)!.add(m[1].toLowerCase())
    }
  }
  /** As tabelas das dezenove em que a função é gatilho — a linha que o `new`/`old` dela lê (F65, o fato 21). */
  const gatilhosNoLote = (funcao: string) => [...(GATILHOS.get(funcao) ?? [])].filter((t) => oito.includes(t))

  /**
   * Os comandos de um corpo que LEEM `empresa_id` de uma das oito. Por COMANDO — partido pelo léxico
   * do leitor único (`comandosDoTexto`: o `;` dentro de texto não parte, o texto entre aspas sai) —, porque uma função
   * pode ler `m.empresa_id` de `membros` num comando e contar `ativos` noutro
   * (`checagens_integridade_nucleo`, desde a F62). Dentro do comando: `x.empresa_id` conta se `x`
   * é uma das oito ou o alias de uma delas; `empresa_id` sem qualificador conta se o comando lê ou
   * escreve uma das oito.
   *
   * F65 (o fato 21 da ordem — o furo que `pg_temp.leitura_de_empresa_do_lote` também tinha): `new.empresa_id`/
   * `old.empresa_id` numa função que é GATILHO de uma das dezenove é ler a coluna da linha do gatilho, sem citar
   * a tabela no corpo — a forma de `guarda_empresa`. Conta, com as tabelas do gatilho (`gatilhos`).
   */
  function leEmpresaIdDoAcervo(corpo: string, gatilhos: readonly string[] = []): string[] {
    return comandosQueLeem(corpo, gatilhos).map((c) => c.trecho)
  }

  /** Os comandos que leem, com as tabelas dos lotes que cada um toca (a régua das exceções). */
  function comandosQueLeem(corpo: string, gatilhos: readonly string[] = []): { trecho: string; tabelas: string[] }[] {
    const achados: { trecho: string; tabelas: string[] }[] = []
    for (const cmd of comandosDoTexto(corpo)) {
      // sem caixa: o Postgres dobra o identificador sem aspas (`A.EMPRESA_ID` é `a.empresa_id`)
      if (!/\bempresa_id\b/i.test(cmd)) continue
      const alias = new Map<string, string>()
      for (const m of cmd.matchAll(new RegExp(RE_TABELA, 'gi'))) {
        const tabela = m[1].toLowerCase()
        alias.set(tabela, tabela)
        if (m[2] && !NAO_ALIAS.has(m[2].toLowerCase())) alias.set(m[2].toLowerCase(), tabela)
      }
      // O nome de um CTE aparece depois de `from` como se fosse tabela — mas não é uma.
      const ctes = new Set(
        [...cmd.matchAll(/(?:\bwith(?:\s+recursive)?|,)\s*([a-z_][a-z0-9_]*)\s+as\s*(?:(?:not\s+)?materialized\s*)?\(/gi)].map((c) => c[1].toLowerCase()),
      )
      for (const m of cmd.matchAll(/(?:\b([a-z_][a-z0-9_]*)\s*\.\s*)?\bempresa_id\b/gi)) {
        const q = m[1]?.toLowerCase()
        // F65: a linha do gatilho — conta se a função é gatilho de uma das dezenove.
        if ((q === 'new' || q === 'old') && gatilhos.length > 0) {
          achados.push({ trecho: cmd.replace(/\s+/g, ' ').trim().slice(0, 120), tabelas: [...new Set([...tabelasDoAcervo(cmd), ...gatilhos])] })
          break
        }
        // O qualificador resolvido é uma tabela real (a própria, ou o apelido direto dela): conta se é uma das oito.
        // O que NÃO se resolve — o apelido de um subselect ou de um CTE (3ª rodada da revisão adversarial: `select
        // x.empresa_id from (select * from public.ativos) x`), uma variável de registro — é DESCONHECIDO, e cai na
        // mesma régua do sem qualificador: conta se o comando lê ou escreve uma das oito.
        const real = q ? alias.get(q) : undefined
        const tabela = q ? (real && !ctes.has(real) ? real : oito.includes(q) ? q : null) : null
        if (tabela ? oito.includes(tabela) : tabelasDoAcervo(cmd).length > 0) {
          achados.push({ trecho: cmd.replace(/\s+/g, ' ').trim().slice(0, 120), tabelas: [...new Set(tabelasDoAcervo(cmd))] })
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

  /** A exceção do kit: função nominal E o comando só toca `kits_modelos`/`motivos` dos lotes. */
  const ehLeituraDoKit = (funcao: string, tabelas: string[]) =>
    excecoes.includes(funcao) && tabelas.length > 0 && tabelas.every((t) => TABELAS_DA_LEITURA_DO_KIT.includes(t))
  /** As tabelas cuja coluna a função pode ler: as DELA em `k_leitura_tenant` (F65) ou, fora dela, as do kit (F64). */
  const permitidasPara = (funcao: string): readonly string[] => LEITURA_TENANT.get(funcao) ?? TABELAS_DA_LEITURA_DO_KIT
  /** O despachante (o espelho de `pg_temp.leitura_de_empresa`): a exceção da F65 é da função e das tabelas dela. */
  const ehExcecao = (funcao: string, tabelas: string[]) =>
    LEITURA_TENANT.has(funcao)
      ? tabelas.length > 0 && tabelas.every((t) => permitidasPara(funcao).includes(t))
      : ehLeituraDoKit(funcao, tabelas)
  const nomeDaChave = (k: string) => /^[a-z_]+\.([a-z_0-9]+)\(/.exec(k)?.[1] ?? k

  /** `new`/`old` são a linha do gatilho: valem só se TODO gatilho que executa a função está numa tabela permitida a ela. */
  const gatilhoPermitido = (funcao: string) => {
    const tabelas = GATILHOS.get(funcao)
    return !!tabelas && tabelas.size > 0 && [...tabelas].every((t) => permitidasPara(funcao).includes(t))
  }
  /** O nome da F64, mantido: para as duas exceções do kit, "permitida" é "do kit". */
  const gatilhoNoKit = (funcao: string) => !LEITURA_TENANT.has(funcao) && gatilhoPermitido(funcao)

  /**
   * NAS EXCEÇÕES, a origem de cada `x.empresa_id` tem de ser PROVADA no próprio comando (2ª rodada da revisão adversarial
   * da F64 — o espelho de `pg_temp.leitura_de_empresa_do_lote`, `_asserts.sql`): `x` é uma tabela declarada NO COMANDO
   * (`from|join|update|into T [as] x`, ou o próprio nome da tabela) do kit ou de fora dos lotes; `new`/`old` só com todo
   * gatilho da função numa tabela do kit. A variável de registro de `select * into v from public.eventos_admin …; if
   * v.empresa_id …` — a leitura partida em dois comandos, que nenhum dos dois casava — e o apelido de subselect ACUSAM:
   * a exceção se escreve com apelido no próprio comando. Sem qualificador passa: `comandosQueLeem` já recusa o comando
   * que cita tabela do lote fora do kit, e aí a coluna só pode ser de tabela permitida.
   */
  function origensNaoProvadas(funcao: string, corpo: string): string[] {
    const achados: string[] = []
    for (const bruto of comandosDoTexto(corpo)) {
      const cmd = bruto.toLowerCase()
      if (!/\bempresa_id\b/.test(cmd)) continue
      for (const m of cmd.matchAll(/(?:\b([a-z_][a-z0-9_]*)\s*\.\s*)?\bempresa_id\b/g)) {
        const q = m[1]
        if (!q) continue
        const trecho = `${q}.empresa_id em "${cmd.replace(/\s+/g, ' ').trim().slice(0, 100)}"`
        if (q === 'new' || q === 'old') {
          if (!gatilhoPermitido(funcao)) achados.push(`${trecho} (sem gatilho no kit)`)
          continue
        }
        // a declaração sem o `distinct from` (não declara nada), e o nome declarado sem `.` depois: em
        // `p is distinct from v.empresa_id`, `v` não vira tabela
        const decl = cmd.replace(/\bdistinct\s+from\b/g, 'distinct de')
        const DECLARA = String.raw`\b(?:from|join|update|into)\s+(?:only\s+)?(?:public\s*\.\s*)?`
        const origens = [...decl.matchAll(new RegExp(String.raw`${DECLARA}([a-z_][a-z0-9_]*)\s+(?:as\s+)?${q}\b(?!\s*\.)`, 'g'))].map((o) => o[1])
        if (new RegExp(String.raw`${DECLARA}${q}\b(?!\s*\.)`).test(decl)) origens.push(q)
        if (origens.length === 0) achados.push(`${trecho} (origem que o comando não prova)`)
        else if (origens.some((o) => oito.includes(o) && !permitidasPara(funcao).includes(o))) achados.push(`${trecho} (outra tabela do lote)`)
      }
    }
    return achados
  }

  it('nenhuma função vigente lê empresa_id de uma das dezenove (fora da leitura do kit nas duas exceções nominais e das tabelas de cada exceção da F65)', () => {
    expect(
      [...vigentes.entries()].flatMap(([k, v]) =>
        comandosQueLeem(v.texto, gatilhosNoLote(nomeDaChave(k)))
          .filter((c) => !ehExcecao(nomeDaChave(k), c.tabelas))
          .map((c) => `${k} (vigente em ${v.arquivo}): ${c.trecho}`),
      ),
    ).toEqual([])
  })

  it('as exceções da F65 (k_leitura_tenant) são as três, cada uma é função vigente, LÊ, e prova a origem no comando', () => {
    expect([...LEITURA_TENANT.keys()].sort()).toEqual(['guarda_empresa', 'termo_da_empresa', 'vocabulario_unidades_guarda'])
    for (const [nome, tabelas] of LEITURA_TENANT) {
      const defs = [...vigentes.entries()].filter(([k]) => nomeDaChave(k) === nome)
      expect(defs.length, `${nome}: não há função vigente com esse nome nas migrations`).toBe(1)
      const leituras = comandosQueLeem(defs[0][1].texto, gatilhosNoLote(nome))
      expect(leituras.length, `${nome}: a exceção não lê empresa_id de tabela nenhuma dos lotes — exceção sem uso é fantasma`).toBeGreaterThan(0)
      expect(leituras.filter((c) => !ehExcecao(nome, c.tabelas)).map((c) => c.trecho), nome).toEqual([])
      expect(origensNaoProvadas(nome, defs[0][1].texto), nome).toEqual([])
      expect(tabelas.length, nome).toBeGreaterThan(0)
    }
    // a guarda é gatilho em EXATAMENTE as tabelas da entrada dela — as 20 de negócio (o 15k, no disco)
    expect([...(GATILHOS.get('guarda_empresa') ?? [])].sort()).toEqual([...(LEITURA_TENANT.get('guarda_empresa') ?? [])].sort())
    expect(LEITURA_TENANT.get('guarda_empresa')).toHaveLength(20)
  })

  it.each([
    ['o gatilho de uma das dezenove lendo new.empresa_id (o fato 21: sem citar a tabela)', "if new.empresa_id is distinct from old.empresa_id then raise exception 'x'; end if", ['ativos'], true],
    ['par legítimo: o mesmo corpo numa função que NÃO é gatilho dos lotes', "if new.empresa_id is distinct from old.empresa_id then raise exception 'x'; end if", [], false],
  ])('SABOTAGEM F (disco, F65) — %s', (_nome, corpo, gatilhos, acusa) => {
    expect(leEmpresaIdDoAcervo(corpo, gatilhos).length > 0).toBe(acusa)
  })

  it.each([
    ['termo_da_empresa lendo a coluna de uma tabela que não é dela', 'termo_da_empresa', 'select count(*) into v from public.eventos_admin e where e.empresa_id = new.empresa_id', true],
    ['vocabulario_unidades_guarda lendo ativos', 'vocabulario_unidades_guarda', 'perform 1 from public.ativos a where a.empresa_id = new.empresa_id', true],
    ['uma função fora de k_leitura_tenant com o corpo do termo', 'rel_qualquer', 'select count(distinct m.id) into v from public.movimentacoes m where m.empresa_id = p_e', true],
    ['par legítimo: termo_da_empresa lendo movimentacoes e ativos, declarados no comando', 'termo_da_empresa', 'select count(distinct m.id) into v from public.movimentacoes m where m.id = any (new.movimentacao_ids) and m.empresa_id = new.empresa_id', false],
    ['par legítimo: a diagonal lendo unidades_apelidos', 'vocabulario_unidades_guarda', 'select ua.filial_id into v from public.unidades_apelidos ua where ua.apelido_chave = v_chave and ua.empresa_id = new.empresa_id', false],
  ])('SABOTAGEM F (disco, F65, o despachante) — %s', (_nome, funcao, corpo, acusa) => {
    const tabelasGatilho = gatilhosNoLote(funcao)
    const acusou =
      comandosQueLeem(corpo, tabelasGatilho).filter((c) => !ehExcecao(funcao, c.tabelas)).length > 0 ||
      (LEITURA_TENANT.has(funcao) && origensNaoProvadas(funcao, corpo).length > 0)
    expect(acusou).toBe(acusa)
  })

  it('as exceções nominais (k_leitura_integridade) são as duas do kit, cada uma é função vigente, e cada uma LÊ (a lista não guarda fantasma)', () => {
    expect([...excecoes].sort()).toEqual(['checagens_integridade_nucleo', 'kit_motivo_da_empresa'])
    for (const nome of excecoes) {
      const defs = [...vigentes.entries()].filter(([k]) => nomeDaChave(k) === nome)
      expect(defs.length, `${nome}: não há função vigente com esse nome nas migrations`).toBe(1)
      expect(
        comandosQueLeem(defs[0][1].texto).some((c) => ehLeituraDoKit(nome, c.tabelas)),
        `${nome}: a exceção não lê empresa_id de kits_modelos/motivos — exceção sem uso é fantasma`,
      ).toBe(true)
    }
  })

  it.each([
    ['a exceção lendo kits_modelos e motivos (a leitura do kit)', 'kit_motivo_da_empresa', "if not exists (select 1 from public.motivos m where m.codigo = v_motivo and m.empresa_id = new.empresa_id) then raise exception 'x'; end if", false],
    ['a exceção lendo a coluna de OUTRA tabela do lote', 'kit_motivo_da_empresa', 'select count(*) into v from public.eventos_admin e where e.empresa_id = new.empresa_id', true],
    ['uma função que NÃO é exceção lendo motivos.empresa_id', 'rel_por_motivo', 'select m.codigo from public.motivos m where m.empresa_id = p_empresa', true],
    ['uma função que não é exceção lendo tipos_item.empresa_id sem qualificador', 'qualquer', 'select count(*) from public.tipos_item where empresa_id = p_e', true],
  ])('SABOTAGEM F (disco, F64) — %s', (_nome, funcao, corpo, acusa) => {
    expect(comandosQueLeem(corpo).filter((c) => !ehLeituraDoKit(funcao, c.tabelas)).length > 0).toBe(acusa)
  })

  it('nas duas exceções, a origem de cada x.empresa_id do corpo vigente é PROVADA no próprio comando', () => {
    for (const nome of excecoes) {
      const defs = [...vigentes.entries()].filter(([k]) => nomeDaChave(k) === nome)
      expect(defs.length, nome).toBe(1)
      expect(origensNaoProvadas(nome, defs[0][1].texto), nome).toEqual([])
    }
  })

  it('o gatilho do kit está só em kits_modelos (o new/old dele vale); o núcleo não é gatilho (o dele não vale)', () => {
    expect([...(GATILHOS.get('kit_motivo_da_empresa') ?? [])]).toEqual(['kits_modelos'])
    expect(gatilhoNoKit('kit_motivo_da_empresa')).toBe(true)
    expect(gatilhoNoKit('checagens_integridade_nucleo')).toBe(false)
  })

  it.each([
    ['a variável de registro de eventos_admin (dois comandos)', 'kit_motivo_da_empresa', "select * into v_e from public.eventos_admin where id = p_id; if v_e.empresa_id <> public.empresa_legada() then raise exception 'x'; end if", true],
    ['a variável de registro de kits_modelos — nem do kit ela se prova', 'kit_motivo_da_empresa', 'select * into v_k from public.kits_modelos where id = p_id; if v_k.empresa_id is null then return new; end if', true],
    ['new.empresa_id numa função sem gatilho no kit', 'checagens_integridade_nucleo', 'perform 1 from public.motivos m where m.empresa_id = new.empresa_id', true],
    ['o apelido de subselect', 'checagens_integridade_nucleo', 'select x.empresa_id from (select * from public.motivos) x', true],
    ['o `is distinct from` não faz da variável de registro uma tabela', 'kit_motivo_da_empresa', "select * into v_e from public.eventos_admin where id = p_id; if new.empresa_id is distinct from v_e.empresa_id then raise exception 'x'; end if", true],
    ['em MAIÚSCULAS, de outra tabela do lote', 'kit_motivo_da_empresa', 'PERFORM 1 FROM PUBLIC.EVENTOS_ADMIN E WHERE E.EMPRESA_ID = NEW.EMPRESA_ID', true],
    ['par legítimo: o apelido de membros e o de motivos, declarados no comando', 'checagens_integridade_nucleo', 'select count(*) from public.membros m join public.motivos o on o.codigo = m.papel where m.empresa_id = o.empresa_id', false],
    ['par legítimo: a leitura do kit pelo gatilho do kit', 'kit_motivo_da_empresa', 'if not exists (select 1 from public.motivos m where m.codigo = v_motivo and m.empresa_id = new.empresa_id) then return new; end if', false],
  ])('SABOTAGEM F (disco, F64, 2ª rodada) — %s', (_nome, funcao, corpo, acusa) => {
    expect(origensNaoProvadas(funcao, corpo).length > 0).toBe(acusa)
  })

  it.each([
    ['um corpo lendo movimentacoes.empresa_id pelo alias', 'select m.empresa_id from public.movimentacoes m limit 1', true],
    ['um corpo filtrando ativos por empresa_id sem qualificador', 'select count(*) from public.ativos where empresa_id = p_empresa', true],
    ['um corpo gravando empresa_id em itens', 'insert into public.itens (nome, empresa_id) values (p_nome, p_empresa)', true],
    ['par legítimo: membros.empresa_id', 'select m.empresa_id from public.membros m limit 1', false],
    ['par legítimo: membros num comando, ativos noutro (a forma de checagens_integridade_nucleo)', 'select count(*) into v from public.ativos; select 1 from public.membros m where m.empresa_id = public.empresa_legada()', false],
    // 2ª rodada da revisão adversarial: o `;` dentro de TEXTO não parte o comando; o `into v_n from` não esconde a tabela
    ['`select … into v_n from` a tabela das oito', 'select count(*) into v_n from public.ativos a where a.empresa_id = p_x', true],
    // 3ª rodada: o apelido que não é de tabela real — subselect, CTE — não livra a leitura
    ['pelo apelido de um SUBSELECT sobre uma das oito', 'select x.empresa_id from (select * from public.ativos) x where x.id = 5', true],
    ['pelo apelido de um CTE sobre uma das oito', 'with x as (select * from public.movimentacoes) select x.empresa_id from x', true],
    ['par legítimo: o apelido de um subselect sobre membros', 'select x.empresa_id from (select * from public.membros) x', false],
    ['um `;` num texto entre o alias e a leitura', "select count(*) into v_n from public.ativos a, public.movimentacoes m where m.motivo = 'estado; transicao invalida' and a.empresa_id = p_x", true],
    ['a leitura dentro do corpo dollar-quoted de uma função', "create function public.f() returns int language plpgsql as $f$ begin raise notice 'a; b'; return (select count(*) from public.itens i where i.empresa_id is null); end $f$", true],
    ['par legítimo: `empresa_id` só dentro de um texto', "select count(*) from public.ativos a where a.observacao = 'a.empresa_id; x'", false],
    // F64, 2ª rodada: a caixa não esconde (o Postgres dobra o identificador sem aspas)
    ['em MAIÚSCULAS', 'SELECT A.EMPRESA_ID FROM PUBLIC.ATIVOS A', true],
  ])('SABOTAGEM I (disco) — %s', (_nome, corpo, acusa) => {
    expect(leEmpresaIdDoAcervo(corpo).length > 0).toBe(acusa)
  })
})
