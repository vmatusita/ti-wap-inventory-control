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
  // --- Os sem guarda de CARGO. São os que mais precisam do motivo escrito.
  // F68 (19/11/2026): `src/lib/auth/acesso.ts` (o visualizador por senha) e `src/lib/actions/senhas.ts` (a gestão das
  // senhas) SAÍRAM desta lista — os dois deixaram de criar client administrativo. O visualizador fala só pelas duas
  // funções do banco executáveis por `anon` (lib/supabase/publico.ts); a gestão, pelas funções por empresa (0211) com o
  // client de SESSÃO.
  'src/lib/auditoria-registro.ts': {
    motivo:
      'Grava em `eventos_admin`, que tem RLS ligada com policy de SELECT (admin) e NENHUMA policy de escrita, de propósito. Uma trilha que o próprio auditado pudesse gravar ou reescrever não seria trilha — o único caminho de INSERT é o service role.',
    guarda:
      'NENHUMA guarda de cargo, e é deliberado: quem chama já passou pela guarda da ação que está sendo auditada. A defesa aqui é a ausência de policy de escrita (a trilha é append-only para todo mundo, service role incluído no sentido de que nada a apaga) e o fato de a função só REGISTRAR, nunca ler nem decidir.',
  },

  // --- Os atrás de guarda de cargo.
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
  'src/lib/actions/dev-destrutivo.ts': {
    motivo:
      'Copia e remove do bucket `termos` os `.docx` que ficaram sem linha depois de a RPC apagar a linha (e, desde a F67B, os sem registro da ferramenta de órfão `limparTermosSemLinha`). É Storage, não tabela — e desde a contração da F67B (0198) é NECESSIDADE: o bucket decide pela LINHA, e um `.docx` sem linha não é alcançável por sessão nenhuma.',
    guarda:
      '`exigirDev` nos exports que chegam até aqui (apagarAtivo, resetarBloco, limparTermosSemLinha), além da guarda interna dentro de cada RPC (`exigir_dev_para_destruir()`; `e_plataforma()` em `registrar_limpeza_termos_sem_linha`) — e só a lista que a RPC DEVOLVEU é copiada/removida.',
  },
  'src/lib/actions/importar.ts': {
    motivo:
      'F67B (decisão 16/11-2 do Johnny): SÓ a cópia e a remoção dos `.docx` dos termos que `importar_ativos_substituir` acabou de apagar, DEPOIS da RPC. Desde a contração (0198) o bucket `termos` decide pela LINHA; a RPC apagou as linhas, então nenhuma sessão alcança mais esses arquivos. A RPC, o backup e o descarte do backup seguem no client de sessão.',
    guarda:
      '`exigirAdmin` no export que chega até aqui (aplicarImport), a guarda `e_admin_na(p_empresa)` dentro da RPC, e a lista copiada/removida é exatamente `arquivos_termos_apagados` do RETORNO da RPC (nunca um caminho montado no app), pela porta única `copiarEntaoRemoverTermos`.',
  },
  'src/lib/actions/conflitos.ts': {
    motivo:
      'Gêmeo do caso acima, na mesa de conflitos entre filiais: apaga do bucket `backups-import` o backup que subiu mas cuja RPC recusou, e limpa os `.docx` órfãos depois do commit de `apagar_ativos_conflito_filiais`. Storage — e, para os `.docx`, desde a contração da F67B (0198) necessidade: sem linha, nenhuma sessão alcança o arquivo.',
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

  it('F67B (16/11-2): importar.ts invoca o service role UMA vez só — e é no passo dos .docx, depois da RPC', () => {
    // A decisão do Johnny abre o client administrativo no import SÓ para copiar e remover os `.docx` que a RPC acabou de
    // apagar. Declarar o arquivo não basta: uma segunda invocação (no backup, na RPC, no descarte) passaria pela
    // declaração. A trava é a contagem exata e o ponto de uso.
    const a = ARQUIVOS_COM_INVOCACAO.find((x) => x.arquivo === 'src/lib/actions/importar.ts')
    expect(a?.n, 'importar.ts: o service role saiu do passo dos .docx ou ganhou outro uso').toBe(1)
    const fonte = limpar(readFileSync(join(RAIZ, 'src', 'lib', 'actions', 'importar.ts'), 'utf8'), true)
    expect(fonte).toMatch(/copiarEntaoRemoverTermos\(\s*createAdminClient\(\)/)
    // as posições no texto CRU (o `limpar` apaga os literais, e o nome da RPC é um literal)
    const cru = readFileSync(join(RAIZ, 'src', 'lib', 'actions', 'importar.ts'), 'utf8')
    const iRpc = cru.indexOf("chamarRpc(client, 'importar_ativos_substituir'")
    const iAdmin = cru.search(/copiarEntaoRemoverTermos\(\s*createAdminClient\(\)/)
    expect(iRpc, 'a RPC do import não foi achada').toBeGreaterThan(-1)
    expect(iAdmin, 'o service role aparece ANTES da RPC').toBeGreaterThan(iRpc)
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
