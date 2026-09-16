import { listarTiposItemAdmin } from '@/lib/queries/tipos-item'
import { TipoItemDialog } from '@/components/admin/tipo-item-dialog'
import { TiposItemTabela } from '@/components/admin/tipos-item-tabela'

// Título curto e distinto (WCAG 2.4.2, doutrina FLX-03): "Tipos de item", e não
// "Itens" — a aba `/admin/itens` já usa "Catálogo de itens", e duas abas com a mesma
// sentinela é exatamente a falha que aquela regra existe para evitar.
export const metadata = {
  title: 'Tipos de item',
}

// F60 · fato 17 — teto de execução ESCRITO, não herdado (ata da F60 em docs/DECISOES.md). Sem
// ele a rota fica com os 300 s da Vercel, e 300 s só acontece quando a conexão com o Supabase
// PENDURA (24/07/2026; o raciocínio inteiro está em relatorios/[filial]/page.tsx): 60 s troca
// cinco minutos de spinner por um erro rápido.
// O teto vale também para as Server Actions desta página (doc do Next: o `maxDuration` da
// página muda o de todas as actions usadas nela). Cada statement delas já para nos 8 s de
// `statement_timeout` do banco (fato 18), então o que decide é o LAÇO, e aqui não há laço
// que cresça com o acervo:
// `criarTipoItem`/`atualizarTipoItem` são uma escrita cada.
export const maxDuration = 60

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
