import { CAP_EXPORT } from '@/lib/csv'
import { TAMANHOS_PAGINA, TAMANHO_PAGINA_PADRAO } from '@/lib/ativos/lista'
import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// REGRA DE OURO: nem o teto do export, nem os tamanhos de pagina, nem o teto da
// selecao multipla sao digitados — vem de `CAP_EXPORT`, `TAMANHOS_PAGINA`,
// `TAMANHO_PAGINA_PADRAO` e `MAX_LOTE_MOVIMENTACAO`, as MESMAS constantes que a
// tela usa. Mudou a lista de tamanhos ou o teto do lote, a frase muda junto.
const TAMANHOS_TEXTO = `${TAMANHOS_PAGINA.slice(0, -1).join(', ')} ou ${
  TAMANHOS_PAGINA[TAMANHOS_PAGINA.length - 1]
}`
const CAP_TEXTO = CAP_EXPORT.toLocaleString('pt-BR')

export const listaDeAtivos: PaginaAjuda = {
  slug: 'lista-de-ativos',
  titulo: 'Encontrar e exportar ativos',
  resumo: 'Buscar, filtrar, ordenar, paginar e levar para o Excel.',
  categoria: 'fazer',
  termos: [
    'ativos',
    'lista',
    'filtro',
    'ordenar',
    'pagina',
    'exportar',
    'csv',
    'excel',
    'buscar',
    'sem patrimonio',
    'vazio',
    'pendencia',
    'visoes rapidas',
    'atalho',
  ],
  legado: ['status', 'como-fazer'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'A lista de Ativos responde "quais equipamentos existem e onde estão". Use quando a pergunta for sobre um CONJUNTO (os notebooks em manutenção da Matriz, tudo que está com um colaborador). Quando a pergunta for sobre um equipamento só, vá direto pela busca do teclado e abra a ficha.',
    },
    {
      tipo: 'paragrafo',
      texto:
        'O subtítulo diz quantos ativos existem; no cabeçalho ficam "Exportar CSV" e "Novo equipamento". A tabela mostra "Patrimônio", "Categoria", "Marca / Modelo", "Filial", "Status", "Colaborador" e "Atualizado em". Quando o patrimônio se repete no resultado, a service tag aparece numa linha menor logo abaixo dele — é o par patrimônio + service tag que desempata os dois cadastros (identidade do equipamento); como não é mais uma coluna à parte, ela aparece em qualquer largura de tela, inclusive no celular. Ativo sem plaqueta traz o selo "sem patrimônio"; a linha inteira leva à ficha. Ativo com pendência registrada mostra um triângulo de alerta ao lado do patrimônio — passe o mouse ou o teclado por cima para ler o texto.',
    },

    { tipo: 'titulo', id: 'ativos-filtrar', texto: 'Filtrar e buscar' },
    {
      tipo: 'passos',
      titulo: 'Filtrar a lista de ativos',
      itens: [
        'O campo de busca aceita patrimônio, service tag, hostname, marca, modelo, nome do colaborador, telefone e IMEI. Ele só é aplicado quando você submete, no Enter ou no botão "Pesquisar" — a lista não muda a cada tecla.',
        'O botão "Filial" e o botão "Status" abrem um painel de caixas para marcar: dá para marcar mais de uma, e um selo no botão mostra quantas você marcou. Dentro do painel de filial, "Todas as filiais" volta a mostrar tudo. O seletor "Categoria" (opção "Todas categorias") recorta por tipo de equipamento.',
        'Se o seu cargo é Operador, a lista já abre marcando as filiais em que você trabalha — é o começo mais útil para o dia a dia. Administrador, Desenvolvedor e Consulta abrem com todas. Isso vale só quando você chega pela primeira vez: um link que já traz filiais escolhidas abre igual para qualquer pessoa, e "Limpar" devolve a lista ao começo do seu cargo.',
        'O botão "Sem patrimônio" é um interruptor: ligado, mostra só os equipamentos que entraram sem plaqueta.',
        'O botão "Com pendência" é outro interruptor: ligado, mostra só os equipamentos com alguma pendência registrada — o mesmo texto que aparece no triângulo de alerta ao lado do patrimônio.',
        'Acima da tabela, quatro chips levam direto a uma visão pronta: "Em manutenção", "Em estoque", "Sem patrimônio" e "Com pendência". Cada um TROCA a tela para aquele recorte — não empilha em cima do filtro que você já tinha montado —, e o chip da visão aberta no momento fica destacado. Eles não carregam a filial que você escolheu: continuam abrindo no recorte do seu cargo, do mesmo jeito que "Limpar" faz.',
        '"Limpar" aparece quando há filtro e volta a lista ao começo, preservando a ordenação e o tamanho de página que você escolheu.',
        'Tudo isso vive no endereço da página: o link copiado abre a mesma tela para quem receber, e voltar/avançar do navegador refaz a consulta. Endereço com valor inválido é ignorado — a lista abre no padrão em vez de dar erro.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'A lista vazia diz QUAL é o problema. Sem nenhum filtro e sem nenhum ativo cadastrado, ela mostra "Nenhum ativo cadastrado ainda" com o convite "Cadastre o primeiro equipamento para começar a controlar o estoque." e o atalho "Cadastrar o primeiro". Com filtro, a mensagem é outra: "Nenhum ativo com esses filtros", com "Ajuste a busca ou limpe os filtros para ver todos os ativos." e o botão "Limpar filtros". Se a segunda aparecer, o acervo existe — o que não bate é a combinação de filtros.',
    },

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
        `No rodapé dá para escolher ${TAMANHOS_TEXTO} por página (o padrão continua ${TAMANHO_PAGINA_PADRAO}) e pular direto para uma página no campo "Página __ de N".`,
        'Ordem, tamanho e página ficam no endereço junto dos filtros: o link copiado reproduz a tela inteira. Mudar filtro, ordem ou tamanho volta para a primeira página.',
        'Duas colunas não ordenam: Marca (o cabeçalho "Marca / Modelo" é um só e ordena por modelo) e Filial (o dado vem de outra tabela). Endereço com ordenação inválida é simplesmente ignorado — a lista abre no padrão.',
      ],
    },

    { tipo: 'titulo', id: 'ativos-voltar', texto: 'Ir e voltar sem refazer o filtro' },
    {
      tipo: 'passos',
      titulo: 'Voltar para a lista com os filtros que você montou',
      itens: [
        'Monte o recorte que você precisa (busca, filial, categoria, status, ordenação, página) e abra a ficha de um dos ativos.',
        'No alto da ficha, "Voltar para ativos" devolve você à ÚLTIMA lista visitada naquela aba do navegador — com filtro, ordenação e página como estavam.',
        'É a última lista visitada, não "a tela de onde eu vim": se você trocou o filtro depois, é o filtro novo que volta, e ele pode não conter o ativo que você acabou de ver.',
        'A memória é da aba: abrir a ficha em outra aba, ou usar o link direto que alguém mandou, leva ao "Voltar para ativos" limpo, sem nenhum filtro.',
      ],
    },

    { tipo: 'titulo', id: 'ativos-selecionar', texto: 'Selecionar vários e movimentar de uma vez' },
    {
      tipo: 'passos',
      titulo: 'Montar o lote de movimentação a partir da lista',
      itens: [
        'Filtre até sobrar o conjunto que você quer mexer — por exemplo, status "Em estoque" na filial Matriz, categoria Notebook.',
        'Marque a caixinha na primeira coluna de cada linha. A caixa do cabeçalho marca a página inteira de uma vez.',
        `A seleção aceita até ${MAX_LOTE_MOVIMENTACAO} ativos — é o mesmo teto do lote de movimentação. Ao passar disso, o aviso diz quantos ficaram de fora; a página pode mostrar até ${TAMANHOS_PAGINA[TAMANHOS_PAGINA.length - 1]} linhas, então "marcar todos" leva os ${MAX_LOTE_MOVIMENTACAO} primeiros.`,
        'Com pelo menos um marcado, aparece uma barra no rodapé: "N ativos selecionados", "Movimentar", "Copiar patrimônios" e "Limpar seleção". Ela acompanha a rolagem, então você não precisa voltar ao topo.',
        '"Movimentar" abre a tela de nova movimentação já com os ativos escolhidos no passo 1 — de lá o fluxo é o mesmo de sempre (tipo, motivo, conferência).',
        '"Copiar patrimônios" copia os selecionados, um por linha, para colar num chamado ou numa planilha. Ativo sem plaqueta não tem o que copiar e o aviso diz quantos ficaram de fora.',
        'A seleção vale para a PÁGINA que está aberta: trocar de página, de filtro ou de busca limpa as marcações. Marque e movimente uma página de cada vez.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'As caixinhas só aparecem para quem registra movimentação. O cargo Consulta vê a mesma lista, os mesmos filtros e o mesmo "Exportar CSV" — sem a coluna de seleção e sem a barra do rodapé. Se algum dos ativos escolhidos tiver sido apagado no meio do caminho, a tela de movimentação abre com os que restaram e um aviso âmbar diz quantos não foram encontrados.',
    },

    { tipo: 'titulo', id: 'exportar', texto: 'Levar para o Excel' },
    {
      tipo: 'passos',
      titulo: 'Exportar uma lista para o Excel (CSV)',
      itens: [
        'Ativos, Pendências e Itens têm o botão "Exportar CSV" no cabeçalho. Em Itens são dois: "Exportar saldos" (no topo) e "Exportar histórico" (no cabeçalho do histórico de lançamentos).',
        'O arquivo sai exatamente com o que está filtrado na tela — mudou o filtro, mudou o arquivo. A paginação não conta: o export leva todas as linhas do filtro, não só a página aberta.',
        `Cada arquivo leva no máximo ${CAP_TEXTO} linhas. Se o filtro tiver mais, o aviso diz quantas de quantas saíram ("Exportadas ${CAP_TEXTO} de N — refine os filtros") — nunca corta em silêncio.`,
        'Filtro sem nenhuma linha gera mesmo assim um arquivo, só com o cabeçalho (o aviso avisa).',
        'O arquivo abre direto no Excel em português: separador ponto e vírgula, acentuação certa e datas em dd/MM/aaaa. O nome traz a data do dia.',
        'A exportação é do operador: quem entra só com a senha de acesso dos relatórios não alcança essas telas nem o arquivo.',
        'Se a exportação falhar no caminho, o aviso "Falha ao exportar. Tente novamente." diz que nenhum arquivo foi gerado — a tela e os filtros continuam como estavam.',
      ],
    },

    {
      tipo: 'links',
      itens: [
        { slug: 'status-do-ativo' },
        { slug: 'ficha-do-ativo' },
        { slug: 'mapa-das-telas', ancora: 'teclado', texto: 'Achar um ativo pelo teclado' },
        { slug: 'lista-de-movimentacoes' },
      ],
    },
  ],
}
