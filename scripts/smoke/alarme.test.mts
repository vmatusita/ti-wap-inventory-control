import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  avaliarIntegridade,
  corpoDoAlarme,
  decidirIssue,
  filtrarPorReleitura,
  impressaoDoEstado,
  issueDoPar,
  tabelaDoResumo,
  tituloDoAlarme,
} from './alarme.mjs'

// A LÓGICA DO ALARME, PROVADA (F55 · Frente D).
//
// O que decide se alguém é acordado não pode viver só dentro de um passo de
// YAML, onde a única prova é rodar o workflow — e rodar o workflow custa minuto
// e depende do GitHub estar de bom humor. Aqui a decisão é função pura, e os
// três casos que a ordem exige têm nome próprio abaixo.

const BASE = {
  patrimonio_duplicado: 0,
  ativo_filial_inativa: 0,
  termo_sem_arquivo: 0,
  perfil_sem_conta: 0,
  conta_sem_perfil: 0,
  pendencia_de_estornada: 0,
  operador_sem_filial: 0,
  arquivo_termo_orfao: 3,
  conflito_entre_filiais: 69,
  detentor_em_estado_sem_dono: 0,
  reserva_aberta: 0,
  backup_orfao: 10,
}

const noBase = () => ({ ...BASE })

describe('avaliarIntegridade — hoje-zero e catraca', () => {
  it('tudo igual à linha de base: verde', () => {
    const r = avaliarIntegridade(noBase(), BASE)
    expect(r.ok).toBe(true)
    expect(r.achados).toEqual([])
  })

  it('chave HOJE-ZERO com um achado: vermelho', () => {
    const totais = { ...noBase(), patrimonio_duplicado: 1 }
    const r = avaliarIntegridade(totais, BASE)
    expect(r.ok).toBe(false)
    expect(r.achados.map((a) => a.chave)).toEqual(['patrimonio_duplicado'])
    expect(r.achados[0].motivo).toContain('0 → 1')
  })

  it('chave com CATRACA no número exato da base: verde (não alarma o que já existia)', () => {
    const r = avaliarIntegridade({ ...noBase(), conflito_entre_filiais: 69 }, BASE)
    expect(r.ok).toBe(true)
  })

  it('chave com CATRACA que PASSA da base: vermelho', () => {
    const r = avaliarIntegridade({ ...noBase(), conflito_entre_filiais: 70 }, BASE)
    expect(r.ok).toBe(false)
    expect(r.achados[0]).toMatchObject({ chave: 'conflito_entre_filiais', total: 70, base: 69 })
  })

  it('chave ABAIXO da base não alarma, mas avisa que a base pode descer', () => {
    const r = avaliarIntegridade({ ...noBase(), backup_orfao: 4 }, BASE)
    expect(r.ok).toBe(true)
    expect(r.podeDescer).toEqual([{ chave: 'backup_orfao', total: 4, base: 10 }])
  })
})

describe('avaliarIntegridade — FECHA EM FALHA', () => {
  it('chave que o resumo devolveu e a política não conhece: vermelho', () => {
    const r = avaliarIntegridade({ ...noBase(), checagem_nova_qualquer: 0 }, BASE)
    expect(r.ok).toBe(false)
    expect(r.achados[0].chave).toBe('checagem_nova_qualquer')
    expect(r.achados[0].motivo).toContain('não conhece')
  })

  it('chave que a política espera e o resumo NÃO devolveu: vermelho', () => {
    // Foi assim que DUAS checagens sumiram em silêncio na 0098.
    const totais: Record<string, number> = noBase()
    delete totais.reserva_aberta
    const r = avaliarIntegridade(totais, BASE)
    expect(r.ok).toBe(false)
    expect(r.achados[0]).toMatchObject({ chave: 'reserva_aberta', total: null })
    expect(r.achados[0].motivo).toContain('NÃO devolveu')
  })

  it('total ilegível é achado, não é zero', () => {
    // Um `total` que não é número (o PostgREST devolvendo `null`, ou um bigint
    // que não coube) é ACHADO, nunca zero: contar zero por não saber ler é o
    // modo de falha mais silencioso que uma sonda pode ter.
    const totais: Record<string, number | null> = { ...noBase(), reserva_aberta: null }
    const r = avaliarIntegridade(totais, BASE)
    expect(r.ok).toBe(false)
    expect(r.achados[0].motivo).toContain('ilegível')
  })

  it('resumo VAZIO alarma nas doze — nunca fica verde por não ter o que olhar', () => {
    const r = avaliarIntegridade({}, BASE)
    expect(r.ok).toBe(false)
    expect(r.achados).toHaveLength(12)
  })
})

