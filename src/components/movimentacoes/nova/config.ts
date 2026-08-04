// Nucleo (puro, testavel) do fluxo de nova movimentacao: a forma da `Config` do
// formulario e a traducao Config -> input do lote (validado pelo Zod). Sem React
// aqui — o componente-mae e os passos consomem estes helpers.
import { hojeISO } from '@/lib/format'
import {
  CAMPOS_POR_TIPO,
  MAX_LOTE_MOVIMENTACAO,
  campoObrigatorio,
  ehTipoManual,
  type CampoMovimentacao,
} from '@/lib/validators/movimentacao'
import { ehTipoMovimentacao } from '@/lib/dominio'
import type {
  CategoriaAtivo,
  TermoStatus,
  TipoMovimentacao,
} from '@/lib/dominio'
import type { AtivoResumo } from '@/lib/queries/ativos'

// Config compartilhada por TODO o lote (um preenchimento, N ativos — spec §12.2 /
// DECISOES 2026-07-10). Campos em camelCase; o construirItem converte para as
// chaves snake_case do input do Zod.
export type Config = {
  data: string
  tipo: TipoMovimentacao | ''
  motivo: string
  colaborador: string
  setor: string
  chamado: string
  // F14/MN1 — chamado do fornecedor (texto livre), coletado no envio_manutencao.
  chamadoFornecedor: string
  termo: '' | TermoStatus
  termoData: string
  observacao: string
  filialDestinoId: string
  itensFaltantes: string[]
}

// Estado pre-preenchido vindo de "duplicar" (page.tsx) — tudo opcional.
export type ConfigInicial = Partial<Omit<Config, 'itensFaltantes'>> & {
  itensFaltantes?: string[]
}

export function configPadrao(inicial?: ConfigInicial | null): Config {
  return {
    data: inicial?.data || hojeISO(),
    tipo: (inicial?.tipo as TipoMovimentacao) || '',
    motivo: inicial?.motivo || '',
    colaborador: inicial?.colaborador || '',
    setor: inicial?.setor || '',
    chamado: inicial?.chamado || '',
    chamadoFornecedor: inicial?.chamadoFornecedor || '',
    termo: (inicial?.termo as TermoStatus) || '',
    termoData: inicial?.termoData || '',
    observacao: inicial?.observacao || '',
    filialDestinoId: inicial?.filialDestinoId || '',
    itensFaltantes: inicial?.itensFaltantes || [],
  }
}

// Texto livre vindo da URL: sem espaços nas pontas e com um teto de sanidade —
// o campo é livre no banco, mas nada justifica um nome de 5 KB no querystring.
const MAX_TEXTO_URL = 200

// F26 — `ConfigInicial` montada a partir de params SOLTOS da URL. É o que o
// ATALHO do painel de sucesso usa para reabrir o fluxo na metade que faltou
// (`?tipo=saida&motivo=troca_upgrade&colaborador=…`), sem ativo nenhum — os
// mecanismos antigos (`?duplicar=`/`?ativo=`) partem sempre de um registro que
// já existe, e nenhum deles serve para "a outra metade da troca".
//
// PURA e defensiva, na doutrina de `lib/url-params.ts`: param inválido é
// IGNORADO, nunca derruba a página nem vira estado inválido do formulário.
//   - `tipo` fora do vocabulário — ou que este formulário não monta em estado
//     nenhum (`ehTipoManual`: os de fluxo próprio + `estorno`, que é da linha do
//     tempo) — devolve `null`: sem tipo não há o que pré-preencher.
//   - `motivo` é conferido pelo CÓDIGO contra o catálogo e pelo `aplica_a`; o
//     que não casa vira '' (o operador escolhe no select).
export function configInicialDaUrl(
  params: {
    tipo?: string
    motivo?: string
    colaborador?: string
    setor?: string
  },
  motivosDisponiveis: readonly { codigo: string; aplica_a: string[] }[],
): ConfigInicial | null {
  const tipo = (params.tipo ?? '').trim()
  // `ehTipoMovimentacao`, e não `tipo in TIPO_META`: o `in` enxerga as chaves
  // herdadas de `Object.prototype`, e `?tipo=toString` passaria por tipo válido.
  if (!ehTipoMovimentacao(tipo)) return null
  const t: TipoMovimentacao = tipo
  if (!ehTipoManual(t)) return null

  const motivo = (params.motivo ?? '').trim()
  const motivoOk = motivosDisponiveis.some(
    (m) => m.codigo === motivo && m.aplica_a.includes(t),
  )

  const texto = (v: string | undefined) => (v ?? '').trim().slice(0, MAX_TEXTO_URL)

  return {
    tipo: t,
    motivo: motivoOk ? motivo : '',
    colaborador: texto(params.colaborador),
    setor: texto(params.setor),
  }
}

