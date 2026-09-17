'use client'

import { useEffect } from 'react'

// A BASE FRESCA DA PRÓXIMA URL DE FILTRO — um módulo para os filtros de lista (F61).
//
// ============================================================================
// O DEFEITO QUE ISTO RESOLVE (achado da revisão adversarial da F9)
// ============================================================================
// `useSearchParams()` só reflete a URL COMMITADA — e `window.location.search`
// também, porque o Next só chama `history.pushState` dentro do
// `useInsertionEffect` do `HistoryUpdater`, quando a navegação termina (conferido
// em `node_modules/next/dist/client/components/app-router.js`). Cada troca de
// filtro navega dentro de `startTransition`, então duas trocas na MESMA janela
// pendente (De e depois Até, grupo e depois filial) liam o mesmo snapshot antigo,
// e a segunda apagava a primeira.
//
// A solução: guardar o último conjunto empurrado. Enquanto a URL commitada for a
// mesma de quando empurramos, a navegação ainda não terminou e a base correta é
// o que empurramos. Assim que a URL commitada muda — o nosso push chegou, ou veio
// navegação de fora (voltar/avançar, link) —, a base volta a ser a URL de verdade.
//
// ============================================================================
// ⚠ O ESTADO É DE MÓDULO, E É COMPARTILHADO — por isso ele é POR CAMINHO
// ============================================================================
// O `Map` abaixo vive no módulo, não no componente: todo filtro da aba que
// importa este arquivo enxerga o MESMO `Map`. Até a F61 ele era UMA variável só
// (`itens/url-filtros.ts`), e isso tinha um vazamento latente: aplicar
// `filial=2` em `/itens` a partir de URL limpa e clicar em "Histórico" antes de a
// navegação commitar fazia o PRIMEIRO filtro de `/itens/historico` partir de
// `filial=2` — o link não leva query, as duas URLs commitadas eram `''`, e a
// comparação só olhava a query. A justificativa antiga ("os dois blocos de
// `/itens` empurram para a mesma URL") caducou quando o histórico ganhou rota
// própria (F42). Agora a chave é o CAMINHO, e a mesma query em outra rota não
// herda nada.
//
// A segunda trava é `useEsquecerFiltrosAoSair`: o componente de filtro que
// DESMONTA (a rota mudou) apaga o pendente do seu caminho. Sem ela, voltar a
// `/itens` por um link sem query, depois de um filtro que já tinha commitado,
// reencontraria o pendente velho — a garantia que a cópia em `useRef` de
// `movimentacoes/lista-filtros.tsx` tinha por construção (o `ref` morre com o
// componente) e que um estado de módulo precisa pedir explicitamente.
//
// ⚠ POR QUE `src/components/` E NÃO `src/lib/`: o módulo é `'use client'` e tem
// estado. Em `src/lib/` ele seria importável por código de servidor, onde o
// estado de módulo é compartilhado ENTRE REQUESTS — e nenhum módulo de `lib/` é
// `'use client'` (a lição que o `CLAUDE.md` registra sobre `checklist-lote.ts` é a
// da fronteira: um `'use client'` em `lib/` tornaria a função `undefined` numa
// Server Action, com o build verde).

type Pendente = { commitadaAntes: string; enviada: string }

const pendentes = new Map<string, Pendente>()

/**
 * A base para montar a próxima URL de filtro de `caminho`.
 * `urlCommitada` é `useSearchParams().toString()`.
 */
export function baseDosFiltros(caminho: string, urlCommitada: string): URLSearchParams {
  const pendente = pendentes.get(caminho)
  if (pendente && pendente.commitadaAntes === urlCommitada) {
    return new URLSearchParams(pendente.enviada)
  }
  pendentes.delete(caminho)
  return new URLSearchParams(urlCommitada)
}

/** Registra o que foi empurrado para `caminho`, para a próxima troca partir daqui. */
export function registrarFiltrosEnviados(
  caminho: string,
  urlCommitada: string,
  enviada: string,
): void {
  pendentes.set(caminho, { commitadaAntes: urlCommitada, enviada })
}

/** Apaga o pendente de `caminho` — o filtro saiu da tela. */
export function esquecerFiltrosPendentes(caminho: string): void {
  pendentes.delete(caminho)
}

/** Só para teste — o módulo guarda estado entre chamadas por natureza. */
export function resetarFiltrosPendentes(): void {
  pendentes.clear()
}

/** O componente de filtro que desmonta leva o pendente do seu caminho junto. */
export function useEsquecerFiltrosAoSair(caminho: string): void {
  useEffect(() => () => esquecerFiltrosPendentes(caminho), [caminho])
}
