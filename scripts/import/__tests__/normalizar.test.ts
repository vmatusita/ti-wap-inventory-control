// Testes do motor de normalização da F4 — dados 100% SINTÉTICOS (regra 2 do
// CLAUDE.md): nenhum nome, patrimônio ou linha das planilhas reais. Os padrões
// de sujeira reproduzem a ESTRUTURA descrita em docs/ANALISE-PLANILHA-F4.md.
import { describe, expect, it } from 'vitest'
import {
  destinoTransferencia,
  detectarLayout,
  estadoPlanilha,
  extrairChamado,
  limparCampo,
  mapearMotivoDevolucao,
  mapearMotivoSaida,
  mapearTermo,
  mapearUnidade,
  normalizarCategoria,
  normalizarHeader,
  normalizarServiceTag,
  parseColaboradorSetor,
  parseData,
  parseItensFaltantes,
  parsePatrimonio,
  statusAposMovimentacao,
} from '../normalizar'

const HOJE = '2026-07-15'

describe('normalizarHeader / detectarLayout', () => {
  it('normaliza header com `:` e espaços à direita', () => {
    expect(normalizarHeader('Site:')).toBe('site')
    expect(normalizarHeader('Observação: ')).toBe('observacao')
    expect(normalizarHeader('Service Tag')).toBe('service tag')
    expect(normalizarHeader('Service tag')).toBe('service tag')
  })

  it('reconhece o layout Matriz (18 colunas)', () => {
    const h = 'Site:;Marca:;Tipo:;Modelo:;Fornecedor:;Service tag;Patrimônio;Memoria;Armazenamento;Processador;Hostname;Data de Entrega:;Status;Situação;Data de Inclusão;Colaborador;Termo de Ativos;Observação:'
    expect(detectarLayout(h.split(';'))).toBe('matriz')
  })

  it('reconhece o layout CD (16 colunas, sem Data de Entrega/Termo) tolerando colunas vazias à direita', () => {
    const h = 'Site:;Marca:;Tipo:;Modelo:;Fornecedor;Service Tag;Patrimônio;Memoria;Armazenamento;Processador;Hostname;Status;Situação;Data de Inclusão;Colaborador;Observação:;;'
    expect(detectarLayout(h.split(';'))).toBe('cd')
  })

  it('reconhece o layout das filiais (20 colunas, com Grade e GLPI)', () => {
    const h = 'Site:;Marca:;Tipo:;Modelo:;Grade;Fornecedor:;Service Tag;Patrimônio;Memoria;Armazenamento;Processador;Hostname;Data de Entrega:;Status;Situação;Data de Inclusão;Colaborador;GLPI;Termo de Ativos;Observação:'
    expect(detectarLayout(h.split(';'))).toBe('filial')
  })

  it('reconhece Saída e Devolução; header desconhecido → null', () => {
    expect(detectarLayout('Data da Saída;Unidade;Categoria;Marca / Modelo;Patrimônio;Tipo de Movimentação;Chamado;Colaborador/Setor;Tipo;Termo Assinado;;'.split(';'))).toBe('saida')
    expect(detectarLayout('Data da devolução;Unidade;Categoria;Marca / Modelo;Patrimônio;Colaborador;Tipo de entrada;Itens faltantes;Setor;Tipo'.split(';'))).toBe('devolucao')
    expect(detectarLayout(['Coluna A', 'Coluna B'])).toBeNull()
  })
})

