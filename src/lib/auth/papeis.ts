// Vocabulário dos CARGOS (F21; 4º cargo `dev` na F22) — fonte ÚNICA de rótulos, hierarquia
// e regras puras.
//
// Módulo ISOMÓRFICO de propósito (sem `server-only`, sem `node:crypto`, sem Supabase):
// é importado por Server Actions, por Server Components, por componentes `'use client'`
// (badges, selects, diálogos) e pelas páginas de ajuda. Mesmo desenho de
// `dominios-email.ts` — a constante mora aqui e todo mundo deriva, ninguém redigita.
//
// ⚠ A TRAVA DE VERDADE ESTÁ NO BANCO, não aqui: enum `papel_usuario` + as funções
// `papel_atual()` / `e_admin()` / `e_dev()` / `pode_escrever()` / `pode_escrever_filial()`
// (migrations 0061/0062/0072), as policies da 0063/0066/0070/0072, a rede `profiles_guarda_dev`
// (0073) e as RPCs de gestão (0074). Este arquivo é vocabulário e ergonomia — mexeu aqui,
// confira lá. Ver docs/ADR-002-papeis-e-permissoes.md (§ "Cargo dev — 30/07/2026").

import type { Database } from '@/lib/types/database'

// Vem do enum do banco: se um papel novo entrar na migration, o TypeScript acusa aqui.
export type PapelUsuario = Database['public']['Enums']['papel_usuario']

// Ordem do MAIS forte para o mais fraco — a mesma dos labels do enum no Postgres (a 0071
// entrou com `add value 'dev' before 'admin'` justamente para manter essa correspondência).
//
// ⚠ ESTE ARRAY NÃO É CONFERIDO PELO COMPILADOR. Ele é `readonly PapelUsuario[]`, não um tipo
// exaustivo: esquecer um cargo aqui NÃO gera erro de tipo, e o efeito seria silencioso e
// grave — é `PAPEIS` que alimenta o <Select> de cargo de /admin/usuarios e o `ePapelValido`.
// Um cargo faltando existiria no banco e no Zod (que deriva de `Constants`, gerado) e seria
// INVISÍVEL no formulário. Quem tem cobertura de compilador são os três `Record` abaixo —
// use-os como checklist ao acrescentar um cargo, e acrescente aqui também.
export const PAPEIS: readonly PapelUsuario[] = ['dev', 'admin', 'operador', 'consulta'] as const

// Hierarquia como NÚMERO, e não pela ordem do enum, de propósito. No Postgres `dev` é o
// PRIMEIRO label e portanto o MENOR na comparação de enum (`papel <= 'operador'` = "operador
// ou mais forte"), o que inverte o sinal e é fonte clássica de bug. Aqui força maior = mais
// poder, que é o que se lê naturalmente.
const FORCA: Record<PapelUsuario, number> = {
  dev: 4,
  admin: 3,
  operador: 2,
  consulta: 1,
}

// Rótulos de UI. "Consulta" (e não "Visualizador") para não colidir com o VISUALIZADOR por
// senha dos relatórios, que é outra porta de acesso e continua existindo (spec §3).
export const PAPEL_ROTULO: Record<PapelUsuario, string> = {
  dev: 'Desenvolvedor',
  admin: 'Administrador',
  operador: 'Operador',
  consulta: 'Consulta',
}

// ⚠ Este texto é DOCUMENTAÇÃO: `verbetesCargo()` (src/lib/ajuda/derivacao.ts) o injeta nos
// glossários das páginas de ajuda, e ele passa pelos guardas de linguagem da F20 — nada de
// jargão de desenvolvedor, nada de promessa de futuro. Escreva na língua do operador.
export const PAPEL_DESCRICAO: Record<PapelUsuario, string> = {
  dev: 'Faz tudo o que o Administrador faz e mais: troca o e-mail de uma conta, apaga uma conta de vez, encerra as sessões abertas de alguém e é o único que concede este cargo. Ninguém com outro cargo altera, desativa ou apaga quem é Desenvolvedor.',
  admin: 'Faz tudo: administração (usuários, senhas, filiais, motivos, itens, kits), import de startup e escrita em todas as filiais.',
  operador: 'Registra movimentações, compras, itens, termos e pendências — apenas nas filiais vinculadas a ele.',
  consulta: 'Somente leitura: navega e consulta o sistema inteiro, mas não registra nada.',
}

