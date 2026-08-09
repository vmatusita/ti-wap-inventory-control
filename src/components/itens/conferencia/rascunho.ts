// Rascunho da CONFERÊNCIA DE ESTOQUE (F31 · ITN-04): `sessionStorage` (por aba;
// some ao fechar o navegador), chave `wap:itens:conferencia`.
//
// Molde COPIADO de `src/components/movimentacoes/nova/rascunho.ts` — copiado e
// não importado, de propósito: a forma guardada é outra (contagens por item, não
// ids de ativo) e a única coisa em comum é a disciplina de desserialização
// defensiva. Reaproveitar por herança acoplaria dois fluxos que não têm por que
// mudar juntos.
//
// Módulo PURO (sem React, sem 'use client'): a desserialização é testável em
// `rascunho.test.ts`, e as três funções de storage são chamadas SÓ dentro de
// `useEffect` (ler `sessionStorage` no corpo do componente quebraria a hidratação
// do Next).
//
// ⚠ O QUE ELE GUARDA E POR QUÊ. `contagens` é o trabalho braçal que não pode se
// perder num F5 no meio do corredor. `gravados` é o que já foi confirmado pelo
// servidor — e ele PRECISA sobreviver junto: sem isso, um refresh depois de um
// envio parcial reofereceria os ajustes já gravados e o estoque andaria duas
// vezes na mesma direção (ver `itensPendentes`, em `lib/itens/conferencia.ts`).
// Os SALDOS não são guardados: eles são relidos do servidor na restauração,
// porque alguém pode ter lançado alguma coisa enquanto o rascunho dormia — um
// saldo cacheado faria a tela calcular diferença contra um número velho.

const PREFIXO_RASCUNHO_CONFERENCIA = 'wap:itens:conferencia'

/**
 * A chave é POR FILIAL, e isso não é enfeite (3ª volta da revisão adversarial da
 * F31): com uma chave global, um operador que estivesse no meio da contagem da
 * filial A e abrisse a conferência da filial B apagava, na primeira tecla
 * digitada em B, o rascunho de A — que ainda tinha contagens não registradas.
 * A leitura já recusava rascunho de outra filial; era a ESCRITA que passava por
 * cima. Com um espaço por filial, as duas convivem.
 */
export function chaveRascunhoConferencia(filialId: number): string {
  return `${PREFIXO_RASCUNHO_CONFERENCIA}:${filialId}`
}

export type RascunhoConferencia = {
  filialId: number
  /** itemId → texto digitado no campo "Contado" (string, como no input). */
  contagens: Record<number, string>
  /** Esta conferência já gravou alguma coisa, em algum momento — é o que sustenta
   *  o "Encerrar conferência".
   *
   *  ⚠ O QUE **NÃO** ESTÁ AQUI, e é decisão: o quanto já foi gravado por item.
   *  Depois de um F5 os saldos que o servidor manda já incluem tudo o que esta
   *  conferência escreveu, e a base congelada é recapturada deles — guardar o
   *  acumulado faria a mesma escrita ser descontada duas vezes. O acumulado é
   *  estado de SESSÃO (`jaEscrito`, no componente), não de rascunho. */
  registrou: boolean
  /** Observação do lote, se o operador editou a padrão. */
  observacao?: string
  /** ISO de quando a conferência começou — alimenta o "começada às {hora}". */
  iniciadaEm?: string
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Id de item/filial vindo do storage: inteiro positivo, ou `null`. */
function idPositivo(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN
  return Number.isInteger(n) && n > 0 ? n : null
}

// As contagens vêm de fora (o operador edita o sessionStorage; uma versão antiga
// do app gravou outra forma). Chave que não seja id positivo e valor que não seja
// string são DESCARTADOS — nunca viram estado do formulário. O valor NÃO é
// validado como número aqui de propósito: quem decide o que é contagem válida é
// `contagemDaLinha`, uma função só, e duplicar a régua aqui abriria a chance de
// as duas discordarem.
function sanearContagens(bruto: unknown): Record<number, string> {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {}
  const saida: Record<number, string> = {}
  for (const [chave, valor] of Object.entries(bruto as Record<string, unknown>)) {
    const id = idPositivo(chave)
    if (id === null || typeof valor !== 'string') continue
    saida[id] = valor
  }
  return saida
}

/**
 * JSON cru => rascunho utilizável, ou `null` quando não há nada aproveitável
 * (chave ausente, JSON quebrado, filial inválida). Nunca lança.
 *
 * Sem filial não há conferência: o saldo de um item é POR FILIAL, e restaurar
 * contagens sem saber de onde elas são seria pior que perdê-las.
 */
export function desserializarRascunhoConferencia(
  bruto: string | null,
): RascunhoConferencia | null {
  if (!bruto) return null
  let dados: unknown
  try {
    dados = JSON.parse(bruto)
  } catch {
    return null
  }
  if (!dados || typeof dados !== 'object') return null
  const r = dados as Record<string, unknown>

  const filialId = idPositivo(r.filialId)
  if (filialId === null) return null

  const contagens = sanearContagens(r.contagens)
  // Rascunho sem contagem NENHUMA não interessa: o banner ofereceria "continuar"
  // um trabalho que não existe. `registrou` sozinho também conta — é a
  // conferência que já gravou tudo e está esperando o "Encerrar".
  if (Object.keys(contagens).length === 0 && r.registrou !== true) {
    return null
  }

  return {
    filialId,
    contagens,
    // Ausente (ou qualquer coisa que não seja `true` literal) => false. Nunca
    // `undefined` vazando para a tela.
    registrou: r.registrou === true,
    observacao: texto(r.observacao),
    iniciadaEm: texto(r.iniciadaEm),
  }
}

// --- Storage (chamar SO dentro de useEffect) ------------------------------

// `sessionStorage` pode nem existir (SSR) ou lançar (modo privativo antigo,
// cota): toda operação é best-effort — rascunho é conveniência, nunca pode
// derrubar a conferência.
function sessao(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage
  } catch {
    return null
  }
}

export function lerRascunhoConferencia(filialId: number): RascunhoConferencia | null {
  const s = sessao()
  if (!s) return null
  try {
    const r = desserializarRascunhoConferencia(s.getItem(chaveRascunhoConferencia(filialId)))
    // Cinto-e-suspensórios: mesmo com a chave por filial, um rascunho cujo
    // `filialId` interno não bate com a chave é lixo (storage adulterado, versão
    // antiga do app que usava a chave global) e não é oferecido.
    return r && r.filialId === filialId ? r : null
  } catch {
    return null
  }
}

export function salvarRascunhoConferencia(r: RascunhoConferencia): void {
  const s = sessao()
  if (!s) return
  try {
    s.setItem(chaveRascunhoConferencia(r.filialId), JSON.stringify(r))
  } catch {
    // Cota estourada / storage bloqueado: segue sem rascunho.
  }
}

export function limparRascunhoConferencia(filialId: number): void {
  const s = sessao()
  if (!s) return
  try {
    s.removeItem(chaveRascunhoConferencia(filialId))
  } catch {
    // idem
  }
}

/** Hora `HH:mm` de um ISO guardado, ou `null` se não der para ler. Puro. */
export function horaDoRascunho(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
