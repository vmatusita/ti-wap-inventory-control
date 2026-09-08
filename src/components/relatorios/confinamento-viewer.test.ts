import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

// CONFINAMENTO DO VISUALIZADOR POR SENHA — o tripwire dos LINKS (F29).
//
// O irmão deste teste (`queries/relatorios/fronteira-viewer.test.ts`) guarda o que o
// viewer pode LER. Este guarda para onde ele pode IR, que é a outra metade da mesma
// regra e não tinha rede nenhuma.
//
// Por que importa: quem entra pela senha de acesso não tem sessão do Supabase. O
// proxy (`src/proxy.ts`) só aceita o cookie de visualização em `/relatorios/**`;
// qualquer outra rota o manda para `/login`. Um `<Link href="/ativos/…">` que escape
// de uma guarda não dá "acesso negado" — ele DESLOGA o gestor no meio da leitura, e
// o sintoma que chega à TI é "o relatório parou de funcionar".
//
// A F29 acrescentou seis links nessa superfície (paginação do arquivo, período
// anterior/próximo, "ver no ao vivo", a marca do header do viewer). Todos internos —
// e este teste é o que impede o sétimo de não ser.

const RAIZ = join(process.cwd(), 'src')

// ---------------------------------------------------------------------------
// A SUPERFÍCIE, DERIVADA DO GRAFO DE IMPORTS (F50)
// ---------------------------------------------------------------------------
// Até a F50 a superfície vinha da PASTA: seis caminhos fixos mais `readdirSync` de
// `components/relatorios/`. Funcionava enquanto tudo o que o viewer renderiza morasse
// naquela pasta — e a F61 quebra essa premissa de propósito, levando componentes de
// `layout/` para dentro das telas de relatório. Um componente de `layout/` com um
// `href` para fora entraria HOJE sem que nada acusasse.
//
// Agora a superfície é o FECHO TRANSITIVO de imports (relativos e por alias `@/`,
// parando na fronteira de `src/`) a partir das RAÍZES abaixo.
//
// ⚠ AS RAÍZES INCLUEM O CHROME DO VIEWER, e isso não é conservadorismo: é correção.
// Medido na F50 — partir só das rotas de `/relatorios/**` perde `viewer-header.tsx` e
// `viewer-nav.tsx`, porque os dois são importados por `app/(app)/layout.tsx`, o layout
// do GRUPO INTEIRO, cujo caminho não tem o segmento `relatorios`. São justamente as
// duas peças que carregam a navegação real do visualizador (é `viewer-nav.tsx` que a
// última asserção deste arquivo confere ter `lerHrefAoVivo`). Derivar "só das rotas"
// teria trocado esta rede por um furo — com cara de melhoria.
//
// Tomar `(app)/layout.tsx` como raiz resolveria o mesmo problema pelo caminho errado:
// ele serve TAMBÉM o shell do operador (sidebar, paleta, menu), e arrastaria para cá
// dezenas de `href` para `/ativos`, `/admin`, `/movimentacoes` — todos legítimos, e
// todos falsos positivos aqui. A raiz certa é o ramo que o VIEWER renderiza.
const RAIZES = [
  join(RAIZ, 'app', '(app)', 'relatorios', '[filial]', 'page.tsx'),
  join(RAIZ, 'app', '(app)', 'relatorios', 'gerados', 'page.tsx'),
  join(RAIZ, 'app', '(app)', 'relatorios', 'gerados', '[id]', 'page.tsx'),
  join(RAIZ, 'components', 'layout', 'viewer-header.tsx'),
  join(RAIZ, 'components', 'layout', 'viewer-nav.tsx'),
  join(RAIZ, 'components', 'layout', 'nav-rolavel.tsx'),
]

// A superfície nunca pode ENCOLHER sem que alguém mexa neste número. Uma refatoração
// que quebre a resolução de imports faria o fecho despencar para as 6 raízes e o
// arquivo inteiro passaria a varrer quase nada — verde, e sem rede. A catraca só
// SOBE: quando a superfície crescer de verdade, atualize o número e diga por quê.
//
// F50 (08/09/2026): medido **131** arquivos no fecho, contra 46 da varredura por
// pasta. Sete deles vêm de `components/layout/` — `filtro-filial`, `link-ajuda`,
// `marca`, `nav-rolavel`, `progresso-navegacao`, `viewer-header`, `viewer-nav` —, e
// é essa faixa que a pasta não cobria.
//
// O piso é 120 e não 131 de propósito: um arquivo a menos por refatoração legítima
// (dois componentes que viram um) não deve pedir commit nesta linha. Uma queda de
// dez é outra conversa, e é a que este número existe para forçar.
const SUPERFICIE_MINIMA = 120

