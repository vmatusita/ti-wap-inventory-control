// F19 (P2-12a) — memória da ÚLTIMA visita à lista `/ativos`, para o "Voltar para
// ativos" da ficha devolver o operador ao filtro que ele montou.
//
// Módulo PURO de propósito (sem React, sem `'use client'`): dá para testar a
// validação sem DOM, e as duas funções são chamadas SÓ dentro de `useEffect` /
// handler de evento — ler `sessionStorage` no corpo de um componente quebraria a
// hidratação do Next. Mesmo formato do `movimentacoes/nova/rascunho.ts`.
//
// Por que `sessionStorage` e não `document.referrer`: no App Router a navegação
// de `/ativos` para `/ativos/[id]` é SOFT (history.pushState), e `pushState` NÃO
// atualiza o `document.referrer` — ele fica congelado no último carregamento real
// de documento. Uma checagem por referrer daria `false` no fluxo normal e o botão
// se comportaria como o link fixo de antes, silenciosamente. Achado da revisão
// adversarial da F19; decisão registrada em docs/DECISOES.md.

import { chaveDeStorage } from '@/lib/escopo/chave'

// F61 — a chave é MONTADA por `chaveDeStorage` (`lib/escopo/chave.ts`) no USO, e sai
// idêntica byte a byte à literal de antes (`wap:ativos:ultima-lista`) — nenhum rascunho ou
// preferência gravada se perde. Função, não constante: uma constante de módulo
// congelaria o valor, e o call-site tem de continuar igual quando a chave do escopo
// deixar de ser fixa (virada multiempresa). Trava: `lib/escopo/chaves-de-storage.test.ts`.
export function chaveListaAtivos(): string {
  return chaveDeStorage('ativos:ultima-lista')
}

// Só aceita caminho relativo da PRÓPRIA lista. `sessionStorage` é gravado pelo
// nosso código, mas validar na leitura é barato e fecha a porta para um valor
// adulterado virar destino de navegação (open redirect): nada de `//host`,
// `http://…`, nem outra rota do app.
export function ehUrlDaListaDeAtivos(valor: string | null | undefined): valor is string {
  if (!valor) return false
  if (!valor.startsWith('/ativos')) return false
  // `//evil.com` também começa com `/`; e `/ativos/<id>` é uma FICHA, não a lista.
  if (valor.startsWith('//')) return false
  const semQuery = valor.split('?')[0]
  return semQuery === '/ativos'
}

export function lembrarListaDeAtivos(url: string): void {
  try {
    sessionStorage.setItem(chaveListaAtivos(), url)
  } catch {
    // Modo privado / storage cheio: o "Voltar" apenas cai no /ativos sem filtro.
  }
}

export function lerListaDeAtivos(): string | null {
  try {
    const v = sessionStorage.getItem(chaveListaAtivos())
    return ehUrlDaListaDeAtivos(v) ? v : null
  } catch {
    return null
  }
}
