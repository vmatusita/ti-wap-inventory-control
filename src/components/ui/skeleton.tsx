import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      // UXG-08c/F27 — divergência do shadcn com motivo documentado (CLAUDE.md):
      // `motion-reduce:animate-none` (quem pediu menos movimento no SO não via
      // o pulso parar em nenhum dos 13 loading.tsx do app — mesmo tratamento já
      // aplicado ao spin de viewer-auto-refresh.tsx/tentar-novamente.tsx). Ata
      // em docs/DECISOES.md.
      className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

export { Skeleton }
