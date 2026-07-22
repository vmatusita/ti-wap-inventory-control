'use server'

import { createClient } from '@/lib/supabase/server'
import { idOperador, MSG_SESSAO_EXPIRADA } from '@/lib/auth/acesso'
import { formatDate, hojeISO } from '@/lib/format'
import { CAP_EXPORT, gerarCsv, nomeArquivoCsv, type ColunaCsv } from '@/lib/csv'
import {
  listarAtivosParaExport,
  type LinhaExportAtivo,
  type ListarAtivosParams,
} from '@/lib/queries/ativos'
import {
  listarPendenciasParaExport,
  ROTULO_TIPO_PENDENCIA,
  type FiltrosPendencias,
  type PendenciaDetalhe,
  type TipoPendencia,
} from '@/lib/queries/pendencias-detalhe'
import {
  getSaldosItens,
  listarHistoricoParaExport,
  type FiltrosHistorico,
  type LinhaExportHistorico,
  type SaldoItem,
} from '@/lib/queries/itens'
import { listarFiliais } from '@/lib/queries/filiais'
import {
  CATEGORIA_ORDEM,
  GRUPO_ITEM_ORDEM,
  STATUS_ORDEM,
  rotuloCategoria,
  rotuloGrupoItem,
  rotuloStatus,
  rotuloTipoLancamento,
  type CategoriaAtivo,
  type GrupoItem,
  type StatusAtivo,
  type TipoLancamento,
} from '@/lib/dominio'

// Export CSV das listas operacionais (OS-F10 · T5). Server Actions de LEITURA:
// montam o arquivo inteiro no servidor e devolvem o texto; o download em si é
// do cliente (Blob), sem rota de API.
//
// Os filtros chegam como a QUERY STRING da própria página (`?status=…&filial=…`)
// e são reparseados aqui com a MESMA semântica do Server Component da tela — é o
// que garante que o arquivo traga exatamente as linhas visíveis. Reparsear (em
// vez de receber um objeto pronto do cliente) mantém a validação no servidor:
// nada que venha do navegador entra numa query sem passar por estes parsers.

export type ResultadoExportCsv = {
  // Canal de erro (sessão expirada, falha de leitura) — nada de exceção
  // atravessando a fronteira da action.
  erro?: string
  nome: string
  conteudo: string
  // Quantas linhas o filtro tem no banco.
  total: number
  // Quantas linhas foram realmente para o arquivo (≤ cap). Vai no toast do
  // truncamento — assim o componente de UI não precisa conhecer o cap (nem
  // importar `@/lib/csv`, que arrastaria o PapaParse para o bundle do cliente).
  exportadas: number
  // Sempre derivado de `exportadas < total` — nunca de `total > cap`. É o que
  // mantém o aviso correto seja qual for o Max Rows do PostgREST.
  truncado: boolean
}

const VAZIO: ResultadoExportCsv = {
  nome: '',
  conteudo: '',
  total: 0,
  exportadas: 0,
  truncado: false,
}

function falha(erro: string): ResultadoExportCsv {
  return { ...VAZIO, erro }
}

// Toda rota de export é de OPERADOR (o visualizador por senha só alcança
// /relatorios/**). A action é um endpoint por si só, então checa a sessão mesmo
// que a página já tenha checado.
async function semOperador(): Promise<boolean> {
  const supabase = await createClient()
  return (await idOperador(supabase)) === null
}

// ---------------------------------------------------------------------------
// Parsers dos filtros — espelham os Server Components das telas.
// ---------------------------------------------------------------------------

// `item_id`/`filial_id` são smallint (migration 0015): validar só o FORMATO
// deixaria passar `?filial=99999`, que o Postgres recusa (22003) e derrubaria a
// leitura. Achado da revisão adversarial da F9 — vale igual aqui.
const MAX_SMALLINT = 32767

function texto(p: URLSearchParams, chave: string): string | undefined {
  const v = p.get(chave)
  return v && v.trim() ? v.trim() : undefined
}

function idNumerico(v: string | undefined): number | null {
  if (!v || !/^\d+$/.test(v)) return null
  const n = Number(v)
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_SMALLINT ? n : null
}

function dataISO(v: string | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null
}

const TIPOS_PENDENCIA: readonly TipoPendencia[] = [
  'termo',
  'itens',
  'triagem',
  'patrimonio',
  'outras',
]

// Lista explícita (não `in TIPO_LANCAMENTO_META`, que aceitaria chave herdada do
// prototype — `?tipo=constructor` viraria cast inválido de enum no banco).
const TIPOS_LANCAMENTO: readonly TipoLancamento[] = [
  'entrada',
  'saida',
  'reserva',
  'liberacao',
  'retorno',
  'ajuste',
]

