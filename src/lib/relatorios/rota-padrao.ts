import 'server-only'

// F25 — para onde "Relatórios" leva quando ninguém escolheu a filial.
//
// A regra PURA é `abaRelatorioPadrao` (auth/papeis.ts, testada): operador → a
// primeira filial vinculada em ordem alfabética de nome; qualquer outro cargo →
// o Consolidado. Aqui só se junta o insumo que ela precisa (a lista de filiais) e
// se monta a rota — para nenhuma tela reimplementar a decisão.
//
// ⚠ NÃO vale para o VISUALIZADOR por senha: ele não tem cargo (o conceito só
// existe para quem entra por login), e o destino dele continua o Consolidado —
// `actions/senhas.ts` e `viewer-nav.tsx` seguem apontando para `/relatorios/geral`
// e esta fase não os toca.

import { abaRelatorioPadrao, ABA_RELATORIO_CONSOLIDADO } from '@/lib/auth/papeis'
import type { Operador } from '@/lib/auth/acesso'
import { listarFiliais } from '@/lib/queries/filiais'

export const ROTA_RELATORIO_CONSOLIDADO = `/relatorios/${ABA_RELATORIO_CONSOLIDADO}`

export async function rotaRelatorioPadrao(operador: Operador | null): Promise<string> {
  if (!operador) return ROTA_RELATORIO_CONSOLIDADO
  try {
    // `listarFiliais()` é memoizada por request e já vem ordenada por nome — que é
    // exatamente a ordem que a regra pede. Ordenar aqui exigiria copiar o array;
    // ordenar `filiaisEscrita` seria pior (ele é COMPARTILHADO por referência
    // entre o layout e a página do mesmo render).
    const filiais = await listarFiliais()
    return `/relatorios/${abaRelatorioPadrao(operador.papel, operador.filiaisEscrita, filiais)}`
  } catch {
    // Uma falha de leitura das filiais não pode tirar o operador do relatório: o
    // Consolidado é um destino válido para todo cargo (a leitura é ampla).
    return ROTA_RELATORIO_CONSOLIDADO
  }
}
