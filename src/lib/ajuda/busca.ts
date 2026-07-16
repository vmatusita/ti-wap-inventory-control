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
