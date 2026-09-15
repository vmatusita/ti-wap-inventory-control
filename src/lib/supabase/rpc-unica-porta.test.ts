import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'

// A PORTA ÚNICA DE RPC — trava de ARQUITETURA (F58 · Frente B).
//
// Toda chamada de função do banco em `src/**` passa por `chamarRpc` (`src/lib/supabase/rpc.ts`).
// É lá — e só lá — que as mentiras do gerador de tipos se corrigem: o `null` de domínio dos
// argumentos (o consolidado das `rel_*`, o alcance global do reset, o "sem arquivo" do backup de
// conflito) e o `null` que o corpo vivo devolve e o tipo gerado nega. Uma chamada por fora da porta
// volta a ter o tipo mentiroso, e o próximo `as unknown as number` volta junto.
//
// POR QUE AST, E NÃO TEXTO. Uma busca por `.rpc(` deixaria passar `client['rpc']('x')`,
// `const { rpc } = client`, `const chamar = client.rpc` e `client.rpc<T>(…)` — e acusaria o
// comentário que explica a porta. Aqui o arquivo é PARSEADO pelo compilador do próprio projeto
// (`typescript` já é dependência) e o que se procura é o NÓ: acesso à propriedade `rpc`, acesso
// indexado com a string `'rpc'`, ou desestruturação da chave `rpc`. Comentário e string não são
// nós de código — não casam.
//
// O QUE ELA OLHA
//  · `src/**` fora de arquivo de teste: ZERO uso fora da porta.
//  · `scripts/**`: só os arquivos da lista de ISENÇÕES, cada um com o motivo escrito — catraca que
//    só encolhe (uma isenção cujo arquivo parou de chamar RPC reprova até ser apagada).
//  · OS TESTES NÃO SÃO OLHADOS, e é decisão (ata F58 · Decisão 1): os `.rpc(` que existiam em
//    `*.test.*` eram roteiros sobre o TEXTO da fonte (`admin.test.ts`, `dev.test.ts`,
//    `importar.test.ts`) e fixtures sintéticas do detector de `fronteira-viewer.test.ts` — nenhum
//    chamava banco. Um dublê de client com `rpc: vi.fn()`, se um dia nascer, também não é chamada.
//
// ⚠ O QUE ELA NÃO PROVA: `client[nome]('x')` com o nome da propriedade numa VARIÁVEL não é
// reconhecido (não existe no repositório; e o `tsc` recusaria o índice dinâmico num client
// tipado). Lê o disco na COLETA, nunca dentro do `it` — lição da F57.

const RAIZ = process.cwd()
const PORTA = 'src/lib/supabase/rpc.ts'

export type UsoDeRpc = { linha: number; forma: string }

/** Cada uso de `rpc` como MEMBRO de um objeto — chamado, passado adiante ou desestruturado. */
export function usosDeRpc(fonte: string, nomeArquivo = 'arquivo.ts'): UsoDeRpc[] {
  const tipo = nomeArquivo.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : /\.(m?js|cjs)$/.test(nomeArquivo)
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS
  const sf = ts.createSourceFile(nomeArquivo, fonte, ts.ScriptTarget.Latest, true, tipo)
  const achados: UsoDeRpc[] = []
  const linha = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
  const visitar = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n) && n.name.text === 'rpc') {
      achados.push({ linha: linha(n), forma: '.rpc' })
    } else if (
      ts.isElementAccessExpression(n) &&
      (ts.isStringLiteral(n.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(n.argumentExpression)) &&
      n.argumentExpression.text === 'rpc'
    ) {
      achados.push({ linha: linha(n), forma: "['rpc']" })
    } else if (ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent)) {
      const chave = n.propertyName ?? n.name
      if ((ts.isIdentifier(chave) || ts.isStringLiteral(chave)) && chave.text === 'rpc') {
        achados.push({ linha: linha(n), forma: '{ rpc }' })
      }
    }
    ts.forEachChild(n, visitar)
  }
  visitar(sf)
  return achados
}

function varrer(dir: string, aceita: (nome: string) => boolean, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) varrer(p, aceita, acc)
    else if (aceita(e.name)) acc.push(p)
  }
  return acc
}
const rel = (p: string) => relative(RAIZ, p).split(sep).join('/')
const ehTeste = (nome: string) => /\.test\.(m?[jt]sx?)$/.test(nome)

// --- coleta (disco lido UMA vez, fora dos `it`) ---------------------------------------------
const USOS_SRC = varrer(join(RAIZ, 'src'), (n) => /\.tsx?$/.test(n) && !n.endsWith('.d.ts') && !ehTeste(n)).map(
  (p) => ({ arquivo: rel(p), usos: usosDeRpc(readFileSync(p, 'utf8'), p) }),
)
const USOS_SCRIPTS = varrer(join(RAIZ, 'scripts'), (n) => /\.(m?[jt]s)$/.test(n) && !n.endsWith('.d.ts') && !ehTeste(n)).map(
  (p) => ({ arquivo: rel(p), usos: usosDeRpc(readFileSync(p, 'utf8'), p) }),
)

/**
 * Os scripts que chamam RPC SEM a porta — cada um com o motivo. Só ENCOLHE.
 *
 * A porta exige `SupabaseClient<Database>`; estes, de propósito, não o têm. Migrar um deles é
 * apagar a entrada; acrescentar um exige vir aqui e escrever por que ele não pode usar a porta.
 */
