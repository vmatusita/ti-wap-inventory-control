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
