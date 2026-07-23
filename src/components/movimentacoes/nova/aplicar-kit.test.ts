import { describe, it, expect } from 'vitest'
import { decidirAplicacaoKit } from '@/components/movimentacoes/nova/aplicar-kit'
import { configPadrao, type Config } from '@/components/movimentacoes/nova/config'
import type { KitPayload } from '@/lib/validators/kit'

// Aplicar kit no passo 2 (F12 · M12). Dados 100% fictícios (CLAUDE.md).

function cfg(over: Partial<Config> = {}): Config {
  return { ...configPadrao(), ...over }
}

const KIT_SAIDA: KitPayload = {
  tipo: 'saida',
  motivo: 'novo_colaborador',
  termo: 'gerado',
  observacao: 'Kit fictício de novo colaborador',
  categorias: ['notebook', 'monitor', 'celular'],
}

describe('decidirAplicacaoKit — tipo fora da interseção do lote', () => {
  it('não aplica NADA e devolve o tipo do kit para a mensagem', () => {
    const d = decidirAplicacaoKit({
      payload: KIT_SAIDA,
      config: cfg({ tipo: 'devolucao', observacao: 'texto do operador' }),
      tiposValidos: ['devolucao', 'transferencia'],
      motivosDoTipo: ['novo_colaborador'],
    })
    expect(d.aplicar).toBe(false)
    expect(d).toEqual({ aplicar: false, tipoKit: 'saida' })
  })

  it('lote vazio (interseção vazia) também não aplica', () => {
    const d = decidirAplicacaoKit({
      payload: KIT_SAIDA,
      config: cfg(),
      tiposValidos: [],
      motivosDoTipo: [],
    })
    expect(d.aplicar).toBe(false)
  })
})

describe('decidirAplicacaoKit — aplicação normal', () => {
  it('escreve tipo, motivo, termo e observação do kit', () => {
    const d = decidirAplicacaoKit({
      payload: KIT_SAIDA,
      config: cfg(),
      tiposValidos: ['saida', 'emprestimo'],
      motivosDoTipo: ['novo_colaborador', 'troca_equipamento'],
    })
    if (!d.aplicar) throw new Error('deveria aplicar')
    expect(d.config.tipo).toBe('saida')
    expect(d.config.motivo).toBe('novo_colaborador')
    expect(d.config.termo).toBe('gerado')
    expect(d.config.observacao).toBe('Kit fictício de novo colaborador')
    expect(d.motivoDescartado).toBe(false)
    expect(d.trocouTipo).toBe(true)
  })

  it('kit sem motivo/termo/observação LIMPA os campos (aplicar é idempotente)', () => {
    const d = decidirAplicacaoKit({
      payload: { tipo: 'saida', categorias: ['notebook'] },
      config: cfg({
        tipo: 'saida',
        motivo: 'troca_equipamento',
        termo: 'sim',
        observacao: 'sobra do preenchimento anterior',
      }),
      tiposValidos: ['saida'],
      motivosDoTipo: ['troca_equipamento'],
    })
    if (!d.aplicar) throw new Error('deveria aplicar')
    expect(d.config.motivo).toBe('')
    expect(d.config.termo).toBe('')
    expect(d.config.observacao).toBe('')
    // Kit sem motivo não é motivo descartado — não havia motivo para descartar.
    expect(d.motivoDescartado).toBe(false)
  })

  // Quem o kit NÃO define fica de pé: colaborador, setor, chamado e a data da
  // movimentação. `termoData` NÃO entra nesta lista — ela viaja com o status do
  // termo, que o kit sobrescreve, e por isso é limpa junto (ver os dois testes
  // no fim do arquivo; a asserção original guardava justamente o bug).
  it('preserva os campos que o kit não define (colaborador, setor, chamado, data)', () => {
    const d = decidirAplicacaoKit({
      payload: KIT_SAIDA,
      config: cfg({
        colaborador: 'Fulano de Tal',
        setor: 'TI',
        chamado: '12345',
        data: '2026-07-20',
        termoData: '2026-07-19',
      }),
      tiposValidos: ['saida'],
      motivosDoTipo: ['novo_colaborador'],
    })
    if (!d.aplicar) throw new Error('deveria aplicar')
    expect(d.config.colaborador).toBe('Fulano de Tal')
    expect(d.config.setor).toBe('TI')
    expect(d.config.chamado).toBe('12345')
    expect(d.config.data).toBe('2026-07-20')
    expect(d.config.termoData).toBe('')
  })
})

