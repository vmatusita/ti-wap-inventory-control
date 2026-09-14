// O ESCOPO DOS NÚMEROS DE `/itens` — de qual filial é o número que a tela mostra
// (F44).
//
// Módulo PURO: sem React, sem banco, sem `next/navigation` — a mesma disciplina de
// `lista.ts` e `distribuicao.ts`. Este repositório não renderiza componente em
// teste, então o que precisa de prova vira função pura.
//
// ============================================================================
// POR QUE ESTE ARQUIVO EXISTE
// ============================================================================
// Os números da linha JÁ seguiam o filtro desde a F42 — `saldoDoRecorte` devolve o
// consolidado quando não há recorte e a soma das filiais marcadas quando há, e é
// ele que alimenta a tabela, a linha expansível, os cartões e o CSV. Provado, antes
// de qualquer desenho, por `scripts/design/prova-recorte.ts` (saída em
// `docs/f44-evidencias/prova-recorte.txt`).
//
// O que mentia era a LEGENDA. Com `?filial=3`, a tela escrevia
// **"tudo que a TI possui"** embaixo de um número que é de uma filial só — e o
// operador acredita na legenda, não na fórmula. O julgamento em contexto fresco
// mediu o tamanho do buraco: perguntado "os números desta tela são de qual filial,
// ou de todas?", ele HESITOU em 12 das 14 passadas, e a frase que se repete nas
// respostas é sempre a mesma — *"o nome da filial não aparece na tela"*.
//
// ============================================================================
// A REGRA QUE GOVERNA ESTE ARQUIVO
// ============================================================================
// ⚠ `NUMEROS_ITEM` (`lib/ajuda/conteudo/itens-por-quantidade.ts`) CONTINUA SENDO A
// FONTE ÚNICA dos rótulos, e não muda uma vírgula. Ela é compartilhada com a
// página de ajuda, que descreve o significado de cada número SEM filtro e tem de
// continuar descrevendo — trocar o texto de lá por um texto de escopo tornaria a
// ajuda falsa para consertar a tela.
//
// A legenda com escopo se DERIVA dela, aqui, e desce por prop. Os NOMES dos cinco
// números não mudam (decisão do Johnny na F43, não revogada): o que passou a variar
// é a frase de apoio embaixo do número.

import { lerUnidades, type UnidadesEfetivas } from '@/lib/auth/recorte-leitura'

/** Rótulo, explicação curta e explicação inteira de um número — o de `NUMEROS_ITEM`. */
export type LegendaDeNumero = {
  chave: string
  rotulo: string
  curto?: string
  explicacao: string
}

/**
 * De quem são os números que a tela está mostrando agora.
 *
 * ⚠ `todas` é o modo `todas` das unidades efetivas (até a F57, `filialIds` VAZIO), e não
 * "todas as filiais estão marcadas". A
 * diferença não é semântica: sem recorte a tela mostra o `consolidado` da RPC, que
 * enxerga também a filial DESATIVADA com saldo; marcando as cinco à mão, ela mostra
 * a SOMA das cinco colunas, que pode ser menor. São dois números diferentes, e a
 * tela tem de dizer qual dos dois está na frente do operador — é justamente o que
 * `foraDasFiliais` existe para denunciar.
 */
export type EscopoDosNumeros =
  | { tipo: 'todas' }
  | { tipo: 'uma'; nome: string }
  | { tipo: 'varias'; nomes: readonly string[] }

/** O escopo a partir do que a `page.tsx` já resolveu: as filiais e o recorte. */
export function escopoDosNumeros(
  filiais: readonly { id: number; nome: string }[],
  unidades: UnidadesEfetivas<'id'>,
): EscopoDosNumeros {
  const vista = lerUnidades(unidades)
  if (vista.modo === 'todas') return { tipo: 'todas' }
  // Uma interseção vazia não é "todas": cai no plural genérico, sem nome inventado (F57).
  const ids: readonly number[] = vista.modo === 'lista' ? vista.valores : []
  const nomes = ids
    .map((id) => filiais.find((f) => f.id === id)?.nome)
    .filter((n): n is string => Boolean(n))
  // Recorte que não casa com nenhuma filial conhecida (id de uma filial removida
  // numa URL antiga): a tela não sabe nomear, e inventar um nome seria pior do que
  // dizer que é um recorte. Cai no plural genérico, que continua verdadeiro.
  if (nomes.length === 1) return { tipo: 'uma', nome: nomes[0] }
  return { tipo: 'varias', nomes }
}

/**
 * O escopo em três ou quatro palavras — o que cabe numa linha acima dos cartões.
 *
 * `varias` conta em vez de listar: cinco nomes numa linha de apoio empurram o
 * layout e ninguém lê o quinto. Quem quer os nomes tem a `<caption>` da tabela,
 * que os escreve por extenso.
 */
