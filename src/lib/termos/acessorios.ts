// F39 — a LINHA de acessórios que vai ao papel, isolada como função pura.
//
// POR QUE AQUI E NÃO DENTRO DA ACTION: é a mesma razão escrita no cabeçalho de
// `termos/preparo.ts`. `prepararTermo` é uma Server Action que depende de sessão,
// cargo e banco; em teste ela exigiria tudo isso, e por isso ninguém escreveria os
// casos de borda que importam — o item sem tipo, o tipo desativado, a linha que
// estoura o teto do campo. Aqui eles são triviais de escrever, e estão escritos.
//
// A action continua sendo o único lugar que LÊ o banco; ela só delega o julgamento.
//
// O TETO É RESPONSABILIDADE DESTA FUNÇÃO, NÃO DO ZOD. `acessorios` cabe em 600 e
// `outros_componentes` em 400 (`validators/termo.ts`). Deixar estourar faria
// `gerarTermo` morrer em "Há campos inválidos. Revise o termo." — uma mensagem que
// não diz o que fazer, num campo que o operador nem digitou. Estourando, corta-se
// no último item INTEIRO que cabe e acrescenta-se " e mais N".

/** Um lançamento vinculado à movimentação do termo (F38 · `movimentacao_id`). */
export type LancamentoDeAcessorio = {
  /** O tipo do ITEM do catálogo (`itens.tipo_id`, F37). Anulável — nasce nulo. */
  tipo_id: number | null
  quantidade: number
}

/** O que esta regra precisa saber de um tipo do catálogo (`tipos_item`). */
export type TipoDeAcessorio = {
  id: number
  rotulo: string
  ordem: number
}

export type LinhaDeAcessorios = {
  /** A linha pronta para o campo do termo. Vazia quando não há o que listar. */
  linha: string
  /**
   * Quantos LANÇAMENTOS ficaram de fora por não ter tipo — é este número que
   * alimenta o aviso do diálogo ("N item(ns) … classifique em Administração →
   * Itens"). Conta linhas de lançamento, não quantidades: cada linha é um item
   * que foi junto, e é assim que o operador o vê na tela.
   */
  descartados: number
}

/** O separador da linha única (D10). */
const SEPARADOR = ', '

/**
 * Monta a linha única de acessórios do termo.
 *
 * · agrupa por tipo e SOMA as quantidades — documento assinado que diz "Mouse"
 *   quando saíram dois está errado, e a quantidade é barata;
 * · ordena pela `ordem` do tipo, com desempate estável pelo rótulo
 *   (`localeCompare('pt-BR')`) e, no empate residual, pelo `id`. Sem uma ordem
 *   TOTAL o mesmo lote geraria linhas diferentes em chamadas diferentes — o mesmo
 *   defeito que o `.order('id')` de `prepararTermo` já documenta;
 * · descarta lançamento SEM tipo (D8) e o conta;
 * · tipo DESATIVADO entra: o histórico é fato, e a `0114` nem sequer permite
 *   apagar tipo citado. Quem chama passa o catálogo inteiro, e esta função não
 *   conhece a coluna `ativo`.
 */
export function montarLinhaDeAcessorios(
  lancamentos: readonly LancamentoDeAcessorio[],
  tipos: readonly TipoDeAcessorio[],
  limite: number,
): LinhaDeAcessorios {
  const porId = new Map(tipos.map((t) => [t.id, t]))
  const somas = new Map<number, number>()
  let descartados = 0

  for (const l of lancamentos) {
    // Tipo nulo, ou tipo que não existe no catálogo recebido: o termo não tem
    // como nomeá-lo, então ele fica de fora — e é contado, para o aviso existir.
    if (l.tipo_id == null || !porId.has(l.tipo_id)) {
      descartados++
      continue
    }
    // Quantidade não-positiva não entra. Não deveria chegar aqui (o inverso de
    // estorno é excluído na leitura), mas somar negativo imprimiria "Mouse (-1)"
    // num papel assinado — e o custo desta linha é zero.
    if (!(l.quantidade > 0)) continue
    somas.set(l.tipo_id, (somas.get(l.tipo_id) ?? 0) + l.quantidade)
  }

  const partes = [...somas.entries()]
    .map(([id, soma]) => ({ tipo: porId.get(id)!, soma }))
    .sort(
      (a, b) =>
        a.tipo.ordem - b.tipo.ordem ||
        a.tipo.rotulo.localeCompare(b.tipo.rotulo, 'pt-BR') ||
        a.tipo.id - b.tipo.id,
    )
    .map(({ tipo, soma }) => (soma === 1 ? tipo.rotulo : `${tipo.rotulo} (${soma})`))

  return { linha: cortarNoLimite(partes, limite), descartados }
}

/**
 * Junta as partes respeitando o teto do campo.
 *
 * Cabendo tudo, junta tudo. Estourando, corta no último item INTEIRO que cabe e
 * acrescenta " e mais N" — com o resultado DENTRO do limite, o que é conferido
 * item a item (o sufixo cresce de dígito quando N passa de 9, e ignorar isso
 * devolveria uma linha um caractere maior que o teto).
 */
function cortarNoLimite(partes: readonly string[], limite: number): string {
  if (partes.length === 0) return ''
  const tudo = partes.join(SEPARADOR)
  if (tudo.length <= limite) return tudo

  for (let k = partes.length - 1; k >= 1; k--) {
    const candidato = `${partes.slice(0, k).join(SEPARADOR)} e mais ${partes.length - k}`
    if (candidato.length <= limite) return candidato
  }

  // Nem UM rótulo cabe no campo. Inalcançável com os tetos reais (600/400) e os
  // rótulos do catálogo, mas devolver algo maior que o limite derrubaria a
  // geração no Zod — que é exatamente o que esta função existe para impedir.
  const soContagem = `${partes.length} acessórios`
  return soContagem.length <= limite ? soContagem : ''
}