// Espelha src/app/(app)/ativos/page.tsx (a paginação não vale no export).
function filtrosAtivos(p: URLSearchParams): ListarAtivosParams {
  const categoriaRaw = texto(p, 'categoria')
  const status = (texto(p, 'status') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is StatusAtivo => STATUS_ORDEM.includes(s as StatusAtivo))

  return {
    q: texto(p, 'q'),
    filialId: idNumerico(texto(p, 'filial')) ?? undefined,
    categoria: CATEGORIA_ORDEM.includes(categoriaRaw as CategoriaAtivo)
      ? (categoriaRaw as CategoriaAtivo)
      : undefined,
    status,
    semPatrimonio: texto(p, 'semPatrimonio') === '1',
  }
}

// Espelha src/app/(app)/pendencias/page.tsx.
function filtrosPendencias(p: URLSearchParams): FiltrosPendencias {
  const tipoRaw = texto(p, 'tipo')
  return {
    filialSlug: texto(p, 'filial') ?? null,
    tipo: TIPOS_PENDENCIA.includes(tipoRaw as TipoPendencia)
      ? (tipoRaw as TipoPendencia)
      : null,
    q: texto(p, 'q') ?? null,
  }
}

// Espelha os filtros do histórico de src/app/(app)/itens/page.tsx (F9 · I3).
function filtrosHistorico(p: URLSearchParams): FiltrosHistorico {
  const tipoRaw = texto(p, 'tipo')
  return {
    filialId: idNumerico(texto(p, 'filial')),
    itemId: idNumerico(texto(p, 'item')),
    tipo: TIPOS_LANCAMENTO.includes(tipoRaw as TipoLancamento)
      ? (tipoRaw as TipoLancamento)
      : null,
    de: dataISO(texto(p, 'de')),
    ate: dataISO(texto(p, 'ate')),
  }
}

// ---------------------------------------------------------------------------
// Colunas — "as da tela + o que identifica a linha" (OS-F10 §W4.2).
// ---------------------------------------------------------------------------

const COLUNAS_ATIVOS: ColunaCsv<LinhaExportAtivo>[] = [
  { titulo: 'Patrimônio', valor: (l) => l.patrimonio },
  { titulo: 'Service Tag', valor: (l) => l.service_tag },
  { titulo: 'Hostname', valor: (l) => l.hostname },
  { titulo: 'Categoria', valor: (l) => rotuloCategoria(l.categoria) },
  { titulo: 'Marca', valor: (l) => l.marca },
  { titulo: 'Modelo', valor: (l) => l.modelo },
  { titulo: 'Filial', valor: (l) => l.filial_nome },
  { titulo: 'Status', valor: (l) => rotuloStatus(l.status) },
  { titulo: 'Colaborador', valor: (l) => l.colaborador_atual },
  { titulo: 'Setor', valor: (l) => l.setor_atual },
]

const COLUNAS_PENDENCIAS: ColunaCsv<PendenciaDetalhe>[] = [
  { titulo: 'Tipo', valor: (l) => ROTULO_TIPO_PENDENCIA[l.tipo] },
  { titulo: 'Pendência', valor: (l) => l.pendencia },
  { titulo: 'Patrimônio', valor: (l) => l.patrimonio },
  { titulo: 'Categoria', valor: (l) => (l.categoria ? rotuloCategoria(l.categoria) : '') },
  { titulo: 'Marca', valor: (l) => l.marca },
  { titulo: 'Modelo', valor: (l) => l.modelo },
  { titulo: 'Colaborador', valor: (l) => l.colaborador },
  { titulo: 'Setor', valor: (l) => l.setor },
  { titulo: 'Filial', valor: (l) => l.filialNome ?? l.filialSlug },
  // `desde` é timestamptz: formatDate converte para o fuso de SP antes do dd/MM.
  { titulo: 'Desde', valor: (l) => (l.desde ? formatDate(l.desde) : '') },
]

function colunasSaldos(filialRotulo: string): ColunaCsv<SaldoItem>[] {
  return [
    { titulo: 'Item', valor: (l) => l.item },
    { titulo: 'Grupo', valor: (l) => rotuloGrupoItem(l.grupo) },
    // O saldo é sempre "de uma filial" ou consolidado — sem esta coluna o
    // arquivo perde o contexto assim que sai da tela.
    { titulo: 'Filial', valor: () => filialRotulo },
    { titulo: 'Total', valor: (l) => l.total },
    { titulo: 'Estoque', valor: (l) => l.estoque },
    { titulo: 'Atrelados', valor: (l) => l.atrelados },
    { titulo: 'Falta', valor: (l) => l.falta },
  ]
}

