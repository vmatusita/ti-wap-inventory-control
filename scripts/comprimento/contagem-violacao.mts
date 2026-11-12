// =============================================================================
// contagem-violacao.mts — O PORTÃO de cada lote da F66B: quantas linhas passariam do teto, coluna a coluna
// =============================================================================
//   npx tsx scripts/comprimento/contagem-violacao.mts gerar --dir <FORA do repositório> [--sabotar]
//   npx tsx scripts/comprimento/contagem-violacao.mts analisar --resposta <arquivo> --alvo ensaio|producao [--saida <json>]
//
// POR QUE ELE EXISTE. A F66B põe um CHECK de comprimento em 65 colunas (0181–0184). `add constraint … check` VALIDA a
// tabela inteira: uma linha acima do teto derruba o apply — e, pior, um teto abaixo do dado vivo seria recusar amanhã o
// que se aceita hoje. A regra (docs/PLAN-F66B.md §7): IMEDIATAMENTE antes de CADA lote, nos dois bancos, este bloco
// conta, por coluna, `max(char_length)` e as linhas acima do teto da FONTE ÚNICA (src/lib/validators/tetos-coluna.ts).
// Tem de dar 0 em toda coluna. Se não der, o lote NÃO é aplicado, e o teto sobe (o dado nunca é cortado).
//
// O BLOCO (o molde de scripts/perf/conta-a-conta.mjs):
//  · `transaction_read_only = on` ANTES de tudo, e termina em `raise exception` — nunca se confirma;
//  · o BANCO diz quem ele é (`rotulo_de_ambiente()`: 'desenvolvimento' no ensaio, nulo em produção) e o payload o
//    devolve — o analisador recusa a resposta cujo rótulo não é o do alvo declarado;
//  · SQL ESTÁTICO gerado da fonte (nada de `execute format`): uma consulta por tabela, com os nomes e os tetos literais;
//  · sai SÓ NÚMERO: por tabela, as linhas; por coluna, o maior comprimento e quantas linhas passam do teto. Nenhum
//    valor, id, nome ou texto de linha;
//  · o texto é o MESMO nos dois bancos; a variante SABOTADA (`--sabotar`: o teto de `ativos.marca` vira 0, abaixo do
//    máximo vivo — a prova de que o bloco SABE achar violação) recusa fora do ensaio;
//  · o validador exige que o comando seja, byte a byte, o que este script gera.
// Pelo MCP, o erro volta inline e truncado: o invólucro do canal (`involucroDoCanal`, conta-a-conta.mjs) roda o bloco
// numa subtransação e devolve a mensagem por `select`; o enchimento `_canal` faz a resposta cair em arquivo, de onde
// ela é EXTRAÍDA (nunca transcrita) para `analisar`.
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { involucroDoCanal } from '../perf/conta-a-conta.mjs'
import { LOTES_COMPRIMENTO, TETOS_COLUNA, type TetoDeColuna } from '../../src/lib/validators/tetos-coluna'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

class Recusa extends Error {}
function recusar(motivo: string): never {
  throw new Recusa(`contagem-violacao: RECUSADO — ${motivo}`)
}

/** A coluna que a sabotagem rebaixa (teto 0: toda linha não nula com texto passa a "violar"). */
export const COLUNA_SABOTADA = { tabela: 'ativos', coluna: 'marca' } as const

