import { redirect } from 'next/navigation'
import { getOperador } from '@/lib/auth/acesso'
import { AdminNav } from '@/components/admin/admin-nav'
import { LinkAjuda } from '@/components/layout/link-ajuda'

// Layout das telas de administração (só operador). O proxy + shell (app) já
// mantêm visualizadores por senha fora daqui; esta checagem própria é defesa em
// profundidade — se o matcher do proxy mudar, /admin continua exigindo operador.
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const operador = await getOperador()
  if (!operador) redirect('/login')

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
          Usuários, senhas de acesso, filiais, vocabulário de motivos, kits de
          movimentação e catálogo de itens.
        </p>
      </div>
      <AdminNav />
      <div>{children}</div>
    </div>
  )
}
