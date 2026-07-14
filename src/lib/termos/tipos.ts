// Modelos de termo (F5A / PLANO-TERMOS). São 7: 5 de responsabilidade (um por
// categoria; monitor tem duas variantes) + 2 de devolução. A lista é fechada aqui
// (espelha o check da tabela termos_gerados na migration 0021 e os arquivos em
// src/templates/termos/).
import type { CategoriaAtivo } from '@/lib/dominio'

export const TERMO_TIPOS = [
  'responsabilidade_notebook',
  'responsabilidade_desktop',
  'responsabilidade_celular',
  'responsabilidade_monitor_interno',
  'responsabilidade_monitor_homeoffice',
  'devolucao_equipamento',
  'devolucao_desligamento',
] as const

export type TermoTipo = (typeof TERMO_TIPOS)[number]

export type FamiliaTermo = 'responsabilidade' | 'devolucao'

// Arquivo .docx correspondente (em src/templates/termos/, tagueado e sanitizado).
export const TERMO_ARQUIVO: Record<TermoTipo, string> = {
  responsabilidade_notebook: 'responsabilidade-notebook.docx',
  responsabilidade_desktop: 'responsabilidade-desktop.docx',
  responsabilidade_celular: 'responsabilidade-celular.docx',
  responsabilidade_monitor_interno: 'responsabilidade-monitor-interno.docx',
  responsabilidade_monitor_homeoffice: 'responsabilidade-monitor-homeoffice.docx',
  devolucao_equipamento: 'devolucao-equipamento.docx',
  devolucao_desligamento: 'devolucao-desligamento.docx',
}

// Rótulo curto para UI (histórico na ficha, seletor de variante).
export const TERMO_ROTULO: Record<TermoTipo, string> = {
  responsabilidade_notebook: 'Responsabilidade — Notebook',
  responsabilidade_desktop: 'Responsabilidade — Desktop',
  responsabilidade_celular: 'Responsabilidade — Celular',
  responsabilidade_monitor_interno: 'Responsabilidade — Monitor (uso interno)',
  responsabilidade_monitor_homeoffice: 'Responsabilidade — Monitor (home office)',
  devolucao_equipamento: 'Devolução de equipamento',
  devolucao_desligamento: 'Devolução — desligamento',
}

export function familiaDoTipo(tipo: TermoTipo): FamiliaTermo {
  return tipo.startsWith('devolucao') ? 'devolucao' : 'responsabilidade'
}

export function ehTermoTipo(v: string): v is TermoTipo {
  return (TERMO_TIPOS as readonly string[]).includes(v)
}

// Tipos de responsabilidade oferecidos por categoria de ativo. Monitor abre as
// duas variantes (escolha manual no dialog — §3.5). Tablet e "outro" NÃO têm
// modelo (§10.3): a categoria simplesmente não oferece geração.
export function tiposRespPara(categoria: CategoriaAtivo): TermoTipo[] {
  switch (categoria) {
    case 'notebook':
      return ['responsabilidade_notebook']
    case 'desktop':
      return ['responsabilidade_desktop']
    case 'celular':
      return ['responsabilidade_celular']
    case 'monitor':
      return ['responsabilidade_monitor_interno', 'responsabilidade_monitor_homeoffice']
    default:
      return []
  }
}

// A categoria oferece termo de responsabilidade?
export function categoriaTemTermo(categoria: CategoriaAtivo): boolean {
  return tiposRespPara(categoria).length > 0
}
