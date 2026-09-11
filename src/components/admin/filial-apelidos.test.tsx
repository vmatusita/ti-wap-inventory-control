import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { FilialApelidos, type ApelidoDeFilial } from './filial-apelidos'

// TRAVA (F56 · Frente E · Decisão 13) — grau 1, no molde das três sementes de
// `src/components/layout/*.test.tsx` (F45): `renderToStaticMarkup`, sem jsdom, sem
// Testing Library, sem interação — o estado chega por prop, como o componente já
// exige (ele não guarda estado de fora). Nasce VERMELHA: o componente ainda não
// existe (`docs/f56-evidencias/E1-componente-vermelho.txt`).
//
// POR QUE ESTE COMPONENTE FICA FORA DO `FilialDialog`: o Portal do Radix
// (`<DialogContent>`) nunca monta sob `renderToStaticMarkup` — `mounted` só vira
// `true` dentro de um `useLayoutEffect`, e o SSR de teste nunca roda efeito
// nenhum. Um teste do `FilialDialog` inteiro não alcançaria nada do que está
// aqui; extrair a apresentação para fora do Dialog é o que a torna testável (ata
// em `docs/DECISOES.md`).

function botoesDeRemover(html: string): string[] {
  return [...html.matchAll(/aria-label="(Remover[^"]*)"/g)].map((m) => m[1])
}

function papelDoTexto(html: string): string | null {
  const m = html.match(/\srole="([^"]+)"/)
  return m ? m[1] : null
}

function idsPresentes(html: string): Set<string> {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
}

const APELIDOS: ApelidoDeFilial[] = [
  { id: 1, apelido: 'CD-AFP' },
  { id: 2, apelido: 'CD Pena' },
]

describe('FilialApelidos — o nome próprio fixo, sem ação de remover', () => {
  it('o nome da filial aparece no HTML', () => {
    const html = renderToStaticMarkup(
      <FilialApelidos filialNome="Serra" apelidos={APELIDOS} onIncluir={() => {}} onRemover={() => {}} />,
    )
    expect(html).toContain('Serra')
  })

  it('nenhum botão de remover nomeia o nome PRÓPRIO da filial', () => {
    const html = renderToStaticMarkup(
      <FilialApelidos filialNome="Serra" apelidos={APELIDOS} onIncluir={() => {}} onRemover={() => {}} />,
    )
    // "Serra" é também o rótulo de um dos apelidos? Não — os apelidos do teste são
    // CD-AFP/CD Pena, então nenhum aria-label de remover pode conter "Serra".
    expect(botoesDeRemover(html).some((r) => r.includes('Serra'))).toBe(false)
  })

  it('o número de botões de remover é EXATAMENTE o de apelidos — nunca +1', () => {
    const html = renderToStaticMarkup(
      <FilialApelidos filialNome="Serra" apelidos={APELIDOS} onIncluir={() => {}} onRemover={() => {}} />,
    )
    expect(botoesDeRemover(html)).toHaveLength(APELIDOS.length)
  })

  it('cada botão de remover nomeia o próprio apelido', () => {
    const html = renderToStaticMarkup(
      <FilialApelidos filialNome="Serra" apelidos={APELIDOS} onIncluir={() => {}} onRemover={() => {}} />,
    )
    const botoes = botoesDeRemover(html)
    for (const a of APELIDOS) {
      expect(botoes.some((r) => r.includes(a.apelido))).toBe(true)
    }
  })

  it('sem apelido nenhum, zero botões de remover', () => {
    const html = renderToStaticMarkup(
      <FilialApelidos filialNome="Serra" apelidos={[]} onIncluir={() => {}} onRemover={() => {}} />,
    )
    expect(botoesDeRemover(html)).toHaveLength(0)
  })
})

describe('FilialApelidos — sem apelido, o aviso da coluna Site', () => {
  it('com zero apelidos, o aviso nomeia a filial e diz que acento/maiúscula não importam', () => {
    const html = renderToStaticMarkup(
      <FilialApelidos filialNome="Eusébio" apelidos={[]} onIncluir={() => {}} onRemover={() => {}} />,
    )
    expect(html).toContain('Eusébio')
    expect(html.toLowerCase()).toContain('acento e maiúsculas não importam')
  })

  it('o aviso sai com o papel de acessibilidade do Aviso da casa (não é erro — role="status")', () => {
    const html = renderToStaticMarkup(
      <FilialApelidos filialNome="Eusébio" apelidos={[]} onIncluir={() => {}} onRemover={() => {}} />,
    )
    // `src/components/layout/aviso.tsx` já prova, na própria suíte dele, que
    // 'atencao' → role="status" (informa, não interrompe) e 'erro' → role="alert".
    // Isto não é bloqueante — é orientação — então o papel esperado é "status".
    expect(papelDoTexto(html)).toBe('status')
  })

  it('com apelido cadastrado, o aviso não aparece mais', () => {
    const html = renderToStaticMarkup(
      <FilialApelidos filialNome="Serra" apelidos={APELIDOS} onIncluir={() => {}} onRemover={() => {}} />,
    )
    expect(html.toLowerCase()).not.toContain('acento e maiúsculas não importam')
  })
})

describe('FilialApelidos — o campo de incluir', () => {
  it('o rótulo prende no campo pelo for/id (mesma régua de confirmacao-digitada.test.tsx)', () => {
    const html = renderToStaticMarkup(
      <FilialApelidos filialNome="Serra" apelidos={APELIDOS} onIncluir={() => {}} onRemover={() => {}} />,
    )
    const para = html.match(/\sfor="([^"]+)"/)?.[1]
    expect(para, 'o <label> do campo de incluir deveria ter for=').toBeTruthy()
    expect(idsPresentes(html), `for="${para}" aponta para um id que não existe`).toContain(para!)
  })

  it('há um botão de incluir', () => {
    const html = renderToStaticMarkup(
      <FilialApelidos filialNome="Serra" apelidos={APELIDOS} onIncluir={() => {}} onRemover={() => {}} />,
    )
    expect(html.toLowerCase()).toContain('incluir')
  })
})

describe('FilialApelidos — o erro, quando passado, sai com role="alert"', () => {
  it('sem erro, nenhum role="alert" na tela', () => {
    const html = renderToStaticMarkup(
      <FilialApelidos filialNome="Serra" apelidos={APELIDOS} onIncluir={() => {}} onRemover={() => {}} />,
    )
    expect(html).not.toContain('role="alert"')
  })

  it('com erro, o texto sai dentro de um role="alert"', () => {
    const html = renderToStaticMarkup(
      <FilialApelidos
        filialNome="Serra"
        apelidos={APELIDOS}
        erro="«Serra Park» já é apelido da filial Serra."
        onIncluir={() => {}}
        onRemover={() => {}}
      />,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('já é apelido da filial Serra')
  })
})