describe('filtrarPorReleitura — a falha passageira NÃO abre issue', () => {
  const COM_RELEITURA = ['backup_orfao']

  it('CASO 3 DA ORDEM: achado que some na releitura é descartado', () => {
    const primeira = [{ chave: 'backup_orfao', total: 11, base: 10, motivo: 'x' }]
    const segunda: typeof primeira = [] // o backup em voo terminou
    expect(filtrarPorReleitura(primeira, segunda, COM_RELEITURA)).toEqual([])
  })

  it('achado que SOBREVIVE à releitura alarma', () => {
    const primeira = [{ chave: 'backup_orfao', total: 11, base: 10, motivo: 'x' }]
    const segunda = [{ chave: 'backup_orfao', total: 11, base: 10, motivo: 'x' }]
    expect(filtrarPorReleitura(primeira, segunda, COM_RELEITURA)).toHaveLength(1)
  })

  it('chave SEM releitura declarada alarma na primeira leitura', () => {
    const primeira = [{ chave: 'patrimonio_duplicado', total: 1, base: 0, motivo: 'x' }]
    expect(filtrarPorReleitura(primeira, [], COM_RELEITURA)).toHaveLength(1)
  })
})

describe('decidirIssue — o estado é POR PAR (alvo, parte)', () => {
  const A_VERDE = { alvo: 'producao', parte: 'sonda' }
  const B_VERMELHA = { alvo: 'producao', parte: 'integridade' }

  const issues = [
    { number: 7, title: tituloDoAlarme('producao', 'integridade'), impressao: 'x=1/0' },
    { number: 9, title: tituloDoAlarme('producao', 'sonda'), impressao: 'y' },
  ]

  it('CASO 1 DA ORDEM: A verde NÃO fecha o alarme que B abriu', () => {
    // O par da Parte A é (producao, sonda). O verde dele fecha a issue 9 — e só
    // ela. A issue 7, do par (producao, integridade), não é sequer consultada.
    const doPar = issueDoPar(issues, A_VERDE.alvo, A_VERDE.parte)
    expect(doPar?.number).toBe(9)
    expect(decidirIssue({ vermelho: false, issueAberta: doPar, impressaoAtual: '' })).toEqual({
      acao: 'fechar',
      numero: 9,
    })
    // e a de integridade continua onde estava
    expect(issueDoPar(issues, B_VERMELHA.alvo, B_VERMELHA.parte)?.number).toBe(7)
  })

  it('CASO 2 DA ORDEM: verde no ENSAIO não fecha alarme de PRODUÇÃO', () => {
    const doPar = issueDoPar(issues, 'ensaio', 'integridade')
    expect(doPar).toBeNull()
    expect(decidirIssue({ vermelho: false, issueAberta: doPar, impressaoAtual: '' })).toEqual({
      acao: 'nada',
    })
    // a de produção segue aberta
    expect(issueDoPar(issues, 'producao', 'integridade')?.number).toBe(7)
  })

  it('vermelho sem issue: abre', () => {
    expect(decidirIssue({ vermelho: true, issueAberta: null, impressaoAtual: 'a=1/0' })).toEqual({
      acao: 'abrir',
    })
  })

  it('vermelho com o MESMO estado: atualiza o corpo, SEM comentar (nada de spam)', () => {
    const r = decidirIssue({
      vermelho: true,
      issueAberta: { number: 7, impressao: 'a=1/0' },
      impressaoAtual: 'a=1/0',
    })
    expect(r).toEqual({ acao: 'atualizar', numero: 7 })
  })

  it('vermelho com estado DIFERENTE: comenta', () => {
    const r = decidirIssue({
      vermelho: true,
      issueAberta: { number: 7, impressao: 'a=1/0' },
      impressaoAtual: 'a=2/0',
    })
    expect(r).toEqual({ acao: 'comentar', numero: 7 })
  })

  it('verde sem issue: nada — o dia normal', () => {
    expect(decidirIssue({ vermelho: false, issueAberta: null, impressaoAtual: '' })).toEqual({
      acao: 'nada',
    })
  })
})

describe('impressaoDoEstado', () => {
  it('não muda quando só a ordem dos achados muda', () => {
    const a = [
      { chave: 'x', total: 1, base: 0 },
      { chave: 'y', total: 2, base: 0 },
    ]
    expect(impressaoDoEstado(a)).toBe(impressaoDoEstado([...a].reverse()))
  })

  it('MUDA quando um total muda', () => {
    expect(impressaoDoEstado([{ chave: 'x', total: 1, base: 0 }])).not.toBe(
      impressaoDoEstado([{ chave: 'x', total: 2, base: 0 }]),
    )
  })

  it('MUDA quando entra uma chave nova', () => {
    expect(impressaoDoEstado([{ chave: 'x', total: 1, base: 0 }])).not.toBe(
      impressaoDoEstado([
        { chave: 'x', total: 1, base: 0 },
        { chave: 'z', total: 1, base: 0 },
      ]),
    )
  })
})

