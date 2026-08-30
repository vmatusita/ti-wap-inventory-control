// LER O PRÓPRIO CÓDIGO COMO TEXTO — o utilitário que os dois testes do sistema
// de design compartilham (F40).
//
// Este módulo não é importado por nenhuma tela: ele existe para
// `src/lib/layout/consistencia.test.ts` e `src/lib/dominio/cores.test.ts`, que
// afirmam sobre o CÓDIGO-FONTE (a `vitest.config.mts` roda em ambiente `node`,
// sem jsdom — é o molde de `sidebar-colapso.test.ts` e irmãos).
//
// POR QUE UM MÓDULO, e não uma cópia em cada teste: o padrão da casa é replicar
// o idioma em vez de centralizar um utilitário, e ele vale para funções de três
// linhas. Esta tem quarenta e é um PARSER — duas cópias divergiriam, e a
// divergência aqui não faz o teste falhar: faz ele medir outra coisa em silêncio,
// que é o pior desfecho possível para uma guarda.

/**
 * O arquivo sem os COMENTÁRIOS, preservando o número de cada linha.
 *
 * POR QUE ISTO EXISTE, e a prova está na linha de base da F40: a varredura
 * ingênua por `<h1` neste repositório devolve 22, mas só 19 são `<h1>` de
 * verdade — os outros três são comentários que citam `<h1>` em prosa. O mesmo
 * vale para a cor: `src/lib/dominio.ts` documenta em comentário os hex que a F32
 * aposentou (`#ea580c`), e uma guarda que os conte estaria medindo a HISTÓRIA em
 * vez do código.
 *
 * Isto não afrouxa nada: comentário não renderiza. Código comentado também não —
 * e se voltar a valer, volta sem os `//` e a regra o pega.
 *
 * O conteúdo vira ESPAÇO em vez de sumir, para que "linha 274" continue sendo a
 * linha 274 do arquivo de verdade.
 *
 * É um scanner caractere a caractere, e não um regex, porque precisa saber
 * quando está DENTRO de uma string: `const s = '// isto é string'` não é
 * comentário, e um `.replace(/\/\/.*$/gm, '')` comeria metade da linha.
 */
export function semComentarios(texto: string): string {
  let fora = ''
  let i = 0
  let emTexto: string | null = null
  while (i < texto.length) {
    const c = texto[i]
    const proximo = texto[i + 1]

    if (emTexto) {
      fora += c
      if (c === '\\') {
        fora += proximo ?? ''
        i += 2
        continue
      }
      if (c === emTexto) emTexto = null
      i++
      continue
    }

    if (c === "'" || c === '"' || c === '`') {
      emTexto = c
      fora += c
      i++
      continue
    }

    if (c === '/' && proximo === '/') {
      while (i < texto.length && texto[i] !== '\n') {
        fora += ' '
        i++
      }
      continue
    }

    if (c === '/' && proximo === '*') {
      while (i < texto.length && !(texto[i] === '*' && texto[i + 1] === '/')) {
        fora += texto[i] === '\n' ? '\n' : ' '
        i++
      }
      fora += '  '
      i += 2
      continue
    }

    fora += c
    i++
  }
  return fora
}
