// Regras do termo de DEVOLUÇÃO (F5A / PLANO-TERMOS §4.2): ordenação do lote,
// concatenação das colunas e mapa motivo→Descrição.
import type { CategoriaAtivo } from '@/lib/dominio'
import { rotuloAcessorio } from '@/lib/dominio'

// Ordem dos equipamentos no termo: notebook → monitor → celular → demais
// (desktop, tablet, outro). Empate pelo patrimônio (§4.2).
const ORDEM_CATEGORIA: Record<CategoriaAtivo, number> = {
  notebook: 0,
  monitor: 1,
  celular: 2,
  desktop: 3,
  tablet: 4,
  outro: 5,
}

export type EquipamentoDevolucao = {
  categoria: CategoriaAtivo
  // null = ativo sem patrimônio físico (F7E) — ordena por ÚLTIMO e imprime
  // "sem patrimônio" no termo.
  patrimonio: string | null
  service_tag: string | null
  marca: string | null
  modelo: string | null
}

// Texto impresso no lugar do número quando o ativo não tem plaqueta (F7E).
export const PATRIMONIO_AUSENTE_TERMO = 'sem patrimônio'

export function ordenarEquipamentos<T extends EquipamentoDevolucao>(itens: T[]): T[] {
  return [...itens].sort((a, b) => {
    const oa = ORDEM_CATEGORIA[a.categoria] ?? 99
    const ob = ORDEM_CATEGORIA[b.categoria] ?? 99
    if (oa !== ob) return oa - ob
    // Empate de categoria: patrimônio nulo (sem plaqueta) vai por último.
    if (a.patrimonio === null && b.patrimonio === null) return 0
    if (a.patrimonio === null) return 1
    if (b.patrimonio === null) return -1
    return a.patrimonio.localeCompare(b.patrimonio)
  })
}

// Concatenações posicionais (a posição i é o mesmo equipamento nas três colunas):
//  - Número de Série  → service tags, ", " (vazio quando o ativo não tem ST)
//  - Número do Patrimônio → patrimônios, ", "
//  - Marca e Modelo   → "Marca Modelo", unidos por " / "
export function concatenarEquipamentos(itensOrdenados: EquipamentoDevolucao[]) {
  return {
    series: itensOrdenados.map((i) => i.service_tag ?? '').join(', '),
    // Patrimônio nulo (F7E) imprime "sem patrimônio" no lugar do número.
    patrimonios: itensOrdenados
      .map((i) => i.patrimonio ?? PATRIMONIO_AUSENTE_TERMO)
      .join(', '),
    marcas_modelos: itensOrdenados
      .map((i) => [i.marca, i.modelo].filter(Boolean).join(' '))
      .join(' / '),
  }
}

// Mapa motivo→Descrição (caixa alta). Cobre TODOS os motivos que se aplicam a
// devolução nos seeds (0007), incluindo os dois que o plano havia esquecido
// (reposicao, assistencia — resolvido em DECISOES). Motivo sem entrada cai no
// rótulo em caixa alta; 'outro' fica em branco para o operador digitar.
const DESCRICAO_POR_MOTIVO: Record<string, string> = {
  desligamento: 'DESLIGAMENTO',
  troca_upgrade: 'TROCA/UPGRADE',
  reposicao: 'REPOSIÇÃO',
  assistencia: 'ASSISTÊNCIA TÉCNICA',
  afastamento: 'AFASTAMENTO',
  fim_emprestimo: 'FIM DE EMPRÉSTIMO',
  manutencao: 'MANUTENÇÃO',
  garantia: 'GARANTIA',
}

export function descricaoDevolucao(
  motivoCodigo: string | null,
  motivoRotulo?: string | null,
): string {
  if (motivoCodigo && DESCRICAO_POR_MOTIVO[motivoCodigo]) {
    return DESCRICAO_POR_MOTIVO[motivoCodigo]
  }
  if (motivoCodigo === 'outro') return ''
  return (motivoRotulo ?? '').toUpperCase()
}

// Sugestão editável para "Observação" a partir dos itens faltantes conferidos na
// devolução (os exemplos reais traziam "Mochila não devolvida"). União dos
// acessórios marcados no lote; vazio se nada faltou.
export function observacaoSugestao(itensFaltantes: string[]): string {
  const unicos = [...new Set(itensFaltantes.filter(Boolean))]
  if (unicos.length === 0) return ''
  const nomes = unicos.map((c) => rotuloAcessorio(c))
  return `Não devolvido(s): ${nomes.join(', ')}`
}
