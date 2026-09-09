import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { limpar } from '@/lib/use-server-exports'

// =============================================================================
// A TRAVA DE FORMATO DA F54 — o cabeçalho do backup não muda em silêncio.
// =============================================================================
// Um backup só serve se quem for restaurá-lo souber o que ele contém. Os três
// cabeçalhos deste sistema nasceram em momentos diferentes e com formatos diferentes
// (o do reset não tinha nem `versao` nem `contagens` até esta fase), e a maneira de
// isso se degradar é sempre a mesma: alguém acrescenta uma tabela ao backup, não mexe
// na `versao`, e meses depois um arquivo `versao: 1` tem duas formas incompatíveis —
// sem que nada tenha ficado vermelho no caminho.
//
// ⚠ COMO ELA TORNA O BUMP MECÂNICO, e não uma lembrança. A declaração abaixo não é uma
// lista de chaves: é um mapa `versão → conjunto de chaves`. A suíte lê do FONTE a
// `versao` que o código grava HOJE e o conjunto de chaves que ele monta HOJE, e exige
// que os dois casem na MESMA linha do mapa. Acrescentar uma tabela sem bumpar deixa o
// conjunto lido diferente do conjunto declarado para aquela versão → vermelho, com a
// mensagem dizendo o que fazer. Bumpar sem declarar a versão nova → vermelho também.
//
// ⚠ O QUE ELA NÃO PROVA. Ela lê o fonte, não o bucket. Backups JÁ gravados continuam
// com o formato que tinham — e é por isso que o restaurador trata `versao` ausente como
// 0 e diz por escrito que não conferiu as contagens, em vez de fingir que conferiu.
// =============================================================================

const RAIZ = process.cwd()

function fonteViva(rel: string): string {
  return limpar(readFileSync(join(RAIZ, rel), 'utf8'), false)
}

/**
 * As chaves de PRIMEIRO NÍVEL do objeto literal que começa no `{` indicado.
 *
 * Anda o texto contando chaves/colchetes/parênteses e só registra o que está em
 * profundidade 1 — senão `filial: { id, slug, nome }` contribuiria com `id`, `slug` e
 * `nome`, e o cabeçalho pareceria ter chaves que não tem.
 *
 * O espalhamento (`...acervo`) entra como `...acervo`: ele é uma chave do cabeçalho
 * cujo conteúdo mora em outro arquivo, e fingir que ele não existe esconderia
 * exatamente a metade do formato que muda com mais frequência. Quem responde pelo
 * conteúdo dele é o describe 2.
 */
