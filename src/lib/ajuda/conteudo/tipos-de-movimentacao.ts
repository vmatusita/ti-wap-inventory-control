import { verbetesMovimentacao } from '@/lib/ajuda/derivacao'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'
import type { TipoMovimentacao } from '@/lib/dominio'
import type { CampoMovimentacao } from '@/lib/validators/movimentacao'

// Efeito de cada tipo de movimentacao na maquina de estados. O ROTULO vem de
// TIPO_META; aqui so o que o evento PROVOCA e a que estado leva.
const EFEITO_MOVIMENTACAO: Record<TipoMovimentacao, string> = {
  compra: 'Entrada de um ativo novo COMPRADO. Resultado: Em estoque.',
  troca:
    'Entrada do equipamento SUBSTITUTO que o fornecedor mandou no lugar do devolvido (nascimento do ativo, como a compra). Registrada só pela devolução ao fornecedor — nunca pelo formulário de nova movimentação. Aparece nas Entradas do relatório rotulada "Troca", nunca contada como compra (não foi comprado). Resultado: Em estoque.',
  saida: 'Entrega definitiva a um colaborador ou setor. Resultado: Em uso.',
  emprestimo: 'Entrega temporária, com devolução esperada. Resultado: Emprestado.',
  reserva: 'Separa o ativo para alguém sem entregar ainda. Resultado: Reservado.',
  devolucao:
    'O ativo volta da mão do colaborador para a TI. Resultado: Em triagem (aguarda conferência).',
  triagem_ok: 'Conferência aprovada — o ativo volta a ficar disponível. Resultado: Em estoque.',
  envio_manutencao: 'Enviado para conserto ou assistência. Resultado: Em manutenção.',
  retorno_manutencao: 'Voltou do conserto e está apto. Resultado: Em estoque.',
  marcar_defasado: 'Marca o ativo como obsoleto (fim de vida útil). Resultado: Defasado.',
  descarte: 'Baixa definitiva do ativo. Resultado: Descartado.',
  devolucao_fornecedor:
    'A manutenção não teve conserto: o fornecedor fica com o equipamento e o troca. Registra a baixa e, no mesmo passo, pode cadastrar o substituto (vinculado ao antigo). Só a partir de Em manutenção. Resultado: Devolvido ao fornecedor.',
  transferencia: 'Muda o ativo de filial. Mantém o status atual — só troca a filial.',
  ajuste:
    'Válvula de escape: corrige o status manualmente quando a realidade fugiu do fluxo. Exige o novo status e uma justificativa (mínimo 10 caracteres).',
  estorno:
    'Desfaz a ÚLTIMA movimentação e restaura o estado anterior do ativo. Feito pela linha do tempo da ficha, não pelo formulário de nova movimentação.',
}

// Rotulo pt-BR de cada campo condicional do formulario (a APLICABILIDADE vem de
// CAMPOS_POR_TIPO — aqui so o texto amigavel do nome do campo).
const ROTULO_CAMPO: Record<CampoMovimentacao, string> = {
  motivo: 'Motivo',
  colaborador: 'Colaborador',
  setor: 'Setor',
  chamado: 'Chamado',
  chamado_fornecedor: 'Chamado do fornecedor',
  termo: 'Termo',
  filial_destino: 'Filial de destino',
  status_resultante: 'Novo status',
  itens_faltantes: 'Checklist de itens faltantes',
  estorno_de: 'Movimentação de origem',
}

export const tiposDeMovimentacao: PaginaAjuda = {
  slug: 'tipos-de-movimentacao',
  titulo: 'Tipos de movimentação',
  resumo: 'Os 15 tipos: o que cada um provoca e que campos pede.',
  categoria: 'consultar',
  termos: ['tipo', 'evento', 'transicao', 'maquina de estados', 'campos', 'glossario'],
  legado: ['movimentacoes'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Cada tipo é um evento que leva o ativo de um estado a outro (a máquina de estados). O formulário só oferece os tipos válidos para o estado atual de cada ativo. Abaixo, o que cada um provoca e quais campos pede (os marcados com * são obrigatórios).',
    },
    {
      tipo: 'movimentacoes',
      itens: verbetesMovimentacao(EFEITO_MOVIMENTACAO, ROTULO_CAMPO),
    },
    { tipo: 'titulo', id: 'duplicata', texto: 'Aviso de possível duplicata' },
    {
      tipo: 'nota',
      texto:
        'Possível duplicata: no passo de Revisão, se algum ativo do lote JÁ tiver uma movimentação do mesmo tipo registrada hoje, aparece um aviso âmbar ("WAP0001234 já teve “Saída” hoje — confira antes de registrar"). É só um alerta: registrar continua permitido, porque às vezes o mesmo evento acontece mesmo duas vezes no dia. Movimentação que foi estornada NÃO conta como duplicata.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'status-do-ativo' },
        { slug: 'registrar-movimentacao' },
        { slug: 'conceito-movimentacao' },
      ],
    },
  ],
}
