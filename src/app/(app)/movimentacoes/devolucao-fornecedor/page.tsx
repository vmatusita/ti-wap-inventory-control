import Link from 'next/link'
import { ArrowLeft, Eye, TriangleAlert } from 'lucide-react'
import {
  DevolucaoFornecedorForm,
  type AtivoEmManutencao,
} from '@/components/movimentacoes/devolucao-fornecedor-form'
import { buscarAtivoPorId } from '@/lib/queries/ativos'
import { ultimoEnvioManutencao } from '@/lib/queries/movimentacoes'
import { listarFiliais } from '@/lib/queries/filiais'
import { rotuloStatus } from '@/lib/dominio'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import {
  filiaisParaEscrita,
  podeEscreverNoEscopo,
} from '@/components/layout/permissoes'
import {
  getOperador,
  MSG_SOMENTE_LEITURA,
  msgSemEscritaNaFilial,
} from '@/lib/auth/acesso'

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Devolução ao fornecedor',
}

// F60 · fato 17 — teto de execução ESCRITO, não herdado (ata da F60 em docs/DECISOES.md). Sem
// ele a rota fica com os 300 s da Vercel, e 300 s só acontece quando a conexão com o Supabase
// PENDURA (24/07/2026; o raciocínio inteiro está em relatorios/[filial]/page.tsx): 60 s troca
// cinco minutos de spinner por um erro rápido.
// O teto vale também para as Server Actions desta página (doc do Next: o `maxDuration` da
// página muda o de todas as actions usadas nela). Cada statement delas já para nos 8 s de
// `statement_timeout` do banco (fato 18), então o que decide é o LAÇO, e aqui não há laço
// que cresça com o acervo:
// `devolverAoFornecedor` grava a baixa e o substituto numa RPC só.
export const maxDuration = 60

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

  const [chamados, filiais, operador] = await Promise.all([
    ultimoEnvioManutencao(ativo.id),
    listarFiliais(),
    getOperador(),
  ])

  // F21 — a baixa acontece na filial DESTE ativo: sem escrita nela, não há
  // devolução a registrar (nem com substituto). Segunda linha da mesma regra que
  // `devolverAoFornecedor` aplica no servidor — aqui só para não abrir um
  // formulário de duas partes que terminaria em recusa.
  if (!podeEscreverNoEscopo(operador, ativo.filial_id)) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {voltar}
        <EstadoVazio
          icone={Eye}
          titulo="Esta tela registra a baixa do equipamento"
          descricao={
            operador?.papel === 'consulta'
              ? MSG_SOMENTE_LEITURA
              : msgSemEscritaNaFilial(ativo.filial_nome)
          }
          acao={{ href: `/ativos/${ativo.id}`, rotulo: 'Ver a ficha do ativo' }}
        />
      </div>
    )
  }

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
        <div className="flex flex-wrap items-center gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Devolução ao fornecedor
          </h1>
          <LinkAjuda pagina="manutencao" rotulo="Ajuda sobre manutenção e devolução ao fornecedor" />
        </div>
        <p className="text-sm text-muted-foreground">
          O fornecedor ficou com o equipamento (não teve conserto). Registre a
          baixa e, se houver, cadastre o substituto no mesmo passo.
        </p>
      </div>

      {/* O SUBSTITUTO é um ativo novo: a filial dele é escrita, então o select
          oferece só as vinculadas. O default do formulário é a filial do ativo
          antigo, que a guarda acima já provou ser uma delas. */}
      <DevolucaoFornecedorForm
        ativo={ativoProp}
        chamadoHerdado={chamados?.chamado ?? null}
        chamadoFornecedorHerdado={chamados?.chamado_fornecedor ?? null}
        filiais={filiaisParaEscrita(operador, filiais)}
      />
    </div>
  )
}
