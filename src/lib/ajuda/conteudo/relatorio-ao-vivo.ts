import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const relatorioAoVivo: PaginaAjuda = {
  slug: 'relatorio-ao-vivo',
  titulo: 'Ler o relatório ao vivo',
  resumo: 'O que cada grupo, KPI e cor querem dizer.',
  categoria: 'consultar',
  termos: ['relatorio', 'kpi', 'grafico', 'delta', 'filial', 'consolidado', 'imprimir'],
  legado: ['relatorios'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'O relatório AO VIVO (por filial ou consolidado "geral") reflete o banco no instante em que você abre — inclusive em tempo real. Ao abrir sem escolher período, ele já vem na semana atual, de domingo a sábado. Os demais períodos continuam disponíveis nos botões.',
    },
    {
      tipo: 'paragrafo',
      texto:
        'O relatório também traz uma seção própria com as movimentações de itens por quantidade do período (item, quantidade, tipo, filial, pessoa/chamado, data), separada das tabelas de ativos.',
    },
    { tipo: 'titulo', id: 'filtros', texto: 'Filtrar e buscar nas tabelas' },
    {
      tipo: 'nota',
      texto:
        'Os filtros das tabelas do relatório (Saídas, Entradas e movimentações de itens) viajam no link, como o período já fazia: atualizar a página não perde o filtro, voltar/avançar do navegador funciona e quem receber o endereço abre exatamente o mesmo recorte. Cada tabela tem os seus, sem uma atrapalhar a outra, e "Limpar" tira só os daquela tabela. Vale igual para quem entra pela senha de acesso.',
    },
    {
      tipo: 'nota',
      texto:
        'Cada tabela detalhada (Saídas, Entradas, Transferências e movimentações de itens) tem um campo de busca livre: digite qualquer texto — patrimônio (mesmo fora do formato, como "wap 1234" para wap0001234), modelo, categoria, motivo, chamado, colaborador/setor, item ou observação — e a tabela filtra as linhas na hora, somando aos filtros ativos. A busca também viaja no link. A contagem "X exibida(s)" continua mostrando quantas linhas sobraram.',
    },
    { tipo: 'titulo', id: 'cores', texto: 'O que as cores e as marcas significam' },
    {
      tipo: 'nota',
      texto:
        'Para o operador logado, o patrimônio nas tabelas e nos cards de manutenção é um link direto para a ficha do ativo; e no relatório ao vivo os KPI tiles levam à lista de ativos já filtrada por aquele status (e pela filial do relatório, quando não é o consolidado). Quem entra pela senha de acesso vê os mesmos números, mas sem esses atalhos — a visualização não sai das telas de relatório.',
    },
    {
      tipo: 'nota',
      texto:
        'Cada KPI mostra o Δ (variação) frente ao período anterior com uma seta. A cor tem sentido: subir é bom (verde) em "Em estoque"/"Guardados"; subir é ruim (vermelho) em "Em manutenção" e "Em triagem"; nos demais a variação é neutra (cinza). A seta permanece sempre — a cor é só um reforço.',
    },
    {
      tipo: 'nota',
      texto:
        'Movimentações que foram estornadas aparecem sinalizadas nas tabelas do período: a linha fica esmaecida e ganha a marca "estornada" (com a data no toque/passar o mouse), inclusive na impressão. O lançamento de estorno e o lançamento estornado ficam ambos marcados. Isso NÃO altera nenhuma contagem do relatório.',
    },
    {
      tipo: 'nota',
      texto:
        'Um caso de manutenção parado há 30 dias ou mais (ainda em aberto) sobe de tom: o "há N dias" passa de âmbar para vermelho, para o operador e para o visualizador. Para o operador, aparece também um chip "Manutenção parada (30+ dias)" em Pendências, com a contagem.',
    },
    {
      tipo: 'nota',
      texto:
        'No celular, onde a tabela precisa esconder colunas, cada linha tem uma setinha (chevron) que abre os campos ocultos — Observação, Termo, Colaborador, Chamado, Modelo — como pares rótulo:valor. No computador e na impressão nada muda: as colunas já cabem.',
    },
    {
      tipo: 'nota',
      texto:
        'Essas explicações também aparecem DENTRO do próprio relatório, em legendas curtas ao lado de cada elemento (o Δ dos KPIs, a linha estornada, as quatro cores dos badges de manutenção, a pílula "Troca" das Entradas) e numa seção recolhível "Como ler este relatório" no fim, com o glossário dos termos e a nota "Guardados = Em estoque". É a mesma informação desta documentação, visível também para quem entra só pela senha de acesso — que não abre estas páginas.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'relatorios-gerados' },
        { slug: 'usuarios-e-senhas', texto: 'Entregar o relatório a quem não é operador' },
        { slug: 'status-do-ativo' },
      ],
    },
  ],
}
