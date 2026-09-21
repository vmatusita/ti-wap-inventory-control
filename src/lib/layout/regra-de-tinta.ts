// A REGRA DE TINTA — o par cru que duplica um token não volta (F61).
//
// `src/lib/dominio/cores.test.ts` tem uma CATRACA: o total de paleta crua só
// desce. Catraca não impede que uma tela NOVA escreva `bg-green-100
// text-green-800` enquanto outra apaga dois âmbares — o total desce e o verde de
// sucesso volta a ser escrito à mão. Esta regra é a outra metade: para os pares
// que a F61 TRANSFORMOU EM TOKEN, a volta é proibida, com nome.
//
// ============================================================================
// POR QUE A LISTA É ESCRITA À MÃO, E NÃO DERIVADA DO CSS
// ============================================================================
// A primeira ideia (a da ficha) era derivar a proibição dos comentários de
// `globals.css`: "todo tom que já tem token vira proibido". Medido em 17/09/2026:
// os comentários citam 36 tons, e a regra derivada proibiria 204 dos 473 usos de
// paleta crua — 136 deles ÂMBAR, os callouts legítimos que ainda não têm
// componente. A derivação transformaria "declarei um token" em "quebrei 136
// telas". Então a regra só proíbe o que uma fase decidiu, par a par, e diz qual
// token substitui.
//
// ============================================================================
// O QUE É PROIBIDO
// ============================================================================
// · o verde de sucesso — `green-100/800/950/300` SEM modificador de opacidade:
//   são os quatro valores de `--sucesso`/`--sucesso-texto`. Com `/NN` é outra
//   cor (um véu translúcido), e fica com a catraca.
// · `text-white` e `text-black` — o texto do cromo escuro e o texto sobre o
//   amarelo da marca: `--brand-dark-texto` e `--brand-amarelo-texto`.
// Em qualquer variante (`dark:`, `hover:`, `/70`), fora de teste, fora de
// comentário.
// · v1.66.4 (item AB) — o PAR da caixa de atenção âmbar: `bg-amber-50` com
//   `dark:bg-amber-950/40`, `text-amber-900` com `dark:text-amber-200` (com o mesmo
//   `/NN` dos dois lados, ou sem nenhum) e `border-amber-300` com
//   `dark:border-amber-900`, no MESMO TRECHO DE CLASSE (ver abaixo). É o PAR que é
//   proibido, não a cor: a mesma `bg-amber-50` ao lado de um `dark:` de outro valor
//   é outra cor no escuro, e fica com a catraca (são as variantes que a troca da
//   v1.66.4 deixou cruas de propósito). E é o par EXATO que o token substitui: a
//   classe clara sem nenhum prefixo e o `dark:` sem mais nada empilhado. `!` ou uma
//   variante a mais (`dark:hover:`, `md:dark:`, `hover:` no claro) é OUTRA cascata —
//   `text-amber-900 dark:hover:text-amber-200` pinta `amber-900` no escuro fora do
//   hover, e trocá-lo pelo token mudaria a cor —, então não é recusado aqui; a
//   catraca ainda o conta.
//
// O TRECHO DE CLASSE: todas as regras leem cada linha partida nas aspas, crases e
// chaves, que é onde uma string de classe começa e termina. Assim duas classes de
// elementos diferentes na mesma linha (os dois ramos de um ternário) e a classe
// citada como TEXTO de tela não formam par (revisão final da v1.66.4, que achou os
// dois falsos positivos com a primeira versão, que lia a linha inteira). O limite
// declarado: um par partido em duas linhas, ou em dois literais de um mesmo `cn()`,
// escapa — é o custo de uma regra que lê texto, e a catraca ainda o conta.
//
// A EXCEÇÃO É NOMEADA (arquivo + trecho + motivo), SÓ ENCOLHE e reprova quando não
// casa com nada — exceção morta é exceção que ninguém revisa. Módulo puro.

export type ParProibido = {
  /** Nome curto, para a mensagem. */
  nome: string
  /** O token que substitui o par. */
  token: string
  padrao: RegExp
}

/**
 * O PAR da caixa de atenção âmbar (v1.66.4): casa a classe CLARA, sem prefixo de
 * variante nem `!`, quando o `dark:` de MESMO valor do token (também sem `!` nem
 * variante empilhada) está no mesmo trecho de classe, antes ou depois dela — uma
 * ocorrência por par, na classe clara. Com `alfa`, o `/NN` tem de ser o mesmo dos
 * dois lados: o grupo 1 é capturado na classe clara ANTES das duas buscas, e por
 * isso o `\1` vale também dentro do lookbehind.
 *
 * MONTADO POR PARTES DE PROPÓSITO: escrito como literal, o próprio padrão teria
 * `bg-amber-50` e `dark:bg-amber-950` no fonte — e a catraca de `cores.test.ts` e
 * esta mesma regra leem este arquivo. Uma guarda que se acusa ensina a ignorar a
 * guarda.
 */
