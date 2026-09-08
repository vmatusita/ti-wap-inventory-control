import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { ehModuloUseServer } from '@/lib/use-server-exports'
import { GUARDAS, guardasDosExports, usaExportDefault } from '@/lib/actions/guardas-de-action'

// A TRAVA DA FRONTEIRA HTTP — F49. RODA SEM BANCO.
//
// Toda Server Action exportada é um ENDPOINT: o Next lhe dá um id e ela atende POST
// direto, sem passar por tela nenhuma. Esconder o botão é ergonomia
// (`components/layout/permissoes.ts` diz isso com todas as letras); a guarda dentro
// da action é o que responde "esta pessoa pode?".
//
// Até 07/09/2026 NOVE leituras não perguntavam nada — as seis do wizard de
// movimentação e as três sugestões de compra. Elas devolviam patrimônio, modelo,
// colaborador e fornecedor a QUALQUER sessão válida, incluindo a de um perfil
// DESATIVADO: `getOperador()` já o expulsa de toda a UI, mas o token dele continua
// aceito pelo PostgREST até expirar, e as policies de SELECT dessas tabelas seguem
// `using (true)` por desenho (ADR-001). Sem guarda na action, não havia NADA entre um
// desligado e a enumeração do acervo.
//
// Esta suíte é o que impede a décima. Ela varre o `src/` inteiro, lista os exports de
// todo módulo `'use server'` e cobra, de cada um, UMA das cinco guardas de
// `src/lib/auth/acesso.ts` — ou presença nominal em `SEM_GUARDA`, com motivo escrito.
//
// O QUE ELA **NÃO** PROVA, e é importante que esteja escrito aqui e não só no relatório:
//  · Guarda de action é a SEGUNDA linha. A primeira é a RLS no Postgres. Uma action
//    guardada que chame uma RPC `security definer` mal escrita continua sendo um furo,
//    e nenhum verde aqui diz o contrário.
//  · A trava prova que a guarda é CHAMADA no corpo — não que ela é alcançada em todo
//    caminho, nem que o `if (!aut.ok)` seguinte faz a coisa certa. Isso é revisão
//    humana. Ver o cabeçalho de `guardas-de-action.ts`.
//
// Mesma técnica de `use-server-exports.test.ts` (de quem ela reusa `ehModuloUseServer`
// e o neutralizador de comentários) e de `catalogos-seguranca.test.ts`: lê o fonte do
// disco, nunca uma cópia em memória.

const RAIZ_SRC = join(process.cwd(), 'src')

/**
 * As ISENÇÕES, uma a uma, com o motivo POR ESCRITO.
 *
 * ⚠ Esta lista só ENCOLHE (há um caso abaixo que reprova quando ela cresce). Entrada
 * nova exige mexer no teto à mão — que é exatamente o atrito pretendido: isentar uma
 * action de autorização tem de ser uma decisão tomada, não um efeito colateral de
 * escrever uma função.
 *
 * ⚠ E são isenções NOMINAIS, nunca por categoria. Não há "todo export de auth.ts está
 * liberado": há quatro entradas, cada uma dizendo por que AQUELA função não tem o que
 * autorizar. A isenção por prefixo/categoria foi arrancada deste repositório na F47 e
 * não volta pela porta dos fundos.
 */
const SEM_GUARDA: Record<string, string> = {
  // --- As quatro portas de entrada. Nenhuma delas PODE exigir cargo: são o caminho
  // por onde o cargo passa a existir. Exigir autorização aqui trancaria a porta pelo
  // lado de fora.
  'src/lib/actions/auth.ts::signIn':
    'É o LOGIN. Quem chama ainda não tem sessão — exigir cargo aqui impediria qualquer pessoa de entrar. A defesa deste caminho é o trigger `handle_new_user` (migration 0041), que recusa domínio de e-mail fora da lista corporativa.',
  'src/lib/actions/auth.ts::signOut':
    'É o LOGOUT. Encerra a própria sessão de quem chamou; não há o que autorizar, e exigir cargo prenderia na sessão justamente quem foi desativado e quer sair.',
  'src/lib/actions/auth.ts::confirmarAcesso':
    'Troca o token do convite/recuperação por sessão (`verifyOtp`). Roda ANTES de existir sessão, por definição; a credencial é o próprio token do e-mail, e é ele que autoriza.',
  'src/lib/actions/auth.ts::definirAcesso':
    'Define a senha logo após o convite ser aceito. Mesmo caso: a autorização é o token de recuperação já validado, não um cargo — o usuário ainda está no meio do primeiro acesso.',

  // --- As duas do visualizador por SENHA. Outra porta, não o cargo "consulta"
  // (CLAUDE.md, modelo de acesso): a sessão dele nasce de uma senha de acesso, não de
  // uma conta, e `papel_atual()` devolve NULL para ela.
  'src/lib/actions/senhas.ts::entrarComSenha':
    'É a porta do VISUALIZADOR e é pública por desenho: quem a chama não tem conta nenhuma. A defesa é anterior à autorização — rate-limit persistente por IP antes de qualquer verificação (senhas.ts:52-70) e comparação por `crypto.scrypt`. Exigir cargo aqui fecharia a entrada do relatório por senha.',
  'src/lib/actions/senhas.ts::sairVisualizacao':
    'É o LOGOUT do visualizador: apaga o próprio cookie e redireciona. Não lê nem escreve dado nenhum, e exigir cargo prenderia na visualização justamente quem não tem cargo. (Ausente da ficha da F49, que previa cinco isenções — achado da medição, 07/09/2026.)',
}

