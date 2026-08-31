// A RÉGUA DE CLASSES — o que conta como classe, como moldura e como passo da
// escala. Um lugar só, para o teste e para o medidor (F40 · revisão de 31/08/2026).
//
// POR QUE ESTE ARQUIVO EXISTE. Estes detectores nasceram DENTRO de
// `src/lib/layout/consistencia.test.ts`, e `scripts/design/medir.mjs` — o script
// que diz se uma frente do sistema de design andou — reescreveu a própria versão
// deles, mais grosseira. As duas réguas divergiram, e a divergência não deixava
// teste vermelho: fazia o medidor relatar outro número, em silêncio. Medido:
//
//   · a escala do script só listava passos INTEIROS (`5|7|9|10|…`), então ele não
//     enxergava `p-2.5` nem `gap-3.5` — que a `ESCALA` daqui reprova. O script
//     dizia 46 passos fora da escala; eram 88.
//   · a moldura do script era `className="…rounded-…\bborder\b…"`, que casa com
//     `border-b`, `border-dashed`, `border-input` e `rounded-full border` (nenhum
//     é moldura) e ao mesmo tempo perde tudo que é montado em `cn(...)` — o buraco
//     que a regra 6 fechou de propósito. Dizia 178; são 167. Os dois erros se
//     cancelavam por coincidência, e o total parecia certo.
//
// É a mesma lição de `texto-fonte.ts`, que este módulo acompanha: duas cópias de
// um PARSER divergem, e a divergência aqui não quebra nada — só mede outra coisa.
//
// Módulo PURO e só-servidor por natureza (roda no Vitest e no `tsx`, ambos em
// ambiente `node`). Nenhuma tela o importa.

/**
 * Parece uma string de classe do Tailwind (e não uma frase da interface)?
 *
 * DUAS CONDIÇÕES, e as duas foram pagas pelo repositório irmão. A primeira: toda
 * palavra separada por espaço tem de ter cara de utilitário — a versão dele que
 * classificava pela PRESENÇA de maiúscula/pontuação tratava o `.` como literal e
 * cegava todo `className` que contivesse `px-1.5` ou `py-0.5`, dois passos que a
 * régua aprova (114 `className` invisíveis, dois deles com moldura escrita à mão
 * de verdade).
 *
 * A segunda: ao menos UMA palavra tem de carregar sintaxe que frase nenhuma tem
 * (hífen, dois-pontos, colchete, barra ou parêntese). Sem ela, dezenas de frases
 * reais em pt-BR passavam como classe só porque nenhuma continha por acaso um
 * `p-` — e teste que depende de sorte não é teste.
 */
export function ehStringDeClasse(valor: string): boolean {
  const partes = valor.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return false
  // `sm:`, `hover:`, `data-[x=y]:`, `p-(--var)`, `w-1/2`, `bg-black/10`,
  // `text-[11px]`, `*:[img]:rounded-t-xl` — tudo isso é utilitário legítimo.
  const UTILITARIO = /^[a-z0-9@*!-]+[a-z0-9:@[\]()/.%_&>=+~,'"-]*$/
  if (!partes.every((p) => UTILITARIO.test(p))) return false
  // `border` e `rounded` SOZINHOS não têm hífen nem dois-pontos — e são
  // exatamente as duas classes que a regra 6 procura. Sem esta segunda porta,
  // `cn('rounded-lg p-3', ativo && 'border')` escapava inteiro, porque o ramo
  // condicional era descartado antes de a combinação ser montada.
  return partes.some((p) => /[-:[\]/()]/.test(p) || /^(border|rounded)$/.test(p))
}

/** Cada string de classe do arquivo, com a linha. Aspas simples, duplas e crase. */
export function classes(texto: string): { linha: number; valor: string }[] {
  const achadas: { linha: number; valor: string }[] = []
  const linhas = texto.split('\n')
  for (let i = 0; i < linhas.length; i++) {
    // Mais grosseiro que um parser de JSX, e DE PROPÓSITO: o que interessa é a
    // string de classe, esteja ela num `className=`, dentro de um `cn(...)`, num
    // ternário ou numa constante — os quatro existem no produto.
    for (const m of linhas[i].matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)) {
      const valor = m[1] ?? m[2] ?? m[3] ?? ''
      if (!valor.trim()) continue
      achadas.push({ linha: i + 1, valor })
    }
  }
  return achadas
}

