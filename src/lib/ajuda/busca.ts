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
 * O PREDICADO da busca — um só, para os dois lados e para os dois textos.
 *
 * Mora aqui, e não em `indice.ts`, porque `indice.ts` é só-servidor e quem
 * filtra de verdade é o CLIENTE (`AjudaBusca`, sobre o `data-ajuda-texto` que o
 * servidor gravou no DOM). Antes a regra estava escrita duas vezes — a versão
 * pura, coberta por `indice.test.ts`, e a versão do DOM, que é a que roda no
 * navegador e não era testada. É a mesma armadilha que a revisão da F20 já
 * pegou em `resolverDestinoLegado`: um lugar só, e é o lugar testado.
 *
 * ⚠ NORMALIZA OS **DOIS** LADOS, e a segunda normalização é a correção da
 * revisão de 31/08/2026. Até aqui a função normalizava só a consulta, e o
 * contrato "`textoIndexado` chega JÁ normalizado" existia apenas nesta frase —
 * a assinatura aceita `string` dos dois lados e não tinha como cobrá-lo. Os
 * dois chamadores de `/ajuda` cumpriam (o servidor grava normalizado no
 * `data-ajuda-texto`; a paleta passa a `chave` que `indice.ts` já normalizou),
 * mas as CINCO tabelas de administração passavam o texto CRU da linha — e a
 * busca simplesmente não achava ninguém:
 *
 *     casaBusca('João Silva 12345 Financeiro', 'João Silva')
 *       → 'joao silva' ⊄ 'João Silva 12345 Financeiro'  → false
 *
 * Digitar o nome exato da pessoa devolvia nada; só um fragmento minúsculo e sem
 * acento no MEIO da palavra ("ilva") casava. Buscar por "Silva" também falhava,
 * pelo "S" maiúsculo. Remendar tela a tela deixaria a próxima tabela cair na
 * mesma armadilha, então a normalização passou a ser responsabilidade DAQUI.
 *
 * Custa nada para quem já cumpria o contrato: `normalizarBusca` é idempotente
 * (NFD é idempotente por definição, e depois do `replace` não sobra diacrítico
 * para o `toLowerCase` reintroduzir), então texto já normalizado atravessa
 * inalterado. Consulta vazia continua casando com tudo.
 */
export function casaBusca(textoIndexado: string, consulta: string): boolean {
  const q = normalizarBusca(consulta)
  return q === '' || normalizarBusca(textoIndexado).includes(q)
}
