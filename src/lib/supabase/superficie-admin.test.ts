import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { limpar } from '@/lib/use-server-exports'

// O CENSO DA SUPERFÍCIE SEM RLS — F49. RODA SEM BANCO.
//
// `createAdminClient()` devolve um client de SERVICE ROLE: ele tem `rolbypassrls` e
// grants amplos, e portanto passa POR FORA de toda policy. Nada do modelo de acesso
// — nem `papel_atual()`, nem `e_admin()`, nem o piso de leitura — alcança uma consulta
// feita por ele. A única coisa entre esse client e o banco inteiro é o código
// TypeScript que o cerca.
//
// Esta suíte não proíbe o service role: ele é necessário, e cada uso abaixo tem um
// motivo real. Ela faz uma coisa mais modesta e mais útil: obriga cada ARQUIVO que o
// invoca a estar DECLARADO aqui, com (a) por que a RLS não serve naquele caminho e
// (b) o nome da GUARDA que o protege. Arquivo novo com `createAdminClient()` reprova
// até alguém escrever as duas coisas.
//
// POR QUE ISSO IMPORTA AGORA, e não só como higiene: na virada multiempresa esta
// lista é a AGENDA. Toda query que hoje passa por fora da RLS terá de ganhar recorte
// de tenant explícito no código, porque não haverá policy para fazê-lo por ela. Uma
// lista incompleta na véspera da virada é um vazamento entre empresas depois dela.
//
// ⚠ A guarda declarada tem de ser um MECANISMO QUE EXISTE, nomeado. "É admin" não é
// resposta: três dos oito arquivos NÃO têm guarda de cargo nenhuma, e o que os
// protege é outra coisa (um cookie assinado, a ausência de policy de escrita). Dizer
// "é admin" sobre eles seria a mentira mais cara desta lista.
//
// Medido em 07/09/2026: 22 invocações reais em 8 arquivos. A ordem de serviço da F49
// previa "25 call-sites em 11 arquivos" — os 11 contam também o arquivo de DEFINIÇÃO
// (`supabase/admin.ts`), um arquivo que só menciona a string num comentário
// (`queries/dev.ts`) e um teste; e as 25 contam imports e anotação de tipo.

const RAIZ = process.cwd()
const RAIZ_SRC = join(RAIZ, 'src')

/** Onde a função é DEFINIDA — não é call-site. */
const DEFINICAO = 'src/lib/supabase/admin.ts'

type Declaracao = {
  /** Por que a RLS não serve neste caminho. */
  motivo: string
  /** O mecanismo que autoriza — nomeado, e que existe no arquivo. */
  guarda: string
}

/**
 * Os arquivos que invocam `createAdminClient()`, com motivo e guarda.
 *
 * A ordem é a do risco: primeiro os que NÃO têm guarda de cargo.
 */
