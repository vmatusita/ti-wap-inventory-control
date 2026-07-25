import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const registrarMovimentacao: PaginaAjuda = {
  slug: 'registrar-movimentacao',
  titulo: 'Registrar uma movimentação',
  resumo: 'O fluxo em três passos, do lote até a revisão.',
  categoria: 'fazer',
  termos: ['nova movimentacao', 'lote', 'registrar', 'rascunho', 'duplicata'],
  legado: ['como-fazer', 'movimentacoes'],
  blocos: [
    {
      tipo: 'passos',
      titulo: 'Registrar uma nova movimentação (em lote)',
      itens: [
        'Abra Movimentações › Nova (atalho: tecla N em qualquer tela).',
        `Selecione um ou mais ativos (o lote aceita até ${MAX_LOTE_MOVIMENTACAO} de uma vez). A busca acha por patrimônio, service tag, hostname, marca, modelo ou pelo nome do colaborador — digitar "Fulano da Silva" traz os equipamentos que estão com ele, e o nome aparece na linha do resultado.`,
        'Com o campo de busca ainda vazio, a lista já sugere "Movimentados recentemente" — os últimos ativos que VOCÊ movimentou, que quase sempre são o próximo do dia. Quem já está no lote não aparece na sugestão.',
        'Muitos ativos de uma vez? Use "Colar lista" ao lado da busca em vez de adicionar um a um.',
        'Escolha o tipo — só aparecem os tipos válidos para o estado de TODOS os ativos escolhidos. Se um ativo adicionado depois estreitar as opções, o sistema avisa qual ativo limpou o tipo.',
        'Preencha os campos pedidos (os obrigatórios variam por tipo) e confirme. Nos campos de data (da movimentação e do termo) há os atalhos "Hoje" e "Ontem" — um clique preenche. Colaborador e Setor sugerem o que já existe no sistema depois de 2 letras (a lista é só atalho: nome novo continua sendo digitado normalmente).',
        'Na Revisão, confira o aviso âmbar de possível duplicata, se aparecer, antes de registrar.',
      ],
    },
    { tipo: 'titulo', id: 'rascunho', texto: 'Se você sair no meio' },
    {
      tipo: 'passos',
      titulo: 'Retomar um lote que ficou pela metade (rascunho)',
      itens: [
        'Enquanto você monta o lote, a aba guarda um rascunho sozinha: os ativos escolhidos, a configuração e em que passo você parou.',
        'Saiu da tela (inclusive pelo atalho N) ou recarregou a página? Ao voltar aparece o aviso "Você tem um lote não registrado", com Restaurar e Descartar.',
        'Restaurar re-busca cada ativo no banco na hora — se alguém movimentou um deles nesse meio-tempo, o status vem atualizado e os tipos oferecidos se ajustam; ativo que sumiu do sistema fica de fora, com aviso de quantos ficaram.',
        'O rascunho é só desta aba do navegador e some quando você fecha o navegador. Registrar (mesmo em parte) ou Descartar também o apagam.',
        'Abrir a tela por um link com ativo já escolhido (pela ficha ou por "Duplicar") tem prioridade: nesses casos o rascunho não é oferecido.',
      ],
    },
    { tipo: 'titulo', id: 'depois', texto: 'Depois de confirmar' },
    {
      tipo: 'passos',
      titulo: 'Depois de registrar: termos em sequência e sucesso parcial',
      itens: [
        'Registrou uma saída ou empréstimo com vários ativos? A tela de sucesso lista os termos elegíveis com o estado de cada um (pendente / gerado / pulado).',
        'O botão em destaque é sempre o do PRÓXIMO termo pendente: gerou um, o destaque anda sozinho para o seguinte — dá para emitir a sequência inteira sem procurar botão. Pular é permitido e não gera nada.',
        'Esqueceu ou pulou? O termo continua disponível na ficha do ativo e na página Pendências.',
        'Se parte do lote falhar, o formulário volta com as falhas para corrigir — e agora mostra também os chips "Já registrados", com link para a ficha de cada ativo que entrou. O que foi registrado está registrado: não repita esses.',
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'colar-e-bipar-lote' },
        { slug: 'kits-de-movimentacao' },
        { slug: 'tipos-de-movimentacao' },
        { slug: 'termos-de-responsabilidade' },
      ],
    },
  ],
}