export function rotuloDoEscopo(escopo: EscopoDosNumeros): string {
  if (escopo.tipo === 'todas') return 'todas as filiais'
  if (escopo.tipo === 'uma') return escopo.nome
  // ⚠ SEM ARTIGO, e isso é gramática, não estilo. Este rótulo é COMPOSTO por três
  // frases que já trazem a preposição: `de ${rotulo}`, `nas ${rotulo}`,
  // `somado de ${rotulo}`. Com "as filiais filtradas" elas viravam
  // "Números somados de AS filiais filtradas" e "nas AS filiais filtradas" — a
  // revisão adversarial pegou. Sem o artigo, as três saem certas.
  if (escopo.nomes.length === 0) return 'filiais filtradas'
  return `${escopo.nomes.length} filiais`
}

/**
 * O COMPLEMENTO DE LUGAR — "em Cerrado Alto", "nas 3 filiais", ou vazio sem
 * recorte.
 *
 * É ele que deixa uma frase curta herdar o escopo sem redigitá-lo: quem precisa
 * dizer "abaixo do mínimo" acrescenta isto e vira "abaixo do mínimo em Cerrado
 * Alto". Sem recorte devolve string VAZIA de propósito — "abaixo do mínimo em
 * todas as filiais" é mais palavra para dizer o padrão.
 */
export function ondeDoEscopo(escopo: EscopoDosNumeros): string {
  if (escopo.tipo === 'todas') return ''
  if (escopo.tipo === 'uma') return `em ${escopo.nome}`
  return `nas ${rotuloDoEscopo(escopo)}`
}

/** A linha acima dos cartões de resumo. Curta, e sempre presente. */
export function fraseDoResumo(escopo: EscopoDosNumeros): string {
  if (escopo.tipo === 'varias') return `Números somados de ${rotuloDoEscopo(escopo)}`
  return `Números de ${rotuloDoEscopo(escopo)}`
}

/**
 * A `<caption>` da tabela — a frase por extenso, com os NOMES das filiais.
 *
 * ⚠ ELA NOMEIA AS COLUNAS a partir de `NUMEROS_ITEM`, e não de uma lista redigitada
 * aqui: se um rótulo mudar lá, a legenda muda junto. E ela nomeia só as colunas do
 * BLOCO RECORTADO — as colunas por filial ao lado têm escopo próprio, escrito no
 * cabeçalho de cada uma.
 *
 * ⚠ `<caption>` e NÃO uma linha de cabeçalho agrupador (`<th colSpan={4}>`): as
 * colunas *Total* e *Falta* são `hidden sm:table-cell`, então abaixo de `sm` só
 * duas das quatro existem — e `colSpan` não tem variante de breakpoint. O
 * agrupador ou mentiria a largura em 390px, ou teria de sumir justamente na tela
 * em que o operador tem menos contexto.
 */
export function legendaDaTabela(
  legendas: readonly LegendaDeNumero[],
  escopo: EscopoDosNumeros,
  chavesVisiveis: readonly string[],
): string {
  const nomes = chavesVisiveis
    .map((c) => legendas.find((l) => l.chave === c)?.rotulo)
    .filter((r): r is string => Boolean(r))
  const colunas = listar(nomes)
  const sujeito = colunas || 'Os números desta tabela'
  if (escopo.tipo === 'todas') return `${sujeito} são de todas as filiais.`
  if (escopo.tipo === 'uma') return `${sujeito} são de ${escopo.nome}.`
  if (escopo.nomes.length === 0) return `${sujeito} somam as filiais filtradas.`
  return `${sujeito} somam ${escopo.nomes.length} filiais: ${listar(escopo.nomes)}.`
}

