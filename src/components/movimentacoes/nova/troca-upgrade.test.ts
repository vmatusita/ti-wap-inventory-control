import { describe, it, expect } from 'vitest'
import {
  MOTIVO_TROCA_UPGRADE,
  configDaContrapartida,
  contrapartidaAtiva,
  contrapartidaPadrao,
  deveOferecerAtalho,
  linkContrapartida,
  montarItensDoPar,
  nascerContrapartida,
  ofereceContrapartida,
  prefillContrapartida,
  sincronizarPrefill,
  tipoContrapartida,
  validarPar,
  type ContrapartidaTroca,
} from '@/components/movimentacoes/nova/troca-upgrade'
import type { Config } from '@/components/movimentacoes/nova/config'
import {
  MAX_LOTE_MOVIMENTACAO,
  loteMovimentacaoSchema,
} from '@/lib/validators/movimentacao'
import type { StatusAtivo } from '@/lib/dominio'
import type { AtivoResumo } from '@/lib/queries/ativos'

const DATA_OK = '2020-01-01'

// Ativos 100% ficticios (regra 2 do CLAUDE.md): patrimonio WAP000xxxx, nomes
// "Fulano"/"Beltrana". Nenhum dado real da WAP entra em teste.
let seq = 0
function ativo(over: Partial<AtivoResumo> = {}): AtivoResumo {
  seq += 1
  const n = String(seq).padStart(7, '0')
  return {
    id: `1${n.slice(0, 2)}e4567-e89b-12d3-a456-4266141${n.slice(-5)}`,
    patrimonio: `WAP${n}`,
    service_tag: null,
    categoria: 'notebook',
    marca: 'Acme',
    modelo: 'X1',
    status: 'em_uso' as StatusAtivo,
    colaborador_atual: null,
    filial_id: 1,
    filial_nome: 'Matriz',
    termo_assinado: null,
    patrimonio_duplicado: false,
    ...over,
  }
}

function cfg(over: Partial<Config>): Config {
  return {
    data: DATA_OK,
    tipo: '',
    motivo: '',
    colaborador: '',
    setor: '',
    chamado: '',
    chamadoFornecedor: '',
    termo: '',
    termoData: '',
    observacao: '',
    filialDestinoId: '',
    itensFaltantes: [],
    ...over,
  }
}

const DEVOLUCAO_TROCA = cfg({
  tipo: 'devolucao',
  motivo: MOTIVO_TROCA_UPGRADE,
})
const SAIDA_TROCA = cfg({
  tipo: 'saida',
  motivo: MOTIVO_TROCA_UPGRADE,
  colaborador: 'Fulano de Tal',
})

describe('MOTIVO_TROCA_UPGRADE — a constante única', () => {
  it('é o CÓDIGO do seed 0007, não o rótulo (o admin renomeia o rótulo)', () => {
    expect(MOTIVO_TROCA_UPGRADE).toBe('troca_upgrade')
  })
})

describe('tipoContrapartida — só devolução ⇄ saída formam par', () => {
  it('devolução pede a saída do substituto', () => {
    expect(tipoContrapartida('devolucao')).toBe('saida')
  })

  it('saída pede a devolução do antigo', () => {
    expect(tipoContrapartida('saida')).toBe('devolucao')
  })

  it.each([
    'emprestimo',
    'reserva',
    'transferencia',
    'ajuste',
    'triagem_ok',
    'envio_manutencao',
    'descarte',
    '',
  ] as const)('%s não tem contrapartida', (tipo) => {
    expect(tipoContrapartida(tipo)).toBeNull()
  })
})

