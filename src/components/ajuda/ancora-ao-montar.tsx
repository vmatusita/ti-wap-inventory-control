'use client'

import { useEffect, useRef } from 'react'
import { resolverAncora } from '@/lib/ajuda/ancora'

// B3 (OS-F13). Numa navegacao client-side com hash para OUTRA rota (o "?" das
// telas -> /ajuda#<ancora>), o App Router executa o scroll enquanto o loading.tsx
// da /ajuda ainda esta na tela: getElementById devolve null, ele rola ate a raiz
// do esqueleto, zera o hashFragment e NUNCA MAIS tenta quando as secoes montam
// (prova ponta a ponta em scratchpad/f13/diag-ajuda.md). Este componente monta no
// MESMO commit das secoes — aqui o alvo existe — e cobre so esse buraco.
//
// Nao tem UI (retorna null) e nao muda o LinkAjuda nem o loading.tsx.
// - So no mount: mudanca de hash na mesma pagina (chips do sumario) e o
//   back/forward intra-pagina continuam 100% nativos.
// - Guarda pela propria `scroll-margin-top` da <section>: quando a URL foi aberta
//   direto (aba nova), o alvo ja esta posicionado e o componente vira no-op — nao
//   rouba o scroll de ninguem e e idempotente sob StrictMode.
// - `ids` vem por prop porque `lib/ajuda/conteudo.ts` e so-servidor (regra no
//   cabecalho daquele arquivo) — e e a lista branca que impede o hash da URL de
//   virar um seletor de DOM arbitrario.
export function AncoraAoMontar({ ids }: { ids: readonly string[] }) {
  const jaPosicionou = useRef(false)

  useEffect(() => {
    if (jaPosicionou.current) return
    const id = resolverAncora(window.location.hash, ids)
    if (!id) return
    const alvo = document.getElementById(id)
    if (!alvo) return
    jaPosicionou.current = true
    // Ja esta no lugar? A margem de rolagem da secao e a regua (tolerancia de
    // 2px para o subpixel): nao rola de novo, nao pisca.
    const margem = parseFloat(getComputedStyle(alvo).scrollMarginTop) || 0
    if (Math.abs(alvo.getBoundingClientRect().top - margem) <= 2) return
    // Sem opcoes de proposito: respeita o scroll-mt-28 da <section>, que e o que
    // deixa o titulo abaixo do sumario sticky (mesma posicao do caminho "aba
    // nova"). Sem behavior:'smooth' e sem scroll-behavior global.
    alvo.scrollIntoView()
  }, [ids])

  return null
}
