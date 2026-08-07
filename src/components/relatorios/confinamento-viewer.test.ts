import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

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

// A superfície que o VIEWER renderiza: as três rotas de relatório, os componentes de
// relatório e o chrome reduzido dele.
function arquivosDaSuperficie(): string[] {
  const fixos = [
    join(RAIZ, 'app', '(app)', 'relatorios', '[filial]', 'page.tsx'),
    join(RAIZ, 'app', '(app)', 'relatorios', 'gerados', 'page.tsx'),
    join(RAIZ, 'app', '(app)', 'relatorios', 'gerados', '[id]', 'page.tsx'),
    join(RAIZ, 'components', 'layout', 'viewer-header.tsx'),
    join(RAIZ, 'components', 'layout', 'viewer-nav.tsx'),
    join(RAIZ, 'components', 'layout', 'nav-rolavel.tsx'),
  ]
  const dirRel = join(RAIZ, 'components', 'relatorios')
  const componentes = readdirSync(dirRel)
    .filter((f) => f.endsWith('.tsx'))
    // `acesso-form` é a porta PÚBLICA (a tela de digitar a senha), anterior à sessão
    // de visualização: o "/login" dela é para o operador que caiu ali por engano, e
    // não um link oferecido a quem já está lendo relatório.
    .filter((f) => f !== 'acesso-form.tsx')
    .map((f) => join(dirRel, f))
  return [...fixos, ...componentes]
}

// `href="/x"`, `href={'/x'}` e `href={`/x/${id}`}` — só os LITERAIS, que é o que dá
// para conferir estaticamente. Href vindo de variável entra na lista de exceções
// abaixo, com o motivo.
const RE_HREF = /href=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g

function hrefsLiterais(fonte: string): string[] {
  const achados: string[] = []
  for (const m of fonte.matchAll(RE_HREF)) {
    achados.push(m[1] ?? m[2] ?? m[3] ?? '')
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
const EXCECOES: { arquivo: string; href: string; guarda: string; porque: string }[] = [
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
]

describe('confinamento do visualizador: nenhum link da superfície de relatório sai de /relatorios/**', () => {
  const arquivos = arquivosDaSuperficie()

  it('enxerga a superfície (sanidade do caminho)', () => {
    expect(arquivos.length).toBeGreaterThan(10)
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
        if (!fonte.includes(excecao.guarda)) {
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
  })

  it('as três exceções registradas ainda existem (a lista não envelheceu para MAIS)', () => {
    for (const e of EXCECOES) {
      const caminho = arquivos.find((a) => a.endsWith(e.arquivo))
      expect(caminho, `${e.arquivo} saiu da superfície — revise a exceção`).toBeDefined()
      const fonte = readFileSync(caminho!, 'utf8')
      expect(fonte, `${e.arquivo}: a guarda de "${e.porque}" sumiu`).toContain(e.guarda)
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
})
