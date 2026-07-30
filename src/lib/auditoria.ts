// Vocabulário da AUDITORIA de ações administrativas (F21) — tabela `eventos_admin`
// (migration 0065). Fonte ÚNICA das ações e dos rótulos.
//
// Módulo ISOMÓRFICO (sem `server-only`): o escritor é server-only
// (`src/lib/auditoria-registro.ts`), mas a aba "Auditoria" de /admin/usuarios é UI e
// precisa dos rótulos e do filtro. Mesmo desenho de `papeis.ts` e `dominios-email.ts`.
//
// `eventos_admin.acao` é TEXT no banco de propósito (ação nova não deve exigir migration).
// O preço disso é que o vocabulário fechado tem de morar em ALGUM lugar — é aqui, com
// teste. O comment da coluna no banco lista os mesmos verbos; mexeu aqui, mexa lá.

export const ACOES_ADMIN = [
  'convite_gerado',
  'convite_reenviado',
  'papel_alterado',
  'vinculos_alterados',
  'usuario_desativado',
  'usuario_reativado',
  // F22 — a gestão avançada, privativa do cargo Desenvolvedor.
  'email_alterado',
  'usuario_apagado',
  'sessoes_encerradas',
  'senha_criada',
  'senha_revogada',
  'senha_reativada',
  'import_executado',
] as const

export type AcaoAdmin = (typeof ACOES_ADMIN)[number]

// Frases no PASSADO e na voz de quem lê a trilha ("o que aconteceu"), não imperativo.
export const ACAO_ROTULO: Record<AcaoAdmin, string> = {
  convite_gerado: 'Convite gerado',
  convite_reenviado: 'Convite reenviado',
  papel_alterado: 'Cargo alterado',
  vinculos_alterados: 'Filiais de escrita alteradas',
  usuario_desativado: 'Usuário desativado',
  usuario_reativado: 'Usuário reativado',
  email_alterado: 'E-mail alterado',
  usuario_apagado: 'Usuário apagado',
  sessoes_encerradas: 'Sessões encerradas',
  senha_criada: 'Senha de acesso criada',
  senha_revogada: 'Senha de acesso revogada',
  senha_reativada: 'Senha de acesso reativada',
  import_executado: 'Import de startup executado',
}

export function eAcaoAdmin(valor: unknown): valor is AcaoAdmin {
  return typeof valor === 'string' && (ACOES_ADMIN as readonly string[]).includes(valor)
}

// Rótulo tolerante: se um evento antigo (ou gravado fora do vocabulário) chegar à tela, ela
// mostra o verbo cru em vez de vazio. A trilha é auditoria — perder a linha é pior que
// exibir uma chave feia.
export function rotuloAcao(acao: string): string {
  return eAcaoAdmin(acao) ? ACAO_ROTULO[acao] : acao
}