describe('corpoDoAlarme — nunca amostra, nunca nome, nunca patrimônio', () => {
  const corpo = corpoDoAlarme({
    alvo: 'producao',
    parte: 'integridade',
    achados: [
      { chave: 'patrimonio_duplicado', total: 2, base: 0, motivo: 'passou da linha de base (0 → 2)' },
    ],
    podeDescer: [{ chave: 'backup_orfao', total: 4, base: 10 }],
    linkDoRun: 'https://github.com/exemplo/run/1',
    medidoEm: '2026-09-10T12:00:00Z',
  })

  it('leva a chave, o total, a base e o link', () => {
    expect(corpo).toContain('patrimonio_duplicado')
    expect(corpo).toContain('| 2 |')
    expect(corpo).toContain('https://github.com/exemplo/run/1')
    expect(corpo).toContain('RUNBOOK-ALARME.md')
  })

  it('não tem por onde receber amostra — um campo extra no achado é ignorado', () => {
    // A sabotagem: quem chamar passando uma amostra por engano não consegue
    // vazá-la, porque o corpo é montado campo a campo, nunca por interpolação do
    // objeto inteiro.
    const comAmostra = corpoDoAlarme({
      alvo: 'producao',
      parte: 'integridade',
      achados: [
        {
          chave: 'patrimonio_duplicado',
          total: 2,
          base: 0,
          motivo: 'x',
          // campo que a função não conhece, de propósito — ela monta o corpo
          // campo a campo e nunca interpola o objeto inteiro
          amostra: ['ZZF55FICTICIO / abc (Filial Fictícia)'],
        },
      ],
      podeDescer: [],
      linkDoRun: 'https://github.com/exemplo/run/1',
      medidoEm: '2026-09-10T12:00:00Z',
    })
    expect(comAmostra).not.toContain('ZZF55FICTICIO')
    expect(comAmostra).not.toContain('Filial Fictícia')
    // e o corpo normal também não carrega identificador nenhum
    expect(corpo).not.toMatch(/WAP\d/)
    expect(corpo).not.toMatch(/@[a-z]+\./i)
  })

  it('diz que fecha sozinha', () => {
    expect(corpo).toContain('fechada sozinha')
  })
})

describe('tabelaDoResumo — a série temporal de custo zero', () => {
  it('marca ✗ acima, ↓ abaixo, ✓ igual e ⚠ ausente', () => {
    const totais: Record<string, number> = { ...noBase(), patrimonio_duplicado: 1, backup_orfao: 4 }
    delete totais.reserva_aberta
    const t = tabelaDoResumo({ alvo: 'producao', totais, base: BASE })
    expect(t).toMatch(/patrimonio_duplicado.*\|\s*1\s*\|\s*0\s*\|\s*✗/)
    expect(t).toMatch(/backup_orfao.*\|\s*4\s*\|\s*10\s*\|\s*↓/)
    expect(t).toMatch(/reserva_aberta.*⚠ ausente/)
    expect(t).toMatch(/termo_sem_arquivo.*✓/)
  })
})

// ---------------------------------------------------------------------------
// O ARQUIVO DA LINHA DE BASE — a política versionada
// ---------------------------------------------------------------------------

describe('linha-de-base.json', () => {
  const politica: {
    _leia: string
    _releitura: string
    releitura_segundos: number
    chaves_com_releitura: string[]
    alvos: Record<string, Record<string, number>>
  } = JSON.parse(
    readFileSync(join(process.cwd(), 'scripts', 'smoke', 'linha-de-base.json'), 'utf8'),
  )

  it('tem os dois alvos, com as MESMAS doze chaves', () => {
    expect(Object.keys(politica.alvos).sort()).toEqual(['ensaio', 'producao'])
    const prod = Object.keys(politica.alvos.producao).sort()
    const ens = Object.keys(politica.alvos.ensaio).sort()
    expect(prod).toHaveLength(12)
    expect(ens).toEqual(prod)
  })

  it('todo total é inteiro não-negativo — e NUNCA uma amostra', () => {
    for (const alvo of Object.values(politica.alvos)) {
      for (const [chave, v] of Object.entries(alvo)) {
        expect(Number.isInteger(v), `${chave} não é inteiro`).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('escreve, no próprio arquivo, que SUBIR a base é decisão do Johnny', () => {
    expect(politica._leia).toContain('Johnny')
    expect(politica._leia).toMatch(/so DESCE|só DESCE|so desce|só desce/i)
  })

  it('declara a releitura de confirmação da 12ª, com o motivo', () => {
    expect(politica.chaves_com_releitura).toContain('backup_orfao')
    expect(politica.releitura_segundos).toBeGreaterThan(0)
    expect(politica._releitura).toContain('em voo')
  })

  it('os dois alvos DIVERGEM — é por isso que a base é por alvo', () => {
    // O ensaio tem um operador sem filial que produção não tem; produção tem
    // conflitos e backups órfãos que o ensaio não tem. Uma base única faria o
    // disparo contra o ensaio alarmar sozinho.
    expect(politica.alvos.ensaio.operador_sem_filial).toBeGreaterThan(
      politica.alvos.producao.operador_sem_filial,
    )
    expect(politica.alvos.producao.conflito_entre_filiais).toBeGreaterThan(
      politica.alvos.ensaio.conflito_entre_filiais,
    )
  })
})
