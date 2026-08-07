import { formatDate } from '@/lib/format'
import type { CategoriaAtivo } from '@/lib/dominio'
import type {
  ItemModelo,
  KpisRelatorio,
  ResumoPeriodo,
  ResumoTipo,
} from '@/lib/relatorios/tipos'

// Gera o texto do resumo no formato do e-mail semanal (spec §7 / OS-F3 3.3.6):
// a filial vira cabeçalho e cada motivo ganha a própria linha indentada (B3/F6B —
// decisão do Johnny, 16/07/2026):
//   • Matriz (8) —
//     novo colaborador: 04 notebooks, 04 monitores
//     troca: 02 desktops
// Função PURA — usada na página ao vivo, no snapshot (ao vivo e congelados v1/v2,
// que regeram o texto no render) e no botão "Copiar texto". As quebras `\n` viram
// quebra visual no `<pre whitespace-pre-wrap>` do card e são copiadas junto.

const CATEGORIA_PLURAL: Record<CategoriaAtivo, { um: string; varios: string }> = {
  notebook: { um: 'notebook', varios: 'notebooks' },
  desktop: { um: 'desktop', varios: 'desktops' },
  monitor: { um: 'monitor', varios: 'monitores' },
  celular: { um: 'celular', varios: 'celulares' },
  tablet: { um: 'tablet', varios: 'tablets' },
  outro: { um: 'item', varios: 'itens' },
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function categoriaTexto(categoria: CategoriaAtivo, total: number): string {
  const r = CATEGORIA_PLURAL[categoria]
  return `${pad2(total)} ${total === 1 ? r.um : r.varios}`
}

function blocoTipo(
  acao: { singular: string; plural: string },
  tipo: ResumoTipo,
): string[] {
  if (tipo.total === 0) {
    return [`Nenhuma ${acao.singular} registrada no período.`]
  }
  const linhas: string[] = [
    `${tipo.total === 1 ? 'Foi realizada' : 'Foram realizadas'} ${tipo.total} ${
      tipo.total === 1 ? acao.singular : acao.plural
    }:`,
  ]
  for (const f of tipo.filiais) {
    // Cabeçalho da filial; cada motivo em linha própria indentada. O `;` que antes
    // separava motivos some — a quebra de linha o substitui (B3/F6B).
    linhas.push(`• ${f.filial} (${f.total}) —`)
    for (const m of f.motivos) {
      const cats = m.categorias
        .map((c) => categoriaTexto(c.categoria, c.total))
        .join(', ')
      linhas.push(`  ${m.motivo.toLowerCase()}: ${cats}`)
    }
  }
  return linhas
}

// F29/REL-08 — o que o texto copiado deixava de fora.
//
// `gerarTextoResumo` montava só saídas + devoluções. O e-mail semanal real ABRIA
// com a lista de disponíveis por modelo e trazia os números de estado — quem colava
// o resumo no Teams ainda transcrevia o estoque à mão, do gráfico ao lado.
//
// Os extras são OPCIONAIS de propósito: sem eles a saída é byte a byte a de antes
// (é o que os testes da F3B travam), então nenhum consumidor antigo muda.
export type ExtrasResumo = {
  kpis?: KpisRelatorio
  /** Achatado: no v2 `disponiveisPorModelo` vem agrupado por categoria. */
  disponiveis?: readonly ItemModelo[]
}

// Ordem e rótulos dos KPIs na linha de estado — os MESMOS de `kpi-tiles.tsx`, na
// mesma sequência, para quem lê a tela e o texto lado a lado não precisar traduzir.
const KPIS_TEXTO: { chave: keyof KpisRelatorio; rotulo: string }[] = [
  { chave: 'total', rotulo: 'Total' },
  { chave: 'em_uso', rotulo: 'Em uso' },
  { chave: 'em_estoque', rotulo: 'Em estoque' },
  { chave: 'reservado', rotulo: 'Reservados' },
  { chave: 'em_triagem', rotulo: 'Em triagem' },
  { chave: 'em_manutencao', rotulo: 'Em manutenção' },
  { chave: 'defasado', rotulo: 'Reserva técnica' },
]

function linhaKpis(kpis: KpisRelatorio): string {
  return KPIS_TEXTO.map((k) => `${k.rotulo} ${kpis[k.chave] ?? 0}`).join(' · ')
}

// "Em estoque (24): 16× Dell Latitude 3440, 04× Positivo Master…" — o formato do
// e-mail, do mais numeroso para o menos. Modelo sem nome vira "—" (não some da
// conta): o total entre parênteses tem de fechar com a soma da lista.
function blocoDisponiveis(disponiveis: readonly ItemModelo[]): string[] {
  const comSaldo = disponiveis.filter((m) => m.total > 0)
  if (comSaldo.length === 0) return []
  const total = comSaldo.reduce((s, m) => s + m.total, 0)
  const lista = [...comSaldo]
    .sort((a, b) => b.total - a.total || a.modelo.localeCompare(b.modelo, 'pt-BR'))
    .map((m) => `${pad2(m.total)}× ${m.modelo.trim() || '—'}`)
    .join(', ')
  return [`Em estoque (${total}): ${lista}`]
}

export function gerarTextoResumo(resumo: ResumoPeriodo, extras?: ExtrasResumo): string {
  const periodo = `No período de ${formatDate(resumo.de)} a ${formatDate(resumo.ate)}:`
  const kpis = extras?.kpis ? [linhaKpis(extras.kpis), ''] : []
  const disponiveis = extras?.disponiveis ? blocoDisponiveis(extras.disponiveis) : []
  const partes = [
    periodo,
    '',
    ...kpis,
    ...blocoTipo({ singular: 'saída', plural: 'saídas' }, resumo.saidas),
    '',
    ...blocoTipo({ singular: 'devolução', plural: 'devoluções' }, resumo.devolucoes),
    ...(disponiveis.length > 0 ? ['', ...disponiveis] : []),
  ]
  return partes.join('\n')
}

// O v2 guarda os disponíveis agrupados por categoria; o texto é uma lista só. Um
// modelo pertence a UMA categoria, então achatar não soma duas linhas do mesmo nome.
export function achatarDisponiveis(
  grupos: readonly { modelos: readonly ItemModelo[] }[],
): ItemModelo[] {
  return grupos.flatMap((g) => g.modelos.map((m) => ({ ...m })))
}
