import { listarItensAdmin } from '@/lib/queries/itens'
import { ItemDialog } from '@/components/admin/item-dialog'
import { ItensTabela } from '@/components/admin/itens-tabela'

// FLX-03 — título curto da aba (WCAG 2.4.2). "Catálogo de itens", e não só
// "Itens": a tela `/itens` (saldos por quantidade) já usa esse título curto —
// mesma sentinela em duas abas seria a própria falha que a fase corrige.
export const metadata = {
  title: 'Catálogo de itens',
}

export default async function AdminItensPage() {
  const itens = await listarItensAdmin()

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Catálogo de acessórios, periféricos e componentes controlados por quantidade.
        </p>
        <ItemDialog />
      </div>

      {/* F29/ADM-03a — a tabela (que vivia inline aqui) virou Client Component só por
          causa do filtro; a leitura continua no servidor, e o array desce pronto. */}
      <ItensTabela itens={itens} />
    </div>
  )
}
