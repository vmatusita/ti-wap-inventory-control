import { DOMINIOS_TEXTO } from '@/lib/auth/dominios-email'
import type { PaginaAjuda } from '@/lib/ajuda/tipos'

export const usuariosESenhas: PaginaAjuda = {
  slug: 'usuarios-e-senhas',
  titulo: 'Operadores e senhas de acesso',
  resumo: 'Convidar quem opera e entregar (ou revogar) o acesso aos relatórios.',
  categoria: 'fazer',
  termos: ['convite', 'usuario', 'senha de acesso', 'revogar', 'visualizador', 'compartilhar'],
  legado: ['admin', 'acesso'],
  blocos: [
    {
      tipo: 'paragrafo',
      texto: `Há duas coisas diferentes aqui. Convidar um OPERADOR dá acesso completo ao sistema, e só vale para e-mails ${DOMINIOS_TEXTO}. Criar uma SENHA DE ACESSO dá a alguém de fora da TI a possibilidade de abrir os relatórios, e nada mais.`,
    },
    {
      tipo: 'links',
      itens: [{ slug: 'acesso-e-sessoes' }, { slug: 'problemas-import-e-acesso' }],
    },
  ],
}