describe('ofereceContrapartida — derivada de tipo + CÓDIGO do motivo', () => {
  it('devolução com troca/upgrade oferece', () => {
    expect(ofereceContrapartida(DEVOLUCAO_TROCA)).toBe(true)
  })

  it('saída com troca/upgrade oferece', () => {
    expect(ofereceContrapartida(SAIDA_TROCA)).toBe(true)
  })

  it('mesmo tipo com OUTRO motivo não oferece', () => {
    expect(
      ofereceContrapartida(cfg({ tipo: 'devolucao', motivo: 'desligamento' })),
    ).toBe(false)
  })

  it('motivo certo em tipo sem par não oferece', () => {
    expect(
      ofereceContrapartida(cfg({ tipo: 'emprestimo', motivo: MOTIVO_TROCA_UPGRADE })),
    ).toBe(false)
  })

  it('sem tipo não oferece', () => {
    expect(ofereceContrapartida(cfg({ motivo: MOTIVO_TROCA_UPGRADE }))).toBe(false)
  })
})

describe('prefillContrapartida — pré-preenche só quando é honesto', () => {
  it('todos com o MESMO detentor: pré-preenche', () => {
    const lote = [
      ativo({ colaborador_atual: 'Fulano de Tal' }),
      ativo({ colaborador_atual: 'Fulano de Tal' }),
    ]
    expect(prefillContrapartida(lote)).toBe('Fulano de Tal')
  })

  it('detentores MISTOS: campo vazio, sem chute', () => {
    const lote = [
      ativo({ colaborador_atual: 'Fulano de Tal' }),
      ativo({ colaborador_atual: 'Beltrana de Tal' }),
    ]
    expect(prefillContrapartida(lote)).toBe('')
  })

  it('algum SEM detentor: campo vazio (não herda do vizinho)', () => {
    const lote = [
      ativo({ colaborador_atual: 'Fulano de Tal' }),
      ativo({ colaborador_atual: null }),
    ]
    expect(prefillContrapartida(lote)).toBe('')
  })

  it('todos sem detentor: campo vazio', () => {
    expect(prefillContrapartida([ativo(), ativo()])).toBe('')
  })

  it('detentor só com espaços conta como vazio', () => {
    expect(prefillContrapartida([ativo({ colaborador_atual: '   ' })])).toBe('')
  })

  it('lote vazio: campo vazio', () => {
    expect(prefillContrapartida([])).toBe('')
  })
})

describe('nascerContrapartida — o estado no momento em que a seção aparece', () => {
  it('devolução → saída: nasce com o colaborador do lote', () => {
    const c = nascerContrapartida(DEVOLUCAO_TROCA, [
      ativo({ colaborador_atual: 'Fulano de Tal' }),
    ])
    expect(c.colaborador).toBe('Fulano de Tal')
    expect(c.itens).toEqual([])
    expect(c.deixarParaDepois).toBe(false)
  })

  it('saída → devolução: a devolução não coleta colaborador, nasce vazio', () => {
    const c = nascerContrapartida(SAIDA_TROCA, [
      ativo({ colaborador_atual: 'Fulano de Tal' }),
    ])
    expect(c.colaborador).toBe('')
  })

  it('o padrão é a contrapartida ABERTA', () => {
    expect(contrapartidaPadrao().deixarParaDepois).toBe(false)
  })
})

