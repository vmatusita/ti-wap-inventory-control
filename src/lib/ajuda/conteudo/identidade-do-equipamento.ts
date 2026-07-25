import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const identidadeDoEquipamento: PaginaAjuda = {
  slug: 'identidade-do-equipamento',
  titulo: 'Patrimônio, service tag e o par que identifica',
  resumo: 'Por que o patrimônio pode repetir e o que nunca muda no equipamento.',
  categoria: 'comecar',
  termos: ['patrimonio', 'service tag', 'plaqueta', 'duplicado', 'copiar'],
  legado: ['acesso'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'Identidade do equipamento: a chave de um ativo é o PAR patrimônio + service tag. O patrimônio pode repetir em casos raros, por isso a busca desambigua pela service tag. O formato canônico do patrimônio é PREFIXO + 7 dígitos (ex.: WAP0004491). A service tag nunca muda; o patrimônio pode ser corrigido. Na lista de ativos e na ficha há um botão de copiar ao lado do número: um clique põe o patrimônio (ou a service tag) na área de transferência, para colar no chamado ou no e-mail.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'ficha-do-ativo', texto: 'Corrigir o patrimônio e definir a service tag' },
        { slug: 'lista-de-ativos' },
      ],
    },
  ],
}
