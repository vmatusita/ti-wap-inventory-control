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
//
// F68 (19/11/2026) — A SUPERFÍCIE MUDOU DE LUGAR. O visualizador por senha não entra mais pelas rotas do grupo `(app)`:
// ele entra pela PORTA PÚBLICA DA EMPRESA, `/r/<slug>/relatorios/**` (`src/app/r/**`), com o cabeçalho próprio
// (`viewer-header.tsx` + `viewer-nav.tsx`). As raízes passam a ser TODA a árvore pública — derivada do disco, não
// redigitada — e "interno" passa a ser `/r/…` (a porta). As páginas do OPERADOR em `(app)/relatorios/**` saíram da
// superfície: quem as abre é operador logado, com o shell inteiro. Os destinos da porta saem de `caminhoDaPorta`
// (lib/auth/porta-rotas.ts, função pura testada abaixo com entradas hostis), nunca de literal solto.
function arvoreDaPorta(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    // `.ts` também: um `route.ts` ou `loading.ts` na árvore é superfície da porta tanto quanto uma página
    e.isDirectory() ? arvoreDaPorta(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  )
}
const RAIZES = [
  // a ENTRADA (`/r/<slug>/relatorios/acesso`) fica fora: é anterior à sessão — ver o motivo no fim de arquivosDaSuperficie
  ...arvoreDaPorta(join(RAIZ, 'app', 'r')).filter((a) => !a.includes(join('relatorios', 'acesso'))),
  join(RAIZ, 'components', 'layout', 'viewer-header.tsx'),
  join(RAIZ, 'components', 'layout', 'viewer-nav.tsx'),
]

// A superfície nunca pode ENCOLHER sem que alguém mexa neste número. Uma refatoração
// que quebre a resolução de imports faria o fecho despencar para as 6 raízes e o
// arquivo inteiro passaria a varrer quase nada — verde, e sem rede. A catraca só
// SOBE: quando a superfície crescer de verdade, atualize o número e diga por quê.
//
// F50 (08/09/2026): medido **134** arquivos no fecho (hoje **158** — ver a nota F61
// abaixo), contra 46 da varredura por
// pasta. Sete deles vêm de `components/layout/` — `filtro-filial`, `link-ajuda`,
// `marca`, `nav-rolavel`, `progresso-navegacao`, `viewer-header`, `viewer-nav` —, e
// é essa faixa que a pasta não cobria.
//
// O piso é 125 e não 134 de propósito: um arquivo a menos por refatoração legítima
// (dois componentes que viram um) não deve pedir commit nesta linha. Uma queda de
// DEZ é outra conversa, e é a que este número existe para forçar — 134 − 10 = 124,
// abaixo do piso, então ela reprova.
//
// ⚠ A folga é de NOVE, e o número acima tem de acompanhar o fecho. A revisão
// adversarial da F50 pegou as duas coisas erradas de uma vez: o comentário dizia
// 131 (o fecho no commit que criou a trava) enquanto o fecho já era 134 — a própria
// F50 acrescentou `lib/escopo/chave.ts`, `auto-refresh-decisao.ts` e
// `assinatura-realtime.ts` depois —, e o piso 120 dava folga de 14, o que tornava a
// frase "uma queda de dez" literalmente falsa. Comentário que promete uma margem que
// o número não entrega é pior do que comentário nenhum: quem lê acha que está
// protegido de algo de que não está.
//
// F61 (17/09/2026): o fecho é **158**, e o piso passa a **149** — os dois números
// escritos aqui de propósito, porque a folga de nove só é verdade enquanto o piso
// acompanhar o fecho. A F61 acrescentou três arquivos à superfície, e todos pela
// conversão dos componentes de relatório para os componentes de SISTEMA (é a
// dependência que a ficha da fase declarava): `components/layout/quadro-de-tabela.tsx`
// e `components/ui/card.tsx` (as seis tabelas do relatório), e
// `lib/identidade/sistema.ts` (a `Marca`, que já estava no fecho, passou a ler a
// sigla e o nome da fonte única). Nenhum deles escreve `href`, que é o que esta
// trava mede — a varredura abaixo continua valendo arquivo por arquivo.
//
// F68 (19/11/2026): o fecho é **113**, e o piso passa a **104** (a mesma folga de nove). Ele CAIU porque a superfície
// mudou de natureza: a porta só serve os relatórios GERADOS até a F68B — o ao vivo (a página `[filial]` do operador, com
// o realtime, o seletor de período, as abas de filial e o "Gerar relatório") não é mais do visualizador. Os seis
// componentes da pasta que saíram do fecho estão NOMEADOS em `SO_O_AO_VIVO`, abaixo, com o motivo.
const SUPERFICIE_MINIMA = 104

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
  // um `readdirSync`; agora ele simplesmente não é alcançado, porque a rota da entrada
  // (F68: `/r/<slug>/relatorios/acesso`) não é raiz. O motivo continua escrito porque continua sendo o
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
  // Fragmento da própria página (`#resumo`) ou a PORTA (F68: `/r/…`). Os endereços antigos `/relatorios/**` são do
  // operador (sem operador, o proxy os manda em 308 para a porta da legada).
  // Sem travessia: `/r/../ativos` começa com `/r/` e não é da porta.
  return (href.startsWith('#') || href.startsWith('/r/')) && !href.includes('..')
}

