import { describe, expect, it } from 'vitest'
import { corpoVigente } from '../../../scripts/db/corpo-vigente.mjs'
import {
  ARGUMENTOS_ANULAVEIS,
  COLUNAS_DE_RETORNO_ANULAVEIS,
  ESCALARES_ANULAVEIS,
  type EntradaDeMapa,
} from '@/lib/supabase/rpc'

// OS MAPAS DA PORTA, CONFERIDOS CONTRA O SQL VIVO (F58 · Frente B · Decisão 2).
//
// `rpc.ts` corrige o tipo gerado em três mapas nominais — argumento que aceita NULL, coluna de
// retorno que sai NULL, escalar que sai NULL. Um mapa assim é uma afirmação sobre o BANCO, e
// afirmação sobre o banco que ninguém confere apodrece: a próxima migration reescreve a função, o
// `p_filial is null or` vira `p_filiais` (F60) e a entrada continua lá, autorizando um `null` que a
// função não aceita mais. Este teste lê o CORPO VIVO de cada função (o último `create or replace`
// nas migrations, via `scripts/db/corpo-vigente.mjs` — nunca um `grep`, que acharia o texto num
// corpo histórico já apagado) e reprova a entrada sem respaldo.
//
// A REGRA DE CADA MAPA
//  · ARGUMENTO: a função não é `strict` (senão NULL em qualquer argumento devolve NULL sem rodar o
//    corpo); o parâmetro está na assinatura; a EVIDÊNCIA existe no corpo; ela tem FORMA DE DOMÍNIO
//    (`p is null or …`, `… or p is null`, `coalesce(p, …)`); e ao menos uma ocorrência dela está num
//    comando SEM `raise` — `if p is null or … then raise` é RECUSA, não aceitação (é exatamente o
//    `p_contagens` de `resetar_acervo`, o caso da sabotagem B).
//  · COLUNA DE RETORNO: a coluna está no `returns table (…)` vivo, e a evidência existe no corpo.
//  · ESCALAR: o retorno vivo não é tabela nem `setof`, e a evidência existe no corpo.
//
// Comparação por texto normalizado — sem comentário, sem caixa, espaço colapsado —, porque o SQL da
// casa escreve em maiúscula e minúscula e quebra linha onde quer. Disco lido na COLETA.

const normal = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
const semComentario = (sql: string) => sql.replace(/--[^\n]*/g, '')

type Funcao = { arquivo: string; cabecalho: string; corpo: string; retorno: string }

function lerFuncao(nome: string): Funcao {
  const { sql, arquivo } = corpoVigente(`public.${nome}`)
  const corpo = normal(semComentario(sql))
  const inicioDoCorpo = corpo.search(/\bas \$[a-z_]*\$/)
  const cabecalho = inicioDoCorpo === -1 ? corpo : corpo.slice(0, inicioDoCorpo)
  const retorno = /\breturns (.*?) (?:language|security|stable|immutable|volatile|strict|set|as)\b/.exec(cabecalho)?.[1] ?? ''
  return { arquivo, cabecalho, corpo, retorno }
}

/** Os comandos (entre `;`) do corpo que contêm o trecho. */
export function comandosCom(corpo: string, trecho: string): string[] {
  const achados: string[] = []
  for (let de = 0; ; ) {
    const i = corpo.indexOf(trecho, de)
    if (i === -1) return achados
    const inicio = corpo.lastIndexOf(';', i) + 1
    const fim = corpo.indexOf(';', i + trecho.length)
    achados.push(corpo.slice(inicio, fim === -1 ? corpo.length : fim))
    de = i + trecho.length
  }
}

/** A evidência trata o NULL do parâmetro como VALOR DE DOMÍNIO num comando que não recusa. */
export function nullDeDominio(corpo: string, parametro: string, evidencia: string): { ok: boolean; motivo: string } {
  const trecho = normal(evidencia)
  const p = parametro.toLowerCase()
  if (!corpo.includes(trecho)) return { ok: false, motivo: 'a evidência não existe no corpo vivo' }
  const forma = new RegExp(String.raw`\b${p} is null or\b|\bor ${p} is null\b|coalesce\( ?${p} ?,`)
  if (!forma.test(trecho)) {
    return { ok: false, motivo: `a evidência não tem forma de domínio (\`${p} is null or\`, \`or ${p} is null\`, \`coalesce(${p}, …)\`)` }
  }
  const semRecusa = comandosCom(corpo, trecho).some((cmd) => !/\braise\b/.test(cmd))
  return semRecusa
    ? { ok: true, motivo: '' }
    : { ok: false, motivo: 'toda ocorrência da evidência está num comando com `raise` — é recusa, não domínio' }
}

