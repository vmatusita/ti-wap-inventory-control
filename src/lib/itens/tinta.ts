// A TINTA DE CADA NÚMERO DE `/itens` — uma cor por número, a mesma nos três
// lugares (F44).
//
// Módulo PURO, sem React: o mapa é dado, e dado com teste. Quem pinta são os três
// consumidores — o cartão de resumo (`resumo-de-itens.tsx`), o cabeçalho da coluna
// (`cabecalho-de-numero.tsx`) e a célula (`itens-table.tsx`).
//
// ============================================================================
// O PEDIDO, E A REGRA QUE ELE TEM DE OBEDECER
// ============================================================================
// O Johnny, em 01/09/2026: *"preciso que adicione mais cores para facilitar
// visualização"*. E, na mesma conversa, RECUSOU duas coisas: mapa de calor por
// quantidade nas colunas de filial, e chip colorido por grupo/tipo.
//
// ⚠ O PRODUTO JÁ TEM UMA LÍNGUA, E ELA MANDA AQUI. `--selo-em-estoque` (verde) e
// `--selo-em-uso` (azul) são as cores com que o produto inteiro já diz "em estoque"
// e "em uso" na tela de ativos (`STATUS_META`, `src/lib/dominio.ts`). As colunas de
// item se chamam EXATAMENTE IGUAL. Inventar um segundo verde para o mesmo conceito
// seria criar dialeto — duas telas dizendo a mesma coisa com tintas diferentes.
//
// ⚠ E NADA DE PALETA CRUA. `src/lib/dominio/cores.test.ts` guarda uma catraca que
// só desce (`TETO_PALETA_CRUA`); cor aqui é TOKEN, alcançável por classe
// (`text-selo-em-estoque-texto`), nunca `text-green-800` à mão.
//
// ============================================================================
// POR QUE **TOTAL** É O NEUTRO — é escolha, não esquecimento
// ============================================================================
// Sobram poucos matizes livres, e os dois candidatos óbvios são armadilha:
//
//  · **violeta É `--selo-reservado`**, e "Reservado" é *outro* dos cinco números de
//    item. Usá-lo em Total seria colisão de dialeto dentro da MESMA tela;
//  · **âmbar É o aviso "repor"**, que convive na mesma linha.
//
// E há uma razão de leitura, medida antes: *Em estoque* é a ÂNCORA da linha por
// decisão da F43 (`text-base font-semibold`, o único número um degrau acima). Pintar
// Total de uma cor forte disputaria essa âncora com o número que responde "posso
// pegar agora?".
//
// Total é o número de REFERÊNCIA — a soma dos outros dois —, e o neutro diz isso.
// Ele continua tendo marca própria na chave de cor, nos três lugares, como os
// outros três: o quadradinho dele é cinza, e cinza também é uma resposta.
//
// ⚠ NADA ESSENCIAL SÓ POR COR. O número e o rótulo continuam ao lado dela, sempre.
// O quadradinho é `aria-hidden`: é reforço, não é o dado.

/** A tinta de um número: o texto e o quadradinho da chave de cor. */
export type TintaDoNumero = {
  /** A classe do NÚMERO — no cartão e na célula. */
  texto: string
  /** A classe do quadradinho ao lado do rótulo — no cartão e no cabeçalho. */
  marca: string
}

/**
 * `NUMEROS_ITEM.chave` → a tinta.
 *
 * ⚠ AS CLASSES SÃO LITERAIS de propósito: o Tailwind v4 varre o código-fonte
 * procurando nome de classe, e um `text-selo-${familia}-texto` montado em tempo de
 * execução simplesmente não geraria CSS — a classe existiria no HTML e nada
 * pintaria, em silêncio. É a mesma armadilha que `LARGURAS` documenta em
 * `components/layout/pagina.tsx`.
 */
export const TINTA_DO_NUMERO: Readonly<Record<string, TintaDoNumero>> = {
  // Verde: o MESMO de `STATUS_META.em_estoque`. "Na prateleira agora."
  estoque: {
    texto: 'text-selo-em-estoque-texto',
    marca: 'bg-selo-em-estoque-texto',
  },
  // Azul: o MESMO de `STATUS_META.em_uso`. "Com as pessoas."
  emUso: {
    texto: 'text-selo-em-uso-texto',
    marca: 'bg-selo-em-uso-texto',
  },
  // Vermelho: a família do selo "faltam N", que já era vermelho e não muda. O
  // token `--destructive` é o vermelho nomeado do produto, no mesmo matiz (hue ~27)
  // do `red-700` da badge.
  falta: {
    texto: 'text-destructive',
    marca: 'bg-destructive',
  },
  // Neutro, e de propósito — ver o cabeçalho deste arquivo.
  total: {
    texto: 'text-muted-foreground',
    marca: 'bg-muted-foreground',
  },
  // "Reservado" saiu da tabela na F42 (é zero em produção desde a F41) e só aparece
  // na linha expansível e no CSV. Ele tem entrada aqui para que, se um dia voltar a
  // ser coluna, volte com a cor que o produto já usa para ele — e não com uma nova.
  atrelados: {
    texto: 'text-selo-reservado-texto',
    marca: 'bg-selo-reservado-texto',
  },
}

/**
 * O que NÃO é um dos cinco números, e mesmo assim ganha cartão no resumo.
 *
 * "A repor" é um ALARME, não um número do item: ele conta ITENS abaixo do mínimo,
 * não unidades. Veste o âmbar do produto (`--warning`), que é a mesma cor com que o
 * selo "repor" já pinta a linha — âmbar é previsão de compra, não erro, e o
 * vermelho continua sendo do "faltam N" (decisão da F12, não revogada).
 *
 * Fica FORA de `TINTA_DO_NUMERO` de propósito: aquele mapa é keyed pelas chaves de
 * `NUMEROS_ITEM`, e o teste cobra paridade exata com elas.
 */
const TINTA_DO_ALARME: Readonly<Record<string, TintaDoNumero>> = {
  repor: { texto: 'text-warning', marca: 'bg-warning' },
}

/** A tinta de um número (ou alarme), ou o neutro para uma chave sem cor. */
export function tintaDoNumero(chave: string): TintaDoNumero {
  return TINTA_DO_NUMERO[chave] ?? TINTA_DO_ALARME[chave] ?? TINTA_DO_NUMERO.total
}
