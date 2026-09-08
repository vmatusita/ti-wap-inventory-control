import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Fronteira do VISUALIZADOR por senha (A5 · Sprint 4 · reescrita na F50).
//
// `resolverAcessoRelatorio` (src/lib/auth/acesso.ts) entrega ao visualizador por
// senha o client ADMINISTRATIVO (service_role, que IGNORA RLS) — porque quem entra
// por senha não tem identidade no banco. Consequência: para o viewer, o RLS NÃO é a
// segunda linha; o único muro é o próprio CÓDIGO das queries de relatório, que só
// podem tocar tabelas de inventário (mais `profiles.nome`, para autoria de anotação/
// snapshot — decisão aceita e registrada em DECISOES).
//
// Este teste é o TRIPWIRE: se alguém adicionar na superfície do relatório uma query a
// uma tabela SENSÍVEL, ela passaria a ser exposta ao viewer sob service_role. Falhar
// aqui é o sinal para revisar a decisão — não para "consertar o teste".
//
// ---------------------------------------------------------------------------
// POR QUE A F50 REESCREVEU ESTE ARQUIVO
// ---------------------------------------------------------------------------
// A versão anterior tinha dois defeitos, e o primeiro já havia se materializado:
//
//   1. A superfície vinha da PASTA (`readdirSync` de `queries/relatorios/`) mais dois
//      arquivos declarados à mão. A F39 pôs `queries/tipos-item.ts` na superfície do
//      viewer — ela aceita client resolvido e as duas páginas de relatório a chamam
//      com `acesso.client` — e ninguém a declarou. O tripwire ficou cego por três
//      fases. A pasta MENTE; a ASSINATURA não: quem aceita um client resolvido pode
//      receber o client do viewer, esteja em que pasta estiver.
//
//   2. A lista de tabelas era uma DENY-LIST de três nomes. Deny-list não cobre a
//      tabela que ainda não nasceu — e o plano multiempresa cria `empresas`. Uma
//      query nova a uma tabela nova passaria calada. Por isso a lista virou BRANCA:
//      nome fora dela reprova, e cada nome carrega o motivo de estar lá.
const RAIZ_QUERIES = join(process.cwd(), 'src', 'lib', 'queries')

/** Caminho de um módulo de query como este arquivo o nomeia: `queries/<…>.ts`. */
function rotulo(caminho: string): string {
  return 'queries/' + caminho.slice(RAIZ_QUERIES.length + 1).split(/[\\/]/).join('/')
}

function todosOsModulos(dir = RAIZ_QUERIES, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) todosOsModulos(p, acc)
    else if (nome.endsWith('.ts') && !nome.endsWith('.test.ts')) acc.push(p)
  }
  return acc
}

// ---------------------------------------------------------------------------
// A DERIVAÇÃO — quem ACEITA um client resolvido
// ---------------------------------------------------------------------------
// Três formas, todas medidas no repositório (F50). As duas primeiras a ficha previa;
// a terceira não, e é estruturalmente idêntica — um `acesso.client` é atribuível a
// qualquer uma das três, porque TypeScript é estrutural:
//
//   · `client?: SupabaseClient<Database>`            (tipos-item.ts)
//   · o alias `DbClient`                             (11 arquivos; ⚠ o alias é
//     declarado TRÊS vezes, independentemente: relatorios/comum.ts, lib/auth/acesso.ts
//     e queries/import-logs.ts — por isso casamos o NOME do alias, não o import)
//   · `Awaited<ReturnType<typeof createClient>>`     (ativos.ts, colaboradores.ts, itens.ts)
const TIPO_CLIENT =
  /(SupabaseClient\s*<\s*Database\s*>|\bDbClient\b|Awaited\s*<\s*ReturnType\s*<\s*typeof\s+createClient\s*>\s*>)/

