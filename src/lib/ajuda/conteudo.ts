// Conteudo do manual do operador (/ajuda — B9). REGRA DE OURO: o glossario e
// DERIVADO de `src/lib/dominio.ts` (rotulos) e de `validators/movimentacao.ts`
// (campos por tipo) — nunca copie os textos a mao, senao o manual diverge do
// sistema quando um rotulo mudar. So a prosa explicativa (efeito de cada tipo,
// significado de cada status) mora aqui, e em Records tipados pelo enum para o
// TypeScript exigir completude quando um valor novo surgir.
//
// Sem JSX de proposito: este modulo e importavel no ambiente `node` do Vitest
// (funcoes puras) e nao arrasta React. A renderizacao (badges reais, cards) vive
// na camada de componentes (src/components/ajuda/*). Exemplos SEMPRE ficticios.
//
// So SERVIDOR: os tetos citados no manual vem das constantes reais
// (MAX_LOTE_MOVIMENTACAO, MAX_LINHAS_LOTE_ITEM, CAP_EXPORT) — e `@/lib/csv`
// arrasta o PapaParse. A pagina /ajuda e Server Component e o unico consumidor
// de UI (`bloco-ajuda.tsx`) so importa TIPOS daqui; se algum dia um Client
// Component precisar do conteudo, receba-o por prop em vez de importar.
import {
  STATUS_META,
  STATUS_ORDEM,
  TIPO_META,
  TIPO_LANCAMENTO_META,
  TERMO_META,
  CATEGORIA_META,
  CATEGORIA_ORDEM,
  GRUPO_ITEM_META,
  GRUPO_ITEM_ORDEM,
  ACESSORIOS_DEVOLUCAO,
  ACESSORIO_ROTULO,
  type StatusAtivo,
  type TipoMovimentacao,
  type TipoLancamento,
  type TermoStatus,
} from '@/lib/dominio'
import {
  CAMPOS_POR_TIPO,
  MAX_LOTE_MOVIMENTACAO,
  type CampoMovimentacao,
  type RegraCampo,
} from '@/lib/validators/movimentacao'
import { MAX_LINHAS_LOTE_ITEM } from '@/lib/validators/item'
import { CAP_EXPORT } from '@/lib/csv'
import { MAX_LOTE_COMPRA } from '@/lib/patrimonio'
import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import { normalizarBusca } from '@/lib/ajuda/busca'

// ---------------------------------------------------------------------------
// MODELO DE DADOS (blocos tipados)
// ---------------------------------------------------------------------------

export type Verbete = { chave: string; rotulo: string; descricao: string }

export type VerbeteMovimentacao = {
  chave: TipoMovimentacao
  rotulo: string
  efeito: string
  campos: { rotulo: string; obrigatorio: boolean }[]
}

// `badge` diz ao renderizador qual componente/pilula usar por chave:
//  - 'status'  -> StatusBadge (cor real do estado)
//  - 'tipoLanc'-> pilula de tipo de lancamento de item
//  - 'termo'/'neutro' -> Badge neutro (o rotulo ja carrega o sentido)
export type Bloco =
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'nota'; texto: string }
  | { tipo: 'lista'; itens: string[] }
  | { tipo: 'passos'; titulo?: string; itens: string[] }
  | { tipo: 'glossario'; badge: 'status' | 'tipoLanc' | 'termo' | 'neutro'; itens: Verbete[] }
  | { tipo: 'movimentacoes'; itens: VerbeteMovimentacao[] }

export type Secao = { id: string; titulo: string; blocos: Bloco[] }

// ---------------------------------------------------------------------------
// PROSA POR ENUM (Records tipados => o TS obriga a cobrir todo valor novo).
// Os ROTULOS nao ficam aqui: vem de dominio.ts na hora de montar o verbete.
// ---------------------------------------------------------------------------

const DESC_STATUS: Record<StatusAtivo, string> = {
  em_estoque: 'Disponível na prateleira da TI, pronto para sair.',
  reservado: 'Separado para um colaborador ou finalidade, mas ainda não entregue.',
  em_uso: 'Entregue e em uso por um colaborador ou setor.',
  emprestado: 'Cedido em caráter temporário — espera-se a devolução.',
  em_triagem: 'Devolvido e aguardando conferência antes de voltar ao estoque.',
  em_manutencao: 'Em conserto ou assistência técnica.',
  defasado: 'Obsoleto / fim de vida útil — não deve mais ser distribuído.',
  descartado: 'Baixado em definitivo. Estado final, não retorna.',
}