const DECLARADOS: Record<string, Declaracao> = {
  // --- Os três sem guarda de CARGO. São os que mais precisam do motivo escrito.
  'src/lib/auth/acesso.ts': {
    motivo:
      'É o caminho do VISUALIZADOR POR SENHA. Quem entra por ali não tem conta no Supabase, logo não tem client de sessão nenhum: `papel_atual()` devolve NULL para essa sessão. O client admin não é um atalho aqui — ele É o client que `resolverAcessoRelatorio` entrega às queries de relatório, porque não existe outro.',
    guarda:
      'cookie httpOnly ASSINADO, conferido por `getViewerSession` (acesso.ts:429) contra `senhas_acesso.ativa` no banco a cada request — é o que faz a revogação de uma senha valer no request seguinte. O client admin só é criado depois que essa conferência passa, e só serve rotas /relatorios/**.',
  },
  'src/lib/auditoria-registro.ts': {
    motivo:
      'Grava em `eventos_admin`, que tem RLS ligada com policy de SELECT (admin) e NENHUMA policy de escrita, de propósito. Uma trilha que o próprio auditado pudesse gravar ou reescrever não seria trilha — o único caminho de INSERT é o service role.',
    guarda:
      'NENHUMA guarda de cargo, e é deliberado: quem chama já passou pela guarda da ação que está sendo auditada. A defesa aqui é a ausência de policy de escrita (a trilha é append-only para todo mundo, service role incluído no sentido de que nada a apaga) e o fato de a função só REGISTRAR, nunca ler nem decidir.',
  },

  // --- Os cinco atrás de guarda de cargo.
  'src/lib/queries/admin.ts': {
    motivo:
      'Lê PESSOAS, não inventário: `auth.admin.listUsers` e `auth.admin.getUserById` são APIs exclusivas do Auth administrativo, e não existe tabela com RLS que exponha e-mail, último acesso e banimento de `auth.users`. `idsDeAdminsAtivos` e `getEstadoUsuario` precisam enxergar o conjunto REAL de administradores para as travas de autoproteção — se a RLS escondesse o alvo de quem pergunta, a trava "não fique sem administrador" poderia ser burlada apagando quem você não enxerga.',
    guarda:
      '`exigirAdmin` nas actions que as chamam (actions/admin.ts:92, :274, :436, :505) e `exigirDev` nas de dev.ts (:54, :111, :212); as duas de listagem pura (listarUsuarios, listarSenhasAcesso) são alcançadas só pelas páginas sob `admin/layout.tsx`, que roda `getOperador` + `eAdmin` antes de renderizar.',
  },
  'src/lib/actions/admin.ts': {
    motivo:
      'Cria conta e emite token de convite/recuperação (`auth.admin.generateLink`), bane e desbane (`auth.admin.updateUserById` com `ban_duration`) e lê o e-mail do alvo para nomear a trilha. Todas são operações do Auth administrativo: não há equivalente por client de sessão.',
    guarda: '`exigirAdmin`, no topo de cada export (linhas 92, 274, 436, 505).',
  },
  'src/lib/actions/dev.ts': {
    motivo:
      'Troca o e-mail de login (`auth.admin.updateUserById`) e remove a conta do Auth (`auth.admin.deleteUser`) depois de a RPC arquivar o perfil. São as duas operações que o CLAUDE.md reserva ao cargo dev, e nenhuma existe fora do client administrativo.',
    guarda: '`exigirDev`, no topo de cada export (linhas 54, 111).',
  },
  'src/lib/actions/senhas.ts': {
    motivo:
      '`senhas_acesso` está em deny-all (zero policies) desde a migration 0012, justamente para que a coluna `hash` nunca chegue a um client de sessão — RLS é row-level, não column-level. Ler ou gravar ali só é possível pelo service role.',
    guarda:
      '`exigirAdmin` em três dos quatro (linhas 150, 197, 234). O quarto é `entrarComSenha`, a porta pública do visualizador, onde não há cargo a exigir: ali a defesa é o rate-limit persistente por IP (RPC `registrar_tentativa_senha`, chamada ANTES da comparação) e o `crypto.scrypt` timing-safe.',
  },
  'src/lib/actions/dev-destrutivo.ts': {
    motivo:
      'Remove do bucket `termos` os `.docx` que ficaram órfãos depois de a RPC apagar a linha. É Storage, não tabela — e o próprio arquivo registra que a sessão do dev provavelmente conseguiria pela policy do bucket, mas que não se quis depender desse detalhe de predicado num caminho destrutivo.',
    guarda:
      '`exigirDev` nos exports que chegam até aqui (apagarAtivo:175, resetarBloco:327), além da guarda interna `exigir_dev_para_destruir()` dentro da própria RPC.',
  },
  'src/lib/actions/conflitos.ts': {
    motivo:
      'Gêmeo do caso acima, na mesa de conflitos entre filiais: apaga do bucket `backups-import` o backup que subiu mas cuja RPC recusou, e limpa os `.docx` órfãos depois do commit de `apagar_ativos_conflito_filiais`. Mesma família de necessidade — Storage, por conservadorismo.',
    guarda:
      '`exigirAdmin` no export que chega até aqui (apagarConflito:210) — é a ÚNICA exceção à exclusividade do dev sobre exclusão de ativo (F24), e a RPC revalida tudo sob lock por dentro.',
  },
}

function varrer(dir: string): string[] {
  const achados: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) achados.push(...varrer(caminho))
    else if (/\.tsx?$/.test(entrada.name)) achados.push(caminho)
  }
  return achados
}

const rel = (f: string) => relative(RAIZ, f).split(sep).join('/')

