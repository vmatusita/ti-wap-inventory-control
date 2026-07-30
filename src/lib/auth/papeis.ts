// Vocabulário dos CARGOS (F21) — fonte ÚNICA de rótulos, hierarquia e regras puras.
//
// Módulo ISOMÓRFICO de propósito (sem `server-only`, sem `node:crypto`, sem Supabase):
// é importado por Server Actions, por Server Components, por componentes `'use client'`
// (badges, selects, diálogos) e pelas páginas de ajuda. Mesmo desenho de
// `dominios-email.ts` — a constante mora aqui e todo mundo deriva, ninguém redigita.
//
// ⚠ A TRAVA DE VERDADE ESTÁ NO BANCO, não aqui: enum `papel_usuario` + as funções
// `papel_atual()` / `e_admin()` / `pode_escrever_filial()` (migrations 0061/0062) e as
// policies da 0063/0066. Este arquivo é vocabulário e ergonomia — mexeu aqui, confira lá.
// Ver docs/ADR-002-papeis-e-permissoes.md.

import type { Database } from '@/lib/types/database'

// Vem do enum do banco: se um papel novo entrar na migration, o TypeScript acusa aqui.
export type PapelUsuario = Database['public']['Enums']['papel_usuario']

// Ordem do MAIS forte para o mais fraco — a mesma dos labels do enum no Postgres.
export const PAPEIS: readonly PapelUsuario[] = ['admin', 'operador', 'consulta'] as const

// Hierarquia como NÚMERO, e não pela ordem do enum, de propósito. No Postgres `admin` é o
// PRIMEIRO label e portanto o MENOR na comparação de enum (`papel <= 'operador'` = "operador
// ou mais forte"), o que inverte o sinal e é fonte clássica de bug. Aqui força maior = mais
// poder, que é o que se lê naturalmente.
const FORCA: Record<PapelUsuario, number> = {
  admin: 3,
  operador: 2,
  consulta: 1,
}

// Rótulos de UI. "Consulta" (e não "Visualizador") para não colidir com o VISUALIZADOR por
// senha dos relatórios, que é outra porta de acesso e continua existindo (spec §3).
export const PAPEL_ROTULO: Record<PapelUsuario, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  consulta: 'Consulta',
}

export const PAPEL_DESCRICAO: Record<PapelUsuario, string> = {
  admin: 'Faz tudo: administração (usuários, senhas, filiais, motivos, itens, kits), import de startup e escrita em todas as filiais.',
  operador: 'Registra movimentações, compras, itens, termos e pendências — apenas nas filiais vinculadas a ele.',
  consulta: 'Somente leitura: navega e consulta o sistema inteiro, mas não registra nada.',
}

// `admin ⊃ operador ⊃ consulta`: true quando `papel` é o mínimo exigido OU mais forte.
// `null` (sem sessão, sem perfil ou perfil desativado) nunca atende a nada.
export function papelAtende(papel: PapelUsuario | null | undefined, minimo: PapelUsuario): boolean {
  if (!papel) return false
  return FORCA[papel] >= FORCA[minimo]
}

export function ePapelValido(valor: unknown): valor is PapelUsuario {
  return typeof valor === 'string' && (PAPEIS as readonly string[]).includes(valor)
}

// Quem escreve ALGO no acervo (nas filiais que lhe couberem). Espelha o predicado
// `papel_atual() in ('admin','operador')` das policies de anotacoes/termos/relatórios.
export function podeEscrever(papel: PapelUsuario | null | undefined): boolean {
  return papelAtende(papel, 'operador')
}

export function eAdmin(papel: PapelUsuario | null | undefined): boolean {
  return papel === 'admin'
}

// Só o OPERADOR precisa de vínculo: admin escreve em todas as filiais sem linha em
// `operador_filiais`, e consulta não escreve em lugar nenhum. É esta função que decide se a
// UI exige "no mínimo 1 filial" no convite/edição (validação espelhada no Zod).
export function exigeVinculoDeFilial(papel: PapelUsuario): boolean {
  return papel === 'operador'
}

// Regra de negócio do formulário de usuário, isolada para ter teste próprio: devolve a
// mensagem de erro em pt-BR, ou null se está válido.
//
// Sem isto, o caso "operador com zero filiais" passaria batido na UI e o usuário seria
// criado incapaz de escrever em qualquer lugar — funciona (falha segura no banco), mas é
// um usuário quebrado, e a pessoa descobriria só ao tentar registrar algo.
export function validarVinculosDoPapel(
  papel: PapelUsuario,
  filiaisIds: readonly number[],
): string | null {
  if (exigeVinculoDeFilial(papel)) {
    if (filiaisIds.length === 0) {
      return 'Escolha ao menos uma filial de escrita para o cargo Operador.'
    }
    return null
  }
  // Admin e consulta não usam vínculo. Mandar filiais aqui é sinal de formulário
  // inconsistente (a UI esconde o campo) — recusa em vez de gravar lixo silenciosamente.
  if (filiaisIds.length > 0) {
    return `O cargo ${PAPEL_ROTULO[papel]} não usa filiais de escrita: ${
      papel === 'admin' ? 'ele escreve em todas' : 'ele não escreve em nenhuma'
    }.`
  }
  return null
}

// As filiais que o papel efetivamente pode escrever, dada a lista de vínculos e o universo
// de filiais ativas. Espelha `pode_escrever_filial()` do banco (migration 0062) e é o que
// alimenta os selects de filial das telas de ESCRITA.
export function filiaisDeEscrita(
  papel: PapelUsuario | null | undefined,
  vinculos: readonly number[],
  filiaisAtivas: readonly number[],
): number[] {
  if (!papel) return []
  if (papel === 'admin') return [...filiaisAtivas]
  if (papel === 'operador') return filiaisAtivas.filter((id) => vinculos.includes(id))
  return []
}
