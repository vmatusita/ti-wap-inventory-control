import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const fichaDoAtivo: PaginaAjuda = {
  slug: 'ficha-do-ativo',
  titulo: 'A ficha do ativo',
  resumo: 'Linha do tempo, anotações e as ações de exceção do menu ⋯.',
  categoria: 'fazer',
  termos: ['ficha', 'detalhe', 'linha do tempo', 'anotar', 'editar', 'corrigir patrimonio'],
  legado: ['como-fazer'],
  blocos: [
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
    { tipo: 'titulo', id: 'patrimonio', texto: 'Acertar a identificação' },
    {
      tipo: 'passos',
      titulo: 'Corrigir o patrimônio',
      itens: [
        'Na ficha, use "Corrigir patrimônio". Digite o novo número — o sistema mostra o formato canônico (ex.: WAP0001234).',
        'A service tag é imutável DEPOIS de preenchida: ela identifica o equipamento e nunca muda. Só o patrimônio se corrige. (Exceção: um ativo importado SEM service tag pode receber a tag uma vez — veja abaixo.)',
        'A correção fica registrada na linha do tempo (de → para, quem, quando). A busca passa a encontrar o ativo pelo novo patrimônio.',
        'Alguns ativos nascem sem patrimônio (equipamento sem plaqueta trazido pelo import de startup): aparecem como "Sem patrimônio", com pendência na lista e em /pendencias. Dar o número aqui encerra essa pendência.',
        'No cadastro manual (novo equipamento ou substituto da devolução ao fornecedor) a service tag é OBRIGATÓRIA. Só o import de startup aceita entrar sem ela: esses ativos nascem com a pendência "sem service tag" — use "Definir service tag" na ficha para informá-la (transcrita como está na etiqueta). Uma vez definida, ela vira imutável.',
        'No import de startup, quando o hostname já traz o patrimônio (ex.: NB-WAP0001234), o preview preenche o número sozinho — é um aviso, não um erro, e não impede a importação. Só confira se está certo.',
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'identidade-do-equipamento' },
        { slug: 'corrigir-estorno-ajuste' },
        { slug: 'resolver-pendencias' },
      ],
    },
  ],
}
