import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const kitsDeMovimentacao: PaginaAjuda = {
  slug: 'kits-de-movimentacao',
  titulo: 'Criar e aplicar um kit',
  resumo: 'Modelos do passo 2 para o que se repete toda semana.',
  categoria: 'fazer',
  termos: ['kit', 'modelo', 'novo colaborador', 'checklist'],
  legado: ['como-fazer', 'movimentacoes'],
  blocos: [
    {
      tipo: 'nota',
      texto:
        'Kits de movimentação: um kit é um MODELO salvo do passo 2 (tipo, motivo, termo e observação padrão) mais a lista de categorias que costumam ir juntas — por exemplo "Kit novo colaborador" = Saída · Novo colaborador · termo Gerado, esperando Notebook, Monitor e Celular. Os kits são criados e editados em Administração › Kits e aplicados no passo 2 pelo botão "Aplicar kit", ao lado de "Repetir última" (o botão só existe quando há kit ativo). Aplicar SUBSTITUI os quatro campos, inclusive apagando o que o kit não define — o aviso na tela diz isso. A lista de categorias é só um CHECKLIST informativo: ele mostra o que falta no lote, some sozinho quando você acrescenta o que faltava e NUNCA impede registrar. Kit é cópia: desativar ou editar um kit não altera nenhuma movimentação já registrada, e o kit não fica gravado na movimentação.',
    },
    {
      tipo: 'passos',
      titulo: 'Criar e aplicar um kit de movimentação',
      itens: [
        'Para criar: Administração › Kits › "Novo kit". Dê um nome ("Kit novo colaborador"), escolha o tipo (compra e estorno não entram), o motivo, o termo e uma observação padrão — e marque as categorias que costumam ir juntas (Notebook, Monitor, Celular…). Ao menos uma categoria é obrigatória.',
        'Trocar o tipo dentro do kit limpa o motivo que não vale para o tipo novo e o termo, quando o tipo novo não pede termo: o modelo não pode nascer inaplicável. Kit não se exclui — desmarque "Kit ativo" para tirá-lo do fluxo.',
        'Para aplicar: no passo 2 da nova movimentação, clique em "Aplicar kit" (ao lado de "Repetir última") e escolha o kit. O botão só aparece quando existe kit ativo.',
        'Aplicar SUBSTITUI tipo, motivo, termo e observação — inclusive apagando o que o kit não define. O aviso na tela diz que os campos foram substituídos; aplicar o mesmo kit duas vezes dá sempre o mesmo resultado.',
        'Kit de um tipo que não vale para os ativos do lote NÃO é aplicado pela metade: nada muda e o aviso explica por quê. (É diferente de "Repetir última", que aplica o que der.) Se o motivo salvo no kit tiver sido desativado depois, o resto é aplicado e o campo Motivo fica vazio, com aviso.',
        'O bloco âmbar com as categorias esperadas é só um CHECKLIST: mostra o que ainda não está no lote, some sozinho quando você volta ao passo 1 e acrescenta o que faltava, e nunca impede registrar. "Dispensar" fecha o bloco sem mexer nos campos.',
        'Kit é cópia: o que já foi registrado não guarda vínculo com o kit — desativar ou editar um modelo depois não altera nenhuma movimentação passada.',
      ],
    },
    {
      tipo: 'links',
      itens: [{ slug: 'registrar-movimentacao' }, { slug: 'administracao' }],
    },
  ],
}
