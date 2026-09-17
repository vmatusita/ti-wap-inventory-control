// Rascunho da compra (F28/ATV-10b — decisão registrada em docs/DECISOES.md):
// `sessionStorage` (por aba; some ao fechar o navegador), chave própria
// `wap:compra:rascunho`. NÃO confundir com `wap:compra:defaults` (usada em
// `nova-compra-form.tsx`): aquela é `localStorage` e guarda só categoria +
// filial como memória de LONGO PRAZO entre compras (dispositivo, não aba) —
// as duas coexistem e servem a propósitos diferentes.
//
// Difere do rascunho do wizard de movimentação (`movimentacoes/nova/rascunho.ts`,
// que é o molde clonado aqui): lá o lote é uma lista de IDS de ativos já
// existentes, re-buscados no banco na restauração. Aqui os patrimônios da
// compra ainda NÃO EXISTEM no acervo — não há o que buscar —, então o
// rascunho guarda o TEXTO CRU que o operador digitou ou colou (lista ou
// faixa) e as demais respostas do formulário, tal como estão.
//
// Módulo PURO de propósito (sem React, sem 'use client'): a desserialização
// defensiva é testável em `rascunho-compra.test.ts`, e as três funções de
// storage só são chamadas dentro de `useEffect` pelo componente (ler
// `sessionStorage` no corpo do componente quebraria a hidratação do Next).
import { CATEGORIA_ORDEM, type CategoriaAtivo } from '@/lib/dominio'
import { hojeISO } from '@/lib/format'
import { expandirFaixa, parsearLista } from '@/lib/patrimonio'
import { chaveDeStorage } from '@/lib/escopo/chave'

// F61 — a chave é MONTADA por `chaveDeStorage` (`lib/escopo/chave.ts`) no USO, e sai
// idêntica byte a byte à literal de antes (`wap:compra:rascunho`) — nenhum rascunho ou
// preferência gravada se perde. Função, não constante: uma constante de módulo
// congelaria o valor, e o call-site tem de continuar igual quando a chave do escopo
// deixar de ser fixa (virada multiempresa). Trava: `lib/escopo/chaves-de-storage.test.ts`.
export function chaveRascunhoCompra(): string {
  return chaveDeStorage('compra:rascunho')
}

/**
 * A memória dos defaults da compra (`localStorage`, POR DISPOSITIVO — decisão da OS-F9:
 * sem coluna nova em `profiles`, sem migration). Mora aqui, ao lado da outra chave da
 * compra, para ser conferida por teste sem importar o formulário inteiro.
 */
export function chaveCompraDefaults(): string {
  return chaveDeStorage('compra:defaults')
}

// Um paste gigante (planilha inteira colada por engano, ou um arquivo binário
// que caiu no textarea) não pode estourar a cota do sessionStorage nem travar
// a aba: 200 patrimônios com service tag cabem folgado em poucos milhares de
// caracteres — o teto aqui é generoso para o uso real e curto o bastante para
// nunca chegar perto do limite de alguns MB do storage.
export const MAX_CHARS_TEXTO_RASCUNHO = 20_000

export type RascunhoCompra = {
  modo: 'lista' | 'faixa'
  textoLista: string
  faixaInicio: string
  faixaFim: string
  faixaSts: string
  categoria: CategoriaAtivo | ''
  marca: string
  modelo: string
  memoria: string
  armazenamento: string
  processador: string
  fornecedor: string
  filialId: string
  observacao: string
  data: string
  // Campos exclusivos de CELULAR (F25) — ver `nova-compra-form.tsx`.
  telefone: string
  imei: string
  pulsus: string
  salvoEm: string
}

function texto(v: unknown, max = MAX_CHARS_TEXTO_RASCUNHO): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

// `CATEGORIA_ORDEM.includes`, e não `v in ...`: o `in` enxerga chaves
// herdadas de `Object.prototype` (achado da F26 no rascunho do wizard) — um
// sessionStorage adulterado com `categoria: "toString"` passaria por válido.
function categoriaSaneada(v: unknown): CategoriaAtivo | '' {
  return typeof v === 'string' && (CATEGORIA_ORDEM as readonly string[]).includes(v)
    ? (v as CategoriaAtivo)
    : ''
}

// Quantos patrimônios o rascunho representa — só para o texto do banner
// ("N patrimônios"), reaproveitando os mesmos parsers do preview do
// formulário. Best-effort: faixa incompleta ou texto mal formado conta como
// zero, nunca lança.
export function contarPatrimoniosRascunho(r: RascunhoCompra): number {
  if (r.modo === 'lista') return parsearLista(r.textoLista).itens.length
  if (!r.faixaInicio.trim() || !r.faixaFim.trim()) return 0
  return expandirFaixa(r.faixaInicio, r.faixaFim).itens?.length ?? 0
}

