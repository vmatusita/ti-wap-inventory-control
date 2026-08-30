import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import { semComentarios } from '@/lib/layout/texto-fonte'

// O SISTEMA DE LAYOUT, ESCRITO COMO TESTE (F40).
//
// `docs/PLANO-DESIGN-SYSTEM.md` §§3–4 descreve a régua em prosa; este arquivo é
// a mesma régua em código, e é ele que reprova a regressão. Sem ele, o produto
// volta ao que o inventário de 30/08/2026 mediu em TRÊS telas novas: quatro
// ritmos verticais, 19 `<h1>` escritos à mão, 190 molduras `rounded-* border`,
// 51 passos fora da escala e 49 tamanhos de fonte arbitrários.
//
// A CONFERÊNCIA É POR TEXTO-FONTE, como `sidebar-colapso.test.ts`,
// `impressao-colunas.test.ts` e `confinamento-viewer.test.ts` já fazem: a
// `vitest.config.mts` roda em ambiente `node`, sem renderizar componente, e o
// que se quer provar aqui é uma propriedade do CÓDIGO — "nenhuma tela inventa a
// própria largura" —, não um comportamento de tela.
//
// `src/components/ui/` FICA DE FORA de todas as regras: é código da CLI do
// shadcn, que as Convenções mandam não editar sem motivo documentado. As regras
// valem para o que ESCREVEMOS. (É também o que faz a conta de passos fora da
// escala ser 51 e não 56 — os 5 excedentes são `data-inset:pl-7` do
// `ui/dropdown-menu.tsx`; ver o plano §1.3 achado 5.)

const RAIZ = process.cwd()
const APP = join(RAIZ, 'src', 'app')
const COMPONENTES = join(RAIZ, 'src', 'components')

/** Os arquivos do SISTEMA — os únicos que podem definir casco, título e moldura. */
const SISTEMA = [
  'src/components/layout/pagina.tsx',
  'src/components/layout/casco-de-autenticacao.tsx',
  'src/components/layout/cartao-de-metrica.tsx',
  'src/components/layout/quadro-de-tabela.tsx',
  'src/components/layout/confirmacao-digitada.tsx',
  'src/components/layout/estado-vazio.tsx',
  'src/components/layout/aviso.tsx',
]

/**
 * A LISTA DE EXCEÇÕES — o que ainda NÃO foi migrado, agrupado por frente.
 *
 * A F40 entregou a fundação e o piloto (`/ativos`). As outras 29 rotas seguem
 * como estavam, e reprová-las hoje deixaria o teste vermelho por semanas — que é
 * o oposto do que este repositório faz.
 *
 * **CADA FRENTE SEGUINTE APAGA AS SUAS LINHAS.** A lista só encolhe; acrescentar
 * um prefixo aqui é dizer "desisti de uma tela que já estava sob a régua", e
 * isso precisa de ata em `docs/DECISOES.md`.
 *
 * A exceção é por PREFIXO de caminho, e vale só para as regras 1, 2, 6, 7 e 8 —
 * as que exigem os componentes novos. A escala de espaçamento e os valores
 * arbitrários (regras 3, 4 e 5) também estão aqui porque as 29 rotas ainda os
 * carregam; a diferença é que elas somem tela a tela, sem depender de componente.
 *
 * ⚠ Arquivo do SISTEMA nunca é pendente (ver `ehPendente`): as regras de escala
 * valem para ele desde o primeiro dia.
 */
