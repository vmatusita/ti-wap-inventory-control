import { redirect } from 'next/navigation'
import { getOperador } from '@/lib/auth/acesso'
import { eAdmin } from '@/lib/auth/papeis'
import { AdminNav } from '@/components/admin/admin-nav'
import { LinkAjuda } from '@/components/layout/link-ajuda'

// Layout das telas de administração — F21: só o cargo ADMIN. O proxy + shell
// (app) já mantêm visualizadores por senha fora daqui, e cada action de /admin
// tem `exigirAdmin()`; esta checagem é defesa em profundidade, para a rota não
// depender do matcher do proxy nem de a sidebar esconder o item.
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const operador = await getOperador()
  // Sem sessão OU perfil desativado (getOperador devolve null nos dois casos).
  if (!operador) redirect('/login')
  // Logado, mas não é admin: o destino é o PAINEL, nunca /login — mandá-lo para
  // a tela de login com sessão válida faria o proxy devolvê-lo para cá, num
  // pingue-pongue, e sugeriria que ele precisa entrar de novo.
  if (!eAdmin(operador.papel)) redirect('/')

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Administração</h1>
          {/* F20: as telas de admin compartilham este cabeçalho, então o "?"
              aponta para a página que cobre os cadastros de apoio. As telas com
              matéria própria (Usuários, Senhas de acesso, Kits e Importar) trazem o
              seu ao lado do texto de abertura. */}
          <LinkAjuda pagina="administracao" rotulo="Ajuda sobre a administração" />
        </div>
        {/* O subtítulo lista o que as abas do AdminNav cobrem — quando uma aba
            nasce (Kits, na F12/M12), esta frase entra junto. */}
        <p className="text-sm text-muted-foreground">
          Usuários, senhas de acesso, filiais, cadastro de colaboradores, vocabulário
          de motivos, kits de movimentação, catálogo de itens e tipos de item.
        </p>
      </div>
      <AdminNav />
      <div>{children}</div>
    </div>
  )
}