/**
 * Invocações REAIS de `createAdminClient()` — não a linha de import, não um
 * comentário, não `ReturnType<typeof createAdminClient>`.
 *
 * Roda sobre a fonte neutralizada (comentários e strings apagados) e exige o
 * parêntese de chamada; a anotação de tipo é descartada pelo `typeof` que a precede.
 */
function invocacoes(fonte: string): number {
  const limpo = limpar(fonte, true)
  const re = /(^|[^.\w])(?<!typeof\s)createAdminClient\s*\(/g
  let n = 0
  while (re.exec(limpo) !== null) n++
  return n
}

const ARQUIVOS_COM_INVOCACAO = varrer(RAIZ_SRC)
  .filter((f) => !/\.test\.tsx?$/.test(f))
  .map((f) => ({ arquivo: rel(f), n: invocacoes(readFileSync(f, 'utf8')) }))
  .filter((x) => x.n > 0 && x.arquivo !== DEFINICAO)

describe('o censo enxerga o repositório (guarda do próprio teste)', () => {
  it('encontra invocações de createAdminClient()', () => {
    expect(ARQUIVOS_COM_INVOCACAO.length).toBeGreaterThan(0)
  })

  it('a leitura NÃO conta import, comentário nem anotação de tipo', () => {
    // Se contasse, `queries/dev.ts` (que só menciona a string num comentário) e a
    // anotação `ReturnType<typeof createAdminClient>` de actions/admin.ts entrariam.
    expect(invocacoes("import { createAdminClient } from '@/lib/supabase/admin'")).toBe(0)
    expect(invocacoes('// antes o arquivo chamava createAdminClient() aqui')).toBe(0)
    expect(invocacoes('type T = ReturnType<typeof createAdminClient>')).toBe(0)
    expect(invocacoes('const admin = createAdminClient()')).toBe(1)
    expect(invocacoes('return { client: createAdminClient() }')).toBe(1)
  })
})

describe('todo arquivo que usa service role está declarado, com motivo e guarda', () => {
  it.each(ARQUIVOS_COM_INVOCACAO.map((x) => x.arquivo))('%s', (arquivo) => {
    expect(
      DECLARADOS[arquivo],
      `${arquivo} invoca createAdminClient() e NÃO está declarado em superficie-admin.test.ts.\n` +
        `O service role passa por fora de TODA policy: o que separa esse client do banco\n` +
        `inteiro é só o código à volta dele. Declare o arquivo com (a) por que a RLS não\n` +
        `serve nesse caminho e (b) o NOME do mecanismo que o protege.\n` +
        `Na virada multiempresa esta lista é a agenda do recorte por tenant — um arquivo\n` +
        `fora dela é um recorte que ninguém vai lembrar de fazer.`,
    ).toBeDefined()
  })

  it('nenhuma declaração é órfã (o arquivo existe e ainda invoca)', () => {
    const reais = new Set(ARQUIVOS_COM_INVOCACAO.map((x) => x.arquivo))
    for (const arquivo of Object.keys(DECLARADOS)) {
      expect(
        reais.has(arquivo),
        `${arquivo} está declarado mas não invoca mais createAdminClient() — remova a entrada`,
      ).toBe(true)
    }
  })

  it('motivo e guarda são frases, não rótulos', () => {
    for (const [arquivo, d] of Object.entries(DECLARADOS)) {
      expect(d.motivo.length, `${arquivo}: motivo curto demais`).toBeGreaterThan(80)
      expect(d.guarda.length, `${arquivo}: guarda curta demais`).toBeGreaterThan(40)
    }
  })

  it('a guarda declarada nomeia um mecanismo — nunca só "é admin"', () => {
    // A pergunta que a revisão adversarial faz sobre esta lista, virada teste: cada
    // entrada tem de citar uma guarda de acesso.ts, ou nomear explicitamente o outro
    // mecanismo (cookie assinado, rate-limit, ausência de policy) E dizer que não há
    // guarda de cargo.
    const MECANISMOS =
      /exigirDev|exigirAdmin|exigirEscrita|exigirEscritaEm|exigirPapel|getOperador|cookie httpOnly ASSINADO|rate-limit|NENHUMA guarda de cargo/
    for (const [arquivo, d] of Object.entries(DECLARADOS)) {
      expect(d.guarda, `${arquivo}: a guarda precisa NOMEAR o mecanismo, não rotulá-lo`).toMatch(
        MECANISMOS,
      )
    }
  })
})