// Entrada em MASSA no lote (F10/M1 — "Colar lista"): o resolver do W1 devolve
// tudo o que achou, sem olhar o lote atual nem o teto (CONTRATO §1.5). Quem
// corta e avisa e a UI — e a regra vive aqui, pura e testavel, para o dialog do
// colar-lista e o combobox usarem a MESMA aritmetica.
export type MesclagemLote = {
  // Lote resultante (atual + os que couberam), na ordem de chegada.
  lote: AtivoResumo[]
  adicionados: AtivoResumo[]
  // Ja estavam no lote (ou repetidos na propria entrada) — ignorados em silencio.
  jaNoLote: AtivoResumo[]
  // Ficaram de fora por causa do teto — a UI avisa quantos.
  excedentes: AtivoResumo[]
}

export function mesclarAtivosNoLote(
  atual: AtivoResumo[],
  entrantes: AtivoResumo[],
  max: number = MAX_LOTE_MOVIMENTACAO,
): MesclagemLote {
  const vistos = new Set(atual.map((a) => a.id))
  const adicionados: AtivoResumo[] = []
  const jaNoLote: AtivoResumo[] = []
  const excedentes: AtivoResumo[] = []

  for (const a of entrantes) {
    if (vistos.has(a.id)) {
      jaNoLote.push(a)
      continue
    }
    // O teto conta o lote INTEIRO (o que ja estava + o que entrou agora).
    if (atual.length + adicionados.length >= max) {
      excedentes.push(a)
      continue
    }
    vistos.add(a.id)
    adicionados.push(a)
  }

  return { lote: [...atual, ...adicionados], adicionados, jaNoLote, excedentes }
}

// Um ativo que ENTROU (fichas do painel de sucesso, chips de "já registrados").
export type AtivoSucesso = {
  id: string
  // null = ativo sem patrimônio físico (F7E) — a UI mostra "sem patrimônio".
  patrimonio: string | null
  categoria: CategoriaAtivo
  movimentacaoId: string
}

// F26 — um GRUPO do resultado: uma metade do par troca/upgrade, ou o lote
// simples inteiro. Tipo e motivo ficam no GRUPO (e não mais no resultado) porque
// o par grava duas movimentações diferentes num envio só, e o painel precisa
// oferecer o termo certo para cada metade.
export type GrupoSucesso = {
  tipo: TipoMovimentacao
  motivo: string
  ativos: AtivoSucesso[]
}

// F26 — a contrapartida da troca que o operador deixou para depois. Só existe
// para alimentar o ATALHO do painel de sucesso: nenhuma pendência, nenhum estado
// no servidor (decisão "só a tela", 04/08/2026).
export type ContrapartidaPendente = {
  // O tipo da metade que FALTA registrar (o oposto do que acabou de entrar).
  tipo: TipoMovimentacao
  // Pré-preenchimento do link — '' quando o tipo alvo nem coleta o campo. O
  // `setor` viaja junto com o `colaborador` porque o Zod aceita um OU outro
  // (`exigeColaboradorOuSetor`): uma troca destinada a um SETOR, sem pessoa
  // nomeada, perdia no atalho a única informação que ela tinha.
  colaborador: string
  setor: string
  // A movimentação que originou o atalho. Vai no link como `de=` e serve a UMA
  // coisa: garantir que a URL do atalho NUNCA seja idêntica à URL atual. Link
  // igual à URL corrente é navegação que não acontece — e, como o formulário só
  // lê o estado inicial na montagem, o botão ficaria mudo.
  origemMovimentacaoId: string
}

