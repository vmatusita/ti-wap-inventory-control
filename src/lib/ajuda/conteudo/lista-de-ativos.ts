import { CAP_EXPORT } from '@/lib/csv'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const listaDeAtivos: PaginaAjuda = {
  slug: 'lista-de-ativos',
  titulo: 'Encontrar e exportar ativos',
  resumo: 'Buscar, filtrar, ordenar, paginar e levar para o Excel.',
  categoria: 'fazer',
  termos: ['ativos', 'lista', 'filtro', 'ordenar', 'pagina', 'exportar', 'csv', 'excel'],
  legado: ['status', 'como-fazer'],
  blocos: [
    {
      tipo: 'nota',
      texto:
        'Na lista de Ativos os cabeçalhos de Patrimônio, Categoria, Marca / Modelo, Status e Colaborador ordenam a tabela, e o rodapé deixa escolher quantas linhas aparecem por página e pular direto para uma delas. Ordem, tamanho e página ficam no endereço, junto dos filtros — o passo a passo está abaixo.',
    },
    {
      tipo: 'passos',
      titulo: 'Ordenar a lista de ativos e mudar o tamanho da página',
      itens: [
        'Clique no cabeçalho da coluna para ordenar por ela: Patrimônio, Categoria, Marca / Modelo, Status ou Colaborador. O primeiro clique ordena crescente, o segundo inverte e o terceiro volta ao padrão da tela (os alterados mais recentemente em cima). A seta no cabeçalho mostra em que estado está.',
        'Ativos sem patrimônio ou sem colaborador vão para o fim da lista nos dois sentidos — o vazio nunca ocupa o topo.',
        'No rodapé dá para escolher 25, 50 ou 100 por página (o padrão continua 50) e pular direto para uma página no campo "Página __ de N".',
        'Ordem, tamanho e página ficam no endereço junto dos filtros: o link copiado reproduz a tela inteira. Mudar filtro, ordem ou tamanho volta para a primeira página.',
        'Duas colunas não ordenam: Marca (o cabeçalho "Marca / Modelo" é um só e ordena por modelo) e Filial (o dado vem de outra tabela). Endereço com ordenação inválida é simplesmente ignorado — a lista abre no padrão.',
      ],
    },
    { tipo: 'titulo', id: 'exportar', texto: 'Levar para o Excel' },
    {
      tipo: 'passos',
      titulo: 'Exportar uma lista para o Excel (CSV)',
      itens: [
        'Ativos, Pendências e Itens têm o botão "Exportar CSV" no cabeçalho. Em Itens são dois: "Exportar saldos" (no topo) e "Exportar histórico" (no cabeçalho do histórico de lançamentos).',
        'O arquivo sai exatamente com o que está filtrado na tela — mudou o filtro, mudou o arquivo. A paginação não conta: o export leva todas as linhas do filtro, não só a página aberta.',
        `Cada arquivo leva no máximo ${CAP_EXPORT.toLocaleString('pt-BR')} linhas. Se o filtro tiver mais, o aviso diz quantas de quantas saíram ("Exportadas ${CAP_EXPORT.toLocaleString('pt-BR')} de N — refine os filtros") — nunca corta em silêncio.`,
        'Filtro sem nenhuma linha gera mesmo assim um arquivo, só com o cabeçalho (o aviso avisa).',
        'O arquivo abre direto no Excel em português: separador ponto e vírgula, acentuação certa e datas em dd/MM/aaaa. O nome traz a data do dia.',
        'A exportação é do operador: quem entra só com a senha de acesso dos relatórios não alcança essas telas nem o arquivo.',
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'status-do-ativo' },
        { slug: 'ficha-do-ativo' },
        { slug: 'mapa-das-telas', ancora: 'teclado', texto: 'Achar um ativo pelo teclado' },
      ],
    },
  ],
}
