import { describe, expect, it } from 'vitest'
import {
  arquivosPendentes,
  avaliarDerivaMigrations,
  BASE_DO_CONTRATO,
  compararVersoes,
  dataDeEntradaDaRespostaDaApi,
  dataDeEntradaDoGitLog,
  nomeCanonicoDoLedger,
  partesDoArquivo,
} from './deriva-migrations.mjs'

// A DERIVA REPOSITÓRIO × PRODUÇÃO, PROVADA (reauditoria 18/09/2026, item AE · passo 2).
//
// O contrato com base fixa (ver o cabeçalho de deriva-migrations.mjs): da 0146 em diante, todo
// arquivo tem de estar no ledger pelo nome (P), e toda linha aplicada depois da base tem de ter
// arquivo (D). Os casos abaixo incluem os que DERRUBARAM o desenho anterior ("linha d'água") na
// revisão adversarial: o apply fora de ordem e a linha órfã antiga do ensaio (`0126b_…`), além dos
// dois formatos reais de `name` ('profiles' em produção × '0001_profiles' no ensaio).

const AGORA = '2026-09-18T18:00:00.000Z'
const UMA_HORA_ATRAS = '2026-09-18T17:00:00.000Z'
const TRES_DIAS_ATRAS = '2026-09-15T18:00:00.000Z'

const REPO = [
  '0001_profiles.sql',
  '0126_lancamento_regulariza.sql',
  '0145_drop_rel_filial.sql',
  '0146_estorno_com_pendencia_resolvida.sql',
  '0147_drop_itens_nome_uidx.sql',
  '0148_ledger_de_migracoes.sql',
  '0149_escrita_atomica_ativos_anotacao.sql',
]

// O ledger de produção de hoje, no que importa: histórico sem prefixo, a base (0146) aplicada pelo
// conector com timestamp de 14 dígitos, e linhas antigas no formato '0001'.
const LEDGER_ATE_A_BASE = [
  { versao: '20260918132537', nome: 'estorno_com_pendencia_resolvida' },
  { versao: '20260917085937', nome: 'drop_rel_filial' },
  { versao: '0001', nome: 'profiles' },
]

const aplicada = (versao: string, nome: string) => ({ versao, nome })

describe('partesDoArquivo', () => {
  it('reconhece o formato NNNN_nome.sql', () => {
    expect(partesDoArquivo('0148_ledger_de_migracoes.sql')).toEqual({
      numero: 148,
      nome: 'ledger_de_migracoes',
      arquivo: '0148_ledger_de_migracoes.sql',
    })
  })

  it('devolve null para o que não segue a convenção', () => {
    expect(partesDoArquivo('_asserts.sql')).toBeNull()
    expect(partesDoArquivo('README.md')).toBeNull()
    expect(partesDoArquivo('leia-me.sql')).toBeNull()
  })
})

describe('nomeCanonicoDoLedger — a normalização entre os DOIS formatos reais', () => {
  it('tira o prefixo (formato do ensaio) e mantém o que já não tem (formato de produção)', () => {
    expect(nomeCanonicoDoLedger('0001_profiles')).toBe('profiles')
    expect(nomeCanonicoDoLedger('profiles')).toBe('profiles')
    expect(nomeCanonicoDoLedger('0126b_lancamento_regulariza_contadores')).toBe('lancamento_regulariza_contadores')
  })

  it('nunca lança em entrada estranha', () => {
    expect(nomeCanonicoDoLedger(null)).toBe('')
    expect(nomeCanonicoDoLedger(undefined)).toBe('')
    expect(nomeCanonicoDoLedger(42 as unknown as string)).toBe('')
  })
})

describe('compararVersoes — os dois formatos de versão que convivem no ledger de produção', () => {
  it('numérica: "0001" é anterior a qualquer timestamp de 14 dígitos (texto erraria: "0001" < "2026" por acaso, mas "9" > "2026…")', () => {
    expect(compararVersoes('0001', '20260918132537')).toBeLessThan(0)
    expect(compararVersoes('9', '20260918132537')).toBeLessThan(0)
    expect(compararVersoes('20260918132537', '20260917085937')).toBeGreaterThan(0)
    expect(compararVersoes('20260901000131', '20260901000131')).toBe(0)
  })
})

