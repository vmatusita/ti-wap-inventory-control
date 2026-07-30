import { TIPO_META } from '@/lib/dominio'
import { TIPOS_EXCLUIDOS_DO_KIT } from '@/lib/validators/kit'
import { PAPEL_ROTULO } from '@/lib/auth/papeis'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

const T = TIPO_META

// REGRA DE OURO: a lista dos tipos que NAO entram no seletor do kit vem de
// TIPOS_EXCLUIDOS_DO_KIT — se um tipo entrar ou sair da exclusao, o texto muda no
// mesmo build. Sao quatro hoje, nao dois.
const ROTULOS_EXCLUIDOS = TIPOS_EXCLUIDOS_DO_KIT.map((t) => `"${T[t].rotulo}"`)
const EXCLUIDOS_DO_KIT = `${ROTULOS_EXCLUIDOS.slice(0, -1).join(', ')} e ${
  ROTULOS_EXCLUIDOS[ROTULOS_EXCLUIDOS.length - 1]
}`

export const kitsDeMovimentacao: PaginaAjuda = {
  slug: 'kits-de-movimentacao',
  titulo: 'Criar e aplicar um kit',
  resumo: 'Modelos do passo 2 para o que se repete toda semana.',
  categoria: 'fazer',
  termos: [
    'kit',
    'modelo',
    'novo colaborador',
    'checklist',
    'categorias esperadas',
    'repetir ultima',
  ],
  legado: ['como-fazer', 'movimentacoes'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Crie um kit quando a mesma configuração do passo 2 se repete toda semana — a entrega padrão de um colaborador novo, a devolução de desligamento. Um kit não movimenta nada sozinho: ele só preenche o formulário por você. Para algo que acontece uma vez, não vale criar kit; use "Repetir última", que traz a configuração da sua última movimentação.',
    },
    {
      tipo: 'nota',
      texto:
        'Kits de movimentação: um kit é um MODELO salvo do passo 2 (tipo, motivo, termo e observação padrão) mais a lista de categorias que costumam ir juntas — por exemplo "Kit novo colaborador" = Saída · Novo colaborador · termo Gerado, esperando Notebook, Monitor e Celular. Os kits são criados e editados em Administração › Kits e aplicados no passo 2 pelo botão "Aplicar kit", ao lado de "Repetir última" (o botão só existe quando há kit ativo). Aplicar SUBSTITUI os quatro campos, inclusive apagando o que o kit não define — o aviso na tela diz isso. A lista de categorias é só um CHECKLIST informativo: ele mostra o que falta no lote, some sozinho quando você acrescenta o que faltava e NUNCA impede registrar. Kit é cópia: desativar ou editar um kit não altera nenhuma movimentação já registrada, e o kit não fica gravado na movimentação.',
    },
    { tipo: 'titulo', id: 'kit-passos', texto: 'Criar e aplicar' },
    {
      tipo: 'passos',
      titulo: 'Criar e aplicar um kit de movimentação',
      itens: [
        `Para criar: Administração › Kits › "Novo kit". Dê um nome ("Kit novo colaborador"), escolha o tipo (${EXCLUIDOS_DO_KIT} não entram na lista), o motivo, o termo e uma observação padrão — e marque as categorias que costumam ir juntas (Notebook, Monitor, Celular…). Ao menos uma categoria é obrigatória.`,
        'Trocar o tipo dentro do kit limpa o motivo que não vale para o tipo novo e o termo, quando o tipo novo não pede termo: o modelo não pode nascer inaplicável. Kit não se exclui — desmarque "Kit ativo" para tirá-lo do fluxo.',
        `Criar e editar kit é do cargo ${PAPEL_ROTULO.admin}, porque o cadastro mora na Administração. APLICAR um kit é de quem registra: o cargo ${PAPEL_ROTULO.operador} usa os kits normalmente, nas filiais dele.`,
        'Para aplicar: no passo 2 da nova movimentação, clique em "Aplicar kit" (ao lado de "Repetir última") e escolha o kit. O botão só aparece quando existe kit ativo.',
        'Aplicar SUBSTITUI tipo, motivo, termo e observação — inclusive apagando o que o kit não define. O aviso na tela diz que os campos foram substituídos; aplicar o mesmo kit duas vezes dá sempre o mesmo resultado.',
        'Kit de um tipo que não vale para os ativos do lote NÃO é aplicado pela metade: nada muda e o aviso explica por quê. (É diferente de "Repetir última", que aplica o que der.) Se o motivo salvo no kit tiver sido desativado depois, o resto é aplicado e o campo Motivo fica vazio, com aviso.',
        'O bloco âmbar com as categorias esperadas é só um CHECKLIST: mostra o que ainda não está no lote, some sozinho quando você volta ao passo 1 e acrescenta o que faltava, e nunca impede registrar. "Dispensar" fecha o bloco sem mexer nos campos.',
        'Kit é cópia: o que já foi registrado não guarda vínculo com o kit — desativar ou editar um modelo depois não altera nenhuma movimentação passada.',
      ],
    },
    { tipo: 'titulo', id: 'kit-campos', texto: 'O que cabe dentro de um kit' },
    {
      tipo: 'tabela',
      colunas: ['Campo do kit', 'O que guarda', 'Obrigatório?'],
      linhas: [
        ['"Nome"', 'como o kit aparece no menu "Kits salvos" (até 80 caracteres)', 'Sim'],
        [
          '"Tipo de movimentação"',
          `o tipo que será preenchido no passo 2 — ${EXCLUIDOS_DO_KIT} não entram, porque têm caminho próprio (tela de compra, botão "Estornar" e a tela de devolução ao fornecedor, que também é quem cria a troca)`,
          'Sim',
        ],
        ['"Motivo (opcional)"', 'o motivo do catálogo; "Sem motivo" deixa o campo vazio', 'Não'],
        [
          '"Termo de responsabilidade (opcional)"',
          'em que pé o termo já entra; "Não informar" deixa em branco',
          'Não',
        ],
        [
          '"Categorias esperadas"',
          'o checklist do lote — "Viram um checklist informativo no fluxo — nunca bloqueiam o registro."',
          'Sim, ao menos uma',
        ],
        [
          '"Observação padrão (opcional)"',
          'texto que já vem preenchido na observação da movimentação',
          'Não',
        ],
      ],
      legenda:
        'O kit NÃO guarda ativos, colaborador, setor, chamado nem data — essas coisas mudam a cada movimentação.',
    },
    { tipo: 'titulo', id: 'kit-erros', texto: 'Erros comuns e como sair' },
    {
      tipo: 'tabela',
      colunas: ['O que aparece na tela', 'O que fazer'],
      linhas: [
        [
          'O botão "Aplicar kit" não aparece',
          'Não existe nenhum kit ativo. Crie um em Administração › Kits, ou marque "Kit ativo" em um que foi desativado.',
        ],
        [
          '"O kit “{nome}” é de “{tipo}”, que não vale para os ativos deste lote — nada foi alterado."',
          'Os ativos do lote não aceitam o tipo do kit. Ajuste o lote ou preencha o passo 2 à mão.',
        ],
        [
          '"O motivo salvo no kit “{nome}” não está mais disponível para “{tipo}” — escolha o motivo."',
          'O motivo foi desativado ou deixou de valer para esse tipo. Escolha outro no campo "Motivo" e, se for definitivo, edite o kit.',
        ],
        [
          '"Já existe um kit com esse nome."',
          'Os nomes de kit são únicos, inclusive os de kits desativados. Escolha outro nome.',
        ],
        [
          '"{n} kits não puderam ser lidos (configuração fora do formato esperado) e não aparecem na lista."',
          'O registro daquele kit está corrompido. Crie o kit de novo com outro nome — o nome antigo continua reservado.',
        ],
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'registrar-movimentacao' },
        { slug: 'administracao' },
        { slug: 'entregar-emprestar-reservar', texto: 'A entrega que o kit costuma preencher' },
      ],
    },
  ],
}
