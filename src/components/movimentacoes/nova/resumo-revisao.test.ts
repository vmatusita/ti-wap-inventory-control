import { describe, it, expect } from 'vitest'
import {
  montarResumoConfig,
  type ContextoResumoConfig,
} from '@/components/movimentacoes/nova/resumo-revisao'
import {
  configDaContrapartida,
  contrapartidaPadrao,
} from '@/components/movimentacoes/nova/troca-upgrade'
import type { Config } from '@/components/movimentacoes/nova/config'
import type { Filial } from '@/lib/queries/filiais'
import type { Motivo } from '@/lib/queries/motivos'

const DATA_OK = '2026-08-05'

// Config totalmente preenchida — cada teste ajusta o `tipo` e observa quais
// linhas SOBREVIVEM ao filtro de `campoAplica` (o resto é ruído de propósito:
// prova que o módulo filtra pelo TIPO, não pelo "campo tem valor").
function cfg(over: Partial<Config>): Config {
  return {
    data: DATA_OK,
    tipo: '',
    motivo: 'desligamento',
    colaborador: 'Fulano de Tal',
    setor: 'TI',
    chamado: '123',
    chamadoFornecedor: 'OS-FORN-1',
    termo: 'sim',
    termoData: DATA_OK,
    observacao: 'Levou o notebook para casa',
    filialDestinoId: '2',
    itensFaltantes: ['mouse'],
    ...over,
  }
}

const FILIAIS: Filial[] = [
  { id: 1, slug: 'matriz', nome: 'Matriz', cidade: 'Cidade A' },
  { id: 2, slug: 'filial-b', nome: 'Filial B', cidade: 'Cidade B' },
]

const MOTIVOS: Motivo[] = [
  { codigo: 'desligamento', rotulo: 'Desligamento', aplica_a: ['saida', 'devolucao'] },
]

// F39 — o vocabulário dos itens faltantes deixou de ser constante do código e
// passou a vir do catálogo `tipos_item` (F37), por parâmetro. Os RÓTULOS não
// mudaram: a migration 0114 semeou os 7 slugs históricos com exatamente os
// mesmos rótulos da constante que saiu. Só a assinatura mudou.
const ROTULOS_TIPO = {
  carregador: 'Carregador',
  mochila: 'Mochila',
  mouse: 'Mouse',
  teclado: 'Teclado',
  mousepad: 'Mousepad',
  fone: 'Fone de ouvido',
  cabo: 'Cabo',
}

function ctx(over: Partial<ContextoResumoConfig> = {}): ContextoResumoConfig {
  return {
    statusResultante: '',
    filiais: FILIAIS,
    motivos: MOTIVOS,
    rotulosTipo: ROTULOS_TIPO,
    ...over,
  }
}

describe('montarResumoConfig — Data sempre em destaque', () => {
  it('a Data é a primeira linha e vem com destaque:true', () => {
    const resumo = montarResumoConfig(cfg({ tipo: 'saida' }), ctx())
    expect(resumo[0]).toEqual({ rotulo: 'Data', valor: '05/08/2026', destaque: true })
  })

  it('config sem tipo ainda mostra a Data (defensivo: não derruba com config vazia)', () => {
    const resumo = montarResumoConfig(cfg({ tipo: '', motivo: '', colaborador: '', setor: '', chamado: '', chamadoFornecedor: '', termo: '', termoData: '', observacao: '', filialDestinoId: '', itensFaltantes: [] }), ctx())
    expect(resumo).toEqual([{ rotulo: 'Data', valor: '05/08/2026', destaque: true }])
  })
})

