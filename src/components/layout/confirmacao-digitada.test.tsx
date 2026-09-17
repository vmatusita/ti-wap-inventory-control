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

// ---- F61 · decisão ii — AS QUATRO CONFIRMAÇÕES PASSAM POR AQUI ----------------
//
// A mesa de conflitos era a única confirmação MUDA do sistema. Estes casos montam a
// caixa com as props de cada uma das quatro telas e afirmam o HTML que anuncia o erro.
// A função `anunciaOErro` é a mesma pergunta que a sabotagem F faz a uma variante SEM
// os atributos — para provar que o teste reprova o que devia reprovar.

/** O campo anuncia o erro? `aria-invalid="true"`, `aria-describedby` apontando para um
 *  id que existe, e a dica com `role="alert"` nesse id. */
function anunciaOErro(html: string): boolean {
  const alvo = descrevidoPor(html)
  if (!html.includes('aria-invalid="true"') || !alvo) return false
  return new RegExp(`<p id="${alvo}" role="alert"`).test(html)
}

describe('ConfirmacaoDigitada — as props das quatro telas (F61)', () => {
  it('a MESA: esperado gerado "APAGAR 3", digitado "APAGAR 2" → anuncia o erro, em mono', () => {
    const html = renderToStaticMarkup(
      <ConfirmacaoDigitada
        id="conflito-confirmacao"
        rotulo="Para confirmar, digite exatamente:"
        esperado="APAGAR 3"
        mono
        valor="APAGAR 2"
        confere={false}
        onChange={() => {}}
      />,
    )
    expect(anunciaOErro(html)).toBe(true)
    expect(descrevidoPor(html)).toBe('conflito-confirmacao-dica')
    expect(html).toContain('O texto não confere — digite exatamente APAGAR 3')
    expect(html).toMatch(/<p class="font-mono text-xs break-all text-muted-foreground">APAGAR 3<\/p>/)
    expect(html).toContain('spellCheck="false"')
  })

  it('a MESA com o texto certo não acusa nada', () => {
    const html = renderToStaticMarkup(
      <ConfirmacaoDigitada rotulo="Para confirmar, digite exatamente:" esperado="APAGAR 3" mono valor="apagar 3 " confere onChange={() => {}} />,
    )
    expect(anunciaOErro(html)).toBe(false)
    expect(html).not.toContain('role="alert"')
  })

  it('SABOTAGEM F — uma caixa SEM os atributos (a mesa de antes) não passa na pergunta', () => {
    // A marcação que a mesa de conflitos renderizava até a F61, reproduzida em memória:
    // rótulo, texto esperado e campo — sem aria-invalid, sem describedby, sem dica.
    const muda =
      '<label for="conflito-confirmacao">Para confirmar, digite exatamente:</label>' +
      '<p class="font-mono text-xs break-all text-muted-foreground">APAGAR 3</p>' +
      '<input id="conflito-confirmacao" value="APAGAR 2" autoComplete="off" spellCheck="false"/>'
    expect(anunciaOErro(muda)).toBe(false)
  })

  it('o IMPORT mostra o nome no rótulo e não repete a linha do esperado', () => {
    const html = renderToStaticMarkup(
      <ConfirmacaoDigitada
        id="import-confirmacao"
        rotulo={
          <>
            Digite <span className="font-mono font-semibold">Cerrado Alto</span> para confirmar
          </>
        }
        esperado="Cerrado Alto"
        exibirEsperado={false}
        valor="cerrado"
        confere={false}
        onChange={() => {}}
      />,
    )
    expect(html).not.toContain('text-xs break-all')
    expect(html).toContain('placeholder="Cerrado Alto"')
    expect(anunciaOErro(html)).toBe(true)
  })

  it('o APAGAR CONTA sem e-mail mostra o aviso no lugar do esperado, com o campo desabilitado', () => {
    const html = renderToStaticMarkup(
      <ConfirmacaoDigitada
        id="dev-apagar-confirmacao"
        rotulo="Para confirmar, digite o e-mail da conta"
        esperado=""
        aviso={
          <p role="alert" className="text-xs text-destructive">
            Não foi possível ler o e-mail desta conta agora.
          </p>
        }
        desabilitado
        valor=""
        confere={false}
        onChange={() => {}}
      />,
    )
    expect(html).toContain('Não foi possível ler o e-mail desta conta agora.')
    expect(html).not.toContain('text-xs break-all')
    expect(html).toMatch(/<input[^>]*disabled=""/)
  })

  it('sem `mono`, o esperado sai na fonte do texto (o apagar conta)', () => {
    const html = renderToStaticMarkup(
      <ConfirmacaoDigitada rotulo="Para confirmar, digite o e-mail da conta" esperado="fulano@exemplo.test" valor="" confere={false} onChange={() => {}} />,
    )
    expect(html).toMatch(/<p class="text-xs break-all text-muted-foreground">fulano@exemplo\.test<\/p>/)
  })
})