const PENDENTES = [
  // ---- frente a · acervo (home, pendências, movimentações) ----------------
  'src/app/(app)/page.tsx',
  'src/app/(app)/pendencias/',
  'src/app/(app)/movimentacoes/',
  'src/components/pendencias/',
  'src/components/movimentacoes/',
  // ---- frente b · relatórios ----------------------------------------------
  // ⚠ `relatorios/acesso` e `components/relatorios/acesso-form.tsx` moram aqui
  // mas são PORTA de autenticação, não relatório: pertencem à frente d.
  'src/app/(app)/relatorios/',
  'src/components/relatorios/',
  // ---- frente c · admin + itens -------------------------------------------
  'src/app/(app)/admin/',
  'src/app/(app)/itens/',
  'src/components/admin/',
  'src/components/itens/',
  // ---- frente d · dev, ajuda, versões, telas públicas e a casca do app -----
  'src/app/(app)/dev/',
  'src/app/(app)/ajuda/',
  'src/app/(app)/versoes/',
  'src/app/(app)/layout.tsx',
  'src/app/(app)/loading.tsx',
  'src/app/(app)/error.tsx',
  'src/app/(app)/not-found.tsx',
  'src/app/layout.tsx',
  'src/app/error.tsx',
  'src/app/global-error.tsx',
  'src/app/not-found.tsx',
  'src/app/login/',
  'src/app/auth/',
  'src/components/dev/',
  'src/components/ajuda/',
  // ⚠ A CASCA DO APP É POR ARQUIVO, NÃO POR PREFIXO. Um `src/components/layout/`
  // inteiro na lista isentaria também o componente de SISTEMA que alguém criasse
  // amanhã e esquecesse de pôr em `SISTEMA` — ele nasceria fora de todas as 8
  // regras, em silêncio. Estes cinco são os únicos arquivos legados da pasta que
  // hoje violam alguma regra; qualquer arquivo novo ali já nasce sob a régua.
  'src/components/layout/app-header.tsx',
  'src/components/layout/atalhos-dialog.tsx',
  'src/components/layout/aviso-sem-escrita.tsx',
  'src/components/layout/esqueleto-relatorio.tsx',
  'src/components/layout/painel-erro.tsx',
  'src/components/layout/paleta-comandos.tsx',
  'src/components/layout/sidebar-nav.tsx',
  // ---- fora de escopo por DECISÃO, não por frente -------------------------
  // 1.412 linhas e 30 `useState`: formulário é outra frente, e mexer nele junto
  // com o layout é trocar dívida conhecida por risco de regressão (ordem F40).
  'src/components/ativos/nova-compra-form.tsx',
]

function ehDoSistema(arquivo: string): boolean {
  return SISTEMA.includes(arquivo)
}

function ehPendente(arquivo: string): boolean {
  if (ehDoSistema(arquivo)) return false
  return PENDENTES.some((p) => (p.endsWith('/') ? arquivo.startsWith(p) : arquivo === p))
}

/** Todo `.tsx` de `src/app` e `src/components`, menos os do kit do shadcn. */
function fontes(): { arquivo: string; texto: string }[] {
  const achadas: { arquivo: string; texto: string }[] = []
  const visitar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome)
      if (statSync(caminho).isDirectory()) {
        visitar(caminho)
        continue
      }
      if (!nome.endsWith('.tsx')) continue
      const arquivo = relative(RAIZ, caminho).split(sep).join('/')
      if (arquivo.startsWith('src/components/ui/')) continue
      achadas.push({ arquivo, texto: readFileSync(caminho, 'utf8') })
    }
  }
  visitar(APP)
  visitar(COMPONENTES)
  return achadas.sort((a, b) => a.arquivo.localeCompare(b.arquivo))
}

const FONTES = fontes().map((f) => ({ ...f, texto: semComentarios(f.texto) }))
const SOB_REGRA = FONTES.filter((f) => !ehPendente(f.arquivo))

