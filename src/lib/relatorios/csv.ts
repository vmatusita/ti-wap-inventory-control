import Papa from 'papaparse'
import { formatDate } from '@/lib/format'
import { rotuloTipo } from '@/lib/dominio'
import type { MovimentacaoRelatorio } from '@/lib/relatorios/tipos'

// Export CSV das últimas movimentações (OS-F3 3.5.1): delimitador ';' e UTF-8
// com BOM (abre certo no Excel BR, com acentos). A coluna Observação vai junto.
// Client-side (usa document/Blob) — gerado no navegador com PapaParse.
const BOM = '﻿'

// Neutraliza injeção de fórmula (CSV injection): células que começam com
// = + - @ ou tab/CR são interpretadas como fórmula pelo Excel/Sheets; um
// apóstrofo à frente força o valor a texto. Aplica-se a texto livre (observação,
// colaborador) que o usuário controla.
function seguro(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}

export function baixarMovimentacoesCSV(
  rows: MovimentacaoRelatorio[],
  nomeArquivo: string,
) {
  const dados = rows.map((r) => ({
    Data: formatDate(r.data),
    Tipo: rotuloTipo(r.tipo),
    Patrimônio: seguro(r.patrimonio),
    Ativo: seguro(r.ativo),
    'Colaborador/Setor': seguro(r.colaborador_setor ?? ''),
    Filial: seguro(r.filial),
    Chamado: seguro(r.chamado ?? ''),
    Observação: seguro(r.observacao ?? ''),
  }))
  const csv = Papa.unparse(dados, { delimiter: ';' })
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
