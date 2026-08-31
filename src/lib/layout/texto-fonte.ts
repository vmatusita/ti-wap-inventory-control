// LER O PRÓPRIO CÓDIGO COMO TEXTO — o utilitário que os dois testes do sistema
// de design compartilham (F40).
//
// Este módulo não é importado por nenhuma tela: ele existe para
// `src/lib/layout/consistencia.test.ts`, `src/lib/dominio/cores.test.ts` e
// `scripts/design/medir.ts`, que afirmam sobre o CÓDIGO-FONTE (a
// `vitest.config.mts` roda em ambiente `node`, sem jsdom — é o molde de
// `sidebar-colapso.test.ts` e irmãos).
//
// O TERCEIRO CONSUMIDOR É DA REVISÃO DE 31/08/2026, e é a prova do parágrafo
// abaixo: `medir.ts` era um `.mjs` com uma CÓPIA desta função, e as duas já
// tinham divergido do que o teste media. Virou `.ts` rodado por `tsx` (o molde de
// `scripts/carac-relatorios.ts`) e passou a importar daqui. A régua de classes
// fez o mesmo caminho, para `regua-de-classes.ts`, ao lado deste arquivo.
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
 *
 * ⚠ E PELA MESMA RAZÃO PRECISA SABER QUANDO UMA `/` ABRE UM LITERAL DE REGEX.
 * Esta metade faltava até a revisão de 31/08/2026, e a falta tinha DUAS caras,
 * as duas silenciosas:
 *
 *   1. ASPAS DENTRO DE UMA CLASSE DE CARACTERES abrem string fantasma. Em
 *      `.replace(/[,()"']/g, '%')` (`src/lib/queries/compras.ts:68`) o scanner
 *      via a barra, concluía que não era comentário, copiava caractere a
 *      caractere e ABRIA STRING na aspas dupla que mora DENTRO da classe. A
 *      partir dali o resto do arquivo era lido com o estado errado, e todo
 *      comentário de verdade sobrevivia na saída.
 *
 *   2. BARRA ESCAPADA (`\/`) era lida como o `//` de comentário, truncando o
 *      literal e comendo o resto da linha — `url.replace(/^https?:\/\//, '')`
 *      (`src/lib/queries/dev.ts:51`).
 *
 * Medido nos 628 `.ts`/`.tsx` de `src`: 19 arquivos saíam diferentes do que
 * deviam, 15 deles terminando com o estado de string ABERTO. Nos 19, a leitura
 * errada era sempre a antiga. Nada disso derrubava teste — só fazia a guarda
 * medir outra coisa, que é o desfecho que o topo deste arquivo chama de o pior
 * possível.
 */

/**
 * Palavras-chave que PRECEDEM um valor — depois delas, `/` só pode abrir regex,
 * nunca ser divisão. `return /foo/`, `typeof /foo/`, `case /foo/:` — nenhuma tem
 * operando à esquerda da barra.
 */
const PALAVRA_PRECEDE_VALOR = new Set([
  'return',
  'typeof',
  'case',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'do',
  'else',
  'yield',
  'await',
  'instanceof',
])

/**
 * A `/` que vem a seguir abre um literal de regex, ou é outra coisa (divisão,
 * o `/>` de JSX auto-fechada, o `</` de fechamento de tag)?
 *
 * A heurística clássica pergunta pelo ÚLTIMO TOKEN SIGNIFICATIVO já escrito: se
 * ele é um OPERANDO — identificador, número, `)`, `]`, `}`, ou o fecho de uma
 * string —, a barra é divisão, porque operando não é seguido de outro valor sem
 * operador no meio. Senão (operador, pontuação, início do arquivo, ou uma das
 * palavras de `PALAVRA_PRECEDE_VALOR`) é regex.
 *
 * `foraAteAqui` é o que ESTE MÓDULO já produziu, e não o `texto` original: os
 * comentários já viraram espaço nele, então "o último token" nunca cai dentro de
 * um comentário morto.
 *
 * ⚠ DUAS AMBIGUIDADES FICAM, e ficam por serem indecidíveis olhando um caractere:
 *   · `>` — é o fim de `=>` (e aí `x => /foo/.test(x)` é regex) e também o fim de
 *     uma tag de abertura (e aí `<p>/preco/kg</p>` é texto). Nenhuma das duas dá
 *     para excluir sem quebrar a outra. Não há ocorrência do segundo caso nos 628
 *     arquivos de hoje.
 *   · `}` — é fim de objeto (divisão) e fim de bloco (poderia preceder regex).
 *     Tratado como operando, que é o que tokenizador de JS de verdade também faz.
 * Nas duas, o pior caso é o de sempre: a guarda mede errado UM arquivo. Se um dia
 * morderem, o sintoma aparece rodando `node scripts/design/medir.mjs` e comparando.
 */
