import { versaoAtual } from '@/lib/versoes/registry'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

// A versao citada aqui e LIDA do registry (`src/lib/versoes/registry.ts`), pela
// mesma regra de ouro de `limites-e-atalhos`: subir a versao muda a documentacao
// no mesmo build, sem ninguem lembrar de editar este arquivo.
export const versoesDoSistema: PaginaAjuda = {
  slug: 'versoes-do-sistema',
  titulo: 'Versões do sistema',
  resumo: 'Em que versão o sistema está e o que mudou em cada uma delas.',
  categoria: 'consultar',
  termos: [
    'versao',
    'versoes',
    'novidades',
    'o que mudou',
    'historico',
    'atualizacao',
    'release',
    'numero da versao',
  ],
  blocos: [
    {
      tipo: 'paragrafo',
      texto:
        'O sistema tem um número de versão, e ele muda toda vez que algo novo entra no ar. O número da versão em uso agora aparece no pé do menu lateral; clicar nele abre a tela Versões, com a lista inteira, da mais recente para a mais antiga.',
    },
    { tipo: 'titulo', id: 'versoes-onde-ver', texto: 'Onde encontrar' },
    {
      tipo: 'lista',
      itens: [
        `No pé do menu lateral, em texto pequeno: v${versaoAtual().versao} é a versão no ar hoje.`,
        'Pela busca do teclado (Ctrl+K, ou ⌘K no Mac), procurando por "versões" ou "novidades".',
        'Direto pelo endereço /versoes.',
        'Com o menu recolhido, o número some do lado do ícone e aparece ao passar o mouse ou o teclado por ele.',
      ],
    },
    { tipo: 'titulo', id: 'versoes-como-ler', texto: 'Como ler o número' },
    {
      tipo: 'paragrafo',
      texto: `O número tem três partes, separadas por ponto — por exemplo, ${versaoAtual().versao}. A do meio sobe a cada entrega planejada, com recursos ou melhorias; a última sobe em correções e ajustes avulsos entre uma entrega e outra. A primeira parte virou 1 no dia em que os dados reais das cinco filiais entraram no sistema, em 15/07/2026.`,
    },
    {
      tipo: 'tabela',
      colunas: ['O que aparece', 'O que significa'],
      linhas: [
        [`v${versaoAtual().versao}`, 'o número da versão; a primeira da lista é a que está no ar'],
        ['A data ao lado', 'o dia em que aquela versão entrou no ar'],
        ['O código miúdo (F34, F20B…)', 'o nome interno da entrega, para cruzar com a documentação do projeto'],
        ['A lista de tópicos', 'o que mudou para quem usa o sistema, em português comum'],
      ],
    },
    {
      tipo: 'nota',
      texto:
        'A tela Versões é só de leitura, aberta a qualquer pessoa com acesso ao sistema — inclusive quem tem o cargo Consulta. Ela não consulta o acervo e não mostra nenhum dado de equipamento ou de colaborador.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'mapa-das-telas', texto: 'Todas as telas do sistema, uma a uma' },
        { slug: 'limites-e-atalhos', texto: 'Limites, tetos e atalhos de teclado' },
      ],
    },
  ],
}
