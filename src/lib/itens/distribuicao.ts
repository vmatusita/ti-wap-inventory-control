// A DISTRIBUIÇÃO POR FILIAL, E O RESUMO DA LISTA — a aritmética que a F43 pôs na
// superfície da linha de `/itens`.
//
// Módulo PURO: sem React, sem banco, sem `next/navigation` — a mesma disciplina
// de `lista.ts`. Este repositório não renderiza componente em teste (a
// `vitest.config.mts` roda em ambiente `node`), então tudo que precisa de prova
// vira função pura.
//
// ⚠ NENHUMA LEITURA NOVA. Os números todos já chegam em `LinhaDeItem`
// (`porFilial` + `consolidado`, de uma chamada só de `getSaldosPorFilial`). O que
// falta em `/itens` desde sempre não é dado — é desenho. Se algum dia alguém
// precisar escrever SQL para alimentar esta tela, parou de fazer a F43.

import { emUsoDoSaldo, type LinhaDeItem, type NumerosDoItem } from '@/lib/itens/lista'
import { minimoDoItem, type MinimosPorItem } from '@/lib/itens/repor'
import { precisaRepor } from '@/lib/validators/item'

// ---------------------------------------------------------------------------
// 1 · O RÓTULO CURTO DA FILIAL — cabeçalho de coluna, não parágrafo
// ---------------------------------------------------------------------------
//
// A tela passa a ter UMA COLUNA POR FILIAL, e o nome vira cabeçalho. "Estância
// Velha do Norte" num `<th>` empurra a coluna para 160px e come a largura das
// outras cinco. Encurtar é obrigatório.
//
// ⚠ MAS ENCURTAR NÃO PODE CRIAR AMBIGUIDADE: duas filiais que virassem o MESMO
// rótulo curto fariam o operador ler a coluna errada — que é pior do que uma
// coluna larga. Por isso a função recebe a LISTA INTEIRA e só encurta o que
// continua único depois de encurtado. Quem colide fica com o nome cheio.

/** Acima disto o nome não cabe num cabeçalho de coluna sem empurrar a tabela. */
const LIMITE_DO_CABECALHO = 12

/**
 * O primeiro "pedaço" do nome: até o primeiro espaço, hífen ou barra.
 *
 * Palavra só (`Aurora`, `Linhares`) devolve ela mesma; nome composto
 * (`Estância Velha do Norte`) devolve `Estância`.
 */
function primeiroPedaco(nome: string): string {
  const m = /^[^\s\-/]+/.exec(nome.trim())
  return m ? m[0] : nome.trim()
}

/**
 * `filial.id` → o rótulo que o cabeçalho da coluna exibe.
 *
 * Regra, nesta ordem:
 *  1. nome curto o bastante → o nome inteiro;
 *  2. senão, o primeiro pedaço — **desde que ele seja único** entre todas as
 *     filiais desta lista, comparado sem caixa e sem acento;
 *  3. colidiu → o nome inteiro, e a tabela que se vire com a largura. Um rótulo
 *     ambíguo é pior do que um rótulo comprido.
 */
export function rotulosCurtosDeFilial(
  filiais: readonly { id: number; nome: string }[],
): Readonly<Record<number, string>> {
  // Colisão se compara SEM caixa e SEM acento — `sensitivity: 'base'` faz as
  // duas coisas de uma vez, sem tabela de acentos própria. (`chaveItem` faz o
  // mesmo trabalho em `chave.ts`, mas lá ele espelha uma função SQL byte a byte
  // e não pode ser reusado para outra coisa.)
  const mesmoPedaco = (a: string, b: string) =>
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) === 0

  const pedacos = filiais.map((f) => primeiroPedaco(f.nome))

  const mapa: Record<number, string> = {}
  filiais.forEach((f, i) => {
    const nome = f.nome.trim()
    if (nome.length <= LIMITE_DO_CABECALHO) {
      mapa[f.id] = nome
      return
    }
    const colide = pedacos.some((p, j) => j !== i && mesmoPedaco(p, pedacos[i]))
    mapa[f.id] = colide ? nome : pedacos[i]
  })
  return mapa
}

// ---------------------------------------------------------------------------
// 2 · A CÉLULA DE UMA FILIAL — o que a coluna nova mostra
// ---------------------------------------------------------------------------

const ZERO: NumerosDoItem = { total: 0, estoque: 0, atrelados: 0, falta: 0 }

export type CelulaDeFilial = {
  filialId: number
  /** O rótulo curto do cabeçalho — resolvido uma vez para a tabela inteira. */
  rotulo: string
  /** O nome cheio, sem abreviar — é ele que a linha expansível exibe. */
  nome: string
  /** Os quatro números daquela filial; tudo zerado quando ela não tem o item. */
  numeros: NumerosDoItem
  /** `Σ saída − Σ devolução` daquela filial. */
  emUso: number
}