const COLUNAS_HISTORICO: ColunaCsv<LinhaExportHistorico>[] = [
  { titulo: 'Data', valor: (l) => formatDate(l.data) },
  { titulo: 'Tipo', valor: (l) => rotuloTipoLancamento(l.tipo) },
  { titulo: 'Item', valor: (l) => l.item },
  { titulo: 'Grupo', valor: (l) => rotuloGrupoItem(l.grupo) },
  { titulo: 'Quantidade', valor: (l) => l.quantidade },
  { titulo: 'Filial', valor: (l) => l.filial },
  { titulo: 'Chamado', valor: (l) => l.chamado },
  { titulo: 'Colaborador', valor: (l) => l.colaborador },
  { titulo: 'Observação', valor: (l) => l.observacao },
  { titulo: 'Estorno', valor: (l) => (l.ehEstorno ? 'sim' : 'não') },
]

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function exportarAtivosCSV(filtros: string): Promise<ResultadoExportCsv> {
  if (await semOperador()) return falha(MSG_SESSAO_EXPIRADA)
  try {
    const params = filtrosAtivos(new URLSearchParams(filtros))
    const { linhas, total } = await listarAtivosParaExport(params, CAP_EXPORT)
    return {
      nome: nomeArquivoCsv('ativos', hojeISO()),
      conteudo: gerarCsv(COLUNAS_ATIVOS, linhas),
      total,
      exportadas: linhas.length,
      truncado: linhas.length < total,
    }
  } catch (err) {
    console.error('[exportarAtivosCSV] falha ao exportar ativos:', err)
    return falha('Falha ao exportar os ativos. Tente novamente.')
  }
}

export async function exportarPendenciasCSV(filtros: string): Promise<ResultadoExportCsv> {
  if (await semOperador()) return falha(MSG_SESSAO_EXPIRADA)
  try {
    const params = filtrosPendencias(new URLSearchParams(filtros))
    const { linhas, total } = await listarPendenciasParaExport(params, CAP_EXPORT)
    return {
      nome: nomeArquivoCsv('pendencias', hojeISO()),
      conteudo: gerarCsv(COLUNAS_PENDENCIAS, linhas),
      total,
      exportadas: linhas.length,
      truncado: linhas.length < total,
    }
  } catch (err) {
    console.error('[exportarPendenciasCSV] falha ao exportar pendências:', err)
    return falha('Falha ao exportar as pendências. Tente novamente.')
  }
}

// Saldos por item: reusa a RPC da tela (sem paginação) e replica em CÓDIGO os
// filtros `grupo`/`q` — que a página também aplica em código, não no banco.
export async function exportarItensSaldosCSV(filtros: string): Promise<ResultadoExportCsv> {
  if (await semOperador()) return falha(MSG_SESSAO_EXPIRADA)
  try {
    const p = new URLSearchParams(filtros)
    const filialId = idNumerico(texto(p, 'filial'))
    const grupoRaw = texto(p, 'grupo')
    const grupo = GRUPO_ITEM_ORDEM.includes(grupoRaw as GrupoItem)
      ? (grupoRaw as GrupoItem)
      : undefined
    const q = (texto(p, 'q') ?? '').toLowerCase()

    const [saldos, filiais] = await Promise.all([
      getSaldosItens(filialId),
      listarFiliais(),
    ])
    const filtrados = saldos.filter(
      (s) =>
        (!grupo || s.grupo === grupo) && (!q || s.item.toLowerCase().includes(q)),
    )
    const rotuloFilial = filialId
      ? (filiais.find((f) => f.id === filialId)?.nome ?? '—')
      : 'Consolidado'

    const linhas = filtrados.slice(0, CAP_EXPORT)
    return {
      nome: nomeArquivoCsv('itens-saldos', hojeISO()),
      conteudo: gerarCsv(colunasSaldos(rotuloFilial), linhas),
      total: filtrados.length,
      exportadas: linhas.length,
      truncado: linhas.length < filtrados.length,
    }
  } catch (err) {
    console.error('[exportarItensSaldosCSV] falha ao exportar saldos:', err)
    return falha('Falha ao exportar os saldos. Tente novamente.')
  }
}

export async function exportarItensHistoricoCSV(
  filtros: string,
): Promise<ResultadoExportCsv> {
  if (await semOperador()) return falha(MSG_SESSAO_EXPIRADA)
  try {
    const params = filtrosHistorico(new URLSearchParams(filtros))
    const { linhas, total } = await listarHistoricoParaExport(params, CAP_EXPORT)
    return {
      nome: nomeArquivoCsv('itens-historico', hojeISO()),
      conteudo: gerarCsv(COLUNAS_HISTORICO, linhas),
      total,
      exportadas: linhas.length,
      truncado: linhas.length < total,
    }
  } catch (err) {
    console.error('[exportarItensHistoricoCSV] falha ao exportar histórico:', err)
    return falha('Falha ao exportar o histórico. Tente novamente.')
  }
}
