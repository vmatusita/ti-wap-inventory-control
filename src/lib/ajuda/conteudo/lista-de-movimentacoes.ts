import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const listaDeMovimentacoes: PaginaAjuda = {
  slug: 'lista-de-movimentacoes',
  titulo: 'Achar uma movimentação já registrada',
  resumo: 'A resposta para "o que foi registrado hoje?".',
  categoria: 'fazer',
  termos: ['historico', 'auditoria', 'o que aconteceu', 'quem registrou', 'periodo'],
  legado: ['como-fazer', 'movimentacoes'],
  blocos: [
    {
      tipo: 'nota',
      texto:
        'Tudo que foi registrado fica na LISTA de movimentações: o item "Movimentações" do menu lateral abre essa lista (com período, tipo, filial e busca), e é ali que se responde "o que foi registrado hoje?". Para registrar, use o botão "Nova movimentação" ou a tecla N — os dois continuam indo direto ao formulário, sem passar pela lista.',
    },
    {
      tipo: 'passos',
      titulo: 'Achar uma movimentação já registrada (lista de movimentações)',
      itens: [
        'Abra Movimentações no menu lateral: a lista mostra tudo que já foi registrado, do mais recente para o mais antigo.',
        'Filtre por período (De / Até), por tipo e por filial. A busca é de um campo só: digite um patrimônio (WAP0001234 — "wap 1234" também serve, o sistema completa o formato) e vêm as movimentações daquele equipamento; digite um nome ("Fulano") e vêm as do colaborador.',
        'Cada linha traz data, tipo, patrimônio (link para a ficha), colaborador, filial, quem registrou e a observação. Estorno vem marcado como "estorno" e a movimentação desfeita, como "estornada" — nada é apagado do histórico.',
        'Os filtros ficam no endereço da página: o link já vai filtrado quando compartilhado, voltar/avançar do navegador funciona e trocar um filtro volta para a primeira página.',
        'Para REGISTRAR, continue usando "Nova movimentação" (botão do topo, card do painel inicial ou a tecla N) — todos vão direto ao formulário.',
      ],
    },
    {
      tipo: 'links',
      itens: [{ slug: 'registrar-movimentacao' }, { slug: 'tipos-de-movimentacao' }],
    },
  ],
}
