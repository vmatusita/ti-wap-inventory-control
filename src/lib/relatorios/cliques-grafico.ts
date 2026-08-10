import {
  rotuloCategoria,
  rotuloStatus,
  type CategoriaAtivo,
  type StatusAtivo,
} from '@/lib/dominio'

// F32/RV-12 — o clique que liga o gráfico à tabela vizinha (análise §2). Puro e
// testado: quem decide a URL/o rótulo não é o componente Recharts (que só
// desenha o `<Rectangle>` que recebe), é este módulo. Precedente direto:
// `kpi-links.ts` já faz o mesmo gesto para os KPI tiles desde a F16 (função
// pura devolve string; quem gateia por cargo/rota é o componente/página) — só
// o ALVO muda aqui (a tabela vizinha via `#âncora`, ou `/ativos` com filtro).

/**
 * `<prefixo>.motivo=<motivo>` trocando o valor anterior na querystring ATUAL,
 * preservando todo o resto (período, filtros de outras tabelas, busca livre —
 * nenhum é tocado porque só o param `<prefixo>.motivo` é lido/escrito).
 * Motivo vazio REMOVE o param — é a semântica de `escreverFiltrosNaQuery`
 * (use-filtros-tabela.ts): motivo="" viraria `?sd.motivo=` pendurado, e o
 * `<Select>` que lê esse param leria "todos" enquanto a URL diria outra coisa.
 *
 * Reimplementado aqui (não importado de `use-filtros-tabela.ts`) de propósito:
 * aquele módulo é um componente `'use client'`, e este é `lib/` — puro,
 * consumido tanto pelos componentes de gráfico quanto pelo teste em Node.
 * `URLSearchParams` aceita `buscaAtual` com ou sem `?` inicial (o construtor
 * descarta o `?` sozinho), então o chamador não precisa normalizar antes.
 */
export function urlFiltroMotivo(prefixo: string, motivo: string, buscaAtual: string): string {
  const params = new URLSearchParams(buscaAtual)
  const nome = `${prefixo}.motivo`
  if (motivo) params.set(nome, motivo)
  else params.delete(nome)
  return params.toString()
}

/**
 * `/ativos?status=<status>&categoria=<categoria><recorteFilial>` — MESMA
 * ordem/formato de `linksKpiAtivos` (kpi-links.ts): `status` primeiro,
 * `recorteFilial` (o fragmento `&filial=…`/`&filial=todas` de
 * `recorteFilialAtivos`) sempre por último. Sem `encodeURIComponent`: os três
 * valores são identificadores de enum (sem espaço/acento) — a mesma razão
 * pela qual `linksKpiAtivos` já concatena cru.
 */
export function urlAtivosPorSegmento(
  status: StatusAtivo,
  categoria: CategoriaAtivo,
  recorteFilial: string,
): string {
  return `/ativos?status=${status}&categoria=${categoria}${recorteFilial}`
}

// Concorda o status no plural SEM duplicar o texto de STATUS_META — deriva de
// `rotuloStatus`, nunca reescreve "Reservado"/"Devolvido ao fornecedor" à mão.
//
// Os rótulos do domínio caem em duas famílias gramaticais:
//   · "Em estoque"/"Em uso"/"Em triagem"/"Em manutenção" são locuções
//     ADVERBIAIS (preposição "em" + substantivo) — invariáveis em número:
//     "os notebooks em estoque", nunca "em estoques". A 1ª palavra "em" é o
//     sinal: quando ela aparece, a frase não concorda.
//   · As demais ("Reservado", "Emprestado", "Defasado", "Descartado",
//     "Devolvido ao fornecedor") são PARTICÍPIOS usados como adjetivo e
//     concordam com o sujeito no plural — só a 1ª palavra muda
//     ("devolvido"→"devolvidos"; "ao fornecedor" não é o particípio).
function statusConcordado(status: StatusAtivo, plural: boolean): string {
  const rotulo = rotuloStatus(status).toLowerCase()
  if (!plural) return rotulo
  const [primeira, ...resto] = rotulo.split(' ')
  if (primeira === 'em') return rotulo
  return [`${primeira}s`, ...resto].join(' ')
}

// Plural da categoria a partir de `rotuloCategoria` — nunca um dicionário
// duplicado (CLAUDE.md/RV-12: "nunca literal duplicado"). As 6 categorias do
// enum só caem em dois padrões do pt-BR: terminada em r/z ganha "-es"
// (monitor→monitores, celular→celulares — as duas irregulares do conjunto);
// as demais ganham só "-s" (notebook→notebooks, desktop→desktops,
// tablet→tablets, outro→outros). As 6 combinações são provadas no teste.
function pluralCategoria(rotuloMinusculo: string): string {
  return /[rz]$/.test(rotuloMinusculo) ? `${rotuloMinusculo}es` : `${rotuloMinusculo}s`
}

/**
 * aria-label do segmento clicável (barras-empilhadas — "Estoque no último
 * dia"): "Ver os 12 notebooks em estoque" / "Ver o 1 notebook em estoque" /
 * "Ver os 3 monitores devolvidos ao fornecedor".
 */
export function rotuloCliqueSegmento(
  status: StatusAtivo,
  categoria: CategoriaAtivo,
  total: number,
): string {
  const singular = total === 1
  const categoriaBase = rotuloCategoria(categoria).toLowerCase()
  const categoriaPalavra = singular ? categoriaBase : pluralCategoria(categoriaBase)
  const artigo = singular ? 'o' : 'os'
  return `Ver ${artigo} ${total} ${categoriaPalavra} ${statusConcordado(status, !singular)}`
}

/**
 * aria-label da barra clicável (barras-horizontais — "Saídas"/"Devoluções por
 * motivo"): "Ver as 55 saídas por Troca / upgrade" / "Ver a 1 entrada por
 * Compra". `motivo` entra cru (é texto livre da linha, não um enum do
 * domínio — nada aqui para derivar de `dominio.ts`).
 */
export function rotuloCliqueMotivo(
  motivo: string,
  total: number,
  destino: 'saidas' | 'entradas',
): string {
  const singular = total === 1
  const palavra =
    destino === 'saidas' ? (singular ? 'saída' : 'saídas') : singular ? 'entrada' : 'entradas'
  const artigo = singular ? 'a' : 'as'
  return `Ver ${artigo} ${total} ${palavra} por ${motivo}`
}
