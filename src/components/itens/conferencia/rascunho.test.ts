import { describe, expect, it } from 'vitest'
import {
  desserializarRascunhoConferencia,
  horaDoRascunho,
} from '@/components/itens/conferencia/rascunho'

const VALIDO = JSON.stringify({
  filialId: 3,
  contagens: { 1: '14', 5: '8' },
  registrou: true,
  observacao: 'Inventário de 09/08/2026',
  iniciadaEm: '2026-08-09T14:32:00.000Z',
})

describe('desserializarRascunhoConferencia (dado de FORA, sempre)', () => {
  it('restaura o rascunho inteiro', () => {
    const r = desserializarRascunhoConferencia(VALIDO)
    expect(r).toEqual({
      filialId: 3,
      contagens: { 1: '14', 5: '8' },
          registrou: true,
      observacao: 'Inventário de 09/08/2026',
      iniciadaEm: '2026-08-09T14:32:00.000Z',
    })
  })

  it('chave ausente, JSON quebrado e não-objeto devolvem null sem lançar', () => {
    for (const bruto of [null, '', '{', 'null', '42', '"texto"', '[]']) {
      expect(desserializarRascunhoConferencia(bruto), JSON.stringify(bruto)).toBeNull()
    }
  })

  it('SEM FILIAL não há rascunho — o saldo é por filial', () => {
    for (const filialId of [undefined, null, 0, -1, 'x', 1.5]) {
      const bruto = JSON.stringify({ filialId, contagens: { 1: '2' } })
      expect(desserializarRascunhoConferencia(bruto), String(filialId)).toBeNull()
    }
  })

  it('filial como string numérica é aceita (o storage já guardou assim)', () => {
    const r = desserializarRascunhoConferencia(
      JSON.stringify({ filialId: '3', contagens: { 1: '2' } }),
    )
    expect(r?.filialId).toBe(3)
  })

  it('rascunho sem contagem NEM gravado é descartado (não há o que continuar)', () => {
    expect(
      desserializarRascunhoConferencia(JSON.stringify({ filialId: 3, contagens: {}, gravados: [] })),
    ).toBeNull()
    expect(desserializarRascunhoConferencia(JSON.stringify({ filialId: 3 }))).toBeNull()
  })

  it('O QUE JÁ FOI GRAVADO POR ITEM não viaja no rascunho — é estado de sessão', () => {
    // Decisão da 2ª revisão adversarial: depois de um F5 os saldos que o servidor
    // manda JÁ incluem o que esta conferência escreveu, e a base congelada é
    // recapturada deles. Restaurar o acumulado descontaria a mesma escrita duas
    // vezes e o operador veria diferenças que não existem.
    const r = desserializarRascunhoConferencia(
      JSON.stringify({ filialId: 3, contagens: { 1: '5' }, gravados: [4, 9], jaEscrito: { 4: 2 } }),
    )
    expect(r).toEqual({
      filialId: 3,
      contagens: { 1: '5' },
      registrou: false,
      observacao: '',
      iniciadaEm: '',
    })
  })

  it('contagem com chave ou valor fora de forma é descartada, o resto sobrevive', () => {
    const r = desserializarRascunhoConferencia(
      JSON.stringify({
        filialId: 3,
        contagens: { 1: '14', abc: '5', '-2': '3', 0: '1', 9: 7, 10: null },
      }),
    )
    expect(r?.contagens).toEqual({ 1: '14' })
  })

  it('contagens não-objeto (array, string, número) viram mapa vazio', () => {
    // `registrou: true` mantém o rascunho VIVO para a asserção poder olhar as
    // contagens — sem ele, um rascunho sem contagem nenhuma é descartado inteiro
    // (o que também está certo, e é o teste logo acima).
    for (const contagens of [[], 'x', 5, null]) {
      const bruto = JSON.stringify({ filialId: 3, contagens, registrou: true })
      expect(desserializarRascunhoConferencia(bruto)?.contagens, JSON.stringify(contagens)).toEqual(
        {},
      )
    }
  })

  it('campo desconhecido no storage é simplesmente ignorado', () => {
    const r = desserializarRascunhoConferencia(
      JSON.stringify({ filialId: 3, contagens: { 1: '1' }, gravados: 'x', qualquerCoisa: 42 }),
    )
    expect(Object.keys(r ?? {}).sort()).toEqual([
      'contagens',
      'filialId',
      'iniciadaEm',
      'observacao',
      'registrou',
    ])
  })

  it('NÃO valida o texto da contagem — quem julga é contagemDaLinha, uma régua só', () => {
    // Lixo digitável ('abc', '-2') chega intacto ao formulário e é a tela que o
    // mostra e o descarta na hora de somar. Duplicar a régua aqui abriria a
    // chance de as duas discordarem.
    const r = desserializarRascunhoConferencia(
      JSON.stringify({ filialId: 3, contagens: { 1: 'abc', 2: '-2' } }),
    )
    expect(r?.contagens).toEqual({ 1: 'abc', 2: '-2' })
  })

  it('não deixa poluição de Object.prototype virar contagem', () => {
    const r = desserializarRascunhoConferencia(
      JSON.stringify({ filialId: 3, contagens: { toString: '9', constructor: '9', 1: '1' } }),
    )
    expect(r?.contagens).toEqual({ 1: '1' })
  })

  it('observação e iniciadaEm ausentes viram string vazia (nunca "undefined")', () => {
    const r = desserializarRascunhoConferencia(
      JSON.stringify({ filialId: 3, contagens: { 1: '1' } }),
    )
    expect(r?.observacao).toBe('')
    expect(r?.iniciadaEm).toBe('')
  })
})

describe('horaDoRascunho', () => {
  it('formata HH:mm com dois dígitos', () => {
    const iso = new Date(2026, 7, 9, 9, 5).toISOString()
    expect(horaDoRascunho(iso)).toBe('09:05')
  })

  it('ausente ou inválido devolve null — nunca "Invalid Date" na tela', () => {
    for (const v of [null, undefined, '', 'ontem', '2026-13-45T99:99:99Z']) {
      expect(horaDoRascunho(v), String(v)).toBeNull()
    }
  })
})

describe('registrou (a marca que sustenta o "Encerrar conferência")', () => {
  it('ausente vira false — nunca undefined vazando para a tela', () => {
    const r = desserializarRascunhoConferencia(
      JSON.stringify({ filialId: 3, contagens: { 1: '1' } }),
    )
    expect(r?.registrou).toBe(false)
  })

  it('só `true` literal conta; qualquer outro valor é false', () => {
    for (const v of ['true', 1, {}, null, 'sim']) {
      const r = desserializarRascunhoConferencia(
        JSON.stringify({ filialId: 3, contagens: { 1: '1' }, registrou: v }),
      )
      expect(r?.registrou, JSON.stringify(v)).toBe(false)
    }
  })

  it('rascunho SÓ com registrou sobrevive — é a conferência toda corrigida e reenviada', () => {
    // Sem esta linha, corrigir a última contagem gravada apagaria o rascunho e o
    // botão "Encerrar conferência" sumiria (o furo que a marca existe para fechar).
    const r = desserializarRascunhoConferencia(
      JSON.stringify({ filialId: 3, contagens: {}, registrou: true }),
    )
    expect(r?.registrou).toBe(true)
    expect(r?.contagens).toEqual({})
  })
})
