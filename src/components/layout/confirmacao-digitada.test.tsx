import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { ConfirmacaoDigitada } from './confirmacao-digitada'

// SEMENTE 2 do piso de teste de componente (F45).
//
// O que ela protege: `aria-describedby` APONTANDO PARA UM `id` QUE EXISTE. Um
// `aria-describedby` pendurado num id inexistente é pior do que nenhum — o leitor
// de tela não lê nada e a marcação parece correta na revisão de código. É a classe
// de defeito que só o HTML renderizado denuncia: o TypeScript aceita as duas
// strings, o lint não compara uma com a outra, e a tela fica idêntica.
//
// Esta caixa é a de "digite X para confirmar" das quatro telas destrutivas
// (`/admin/importar`, `/admin/usuarios`, `/dev/destrutivo`, `/pendencias`). O id
// vem de `useId()` — que o render de servidor resolve —, então o teste não pode
// cravar o valor: ele extrai o id do próprio HTML e confere que o alvo está lá.
//
// Render ESTÁTICO por `renderToStaticMarkup`. Nada de clique nem de digitação:
// o estado é passado por prop, como o componente já exige (ele não guarda estado).

/** Os `id=` presentes no HTML — o conjunto de alvos que existem de fato. */
function idsPresentes(html: string): Set<string> {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
}

function descrevidoPor(html: string): string | null {
  const m = html.match(/\saria-describedby="([^"]+)"/)
  return m ? m[1] : null
}

describe('ConfirmacaoDigitada — o aria-describedby aponta para um id que existe', () => {
  const base = {
    rotulo: 'Para confirmar, digite o nome da filial',
    esperado: 'matriz',
    onChange: () => {},
  }

  it('com o texto ERRADO, a dica aparece e o campo aponta para ela', () => {
    const html = renderToStaticMarkup(
      <ConfirmacaoDigitada {...base} valor="matri" confere={false} />,
    )
    const alvo = descrevidoPor(html)
    expect(alvo, 'o campo deveria descrever-se pela dica quando o texto não confere').not.toBeNull()
    expect(idsPresentes(html), `aria-describedby="${alvo}" aponta para um id que não existe`).toContain(alvo!)
    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-invalid="true"')
  })

  it('com o texto CERTO, não há dica — e não há describedby pendurado', () => {
    const html = renderToStaticMarkup(
      <ConfirmacaoDigitada {...base} valor="matriz" confere />,
    )
    expect(descrevidoPor(html)).toBeNull()
    expect(html).toContain('aria-invalid="false"')
  })

  it('com o campo VAZIO, não há dica ainda (não se acusa quem nem começou)', () => {
    const html = renderToStaticMarkup(<ConfirmacaoDigitada {...base} valor="" confere={false} />)
    expect(descrevidoPor(html)).toBeNull()
  })

  it('o rótulo prende no campo pelo `for`/`id` (e o id é o mesmo dos dois lados)', () => {
    const html = renderToStaticMarkup(<ConfirmacaoDigitada {...base} valor="" confere={false} />)
    const para = html.match(/\sfor="([^"]+)"/)?.[1]
    expect(para, 'o <label> deveria ter for=').toBeTruthy()
    expect(idsPresentes(html)).toContain(para!)
  })

  it('o `id` de fora vence o gerado — e a dica acompanha', () => {
    const html = renderToStaticMarkup(
      <ConfirmacaoDigitada {...base} id="confirma-teste" valor="x" confere={false} />,
    )
    expect(descrevidoPor(html)).toBe('confirma-teste-dica')
    expect(idsPresentes(html)).toContain('confirma-teste-dica')
  })
})