/**
 * Um `className` INTEIRO, com todas as partes juntas.
 *
 * POR QUE ISTO EXISTE: as regras que procuram uma COMBINAÇÃO de classes
 * (centralizar **e** limitar largura; arredondar **e** contornar) olhavam uma
 * string de cada vez no irmão. Bastava partir a combinação em duas strings do
 * mesmo `cn(...)` para escapar 100% verde:
 *
 *     className={cn('flex flex-col gap-6', 'mx-auto', larga && 'max-w-6xl')}
 *
 * As regras que olham UM utilitário por vez (a escala) continuam usando
 * `classes()`, que é mais simples e basta.
 */
export function classNames(
  texto: string,
): { linha: number; valor: string; tag: string }[] {
  const achadas: { linha: number; valor: string; tag: string }[] = []
  const marca = /className=/g
  let m: RegExpExecArray | null
  while ((m = marca.exec(texto)) !== null) {
    let i = m.index + m[0].length
    let fim = i
    if (texto[i] === '{') {
      let nivel = 0
      let emTexto: string | null = null
      for (; i < texto.length; i++) {
        const c = texto[i]
        if (emTexto) {
          if (c === '\\') i++
          else if (c === emTexto) emTexto = null
          continue
        }
        if (c === "'" || c === '"' || c === '`') emTexto = c
        else if (c === '{') nivel++
        else if (c === '}') {
          nivel--
          if (nivel === 0) {
            fim = i + 1
            break
          }
        }
      }
    } else if (texto[i] === '"' || texto[i] === "'") {
      const aspas = texto[i]
      for (i++; i < texto.length; i++) {
        if (texto[i] === '\\') i++
        else if (texto[i] === aspas) {
          fim = i + 1
          break
        }
      }
    } else {
      continue
    }
    const bloco = texto.slice(m.index, fim)
    const partes: string[] = []
    for (const s of bloco.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)) {
      const v = s[1] ?? s[2] ?? s[3] ?? ''
      if (v.trim() && ehStringDeClasse(v)) partes.push(v.trim())
    }
    if (partes.length === 0) continue
    // O ELEMENTO DONO desta `className` — o `<Nome` aberto mais próximo antes
    // dela. A regra de largura precisa saber disto: um `DialogContent` é uma
    // superfície de PORTAL, montada fora da árvore do `<Pagina>`, e o `max-w-*`
    // dele governa a caixa do modal, não a coluna da tela.
    const antes = texto.slice(0, m.index)
    const abertura = /<([A-Za-z][A-Za-z0-9.]*)[^<>]*$/.exec(antes)
    achadas.push({
      linha: antes.split('\n').length,
      valor: partes.join(' '),
      tag: abertura ? abertura[1] : '',
    })
  }
  return achadas
}

/** Os passos permitidos nas telas — 0px a 64px, base 4px (plano §3.1). */
export const ESCALA = new Set([
  '0',
  '0.5',
  '1',
  '1.5',
  '2',
  '3',
  '4',
  '6',
  '8',
  '12',
  '16',
  'auto',
  'px',
])

/**
 * As propriedades que a escala governa. Largura e altura não entram.
 *
 * A ORDEM DA ALTERNÂNCIA IMPORTA, e custou um falso positivo ao irmão: com `gap`
 * antes de `gap-x`, o utilitário `gap-x-6` casava com `gap` e capturava `x-6`
 * como passo — reprovando um espaçamento de 24px que está na escala. Alternância
 * de regex é ordenada e não volta atrás depois que o casamento inteiro deu
 * certo, então o prefixo mais longo tem de vir primeiro.
 */
export const ESPACAMENTO =
  /^-?(px|py|pt|pr|pb|pl|ps|pe|p|mx|my|mt|mr|mb|ml|ms|me|m|gap-x|gap-y|gap|space-x|space-y)-(.+)$/

