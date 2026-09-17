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
  TERMO_STATUS_ORDEM,
  ehStatusAtivo,
  ehTipoMovimentacao,
  type TermoStatus,
} from '@/lib/dominio'
import {
  configPadrao,
  type Config,
  type ItemDevolvido,
  type ItemJunto,
} from '@/components/movimentacoes/nova/config'

import { chaveDeStorage } from '@/lib/escopo/chave'

// F61 — a chave é MONTADA por `chaveDeStorage` (`lib/escopo/chave.ts`) no USO, e sai
// idêntica byte a byte à literal de antes (`wap:mov:rascunho`) — nenhum rascunho ou
// preferência gravada se perde. Função, não constante: uma constante de módulo
// congelaria o valor, e o call-site tem de continuar igual quando a chave do escopo
// deixar de ser fixa (virada multiempresa). Trava: `lib/escopo/chaves-de-storage.test.ts`.
export function chaveRascunhoMovimentacao(): string {
  return chaveDeStorage('mov:rascunho')
}

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
  // F38 — o outro desfecho do mesmo checklist. Opcional: rascunho gravado antes
  // deste campo existir restaura sem erro, com lista vazia.
  itensDevolvidos?: ItemDevolvido[]
  deixarParaDepois: boolean
  // OPCIONAIS: rascunho gravado antes destes campos existirem restaura sem erro.
  // `jaRegistrada` PRECISA viajar junto com `deixarParaDepois` — sem ela, um
  // rascunho salvo na tela aberta pelo atalho voltava dizendo "adiei a outra
  // metade" quando na verdade ela ja estava gravada, e o painel reoferecia o
  // atalho. `prefillColaborador` diz se o nome no campo e do sistema ou do
  // operador; ausente, o campo passa a ser tratado como do operador (nunca
  // sobrescrito), que e o lado seguro.
  jaRegistrada?: boolean
  prefillColaborador?: string
}

export type Rascunho = {
  ids: string[]
  config: Config
  statusResultante: string
  passo: number
  contrapartida?: RascunhoContrapartida
  // F28/MOV-11 — snapshot para o banner "lote não registrado" dizer QUAIS
  // ativos, de que TIPO e QUANDO — não só a contagem. Os três são OPCIONAIS e
  // saneados com as MESMAS funções defensivas do resto do módulo
  // (`listaDeTexto`/`texto`): um rascunho gravado ANTES desta fase não tem
  // estas chaves e tem de restaurar sem erro (ver rascunho.test.ts).
  // `patrimonios` guarda string vazia para o ativo SEM plaqueta — é o mesmo
  // sentinela que `sanearConfig` já usa para "sem valor" nos outros campos.
  patrimonios?: string[]
  tipo?: string
  salvoEm?: string
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
  const devolvidos = saneiaItensDevolvidos(c.itensDevolvidos)
  return {
    ids: sanearIds(c.ids, MAX_LOTE_MOVIMENTACAO - usadosNaPrincipal),
    colaborador: texto(c.colaborador),
    setor: texto(c.setor),
    termo: (TERMO_STATUS_ORDEM as string[]).includes(termo)
      ? (termo as TermoStatus)
      : '',
    termoData: texto(c.termoData),
    itensFaltantes: listaDeTexto(c.itensFaltantes),
    // F38 — o outro desfecho do mesmo checklist, na metade da troca. Sai do objeto
    // quando está vazio (o caso comum): o rascunho é sessionStorage, e uma chave a
    // mais por metade da troca não paga o custo de existir sem conteúdo.
    ...(devolvidos.length > 0 ? { itensDevolvidos: devolvidos } : {}),
    deixarParaDepois: c.deixarParaDepois === true,
    jaRegistrada: c.jaRegistrada === true,
    // Ausente => `undefined`: quem restaura trata o campo como do OPERADOR.
    prefillColaborador:
      typeof c.prefillColaborador === 'string' ? c.prefillColaborador : undefined,
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
    // `ehTipoMovimentacao`, e não `tipo in TIPO_META` (F26): o `in` enxerga as
    // chaves herdadas de `Object.prototype`, então um sessionStorage adulterado
    // com `tipo: "toString"` passava por tipo válido e estourava depois, em
    // `CAMPOS_POR_TIPO[tipo].campos`. Mesma correção em `configInicialDaUrl`.
    tipo: ehTipoMovimentacao(tipo) ? tipo : '',
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
    // F38 — sem estas duas linhas o rascunho voltava perdendo os itens do lote.
    itensDevolvidos: saneiaItensDevolvidos(c.itensDevolvidos),
    itensJunto: saneiaItensJunto(c.itensJunto),
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
    statusResultante: ehStatusAtivo(status) ? status : '',
    passo: passoBruto >= 1 && passoBruto <= 3 ? passoBruto : 1,
    // Chave AUSENTE quando nao ha par: assim o rascunho novo de um lote simples
    // continua serializando exatamente como o antigo.
    ...(contrapartida ? { contrapartida } : {}),
    // F28/MOV-11 — ausentes (rascunho antigo) caem no vazio de `listaDeTexto`/
    // `texto`: array vazio, string vazia. O banner trata isso como "nada a
    // mostrar" e cai no texto de hoje (só a contagem) — nunca "undefined".
    patrimonios: listaDeTexto(r.patrimonios),
    tipo: texto(r.tipo),
    salvoEm: texto(r.salvoEm),
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
    return desserializarRascunho(s.getItem(chaveRascunhoMovimentacao()))
  } catch {
    return null
  }
}

