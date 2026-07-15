import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Fronteira do VISUALIZADOR por senha (A5 · Sprint 4).
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
const DIR = dirname(fileURLToPath(import.meta.url))

// Superfície alcançada pelo client do viewer: os módulos desta pasta
// (queries/relatorios/*) + o histórico de gerados (queries/gerados.ts).
function arquivosDaSuperficie(): string[] {
  const modulos = readdirSync(DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join(DIR, f))
  return [...modulos, join(DIR, '..', 'gerados.ts')]
}

// O que o viewer JAMAIS pode ler:
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
