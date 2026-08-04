import { verbetesTermo } from '@/lib/ajuda/derivacao'
import { CATEGORIA_META, STATUS_META, TIPO_META } from '@/lib/dominio'
import { TERMO_ROTULO, TERMO_TIPOS, familiaDoTipo } from '@/lib/termos/tipos'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'
import type { TermoStatus } from '@/lib/dominio'

// PROSA por enum: o TypeScript exige um texto para todo status de termo novo.
const DESC_TERMO: Record<TermoStatus, string> = {
  nao: 'Nenhum termo emitido ainda. Conta como pendência.',
  gerado:
    'Documento .docx emitido pelo sistema, ainda sem assinatura. Continua como pendência — a cobrança não afrouxa.',
  enviado:
    'Termo entregue ao colaborador, mas sem a assinatura confirmada. Ainda pendente.',
  sim: 'Assinatura confirmada. É o ÚNICO status que encerra a pendência do termo.',
}

const T = TIPO_META
const S = STATUS_META

// Os 7 modelos .docx, DERIVADOS de src/lib/termos/tipos.ts — modelo novo entra
// na tabela sozinho, sem ninguem lembrar de editar este texto.
const LINHAS_MODELOS = TERMO_TIPOS.map((t) => [
  TERMO_ROTULO[t],
  familiaDoTipo(t) === 'devolucao' ? 'Devolução' : 'Responsabilidade',
])

