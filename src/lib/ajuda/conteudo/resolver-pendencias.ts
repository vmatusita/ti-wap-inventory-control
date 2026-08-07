import {
  ROTULO_TIPO_PENDENCIA,
  type TipoPendencia,
} from '@/lib/pendencias/rotulos'
import { DESFECHO_PENDENCIA_ITEM_ROTULO } from '@/lib/dominio'
// F28/PND-04 — os limiares de idade da fila vêm da MESMA constante que colore o
// badge; digitá-los aqui deixaria a doc envelhecer sozinha (e o teste da ajuda
// recusa número de teto escrito à mão).
import {
  PENDENCIA_ATENCAO_DIAS,
  PENDENCIA_CRITICA_DIAS,
} from '@/lib/pendencias/idade'
import type { PaginaAjuda, Verbete } from '@/lib/ajuda/tipos'

// REGRA DE OURO: os rotulos dos tipos de pendencia NAO sao digitados aqui — saem
// de `ROTULO_TIPO_PENDENCIA`, a mesma fonte do selo da tabela e do arquivo CSV, e
// os dois desfechos do item faltante saem de `DESFECHO_PENDENCIA_ITEM_ROTULO`
// (dominio.ts, fonte unica do vocabulario De→Para). A PROSA mora aqui, num
// `Record` por tipo: tipo novo nao compila sem texto.
const DESFECHO_RECUPERADO = DESFECHO_PENDENCIA_ITEM_ROTULO.recuperado
const DESFECHO_BAIXA = DESFECHO_PENDENCIA_ITEM_ROTULO.baixa

const DESC_PENDENCIA: Record<TipoPendencia, string> = {
  termo:
    'Ativo entregue cujo termo ainda não foi confirmado como assinado (status diferente de "Assinado"). Resolve-se confirmando a assinatura. EXCEÇÃO: ativo que veio do import de startup NÃO é cobrado por termo — o acervo herdado da planilha não entra nesta fila. A cobrança continua valendo para tudo que foi cadastrado no sistema, e gerar o termo de um ativo importado continua permitido; só não é exigido.',
  itens:
    `Um acessório que não voltou numa devolução (mochila, carregador…). Cada item marcado no checklist da devolução vira uma linha própria, presa àquela devolução e ao COLABORADOR DA ÉPOCA (quem devia devolver) — não ao dono atual do ativo, que segue circulando livre: se o ativo sair para outra pessoa, a pendência continua apontando quem devia. Encerra-se aqui mesmo, por ação manual com desfecho ("${DESFECHO_RECUPERADO}" ou "${DESFECHO_BAIXA}", observação opcional), uma de cada vez ou em lote com uma justificativa só; a linha resolvida sai da fila mas fica na ficha do ativo, para auditoria (desfecho, quem e quando). Um desfecho errado tem conserto: só o nível administrador reabre a pendência, com justificativa — a reabertura entra na mesma linha do tempo. Ativos vindos do import de startup NÃO abrem essa pendência — mesmo critério do termo de responsabilidade (o legado da planilha não inunda a fila).`,
  triagem:
    'Ativo devolvido parado em triagem há mais de 7 dias, aguardando a conferência. Resolve-se registrando a movimentação de triagem (Triagem OK) depois de conferir os acessórios — o botão "Movimentar" da própria linha da fila já abre o registro com o ativo selecionado.',
  patrimonio:
    'Equipamento cuja PLAQUETA não está resolvida: importado sem patrimônio físico, ou com patrimônio fora do padrão da casa (herdado da planilha). Resolve-se direto na linha da fila, com "Definir patrimônio" / "Corrigir patrimônio" — ou pela ficha do ativo, pelo menu "⋯" ("Mais ações"), se preferir.',
  conflito:
    'O MESMO equipamento aparece cadastrado em duas filiais ao mesmo tempo — sempre nasce de um import de startup que trouxe uma máquina que já existia em outra unidade. Os dois cadastros ficam de pé, e a aba "Conflitos entre filiais" mostra os dois lado a lado, com as diferenças realçadas e o histórico de cada um (quantas movimentações, quantos termos, qual foi a última). Resolve-se decidindo qual é o cadastro certo e apagando o outro ali mesmo — só quem é administrador vê os botões. Apagar é definitivo e leva junto o histórico daquele cadastro, então a decisão é do administrador que olhou os dois lados.',
  outras:
    'Demais situações que a TI anotou no próprio ativo e precisa acompanhar — entre elas o "sem service tag" de um equipamento que veio do import com plaqueta mas sem a etiqueta do fabricante. (Quando falta também o patrimônio, a linha aparece na aba "Patrimônio", que vem primeiro.) A service tag se informa na ficha, pelo menu "⋯", em "Definir service tag"; as demais se encerram quando o texto da pendência é resolvido no ativo.',
}

