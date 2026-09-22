import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { INTERVALO_REFRESH_MS, deveRefrescar } from './auto-refresh-decisao'

// A regra do auto-refresh do visualizador, exercitada de verdade (F50).
//
// Sem jsdom aqui, e a alternativa seria afirmar que o fonte "menciona
// `visibilityState`", o que prova grafia, não comportamento. Extrair a decisão
// custou um módulo a mais e paga isto: os casos abaixo são os que quebrariam de
// verdade.
//
// ⚠ 22/09/2026 — o Johnny aprovou happy-dom (projeto Vitest `dom`, reauditoria
// passo 5), mas só para os QUATRO componentes-gigantes que mais provavelmente
// quebrariam em silêncio numa decomposição — não é um "agora pode" geral. Para
// uma decisão como esta, extrair a função pura continua sendo mais barato E
// mais forte que montar um DOM inteiro só para observar `visibilityState`; o
// padrão desta fase não muda.
const MIN = INTERVALO_REFRESH_MS

describe('deveRefrescar: aba oculta não refresca', () => {
  it('não refresca com a aba oculta, por mais que o intervalo tenha vencido', () => {
    expect(
      deveRefrescar({ agora: MIN * 100, ultimo: 0, visivel: false, emVoo: false }),
    ).toBe(false)
  })

  it('refresca com a aba visível e o intervalo vencido', () => {
    expect(deveRefrescar({ agora: MIN, ultimo: 0, visivel: true, emVoo: false })).toBe(true)
  })

  it('não refresca antes de o intervalo vencer', () => {
    expect(deveRefrescar({ agora: MIN - 1, ultimo: 0, visivel: true, emVoo: false })).toBe(false)
  })

  it('o vencimento é inclusivo (exatamente no intervalo, refresca)', () => {
    // `>=` e não `>`: com `>` um timer que dispara no milissegundo exato — que é o
    // caso NORMAL de um `setInterval` — pularia o ciclo e só refrescaria no seguinte,
    // dobrando o intervalo real sem que ninguém entendesse por quê.
    expect(deveRefrescar({ agora: MIN, ultimo: 0, visivel: true, emVoo: false })).toBe(true)
  })
})

describe('deveRefrescar: rajadas coalescem', () => {
  it('não enfileira refresh atrás de refresh', () => {
    expect(deveRefrescar({ agora: MIN * 10, ultimo: 0, visivel: true, emVoo: true })).toBe(false)
  })

  it('`emVoo` vence até a aba visível com intervalo vencido', () => {
    // A ordem das regras importa: se a visibilidade fosse testada antes, o botão
    // manual e o tique do intervalo poderiam disparar duas renderizações da rota mais
    // cara do sistema para mostrar exatamente a mesma tela.
    const base = { agora: MIN * 5, ultimo: 0, visivel: true }
    expect(deveRefrescar({ ...base, emVoo: false })).toBe(true)
    expect(deveRefrescar({ ...base, emVoo: true })).toBe(false)
  })
})

describe('deveRefrescar: a volta à aba', () => {
  it('quem volta depois do intervalo vencido recebe UM refresh', () => {
    // O cenário real: aba escondida às 10h00, trazida de volta às 11h00.
    const umaHora = 3_600_000
    expect(deveRefrescar({ agora: umaHora, ultimo: 0, visivel: true, emVoo: false })).toBe(true)
  })

  it('quem volta ANTES do vencimento não paga refresh nenhum', () => {
    // Alt-tab de dez segundos não pode custar uma renderização da rota mais cara.
    expect(deveRefrescar({ agora: 10_000, ultimo: 0, visivel: true, emVoo: false })).toBe(false)
  })
})

describe('a fiação do componente obedece à regra', () => {
  const fonte = readFileSync(
    join(process.cwd(), 'src', 'components', 'relatorios', 'viewer-auto-refresh.tsx'),
    'utf8',
  )

  it('o ciclo e o retorno à aba passam os dois por `deveRefrescar`', () => {
    // Duas chamadas: uma no `setInterval`, uma no `visibilitychange`. Se alguém
    // voltar a chamar `router.refresh()` direto num dos dois, a regra pura continua
    // verde e o comportamento volta ao de antes — é esse descolamento que a asserção
    // impede.
    const chamadas = [...fonte.matchAll(/deveRefrescar\(/g)].length
    expect(chamadas, 'o componente deixou de consultar a regra em algum caminho').toBe(2)
  })

  it('escuta `visibilitychange` e limpa o listener', () => {
    expect(fonte).toContain("document.addEventListener('visibilitychange'")
    expect(fonte).toContain("document.removeEventListener('visibilitychange'")
  })

  it('obedece ao RV-16: nada de `setState` no corpo do efeito', () => {
    // O padrão da casa contra `react-hooks/set-state-in-effect`: o `setState` inicial
    // vive dentro de um `setTimeout(…, 0)`, nunca solto no corpo.
    expect(fonte).toContain('setTimeout(() => {')
    expect(fonte).toContain('RV-16')
  })

  it('o intervalo continua vindo da constante única, não de um número solto', () => {
    expect(fonte).toContain('INTERVALO_REFRESH_MS')
    expect(fonte).not.toContain('60_000)')
  })
})
