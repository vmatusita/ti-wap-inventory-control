// Normalizacao de texto para a busca da pagina /ajuda (B9). Purissima e minuscula
// de proposito: e o UNICO ponto compartilhado entre o servidor (que grava o texto
// pesquisavel no atributo `data-ajuda-texto` de cada secao) e o cliente (que
// compara a consulta digitada). Tirar acento + caixa deixa "manutencao" achar
// "manutencao" e "SAIDA" achar "Saida". Sem dependencia — Intl/String nativos.
// Faixa U+0300–U+036F = marcas diacriticas combinantes (o que o NFD separa das
// letras). Construida por RegExp(string) para nao depender de bytes literais.
const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')

export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(DIACRITICOS, '').toLowerCase().trim()
}

/**
 * O PREDICADO da busca da documentação — um só, para os dois lados.
 *
 * Mora aqui, e não em `indice.ts`, porque `indice.ts` é só-servidor e quem
 * filtra de verdade é o CLIENTE (`AjudaBusca`, sobre o `data-ajuda-texto` que o
 * servidor gravou no DOM). Antes a regra estava escrita duas vezes — a versão
 * pura, coberta por `indice.test.ts`, e a versão do DOM, que é a que roda no
 * navegador e não era testada. É a mesma armadilha que a revisão da F20 já
 * pegou em `resolverDestinoLegado`: um lugar só, e é o lugar testado.
 *
 * `textoIndexado` chega JÁ normalizado (é o que o servidor gravou); a consulta
 * é normalizada aqui. Consulta vazia casa com tudo.
 */
export function casaBusca(textoIndexado: string, consulta: string): boolean {
  const q = normalizarBusca(consulta)
  return q === '' || textoIndexado.includes(q)
}