describe('montarResumoConfig — filtra por campoAplica (não mostra o que o tipo não usa)', () => {
  it('saída: Data, Movimentação, Motivo, Colaborador/Setor, Termo, Chamado, Observação — nesta ORDEM', () => {
    const resumo = montarResumoConfig(cfg({ tipo: 'saida' }), ctx())
    expect(resumo.map((r) => r.rotulo)).toEqual([
      'Data',
      'Movimentação',
      'Motivo',
      'Colaborador / Setor',
      'Termo',
      'Chamado',
      'Observação',
    ])
  })

  it('devolução: sem colaborador/setor/chamado/termo (a matriz não os coleta) — ganha Itens faltantes', () => {
    const resumo = montarResumoConfig(cfg({ tipo: 'devolucao' }), ctx())
    expect(resumo.map((r) => r.rotulo)).toEqual([
      'Data',
      'Movimentação',
      'Motivo',
      'Observação',
      'Itens faltantes',
    ])
  })

  it('transferência: só Filial destino entre os condicionais (nem motivo, nem termo)', () => {
    const resumo = montarResumoConfig(cfg({ tipo: 'transferencia' }), ctx())
    expect(resumo.map((r) => r.rotulo)).toEqual([
      'Data',
      'Movimentação',
      'Filial destino',
      'Observação',
    ])
    expect(resumo.find((r) => r.rotulo === 'Filial destino')?.valor).toBe('Filial B')
  })

  it('ajuste: sem Motivo (a matriz do ajuste não coleta motivo) — ganha Status novo', () => {
    const resumo = montarResumoConfig(
      cfg({ tipo: 'ajuste', observacao: 'Justificativa do ajuste manual' }),
      ctx({ statusResultante: 'em_manutencao' }),
    )
    expect(resumo.map((r) => r.rotulo)).toEqual(['Data', 'Movimentação', 'Observação', 'Status novo'])
    expect(resumo.find((r) => r.rotulo === 'Status novo')?.valor).toBe('Em manutenção')
  })

  it('ajuste sem statusResultante escolhido ainda: a linha "Status novo" não aparece', () => {
    const resumo = montarResumoConfig(cfg({ tipo: 'ajuste' }), ctx({ statusResultante: '' }))
    expect(resumo.some((r) => r.rotulo === 'Status novo')).toBe(false)
  })

  it('envio_manutencao: Chamado do fornecedor aparece, Colaborador/Setor não', () => {
    const resumo = montarResumoConfig(cfg({ tipo: 'envio_manutencao' }), ctx())
    expect(resumo.map((r) => r.rotulo)).toEqual([
      'Data',
      'Movimentação',
      'Motivo',
      'Chamado',
      'Chamado do fornecedor',
      'Observação',
    ])
  })
})

describe('montarResumoConfig — campo aplicável mas VAZIO não entra (sem travessão)', () => {
  it('saída sem motivo/colaborador/setor/chamado/termo/observação preenchidos: só Data + Movimentação', () => {
    const resumo = montarResumoConfig(
      cfg({
        tipo: 'saida',
        motivo: '',
        colaborador: '',
        setor: '',
        chamado: '',
        termo: '',
        termoData: '',
        observacao: '',
      }),
      ctx(),
    )
    expect(resumo.map((r) => r.rotulo)).toEqual(['Data', 'Movimentação'])
  })

  it('Colaborador/Setor some quando só um dos dois some (mantém o outro, sem "—")', () => {
    const resumo = montarResumoConfig(cfg({ tipo: 'saida', colaborador: '', setor: 'Financeiro' }), ctx())
    expect(resumo.find((r) => r.rotulo === 'Colaborador / Setor')?.valor).toBe('Financeiro')
  })

  it('filial destino apontando para uma filial que não está na lista: a linha some (sem "?")', () => {
    const resumo = montarResumoConfig(cfg({ tipo: 'transferencia', filialDestinoId: '999' }), ctx())
    expect(resumo.some((r) => r.rotulo === 'Filial destino')).toBe(false)
  })
})

describe('montarResumoConfig — Termo combina status + data numa linha só', () => {
  it('só o status (sem data)', () => {
    const resumo = montarResumoConfig(cfg({ tipo: 'saida', termo: 'enviado', termoData: '' }), ctx())
    expect(resumo.find((r) => r.rotulo === 'Termo')?.valor).toBe('Enviado (sem assinatura)')
  })

  it('só a data (sem status escolhido)', () => {
    const resumo = montarResumoConfig(cfg({ tipo: 'saida', termo: '', termoData: DATA_OK }), ctx())
    expect(resumo.find((r) => r.rotulo === 'Termo')?.valor).toBe('05/08/2026')
  })

  it('status + data juntos', () => {
    const resumo = montarResumoConfig(cfg({ tipo: 'saida', termo: 'sim', termoData: DATA_OK }), ctx())
    expect(resumo.find((r) => r.rotulo === 'Termo')?.valor).toBe('Assinado · 05/08/2026')
  })
})

