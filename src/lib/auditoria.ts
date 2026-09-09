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
  // F54 — o import que a RPC RECUSOU. Antes desta fase um import recusado não deixava
  // rastro NENHUM na aba Auditoria (só uma linha no log do servidor, que ninguém lê), e o
  // backup que subira antes da RPC ficava no bucket sem cobrir exclusão nenhuma. Este
  // verbo registra as duas coisas: que houve tentativa, e que o backup foi descartado.
  'import_falhou',
  // F23 — as ferramentas DESTRUTIVAS da /dev, todas privativas do cargo Desenvolvedor.
  // ⚠ Estes sete são gravados DENTRO das próprias RPCs (migrations 0082/0083/0084), na mesma
  // transação da operação — e não por `registrarEventoAdmin`. O motivo está no cabeçalho da
  // 0082: o escritor daqui NÃO propaga erro de propósito, o que é certo para "convite gerado"
  // e errado para uma exclusão irreversível, onde a trilha é o único registro de que o dado
  // existiu. Gravando no banco, ou a trilha entra ou nada é apagado.
  'ativo_apagado',
  'movimentacao_apagada',
  'item_apagado',
  'acervo_resetado',
  'itens_resetados',
  'estado_forcado',
  'saldo_forcado',
  // F24 — a ÚNICA exclusão de ativo fora da Zona destrutiva, e a única destas que o nível
  // administrador (admin OU dev) alcança. Também é gravada DENTRO da RPC
  // (`apagar_ativos_conflito_filiais`, migrations 0093/0098/0100), na mesma transação.
  'conflito_filiais_resolvido',
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
  import_falhou: 'Import de startup recusado',
  ativo_apagado: 'Ativo apagado',
  movimentacao_apagada: 'Movimentação apagada',
  item_apagado: 'Item apagado',
  acervo_resetado: 'Acervo resetado',
  itens_resetados: 'Lançamentos de itens resetados',
  estado_forcado: 'Estado do ativo forçado',
  saldo_forcado: 'Saldo de item forçado',
  conflito_filiais_resolvido: 'Conflito entre filiais resolvido',
}

// As que APAGAM ou FORÇAM de forma irreversível: as sete da Zona destrutiva (F23) mais a
// exclusão de conflito entre filiais (F24), que é a única delas fora da /dev.
//
// ⚠ Régua compartilhada e travada por teste — NÃO consumida por nenhuma tela hoje. O
// comentário anterior afirmava que a trilha destacava estas linhas e que o filtro oferecia
// "só as destrutivas": nenhuma das duas coisas existe no código. Ficou registrado como
// pendência em vez de descrito como pronto — comentário que promete UI inexistente faz o
// leitor concluir que a trilha já separa exclusão irreversível de "convite reenviado".
export const ACOES_DESTRUTIVAS: readonly AcaoAdmin[] = [
  'ativo_apagado',
  'movimentacao_apagada',
  'item_apagado',
  'acervo_resetado',
  'itens_resetados',
  'estado_forcado',
  'saldo_forcado',
  'conflito_filiais_resolvido',
] as const

export function eAcaoDestrutiva(acao: string): boolean {
  return (ACOES_DESTRUTIVAS as readonly string[]).includes(acao)
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

// ---------------------------------------------------------------------------
// Os RECORTES da trilha (F22) — uma régua só, para a tela e para o CSV
// ---------------------------------------------------------------------------
// Estava escrita DUAS vezes: em `queries/eventos-admin.ts` (a tela) e em
// `app/(app)/dev/acoes-export.ts` (o export). A cópia do export tinha a regex de data com
// os escapes perdidos (`/^d{4}-d{2}-d{2}$/`, que só casa o literal "dddd-dd-dd"), então os
// filtros `de`/`ate` eram descartados em silêncio e o arquivo baixava um conjunto de linhas
// diferente do que a tela mostrava — a "segunda verdade" que os dois arquivos dizem impedir.
// Mora aqui, no módulo ISOMÓRFICO e puro do vocabulário, porque é aqui que `eAcaoAdmin` já
// vive e porque assim dá para travar por teste sem carregar o client do Supabase.
//
// Valor irreconhecível é IGNORADO (vira null), nunca convertido em lista vazia sem
// explicação — a mesma regra que o vocabulário de `acao` já seguia.

/** `yyyy-MM-dd`. Só o FORMATO: a existência do dia quem confere é o Postgres. */
const ISO_DATA = /^\d{4}-\d{2}-\d{2}$/

/** Teto do texto livre (`autor`, `alvo`): o suficiente para um e-mail ou um rótulo. */
const MAX_TEXTO_FILTRO = 120

export type FiltrosAuditoria = {
  /** Verbo do vocabulário fechado acima. */
  acao: string | null
  /** id do perfil AUTOR (`eventos_admin.autor`). */
  autor: string | null
  /** Período por DIA, inclusivo nas duas pontas. */
  de: string | null
  ate: string | null
  /** Busca parcial, sem caixa, na coluna `alvo`. */
  alvo: string | null
}

export function sanearFiltrosAuditoria(entrada: {
  acao?: string | null
  autor?: string | null
  de?: string | null
  ate?: string | null
  alvo?: string | null
}): FiltrosAuditoria {
  const texto = (v: string | null | undefined) => {
    const t = (v ?? '').trim()
    return t.length > 0 && t.length <= MAX_TEXTO_FILTRO ? t : null
  }
  const data = (v: string | null | undefined) => (v && ISO_DATA.test(v) ? v : null)
  return {
    acao: entrada.acao && eAcaoAdmin(entrada.acao) ? entrada.acao : null,
    autor: texto(entrada.autor),
    de: data(entrada.de),
    ate: data(entrada.ate),
    alvo: texto(entrada.alvo),
  }
}
