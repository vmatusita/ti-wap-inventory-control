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
  type CampoMovimentacao,
  type RegraCampo,
} from '@/lib/validators/movimentacao'
import { MAX_LOTE_COMPRA } from '@/lib/patrimonio'
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
          'Falta — quanto falta para o estoque mínimo configurado (sinaliza reposição).',
        ],
      },
      {
        tipo: 'paragrafo',
        texto: 'Os lançamentos de item têm seis tipos, cada um com um efeito no saldo:',
      },
      { tipo: 'glossario', badge: 'tipoLanc', itens: verbetesTipoLancamento() },
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
          'As pendências são só para o operador — o visualizador não as vê. Na linha de um termo você confirma a assinatura ali mesmo, sem abrir a ficha.',
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
    ],
  },
  {
    id: 'como-fazer',
    titulo: 'Como fazer (passo a passo)',
    blocos: [
      {
        tipo: 'passos',
        titulo: 'Registrar uma nova movimentação (em lote)',
        itens: [
          'Abra Movimentações › Nova (atalho: tecla N em qualquer tela).',
          'Selecione um ou mais ativos (o lote aceita até 10 de uma vez).',
          'Escolha o tipo — só aparecem os tipos válidos para o estado de TODOS os ativos escolhidos.',
          'Preencha os campos pedidos (os obrigatórios variam por tipo) e confirme.',
        ],
      },
      {
        tipo: 'passos',
        titulo: 'Dar entrada de ativos por compra',
        itens: [
          'Use o fluxo de compra para cadastrar ativos novos: um por vez, colando uma lista, ou por faixa de patrimônio.',
          `A faixa e a lista aceitam no máximo ${MAX_LOTE_COMPRA} unidades por vez.`,
          'Cada ativo entra como Em estoque.',
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
          'Escolha o tipo (Entrada, Liberação, Atrelar, Devolução, Retorno ou Ajuste) — cada um afeta Total/Estoque de um jeito.',
          'Informe a quantidade e, quando fizer sentido, a pessoa/chamado. O Ajuste pede justificativa.',
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
          'Usuários — convites de novos operadores. Só e-mails @wap.ind.br podem ser convidados.',
          'Senhas de acesso — senhas que dão ao visualizador acesso só aos relatórios. Revogar uma senha tem efeito imediato, no request seguinte.',
          'Filiais — cadastro das filiais.',
          'Motivos — o vocabulário de motivos oferecido na tela de movimentação.',
          'Itens — o catálogo de itens por quantidade (nome, grupo, estoque mínimo).',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Não existe tela de importação. A carga inicial de dados é feita por script, uma única vez, no go-live.',
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
          'Operador — login com e-mail @wap.ind.br. Vê e opera tudo. Nível único (não há papéis nem hierarquia de operador).',
          'Visualizador — entra por uma senha de acesso e só enxerga os relatórios (/relatorios). Não vê ativos, pendências, esta ajuda nem a operação.',
        ],
      },
      {
        tipo: 'paragrafo',
        texto:
          'Identidade do equipamento: a chave de um ativo é o PAR patrimônio + service tag. O patrimônio pode repetir em casos raros, por isso a busca desambigua pela service tag. O formato canônico do patrimônio é PREFIXO + 7 dígitos (ex.: WAP0004491). A service tag nunca muda; o patrimônio pode ser corrigido.',
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