const DESC_TERMO: Record<TermoStatus, string> = {
  nao: 'Nenhum termo emitido ainda. Conta como pendência.',
  gerado:
    'Documento .docx emitido pelo sistema, ainda sem assinatura. Continua como pendência — a cobrança não afrouxa.',
  enviado:
    'Termo entregue ao colaborador, mas sem a assinatura confirmada. Ainda pendente.',
  sim: 'Assinatura confirmada. É o ÚNICO status que encerra a pendência do termo.',
}

// Efeito de cada tipo de movimentacao na maquina de estados (0004 no banco). O
// rotulo vem de TIPO_META; aqui so o que o evento PROVOCA e a que estado leva.
const EFEITO_MOVIMENTACAO: Record<TipoMovimentacao, string> = {
  compra: 'Entrada de um ativo novo. Resultado: Em estoque.',
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
  termo: 'Termo',
  filial_destino: 'Filial de destino',
  status_resultante: 'Novo status',
  itens_faltantes: 'Checklist de itens faltantes',
  estorno_de: 'Movimentação de origem',
}

// ---------------------------------------------------------------------------
// DERIVACAO A PARTIR DE dominio.ts / validators (o glossario nunca diverge)
// ---------------------------------------------------------------------------

function verbetesStatus(): Verbete[] {
  return STATUS_ORDEM.map((s) => ({
    chave: s,
    rotulo: STATUS_META[s].rotulo,
    descricao: DESC_STATUS[s],
  }))
}

function verbetesCategoria(): Verbete[] {
  return CATEGORIA_ORDEM.map((c) => ({
    chave: c,
    rotulo: CATEGORIA_META[c].rotulo,
    descricao: 'Categoria de ativo controlado individualmente.',
  }))
}

function verbetesTermo(): Verbete[] {
  // Ordem do fluxo do papel: nao -> gerado -> enviado -> sim.
  const ordem: TermoStatus[] = ['nao', 'gerado', 'enviado', 'sim']
  return ordem.map((t) => ({
    chave: t,
    rotulo: TERMO_META[t].rotulo,
    descricao: DESC_TERMO[t],
  }))
}

function verbetesTipoLancamento(): Verbete[] {
  // rotulo E descricao ja moram em dominio.ts (TIPO_LANCAMENTO_META, pós-F6A).
  return (Object.keys(TIPO_LANCAMENTO_META) as TipoLancamento[]).map((t) => ({
    chave: t,
    rotulo: TIPO_LANCAMENTO_META[t].rotulo,
    descricao: TIPO_LANCAMENTO_META[t].descricao,
  }))
}

function verbetesGrupoItem(): Verbete[] {
  return GRUPO_ITEM_ORDEM.map((g) => ({
    chave: g,
    rotulo: GRUPO_ITEM_META[g].rotulo,
    descricao: GRUPO_ITEM_META[g].titulo,
  }))
}

function camposDoTipo(t: TipoMovimentacao): { rotulo: string; obrigatorio: boolean }[] {
  const entradas = Object.entries(CAMPOS_POR_TIPO[t].campos) as [
    CampoMovimentacao,
    RegraCampo,
  ][]
  return entradas.map(([campo, regra]) => ({
    rotulo: ROTULO_CAMPO[campo],
    obrigatorio: regra === 'obrigatorio',
  }))
}

function verbetesMovimentacao(): VerbeteMovimentacao[] {
  return (Object.keys(TIPO_META) as TipoMovimentacao[]).map((t) => ({
    chave: t,
    rotulo: TIPO_META[t].rotulo,
    efeito: EFEITO_MOVIMENTACAO[t],
    campos: camposDoTipo(t),
  }))
}

// Checklist de devolucao (acessorios conferidos) — derivado de dominio.ts.
function rotulosAcessorios(): string[] {
  return ACESSORIOS_DEVOLUCAO.map((a) => ACESSORIO_ROTULO[a] ?? a)
}

// ---------------------------------------------------------------------------
// SECOES DO MANUAL
// ---------------------------------------------------------------------------

