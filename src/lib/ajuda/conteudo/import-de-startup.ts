import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const importDeStartup: PaginaAjuda = {
  slug: 'import-de-startup',
  titulo: 'Import de startup de uma filial',
  resumo: 'O go-live de uma filial por arquivo, no modo Substituir tudo.',
  categoria: 'fazer',
  termos: ['import', 'importar', 'planilha', 'xlsx', 'csv', 'substituir', 'go-live'],
  legado: ['admin', 'como-fazer'],
  blocos: [
    {
      tipo: 'nota',
      texto:
        'A entrada do dia a dia é 100% manual — não há sincronização com o Excel. A única importação é o import de startup em Administração › Importar: só o modo "Substituir tudo", que troca o acervo inteiro de UMA filial por um arquivo (CSV ou Excel .xlsx), no go-live dela. O .xlsx é o recomendado: preserva as datas (sem "#######" nem mês abreviado sem ano) e os acentos que o CSV do Excel costuma corromper. Ele mostra o custo, faz backup automático e exige que você digite o nome da filial antes de aplicar. No preview, cada erro se corrige na própria tela (o CSV original não muda); os avisos (em âmbar, como o patrimônio ausente) não bloqueiam a importação.',
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'administracao' },
        { slug: 'problemas-import-e-acesso' },
        { slug: 'ficha-do-ativo' },
      ],
    },
  ],
}
