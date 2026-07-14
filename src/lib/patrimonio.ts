// Utilidades de patrimônio (spec §5). Formato canônico = PREFIXO (2–4 letras) +
// 7 dígitos com zeros à esquerda (ex.: WAP4491 → WAP0004491). Puras — servem no
// cliente (preview do lote de compra) e no servidor (validação).

export const PATRIMONIO_CANONICAL_RE = /^[A-Z]{2,4}\d{7}$/

// Máximo de unidades por lote de compra (guarda anti-abuso na faixa).
export const MAX_LOTE_COMPRA = 200

// Normaliza para o formato canônico; null se não reconhecer prefixo+dígitos.
export function canonicalizarPatrimonio(raw: string): string | null {
  const t = raw.trim().toUpperCase().replace(/[\s-]/g, '')
  const m = t.match(/^([A-Z]{2,4})(\d+)$/)
  if (!m) return null
  const prefixo = m[1]
  const significativos = m[2].replace(/^0+/, '') || '0'
  if (significativos.length > 7) return null
  return `${prefixo}${significativos.padStart(7, '0')}`
}

export type ItemPatrimonio = { patrimonio: string; service_tag?: string }
export type ErroLinha = { linha: number; texto: string; msg: string }

// Lista colada: um patrimônio por linha, service tag opcional após vírgula.
export function parsearLista(texto: string): {
  itens: ItemPatrimonio[]
  erros: ErroLinha[]
} {
  const itens: ItemPatrimonio[] = []
  const erros: ErroLinha[] = []
  texto.split('\n').forEach((linha, i) => {
    const t = linha.trim()
    if (!t) return
    const partes = t.split(',').map((s) => s.trim())
    const patrimonio = canonicalizarPatrimonio(partes[0] ?? '')
    if (!patrimonio) {
      erros.push({ linha: i + 1, texto: t, msg: 'patrimônio fora do formato (ex.: WAP0006026)' })
      return
    }
    const service_tag = partes[1] ? partes[1] : undefined
    itens.push({ patrimonio, service_tag })
  })
  return { itens, erros }
}

// Faixa: mesmo prefixo, do inicial ao final (inclusive). N unidades do mesmo modelo.
export function expandirFaixa(
  inicioRaw: string,
  fimRaw: string,
): { itens: string[]; erro?: undefined } | { itens?: undefined; erro: string } {
  const ini = canonicalizarPatrimonio(inicioRaw)
  const fim = canonicalizarPatrimonio(fimRaw)
  if (!ini) return { erro: `Patrimônio inicial inválido: "${inicioRaw}"` }
  if (!fim) return { erro: `Patrimônio final inválido: "${fimRaw}"` }
  const pi = ini.match(/^([A-Z]{2,4})(\d{7})$/)!
  const pf = fim.match(/^([A-Z]{2,4})(\d{7})$/)!
  if (pi[1] !== pf[1]) {
    return { erro: 'A faixa precisa ter o mesmo prefixo nos dois patrimônios.' }
  }
  const a = Number(pi[2])
  const b = Number(pf[2])
  if (a > b) return { erro: 'O patrimônio inicial deve ser ≤ ao final.' }
  const qtd = b - a + 1
  if (qtd > MAX_LOTE_COMPRA) {
    return { erro: `A faixa tem ${qtd} itens; o máximo por lote é ${MAX_LOTE_COMPRA}.` }
  }
  const itens: string[] = []
  for (let n = a; n <= b; n++) itens.push(`${pi[1]}${String(n).padStart(7, '0')}`)
  return { itens }
}

// Chave de unicidade do ativo (§5): o PAR patrimônio + service tag é único — o
// patrimônio sozinho repete em casos raros. Espelha o índice do banco, que usa
// coalesce(service_tag, ''). Usada para dedupe/conflito no lote de compra.
export function chavePatrimonio(patrimonio: string, serviceTag?: string | null): string {
  return `${patrimonio}::${serviceTag ?? ''}`
}

// Quais patrimônios da lista aparecem em MAIS DE UM item — a duplicidade legítima
// do §5 (mesmo patrimônio em ativos distintos), usada para sinalizar/desambiguar
// na UI. Conta pelo patrimônio SOZINHO (≠ chavePatrimonio, que é o par único).
export function patrimoniosRepetidos(patrimonios: string[]): Set<string> {
  const contagem = new Map<string, number>()
  for (const p of patrimonios) contagem.set(p, (contagem.get(p) ?? 0) + 1)
  return new Set(
    [...contagem.entries()].filter(([, n]) => n > 1).map(([p]) => p),
  )
}
