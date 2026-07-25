import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const resolverPendencias: PaginaAjuda = {
  slug: 'resolver-pendencias',
  titulo: 'Resolver as pendências',
  resumo:
    'Termo, patrimônio, service tag e itens faltantes — cada um com a sua saída.',
  categoria: 'fazer',
  termos: ['pendencia', 'fila', 'termo', 'faltante', 'triagem', 'regularizar'],
  legado: ['pendencias', 'como-fazer'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'A página Pendências reúne, para uso interno da TI, tudo que precisa de ação. Termo, Triagem e Outras são calculadas ao vivo — resolveu, saem da lista no próximo carregamento. Itens faltantes têm registro próprio, encerrado por ação manual com desfecho (item recuperado ou baixa). Quatro tipos:',
    },
    {
      tipo: 'glossario',
      badge: 'neutro',
      itens: [
        {
          chave: 'termo',
          rotulo: 'Termo',
          descricao:
            'Ativo entregue cujo termo ainda não foi confirmado como assinado (status diferente de "Assinado"). Resolve-se confirmando a assinatura.',
        },
        {
          chave: 'itens',
          rotulo: 'Itens faltantes',
          descricao:
            'Um acessório que não voltou numa devolução (mochila, carregador…). Cada item marcado no checklist da devolução vira uma linha própria, presa àquela devolução e ao COLABORADOR DA ÉPOCA (quem devia devolver) — não ao dono atual do ativo, que segue circulando livre: se o ativo sair para outra pessoa, a pendência continua apontando quem devia. Encerra-se aqui mesmo, por ação manual com desfecho ("Item recuperado" ou "Baixa — não vai voltar", observação opcional), uma de cada vez ou em lote com uma justificativa só. Resolver é definitivo nesta fase; a linha resolvida sai da fila mas fica na ficha do ativo, para auditoria (desfecho, quem e quando). Ativos vindos do import de startup NÃO abrem essa pendência — mesmo critério do termo de responsabilidade (o legado da planilha não inunda a fila).',
        },
        {
          chave: 'triagem',
          rotulo: 'Triagem',
          descricao: 'Ativo devolvido parado em triagem, aguardando a conferência (Triagem OK).',
        },
        {
          chave: 'outras',
          rotulo: 'Outras',
          descricao:
            'Demais situações que a TI precisa acompanhar — por exemplo, ativos importados sem patrimônio físico ou sem service tag. Defina o valor na ficha ("Definir patrimônio" / "Definir service tag") para encerrar cada uma.',
        },
      ],
    },
    {
      tipo: 'nota',
      texto:
        'As pendências são só para o operador — o visualizador não as vê. Na linha de um termo você confirma a assinatura ali mesmo, sem abrir a ficha; na linha de um item faltante você resolve com o desfecho (recuperado ou baixa) ali mesmo, e pode marcar várias e resolver em lote com uma justificativa só — o caminho para zerar a fila herdada. No menu lateral, o item "Pendências" traz um selo âmbar com quantas estão abertas (a contagem se atualiza a cada navegação; zerou, o selo some).',
    },
    { tipo: 'titulo', id: 'item-faltante', texto: 'Encerrar um item faltante' },
    {
      tipo: 'passos',
      titulo: 'Resolver uma pendência de item faltante',
      itens: [
        'Abra Pendências e vá ao bloco "Itens faltantes": cada linha é UM item que não voltou, com o patrimônio do ativo, o colaborador da época (o da devolução, não o dono atual) e desde quando está aberta.',
        'Na linha, use "Resolver" e escolha o desfecho: "Item recuperado" (o acessório apareceu) ou "Baixa — não vai voltar" (encerrar sem retorno). A observação é opcional.',
        'Para limpar a fila herdada de uma vez, marque várias linhas nas caixas de seleção e resolva em lote — uma justificativa vale para todas as marcadas.',
        'Resolver é definitivo nesta fase (não há reabrir). A linha sai da fila, do selo do menu e do CSV, mas continua na ficha do ativo com o desfecho, quem resolveu e quando — é o rastro de auditoria.',
        'A pendência é sempre do colaborador daquela devolução: se o ativo já saiu para outra pessoa, resolver aqui não mexe no novo dono nem faz surgir "dívida" para ele.',
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'termos-de-responsabilidade' },
        { slug: 'devolucao-e-triagem' },
        { slug: 'ficha-do-ativo' },
      ],
    },
  ],
}