describe('validarPar — as regras que só existem por causa do par', () => {
  const emEstoque = () => ativo({ status: 'em_estoque' })
  const emUso = () => ativo({ status: 'em_uso' })

  it('config que não oferece contrapartida não valida nada', () => {
    expect(
      validarPar(cfg({ tipo: 'devolucao', motivo: 'desligamento' }), [emUso()], null),
    ).toEqual([])
  })

  it('contrapartida ABERTA e VAZIA bloqueia com mensagem acionável', () => {
    const msgs = validarPar(DEVOLUCAO_TROCA, [emUso()], contrapartidaPadrao())
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('Deixar a contrapartida para depois')
  })

  it('"deixar para depois" com a seção vazia não bloqueia', () => {
    expect(
      validarPar(
        DEVOLUCAO_TROCA,
        [emUso()],
        contrapartidaPadrao({ deixarParaDepois: true }),
      ),
    ).toEqual([])
  })

  it('metades DISJUNTAS: o mesmo ativo nas duas é barrado, nomeando o culpado', () => {
    const a = emUso()
    const msgs = validarPar(
      DEVOLUCAO_TROCA,
      [a],
      contrapartidaPadrao({ itens: [a] }),
    )
    expect(msgs.some((m) => m.includes(a.patrimonio as string))).toBe(true)
    expect(msgs.some((m) => m.includes('duas metades'))).toBe(true)
  })

  it('teto SOMADO: a mensagem cita a soma e o máximo derivado da constante', () => {
    const principal = Array.from({ length: MAX_LOTE_MOVIMENTACAO - 1 }, emUso)
    const contra = [emEstoque(), emEstoque()]
    const msgs = validarPar(
      DEVOLUCAO_TROCA,
      principal,
      contrapartidaPadrao({ itens: contra }),
    )
    expect(
      msgs.some(
        (m) =>
          m.includes(String(MAX_LOTE_MOVIMENTACAO + 1)) &&
          m.includes(String(MAX_LOTE_MOVIMENTACAO)),
      ),
    ).toBe(true)
  })

  it('a soma EXATA no teto passa', () => {
    const principal = Array.from({ length: MAX_LOTE_MOVIMENTACAO - 1 }, emUso)
    const msgs = validarPar(
      DEVOLUCAO_TROCA,
      principal,
      contrapartidaPadrao({ itens: [emEstoque()] }),
    )
    expect(msgs).toEqual([])
  })

  it('ativo em estado inválido para a metade oposta é avisado', () => {
    // Sentido devolução → saída: a saída exige em_estoque/reservado/em_triagem.
    const errado = ativo({ status: 'em_manutencao' })
    const msgs = validarPar(
      DEVOLUCAO_TROCA,
      [emUso()],
      contrapartidaPadrao({ itens: [errado] }),
    )
    expect(msgs.some((m) => m.includes(errado.patrimonio as string))).toBe(true)
    expect(msgs.some((m) => m.includes('Em manutenção'))).toBe(true)
  })

  it('sentido saída → devolução: a devolução exige em_uso/emprestado', () => {
    expect(
      validarPar(
        SAIDA_TROCA,
        [emEstoque()],
        contrapartidaPadrao({ itens: [emUso()] }),
      ),
    ).toEqual([])
    expect(
      validarPar(
        SAIDA_TROCA,
        [emEstoque()],
        contrapartidaPadrao({ itens: [emEstoque()] }),
      ),
    ).not.toEqual([])
  })

  it('par válido nos dois sentidos não produz mensagem', () => {
    expect(
      validarPar(
        DEVOLUCAO_TROCA,
        [emUso()],
        contrapartidaPadrao({ itens: [emEstoque()] }),
      ),
    ).toEqual([])
  })
})

describe('contrapartidaAtiva', () => {
  it('aberta com config que oferece = ativa', () => {
    expect(contrapartidaAtiva(DEVOLUCAO_TROCA, contrapartidaPadrao())).toBe(true)
  })

  it('"deixar para depois" = inativa', () => {
    expect(
      contrapartidaAtiva(
        DEVOLUCAO_TROCA,
        contrapartidaPadrao({ deixarParaDepois: true }),
      ),
    ).toBe(false)
  })

  it('config que não oferece = inativa mesmo com itens no estado', () => {
    expect(
      contrapartidaAtiva(
        cfg({ tipo: 'devolucao', motivo: 'desligamento' }),
        contrapartidaPadrao({ itens: [ativo()] }),
      ),
    ).toBe(false)
  })
})

