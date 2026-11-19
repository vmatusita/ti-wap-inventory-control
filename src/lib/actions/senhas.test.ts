import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// TRIPWIRES de `src/lib/actions/senhas.ts` — a GESTÃO das senhas de visualização (F29; reescrito na F68).
//
// Não testam comportamento — leem a FONTE e travam propriedades que nenhum outro teste pegaria. Desde a F68 (19/11/2026)
// a gestão passa pelo BANCO, por empresa: `senha_acesso_criar` / `_conferir` / `_definir_status` (0211, security definer,
// `e_admin_na(p_empresa)` antes de qualquer efeito), com o client de SESSÃO de quem clicou — sem service role. A ENTRADA
// dos gestores (a porta pública) saiu daqui: é `actions/porta.ts` (porta.test.ts), e o contador de tentativas mora dentro
// de `relatorio_publico_abrir`.

const FONTE = readFileSync(fileURLToPath(new URL('./senhas.ts', import.meta.url)), 'utf8')
// CÓDIGO sem comentários: os comentários do módulo CITAM o que estes tripwires proíbem.
const CODIGO = FONTE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
const SEM_ESPACO = CODIGO.replace(/\s+/g, '')

function actionsExportadas(): { nome: string; corpo: string }[] {
  const inicios = [...CODIGO.matchAll(/export async function (\w+)\(/g)].map((m) => ({ nome: m[1]!, indice: m.index! }))
  return inicios.map((ini, i) => ({
    nome: ini.nome,
    corpo: CODIGO.slice(ini.indice, inicios[i + 1]?.indice ?? CODIGO.length),
  }))
}

describe('actions/senhas.ts — guardas de fonte (a gestão pelo banco, F68)', () => {
  it('o módulo tem as três actions de gestão (a varredura não está passando a seco)', () => {
    expect(actionsExportadas().map((a) => a.nome).sort()).toEqual(['criarSenhaAcesso', 'definirStatusSenha', 'testarSenhaAcesso'])
  })

  it('a porta pública NÃO mora mais aqui (entrarComSenha/sairVisualizacao saíram para actions/porta.ts)', () => {
    expect(CODIGO).not.toMatch(/entrarComSenha|sairVisualizacao|registrar_tentativa_senha/)
  })

  // A sabotagem H do lado da gestão: o service role de volta em senhas.ts reprova aqui.
  it('nenhum client administrativo: senhas.ts não importa nem cria o service role', () => {
    expect(CODIGO).not.toMatch(/createAdminClient|@\/lib\/supabase\/admin/)
    expect(CODIGO).not.toMatch(/\.from\(\s*'senhas_acesso'\s*\)/)
  })

  it('toda action chama exigirAdmin (a MENSAGEM) e fala com a função do banco por empresa (a SEGURANÇA)', () => {
    const fn: Record<string, string> = {
      criarSenhaAcesso: 'senha_acesso_criar',
      testarSenhaAcesso: 'senha_acesso_conferir',
      definirStatusSenha: 'senha_acesso_definir_status',
    }
    for (const a of actionsExportadas()) {
      expect(a.corpo, `${a.nome} não chama exigirAdmin`).toContain('exigirAdmin(')
      expect(a.corpo.replace(/\s+/g, ''), `${a.nome} não chama ${fn[a.nome]} com a empresa`).toMatch(
        new RegExp(String.raw`chamarRpc\(supabase,'${fn[a.nome]}',\{p_empresa:`),
      )
    }
  })

  it('testarSenhaAcesso devolve só o veredito — nunca o hash nem o texto digitado', () => {
    const corpo = actionsExportadas().find((a) => a.nome === 'testarSenhaAcesso')!.corpo
    expect(SEM_ESPACO).toContain('return{ok:true,confere}')
    expect(corpo).not.toContain('hash')
    expect(corpo).not.toMatch(/console\.(log|error|warn)/)
  })

  it('a trilha não recebe hash nem senha, e a de revogar/reativar grava a empresa passada à função (a DA LINHA)', () => {
    const trechos = CODIGO.split('registrarEventoAdmin(').slice(1)
    expect(trechos).toHaveLength(2)
    for (const t of trechos) {
      const chamada = t.slice(0, t.indexOf('})') + 2)
      expect(chamada).not.toContain('hash')
      expect(chamada).not.toContain('senha:')
    }
    const status = actionsExportadas().find((a) => a.nome === 'definirStatusSenha')!.corpo.replace(/\s+/g, '')
    expect(status).toMatch(/p_empresa:empresa,/)
    expect(status).toMatch(/registrarEventoAdmin\(\{acao:[^}]*empresa,/)
  })
})