/** Teto da catraca. Ver o caso "a lista de isenções só encolhe". */
const TETO_SEM_GUARDA = 6

// As nove que a F49 corrigiu. Estão aqui NOMEADAS para que o teste reprove se alguma
// delas for "resolvida" por isenção em vez de por guarda — o atalho que esvaziaria a
// fase inteira.
const AS_NOVE = [
  'src/lib/actions/movimentacoes.ts::buscarAtivosParaMovimentacao',
  'src/lib/actions/movimentacoes.ts::resolverPatrimoniosParaLote',
  'src/lib/actions/movimentacoes.ts::buscarColaboradoresDoCampo',
  'src/lib/actions/movimentacoes.ts::buscarSugestoesSetores',
  'src/lib/actions/movimentacoes.ts::buscarPossiveisDuplicatasDoDia',
  'src/lib/actions/movimentacoes.ts::buscarResumoDeAtivosPorIds',
  'src/lib/actions/compras.ts::buscarSugestoesMarca',
  'src/lib/actions/compras.ts::buscarSugestoesModelo',
  'src/lib/actions/compras.ts::buscarSugestoesFornecedor',
] as const

function varrerTs(dir: string): string[] {
  const achados: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) achados.push(...varrerTs(caminho))
    else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
      achados.push(caminho)
    }
  }
  return achados
}

// Varre o `src/` INTEIRO, e não só `src/lib/actions/`. Medido em 07/09/2026: existe um
// módulo `'use server'` fora da pasta — `src/app/(app)/dev/acoes-export.ts` — e ele já
// estava guardado (`exigirDev`). A rede larga custou zero e fecha o caminho de escrever
// a próxima action dentro de `src/app/**`, onde uma trava restrita à pasta não olharia.
const MODULOS = varrerTs(RAIZ_SRC)
  .filter((f) => ehModuloUseServer(readFileSync(f, 'utf8')))
  // caminho relativo com barra normal: o nome do caso tem de ser o mesmo no Windows e no CI.
  .map((f) => relative(process.cwd(), f).split(sep).join('/'))

type Achado = { chave: string; nome: string; linha: number; arquivo: string }

function exportsSemGuarda(): Achado[] {
  const fora: Achado[] = []
  for (const arquivo of MODULOS) {
    const fonte = readFileSync(join(process.cwd(), arquivo), 'utf8')
    for (const x of guardasDosExports(fonte)) {
      if (x.guarda) continue
      const chave = `${arquivo}::${x.nome}`
      if (chave in SEM_GUARDA) continue
      fora.push({ chave, nome: x.nome, linha: x.linha, arquivo })
    }
  }
  return fora
}

// ---------------------------------------------------------------------------
// (a) A leitura em si — as formas que ela PRECISA recusar
// ---------------------------------------------------------------------------
//
// Sem estes casos, a varredura poderia estar verde por não saber ler nada. Cada um
// aqui é uma forma de fazer a trava dizer "guardado" sobre código que não está.

