// Gating de UI por CARGO (F21) — as duas perguntas que as TELAS fazem e que
// `@/lib/auth/papeis` não responde sozinho, porque dependem do vínculo de
// filiais de quem está logado:
//
//   1. "mostro o CTA desta ficha?"  → `podeEscreverNaFilial`
//   2. "que filiais o select de ESCRITA oferece?" → `filiaisParaEscrita`
//
// Módulo PURO de propósito (sem `server-only`, sem Supabase, sem JSX): é
// importado por Server Components (as páginas, que resolvem o operador) e por
// componentes `'use client'` que recebem a lista já recortada. A hierarquia, os
// rótulos e o predicado do vínculo continuam morando em `@/lib/auth/papeis` —
// aqui só se combinam com a lista de filiais da tela.
//
// ⚠ Isto é a SEGUNDA linha: a trava real são as policies (migrations 0063/0066)
// e as guardas das Server Actions (`exigirEscrita`/`exigirAdmin`). Esconder um
// botão é ergonomia, não segurança.

import { eAdmin, filiaisDeEscrita, podeEscrever } from '@/lib/auth/papeis'
import type { PapelUsuario } from '@/lib/auth/papeis'

// Recorte estrutural de `Operador` (`@/lib/auth/acesso`): basta o cargo e as
// filiais de escrita, então um `Operador` inteiro serve como argumento e nenhuma
// tela precisa importar o módulo só-servidor para tipar uma prop.
export type Permissoes = {
  papel: PapelUsuario
  filiaisEscrita: readonly number[]
}

// Pode escrever NESTA filial? Espelha `pode_escrever_filial(fid)` do banco
// (migration 0062): admin sempre, operador só na vinculada, consulta nunca.
//
// O ramo do admin vem ANTES da lista: `filiaisEscrita` de um admin é a lista das
// filiais ATIVAS, e um ativo pode estar numa filial desativada (import antigo,
// filial encerrada). Perguntar pela lista ali deixaria o admin sem nenhum botão
// justamente na ficha excepcional — enquanto o banco lhe dá permissão.
// Filial desconhecida (`null`) fecha para TODOS os cargos, admin incluído: é a
// mesma resposta que `exigirEscrita(supabase, null)` dá na action ("Filial não
// informada para esta operação") e liberar um CTA sem saber sobre o que ele age
// não ajuda ninguém.
export function podeEscreverNaFilial(
  p: Permissoes | null | undefined,
  filialId: number | null | undefined,
): boolean {
  if (!p || filialId == null || !podeEscrever(p.papel)) return false
  if (eAdmin(p.papel)) return true
  return p.filiaisEscrita.includes(filialId)
}

// As filiais que um select de ESCRITA pode oferecer, preservando a ORDEM e a
// forma da lista de leitura (`listarFiliais`) — os filtros de leitura continuam
// com a lista inteira; só o campo que grava é recortado.
//
// Delega o predicado a `filiaisDeEscrita` (papeis.ts) para não existir uma
// segunda definição de "quais filiais este cargo escreve".
export function filiaisParaEscrita<T extends { id: number }>(
  p: Permissoes | null | undefined,
  filiais: readonly T[],
): T[] {
  if (!p) return []
  const permitidas = new Set(
    filiaisDeEscrita(
      p.papel,
      p.filiaisEscrita,
      filiais.map((f) => f.id),
    ),
  )
  return filiais.filter((f) => permitidas.has(f.id))
}