function parDoCallout(propriedade: string, claro: string, escuro: string, alfa: boolean): RegExp {
  const semPrefixo = String.raw`(?<![\w:/!-])`
  const fimDaClasse = String.raw`(?![\w/-])`
  const escapar = (valor: string) => valor.replace('/', String.raw`\/`)
  const grupoAlfa = alfa ? String.raw`(\/\d+)?` : ''
  const mesmoAlfa = alfa ? String.raw`\1` : ''
  const classeClara = `${semPrefixo}${propriedade}-${escapar(claro)}${grupoAlfa}${fimDaClasse}`
  const classeEscura = `${semPrefixo}dark:${propriedade}-${escapar(escuro)}${mesmoAlfa}${fimDaClasse}`
  return new RegExp(`${classeClara}(?:(?=.*${classeEscura})|(?<=${classeEscura}.*))`, 'g')
}

export const PARES_PROIBIDOS: readonly ParProibido[] = [
  {
    nome: 'verde de sucesso cru',
    token: 'bg-sucesso / text-sucesso-texto (ou <Badge variant="sucesso">)',
    // O `(?![\w/-])` recusa `green-100/40` (véu) e `green-1000` (não existe), e
    // aceita o fim da classe, espaço, aspas ou crase.
    padrao: /\b(?:bg|text|border|ring|fill|stroke)-green-(?:100|800|950|300)(?![\w/-])/g,
  },
  {
    nome: 'texto branco cru',
    token: 'text-brand-dark-texto (o texto do cromo escuro)',
    padrao: /\btext-white(?![\w-])/g,
  },
  {
    nome: 'texto preto cru',
    token: 'text-brand-amarelo-texto (o texto sobre o amarelo da marca)',
    padrao: /\btext-black(?![\w-])/g,
  },
  // v1.66.4 — o PAR da caixa de atenção âmbar (ver `parDoCallout`). O fundo não
  // aceita `/NN`: o alfa do escuro já mora no valor do token.
  {
    nome: 'fundo cru da caixa de atenção âmbar',
    token: 'bg-callout-atencao',
    padrao: parDoCallout('bg', 'amber-50', 'amber-950/40', false),
  },
  {
    nome: 'texto cru da caixa de atenção âmbar',
    token: 'text-callout-atencao-texto',
    padrao: parDoCallout('text', 'amber-900', 'amber-200', true),
  },
  {
    nome: 'borda crua da caixa de atenção âmbar',
    token: 'border-callout-atencao-borda',
    padrao: parDoCallout('border', 'amber-300', 'amber-900', true),
  },
]

export type ExcecaoDeTinta = {
  arquivo: string
  /** A classe exata que fica, como aparece no código (ex.: `bg-green-100`). */
  trecho: string
  motivo: string
}

/**
 * As exceções de hoje. **Só encolhem.** Vazia é a meta — e é o estado em que a
 * F61 fechou.
 */
export const EXCECOES_DE_TINTA: readonly ExcecaoDeTinta[] = []

export type AchadoDeTinta = { arquivo: string; linha: number; classe: string; par: string; token: string }

/** Os usos proibidos de UM arquivo (texto já sem comentários). */
export function usosProibidos(arquivo: string, texto: string): AchadoDeTinta[] {
  const achados: AchadoDeTinta[] = []
  const linhas = texto.split('\n')
  for (let i = 0; i < linhas.length; i++) {
    // O trecho de classe: a linha partida nas aspas, crases e chaves (ver o topo).
    for (const trecho of linhas[i].split(/['"`{}]/)) {
      for (const par of PARES_PROIBIDOS) {
        for (const m of trecho.matchAll(par.padrao)) {
          achados.push({ arquivo, linha: i + 1, classe: m[0], par: par.nome, token: par.token })
        }
      }
    }
  }
  return achados
}

/**
 * A regra inteira: devolve as RECUSAS (vazio = verde). Tudo por parâmetro — é o
 * que deixa a sabotagem montar um selo sintético em memória.
 */
export function conferirTinta(
  fontes: readonly { arquivo: string; texto: string }[],
  excecoes: readonly ExcecaoDeTinta[] = EXCECOES_DE_TINTA,
): string[] {
  const recusas: string[] = []
  const usadas = new Set<ExcecaoDeTinta>()
  for (const { arquivo, texto } of fontes) {
    for (const achado of usosProibidos(arquivo, texto)) {
      const excecao = excecoes.find((e) => e.arquivo === arquivo && e.trecho === achado.classe)
      if (excecao) {
        usadas.add(excecao)
        continue
      }
      recusas.push(
        `${arquivo}:${achado.linha} escreve "${achado.classe}" (${achado.par}) — use ${achado.token}`,
      )
    }
  }
  for (const e of excecoes) {
    if (e.motivo.trim().length < 10) recusas.push(`exceção de tinta sem motivo: ${e.arquivo} "${e.trecho}"`)
    if (!usadas.has(e)) recusas.push(`exceção de tinta que não casa com nada: ${e.arquivo} "${e.trecho}"`)
  }
  return recusas
}
