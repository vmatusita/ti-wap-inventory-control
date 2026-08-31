import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { semComentarios } from '@/lib/layout/texto-fonte'

// GUARDA DE SINCRONIA TELA ↔ CSV (F28, depois de o defeito nascer PELA SEGUNDA VEZ).
//
// O contrato da casa (F12 · W6A) é que o export CSV leva para o Excel EXATAMENTE o
// que está na tela. Ele é frágil por construção: o filtro é lido em DOIS lugares
// independentes — a `page.tsx`, que monta os params da leitura da tela, e os
// parsers de `actions/exportar.ts`, que remontam os mesmos params a partir da
// querystring que o botão de export manda junto. A função de QUERY é a mesma nos
// dois caminhos; o que diverge é quem a alimenta.
//
// Já aconteceu duas vezes:
//   · F12-W4-03 — a faixa sã de datas nunca chegava ao export, e o teto de página
//     nunca chegava a /itens e /pendencias.
//   · F28 — o chip "Com pendência" (ATV-02) e a busca do histórico (ITN-03b)
//     nasceram na tela e não no `exportar.ts`. O tipo compilava (os campos são
//     opcionais), o lint passava, os 2.022 testes passavam: o CSV simplesmente
//     saía maior que a tela. Quem pegou foi a revisão adversarial.
//
// Por que uma guarda de FONTE e não um teste de unidade: `actions/exportar.ts` é
// um módulo `'use server'`, e módulo `'use server'` só pode exportar `async
// function` (armadilha F13). Os parsers não podem ser exportados para serem
// testados diretamente — então o que se pode travar é que o NOME do param apareça
// no lugar certo.
//
// ⚠ A PRIMEIRA versão desta guarda procurava o param no ARQUIVO INTEIRO, e a
// segunda volta da revisão adversarial mostrou que isso a tornava falso-verde:
// `'tipo'`, `'q'` e `'filial'` são lidos por MAIS DE UM parser, então apagar a
// leitura de `tipo` dentro de `filtrosHistorico` deixava o teste passando porque
// a string sobrevivia em `filtrosPendencias`. Agora a busca é feita na FATIA de
// cada função — que é a granularidade em que o defeito nasce.
//
// O QUE ESTA GUARDA PEGA E O QUE NÃO PEGA (medido, não suposto):
//   ✅ o param nunca é lido naquele parser — o modo REAL como o defeito nasceu nas
//      duas vezes (F12-W4-03 e F28). Verificado apagando a leitura de `tipo` de
//      `filtrosHistorico`: o teste falha, mesmo com `'tipo'` vivo em
//      `filtrosPendencias` (que é o falso-verde da 1ª versão desta guarda).
//   ⚠ o param é lido mas o resultado não entra no objeto (`const tipoRaw = …` fica
//      órfão): a guarda passa. Quem acusa aí é o ESLint — `no-unused-vars`, como
//      AVISO, não erro; então esse caminho depende de alguém ler o aviso.
//   ❌ o param é lido e usado, mas com semântica diferente da tela (outro default,
//      outra validação). Nenhuma guarda de fonte pega isso.
// Ou seja: é uma rede contra o ESQUECIMENTO, não contra a divergência semântica.

const RAIZ = process.cwd()

function fonte(...partes: string[]): string {
  return readFileSync(join(RAIZ, ...partes), 'utf8')
}

const EXPORTAR = fonte('src', 'lib', 'actions', 'exportar.ts')

/**
 * O corpo de uma função de `exportar.ts`, do cabeçalho até a próxima declaração
 * de topo. É o recorte em que o param TEM de aparecer — achar a string em outra
 * função do mesmo arquivo não prova nada sobre esta.
 */
function corpoDe(nome: string): string {
  const inicio = EXPORTAR.search(
    new RegExp(`^(?:export )?(?:async )?function ${nome}\\b`, 'm'),
  )
  if (inicio < 0) {
    throw new Error(
      `função "${nome}" não existe em actions/exportar.ts — se foi renomeada, ` +
        `atualize esta guarda junto (senão ela para de cobrir o que devia)`,
    )
  }
  const resto = EXPORTAR.slice(inicio)
  // A próxima declaração de topo (`function`, `const`, `export …`) na coluna 0.
  const fim = resto.slice(1).search(/^(?:export |const |function |async function )/m)
  return fim < 0 ? resto : resto.slice(0, fim + 1)
}

/** Filtros que a tela e o CSV compartilham, por tela. */
const COMPARTILHADOS: {
  tela: string
  pagina: string[]
  /** O parser de `exportar.ts` que remonta os filtros DESTA tela. */
  parser: string
  params: string[]
}[] = [
  {
    tela: '/ativos',
    pagina: ['src', 'app', '(app)', 'ativos', 'page.tsx'],
    parser: 'filtrosAtivos',
    // `page`/`pp`/`ord` ficam DE FORA de propósito: paginação e ordenação não
    // valem no export (o CSV leva o recorte inteiro, até o teto).
    params: ['q', 'filial', 'categoria', 'status', 'semPatrimonio', 'comPendencia'],
  },
  {
    tela: '/pendencias',
    pagina: ['src', 'app', '(app)', 'pendencias', 'page.tsx'],
    parser: 'filtrosPendencias',
    params: ['filial', 'tipo', 'q'],
  },
  {
    // F42 — o histórico saiu de dentro de `/itens` e ganhou ROTA PRÓPRIA. O
    // caminho da página mudou; a lista de params é a MESMA, porque nenhum filtro
    // se perdeu na separação — é exatamente isso que esta linha agora prova.
    tela: '/itens/historico',
    pagina: ['src', 'app', '(app)', 'itens', 'historico', 'page.tsx'],
    parser: 'filtrosHistorico',
    params: ['item', 'tipo', 'de', 'ate', 'busca'],
  },
  {
    tela: '/itens (saldos)',
    pagina: ['src', 'app', '(app)', 'itens', 'page.tsx'],
    // Os saldos não têm parser próprio: o recorte é montado dentro da action.
    parser: 'exportarItensSaldosCSV',
    params: ['grupo', 'q'],
  },
]