describe('configDaContrapartida — compartilhados x próprios da metade', () => {
  it('herda data/chamado/observação e inverte o tipo, com motivo FIXO', () => {
    const principal = cfg({
      tipo: 'devolucao',
      motivo: MOTIVO_TROCA_UPGRADE,
      data: '2020-02-03',
      chamado: '4242',
      observacao: 'trocado por upgrade de RAM',
      itensFaltantes: ['mouse'],
    })
    const c: ContrapartidaTroca = contrapartidaPadrao({
      colaborador: 'Fulano de Tal',
      setor: 'TI',
      termo: 'sim',
      termoData: '2020-02-03',
    })
    const oposta = configDaContrapartida(principal, c)
    expect(oposta.tipo).toBe('saida')
    expect(oposta.motivo).toBe(MOTIVO_TROCA_UPGRADE)
    expect(oposta.data).toBe('2020-02-03')
    expect(oposta.chamado).toBe('4242')
    expect(oposta.observacao).toBe('trocado por upgrade de RAM')
    expect(oposta.colaborador).toBe('Fulano de Tal')
    expect(oposta.setor).toBe('TI')
    expect(oposta.termo).toBe('sim')
    // Os itens faltantes da metade principal NÃO vazam para a saída.
    expect(oposta.itensFaltantes).toEqual([])
  })
})

