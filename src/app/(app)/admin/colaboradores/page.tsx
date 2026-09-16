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

// F60 · fato 17 — teto de execução ESCRITO, não herdado (ata da F60 em docs/DECISOES.md). Sem
// ele a rota fica com os 300 s da Vercel, e 300 s só acontece quando a conexão com o Supabase
// PENDURA (24/07/2026; o raciocínio inteiro está em relatorios/[filial]/page.tsx): 60 s troca
// cinco minutos de spinner por um erro rápido.
// O teto vale também para as Server Actions desta página (doc do Next: o `maxDuration` da
// página muda o de todas as actions usadas nela). Cada statement delas já para nos 8 s de
// `statement_timeout` do banco (fato 18), então o que decide é o LAÇO, e aqui não há laço
// que cresça com o acervo:
// `criarColaborador`/`atualizarColaborador` são uma escrita, `consolidarColaboradores` uma
// leitura da fila e um insert, `buscarSaldoDoColaborador` uma leitura.
export const maxDuration = 60

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
