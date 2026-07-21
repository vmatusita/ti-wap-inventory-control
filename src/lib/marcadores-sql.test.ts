import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { OBS_IMPORT_STARTUP, OBS_CARGA_GOLIVE } from '@/lib/dominio'

// GUARDA DE SINCRONIA TS↔SQL (dívida técnica — item H, 21/07/2026).
//
// O relatório por filial EXCLUI as compras de ABERTURA (carga F4 + import de startup
// F7) das Entradas do período, filtrando pela `observacao` em
// `src/lib/queries/relatorios/movimentacoes.ts`:
//   · carga F4     → `.neq(OBS_CARGA_GOLIVE)`            (igualdade exata)
//   · import F7    → `.not.like("${OBS_IMPORT_STARTUP}*")` (prefixo)
//
// O marcador do import é HARD-CODED em cada migration da RPC (`'import startup ' ||
// to_char(current_date, ...)`) — não há como importar a constante TS no SQL (ver o
// comentário da 0032). Se o literal SQL e a constante TS divergirem, ~1.576 linhas de
// abertura reapareceriam silenciosamente nas Entradas de produção, SEM erro de build.
// Este teste quebra se alguém renomear um lado sem o outro.

const DIR_MIGRACOES = join(process.cwd(), 'supabase', 'migrations')
const DIR_SCRIPTS_IMPORT = join(process.cwd(), 'scripts', 'import')

describe('sincronia do marcador de import de startup (TS ↔ SQL das migrations)', () => {
  const migracoesComMarcador = readdirSync(DIR_MIGRACOES)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => readFileSync(join(DIR_MIGRACOES, f), 'utf8').includes('v_obs_marcador'))

  it('existem migrations que montam o marcador (guarda do próprio teste)', () => {
    expect(migracoesComMarcador.length).toBeGreaterThan(0)
  })

  it.each(migracoesComMarcador)('%s monta o marcador com o prefixo exato de OBS_IMPORT_STARTUP', (arquivo) => {
    const sql = readFileSync(join(DIR_MIGRACOES, arquivo), 'utf8')
    // v_obs_marcador text := 'import startup ' || to_char(current_date, 'DD/MM/YYYY');
    expect(sql).toContain(`'${OBS_IMPORT_STARTUP} ' || to_char`)
  })
})

describe('sincronia do marcador da carga go-live (TS ↔ script F4)', () => {
  // O script da carga F4 (`scripts/import/plano.ts`) IMPORTA `OBS_CARGA_GOLIVE` de
  // `dominio.ts` — fonte única, não pode divergir. Este teste garante que ele siga
  // importando a constante (e não volte a hard-codar o literal), fechando o contrato.
  it('o script da carga F4 referencia a constante OBS_CARGA_GOLIVE (não o literal solto)', () => {
    const script = readFileSync(join(DIR_SCRIPTS_IMPORT, 'plano.ts'), 'utf8')
    expect(script).toContain('OBS_CARGA_GOLIVE')
    // sanidade: a constante ainda vale o que o filtro do relatório espera
    expect(OBS_CARGA_GOLIVE).toBe('carga go-live')
  })
})
