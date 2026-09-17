import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Recusa as RecusaCusto, validarDirFora as dirForaCusto } from './medir-custo.mjs'
import { Recusa as RecusaRel, validarDirFora as dirForaRel } from './medir-rel.mjs'
import { Recusa as RecusaEquivalencia, validarDirFora as dirForaEquivalencia } from './equivalencia-rel.mjs'

// OS INSTRUMENTOS DA F60 — `medir-rel.mjs` (o motor, A1–A4), `medir-custo.mjs` (o custo, B1–B8) e, desde o lote 2,
// `equivalencia-rel.mjs` (a equivalência velho × novo e o custo dos corpos novos, que o cabeçalho da 0143 cita). Sem banco.
//
// Os dois geraram as linhas de base "antes" de PRODUÇÃO (PLAN-F60 §3.2–§3.5), e o "depois" da fase tem de
// rodar o MESMO arquivo — ou declarar a diferença. A revisão do lote 1 (revisor 3, 16/09/2026) achou as
// duas metades dessa promessa soltas:
//
//  1. a GUARDA DE `--dir` (achado 2). Os comandos e as respostas do canal moram FORA do repositório — é o
//     que impede o SQL de medição e a saída de produção de entrarem na árvore do git. A versão de
//     `medir-rel.mjs` que entrou no lote liberava a própria raiz (`--dir=.`), e as duas liberavam uma pasta
//     interna chamada `..algo` (`startsWith('..')`). Aqui a régua fica presa para os dois.
//  2. a IDENTIDADE (achado 3). O plano pedia gravar o sha256 do original (medido) E o da versão versionada;
//     só o original foi gravado. O PLAN-F60 §0 agora traz os dois, e esta suíte reprova o instrumento que
//     mudar sem a tabela mudar junto — a diferença entre o que mediu o "antes" e o que vai medir o "depois"
//     nunca fica calada. O hash é o do texto com CRLF → LF (a régua do `migrations.lock.json`), então o
//     `core.autocrlf` da máquina não muda o resultado.
//
// Lê o disco na COLETA, nunca dentro do `it`.

const RAIZ = fileURLToPath(new URL('../..', import.meta.url))
const PLANO = readFileSync(join(RAIZ, 'docs', 'PLAN-F60.md'), 'utf8')

type Instrumento = { nome: string; sha: string; bytes: number }
const INSTRUMENTOS: Instrumento[] = ['medir-rel.mjs', 'medir-custo.mjs', 'equivalencia-rel.mjs'].map((nome) => {
  const texto = readFileSync(join(RAIZ, 'scripts', 'perf', nome), 'utf8').replace(/\r\n/g, '\n')
  return { nome, sha: createHash('sha256').update(texto, 'utf8').digest('hex'), bytes: Buffer.byteLength(texto, 'utf8') }
})

/** `46055` → `46.055`, como a tabela do plano escreve. */
const milhar = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

const GUARDAS = [
  ['medir-rel.mjs', dirForaRel, RecusaRel],
  ['medir-custo.mjs', dirForaCusto, RecusaCusto],
  ['equivalencia-rel.mjs', dirForaEquivalencia, RecusaEquivalencia],
] as const

describe('1. a guarda de `--dir` — fora do repositório, exatamente', () => {
  it.each(GUARDAS)('%s recusa a raiz, a pasta interna e a pasta interna que começa com `..`', (_nome, guarda, Recusa) => {
    for (const dir of [RAIZ, join(RAIZ, 'docs', 'perf'), join(RAIZ, '..rascunho'), join(RAIZ, '..rascunho', 'comandos')]) {
      expect(() => guarda(dir), dir).toThrow(Recusa)
      expect(() => guarda(dir), dir).toThrow(/dentro do repositório/)
    }
  })

  it.each(GUARDAS)('%s recusa `--dir` ausente', (_nome, guarda) => {
    expect(() => guarda(undefined)).toThrow(/obrigatório/)
    expect(() => guarda('')).toThrow(/obrigatório/)
  })

  it.each(GUARDAS)('%s aceita o pai do repositório e o que está abaixo dele', (_nome, guarda) => {
    for (const dir of [join(RAIZ, '..'), join(RAIZ, '..', 'fora-do-repo', 'comandos-f60')]) {
      expect(() => guarda(dir), dir).not.toThrow()
    }
  })
})

describe('2. a identidade — o sha256 (LF) de cada instrumento versionado está no PLAN-F60 §0', () => {
  it.each(INSTRUMENTOS)('$nome', ({ nome, sha, bytes }) => {
    const linha = PLANO.split('\n').find((l) => l.startsWith(`| \`scripts/perf/${nome}\``))
    expect(linha, `a linha da versão versionada de ${nome} na tabela do PLAN-F60 §0`).toBeDefined()
    expect(linha, 'sha256 (LF) — mudou o instrumento? regrave a linha e declare a diferença').toContain(`\`${sha}\``)
    expect(linha).toContain(`| ${milhar(bytes)} |`)
  })

  it('os originais que mediram o "antes" continuam na tabela (a outra metade do par)', () => {
    expect(PLANO).toContain('`4ab7f71a71eb8a89b1d78f4b546516eb53688a83f42088f8f74f8144145f8eb2`')
    expect(PLANO).toContain('`3c42d047b12408c0e14564fd7d998f66624a1a016341577383086c9a5eff7ea1`')
    // lote 2 — o original da equivalência, que rodou fora do repositório
    expect(PLANO).toContain('`59e11125af7214bef3ad0d2e24f554884ddb6278385eb3374161c28e43a75c9d`')
  })
})

