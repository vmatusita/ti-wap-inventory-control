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

// FLX-03 — título curto da aba (WCAG 2.4.2).
export const metadata = {
  title: 'Nova movimentação',
}

type SearchParams = { [key: string]: string | string[] | undefined }

function texto(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

// F26 — os params que SEMEIAM o formulário. Lista única: é dela que sai a `key`
// do JSX e é por `param()` que a leitura abaixo passa — ler um param fora da
// lista não compila, então os dois lugares não têm como divergir.
//
// Só estes, e não `Object.keys(sp)`: a `key` DESTRÓI o lote em montagem quando
// muda, então um param que não semeia nada (rastreio de campanha, âncora, o que
// um dia colarem na URL) não pode derrubar os 12 ativos que o operador acabou de
// juntar. `de` entra sem ser lido: é justamente ele que faz a URL do atalho
// diferir da atual (link igual = navegação que não acontece = botão mudo).
const PARAMS_SEMEADORES = [
  'ativo',
  'duplicar',
  'tipo',
  'motivo',
  'colaborador',
  'setor',
  'contrapartida',
  'de',
] as const

type ParamSemeador = (typeof PARAMS_SEMEADORES)[number]

/** Lê um param SEMEADOR (só os da lista — é o que trava a `key` no lugar). */
function param(sp: SearchParams, k: ParamSemeador): string | undefined {
  return texto(sp[k])
}

function chaveDosParams(sp: SearchParams): string {
  return PARAMS_SEMEADORES.map((k) => {
    const v = sp[k]
    return `${k}=${Array.isArray(v) ? v.join(',') : (v ?? '')}`
  }).join('&')
}

export default async function NovaMovimentacaoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const ativoParam = param(sp, 'ativo')
  const duplicarParam = param(sp, 'duplicar')
  // F26 — o ATALHO do painel de sucesso (a metade da troca que ficou para
  // depois): tipo + motivo + colaborador, sem ativo. `contrapartida=nao` diz
  // que ESTA tela já é a contrapartida — o facilitador começa recolhido.
  const tipoParam = param(sp, 'tipo')
  const motivoParam = param(sp, 'motivo')
  const colaboradorParam = param(sp, 'colaborador')
  const setorParam = param(sp, 'setor')
  const semContrapartida = param(sp, 'contrapartida') === 'nao'

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
  // MOV-14 — `?duplicar=`/`?ativo=` pode apontar pra um id apagado (Zona
  // destrutiva) ou quebrado: sem isto, o `if (mov) {…}` sem `else` abria o
  // wizard em branco em silêncio — o operador não sabia se o link estava
  // errado ou se ele mesmo esqueceu de escolher um ativo. `null` = nada a
  // avisar; senão, qual das duas origens falhou.
  let origemInvalida: 'duplicar' | 'ativo' | null = null

  if (duplicarParam) {
    const mov = await buscarMovimentacaoParaDuplicar(duplicarParam)
    if (mov) {
      ativoInicial = await buscarAtivoResumo(mov.ativo_id)
      // O ativo referenciado pode ter sido apagado (apagar_ativo leva o
      // ativo E todo o rastro dele — hoje isso deveria levar a movimentação
      // junto —, mas não custa blindar: sem o ativo não há o que duplicar de
      // verdade, e prefixar a config sem nenhum item no lote seria o mesmo
      // silêncio de antes, só que com um passo 2 preenchido do nada).
      if (ativoInicial) {
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
      } else {
        origemInvalida = 'duplicar'
      }
    } else {
      origemInvalida = 'duplicar'
    }
  } else if (ativoParam) {
    ativoInicial = await buscarAtivoResumo(ativoParam)
    if (!ativoInicial) origemInvalida = 'ativo'
  } else if (tipoParam) {
    // Sem ativo: só os campos da movimentação. O tipo sobrevive no estado e é
    // re-conferido quando o operador adiciona o 1º ativo (`ajustarTipoPara`,
    // que avisa nomeando o culpado se não couber).
    configInicial = configInicialDaUrl(
      {
        tipo: tipoParam,
        motivo: motivoParam,
        colaborador: colaboradorParam,
        // O destino da troca pode ser um SETOR, sem pessoa nomeada (o Zod da
        // saída aceita um OU outro): sem ler o param, o atalho chegava vazio
        // exatamente nesse caso.
        setor: setorParam,
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
        //
        // A chave sai de `PARAMS_SEMEADORES` — a MESMA lista que a leitura acima
        // consome —, e não de `Object.keys(sp)`: remontar destrói o lote em
        // montagem, e só param que semeia o formulário tem esse direito.
        <NovaMovimentacaoForm
          key={chaveDosParams(sp)}
          filiais={filiais}
          motivos={motivos}
          kits={kits}
          ativoInicial={ativoInicial}
          configInicial={configInicial}
          semContrapartida={semContrapartida}
          ultimaMov={ultimaMov}
          origemInvalida={origemInvalida}
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