function chavesDeTopo(fonte: string, inicioDoObjeto: number): string[] {
  const chaves: string[] = []
  let profundidade = 0
  let i = inicioDoObjeto
  let atual = ''
  /**
   * Já vi `:` neste item? Se vi, o que sobra até a vírgula é o VALOR, não uma chave.
   *
   * ⚠ Sem esta bandeira, `contagens: custoPreview,` registrava DUAS chaves — `contagens`
   * (certo, no `:`) e `custoPreview` (errado, na vírgula). Um conjunto inflado por nomes
   * de variável faria a trava exigir que a declaração repetisse os valores do código, e a
   * primeira renomeação de variável a deixaria vermelha sem que o FORMATO tivesse mudado —
   * o falso vermelho que faz alguém desligar o gate.
   */
  let vistoDoisPontos = false

  /**
   * Fecha um item do literal: pode ser um ESPALHAMENTO (`...acervo`) ou uma propriedade
   * ABREVIADA (`ativoIds,` — sem `: valor`).
   *
   * ⚠ A abreviada foi o furo medido na primeira execução desta suíte: o backup do
   * conflito escreve `ativoIds,` e `lados,` no estilo curto, e um leitor que só
   * registrasse identificador-seguido-de-`:` daria o conjunto INCOMPLETO — e, pior, daria
   * um conjunto que "casa" com uma declaração igualmente incompleta. Duas metades erradas
   * concordando é o modo de falha mais caro de uma trava de formato.
   */
  function flush(bruto: string): void {
    const t = bruto.trim()
    if (t.startsWith('...')) {
      chaves.push(t.replace(/\s+/g, ''))
      return
    }
    if (vistoDoisPontos) return
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) chaves.push(t)
  }

  for (; i < fonte.length; i++) {
    const c = fonte[i]
    if (c === '{' || c === '[' || c === '(') {
      profundidade++
      if (profundidade > 1) atual = ''
      continue
    }
    if (c === '}' || c === ']' || c === ')') {
      profundidade--
      // ⚠ O ÚLTIMO item pode não ter vírgula depois — e o espalhamento no fim do literal
      // (`{ …, ...acervo }`) é exatamente esse caso. Descartar `atual` aqui sem esvaziá-lo
      // no fechamento deixava `...acervo` invisível, e o describe 2 (que congela as tabelas
      // que ele traz) perderia o sentido: a trava não veria a chave que mais muda.
      if (profundidade === 0) {
        flush(atual)
        atual = ''
        break
      }
      atual = ''
      continue
    }
    if (profundidade !== 1) continue

    if (c === ':') {
      const nome = atual.trim().replace(/^['"]|['"]$/g, '')
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(nome)) chaves.push(nome)
      vistoDoisPontos = true
      atual = ''
      continue
    }
    if (c === ',') {
      flush(atual)
      vistoDoisPontos = false
      atual = ''
      continue
    }
    atual += c
  }

  return [...new Set(chaves)].sort()
}

/** A `versao` literal que o código grava naquele objeto. */
function versaoDeclarada(fonte: string, inicioDoObjeto: number): number | null {
  const trecho = fonte.slice(inicioDoObjeto, inicioDoObjeto + 400)
  const m = trecho.match(/versao:\s*(\d+)/)
  return m ? Number(m[1]) : null
}

type Cabecalho = {
  rotulo: string
  arquivo: string
  /** O texto que precede o `{` do objeto — a âncora de onde a leitura começa. */
  ancora: string
  /** versão → o conjunto EXATO de chaves de topo daquela versão. */
  formatos: Record<number, string[]>
}

const CABECALHOS: Cabecalho[] = [
  {
    rotulo: 'backup do IMPORT (aplicarImport)',
    arquivo: 'src/lib/actions/importar.ts',
    ancora: 'const backup = ',
    formatos: {
      // v1 — nasceu na F7; a F54 acrescentou `nao_incluido` SEM bumpar, e isso é
      // deliberado e está escrito: `nao_incluido` não acrescenta nem tira DADO do
      // arquivo, ele DESCREVE o que o arquivo já não trazia. Um leitor de v1 antigo
      // ignora a chave e restaura exatamente o mesmo conjunto de tabelas.
      1: ['contagens', 'exportadoEm', 'filial', 'nao_incluido', 'versao', '...acervo'],
    },
  },
  {
    rotulo: 'backup do CONFLITO entre filiais (acima do teto)',
    arquivo: 'src/lib/actions/conflitos.ts',
    ancora: 'JSON.stringify(',
    formatos: {
      1: [
        'ativoIds',
        'contagens',
        'exportadoEm',
        'lados',
        'motivo',
        'nao_incluido',
        'versao',
        '...acervo',
      ],
    },
  },
  // ⚠ OS DOIS DO RESET ENTRARAM DEPOIS, e o motivo é um furo que a revisão adversarial
  // mediu: a suíte declarava congelar "os três backups" e congelava UM (o do import) —
  // o do conflito estava aqui, mas os dois do reset só eram conferidos por um
  // `toContain('versao: 1')` no describe 3. Acrescentar tabela ao backup do reset sem
  // bumpar a `versao` ficava VERDE. Uma trava que cobre um terço do que declara cobrir
  // é pior que uma que declara o terço: ela promete o resto.
  {
    rotulo: 'backup do RESET, bloco ACERVO',
    arquivo: 'src/lib/queries/dev-destrutivo.ts',
    // A âncora é CÓDIGO, não comentário: `fonteViva` roda `limpar`, que apaga
    // comentário — um marcador em comentário some antes de a busca acontecer (medido).
    ancora: 'return {\n    versao: 1,\n    bloco,',
    formatos: {
      1: [
        'anotacoes',
        'ativos',
        'bloco',
        'contagens',
        'filial_id',
        'gerado_em',
        'movimentacoes',
        'nao_incluido',
        'pendencias_item',
        'ponteiros_perdidos',
        'termos_gerados',
        'versao',
      ],
    },
  },
  {
    rotulo: 'backup do RESET, bloco ITENS',
    arquivo: 'src/lib/queries/dev-destrutivo.ts',
    ancora: 'return {\n      versao: 1,\n      bloco,',
    formatos: {
      1: [
        'bloco',
        'contagens',
        'filial_id',
        'gerado_em',
        'lancamentos_item',
        'nao_incluido',
        'versao',
      ],
    },
  },
]