describe('parsePatrimonio', () => {
  it('canoniza prefixo + zeros (WAP8401 → WAP0008401)', () => {
    const r = parsePatrimonio('WAP8401')
    expect(r).toMatchObject({ ok: true, canonico: 'WAP0008401' })
  })

  it('canoniza dígitos a mais (LEA00008402 → LEA0008402)', () => {
    expect(parsePatrimonio('LEA00008402')).toMatchObject({ ok: true, canonico: 'LEA0008402' })
  })

  it('corrige o typo de prefixo STFC → STF', () => {
    const r = parsePatrimonio('STFC0008403')
    expect(r).toMatchObject({ ok: true, canonico: 'STF0008403', prefixoCorrigido: true })
  })

  it('só dígitos: infere o prefixo pelo Hostname da própria linha', () => {
    const r = parsePatrimonio('8404', 'PRO0008404')
    expect(r).toMatchObject({ ok: true, canonico: 'PRO0008404', inferidoPor: 'hostname' })
  })

  it('só dígitos com hostname de número DIFERENTE: não infere', () => {
    const r = parsePatrimonio('8405', 'PRO0009999')
    expect(r).toMatchObject({ ok: false, semPatrimonio: false, motivo: 'bare_sem_inferencia' })
  })

  it('só dígitos: match único contra os já vistos', () => {
    const vistos = new Set(['TEC0008406', 'WAP0009000'])
    expect(parsePatrimonio('8406', null, vistos)).toMatchObject({ ok: true, canonico: 'TEC0008406', inferidoPor: 'vistos' })
  })

  it('só dígitos ambíguo entre prefixos (LEA×PRO com mesmo número) → falha', () => {
    const vistos = new Set(['LEA0008407', 'PRO0008407'])
    expect(parsePatrimonio('8407', null, vistos)).toMatchObject({ ok: false, motivo: 'bare_ambiguo' })
  })

  it('vazio / N/A / "SEM PATRIMONIO" → semPatrimonio', () => {
    for (const v of ['', 'N/A', '-', 'SEM PATRIMONIO', 'sem patrimônio', '   ']) {
      expect(parsePatrimonio(v)).toMatchObject({ ok: false, semPatrimonio: true })
    }
  })

  it('sufixo alfabético (tipo LOC) e texto livre → nao_parseavel', () => {
    expect(parsePatrimonio('STF008LOC')).toMatchObject({ ok: false, motivo: 'nao_parseavel' })
    expect(parsePatrimonio('WAPteste-maquina')).toMatchObject({ ok: false, motivo: 'nao_parseavel' })
  })
})

describe('parseData', () => {
  it('dd/mm/aaaa e variações com espaços', () => {
    expect(parseData('05/01/2026', HOJE)).toMatchObject({ iso: '2026-01-05', invalida: false, futura: false })
    expect(parseData(' 5/1/2026 ', HOJE)).toMatchObject({ iso: '2026-01-05' })
  })

  it('vazio/N-A → null SEM flag; lixo → null + invalida', () => {
    expect(parseData('', HOJE)).toMatchObject({ iso: null, invalida: false })
    expect(parseData('N/A', HOJE)).toMatchObject({ iso: null, invalida: false })
    for (const lixo of ['#######', 'XX', 'fulana', '24/06/205', '19/209/2025', '01/set', 'ABC1234']) {
      expect(parseData(lixo, HOJE), lixo).toMatchObject({ iso: null, invalida: true })
    }
  })

  it('data impossível (31/02) → invalida; data futura → futura=true', () => {
    expect(parseData('31/02/2026', HOJE)).toMatchObject({ iso: null, invalida: true })
    expect(parseData('20/07/2026', HOJE)).toMatchObject({ iso: '2026-07-20', futura: true })
  })
})

describe('mapearUnidade (De→Para ampliado 15/07/2026)', () => {
  it('mapeia todas as grafias reais para as 5 filiais oficiais', () => {
    expect(mapearUnidade('Serra Park')).toBe('Serra')
    expect(mapearUnidade('Serra')).toBe('Serra')
    expect(mapearUnidade('Filial-CE')).toBe('Eusébio')
    expect(mapearUnidade('Eusebio')).toBe('Eusébio')
    expect(mapearUnidade('CD-AFP')).toBe('CD-Afonso Pena')
    expect(mapearUnidade('CD-PENA')).toBe('CD-Afonso Pena')
    expect(mapearUnidade('Afonso Pena')).toBe('CD-Afonso Pena')
    expect(mapearUnidade('Matriz ')).toBe('Matriz')
    expect(mapearUnidade('Linhares')).toBe('Linhares')
    expect(mapearUnidade('Filial Desconhecida')).toBeNull()
  })
})

describe('mapearMotivoSaida', () => {
  it('vocabulário da spec §5 (com typos reais)', () => {
    expect(mapearMotivoSaida('Nova Contratação').motivo).toBe('novo_colaborador')
    expect(mapearMotivoSaida('Associado ao colaborador').motivo).toBe('novo_colaborador')
    expect(mapearMotivoSaida('Toca').motivo).toBe('troca_upgrade')
    expect(mapearMotivoSaida('Adicional de Monitor ').motivo).toBe('monitor_adicional')
    expect(mapearMotivoSaida('Uso interno').motivo).toBe('uso_compartilhado')
    expect(mapearMotivoSaida('Troca de titular').motivo).toBe('troca_titular')
  })

  it('"Transferência Uni." e "Empréstimo" reclassificam o TIPO (não são motivos)', () => {
    expect(mapearMotivoSaida('Transferência Uni.')).toMatchObject({ tipo: 'transferencia', motivo: null })
    expect(mapearMotivoSaida('Empréstimo')).toMatchObject({ tipo: 'emprestimo', motivo: null })
    expect(mapearMotivoSaida('Emprestimo')).toMatchObject({ tipo: 'emprestimo' })
  })

  it('vazio/`-`/`XX` → outro + motivo_vazio (não bloqueia)', () => {
    for (const v of ['', '-', 'XX']) {
      expect(mapearMotivoSaida(v)).toMatchObject({ tipo: 'saida', motivo: 'outro', aviso: 'motivo_vazio' })
    }
  })

  it('texto livre → outro + motivo_desconhecido com texto preservado', () => {
    const r = mapearMotivoSaida('Solicitação avulsa do aparelho')
    expect(r).toMatchObject({ motivo: 'outro', aviso: 'motivo_desconhecido', preservarTexto: 'Solicitação avulsa do aparelho' })
  })
})

