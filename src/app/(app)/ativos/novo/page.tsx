import Link from 'next/link'
import { ArrowLeft, Eye } from 'lucide-react'
import { NovaCompraForm } from '@/components/ativos/nova-compra-form'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { filiaisParaEscrita } from '@/components/layout/permissoes'
import { listarFiliais } from '@/lib/queries/filiais'
import {
  dadosParaDuplicarCompra,
  ultimaCompraDoOperador,
  type DadosCompraInicial,
} from '@/lib/queries/compras'
import { getPerfilAtual } from '@/lib/queries/profile'
import { getOperador, MSG_SOMENTE_LEITURA } from '@/lib/auth/acesso'
import { podeEscrever } from '@/lib/auth/papeis'

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

  const [filiais, perfil, operador] = await Promise.all([
    listarFiliais(),
    getPerfilAtual(),
    getOperador(),
  ])

  // F21 — a filial que RECEBE a compra é escrita: o select oferece só as filiais
  // vinculadas (admin → todas as ativas). A lista de leitura desta tela não
  // existe, então aqui não há duas listas para conciliar.
  const filiaisEscrita = filiaisParaEscrita(operador, filiais)

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
        <div className="flex items-center gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Novo equipamento
          </h1>
          <LinkAjuda pagina="cadastrar-compra" rotulo="Ajuda: como cadastrar um equipamento" />
        </div>
        <p className="text-sm text-muted-foreground">
          Entrada por compra — os equipamentos nascem em estoque na filial que
          recebeu, com uma movimentação de compra na linha do tempo. Compra em
          série? Cole a lista ou informe a faixa de patrimônios.
        </p>
      </div>

      {/* Cargo Consulta abriu a URL direto (nenhum caminho da UI leva até aqui):
          diz o motivo em vez de oferecer um formulário que a action recusaria.
          Isto é reforço, não a trava — `registrarCompra` recusa no servidor. */}
      {podeEscrever(operador?.papel) ? (
        <NovaCompraForm
          filiais={filiaisEscrita}
          inicial={inicial}
          ultimaCompra={ultimaCompra}
        />
      ) : (
        <EstadoVazio
          icone={Eye}
          titulo="Esta tela registra uma compra"
          descricao={MSG_SOMENTE_LEITURA}
          acao={{ href: '/ativos', rotulo: 'Voltar para ativos' }}
        />
      )}
    </div>
  )
}