// `dev ⊃ admin ⊃ operador ⊃ consulta`: true quando `papel` é o mínimo exigido OU mais forte.
// `null` (sem sessão, sem perfil, perfil desativado ou APAGADO) nunca atende a nada.
export function papelAtende(papel: PapelUsuario | null | undefined, minimo: PapelUsuario): boolean {
  if (!papel) return false
  return FORCA[papel] >= FORCA[minimo]
}

export function ePapelValido(valor: unknown): valor is PapelUsuario {
  return typeof valor === 'string' && (PAPEIS as readonly string[]).includes(valor)
}

// Quem escreve ALGO no acervo (nas filiais que lhe couberem). Espelha `pode_escrever()`
// do banco (migration 0072), que as policies de anotação, snapshot de relatório e do
// bucket `termos` passaram a chamar no lugar da lista literal `in ('admin','operador')`.
export function podeEscrever(papel: PapelUsuario | null | undefined): boolean {
  return papelAtende(papel, 'operador')
}

// NÍVEL ADMINISTRADOR — admin OU dev. Espelha `e_admin()` do banco, que a 0072 redefiniu
// para `papel_atual() in ('admin','dev')`.
//
// ⚠ ERA `papel === 'admin'`. A comparação por igualdade é o que o cargo novo quebra em
// SILÊNCIO: o banco passaria a aceitar o dev em /admin e nas ~20 policies que chamam
// `e_admin()`, e este arquivo o recusaria antes — a action falharia com "restrita a
// administradores" sem nunca tocar o Postgres. Toda decisão de "nível admin" no app passa
// por aqui (admin/layout.tsx, sidebar, paleta de comandos, permissoes.ts).
export function eAdmin(papel: PapelUsuario | null | undefined): boolean {
  return papelAtende(papel, 'admin')
}

// EXATAMENTE o cargo dev. Espelha `e_dev()` (0072). É o predicado do que só o dev faz:
// conceder/revogar o cargo dev, agir sobre uma conta dev, trocar e-mail, apagar conta,
// encerrar sessões e alcançar /dev. Aqui a igualdade É a intenção — não use `papelAtende`.
export function eDev(papel: PapelUsuario | null | undefined): boolean {
  return papel === 'dev'
}

// Só o OPERADOR precisa de vínculo: dev e admin escrevem em todas as filiais sem linha em
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
  // Dev, admin e consulta não usam vínculo. Mandar filiais aqui é sinal de formulário
  // inconsistente (a UI esconde o campo) — recusa em vez de gravar lixo silenciosamente.
  // O motivo da frase depende do LADO da hierarquia, e não do cargo literal: por isso
  // `eAdmin` (nível), que já cobre o dev — com `papel === 'admin'` o dev receberia
  // "ele não escreve em nenhuma", o oposto da verdade.
  if (filiaisIds.length > 0) {
    return `O cargo ${PAPEL_ROTULO[papel]} não usa filiais de escrita: ${
      eAdmin(papel) ? 'ele escreve em todas' : 'ele não escreve em nenhuma'
    }.`
  }
  return null
}

// As filiais que o papel efetivamente pode escrever, dada a lista de vínculos e o universo
// de filiais ativas. Espelha `pode_escrever_filial()` do banco (0062, redefinida na 0072) e
// é o que alimenta os selects de filial das telas de ESCRITA.
//
// ⚠ O ramo de cima usa `eAdmin` (NÍVEL), e não `papel === 'admin'`: com a igualdade, um dev
// receberia `[]` aqui e o efeito seria devastador e mudo — `Operador.filiaisEscrita` viria
// vazio em `getOperador()`, apagando todo select de filial e todo CTA de ficha, enquanto o
// banco lhe dá permissão em tudo.
export function filiaisDeEscrita(
  papel: PapelUsuario | null | undefined,
  vinculos: readonly number[],
  filiaisAtivas: readonly number[],
): number[] {
  if (!papel) return []
  if (eAdmin(papel)) return [...filiaisAtivas]
  if (papel === 'operador') return filiaisAtivas.filter((id) => vinculos.includes(id))
  return []
}

