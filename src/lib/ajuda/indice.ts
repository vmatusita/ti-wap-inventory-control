// Indice de busca da documentacao (F20 · M3). FUNCOES PURAS: nada de DOM, nada
// de React — cabem no ambiente `node` do Vitest, como `busca.ts` e `ancora.ts`.
//
// Dois consumidores, um so lugar de verdade:
//  - a busca da propria /ajuda (servidor renderiza o texto pesquisavel no DOM e
//    o cliente filtra, mesma mecanica da F6B);
//  - o grupo "Ajuda" da paleta Ctrl+K, que é CLIENT e por isso recebe a versao
//    LEVE (`indicePaleta`) por prop — sem corpo de texto, para não empurrar 56 KB
//    de conteúdo para dentro do bundle de toda tela do app.
import { casaBusca, normalizarBusca } from '@/lib/ajuda/busca'
import { PAGINAS } from '@/lib/ajuda/registry'
import type { Bloco, CategoriaAjuda, EntradaPaleta, PaginaAjuda } from '@/lib/ajuda/tipos'

// O tipo mora em `tipos.ts` (puro), que e o que a paleta importa; reexportado
// aqui porque e daqui que sai o valor.
export type { EntradaPaleta }

export function textoDoBloco(bloco: Bloco): string {
  switch (bloco.tipo) {
    case 'paragrafo':
    case 'nota':
      return bloco.texto
    case 'titulo':
      return bloco.texto
    case 'lista':
      return bloco.itens.join(' ')
    case 'passos':
      return [bloco.titulo ?? '', ...bloco.itens].join(' ')
    case 'glossario':
      return bloco.itens.map((v) => `${v.rotulo} ${v.descricao}`).join(' ')
    case 'movimentacoes':
      return bloco.itens
        .map((v) => `${v.rotulo} ${v.efeito} ${v.campos.map((c) => c.rotulo).join(' ')}`)
        .join(' ')
    case 'tabela':
      return [bloco.legenda ?? '', ...bloco.colunas, ...bloco.linhas.flat()].join(' ')
    case 'atalhos':
      return bloco.itens
        .map((a) => `${a.teclas} ${a.acao} ${a.observacao ?? ''}`)
        .join(' ')
    case 'sintomas':
      return bloco.itens
        .map((s) => `${s.sintoma} ${s.causa} ${s.saida.join(' ')}`)
        .join(' ')
    // Links são navegação, não conteúdo: entram no índice pelo texto do rótulo
    // apenas quando ele existe (senão o rótulo é o título da página de destino,
    // que já é pesquisável por conta própria).
    case 'links':
      return bloco.itens.map((r) => r.texto ?? '').join(' ')
  }
}

/** Todo o texto de uma página, já normalizado para a busca. */
export function textoDaPagina(pagina: PaginaAjuda): string {
  const bruto = [
    pagina.titulo,
    pagina.resumo,
    ...(pagina.termos ?? []),
    ...pagina.blocos.map(textoDoBloco),
  ].join(' ')
  return normalizarBusca(bruto)
}

export type EntradaIndice = {
  slug: string
  titulo: string
  resumo: string
  categoria: CategoriaAjuda
  /** Texto completo já normalizado (o que a consulta procura). */
  texto: string
}

export function construirIndice(paginas: readonly PaginaAjuda[] = PAGINAS): EntradaIndice[] {
  return paginas.map((p) => ({
    slug: p.slug,
    titulo: p.titulo,
    resumo: p.resumo,
    categoria: p.categoria,
    texto: textoDaPagina(p),
  }))
}

/**
 * Consulta vazia devolve tudo (mesma semântica de `filtrarSecoes`, da F6B).
 * O casamento é `casaBusca` (busca.ts) — a MESMA função que `AjudaBusca` roda
 * sobre o `data-ajuda-texto` no navegador. Enquanto for uma só, testar esta é
 * testar aquela.
 */
export function filtrarIndice(
  indice: readonly EntradaIndice[],
  consulta: string,
): EntradaIndice[] {
  return indice.filter((e) => casaBusca(e.texto, consulta))
}

/**
 * Projeção LEVE para o cliente (paleta Ctrl+K). Sem o corpo do texto: o que a
 * paleta precisa achar é a PÁGINA certa, e o operador continua a busca dentro
 * dela. `chave` já vem normalizada — o cliente só compara. O TIPO mora em
 * `tipos.ts`, o único módulo daqui que um Client Component pode importar.
 */
export function indicePaleta(paginas: readonly PaginaAjuda[] = PAGINAS): EntradaPaleta[] {
  return paginas.map((p) => ({
    slug: p.slug,
    titulo: p.titulo,
    categoria: p.categoria,
    chave: normalizarBusca([p.titulo, p.resumo, ...(p.termos ?? [])].join(' ')),
  }))
}

/**
 * O índice da paleta computado UMA vez por instância do servidor. O
 * `(app)/layout.tsx` é o shell de TODAS as rotas do app: chamar `indicePaleta()`
 * ali normalizava as 33 páginas a cada request de cada tela, para um valor que
 * nunca muda entre deploys (achado da revisão dos 8 commits da F20).
 */
export const INDICE_PALETA: readonly EntradaPaleta[] = indicePaleta()
