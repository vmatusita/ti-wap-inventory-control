import { formatDate } from '@/lib/format'
import type { CategoriaAtivo } from '@/lib/dominio'
import type {
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
// F34/A — revogação PARCIAL da REL-08 (decisão do Johnny, 11/08/2026; ata em
// docs/DECISOES.md): o bloco "Em estoque (N): 16× Modelo A, …" sai do texto
// copiado — quem colava o resumo levava uma SEGUNDA fonte da mesma lista que já
// está no card "Disponíveis por modelo" ao lado, e as duas listas podiam envelhecer
// diferente entre o clique em "Copiar texto" e a rolagem até o card. O CARD visual
// e o dado congelado `disponiveisPorModelo` do snapshot CONTINUAM existindo (spec
// §7) — morreu só a re-exposição como texto copiável. A linha de KPIs não muda.
//
// O extra é OPCIONAL de propósito: sem ele a saída é byte a byte a de antes (é o
// que os testes da F3B travam), então nenhum consumidor antigo muda.
export type ExtrasResumo = {
  kpis?: KpisRelatorio
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

// F34/A — o bloco "Em estoque (N): …" (antiga `blocoDisponiveis`) e o achatador
// `achatarDisponiveis` (que preparava a lista para ele) foram REMOVIDOS daqui, não
// deixados mortos: o requisito mudou (revogação parcial da REL-08, comentário acima
// de `ExtrasResumo`), e a ordem prefere remover o plumbing a manter função exportada
// sem consumidor. O CARD visual "Disponíveis por modelo" lê `disponiveisPorModelo`/
// os grupos por categoria direto do snapshot (`lib/queries/relatorios/*`,
// `components/relatorios/lista-modelo*.tsx`) — não passa mais por este arquivo.
export function gerarTextoResumo(resumo: ResumoPeriodo, extras?: ExtrasResumo): string {
  const periodo = `No período de ${formatDate(resumo.de)} a ${formatDate(resumo.ate)}:`
  const kpis = extras?.kpis ? [linhaKpis(extras.kpis), ''] : []
  const partes = [
    periodo,
    '',
    ...kpis,
    ...blocoTipo({ singular: 'saída', plural: 'saídas' }, resumo.saidas),
    '',
    ...blocoTipo({ singular: 'devolução', plural: 'devoluções' }, resumo.devolucoes),
  ]
  return partes.join('\n')
}