function pareceInicioDeRegex(foraAteAqui: string): boolean {
  let j = foraAteAqui.length - 1
  while (j >= 0 && /\s/.test(foraAteAqui[j])) j--
  // Início do arquivo (ou só espaço antes): nada precede, então só pode ser um
  // valor — `/^abc$/` como primeira coisa do arquivo é regex.
  if (j < 0) return true

  const ultimo = foraAteAqui[j]

  // `</div>`, `</Foo>`, `</>` — o fechamento de tag/fragmento JSX. Sem este caso,
  // `<` cairia na regra genérica de operador (lá embaixo) e o scanner tentaria
  // ler a tag inteira como se fosse um literal de regex.
  if (ultimo === '<') return false

  // Fecha-parênteses, fecha-colchete, fecha-chave, dígito ou fim de string: todos
  // terminam um OPERANDO. `a() / 2`, `arr[0] / 2`, `{x} / 2`, `10 / 2`, `'a' / 2`
  // — a barra que segue é divisão.
  if (ultimo === ')' || ultimo === ']' || ultimo === '}') return false
  if (/[0-9]/.test(ultimo)) return false
  if (ultimo === "'" || ultimo === '"' || ultimo === '`') return false

  // Identificador ou palavra-chave: só decide olhando a PALAVRA inteira, não só o
  // último caractere — `typeof` termina em `f`, uma letra comum.
  if (/[A-Za-z_$]/.test(ultimo)) {
    let k = j
    while (k >= 0 && /[A-Za-z0-9_$]/.test(foraAteAqui[k])) k--
    return PALAVRA_PRECEDE_VALOR.has(foraAteAqui.slice(k + 1, j + 1))
  }

  // Qualquer outro símbolo — operador (`=`, `+`, `&&`, `?`, `:`…), abre-parênteses,
  // abre-colchete, abre-chave, vírgula, ponto e vírgula — só pode vir seguido de um
  // VALOR. A barra que segue é regex.
  return true
}

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

    if (c === '/' && pareceInicioDeRegex(fora)) {
      // Copia o literal INTEIRO sem reinterpretar o que está dentro — é
      // exatamente isto que faltava: `"` e `'` dentro da classe de caracteres
      // não abrem string, porque este bloco não devolve o controle ao laço
      // principal no meio do literal.
      fora += c // a `/` de abertura
      i++
      let dentroDeClasse = false // `[…]`: a `/` aqui dentro NÃO fecha o regex
      let fechou = false
      while (i < texto.length) {
        const rc = texto[i]
        // Quebra de linha literal: regex de verdade nunca contém uma. A
        // heurística acertou o CONTEXTO (esperava-se um valor) mas isto não é um
        // regex — devolve o controle ao laço sem consumir a quebra, em vez de
        // arrastar o "regex" pelo resto do arquivo.
        if (rc === '\n') break
        fora += rc
        if (rc === '\\') {
          // Escape: o caractere seguinte (inclusive `/` ou `]`) é literal e não
          // fecha classe nem regex. É o que faz `/^https?:\/\//` sobreviver
          // inteiro em vez de virar comentário no primeiro `\/`.
          i++
          if (i < texto.length) {
            fora += texto[i]
            i++
          }
          continue
        }
        i++
        if (rc === '[') dentroDeClasse = true
        else if (rc === ']') dentroDeClasse = false
        else if (rc === '/' && !dentroDeClasse) {
          fechou = true
          break
        }
      }
      if (fechou) {
        // As flags (`g`, `i`, `gm`…) são identificador — copiadas como código
        // normal, nunca como comentário.
        while (i < texto.length && /[a-zA-Z]/.test(texto[i])) {
          fora += texto[i]
          i++
        }
      }
      continue
    }

    fora += c
    i++
  }
  return fora
}
