import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const relatoriosGerados: PaginaAjuda = {
  slug: 'relatorios-gerados',
  titulo: 'Os relatórios gerados da semana',
  resumo: 'Gerar o snapshot congelado e achar os anteriores.',
  categoria: 'consultar',
  termos: ['snapshot', 'gerado', 'semana', 'congelado', 'versao', 'errata'],
  legado: ['relatorios', 'como-fazer'],
  blocos: [
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
      tipo: 'passos',
      titulo: 'Gerar um snapshot do relatório',
      itens: [
        'No relatório, use "Gerar relatório". Confira o período (por padrão a semana útil) e o escopo (filial ou geral).',
        'Opcionalmente escreva a Observação da semana.',
        'Confirme: o snapshot é salvo, versionado e imutável. Ele aparece no histórico de relatórios gerados.',
      ],
    },
    {
      tipo: 'links',
      itens: [{ slug: 'relatorio-ao-vivo' }, { slug: 'usuarios-e-senhas' }],
    },
  ],
}
