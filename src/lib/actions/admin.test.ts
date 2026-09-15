import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// TRIPWIRES de `src/lib/actions/admin.ts` (F21, ampliados na F22). Não testam comportamento —
// leem a FONTE e travam propriedades estruturais que nenhum outro teste pegaria (não há banco
// no Vitest; a prova de runtime é supabase/tests/papeis_rls.sql e supabase/tests/cargo_dev.sql):
// action nova neste arquivo sem `exigirAdmin`, volta da guarda que só olhava sessão, cargo
// vindo de metadata e — desde a F22 — a VOLTA da gravação de cargo/status/vínculo pelo service
// role, que passava por fora de toda policy e era o que impedia proteger o cargo `dev`.
//
// Mesmo idioma dos guardas de fonte que já existem no repositório
// (src/lib/use-server-exports.test.ts, src/lib/queries/relatorios/fronteira-viewer.test.ts).

const FONTE = readFileSync(
  fileURLToPath(new URL('./admin.ts', import.meta.url)),
  'utf8',
)

// CÓDIGO sem comentários. Necessário porque os próprios comentários do arquivo CITAM o que
// estes tripwires proíbem ("antes era `exigirOperador()`", "o cargo nunca vem de
// `raw_user_meta_data`", "eram feitas com o SERVICE ROLE") — sem esta limpeza o teste ficaria
// vermelho pela documentação, e a saída "corrija" seria apagar a explicação.
//
// Limitação aceita: a limpeza não distingue `//` dentro de string. Há UM caso no módulo — o
// `://` do template literal de `origemDaRequisicao` —, e o efeito é apagar o resto DAQUELA
// linha. Nenhuma asserção daqui depende dela; se um dia depender, troque por um parser.
const CODIGO = FONTE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

// Versão sem espaço nenhum: as asserções sobre CHAMADAS não podem quebrar porque o Prettier
// mudou uma quebra de linha ou porque um argumento virou multilinha.
const SEM_ESPACO = CODIGO.replace(/\s+/g, '')

