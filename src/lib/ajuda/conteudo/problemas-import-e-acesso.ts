import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const problemasImportEAcesso: PaginaAjuda = {
  slug: 'problemas-import-e-acesso',
  titulo: 'Problemas de import e de acesso',
  resumo: 'Arquivo recusado, senha perdida, sessão expirada.',
  categoria: 'resolver',
  termos: ['nao entra', 'senha', 'expirou', 'arquivo', 'recusou', 'login'],
  blocos: [
    {
      tipo: 'sintomas',
      itens: [
        {
          sintoma: 'O sistema me pediu login de novo no meio do trabalho.',
          causa: 'As sessões expiram em 24 horas, para o operador e para o visualizador.',
          saida: [
            'Refaça o login com o seu e-mail corporativo.',
            'Se você estava montando um lote de movimentação, o rascunho daquela aba continua lá.',
          ],
        },
      ],
    },
    {
      tipo: 'links',
      itens: [
        { slug: 'acesso-e-sessoes' },
        { slug: 'import-de-startup' },
        { slug: 'usuarios-e-senhas' },
      ],
    },
  ],
}
