import { AdminNav } from '@/components/admin/admin-nav'

// Layout das telas de administração (só operador — o shell (app) já garante que
// visualizadores por senha nunca chegam aqui). Cabeçalho + navegação comuns.
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