const EXTENSOES = ['.ts', '.tsx', '/index.ts', '/index.tsx']

/** Resolve um especificador de import para um arquivo real dentro de `src/`, ou `null`. */
function resolverImport(deArquivo: string, spec: string): string | null {
  let base: string
  if (spec.startsWith('@/')) base = join(RAIZ, spec.slice(2))
  else if (spec.startsWith('.')) base = join(dirname(deArquivo), spec)
  else return null // pacote externo: fora de src/, não é superfície nossa
  for (const ext of ['', ...EXTENSOES]) {
    const tentativa = base + ext
    if (existsSync(tentativa) && statSync(tentativa).isFile()) return tentativa
  }
  return null
}

/**
 * O fecho transitivo de imports a partir das raízes.
 *
 * ⚠ Só enxerga import ESTÁTICO — é o que dá para conferir sem executar. Medido na
 * F50: zero `next/dynamic`, `React.lazy` ou `await import(...)` nas rotas e nos
 * componentes alcançados, então hoje o grafo estático é completo. Se um import
 * dinâmico aparecer, esta varredura fica cega nele e a peça precisa virar raiz.
 */
function arquivosDaSuperficie(): string[] {
  const vistos = new Set<string>()
  const fila = [...RAIZES]
  while (fila.length) {
    const atual = fila.pop()!
    if (vistos.has(atual)) continue
    vistos.add(atual)
    const fonte = readFileSync(atual, 'utf8')
    // `import … from 'x'`, `export … from 'x'` e `import 'x'`.
    for (const m of fonte.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) {
      const alvo = resolverImport(atual, m[1])
      if (alvo && !vistos.has(alvo)) fila.push(alvo)
    }
  }
  // `acesso-form.tsx` é a porta PÚBLICA (a tela de digitar a senha), anterior à sessão
  // de visualização: o "/login" dela é para o operador que caiu ali por engano, e não
  // um link oferecido a quem já está lendo relatório. Antes ele era excluído À MÃO de
  // um `readdirSync`; agora ele simplesmente não é alcançado, porque a rota
  // `/relatorios/acesso` não é raiz. O motivo continua escrito porque continua sendo o
  // motivo — e porque é ele que explica por que a rota pública ficou fora das raízes.
  return [...vistos].sort()
}

// `href="/x"`, `href={'/x'}` e `href={`/x/${id}`}` — só os LITERAIS, que é o que dá
// para conferir estaticamente. Href vindo de variável entra na lista de exceções
// abaixo, com o motivo.
//
// O varredor NÃO tira comentários antes de procurar, e isso é deliberado: para
// tirá-los seria preciso decidir onde um `//` é comentário e onde é o começo de
// `"//evil.com"` dentro de uma string — errar nessa conta ESCONDERIA um vazamento
// real. Um tripwire pode dar falso positivo (alguém escreveu um exemplo num
// comentário, o teste fica vermelho e a pessoa reescreve a frase); não pode dar
// falso negativo. A F32 pagou uma rodada vermelha por isso, em viewer-nav.tsx.
// Os dois casos de aspas fecham em si mesmos; o template abre e é entregue ao
// extrator abaixo, que sabe contar aninhamento (ver o ⚠ logo em seguida).
const RE_HREF = /href=(?:"([^"]*)"|\{'([^']*)'\}|\{`)/g