describe('montarItensDoPar — ordem e campos por metade', () => {
  it('sem contrapartida: idêntico ao lote simples', () => {
    const itens = montarItensDoPar(
      [ativo({ status: 'em_uso' })],
      cfg({ tipo: 'devolucao', motivo: 'desligamento' }),
      '',
      null,
    )
    expect(itens).toHaveLength(1)
    expect(itens[0].tipo).toBe('devolucao')
  })

  it('"deixar para depois": grava só a metade principal', () => {
    const itens = montarItensDoPar(
      [ativo({ status: 'em_uso' })],
      DEVOLUCAO_TROCA,
      '',
      contrapartidaPadrao({
        itens: [ativo({ status: 'em_estoque' })],
        deixarParaDepois: true,
      }),
    )
    expect(itens).toHaveLength(1)
    expect(itens[0].tipo).toBe('devolucao')
  })

  it('a metade PRINCIPAL vem primeiro no array', () => {
    const antigo = ativo({ status: 'em_uso' })
    const novo = ativo({ status: 'em_estoque' })
    const itens = montarItensDoPar(
      [antigo],
      DEVOLUCAO_TROCA,
      '',
      contrapartidaPadrao({ itens: [novo], colaborador: 'Fulano de Tal' }),
    )
    expect(itens.map((i) => i.ativo_id)).toEqual([antigo.id, novo.id])
    expect(itens.map((i) => i.tipo)).toEqual(['devolucao', 'saida'])
  })

  it('cada metade leva os campos do SEU tipo, e as duas o motivo troca_upgrade', () => {
    const antigo = ativo({ status: 'em_uso' })
    const novo = ativo({ status: 'em_estoque' })
    const [dev, sai] = montarItensDoPar(
      [antigo],
      cfg({
        tipo: 'devolucao',
        motivo: MOTIVO_TROCA_UPGRADE,
        itensFaltantes: ['carregador'],
      }),
      '',
      contrapartidaPadrao({
        itens: [novo],
        colaborador: 'Fulano de Tal',
        setor: 'TI',
        termo: 'enviado',
        termoData: DATA_OK,
      }),
    )
    expect(dev.motivo).toBe(MOTIVO_TROCA_UPGRADE)
    expect(dev.itens_faltantes).toEqual(['carregador'])
    expect(dev).not.toHaveProperty('colaborador')

    expect(sai.motivo).toBe(MOTIVO_TROCA_UPGRADE)
    expect(sai.colaborador).toBe('Fulano de Tal')
    expect(sai.setor).toBe('TI')
    expect(sai.termo_assinado).toBe('enviado')
    expect(sai.termo_data).toBe(DATA_OK)
    expect(sai).not.toHaveProperty('itens_faltantes')
  })

  it('sentido saída → devolução: o espelho exato', () => {
    const novo = ativo({ status: 'em_estoque' })
    const antigo = ativo({ status: 'em_uso' })
    const [sai, dev] = montarItensDoPar(
      [novo],
      SAIDA_TROCA,
      '',
      contrapartidaPadrao({ itens: [antigo], itensFaltantes: ['fonte'] }),
    )
    expect(sai.tipo).toBe('saida')
    expect(sai.colaborador).toBe('Fulano de Tal')
    expect(dev.tipo).toBe('devolucao')
    expect(dev.motivo).toBe(MOTIVO_TROCA_UPGRADE)
    expect(dev.itens_faltantes).toEqual(['fonte'])
  })

  it('o par montado é aceito pelo schema do lote (união discriminada)', () => {
    const itens = montarItensDoPar(
      [ativo({ status: 'em_uso' })],
      DEVOLUCAO_TROCA,
      '',
      contrapartidaPadrao({
        itens: [ativo({ status: 'em_estoque' })],
        colaborador: 'Fulano de Tal',
      }),
    )
    const r = loteMovimentacaoSchema.safeParse({ itens })
    expect(r.success).toBe(true)
  })

  it('o par montado NÃO repete ativo (a disjunção chega limpa ao servidor)', () => {
    const antigo = ativo({ status: 'em_uso' })
    const novo = ativo({ status: 'em_estoque' })
    const itens = montarItensDoPar(
      [antigo],
      DEVOLUCAO_TROCA,
      '',
      contrapartidaPadrao({ itens: [novo], colaborador: 'Fulano de Tal' }),
    )
    const ids = itens.map((i) => i.ativo_id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('saída da troca sem colaborador NEM setor é rejeitada pelo Zod', () => {
    const itens = montarItensDoPar(
      [ativo({ status: 'em_uso' })],
      DEVOLUCAO_TROCA,
      '',
      contrapartidaPadrao({ itens: [ativo({ status: 'em_estoque' })] }),
    )
    expect(loteMovimentacaoSchema.safeParse({ itens }).success).toBe(false)
  })
})

describe('linkContrapartida — o atalho do painel de sucesso', () => {
  it('leva tipo, motivo e o marcador que impede o laço', () => {
    const url = linkContrapartida({
      tipo: 'saida',
      colaborador: '',
      origemMovimentacaoId: '',
    })
    expect(url).toBe(
      '/movimentacoes/nova?tipo=saida&motivo=troca_upgrade&contrapartida=nao',
    )
  })

  it('leva o colaborador quando existe, escapado', () => {
    const url = linkContrapartida({
      tipo: 'saida',
      colaborador: 'Fulano de Tal',
      origemMovimentacaoId: '',
    })
    expect(url).toContain('colaborador=Fulano+de+Tal')
  })

  it('colaborador vazio não vira param vazio', () => {
    expect(
      linkContrapartida({
        tipo: 'devolucao',
        colaborador: '',
        origemMovimentacaoId: '',
      }),
    ).not.toContain('colaborador')
  })

  it('a origem entra como `de=` — é o que torna a URL diferente da atual', () => {
    const a = linkContrapartida({
      tipo: 'saida',
      colaborador: 'Fulano de Tal',
      origemMovimentacaoId: 'aaa',
    })
    const b = linkContrapartida({
      tipo: 'saida',
      colaborador: 'Fulano de Tal',
      origemMovimentacaoId: 'bbb',
    })
    expect(a).toContain('de=aaa')
    expect(a).not.toBe(b)
  })
})

// O achado da revisão adversarial da fase: o `contrapartida=nao` recolhe a seção
// na chegada, mas NÃO impedia, sozinho, o painel de oferecer o atalho de novo na
// tela que já era a metade que faltava.
describe('deveOferecerAtalho — o atalho não se oferece a si mesmo', () => {
  const adiada = contrapartidaPadrao({ deixarParaDepois: true })
  const jaRegistrada = contrapartidaPadrao({
    deixarParaDepois: true,
    jaRegistrada: true,
  })

  it('contrapartida adiada numa tela comum: oferece', () => {
    expect(deveOferecerAtalho(DEVOLUCAO_TROCA, adiada)).toBe(true)
  })

  it('a MESMA situação com a outra metade JÁ registrada: NÃO oferece (seria laço)', () => {
    expect(deveOferecerAtalho(DEVOLUCAO_TROCA, jaRegistrada)).toBe(false)
  })

  it('contrapartida registrada junto (não adiada): não há o que oferecer', () => {
    expect(deveOferecerAtalho(DEVOLUCAO_TROCA, contrapartidaPadrao())).toBe(false)
  })

  it('config que não oferece par: não oferece atalho', () => {
    expect(
      deveOferecerAtalho(cfg({ tipo: 'devolucao', motivo: 'desligamento' }), adiada),
    ).toBe(false)
  })

  it('sem contrapartida nenhuma: não oferece', () => {
    expect(deveOferecerAtalho(DEVOLUCAO_TROCA, null)).toBe(false)
  })

  // Achado da SEGUNDA volta adversarial: o marcador era estado da MONTAGEM, e
  // por isso um par NOVO montado na tela do atalho o herdava — o painel escondia
  // um atalho genuinamente pendente. Nascendo do par, `nascerContrapartida` o
  // devolve a false por construção.
  it('par NOVO nascido na tela do atalho volta a oferecer o atalho', () => {
    const nova = nascerContrapartida(DEVOLUCAO_TROCA, [
      ativo({ status: 'em_uso', colaborador_atual: 'Fulano de Tal' }),
    ])
    expect(nova.jaRegistrada).toBe(false)
    expect(
      deveOferecerAtalho(DEVOLUCAO_TROCA, { ...nova, deixarParaDepois: true }),
    ).toBe(true)
  })
})

// Achado da SEGUNDA volta: o pré-preenchimento congelava no instante em que a
// seção nascia. Montar a devolução de um notebook do Fulano e depois juntar o
// notebook da Beltrana deixava "Fulano de Tal" escrito num lote de detentores
// MISTOS — o chute silencioso que o prefill existe para evitar.
describe('sincronizarPrefill — o prefill acompanha o lote, o que o operador digitou não', () => {
  const comFulano = () => ativo({ status: 'em_uso', colaborador_atual: 'Fulano de Tal' })
  const comBeltrana = () =>
    ativo({ status: 'em_uso', colaborador_atual: 'Beltrana de Tal' })

  it('lote fica MISTO: o nome pré-preenchido é apagado', () => {
    const c = nascerContrapartida(DEVOLUCAO_TROCA, [comFulano()])
    expect(c.colaborador).toBe('Fulano de Tal')
    const depois = sincronizarPrefill(DEVOLUCAO_TROCA, c, [
      comFulano(),
      comBeltrana(),
    ])
    expect(depois.colaborador).toBe('')
    expect(depois.prefillColaborador).toBe('')
  })

  it('lote volta a ter um dono só: o nome volta', () => {
    const c = contrapartidaPadrao()
    const depois = sincronizarPrefill(DEVOLUCAO_TROCA, c, [comFulano()])
    expect(depois.colaborador).toBe('Fulano de Tal')
  })

  it('o que o OPERADOR digitou nunca é sobrescrito', () => {
    const c = contrapartidaPadrao({
      colaborador: 'Ciclana de Tal',
      prefillColaborador: 'Fulano de Tal',
    })
    expect(sincronizarPrefill(DEVOLUCAO_TROCA, c, [comBeltrana()])).toBe(c)
  })

  it('campo apagado à mão também é do operador (não repõe o nome)', () => {
    const c = contrapartidaPadrao({
      colaborador: '',
      prefillColaborador: 'Fulano de Tal',
    })
    expect(sincronizarPrefill(DEVOLUCAO_TROCA, c, [comFulano()])).toBe(c)
  })

  it('sentido saída → devolução não tem colaborador: não mexe', () => {
    const c = contrapartidaPadrao()
    expect(sincronizarPrefill(SAIDA_TROCA, c, [comFulano()])).toBe(c)
  })

  it('config que não oferece par: não mexe', () => {
    const c = contrapartidaPadrao()
    expect(
      sincronizarPrefill(cfg({ tipo: 'devolucao', motivo: 'desligamento' }), c, [
        comFulano(),
      ]),
    ).toBe(c)
  })
})
