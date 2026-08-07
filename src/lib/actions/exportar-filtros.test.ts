import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// GUARDA DE SINCRONIA TELA ↔ CSV (F28, depois de o defeito nascer PELA SEGUNDA VEZ).
//
// O contrato da casa (F12 · W6A) é que o export CSV leva para o Excel EXATAMENTE o
// que está na tela. Ele é frágil por construção: o filtro é lido em DOIS lugares
// independentes — a `page.tsx`, que monta os params da leitura da tela, e
// `filtrosAtivos`/`filtrosHistorico` em `actions/exportar.ts`, que remonta os
// mesmos params a partir da querystring que o botão de export manda junto.
// A função de QUERY é a mesma nos dois caminhos; o que diverge é quem a alimenta.
//
// Já aconteceu duas vezes:
//   · F12-W4-03 — a faixa sã de datas nunca chegava ao export, e o teto de página
//     nunca chegava a /itens e /pendencias.
//   · F28 — o chip "Com pendência" (ATV-02) e a busca do histórico (ITN-03b)
//     nasceram na tela e não no `exportar.ts`. O tipo compilava (os campos são
//     opcionais), o lint passava, os 2.022 testes passavam: o CSV simplesmente
//     saía maior que a tela, sem erro nenhum. Quem pegou foi a revisão adversarial.
//
// Por que uma guarda de FONTE e não um teste de unidade: `actions/exportar.ts` é
// um módulo `'use server'`, e módulo `'use server'` só pode exportar `async
// function` (armadilha F13). `filtrosAtivos`/`filtrosHistorico` não podem ser
// exportadas para serem testadas diretamente — então o que se pode travar é que
// o NOME do param apareça nos dois arquivos.
//
// Limite conhecido e aceito: isto prova que o param é MENCIONADO nos dois lados,
// não que seja interpretado igual. É uma rede contra o esquecimento (o modo real
// como o defeito nasceu), não contra a divergência semântica.

const RAIZ = process.cwd()

function fonte(...partes: string[]): string {
  return readFileSync(join(RAIZ, ...partes), 'utf8')
}

const EXPORTAR = fonte('src', 'lib', 'actions', 'exportar.ts')

/** Filtros que a tela e o CSV compartilham, por tela. Param → onde a tela o lê. */
const COMPARTILHADOS: {
  tela: string
  pagina: string[]
  params: string[]
}[] = [
  {
    tela: '/ativos',
    pagina: ['src', 'app', '(app)', 'ativos', 'page.tsx'],
    // `page`/`pp`/`ord` ficam DE FORA de propósito: paginação e ordenação não
    // valem no export (o CSV leva o recorte inteiro, até o teto).
    params: ['q', 'filial', 'categoria', 'status', 'semPatrimonio', 'comPendencia'],
  },
  {
    tela: '/pendencias',
    pagina: ['src', 'app', '(app)', 'pendencias', 'page.tsx'],
    params: ['filial', 'tipo', 'q'],
  },
  {
    tela: '/itens (histórico de lançamentos)',
    pagina: ['src', 'app', '(app)', 'itens', 'page.tsx'],
    params: ['filial', 'item', 'tipo', 'de', 'ate', 'busca'],
  },
]

describe('tela × CSV — todo filtro compartilhado é lido nos DOIS lados', () => {
  for (const { tela, pagina, params } of COMPARTILHADOS) {
    describe(tela, () => {
      const src = fonte(...pagina)

      for (const param of params) {
        it(`o param "${param}" é lido pela tela E por actions/exportar.ts`, () => {
          expect(
            src.includes(param),
            `${tela}: a página não menciona "${param}" — atualize esta lista se o filtro deixou de existir`,
          ).toBe(true)
          expect(
            EXPORTAR.includes(`'${param}'`),
            `actions/exportar.ts não lê "${param}": o filtro vale na tela e NÃO no CSV — ` +
              `o arquivo baixado sai diferente do que o operador está vendo (F12 · W6A)`,
          ).toBe(true)
        })
      }
    })
  }
})

describe('a guarda cobre os três exports que compartilham filtro com a tela', () => {
  it('os nomes das actions de export continuam existindo', () => {
    // Se um export for renomeado ou nascer um quarto, esta lista precisa saber —
    // senão a guarda acima continua verde cobrindo menos do que deveria.
    for (const nome of [
      'exportarAtivosCSV',
      'exportarPendenciasCSV',
      'exportarItensHistoricoCSV',
    ]) {
      expect(EXPORTAR.includes(`export async function ${nome}`), nome).toBe(true)
    }
  })
})