/** O bloco. `sabotar` só troca o literal `false` e o teto da coluna sabotada. */
export function blocoDeContagem(sabotar = false): string {
  const partes: string[] = []
  for (const lote of LOTES_COMPRIMENTO) {
    for (const tabela of lote.tabelas) {
      const colunas = TETOS_COLUNA[tabela] as Record<string, TetoDeColuna>
      const pares = Object.entries(colunas).map(([c, t]) => {
        const teto = sabotar && tabela === COLUNA_SABOTADA.tabela && c === COLUNA_SABOTADA.coluna ? 0 : t.teto
        return `      '${c}', jsonb_build_array(coalesce(max(char_length(${c})), 0), count(*) filter (where char_length(${c}) > ${teto}))`
      })
      partes.push(
        `  -- ${tabela} (lote ${lote.migration.slice(0, 4)})\n` +
          `  select jsonb_build_object(\n      'linhas', count(*),\n${pares.join(',\n')})\n    into v_t from public.${tabela};\n` +
          `  v_p := v_p || jsonb_build_object('${tabela}', v_t);`,
      )
    }
  }
  return `do $f66b$
declare
  v_sabotar constant boolean := ${sabotar ? 'true' : 'false'};
  v_rotulo  text;
  v_t       jsonb;
  v_p       jsonb := '{}';
-- 0. nada nesta transação grava; e ela nunca se confirma (termina em raise exception)
begin
  perform set_config('transaction_read_only', 'on', true);

  -- o BANCO diz quem ele é; a sabotagem só roda no ensaio
  v_rotulo := public.rotulo_de_ambiente();
  if v_sabotar and v_rotulo is distinct from 'desenvolvimento' then
    raise exception 'F66B_SABOTAGEM_FORA_DO_ENSAIO rotulo=%', coalesce(v_rotulo, '(null)');
  end if;

  -- 1. por tabela, as linhas; por coluna, [o maior char_length, quantas linhas passam do teto da fonte]
${partes.join('\n\n')}

  raise exception 'F66B_CONTA %', jsonb_build_object(
    'rotulo', coalesce(v_rotulo, '(null)'), 'sabotado', v_sabotar, 'tabelas', v_p,
    '_canal', repeat('.', 120000));
end $f66b$;`
}

/** Recusa o comando que não seja, byte a byte, um dos dois que este script gera. */
export function validarBloco(sql: string): string {
  if (typeof sql !== 'string' || !sql.trim()) recusar('comando vazio.')
  const t = sql.trim()
  if (t !== blocoDeContagem(false).trim() && t !== blocoDeContagem(true).trim()) {
    recusar('o comando não é, byte a byte, um bloco que este script gera.')
  }
  if (!/begin\s+perform set_config\('transaction_read_only', 'on', true\);/.test(t)) recusar('sem transaction_read_only.')
  if (!/raise exception 'F66B_CONTA %'/.test(t)) recusar('o bloco não termina em raise exception.')
  if (/\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|execute)\b/i.test(t.replace(/'[^']*'/g, "''"))) {
    recusar('palavra de escrita no bloco.')
  }
  return sql
}

export type Payload = {
  rotulo: string
  sabotado: boolean
  tabelas: Record<string, { linhas: number } & Record<string, number | [number, number]>>
}

