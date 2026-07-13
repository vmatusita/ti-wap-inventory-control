import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { NovaCompraForm } from '@/components/ativos/nova-compra-form'
import { listarFiliais } from '@/lib/queries/filiais'

export default async function NovoEquipamentoPage() {
  const filiais = await listarFiliais()

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

      <NovaCompraForm filiais={filiais} />
    </div>
  )
}