// ⚠ EXPORTADA é o que forma superfície, e a distinção não é frescura: medido na F50,
// `pendencias-detalhe.ts` recebe `client: DbClient` em DUAS funções — mas as duas são
// internas, e as três exportadas criam o próprio client com `createClient()`. Ele não
// alcança o viewer, e tratá-lo como se alcançasse encheria a lista de exceções com
// arquivo que nunca esteve em risco. Mesmo caso: `eventos-admin.ts`, `movimentacoes.ts`.
function nomesExportados(fonte: string): Set<string> {
  const nomes = new Set<string>()
  // ⚠ `default` no meio — achado da revisão adversarial da F50. A versão anterior
  // exigia `function` logo depois de `export`, e `export default function lerAlgo(…)`
  // não casava: o nome nunca entrava no conjunto, o arquivo inteiro era descartado da
  // derivação, e um módulo novo com client resolvido passava calado. Para essa forma,
  // a assinatura mentia tanto quanto a pasta — que é justamente o que este arquivo
  // existe para não deixar acontecer.
  for (const m of fonte.matchAll(/export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/g))
    nomes.add(m[1])
  for (const m of fonte.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z0-9_]+)/g)) nomes.add(m[1])
  for (const m of fonte.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const parte of m[1].split(',')) {
      const nome = parte.trim().split(/\s+as\s+/)[0].trim()
      if (nome) nomes.add(nome)
    }
  }
  return nomes
}

