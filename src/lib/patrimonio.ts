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

// `linha` = número da linha ORIGINAL do texto colado (1-based). Linhas em branco
// ou inválidas não deslocam a numeração — a linha 3 do textarea é sempre 3.
export type ItemPatrimonio = { patrimonio: string; service_tag?: string; linha?: number }
export type ErroLinha = { linha: number; texto: string; msg: string }

// Separadores aceitos entre patrimônio e service tag: vírgula, ponto e vírgula e
// TAB (A1 — colar duas colunas direto do Excel gera TAB).
const SEPARADOR_LISTA = /[,;\t]/

// Lista colada: um patrimônio por linha, service tag opcional após o separador.
export function parsearLista(texto: string): {
  itens: ItemPatrimonio[]
  erros: ErroLinha[]
} {
  const itens: ItemPatrimonio[] = []
  const erros: ErroLinha[] = []
  texto.split('\n').forEach((bruto, i) => {
    const linha = i + 1
    // Normaliza: tira espaços e separadores vazios sobrando nas pontas
    // (`WAP0001234⇥` colado do Excel não é "2 colunas", é 1).
    const t = bruto.replace(/^[\s,;]+/, '').replace(/[\s,;]+$/, '')
    if (!t) return

    const campos = t.split(SEPARADOR_LISTA).map((s) => s.trim()).filter(Boolean)
    if (campos.length > 2) {
      erros.push({
        linha,
        texto: t,
        msg: 'mais de 2 colunas — cole só patrimônio e service tag',
      })
      return
    }

    // Divide no PRIMEIRO separador; o resto (limpo) é a service tag.
    const corte = t.search(SEPARADOR_LISTA)
    const patrimonioBruto = corte === -1 ? t : t.slice(0, corte)
    const patrimonio = canonicalizarPatrimonio(patrimonioBruto)
    if (!patrimonio) {
      erros.push({
        linha,
        texto: t,
        msg: `"${t}" não está no formato de patrimônio (ex.: WAP0006026)`,
      })
      return
    }
    const resto =
      corte === -1 ? '' : t.slice(corte + 1).replace(/^[\s,;]+/, '').trim()
    const service_tag = resto ? resto : undefined
    itens.push({ patrimonio, service_tag, linha })
  })
  return { itens, erros }
}

// A3 — duplicidade DENTRO da lista colada (mesma chave §5 = patrimônio + service
// tag). Pura: o form usa para marcar os chips e barrar o envio; o servidor
// (`actions/compras.ts`) continua sendo o juiz final.
export type DuplicataLista = {
  chave: string
  patrimonio: string
  service_tag?: string
  linhas: number[]
}

export function duplicatasDaLista(itens: ItemPatrimonio[]): DuplicataLista[] {
  const porChave = new Map<string, DuplicataLista & { ocorrencias: number }>()
  for (const item of itens) {
    const chave = chavePatrimonio(item.patrimonio, item.service_tag)
    const atual = porChave.get(chave)
    if (atual) {
      atual.ocorrencias += 1
      if (item.linha !== undefined) atual.linhas.push(item.linha)
    } else {
      porChave.set(chave, {
        chave,
        patrimonio: item.patrimonio,
        service_tag: item.service_tag,
        linhas: item.linha !== undefined ? [item.linha] : [],
        ocorrencias: 1,
      })
    }
  }
  return [...porChave.values()]
    .filter((d) => d.ocorrencias > 1)
    .map(({ chave, patrimonio, service_tag, linhas }) => ({
      chave,
      patrimonio,
      service_tag,
      linhas: [...linhas].sort((a, b) => a - b),
    }))
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

// A2 (F10) — pareia a faixa JÁ expandida com uma lista OPCIONAL de service tags
// (uma por linha, na ordem da faixa). Antes da F10 a faixa só gerava patrimônios
// e quem tinha service tag por unidade era obrigado a montar a lista à mão.
// Texto vazio = faixa sem service tags (comportamento idêntico ao anterior).
// Pura: o form usa no preview; o servidor (`actions/compras.ts` + índice único
// do banco) continua sendo o juiz.
export function parearFaixaComServiceTags(
  patrimonios: string[],
  stsTexto: string,
): { itens: ItemPatrimonio[]; erro?: undefined } | { itens?: undefined; erro: string } {
  // Linhas em branco não contam (colar do Excel costuma trazer linha final vazia).
  const tags: { valor: string; linha: number }[] = []
  stsTexto.split('\n').forEach((bruto, i) => {
    const t = bruto.trim()
    if (t) tags.push({ valor: t, linha: i + 1 })
  })

  if (tags.length === 0) {
    return { itens: patrimonios.map((p) => ({ patrimonio: p })) }
  }

  if (tags.length !== patrimonios.length) {
    const p = `${patrimonios.length} ${patrimonios.length === 1 ? 'patrimônio' : 'patrimônios'}`
    const s = `${tags.length} service ${tags.length === 1 ? 'tag' : 'tags'}`
    return {
      erro: `Contagem diferente: ${p} × ${s} — informe uma service tag por patrimônio (na ordem da faixa) ou deixe o campo vazio.`,
    }
  }

  // Service tag repetida na faixa é sempre erro de digitação: o índice único do
  // banco é (patrimônio + service tag), então dois patrimônios distintos com a
  // MESMA tag passariam batido e o acervo ficaria errado em silêncio.
  const vistas = new Map<string, number>()
  for (const t of tags) {
    const k = t.valor.toUpperCase()
    const anterior = vistas.get(k)
    if (anterior !== undefined) {
      return {
        erro: `Service tag repetida: ${t.valor} nas linhas ${anterior} e ${t.linha}.`,
      }
    }
    vistas.set(k, t.linha)
  }

  return {
    itens: patrimonios.map((p, i) => ({
      patrimonio: p,
      service_tag: tags[i].valor,
    })),
  }
}

// Chave de unicidade do ativo (§5): o PAR patrimônio + service tag é único — o
// patrimônio sozinho repete em casos raros. Espelha o índice do banco, que usa
// coalesce(service_tag, ''). Usada para dedupe/conflito no lote de compra.
export function chavePatrimonio(patrimonio: string, serviceTag?: string | null): string {
  return `${patrimonio}::${serviceTag ?? ''}`
}

// F7E — sentinela do espaço de chaves dos ativos SEM patrimônio: `∅` (U+2205).
// U+2205 nunca ocorre num patrimônio canônico ([A-Z]{2,4}\d{7}), então convive sem
// colisão com as chaves dos ativos com patrimônio. FONTE ÚNICA (era duplicado em
// plano.ts e import-logs.ts): o motor (plano.ts), a query F7C (import-logs.ts) e a
// RPC do banco montam a MESMA chave `∅::<...>` — mudar aqui muda os três de uma vez.
export const SEM_PATRIMONIO = '∅'

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