describe('montarResumoConfig — Motivo: rótulo do catálogo, com fallback pro código', () => {
  it('acha no catálogo → mostra o rótulo', () => {
    const resumo = montarResumoConfig(cfg({ tipo: 'saida', motivo: 'desligamento' }), ctx())
    expect(resumo.find((r) => r.rotulo === 'Motivo')?.valor).toBe('Desligamento')
  })

  it('motivo desativado/fora do catálogo → cai no próprio código (não trava a revisão)', () => {
    const resumo = montarResumoConfig(cfg({ tipo: 'saida', motivo: 'codigo_sumido' }), ctx())
    expect(resumo.find((r) => r.rotulo === 'Motivo')?.valor).toBe('codigo_sumido')
  })
})

describe('montarResumoConfig — Itens faltantes usa o rótulo do catálogo, não o código cru', () => {
  it('devolução com itens marcados', () => {
    const resumo = montarResumoConfig(
      cfg({ tipo: 'devolucao', itensFaltantes: ['mouse', 'carregador'] }),
      ctx(),
    )
    expect(resumo.find((r) => r.rotulo === 'Itens faltantes')?.valor).toBe('Mouse, Carregador')
  })

  it('slug histórico SEM tipo no catálogo continua legível (fallback pelo slug cru)', () => {
    // O mesmo fallback pelo slug cru de antes: `movimentacoes.itens_faltantes`
    // guarda texto livre, e um slug antigo sem tipo correspondente tem de aparecer
    // como está — nunca sumir.
    const resumo = montarResumoConfig(
      cfg({ tipo: 'devolucao', itensFaltantes: ['mouse', 'suporte_notebook'] }),
      ctx(),
    )
    expect(resumo.find((r) => r.rotulo === 'Itens faltantes')?.valor).toBe(
      'Mouse, suporte_notebook',
    )
  })

  it('checklist vazio: a linha não aparece', () => {
    const resumo = montarResumoConfig(cfg({ tipo: 'devolucao', itensFaltantes: [] }), ctx())
    expect(resumo.some((r) => r.rotulo === 'Itens faltantes')).toBe(false)
  })
})

describe('montarResumoConfig — compõe com a Config da contrapartida (F26, MOV-02)', () => {
  it('a metade "saída" da troca usa a MESMA função e o MESMO módulo de resumo', () => {
    const principal = cfg({ tipo: 'devolucao', motivo: 'troca_upgrade' })
    const contrapartida = contrapartidaPadrao({
      colaborador: 'Beltrana',
      termo: 'sim',
      termoData: DATA_OK,
    })
    const configOposta = configDaContrapartida(principal, contrapartida)
    // `configDaContrapartida` compartilha data/chamado/observação com a
    // metade principal (`cfg()` default): por isso aparecem aqui também.
    const resumo = montarResumoConfig(configOposta, ctx({ motivos: [] }))
    expect(resumo.map((r) => r.rotulo)).toEqual([
      'Data',
      'Movimentação',
      'Motivo',
      'Colaborador / Setor',
      'Termo',
      'Chamado',
      'Observação',
    ])
    expect(resumo.find((r) => r.rotulo === 'Movimentação')?.valor).toBe('Saída')
    // `motivos: []` no contexto → o código não é achado no catálogo e cai
    // no próprio código (mesmo comportamento do "motivo desativado" acima).
    expect(resumo.find((r) => r.rotulo === 'Motivo')?.valor).toBe('troca_upgrade')
    expect(resumo.find((r) => r.rotulo === 'Colaborador / Setor')?.valor).toBe('Beltrana')
    expect(resumo.find((r) => r.rotulo === 'Termo')?.valor).toBe('Assinado · 05/08/2026')
  })
})
