import { PAPEL_ROTULO, ePapelValido } from '@/lib/auth/papeis'
import type { Json } from '@/lib/types/database'

// Tradução do `detalhe` (jsonb) de um evento de auditoria para uma frase em pt-BR (F21).
//
// Arquivo SEPARADO da tabela de propósito: é função pura, com teste próprio, e assim o teste
// não precisa carregar React nem os componentes de UI.
//
// `eventos_admin.detalhe` é jsonb LIVRE — a trilha aceita evento gravado por uma versão
// futura do app, e `acao` é TEXT (migration 0065). Por isso tudo aqui é defensivo: forma
// reconhecida vira frase; o resto vira o JSON cru truncado. Deixar a célula vazia por não
// entender o detalhe seria pior — a trilha existe justamente para ser lida meses depois.

function comoObjeto(d: Json | null): Record<string, Json> | null {
  return d !== null && typeof d === 'object' && !Array.isArray(d)
    ? (d as Record<string, Json>)
    : null
}

function rotuloDePapel(v: Json | undefined): string | null {
  return ePapelValido(v) ? PAPEL_ROTULO[v] : null
}

function nomesDeFiliais(
  v: Json | undefined,
  nomeFilial: (id: number) => string,
): string | null {
  if (!Array.isArray(v)) return null
  const nomes = v.filter((x): x is number => typeof x === 'number').map(nomeFilial)
  return nomes.length > 0 ? nomes.join(', ') : 'nenhuma'
}

/** Limite da célula: `detalhe` desconhecido não pode esticar a tabela indefinidamente. */
const MAX_CRU = 140

export function descreverDetalhe(
  acao: string,
  detalhe: Json | null,
  nomeFilial: (id: number) => string,
): string | null {
  if (detalhe === null) return null
  const o = comoObjeto(detalhe)
  if (!o) return JSON.stringify(detalhe).slice(0, MAX_CRU)

  const partes: string[] = []

  if (acao === 'papel_alterado') {
    const de = rotuloDePapel(o.de)
    const para = rotuloDePapel(o.para)
    if (de && para) partes.push(`${de} → ${para}`)
  } else if (acao === 'vinculos_alterados') {
    const agora = nomesDeFiliais(o.filiais, nomeFilial)
    const antes = nomesDeFiliais(o.de, nomeFilial)
    if (agora) partes.push(`Filiais: ${agora}`)
    if (antes) partes.push(`antes: ${antes}`)
  } else {
    const papel = rotuloDePapel(o.papel)
    if (papel) partes.push(`Cargo: ${papel}`)
    const filiais = nomesDeFiliais(o.filiais, nomeFilial)
    if (filiais) partes.push(`Filiais: ${filiais}`)
  }

  // Sinalização de gravação PARCIAL: é a informação mais útil da trilha quando algo saiu
  // pela metade (convite criado sem cargo, desativação sem o ban do Auth).
  if (o.cargo_gravado === false) partes.push('cargo NÃO gravado')
  if (o.vinculos_gravados === false) partes.push('filiais NÃO gravadas')
  if (o.login_no_auth === 'falhou') partes.push('bloqueio de login no Auth falhou')

  return partes.length > 0 ? partes.join(' · ') : JSON.stringify(detalhe).slice(0, MAX_CRU)
}
