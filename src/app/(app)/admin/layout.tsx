import { redirect } from 'next/navigation'
import { getOperador } from '@/lib/auth/acesso'
import { AdminNav } from '@/components/admin/admin-nav'

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
        <h1 className="text-2xl font-semibold tracking-tight">Administração</h1>
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
