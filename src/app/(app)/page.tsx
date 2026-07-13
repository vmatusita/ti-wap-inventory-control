import Link from 'next/link'
import { ArrowLeftRight, Package, PackagePlus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

const ACOES = [
  {
    href: '/movimentacoes/nova',
    icone: ArrowLeftRight,
    titulo: 'Nova movimentação',
    descricao: 'Saída, devolução, transferência… inclusive em lote.',
  },
  {
    href: '/ativos/novo',
    icone: PackagePlus,
    titulo: 'Novo equipamento',
    descricao: 'Entrada por compra — um ou vários de uma vez.',
  },
  {
    href: '/ativos',
    icone: Package,
    titulo: 'Ativos',
    descricao: 'Consultar, filtrar e abrir a ficha de um ativo.',
  },
]

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ACOES.map((a) => (
          <Link key={a.href} href={a.href} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-accent/40">
              <CardContent className="flex items-start gap-3 py-5">
                <span className="rounded-md bg-muted p-2 text-foreground">
                  <a.icone className="size-5" />
                </span>
                <div>
                  <p className="font-medium">{a.titulo}</p>
                  <p className="text-sm text-muted-foreground">{a.descricao}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        Os indicadores e gráficos do estoque chegam na F3.
      </p>
    </div>
  )
}
