import { listarTiposItemAdmin } from '@/lib/queries/tipos-item'
import { TipoItemDialog } from '@/components/admin/tipo-item-dialog'
import { TiposItemTabela } from '@/components/admin/tipos-item-tabela'

// Título curto e distinto (WCAG 2.4.2, doutrina FLX-03): "Tipos de item", e não
// "Itens" — a aba `/admin/itens` já usa "Catálogo de itens", e duas abas com a mesma
// sentinela é exatamente a falha que aquela regra existe para evitar.
export const metadata = {
  title: 'Tipos de item',
}

export default async function AdminTiposItemPage() {
  const tipos = await listarTiposItemAdmin()

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          O vocabulário do que acompanha um equipamento — carregador, mochila, fone de
          ouvido. É o que a conferência da devolução lista e o que fica gravado nas
          pendências.
        </p>
        <TipoItemDialog />
      </div>

      <TiposItemTabela tipos={tipos} />
    </div>
  )
}
