// Nucleo (puro, testavel) do fluxo de nova movimentacao: a forma da `Config` do
// formulario e a traducao Config -> input do lote (validado pelo Zod). Sem React
// aqui — o componente-mae e os passos consomem estes helpers.
import { hojeISO } from '@/lib/format'
import {
  CAMPOS_POR_TIPO,
  MAX_LOTE_MOVIMENTACAO,
  campoObrigatorio,
  type CampoMovimentacao,
} from '@/lib/validators/movimentacao'
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

// Resultado do envio, alimenta o PainelSucesso (fichas + diálogos de termo).
export type SucessoLote = {
  criadas: number
  tipo: TipoMovimentacao
  motivo: string
  ativos: {
    id: string
    // null = ativo sem patrimônio físico (F7E) — a UI mostra "sem patrimônio".
    patrimonio: string | null
    categoria: CategoriaAtivo
    movimentacaoId: string
  }[]
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