describe('1. os cabeçalhos de backup casam versão × conjunto de chaves', () => {
  it('há cabeçalhos declarados (guarda do próprio teste)', () => {
    expect(CABECALHOS.length).toBeGreaterThan(0)
  })

  it.each(CABECALHOS.map((c) => [c.rotulo, c] as const))('%s', (_r, c) => {
    const fonte = fonteViva(c.arquivo)
    const pos = fonte.indexOf(c.ancora)
    expect(pos, `${c.rotulo}: âncora \`${c.ancora}\` não encontrada em ${c.arquivo}`).toBeGreaterThan(-1)

    const abre = fonte.indexOf('{', pos)
    expect(abre).toBeGreaterThan(-1)

    const versao = versaoDeclarada(fonte, abre)
    expect(versao, `${c.rotulo}: não achei \`versao: N\` no cabeçalho`).not.toBeNull()

    const esperadas = c.formatos[versao as number]
    expect(
      esperadas,
      `${c.rotulo}: o código grava \`versao: ${versao}\`, e esta suíte não declara essa versão. Bumpou? Declare o conjunto de chaves da versão nova em \`formatos\`.`,
    ).toBeDefined()

    expect(
      chavesDeTopo(fonte, abre),
      `${c.rotulo}: as chaves de topo mudaram sem que a \`versao\` mudasse. Se acrescentou TABELA ao backup, bumpe a \`versao\` e declare o conjunto novo; se a chave só DESCREVE o arquivo (como \`nao_incluido\`), acrescente-a ao conjunto da versão atual, com o motivo escrito.`,
    ).toEqual([...esperadas].sort())
  })
})

describe('2. o que o espalhamento esconde — as TABELAS do backup do import', () => {
  // `...acervo` traz o retorno de `exportarAcervoFilial`. Uma tabela nova entraria por
  // ali sem tocar no cabeçalho, e o describe 1 não veria nada. Este congela o TIPO.
  it('`AcervoFilial` tem exatamente as quatro tabelas que a RPC do import apaga', () => {
    const fonte = fonteViva('src/lib/queries/import-logs.ts')
    const pos = fonte.indexOf('export type AcervoFilial = ')
    expect(pos, 'o tipo `AcervoFilial` sumiu ou foi renomeado').toBeGreaterThan(-1)
    const abre = fonte.indexOf('{', pos)

    expect(
      chavesDeTopo(fonte, abre),
      'o backup do import passou a levar outro conjunto de tabelas. Isso é mudança de FORMATO: bumpe a `versao` do cabeçalho e declare o conjunto novo em `backup-formato.test.ts`.',
    ).toEqual(['anotacoes', 'ativos', 'movimentacoes', 'termos_gerados'])
  })

  it('`acervoDosAtivos` tem exatamente as cinco tabelas que a RPC do conflito apaga', () => {
    // O segundo espalhamento, que ficara de fora: `...acervo` do backup do conflito vem
    // daqui, e uma tabela nova entraria por ele sem tocar o cabeçalho. Mesmo furo do de
    // cima, medido pela revisão adversarial.
    const fonte = fonteViva('src/lib/queries/conflitos.ts')
    const pos = fonte.indexOf('export async function acervoDosAtivos(')
    expect(pos, 'a função `acervoDosAtivos` sumiu ou foi renomeada').toBeGreaterThan(-1)
    // O `{` do tipo de RETORNO — o primeiro depois do `Promise<`.
    const abre = fonte.indexOf('{', fonte.indexOf('Promise<', pos))

    expect(
      chavesDeTopo(fonte, abre),
      'o backup do conflito passou a levar outro conjunto de tabelas. Bumpe a `versao` do cabeçalho e declare o conjunto novo.',
    ).toEqual(['anotacoes', 'ativos', 'movimentacoes', 'pendencias_item', 'termos_gerados'])
  })
})