/**
 * Parece uma string de classe do Tailwind (e não uma frase da interface)?
 *
 * DUAS CONDIÇÕES, e as duas foram pagas pelo repositório irmão. A primeira: toda
 * palavra separada por espaço tem de ter cara de utilitário — a versão dele que
 * classificava pela PRESENÇA de maiúscula/pontuação tratava o `.` como literal e
 * cegava todo `className` que contivesse `px-1.5` ou `py-0.5`, dois passos que
 * este mesmo arquivo aprova (114 `className` invisíveis, dois deles com moldura
 * escrita à mão de verdade).
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
  // condicional era descartado antes de a combinação ser montada. O teste do
  // próprio detector, mais abaixo, é a prova de que a porta funciona.
  return partes.some((p) => /[-:[\]/()]/.test(p) || /^(border|rounded)$/.test(p))
}

/** Cada string de classe do arquivo, com a linha. Aspas simples, duplas e crase. */
function classes(texto: string): { linha: number; valor: string }[] {
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
function classNames(texto: string): { linha: number; valor: string }[] {
  const achadas: { linha: number; valor: string }[] = []
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
    achadas.push({
      linha: texto.slice(0, m.index).split('\n').length,
      valor: partes.join(' '),
    })
  }
  return achadas
}

// ---------------------------------------------------------------------------

describe('o varredor acha o que tem de achar', () => {
  it('encontra os arquivos de tela e de componente', () => {
    expect(FONTES.length).toBeGreaterThan(100)
    expect(FONTES.map((f) => f.arquivo)).toContain('src/components/layout/pagina.tsx')
  })

  it('todo arquivo do sistema existe de verdade', () => {
    const nomes = FONTES.map((f) => f.arquivo)
    for (const arquivo of SISTEMA) expect(nomes).toContain(arquivo)
  })

  it('as 3 rotas do piloto estão SOB a régua, não na lista de exceções', () => {
    const sob = SOB_REGRA.map((f) => f.arquivo)
    for (const arquivo of [
      'src/app/(app)/ativos/page.tsx',
      'src/app/(app)/ativos/[id]/page.tsx',
      'src/app/(app)/ativos/novo/page.tsx',
      'src/components/ativos/ativos-table.tsx',
      'src/components/ativos/linha-do-tempo.tsx',
    ]) {
      expect(sob, `o piloto escapou da régua: ${arquivo}`).toContain(arquivo)
    }
  })

  it('toda linha de PENDENTES aponta para arquivo que existe', () => {
    const nomes = FONTES.map((f) => f.arquivo)
    for (const p of PENDENTES) {
      const alcanca = p.endsWith('/')
        ? nomes.some((n) => n.startsWith(p))
        : nomes.includes(p)
      expect(alcanca, `exceção morta na lista (a frente já passou?): ${p}`).toBe(true)
    }
  })

  it('o removedor de comentários não come código', () => {
    expect(semComentarios('const a = 1 // <h1>')).toBe('const a = 1        ')
    expect(semComentarios("const s = '// isto é string'")).toBe("const s = '// isto é string'")
    // O bloco vira ESPAÇO, não some: a linha 4 continua sendo a linha 4.
    expect(semComentarios('a\n/* b\nc */\nd')).toBe('a\n    \n    \nd')
  })
})

// 1 · UM `h1` POR TELA, E ELE SAI DO CABEÇALHO COMPARTILHADO ----------------

describe('todo titulo de tela sai do cabecalho de pagina', () => {
  it.each(SOB_REGRA)('$arquivo', ({ arquivo, texto }) => {
    if (ehDoSistema(arquivo)) return
    const culpados: string[] = []
    texto.split('\n').forEach((linha, i) => {
      if (/<h1[\s>]/.test(linha)) culpados.push(`linha ${i + 1}: ${linha.trim()}`)
    })
    expect(
      culpados,
      `${arquivo} escreve um <h1> proprio. O titulo da tela e ` +
        `<CabecalhoDaPagina titulo="..."> (ou <CascoDeAutenticacao subtitulo="...">), ` +
        `para que as telas nao voltem a ter 19 titulos escritos a mao.\n  ` +
        culpados.join('\n  '),
    ).toEqual([])
  })
})

// 2 · UMA SÓ ORIGEM DE LARGURA ---------------------------------------------

