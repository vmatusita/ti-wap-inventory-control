import { describe, expect, it } from 'vitest'

import { TIPO_LANCAMENTO_META, type TipoLancamento } from '@/lib/dominio'
import { planejarEstorno } from '@/lib/itens/estorno'
import {
  GRUPOS_ESCOLHA,
  MSG_ESCOLHA_TIPO,
  PERGUNTA_ESCOLHA,
  TAREFA_DO_TIPO,
  grupoDoTipo,
  grupoPorChave,
} from '@/lib/itens/escolha-tipo'

const TODOS = Object.keys(TIPO_LANCAMENTO_META) as TipoLancamento[]

describe('grupos de escolha do tipo', () => {
  it('todo tipo de lançamento aparece em exatamente um grupo', () => {
    const vistos = GRUPOS_ESCOLHA.flatMap((g) => g.tipos)
    expect([...vistos].sort()).toEqual([...TODOS].sort())
    expect(new Set(vistos).size).toBe(vistos.length)
  })

  it('grupo com dois tipos tem a segunda pergunta; com um, não tem', () => {
    for (const g of GRUPOS_ESCOLHA) {
      if (g.tipos.length > 1) expect(g.pergunta, g.chave).toBeTruthy()
      else expect(g.pergunta, g.chave).toBeNull()
    }
  })

  it('"saiu" e "voltou" são espelhos: a mesma posição é a mesma resposta', () => {
    // A posição 0 é "pessoa" e a 1 é "chamado" nos DOIS grupos — é isso que faz
    // a resposta do operador escolher o par certo sem ele decorar vocabulário.
    const saiu = grupoPorChave('saiu')
    const voltou = grupoPorChave('voltou')
    expect(saiu.tipos.length).toBe(voltou.tipos.length)
    // A prova da correspondência é o ESTORNO: o inverso de cada tipo de "saiu"
    // tem de ser o tipo de "voltou" na MESMA posição (planejarEstorno é a fonte
    // da verdade do par — saida↔retorno, reserva↔liberacao).
    saiu.tipos.forEach((t, i) => {
      const inverso = planejarEstorno(
        { tipo: t, quantidade: 1, chamado: '123', observacao: null },
        null,
      ).tipo
      expect(inverso, `o inverso de ${t} deveria estar em voltou[${i}]`).toBe(voltou.tipos[i])
    })
  })

  it('grupoDoTipo devolve o grupo certo para os seis tipos', () => {
    for (const g of GRUPOS_ESCOLHA) {
      for (const t of g.tipos) expect(grupoDoTipo(t).chave).toBe(g.chave)
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
