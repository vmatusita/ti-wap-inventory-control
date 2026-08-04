// Rascunho do fluxo de nova movimentacao (F10/M6 — decisao §2 da OS-F10):
// `sessionStorage` (por aba; some ao fechar o navegador), chave
// `wap:mov:rascunho`. Guarda so o ESQUELETO — ids dos ativos + a config + o
// passo. Os ativos sao re-buscados por id na restauracao
// (`buscarResumoDeAtivosPorIds`), porque status/filial/colaborador podem ter
// mudado enquanto o rascunho dormia: cachear o resumo mostraria estado velho.
//
// Modulo PURO de proposito (sem React, sem 'use client'): a desserializacao
// defensiva e testavel em `rascunho.test.ts`, e as tres funcoes de storage sao
// invocadas SO dentro de `useEffect` pelo componente (ler `sessionStorage` no
// corpo do componente quebraria a hidratacao do Next).
import { MAX_LOTE_MOVIMENTACAO } from '@/lib/validators/movimentacao'
import {
  STATUS_META,
  TERMO_STATUS_ORDEM,
  TIPO_META,
  type TermoStatus,
  type TipoMovimentacao,
} from '@/lib/dominio'
import { configPadrao, type Config } from '@/components/movimentacoes/nova/config'

export const CHAVE_RASCUNHO = 'wap:mov:rascunho'

// F26 — a metade oposta do par troca/upgrade, do jeito que sobrevive no
// storage: SO os ids (os resumos sao re-buscados, como os da metade principal)
// + os campos exclusivos + o flag. OPCIONAL de proposito: rascunho gravado
// ANTES desta fase nao tem este campo e tem de restaurar sem erro.
export type RascunhoContrapartida = {
  ids: string[]
  colaborador: string
  setor: string
  termo: '' | TermoStatus
  termoData: string
  itensFaltantes: string[]
  deixarParaDepois: boolean
}

export type Rascunho = {
  ids: string[]
  config: Config
  statusResultante: string
  passo: number
  contrapartida?: RascunhoContrapartida
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function listaDeTexto(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((i): i is string => typeof i === 'string') : []
}

// Ids vindos do storage: string nao vazia, sem repetir, ate o limite pedido.
function sanearIds(v: unknown, limite: number): string[] {
  if (!Array.isArray(v) || limite <= 0) return []
  return [
    ...new Set(
      v.filter((i): i is string => typeof i === 'string' && i.length > 0),
    ),
  ].slice(0, limite)
}

// A contrapartida e DADO DE FORA como o resto: ausente, mal formada ou de uma
// versao antiga do app => `undefined` (o formulario comeca sem par). O teto do
// lote vale para a SOMA, entao o que sobra do teto e o limite daqui.
function sanearContrapartida(
  bruto: unknown,
  usadosNaPrincipal: number,
): RascunhoContrapartida | undefined {
  if (!bruto || typeof bruto !== 'object') return undefined
  const c = bruto as Record<string, unknown>
  const termo = texto(c.termo)
  return {
    ids: sanearIds(c.ids, MAX_LOTE_MOVIMENTACAO - usadosNaPrincipal),
    colaborador: texto(c.colaborador),
    setor: texto(c.setor),
    termo: (TERMO_STATUS_ORDEM as string[]).includes(termo)
      ? (termo as TermoStatus)
      : '',
    termoData: texto(c.termoData),
    itensFaltantes: listaDeTexto(c.itensFaltantes),
    deixarParaDepois: c.deixarParaDepois === true,
  }
}

// Config vinda do storage e DADO DE FORA (o operador pode editar o
// sessionStorage; uma versao antiga do app pode ter gravado outra forma). Cada
// campo e conferido contra o vocabulario do dominio antes de virar estado do
// formulario — lixo vira valor vazio, nunca um `tipo` inexistente que quebraria
// `CAMPOS_POR_TIPO`.
function sanearConfig(bruto: unknown): Config {
  const base = configPadrao()
  if (!bruto || typeof bruto !== 'object') return base
  const c = bruto as Record<string, unknown>

  const tipo = texto(c.tipo)
  const termo = texto(c.termo)
  const itens = listaDeTexto(c.itensFaltantes)

  return {
    data: texto(c.data) || base.data,
    tipo: tipo in TIPO_META ? (tipo as TipoMovimentacao) : '',
    motivo: texto(c.motivo),
    colaborador: texto(c.colaborador),
    setor: texto(c.setor),
    chamado: texto(c.chamado),
    chamadoFornecedor: texto(c.chamadoFornecedor),
    termo: (TERMO_STATUS_ORDEM as string[]).includes(termo)
      ? (termo as TermoStatus)
      : '',
    termoData: texto(c.termoData),
    observacao: texto(c.observacao),
    filialDestinoId: texto(c.filialDestinoId),
    itensFaltantes: itens,
  }
}

// JSON cru => rascunho utilizavel, ou `null` quando nao ha nada aproveitavel
// (chave ausente, JSON quebrado, lote vazio). Nunca lanca.
export function desserializarRascunho(bruto: string | null): Rascunho | null {
  if (!bruto) return null
  let dados: unknown
  try {
    dados = JSON.parse(bruto)
  } catch {
    return null
  }
  if (!dados || typeof dados !== 'object') return null
  const r = dados as Record<string, unknown>

  const ids = sanearIds(r.ids, MAX_LOTE_MOVIMENTACAO)
  // Rascunho sem ativo nenhum nao interessa: o banner so faz sentido com lote.
  if (ids.length === 0) return null

  const passoBruto = typeof r.passo === 'number' ? Math.trunc(r.passo) : 1
  const status = texto(r.statusResultante)
  const contrapartida = sanearContrapartida(r.contrapartida, ids.length)

  return {
    ids,
    config: sanearConfig(r.config),
    statusResultante: status in STATUS_META ? status : '',
    passo: passoBruto >= 1 && passoBruto <= 3 ? passoBruto : 1,
    // Chave AUSENTE quando nao ha par: assim o rascunho novo de um lote simples
    // continua serializando exatamente como o antigo.
    ...(contrapartida ? { contrapartida } : {}),
  }
}

// --- Storage (chamar SO dentro de useEffect) ------------------------------

// `sessionStorage` pode nem existir (SSR) ou lancar (modo privativo antigo,
// cota): toda operacao e best-effort — rascunho e conveniencia, nunca pode
// derrubar o fluxo de registrar movimentacao.
function sessao(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage
  } catch {
    return null
  }
}

export function lerRascunho(): Rascunho | null {
  const s = sessao()
  if (!s) return null
  try {
    return desserializarRascunho(s.getItem(CHAVE_RASCUNHO))
  } catch {
    return null
  }
}

export function salvarRascunho(r: Rascunho): void {
  const s = sessao()
  if (!s) return
  try {
    s.setItem(CHAVE_RASCUNHO, JSON.stringify(r))
  } catch {
    // Cota estourada / storage bloqueado: segue sem rascunho.
  }
}

export function limparRascunho(): void {
  const s = sessao()
  if (!s) return
  try {
    s.removeItem(CHAVE_RASCUNHO)
  } catch {
    // idem
  }
}
