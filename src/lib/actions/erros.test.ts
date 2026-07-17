import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { traduzErroBanco } from './erros'

// F7F (OS §2) — revisão adversarial do "erro genérico" do Substituir tudo. A
// `traduzErroBanco` é função pura testável, MAS com dois efeitos colaterais que os
// testes precisam domar: (1) chama `console.error` no fallback; (2) lê
// `process.env.NODE_ENV` para decidir se devolve a mensagem crua (dev) ou a
// genérica (prod). Silenciamos o console e restauramos o NODE_ENV a cada teste.
//
// Dados 100% fictícios — nenhuma mensagem aqui vem de um erro real de produção.

let spyErro: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  spyErro = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  spyErro.mockRestore()
  // `vi.stubEnv` (usado nos testes do fallback) é restaurado aqui — NODE_ENV é
  // read-only no tipo, então não se atribui direto: stub + unstub.
  vi.unstubAllEnvs()
})

describe('timeout de statement (SQLSTATE 57014)', () => {
  it('mapeia por CODE mesmo com mensagem irreconhecível', () => {
    expect(traduzErroBanco('mensagem qualquer que não casa nada', '57014')).toBe(
      'A importação demorou demais e foi cancelada — tente novamente ou avise o TI.',
    )
  })

  it('mapeia por SUBSTRING (canceling statement due to statement timeout) sem code', () => {
    expect(
      traduzErroBanco('ERROR: canceling statement due to statement timeout'),
    ).toBe('A importação demorou demais e foi cancelada — tente novamente ou avise o TI.')
  })

  it('não vaza a mensagem crua do Postgres e não cai no fallback (sem console.error)', () => {
    traduzErroBanco('canceling statement due to statement timeout', '57014')
    expect(spyErro).not.toHaveBeenCalled()
  })
})

describe('índice parcial do import (23505 — service tag sem patrimônio)', () => {
  it('mapeia pela constraint específica (ativos_service_tag_sem_patrimonio_uidx)', () => {
    const msg =
      'duplicate key value violates unique constraint "ativos_service_tag_sem_patrimonio_uidx"'
    expect(traduzErroBanco(msg, '23505')).toContain('dois ativos sem patrimônio com a mesma service tag')
  })

  it('não colide com o índice composto de patrimônio', () => {
    const msg =
      'duplicate key value violates unique constraint "ativos_patrimonio_service_tag_uidx"'
    expect(traduzErroBanco(msg, '23505')).toBe('Já existe um ativo com esse patrimônio e service tag.')
  })
})

describe('raises P0001 da RPC importar_ativos_substituir', () => {
  // As substrings são as EXATAS que a RPC (migration 0034) levanta — se a RPC mudar
  // o texto, estes testes quebram e obrigam a reconciliar o mapa. Confirmadas em DEV.
  const casos: [string, string][] = [
    [
      'O estado da filial mudou desde o preview/backup (ativos 16/0, movs 23/0, anotações 0/0, termos 0/0). Gere o preview novamente antes de aplicar.',
      'O estado da filial mudou desde o preview. Gere o preview novamente antes de aplicar.',
    ],
    [
      'Plano de import vazio: ao menos 1 ativo é obrigatório.',
      'O plano de import está vazio. Gere o preview novamente.',
    ],
    [
      'Há termo(s) gerado(s) que misturam esta filial com outra — substituição bloqueada. Resolva os termos antes.',
      'Há termo(s) que misturam esta filial com outra. Resolva os termos antes de substituir.',
    ],
    [
      'Patrimônio inválido no plano: "12345" (esperado ^[A-Z]{2,4}\\d{7}$ ou nulo).',
      'Há um patrimônio fora do padrão no plano. Gere o preview novamente.',
    ],
    [
      'Categoria inválida "impressora" no ativo WAP0001234 (fora do enum categoria_ativo).',
      'Há um valor inválido no plano (categoria ou estado do ativo). Gere o preview novamente.',
    ],
    [
      'Estado-alvo inválido "sumido" no ativo (sem patrimônio) (fora do enum status_ativo).',
      'Há um valor inválido no plano (categoria ou estado do ativo). Gere o preview novamente.',
    ],
    [
      'Plano tem par (patrimônio, service tag) duplicado — cada ativo com patrimônio deve ser único.',
      'O plano tem ativos com identidade repetida (patrimônio + service tag). Corrija o CSV e gere o preview novamente.',
    ],
    [
      'Plano tem service tag repetida entre ativos sem patrimônio — a tag é a identidade quando não há patrimônio.',
      'O plano tem ativos com identidade repetida (patrimônio + service tag). Corrija o CSV e gere o preview novamente.',
    ],
    [
      'Divergência: 15 ativos criados para 16 no plano.',
      'A conferência do import não bateu e nada foi alterado — gere o preview novamente. Se persistir, avise o TI.',
    ],
    [
      'Divergência (agregada) nas linhas sem patrimônio e sem service tag: a contagem por estado × colaborador não bate entre plano e banco.',
      'A conferência do import não bateu e nada foi alterado — gere o preview novamente. Se persistir, avise o TI.',
    ],
  ]

  it.each(casos)('mapeia o raise para texto limpo e estável: %s', (raw, esperado) => {
    // A RPC não devolve SQLSTATE customizado para P0001 além do próprio 'P0001';
    // o mapa reconhece pela substring da mensagem (que é NOSSA, pt-BR).
    expect(traduzErroBanco(raw, 'P0001')).toBe(esperado)
  })

  it('nenhum P0001 conhecido cai no fallback (não loga)', () => {
    for (const [raw] of casos) traduzErroBanco(raw, 'P0001')
    expect(spyErro).not.toHaveBeenCalled()
  })
})

describe('fallback — código desconhecido nunca vaza o texto cru do Postgres em produção', () => {
  const CRU = 'ERROR: something raw and internal from postgres 42P01 relation does not exist'

  it('em produção devolve a mensagem GENÉRICA (nunca o texto cru) e LOGA', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const out = traduzErroBanco(CRU, 'XX999')
    expect(out).toBe('Não foi possível concluir a operação. Tente novamente.')
    expect(out).not.toContain('postgres')
    expect(out).not.toContain('42P01')
    expect(spyErro).toHaveBeenCalledWith(
      '[traduzErroBanco] erro não mapeado',
      { code: 'XX999', mensagem: CRU },
    )
  })

  it('fora de produção devolve a mensagem crua (debug) — e ainda LOGA o par {code, mensagem}', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const out = traduzErroBanco(CRU, 'XX999')
    expect(out).toBe(CRU)
    expect(spyErro).toHaveBeenCalledOnce()
  })

  it('mensagem null/undefined não quebra e loga com mensagem null', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(traduzErroBanco(null, null)).toBe('Não foi possível concluir a operação. Tente novamente.')
    expect(spyErro).toHaveBeenCalledWith(
      '[traduzErroBanco] erro não mapeado',
      { code: null, mensagem: null },
    )
  })
})

describe('retrocompat — chamada com 1 argumento (sem code) segue funcionando', () => {
  it('mapeia por substring sem passar o SQLSTATE', () => {
    expect(traduzErroBanco('violates foreign key constraint')).toBe(
      'Um dos valores informados (motivo ou filial) não existe mais.',
    )
    expect(traduzErroBanco('new row violates row-level security policy')).toBe(
      'Sem permissão para esta operação. Faça login novamente.',
    )
  })
})