describe('so o casco de pagina centraliza e limita a largura', () => {
  it.each(SOB_REGRA)('$arquivo', ({ arquivo, texto }) => {
    if (ehDoSistema(arquivo)) return
    const culpados = classNames(texto)
      .filter(({ valor }) => {
        const partes = valor.split(/\s+/)
        const centraliza = partes.some((p) => p === 'mx-auto' || p.endsWith(':mx-auto'))
        const limita = partes.some((p) => /(^|:)max-w-/.test(p))
        return centraliza && limita
      })
      .map(({ linha, valor }) => `linha ${linha}: "${valor}"`)

    // A regra tambem olha o `style=` inline: sem isto, `style={{ maxWidth: 960,
    // marginInline: 'auto' }}` fazia exatamente o que a regra proibe, por um
    // caminho que ela nao enxergava. Hoje nao ha nenhum no produto — e e por isso
    // que fechar custa uma linha e nao uma migracao.
    texto.split('\n').forEach((linha, i) => {
      if (/style=\{[^}]*max-?[Ww]idth/.test(linha)) {
        culpados.push(`linha ${i + 1}: largura por style inline — ${linha.trim()}`)
      }
    })

    expect(
      culpados,
      `${arquivo} centraliza e limita a largura por conta propria. Container de pagina e ` +
        `<Pagina largura="estreita|cheia"> — a tabela de larguras vive em ` +
        `src/components/layout/pagina.tsx e mais em lugar nenhum. Formulario dentro de ` +
        `pagina cheia usa MEDIDA_DE_FORMULARIO no contêiner dos CAMPOS.\n  ` +
        culpados.join('\n  '),
    ).toEqual([])
  })
})

// 3 e 4 · UMA ESCALA DE ESPAÇAMENTO ----------------------------------------

