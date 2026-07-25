// Indice de busca da documentacao (F20 · M3, redimensionado em 25/07/2026).
// FUNCOES PURAS: nada de DOM, nada de React — cabem no ambiente `node` do
// Vitest, como `busca.ts` e `ancora.ts`.
//
// UMA CHAVE, DOIS CONSUMIDORES. `indicePaleta()` produz a unica chave
// pesquisavel da documentacao, e ela serve:
//  - a busca da propria /ajuda — o servidor grava a chave no `data-ajuda-texto`
//    de cada card e o cliente filtra o DOM com `casaBusca`;
//  - o grupo "Ajuda" da paleta Ctrl+K, que e CLIENT e recebe a chave por prop
//    (via `INDICE_PALETA`, no `(app)/layout.tsx`).
// Ter uma so e o que faz o teste provar o que o navegador executa: o
// `indice.test.ts` filtra `INDICE_PALETA`, o valor literalmente emitido no
// atributo.
//
// O QUE ENTRA NA CHAVE: titulo, resumo, os `termos` (sinonimos curados) e o
// VOCABULARIO derivado dos blocos — rotulo de `glossario`, rotulo e nome de
// campo de `movimentacoes`, teclas e acao de `atalhos`, e a linha de `sintoma`.
//
// O QUE NAO ENTRA, E POR QUE: descricao de glossario, efeito de movimentacao,
// observacao de atalho, causa e saida de sintoma, paragrafo, nota, lista,
// passos, titulo de bloco, tabela e links. Tudo isso e PROSA, e prosa nao
// filtra: com o corpo indexado, 111 de 274 consultas devolviam 8+ das 33
// paginas e a mediana era 6 — o operador digitava e voltava a ler a lista
// inteira. Medido em 25/07/2026: corpo inteiro 208.525 caracteres (63.399
// bytes gzip por request, rota dinamica) contra 7.810 (3.102) desta chave.
// "emprestado" ia de 9 cards para 1; "em manutencao", de 10 para 1;
// "notebook", de 8 para 1. Numeros e decisao em docs/DECISOES.md.
//
// Se voce veio acrescentar um bloco a chave: `indice.test.ts` tem um teto de
// bytes e uma guarda semantica que falham quando prosa volta a entrar. Elas
// existem de proposito — leia a decisao antes de afrouxa-las.
import { normalizarBusca } from '@/lib/ajuda/busca'
import { PAGINAS } from '@/lib/ajuda/registry'
import type { Bloco, EntradaPaleta, PaginaAjuda } from '@/lib/ajuda/tipos'

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

/**
 * Todo o texto de uma página, já normalizado.
 *
 * NÃO tem consumidor de produção — e isso é deliberado, não esquecimento. É o
 * veículo de asserção dos testes de conteúdo (`conteudo/comecar.test.ts`,
 * `gestao.test.ts`, `referencia.test.ts` e `indice.test.ts`), que provam que
 * cada página DIZ o que promete. Apagá-la obriga três suítes a remontar o texto
 * à mão. Desde 25/07/2026 a chave pesquisável não é mais este texto — ver o
 * cabeçalho do módulo.
 */
export function textoDaPagina(pagina: PaginaAjuda): string {
  const bruto = [
    pagina.titulo,
    pagina.resumo,
    ...(pagina.termos ?? []),
    ...pagina.blocos.map(textoDoBloco),
  ].join(' ')
  return normalizarBusca(bruto)
}

/**
 * O VOCABULÁRIO de um bloco — rótulo e nome, nunca prosa. É o que separa esta
 * função de `textoDoBloco`, e essa diferença é a mudança inteira de 25/07/2026.
 *
 * Cada caso diz explicitamente o que NÃO leva, porque é sempre por aí que a
 * chave reinfla: `glossario` leva o `rotulo` e nunca a `descricao`;
 * `movimentacoes` leva o `rotulo` e o nome dos campos e nunca o `efeito`;
 * `atalhos` leva as teclas e a ação e nunca a `observacao`; `sintomas` leva a
 * linha do `sintoma` — a única parte do corpus escrita na voz literal do
 * operador ("Import bloqueado…") — e nunca a `causa` nem a `saida`.
 *
 * Os 11 casos são enumerados sem `default`, como em `textoDoBloco`: um `Bloco`
 * novo quebra a compilação e força a decisão, em vez de cair calado em `[]`.
 *
 * NÃO é exportada: o que a cobre são os testes de comportamento de
 * `indice.test.ts` (a trava de classe dos rótulos de domínio, o caso 'atrelar'
 * e a guarda semântica de prosa). Exportá-la só para testar seria criar mais um
 * símbolo sem consumidor de produção.
 */
function vocabularioDoBloco(bloco: Bloco): string[] {
  switch (bloco.tipo) {
    case 'glossario':
      return bloco.itens.map((v) => v.rotulo)
    case 'movimentacoes':
      return bloco.itens.flatMap((v) => [v.rotulo, ...v.campos.map((c) => c.rotulo)])
    case 'atalhos':
      return bloco.itens.map((a) => `${a.teclas} ${a.acao}`)
    case 'sintomas':
      return bloco.itens.map((s) => s.sintoma)
    case 'paragrafo':
    case 'nota':
    case 'lista':
    case 'passos':
    case 'titulo':
    case 'tabela':
    case 'links':
      return []
  }
}

/**
 * A chave pesquisável de cada página — uma só, servindo a /ajuda e a paleta
 * Ctrl+K. Já vem normalizada: os dois lados só comparam, com `casaBusca`.
 * O que entra e o que não entra está no cabeçalho do módulo. O TIPO mora em
 * `tipos.ts`, o único módulo daqui que um Client Component pode importar.
 */
export function indicePaleta(paginas: readonly PaginaAjuda[] = PAGINAS): EntradaPaleta[] {
  return paginas.map((p) => ({
    slug: p.slug,
    titulo: p.titulo,
    categoria: p.categoria,
    chave: normalizarBusca(
      [p.titulo, p.resumo, ...(p.termos ?? []), ...p.blocos.flatMap(vocabularioDoBloco)].join(
        ' ',
      ),
    ),
  }))
}

/**
 * O índice computado UMA vez por instância do servidor. O `(app)/layout.tsx` é
 * o shell de TODAS as rotas do app: chamar `indicePaleta()` ali normalizava as
 * 33 páginas a cada request de cada tela, para um valor que nunca muda entre
 * deploys (achado da revisão dos 8 commits da F20).
 *
 * É esta constante — e não uma chamada nova — que a /ajuda emite no
 * `data-ajuda-texto` e que `indice.test.ts` filtra. Os três olham o mesmo valor.
 */
export const INDICE_PALETA: readonly EntradaPaleta[] = indicePaleta()
