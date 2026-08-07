// Parâmetros de URL da LISTA de ativos (F11/T7): ordenação por coluna (`?ord=`)
// e tamanho de página (`?pp=`). Tudo aqui é FUNÇÃO PURA — sem Supabase, sem
// React, sem `next/*`.
//
// Por que módulo separado e não dentro de `lib/queries/ativos.ts`: a whitelist e
// o ciclo do cabeçalho são consumidos pela tabela (`ativos-table.tsx`, Client
// Component) e o parser é consumido pelo Server Component da página. Importar
// `lib/queries/ativos.ts` no cliente arrastaria `@/lib/supabase/server` (e
// `next/headers`) para o bundle do navegador — erro de build.
//
// O ESTADO VIVE NA URL: ordenação e tamanho de página são compartilháveis por
// link e sobrevivem a voltar/avançar do navegador.

// Colunas ordenáveis — todas colunas da PRÓPRIA tabela `ativos` (a ordenação é
// no servidor, via PostgREST).
//
// Fora da lista, de propósito:
//   · `marca` — a tabela funde "Marca / Modelo" num cabeçalho único de
//     `id: 'modelo'`; clicar ali ordena por `modelo`. Ordenar por marca pediria
//     duas setas no mesmo cabeçalho (ou quebrar a coluna em duas).
//   · `filial_nome` — vem de EMBED (`filiais(nome)`); ordenar por coluna de
//     tabela relacionada no PostgREST é frágil (depende de o embed ser !inner e
//     quebra em silêncio quando a relação muda).
//   · `service_tag` — ATV-06: deixou de ser coluna (a coluna condicional que
//     aparecia e sumia a cada troca de página virou sublinha FIXA da célula de
//     patrimônio, em `ativos-table.tsx`). Continua fora da whitelist, mas
//     agora porque não sobrou cabeçalho nenhum para prender um estado de
//     ordenação — não porque a coluna é condicional.
//   · `updated_at` — é o default; sem `ord` a lista já vem por ele desc.
export const COLUNAS_ORDENAVEIS = [
  'patrimonio',
  'categoria',
  'modelo',
  'status',
  'colaborador_atual',
] as const

export type ColunaOrdenavel = (typeof COLUNAS_ORDENAVEIS)[number]
export type DirecaoOrdenacao = 'asc' | 'desc'
export type Ordenacao = { coluna: ColunaOrdenavel; direcao: DirecaoOrdenacao }

export function ehColunaOrdenavel(valor: unknown): valor is ColunaOrdenavel {
  return (
    typeof valor === 'string' &&
    (COLUNAS_ORDENAVEIS as readonly string[]).includes(valor)
  )
}

// `?ord=<coluna>.<asc|desc>` → `{ coluna, direcao }`.
//
// QUALQUER coisa fora do contrato devolve `null` = "ignora e usa o default"
// (`updated_at desc`). Nunca lança: a URL é entrada de usuário e um param
// torto não pode derrubar o Server Component. Case-sensitive de propósito —
// a URL que a própria UI monta é sempre minúscula.
export function parseOrdenacao(param: unknown): Ordenacao | null {
  if (typeof param !== 'string') return null
  const partes = param.trim().split('.')
  if (partes.length !== 2) return null
  const [coluna, direcao] = partes
  if (!ehColunaOrdenavel(coluna)) return null
  if (direcao !== 'asc' && direcao !== 'desc') return null
  return { coluna, direcao }
}

export function serializarOrdenacao(ordenacao: Ordenacao): string {
  return `${ordenacao.coluna}.${ordenacao.direcao}`
}

// Ciclo do cabeçalho clicável: asc → desc → limpa (volta ao default da tela).
export function proximaDirecao(
  atual: DirecaoOrdenacao | null,
): DirecaoOrdenacao | null {
  if (atual === null) return 'asc'
  if (atual === 'asc') return 'desc'
  return null
}

// Tamanho de página. O padrão é o mesmo de sempre (50) — quem não mexe no
// `?pp=` continua vendo exatamente a lista de antes.
export const TAMANHOS_PAGINA = [25, 50, 100] as const
export type TamanhoPagina = (typeof TAMANHOS_PAGINA)[number]
export const TAMANHO_PAGINA_PADRAO: TamanhoPagina = 50

export function ehTamanhoPagina(valor: unknown): valor is TamanhoPagina {
  return (
    typeof valor === 'number' &&
    (TAMANHOS_PAGINA as readonly number[]).includes(valor)
  )
}

// `?pp=25|50|100` → número. Fora da lista (ou lixo) devolve `null` = default.
// Sem isso, `?pp=100000` viraria um `range()` gigante no PostgREST.
export function parseTamanhoPagina(param: unknown): TamanhoPagina | null {
  if (typeof param !== 'string') return null
  const texto = param.trim()
  if (!/^\d+$/.test(texto)) return null
  const n = Number(texto)
  return ehTamanhoPagina(n) ? n : null
}

// Subtítulo do cabeçalho da lista (F27/B5 — ATV-05). `resultado.total`
// (`queries/ativos.ts`) já vem com busca + filtros + recorte de filial
// aplicados — é o `count` da consulta FILTRADA —, então "N ativos cadastrados"
// MENTE assim que há filtro: o acervo inteiro pode ter muito mais que isso.
// Três estados, nesta ordem de prioridade (a MESMA de `vazioFiltrado`, em
// `ativos/page.tsx` — os dois lêem os mesmos dois booleanos que a página já
// calcula, F25):
//   1. há filtro na URL (busca, categoria, status, sem-patrimônio OU filial
//      escolhida explicitamente) → "encontrados": o total É de uma busca, não
//      do acervo;
//   2. sem filtro nenhum, mas a leitura ainda veio recortada pelo PADRÃO do
//      cargo (operador só lê as filiais vinculadas — F25) → "nas suas
//      filiais", pra não deixar a pessoa achar que é o acervo inteiro da WAP;
//   3. repouso puro (admin/dev/consulta sem filtro, ou operador vinculado a
//      TODAS as filiais) → "cadastrados": aí sim é uma verdade global.
// Quando os dois primeiros booleanos são verdadeiros ao mesmo tempo (operador
// escolheu explicitamente UMA das filiais dele), o filtro explícito vence —
// é a MESMA prioridade de `vazioFiltrado`.
export function rotuloSubtitulo({
  total,
  temFiltro,
  temRecorteFilial,
}: {
  total: number
  temFiltro: boolean
  temRecorteFilial: boolean
}): string {
  const n = total.toLocaleString('pt-BR')
  if (temFiltro) return `${n} ${total === 1 ? 'encontrado' : 'encontrados'}`
  if (temRecorteFilial) return `${n} nas suas filiais`
  return `${n} ${total === 1 ? 'cadastrado' : 'cadastrados'}`
}