/** Os passos permitidos nas telas — 0px a 64px, base 4px (plano §3.1). */
const ESCALA = new Set([
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
const ESPACAMENTO =
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
function ehInsetDeAparelho(passo: string): boolean {
  return /^\[max\(\d+(\.\d+)?rem,env\(safe-area-inset-(top|right|bottom|left)\)\)\]$/.test(
    passo,
  )
}

describe('o espacamento das telas cabe na escala', () => {
  it.each(SOB_REGRA)('$arquivo', ({ arquivo, texto }) => {
    const culpados: string[] = []
    for (const { linha, valor } of classes(texto)) {
      if (!ehStringDeClasse(valor)) continue
      for (const parte of valor.split(/\s+/)) {
        const utilitario = parte.slice(parte.lastIndexOf(':') + 1)
        const m = ESPACAMENTO.exec(utilitario)
        if (!m) continue
        const passo = m[2]
        // `p-(--card-spacing)` — token do Tailwind v4, não número mágico.
        if (/^\(--[a-z0-9-]+\)$/.test(passo)) continue
        if (passo.startsWith('[')) {
          if (ehInsetDeAparelho(passo)) continue
          culpados.push(`linha ${linha}: "${utilitario}" — valor arbitrario`)
          continue
        }
        if (!ESCALA.has(passo)) {
          culpados.push(`linha ${linha}: "${utilitario}" — passo fora da escala`)
        }
      }
    }
    expect(
      culpados,
      `${arquivo} usa espacamento fora da escala {0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16}. ` +
        `A escala e a de docs/PLANO-DESIGN-SYSTEM.md §3.1; nada de p-5, gap-7, py-10 ou ` +
        `p-[18px].\n  ` +
        culpados.join('\n  '),
    ).toEqual([])
  })
})

// 5 · SEM FONTE ARBITRÁRIA, SEM LARGURA DE CAMPO EM PIXEL -------------------

describe('a tipografia e as larguras de campo saem da escala', () => {
  it.each(SOB_REGRA)('$arquivo', ({ arquivo, texto }) => {
    const culpados: string[] = []
    for (const { linha, valor } of classes(texto)) {
      if (!ehStringDeClasse(valor)) continue
      for (const parte of valor.split(/\s+/)) {
        const utilitario = parte.slice(parte.lastIndexOf(':') + 1)
        if (/^text-\[\d+px\]$/.test(utilitario)) {
          culpados.push(
            `linha ${linha}: "${utilitario}" — fonte arbitraria (use text-xs, 12px)`,
          )
        }
        // `min-w-` e `max-w-` contam: as 32 larguras de campo do inventário
        // aparecem nas três formas, e fechar só uma delas seria deixar a porta
        // aberta ao lado da que se fechou.
        if (/^(w|min-w|max-w)-\[\d+px\]$/.test(utilitario)) {
          culpados.push(
            `linha ${linha}: "${utilitario}" — largura em pixel (use a escala: w-36, w-40…)`,
          )
        }
      }
    }
    expect(
      culpados,
      `${arquivo} usa tamanho arbitrario. A hierarquia tem QUATRO degraus — 24 / 16 / 14 / 12 ` +
        `(docs/PLANO-DESIGN-SYSTEM.md §3.4) — e largura de campo sai da escala de espacamento, ` +
        `nao de um pixel escolhido no braco.\n  ` +
        culpados.join('\n  '),
    ).toEqual([])
  })
})

// 6 · UMA MOLDURA SÓ --------------------------------------------------------

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

describe('a regra da moldura sabe o que e moldura', () => {
  // A PROVA DE QUE O DETECTOR FUNCIONA — e ela existe porque a regra já quebrou
  // calada no irmão: ao generalizar de "`border` ou `border-2`" para "qualquer
  // espessura", a barra invertida do `\d` se perdeu e a expressão virou
  // `/^border(-d+)?$/`, que casa com a LETRA "d". `border-2` e `border-4`
  // deixaram de ser detectados e a suíte inteira continuou verde, porque no
  // código de então não havia moldura de traço grosso para reprovar.
  // Regra que só é exercitada pelo código de hoje não prova nada sobre amanhã.
  it.each(['border', 'border-2', 'border-4', 'border-8', 'sm:border-2'])(
    '%s faz moldura',
    (classe) => {
      expect(molduraCrua([classe])).toBe(true)
    },
  )

  it.each([
    'border-b',
    'border-t-4',
    'border-l-2',
    'border-input',
    'border-destructive/40',
    'border-dashed',
    'border-amber-300',
  ])('%s nao faz moldura', (classe) => {
    expect(molduraCrua([classe])).toBe(false)
  })

  it('so acusa quando ha raio de cartao junto', () => {
    expect(temRaio(['rounded-lg'])).toBe(true)
    expect(temRaio(['rounded'])).toBe(true)
    expect(temRaio(['sm:rounded-xl'])).toBe(true)
    // Raio direcional TAMBEM e moldura — topo arredondado com borda crua e um
    // cartao a mao do mesmo jeito.
    expect(temRaio(['rounded-t-xl'])).toBe(true)
    expect(temRaio(['rounded-tr-lg'])).toBe(true)
    // `rounded-full` NAO: e pastilha, ponto de trilho, avatar.
    expect(temRaio(['rounded-full'])).toBe(false)
    expect(temRaio(['border'])).toBe(false)
  })

  it('o inset de aparelho e a UNICA forma arbitraria aceita na escala', () => {
    // A forma correta: um passo da escala como piso, o recorte do aparelho como
    // teto. Qualquer outra coisa que mencione `env` reprova.
    expect(ehInsetDeAparelho('[max(0.75rem,env(safe-area-inset-bottom))]')).toBe(true)
    expect(ehInsetDeAparelho('[max(1rem,env(safe-area-inset-left))]')).toBe(true)
    expect(ehInsetDeAparelho('[9999px_env(x)]')).toBe(false)
    expect(ehInsetDeAparelho('[env(safe-area-inset-bottom)]')).toBe(false)
    expect(ehInsetDeAparelho('[18px]')).toBe(false)
  })

  it('a combinacao partida em duas strings do mesmo cn() nao escapa', () => {
    const alvo = "<div className={cn('rounded-lg p-3', ativo && 'border')} />"
    const achado = classNames(alvo).filter(({ valor }) => {
      const partes = valor.split(/\s+/)
      return temRaio(partes) && molduraCrua(partes)
    })
    expect(achado.length, 'a regra 6 voltou a olhar uma string por vez').toBe(1)
  })
})

describe('agrupamento com borda vem de Card, nao escrito a mao', () => {
  it.each(SOB_REGRA)('$arquivo', ({ arquivo, texto }) => {
    if (ehDoSistema(arquivo)) return
    const culpados = classNames(texto)
      .filter(({ valor }) => {
        const partes = valor.split(/\s+/)
        // A borda TRACEJADA do estado vazio é a única moldura à mão legítima do
        // produto — e ela mora em `estado-vazio.tsx`, que é do SISTEMA.
        if (partes.includes('border-dashed')) return false
        return temRaio(partes) && molduraCrua(partes)
      })
      .map(({ linha, valor }) => `linha ${linha}: "${valor}"`)

    expect(
      culpados,
      `${arquivo} desenha um cartao a mao ("rounded-* border"). Agrupamento com moldura e ` +
        `<Card> (ou <QuadroDeTabela>, <CartaoDeMetrica>, <Aviso>, <EstadoVazio>) — o Card do ` +
        `kit e rounded-xl com anel, e um cartao a mao nunca bate com ele.\n  ` +
        culpados.join('\n  '),
    ).toEqual([])
  })
})

// 7 · TODA ROTA MIGRADA USA O CASCO ----------------------------------------

/** Toda pasta de `src/app/(app)` que serve uma rota. */
function rotasDoGrupo(): { rota: string; dir: string; arquivo: string }[] {
  const GRUPO = join(APP, '(app)')
  const achadas: { rota: string; dir: string; arquivo: string }[] = []
  const visitar = (dir: string, prefixo: string) => {
    const nomes = readdirSync(dir)
    for (const nome of nomes) {
      const caminho = join(dir, nome)
      if (statSync(caminho).isDirectory()) visitar(caminho, `${prefixo}/${nome}`)
    }
    if (nomes.includes('page.tsx')) {
      achadas.push({
        rota: prefixo || '/',
        dir,
        arquivo: relative(RAIZ, join(dir, 'page.tsx')).split(sep).join('/'),
      })
    }
  }
  visitar(GRUPO, '')
  return achadas
}

const ROTAS = rotasDoGrupo()
const ROTAS_MIGRADAS = ROTAS.filter((r) => !ehPendente(r.arquivo))

/** O texto de todos os `.tsx` da pasta da rota — a página e os painéis dela. */
function fonteDaRota(dir: string, esqueleto: boolean): string {
  // SEM OS COMENTÁRIOS, aqui pelo motivo OPOSTO ao das outras regras: a busca é
  // por PRESENÇA, e um comentário que citasse o casco pelo nome faria uma tela
  // que não o usa passar no teste.
  return semComentarios(
    readdirSync(dir)
      .filter((n) => n.endsWith('.tsx'))
      .filter((n) => (esqueleto ? n === 'loading.tsx' : n !== 'loading.tsx'))
      .map((n) => readFileSync(join(dir, n), 'utf8'))
      .join('\n'),
  )
}

describe('toda rota migrada renderiza dentro do casco', () => {
  it('o varredor achou as rotas do grupo, e 3 delas estao migradas', () => {
    // 29 no grupo protegido; as outras 3 das 32 do inventário são as PORTAS
    // públicas (`/login`, `/auth/confirm`, `/auth/definir-senha`), que ficam fora
    // de `(app)` e são matéria do `CascoDeAutenticacao`, na frente d.
    expect(ROTAS.length).toBe(29)
    expect(ROTAS_MIGRADAS.map((r) => r.rota).sort()).toEqual([
      '/ativos',
      '/ativos/[id]',
      '/ativos/novo',
    ])
  })

  it.each(ROTAS_MIGRADAS)('$rota usa <Pagina>', ({ rota, dir }) => {
    const fonte = fonteDaRota(dir, false)
    expect(
      fonte.includes('<Pagina') || fonte.includes('<CascoDeAutenticacao'),
      `${rota} nao usa <Pagina>. Toda tela migrada abre com o casco — e escolhe a largura ` +
        `pelo TIPO de tela (docs/PLANO-DESIGN-SYSTEM.md §3.2).`,
    ).toBe(true)
  })

  it.each(ROTAS_MIGRADAS)('$rota titula com <CabecalhoDaPagina>', ({ rota, dir }) => {
    expect(
      fonteDaRota(dir, false).includes('<CabecalhoDaPagina'),
      `${rota} nao usa <CabecalhoDaPagina>. Sem ele a tela volta a escrever o proprio <h1>.`,
    ).toBe(true)
  })
})

// 8 · O ESQUELETO CASA COM A TELA ------------------------------------------

/**
 * A variante declarada pela TELA tem de bater com a do `loading.tsx`.
 *
 * A doc de streaming do Next recomenda que o esqueleto case as dimensões do
 * conteúdo final — `loading.tsx` embrulha a `page.tsx` num `<Suspense>` e é o
 * único fallback *prefetched*, então divergência aqui é um salto de layout que
 * TODA navegação para a rota mostra. Dois esqueletos divergiam antes da F40
 * (`ativos/novo/loading.tsx` e `movimentacoes/devolucao-fornecedor/loading.tsx`,
 * ambos `max-w-3xl space-y-5` contra `mx-auto max-w-3xl space-y-6` das páginas).
 *
 * A COMPARAÇÃO É PELO CASCO, não por string de `max-w-*`: o esqueleto monta um
 * `<Pagina>` de verdade, igual ao da tela, e é dele que a largura sai nos dois
 * lados. Um esqueleto que copiasse a classe certa pelo motivo errado voltaria a
 * divergir no dia em que a tabela de larguras mudasse — que é exatamente como os
 * dois divergiram antes.
 *
 * O `data-casco-da-pagina` continua aceito como segunda porta, para o esqueleto
 * que um dia não puder montar o componente.
 */
function larguraDeclarada(fonte: string): string | null {
  const casco = /<Pagina\b[^>]*?largura=(?:"([a-z]+)"|\{'([a-z]+)'\})/.exec(fonte)
  if (casco) return casco[1] ?? casco[2]
  const atributo = /data-casco-da-pagina="([a-z]+)"/.exec(fonte)
  if (atributo) return atributo[1]
  if (/<Pagina[\s/>]/.test(fonte)) return 'cheia' // o padrão da prop
  return null
}

describe('o esqueleto declara a mesma largura da tela', () => {
  const COM_ESQUELETO = ROTAS_MIGRADAS.filter((r) =>
    readdirSync(r.dir).includes('loading.tsx'),
  )

  it('as rotas migradas com esqueleto foram achadas', () => {
    expect(COM_ESQUELETO.length).toBeGreaterThanOrEqual(3)
  })

  it.each(COM_ESQUELETO)('$rota', ({ rota, dir }) => {
    const daTela = larguraDeclarada(fonteDaRota(dir, false))
    const doEsqueleto = larguraDeclarada(fonteDaRota(dir, true))
    expect(daTela, `${rota} nao declara largura no <Pagina>`).not.toBeNull()
    expect(
      doEsqueleto,
      `o loading.tsx de ${rota} nao monta um <Pagina> nem marca data-casco-da-pagina — sem ` +
        `isso nada garante que o esqueleto e a tela tenham a mesma largura.`,
    ).not.toBeNull()
    expect(
      doEsqueleto,
      `${rota}: a tela e "${daTela}" e o esqueleto e "${doEsqueleto}" — o salto aparece em ` +
        `toda navegacao para a rota.`,
    ).toBe(daTela)
  })
})