/** O payload `F66B_CONTA {…}` dentro da resposta gravada do canal (as camadas do MCP, como em conta-a-conta.mjs). */
export function lerPayload(texto: string): Payload | { recusa: string } {
  let msg = texto
  for (let k = 0; k < 4; k++) {
    try {
      const j = JSON.parse(msg)
      if (Array.isArray(j)) msg = j.map((x) => x?.text ?? x?.resposta ?? '').join('')
      else if (typeof j?.error?.message === 'string') msg = j.error.message
      else if (typeof j?.result === 'string') msg = j.result
      else if (typeof j?.resposta === 'string') msg = j.resposta
      else if (typeof j?.message === 'string') msg = j.message
      else break
    } catch {
      break
    }
  }
  const r = /F66B_SABOTAGEM_FORA_DO_ENSAIO[^\n"]*/.exec(msg)
  if (r) return { recusa: r[0] }
  const i = msg.indexOf('F66B_CONTA {')
  if (i === -1) recusar('resposta sem F66B_CONTA — o bloco não chegou ao fim.')
  const inicio = i + 'F66B_CONTA '.length
  let prof = 0
  for (let k = inicio; k < msg.length; k++) {
    if (msg[k] === '{') prof++
    else if (msg[k] === '}') {
      prof--
      if (prof === 0) {
        const p = JSON.parse(msg.slice(inicio, k + 1).replace(/\\"/g, '"'))
        delete p._canal
        return p as Payload
      }
    }
  }
  recusar('F66B_CONTA truncado na resposta.')
}

export type Veredito = {
  colunas: number
  linhas_conferidas: number
  violacoes: number
  por_coluna: { coluna: string; teto: number; maximo: number; acima: number }[]
  faltando: string[]
}

/** O veredito: a soma das linhas acima do teto, em toda coluna da fonte; coluna da fonte ausente do payload reprova. */
export function veredito(p: Payload, sabotado = false): Veredito {
  const por_coluna: Veredito['por_coluna'] = []
  const faltando: string[] = []
  let linhas = 0
  for (const lote of LOTES_COMPRIMENTO) {
    for (const tabela of lote.tabelas) {
      const t = p.tabelas?.[tabela]
      const colunas = TETOS_COLUNA[tabela] as Record<string, TetoDeColuna>
      if (!t) {
        faltando.push(...Object.keys(colunas).map((c) => `${tabela}.${c}`))
        continue
      }
      linhas += Number(t.linhas)
      for (const [c, def] of Object.entries(colunas)) {
        const v = t[c]
        if (!Array.isArray(v)) {
          faltando.push(`${tabela}.${c}`)
          continue
        }
        const teto = sabotado && tabela === COLUNA_SABOTADA.tabela && c === COLUNA_SABOTADA.coluna ? 0 : def.teto
        por_coluna.push({ coluna: `${tabela}.${c}`, teto, maximo: Number(v[0]), acima: Number(v[1]) })
      }
    }
  }
  return {
    colunas: por_coluna.length,
    linhas_conferidas: linhas,
    violacoes: por_coluna.reduce((s, c) => s + c.acima, 0),
    por_coluna,
    faltando,
  }
}

function validarDirFora(dir: string | undefined): string {
  if (!dir) recusar('--dir é obrigatório (fora do repositório).')
  const abs = resolve(dir)
  const rel = relative(RAIZ, abs)
  if (!rel.startsWith('..') && !isAbsolute(rel)) recusar('--dir dentro do repositório — comandos e respostas moram FORA dele.')
  return abs
}

function args(argv: string[]) {
  const [modo, ...resto] = argv
  const o: Record<string, string | boolean> = { modo }
  for (let i = 0; i < resto.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(resto[i])
    if (!m) recusar(`argumento não reconhecido: ${resto[i]}`)
    if (m[1] === 'sabotar') {
      o.sabotar = true
      continue
    }
    o[m[1]] = m[2] ?? resto[++i]
  }
  return o
}

async function main() {
  const o = args(process.argv.slice(2))
  if (o.modo === 'gerar') {
    const dir = validarDirFora(o.dir as string)
    const sabotar = o.sabotar === true
    const nome = sabotar ? 'contagem-violacao-sabotada' : 'contagem-violacao'
    const sql = validarBloco(blocoDeContagem(sabotar))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${nome}.sql`), sql + '\n')
    writeFileSync(join(dir, `${nome}.canal.sql`), involucroDoCanal(sql, validarBloco) + '\n')
    console.log(JSON.stringify({ sabotar, gravado: [`${nome}.sql`, `${nome}.canal.sql`], colunas: 65 }, null, 2))
    return
  }
  if (o.modo === 'analisar') {
    const arq = o.resposta as string
    if (!arq || !existsSync(arq)) recusar('--resposta <arquivo> é obrigatório e tem de existir.')
    const alvo = o.alvo as string
    if (alvo !== 'ensaio' && alvo !== 'producao') recusar('--alvo ensaio|producao.')
    const p = lerPayload(readFileSync(arq, 'utf8'))
    if ('recusa' in p) {
      console.log(JSON.stringify({ alvo, recusa: p.recusa }, null, 2))
      process.exitCode = 1
      return
    }
    const esperado = alvo === 'ensaio' ? 'desenvolvimento' : '(null)'
    if (p.rotulo !== esperado) recusar(`o banco se diz "${p.rotulo}", e o alvo declarado é ${alvo} (esperado "${esperado}").`)
    const v = veredito(p, p.sabotado)
    const saida = { alvo, rotulo: p.rotulo, sabotado: p.sabotado, ...v, zero: v.violacoes === 0 && v.faltando.length === 0 }
    if (o.saida) writeFileSync(resolve(RAIZ, o.saida as string), JSON.stringify(saida, null, 2) + '\n')
    console.log(
      `[contagem-violacao] alvo ${alvo} · rótulo ${p.rotulo} · ${v.colunas} colunas · ${v.linhas_conferidas} linhas · ` +
        `${v.violacoes} acima do teto · ${v.faltando.length} faltando${p.sabotado ? ' · SABOTADO' : ''}`,
    )
    for (const c of v.por_coluna.filter((x) => x.acima > 0)) console.log(`  ✗ ${c.coluna}: ${c.acima} acima do teto ${c.teto} (máx ${c.maximo})`)
    if (!saida.zero && !p.sabotado) process.exitCode = 1
    return
  }
  recusar('modo: gerar | analisar.')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Recusa ? err.message : `contagem-violacao: ERRO — ${err.message}`)
    process.exit(1)
  })
}
