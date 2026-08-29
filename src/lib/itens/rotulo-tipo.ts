// F39 · §E — o rótulo de um TIPO de item, a partir do slug gravado.
//
// POR QUE ESTE MÓDULO EXISTE. Até a F38 o vocabulário do checklist de devolução
// morava numa lista fixa em `lib/dominio.ts`, com um mapa de rótulos ao lado e uma
// função que traduzia slug → rótulo caindo no próprio slug quando não achava.
// A F37 pôs a mesma lista no banco (`tipos_item`, 0114,
// semeada com exatamente os mesmos 7 slugs e rótulos) e a F38 fez o checklist vir
// de lá. Esta fase remove a constante: o vocabulário passa a ser UM só, e ele mora
// no banco, onde o administrador acrescenta o que quiser.
//
// O QUE NÃO PODE MUDAR: nenhum rótulo que o operador vê hoje. `movimentacoes.
// itens_faltantes` e `pendencias_item.item` guardam SLUGS — texto livre, sem FK —,
// e é o `?? slug` daqui que mantém legível um registro antigo cujo tipo não existe
// mais no catálogo. Ele é o mesmo fallback de antes, palavra por palavra.
//
// MÓDULO PURO, e é isso que faz a fronteira funcionar: quem exibe PASSADO carrega o
// mapa de `listarTiposItem()` (TODOS os tipos, inclusive os desativados — histórico
// é fato) e o passa por PROP para o Client Component. Nada de Client Component
// importando query, nada de Server Component importando valor de módulo cliente
// (`fronteira-rsc.test.ts`). Quem oferece ESCOLHA continua com `listarTiposItemAtivos`.

/** slug → rótulo. Vazio é legítimo: aí todo slug cai no próprio slug. */
export type MapaRotulosTipo = Readonly<Record<string, string>>

/**
 * O mapa, a partir do catálogo lido do banco.
 *
 * ⚠ OBJETO COMUM, E ISSO NÃO É DESCUIDO. A primeira versão usava
 * `Object.create(null)` para fechar o furo do slug `toString`; o navegador
 * derrubou a ideia em 30 segundos: este mapa ATRAVESSA A FRONTEIRA RSC como prop
 * (a tabela de Entradas do relatório, a fila de pendências, o resumo da revisão),
 * e o React recusa protótipo nulo com "Only plain objects … can be passed to
 * Client Components" — o relatório caía para render no cliente. Quem fecha o furo
 * é o `hasOwnProperty` de `rotuloTipoItem`, que é o lugar certo: a proteção mora
 * na LEITURA, e assim vale também para mapa montado à mão.
 */
export function mapaRotulosTipo(
  tipos: readonly { slug: string; rotulo: string }[],
): MapaRotulosTipo {
  const mapa: Record<string, string> = {}
  for (const t of tipos) mapa[t.slug] = t.rotulo
  return mapa
}

/**
 * O rótulo de um slug, com FALLBACK PELO SLUG CRU — o mesmo `?? codigo` que
 * a função antiga fazia, e pela mesma razão: slug histórico sem tipo
 * correspondente continua legível na tela em vez de sumir.
 *
 * A conferência é por PROPRIEDADE PRÓPRIA, e não pelo `??`: assim o fallback vale
 * também quando o mapa chega como objeto literal comum (um teste, um mock), e não
 * só quando veio de `mapaRotulosTipo`.
 */
export function rotuloTipoItem(slug: string, mapa: MapaRotulosTipo): string {
  return Object.prototype.hasOwnProperty.call(mapa, slug) ? mapa[slug] : slug
}
