import {
  NovaMovimentacaoForm,
  type ConfigInicial,
} from '@/components/movimentacoes/nova-movimentacao-form'
import { configInicialDaUrl } from '@/components/movimentacoes/nova/config'
import { buscarAtivoResumo, type AtivoResumo } from '@/lib/queries/ativos'
import { listarFiliais } from '@/lib/queries/filiais'
import { listarKitsAtivos, type Kit } from '@/lib/queries/kits'
import { listarMotivos } from '@/lib/queries/motivos'
import {
  buscarMovimentacaoParaDuplicar,
  ultimaMovimentacaoDoUsuario,
  type UltimaMovimentacaoUsuario,
} from '@/lib/queries/movimentacoes'
import { getPerfilAtual } from '@/lib/queries/profile'
import { LinkAjuda } from '@/components/layout/link-ajuda'
import { EstadoVazio } from '@/components/layout/estado-vazio'
import { getOperador, MSG_SOMENTE_LEITURA } from '@/lib/auth/acesso'
import { podeEscrever } from '@/lib/auth/papeis'
import { Eye } from 'lucide-react'

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
  // F26 — o ATALHO do painel de sucesso (a metade da troca que ficou para
  // depois): tipo + motivo + colaborador, sem ativo. `contrapartida=nao` diz
  // que ESTA tela já é a contrapartida — o facilitador começa recolhido.
  const tipoParam = texto(sp.tipo)
  const motivoParam = texto(sp.motivo)
  const colaboradorParam = texto(sp.colaborador)
  const semContrapartida = texto(sp.contrapartida) === 'nao'

  const [filiais, motivos, perfil, kits, operador] = await Promise.all([
    // A lista NÃO é recortada por vínculo de propósito: o único select de filial
    // deste fluxo é a filial de DESTINO da transferência, e o parâmetro §0 da
    // ordem F21 (`TRANSFERENCIA_EXIGE_VINCULO_DESTINO = nao`) diz que o destino é
    // livre — quem recebe é outro operador. O vínculo é conferido na filial de
    // ORIGEM (a atual de cada ativo do lote), pela action `registrarMovimentacoes`.
    listarFiliais(),
    listarMotivos(),
    getPerfilAtual(),
    // Kits (F12 · M12) são um FACILITADOR do passo 2: uma falha ao ler o
    // catálogo não pode derrubar a tela de registrar movimentação — degrada para
    // lista vazia (o botão "Aplicar kit" some) e a causa vai para o log do
    // servidor. Leitura no servidor, e não pelo proxy no cliente: é uma consulta
    // só, sem round-trip extra, e o `revalidatePath('/movimentacoes/nova')` das
    // actions de kit já mantém a lista fresca.
    listarKitsAtivos().catch((err): Kit[] => {
      console.error('[movimentacoes/nova] falha ao listar kits:', err)
      return []
    }),
    getOperador(),
  ])
  const escreve = podeEscrever(operador?.papel)

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
  } else if (tipoParam) {
    // Sem ativo: só os campos da movimentação. O tipo sobrevive no estado e é
    // re-conferido quando o operador adiciona o 1º ativo (`ajustarTipoPara`,
    // que avisa nomeando o culpado se não couber).
    configInicial = configInicialDaUrl(
      {
        tipo: tipoParam,
        motivo: motivoParam,
        colaborador: colaboradorParam,
      },
      motivos,
    )
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
          <LinkAjuda pagina="registrar-movimentacao" rotulo="Ajuda: como registrar uma movimentação" />
        </div>
        <p className="text-sm text-muted-foreground">
          Registre uma movimentação — ou um lote (kit) de vários ativos de uma
          vez.
        </p>
      </div>

      {/* Cargo Consulta chegando pela URL (o atalho `N`, a paleta e todos os
          botões já somem para ele): explica em vez de mostrar um formulário de 3
          passos que a action recusaria no fim. A trava é `registrarMovimentacoes`. */}
      {escreve ? (
        // F26 — a `key` derivada dos params é o que faz o formulário REMONTAR
        // quando o atalho do painel de sucesso navega de `/movimentacoes/nova`
        // para `/movimentacoes/nova?tipo=…`. É a MESMA rota: sem a key o React
        // reaproveita a árvore, e todo o estado inicial (que vem de
        // `useState(() => …)`) continuaria o da tela anterior — o atalho não
        // pré-preencheria nada.
        <NovaMovimentacaoForm
          key={[
            duplicarParam,
            ativoParam,
            tipoParam,
            motivoParam,
            colaboradorParam,
            semContrapartida ? 'nao' : '',
          ].join('|')}
          filiais={filiais}
          motivos={motivos}
          kits={kits}
          ativoInicial={ativoInicial}
          configInicial={configInicial}
          semContrapartida={semContrapartida}
          ultimaMov={ultimaMov}
        />
      ) : (
        <EstadoVazio
          icone={Eye}
          titulo="Esta tela registra uma movimentação"
          descricao={MSG_SOMENTE_LEITURA}
          acao={{ href: '/movimentacoes', rotulo: 'Ver as movimentações registradas' }}
        />
      )}
    </div>
  )
}
