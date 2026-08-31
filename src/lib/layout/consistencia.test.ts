import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import { semComentarios } from '@/lib/layout/texto-fonte'
// A RÉGUA vive em `regua-de-classes.ts` desde a revisão de 31/08/2026, e não mais
// aqui dentro: `scripts/design/medir.ts` precisa das MESMAS definições, e um
// script não importa de um `.test.ts`. Enquanto cada lado tinha a sua, o medidor
// relatava outro número em silêncio — 46 passos fora da escala onde havia 88.
import {
  ESCALA,
  classNames,
  classes,
  ehInsetDeAparelho,
  ehMolduraAMao,
  ehStringDeClasse,
  molduraCrua,
  passoForaDaEscala,
  temRaio,
} from '@/lib/layout/regua-de-classes'

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
 * Superfícies de PORTAL — modal, gaveta, popover, menu.
 *
 * Elas são montadas fora da árvore do `<Pagina>` (o Radix as leva para o fim do
 * `<body>`), e o `max-w-*` delas mede a caixa flutuante, não a coluna da tela.
 * O produto tem 34 dessas, com seis medidas — consolidá-las é assunto de uma
 * frente de DIÁLOGOS, não da régua de página.
 */
const SUPERFICIES_DE_PORTAL = new Set([
  'DialogContent',
  'SheetContent',
  'PopoverContent',
  'DropdownMenuContent',
  'AlertDialogContent',
  'CommandDialog',
  'SelectContent',
  'TooltipContent',
])

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

  // ---- LITERAL DE REGEX (revisão de código de 31/08/2026) -------------------
  //
  // O scanner não conhecia literal de regex, e a falta media outra coisa em
  // SILÊNCIO: em 19 dos 628 arquivos de `src` a saída saía errada e nenhum teste
  // reclamava. Estes casos são os dois defeitos reais do repositório mais as
  // fronteiras da heurística — sem eles, a próxima "melhoria" no scanner volta a
  // ser exercitada só pelo código de hoje, que é o que já deixou a regra 6 passar
  // meses com `\d` virado em `d` (ver o comentário de `molduraCrua`).
  it('o removedor entende literal de regex, e não confunde com divisão', () => {
    // O CÓDIGO sobrevive inteiro; o COMENTÁRIO vira espaço do mesmo tamanho.
    // Escrever os espaços à mão faz o teste falhar por contagem em vez de por
    // defeito — o preenchimento se calcula.
    const NOTA = '// nota'
    const limpo = (codigo: string, comentario: string) =>
      codigo + ' '.repeat(comentario.length)

    // Divisão comum continua divisão — não vira início de regex.
    expect(semComentarios(`const media = soma / total ${NOTA}`)).toBe(
      limpo('const media = soma / total ', NOTA),
    )
    expect(semComentarios(`const m = calcular() / 2 ${NOTA}`)).toBe(
      limpo('const m = calcular() / 2 ', NOTA),
    )
    expect(semComentarios(`const m = arr[0] / 2 ${NOTA}`)).toBe(
      limpo('const m = arr[0] / 2 ', NOTA),
    )

    // DEFEITO 1 — aspas DENTRO da classe de caracteres abriam string fantasma, e
    // a partir dali todo comentário do arquivo sobrevivia. Caso real:
    // `src/lib/queries/compras.ts:68`.
    const classe = String.raw`.replace(/[,()"']/g, '%')`
    expect(semComentarios(`${classe}\n${NOTA}`)).toBe(limpo(`${classe}\n`, NOTA))

    // DEFEITO 2 — a barra ESCAPADA era lida como o `//` de comentário e truncava
    // o literal. Caso real: `src/lib/queries/dev.ts:51`.
    const barra = String.raw`url.replace(/^https?:\/\//, '')`
    expect(semComentarios(`${barra}\n${NOTA}`)).toBe(limpo(`${barra}\n`, NOTA))

    // Palavra que PRECEDE valor: depois de `return` a barra só pode ser regex.
    const comReturn = String.raw`function f(x) { return /a\/b/.test(x) }`
    expect(semComentarios(`${comReturn} ${NOTA}`)).toBe(limpo(`${comReturn} `, NOTA))

    // JSX: nem o fechamento de tag nem a tag auto-fechada abrem regex.
    expect(semComentarios(`const el = <div>x</div>\n${NOTA}`)).toBe(
      limpo('const el = <div>x</div>\n', NOTA),
    )
    expect(semComentarios(`const el = <Icone tamanho={2} />\n${NOTA}`)).toBe(
      limpo('const el = <Icone tamanho={2} />\n', NOTA),
    )
  })

  // AS DUAS PROVAS SOBRE OS ARQUIVOS DE VERDADE. Os casos acima são sintéticos;
  // estes dois medem o repositório inteiro, que é onde o defeito morava sem
  // ninguém ver.
  it('o removedor não sobra nem come um caractere de nenhum arquivo', () => {
    // INVARIANTE ESTRUTURAL: comentário vira espaço do MESMO tamanho, e todo o
    // resto é copiado 1:1 — então a saída tem exatamente o comprimento da
    // entrada. É o que sustenta a promessa do módulo ("linha 274 continua sendo
    // a linha 274"), e é o que quebra na hora se o scanner abandonar o laço no
    // meio ou escrever duas vezes.
    const divergentes = FONTES.map(({ arquivo, texto }) => ({
      arquivo,
      cru: readFileSync(join(RAIZ, arquivo), 'utf8').length,
      limpo: texto.length,
    })).filter((f) => f.cru !== f.limpo)
    expect(divergentes).toEqual([])
  })

  it('nenhum comentário de linha inteira sobrevive à limpeza', () => {
    // O SINTOMA DO DEFEITO, medido no repositório: quando o scanner perdia o fio
    // (aspas dentro de classe de caracteres, barra escapada), ele passava a ler o
    // resto do arquivo como se fosse string e os `//` seguintes chegavam intactos
    // na saída — 19 arquivos, nenhum teste vermelho. Se voltar a acontecer, esta
    // linha nomeia o arquivo.
    const comSobras = FONTES.map(({ arquivo, texto }) => ({
      arquivo,
      linhas: texto.split('\n').filter((l) => /^\s*\/\//.test(l)).length,
    })).filter((f) => f.linhas > 0)
    expect(comSobras).toEqual([])
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

/**
 * `max-w-*` DE CONTAINER — o que só o casco pode declarar.
 *
 * O plano §4.1 escreve a regra assim: "`max-w-` de container fora de
 * `pagina.tsx` (permitido em `max-w-sm`/`max-w-md` de conteúdo interno, lista
 * explícita)". A primeira versão desta regra só olhava a COMBINAÇÃO
 * `mx-auto` + `max-w-*`, e a revisão adversarial mostrou que isso protegia
 * apenas o padrão ANTIGO: um wrapper `max-w-6xl` alinhado à esquerda — que é
 * exatamente o que o casco existe para monopolizar — passava calado.
 *
 * A lista do que é CONTEÚDO, e por que cada um está aqui:
 *   `xs` `sm` `md`   — caixa de aviso, coluna de texto curta, menu.
 *   `full` `none`    — não limitam nada; `max-w-full` é o antídoto de overflow.
 *   `fit` `min` `max` — medida intrínseca do próprio conteúdo.
 * Tudo o mais (`lg` para cima, `screen-*`, arbitrário) é largura de PÁGINA, e
 * sai de `LARGURAS` ou de `MEDIDA_DE_FORMULARIO`, em `pagina.tsx`.
 *
 * Formulário dentro de página cheia usa a CONSTANTE `MEDIDA_DE_FORMULARIO` — e é
 * por isso que a regra pode ser dura: quem passa a constante não escreve o
 * literal, e o varredor lê literais.
 */
const MAX_W_DE_CONTEUDO = new Set([
  'xs',
  'sm',
  'md',
  'full',
  'none',
  'fit',
  'min',
  'max',
])

function maxWDeContainer(partes: string[]): string[] {
  return partes
    .map((p) => p.slice(p.lastIndexOf(':') + 1))
    .filter((p) => p.startsWith('max-w-'))
    .filter((p) => !MAX_W_DE_CONTEUDO.has(p.slice('max-w-'.length)))
}

describe('so o casco de pagina centraliza e limita a largura', () => {
  it('o varredor sabe de QUEM e cada className', () => {
    const um = (fonte: string) => classNames(fonte)[0]
    expect(um('<div className="max-w-6xl" />')?.tag).toBe('div')
    expect(um('<DialogContent className="sm:max-w-lg" />')?.tag).toBe('DialogContent')
    // Multilinha, que e como o repositorio escreve.
    expect(um('<Card\n  size="sm"\n  className="border p-3"\n/>')?.tag).toBe('Card')
    // ⚠ Um `=>` numa prop ANTES do className quebra a varredura para tras (o
    // `>` fecha a busca). O detector devolve string vazia, e string vazia NAO
    // esta em SUPERFICIES_DE_PORTAL — ou seja, o caso duvidoso cai do lado
    // SEVERO da regra, que e onde ele tem de cair.
    expect(um('<div onClick={() => x()} className="max-w-6xl" />')?.tag).toBe('')
  })

  it('a superficie de PORTAL nao entra na regua de pagina', () => {
    const doDialogo = classNames('<DialogContent className="sm:max-w-lg" />')[0]
    expect(SUPERFICIES_DE_PORTAL.has(doDialogo.tag)).toBe(true)
    const daPagina = classNames('<div className="max-w-6xl" />')[0]
    expect(SUPERFICIES_DE_PORTAL.has(daPagina.tag)).toBe(false)
    expect(maxWDeContainer(daPagina.valor.split(/\s+/))).toEqual(['max-w-6xl'])
  })

  it('o detector distingue largura de PAGINA de largura de CONTEUDO', () => {
    expect(maxWDeContainer(['max-w-6xl'])).toEqual(['max-w-6xl'])
    expect(maxWDeContainer(['max-w-3xl'])).toEqual(['max-w-3xl'])
    expect(maxWDeContainer(['sm:max-w-lg'])).toEqual(['max-w-lg'])
    expect(maxWDeContainer(['max-w-screen-md'])).toEqual(['max-w-screen-md'])
    expect(maxWDeContainer(['max-w-[960px]'])).toEqual(['max-w-[960px]'])
    // Conteúdo interno — segue permitido, como o plano §4.1 escreve.
    expect(maxWDeContainer(['max-w-sm', 'max-w-md', 'max-w-full', 'max-w-fit'])).toEqual([])
  })

  it.each(SOB_REGRA)('$arquivo', ({ arquivo, texto }) => {
    if (ehDoSistema(arquivo)) return
    const culpados = classNames(texto)
      .flatMap(({ linha, valor, tag }) => {
        const partes = valor.split(/\s+/)
        const achados: string[] = []
        const centraliza = partes.some((p) => p === 'mx-auto' || p.endsWith(':mx-auto'))
        const limita = partes.some((p) => /(^|:)max-w-/.test(p))
        if (centraliza && limita) achados.push(`linha ${linha}: "${valor}" — centraliza e limita`)
        if (!SUPERFICIES_DE_PORTAL.has(tag)) {
          for (const largo of maxWDeContainer(partes)) {
            achados.push(`linha ${linha}: "${largo}" — largura de PAGINA fora do casco`)
          }
        }
        return achados
      })

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

describe('o espacamento das telas cabe na escala', () => {
  it.each(SOB_REGRA)('$arquivo', ({ arquivo, texto }) => {
    // A PERGUNTA é `passoForaDaEscala`, de `regua-de-classes.ts` — a MESMA que
    // `scripts/design/medir.ts` faz. Enquanto ela morava aqui dentro, o medidor
    // tinha a própria versão, sem decimais, e relatava 46 onde havia 88.
    const culpados: string[] = []
    for (const { linha, valor } of classes(texto)) {
      if (!ehStringDeClasse(valor)) continue
      for (const parte of valor.split(/\s+/)) {
        const culpado = passoForaDaEscala(parte)
        if (culpado) culpados.push(`linha ${linha}: "${culpado}"`)
      }
    }
    expect(
      culpados,
      // A escala sai da CONSTANTE, não de uma cópia escrita na frase: mensagem de
      // erro que lista uma escala diferente da que o detector usa ensina a coisa
      // errada a quem está tentando consertar.
      `${arquivo} usa espacamento fora da escala {${[...ESCALA].join(', ')}}. ` +
        `A escala e a de docs/PLANO-DESIGN-SYSTEM.md §3.1; nada de p-5, gap-7, py-10 ou ` +
        `p-[18px].\n  ` +
        culpados.join('\n  '),
    ).toEqual([])
  })
})

// 4b · NÃO ZERE O EIXO QUE VOCÊ ACABOU DE PEDIR ----------------------------

/**
 * `p-3 py-0` no MESMO `className` é quase sempre engano — e este custou nove
 * cartões.
 *
 * O `Card` do kit traz `py-(--card-spacing)`, e a intenção de quem escreve
 * `p-3 py-0` é "apaga o padding vertical do componente e me dá 12px". Só que o
 * `cn()` usa tailwind-merge, onde `p-` JÁ conflita com `py-`: `p-3` sozinho
 * apaga o `py-(--card-spacing)`. O `py-0` escrito depois não desfaz o padding do
 * componente — ele zera o `p-3` no eixo vertical, e o conteúdo fica colado nas
 * bordas de cima e de baixo.
 *
 * A suíte inteira ficou verde com esse defeito em NOVE cartões do piloto, porque
 * nenhuma regra olhava a contradição entre duas classes que, cada uma, está na
 * escala. Quem o pegou foi a revisão adversarial da F40.
 */
function zeraOEixoQuePediu(partes: string[]): string | null {
  // ⚠ A COMPARAÇÃO É DENTRO DO MESMO GRUPO DE VARIANTES — correção da revisão de
  // 31/08/2026 (achado 14). Isto descartava o prefixo ANTES de comparar, e assim
  // tratava `py-0 md:p-3` como a mesma contradição de `md:p-3 md:py-0`. Só a
  // segunda é: o tailwind-merge resolve conflito dentro de um grupo de variantes,
  // não entre grupos, então `className="py-0 md:p-3"` é legítimo (sem respiro
  // vertical no celular, padding completo a partir de `md`) e nenhum eixo é
  // zerado. Sem esta correção, a primeira tela da frente a ou b que escrevesse
  // esse padrão seria reprovada com uma mensagem mandando apagar a classe certa.
  const variante = (p: string) => p.slice(0, p.lastIndexOf(':') + 1)
  const semVariante = (p: string) => p.slice(p.lastIndexOf(':') + 1)
  for (const grupo of new Set(partes.map(variante))) {
    const doGrupo = partes.filter((p) => variante(p) === grupo).map(semVariante)
    if (!doGrupo.some((p) => /^-?p-[^[]/.test(p))) continue
    const zerado = doGrupo.find((p) => p === 'py-0' || p === 'px-0')
    if (zerado) return `${grupo}${zerado}`
  }
  return null
}

describe('nenhuma className zera o eixo que ela mesma acabou de pedir', () => {
  it('o detector reconhece o padrao', () => {
    expect(zeraOEixoQuePediu(['border', 'p-3', 'py-0', 'ring-0'])).toBe('py-0')
    expect(zeraOEixoQuePediu(['p-4', 'px-0'])).toBe('px-0')
    // Sem `p-*`, `py-0` é legítimo: é como o QuadroDeTabela apaga o respiro do kit.
    expect(zeraOEixoQuePediu(['border', 'py-0', 'ring-0'])).toBeNull()
    expect(zeraOEixoQuePediu(['p-3'])).toBeNull()
    // Vale para o token também: `p-(--card-spacing) py-0` é a mesma contradição.
    expect(zeraOEixoQuePediu(['p-(--card-spacing)', 'py-0'])).toBe('py-0')
    // `py-0` sozinho é legítimo mesmo com padding horizontal declarado à parte.
    expect(zeraOEixoQuePediu(['px-3', 'py-0'])).toBeNull()

    // ---- VARIANTES (achado 14 da revisão de 31/08/2026) --------------------
    // Grupos DIFERENTES não se anulam: o `p-3` só existe a partir do `md`, e o
    // `py-0` da tela base sobrevive. É um padrão legítimo, e a versão anterior
    // do detector o reprovava.
    expect(zeraOEixoQuePediu(['py-0', 'md:p-3'])).toBeNull()
    expect(zeraOEixoQuePediu(['p-3', 'md:py-0'])).toBeNull()
    expect(zeraOEixoQuePediu(['sm:p-3', 'md:py-0'])).toBeNull()
    // Mas o MESMO grupo é a mesma contradição de sempre, só que atrás de um
    // prefixo — e a mensagem tem de nomear a classe inteira, com a variante.
    expect(zeraOEixoQuePediu(['md:p-3', 'md:py-0'])).toBe('md:py-0')
    expect(zeraOEixoQuePediu(['sm:p-4', 'sm:px-0'])).toBe('sm:px-0')
  })

  it.each(SOB_REGRA)('$arquivo', ({ arquivo, texto }) => {
    const culpados = classNames(texto)
      .map(({ linha, valor }) => ({ linha, valor, zerado: zeraOEixoQuePediu(valor.split(/\s+/)) }))
      .filter((c) => c.zerado)
      .map((c) => `linha ${c.linha}: "${c.zerado}" anula o eixo de um p-* na mesma className`)

    expect(
      culpados,
      `${arquivo} pede um padding e o zera num eixo. Num <Card>, "p-3" SOZINHO ja apaga o ` +
        `py-(--card-spacing) do kit (tailwind-merge); o "py-0" escrito depois zera o proprio ` +
        `p-3 e cola o conteudo nas bordas.\n  ` +
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
    // `ehMolduraAMao` mora em `regua-de-classes.ts` e é a MESMA que
    // `scripts/design/medir.ts` usa — inclusive a isenção da borda TRACEJADA do
    // estado vazio, a única moldura à mão legítima do produto.
    const culpados = classNames(texto)
      .filter(({ valor }) => ehMolduraAMao(valor))
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

/**
 * O texto de UM arquivo da rota — a TELA (`page.tsx`) ou o ESQUELETO
 * (`loading.tsx`).
 *
 * SEM OS COMENTÁRIOS, aqui pelo motivo OPOSTO ao das outras regras: a busca é
 * por PRESENÇA, e um comentário que citasse o casco pelo nome faria uma tela
 * que não o usa passar no teste.
 *
 * ⚠ UM ARQUIVO, NÃO A PASTA INTEIRA — correção da revisão de 31/08/2026
 * (achado 13). Isto lia TODOS os `.tsx` não-`loading` da pasta e os concatenava,
 * e as regras 7 e 8 perguntam por `.includes(...)`: bastava um `error.tsx`, um
 * `not-found.tsx` ou um painel irmão montar `<Pagina>` para que uma `page.tsx`
 * que voltou a escrever o próprio container passasse VERDE. A regra 8 herdava o
 * mesmo defeito por outro caminho — `larguraDeclarada` lia a concatenação e
 * podia pegar a variante do arquivo errado. Quem é a tela é a `page.tsx`, e
 * quem é o esqueleto é o `loading.tsx`; mais ninguém.
 *
 * Hoje nenhuma das 29 pastas de rota tem painel colocado ao lado da página, então
 * a mudança não reprova nada. Se uma frente futura criar um, a saída é NOMEAR o
 * arquivo extra — como a lista `PENDENTES` já faz —, nunca voltar a concatenar a
 * pasta.
 */
function fonteDaRota(dir: string, esqueleto: boolean): string {
  return semComentarios(
    readFileSync(join(dir, esqueleto ? 'loading.tsx' : 'page.tsx'), 'utf8'),
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