describe('guardasDosExports — o que NÃO conta como guarda', () => {
  const cabecalho = "'use server'\n"

  it('guarda citada só num COMENTÁRIO não conta', () => {
    const fonte =
      cabecalho +
      ['export async function f() {', '  // aqui deveria ter um exigirPapel(supabase, ', '  return []', '}'].join(
        '\n',
      )
    expect(guardasDosExports(fonte)[0].guarda).toBeNull()
  })

  it('guarda dentro de uma STRING não conta', () => {
    const fonte =
      cabecalho +
      ['export async function f() {', "  return ['exigirPapel(supabase)']", '}'].join('\n')
    expect(guardasDosExports(fonte)[0].guarda).toBeNull()
  })

  it('indireta de DOIS níveis não conta', () => {
    // O helper que o export chama precisa ter a guarda ELE MESMO. Cadeia arbitrária
    // é como uma trava vira peneira — ver o cabeçalho de guardas-de-action.ts.
    const fonte =
      cabecalho +
      [
        'async function nivelDois() {',
        '  const aut = await exigirAdmin(supabase)',
        '  return aut.ok',
        '}',
        'async function nivelUm() {',
        '  return nivelDois()',
        '}',
        'export async function f() {',
        '  if (!(await nivelUm())) return []',
        '  return [1]',
        '}',
      ].join('\n')
    const alvo = guardasDosExports(fonte).find((x) => x.nome === 'f')
    expect(alvo!.guarda).toBeNull()
  })

  it('helper HOMÔNIMO sem guarda não conta (o nome não é o que autoriza)', () => {
    const fonte =
      cabecalho +
      [
        'async function barrado() {',
        '  return null',
        '}',
        'export async function f() {',
        '  const negado = await barrado()',
        '  if (negado) return []',
        '  return [1]',
        '}',
      ].join('\n')
    const alvo = guardasDosExports(fonte).find((x) => x.nome === 'f')
    expect(alvo!.guarda).toBeNull()
  })

  it('`idOperador` não é guarda — responde "existe sessão?", não "pode?"', () => {
    const fonte =
      cabecalho +
      ['export async function f() {', '  const uid = await idOperador(supabase)', '  if (!uid) return []', '  return [1]', '}'].join(
        '\n',
      )
    expect(guardasDosExports(fonte)[0].guarda).toBeNull()
  })

  it('nome que apenas COMEÇA com o de uma guarda não conta', () => {
    const fonte =
      cabecalho + ['export async function f() {', '  exigirPapelDeMentira(supabase)', '  return []', '}'].join('\n')
    expect(guardasDosExports(fonte)[0].guarda).toBeNull()
  })
})

describe('guardasDosExports — o que CONTA como guarda', () => {
  const cabecalho = "'use server'\n"

  it('chamada direta no corpo', () => {
    const fonte =
      cabecalho +
      ['export async function f() {', "  const aut = await exigirPapel(s, 'consulta')", '  if (!aut.ok) return []', '  return [1]', '}'].join(
        '\n',
      )
    const r = guardasDosExports(fonte)[0]
    expect(r.guarda).toBe('exigirPapel')
    expect(r.via).toBe('direta')
  })

  it('helper local de UM nível (o padrão de barrado()/sugerir())', () => {
    const fonte =
      cabecalho +
      [
        'async function barrado() {',
        "  const aut = await exigirPapel(s, 'consulta')",
        '  return aut.ok ? null : aut.erro',
        '}',
        'export async function f() {',
        '  const negado = await barrado()',
        '  if (negado) return []',
        '  return [1]',
        '}',
      ].join('\n')
    const alvo = guardasDosExports(fonte).find((x) => x.nome === 'f')!
    expect(alvo.guarda).toBe('exigirPapel')
    expect(alvo.via).toBe('indireta')
    expect(alvo.helper).toBe('barrado')
  })

  it('enxerga o corpo inteiro quando o parâmetro é objeto MULTILINHA', () => {
    // A forma que quebrou a primeira versão desta leitura: `}): Promise<X> {` começa
    // com `}` na coluna 0 sem fechar a função.
    const fonte =
      cabecalho +
      [
        'export async function f(input: {',
        '  a: string',
        '}): Promise<number[]> {',
        '  const aut = await exigirEscrita(s, 1)',
        '  if (!aut.ok) return []',
        '  return [1]',
        '}',
      ].join('\n')
    expect(guardasDosExports(fonte)[0].guarda).toBe('exigirEscrita')
  })

  it('enxerga o corpo inteiro quando o RETORNO é genérico multilinha', () => {
    // A forma que escondeu o `exigirAdmin` de `resumoExclusaoConflito`.
    const fonte =
      cabecalho +
      [
        'export async function f(input: {',
        '  ids: string[]',
        '}): Promise<',
        '  Resultado<{',
        '    a: number',
        '  }>',
        '> {',
        '  const aut = await exigirAdmin(s)',
        '  if (!aut.ok) return []',
        '  return [1]',
        '}',
      ].join('\n')
    expect(guardasDosExports(fonte)[0].guarda).toBe('exigirAdmin')
  })
})

describe('a varredura enxerga o repositório (guarda do próprio teste)', () => {
  it('encontra módulos "use server"', () => {
    expect(MODULOS.length).toBeGreaterThan(0)
  })

  it('encontra exports dentro deles', () => {
    const total = MODULOS.reduce(
      (n, a) => n + guardasDosExports(readFileSync(join(process.cwd(), a), 'utf8')).length,
      0,
    )
    expect(total).toBeGreaterThan(50)
  })
})