// Toda função NOMEADA do arquivo com a sua lista de parâmetros — declaração
// (`function x(`) ou expressão atribuída a nome (`const x = … (`).
//
// ⚠ A forma-expressão não é caso raro: `listarFiliais` — justamente o arquivo que a
// F49 declarou À MÃO nesta superfície — é
// `export const listarFiliais = cache(async function listarFiliais(client?: …))`.
// Um detector por `export function` não o enxerga: medido, ele devolve 13 arquivos e
// perde `filiais.ts`. Um tripwire que perde o arquivo que já estava declarado não é
// tripwire, é decoração.
function funcoesComParametros(fonte: string): { nome: string; params: string }[] {
  const achadas: { nome: string; params: string }[] = []
  const re =
    /(?:function\s+([A-Za-z0-9_]+)\s*\(|(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:[A-Za-z0-9_.]+\s*\(\s*)?(?:async\s*)?(?:function\s*[A-Za-z0-9_]*\s*)?\()/g
  let m: RegExpExecArray | null
  while ((m = re.exec(fonte))) {
    const nome = m[1] ?? m[2]
    if (!nome) continue
    let i = re.lastIndex
    let profundidade = 1
    while (i < fonte.length && profundidade > 0) {
      const c = fonte[i]
      if (c === '(') profundidade++
      else if (c === ')') profundidade--
      i++
    }
    achadas.push({ nome, params: fonte.slice(re.lastIndex, i - 1) })
  }
  return achadas
}

/** Os módulos de `queries/**` com pelo menos uma função EXPORTADA que aceita client. */
function candidatosPorAssinatura(): string[] {
  const achados: string[] = []
  for (const caminho of todosOsModulos()) {
    const fonte = readFileSync(caminho, 'utf8')
    const exportados = nomesExportados(fonte)
    const aceita = funcoesComParametros(fonte).some(
      (f) => TIPO_CLIENT.test(f.params) && exportados.has(f.nome),
    )
    if (aceita) achados.push(rotulo(caminho))
  }
  return achados.sort()
}

// ---------------------------------------------------------------------------
// A SUPERFÍCIE DECLARADA — o que o client do viewer alcança
// ---------------------------------------------------------------------------
const SUPERFICIE: Record<string, string> = {
  'queries/relatorios/comum.ts': 'resolverFilialPorSlug, chamada em [filial]/page.tsx:102',
  'queries/relatorios/estoque.ts': 'transitiva por getSnapshotRelatorioV2',
  'queries/relatorios/itens.ts': 'transitiva por getSnapshotRelatorioV2',
  'queries/relatorios/movimentacoes.ts': 'transitiva por getSnapshotRelatorioV2',
  'queries/relatorios/pendencias.ts': 'transitiva por getSnapshotRelatorioV2',
  'queries/relatorios/snapshot.ts': 'getSnapshotRelatorioV2, chamada em [filial]/page.tsx:126',
  'queries/relatorios/index.ts':
    're-export da pasta; sem query própria hoje, mas varrido para que uma query nova aqui não escape',
  'queries/gerados.ts': 'gerados/page.tsx:75 e gerados/[id]/page.tsx:41,63',
  'queries/filiais.ts': 'gerados/page.tsx:74 e [filial]/page.tsx:124',
  // A F39 pôs este arquivo na superfície e ninguém o declarou — o defeito que esta
  // reescrita existe para corrigir. O próprio módulo já explicava por quê: sem o
  // client resolvido, a leitura devolveria VAZIO para a sessão por senha e o
  // relatório impresso sairia com o slug cru no lugar do rótulo do item faltante.
  'queries/tipos-item.ts': 'listarTiposItem em [filial]/page.tsx:131 e gerados/[id]/page.tsx:57',
}

// ---------------------------------------------------------------------------
// AS EXCEÇÕES — aceitam client resolvido, mas NENHUMA rota de relatório as alcança
// ---------------------------------------------------------------------------
// Cada motivo é MEDIDO (quem chama, de onde), nunca "não é de relatório" como
// categoria: categoria envelhece sozinha, call-site medido não. A prova estrutural
// que sustenta as cinco: a superfície inteira importa de `@/lib/queries/` apenas
// `filiais`, `relatorios` e `rpc-filial` — nenhum arquivo desta lista.
//
// ⚠ Se um destes passar a ser chamado com `acesso.client`, ele muda de lista — não
// se apaga a entrada. A pergunta que a exceção responde é "quem o chama, e com que
// client", e a resposta tem de continuar verdadeira.
const EXCECOES: Record<string, string> = {
  'queries/conflitos.ts':
    'contarGruposConflito em pendencias/page.tsx:181 e acervoDosAtivos/ladosDosAtivos em actions/conflitos.ts:172,239,240 — sempre o client de sessão do operador',
  'queries/import-logs.ts':
    'as 4 funções saem de actions/importar.ts e de admin/importar/page.tsx:35 — rota de admin, client de sessão',
  'queries/ativos.ts':
    'patrimoniosDuplicados é chamada por queries/movimentacoes.ts:285 (interna a listarAtivos) e pela rota /ativos — nunca por rota de relatório',
  'queries/colaboradores.ts':
    'resolverColaboradoresPorNome só é chamada por Server Actions (colaboradores.ts:382, itens.ts:105, movimentacoes.ts) com o client da sessão',
  'queries/itens.ts':
    'saldosPorColaborador e acessoriosDasMovimentacoes só saem de Server Actions (itens.ts:127, movimentacoes.ts:515, termos.ts:262,360)',
}

const arquivosDaSuperficie = (): string[] =>
  Object.keys(SUPERFICIE).map((r) => join(process.cwd(), 'src', 'lib', r))

// ---------------------------------------------------------------------------
// AS LISTAS BRANCAS
// ---------------------------------------------------------------------------
const TABELAS: Record<string, string> = {
  ativos: 'o inventário — a razão de o relatório existir',
  movimentacoes: 'os eventos do período',
  lancamentos_item: 'os itens por quantidade',
  itens: 'o catálogo de itens (rótulo e mínimo)',
  filiais: 'nome e slug da filial — cabeçalho e abas',
  anotacoes: 'observação de manutenção exibida no relatório',
  relatorios_gerados: 'os snapshots congelados',
  v_fila_pendencias: 'VIEW da fila de pendências (0052) — só o operador a vê renderizada',
  // A nona, e ela só existe na lista porque `tipos-item.ts` entrou na superfície:
  // a de HOJE, sem ele, tem oito. É o vocabulário que traduz o slug do item
  // faltante no relatório impresso (F39).
  tipos_item: 'o catálogo de TIPOS de item — rótulo do item faltante (F39)',
}

const RPCS: Record<string, string> = {
  rel_resumo: 'os KPIs do período',
  rel_estoque_asof: 'o estado do acervo numa data',
  rel_mov_por_mes: 'a série mensal de movimentações',
  rel_por_motivo: 'a quebra por motivo',
  rel_saldo_itens: 'saldo de itens por filial',
  rel_mov_itens: 'lançamentos de item no período',
  rel_frescor_itens: 'a data do último lançamento por item',
}

// `.from('literal')` / `.rpc('literal', …)` — e SÓ o literal INTEIRO.
//
// ⚠ O `[,)]` no fim não é enfeite: ele é o que separa um literal de uma EXPRESSÃO que
// começa com literal. Sem ele, o regex casava `'ativos'` dentro de
// `.from('ativos' + '_arquivo_oculto')` e devolvia `ativos` — um nome que ESTÁ na
// lista branca. A tabela realmente lida em runtime (`ativos_arquivo_oculto`) não
// aparecia em lugar nenhum, e a chamada era registrada como leitura legítima do nome
// branco. Pior: a varredura de não-literais tinha `(?!')`, que descartava de propósito
// tudo que começasse com aspa — então as duas travas se cancelavam e nenhuma acusava.
//
// Achado da revisão adversarial da F50, provado ao vivo com
// `client.from('ativos' + '_arquivo_oculto')` em `comum.ts`: 14 testes verdes. É o
// vetor exato que a inversão para lista branca existe para fechar — uma tabela nova
// cujo nome comece com um prefixo já branco atravessaria a fronteira do viewer, que
// roda sob `service_role`, sem RLS.
//
// `.rpc()` aceita segundo argumento (os parâmetros), daí `,` valer tanto quanto `)`.
// UMA varredura, que classifica — em vez de duas peneiras independentes que podiam
// se cancelar (foi assim que a concatenação passava: literal para uma, "começa com
// aspa, ignore" para a outra).
type Chamada = { receptor: string; argumento: string; literal: string | null }

function chamadasDe(fonte: string, metodo: 'from' | 'rpc'): Chamada[] {
  const re = new RegExp(`([A-Za-z0-9_$]*)\\.${metodo}\\(`, 'g')
  const achadas: Chamada[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(fonte))) {
    // O primeiro argumento: até a vírgula ou o parêntese do NÍVEL de topo.
    let i = re.lastIndex
    let prof = 0
    let arg = ''
    while (i < fonte.length) {
      const c = fonte[i]
      if (c === '(' || c === '[' || c === '{') prof++
      else if (c === ')' && prof === 0) break
      else if (c === ')' || c === ']' || c === '}') prof--
      else if (c === ',' && prof === 0) break
      else if (c === '\n') break
      arg += c
      i++
    }
    const argumento = arg.trim()
    // Literal PURO: a string inteira é uma constante entre aspas. `'ativos' + '_x'`
    // não é — e é exatamente o caso que passava por literal antes.
    const puro = /^'([^']*)'$/.exec(argumento)
    achadas.push({ receptor: m[1], argumento, literal: puro ? puro[1] : null })
  }
  return achadas
}