// --- coleta ------------------------------------------------------------------------------
const FUNCOES = new Map<string, Funcao>()
for (const nome of new Set([
  ...Object.keys(ARGUMENTOS_ANULAVEIS),
  ...Object.keys(COLUNAS_DE_RETORNO_ANULAVEIS),
  ...Object.keys(ESCALARES_ANULAVEIS),
])) {
  FUNCOES.set(nome, lerFuncao(nome))
}

const ARGUMENTOS = Object.entries(ARGUMENTOS_ANULAVEIS).flatMap(([fn, params]) =>
  Object.entries(params as Record<string, EntradaDeMapa>).map(([param, e]) => [fn, param, e] as const),
)
const COLUNAS = Object.entries(COLUNAS_DE_RETORNO_ANULAVEIS).flatMap(([fn, cols]) =>
  Object.entries(cols as Record<string, EntradaDeMapa>).map(([col, e]) => [fn, col, e] as const),
)
const ESCALARES = Object.entries(ESCALARES_ANULAVEIS as Record<string, EntradaDeMapa>)

describe('a lógica de "null de domínio" (casos sintéticos — guarda do próprio teste)', () => {
  it.each([
    ['filtro de consolidado', 'select 1 from t where p_x is null or t.f = p_x;', 'p_x is null or', true],
    ['coalesce', "insert into e values (coalesce(p_x, ''));", 'coalesce(p_x,', true],
    ['recusa com raise (o p_contagens do reset)', "if p_x is null or jsonb_typeof(p_x) <> 'object' then raise exception 'x'; end if;", 'p_x is null or', false],
    ['guarda que fecha sem raise não é domínio', 'if p_x is null then return false; end if;', 'p_x is null then return false', false],
    ['is not null não é domínio', 'where p_x is not null and a = p_x;', 'p_x is not null and', false],
    ['evidência ausente', 'select 1;', 'p_x is null or', false],
  ])('%s', (_nome, corpo, evidencia, esperado) => {
    expect(nullDeDominio(normal(corpo), 'p_x', evidencia).ok).toBe(esperado)
  })

  it('os três mapas não estão vazios', () => {
    expect(ARGUMENTOS.length).toBeGreaterThanOrEqual(11)
    expect(COLUNAS.length).toBeGreaterThanOrEqual(6)
    expect(ESCALARES.length).toBeGreaterThanOrEqual(3)
  })
})

describe('ARGUMENTOS_ANULAVEIS — cada entrada tem respaldo no corpo vivo', () => {
  it.each(ARGUMENTOS)('%s.%s', (fn, param, entrada) => {
    const f = FUNCOES.get(fn)!
    expect(f.cabecalho, `${fn} (${f.arquivo}) é strict: NULL em qualquer argumento devolve NULL sem rodar o corpo`).not.toMatch(
      /\bstrict\b|returns null on null input/,
    )
    expect(f.cabecalho, `${fn}: o parâmetro ${param} não está na assinatura viva (${f.arquivo})`).toMatch(
      new RegExp(String.raw`[(,] ?${param} `),
    )
    const r = nullDeDominio(f.corpo, param, entrada.evidencia)
    expect(r.ok, `${fn}.${param} (${f.arquivo}): ${r.motivo}`).toBe(true)
    expect(entrada.motivo.length, `${fn}.${param}: motivo curto demais`).toBeGreaterThan(20)
  })
})

describe('COLUNAS_DE_RETORNO_ANULAVEIS — cada coluna existe no retorno vivo e tem evidência', () => {
  it.each(COLUNAS)('%s.%s', (fn, coluna, entrada) => {
    const f = FUNCOES.get(fn)!
    expect(f.retorno, `${fn} não devolve tabela (${f.arquivo})`).toMatch(/^table ?\(/)
    expect(f.retorno, `${fn}: a coluna ${coluna} não está no returns table vivo (${f.arquivo})`).toMatch(
      new RegExp(String.raw`[(,] ?${coluna} `),
    )
    expect(f.corpo.includes(normal(entrada.evidencia)), `${fn}.${coluna}: a evidência não existe no corpo vivo`).toBe(true)
  })
})

describe('ESCALARES_ANULAVEIS — cada função devolve escalar e tem evidência', () => {
  it.each(ESCALARES)('%s', (fn, entrada) => {
    const f = FUNCOES.get(fn)!
    expect(f.retorno, `${fn} devolve tabela, não escalar (${f.arquivo})`).not.toMatch(/^(table|setof)\b/)
    expect(f.corpo.includes(normal(entrada.evidencia)), `${fn}: a evidência não existe no corpo vivo`).toBe(true)
  })
})
