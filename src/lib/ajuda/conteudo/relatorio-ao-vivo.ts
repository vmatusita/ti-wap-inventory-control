import { MANUTENCAO_ALERTA_DIAS } from '@/lib/relatorios/manutencao-alerta'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const relatorioAoVivo: PaginaAjuda = {
  slug: 'relatorio-ao-vivo',
  titulo: 'Ler o relatório ao vivo',
  resumo: 'O que cada grupo, KPI e cor querem dizer.',
  categoria: 'consultar',
  termos: [
    'relatorio',
    'kpi',
    'grafico',
    'delta',
    'filial',
    'consolidado',
    'imprimir',
    'impressao',
    'periodo',
    'semana',
    'papel',
    'como ler',
  ],
  legado: ['relatorios'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'O relatório AO VIVO (por filial ou consolidado "geral") reflete o banco no instante em que você abre — inclusive em tempo real. Ao abrir sem escolher período, ele já vem na semana atual: do domingo desta semana até HOJE, nunca até o sábado que ainda não chegou. Numa quarta-feira, por exemplo, o subtítulo mostra o domingo e a própria quarta — não faltam dias, eles só não aconteceram ainda. Os demais períodos continuam disponíveis nos botões.',
    },
    {
      tipo: 'paragrafo',
      texto:
        'O relatório também traz uma seção própria com as movimentações de itens por quantidade do período (item, quantidade, tipo, filial, pessoa/chamado, data), separada das tabelas de ativos.',
    },
    { tipo: 'titulo', id: 'relvivo-periodo', texto: 'Escolher a filial e o período' },
    {
      tipo: 'lista',
      itens: [
        'Filial: a fileira de abas logo abaixo do título tem uma aba por filial ativa mais "Consolidado" (o endereço /relatorios/geral). Trocar de aba preserva o período escolhido.',
        'Se o seu cargo é Operador, o menu Relatórios abre direto na aba da sua filial (a primeira em ordem alfabética, quando você trabalha em mais de uma). Administrador, Desenvolvedor e Consulta abrem no Consolidado. As abas continuam todas ali, a um clique.',
        'Período: os botões "Esta semana" (como a tela abre), "Semana passada", "Últimos 30 dias", "Este ano" e "Tudo". Para uma faixa qualquer, use "Personalizado", preencha "De" e "Até" e clique em "Aplicar período".',
        '"Esta semana" conta de domingo até hoje; "Semana passada" é a semana inteira que fechou, de domingo a sábado. Atenção: a janela do relatório congelado é outra — o diálogo "Gerar relatório" trabalha de segunda a sexta, que é o recorte do e-mail semanal. As duas convivem de propósito.',
        'A filial e o período ficam no endereço da página: o link que você copiar abre exatamente o mesmo recorte para quem receber — inclusive para quem entra pela senha de acesso.',
        'Para o operador, o selo "ao vivo" no cabeçalho vira "atualizado agora" quando algum registro muda enquanto você lê. Quem entra pela senha de acesso vê no lugar dele o botão "Atualizar", e a tela também se atualiza sozinha a cada 60 segundos.',
      ],
    },
    { tipo: 'titulo', id: 'relvivo-estrutura', texto: 'A ordem das seções' },
    {
      tipo: 'paragrafo',
      texto:
        'O relatório é longo, então uma barra de atalhos acompanha a rolagem no topo com os saltos "Principais", "Acessórios", "Componentes", "Saídas", "Entradas", "Transferências" (quando houver), "Itens" (quando houver), "Resumo", "Observações" (quando o relatório tem texto da semana) e "Como ler". No celular, os grupos "Acessórios" e "Componentes" nascem fechados — clicar no atalho abre o grupo junto com o salto. De cima para baixo, a ordem é sempre esta:',
    },
    {
      tipo: 'lista',
      itens: [
        'Os sete indicadores do topo: "Total de ativos", "Em uso", "Em estoque", "Reservados", "Em triagem", "Em manutenção" e "Reserva técnica" (os defasados, que continuam em posse da WAP).',
        'O card "Movimentações" — saídas × devoluções ao longo do período.',
        'O grupo "Equipamentos principais" (notebooks, desktops, monitores, celulares e tablets), com os tiles "Guardados", "Reservados", "Em manutenção" e "Emprestados" e os cards "Estoque no último dia", "Disponíveis por modelo", "Reservados", "Saídas por motivo", "Devoluções por motivo" e "Em manutenção, caso a caso".',
        'Os grupos "Acessórios e periféricos" e "Componentes", cada um com "Saldo por item" e "Movimentação por item".',
        'A seção "Pendências" — só para o operador logado; quem entra pela senha de acesso nunca a vê.',
        'As tabelas detalhadas do período: "Saídas", "Entradas", "Transferências" e "Movimentações de itens".',
        'O card "Resumo do período" (no formato do e-mail semanal), a "Observações da semana" quando o relatório congelado tem texto, e a seção recolhível "Como ler este relatório".',
        'O botão "Copiar texto" do card "Resumo do período" copia o texto inteiro pronto para colar: a linha dos sete indicadores, as saídas e as devoluções por filial e motivo, e o bloco "Em estoque (N)" com a lista de modelos disponíveis — que é como o e-mail semanal abria.',
      ],
    },
    { tipo: 'titulo', id: 'relvivo-filtros', texto: 'Filtrar e buscar nas tabelas' },
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
    {
      tipo: 'nota',
      texto:
        'O cabeçalho de cada tabela mostra dois números: "{título} — N no período" é o total do recorte e "M exibida(s)" é o que sobrou depois do filtro daquela tabela. Se os dois divergirem e você não esperava isso, é filtro interno ligado — clique em "Limpar" na barra da própria tabela.',
    },
    { tipo: 'titulo', id: 'relvivo-cores', texto: 'O que as cores e as marcas significam' },
    {
      tipo: 'nota',
      texto:
        'Para o operador logado, o patrimônio nas tabelas e nos cards de manutenção é um link direto para a ficha do ativo; e no relatório ao vivo os KPI tiles levam à lista de ativos já filtrada por aquele status (e pela filial do relatório, quando não é o consolidado). Quem entra pela senha de acesso vê os mesmos números, mas sem esses atalhos — a visualização não sai das telas de relatório.',
    },
    {
      tipo: 'nota',
      texto:
        'Cada KPI mostra o Δ (variação) frente ao período anterior com uma seta. A cor tem sentido: subir é bom (verde) em "Em estoque"/"Guardados"; subir é ruim (vermelho) em "Em manutenção" e "Em triagem"; nos demais a variação é neutra (cinza). A seta permanece sempre — a cor é só um reforço. Passe o mouse (ou dê Tab até o Δ) para ver de onde veio a conta: "Anterior: N (janela) → atual: M". O período anterior tem a MESMA duração do que está na tela e termina na véspera dele.',
    },
    {
      tipo: 'nota',
      texto:
        'Movimentações que foram estornadas aparecem sinalizadas nas tabelas do período: a linha fica esmaecida e ganha a marca "estornada" (com a data no toque/passar o mouse), inclusive na impressão. O lançamento de estorno e o lançamento estornado ficam ambos marcados. Isso NÃO altera nenhuma contagem do relatório.',
    },
    {
      tipo: 'nota',
      texto:
        `Um caso de manutenção parado há ${MANUTENCAO_ALERTA_DIAS} dias ou mais (ainda em aberto) sobe de tom: o "há N dias" passa de âmbar para vermelho, para o operador e para o visualizador. Para o operador, a seção "Pendências" DESTE relatório ganha também um chip "Manutenção parada (${MANUTENCAO_ALERTA_DIAS}+ dias)" com a contagem — ele vive aqui, no relatório, e não na página Pendências.`,
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
    { tipo: 'titulo', id: 'relvivo-imprimir', texto: 'Imprimir o relatório' },
    {
      tipo: 'passos',
      titulo: 'Imprimir o relatório em papel ou em PDF',
      itens: [
        'Ajuste antes o que quer levar: a filial (aba), o período e os filtros de cada tabela. O papel sai exatamente com o recorte que está na tela.',
        'Clique em "Imprimir", no canto direito do cabeçalho. Ele abre a janela de impressão do navegador — de onde também se escolhe "Salvar como PDF", se a ideia é anexar num e-mail.',
        'Confira a prévia: os cards saem em coluna única, um card nunca é cortado ao meio, cada grupo começa numa página nova e os grupos que ficam recolhidos no celular saem abertos. Os controles de tela (botões, abas, barra de atalhos, filtros) não vão para o papel.',
        'As tabelas saem COMPLETAS no papel, com as colunas que a tela esconde quando a janela é estreita: Marca/Modelo, Colaborador/Setor, Chamado, Termo e Observação. Para caber em A4 retrato, a letra encolhe e os textos longos quebram em mais de uma linha — o cabeçalho da tabela se repete a cada página nova.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'A impressão sai SEMPRE clara, mesmo com o tema escuro ligado — você não precisa voltar para o tema Claro antes de imprimir, nem o papel sai com fundo preto. As marcas de linha estornada continuam visíveis no papel. O botão "Imprimir" existe tanto no relatório ao vivo quanto no relatório congelado; nas demais telas, imprimir pelo próprio navegador (Ctrl+P) também sai claro.',
    },
    {
      tipo: 'nota',
      texto:
        'Você não precisa abrir os detalhes de cada linha (a setinha ▾ do celular) antes de imprimir: no papel esses campos já saem como colunas de verdade, e a linha de detalhe do celular é omitida justamente para não repetir a mesma informação duas vezes. Se quiser mais folga para os textos longos, escolha "Paisagem" na própria janela de impressão do navegador.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'relatorios-gerados', texto: 'Congelar este relatório numa versão' },
        { slug: 'usuarios-e-senhas', texto: 'Entregar o relatório a quem não é operador' },
        { slug: 'status-do-ativo' },
        { slug: 'itens-por-quantidade', texto: 'O que são total, estoque, atrelados e falta' },
      ],
    },
  ],
}