describe('3. o `nao_incluido` existe nos três, e não é decorativo', () => {
  const ONDE = [
    ['src/lib/actions/importar.ts', 'backup do import'],
    ['src/lib/actions/conflitos.ts', 'backup do conflito'],
    ['src/lib/queries/dev-destrutivo.ts', 'backup do reset (acervo e itens)'],
  ] as const

  it.each(ONDE.map(([f, r]) => [r, f] as const))('`%s` declara `nao_incluido`', (_r, arquivo) => {
    expect(fonteViva(arquivo)).toContain('nao_incluido')
  })

  it('o backup do RESET ganhou `versao` e `contagens` (Decisão 4)', () => {
    // Ele não tinha nenhum dos dois. Sem `versao` a trava não teria o que congelar; sem
    // `contagens` a conferência de restauração não teria com o que comparar.
    const fonte = fonteViva('src/lib/queries/dev-destrutivo.ts')
    expect(fonte).toContain('versao: 1')
    expect(fonte).toContain('contagens:')
    // Os DOIS blocos — acervo e itens —, não só um.
    expect(fonte.match(/versao: 1/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})

describe('4. a trava não mente (guardas do próprio teste)', () => {
  it('o leitor de chaves ignora profundidade > 1', () => {
    const f = limpar(`const backup = { a: 1, filial: { id: 2, slug: 'x' }, b: 3 }`, false)
    expect(chavesDeTopo(f, f.indexOf('{'))).toEqual(['a', 'b', 'filial'])
  })

  it('o leitor de chaves ENXERGA o espalhamento E a propriedade ABREVIADA', () => {
    const f = limpar(`const backup = { a: 1, curta, ...acervo }`, false)
    expect(chavesDeTopo(f, f.indexOf('{'))).toEqual(['a', 'curta', '...acervo'].sort())
  })

  it('o leitor ignora chave citada em COMENTÁRIO', () => {
    const f = limpar(`const backup = {\n  // fantasma: 1,\n  a: 1,\n}`, false)
    expect(chavesDeTopo(f, f.indexOf('{'))).toEqual(['a'])
  })

  it('o VALOR não vira chave (`contagens: custoPreview` dá UMA chave, não duas)', () => {
    const f = limpar(`const backup = { contagens: custoPreview, a: 1 }`, false)
    expect(chavesDeTopo(f, f.indexOf('{'))).toEqual(['a', 'contagens'])
  })

  it('a versão é lida do fonte, não presumida', () => {
    const f = limpar(`const backup = { versao: 7, a: 1 }`, false)
    expect(versaoDeclarada(f, f.indexOf('{'))).toBe(7)
  })

  it('todo conjunto declarado é não-vazio e sem repetido', () => {
    for (const c of CABECALHOS) {
      for (const [v, chaves] of Object.entries(c.formatos)) {
        expect(chaves.length, `${c.rotulo} v${v} declarou conjunto vazio`).toBeGreaterThan(0)
        expect(new Set(chaves).size).toBe(chaves.length)
        expect(chaves).toContain('versao')
      }
    }
  })
})