/** `a`, `a e b`, `a, b e c` — a vírgula do português, com "e" antes do último. */
function listar(itens: readonly string[]): string {
  if (itens.length === 0) return ''
  if (itens.length === 1) return itens[0]
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

/**
 * As legendas de `NUMEROS_ITEM` com o escopo embutido — o que desce por prop para
 * o cabeçalho da coluna, para o cartão de métrica e para a `Dica` de cada um.
 *
 * SEM RECORTE devolve a lista INTACTA (a mesma referência de item por item): sem
 * filtro, o texto de `NUMEROS_ITEM` já é verdadeiro, e reescrevê-lo por reescrever
 * criaria uma segunda versão do vocabulário para manter em dia.
 *
 * COM RECORTE, duas coisas mudam:
 *
 *  1. **`total` tem a base TROCADA.** "Tudo que a TI possui daquele item" é
 *     literalmente falso sob recorte, e o critério da fase exige que a frase suma
 *     da tela renderizada — não basta acrescentar uma ressalva depois dela.
 *  2. **Todo o resto ganha a frase de escopo NO FIM da explicação.** "Na prateleira
 *     agora" não afirma escopo nenhum, então continua verdadeiro; o que faltava era
 *     dizer de QUAL prateleira, e é isso que a frase acrescenta.
 *
 * O `curto` só muda em `total` — é o único que afirmava escopo, e é o único que
 * cabe: o `curto` é renderizado sob o cabeçalho de uma coluna de ~114px, e
 * "na prateleira em Estância Velha do Norte" empurraria a tabela inteira.
 */
export function cabecalhosComEscopo(
  legendas: readonly LegendaDeNumero[],
  escopo: EscopoDosNumeros,
): LegendaDeNumero[] {
  if (escopo.tipo === 'todas') return [...legendas]
  const onde = ondeDoEscopo(escopo)
  const sufixo =
    escopo.tipo === 'uma'
      ? `Nesta tela, o número é só de ${escopo.nome}.`
      : `Nesta tela, o número soma ${rotuloDoEscopo(escopo)}.`
  return legendas.map((l) =>
    l.chave === 'total'
      ? {
          ...l,
          curto: `tudo ${onde}`,
          explicacao: `Tudo que existe daquele item ${onde} — o patrimônio do almoxarifado, recortado por este filtro. Sem filtro de filial, este número é o da TI inteira.`,
        }
      : { ...l, explicacao: `${l.explicacao} ${sufixo}` },
  )
}

/**
 * O APOIO DO CARTÃO *A repor* — "de 44 itens abaixo do mínimo em Cerrado Alto".
 *
 * ⚠ ELE MORA AQUI, E NÃO DENTRO DO COMPONENTE, pela mesma razão que todo o resto
 * deste arquivo: este repositório não renderiza componente em teste, então a frase
 * que o operador lê só tem prova se for função pura. Ela nasceu dentro de
 * `alarmes()` (`components/itens/resumo-de-itens.tsx`) e veio para cá na revisão da
 * F44 — foi exatamente ali, no único texto da fase que ficou fora deste módulo, que
 * passou um erro de concordância.
 *
 * ⚠ A CONCORDÂNCIA SEGUE O NÚMERO COLADO NO SUBSTANTIVO, e não a contagem do
 * cartão. Com denominador quem manda é `itens` ("de 44 **itens** abaixo do mínimo",
 * mesmo com UM só a repor); sem denominador quem manda é `aRepor`. A primeira
 * escrita olhava sempre `aRepor` e produzia "de 44 **item** abaixo do mínimo".
 *
 * O DENOMINADOR só entra quando há o que comparar (`itens > aRepor`): com o "repor"
 * seguindo o filtro, uma filial sozinha acende quase tudo, e dizer "36 de 44"
 * transforma a enxurrada em informação em vez de deixá-la parecer rótulo padrão.
 * Quando TODOS acendem, "de 44" seria ruído.
 */
export function apoioDoRepor(
  aRepor: number,
  itens: number,
  escopo: EscopoDosNumeros,
): string {
  const comDenominador = itens > aRepor
  const contado = comDenominador ? itens : aRepor
  const base = `${contado === 1 ? 'item' : 'itens'} abaixo do mínimo`
  const onde = ondeDoEscopo(escopo)
  const comEscopo = onde ? `${base} ${onde}` : base
  return comDenominador ? `de ${itens.toLocaleString('pt-BR')} ${comEscopo}` : comEscopo
}

/**
 * O texto do estoque contra o qual o aviso "repor" está comparando — o que a `Dica`
 * do selo escreve.
 *
 * ⚠ ESTE É O LADO VISÍVEL DA REVISÃO DE 23/07/2026. Até a v1.48.0 o "repor"
 * comparava SEMPRE com o consolidado, e a dica dizia "estoque de todas as filiais"
 * — e era o único número da tela que continuava sendo da TI inteira sob recorte,
 * sem nada na superfície dizendo isso. Desde a F44 ele segue o filtro (decisão do
 * Johnny, 01/09/2026), e o efeito colateral que a decisão antiga evitava passou a
 * ser possível: uma filial abaixo do mínimo acende "repor" mesmo com sobra na
 * filial ao lado. Por isso a dica NOMEIA o estoque que está na conta.
 */
export function rotuloEstoqueDoRepor(escopo: EscopoDosNumeros): string {
  if (escopo.tipo === 'todas') return 'estoque de todas as filiais'
  if (escopo.tipo === 'uma') return `estoque em ${escopo.nome}`
  return `estoque somado de ${rotuloDoEscopo(escopo)}`
}
