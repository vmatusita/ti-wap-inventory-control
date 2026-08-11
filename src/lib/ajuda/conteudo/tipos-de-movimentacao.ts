import { verbetesMovimentacao } from '@/lib/ajuda/derivacao'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'
import { STATUS_META, TIPO_META, type TipoMovimentacao } from '@/lib/dominio'
import {
  TIPOS_FORA_DO_LOTE_MANUAL,
  type CampoMovimentacao,
} from '@/lib/validators/movimentacao'

// Os tipos que o seletor "Tipo de movimentação" NUNCA oferece: os de fluxo
// proprio (TIPOS_FORA_DO_LOTE_MANUAL) mais o `estorno`, que so existe pelo botao
// da linha do tempo e sequer entra no schema do formulario. A contagem desta
// pagina sai daqui — um tipo novo com caminho proprio muda o numero sozinho.
const FORA_DO_FORMULARIO: TipoMovimentacao[] = [...TIPOS_FORA_DO_LOTE_MANUAL, 'estorno']

// Efeito de cada tipo de movimentacao na maquina de estados. O ROTULO do tipo
// vem de TIPO_META e o do ESTADO de destino, de STATUS_META — aqui so o que o
// evento PROVOCA. Renomear um estado em dominio.ts reescreve esta pagina no
// mesmo build, em vez de deixar a doc falando de um estado que a tela nao tem.
const S = STATUS_META

// F34 — a triagem deixou de ser etapa automática da devolução: "devolucao"
// agora resulta direto em_estoque, e o tipo novo "envio_triagem" é quem leva
// para em_triagem, só quando o operador ESCOLHE conferir. `Record` exaustivo:
// esqueceu o tipo novo, o build quebra sozinho — foi o que aconteceu aqui.
const EFEITO_MOVIMENTACAO: Record<TipoMovimentacao, string> = {
  compra: `Entrada de um ativo novo COMPRADO. Resultado: ${S.em_estoque.rotulo}. Não se registra por este formulário: é o cadastro de equipamento novo que a grava sozinha, na linha do tempo do ativo recém-criado.`,
  troca: `Entrada do equipamento SUBSTITUTO que o fornecedor mandou no lugar do devolvido (nascimento do ativo, como a compra). Registrada só pela devolução ao fornecedor — nunca pelo formulário de nova movimentação. Aparece nas Entradas do relatório rotulada "${TIPO_META.troca.rotulo}", nunca contada como compra (não foi comprado). Resultado: ${S.em_estoque.rotulo}.`,
  saida: `Entrega definitiva a um colaborador ou setor. Resultado: ${S.em_uso.rotulo}. É a movimentação que abre a cobrança do termo de responsabilidade.`,
  emprestimo: `Entrega temporária, com devolução esperada. Resultado: ${S.emprestado.rotulo}. Use quando o equipamento vai voltar — o relatório separa emprestados de "${S.em_uso.rotulo}" justamente por isso.`,
  reserva: `Separa o ativo para alguém sem entregar ainda — vale também sobre um ativo já "${S.reservado.rotulo}" (a re-reserva), trocando colaborador/setor/chamado sem estorno. Resultado: ${S.reservado.rotulo}. O equipamento continua com a TI, mas sai da conta de disponíveis.`,
  devolucao: `O ativo volta da mão do colaborador para a TI. Resultado: ${S.em_estoque.rotulo} — o equipamento já conta como disponível na hora, sem passo de triagem. É aqui que se marca o checklist do que NÃO voltou; quem quiser conferir antes de liberar de novo registra "${TIPO_META.envio_triagem.rotulo}" depois, por escolha própria.`,
  envio_triagem: `Separa o ativo "${S.em_estoque.rotulo}" para conferência manual — quando o operador QUER checar acessórios, formatar ou decidir o destino antes de liberar de novo. É opcional: nem toda devolução passa por aqui. Resultado: ${S.em_triagem.rotulo}.`,
  triagem_ok: `Conferência aprovada — o ativo volta a ficar disponível. Resultado: ${S.em_estoque.rotulo}.`,
  envio_manutencao: `Enviado para conserto ou assistência. Resultado: ${S.em_manutencao.rotulo}. Exige o número do chamado aberto pelo FORNECEDOR (campo "Chamado do fornecedor"), que é o que permite cobrar o conserto depois.`,
  retorno_manutencao: `Voltou do conserto e está apto. Resultado: ${S.em_estoque.rotulo}.`,
  marcar_defasado: `Marca o ativo como obsoleto (fim de vida útil). Resultado: ${S.defasado.rotulo}. Ele continua em posse da WAP e aparece no relatório como "Reserva técnica".`,
  descarte: `Baixa definitiva do ativo. Resultado: ${S.descartado.rotulo}. Estado final, sem volta.`,
  devolucao_fornecedor: `A manutenção não teve conserto: o fornecedor fica com o equipamento e o troca. Registra a baixa e, no mesmo passo, pode cadastrar o substituto (vinculado ao antigo). Só a partir de ${S.em_manutencao.rotulo}. Resultado: ${S.devolvido_fornecedor.rotulo}. Tem tela própria — o botão "Devolver ao fornecedor" na ficha do ativo.`,
  transferencia:
    'Muda o ativo de filial. Mantém o status atual — só troca a filial. A filial de destino tem de ser diferente da atual.',
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
  resumo: `Os ${Object.keys(TIPO_META).length} tipos: o que cada um provoca e que campos pede.`,
  categoria: 'consultar',
  termos: [
    'tipo',
    'evento',
    'transicao',
    'maquina de estados',
    'campos',
    'glossario',
    'obrigatorio',
    'duplicata',
    'trocar',
  ],
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
    { tipo: 'titulo', id: 'tipos-fora-do-formulario', texto: 'Os tipos que não estão no formulário' },
    {
      tipo: 'nota',
      texto: `Destes ${Object.keys(TIPO_META).length} tipos, ${FORA_DO_FORMULARIO.length} nunca aparecem na lista "Tipo de movimentação" da nova movimentação, porque têm caminho próprio: ${TIPO_META.compra.rotulo} é gravada pelo cadastro de equipamento novo; ${TIPO_META.estorno.rotulo}, pelo botão "Estornar" da linha do tempo da ficha; ${TIPO_META.devolucao_fornecedor.rotulo}, pelo botão "Devolver ao fornecedor" (que só existe enquanto o ativo está no estado "${S.em_manutencao.rotulo}"); e ${TIPO_META.troca.rotulo}, pela mesma tela de devolução ao fornecedor, quando você cadastra o substituto. Se você procurou um deles no formulário e não achou, é isto — não é falha de permissão.`,
    },
    {
      tipo: 'nota',
      texto:
        'Com vários ativos no lote, o formulário oferece só os tipos válidos para TODOS eles ("Os ativos estão em estados diferentes — só aparecem as movimentações válidas para todos eles."). Se você já tinha escolhido um tipo e acrescentou um ativo que o invalida, o sistema limpa o campo e avisa nomeando o ativo. Quando nenhum tipo serve para o conjunto, separe o lote.',
    },
    { tipo: 'titulo', id: 'tipos-duplicata', texto: 'Aviso de possível duplicata' },
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
        { slug: 'mensagens-de-erro', texto: 'Quando o sistema recusa a movimentação' },
      ],
    },
  ],
}