// O `filial` das duas telas de item passa por `filiaisDeItens`, o parser comum —
// a fatia certa para ele.
//
// ⚠ F42 — `visao` SAIU desta lista porque o param deixou de existir. Ele estava
// aqui por um motivo real: enquanto a visão "por filial" escondia o select e o
// Server Component neutralizava `?filial` no parse, o export tinha de neutralizar
// junto, ou baixava uma filial que a tela não estava mostrando (achado F12-W4-03).
// Sem visão, não há mais o que neutralizar: o filtro de filial é sempre visível e
// sempre vale, nas duas rotas. Tirar o param daqui é registrar que a REGRA mudou —
// não afrouxar a guarda (ata em `docs/DECISOES.md`, 31/08/2026).
const PARSER_FILIAL_ITENS = 'filiaisDeItens'

describe('tela × CSV — todo filtro compartilhado é lido nos DOIS lados', () => {
  for (const { tela, pagina, parser, params } of COMPARTILHADOS) {
    describe(tela, () => {
      const src = fonte(...pagina)
      const corpo = corpoDe(parser)

      for (const param of params) {
        it(`o param "${param}" é lido pela tela E por ${parser}()`, () => {
          expect(
            src.includes(param),
            `${tela}: a página não menciona "${param}" — atualize esta lista se o filtro deixou de existir`,
          ).toBe(true)
          expect(
            corpo.includes(`'${param}'`),
            `${parser}() não lê "${param}": o filtro vale na tela e NÃO no CSV — ` +
              `o arquivo baixado sai diferente do que o operador está vendo (F12 · W6A)`,
          ).toBe(true)
        })
      }
    })
  }

  it('o recorte de filial das DUAS telas de item passa pelo parser comum', () => {
    const corpo = corpoDe(PARSER_FILIAL_ITENS)
    for (const param of ['filial']) {
      expect(
        corpo.includes(`'${param}'`),
        `${PARSER_FILIAL_ITENS}() não lê "${param}" — o recorte de filial das telas de item divergiria entre tela e CSV`,
      ).toBe(true)
    }
  })

  it('o toggle `?visao=` nao voltou — ele trocava as COLUNAS, e foi o que a F42 matou', () => {
    // Guarda de REGRESSÃO, não de sincronia: se um dia alguém reintroduzir um param
    // que muda o FORMATO da tabela em vez do recorte, a divergência tela × arquivo
    // volta com ele — e foi assim que o F25-fix nasceu. `/itens` é a única tela do
    // produto que já teve isso; que continue sendo a única que não tem.
    //
    // ⚠ A busca é pelas formas de LEITURA do param (`'visao'`, `sp.visao`,
    // `ehVisaoConsolidado`), nunca pela palavra solta: os comentários destes
    // arquivos CITAM o toggle para explicar por que ele morreu, e punir quem
    // explica é o contrário do que este repositório quer.
    const LEITURAS = ["'visao'", 'sp.visao', 'ehVisaoConsolidado']
    // `semComentarios` é o mesmo recorte que `consistencia.test.ts` usa: o que
    // vale é o CÓDIGO. A nota que explica por que o toggle morreu cita o nome da
    // função morta de propósito, e punir quem explica é o contrário do que este
    // repositório quer.
    for (const alvo of [
      ['src', 'lib', 'actions', 'exportar.ts'],
      ['src', 'app', '(app)', 'itens', 'page.tsx'],
      ['src', 'app', '(app)', 'itens', 'historico', 'page.tsx'],
      ['src', 'components', 'itens', 'itens-filtros.tsx'],
      ['src', 'components', 'itens', 'historico-filtros.tsx'],
      ['src', 'lib', 'url-params.ts'],
    ]) {
      const src = semComentarios(fonte(...alvo))
      for (const leitura of LEITURAS) {
        expect(src, `${alvo.join('/')} voltou a ler "${leitura}"`).not.toContain(leitura)
      }
    }
  })
})

describe('a guarda cobre TODOS os exports que compartilham filtro com a tela', () => {
  it('os nomes das actions de export continuam existindo', () => {
    // Se um export for renomeado ou nascer um quinto, esta lista precisa saber —
    // senão a guarda acima continua verde cobrindo menos do que deveria.
    for (const nome of [
      'exportarAtivosCSV',
      'exportarPendenciasCSV',
      'exportarItensHistoricoCSV',
      'exportarItensSaldosCSV',
    ]) {
      expect(EXPORTAR.includes(`export async function ${nome}`), nome).toBe(true)
    }
  })

  it('a fatia de cada parser é menor que o arquivo (a busca é local, não global)', () => {
    // Trava a própria mecânica da guarda: se `corpoDe` voltasse a devolver o
    // arquivo inteiro, ela viraria de novo a versão falso-verde que a revisão
    // adversarial derrubou.
    for (const nome of ['filtrosAtivos', 'filtrosPendencias', 'filtrosHistorico']) {
      const corpo = corpoDe(nome)
      expect(corpo.length, nome).toBeGreaterThan(0)
      expect(corpo.length, nome).toBeLessThan(EXPORTAR.length / 2)
    }
  })
})
