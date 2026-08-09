import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'

// ATV-03 (F30) — as regras da seleção múltipla da lista de ativos, fora do
// componente porque são exatamente a parte que erra em silêncio.
//
// O nó: a página de /ativos mostra até 100 linhas (`TAMANHOS_PAGINA`) e o lote de
// movimentação aceita 30. "Marcar todos" numa página de 100, portanto, NÃO é
// "marcar todos" — é "marcar o que couber e dizer o que ficou de fora". Sem uma
// regra escrita e testada isso vira um `setState` que enche a barra com 100 ids e
// só quebra lá na frente, dentro do wizard.
//
// A seleção é POR PÁGINA (decisão registrada em docs/DECISOES.md): trocar de
// página, filtro ou busca limpa. Preservar entre páginas é backlog.

/** O teto da seleção é o teto do lote de movimentação — é para lá que ela vai. */
export const MAX_SELECAO = MAX_LOTE_MOVIMENTACAO

export type ResultadoSelecao = {
  /** O novo conjunto de ids selecionados. */
  proxima: Set<string>
  /** Quantos entraram de fato nesta operação. */
  entraram: number
  /** Quantos não entraram porque o teto encheu. */
  foraPeloTeto: number
}

/**
 * Marca ou desmarca UM id. Desmarcar nunca recusa; marcar recusa quando o teto
 * já está cheio (e `foraPeloTeto` vira 1, que é o gatilho do aviso).
 */
export function alternarSelecao(
  atual: ReadonlySet<string>,
  id: string,
  marcar: boolean,
  teto: number = MAX_SELECAO,
): ResultadoSelecao {
  const proxima = new Set(atual)
  if (!marcar) {
    proxima.delete(id)
    return { proxima, entraram: 0, foraPeloTeto: 0 }
  }
  if (proxima.has(id)) return { proxima, entraram: 0, foraPeloTeto: 0 }
  if (proxima.size >= teto) return { proxima, entraram: 0, foraPeloTeto: 1 }
  proxima.add(id)
  return { proxima, entraram: 1, foraPeloTeto: 0 }
}

/**
 * O checkbox do cabeçalho. Marcar leva o que couber, na ordem da página;
 * desmarcar tira apenas os desta página (a seleção de outra origem, se um dia
 * existir, não é assunto deste botão).
 */
export function marcarTodosDaPagina(
  atual: ReadonlySet<string>,
  idsDaPagina: readonly string[],
  marcar: boolean,
  teto: number = MAX_SELECAO,
): ResultadoSelecao {
  const proxima = new Set(atual)
  if (!marcar) {
    for (const id of idsDaPagina) proxima.delete(id)
    return { proxima, entraram: 0, foraPeloTeto: 0 }
  }
  let entraram = 0
  let foraPeloTeto = 0
  for (const id of idsDaPagina) {
    if (proxima.has(id)) continue
    if (proxima.size >= teto) {
      foraPeloTeto++
      continue
    }
    proxima.add(id)
    entraram++
  }
  return { proxima, entraram, foraPeloTeto }
}

/**
 * O estado do checkbox do cabeçalho. `'indeterminate'` é o valor que o Checkbox
 * do shadcn entende — parcial precisa ser visível, senão o operador não sabe se
 * clicar vai marcar ou desmarcar.
 */
export function estadoDoCabecalho(
  selecionados: ReadonlySet<string>,
  idsDaPagina: readonly string[],
): boolean | 'indeterminate' {
  if (idsDaPagina.length === 0) return false
  let marcados = 0
  for (const id of idsDaPagina) if (selecionados.has(id)) marcados++
  if (marcados === 0) return false
  return marcados === idsDaPagina.length ? true : 'indeterminate'
}

/**
 * Poda os ids que não estão mais na página aberta.
 *
 * Sem isto a barra mente: trocar de página/filtro mantém o `Set` do componente
 * (o React reaproveita a árvore quando só os dados mudam) e ela anunciaria
 * "5 selecionados" com duas linhas na tela — e "Movimentar" levaria ativos que o
 * operador não está mais vendo. Devolve o MESMO objeto quando nada muda, para
 * não disparar re-render à toa.
 */
export function podarForaDaPagina(
  atual: ReadonlySet<string>,
  idsDaPagina: readonly string[],
): Set<string> {
  const daPagina = new Set(idsDaPagina)
  let mudou = false
  const proxima = new Set<string>()
  for (const id of atual) {
    if (daPagina.has(id)) proxima.add(id)
    else mudou = true
  }
  return mudou ? proxima : (atual as Set<string>)
}

/**
 * O texto de "Copiar patrimônios": um por linha, na ordem da página.
 * Ativo sem patrimônio (F7E) não tem o que copiar — sai da lista e é CONTADO,
 * para o toast poder dizer por que copiou menos linhas do que o selecionado.
 */
export function textoCopiavel(patrimonios: readonly (string | null)[]): {
  texto: string
  copiados: number
  semPatrimonio: number
} {
  const comValor = patrimonios.filter((p): p is string => Boolean(p && p.trim()))
  return {
    texto: comValor.join('\n'),
    copiados: comValor.length,
    semPatrimonio: patrimonios.length - comValor.length,
  }
}
