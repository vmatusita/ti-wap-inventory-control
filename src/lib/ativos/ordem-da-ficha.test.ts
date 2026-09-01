import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// A ORDEM DOS BLOCOS DA FICHA DO ATIVO, PROVADA NOS DOIS ARQUIVOS QUE A ESCREVEM.
//
// ============================================================================
// POR QUE ESTE TESTE EXISTE
// ============================================================================
// A F44 (01/09/2026) mudou UMA coisa na ficha: a ORDEM. Os dois blocos de item
// desceram para depois da linha do tempo, porque o Johnny pediu ver "antes dados
// do ativo, termos e linha do tempo (…) que é mais importante que os itens".
//
// A evidência dessa mudança são os PNG de `docs/f44-evidencias/`, e eles saem de
// `scripts/design/previa-ficha.tsx` — uma prévia que remonta a árvore da ficha à
// mão para poder fotografá-la sem banco. Os componentes ali dentro são os de
// verdade; a COMPOSIÇÃO, não: ela é uma segunda escrita da mesma tela.
//
// Ou seja: a foto provava a ordem da PRÉVIA, e nada ligava as duas. Trocar a ordem
// em `page.tsx` sem tocar na prévia deixaria a evidência mentindo, com a suíte
// verde — foi por isso que a verificação do critério 1 teve de ser refeita à mão
// contra a produção, por HTTP, depois do deploy.
//
// Este teste é essa ligação. Ele não olha estilo nem conteúdo: só a SEQUÊNCIA dos
// cinco blocos, nos dois arquivos, e cobra que sejam a mesma.
//
// ⚠ SE ELE FALHAR, a pergunta não é "qual dos dois ajusto para passar": é qual dos
// dois está certo. Mudou a tela? A prévia acompanha, e as evidências se regeram.
// Mudou só a prévia? Ela voltou a fotografar uma tela que não existe.

const RAIZ = join(import.meta.dirname, '..', '..', '..')
const TELA = join(RAIZ, 'src', 'app', '(app)', 'ativos', '[id]', 'page.tsx')
const PREVIA = join(RAIZ, 'scripts', 'design', 'previa-ficha.tsx')

/** Os marcadores de bloco, com o nome que este teste usa para falar deles. */
const MARCADORES: readonly { nome: string; trecho: string }[] = [
  { nome: 'dados-do-ativo', trecho: '>Dados do ativo<' },
  { nome: 'termos', trecho: '<TermosDaFicha' },
  { nome: 'linha-do-tempo', trecho: '<SecaoDaPagina titulo="Linha do tempo">' },
  { nome: 'itens-que-foram-junto', trecho: '<ItensQueForamJunto' },
  { nome: 'pendencias-de-item', trecho: '<PendenciasItemFicha' },
]

/** A sequência em que os blocos aparecem no arquivo, de cima para baixo. */
function ordemDosBlocos(caminho: string): string[] {
  const fonte = readFileSync(caminho, 'utf8')
  return MARCADORES.map(({ nome, trecho }) => ({ nome, em: fonte.indexOf(trecho) }))
    .filter((m) => m.em >= 0)
    .sort((a, b) => a.em - b.em)
    .map((m) => m.nome)
}

describe('ordem dos blocos da ficha do ativo (F44)', () => {
  it('a tela põe o EQUIPAMENTO antes dos itens', () => {
    expect(ordemDosBlocos(TELA)).toEqual([
      'dados-do-ativo',
      'termos',
      'linha-do-tempo',
      'itens-que-foram-junto',
      'pendencias-de-item',
    ])
  })

  it('a prévia que gera as evidências fotografa a MESMA ordem da tela', () => {
    expect(ordemDosBlocos(PREVIA)).toEqual(ordemDosBlocos(TELA))
  })

  it('os cinco marcadores existem nos dois arquivos — nenhum some em silêncio', () => {
    for (const caminho of [TELA, PREVIA]) {
      expect(ordemDosBlocos(caminho), caminho).toHaveLength(MARCADORES.length)
    }
  })
})
