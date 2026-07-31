import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CAP_BACKUP_INLINE,
  MAX_ATIVOS_POR_OPERACAO,
  MIN_JUSTIFICATIVA_CONFLITO,
  PREFIXO_BACKUP_CONFLITO,
  confirmacaoConflitoConfere,
  exigeBackupEmArquivo,
  textoConfirmacaoConflito,
  validarExclusaoDeConflito,
} from './conflitos'

const IDS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']

describe('a confirmação carrega o TAMANHO — de propósito', () => {
  it('o texto esperado inclui a quantidade', () => {
    expect(textoConfirmacaoConflito(1)).toBe('APAGAR 1')
    expect(textoConfirmacaoConflito(12)).toBe('APAGAR 12')
  })

  it('confirmar com o número ERRADO não passa', () => {
    // É a razão de o número estar no texto: quem selecionou 12 sem perceber esbarra no
    // número antes de destruir.
    expect(confirmacaoConflitoConfere('APAGAR 1', 2)).toBe(false)
    expect(confirmacaoConflitoConfere('APAGAR 2', 2)).toBe(true)
  })

  it('ignora caixa e espaço nas pontas, mas não é "parecido"', () => {
    expect(confirmacaoConflitoConfere('  apagar 2  ', 2)).toBe(true)
    expect(confirmacaoConflitoConfere('APAGAR', 2)).toBe(false)
    expect(confirmacaoConflitoConfere('APAGAR 2 CADASTROS', 2)).toBe(false)
    expect(confirmacaoConflitoConfere('', 2)).toBe(false)
  })
})

describe('validarExclusaoDeConflito — a régua que a tela e a action compartilham', () => {
  const ok = {
    ativoIds: IDS,
    confirmacao: 'APAGAR 2',
    justificativa: 'o cadastro de Linhares e o errado',
  }

  it('aceita o caso completo', () => {
    expect(validarExclusaoDeConflito(ok)).toBeNull()
  })

  it('recusa seleção vazia', () => {
    expect(validarExclusaoDeConflito({ ...ok, ativoIds: [] })).toContain('ao menos um')
  })

  it('recusa justificativa curta, dizendo o mínimo', () => {
    const erro = validarExclusaoDeConflito({ ...ok, justificativa: 'errado' })
    expect(erro).toContain(String(MIN_JUSTIFICATIVA_CONFLITO))
  })

  it('recusa confirmação que não confere, mostrando o texto exato', () => {
    const erro = validarExclusaoDeConflito({ ...ok, confirmacao: 'APAGAR' })
    expect(erro).toContain('APAGAR 2')
  })

  it('DEDUPLICA antes de contar — id repetido não infla a confirmação', () => {
    // Espelha o `array_agg(distinct …)` da RPC: "APAGAR 3" com o mesmo id três vezes
    // apagaria UM ativo achando que apagou três.
    const erro = validarExclusaoDeConflito({
      ativoIds: [IDS[0]!, IDS[0]!, IDS[0]!],
      confirmacao: 'APAGAR 3',
      justificativa: 'tentando inflar a contagem com id repetido',
    })
    expect(erro).toContain('APAGAR 1')
    // e a confirmação correta para o conjunto deduplicado passa
    expect(
      validarExclusaoDeConflito({
        ativoIds: [IDS[0]!, IDS[0]!, IDS[0]!],
        confirmacao: 'APAGAR 1',
        justificativa: 'tentando inflar a contagem com id repetido',
      }),
    ).toBeNull()
  })

  it('recusa lote acima do teto', () => {
    const muitos = Array.from({ length: MAX_ATIVOS_POR_OPERACAO + 1 }, (_, i) =>
      `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`,
    )
    expect(
      validarExclusaoDeConflito({
        ativoIds: muitos,
        confirmacao: textoConfirmacaoConflito(muitos.length),
        justificativa: 'lote grande demais para uma operacao so',
      }),
    ).toContain('grande demais')
  })
})

describe('cap do backup', () => {
  it('até o cap vai em jsonb no evento; acima dele exige arquivo', () => {
    expect(exigeBackupEmArquivo(CAP_BACKUP_INLINE)).toBe(false)
    expect(exigeBackupEmArquivo(CAP_BACKUP_INLINE + 1)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// SINCRONIAS COM O SQL — as que quebram em silêncio
// ---------------------------------------------------------------------------
// Mesma doutrina de `dev-destrutivo.test.ts`: cada constante daqui está DUPLICADA dentro da
// migration 0093. Se um lado mudar sozinho, a tela e o banco passam a discordar sobre o que
// confirma, o que é justificativa suficiente e quando o backup precisa virar arquivo — e o
// sintoma seria "a confirmação nunca confere", sem ninguém saber por quê.
// ⚠ A migration é procurada, NUNCA fixada pelo número. Fixar "0093" foi o defeito da
// primeira versão deste bloco: a RPC já tinha sido recriada por inteiro na 0098 (e depois
// na 0100), então o teste passou a inspecionar um arquivo que não é mais a definição viva
// do banco. Alguém mexeria em `c_cap_inline` na migration nova, esqueceria do TypeScript, e
// a asserção continuaria VERDE lendo a 0093 — que ainda casa com o TS. O sintoma em
// produção seria a tela deixar de subir arquivo de backup para lotes que a RPC exige (ou o
// contrário), e ninguém saberia por quê. Mesmo padrão de `dev-destrutivo.test.ts`.
function sqlMaisRecenteCom(trecho: string): string {
  const dir = join(process.cwd(), 'supabase', 'migrations')
  const arquivo = readdirSync(dir)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .reverse()
    .find((n) => readFileSync(join(dir, n), 'utf8').includes(trecho))
  if (!arquivo) throw new Error(`Nenhuma migration define "${trecho}"`)
  return readFileSync(join(dir, arquivo), 'utf8')
}

describe('constantes duplicadas na migration VIVA da RPC', () => {
  const sql = sqlMaisRecenteCom(
    'create or replace function public.apagar_ativos_conflito_filiais',
  )

  it('MIN_JUSTIFICATIVA_CONFLITO bate com a guarda da RPC', () => {
    expect(sql).toContain(`length(btrim(p_justificativa)), 0) < ${MIN_JUSTIFICATIVA_CONFLITO}`)
  })

  it('CAP_BACKUP_INLINE bate com c_cap_inline', () => {
    expect(sql).toContain(`c_cap_inline  constant int := ${CAP_BACKUP_INLINE}`)
  })

  it('MAX_ATIVOS_POR_OPERACAO bate com c_max_lote', () => {
    expect(sql).toContain(`c_max_lote    constant int := ${MAX_ATIVOS_POR_OPERACAO}`)
  })

  it('o texto da confirmação é montado igual nos dois lados', () => {
    // TS: `APAGAR ${n}` · SQL: 'APAGAR ' || v_n::text
    expect(sql).toContain("v_esperado := 'APAGAR ' || v_n::text")
    expect(textoConfirmacaoConflito(7)).toBe('APAGAR 7')
  })

  it('o prefixo do backup bate com prefixo_backup_conflito()', () => {
    // Esta função vive na sua própria migration (hoje a 0093), que não é a mesma da RPC —
    // por isso a busca é separada, e também por marcador, nunca por número.
    expect(
      sqlMaisRecenteCom('create or replace function public.prefixo_backup_conflito'),
    ).toContain(`select '${PREFIXO_BACKUP_CONFLITO}'`)
  })
})