export const termosDeResponsabilidade: PaginaAjuda = {
  slug: 'termos-de-responsabilidade',
  titulo: 'Termos de responsabilidade',
  resumo: 'Gerar o .docx, confirmar a assinatura e desfazer.',
  categoria: 'fazer',
  termos: [
    'termo',
    'assinatura',
    'docx',
    'responsabilidade',
    'documento',
    'devolucao',
    'termo de responsabilidade',
    'gerar termo',
  ],
  legado: ['como-fazer', 'termos'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Quando um ativo sai para um colaborador, gera-se o termo de responsabilidade (.docx). O status do termo acompanha o ciclo do papel e só se encerra quando a assinatura é confirmada.',
    },
    { tipo: 'glossario', badge: 'termo', itens: verbetesTermo(DESC_TERMO) },
    {
      tipo: 'nota',
      texto:
        'Apenas o status "Assinado" tira o ativo das pendências de termo. "Gerado" e "Enviado" continuam cobrando. O sistema não recebe upload do PDF assinado — a confirmação registra apenas a data e quem confirmou.',
    },
    {
      tipo: 'nota',
      texto: `Quem é cobrado por termo: só o equipamento que está "${S.em_uso.rotulo}" ou "${S.emprestado.rotulo}" — ou seja, que está com alguém. Equipamento "${S.reservado.rotulo}", em estoque ou em manutenção não abre pendência de termo. Há uma exceção a mais: o acervo que entrou pelo import de startup de uma filial não é cobrado por termo, porque o controle de papel não existia nas planilhas antigas. Gerar o termo de um equipamento importado continua permitido pela ficha — ele só não é exigido.`,
    },
    { tipo: 'titulo', id: 'termo-modelos', texto: 'Os modelos disponíveis' },
    {
      tipo: 'tabela',
      colunas: ['Modelo', 'Família'],
      linhas: LINHAS_MODELOS,
      legenda:
        'O modelo é escolhido pelo sistema a partir da categoria do equipamento (e, na devolução, do motivo). Monitor é o único que pergunta: como há duas variantes, o diálogo mostra o campo "Modelo do termo".',
    },
    {
      tipo: 'lista',
      itens: [
        `As categorias ${CATEGORIA_META.tablet.rotulo} e ${CATEGORIA_META.outro.rotulo} não têm modelo de termo de responsabilidade: para elas o botão de gerar não aparece, e a tela de sucesso avisa "As categorias deste lote não têm modelo de termo.".`,
        `Os termos de responsabilidade saem de uma "${T.saida.rotulo}" ou de um "${T.emprestimo.rotulo}"; os de devolução, de uma "${T.devolucao.rotulo}".`,
        'O termo de devolução é UM documento para o lote inteiro: devolveu quatro equipamentos de uma vez, sai um só, listando todos.',
      ],
    },
    { tipo: 'titulo', id: 'gerar', texto: 'Gerar o documento' },
    {
      tipo: 'passos',
      titulo: 'Gerar o termo de responsabilidade',
      itens: [
        'Na ficha, gere o termo (.docx). Você pode pré-visualizar, editar e baixar o documento.',
        'Ao gerar, o termo fica com status "Gerado" — que ainda conta como pendência até a assinatura ser confirmada.',
        'Há três portas para o mesmo diálogo: a tela de sucesso logo depois de registrar a movimentação (botão "Gerar termo" / "Gerar próximo termo"), o card "Termos" da ficha do ativo (botões "Responsabilidade" e "Devolução") e a lista da página Pendências, que leva à ficha.',
        'O diálogo abre com tudo preenchido a partir da movimentação — "Colaborador", "Marca", "Modelo", "Service Tag", "Patrimônio", "Chamado", a "Cidade da assinatura" e a "Data do termo". Celular traz ainda "Nº do telefone", "IMEI" e "Pulsus" já preenchidos do cadastro do aparelho, mais "Observação do aparelho", que é do documento e continua digitado na hora.',
        'A "Cidade da assinatura" é a cidade da filial do equipamento e sai na última linha do documento, antes das assinaturas. Se a filial ainda não tem cidade cadastrada, o diálogo avisa — cadastre em Administração › Filiais, ou escreva ali mesmo. Num lote com equipamentos de filiais diferentes ele usa a do primeiro e avisa, para você conferir. A cláusula de foro do termo NÃO muda: ela é da sede da empresa.',
        'Todos os campos são editáveis, inclusive a data: "Confira e edite os campos — tudo é editável, inclusive a data. As edições valem só para o documento." Corrigir aqui muda o papel, não a ficha do ativo.',
        'Clique em "Gerar e visualizar". O documento aparece na própria tela ("Pré-visualização do documento final. O arquivo baixado é fiel ao que aparece aqui.") e o título vira "Termo gerado".',
        'Use "Baixar .docx" para salvar e imprimir, ou "Editar" para voltar aos campos e gerar de novo.',
        'Cada termo emitido fica listado no card "Termos" da ficha, com o colaborador, quem gerou e a data/hora, mais os botões "Editar" e "Baixar" — dá para rebaixar o mesmo documento quando quiser.',
      ],
    },
    { tipo: 'titulo', id: 'assinatura', texto: 'Encerrar a pendência' },
    {
      tipo: 'passos',
      titulo: 'Confirmar a assinatura do termo',
      itens: [
        'Na ficha (ou direto na linha da página Pendências), use "Confirmar assinatura".',
        'Informe a data da assinatura (padrão: hoje; não pode ser futura).',
        'O status vira "Assinado" — o único que encerra a pendência — e fica uma anotação na linha do tempo com quem confirmou. Há a ação de desfazer, se preciso.',
        'Na ficha, a faixa passa a mostrar "Termo assinado" com a data, e no lugar do botão de confirmar aparece "Desfazer".',
        'Confirmou o termo errado? "Desfazer" devolve o termo à condição de pendente e o ativo volta às pendências; a ação também fica registrada na linha do tempo.',
      ],
    },
    { tipo: 'titulo', id: 'termo-bastidores', texto: 'O que acontece por trás' },
    {
      tipo: 'lista',
      itens: [
        'Gerar o documento NÃO confirma nada: o ativo continua na fila de pendências até alguém confirmar a assinatura.',
        'A confirmação grava a data e o seu nome, muda o campo "Termo" do card "Dados do ativo" e tira a linha da página Pendências no mesmo instante.',
        'O contador de pendências do menu lateral e o card "Pendências" do painel inicial acompanham sozinhos.',
        'Na tabela "Saídas" do relatório existe a coluna "Termo": é por ela que se enxerga, de uma vez, quem entregou equipamento sem papel assinado.',
        'O arquivo .docx fica guardado e continua disponível pelo botão "Baixar" da ficha — não é preciso gerar de novo para reimprimir.',
      ],
    },
    { tipo: 'titulo', id: 'termo-erros', texto: 'Erros comuns e como sair' },
    {
      tipo: 'tabela',
      colunas: ['O que aparece na tela', 'O que fazer'],
      linhas: [
        [
          'Não aparece botão de gerar termo na ficha',
          'Ou o ativo não tem movimentação de entrega/devolução que sirva de base, ou a categoria não tem modelo, ou já existe um termo cobrindo aquela movimentação — nesse caso use "Editar" na lista do card "Termos".',
        ],
        [
          '"As categorias deste lote não têm modelo de termo."',
          `Nenhum equipamento do lote é de uma categoria com modelo. ${CATEGORIA_META.tablet.rotulo} e ${CATEGORIA_META.outro.rotulo} não têm.`,
        ],
        [
          '"Não foi possível montar o documento do termo."',
          'O modelo não pôde ser preenchido. Confira se os campos obrigatórios do diálogo estão preenchidos e tente de novo.',
        ],
        [
          '"Este termo já consta como assinado."',
          'Alguém confirmou a assinatura antes de você. Atualize a ficha.',
        ],
        [
          '"Só é possível desfazer um termo confirmado como assinado."',
          'O termo já está pendente — não há o que desfazer.',
        ],
        [
          '"Não foi possível preparar o termo. Verifique sua conexão e tente de novo."',
          'Falha de rede antes de montar o documento. Nada foi gerado: repita.',
        ],
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'resolver-pendencias' },
        { slug: 'registrar-movimentacao' },
        { slug: 'ficha-do-ativo' },
        { slug: 'entregar-emprestar-reservar', texto: 'A entrega que dá origem ao termo' },
        { slug: 'devolucao-e-triagem', texto: 'O termo de devolução' },
      ],
    },
  ],
}
