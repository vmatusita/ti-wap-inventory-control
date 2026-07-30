import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// TRIPWIRES de `src/lib/actions/admin.ts` (F21). Não testam comportamento — leem a FONTE e
// travam propriedades estruturais que nenhum outro teste pegaria (não há banco no Vitest; a
// prova de runtime é supabase/tests/papeis_rls.sql): action nova neste arquivo sem
// `exigirAdmin`, volta da guarda que só olhava sessão, e cargo vindo de metadata.
//
// Mesmo idioma dos guardas de fonte que já existem no repositório
// (src/lib/use-server-exports.test.ts, src/lib/queries/relatorios/fronteira-viewer.test.ts).

const FONTE = readFileSync(
  fileURLToPath(new URL('./admin.ts', import.meta.url)),
  'utf8',
)

// CÓDIGO sem comentários. Necessário porque os próprios comentários do arquivo CITAM o que
// estes tripwires proíbem ("antes era `exigirOperador()`", "o cargo nunca vem de
// `raw_user_meta_data`") — sem esta limpeza o teste ficaria vermelho pela documentação, e a
// saída "corrija" seria apagar a explicação. Limitação aceita: não distingue `//` dentro de
// string literal (não existe nenhuma neste módulo).
const CODIGO = FONTE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')

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

describe('actions de /admin — toda escrita administrativa exige ADMIN', () => {
  it('o módulo tem actions exportadas (a varredura não está passando a seco)', () => {
    expect(actionsExportadas().length).toBeGreaterThanOrEqual(7)
  })

  it('nenhuma action deste arquivo grava sem chamar exigirAdmin', () => {
    // Antes da F21 a guarda local era `exigirOperador()`, que só perguntava "existe
    // sessão?" — qualquer logado convidava usuário, criava filial e mexia nos motivos.
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
    // `profiles.papel` e só o service role o grava.
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
