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
        <p className="text-sm text-muted-foreground">
          Usuários, senhas de acesso, filiais e vocabulário de motivos.
        </p>
      </div>
      <AdminNav />
      <div>{children}</div>
    </div>
  )
}