describe('mapearMotivoDevolucao', () => {
  it('vocabulário com typos reais (Deligamento, Emprétimo)', () => {
    expect(mapearMotivoDevolucao('Deligamento').motivo).toBe('desligamento')
    expect(mapearMotivoDevolucao('Desligamento ').motivo).toBe('desligamento')
    expect(mapearMotivoDevolucao('Emprétimo ').motivo).toBe('fim_emprestimo')
    expect(mapearMotivoDevolucao('Troca/Upgrade').motivo).toBe('troca_upgrade')
    expect(mapearMotivoDevolucao('ASSISTÊNCIA').motivo).toBe('manutencao')
  })

  it('texto livre → outro + aviso', () => {
    expect(mapearMotivoDevolucao('Estava no setor')).toMatchObject({ motivo: 'outro', aviso: 'motivo_desconhecido' })
  })
})

describe('mapearTermo', () => {
  it('sim/Sim!/enviado/data/N-A/chamado', () => {
    expect(mapearTermo('SIM', HOJE)).toMatchObject({ status: 'sim' })
    expect(mapearTermo('Sim!', HOJE)).toMatchObject({ status: 'sim' })
    expect(mapearTermo('Termo Enviado', HOJE)).toMatchObject({ status: 'enviado' })
    expect(mapearTermo('15/12/2025', HOJE)).toMatchObject({ status: 'enviado', data: '2025-12-15' })
    expect(mapearTermo('N/A', HOJE)).toMatchObject({ status: 'nao', aviso: null })
    expect(mapearTermo('', HOJE)).toMatchObject({ status: 'nao', aviso: null })
    expect(mapearTermo('2413', HOJE)).toMatchObject({ status: 'nao', aviso: 'termo_invalido' })
  })
})

describe('estadoPlanilha (precedência Situação > Status)', () => {
  it('Situação preenchida vence o Status', () => {
    expect(estadoPlanilha('Estoque', 'Descarte')).toBe('descartado')
    expect(estadoPlanilha('Estoque', 'Manutenção')).toBe('em_manutencao')
    expect(estadoPlanilha('Estoque', 'Defasada')).toBe('defasado')
    expect(estadoPlanilha('RT Wap', 'Posse Wap')).toBe('defasado')
    expect(estadoPlanilha('Remanejo', 'Saída ')).toBe('em_uso')
  })

  it('Situação vazia → cai no Status', () => {
    expect(estadoPlanilha('Remanejo', '')).toBe('em_uso')
    expect(estadoPlanilha('Estoque', '')).toBe('em_estoque')
    expect(estadoPlanilha('Empréstimo', '')).toBe('emprestado')
    expect(estadoPlanilha('Descarte', '')).toBe('descartado')
  })

  it('Reservada/Validar/Guardada e valor desconhecido', () => {
    expect(estadoPlanilha('Estoque', 'Reservada')).toBe('reservado')
    expect(estadoPlanilha('Estoque', 'Validar')).toBe('em_triagem')
    expect(estadoPlanilha('Estoque', 'Guardada')).toBe('em_estoque')
    expect(estadoPlanilha('Sumiu', '')).toBeNull()
  })
})

