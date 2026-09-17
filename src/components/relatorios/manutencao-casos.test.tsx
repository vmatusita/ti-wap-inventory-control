import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { ManutencaoCasos } from './manutencao-casos'
import type { ManutencaoCaso } from '@/lib/relatorios/tipos'

// UM COMPONENTE DE `relatorios/` SOB A RÉGUA (F61) — rig de componente grau 1 (F45).
//
// Dois riscos de regressão silenciosa moram neste arquivo, e o HTML é a única coisa
// que os denuncia:
//   · o cartão de caso voltar a ser `div.rounded-lg.border.bg-card.p-3` em vez do
//     `Card size="sm"` do kit — o traço volta a ser `border` onde o resto do sistema
//     usa `ring-1`, e o raio volta a 8px;
//   · a pílula "voltou em…" voltar à paleta crua (`bg-green-100 text-green-800` +
//     `dark:`) em vez do par de tokens `--sucesso`.
// Este componente também vive na SUPERFÍCIE DO VISUALIZADOR: nenhum `href` fora de
// `/relatorios/**` para quem entra por senha — por isso o caso de gestor (sem
// `ehOperador`) confere que o patrimônio sai como TEXTO, não como link.

const CASO: ManutencaoCaso = {
  patrimonio: 'WAP0001234',
  modelo: 'Notebook Modelo X',
  filial: 'Aurora',
  chamado: 'CH-1',
  dataEnvio: '2026-09-01',
  diasEmManutencao: 3,
  obsEnvio: 'Tela trincada',
  anotacoes: [],
  retornoData: '2026-09-10',
  retornoObs: null,
  fechado: true,
  desfecho: 'retorno',
  ativoId: 'a-1',
}

describe('ManutencaoCasos — a moldura e a pílula vêm do sistema', () => {
  const html = renderToStaticMarkup(<ManutencaoCasos casos={[CASO]} />)

  it('o cartão de caso é um Card size="sm" do kit, não uma moldura à mão', () => {
    expect(html).toContain('data-slot="card" data-size="sm"')
    expect(html).not.toMatch(/class="[^"]*rounded-lg border[^"]*"/)
  })

  it('a pílula "voltou em…" pinta pelo par de tokens de sucesso', () => {
    expect(html).toMatch(/bg-sucesso[^"]*text-sucesso-texto/)
    expect(html).not.toMatch(/green-(100|800|950|300)/)
    expect(html).toContain('voltou ')
  })

  it('para quem entra por senha, o patrimônio é texto — nenhum href para fora dos relatórios', () => {
    expect(html).not.toContain('<a')
    expect(html).toContain('WAP0001234')
  })

  it('para o operador, o patrimônio vira link da ficha (e só isso muda)', () => {
    const comLink = renderToStaticMarkup(<ManutencaoCasos casos={[CASO]} ehOperador />)
    expect(comLink).toContain('href="/ativos/a-1"')
  })
})
