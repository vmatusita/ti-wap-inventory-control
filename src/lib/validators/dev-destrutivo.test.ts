import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FRASE_RESET_GLOBAL,
  MIN_JUSTIFICATIVA,
  apagarItemSchema,
  confirmacaoConfere,
  forcarSaldoSchema,
  resetarSchema,
  rotuloAlcanceReset,
  rotuloDoAtivo,
  validarOperacaoDestrutiva,
} from '@/lib/validators/dev-destrutivo'
import { ACOES_ADMIN, ACAO_ROTULO, ACOES_DESTRUTIVAS, eAcaoDestrutiva } from '@/lib/auditoria'

// Testes das funções PURAS da Zona destrutiva (F23).
//
// O que se testa aqui é o que o roteiro SQL NÃO alcança: a régua da confirmação digitada, o
// rótulo do alvo e as duas SINCRONIAS que, se quebrarem, quebram em silêncio — a do
// vocabulário de auditoria (TS × comment da coluna) e a das constantes que o TypeScript
// duplica do SQL.

describe('confirmacaoConfere', () => {
  it('aceita igualdade exata', () => {
    expect(confirmacaoConfere('WAP0001234', 'WAP0001234')).toBe(true)
  })

  it('ignora espaço nas pontas e diferença de caixa', () => {
    expect(confirmacaoConfere('  wap0001234 ', 'WAP0001234')).toBe(true)
    expect(confirmacaoConfere('Mouse Sem Fio', 'mouse sem fio')).toBe(true)
  })

  it('RECUSA prefixo, sufixo e "quase"', () => {
    // O campo existe para obrigar a LER o identificador do que vai ser destruído. Aceitar
    // prefixo transformaria a confirmação em formalidade.
    expect(confirmacaoConfere('WAP000123', 'WAP0001234')).toBe(false)
    expect(confirmacaoConfere('WAP00012345', 'WAP0001234')).toBe(false)
    expect(confirmacaoConfere('WAP 0001234', 'WAP0001234')).toBe(false)
  })

  it('RECUSA vazio, mesmo quando o esperado é vazio', () => {
    // Sem isto, um alvo cujo identificador viesse vazio (bug de leitura) seria confirmável
    // deixando o campo em branco — a pior forma de apagar sem querer.
    expect(confirmacaoConfere('', '')).toBe(false)
    expect(confirmacaoConfere('   ', '')).toBe(false)
  })
})

describe('rotuloDoAtivo', () => {
  const id = '00000000-f23a-4000-8000-000000000001'

  it('prefere o patrimônio', () => {
    expect(rotuloDoAtivo({ id, patrimonio: 'WAP0001234', service_tag: 'ABC123' })).toBe('WAP0001234')
  })

  it('cai para a service tag quando não há patrimônio', () => {
    // Caso REAL: o import aceita linha sem patrimônio (nasce com pendência).
    expect(rotuloDoAtivo({ id, patrimonio: null, service_tag: 'ABC123' })).toBe('ABC123')
    expect(rotuloDoAtivo({ id, patrimonio: '   ', service_tag: 'ABC123' })).toBe('ABC123')
  })

  it('cai para o id quando não há nem patrimônio nem tag', () => {
    expect(rotuloDoAtivo({ id, patrimonio: null, service_tag: null })).toBe(id)
  })
})

describe('rotuloAlcanceReset', () => {
  it('devolve o nome da filial, ou a frase fixa no alcance global', () => {
    expect(rotuloAlcanceReset('Matriz')).toBe('Matriz')
    expect(rotuloAlcanceReset(null)).toBe(FRASE_RESET_GLOBAL)
  })
})

describe('validarOperacaoDestrutiva', () => {
  const base = { esperado: 'WAP0001234', alvo: 'este ativo' }

  it('recusa justificativa curta ANTES de olhar a confirmação', () => {
    const erro = validarOperacaoDestrutiva({ ...base, confirmacao: 'WAP0001234', justificativa: 'curta' })
    expect(erro).toContain('justificativa')
  })

  it('recusa confirmação errada mesmo com justificativa boa', () => {
    const erro = validarOperacaoDestrutiva({
      ...base,
      confirmacao: 'WAP0009999',
      justificativa: 'cadastro duplicado criado por engano no go-live',
    })
    expect(erro).toContain('WAP0001234')
  })

  it('devolve null quando as duas travas passam', () => {
    expect(
      validarOperacaoDestrutiva({
        ...base,
        confirmacao: 'wap0001234',
        justificativa: 'cadastro duplicado criado por engano no go-live',
      }),
    ).toBeNull()
  })
})

