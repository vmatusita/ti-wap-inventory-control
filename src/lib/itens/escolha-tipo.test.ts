import { describe, expect, it } from 'vitest'

import { TIPO_LANCAMENTO_META, type TipoLancamento } from '@/lib/dominio'
import { planejarEstorno } from '@/lib/itens/estorno'
import {
  GRUPOS_ESCOLHA,
  MSG_ESCOLHA_TIPO,
  PERGUNTA_ESCOLHA,
  TAREFA_DO_TIPO,
  TIPOS_OFERECIDOS,
  grupoDoTipo,
  grupoPorChave,
} from '@/lib/itens/escolha-tipo'

const TODOS = Object.keys(TIPO_LANCAMENTO_META) as TipoLancamento[]

describe('grupos de escolha do tipo', () => {
  // ⚠ ESTE BLOCO MUDOU NA F41, e mudou porque a REGRA mudou — não para ficar verde.
  // Até 30/08/2026 os grupos "saiu" e "voltou" ofereciam DOIS tipos cada, e a
  // segunda pergunta desempatava o par. A decisão J1 (31/08/2026) tirou o par
  // reserva/liberacao da tela: sem ele não há o que desempatar, a segunda pergunta
  // morreu e cada grupo passou a oferecer UM tipo. Ata em docs/DECISOES.md.
  //
  // O que NÃO mudou é a cobrança: os SEIS tipos continuam tendo grupo (agora por
  // `tiposHistoricos`), porque o histórico não se apaga e o filtro precisa
  // alcançá-los.

  it('todo tipo de lançamento aparece em exatamente um grupo (contando o histórico)', () => {
    const vistos = GRUPOS_ESCOLHA.flatMap((g) => g.tiposHistoricos)
    expect([...vistos].sort()).toEqual([...TODOS].sort())
    expect(new Set(vistos).size).toBe(vistos.length)
  })

  it('a tela OFERECE quatro tipos, um por grupo — as palavras do ativo', () => {
    expect(TIPOS_OFERECIDOS).toEqual(['entrada', 'saida', 'retorno', 'ajuste'])
    for (const g of GRUPOS_ESCOLHA) expect(g.tipos.length, g.chave).toBe(1)
  })

  it('reserva e liberacao NÃO são oferecidas — só existem no histórico', () => {
    // É o critério 10 da F41, provado na fonte: nenhuma tela oferece o par que
    // prendia a unidade a um chamado sem caminho de volta.
    expect(TIPOS_OFERECIDOS).not.toContain('reserva')
    expect(TIPOS_OFERECIDOS).not.toContain('liberacao')
    expect(grupoDoTipo('reserva').chave).toBe('saiu')
    expect(grupoDoTipo('liberacao').chave).toBe('voltou')
  })

  it('nenhum grupo tem segunda pergunta (ela morreu com o par reserva/liberacao)', () => {
    for (const g of GRUPOS_ESCOLHA) {
      expect(g.pergunta, g.chave).toBeNull()
      // A invariante que sobrevive à mudança: pergunta e pluralidade andam juntas.
      // Se um grupo voltar a oferecer dois tipos, ele PRECISA voltar a perguntar.
      if (g.tipos.length > 1) expect(g.pergunta, g.chave).toBeTruthy()
    }
  })

  it('"saiu" e "voltou" continuam espelhos — pelo ESTORNO, não pela posição', () => {
    // A prova da correspondência sempre foi o estorno: o inverso do tipo oferecido
    // em "saiu" é o tipo oferecido em "voltou" (saida↔retorno), e o mesmo vale para
    // o par histórico (reserva↔liberacao), que continua coerente mesmo fora da tela.
    const saiu = grupoPorChave('saiu')
    const voltou = grupoPorChave('voltou')
    expect(saiu.tiposHistoricos.length).toBe(voltou.tiposHistoricos.length)
    saiu.tiposHistoricos.forEach((t, i) => {
      const inverso = planejarEstorno(
        { tipo: t, quantidade: 1, chamado: '123', observacao: null },
        null,
      ).tipo
      expect(inverso, `o inverso de ${t} deveria estar em voltou[${i}]`).toBe(
        voltou.tiposHistoricos[i],
      )
    })
  })

  it('grupoDoTipo devolve o grupo certo para os seis tipos', () => {
    for (const g of GRUPOS_ESCOLHA) {
      for (const t of g.tiposHistoricos) expect(grupoDoTipo(t).chave).toBe(g.chave)
    }
  })

  it('o rótulo de cada grupo é o rótulo OFICIAL do tipo que ele oferece', () => {
    // A F41 acabou com os apelidos ("Chegou", "Saiu da prateleira"): o botão diz a
    // mesma palavra que a pílula do histórico e que o tipo do ativo. Se alguém
    // mudar um dos dois lados sozinho, quebra aqui.
    for (const g of GRUPOS_ESCOLHA) {
      expect(g.rotulo, g.chave).toBe(TIPO_LANCAMENTO_META[g.tipos[0]].rotulo)
    }
  })

  it('toda tarefa e todo rótulo têm texto (linguagem de operador, nunca vazio)', () => {
    expect(PERGUNTA_ESCOLHA.trim().length).toBeGreaterThan(0)
    expect(MSG_ESCOLHA_TIPO.trim().length).toBeGreaterThan(0)
    for (const g of GRUPOS_ESCOLHA) expect(g.rotulo.trim().length, g.chave).toBeGreaterThan(0)
    for (const t of TODOS) expect(TAREFA_DO_TIPO[t].trim().length, t).toBeGreaterThan(0)
  })

  it('as tarefas não repetem texto entre tipos (cada resposta é uma escolha distinta)', () => {
    const textos = TODOS.map((t) => TAREFA_DO_TIPO[t])
    expect(new Set(textos).size).toBe(textos.length)
  })

  it('grupoPorChave recusa chave desconhecida', () => {
    expect(() => grupoPorChave('outro' as never)).toThrow()
  })
})
