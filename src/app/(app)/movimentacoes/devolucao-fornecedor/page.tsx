import Link from 'next/link'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import {
  DevolucaoFornecedorForm,
  type AtivoEmManutencao,
} from '@/components/movimentacoes/devolucao-fornecedor-form'
import { buscarAtivoPorId } from '@/lib/queries/ativos'
import { ultimoEnvioManutencao } from '@/lib/queries/movimentacoes'
import { listarFiliais } from '@/lib/queries/filiais'
import { rotuloStatus } from '@/lib/dominio'

type SearchParams = { [key: string]: string | string[] | undefined }

function texto(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

// F14/MN3 — devolução ao fornecedor (fluxo dedicado, lote sempre 1). Acessível
// pela ficha de um ativo em_manutencao (botão "Devolver ao fornecedor").
export default async function DevolucaoFornecedorPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const ativoId = texto(sp.ativo)

  const ativo = ativoId ? await buscarAtivoPorId(ativoId) : null

  const voltar = (
    <Link
      href={ativoId ? `/ativos/${ativoId}` : '/ativos'}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      Voltar
    </Link>
  )

  // Guarda: sem ativo, inexistente, ou fora de manutenção → mensagem amigável.
  if (!ativo || ativo.status !== 'em_manutencao') {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {voltar}
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {!ativo
              ? 'Ativo não encontrado para a devolução ao fornecedor.'
              : `A devolução ao fornecedor só vale para um ativo em manutenção — este está "${rotuloStatus(ativo.status)}".`}
          </span>
        </div>
      </div>
    )
  }

  const [chamados, filiais] = await Promise.all([
    ultimoEnvioManutencao(ativo.id),
    listarFiliais(),
  ])

  const ativoProp: AtivoEmManutencao = {
    id: ativo.id,
    patrimonio: ativo.patrimonio,
    categoria: ativo.categoria,
    marca: ativo.marca,
    modelo: ativo.modelo,
    filial_id: ativo.filial_id,
    filial_nome: ativo.filial_nome,
    fornecedor: ativo.fornecedor,
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {voltar}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Devolução ao fornecedor
        </h1>
        <p className="text-sm text-muted-foreground">
          O fornecedor ficou com o equipamento (não teve conserto). Registre a
          baixa e, se houver, cadastre o substituto no mesmo passo.
        </p>
      </div>

      <DevolucaoFornecedorForm
        ativo={ativoProp}
        chamadoHerdado={chamados?.chamado ?? null}
        chamadoFornecedorHerdado={chamados?.chamado_fornecedor ?? null}
        filiais={filiais}
      />
    </div>
  )
}