describe('schemas', () => {
  it('resetarSchema aceita filialId null (alcance GLOBAL) e recusa bloco desconhecido', () => {
    const ok = resetarSchema.safeParse({
      bloco: 'acervo',
      filialId: null,
      confirmacao: FRASE_RESET_GLOBAL,
      justificativa: 'preparando a filial para o import de startup',
    })
    expect(ok.success).toBe(true)

    const mau = resetarSchema.safeParse({
      bloco: 'cadastros',
      filialId: null,
      confirmacao: 'x',
      justificativa: 'preparando a filial para o import de startup',
    })
    expect(mau.success).toBe(false)
  })

  it('forcarSaldoSchema recusa alvo negativo e aceita zero', () => {
    const j = 'contagem física divergiu do sistema'
    expect(forcarSaldoSchema.safeParse({ itemId: 1, filialId: 1, saldoAlvo: -1, justificativa: j }).success).toBe(false)
    expect(forcarSaldoSchema.safeParse({ itemId: 1, filialId: 1, saldoAlvo: 0, justificativa: j }).success).toBe(true)
  })

  it('todo schema destrutivo exige justificativa mínima', () => {
    const r = apagarItemSchema.safeParse({ itemId: 1, confirmacao: 'x', justificativa: 'a'.repeat(MIN_JUSTIFICATIVA - 1) })
    expect(r.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SINCRONIAS — as que quebram em silêncio
// ---------------------------------------------------------------------------

describe('vocabulário da auditoria', () => {
  it('toda ação tem rótulo, e as sete destrutivas estão no vocabulário', () => {
    for (const acao of ACOES_ADMIN) expect(ACAO_ROTULO[acao]).toBeTruthy()
    for (const acao of ACOES_DESTRUTIVAS) {
      expect(ACOES_ADMIN).toContain(acao)
      expect(eAcaoDestrutiva(acao)).toBe(true)
    }
    expect(eAcaoDestrutiva('convite_gerado')).toBe(false)
  })

  it('o comment da coluna eventos_admin.acao lista os MESMOS verbos que o TypeScript', () => {
    // ⚠ Esta é a regra "mexeu aqui, mexa lá" da migration 0065, virada teste. `acao` é TEXT no
    // banco de propósito (ação nova não deve exigir migration), então o vocabulário fechado
    // mora no TypeScript — e o comment da coluna é a única cópia dele que um DBA lê. Sem este
    // teste, as duas divergem e ninguém percebe até alguém procurar um verbo que não existe.
    const dir = join(process.cwd(), 'supabase', 'migrations')
    const arquivo = readdirSync(dir)
      .filter((n) => n.endsWith('.sql'))
      .sort()
      .reverse()
      .find((n) => readFileSync(join(dir, n), 'utf8').includes('comment on column public.eventos_admin.acao'))
    expect(arquivo, 'nenhuma migration define o comment de eventos_admin.acao').toBeTruthy()

    const sql = readFileSync(join(dir, arquivo as string), 'utf8')
    const comment = sql.slice(sql.indexOf('comment on column public.eventos_admin.acao'))
    for (const acao of ACOES_ADMIN) {
      expect(comment, `verbo ausente no comment da coluna: ${acao}`).toContain(acao)
    }
  })
})

describe('constantes duplicadas do SQL', () => {
  it('MIN_JUSTIFICATIVA bate com a guarda exigir_dev_para_destruir (0082)', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '0082_dev_apagar.sql'),
      'utf8',
    )
    // A guarda no SQL é `< 10`; se alguém afrouxar de um lado, este teste cai.
    expect(sql).toContain(`length(btrim(p_justificativa)), 0) < ${MIN_JUSTIFICATIVA}`)
  })

  it('FRASE_RESET_GLOBAL bate com rotulo_alcance_reset (0083)', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '0083_dev_resetar.sql'),
      'utf8',
    )
    expect(sql).toContain(`'${FRASE_RESET_GLOBAL}'`)
  })
})