// ⚠ FALSO NEGATIVO CORRIGIDO NA F50 — template com crase ANINHADA.
//
// Até aqui o terceiro ramo do `RE_HREF` era ``\{`([^`]*)`\}``, que exige um template
// SEM nenhuma crase por dentro. Só que crase aninhada é JSX corriqueiro, e a
// superfície tinha um caso real: `link-ajuda.tsx` escreve
//
//     href={`/ajuda/${pagina}${ancora ? `#${ancora}` : ''}`}
//
// — o `` `#${ancora}` `` interno faz o regex parar cedo e não casar NADA. O href
// sumia da varredura inteira. Enquanto esse componente estava fora da superfície
// (por morar em `layout/`), o defeito não tinha consequência; a derivação por
// imports o trouxe para dentro, e aí um href não-interno estaria sendo varrido por
// um detector que não o enxerga.
//
// É exatamente o modo de falha que o comentário acima proíbe: falso positivo custa
// uma frase reescrita, falso negativo custa o vazamento. Por isso o fim do template
// não é decidido por regex — o extrator abaixo lê contando `${` e `}`, e só fecha na
// crase do nível de fora.
function hrefDeTemplate(fonte: string, inicio: number): { href: string; fim: number } | null {
  let i = inicio
  let profundidade = 0
  let texto = ''
  while (i < fonte.length) {
    const c = fonte[i]
    if (c === '\\') {
      texto += fonte.slice(i, i + 2)
      i += 2
      continue
    }
    if (c === '$' && fonte[i + 1] === '{') {
      profundidade++
      texto += '${'
      i += 2
      continue
    }
    if (c === '}' && profundidade > 0) {
      profundidade--
      texto += '}'
      i++
      continue
    }
    // Crase no nível de fora fecha o template; dentro de `${…}` ela abre/fecha um
    // template interno, que não nos interessa senão para não parar aqui.
    if (c === '`' && profundidade === 0) return { href: texto, fim: i }
    texto += c
    i++
  }
  return null
}

function hrefsLiterais(fonte: string): string[] {
  const achados: string[] = []
  RE_HREF.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RE_HREF.exec(fonte))) {
    if (m[1] !== undefined || m[2] !== undefined) {
      achados.push(m[1] ?? m[2] ?? '')
      continue
    }
    const t = hrefDeTemplate(fonte, RE_HREF.lastIndex)
    if (t) {
      achados.push(t.href)
      RE_HREF.lastIndex = t.fim
    }
  }
  return achados
}

function ehInterno(href: string): boolean {
  // Fragmento da própria página (`#resumo`) ou rota de relatório.
  return href.startsWith('#') || href.startsWith('/relatorios')
}

// Destinos FORA de /relatorios que existem nesta superfície — cada um atrás de uma
// guarda de cargo. O teste confere que a guarda continua no arquivo: apagá-la é o
// jeito realista de o link vazar, muito mais do que alguém escrever um href novo.
//
// `guardaEm` (F50) — a guarda de um componente REUSADO não mora nele. A derivação por
// imports trouxe `layout/link-ajuda.tsx` para a superfície, e ele não tem (nem deve
// ter) `ehOperador` por dentro: é um botão genérico, usado em dezenas de telas. Quem
// decide se o viewer o vê é a PÁGINA. Então a exceção aponta os arquivos onde a
// guarda de verdade está, e é lá que ela é conferida — mesma disciplina das outras
// três (apagar a guarda é o jeito realista de o link vazar), só que no lugar certo.
const EXCECOES: {
  arquivo: string
  href: string
  guarda: string
  porque: string
  guardaEm?: { arquivo: string; guarda: string }[]
}[] = [
  {
    arquivo: 'celulas.tsx',
    href: '/ativos/${ativoId}',
    guarda: 'ehOperador && ativoId',
    porque: 'patrimônio vira link para a ficha só para o operador logado (F16/T3)',
  },
  {
    arquivo: 'manutencao-casos.tsx',
    href: '/ativos/${c.ativoId}',
    guarda: 'ehOperador && c.ativoId',
    porque: 'mesmo caso do patrimônio das tabelas, no card de manutenção',
  },
  {
    arquivo: 'pendencias-chips.tsx',
    href: '/pendencias?tipo=${p.chave}',
    guarda: 'comLink &&',
    porque:
      'a seção de Pendências só existe para o operador; `comLink` espelha `links`, que o snapshot e o viewer nunca recebem',
  },
  {
    arquivo: 'link-ajuda.tsx',
    href: '/ajuda/${pagina}${ancora ? `#${ancora}` : \'\'}',
    guarda: 'o gate de cada página que monta <LinkAjuda>',
    porque:
      'o botão de ajuda é genérico e não tem cargo por dentro; quem o esconde do viewer é a página que o monta (F50)',
    // ⚠ As duas páginas escrevem a MESMA pergunta de formas diferentes — uma usa a
    // variável `ehOperador`, a outra compara `acesso.modo` na hora. Por isso cada
    // chamador traz o seu literal: uma guarda única aqui só passaria por acidente,
    // e passar por acidente é o que faz uma trava envelhecer sem ninguém notar.
    guardaEm: [
      {
        arquivo: 'app/(app)/relatorios/[filial]/page.tsx',
        guarda: '{ehOperador && ( <LinkAjuda',
      },
      {
        arquivo: 'app/(app)/relatorios/gerados/page.tsx',
        guarda: "{acesso.modo === 'operador' && ( <LinkAjuda",
      },
    ],
  },
]