describe('avaliarDerivaMigrations — o contrato (P) e (D)', () => {
  it('EM DIA: todo arquivo ≥ base está no ledger — verde, sem aviso', () => {
    const r = avaliarDerivaMigrations({
      arquivosRepo: REPO,
      ledger: [
        aplicada('20260918200300', 'escrita_atomica_ativos_anotacao'),
        aplicada('20260918200200', 'ledger_de_migracoes'),
        aplicada('20260918200100', 'drop_itens_nome_uidx'),
        ...LEDGER_ATE_A_BASE,
      ],
      agora: AGORA,
    })
    expect(r.ok).toBe(true)
    expect(r.achados).toEqual([])
    expect(r.avisos).toEqual([])
    expect(r.pendentes).toEqual([])
    expect(r.ultimaNoLedger?.arquivo).toBe('0149_escrita_atomica_ativos_anotacao.sql')
  })

  it('(P) PENDENTE DENTRO DA TOLERÂNCIA: aviso, não alarme', () => {
    const r = avaliarDerivaMigrations({
      arquivosRepo: REPO,
      ledger: LEDGER_ATE_A_BASE,
      agora: AGORA,
      dataDeEntrada: {
        '0147_drop_itens_nome_uidx.sql': UMA_HORA_ATRAS,
        '0148_ledger_de_migracoes.sql': UMA_HORA_ATRAS,
        '0149_escrita_atomica_ativos_anotacao.sql': UMA_HORA_ATRAS,
      },
    })
    expect(r.ok).toBe(true)
    expect(r.pendentes).toEqual([
      '0147_drop_itens_nome_uidx.sql',
      '0148_ledger_de_migracoes.sql',
      '0149_escrita_atomica_ativos_anotacao.sql',
    ])
    expect(r.avisos.every((a) => a.motivo.includes('dentro da tolerância'))).toBe(true)
  })

  it('(P) PENDENTE FORA DA TOLERÂNCIA: alarme', () => {
    const r = avaliarDerivaMigrations({
      arquivosRepo: REPO,
      ledger: [aplicada('20260918200100', 'drop_itens_nome_uidx'), ...LEDGER_ATE_A_BASE],
      agora: AGORA,
      dataDeEntrada: {
        '0148_ledger_de_migracoes.sql': TRES_DIAS_ATRAS,
        '0149_escrita_atomica_ativos_anotacao.sql': UMA_HORA_ATRAS,
      },
    })
    expect(r.ok).toBe(false)
    expect(r.achados).toHaveLength(1)
    expect(r.achados[0]).toMatchObject({
      chave: 'deriva_migrations:pendente:0148_ledger_de_migracoes.sql',
      total: 1,
      base: 0,
    })
    expect(r.achados[0].motivo).toContain('há 72h')
  })

  it('(P) a impressão do achado NÃO muda com o passar das horas (a issue de alarme não ganha comentário diário à toa)', () => {
    const entrada = {
      arquivosRepo: REPO,
      ledger: LEDGER_ATE_A_BASE,
      dataDeEntrada: Object.fromEntries(REPO.map((a) => [a, TRES_DIAS_ATRAS])),
    }
    const hoje = avaliarDerivaMigrations({ ...entrada, agora: AGORA })
    const amanha = avaliarDerivaMigrations({ ...entrada, agora: '2026-09-19T18:00:00.000Z' })
    const impressao = (r: typeof hoje) => r.achados.map((a) => `${a.chave}=${a.total}/${a.base}`).join(';')
    expect(impressao(amanha)).toBe(impressao(hoje))
  })

  it('(P) APPLY FORA DE ORDEM — o ponto cego da "linha d\'água": a 0149 aplicada antes da 0148 não esconde a 0148', () => {
    const r = avaliarDerivaMigrations({
      arquivosRepo: REPO,
      ledger: [
        aplicada('20260918200300', 'escrita_atomica_ativos_anotacao'), // a 0149, aplicada
        aplicada('20260918200100', 'drop_itens_nome_uidx'),
        ...LEDGER_ATE_A_BASE,
      ],
      agora: AGORA,
      dataDeEntrada: { '0148_ledger_de_migracoes.sql': TRES_DIAS_ATRAS },
    })
    expect(r.pendentes).toEqual(['0148_ledger_de_migracoes.sql'])
    expect(r.ok).toBe(false)
    expect(r.achados.map((a) => a.chave)).toEqual(['deriva_migrations:pendente:0148_ledger_de_migracoes.sql'])
  })

  it('(P) PENDENTE SEM DATA: aviso — a sonda não acusa deriva que não sabe medir', () => {
    const r = avaliarDerivaMigrations({ arquivosRepo: REPO, ledger: LEDGER_ATE_A_BASE, agora: AGORA })
    expect(r.ok).toBe(true)
    expect(r.avisos.filter((a) => a.chave.startsWith('deriva_migrations:pendente:'))).toHaveLength(3)
    expect(r.avisos[0].motivo).toContain('sem data')
  })

  it('HISTÓRICO ANTERIOR À BASE fica fora: arquivo < 0146 ausente do ledger não é pendente', () => {
    const r = avaliarDerivaMigrations({
      arquivosRepo: REPO,
      // '0126_lancamento_regulariza' e '0145_drop_rel_filial' NÃO estão no ledger aqui
      ledger: [
        aplicada('20260918200300', 'escrita_atomica_ativos_anotacao'),
        aplicada('20260918200200', 'ledger_de_migracoes'),
        aplicada('20260918200100', 'drop_itens_nome_uidx'),
        aplicada('20260918132537', 'estorno_com_pendencia_resolvida'),
      ],
      agora: AGORA,
    })
    expect(r.ok).toBe(true)
    expect(r.pendentes).toEqual([])
  })

  it('(D) aplicado DEPOIS da base e desconhecido do repositório: alarme', () => {
    const r = avaliarDerivaMigrations({
      arquivosRepo: REPO,
      ledger: [
        aplicada('20260918210000', 'hotfix_aplicado_por_fora'),
        aplicada('20260918200300', 'escrita_atomica_ativos_anotacao'),
        aplicada('20260918200200', 'ledger_de_migracoes'),
        aplicada('20260918200100', 'drop_itens_nome_uidx'),
        ...LEDGER_ATE_A_BASE,
      ],
      agora: AGORA,
    })
    expect(r.ok).toBe(false)
    expect(r.achados.map((a) => a.chave)).toEqual(['deriva_migrations:desconhecido:hotfix_aplicado_por_fora'])
    expect(r.achados[0].motivo).toContain('aplicado fora do repositório')
  })

  it('(D) a linha órfã ANTIGA do ensaio (0126b, anterior à base) NÃO alarma — o falso alarme da revisão', () => {
    const r = avaliarDerivaMigrations({
      arquivosRepo: REPO,
      ledger: [
        aplicada('20260918200300', '0149_escrita_atomica_ativos_anotacao'),
        aplicada('20260918200200', '0148_ledger_de_migracoes'),
        aplicada('20260918200100', '0147_drop_itens_nome_uidx'),
        aplicada('20260918132329', 'estorno_com_pendencia_resolvida'),
        aplicada('20260831142808', '0126b_lancamento_regulariza_contadores'), // órfã, mais antiga que a base
        aplicada('0001', '0001_profiles'),
      ],
      agora: AGORA,
    })
    expect(r.ok).toBe(true)
    expect(r.achados).toEqual([])
  })

  it('(D) uma migration CONHECIDA reaplicada depois da base não alarma (o repositório a reconhece)', () => {
    const r = avaliarDerivaMigrations({
      arquivosRepo: REPO,
      ledger: [aplicada('20260918220000', 'drop_rel_filial'), ...LEDGER_ATE_A_BASE],
      agora: AGORA,
      dataDeEntrada: {
        '0147_drop_itens_nome_uidx.sql': UMA_HORA_ATRAS,
        '0148_ledger_de_migracoes.sql': UMA_HORA_ATRAS,
        '0149_escrita_atomica_ativos_anotacao.sql': UMA_HORA_ATRAS,
      },
    })
    expect(r.achados).toEqual([])
  })

  it('BASE FORA DO LEDGER: a própria base vira pendente, e a regra (D) avisa que não tem de onde olhar', () => {
    const r = avaliarDerivaMigrations({
      arquivosRepo: REPO,
      ledger: [aplicada('20260917085937', 'drop_rel_filial'), aplicada('0001', 'profiles')],
      agora: AGORA,
      dataDeEntrada: { '0146_estorno_com_pendencia_resolvida.sql': TRES_DIAS_ATRAS },
    })
    expect(r.ok).toBe(false)
    expect(r.achados.map((a) => a.chave)).toContain('deriva_migrations:pendente:0146_estorno_com_pendencia_resolvida.sql')
    expect(r.avisos.map((a) => a.chave)).toContain('deriva_migrations:base_fora_do_ledger')
  })

  it('LEDGER VAZIO (a RPC num banco sem a tabela de controle): tudo ≥ base pendente — nunca verde por omissão', () => {
    const r = avaliarDerivaMigrations({
      arquivosRepo: REPO,
      ledger: [],
      agora: AGORA,
      dataDeEntrada: Object.fromEntries(REPO.map((a) => [a, TRES_DIAS_ATRAS])),
    })
    expect(r.ok).toBe(false)
    expect(r.pendentes).toHaveLength(4) // 0146..0149
  })

  it('os DOIS formatos reais de `name` dão o MESMO veredito (produção × ensaio)', () => {
    const producao = avaliarDerivaMigrations({
      arquivosRepo: REPO,
      ledger: [aplicada('20260918200100', 'drop_itens_nome_uidx'), ...LEDGER_ATE_A_BASE],
      agora: AGORA,
    })
    const ensaio = avaliarDerivaMigrations({
      arquivosRepo: REPO,
      ledger: [
        aplicada('20260918200100', '0147_drop_itens_nome_uidx'),
        aplicada('20260918132329', 'estorno_com_pendencia_resolvida'),
        aplicada('0001', '0001_profiles'),
      ],
      agora: AGORA,
    })
    expect(producao.pendentes).toEqual(ensaio.pendentes)
    expect(producao.ok).toBe(ensaio.ok)
  })

  it('NOME DUPLICADO dentro do contrato: alarme, e os dois ficam fora dos pendentes', () => {
    const r = avaliarDerivaMigrations({
      arquivosRepo: [...REPO, '0150_ledger_de_migracoes.sql'],
      ledger: LEDGER_ATE_A_BASE,
      agora: AGORA,
    })
    expect(r.achados.map((a) => a.chave)).toContain('deriva_migrations:nome_duplicado:ledger_de_migracoes')
    expect(r.pendentes).not.toContain('0148_ledger_de_migracoes.sql')
    expect(r.pendentes).not.toContain('0150_ledger_de_migracoes.sql')
  })

  // Revisão de código de 22/09/2026: a contagem de ambiguidade olhava só os vigiados, e o nome
  // de uma migration NOVA que repetisse o de uma anterior à base casava com a linha antiga do
  // ledger — dada como aplicada, sem nunca ter sido, com a sonda verde para sempre.
  it('vigiado que repete o nome de uma migration ANTERIOR à base: alarme, nunca "aplicado"', () => {
    const r = avaliarDerivaMigrations({
      arquivosRepo: [...REPO, '0150_profiles.sql'],
      ledger: [
        aplicada('20260918200300', 'escrita_atomica_ativos_anotacao'),
        aplicada('20260918200200', 'ledger_de_migracoes'),
        aplicada('20260918200100', 'drop_itens_nome_uidx'),
        ...LEDGER_ATE_A_BASE,
      ],
      agora: AGORA,
    })
    expect(r.ok).toBe(false)
    const achado = r.achados.find((a) => a.chave === 'deriva_migrations:nome_duplicado:profiles')
    expect(achado?.motivo).toContain('0001_profiles.sql, 0150_profiles.sql')
    expect(r.pendentes).not.toContain('0150_profiles.sql')
    expect(r.ultimaNoLedger?.arquivo).not.toBe('0150_profiles.sql')
  })

  it('nome duplicado SÓ no histórico (antes da base) não alarma', () => {
    const r = avaliarDerivaMigrations({
      arquivosRepo: [...REPO, '0100_profiles.sql'],
      ledger: [
        aplicada('20260918200300', 'escrita_atomica_ativos_anotacao'),
        aplicada('20260918200200', 'ledger_de_migracoes'),
        aplicada('20260918200100', 'drop_itens_nome_uidx'),
        ...LEDGER_ATE_A_BASE,
      ],
      agora: AGORA,
    })
    expect(r.ok).toBe(true)
  })
})