const VERBETES_PENDENCIA: Verbete[] = (
  Object.keys(ROTULO_TIPO_PENDENCIA) as TipoPendencia[]
).map((t) => ({
  chave: t,
  rotulo: ROTULO_TIPO_PENDENCIA[t],
  descricao: DESC_PENDENCIA[t],
}))

// O numeral por extenso — como o operador lê — DERIVADO do tamanho da
// constante: um tipo de pendência novo muda a palavra sozinho.
const POR_EXTENSO = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez']
const QUANTOS_TIPOS = POR_EXTENSO[Object.keys(ROTULO_TIPO_PENDENCIA).length]

export const resolverPendencias: PaginaAjuda = {
  slug: 'resolver-pendencias',
  titulo: 'Resolver as pendências',
  resumo:
    'Termo, patrimônio, service tag e itens faltantes — cada um com a sua saída.',
  categoria: 'fazer',
  termos: [
    'pendencia',
    'fila',
    'termo',
    'faltante',
    'triagem',
    'regularizar',
    'patrimonio',
    'service tag',
    'lote',
    'sem service tag',
    'faltando',
  ],
  legado: ['pendencias', 'como-fazer'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        `A página Pendências reúne, para uso interno da TI, tudo que precisa de ação. Termo, Triagem, Patrimônio e Outras são calculadas ao vivo — resolveu, saem da lista no próximo carregamento. Itens faltantes têm registro próprio, encerrado por ação manual com desfecho (item recuperado ou baixa). ${QUANTOS_TIPOS[0].toUpperCase()}${QUANTOS_TIPOS.slice(1)} tipos:`,
    },
    { tipo: 'glossario', badge: 'neutro', itens: VERBETES_PENDENCIA },
    {
      tipo: 'nota',
      texto:
        'As pendências são só para o operador — o visualizador não as vê. Na linha de um termo você confirma a assinatura ali mesmo, sem abrir a ficha, e pode marcar vários termos e confirmar todos de uma vez com UMA data única; na linha de um item faltante você resolve com o desfecho (recuperado ou baixa) ali mesmo, e pode marcar vários itens e resolver em lote com uma justificativa só — os dois caminhos servem para zerar a fila herdada. Marcando termos e itens ao mesmo tempo, a barra que aparece mostra as duas ações lado a lado, cada uma com a contagem do seu próprio grupo ("3 termos · 2 itens faltantes selecionados"), para nunca confirmar ou resolver o conjunto errado. No menu lateral, o item "Pendências" traz um selo âmbar com quantas estão abertas (a contagem se atualiza a cada navegação; zerou, o selo some).',
    },

    { tipo: 'titulo', id: 'pendencias-tela', texto: 'Ler a fila' },
    {
      tipo: 'lista',
      itens: [
        'Os chips do topo mostram a contagem por tipo, e cada um só aparece quando tem alguma coisa em aberto: "termos de responsabilidade pendentes", "itens faltantes de devoluções", "ativos aguardando triagem", "patrimônios a acertar", "conflitos entre filiais" e "outras pendências". Sem nada aberto, a tela diz "Nenhuma pendência aberta. 🎉".',
        'As abas, logo abaixo dos chips, filtram por tipo: "Todas", "Termos", "Itens faltantes", "Triagem", "Patrimônio", "Conflitos entre filiais" e "Outras". Ao lado, a busca por patrimônio ou colaborador e o botão de filial, que abre um painel de caixas e aceita mais de uma marcada — quem é Operador já entra com as filiais dele marcadas. "Limpar" desfaz tudo.',
        'A aba "Conflitos entre filiais" é diferente das outras: em vez de uma lista de linhas, ela mostra os cadastros do mesmo equipamento LADO A LADO, um bloco por conflito. As demais abas nunca trazem essas linhas — o conflito tem casa própria e não aparece duas vezes.',
        'A tabela traz "Tipo", "Patrimônio", "Modelo", "Colaborador", "Setor", "Filial", "Desde" e "Ação". Sob o tipo aparece, em letra menor, o texto da própria pendência — o que exatamente está pendente naquela linha; quando ele não cabe, o texto inteiro aparece ao passar o mouse (ou tocar).',
        `A coluna "Desde" mostra a data e há quanto tempo aquilo está aberto ("hoje", "há 1 dia", "há N dias") — e ganha destaque conforme envelhece: acima de ${PENDENCIA_ATENCAO_DIAS} dias fica em âmbar, acima de ${PENDENCIA_CRITICA_DIAS} dias em vermelho. A cor não é o único aviso: o motivo do destaque aparece ao passar o mouse.`,
        'Quando o equipamento ainda não tem plaqueta, o lugar do patrimônio traz "sem patrimônio — abrir ficha", que é link para a ficha como qualquer outro — antes ali havia só um travessão, que não dizia nada nem para quem usa leitor de tela.',
        'A ação da linha depende do tipo: "Confirmar assinatura" nos termos, "Resolver" nos itens faltantes, "Definir patrimônio" (ou "Corrigir patrimônio") na aba Patrimônio e "Movimentar" na Triagem — que já abre o registro de movimentação com o ativo selecionado. Só a aba "Outras" (falta a service tag) segue exigindo abrir a ficha, pelo menu "⋯".',
        '"Exportar CSV" leva para o Excel exatamente as pendências que estão filtradas na tela.',
        'A tela vazia distingue os casos: sem nada aberto, "Nenhuma pendência aberta 🎉"; com filtro, "Nenhuma pendência neste filtro" — e o texto avisa que isso não quer dizer que não haja pendências, é só a combinação de filtros.',
      ],
    },

    { tipo: 'titulo', id: 'pendencias-termo', texto: 'Encerrar um termo' },
    {
      tipo: 'passos',
      titulo: 'Confirmar a assinatura pela fila de pendências',
      itens: [
        'Filtre pela aba "Termos" e localize o ativo (a busca aceita patrimônio ou colaborador).',
        'Use "Confirmar assinatura" na própria linha — não é preciso abrir a ficha.',
        'Informe a data da assinatura (padrão hoje, nunca futura) e confirme. O termo passa a "Assinado", que é o único status que encerra essa pendência, e a linha sai da fila no próximo carregamento.',
        'Ativo trazido pelo import de startup não aparece nesta aba: ele não é cobrado por termo. Isso não impede gerar o termo dele pela ficha, se você quiser o documento.',
      ],
    },
    {
      tipo: 'passos',
      titulo: 'Confirmar vários termos de uma vez (a pilha do mutirão)',
      itens: [
        'Quando volta uma pilha de termos assinados de uma vez (um mutirão de coleta de assinatura), marque a caixa de seleção de cada linha de termo — a mesma caixa que aparece nas linhas de item faltante, mas com o próprio universo: marcar termos não mexe na seleção de itens, e vice-versa.',
        'A barra que aparece no topo mostra "Confirmar assinatura (N)" com o total de termos marcados.',
        'Informe UMA data — ela vale para todos os termos marcados, porque a pilha inteira foi assinada no mesmo mutirão. Confirme, e todos os N saem da fila juntos.',
        'Se algum dos marcados já tiver sido confirmado por outra pessoa entre você abrir a fila e clicar (corrida rara), o aviso final é honesto sobre isso: diz quantos foram confirmados agora e quantos já estavam assinados.',
      ],
    },

    { tipo: 'titulo', id: 'item-faltante', texto: 'Encerrar um item faltante' },
    {
      tipo: 'passos',
      titulo: 'Resolver uma pendência de item faltante',
      itens: [
        'Abra Pendências e vá ao bloco "Itens faltantes": cada linha é UM item que não voltou, com o patrimônio do ativo, o colaborador da época (o da devolução, não o dono atual) e desde quando está aberta.',
        `Na linha, use "Resolver" e escolha o desfecho: "${DESFECHO_RECUPERADO}" (o acessório apareceu) ou "${DESFECHO_BAIXA}" (encerrar sem retorno). A observação é opcional.`,
        'Para limpar a fila herdada de uma vez, marque várias linhas nas caixas de seleção e resolva em lote — uma justificativa vale para todas as marcadas. A barra que aparece mostra quantos itens estão selecionados e traz "Resolver itens (N)".',
        'Resolver encerra a pendência: a linha sai da fila, do selo do menu e do CSV, mas continua na ficha do ativo com o desfecho, quem resolveu e quando — é o rastro de auditoria. Um desfecho errado não é definitivo para sempre: veja "Reabrir uma pendência de item resolvida", logo abaixo.',
        'A pendência é sempre do colaborador daquela devolução: se o ativo já saiu para outra pessoa, resolver aqui não mexe no novo dono nem faz surgir "dívida" para ele.',
        'Se a rede cair no envio, o aviso afirma o não-efeito ("nenhuma pendência foi resolvida") — recarregue a fila antes de tentar de novo.',
      ],
    },
    {
      tipo: 'passos',
      titulo: 'Reabrir uma pendência de item resolvida',
      itens: [
        'Um desfecho errado tem conserto — baixa marcada no lugar de recuperado, ou um item a mais resolvido no lote. Só o nível administrador (Administrador ou Desenvolvedor) reabre; quem tem cargo Operador ou Consulta não vê o botão.',
        'Na ficha do ativo, no bloco "Itens faltantes da devolução", a linha resolvida (com o texto riscado) traz "Reabrir pendência" para quem tem o cargo.',
        'É preciso escrever uma justificativa — sem ela o botão fica desabilitado. A pendência volta a "aberta" (reaparece na fila, no selo do menu e no CSV) e o desfecho anterior é apagado.',
        'A reabertura fica registrada na linha do tempo do ativo, com o seu nome, a data e a justificativa — o mesmo rastro de auditoria que a resolução original deixou.',
      ],
    },

    {
      tipo: 'titulo',
      id: 'pendencias-identificacao',
      texto: 'Encerrar patrimônio e service tag',
    },
    {
      tipo: 'passos',
      titulo: 'Resolver uma pendência de identificação',
      itens: [
        'Na aba "Patrimônio" (falta a plaqueta), use "Definir patrimônio" (ou "Corrigir patrimônio") direto na linha — não é preciso abrir a ficha.',
        'Na aba "Outras" (falta só a service tag), abra a ficha do ativo pela linha e use o menu "⋯" ("Mais ações") → "Definir service tag".',
        'Cada definição fica registrada na linha do tempo, com seu nome e a data, e encerra a pendência correspondente no próximo carregamento da fila.',
        'A service tag só pode ser definida enquanto estiver vazia — depois disso ela é imutável e o item some do menu.',
      ],
    },

    {
      tipo: 'titulo',
      id: 'pendencias-conflito',
      texto: 'Resolver um conflito entre filiais',
    },
    {
      tipo: 'paragrafo',
      texto:
        'Um conflito é o MESMO equipamento cadastrado em duas unidades ao mesmo tempo. Ele sempre nasce de um import de startup que trouxe uma máquina que já existia em outra filial — o import deixa os dois cadastros de pé de propósito, porque quem sabe qual está certo é uma pessoa, não a planilha. Cada conflito conta como UMA pendência no selo do menu, mesmo tendo dois cadastros: é uma decisão só a tomar.',
    },
    {
      tipo: 'passos',
      titulo: 'Decidir qual cadastro fica',
      itens: [
        'Abra Pendências e vá à aba "Conflitos entre filiais". Em vez de uma lista de linhas, ela mostra um bloco por conflito, com os cadastros LADO A LADO.',
        'Os campos que DIFEREM entre os dois vêm realçados — estado, colaborador, modelo, hostname, data de entrada. O que é igual fica sem destaque, para o olho ir direto ao que importa.',
        'Embaixo de cada lado vem o resumo de histórico: quantas movimentações, quantos termos e qual foi a última movimentação. O lado que tem movimentação ALÉM da carga do import ganha um alerta próprio — é quase sempre o cadastro em uso.',
        'Use "Ficha" para abrir qualquer um dos dois e conferir a linha do tempo inteira antes de decidir.',
        'Decidido, marque a caixa do cadastro errado e use "Apagar selecionados". Para tocar o conflito inteiro de uma vez existe "Apagar ambos"; e dá para marcar cadastros de conflitos diferentes e apagar todos numa operação só.',
        'O sistema pede uma justificativa e a confirmação da QUANTIDADE ("APAGAR 2", por exemplo) — o número está ali para obrigar a conferir quantos vão embora. Se algum dos marcados tiver histórico próprio, um aviso destacado diz quanto se perde antes de você confirmar.',
        'Apagar é definitivo e leva junto o histórico daquele cadastro. Fica registrado na trilha de auditoria, com quem apagou, quando, a justificativa e uma cópia do que foi apagado.',
        'Resolvido, o bloco some da aba sozinho — o conflito não é um registro que se encerra, é uma situação que deixa de existir.',
      ],
    },
    {
      tipo: 'nota',
      texto:
        'Só quem é administrador vê as caixas de seleção e os botões de apagar. Todo mundo enxerga a aba, os dois lados e as diferenças — acompanhar o problema é de todos; desfazer é de quem responde por isso. E se o aparelho de fato mudou de unidade, o caminho não é este: apague o cadastro duplicado e registre a transferência pelo fluxo normal, que preserva o histórico. Aliás, enquanto o conflito existir, transferir um dos dois para a unidade do outro é recusado — os dois não podem ficar na mesma filial.',
    },

    {
      tipo: 'links',
      itens: [
        { slug: 'termos-de-responsabilidade' },
        { slug: 'devolucao-e-triagem' },
        { slug: 'ficha-do-ativo', ancora: 'patrimonio', texto: 'Corrigir patrimônio e service tag na ficha' },
        { slug: 'import-de-startup' },
      ],
    },
  ],
}