/**
 * `env(safe-area-inset-*)` NÃO é passo de espaçamento.
 *
 * É o recorte físico do aparelho (o "queixo" do iPhone), e não existe passo
 * equivalente na escala — nem poderia: o valor é do dispositivo, não do desenho.
 * A barra de seleção de `/ativos` usa
 * `pb-[max(0.75rem,env(safe-area-inset-bottom))]`, que é o padrão correto: um
 * passo da escala como piso, o inset como teto.
 *
 * A EXCEÇÃO É ESTRUTURAL, NÃO UMA BUSCA POR SUBSTRING. A revisão adversarial
 * mostrou que `passo.includes('env(')` deixava passar QUALQUER valor arbitrário
 * que mencionasse `env` em qualquer posição — `p-[9999px_env(x)]` escapava da
 * escala inteira. A forma aceita é UMA: um piso da escala e o inset como teto,
 * que é o padrão correto e o único que o produto usa.
 */
export function ehInsetDeAparelho(passo: string): boolean {
  return /^\[max\(\d+(\.\d+)?rem,env\(safe-area-inset-(top|right|bottom|left)\)\)\]$/.test(
    passo,
  )
}

/**
 * O passo fora da escala que esta `className` carrega, se carregar algum.
 *
 * A regra 3/4 do teste e a linha "Passos de espaçamento fora da escala" do
 * medidor perguntam a MESMA coisa — e é por isso que a pergunta mora aqui.
 * Devolve o utilitário culpado (já sem a variante) ou `null`.
 */
export function passoForaDaEscala(utilitario: string): string | null {
  const m = ESPACAMENTO.exec(utilitario.slice(utilitario.lastIndexOf(':') + 1))
  if (!m) return null
  const passo = m[2]
  // `p-(--card-spacing)` — token do Tailwind v4, não número mágico.
  if (/^\(--[a-z0-9-]+\)$/.test(passo)) return null
  if (passo.startsWith('[')) return ehInsetDeAparelho(passo) ? null : m[0]
  return ESCALA.has(passo) ? null : m[0]
}

/**
 * Borda CRUA faz moldura; `border-b`, `border-input`, `border-l-2` não.
 *
 * Qualquer espessura conta. A primeira versão do irmão listava só `border` e
 * `border-2`, e a revisão adversarial mostrou `rounded-lg border-4` passando
 * ileso — um cartão escrito à mão, com traço mais grosso, invisível para a regra
 * que existe justamente para pegá-lo.
 */
export function molduraCrua(partes: string[]): boolean {
  return partes.some((p) => /^border(-\d+)?$/.test(p.slice(p.lastIndexOf(':') + 1)))
}

/**
 * `rounded-full` NÃO É RAIO DE MOLDURA, e a distinção é do inventário, não
 * conveniência: dos 190 `rounded-* border` medidos, 187 são raios de cartão
 * (`rounded-lg` 133 · `rounded-md` 38 · `rounded-xl` 16) e 3 são `rounded-full`.
 * `rounded-full` é a geometria de uma PASTILHA, de um PONTO de trilho e de um
 * avatar — nenhum deles é agrupamento com moldura, e nenhum deles vira `Card`.
 *
 * O raio DIRECIONAL conta (`rounded-t-xl`, `rounded-tr-lg`): um cartão com o topo
 * arredondado e borda crua é um cartão à mão do mesmo jeito. Foi a revisão
 * adversarial que apontou esse buraco.
 */
export function temRaio(partes: string[]): boolean {
  return partes.some((p) =>
    /(^|:)rounded(-(t|r|b|l|tl|tr|br|bl|s|e|ss|se|es|ee))?(-(sm|md|lg|xl|2xl|3xl|4xl))?$/.test(
      p,
    ),
  )
}

/**
 * Esta `className` desenha uma moldura à mão? (raio de cartão + borda crua)
 *
 * A borda TRACEJADA do estado vazio não conta — é a única moldura à mão legítima
 * do produto, e mora em `estado-vazio.tsx`, que é do SISTEMA.
 */
export function ehMolduraAMao(valor: string): boolean {
  const partes = valor.split(/\s+/)
  if (partes.includes('border-dashed')) return false
  return temRaio(partes) && molduraCrua(partes)
}