// 3. O PASSO DEPOIS DO APPLY (revisão final da F60). O plano, o runbook e o rodapé da 0143 põem a equivalência com
// a FUNÇÃO de verdade como portão do merge, e o instrumento só sabia colar o corpo. Os modos `real` chamam a função
// aplicada pelo nome e recusam, antes de medir, a função ausente, o corpo aplicado diferente do versionado e a velha
// já derrubada. A emulação continua emitindo o mesmo SQL (sem `real`), o que a revisão conferiu por diff.
import {
  CUSTO,
  MODELO,
  args as lerArgumentos,
  blocoCusto,
  blocoEquivalencia,
  blocoKpis,
  lerCorposDoRepositorio,
  lerPayload,
  md5Normalizado,
  validarBloco,
} from './equivalencia-rel.mjs'

type Definicao = { parametros: { nome: string; tipo: string }[]; colunas: { nome: string; tipo: string }[]; corpo: string }
const CORPOS_REPO = lerCorposDoRepositorio(RAIZ) as Record<string, Definicao>
const MODELO_F60 = MODELO as Record<string, { velha: string | null; forma: string }>
const DATAS = ['2026-09-01', '2026-09-15']

describe('3. o modo real — a equivalência e o custo com a função APLICADA', () => {
  it.each(Object.keys(MODELO_F60))('%s: o bloco real chama a função pelo nome e confere o prosrc antes de medir', (nome) => {
    const def = CORPOS_REPO[nome]
    const sql = MODELO_F60[nome].forma === 'kpis' ? blocoKpis(def, 'producao', { real: true }) : blocoEquivalencia(nome, def, 'producao', DATAS, { real: true })
    expect(() => validarBloco(sql)).not.toThrow()
    expect(sql).toContain(`to_regprocedure('public.${nome}(${def.parametros.map((p) => p.tipo).join(', ')})')`)
    expect(sql).toContain(`if v_md5_vivo <> '${md5Normalizado(def.corpo)}' then`)
    expect(sql).toContain(String.raw`regexp_replace(pr.prosrc, '\s+', ' ', 'g')`)
    expect(sql).toContain(`from public.${nome}(%1$L::smallint[]`)
    expect(sql).toMatch(/raise exception 'F60_(EQUIVALENCIA|KPIS)_REAL %'/)
    // nenhum pedaço do corpo colado: o lado novo é só a função
    const trecho = def.corpo.trim().split('\n')[0].trim()
    expect(sql.includes(trecho), `o bloco real ainda cola o corpo ("${trecho}")`).toBe(false)
    if (MODELO_F60[nome].velha) expect(sql).toContain(`'F60_FUNCAO_VELHA_AUSENTE ${MODELO_F60[nome].velha}'`)
  })

  it('sem `real`, o bloco é a emulação de sempre (corpo colado, marca sem _REAL, sem guarda de prosrc)', () => {
    const def = CORPOS_REPO.rel_mov_por_mes_filiais
    const sql = blocoEquivalencia('rel_mov_por_mes_filiais', def, 'producao', DATAS)
    expect(sql).toContain("raise exception 'F60_EQUIVALENCIA %'")
    expect(sql).not.toContain('v_md5_vivo')
    expect(sql).toContain(def.corpo.trim().split('\n')[0].trim())
  })

  it.each(CUSTO.map((b) => [b.nome, b] as const))('custo real %s: os dois preparados e os quatro deallocate (caminho normal e de erro)', (_nome, b) => {
    const sql = blocoCusto(b, CORPOS_REPO[b.funcao], 'producao', '2026-09-17', { real: true })
    expect(() => validarBloco(sql)).not.toThrow()
    expect(sql).toContain(`as select * from public.${b.funcao}(`)
    expect(sql.match(/deallocate %I/g)?.length).toBe(4)
    expect(sql).toContain("raise exception 'F60_CUSTO_REAL %'")
    expect(sql).toContain("'amostras_chamada', v_amostras_chamada")
  })

  it('as recusas do modo real viram pendência nomeada, nunca número', () => {
    for (const r of ['F60_FUNCAO_NOVA_AUSENTE rel_resumo_filiais', 'F60_CORPO_VIVO_DIFERENTE rel_resumo_filiais', 'F60_FUNCAO_VELHA_AUSENTE rel_resumo']) {
      expect(lerPayload(JSON.stringify({ error: { message: `ERROR: P0001: ${r}` } }), 'F60_EQUIVALENCIA_REAL')).toEqual({ recusa: r })
    }
  })
})

describe('4. a linha de comando — a marca booleana não engole a opção seguinte', () => {
  it('`--real` antes de outra opção, no fim, e as formas com valor continuam iguais', () => {
    expect(lerArgumentos(['analisar-equivalencia', '--real', '--dir=x', '--saida', 'y'])).toEqual({ modo: 'analisar-equivalencia', real: true, dir: 'x', saida: 'y' })
    expect(lerArgumentos(['analisar-custo', '--dir=x', '--saida=y', '--real'])).toEqual({ modo: 'analisar-custo', dir: 'x', saida: 'y', real: true })
    expect(lerArgumentos(['gerar-custo', '--alvo', 'producao', '--hoje=2026-09-17'])).toEqual({ modo: 'gerar-custo', alvo: 'producao', hoje: '2026-09-17' })
  })
})
