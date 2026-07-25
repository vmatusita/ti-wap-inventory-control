import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const problemasComuns: PaginaAjuda = {
  slug: 'problemas-comuns',
  titulo: 'Problemas comuns',
  resumo: 'Sintoma, causa e saída para o que mais trava o dia.',
  categoria: 'resolver',
  termos: ['problema', 'nao acho', 'nao aparece', 'travou', 'duvida'],
  blocos: [
    {
      tipo: 'sintomas',
      itens: [
        {
          sintoma: 'Não encontro o equipamento na busca.',
          causa:
            'A busca precisa de 2 letras e procura por patrimônio, service tag, hostname, marca, modelo e nome do colaborador — não por outras informações.',
          saida: [
            'Tente pela service tag: ela nunca muda, o patrimônio pode ter sido corrigido.',
            'Tente pelo nome de quem está com o equipamento.',
            'Se o patrimônio veio de uma planilha, digite só os números ("1234"): o sistema completa o formato.',
          ],
        },
      ],
    },
    {
      tipo: 'links',
      itens: [{ slug: 'mensagens-de-erro' }, { slug: 'problemas-import-e-acesso' }],
    },
  ],
}