// Resultado do envio, alimenta o PainelSucesso (fichas + diálogos de termo).
export type SucessoLote = {
  criadas: number
  // Lote simples = 1 grupo; par troca/upgrade = 2 (principal primeiro).
  grupos: GrupoSucesso[]
  pendente?: ContrapartidaPendente | null
}

// Serializa UM campo condicional da Config para a(s) chave(s) do input do Zod.
// Fora daqui ficam, de proposito: `chamado`/`observacao` (comuns, ja no base),
// `status_resultante` (injetado por montarItensInput) e `estorno_de` (o form nao
// cria estornos). A regra obrigatorio/opcional do `motivo` decide '' vs undefined:
// '' dispara o min(1) do Zod (msg pt-BR "Informe o motivo"); undefined = ausente.
function serializarCampo(
  campo: CampoMovimentacao,
  c: Config,
  obj: Record<string, unknown>,
): void {
  switch (campo) {
    case 'motivo':
      obj.motivo = campoObrigatorio(c.tipo, 'motivo')
        ? c.motivo || ''
        : c.motivo || undefined
      break
    case 'colaborador':
      obj.colaborador = c.colaborador || undefined
      break
    case 'setor':
      obj.setor = c.setor || undefined
      break
    case 'chamado_fornecedor':
      // Obrigatório no envio_manutencao: '' presente dispara o min(1) do Zod
      // (msg pt-BR); opcional viraria undefined (nenhum tipo o tem como opcional).
      obj.chamado_fornecedor = campoObrigatorio(c.tipo, 'chamado_fornecedor')
        ? c.chamadoFornecedor || ''
        : c.chamadoFornecedor || undefined
      break
    case 'termo':
      obj.termo_assinado = c.termo || undefined
      obj.termo_data = c.termoData || undefined
      break
    case 'filial_destino':
      obj.filial_destino_id = c.filialDestinoId ? Number(c.filialDestinoId) : 0
      break
    case 'itens_faltantes':
      obj.itens_faltantes = c.itensFaltantes
      break
    // chamado / status_resultante / estorno_de: nao serializados aqui.
    default:
      break
  }
}

// Constroi o objeto de input (validado pelo Zod) de um item do lote, derivando
// os campos de CAMPOS_POR_TIPO — antes era um switch que replicava a matriz.
export function construirItem(
  ativo: AtivoResumo,
  c: Config,
): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    ativo_id: ativo.id,
    tipo: c.tipo,
    data: c.data,
    chamado: c.chamado || undefined,
    observacao: c.observacao || undefined,
  }
  const meta = c.tipo ? CAMPOS_POR_TIPO[c.tipo] : undefined
  if (meta) {
    for (const campo of Object.keys(meta.campos) as CampoMovimentacao[]) {
      serializarCampo(campo, c, obj)
    }
  }
  return obj
}

// Monta os itens do lote no formato de MovimentacaoInput. Antes este trecho
// (map + injecao do status_resultante no ajuste) estava duplicado em
// `validarLote` e em `registrar`. O `status_resultante` vem de estado a parte do
// form (nao da Config), por isso e injetado aqui e nao no construirItem.
export function montarItensInput(
  itens: AtivoResumo[],
  c: Config,
  statusResultante: string,
): Record<string, unknown>[] {
  return itens.map((a) => {
    const obj = construirItem(a, c)
    if (c.tipo === 'ajuste') {
      obj.status_resultante = statusResultante || undefined
    }
    return obj
  })
}