/**
 * A guarda da exceção continua no lugar?
 *
 * Sem `guardaEm`, ela mora no próprio arquivo do href (as três exceções originais).
 * Com `guardaEm`, mora nos CHAMADORES, e TODOS precisam tê-la: basta uma página
 * montar o componente sem o gate para o link vazar naquela tela.
 */
function guardaIntacta(
  excecao: { guarda: string; guardaEm?: { arquivo: string; guarda: string }[] },
  fonteDoArquivo: string,
): boolean {
  if (!excecao.guardaEm) return fonteDoArquivo.includes(excecao.guarda)
  // Espaços normalizados: o gate e a montagem ficam em linhas diferentes, e um
  // reflow do Prettier não pode derrubar a trava (mesma disciplina do teste dos
  // segmentos, mais abaixo).
  return excecao.guardaEm.every((g) =>
    readFileSync(join(RAIZ, ...g.arquivo.split('/')), 'utf8')
      .replace(/\s+/g, ' ')
      .includes(g.guarda),
  )
}

describe('confinamento do visualizador: nenhum link da superfície de relatório sai de /relatorios/**', () => {
  const arquivos = arquivosDaSuperficie()

  it('enxerga a superfície (sanidade do caminho)', () => {
    expect(arquivos.length).toBeGreaterThan(10)
  })

  // A catraca. Ver o comentário de `SUPERFICIE_MINIMA`: o modo realista de esta rede
  // sumir não é alguém apagá-la, é a derivação parar de resolver e o fecho encolher
  // em silêncio, deixando o arquivo verde e vazio.
  it('a superfície derivada não ENCOLHEU (catraca que só sobe)', () => {
    expect(
      arquivos.length,
      `o fecho de imports caiu para ${arquivos.length} (mínimo ${SUPERFICIE_MINIMA}). ` +
        'Ou a resolução de imports quebrou, ou a superfície mudou de verdade — no segundo caso, suba o número e escreva por quê.',
    ).toBeGreaterThanOrEqual(SUPERFICIE_MINIMA)
  })

  // A prova de que trocamos a rede por uma rede MAIOR, não por um furo: tudo o que a
  // superfície por PASTA cobria continua coberto. Se a derivação perder qualquer um
  // destes, o teste diz o nome do arquivo perdido.
  it('a superfície derivada CONTÉM tudo o que a superfície por pasta continha', () => {
    const dirRel = join(RAIZ, 'components', 'relatorios')
    const antiga = [
      ...RAIZES,
      ...readdirSync(dirRel)
        .filter((f) => f.endsWith('.tsx') && f !== 'acesso-form.tsx')
        .map((f) => join(dirRel, f)),
    ]
    const perdidos = antiga
      .filter((a) => !arquivos.includes(a))
      .map((a) => a.slice(RAIZ.length + 1).split(/[\\/]/).join('/'))
    expect(
      perdidos,
      'a derivação por imports perdeu arquivo que a varredura por pasta cobria — isso é trocar rede por furo',
    ).toEqual([])
  })

  // O que a pasta NÃO cobria e agora entra: componentes de `layout/` alcançados por
  // tela de relatório. É o pré-requisito declarado da F61 — sem isto, ela levaria
  // componentes de `layout/` para dentro do viewer fora de qualquer varredura.
  it('a superfície alcança componentes de layout/ importados por tela de relatório', () => {
    const deLayout = arquivos
      .filter((a) => a.includes(join('components', 'layout')))
      .map((a) => a.split(/[\\/]/).pop()!)
    expect(deLayout, 'nenhum componente de layout/ no fecho — a derivação não está seguindo imports').toContain(
      'link-ajuda.tsx',
    )
  })

  it('todo href literal é interno, ou é uma exceção registrada com a guarda intacta', () => {
    const vazamentos: string[] = []
    for (const caminho of arquivos) {
      const nome = caminho.split(/[\\/]/).pop()!
      const fonte = readFileSync(caminho, 'utf8')
      for (const href of hrefsLiterais(fonte)) {
        if (ehInterno(href)) continue
        const excecao = EXCECOES.find((e) => e.arquivo === nome && e.href === href)
        if (!excecao) {
          vazamentos.push(`${nome}: href "${href}" sai de /relatorios e não está registrado`)
          continue
        }
        if (!guardaIntacta(excecao, fonte)) {
          vazamentos.push(
            `${nome}: a guarda "${excecao.guarda}" sumiu — o href "${href}" ficaria exposto ao visualizador`,
          )
        }
      }
    }
    expect(
      vazamentos,
      'o visualizador por senha não tem sessão do Supabase: link fora de /relatorios/** o DESLOGA',
    ).toEqual([])
  })

  // O detector precisa de guarda própria: um regex que pare de casar transformaria
  // este teste numa varredura que passa a seco e não guarda nada.
  it('o detector de href realmente acha (guarda do próprio teste)', () => {
    expect(hrefsLiterais('<Link href="/ativos/1">')).toEqual(['/ativos/1'])
    expect(hrefsLiterais('<a href={`/relatorios/${s}`}>')).toEqual(['/relatorios/${s}'])
    expect(hrefsLiterais("<Link href={'/pendencias'}>")).toEqual(['/pendencias'])
    // …e que ele reprovaria um vazamento real.
    expect(hrefsLiterais('<Link href="/ativos">').every(ehInterno)).toBe(false)
    // F50 — o caso que ele NÃO achava: template com crase aninhada. Este `expect` é o
    // que impede a correção de ser desfeita por um "simplifiquei o regex".
    expect(hrefsLiterais('<Link href={`/ajuda/${p}${a ? `#${a}` : \'\'}`}>')).toEqual([
      "/ajuda/${p}${a ? `#${a}` : ''}",
    ])
  })

  it('as exceções registradas ainda existem (a lista não envelheceu para MAIS)', () => {
    for (const e of EXCECOES) {
      const caminho = arquivos.find((a) => a.endsWith(e.arquivo))
      expect(caminho, `${e.arquivo} saiu da superfície — revise a exceção`).toBeDefined()
      const fonte = readFileSync(caminho!, 'utf8')
      expect(guardaIntacta(e, fonte), `${e.arquivo}: a guarda de "${e.porque}" sumiu`).toBe(true)
    }
  })

  // Os KPI tiles são o quarto caminho para fora, e o mais sutil: o href vem por PROP
  // (`links`), não por literal, então o varredor acima não o vê. Quem decide é a
  // PÁGINA — e as duas decisões precisam continuar como estão.
  it('os KPI tiles só recebem `links` no ao vivo E para o operador', () => {
    const aoVivo = readFileSync(
      join(RAIZ, 'app', '(app)', 'relatorios', '[filial]', 'page.tsx'),
      'utf8',
    )
    expect(aoVivo).toContain('const links = ehOperador ? linksKpiAtivos(filialId) : undefined')

    // O snapshot congelado NUNCA passa `links` — nem para o operador: aqueles tiles
    // descrevem o inventário de um período, e levariam para a lista de hoje.
    const snapshot = readFileSync(
      join(RAIZ, 'app', '(app)', 'relatorios', 'gerados', '[id]', 'page.tsx'),
      'utf8',
    )
    expect(snapshot).not.toContain('links=')
    expect(snapshot).not.toContain('linksKpiAtivos')
  })

  // ===========================================================================
  // F32 — as duas CATEGORIAS NOVAS de saída que o varredor de href não enxerga.
  // ===========================================================================

  // RV-12b abriu a primeira: clicar num segmento das barras empilhadas navega
  // para `/ativos?…` por `router.push()`, uma chamada de FUNÇÃO. Não existe
  // `href` nenhum para o regex achar — é uma classe de vazamento que o tripwire
  // original não cobria, e por isso ela ganha prova própria, no molde dos tiles.
  it('o clique nos segmentos (RV-12) só é habilitado no ao vivo E para o operador', async () => {
    const aoVivo = readFileSync(
      join(RAIZ, 'app', '(app)', 'relatorios', '[filial]', 'page.tsx'),
      'utf8',
    )
    expect(aoVivo).toContain(
      'const recorteFilial = ehOperador ? recorteFilialAtivos(filialId) : undefined',
    )

    const snapshot = readFileSync(
      join(RAIZ, 'app', '(app)', 'relatorios', 'gerados', '[id]', 'page.tsx'),
      'utf8',
    )
    expect(snapshot).not.toContain('recorteFilial')
    expect(snapshot).not.toContain('recorteFilialAtivos')

    // Segunda trava, no consumidor: o corpo só repassa o recorte se `links`
    // existir. A prova era um literal (`recorteFilial={links ? recorteFilial
    // : undefined}`) preso à formatação exata do fonte: um reflow do
    // Prettier que quebrasse essa linha em >100 colunas deixaria o teste
    // vermelho sem defeito nenhum, e a "correção" mais fácil (afrouxar para
    // `toContain('recorteFilial')`) apagaria a guarda de verdade. Por isso a
    // prova virou COMPORTAMENTO da função pura `recorteParaSegmento` (mesmo
    // molde do teste de `hrefDoRelatorioVisitado` logo abaixo): exercita a
    // guarda com o caso perigoso (sem `links`, com recorte) e confirma que
    // ela barra. A asserção de fiação continua abaixo, mas normalizando os
    // espaços do fonte — imune a quebra de linha, sensível a apagar a guarda.
    const { recorteParaSegmento } = await import('@/lib/relatorios/cliques-grafico')
    expect(recorteParaSegmento(true, '&filial=7')).toBe('&filial=7')
    expect(recorteParaSegmento(false, '&filial=7')).toBeUndefined()

    const corpo = readFileSync(
      join(RAIZ, 'components', 'relatorios', 'corpo-relatorio-v2.tsx'),
      'utf8',
    )
    const corpoNormalizado = corpo.replace(/\s+/g, ' ')
    expect(corpoNormalizado).toContain(
      'recorteFilial={recorteParaSegmento(Boolean(links), recorteFilial)}',
    )
  })

  // RV-17 abriu a segunda: o "Ao vivo" do header do viewer deixou de ser um
  // literal e passou a sair de `sessionStorage` — que é editável pelo devtools.
  // O varredor, que só lê literais, ficaria cego justamente onde o valor deixou
  // de ser constante. A prova real é a função pura: ela não PODE devolver nada
  // fora de /relatorios/**, e é isso que se exercita aqui, com entrada hostil.
  it('o href memorizado do "Ao vivo" (RV-17) nunca sai de /relatorios/**', async () => {
    const { hrefDoRelatorioVisitado } = await import(
      '@/components/relatorios/relatorio-visitado'
    )
    const hostis: unknown[] = [
      '../admin',
      '../../login',
      '//evil.com',
      'https://evil.com',
      'javascript:alert(1)',
      '/ativos',
      'geral?x=1',
      'geral#frag',
      'gerados',
      'acesso',
      'a'.repeat(500),
      '',
      123,
      null,
      undefined,
      {},
      [],
    ]
    for (const bruto of hostis) {
      const href = hrefDoRelatorioVisitado(bruto)
      expect(href.startsWith('/relatorios/'), `entrada ${String(bruto)} escapou: ${href}`).toBe(
        true,
      )
      expect(/[:?#%\\]/.test(href), `entrada ${String(bruto)} passou caractere de escape`).toBe(
        false,
      )
    }
    // E o caminho feliz continua funcionando (a guarda não pode ser "recuse tudo").
    expect(hrefDoRelatorioVisitado('matriz')).toBe('/relatorios/matriz')
  })

  it('o header do viewer continua tirando o href da função validada, não de um literal solto', () => {
    const nav = readFileSync(join(RAIZ, 'components', 'layout', 'viewer-nav.tsx'), 'utf8')
    expect(nav).toContain('@/components/relatorios/relatorio-visitado')
    expect(nav).toContain('lerHrefAoVivo')
  })
})