describe('decidirAplicacaoKit — motivo que não se aplica mais', () => {
  it('limpa o motivo e sinaliza o descarte (motivo desativado depois do kit salvo)', () => {
    const d = decidirAplicacaoKit({
      payload: KIT_SAIDA,
      config: cfg(),
      tiposValidos: ['saida'],
      motivosDoTipo: ['troca_equipamento'], // 'novo_colaborador' saiu do ar
    })
    if (!d.aplicar) throw new Error('deveria aplicar')
    expect(d.config.motivo).toBe('')
    expect(d.motivoDescartado).toBe(true)
  })

  it('nenhum motivo disponível para o tipo → motivo limpo e sinalizado', () => {
    const d = decidirAplicacaoKit({
      payload: KIT_SAIDA,
      config: cfg(),
      tiposValidos: ['saida'],
      motivosDoTipo: [],
    })
    if (!d.aplicar) throw new Error('deveria aplicar')
    expect(d.config.motivo).toBe('')
    expect(d.motivoDescartado).toBe(true)
  })
})

describe('decidirAplicacaoKit — campos condicionais do tipo anterior', () => {
  it('troca de tipo limpa filial de destino e itens faltantes', () => {
    const d = decidirAplicacaoKit({
      payload: { tipo: 'saida', categorias: ['notebook'] },
      config: cfg({
        tipo: 'transferencia',
        filialDestinoId: '3',
        itensFaltantes: ['carregador'],
      }),
      tiposValidos: ['saida', 'transferencia'],
      motivosDoTipo: [],
    })
    if (!d.aplicar) throw new Error('deveria aplicar')
    expect(d.trocouTipo).toBe(true)
    expect(d.config.filialDestinoId).toBe('')
    expect(d.config.itensFaltantes).toEqual([])
  })

  it('mesmo tipo preserva o que o operador já tinha escolhido nesses campos', () => {
    const d = decidirAplicacaoKit({
      payload: { tipo: 'transferencia', categorias: ['monitor'] },
      config: cfg({ tipo: 'transferencia', filialDestinoId: '3' }),
      tiposValidos: ['transferencia'],
      motivosDoTipo: [],
    })
    if (!d.aplicar) throw new Error('deveria aplicar')
    expect(d.trocouTipo).toBe(false)
    expect(d.config.filialDestinoId).toBe('3')
  })

  // A data do termo viaja com o status do termo (`serializarCampo`) e o kit não
  // a carrega: aplicar um kit depois de "Repetir última" não pode herdar a data
  // do termo da OUTRA movimentação. (Revisão adversarial da F12.)
  it('limpa a DATA do termo, mesmo quando o kit traz um status de termo', () => {
    const d = decidirAplicacaoKit({
      payload: KIT_SAIDA,
      config: cfg({ tipo: 'saida', termo: 'sim', termoData: '2026-07-01' }),
      tiposValidos: ['saida'],
      motivosDoTipo: ['novo_colaborador'],
    })
    expect(d.aplicar).toBe(true)
    if (!d.aplicar) return
    expect(d.config.termo).toBe('gerado')
    expect(d.config.termoData).toBe('')
  })

  it('kit SEM termo não deixa data de termo órfã para trás', () => {
    const semTermo: KitPayload = { tipo: 'saida', categorias: ['notebook'] }
    const d = decidirAplicacaoKit({
      payload: semTermo,
      config: cfg({ tipo: 'saida', termo: 'sim', termoData: '2026-07-01' }),
      tiposValidos: ['saida'],
      motivosDoTipo: [],
    })
    expect(d.aplicar).toBe(true)
    if (!d.aplicar) return
    expect(d.config.termo).toBe('')
    expect(d.config.termoData).toBe('')
  })

  it('não muta a Config recebida', () => {
    const original = cfg({ tipo: 'transferencia', filialDestinoId: '3' })
    const copia = { ...original, itensFaltantes: [...original.itensFaltantes] }
    decidirAplicacaoKit({
      payload: KIT_SAIDA,
      config: original,
      tiposValidos: ['saida', 'transferencia'],
      motivosDoTipo: ['novo_colaborador'],
    })
    expect(original).toEqual(copia)
  })
})