function chamadasLiterais(fonte: string, metodo: 'from' | 'rpc'): string[] {
  return chamadasDe(fonte, metodo)
    .filter((c) => !RECEPTORES_NAO_POSTGREST.has(c.receptor))
    .map((c) => c.literal)
    .filter((n): n is string => n !== null)
}

// Argumento que NÃO é string literal: variável, template, concatenação. Uma lista
// branca não enxerga nome montado em runtime — então ele reprova por si.
//
// ⚠ `Array.from(…)` NÃO é o `.from(…)` do PostgREST, e a distinção foi paga com uma
// rodada vermelha: `comum.ts` tem `Array.from({ length: Math.min(limite, …) })` dentro
// de `mapComLimite`. Um `\.from\(` solto o acusaria como "nome montado em runtime" —
// falso positivo que ensinaria a próxima pessoa a afrouxar a trava pelo motivo errado.
// Por isso o receptor é capturado e `Array` é descartado pelo NOME, não por uma
// isenção genérica: qualquer outro receptor continua sendo examinado.
const RECEPTORES_NAO_POSTGREST = new Set(['Array'])

// TODA chamada, e depois subtrai as que são literal INTEIRO. É o inverso da versão
// anterior, que perguntava "começa com aspa?" — pergunta que respondia "sim" para a
// concatenação e a deixava passar pelas duas peneiras.
function chamadasNaoLiterais(fonte: string, metodo: 'from' | 'rpc'): string[] {
  return chamadasDe(fonte, metodo)
    .filter((c) => !RECEPTORES_NAO_POSTGREST.has(c.receptor))
    .filter((c) => c.literal === null)
    .map((c) => `${metodo}(${c.argumento}`)
}