// Corpo de cada `export async function` do módulo, do cabeçalho até o próximo export.
function actionsExportadas(): { nome: string; corpo: string }[] {
  const re = /export async function (\w+)\(/g
  const inicios: { nome: string; indice: number }[] = []
  for (const m of CODIGO.matchAll(re)) {
    inicios.push({ nome: m[1], indice: m.index })
  }
  return inicios.map((i, k) => ({
    nome: i.nome,
    corpo: CODIGO.slice(i.indice, inicios[k + 1]?.indice ?? CODIGO.length),
  }))
}

// Toda gravação encadeada a partir de `.from('<tabela>')` — `client.from('x').update({…})`,
// `.insert(`, `.upsert(`, `.delete(`. A janela vai do `from` até o `.from(` seguinte (ou 400
// caracteres), o que cobre também a forma em duas linhas (`const q = client.from('x')`).
function gravacoesDiretas(tabela: string): string[] {
  const re = new RegExp(`\\.from\\(['"\`]${tabela}['"\`]\\)`, 'g')
  const achados: string[] = []
  for (const m of SEM_ESPACO.matchAll(re)) {
    const inicio = m.index + m[0].length
    const janela = SEM_ESPACO.slice(inicio, inicio + 400).split('.from(')[0]
    const mut = janela.match(/\.(update|insert|upsert|delete)\(/)
    if (mut) achados.push(`${m[0]}…${mut[0]}`)
  }
  return achados
}

describe('actions de /admin — toda escrita administrativa exige NÍVEL ADMINISTRADOR', () => {
  it('o módulo tem actions exportadas (a varredura não está passando a seco)', () => {
    expect(actionsExportadas().length).toBeGreaterThanOrEqual(7)
  })

  it('nenhuma action deste arquivo grava sem chamar exigirAdmin', () => {
    // Antes da F21 a guarda local era `exigirOperador()`, que só perguntava "existe
    // sessão?" — qualquer logado convidava usuário, criava filial e mexia nos motivos.
    // F22: `exigirAdmin` passou a ser HIERÁRQUICO (admin ou dev) — a chamada é a mesma.
    for (const a of actionsExportadas()) {
      expect(a.corpo, `${a.nome} não chama exigirAdmin`).toContain('exigirAdmin(')
    }
  })

  it('a guarda antiga não voltou', () => {
    expect(CODIGO).not.toMatch(/\bexigirOperador\s*\(/)
    // `idOperador` responde "existe sessão?", não "pode fazer isso?" — não é autorização.
    expect(CODIGO).not.toMatch(/\bidOperador\s*\(/)
  })
})

describe('o cargo nunca vem do metadata do usuário', () => {
  it('o módulo não lê nem escreve user_metadata / raw_user_meta_data', () => {
    // O próprio usuário edita o metadata dele via `auth.updateUser` (ADR-002 §5): usá-lo
    // como fonte de cargo seria entregar a autorização para o auditado. O cargo mora em
    // `profiles.papel` e só as RPCs de gestão o gravam.
    expect(CODIGO).not.toContain('user_metadata')
    expect(CODIGO).not.toContain('raw_user_meta_data')
    expect(CODIGO).not.toContain('app_metadata')
  })

  it('as travas de autoproteção são as funções puras testadas, não if solto', () => {
    expect(CODIGO).toContain('validarTrocaDePapel(')
    expect(CODIGO).toContain('validarStatusDeUsuario(')
    // A contagem de admins ativos vem do banco a cada gravação — nunca do cliente.
    expect(CODIGO).toContain('idsDeAdminsAtivos(')
  })
})

describe('F22 — cargo, status e vínculo só se gravam pelas RPCs, nunca pelo service role', () => {
  // ⚠ A MUDANÇA DE FUNDO DA FASE. Até a F21 estas três gravações eram UPDATE/INSERT/DELETE
  // diretos com `createAdminClient()` (service role), que passa POR FORA de toda policy: a
  // única coisa entre um admin e a escrita era o `if` da action. Isso deixou de servir quando
  // nasceu o cargo `dev`, que por definição não pode ser alterado por quem está abaixo dele.
  // Agora quem decide é o Postgres (RPCs `security definer` da migration 0074, chamadas com o
  // client de SESSÃO, mais a rede `profiles_guarda_dev` da 0073).
  //
  // Se alguém "consertar" um erro de RLS voltando ao service role, é aqui que estoura.

  it('o detector de gravação direta funciona (guarda do próprio teste)', () => {
    // `atualizarFilial` grava MESMO em `filiais`, com `.from('filiais').update(` — e deve
    // continuar gravando (filial não tem RPC, a policy `e_admin()` da 0063 basta). Se o
    // detector deixasse de enxergar este caso conhecido, os dois seguintes passariam a seco.
    expect(gravacoesDiretas('filiais').length).toBeGreaterThan(0)
    expect(gravacoesDiretas('motivos').length).toBeGreaterThan(0)
  })

  it('não existe gravação direta em `profiles` (papel, ativo, excluido_em)', () => {
    expect(gravacoesDiretas('profiles')).toEqual([])
  })

  it('não existe gravação direta em `operador_filiais` (os vínculos de escrita)', () => {
    expect(gravacoesDiretas('operador_filiais')).toEqual([])
  })

  it('as três RPCs de gestão são as chamadas, e com o client de SESSÃO', () => {
    // F58 · Frente B — a PORTA ÚNICA de RPC: `supabase.rpc('nome', …)` virou
    // `chamarRpc(supabase, 'nome', …)` (`supabase` é o client de SESSÃO em escopo nas
    // três funções que gravam cargo/vínculo/status). A prova continua a MESMA — client
    // de sessão, nunca o administrativo —, só a grafia da chamada mudou.
    for (const rpc of [
      'definir_papel_usuario',
      'definir_vinculos_usuario',
      'definir_status_usuario',
    ]) {
      expect(SEM_ESPACO, `${rpc} não é chamada pela porta`).toContain(
        `chamarRpc(supabase,'${rpc}'`,
      )
      // Pelo client administrativo a decisão voltaria a ser do `if` da action: `auth.uid()`
      // é NULO no service role, e a guarda interna da RPC não teria em quem se apoiar.
      expect(SEM_ESPACO, `${rpc} chamada pelo client administrativo`).not.toContain(
        `chamarRpc(admin,'${rpc}'`,
      )
    }
    // Nenhuma chamada de RPC deste arquivo pode voltar a usar `.rpc(` direto — a porta
    // é a ÚNICA forma, e um `admin.rpc(`/`supabase.rpc(` esquecido é exatamente a volta
    // que este describe existe para pegar.
    expect(CODIGO, 'sobrou uma chamada `.rpc(` direta, fora da porta').not.toMatch(/\.rpc\(/)
  })

  it('o convite também recusa conceder o cargo dev sem ser dev', () => {
    // O convite é o OUTRO caminho de concessão de cargo: `editarUsuario` recusa promover a
    // dev, mas convidar alguém JÁ como dev entraria por aqui. A RPC recusaria depois — só que
    // com a conta já criada no Auth e um link válido na mão do admin.
    const convite = actionsExportadas().find((a) => a.nome === 'convidarUsuario')
    expect(convite, 'convidarUsuario sumiu do módulo').toBeDefined()
    expect(convite!.corpo).toContain('eDev(')
    expect(convite!.corpo).toContain('MSG_SO_DEV_GERE_DEV')
  })

  // F29/ADM-02b — a ação por linha abriu uma SEGUNDA porta para o mesmo link de
  // recuperação, e quem abre esse link DEFINE A SENHA daquela conta. Sem repetir a
  // checagem, um administrador pegaria o e-mail de um desenvolvedor — que ele lê na
  // própria tabela — e assumiria a conta. É o furo que a F22 fechou no convite.
  it('gerar link de acesso repete a trava anti-furo do convite', () => {
    const gerar = actionsExportadas().find((a) => a.nome === 'gerarLinkDeAcesso')
    expect(gerar, 'gerarLinkDeAcesso sumiu do módulo').toBeDefined()
    expect(gerar!.corpo).toContain('eDev(')
    expect(gerar!.corpo).toContain('perfilPorEmail(')
    expect(gerar!.corpo).toContain('MSG_SO_DEV_GERE_DEV')
  })

  // A trilha de `eventos_admin` não é decorativa: é o que responde "quem gerou um link
  // para a conta de fulano, e quando". O caminho é compartilhado com o reenvio do
  // convite, e o registro tem de estar DENTRO dele.
  it('todo link de recuperação gerado deixa rastro em eventos_admin', () => {
    expect(SEM_ESPACO).toContain("type:'recovery'")
    const helper = CODIGO.slice(CODIGO.indexOf('async function gerarLinkDeRecuperacao'))
    expect(helper).toContain('registrarEventoAdmin(')
    expect(helper).toContain('convite_reenviado')
  })
})
