import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// REL-01 (F30) — a rede de regressão da IMPRESSÃO do relatório.
//
// O impresso é o substituto do e-mail arquivável, e A4 retrato mede ~718px de
// viewport: `sm:` casa, `md:`/`lg:`/`xl:` não. Antes desta fase, toda coluna
// `hidden <bp>:table-cell` simplesmente não saía no papel — o relatório impresso
// ia sem colaborador, sem termo e sem observação, e ninguém percebia porque
// nenhum teste do repositório olhava para `print:`.
//
// Este arquivo lê o CÓDIGO-FONTE (não renderiza: o Vitest daqui roda em `node`,
// sem jsdom) e cobra o contrato coluna a coluna. É deliberadamente estrutural:
// o que ele protege é uma decisão de CSS que nenhum teste de comportamento
// alcança, e cuja regressão é silenciosa — o defeito só aparece no papel.

const DIR = 'src/components/relatorios'

// As seis tabelas do relatório que escondem coluna por largura. Lista explícita
// (e não "tudo que casar") para que uma tabela NOVA precise entrar aqui de
// propósito — o teste de varredura mais abaixo é quem avisa que faltou.
const TABELAS = [
  'tabela-saidas.tsx',
  'tabela-entradas.tsx',
  'tabela-transferencias.tsx',
  'tabela-mov-itens.tsx',
  'tabela-movimentacoes.tsx',
  'tabela-itens-grupo.tsx',
] as const

function fonte(arquivo: string): string {
  return readFileSync(join(DIR, arquivo), 'utf8')
}

// Comentário citando uma classe não é a classe. Sem isto, `celulas.tsx` (que
// DOCUMENTA `hidden md:table-cell` numa frase) apareceria como cobertura
// faltando, e a varredura viraria ruído até alguém desligá-la.
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

// Os literais de string do arquivo — é aí que moram as classes. Trabalhar por
// STRING (e não por linha) mantém o teste honesto se alguém quebrar um
// `className` longo em várias linhas.
function literais(src: string): string[] {
  const out: string[] = []
  for (const m of semComentarios(src).matchAll(/(['"`])([\s\S]*?)\1/g)) out.push(m[2])
  return out
}

const COLUNA_ESCONDIDA = /\b(sm|md|lg|xl):table-cell\b/

describe('REL-01 — as colunas escondidas por largura saem na impressão', () => {
  it.each(TABELAS)('%s: toda coluna escondida tem contraparte de print', (arquivo) => {
    const classes = literais(fonte(arquivo)).filter((s) => COLUNA_ESCONDIDA.test(s))
    // Guarda contra o teste virar vacuamente verde se alguém reescrever a tabela.
    expect(classes.length).toBeGreaterThan(0)
    for (const c of classes) {
      expect(c, `classe sem print:table-cell em ${arquivo}: "${c}"`).toContain(
        'print:table-cell',
      )
      // A coluna só é "escondida" porque tem `hidden`; sem ele o par não faz
      // sentido e o `print:table-cell` estaria sobrando.
      expect(c, `classe com breakpoint mas sem hidden em ${arquivo}: "${c}"`).toMatch(
        /\bhidden\b/,
      )
    }
  })

  it.each(TABELAS)('%s: a <Table> carrega a compactação de impressão', (arquivo) => {
    expect(fonte(arquivo)).toContain('<Table className="rel-print-compacta"')
  })

  // Varredura: uma tabela NOVA em src/components/relatorios que esconda coluna
  // por largura e esqueça o print entra aqui sozinha.
  it('nenhum outro componente de relatório esconde coluna sem print', () => {
    const outros = readdirSync(DIR)
      .filter((f) => f.endsWith('.tsx') && !TABELAS.includes(f as (typeof TABELAS)[number]))
    const faltando: string[] = []
    for (const f of outros) {
      for (const c of literais(fonte(f))) {
        if (COLUNA_ESCONDIDA.test(c) && !c.includes('print:table-cell')) {
          faltando.push(`${f}: "${c}"`)
        }
      }
    }
    expect(faltando).toEqual([])
  })
})

// `tabela-movimentacoes.tsx` é a grade v1 (só reabre snapshot anterior à F3B):
// nunca teve chevron nem LinhaDetalhe — no mobile as colunas escondidas dela são
// simplesmente inalcançáveis. Justamente por isso ela GANHA mais com o print das
// colunas, e é a única das seis sem coluna de chevron para conferir.
const TABELAS_COM_CHEVRON = TABELAS.filter((t) => t !== 'tabela-movimentacoes.tsx')

describe('REL-01 — o que NÃO pode ir para o papel continua fora', () => {
  it.each(TABELAS_COM_CHEVRON)('%s: a coluna do chevron continua print:hidden', (arquivo) => {
    const src = semComentarios(fonte(arquivo))
    // `w-10 p-0 …:hidden print:hidden` no <TableHead> e no <TableCell>.
    const chevron = [...src.matchAll(/className="([^"]*w-10 p-0[^"]*)"/g)].map((m) => m[1])
    expect(chevron.length).toBeGreaterThan(0)
    for (const c of chevron) expect(c).toContain('print:hidden')
  })

  it('a LinhaDetalhe e o BotaoExpandir continuam print:hidden', () => {
    // Os pares rótulo:valor do mobile duplicariam no papel o que as colunas
    // agora imprimem — a escolha da F30 foi COLUNAS, não LinhaDetalhe.
    const src = fonte('linha-expansivel.tsx')
    expect(src).toContain("cn('hover:bg-transparent print:hidden', className)")
    expect(src).toContain('print:hidden')
  })

  it('a observação continua saindo completa no papel (REL-13a, F27)', () => {
    expect(fonte('obs-tooltip.tsx')).toContain(
      'truncate print:overflow-visible print:whitespace-normal print:break-words',
    )
  })
})

describe('REL-01 — a compactação vive escopada no @media print', () => {
  const css = readFileSync('src/app/globals.css', 'utf8')
  const bloco = css.slice(css.indexOf('@media print'))

  it('as regras de compactação estão dentro do @media print', () => {
    expect(bloco).toContain('.rel-print-compacta')
    expect(bloco).toContain('white-space: normal')
    expect(bloco).toContain("[data-slot='table-container']")
    expect(bloco).toContain('display: table-header-group')
  })

  it('nenhuma regra global reabre .hidden (vazaria para o app inteiro)', () => {
    expect(bloco).not.toMatch(/^\s*\.hidden\s*\{/m)
  })
})
