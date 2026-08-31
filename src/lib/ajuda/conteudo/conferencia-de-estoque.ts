import { MAX_LINHAS_LOTE_ITEM } from '@/lib/validators/item'
import { TIPO_LANCAMENTO_META } from '@/lib/dominio'
import { PAPEL_ROTULO } from '@/lib/auth/papeis'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// REGRA DE OURO: o nome do tipo de lançamento que a conferência gera NÃO é
// digitado aqui — sai de `TIPO_LANCAMENTO_META`, o mesmo lugar de onde o seletor
// do diálogo o tira. Renomear o rótulo muda esta página no mesmo build.
const AJUSTE = TIPO_LANCAMENTO_META.ajuste.rotulo

export const conferenciaDeEstoque: PaginaAjuda = {
  slug: 'conferencia-de-estoque',
  titulo: 'Conferir o estoque (inventário)',
  resumo: 'Contar a prateleira de uma filial e registrar as diferenças de uma vez.',
  categoria: 'fazer',
  termos: [
    'conferencia',
    'conferir',
    'inventario',
    'contagem',
    'contado',
    'diferenca',
    'balanco',
    'acerto de estoque',
  ],
  legado: ['itens', 'como-fazer'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'A conferência é para quando você conta fisicamente o que está na prateleira e quer acertar o sistema com o que encontrou. Ela é de UMA filial por vez — o estoque é por filial, e você conta uma prateleira, não cinco. Só vale para itens por quantidade; equipamento com patrimônio tem ficha e movimentação próprias.',
    },
    {
      tipo: 'nota',
      texto: `O que a conferência faz no fim é gerar lançamentos de "${AJUSTE}", um por item que divergiu, com a mesma justificativa. Nada de novo acontece no sistema: é exatamente o que você faria à mão, sem a conta de cabeça e sem digitar item por item.`,
    },
    {
      tipo: 'lista',
      itens: [
        'O número que você confere é o ESTOQUE — o que está na prateleira. O que está reservado para um chamado ou saiu com alguém não está lá para ser contado, e por isso não entra nessa coluna.',
        'Pré-condição: você precisa poder registrar na filial que vai conferir. Quem só consulta vê os saldos, mas não abre a conferência.',
      ],
    },

    { tipo: 'titulo', id: 'conferencia', texto: 'Conferência de estoque (inventário)' },
    {
      tipo: 'passos',
      titulo: 'Conferir o estoque de uma filial',
      itens: [
        'Na página Itens, use "Conferir estoque". Se a tela estiver filtrada em UMA filial, ela já vem escolhida; senão, a conferência abre perguntando de qual filial ela é.',
        'A tabela mostra, por item: "Sistema" (o que o sistema diz que há), "Contado" (onde você digita) e "Diferença" (a conta, ao vivo). Sobra aparece em verde com sinal de mais; falta, em vermelho com sinal de menos.',
        'Preencha SÓ o que você contou. Linha em branco significa "não conferi" e fica de fora de tudo — não é o mesmo que contar zero. Se contou e não havia nada, digite 0: aí sim é uma contagem.',
        'A barra no rodapé acompanha o trabalho: quantos itens você conferiu, quantos divergem e o total que sobra e que falta.',
        'Pode sair e voltar: a conferência fica guardada nesta aba do navegador. Ao voltar, a tela pergunta "Continuar a conferência de {filial} começada às {hora}?" — responda "Continuar" para retomar de onde parou ou "Descartar" para começar do zero. Começar a digitar também conta como recomeçar.',
      ],
    },
    {
      tipo: 'passos',
      titulo: 'Registrar as diferenças',
      itens: [
        'Quando terminar de contar, use "Registrar diferenças (N)" — o número é quantos ajustes serão gravados. Só as linhas que divergem entram; as que bateram não geram lançamento nenhum.',
        'A confirmação lista cada ajuste, item por item, com o quanto vai para mais ou para menos. Confira essa lista: é ela que vai virar histórico.',
        'A observação vem preenchida com "Inventário de" e a data de hoje, e pode ser editada. Ela é a justificativa de TODOS os ajustes daquele registro — é o que alguém vai ler no histórico daqui a seis meses.',
        `Muitos itens? Os ajustes vão em blocos de ${MAX_LINHAS_LOTE_ITEM}, um depois do outro, com o andamento na tela. Você não precisa fazer nada: é só esperar.`,
        'Deu tudo certo: os saldos passam a bater com o que você contou, e o histórico de lançamentos mostra os ajustes com a observação do inventário.',
        'Refazer a mesma conferência logo depois deve dar tudo zerado — nenhuma diferença. É a maneira mais simples de confirmar que o acerto entrou.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'Falhou alguma linha (alguém lançou o mesmo item enquanto você conferia, por exemplo)? As demais entram do mesmo jeito. As que falharam ficam na tela com o motivo na própria linha, e o botão volta a oferecer só o que faltou — o que já foi registrado NÃO é gravado de novo, nem se você recarregar a página no meio.',
    },
    {
      tipo: 'lista',
      itens: [
        'Errou uma contagem depois de registrar? Não existe "desfazer conferência": corrija pelo histórico, estornando o ajuste errado, ou conferindo de novo com o número certo.',
        'Terminou uma filial e quer conferir outra? Use "Encerrar conferência" e o atalho para a próxima filial, que aparece ali mesmo.',
      ],
    },

    {
      tipo: 'tabela',
      colunas: ['Situação', 'O que significa', 'O que fazer'],
      linhas: [
        [
          'A conferência abre perguntando a filial',
          'Você entrou sem filtro de filial, ou com mais de uma filial marcada — não dá para adivinhar qual prateleira está na sua frente.',
          'Escolha a filial na própria tela.',
        ],
        [
          'O botão "Conferir estoque" não aparece',
          'O seu cargo não registra lançamentos, ou você não tem nenhuma filial vinculada.',
          `Peça a um ${PAPEL_ROTULO.admin} para vincular a filial, ou peça a um ${PAPEL_ROTULO.operador} da filial que faça a conferência.`,
        ],
        [
          'Nenhum item para conferir',
          'O catálogo de itens está vazio, ou nunca houve lançamento nessa filial.',
          'Cadastre os itens em Administração › Itens antes de conferir.',
        ],
        [
          'Estoque insuficiente: a operação deixaria o item com estoque negativo na prateleira.',
          'A baixa que a sua contagem gerou é maior do que o sistema tem — normalmente porque alguém lançou algo naquele item enquanto você contava.',
          'Recarregue a página, confira o número novo do sistema e refaça a contagem daquele item.',
        ],
        [
          'Ajuste inválido: deixaria o item com total negativo.',
          'A diferença pediria mais baixa do que o total daquele item na filial.',
          'Revise a contagem: o total nunca fica negativo.',
        ],
      ],
      legenda: 'O que aparece na conferência e como sair de cada caso.',
    },

    {
      tipo: 'links',
      itens: [
        { slug: 'saldos-e-estoque-minimo', texto: 'Ler os saldos antes de conferir' },
        { slug: 'lancar-itens', ancora: 'transferir', texto: 'Mover itens entre filiais' },
        { slug: 'itens-por-quantidade', texto: 'O que cada tipo de lançamento faz no saldo' },
      ],
    },
  ],
}
