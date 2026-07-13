import { formatDate } from '@/lib/format'
import type { CategoriaAtivo } from '@/lib/dominio'
import type { ResumoPeriodo, ResumoTipo } from '@/lib/relatorios/tipos'

// Gera o texto do resumo no formato do e-mail semanal (spec §7 / OS-F3 3.3.6):
// "No período de X a Y foram realizadas N saídas: Matriz — novo colaborador:
// 04 notebooks, 04 monitores; …". Função PURA — usada na página ao vivo e no
// snapshot, e é o texto do botão "Copiar texto".

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
    const motivos = f.motivos
      .map((m) => {
        const cats = m.categorias
          .map((c) => categoriaTexto(c.categoria, c.total))
          .join(', ')
        return `${m.motivo.toLowerCase()}: ${cats}`
      })
      .join('; ')
    linhas.push(`• ${f.filial} (${f.total}) — ${motivos}`)
  }
  return linhas
}

export function gerarTextoResumo(resumo: ResumoPeriodo): string {
  const periodo = `No período de ${formatDate(resumo.de)} a ${formatDate(resumo.ate)}:`
  const partes = [
    periodo,
    '',
    ...blocoTipo({ singular: 'saída', plural: 'saídas' }, resumo.saidas),
    '',
    ...blocoTipo({ singular: 'devolução', plural: 'devoluções' }, resumo.devolucoes),
  ]
  return partes.join('\n')
}