describe('toda Server Action exportada tem guarda ou isenção nominal', () => {
  it('nenhum export ficou sem guarda e sem motivo escrito', () => {
    const fora = exportsSemGuarda()
    expect(
      fora,
      fora.length
        ? `Server Action exportada SEM guarda e SEM isenção nominal.\n` +
            `Uma action é um endpoint HTTP: sem uma das cinco guardas (${GUARDAS.join(', ')}),\n` +
            `qualquer sessão válida — inclusive a de um perfil DESATIVADO — a alcança por POST direto.\n\n` +
            fora.map((f) => `  ${f.chave} (linha ${f.linha})`).join('\n') +
            `\n\nCorrija acrescentando a guarda. Isentar só se NÃO houver o que autorizar,\n` +
            `e então a entrada em SEM_GUARDA precisa de motivo escrito + subir TETO_SEM_GUARDA.`
        : undefined,
    ).toEqual([])
  })

  it.each(AS_NOVE)('%s está guardada, e não isenta', (chave) => {
    // Isentar uma das nove seria desfazer a fase por dentro, com o teste verde.
    expect(chave in SEM_GUARDA, `${chave} não pode estar em SEM_GUARDA — ela TEM guarda`).toBe(
      false,
    )
    const [arquivo, nome] = chave.split('::')
    const achados = guardasDosExports(readFileSync(join(process.cwd(), arquivo), 'utf8'))
    const alvo = achados.find((a) => a.nome === nome)
    expect(alvo, `${chave} não foi encontrada no arquivo`).toBeDefined()
    expect(alvo!.guarda, `${chave} perdeu a guarda`).not.toBeNull()
  })
})

describe('o ponto cego conhecido é RUIDOSO, não silencioso', () => {
  // `use-server-exports.ts` aceita `export default async function` num módulo
  // 'use server', mas a leitura de guardas casa `function <nome>` e a default
  // costuma ser anônima: uma action escrita assim passaria sem ser vista. Hoje não
  // existe nenhuma; se aparecer, o teste reprova mandando ensinar a leitura.
  it.each(MODULOS)('%s não usa export default', (arquivo) => {
    expect(
      usaExportDefault(readFileSync(join(process.cwd(), arquivo), 'utf8')),
      `${arquivo} usa \`export default\` num módulo 'use server'.\n` +
        `A leitura de guardas NÃO sabe ler essa forma (ela casa \`function <nome>\`), então\n` +
        `essa action passaria pela trava sem ser vista. Ensine \`guardasDosExports\` a lê-la —\n` +
        `NÃO acrescente exceção, e não troque a forma só para calar o teste.`,
    ).toBe(false)
  })
})

describe('a lista de isenções é uma catraca — só encolhe', () => {
  it(`tem no máximo ${TETO_SEM_GUARDA} entradas`, () => {
    expect(
      Object.keys(SEM_GUARDA).length,
      'SEM_GUARDA cresceu. Isentar uma action de autorização é uma DECISÃO: ' +
        'registre o motivo em docs/DECISOES.md e suba TETO_SEM_GUARDA à mão, no mesmo commit.',
    ).toBeLessThanOrEqual(TETO_SEM_GUARDA)
  })

  it('toda isenção traz motivo escrito, e não um rótulo', () => {
    for (const [chave, motivo] of Object.entries(SEM_GUARDA)) {
      expect(motivo.length, `${chave}: motivo curto demais para ser um motivo`).toBeGreaterThan(60)
      // "é admin", "não precisa", "é interno" são rótulos, não motivos. O motivo
      // precisa dizer O QUE defende aquele caminho no lugar da guarda.
      // Termina em frase — ponto final, com ou sem parêntese de fecho depois.
      expect(motivo, `${chave}: o motivo precisa terminar em frase`).toMatch(/\.\)?$/)
    }
  })

  it('toda isenção aponta um export que realmente existe', () => {
    // Isenção órfã é pior que isenção errada: some da tela do revisor e deixa a
    // catraca com folga que ninguém percebe.
    for (const chave of Object.keys(SEM_GUARDA)) {
      const [arquivo, nome] = chave.split('::')
      expect(MODULOS, `${chave}: arquivo não é módulo 'use server'`).toContain(arquivo)
      const achados = guardasDosExports(readFileSync(join(process.cwd(), arquivo), 'utf8'))
      expect(
        achados.some((a) => a.nome === nome),
        `${chave}: export não existe mais — remova a isenção`,
      ).toBe(true)
    }
  })

  it('nenhuma isenção cobre um export que JÁ tem guarda', () => {
    for (const chave of Object.keys(SEM_GUARDA)) {
      const [arquivo, nome] = chave.split('::')
      const achados = guardasDosExports(readFileSync(join(process.cwd(), arquivo), 'utf8'))
      const alvo = achados.find((a) => a.nome === nome)
      expect(
        alvo?.guarda ?? null,
        `${chave} tem guarda — a isenção mente sobre o código e deve sair da lista`,
      ).toBeNull()
    }
  })
})
