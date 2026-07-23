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

export type Rascunho = {
  ids: string[]
  config: Config
  statusResultante: string
  passo: number
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : ''
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
  const itens = Array.isArray(c.itensFaltantes)
    ? c.itensFaltantes.filter((i): i is string => typeof i === 'string')
    : []

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

  const ids = Array.isArray(r.ids)
    ? [
        ...new Set(
          r.ids.filter((i): i is string => typeof i === 'string' && i.length > 0),
        ),
      ].slice(0, MAX_LOTE_MOVIMENTACAO)
    : []
  // Rascunho sem ativo nenhum nao interessa: o banner so faz sentido com lote.
  if (ids.length === 0) return null

  const passoBruto = typeof r.passo === 'number' ? Math.trunc(r.passo) : 1
  const status = texto(r.statusResultante)

  return {
    ids,
    config: sanearConfig(r.config),
    statusResultante: status in STATUS_META ? status : '',
    passo: passoBruto >= 1 && passoBruto <= 3 ? passoBruto : 1,
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
