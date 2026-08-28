import {
  filaDeConsolidacao,
  listarColaboradoresAdmin,
  resumoDaConsolidacao,
} from '@/lib/queries/colaboradores'
import { listarFiliais } from '@/lib/queries/filiais'
import { ColaboradorDialog } from '@/components/admin/colaborador-dialog'
import { ColaboradoresTabela } from '@/components/admin/colaboradores-tabela'
import { FilaConsolidacao } from '@/components/admin/fila-consolidacao'

// Título curto e distinto da aba (WCAG 2.4.2, doutrina FLX-03).
export const metadata = {
  title: 'Colaboradores',
}

export default async function AdminColaboradoresPage() {
  const [colaboradores, fila, resumo, filiais] = await Promise.all([
    listarColaboradoresAdmin(),
    filaDeConsolidacao(),
    resumoDaConsolidacao(),
    listarFiliais(),
  ])

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            As pessoas a quem os equipamentos são entregues. Quem registra uma
            movimentação escolhe daqui — e continua podendo digitar um nome novo, que
            aparece na fila abaixo para virar cadastro.
          </p>
          <ColaboradorDialog filiais={filiais} />
        </div>

        <ColaboradoresTabela colaboradores={colaboradores} filiais={filiais} />
      </div>

      <FilaConsolidacao fila={fila} resumo={resumo} filiais={filiais} />
    </div>
  )
}