describe('statusAposMovimentacao (espelho da migration 0109)', () => {
  it('transições válidas', () => {
    expect(statusAposMovimentacao('em_estoque', 'compra')).toBe('em_estoque')
    expect(statusAposMovimentacao('em_estoque', 'saida')).toBe('em_uso')
    expect(statusAposMovimentacao('em_triagem', 'saida')).toBe('em_uso')
    // F34: a devolucao passa a pousar direto em em_estoque (era em_triagem) — o REQUISITO
    // mudou (migration 0109, revogação parcial da doutrina antiga de triagem automática).
    expect(statusAposMovimentacao('em_uso', 'devolucao')).toBe('em_estoque')
    expect(statusAposMovimentacao('em_triagem', 'triagem_ok')).toBe('em_estoque')
    expect(statusAposMovimentacao('em_uso', 'transferencia')).toBe('em_uso')
    expect(statusAposMovimentacao('em_estoque', 'ajuste', 'defasado')).toBe('defasado')
    // F34: envio_triagem — a triagem manual opt-in (em_estoque -> em_triagem).
    expect(statusAposMovimentacao('em_estoque', 'envio_triagem')).toBe('em_triagem')
    // F34: re-reserva — reserva também vale sobre reservado, permanecendo reservado
    // (troca de colaborador/setor/chamado sem estorno e sem ajuste).
    expect(statusAposMovimentacao('reservado', 'reserva')).toBe('reservado')
  })

  it('transições inválidas → null (replay pula com estado_divergente)', () => {
    expect(statusAposMovimentacao('em_uso', 'saida')).toBeNull()
    // Caso PRÉ-F34 que continua valendo: a origem de `devolucao` (em_uso/emprestado) não
    // mudou — só o destino (agora em_estoque, ver acima) — então em_estoque->devolucao
    // segue inválida.
    expect(statusAposMovimentacao('em_estoque', 'devolucao')).toBeNull()
    expect(statusAposMovimentacao('descartado', 'transferencia')).toBeNull()
    expect(statusAposMovimentacao('em_uso', 'compra')).toBeNull()
    // F34: envio_triagem só parte de em_estoque — de em_uso/reservado/etc. é inválida.
    expect(statusAposMovimentacao('em_uso', 'envio_triagem')).toBeNull()
    expect(statusAposMovimentacao('reservado', 'envio_triagem')).toBeNull()
  })
})

describe('campos auxiliares', () => {
  it('extrairChamado', () => {
    expect(extrairChamado('Chamado 6766')).toBe('6766')
    expect(extrairChamado('2408289100')).toBe('2408289100')
    expect(extrairChamado('N/A')).toBeNull()
    expect(extrairChamado('Não')).toBeNull()
    expect(extrairChamado('Está em outra filial')).toBeNull()
  })

  it('parseColaboradorSetor', () => {
    expect(parseColaboradorSetor('Fulana de Tal / Logística')).toMatchObject({ colaborador: 'Fulana de Tal', setor: 'Logística', resto: null })
    expect(parseColaboradorSetor('Beltrano')).toMatchObject({ colaborador: 'Beltrano', setor: null })
    expect(parseColaboradorSetor('Fulano / Produção / Empréstimo de máquina')).toMatchObject({ colaborador: 'Fulano', setor: 'Produção', resto: 'Empréstimo de máquina' })
    expect(parseColaboradorSetor('')).toMatchObject({ colaborador: null, setor: null })
  })

  it('parseItensFaltantes: lista real × "Certo" × texto livre', () => {
    expect(parseItensFaltantes('Mochila, MousePad')).toMatchObject({ itens: ['Mochila', 'MousePad'], textoLivre: null })
    expect(parseItensFaltantes('Certo')).toMatchObject({ itens: null, textoLivre: null })
    expect(parseItensFaltantes('Entregue completo e instalado')).toMatchObject({ itens: null })
    expect(parseItensFaltantes('Troca de maquina/Upgrade')).toMatchObject({ itens: null, textoLivre: 'Troca de maquina/Upgrade' })
    expect(parseItensFaltantes('Sem Carregador')).toMatchObject({ itens: ['Sem Carregador'] })
  })

  it('destinoTransferencia acha a filial no texto', () => {
    expect(destinoTransferencia('Transferência Linhares')).toBe('Linhares')
    expect(destinoTransferencia('Transferência Filial Eusébio - responsável em viagem')).toBe('Eusébio')
    expect(destinoTransferencia('Estoque AFONSO PENA')).toBe('CD-Afonso Pena')
    expect(destinoTransferencia('Transferência para Matriz - Descarte')).toBe('Matriz')
    expect(destinoTransferencia('Fulano / TI')).toBeNull()
  })

  it('normalizarCategoria e limparCampo', () => {
    expect(normalizarCategoria('Celular ')).toBe('celular')
    expect(normalizarCategoria('Teclado')).toBe('outro')
    expect(limparCampo(' X ')).toBeNull()
    expect(limparCampo('valor real')).toBe('valor real')
  })

  it('normalizarServiceTag remove quebras de linha internas (caso real de célula multilinha)', () => {
    expect(normalizarServiceTag('\nAB12CD34')).toBe('AB12CD34')
    expect(normalizarServiceTag('-')).toBeNull()
    expect(normalizarServiceTag('0')).toBeNull()
  })
})