// O que o viewer JAMAIS pode ler. Redundante com a lista branca de propósito: esta
// pega a menção em QUALQUER forma (string montada, comentário, import), não só em
// `.from('…')`. Custa um grep e cobre o que a allow-list, por construção, não vê.
// As formas de guardar o client numa variável — as TRÊS, não só a com ponto.
//
// ⚠ `const { client } = acesso` e `acesso['client']` apagam o rastro exatamente como
// `const c = acesso.client`, e a versão anterior só pegava a terceira. As duas
// primeiras são sintaxe corriqueira, não exótica — achado da revisão adversarial da
// F50, provado ao vivo. A partir daqui quem quiser apelidar o client tem de inventar
// uma forma nova, e é essa a diferença entre uma trava e um lembrete.
const APELIDA_CLIENT = [
  // const c = acesso.client
  /(?:const|let|var)\s+[A-Za-z0-9_]+\s*=\s*[A-Za-z0-9_]+\.client\b/,
  // const { client } = acesso   /   const { client: c } = acesso
  /(?:const|let|var)\s*\{[^}]*\bclient\b[^}]*\}\s*=\s*[A-Za-z0-9_]+/,
  // const c = acesso['client']  /  acesso["client"]
  /(?:const|let|var)\s+[A-Za-z0-9_]+\s*=\s*[A-Za-z0-9_]+\[\s*['"]client['"]\s*\]/,
]

const PROIBIDOS = [
  { termo: 'senhas_acesso', motivo: 'expõe o hash da senha de acesso' },
  { termo: 'senha_tentativas', motivo: 'infra de rate-limit por IP' },
  { termo: 'auth.users', motivo: 'internals de autenticação do Supabase' },
]

describe('fronteira do viewer (A5): queries de relatório não tocam tabelas sensíveis', () => {
  const arquivos = arquivosDaSuperficie()

  it('enxerga a superfície de queries (sanidade do caminho)', () => {
    expect(arquivos.length).toBeGreaterThan(1)
  })

  it('o detector de assinatura enxerga o repositório (guarda do próprio teste)', () => {
    const candidatos = candidatosPorAssinatura()
    expect(candidatos.length, 'a derivação por assinatura não achou nada').toBeGreaterThan(5)
    // A forma-expressão (`export const x = cache(function x(client?…))`) tem de entrar:
    // é `filiais.ts`, e perdê-la foi o defeito que esta reescrita corrige.
    expect(candidatos).toContain('queries/filiais.ts')
  })

  // As três formas que a revisão adversarial da F50 provou que ESCAPAVAM. Cada uma
  // custou uma sabotagem ao vivo com os 14 testes verdes — e por isso viraram
  // asserção de comportamento, não comentário.
  it('o leitor de exports pega `export default function` (achado da revisão)', () => {
    // A regex antiga exigia `function` logo após `export`; com `default` no meio o
    // nome não entrava, e o módulo inteiro sumia da derivação.
    expect(nomesExportados('export default async function lerAlgo(c) {}')).toContain('lerAlgo')
    expect(nomesExportados('export function a(){}\nexport const b = 1')).toEqual(
      new Set(['a', 'b']),
    )
  })

  it('a lista branca não é enganada por CONCATENAÇÃO que começa com nome branco', () => {
    // O vetor: `'ativos'` está na lista, `'ativos' + '_oculto'` não é `ativos`.
    const sabotado = "client.from('ativos' + '_arquivo_oculto').select('*')"
    expect(chamadasLiterais(sabotado, 'from'), 'a concatenação foi lida como literal').toEqual([])
    expect(chamadasNaoLiterais(sabotado, 'from').length, 'a concatenação não foi acusada').toBe(1)
    // …e o literal de verdade continua sendo lido como literal.
    expect(chamadasLiterais("client.from('ativos').select('id')", 'from')).toEqual(['ativos'])
    // `.rpc()` tem segundo argumento, e isso não pode confundir o detector.
    expect(chamadasLiterais("client.rpc('rel_resumo', { p: 1 })", 'rpc')).toEqual(['rel_resumo'])
    expect(chamadasNaoLiterais("client.rpc('rel_resumo', { p: 1 })", 'rpc')).toEqual([])
    expect(chamadasNaoLiterais("client.rpc('rel' + '_oculto', {})", 'rpc').length).toBe(1)
  })

  it('a trava de apelido pega as TRÊS formas de guardar o client', () => {
    const casos = [
      'const c = acesso.client',
      'const { client } = acesso',
      'const { client: c } = acesso',
      "const c = acesso['client']",
      'let c = acesso.client',
    ]
    for (const caso of casos) {
      expect(
        APELIDA_CLIENT.some((re) => re.test(caso)),
        `a trava não pegou: ${caso}`,
      ).toBe(true)
    }
    // E não acusa uso direto, que é o padrão CERTO e tem de continuar passando.
    expect(APELIDA_CLIENT.some((re) => re.test('listarFiliais(acesso.client)'))).toBe(false)
  })

  it('todo módulo que ACEITA client resolvido está declarado (superfície ou exceção)', () => {
    const declarados = new Set([...Object.keys(SUPERFICIE), ...Object.keys(EXCECOES)])
    const naoDeclarados = candidatosPorAssinatura().filter((c) => !declarados.has(c))
    expect(
      naoDeclarados,
      'quem aceita client resolvido pode receber o client do VIEWER (service_role): ' +
        'declare cada um na superfície, ou como exceção nominal com o motivo medido',
    ).toEqual([])
  })

  it('nenhuma exceção envelheceu — todas ainda aceitam client (a lista não sobrevive ao motivo)', () => {
    const candidatos = new Set(candidatosPorAssinatura())
    const obsoletas = Object.keys(EXCECOES).filter((e) => !candidatos.has(e))
    expect(
      obsoletas,
      'exceção que já não aceita client resolvido não descreve mais o repositório — apague a entrada',
    ).toEqual([])
  })

  it('cada exceção diz QUEM a chama, não a categoria dela', () => {
    for (const [arquivo, motivo] of Object.entries(EXCECOES)) {
      // Motivo medido cita call-site: tem nome de arquivo com `.ts`/`.tsx` e um número
      // de linha. "Não é de relatório" é categoria, e categoria não se confere.
      expect(motivo, `${arquivo}: motivo sem call-site`).toMatch(/\.tsx?:\d+/)
      expect(motivo.length, `${arquivo}: motivo curto demais para ser medição`).toBeGreaterThan(60)
    }
  })

  // -------------------------------------------------------------------------
  // AS LISTAS BRANCAS — e a catraca que só encolhe
  // -------------------------------------------------------------------------
  it('toda tabela lida pela superfície está na lista BRANCA', () => {
    const forasteiras = new Set<string>()
    for (const caminho of arquivos) {
      for (const t of chamadasLiterais(readFileSync(caminho, 'utf8'), 'from')) {
        if (!(t in TABELAS)) forasteiras.add(`${rotulo(caminho)} → ${t}`)
      }
    }
    expect(
      [...forasteiras].sort(),
      'o viewer roda sob service_role: uma tabela fora da lista branca fica exposta a ele. ' +
        'Deny-list não cobriria a tabela que ainda não nasceu — por isso a lista é branca.',
    ).toEqual([])
  })

  it('toda RPC chamada pela superfície está na lista BRANCA', () => {
    const forasteiras = new Set<string>()
    for (const caminho of arquivos) {
      for (const r of chamadasLiterais(readFileSync(caminho, 'utf8'), 'rpc')) {
        if (!(r in RPCS)) forasteiras.add(`${rotulo(caminho)} → ${r}`)
      }
    }
    expect([...forasteiras].sort(), 'RPC nova na superfície do viewer precisa de motivo escrito').toEqual(
      [],
    )
  })

  it('nenhum `.from(` ou `.rpc(` com argumento montado em runtime', () => {
    const montados: string[] = []
    for (const caminho of arquivos) {
      const fonte = readFileSync(caminho, 'utf8')
      for (const metodo of ['from', 'rpc'] as const) {
        for (const c of chamadasNaoLiterais(fonte, metodo)) montados.push(`${rotulo(caminho)}: ${c}`)
      }
    }
    expect(
      montados,
      'lista branca só enxerga nome LITERAL: um nome montado em runtime a atravessa sem ser visto',
    ).toEqual([])
  })

  // A catraca. Os dois números só descem: a fase que precisar subir um deles mexe
  // AQUI, de propósito, e explica por quê na ata — que é exatamente a conversa que
  // uma tabela nova na superfície do viewer merece ter.
  it('as listas brancas são catraca — só encolhem', () => {
    expect(Object.keys(TABELAS).length, 'TABELAS cresceu: uma tabela nova alcança o viewer').toBeLessThanOrEqual(9)
    expect(Object.keys(RPCS).length, 'RPCS cresceu: uma RPC nova alcança o viewer').toBeLessThanOrEqual(7)
  })

  it('as listas brancas descrevem o que a superfície REALMENTE lê (não envelheceram)', () => {
    const lidas = new Set<string>()
    const chamadas = new Set<string>()
    for (const caminho of arquivos) {
      const fonte = readFileSync(caminho, 'utf8')
      for (const t of chamadasLiterais(fonte, 'from')) lidas.add(t)
      for (const r of chamadasLiterais(fonte, 'rpc')) chamadas.add(r)
    }
    expect(Object.keys(TABELAS).filter((t) => !lidas.has(t)), 'tabela declarada que ninguém lê').toEqual([])
    expect(Object.keys(RPCS).filter((r) => !chamadas.has(r)), 'RPC declarada que ninguém chama').toEqual([])
  })

  // -------------------------------------------------------------------------
  // A ATRIBUIÇÃO A VARIÁVEL — o que derrota a varredura por call-site
  // -------------------------------------------------------------------------
  // `const c = acesso.client` some do grep por `acesso.client` no ponto de USO: a
  // partir dali quem viaja é `c`, e uma auditoria que procure o nome longo não vê
  // mais nada. A rota continua entregando o client do viewer — só que sem rastro.
  it('nenhuma rota guarda `acesso.client` numa variável', () => {
    const raizApp = join(process.cwd(), 'src', 'app')
    const infratores: string[] = []
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = join(dir, nome)
        if (statSync(p).isDirectory()) varrer(p)
        else if (/\.tsx?$/.test(nome) && !nome.includes('.test.')) {
          const fonte = readFileSync(p, 'utf8')
          if (APELIDA_CLIENT.some((re) => re.test(fonte))) {
            infratores.push(p.slice(raizApp.length + 1).split(/[\\/]/).join('/'))
          }
        }
      }
    }
    varrer(raizApp)
    expect(
      infratores,
      'apelidar o client do viewer esconde o call-site de toda auditoria por `acesso.client`',
    ).toEqual([])
  })

  for (const { termo, motivo } of PROIBIDOS) {
    it(`nenhuma query referencia "${termo}" (${motivo})`, () => {
      const infratores = arquivos
        .filter((p) => readFileSync(p, 'utf8').includes(termo))
        .map((p) => p.split(/[\\/]/).slice(-2).join('/'))
      expect(
        infratores,
        `viewer roda sob service_role: uma query a ${termo} vazaria ${motivo}`,
      ).toEqual([])
    })
  }
})