// ---------------------------------------------------------------------------
// F25 — o PADRÃO do filtro de filial das listas (LEITURA, não escrita)
// ---------------------------------------------------------------------------
// ⚠ FILTRO DE LEITURA ≠ SELECT DE ESCRITA. `filiaisDeEscrita` acima decide o que a
// pessoa PODE GRAVAR e é regra de permissão espelhada no Postgres. O que vem abaixo
// é só a marcação INICIAL de um filtro de lista: conveniência de tela, zero
// permissão. Todo cargo continua LENDO tudo (ADR-001/ADR-002), e um link explícito
// com `?filial=…` abre igual para qualquer um.
//
// Por que o operador entra recortado: ele opera 1..n filiais e via de regra só quer
// ver as dele. Decisão do Johnny (04/08/2026): entra com TODAS as vinculadas
// marcadas — não só a primeira —, então o operador de Serra+Linhares vê as duas
// juntas de saída.

/**
 * As filiais que o filtro já vem marcando quando a URL NÃO traz `filial`.
 *
 * `[]` significa SEM RECORTE (todas) — é o que dev, admin e consulta recebem, e é
 * também o que a query interpreta como "não aplique `.in`".
 *
 * ⚠ A decisão olha o CARGO, nunca `filiaisEscrita.length === 0`. Lista vazia tem
 * dois significados diferentes: `consulta` (que não escreve em lugar nenhum, e para
 * quem "todas" é o certo) e `operador` sem vínculo válido — um usuário quebrado,
 * que com o atalho errado veria uma lista SEMPRE VAZIA e nenhuma pista do porquê.
 * Os dois caem em "todas", mas por caminhos distintos e explícitos.
 */
export function filtroFilialPadrao(
  papel: PapelUsuario | null | undefined,
  filiaisEscrita: readonly number[],
  filiaisAtivas: readonly number[],
): number[] {
  if (papel !== 'operador') return []
  const vinculadas = filiaisAtivas.filter((id) => filiaisEscrita.includes(id))
  // Operador sem vínculo ATIVO: cai em "todas" de propósito (ver o ⚠ acima).
  return vinculadas.length > 0 ? vinculadas : []
}

/**
 * A aba em que `/relatorios` abre quando ninguém pediu nada.
 *
 * Derivada da regra de cima: operador → a PRIMEIRA filial vinculada em ordem
 * alfabética de nome; qualquer outro cargo → `'geral'` (o Consolidado).
 *
 * O relatório ao vivo é de UMA filial por vez (as abas são exclusivas), então aqui
 * não há multi: com Serra+Linhares o operador cai em Linhares.
 *
 * ⚠ `filiais` tem de vir ORDENADA POR NOME — é o que `listarFiliais()` já entrega
 * (`.order('nome')`). Ordenar aqui exigiria copiar o array; pior, ordenar
 * `filiaisEscrita` no lugar seria escrever num array COMPARTILHADO por referência
 * entre o layout e a página do mesmo render (ver o `readonly` de `Operador`).
 */
export const ABA_RELATORIO_CONSOLIDADO = 'geral'

export function abaRelatorioPadrao(
  papel: PapelUsuario | null | undefined,
  filiaisEscrita: readonly number[],
  filiaisOrdenadasPorNome: readonly { id: number; slug: string }[],
): string {
  const padrao = filtroFilialPadrao(papel, filiaisEscrita, filiaisOrdenadasPorNome.map((f) => f.id))
  if (padrao.length === 0) return ABA_RELATORIO_CONSOLIDADO
  const primeira = filiaisOrdenadasPorNome.find((f) => padrao.includes(f.id))
  return primeira?.slug ?? ABA_RELATORIO_CONSOLIDADO
}