// ⚠ NÃO EXISTE "AUSENTE" NA TELA, e a decisão foi medida. A primeira versão
// distinguia `0` (prateleira vazia com histórico) de `—` (a filial nunca teve o
// item) — e o julgamento em contexto fresco parou nisso: "fico em dúvida se 0 e —
// querem dizer a mesma coisa". Para quem pergunta "de onde eu tiro um?", os dois
// respondem a MESMA coisa: dali, não. A distinção custava uma dúvida por linha e
// não pagava nada, então a coluna mostra sempre um número.

/**
 * A distribuição de UM item entre as filiais visíveis, na ORDEM RECEBIDA.
 *
 * ⚠ A ordem é a de quem chama, e isso não é detalhe: a coluna de uma filial tem
 * de cair no MESMO lugar em todas as linhas, senão não se compara nada varrendo
 * a tabela para baixo — que é metade do ganho de trazer a filial para a linha.
 *
 * ⚠ E É A MESMA CONTA DA LINHA EXPANSÍVEL. As duas superfícies consomem esta
 * função: a coluna mostra o `estoque` de cada célula, a linha expansível mostra
 * os quatro números da MESMA célula. Duas contas paralelas sobre a mesma verdade
 * é como a tela e o CSV divergiram no achado F12-W4-03.
 */
export function distribuicaoDoItem(
  linha: Pick<LinhaDeItem, 'porFilial'>,
  filiais: readonly { id: number; nome: string }[],
  rotulos: Readonly<Record<number, string>>,
): CelulaDeFilial[] {
  return filiais.map((f) => {
    const numeros = linha.porFilial[f.id] ?? ZERO
    return {
      filialId: f.id,
      rotulo: rotulos[f.id] ?? f.nome,
      nome: f.nome,
      numeros,
      emUso: emUsoDoSaldo(numeros),
    }
  })
}

// ---------------------------------------------------------------------------
// 3 · O RESUMO DA LISTA — os cartões de métrica no topo
// ---------------------------------------------------------------------------
//
// Os cartões existem por DOIS motivos, e o segundo é o que importa mais:
//  · dão o tamanho do acervo de uma olhada;
//  · dão a cada número um RÓTULO e uma explicação curta VISÍVEIS. Até a F42 o
//    significado de Total/Em estoque/Em uso/Falta morava só na dica do cabeçalho
//    — e dica é, por definição, o contrário de "ao bater o olho".
//
// ⚠ SOMA O QUE ESTÁ FILTRADO, não o catálogo inteiro. O cartão tem de fechar com
// a lista que está na tela: um resumo global sobre uma lista recortada é a mesma
// classe de defeito que a F25 corrigiu no selo de pendências.

export type ResumoDaLista = {
  /** Quantos itens entraram na conta (os filtrados, não os da página). */
  itens: number
  total: number
  estoque: number
  emUso: number
  atrelados: number
  falta: number
  /** Itens abaixo do ponto de reposição — a mesma regra do selo "repor". */
  aRepor: number
  /** Itens com déficit — a mesma regra do selo "faltam N". */
  comFalta: number
}

/**
 * Soma os números da lista JÁ FILTRADA e conta os dois alarmes.
 *
 * ⚠ F44 — O "REPOR" PASSOU A SEGUIR O RECORTE, e isso REVISA a decisão de
 * 23/07/2026 (F12 · I5), que mandava comparar sempre com o consolidado. Até a
 * v1.48.0 esta função somava `saldo` e contava `consolidado` na MESMA varredura, e
 * o resultado era que o cartão *A repor* era o único número da tela que não
 * respondia ao filtro — 11 com uma filial marcada, 11 sem filtro nenhum, sem nada
 * na superfície dizendo por quê.
 *
 * Agora as duas contas saem de `l.saldo`, e é isso que faz o cartão e o selo da
 * linha NUNCA discordarem (critério 5 da ordem): os dois passam por
 * `precisaRepor(estoque do recorte, mínimo)`. Sem recorte, `saldo === consolidado`
 * e o número é exatamente o de antes.
 *
 * O efeito colateral que a decisão antiga evitava — mandar repor o que está
 * sobrando na filial ao lado — passou a ser possível, e por isso a tela NOMEIA o
 * escopo em duas superfícies (`fraseDoResumo` e `legendaDaTabela`, em
 * `lib/itens/escopo.ts`) e a dica do selo diz contra qual estoque está comparando.
 */
export function resumoDaLista(
  linhas: readonly LinhaDeItem[],
  minimos: MinimosPorItem,
): ResumoDaLista {
  const r: ResumoDaLista = {
    itens: linhas.length,
    total: 0,
    estoque: 0,
    emUso: 0,
    atrelados: 0,
    falta: 0,
    aRepor: 0,
    comFalta: 0,
  }
  for (const l of linhas) {
    r.total += l.saldo.total
    r.estoque += l.saldo.estoque
    r.emUso += emUsoDoSaldo(l.saldo)
    r.atrelados += l.saldo.atrelados
    r.falta += l.saldo.falta
    if (precisaRepor(l.saldo.estoque, minimoDoItem(minimos, l.item_id))) r.aRepor += 1
    if (l.saldo.falta > 0) r.comFalta += 1
  }
  return r
}
