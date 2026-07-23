import {
  NovaMovimentacaoForm,
  type ConfigInicial,
} from '@/components/movimentacoes/nova-movimentacao-form'
import { buscarAtivoResumo, type AtivoResumo } from '@/lib/queries/ativos'
import { listarFiliais } from '@/lib/queries/filiais'
import { listarMotivos } from '@/lib/queries/motivos'
import {
  buscarMovimentacaoParaDuplicar,
  ultimaMovimentacaoDoUsuario,
  type UltimaMovimentacaoUsuario,
} from '@/lib/queries/movimentacoes'
import { getPerfilAtual } from '@/lib/queries/profile'
import { LinkAjuda } from '@/components/layout/link-ajuda'

type SearchParams = { [key: string]: string | string[] | undefined }

function texto(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export default async function NovaMovimentacaoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const ativoParam = texto(sp.ativo)
  const duplicarParam = texto(sp.duplicar)

  const [filiais, motivos, perfil] = await Promise.all([
    listarFiliais(),
    listarMotivos(),
    getPerfilAtual(),
  ])

  let ativoInicial: AtivoResumo | null = null
  let configInicial: ConfigInicial | null = null

  if (duplicarParam) {
    const mov = await buscarMovimentacaoParaDuplicar(duplicarParam)
    if (mov) {
      ativoInicial = await buscarAtivoResumo(mov.ativo_id)
      configInicial = {
        tipo: mov.tipo,
        motivo: mov.motivo ?? '',
        colaborador: mov.colaborador ?? '',
        setor: mov.setor ?? '',
        chamado: mov.chamado ?? '',
        termo: mov.termo_assinado ?? '',
        termoData: mov.termo_data ?? '',
        observacao: mov.observacao ?? '',
        filialDestinoId: mov.filial_destino_id
          ? String(mov.filial_destino_id)
          : '',
        itensFaltantes: mov.itens_faltantes ?? [],
      }
    }
  } else if (ativoParam) {
    ativoInicial = await buscarAtivoResumo(ativoParam)
  }

  const ultimaMov: UltimaMovimentacaoUsuario | null = perfil
    ? await ultimaMovimentacaoDoUsuario(perfil.id)
    : null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Nova movimentação
          </h1>
          <LinkAjuda ancora="movimentacoes" rotulo="Ajuda sobre movimentações" />
        </div>
        <p className="text-sm text-muted-foreground">
          Registre uma movimentação — ou um lote (kit) de vários ativos de uma
          vez.
        </p>
      </div>

      <NovaMovimentacaoForm
        filiais={filiais}
        motivos={motivos}
        ativoInicial={ativoInicial}
        configInicial={configInicial}
        ultimaMov={ultimaMov}
      />
    </div>
  )
}
