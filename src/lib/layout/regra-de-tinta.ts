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
    for (const par of PARES_PROIBIDOS) {
      for (const m of linhas[i].matchAll(par.padrao)) {
        achados.push({ arquivo, linha: i + 1, classe: m[0], par: par.nome, token: par.token })
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
