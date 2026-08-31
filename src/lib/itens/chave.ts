// A chave de deduplicação do nome de ITEM (F41) — espelho EXATO da função
// `public.item_chave(text)` da migration 0125.
//
// POR QUE ESTE ARQUIVO EXISTE. A partir da F41 o OPERADOR cadastra item no meio da
// movimentação (a policy de INSERT de `itens` passou de `e_admin()` para
// `pode_escrever()`, 0125). Cadastro aberto sem deduplicação vira catálogo com
// "Mochila", "mochila" e "Mochila " — três itens onde há um, e três saldos que não
// somam. Quem impede isso é o índice único sobre a coluna GERADA `itens.nome_chave`.
//
// E como a coluna é GERADA, não dá para pedir ao Postgres que normalize um valor de
// ENTRADA dentro de um `select … eq(…)` do PostgREST: a normalização do lado do
// servidor acontece AQUI, e a igualdade com o SQL é PROVADA por `chave-sql.test.ts`.
//
// ⚠ Este arquivo é o IRMÃO de `src/lib/colaboradores/chave.ts` (F37 · D5), e é uma
// cópia deliberada, não um descuido: as duas chaves normalizam a MESMA expressão,
// mas pertencem a cadastros diferentes e podem divergir um dia (item nunca vai
// precisar de matrícula; pessoa nunca vai precisar de unidade de medida). Fundi-las
// num módulo só amarraria dois vocabulários que só por acaso coincidem hoje — e a
// guarda TS↔SQL de cada um aponta para a SUA migration, que é o que garante que
// nenhuma das duas mude sem a outra saber.
//
// AS TRÊS ARMADILHAS QUE A EXPRESSÃO EVITA (as três já derrubaram gente):
//
//   1. `\s` NÃO é o mesmo conjunto nos dois lados. No Postgres `\s` é `[[:space:]]`
//      (sensível a locale); no JavaScript inclui NBSP (U+00A0) e vários espaços
//      Unicode. Um nome colado de planilha com NBSP normalizaria diferente em cada
//      lado — e o item duplicaria, em silêncio. Por isso os dois lados usam a MESMA
//      classe explícita: espaço, \t, \n, \r, \f, \v.
//
//   2. `String.prototype.trim()` apara espaço Unicode; `btrim(text)` do Postgres
//      apara SÓ o espaço ASCII. Daí o `aparar()` abaixo, feito à mão. E o aparo vem
//      DEPOIS do colapso nos dois lados, senão `'\tMochila'` viraria ` mochila`, com
//      um espaço grudado na chave.
//
//   3. Unicode tem DUAS formas legítimas para o mesmo nome. "Óptico" digitado no
//      Windows vem PRECOMPOSTO (NFC: `Ó` é um código só); colado do macOS ou de
//      certos exports vem DECOMPOSTO (NFD: `O` + acento combinante). A tabela de
//      acentos só conhece a forma precomposta, então sem o `normalize` a versão NFD
//      atravessa intacta e vira `óptico` em vez de `optico` — dois itens onde há um.
//
// A ordem das operações é a da função SQL, na mesma sequência:
//   normalize(NFC) → translate(acentos) → colapsa espaço → apara espaço → minúsculas
//
// SE OS DOIS LADOS DIVERGIREM mesmo assim, o efeito é uma busca que não acha: o
// servidor conclui "não existe" e tenta inserir — e aí o ÍNDICE ÚNICO do banco
// recusa, com a frase em pt-BR de `MSG_ITEM_DUPLICADO`. Nunca um item errado
// selecionado, nunca uma duplicata gravada. A guarda do banco é a linha que vale.

/** Acentuadas → sem acento, na ORDEM da migration 0125. Um caractere de cada lado. */
export const ACENTOS_DE =
  'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ'
export const ACENTOS_PARA =
  'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'

/** A classe de espaço da migration — explícita de propósito (ver armadilha 1). */
export const ESPACOS_DA_CHAVE = [' ', '\t', '\n', '\r', '\f', '\v'] as const

const MAPA = new Map<string, string>(
  [...ACENTOS_DE].map((c, i) => [c, ACENTOS_PARA[i]]),
)
const RE_ESPACOS = /[ \t\n\r\f\v]+/g

/** `btrim(x)` do Postgres: apara SÓ o espaço ASCII, nunca espaço Unicode. */
function aparar(texto: string): string {
  return texto.replace(/^ +/, '').replace(/ +$/, '')
}

/**
 * A chave normalizada de um nome de item: minúsculas, sem acento, espaços colapsados
 * e aparados. Espelho de `public.item_chave(text)` (migration 0125).
 *
 * Devolve `''` para entrada vazia ou só de espaço. O Zod (`itemSchema`) já recusa
 * nome em branco antes de chegar aqui, então `''` só aparece em código defensivo.
 */
export function chaveItem(nome: string | null | undefined): string {
  if (!nome) return ''
  let saida = ''
  // `normalize('NFC')` primeiro, espelhando `normalize(p_nome, NFC)` do SQL — sem
  // ele, o mesmo nome em NFD não casa com a versão precomposta.
  for (const c of nome.normalize('NFC')) saida += MAPA.get(c) ?? c
  return aparar(saida.replace(RE_ESPACOS, ' ')).toLowerCase()
}