describe('(D) linha do ledger SEM NOME — o ponto cego da revisão final', () => {
  it('aplicada depois da base: alarme próprio, nunca invisível', () => {
    const r = avaliarDerivaMigrations({
      arquivosRepo: REPO,
      ledger: [{ versao: '20260918999999', nome: null }, ...LEDGER_ATE_A_BASE],
      agora: AGORA,
      dataDeEntrada: Object.fromEntries(REPO.map((a) => [a, UMA_HORA_ATRAS])),
    })
    expect(r.ok).toBe(false)
    expect(r.achados.map((a) => a.chave)).toEqual(['deriva_migrations:linha_sem_nome:20260918999999'])
  })

  it('anterior à base: histórico, fica fora como qualquer outra linha antiga', () => {
    const r = avaliarDerivaMigrations({
      arquivosRepo: REPO,
      ledger: [...LEDGER_ATE_A_BASE, { versao: '20260801000000', nome: '' }],
      agora: AGORA,
      dataDeEntrada: Object.fromEntries(REPO.map((a) => [a, UMA_HORA_ATRAS])),
    })
    expect(r.achados).toEqual([])
  })
})

describe('a data de entrada na main — as duas leituras, puras', () => {
  const commit = (data: string) => ({ commit: { committer: { date: data } } })

  it('API: o ÚLTIMO item da página é o commit mais antigo (a adição)', () => {
    const resposta = [commit('2026-09-18T12:00:00Z'), commit('2026-09-17T09:00:00Z')]
    expect(dataDeEntradaDaRespostaDaApi(resposta, 100)).toBe('2026-09-17T09:00:00Z')
  })

  it('API: página CHEIA → sem data (a adição pode estar na próxima, e a data sairia NOVA demais)', () => {
    const cheia = Array.from({ length: 100 }, (_, i) => commit(`2026-09-${String(18 - (i % 10)).padStart(2, '0')}T00:00:00Z`))
    expect(dataDeEntradaDaRespostaDaApi(cheia, 100)).toBeNull()
  })

  it('API: resposta vazia, de erro ou sem data → null, nunca lança', () => {
    expect(dataDeEntradaDaRespostaDaApi([], 100)).toBeNull()
    expect(dataDeEntradaDaRespostaDaApi({ message: 'Not Found' }, 100)).toBeNull()
    expect(dataDeEntradaDaRespostaDaApi([{ commit: {} }], 100)).toBeNull()
  })

  it('git log: a última linha é a adição mais antiga', () => {
    expect(dataDeEntradaDoGitLog('2026-09-18T12:00:00-03:00\n2026-09-10T08:00:00-03:00\n', false)).toBe(
      '2026-09-10T08:00:00-03:00',
    )
  })

  it('git log em checkout RASO → sem data (o commit enxertado "adiciona" tudo, e a deriva velha pareceria nova)', () => {
    expect(dataDeEntradaDoGitLog('2026-09-18T12:00:00-03:00\n', true)).toBeNull()
  })
})

describe('arquivosPendentes — o MESMO cálculo, para a sonda buscar data só de quem precisa', () => {
  it('devolve só os arquivos ≥ base ausentes do ledger (nunca o histórico)', () => {
    expect(arquivosPendentes({ arquivosRepo: REPO, ledger: LEDGER_ATE_A_BASE })).toEqual([
      '0147_drop_itens_nome_uidx.sql',
      '0148_ledger_de_migracoes.sql',
      '0149_escrita_atomica_ativos_anotacao.sql',
    ])
  })

  it('concorda com avaliarDerivaMigrations em todo caso (as duas partem da mesma análise)', () => {
    const ledger = [aplicada('20260918200300', 'escrita_atomica_ativos_anotacao'), ...LEDGER_ATE_A_BASE]
    expect(arquivosPendentes({ arquivosRepo: REPO, ledger })).toEqual(
      avaliarDerivaMigrations({ arquivosRepo: REPO, ledger, agora: AGORA }).pendentes,
    )
  })

  it('a base do contrato é a 0146', () => {
    expect(BASE_DO_CONTRATO).toBe(146)
  })
})