// Os destinos de NAVEGAÇÃO por código — `redirect(…)`, `permanentRedirect(…)`, `router.push/replace(…)` e
// `window.location` —, que o varredor de `href` não vê. Só o PREFIXO literal (até o primeiro `${`) é conferível: um destino
// que começa por expressão (`redirect(entradaDaPorta(…))`, um template que abre com `${pathname}`) sai de função testada
// ou da própria URL, e passa.
const RE_NAVEGACAO =
  /\b(?:redirect|permanentRedirect|router\.push|router\.replace|location\.assign|location\.replace)\(\s*(['"`])([^'"`$]*)|\blocation(?:\.href)?\s*=\s*(['"`])([^'"`$]*)/g
function destinosDeNavegacao(fonte: string): string[] {
  return [...fonte.matchAll(RE_NAVEGACAO)].map((m) => m[2] ?? m[4] ?? '').filter((d) => d.length > 0)
}

// F68 — os componentes da pasta `components/relatorios/` que só o AO VIVO usa, e que por isso saíram da superfície da
// porta até a F68B (o ao vivo pela porta). Lista FECHADA: um componente a mais fora do fecho reprova o teste da pasta.
const SO_O_AO_VIVO = [
  'filial-tabs.tsx', // as abas de filial do ao vivo
  'gerar-relatorio-dialog.tsx', // "Gerar relatório" — escrita do operador
  'lembrar-relatorio-visitado.tsx', // a memória da última filial vista (RV-17), só do ao vivo
  'periodo-filtro.tsx', // o seletor de período do ao vivo
  'realtime-refresh.tsx', // o canal do operador no ao vivo
  'viewer-auto-refresh.tsx', // o refresh de 60 s do visualizador no ao vivo — volta com a F68B
]

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
  ausenteNaPorta?: string[]
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
    // F68: na PORTA, a guarda é a AUSÊNCIA — nenhum arquivo da árvore `src/app/r/**` monta `<LinkAjuda` nem passa
    // `ajuda=` ao `CabecalhoDaPagina` (que é por onde o `pagina.tsx` traz o `LinkAjuda` para o fecho).
    ausenteNaPorta: ['<LinkAjuda', 'ajuda='],
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
  excecao: { guarda: string; guardaEm?: { arquivo: string; guarda: string }[]; ausenteNaPorta?: string[] },
  fonteDoArquivo: string,
): boolean {
  // F68: a guarda pela AUSÊNCIA em toda a árvore da porta
  if (excecao.ausenteNaPorta) {
    return arvoreDaPorta(join(RAIZ, 'app', 'r')).every((a) => {
      const f = readFileSync(a, 'utf8')
      return excecao.ausenteNaPorta!.every((proibido) => !f.includes(proibido))
    })
  }
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

describe('confinamento do visualizador: nenhum link da superfície da PORTA sai de /r/** (F68)', () => {
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
        // F60 — `.test.tsx` fora: a varredura por pasta (F29) nasceu quando o Vitest nem rodava
        // `.test.tsx` (o projeto `componentes` é da F45), então "tudo o que a pasta continha" nunca
        // incluiu teste — só componente que o viewer renderiza. O primeiro teste de componente
        // desta pasta (`aviso-teto-tabela.test.tsx`) não é superfície: não é importado por rota
        // nenhuma, e a derivação por imports está certa em não alcançá-lo.
        .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx') && f !== 'acesso-form.tsx')
        .map((f) => join(dirRel, f)),
    ]
    // F68: menos os componentes que só o AO VIVO usa (SO_O_AO_VIVO, nominal) — e eles estão de fato fora do fecho
    for (const n of SO_O_AO_VIVO) expect(arquivos.some((a) => a.endsWith(n)), `${n} voltou ao fecho — tire-o de SO_O_AO_VIVO`).toBe(false)
    const perdidos = antiga
      .filter((a) => !SO_O_AO_VIVO.includes(a.split(/[\\/]/).pop()!))
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
      'o visualizador por senha não tem sessão do Supabase: link fora da porta (/r/**) o tira da porta',
    ).toEqual([])
  })

  it('todo destino LITERAL de navegação por código (redirect, router.push, location) é interno (F68)', () => {
    const fora: string[] = []
    for (const caminho of arquivos) {
      const nome = caminho.split(/[\\/]/).pop()!
      // `?…` só troca a busca da MESMA página (o `router.replace(\`?${nova}\`)` das barras): não sai de onde está
      for (const d of destinosDeNavegacao(readFileSync(caminho, 'utf8')))
        if (!ehInterno(d) && !d.startsWith('?')) fora.push(`${nome}: "${d}"`)
    }
    expect(fora, 'um redirect/push literal para fora da porta tira o visualizador dela').toEqual([])
    // a guarda do próprio detector
    expect(destinosDeNavegacao("redirect('/ativos')")).toEqual(['/ativos'])
    expect(destinosDeNavegacao('router.push(`/login?x=${y}`)')).toEqual(['/login?x='])
    expect(destinosDeNavegacao("window.location.href = '/login'")).toEqual(['/login'])
    expect(destinosDeNavegacao('redirect(entradaDaPorta(slug))')).toEqual([])
    expect(ehInterno('/r/../ativos')).toBe(false)
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

  // Os KPI tiles são o quarto caminho para fora, e o mais sutil: o href vem por PROP (`links`), não por literal, então o
  // varredor acima não o vê. Quem decide é a PÁGINA. F68: a porta só tem o snapshot congelado, e ele NUNCA passa
  // `links` — nem o recorte dos segmentos (RV-12): aqueles destinos levam para `/ativos`, que não é da porta.
  it('a porta nunca passa `links` nem o recorte dos segmentos ao corpo do relatório (F68)', async () => {
    for (const a of arvoreDaPorta(join(RAIZ, 'app', 'r'))) {
      const f = readFileSync(a, 'utf8')
      expect(f, a).not.toContain('links=')
      expect(f, a).not.toContain('linksKpiAtivos')
      expect(f, a).not.toContain('recorteFilial')
    }
    // a segunda trava, no consumidor (a mesma de antes): o corpo só repassa o recorte se `links` existir
    const { recorteParaSegmento } = await import('@/lib/relatorios/cliques-grafico')
    expect(recorteParaSegmento(true, '&filial=7')).toBe('&filial=7')
    expect(recorteParaSegmento(false, '&filial=7')).toBeUndefined()
    const corpo = readFileSync(join(RAIZ, 'components', 'relatorios', 'corpo-relatorio-v2.tsx'), 'utf8')
    expect(corpo.replace(/\s+/g, ' ')).toContain('recorteFilial={recorteParaSegmento(Boolean(links), recorteFilial)}')
  })

  it('o snapshot da porta renderiza SEM as colunas de pessoa e sem os links do operador', () => {
    const detalhe = readFileSync(
      join(RAIZ, 'app', 'r', '[empresa]', 'relatorios', '(sessao)', 'gerados', '[id]', 'page.tsx'),
      'utf8',
    ).replace(/\s+/g, ' ')
    expect(detalhe).toContain('<CorpoRelatorio snapshot={snapshot} ehOperador={false} semPessoas')
  })

  // Os destinos do cabeçalho e das páginas da porta saem de `caminhoDaPorta` — nunca de um literal, nunca de valor
  // que o navegador possa editar. A prova é a função pura, com entrada hostil no resto do caminho: o prefixo da porta
  // DA EMPRESA nunca se perde.
  it('caminhoDaPorta nunca sai da porta da empresa (entrada hostil no resto do caminho)', async () => {
    const { caminhoDaPorta } = await import('@/lib/auth/porta-rotas')
    for (const resto of ['gerados', 'gerados/abc', '/gerados', '//gerados', '', 'geral?x=1']) {
      expect(caminhoDaPorta('wap', resto).startsWith('/r/wap/relatorios')).toBe(true)
    }
  })

  it('o cabeçalho e a navegação da porta tiram os destinos de caminhoDaPorta, sem href literal', () => {
    for (const nome of ['viewer-header.tsx', 'viewer-nav.tsx']) {
      const f = readFileSync(join(RAIZ, 'components', 'layout', nome), 'utf8')
      expect(f, nome).toContain('caminhoDaPorta')
      expect(hrefsLiterais(f), nome).toEqual([])
    }
  })
})
