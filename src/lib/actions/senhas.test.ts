import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// TRIPWIRES de `src/lib/actions/senhas.ts` (F29). Não testam comportamento — leem a
// FONTE e travam propriedades que nenhum outro teste pegaria (não há banco no Vitest).
// Mesmo idioma dos guardas que já existem no repositório (actions/admin.test.ts,
// use-server-exports.test.ts, queries/relatorios/fronteira-viewer.test.ts).
//
// O que está em jogo: `senhas_acesso` está em deny-all de RLS (migration 0012) e estas
// actions falam com ela pelo SERVICE ROLE. A guarda real deste caminho é a camada de
// action — não o banco. Uma action nova sem `exigirAdmin` aqui é acesso irrestrito à
// tabela de senhas por qualquer logado.

const FONTE = readFileSync(
  fileURLToPath(new URL('./senhas.ts', import.meta.url)),
  'utf8',
)

// CÓDIGO sem comentários: os próprios comentários do módulo CITAM o que estes
// tripwires proíbem ("sem `exigirAdmin()` aqui, QUALQUER logado criaria…").
const CODIGO = FONTE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
const SEM_ESPACO = CODIGO.replace(/\s+/g, '')

function actionsExportadas(): { nome: string; corpo: string }[] {
  const re = /export async function (\w+)\(/g
  const inicios: { nome: string; indice: number }[] = []
  for (const m of CODIGO.matchAll(re)) {
    inicios.push({ nome: m[1], indice: m.index })
  }
  return inicios.map((ini, i) => ({
    nome: ini.nome,
    corpo: CODIGO.slice(ini.indice, inicios[i + 1]?.indice ?? CODIGO.length),
  }))
}

describe('actions/senhas.ts — guardas de fonte', () => {
  it('o módulo tem actions exportadas (a varredura não está passando a seco)', () => {
    expect(actionsExportadas().length).toBeGreaterThanOrEqual(4)
  })

  // `entrarComSenha` e `sairVisualizacao` são as portas PÚBLICAS (o login por senha e o
  // logout dele) — exigir admin nelas quebraria o produto. Todas as demais tocam a
  // gestão e precisam da guarda.
  it('toda action de GESTÃO de senha chama exigirAdmin', () => {
    const publicas = ['entrarComSenha', 'sairVisualizacao']
    for (const a of actionsExportadas()) {
      if (publicas.includes(a.nome)) continue
      expect(a.corpo, `${a.nome} não chama exigirAdmin`).toContain('exigirAdmin(')
    }
  })

  // F29/ADM-05b — o teste de senha responde SÓ um booleano. Devolver o rótulo, o hash
  // ou (pior) o texto digitado transformaria um conferidor num vazamento.
  it('testarSenhaAcesso devolve só o veredito — nunca o hash nem o texto digitado', () => {
    const acao = actionsExportadas().find((a) => a.nome === 'testarSenhaAcesso')
    expect(acao, 'testarSenhaAcesso sumiu do módulo').toBeDefined()
    const corpo = acao!.corpo
    // Compara pela MESMA função timing-safe do login público.
    expect(corpo).toContain('verificarSenha(')
    // O único retorno de sucesso é `{ ok: true, confere }`.
    expect(SEM_ESPACO).toContain('return{ok:true,confere}')
    expect(corpo).not.toContain('hash:')
    expect(corpo).not.toMatch(/console\.(log|error|warn)/)
  })

  // A senha em claro nunca é persistida: o insert grava `hash`, produzido por
  // `hashSenha`. Um `senha:` chegando ao insert seria o fim dessa garantia.
  it('nenhuma senha em claro vai para o banco', () => {
    expect(SEM_ESPACO).toContain('hash=awaithashSenha(')
    expect(SEM_ESPACO).not.toContain(".insert({rotulo:parsed.data.rotulo,senha")
  })

  // A trilha de senha guarda o RÓTULO, nunca o segredo — `eventos_admin` é legível por
  // todo admin.
  it('a trilha de auditoria não recebe hash nem senha', () => {
    const trechos = CODIGO.split('registrarEventoAdmin(').slice(1)
    expect(trechos.length).toBeGreaterThan(0)
    for (const t of trechos) {
      const chamada = t.slice(0, t.indexOf('})') + 2)
      expect(chamada).not.toContain('hash')
      expect(chamada).not.toContain('senha:')
    }
  })
})

// F64 (23/09/2026) — O CONTADOR DE TENTATIVAS FALHA FECHADO (decisão 3 do Johnny, que reverte a X4).
// A trava de FONTE, irmã do teste de comportamento `senhas-rate-limit.test.ts`: o corpo de
// `entrarComSenha` LÊ o `error` da RPC `registrar_tentativa_senha` e RECUSA com ele ANTES de ler
// `senhas_acesso` e de conferir senha. A volta ao `const { data: excedeu } = await chamarRpc(…)` — o
// `error` descartado, `null` falsy, o rate-limit caindo junto com o banco — reprova aqui.

/** Onde termina o bloco `{…}` que abre em `i` (atravessa texto entre aspas). */
function fimDoBloco(texto: string, i: number): number {
  let prof = 0
  for (let j = i; j < texto.length; j++) {
    const c = texto[j]
    if (c === "'" || c === '"' || c === '`') {
      for (j++; j < texto.length && texto[j] !== c; j++) if (texto[j] === '\\') j++
      continue
    }
    if (c === '{') prof++
    else if (c === '}' && --prof === 0) return j + 1
  }
  return -1
}

/** O rate-limit do corpo falha fechado? Lê o `error`, e o `if (error)` devolve antes de tocar senha. */
function rateLimitFalhaFechado(corpo: string): boolean {
  const chamada = /const\s*\{\s*data\s*:\s*excedeu\s*,\s*error\s*:\s*(\w+)\s*\}\s*=\s*await\s+chamarRpc\(\s*admin\s*,\s*'registrar_tentativa_senha'/.exec(corpo)
  if (!chamada) return false
  const depois = corpo.slice(chamada.index)
  const se = new RegExp(String.raw`if\s*\(\s*${chamada[1]}\s*\)\s*\{`).exec(depois)
  if (!se) return false
  const abre = se.index + se[0].length - 1
  const fecha = fimDoBloco(depois, abre)
  if (fecha < 0 || !/\breturn\s*\{\s*erro\s*:/.test(depois.slice(abre, fecha))) return false
  const lerSenhas = depois.search(/\.from\(\s*'senhas_acesso'\s*\)/)
  const conferir = depois.indexOf('verificarSenha(')
  return lerSenhas > fecha && conferir > fecha
}

describe('actions/senhas.ts — o rate-limit falha FECHADO (F64)', () => {
  const entrar = actionsExportadas().find((a) => a.nome === 'entrarComSenha')

  it('entrarComSenha lê o error do contador e recusa com ele antes de ler e conferir senha', () => {
    expect(entrar, 'entrarComSenha sumiu do módulo').toBeDefined()
    expect(rateLimitFalhaFechado(entrar!.corpo), 'o error de registrar_tentativa_senha é descartado — o rate-limit falha ABERTO').toBe(true)
  })

  it('a forma que falhava ABERTO não está no módulo', () => {
    expect(SEM_ESPACO).not.toMatch(/const\{data:excedeu\}=awaitchamarRpc\(/)
  })

  it.each([
    ['a forma de antes da F64 (o error descartado)', "const { data: excedeu } = await chamarRpc(admin, 'registrar_tentativa_senha', { p_ip: ip })\nif (excedeu) { return { erro: 'x' } }\nconst { data } = await admin.from('senhas_acesso').select('id')\nawait verificarSenha(s, h)", false],
    ['o error lido e só registrado, sem recusar', "const { data: excedeu, error: e } = await chamarRpc(admin, 'registrar_tentativa_senha', { p_ip: ip })\nif (e) { registrarFalha({ escopo: 'x', erro: e }) }\nconst { data } = await admin.from('senhas_acesso').select('id')\nawait verificarSenha(s, h)", false],
    ['o error recusado DEPOIS de ler as senhas', "const { data: excedeu, error: e } = await chamarRpc(admin, 'registrar_tentativa_senha', { p_ip: ip })\nconst { data } = await admin.from('senhas_acesso').select('id')\nif (e) { return { erro: 'x' } }\nawait verificarSenha(s, h)", false],
    ['a forma certa', "const { data: excedeu, error: e } = await chamarRpc(admin, 'registrar_tentativa_senha', { p_ip: ip })\nif (e) {\n  registrarFalha({ escopo: 'x', erro: e })\n  return { erro: 'y' }\n}\nconst { data } = await admin.from('senhas_acesso').select('id')\nawait verificarSenha(s, h)", true],
  ])('a trava reconhece %s', (_nome, corpo, fechado) => {
    expect(rateLimitFalhaFechado(corpo)).toBe(fechado)
  })
})