export const SECOES: Secao[] = [
  {
    id: 'conceito',
    titulo: 'Conceito: a movimentação é a fonte da verdade',
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          'O sistema não guarda um "estado" digitado à mão. Cada evento (uma compra, uma saída, uma devolução) é registrado UMA vez como movimentação, e o estado do ativo, o estoque e os relatórios são calculados a partir desse histórico pelo próprio banco.',
      },
      {
        tipo: 'paragrafo',
        texto:
          'Na prática: você nunca edita o status de um ativo diretamente — você registra o que aconteceu, e o status muda sozinho. Errou? Estorne a última movimentação (a linha do tempo volta ao que era) ou faça um Ajuste com justificativa.',
      },
      {
        tipo: 'nota',
        texto:
          'Por isso o histórico é imutável: movimentações não se apagam nem se editam. Corrigir é sempre um novo evento (estorno ou ajuste), com autor e data registrados.',
      },
    ],
  },
  {
    id: 'status',
    titulo: 'Status do ativo',
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          'Todo ativo controlado individualmente (notebook, celular, monitor, desktop, tablet) está sempre em um destes estados. A cor do selo é a mesma em todo o sistema.',
      },
      { tipo: 'glossario', badge: 'status', itens: verbetesStatus() },
      {
        tipo: 'paragrafo',
        texto: 'Cada ativo também pertence a uma categoria:',
      },
      { tipo: 'glossario', badge: 'neutro', itens: verbetesCategoria() },
      {
        tipo: 'nota',
        texto:
          'Na lista de Ativos os cabeçalhos de Patrimônio, Categoria, Marca / Modelo, Status e Colaborador ordenam a tabela, e o rodapé deixa escolher quantas linhas aparecem por página e pular direto para uma delas. Ordem, tamanho e página ficam no endereço, junto dos filtros — o passo a passo está em "Ordenar a lista de ativos e mudar o tamanho da página".',
      },
    ],
  },
  {
    id: 'movimentacoes',
    titulo: 'Tipos de movimentação',
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          'Cada tipo é um evento que leva o ativo de um estado a outro (a máquina de estados). O formulário só oferece os tipos válidos para o estado atual de cada ativo. Abaixo, o que cada um provoca e quais campos pede (os marcados com * são obrigatórios).',
      },
      { tipo: 'movimentacoes', itens: verbetesMovimentacao() },
      {
        tipo: 'nota',
        texto:
          'Saída e Empréstimo exigem o Colaborador OU o Setor de destino (ao menos um). Na Devolução, marque no checklist os acessórios que NÃO voltaram — cada item marcado vira uma pendência de itens faltantes.',
      },
      {
        tipo: 'lista',
        itens: [
          `Checklist de devolução (acessórios conferidos): ${rotulosAcessorios().join(', ')}.`,
          'O Motivo (quando aparece) vem do catálogo de motivos, mantido em Administração › Motivos.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Possível duplicata: no passo de Revisão, se algum ativo do lote JÁ tiver uma movimentação do mesmo tipo registrada hoje, aparece um aviso âmbar ("WAP0001234 já teve “Saída” hoje — confira antes de registrar"). É só um alerta: registrar continua permitido, porque às vezes o mesmo evento acontece mesmo duas vezes no dia. Movimentação que foi estornada NÃO conta como duplicata.',
      },
      {
        tipo: 'nota',
        texto:
          'Tudo que foi registrado fica na LISTA de movimentações: o item "Movimentações" do menu lateral abre essa lista (com período, tipo, filial e busca), e é ali que se responde "o que foi registrado hoje?". Para registrar, use o botão "Nova movimentação" ou a tecla N — os dois continuam indo direto ao formulário, sem passar pela lista.',
      },
    ],
  },
  {
    id: 'termos',
    titulo: 'Termos de responsabilidade',
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          'Quando um ativo sai para um colaborador, gera-se o termo de responsabilidade (.docx). O status do termo acompanha o ciclo do papel e só se encerra quando a assinatura é confirmada.',
      },
      { tipo: 'glossario', badge: 'termo', itens: verbetesTermo() },
      {
        tipo: 'nota',
        texto:
          'Apenas o status "Assinado" tira o ativo das pendências de termo. "Gerado" e "Enviado" continuam cobrando. O sistema não recebe upload do PDF assinado — a confirmação registra apenas a data e quem confirmou.',
      },
    ],
  },
  {
    id: 'itens',
    titulo: 'Itens por quantidade',
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          'Além dos ativos com patrimônio, a TI controla itens contados por quantidade (periféricos, acessórios e componentes). Eles não têm ficha individual — têm saldo. Dois grupos:',
      },
      { tipo: 'glossario', badge: 'neutro', itens: verbetesGrupoItem() },
      {
        tipo: 'paragrafo',
        texto: 'Cada item mostra quatro números, que significam coisas diferentes:',
      },
      {
        tipo: 'lista',
        itens: [
          'Total — tudo que a TI possui daquele item (o patrimônio do almoxarifado).',
          'Estoque — o que está fisicamente disponível na prateleira agora.',
          'Atrelados — unidades vinculadas a um ativo/chamado, que devem retornar.',
          'Falta — déficit real: acende quando o que está atrelado somado ao que está com as pessoas passa do Total — máx(0, atrelados + liberados − total). Na operação normal fica sempre em zero; se acender, algum lançamento não fecha e vale conferir o histórico. Não é aviso de reposição: o sistema não guarda nível de reposição por item.',
        ],
      },
      {
        tipo: 'paragrafo',
        texto: 'Os lançamentos de item têm seis tipos, cada um com um efeito no saldo:',
      },
      { tipo: 'glossario', badge: 'tipoLanc', itens: verbetesTipoLancamento() },
      {
        tipo: 'nota',
        texto:
          'A página Itens tem duas visões, no botão do topo. Consolidado (como a tela abre) soma todas as filiais — ou só a filial escolhida no filtro. Por filial põe uma coluna de estoque para CADA filial, lado a lado, mais a coluna Total: é a resposta rápida para "onde tem mouse sobrando?", sem trocar o filtro cinco vezes. O selo "faltam N" aparece na coluna da filial onde está o déficit.',
      },
      {
        tipo: 'nota',
        texto:
          'Na visão Por filial o filtro de filial some da barra (as filiais já estão todas na tela, uma por coluna) e o recorte por filial deixa de valer também para o histórico de lançamentos logo abaixo. A busca por nome e o filtro de grupo continuam valendo nas duas visões, e a visão escolhida fica no endereço da página — o link abre do mesmo jeito para quem receber. Se a coluna Total for maior que a soma das colunas, ela mesma explica por quê ("inclui N de filial desativada") — filial desativada não ganha coluna, mas o saldo que ficou nela continua contando no Total.',
      },
    ],
  },
  {
    id: 'pendencias',
    titulo: 'Pendências',
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          'A página Pendências reúne, para uso interno da TI, tudo que precisa de ação. É calculada ao vivo — resolveu, sai da lista no próximo carregamento. Quatro tipos:',
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
              'Acessórios marcados como não devolvidos numa devolução (o checklist da movimentação).',
          },
          {
            chave: 'triagem',
            rotulo: 'Triagem',
            descricao: 'Ativo devolvido parado em triagem, aguardando a conferência (Triagem OK).',
          },
          {
            chave: 'outras',
            rotulo: 'Outras',
            descricao: 'Demais situações que a TI precisa acompanhar.',
          },
        ],
      },
      {
        tipo: 'nota',
        texto:
          'As pendências são só para o operador — o visualizador não as vê. Na linha de um termo você confirma a assinatura ali mesmo, sem abrir a ficha. No menu lateral, o item "Pendências" traz um selo âmbar com quantas estão abertas (a contagem se atualiza a cada navegação; zerou, o selo some).',
      },
    ],
  },
  {
    id: 'relatorios',
    titulo: 'Relatórios e snapshots',
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          'O relatório AO VIVO (por filial ou consolidado "geral") reflete o banco no instante em que você abre — inclusive em tempo real. Ao abrir sem escolher período, ele já vem na semana atual, de domingo a sábado. Os demais períodos continuam disponíveis nos botões.',
      },
      {
        tipo: 'paragrafo',
        texto:
          'O SNAPSHOT (relatório gerado) é uma fotografia congelada de um período: fica salvo, versionado e imutável. Serve de registro oficial — "fim da errata", porque nunca muda depois de gerado, mesmo que os dados evoluam. Gerar de novo o mesmo período cria uma nova versão, sem apagar as anteriores.',
      },
      {
        tipo: 'nota',
        texto:
          'Ao gerar, você pode adicionar uma Observação da semana (texto livre opcional). Ela aparece em destaque no final do snapshot, junto do resumo do período, e é visível para o operador e para o visualizador. Sem observação, nenhuma seção vazia aparece.',
      },
      {
        tipo: 'paragrafo',
        texto:
          'O relatório também traz uma seção própria com as movimentações de itens por quantidade do período (item, quantidade, tipo, filial, pessoa/chamado, data), separada das tabelas de ativos.',
      },
      {
        tipo: 'nota',
        texto:
          'Os filtros das tabelas do relatório (Saídas, Entradas e movimentações de itens) agora viajam no link, como o período já fazia: atualizar a página não perde o filtro, voltar/avançar do navegador funciona e quem receber o endereço abre exatamente o mesmo recorte. Cada tabela tem os seus, sem uma atrapalhar a outra, e "Limpar" tira só os daquela tabela. Vale igual para quem entra pela senha de acesso.',
      },
    ],
  },
  {
    id: 'como-fazer',
    titulo: 'Como fazer (passo a passo)',
    blocos: [
      {
        tipo: 'passos',
        titulo: 'Achar qualquer coisa pelo teclado (busca global e atalhos)',
        itens: [
          'Ctrl+K (ou ⌘K no Mac) abre a busca global em qualquer tela — a mesma caixa que a lupa do cabeçalho abre. A barra "/" também abre, desde que o cursor não esteja dentro de um campo de texto.',
          'Digite a partir de 2 letras: a busca acha o ativo por patrimônio, service tag, hostname, marca, modelo ou nome do colaborador. As setas ↑ ↓ andam pela lista, Enter abre a ficha do ativo escolhido e Esc fecha. Quando o patrimônio repete em dois equipamentos, a service tag aparece na linha para desempatar.',
          'A mesma caixa também leva para as telas ("Ir para Pendências") e dispara ações ("Nova movimentação", "Lançar item") — tudo sem tirar a mão do teclado.',
          'Os atalhos globais são três: N abre uma nova movimentação, ? abre esta ajuda e, na página Itens, L abre o lançamento. Nenhum deles dispara enquanto você digita num campo nem com uma janela de confirmação aberta.',
          'O ícone "?" ao lado do título de cada tela abre esta ajuda já na seção daquela tela.',
          'Nada disso existe para quem entra só com a senha de acesso dos relatórios — busca e atalhos são do operador.',
        ],
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
      {
        tipo: 'passos',
        titulo: 'Registrar uma nova movimentação (em lote)',
        itens: [
          'Abra Movimentações › Nova (atalho: tecla N em qualquer tela).',
          `Selecione um ou mais ativos (o lote aceita até ${MAX_LOTE_MOVIMENTACAO} de uma vez). A busca acha por patrimônio, service tag, hostname, marca, modelo ou pelo nome do colaborador — digitar "Fulano da Silva" traz os equipamentos que estão com ele, e o nome aparece na linha do resultado.`,
          'Com o campo de busca ainda vazio, a lista já sugere "Movimentados recentemente" — os últimos ativos que VOCÊ movimentou, que quase sempre são o próximo do dia. Quem já está no lote não aparece na sugestão.',
          'Muitos ativos de uma vez? Use "Colar lista" ao lado da busca (passo a passo abaixo) em vez de adicionar um a um.',
          'Escolha o tipo — só aparecem os tipos válidos para o estado de TODOS os ativos escolhidos. Se um ativo adicionado depois estreitar as opções, o sistema avisa qual ativo limpou o tipo.',
          'Preencha os campos pedidos (os obrigatórios variam por tipo) e confirme. Nos campos de data (da movimentação e do termo) há os atalhos "Hoje" e "Ontem" — um clique preenche. Colaborador e Setor sugerem o que já existe no sistema depois de 2 letras (a lista é só atalho: nome novo continua sendo digitado normalmente).',
          'Na Revisão, confira o aviso âmbar de possível duplicata, se aparecer, antes de registrar.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Colar a lista de patrimônios no lote (movimentação)',
        itens: [
          'No passo 1 (Ativos), clique em "Colar lista".',
          'Cole um patrimônio por linha. A service tag é opcional e vem depois de vírgula, ponto e vírgula ou TAB — dá para colar duas colunas direto do Excel (o TAB entre elas já é o separador). Colunas extras são ignoradas.',
          'O leitor de código de barras também serve aqui: cada bipada cai numa linha nova (o leitor digita e dá Enter).',
          'Clique em "Conferir lista". O resultado vem em blocos: Encontrados (entram no lote), patrimônio duplicado (você escolhe qual), Não encontrados e Linhas inválidas — os dois últimos com botão de copiar, para levar de volta à planilha.',
          'Patrimônio que repete em dois ativos e veio SEM service tag na linha não entra sozinho: o sistema mostra os candidatos com service tag, filial e status para você marcar qual é. Nada entra por adivinhação.',
          `Ativo que já está no lote aparece marcado como "já no lote" e não entra duas vezes. Se a lista passar de ${MAX_LOTE_MOVIMENTACAO} linhas, o diálogo avisa e não consulta nada — divida em dois lotes.`,
          'Confirme com "Adicionar ao lote" — o botão diz quantos vão entrar e como fica o total.',
        ],
      },
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
        tipo: 'passos',
        titulo: 'Dar entrada de ativos por compra',
        itens: [
          'Use o fluxo de compra para cadastrar ativos novos: um por vez, colando uma lista, ou por faixa de patrimônio.',
          `A faixa e a lista aceitam no máximo ${MAX_LOTE_COMPRA} unidades por vez.`,
          'Na aba "Colar lista" você pode colar duas colunas direto do Excel (patrimônio e service tag): o separador pode ser TAB, ponto-e-vírgula ou vírgula. O preview aponta linha por linha o que está errado — inclusive patrimônio repetido dentro da própria lista.',
          'Na aba "Faixa" há um campo opcional de service tags: uma por linha, NA MESMA ORDEM da faixa. Deixe vazio e a faixa entra sem service tag, como antes; preencheu, o preview mostra os pares (WAP0001234 · ST-ABC123). Se a contagem não bater ("5 patrimônios × 3 service tags"), o erro aparece e o cadastro fica bloqueado até acertar — o mesmo vale para service tag repetida na lista.',
          'Marca, Modelo e Fornecedor sugerem o que já existe no acervo depois de 2 letras (Modelo filtra pela marca já escolhida). É só atalho contra "Dell" virar "DELL" na próxima compra: digitar um valor novo continua normal e nada é bloqueado.',
          'Filial e categoria voltam preenchidas com as da última compra feita naquele navegador — confira antes de cadastrar.',
          'Cada ativo entra como Em estoque.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Comprar outro igual (sem redigitar a ficha)',
        itens: [
          'Na ficha de um ativo, use "Comprar outro igual": abre a compra com categoria, marca, modelo, memória, armazenamento, processador, fornecedor e filial já preenchidos.',
          'No próprio formulário de compra há o botão "Repetir última compra", que preenche os mesmos campos com a última compra que VOCÊ registrou.',
          'Patrimônio e service tag NUNCA vêm preenchidos — são de cada equipamento e continuam sendo digitados, colados ou bipados.',
          'Quem manda quando há mais de uma fonte: o link "Comprar outro igual" vence o botão "Repetir última compra", que vence a memória de filial/categoria do navegador. Confira os campos antes de cadastrar — a nota fiscal é que decide.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Cadastrando com leitor de código de barras',
        itens: [
          'O leitor USB funciona como um teclado: ele digita o que leu e dá Enter. Não é preciso configurar nada.',
          'Clique no campo "Colar lista" do fluxo de compra e bipe as etiquetas em sequência — cada bipada cai numa linha.',
          'O mesmo vale no "Colar lista" da nova movimentação: bipe os equipamentos em sequência e depois clique em "Conferir lista".',
          'Quer também a service tag? Bipe o patrimônio, digite ponto e vírgula (;) e bipe a service tag na mesma linha. Não use TAB para separar: dentro do campo, a tecla Tab pula para o controle seguinte — o TAB só vale quando a lista vem colada do Excel.',
          'Confira o preview antes de cadastrar: ele mostra quantos ativos entrarão e destaca erros e repetições.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Estornar uma movimentação',
        itens: [
          'Abra a ficha do ativo e vá à linha do tempo.',
          'Só a ÚLTIMA movimentação pode ser estornada — o estorno restaura exatamente o estado anterior.',
          'Precisa desfazer algo do meio do histórico? Use um Ajuste (com justificativa) em vez de estorno.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Anotar na ficha',
        itens: [
          'Na ficha do ativo, use "Anotar" para registrar uma observação livre.',
          'Anotações são imutáveis e entram na linha do tempo com autor e data.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Editar dados cadastrais',
        itens: [
          'Em "Editar dados" você altera apenas campos não derivados (specs, hostname, observações, termo).',
          'Status, filial e histórico NÃO se editam aqui — eles derivam das movimentações.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Corrigir o patrimônio',
        itens: [
          'Na ficha, use "Corrigir patrimônio". Digite o novo número — o sistema mostra o formato canônico (ex.: WAP0001234).',
          'A service tag é imutável: ela identifica o equipamento e nunca muda. Só o patrimônio se corrige.',
          'A correção fica registrada na linha do tempo (de → para, quem, quando). A busca passa a encontrar o ativo pelo novo patrimônio.',
          'Alguns ativos nascem sem patrimônio (equipamento sem plaqueta trazido pelo import de startup): aparecem como "Sem patrimônio", com pendência na lista e em /pendencias. Dar o número aqui encerra essa pendência.',
          'No import de startup, quando o hostname já traz o patrimônio (ex.: NB-WAP0001234), o preview preenche o número sozinho — é um aviso, não um erro, e não impede a importação. Só confira se está certo.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Gerar o termo de responsabilidade',
        itens: [
          'Na ficha, gere o termo (.docx). Você pode pré-visualizar, editar e baixar o documento.',
          'Ao gerar, o termo fica com status "Gerado" — que ainda conta como pendência até a assinatura ser confirmada.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Confirmar a assinatura do termo',
        itens: [
          'Na ficha (ou direto na linha da página Pendências), use "Confirmar assinatura".',
          'Informe a data da assinatura (padrão: hoje; não pode ser futura).',
          'O status vira "Assinado" — o único que encerra a pendência — e fica uma anotação na linha do tempo com quem confirmou. Há a ação de desfazer, se preciso.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Lançar um item por quantidade',
        itens: [
          'Abra Itens (atalho: tecla L) e lance uma movimentação de item.',
          'Se o item já aparece na tabela de saldos, use o botão de lançar da própria linha: o formulário abre com o item preenchido e o cursor na quantidade. A filial vem junto quando a tela está filtrada por uma filial; na visão Por filial ela abre em branco (a linha vale para todas) — escolha a filial antes de salvar.',
          'Escolha o tipo (Entrada, Liberação, Atrelar, Devolução, Retorno ou Ajuste) — cada um afeta Total/Estoque de um jeito.',
          'Informe a quantidade e, quando fizer sentido, a pessoa/chamado. O Ajuste pede justificativa.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Lançar vários itens da mesma nota (carrinho)',
        itens: [
          'Uma nota com 5 itens é UM lançamento com 5 linhas — não é preciso abrir o formulário cinco vezes.',
          `Use "Adicionar item" para incluir uma linha (item + quantidade). O contador ao lado de "Itens" mostra quanto já foi usado do limite de ${MAX_LINHAS_LOTE_ITEM} linhas por lançamento.`,
          'Filial, tipo, data, chamado, colaborador e observação são COMUNS a todas as linhas — preencha uma vez. As regras do tipo (chamado obrigatório em Atrelar/Liberação, justificativa no Ajuste) valem para o lançamento inteiro.',
          'O mesmo item não pode aparecer duas vezes no carrinho: some as quantidades numa linha só.',
          'Cada linha é lançada por conta própria: se uma falhar (saldo insuficiente, por exemplo), as outras entram do mesmo jeito. O aviso diz "X de Y linhas lançadas" e o formulário fica só com as que falharam, com o motivo em cada linha — corrija e mande de novo, sem redigitar o resto.',
          '"Repetir último" e o botão de lançar da linha do saldo preenchem a PRIMEIRA linha do carrinho (e os campos comuns).',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Criar um item que não está no catálogo (sem sair do lançamento)',
        itens: [
          'Na lista de itens do carrinho, digite o nome do item novo (a partir de 2 letras).',
          'Não achou? Aparece a opção "Criar item «…»" na própria lista — alcançável pelas setas do teclado.',
          'Confirme o nome e escolha o grupo (Acessório ou Componente). A posição do item na tabela é calculada pelo sistema.',
          'O item entra criado e já selecionado naquela linha do carrinho — o lançamento segue sem interrupção. Ele passa a valer para todo mundo (é o mesmo catálogo de Administração › Itens).',
          'Nome que já existe no catálogo não é criado de novo: o sistema avisa "Já existe um item com esse nome." — procure-o na lista.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Exportar uma lista para o Excel (CSV)',
        itens: [
          'Ativos, Pendências e Itens têm o botão "Exportar CSV" no cabeçalho. Em Itens são dois: "Exportar saldos" (no topo) e "Exportar histórico" (no cabeçalho do histórico de lançamentos).',
          'O arquivo sai exatamente com o que está filtrado na tela — mudou o filtro, mudou o arquivo. A paginação não conta: o export leva todas as linhas do filtro, não só a página aberta.',
          `Cada arquivo leva no máximo ${CAP_EXPORT.toLocaleString('pt-BR')} linhas. Se o filtro tiver mais, o aviso diz quantas de quantas saíram ("Exportadas ${CAP_EXPORT.toLocaleString('pt-BR')} de N — refine os filtros") — nunca corta em silêncio.`,
          'Filtro sem nenhuma linha gera mesmo assim um arquivo, só com o cabeçalho (o aviso avisa).',
          'O arquivo abre direto no Excel em português: separador ponto e vírgula, acentuação certa e datas em dd/MM/aaaa. O nome traz a data do dia (ex.: ativos-2026-07-22.csv).',
          'A exportação é do operador: quem entra só com a senha de acesso dos relatórios não alcança essas telas nem o arquivo.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Achar um lançamento no histórico de itens',
        itens: [
          'Na página Itens, o histórico filtra por item, por tipo de lançamento e por período (De / Até), além da filial.',
          'Os filtros ficam na URL: o link já vem filtrado ao ser compartilhado, e voltar/avançar do navegador funciona. Trocar um filtro volta para a primeira página.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Estornar um lançamento de item',
        itens: [
          'No histórico do item, estorne o lançamento errado — ele gera um lançamento de retorno que anula o efeito no saldo.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Gerar um snapshot do relatório',
        itens: [
          'No relatório, use "Gerar relatório". Confira o período (por padrão a semana útil) e o escopo (filial ou geral).',
          'Opcionalmente escreva a Observação da semana.',
          'Confirme: o snapshot é salvo, versionado e imutável. Ele aparece no histórico de relatórios gerados.',
        ],
      },
    ],
  },
  {
    id: 'admin',
    titulo: 'Administração',
    blocos: [
      {
        tipo: 'paragrafo',
        texto: 'A área de Administração concentra os cadastros de apoio. Tudo é nível único: todo operador vê e ajusta.',
      },
      {
        tipo: 'lista',
        itens: [
          `Usuários — convites de novos operadores. Só e-mails ${DOMINIOS_TEXTO} podem ser convidados.`,
          'Senhas de acesso — senhas que dão ao visualizador acesso só aos relatórios. Revogar pede confirmação e tem efeito imediato, no request seguinte; a senha revogada pode ser reativada na mesma lista.',
          'Filiais — cadastro das filiais.',
          'Motivos — o vocabulário de motivos oferecido na tela de movimentação.',
          'Itens — o catálogo de itens por quantidade (nome, grupo, ordem).',
          'Importar — import de startup de uma filial por arquivo (CSV ou Excel .xlsx), para o go-live dela no sistema.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'A entrada do dia a dia é 100% manual — não há sincronização com o Excel. A única importação é o import de startup em Administração › Importar: só o modo "Substituir tudo", que troca o acervo inteiro de UMA filial por um arquivo (CSV ou Excel .xlsx), no go-live dela. O .xlsx é o recomendado: preserva as datas (sem "#######" nem mês abreviado sem ano) e os acentos que o CSV do Excel costuma corromper. Ele mostra o custo, faz backup automático e exige que você digite o nome da filial antes de aplicar. No preview, cada erro se corrige na própria tela (o CSV original não muda); os avisos (em âmbar, como o patrimônio ausente) não bloqueiam a importação.',
      },
    ],
  },
  {
    id: 'acesso',
    titulo: 'Acesso e sessões',
    blocos: [
      {
        tipo: 'paragrafo',
        texto: 'Há dois modos de acesso, com poderes bem diferentes:',
      },
      {
        tipo: 'lista',
        itens: [
          `Operador — login com e-mail ${DOMINIOS_TEXTO}. Vê e opera tudo. Nível único (não há papéis nem hierarquia de operador).`,
          'Visualizador — entra por uma senha de acesso e só enxerga os relatórios (/relatorios). Não vê ativos, pendências, esta ajuda nem a operação.',
        ],
      },
      {
        tipo: 'paragrafo',
        texto:
          'Identidade do equipamento: a chave de um ativo é o PAR patrimônio + service tag. O patrimônio pode repetir em casos raros, por isso a busca desambigua pela service tag. O formato canônico do patrimônio é PREFIXO + 7 dígitos (ex.: WAP0004491). A service tag nunca muda; o patrimônio pode ser corrigido. Na lista de ativos e na ficha há um botão de copiar ao lado do número: um clique põe o patrimônio (ou a service tag) na área de transferência, para colar no chamado ou no e-mail.',
      },
      {
        tipo: 'nota',
        texto:
          'As sessões expiram em 24 horas — tanto o operador quanto o visualizador. Dentro da janela, nada interrompe o trabalho; passadas as 24h, o operador refaz o login e o visualizador redigita a senha. Revogar uma senha continua tendo efeito imediato.',
      },
      {
        tipo: 'paragrafo',
        texto:
          'Os documentos congelados (snapshots de relatório e termos gerados) guardam o texto da época — corrigir um patrimônio ou confirmar uma assinatura depois NÃO reescreve o que já foi congelado. O relatório ao vivo, sim, sempre reflete o dado atual.',
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// TEXTO PESQUISAVEL (compartilhado servidor <-> cliente via data-attribute)
// ---------------------------------------------------------------------------

function textoDoBloco(bloco: Bloco): string {
  switch (bloco.tipo) {
    case 'paragrafo':
    case 'nota':
      return bloco.texto
    case 'lista':
      return bloco.itens.join(' ')
    case 'passos':
      return [bloco.titulo ?? '', ...bloco.itens].join(' ')
    case 'glossario':
      return bloco.itens.map((v) => `${v.rotulo} ${v.descricao}`).join(' ')
    case 'movimentacoes':
      return bloco.itens
        .map((v) => `${v.rotulo} ${v.efeito} ${v.campos.map((c) => c.rotulo).join(' ')}`)
        .join(' ')
  }
}

// Todo o texto de uma secao, ja normalizado para a busca. O servidor grava isto
// no atributo data-ajuda-texto; o cliente compara com normalizarBusca(consulta).
export function textoDaSecao(secao: Secao): string {
  const bruto = [secao.titulo, ...secao.blocos.map(textoDoBloco)].join(' ')
  return normalizarBusca(bruto)
}

// Logica canonica da busca (espelhada pelo cliente sobre o DOM). Consulta vazia
// => todas as secoes. Testada em conteudo.test.ts.
export function filtrarSecoes(secoes: Secao[], consulta: string): Secao[] {
  const q = normalizarBusca(consulta)
  if (!q) return secoes
  return secoes.filter((s) => textoDaSecao(s).includes(q))
}
