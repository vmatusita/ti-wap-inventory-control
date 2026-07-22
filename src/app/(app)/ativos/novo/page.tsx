import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NovaCompraForm } from '@/components/ativos/nova-compra-form'
import { listarFiliais } from '@/lib/queries/filiais'
import {
  dadosParaDuplicarCompra,
  ultimaCompraDoOperador,
  type DadosCompraInicial,
} from '@/lib/queries/compras'
import { getPerfilAtual } from '@/lib/queries/profile'

type SearchParams = { [key: string]: string | string[] | undefined }

function texto(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export default async function NovoEquipamentoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  // A6 — "Comprar outro igual" na ficha manda `?duplicar=<id do ativo>`.
  // Id fora do formato uuid devolve null (não derruba a página).
  const duplicarParam = texto(sp.duplicar)

  const [filiais, perfil] = await Promise.all([listarFiliais(), getPerfilAtual()])

  const [inicial, ultimaCompra] = await Promise.all<DadosCompraInicial | null>([
    duplicarParam ? dadosParaDuplicarCompra(duplicarParam) : Promise.resolve(null),
    perfil ? ultimaCompraDoOperador(perfil.id) : Promise.resolve(null),
  ])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/ativos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar para ativos
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novo equipamento</h1>
        <p className="text-sm text-muted-foreground">
          Entrada por compra — os equipamentos nascem em estoque na filial que
          recebeu, com uma movimentação de compra na linha do tempo. Compra em
          série? Cole a lista ou informe a faixa de patrimônios.
        </p>
      </div>

      <NovaCompraForm
        filiais={filiais}
        inicial={inicial}
        ultimaCompra={ultimaCompra}
      />
    </div>
  )
}