export function salvarRascunho(r: Rascunho): void {
  const s = sessao()
  if (!s) return
  try {
    s.setItem(chaveRascunhoMovimentacao(), JSON.stringify(r))
  } catch {
    // Cota estourada / storage bloqueado: segue sem rascunho.
  }
}

export function limparRascunho(): void {
  const s = sessao()
  if (!s) return
  try {
    s.removeItem(chaveRascunhoMovimentacao())
  } catch {
    // idem
  }
}

// ---------------------------------------------------------------------------
// F38 — os campos de item do rascunho (achado da revisão adversarial da fase)
// ---------------------------------------------------------------------------
// `itensDevolvidos` e `itensJunto` nasceram na F38 e `sanearConfig` não os
// copiava: o rascunho voltava com os dois vazios, e o operador que montou um lote
// de entrega com três acessórios, fechou a aba e voltou perdia essa parte SEM
// AVISO — a tela reabria completa, só que sem os itens.
//
// São DADOS DE FORA (o operador pode editar o sessionStorage), então cada campo é
// conferido: índice/id/quantidade têm de ser inteiros sãos, e o `itemId` do
// devolvido é `number | null` de propósito (null = a ponte não resolveu, e isso
// não é erro). Lixo vira lista vazia, nunca estado inválido.

function inteiroPositivo(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null
}

function saneiaItensJunto(bruto: unknown): ItemJunto[] {
  if (!Array.isArray(bruto)) return []
  const saidas: ItemJunto[] = []
  for (const l of bruto) {
    if (!l || typeof l !== 'object') continue
    const o = l as Record<string, unknown>
    const indice =
      typeof o.indice === 'number' && Number.isInteger(o.indice) && o.indice >= 0
        ? o.indice
        : null
    const itemId = inteiroPositivo(o.itemId)
    const quantidade = inteiroPositivo(o.quantidade)
    if (indice === null || itemId === null || quantidade === null) continue
    saidas.push({ indice, itemId, quantidade })
  }
  return saidas
}

function saneiaItensDevolvidos(bruto: unknown): ItemDevolvido[] {
  if (!Array.isArray(bruto)) return []
  const saidas: ItemDevolvido[] = []
  for (const l of bruto) {
    if (!l || typeof l !== 'object') continue
    const o = l as Record<string, unknown>
    const tipoSlug = typeof o.tipoSlug === 'string' ? o.tipoSlug.trim() : ''
    if (!tipoSlug) continue
    saidas.push({ tipoSlug, itemId: inteiroPositivo(o.itemId) })
  }
  return saidas
}