const ISENCOES_DE_SCRIPTS: Record<string, string> = {
  'scripts/seed.ts':
    'popula o ENSAIO com o client administrativo que env-guard.ts cria SEM o genérico Database, de propósito (os tipos só se regeneram depois do push; um script de dados não precisa) — a porta exige o client tipado',
  'scripts/reset.ts':
    'mesmo client administrativo não tipado do seed, e a única RPC é resetar_dados_ficticios, que só existe no ensaio e é protegida por dois portões de ambiente',
  'scripts/env-guard.ts':
    'o segundo portão de ambiente chama rotulo_de_ambiente() com o client administrativo não tipado que ele próprio cria; é a guarda que roda ANTES de qualquer outra coisa do seed',
  'scripts/smoke/fixtures-passe2.ts':
    'Sessao = any MEDIDO (F56): SupabaseClient puro e ReturnType<typeof createClient> com opções de auth diferentes são incompatíveis nesta versão do supabase-js; roda só contra o ensaio',
  'scripts/smoke/checagens.ts':
    'mesmo Sessao = any medido de fixtures-passe2.ts; lê checagens_integridade_resumo() para o alarme, só leitura',
  'scripts/smoke/smoke-prod.mjs':
    'JavaScript puro (.mjs): roda de 6 em 6 horas no agendamento sem compilação nenhuma e não importa TypeScript — não tem como usar a porta; só chama rel_* de leitura',
  'scripts/perf/medir-guarda.mjs':
    'JavaScript puro (.mjs) que mede o custo de papel_atual() direto contra o Supabase; não importa TypeScript e não passa por client tipado',
  'scripts/formas/censo.mjs':
    'JavaScript puro (.mjs) do censo da F58: lê database.ts pelo compilador em runtime e só chama rel_* conferidas no corpo vivo antes da chamada; não importa TypeScript',
}

describe('o detector de uso de rpc reconhece as grafias (guarda do próprio teste)', () => {
  it.each([
    ['chamada direta', "client.rpc('rel_resumo', {})", 1],
    ['com genérico', "client.rpc<Tipo>('rel_resumo')", 1],
    ['encadeada opcional', "client?.rpc('x')", 1],
    ['acesso indexado', "client['rpc']('x')", 1],
    ['acesso indexado por template', 'client[`rpc`]("x")', 1],
    ['passada adiante', 'const chamar = client.rpc', 1],
    ['desestruturada', 'const { rpc } = client', 1],
    ['desestruturada e renomeada', 'const { rpc: chamar } = client', 1],
  ])('%s', (_nome, fonte, esperado) => {
    expect(usosDeRpc(fonte)).toHaveLength(esperado)
  })

  it.each([
    ['comentário de linha', '// client.rpc("x")'],
    ['comentário de bloco', '/* client.rpc("x") */'],
    ['string', "const t = 'client.rpc(\"x\")'"],
    ['variável que só se chama rpc', "const rpc = bloco === 'acervo' ? 'a' : 'b'"],
    ['renomear OUTRA chave para rpc', 'const { data: rpc } = resposta'],
    ['a porta', "chamarRpc(client, 'rel_resumo', {})"],
  ])('não casa: %s', (_nome, fonte) => {
    expect(usosDeRpc(fonte)).toEqual([])
  })

  it('a varredura enxerga src e scripts', () => {
    expect(USOS_SRC.length).toBeGreaterThan(300)
    expect(USOS_SCRIPTS.length).toBeGreaterThan(30)
  })
})

describe('src/**: nenhuma chamada de RPC fora da porta', () => {
  it('a porta existe e é ela quem chama client.rpc', () => {
    const porta = USOS_SRC.find((u) => u.arquivo === PORTA)
    expect(porta, `${PORTA} não foi encontrado`).toBeDefined()
    expect(porta?.usos.length ?? 0).toBeGreaterThanOrEqual(1)
  })

  it('zero uso de rpc fora de src/lib/supabase/rpc.ts', () => {
    const fora = USOS_SRC.filter((u) => u.arquivo !== PORTA).flatMap((u) =>
      u.usos.map((x) => `${u.arquivo}:${x.linha} (${x.forma})`),
    )
    expect(
      fora,
      'Chamada de RPC por fora da porta. Use `chamarRpc(client, nome, args)` de @/lib/supabase/rpc — é lá ' +
        'que o null de domínio dos argumentos e o null dos retornos se corrigem (mapas nominais travados ' +
        'contra o SQL vivo em rpc-mapas-sql.test.ts).',
    ).toEqual([])
  })
})

describe('scripts/**: só as isenções nominais', () => {
  it('nenhum script NOVO chama RPC sem a porta', () => {
    const novos = USOS_SCRIPTS.filter((u) => u.usos.length > 0 && !(u.arquivo in ISENCOES_DE_SCRIPTS)).map(
      (u) => `${u.arquivo}:${u.usos[0].linha}`,
    )
    expect(
      novos,
      'Script chamando RPC sem a porta: importe `chamarRpc` de src/lib/supabase/rpc (relativo) ou, se o client ' +
        'não puder ser tipado, acrescente a isenção com o motivo escrito.',
    ).toEqual([])
  })

  it('nenhuma isenção ENVELHECEU (o arquivo ainda existe e ainda chama RPC)', () => {
    const vivos = new Map(USOS_SCRIPTS.map((u) => [u.arquivo, u.usos.length]))
    const velhas = Object.keys(ISENCOES_DE_SCRIPTS).filter((a) => !vivos.get(a))
    expect(velhas, 'isenção sem uso: apague a entrada — a lista só encolhe').toEqual([])
  })

  it('cada isenção traz um motivo, não uma categoria', () => {
    for (const [arquivo, motivo] of Object.entries(ISENCOES_DE_SCRIPTS)) {
      expect(motivo.length, `${arquivo}: motivo curto demais`).toBeGreaterThan(60)
    }
  })
})
