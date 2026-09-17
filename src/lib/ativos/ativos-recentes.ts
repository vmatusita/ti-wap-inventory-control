// F29/UXG-10b — memória dos últimos ativos ABERTOS, para a paleta de comandos
// (Ctrl+K) parar de nascer vazia. Zero servidor: `sessionStorage`, como
// `lista-visitada.ts` e `movimentacoes/nova/rascunho.ts`.
//
// Módulo PURO de propósito (sem React, sem `'use client'`): dá para testar a
// validação sem DOM, e as duas funções de I/O são chamadas SÓ dentro de
// `useEffect` / handler — ler `sessionStorage` no corpo de um componente quebraria
// a hidratação do Next.
//
// Por que `sessionStorage` e não `localStorage`: "recentes" é contexto da sessão de
// trabalho, e o navegador da TI é compartilhado. Fechou a aba, esvaziou — sem
// deixar patrimônio de ninguém num navegador emprestado.

import { chaveDeStorage } from '@/lib/escopo/chave'

// F61 — a chave é MONTADA por `chaveDeStorage` (`lib/escopo/chave.ts`) no USO, e sai
// idêntica byte a byte à literal de antes (`wap:ativos:recentes`) — nenhum rascunho ou
// preferência gravada se perde. Função, não constante: uma constante de módulo
// congelaria o valor, e o call-site tem de continuar igual quando a chave do escopo
// deixar de ser fixa (virada multiempresa). Trava: `lib/escopo/chaves-de-storage.test.ts`.
export function chaveAtivosRecentes(): string {
  return chaveDeStorage('ativos:recentes')
}

export const MAX_ATIVOS_RECENTES = 5

export type AtivoRecente = {
  id: string
  patrimonio: string
  /** Marca + modelo, ou a categoria quando o modelo não existe. */
  descricao: string
}

// Validação na LEITURA, e não só na escrita: o valor vem de um armazenamento que o
// próprio usuário edita pelo devtools, e cada item vira `href` de navegação. Um id
// que não seja uuid (ou uma descrição que não seja string) é descartado — a lista
// degrada para os itens sãos em vez de derrubar a paleta.
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function ehAtivoRecente(v: unknown): v is AtivoRecente {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    RE_UUID.test(o.id) &&
    typeof o.patrimonio === 'string' &&
    o.patrimonio.length > 0 &&
    typeof o.descricao === 'string'
  )
}

// Põe o ativo no TOPO e tira a repetição anterior — reabrir o mesmo ativo não pode
// gastar duas das cinco vagas. Função pura: é ela que os testes exercem.
export function inserirRecente(
  lista: readonly AtivoRecente[],
  novo: AtivoRecente,
): AtivoRecente[] {
  return [novo, ...lista.filter((a) => a.id !== novo.id)].slice(0, MAX_ATIVOS_RECENTES)
}

export function lerAtivosRecentes(): AtivoRecente[] {
  try {
    const bruto = sessionStorage.getItem(chaveAtivosRecentes())
    if (!bruto) return []
    const dados: unknown = JSON.parse(bruto)
    if (!Array.isArray(dados)) return []
    return dados.filter(ehAtivoRecente).slice(0, MAX_ATIVOS_RECENTES)
  } catch {
    // Modo privado, storage cheio ou JSON corrompido: a paleta simplesmente abre
    // sem o grupo "Recentes", como antes desta fase.
    return []
  }
}

export function lembrarAtivoRecente(ativo: AtivoRecente): void {
  if (!ehAtivoRecente(ativo)) return
  try {
    sessionStorage.setItem(
      chaveAtivosRecentes(),
      JSON.stringify(inserirRecente(lerAtivosRecentes(), ativo)),
    )
  } catch {
    // Sem memória de recentes — nada mais deixa de funcionar por causa disso.
  }
}