// Nenhum campo com conteúdo — nem patrimônio digitado/colado, nem dado do
// modelo. `data` fica de fora de propósito: o campo já nasce preenchido com
// `hojeISO()` num formulário virgem, e isso sozinho não é "ter algo para
// restaurar" — sem esta exclusão, TODO formulário recém-aberto contaria como
// rascunho e o banner apareceria sozinho, sem o operador ter digitado nada.
export function rascunhoVazio(r: Omit<RascunhoCompra, 'salvoEm' | 'data'>): boolean {
  return (
    r.textoLista.trim() === '' &&
    r.faixaInicio.trim() === '' &&
    r.faixaFim.trim() === '' &&
    r.faixaSts.trim() === '' &&
    r.categoria === '' &&
    r.marca.trim() === '' &&
    r.modelo.trim() === '' &&
    r.memoria.trim() === '' &&
    r.armazenamento.trim() === '' &&
    r.processador.trim() === '' &&
    r.fornecedor.trim() === '' &&
    r.filialId === '' &&
    r.observacao.trim() === '' &&
    r.telefone.trim() === '' &&
    r.imei.trim() === '' &&
    r.pulsus.trim() === ''
  )
}

// JSON cru => rascunho utilizável, ou `null` quando não há nada aproveitável
// (chave ausente, JSON quebrado, ou formulário efetivamente vazio). Nunca
// lança — chamado direto sobre o que veio do `sessionStorage`, que o operador
// pode ter editado à mão ou que pode ter sido gravado por uma versão antiga
// do app (campos novos ausentes).
export function desserializarRascunhoCompra(
  bruto: string | null,
): RascunhoCompra | null {
  if (!bruto) return null
  let dados: unknown
  try {
    dados = JSON.parse(bruto)
  } catch {
    return null
  }
  if (!dados || typeof dados !== 'object') return null
  const r = dados as Record<string, unknown>

  const saneado: RascunhoCompra = {
    modo: r.modo === 'faixa' ? 'faixa' : 'lista',
    textoLista: texto(r.textoLista),
    faixaInicio: texto(r.faixaInicio),
    faixaFim: texto(r.faixaFim),
    faixaSts: texto(r.faixaSts),
    categoria: categoriaSaneada(r.categoria),
    marca: texto(r.marca),
    modelo: texto(r.modelo),
    memoria: texto(r.memoria),
    armazenamento: texto(r.armazenamento),
    processador: texto(r.processador),
    fornecedor: texto(r.fornecedor),
    filialId: texto(r.filialId),
    observacao: texto(r.observacao),
    data: texto(r.data) || hojeISO(),
    telefone: texto(r.telefone),
    imei: texto(r.imei),
    pulsus: texto(r.pulsus),
    salvoEm: texto(r.salvoEm),
  }
  // Rascunho sem NADA digitado não interessa: o banner só faz sentido com
  // algo para restaurar (mesma régua do "sem ids" no rascunho do wizard).
  if (rascunhoVazio(saneado)) return null
  return saneado
}

// --- Storage (chamar SÓ dentro de useEffect) ------------------------------

// `sessionStorage` pode nem existir (SSR) ou lançar (modo privativo antigo,
// cota): toda operação é best-effort — rascunho é conveniência, nunca pode
// derrubar o fluxo de cadastrar a compra.
function sessao(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage
  } catch {
    return null
  }
}

export function lerRascunhoCompra(): RascunhoCompra | null {
  const s = sessao()
  if (!s) return null
  try {
    return desserializarRascunhoCompra(s.getItem(chaveRascunhoCompra()))
  } catch {
    return null
  }
}

export function salvarRascunhoCompra(r: RascunhoCompra): void {
  const s = sessao()
  if (!s) return
  try {
    // Teto do texto colado GRAVADO, e não só na leitura: um paste gigante não
    // pode nem chegar a ocupar espaço no storage.
    s.setItem(
      chaveRascunhoCompra(),
      JSON.stringify({
        ...r,
        textoLista: r.textoLista.slice(0, MAX_CHARS_TEXTO_RASCUNHO),
        faixaSts: r.faixaSts.slice(0, MAX_CHARS_TEXTO_RASCUNHO),
      }),
    )
  } catch {
    // Cota estourada / storage bloqueado: segue sem rascunho.
  }
}

export function limparRascunhoCompra(): void {
  const s = sessao()
  if (!s) return
  try {
    s.removeItem(chaveRascunhoCompra())
  } catch {
    // idem
  }
}
