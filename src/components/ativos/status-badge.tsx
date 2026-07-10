import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { STATUS_META, type StatusAtivo } from '@/lib/dominio'

// Badge de status com cor por grupo (OS-F2 3.1.1). Componente puro — serve tanto
// em Server quanto em Client Components.
export function StatusBadge({
  status,
  className,
}: {
  status: StatusAtivo
  className?: string
}) {
  const meta = STATUS_META[status]
  return (
    <Badge
      variant="outline"
      className={cn('font-medium', meta.badge, className)}
    >
      {meta.rotulo}
    </Badge>
  )
}
